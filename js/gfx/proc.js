// Procedural PBR texture sets and environment scenes (canvas + geometry only, no image files).
// Every texture tiles (periodic value noise), is generated once and cached by key.
//  • colour maps are sRGB; normal / roughness / metalness maps are linear (NoColorSpace)
//  • normal maps follow the OpenGL convention three.js expects (green = +v)
import * as THREE from 'three';
import { makeNoise } from '../util.js';

const cache = new Map();
export function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// ---------- periodic value noise (tileable over [0,1)²) ----------
function hashI(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function pnoise(x, y, px, py, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = hashI(x0, y0, s), b = hashI(x1, y0, s), c = hashI(x0, y1, s), d = hashI(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm over one tile: u,v in [0,1); fx,fy = integer base frequencies (periods)
export function pfbm(u, v, fx, fy, oct = 4, s = 0) {
  let a = .5, f = 1, t = 0, n = 0;
  for (let o = 0; o < oct; o++) { t += a * pnoise(u * fx * f, v * fy * f, fx * f, fy * f, s + o * 31); n += a; a *= .5; f *= 2; }
  return t / n;
}
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);

// ---------- canvas → texture ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.repeat.set(repeat[0], repeat[1]); t.userData.shared = true; return t;
}
// Fill an RGBA canvas from a per-pixel function returning [r,g,b] (0..255)
function paint(w, h, fn) { const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, p = fn(x, y, o / 4); d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = 255; } g.putImageData(img, 0, 0); return c; }
// Height field (Float32Array) → tangent-space normal map
export function normalFromHeight(H, w, h, strength = 2) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const du = (H[y * w + xr] - H[y * w + xl]) * .5 * strength, dv = -(H[yd * w + x] - H[yu * w + x]) * .5 * strength; // canvas y runs down = −v
    const il = 1 / Math.hypot(du, dv, 1), o = (y * w + x) * 4;
    d[o] = (-du * il * .5 + .5) * 255; d[o + 1] = (-dv * il * .5 + .5) * 255; d[o + 2] = (il * .5 + .5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return toTex(c, false);
}
function grey(w, h, F) { return toTex(paint(w, h, (x, y, i) => { const v = Math.max(0, Math.min(255, F[i] * 255)); return [v, v, v]; }), false); }
function field(w, h, fn) { const F = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) F[y * w + x] = fn(x / w, y / h); return F; }

// ---------- wood: rings + latewood bands + elongated pores; varnish is the material's clearcoat ----------
const WOOD = {
  walnut: { early: [92, 61, 41], late: [60, 38, 25], rings: 9, warp: 1.1, pore: .55, seed: 3 },
  oak: { early: [168, 126, 84], late: [128, 90, 56], rings: 11, warp: .9, pore: .7, seed: 5 },
  cherry: { early: [160, 96, 62], late: [122, 68, 42], rings: 10, warp: 1.0, pore: .35, seed: 7 },
  dark: { early: [82, 52, 33], late: [56, 34, 21], rings: 8, warp: 1.1, pore: .45, seed: 9 },
  plinth: { early: [84, 54, 35], late: [56, 35, 22], rings: 7, warp: 1.3, pore: .5, seed: 11 },
  light: { early: [205, 168, 120], late: [172, 134, 92], rings: 12, warp: .8, pore: .4, seed: 13 },
  bark: { early: [86, 66, 48], late: [44, 32, 22], rings: 20, warp: 5, pore: 1.4, seed: 15 }
};
export function woodSet(kind = 'walnut', S = 512) {
  return cached('wood:' + kind + S, () => {
    const k = WOOD[kind] || WOOD.walnut, N = S * S, col = new Float32Array(N * 3), H = new Float32Array(N), R = new Float32Array(N);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const warp = pfbm(u, v, 2, 1, 3, k.seed) - .5, fine = pfbm(u, v, 2, 24, 2, k.seed + 5) - .5;
      const ring = v * k.rings + warp * k.warp + fine * .35, r = fract(ring);
      const late = sst(.5, .86, r) * (1 - sst(.93, 1, r));
      const poreN = pnoise(u * 24, v * 220, 24, 220, k.seed + 9), pore = sst(.72, .92, poreN) * k.pore;
      const fig = pfbm(u, v, 4, 4, 3, k.seed + 3), streak = pfbm(u, v, 1, 40, 2, k.seed + 7);
      const tone = (.86 + .26 * fig) * (.93 + .14 * streak) * (1 - pore * .35);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = (k.early[c] + (k.late[c] - k.early[c]) * late) * tone;
      H[i] = late * .35 - pore * .9 + fine * .2;
      R[i] = .62 + pore * .35 - late * .12 + (fig - .5) * .1;
    }
    const map = toTex(paint(S, S, (x, y, i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]), true);
    return { map, normalMap: normalFromHeight(H, S, S, 2.2), roughnessMap: grey(S, S, R) };
  });
}

