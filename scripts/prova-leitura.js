// Prova de leitura (Fase 0): soma os tokens de "hoje" a partir dos logs reais
// do Claude Code, usando so metadados. Serve de referencia independente para
// conferir o total mostrado pelo app. Nunca le nem imprime message.content.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const PASTA_LOGS = path.join(os.homedir(), '.claude', 'projects');
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function* arquivosJsonl(pasta) {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) yield* arquivosJsonl(caminho);
    else if (item.name.endsWith('.jsonl')) yield caminho;
  }
}

function diaEmSaoPaulo(timestampIso) {
  return new Date(timestampIso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

let linhasLidas = 0;
let linhasInvalidas = 0;
let linhasComUso = 0;
let linhasSidechain = 0;

const vistosHoje = new Map(); // message.id -> totais da linha (para deduplicar)
const todasHoje = []; // todas as linhas de hoje, sem deduplicar

for (const arquivo of arquivosJsonl(PASTA_LOGS)) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean);
  for (const linha of linhas) {
    linhasLidas++;
    let registro;
    try {
      registro = JSON.parse(linha);
    } catch {
      linhasInvalidas++;
      continue;
    }
    if (registro.type !== 'assistant' || !registro.message || !registro.message.usage) continue;
    if (!registro.timestamp || diaEmSaoPaulo(registro.timestamp) !== HOJE) continue;

    linhasComUso++;
    if (registro.isSidechain) linhasSidechain++;

    const uso = registro.message.usage;
    const totais = {
      entrada: uso.input_tokens || 0,
      saida: uso.output_tokens || 0,
      criacaoCache: uso.cache_creation_input_tokens || 0,
      leituraCache: uso.cache_read_input_tokens || 0,
    };

    todasHoje.push(totais);
    // Deduplicar por message.id: a mesma resposta pode aparecer em mais de
    // uma linha (ex.: uma por etapa de ferramenta), sempre com o mesmo uso.
    // Guardamos so a primeira ocorrencia de cada message.id.
    const chave = registro.message.id;
    if (chave && !vistosHoje.has(chave)) vistosHoje.set(chave, totais);
  }
}

function somar(lista) {
  return lista.reduce((acc, t) => ({
    entrada: acc.entrada + t.entrada,
    saida: acc.saida + t.saida,
    criacaoCache: acc.criacaoCache + t.criacaoCache,
    leituraCache: acc.leituraCache + t.leituraCache,
  }), { entrada: 0, saida: 0, criacaoCache: 0, leituraCache: 0 });
}

const semDedup = somar(todasHoje);
const comDedup = somar([...vistosHoje.values()]);
const totalSemDedup = semDedup.entrada + semDedup.saida + semDedup.criacaoCache + semDedup.leituraCache;
const totalComDedup = comDedup.entrada + comDedup.saida + comDedup.criacaoCache + comDedup.leituraCache;

console.log('Prova de leitura - Dashboard de Tokens');
console.log('Pasta de logs:', PASTA_LOGS);
console.log('Dia considerado "hoje" (America/Sao_Paulo):', HOJE);
console.log('');
console.log('Linhas lidas no total:', linhasLidas, '| invalidas (JSON quebrado):', linhasInvalidas);
console.log('Linhas de hoje com uso de tokens:', linhasComUso, '| dessas, isSidechain=true:', linhasSidechain);
console.log('');
console.log('--- SEM deduplicar (soma de todas as linhas de hoje) ---');
console.log('entrada:', semDedup.entrada, '| saida:', semDedup.saida, '| criacao cache:', semDedup.criacaoCache, '| leitura cache:', semDedup.leituraCache);
console.log('TOTAL sem deduplicar:', totalSemDedup);
console.log('');
console.log('--- COM deduplicacao por message.id (primeira ocorrencia) ---');
console.log('entrada:', comDedup.entrada, '| saida:', comDedup.saida, '| criacao cache:', comDedup.criacaoCache, '| leitura cache:', comDedup.leituraCache);
console.log('TOTAL com deduplicacao:', totalComDedup);
console.log('');
console.log('Diferenca (sem - com):', totalSemDedup - totalComDedup, `(${((totalSemDedup - totalComDedup) / Math.max(totalComDedup, 1) * 100).toFixed(1)}% maior sem deduplicar)`);
