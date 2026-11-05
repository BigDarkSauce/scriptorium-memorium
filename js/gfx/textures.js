// Procedural textures (canvas-generated so the project ships no image files).
import * as THREE from 'three';
import { mulberry, makeNoise } from '../util.js';

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
  return canvasTex(key + tone.join() + (amp === .22 ? '' : amp), 512, 512, (g, w, h) => {
    const n = makeNoise(3), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n.fbm(x / 90, y / 90, 0, 4) * .5 + n(x / 9, y / 9) * .12, o = (y * w + x) * 4, k = 1 + v * amp; img.data[o] = tone[0] * k; img.data[o + 1] = tone[1] * k; img.data[o + 2] = tone[2] * k; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
}
export function stone(key = 'stone') {
  return canvasTex(key, 512, 512, (g, w, h) => {
    const r = mulberry(7); g.fillStyle = '#5b544b'; g.fillRect(0, 0, w, h); const bh = 64;
    for (let y = 0; y < h; y += bh) { const off = (y / bh) % 2 ? 64 : 0; for (let x = -128; x < w; x += 128) { const v = 82 + r() * 26; g.fillStyle = `rgb(${v + 10},${v + 4},${v - 4})`; g.fillRect(x + off + 3, y + 3, 122, bh - 6); } }
    grain(g, w, h, r, 9000, .12);
  });
}
export function parchment(key = 'parch', w = 512, h = 1024) {
  return canvasTex(key, w, h, (g) => {
    const r = mulberry(9), n = makeNoise(4), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n.fbm(x / 120, y / 120, 0, 4), o = (y * w + x) * 4, e = Math.min(1, Math.min(x, w - x) / 40) * Math.min(1, Math.min(y, h - y) / 40); const k = .86 + v * .12 + e * .1; img.data[o] = 236 * k; img.data[o + 1] = 222 * k; img.data[o + 2] = 188 * k; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0); grain(g, w, h, r, 3000, .05);
  });
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
export function leather(tone = '#6b2a1e', key = 'leather') {
  return canvasTex(key + tone, 256, 256, (g, w, h) => { g.fillStyle = tone; g.fillRect(0, 0, w, h); const r = mulberry(4); grain(g, w, h, r, 6000, .18); });
}
// Text plaque / tag texture
export function labelTex(text, { w = 512, h = 128, bg = '#1a120b', fg = '#e7c477', font = '600 54px "IM Fell English SC", Georgia, serif', border = '#8f733a', sub = '' } = {}) {
  return canvasTex(null, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); if (border) { g.strokeStyle = border; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = parseInt(font.match(/(\d+)px/)[1]); while (g.measureText(text).width > w - 40 && fs > 14) { fs -= 2; g.font = font.replace(/\d+px/, fs + 'px'); }
    g.fillText(text, w / 2, sub ? h * .4 : h / 2 + 2, w - 40);   // maxWidth: a very long name is condensed, never cut by the frame
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
  rose: { base: '#d6a59b', cloud: ['#ecc9be', '#bf7d73', '#f4e2d6', '#a9625b', '#dcb0a4'], vein: '#7c3a35', vein2: '#f7ebe2' },
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
  giallo: { base: '#d8b878', cloud: ['#e8cd92', '#c49a52', '#f0dcaa', '#b98a48', '#dcbd80'], vein: '#8a4a22', vein2: '#f3e2b8' },
  verde: { base: '#2c4a3b', cloud: ['#3e6550', '#1b2f26', '#5d8a70', '#24382e', '#e6eee6', '#0f1814'], vein: '#e8efe8', vein2: '#0c1410' },
  rosso: { base: '#7a221d', cloud: ['#8d2e26', '#5e1714', '#9c3b30', '#6a1c18'], vein: '#3a0c0a', vein2: '#c46a58' },
  pavonazzetto: { base: '#ece6df', cloud: ['#f6f2ee', '#d9cfd2', '#c9b4bf', '#efe9e4', '#b89aab'], vein: '#6e4a66', vein2: '#a17c95' }
};
// Draw a list of shapes 9 times (offset by ±w,±h) so the result tiles seamlessly.
function wrapDraw(g, w, h, fn) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } }
function marbleCanvas(name, size, seed = 1) {
  const P = MARBLES[name] || MARBLES.rose, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = mulberry(seed * 31 + name.length * 7), s = size / 512;
  g.fillStyle = P.base; g.fillRect(0, 0, size, size);
  const blobs = []; for (let i = 0; i < 90; i++) blobs.push([r() * size, r() * size, (30 + r() * 150) * s, P.cloud[i % P.cloud.length], .12 + r() * .3]);
  blobs.forEach(([x, y, rad, col, a]) => wrapDraw(g, size, size, () => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, col + '00'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }));
  g.globalAlpha = 1;
  const veins = [], nV = P.faint ? 7 : 12;
  for (let i = 0; i < nV; i++) {
    let x = r() * size, y = r() * size, a = -.6 + r() * .5 + (i % 3 === 0 ? 1.4 : 0); const pts = [[x, y]];
    for (let k = 0; k < 70 + r() * 90; k++) { a += (r() - .5) * .55; x += Math.cos(a) * 7 * s; y += Math.sin(a) * 7 * s; pts.push([x, y]); }
    veins.push({ pts, lw: (.5 + r() * (i < 3 ? 2.6 : 1.3)) * s, col: i % 4 === 3 ? P.vein2 : P.vein, a: (P.faint ? .25 : .45) + r() * .35 });
  }
  const stroke = (v, lw, a) => { g.globalAlpha = a; g.strokeStyle = v.col; g.lineWidth = lw; g.beginPath(); v.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  g.lineJoin = g.lineCap = 'round';
  g.filter = `blur(${2.5 * s}px)`; veins.forEach(v => wrapDraw(g, size, size, () => stroke(v, v.lw * 4, v.a * .35)));
  g.filter = 'none'; veins.forEach(v => wrapDraw(g, size, size, () => stroke(v, v.lw, v.a)));
  g.globalAlpha = 1; for (let i = 0; i < 2600 * s * s; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; g.fillRect(r() * size, r() * size, 1.5, 1.5); }
  return c;
}
export function marbleTex(name = 'rose', { size = 512, seed = 1, repeat } = {}) {
  return canvasTex('marble-' + name + size + '-' + seed, size, size, (g) => g.drawImage(marbleCanvas(name, size, seed), 0, 0), { repeat });
}
// Gold leaf: squares of leaf with slightly different tone, seams and burnish. Returns { map, rough }.
export function gildTex() {
  const draw = (mask) => (g, w, h) => {
    const r = mulberry(17), n = 8, q = w / n;
    g.fillStyle = mask ? '#555' : '#f3dc9c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = r(); g.fillStyle = mask ? `rgb(${70 + v * 40 | 0},${70 + v * 40 | 0},${70 + v * 40 | 0})` : `hsl(${42 + v * 3},${66 + v * 8}%,${73 + v * 5}%)`; g.fillRect(i * q + (r() - .5) * 6, j * q + (r() - .5) * 6, q + 4, q + 4); }
    g.strokeStyle = mask ? 'rgba(160,160,160,.4)' : 'rgba(120,80,20,.16)'; g.lineWidth = 1; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q + (r() - .5) * 4, 0); g.lineTo(i * q + (r() - .5) * 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(w, i * q + (r() - .5) * 4); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = mask ? `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},.12)` : `rgba(${r() < .5 ? '90,60,20' : '255,250,220'},${r() * .12})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  };
  return { map: canvasTex('gild', 256, 256, draw(false)), rough: canvasTex('gild-r', 256, 256, draw(true), { srgb: false }) };
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
  const draw = (mask) => (g) => {
    const r = mulberry(23); g.fillStyle = mask ? '#c8c8c8' : '#5d5650'; g.fillRect(0, 0, W, H);
    polys.forEach(({ t, p }) => {
      const path = () => { g.beginPath(); p.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
      const inset = (k) => p.map(([x, y]) => { const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length; return [cx + (x - cx) * k, cy + (y - cy) * k]; });
      g.save(); path(); g.clip();
      if (mask) { const v = 46 + r() * 30; g.fillStyle = `rgb(${v},${v},${v})`; g.fill(); }
      else { const mk = mkc(), pat = g.createPattern(mk[t % mk.length], 'repeat'); pat.setTransform(new DOMMatrix().translate(r() * 256, r() * 256).rotate(r() * 360)); g.fillStyle = pat; g.fill(); }
      g.restore();
      // grout + a faint bevel
      const pi = inset(.985); g.lineWidth = 2.2; g.strokeStyle = mask ? 'rgba(220,220,220,1)' : 'rgba(60,52,46,.75)'; path(); g.stroke();
      if (!mask) { g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,250,240,.25)'; g.beginPath(); pi.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); }
    });
    if (mask) for (let i = 0; i < 120; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(120,120,120,.18)'); gr.addColorStop(1, 'rgba(120,120,120,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  };
  const tilesX = pattern === 'cubes' ? 4 : 4; const sx = tilesX * tile, sy = sx * H / W;
  return { map: canvasTex(key, W, H, draw(false)), rough: canvasTex(key + '-r', W, H, draw(true), { srgb: false }), span: [sx, sy] };
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
export function damaskTex(base = '#7a2e3a', key = 'damask') {
  return canvasTex(key + base, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,225,190,.14)';
    const motif = (cx, cy) => { g.beginPath(); g.moveTo(cx, cy - 50); g.bezierCurveTo(cx + 40, cy - 30, cx + 30, cy + 20, cx, cy + 50); g.bezierCurveTo(cx - 30, cy + 20, cx - 40, cy - 30, cx, cy - 50); g.fill(); g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); };
    [[64, 64], [192, 192], [192, -64], [-64, 192], [192, 64 + 256], [64 + 256, 192]].forEach(([x, y]) => { motif(x, y); }); motif(192, 192 - 256); motif(64 - 256, 64); motif(64, 64 + 256); motif(64 + 256, 64);
    const r = mulberry(8); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .08})`; g.fillRect(r() * w, r() * h, 1, 2); }
  });
}
// Bright morning sky seen through the tall windows.
export function windowSkyTex() {
  return canvasTex('winsky', 256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fbbd8'); gr.addColorStop(.6, '#e9dcc0'); gr.addColorStop(1, '#f6e7c6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry(12); for (let i = 0; i < 26; i++) { const x = r() * w, y = h * (.15 + r() * .45), rad = 14 + r() * 30, c = g.createRadialGradient(x, y, 0, x, y, rad); c.addColorStop(0, 'rgba(255,252,245,.8)'); c.addColorStop(1, 'rgba(255,252,245,0)'); g.fillStyle = c; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    g.fillStyle = '#9aa6a0'; g.beginPath(); g.moveTo(0, h * .86); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * .82 - Math.sin(x / 30) * 14 - Math.sin(x / 11) * 5); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  });
}
// Additive light-shaft texture: bright at the window (v=1), fading to the floor, soft at the edges, faint dust streaks.
// (falls off quickly, so the shafts read as beams near the windows instead of a golden haze over the window wall)
export function shaftTex() {
  return canvasTex('shaft2', 64, 256, (g, w, h) => {
    const img = g.createImageData(w, h), r = mulberry(5), streak = Array.from({ length: w }, () => .7 + r() * .3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 1 - y / (h - 1), u = x / (w - 1), e = Math.pow(Math.sin(Math.PI * u), 1.2), a = Math.pow(v, 2.2) * e * streak[x]; const o = (y * w + x) * 4; img.data[o] = 255; img.data[o + 1] = 236; img.data[o + 2] = 200; img.data[o + 3] = a * 255; }
    g.putImageData(img, 0, 0);
  }, { aniso: 1 });
}

// ---------- library woodwork & books (wall bookcases, the user's bookcases) ----------
// Figured wood with fine grain, pores and a few flame streaks. `paint` > 0 turns it into painted (lacquered) wood:
// the grain only shows faintly through an ivory coat, as on Admont's white-and-gold cases.
export function figuredWood(tone = [110, 70, 40], key = 'fig', { paint = 0, seed = 7 } = {}) {
  return canvasTex('figwood' + key + tone.join() + paint, 512, 512, (g, w, h) => {
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
  });
}
// Atlas of book spines for the instanced books: 8 bindings side by side (each cell 128 px wide), the page edges in a
// strip at the top (v > .97). Calf, morocco, cloth and vellum, raised bands with gilt fillets, a lettering piece and
// gilt tools in the panels. Book geometry samples one cell; the shader shifts u by the instance's binding variant.
export const SPINE_VARIANTS = 8;
export function spineAtlas() {
  return canvasTex('spine-atlas', 1024, 512, (g, W, H) => {
    const r = mulberry(23), cw = W / SPINE_VARIANTS, sh = Math.round(H * .965);
    const B = [['#6a3a1e', 1], ['#4a2614', 1], ['#6e1f1a', 1], ['#8b2c1e', 1], ['#2f4a32', 1], ['#25324a', 1], ['#d6c59a', 0], ['#94632f', 1]];
    g.fillStyle = '#d6c8a4'; g.fillRect(0, 0, W, H); // page edges
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(120,96,60,${r() * .2})`; g.fillRect(r() * W, 0, 1, H - sh); }
    B.forEach(([col, gilt], i) => {
      const x0 = i * cw, y0 = H - sh;
      g.fillStyle = col; g.fillRect(x0, y0, cw, sh);
      for (let k = 0; k < 2200; k++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,235,200'},${r() * .09})`; g.fillRect(x0 + r() * cw, y0 + r() * sh, 1 + r() * 3, 1 + r() * 3); }
      const sg = g.createLinearGradient(x0, 0, x0 + cw, 0); sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(.18, 'rgba(0,0,0,.1)'); sg.addColorStop(.45, 'rgba(255,240,210,.14)'); sg.addColorStop(.8, 'rgba(0,0,0,.12)'); sg.addColorStop(1, 'rgba(0,0,0,.6)');
      g.fillStyle = sg; g.fillRect(x0, y0, cw, sh);
      const gold = 'rgba(226,186,104,.95)', bands = [.09, .25, .41, .57, .73, .89];
      if (gilt) {
        bands.forEach(t => { const y = y0 + sh * t; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x0 + 2, y - 7, cw - 4, 3); g.fillStyle = 'rgba(255,230,190,.22)'; g.fillRect(x0 + 2, y - 4, cw - 4, 5); g.fillStyle = gold; g.fillRect(x0 + 4, y - 10, cw - 8, 2); g.fillRect(x0 + 4, y + 3, cw - 8, 2); });
        const lab = i % 3 === 2 ? '#1c1a16' : (i % 2 ? '#7a1c16' : '#1f2a1c'); g.fillStyle = lab; g.fillRect(x0 + 10, y0 + sh * .27, cw - 20, sh * .12);
        g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(x0 + 12, y0 + sh * .27 + 3, cw - 24, sh * .12 - 6);
        g.fillStyle = gold; for (let l = 0; l < 2; l++) { let x = x0 + 18; while (x < x0 + cw - 22) { const ww = 4 + r() * 10; g.fillRect(x, y0 + sh * (.295 + l * .045), ww, 7); x += ww + 4 + r() * 4; } }
        [.17, .49, .65, .81].forEach(t => { const cx = x0 + cw / 2, cy = y0 + sh * t; g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 10, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 10, cy); g.closePath(); g.fill(); g.fillRect(cx - 24, cy - 1, 10, 2); g.fillRect(cx + 14, cy - 1, 10, 2); });
      } else { // vellum: hand-lettered title, ink shelf mark
        g.fillStyle = 'rgba(60,40,20,.75)'; for (let l = 0; l < 3; l++) { let y = y0 + sh * (.18 + l * .06); g.fillRect(x0 + 30 + r() * 10, y, cw - 64 - r() * 20, 5); }
        g.fillStyle = 'rgba(120,30,20,.7)'; g.fillRect(x0 + 40, y0 + sh * .8, cw - 80, 20);
      }
    });
  }, { aniso: 8 });
}
// A long carpet runner (repeats along v): border bands, a field of lozenge medallions.
export function runnerTex(colors = ['#5a1c1a', '#8e3a26', '#c9a053', '#1f2c3c', '#e8d6a8']) {
  return canvasTex('runner' + colors.join(), 256, 512, (g, w, h) => {
    const [a, b, c, d, e] = colors; g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = d; g.fillRect(0, 0, 30, h); g.fillRect(w - 30, 0, 30, h); g.fillStyle = c; g.fillRect(30, 0, 5, h); g.fillRect(w - 35, 0, 5, h); g.fillRect(10, 0, 3, h); g.fillRect(w - 13, 0, 3, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = e; g.beginPath(); g.moveTo(15, y); g.lineTo(22, y + 8); g.lineTo(15, y + 16); g.lineTo(8, y + 8); g.fill(); g.beginPath(); g.moveTo(w - 15, y + 16); g.lineTo(w - 8, y + 24); g.lineTo(w - 15, y + 32); g.lineTo(w - 22, y + 24); g.fill(); }
    [[h * .25, b], [h * .75, d]].forEach(([cy, col]) => { const cx = w / 2; g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx + 70, cy); g.lineTo(cx, cy + 110); g.lineTo(cx - 70, cy); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - 96); g.lineTo(cx + 60, cy); g.lineTo(cx, cy + 96); g.lineTo(cx - 60, cy); g.fill(); g.fillStyle = e; g.beginPath(); g.arc(cx, cy, 18, 0, 7); g.fill(); g.fillStyle = c; for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(t) * 38, cy + Math.sin(t) * 58, 6, 10, t, 0, 7); g.fill(); } });
    const r = mulberry(31); for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,240,210'},${r() * .07})`; g.fillRect(r() * w, r() * h, 2, 1); }
  });
}
