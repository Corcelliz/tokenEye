'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extrairLimitesDoTexto, validarCampos } = require('../src/main/limites.js');

test('extrai sessao e semana do texto copiado da pagina de uso (uma info por linha)', () => {
  const texto = [
    'Sessão atual',
    'Reinicia sáb., 00:30',
    '36% usado',
    'Esta semana',
    'Reinicia domingo, 04:00',
    '66% usado',
  ].join('\n');

  const resultado = extrairLimitesDoTexto(texto);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.leitura, {
    sessao: { percentual: 36, reinicia: 'sáb., 00:30' },
    semana: { percentual: 66, reinicia: 'domingo, 04:00' },
  });
});

test('funciona quando a copia junta tudo em uma linha so, com espacos especiais', () => {
  const texto = 'Sessão atual Reinicia sáb., 00:30 36 % usado Esta semana Reinicia domingo, 04:00 66% usado';
  const resultado = extrairLimitesDoTexto(texto);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.leitura.sessao, { percentual: 36, reinicia: 'sáb., 00:30' });
  assert.deepEqual(resultado.leitura.semana, { percentual: 66, reinicia: 'domingo, 04:00' });
});

test('ignora texto em volta e aceita reinicio relativo ("em 2 h 10 min")', () => {
  const texto = [
    'Limites de uso do plano',
    'Sessão atual',
    'Reinicia em 2 h 10 min',
    '8% usado',
    'Esta semana',
    'Todos os modelos',
    'Reinicia domingo, 04:00',
    '91% usado',
    'Saiba mais sobre os limites',
  ].join('\r\n');
  const resultado = extrairLimitesDoTexto(texto);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.leitura.sessao, { percentual: 8, reinicia: 'em 2 h 10 min' });
  assert.equal(resultado.leitura.semana.percentual, 91);
});

test('aceita so um dos blocos (ex.: copiou apenas a sessao)', () => {
  const resultado = extrairLimitesDoTexto('Sessão atual\n36% usado');
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.leitura, { sessao: { percentual: 36, reinicia: null } });
});

test('aceita a interface em ingles', () => {
  const texto = 'Current session\nResets in 3 hr 5 min\n12% used\nWeekly limits\nAll models\nResets Sun 4:00 AM\n40% used';
  const resultado = extrairLimitesDoTexto(texto);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.leitura.sessao.percentual, 12);
  assert.equal(resultado.leitura.semana.percentual, 40);
});

test('recusa texto sem os titulos, vazio, grande demais ou com porcentagem impossivel', () => {
  assert.equal(extrairLimitesDoTexto('36% usado').ok, false);
  assert.equal(extrairLimitesDoTexto('   ').ok, false);
  assert.equal(extrairLimitesDoTexto(null).ok, false);
  assert.equal(extrairLimitesDoTexto('Sessão atual 36% '.repeat(1000)).ok, false);
  assert.equal(extrairLimitesDoTexto('Sessão atual\n250% usado').ok, false);
});

test('validarCampos aceita valores digitados e ignora bloco em branco', () => {
  const resultado = validarCampos({
    sessao: { percentual: '36', reinicia: ' sáb., 00:30 ' },
    semana: { percentual: '', reinicia: '' },
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.leitura, { sessao: { percentual: 36, reinicia: 'sáb., 00:30' } });
});

test('validarCampos recusa porcentagem fora de 0 a 100 e formulario todo vazio', () => {
  assert.equal(validarCampos({ sessao: { percentual: '120' } }).ok, false);
  assert.equal(validarCampos({ sessao: { percentual: 'abc' } }).ok, false);
  assert.equal(validarCampos({ sessao: { percentual: '' }, semana: {} }).ok, false);
  assert.equal(validarCampos(null).ok, false);
});

test('interpretarReinicio entende dia da semana, hoje, amanha e "em X h Y min"', () => {
  const { interpretarReinicio } = require('../src/main/limites.js');
  const lido = Date.parse('2026-11-14T01:27:47Z'); // sexta 13/11, 22:27 em Sao Paulo
  const sp = (ms) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 16);
  assert.equal(sp(interpretarReinicio('sáb., 00:30', lido)), '2026-11-14T00:30');
  assert.equal(sp(interpretarReinicio('domingo, 04:00', lido)), '2026-11-15T04:00');
  assert.equal(sp(interpretarReinicio('amanhã, 00:28', lido)), '2026-11-14T00:28');
  assert.equal(interpretarReinicio('em 2 h 14 min', lido), lido + (2 * 60 + 14) * 60 * 1000);
  assert.equal(interpretarReinicio('texto sem horario', lido), null);
  assert.equal(interpretarReinicio(null, lido), null);
});
