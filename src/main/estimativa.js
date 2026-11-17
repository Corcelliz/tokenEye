// Estimativa dos limites do plano a partir dos proprios logs.
//
// Por que existe: o percentual oficial so chega quando o Claude Code chama o
// script da linha de status COM o campo "rate_limits" (nem sempre acontece,
// ex.: no app desktop). Sem isso, a barra ficava parada na ultima leitura.
//
// Ideia: a ultima leitura conhecida (manual ou automatica) diz "X% quando eu
// tinha gasto N tokens naquela janela". Daí sai uma taxa (% por token), e os
// tokens novos dos logs sao convertidos em % com essa mesma taxa. E uma
// ESTIMATIVA: nao ve o uso do claude.ai nem os pesos exatos de cada modelo,
// por isso a tela marca como "estimado" e a proxima leitura oficial vence.
'use strict';

const HORA_MS = 60 * 60 * 1000;
const JANELA_SESSAO_MS = 5 * HORA_MS;
const JANELA_SEMANA_MS = 7 * 24 * HORA_MS;
const IDADE_MINIMA_MS = 2 * 60 * 1000; // leitura mais nova que isso vale como esta

// eventos: [{ ts (ms), tokens }] em ordem de horario.
function somarEntre(eventos, deExclusivo, ateInclusivo) {
  let soma = 0;
  for (const e of eventos) {
    if (e.ts > deExclusivo && e.ts <= ateInclusivo) soma += e.tokens;
  }
  return soma;
}

// Blocos de 5 h: o bloco comeca na primeira mensagem depois que o anterior
// acabou (arredondada para a hora cheia) e dura 5 h.
function listarBlocos(eventos) {
  const blocos = [];
  let atual = null;
  for (const e of eventos) {
    if (!atual || e.ts >= atual.fim) {
      const inicio = Math.floor(e.ts / HORA_MS) * HORA_MS;
      atual = { inicio, fim: inicio + JANELA_SESSAO_MS };
      blocos.push(atual);
    }
  }
  return blocos;
}

function blocoEm(blocos, instante) {
  return blocos.find((b) => b.inicio <= instante && instante < b.fim) || null;
}

function arredondar(valor) {
  return Math.round(valor * 10) / 10;
}

function estimarSessao(eventos, leitura, agora) {
  const instanteLeitura = Date.parse(leitura.lidoEm);
  const blocos = listarBlocos(eventos);
  const blocoLeitura = blocoEm(blocos, instanteLeitura);
  if (!blocoLeitura) return null;
  const gastoNaLeitura = somarEntre(eventos, blocoLeitura.inicio - 1, instanteLeitura);
  if (gastoNaLeitura <= 0) return null;
  const taxa = leitura.percentual / gastoNaLeitura; // % por token

  const blocoAgora = blocoEm(blocos, agora);
  if (!blocoAgora) return 0; // o bloco acabou e ninguem usou o Claude Code depois
  const gastoAgora = somarEntre(eventos, blocoAgora.inicio - 1, agora);
  return Math.min(100, arredondar(taxa * gastoAgora));
}

function estimarSemana(eventos, leitura, agora) {
  const instanteLeitura = Date.parse(leitura.lidoEm);
  if (agora - instanteLeitura > JANELA_SEMANA_MS) return null; // leitura velha demais
  const gastoNaLeitura = somarEntre(eventos, instanteLeitura - JANELA_SEMANA_MS, instanteLeitura);
  if (gastoNaLeitura <= 0) return null;
  const taxa = leitura.percentual / gastoNaLeitura;
  const novo = somarEntre(eventos, instanteLeitura, agora);
  return Math.min(100, arredondar(leitura.percentual + taxa * novo));
}

const ESTIMADORES = { sessao: estimarSessao, semana: estimarSemana };

// Recebe o resultado de combinarLimites e troca cada leitura "velha" por uma
// estimativa. Leituras expiradas, ou recentes, ficam como estao.
function aplicarEstimativa(limites, eventos, agora = new Date()) {
  const resultado = { ...limites };
  const agoraMs = agora.getTime();
  for (const nome of ['sessao', 'semana']) {
    const leitura = limites[nome];
    if (!leitura || leitura.expirado || !leitura.lidoEm) continue;
    const idade = agoraMs - Date.parse(leitura.lidoEm);
    if (idade < IDADE_MINIMA_MS) continue;

    const estimado = ESTIMADORES[nome](eventos, leitura, agoraMs);
    if (estimado === null || estimado === undefined) continue;
    resultado[nome] = {
      ...leitura,
      percentual: estimado,
      origem: 'estimado',
      baseadoEm: { percentual: leitura.percentual, lidoEm: leitura.lidoEm, origem: leitura.origem },
      lidoEm: agora.toISOString(),
    };
  }
  return resultado;
}

module.exports = { aplicarEstimativa, listarBlocos, estimarSessao, estimarSemana };
