// Script da linha de status do Claude Code (configurado em "statusLine" no
// settings.json do Claude Code).
//
// O Claude Code roda este script e manda pela entrada padrao (stdin) um JSON
// com dados da sessao. Daqui so usamos "rate_limits": os percentuais oficiais
// da sessao de 5 h e da semana. Eles sao gravados em
// %APPDATA%\dashboard-tokens\limites-auto.json (o app le esse arquivo) e
// viram uma linha curta embaixo do Claude Code: "sessão 36% · semana 66%".
//
// Regra de ouro: este script NUNCA pode atrapalhar o Claude Code. Qualquer
// erro e engolido, e ele sempre termina rapido e com codigo 0.
'use strict';
const path = require('path');
const {
  extrairRateLimits,
  textoLinhaDeStatus,
  gravarLimitesAuto,
  registrarChamada,
  pastaDadosPadrao,
} = require(path.join(__dirname, '..', 'src', 'main', 'limitesAuto.js'));

const TEMPO_MAXIMO_MS = 2000; // se a entrada nao terminar ate aqui, desiste
const TAMANHO_MAXIMO_ENTRADA = 1000000;

let entrada = '';
let terminou = false;

function finalizar() {
  if (terminou) return;
  terminou = true;
  clearTimeout(temporizador);

  const pastaDados = process.env.DASHBOARD_TOKENS_PASTA_DADOS || pastaDadosPadrao();
  let dados = null;
  let leitura = null;
  try {
    dados = JSON.parse(entrada);
    leitura = extrairRateLimits(dados);
  } catch {
    leitura = null; // JSON quebrado ou vazio: so nao mostra nada
  }

  try {
    // Registro de "o Claude Code chamou o script" (so os NOMES dos campos que
    // chegaram, nunca os valores). Serve para descobrir por que a leitura
    // automatica nao aparece: o script nunca foi chamado, ou foi chamado sem
    // "rate_limits"?
    registrarChamada(pastaDados, dados, Boolean(leitura));
    if (leitura) gravarLimitesAuto(pastaDados, leitura);
  } catch {
    // Ex.: arquivo aberto pelo app no mesmo instante. Na proxima rodada grava.
  }

  process.stdout.write(textoLinhaDeStatus(leitura));
  process.exit(0);
}

const temporizador = setTimeout(finalizar, TEMPO_MAXIMO_MS);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (pedaco) => {
  entrada += pedaco;
  if (entrada.length > TAMANHO_MAXIMO_ENTRADA) finalizar();
});
process.stdin.on('end', finalizar);
process.stdin.on('error', finalizar);
