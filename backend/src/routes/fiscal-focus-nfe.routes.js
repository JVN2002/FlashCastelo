const express = require('express');
const pool = require('../db/pool');
const {
  sanitizeReference,
  normalizeAmbiente,
  getFocusRuntimeConfig,
  getPublicFocusConfig,
  requestFocus,
  validateNfePayload,
  validateNfsePayload,
  validateCancelReason,
  inferNotaNumero,
  inferNotaStatus,
  findXmlPathFromFocus,
  toAbsoluteFocusUrl,
  createHttpError
} = require('../services/focus-nfe.service');

const router = express.Router();

const XML_TYPES = new Set(['envio', 'retorno', 'resposta']);

function parseMonetaryValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readNumeroNfFromRow(row) {
  return row.numeroNf ?? row.numeronf ?? null;
}

function readCancelReasonFromRow(row) {
  return row.cancelReason ?? row.cancelreason ?? null;
}

function readPayloadJsonFromRow(row) {
  return row.payloadJson ?? row.payloadjson ?? {};
}

function readFocusJsonFromRow(row) {
  return row.focusJson ?? row.focusjson ?? {};
}

function readTipoDocumentoFromRow(row) {
  return row.tipoDocumento ?? row.tipodocumento;
}

function readCreatedEmFromRow(row) {
  return row.createdEm ?? row.createdem;
}

function readUpdatedEmFromRow(row) {
  return row.updatedEm ?? row.updatedem;
}

function mapNotaRow(row) {
  return {
    reference: row.reference,
    numeroNf: readNumeroNfFromRow(row),
    cliente: row.cliente || null,
    pedido: row.pedido || null,
    valor: Number(row.valor || 0),
    status: row.status,
    cancelReason: readCancelReasonFromRow(row),
    payloadJson: readPayloadJsonFromRow(row),
    focusJson: readFocusJsonFromRow(row),
    tipoDocumento: readTipoDocumentoFromRow(row),
    ambiente: row.ambiente,
    createdEm: readCreatedEmFromRow(row),
    updatedEm: readUpdatedEmFromRow(row)
  };
}

async function fetchFiscalNota(reference) {
  const result = await pool.query(
    `
      SELECT
        reference,
        "numeroNf",
        cliente,
        pedido,
        valor,
        status,
        "cancelReason",
        "payloadJson",
        "focusJson",
        "tipoDocumento",
        ambiente,
        "createdEm",
        "updatedEm"
      FROM fiscal_notas
      WHERE reference = $1
      LIMIT 1
    `,
    [reference]
  );

  if (!result.rows.length) return null;
  return mapNotaRow(result.rows[0]);
}

async function upsertFiscalNota({
  reference,
  numeroNf,
  cliente,
  pedido,
  valor,
  status,
  cancelReason,
  payloadJson,
  focusJson,
  tipoDocumento,
  ambiente
}) {
  const result = await pool.query(
    `
      INSERT INTO fiscal_notas
        (
          reference,
          "numeroNf",
          cliente,
          pedido,
          valor,
          status,
          "cancelReason",
          "payloadJson",
          "focusJson",
          "tipoDocumento",
          ambiente,
          "createdEm",
          "updatedEm"
        )
      VALUES
        ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, NOW(), NOW())
      ON CONFLICT (reference)
      DO UPDATE SET
        "numeroNf" = COALESCE(EXCLUDED."numeroNf", fiscal_notas."numeroNf"),
        cliente = COALESCE(EXCLUDED.cliente, fiscal_notas.cliente),
        pedido = COALESCE(EXCLUDED.pedido, fiscal_notas.pedido),
        valor = EXCLUDED.valor,
        status = EXCLUDED.status,
        "cancelReason" = COALESCE(EXCLUDED."cancelReason", fiscal_notas."cancelReason"),
        "payloadJson" = EXCLUDED."payloadJson",
        "focusJson" = EXCLUDED."focusJson",
        "tipoDocumento" = EXCLUDED."tipoDocumento",
        ambiente = EXCLUDED.ambiente,
        "updatedEm" = NOW()
      RETURNING
        reference,
        "numeroNf",
        cliente,
        pedido,
        valor,
        status,
        "cancelReason",
        "payloadJson",
        "focusJson",
        "tipoDocumento",
        ambiente,
        "createdEm",
        "updatedEm"
    `,
    [
      reference,
      numeroNf || null,
      cliente ? JSON.stringify(cliente) : null,
      pedido ? JSON.stringify(pedido) : null,
      parseMonetaryValue(valor),
      String(status || 'processando'),
      cancelReason || null,
      JSON.stringify(payloadJson || {}),
      JSON.stringify(focusJson || {}),
      tipoDocumento,
      ambiente
    ]
  );

  return mapNotaRow(result.rows[0]);
}

