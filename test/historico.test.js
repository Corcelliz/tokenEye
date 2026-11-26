'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { montarLinhaDoTempo } = require('../src/main/historico.js');
const { criarStore } = require('../src/main/store.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AGORA = new Date('2026-11-20T12:00:00Z');

test('separa sessao e semana, ordena por horario e descarta o que esta fora da janela de 14 dias', () => {
  const leituras = [
    { nome: 'semana', percentual: 50, lidoEm: '2026-11-18T12:00:00Z' },
    { nome: 'semana', percentual: 20, lidoEm: '2026-11-15T12:00:00Z' },
    { nome: 'sessao', percentual: 36, lidoEm: '2026-11-19T20:00:00Z' },
    { nome: 'semana', percentual: 99, lidoEm: '2026-11-01T12:00:00Z' }, // velha demais
    { nome: 'semana', percentual: 10, lidoEm: '2026-11-21T12:00:00Z' }, // no futuro
  ];
  const { series } = montarLinhaDoTempo(leituras, AGORA);
  assert.deepEqual(series.semana.map((p) => p.percentual), [20, 50]); // em ordem de horario
  assert.deepEqual(series.sessao.map((p) => p.percentual), [36]);
});

test('ignora leitura invalida e limita o percentual entre 0 e 100', () => {
  const { series } = montarLinhaDoTempo([
    { nome: 'semana', percentual: 'abc', lidoEm: '2026-11-19T12:00:00Z' },
    { nome: 'semana', percentual: 130, lidoEm: '2026-11-19T13:00:00Z' },
    { nome: 'semana', percentual: 40, lidoEm: 'nao-e-data' },
    { nome: 'outra', percentual: 40, lidoEm: '2026-11-19T12:00:00Z' },
  ], AGORA);
  assert.deepEqual(series.semana.map((p) => p.percentual), [100]);
  assert.deepEqual(series.sessao, []);
});

test('sem leituras: series vazias (a tela mostra a mensagem de vazio)', () => {
  const r = montarLinhaDoTempo([], AGORA);
  assert.deepEqual(r.series, { sessao: [], semana: [] });
  assert.equal(r.fim, AGORA.toISOString());
});

test('funciona com o historico real gravado pelo store (limites.json)', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-hist-'));
  try {
    const store = criarStore(pasta);
    store.adicionarLeitura({ sessao: { percentual: 30, reinicia: 'sáb., 00:30' }, semana: { percentual: 60, reinicia: 'domingo, 04:00' } }, new Date('2026-11-19T10:00:00Z'));
    store.adicionarLeitura({ semana: { percentual: 70, reinicia: 'domingo, 04:00' } }, new Date('2026-11-19T22:00:00Z'));
    const { series } = montarLinhaDoTempo(store.listarLeituras(), AGORA);
    assert.deepEqual(series.semana.map((p) => p.percentual), [60, 70]);
    assert.deepEqual(series.sessao.map((p) => p.percentual), [30]);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
