// Desenha a tela a partir do resumo recebido do processo principal.
// Nunca acessa o sistema de arquivos: so recebe numeros ja agregados.
'use strict';

window.DashboardRender = (function () {
  const formato = window.DashboardFormato;

  // O numero grande mostra so entrada + saida (o que voce escreveu e o que o
  // Claude respondeu). O cache fica no detalhe, junto com o total bruto.
  // A leitura de cache cresce muito a cada resposta, por isso nao entra no
  // numero principal. Nenhum dado e apagado: tudo continua no detalhe.
  function textoDetalheTokens(totais) {
    const cache = totais.criacaoCache + totais.leituraCache;
    return (
      `cache ${formato.numero(cache)} · ` +
      `total bruto ${formato.numero(totais.total)}`
    );
  }

  function preencherCartaoMetrica(prefixo, totais) {
    const principal = totais.entrada + totais.saida;
    document.getElementById(`${prefixo}-numero`).textContent = formato.numero(principal);
    document.getElementById(`${prefixo}-detalhe`).textContent = textoDetalheTokens(totais);
  }

  function desenharGraficoPorDia(porDia) {
    const elementoContainer = document.getElementById('grafico-por-dia');
    elementoContainer.innerHTML = '';
    const maiorTotal = Math.max(1, ...porDia.map((d) => d.total));
    for (const dia of porDia) {
      const coluna = document.createElement('div');
      coluna.className = 'barra-dia';

      const barra = document.createElement('div');
      barra.className = 'barra';
      const alturaPercentual = Math.max(2, (dia.total / maiorTotal) * 100);
      barra.style.height = `${alturaPercentual}%`;
      barra.title = `${formato.diaCurto(dia.dia)}: ${formato.numero(dia.total)} tokens`;

      const rotulo = document.createElement('span');
      rotulo.className = 'rotulo-dia';
      rotulo.textContent = formato.diaCurto(dia.dia);

      coluna.appendChild(barra);
      coluna.appendChild(rotulo);
      elementoContainer.appendChild(coluna);
    }
  }

  function renderizarResumo(resumo) {
    preencherCartaoMetrica('hoje', resumo.hoje);
    preencherCartaoMetrica('dias7', resumo.ultimos7Dias);
    preencherCartaoMetrica('mes', resumo.mesAtual);
    desenharGraficoPorDia(resumo.porDia);
    window.DashboardRosca.desenhar(document.getElementById('rosca-modelos'), resumo.porFamilia);
  }

  function atualizarIndicadorAoVivo(dataIso) {
    document.getElementById('texto-ao-vivo').textContent = `ao vivo · atualizado às ${formato.hora(dataIso)}`;
  }

  function mostrarEstado(tipo, mensagem) {
    const telas = {
      carregando: document.getElementById('estado-carregando'),
      vazio: document.getElementById('estado-vazio'),
      erro: document.getElementById('estado-erro'),
    };
    const conteudo = document.getElementById('conteudo-principal');

    for (const [nome, elemento] of Object.entries(telas)) {
      elemento.hidden = nome !== tipo;
    }
    conteudo.hidden = tipo !== 'pronto';

    if (tipo === 'vazio') document.getElementById('mensagem-vazio').textContent = mensagem || '';
    if (tipo === 'erro') document.getElementById('mensagem-erro').textContent = mensagem || '';
  }

  return { renderizarResumo, atualizarIndicadorAoVivo, mostrarEstado };
})();
