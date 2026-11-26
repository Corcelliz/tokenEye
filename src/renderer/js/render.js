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

  // Por projeto: uma barra empilhada com a divisao geral (so os 5 maiores
  // pedacos tem nome; o resto vira "outros") e, embaixo, a lista com
  // percentual em destaque. textContent em tudo: o nome vem dos logs.
  const MAX_PROJETOS_NA_TELA = 5;

  function desenharPorProjeto(porProjeto) {
    const lista = document.getElementById('lista-projetos');
    const barra = document.getElementById('barra-projetos');
    lista.replaceChildren();
    barra.replaceChildren();
    if (!porProjeto || porProjeto.length === 0) {
      const vazio = document.createElement('li');
      vazio.className = 'projeto-vazio';
      vazio.textContent = 'Sem dados de projeto nos últimos 30 dias.';
      lista.appendChild(vazio);
      return;
    }

    // Junta tudo que passa do 5o lugar em "outros".
    const principais = porProjeto.filter((p) => !p.agrupado).slice(0, MAX_PROJETOS_NA_TELA);
    const resto = porProjeto.filter((p) => p.agrupado || !principais.includes(p));
    const itens = principais.map((p) => ({ ...p }));
    if (resto.length > 0) {
      itens.push({
        projeto: 'outros',
        principal: resto.reduce((acc, p) => acc + p.principal, 0),
        percentual: resto.reduce((acc, p) => acc + p.percentual, 0),
        agrupado: true,
      });
    }

    itens.forEach((projeto, i) => {
      const classeCor = projeto.agrupado ? 'proj-outros' : `proj-c${i}`;
      const percentual = projeto.percentual > 0 && projeto.percentual < 1 ? '<1%' : `${Math.round(projeto.percentual)}%`;

      const trecho = document.createElement('span');
      trecho.className = `trecho-projeto ${classeCor}`;
      trecho.style.flexGrow = String(Math.max(projeto.percentual, 0.5));
      trecho.title = `${projeto.projeto}: ${percentual}`;
      barra.appendChild(trecho);

      const item = document.createElement('li');
      item.className = 'projeto-item';
      const amostra = document.createElement('span');
      amostra.className = `amostra-projeto ${classeCor}`;
      const nome = document.createElement('span');
      nome.className = 'projeto-nome';
      nome.textContent = projeto.projeto;
      nome.title = projeto.projeto;
      const pct = document.createElement('span');
      pct.className = 'projeto-percentual';
      pct.textContent = percentual;
      const valor = document.createElement('span');
      valor.className = 'projeto-valor';
      valor.textContent = formato.compacto(projeto.principal);
      item.append(amostra, nome, pct, valor);
      lista.appendChild(item);
    });
  }

  function renderizarResumo(resumo) {
    preencherCartaoMetrica('hoje', resumo.hoje);
    preencherCartaoMetrica('dias7', resumo.ultimos7Dias);
    preencherCartaoMetrica('mes', resumo.mesAtual);
    desenharGraficoPorDia(resumo.porDia);
    window.DashboardRosca.desenhar(document.getElementById('rosca-modelos'), resumo.porFamilia);
    desenharPorProjeto(resumo.porProjeto);
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
