// flow_network (Modern MBA, Wendover): a business model as a system — customers, the firm, suppliers, intermediaries
// and competitors, with money (brass coins) and goods (lapis crates) moving between them, and the unit economics of one
// sale as a waterfall from the price down to the margin. Press an actor to see only its flows and its in/out.
// Spec: {actors:[{id,label,role,x?,y?,note?}], flows:[{from,to,kind:'money'|'goods'|'info',label,amount?}], units?:{title,price,currency,items:[{label,value}]}}
import { FC, qpt, fmt, mathHTML } from './kit.js';

const NET_H = 360, NET_HN = 390;
const rowsOf = f => f.units ? f.units.items.length + 2 : 0;
export const size = (f, o) => ({ W: o.narrow ? 360 : 600, H: (o.narrow ? NET_HN : NET_H) + (f.units ? 40 + 21 * rowsOf(f) : 0) });
const COL = { money: FC.brass, goods: FC.lapis, info: FC.violet };
// a 3 × 3 grid of places by role: suppliers on the left, the firm in the middle, customers on the right; brokers above
// the firm, competitors below the customers, regulators below the firm
const CELL = { supplier: [0, null], partner: [1, 0], intermediary: [1, 0], platform: [1, 0], firm: [1, 1], customer: [2, 1], competitor: [2, 2], regulator: [1, 2] };
export function render(f, S) {
  const { W } = S, units = f.units, H0 = S.narrow ? NET_HN : NET_H, P = new Map(), r = 21, colX = [W * .14, W * .5, W * .86], rowY = S.narrow ? [52, 200, 336] : [52, 182, 308];
  if (f.actors.every(a => a.x != null)) f.actors.forEach(a => P.set(a.id, [40 + a.x / 100 * (W - 80), 40 + a.y / 60 * (H0 - 100)]));
  else {
    const groups = new Map(); f.actors.forEach(a => { const [c, rr] = CELL[a.role] || [1, 1]; const k = c + ':' + (rr == null ? 's' : rr); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
    groups.forEach((list, k) => { const [c, rr] = k.split(':'); list.forEach((a, j) => { if (rr === 's') P.set(a.id, [colX[c], list.length === 1 ? rowY[1] : rowY[0] + (rowY[2] - rowY[0]) * j / (list.length - 1)]); else P.set(a.id, [colX[c] + (j - (list.length - 1) / 2) * Math.min(130, W / 4), rowY[+rr]]); }); });
  }
  // curves: each flow bends to the left of its direction (a flow and its payment part), more for a third flow on a pair
  const pairN = (x, i) => f.flows.slice(0, i).filter(y => (y.from === x.from && y.to === x.to)).length;
  const G = f.flows.map((x, i) => { const a = P.get(x.from), b = P.get(x.to), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = 16 + 14 * pairN(x, i) + L * .06, c = [(a[0] + b[0]) / 2 + dy / L * k, (a[1] + b[1]) / 2 - dx / L * k], sh = (p, q, d) => { const vx = q[0] - p[0], vy = q[1] - p[1], l = Math.hypot(vx, vy) || 1; return [p[0] + vx / l * d, p[1] + vy / l * d]; }; return { a: sh(a, c, r + 3), b: sh(b, c, r + 8), c }; });
  // label places: along each curve, on either side, wherever they cover no actor, no actor label, no other label
  const actorBoxes = f.actors.map(a => { const [x, y] = P.get(a.id); return [x, y + 10 - (S.narrow ? 6 : 0), (S.narrow ? 100 : 130), 2 * r + (S.narrow ? 22 : 34)]; });
  const labelAt = []; f.flows.forEach((x, i) => { if (!x.label) { labelAt.push(null); return; } const g = G[i], txt = x.label + (x.amount != null ? ' · ' + fmt(x.amount) : ''), w = Math.min(130, txt.length * (S.fs - 2.5) * .54 + 14), h = 16; let best = null, bo = Infinity;
    for (const t of [.5, .4, .6, .32, .68, .25, .75, .18, .82]) for (const o of [0, 12, -12, 24, -24]) { const p = qpt(g.a, g.c, g.b, t), q = qpt(g.a, g.c, g.b, t + .02), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, cx = p[0] - dy / L * o, cy = p[1] + dx / L * o, box = [cx - w / 2, cy - h / 2, w, h];
      const ov = (b, X) => Math.max(0, Math.min(b[0] + b[2], X[0] + X[2]) - Math.max(b[0], X[0])) * Math.max(0, Math.min(b[1] + b[3], X[1] + X[3]) - Math.max(b[1], X[1]));
      const cost = labelAt.filter(Boolean).reduce((s, b) => s + ov(b.box, box) * 3, 0) + actorBoxes.reduce((s, A) => s + ov([A[0] - A[2] / 2, A[1] - A[3] / 2, A[2], A[3]], box) * 4, 0) + (box[0] < 2 || box[0] + w > W - 2 || box[1] < 18 || box[1] + h > H0 - 2 ? 5000 : 0) + Math.abs(o) * .5 + Math.abs(t - .5) * 20;
      if (cost < bo) { bo = cost; best = { box, txt }; } }
    labelAt.push(best); });
  let show = { money: true, goods: true, info: true }, sel = null, t = 0;
  const glyph = (a, x, y, g) => { const s = S.mk('g', { transform: `translate(${x} ${y})` }, g), c = a.role === 'competitor' ? FC.rubric : FC.ink, m = (n, at) => S.mk(n, { fill: 'none', stroke: c, 'stroke-width': 1.5, ...at }, s);
    if (a.role === 'customer') { m('circle', { cx: 0, cy: -6, r: 4.5 }); m('path', { d: 'M-8 9a8 8 0 0 1 16 0' }); }
    else if (a.role === 'supplier') { m('rect', { x: -8, y: -7, width: 16, height: 14 }); m('path', { d: 'M-8 -2h16M0 -7v14' }); }
    else if (a.role === 'intermediary' || a.role === 'partner') { m('circle', { cx: -4, cy: 0, r: 6 }); m('circle', { cx: 4, cy: 0, r: 6 }); }
    else if (a.role === 'platform') m('path', { d: 'M-8 0l4 -7h8l4 7l-4 7h-8z' });
    else if (a.role === 'regulator') m('path', { d: 'M-9 8h18M-7 8v-10M0 8v-10M7 8v-10M-9 -2l9 -7l9 7z' });
    else { m('path', { d: 'M-8 9v-10l8 -7l8 7v10z' }); m('rect', { x: -2.5, y: 2, width: 5, height: 7 }); } };
  const draw = () => {
    S.clear(); const on = x => show[x.kind] && (!sel || x.from === sel || x.to === sel);
    f.flows.forEach((x, i) => { const g = G[i], col = COL[x.kind], vis = on(x); S.mk('path', { d: `M${g.a[0]} ${g.a[1]}Q${g.c[0]} ${g.c[1]} ${g.b[0]} ${g.b[1]}`, fill: 'none', stroke: col, 'stroke-width': vis ? 2 : 1, opacity: vis ? 1 : .16, 'stroke-dasharray': x.kind === 'info' ? '2 4' : x.kind === 'goods' ? null : '7 3', 'marker-end': S.arrow(col) });
      if (!vis) return;
      // tokens: coins for money, crates for goods (still under reduced motion: one at the middle)
      (S.calm ? [.5] : [0, .5]).forEach(o => { const u = S.calm ? .5 : (t * .3 + o + i * .13) % 1, p = qpt(g.a, g.c, g.b, u); if (x.kind === 'goods') S.mk('rect', { x: p[0] - 4.5, y: p[1] - 4.5, width: 9, height: 9, fill: '#e4ebf3', stroke: col, 'stroke-width': 1.3 }); else if (x.kind === 'money') S.mk('circle', { cx: p[0], cy: p[1], r: 5, fill: '#f1d58a', stroke: col, 'stroke-width': 1.3 }); else S.mk('circle', { cx: p[0], cy: p[1], r: 3, fill: col }); });
      const L = labelAt[i]; if (L) { const b = L.box; S.mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 8, fill: 'rgba(251,246,234,.95)', stroke: col, 'stroke-width': .8 }); S.txt(b[0] + b[2] / 2, b[1] + 11.5, L.txt, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: col === FC.brass ? '#6b5426' : col, fit: b[2] - 6 }); } });
    f.actors.forEach(a => { const [x, y] = P.get(a.id), act = !sel || sel === a.id || f.flows.some(z => (z.from === sel && z.to === a.id) || (z.to === sel && z.from === a.id)); const g = S.g({ class: 'pnode', opacity: act ? 1 : .35, style: 'cursor:pointer' }); g.dataset.id = a.id;
      S.mk('circle', { cx: x, cy: y, r, fill: sel === a.id ? FC.hot : a.role === 'competitor' ? '#f6e4dc' : FC.card, stroke: sel === a.id ? FC.ink : a.role === 'competitor' ? FC.rubric : FC.brass, 'stroke-width': sel === a.id ? 2.4 : 1.6 }, g); glyph(a, x, y, g);
      const lw = S.narrow ? 100 : 130; S.txt(x, y + r + 14, a.label, { 'text-anchor': 'middle', 'font-weight': 600, 'font-size': S.fs - .5, fit: lw }, g); if (!S.narrow) S.txt(x, y + r + 27, a.note || a.role, { 'text-anchor': 'middle', 'font-size': S.fs - 3, fill: FC.soft, 'font-style': 'italic', fit: lw }, g); });
    // legend, top left
    [...new Set(f.flows.map(x => x.kind))].forEach((k, i) => { const x = 8 + i * 70, y = 12; S.mk('line', { x1: x, x2: x + 18, y1: y, y2: y, stroke: COL[k], 'stroke-width': 2, 'stroke-dasharray': k === 'info' ? '2 4' : k === 'goods' ? null : '7 3' }); S.txt(x + 22, y + 4, k, { 'font-size': S.fs - 2.5, fill: FC.soft }); });
    if (units) waterfall();
  };
  // the unit economics, below the network: price, each cost as a step down, the margin left
  const waterfall = () => { const x0 = 10, y0 = H0 + 6, w = W - 20, lw = S.narrow ? 112 : 150, vw = 58, bw = w - lw - vw - 8, rh = 21, cur = units.currency, money = v => cur + v.toFixed(2);
    S.mk('line', { x1: 10, x2: W - 10, y1: H0 - 4, y2: H0 - 4, stroke: FC.grid });
    const rows = [{ label: 'price', v: units.price, base: 0, tone: FC.lapis }]; let run = units.price; units.items.forEach(it => { run -= it.value; rows.push({ label: it.label, v: -it.value, base: run, tone: FC.rubric }); }); rows.push({ label: 'margin', v: run, base: 0, tone: run >= 0 ? FC.verd : FC.rubric, total: true });
    S.txt(x0, y0 + 14, units.title + ` — margin ${fmt(run / units.price * 100, 1)} % of the price`, { 'font-weight': 600, 'font-size': S.fs - .5, fit: w });
    const sc = bw / Math.max(units.price, 1e-9);
    rows.forEach((rw, i) => { const y = y0 + 24 + i * rh, len = Math.abs(rw.v) * sc, bx = x0 + lw + (rw.v < 0 ? rw.base * sc : 0);
      S.txt(x0 + lw - 8, y + 14, rw.label, { 'text-anchor': 'end', 'font-size': S.fs - 2, fill: FC.ink, fit: lw - 10, 'font-weight': rw.total ? 700 : null });
      S.mk('rect', { x: bx, y: y + 3, width: Math.max(1, len), height: rh - 7, fill: rw.tone, 'fill-opacity': rw.total ? .85 : .55, rx: 2 });
      S.txt(x0 + lw + bw + 8, y + 14, (rw.v < 0 ? '−' : '') + money(Math.abs(rw.v)), { mono: true, 'font-size': 11, fill: rw.tone, fit: vw });
      if (i < rows.length - 1) { const xe = x0 + lw + (rw.v < 0 ? rw.base : rw.v) * sc; S.mk('line', { x1: xe, x2: xe, y1: y + rh - 4, y2: y + rh + 3, stroke: FC.mute, 'stroke-dasharray': '2 2' }); } }); };
  const tell = () => { if (!sel) { S.say('<p>Press an actor to follow only its flows. Brass coins are money, lapis crates are goods; money always flows against the goods it pays for.</p>'); S.read([['actors', f.actors.length], ['flows', f.flows.length], units ? ['margin per sale', units.currency + (units.price - units.items.reduce((a, b) => a + b.value, 0)).toFixed(2)] : null]); return; }
    const a = f.actors.find(x => x.id === sel), ins = f.flows.filter(x => x.to === sel), outs = f.flows.filter(x => x.from === sel), name = id => (f.actors.find(x => x.id === id) || {}).label;
    S.say(`<p><b>${mathHTML(a.label)}</b> receives ${ins.length ? ins.map(x => `${mathHTML(x.label || x.kind)} <i>from ${mathHTML(name(x.from))}</i>`).join('; ') : 'nothing'}; gives ${outs.length ? outs.map(x => `${mathHTML(x.label || x.kind)} <i>to ${mathHTML(name(x.to))}</i>`).join('; ') : 'nothing'}.</p>`);
    S.read([['in', ins.length + ' flow' + (ins.length === 1 ? '' : 's')], ['out', outs.length + ' flow' + (outs.length === 1 ? '' : 's')]]); };
  S.svg.addEventListener('click', ev => { const g = ev.target.closest && ev.target.closest('.pnode'); sel = g ? (sel === g.dataset.id ? null : g.dataset.id) : null; tell(); draw(); });
  ['money', 'goods', 'info'].filter(k => f.flows.some(x => x.kind === k)).forEach(k => { const b = S.btn(k, () => { show[k] = !show[k]; b.classList.toggle('off', !show[k]); b.setAttribute('aria-pressed', String(show[k])); draw(); }, { title: 'Show or hide the ' + k + ' flows' }); b.setAttribute('aria-pressed', 'true'); });
  if (!S.calm) S.animate(dt => { t += dt; draw(); return S.alive && t < 30; });
  tell(); draw(); S.redraw = draw; S.select = id => { sel = id; tell(); draw(); };
  return { draw };
}
