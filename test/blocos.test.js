'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listarBlocos } = require('../src/main/blocos.js');

const ev = (iso, tokens) => ({ ts: Date.parse(iso), tokens });

test('o bloco comeca na hora cheia da primeira mensagem e dura 5 h', () => {
  const blocos = listarBlocos([ev('2026-11-10T14:37:00Z', 10)]);
  assert.equal(new Date(blocos[0].inicio).toISOString(), '2026-11-10T14:00:00.000Z');
  assert.equal(new Date(blocos[0].fim).toISOString(), '2026-11-10T19:00:00.000Z');
});

test('mensagens dentro das 5 h ficam no mesmo bloco; depois do fim abre outro', () => {
  const blocos = listarBlocos([
    ev('2026-11-10T14:37:00Z', 1),
    ev('2026-11-10T18:59:00Z', 1),
    ev('2026-11-10T19:00:00Z', 1), // exatamente no fim: bloco novo
  ]);
  assert.equal(blocos.length, 2);
});
