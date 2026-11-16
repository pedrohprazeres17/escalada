/* Gerado por gerar-pages.cjs a partir de nucleo.cjs e api.cjs. Não edite aqui. */
(() => {
  const modulos = {};
  const definir = (nome, fn) => { modulos[nome] = { fn, exports: null }; };
  const exigir = (nome) => {
    const m = modulos[nome];
    if (!m) return {};
    if (!m.exports) {
      const module = { exports: {} };
      m.fn(module, module.exports, exigir);
      m.exports = module.exports;
    }
    return m.exports;
  };
  definir('./nucleo.cjs', function (module, exports, require) {
'use strict';
/* Regras do jogo, sem HTTP nem disco de partidas: dá pra levar pra qualquer backend. */
const fs = require('node:fs');
const path = require('node:path');

const PONTOS = { obvia: 10, esperta: 15, comum: 30, rara: 60, rarissima: 85, lendaria: 100, errou: 0 };
const TIERS_DA_LISTA = ['obvia', 'esperta', 'comum', 'rara', 'rarissima'];
const RODADAS = 7;
const TEMPO = { previa: 3000, resposta: 25000 };
const PRIMEIRO_DIA = '2026-11-10';
const FUSO = 'America/Sao_Paulo';
const TAMANHO_MAXIMO_RESPOSTA = 80;

const formatoData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

function carregarDias(arquivo = path.join(__dirname, 'perguntas.json')) {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8')).dias;
}

function dataLocal(agora = new Date()) {
  return formatoData.format(agora);
}

function numeroDoDia(data) {
  const emDias = (d) => Date.UTC(...d.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / 864e5;
  return Math.max(1, emDias(data) - emDias(PRIMEIRO_DIA) + 1);
}

function perguntasDoDia(dias, numero) {
  return dias[(numero - 1) % dias.length];
}

function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(o|a|os|as|um|uma|uns|umas|the)\s+/, '');
}

function singular(chave) {
  return chave.length > 3 && chave.endsWith('s') ? chave.slice(0, -1) : chave;
}

function construirIndice(pergunta) {
  const exatas = new Map();
  const singulares = new Map();
  const adicionar = (itens, tier, curiosidade) => {
    for (const item of itens) {
      const formas = item.split('|');
      const entrada = { resposta: formas[0], tier, pontos: PONTOS[tier], ...(curiosidade ? { curiosidade } : {}) };
      for (const forma of formas) {
        const chave = normalizar(forma);
        const repetida = exatas.get(chave);
        if (repetida && repetida !== entrada) {
          throw new Error(`Resposta repetida em "${pergunta.id}": ${forma}`);
        }
        exatas.set(chave, entrada);
        if (!singulares.has(singular(chave))) singulares.set(singular(chave), entrada);
      }
    }
  };
  adicionar([pergunta.lendaria.resposta], 'lendaria', pergunta.lendaria.curiosidade);
  for (const tier of TIERS_DA_LISTA) adicionar(pergunta[tier], tier);
  return { exatas, singulares };
}

function distancia(a, b, limite) {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, atual[j]);
    }
    if (menor > limite) return limite + 1;
    anterior = atual;
  }
  return anterior[b.length];
}

/* Devolve a entrada da resposta, ou null se ela não vale. Erros de digitação pequenos são aceitos. */
function avaliar(indice, texto) {
  const chave = normalizar(texto);
  if (!chave) return null;
  const direta = indice.exatas.get(chave) || indice.singulares.get(singular(chave));
  if (direta) return { ...direta, corrigida: false };

  const limite = chave.length < 5 ? 0 : chave.length < 9 ? 1 : 2;
  if (limite === 0) return null;
  let melhor = null;
  let menor = Infinity;
  let empate = false;
  for (const [candidata, entrada] of indice.exatas) {
    if (Math.abs(candidata.length - chave.length) > limite) continue;
    const d = distancia(chave, candidata, limite);
    if (d > limite) continue;
    if (d < menor) {
      menor = d;
      melhor = entrada;
      empate = false;
    } else if (d === menor && entrada !== melhor) {
      empate = true;
    }
  }
  return melhor && !empate ? { ...melhor, corrigida: true } : null;
}

/* Compara a nota com a de quem já terminou o dia: percentil e histograma em faixas de 25 pontos.
   `grupos` são as notas dos outros como [[pontos, quantidade], ...], que é o que o banco devolve.
   "Melhor que" conta só quem ficou estritamente abaixo. Com pouca gente, o percentil não diz nada e volta null. */
const LARGURA_DA_FAIXA = 25;
const MINIMO_PARA_COMPARAR = 10;
function comparar(minha, grupos) {
  const contagens = new Array(Math.ceil((RODADAS * PONTOS.lendaria) / LARGURA_DA_FAIXA)).fill(0);
  const faixa = (pontos) => Math.min(contagens.length - 1, Math.floor(pontos / LARGURA_DA_FAIXA));
  let outras = 0;
  let abaixo = 0;
  for (const [pontos, quantidade] of grupos) {
    contagens[faixa(pontos)] += quantidade;
    outras += quantidade;
    if (pontos < minha) abaixo += quantidade;
  }
  contagens[faixa(minha)]++;
  const jogadores = outras + 1;
  return {
    jogadores,
    melhorQue: jogadores >= MINIMO_PARA_COMPARAR ? Math.floor((100 * abaixo) / outras) : null,
    distribuicao: { largura: LARGURA_DA_FAIXA, contagens },
  };
}

/* Lista de notas → [[pontos, quantidade], ...]. */
function agrupar(notas) {
  const mapa = new Map();
  for (const p of notas) mapa.set(p, (mapa.get(p) || 0) + 1);
  return [...mapa];
}

