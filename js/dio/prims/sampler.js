// distribution_lab (Seeing Theory): a distribution built sample by sample. Each sample is stored as a standard draw z
// and shown as x = μ + σz, so moving the μ and σ sliders moves every sample already drawn, the histogram with them,
// and the density curve; μ is the dashed lapis line and σ the rubric bracket, in the picture and in the formula.
// Spec: {dist:'normal'|'uniform'|'exponential', mu, sigma, range:[lo,hi], muRange, sigmaRange, xlabel?, unit?, seed?}
import { FC, fmt, rng, NS } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 330 } : { W: 600, H: 320 };
const FORMULA = { normal: 'f(x) = 1/(σ√(2π)) · e^(−(x − μ)²/(2σ²))', uniform: 'f(x) = 1/(2√3·σ) on μ ± √3·σ', exponential: 'f(x) = (1/σ)·e^(−(x − μ + σ)/σ) for x ≥ μ − σ' };
export function render(f, S) {
  const { W, H } = S, P = { l: 40, r: 14, t: 52, b: 34 }, R = rng(f.seed || 7);
  let mu = f.mu, sg = f.sigma, Z = [], drops = [];
  const [lo, hi] = f.range, X = x => P.l + (x - lo) / (hi - lo) * (W - P.l - P.r);
  // standard draws: normal (Box–Muller), uniform on [−√3, √3], exponential shifted to mean 0 (all have mean 0, sd 1)
  const draw1 = () => f.dist === 'uniform' ? (R() * 2 - 1) * Math.sqrt(3) : f.dist === 'exponential' ? -Math.log(1 - R()) - 1 : Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
  const pdf = x => { if (f.dist === 'uniform') return Math.abs(x - mu) <= Math.sqrt(3) * sg ? 1 / (2 * Math.sqrt(3) * sg) : 0; if (f.dist === 'exponential') { const y = (x - mu + sg) / sg; return y < 0 ? 0 : Math.exp(-y) / sg; } return Math.exp(-((x - mu) ** 2) / (2 * sg * sg)) / (sg * Math.sqrt(2 * Math.PI)); };
  const B = S.narrow ? 24 : 36, bw = (hi - lo) / B;
  const colorize = (t, map) => { [...t.childNodes].forEach(n => { const s = n.textContent; if (!/[μσ]/.test(s)) return; const parts = s.split(/([μσ])/).filter(x => x !== ''); const host = n.nodeType === 3 ? null : n; const make = (txt, col) => { const e = document.createElementNS(NS, 'tspan'); e.textContent = txt; if (host) ['font-style', 'font-size'].forEach(a => host.getAttribute(a) && e.setAttribute(a, host.getAttribute(a))); if (col) { e.setAttribute('fill', col); e.setAttribute('font-weight', '700'); } return e; }; const frag = parts.map(p => make(p, map[p])); if (host && host.getAttribute('dy')) frag[0].setAttribute('dy', host.getAttribute('dy')); n.replaceWith(...frag); }); };
  const peakMax = () => f.dist === 'exponential' ? 1 / f.sigmaRange[0] : f.dist === 'uniform' ? 1 / (2 * Math.sqrt(3) * f.sigmaRange[0]) : 1 / (f.sigmaRange[0] * Math.sqrt(2 * Math.PI));
  const draw = () => {
    S.clear(); const xs = Z.map(z => mu + sg * z), n = xs.length, bins = new Array(B).fill(0); xs.forEach(x => { const b = Math.floor((x - lo) / bw); if (b >= 0 && b < B) bins[b]++; });
    const top = Math.max(pdf(mu) * 1.3, Math.min(peakMax(), Math.max(...bins.map(c => n ? c / (n * bw) : 0)) * 1.1)), Y = y => H - P.b - y / top * (H - P.t - P.b);
    const ft = S.txt(10, 22, FORMULA[f.dist], { 'font-size': S.narrow ? 13 : 15, fit: W - 20 }); colorize(ft, { 'μ': FC.lapis, 'σ': FC.rubric });
    S.txt(W - 10, 40, `μ = ${fmt(mu, 2)}   σ = ${fmt(sg, 2)}`, { 'text-anchor': 'end', mono: true, 'font-size': 11.5, fill: FC.soft });
    // axis
    S.mk('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, stroke: FC.soft }); const step = (hi - lo) > 20 ? 5 : (hi - lo) > 8 ? 2 : 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { S.mk('line', { x1: X(v), x2: X(v), y1: H - P.b, y2: H - P.b + 4, stroke: FC.soft }); S.txt(X(v), H - P.b + 16, fmt(v, 2), { 'text-anchor': 'middle', mono: true, 'font-size': 10, fill: FC.soft }); }
    if (f.xlabel) S.txt(W - P.r, H - 4, f.xlabel + (f.unit ? ' (' + f.unit + ')' : ''), { 'text-anchor': 'end', 'font-size': S.fs - 1.5, fill: FC.soft, 'font-style': 'italic' });
    // ±σ band, histogram, density
    S.mk('rect', { x: X(mu - sg), y: P.t, width: Math.max(0, X(mu + sg) - X(mu - sg)), height: H - P.t - P.b, fill: 'rgba(156,58,40,.06)' });
    bins.forEach((c, i) => { if (!c) return; const h = c / (n * bw); S.mk('rect', { x: X(lo + i * bw) + .5, y: Math.max(P.t, Y(h)), width: Math.max(1, X(lo + bw) - X(lo) - 1), height: H - P.b - Math.max(P.t, Y(h)), fill: 'rgba(45,91,142,.42)' }); });
    let d = ''; for (let i = 0; i <= 240; i++) { const x = lo + (hi - lo) * i / 240; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Math.max(P.t, Y(pdf(x))).toFixed(1); } S.mk('path', { d, fill: 'none', stroke: FC.ink, 'stroke-width': 2 });
    S.mk('line', { x1: X(mu), x2: X(mu), y1: P.t - 4, y2: H - P.b, stroke: FC.lapis, 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }); S.txt(X(mu) + 5, P.t + 8, 'μ', { fill: FC.lapis, 'font-style': 'italic', 'font-weight': 700 });
    const yb = Y(pdf(mu + sg) || pdf(mu) * .6); if (f.dist === 'normal' || f.dist === 'uniform') { S.mk('line', { x1: X(mu - sg), x2: X(mu + sg), y1: yb, y2: yb, stroke: FC.rubric, 'stroke-width': 2 }); [mu - sg, mu + sg].forEach(v => S.mk('line', { x1: X(v), x2: X(v), y1: yb - 5, y2: yb + 5, stroke: FC.rubric, 'stroke-width': 2 })); S.txt(X(mu + sg) + 4, yb + 4, 'σ', { fill: FC.rubric, 'font-style': 'italic', 'font-weight': 700 }); }
    drops.forEach(p => S.mk('circle', { cx: X(mu + sg * p.z), cy: P.t + (H - P.b - P.t) * p.y, r: 3.4, fill: FC.rubric }));
    const mean = n ? xs.reduce((a, b) => a + b, 0) / n : NaN, sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN, within = n ? xs.filter(x => Math.abs(x - mu) <= sg).length / n : NaN;
    const theory = f.dist === 'normal' ? .6827 : f.dist === 'uniform' ? 1 / Math.sqrt(3) : 1 - Math.exp(-2);
    S.read([['samples', n], ['sample mean x̄', n ? fmt(mean, 3) : '—'], ['sample sd s', n > 1 ? fmt(sd, 3) : '—'], ['within μ ± σ', n ? fmt(within * 100, 1) + ' % (theory ' + fmt(theory * 100, 1) + ' %)' : '—']]);
    if (!n) S.txt(W / 2, (P.t + H - P.b) / 2, 'press +1 to draw a first sample', { 'text-anchor': 'middle', fill: FC.soft, 'font-style': 'italic' });
  };
  S.slider('μ (mean)', f.muRange[0], f.muRange[1], mu, (f.muRange[1] - f.muRange[0]) / 200, v => { mu = v; draw(); }, v => fmt(v, 2));
  S.slider('σ (spread)', f.sigmaRange[0], f.sigmaRange[1], sg, (f.sigmaRange[1] - f.sigmaRange[0]) / 200, v => { sg = v; draw(); }, v => fmt(v, 2));
  const fall = () => S.animate(dt => { drops.forEach(p => { p.y += dt * 2.4; }); const land = drops.filter(p => p.y >= 1); land.forEach(p => Z.push(p.z)); drops = drops.filter(p => p.y < 1); draw(); return drops.length > 0; });
  S.btn('+1 sample', () => { const z = draw1(); if (S.calm) { Z.push(z); draw(); return; } drops.push({ z, y: 0 }); fall(); }, { primary: true });
  S.btn('+100', () => { const add = [...Array(100)].map(draw1); if (S.calm) { Z.push(...add); draw(); return; } add.forEach((z, i) => drops.push({ z, y: -i * .03 })); fall(); });
  S.btn('Clear', () => { Z = []; drops = []; draw(); });
  S.say(`<p>Each dot is one random draw. Move <b style="color:${FC.lapis}">μ</b> and every sample slides with it; widen <b style="color:${FC.rubric}">σ</b> and they spread out: the histogram follows the curve because the curve is what many draws converge to.</p>`);
  draw(); S.redraw = draw;
  S.addSamples = k => { for (let i = 0; i < k; i++) Z.push(draw1()); draw(); };
  S.setParams = (m, s) => { mu = m; sg = s; draw(); };
  return { draw };
}
