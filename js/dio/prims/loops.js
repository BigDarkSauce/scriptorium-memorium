// causal_loop (LOOPY; system dynamics polarity, Sterman 2000): variables joined by signed influences. Loops are
// found from the edges and labelled by the product of their signs (even number of − = reinforcing R, odd = balancing
// B), so a label can never contradict the arrows. Press a node (or Pulse) to push it up or down and watch the change
// travel: along a + edge the next variable moves the same way, along a − edge the opposite way.
// Spec: {nodes:[{id,label,x?,y?}], edges:[{from,to,sign:±1,label?,delay?}], loops?:[{name,nodes}], start?}
import { FC, nodeBox, boxExit, qpt, ring, mathHTML } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 400 } : { W: 600, H: 340 };
// every simple cycle (graphs here have ≤ 10 nodes), each once (rotation-normalised)
export function cycles(nodes, edges) {
  const ids = nodes.map(n => n.id), out = new Map(ids.map(i => [i, []])); edges.forEach(e => out.get(e.from).push(e));
  const seen = new Set(), res = [];
  const dfs = (startI, cur, path, es) => { for (const e of out.get(cur)) { const j = ids.indexOf(e.to); if (e.to === ids[startI]) { const key = path.join('>'); if (!seen.has(key)) { seen.add(key); res.push({ nodes: path.slice(), edges: [...es, e] }); } } else if (j > startI && !path.includes(e.to) && path.length < 10) dfs(startI, e.to, [...path, e.to], [...es, e]); } };
  ids.forEach((id, i) => dfs(i, id, [id], []));
  return res.map(c => ({ ...c, sign: c.edges.reduce((a, e) => a * e.sign, 1) }));
}
export function render(f, S) {
  const { W, H } = S, nw = S.narrow ? 104 : 126, nh = 40, my = 34;
  const P = new Map(); if (f.nodes.every(n => n.x != null)) f.nodes.forEach(n => P.set(n.id, [nw / 2 + 8 + n.x / 100 * (W - nw - 16), my + n.y / 60 * (H - 2 * my)])); else ring(f.nodes.length, W, H, nw / 2 + 12, my + 6).forEach((p, i) => P.set(f.nodes[i].id, p));
  const C = cycles(f.nodes, f.edges); let nR = 0, nB = 0;
  C.forEach(c => { const named = f.loops.find(l => l.nodes.length === c.nodes.length && l.nodes.every(x => c.nodes.includes(x))); c.tag = (c.sign > 0 ? 'R' : 'B') + (c.sign > 0 ? ++nR : ++nB); c.name = named ? named.name : ''; const xs = c.nodes.map(i => P.get(i)); c.at = [xs.reduce((a, p) => a + p[0], 0) / xs.length, xs.reduce((a, p) => a + p[1], 0) / xs.length]; });
  // markers of loops with the same centre are spread apart
  C.forEach((c, i) => { for (let j = 0; j < i; j++) if (Math.hypot(C[j].at[0] - c.at[0], C[j].at[1] - c.at[1]) < 34) c.at = [c.at[0] + 40, c.at[1] + (i % 2 ? 22 : -22)]; c.at = [Math.max(30, Math.min(W - 30, c.at[0])), Math.max(30, Math.min(H - 30, c.at[1]))]; });
  // curves: control point to the left of the direction of travel, so A→B and B→A part
  const geo = e => { const a = P.get(e.from), b = P.get(e.to), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = .2 * L, c = [m[0] + dy / L * k, m[1] - dx / L * k]; return { a: boxExit(a, nw, nh, c, 2), b: boxExit(b, nw, nh, c, 6), c }; };
  const G = new Map(f.edges.map(e => [e, geo(e)]));
  let sel = f.start || f.nodes[0].id, state = new Map(), tokens = [], arrivals = new Map(), log = [];
  const draw = () => {
    S.clear();
    C.forEach(c => { const col = c.sign > 0 ? FC.verd : FC.brass; S.mk('circle', { cx: c.at[0], cy: c.at[1], r: 15, fill: '#fffaf0', stroke: col, 'stroke-width': 1.6, 'stroke-dasharray': '30 5' }); S.mk('path', { d: `M${c.at[0] + 13} ${c.at[1] - 6}l3 6l4 -5`, fill: 'none', stroke: col, 'stroke-width': 1.6 }); S.txt(c.at[0], c.at[1] + 4.5, c.tag, { 'text-anchor': 'middle', 'font-weight': 700, fill: col, 'font-size': 12.5 }); });
    f.edges.forEach(e => { const g = G.get(e), hot = tokens.some(t => t.e === e); S.mk('path', { d: `M${g.a[0]} ${g.a[1]}Q${g.c[0]} ${g.c[1]} ${g.b[0]} ${g.b[1]}`, fill: 'none', stroke: hot ? FC.ink : FC.soft, 'stroke-width': hot ? 2.2 : 1.5, 'stroke-dasharray': e.delay ? '7 3' : null, 'marker-end': S.arrow(hot ? FC.ink : FC.soft) });
      const s = qpt(g.a, g.c, g.b, .74), col = e.sign > 0 ? FC.verd : FC.rubric; S.mk('circle', { cx: s[0], cy: s[1], r: 8.5, fill: col }); S.txt(s[0], s[1] + 4.5, e.sign > 0 ? '+' : '−', { 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, 'font-size': 13 });
      if (e.delay) { const d = qpt(g.a, g.c, g.b, .45); S.txt(d[0], d[1] - 6, '‖ delay', { 'text-anchor': 'middle', 'font-size': S.fs - 3, fill: FC.soft, 'font-style': 'italic' }); }
      if (e.label) { const d = qpt(g.a, g.c, g.b, .5); S.txt(d[0], d[1] + 14, e.label, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: FC.soft, 'font-style': 'italic', fit: 120 }); } });
    tokens.forEach(t => { const g = G.get(t.e), p = qpt(g.a, g.c, g.b, Math.min(1, t.u)); S.mk('circle', { cx: p[0], cy: p[1], r: 7, fill: t.dir > 0 ? FC.verd : FC.rubric, stroke: '#fff', 'stroke-width': 1.5 }); S.txt(p[0], p[1] + 3.5, t.dir > 0 ? '▲' : '▼', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 8 }); });
    f.nodes.forEach(n => { const [x, y] = P.get(n.id), d = state.get(n.id), on = n.id === sel;
      const g = nodeBox(S, x, y, nw, nh, n.label, { tone: d ? (d > 0 ? 'verd' : 'rubric') : on ? 'hot' : 'card', stroke: on ? FC.ink : FC.lapis, sw: on ? 2.2 : 1.3, rx: 20, maxL: 2, cls: 'pnode' }); g.dataset.id = n.id; g.style.cursor = 'pointer';
      if (d) { S.mk('circle', { cx: x + nw / 2 - 4, cy: y - nh / 2 + 2, r: 9, fill: d > 0 ? FC.verd : FC.rubric, stroke: '#fff', 'stroke-width': 1.4 }, g); S.txt(x + nw / 2 - 4, y - nh / 2 + 5.5, d > 0 ? '▲' : '▼', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 9 }, g); } });
  };
  const nameOf = id => (f.nodes.find(n => n.id === id) || {}).label || id;
  const summary = () => { const loops = C.map(c => `<li><b style="color:${c.sign > 0 ? FC.verd : FC.brass}">${c.tag}</b> ${c.name ? mathHTML(c.name) + ': ' : ''}${c.nodes.map(i => mathHTML(nameOf(i))).join(' → ')} → … <i>${c.sign > 0 ? 'reinforcing: an even number of − signs, a change comes back amplified' : 'balancing: an odd number of − signs, a change comes back opposed'}</i></li>`).join('');
    S.say((log.length ? `<p><b>The pulse:</b> ${log.slice(0, 9).map(x => mathHTML(x)).join(' → ')}${log.length > 9 ? ' → …' : ''}</p>` : `<p>Press a variable to push it up; the change travels along the arrows.</p>`) + (loops ? `<ul class="prim-list">${loops}</ul>` : '<p>No closed loop: this is a causal chain without feedback.</p>'));
    S.read([['selected', nameOf(sel)], ['loops', C.length ? C.map(c => c.tag).join(', ') : 'none'], ['reinforcing', nR], ['balancing', nB]]); };
  // one pulse: tokens travel 1 edge per 0.9 s; each node passes the change on at most twice (so loops show their
  // return), for at most 3 × (number of nodes) arrivals
  const pulse = (id, dir) => { state = new Map([[id, dir]]); arrivals = new Map([[id, 1]]); log = [nameOf(id) + (dir > 0 ? ' ▲' : ' ▼')]; tokens = []; let budget = f.nodes.length * 3;
    const emit = (from, d) => f.edges.filter(e => e.from === from).forEach(e => { if (budget-- > 0) tokens.push({ e, dir: d * e.sign, u: 0 }); });
    emit(id, dir);
    const step = () => { const done = tokens.filter(t => t.u >= 1); tokens = tokens.filter(t => t.u < 1); done.forEach(t => { const to = t.e.to, k = (arrivals.get(to) || 0) + 1; arrivals.set(to, k); const back = state.get(to); state.set(to, t.dir); log.push(nameOf(to) + (t.dir > 0 ? ' ▲' : ' ▼') + (back && to === id ? (t.dir === dir ? ' (amplified)' : ' (opposed)') : '')); if (k < 2) emit(to, t.dir); }); };
    if (S.calm) { while (tokens.length) { tokens.forEach(t => { t.u = 1; }); step(); } summary(); draw(); return; }
    summary(); S.animate(dt => { tokens.forEach(t => { t.u += dt / .9; }); step(); summary(); draw(); return tokens.length > 0; }); };
  S.svg.addEventListener('click', ev => { const g = ev.target.closest && ev.target.closest('.pnode'); if (!g) return; sel = g.dataset.id; pulse(sel, 1); });
  S.btn('Pulse ▲', () => pulse(sel, 1), { primary: true, title: 'Push the selected variable up' });
  S.btn('Pulse ▼', () => pulse(sel, -1), { title: 'Push the selected variable down' });
  S.btn('Reset', () => { state = new Map(); tokens = []; log = []; summary(); draw(); });
  summary(); draw(); S.redraw = draw; S.pulse = pulse; S.cycles = C;
  return { draw };
}
