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
