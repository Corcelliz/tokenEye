// Formatacao de numeros e datas em pt-BR. Sem dependencias externas.
'use strict';
window.DashboardFormato = {
  numero(valor) {
    return new Intl.NumberFormat('pt-BR').format(Math.round(valor));
  },
  // Numero curto para espacos pequenos, com no maximo 3 digitos:
  // 278.400 -> "278 mil", 21.900 -> "21,9 mil", 1.258.026 -> "1,26 mi".
  compacto(valor) {
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumSignificantDigits: 3 }).format(valor);
  },
  hora(dataIso) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(dataIso));
  },
  diaCurto(diaIso) {
    const partes = diaIso.split('-');
    return `${partes[2]}/${partes[1]}`;
  },
  // "13/11 · 19:00–00:00" (dia do comeco do bloco + horario de inicio e fim).
  faixaDeHoras(inicioIso, fimIso) {
    const dia = new Date(inicioIso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return `${this.diaCurto(dia)} · ${this.hora(inicioIso)}–${this.hora(fimIso)}`;
  },
  // "2 h 10 min" / "35 min" a partir de milissegundos.
  duracao(ms) {
    const minutos = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  },
  // "lido às 21:40" se foi hoje; "lido em 09/11 às 20:40" se foi outro dia.
  // O verbo muda conforme a origem: "lido" (manual) ou "atualizado" (automatico).
  momentoLeitura(dataIso, verbo = 'lido') {
    const opcoesDia = { timeZone: 'America/Sao_Paulo' };
    const diaLeitura = new Date(dataIso).toLocaleDateString('en-CA', opcoesDia);
    const diaHoje = new Date().toLocaleDateString('en-CA', opcoesDia);
    if (diaLeitura === diaHoje) return `${verbo} às ${this.hora(dataIso)}`;
    return `${verbo} em ${this.diaCurto(diaLeitura)} às ${this.hora(dataIso)}`;
  },
  // Data de reinicio de um limite: "hoje, 23:30", "amanhã, 04:00" ou "sáb., 00:30".
  reinicio(dataIso) {
    const opcoesDia = { timeZone: 'America/Sao_Paulo' };
    const dia = new Date(dataIso).toLocaleDateString('en-CA', opcoesDia);
    const hoje = new Date().toLocaleDateString('en-CA', opcoesDia);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', opcoesDia);
    const hora = this.hora(dataIso);
    if (dia === hoje) return `hoje, ${hora}`;
    if (dia === amanha) return `amanhã, ${hora}`;
    const diaDaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(dataIso));
    return `${diaDaSemana}, ${hora}`;
  },
};
