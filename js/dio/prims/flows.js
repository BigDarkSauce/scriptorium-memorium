// flow_network (Modern MBA, Wendover): a business model as a system — customers, the firm, suppliers, intermediaries
// and competitors, with money (brass coins) and goods (lapis crates) moving between them, and the unit economics of one
// sale as a waterfall from the price down to the margin. Press an actor to see only its flows and its in/out.
// Spec: {actors:[{id,label,role,x?,y?,note?}], flows:[{from,to,kind:'money'|'goods'|'info',label,amount?}], units?:{title,price,currency,items:[{label,value}]}}
import { FC, qpt, fmt, mathHTML } from './kit.js';

export const size = (f, o) => { const u = !!f.units; return o.narrow ? { W: 360, H: u ? 300 + 40 + 22 * (f.units.items.length + 2) : 320 } : { W: 600, H: u ? 360 : 330 }; };
const COL = { money: FC.brass, goods: FC.lapis, info: FC.violet };
const COLUMN = { supplier: 0, partner: 0, firm: 1, platform: 1, regulator: 1, competitor: 1, intermediary: 2, customer: 3 };
export function render(f, S) {
  const { W } = S, units = f.units, netW = S.narrow ? W : units ? 400 : W, netH = S.narrow ? 300 : S.H, P = new Map(), r = 21;
  if (f.actors.every(a => a.x != null)) f.actors.forEach(a => P.set(a.id, [30 + a.x / 100 * (netW - 60), 34 + a.y / 60 * (netH - 80)]));
  else { const cols = [0, 1, 2, 3].map(c => f.actors.filter(a => COLUMN[a.role] === c)).filter(c => c.length), cw = (netW - 20) / cols.length;
    cols.forEach((col, ci) => { const low = col.filter(a => a.role === 'competitor' || a.role === 'regulator'), main = col.filter(a => !low.includes(a)), bot = netH - (low.length ? 104 : 52);
      main.forEach((a, j) => P.set(a.id, [10 + (ci + .5) * cw, 40 + (j + .5) * (bot - 40) / main.length])); low.forEach((a, j) => P.set(a.id, [10 + (ci + .5) * cw + (j - (low.length - 1) / 2) * 96, netH - 64])); }); }
  const pairIndex = (x, i) => f.flows.slice(0, i).filter(y => (y.from === x.from && y.to === x.to) || (y.from === x.to && y.to === x.from)).length;
  const geo = (x, i) => { const a = P.get(x.from), b = P.get(x.to), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = (.14 + .1 * pairIndex(x, i)) * L, c = [(a[0] + b[0]) / 2 + dy / L * k, (a[1] + b[1]) / 2 - dx / L * k]; const sh = (p, q, d) => { const vx = q[0] - p[0], vy = q[1] - p[1], l = Math.hypot(vx, vy) || 1; return [p[0] + vx / l * d, p[1] + vy / l * d]; }; return { a: sh(a, c, r + 4), b: sh(b, c, r + 9), c }; };
  const G = f.flows.map(geo);
  let show = { money: true, goods: true, info: true }, sel = null, t = 0;
  const glyph = (a, x, y, g) => { const s = S.mk('g', { transform: `translate(${x} ${y})` }, g), c = a.role === 'competitor' ? FC.rubric : FC.ink, m = (n, at) => S.mk(n, { fill: 'none', stroke: c, 'stroke-width': 1.5, ...at }, s);
    if (a.role === 'customer') { m('circle', { cx: 0, cy: -6, r: 4.5 }); m('path', { d: 'M-8 9a8 8 0 0 1 16 0' }); }
    else if (a.role === 'supplier' || a.role === 'partner') { m('rect', { x: -8, y: -7, width: 16, height: 14 }); m('path', { d: 'M-8 -2h16M0 -7v14' }); }
    else if (a.role === 'intermediary') { m('circle', { cx: -4, cy: 0, r: 6 }); m('circle', { cx: 4, cy: 0, r: 6 }); }
    else if (a.role === 'platform') m('path', { d: 'M-8 0l4 -7h8l4 7l-4 7h-8z' });
    else if (a.role === 'regulator') { m('path', { d: 'M-9 8h18M-7 8v-10M0 8v-10M7 8v-10M-9 -2l9 -7l9 7z' }); }
    else { m('path', { d: 'M-8 9v-10l8 -7l8 7v10z' }); m('rect', { x: -2.5, y: 2, width: 5, height: 7 }); } };
  const draw = () => {
    S.clear(); const on = x => show[x.kind] && (!sel || x.from === sel || x.to === sel);
    const labels = [];
    f.flows.forEach((x, i) => { const g = G[i], col = COL[x.kind], vis = on(x); S.mk('path', { d: `M${g.a[0]} ${g.a[1]}Q${g.c[0]} ${g.c[1]} ${g.b[0]} ${g.b[1]}`, fill: 'none', stroke: col, 'stroke-width': vis ? 2 : 1, opacity: vis ? 1 : .18, 'stroke-dasharray': x.kind === 'info' ? '2 4' : x.kind === 'goods' ? null : '7 3', 'marker-end': S.arrow(col) });
      if (!vis) return;
      // tokens: coins for money, crates for goods (still under reduced motion: one at the middle)
      [0, .5].forEach(o => { const u = S.calm ? .5 : (t * .35 + o + i * .13) % 1; if (S.calm && o) return; const p = qpt(g.a, g.c, g.b, u); if (x.kind === 'goods') S.mk('rect', { x: p[0] - 4.5, y: p[1] - 4.5, width: 9, height: 9, fill: '#e4ebf3', stroke: col, 'stroke-width': 1.3 }); else if (x.kind === 'money') S.mk('circle', { cx: p[0], cy: p[1], r: 5, fill: '#f1d58a', stroke: col, 'stroke-width': 1.3 }); else S.mk('circle', { cx: p[0], cy: p[1], r: 3, fill: col }); });
      if (x.label) { const txt = x.label + (x.amount != null ? ' · ' + fmt(x.amount) : ''), w = Math.min(130, txt.length * (S.fs - 2.5) * .52 + 12), h = 16; let best = null, bo = Infinity;
        for (const u of [.5, .38, .62, .28, .72]) { const p = qpt(g.a, g.c, g.b, u), box = [p[0] - w / 2, p[1] - h / 2, w, h]; const o = labels.reduce((s, b) => s + Math.max(0, Math.min(b[0] + b[2], box[0] + box[2]) - Math.max(b[0], box[0])) * Math.max(0, Math.min(b[1] + b[3], box[1] + box[3]) - Math.max(b[1], box[1])), 0) + [...P.values()].reduce((s, q) => s + (Math.hypot(q[0] - p[0], q[1] - p[1]) < r + 16 ? 400 : 0), 0); if (o < bo) { bo = o; best = box; } if (!o) break; }
        best[0] = Math.max(2, Math.min(netW - best[2] - 2, best[0])); labels.push(best); S.mk('rect', { x: best[0], y: best[1], width: best[2], height: best[3], rx: 8, fill: 'rgba(251,246,234,.94)', stroke: col, 'stroke-width': .8 }); S.txt(best[0] + best[2] / 2, best[1] + 11.5, txt, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: col === FC.brass ? '#6b5426' : col, fit: best[2] - 6 }); } });
    f.actors.forEach(a => { const [x, y] = P.get(a.id), act = !sel || sel === a.id || f.flows.some(z => (z.from === sel && z.to === a.id) || (z.to === sel && z.from === a.id)); const g = S.g({ class: 'pnode', opacity: act ? 1 : .35, style: 'cursor:pointer' }); g.dataset.id = a.id;
      S.mk('circle', { cx: x, cy: y, r, fill: sel === a.id ? FC.hot : a.role === 'competitor' ? '#f6e4dc' : FC.card, stroke: sel === a.id ? FC.ink : a.role === 'competitor' ? FC.rubric : FC.brass, 'stroke-width': sel === a.id ? 2.4 : 1.6 }, g); glyph(a, x, y, g);
      S.txt(x, y + r + 14, a.label, { 'text-anchor': 'middle', 'font-weight': 600, 'font-size': S.fs - .5, fit: S.narrow ? 100 : 130 }, g); S.txt(x, y + r + 27, a.note || a.role, { 'text-anchor': 'middle', 'font-size': S.fs - 3, fill: FC.soft, 'font-style': 'italic', fit: S.narrow ? 100 : 130 }, g); });
    // legend, top left
    const kinds = [...new Set(f.flows.map(x => x.kind))]; kinds.forEach((k, i) => { const x = 8 + i * 74, y = 12; S.mk('line', { x1: x, x2: x + 18, y1: y, y2: y, stroke: COL[k], 'stroke-width': 2, 'stroke-dasharray': k === 'info' ? '2 4' : k === 'goods' ? null : '7 3' }); S.txt(x + 22, y + 4, k, { 'font-size': S.fs - 2.5, fill: FC.soft }); });
    if (units) waterfall();
  };
  const waterfall = () => { const x0 = S.narrow ? 10 : netW + 10, y0 = S.narrow ? netH + 10 : 26, w = S.narrow ? W - 20 : W - netW - 18, rows = [{ label: 'price', v: units.price, base: 0, tone: FC.lapis }], lw = S.narrow ? 120 : 82, bw = w - lw - 50, rh = S.narrow ? 22 : Math.min(30, (S.H - 80) / (units.items.length + 2));
    let run = units.price; units.items.forEach(it => { run -= it.value; rows.push({ label: it.label, v: -it.value, base: run, tone: FC.rubric }); }); rows.push({ label: 'margin', v: run, base: 0, tone: run >= 0 ? FC.verd : FC.rubric, total: true });
    S.txt(x0, y0 + 2, units.title, { 'font-weight': 600, 'font-size': S.fs - .5, fit: w });
    const sc = bw / Math.max(units.price, 1e-9), cur = units.currency;
    rows.forEach((rw, i) => { const y = y0 + 16 + i * rh, a = rw.v >= 0 ? rw.base : rw.base, len = Math.abs(rw.v) * sc, bx = x0 + lw + Math.min(rw.base, rw.base + rw.v) * sc * (rw.v < 0 ? 1 : 1);
      S.txt(x0 + lw - 6, y + rh * .62, rw.label, { 'text-anchor': 'end', 'font-size': S.fs - 2.5, fill: FC.ink, fit: lw - 8, 'font-weight': rw.total ? 700 : null });
      S.mk('rect', { x: rw.v < 0 ? x0 + lw + rw.base * sc : x0 + lw, y: y + 3, width: Math.max(1, len), height: rh - 7, fill: rw.tone, 'fill-opacity': rw.total ? .85 : .55, rx: 2 });
      S.txt(x0 + lw + bw + 4, y + rh * .62, (rw.v < 0 ? '−' : '') + cur + fmt(Math.abs(rw.v), 2), { mono: true, 'font-size': 10.5, fill: rw.tone, fit: 48 });
      if (i < rows.length - 1) S.mk('line', { x1: x0 + lw + (rw.v < 0 ? rw.base : rw.v) * sc, x2: x0 + lw + (rw.v < 0 ? rw.base : rw.v) * sc, y1: y + rh - 4, y2: y + rh + 3, stroke: FC.mute, 'stroke-dasharray': '2 2' }); });
    S.txt(x0, y0 + 16 + rows.length * rh + 12, `margin ${fmt(run / units.price * 100, 1)} % of the price`, { 'font-size': S.fs - 2, fill: run >= 0 ? FC.verd : FC.rubric, 'font-style': 'italic', fit: w }); };
  const tell = () => { if (!sel) { S.say('<p>Press an actor to follow only its flows. Brass coins are money, lapis crates are goods; money always flows against the goods it pays for.</p>'); S.read([['actors', f.actors.length], ['flows', f.flows.length], units ? ['margin per sale', units.currency + fmt(units.price - units.items.reduce((a, b) => a + b.value, 0), 2)] : null]); return; }
    const a = f.actors.find(x => x.id === sel), ins = f.flows.filter(x => x.to === sel), outs = f.flows.filter(x => x.from === sel), name = id => (f.actors.find(x => x.id === id) || {}).label;
    S.say(`<p><b>${mathHTML(a.label)}</b> receives ${ins.length ? ins.map(x => `${mathHTML(x.label || x.kind)} <i>from ${mathHTML(name(x.from))}</i>`).join('; ') : 'nothing'}; gives ${outs.length ? outs.map(x => `${mathHTML(x.label || x.kind)} <i>to ${mathHTML(name(x.to))}</i>`).join('; ') : 'nothing'}.</p>`);
    S.read([['in', ins.length], ['out', outs.length], ['money in', ins.filter(x => x.kind === 'money' && x.amount != null).reduce((s, x) => s + x.amount, 0) || '—']]); };
  S.svg.addEventListener('click', ev => { const g = ev.target.closest && ev.target.closest('.pnode'); sel = g ? (sel === g.dataset.id ? null : g.dataset.id) : null; tell(); draw(); });
  ['money', 'goods', 'info'].filter(k => f.flows.some(x => x.kind === k)).forEach(k => { const b = S.btn(k, () => { show[k] = !show[k]; b.classList.toggle('off', !show[k]); b.setAttribute('aria-pressed', String(show[k])); draw(); }, { title: 'Show or hide the ' + k + ' flows' }); b.setAttribute('aria-pressed', 'true'); });
  if (!S.calm) S.animate(dt => { t += dt; draw(); return S.alive && t < 40; });
  tell(); draw(); S.redraw = draw; S.select = id => { sel = id; tell(); draw(); };
  return { draw };
}