// ---------- metals: brushed streaks / polished smudges ----------
export function brushed(S = 256) {
  return cached('brushed' + S, () => {
    const H = field(S, S, (u, v) => pfbm(u, v, 2, 128, 3, 21) * .7 + pnoise(u * 8, v * 256, 8, 256, 22) * .3);
    const R = field(S, S, (u, v) => .62 + .38 * pfbm(u, v, 2, 96, 2, 23));
    return { normalMap: normalFromHeight(H, S, S, 1.2), roughnessMap: grey(S, S, R) };
  });
}
// polished surfaces: fingerprints and handling smudges as a roughness modulation (0.35..1)
export function smudge(S = 256) {
  return cached('smudge' + S, () => {
    const R = field(S, S, (u, v) => { const b = pfbm(u, v, 5, 5, 4, 31), sw = Math.abs(Math.sin((pfbm(u, v, 3, 3, 3, 33) * 9 + u * 6.283) * 6)); return .6 + .28 * sst(.5, .78, b) + .12 * sst(.6, 1, sw) * sst(.45, .7, b); });
    return { roughnessMap: grey(S, S, R) };
  });
}
// hammered / cast iron: patina colour, pitted normal, varied roughness
export function castIron(S = 256) {
  return cached('iron' + S, () => {
    const P = field(S, S, (u, v) => pfbm(u, v, 6, 6, 5, 41)), pits = field(S, S, (u, v) => sst(.7, .9, pnoise(u * 64, v * 64, 64, 64, 42)));
    const map = toTex(paint(S, S, (x, y, i) => { const p = P[i], rust = sst(.7, .86, p); return [50 + 36 * p + 34 * rust, 46 + 30 * p + 14 * rust, 44 + 24 * p]; }), true);
    const H = new Float32Array(S * S); for (let i = 0; i < H.length; i++) H[i] = P[i] * .5 - pits[i] * .6;
    const R = new Float32Array(S * S); for (let i = 0; i < R.length; i++) R[i] = .55 + .35 * P[i] + .1 * pits[i];
    return { map, normalMap: normalFromHeight(H, S, S, 2), roughnessMap: grey(S, S, R) };
  });
}

