// transform2d (3Blue1Brown): a 2 × 2 matrix as a motion of the whole plane. The grid, î (lapis) and ĵ (rubric) move
// from the identity to A as t goes 0 → 1; the unit square becomes a parallelogram whose signed area is det A; the
// equation's columns carry the same colours as the basis vectors they are. Drag the tips of î and ĵ to change A.
// Spec: {matrix:[[a,b],[c,d]], presets?:[{label,matrix}], vector?:[x,y], eigen?:bool}
import { FC, fmt, easeIO } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 470 } : { W: 600, H: 330 };
export function render(f, S) {
  const { W, H } = S, side = S.narrow ? 340 : 310, ox = S.narrow ? (W - side) / 2 : 10, oy = 10, R = 3.2, u = side / (2 * R);
  const X = x => ox + side / 2 + x * u, Y = y => oy + side / 2 - y * u, IX = px => (px - ox - side / 2) / u, IY = py => (oy + side / 2 - py) / u;
  let M = f.matrix.map(r => r.slice()), t = 1, drag = null;
  const cp = 'tc' + Math.random().toString(36).slice(2, 8); const clip = S.mk('clipPath', { id: cp }, S.svg.querySelector('defs')); S.mk('rect', { x: ox, y: oy, width: side, height: side }, clip);
  const At = () => [[1 + (M[0][0] - 1) * t, M[0][1] * t], [M[1][0] * t, 1 + (M[1][1] - 1) * t]];
  const draw = () => {
    S.clear(); const A = At(), T = (x, y) => [A[0][0] * x + A[0][1] * y, A[1][0] * x + A[1][1] * y], det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    S.mk('rect', { x: ox, y: oy, width: side, height: side, fill: '#fdf9ef', stroke: FC.grid });
    const g = S.g({ 'clip-path': `url(#${cp})` });
    for (let k = -4; k <= 4; k++) { S.mk('line', { x1: X(k), y1: Y(-R), x2: X(k), y2: Y(R), stroke: FC.grid, 'stroke-dasharray': '2 3' }, g); S.mk('line', { x1: X(-R), y1: Y(k), x2: X(R), y2: Y(k), stroke: FC.grid, 'stroke-dasharray': '2 3' }, g); }
    for (let k = -8; k <= 8; k++) { let a = T(k, -8), b = T(k, 8); S.mk('line', { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: k ? 'rgba(45,91,142,.3)' : 'rgba(45,91,142,.7)', 'stroke-width': k ? 1 : 1.6 }, g); a = T(-8, k); b = T(8, k); S.mk('line', { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: k ? 'rgba(156,58,40,.26)' : 'rgba(156,58,40,.65)', 'stroke-width': k ? 1 : 1.6 }, g); }
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => T(x, y));
    S.mk('path', { d: 'M' + q.map(v => X(v[0]).toFixed(1) + ' ' + Y(v[1]).toFixed(1)).join('L') + 'Z', fill: det >= 0 ? FC.fillB : FC.fillR, stroke: det >= 0 ? FC.brass : FC.rubric, 'stroke-width': 1.6 }, g);
    if (f.eigen) { const tr = A[0][0] + A[1][1], disc = tr * tr - 4 * det; if (disc >= 0) [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2].forEach((l, i) => { let v = Math.abs(A[0][1]) > 1e-9 ? [A[0][1], l - A[0][0]] : Math.abs(A[1][0]) > 1e-9 ? [l - A[1][1], A[1][0]] : (i ? [0, 1] : [1, 0]); const n = Math.hypot(...v) || 1; v = [v[0] / n * 6, v[1] / n * 6]; S.mk('line', { x1: X(-v[0]), y1: Y(-v[1]), x2: X(v[0]), y2: Y(v[1]), stroke: FC.verd, 'stroke-dasharray': '6 4', 'stroke-width': 1.4 }, g); }); }
    // the area label at the parallelogram's centre, when it is inside the frame
    const c = T(.5, .5); if (Math.abs(c[0]) < R - .5 && Math.abs(c[1]) < R - .3 && Math.abs(det) > .12) S.txt(X(c[0]), Y(c[1]) + 4, 'area ' + fmt(Math.abs(det), 2), { 'text-anchor': 'middle', 'font-size': S.fs - 1.5, fill: det >= 0 ? FC.brass : FC.rubric, 'font-weight': 600 }, g);
    const arrow = (v, col, name) => { const L = Math.hypot(v[0], v[1]); S.mk('line', { x1: X(0), y1: Y(0), x2: X(v[0]), y2: Y(v[1]), stroke: col, 'stroke-width': 3, 'marker-end': L > .15 ? S.arrow(col) : null }, g); S.mk('circle', { cx: X(v[0]), cy: Y(v[1]), r: 9, fill: col, 'fill-opacity': .14, stroke: col, 'stroke-width': 1.2, style: 'cursor:grab' }, g); const lx = X(v[0]) + (v[0] >= 0 ? 10 : -10), ly = Y(v[1]) + (v[1] >= 0 ? -8 : 16); S.txt(Math.max(ox + 8, Math.min(ox + side - 8, lx)), Math.max(oy + 14, Math.min(oy + side - 4, ly)), name, { 'text-anchor': v[0] >= 0 ? 'start' : 'end', 'font-size': 15, 'font-style': 'italic', fill: col, 'font-weight': 600 }, g); };
    if (f.vector) { const w = T(f.vector[0], f.vector[1]); S.mk('line', { x1: X(0), y1: Y(0), x2: X(w[0]), y2: Y(w[1]), stroke: FC.verd, 'stroke-width': 2.4, 'marker-end': S.arrow(FC.verd) }, g); }
    arrow(T(1, 0), FC.lapis, 'î'); arrow(T(0, 1), FC.rubric, 'ĵ');
    // ---- the equation, linked by colour
    const ex = S.narrow ? 14 : ox + side + 22, ey = S.narrow ? oy + side + 34 : 44, fs = S.narrow ? 14 : 15;
    S.txt(ex, ey, 'A =', { 'font-size': fs, 'font-style': 'italic' });
    const mx = ex + 38, cw = 52, rh = 24; const br = (x, s) => S.mk('path', { d: `M${x + 6 * s} ${ey - 20}h${-6 * s}v${rh * 2 + 4}h${6 * s}`, fill: 'none', stroke: FC.ink, 'stroke-width': 1.4 });
    br(mx, 1); br(mx + cw * 2 + 6, -1);
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([r, cI]) => S.txt(mx + 8 + cI * cw + cw / 2, ey - 2 + r * rh, fmt(A[r][cI], 2), { 'text-anchor': 'middle', mono: true, 'font-size': 13, fill: cI ? FC.rubric : FC.lapis, 'font-weight': 600 }));
    S.txt(mx + 8 + cw / 2, ey + rh * 2 + 2, 'î', { 'text-anchor': 'middle', 'font-size': 12, fill: FC.lapis, 'font-style': 'italic' }); S.txt(mx + 8 + cw * 1.5, ey + rh * 2 + 2, 'ĵ', { 'text-anchor': 'middle', 'font-size': 12, fill: FC.rubric, 'font-style': 'italic' });
    const ey2 = ey + (S.narrow ? 66 : 82), lw = W - ex - 10;
    S.txt(ex, ey2, `det A = ad − bc = ${fmt(A[0][0], 2)}·${fmt(A[1][1], 2)} − ${fmt(A[0][1], 2)}·${fmt(A[1][0], 2)}`, { 'font-size': S.fs - .5, fit: lw });
    S.txt(ex, ey2 + 20, `= ${fmt(det, 3)}`, { 'font-size': S.fs + 1, fill: det >= 0 ? FC.brass : FC.rubric, 'font-weight': 600 });
    S.lines(ex, ey2 + 30, Math.abs(det) < 1e-3 ? 'The plane is squashed onto a line: the area is 0 and A has no inverse.' : det < 0 ? `Every area is scaled by |det A| = ${fmt(-det, 3)}, and the orientation flips (ĵ is now clockwise of î).` : `Every area is scaled by det A = ${fmt(det, 3)}; the orientation is kept.`, lw, { 'font-size': S.fs - 1, fill: FC.soft }, S.layer, 3);
    if (!S.narrow) S.txt(ex, H - 14, t < 1 ? `t = ${fmt(t, 2)}: A(t) = (1 − t)I + tA` : 'drag the tips of î and ĵ', { 'font-size': S.fs - 2, fill: FC.soft, 'font-style': 'italic', fit: lw });
    const tr = A[0][0] + A[1][1], disc = tr * tr - 4 * det;
    S.read([['det A', fmt(det, 3)], ['trace', fmt(tr, 3)], ['eigenvalues', disc >= 0 ? fmt((tr + Math.sqrt(disc)) / 2, 3) + ', ' + fmt((tr - Math.sqrt(disc)) / 2, 3) : 'complex (a rotation part)'], f.vector ? ['A v', `(${fmt(A[0][0] * f.vector[0] + A[0][1] * f.vector[1], 2)}, ${fmt(A[1][0] * f.vector[0] + A[1][1] * f.vector[1], 2)})`] : null]);
  };
  const tS = S.slider('morph t', 0, 1, 1, .01, v => { t = v; draw(); }, v => fmt(v, 2));
  const play = () => { if (S.calm) { t = 1; tS.set(1); draw(); return; } let p = 0; t = 0; S.animate(dt => { p = Math.min(1, p + dt / 2.2); t = easeIO(p); tS.set(+t.toFixed(2)); draw(); return p < 1; }); };
  S.btn('Play the motion', play, { primary: true, title: 'Move the plane from the identity to A' });
  if (f.presets.length) S.select('matrix', [['', 'as given'], ...f.presets.map((p, i) => [String(i), p.label])], '', v => { M = (v === '' ? f.matrix : f.presets[+v].matrix).map(r => r.slice()); play(); });
  const near = (p, v) => Math.hypot(X(v[0]) - p[0], Y(v[1]) - p[1]) < 22;
  S.svg.addEventListener('pointerdown', ev => { const p = S.pt(ev); const A = At(); const i_ = [A[0][0], A[1][0]], j_ = [A[0][1], A[1][1]]; drag = near(p, i_) ? 0 : near(p, j_) ? 1 : null; if (drag == null) return; if (t < 1) { t = 1; tS.set(1); } S.svg.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  S.svg.addEventListener('pointermove', ev => { if (drag == null) return; const p = S.pt(ev), x = Math.round(Math.max(-3, Math.min(3, IX(p[0]))) * 10) / 10, y = Math.round(Math.max(-3, Math.min(3, IY(p[1]))) * 10) / 10; M[0][drag] = x; M[1][drag] = y; draw(); });
  S.svg.addEventListener('pointerup', () => { drag = null; });
  S.say(''); draw(); S.redraw = draw;
  // the motion plays once, the first time the figure is seen (never under reduced motion)
  let played = false; const once = new IntersectionObserver(es => { if (!played && es.some(e => e.isIntersecting)) { played = true; once.disconnect(); if (!S.calm) play(); } }); once.observe(S.box);
  S.setMatrix = m => { M = m.map(r => r.slice()); t = 1; tS.set(1); draw(); };
  return { draw };
}
