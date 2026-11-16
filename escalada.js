'use strict';
/* Simulação da subida: cada tier vira um movimento. A cena só lê o estado S,
   então trocar a arte não mexe nas regras. */
window.criarEscalada = function ({ reduzido, aoAnunciar }) {
  const CUME = 8848, METROS_POR_PONTO = CUME / 700;
  const PONTOS = { obvia: 10, esperta: 15, comum: 30, rara: 60, rarissima: 85, lendaria: 100, errou: 0 };
  const DURACAO = { obvia: 1.6, esperta: 2.1, comum: 1.8, rara: 1.5, rarissima: 1.9, lendaria: 2.9, errou: 1.4 };
  const INICIO_DO_PULO_LENDARIO = 0.98;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
  const easeOut4 = (t) => 1 - Math.pow(1 - t, 4);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeIn3 = (t) => t * t * t;

  const S = { alt: 0, camAlt: 0, score: 0, pose: 'idle', x: 0, out: 0, squash: 0, trail: [], trailOn: false, impact: 0, impactFrame: 0,
    shake: 0, charge: 0, time: 0, landT: -9, landPower: 0, freeze: false, action: null, snap: 0 };
  const fila = [];

  function comecar(id) {
    const A0 = S.alt, gain = Math.max(0, Math.min(PONTOS[id] * METROS_POR_PONTO, CUME - A0));
    S.action = { id, t: 0, A0, gain, dur: DURACAO[id], x0: S.x, landed: false, grab: false, anunciado: false };
    if (id !== 'lendaria' || reduzido) anunciar(S.action);
  }
  function anunciar(a) {
    if (a.anunciado) return;
    a.anunciado = true;
    aoAnunciar(a.id);
  }
  function pousar(a, p) {
    if (a.landed) return;
    a.landed = true; S.landT = S.time; S.landPower = p;
    S.squash = Math.max(S.squash, 0.35 + p * 0.3); S.shake = Math.max(S.shake, p * 0.8);
  }
  function mover(a) {
    const t = a.t, A0 = a.A0, g = a.gain;
    S.trailOn = false; S.out = 0;
    switch (a.id) {
      case 'obvia': {
        const n = 4, k = clamp(t / a.dur) * n, i = Math.min(n - 1, Math.floor(k)), f = k - i;
        S.alt = A0 + g * (i + easeIO(clamp((f - 0.45) / 0.55))) / n;
        S.pose = f < 0.45 ? (i % 2 ? 'reachR' : 'reachL') : 'pull';
        break;
      }
      case 'esperta': {
        if (t < 0.25) { S.pose = 'crouch'; S.alt = A0; S.squash = 0.3 * (t / 0.25); }
        else if (t < 0.7) { const p = (t - 0.25) / 0.45; S.pose = 'jump'; S.alt = A0 + g * 1.7 * easeOut3(p); S.out = Math.sin(p * Math.PI) * 0.8; }
        else if (t < 0.88) { S.pose = 'flail'; S.alt = A0 + g * 1.7; }
        else if (t < 1.25) { const p = (t - 0.88) / 0.37; S.pose = 'slip'; S.alt = A0 + g * 1.7 - g * 1.2 * easeIn3(p); S.shake = Math.max(S.shake, 0.15); }
        else {
          if (!a.grab) { a.grab = true; S.shake = 0.5; S.squash = 0.3; }
          const p = clamp((t - 1.25) / 0.85);
          S.pose = Math.floor(p * 4) % 2 ? 'reachR' : 'reachL';
          S.alt = A0 + g * 0.5 + g * 0.5 * easeIO(p);
        }
        break;
      }
      case 'comum': {
        const p = clamp(t / a.dur);
        S.alt = A0 + g * easeIO(p) + Math.sin(p * Math.PI * 6) * 3;
        S.pose = Math.floor(t * 5) % 2 ? 'ropeA' : 'ropeB';
        break;
      }
      case 'rara': {
        if (t < 0.22) { S.pose = 'crouch'; S.alt = A0; S.squash = 0.35 * (t / 0.22); }
        else if (t < 1.1) { const p = (t - 0.22) / 0.88; S.pose = 'jump'; S.alt = A0 + g * easeOut3(p); S.x = lerp(a.x0, a.x0 > 0 ? -0.55 : 0.55, easeIO(p)); S.out = Math.sin(p * Math.PI) * 1.4; }
        else { pousar(a, 0.5); S.pose = 'land'; S.alt = A0 + g; }
        break;
      }
      case 'rarissima': {
        if (t < 0.35) { S.pose = 'crouch'; S.alt = A0; S.charge = t / 0.35 * 0.5; S.squash = 0.4 * (t / 0.35); }
        else if (t < 1.45) { const p = (t - 0.35) / 1.1; S.pose = 'superjump'; S.alt = A0 + g * easeOutExpo(p); S.trailOn = p < 0.85; S.out = Math.sin(p * Math.PI) * 2.6; S.x = Math.sin(p * Math.PI) * 0.35 * (a.x0 > 0 ? -1 : 1); }
        else { pousar(a, 0.8); S.pose = 'land'; S.alt = A0 + g; }
        break;
      }
      case 'lendaria': {
        if (t < 0.6) { const c = t / 0.6; S.pose = 'charge'; S.alt = A0; S.charge = c; S.squash = 0.45 * c; S.shake = Math.max(S.shake, 0.35 * c); }
        else if (t < INICIO_DO_PULO_LENDARIO) { S.pose = 'blast'; S.freeze = true; S.impact = 1; S.impactFrame = Math.floor((t - 0.6) / 0.065); S.alt = A0 + g * 0.02; S.squash = -0.3; }
        else if (t < 2.4) { const p = (t - INICIO_DO_PULO_LENDARIO) / 1.42; S.pose = 'hyper'; S.alt = A0 + g * easeOut4(p); S.trailOn = p < 0.9; S.out = Math.sin(p * Math.PI) * 4; S.shake = Math.max(S.shake, 0.5 * (1 - p)); }
        else { pousar(a, 1.2); S.pose = 'land'; S.alt = A0 + g; }
        break;
      }
      case 'errou': {
        if (t < 0.45) { const p = t / 0.45; S.pose = 'slip'; S.alt = A0 - 45 * easeOut3(p); S.shake = Math.max(S.shake, 0.12); }
        else if (t < 0.7) { S.pose = 'hang'; S.alt = A0 - 45; }
        else { const p = clamp((t - 0.7) / 0.7); S.pose = Math.floor(p * 4) % 2 ? 'reachR' : 'reachL'; S.alt = A0 - 45 + 45 * easeIO(p); }
        break;
      }
    }
  }

  function atualizar(dt) {
    S.time += dt; S.impact = 0; S.charge = 0; S.freeze = false;
    S.squash *= Math.pow(0.004, dt); S.shake *= Math.pow(0.02, dt);
    if (!S.action && fila.length) comecar(fila.shift());
    const a = S.action;
    if (a) {
      a.t += dt;
      if (a.id === 'lendaria' && a.t >= INICIO_DO_PULO_LENDARIO) anunciar(a);
      mover(a);
      if (a.t >= a.dur) {
        S.alt = a.A0 + a.gain;
        S.score = Math.min(700, S.score + PONTOS[a.id]);
        S.action = null; S.trailOn = false; S.out = 0;
      }
    }
    if (!S.action) { S.pose = S.alt >= CUME - 1 ? 'summit' : 'idle'; S.out = 0; S.x *= Math.pow(0.2, dt); }
    if (!S.freeze) S.camAlt += (S.alt - S.camAlt) * Math.min(1, dt * 4.2);
    if (S.trailOn) S.trail.push({ alt: S.alt, x: S.x, out: S.out, t: S.time });
    while (S.trail.length && S.time - S.trail[0].t > 0.35) S.trail.shift();
    if (reduzido) S.shake = 0;
  }

  return {
    S,
    METROS_POR_PONTO,
    atualizar,
    subir: (tier) => fila.push(tier),
    ocupado: () => !!S.action || fila.length > 0,
    definir(pontos) {
      fila.length = 0; S.action = null; S.score = pontos;
      S.alt = S.camAlt = Math.min(CUME, pontos * METROS_POR_PONTO);
      S.trail = []; S.x = 0; S.trailOn = false; S.out = 0; S.impact = 0; S.squash = 0; S.snap++;
    },
  };
};
