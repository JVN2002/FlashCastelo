const env = require('../config/env');

const ALLOWED_AMBIENTES = new Set(['homologacao', 'producao']);
const REFERENCE_REGEX = /^[A-Za-z0-9_-]+$/;
const SAO_BERNARDO_IBGE = '3548708';
const SAO_BERNARDO_CTM_REGEX = /^\d{1,2}\.\d{2}\/\d+(?:\/\d+)?$/;

function createHttpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function sanitizeReference(referenceRaw) {
  const reference = String(referenceRaw || '').trim();
  if (!reference) {
    throw createHttpError(400, 'A referência é obrigatória.');
  }
  if (!REFERENCE_REGEX.test(reference)) {
    throw createHttpError(
      400,
      'Referência inválida. Use apenas letras, números, underscore (_) e hífen (-).'
    );
  }
  if (reference.length > 120) {
    throw createHttpError(400, 'Referência inválida. Limite máximo de 120 caracteres.');
  }
  return reference;
}

function normalizeAmbiente(rawAmbiente) {
  const ambiente = String(rawAmbiente || env.focusNfeAmbiente || 'homologacao')
    .trim()
    .toLowerCase();

  if (!ALLOWED_AMBIENTES.has(ambiente)) {
    throw createHttpError(400, 'Ambiente inválido. Use homologacao ou producao.');
  }

  return ambiente;
}

function getFocusRuntimeConfig(ambienteRaw) {
  const ambiente = normalizeAmbiente(ambienteRaw);
  const isHomologacao = ambiente === 'homologacao';

  const apiKey = isHomologacao
    ? env.focusNfeApiKeyHomologacao
    : env.focusNfeApiKeyProducao;
  const baseUrl = isHomologacao
    ? env.focusNfeBaseUrlHomologacao
    : env.focusNfeBaseUrlProducao;

  return {
    ambiente,
    apiKey: String(apiKey || '').trim(),
    baseUrl: String(baseUrl || '').trim(),
    timeoutMs: Number(env.focusNfeTimeoutMs || 30000),
    requiredEmitenteCnpj: onlyDigits(env.focusNfeRequiredEmitenteCnpj || '')
  };
}

function getPublicFocusConfig(ambienteRaw) {
  const config = getFocusRuntimeConfig(ambienteRaw);
  return {
    ambiente: config.ambiente,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    hasApiKey: Boolean(config.apiKey),
    requiredEmitenteCnpj: config.requiredEmitenteCnpj || null
  };
}

function assertFocusConfigured(config) {
  if (!config.apiKey) {
    throw createHttpError(
      503,
      `Focus NFe não configurada para ${config.ambiente}. Defina a API key no ambiente.`
    );
  }
  if (!config.baseUrl) {
    throw createHttpError(
      503,
      `Focus NFe não configurada para ${config.ambiente}. Defina a base URL no ambiente.`
    );
  }
}

function basicAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

function readErrorMessage(payload, fallback = 'Erro na integração Focus NFe.') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;

  const candidates = [
    payload.message,
    payload.mensagem,
    payload.error,
    payload.erro,
    payload.detalhes,
    payload.details
  ];

  const first = candidates.find((value) => typeof value === 'string' && value.trim());
  return first || fallback;
}

function isFocusE45Error(payloadOrMessage) {
  const content =
    typeof payloadOrMessage === 'string'
      ? payloadOrMessage
      : JSON.stringify(payloadOrMessage || {});
  return content.toLowerCase().includes('e45');
}

function adaptFocusError(error) {
  const status = Number(error?.status || 502);
  const message = readErrorMessage(error?.focusPayload || error?.message, 'Erro na Focus NFe.');

  if (isFocusE45Error(error?.focusPayload || message)) {
    return createHttpError(
      422,
      'Erro E45 da prefeitura/Focus. Valide o CNPJ e a inscrição municipal do prestador antes de reenviar.',
      error?.focusPayload || null
    );
  }

  return createHttpError(status >= 400 && status <= 599 ? status : 502, message, error?.focusPayload || null);
}

function createAbortController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

async function requestFocus({
  config,
  method,
  endpointPath,
  query = {},
  body = null,
  expect = 'json',
  extraHeaders = {}
}) {
  assertFocusConfigured(config);

  const url = new URL(endpointPath, config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const headers = {
    Authorization: basicAuthHeader(config.apiKey),
    Accept: expect === 'xml' ? 'application/xml,text/xml;q=0.9,*/*;q=0.8' : 'application/json',
    ...extraHeaders
  };

  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 30000;
  const timeout = createAbortController(Math.max(1000, timeoutMs));

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeout.controller.signal
    });

    if (expect === 'xml') {
      const xmlText = await response.text();
      if (!response.ok) {
        const focusError = createHttpError(response.status, `Erro HTTP ${response.status} ao baixar XML da Focus.`);
        focusError.focusPayload = xmlText;
        throw focusError;
      }
      return xmlText;
    }

    const responseText = await response.text();
    let payload;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch (_error) {
      payload = { raw: responseText };
    }

    if (!response.ok) {
      const focusError = createHttpError(
        response.status,
        readErrorMessage(payload, `Erro HTTP ${response.status} na Focus NFe.`)
      );
      focusError.focusPayload = payload;
      throw focusError;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHttpError(504, 'Timeout na comunicação com a Focus NFe.');
    }
    if (error.status) {
      throw adaptFocusError(error);
    }
    throw createHttpError(502, 'Falha de conexão com a Focus NFe.');
  } finally {
    timeout.clear();
  }
}

