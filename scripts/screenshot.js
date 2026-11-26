// Abre o app com dados ficticios, espera a tela desenhar, salva um PNG em
// docs/screenshots/dashboard.png e fecha sozinho. Nunca usa dados reais.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronPath = require('electron');

const pastaFixtures = path.join(__dirname, '..', 'fixtures', 'logs-exemplo');
const os = require('os');
const pastaDadosOriginal = path.join(__dirname, '..', 'fixtures', 'limites-exemplo');
// A linha do tempo mostra os ultimos 14 dias; por isso o historico ficticio
// e gerado com datas relativas a hoje numa pasta temporaria (a fixture fica intacta).
const pastaDadosFixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-tokens-screenshot-'));
fs.copyFileSync(path.join(pastaDadosOriginal, 'limites-auto.json'), path.join(pastaDadosFixtures, 'limites-auto.json'));
const atras = (horas) => new Date(Date.now() - horas * 3600 * 1000).toISOString();
fs.writeFileSync(path.join(pastaDadosFixtures, 'limites.json'), JSON.stringify({
  versao: 1,
  alerta: { atencao: 80, critico: 95 },
  leituras: [
    { lidoEm: atras(300), semana: { percentual: 12, reinicia: 'domingo, 04:00' }, sessao: { percentual: 20, reinicia: 'sáb., 00:30' } },
    { lidoEm: atras(240), semana: { percentual: 31, reinicia: 'domingo, 04:00' } },
    { lidoEm: atras(170), semana: { percentual: 52, reinicia: 'domingo, 04:00' }, sessao: { percentual: 61, reinicia: 'sáb., 00:30' } },
    { lidoEm: atras(120), semana: { percentual: 6, reinicia: 'domingo, 04:00' } },
    { lidoEm: atras(60), semana: { percentual: 38, reinicia: 'domingo, 04:00' }, sessao: { percentual: 45, reinicia: 'sáb., 00:30' } },
    { lidoEm: atras(8), semana: { percentual: 84, reinicia: 'domingo, 04:00' }, sessao: { percentual: 36, reinicia: 'sáb., 00:30' } },
  ],
}, null, 2));
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
  fs.rmSync(pastaDadosFixtures, { recursive: true, force: true });
  if (codigo === 0 && fs.existsSync(destinoEsperado)) {
    const tamanho = fs.statSync(destinoEsperado).size;
    console.log(`screenshot: salvo em ${destinoEsperado} (${tamanho} bytes).`);
    process.exitCode = 0;
  } else {
    console.error('screenshot: falhou (codigo', codigo, '), PNG nao encontrado em', destinoEsperado);
    process.exitCode = 1;
  }
});
