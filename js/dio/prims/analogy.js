// analogy_map: an analogy with its seams showing. A familiar source is laid beside the target; each line carries a
// correspondence (and the relation that transfers), and the bottom band says where the likeness breaks. Comparing two
// cases and mapping their shared structure improves transfer (Gentner, Loewenstein & Thompson 2003); an analogy left
// without its limits installs a misconception, so "breaks" is required (js/dio/domains.js).
// Selecting a row opens a panel under the figure that DRAWS both sides of that correspondence (js/dio/prims/depict.js:
// a process plays as a short loop, an object or a quantity is a precise still), so the likeness is seen, not only read;
// selecting a "where the likeness breaks" row draws the source's behaviour beside the target's, which differs.
// Spec: {source, target, maps:[{a, b, rel, depict?:{source, target}}], breaks:[str], breakDepict?:[{source, target}]}
import { FC, wrapText } from './kit.js';
import { el, mathHTML } from '../../util.js';
import { glyphFor, drawGlyph } from '../../room/glyphs.js';
import { pickDepict, mountDepict, splitBreak, normDepict } from './depict.js';

const FZ = 12.5, LH = 16;   // every label of the map, the relation on its arrow included, is set at 12.5 px or more
const lines = (s, w, f = FZ) => wrapText(String(s || ''), Math.max(6, Math.floor(w / (f * .55))));
function layout(f, narrow) {
  const W = narrow ? 360 : 600, colW = narrow ? (W - 60) / 2 : Math.round(W * .33), gap = W - 20 - 2 * colW, y0 = 48;
  let y = y0; const rows = f.maps.map(m => { const cl = Math.max(lines(m.a, colW - 14).length, lines(m.b, colW - 14).length), rl = narrow || !m.rel ? 0 : lines(m.rel, gap - 14).length;
    const h = Math.max(38, cl * LH + 14, rl ? (Math.ceil(rl / 2) * LH) * 2 + 14 : 0), r = { y, h }; y += h + 8; return r; });
  const ty = y + 8; y = ty + 26; const brk = f.breaks.map(b => { const L = lines(b, W - 64); const h = L.length * LH + 10, r = { y, h, L }; y += h + 6; return r; });
  return { W, H: Math.ceil(y + 6), colW, gap, y0, rows, ty, brk };
}
export const size = (f, o) => { const L = layout(f, o.narrow); return { W: L.W, H: L.H }; };
export function render(f, S) {
  const nar = S.narrow, Lo = layout(f, nar), { W, colW, rows, brk } = Lo, xa = 10, xb = W - 10 - colW;
  const worldA = [f.source, ...f.maps.map(m => m.a)].join(' · '), worldB = [f.target, ...f.maps.map(m => m.b)].join(' · ');
  let sel = null, stops = [];   // sel = {t: 'm' | 'b', i}
  const panel = el('div', { class: 'an-panel', 'aria-live': 'polite', hidden: true }); S.frame.after(panel);
  const isSel = (t, i) => !!(sel && sel.t === t && sel.i === i);
  const hitbox = (x, y, w, h, t, i, label) => { const r = S.mk('rect', { x, y, width: w, height: h, rx: 6, fill: 'transparent', style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-pressed': String(isSel(t, i)), 'aria-label': label, class: 'an-hit' });
    const go = key => { sel = isSel(t, i) ? null : { t, i }; draw(); show(); const again = key && S.svg.querySelector(`.an-hit[data-k="${t}${i}"]`); if (again) again.focus({ preventScroll: true }); };   /* the keyboard keeps its place in the rows */
    r.dataset.k = t + i; r.addEventListener('click', () => go(false)); r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(true); } }); return r; };
  const draw = () => {
    S.clear();
    const head = (x, t, c) => { S.mk('rect', { x, y: 8, width: colW, height: 28, rx: 8, fill: c === FC.lapis ? '#e4ebf3' : '#f4ead2', stroke: c }); const g = glyphFor(t); if (g) drawGlyph(S.layer, g, x + 16, 22, 15, c, { animate: !S.calm }); S.txt(x + (g ? 30 : 10), 27, t, { 'font-weight': 700, fill: c, 'font-size': FZ, fit: colW - (g ? 38 : 18) }); };
    head(xa, f.source, FC.brass); head(xb, f.target, FC.lapis);
    f.maps.forEach((m, i) => { const { y, h } = rows[i], on = !sel || sel.t !== 'm' || sel.i === i, op = on ? 1 : .3, me = isSel('m', i);
      const cell = (x, t, c) => { S.mk('rect', { x, y, width: colW, height: h, rx: 6, fill: me ? (c === FC.lapis ? '#eef3fa' : '#fbf2dc') : FC.card, stroke: c, 'stroke-width': me ? 2.2 : 1, opacity: op }); const L = lines(t, colW - 14); L.forEach((l, k) => S.txt(x + colW / 2, y + h / 2 - (L.length - 1) * LH / 2 + k * LH + FZ * .35, l, { 'text-anchor': 'middle', 'font-size': FZ, opacity: op })); };
      cell(xa, m.a, FC.brass); cell(xb, m.b, FC.lapis);
      const mx = (xa + colW + xb) / 2, yy = y + h / 2;
      S.mk('line', { x1: xa + colW + 2, x2: xb - 2, y1: yy, y2: yy, stroke: on ? FC.ink : FC.mute, 'stroke-width': on ? 1.5 : 1, opacity: op, 'marker-end': S.arrow(on ? FC.ink : FC.mute) });
      if (m.rel && !nar) { const L = lines(m.rel, Lo.gap - 14), up = Math.ceil(L.length / 2); L.forEach((l, k) => S.txt(mx, k < up ? yy - 5 - (up - 1 - k) * LH : yy + FZ + 3 + (k - up) * LH, l, { 'text-anchor': 'middle', 'font-size': FZ, 'font-style': 'italic', fill: FC.soft, stroke: FC.bg, 'stroke-width': 3, 'paint-order': 'stroke', opacity: op })); }
      hitbox(xa - 2, y - 2, W - 16, h + 4, 'm', i, `Show ${m.a} and ${m.b}, drawn`); });
    // where the likeness breaks: a torn edge, in rubric; each break is a row of its own, drawn when selected
    const ty = Lo.ty; S.mk('path', { d: `M10 ${ty}` + [...Array(Math.ceil((W - 20) / 6))].map((_, k) => `l6 ${k % 2 ? -4 : 4}`).join(''), fill: 'none', stroke: FC.rubric, 'stroke-width': 1.2 });
    S.txt(10, ty + 19, 'Where the likeness breaks', { 'font-weight': 700, fill: FC.rubric, 'font-size': FZ });
    f.breaks.forEach((b, i) => { const { y, h, L } = brk[i], me = isSel('b', i);
      S.mk('rect', { x: 8, y, width: W - 16, height: h, rx: 6, fill: me ? 'rgba(156,58,40,.09)' : 'rgba(156,58,40,.03)', stroke: me ? FC.rubric : 'rgba(156,58,40,.25)', 'stroke-width': me ? 1.8 : 1 });
      S.txt(18, y + 5 + FZ, '✗', { fill: FC.rubric, 'font-size': FZ, 'font-weight': 700 }); L.forEach((l, k) => S.txt(34, y + 5 + FZ + k * LH, l, { 'font-size': FZ }));
      S.txt(W - 14, y + 5 + FZ, me ? '▾' : '▸', { 'text-anchor': 'end', fill: FC.rubric, 'font-size': FZ });
      hitbox(8, y, W - 16, h, 'b', i, 'Show where the likeness breaks: ' + b); });
  };
  // the panel: both sides drawn, side by side
  const side = (cls, kicker, color, spec, words) => { const fig = el('figure', { class: 'an-side ' + cls }), vig = el('div', { class: 'an-vig' }); fig.append(el('figcaption', { class: 'an-k', html: mathHTML(kicker, 'label') }), vig, el('p', { class: 'an-words', html: mathHTML(words) })); stops.push(mountDepict(vig, spec, { color, title: words, seed: kicker + words })); return fig; };
  const unify = (a, b) => { const fam = ['barrier', 'collision', 'agents']; if (a.kind !== b.kind && fam.includes(a.kind) && fam.includes(b.kind)) { const k = fam.find(x => x === a.kind || x === b.kind); return [{ kind: k, params: a.params }, { kind: k, params: b.params }]; } return [a, b]; };
  const show = () => {
    stops.forEach(s => s()); stops = []; panel.innerHTML = ''; panel.hidden = !sel; if (!sel) return;
    if (sel.t === 'm') { const m = f.maps[sel.i], d = m.depict || {};
      const ds = normDepict(d.source) || pickDepict(m.a, { world: worldA, side: 'source' }), dt = normDepict(d.target) || pickDepict(m.b, { world: worldB, side: 'target' });
      panel.append(el('div', { class: 'an-head' }, [el('b', { html: mathHTML(m.a) }), el('span', { class: 'an-arrow', text: ' ⟶ ' }), el('b', { html: mathHTML(m.b) }), m.rel ? el('i', { html: ' · ' + mathHTML(m.rel) }) : null]),
        el('div', { class: 'an-cols' }, [side('src', 'In ' + f.source, FC.brass, ds, m.a), side('tgt', 'In ' + f.target, FC.lapis, dt, m.b)]));
    } else { const b = f.breaks[sel.i], d = (f.breakDepict && f.breakDepict[sel.i]) || {}, parts = splitBreak(b), sa = parts ? parts[0] : b, sb = parts ? parts[1] : b;
      let ds = normDepict(d.source) || pickDepict(sa, { world: worldA, side: 'source' }), dt = normDepict(d.target) || pickDepict(sb, { world: worldB, side: 'target' }); if (!d.source && !d.target) [ds, dt] = unify(ds, dt);
      panel.classList.add('an-break');
      panel.append(el('div', { class: 'an-head brk' }, [el('span', { class: 'an-x', text: '✗ ' }), el('span', { html: mathHTML(b) })]),
        el('div', { class: 'an-cols' }, [side('src', 'What ' + f.source + ' does', FC.brass, ds, parts ? sa : 'The ' + f.source), side('tgt', 'What ' + f.target + ' does instead', FC.lapis, dt, parts ? sb : 'The ' + f.target)]));
    }
    if (sel.t === 'm') panel.classList.remove('an-break');
  };
  S.say('<p>Each line carries one correspondence across: click it to see both sides drawn. Then open the torn edge: each ✗ shows what the source does and what the target does instead.</p>');
  draw(); S.redraw = draw; const dispose0 = S.dispose; S.dispose = () => { stops.forEach(s => s()); stops = []; dispose0(); };
  return { draw, select: (t, i) => { sel = { t, i }; draw(); show(); } };
}
