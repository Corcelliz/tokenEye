// Abre o app com dados ficticios, espera a tela desenhar, salva um PNG em
// docs/screenshots/dashboard.png e fecha sozinho. Nunca usa dados reais.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronPath = require('electron');

const pastaFixtures = path.join(__dirname, '..', 'fixtures', 'logs-exemplo');
const pastaDadosFixtures = path.join(__dirname, '..', 'fixtures', 'limites-exemplo');
const raizProjeto = path.join(__dirname, '..');
const destinoEsperado = path.join(__dirname, '..', 'docs', 'screenshots', 'dashboard.png');
const TEMPO_LIMITE_MS = 20000;

const processo = spawn(electronPath, [raizProjeto], {
  env: {
    ...process.env,
    DASHBOARD_TOKENS_MODO: 'screenshot',
    DASHBOARD_TOKENS_PASTA_LOGS: pastaFixtures,
    DASHBOARD_TOKENS_PASTA_DADOS: pastaDadosFixtures,
  },
  stdio: 'inherit',
});

const temporizador = setTimeout(() => {
  console.error('screenshot: tempo limite atingido. Encerrando o processo.');
  processo.kill();
  process.exitCode = 1;
}, TEMPO_LIMITE_MS);

processo.on('exit', (codigo) => {
  clearTimeout(temporizador);
  if (codigo === 0 && fs.existsSync(destinoEsperado)) {
    const tamanho = fs.statSync(destinoEsperado).size;
    console.log(`screenshot: salvo em ${destinoEsperado} (${tamanho} bytes).`);
    process.exitCode = 0;
  } else {
    console.error('screenshot: falhou (codigo', codigo, '), PNG nao encontrado em', destinoEsperado);
    process.exitCode = 1;
  }
});
