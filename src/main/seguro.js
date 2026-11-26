// Embrulha uma funcao para que um erro dentro dela nunca derrube o app.
// Usada nos pontos que rodam "sozinhos" (timer da varredura e observador de
// pastas): se der erro, ele e registrado no console e o proximo ciclo tenta
// de novo, em vez de aparecer uma janela de erro para o usuario.
'use strict';

function protegido(funcao, rotulo, registrarErro = console.error) {
  return (...argumentos) => {
    try {
      return funcao(...argumentos);
    } catch (erro) {
      // So a mensagem e o rotulo: nada de conteudo de logs.
      registrarErro(`Erro em "${rotulo}":`, erro && erro.message ? erro.message : erro);
      return undefined;
    }
  };
}

module.exports = { protegido };
