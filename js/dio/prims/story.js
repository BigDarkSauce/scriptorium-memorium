// data_narrative (The Pudding; Segel & Heer's martini glass): a question, then chart states the reader steps through
// (author-driven), each with its annotation, then free reading of every value (reader-driven). The provenance line is
// always on screen: the framing is part of the claim (Hullman & Diakopoulos 2011). "mode":"slides" is the plain dense
// analytic slide (Perun): no transitions, value labels on every mark, every state's point listed.
// Spec: {question, chart:'bars'|'line'|'dots', categories, series:[{name,values}], ylabel, xlabel, states:[{title,show,highlight,annotate:[{at,series,text}],note,y?}], source:{name,year,note,url?}, mode}
import { el } from '../../util.js';
import { FC, SERIES, fmt, easeIO, mathHTML } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 300 } : { W: 600, H: f.mode === 'slides' ? 300 : 310 };
const nice = r => { const s = r / 5, p = Math.pow(10, Math.floor(Math.log10(s || 1))), n = s / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; };
export function render(f, S) {
  const { W, H } = S, slides = f.mode === 'slides', P = { l: 46, r: 12, t: slides ? 54 : 40, b: 34 }, names = f.series.map(s => s.name), nC = f.categories.length;
  // a line or dot chart over numeric categories (years) places each point by its value: 1960 … 2020, 2023 keeps the last
  // gap at three years instead of drawing it as long as a decade
  const XS = f.chart !== 'bars' && nC > 1 && f.categories.every(c => /^\s*-?\d+(\.\d+)?\s*$/.test(String(c))) ? f.categories.map(Number) : null;
  const band = () => (W - P.l - P.r) / nC, xAt = i => XS ? P.l + band() / 2 + (XS[i] - XS[0]) / ((XS[nC - 1] - XS[0]) || 1) * (W - P.l - P.r - band()) : P.l + (i + .5) * band();
  const nearestCat = px => { if (!XS) return Math.floor((px - P.l) / band()); let b = 0; for (let i = 1; i < nC; i++) if (Math.abs(xAt(i) - px) < Math.abs(xAt(b) - px)) b = i; return b; };
  const prov = el('div', { class: 'prim-prov', html: `<b>Source</b> ${mathHTML(f.source.name)}${f.source.year ? ', ' + mathHTML(f.source.year) : ''}${f.source.note ? ' · ' + mathHTML(f.source.note) : ''}` }); S.box.insertBefore(prov, S.ctrls);
  const target = k => { const s = f.states[k], shown = s.show === 'all' ? names : s.show, vals = f.series.map(x => shown.includes(x.name) ? x.values.map(v => v ?? 0) : x.values.map(() => 0)); const all = f.series.filter(x => shown.includes(x.name)).flatMap(x => x.values.filter(v => v != null)); const lo = s.y ? s.y[0] : Math.min(0, ...all), hi = s.y ? s.y[1] : Math.max(...all, 1e-9) * (slides && (s.annotate || []).length ? 1.34 : 1.15);   /* a slide's tallest bar keeps room for its value label and a callout above it */ return { shown, vals, lo, hi, s }; };
  let k = 0, cur = target(0), from = cur, t = 1;
  const draw = () => {
    S.clear(); const e = easeIO(Math.min(1, t)), lo = from.lo + (cur.lo - from.lo) * e, hi = from.hi + (cur.hi - from.hi) * e, s = cur.s;
    const X = xAt, Y = v => H - P.b - (v - lo) / ((hi - lo) || 1) * (H - P.t - P.b), gw = (W - P.l - P.r) / nC;
    if (slides) { S.mk('rect', { x: 0, y: 0, width: W, height: 30, fill: FC.ink }); S.txt(10, 20, s.title, { fill: '#f3e3b8', 'font-weight': 600, 'font-size': S.fs + .5, fit: W - 70 }); S.txt(W - 10, 20, `${k + 1}/${f.states.length}`, { 'text-anchor': 'end', fill: '#d8c8a4', mono: true, 'font-size': 11 }); }
    else S.txt(10, 20, s.title, { 'font-weight': 600, fit: W - 20 });
    const st = nice(hi - lo); for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) { S.mk('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: FC.grid }); S.txt(P.l - 5, Y(v) + 3.5, fmt(+v.toFixed(10), 3), { 'text-anchor': 'end', mono: true, 'font-size': 10, fill: FC.soft }); }
    S.mk('line', { x1: P.l, x2: W - P.r, y1: Y(Math.max(lo, 0)), y2: Y(Math.max(lo, 0)), stroke: FC.soft });
    if (f.ylabel) S.txt(P.l + 4, P.t - 6, f.ylabel, { 'font-size': S.fs - 2, fill: FC.soft, 'font-style': 'italic', fit: W - P.l - 20 });
    const every = Math.ceil(nC / (S.narrow ? 6 : 12)); const tick = XS ? (() => { const pick = [nC - 1]; for (let i = nC - 2; i >= 0; i--) if (X(pick[0]) - X(i) >= 36) pick.unshift(i); return new Set(pick); })() : null;   /* by value: keep the last year, drop a label that would touch its neighbour */
    f.categories.forEach((c, i) => { if (tick ? tick.has(i) : i % every === 0) S.txt(X(i), H - P.b + 14, c, { 'text-anchor': 'middle', 'font-size': 10, fill: FC.soft, fit: tick ? 34 : gw * every - 2 }); });
    if (f.xlabel) S.txt(W - P.r, H - 4, f.xlabel, { 'text-anchor': 'end', 'font-size': S.fs - 2.5, fill: FC.soft, 'font-style': 'italic' });
    const hl = new Set(s.highlight), visible = f.series.map((x, j) => cur.shown.includes(x.name) || from.shown.includes(x.name));
    const val = (j, i) => from.vals[j][i] + (cur.vals[j][i] - from.vals[j][i]) * e, nShown = Math.max(1, cur.shown.length), bw = gw * .74 / nShown;
    f.series.forEach((x, j) => { if (!visible[j]) return; const op = cur.shown.includes(x.name) ? (from.shown.includes(x.name) ? 1 : e) : 1 - e, col = SERIES[j % 4], slot = Math.max(0, cur.shown.indexOf(x.name));
      if (f.chart === 'bars') x.values.forEach((v, i) => { if (v == null) return; const y = val(j, i), bx = X(i) - gw * .37 + slot * bw, dim = hl.size && !hl.has(i); S.mk('rect', { x: bx, y: Math.min(Y(y), Y(Math.max(lo, 0))), width: Math.max(1, bw - 2), height: Math.abs(Y(Math.max(lo, 0)) - Y(y)), fill: col, 'fill-opacity': (dim ? .25 : .85) * op, stroke: hl.has(i) ? FC.ink : null, 'stroke-width': 1.4 }); if (slides && !dim && bw > 18) S.txt(bx + bw / 2 - 1, Y(y) - 3, fmt(x.values[i], 3), { 'text-anchor': 'middle', 'font-size': 9, fill: FC.soft, mono: true }); });
      else { let d = ''; x.values.forEach((v, i) => { if (v == null) return; d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val(j, i)).toFixed(1); }); if (f.chart === 'line') S.mk('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.2, opacity: op }); x.values.forEach((v, i) => { if (v == null) return; S.mk('circle', { cx: X(i), cy: Y(val(j, i)), r: hl.has(i) ? 5 : 3.4, fill: hl.size && !hl.has(i) ? FC.bg : col, stroke: col, 'stroke-width': 1.4, opacity: op }); }); } });
    // legend (more than one series), under the title
    if (cur.shown.length > 1) { let lx = P.l + 6; cur.shown.forEach(n => { const j = names.indexOf(n); S.mk('rect', { x: lx, y: P.t + 2, width: 10, height: 10, fill: SERIES[j % 4] }); const tx = S.txt(lx + 14, P.t + 11, n, { 'font-size': S.fs - 2.5, fit: 120 }); lx += Math.min(134, n.length * 6 + 26); void tx; }); }
    // annotations once the transition has landed: a label above its mark, kept inside the plot, never on another label
    if (t >= 1) { const boxes = []; s.annotate.forEach(a => { const j = a.series ? names.indexOf(a.series) : names.indexOf(cur.shown[0]); if (j < 0) return; const v = f.series[j].values[a.at]; if (v == null) return; const slot = Math.max(0, cur.shown.indexOf(names[j])), mx = f.chart === 'bars' ? X(a.at) - gw * .37 + slot * bw + bw / 2 - 1 : X(a.at), my = Y(v) - (slides && f.chart === 'bars' && v >= 0 ? 13 : 0);   /* on a slide the leader stops above the bar's value label */
      const w = Math.min(S.narrow ? 150 : 210, a.text.length * (S.fs - 1.5) * .52 + 14), h = 18, marks = [];
      f.series.forEach((x, j) => { if (!cur.shown.includes(x.name)) return; x.values.forEach((v, i) => { if (v == null) return; marks.push(f.chart === 'bars' ? [X(i) - gw * .37, Math.min(Y(v), Y(Math.max(lo, 0))) - (slides ? 14 : 0), gw * .74, Math.abs(Y(Math.max(lo, 0)) - Y(v)) + (slides ? 14 : 0)] : [X(i) - 6, Y(v) - 6, 12, 12]);   /* a slide's value label sits on its bar */ }); });
      const ov = (A, B) => Math.max(0, Math.min(A[0] + A[2], B[0] + B[2]) - Math.max(A[0], B[0])) * Math.max(0, Math.min(A[1] + A[3], B[1] + B[3]) - Math.max(A[1], B[1]));
      let best = null, bc = Infinity; [[-w / 2, -34], [-w / 2, 16], [-w - 10, -h / 2 - 16], [10, -h / 2 - 16], [-w - 10, 10], [10, 10], [-w / 2, -54]].forEach(([dx, dy]) => { const b = [Math.max(P.l + 2, Math.min(W - P.r - w - 2, mx + dx)), Math.max(P.t + 2, Math.min(H - P.b - h - 2, my + dy)), w, h]; const c = marks.reduce((s2, m) => s2 + ov(m, b), 0) + boxes.reduce((s2, m) => s2 + ov(m, b) * 4, 0) + Math.hypot(b[0] + w / 2 - mx, b[1] + h / 2 - my) * .05; if (c < bc) { bc = c; best = b; } });
      const [bx, by] = best; boxes.push(best);
      S.mk('line', { x1: mx, y1: my, x2: Math.max(bx, Math.min(bx + w, mx)), y2: Math.max(by, Math.min(by + h, my)), stroke: FC.ink, 'stroke-width': 1 }); S.mk('rect', { x: bx, y: by, width: w, height: h, rx: 4, fill: '#fffaf0', stroke: FC.ink, 'stroke-width': .9 }); S.txt(bx + 7, by + 12.5, a.text, { 'font-size': S.fs - 1.5, fit: w - 12 }); }); }
  };
  const tell = () => { const s = f.states[k]; S.say((f.question && k === 0 ? `<p class="arg-q"><span class="q-mark">Q</span> ${mathHTML(f.question)}</p>` : '') + (slides ? `<ul class="prim-list">${f.states.map((x, i) => `<li${i === k ? ' class="on"' : ''}>${mathHTML(x.note || x.title)}</li>`).join('')}</ul>` : s.note ? `<p>${mathHTML(s.note)}</p>` : ''));
    S.read([['showing', cur.shown.join(', ')], s.highlight.length ? ['highlighted', s.highlight.map(i => f.categories[i]).join(', ')] : null]); };
  const sp = S.stepper(f.states.length, j => { from = { ...cur, shown: cur.shown.slice() }; const prev = k; k = j; cur = target(j); t = S.calm || slides || prev === j ? 1 : 0; if (prev === j) from = cur; tell(); draw(); if (t < 1) S.animate(dt => { t = Math.min(1, t + dt / .7); draw(); return t < 1; }); }, j => f.states[j].title);
  // reader-driven: hover or tap a mark to read its value
  S.svg.addEventListener('pointermove', ev => { const p = S.pt(ev), i = nearestCat(p[0]); if (i < 0 || i >= nC) return; S.read([['category', f.categories[i]], ...f.series.filter(x => cur.shown.includes(x.name)).map(x => [x.name, x.values[i] == null ? '—' : fmt(x.values[i], 4)])]); });
  sp.set(0); S.redraw = draw; S.go = j => sp.set(j);
  return { draw };
}
