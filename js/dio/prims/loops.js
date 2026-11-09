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
  if (f.edges.some(e => e.status)) { const k = document.createElement('div'); k.className = 'prim-legend'; k.innerHTML = '<span class="lg-solid"></span> established <span class="lg-dot"></span> hypothesised <span class="lg-faint"></span> weak evidence <b>⚠</b> simplified'; S.box.append(k); }   /* the uncertainty conventions, said once where they are used */
  const { W, H } = S, nw = S.narrow ? 104 : 126, nh = 40, my = 34;
  const P = new Map(); if (f.nodes.every(n => n.x != null)) f.nodes.forEach(n => P.set(n.id, [nw / 2 + 8 + n.x / 100 * (W - nw - 16), my + n.y / 60 * (H - 2 * my)])); else ring(f.nodes.length, W, H, nw / 2 + 12, my + 6).forEach((p, i) => P.set(f.nodes[i].id, p));
  // Author positions are percentages of the figure, so on the narrow (phone, lectern) layout two boxes on one row could
  // close up (prices and interest rate touched, the sign badge between them sat on both). Keep every pair at least a
  // badge and an arrowhead apart (36 px between boxes): push each overlapping pair apart along the axis that needs less
  // movement, inside the frame; a pair that the frame's width cannot separate is moved apart vertically instead.
  { const sx = nw + 36, sy = nh + 36, x0 = nw / 2 + 8, x1 = W - nw / 2 - 8, y0 = my, y1 = H - my, ids = f.nodes.map(n => n.id), cl = (v, a, b) => Math.max(a, Math.min(b, v));
    for (let it = 0; it < 80; it++) { let moved = false;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = P.get(ids[i]), b = P.get(ids[j]), dx = b[0] - a[0], dy = b[1] - a[1], ox = sx - Math.abs(dx), oy = sy - Math.abs(dy); if (ox <= .5 || oy <= .5) continue;
        const room = (x1 - x0) - Math.abs(dx) >= ox, alongX = room && ox <= oy, d = (alongX ? ox : oy) / 2 + .5, sg = (alongX ? dx : dy) >= 0 ? 1 : -1;
        if (alongX) { a[0] = cl(a[0] - sg * d, x0, x1); b[0] = cl(b[0] + sg * d, x0, x1); } else { a[1] = cl(a[1] - sg * d, y0, y1); b[1] = cl(b[1] + sg * d, y0, y1); } moved = true; }
      if (!moved) break; } }
  const C = cycles(f.nodes, f.edges); let nR = 0, nB = 0;
  C.forEach(c => { const named = f.loops.find(l => l.nodes.length === c.nodes.length && l.nodes.every(x => c.nodes.includes(x))); c.tag = (c.sign > 0 ? 'R' : 'B') + (c.sign > 0 ? ++nR : ++nB); c.name = named ? named.name : ''; const xs = c.nodes.map(i => P.get(i)); c.at = [xs.reduce((a, p) => a + p[0], 0) / xs.length, xs.reduce((a, p) => a + p[1], 0) / xs.length]; });
  // curves: control point to the left of the direction of travel, so A→B and B→A part
  const geo = e => { const a = P.get(e.from), b = P.get(e.to), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = .2 * L, c = [m[0] + dy / L * k, m[1] - dx / L * k]; return { a: boxExit(a, nw, nh, c, 2), b: boxExit(b, nw, nh, c, 6), c }; };
  const G = new Map(f.edges.map(e => [e, geo(e)]));
  // clearance: loop markers and edge labels go where they are farthest from every curve, badge and box
  const pts = []; G.forEach(g => { for (let i = 0; i <= 24; i++) pts.push(qpt(g.a, g.c, g.b, i / 24)); });
  const boxes = f.nodes.map(n => [...P.get(n.id), nw + 8, nh + 8]), taken = [];
  const clear = (x, y, rx = 14, ry = 14) => { if (x < rx + 4 || x > W - rx - 4 || y < ry + 4 || y > H - ry - 4) return -1; if (boxes.some(b => Math.abs(x - b[0]) < b[2] / 2 + rx + 4 && Math.abs(y - b[1]) < b[3] / 2 + ry + 4)) return -1; let d = Infinity; pts.forEach(p => { d = Math.min(d, Math.max(Math.abs(p[0] - x) - rx, Math.abs(p[1] - y) - ry)); }); taken.forEach(t => { d = Math.min(d, Math.max(Math.abs(t[0] - x) - rx - t[2], Math.abs(t[1] - y) - ry - t[3])); }); return d; };
  const spot = (cands, rx, ry) => { let best = cands[0], bd = -Infinity; cands.forEach(c => { const d = clear(c[0], c[1], rx, ry); if (d > bd + .5) { bd = d; best = c; } }); taken.push([best[0], best[1], rx, ry]); return best; };
  C.forEach(c => { const cand = []; for (let r = 0; r <= 70; r += 10) for (let a = 0; a < 12; a++) cand.push([c.at[0] + r * Math.cos(a * Math.PI / 6), c.at[1] + r * Math.sin(a * Math.PI / 6) * .8]); c.at = spot(cand, 17, 17); });
  // each edge's sign badge sits at 0.74 of its curve; its label beside the curve's middle, on the clearer side
  f.edges.forEach(e => { const g = G.get(e); taken.push([...qpt(g.a, g.c, g.b, .74), 9, 9]); });
  f.edges.forEach(e => { if (!e.label) return; const g = G.get(e), w = Math.min(120, e.label.length * (S.fs - 2.5) * .52 + 6) / 2, cand = []; [.5, .4, .6, .32, .68, .25, .75].forEach(t => { const p = qpt(g.a, g.c, g.b, t), q = qpt(g.a, g.c, g.b, t + .02), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; [13, -13, 20, -20, 28, -28].forEach(o => cand.push([p[0] - dy / L * o, p[1] + dx / L * o])); });
    // the narrow layout (phone, lectern): a short edge between two close boxes may have no place beside it clear of the
    // boxes and curves; then it looks further out, and a place on a box (clear: -1) ranks below one grazing a curve
    if (S.narrow && !cand.some(c => clear(c[0], c[1], w, 7) >= 0)) { let best = null, bd = -Infinity;
      [.5, .4, .6].forEach(t => { const p = qpt(g.a, g.c, g.b, t), q = qpt(g.a, g.c, g.b, t + .02), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; [13, -13, 20, -20, 28, -28, 38, -38, 48, -48, 60, -60].forEach(o => { const c = [p[0] - dy / L * o, p[1] + dx / L * o], d0 = clear(c[0], c[1], w, 7), d = d0 === -1 ? -1e6 : d0 - Math.abs(o) * .05; if (d > bd + .5) { bd = d; best = c; } }); });
      taken.push([best[0], best[1], w, 7]); e._lab = best; return; }
    e._lab = spot(cand, w, 7); });
  let sel = f.start || f.nodes[0].id, state = new Map(), tokens = [], arrivals = new Map(), log = [];
  const draw = () => {
    S.clear();
    C.forEach(c => { const col = c.sign > 0 ? FC.verd : FC.brass; S.mk('circle', { cx: c.at[0], cy: c.at[1], r: 15, fill: '#fffaf0', stroke: col, 'stroke-width': 1.6, 'stroke-dasharray': '30 5' }); S.mk('path', { d: `M${c.at[0] + 13} ${c.at[1] - 6}l3 6l4 -5`, fill: 'none', stroke: col, 'stroke-width': 1.6 }); S.txt(c.at[0], c.at[1] + 4.5, c.tag, { 'text-anchor': 'middle', 'font-weight': 700, fill: col, 'font-size': 12.5 }); });
    f.edges.forEach(e => { const g = G.get(e), hot = tokens.some(t => t.e === e); S.mk('path', { d: `M${g.a[0]} ${g.a[1]}Q${g.c[0]} ${g.c[1]} ${g.b[0]} ${g.b[1]}`, fill: 'none', stroke: hot ? FC.ink : FC.soft, 'stroke-width': hot ? 2.2 : 1.5, 'stroke-dasharray': e.status === 'hypothesis' ? '1.5 4' : e.delay ? '7 3' : null, 'stroke-linecap': e.status === 'hypothesis' ? 'round' : null, opacity: e.status === 'weak' ? .45 : null, 'marker-end': S.arrow(hot ? FC.ink : FC.soft) }); if (e.status === 'simplified') { const m = qpt(g.a, g.c, g.b, .5); S.txt(m[0], m[1] + 4, '⚠', { 'text-anchor': 'middle', 'font-size': 12, fill: FC.brass }); }
      const s = qpt(g.a, g.c, g.b, .74), col = e.sign > 0 ? FC.verd : FC.rubric; S.mk('circle', { cx: s[0], cy: s[1], r: 8.5, fill: col }); S.txt(s[0], s[1] + 4.5, e.sign > 0 ? '+' : '−', { 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, 'font-size': 13 });
      if (e.delay) { const d = qpt(g.a, g.c, g.b, .45); S.txt(d[0], d[1] - 6, '‖ delay', { 'text-anchor': 'middle', 'font-size': S.fs - 3, fill: FC.soft, 'font-style': 'italic' }); }
      if (e.label) S.txt(e._lab[0], e._lab[1] + 3.5, e.label, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: FC.soft, 'font-style': 'italic', fit: 120 }); });
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
