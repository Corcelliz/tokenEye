// Transforma uma linha de texto do log (.jsonl) num registro de uso de tokens,
// ou diz por que ela foi ignorada. Nunca guarda nem devolve message.content:
// so os metadados listados em "Fontes de dados.md" saem daqui.
'use strict';

function somenteNumero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

// Do campo cwd (pasta onde o Claude Code estava rodando) guarda SO o nome da
// ultima pasta: '.../projetos/meu-app' -> 'meu-app'. O caminho completo
// nunca sai daqui, para nao aparecer na tela nem ficar na memoria.
function nomeDoProjeto(cwd) {
  if (typeof cwd !== 'string') return 'sem projeto';
  const partes = cwd.split(/[\\/]+/).filter(Boolean);
  const nome = partes[partes.length - 1];
  return nome ? nome.slice(0, 60) : 'sem projeto';
}

// Devolve { ok: true, registro } quando a linha tem uso de tokens para contar,
// ou { ok: false, motivo } quando deve ser ignorada (motivo: 'json_invalido'
// ou 'sem_uso', para as estatisticas de "linhas ignoradas").
function parseLinha(linhaTexto) {
  const texto = linhaTexto.trim();
  if (!texto) return { ok: false, motivo: 'vazia' };

  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'json_invalido' };
  }

  if (bruto.type !== 'assistant' || !bruto.message || !bruto.message.usage) {
    return { ok: false, motivo: 'sem_uso' };
  }
  if (!bruto.message.id || !bruto.timestamp) {
    return { ok: false, motivo: 'sem_uso' };
  }

  const uso = bruto.message.usage;
  const registro = {
    messageId: bruto.message.id,
    requestId: bruto.requestId || null,
    timestamp: bruto.timestamp,
    modelo: bruto.message.model || 'desconhecido',
    sessionId: bruto.sessionId || null,
    projeto: nomeDoProjeto(bruto.cwd),
    isSidechain: Boolean(bruto.isSidechain),
    tokens: {
      entrada: somenteNumero(uso.input_tokens),
      saida: somenteNumero(uso.output_tokens),
      criacaoCache: somenteNumero(uso.cache_creation_input_tokens),
      leituraCache: somenteNumero(uso.cache_read_input_tokens),
    },
  };

  return { ok: true, registro };
}

module.exports = { parseLinha, nomeDoProjeto };
