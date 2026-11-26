// Processo principal: cria a janela, le os logs na abertura, observa a
// pasta para o modo "ao vivo" e manda os resumos (so numeros agregados,
// nunca texto de conversa) para a tela via IPC.
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chokidar = require('chokidar');

const { carregarTudo: carregarLogsIniciais } = require('./carregamento.js');
const { parseLinha } = require('./parser.js');
const { criarAgregador } = require('./aggregate.js');
const { criarStore } = require('./store.js');
const { extrairLimitesDoTexto, validarCampos } = require('./limites.js');
const { aplicarEstimativa } = require('./estimativa.js');
const { montarLinhaDoTempo } = require('./historico.js');
const { protegido } = require('./seguro.js');
const { NOME_ARQUIVO: ARQUIVO_LIMITES_AUTO, lerLimitesAuto, combinarLimites } = require('./limitesAuto.js');

// Variaveis de ambiente usadas pelos scripts de smoke test e screenshot
// (nunca em uso normal): trocam a pasta de logs e a pasta de dados por
// fixtures ficticias e dizem ao app para se fechar sozinho depois de carregar.
const PASTA_LOGS = process.env.DASHBOARD_TOKENS_PASTA_LOGS || path.join(os.homedir(), '.claude', 'projects');
const PASTA_DADOS = process.env.DASHBOARD_TOKENS_PASTA_DADOS || app.getPath('userData');
const MODO_TESTE = process.env.DASHBOARD_TOKENS_MODO || null; // 'smoke' | 'screenshot'

// Leituras manuais dos limites do plano (ver store.js e limites.js).
const store = criarStore(PASTA_DADOS);

const INTERVALO_ENVIO_MS = 500; // nunca manda atualizacao mais de 2x por segundo
const INTERVALO_VARREDURA_MS = 60 * 1000; // a cada minuto, confere os logs de novo

// Nos modos de teste automatico (smoke/screenshot), desliga a aceleracao de
// hardware: evita falhas intermitentes do compositor de video do Electron
// (erro "UnknownVizError"/"display surface not available") quando a janela
// e criada e capturada sem ninguem olhando.
if (MODO_TESTE) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

let janelaPrincipal = null;
let leitor = null;
let agregador = criarAgregador();
let estadoAtual = { tipo: 'carregando', mensagem: null };
let observador = null;
let observadorDados = null;
let timerEnvio = null;
let timerEnvioLimites = null;
let timerVarredura = null;

function processarLinhas(linhas) {
  for (const linha of linhas) {
    const resultado = parseLinha(linha);
    if (resultado.ok) agregador.adicionarRegistro(resultado.registro);
    else agregador.registrarLinhaIgnorada();
  }
}

// Le todos os logs existentes, uma vez, na abertura do app (ver carregamento.js).
function carregarTudo() {
  const resultado = carregarLogsIniciais(PASTA_LOGS, processarLinhas);
  estadoAtual = resultado.estado;
  leitor = resultado.leitor;
}

function montarResposta() {
  return {
    estado: estadoAtual,
    resumo: agregador.obterResumo(),
  };
}

function enviarResumoParaTela() {
  if (janelaPrincipal && !janelaPrincipal.isDestroyed()) {
    janelaPrincipal.webContents.send('tokens:update', montarResposta());
  }
}

function agendarEnvioAoVivo() {
  if (timerEnvio) return; // ja tem um envio agendado, nao precisa de outro
  timerEnvio = setTimeout(() => {
    timerEnvio = null;
    enviarResumoParaTela();
  }, INTERVALO_ENVIO_MS);
}

// Limites do plano: a leitura automatica (gravada pelo script da linha de
// status do Claude Code) junto com a manual; vale a mais recente.
// Quando a ultima leitura ja ficou velha, a barra e atualizada por uma
// estimativa feita com os tokens dos logs (ver estimativa.js).
function montarLimites() {
  const auto = lerLimitesAuto(PASTA_DADOS);
  const combinados = combinarLimites(store.obterLimites(), auto);

  // Leituras para calibrar a estimativa: o historico manual mais a automatica.
  const calibracoes = store.listarLeituras();
  for (const nome of ['sessao', 'semana']) {
    if (auto && auto[nome]) {
      calibracoes.push({ nome, percentual: auto[nome].percentual, reiniciaEm: auto[nome].reiniciaEm, lidoEm: auto[nome].atualizadoEm || auto.atualizadoEm });
    }
  }
  const limites = aplicarEstimativa(combinados, agregador.obterEventos(), calibracoes);
  // Linha do tempo: o historico de leituras manuais gravado em limites.json.
  limites.historico = montarLinhaDoTempo(store.listarLeituras());
  return limites;
}

function enviarLimitesParaTela() {
  if (janelaPrincipal && !janelaPrincipal.isDestroyed()) {
    janelaPrincipal.webContents.send('limites:update', montarLimites());
  }
}

function agendarEnvioLimites() {
  if (timerEnvioLimites) return;
  timerEnvioLimites = setTimeout(() => {
    timerEnvioLimites = null;
    enviarLimitesParaTela();
  }, INTERVALO_ENVIO_MS);
}

// Observa a pasta de dados do app: quando o script da linha de status grava
// um limites-auto.json novo, a barra de limites atualiza sozinha.
function iniciarObservadorDeLimites() {
  try {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    observadorDados = chokidar.watch(PASTA_DADOS, { ignoreInitial: true, depth: 0 });
    const aoMudar = (caminhoArquivo) => {
      if (path.basename(caminhoArquivo) === ARQUIVO_LIMITES_AUTO) agendarEnvioLimites();
    };
    observadorDados.on('add', aoMudar);
    observadorDados.on('change', aoMudar);
  } catch (erro) {
    // Sem observador, a varredura de 1 minuto ainda atualiza os limites.
    console.error('Nao foi possivel observar a pasta de dados:', erro.message);
  }
}

