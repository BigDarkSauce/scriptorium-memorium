// analogy_map: an analogy with its seams showing. A familiar source is laid beside the target; each line carries a
// correspondence (and the relation that transfers), and the bottom band says where the likeness breaks. Comparing two
// cases and mapping their shared structure improves transfer (Gentner, Loewenstein & Thompson 2003); an analogy left
// without its limits installs a misconception, so "breaks" is required (js/dio/domains.js).
// Spec: {source, target, maps:[{a, b, rel}], breaks:[...]}
import { FC, wrapText } from './kit.js';
import { glyphFor, drawGlyph } from '../../room/glyphs.js';

export const size = (f, o) => { const rows = f.maps.length, br = f.breaks.length; return o.narrow ? { W: 360, H: 64 + rows * 46 + 34 + br * 46 } : { W: 600, H: 60 + rows * 40 + 34 + br * 32 }; };
export function render(f, S) {
  const { W } = S, nar = S.narrow, colW = nar ? (W - 60) / 2 : W * .36, xa = 10, xb = W - 10 - colW, rowH = nar ? 46 : 40, y0 = 48;
  let sel = -1;
  const draw = () => {
    S.clear();
    const head = (x, t, c, side) => { S.mk('rect', { x, y: 8, width: colW, height: 28, rx: 8, fill: c === FC.lapis ? '#e4ebf3' : '#f4ead2', stroke: c }); const g = glyphFor(t); if (g) drawGlyph(S.layer, g, x + 16, 22, 15, c, { animate: !S.calm }); S.txt(x + (g ? 30 : 10), 27, (side ? '' : '') + t, { 'font-weight': 700, fill: c, fit: colW - (g ? 38 : 18) }); };
    head(xa, f.source, FC.brass, 0); head(xb, f.target, FC.lapis, 1);
    f.maps.forEach((m, i) => { const y = y0 + i * rowH, on = sel === -1 || sel === i, op = on ? 1 : .3;
      const cell = (x, t, c) => { S.mk('rect', { x, y, width: colW, height: rowH - 8, rx: 6, fill: FC.card, stroke: c, opacity: op }); S.lines(x + colW / 2, y + (rowH - 8) / 2, t, colW - 14, { 'text-anchor': 'middle', valign: 'middle', 'font-size': S.fs - .5, opacity: op }, S.layer, 2); };
      cell(xa, m.a, FC.brass); cell(xb, m.b, FC.lapis);
      const mx = (xa + colW + xb) / 2, yy = y + (rowH - 8) / 2;
      S.mk('line', { x1: xa + colW + 2, x2: xb - 2, y1: yy, y2: yy, stroke: on ? FC.ink : FC.mute, 'stroke-width': on ? 1.5 : 1, 'stroke-dasharray': '1 0', opacity: op, 'marker-end': S.arrow(on ? FC.ink : FC.mute) });
      if (m.rel && !nar) S.txt(mx, yy - 4, m.rel, { 'text-anchor': 'middle', 'font-size': S.fs - 3, 'font-style': 'italic', fill: FC.soft, fit: xb - xa - colW - 12, stroke: FC.bg, 'stroke-width': 3, 'paint-order': 'stroke', opacity: op });
      const hit = S.mk('rect', { x: xa, y, width: W - 20, height: rowH - 8, fill: 'transparent', style: 'cursor:pointer' }); hit.addEventListener('click', () => { sel = sel === i ? -1 : i; draw(); }); });
    // where the likeness breaks: a torn edge, in rubric
    let y = y0 + f.maps.length * rowH + 8; S.mk('path', { d: `M10 ${y}` + [...Array(Math.ceil((W - 20) / 6))].map((_, k) => `l6 ${k % 2 ? -4 : 4}`).join(''), fill: 'none', stroke: FC.rubric, 'stroke-width': 1.2 });
    S.txt(10, y + 18, 'Where the likeness breaks', { 'font-weight': 700, fill: FC.rubric, 'font-size': S.fs - 1 }); y += 26;
    f.breaks.forEach(b => { const L = wrapText(b, Math.floor((W - 44) / (S.fs * .5))); if (L.length > 2) { L.length = 2; L[1] = L[1].replace(/[\s,;:.]*$/, '') + '…'; } S.txt(14, y + 10, '✗', { fill: FC.rubric, 'font-size': S.fs - 1 }); L.forEach((l, k) => S.txt(28, y + 10 + k * S.fs * 1.2, l, { 'font-size': S.fs - 1, fit: W - 40 })); y += 12 + L.length * S.fs * 1.2; });
  };
  S.say('<p>Each line carries one correspondence across. Click a row to follow it alone. Then read the torn edge: the parts of the target the source would get wrong.</p>');
  draw(); S.redraw = draw; return { draw };
}
