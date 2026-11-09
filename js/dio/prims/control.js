// control_loop: a feedback controller made inspectable (control theory). A heater warms a room that leaks heat to the
// outside; a controller measures the temperature, compares it with the setpoint and sets the heater in proportion to
// the error. Everything usually invisible is drawn: setpoint, measurement, error, the controller's push, and the delay
// between acting and sensing. The reader predicts what a longer delay or a stronger gain will do (overshoot? ringing?)
// before running it. A proportional controller with a leak also settles BELOW the setpoint (steady-state error): an
// honest edge of the simple rule "feedback removes the error".
// Spec: {setpoint, start, gain, delay (s), leak, ambient, unit, output, actuator}
import { FC, fmt } from './kit.js';

export const size = (f, o) => o.narrow ? { W: 360, H: 300 } : { W: 600, H: 290 };
export function render(f, S) {
  const { W, H } = S, T = 60, dt = .1; let gain = f.gain, delay = f.delay, sp = f.setpoint, dist = 0, trace;
  // simulate T seconds: dy/dt = u(t − delay) − leak·(y − ambient) + disturbance; u = clamp(gain·(sp − y), 0, umax)
  const sim = () => { const n = Math.round(T / dt), lag = Math.round(delay / dt), y = [f.start], u = []; for (let i = 0; i < n; i++) { const e = sp - y[i]; u.push(Math.max(0, Math.min(3, gain * e))); const ud = i >= lag ? u[i - lag] : 0; const dist_ = i * dt > T * .55 ? dist : 0; y.push(y[i] + dt * (ud - f.leak * (y[i] - f.ambient) + dist_)); } return { y, u }; };
  let shown = 0;
  const draw = () => {
    S.clear(); const P = { l: 40, r: S.narrow ? 12 : 170, t: 26, b: 30 }, gw = W - P.l - P.r, gh = H - P.t - P.b, ys = trace.y, lo = Math.min(f.ambient, ...ys, sp) - 1, hi = Math.max(...ys, sp) + 1.5, X = t => P.l + t / T * gw, Y = v => P.t + gh * (1 - (v - lo) / (hi - lo));
    S.mk('line', { x1: P.l, x2: P.l + gw, y1: P.t + gh, y2: P.t + gh, stroke: FC.soft }); S.mk('line', { x1: P.l, x2: P.l, y1: P.t, y2: P.t + gh, stroke: FC.soft });
    for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) S.txt(P.l - 5, Y(v) + 4, fmt(v, 0), { 'text-anchor': 'end', mono: true, 'font-size': 10, fill: FC.soft });
    S.txt(P.l + gw, P.t + gh + 18, 'time (s) →', { 'text-anchor': 'end', 'font-size': 10.5, fill: FC.soft }); S.txt(P.l, 14, f.output + ' (' + f.unit + ')', { 'font-size': 11, fill: FC.soft, 'font-style': 'italic' });
    S.mk('line', { x1: P.l, x2: P.l + gw, y1: Y(sp), y2: Y(sp), stroke: FC.verd, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }); S.txt(P.l + 4, Y(sp) - 5, 'setpoint ' + fmt(sp, 1), { 'font-size': 11, fill: FC.verd });
    if (dist) { S.mk('line', { x1: X(T * .55), x2: X(T * .55), y1: P.t, y2: P.t + gh, stroke: FC.rubric, 'stroke-dasharray': '2 3' }); S.txt(X(T * .55) + 3, P.t + 10, 'window opened', { 'font-size': 10.5, fill: FC.rubric }); }
    const n = Math.min(ys.length, Math.round(shown / dt) + 1); let d = ''; for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i * dt).toFixed(1) + ' ' + Y(ys[i]).toFixed(1); S.mk('path', { d, fill: 'none', stroke: FC.lapis, 'stroke-width': 2.2 });
    let du = ''; const um = 3; for (let i = 0; i < n - 1; i++) du += (i ? 'L' : 'M') + X(i * dt).toFixed(1) + ' ' + (P.t + gh - trace.u[i] / um * gh * .25).toFixed(1); S.mk('path', { d: du, fill: 'none', stroke: FC.brass, 'stroke-width': 1.3, opacity: .8 }); S.txt(P.l + gw - 2, P.t + gh - 4, f.actuator, { 'text-anchor': 'end', 'font-size': 10, fill: FC.brass });
    if (!S.narrow) { // the loop itself, as a block diagram: setpoint → (−) → controller → delay → room → sensor ↺
      const bx = W - P.r + 16, by = P.t, bw = P.r - 26; const box = (y, t, c) => { S.mk('rect', { x: bx, y, width: bw, height: 24, rx: 6, fill: FC.card, stroke: c || FC.brass }); S.txt(bx + bw / 2, y + 16, t, { 'text-anchor': 'middle', 'font-size': 11.5, fit: bw - 8 }); };
      box(by, 'error = setpoint − ' + 'measured', FC.verd); box(by + 44, 'controller: gain × error'); box(by + 88, 'delay ' + fmt(delay, 1) + ' s', delay > 3 ? FC.rubric : FC.brass); box(by + 132, f.output, FC.lapis); box(by + 176, 'sensor', FC.soft);
      [0, 44, 88, 132].forEach(o => S.mk('line', { x1: bx + bw / 2, x2: bx + bw / 2, y1: by + o + 24, y2: by + o + 43, stroke: FC.soft, 'marker-end': S.arrow(FC.soft) }));
      S.mk('path', { d: `M${bx} ${by + 188}h-8V${by + 12}h7`, fill: 'none', stroke: FC.soft, 'marker-end': S.arrow(FC.soft) }); }
    const end = ys[ys.length - 1], peak = Math.max(...ys);
    S.read([['gain', fmt(gain, 2)], ['delay', fmt(delay, 1) + ' s'], ['overshoot', peak > sp + .05 ? '+' + fmt(peak - sp, 1) + ' ' + f.unit : 'none'], ['settles at', fmt(end, 1) + ' ' + f.unit + (Math.abs(end - sp) > .3 ? ' (offset ' + fmt(end - sp, 1) + ')' : '')]]);
  };
  const run = () => { trace = sim(); if (S.calm) { shown = T; draw(); return; } shown = 0; S.animate(d => { shown = Math.min(T, shown + d * 12); draw(); return shown < T; }); };
  S.btn('Run', run, { primary: true });
  S.btn('Open a window', b => { dist = dist ? 0 : -1.2; b.classList.toggle('on', !!dist); run(); }, { title: 'A disturbance halfway: heat escapes faster' });
  S.slider('gain', 0, 5, gain, .05, v => { gain = v; trace = sim(); shown = T; draw(); }, v => fmt(v, 2));
  S.slider('delay (s)', 0, 12, delay, .1, v => { delay = v; trace = sim(); shown = T; draw(); }, v => fmt(v, 1));
  S.say('<p>Predict first: if the sensor reports 6 seconds late, does a stronger controller settle faster, or start to ring around the setpoint? Then move the sliders.</p><p class="dim small">Edge of the rule: a purely proportional controller fighting a leak settles a little <i>below</i> the setpoint (steady-state error); real thermostats add integral action, or switch on and off with a margin.</p>');
  trace = sim(); shown = T; draw(); S.redraw = draw;
  S.setGainDelay = (g, d) => { gain = g; delay = d; trace = sim(); shown = T; draw(); return { peak: Math.max(...trace.y), end: trace.y[trace.y.length - 1] }; };
  return { draw };
}
