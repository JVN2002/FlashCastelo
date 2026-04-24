const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeReference,
  validateNfePayload,
  validateNfsePayload,
  findXmlPathFromFocus,
  toAbsoluteFocusUrl
} = require('../src/services/focus-nfe.service');

test('sanitizeReference aceita referência válida', () => {
  const reference = sanitizeReference('PEDIDO_2026-04-24_A');
  assert.equal(reference, 'PEDIDO_2026-04-24_A');
});

test('sanitizeReference rejeita caracteres inválidos', () => {
  assert.throws(
    () => sanitizeReference('pedido 123'),
    /Referência inválida/
  );
});

test('validateNfePayload valida cnpj_emitente e CNPJ permitido', () => {
  const payload = { cnpj_emitente: '12.345.678/0001-90' };
  const validated = validateNfePayload(payload, '12345678000190');
  assert.equal(validated.cnpjEmitente, '12345678000190');

  assert.throws(
    () => validateNfePayload(payload, '00000000000000'),
    /CNPJ do emitente não corresponde/
  );
});

test('validateNfsePayload aplica regra de São Bernardo do Campo (IBGE 3548708)', () => {
  const validPayload = {
    prestador: {
      cnpj: '12345678000190',
      inscricao_municipal: '12345',
      codigo_municipio: '3548708'
    },
    tomador: {
      razao_social: 'Cliente'
    },
    servico: {
      item_lista_servico: '17.01',
      codigo_tributario_municipio: '17.01/102104/1232'
    }
  };

  const validated = validateNfsePayload(validPayload);
  assert.equal(validated.prestadorCnpj, '12345678000190');

  assert.throws(
    () =>
      validateNfsePayload({
        ...validPayload,
        servico: {
          item_lista_servico: '17.01',
          codigo_tributario_municipio: '17.01102104'
        }
      }),
    /formato item\/codigo/
  );
});

test('findXmlPathFromFocus identifica XML de envio e retorno', () => {
  const focusJson = {
    status: 'autorizado',
    caminho_xml_nota_fiscal: '/arquivos/xml/envio.xml',
    links: {
      caminho_xml_retorno: '/arquivos/xml/retorno.xml'
    }
  };

  assert.equal(findXmlPathFromFocus(focusJson, 'envio'), '/arquivos/xml/envio.xml');
  assert.equal(findXmlPathFromFocus(focusJson, 'retorno'), '/arquivos/xml/retorno.xml');
});

test('toAbsoluteFocusUrl monta URL completa corretamente', () => {
  const absolute = toAbsoluteFocusUrl('https://api.focusnfe.com.br', '/arquivos/xml/teste.xml');
  assert.equal(absolute, 'https://api.focusnfe.com.br/arquivos/xml/teste.xml');
});
