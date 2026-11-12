// Motion figures: short, looping, code-drawn animations that show the event, process or transformation a "Picture it"
// or "Common mistake" paragraph describes (the paragraph's own words, played out). One declarative spec, drawn into
// SVG frame by frame from a single clock u ∈ [0, 1], so every frame can be scrubbed, paused and replayed, and the same
// spec gives the same picture every time (seeded randomness, simulations re-run from t = 0 when scrubbed backwards).
//
// Why animate, and how (docs/research/motion-figures.md):
//   - Animation beats a static picture when the change itself is the content (Höffler & Leutner 2007, meta-analysis,
//     larger for representational animations; Berney & Bétrancourt 2016). Decoration does not help, so nothing here is
//     ornamental: every moving mark stands for a quantity or an object the text names.
//   - Congruence and apprehension (Tversky, Morrison & Bétrancourt 2002): schematic, slow enough to follow, and showing
//     exactly the change in question; segmented into captioned beats (Mayer & Chandler 2001) under learner control
//     (pause, scrub, replay).
//   - Cueing (de Koning et al. 2009; Lowe 2003): the thematically relevant part moves or is coloured, never the merely
//     eye-catching one; invisible things are made visible (molecules, forces, fields), as PhET does (Podolefsky,
//     Perkins & Adams 2010).
//   - A misconception is shown as its own world beside the real one ("If the mistake were true" | "What happens"), so
//     the wrong prediction is seen failing, not only told (Chi 2005: robust misconceptions are wrong process models).
//
// SPEC  { w=160, h=90, dur (s; default from the paragraph's length), beats: [[u, caption]...], items: [...] }
//   or, for a contrast, { dur, beats, wrong: {items, w, h}, right: {items, w, h} } (two synchronised panels).
// ITEMS share: on: [u0, u1] (visible window, faded), k: [[u, {prop: value}]...] (keyframes, eased), and colours by
//   name (ink soft lapis rubric verd brass violet water sky sand mute) or hex.
//   shapes   line arrow (x y x2 y2 c sw dash draw) · circle (x y r c f) · rect (x y w h rx c f) · path (d c f draw) ·
//            poly (pts closed) · text (x y text fs a c it b) · arc (x y r a0 a1 c) · g (items tx ty rot sc ox oy)
//   makers   pend · gas · proj · along · curve · bars · num · galton · spring · lin · stamp · mover · dial
//            (each documented at its function below)
import { el, compile, svgMath } from '../util.js';

const NS = 'http://www.w3.org/2000/svg';
export const MC = { ink: '#2a1e15', soft: '#5b4532', lapis: '#2d5b8e', rubric: '#9c3a28', verd: '#3f7d6e', brass: '#8f733a', violet: '#6a4a8a', bg: '#fbf6ea', sky: '#dce7ef', water: '#8fb3d3', sand: '#e6d6b0', mute: '#b3a385', paper: '#f4ead2' };
const col = c => (c && MC[c]) || c || MC.ink;
let CID = 0;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = x => x * x * (3 - 2 * x);
const lerp = (a, b, s) => a + (b - a) * s;
const rng = seed => { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const fmtN = (v, dp = 0) => { const s = (+v).toFixed(dp); return s.replace('-', '−'); };

// ---- keyframes: a prop's value at u (numbers and arrays of numbers interpolate, eased per segment; others step)
function mix(a, b, s) { if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, s); if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((x, i) => mix(x, b[i], s)); return s < .5 ? a : b; }
function props(it, u) {
  const p = Object.assign({}, it); if (!Array.isArray(it.k) || !it.k.length) return p;
  const keys = new Set(); it.k.forEach(([, o]) => Object.keys(o || {}).forEach(k => keys.add(k)));
  keys.forEach(key => { let ks = it.k.filter(([, o]) => o && key in o).map(([q, o]) => [q, o[key]]); if (key in it && ks[0][0] > 0) ks = [[0, it[key]], ...ks]; p[key] = interp(ks, u, it.lin); });
  return p;
}
// a value from [[u, v]...] at u (eased between neighbours, held outside)
export function interp(ks, u, linear) { if (!ks.length) return undefined; if (u <= ks[0][0]) return ks[0][1]; const L = ks[ks.length - 1]; if (u >= L[0]) return L[1];
  let i = 0; while (i + 1 < ks.length && ks[i + 1][0] <= u) i++; const a = ks[i], b = ks[i + 1], s = clamp((u - a[0]) / (b[0] - a[0] || 1), 0, 1); return mix(a[1], b[1], linear ? s : ease(s)); }
const vis = (it, u) => { if (!it.on) return 1; const [a, b] = it.on, f = .035; if (u < a - f || u > b + f) return 0; return clamp(Math.min((u - a + f) / f, (b + f - u) / f), 0, 1); };

// ---- the drawing context
function ctx(svg, dur, fsk = 1) {
  const mk = (n, a, parent) => { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k]); (parent || C.g).append(e); return e; };
  const C = { svg, dur, g: null, mk,
    text(x, y, s, o = {}, parent) { const fz = (o.fs || 4.2) * fsk; const e = mk('text', { x, y, 'font-size': fz, fill: col(o.c), 'text-anchor': o.a || 'middle', 'font-style': o.it ? 'italic' : null, 'font-weight': o.b ? 700 : null, opacity: o.o, 'font-family': o.mono ? 'IBM Plex Mono, monospace' : 'Alegreya, Georgia, serif', 'paint-order': o.halo === false ? null : 'stroke', stroke: o.halo === false ? null : (o.halo || 'rgba(251,246,234,.85)'), 'stroke-width': o.halo === false ? null : fz * .28, transform: o.rot ? `rotate(${o.rot} ${x} ${y})` : null }, parent); try { svgMath(e, String(s)); } catch (x_) { e.textContent = String(s); } return e; },
    arrow(x, y, x2, y2, o = {}, parent) { const c = col(o.c), sw = o.sw || .8, L = Math.hypot(x2 - x, y2 - y); if (L < .01) return; const hl = Math.min(o.head || 2.6 * Math.max(1, sw), L * .6), ux = (x2 - x) / L, uy = (y2 - y) / L;
      mk('line', { x1: x, y1: y, x2: x2 - ux * hl * .7, y2: y2 - uy * hl * .7, stroke: c, 'stroke-width': sw, 'stroke-dasharray': o.dash, opacity: o.o, 'stroke-linecap': 'round' }, parent);
      mk('polygon', { points: `${x2},${y2} ${x2 - ux * hl - uy * hl * .45},${y2 - uy * hl + ux * hl * .45} ${x2 - ux * hl + uy * hl * .45},${y2 - uy * hl - ux * hl * .45}`, fill: c, opacity: o.o }, parent);
      if (o.label) C.text(x2 + (o.lx || 0) + ux * 3, y2 + (o.ly || 0) + uy * 3 + 1.4, o.label, { fs: o.fs || 3.6, c: o.c, it: o.it !== false }, parent); }
  };
  return C;
}

