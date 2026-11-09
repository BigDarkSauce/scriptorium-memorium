// state_machine / signal journey (Ben Eater: make the movement of information visible): components and registers on
// wires; each clock tick sends values along wires as packets and latches registers. State k = after k ticks.
// Spec: {nodes:[{id,label,register?,value?,x?,y?,note?}], wires:[{from,to,label?}], ticks:[{label,note,packets:[{from,to,value}],set:{id:value},state?}]}
import { FC, nodeBox, boxExit, easeIO, lerp2, mathHTML } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 330 } : { W: 600, H: 300 };
export function render(f, S) {
  const { W, H } = S, top = 50, n = f.nodes.length, pos = new Map();
  if (f.nodes.every(x => x.x != null)) { const sx = (W - 24) / 100, sy = (H - top - 12) / 60; f.nodes.forEach(x => pos.set(x.id, [12 + x.x * sx, top + x.y * sy])); }
  else { const cols = S.narrow ? 2 : Math.min(4, Math.ceil(n / 2)), rows = Math.ceil(n / cols), cw = (W - 24) / cols, rh = (H - top - 12) / rows; f.nodes.forEach((x, i) => { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; pos.set(x.id, [12 + (c + .5) * cw, top + (r + .5) * rh]); }); }
  const nw = S.narrow ? 128 : 132, nh = 52, total = f.ticks.length;
  // register values after k ticks
  const valuesAt = k => { const v = Object.fromEntries(f.nodes.filter(x => x.register).map(x => [x.id, x.value])); for (let i = 0; i < k; i++) Object.assign(v, f.ticks[i].set); return v; };
  const ends = (a, b) => { const A = pos.get(a), B = pos.get(b); return [boxExit(A, nw, nh, B, 2), boxExit(B, nw, nh, A, 4)]; };
  let k = 0, t = 1, running = false, flash = 0;
  const draw = () => {
    S.clear(); const vals = valuesAt(k), tick = k ? f.ticks[k - 1] : null, live = new Set(tick ? tick.packets.map(p => p.from + '>' + p.to) : []);
    // the clock: a square wave with one high pulse per tick, the current one lit
    const cw = Math.min(W - 150, 26 * (total + 1)), cx0 = 52; S.txt(10, 26, 'CLK', { mono: true, 'font-size': 11, fill: FC.soft });
    let d = `M${cx0} 30`; for (let i = 0; i <= total; i++) { const x = cx0 + i * cw / (total + 1); d += `H${x + 4}V16H${x + cw / (total + 1) / 2}V30`; } S.mk('path', { d: d + `H${cx0 + cw}`, fill: 'none', stroke: FC.soft, 'stroke-width': 1.2 });
    if (k) { const x = cx0 + (k - 1) * cw / (total + 1); S.mk('path', { d: `M${x + 4} 30V16H${x + cw / (total + 1) / 2}V30`, fill: 'none', stroke: FC.rubric, 'stroke-width': 2.4 }); }
    S.txt(W - 10, 26, k ? `tick ${k}: ${tick.label}` : 'before the first tick', { 'text-anchor': 'end', 'font-size': S.fs - 1, fill: k ? FC.rubric : FC.soft, fit: W - cx0 - cw - 24 });
    f.wires.forEach(w => { const [p, q] = ends(w.from, w.to), on = live.has(w.from + '>' + w.to) && t < 1.2; S.mk('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: on ? FC.rubric : FC.mute, 'stroke-width': on ? 2.6 : 1.6, 'marker-end': S.arrow(on ? FC.rubric : FC.mute) }); if (w.label) { const m = lerp2(p, q, .5); S.txt(m[0], m[1] - 5, w.label, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: FC.soft, 'font-style': 'italic', fit: 90 }); } });
    f.nodes.forEach(x => { const [cx, cy] = pos.get(x.id), latched = tick && x.id in tick.set && t >= 1;
      nodeBox(S, cx, cy - (x.register ? 8 : 0), nw, x.register ? nh - 16 : nh, x.label, { tone: latched ? 'hot' : x.register ? 'brass' : 'card', stroke: latched ? FC.rubric : x.register ? FC.brass : FC.lapis, sw: latched ? 2 : 1.3, maxL: x.register ? 1 : 2 });
      if (x.register) { const v = vals[x.id]; S.mk('rect', { x: cx - nw / 2 + 10, y: cy + 4, width: nw - 20, height: 20, rx: 3, fill: FC.ink, stroke: latched && flash > 0 ? FC.gold : FC.ink, 'stroke-width': 2 }); S.txt(cx, cy + 18.5, String(v), { 'text-anchor': 'middle', mono: true, 'font-size': 12.5, fill: latched ? '#ffd98a' : '#f3e3b8', fit: nw - 28 }); } });
    // packets in flight
    if (tick && t < 1) tick.packets.forEach(p => { const [a, b] = ends(p.from, p.to), q = lerp2(a, b, easeIO(t)); const lab = String(p.value), w = Math.max(26, lab.length * 7.4 + 12); S.mk('rect', { x: q[0] - w / 2, y: q[1] - 10, width: w, height: 20, rx: 10, fill: FC.rubric, stroke: '#fff', 'stroke-width': 1.2 }); S.txt(q[0], q[1] + 4, lab, { 'text-anchor': 'middle', mono: true, 'font-size': 11, fill: '#fff' }); });
  };
  const tell = () => { const tick = k ? f.ticks[k - 1] : null, vals = valuesAt(k);
    S.say(tick ? `<p><b>Tick ${k}.</b> ${mathHTML(tick.note || tick.label)}</p>` : `<p><b>Before the clock ticks.</b> ${mathHTML(f.ticks[0].note ? 'Press ▸ to send the first clock pulse; watch which wire carries a value and which register latches it.' : '')}</p>`);
    S.read([['tick', k + ' of ' + total], ...Object.entries(vals).map(([id, v]) => [(f.nodes.find(x => x.id === id) || {}).label || id, v]), tick && tick.state ? ['state', tick.state] : null]); };
  const sp = S.stepper(total + 1, j => { const fwd = j === k + 1; k = j; t = S.calm || !fwd ? 1 : 0; flash = 1; tell(); draw(); if (t < 1) S.animate(dt => { t = Math.min(1, t + dt / .9); if (t >= 1) flash = Math.max(0, flash - dt); draw(); return t < 1; }); }, j => j ? f.ticks[j - 1].label : 'start');
  const run = S.btn('Run ▸', b => { if (running) { running = false; b.textContent = 'Run ▸'; return; } if (sp.k >= total) sp.set(0); running = true; b.textContent = 'Pause'; let wait = .4; S.animate(dt => { if (!running) return false; wait -= dt; if (wait <= 0 && t >= 1) { if (sp.k >= total) { running = false; b.textContent = 'Run ▸'; return false; } sp.next(); wait = 1.1; } t = Math.min(1, t + dt / .9); draw(); return true; }); }, { title: 'Tick the clock until the end' });
  if (S.calm) run.title = 'Tick the clock until the end (one tick per press under reduced motion is the ▸ button)';
  sp.set(0); S.redraw = draw; S.go = j => sp.set(j);
  return { draw };
}
