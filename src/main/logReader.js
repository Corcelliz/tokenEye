// Varre a pasta de logs do Claude Code e le os arquivos .jsonl, guardando
// quanto de cada arquivo ja foi lido (offset em bytes) para, depois, ler so
// o que foi acrescentado. Devolve linhas de texto cruas; quem transforma
// isso em tokens e o parser.js (este modulo nunca olha o conteudo da linha).
'use strict';
const fs = require('fs');
const path = require('path');

function listarArquivosJsonl(pastaBase) {
  const encontrados = [];
  let itens;
  try {
    itens = fs.readdirSync(pastaBase, { withFileTypes: true });
  } catch {
    return encontrados; // pasta nao existe ou sem permissao: lista vazia, nao quebra o app
  }
  for (const item of itens) {
    const caminho = path.join(pastaBase, item.name);
    if (item.isDirectory()) encontrados.push(...listarArquivosJsonl(caminho));
    else if (item.name.endsWith('.jsonl')) encontrados.push(caminho);
  }
  return encontrados;
}

function criarLeitorDeLogs(pastaBase) {
  const offsetsPorArquivo = new Map();

  // Le o que foi acrescentado ao arquivo desde a ultima leitura. So devolve
  // linhas completas (terminadas em \n); uma linha ainda sendo escrita fica
  // para a proxima chamada. Se o arquivo ficou menor que o offset guardado
  // (foi substituido), rele do comeco.
  function lerNovidades(caminhoArquivo) {
    let descritor;
    try {
      descritor = fs.openSync(caminhoArquivo, 'r');
    } catch {
      return { linhas: [] }; // arquivo removido entre a listagem e a leitura
    }

    try {
      const tamanho = fs.fstatSync(descritor).size;
      let offsetAtual = offsetsPorArquivo.get(caminhoArquivo) || 0;
      if (offsetAtual > tamanho) offsetAtual = 0;
      if (offsetAtual === tamanho) return { linhas: [] }; // nada novo: nem chega a ler

      // Le so os bytes acrescentados, nao o arquivo inteiro.
      const buffer = Buffer.alloc(tamanho - offsetAtual);
      const bytesLidos = fs.readSync(descritor, buffer, 0, buffer.length, offsetAtual);
      const texto = buffer.subarray(0, bytesLidos).toString('utf8');

      const indiceUltimaQuebra = texto.lastIndexOf('\n');
      if (indiceUltimaQuebra === -1) return { linhas: [] }; // nada completo ainda

      const textoCompleto = texto.slice(0, indiceUltimaQuebra + 1);
      const linhas = textoCompleto.split('\n').filter((l) => l.length > 0);

      offsetsPorArquivo.set(caminhoArquivo, offsetAtual + Buffer.byteLength(textoCompleto, 'utf8'));
      return { linhas };
    } catch {
      return { linhas: [] }; // erro de leitura: tenta de novo na proxima varredura
    } finally {
      fs.closeSync(descritor);
    }
  }

  function listarArquivos() {
    return listarArquivosJsonl(pastaBase);
  }

  return { listarArquivos, lerNovidades };
}

module.exports = { criarLeitorDeLogs, listarArquivosJsonl };
