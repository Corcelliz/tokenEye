// Preload: a unica ponte entre a janela (renderer, sem acesso ao sistema de
// arquivos) e o processo principal. Expoe só o que a tela precisa, nunca o
// Node inteiro. Roda com contextIsolation + sandbox, mesmo assim.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tokensApi', {
  // Pede o resumo atual (estado da tela + totais agregados).
  getSummary: () => ipcRenderer.invoke('tokens:getSummary'),

  // Assina atualizacoes ao vivo. Devolve uma funcao para cancelar a assinatura.
  onUpdate: (callback) => {
    const ouvinte = (_evento, resumo) => callback(resumo);
    ipcRenderer.on('tokens:update', ouvinte);
    return () => ipcRenderer.removeListener('tokens:update', ouvinte);
  },

  // Limites do plano digitados/colados pelo usuario (nao vem dos logs).
  getLimits: () => ipcRenderer.invoke('limites:obter'),

  // Envia { texto } ou { campos }. Devolve { ok, limites } ou { ok: false, motivo }.
  addManualEntry: (entrada) => ipcRenderer.invoke('limites:adicionar', entrada),

  // Assina as atualizacoes automaticas dos limites (vindas do Claude Code).
  onLimitsUpdate: (callback) => {
    const ouvinte = (_evento, limites) => callback(limites);
    ipcRenderer.on('limites:update', ouvinte);
    return () => ipcRenderer.removeListener('limites:update', ouvinte);
  },
});