module.exports = {
  PONTOS, TIERS_DA_LISTA, RODADAS, TEMPO, TAMANHO_MAXIMO_RESPOSTA, MINIMO_PARA_COMPARAR,
  carregarDias, dataLocal, numeroDoDia, perguntasDoDia, normalizar, construirIndice, avaliar, comparar, agrupar,
};

  });
  definir('./api.cjs', function (module, exports, require) {
'use strict';
/* Regras da API sem HTTP nem disco: recebem o pedido já lido e devolvem o objeto da resposta.
   O servidor (servidor.cjs) usa com o banco SQLite. A versão estática do GitHub Pages usa no
   navegador, com um banco guardado no localStorage. O banco precisa de: resultado, registrar,
   pontos, distribuicao e apagar (veja banco.cjs). */
const N = require('./nucleo.cjs');

const FORMATO_JOGADOR = /^[A-Za-z0-9-]{8,64}$/;

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/* Modo teste: jogadores de mentira pra curva aparecer mesmo com uma pessoa só jogando.
   As chances por tier são um chute; a soma de 7 rodadas já dá um sino em volta de ~200 pontos. */
const CHANCES_SIMULADAS = [['errou', 0.12], ['obvia', 0.3], ['esperta', 0.08], ['comum', 0.25], ['rara', 0.15], ['rarissima', 0.08], ['lendaria', 0.02]];
function simularPontuacoes(dia, quantidade) {
  let semente = Math.imul(dia, 2654435761) >>> 0;
  const sortear = () => {
    semente = (semente + 0x6d2b79f5) >>> 0;
    let t = Math.imul(semente ^ (semente >>> 15), semente | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: quantidade }, () => {
    let soma = 0;
    for (let i = 0; i < N.RODADAS; i++) {
      let resto = sortear();
      const [tier] = CHANCES_SIMULADAS.find(([, chance]) => (resto -= chance) < 0) || ['errou'];
      soma += N.PONTOS[tier];
    }
    return soma;
  });
}

function criarApi({ dias, banco, modoTeste = false, jogadoresSimulados = modoTeste ? 400 : 0, agora = () => new Date() }) {
  const indices = new Map(dias.flat().map((pergunta) => [pergunta.id, N.construirIndice(pergunta)]));

  const diaDeHoje = () => N.numeroDoDia(N.dataLocal(agora()));
  const diaPedido = (valor) => {
    const numero = Number(valor);
    return modoTeste && Number.isInteger(numero) && numero >= 1 ? numero : diaDeHoje();
  };
  const validarDia = (dia) => {
    if (!Number.isInteger(dia) || dia < 1) throw new ErroHttp(400, 'Dia inválido.');
    if (!modoTeste && dia !== diaDeHoje()) throw new ErroHttp(409, 'O dia virou. Recarregue a página.');
  };
  const validarJogador = (jogador) => {
    if (typeof jogador !== 'string' || !FORMATO_JOGADOR.test(jogador)) throw new ErroHttp(400, 'Jogador inválido.');
  };

  function hoje(url) {
    const dia = diaPedido(url.searchParams.get('dia'));
    return {
      dia,
      modoTeste,
      tempo: N.TEMPO,
      perguntas: N.perguntasDoDia(dias, dia).map(({ id, texto }) => ({ id, texto })),
    };
  }

  function responder(corpo) {
    const { dia, perguntaId, resposta = null, jogador, final = false } = corpo;
    validarDia(dia);
    validarJogador(jogador);
    if (resposta !== null && (typeof resposta !== 'string' || resposta.length > N.TAMANHO_MAXIMO_RESPOSTA)) {
      throw new ErroHttp(400, 'Resposta inválida.');
    }
    const pergunta = N.perguntasDoDia(dias, dia).find((p) => p.id === perguntaId);
    if (!pergunta) throw new ErroHttp(404, 'Pergunta não encontrada.');

    const registrado = banco.resultado(dia, jogador, perguntaId);
    if (registrado) return registrado;

    const avaliacao = resposta === null ? null : N.avaliar(indices.get(perguntaId), resposta);
    if (!avaliacao && !final && resposta !== null) return { aceita: false };

    const resultado = avaliacao
      ? { aceita: true, ...avaliacao }
      : { aceita: false, registrada: true, tier: 'errou', pontos: 0 };
    return banco.registrar(dia, jogador, perguntaId, { ...resultado, bruta: resposta }, N.perguntasDoDia(dias, dia).length);
  }

  function placar(url) {
    const dia = Number(url.searchParams.get('dia'));
    const jogador = url.searchParams.get('jogador');
    validarDia(dia);
    validarJogador(jogador);
    const minha = banco.pontos(dia, jogador);
    if (minha === null) throw new ErroHttp(403, 'A comparação só abre depois que você termina o dia.');
    const simuladas = jogadoresSimulados ? N.agrupar(simularPontuacoes(dia, jogadoresSimulados)) : [];
    return { dia, pontos: minha, minimo: N.MINIMO_PARA_COMPARAR, simulados: jogadoresSimulados, ...N.comparar(minha, banco.distribuicao(dia, jogador).concat(simuladas)) };
  }

  function reiniciar(corpo) {
    if (!modoTeste) throw new ErroHttp(404, 'Não encontrado.');
    validarDia(corpo.dia);
    validarJogador(corpo.jogador);
    banco.apagar(corpo.dia, corpo.jogador);
    return { ok: true };
  }

  return { hoje, responder, placar, reiniciar };
}

module.exports = { criarApi, ErroHttp, simularPontuacoes };

  });
  window.Regras = exigir('./api.cjs');
})();
