(() => {
  'use strict';
  const TIERS = {
    obvia: { nome: 'Óbvia', cor: '#d5dfe5', emoji: '⬜', pontos: 10, frase: 'Todo mundo pensou nessa.' },
    esperta: { nome: 'Espertinha', cor: '#d2b0ff', emoji: '🤡', pontos: 15, frase: 'Parecia ousada, mas a galera toda foi nela.' },
    comum: { nome: 'Comum', cor: '#5ee6d3', emoji: '🟩', pontos: 30, frase: 'Boa, subida firme.' },
    rara: { nome: 'Rara', cor: '#7ab4ff', emoji: '🟦', pontos: 60, frase: 'Pouca gente lembra dessa.' },
    rarissima: { nome: 'Raríssima', cor: '#ff7ab8', emoji: '🟪', pontos: 85, frase: 'Quase ninguém chega aqui.' },
    lendaria: { nome: 'Lendária', cor: '#ffd23f', emoji: '🌟', pontos: 100, frase: '' },
    errou: { nome: 'Errou', cor: '#d9d2ea', emoji: '⬛', pontos: 0, frase: 'Escorregou, mas segurou firme.' },
  };
  const FAIXAS = [
    { minimo: 700, nome: 'Cume do Everest' },
    { minimo: 450, nome: 'Quase no céu' },
    { minimo: 350, nome: 'Zona da morte' },
    { minimo: 250, nome: 'Paredão' },
    { minimo: 150, nome: 'Trilha' },
    { minimo: 0, nome: 'Campo base' },
  ];
  const SEGUNDOS_URGENTES = 5;

  const $ = (id) => document.getElementById(id);
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtMetros = (m) => Math.max(0, Math.round(m)).toLocaleString('pt-BR') + ' m';

  const ler = (chave) => { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } };
  const gravar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento, segue a partida */ } };
  const apagar = (chave) => { try { localStorage.removeItem(chave); } catch { /* idem */ } };

  function obterJogador() {
    let id = ler('escalada:jogador');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'j-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      gravar('escalada:jogador', id);
    }
    return id;
  }
  const jogador = obterJogador();

  async function api(caminho, corpo) {
    // Na versão estática (GitHub Pages) não tem servidor: as regras rodam no navegador.
    if (window.apiLocal) return window.apiLocal(caminho, corpo);
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 5000);
    try {
      const r = await fetch(caminho, corpo
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: controle.signal }
        : { signal: controle.signal });
      return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
    } finally {
      clearTimeout(prazo);
    }
  }

  let H = null;
  let E = null;
  let enviando = false;
  let anunciado = false;

  const esc = window.criarEscalada({
    reduzido,
    aoAnunciar: () => { anunciado = true; preencherFeedback(); render(); },
  });
  const cena = window.createMountain($('cv'), $('fx'), $('fail'), esc.S, reduzido);

  // Onde o alpinista aparece depende do layout de cada tela, então quem decide é o CSS (--cena-x e --cena-y).
  function enquadrar() {
    const estilo = getComputedStyle($('palco'));
    esc.S.centroX = Number(estilo.getPropertyValue('--cena-x')) || 0.5;
    esc.S.enquadrar = Number(estilo.getPropertyValue('--cena-y')) || 0;
  }
  if (cena) {
    new ResizeObserver(() => { cena.resize(); enquadrar(); }).observe($('palco'));
    cena.resize();
  }

  const chavePartida = () => `escalada:partida:${H.dia}`;
  const salvar = () => gravar(chavePartida(), E);
  const total = () => E.resultados.reduce((soma, r) => soma + r.pontos, 0);
  const faixaDe = (pontos) => FAIXAS.find((f) => pontos >= f.minimo).nome;

  function render() {
    const f = E ? E.fase : 'inicio';
    const naRodada = f === 'previa' || f === 'resposta' || f === 'feedback';
    $('tela-inicio').hidden = f !== 'inicio';
    $('tela-rodada').hidden = !naRodada;
    $('tela-fim').hidden = f !== 'fim';
    $('hud').hidden = !naRodada;
    $('palco').dataset.fase = f;
    enquadrar();
    if (!naRodada) return;
    const pergunta = H.perguntas[E.rodada];
    $('r-num').textContent = `Pergunta ${E.rodada + 1} de ${H.perguntas.length}`;
    $('r-texto').textContent = pergunta.texto;
    $('cartao').hidden = f === 'feedback';
    $('r-previa').hidden = f !== 'previa';
    $('r-form').hidden = f !== 'resposta';
    $('feedback').hidden = !(f === 'feedback' && anunciado);
    desenharRodadas();
  }

  function desenharRodadas() {
    const caixa = $('h-rodadas');
    if (caixa.children.length !== H.perguntas.length) {
      caixa.replaceChildren(...H.perguntas.map(() => document.createElement('i')));
    }
    [...caixa.children].forEach((quadrado, i) => {
      const r = E.resultados[i];
      quadrado.style.background = r ? TIERS[r.tier].cor : '';
      quadrado.classList.toggle('atual', i === E.rodada && !r);
    });
  }

  function iniciarRodada() {
    anunciado = false;
    E.fase = 'previa';
    E.fimPrevia = Date.now() + H.tempo.previa;
    E.fimResposta = null;
    salvar();
    $('r-input').value = '';
    $('r-erro').textContent = '';
    $('f-proxima').hidden = true;
    render();
  }

  function abrirResposta() {
    E.fase = 'resposta';
    E.fimResposta = E.fimPrevia + H.tempo.resposta;
    salvar();
    render();
    $('r-input').focus();
  }

  async function enviar(texto, final) {
    if (enviando || E.fase !== 'resposta') return;
    enviando = true;
    $('r-botao').disabled = true;
    const rodada = E.rodada;
    const pergunta = H.perguntas[rodada];
    let r = null;
    try {
      r = await api('/api/responder', { dia: H.dia, perguntaId: pergunta.id, resposta: texto, jogador, final });
    } catch {
      r = null;
    }
    enviando = false;
    $('r-botao').disabled = false;
    if (E.fase !== 'resposta' || E.rodada !== rodada) return;
    if (r && r.status === 409) { location.reload(); return; }

    if (!r || !r.ok) {
      if (final) concluir({ perguntaId: pergunta.id, bruta: texto, resposta: null, tier: 'errou', pontos: 0, curiosidade: null });
      else $('r-erro').textContent = 'Sem sinal. Tenta de novo.';
      return;
    }
    if (r.dados.tier) {
      const d = r.dados;
      concluir({ perguntaId: pergunta.id, bruta: texto, resposta: d.resposta || null, tier: d.tier, pontos: d.pontos, curiosidade: d.curiosidade || null });
      return;
    }
    const campo = $('r-input');
    $('r-erro').textContent = `“${texto}” não vale. Tenta outra.`;
    campo.value = '';
    campo.classList.remove('tremer');
    void campo.offsetWidth;
    campo.classList.add('tremer');
    campo.focus();
  }

  function concluir(resultado) {
    E.resultados.push(resultado);
    E.fase = 'feedback';
    salvar();
    anunciado = false;
    render();
    esc.subir(resultado.tier);
  }

  function preencherFeedback() {
    const r = E.resultados[E.resultados.length - 1];
    const t = TIERS[r.tier];
    $('feedback').style.setProperty('--tc', t.cor);
    $('f-tier').textContent = t.nome;
    $('f-resposta').textContent = r.resposta ? `“${r.resposta}”` : r.bruta ? `“${r.bruta}” não valia` : 'O tempo acabou';
    $('f-pontos').textContent = r.pontos ? `+${r.pontos} pontos · sobe ${fmtMetros(r.pontos * esc.METROS_POR_PONTO)}` : 'Nenhum ponto';
    $('f-frase').textContent = r.curiosidade || t.frase;
    $('f-proxima').textContent = E.rodada >= H.perguntas.length - 1 ? 'Ver resultado' : 'Próxima pergunta';
  }

  function proxima() {
    if (E.fase !== 'feedback' || esc.ocupado()) return;
    if (E.rodada >= H.perguntas.length - 1) {
      E.fase = 'fim';
      salvar();
      render();
      mostrarFim();
      return;
    }
    E.rodada++;
    iniciarRodada();
  }

  function atualizarTempo() {
    const restante = Math.max(0, E.fimResposta - Date.now());
    const segundos = Math.ceil(restante / 1000);
    $('r-tempo').textContent = segundos;
    $('r-barra').style.transform = `scaleX(${restante / H.tempo.resposta})`;
    $('r-barra').parentElement.classList.toggle('urgente', segundos <= SEGUNDOS_URGENTES);
    return restante;
  }

  function relogio() {
    if (!E) return;
    if (E.fase === 'previa') {
      const restante = E.fimPrevia - Date.now();
      if (restante <= 0) abrirResposta();
      else $('r-contagem').textContent = Math.ceil(restante / 1000);
    } else if (E.fase === 'resposta') {
      if (atualizarTempo() <= 0 && !enviando) enviar($('r-input').value.trim() || null, true);
    } else if (E.fase === 'feedback' && anunciado && !esc.ocupado() && $('f-proxima').hidden) {
      $('f-proxima').hidden = false;
      $('f-proxima').focus();
    } else if (E.fase === 'fim') {
      atualizarRelogioDoFim();
    }
  }

  let comparacao = null;

  function textoDoResultado() {
    const pontos = total();
    const linhas = [`Escalada #${H.dia}`, `⛰️ ${pontos} pontos · ${fmtMetros(pontos * esc.METROS_POR_PONTO)}`];
    // Percentil contra jogadores simulados não vai pro texto compartilhado.
    if (comparacao && comparacao.melhorQue !== null && !comparacao.simulados) linhas.push(`Melhor que ${comparacao.melhorQue}% dos jogadores`);
    linhas.push(E.resultados.map((r) => TIERS[r.tier].emoji).join(''));
    return linhas.join('\n');
  }

  const vaiCompartilhar = () => Boolean(navigator.share) && matchMedia('(pointer: coarse)').matches;
  const rotuloCompartilhar = () => (vaiCompartilhar() ? 'Compartilhar' : 'Copiar resultado');

  async function compartilhar() {
    const botao = $('b-compartilhar');
    const texto = textoDoResultado();
    try {
      if (vaiCompartilhar()) {
        await navigator.share({ text: texto });
        return;
      }
      await navigator.clipboard.writeText(texto);
      botao.textContent = 'Copiado!';
    } catch {
      botao.textContent = 'Não deu pra copiar';
    }
    setTimeout(() => { botao.textContent = rotuloCompartilhar(); }, 1800);
  }

  const criar = (tag, classe, texto) => {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  };

  // Cada pergunta vira um trecho da via: só o que a pessoa respondeu e quanto valeu.
  function trechoDaVia(r, pergunta, i) {
    const t = TIERS[r.tier];
    const item = criar('li', 'trecho');
    item.dataset.tier = r.tier;
    item.style.setProperty('--tc', t.cor);
    const meio = criar('span', 'trecho-meio');
    meio.append(
      criar('span', 'item-pergunta', pergunta.texto),
      criar('span', 'item-resposta', r.resposta || (r.bruta ? `${r.bruta} (não valia)` : 'Sem resposta')),
    );
    const placar = criar('span', 'item-tier');
    placar.append(criar('b', '', r.pontos ? `+${r.pontos}` : '0'), criar('small', '', t.nome));
    item.append(criar('span', 'trecho-numero', String(i + 1)), meio, placar);
    return item;
  }

  // A subida termina no fuso do servidor (nucleo.cjs usa America/Sao_Paulo).
  const horaDoJogo = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function atualizarRelogioDoFim() {
    const [h, m, s] = horaDoJogo.format(new Date()).split(':').map(Number);
    const resta = (86400 - (h * 3600 + m * 60 + s)) % 86400;
    const dois = (n) => String(n).padStart(2, '0');
    const texto = `${dois(Math.floor(resta / 3600))}:${dois(Math.floor(resta / 60) % 60)}:${dois(resta % 60)}`;
    if ($('fim-relogio').textContent !== texto) $('fim-relogio').textContent = texto;
  }

  // Chama pintar(k) com k indo de 0 a 1 e desacelerando no fim. Sem animação, pinta o final direto.
  function animar(duracao, pintar) {
    if (reduzido) { pintar(1); return; }
    const inicio = performance.now();
    const passo = (agora) => {
      const k = Math.min(1, (agora - inicio) / duracao);
      pintar(1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // Curva suave feita do histograma do servidor: uma gaussiana no centro de cada faixa de pontos.
  // A área à esquerda da sua nota, que é quem ficou atrás de você, vai em dourado.
  function desenharCurva(c, pontos) {
    const { largura, contagens } = c.distribuicao;
    const ultima = contagens.reduce((u, n, i) => (n ? i : u), 0);
    const teto = Math.min(contagens.length * largura, Math.max(300, Math.ceil(Math.max((ultima + 2) * largura, pontos + largura) / 100) * 100));
    const svg = $('fim-curva');
    const L = Math.max(200, Math.round(svg.clientWidth || 300));
    const A = 84;
    const passos = 96;
    const sigma = largura * 1.15;
    const alturas = [];
    for (let k = 0; k <= passos; k++) {
      const x = (k / passos) * teto;
      alturas.push(contagens.reduce((soma, n, i) => {
        const z = (x - (i + 0.5) * largura) / sigma;
        return soma + n * Math.exp(-0.5 * z * z);
      }, 0));
    }
    const pico = Math.max(...alturas) || 1;
    const linha = alturas.map((d, k) => `${k ? 'L' : 'M'}${((k / passos) * L).toFixed(1)} ${(A - 2 - (d / pico) * (A - 12)).toFixed(1)}`).join('');
    const area = `${linha}L${L} ${A}L0 ${A}Z`;
    const xv = (Math.min(1, pontos / teto) * L).toFixed(1);
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    svg.innerHTML = `<defs><pattern id="curva-xadrez" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2"/><rect x="2" y="2" width="2" height="2"/></pattern>`
      + `<clipPath id="curva-atras"><rect class="curva-corte" width="${xv}" height="${A}"/></clipPath></defs>`
      + `<path class="curva-resto" d="${area}"/><path class="curva-ganha" d="${area}" clip-path="url(#curva-atras)"/>`
      + `<path class="curva-linha" d="${linha}"/><line class="curva-marca" x1="${xv}" x2="${xv}" y1="0" y2="${A}"/>`;
    $('fim-voce').style.left = `${Math.min(90, Math.max(10, (xv / L) * 100))}%`;
    $('fim-teto').textContent = `${teto} pts`;
  }

  function mostrarComparacao(c, pontos) {
    const caixa = $('fim-comparacao');
    const titulo = $('fim-melhor');
    if (!c) {
      caixa.dataset.estado = 'erro';
      titulo.textContent = 'Não deu pra comparar com quem subiu hoje.';
      return;
    }
    if (c.melhorQue === null) {
      caixa.dataset.estado = 'poucos';
      titulo.replaceChildren(
        c.jogadores === 1 ? 'Você é o primeiro a chegar hoje!' : `Só ${c.jogadores} pessoas terminaram hoje.`,
        criar('small', '', `A comparação aparece quando ${c.minimo} pessoas terminarem.`),
      );
      return;
    }
    caixa.dataset.estado = 'pronto';
    const jogadores = c.jogadores.toLocaleString('pt-BR');
    $('fim-jogadores').textContent = c.simulados ? `${jogadores} jogadores · ${c.simulados} simulados` : `${jogadores} jogadores hoje`;
    desenharCurva(c, pontos);
    if (c.melhorQue === 100) {
      titulo.replaceChildren('Melhor que ', criar('b', '', 'todo mundo'), ' hoje!');
    } else {
      const numero = criar('b', '', '0%');
      titulo.replaceChildren('Melhor que ', numero, ' dos jogadores de hoje');
      animar(1100, (k) => { numero.textContent = `${Math.round(c.melhorQue * k)}%`; });
    }
    if (!reduzido) {
      caixa.classList.remove('entrando');
      void caixa.offsetWidth;
      caixa.classList.add('entrando');
    }
  }

  async function buscarComparacao(pontos) {
    let r = null;
    try {
      r = await api(`/api/placar?dia=${H.dia}&jogador=${encodeURIComponent(jogador)}`);
    } catch {
      r = null;
    }
    comparacao = r && r.ok ? r.dados : null;
    mostrarComparacao(comparacao, comparacao ? comparacao.pontos : pontos);
  }

  function mostrarFim() {
    const pontos = total();
    const metros = pontos * esc.METROS_POR_PONTO;
    $('fim-dia').textContent = `Dia ${H.dia} · fim da subida`;
    $('fim-faixa').textContent = faixaDe(pontos);
    $('fim-lista').replaceChildren(...E.resultados.map((r, i) => trechoDaVia(r, H.perguntas[i], i)));
    $('fim-teste').hidden = !H.modoTeste;
    $('b-compartilhar').textContent = rotuloCompartilhar();
    atualizarRelogioDoFim();
    if (!reduzido) $('tela-fim').classList.add('contando');
    animar(1500, (k) => {
      $('fim-metros').textContent = Math.round(metros * k).toLocaleString('pt-BR');
      $('fim-pontos').textContent = Math.round(pontos * k);
    });
    buscarComparacao(pontos);
  }

  async function reiniciarDia() {
    try { await api('/api/reiniciar', { dia: H.dia, jogador }); } catch { /* o recarregamento mostra o estado real */ }
    apagar(chavePartida());
    location.reload();
  }

  function legenda() {
    $('i-legenda').replaceChildren(...['obvia', 'esperta', 'comum', 'rara', 'rarissima', 'lendaria'].map((id) => {
      const li = document.createElement('li');
      const nome = document.createElement('span');
      nome.textContent = TIERS[id].nome;
      nome.style.color = TIERS[id].cor;
      const pontos = document.createElement('b');
      pontos.textContent = TIERS[id].pontos;
      li.append(nome, pontos);
      return li;
    }));
  }

  async function iniciar() {
    legenda();
    const pedido = new URLSearchParams(location.search).get('dia');
    let r = null;
    try {
      r = await api('/api/hoje' + (pedido ? `?dia=${encodeURIComponent(pedido)}` : ''));
    } catch {
      r = null;
    }
    if (!r || !r.ok) {
      $('i-dia').textContent = '';
      $('i-erro').textContent = 'Não consegui carregar as perguntas. Recarregue a página.';
      $('i-erro').hidden = false;
      return;
    }
    H = r.dados;
    $('i-dia').textContent = `Dia ${H.dia}`;
    $('b-comecar').disabled = false;

    const assinatura = H.perguntas.map((p) => p.id).join();
    const salvo = ler(chavePartida());
    E = salvo && salvo.assinatura === assinatura
      ? salvo
      : { assinatura, fase: 'inicio', rodada: 0, fimPrevia: null, fimResposta: null, resultados: [] };
    esc.definir(total());

    if (E.fase === 'feedback') { anunciado = true; preencherFeedback(); }
    render();
    if (E.fase === 'fim') mostrarFim();
    if (E.fase === 'resposta') $('r-input').focus();
  }

  $('b-comecar').addEventListener('click', () => { if (E && E.fase === 'inicio') iniciarRodada(); });
  $('r-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const texto = $('r-input').value.trim();
    if (texto) enviar(texto, false);
  });
  $('f-proxima').addEventListener('click', proxima);
  $('b-compartilhar').addEventListener('click', compartilhar);
  $('b-repetir').addEventListener('click', reiniciarDia);
  $('b-proximo').addEventListener('click', () => { location.search = `?dia=${H.dia + 1}`; });

  setInterval(relogio, 100);

  let ultimo = performance.now();
  function quadro(agora) {
    requestAnimationFrame(quadro);
    if (document.hidden) { ultimo = agora; return; }
    if (agora - ultimo < (reduzido ? 100 : 33)) return;
    const dt = Math.min(0.12, (agora - ultimo) / 1000);
    ultimo = agora;
    esc.atualizar(dt);
    if (cena) cena.draw(dt);
    $('h-alt').textContent = fmtMetros(esc.S.alt);
    $('h-pts').textContent = esc.S.score;
  }
  requestAnimationFrame(quadro);

  iniciar();
})();