// ---- shapes
function shape(C, it, p, u) {
  const o = p.o != null ? p.o : 1, c = col(p.c), sw = p.sw != null ? p.sw : .7;
  switch (it.shape || it.s) {
    case 'line': case 'arrow': { let { x, y, x2, y2 } = p; const d = p.draw != null ? clamp(p.draw, 0, 1) : 1; if (d <= 0) return; x2 = lerp(x, x2, d); y2 = lerp(y, y2, d);
      if ((it.shape || it.s) === 'arrow') C.arrow(x, y, x2, y2, { c: p.c, sw, dash: p.dash, o, label: p.label, fs: p.fs, lx: p.lx, ly: p.ly, head: p.head });
      else C.mk('line', { x1: x, y1: y, x2, y2, stroke: c, 'stroke-width': sw, 'stroke-dasharray': p.dash, opacity: o, 'stroke-linecap': 'round' }); return; }
    case 'circle': C.mk('circle', { cx: p.x, cy: p.y, r: Math.max(0, p.r || 2), fill: p.f ? col(p.f) : 'none', stroke: p.c === 'none' ? null : c, 'stroke-width': sw, opacity: o, 'stroke-dasharray': p.dash, 'fill-opacity': p.fo }); return;
    case 'rect': C.mk('rect', { x: p.x, y: p.y, width: Math.max(0, p.w || 0), height: Math.max(0, p.h || 0), rx: p.rx || 0, fill: p.f ? col(p.f) : 'none', stroke: p.c === 'none' ? null : c, 'stroke-width': sw, opacity: o, 'fill-opacity': p.fo, 'stroke-dasharray': p.dash }); return;
    case 'path': { const e = C.mk('path', { d: p.d, fill: p.f ? col(p.f) : 'none', stroke: p.c === 'none' ? null : c, 'stroke-width': sw, opacity: o, 'fill-opacity': p.fo, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': p.dash });
      if (p.draw != null && p.draw < 1) { e.setAttribute('pathLength', 1); e.setAttribute('stroke-dasharray', '1 1'); e.setAttribute('stroke-dashoffset', 1 - clamp(p.draw, 0, 1)); } return; }
    case 'poly': { const P = p.pts || []; let d = ''; for (let i = 0; i + 1 < P.length; i += 2) d += (i ? 'L' : 'M') + (+P[i]).toFixed(2) + ' ' + (+P[i + 1]).toFixed(2); if (p.closed) d += 'Z'; shape(C, { shape: 'path' }, { ...p, d }, u); return; }
    case 'text': C.text(p.x, p.y, p.text, { fs: p.fs, c: p.c, a: p.a, it: p.it, b: p.b, o, mono: p.mono, rot: p.rot, halo: p.halo }); return;
    case 'arc': { const r = p.r || 5, a0 = (p.a0 || 0) * Math.PI / 180, a1 = (p.a1 || 0) * Math.PI / 180, x0 = p.x + r * Math.sin(a0), y0 = p.y + r * Math.cos(a0), x1 = p.x + r * Math.sin(a1), y1 = p.y + r * Math.cos(a1);
      C.mk('path', { d: `M${x0} ${y0}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 < a0 ? 1 : 0} ${x1} ${y1}`, fill: 'none', stroke: c, 'stroke-width': sw, opacity: o, 'stroke-dasharray': p.dash }); if (p.label) C.text(p.x + (r + 3) * Math.sin((a0 + a1) / 2), p.y + (r + 3) * Math.cos((a0 + a1) / 2) + 1.3, p.label, { fs: p.fs || 3.4, c: p.c, it: true }); return; }
    case 'g': { const g = C.mk('g', { transform: `translate(${p.tx || 0} ${p.ty || 0}) rotate(${p.rot || 0} ${p.ox || 0} ${p.oy || 0}) translate(${p.ox || 0} ${p.oy || 0}) scale(${p.sc == null ? 1 : p.sc}) translate(${-(p.ox || 0)} ${-(p.oy || 0)})`, opacity: o }); const keep = C.g; C.g = g; drawItems(C, it.items || [], u, it); C.g = keep; return; }
  }
}

// ---- makers (each returns nothing; draws at u; t = u · dur seconds)
const MAKERS = {
  // pend: {x, y pivot, L, a amplitude (deg), T period (s), ph, r, c, vec: ['W','T','Wt','v'], trail, mass label m}
  pend(C, p, u, it) { const t = u * C.dur, A = (p.a == null ? 30 : p.a) * Math.PI / 180, th = p.th != null ? p.th * Math.PI / 180 : A * Math.cos(2 * Math.PI * t / (p.T || 2) + (p.ph || 0)), L = p.L || 40;
    const bx = p.x + L * Math.sin(th), by = p.y + L * Math.cos(th), c = col(p.c || 'lapis');
    if (p.trail) { let d = ''; for (let i = 0; i <= 24; i++) { const tt = t - i * .04, a = A * Math.cos(2 * Math.PI * tt / (p.T || 2) + (p.ph || 0)); d += (i ? 'L' : 'M') + (p.x + L * Math.sin(a)).toFixed(2) + ' ' + (p.y + L * Math.cos(a)).toFixed(2); } C.mk('path', { d, fill: 'none', stroke: c, 'stroke-width': .5, opacity: .35 }); }
    if (p.hoop) C.mk('circle', { cx: p.x, cy: p.y, r: L, fill: 'none', stroke: MC.mute, 'stroke-width': .5, 'stroke-dasharray': '1.5 1.5' });
    C.mk('line', { x1: p.x, y1: p.y, x2: bx, y2: by, stroke: MC.soft, 'stroke-width': p.rod ? 1.1 : .55 }); C.mk('circle', { cx: p.x, cy: p.y, r: .9, fill: MC.ink });
    const r = p.r || 2.6; C.mk('circle', { cx: bx, cy: by, r, fill: c, stroke: MC.ink, 'stroke-width': .35 }); if (p.mlab) C.text(bx, by + 1.3, p.mlab, { fs: Math.min(3.4, r * 1.2), c: '#fff', halo: false, b: true });
    const V = p.vec || [], s = p.vs || 12, tx = Math.cos(th), ty = -Math.sin(th), w = -(p.T ? 2 * Math.PI / p.T : 3) * A * Math.sin(2 * Math.PI * t / (p.T || 2) + (p.ph || 0));
    if (V.includes('W')) C.arrow(bx, by, bx, by + s, { c: 'rubric', label: 'mg', sw: .6 });
    if (V.includes('T')) C.arrow(bx, by, bx + (p.x - bx) / L * s * Math.cos(th), by + (p.y - by) / L * s * Math.cos(th), { c: 'lapis', label: 'T', sw: .6 });
    if (V.includes('Wt')) { const f = -Math.sin(th) * s; C.arrow(bx, by, bx + tx * f, by + ty * f, { c: 'verd', label: 'mg sin θ', sw: .7 }); }
    if (V.includes('Tt')) { const dir = Math.sign(p.tdir || 1); C.arrow(bx, by, bx + tx * s * dir, by + ty * s * dir, { c: 'rubric', label: p.ttLab || 'T?', sw: .6, dash: '1.4 .8' }); }
    if (V.includes('Tb')) { const dx = p.x - bx, dy = p.y + L - by, d = Math.hypot(dx, dy); if (d > 1) C.arrow(bx, by, bx + dx / d * s * .8, by + dy / d * s * .8, { c: 'rubric', label: p.tbLab || 'T?', sw: .6, dash: '1.4 .8' }); }
    if (p.perp) { const a = 2.2, ux = (p.x - bx) / L, uy = (p.y - by) / L; C.mk('path', { d: `M${bx + ux * a} ${by + uy * a}l${tx * a} ${ty * a}l${-ux * a} ${-uy * a}`, fill: 'none', stroke: MC.ink, 'stroke-width': .35 }); }
    if (p.strobe && it) { for (let tt = 0; tt < t - 1e-6; tt += p.strobe) { const q = props(it, tt / C.dur), a = q.th != null ? q.th * Math.PI / 180 : A * Math.cos(2 * Math.PI * tt / (p.T || 2) + (p.ph || 0)); C.mk('circle', { cx: p.x + L * Math.sin(a), cy: p.y + L * Math.cos(a), r: r * .45, fill: c, opacity: .28 }); } }
    if (V.includes('v')) { const v = w * L * .08; if (Math.abs(v) > .4) C.arrow(bx, by, bx + tx * v, by + ty * v, { c: 'brass', label: 'v', sw: .6 }); }
    if (p.angle) { C.mk('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y + L * .45, stroke: MC.mute, 'stroke-width': .4, 'stroke-dasharray': '1 1' }); MAKERS_SHAPE(C, { shape: 'arc' }, { x: p.x, y: p.y, r: L * .3, a0: 0, a1: th * 180 / Math.PI, c: 'brass', label: Math.abs(th) > .12 ? 'θ' : '' }, u); }
  },
  // gas: particles in a box, seeded and simulated from t = 0. {box: [x,y,w,h], sp: [{n, c, r, v, side: 'L'|'R', pass, id}],
  //   wall: {x, c} a membrane only species with pass cross, vk: [[u, speed factor]], hits: flash where particles strike
  //   the walls, react: {a, b, to, p} (a pair that collides turns into `to` with probability p), seed, drift: [vx, vy]}
  gas(C, p, u, it) { const S = it._sim || (it._sim = { t: -1 }), t = u * C.dur, dt = 1 / 60, box = p.box;
    if (t < S.t || S.t < 0) { const R = rng(p.seed || 7); S.R = R; S.t = 0; S.P = []; S.hits = []; S.lr = 0; S.rl = 0;
      (p.sp || []).forEach((sp, si) => { for (let i = 0; i < (sp.n || 10); i++) { const half = sp.side && p.wall ? (sp.side === 'L' ? [box[0], p.wall.x] : [p.wall.x, box[0] + box[2]]) : [box[0], box[0] + box[2]], r = sp.r || 1.1, ang = R() * Math.PI * 2, v = (sp.v || 12) * (.6 + .8 * R());
        S.P.push({ x: lerp(half[0] + r, half[1] - r, R()), y: lerp(box[1] + r, box[1] + box[3] - r, R()), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r, si, c: sp.c, pass: !!sp.pass, id: sp.id || si }); } }); }
    while (S.t < t - 1e-9) { const uu = S.t / C.dur, f = it.vk ? props({ k: it.vk.map(([q, v]) => [q, { v }]) }, uu).v : 1, b = it.k ? props(it, uu).box : box, wx = p.wall ? (it.k ? props(it, uu).wall || p.wall : p.wall).x : null;
      for (const q of S.P) { q.x += (q.vx * f + (p.drift ? p.drift[0] : 0)) * dt; q.y += (q.vy * f + (p.drift ? p.drift[1] : 0)) * dt;
        if (q.x < b[0] + q.r) { q.x = b[0] + q.r; q.vx = Math.abs(q.vx); S.hits.push([S.t, q.x - q.r, q.y]); }
        if (q.x > b[0] + b[2] - q.r) { q.x = b[0] + b[2] - q.r; q.vx = -Math.abs(q.vx); S.hits.push([S.t, q.x + q.r, q.y]); }
        if (q.y < b[1] + q.r) { q.y = b[1] + q.r; q.vy = Math.abs(q.vy); S.hits.push([S.t, q.x, q.y - q.r]); }
        if (q.y > b[1] + b[3] - q.r) { q.y = b[1] + b[3] - q.r; q.vy = -Math.abs(q.vy); S.hits.push([S.t, q.x, q.y + q.r]); }
        if (wx != null) { const px = q.x - q.vx * f * dt, crossed = (px - wx) * (q.x - wx) < 0; const fast = p.wall.vmin && Math.hypot(q.vx, q.vy) * f > p.wall.vmin;
          if (!q.pass && !fast) { if (crossed || Math.abs(q.x - wx) < q.r) { q.x = px < wx ? wx - q.r - .01 : wx + q.r + .01; q.vx = -q.vx; } }
          else if (crossed) { if (px < wx) S.lr++; else S.rl++; if (fast && p.wall.mark) q.c = p.wall.mark; S.hits.push([S.t, wx, q.y, 3]); } } }
      { const cv = it.k ? props(it, uu).conv : p.conv; if (cv) for (const q of S.P) { const k = q.id === cv.a ? cv.kf : q.id === cv.b ? cv.kr : 0; if (k && S.R() < k * dt) { const to = q.id === cv.a ? cv.b : cv.a; q.id = to; q.c = to === cv.b ? (cv.cb || 'verd') : (cv.ca || 'lapis'); S.hits.push([S.t, q.x, q.y, 2]); } } }
      if (p.react || p.collide) for (let i = 0; i < S.P.length; i++) for (let j = i + 1; j < S.P.length; j++) { const a = S.P[i], b2 = S.P[j], dx = b2.x - a.x, dy = b2.y - a.y, d = Math.hypot(dx, dy); if (d > a.r + b2.r || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d, rv = (b2.vx - a.vx) * nx + (b2.vy - a.vy) * ny; if (rv >= 0) continue; a.vx += rv * nx; a.vy += rv * ny; b2.vx -= rv * nx; b2.vy -= rv * ny;
        S.hits.push([S.t, (a.x + b2.x) / 2, (a.y + b2.y) / 2, 1]);
        const X = p.react; if (X && ((a.id === X.a && b2.id === X.b) || (a.id === X.b && b2.id === X.a)) && S.R() < (X.p == null ? 1 : X.p)) { a.id = X.to; a.c = X.c || 'verd'; b2.id = X.to; b2.c = X.c || 'verd'; S.hits.push([S.t, (a.x + b2.x) / 2, (a.y + b2.y) / 2, 2]); } }
      S.t += dt; }
    const b = p.box;
    if (p.frame !== false) C.mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], fill: p.f ? col(p.f) : 'none', 'fill-opacity': p.fo, stroke: MC.soft, 'stroke-width': .6, rx: .6 });
    if (p.wall) C.mk('line', { x1: p.wall.x, x2: p.wall.x, y1: b[1], y2: b[1] + b[3], stroke: col(p.wall.c || 'brass'), 'stroke-width': .9, 'stroke-dasharray': '2.2 1.1' });
    if (p.hits) S.hits.filter(h => t - h[0] < .25 && (h[3] === 1 ? p.hits === 'all' : h[3] === 3 ? p.hits === 'all' || p.hits === 'wall' : true)).forEach(h => C.mk('circle', { cx: h[1], cy: h[2], r: h[3] === 2 ? 3.2 : 1.6 + (t - h[0]) * 6, fill: 'none', stroke: h[3] === 2 ? MC.verd : h[3] === 3 ? MC.brass : MC.rubric, 'stroke-width': .4, opacity: 1 - (t - h[0]) / .25 }));
    for (const q of S.P) C.mk('circle', { cx: q.x.toFixed(2), cy: q.y.toFixed(2), r: q.r, fill: col(q.c || 'lapis'), stroke: 'rgba(42,30,21,.45)', 'stroke-width': .2 });
    if (p.count) p.count.forEach(([id, x, y, lab]) => C.text(x, y, (lab || id) + ' ' + S.P.filter(q => q.id === id).length, { fs: 3.4, mono: true, c: 'ink' }));
    if (p.rate) { const W = Math.min(p.rateW || 3, Math.max(t, .5)), n = Math.round(S.hits.filter(h => !h[3] && t - h[0] < W && t - h[0] >= 0).length / W); C.text(p.rate[0], p.rate[1], (p.rate[2] || 'wall hits per second: ') + n, { fs: 3.3, mono: true, c: 'ink' }); }
    if (p.cross) C.text(p.cross[0], p.cross[1], '→ ' + S.lr + '   ← ' + S.rl, { fs: 3.3, mono: true, c: 'ink' });
    if (S.hits.length > 4000) S.hits.splice(0, 2000);
  },
  // proj: a thrown body. {x, y launch, vx, vy (units/s), gy (down, units/s²), u0, u1 (flight window), dots (strobe s),
  //   trail, r, c, aim (dashed line along the launch direction), vec: show vx/vy arrows, floor (y of the ground)}
  proj(C, p, u) { const u0 = p.u0 || 0, u1 = p.u1 == null ? 1 : p.u1, T = (clamp(u, u0, u1) - u0) * C.dur, g = p.gy == null ? 20 : p.gy, P = tt => { let x = p.x + p.vx * tt, y = p.y - p.vy * tt + .5 * g * tt * tt; if (p.floor != null && y > p.floor) y = p.floor; return [x, y]; };
    if (p.aim) { const L = 200; C.mk('line', { x1: p.x, y1: p.y, x2: p.x + p.vx / Math.hypot(p.vx, p.vy) * L, y2: p.y - p.vy / Math.hypot(p.vx, p.vy) * L, stroke: MC.mute, 'stroke-width': .45, 'stroke-dasharray': '1.5 1.2' }); }
    if (p.trail !== false) { let d = ''; for (let i = 0; i <= 40; i++) { const [x, y] = P(T * i / 40); d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2); } C.mk('path', { d, fill: 'none', stroke: col(p.c || 'lapis'), 'stroke-width': .5, opacity: .5, 'stroke-dasharray': '1 1' }); }
    if (p.dots) for (let tt = p.dots; tt < T; tt += p.dots) { const [x, y] = P(tt); C.mk('circle', { cx: x, cy: y, r: (p.r || 2) * .55, fill: col(p.c || 'lapis'), opacity: .3 }); if (p.drop) { const [ax, ay] = [p.x + p.vx * tt, p.y - p.vy * tt]; C.mk('line', { x1: ax, y1: ay, x2: x, y2: y, stroke: MC.rubric, 'stroke-width': .45, opacity: .7 }); } }
    const [x, y] = P(T); C.mk('circle', { cx: x, cy: y, r: p.r || 2, fill: col(p.c || 'lapis'), stroke: MC.ink, 'stroke-width': .3 });
    if (p.vec && T < (u1 - u0) * C.dur - .01) { const vy = p.vy - g * T, s = p.vs || .25; C.arrow(x, y, x + p.vx * s, y, { c: 'verd', sw: .6, label: p.vec === true ? 'vₓ' : '' }); C.arrow(x, y, x, y - vy * s, { c: 'rubric', sw: .6, label: p.vec === true ? 'v_y' : '' }); }
    if (p.label) C.text(x, y - (p.r || 2) - 2, p.label, { fs: 3.4 });
  },
  // along: dots streaming along a path or polyline. {d | pts, n, r, c, u0, u1, loop: seconds per lap, gap (fraction)}
  along(C, p, u, it) { if (!it._path) { const pa = document.createElementNS(NS, 'path'); pa.setAttribute('d', p.d || ('M' + (p.pts || []).reduce((s, v, i) => s + (i % 2 ? ' ' : i ? 'L' : '') + v, ''))); it._path = pa; it._len = 0; }
    const pa = it._path; if (!it._len) { try { it._len = pa.getTotalLength(); } catch (e) { it._len = 0; } if (!it._len) { C.svg.append(pa); pa.style.visibility = 'hidden'; try { it._len = pa.getTotalLength(); } catch (e) { it._len = 0; } pa.remove(); } }
    if (!it._len) return; const u0 = p.u0 || 0, u1 = p.u1 == null ? 1 : p.u1; if (u < u0) return; const n = p.n || 1, lap = p.loop || (u1 - u0) * C.dur, t = (Math.min(u, u1) - u0) * C.dur;
    if (p.show) C.mk('path', { d: pa.getAttribute('d'), fill: 'none', stroke: col(p.show === true ? 'mute' : p.show), 'stroke-width': .5, 'stroke-dasharray': '1.4 1' });
    for (let i = 0; i < n; i++) { let s = t / lap - i * (p.gap || 1 / n); if (p.loop) s = ((s % 1) + 1) % 1; else if (s < 0 || s > 1) continue; const q = pa.getPointAtLength(s * it._len); C.mk('circle', { cx: q.x, cy: q.y, r: p.r || 1, fill: col(p.c || 'lapis'), opacity: p.o == null ? 1 : p.o }); }
  },
  // curve: y = f(x, p, t) in a box. {box: [x,y,w,h], xr, yr, f, p (keyframable), c, sw, draw (0..1 of the x range drawn),
  //   axes, xl, yl, area: signed shading to y = 0, dot: x (keyframable via k {dx}), tan: tangent at the dot, lab, ticks}
  curve(C, p, u, it) { const [bx, by, bw, bh] = p.box, xr = p.xr || [0, 1], yr = p.yr || [0, 1], X = x => bx + (x - xr[0]) / (xr[1] - xr[0]) * bw, Y = y => by + bh - (y - yr[0]) / (yr[1] - yr[0]) * bh;
    const f = (it._fs === p.f && it._f) || (it._fs = p.f, it._f = compile(p.f || '0', ['x', 'p', 't'])), t = u * C.dur, F = x => f(x, p.p == null ? 1 : p.p, t);
    if (p.axes !== false) { C.mk('line', { x1: bx, x2: bx + bw, y1: Y(clamp(0, yr[0], yr[1])), y2: Y(clamp(0, yr[0], yr[1])), stroke: MC.soft, 'stroke-width': .45 }); C.mk('line', { x1: X(clamp(0, xr[0], xr[1])), x2: X(clamp(0, xr[0], xr[1])), y1: by, y2: by + bh, stroke: MC.soft, 'stroke-width': .45 });
      if (p.xl) C.text(bx + bw, Y(clamp(0, yr[0], yr[1])) + 4.4, p.xl, { fs: 3.3, a: 'end', it: true, c: 'soft' }); if (p.yl) C.text(X(clamp(0, xr[0], xr[1])) + 1.2, by + 3, p.yl, { fs: 3.3, a: 'start', it: true, c: 'soft' }); }
    const dr = p.draw == null ? 1 : clamp(p.draw, 0, 1), N = 160; let d = '', pen = false, area = [];
    for (let i = 0; i <= N * dr; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / N, y = F(x); if (!isFinite(y)) { pen = false; continue; } const yy = clamp(Y(y), by - bh * .3, by + bh * 1.3); d += (pen ? 'L' : 'M') + X(x).toFixed(2) + ' ' + yy.toFixed(2); pen = true; if (p.afrom == null || x >= p.afrom) area.push([X(x), yy, y]); }
    let G = C.g; if (p.clip !== false) { const id = it._cid || (it._cid = 'moc' + (++CID)), cp = C.mk('clipPath', { id }); C.mk('rect', { x: bx - .5, y: by - .5, width: bw + 1, height: bh + 1 }, cp); G = C.mk('g', { 'clip-path': `url(#${id})` }); }
    if (p.area && area.length > 1) { const z = Y(0); for (const sgn of [1, -1]) { let a = ''; area.forEach(([x, y, v], i) => { a += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + (sgn * v > 0 ? y : z).toFixed(2); }); a += `L${area[area.length - 1][0]} ${z}L${area[0][0]} ${z}Z`; C.mk('path', { d: a, fill: sgn > 0 ? MC.verd : MC.rubric, opacity: .22 }, G); } }
    C.mk('path', { d, fill: 'none', stroke: col(p.c || 'lapis'), 'stroke-width': p.sw || .9, 'stroke-dasharray': p.dash }, G);
    if (p.lab && area.length) { const L = area[area.length - 1]; C.text(L[0] + (p.lx || 1), L[1] + (p.ly || 0), p.lab, { fs: 3.4, a: 'start', c: p.c || 'lapis', it: true }); }
    if (p.dot != null) { const x = p.dot, y = F(x); C.mk('circle', { cx: X(x), cy: Y(y), r: 1.2, fill: col(p.dc || 'rubric') });
      if (p.tan) { const h = 1e-4 * (xr[1] - xr[0]), m = (F(x + h) - F(x - h)) / (2 * h), w = (xr[1] - xr[0]) * (p.tl || .3); C.mk('line', { x1: X(x - w), y1: Y(y - m * w), x2: X(x + w), y2: Y(y + m * w), stroke: col('rubric'), 'stroke-width': .6 }); if (p.tan === 'lab') C.text(X(x + w), Y(y + m * w) - 1.5, 'slope ' + fmtN(m, 2), { fs: 3.2, c: 'rubric' }); }
      if (p.drop) { C.mk('line', { x1: X(x), x2: X(x), y1: Y(y), y2: Y(clamp(0, yr[0], yr[1])), stroke: MC.mute, 'stroke-width': .4, 'stroke-dasharray': '1 1' }); } }
  },
  // bars: {box, v: values (keyframable), max, labels, c (one or per bar), lvl: a horizontal level (keyframable) — bars
  //   reaching above it are marked (above) and those below are dimmed (or the reverse with below: true), vl: show values,
  //   dp, unit, lvlLab}
  bars(C, p) { const [bx, by, bw, bh] = p.box, V = p.v || [], n = V.length, mx = p.max || Math.max(...V, 1e-9), gw = bw / n, Y = v => by + bh - clamp(v / mx, 0, 1.05) * bh;
    C.mk('line', { x1: bx, x2: bx + bw, y1: by + bh, y2: by + bh, stroke: MC.soft, 'stroke-width': .45 });
    V.forEach((v, i) => { const x = bx + i * gw + gw * .14, w = gw * .72, on = p.lvl == null ? true : (p.below ? v <= p.lvl : v >= p.lvl), c = Array.isArray(p.c) ? p.c[i % p.c.length] : p.c || 'lapis';
      C.mk('rect', { x, y: Y(v), width: w, height: by + bh - Y(v), fill: col(on ? c : 'mute'), opacity: on ? .85 : .45, rx: .4 });
      if (p.vl) C.text(x + w / 2, Y(v) - 1.2, fmtN(v, p.dp || 0) + (p.unit || ''), { fs: 3, c: 'ink', mono: true });
      if (p.labels && p.labels[i] != null) C.text(x + w / 2, by + bh + 3.8, p.labels[i], { fs: 3, c: 'soft' }); });
    if (p.yl) C.text(bx, by - 2.5, p.yl, { fs: 3.1, a: 'start', c: 'soft', it: true }); if (p.xl) C.text(bx + bw, by + bh + (p.labels ? 8 : 4.5), p.xl, { fs: 3.1, a: 'end', c: 'soft', it: true });   /* axis titles: quantity (unit), once */
    if (p.lvl != null) { const y = Y(p.lvl); C.mk('rect', { x: bx, y: p.below ? by : y, width: bw, height: p.below ? y - by : by + bh - y, fill: MC.water, opacity: p.water === false ? 0 : .22 }); C.mk('line', { x1: bx - 1, x2: bx + bw + 1, y1: y, y2: y, stroke: col(p.lc || 'brass'), 'stroke-width': .8 }); if (p.lvlLab) C.text(bx + bw + 1.5, y + 1.2, p.lvlLab.replace('{v}', fmtN(p.lvl, p.dp || 0)), { fs: 3.3, a: 'start', c: p.lc || 'brass' }); }
  },
  // num: a counter. {x, y, v (keyframable), dp, pre, suf, fs, c, a, b}
  num(C, p) { C.text(p.x, p.y, (p.pre || '') + fmtN(p.v, p.dp || 0) + (p.suf || ''), { fs: p.fs || 4, c: p.c, a: p.a, b: p.b, mono: p.mono !== false }); },
  // galton: beads dropping through pegs into bins. {box, rows, n, p, u0, u1 (emission window), steer (wrong world:
  //   beads pulled to the centre), hl: index of a bead to draw larger with its path, bins: show counts}
  galton(C, p, u, it) { const [bx, by, bw, bh] = p.box, rows = p.rows || 8, n = p.n || 60, R = rng(p.seed || 3), pr = p.p == null ? .5 : p.p;
    if (!it._paths) { it._paths = []; for (let i = 0; i < n; i++) { const s = []; let k = 0; for (let r = 0; r < rows; r++) { let right = R() < pr; if (p.due) { let run = 0; for (let j = r - 1; j >= 0 && s[j]; j--) run++; if (run >= 2) right = false; } if (p.steer) right = k < r / 2 ? true : k > r / 2 ? false : R() < .5; s.push(right); if (right) k++; } it._paths.push({ s, k }); } }
    const pegH = bh * .55, dy = pegH / rows, dx = bw / (rows + 2), cx = bx + bw / 2, binY = by + pegH + dy, binH = bh - pegH - dy, u0 = p.u0 || 0, u1 = p.u1 == null ? .85 : p.u1, fall = (p.fall || .9) / C.dur;
    for (let r = 0; r < rows; r++) for (let j = 0; j <= r; j++) C.mk('circle', { cx: cx + (j - r / 2) * dx, cy: by + (r + 1) * dy, r: .55, fill: MC.soft });
    for (let k = 0; k <= rows + 1; k++) C.mk('line', { x1: cx + (k - (rows + 1) / 2) * dx, x2: cx + (k - (rows + 1) / 2) * dx, y1: binY, y2: by + bh, stroke: MC.mute, 'stroke-width': .35 });
    const counts = new Array(rows + 1).fill(0), br = Math.min(dx * .32, 1.3), per = Math.max(1, Math.floor(dx / (br * 2)));
    it._paths.forEach((b, i) => { const ts = u0 + (u1 - u0) * i / n; if (u < ts) return; const q = (u - ts) / fall;
      if (q >= 1) { const c = counts[b.k]++, x = cx + (b.k - rows / 2) * dx + ((c % per) - (per - 1) / 2) * br * 2, y = by + bh - br - Math.floor(c / per) * br * 2; C.mk('circle', { cx: x, cy: Math.max(binY + br, y), r: br, fill: col(i === p.hl ? 'rubric' : p.c || 'lapis') }); return; }
      const rf = q * (rows + 1), r = Math.floor(rf), fr = rf - r; let k = 0; for (let j = 0; j < Math.min(r, rows); j++) k += b.s[j] ? 1 : 0; const kx = r < rows ? (k + (b.s[r] ? fr : 0)) - Math.min(r + fr, rows) / 2 : b.k - rows / 2;
      C.mk('circle', { cx: cx + kx * dx, cy: by + rf * dy, r: i === p.hl ? br * 1.4 : br, fill: col(i === p.hl ? 'rubric' : p.c || 'lapis') }); });
    if (p.flips && it._paths[p.hl || 0]) { const b = it._paths[p.hl || 0], ts = u0 + (u1 - u0) * (p.hl || 0) / n, q = (u - ts) / fall; let k = 0; for (let r = 0; r < rows && r < q * (rows + 1); r++) { C.text(cx + (k - r / 2) * dx + (b.s[r] ? 2.2 : -2.2), by + (r + 1) * dy - .8, b.s[r] ? 'R' : 'L', { fs: 2.6, c: 'rubric', b: true }); k += b.s[r] ? 1 : 0; } }
    if (p.share != null) { const tot = counts.reduce((a, b) => a + b, 0); C.text(p.shareX == null ? bx + bw : p.shareX, p.shareY == null ? by + 4 : p.shareY, (p.shareLab || 'centre bin') + ': ' + (tot ? Math.round(counts[p.share] / tot * 100) : 0) + ' % of ' + tot, { fs: 3.3, a: 'end', mono: true, c: 'ink' }); }
    if (p.bins) counts.forEach((c, k) => C.text(cx + (k - rows / 2) * dx, binY - 1, c, { fs: 2.6, c: 'soft', mono: true }));
    it._counts = counts;
  },
  // spring: a coil between two points. {x, y, x2, y2, coils, w, c}
  spring(C, p) { const n = p.coils || 8, L = Math.hypot(p.x2 - p.x, p.y2 - p.y), ux = (p.x2 - p.x) / L, uy = (p.y2 - p.y) / L, w = p.w || 2.2; let d = `M${p.x} ${p.y}`;
    for (let i = 1; i < n * 2; i++) { const s = i / (n * 2), side = i % 2 ? 1 : -1; d += `L${(p.x + ux * L * s - uy * w * side).toFixed(2)} ${(p.y + uy * L * s + ux * w * side).toFixed(2)}`; } d += `L${p.x2} ${p.y2}`; C.mk('path', { d, fill: 'none', stroke: col(p.c || 'soft'), 'stroke-width': .6 }); },
  // lin: a linear map acting on a grid. {x, y (origin on screen), s (pixels per unit), M: [a, b, c, d] (keyframable;
  //   columns (a, c) and (b, d)), shift: [e, f] (affine part), n (grid half-size), area: label the unit square's area}
  lin(C, p) { const [a, b, c, d] = p.M || [1, 0, 0, 1], [e, f] = p.shift || [0, 0], s = p.s || 8, n = p.n || 4, T = (x, y) => [p.x + (a * x + b * y + e) * s, p.y - (c * x + d * y + f) * s];
    for (let i = -n; i <= n; i++) { const [x1, y1] = T(i, -n), [x2, y2] = T(i, n), [x3, y3] = T(-n, i), [x4, y4] = T(n, i); C.mk('line', { x1, y1, x2, y2, stroke: i ? MC.mute : MC.soft, 'stroke-width': i ? .3 : .55 }); C.mk('line', { x1: x3, y1: y3, x2: x4, y2: y4, stroke: i ? MC.mute : MC.soft, 'stroke-width': i ? .3 : .55 }); }
    const q = [T(0, 0), T(1, 0), T(1, 1), T(0, 1)]; C.mk('path', { d: 'M' + q.map(v => v.map(z => z.toFixed(2)).join(' ')).join('L') + 'Z', fill: MC.brass, opacity: .35, stroke: MC.brass, 'stroke-width': .5 });
    const [ox, oy] = T(0, 0); C.arrow(ox, oy, ...T(1, 0), { c: 'rubric', sw: .7, label: p.labels === false ? '' : 'î' }); C.arrow(ox, oy, ...T(0, 1), { c: 'lapis', sw: .7, label: p.labels === false ? '' : 'ĵ' });
    if (p.area) { const [cx, cy] = T(.5, .5); C.text(cx, cy + 1.2, 'area ' + fmtN(a * d - b * c, 1), { fs: 3.2, c: 'ink', b: true }); }
    if (p.origin) C.mk('circle', { cx: p.x, cy: p.y, r: .9, fill: 'none', stroke: MC.rubric, 'stroke-width': .5 });
  },
  // stamp: a verdict that lands at u0. {x, y, text, c, u0, rot}
  stamp(C, p, u) { const u0 = p.u0 == null ? .8 : p.u0; if (u < u0) return; const s = clamp((u - u0) * C.dur / .25, 0, 1), sc = 1 + (1 - s) * .6; const g = C.mk('g', { transform: `translate(${p.x} ${p.y}) rotate(${p.rot == null ? -8 : p.rot}) scale(${sc})`, opacity: s });
    const w = String(p.text).length * (p.fs || 4) * .55 + 5; C.mk('rect', { x: -w / 2, y: -(p.fs || 4) * .95, width: w, height: (p.fs || 4) * 1.6, rx: 1, fill: 'rgba(251,246,234,.9)', stroke: col(p.c || 'rubric'), 'stroke-width': .7 }, g); C.text(0, (p.fs || 4) * .35, p.text, { fs: p.fs || 4, c: p.c || 'rubric', b: true, halo: false }, g); },
  // mover: a body whose position is an expression of t (s) and u. {x, y: expressions, r, c, trail (s), lab, f}
  mover(C, p, u, it) { const fx = it._fx || (it._fx = compile(String(p.x), ['t', 'u'])), fy = it._fy || (it._fy = compile(String(p.y), ['t', 'u'])), t = u * C.dur;
    if (p.trail) { let d = ''; for (let i = 0; i <= 30; i++) { const tt = Math.max(0, t - p.trail * i / 30); d += (i ? 'L' : 'M') + fx(tt, tt / C.dur).toFixed(2) + ' ' + fy(tt, tt / C.dur).toFixed(2); } C.mk('path', { d, fill: 'none', stroke: col(p.c || 'lapis'), 'stroke-width': .5, opacity: .45 }); }
    const x = fx(t, u), y = fy(t, u);
    if (p.ring) C.mk('circle', { cx: x, cy: y, r: p.ring, fill: 'none', stroke: MC.mute, 'stroke-width': .4 });
    if (p.link) { const lx = it._lx || (it._lx = compile(String(p.link[0]), ['t', 'u'])), ly = it._ly || (it._ly = compile(String(p.link[1]), ['t', 'u'])); C.mk('line', { x1: lx(t, u), y1: ly(t, u), x2: x, y2: y, stroke: col(p.lc || 'soft'), 'stroke-width': .5 }); }
    if (p.dotless) return; C.mk('circle', { cx: x, cy: y, r: p.r || 1.6, fill: col(p.f || p.c || 'lapis'), stroke: MC.ink, 'stroke-width': .25 }); if (p.lab) C.text(x + (p.lx || 0), y - (p.r || 1.6) - 1.4 + (p.ly || 0), p.lab, { fs: 3.2 }); },
  // dial: a gauge. {x, y, r, v (keyframable), min, max, a0, a1 (deg of the scale ends), marks: [[value, label]], c}
  dial(C, p) { const a = v => ((p.a0 == null ? -120 : p.a0) + ((v - p.min) / (p.max - p.min)) * ((p.a1 == null ? 120 : p.a1) - (p.a0 == null ? -120 : p.a0))) * Math.PI / 180, r = p.r || 10;
    C.mk('circle', { cx: p.x, cy: p.y, r, fill: MC.paper, stroke: MC.soft, 'stroke-width': .6 }); (p.marks || []).forEach(([v, l]) => { const q = a(v); C.mk('line', { x1: p.x + Math.sin(q) * r * .82, y1: p.y - Math.cos(q) * r * .82, x2: p.x + Math.sin(q) * r, y2: p.y - Math.cos(q) * r, stroke: MC.soft, 'stroke-width': .4 }); if (l) C.text(p.x + Math.sin(q) * r * .62, p.y - Math.cos(q) * r * .62 + 1, l, { fs: Math.min(2.8, r * .2), c: 'soft' }); });
    const q = a(p.v); C.mk('line', { x1: p.x, y1: p.y, x2: p.x + Math.sin(q) * r * .85, y2: p.y - Math.cos(q) * r * .85, stroke: col(p.c || 'rubric'), 'stroke-width': .8, 'stroke-linecap': 'round' }); C.mk('circle', { cx: p.x, cy: p.y, r: .9, fill: MC.ink }); }
};
function MAKERS_SHAPE(C, it, p, u) { shape(C, it, p, u); }

function drawItems(C, items, u) {
  for (const it of items) { if (!it) continue; const v = vis(it, u); if (v <= 0) continue; const p = props(it, u); if (v < 1) p.o = (p.o == null ? 1 : p.o) * v;
    if (it.m && MAKERS[it.m]) { const keep = C.g; if (p.o != null && p.o < 1) { C.g = C.mk('g', { opacity: p.o }); } try { MAKERS[it.m](C, p, u, it); } catch (e) { /* a broken maker draws nothing; the rest still plays */ } C.g = keep; }
    else shape(C, it, p, u); }
}

// for tools/test-motion.mjs: draw a list of items at u into a stand-in svg and count the marks (makers swallow their own errors in the player, so the test calls them directly)
export function MAKERS_FOR_TEST(items, u, dur) { const svg = document.createElementNS(NS, 'svg'), C = ctx(svg, dur); C.g = svg; let err = null;
  const walk = (L, uu) => { for (const it of L) { if (!it) continue; const p = props(it, uu); try { if (it.m) { if (!MAKERS[it.m]) throw new Error('unknown maker ' + it.m); MAKERS[it.m](C, p, uu, it); } else if ((it.shape || it.s) === 'g') walk(it.items || [], uu); else shape(C, it, p, uu); } catch (e) { err = err || ((it.m || it.s) + ': ' + e.message); } } };
  walk(items || [], u); const count = e => (e.children || []).reduce((a, c) => a + 1 + count(c), 0); return { error: err, marks: count(svg) }; }

// ---- spec helpers
export function motionDur(spec, text) { if (spec && spec.dur) return clamp(+spec.dur, 3, 40); const w = String(text || '').split(/\s+/).filter(Boolean).length; return clamp(4 + w * .32, 6, 22); }   // about the time the paragraph takes to read, plus a beat to watch
export function hasMotion(spec) { return !!(spec && ((Array.isArray(spec.items) && spec.items.length) || (spec.wrong && spec.right))); }
// a light check for specs written by the AI pipeline (js/ai/prompts.js): known makers/shapes, finite numbers, at most 80 items
export function motionIssues(spec, { max = 80 } = {}) {
  const out = []; if (!spec || typeof spec !== 'object') return ['not an object'];
  const lists = spec.wrong || spec.right ? [['wrong', spec.wrong && spec.wrong.items], ['right', spec.right && spec.right.items]] : [['items', spec.items]];
  const SH = ['line', 'arrow', 'circle', 'rect', 'path', 'poly', 'text', 'arc', 'g'];
  const walk = (L, where) => { if (!Array.isArray(L) || !L.length) { out.push(where + ': no items'); return; } if (L.length > max) out.push(where + ': more than ' + max + ' items');
    L.forEach((it, i) => { if (!it || typeof it !== 'object') { out.push(where + '[' + i + ']: not an object'); return; } if (it.m ? !MAKERS[it.m] : !SH.includes(it.shape || it.s)) out.push(where + '[' + i + ']: unknown ' + (it.m ? 'maker ' + it.m : 'shape ' + (it.shape || it.s)));
      if (it.f && it.m === 'curve') { try { compile(it.f, ['x', 'p', 't']); } catch (e) { out.push(where + '[' + i + ']: ' + e.message); } }
      if (it.m === 'mover') ['x', 'y'].forEach(k => { try { compile(String(it[k]), ['t', 'u']); } catch (e) { out.push(where + '[' + i + ']: ' + e.message); } });
      if (it.shape === 'g' || it.s === 'g') walk(it.items, where + '[' + i + ']'); }); };
  lists.forEach(([w, L]) => walk(L, w)); if (spec.beats && !Array.isArray(spec.beats)) out.push('beats: not a list'); return out;
}

// ---- the player: one clock, one or two stages, a caption line under them, and controls
// opts: {text (the paragraph, for the default length), calm (no autoplay), label}
export function renderMotion(spec, host, opts = {}) {
  const dur = motionDur(spec, opts.text), panels = spec.wrong && spec.right ? [['wrong', spec.wrong, 'If the mistake were true', 'rubric'], ['right', spec.right, 'What actually happens', 'verd']] : [['one', spec, null, null]];
  const wrap = el('figure', { class: 'motion' + (panels.length > 1 ? ' pair' : ''), role: 'group', 'aria-label': (opts.label || 'Animation') + (spec.alt ? ': ' + spec.alt : '') });
  const stages = panels.map(([key, P, title, tone]) => { const w = P.w || (panels.length > 1 ? 100 : 160), h = P.h || (panels.length > 1 ? 72 : 90), svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('class', 'mo-svg'); svg.setAttribute('aria-hidden', 'true');
    const box = el('div', { class: 'mo-stage' + (tone ? ' ' + key : '') }, [title ? el('div', { class: 'mo-title', text: (key === 'wrong' ? '✗ ' : '✓ ') + title }) : null, svg]); return { svg, P, box, C: ctx(svg, dur, P.fsk || (panels.length > 1 ? 1.4 : 1.12)) }; });
  const cap = el('figcaption', { class: 'mo-cap', 'aria-live': 'polite' }), beats = (Array.isArray(spec.beats) ? spec.beats : []).filter(b => Array.isArray(b) && b[1]).sort((a, b) => a[0] - b[0]);
  const playB = el('button', { class: 'mo-btn', type: 'button', 'aria-label': 'Pause', title: 'Pause', text: '❚❚' }), scrub = el('input', { class: 'mo-scrub', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Position in the animation' }), again = el('button', { class: 'mo-btn', type: 'button', 'aria-label': 'Play from the start', title: 'From the start', text: '↺' });
  const gifB = el('button', { class: 'mo-btn mo-gif', type: 'button', title: 'Save this animation as a GIF', text: 'GIF' });
  // sonification: the quantity that changes is also heard (an auditory graph): a tone whose pitch follows a counter or a
  // curve being drawn, or a click for every wall hit of a gas, so a rise in pressure is a denser crackle
  const SP = spec.wrong ? spec.right : spec, srcN = (SP.items || []).find(it => it && it.m === 'num' && Array.isArray(it.k) && it.k.length > 1), srcC = !srcN && (SP.items || []).find(it => it && it.m === 'curve' && Array.isArray(it.k) && it.k.some(f => f[1] && 'draw' in f[1])), srcG = !srcN && !srcC && (SP.items || []).find(it => it && it.m === 'gas' && it.hits);
  const sonic = false ? (() => {   /* sonification removed at the reader's request: graphs are silent */ let ac = null, osc = null, gn = null, on = false, lastT = 0;
    const lo = srcN ? Math.min(...srcN.k.map(f => +f[1].v).filter(isFinite), +srcN.v || 0) : 0, hi = srcN ? Math.max(...srcN.k.map(f => +f[1].v).filter(isFinite), +srcN.v || 0) : 1;
    const value = uu => { if (srcN) { const v = props(srcN, uu).v; return hi > lo ? (v - lo) / (hi - lo) : .5; } const p = props(srcC, uu), xr = p.xr || [0, 1], yr = p.yr || [0, 1], x = xr[0] + (xr[1] - xr[0]) * clamp(p.draw == null ? 1 : p.draw, 0, 1), f = srcC._f || compile(p.f || '0', ['x', 'p', 't']), y = f(x, p.p == null ? 1 : p.p, uu * dur); return clamp((y - yr[0]) / (yr[1] - yr[0]), 0, 1); };
    const click = () => { const o = ac.createOscillator(), g2 = ac.createGain(); o.frequency.value = 900 + Math.random() * 500; g2.gain.setValueAtTime(.05, ac.currentTime); g2.gain.exponentialRampToValueAtTime(.0005, ac.currentTime + .03); o.connect(g2).connect(ac.destination); o.start(); o.stop(ac.currentTime + .035); };
    return { toggle() { on = !on; if (on && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { on = false; return false; } } if (ac && ac.state === 'suspended') ac.resume();
        if (on && !srcG && !osc) { osc = ac.createOscillator(); gn = ac.createGain(); osc.type = 'triangle'; gn.gain.value = 0; osc.connect(gn).connect(ac.destination); osc.start(); }
        if (!on && gn) gn.gain.setTargetAtTime(0, ac.currentTime, .05); return on; },
      tick(uu, live) { if (!on || !ac) return; if (osc) { gn.gain.setTargetAtTime(live ? .035 : 0, ac.currentTime, .05); if (live) osc.frequency.setTargetAtTime(220 * Math.pow(2, 2 * value(uu)), ac.currentTime, .04); }
        if (srcG && live) { const S = srcG._sim, t = uu * dur; if (S && S.hits) { let n = 0; for (let i = S.hits.length - 1; i >= 0 && n < 6; i--) { const h = S.hits[i]; if (h[0] <= lastT) break; if (h[0] <= t && !h[3]) { click(); n++; } } } lastT = t; } },
      stop() { on = false; if (osc) { try { osc.stop(); } catch (e) { /* already stopped */ } } if (ac) ac.close(); ac = null; osc = null; } }; })() : null;
  const soundB = el('button', { class: 'mo-btn mo-sound', type: 'button', title: sonic ? 'Hear it: the changing quantity as sound' : '', text: '♪', hidden: !sonic, 'aria-pressed': 'false' });
  soundB.onclick = () => { const on = sonic.toggle(); soundB.setAttribute('aria-pressed', String(!!on)); soundB.classList.toggle('on', !!on); };
  const ticks = el('div', { class: 'mo-ticks' }, beats.map(b => el('i', { style: `left:${clamp(b[0], 0, 1) * 100}%` })));
  const acts = (opts.actions || []).map(a => el('button', { class: 'mo-btn mo-act', type: 'button', title: a.title || '', text: a.label, onclick: a.on }));
  wrap.append(el('div', { class: 'mo-stages' }, stages.map(s => s.box)), cap, el('div', { class: 'mo-bar' }, [playB, el('div', { class: 'mo-track' }, [ticks, scrub]), again, soundB, gifB, ...acts]));
  host.append(wrap);
  let u = 0, playing = false, last = 0, raf = 0, hold = 0, alive = true, visible = false, lastCap = null, goneAt = 0;
  const frame = uu => { u = clamp(uu, 0, 1); for (const s of stages) { s.svg.textContent = ''; s.C.g = s.svg; s.C.svg = s.svg; drawItems(s.C, s.P.items || [], u); }
    scrub.value = Math.round(u * 1000); let b = null; for (const x of beats) if (x[0] <= u + 1e-6) b = x; const t = b ? b[1] : ''; if (t !== lastCap) { lastCap = t; cap.textContent = ''; if (t) { try { svgMathHTML(cap, t); } catch (e) { cap.textContent = t; } cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); } } };
  const tick = now => { if (!alive) return; if (!wrap.isConnected) { goneAt = goneAt || now; if (now - goneAt > 3000) { alive = false; if (sonic) sonic.stop(); if (io) io.disconnect(); return; } } else goneAt = 0; const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    if (playing && visible) { if (u >= 1) { hold += dt; if (hold > (spec.hold || 1.6)) { hold = 0; frame(0); } } else frame(u + dt / dur); }
    if (sonic) sonic.tick(u, playing && visible && u < 1);
    raf = requestAnimationFrame(tick); };
  const setPlay = on => { playing = on; playB.textContent = on ? '❚❚' : '▶'; playB.setAttribute('aria-label', on ? 'Pause' : 'Play'); playB.title = on ? 'Pause' : 'Play'; wrap.classList.toggle('paused', !on); };
  playB.onclick = () => { if (!playing && u >= 1) frame(0); setPlay(!playing); };
  again.onclick = () => { hold = 0; frame(0); setPlay(true); };
  scrub.oninput = () => { setPlay(false); frame(+scrub.value / 1000); };
  gifB.onclick = async () => { gifB.disabled = true; const keep = playing; setPlay(false); const was = u; gifB.textContent = '…'; try { const { saveGif } = await import('./gif.js'); await saveGif(stages, dur, frame, (spec.name || opts.label || 'animation').replace(/[^\w-]+/g, '-').toLowerCase(), p => { gifB.textContent = Math.round(p * 100) + '%'; }); } catch (e) { console.warn(e); } frame(was); gifB.textContent = 'GIF'; gifB.disabled = false; setPlay(keep); };
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); }, { threshold: .25 }) : null; if (io) io.observe(wrap); else visible = true;
  const calm = opts.calm != null ? opts.calm : prefersCalmMotion();
  frame(calm ? (spec.poster != null ? spec.poster : 1) : 0); setPlay(!calm); raf = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (sonic) sonic.stop(); };
}
function svgMathHTML(node, t) { node.textContent = t; }
export function prefersCalmMotion() { try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; const v = JSON.parse(localStorage.getItem('scriptorium.view') || '{}'); return v.motion === 'calm' || v.calm === true; } catch (e) { return false; } }
