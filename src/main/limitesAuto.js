// Leitura AUTOMATICA dos limites do plano, vinda do proprio Claude Code.
//
// O Claude Code manda para o script da linha de status (scripts/statusline.js)
// um JSON com "rate_limits": os percentuais OFICIAIS da sessao de 5 h e da
// semana, que ele mesmo recebe da Anthropic. O script grava so esses numeros
// em limites-auto.json, na pasta de dados do app, e o app le esse arquivo.
//
// O app continua sem rede e sem credenciais: quem conversa com a Anthropic e
// o Claude Code, como ja faz normalmente.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { interpretarReinicio } = require('./limites.js');

const NOME_ARQUIVO = 'limites-auto.json';
const NOME_ARQUIVO_CHAMADA = 'statusline-ultima-chamada.json';

// A mesma pasta que o Electron usa como "userData" deste app
// (%APPDATA%\dashboard-tokens no Windows). O script da linha de status roda
// fora do Electron, entao calcula o caminho por conta propria.
function pastaDadosPadrao() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'dashboard-tokens');
}

// { used_percentage: 36, resets_at: 1763000000 } -> { percentual, reiniciaEm }
// resets_at vem em segundos desde 1970 (Unix epoch); o Date do JavaScript
// trabalha em milissegundos, por isso o "* 1000".
function lerJanela(janela) {
  if (!janela || typeof janela !== 'object') return null;
  const percentual = Number(janela.used_percentage);
  if (!Number.isFinite(percentual) || percentual < 0) return null;
  const segundos = Number(janela.resets_at);
  const reiniciaEm = Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : null;
  return { percentual, reiniciaEm };
}

// Recebe o JSON inteiro que o Claude Code manda para a linha de status e
// devolve SO { sessao, semana } (o resto e ignorado). null = sem limites.
function extrairRateLimits(dados) {
  const limites = dados && dados.rate_limits;
  if (!limites || typeof limites !== 'object') return null;
  const sessao = lerJanela(limites.five_hour);
  const semana = lerJanela(limites.seven_day);
  if (!sessao && !semana) return null;
  return { sessao, semana };
}

// O texto que aparece na linha de status do Claude Code.
function textoLinhaDeStatus(leitura) {
  if (!leitura) return '';
  const partes = [];
  if (leitura.sessao) partes.push(`sessão ${Math.round(leitura.sessao.percentual)}%`);
  if (leitura.semana) partes.push(`semana ${Math.round(leitura.semana.percentual)}%`);
  return partes.join(' · ');
}

// Grava num arquivo temporario e troca pelo definitivo. O temporario leva o
// numero do processo (pid) no nome porque duas janelas do Claude Code podem
// rodar o script ao mesmo tempo.
//
// Cada bloco guarda o proprio horario. Se o Claude Code mandar so um dos
// blocos (ex.: so a sessao), o outro continua com o ultimo valor conhecido,
// em vez de sumir da tela.
function gravarLimitesAuto(pastaDados, leitura, agora = new Date()) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const destino = path.join(pastaDados, NOME_ARQUIVO);
  const anterior = lerLimitesAuto(pastaDados);
  const atualizadoEm = agora.toISOString();
  const bloco = (nome) => {
    if (leitura[nome]) return { ...leitura[nome], atualizadoEm };
    return anterior ? anterior[nome] : null;
  };
  const conteudo = { versao: 1, atualizadoEm, sessao: bloco('sessao'), semana: bloco('semana') };
  const temporario = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(conteudo, null, 2), 'utf8');
  fs.renameSync(temporario, destino);
}

// Anota que o Claude Code chamou o script da linha de status, e se a chamada
// trouxe "rate_limits". Guarda so os nomes dos campos recebidos, nunca os
// valores (a chamada tambem leva pasta, id da sessao etc.).
function registrarChamada(pastaDados, dados, trouxeLimites, agora = new Date()) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const destino = path.join(pastaDados, NOME_ARQUIVO_CHAMADA);
  const chaves = dados && typeof dados === 'object' ? Object.keys(dados).slice(0, 40) : [];
  const conteudo = { chamadoEm: agora.toISOString(), trouxeLimites: Boolean(trouxeLimites), campos: chaves };
  const temporario = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(conteudo, null, 2), 'utf8');
  fs.renameSync(temporario, destino);
}

function lerJanelaSalva(janela, atualizadoEmDoArquivo) {
  if (!janela || typeof janela !== 'object' || !Number.isFinite(janela.percentual)) return null;
  return {
    percentual: janela.percentual,
    reiniciaEm: typeof janela.reiniciaEm === 'string' ? janela.reiniciaEm : null,
    atualizadoEm: typeof janela.atualizadoEm === 'string' ? janela.atualizadoEm : atualizadoEmDoArquivo,
  };
}

// Le o arquivo gravado pelo script. Sem arquivo ou arquivo estranho -> null.
function lerLimitesAuto(pastaDados) {
  try {
    const dados = JSON.parse(fs.readFileSync(path.join(pastaDados, NOME_ARQUIVO), 'utf8'));
    if (!dados || typeof dados.atualizadoEm !== 'string') return null;
    return {
      atualizadoEm: dados.atualizadoEm,
      sessao: lerJanelaSalva(dados.sessao, dados.atualizadoEm),
      semana: lerJanelaSalva(dados.semana, dados.atualizadoEm),
    };
  } catch {
    return null;
  }
}

// Junta a leitura manual (store.js) com a automatica: para cada bloco vale a
// mais recente. Marca a origem (para o selo na tela) e se a janela ja
// reiniciou (o numero antigo nao vale mais ate o Claude Code mandar outro).
function combinarLimites(manual, auto, agora = new Date()) {
  const resultado = { alerta: manual.alerta };
  for (const nome of ['sessao', 'semana']) {
    // O texto colado diz "Reinicia sáb., 00:30": converte para um instante exato,
    // para o app saber quando essa leitura deixou de valer.
    let leituraManual = null;
    if (manual[nome]) {
      const instante = interpretarReinicio(manual[nome].reinicia, Date.parse(manual[nome].lidoEm));
      leituraManual = { ...manual[nome], reiniciaEm: instante ? new Date(instante).toISOString() : null, origem: 'manual' };
    }
    let leituraAuto = null;
    if (auto && auto[nome]) {
      const { atualizadoEm, ...valores } = auto[nome];
      leituraAuto = { ...valores, reinicia: null, lidoEm: atualizadoEm || auto.atualizadoEm, origem: 'automatico' };
    }

    let escolhida = leituraManual;
    // As datas estao no mesmo formato ISO, entao comparar como texto funciona.
    if (leituraAuto && (!leituraManual || leituraAuto.lidoEm >= leituraManual.lidoEm)) escolhida = leituraAuto;

    if (escolhida && escolhida.reiniciaEm && new Date(escolhida.reiniciaEm) <= agora) {
      escolhida = { ...escolhida, expirado: true };
    }
    resultado[nome] = escolhida;
  }
  return resultado;
}

module.exports = {
  NOME_ARQUIVO,
  pastaDadosPadrao,
  extrairRateLimits,
  textoLinhaDeStatus,
  gravarLimitesAuto,
  registrarChamada,
  lerLimitesAuto,
  combinarLimites,
};
