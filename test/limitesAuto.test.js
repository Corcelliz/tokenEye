'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  extrairRateLimits,
  textoLinhaDeStatus,
  gravarLimitesAuto,
  lerLimitesAuto,
  combinarLimites,
} = require('../src/main/limitesAuto.js');

// Parecido com o que o Claude Code manda para a linha de status (ficticio).
// Tem outros campos de proposito: o script deve ignorar todos eles.
const ENTRADA_EXEMPLO = {
  session_id: 'sessao-ficticia',
  cwd: 'C:\\Users\\exemplo\\projetos\\estudo',
  model: { id: 'claude-opus-5-5', display_name: 'Opus' },
  context_window: { used_percentage: 12 },
  rate_limits: {
    five_hour: { used_percentage: 36, resets_at: 1767580200 }, // 2026-01-05T02:30:00Z
    seven_day: { used_percentage: 66.4, resets_at: 1767938400 }, // 2026-01-09T06:00:00Z
  },
};

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-auto-'));
}

test('extrairRateLimits pega so sessao e semana, com o reinicio em data ISO', () => {
  assert.deepEqual(extrairRateLimits(ENTRADA_EXEMPLO), {
    sessao: { percentual: 36, reiniciaEm: '2026-01-05T02:30:00.000Z' },
    semana: { percentual: 66.4, reiniciaEm: '2026-01-09T06:00:00.000Z' },
  });
});

test('extrairRateLimits devolve null sem rate_limits e aceita so um dos blocos', () => {
  assert.equal(extrairRateLimits({ model: {} }), null);
  assert.equal(extrairRateLimits(null), null);
  assert.equal(extrairRateLimits({ rate_limits: { five_hour: { used_percentage: 'x' } } }), null);
  assert.deepEqual(extrairRateLimits({ rate_limits: { seven_day: { used_percentage: 10 } } }), {
    sessao: null,
    semana: { percentual: 10, reiniciaEm: null },
  });
});

test('textoLinhaDeStatus arredonda e junta os blocos', () => {
  assert.equal(textoLinhaDeStatus(extrairRateLimits(ENTRADA_EXEMPLO)), 'sessão 36% · semana 66%');
  assert.equal(textoLinhaDeStatus({ sessao: null, semana: { percentual: 80 } }), 'semana 80%');
  assert.equal(textoLinhaDeStatus(null), '');
});

