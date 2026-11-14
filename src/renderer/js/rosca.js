// Grafico de rosca por familia de modelo (Opus, Sonnet, Haiku, Outros),
// feito em SVG a mao, sem biblioteca. Mede entrada + saida.
//
// Como funciona o desenho: cada fatia e um circulo com contorno grosso
// (stroke). O "stroke-dasharray" diz quanto do contorno e pintado e quanto
// fica vazio; o "stroke-dashoffset" diz onde comeca. Assim cada circulo pinta
// so o seu pedaco do anel.
'use strict';

window.DashboardRosca = (function () {
  const formato = window.DashboardFormato;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TAMANHO = 120; // px (viewBox)
  const CENTRO = TAMANHO / 2;
  const RAIO = 50;
  const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
  const ESPACO_ENTRE_FATIAS = 2; // px de fundo entre uma fatia e outra

  const NOMES = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', outros: 'Outros' };

  // Guarda qual familia esta em destaque, para manter o destaque quando a
  // rosca e redesenhada por uma atualizacao ao vivo.
  let familiaDestacada = null;

  function criarSvg(nome, atributos) {
    const elemento = document.createElementNS(SVG_NS, nome);
    for (const [chave, valor] of Object.entries(atributos)) elemento.setAttribute(chave, String(valor));
    return elemento;
  }

  function textoPercentual(percentual) {
    return percentual > 0 && percentual < 1 ? '<1%' : `${Math.round(percentual)}%`;
  }

  function desenhar(container, fatias) {
    container.replaceChildren();
    container.classList.remove('com-destaque');
    if (!fatias || fatias.length === 0) {
      container.textContent = 'Sem dados de modelo ainda.';
      return;
    }

    const total = fatias.reduce((soma, fatia) => soma + fatia.principal, 0);

    // ----- Figura: anel em SVG + texto do centro em HTML por cima -----
    const figura = document.createElement('div');
    figura.className = 'rosca-figura';

    const descricao = fatias.map((f) => `${NOMES[f.familia]} ${textoPercentual(f.percentual)}`).join(', ');
    const svg = criarSvg('svg', { viewBox: `0 0 ${TAMANHO} ${TAMANHO}`, role: 'img', 'aria-label': `Por modelo: ${descricao}` });
    // Gira -90 graus para a primeira fatia comecar no topo (12 horas).
    const grupo = criarSvg('g', { transform: `rotate(-90 ${CENTRO} ${CENTRO})` });

    let inicio = 0;
    const elementosFatia = {};
    for (const fatia of fatias) {
      const comprimento = (fatia.principal / total) * CIRCUNFERENCIA;
      // Com uma fatia so, o anel fica inteiro (sem espaco).
      const pintado = fatias.length === 1 ? CIRCUNFERENCIA : Math.max(0, comprimento - ESPACO_ENTRE_FATIAS);
      const circulo = criarSvg('circle', {
        cx: CENTRO,
        cy: CENTRO,
        r: RAIO,
        class: `fatia fatia-${fatia.familia}`,
        'stroke-dasharray': `${pintado} ${CIRCUNFERENCIA - pintado}`,
        'stroke-dashoffset': -(inicio + (fatias.length === 1 ? 0 : ESPACO_ENTRE_FATIAS / 2)),
      });
      grupo.appendChild(circulo);
      elementosFatia[fatia.familia] = circulo;
      inicio += comprimento;
    }
    svg.appendChild(grupo);

    const centro = document.createElement('div');
    centro.className = 'rosca-centro';
    const valorCentro = document.createElement('span');
    valorCentro.className = 'rosca-valor';
    const rotuloCentro = document.createElement('span');
    rotuloCentro.className = 'rosca-rotulo';
    centro.append(valorCentro, rotuloCentro);
    figura.append(svg, centro);

    // ----- Legenda: sempre mostra nome, versoes, % e valor de cada fatia -----
    const legenda = document.createElement('ul');
    legenda.className = 'legenda-rosca';
    const linhasLegenda = {};
    for (const fatia of fatias) {
      const linha = document.createElement('li');
      linha.className = 'legenda-linha';
      linha.tabIndex = 0; // foco pelo teclado mostra o mesmo destaque do mouse
      linha.setAttribute(
        'aria-label',
        `${NOMES[fatia.familia]}: ${textoPercentual(fatia.percentual)}, ${formato.numero(fatia.principal)} tokens de entrada e saída`,
      );

      const amostra = document.createElement('span');
      amostra.className = `amostra amostra-${fatia.familia}`;

      const textos = document.createElement('span');
      textos.className = 'legenda-textos';
      const nome = document.createElement('span');
      nome.className = 'legenda-nome';
      nome.textContent = NOMES[fatia.familia];
      const versoes = document.createElement('span');
      versoes.className = 'legenda-versoes';
      versoes.textContent = fatia.versoes.join(' · '); // textContent: o nome vem dos logs
      textos.append(nome, versoes);

      const numeros = document.createElement('span');
      numeros.className = 'legenda-numeros';
      const percentual = document.createElement('span');
      percentual.className = 'legenda-percentual';
      percentual.textContent = textoPercentual(fatia.percentual);
      const valor = document.createElement('span');
      valor.className = 'legenda-valor';
      valor.textContent = formato.compacto(fatia.principal);
      numeros.append(percentual, valor);

      linha.append(amostra, textos, numeros);
      legenda.appendChild(linha);
      linhasLegenda[fatia.familia] = linha;
    }

    container.append(figura, legenda);

    // ----- Destaque ao passar o mouse ou focar -----
    function destacar(familia) {
      familiaDestacada = familia;
      const fatia = fatias.find((f) => f.familia === familia);
      if (!fatia) {
        familiaDestacada = null;
        container.classList.remove('com-destaque');
        valorCentro.textContent = formato.compacto(total);
        rotuloCentro.textContent = 'entrada + saída';
        for (const el of [...Object.values(elementosFatia), ...Object.values(linhasLegenda)]) el.classList.remove('destacada');
        return;
      }
      container.classList.add('com-destaque');
      for (const [nomeFamilia, el] of Object.entries(elementosFatia)) el.classList.toggle('destacada', nomeFamilia === familia);
      for (const [nomeFamilia, el] of Object.entries(linhasLegenda)) el.classList.toggle('destacada', nomeFamilia === familia);
      valorCentro.textContent = textoPercentual(fatia.percentual);
      rotuloCentro.textContent = NOMES[familia];
    }

    for (const fatia of fatias) {
      const entrar = () => destacar(fatia.familia);
      const sair = () => destacar(null);
      elementosFatia[fatia.familia].addEventListener('pointerenter', entrar);
      elementosFatia[fatia.familia].addEventListener('pointerleave', sair);
      linhasLegenda[fatia.familia].addEventListener('pointerenter', entrar);
      linhasLegenda[fatia.familia].addEventListener('pointerleave', sair);
      linhasLegenda[fatia.familia].addEventListener('focus', entrar);
      linhasLegenda[fatia.familia].addEventListener('blur', sair);
    }

    destacar(familiaDestacada); // reaplica o destaque anterior (ou mostra o total)
  }

  return { desenhar };
})();
