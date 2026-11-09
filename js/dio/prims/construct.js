// progressive_construction (Karpathy's "simplest version first, each part because it is needed"): the parts of a
// system appear stage by stage; the parts a stage adds are highlighted and its note says the problem they solve.
// Spec: {parts:[{id,label,note?,x?,y?,w?,h?}], stages:[{label, adds:[ids], why, problem?, test?}], links:[{from,to,label?}]}
import { FC, nodeBox, easeIO, route, qpath, qpt, mathHTML } from './kit.js';

// data-flow layers from the links (longest path from a source), when the parts are linked
export function layersOf(f) { if (!f.links.length) return null; const L = new Map(f.parts.map(p => [p.id, 0])); for (let it = 0; it < 14; it++) { let ch = false; f.links.forEach(l => { const v = L.get(l.from) + 1; if (v > L.get(l.to) && v < 9) { L.set(l.to, v); ch = true; } }); if (!ch) break; } return L; }
export const size = (f, o) => { const L = layersOf(f), n = L ? Math.max(...L.values()) + 1 : 0; return o.narrow ? { W: 360, H: n && n <= 6 ? 50 + n * 66 : 300 } : { W: 600, H: 290 }; };
export function render(f, S) {
  const { W, H } = S, top = 34, bottom = H - 10, stageOf = new Map();
  f.stages.forEach((s, i) => s.adds.forEach(id => { if (!stageOf.has(id)) stageOf.set(id, i); }));
  // positions: the spec's 100 × 60 canvas when every part has one, else rows in the order the parts are added
  const pos = new Map(), given = f.parts.every(p => p.w != null);
  if (given) { const sx = (W - 20) / 100, sy = (bottom - top) / 60; f.parts.forEach(p => pos.set(p.id, { x: 10 + (p.x + p.w / 2) * sx, y: top + (p.y + p.h / 2) * sy, w: Math.max(56, p.w * sx), h: Math.max(30, p.h * sy) })); }
  else if (layersOf(f) && Math.max(...layersOf(f).values()) + 1 <= (S.narrow ? 6 : 5)) {
    // left to right in data-flow order (top to bottom on a phone); parts of one layer share a column (row)
    const L = layersOf(f), n = Math.max(...L.values()) + 1, cols = [...Array(n)].map((_, i) => f.parts.filter(p => L.get(p.id) === i));
    if (!S.narrow) { const cw = (W - 20) / n; cols.forEach((col, i) => col.forEach((p, j) => { const rh = (bottom - top) / col.length, w = Math.min(cw - 14, 150), h = Math.min(rh - 18, 56); pos.set(p.id, { x: 10 + (i + .5) * cw, y: top + (j + .5) * rh, w, h }); })); }
    else { const rh = (bottom - top) / n; cols.forEach((row, i) => row.forEach((p, j) => { const cw = (W - 20) / row.length, w = Math.min(cw - 16, 200), h = Math.min(rh - 16, 50); pos.set(p.id, { x: 10 + (j + .5) * cw, y: top + (i + .5) * rh, w, h }); })); }
  }
  else {
    const order = f.parts.slice().sort((a, b) => (stageOf.get(a.id) ?? 99) - (stageOf.get(b.id) ?? 99)), n = order.length;
    const cols = Math.min(n, S.narrow ? 2 : n <= 4 ? n : n <= 6 ? 3 : 4), rows = Math.ceil(n / cols), cw = (W - 20) / cols, rh = (bottom - top) / rows;
    const w = Math.min(cw - 26, S.narrow ? 150 : 170), h = Math.min(rh - 22, 54);
    order.forEach((p, i) => { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; pos.set(p.id, { x: 10 + (c + .5) * cw, y: top + (r + .5) * rh, w, h }); });
  }
  let k = 0, from = -1, t = 1;
  const R = new Map(f.links.map(l => { const a = pos.get(l.from), b = pos.get(l.to); return [l, route([a.x, a.y], [b.x, b.y], [a.w, a.h], [b.w, b.h], f.parts.filter(p => p.id !== l.from && p.id !== l.to).map(p => { const q = pos.get(p.id); return [q.x, q.y, q.w, q.h]; }))]; }));
  const draw = () => {
    S.clear(); const st = f.stages[k];
    S.txt(10, 20, `Stage ${k + 1} of ${f.stages.length}: ${st.label}`, { 'font-weight': 600, fill: FC.ink, fit: W - 20 });
    // links whose two parts are already built
    f.links.forEach(l => { const ka = stageOf.get(l.from), kb = stageOf.get(l.to); if (ka > k || kb > k) return; const g = R.get(l), fresh = ka === k || kb === k; S.mk('path', { d: qpath(g), fill: 'none', stroke: fresh ? FC.rubric : FC.soft, 'stroke-width': fresh ? 1.8 : 1.3, 'marker-end': S.arrow(fresh ? FC.rubric : FC.soft), opacity: fresh ? Math.min(1, t * 1.4) : 1 }); if (l.label) S.txt(qpt(g.a, g.c, g.b, .5)[0], qpt(g.a, g.c, g.b, .5)[1] - 5, l.label, { 'text-anchor': 'middle', 'font-size': S.fs - 2, fill: FC.rubric, 'font-style': 'italic', fit: 110 }); });
    f.parts.forEach(p => { const s = stageOf.get(p.id), P = pos.get(p.id);
      if (s > k) { S.mk('rect', { x: P.x - P.w / 2, y: P.y - P.h / 2, width: P.w, height: P.h, rx: 8, fill: 'none', stroke: FC.grid, 'stroke-dasharray': '3 4' }); return; }   // its place, kept so the layout never jumps
      const fresh = s === k && k > 0, e = fresh ? easeIO(Math.min(1, t)) : 1, g = nodeBox(S, P.x, P.y - (1 - e) * 14, P.w, P.h, p.label, { tone: fresh ? 'hot' : s === 0 && k === 0 ? 'hot' : 'card', stroke: fresh || k === 0 ? FC.rubric : FC.lapis, sw: fresh ? 2 : 1.3, sub: p.note || null, maxL: 2 });
      g.setAttribute('opacity', e.toFixed(3));
      if (fresh || (k === 0 && s === 0)) { S.mk('circle', { cx: P.x + P.w / 2 - 2, cy: P.y - P.h / 2 + 2 - (1 - e) * 14, r: 8, fill: FC.rubric }, g); S.txt(P.x + P.w / 2 - 2, P.y - P.h / 2 + 6 - (1 - e) * 14, '+', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, 'font-weight': 700 }, g); } });
  };
  const tell = () => { const st = f.stages[k], names = st.adds.map(id => (f.parts.find(p => p.id === id) || {}).label).filter(Boolean);
    S.say([st.problem ? `<p><b>Problem.</b> ${mathHTML(st.problem)}</p>` : '', names.length ? `<p><b>${k ? 'Added' : 'Start with'}:</b> ${names.map(n => mathHTML(n)).join(', ')}.</p>` : '', `<p><b>Why it is needed.</b> ${mathHTML(st.why)}</p>`, st.test ? `<p><b>Test.</b> ${mathHTML(st.test)}</p>` : ''].join(''));
    S.read([['parts built', f.parts.filter(p => stageOf.get(p.id) <= k).length + ' of ' + f.parts.length], ['stage', (k + 1) + ' of ' + f.stages.length]]); };
  const sp = S.stepper(f.stages.length, j => { from = k; k = j; t = S.calm || j < from ? 1 : 0; tell(); draw(); if (t < 1) S.animate(dt => { t = Math.min(1, t + dt / .6); draw(); return t < 1; }); }, j => f.stages[j].label);
  sp.set(0); S.redraw = draw; S.state = () => ({ stage: k }); S.go = j => sp.set(j);
  return { draw, describe: () => f.stages.map((s, i) => `stage ${i + 1}: ${s.label}`).join('; ') };
}
