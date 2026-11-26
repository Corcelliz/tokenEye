'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAgregador, familiaDoModelo, nomeCurtoDoModelo } = require('../src/main/aggregate.js');

function registro({ messageId, timestamp, modelo = 'claude-sonnet-5-5', tokens }) {
  return {
    messageId,
    requestId: `req-${messageId}`,
    timestamp,
    modelo,
    sessionId: 'sessao-teste',
    isSidechain: false,
    tokens: { entrada: 0, saida: 0, criacaoCache: 0, leituraCache: 0, ...tokens },
  };
}

// "Agora" fixo para os testes: meio-dia de 09/11/2026 em Sao Paulo (UTC-3).
const AGORA = new Date('2026-11-09T15:00:00.000Z');

test('agregador soma tokens no dia certo (fuso America/Sao_Paulo)', () => {
  const agregador = criarAgregador();
  // 23:30 em Sao Paulo de 08/11 = 02:30 UTC de 09/11. Deve cair no dia 08/11.
  agregador.adicionarRegistro(registro({
    messageId: 'm1',
    timestamp: '2026-11-09T02:30:00.000Z',
    tokens: { entrada: 10, saida: 20 },
  }));
  const resumo = agregador.obterResumo(AGORA);
  const dia08 = resumo.porDia.find((d) => d.dia === '2026-11-08');
  assert.equal(dia08.total, 30);
  const dia09 = resumo.porDia.find((d) => d.dia === '2026-11-09');
  assert.equal(dia09.total, 0);
});

test('deduplica por message.id: a segunda ocorrencia nao conta de novo', () => {
  const agregador = criarAgregador();
  const r = registro({ messageId: 'm2', timestamp: '2026-11-09T15:00:00.000Z', tokens: { entrada: 5, saida: 5 } });
  agregador.adicionarRegistro(r);
  agregador.adicionarRegistro(r); // mesma linha de novo (ex.: reprocessada)
  const resumo = agregador.obterResumo(AGORA);
  assert.equal(resumo.hoje.total, 10);
  assert.equal(resumo.estatisticas.duplicadas, 1);
  assert.equal(resumo.estatisticas.linhasComUso, 1);
});

test('hoje, ultimos 7 dias e mes atual somam as janelas certas', () => {
  const agregador = criarAgregador();
  agregador.adicionarRegistro(registro({ messageId: 'hoje', timestamp: '2026-11-09T14:00:00.000Z', tokens: { entrada: 100 } }));
  agregador.adicionarRegistro(registro({ messageId: 'ha3dias', timestamp: '2026-11-06T14:00:00.000Z', tokens: { entrada: 200 } }));
  agregador.adicionarRegistro(registro({ messageId: 'ha10dias', timestamp: '2026-10-30T14:00:00.000Z', tokens: { entrada: 400 } }));
  agregador.adicionarRegistro(registro({ messageId: 'mesPassado', timestamp: '2026-10-15T14:00:00.000Z', tokens: { entrada: 800 } }));

  const resumo = agregador.obterResumo(AGORA);
  assert.equal(resumo.hoje.total, 100);
  assert.equal(resumo.ultimos7Dias.total, 300); // hoje + ha3dias (ha10dias fica fora da janela de 7 dias)
  assert.equal(resumo.mesAtual.total, 300); // novembro: hoje + ha3dias (ha10dias e mesPassado sao de outubro)
});

test('porDia tem 14 entradas, da mais antiga para a mais nova, terminando hoje', () => {
  const agregador = criarAgregador();
  const resumo = agregador.obterResumo(AGORA);
  assert.equal(resumo.porDia.length, 14);
  assert.equal(resumo.porDia[13].dia, '2026-11-09');
  assert.equal(resumo.porDia[0].dia, '2026-10-27');
});

test('porModelo calcula o percentual de cada modelo sobre o total geral', () => {
  const agregador = criarAgregador();
  agregador.adicionarRegistro(registro({ messageId: 'a', timestamp: '2026-11-09T14:00:00.000Z', modelo: 'claude-sonnet-5-5', tokens: { entrada: 75 } }));
  agregador.adicionarRegistro(registro({ messageId: 'b', timestamp: '2026-11-09T14:00:00.000Z', modelo: 'claude-opus-5-5', tokens: { entrada: 25 } }));
  const resumo = agregador.obterResumo(AGORA);
  const sonnet = resumo.porModelo.find((m) => m.modelo === 'claude-sonnet-5-5');
  const opus = resumo.porModelo.find((m) => m.modelo === 'claude-opus-5-5');
  assert.equal(sonnet.percentual, 75);
  assert.equal(opus.percentual, 25);
  assert.equal(resumo.porModelo[0].modelo, 'claude-sonnet-5-5'); // ordenado do maior para o menor
});

