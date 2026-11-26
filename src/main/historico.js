// Linha do tempo dos limites: transforma o historico de leituras gravado em
// limites.json (cada vez que voce cola ou digita um percentual) numa serie de
// pontos {instante, percentual} para a tela desenhar. Sao leituras MANUAIS: o
// grafico mostra quando voce olhou, nao um registro continuo.
'use strict';

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_NA_LINHA_DO_TEMPO = 14;
const MAXIMO_PONTOS_POR_SERIE = 200;

// leituras: [{ nome: 'sessao'|'semana', percentual, lidoEm }] (store.listarLeituras()).
// Devolve { inicio, fim, series: { sessao: [{ em, percentual }], semana: [...] } },
// so com pontos dentro da janela, em ordem de horario e com percentual valido.
function montarLinhaDoTempo(leituras, agora = new Date(), dias = DIAS_NA_LINHA_DO_TEMPO) {
  const fim = agora.getTime();
  const inicio = fim - dias * DIA_MS;
  const series = { sessao: [], semana: [] };

  for (const leitura of leituras || []) {
    if (!series[leitura.nome]) continue;
    const instante = Date.parse(leitura.lidoEm);
    const percentual = Number(leitura.percentual);
    if (!Number.isFinite(instante) || !Number.isFinite(percentual)) continue;
    if (instante < inicio || instante > fim) continue;
    series[leitura.nome].push({ instante, percentual: Math.min(100, Math.max(0, percentual)) });
  }

  for (const nome of Object.keys(series)) {
    series[nome].sort((a, b) => a.instante - b.instante);
    series[nome] = series[nome]
      .slice(-MAXIMO_PONTOS_POR_SERIE)
      .map((p) => ({ em: new Date(p.instante).toISOString(), percentual: p.percentual }));
  }

  return { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), series };
}

module.exports = { DIAS_NA_LINHA_DO_TEMPO, montarLinhaDoTempo };
