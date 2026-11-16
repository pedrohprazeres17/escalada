/* Versão estática (GitHub Pages): sem servidor, as regras de api.cjs rodam aqui no navegador.
   As partidas ficam no localStorage e a comparação usa só jogadores simulados.
   As listas de respostas vêm junto pro navegador, então isto serve pra demonstração, não pra produção.
   O jogo.js chama window.apiLocal no lugar do fetch quando ela existe. */
(() => {
  'use strict';
  const { criarApi, ErroHttp } = window.Regras;
  const PREFIXO = 'escalada:demo:';

  // Mesmo contrato do banco.cjs. Cada partida (dia + jogador) fica numa chave do localStorage;
  // se o navegador não deixar gravar, ela vale só enquanto a aba estiver aberta.
  const memoria = new Map();
  const ler = (chave) => {
    try {
      const salvo = JSON.parse(localStorage.getItem(PREFIXO + chave));
      if (salvo) return salvo;
    } catch { /* cai na memória */ }
    return memoria.get(chave) || { resultados: {}, pontos: null };
  };
  const gravar = (chave, partida) => {
    memoria.set(chave, partida);
    try { localStorage.setItem(PREFIXO + chave, JSON.stringify(partida)); } catch { /* fica só na memória */ }
  };
  const banco = {
    resultado: (dia, jogador, pergunta) => ler(`${dia}:${jogador}`).resultados[pergunta] || null,
    registrar(dia, jogador, pergunta, resultado, rodadas) {
      const chave = `${dia}:${jogador}`;
      const partida = ler(chave);
      partida.resultados[pergunta] ||= resultado;
      const respondidas = Object.values(partida.resultados);
      if (partida.pontos === null && respondidas.length >= rodadas) partida.pontos = respondidas.reduce((soma, r) => soma + r.pontos, 0);
      gravar(chave, partida);
      return partida.resultados[pergunta];
    },
    pontos: (dia, jogador) => ler(`${dia}:${jogador}`).pontos,
    distribuicao: () => [],
    apagar(dia, jogador) {
      memoria.delete(`${dia}:${jogador}`);
      try { localStorage.removeItem(`${PREFIXO}${dia}:${jogador}`); } catch { /* nada a apagar */ }
    },
  };

  let rotas = null;
  const preparar = () => {
    rotas ||= fetch('perguntas.json')
      .then((r) => { if (!r.ok) throw new Error(`perguntas.json: ${r.status}`); return r.json(); })
      .then(({ dias }) => criarApi({ dias, banco, modoTeste: true }))
      .catch((erro) => { rotas = null; throw erro; });
    return rotas;
  };

  window.apiLocal = async (caminho, corpo) => {
    try {
      const api = await preparar();
      const url = new URL(caminho, 'https://jogo.local');
      const rota = `${corpo ? 'POST' : 'GET'} ${url.pathname}`;
      const dados = rota === 'GET /api/hoje' ? api.hoje(url)
        : rota === 'POST /api/responder' ? api.responder(corpo)
          : rota === 'GET /api/placar' ? api.placar(url)
            : rota === 'POST /api/reiniciar' ? api.reiniciar(corpo)
              : null;
      if (!dados) return { ok: false, status: 404, dados: { erro: 'Não encontrado.' } };
      return { ok: true, status: 200, dados: JSON.parse(JSON.stringify(dados)) };
    } catch (erro) {
      if (erro instanceof ErroHttp) return { ok: false, status: erro.status, dados: { erro: erro.message } };
      console.error(erro);
      throw erro;
    }
  };
})();
