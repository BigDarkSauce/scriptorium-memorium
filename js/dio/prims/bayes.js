// bayes_update: uncertainty as a visible object. Rival hypotheses start at their prior; each piece of evidence, when the
// reader reveals it, reweights them by how likely that evidence is under each (Bayes' rule), and the bars move. The same
// state is drawn as natural frequencies, 100 cases coloured by hypothesis, because counts are what people reason with
// best (McDowell & Jacobs 2017, meta-analysis, doi:10.1037/bul0000126). The reader predicts which hypothesis an item
// will favour before revealing it: the update is the reveal.
// Spec: {hypotheses:[{id,label,prior}], evidence:[{id,label,like:{hid:P(e|h)},note?}], question?}
import { FC, fmt, SERIES } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 300 } : { W: 600, H: 280 };
export function render(f, S) {
  const { W, H } = S, Hs = f.hypotheses, col = i => SERIES[i % SERIES.length];
  let seen = new Set(), anim = null;
  const post = (set) => { const w = Hs.map(h => h.prior * f.evidence.filter(e => set.has(e.id)).reduce((a, e) => a * e.like[h.id], 1)); const z = w.reduce((a, b) => a + b, 0) || 1; return w.map(x => x / z); };
  let shown = post(seen);
  const draw = () => {
    S.clear(); const narrow = S.narrow, barX = narrow ? 12 : 16, barW = narrow ? W - 24 : W * .52, top = 30, rowH = Math.min(46, (H - top - 20) / Hs.length);
    S.txt(barX, 18, f.question || 'How likely is each explanation?', { 'font-weight': 600, fit: barW });
    Hs.forEach((h, i) => { const y = top + i * rowH, p = shown[i];
      S.txt(barX, y + 13, h.label, { 'font-size': S.fs - .5, fit: barW - 60 });
      S.mk('rect', { x: barX, y: y + 18, width: barW, height: 13, rx: 3, fill: 'rgba(90,60,30,.07)' });
      S.mk('rect', { x: barX, y: y + 18, width: Math.max(1, barW * p), height: 13, rx: 3, fill: col(i), opacity: .85 });
      // the prior as a tick: how far the evidence has moved this belief
      S.mk('line', { x1: barX + barW * h.prior, x2: barX + barW * h.prior, y1: y + 15, y2: y + 34, stroke: FC.ink, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' });
      S.txt(barX + barW, y + 13, fmt(p * 100, 0) + ' %', { 'text-anchor': 'end', mono: true, 'font-size': 11.5, fill: col(i) }); });
    S.txt(barX, H - 6, 'dashed tick: the belief before any evidence', { 'font-size': S.fs - 3, fill: FC.soft, 'font-style': 'italic', fit: barW });
    if (!narrow) { // 100 cases as natural frequencies: 10 × 10 icons coloured by hypothesis, in proportion
      const x0 = W * .6, cs = Math.min((W - x0 - 14) / 10, (H - 50) / 10), n = Hs.map((_, i) => Math.round(shown[i] * 100)); let k = 0, d = n.reduce((a, b) => a + b, 0) - 100; n[n.indexOf(Math.max(...n))] -= d;
      S.txt(x0, 18, 'out of 100 cases like this', { 'font-size': S.fs - 1.5, fill: FC.soft, 'font-style': 'italic' });
      n.forEach((c, i) => { for (let j = 0; j < c; j++, k++) { const cx = x0 + (k % 10) * cs + cs / 2, cy = 32 + Math.floor(k / 10) * cs + cs / 2; S.mk('circle', { cx, cy, r: cs * .36, fill: col(i), opacity: .85 }); } }); }
  };
  // evidence cards: each one, revealed, multiplies in its likelihoods
  const cards = f.evidence.map(e => S.btn(e.label, () => { if (seen.has(e.id)) seen.delete(e.id); else seen.add(e.id); go(); cards.forEach((b, j) => b.classList.toggle('on', seen.has(f.evidence[j].id))); }, { cls: 'ev', title: 'Reveal this evidence (again to take it back)' }));
  const go = () => { const to = post(seen), from = shown.slice(); if (S.calm) { shown = to; draw(); say(); return; } let t = 0; anim = S.animate(dt => { t = Math.min(1, t + dt * 2.2); const e = t * t * (3 - 2 * t); shown = from.map((v, i) => v + (to[i] - v) * e); draw(); return t < 1; }); say(); };
  const say = () => { const last = [...seen].pop(), e = last && f.evidence.find(x => x.id === last);
    if (!e) { S.say('<p>Each card is a piece of evidence. Before revealing one, guess which explanation it favours. A card favours the explanation under which it is <i>most likely</i>, not the one it "sounds like".</p>'); return; }
    const ranks = Hs.map(h => [h.label, e.like[h.id]]).sort((a, b) => b[1] - a[1]); S.say(`<p><b>${e.label}</b>: ${ranks.map(([l, v]) => `${l} ${fmt(v * 100, 0)} %`).join(' · ')} likely under each. ${e.note || ''}</p>`); };
  S.btn('Reset', () => { seen = new Set(); cards.forEach(b => b.classList.remove('on')); go(); });
  S.read(Hs.map((h, i) => [h.label + ' prior', fmt(h.prior * 100, 0) + ' %']));
  draw(); say(); S.redraw = draw; void anim;
  S.reveal = id => { seen.add(id); go(); };
  return { draw };
}