test('gravar e ler limites-auto.json; arquivo ausente ou quebrado vira null', () => {
  const pasta = pastaTemporaria();
  assert.equal(lerLimitesAuto(pasta), null);

  gravarLimitesAuto(pasta, extrairRateLimits(ENTRADA_EXEMPLO), new Date('2026-01-04T22:00:00.000Z'));
  assert.deepEqual(lerLimitesAuto(pasta), {
    atualizadoEm: '2026-01-04T22:00:00.000Z',
    sessao: { percentual: 36, reiniciaEm: '2026-01-05T02:30:00.000Z', atualizadoEm: '2026-01-04T22:00:00.000Z' },
    semana: { percentual: 66.4, reiniciaEm: '2026-01-09T06:00:00.000Z', atualizadoEm: '2026-01-04T22:00:00.000Z' },
  });
  // Nenhum dado extra da sessao foi gravado (cwd, modelo, id...).
  const bruto = fs.readFileSync(path.join(pasta, 'limites-auto.json'), 'utf8');
  assert.ok(!bruto.includes('exemplo') && !bruto.includes('sessao-ficticia'));

  fs.writeFileSync(path.join(pasta, 'limites-auto.json'), '{ quebrado');
  assert.equal(lerLimitesAuto(pasta), null);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('se chegar so a sessao, a semana guarda o ultimo valor conhecido com o horario dela', () => {
  const pasta = pastaTemporaria();
  gravarLimitesAuto(pasta, extrairRateLimits(ENTRADA_EXEMPLO), new Date('2026-01-04T22:00:00.000Z'));
  gravarLimitesAuto(pasta, { sessao: { percentual: 40, reiniciaEm: null }, semana: null }, new Date('2026-01-04T22:30:00.000Z'));

  const lido = lerLimitesAuto(pasta);
  assert.equal(lido.sessao.percentual, 40);
  assert.equal(lido.sessao.atualizadoEm, '2026-01-04T22:30:00.000Z');
  assert.equal(lido.semana.percentual, 66.4);
  assert.equal(lido.semana.atualizadoEm, '2026-01-04T22:00:00.000Z'); // horario da leitura anterior

  const limites = combinarLimites({ alerta: {}, sessao: null, semana: null }, lido, new Date('2026-01-04T23:00:00.000Z'));
  assert.equal(limites.semana.lidoEm, '2026-01-04T22:00:00.000Z');
  assert.equal(limites.semana.atualizadoEm, undefined); // a tela usa so "lidoEm"
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('combinarLimites usa a leitura mais recente de cada bloco e marca a origem', () => {
  const manual = {
    alerta: { atencao: 80, critico: 95 },
    sessao: { percentual: 50, reinicia: 'sáb., 00:30', lidoEm: '2026-01-04T23:00:00.000Z' },
    semana: { percentual: 60, reinicia: null, lidoEm: '2026-01-04T20:00:00.000Z' },
  };
  const auto = {
    atualizadoEm: '2026-01-04T22:00:00.000Z',
    sessao: { percentual: 36, reiniciaEm: '2026-01-05T02:30:00.000Z' },
    semana: { percentual: 66, reiniciaEm: '2026-01-09T06:00:00.000Z' },
  };
  const agora = new Date('2026-01-04T23:30:00.000Z');
  const limites = combinarLimites(manual, auto, agora);

  assert.equal(limites.sessao.origem, 'manual'); // manual das 23:00 e mais nova que o auto das 22:00
  assert.equal(limites.sessao.percentual, 50);
  assert.equal(limites.semana.origem, 'automatico');
  assert.equal(limites.semana.percentual, 66);
  assert.equal(limites.semana.lidoEm, '2026-01-04T22:00:00.000Z');
  assert.deepEqual(limites.alerta, { atencao: 80, critico: 95 });
});

test('combinarLimites marca como expirado quando a janela ja reiniciou', () => {
  const manual = { alerta: { atencao: 80, critico: 95 }, sessao: null, semana: null };
  const auto = { atualizadoEm: '2026-01-04T22:00:00.000Z', sessao: { percentual: 90, reiniciaEm: '2026-01-05T02:30:00.000Z' }, semana: null };
  const depoisDoReinicio = combinarLimites(manual, auto, new Date('2026-01-05T03:00:00.000Z'));
  assert.equal(depoisDoReinicio.sessao.expirado, true);
  assert.equal(depoisDoReinicio.semana, null);
  const antes = combinarLimites(manual, auto, new Date('2026-01-05T01:00:00.000Z'));
  assert.equal(antes.sessao.expirado, undefined);
  assert.deepEqual(combinarLimites(manual, null).sessao, null);
});

test('o script da linha de status grava o arquivo e imprime a linha (de ponta a ponta)', () => {
  const pasta = pastaTemporaria();
  const script = path.join(__dirname, '..', 'scripts', 'statusline.js');
  const env = { ...process.env, DASHBOARD_TOKENS_PASTA_DADOS: pasta };

  const certo = spawnSync(process.execPath, [script], { input: JSON.stringify(ENTRADA_EXEMPLO), env, encoding: 'utf8', timeout: 10000 });
  assert.equal(certo.status, 0);
  assert.equal(certo.stdout, 'sessão 36% · semana 66%');
  assert.equal(lerLimitesAuto(pasta).sessao.percentual, 36);

  // Entrada quebrada: nao imprime nada, nao falha e nao apaga o arquivo bom.
  const quebrado = spawnSync(process.execPath, [script], { input: 'isto nao e json', env, encoding: 'utf8', timeout: 10000 });
  assert.equal(quebrado.status, 0);
  assert.equal(quebrado.stdout, '');
  assert.equal(lerLimitesAuto(pasta).sessao.percentual, 36);

  fs.rmSync(pasta, { recursive: true, force: true });
});

test('registrarChamada guarda so os nomes dos campos, nunca os valores', () => {
  const pasta = pastaTemporaria();
  const { registrarChamada } = require('../src/main/limitesAuto.js');
  registrarChamada(pasta, ENTRADA_EXEMPLO, true, new Date('2026-01-05T00:00:00Z'));
  const texto = fs.readFileSync(path.join(pasta, 'statusline-ultima-chamada.json'), 'utf8');
  const salvo = JSON.parse(texto);
  assert.equal(salvo.trouxeLimites, true);
  assert.ok(salvo.campos.includes('rate_limits'));
  assert.ok(!texto.includes('exemplo'), 'nao pode guardar a pasta nem a sessao');
});