// ---------- non-metals ----------
export function paperSet(tone = [247, 242, 230], key = 'paper', S = 256) {
  return cached('paper' + key + S, () => {
    const F = field(S, S, (u, v) => pfbm(u, v, 32, 32, 3, 51) * .6 + pnoise(u * 16, v * 128, 16, 128, 52) * .2 + pnoise(u * 128, v * 16, 128, 16, 53) * .2);
    const L = field(S, S, (u, v) => pfbm(u, v, 3, 3, 3, 54));
    const map = toTex(paint(S, S, (x, y, i) => { const k = .94 + .05 * F[i] + .05 * (L[i] - .5); return [tone[0] * k, tone[1] * k, tone[2] * k]; }), true);
    return { map, normalMap: normalFromHeight(F, S, S, 1.4) };
  });
}
export function feltSet(S = 256) {
  return cached('felt' + S, () => {
    const F = field(S, S, (u, v) => pfbm(u, v, 48, 48, 3, 61) * .7 + pnoise(u * 128, v * 128, 128, 128, 62) * .3);
    const map = toTex(paint(S, S, (x, y, i) => { const k = 205 + 50 * F[i]; return [k, k, k]; }), true);
    return { map, normalMap: normalFromHeight(F, S, S, 2.5) };
  });
}
export function marbleSet(S = 512) {
  return cached('marble' + S, () => {
    const col = new Float32Array(S * S * 3), R = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x, w = pfbm(u, v, 3, 3, 5, 71);
      const t = Math.abs(Math.sin(Math.PI * 2 * (u * 2 + v + w * 2.6))), vein = Math.pow(1 - t, 10) * .8 + Math.pow(1 - t, 40) * .6;
      const cloud = pfbm(u, v, 6, 6, 4, 72), base = 236 - 18 * cloud;
      col[i * 3] = base - vein * 120; col[i * 3 + 1] = base - 2 - vein * 112; col[i * 3 + 2] = base - 8 - vein * 100; R[i] = .5 + .3 * cloud + vein * .2;
    }
    return { map: toTex(paint(S, S, (x, y, i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]), true), roughnessMap: grey(S, S, R) };
  });
}
// generic micro-relief: orange-peel glaze, rubber, plastic, leather pebble, weave, ground
export function relief(kind = 'peel', S = 256) {
  return cached('relief' + kind + S, () => {
    let F, st = 1.5;
    if (kind === 'peel') { F = field(S, S, (u, v) => pfbm(u, v, 24, 24, 2, 81)); st = .8; }
    else if (kind === 'rubber') { F = field(S, S, (u, v) => pfbm(u, v, 64, 64, 2, 82)); st = 1.6; }
    else if (kind === 'leather') { F = field(S, S, (u, v) => 1 - Math.abs(2 * pfbm(u, v, 20, 20, 3, 83) - 1)); st = 3; }
    else if (kind === 'weave') { F = field(S, S, (u, v) => { const a = Math.sin(u * Math.PI * 2 * 48), b = Math.sin(v * Math.PI * 2 * 48); return .5 + .25 * (a * (b > 0 ? 1 : .3) + b * (a > 0 ? .3 : 1)) + .1 * pnoise(u * 96, v * 96, 96, 96, 84); }); st = 2.5; }
    else if (kind === 'stone') { F = field(S, S, (u, v) => pfbm(u, v, 8, 8, 5, 85)); st = 4; }
    else if (kind === 'ground') { F = field(S, S, (u, v) => pfbm(u, v, 12, 12, 4, 86)); st = 3.5; }
    else if (kind === 'ripple') { F = field(S, S, (u, v) => pfbm(u, v, 6, 6, 3, 87) * .6 + .4 * pfbm(u, v, 16, 16, 2, 88)); st = 2; }
    else F = field(S, S, (u, v) => pfbm(u, v, 16, 16, 3, 89));
    const R = new Float32Array(F.length); for (let i = 0; i < F.length; i++) R[i] = .8 + .2 * F[i];
    return { normalMap: normalFromHeight(F, S, S, st), roughnessMap: grey(S, S, R), height: F };
  });
}
// tinted variation map (multiplies the material colour): soil, sand, grass, snow, foliage
export function variation(kind, S = 256) {
  return cached('var' + kind + S, () => {
    const seeds = { soil: 91, sand: 92, grass: 93, snow: 94, foliage: 95, stone: 96, plaster: 97 }, s = seeds[kind] || 99;
    const F = field(S, S, (u, v) => pfbm(u, v, 8, 8, 5, s)), G = field(S, S, (u, v) => pnoise(u * 96, v * 96, 96, 96, s + 1));
    const map = toTex(paint(S, S, (x, y, i) => { const k = 190 + 55 * F[i] + 25 * (G[i] - .5); return [k, k, k * (kind === 'grass' ? .96 : 1)]; }), true);
    return { map };
  });
}

