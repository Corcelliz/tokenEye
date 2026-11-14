// Smoke test: abre o app de verdade (com dados ficticios), confere que
// carregou sem erro, e fecha sozinho. Nunca deixa o terminal preso: se o
// app nao se fechar por conta propria, este script mata o processo depois
// de um tempo limite e reporta falha.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const pastaFixtures = path.join(__dirname, '..', 'fixtures', 'logs-exemplo');
const pastaDadosFixtures = path.join(__dirname, '..', 'fixtures', 'limites-exemplo');
const raizProjeto = path.join(__dirname, '..');
const TEMPO_LIMITE_MS = 15000;

const processo = spawn(electronPath, [raizProjeto], {
  env: {
    ...process.env,
    DASHBOARD_TOKENS_MODO: 'smoke',
    DASHBOARD_TOKENS_PASTA_LOGS: pastaFixtures,
    DASHBOARD_TOKENS_PASTA_DADOS: pastaDadosFixtures,
  },
  stdio: 'inherit',
});

const temporizador = setTimeout(() => {
  console.error('smoke: tempo limite atingido, o app nao fechou sozinho. Encerrando o processo.');
  processo.kill();
  process.exitCode = 1;
}, TEMPO_LIMITE_MS);

processo.on('exit', (codigo) => {
  clearTimeout(temporizador);
  if (codigo === 0) {
    console.log('smoke: app abriu, carregou a tela sem erro e fechou sozinho. OK.');
    process.exitCode = 0;
  } else {
    console.error('smoke: o app saiu com codigo', codigo, '(esperado: 0)');
    process.exitCode = 1;
  }
});
