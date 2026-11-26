// Blocos de 5 horas (ESTIMADOS a partir dos logs).
//
// O plano conta o uso em "sessoes" de 5 h. O app nao sabe o horario exato em
// que o claude.ai abre cada sessao, entao usa a regra aproximada: o bloco
// comeca na primeira mensagem depois que o anterior acabou (arredondada para
// a hora cheia) e dura 5 h. Por isso a tela mostra o selo "estimado".
// Aqui so entram horarios e numeros de tokens, nunca texto de conversa.
'use strict';

const HORA_MS = 60 * 60 * 1000;
const DURACAO_BLOCO_MS = 5 * HORA_MS;

// eventos: [{ ts (ms), tokens }] em ordem de horario.
// Devolve [{ inicio, fim }] (ms), do mais antigo para o mais novo.
function listarBlocos(eventos) {
  const blocos = [];
  let atual = null;
  for (const e of eventos) {
    if (!atual || e.ts >= atual.fim) {
      const inicio = Math.floor(e.ts / HORA_MS) * HORA_MS;
      atual = { inicio, fim: inicio + DURACAO_BLOCO_MS };
      blocos.push(atual);
    }
  }
  return blocos;
}

module.exports = { HORA_MS, DURACAO_BLOCO_MS, listarBlocos };
