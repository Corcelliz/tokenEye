// Guarda os totais de tokens por dia (fuso America/Sao_Paulo) e por modelo,
// e calcula os resumos (hoje, 7 dias, mes, por dia, por modelo) a partir
// desses totais. A deduplicacao por message.id acontece aqui, porque este
// e o unico lugar que ve todos os registros, tanto da carga inicial quanto
// das atualizacoes ao vivo.
'use strict';

const DIAS_NO_GRAFICO = 14;
const DIAS_POR_MODELO = 30; // janela movel da lista/rosca "por modelo" e "por projeto"
const MAX_PROJETOS_NA_LISTA = 8; // o resto vira "outros"

function diaEmSaoPaulo(timestampIso) {
  return new Date(timestampIso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function totaisVazios() {
  return { entrada: 0, saida: 0, criacaoCache: 0, leituraCache: 0 };
}

function somarEm(destino, tokens) {
  destino.entrada += tokens.entrada;
  destino.saida += tokens.saida;
  destino.criacaoCache += tokens.criacaoCache;
  destino.leituraCache += tokens.leituraCache;
}

function totalDe(tokens) {
  return tokens.entrada + tokens.saida + tokens.criacaoCache + tokens.leituraCache;
}

// "Principal" = entrada + saida: o que voce escreveu e o que o Claude
// respondeu. E o numero grande dos cartoes e o da rosca por modelo.
function principalDe(tokens) {
  return tokens.entrada + tokens.saida;
}

// Familia do modelo pelo nome: 'claude-opus-5-5' -> 'opus'. A cor de cada
// fatia da rosca segue a familia (nunca a posicao no ranking), para o Opus
// ter sempre a mesma cor mesmo quando outro modelo passar na frente.
const FAMILIAS = ['opus', 'sonnet', 'haiku'];

function familiaDoModelo(nomeModelo) {
  const nome = String(nomeModelo || '').toLowerCase();
  return FAMILIAS.find((familia) => nome.includes(familia)) || 'outros';
}

// 'claude-opus-5-5-20260101' -> 'opus-5-5' (tira o prefixo e a data).
function nomeCurtoDoModelo(nomeModelo) {
  return String(nomeModelo || '').replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

function criarAgregador() {
  const porDia = new Map(); // 'YYYY-MM-DD' -> totaisVazios()
  // 'YYYY-MM-DD' -> Map(nome do modelo -> totaisVazios()). Guardado por dia
  // para a lista "por modelo" poder olhar so os ultimos 30 dias.
  const porDiaModelo = new Map();
  // Igual, mas por projeto (nome da ultima pasta do cwd).
  const porDiaProjeto = new Map();
  const messageIdsVistos = new Set();
  const eventos = [];
  let eventosDesordenados = false;
  const estatisticas = { linhasComUso: 0, linhasIgnoradas: 0, duplicadas: 0 };

  // Recebe um registro ja extraido pelo parser.js. Ignora silenciosamente
  // quem ja foi contado (mesmo message.id).
  function adicionarRegistro(registro) {
    if (registro.messageId && messageIdsVistos.has(registro.messageId)) {
      estatisticas.duplicadas++;
      return;
    }
    if (registro.messageId) messageIdsVistos.add(registro.messageId);

    const dia = diaEmSaoPaulo(registro.timestamp);
    if (!porDia.has(dia)) porDia.set(dia, totaisVazios());
    somarEm(porDia.get(dia), registro.tokens);

    if (!porDiaModelo.has(dia)) porDiaModelo.set(dia, new Map());
    const modelosDoDia = porDiaModelo.get(dia);
    if (!modelosDoDia.has(registro.modelo)) modelosDoDia.set(registro.modelo, totaisVazios());
    somarEm(modelosDoDia.get(registro.modelo), registro.tokens);

    const projeto = registro.projeto || 'sem projeto';
    if (!porDiaProjeto.has(dia)) porDiaProjeto.set(dia, new Map());
    const projetosDoDia = porDiaProjeto.get(dia);
    if (!projetosDoDia.has(projeto)) projetosDoDia.set(projeto, totaisVazios());
    somarEm(projetosDoDia.get(projeto), registro.tokens);

    // Lista compacta (horario + entrada/saida) usada so para estimar os
    // limites do plano. Mantida em ordem de horario.
    const ts = Date.parse(registro.timestamp);
    if (Number.isFinite(ts)) {
      const evento = { ts, tokens: registro.tokens.entrada + registro.tokens.saida };
      const ultimo = eventos[eventos.length - 1];
      if (ultimo && ts < ultimo.ts) eventosDesordenados = true;
      eventos.push(evento);
    }

    estatisticas.linhasComUso++;
  }

  function obterEventos() {
    // Ordena so quando precisa (a leitura inicial junta varios arquivos fora de ordem).
    if (eventosDesordenados) {
      eventos.sort((a, b) => a.ts - b.ts);
      eventosDesordenados = false;
    }
    return eventos;
  }

  function registrarLinhaIgnorada() {
    estatisticas.linhasIgnoradas++;
  }

  // Soma os totais dos dias entre inicioIso e fimIso (inclusive), ambos em
  // formato 'YYYY-MM-DD' no fuso America/Sao_Paulo.
  function somarIntervaloDeDias(diaInicial, diaFinal) {
    const resultado = totaisVazios();
    for (const [dia, totais] of porDia) {
      if (dia >= diaInicial && dia <= diaFinal) somarEm(resultado, totais);
    }
    return resultado;
  }

  function comTotal(totais) {
    return { ...totais, total: totalDe(totais) };
  }

  function obterResumo(agora = new Date()) {
    const hojeStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const seteDiasAtras = new Date(agora.getTime() - 6 * 24 * 60 * 60 * 1000);
    const seteDiasAtrasStr = seteDiasAtras.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const mesAtual = hojeStr.slice(0, 7); // 'YYYY-MM'
    const diaInicialMes = `${mesAtual}-01`;

    const porDiaGrafico = [];
    for (let i = DIAS_NO_GRAFICO - 1; i >= 0; i--) {
      const data = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
      const diaStr = data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const totais = porDia.get(diaStr) || totaisVazios();
      porDiaGrafico.push({ dia: diaStr, ...comTotal(totais) });
    }

    // "Por modelo": soma so os ultimos 30 dias (hoje e os 29 anteriores).
    const trintaDiasAtrasStr = new Date(agora.getTime() - (DIAS_POR_MODELO - 1) * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const porModelo = new Map(); // nome do modelo -> totais dentro da janela
    for (const [dia, modelosDoDia] of porDiaModelo) {
      if (dia < trintaDiasAtrasStr || dia > hojeStr) continue;
      for (const [modelo, totais] of modelosDoDia) {
        if (!porModelo.has(modelo)) porModelo.set(modelo, totaisVazios());
        somarEm(porModelo.get(modelo), totais);
      }
    }

    // "Por projeto": mesma janela de 30 dias, ordenado por entrada + saida.
    // Mostra os maiores e junta o resto em "outros".
    const porProjeto = new Map();
    for (const [dia, projetosDoDia] of porDiaProjeto) {
      if (dia < trintaDiasAtrasStr || dia > hojeStr) continue;
      for (const [projeto, totais] of projetosDoDia) {
        if (!porProjeto.has(projeto)) porProjeto.set(projeto, totaisVazios());
        somarEm(porProjeto.get(projeto), totais);
      }
    }
    const projetosOrdenados = [...porProjeto.entries()]
      .map(([projeto, totais]) => ({ projeto, principal: principalDe(totais) }))
      .filter((p) => p.principal > 0)
      .sort((a, b) => b.principal - a.principal);
    const totalProjetos = projetosOrdenados.reduce((acc, p) => acc + p.principal, 0);
    const listaPorProjeto = projetosOrdenados.slice(0, MAX_PROJETOS_NA_LISTA);
    const resto = projetosOrdenados.slice(MAX_PROJETOS_NA_LISTA);
    if (resto.length > 0) {
      listaPorProjeto.push({ projeto: `outros (${resto.length})`, principal: resto.reduce((acc, p) => acc + p.principal, 0), agrupado: true });
    }
    for (const item of listaPorProjeto) item.percentual = totalProjetos > 0 ? (item.principal / totalProjetos) * 100 : 0;

    const totalGeralTodosModelos = [...porModelo.values()].reduce((acc, t) => acc + totalDe(t), 0);
    const listaPorModelo = [...porModelo.entries()]
      .map(([modelo, totais]) => ({
        modelo,
        ...comTotal(totais),
        percentual: totalGeralTodosModelos > 0 ? (totalDe(totais) / totalGeralTodosModelos) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Rosca: agrupa as versoes de cada familia (ex.: opus-5-5 + opus-4-5) e
    // calcula o percentual sobre entrada + saida. Modelos sem entrada nem
    // saida (ex.: "<synthetic>") ficam de fora para nao virar fatia vazia.
    const grupos = new Map();
    for (const [modelo, totais] of porModelo) {
      if (principalDe(totais) === 0) continue;
      const familia = familiaDoModelo(modelo);
      if (!grupos.has(familia)) grupos.set(familia, { familia, versoes: [], ...totaisVazios() });
      const grupo = grupos.get(familia);
      somarEm(grupo, totais);
      grupo.versoes.push({ nome: nomeCurtoDoModelo(modelo), principal: principalDe(totais) });
    }
    const totalPrincipalFamilias = [...grupos.values()].reduce((acc, g) => acc + principalDe(g), 0);
    const listaPorFamilia = [...grupos.values()]
      .map((grupo) => ({
        ...grupo,
        versoes: grupo.versoes.sort((a, b) => b.principal - a.principal).map((v) => v.nome),
        total: totalDe(grupo),
        principal: principalDe(grupo),
        percentual: totalPrincipalFamilias > 0 ? (principalDe(grupo) / totalPrincipalFamilias) * 100 : 0,
      }))
      .sort((a, b) => b.principal - a.principal);

    return {
      atualizadoEm: agora.toISOString(),
      hoje: comTotal(porDia.get(hojeStr) || totaisVazios()),
      ultimos7Dias: comTotal(somarIntervaloDeDias(seteDiasAtrasStr, hojeStr)),
      mesAtual: comTotal(somarIntervaloDeDias(diaInicialMes, hojeStr)),
      porDia: porDiaGrafico,
      porModelo: listaPorModelo,
      porFamilia: listaPorFamilia,
      porProjeto: listaPorProjeto,
      estatisticas: { ...estatisticas },
    };
  }

  return { adicionarRegistro, registrarLinhaIgnorada, obterResumo, obterEventos };
}

module.exports = { DIAS_POR_MODELO, criarAgregador, diaEmSaoPaulo, familiaDoModelo, nomeCurtoDoModelo };