// ---------- soft shapes used for lights, decals and blobs ----------
export function softRect(S = 128, edge = .22) {
  return cached('softrect' + S + edge, () => toTex(paint(S, S, (x, y) => { const u = Math.abs(x / (S - 1) * 2 - 1), v = Math.abs(y / (S - 1) * 2 - 1); const k = (1 - sst(1 - edge, 1, u)) * (1 - sst(1 - edge, 1, v)); const c = 255 * k; return [c, c, c]; }), true));
}
export function softDisc(S = 128, inner = 0) {
  return cached('softdisc' + S + inner, () => { const c = canvas(S, S), g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, S * inner * .5, S / 2, S / 2, S / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(.6, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); const t = toTex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; });
}

// ---------- sky layers for backdrops: horizontally tileable cloud banks and hill silhouettes ----------
// Cumulus banks for backdrops, painted like a matte painting: each cloud is a cluster of soft puffs clipped to a
// flat base, with a per-cloud strength stored in alpha (so a coverage threshold grows clouds in and out), then
// self-shadowed (density above a texel darkens it: bright tops, grey bellies). Tiles horizontally.
export function cloudLayer(seed = 1, W = 1024, H = 256, puff = 1, size = 1) {
  return cached('cloud' + seed + W + H + puff + size, () => {
    const r = mulberryP(seed * 7919 + 13), c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true }), K = H / 256; size *= K;
    const n = Math.round(16 * puff * (W / H / 8) / Math.sqrt(size / K));
    for (let k = 0; k < n; k++) {
      const cx = r() * W, base = H * (.6 + r() * .26), w = (50 + r() * r() * 260) * size, h = (30 + r() * 80 * (w / 200 / size + .4)) * size, str = .35 + r() * .65, m = 18 + Math.floor(r() * 36);
      for (const ox of [-W, 0, W]) {
        if (cx + ox + w < -50 || cx + ox - w > W + 50) continue;
        for (let i = 0; i < m; i++) {
          const dx = (r() + r() + r() - 1.5) / 1.5 * w * .55, fall = 1 - Math.min(1, Math.abs(dx) / (w * .6)), pr = (10 + r() * 34) * (.5 + fall * .8) * size, py = base - pr * .55 - r() * h * (.25 + .75 * fall) * .55;
          const gr = g.createRadialGradient(cx + ox + dx, py, 0, cx + ox + dx, py, pr); gr.addColorStop(0, `rgba(255,255,255,${.42 * str})`); gr.addColorStop(.5, `rgba(255,255,255,${.26 * str})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx + ox + dx, py, pr, 0, 7); g.fill();
        }
      }
    }
    // self-shadowing from the density above each texel
    const img = g.getImageData(0, 0, W, H), d = img.data, A = new Float32Array(W * H); for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] / 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let acc = 0; for (let k = 4; k <= 28; k += 6) { const yy = y - Math.round(k * K); if (yy >= 0) acc += A[yy * W + x]; }
      const k = Math.min(1, acc / 3), o = (y * W + x) * 4; // lit white → cool grey-blue belly
      d[o] = 255 * (1 - .22 * k); d[o + 1] = 255 * (1 - .19 * k); d[o + 2] = 255 * (1 - .12 * k); d[o + 3] = 255 * Math.min(1, A[y * W + x] * 1.7);
    }
    g.putImageData(img, 0, 0); const t = toTex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}
function mulberryP(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hillLayer(seed = 1, W = 1024, H = 256, rough = 1, height = .55) {
  return cached('hill' + seed + W + H + rough + height, () => {
    const c = canvas(W, H), g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) { const u = x / W, hgt = (pfbm(u, 0, 4, 1, 3, seed) * .75 + pfbm(u, .5, 24, 1, 2, seed + 1) * .25 * rough) * height; g.lineTo(x, H - hgt * H); }
    g.lineTo(W, H); g.closePath();
    const gr = g.createLinearGradient(0, H * (1 - height), 0, H); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#b9b9b9'); g.fillStyle = gr; g.fill();
    // trees / hedgerows along the ridge
    const r = (i) => hashI(i, seed, 7); for (let i = 0; i < 420; i++) { const u = r(i), x = u * W, hgt = (pfbm(u, 0, 4, 1, 3, seed) * .75 + pfbm(u, .5, 24, 1, 2, seed + 1) * .25 * rough) * height; const s = 1.5 + r(i + 999) * r(i + 333) * 7, yy = H - hgt * H + s * .5 + r(i + 77) * H * .25 * height;
      const cg = g.createRadialGradient(x - s * .3, yy - s * .4, 1, x, yy, s * 1.1); cg.addColorStop(0, '#f0f0f0'); cg.addColorStop(1, '#b4b4b4'); g.fillStyle = cg; g.beginPath(); g.ellipse(x, yy, s * .75, s, 0, 0, 7); g.fill(); }
    // fields and hedgerows: faint horizontal banding lower down
    g.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${r(i + 500) < .5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(0, H * (1 - height * .6) + i * H * height * .045, W, H * height * .03); } g.globalCompositeOperation = 'source-over';
    const t = toTex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}

// ---------- environment scenes for PMREM: studio softboxes, sky domes ----------
// Emitters are MeshBasicMaterials with colour > 1 (HDR); the PMREM keeps the dynamic range,
// so glass and polished metal pick up crisp rectangular highlights instead of a grey blur.
function emitter(w, h, color, I, tex) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(I), map: tex || softRect(), side: THREE.DoubleSide, toneMapped: false })); return m; }
function aim(m, pos, target = [0, 2, 0]) { m.position.set(...pos); m.lookAt(new THREE.Vector3(...target)); return m; }
function gradientDome(top, mid, bottom, I = 1, R = 50) {
  const geo = new THREE.SphereGeometry(R, 48, 24), pos = geo.attributes.position, col = [], c = new THREE.Color(), T = new THREE.Color(top), M = new THREE.Color(mid), B = new THREE.Color(bottom);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / R; if (y > 0) c.copy(M).lerp(T, Math.pow(y, .6)); else c.copy(M).lerp(B, Math.min(1, -y * 4)); c.multiplyScalar(I); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false }));
}
export function envScene(kind = 'studio') {
  const s = new THREE.Scene();
  switch (kind) {
    case 'landscape': case 'ocean': {
      s.add(gradientDome(0x3a6fb8, 0xcfd9e2, kind === 'ocean' ? 0x1a4a60 : 0x4a4a32, 1.1));
      const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .93, .8).multiplyScalar(60) })); sun.position.set(20, 30, 18); s.add(sun);
      s.add(aim(emitter(40, 12, 0xeef2f6, .9, softDisc()), [0, 24, -30])); break;
    }
    case 'night': {
      s.add(gradientDome(0x0c1426, 0x1a2236, 0x080604, .5));
      s.add(aim(emitter(3, 3, 0xc8d4ff, 6, softDisc()), [-14, 22, 8])); s.add(aim(emitter(4, 6, 0xffb060, 2.5), [16, 4, -6])); break;
    }
    case 'cosmos': {
      s.add(gradientDome(0x020308, 0x04050c, 0x020204, 1));
      s.add(aim(emitter(5, 5, 0xfff0d0, 14, softDisc()), [18, 10, 12])); s.add(aim(emitter(20, 20, 0x2a3a70, .25, softDisc()), [-20, -6, -14])); break;
    }
    case 'micro': {
      s.add(gradientDome(0x2a7a72, 0x0f3a38, 0x041412, 1));
      s.add(aim(emitter(10, 10, 0xd8fff2, 5, softDisc()), [0, 26, 4])); s.add(aim(emitter(3, 14, 0x9fffe0, 3), [-18, 6, -8])); break;
    }
    default: { // studio / lab / abstract / desk: a dark room with softboxes
      const cool = kind === 'lab' || kind === 'abstract', wall = cool ? 0x30343a : 0x3a3026;
      const room = new THREE.Mesh(new THREE.BoxGeometry(44, 26, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(wall).multiplyScalar(.9), side: THREE.BackSide })); room.position.y = 10; s.add(room); s.add(aim(emitter(44, 16, cool ? 0x8a96a8 : 0x8a8070, 1.1, softRect(128, .45)), [0, 8, 21])); // broad front bounce card (no hotspot): metals facing the camera stay bright
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(cool ? 0x2a2c30 : 0x3a2c1e).multiplyScalar(.7) })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.9; s.add(floor);
      const key = cool ? 0xf2f6ff : 0xfff1dc, fill = cool ? 0xd8e6ff : 0xdfe6f2;
      s.add(aim(emitter(10, 7, key, 9), [10, 15, 9]));            // key softbox, high front-right
      s.add(aim(emitter(14, 9, fill, 2.2), [-16, 7, 8]));         // large fill, left
      s.add(aim(emitter(2.2, 14, 0xffffff, 7), [-12, 9, -12]));   // strip rim, back-left
      s.add(aim(emitter(2.2, 14, key, 5), [13, 9, -11]));         // strip rim, back-right
      s.add(aim(emitter(9, 9, 0xffffff, 3.2, softDisc()), [0, 20, 0])); // overhead
      s.add(aim(emitter(26, 3, cool ? 0x9fb4d0 : 0xd6a878, .9), [0, 1.5, -20])); // low warm horizon band (gives glass a ground line)
    }
  }
  return s;
}

// World-scaled, grain-aligned UVs for box / cylinder geometry: one texture tile per `tile` world units, and every
// face's u axis along its longer side, so wood grain runs along posts and beams instead of across them.
export function alignUV(geo, tile = 2.4) {
  const uv = geo.attributes.uv, pos = geo.attributes.position, idx = geo.index; if (!uv || !pos) return geo;
  const isCyl = geo.type === 'CylinderGeometry', A = new THREE.Vector3(), B = new THREE.Vector3();
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: idx ? idx.count : pos.count }];
  groups.forEach((gr, gi) => {
    const set = new Set(); for (let i = gr.start; i < gr.start + gr.count; i++) set.add(idx ? idx.getX(i) : i);
    const vs = [...set]; if (vs.length < 3) return;
    if (isCyl && gi > 0) { const r = Math.max(geo.parameters.radiusTop, geo.parameters.radiusBottom); vs.forEach(v => uv.setXY(v, (uv.getX(v) - .5) * 2 * r / tile, (uv.getY(v) - .5) * 2 * r / tile)); return; }
    let a = vs[0], b = vs[0], c = vs[0];
    vs.forEach(v => { const u0 = uv.getX(v), v0 = uv.getY(v); if (u0 + v0 < uv.getX(a) + uv.getY(a)) a = v; if (u0 - v0 > uv.getX(b) - uv.getY(b)) b = v; if (v0 - u0 > uv.getY(c) - uv.getX(c)) c = v; });
    let lenU, lenV;
    if (isCyl) { const P = geo.parameters; lenU = Math.PI * (P.radiusTop + P.radiusBottom) * (P.thetaLength / (Math.PI * 2)); lenV = P.height; }
    else { const du = uv.getX(b) - uv.getX(a) || 1, dv = uv.getY(c) - uv.getY(a) || 1; lenU = A.fromBufferAttribute(pos, b).distanceTo(B.fromBufferAttribute(pos, a)) / du; lenV = A.fromBufferAttribute(pos, c).distanceTo(B.fromBufferAttribute(pos, a)) / dv; }
    const swap = lenV > lenU;
    vs.forEach(v => { const u0 = uv.getX(v), v0 = uv.getY(v); if (swap) uv.setXY(v, v0 * lenV / tile, u0 * lenU / tile); else uv.setXY(v, u0 * lenU / tile, v0 * lenV / tile); });
  });
  uv.needsUpdate = true; return geo;
}
