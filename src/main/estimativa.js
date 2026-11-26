// Estimativa dos limites do plano a partir dos proprios logs.
//
// Por que existe: o percentual oficial so chega quando o Claude Code chama o
// script da linha de status COM o campo "rate_limits" (nem sempre acontece,
// ex.: no app desktop). Sem isso, a barra ficava parada numa leitura antiga.
//
// Como funciona: uma leitura (ex.: "61% quando a janela tinha 120 mil tokens")
// vira uma TAXA (% por token). A estimativa de agora e essa taxa vezes os
// tokens da janela ATUAL dos logs. A taxa vem da melhor leitura guardada
// (recente e com porcentagem alta o bastante para ser confiavel), e a janela
// e a de agora: uma leitura de uma janela que ja acabou nunca e mostrada como
// se fosse o valor de hoje. E uma ESTIMATIVA: nao ve o uso do claude.ai nem os
// pesos exatos de cada modelo; a proxima leitura oficial vence.
'use strict';
const { interpretarReinicio } = require('./limites.js');
const { listarBlocos } = require('./blocos.js');

const HORA_MS = 60 * 60 * 1000;
const JANELA_MS = { sessao: 5 * HORA_MS, semana: 7 * 24 * HORA_MS };
const IDADE_MINIMA_MS = 2 * 60 * 1000; // leitura mais nova que isso vale como esta
const PERCENTUAL_MINIMO_PARA_CALIBRAR = 10; // 1% sobre poucos tokens daria uma taxa instavel

// eventos: [{ ts (ms), tokens }] em ordem de horario.
function somarEntre(eventos, deExclusivo, ateInclusivo) {
  let soma = 0;
  for (const e of eventos) {
    if (e.ts > deExclusivo && e.ts <= ateInclusivo) soma += e.tokens;
  }
  return soma;
}

// Blocos de 5 h: a regra fica em blocos.js (tambem usada na lista da tela).
function blocoEm(eventos, instante) {
  return listarBlocos(eventos).find((b) => b.inicio <= instante && instante < b.fim) || null;
}

function mesmoBloco(eventos, instanteA, instanteB) {
  const a = blocoEm(eventos, instanteA);
  const b = blocoEm(eventos, instanteB);
  return Boolean(a && b && a.inicio === b.inicio);
}

function arredondar(valor) {
  return Math.round(valor * 10) / 10;
}

// Fim (reinicio) conhecido de uma leitura, em ms, ou null.
function reinicioDaLeitura(leitura) {
  if (leitura.reiniciaEm) return Date.parse(leitura.reiniciaEm);
  return interpretarReinicio(leitura.reinicia, Date.parse(leitura.lidoEm));
}

// Janela em que a leitura foi feita: { inicio, fim }. Com o reinicio conhecido
// e exata; sem ele, a sessao usa o bloco de 5 h e a semana os 7 dias anteriores.
function janelaDaLeitura(nome, leitura, eventos) {
  const instante = Date.parse(leitura.lidoEm);
  const fim = reinicioDaLeitura(leitura);
  if (fim) return { inicio: fim - JANELA_MS[nome], fim };
  if (nome === 'sessao') return blocoEm(eventos, instante);
  return { inicio: instante - JANELA_MS.semana, fim: null };
}

// Janela em que estamos agora.
function janelaDeAgora(nome, leituraBase, eventos, agora) {
  const fimBase = reinicioDaLeitura(leituraBase);
  if (nome === 'semana') {
    if (!fimBase) return { inicio: agora - JANELA_MS.semana, fim: null }; // 7 dias corridos
    // A semana reinicia sempre no mesmo dia e horario: anda de 7 em 7 dias.
    let fim = fimBase;
    while (fim <= agora) fim += JANELA_MS.semana;
    return { inicio: fim - JANELA_MS.semana, fim };
  }
  return blocoEm(eventos, agora); // sessao: o bloco de 5 h em andamento (ou null)
}

// % por token da leitura. null = nao da para calibrar.
function taxaDaLeitura(nome, leitura, eventos) {
  const janela = janelaDaLeitura(nome, leitura, eventos);
  if (!janela) return null;
  const gasto = somarEntre(eventos, janela.inicio - 1, Date.parse(leitura.lidoEm));
  return gasto > 0 ? leitura.percentual / gasto : null;
}

// Melhor leitura para calibrar: a mais recente com porcentagem alta o bastante.
function escolherCalibracao(nome, candidatas, eventos) {
  const boas = candidatas
    .filter((c) => c.nome === nome && c.percentual >= PERCENTUAL_MINIMO_PARA_CALIBRAR)
    .sort((a, b) => Date.parse(b.lidoEm) - Date.parse(a.lidoEm));
  for (const leitura of boas) {
    const taxa = taxaDaLeitura(nome, leitura, eventos);
    if (taxa) return { leitura, taxa };
  }
  return null;
}

// Recebe o resultado de combinarLimites e, quando a leitura exibida e velha ou
// de uma janela que ja acabou, troca por uma estimativa da janela de agora.
// "calibracoes" = todas as leituras guardadas: [{ nome, percentual, lidoEm, reinicia?, reiniciaEm? }].
function aplicarEstimativa(limites, eventos, calibracoes = [], agora = new Date()) {
  const resultado = { ...limites };
  const agoraMs = agora.getTime();

  for (const nome of ['sessao', 'semana']) {
    const atual = limites[nome];
    if (atual && !atual.expirado && atual.lidoEm && agoraMs - Date.parse(atual.lidoEm) < IDADE_MINIMA_MS) continue;

    // O que esta na tela ainda vale (mesma janela)? Entao so soma o que veio depois.
    const mesmaJanela =
      atual && !atual.expirado && atual.lidoEm &&
      (nome === 'semana' || reinicioDaLeitura(atual) !== null || mesmoBloco(eventos, Date.parse(atual.lidoEm), agoraMs));

    const candidatas = atual && atual.lidoEm ? [...calibracoes, { nome, ...atual }] : calibracoes;
    const calibracao = escolherCalibracao(nome, candidatas, eventos);
    if (!calibracao) continue; // sem calibracao confiavel, nao inventa numero

    let estimado;
    let fimDaJanela = null;
    if (mesmaJanela) {
      const novos = somarEntre(eventos, Date.parse(atual.lidoEm), agoraMs);
      estimado = atual.percentual + calibracao.taxa * novos;
      const fim = reinicioDaLeitura(atual);
      if (fim) fimDaJanela = fim;
    } else {
      const janela = janelaDeAgora(nome, calibracao.leitura, eventos, agoraMs);
      estimado = janela ? calibracao.taxa * somarEntre(eventos, janela.inicio - 1, agoraMs) : 0;
      if (janela && janela.fim) fimDaJanela = janela.fim;
    }

    resultado[nome] = {
      percentual: Math.min(100, arredondar(estimado)),
      reinicia: null,
      reiniciaEm: fimDaJanela ? new Date(fimDaJanela).toISOString() : null,
      origem: 'estimado',
      baseadoEm: { percentual: calibracao.leitura.percentual, lidoEm: calibracao.leitura.lidoEm },
      lidoEm: agora.toISOString(),
    };
  }
  return resultado;
}

module.exports = { aplicarEstimativa, listarBlocos };
