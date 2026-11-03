// Procedural textures (canvas-generated so the project ships no image files).
import * as THREE from 'three';
import { mulberry, makeNoise } from '../util.js';

const cache = new Map();
export function canvasTex(key, w, h, draw, { repeat, srgb = true, aniso = 8 } = {}) {
  if (key && cache.has(key)) { const t = cache.get(key).clone(); if (repeat) t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; return t; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (key) cache.set(key, t);
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
export function plaster(tone = [214, 200, 176], key = 'plaster') {
  return canvasTex(key + tone.join(), 512, 512, (g, w, h) => {
    const n = makeNoise(3), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n.fbm(x / 90, y / 90, 0, 4) * .5 + n(x / 9, y / 9) * .12, o = (y * w + x) * 4, k = 1 + v * .22; img.data[o] = tone[0] * k; img.data[o + 1] = tone[1] * k; img.data[o + 2] = tone[2] * k; img.data[o + 3] = 255; }
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
    g.fillText(text, w / 2, sub ? h * .4 : h / 2 + 2);
    if (sub) { g.font = '400 ' + Math.round(fs * .45) + 'px "IBM Plex Mono", monospace'; g.globalAlpha = .7; g.fillText(sub, w / 2, h * .76); }
  }, { aniso: 4 });
}
export function radialGlow(color = '255,220,150') {
  return canvasTex('glow' + color, 128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 2, 64, 64, 64); r.addColorStop(0, `rgba(${color},1)`); r.addColorStop(.25, `rgba(${color},.45)`); r.addColorStop(1, `rgba(${color},0)`); g.fillStyle = r; g.fillRect(0, 0, w, w); });
}
export function gradientSky(top = '#1a2a44', bottom = '#e8b07a', key) {
  return canvasTex(key || ('sky' + top + bottom), 16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
