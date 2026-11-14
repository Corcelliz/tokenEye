// Guarda as leituras manuais dos limites (sessao e semana) num arquivo JSON
// na pasta de dados do app (userData). Nunca fica no repositorio.
//
// Formato do arquivo limites.json:
// {
//   "versao": 1,
//   "alerta": { "atencao": 80, "critico": 95 },   <- pode editar a mao
//   "leituras": [ { "lidoEm": "...", "sessao": {...}, "semana": {...} } ]
// }
'use strict';
const fs = require('fs');
const path = require('path');

const NOME_ARQUIVO = 'limites.json';
const MAXIMO_LEITURAS = 1000; // historico suficiente sem deixar o arquivo crescer para sempre
const ALERTA_PADRAO = { atencao: 80, critico: 95 };

function dadosVazios() {
  return { versao: 1, alerta: { ...ALERTA_PADRAO }, leituras: [] };
}

function criarStore(pastaDados) {
  const caminhoArquivo = path.join(pastaDados, NOME_ARQUIVO);

  // Le o arquivo; se nao existir ou estiver corrompido, comeca do zero
  // (sem apagar o arquivo ruim: ele so sera substituido no proximo salvamento).
  function ler() {
    try {
      const dados = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf8'));
      return {
        versao: 1,
        alerta: { ...ALERTA_PADRAO, ...(dados.alerta || {}) },
        leituras: Array.isArray(dados.leituras) ? dados.leituras : [],
      };
    } catch {
      return dadosVazios();
    }
  }

  // Grava primeiro num arquivo temporario e depois troca pelo definitivo:
  // se o app fechar no meio da gravacao, o arquivo antigo continua inteiro.
  function gravar(dados) {
    fs.mkdirSync(pastaDados, { recursive: true });
    const temporario = caminhoArquivo + '.tmp';
    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), 'utf8');
    fs.renameSync(temporario, caminhoArquivo);
  }

  // A leitura mais recente de cada bloco. Sessao e semana sao procuradas
  // separadamente, porque uma leitura pode trazer so uma delas.
  function obterLimites() {
    const dados = ler();
    const maisRecente = (nome) => {
      for (let i = dados.leituras.length - 1; i >= 0; i--) {
        const leitura = dados.leituras[i];
        if (leitura[nome]) return { ...leitura[nome], lidoEm: leitura.lidoEm };
      }
      return null;
    };
    return {
      sessao: maisRecente('sessao'),
      semana: maisRecente('semana'),
      alerta: dados.alerta,
    };
  }

  // Recebe uma leitura ja validada por limites.js ({ sessao?, semana? }).
  function adicionarLeitura(leitura, agora = new Date()) {
    const dados = ler();
    const nova = { lidoEm: agora.toISOString() };
    if (leitura.sessao) nova.sessao = leitura.sessao;
    if (leitura.semana) nova.semana = leitura.semana;
    dados.leituras.push(nova);
    if (dados.leituras.length > MAXIMO_LEITURAS) {
      dados.leituras = dados.leituras.slice(-MAXIMO_LEITURAS);
    }
    gravar(dados);
    return obterLimites();
  }

  return { obterLimites, adicionarLeitura };
}

module.exports = { criarStore };
