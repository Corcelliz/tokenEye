// Ponto de entrada da tela: busca o resumo inicial, desenha, e assina as
// atualizacoes ao vivo. So fala com o processo principal pela ponte segura
// window.tokensApi (ver preload.js).
'use strict';

function aplicarResposta(resposta) {
  window.DashboardRender.mostrarEstado(resposta.estado.tipo, resposta.estado.mensagem);
  if (resposta.estado.tipo === 'pronto') {
    window.DashboardRender.renderizarResumo(resposta.resumo);
    window.DashboardRender.atualizarIndicadorAoVivo(resposta.resumo.atualizadoEm);
  }
}

async function iniciar() {
  window.DashboardLimites.iniciarDialogo();
  window.DashboardLimites.renderizarLimites(await window.tokensApi.getLimits());
  window.tokensApi.onLimitsUpdate((limites) => window.DashboardLimites.renderizarLimites(limites));

  const respostaInicial = await window.tokensApi.getSummary();
  aplicarResposta(respostaInicial);

  window.tokensApi.onUpdate((resposta) => {
    aplicarResposta(resposta);
  });
}

iniciar();
