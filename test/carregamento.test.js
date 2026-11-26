'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { carregarTudo } = require('../src/main/carregamento.js');

const PASTA_FIXTURES = path.join(__dirname, '..', 'fixtures', 'logs-exemplo');

test('pasta de logs que nao existe: estado vazio', () => {
  const { estado } = carregarTudo(path.join(os.tmpdir(), 'pasta-que-nao-existe-xyz'), () => {});
  assert.equal(estado.tipo, 'vazio');
});

test('pasta com logs: estado pronto e as linhas chegam ao processador', () => {
  let linhas = 0;
  const { estado } = carregarTudo(PASTA_FIXTURES, (l) => { linhas += l.length; });
  assert.equal(estado.tipo, 'pronto');
  assert.ok(linhas > 0);
});

// Bloqueia/desbloqueia uma pasta de verdade. No Windows usa icacls (negar
// leitura ao usuario atual); nos outros sistemas, chmod. Devolve false se
// nao deu para bloquear (ex.: rodando como administrador), e o teste e pulado.
function desbloquear(pasta) {
  try {
    if (process.platform === 'win32') {
      execFileSync('icacls', [pasta, '/remove:d', os.userInfo().username], { stdio: 'ignore' });
    } else {
      fs.chmodSync(pasta, 0o700);
    }
  } catch { /* melhor esforco */ }
}

function bloquear(pasta) {
  try {
    if (process.platform === 'win32') {
      execFileSync('icacls', [pasta, '/deny', `${os.userInfo().username}:(OI)(CI)(RD,X)`], { stdio: 'ignore' });
    } else {
      fs.chmodSync(pasta, 0o000);
    }
    fs.readdirSync(pasta); // se ainda consegue ler, o bloqueio nao valeu
    desbloquear(pasta);
    return false;
  } catch {
    return true;
  }
}

test('pasta sem permissao de leitura: estado de erro (nao "vazio")', (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-bloqueada-'));
  fs.writeFileSync(path.join(pasta, 'x.jsonl'), '{}\n');
  const bloqueou = bloquear(pasta);
  try {
    if (!bloqueou) { t.skip('nao foi possivel bloquear a pasta neste ambiente'); return; }
    const { estado, leitor } = carregarTudo(pasta, () => {});
    assert.equal(estado.tipo, 'erro');
    assert.match(estado.mensagem, /Não foi possível ler os logs/);
    assert.equal(leitor, null);
  } finally {
    desbloquear(pasta);
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
