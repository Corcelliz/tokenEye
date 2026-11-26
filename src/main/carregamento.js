// Leitura inicial dos logs, separada do main.js para poder ser testada sem
// abrir o Electron. Devolve o estado da tela ('pronto' | 'vazio' | 'erro')
// e o leitor (usado depois pela varredura periodica e pelo observador).
'use strict';
const fs = require('fs');
const { criarLeitorDeLogs } = require('./logReader.js');

// processarLinhas(linhas): funcao que recebe as linhas cruas e alimenta o agregador.
function carregarTudo(pastaLogs, processarLinhas) {
  try {
    if (!fs.existsSync(pastaLogs)) {
      return { estado: { tipo: 'vazio', mensagem: 'Pasta de logs do Claude Code não foi encontrada.' }, leitor: null };
    }
    // O leitor de logs absorve erros de leitura (devolve lista vazia), o que
    // faria uma pasta SEM PERMISSAO parecer "sem logs". Por isso testamos o
    // acesso aqui, antes: se negar, cai no catch e vira o estado de erro.
    fs.readdirSync(pastaLogs);

    const leitor = criarLeitorDeLogs(pastaLogs);
    const arquivos = leitor.listarArquivos();
    if (arquivos.length === 0) {
      return { estado: { tipo: 'vazio', mensagem: 'Nenhum log encontrado ainda. Use o Claude Code para gerar dados.' }, leitor };
    }
    for (const arquivo of arquivos) {
      processarLinhas(leitor.lerNovidades(arquivo).linhas);
    }
    return { estado: { tipo: 'pronto', mensagem: null }, leitor };
  } catch (erro) {
    return { estado: { tipo: 'erro', mensagem: 'Não foi possível ler os logs: ' + erro.message }, leitor: null };
  }
}

module.exports = { carregarTudo };
