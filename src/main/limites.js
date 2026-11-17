// Entrada manual dos limites do plano (sessao e semana).
//
// Os percentuais que o claude.ai mostra em Configuracoes -> Uso NAO estao
// nos logs locais, e o app nao pode busca-los sozinho (seria preciso entrar
// na conta). Por isso o usuario copia o texto da pagina e cola no app, e
// este modulo extrai os numeros. Tambem valida o caminho alternativo, quando
// os valores sao digitados campo a campo.
'use strict';

const TAMANHO_MAXIMO_TEXTO = 5000; // um texto colado maior que isso nao e a pagina de uso
const TAMANHO_MAXIMO_REINICIO = 60;

// Titulos de cada bloco na pagina (portugues e ingles, caso a interface
// esteja em outro idioma).
const TITULO_SESSAO = /sess[aã]o\s+atual|current\s+session/i;
const TITULO_SEMANA = /esta\s+semana|this\s+week|weekly\s+limits?/i;

// "36% usado", "36 % usado", "36%"
const PERCENTUAL = /(\d{1,3}(?:[.,]\d+)?)\s*%/;
// "Reinicia sáb., 00:30" -> "sáb., 00:30". Para antes de um percentual ou do
// fim da linha, caso a copia junte tudo numa linha so.
const REINICIO = /(?:reinicia|redefine|resets)\s+(.+?)(?=\s*\d{1,3}(?:[.,]\d+)?\s*%|\n|$)/i;

// Deixa o texto colado previsivel: espacos especiais viram espaco comum e
// acentos ficam numa forma unica (o mesmo "ã" pode chegar de dois jeitos).
function normalizarTexto(texto) {
  return texto.normalize('NFC').replace(/[  \t]/g, ' ').replace(/\r\n?/g, '\n');
}

function lerPercentual(valorTexto) {
  const numero = Number(String(valorTexto).replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) return null;
  return numero;
}

function lerBloco(textoDoBloco) {
  const achouPercentual = textoDoBloco.match(PERCENTUAL);
  if (!achouPercentual) return null;
  const percentual = lerPercentual(achouPercentual[1]);
  if (percentual === null) return null;

  const achouReinicio = textoDoBloco.match(REINICIO);
  const reinicia = achouReinicio ? achouReinicio[1].trim().slice(0, TAMANHO_MAXIMO_REINICIO) : null;
  return { percentual, reinicia };
}

// Recebe o texto copiado da pagina de uso do claude.ai.
// Devolve { ok: true, leitura: { sessao?, semana? } } ou { ok: false, motivo }.
function extrairLimitesDoTexto(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    return { ok: false, motivo: 'O texto está vazio.' };
  }
  if (texto.length > TAMANHO_MAXIMO_TEXTO) {
    return { ok: false, motivo: 'O texto é grande demais. Copie só o bloco de uso.' };
  }

  const limpo = normalizarTexto(texto);

  // Acha onde comeca cada bloco e corta o texto ate o inicio do proximo.
  const titulos = [];
  const posSessao = limpo.search(TITULO_SESSAO);
  const posSemana = limpo.search(TITULO_SEMANA);
  if (posSessao >= 0) titulos.push({ nome: 'sessao', inicio: posSessao });
  if (posSemana >= 0) titulos.push({ nome: 'semana', inicio: posSemana });
  titulos.sort((a, b) => a.inicio - b.inicio);

  const leitura = {};
  titulos.forEach((titulo, i) => {
    const fim = i + 1 < titulos.length ? titulos[i + 1].inicio : limpo.length;
    const bloco = lerBloco(limpo.slice(titulo.inicio, fim));
    if (bloco) leitura[titulo.nome] = bloco;
  });

  if (!leitura.sessao && !leitura.semana) {
    return {
      ok: false,
      motivo: 'Não encontrei "Sessão atual" nem "Esta semana" com uma porcentagem no texto.',
    };
  }
  return { ok: true, leitura };
}

// Caminho alternativo: valores digitados nos campos do formulario.
// Espera { sessao: { percentual, reinicia }, semana: { percentual, reinicia } },
// onde cada bloco pode ficar em branco.
function validarCampos(campos) {
  if (!campos || typeof campos !== 'object') {
    return { ok: false, motivo: 'Nenhum valor foi preenchido.' };
  }

  const leitura = {};
  for (const nome of ['sessao', 'semana']) {
    const bloco = campos[nome];
    if (!bloco || bloco.percentual === undefined || bloco.percentual === null || bloco.percentual === '') continue;

    const percentual = lerPercentual(bloco.percentual);
    if (percentual === null) {
      return { ok: false, motivo: 'A porcentagem precisa ser um número de 0 a 100.' };
    }
    const reinicia =
      typeof bloco.reinicia === 'string' && bloco.reinicia.trim() !== ''
        ? bloco.reinicia.trim().slice(0, TAMANHO_MAXIMO_REINICIO)
        : null;
    leitura[nome] = { percentual, reinicia };
  }

  if (!leitura.sessao && !leitura.semana) {
    return { ok: false, motivo: 'Preencha ao menos uma porcentagem.' };
  }
  return { ok: true, leitura };
}

module.exports = { extrairLimitesDoTexto, validarCampos };

// ----- Horario de reinicio do texto colado -----
// "sáb., 00:30", "domingo, 04:00", "amanhã, 00:28", "hoje, 23:30" ou
// "em 2 h 14 min" viram um instante (ms desde 1970), contado a partir de
// quando a leitura foi feita. Fuso de Sao Paulo (UTC-3, sem horario de verao).
// Se nao entender o texto, devolve null.
const DIAS_DA_SEMANA = [['dom', 0], ['seg', 1], ['ter', 2], ['qua', 3], ['qui', 4], ['sex', 5], ['sab', 6]];
const DESLOCAMENTO_SP_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

function interpretarReinicio(texto, lidoEmMs) {
  if (typeof texto !== 'string' || !Number.isFinite(lidoEmMs)) return null;
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const relativo = t.match(/\bem\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/);
  if (relativo && (relativo[1] || relativo[2])) {
    return lidoEmMs + ((Number(relativo[1]) || 0) * 60 + (Number(relativo[2]) || 0)) * 60 * 1000;
  }

  const horario = t.match(/(\d{1,2}):(\d{2})/);
  if (!horario) return null;
  const minutosDoDia = Number(horario[1]) * 60 + Number(horario[2]);

  const relogioSp = new Date(lidoEmMs + DESLOCAMENTO_SP_MS); // getUTC* = relogio de Sao Paulo
  const inicioDoDiaSp = Date.UTC(relogioSp.getUTCFullYear(), relogioSp.getUTCMonth(), relogioSp.getUTCDate());
  const emDia = (dias) => inicioDoDiaSp + dias * DIA_MS + minutosDoDia * 60 * 1000 - DESLOCAMENTO_SP_MS;

  let alvo = null;
  if (/amanha/.test(t)) alvo = emDia(1);
  else if (/hoje/.test(t)) alvo = emDia(0);
  else {
    const achado = DIAS_DA_SEMANA.find(([nome]) => new RegExp('(^|[^a-z])' + nome).test(t));
    if (achado) {
      alvo = emDia((achado[1] - relogioSp.getUTCDay() + 7) % 7);
      if (alvo <= lidoEmMs) alvo += 7 * DIA_MS; // mesmo dia da semana, mas o horario ja passou: proxima semana
    }
  }
  return alvo !== null && alvo > lidoEmMs ? alvo : null;
}

module.exports.interpretarReinicio = interpretarReinicio;
