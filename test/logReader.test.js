'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarLeitorDeLogs, listarArquivosJsonl } = require('../src/main/logReader.js');

const PASTA_FIXTURES = path.join(__dirname, '..', 'fixtures', 'logs-exemplo');

test('listarArquivosJsonl encontra os .jsonl nas subpastas, recursivamente', () => {
  const arquivos = listarArquivosJsonl(PASTA_FIXTURES);
  assert.equal(arquivos.length, 2);
  assert.ok(arquivos.every((a) => a.endsWith('.jsonl')));
});

test('listarArquivosJsonl devolve lista vazia se a pasta nao existir (sem quebrar)', () => {
  const arquivos = listarArquivosJsonl(path.join(PASTA_FIXTURES, 'pasta-que-nao-existe'));
  assert.deepEqual(arquivos, []);
});

test('le um arquivo inteiro na primeira chamada e nada na segunda (sem novidades)', () => {
  const leitor = criarLeitorDeLogs(PASTA_FIXTURES);
  const arquivo = listarArquivosJsonl(PASTA_FIXTURES)[0];
  const primeira = leitor.lerNovidades(arquivo);
  assert.ok(primeira.linhas.length > 0);
  const segunda = leitor.lerNovidades(arquivo);
  assert.equal(segunda.linhas.length, 0);
});

test('le so o que foi acrescentado ao arquivo (offset) e ignora linha incompleta', () => {
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-teste-'));
  const arquivoTemp = path.join(pastaTemp, 'sessao-temp.jsonl');
  fs.writeFileSync(arquivoTemp, '{"a":1}\n{"a":2}\n');

  const leitor = criarLeitorDeLogs(pastaTemp);
  const primeira = leitor.lerNovidades(arquivoTemp);
  assert.equal(primeira.linhas.length, 2);

  // Acrescenta uma linha completa e uma incompleta (como se o arquivo
  // estivesse sendo escrito no momento da leitura).
  fs.appendFileSync(arquivoTemp, '{"a":3}\n{"a":4} ainda escrev');
  const segunda = leitor.lerNovidades(arquivoTemp);
  assert.deepEqual(segunda.linhas, ['{"a":3}']);

  // Completa a linha que faltava; agora ela deve aparecer.
  fs.appendFileSync(arquivoTemp, 'endo\n');
  const terceira = leitor.lerNovidades(arquivoTemp);
  assert.deepEqual(terceira.linhas, ['{"a":4} ainda escrevendo']);

  fs.rmSync(pastaTemp, { recursive: true, force: true });
});

test('o offset conta bytes, entao acentos nao atrapalham a leitura das novidades', () => {
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-teste-'));
  const arquivoTemp = path.join(pastaTemp, 'sessao-temp.jsonl');
  fs.writeFileSync(arquivoTemp, '{"texto":"ação é útil"}\n');

  const leitor = criarLeitorDeLogs(pastaTemp);
  assert.deepEqual(leitor.lerNovidades(arquivoTemp).linhas, ['{"texto":"ação é útil"}']);

  fs.appendFileSync(arquivoTemp, '{"texto":"não repete"}\n');
  assert.deepEqual(leitor.lerNovidades(arquivoTemp).linhas, ['{"texto":"não repete"}']);

  fs.rmSync(pastaTemp, { recursive: true, force: true });
});

test('se o arquivo for substituido por um menor, rele desde o inicio', () => {
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-teste-'));
  const arquivoTemp = path.join(pastaTemp, 'sessao-temp.jsonl');
  fs.writeFileSync(arquivoTemp, '{"a":1}\n{"a":2}\n{"a":3}\n');

  const leitor = criarLeitorDeLogs(pastaTemp);
  leitor.lerNovidades(arquivoTemp); // le as 3 linhas, offset vai para o fim

  fs.writeFileSync(arquivoTemp, '{"b":1}\n'); // arquivo novo, menor que o offset guardado
  const resultado = leitor.lerNovidades(arquivoTemp);
  assert.deepEqual(resultado.linhas, ['{"b":1}']);

  fs.rmSync(pastaTemp, { recursive: true, force: true });
});
