// state_machine / signal journey (Ben Eater: make the movement of information visible): components and registers on
// wires; each clock tick sends values along wires as packets and latches registers. State k = after k ticks.
// Spec: {nodes:[{id,label,register?,value?,x?,y?,note?}], wires:[{from,to,label?}], ticks:[{label,note,packets:[{from,to,value}],set:{id:value},state?}]}
import { FC, nodeBox, easeIO, qpt, route, qpath, mathHTML } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 64 + Math.ceil(f.nodes.length / 2) * 86 } : { W: 600, H: 300 };
export function render(f, S) {
  const { W, H } = S, top = 50, n = f.nodes.length, pos = new Map(), nw = S.narrow ? 150 : 132, nh = 58, total = f.ticks.length;
  if (f.nodes.every(x => x.x != null) && !S.narrow) f.nodes.forEach(x => pos.set(x.id, [nw / 2 + 8 + x.x / 100 * (W - nw - 16), top + nh / 2 + x.y / 60 * (H - top - nh - 10)]));
  else { const cols = S.narrow ? 2 : Math.min(4, Math.ceil(n / 2)), rows = Math.ceil(n / cols), cw = (W - 24) / cols, rh = (H - top - 12) / rows; f.nodes.forEach((x, i) => { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; pos.set(x.id, [12 + (c + .5) * cw, top + (r + .5) * rh]); }); }
  // register values after k ticks
  const valuesAt = k => { const v = Object.fromEntries(f.nodes.filter(x => x.register).map(x => [x.id, x.value])); for (let i = 0; i < k; i++) Object.assign(v, f.ticks[i].set); return v; };
  // wires as curves that bend round the other boxes; a wire with a twin in the opposite direction keeps to its left
  const R = new Map(f.wires.map(w => [w.from + '>' + w.to, route(pos.get(w.from), pos.get(w.to), [nw, nh], [nw, nh], f.nodes.filter(x => x.id !== w.from && x.id !== w.to).map(x => [...pos.get(x.id), nw, nh]), f.wires.some(v => v.from === w.to && v.to === w.from) ? 12 : 0)]));
  const geo = (a, b) => R.get(a + '>' + b) || route(pos.get(a), pos.get(b), [nw, nh], [nw, nh]);
  let k = 0, t = 1, running = false, flash = 0;
  const draw = () => {
    S.clear(); const vals = valuesAt(k), tick = k ? f.ticks[k - 1] : null, live = new Set(tick ? tick.packets.map(p => p.from + '>' + p.to) : []);
    // the clock: a square wave with one high pulse per tick, the current one lit
    const cw = Math.min(W - 150, 26 * (total + 1)), cx0 = 52; S.txt(10, 26, 'CLK', { mono: true, 'font-size': 11, fill: FC.soft });
    let d = `M${cx0} 30`; for (let i = 0; i <= total; i++) { const x = cx0 + i * cw / (total + 1); d += `H${x + 4}V16H${x + cw / (total + 1) / 2}V30`; } S.mk('path', { d: d + `H${cx0 + cw}`, fill: 'none', stroke: FC.soft, 'stroke-width': 1.2 });
    if (k) { const x = cx0 + (k - 1) * cw / (total + 1); S.mk('path', { d: `M${x + 4} 30V16H${x + cw / (total + 1) / 2}V30`, fill: 'none', stroke: FC.rubric, 'stroke-width': 2.4 }); }
    S.txt(W - 10, 26, k ? `tick ${k}: ${tick.label}` : 'before the first tick', { 'text-anchor': 'end', 'font-size': S.fs - 1, fill: k ? FC.rubric : FC.soft, fit: W - cx0 - cw - 24 });
    f.wires.forEach(w => { const g = geo(w.from, w.to), on = live.has(w.from + '>' + w.to) && t < 1.2; S.mk('path', { d: qpath(g), fill: 'none', stroke: on ? FC.rubric : FC.mute, 'stroke-width': on ? 2.6 : 1.6, 'marker-end': S.arrow(on ? FC.rubric : FC.mute) }); if (w.label) { const m = qpt(g.a, g.c, g.b, .5); S.txt(m[0], m[1] - 5, w.label, { 'text-anchor': 'middle', 'font-size': S.fs - 2.5, fill: FC.soft, 'font-style': 'italic', fit: 90 }); } });
    f.nodes.forEach(x => { const [cx, cy] = pos.get(x.id), latched = tick && x.id in tick.set && t >= 1;
      if (!x.register) { nodeBox(S, cx, cy, nw, nh, x.label, { tone: latched ? 'hot' : 'card', stroke: FC.lapis, sw: 1.3, maxL: 2, sub: x.note || null }); return; }
      // a register: its name on top (up to two lines), its value in a dark window below
      const g = S.g(); S.mk('rect', { x: cx - nw / 2, y: cy - nh / 2, width: nw, height: nh, rx: 8, fill: latched ? FC.hot : '#f4ead2', stroke: latched ? FC.rubric : FC.brass, 'stroke-width': latched ? 2 : 1.3 }, g);
      S.lines(cx, cy - nh / 2 + 3, x.label, nw - 10, { 'text-anchor': 'middle', 'font-size': S.fs - 2 }, g, 2);
      const v = vals[x.id]; S.mk('rect', { x: cx - nw / 2 + 8, y: cy + nh / 2 - 24, width: nw - 16, height: 19, rx: 3, fill: FC.ink, stroke: latched && flash > 0 ? FC.gold : FC.ink, 'stroke-width': 2 }, g); S.txt(cx, cy + nh / 2 - 10, String(v), { 'text-anchor': 'middle', mono: true, 'font-size': 12.5, fill: latched ? '#ffd98a' : '#f3e3b8', fit: nw - 24 }, g); });
    // packets in flight
    if (tick && t < 1) tick.packets.forEach(p => { const g = geo(p.from, p.to), q = qpt(g.a, g.c, g.b, easeIO(t)); const lab = String(p.value), w = Math.max(26, lab.length * 7.4 + 12); S.mk('rect', { x: q[0] - w / 2, y: q[1] - 10, width: w, height: 20, rx: 10, fill: FC.rubric, stroke: '#fff', 'stroke-width': 1.2 }); S.txt(q[0], q[1] + 4, lab, { 'text-anchor': 'middle', mono: true, 'font-size': 11, fill: '#fff' }); });
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