function validateNfePayload(payload, requiredEmitenteCnpjRaw) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createHttpError(422, 'Payload da NF-e inválido.');
  }

  const emitente = onlyDigits(
    payload.cnpj_emitente ||
      payload.emitente?.cnpj ||
      payload.emitente?.cnpj_cpf
  );
  if (emitente.length !== 14) {
    throw createHttpError(422, 'NF-e inválida: cnpj_emitente deve ter 14 dígitos.');
  }

  const requiredEmitenteCnpj = onlyDigits(requiredEmitenteCnpjRaw || '');
  if (requiredEmitenteCnpj && emitente !== requiredEmitenteCnpj) {
    throw createHttpError(
      422,
      'NF-e inválida: CNPJ do emitente não corresponde ao CNPJ permitido para este ambiente.'
    );
  }

  return { cnpjEmitente: emitente };
}

function validateNfsePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createHttpError(422, 'Payload da NFS-e inválido.');
  }

  const prestador = payload.prestador || {};
  const tomador = payload.tomador || {};
  const servico = payload.servico || {};

  const prestadorCnpj = onlyDigits(prestador.cnpj);
  const inscricaoMunicipal = String(prestador.inscricao_municipal || '').trim();
  const codigoMunicipio = String(prestador.codigo_municipio || '').trim();
  const tomadorRazaoSocial = String(tomador.razao_social || '').trim();
  const itemListaServico = String(servico.item_lista_servico || '').trim();

  if (prestadorCnpj.length !== 14) {
    throw createHttpError(422, 'NFS-e inválida: prestador.cnpj deve ter 14 dígitos.');
  }
  if (!inscricaoMunicipal) {
    throw createHttpError(422, 'NFS-e inválida: prestador.inscricao_municipal é obrigatório.');
  }
  if (!codigoMunicipio) {
    throw createHttpError(422, 'NFS-e inválida: prestador.codigo_municipio é obrigatório.');
  }
  if (!tomadorRazaoSocial) {
    throw createHttpError(422, 'NFS-e inválida: tomador.razao_social é obrigatório.');
  }
  if (!itemListaServico) {
    throw createHttpError(422, 'NFS-e inválida: servico.item_lista_servico é obrigatório.');
  }

  if (codigoMunicipio === SAO_BERNARDO_IBGE) {
    const codigoTributarioMunicipio = String(servico.codigo_tributario_municipio || '').trim();
    if (!codigoTributarioMunicipio) {
      throw createHttpError(
        422,
        'São Bernardo do Campo (IBGE 3548708): informe servico.codigo_tributario_municipio.'
      );
    }

    if (!SAO_BERNARDO_CTM_REGEX.test(codigoTributarioMunicipio)) {
      throw createHttpError(
        422,
        'São Bernardo do Campo (IBGE 3548708): servico.codigo_tributario_municipio deve seguir o formato item/codigo (ex: 17.01/102104/1232).'
      );
    }
  }

  return {
    prestadorCnpj,
    inscricaoMunicipal,
    codigoMunicipio,
    tomadorRazaoSocial,
    itemListaServico
  };
}

function validateCancelReason(reasonRaw) {
  const reason = String(reasonRaw || '').trim();
  if (reason.length < 15 || reason.length > 255) {
    throw createHttpError(422, 'Justificativa deve ter entre 15 e 255 caracteres.');
  }
  return reason;
}

function inferNotaNumero(payload = {}) {
  const candidates = [
    payload.numero,
    payload.numero_nf,
    payload.numero_nfe,
    payload.numero_rps,
    payload.nota_fiscal?.numero,
    payload.nfse?.numero,
    payload.nfe?.numero
  ];
  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim());
  return found ? String(found).trim() : null;
}

function inferNotaStatus(payload = {}) {
  const candidates = [
    payload.status,
    payload.status_sefaz,
    payload.status_nfse,
    payload.situacao,
    payload.estado,
    payload.codigo_status,
    payload.mensagem_sefaz
  ];
  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim());
  return found ? String(found).trim() : 'processando';
}

function collectStringEntries(value, prefix = '', acc = []) {
  if (value === null || value === undefined) {
    return acc;
  }

  if (typeof value === 'string') {
    acc.push({ key: prefix.toLowerCase(), value });
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectStringEntries(item, `${prefix}[${index}]`, acc);
    });
    return acc;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectStringEntries(nested, nextPrefix, acc);
    });
  }

  return acc;
}

function hasXmlLikeValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return text.endsWith('.xml') || text.includes('/arquivos/') || text.startsWith('http');
}

function findXmlPathFromFocus(focusJson, xmlType) {
  const entries = collectStringEntries(focusJson);
  const xmlEntries = entries.filter((entry) => hasXmlLikeValue(entry.value));
  if (!xmlEntries.length) return null;

  const priorityByType = {
    envio: ['caminho_xml_nota_fiscal', 'caminho_xml_dps', 'caminho_xml', 'xml'],
    retorno: ['caminho_xml_nota_fiscal_retorno', 'caminho_xml_retorno', 'retorno', 'cancelamento'],
    resposta: ['caminho_xml_resposta', 'resposta', 'processamento', 'dps']
  };

  const priorities = priorityByType[xmlType] || [];
  for (const keyword of priorities) {
    const match = xmlEntries.find((entry) => entry.key.includes(keyword));
    if (match) return match.value;
  }

  return xmlEntries[0].value;
}

function toAbsoluteFocusUrl(baseUrl, xmlPath) {
  const path = String(xmlPath || '').trim();
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/')) {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${base}${path}`;
  }
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${path}`;
}

module.exports = {
  SAO_BERNARDO_IBGE,
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
  createHttpError,
  readErrorMessage
};