test('familiaDoModelo e nomeCurtoDoModelo reconhecem os nomes dos logs', () => {
  assert.equal(familiaDoModelo('claude-opus-5-5'), 'opus');
  assert.equal(familiaDoModelo('claude-sonnet-4-5-20250929'), 'sonnet');
  assert.equal(familiaDoModelo('claude-haiku-5-5'), 'haiku');
  assert.equal(familiaDoModelo('<synthetic>'), 'outros');
  assert.equal(familiaDoModelo(undefined), 'outros');
  assert.equal(nomeCurtoDoModelo('claude-sonnet-4-5-20250929'), 'sonnet-4-5');
  assert.equal(nomeCurtoDoModelo('claude-opus-5-5'), 'opus-5-5');
});

test('porFamilia junta as versoes, usa entrada + saida e ignora modelo sem tokens', () => {
  const agregador = criarAgregador();
  const ts = '2026-11-09T14:00:00.000Z';
  agregador.adicionarRegistro(registro({ messageId: 'a', timestamp: ts, modelo: 'claude-opus-5-5', tokens: { entrada: 40, saida: 20, leituraCache: 9000 } }));
  agregador.adicionarRegistro(registro({ messageId: 'b', timestamp: ts, modelo: 'claude-opus-4-5-20251101', tokens: { entrada: 10, saida: 5 } }));
  agregador.adicionarRegistro(registro({ messageId: 'c', timestamp: ts, modelo: 'claude-sonnet-5-5', tokens: { entrada: 25 } }));
  agregador.adicionarRegistro(registro({ messageId: 'd', timestamp: ts, modelo: '<synthetic>', tokens: {} }));

  const { porFamilia } = agregador.obterResumo(AGORA);
  assert.deepEqual(porFamilia.map((f) => f.familia), ['opus', 'sonnet']); // sem "outros" vazio
  const opus = porFamilia[0];
  assert.equal(opus.principal, 75); // 40+20 + 10+5, o cache nao entra
  assert.equal(opus.leituraCache, 9000); // mas continua guardado
  assert.deepEqual(opus.versoes, ['opus-5-5', 'opus-4-5']); // a mais usada primeiro
  assert.equal(opus.percentual, 75);
  assert.equal(porFamilia[1].percentual, 25);
});

test('registrarLinhaIgnorada conta sem afetar os totais', () => {
  const agregador = criarAgregador();
  agregador.registrarLinhaIgnorada();
  agregador.registrarLinhaIgnorada();
  const resumo = agregador.obterResumo(AGORA);
  assert.equal(resumo.estatisticas.linhasIgnoradas, 2);
  assert.equal(resumo.hoje.total, 0);
});

test('porModelo e porFamilia olham so os ultimos 30 dias', () => {
  const agregador = criarAgregador();
  // AGORA = 09/11. A janela de 30 dias comeca em 11/10 (hoje + 29 anteriores).
  agregador.adicionarRegistro(registro({ messageId: 'dentro', timestamp: '2026-10-11T15:00:00.000Z', modelo: 'claude-sonnet-5-5', tokens: { entrada: 40 } }));
  agregador.adicionarRegistro(registro({ messageId: 'fora', timestamp: '2026-10-10T15:00:00.000Z', modelo: 'claude-opus-5-5', tokens: { entrada: 1000 } }));
  const resumo = agregador.obterResumo(AGORA);
  assert.deepEqual(resumo.porModelo.map((m) => m.modelo), ['claude-sonnet-5-5']);
  assert.deepEqual(resumo.porFamilia.map((f) => f.familia), ['sonnet']);
  assert.equal(resumo.porFamilia[0].percentual, 100);
});

test('porProjeto soma entrada + saida por projeto nos ultimos 30 dias e agrupa o excedente', () => {
  const agregador = criarAgregador();
  const add = (id, projeto, entrada, ts = '2026-11-09T14:00:00.000Z') =>
    agregador.adicionarRegistro({ ...registro({ messageId: id, timestamp: ts, tokens: { entrada, leituraCache: 5000 } }), projeto });
  add('a1', 'grande', 600);
  add('a2', 'grande', 200);
  add('b1', 'medio', 200);
  add('velho', 'antigo', 9999, '2026-09-01T14:00:00.000Z'); // fora dos 30 dias
  for (let i = 0; i < 9; i++) add(`p${i}`, `pequeno-${i}`, 1); // 9 projetos pequenos: o 8o em diante vira "outros"
  const { porProjeto } = agregador.obterResumo(AGORA);
  assert.equal(porProjeto[0].projeto, 'grande');
  assert.equal(porProjeto[0].principal, 800); // o cache nao entra
  assert.equal(porProjeto.find((p) => p.projeto === 'antigo'), undefined);
  assert.equal(porProjeto.length, 9); // 8 nomes + "outros"
  const outros = porProjeto[8];
  assert.equal(outros.agrupado, true);
  assert.equal(outros.principal, 3); // sobraram 3 projetos de 1 token
  const soma = porProjeto.reduce((acc, p) => acc + p.percentual, 0);
  assert.ok(Math.abs(soma - 100) < 1e-9);
});
