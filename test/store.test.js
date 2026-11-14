'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarStore } = require('../src/main/store.js');

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-store-'));
}

test('sem arquivo ainda: nada lido e alerta padrao 80/95', () => {
  const pasta = pastaTemporaria();
  const limites = criarStore(pasta).obterLimites();
  assert.deepEqual(limites, { sessao: null, semana: null, alerta: { atencao: 80, critico: 95 } });
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('guarda a leitura e devolve a mais recente de cada bloco, com o horario', () => {
  const pasta = pastaTemporaria();
  const store = criarStore(pasta);

  store.adicionarLeitura(
    { sessao: { percentual: 36, reinicia: 'sáb., 00:30' }, semana: { percentual: 66, reinicia: 'domingo, 04:00' } },
    new Date('2026-11-13T21:00:00.000Z'),
  );
  // Segunda leitura so com a sessao: a semana continua sendo a anterior.
  const limites = store.adicionarLeitura(
    { sessao: { percentual: 50, reinicia: 'sáb., 00:30' } },
    new Date('2026-11-13T22:00:00.000Z'),
  );

  assert.deepEqual(limites.sessao, { percentual: 50, reinicia: 'sáb., 00:30', lidoEm: '2026-11-13T22:00:00.000Z' });
  assert.deepEqual(limites.semana, { percentual: 66, reinicia: 'domingo, 04:00', lidoEm: '2026-11-13T21:00:00.000Z' });

  // O historico fica no arquivo, e uma nova instancia le o mesmo resultado.
  const arquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'limites.json'), 'utf8'));
  assert.equal(arquivo.leituras.length, 2);
  assert.deepEqual(criarStore(pasta).obterLimites(), limites);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('respeita o alerta editado a mao no arquivo', () => {
  const pasta = pastaTemporaria();
  fs.writeFileSync(path.join(pasta, 'limites.json'), JSON.stringify({ alerta: { atencao: 70 }, leituras: [] }));
  assert.deepEqual(criarStore(pasta).obterLimites().alerta, { atencao: 70, critico: 95 });
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('arquivo corrompido nao quebra o app: comeca do zero', () => {
  const pasta = pastaTemporaria();
  fs.writeFileSync(path.join(pasta, 'limites.json'), '{ isto nao e json');
  const store = criarStore(pasta);
  assert.equal(store.obterLimites().sessao, null);
  const limites = store.adicionarLeitura({ semana: { percentual: 10, reinicia: null } });
  assert.equal(limites.semana.percentual, 10);
  fs.rmSync(pasta, { recursive: true, force: true });
});
