// Linha do tempo dos limites: grafico de linha em SVG feito a mao (sem
// biblioteca) com SO a semana nos ultimos 14 dias (a sessao de 5 h reinicia
// toda hora e ja aparece na barra de cima; no grafico ela so poluiria).
// Responsivo: o desenho e refeito com a largura real do cartao sempre que a
// janela muda de tamanho, entao texto e bolinhas nunca ficam esticados.
'use strict';

window.DashboardHistorico = (function () {
  const formato = window.DashboardFormato;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DIA_MS = 24 * 60 * 60 * 1000;
  const ALTURA = 150;
  const MARGEM = { esq: 36, dir: 12, topo: 8, base: 22 };

  let ultimoHistorico = null;
  let ultimoAlerta = null;

  function criar(nome, atributos, texto) {
    const el = document.createElementNS(SVG_NS, nome);
    for (const [k, v] of Object.entries(atributos || {})) el.setAttribute(k, String(v));
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function redesenhar() {
    const container = document.getElementById('linha-do-tempo');
    container.replaceChildren();
    const pontos = (ultimoHistorico && ultimoHistorico.series.semana) || [];

    if (pontos.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'projeto-vazio';
      vazio.textContent = 'Ainda não há leituras da semana nos últimos 14 dias.';
      container.appendChild(vazio);
      return;
    }

    const largura = Math.max(280, Math.round(container.clientWidth || 600));
    const inicio = Date.parse(ultimoHistorico.inicio);
    const fim = Date.parse(ultimoHistorico.fim);
    const x = (iso) => MARGEM.esq + ((Date.parse(iso) - inicio) / (fim - inicio)) * (largura - MARGEM.esq - MARGEM.dir);
    const y = (pct) => MARGEM.topo + (1 - pct / 100) * (ALTURA - MARGEM.topo - MARGEM.base);

    // viewBox = tamanho real em pixels: 1 unidade do desenho = 1 pixel da tela.
    const svg = criar('svg', {
      viewBox: `0 0 ${largura} ${ALTURA}`, width: largura, height: ALTURA, role: 'img', class: 'grafico-linha-tempo',
      'aria-label': `Percentual de uso da semana em ${pontos.length} leituras nos últimos 14 dias`,
    });

    for (const pct of [0, 50, 100]) {
      svg.appendChild(criar('line', { x1: MARGEM.esq, x2: largura - MARGEM.dir, y1: y(pct), y2: y(pct), class: 'grade-linha' }));
      svg.appendChild(criar('text', { x: MARGEM.esq - 6, y: y(pct) + 3, class: 'rotulo-eixo', 'text-anchor': 'end' }, `${pct}%`));
    }
    if (ultimoAlerta && ultimoAlerta.atencao > 0 && ultimoAlerta.atencao < 100) {
      svg.appendChild(criar('line', { x1: MARGEM.esq, x2: largura - MARGEM.dir, y1: y(ultimoAlerta.atencao), y2: y(ultimoAlerta.atencao), class: 'grade-alerta' }));
    }

    // Poucos rotulos de dia quando a janela e estreita.
    const passo = largura < 520 ? 7 : 2;
    for (let d = 0; d <= 14; d += passo) {
      const instante = new Date(fim - d * DIA_MS).toISOString();
      const dia = new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      svg.appendChild(criar('text', { x: x(instante), y: ALTURA - 6, class: 'rotulo-eixo', 'text-anchor': d === 14 ? 'start' : 'middle' }, formato.diaCurto(dia)));
    }

    if (pontos.length > 1) {
      const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.em).toFixed(1)} ${y(p.percentual).toFixed(1)}`).join(' ');
      svg.appendChild(criar('path', { d: caminho, class: 'linha-serie serie-semana' }));
    }
    for (const p of pontos) {
      const marca = criar('circle', { cx: x(p.em), cy: y(p.percentual), r: 4, class: 'ponto-serie serie-semana' });
      marca.appendChild(criar('title', {}, `Semana: ${Math.round(p.percentual)}% · ${formato.momentoLeitura(p.em, 'lido')}`));
      svg.appendChild(marca);
    }
    container.appendChild(svg);
  }

  function desenhar(historico, alerta) {
    ultimoHistorico = historico;
    ultimoAlerta = alerta;
    redesenhar();
  }

  // Refaz o desenho quando a largura do cartao muda (janela redimensionada)
  // ou quando o cartao passa a aparecer (antes disso a largura medida e 0).
  const container = document.getElementById('linha-do-tempo');
  let larguraAnterior = 0;
  new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - larguraAnterior) > 4) {
      larguraAnterior = container.clientWidth;
      redesenhar();
    }
  }).observe(container);

  return { desenhar };
})();