function buildNotaFromRequestAndFocus({
  reference,
  tipoDocumento,
  ambiente,
  body,
  focusData,
  existing
}) {
  const payload = body?.payload || existing?.payloadJson || {};
  const cliente = body?.cliente ?? existing?.cliente ?? null;
  const pedido = body?.pedido ?? existing?.pedido ?? null;
  const valorFromPayload = body?.valor ?? payload?.valor_total ?? payload?.valor_servicos ?? payload?.valor;

  return {
    reference,
    tipoDocumento,
    ambiente,
    numeroNf: inferNotaNumero(focusData) || inferNotaNumero(existing?.focusJson) || inferNotaNumero(payload),
    cliente,
    pedido,
    valor: parseMonetaryValue(valorFromPayload),
    status: inferNotaStatus(focusData) || existing?.status || 'processando',
    cancelReason: existing?.cancelReason || null,
    payloadJson: payload,
    focusJson: focusData || existing?.focusJson || {}
  };
}

function readAmbienteFromReq(req, fallback = null) {
  return normalizeAmbiente(req.body?.ambiente || req.query?.ambiente || fallback || undefined);
}

function endpointForTipoDocumento(tipoDocumento, reference) {
  if (tipoDocumento === 'nfe') {
    return `/v2/nfe/${encodeURIComponent(reference)}`;
  }
  return `/v2/nfse/${encodeURIComponent(reference)}`;
}

