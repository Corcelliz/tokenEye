'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarEstimativa } = require('../src/main/estimativa.js');

const HORA = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-16T10:00:00Z');
const evento = (horas, tokens) => ({ ts: T0 + horas * HORA, tokens });

// Leitura manual: 50% as 12:00, quando o bloco (que comecou as 10:00) tinha 1000 tokens.
const eventos = [evento(0, 400), evento(1, 400), evento(1.9, 200), evento(2.5, 500)];
const limites = {
  alerta: { atencao: 80, critico: 95 },
  sessao: { percentual: 50, reinicia: 'x', lidoEm: new Date(T0 + 2 * HORA).toISOString(), origem: 'manual' },
  semana: null,
};

test('sessao: tokens novos no mesmo bloco aumentam a porcentagem na mesma taxa', () => {
  const agora = new Date(T0 + 3 * HORA);
  const r = aplicarEstimativa(limites, eventos, agora);
  assert.equal(r.sessao.origem, 'estimado');
  assert.equal(r.sessao.percentual, 75); // 1500 tokens no bloco, taxa 0,05% por token
  assert.equal(r.sessao.baseadoEm.percentual, 50);
});

test('leitura recente (menos de 2 min) fica como esta', () => {
  const agora = new Date(T0 + 2 * HORA + 30 * 1000);
  const r = aplicarEstimativa(limites, eventos, agora);
  assert.equal(r.sessao.origem, 'manual');
});

test('sessao: bloco novo comeca do zero e usa a mesma taxa', () => {
  const novos = [...eventos, evento(6, 100)];
  const r = aplicarEstimativa(limites, novos, new Date(T0 + 7 * HORA));
  assert.equal(r.sessao.percentual, 5); // 100 tokens * 0,05
});

test('sessao: sem uso depois que o bloco acabou, volta a 0%', () => {
  const r = aplicarEstimativa(limites, eventos, new Date(T0 + 8 * HORA));
  assert.equal(r.sessao.percentual, 0);
});

test('semana: soma a taxa dos tokens novos sobre a ultima leitura', () => {
  const semana = { ...limites.sessao, percentual: 10 };
  const r = aplicarEstimativa({ ...limites, semana }, eventos, new Date(T0 + 3 * HORA));
  assert.equal(r.semana.origem, 'estimado');
  assert.equal(r.semana.percentual, 15); // 500 tokens novos x taxa 10/1000 = +5
});

test('sem tokens na leitura nao ha como calibrar: mantem a leitura', () => {
  const r = aplicarEstimativa(limites, [], new Date(T0 + 3 * HORA));
  assert.equal(r.sessao.origem, 'manual');
});

test('leitura expirada nao e estimada e o percentual nunca passa de 100', () => {
  const expirada = { ...limites, sessao: { ...limites.sessao, expirado: true } };
  assert.equal(aplicarEstimativa(expirada, eventos, new Date(T0 + 3 * HORA)).sessao.origem, 'manual');
  const muitos = [...eventos, evento(2.9, 50000)];
  assert.equal(aplicarEstimativa(limites, muitos, new Date(T0 + 3 * HORA)).sessao.percentual, 100);
});
