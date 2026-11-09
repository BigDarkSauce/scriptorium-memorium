// emergence: a whole that no part intended. Schelling's model (1971): two kinds of agent on a grid; an agent moves to a
// random empty cell when fewer than t of its neighbours are like it. Even a mild preference (t ≈ 1/3: "I'm fine as a
// minority, just not a small one") ends in strongly sorted neighbourhoods. The reader predicts the final sameness before
// running, then compares thresholds: the gap between the local rule and the global pattern is the "aha".
// Spec: {size, density, share, threshold, labels:[a, b], seed}
import { FC, fmt, rng } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 300 } : { W: 600, H: 300 };
export function render(f, S) {
  const { W, H } = S, n = f.size, R = rng(f.seed || 7); let t = f.threshold, grid, rounds = 0, running = false, history = [];
  const reset = () => { grid = new Array(n * n).fill(0); for (let i = 0; i < n * n; i++) if (R() < f.density) grid[i] = R() < f.share ? 1 : 2; rounds = 0; history = [sameness()]; };
  const nb = i => { const x = i % n, y = (i / n) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = (x + dx + n) % n, Y = (y + dy + n) % n; out.push(Y * n + X); } return out; };
  const unhappy = i => { const me = grid[i]; if (!me) return false; const N = nb(i).filter(j => grid[j]); if (!N.length) return false; return N.filter(j => grid[j] === me).length / N.length < t; };
  function sameness() { let s = 0, c = 0; for (let i = 0; i < n * n; i++) if (grid[i]) { const N = nb(i).filter(j => grid[j]); if (N.length) { s += N.filter(j => grid[j] === grid[i]).length / N.length; c++; } } return c ? s / c : 0; }
  const step = () => { const U = [], E = []; for (let i = 0; i < n * n; i++) { if (!grid[i]) E.push(i); else if (unhappy(i)) U.push(i); } for (let k = U.length - 1; k > 0; k--) { const j = (R() * (k + 1)) | 0; [U[k], U[j]] = [U[j], U[k]]; }
    U.forEach(i => { if (!E.length) return; const e = (R() * E.length) | 0, to = E[e]; grid[to] = grid[i]; grid[i] = 0; E[e] = i; }); rounds++; history.push(sameness()); return U.length; };
  const draw = () => {
    S.clear(); const side = Math.min(H - 20, S.narrow ? W - 24 : W * .52), cs = side / n, x0 = S.narrow ? (W - side) / 2 : 12, y0 = 10;
    for (let i = 0; i < n * n; i++) { if (!grid[i]) continue; const x = x0 + (i % n) * cs, y = y0 + ((i / n) | 0) * cs, un = unhappy(i), c = grid[i] === 1 ? FC.lapis : FC.rubric;
      if (grid[i] === 1) S.mk('path', { d: `M${x + cs / 2} ${y + cs * .15}L${x + cs * .88} ${y + cs * .85}L${x + cs * .12} ${y + cs * .85}z`, fill: un ? 'none' : c, stroke: c, 'stroke-width': 1 });
      else S.mk('rect', { x: x + cs * .16, y: y + cs * .16, width: cs * .68, height: cs * .68, fill: un ? 'none' : c, stroke: c, 'stroke-width': 1 }); }
    if (!S.narrow) { // the sameness over time: the pattern, as a number
      const gx = W * .6, gw = W - gx - 14, gy = 30, gh = H - 70; S.txt(gx, 18, 'neighbours like me, on average', { 'font-size': S.fs - 1.5, fill: FC.soft, 'font-style': 'italic' });
      S.mk('rect', { x: gx, y: gy, width: gw, height: gh, fill: 'none', stroke: FC.grid });
      [.5, t].forEach((v, k) => { const y = gy + gh * (1 - v); S.mk('line', { x1: gx, x2: gx + gw, y1: y, y2: y, stroke: k ? FC.rubric : FC.grid, 'stroke-dasharray': '4 3' }); S.txt(gx + gw - 2, y - 3, k ? 'what each wants: ' + fmt(v * 100, 0) + ' %' : '50 %', { 'text-anchor': 'end', 'font-size': 10.5, fill: k ? FC.rubric : FC.soft }); });
      const L = Math.max(10, history.length - 1); let d = ''; history.forEach((v, i) => { d += (i ? 'L' : 'M') + (gx + gw * i / L).toFixed(1) + ' ' + (gy + gh * (1 - v)).toFixed(1); }); S.mk('path', { d, fill: 'none', stroke: FC.ink, 'stroke-width': 2 });
      S.txt(gx, gy + gh + 16, 'rounds →', { 'font-size': 10.5, fill: FC.soft }); }
    let u = 0, a = 0; for (let i = 0; i < n * n; i++) if (grid[i]) { a++; if (unhappy(i)) u++; }
    S.read([['each agent wants', '≥ ' + fmt(t * 100, 0) + ' % like itself'], ['round', rounds], ['unhappy (hollow)', u + ' of ' + a], ['like neighbours now', fmt(history[history.length - 1] * 100, 0) + ' %']]);
  };
  const run = () => { if (running) return; running = true; let acc = 0; S.animate(dt => { acc += dt; if (acc < (S.calm ? 0 : .12)) return true; acc = 0; const moved = step(); draw(); if (!moved || rounds > 200) { running = false; return false; } return true; }); };
  S.btn('Run', () => { if (S.calm) { let k = 0; while (step() && k++ < 200); draw(); return; } run(); }, { primary: true });
  S.btn('One round', () => { step(); draw(); });
  S.btn('New town', () => { running = false; reset(); draw(); });
  S.slider('preference t', 0, .75, t, .01, v => { t = v; draw(); }, v => fmt(v * 100, 0) + ' %');
  S.say(`<p>Hollow shapes are unhappy: fewer than t of their neighbours are like them, so they move to a random empty spot. Before you press Run, guess: with t = ${fmt(t * 100, 0)} %, how alike will neighbourhoods end up? Then try t = 25 % and t = 60 %.</p><p class="dim small">Schelling (1971). A model, not a census: real neighbourhoods are also shaped by prices, laws and history, which this leaves out.</p>`);
  reset(); draw(); S.redraw = draw;
  S.run = (k = 50) => { for (let i = 0; i < k && step(); i++); draw(); return history[history.length - 1]; };
  return { draw };
}