// Rede de seguranca do modo "ao vivo": o observador de pastas do Windows
// pode parar de avisar (ex.: depois que o PC suspende). A cada minuto, este
// timer varre todos os logs por conta propria, le so o que foi acrescentado
// (o leitor guarda o offset de cada arquivo) e manda o resumo para a tela,
// mesmo que nada tenha mudado: assim o horario "atualizado as" se renova e
// o "hoje" vira sozinho na virada do dia.
function iniciarVarreduraPeriodica() {
  if (estadoAtual.tipo !== 'pronto') return;
  // protegido(): um erro numa varredura nao derruba o app; a proxima tenta de novo.
  timerVarredura = setInterval(protegido(() => {
    for (const arquivo of leitor.listarArquivos()) {
      processarLinhas(leitor.lerNovidades(arquivo).linhas);
    }
    enviarResumoParaTela();
    // Tambem reenvia os limites: cobre o observador falhar e faz a barra
    // perceber sozinha quando a janela de 5 h ou da semana reinicia.
    enviarLimitesParaTela();
  }, 'varredura periodica'), INTERVALO_VARREDURA_MS);
}

// Comeca a observar a pasta de logs; quando um arquivo .jsonl muda, le so
// o que foi acrescentado e agenda o envio do novo resumo para a tela.
function iniciarObservador() {
  if (estadoAtual.tipo !== 'pronto') return;
  // Observa a pasta inteira (nao um padrao glob): no Windows, as barras
  // invertidas do caminho atrapalham o casamento de padroes glob do
  // chokidar. Filtra por .jsonl aqui dentro, no evento.
  observador = chokidar.watch(PASTA_LOGS, { ignoreInitial: true });
  const aoMudar = protegido((caminhoArquivo) => {
    if (!caminhoArquivo.endsWith('.jsonl')) return;
    processarLinhas(leitor.lerNovidades(caminhoArquivo).linhas);
    agendarEnvioAoVivo();
    agendarEnvioLimites(); // tokens novos mexem na estimativa dos limites
  }, 'observador de logs');
  observador.on('add', aoMudar);
  observador.on('change', aoMudar);
}

function criarJanela() {
  janelaPrincipal = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#161b26',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  janelaPrincipal.removeMenu();

  // Seguranca: nunca navegar para fora do app nem abrir janelas novas.
  janelaPrincipal.webContents.on('will-navigate', (evento) => evento.preventDefault());
  janelaPrincipal.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  janelaPrincipal.webContents.on('did-fail-load', (_evento, codigoErro, descricao) => {
    console.error('Falha ao carregar a janela:', codigoErro, descricao);
    if (MODO_TESTE === 'smoke') app.exit(1);
  });

  janelaPrincipal.webContents.on('did-finish-load', () => {
    if (MODO_TESTE === 'smoke') {
      setTimeout(() => app.exit(0), 1200);
    } else if (MODO_TESTE === 'screenshot') {
      setTimeout(capturarTela, 1000);
    }
  });

  janelaPrincipal.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

async function capturarTela() {
  try {
    // Estica a janela ate caber a pagina inteira (a pagina rola), para a
    // captura mostrar todos os cartoes.
    const alturaPagina = await janelaPrincipal.webContents.executeJavaScript('document.documentElement.scrollHeight');
    janelaPrincipal.setContentSize(1100, Math.min(Math.max(alturaPagina, 720), 4000));
    await new Promise((resolver) => setTimeout(resolver, 400));
    const imagem = await janelaPrincipal.webContents.capturePage();
    const pastaDestino = path.join(__dirname, '..', '..', 'docs', 'screenshots');
    fs.mkdirSync(pastaDestino, { recursive: true });
    const destino = path.join(pastaDestino, 'dashboard.png');
    fs.writeFileSync(destino, imagem.toPNG());
    console.log('Captura salva em:', destino);
    app.exit(0);
  } catch (erro) {
    console.error('Falha ao capturar a tela:', erro.message);
    app.exit(1);
  }
}

ipcMain.handle('tokens:getSummary', () => montarResposta());

ipcMain.handle('limites:obter', () => montarLimites());

// Recebe da tela { texto } (colado do claude.ai) ou { campos } (digitados).
// A validacao fica aqui, no processo principal, e nao na tela: e ele quem
// grava o arquivo, entao ele confere tudo antes.
ipcMain.handle('limites:adicionar', (_evento, entrada) => {
  let resultado;
  if (entrada && typeof entrada.texto === 'string') {
    resultado = extrairLimitesDoTexto(entrada.texto);
  } else if (entrada && entrada.campos) {
    resultado = validarCampos(entrada.campos);
  } else {
    resultado = { ok: false, motivo: 'Nada foi enviado.' };
  }
  if (!resultado.ok) return resultado;

  try {
    store.adicionarLeitura(resultado.leitura);
    return { ok: true, limites: montarLimites() };
  } catch (erro) {
    return { ok: false, motivo: 'Não foi possível salvar a leitura: ' + erro.message };
  }
});

app.whenReady().then(() => {
  carregarTudo();
  criarJanela();
  iniciarObservador();
  iniciarObservadorDeLimites();
  iniciarVarreduraPeriodica();
});

app.on('window-all-closed', () => {
  if (observador) observador.close();
  if (observadorDados) observadorDados.close();
  if (timerVarredura) clearInterval(timerVarredura);
  app.quit();
});
