// Painted ceilings for the book rooms, one design per subject (the shallow domes of js/gfx/baroque.js carry them).
// Each is a round canvas painting in the room's fresco technique, gilt-ringed by the dome, its motifs taken from what
// the subject draws on: an orrery for physics, a cartographer's sky for the earth sciences, compass-and-straightedge
// constructions for mathematics, a lattice of molecules for chemistry, a Galton board and its bell for statistics and
// markets, phyllotaxis and venation for biology. "fresco" keeps the allegorical sky of the hall.
import { canvasTex } from './textures.js';
import { mulberry } from '../util.js';

export const CEILINGS = { fresco: 'Allegorical sky', celestial: 'Orrery and stars', sky: 'Cartographer’s sky', geometry: 'Compass and straightedge', molecules: 'Molecular lattice', probability: 'Chance and the bell', botanical: 'Phyllotaxis and leaves' };

// the room's subject → its ceiling: an explicit choice, else the bookcase's name, else the book's own title and parts
export function ceilingTheme(choice, shelfName = '', text = '') {
  if (choice && choice !== 'auto' && CEILINGS[choice]) return choice;
  const t = (shelfName + ' ' + text).toLowerCase();
  const rules = [['celestial', /physic|mechanic|astro|orbit|gravit|optic|electr|quantum|relativ|thermo/], ['sky', /earth|weather|climate|geo|ocean|atmos|water cycle|meteor/], ['molecules', /chem|molec|reaction|atom|equilibri|polymer|material/], ['botanical', /bio|cell|membran|osmo|ecolog|plant|animal|gene|anatom|physiol|behavio/], ['probability', /econ|statist|probab|market|financ|business|data|chance/], ['geometry', /math|calcul|algebra|geometr|linear|derivat|number|logic|proof/]];
  for (const [k, re] of rules) if (re.test(t)) return k;
  return 'fresco';
}