router.get('/config', async (req, res, next) => {
  try {
    const ambiente = readAmbienteFromReq(req, null);
    const configAtual = getPublicFocusConfig(ambiente);
    return res.json({
      data: {
        ambientesDisponiveis: ['homologacao', 'producao'],
        ambienteAtual: configAtual.ambiente,
        timeoutMs: configAtual.timeoutMs,
        requiredEmitenteCnpj: configAtual.requiredEmitenteCnpj,
        homologacao: getPublicFocusConfig('homologacao'),
        producao: getPublicFocusConfig('producao')
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/nfe/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const ambiente = readAmbienteFromReq(req);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);
    const payload = req.body?.payload;

    validateNfePayload(payload, runtimeConfig.requiredEmitenteCnpj);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'POST',
      endpointPath: '/v2/nfe',
      query: { ref: reference },
      body: payload
    });

    const existing = await fetchFiscalNota(reference);
    const notaToPersist = buildNotaFromRequestAndFocus({
      reference,
      tipoDocumento: 'nfe',
      ambiente,
      body: req.body,
      focusData,
      existing
    });

    const nota = await upsertFiscalNota(notaToPersist);
    return res.status(201).json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.get('/nfe/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const existing = await fetchFiscalNota(reference);
    const ambiente = readAmbienteFromReq(req, existing?.ambiente || null);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'GET',
      endpointPath: endpointForTipoDocumento('nfe', reference),
      query: { completa: req.query?.completa === '0' ? 0 : 1 }
    });

    const notaToPersist = buildNotaFromRequestAndFocus({
      reference,
      tipoDocumento: 'nfe',
      ambiente,
      body: {
        payload: existing?.payloadJson,
        cliente: existing?.cliente,
        pedido: existing?.pedido,
        valor: existing?.valor
      },
      focusData,
      existing
    });

    const nota = await upsertFiscalNota(notaToPersist);
    return res.json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.delete('/nfe/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const justificativa = validateCancelReason(req.body?.justificativa);
    const existing = await fetchFiscalNota(reference);
    const ambiente = readAmbienteFromReq(req, existing?.ambiente || null);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'DELETE',
      endpointPath: endpointForTipoDocumento('nfe', reference),
      body: { justificativa }
    });

    const nota = await upsertFiscalNota({
      reference,
      numeroNf: inferNotaNumero(focusData) || existing?.numeroNf || null,
      cliente: existing?.cliente || null,
      pedido: existing?.pedido || null,
      valor: existing?.valor || 0,
      status: inferNotaStatus(focusData) || 'cancelada',
      cancelReason: justificativa,
      payloadJson: existing?.payloadJson || {},
      focusJson: focusData,
      tipoDocumento: 'nfe',
      ambiente
    });

    return res.json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.post('/nfse/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const ambiente = readAmbienteFromReq(req);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);
    const payload = req.body?.payload;

    validateNfsePayload(payload);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'POST',
      endpointPath: '/v2/nfse',
      query: { ref: reference },
      body: payload
    });

    const existing = await fetchFiscalNota(reference);
    const notaToPersist = buildNotaFromRequestAndFocus({
      reference,
      tipoDocumento: 'nfse',
      ambiente,
      body: req.body,
      focusData,
      existing
    });

    const nota = await upsertFiscalNota(notaToPersist);
    return res.status(201).json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.get('/nfse/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const existing = await fetchFiscalNota(reference);
    const ambiente = readAmbienteFromReq(req, existing?.ambiente || null);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'GET',
      endpointPath: endpointForTipoDocumento('nfse', reference),
      query: { completa: req.query?.completa === '0' ? 0 : 1 }
    });

    const notaToPersist = buildNotaFromRequestAndFocus({
      reference,
      tipoDocumento: 'nfse',
      ambiente,
      body: {
        payload: existing?.payloadJson,
        cliente: existing?.cliente,
        pedido: existing?.pedido,
        valor: existing?.valor
      },
      focusData,
      existing
    });

    const nota = await upsertFiscalNota(notaToPersist);
    return res.json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.delete('/nfse/:reference', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const justificativa = validateCancelReason(req.body?.justificativa);
    const existing = await fetchFiscalNota(reference);
    const ambiente = readAmbienteFromReq(req, existing?.ambiente || null);
    const runtimeConfig = getFocusRuntimeConfig(ambiente);

    const focusData = await requestFocus({
      config: runtimeConfig,
      method: 'DELETE',
      endpointPath: endpointForTipoDocumento('nfse', reference),
      body: { justificativa }
    });

    const nota = await upsertFiscalNota({
      reference,
      numeroNf: inferNotaNumero(focusData) || existing?.numeroNf || null,
      cliente: existing?.cliente || null,
      pedido: existing?.pedido || null,
      valor: existing?.valor || 0,
      status: inferNotaStatus(focusData) || 'cancelada',
      cancelReason: justificativa,
      payloadJson: existing?.payloadJson || {},
      focusJson: focusData,
      tipoDocumento: 'nfse',
      ambiente
    });

    return res.json({ data: nota });
  } catch (error) {
    return next(error);
  }
});

