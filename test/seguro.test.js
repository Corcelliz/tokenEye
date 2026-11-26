'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { protegido } = require('../src/main/seguro.js');

test('devolve o resultado normal quando nao ha erro', () => {
  const soma = protegido((a, b) => a + b, 'soma');
  assert.equal(soma(2, 3), 5);
});

test('captura o erro, registra o rotulo e nao deixa estourar', () => {
  const registros = [];
  const quebra = protegido(() => { throw new Error('falhou'); }, 'varredura', (...partes) => registros.push(partes));
  assert.doesNotThrow(() => quebra());
  assert.equal(quebra(), undefined);
  assert.equal(registros.length, 2);
  assert.match(registros[0][0], /varredura/);
  assert.equal(registros[0][1], 'falhou');
});

test('continua funcionando depois de um erro (proximo ciclo tenta de novo)', () => {
  let chamadas = 0;
  const instavel = protegido(() => { chamadas++; if (chamadas === 1) throw new Error('x'); return 'ok'; }, 'ciclo', () => {});
  assert.equal(instavel(), undefined);
  assert.equal(instavel(), 'ok');
});
