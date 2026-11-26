// Subagentes (isSidechain: true) entram no total, sem filtro (decisao de 09/11).
// Este teste garante que uma sessao com subagente nao quebra nada.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { criarLeitorDeLogs } = require('../src/main/logReader.js');
const { parseLinha } = require('../src/main/parser.js');
const { criarAgregador } = require('../src/main/aggregate.js');

const PASTA = path.join(__dirname, '..', 'fixtures', 'subagente');
const AGORA = new Date('2026-11-09T18:00:00.000Z');

function carregar() {
  const leitor = criarLeitorDeLogs(PASTA);
  const agregador = criarAgregador();
  const registros = [];
  for (const arquivo of leitor.listarArquivos()) {
    for (const linha of leitor.lerNovidades(arquivo).linhas) {
      const r = parseLinha(linha);
      if (r.ok) { registros.push(r.registro); agregador.adicionarRegistro(r.registro); }
    }
  }
  return { agregador, registros };
}

test('o parser marca as linhas de subagente com isSidechain', () => {
  const { registros } = carregar();
  assert.equal(registros.filter((r) => r.isSidechain).length, 3); // 2 + 1 repetida
  assert.equal(registros.filter((r) => !r.isSidechain).length, 1);
});

test('subagente entra no total e a linha repetida e contada uma vez so', () => {
  const resumo = carregar().agregador.obterResumo(AGORA);
  // principal 100+200 (opus) + 30+60 + 20+40 (haiku subagente) = 450; a repetida nao soma.
  assert.equal(resumo.hoje.entrada + resumo.hoje.saida, 450);
  assert.equal(resumo.estatisticas.duplicadas, 1);
  assert.deepEqual(resumo.porFamilia.map((f) => f.familia), ['opus', 'haiku']);
});
