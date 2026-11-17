'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarEstimativa } = require('../src/main/estimativa.js');
const { combinarLimites } = require('../src/main/limitesAuto.js');

const ev = (iso, tokens) => ({ ts: Date.parse(iso), tokens });

// Leitura manual de sexta 13/11 22:27 (SP): sessao 61% (reinicia sab 00:30),
// semana 69% (reinicia domingo 04:00). Janela da sessao: 19:30 a 00:30 (SP).
const LIDO_EM = '2026-11-14T01:27:47.000Z';
const leituras = [
  { nome: 'sessao', percentual: 61, reinicia: 'sáb., 00:30', lidoEm: LIDO_EM },
  { nome: 'semana', percentual: 69, reinicia: 'domingo, 04:00', lidoEm: LIDO_EM },
  { nome: 'sessao', percentual: 1, reinicia: 'sáb., 00:30', lidoEm: '2026-11-14T02:12:00.000Z' }, // pequena demais para calibrar
];
// 1000 tokens na janela da sessao ate a leitura; 4000 antes (semana toda = 5000).
const eventos = [
  ev('2026-11-10T12:00:00Z', 4000),
  ev('2026-11-13T22:40:00Z', 600),
  ev('2026-11-14T00:30:00Z', 400),
  ev('2026-11-16T14:10:00Z', 500), // segunda 11:10 (SP): bloco novo, janela da semana nova
];
const manual = { alerta: { atencao: 80, critico: 95 }, sessao: null, semana: null };
function combinar(agora) {
  const m = { ...manual, sessao: { ...leituras[2], reinicia: 'sáb., 00:30' }, semana: { ...leituras[1] } };
  return combinarLimites(m, null, agora);
}

test('leitura de janela que ja acabou nao aparece como valor de hoje: vira estimativa da janela atual', () => {
  const agora = new Date('2026-11-16T15:00:00Z');
  const r = aplicarEstimativa(combinar(agora), eventos, leituras, agora);
  assert.equal(r.sessao.origem, 'estimado');
  assert.equal(r.sessao.baseadoEm.percentual, 61); // calibrou com a leitura de 61%, nao com a de 1%
  assert.equal(r.sessao.percentual, 30.5); // 500 tokens x 0,061 %/token
  assert.ok(Date.parse(r.sessao.reiniciaEm) > agora.getTime(), 'o reinicio mostrado e futuro, nao "sab 00:30"');
});

test('semana: usa a janela de 7 dias de agora (reinicia domingo 04:00, entao anda de 7 em 7 dias)', () => {
  const agora = new Date('2026-11-16T15:00:00Z');
  const r = aplicarEstimativa(combinar(agora), eventos, leituras, agora);
  // Tokens da semana da leitura: 5000 (ate 13/11 22:27 SP) -> 0,0138 %/token; semana atual tem so 500 tokens.
  assert.equal(r.semana.origem, 'estimado');
  assert.equal(r.semana.percentual, 6.9);
  assert.equal(new Date(r.semana.reiniciaEm).toISOString(), '2026-11-22T07:00:00.000Z'); // domingo 22/11 04:00 SP
});

test('mesma janela: soma so o que veio depois da leitura', () => {
  const dentro = [...eventos.slice(0, 3), ev('2026-11-14T02:20:00Z', 100)]; // 23:20 SP, depois da leitura das 23:12 e antes do reinicio
  const agora = new Date('2026-11-14T02:30:00Z');
  const r = aplicarEstimativa(combinar(agora), dentro, leituras.slice(0, 2), agora);
  // atual = leitura de 61% (a de 1% e posterior, mas e a que a tela tem: 1%) -> base 1% + 100 x 0,061
  assert.equal(r.sessao.percentual, 7.1);
});

test('leitura recente (menos de 2 min) fica como esta', () => {
  const agora = new Date('2026-11-14T02:12:30.000Z');
  const r = aplicarEstimativa(combinar(agora), eventos, leituras, agora);
  assert.equal(r.sessao.origem, 'manual');
});

test('sem nenhuma leitura boa para calibrar, nao inventa numero', () => {
  const agora = new Date('2026-11-16T15:00:00Z');
  const so1 = [leituras[2]];
  const r = aplicarEstimativa(combinar(agora), eventos, so1, agora);
  assert.equal(r.sessao.origem, 'manual');
  assert.equal(r.sessao.expirado, true);
});

test('o percentual nunca passa de 100', () => {
  const agora = new Date('2026-11-16T15:00:00Z');
  const muitos = [...eventos, ev('2026-11-16T14:20:00Z', 90000)];
  assert.equal(aplicarEstimativa(combinar(agora), muitos, leituras, agora).sessao.percentual, 100);
});