const ring = (g, C, R) => { g.save(); g.beginPath(); g.arc(C, C, R * .97, 0, 7); g.clip(); };
const glow = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const border = (g, C, R, ink, labels, font) => {   // the inscribed band near the gilt rim
  g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.arc(C, C, R * .9, 0, 7); g.stroke(); g.lineWidth = 1.2; g.beginPath(); g.arc(C, C, R * .82, 0, 7); g.stroke();
  if (labels) { g.fillStyle = ink; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; labels.forEach((s, i) => { const a = i / labels.length * Math.PI * 2 - Math.PI / 2; g.save(); g.translate(C + Math.cos(a) * R * .86, C + Math.sin(a) * R * .86); g.rotate(a + Math.PI / 2); g.fillText(s, 0, 0); g.restore(); }); }
};
const DRAW = {
  celestial(g, W, r) {
    const C = W / 2, R = W / 2, bg = g.createRadialGradient(C, C, 0, C, C, R); bg.addColorStop(0, '#2b3f6e'); bg.addColorStop(.6, '#18244a'); bg.addColorStop(1, '#0e1430'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 900; i++) { const a = r() * 7, d = Math.sqrt(r()) * R, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, s = r() < .04 ? 2.4 : .5 + r() * 1.1; g.fillStyle = `rgba(255,246,220,${.35 + r() * .6})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); if (s > 2) glow(g, x, y, 10, 'rgba(255,240,200,.35)'); }
    // constellation strokes
    g.strokeStyle = 'rgba(214,190,130,.35)'; g.lineWidth = 1.4; for (let k = 0; k < 6; k++) { const a0 = r() * 7, d0 = R * (.55 + r() * .2); let x = C + Math.cos(a0) * d0, y = C + Math.sin(a0) * d0; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - .5) * 90; y += (r() - .5) * 90; g.lineTo(x, y); g.fillStyle = '#fff3cf'; g.fillRect(x - 2, y - 2, 4, 4); } g.stroke(); }
    // the orrery: gilt orbits (ellipses with the sun at a focus), planets, Kepler's swept area
    glow(g, C, C, R * .22, 'rgba(255,214,140,.9)'); g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(C, C, 26, 0, 7); g.fill();
    [[.2, .1, '#c9a46a'], [.32, .16, '#7fa2c9'], [.46, .22, '#c97a5a'], [.6, .12, '#e3cf9a']].forEach(([a, e, col], i) => { const A = R * a, B = A * Math.sqrt(1 - e * e), cx = C - A * e, rot = i * .7;
      g.save(); g.translate(C, C); g.rotate(rot); g.translate(-C, -C); g.strokeStyle = 'rgba(232,200,120,.75)'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(cx, C, A, B, 0, 0, 7); g.stroke();
      if (i === 2) { g.fillStyle = 'rgba(232,200,120,.18)'; g.beginPath(); g.moveTo(C, C); g.ellipse(cx, C, A, B, 0, -.5, .1); g.closePath(); g.fill(); }
      const t = r() * 7, px = cx + Math.cos(t) * A, py = C + Math.sin(t) * B; glow(g, px, py, 22, 'rgba(255,240,210,.35)'); g.fillStyle = col; g.beginPath(); g.arc(px, py, 9 + i * 2, 0, 7); g.fill(); g.restore(); });
    border(g, C, R, 'rgba(232,200,120,.85)', ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(z => z + '\uFE0E'), '30px serif');
  },
  sky(g, W, r) {
    const C = W / 2, R = W / 2, bg = g.createRadialGradient(C, C, 0, C, C, R); bg.addColorStop(0, '#fffaf0'); bg.addColorStop(.3, '#dbe9f4'); bg.addColorStop(1, '#7ea6c8'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
    // graticule: latitude circles and meridians, as on a polar chart
    g.strokeStyle = 'rgba(70,96,120,.28)'; g.lineWidth = 1.4; for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(C, C, R * k / 6, 0, 7); g.stroke(); } for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * R * .82, C + Math.sin(a) * R * .82); g.stroke(); }
    // cloud banks round the rim, a rain veil under one
    const puff = (x, y, s) => { for (let k = 0; k < 9; k++) { const px = x + (r() - .5) * s * 1.6, py = y + (r() - .5) * s * .6, pr = s * (.3 + r() * .35), gr = g.createRadialGradient(px - pr * .2, py - pr * .3, pr * .1, px, py, pr); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.7, 'rgba(226,232,240,.7)'); gr.addColorStop(1, 'rgba(160,176,196,0)'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill(); } };
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * .4, d = R * (.58 + r() * .14); puff(C + Math.cos(a) * d, C + Math.sin(a) * d, R * .13); if (i === 3) { g.strokeStyle = 'rgba(90,120,150,.35)'; g.lineWidth = 1.5; for (let k = 0; k < 30; k++) { const x = C + Math.cos(a) * d + (r() - .5) * R * .2, y = C + Math.sin(a) * d; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 50); g.stroke(); } } }
    // compass rose
    g.save(); g.translate(C, C); for (let k = 0; k < 16; k++) { const L = k % 4 === 0 ? R * .36 : k % 2 ? R * .14 : R * .22; g.rotate(Math.PI / 8); g.fillStyle = k % 2 ? '#9c7a3c' : '#c9a35e'; g.beginPath(); g.moveTo(0, -L); g.lineTo(L * .12, 0); g.lineTo(-L * .12, 0); g.closePath(); g.fill(); g.fillStyle = 'rgba(60,40,20,.25)'; g.beginPath(); g.moveTo(0, -L); g.lineTo(L * .12, 0); g.lineTo(0, 0); g.closePath(); g.fill(); } g.fillStyle = '#efe0b8'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill(); g.restore();
    // wind arrows sweeping round
    g.strokeStyle = 'rgba(60,90,120,.5)'; g.lineWidth = 3; for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; g.beginPath(); g.arc(C, C, R * .45, a, a + .6); g.stroke(); const ex = C + Math.cos(a + .6) * R * .45, ey = C + Math.sin(a + .6) * R * .45, ta = a + .6 + Math.PI / 2; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(ta - .5) * 18, ey - Math.sin(ta - .5) * 18); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(ta + .5) * 18, ey - Math.sin(ta + .5) * 18); g.stroke(); }
    border(g, C, R, 'rgba(110,84,40,.8)', ['N', '·', 'NE', '·', 'E', '·', 'SE', '·', 'S', '·', 'SW', '·', 'W', '·', 'NW', '·'], 'italic 30px Georgia, serif');
  },
  geometry(g, W, r) {
    const C = W / 2, R = W / 2; g.fillStyle = '#f1e6cf'; g.fillRect(0, 0, W, W); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(120,90,50,${r() * .05})`; g.fillRect(r() * W, r() * W, 2, 2); }
    const ink = 'rgba(60,44,28,.7)', lapis = 'rgba(45,91,142,.75)', rub = 'rgba(156,58,40,.7)';
    // the seed of life: seven circles of one radius, the first construction of Euclid
    const s = R * .2; g.strokeStyle = ink; g.lineWidth = 2; [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3) * s, Math.sin(k * Math.PI / 3) * s])].forEach(([x, y]) => { g.beginPath(); g.arc(C + x, C + y, s, 0, 7); g.stroke(); });
    g.strokeStyle = lapis; g.lineWidth = 2.6; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6, x = C + Math.cos(a) * s * 2 * Math.cos(Math.PI / 6), y = C + Math.sin(a) * s * 2 * Math.cos(Math.PI / 6); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    // the golden spiral: r grows by φ every quarter turn (r = a·φ^(2θ/π)), drawn with its quarter-turn radii
    { const ox = C + R * .38, oy = C - R * .32, phi = 1.618034; g.strokeStyle = rub; g.lineWidth = 3; g.beginPath(); for (let t = 0; t <= 4.2 * Math.PI; t += .02) { const rr = 3 * phi ** (2 * t / Math.PI), x = ox + Math.cos(-t) * rr, y = oy + Math.sin(-t) * rr; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.strokeStyle = ink; g.lineWidth = 1.2; for (let k = 1; k <= 8; k++) { const t = k * Math.PI / 2, rr = 3 * phi ** (2 * t / Math.PI); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(-t) * rr, oy + Math.sin(-t) * rr); g.stroke(); } }
    // a pentagram in its circle; an angle bisected; Pythagoras' squares
    const pr = R * .17, px = C - R * .42, py = C + R * .28; g.strokeStyle = lapis; g.lineWidth = 2; g.beginPath(); g.arc(px, py, pr, 0, 7); g.stroke(); g.beginPath(); for (let k = 0; k <= 5; k++) { const t = k * 4 * Math.PI / 5 - Math.PI / 2; const xx = px + Math.cos(t) * pr, yy = py + Math.sin(t) * pr; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
    const qx = C + R * .02, qy = C + R * .3, u = R * .075; g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + 4 * u, qy); g.lineTo(qx, qy - 3 * u); g.closePath(); g.stroke(); g.fillStyle = 'rgba(45,91,142,.18)'; g.fillRect(qx, qy, 4 * u, 4 * u); g.strokeRect(qx, qy, 4 * u, 4 * u); g.fillStyle = 'rgba(156,58,40,.16)'; g.fillRect(qx - 3 * u, qy - 3 * u, 3 * u, 3 * u); g.strokeRect(qx - 3 * u, qy - 3 * u, 3 * u, 3 * u);
    border(g, C, R, 'rgba(90,64,34,.85)', '3.14159265358979323846264338327950288419716939937510'.split(''), 'italic 26px Georgia, serif');
  },
  molecules(g, W, r) {
    const C = W / 2, R = W / 2, bg = g.createRadialGradient(C, C, 0, C, C, R); bg.addColorStop(0, '#e8f2ee'); bg.addColorStop(.7, '#a9cbc0'); bg.addColorStop(1, '#5f8f84'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
    // a honeycomb of benzene rings
    const h = 46; g.strokeStyle = 'rgba(40,80,72,.35)'; g.lineWidth = 2; for (let row = -12; row <= 12; row++) for (let col = -12; col <= 12; col++) { const x = C + col * h * 1.5, y = C + row * h * Math.sqrt(3) + (col % 2 ? h * Math.sqrt(3) / 2 : 0); if (Math.hypot(x - C, y - C) > R * .78) continue; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; k ? g.lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h) : g.moveTo(x + h, y); } g.stroke(); }
    // ball-and-stick molecules floating on it: water, methane, carbon dioxide
    const atom = (x, y, rr, col) => { const gr = g.createRadialGradient(x - rr * .35, y - rr * .4, rr * .1, x, y, rr); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, col); gr.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); };
    const bond = (x1, y1, x2, y2) => { g.strokeStyle = 'rgba(70,60,50,.8)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * .3, d = R * (i % 2 ? .55 : .3), x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, k = i % 3, rot = r() * 7;
      if (k === 0) { const ang = 104.5 * Math.PI / 360; const h1 = [x + Math.cos(rot - ang) * 50, y + Math.sin(rot - ang) * 50], h2 = [x + Math.cos(rot + ang) * 50, y + Math.sin(rot + ang) * 50]; bond(x, y, ...h1); bond(x, y, ...h2); atom(...h1, 14, '#f4f4f4'); atom(...h2, 14, '#f4f4f4'); atom(x, y, 24, '#d8432f'); }
      else if (k === 1) { [0, 1, 2, 3].forEach(j => { const t = rot + j * Math.PI / 2 + (j % 2) * .3, hx = x + Math.cos(t) * 56, hy = y + Math.sin(t) * 46; bond(x, y, hx, hy); atom(hx, hy, 13, '#f4f4f4'); }); atom(x, y, 22, '#3a3a3a'); }
      else { [-1, 1].forEach(sg => { const ox = x + Math.cos(rot) * 58 * sg, oy = y + Math.sin(rot) * 58 * sg; bond(x, y, ox, oy); atom(ox, oy, 20, '#d8432f'); }); atom(x, y, 21, '#3a3a3a'); } }
    border(g, C, R, 'rgba(30,70,62,.85)', ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'], '600 26px Georgia, serif');
  },
  probability(g, W, r) {
    const C = W / 2, R = W / 2, bg = g.createRadialGradient(C, C, 0, C, C, R); bg.addColorStop(0, '#fbf1dc'); bg.addColorStop(.7, '#ead2a2'); bg.addColorStop(1, '#b38c4e'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(120,90,40,.16)'; g.lineWidth = 1; for (let k = -20; k <= 20; k++) { g.beginPath(); g.moveTo(C + k * 40, 0); g.lineTo(C + k * 40, W); g.stroke(); g.beginPath(); g.moveTo(0, C + k * 40); g.lineTo(W, C + k * 40); g.stroke(); }   /* a ledger grid */
    // a Galton board: pegs in a triangle, one bead's zigzag path, the bins below filling to a bell
    const rows = 10, sp = 34, top = C - R * .5; g.fillStyle = '#6b4a1e'; for (let i = 0; i < rows; i++) for (let j = 0; j <= i; j++) { g.beginPath(); g.arc(C + (j - i / 2) * sp, top + i * sp, 4.5, 0, 7); g.fill(); }
    let bx = C, by = top - sp * .6; g.strokeStyle = 'rgba(156,58,40,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx, by); for (let i = 0; i < rows; i++) { bx += (r() < .5 ? -1 : 1) * sp / 2; by += sp; g.lineTo(bx, by); } g.stroke();
    const base = top + rows * sp + 150, binW = sp, P = k => { let c = 1; for (let i = 0; i < k; i++) c = c * (rows - i) / (i + 1); return c / 2 ** rows; };
    for (let k = 0; k <= rows; k++) { const x = C + (k - rows / 2) * binW, hh = P(k) * 520; g.fillStyle = 'rgba(45,91,142,.55)'; g.fillRect(x - binW / 2 + 3, base - hh, binW - 6, hh); }
    g.strokeStyle = '#9c3a28'; g.lineWidth = 4; g.beginPath(); for (let x = -rows / 2 - .6; x <= rows / 2 + .6; x += .05) { const s2 = rows / 4, y = Math.exp(-x * x / (2 * s2)) / Math.sqrt(2 * Math.PI * s2) * 520; const X = C + x * binW, Y = base - y; x === -rows / 2 - .6 ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.stroke();
    g.strokeStyle = 'rgba(90,64,30,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(C - R * .5, base); g.lineTo(C + R * .5, base); g.stroke();
    // coins round the rim, heads and tails
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, x = C + Math.cos(a) * R * .7, y = C + Math.sin(a) * R * .7; const gr = g.createRadialGradient(x - 8, y - 8, 2, x, y, 26); gr.addColorStop(0, '#fff2c0'); gr.addColorStop(.6, '#c9a14a'); gr.addColorStop(1, '#7a5a20'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill(); g.fillStyle = '#5a3f14'; g.font = 'italic 24px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i % 2 ? 'T' : 'H', x, y + 1); }
    border(g, C, R, 'rgba(110,80,30,.85)', ['n', '=', '1', '0', '·', 'p', '=', '½', '·', 'μ', '=', 'n', 'p', '·', 'σ', '²', '=', 'n', 'p', 'q', '·'], 'italic 28px Georgia, serif');
  },
  botanical(g, W, r) {
    const C = W / 2, R = W / 2, bg = g.createRadialGradient(C, C, 0, C, C, R); bg.addColorStop(0, '#f6f3df'); bg.addColorStop(.7, '#d8e3bf'); bg.addColorStop(1, '#8aa36a'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
    // a sunflower head: n seeds at the golden angle (Vogel's model, r = c√n)
    const GA = Math.PI * (3 - Math.sqrt(5)); for (let n = 1; n < 900; n++) { const rr = 9.5 * Math.sqrt(n), a = n * GA; if (rr > R * .34) break; const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr, t = rr / (R * .34); g.fillStyle = `rgb(${110 + t * 90 | 0},${70 + t * 50 | 0},${30 + t * 10 | 0})`; g.beginPath(); g.arc(x, y, 4.2 + t * 1.5, 0, 7); g.fill(); }
    for (let k = 0; k < 34; k++) { const a = k * GA * 1.0 + k * .02; g.save(); g.translate(C, C); g.rotate(k / 34 * Math.PI * 2); g.fillStyle = 'rgba(232,184,60,.85)'; g.beginPath(); g.ellipse(0, -R * .42, 18, 52, 0, 0, 7); g.fill(); g.restore(); }
    // leaves with their venation, round the head
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + .15, d = R * .62; g.save(); g.translate(C + Math.cos(a) * d, C + Math.sin(a) * d); g.rotate(a + Math.PI / 2 + (r() - .5) * .4); const L = 95, Wd = 38;
      g.fillStyle = i % 2 ? 'rgba(84,124,58,.9)' : 'rgba(104,146,70,.9)'; g.beginPath(); g.moveTo(0, -L); g.quadraticCurveTo(Wd, 0, 0, L); g.quadraticCurveTo(-Wd, 0, 0, -L); g.fill();
      g.strokeStyle = 'rgba(230,240,200,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke(); g.lineWidth = 1.1; for (let k = -3; k <= 3; k++) { const y = k * 22; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(14, y - 10, Wd * .62 * (1 - Math.abs(k) / 5), y - 22); g.moveTo(0, y); g.quadraticCurveTo(-14, y - 10, -Wd * .62 * (1 - Math.abs(k) / 5), y - 22); g.stroke(); } g.restore(); }
    // cells, each with its nucleus, in the outer band
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, x = C + Math.cos(a) * R * .78, y = C + Math.sin(a) * R * .78, rr = 15 + r() * 6; g.fillStyle = 'rgba(214,236,196,.85)'; g.strokeStyle = 'rgba(70,100,50,.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, rr * 1.2, rr, a, 0, 7); g.fill(); g.stroke(); g.fillStyle = 'rgba(120,70,120,.7)'; g.beginPath(); g.arc(x + 3, y - 2, rr * .32, 0, 7); g.fill(); }
    border(g, C, R, 'rgba(70,96,46,.85)', null);
  },
};
// one dome painting (1024 px, round); seed varies the scatter between a room's domes
export function ceilingTex(theme, seed = 1) {
  const d = DRAW[theme]; if (!d) return null;
  return canvasTex('ceil-' + theme + seed, 1024, 1024, (g, W) => { const r = mulberry(400 + seed * 31 + theme.length * 7); g.fillStyle = '#efe4cf'; g.fillRect(0, 0, W, W); g.save(); g.translate(W, 0); g.scale(-1, 1); ring(g, W / 2, W / 2); d(g, W, r); g.restore(); g.restore();   /* mirrored: the dome is seen from below, so its lettering reads the right way round */
    const v = g.createRadialGradient(W / 2, W / 2, W * .36, W / 2, W / 2, W * .5); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,24,10,.28)'); g.fillStyle = v; g.fillRect(0, 0, W, W); });   /* the dome's edge in shadow, as a painted cupola is */
}
