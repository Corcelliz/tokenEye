// Cartao "Limites do plano" e a janelinha para colar o texto do claude.ai.
// Os valores chegam de dois jeitos: automatico (o Claude Code passa os
// percentuais oficiais para o script da linha de status) ou manual (colados
// do claude.ai). O selo e cada barra dizem a origem e o horario da leitura.
'use strict';

window.DashboardLimites = (function () {
  const formato = window.DashboardFormato;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Icone de triangulo com "!", feito em SVG para nao depender de emoji.
  // O alerta nunca e so cor: sempre vem com este icone e um texto.
  function criarIconeAlerta() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('aria-hidden', 'true');
    const triangulo = document.createElementNS(SVG_NS, 'path');
    triangulo.setAttribute('d', 'M8 1.5 15 14.5H1z');
    triangulo.setAttribute('fill', 'currentColor');
    const exclamacao = document.createElementNS(SVG_NS, 'path');
    exclamacao.setAttribute('d', 'M8 6v4M8 11.6v.9');
    exclamacao.setAttribute('class', 'icone-alerta-marca'); // cor vem do CSS
    svg.append(triangulo, exclamacao);
    return svg;
  }

  function nivelDoAlerta(percentual, alerta) {
    if (percentual >= alerta.critico) return 'critico';
    if (percentual >= alerta.atencao) return 'atencao';
    return 'normal';
  }

  const TEXTO_DO_NIVEL = { atencao: 'atenção', critico: 'quase no limite' };

  function preencherLimite(elemento, dados, alerta) {
    if (!dados) {
      elemento.hidden = true;
      return;
    }
    elemento.hidden = false;
    const campo = (nome) => elemento.querySelector(`[data-campo="${nome}"]`);

    // Sempre textContent (nunca innerHTML): o texto veio de fora do app.
    const partesReinicio = [];
    if (dados.expirado) {
      // A janela ja reiniciou: o numero antigo nao vale mais.
      partesReinicio.push(`Reiniciou ${formato.reinicio(dados.reiniciaEm)}`);
      partesReinicio.push('aguardando o Claude Code');
    } else {
      if (dados.reiniciaEm) partesReinicio.push(`Reinicia ${formato.reinicio(dados.reiniciaEm)}`);
      else if (dados.reinicia) partesReinicio.push(`Reinicia ${dados.reinicia}`);
      if (dados.origem === 'estimado' && dados.baseadoEm) {
        // A barra e uma conta feita com os logs a partir de uma leitura anterior.
        const base = formato.momentoLeitura(dados.baseadoEm.lidoEm, 'lido');
        partesReinicio.push(`estimado · base ${formato.numero(dados.baseadoEm.percentual)}% ${base}`);
      } else {
        const verbo = dados.origem === 'automatico' ? 'atualizado' : 'lido';
        partesReinicio.push(formato.momentoLeitura(dados.lidoEm, verbo));
      }
    }
    campo('reinicio').textContent = partesReinicio.join(' · ');

    const percentualAtual = dados.expirado ? 0 : dados.percentual;
    const prefixo = dados.origem === 'estimado' ? '~' : '';
    const percentualTexto = dados.expirado ? '—' : `${prefixo}${formato.numero(dados.percentual)}% usado`;
    campo('percentual').textContent = percentualTexto;
    campo('barra').style.width = `${Math.min(100, Math.max(0, percentualAtual))}%`;

    const trilho = elemento.querySelector('.trilho-limite');
    trilho.setAttribute('aria-valuenow', String(percentualAtual));
    trilho.setAttribute('aria-valuetext', dados.expirado ? 'reiniciou, sem leitura nova' : percentualTexto);

    const nivel = nivelDoAlerta(percentualAtual, alerta);
    elemento.classList.remove('nivel-atencao', 'nivel-critico');
    const seloAlerta = campo('alerta');
    seloAlerta.replaceChildren();
    if (nivel === 'normal') {
      seloAlerta.hidden = true;
    } else {
      elemento.classList.add(`nivel-${nivel}`);
      seloAlerta.append(criarIconeAlerta(), document.createTextNode(TEXTO_DO_NIVEL[nivel]));
      seloAlerta.hidden = false;
    }
  }

  // Selo do cartao: "automático", "manual" ou os dois, conforme a origem das
  // leituras que estao na tela.
  function atualizarSeloOrigem(dados) {
    const origens = new Set([dados.sessao, dados.semana].filter(Boolean).map((d) => d.origem));
    const selo = document.getElementById('selo-origem-limites');
    if (origens.has('estimado')) {
      selo.textContent = 'estimado';
      selo.title = 'Calculado pelo app com os tokens dos logs, a partir da última leitura. Não inclui o uso no claude.ai. A próxima leitura oficial substitui.';
    } else if (origens.has('automatico') && origens.has('manual')) {
      selo.textContent = 'automático + manual';
      selo.title = 'Uma barra veio do Claude Code e a outra foi colada por você';
    } else if (origens.has('automatico')) {
      selo.textContent = 'automático';
      selo.title = 'Percentuais oficiais que o Claude Code recebe da Anthropic (linha de status)';
    } else {
      selo.textContent = 'manual';
      selo.title = 'Valores copiados do claude.ai por você, não medidos pelo app';
    }
  }

  function renderizarLimites(limites) {
    const dados = limites || {};
    const alerta = dados.alerta || { atencao: 80, critico: 95 };
    document.getElementById('limites-vazio').hidden = Boolean(dados.sessao || dados.semana);
    atualizarSeloOrigem(dados);
    preencherLimite(document.getElementById('limite-sessao'), dados.sessao, alerta);
    preencherLimite(document.getElementById('limite-semana'), dados.semana, alerta);
  }

  // ----- Janelinha de atualizacao -----

  function iniciarDialogo() {
    const dialogo = document.getElementById('dialogo-limites');
    const form = document.getElementById('form-limites');
    const caixaTexto = document.getElementById('texto-limites');
    const camposManuais = document.getElementById('campos-limites');
    const mensagem = document.getElementById('mensagem-limites');
    const valor = (id) => document.getElementById(id).value;

    function mostrarCamposManuais() {
      camposManuais.hidden = false;
    }

    function limparFormulario() {
      form.reset();
      camposManuais.hidden = true;
      mensagem.textContent = '';
    }

    document.getElementById('botao-atualizar-limites').addEventListener('click', () => {
      limparFormulario();
      dialogo.showModal();
      caixaTexto.focus();
    });
    document.getElementById('botao-cancelar-limites').addEventListener('click', () => dialogo.close());
    document.getElementById('botao-preencher-mao').addEventListener('click', () => {
      mostrarCamposManuais();
      document.getElementById('sessao-percentual').focus();
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensagem.textContent = '';

      // Se os campos estao abertos e tem alguma % digitada, eles valem;
      // senao, usa o texto colado.
      const algumCampoPreenchido =
        !camposManuais.hidden && (valor('sessao-percentual') !== '' || valor('semana-percentual') !== '');
      const entrada = algumCampoPreenchido
        ? {
            campos: {
              sessao: { percentual: valor('sessao-percentual'), reinicia: valor('sessao-reinicia') },
              semana: { percentual: valor('semana-percentual'), reinicia: valor('semana-reinicia') },
            },
          }
        : { texto: caixaTexto.value };

      const resultado = await window.tokensApi.addManualEntry(entrada);
      if (resultado.ok) {
        renderizarLimites(resultado.limites);
        dialogo.close();
        return;
      }

      // Nao reconheceu: explica e abre os campos para preencher a mao.
      mensagem.textContent = algumCampoPreenchido
        ? resultado.motivo
        : `${resultado.motivo} Você pode preencher à mão abaixo.`;
      mostrarCamposManuais();
    });
  }

  return { renderizarLimites, iniciarDialogo };
})();
