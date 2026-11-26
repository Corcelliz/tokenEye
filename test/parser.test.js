'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseLinha } = require('../src/main/parser.js');

function lerFixture(nome) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'parser', nome), 'utf8');
}

test('linha valida: extrai os tokens e nao guarda texto de conversa', () => {
  const linha = lerFixture('linha-valida.jsonl').split('\n')[0];
  const resultado = parseLinha(linha);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.registro.messageId, 'msg-ficticio-1');
  assert.equal(resultado.registro.modelo, 'claude-sonnet-5-5');
  assert.deepEqual(resultado.registro.tokens, { entrada: 100, saida: 200, criacaoCache: 50, leituraCache: 10 });
  assert.equal('content' in resultado.registro, false);
});

test('linha sem usage (type user ou assistant sem message.usage) e ignorada', () => {
  const linhas = lerFixture('linha-sem-usage.jsonl').split('\n').filter(Boolean);
  for (const linha of linhas) {
    const resultado = parseLinha(linha);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, 'sem_uso');
  }
});

test('linha truncada (JSON invalido) e marcada para contagem de linhas ignoradas', () => {
  const linha = lerFixture('linha-truncada.jsonl').split('\n')[0];
  const resultado = parseLinha(linha);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'json_invalido');
});

test('linha duplicada: o parser extrai os dois registros iguais (a deduplicacao e feita pelo agregador)', () => {
  const linhas = lerFixture('linha-duplicada.jsonl').split('\n').filter(Boolean);
  const resultados = linhas.map(parseLinha);
  assert.equal(resultados.length, 2);
  assert.equal(resultados[0].registro.messageId, resultados[1].registro.messageId);
});

test('modelo desconhecido aparece como veio, sem quebrar', () => {
  const linha = lerFixture('linha-modelo-desconhecido.jsonl').split('\n')[0];
  const resultado = parseLinha(linha);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.registro.modelo, 'claude-modelo-futuro-99');
});

test('campos de tokens ausentes contam como zero, sem quebrar', () => {
  const linha = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-09T12:00:07.000Z',
    sessionId: 's1',
    message: { id: 'msg-sem-campos', model: 'claude-sonnet-5-5', usage: {} },
  });
  const resultado = parseLinha(linha);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.registro.tokens, { entrada: 0, saida: 0, criacaoCache: 0, leituraCache: 0 });
});

test('linha em branco e ignorada sem erro', () => {
  const resultado = parseLinha('   ');
  assert.equal(resultado.ok, false);
});

test('projeto: guarda so o nome da ultima pasta do cwd (Windows ou Linux)', () => {
  const { nomeDoProjeto } = require('../src/main/parser.js');
  assert.equal(nomeDoProjeto('C:\\Users\\exemplo\\projetos\\meu-app'), 'meu-app');
  assert.equal(nomeDoProjeto('C:\\Users\\exemplo\\projetos\\meu-app\\'), 'meu-app');
  assert.equal(nomeDoProjeto('/home/exemplo/meu-app'), 'meu-app');
  assert.equal(nomeDoProjeto(undefined), 'sem projeto');
  assert.equal(nomeDoProjeto('C:\\'), 'C:'); // raiz do disco: nome da unidade, sem caminho
  assert.equal(nomeDoProjeto(''), 'sem projeto');
});

test('o registro traz o nome do projeto e nunca o caminho completo', () => {
  const linha = JSON.stringify({
    type: 'assistant', timestamp: '2026-11-09T14:00:00.000Z', cwd: 'C:\\Users\\exemplo\\projetos\\estudo',
    message: { id: 'm', model: 'claude-sonnet-5-5', usage: { input_tokens: 1, output_tokens: 1 } },
  });
  const { registro } = parseLinha(linha);
  assert.equal(registro.projeto, 'estudo');
  assert.equal(JSON.stringify(registro).includes('Users'), false);
});
