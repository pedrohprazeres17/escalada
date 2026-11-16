/* Cena "retrô 64" da Escalada.
   A montanha é uma pirâmide low-poly e o personagem sobe pela aresta de uma das faces.
   A câmera fica de lado: a face aparece à direita e o vazio além da crista, à esquerda.
   A imagem é desenhada em baixa resolução, com cor de 16 bits e dither, e ampliada sem
   suavização, como num console de 64 bits. Geometria e texturas são procedurais e originais.
   Contrato: createMountain(canvas, fx, fail, S, reduzido) → { draw(dt), resize() }.
   A cena só lê o estado S da simulação (jogo/publico/escalada.js).
   Dois campos opcionais tiram o alpinista de trás da interface:
   S.enquadrar (em unidades da cena) abaixa o ponto pra onde a câmera olha e sobe o alpinista na tela;
   S.centroX (0 a 1) diz em que fração da largura ele fica, deslocando a lente. */
window.createMountain = function (canvas, fx, fail, S, reduced) {
  'use strict';
  const T = window.THREE;
  if (!T) { fail.hidden = false; return null; }
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (erro) {
    fail.hidden = false;
    return null;
  }
  renderer.setPixelRatio(1);
  canvas.style.imageRendering = 'pixelated';
  if (fx) fx.style.display = 'none';

  /* ---------- constantes ---------- */
  const CUME = 8848;           // metros
  const YT = 210;              // altura do cume na cena (1 unidade ≈ 42 m)
  const Y_NUVEM = 62;          // mar de nuvens, perto de 2.600 m
  const LINHAS = 300;          // linhas da imagem interna
  const NT = 128, NY = 100;    // malha da montanha
  const LAT0 = 0.95, LATK = 1.3; // a via fica na face da direita, perto da crista
  const TAU = Math.PI * 2;
  const V3 = T.Vector3;
  const COR_TIER = { obvia: '#d5dfe5', esperta: '#d2b0ff', comum: '#5ee6d3', rara: '#7ab4ff', rarissima: '#ff7ab8', lendaria: '#ffd23f', errou: '#d9d2ea' };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const suave = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const saidaCubica = (t) => 1 - Math.pow(1 - clamp(t), 3);
  let semente = 20261111;
  const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  const entre = (a, b) => a + (b - a) * rnd();
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  function ruido(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
    return mix(
      mix(mix(h(0, 0, 0), h(1, 0, 0), xf), mix(h(0, 1, 0), h(1, 1, 0), xf), yf),
      mix(mix(h(0, 0, 1), h(1, 0, 1), xf), mix(h(0, 1, 1), h(1, 1, 1), xf), yf), zf) * 2 - 1;
  }
  function ruidoCiclico(x, y, n, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const h = (a, b) => hash3(((xi + a) % n + n) % n, ((yi + b) % n + n) % n, s);
    return mix(mix(h(0, 0), h(1, 0), xf), mix(h(0, 1), h(1, 1), xf), yf);
  }

  /* ---------- texturas pequenas, como num cartucho ---------- */
  function textura(w, h, pintar, repetir, pixel) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    pintar(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    if (repetir) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = pixel ? T.NearestFilter : T.LinearFilter;
    t.minFilter = pixel ? T.NearestFilter : T.LinearMipmapLinearFilter;
    return t;
  }
  function pixels(g, w, h, f) {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = f(x, y), k = (y * w + x) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = c[3];
    }
    g.putImageData(img, 0, 0);
  }
  const texRocha = textura(32, 32, (g, w, h) => pixels(g, w, h, (x, y) => {
    let v = 0.76 + 0.15 * ruidoCiclico(x / 4, y / 4, 8, 1) + 0.08 * ruidoCiclico(x / 2, y / 2, 16, 2) + (hash3(x, y, 3) - 0.5) * 0.08;
    if ((y + Math.floor(ruidoCiclico(x / 8, 0.5, 4, 4) * 4)) % 8 === 0) v -= 0.13;
    if (hash3(x, y, 5) > 0.965) v -= 0.18;
    v = clamp(v) * 255;
    return [v, v, v * 0.97, 255];
  }), true, false);
  const texGrama = textura(32, 32, (g, w, h) => pixels(g, w, h, (x, y) => {
    let v = 0.8 + 0.13 * ruidoCiclico(x / 4, y / 4, 8, 6) + (hash3(x, y, 7) - 0.5) * 0.16;
    if (hash3(x, y, 8) > 0.9) v += 0.13;
    v = clamp(v) * 255;
    return [v, v, v * 0.86, 255];
  }), true, false);
  const texNuvem = (limiar, s) => textura(128, 128, (g, w, h) => pixels(g, w, h, (x, y) => {
    const f = 0.6 * ruidoCiclico(x / 16, y / 16, 8, s) + 0.3 * ruidoCiclico(x / 8, y / 8, 16, s + 1) + 0.1 * ruidoCiclico(x / 4, y / 4, 32, s + 2);
    const a = suave(limiar, limiar + 0.16, f);
    const v = 228 + 27 * a;
    return [v, v, 255, a * 255];
  }), true, false);
  const texRosto = textura(128, 64, (g) => {
    g.fillStyle = '#f2bc92'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#5b3a24';
    g.fillRect(0, 16, 128, 13);
    g.fillRect(74, 16, 44, 26);
    for (const x of [0, 64, 128]) { g.fillRect(x - 6, 27, 4, 7); g.fillRect(x + 2, 27, 4, 7); }
    g.fillStyle = '#e5a47c';
    for (const x of [0, 64, 128]) { g.beginPath(); g.ellipse(x, 36, 3, 4, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#3b2618'; g.fillRect(22, 29, 6, 2); g.fillRect(36, 29, 6, 2);
    g.fillStyle = '#1d1726';
    for (const x of [25, 39]) { g.beginPath(); g.ellipse(x, 36, 2.4, 3.6, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#ffffff'; g.fillRect(24, 34, 1, 2); g.fillRect(38, 34, 1, 2);
    g.fillStyle = 'rgba(240,120,110,.75)';
    for (const x of [19, 45]) { g.beginPath(); g.ellipse(x, 42, 2.8, 1.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#8a3b2e'; g.fillRect(30, 45, 4, 1); g.fillRect(29, 44, 1, 1); g.fillRect(34, 44, 1, 1);
  }, false, false);
  const texBrilho = textura(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  }, false, false);
  const texEstrela = textura(8, 8, (g) => {
    g.fillStyle = '#fff';
    ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'].forEach((linha, y) =>
      [...linha].forEach((ch, x) => { if (ch === '#') g.fillRect(x, y, 1, 1); }));
  }, false, true);

  /* ---------- cena, luz e céu ---------- */
  const cena = new T.Scene();
  cena.fog = new T.Fog(0xbcd9f0, 90, 760);
  const sol = new T.DirectionalLight(0xffffff, 1);
  cena.add(sol, sol.target);
  const amb = new T.HemisphereLight(0xffffff, 0x666655, 0.7);
  cena.add(amb);
  const preenche = new T.DirectionalLight(0xffffff, 0.3);
  cena.add(preenche, preenche.target);
  const ceuU = {
    uTopo: { value: new T.Color() }, uHor: { value: new T.Color() }, uBaixo: { value: new T.Color() },
    uSolDir: { value: new V3(0, 1, 0) }, uSolCor: { value: new T.Color() },
    uEstrelas: { value: 0 }, uAurora: { value: 0 }, uTempo: { value: 0 }, uNevoa: { value: 0 }, uCorNevoa: { value: new T.Color() },
  };
  const ceu = new T.Mesh(new T.SphereGeometry(1500, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, uniforms: ceuU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTopo; uniform vec3 uHor; uniform vec3 uBaixo; uniform vec3 uSolDir; uniform vec3 uSolCor;
      uniform float uEstrelas; uniform float uAurora; uniform float uTempo; uniform float uNevoa; uniform vec3 uCorNevoa;
      float h1(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = mix(uHor, uTopo, smoothstep(-0.02, 0.4, y));
        c = mix(c, uBaixo, smoothstep(0.02, -0.12, y));
        float s = max(dot(d, normalize(uSolDir)), 0.0);
        c += uSolCor * (pow(s, 9.0) * 0.24 + pow(s, 80.0) * 0.4);
        c = mix(c, uSolCor * 1.1 + 0.12, step(0.9993, s));
        vec3 q = floor(d * 240.0);
        float e = step(0.9965, h1(q)) * smoothstep(0.0, 0.2, y);
        c += vec3(e) * uEstrelas * (0.6 + 0.4 * sin(uTempo * 2.7 + q.x * 1.7));
        float az = atan(d.x, d.z) + 1.5708;
        float onda = cos(az * 1.6 + sin(az * 3.1 + uTempo * 0.21) * 0.7 + sin(uTempo * 0.05) * 0.4);
        float cortina = smoothstep(0.1, 0.9, onda) * smoothstep(0.03, 0.16, y) * (1.0 - smoothstep(0.3, 0.75, y));
        float fios = 0.7 + 0.3 * sin(az * 46.0 + uTempo * 0.9);
        c += mix(vec3(0.12, 1.0, 0.55), vec3(0.55, 0.35, 1.0), smoothstep(0.1, 0.48, y)) * cortina * fios * uAurora * 0.8;
        c = mix(c, uCorNevoa, uNevoa);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  ceu.frustumCulled = false;
  ceu.renderOrder = -10;
  cena.add(ceu);

  /* ---------- a montanha: pirâmide de 4 faces com ruído ---------- */
  const raioBase = (y) => 2.6 + 74 * Math.pow(1 - clamp(y / YT), 0.9);
  const torcao = (y) => 0.12 * Math.sin(y / 45);
  const forma = (a) => { const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return Math.pow(Math.pow(c, 1.15) + Math.pow(s, 1.15), -1 / 1.15); };
  const R = new Float32Array((NY + 1) * (NT + 1));
  for (let j = 0; j <= NY; j++) {
    const y = YT * j / NY, r0 = raioBase(y), amp = clamp(r0 / 22, 0.12, 1) * suave(0, 6, y);
    for (let i = 0; i < NT; i++) {
      const a = i / NT * TAU, rr = r0 * forma(a);
      const px = Math.sin(a) * rr, pz = Math.cos(a) * rr;
      const daCrista = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * rr;
      const calmo = mix(0.45, 1, suave(1, 14, daCrista));
      const n = ruido(px / 26, y / 34, pz / 26) * 2.8 * calmo + ruido(px / 9, y / 9, pz / 9) * 1.5 + ruido(px / 3.2, y / 3.2, pz / 3.2) * 0.45;
      R[j * (NT + 1) + i] = Math.max(0.5, rr + n * amp);
    }
    R[j * (NT + 1) + NT] = R[j * (NT + 1)];
  }
  // a = ângulo medido a partir da crista da via
  function raioEm(a, y) {
    const u = ((a / TAU) % 1 + 1) % 1 * NT, i = Math.min(NT - 1, Math.floor(u)), fu = u - i;
    const v = clamp(y / YT) * NY, j = Math.min(NY - 1, Math.floor(v)), fv = v - j;
    const k = j * (NT + 1) + i, k2 = k + NT + 1;
    return mix(mix(R[k], R[k + 1], fu), mix(R[k2], R[k2 + 1], fu), fv);
  }
  function pontoEm(a, y, alvo) { const r = raioEm(a, y), w = a + torcao(y); return alvo.set(Math.sin(w) * r, y, Math.cos(w) * r); }
  const angDaLat = (lat, y) => lat * 0.72 / Math.max(raioEm(0, y), 2.5);
  const _qa = new V3(), _qb = new V3();
  function quadro(a, y, f) {
    pontoEm(a, y, f.p);
    const de = 0.9 * 0.72 / Math.max(raioEm(0, y), 2.5);
    pontoEm(a + de, y, _qa); pontoEm(a - de, y, _qb); f.t.subVectors(_qa, _qb).normalize();
    pontoEm(a, Math.min(YT, y + 0.9), _qa); pontoEm(a, Math.max(0, y - 0.9), _qb); f.u.subVectors(_qa, _qb).normalize();
    f.n.crossVectors(f.t, f.u).normalize();
    f.u.crossVectors(f.n, f.t).normalize();
    return f;
  }
  const novoQuadro = () => ({ p: new V3(), n: new V3(), u: new V3(), t: new V3() });

  const PAL = {
    baixo: ['#9c8573', '#89735f', '#a8917b', '#7b6858'],
    meio: ['#8b8683', '#77726f', '#97918b', '#6b6765'],
    alto: ['#828aa0', '#6f778d', '#8f97ad', '#626a80'],
    neve: ['#f2f6fc', '#e2e9f4', '#d4deee'],
    musgo: ['#6f8d3b', '#5f7f34', '#7f9a45'],
  };
  for (const k in PAL) PAL[k] = PAL[k].map((c) => new T.Color(c));
  function corDaRocha(x, y, z, ny, alvo) {
    const faixa = Math.floor((y + ruido(x / 9, y / 22, z / 9) * 5) / 4.2);
    const zona = y + ruido(x / 30, y / 40, z / 30) * 14;
    const pal = zona < 75 ? PAL.baixo : zona < 145 ? PAL.meio : PAL.alto;
    alvo.copy(pal[((faixa % 4) + 4) % 4]);
    const nv = ny + ruido(x / 5, y / 5, z / 5) * 0.16;
    if (y > 80 && (nv > mix(0.4, 0.06, suave(80, 180, y)) || ruido(x / 7, y / 7, z / 7) > mix(0.75, -0.5, suave(85, 195, y)))) alvo.copy(PAL.neve[(faixa & 1) + (nv > 0.6 ? 1 : 0)]);
    else if (y < 32 && nv > 0.46 + y * 0.008) alvo.copy(PAL.musgo[((faixa % 3) + 3) % 3]);
    return alvo;
  }
  {
    const pos = [], cor = [], uv = [];
    const A = new V3(), B = new V3(), C = new V3(), D = new V3(), N = new V3(), e1 = new V3(), e2 = new V3(), cc = new T.Color();
    const vert = (i, j, alvo) => { const y = YT * j / NY, a = i / NT * TAU + torcao(y), r = R[j * (NT + 1) + i]; return alvo.set(Math.sin(a) * r, y, Math.cos(a) * r); };
    const uvDe = (i, j) => [i / NT * TAU * raioBase(YT * j / NY) / 3.5, YT * j / NY / 3.5];
    const tri = (p1, p2, p3, t1, t2, t3) => {
      e1.subVectors(p2, p1); e2.subVectors(p3, p1); N.crossVectors(e1, e2).normalize();
      const cx = (p1.x + p2.x + p3.x) / 3, cy = (p1.y + p2.y + p3.y) / 3, cz = (p1.z + p2.z + p3.z) / 3;
      corDaRocha(cx, cy, cz, N.y, cc);
      const k = 0.93 + hash3(cx, cy, cz) * 0.13;
      for (const p of [p1, p2, p3]) { pos.push(p.x, p.y, p.z); cor.push(cc.r * k, cc.g * k, cc.b * k); }
      uv.push(...t1, ...t2, ...t3);
    };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NT; i++) {
      vert(i, j, A); vert(i + 1, j, B); vert(i, j + 1, C); vert(i + 1, j + 1, D);
      const ta = uvDe(i, j), tb = uvDe(i + 1, j), tc = uvDe(i, j + 1), td = uvDe(i + 1, j + 1);
      tri(A, B, D, ta, tb, td); tri(A, D, C, ta, td, tc);
    }
    const topo = new V3(0, YT + 0.75, 0);
    for (let i = 0; i < NT; i++) { vert(i, NY, A); vert(i + 1, NY, B); tri(A, B, topo, [0, 0], [1, 0], [0.5, 1]); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    cena.add(new T.Mesh(g, new T.MeshLambertMaterial({ map: texRocha, vertexColors: true })));
  }

  /* ---------- lotes: muitas peças estáticas numa malha só ---------- */
  const _vL = new V3(), _cL = new T.Color(), _pM = new V3(), _sM = new V3(), _qM = new T.Quaternion(), _eM = new T.Euler();
  class Lote {
    constructor() { this.pos = []; this.cor = []; }
    add(geo, m, cor, variacao = 0.12) {
      const g = geo._ni || (geo._ni = geo.index ? geo.toNonIndexed() : geo);
      const p = g.attributes.position;
      _cL.set(cor);
      for (let i = 0; i < p.count; i += 3) {
        const k = 1 - variacao / 2 + rnd() * variacao;
        for (let j = 0; j < 3; j++) {
          _vL.fromBufferAttribute(p, i + j).applyMatrix4(m);
          this.pos.push(_vL.x, _vL.y, _vL.z);
          this.cor.push(_cL.r * k, _cL.g * k, _cL.b * k);
        }
      }
    }
    malha(mat) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.cor, 3));
      g.computeVertexNormals();
      return new T.Mesh(g, mat);
    }
  }
  const mtx = (x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, ordem = 'XYZ') =>
    new T.Matrix4().compose(_pM.set(x, y, z), _qM.setFromEuler(_eM.set(rx, ry, rz, ordem)), _sM.set(sx, sy, sz));
  const mtxQ = (p, q, sx, sy = sx, sz = sx) => new T.Matrix4().compose(p, q, _sM.set(sx, sy, sz));
  const _bx = new V3(), _by = new V3(), _bz = new V3(), _bm = new T.Matrix4();
  function quatBase(frente, cima, alvo) {
    _bz.copy(frente).normalize(); _bx.crossVectors(cima, _bz).normalize(); _by.crossVectors(_bz, _bx);
    return alvo.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
  }
  const G = {
    tronco: new T.CylinderGeometry(0.2, 0.3, 1.4, 5),
    copa: new T.ConeGeometry(1, 1.9, 6),
    pedra: new T.DodecahedronGeometry(1, 0),
    bola: new T.IcosahedronGeometry(1, 0),
    caixa: new T.BoxGeometry(1, 1, 1),
    laje: new T.CylinderGeometry(1, 1.12, 0.34, 6),
    tenda: new T.CylinderGeometry(1, 1, 1, 3),
    poste: new T.CylinderGeometry(0.05, 0.06, 1, 4),
    tora: new T.CylinderGeometry(0.12, 0.12, 1, 5),
  };
  const matLote = new T.MeshLambertMaterial({ vertexColors: true });
  const decor = new Lote();

  /* ---------- chão, acampamento e árvores ---------- */
  const R_PE = raioEm(0, 0);
  function alturaChao(x, z) {
    const d = Math.hypot(x, z);
    return (ruido(x / 120, 3.1, z / 120) * 0.5 + 0.5) * 72 * suave(100, 430, d) + ruido(x / 30, 7.7, z / 30) * 4 * suave(95, 170, d) - 0.05;
  }
  {
    const g = new T.PlaneGeometry(1800, 1800, 90, 90).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cor = [], uv = [], cc = new T.Color();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, alturaChao(x, z)); uv.push(x / 7, z / 7); }
    const verdes = ['#6f9a3c', '#7aa645', '#628a35', '#86ad4c'].map((c) => new T.Color(c));
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      cc.copy(verdes[Math.floor((ruido(x / 14, 1, z / 14) * 0.5 + 0.5) * 3.99)]);
      if (h > 34 + ruido(x / 20, 2, z / 20) * 8) cc.set('#7d7a6e');
      if (h > 52) cc.set('#e6edf5');
      if (Math.hypot(x - 1.5, z - R_PE - 6) < 6.5 + ruido(x / 3, 5, z / 3) * 2) cc.set('#9a7b50');
      const k = 0.93 + hash3(x, h, z) * 0.12;
      for (let j = 0; j < 3; j++) cor.push(cc.r * k, cc.g * k, cc.b * k);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    cena.add(new T.Mesh(g, new T.MeshLambertMaterial({ map: texGrama, vertexColors: true })));
  }
  const VERDES_PINHO = ['#2f6b3a', '#37784a', '#2a5f37', '#3f7f3f'];
  function pinheiro(x, z, s) {
    const y = alturaChao(x, z);
    decor.add(G.tronco, mtx(x, y + 0.7 * s, z, s), '#6b4a2f');
    for (let k = 0; k < 3; k++) {
      const r = (1.75 - k * 0.45) * s;
      decor.add(G.copa, mtx(x, y + (1.7 + k * 1.05) * s, z, r, s, r, 0, rnd() * TAU, 0), VERDES_PINHO[Math.floor(rnd() * 4)]);
    }
  }
  const livre = (x, z) => !(x > -17 && x < 17 && z > R_PE - 6 && z < R_PE + 22);
  for (let i = 0; i < 190; i++) {
    const a = rnd() * TAU, d = entre(84, 320), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (d < raioEm(a, 0) + 8 || !livre(x, z)) continue;
    pinheiro(x, z, entre(1.3, 3.3));
  }
  for (let i = 0; i < 40; i++) {
    const x = entre(-70, -18), z = R_PE + entre(-4, 40), a = Math.atan2(x, z);
    if (Math.hypot(x, z) < raioEm(a, 0) + 6) continue;
    pinheiro(x, z, entre(1.4, 3));
  }
  for (let i = 0; i < 60; i++) {
    const a = rnd() * TAU, d = entre(80, 170), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (d < raioEm(a, 0) + 3 || !livre(x, z)) continue;
    const s = entre(0.5, 2.4);
    decor.add(G.pedra, mtx(x, alturaChao(x, z) + s * 0.3, z, s, s * entre(0.5, 0.8), s, 0, rnd() * TAU, 0), ['#8d8a86', '#7a7672', '#9a958d'][i % 3]);
  }
  // acampamento base, na frente da crista
  const campo = (s, b) => [s, R_PE + b];
  {
    const tenda = (s, b, yaw, cor) => {
      const [x, z] = campo(s, b), r = 1.35;
      decor.add(G.tenda, mtx(x, r * 0.5, z, r, 2.6, r, -Math.PI / 2, yaw, Math.PI / 2, 'YXZ'), cor);
      const fx = Math.cos(yaw) * 1.31, fz = -Math.sin(yaw) * 1.31;
      decor.add(G.tenda, mtx(x + fx, r * 0.32, z + fz, r * 0.55, 0.05, r * 0.55, -Math.PI / 2, yaw, Math.PI / 2, 'YXZ'), '#3a2a2a', 0);
    };
    tenda(-0.4, 6.8, -0.9, '#ee7a2a');
    tenda(2.4, 10.2, -1.2, '#f2c53a');
    const [cx, cz] = campo(3.8, 0.9);
    decor.add(G.caixa, mtx(cx, 0.45, cz, 0.9, 0.9, 0.9, 0, 0.3, 0), '#9b6b3c');
    decor.add(G.caixa, mtx(cx - 0.9, 0.35, cz + 0.7, 0.7, 0.7, 0.7, 0, -0.4, 0), '#7a5230');
    decor.add(G.caixa, mtx(cx - 0.2, 1.1, cz + 0.1, 0.6, 0.45, 0.6, 0, 0.9, 0), '#5d8fb8');
    const [fx2, fz2] = campo(2.7, 4.8);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; decor.add(G.pedra, mtx(fx2 + Math.cos(a) * 0.75, 0.12, fz2 + Math.sin(a) * 0.75, 0.22, 0.16, 0.22, 0, k, 0), '#7c7874'); }
    decor.add(G.tora, mtx(fx2, 0.15, fz2, 1, 1.1, 1, Math.PI / 2, 0.5, 0, 'YXZ'), '#6b4a2f');
    decor.add(G.tora, mtx(fx2, 0.2, fz2, 1, 1.1, 1, Math.PI / 2, -0.7, 0, 'YXZ'), '#5a3d26');
    const [px, pz] = campo(-2.8, 4.4);
    decor.add(G.poste, mtx(px, 2, pz, 1, 4, 1), '#8a6a4a');
  }
  const fogo = new T.Group();
  {
    const [fx2, fz2] = campo(2.7, 4.8);
    fogo.position.set(fx2, 0, fz2);
    fogo.add(new T.Mesh(new T.ConeGeometry(0.42, 1.15, 5), new T.MeshBasicMaterial({ color: '#ff6a1a' })));
    fogo.add(new T.Mesh(new T.ConeGeometry(0.24, 0.75, 5), new T.MeshBasicMaterial({ color: '#ffd84a' })));
    fogo.children[0].position.y = 0.6; fogo.children[1].position.y = 0.45;
    cena.add(fogo);
  }
  // bandeiras que tremulam
  function criarBandeira(cor) {
    const g = new T.PlaneGeometry(1.5, 0.85, 6, 1);
    g.translate(0.75, -0.42, 0);
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ color: cor, side: T.DoubleSide }));
    m.userData.base = Float32Array.from(g.attributes.position.array);
    cena.add(m);
    return m;
  }
  const bandeiraCampo = criarBandeira('#e2412d');
  { const [px, pz] = campo(-2.8, 4.4); bandeiraCampo.position.set(px, 4, pz); bandeiraCampo.rotation.y = 0.3; }
  const bandeiraCume = criarBandeira('#f5c02a');
  bandeiraCume.position.set(-0.75, YT + 2.7, -0.45);
  bandeiraCume.rotation.y = 0.4;
  decor.add(G.poste, mtx(-0.75, YT + 1.6, -0.45, 1, 2.3, 1), '#8a6a4a');
  for (let k = 0; k < 6; k++) decor.add(G.pedra, mtx(-0.6 + (k % 3) * 0.35, YT + 0.55 + Math.floor(k / 3) * 0.28, 0.55, 0.24 - Math.floor(k / 3) * 0.05), '#8a8f9e');
  function ondular(m, t, forca) {
    const p = m.geometry.attributes.position, b = m.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3];
      p.setZ(i, Math.sin(x * 3.2 - t * 7) * 0.16 * x * forca);
      p.setY(i, b[i * 3 + 1] - x * 0.05 * (1 - forca));
    }
    p.needsUpdate = true;
  }

  /* ---------- detalhes na parede: agarras, saliências, arbustos, marcos ---------- */
  {
    const F = novoQuadro(), q = new T.Quaternion(), cima = new V3(0, 1, 0), nh = new V3(), pp = new V3();
    const corAgarra = (y) => (y < 75 ? '#a58f7b' : y < 145 ? '#96918d' : '#8f98b0');
    for (let y = 1.2; y < YT - 1.5; y += entre(0.45, 0.8)) {
      for (let k = 0; k < 1; k++) {
        const lat = entre(-0.2, 2.8);
        quadro(angDaLat(lat, y), y, F);
        pp.copy(F.p).addScaledVector(F.n, 0.04);
        const s = entre(0.06, 0.12);
        decor.add(G.pedra, mtx(pp.x, pp.y, pp.z, s, s * 0.7, s * 0.8, rnd() * 3, rnd() * 3, rnd() * 3), corAgarra(y));
      }
    }
    for (let y = 5; y < YT - 6; y += entre(5, 9)) {
      const lat = entre(3.2, 10), larg = entre(1.2, 2.6);
      quadro(angDaLat(lat, y), y, F);
      nh.set(F.n.x, 0, F.n.z).normalize();
      quatBase(nh, cima, q);
      pp.copy(F.p).addScaledVector(nh, 0.32);
      decor.add(G.laje, mtxQ(pp, q, larg * 0.5, 1, 0.55), corAgarra(y));
      if (y > 95) { pp.y += 0.2; decor.add(G.laje, mtxQ(pp, q, larg * 0.48, 0.4, 0.52), '#eef3fa', 0.05); }
    }
    const verdes = ['#466e2f', '#517c34', '#3a612b'];
    for (let i = 0; i < 70; i++) {
      const y = entre(1, 40), lat = entre(1.8, 22);
      quadro(angDaLat(lat, y), y, F);
      pp.copy(F.p).addScaledVector(F.n, 0.1);
      const s = entre(0.2, 0.45);
      decor.add(G.bola, mtx(pp.x, pp.y, pp.z, s * 1.2, s * 0.55, s, rnd() * 3, rnd() * 3, 0), verdes[i % 3]);
    }
  }

  /* ---------- serras ao longe ---------- */
  {
    const serras = new Lote();
    const pico = (a, d, h) => {
      const rad = h * entre(0.5, 0.75), x = Math.sin(a) * d, z = Math.cos(a) * d;
      const g = new T.ConeGeometry(rad, h, 7, 5).toNonIndexed(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
        if (py > h / 2 - 0.01) continue;
        const k = 1 + ruido(px / 9 + a, py / 9, pz / 9) * 0.22;
        p.setXYZ(i, px * k, py + ruido(px / 7, py / 7 + a, pz / 7) * h * 0.03, pz * k);
      }
      g.computeVertexNormals();
      const nrm = g.attributes.normal, y0 = alturaChao(x, z) - 3;
      for (let i = 0; i < p.count; i += 3) {
        const fy = ((p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 + h / 2) / h;
        const cx = x + p.getX(i), cz = z + p.getZ(i);
        let cor = ['#6f7690', '#7c8299', '#626a84'][Math.floor(hash3(cx, fy, cz) * 2.99)];
        if (fy > 0.56 + ruido(cx / 8, fy * 4, cz / 8) * 0.1 && nrm.getY(i) > 0.15) cor = hash3(cz, fy, cx) > 0.5 ? '#eef2f8' : '#dde4ef';
        else if (fy < 0.14) cor = '#3f5f3a';
        const um = new T.BufferGeometry();
        um.setAttribute('position', new T.Float32BufferAttribute([p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1), p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)], 3));
        serras.add(um, mtx(x, y0 + h / 2, z, 1), cor, 0.06);
      }
    };
    pico(-1.35, 250, 150); pico(-1.75, 300, 120); pico(-1.05, 340, 175); pico(-2.1, 260, 95); pico(-0.75, 420, 130);
    for (let i = 0; i < 20; i++) pico(rnd() * TAU, entre(300, 680), entre(60, 170));
    for (let i = 0; i < 26; i++) pico(rnd() * TAU, entre(180, 300), entre(22, 55));
    cena.add(serras.malha(matLote));
  }

  /* ---------- nuvens ---------- */
  const matNuvemSolida = new T.MeshLambertMaterial({ vertexColors: true, emissive: new T.Color('#3a3a46') });
  {
    const nuvens = new Lote();
    const tufo = (x, y, z, s) => {
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const r = s * entre(0.55, 1);
        nuvens.add(G.bola, mtx(x + (k - n / 2) * s * 0.9 + entre(-1, 1) * s * 0.3, y + entre(0, 0.5) * s, z + entre(-1, 1) * s * 0.5, r * 1.15, r * 0.8, r, rnd(), rnd(), 0), k % 2 ? '#ffffff' : '#eef2f8', 0.08);
      }
    };
    for (let i = 0; i < 80; i++) { const a = rnd() * TAU, d = entre(80, 720); tufo(Math.sin(a) * d, Y_NUVEM + entre(-0.5, 2.5), Math.cos(a) * d, entre(3, 8)); }
    for (let i = 0; i < 14; i++) { const a = rnd() * TAU, d = entre(110, 320); tufo(Math.sin(a) * d, entre(24, 46), Math.cos(a) * d, entre(2.5, 5)); }
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, d = entre(260, 640); tufo(Math.sin(a) * d, entre(125, 190), Math.cos(a) * d, entre(5, 11)); }
    cena.add(nuvens.malha(matNuvemSolida));
  }
  const mares = [[0.34, 21, 13, Y_NUVEM - 1.6, 0.95], [0.5, 31, 19, Y_NUVEM, 0.9]].map(([limiar, s, rep, y, op]) => {
    const tex = texNuvem(limiar, s);
    tex.repeat.set(rep, rep);
    const m = new T.Mesh(new T.CircleGeometry(1300, 48), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: op }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 2; m.userData.op = op;
    cena.add(m);
    return m;
  });

  cena.add(decor.malha(matLote));

  /* ---------- aves ---------- */
  const aves = [];
  {
    const asa = new T.BufferGeometry();
    asa.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.2, 0, 0, -0.2, 1, 0, -0.06], 3));
    asa.computeVertexNormals();
    const mat = new T.MeshLambertMaterial({ color: '#3b3546', side: T.DoubleSide });
    for (const [y, lado, fora] of [[15, -16, 20], [31, -10, 17], [47, -20, 24]]) {
      const w = torcao(y), r = raioEm(0, y);
      const cx = Math.sin(w) * (r + fora) + Math.cos(w) * lado, cz = Math.cos(w) * (r + fora) - Math.sin(w) * lado;
      for (let k = 0; k < 3; k++) {
        const g = new T.Group(), e = new T.Mesh(asa, mat), d = new T.Mesh(asa, mat);
        d.scale.x = -1;
        g.add(e, d, new T.Mesh(G.caixa, mat));
        g.children[2].scale.set(0.16, 0.12, 0.5);
        g.scale.setScalar(1.3);
        cena.add(g);
        aves.push({ g, e, d, cx, cy: y + k * 1.3, cz, raio: entre(5, 9), fase: k * 2.1 + rnd(), vel: entre(0.35, 0.55) });
      }
    }
  }

  /* ---------- o alpinista ---------- */
  function criarPersonagem() {
    const M = (c) => new T.MeshLambertMaterial({ color: c });
    const m = {
      jaq: M('#e5432e'), jaq2: M('#bf3324'), calca: M('#2f4386'), bota: M('#5b3a25'), luva: M('#f5c02a'),
      gorro: M('#1fa392'), branco: M('#f3efe4'), mochila: M('#f19a22'), mochila2: M('#c97a14'), corda: M('#e4cf96'), rolo: M('#7b5bd6'),
    };
    const raiz = new T.Group(), corpo = new T.Group();
    raiz.add(corpo);
    const add = (geo, mat, pai, x = 0, y = 0, z = 0) => { const k = new T.Mesh(geo, mat); k.position.set(x, y, z); pai.add(k); return k; };
    add(new T.CylinderGeometry(0.26, 0.33, 0.56, 8), m.jaq, corpo, 0, 0.77, 0);
    add(new T.BoxGeometry(0.07, 0.5, 0.05), m.jaq2, corpo, 0, 0.77, 0.29);
    add(new T.TorusGeometry(0.19, 0.075, 5, 10), m.luva, corpo, 0, 1.06, 0).rotation.x = Math.PI / 2;
    const ponta = new T.Group();
    ponta.position.set(0.1, 1.04, -0.18);
    corpo.add(ponta);
    add(new T.BoxGeometry(0.11, 0.34, 0.05), m.luva, ponta, 0, -0.17, 0);
    add(new T.BoxGeometry(0.46, 0.5, 0.24), m.mochila, corpo, 0, 0.84, -0.33);
    add(new T.BoxGeometry(0.48, 0.14, 0.27), m.mochila2, corpo, 0, 1.06, -0.33);
    add(new T.CylinderGeometry(0.1, 0.1, 0.56, 7), m.rolo, corpo, 0, 1.2, -0.33).rotation.z = Math.PI / 2;
    add(new T.TorusGeometry(0.15, 0.05, 5, 10), m.corda, corpo, 0, 0.8, -0.47);
    const cabeca = new T.Group();
    cabeca.position.set(0, 1.36, 0);
    corpo.add(cabeca);
    add(new T.SphereGeometry(0.37, 14, 10), new T.MeshLambertMaterial({ map: texRosto }), cabeca);
    add(new T.SphereGeometry(0.065, 6, 4), M('#e9a07a'), cabeca, 0, -0.04, 0.36);
    add(new T.SphereGeometry(0.395, 14, 6, 0, TAU, 0, Math.PI * 0.43), m.gorro, cabeca, 0, 0.02, 0);
    add(new T.TorusGeometry(0.375, 0.065, 5, 14), m.branco, cabeca, 0, 0.1, 0).rotation.x = Math.PI / 2;
    add(new T.SphereGeometry(0.12, 7, 5), m.branco, cabeca, 0, 0.47, 0);
    const J = { corpo, cabeca, ponta };
    for (const [lado, s] of [['E', 1], ['D', -1]]) {
      const ombro = new T.Group();
      ombro.position.set(s * 0.34, 0.98, 0);
      corpo.add(ombro);
      const g1 = new T.CylinderGeometry(0.085, 0.075, 0.3, 6); g1.translate(0, -0.15, 0); add(g1, m.jaq, ombro);
      const cot = new T.Group(); cot.position.y = -0.3; ombro.add(cot);
      const g2 = new T.CylinderGeometry(0.075, 0.07, 0.22, 6); g2.translate(0, -0.11, 0); add(g2, m.jaq2, cot);
      const luva = add(new T.SphereGeometry(0.105, 7, 5), m.luva, cot, 0, -0.27, 0);
      const quad = new T.Group(); quad.position.set(s * 0.14, 0.5, 0); corpo.add(quad);
      const g3 = new T.CylinderGeometry(0.1, 0.09, 0.24, 6); g3.translate(0, -0.12, 0); add(g3, m.calca, quad);
      const joe = new T.Group(); joe.position.y = -0.24; quad.add(joe);
      const g4 = new T.CylinderGeometry(0.09, 0.085, 0.16, 6); g4.translate(0, -0.08, 0); add(g4, m.calca, joe);
      add(new T.BoxGeometry(0.17, 0.12, 0.27), m.bota, joe, 0, -0.2, 0.04);
      Object.assign(J, { ['ombro' + lado]: ombro, ['cot' + lado]: cot, ['quad' + lado]: quad, ['joe' + lado]: joe, ['luva' + lado]: luva });
    }
    return { raiz, J };
  }
  const PER = criarPersonagem();
  cena.add(PER.raiz);
  PER.raiz.traverse((o) => o.layers.enable(1));
  const matTinta = new T.MeshBasicMaterial({ color: 0x000000, fog: false });
  const ossos = [];
  PER.J.corpo.traverse((o) => ossos.push(o));
  // fantasmas do rastro nos super pulos
  const fantasmas = [];
  for (let i = 0; i < 4; i++) {
    const mat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const raiz = new T.Group(), corpo = PER.J.corpo.clone(true);
    corpo.traverse((o) => { if (o.isMesh) o.material = mat; });
    raiz.add(corpo);
    raiz.visible = false;
    cena.add(raiz);
    const lista = [];
    corpo.traverse((o) => lista.push(o));
    fantasmas.push({ raiz, mat, lista });
  }

  const CHAVES = ['ls', 'la', 'le', 'rs', 'ra', 're', 'lh', 'lha', 'lk', 'rh', 'rha', 'rk', 'inc', 'cy', 'cp', 'alt'];
  const J0 = {}, PA = {};
  CHAVES.forEach((c) => { J0[c] = 0; PA[c] = 0; });
  const bracos = (l, r) => { [PA.ls, PA.la, PA.le] = l; [PA.rs, PA.ra, PA.re] = r; };
  const pernas = (l, r) => { [PA.lh, PA.lha, PA.lk] = l; [PA.rh, PA.rha, PA.rk] = r; };
  function alvoPose(pose, t) {
    for (const c of CHAVES) PA[c] = 0;
    const sn = Math.sin;
    switch (pose) {
      case 'chao': {
        bracos([0.06, 0.16, -0.25], [0.06, 0.16, -0.25]);
        PA.alt = sn(t * 2) * 0.012; PA.cp = 0.05;
        const c = t % 5.5;
        if (c > 3 && c < 4.4) { PA.rs = -2.75; PA.ra = 0.5; PA.re = -0.5 + sn(t * 14) * 0.45; }
        break;
      }
      case 'reachL': bracos([-2.95, 0.08, -0.1], [-2.0, 0.12, -1.0]); pernas([-1.6, 0.05, 1.7], [-0.6, 0.05, 0.7]); PA.cp = -0.45; break;
      case 'reachR': bracos([-2.0, 0.12, -1.0], [-2.95, 0.08, -0.1]); pernas([-0.6, 0.05, 0.7], [-1.6, 0.05, 1.7]); PA.cp = -0.45; break;
      case 'pull': bracos([-2.15, 0.15, -1.05], [-2.15, 0.15, -1.05]); pernas([-1.0, 0.05, 1.1], [-1.0, 0.05, 1.1]); PA.alt = 0.06; PA.cp = -0.3; break;
      case 'crouch': bracos([-1.9, 0.2, -1.2], [-1.9, 0.2, -1.2]); pernas([-1.75, 0.1, 2.1], [-1.75, 0.1, 2.1]); PA.inc = -0.12; PA.cp = -0.5; break;
      case 'jump': bracos([-3.05, 0.25, -0.05], [-3.05, 0.25, -0.05]); pernas([0.15, 0.05, 0.2], [-0.35, 0.05, 0.55]); PA.inc = -0.22; PA.cp = -0.4; break;
      case 'superjump': bracos([-3.1, 0.06, 0], [0.55, 0.2, -0.3]); pernas([-1.3, 0.05, 1.7], [0.2, 0.05, 0.1]); PA.inc = -0.18; PA.cp = -0.45; break;
      case 'hyper': bracos([-3.0, 0.55, 0], [-3.0, 0.55, 0]); pernas([0.1, 0.15, 0.1], [0.1, 0.15, 0.1]); PA.inc = -0.2; PA.cp = -0.5; break;
      case 'charge': bracos([0.7, 0.35, -0.6], [0.7, 0.35, -0.6]); pernas([-1.95, 0.12, 2.3], [-1.95, 0.12, 2.3]); PA.inc = 0.22; PA.alt = -0.08; PA.cp = -0.2; break;
      case 'blast': bracos([-1.6, 1.35, 0], [-1.6, 1.35, 0]); pernas([0, 0.55, 0], [0, 0.55, 0]); PA.inc = -0.3; PA.cp = -0.55; break;
      case 'flail': {
        const f = t * 19, g = t * 15;
        bracos([-2.6 + sn(f) * 1.2, 0.7, -0.3], [-2.6 + sn(f + Math.PI) * 1.2, 0.7, -0.3]);
        pernas([-0.6 + sn(g) * 0.5, 0.1, 0.8], [-0.6 - sn(g) * 0.5, 0.1, 0.8]);
        PA.inc = -0.35; PA.cy = sn(t * 9) * 0.5;
        break;
      }
      case 'slip': {
        const f = t * 24, g = t * 18;
        bracos([-2.9 + sn(f) * 0.25, 0.3, -0.2], [-2.9 + sn(f + 2) * 0.25, 0.3, -0.2]);
        pernas([-0.4 + sn(g) * 0.3, 0.1, 0.5], [-0.4 - sn(g) * 0.3, 0.1, 0.5]);
        PA.inc = -0.3; PA.cp = 0.4;
        break;
      }
      case 'hang':
        bracos([-0.4 + sn(t * 3) * 0.35, 0.35, -0.3], [-3.05, 0.05, 0]);
        pernas([-0.25 + sn(t * 2.6) * 0.2, 0.08, 0.35], [-0.1 - sn(t * 2.6) * 0.2, 0.08, 0.25]);
        PA.inc = -0.15 + sn(t * 2.6) * 0.08; PA.cy = -0.9; PA.cp = 0.2;
        break;
      case 'ropeA': bracos([-2.95, 0.1, -0.1], [-2.3, 0.12, -0.7]); pernas([-1.35, 0.06, 1.35], [-0.6, 0.06, 0.8]); PA.inc = -0.3; PA.cp = -0.35; break;
      case 'ropeB': bracos([-2.3, 0.12, -0.7], [-2.95, 0.1, -0.1]); pernas([-0.6, 0.06, 0.8], [-1.35, 0.06, 1.35]); PA.inc = -0.3; PA.cp = -0.35; break;
      case 'land': bracos([-2.5, 0.25, -0.6], [-2.5, 0.25, -0.6]); pernas([-1.5, 0.1, 1.8], [-1.5, 0.1, 1.8]); PA.inc = 0.1; PA.cy = -1.1; PA.cp = 0.05; break;
      case 'summit': bracos([-2.85, 0.65, -0.15], [-2.85, 0.65, -0.15]); PA.alt = Math.abs(sn(t * 5.5)) * 0.22; PA.cp = -0.1; break;
      default: {
        bracos([-2.55, 0.12, -0.55 + sn(t * 2) * 0.04], [-2.2, 0.12, -0.9]);
        pernas([-1.25, 0.08, 1.25], [-0.75, 0.08, 0.95]);
        PA.alt = sn(t * 2) * 0.015;
        const c = t % 6.5;
        if (c > 3.6 && c < 5.4) { PA.cy = -1.3; PA.cp = 0.08; } else PA.cp = -0.32;
      }
    }
    return PA;
  }
  function aplicarJuntas(J, v) {
    J.ombroE.rotation.set(v.ls, 0, v.la); J.cotE.rotation.set(v.le, 0, 0);
    J.ombroD.rotation.set(v.rs, 0, -v.ra); J.cotD.rotation.set(v.re, 0, 0);
    J.quadE.rotation.set(v.lh, 0, v.lha); J.joeE.rotation.set(v.lk, 0, 0);
    J.quadD.rotation.set(v.rh, 0, -v.rha); J.joeD.rotation.set(v.rk, 0, 0);
    J.cabeca.rotation.set(v.cp, v.cy, 0);
  }
  function giroAtual() {
    const a = S.action;
    if (!a) return 0;
    if (a.id === 'esperta' && a.t > 0.25 && a.t < 0.7) return ((a.t - 0.25) / 0.45) * TAU;
    if (a.id === 'rarissima' && a.t > 0.35 && a.t < 1.45) return saidaCubica((a.t - 0.35) / 1.1) * TAU;
    if (a.id === 'lendaria' && a.t > 0.98 && a.t < 2.4) return saidaCubica((a.t - 0.98) / 1.42) * TAU * 2;
    return 0;
  }

  // posição e orientação do personagem para um estado (altitude, lado, distância da parede)
  const yDe = (alt) => clamp(alt / CUME) * YT;
  const FP = novoQuadro(), _nh = new V3(), _gp = new V3(), _dir = new V3(), _qg = new T.Quaternion(), CIMA = new V3(0, 1, 0);
  function alvoPersonagem(alt, x, out, pos, q) {
    const y = yDe(alt);
    quadro(angDaLat(LAT0 + x * LATK, y), y, FP);
    pos.copy(FP.p).addScaledVector(FP.n, 0.34 + out * 0.95);
    _dir.copy(FP.n).negate();
    quatBase(_dir, FP.u, q);
    const g = suave(0.12, 1.8, y);
    if (g < 1) {
      _nh.set(FP.n.x, 0, FP.n.z).normalize();
      _gp.copy(FP.p); _gp.y = 0; _gp.addScaledVector(_nh, 1.7);
      pos.lerpVectors(_gp, pos, g);
      const w = torcao(0);
      _dir.set(Math.cos(w) * 0.75 + Math.sin(w) * 0.66, 0, -Math.sin(w) * 0.75 + Math.cos(w) * 0.66);
      quatBase(_dir, CIMA, _qg);
      q.copy(_qg.slerp(q, g));
    }
    const c = suave(YT - 2.6, YT - 0.15, y);
    if (c > 0) {
      _gp.set(0, YT + 0.75, 0);
      pos.lerp(_gp, c);
      _dir.set(camPos.x, 0, camPos.z).normalize();
      quatBase(_dir, CIMA, _qg);
      q.slerp(_qg, c);
    }
    return y;
  }

  /* ---------- efeitos ---------- */
  const sombra = new T.Mesh(new T.CircleGeometry(0.55, 10), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  sombra.renderOrder = 1;
  cena.add(sombra);
  const geoCorda = new T.CylinderGeometry(0.045, 0.045, 1, 4, 1, true);
  geoCorda.translate(0, 0.5, 0);
  const matCorda = new T.MeshLambertMaterial({ color: '#e6d08f' });
  const corda = new T.Mesh(geoCorda, matCorda), rabo = new T.Mesh(geoCorda, matCorda);
  corda.visible = rabo.visible = false;
  cena.add(corda, rabo);
  const _ec = new V3();
  function esticar(m, a, b) {
    m.position.copy(a);
    _ec.subVectors(b, a);
    const len = Math.max(0.01, _ec.length());
    m.quaternion.setFromUnitVectors(CIMA, _ec.divideScalar(len));
    m.scale.set(1, len, 1);
  }
  // histórico da subida: saliências dos pulos e pitons da corda ficam na parede
  const MAX_HIST = 30;
  const matBorda = { baixo: new T.MeshLambertMaterial({ map: texRocha, color: '#b29b86' }), meio: new T.MeshLambertMaterial({ map: texRocha, color: '#a19c98' }), neve: new T.MeshLambertMaterial({ map: texRocha, color: '#f1f5fb' }) };
  const matPiton = new T.MeshLambertMaterial({ color: '#b9c2cc' });
  const pool = (geo, mat) => Array.from({ length: MAX_HIST }, () => { const m = new T.Mesh(geo, mat); m.visible = false; cena.add(m); return m; });
  const bordas = pool(G.laje, matBorda.baixo), pitons = pool(G.caixa, matPiton);
  let nBordas = 0, nPitons = 0;
  const limparHistorico = () => { for (const m of bordas.concat(pitons)) m.visible = false; nBordas = nPitons = 0; };
  const FH = novoQuadro();
  function novaBorda(alt, x) {
    const y = yDe(alt);
    quadro(angDaLat(LAT0 + x * LATK, y), y, FH);
    _nh.set(FH.n.x, 0, FH.n.z).normalize();
    const m = bordas[nBordas++ % MAX_HIST];
    quatBase(_nh, CIMA, m.quaternion);
    m.position.copy(FH.p).addScaledVector(_nh, 0.42); m.position.y -= 0.17;
    m.scale.set(0.95, 1, 0.62);
    m.material = y > 95 ? matBorda.neve : y < 75 ? matBorda.baixo : matBorda.meio;
    m.visible = true;
  }
  const ancora = new V3();
  function novoPiton(alt, x) {
    const y = yDe(alt);
    quadro(angDaLat(LAT0 + x * LATK, y), y, FH);
    ancora.copy(FH.p).addScaledVector(FH.n, 0.12);
    const m = pitons[nPitons++ % MAX_HIST];
    quatBase(FH.n, FH.u, m.quaternion);
    m.position.copy(ancora);
    m.scale.set(0.1, 0.1, 0.34);
    m.visible = true;
  }
  // partículas: poeira e pedrinhas (cubos) e brilhos (estrelas de pixel)
  const MAXP = 150, parts = [];
  const meshPart = new T.InstancedMesh(G.caixa, new T.MeshLambertMaterial({ color: '#ffffff' }), MAXP);
  meshPart.frustumCulled = false;
  const _o = new T.Object3D();
  for (let i = 0; i < MAXP; i++) {
    parts.push({ vida: 0, max: 1, p: new V3(), v: new V3(), tam: 0.1, cresce: 0, g: 0, giro: new V3() });
    meshPart.setColorAt(i, _cL.set('#ffffff'));
    _o.scale.setScalar(0); _o.updateMatrix(); meshPart.setMatrixAt(i, _o.matrix);
  }
  cena.add(meshPart);
  let proxP = 0;
  function soltar(p, v, cor, tam, vida, g = 9, cresce = 0) {
    const i = proxP, q = parts[i];
    proxP = (proxP + 1) % MAXP;
    q.p.copy(p); q.v.copy(v); q.tam = tam; q.max = q.vida = vida; q.g = g; q.cresce = cresce;
    q.giro.set(rnd() * 6, rnd() * 6, rnd() * 6);
    meshPart.setColorAt(i, _cL.set(cor));
    meshPart.instanceColor.needsUpdate = true;
  }
  const MAXB = 120, brilhos = [], posB = new Float32Array(MAXB * 3), corB = new Float32Array(MAXB * 3);
  const geoB = new T.BufferGeometry();
  geoB.setAttribute('position', new T.BufferAttribute(posB, 3));
  geoB.setAttribute('color', new T.BufferAttribute(corB, 3));
  const pontosB = new T.Points(geoB, new T.PointsMaterial({ size: 7, sizeAttenuation: false, map: texEstrela, vertexColors: true, transparent: true, alphaTest: 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  pontosB.frustumCulled = false;
  pontosB.renderOrder = 5;
  for (let i = 0; i < MAXB; i++) brilhos.push({ vida: 0, max: 1, p: new V3(), v: new V3(), cor: new T.Color(), g: 0 });
  cena.add(pontosB);
  let proxB = 0;
  function brilhar(p, v, cor, vida, g = 0) {
    const q = brilhos[proxB];
    proxB = (proxB + 1) % MAXB;
    q.p.copy(p); q.v.copy(v); q.cor.set(cor); q.max = q.vida = vida; q.g = g;
  }
  function atualizarParticulas(dt) {
    for (let i = 0; i < MAXP; i++) {
      const q = parts[i];
      if (q.vida <= 0) { if (q.max > 0) { q.max = 0; _o.scale.setScalar(0); _o.updateMatrix(); meshPart.setMatrixAt(i, _o.matrix); } continue; }
      q.vida -= dt;
      q.v.y -= q.g * dt;
      q.v.multiplyScalar(Math.pow(0.45, dt));
      q.p.addScaledVector(q.v, dt);
      const k = clamp(q.vida / q.max);
      _o.position.copy(q.p);
      _o.rotation.set(q.giro.x * (1 - k), q.giro.y * (1 - k), q.giro.z * (1 - k));
      _o.scale.setScalar(q.tam * (k < 0.3 ? k / 0.3 : 1) * (1 + q.cresce * (1 - k)));
      _o.updateMatrix();
      meshPart.setMatrixAt(i, _o.matrix);
    }
    meshPart.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < MAXB; i++) {
      const q = brilhos[i];
      if (q.vida > 0) {
        q.vida -= dt;
        q.v.y -= q.g * dt;
        q.v.multiplyScalar(Math.pow(0.3, dt));
        q.p.addScaledVector(q.v, dt);
      }
      const k = q.vida > 0 ? clamp(q.vida / q.max) * (0.75 + 0.25 * Math.sin(S.time * 30 + i)) : 0;
      posB[i * 3] = q.p.x; posB[i * 3 + 1] = q.vida > 0 ? q.p.y : -9999; posB[i * 3 + 2] = q.p.z;
      corB[i * 3] = q.cor.r * k; corB[i * 3 + 1] = q.cor.g * k; corB[i * 3 + 2] = q.cor.b * k;
    }
    geoB.attributes.position.needsUpdate = true;
    geoB.attributes.color.needsUpdate = true;
  }
  const aura = new T.Sprite(new T.SpriteMaterial({ map: texBrilho, color: '#ffd23f', transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  aura.visible = false;
  aura.renderOrder = 4;
  cena.add(aura);
  const anel = new T.Mesh(new T.RingGeometry(0.55, 0.85, 12), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: T.DoubleSide, fog: false }));
  anel.visible = false;
  cena.add(anel);
  let anelT = -9;
  // neve fina perto do cume
  const NNEVE = 240, posN = new Float32Array(NNEVE * 3), baseN = [];
  for (let i = 0; i < NNEVE; i++) baseN.push(entre(-16, 16), entre(-10, 12), entre(-16, 16));
  const geoN = new T.BufferGeometry();
  geoN.setAttribute('position', new T.BufferAttribute(posN, 3));
  const matNeve = new T.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const neve = new T.Points(geoN, matNeve);
  neve.frustumCulled = false;
  cena.add(neve);

  /* ---------- pós-processamento: 16 bits, dither e impact frame ---------- */
  const rt = new T.WebGLRenderTarget(2, 2, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, format: T.RGBAFormat });
  const postU = { tCena: { value: rt.texture }, uRes: { value: new T.Vector2(2, 2) }, uImpacto: { value: 0 }, uQuadro: { value: 0 }, uCentro: { value: new T.Vector2(0.5, 0.5) } };
  const cenaPost = new T.Scene(), camPost = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tela = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    uniforms: postU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tCena; uniform vec2 uRes; uniform float uImpacto; uniform float uQuadro; uniform vec2 uCentro;
      varying vec2 vUv;
      float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
      void main(){
        vec3 c = texture2D(tCena, vUv).rgb;
        if (uImpacto > 0.5) {
          float tinta = 1.0 - step(0.5, c.r);
          vec2 d = (vUv - uCentro) * vec2(uRes.x / uRes.y, 1.0);
          float ang = atan(d.y, d.x), r = length(d);
          float fatia = floor((ang / 6.28318 + 0.5) * 80.0);
          float h = fract(sin(fatia * 91.7 + uQuadro * 17.3) * 43758.5453);
          tinta = max(tinta, step(0.6, h) * step(0.16 + h * 0.3, r));
          if (mod(uQuadro, 2.0) > 0.5) tinta = 1.0 - tinta;
          c = mix(vec3(1.0, 0.96, 0.82), vec3(0.08, 0.05, 0.18), tinta);
        }
        vec2 v = vUv - 0.5;
        c *= 1.0 - dot(v, v) * 0.35;
        float dd = bayer(gl_FragCoord.xy) - 0.5;
        c = floor(c * 31.0 + 0.5 + dd) / 31.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  tela.frustumCulled = false;
  cenaPost.add(tela);

  /* ---------- céu por altitude ---------- */
  const CEUS = [
    { m: 0, preI: 0.18, topo: '#3a7fe0', hor: '#a9d6ff', nevoa: '#b7d6ee', sol: '#fff2d6', solI: 1.05, ceuA: '#c9dcf2', chaoA: '#8c8a6a', ambI: 0.72, az: 55, el: 52, perto: 90, longe: 760, estrelas: 0, aurora: 0, nuvem: '#ffffff' },
    { m: 2800, preI: 0.18, topo: '#3070d8', hor: '#c2e2ff', nevoa: '#d4e6f6', sol: '#fff0d0', solI: 1.05, ceuA: '#d0e0f4', chaoA: '#8f8c78', ambI: 0.72, az: 40, el: 44, perto: 90, longe: 800, estrelas: 0, aurora: 0, nuvem: '#ffffff' },
    { m: 4700, preI: 0.25, topo: '#4b66c6', hor: '#ffd49a', nevoa: '#f0cfa6', sol: '#ffd08a', solI: 1.0, ceuA: '#e8cdb8', chaoA: '#7a6a5a', ambI: 0.7, az: 10, el: 26, perto: 90, longe: 800, estrelas: 0, aurora: 0, nuvem: '#fff1dc' },
    { m: 6100, preI: 0.55, topo: '#563f9c', hor: '#ff8456', nevoa: '#d98a78', sol: '#ff8f4f', solI: 0.95, ceuA: '#c79ab0', chaoA: '#6a4a5a', ambI: 0.66, az: -62, el: 7, perto: 80, longe: 760, estrelas: 0, aurora: 0, nuvem: '#ffc4a4' },
    { m: 7300, preI: 0.6, topo: '#1f1b55', hor: '#a24a78', nevoa: '#4e2c5c', sol: '#c38cff', solI: 0.45, ceuA: '#8a7ab8', chaoA: '#3a2e4a', ambI: 0.62, az: -80, el: -4, perto: 70, longe: 680, estrelas: 0.6, aurora: 0.25, nuvem: '#c9a0d6' },
    { m: 8300, preI: 0.45, topo: '#050a24', hor: '#123a5c', nevoa: '#10283f', sol: '#a9c2ff', solI: 0.6, ceuA: '#6f8bc8', chaoA: '#1c2236', ambI: 0.62, az: 45, el: 40, perto: 60, longe: 620, estrelas: 1, aurora: 1, nuvem: '#9fb4dc' },
  ];
  const CORES_CEU = ['topo', 'hor', 'nevoa', 'sol', 'ceuA', 'chaoA', 'nuvem'];
  for (const c of CEUS) for (const k of CORES_CEU) c[k] = new T.Color(c[k]);
  const C = {};
  for (const k of CORES_CEU) C[k] = new T.Color();
  function ceuEm(m) {
    let i = 0;
    while (i < CEUS.length - 2 && m > CEUS[i + 1].m) i++;
    const a = CEUS[i], b = CEUS[i + 1], k = suave(a.m, b.m, m);
    for (const key in a) {
      if (key === 'm') continue;
      if (CORES_CEU.includes(key)) C[key].copy(a[key]).lerp(b[key], k);
      else C[key] = mix(a[key], b[key], k);
    }
  }
  const _sol = new V3(), corNuvemDentro = new T.Color();
  function atualizarCeu() {
    ceuEm(S.camAlt);
    ceuU.uTopo.value.copy(C.topo); ceuU.uHor.value.copy(C.hor);
    ceuU.uSolCor.value.copy(C.sol); ceuU.uEstrelas.value = C.estrelas; ceuU.uAurora.value = C.aurora; ceuU.uTempo.value = S.time;
    const el = C.el * Math.PI / 180, az = C.az * Math.PI / 180;
    _sol.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    ceuU.uSolDir.value.copy(_sol);
    const elLuz = Math.max(el, 0.08);
    sol.position.set(Math.cos(elLuz) * Math.sin(az), Math.sin(elLuz), Math.cos(elLuz) * Math.cos(az)).multiplyScalar(100).add(PER.raiz.position);
    sol.target.position.copy(PER.raiz.position);
    sol.color.copy(C.sol); sol.intensity = C.solI;
    amb.color.copy(C.ceuA); amb.groundColor.copy(C.chaoA); amb.intensity = C.ambI;
    const dentro = 1 - suave(1.5, 8, Math.abs(cam.position.y - Y_NUVEM));
    corNuvemDentro.copy(C.nuvem).lerp(C.nevoa, 0.25);
    cena.fog.color.copy(C.nevoa).lerp(corNuvemDentro, dentro * 0.9);
    cena.fog.near = mix(C.perto, 0.5, dentro);
    cena.fog.far = mix(C.longe, 28, dentro);
    ceuU.uBaixo.value.copy(cena.fog.color);
    ceuU.uNevoa.value = dentro * 0.85; ceuU.uCorNevoa.value.copy(cena.fog.color);
    preenche.color.copy(C.ceuA); preenche.intensity = C.preI;
    preenche.position.copy(cam.position).sub(PER.raiz.position).setY(4).normalize().multiplyScalar(50).add(PER.raiz.position);
    preenche.target.position.copy(PER.raiz.position);
    for (const m of mares) { m.material.color.copy(C.nuvem); m.material.opacity = m.userData.op * (1 - dentro); }
    matNuvemSolida.emissive.copy(C.nuvem).multiplyScalar(0.22);
  }

  /* ---------- câmera ---------- */
  const cam = new T.PerspectiveCamera(52, 1, 0.25, 2600);
  const camPos = new V3(0, 3, R_PE + 12), camOlhar = new V3(), camAlvo = new V3(), olharAlvo = new V3();
  let camPronta = false, cumeT0 = 0, eraCume = false;
  const _b = new V3(), _s = new V3(), _nf = new V3(), _cr = new V3(), _tmp = new V3(), _cume = new V3();
  function afastarCamera(p, alvo) {
    for (let it = 0; it < 6; it++) {
      let dentro = false;
      for (let k = 0; k <= 3; k++) {
        _tmp.lerpVectors(p, alvo, k * 0.22);
        if (_tmp.y > YT + 0.5 || _tmp.y < 0.2) continue;
        const ang = Math.atan2(_tmp.x, _tmp.z) - torcao(_tmp.y);
        if (Math.hypot(_tmp.x, _tmp.z) < raioEm(ang, _tmp.y) + (k === 0 ? 2.2 : 0.8)) { dentro = true; break; }
      }
      if (!dentro) return;
      p.addScaledVector(_nf, 1.2);
    }
  }
  function atualizarCamera(dt) {
    const yp = yDe(S.alt), yc = mix(yDe(S.camAlt), yp, 0.55), gap = yp - yc;
    const w = torcao(yc);
    _b.set(Math.sin(w), 0, Math.cos(w));
    _s.set(Math.cos(w), 0, -Math.sin(w));
    _nf.copy(_b).add(_s).normalize();
    const rc = raioEm(0, yc);
    _cr.set(_b.x * rc, yc, _b.z * rc);
    // no chão a câmera fica de frente para a montanha; na parede, de lado
    const chao = 1 - suave(0.4, 7, yc);
    const longe = 1 + clamp(Math.abs(gap) * 0.09, 0, 0.9), fora = S.out * 0.95;
    camAlvo.copy(_cr).addScaledVector(_s, mix(10.5, 12.5, chao) * longe + fora * 0.6).addScaledVector(_b, mix(0.9, 13.5, chao) + fora * 0.3);
    camAlvo.y += mix(1.3, 1.7, chao) + Math.max(0, gap) * 0.2;
    olharAlvo.copy(_cr).addScaledVector(_s, mix(0.7, 0.9, chao)).addScaledVector(_b, mix(-0.5, 1.9, chao) + fora * 0.6);
    olharAlvo.y += mix(2.4, 4.2, chao) + gap * 0.85;
    const fov = mix(52, 54, chao);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const cume = suave(YT - 5, YT - 0.5, yc);
    const noCume = S.pose === 'summit';
    if (noCume && !eraCume) cumeT0 = S.time;
    eraCume = noCume;
    if (cume > 0) {
      const a = w + 1.25 + (noCume ? (S.time - cumeT0) * 0.12 : 0);
      _cume.set(Math.sin(a) * 8.5, YT + 2.9, Math.cos(a) * 8.5);
      camAlvo.lerp(_cume, cume);
      _cume.set(0, YT + 1.5, 0);
      olharAlvo.lerp(_cume, cume);
    }
    olharAlvo.y -= S.enquadrar || 0;
    afastarCamera(camAlvo, olharAlvo);
    if (!camPronta) { camPos.copy(camAlvo); camOlhar.copy(olharAlvo); camPronta = true; }
    else if (!S.freeze) {
      // o vertical acompanha rápido para não perder o personagem nos pulos grandes
      const k = 1 - Math.exp(-dt * 7), ky = 1 - Math.exp(-dt * 16);
      for (const [p, a] of [[camPos, camAlvo], [camOlhar, olharAlvo]]) { p.x += (a.x - p.x) * k; p.z += (a.z - p.z) * k; p.y += (a.y - p.y) * ky; }
    }
    cam.position.copy(camPos);
    if (S.shake > 0.01 && !reduced) cam.position.add(_tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(S.shake * 0.45));
    cam.lookAt(camOlhar);
  }

  /* ---------- quadro a quadro ---------- */
  let ultimoSnap = -1, ultimaAcao = null, ultimoPouso = S.landT, persPronto = false, fumacaT = 0;
  const posAlvo = new V3(), quatAlvo = new T.Quaternion(), FS = novoQuadro(), _peito = new V3(), _m1 = new V3(), _m2 = new V3(), _v = new V3(), _proj = new V3();
  function corDaPoeira(y) { return y > 95 ? '#eef3fa' : y < 75 ? '#b9a48e' : '#a8a39d'; }
  function iniciouAcao(a) {
    const fim = a.A0 + a.gain;
    if (a.id === 'rara') novaBorda(fim, a.x0 > 0 ? -0.55 : 0.55);
    else if (a.id === 'rarissima') novaBorda(fim, 0);
    else if (a.id === 'lendaria') novaBorda(fim, a.x0);
    else if (a.id === 'comum') novoPiton(fim + 2.2 / YT * CUME, a.x0);
  }
  function pousou() {
    const a = S.action, id = a ? a.id : 'rara', forca = S.landPower, y = yDe(S.alt);
    quadro(angDaLat(LAT0 + S.x * LATK, y), y, FS);
    const pe = PER.raiz.position;
    for (let i = 0; i < 10 + forca * 14; i++) {
      const ang = rnd() * TAU;
      _v.copy(FS.t).multiplyScalar(Math.cos(ang)).addScaledVector(FS.u, Math.sin(ang) * 0.5).addScaledVector(FS.n, 0.6).multiplyScalar(2 + forca * 3 * rnd());
      soltar(_m1.copy(pe).addScaledVector(FS.n, 0.1), _v, corDaPoeira(y), entre(0.1, 0.22), entre(0.5, 0.95), 5);
    }
    if (forca >= 0.5) {
      const cor = COR_TIER[id] || '#ffffff';
      for (let i = 0; i < 8 + forca * 22; i++) {
        _v.set(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).normalize().multiplyScalar(2.5 + forca * 3);
        brilhar(_m1.copy(pe).addScaledVector(FS.u, 0.8), _v, i % 3 ? cor : '#ffffff', entre(0.7, 1.1), 2);
      }
    }
    anelT = S.time;
    anel.position.copy(FS.p).addScaledVector(FS.n, 0.08);
    anel.lookAt(_m2.copy(anel.position).add(FS.n));
    anel.material.color.set(COR_TIER[id] || '#ffffff');
  }

  function draw(dt) {
    const t = S.time, a = S.action;
    const dtv = S.freeze && !reduced ? 0 : dt;
    if (S.snap !== ultimoSnap) {
      ultimoSnap = S.snap;
      limparHistorico();
      camPronta = false; persPronto = false;
      ultimoPouso = S.landT;
    }
    if (a && a !== ultimaAcao) iniciouAcao(a);
    ultimaAcao = a;
    if (S.landT !== ultimoPouso) { ultimoPouso = S.landT; pousou(); }

    // personagem
    const y = alvoPersonagem(S.alt, S.x, S.out, posAlvo, quatAlvo);
    PER.raiz.position.copy(posAlvo);
    if (!persPronto) PER.raiz.quaternion.copy(quatAlvo);
    else PER.raiz.quaternion.slerp(quatAlvo, 1 - Math.exp(-dt * 12));
    let pose = S.pose;
    if (pose === 'idle' && y < 0.6) pose = 'chao';
    const alvo = alvoPose(pose, t);
    const kj = persPronto ? 1 - Math.exp(-dt * 15) : 1;
    for (const c of CHAVES) J0[c] += (alvo[c] - J0[c]) * kj;
    persPronto = true;
    aplicarJuntas(PER.J, J0);
    const corpo = PER.J.corpo, sq = S.squash;
    corpo.rotation.set(J0.inc, giroAtual(), 0);
    corpo.scale.set(1 + sq * 0.22, 1 - sq * 0.28, 1 + sq * 0.22);
    const tremor = S.charge > 0 && !reduced ? (rnd() - 0.5) * S.charge * 0.08 : 0;
    corpo.position.set(tremor, J0.alt, tremor);
    PER.J.ponta.rotation.set(-0.25 + Math.sin(t * 4) * 0.15 - S.out * 0.25, 0, Math.sin(t * 3) * 0.1);
    PER.raiz.updateMatrixWorld(true);
    _peito.set(0, 0.9, 0).applyMatrix4(PER.raiz.matrixWorld);

    // sombra de bolha, na parede ou no chão
    quadro(angDaLat(LAT0 + S.x * LATK, y), y, FS);
    if (y < 0.9) { sombra.position.set(posAlvo.x, 0.04, posAlvo.z); sombra.rotation.set(-Math.PI / 2, 0, 0); }
    else { sombra.position.copy(FS.p).addScaledVector(FS.n, 0.05); sombra.lookAt(_m1.copy(sombra.position).add(FS.n)); }
    sombra.visible = y < YT - 1.5;
    sombra.scale.setScalar(1 + S.out * 0.3);
    sombra.material.opacity = 0.22 / (1 + S.out * 0.5);

    // corda da subida comum
    if (a && a.id === 'comum') {
      corda.visible = rabo.visible = true;
      PER.J.luvaD.getWorldPosition(_m1);
      esticar(corda, _m1, ancora);
      PER.J.luvaE.getWorldPosition(_m1);
      _m2.copy(_m1).addScaledVector(FS.u, -2.8).addScaledVector(FS.n, 0.3);
      esticar(rabo, _m1, _m2);
    } else corda.visible = rabo.visible = false;

    // rastro de fantasmas e brilhos
    const corRastro = a && a.id === 'lendaria' ? '#ffd23f' : '#ff7ab8';
    for (let i = 0; i < fantasmas.length; i++) {
      const f = fantasmas[i], p = S.trail[S.trail.length - 1 - (i + 1) * 2];
      f.raiz.visible = !!p && S.trailOn;
      if (!f.raiz.visible) continue;
      alvoPersonagem(p.alt, p.x, p.out, f.raiz.position, f.raiz.quaternion);
      for (let k = 0; k < ossos.length; k++) {
        if (ossos[k].isMesh) continue;
        f.lista[k].position.copy(ossos[k].position); f.lista[k].rotation.copy(ossos[k].rotation); f.lista[k].scale.copy(ossos[k].scale);
      }
      f.mat.color.set(corRastro);
      f.mat.opacity = 0.55 * (1 - i / fantasmas.length);
    }
    if (S.trailOn && dtv > 0) for (let k = 0; k < 2; k++) {
      _v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.2);
      brilhar(_m1.copy(_peito).addScaledVector(_v, 0.5), _v, k ? corRastro : '#ffffff', entre(0.4, 0.7));
    }

    // carga do pulo lendário
    aura.visible = S.charge > 0.01;
    if (aura.visible) {
      aura.position.copy(_peito);
      aura.scale.setScalar(1.4 + S.charge * 2.4 + Math.sin(t * 40) * 0.12 * S.charge);
      aura.material.color.set(a && a.id === 'rarissima' ? '#ff7ab8' : '#ffd23f');
      aura.material.opacity = 0.3 + 0.5 * S.charge;
      if (dtv > 0 && rnd() < S.charge) {
        _v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
        brilhar(_m1.copy(_peito).addScaledVector(_v, 2.4), _v.multiplyScalar(-5), '#fff1a8', 0.45);
      }
    }
    // pedrinhas ao escorregar
    if ((pose === 'slip' || pose === 'flail') && dtv > 0 && rnd() < 0.7) {
      _v.set(rnd() - 0.5, 0.6, rnd() - 0.5).addScaledVector(FS.n, 0.8);
      soltar(_m1.copy(posAlvo).addScaledVector(FS.n, 0.05), _v, corDaPoeira(y), entre(0.06, 0.12), 1.3, 12);
    }
    // festa no cume
    if (pose === 'summit' && dtv > 0 && rnd() < 0.5) {
      _v.set(rnd() - 0.5, 1.6 + rnd(), rnd() - 0.5).multiplyScalar(3);
      brilhar(_m1.set(0, YT + 2, 0), _v, Object.values(COR_TIER)[Math.floor(rnd() * 6)], 1.6, 3);
    }
    // anel do pouso
    const ka = (t - anelT) / 0.5;
    anel.visible = ka >= 0 && ka < 1;
    if (anel.visible) { anel.scale.setScalar(1 + ka * 4); anel.material.opacity = (1 - ka) * 0.8; }
    // fogueira e fumaça
    fogo.children[0].scale.set(1, 0.85 + Math.sin(t * 13) * 0.12 + Math.sin(t * 29) * 0.06, 1);
    fogo.children[1].scale.set(1, 0.85 + Math.sin(t * 17 + 1) * 0.15, 1);
    fogo.rotation.y = t * 2;
    fumacaT -= dtv;
    if (fumacaT <= 0 && camPos.y < 30) {
      fumacaT = 0.3;
      soltar(_m1.copy(fogo.position).setY(1.1), _v.set(entre(-0.2, 0.3), 1.1, entre(-0.2, 0.2)), '#d8d6de', 0.14, 2.6, -0.1, 1.6);
    }
    ondular(bandeiraCampo, t, 1);
    ondular(bandeiraCume, t, 1);
    for (const b of aves) {
      const ang = b.fase + t * b.vel;
      b.g.position.set(b.cx + Math.cos(ang) * b.raio, b.cy + Math.sin(t * 0.7 + b.fase) * 0.8, b.cz + Math.sin(ang) * b.raio);
      b.g.rotation.y = -ang;
      b.e.rotation.z = Math.sin(t * 9 + b.fase) * 0.7;
      b.d.rotation.z = -b.e.rotation.z;
    }
    for (const m of mares) { m.material.map.offset.x += dtv * 0.0012; m.material.map.offset.y += dtv * 0.0007; }
    atualizarParticulas(dtv);

    // câmera, céu e neve
    atualizarCamera(dt);
    atualizarCeu();
    ceu.position.copy(cam.position);
    const qNeve = suave(105, 150, cam.position.y);
    neve.visible = qNeve > 0;
    if (neve.visible) {
      matNeve.opacity = qNeve * 0.9;
      for (let i = 0; i < NNEVE; i++) {
        const bx = baseN[i * 3], by = baseN[i * 3 + 1], bz = baseN[i * 3 + 2];
        const x = ((bx - t * 3.2 + 16) % 32 + 32) % 32 - 16, yy = ((by - t * 1.1 + 10) % 22 + 22) % 22 - 10;
        posN[i * 3] = cam.position.x + x; posN[i * 3 + 1] = cam.position.y + yy; posN[i * 3 + 2] = cam.position.z + bz + Math.sin(t + i) * 0.3;
      }
      geoN.attributes.position.needsUpdate = true;
    }

    // impact frame
    const impacto = S.impact && !reduced;
    postU.uImpacto.value = impacto ? 1 : 0;
    postU.uQuadro.value = S.impactFrame;
    if (impacto) { _proj.copy(_peito).project(cam); postU.uCentro.value.set(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5); }

    centralizar(dt);
    renderer.setRenderTarget(rt);
    if (impacto) {
      // impact frame: só a silhueta do alpinista, em tinta sobre papel
      cena.overrideMaterial = matTinta; cam.layers.set(1); renderer.setClearColor(0xffffff, 1);
      renderer.render(cena, cam);
      cena.overrideMaterial = null; cam.layers.set(0); renderer.setClearColor(0x000000, 1);
    } else renderer.render(cena, cam);
    renderer.setRenderTarget(null);
    renderer.render(cenaPost, camPost);
  }

  // S.centroX põe o alpinista nessa fração da largura da tela, deslocando a lente sem girar a câmera.
  // A transição entre telas é suave.
  let centro = null, larguraInterna = 1, alturaInterna = 1;
  function centralizar(dt) {
    const alvo = clamp(S.centroX ?? 0.5, 0.2, 0.8);
    centro = centro === null || reduced ? alvo : centro + (alvo - centro) * (1 - Math.exp(-dt * 4));
    if (Math.abs(centro - 0.5) < 0.001) { if (cam.view && cam.view.enabled) cam.clearViewOffset(); }
    else cam.setViewOffset(larguraInterna, alturaInterna, (0.5 - centro) * larguraInterna, 0, larguraInterna, alturaInterna);
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.max(1, Math.round(r.width * dpr)), devH = Math.max(1, Math.round(r.height * dpr));
    const k = Math.max(1, Math.round(devH / LINHAS));
    const w = Math.ceil(devW / k), h = Math.ceil(devH / k);
    larguraInterna = w; alturaInterna = h;
    renderer.setSize(w, h, false);
    canvas.style.width = (w * k / dpr) + 'px';
    canvas.style.height = (h * k / dpr) + 'px';
    rt.setSize(w, h);
    postU.uRes.value.set(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  return { draw, resize };
};
