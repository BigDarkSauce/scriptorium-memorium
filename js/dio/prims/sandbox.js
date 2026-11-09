// algorithm_sandbox (Red Blob Games, "Introduction to A*"; Hart, Nilsson & Raphael 1968): grid pathfinding whose
// internal state is drawn — the frontier (brass), the cells already expanded (shaded by their cost so far), the
// came-from arrows and the path. Drag the start (green) or the goal (red ×); press or drag on empty cells to draw
// walls. Every edit re-runs the search at once; Run replays it one expansion at a time.
// Spec: {grid:{w,h}, start:[x,y], goal:[x,y], walls:[[x,y]], forest:[[x,y]], cost, algorithm, algorithms}
import { FC, fmt } from './kit.js';

export const size = (f, o) => { const W = o.narrow ? 360 : 600, c = Math.min((W - 16) / f.grid.w, (o.narrow ? 260 : 300) / f.grid.h); return { W, H: Math.ceil(f.grid.h * c + 16) }; };
const NAMES = { bfs: 'Breadth-first', dijkstra: 'Dijkstra', greedy: 'Greedy best-first', astar: 'A*' };
// the search: returns the order of expansion, the frontier after each expansion, came_from, cost_so_far and the path
export function search(f, walls, alg) {
  const { w, h } = f.grid, key = (x, y) => y * w + x, wall = new Set(walls.map(([x, y]) => key(x, y))), forest = new Set(f.forest.map(([x, y]) => key(x, y)));
  const s = key(...f.start), g = key(...f.goal), hx = i => Math.abs(i % w - f.goal[0]) + Math.abs(Math.floor(i / w) - f.goal[1]);
  const cost = i => forest.has(i) ? f.cost : 1, came = new Map([[s, null]]), so = new Map([[s, 0]]); let open = [{ i: s, p: 0, n: 0 }], n = 0; const order = [], fronts = [], inOpen = new Set([s]);
  while (open.length) {
    let bi = 0; if (alg !== 'bfs') for (let j = 1; j < open.length; j++) if (open[j].p < open[bi].p || (open[j].p === open[bi].p && open[j].n < open[bi].n)) bi = j;
    const cur = open.splice(bi, 1)[0]; if (!inOpen.has(cur.i)) continue; inOpen.delete(cur.i); order.push(cur.i);
    if (cur.i === g) { fronts.push([...inOpen]); break; }   // early exit when the goal is taken out of the frontier (correct with costs)
    const x = cur.i % w, y = Math.floor(cur.i / w);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = key(nx, ny); if (wall.has(j)) continue;
      const nc = so.get(cur.i) + (alg === 'bfs' || alg === 'greedy' ? 1 : cost(j));
      if (alg === 'bfs' || alg === 'greedy' ? !came.has(j) : (!so.has(j) || nc < so.get(j))) { so.set(j, nc); came.set(j, cur.i); const p = alg === 'bfs' ? 0 : alg === 'dijkstra' ? nc : alg === 'greedy' ? hx(j) : nc + hx(j); open.push({ i: j, p, n: ++n }); inOpen.add(j); } }
    fronts.push([...inOpen]);
  }
  const path = []; if (came.has(g)) { for (let c = g; c != null; c = came.get(c)) path.push(c); path.reverse(); }
  const pathCost = path.slice(1).reduce((a, i) => a + cost(i), 0);
  return { order, fronts, came, so, path, pathCost, key };
}
export function render(f, S) {
  const { W, H } = S, { w, h } = f.grid, c = Math.min((W - 16) / w, (H - 16) / h), ox = (W - c * w) / 2, oy = (H - c * h) / 2;
  let walls = f.walls.map(x => x.slice()), alg = f.algorithm, R = null, shown = Infinity, drag = null, paint = null, playing = false;
  const forest = new Set(f.forest.map(([x, y]) => y * w + x));
  const run = () => { R = search(f, walls, alg); };
  const cellOf = p => { const x = Math.floor((p[0] - ox) / c), y = Math.floor((p[1] - oy) / c); return x >= 0 && y >= 0 && x < w && y < h ? [x, y] : null; };
  const draw = () => {
    S.clear(); const k = Math.min(shown, R.order.length), done = k >= R.order.length, seen = new Set(R.order.slice(0, k)), front = new Set(k ? R.fronts[k - 1] : []), maxC = Math.max(1, ...[...seen].map(i => R.so.get(i) || 0));
    const wall = new Set(walls.map(([x, y]) => y * w + x));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, X = ox + x * c, Y = oy + y * c;
      let fill = forest.has(i) ? '#dfe9d8' : '#fdf9ef'; if (seen.has(i)) { const q = (R.so.get(i) || 0) / maxC; fill = `rgba(45,91,142,${(.12 + .3 * (1 - q)).toFixed(3)})`; } if (wall.has(i)) fill = FC.ink;
      S.mk('rect', { x: X + .5, y: Y + .5, width: c - 1, height: c - 1, fill, stroke: front.has(i) ? FC.brass : 'rgba(90,60,30,.1)', 'stroke-width': front.has(i) ? 2.2 : .8, rx: 1.5 });
      if (forest.has(i) && !wall.has(i) && c >= 14) S.mk('path', { d: `M${X + c * .5} ${Y + c * .25}l${-c * .18} ${c * .4}h${c * .36}z`, fill: 'rgba(63,125,110,.45)' });
      // came-from arrows (the "flow field"), on cells big enough to read them
      if (seen.has(i) && c >= 18 && R.came.get(i) != null) { const p = R.came.get(i), dx = (p % w) - x, dy = Math.floor(p / w) - y, cx = X + c / 2, cy = Y + c / 2; S.mk('line', { x1: cx - dx * c * .18, y1: cy - dy * c * .18, x2: cx + dx * c * .28, y2: cy + dy * c * .28, stroke: 'rgba(42,30,21,.45)', 'stroke-width': 1.2, 'marker-end': S.arrow('rgba(42,30,21,.45)') }); } }
    if (!done && k) { const i = R.order[k - 1]; S.mk('rect', { x: ox + (i % w) * c + 1.5, y: oy + Math.floor(i / w) * c + 1.5, width: c - 3, height: c - 3, fill: 'none', stroke: FC.rubric, 'stroke-width': 2.4 }); }
    if (done && R.path.length) S.mk('path', { d: R.path.map((i, j) => (j ? 'L' : 'M') + (ox + (i % w + .5) * c).toFixed(1) + ' ' + (oy + (Math.floor(i / w) + .5) * c).toFixed(1)).join(''), fill: 'none', stroke: FC.rubric, 'stroke-width': Math.max(2.5, c * .16), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .9 });
    const [sx, sy] = f.start, [gx, gy] = f.goal;
    S.mk('circle', { cx: ox + (sx + .5) * c, cy: oy + (sy + .5) * c, r: c * .36, fill: FC.verd, stroke: '#fff', 'stroke-width': 1.5, style: 'cursor:grab' });
    const gc = [ox + (gx + .5) * c, oy + (gy + .5) * c], r = c * .3; S.mk('path', { d: `M${gc[0] - r} ${gc[1] - r}L${gc[0] + r} ${gc[1] + r}M${gc[0] + r} ${gc[1] - r}L${gc[0] - r} ${gc[1] + r}`, stroke: FC.rubric, 'stroke-width': Math.max(3, c * .16), 'stroke-linecap': 'round', style: 'cursor:grab' });
    const cmp = Object.fromEntries(f.algorithms.map(a => [a, a === alg ? R : search(f, walls, a)]));
    S.read([['algorithm', NAMES[alg]], ['expanded', k + (done ? '' : ' of ' + R.order.length)], ['frontier', front.size], ['path cost', R.path.length ? fmt(R.pathCost) : 'no path'], ['all four', f.algorithms.map(a => `${NAMES[a]} ${cmp[a].order.length}${cmp[a].path.length ? '/' + cmp[a].pathCost : ''}`).join(' · ')]]);
  };
  const say = () => S.say({ bfs: '<p><b>Breadth-first</b> grows the frontier evenly in every direction; it ignores both the terrain cost and where the goal is.</p>', dijkstra: `<p><b>Dijkstra</b> expands the cheapest cell first, so the frontier bends around the costly forest (cost ${f.cost}); the path is the cheapest one.</p>`, greedy: '<p><b>Greedy best-first</b> expands the cell that looks closest to the goal: fast in the open, but it can be lured into a dead end and its path is not always the cheapest.</p>', astar: '<p><b>A*</b> orders the frontier by cost so far + estimated distance left (Manhattan, which never overestimates), so it is both guided and optimal.</p>' }[alg] + '<p class="dim">The numbers after each name: cells expanded / path cost.</p>');
  const sel = S.select('algorithm', f.algorithms.map(a => [a, NAMES[a]]), alg, v => { alg = v; run(); shown = Infinity; say(); draw(); }); void sel;
  const rb = S.btn('Run ▸', () => { if (playing) { playing = false; rb.textContent = 'Run ▸'; return; } shown = 0; if (S.calm) { shown = Infinity; draw(); return; } playing = true; rb.textContent = 'Pause'; let acc = 0; S.animate(dt => { if (!playing) return false; acc += dt * Math.max(20, R.order.length / 3); while (acc >= 1 && shown < R.order.length) { shown++; acc--; } draw(); if (shown >= R.order.length) { playing = false; rb.textContent = 'Run ▸'; shown = Infinity; draw(); return false; } return true; }); }, { primary: true, title: 'Replay the search one expansion at a time' });
  S.btn('Step', () => { playing = false; rb.textContent = 'Run ▸'; if (shown >= R.order.length) shown = 0; shown++; draw(); }, { title: 'One expansion' });
  S.btn('Reset walls', () => { walls = f.walls.map(x => x.slice()); run(); shown = Infinity; draw(); });
  const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  S.svg.addEventListener('pointerdown', ev => { const q = cellOf(S.pt(ev)); if (!q) return; ev.preventDefault(); S.svg.setPointerCapture(ev.pointerId); playing = false; rb.textContent = 'Run ▸';
    if (eq(q, f.start)) drag = 'start'; else if (eq(q, f.goal)) drag = 'goal'; else { const i = walls.findIndex(x => eq(x, q)); paint = i >= 0 ? 'erase' : 'add'; if (i >= 0) walls.splice(i, 1); else walls.push(q); run(); shown = Infinity; draw(); } });
  S.svg.addEventListener('pointermove', ev => { if (!drag && !paint) return; const q = cellOf(S.pt(ev)); if (!q) return;
    if (drag) { if (walls.some(x => eq(x, q)) || eq(q, drag === 'start' ? f.goal : f.start)) return; if (!eq(f[drag], q)) { f[drag] = q; run(); shown = Infinity; draw(); } return; }
    if (eq(q, f.start) || eq(q, f.goal)) return; const i = walls.findIndex(x => eq(x, q)); if (paint === 'add' && i < 0) walls.push(q); else if (paint === 'erase' && i >= 0) walls.splice(i, 1); else return; run(); shown = Infinity; draw(); });
  const up = () => { drag = null; paint = null; }; S.svg.addEventListener('pointerup', up); S.svg.addEventListener('pointercancel', up);
  run(); say(); draw(); S.redraw = draw;
  S.wall = cells => { cells.forEach(q => { if (!walls.some(x => eq(x, q)) && !eq(q, f.start) && !eq(q, f.goal)) walls.push(q); }); run(); shown = Infinity; draw(); };
  S.setAlg = a => { alg = a; sel.value = a; run(); shown = Infinity; say(); draw(); };
  return { draw };
}
