// Procedural textures (canvas-generated so the project ships no image files).
import * as THREE from 'three';
import { mulberry, makeNoise, measureMath, canvasMath } from '../util.js';
import { AAA } from './aaa.js';

const cache = new Map();
export function canvasTex(key, w, h, draw, { repeat, srgb = true, aniso = 8 } = {}) {
  // the cached original is shared (never disposed); a clone shares its image and GPU upload but is the caller's to dispose
  if (key && cache.has(key)) { const t = cache.get(key).clone(); delete t.userData.shared; if (repeat) t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; return t; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (key) { cache.set(key, t); t.userData.shared = true; }
  return t;
}
function grain(g, w, h, r, n, a = .06) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } }

// ---------- surface stacks: companion normal / roughness maps for the colour textures below ----------
// A colour texture made here can carry a lazily built companion set { normalMap, roughnessMap, normalScale, roughness,
// metalnessMap } (keyed by its canvas, so cache clones share it). surfaces.js `enrich()` attaches them to materials
// built elsewhere (props, rooms) that only set `map`, so every textured surface gets colour + normal + roughness.
// Never blocking: companions() returns at once with small flat placeholder textures (so materials compile a single
// time with their normal/roughness maps); the real maps are baked one job per idle slice (requestIdleCallback, ~10–60 ms
// each at the 'medium' resolution) and swapped in as a new texture Source (same Texture object: no recompile). The
// resolution follows the quality level (half size below 'high'). meta = the static part: { normalScale, roughness,
// metalness, metalMap, sheen, nrm: false (no normal map), rgh: false (no roughness map), r: placeholder roughness }.
const COMP = new WeakMap(), JOBS = [];
let pumping = false;
export const compRes = () => AAA.quality === 'high' ? 1 : .5;
function pump() {
  if (pumping || !JOBS.length) return; pumping = true;
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16));
  idle(() => { const t0 = performance.now(); try { JOBS.shift()(); } catch (e) { console.warn('texture bake', e); } BAKE.ms += performance.now() - t0; BAKE.n++; pumping = false; if (JOBS.length) setTimeout(pump, 0); }, { timeout: 1200 });
}
export const BAKE = { ms: 0, n: 0, log: [], pending: () => JOBS.length, now() { while (JOBS.length) JOBS.shift()(); } };
// the placeholder already has the final size (r170 allocates immutable storage: a later image of another size cannot
// be uploaded into it), filled flat; the bake draws into it and flags it for upload
function placeholder(rgb, w = 4, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb})`; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.shared = true; return t;
}
export function companions(t) {
  const e = t && t.image && COMP.get(t.image); if (!e) return null; if (e.res) return e.res;
  const m = e.meta, rv = Math.round((m.r ?? .6) * 255);
  const k = compRes(), sz = typeof m.size === 'function' ? m.size(k) : [256, 256];
  const res = e.res = Object.assign({}, m, { normalMap: m.nrm === false ? null : placeholder('128,128,255', sz[0], sz[1]), roughnessMap: m.rgh === false ? null : placeholder(`255,${rv},0`, sz[0], sz[1]) });
  delete res.size;
  JOBS.push(() => { const t0 = performance.now(), v = e.fn(); ['normalMap', 'roughnessMap'].forEach(q => { const d = res[q], src = v[q]; if (d && src && src.image) { d.image.getContext('2d').drawImage(src.image, 0, 0, d.image.width, d.image.height); d.needsUpdate = true; } }); BAKE.log.push([e.meta.name || '?', Math.round(performance.now() - t0)]); }); pump();
  return res;
}
function withComp(t, fn, meta = {}) { if (t && t.image && !COMP.has(t.image)) COMP.set(t.image, { fn, meta }); return t; }
// tileable height field (Float32, row-major, canvas rows top→bottom) → tangent-space normal map (OpenGL: +G = up the
// canvas = +v). strength = height units per texel step.
function nrmTex(key, H, w, h, strength = 2) {
  return canvasTex(key, w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
      const du = (H[y * w + xr] - H[y * w + xl]) * .5 * strength, dv = (H[yu * w + x] - H[yd * w + x]) * .5 * strength, il = 1 / Math.hypot(du, dv, 1), o = (y * w + x) * 4;
      d[o] = (-du * il * .5 + .5) * 255; d[o + 1] = (-dv * il * .5 + .5) * 255; d[o + 2] = (il * .5 + .5) * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}
// grey map from a Float32 field (0..1) in G (three reads roughness from G, metalness from B, AO from R); optional B field
function greyTex(key, F, w, h, B = null) {
  return canvasTex(key, w, h, (g) => { const img = g.createImageData(w, h), d = img.data; for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, F[i] * 255)); d[i * 4] = 255; d[i * 4 + 1] = v; d[i * 4 + 2] = B ? Math.max(0, Math.min(255, B[i] * 255)) : v; d[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); }, { srgb: false });
}
// periodic value noise and fbm on a w×h texel grid (period = the texture), for heights that tile
function hashI(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function pn(x, y, px, py, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py, a = hashI(x0, y0, s), b = hashI(x1, y0, s), c = hashI(x0, y1, s), e = hashI(x1, y1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; }
function pfbm(u, v, fx, fy, oct, s) { let a = .5, f = 1, t = 0, n = 0; for (let o = 0; o < oct; o++) { t += a * pn(u * fx * f, v * fy * f, fx * f, fy * f, s + o * 31); n += a; a *= .5; f *= 2; } return t / n; }
function fieldF(w, h, fn) { const F = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) F[y * w + x] = fn(x / w, y / h, x, y); return F; }
// read a canvas back as Float32 channels (0..1)
function readCh(c, ch = 0) { const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, F = new Float32Array(w * h); for (let i = 0; i < w * h; i++) F[i] = d[i * 4 + ch] / 255; return F; }
function blurF(F, w, h, r = 1) { // separable box blur, wrapping (tileable)
  const T = new Float32Array(F.length), O = new Float32Array(F.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += F[y * w + ((x + k + w) % w)]; T[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += T[((y + k + h) % h) * w + x]; O[y * w + x] = s / n; }
  return O;
}

export function woodPlanks(tone = [92, 58, 34], key = 'planks') {
  const draw = (g, w, h) => {
    const r = mulberry(11), plank = h / 8;
    for (let y = 0; y < 8; y++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 260 + r() * 340, v = .82 + r() * .3;
        g.fillStyle = `rgb(${tone[0] * v | 0},${tone[1] * v | 0},${tone[2] * v | 0})`; g.fillRect(x, y * plank, len, plank);
        for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(30,15,5,${.05 + r() * .12})`; g.lineWidth = .6 + r() * 1.6; g.beginPath(); const yy = y * plank + r() * plank; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + r() * 6 - 3, x + len * .6, yy + r() * 6 - 3, x + len, yy + r() * 4 - 2); g.stroke(); }
        if (r() < .25) { g.fillStyle = 'rgba(40,20,8,.35)'; g.beginPath(); g.ellipse(x + r() * len, y * plank + plank / 2, 6 + r() * 6, 3 + r() * 3, 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + len - 2, y * plank, 2, plank);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y * plank + plank - 2, w, 2);
    }
    grain(g, w, h, r, 9000);
  };
  return { map: canvasTex(key, 1024, 1024, draw), bump: canvasTex(key + '-b', 1024, 1024, draw, { srgb: false }) };
}
export function woodGrain(tone = [120, 74, 40], key = 'grain') {
  return canvasTex(key + tone.join(), 512, 512, (g, w, h) => {
    const r = mulberry(5); g.fillStyle = `rgb(${tone})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(${40 + r() * 30},${18 + r() * 15},5,${.1 + r() * .25})`; g.lineWidth = .5 + r() * 2.5; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + r() * 14 - 7, w * .6, y + r() * 14 - 7, w, y + r() * 8 - 4); g.stroke(); }
    grain(g, w, h, r, 4000, .05);
  });
}
export function plaster(tone = [214, 200, 176], key = 'plaster', amp = .22) {
  const K = key + tone.join() + (amp === .22 ? '' : amp);
  return withComp(canvasTex(K, 512, 512, (g, w, h) => {
    const n = makeNoise(3), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n.fbm(x / 90, y / 90, 0, 4) * .5 + n(x / 9, y / 9) * .12, o = (y * w + x) * 4, k = 1 + v * amp; img.data[o] = tone[0] * k; img.data[o + 1] = tone[1] * k; img.data[o + 2] = tone[2] * k; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0);
    // a few hairline cracks and settled dust in them (drawn by the same walk as the relief below)
    plasterCracks(K).forEach(pts => { g.strokeStyle = 'rgba(110,100,88,.07)'; g.lineWidth = .5; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); });
  }), () => plasterComp(K), { name: 'plaster', size: k => [512 * k, 512 * k], normalScale: .4, roughness: 1, r: .9 });
}
function plasterCracks(K) { const r = mulberry(K.length * 13 + 5), out = []; for (let c = 0; c < 2; c++) { let x = r() * 512, y = r() * 512, a = r() * 6.28; const pts = [[x, y]]; for (let k = 0; k < 20 + r() * 40; k++) { a += (r() - .5) * 1.1; x += Math.cos(a) * 3; y += Math.sin(a) * 3; pts.push([x, y]); } out.push(pts); } return out; }
// lime plaster: trowel undulation (~0.4–0.6 m waves at the walls' 4.5 m tile), sand grit, hairline cracks; matte
function plasterComp(K) {
  const S = 512 * compRes(), f = S / 512, H = fieldF(S, S, (u, v) => pfbm(u, v, 9, 9, 3, 61) * 1.6 + pfbm(u, v, 96, 96, 2, 62) * .45 + (pn(u * 256, v * 256, 256, 256, 63) > .82 ? .25 : 0)), R = fieldF(S, S, (u, v) => .86 + .1 * pfbm(u, v, 12, 12, 2, 64));
  plasterCracks(K).forEach(pts => pts.forEach(([x, y]) => { const i = ((Math.round(y * f) % S + S) % S) * S + ((Math.round(x * f) % S + S) % S); H[i] -= .1; }));
  return { normalMap: nrmTex(K + '-n', blurF(H, S, S, 1), S, S, 1.4), roughnessMap: greyTex(K + '-r', R, S, S), normalScale: .4, roughness: 1 };
}
export function stone(key = 'stone') {
  return canvasTex(key, 512, 512, (g, w, h) => {
    const r = mulberry(7); g.fillStyle = '#5b544b'; g.fillRect(0, 0, w, h); const bh = 64;
    for (let y = 0; y < h; y += bh) { const off = (y / bh) % 2 ? 64 : 0; for (let x = -128; x < w; x += 128) { const v = 82 + r() * 26; g.fillStyle = `rgb(${v + 10},${v + 4},${v - 4})`; g.fillRect(x + off + 3, y + 3, 122, bh - 6); } }
    grain(g, w, h, r, 9000, .12);
  });
}
export function parchment(key = 'parch', w = 512, h = 1024) {
  return withComp(canvasTex(key, w, h, (g) => parchDraw(g, w, h)), () => {
    const k = compRes(); w = Math.max(64, w * k | 0); h = Math.max(64, h * k | 0);
    // vellum/rag paper: a cockled sheet (low waves), felted fibres (short random strokes), matte with a slight sheen
    const F = fieldF(w, h, (u, v) => pfbm(u, v, 3, 6, 3, 91) * 1.4 + pfbm(u, v, 48, 96, 2, 92) * .3), r = mulberry(93);
    for (let k = 0; k < w * h / 40; k++) { let x = r() * w, y = r() * h; const a = r() * 6.28, L = 3 + r() * 9; for (let t = 0; t < L; t++) { const i = ((y | 0) % h) * w + ((x | 0) % w); F[i] += .12; x = (x + Math.cos(a) + w) % w; y = (y + Math.sin(a) + h) % h; } }
    const R = fieldF(w, h, (u, v) => .74 + .14 * pfbm(u, v, 8, 16, 2, 94));
    return { normalMap: nrmTex(key + '-n' + w, blurF(F, w, h, 1), w, h, 1.3), roughnessMap: greyTex(key + '-r' + w, R, w, h) };
  }, { name: 'parchment', size: k => [Math.max(64, w * k | 0), Math.max(64, h * k | 0)], normalScale: .35, roughness: 1, r: .8 });
}
function parchDraw(g, w, h) {
  {
    const r = mulberry(9), n = makeNoise(4), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n.fbm(x / 120, y / 120, 0, 4), o = (y * w + x) * 4, e = Math.min(1, Math.min(x, w - x) / 40) * Math.min(1, Math.min(y, h - y) / 40); const k = .86 + v * .12 + e * .1; img.data[o] = 236 * k; img.data[o + 1] = 222 * k; img.data[o + 2] = 188 * k; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0); grain(g, w, h, r, 3000, .05);
  }
}
export function paper(key = 'paper') {
  return canvasTex(key, 512, 512, (g, w, h) => {
    const r = mulberry(2), n = makeNoise(8), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n(x / 6, y / 6) * .03 + n.fbm(x / 80, y / 80, 0, 3) * .04, o = (y * w + x) * 4; img.data[o] = 247 * (1 + v); img.data[o + 1] = 242 * (1 + v); img.data[o + 2] = 230 * (1 + v); img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
}
export function rug(colors = ['#5b1f1a', '#8a3a25', '#c79a4a', '#1f2d3d'], key = 'rug') {
  return canvasTex(key, 1024, 768, (g, w, h) => {
    g.fillStyle = colors[0]; g.fillRect(0, 0, w, h);
    const band = (m, c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(20, colors[2], 10); band(46, colors[3], 22); band(80, colors[2], 4); band(100, colors[1], 16);
    g.save(); g.translate(w / 2, h / 2);
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = i % 2 ? colors[2] : colors[1]; g.beginPath(); g.ellipse(0, 120, 30, 90, 0, 0, 7); g.fill(); }
    g.fillStyle = colors[3]; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill(); g.fillStyle = colors[2]; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); g.restore();
    const r = mulberry(3); for (let i = 0; i < 40000; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,240,210'},${r() * .06})`; g.fillRect(r() * w, r() * h, 2, 1); }
  });
}
// Leather (book covers, desk tops, blotters): a pebbled grain of shallow cells (crinkles between them), a few deeper
// creases, lighter rubbed patches and darker hollows; roughness 0.45 (polished highs) to 0.75 (the grain's valleys).
export function leather(tone = '#6b2a1e', key = 'leather') {
  const K = key + tone, S = 256;
  const cell = () => { if (!LEA.has(S)) LEA.set(S, fieldF(S, S, (u, v) => { const a = pfbm(u, v, 40, 40, 2, 83), b = pfbm(u, v, 9, 9, 2, 84); return (1 - Math.abs(2 * a - 1)) * .8 + b * .5; })); return LEA.get(S); };
  return withComp(canvasTex(K, S, S, (g, w, h) => {
    const C = cell(), c = new THREE.Color(tone), img = g.createImageData(w, h), rub = fieldF(w, h, (u, v) => pfbm(u, v, 4, 4, 3, 85));
    for (let i = 0; i < w * h; i++) { const k = .78 + .3 * C[i] + .18 * Math.max(0, rub[i] - .55); img.data[i * 4] = Math.min(255, c.r * 255 * k); img.data[i * 4 + 1] = Math.min(255, c.g * 255 * k); img.data[i * 4 + 2] = Math.min(255, c.b * 255 * k); img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0); const r = mulberry(4); grain(g, w, h, r, 3000, .1);
  }), () => {
    const C = cell(), R = new Float32Array(S * S); for (let i = 0; i < S * S; i++) R[i] = .78 - .3 * C[i];
    return { normalMap: nrmTex('lea-n', C, S, S, 3), roughnessMap: greyTex('lea-r', R, S, S) };
  }, { name: 'leather', size: () => [256, 256], normalScale: .55, roughness: 1, r: .62 });
}
const LEA = new Map();
// Text plaque / tag texture
export function labelTex(text, { w = 512, h = 128, bg = '#1a120b', fg = '#e7c477', font = '600 54px "IM Fell English SC", Georgia, serif', border = '#8f733a', sub = '' } = {}) {
  return canvasTex(null, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); if (border) { g.strokeStyle = border; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = parseInt(font.match(/(\d+)px/)[1]); while (measureMath(g, text) > w - 40 && fs > 14) { fs -= 2; g.font = font.replace(/\d+px/, fs + 'px'); }
    canvasMath(g, text, w / 2, sub ? h * .4 : h / 2 + 2, w - 40);   // maxWidth: a very long name is condensed, never cut by the frame
    if (sub) { g.font = '400 ' + Math.round(fs * .45) + 'px "IBM Plex Mono", monospace'; g.globalAlpha = .7; g.fillText(sub, w / 2, h * .76); }
  }, { aniso: 4 });
}
export function radialGlow(color = '255,220,150') {
  return canvasTex('glow' + color, 128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 2, 64, 64, 64); r.addColorStop(0, `rgba(${color},1)`); r.addColorStop(.25, `rgba(${color},.45)`); r.addColorStop(1, `rgba(${color},0)`); g.fillStyle = r; g.fillRect(0, 0, w, w); });
}
export function gradientSky(top = '#1a2a44', bottom = '#e8b07a', key) {
  return canvasTex(key || ('sky' + top + bottom), 16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}

// ---------------------------------------------------------------------------------------------------------------
// Baroque library textures: scagliola / marble, gilding, fluting, checkered marble floors, ceiling frescoes,
// rocaille stucco, book spines, damask. All canvas-drawn, tileable where they repeat, cached by key, ≤ 1024².
// ---------------------------------------------------------------------------------------------------------------
export const MARBLES = {
  rose: { base: '#d0b8b2', cloud: ['#e3d3cd', '#b89b95', '#eee5df', '#a5877f', '#d6c2bc'], vein: '#7d5a55', vein2: '#f3ede8' },   // a dusty, greyed rose (a vivid salmon read as plastic under the warm lamps)
  teal: { base: '#4f8886', cloud: ['#72a7a2', '#2f6061', '#a3c9c1', '#3d7072', '#5b9690'], vein: '#1b3a3c', vein2: '#dcefe8' },
  dark: { base: '#3b312d', cloud: ['#4c3f39', '#2a2220', '#5c4c44', '#332a26'], vein: '#dcd2c4', vein2: '#8e7d6c' },
  statuary: { base: '#ece8e1', cloud: ['#f7f4ef', '#ddd7ce', '#e6e1d9', '#f2eee8'], vein: '#a7a19a', vein2: '#cfc8bf', faint: true },
  warmgrey: { base: '#958a82', cloud: ['#a59a91', '#7f756e', '#b0a69c', '#8a7f77'], vein: '#5d544e', vein2: '#d8d0c6' },
  cream: { base: '#ebe5d8', cloud: ['#f5f1e8', '#ddd5c4', '#e4ddcf'], vein: '#b9ae9c', vein2: '#d8cfbf', faint: true },
  // a soft dove-grey: the dark tile of the hall floor, close enough in value to the cream that the floor stays a ground,
  // not the highest-contrast thing in view (presentation-craft value check)
  dove: { base: '#bdb0a1', cloud: ['#c9bdaf', '#aea192', '#c4b8a9', '#b3a696'], vein: '#8a7d70', vein2: '#ddd3c6' },
  grey: { base: '#8e8a85', cloud: ['#a19d97', '#76726d', '#9a958e'], vein: '#55514c', vein2: '#c4bfb7' },
  red: { base: '#a3645a', cloud: ['#b8796c', '#8a4d44', '#c58c7f', '#97564c'], vein: '#5a2a24', vein2: '#e6c2b4' },
  // the antique marbles of the columns (Roman spolia): giallo antico (Chemtou: warm yellow, rust veins), verde antico
  // (Thessalian breccia: dark green with white and black fragments), rosso antico (Taenarum: deep oxblood, fine dark
  // veins) and pavonazzetto (Docimium: white with violet veins and clasts)
  giallo: { base: '#d2cabb', cloud: ['#e1dacb', '#bcb09a', '#eae5da', '#aca290', '#d5ccbb'], vein: '#86705c', vein2: '#f0ebe2' },   // pale, weathered giallo antico: honey-cream, not mustard
  verde: { base: '#2c4a3b', cloud: ['#3e6550', '#1b2f26', '#5d8a70', '#24382e', '#e6eee6', '#0f1814'], vein: '#e8efe8', vein2: '#0c1410' },
  rosso: { base: '#7a221d', cloud: ['#8d2e26', '#5e1714', '#9c3b30', '#6a1c18'], vein: '#3a0c0a', vein2: '#c46a58' },
  pavonazzetto: { base: '#ece6df', cloud: ['#f6f2ee', '#d9cfd2', '#c9b4bf', '#efe9e4', '#b89aab'], vein: '#6e4a66', vein2: '#a17c95' }
};
// Draw a list of shapes 9 times (offset by ±w,±h) so the result tiles seamlessly.
function wrapDraw(g, w, h, fn) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } }
// mode 'mask' replays the same random sequence and draws the veins white on black (R: sharp vein, G: its soft halo,
// B: pits), from which the companion roughness and normal maps are made: veins are softer minerals (slightly duller
// and a hair recessed after centuries of polishing), pits catch dirt.
function marbleCanvas(name, size, seed = 1, mode = 'color') {
  const P = MARBLES[name] || MARBLES.rose, c = document.createElement('canvas'), mask = mode === 'mask'; c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: mask }), r = mulberry(seed * 31 + name.length * 7), s = size / 512;
  g.fillStyle = mask ? '#000' : P.base; g.fillRect(0, 0, size, size);
  const blobs = []; for (let i = 0; i < 90; i++) blobs.push([r() * size, r() * size, (30 + r() * 150) * s, P.cloud[i % P.cloud.length], .12 + r() * .3]);
  if (!mask) blobs.forEach(([x, y, rad, col, a]) => wrapDraw(g, size, size, () => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, col + '00'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }));
  g.globalAlpha = 1;
  // Veins as in real marble: a few main veins that swell and pinch along their run (width from a smooth random profile),
  // fork into tapering branches, sit in a wide soft halo, over a cloudy secondary veining; each vein's colour drifts
  // between the vein tones and the ground along its length. All geometry is drawn from r() first, so the 'mask' pass
  // replays exactly the same shapes (R: vein core, G: halo and cloudy veining).
  const hx = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }, B0 = hx(P.base);
  const mixc = (A, Bc, t) => `rgb(${Math.round(A[0] + (Bc[0] - A[0]) * t)},${Math.round(A[1] + (Bc[1] - A[1]) * t)},${Math.round(A[2] + (Bc[2] - A[2]) * t)})`;
  const walk = (x, y, a, steps, step, turn) => { const pts = [[x, y]], f = [.03 + r() * .04, .1 + r() * .07, .3 + r() * .25], ph = [r() * 6.3, r() * 6.3, r() * 6.3]; let d = 0; for (let k = 0; k < steps; k++) { d = d * .6 + (r() - .5) * turn * .5; const h = a + turn * (1.4 * Math.sin(k * f[0] + ph[0]) + .8 * Math.sin(k * f[1] + ph[1]) + .35 * Math.sin(k * f[2] + ph[2])) + d; x += Math.cos(h) * step; y += Math.sin(h) * step; pts.push([x, y]); } return pts; };   // the heading meanders about its main direction (smooth, bounded): long flowing runs, no loops or hair
  const profile = (n, w0, taper) => { const f1 = r() * 6, f2 = r() * 6, p1 = 2 + r() * 3, p2 = 5 + r() * 7; return Array.from({ length: n }, (_, k) => { const t = k / Math.max(1, n - 1), sw = .6 + .4 * Math.sin(t * p1 + f1) + .3 * Math.sin(t * p2 + f2); return Math.max(.15, w0 * sw * (taper ? 1 - t * .85 : Math.min(1, t * 6, (1 - t) * 6 + .25))); }); };
  const veins = [], nV = P.faint ? 4 : 6;
  for (let i = 0; i < nV; i++) {
    const a0 = -.6 + r() * .5 + (i % 3 === 0 ? 1.4 : 0), pts = walk(r() * size, r() * size, a0, Math.round(90 + r() * 80), 6.5 * s, .32);
    const w0 = (i < 3 ? 3.5 + r() * 4 : 1.6 + r() * 2) * s, col = hx(i % 4 === 3 ? P.vein2 : P.vein), str = (P.faint ? .45 : .7) + r() * .3, drift = r();
    const V = { pts, w: profile(pts.length, w0, false), col, str, drift, kids: [] }; veins.push(V);
    if (i < 3) for (let q = 0; q < 1 + Math.floor(r() * 2); q++) {   // frayed: a thin sister strand wandering beside the main vein
      const side = (r() < .5 ? -1 : 1) * (1.5 + r() * 2.5) * w0, ph = r() * 6, k0 = Math.floor(r() * pts.length * .4), k1 = Math.min(pts.length - 1, k0 + Math.floor(pts.length * (.3 + r() * .4)));
      const sp = []; for (let k = k0 + 1; k <= k1; k++) { const [ax, ay] = pts[k - 1], [bx2, by2] = pts[k], dx = bx2 - ax, dy = by2 - ay, L = Math.hypot(dx, dy) || 1, o = side * (.6 + .4 * Math.sin(k * .07 + ph)); sp.push([bx2 - dy / L * o, by2 + dx / L * o]); }
      if (sp.length > 4) V.kids.push({ pts: sp, w: profile(sp.length, w0 * (.25 + r() * .2), false), col, str: str * .8, drift: r() });
    }
    const nb = 1 + Math.floor(r() * (i < 3 ? 4 : 2.5));   // forks: leave at an angle, thinner, tapering to nothing
    for (let b = 0; b < nb; b++) {
      const k0 = 5 + Math.floor(r() * (pts.length - 10)), [bx, by] = pts[k0], dir = Math.atan2(pts[k0 + 1][1] - by, pts[k0 + 1][0] - bx) + (r() < .5 ? -1 : 1) * (.35 + r() * .7);
      const bp = walk(bx, by, dir, Math.round(16 + r() * 44), 5 * s, .45); V.kids.push({ pts: bp, w: profile(bp.length, V.w[k0] * (.45 + r() * .3), true), col, str: str * (.7 + r() * .3), drift: r() });
    }
  }
  const cloudy = []; for (let i = 0; i < (P.faint ? 10 : 16); i++) { const pts = walk(r() * size, r() * size, r() * 6.3, Math.round(25 + r() * 40), 11 * s, .4); cloudy.push({ pts, lw: (14 + r() * 30) * s, col: hx(P.cloud[i % P.cloud.length]), t: .35 + r() * .5 }); }
  const layer = () => { const L = document.createElement('canvas'); L.width = L.height = size; const x = L.getContext('2d'); x.lineJoin = x.lineCap = 'round'; return x; };
  // a vein drawn segment by segment (its width changes along the run); opaque on its layer, so joints never darken
  const segs = (x, v, wk, colAt) => { for (let k = 1; k < v.pts.length; k++) { x.lineWidth = Math.max(.3, v.w[k] * wk); x.strokeStyle = colAt(k / v.pts.length); x.beginPath(); x.moveTo(v.pts[k - 1][0], v.pts[k - 1][1]); x.lineTo(v.pts[k][0], v.pts[k][1]); x.stroke(); } };
  const all = []; veins.forEach(v => { all.push(v); v.kids.forEach(k => all.push(k)); });
  // seamless tiling without drawing every shape 9 times: only the copies whose box (padded by the stroke) meets the tile
  const wrapBox = (x, pts, pad, fn) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(([px, py]) => { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); });
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { if (x1 + dx + pad < 0 || x0 + dx - pad > size || y1 + dy + pad < 0 || y0 + dy - pad > size) continue; x.save(); x.translate(dx, dy); fn(); x.restore(); } };
  const veinCol = v => t => mask ? '#fff' : mixc(B0, v.col, v.str * (.55 + .45 * Math.sin((t + v.drift) * 5.2) ** 2));   // colour drift along the vein
  const put = (x, blur, alpha, tint) => { if (mask) { x.globalCompositeOperation = 'source-in'; x.fillStyle = tint; x.fillRect(0, 0, size, size); } g.save(); g.filter = blur > 0 ? `blur(${blur}px)` : 'none'; g.globalAlpha = alpha; if (mask) g.globalCompositeOperation = 'lighter'; for (const dx of blur > 0 ? [-size, 0, size] : [0]) for (const dy of blur > 0 ? [-size, 0, size] : [0]) g.drawImage(x.canvas, dx, dy); g.restore(); };   // blurred: the neighbours' copies bleed across the seams so the tile stays seamless
  // 1 cloudy secondary veining: wide, very soft drifts of the cloud tones
  { const x = layer(); cloudy.forEach(c => wrapBox(x, c.pts, c.lw, () => { x.globalAlpha = mask ? .35 : c.t; x.strokeStyle = mask ? '#fff' : mixc(c.col, hx(P.vein), .45); x.lineWidth = c.lw; x.beginPath(); c.pts.forEach(([px, py], k) => k ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); })); put(x, 10 * s, mask ? .5 : .4, '#0f0'); }
  // 2 halos: each vein in a wide soft band of its own colour
  { const x = layer(); all.forEach(v => wrapBox(x, v.pts, 20 * s, () => segs(x, v, 4.5, veinCol(v)))); put(x, 5 * s, mask ? .8 : .38, '#0f0'); }
  // 3 cores: the veins themselves, softened (never a hairline scratch)
  { const x = layer(); all.forEach(v => wrapBox(x, v.pts, 8 * s, () => segs(x, v, 1, veinCol(v)))); put(x, 1.3 * s, mask ? 1 : .8, '#f00'); }
  g.filter = 'none'; g.globalCompositeOperation = mask ? 'lighter' : 'source-over';
  g.globalAlpha = 1; for (let i = 0; i < 2600 * s * s; i++) { const lt = r() < .5, x = r() * size, y = r() * size; if (!mask) { g.fillStyle = lt ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; g.fillRect(x, y, 1.5, 1.5); } }
  if (mask) { const r2 = mulberry(seed * 7 + 3); g.fillStyle = '#00f'; for (let i = 0; i < 260 * s * s; i++) { const x = r2() * size, y = r2() * size, d = (.6 + r2() * 1.6) * s; g.beginPath(); g.arc(x, y, d, 0, 7); g.fill(); } }
  g.globalCompositeOperation = 'source-over';
  return c;
}
export function marbleTex(name = 'rose', { size = 512, seed = 1, repeat } = {}) {
  const key = 'marble-' + name + size + '-' + seed;
  return withComp(canvasTex(key, size, size, (g) => g.drawImage(marbleCanvas(name, size, seed), 0, 0), { repeat }), () => marbleComp(name, Math.max(128, size * compRes()), seed, key + '-' + size * compRes()), { name: 'marble-' + name, size: k => [Math.max(128, size * k), Math.max(128, size * k)], normalScale: .35, roughness: 1, r: .08 });
}
// polished stone: roughness 0.05–0.09 on the field, veins 0.12–0.2, pits 0.35; heights: veins etched ~0.3, pits 1, a
// faint wavy lap from the polishing stones (honing marks) so the reflection breaks up like real polished marble
function marbleComp(name, size, seed, key) {
  const c = marbleCanvas(name, size, seed, 'mask'), V = readCh(c, 0), Hl = readCh(c, 1), Pt = readCh(c, 2), n = size * size;
  const lap = fieldF(size, size, (u, v) => pfbm(u, v, 3, 3, 3, seed * 13 + 5)), R = new Float32Array(n), H = new Float32Array(n);
  for (let i = 0; i < n; i++) { const vein = Math.max(V[i], Hl[i] * .5); R[i] = .055 + .03 * lap[i] + .1 * vein + .3 * Pt[i]; H[i] = -.35 * V[i] - .12 * Hl[i] - 1.2 * Pt[i] + .5 * lap[i]; }
  return { normalMap: nrmTex(key + '-n', blurF(H, size, size, 1), size, size, 1.6 * size / 512), roughnessMap: greyTex(key + '-r', R, size, size) };
}
export function marbleSet(name = 'rose', o = {}) { const map = marbleTex(name, o); return Object.assign({ map }, companions(map)); }
// Gold leaf: squares of leaf with slightly different tone, seams and burnish. Returns { map, rough }.
export function gildTex() {
  const draw = (mask) => (g, w, h) => {
    const r = mulberry(17), n = 8, q = w / n;
    g.fillStyle = mask ? '#555' : '#f3dc9c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = r(); g.fillStyle = mask ? `rgb(${70 + v * 40 | 0},${70 + v * 40 | 0},${70 + v * 40 | 0})` : `hsl(${42 + v * 3},${66 + v * 8}%,${73 + v * 5}%)`; g.fillRect(i * q + (r() - .5) * 6, j * q + (r() - .5) * 6, q + 4, q + 4); }
    g.strokeStyle = mask ? 'rgba(160,160,160,.4)' : 'rgba(120,80,20,.16)'; g.lineWidth = 1; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q + (r() - .5) * 4, 0); g.lineTo(i * q + (r() - .5) * 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(w, i * q + (r() - .5) * 4); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = mask ? `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},.12)` : `rgba(${r() < .5 ? '90,60,20' : '255,250,220'},${r() * .12})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  };
  const map = canvasTex('gild', 256, 256, draw(false)), rough = canvasTex('gild-r', 256, 256, draw(true), { srgb: false });
  // relief: each leaf is laid over its neighbours, so the seams are ~5 px bands of double leaf (a raised ridge that
  // catches a reflected window as a fine line), plus the leaf's own crumple and the burnisher's long strokes
  withComp(map, () => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true }), r = mulberry(17), n = 8, q = S / n;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { r(); const x = i * q + (r() - .5) * 6, y = j * q + (r() - .5) * 6; g.fillStyle = 'rgb(60,60,60)'; [-S, 0, S].forEach(dx => [-S, 0, S].forEach(dy => g.fillRect(x + dx, y + dy, q + 4, q + 4))); }
    const L = readCh(c, 0), cr = fieldF(S, S, (u, v) => pfbm(u, v, 24, 24, 3, 171)), br = fieldF(S, S, (u, v) => pn(u * 3, v * 64, 3, 64, 172)), H = new Float32Array(S * S);
    for (let k = 0; k < S * S; k++) H[k] = (L[k] > .3 ? .5 : 0) + .18 * cr[k] + .08 * br[k];
    return { normalMap: nrmTex('gild-n', blurF(H, S, S, 1), S, S, 2.2) };
  }, { name: 'gild', size: () => [256, 256], normalScale: .5, rgh: false });
  return { map, rough };
}
// Fluting normal map: one concave flute across u (repeat.x = number of flutes).
export function fluteNormal() {
  return canvasTex('flute-n', 64, 8, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let x = 0; x < w; x++) { const u = x / (w - 1), t = (u - .12) / .76; let nx = 0; if (t > 0 && t < 1) { const z = 2 * t - 1; nx = z / Math.sqrt(Math.max(.02, 1 - z * z)) * .55; nx = Math.max(-.92, Math.min(.92, nx)); } const nz = Math.sqrt(1 - nx * nx); for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; img.data[o] = (nx * .5 + .5) * 255; img.data[o + 1] = 128; img.data[o + 2] = nz * 255; img.data[o + 3] = 255; } }
    g.putImageData(img, 0, 0);
  }, { srgb: false, aniso: 4 });
}
// Checkered marble floor. pattern: 'checker' | 'diagonal' | 'cubes' (Admont-like tumbling blocks).
// Returns { map, rough, span:[sx, sy] } where span is the world size (m) one texture repeat covers for tile size `tile`.
export function marbleFloor(pattern = 'diagonal', tile = .62, tones = ['cream', 'grey', 'red']) {
  const W = 1024, H = pattern === 'cubes' ? 887 : 1024, key = 'floor-' + pattern + tones.join();
  let mk0; const mkc = () => (mk0 = mk0 || tones.map((t, i) => marbleCanvas(t, 256, 5 + i)));
  const polys = [];
  if (pattern === 'checker') { const n = 4, q = W / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) polys.push({ t: (i + j) % 2, p: [[i * q, j * q], [(i + 1) * q, j * q], [(i + 1) * q, (j + 1) * q], [i * q, (j + 1) * q]] }); }
  else if (pattern === 'diagonal') { const n = 4, q = W / n, hd = q / 2; for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) [[i * q, j * q, 0], [(i + .5) * q, (j + .5) * q, 1]].forEach(([cx, cy, t]) => polys.push({ t, p: [[cx, cy - hd], [cx + hd, cy], [cx, cy + hd], [cx - hd, cy]] })); }
  else { const s = W / (4 * Math.sqrt(3)), sy = H / 6, hw = Math.sqrt(3) / 2 * s; for (let row = -1; row <= 4; row++) for (let col = -1; col <= 4; col++) { const cx = col * 2 * hw + (row % 2 ? hw : 0), cy = row * 1.5 * sy + sy / 2; const T = [cx, cy - sy], UR = [cx + hw, cy - sy / 2], LR = [cx + hw, cy + sy / 2], B = [cx, cy + sy], LL = [cx - hw, cy + sy / 2], UL = [cx - hw, cy - sy / 2], C = [cx, cy]; polys.push({ t: 0, p: [T, UR, C, UL] }, { t: 1, p: [UR, LR, B, C] }, { t: 2, p: [UL, C, B, LL] }); } }
  // mode 'color' | 'mask' (roughness: G; polished tiles 0.05–0.1 with a per-tile jitter, the joints 0.9, faint scuffs) |
  // 'nrm' (each tile slightly tilted: lippage of up to ~2° in the map, scaled by the material's normalScale, so a
  // mirrored window kinks from tile to tile; a 3 px arris bevel falling into every joint)
  const draw = (mode) => (g) => {
    const mask = mode === 'mask', nrm = mode === 'nrm', r = mulberry(23), r2 = mulberry(29);
    g.fillStyle = nrm ? 'rgb(128,128,255)' : mask ? '#e6e6e6' : '#5d5650'; g.fillRect(0, 0, W, H);
    const enc = (nx, ny) => { const l = Math.hypot(nx, ny, 1); return `rgb(${(nx / l * .5 + .5) * 255 | 0},${(ny / l * .5 + .5) * 255 | 0},${(1 / l * .5 + .5) * 255 | 0})`; };
    polys.forEach(({ t, p }) => {
      const path = () => { g.beginPath(); p.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
      const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length, inset = (k) => p.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
      const a0 = r(), a1 = r(), a2 = r(), a3 = r(), tx = (r2() - .5) * .07, ty = (r2() - .5) * .07;
      g.save(); path(); g.clip();
      if (nrm) { g.fillStyle = enc(tx, ty); g.fill(); }
      else if (mask) { const v = (.055 + a0 * .045) * 255; g.fillStyle = `rgb(${v},${v},${v})`; g.fill(); }
      else { const mk = mkc(), pat = g.createPattern(mk[t % mk.length], 'repeat'); pat.setTransform(new DOMMatrix().translate(a1 * 256, a2 * 256).rotate(a3 * 360)); g.fillStyle = pat; g.fill(); }
      if (nrm) p.forEach((A, k) => { // bevel strip along each edge, sloping down toward the joint (outward = away from the centre)
        const Bp = p[(k + 1) % p.length], ex = Bp[0] - A[0], ey = Bp[1] - A[1], el = Math.hypot(ex, ey) || 1; let ox = ey / el, oy = -ex / el; const mx = (A[0] + Bp[0]) / 2 - cx, my = (A[1] + Bp[1]) / 2 - cy; if (ox * mx + oy * my < 0) { ox = -ox; oy = -oy; }
        const bw = 3.2; g.fillStyle = enc(ox * .55 + tx, -oy * .55 + ty); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(Bp[0], Bp[1]); g.lineTo(Bp[0] - ox * bw, Bp[1] - oy * bw); g.lineTo(A[0] - ox * bw, A[1] - oy * bw); g.closePath(); g.fill(); });
      g.restore();
      // grout + a faint bevel
      const pi = inset(.985); g.lineWidth = 2.2; g.strokeStyle = nrm ? 'rgb(128,128,255)' : mask ? 'rgb(230,230,230)' : 'rgba(60,52,46,.75)'; path(); g.stroke();
      if (!mask && !nrm) { g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,250,240,.25)'; g.beginPath(); pi.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); }
    });
    if (mask) for (let i = 0; i < 160; i++) { const x = r2() * W, y = r2() * H, rad = 20 + r2() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(90,90,90,.16)'); gr.addColorStop(1, 'rgba(90,90,90,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    if (mask) { g.strokeStyle = 'rgba(120,120,120,.22)'; for (let i = 0; i < 400; i++) { const x = r2() * W, y = r2() * H, a = r2() * 6.28, l = 4 + r2() * 30; g.lineWidth = .6 + r2(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } } // fine scratches
  };
  const tilesX = pattern === 'cubes' ? 4 : 4; const sx = tilesX * tile, sy = sx * H / W;
  return { map: canvasTex(key, W, H, draw('color')), rough: canvasTex(key + '-r', W, H, draw('mask'), { srgb: false }), nrm: canvasTex(key + '-n', W, H, draw('nrm'), { srgb: false }), span: [sx, sy] };
}
// A painted "fresco" sky for a ceiling dome: luminous centre, cloud banks, soft robed figures-as-shapes (no copied art),
// and a painted balustrade at the rim. Round composition inside a square texture.
export function frescoTex(seed = 1) {
  return canvasTex('fresco' + seed, 1024, 1024, (g, W) => {
    const r = mulberry(100 + seed * 13), C = W / 2, R = W / 2;
    g.fillStyle = '#efe4cf'; g.fillRect(0, 0, W, W);
    const sky = g.createRadialGradient(C, C, 0, C, C, R * .98);
    sky.addColorStop(0, '#fff6dc'); sky.addColorStop(.18, '#fbe6b4'); sky.addColorStop(.45, '#d9d6c6'); sky.addColorStop(.7, '#a9c0d6'); sky.addColorStop(1, '#7f9cc0');
    g.save(); g.beginPath(); g.arc(C, C, R * .97, 0, 7); g.clip(); g.fillStyle = sky; g.fillRect(0, 0, W, W);
    // soft rays of the glory
    g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + r() * .1, w2 = .025 + r() * .03; g.fillStyle = `rgba(255,236,190,${.035 + r() * .04})`; g.beginPath(); g.moveTo(C, C); g.arc(C, C, R * (.5 + r() * .4), a - w2, a + w2); g.closePath(); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const cloud = (cx, cy, size, n, tone = 1) => { // cluster of shaded puffs, lit from the centre
      const dx = C - cx, dy = C - cy, dl = Math.hypot(dx, dy) || 1, lx = dx / dl, ly = dy / dl;
      for (let k = 0; k < n; k++) { const a = r() * 7, d = r() * size * .9, x = cx + Math.cos(a) * d * 1.5, y = cy + Math.sin(a) * d * .7, rad = size * (.35 + r() * .45);
        const gr = g.createRadialGradient(x + lx * rad * .35, y + ly * rad * .35, rad * .05, x, y, rad);
        gr.addColorStop(0, `rgba(255,252,244,${.95 * tone})`); gr.addColorStop(.55, `rgba(238,228,214,${.8 * tone})`); gr.addColorStop(.85, `rgba(176,160,170,${.45 * tone})`); gr.addColorStop(1, 'rgba(150,140,160,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); } };
    // outer ring of cloud banks
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + r() * .3, rr = R * (.66 + r() * .16); cloud(C + Math.cos(a) * rr, C + Math.sin(a) * rr, R * (.1 + r() * .07), 14); }
    // figures-as-shapes resting on the banks, heads toward the light: robe sweep, mantle, head, a reaching arm, some wings
    const robes = ['#b26a55', '#5d76a6', '#c9a15e', '#8a9a70', '#a8667e', '#ead9bd', '#7a6c9a', '#c48a66'];
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; };
    const nf = 8 + (seed % 3);
    const fc = document.createElement('canvas'), fk = .4; fc.width = fc.height = W * fk; const f = fc.getContext('2d'), puffs = []; // soft layer: painted at 1/4 size, upscaled
    for (let i = 0; i < nf; i++) {
      const a = (i + r() * .45) / nf * Math.PI * 2, rr = R * (.6 + r() * .09), x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr, s = R * (.12 + r() * .04), col = robes[(i * 3 + seed) % robes.length], col2 = robes[(i * 5 + seed + 3) % robes.length], fl = r() < .5 ? 1 : -1;
      f.save(); f.scale(fk, fk); f.translate(x, y); f.rotate(a - Math.PI / 2 + (r() - .5) * .7); f.scale(fl, 1); // local −y points to the centre (head toward the light)
      f.globalAlpha = .9; f.lineCap = 'round'; f.lineJoin = 'round';
      const ell = (cx, cy, rx, ry, rot, fill) => { f.fillStyle = fill; f.beginPath(); f.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); f.fill(); };
      if (r() < .5) [-1, 1].forEach(sd => { ell(sd * .42 * s, -.55 * s, .42 * s, .16 * s, sd * -.7, 'rgba(250,244,230,.9)'); ell(sd * .5 * s, -.5 * s, .3 * s, .09 * s, sd * -.55, 'rgba(225,212,190,.8)'); });
      ell(0, .25 * s, .34 * s, .62 * s, .25, shade(col, -.15));          // robe body
      ell(.06 * s, .1 * s, .26 * s, .5 * s, .25, col);                   // lit side of the robe
      ell(.16 * s, .0, .1 * s, .42 * s, .3, shade(col, .35));            // highlight fold
      f.strokeStyle = shade(col2, .1); f.lineWidth = .22 * s; f.beginPath(); f.moveTo(-.3 * s, -.42 * s); f.quadraticCurveTo(.25 * s, .05 * s, .05 * s, .75 * s); f.stroke(); // mantle sweep
      f.strokeStyle = shade(col2, .4); f.lineWidth = .07 * s; f.beginPath(); f.moveTo(-.26 * s, -.4 * s); f.quadraticCurveTo(.27 * s, .02 * s, .1 * s, .7 * s); f.stroke();
      ell(0, -.5 * s, .26 * s, .13 * s, 0, shade(col, -.05));            // shoulders
      f.strokeStyle = '#e2b898'; f.lineWidth = .11 * s; f.beginPath(); f.moveTo(.18 * s, -.52 * s); f.quadraticCurveTo(.42 * s, -.75 * s, .5 * s, -1.08 * s); f.stroke(); // raised arm
      ell(0, -.8 * s, .17 * s, .19 * s, 0, '#e8c4a4'); ell(-.03 * s, -.86 * s, .16 * s, .12 * s, 0, r() < .5 ? 'rgba(122,82,48,.95)' : 'rgba(205,165,98,.95)');
      f.globalAlpha = 1; f.restore();
      puffs.push([x + Math.cos(a) * s * 1.25, y + Math.sin(a) * s * 1.25, s * .75]);
    }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(fc, 0, 0, W, W); puffs.forEach(([px, py, ps]) => cloud(px, py, ps, 7, .92));
    // central glory: a pale radiant figure-shape in a halo
    const halo = g.createRadialGradient(C, C, 0, C, C, R * .22); halo.addColorStop(0, 'rgba(255,255,240,.95)'); halo.addColorStop(.5, 'rgba(255,240,200,.45)'); halo.addColorStop(1, 'rgba(255,230,180,0)'); g.fillStyle = halo; g.beginPath(); g.arc(C, C, R * .22, 0, 7); g.fill();
    g.filter = 'blur(2px)'; g.fillStyle = 'rgba(250,240,215,.7)'; g.beginPath(); g.ellipse(C, C + R * .02, R * .035, R * .085, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(240,210,150,.55)'; g.beginPath(); g.ellipse(C, C - R * .1, R * .028, R * .028, 0, 0, 7); g.fill(); g.filter = 'none';
    for (let i = 0; i < 5; i++) { const a = r() * 7, rr = R * (.25 + r() * .2); cloud(C + Math.cos(a) * rr, C + Math.sin(a) * rr, R * .05, 7, .75); }
    g.restore();
    // painted balustrade (quadratura) round the rim, seen from below
    g.save(); g.translate(C, C);
    const ring = (r0, r1, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r1, 0, Math.PI * 2); g.moveTo(r0, 0); g.arc(0, 0, r0, Math.PI * 2, 0, true); g.fill(); };
    const stoneG = g.createRadialGradient(0, 0, R * .89, 0, 0, R * .97); stoneG.addColorStop(0, '#d9c6a2'); stoneG.addColorStop(1, '#b59a6c'); ring(R * .89, R * .97, stoneG);
    const nb = 110; for (let i = 0; i < nb; i++) { const a = i / nb * Math.PI * 2; g.save(); g.rotate(a); g.fillStyle = 'rgba(120,92,58,.28)'; g.beginPath(); g.ellipse(R * .935, R * .004, R * .026, R * .0085, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(246,234,208,.75)'; g.beginPath(); g.ellipse(R * .933, -R * .002, R * .022, R * .006, 0, 0, 7); g.fill(); g.restore(); }
    ring(R * .953, R * .968, '#e8d9b8'); ring(R * .89, R * .9, '#eadbb9');
    ring(R * .97, R * .995, '#b39252'); ring(R * .978, R * .986, '#f0d890');
    g.restore();
    // a breath of age
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < .5 ? '80,60,40' : '255,250,235'},${r() * .05})`; g.fillRect(r() * W, r() * W, 2, 2); }
  });
}
// Gilt rocaille on cream stucco: shared drawer used by the cove (one bay per repeat) and the frieze.
// mode 'color' draws the image; mode 'mr' draws a metal/rough map (G = roughness, B = metalness).
function rocaille(g, w, h, mode, seed = 3) {
  const r = mulberry(seed), mr = mode === 'mr';
  const GOLD = mr ? 'rgb(0,80,255)' : '#c9a24e', HI = mr ? 'rgb(0,60,255)' : '#f6dd96', LO = mr ? 'rgb(0,110,255)' : '#7d5a22';
  if (mr) { g.fillStyle = 'rgb(0,215,0)'; g.fillRect(0, 0, w, h); }
  else { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f3ece0'); gr.addColorStop(1, '#e6dccb'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < .5 ? '120,100,70' : '255,255,250'},${r() * .06})`; g.fillRect(r() * w, r() * h, 2, 2); } }
  const gstroke = (fn, lw) => { g.lineCap = g.lineJoin = 'round'; [[LO, lw * 1.6, 1.5], [GOLD, lw, 0], [HI, lw * .35, -lw * .25]].forEach(([c, l, o]) => { g.save(); g.translate(o, o); g.strokeStyle = c; g.lineWidth = l; g.beginPath(); fn(); g.stroke(); g.restore(); }); };
  // border fillets
  [h * .04, h * .96].forEach(y => gstroke(() => { g.moveTo(0, y); g.lineTo(w, y); }, h * .012));
  const cx = w / 2, cy = h * .5, cw = w * .2, ch = h * .34;
  // painted sky oval inside the cartouche
  if (!mr) { const sk = g.createRadialGradient(cx, cy - ch * .2, 0, cx, cy, ch); sk.addColorStop(0, '#fbf0d4'); sk.addColorStop(.6, '#c4d2df'); sk.addColorStop(1, '#93acc8'); g.fillStyle = sk; g.beginPath(); g.ellipse(cx, cy, cw * .78, ch * .78, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,250,240,.7)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + (r() - .5) * cw, cy + ch * .3 + (r() - .5) * ch * .3, ch * (.12 + r() * .12), 0, 7); g.fill(); } }
  // cartouche frame: C-scrolls, shell on top, leaf at the foot
  gstroke(() => { g.ellipse(cx, cy, cw * .8, ch * .8, 0, 0, 7); }, h * .02);
  [-1, 1].forEach(s => {
    gstroke(() => { g.moveTo(cx + s * cw * .8, cy - ch * .6); g.bezierCurveTo(cx + s * cw * 1.25, cy - ch * .9, cx + s * cw * 1.35, cy + ch * .2, cx + s * cw * 1.0, cy + ch * .45); g.arc(cx + s * cw * 1.06, cy + ch * .32, ch * .14, Math.PI * .7, Math.PI * 2.6, s < 0); }, h * .022);
    gstroke(() => { g.moveTo(cx + s * cw * .5, cy + ch * .75); g.bezierCurveTo(cx + s * cw * .9, cy + ch * 1.1, cx + s * cw * 1.6, cy + ch * .9, cx + s * cw * 1.9, cy + ch * .6); }, h * .014);
    // garland swags to the bay edges
    gstroke(() => { g.moveTo(cx + s * cw * 1.3, cy - ch * .2); g.quadraticCurveTo(cx + s * w * .33, cy + ch * .9, cx + s * w * .49, cy - ch * .3); }, h * .016);
    for (let k = 0; k < 7; k++) { const t = k / 6, x = cx + s * (cw * 1.3 + (w * .49 - cw * 1.3) * t), y = cy - ch * .2 + (ch * 1.1) * 4 * t * (1 - t) - ch * .1 * t; if (mr) { g.fillStyle = GOLD; } else { g.fillStyle = k % 2 ? '#d9b465' : '#b98f3e'; } g.beginPath(); g.ellipse(x, y, h * .02, h * .012, s * t * 2, 0, 7); g.fill(); }
  });
  // the shell (coquille) crowning the cartouche
  for (let k = -4; k <= 4; k++) gstroke(() => { g.moveTo(cx, cy - ch * .78); g.lineTo(cx + k * cw * .1, cy - ch * 1.25 + Math.abs(k) * ch * .05); }, h * .01);
  gstroke(() => { g.arc(cx, cy - ch * .78, cw * .45, Math.PI * 1.1, Math.PI * 1.9); }, h * .014);
  // corner rosettes at the bay edges (where the gilt ribs land)
  [0, w].forEach(x => { for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.fillStyle = mr ? GOLD : (k % 2 ? '#e2c27a' : '#a8812f'); g.beginPath(); g.ellipse(x + Math.cos(a) * h * .035, cy + Math.sin(a) * h * .035, h * .03, h * .012, a, 0, 7); g.fill(); } });
}
export function rocailleTex(seed = 3) {
  return { map: canvasTex('roc' + seed, 1024, 512, (g, w, h) => rocaille(g, w, h, 'color', seed)), mr: canvasTex('roc-mr' + seed, 512, 256, (g, w, h) => rocaille(g, w, h, 'mr', seed), { srgb: false }) };
}
// Egg-and-dart / bead band for cornices (tiles along u; one motif per 1/8 of the texture).
export function eggDartTex() {
  return canvasTex('eggdart', 256, 32, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h); const n = 8, q = w / n;
    for (let i = 0; i < n; i++) { const x = i * q + q / 2; const gr = g.createRadialGradient(x - 3, h * .4, 1, x, h * .5, q * .45); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(.6, '#d8b46a'); gr.addColorStop(1, '#7e5b22'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, h * .52, q * .32, h * .36, 0, 0, 7); g.fill(); g.fillStyle = '#6e4e1c'; g.beginPath(); g.moveTo(i * q, h * .1); g.lineTo(i * q + 3, h * .85); g.lineTo(i * q - 3, h * .85); g.fill(); }
  }, { aniso: 4 });
}
// Rows of leather book spines (tiles along u), for built-in upper shelves.
export function bookSpinesTex() {
  return canvasTex('spines', 1024, 256, (g, w, h) => {
    const r = mulberry(41), cols = ['#6b2a1e', '#4a2c1a', '#7a4a24', '#2f3b2a', '#5a1f22', '#8a6a40', '#d9cba6', '#3a2a40', '#7b5a32', '#e2d6b6'];
    g.fillStyle = '#1a120c'; g.fillRect(0, 0, w, h);
    let x = 0; while (x < w) { const bw = 14 + r() * 26, bh = h * (.72 + r() * .26), c = cols[(r() * cols.length) | 0], xe = Math.min(w, x + bw);
      const gr = g.createLinearGradient(x, 0, xe, 0); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(.3, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.5)');
      g.fillStyle = c; g.fillRect(x + 1, h - bh, xe - x - 2, bh); g.fillStyle = gr; g.fillRect(x + 1, h - bh, xe - x - 2, bh);
      g.fillStyle = 'rgba(214,176,96,.85)'; [.12, .2, .78, .86].forEach(t => g.fillRect(x + 2, h - bh + bh * t, xe - x - 4, 2));
      if (r() < .6) { g.fillStyle = 'rgba(30,20,10,.6)'; g.fillRect(x + 3, h - bh + bh * .28, xe - x - 6, bh * .1); }
      x = xe; }
  }, { aniso: 8 });
}
// Rose/teal damask for upholstery.
// Silk damask: one cloth, two weaves. The motif is woven in satin (long floats along the warp: smooth, sheeny,
// roughness ~0.45) and the ground in a twill along the weft (matte, ~0.8), so the pattern shows by the way each part
// catches the light. The companion normal map carries the threads in their two directions.
function damaskMotifs(g, fill) {
  g.fillStyle = fill; const motif = (cx, cy) => { g.beginPath(); g.moveTo(cx, cy - 50); g.bezierCurveTo(cx + 40, cy - 30, cx + 30, cy + 20, cx, cy + 50); g.bezierCurveTo(cx - 30, cy + 20, cx - 40, cy - 30, cx, cy - 50); g.fill(); g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); };
  [[64, 64], [192, 192], [192, -64], [-64, 192], [192, 64 + 256], [64 + 256, 192]].forEach(([x, y]) => { motif(x, y); }); motif(192, 192 - 256); motif(64 - 256, 64); motif(64, 64 + 256); motif(64 + 256, 64);
}
export function damaskTex(base = '#7a2e3a', key = 'damask') {
  return withComp(canvasTex(key + base, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); damaskMotifs(g, 'rgba(255,225,190,.14)');
    const r = mulberry(8); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .08})`; g.fillRect(r() * w, r() * h, 1, 2); }
  }), () => {
    if (!DAM.n) { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, S, S); damaskMotifs(g, '#fff'); const M = blurF(readCh(c, 0), S, S, 1), H = new Float32Array(S * S), R = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, m = M[i], sat = Math.pow(Math.sin(Math.PI * (y * 32 / S + (x % 8) * .125)), 2), twl = Math.pow(Math.sin(Math.PI * ((x + y) * 48 / S)), 2); H[i] = m * (.55 * sat + .25) + (1 - m) * .6 * twl; R[i] = .78 - .32 * m; }
      DAM.n = nrmTex('damask-n', H, S, S, 2.4); DAM.r = greyTex('damask-r', R, S, S); }
    return { normalMap: DAM.n, roughnessMap: DAM.r };
  }, { name: 'damask', size: () => [256, 256], normalScale: .6, roughness: 1, sheen: true, r: .65 });
}
const DAM = {};
// Bright morning sky seen through the tall windows: a soft photographic landscape, not a cartoon. A graded sky with
// soft cumulus, then three hazy hill bands (aerial perspective: the far band palest and coolest, the near one darker
// and green, with a speckle of woods), each band's ridge an fBm line, its body textured by noise and fading into haze
// at its foot. The colours are pre-divided by the window's HDR boost ([3.4, 4.1, 5.4], bmat 'sky'), which is bluer
// than it is red: hills drawn neutral would come out as flat saturated blue.
export function windowSkyTex() {
  return canvasTex('winsky2', 512, 1024, (g, w, h) => {
    const n = makeNoise(17), r = mulberry(12);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#93b0cc'); gr.addColorStop(.45, '#c9d2d4'); gr.addColorStop(.72, '#e8dfca'); gr.addColorStop(1, '#efe4cc'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // cumulus: clusters of soft puffs, lit tops, slightly greyer bases
    for (let k = 0; k < 9; k++) { const cx = r() * w, cy = h * (.1 + r() * .42), sz = 30 + r() * 60;
      for (let i = 0; i < 9; i++) { const x = cx + (r() - .5) * sz * 2.4, y = cy + (r() - .6) * sz * .7, rad = sz * (.35 + r() * .45), c = g.createRadialGradient(x, y - rad * .2, 0, x, y, rad); c.addColorStop(0, 'rgba(255,253,248,.55)'); c.addColorStop(.6, 'rgba(236,236,236,.28)'); c.addColorStop(1, 'rgba(225,228,232,0)'); g.fillStyle = c; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }
    // hill bands, far to near: [ridge height (fraction of h), amplitude, colour top, colour foot, texture strength]
    const bands = [[.77, .035, [176, 172, 160], [196, 190, 176], .04], [.81, .03, [148, 146, 122], [172, 168, 146], .07], [.86, .022, [116, 118, 88], [132, 130, 100], .12]];
    const img = g.getImageData(0, 0, w, h), D = img.data;
    bands.forEach(([y0, amp, ct, cf, tx], bi) => {
      for (let x = 0; x < w; x++) {
        const ridge = h * (y0 - amp * (n.fbm(x / (120 - bi * 25) + bi * 7, bi * 3.1, 0, 5) * 1.6 + .2 * Math.sin(x / 90 + bi)));
        for (let y = Math.max(0, Math.floor(ridge) - 1); y < h; y++) {
          const o = (y * w + x) * 4, edge = Math.min(1, Math.max(0, y - ridge + .5)), k = Math.min(1, (y - ridge) / (h * .12)), haze = Math.min(1, (y - ridge) / (h * .1)) * .35;
          let v = 1 + tx * (n.fbm(x / 9, y / 6 + bi * 13, bi, 3) * 1.4) + (bi === 2 ? tx * .9 * (n(x / 2.5, y / 2.5) > .55 ? -1 : 0) : 0);   // texture; the near band speckled with woods
          for (let c = 0; c < 3; c++) { const col = (ct[c] + (cf[c] - ct[c]) * k) * v, hz = col + (226 - col) * haze; D[o + c] = D[o + c] * (1 - edge) + hz * edge; }
        }
      }
    });
    g.putImageData(img, 0, 0);
    g.filter = 'blur(1.2px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';   // a lens's softness: no hard cut-out edges
  });
}
// Additive light-shaft texture: bright at the window (v=1), fading to the floor, soft at the edges, faint dust streaks.
// (falls off quickly, so the shafts read as beams near the windows instead of a golden haze over the window wall)
// (v5 interiors: a crisp-edged beam, not a veil: a flat core with a short penumbra at the window's edges, faint dust
// streaks along it, and a few motes catching the light; the beam's own falloff stays short)
export function shaftTex() {
  return canvasTex('shaft3', 128, 256, (g, w, h) => {
    const img = g.createImageData(w, h), r = mulberry(5), streak = Array.from({ length: w }, () => .72 + r() * .28), mote = new Float32Array(w * h);
    for (let k = 0; k < 160; k++) { const x = r() * w | 0, y = r() * h | 0, a = .3 + r() * .7; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((y + dy + h) % h) * w + ((x + dx + w) % w); mote[i] = Math.max(mote[i], a * (dx || dy ? .35 : 1)); } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 1 - y / (h - 1), u = x / (w - 1), e = Math.min(1, Math.min(u, 1 - u) / .09), core = e * e * (3 - 2 * e), i = y * w + x, a = (Math.pow(v, 1.9) * .85 + .15 * v) * core * (streak[x] + mote[i] * .9 * v); const o = i * 4; img.data[o] = 255; img.data[o + 1] = 236; img.data[o + 2] = 200; img.data[o + 3] = Math.min(1, a) * 255; }
    g.putImageData(img, 0, 0);
  }, { aniso: 1 });
}

// ---------- library woodwork & books (wall bookcases, the user's bookcases) ----------
// Figured wood with fine grain, pores and a few flame streaks. `paint` > 0 turns it into painted (lacquered) wood:
// the grain only shows faintly through an ivory coat, as on Admont's white-and-gold cases.
export function figuredWood(tone = [110, 70, 40], key = 'fig', { paint = 0, seed = 7 } = {}) {
  const K = 'figwood' + key + tone.join() + paint;
  return withComp(canvasTex(K, 512, 512, (g, w, h) => figuredWoodDraw(g, w, h, tone, paint, seed)), () => woodComp(K, paint, seed), { name: 'wood-' + key, size: k => [512 * k, 512 * k], normalScale: paint ? .25 : .45, roughness: 1, r: paint ? .4 : .5 });
}
// wood relief: open pores (vessels cut lengthwise: 0.2–0.6 mm dashes along the grain, recessed), the softer earlywood
// a hair lower than the latewood (the varnish shows it as a ripple), roughness 0.42–0.6 in the wood, pores 0.8. Painted
// wood: the paint fills the pores, so only a faint brush texture and the ripple remain.
function woodComp(K, paint, seed) {
  const S = 512 * compRes(), f = 512 / S, n = makeNoise(seed), r = mulberry(seed * 5 + 1), H = new Float32Array(S * S), R = new Float32Array(S * S);
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const x = xx * f, y = yy * f, warp = n.fbm(x / 160, y / 40, 0, 3) * 18, v = Math.sin((y + warp) * .32 + n(x / 30, y / 6) * 2) * .5 + .5, i = yy * S + xx; H[i] = v * .35 + n(x / 3, y / 1.5) * .08; R[i] = .46 + .1 * v; }
  // the 2600 dark pore dashes of the colour map (same random sequence, so relief and colour agree), plus finer ones
  const rc = mulberry(seed); for (let k = 0; k < 220 * 6; k++) rc();
  const pore = (x0, y0, len, d) => { for (let t = 0; t < len; t++) { const i = (y0 % S) * S + ((x0 + t) % S); H[i] -= d; R[i] = Math.min(1, R[i] + .3 * d); } };
  for (let k = 0; k < 2600; k++) { const a = rc(), x0 = rc() * S | 0, y0 = rc() * S | 0, len = Math.max(1, (2 + rc() * 5) / f | 0); pore(x0, y0, len, (.4 + a * 2.5) * (paint ? .2 : 1)); }
  if (!paint) for (let k = 0; k < 3000 / (f * f); k++) pore(r() * S | 0, r() * S | 0, 1 + r() * 4 | 0, .3 + r() * .4);
  if (paint) for (let i = 0; i < S * S; i++) { H[i] *= .35; R[i] = .38 + (R[i] - .46) * .3; }
  return { normalMap: nrmTex(K + '-n' + S, H, S, S, (paint ? 1.2 : 2) / f), roughnessMap: greyTex(K + '-r' + S, blurF(R, S, S, 1), S, S) };
}
function figuredWoodDraw(g, w, h, tone, paint, seed) {
  {
    const r = mulberry(seed), n = makeNoise(seed), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const warp = n.fbm(x / 160, y / 40, 0, 3) * 18, v = Math.sin((y + warp) * .32 + n(x / 30, y / 6) * 2) * .5 + .5, fl = n.fbm(x / 60, y / 220, 3, 3);
      let k = .9 + v * .08 * (1 - paint * .8) + fl * .18 * (1 - paint * .85) + n(x / 3, y / 1.5) * .03;
      const o = (y * w + x) * 4; img.data[o] = tone[0] * k; img.data[o + 1] = tone[1] * k; img.data[o + 2] = tone[2] * k; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 220; i++) { g.strokeStyle = `rgba(${tone[0] * .35 | 0},${tone[1] * .3 | 0},${tone[2] * .25 | 0},${(.05 + r() * .16) * (1 - paint * .85)})`; g.lineWidth = .4 + r() * 1.6; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + r() * 16 - 8, w * .65, y + r() * 16 - 8, w, y + r() * 8 - 4); g.stroke(); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(20,10,4,${r() * .22 * (1 - paint * .9)})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1); }
    if (paint) for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(255,252,240,${r() * .05})`; g.lineWidth = 2 + r() * 6; g.beginPath(); const y = r() * h; g.moveTo(r() * w * .5, y); g.lineTo(w * (.5 + r() * .5), y + r() * 4 - 2); g.stroke(); }
  }
}
// Atlas of book spines for the instanced books: 8 bindings side by side (each cell 128 px wide), the page edges in a
// strip at the top (v > .97). Calf, morocco, cloth and vellum, raised bands with gilt fillets, a lettering piece and
// gilt tools in the panels. Book geometry samples one cell; the shader shifts u by the instance's binding variant.
export const SPINE_VARIANTS = 8;
export function spineAtlas() {
  const t = canvasTex('spine-atlas', 1024, 512, (g, W, H) => spineDraw(g, W, H, false), { aniso: 8 });
  // companion: R = relief (raised bands over the cords, debossed tooling, a rounded back), G = roughness (calf 0.5,
  // vellum 0.65, gilt 0.22, page edges 0.8), B = metalness (gilt tooling 1)
  return withComp(t, () => { const k = compRes(), W = 1024 * k, H = 512 * k, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.scale(k, k); spineDraw(g, 1024, 512, true);
    const Hh = blurF(readCh(c, 0), W, H, 1); return { normalMap: nrmTex('spine-atlas-n' + W, Hh, W, H, 3 * k), roughnessMap: canvasTex('spine-atlas-mr' + W, W, H, (g2) => g2.drawImage(c, 0, 0), { srgb: false, aniso: 8 }) }; },
    { name: 'spines', size: k => [1024 * k, 512 * k], metalness: 1, metalMap: true, normalScale: .7, roughness: 1, r: .55 });
}
function spineDraw(g, W, H, mr) {
  const r = mulberry(23), cw = W / SPINE_VARIANTS, sh = Math.round(H * .965);
  const B = [['#6a3a1e', 1], ['#4a2614', 1], ['#6e1f1a', 1], ['#8b2c1e', 1], ['#2f4a32', 1], ['#25324a', 1], ['#d6c59a', 0], ['#94632f', 1]];
  // mr colours: rgb(height, roughness, metalness)
  const M = { page: 'rgb(110,205,0)', calf: 'rgb(128,128,0)', vellum: 'rgb(128,165,0)', band: 'rgb(235,120,0)', gold: 'rgb(105,56,255)', label: 'rgb(122,110,0)' };
  g.fillStyle = mr ? M.page : '#d6c8a4'; g.fillRect(0, 0, W, H); // page edges
  for (let i = 0; i < 600; i++) { const a = r(), x = r() * W; if (!mr) { g.fillStyle = `rgba(120,96,60,${a * .2})`; g.fillRect(x, 0, 1, H - sh); } else { g.fillStyle = 'rgba(70,220,0,.4)'; g.fillRect(x, 0, 1, H - sh); } }
  B.forEach(([col, gilt], i) => {
    const x0 = i * cw, y0 = H - sh;
    g.fillStyle = mr ? (gilt ? M.calf : M.vellum) : col; g.fillRect(x0, y0, cw, sh);
    for (let k = 0; k < 2200; k++) { const lt = r() < .5, a = r(), x = x0 + r() * cw, y = y0 + r() * sh, s1 = 1 + r() * 3, s2 = 1 + r() * 3; if (!mr) { g.fillStyle = `rgba(${lt ? '0,0,0' : '255,235,200'},${a * .09})`; g.fillRect(x, y, s1, s2); } else if (a > .5) { g.fillStyle = lt ? 'rgba(90,150,0,.5)' : 'rgba(160,110,0,.5)'; g.fillRect(x, y, s1, s2); } }
    if (!mr) { const sg = g.createLinearGradient(x0, 0, x0 + cw, 0); sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(.18, 'rgba(0,0,0,.1)'); sg.addColorStop(.45, 'rgba(255,240,210,.14)'); sg.addColorStop(.8, 'rgba(0,0,0,.12)'); sg.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = sg; g.fillRect(x0, y0, cw, sh); }
    else { const sg = g.createLinearGradient(x0, 0, x0 + cw, 0); sg.addColorStop(0, 'rgba(0,128,0,.6)'); sg.addColorStop(.5, 'rgba(255,128,0,0)'); sg.addColorStop(1, 'rgba(0,128,0,.6)'); g.fillStyle = sg; g.fillRect(x0, y0, cw, sh); }
    const gold = mr ? M.gold : 'rgba(226,186,104,.95)', bands = [.09, .25, .41, .57, .73, .89];
    if (gilt) {
      bands.forEach(t => { const y = y0 + sh * t; if (!mr) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x0 + 2, y - 7, cw - 4, 3); g.fillStyle = 'rgba(255,230,190,.22)'; g.fillRect(x0 + 2, y - 4, cw - 4, 5); } else { g.fillStyle = M.band; g.fillRect(x0 + 2, y - 7, cw - 4, 9); } g.fillStyle = gold; g.fillRect(x0 + 4, y - 10, cw - 8, 2); g.fillRect(x0 + 4, y + 3, cw - 8, 2); });
      const lab = i % 3 === 2 ? '#1c1a16' : (i % 2 ? '#7a1c16' : '#1f2a1c'); g.fillStyle = mr ? M.label : lab; g.fillRect(x0 + 10, y0 + sh * .27, cw - 20, sh * .12);
      g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(x0 + 12, y0 + sh * .27 + 3, cw - 24, sh * .12 - 6);
      g.fillStyle = gold; for (let l = 0; l < 2; l++) { let x = x0 + 18; while (x < x0 + cw - 22) { const ww = 4 + r() * 10; g.fillRect(x, y0 + sh * (.295 + l * .045), ww, 7); x += ww + 4 + r() * 4; } }
      [.17, .49, .65, .81].forEach(t => { const cx = x0 + cw / 2, cy = y0 + sh * t; g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 10, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 10, cy); g.closePath(); g.fill(); g.fillRect(cx - 24, cy - 1, 10, 2); g.fillRect(cx + 14, cy - 1, 10, 2); });
    } else { // vellum: hand-lettered title, ink shelf mark
      g.fillStyle = mr ? 'rgb(120,150,0)' : 'rgba(60,40,20,.75)'; for (let l = 0; l < 3; l++) { let y = y0 + sh * (.18 + l * .06); g.fillRect(x0 + 30 + r() * 10, y, cw - 64 - r() * 20, 5); }
      g.fillStyle = mr ? 'rgb(120,140,0)' : 'rgba(120,30,20,.7)'; g.fillRect(x0 + 40, y0 + sh * .8, cw - 80, 20);
    }
  });
}
// A long carpet runner (repeats along v): border bands, a field of lozenge medallions.
export function runnerTex(colors = ['#5a1c1a', '#8e3a26', '#c9a053', '#1f2c3c', '#e8d6a8']) {
  // companion: a knotted wool pile (rows of knots, each a small dome, the pile leaning along the warp) and a matte,
  // slightly uneven roughness: the carpet reads as cloth with depth, not a printed plane
  return withComp(runnerDraw(colors), () => {
    if (!RUN.n) { const W = 256, H = 512, F = fieldF(W, H, (u, v, x, y) => { const kx = (x % 4) / 4, ky = (y % 4) / 4, dome = Math.sin(Math.PI * kx) * Math.sin(Math.PI * ky); return dome * .6 + pfbm(u, v, 16, 32, 3, 301) * .9 + pn(u * 128, v * 256, 128, 256, 302) * .3; });
      RUN.n = nrmTex('runner-n', F, W, H, 1.6); RUN.r = greyTex('runner-r', fieldF(W, H, (u, v) => .88 + .1 * pfbm(u, v, 8, 16, 2, 303)), W, H); }
    return { normalMap: RUN.n, roughnessMap: RUN.r };
  }, { name: 'runner', size: () => [256, 512], normalScale: .8, roughness: 1, r: .9 });
}
const RUN = {};
function runnerDraw(colors) {
  return canvasTex('runner' + colors.join(), 256, 512, (g, w, h) => {
    const [a, b, c, d, e] = colors; g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = d; g.fillRect(0, 0, 30, h); g.fillRect(w - 30, 0, 30, h); g.fillStyle = c; g.fillRect(30, 0, 5, h); g.fillRect(w - 35, 0, 5, h); g.fillRect(10, 0, 3, h); g.fillRect(w - 13, 0, 3, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = e; g.beginPath(); g.moveTo(15, y); g.lineTo(22, y + 8); g.lineTo(15, y + 16); g.lineTo(8, y + 8); g.fill(); g.beginPath(); g.moveTo(w - 15, y + 16); g.lineTo(w - 8, y + 24); g.lineTo(w - 15, y + 32); g.lineTo(w - 22, y + 24); g.fill(); }
    [[h * .25, b], [h * .75, d]].forEach(([cy, col]) => { const cx = w / 2; g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx + 70, cy); g.lineTo(cx, cy + 110); g.lineTo(cx - 70, cy); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - 96); g.lineTo(cx + 60, cy); g.lineTo(cx, cy + 96); g.lineTo(cx - 60, cy); g.fill(); g.fillStyle = e; g.beginPath(); g.arc(cx, cy, 18, 0, 7); g.fill(); g.fillStyle = c; for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(t) * 38, cy + Math.sin(t) * 58, 6, 10, t, 0, 7); g.fill(); } });
    const r = mulberry(31); for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,240,210'},${r() * .07})`; g.fillRect(r() * w, r() * h, 2, 1); }
  });
}
// Tarnish for polished metals (multiplies F0): uneven oxidation in broad clouds (darker, browner for brass/copper,
// greyer for steel), handling spots, and a few drips of old polish residue. 1.0 = clean metal; ≥ 0.6 in the darkest
// tarnish. Tileable, 512².
export function patinaTex(kind = 'brass') {
  const K = 'patina-' + kind, S = 512, warm = kind === 'brass' || kind === 'copper' || kind === 'gold';
  return canvasTex(K, S, S, (g) => {
    const A = fieldF(S, S, (u, v) => pfbm(u, v, 4, 4, 4, 201)), B = fieldF(S, S, (u, v) => pfbm(u, v, 22, 22, 2, 202)), img = g.createImageData(S, S), amt = kind === 'gold' ? .35 : kind === 'chrome' ? .2 : 1;
    for (let i = 0; i < S * S; i++) { const t = amt * (Math.max(0, A[i] - .45) * 1.5 + Math.max(0, B[i] - .62) * .9), k = 1 - .38 * t; img.data[i * 4] = 255 * k; img.data[i * 4 + 1] = 255 * (k - (warm ? .08 : .02) * t); img.data[i * 4 + 2] = 255 * (k - (warm ? .2 : .03) * t); img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
}