router.get('/notas', async (req, res, next) => {
  try {
    const tipoDocumento = req.query?.tipo && ['nfe', 'nfse'].includes(req.query.tipo)
      ? req.query.tipo
      : null;
    const status = req.query?.status ? String(req.query.status).trim() : null;
    const limitRaw = Number(req.query?.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 300) : 100;

    const result = await pool.query(
      `
        SELECT
          reference,
          "numeroNf",
          cliente,
          pedido,
          valor,
          status,
          "cancelReason",
          "payloadJson",
          "focusJson",
          "tipoDocumento",
          ambiente,
          "createdEm",
          "updatedEm"
        FROM fiscal_notas
        WHERE ($1::varchar IS NULL OR "tipoDocumento" = $1)
          AND ($2::varchar IS NULL OR status ILIKE $2)
        ORDER BY "createdEm" DESC
        LIMIT $3
      `,
      [tipoDocumento, status ? `%${status}%` : null, limit]
    );

    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status ILIKE '%autoriz%' OR status ILIKE '%aprov%')::int AS autorizadas,
          COUNT(*) FILTER (WHERE status ILIKE '%cancel%')::int AS canceladas,
          COUNT(*) FILTER (WHERE status ILIKE '%process%')::int AS processando
        FROM fiscal_notas
        WHERE ($1::varchar IS NULL OR "tipoDocumento" = $1)
          AND ($2::varchar IS NULL OR status ILIKE $2)
      `,
      [tipoDocumento, status ? `%${status}%` : null]
    );

    return res.json({
      data: result.rows.map(mapNotaRow),
      summary: {
        total: Number(summaryResult.rows[0]?.total || 0),
        autorizadas: Number(summaryResult.rows[0]?.autorizadas || 0),
        canceladas: Number(summaryResult.rows[0]?.canceladas || 0),
        processando: Number(summaryResult.rows[0]?.processando || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/notas/:reference/xml/:xmlType', async (req, res, next) => {
  try {
    const reference = sanitizeReference(req.params.reference);
    const xmlType = String(req.params.xmlType || '').toLowerCase();
    if (!XML_TYPES.has(xmlType)) {
      throw createHttpError(400, 'Tipo de XML inválido. Use envio, retorno ou resposta.');
    }

    const nota = await fetchFiscalNota(reference);
    if (!nota) {
      throw createHttpError(404, 'Nota fiscal não encontrada para a referência informada.');
    }

    const runtimeConfig = getFocusRuntimeConfig(nota.ambiente);

    let focusPayload = nota.focusJson || {};
    let xmlPath = findXmlPathFromFocus(focusPayload, xmlType);

    if (!xmlPath) {
      const refreshedFocus = await requestFocus({
        config: runtimeConfig,
        method: 'GET',
        endpointPath: endpointForTipoDocumento(nota.tipoDocumento, reference),
        query: { completa: 1 }
      });

      focusPayload = refreshedFocus || {};
      xmlPath = findXmlPathFromFocus(focusPayload, xmlType);

      await upsertFiscalNota({
        reference: nota.reference,
        numeroNf: inferNotaNumero(refreshedFocus) || nota.numeroNf,
        cliente: nota.cliente,
        pedido: nota.pedido,
        valor: nota.valor,
        status: inferNotaStatus(refreshedFocus) || nota.status,
        cancelReason: nota.cancelReason,
        payloadJson: nota.payloadJson,
        focusJson: focusPayload,
        tipoDocumento: nota.tipoDocumento,
        ambiente: nota.ambiente
      });
    }

    if (!xmlPath) {
      throw createHttpError(
        404,
        `XML ${xmlType} não encontrado para esta referência. Consulte novamente a nota após o processamento completo na Focus.`
      );
    }

    const xmlUrl = toAbsoluteFocusUrl(runtimeConfig.baseUrl, xmlPath);
    if (!xmlUrl) {
      throw createHttpError(404, 'Caminho de XML inválido retornado pela Focus.');
    }

    const xml = await requestFocus({
      config: runtimeConfig,
      method: 'GET',
      endpointPath: xmlUrl,
      expect: 'xml'
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reference}-${xmlType}.xml"`
    );
    return res.status(200).send(xml);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
