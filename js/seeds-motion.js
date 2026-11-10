// Motion figures for the example library: one short animation for each "Picture it" and "Common mistake" box, showing
// the event, process or transformation its paragraph describes (spec: js/room/motion.js). Keyed like seeds-figures.js:
// chain title → step id → {intuition, misconception}. A contrast is two synchronised worlds: the mistaken one (what
// would happen if the mistake were true) and the real one. Numbers match the step's own (the same 2 m pendulum, the
// same 50 kJ/mol barrier, ...); where a rate is slowed or a count reduced so it can be seen, the caption says so.
// Style by domain: mechanics as ink line drawings with coloured force (rubric) and velocity (brass) arrows; gases and
// solutions as seeded kinetic particles; calculus and linear algebra as continuous transformations of curves and grids;
// probability as falling beads; markets as staircases under a price "water level".

// ---- builders
const ln = (x, y, x2, y2, o = {}) => ({ s: 'line', x, y, x2, y2, ...o });
const ar = (x, y, x2, y2, o = {}) => ({ s: 'arrow', x, y, x2, y2, ...o });
const ci = (x, y, r, o = {}) => ({ s: 'circle', x, y, r, ...o });
const rc = (x, y, w, h, o = {}) => ({ s: 'rect', x, y, w, h, ...o });
const pa = (d, o = {}) => ({ s: 'path', d, ...o });
const po = (pts, o = {}) => ({ s: 'poly', pts, ...o });
const tx = (x, y, text, o = {}) => ({ s: 'text', x, y, text, ...o });
const arc = (x, y, r, a0, a1, o = {}) => ({ s: 'arc', x, y, r, a0, a1, ...o });
const g = (items, o = {}) => ({ s: 'g', items, ...o });
const M = (m, o = {}) => ({ m, ...o });
const one = (items, beats, o = {}) => ({ items, beats, ...o });
const pair = (wrong, right, beats, o = {}) => ({ wrong: { items: wrong }, right: { items: right }, beats, ...o });
const kf = (n, fn) => Array.from({ length: n + 1 }, (_, i) => [i / n, fn(i / n)]);   // keyframes sampled from a function of u
const stamp = (x, y, text, u0 = .78, o = {}) => M('stamp', { x, y, text, u0, ...o });
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
// the exact pendulum θ(t) (degrees) for a small-swing period T0, by RK4: keyframes over dur seconds
function exactPend(th0, T0, dur, n = 160) { const w2 = (2 * Math.PI / T0) ** 2, h = .002; let th = th0 * D2R, om = 0, t = 0; const out = [];
  for (let i = 0; i <= n; i++) { const tt = dur * i / n; while (t < tt) { const f = (a, b) => [b, -w2 * Math.sin(a)], k1 = f(th, om), k2 = f(th + h / 2 * k1[0], om + h / 2 * k1[1]), k3 = f(th + h / 2 * k2[0], om + h / 2 * k2[1]), k4 = f(th + h * k3[0], om + h * k3[1]); th += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); om += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += h; } out.push([i / n, { th: th * R2D }]); } return out; }
const swing = (a, T, dur) => kf(120, u => ({ th: a * Math.cos(2 * Math.PI * u * dur / T) }));

// ======================================================================= mechanics: the simple pendulum (L = 2 m)
const PEND = {
  S1: {
    intuition: one([M('pend', { x: 80, y: 40, L: 32, a: 38, T: 2.6, hoop: true, trail: true, vec: ['v', 'T'], vs: 10 }), tx(80, 37, 'pivot', { fs: 3, c: 'soft' }), tx(80, 86, 'the only path allowed: a circle of radius L', { fs: 3.4, it: true, c: 'soft' }), tx(126, 20, 'T: across the path', { fs: 3.2, c: 'lapis', a: 'start' }), tx(126, 26, 'v: along the path', { fs: 3.2, c: 'brass', a: 'start' })],
      [[0, 'The string holds the bob exactly one length L from the pivot.'], [.35, 'So the bob can only slide along this circle, like a bead threaded on a hoop.'], [.7, 'Its velocity always lies along the circle; the string only ever pulls across it.']]),
    misconception: pair([M('pend', { x: 50, y: 34, L: 24, hoop: true, th: 35, k: [[0, { th: 35 }], [.25, { th: 60 }], [.5, { th: 140 }], [.75, { th: 300 }], [1, { th: 560 }]], lin: true, vec: ['Tt'], ttLab: 'pull along?', vs: 9 }), stamp(50, 66, 'faster every lap?', .7)],
      [M('pend', { x: 50, y: 12, L: 40, a: 40, T: 2.6, vec: ['T', 'v'], perp: true, vs: 11 }), tx(50, 69, 'T ⟂ v: the string does no work', { fs: 3.6, c: 'verd' })],
      [[0, 'If the string pulled the bob along its path…'], [.4, '…it would add speed on every lap and the bob would never stop.'], [.62, 'Really the tension points at the pivot, at right angles to the motion: work 0 J. Only gravity changes the speed.']]),
  },
  S2: (() => { const P0 = [40, 8], L = 40, N = 12, arcP = [], flat = [];
    for (let i = 0; i <= N; i++) { const a = 40 * i / N * D2R; arcP.push(P0[0] + L * Math.sin(a), P0[1] + L * Math.cos(a)); flat.push(P0[0] + L * 40 * D2R * i / N, 78); }
    const bob = [P0[0] + L * Math.sin(40 * D2R), P0[1] + L * Math.cos(40 * D2R)];
    return {
      intuition: one([ln(...P0, ...bob, { c: 'soft', sw: .55 }), ln(...P0, P0[0], P0[1] + L + 4, { c: 'mute', dash: '1 1', sw: .4 }), ci(...P0, .9, { f: 'ink', c: 'none' }), ci(...bob, 2.6, { f: 'lapis' }),
        arc(...P0, 12, 0, 40, { c: 'brass', label: '40°', sw: .5 }),
        po(arcP, { c: 'rubric', sw: 1.4, draw: 0, k: [[0, { draw: 0 }], [.25, { draw: 1, pts: arcP }], [.35, { pts: arcP }], [.62, { pts: flat }]] }),
        ln(40, 78, 120, 78, { c: 'soft', sw: .4 }), ...[0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2].map(q => ln(40 + q * L, q % 1 ? 76.8 : 75.5, 40 + q * L, 78, { c: 'soft', sw: .4 })), tx(40, 84, '0', { fs: 3.2, c: 'soft' }), tx(80, 84, '1 L = 2 m', { fs: 3.2, c: 'soft' }), tx(120, 84, '2 L', { fs: 3.2, c: 'soft' }),
        tx(100, 30, 'θ = 0.698 rad', { fs: 4.4, c: 'rubric', on: [.66, 1] }), tx(100, 37, 's = Lθ = 1.40 m', { fs: 3.8, c: 'ink', on: [.72, 1] }), ar(68, 70, 68, 76.5, { c: 'rubric', sw: .5, on: [.66, 1] }), tx(68, 68, '0.698 L', { fs: 3.2, c: 'rubric', on: [.66, 1] })],
        [[0, 'The bob has swung 40° from the bottom.'], [.22, 'Take the arc it travelled…'], [.4, '…and lay it flat along a ruler marked in string-lengths.'], [.68, 'It covers 0.698 of one length: θ = 0.698 rad, so s = Lθ = 1.40 m.']], { dur: 11 }),
      misconception: pair([M('pend', { x: 50, y: 36, L: 22, hoop: true, th: 0, k: [[.08, { th: 0 }], [.8, { th: 2292 }]], lin: true }), M('num', { x: 50, y: 69, v: 0, k: [[.08, { v: 0 }], [.8, { v: 80 }]], lin: true, pre: 's = 2 m × 40 = ', suf: ' m', fs: 3.6 }), stamp(50, 8, '6.4 laps for a 40° swing?', .8)],
        [M('pend', { x: 50, y: 8, L: 40, th: 0, k: [[.08, { th: 0 }], [.8, { th: 40 }]], angle: true }), M('num', { x: 50, y: 69, v: 0, k: [[.08, { v: 0 }], [.8, { v: 1.40 }]], dp: 2, pre: 's = 2 m × 0.698 = ', suf: ' m', fs: 3.6 })],
        [[0, 'Put 40 (degrees) into s = Lθ…'], [.4, '…and the bob would have to travel 80 m: six and a half times round its circle.'], [.72, 'In radians 40° = 0.698, so s = 1.40 m: exactly the arc it swung.']], { dur: 11 }),
    }; })(),
  S3: {
    intuition: one([M('pend', { x: 58, y: 14, L: 42, th: 0, k: [[.05, { th: 0 }], [.8, { th: 90 }]], vec: ['W', 'Wt'], vs: 16, angle: true }),
      rc(112, 40, 40, 6, { c: 'soft', sw: .4 }), rc(112, 40, 0, 6, { f: 'verd', c: 'none', k: kf(40, u => ({ w: 40 * Math.sin(90 * D2R * Math.min(1, Math.max(0, (u - .05) / .75))) })) }),
      tx(132, 36, 'share pulling back: sin θ', { fs: 3.3, c: 'verd' }), M('num', { x: 132, y: 54, v: 0, k: kf(40, u => ({ v: Math.sin(90 * D2R * Math.min(1, Math.max(0, (u - .05) / .75))) })), dp: 2, pre: 'sin θ = ', fs: 3.8 })],
      [[0, 'Hanging straight down, the weight pulls only along the string: nothing pulls the bob back.'], [.25, 'Tilt the string and a share of the weight, mg sin θ, points back along the path.'], [.7, 'At 90°, with the string horizontal, the whole weight pulls along the path: sin θ = 1.']], { dur: 12 }),
    misconception: pair([M('pend', { x: 50, y: 10, L: 40, a: 40, T: 2.6, vec: ['Tb'], tbLab: 'T to the bottom?', vs: 12 }), ci(50, 50, 1, { f: 'rubric', c: 'none' }), tx(50, 58, 'lowest point', { fs: 3, c: 'soft' })],
      [M('pend', { x: 50, y: 10, L: 40, a: 40, T: 2.6, vec: ['T', 'Wt'], perp: true, vs: 12 }), tx(50, 68, 'T across the path; mg sin θ along it', { fs: 3.4, c: 'verd' })],
      [[0, 'If the tension pulled the bob back towards the bottom…'], [.35, '…its arrow would aim at the lowest point.'], [.55, 'Really it aims at the pivot, across the path. What brings the bob back is the weight’s share along the path, mg sin θ.']]),
  },
  S4: {
    intuition: one([M('pend', { x: 50, y: 10, L: 46, a: 30, T: 2.84, r: 4.2, c: 'ink', mlab: 'Pb', vec: ['W'], vs: 20 }), M('pend', { x: 112, y: 10, L: 46, a: 30, T: 2.84, r: 4.2, c: 'brass', mlab: 'wood', vec: ['W'], vs: 3 }),
      tx(50, 86, 'pulled hard, hard to move', { fs: 3.3, c: 'soft' }), tx(112, 86, 'pulled weakly, easy to move', { fs: 3.3, c: 'soft' })],
      [[0, 'Same size, same string: a lead bob and a wooden one, released together.'], [.35, 'The lead bob is pulled many times harder (the red arrows)…'], [.6, '…but it is just as many times harder to speed up. The two effects cancel: they swing together.']], { dur: 11 }),
    misconception: pair([M('pend', { x: 30, y: 8, L: 36, th: 30, k: swing(30, 1.6, 11), r: 4, c: 'ink', mlab: '10' }), M('pend', { x: 72, y: 8, L: 36, th: 30, k: swing(30, 2.84, 11), r: 2.6, c: 'brass', mlab: '1' }), tx(30, 66, '10 kg', { fs: 3.2 }), tx(72, 66, '1 kg', { fs: 3.2 }), stamp(50, 30, 'out of step', .55)],
      [M('pend', { x: 30, y: 8, L: 36, a: 30, T: 2.84, r: 4, c: 'ink', mlab: '10' }), M('pend', { x: 72, y: 8, L: 36, a: 30, T: 2.84, r: 2.6, c: 'brass', mlab: '1' }), tx(30, 66, '10 kg', { fs: 3.2 }), tx(72, 66, '1 kg', { fs: 3.2 })],
      [[0, 'If a heavier bob swung faster, the two would drift apart.'], [.5, 'Really θ̈ = −(g/L) sin θ has no mass in it: 10 kg and 1 kg keep perfect step.']], { dur: 11 }),
  },
  S5: {
    intuition: one([M('curve', { box: [8, 12, 64, 62], xr: [0, 1.6], yr: [0, 1.6], f: 'x', c: 'rubric', dash: '2 1.2', lab: 'θ', draw: 0, k: [[0, { draw: 0 }], [.4, { draw: 1 }]], xl: 'θ (rad)', yl: 'pull back (in units of mg)' }), M('curve', { box: [8, 12, 64, 62], xr: [0, 1.6], yr: [0, 1.6], f: 'sin(x)', c: 'lapis', lab: 'sin θ', draw: 0, k: [[0, { draw: 0 }], [.4, { draw: 1 }]], axes: false }),
      rc(8, 12, 12, 62, { f: 'verd', fo: .12, c: 'none', on: [.42, 1] }), tx(14, 9, 'θ < 0.3: equal', { fs: 3, c: 'verd', on: [.42, 1] }),
      M('pend', { x: 118, y: 6, L: 40, a: 12, T: 2.84 }), rc(84, 66, 72, 14, { c: 'mute', sw: .3 }), M('spring', { x: 86, y: 73, x2: 118, y2: 73, k: kf(80, u => ({ x2: 112 + 8 * Math.cos(2 * Math.PI * u * 12 / 2.84) })) }), rc(0, 69, 8, 8, { f: 'brass', c: 'ink', sw: .3, k: kf(80, u => ({ x: 112 + 8 * Math.cos(2 * Math.PI * u * 12 / 2.84) })) }), tx(120, 88, 'pendulum and spring, same rhythm', { fs: 3.1, c: 'soft' })],
      [[0, 'The restoring push goes like sin θ, the pull of a spring like θ itself.'], [.42, 'Below about 0.3 rad (17°) the two curves are hard to tell apart…'], [.65, '…so a small swing moves exactly like a mass on a spring: push proportional to displacement.']], { dur: 12 }),
    misconception: one([...[[30, 2, '1 kg'], [80, 3, '5 kg'], [130, 4.4, '20 kg']].flatMap(([x, r, m]) => [M('pend', { x, y: 6, L: 50, a: 22, T: 2.84, r, c: r > 4 ? 'ink' : 'lapis' }), tx(x, 74, m, { fs: 3.4 }), tx(x, 81, 'T = 2.84 s', { fs: 3.4, mono: true, c: 'verd', on: [.35, 1] })]), stamp(80, 40, 'same period', .6, { c: 'verd' })],
      [[0, 'Three bobs on 2 m strings: 1 kg, 5 kg and 20 kg.'], [.35, 'Each takes 2π√(L/g) = 2.84 s for a full swing.'], [.6, 'Mass appears on both sides of Newton’s law and cancels.']], { dur: 12 }),
  },
  S6: {
    intuition: one([M('pend', { x: 52, y: 4, L: 64, a: 8, T: 2.84, trail: true }), M('pend', { x: 112, y: 4, L: 64, a: 4, T: 2.84, trail: true, c: 'verd' }), tx(52, 80, 'released at 8°', { fs: 3.3 }), tx(112, 80, 'released at 4°', { fs: 3.3 }),
      M('num', { x: 82, y: 88, v: 0, k: kf(40, u => ({ v: Math.floor(u * 12 / 2.84) })), pre: 'full swings, each: ', fs: 3.4 })],
      [[0, 'Two 2 m pendulums, one released at 8°, the other at 4°.'], [.3, 'The wider swing has twice as far to go, but it is pulled back twice as hard…'], [.6, '…so both arrive back together, every 2.84 s, like masses on springs.']], { dur: 12 }),
    misconception: one([M('pend', { x: 40, y: 6, L: 18, a: 25, T: 1.42, c: 'verd' }), M('pend', { x: 110, y: 6, L: 72, a: 25, T: 2.84 }), M('pend', { x: 110, y: 6, L: 72, a: 25, T: 5.68, c: 'mute', r: 2.2 }),
      tx(40, 32, 'L = 0.5 m: 1.42 s', { fs: 3.3 }), tx(70, 84, '4 L = 2 m: 2.84 s', { fs: 3.3 }), tx(120, 88, 'grey: if T grew like L, 5.68 s', { fs: 3, c: 'soft' })],
      [[0, 'A pendulum four times longer…'], [.3, '…swings only twice as slowly: T grows like √L.'], [.6, 'The grey ghost is what “proportional to L” would mean: four times as slow.']], { dur: 12 }),
  },
  S7: (() => { const dur = 12, w = 2 * Math.PI / 2.8, xa = u => 80 - 40 * Math.cos(w * u * dur), y = x => 40 + 32 * (1 - ((x - 80) / 50) ** 2), PE = u => (72 - y(xa(u))) / (72 - y(40));
    const ball = `${'80-40*cos(' + w.toFixed(4) + '*t)'}`;
    return {
      intuition: one([pa('M30 40Q80 104 130 40', { c: 'soft', sw: .7 }), M('mover', { x: ball, y: `40+32*(1-((${ball}-80)/50)^2)-2.2`, r: 2.2, c: 'lapis', trail: .5 }), ln(36, 51.5, 124, 51.5, { c: 'mute', dash: '1.2 1', sw: .35 }), tx(126, 50, 'start height', { fs: 3, c: 'soft', a: 'start' }),
        M('bars', { box: [128, 58, 28, 24], v: [1, 0, 1], max: 1, labels: ['height', 'speed', 'total'], c: ['lapis', 'brass', 'verd'], yl: 'energy (share of total)', k: kf(120, u => ({ v: [PE(u), 1 - PE(u), 1] })) })],
        [[0, 'A ball let go on the side of a bowl.'], [.3, 'On the way down it trades height for speed…'], [.55, '…and on the way up speed for height, climbing back to where it started.'], [.8, 'The split changes; the total (green) never does.']], { dur }),
      misconception: (() => { const th = u => 40 * Math.cos(2 * Math.PI * u * dur / 2.8), pe = u => (1 - Math.cos(th(u) * D2R)) / (1 - Math.cos(40 * D2R)); const P = { x: 30, y: 10, L: 34, a: 40, T: 2.8 };
        return pair([M('pend', P), M('bars', { box: [62, 14, 34, 40], v: [1, 0, 1], max: 1, labels: ['height', 'speed', 'total?'], c: ['lapis', 'brass', 'rubric'], yl: 'energy (J, share)', k: kf(120, u => ({ v: [pe(u), 0, pe(u)] })) })],
          [M('pend', P), M('bars', { box: [62, 14, 34, 40], v: [1, 0, 1], max: 1, labels: ['height', 'speed', 'total'], c: ['lapis', 'brass', 'verd'], yl: 'energy (J, share)', k: kf(120, u => ({ v: [pe(u), 1 - pe(u), 1] })) }), tx(79, 64, 'E = 4.59 J', { fs: 3.4, mono: true, c: 'verd' })],
          [[0, 'If the bob used its energy up on the way down, the total would drain at the bottom and refill on the way up.'], [.5, 'Really potential becomes kinetic and back: the sum stays 4.59 J all the way (no friction in the model).']], { dur }); })(),
    }; })(),
  S8: {
    intuition: one([M('pend', { x: 80, y: 42, L: 34, th: 150, k: exactPend(150, 2.84, 14), lin: true, strobe: .2, r: 2.6 }), ci(80, 42, 34, { c: 'mute', sw: .3, dash: '1 1' }), tx(80, 87, 'dots: where the bob was, every 0.2 s', { fs: 3.2, c: 'soft', it: true })],
      [[0, 'Released at 150°, almost upside down.'], [.25, 'Near the top the bob crawls: the dots pile up there…'], [.55, '…and it races through the bottom, where the dots spread out.'], [.8, 'Spending longer near the top makes the period 5.0 s, not 2.84 s.']], { dur: 14 }),
    misconception: one([...[[30, 10, '10°: 2.85 s'], [80, 90, '90°: 3.35 s'], [130, 150, '150°: 5.01 s']].flatMap(([x, a, l]) => [M('pend', { x, y: 30, L: 24, th: a, k: exactPend(a, 2.84, 16), lin: true, r: 2.2 }), tx(x, 64, l, { fs: 3.4, mono: true })]), stamp(80, 80, 'not isochronous', .7)],
      [[0, 'Three equal pendulums released together at 10°, 90° and 150°.'], [.35, 'Galileo’s claim would keep them in step.'], [.6, 'They drift apart: the period grows with amplitude, 2.85, 3.35, 5.01 s.']], { dur: 16 }),
  },
};

// ---- small scene pieces
const sun = (x, y, r = 5, o = {}) => g([ci(x, y, r, { f: 'brass', c: 'none' }), ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return ln(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85, { c: 'brass', sw: .6 }); })], o);
const cloud = (x, y, s = 1, o = {}) => g([pa(`M${x - 10 * s} ${y + 3 * s}a${4 * s} ${4 * s} 0 0 1 ${3 * s} ${-7 * s}a${5 * s} ${5 * s} 0 0 1 ${9 * s} ${-2 * s}a${4 * s} ${4 * s} 0 0 1 ${7 * s} ${5 * s}a${3 * s} ${3 * s} 0 0 1 ${1 * s} ${6 * s}Z`, { f: '#e9e4da', c: 'soft', sw: .45 })], o);
const rain = (x, y, w = 16, h = 14, o = {}) => g(Array.from({ length: 5 }, (_, i) => M('along', { pts: [x + i * w / 4, y, x + i * w / 4 - 2, y + h], n: 2, loop: .7 + i * .05, r: .55, c: 'lapis' })), o);
const thermo = (x, y, h, k, o = {}) => g([rc(x - 1.6, y, 3.2, h, { rx: 1.6, c: 'soft', sw: .4, f: '#fff' }), ci(x, y + h + 1.8, 2.6, { f: 'rubric', c: 'soft', sw: .4 }), rc(x - .8, y + h, 1.6, 0, { f: 'rubric', c: 'none', k: k.map(([q, v]) => [q, { y: y + h - v, h: v }]) })], o);   // k: [[u, filled height]]
const dial = (x, y, r, v, k, o = {}) => M('dial', { x, y, r, v, min: 970, max: 1040, marks: [[980, 'Rain'], [1000, 'Change'], [1020, 'Fair'], [1040, '']], k: k && k.map(([q, val]) => [q, { v: val }]), ...o });

// ======================================================================= the weather glass and the barometer
const WG = {
  S1: {
    intuition: one([...[[52, 18, 26], [34, 18, 15], [16, 18, 8], [2, 14, 4]].map(([y, h, n], i) => M('gas', { box: [58, y, 40, h], sp: [{ n, r: .75, v: 7, c: 'lapis' }], frame: false, seed: 11 + i })), rc(58, 2, 40, 68, { c: 'soft', dash: '1.4 1', sw: .4 }),
      rc(58, 70, 40, 2.4, { f: 'brass', c: 'ink', sw: .3 }), rc(20, 72.4, 120, 10, { f: 'sand', c: 'none' }), tx(78, 80, '1 m²', { fs: 3.4 }),
      ar(78, 40, 78, 68, { c: 'rubric', sw: 1.2, on: [.3, 1], label: '101 325 N', lx: 14, ly: -10 }),
      M('num', { x: 128, y: 30, v: 0, k: [[.3, { v: 0 }], [.6, { v: 10300 }]], pre: '', suf: ' kg of air', fs: 4 }), tx(128, 37, 'above every square metre', { fs: 3.2, c: 'soft' }),
      tx(128, 52, '1 cm² of skin:', { fs: 3.4, on: [.7, 1] }), tx(128, 58, 'about 1 kg', { fs: 4, b: true, c: 'rubric', on: [.72, 1] })],
      [[0, 'Air has weight: a column of it stands on every patch of ground, thinner and thinner upwards.'], [.32, 'Above one square metre it weighs about 10 300 kg and presses with 101 325 N.'], [.7, 'That is about 1 kg on every square centimetre of skin; we live at the bottom of an ocean of air.']], { dur: 12 }),
    misconception: (() => { const can = k => rc(35, 24, 30, 34, { rx: 2, f: '#cfd6dc', c: 'ink', sw: .5, k }); const around = [[50, 6, 50, 19], [50, 70, 50, 62], [14, 41, 30, 41], [86, 41, 70, 41], [20, 14, 31, 23], [80, 14, 69, 23], [20, 68, 31, 60], [80, 68, 69, 60]];
      return pair([rc(10, 58, 80, 4, { f: 'sand', c: 'soft', sw: .3 }), can([[.2, { y: 24, h: 34 }], [.65, { y: 42, h: 16 }]]), ...[[38, 6, 38, 20], [50, 6, 50, 20], [62, 6, 62, 20]].map(a => ar(...a, { c: 'rubric', sw: .7 })), tx(50, 68, 'pressure pushing down only?', { fs: 3.3, c: 'rubric' })],
        [can([[.2, { x: 35, y: 24, w: 30, h: 34 }], [.65, { x: 41, y: 30, w: 18, h: 22 }]]), ...around.map(a => ar(...a, { c: 'lapis', sw: .7 })), tx(50, 44, '1013 hPa', { fs: 3, c: 'ink', on: [.7, 1] }), tx(50, 4, 'equal from every side', { fs: 3.3, c: 'verd' })],
        [[0, 'Pump the air out of a can.'], [.2, 'If air pressure only pressed down like a weight, the can would be flattened from the top…'], [.55, '…but it is crushed from the sides as well: in air at rest, pressure pushes equally in every direction.']]); })(),
  },
  S2: {
    intuition: one([...Array.from({ length: 5 }, (_, i) => { const yF = 70 - 10 * (i + 1), u0 = .06 + i * .13; return g([rc(48, 0, 56, 9, { rx: 1, f: i % 2 ? '#d7c39a' : '#c9b083', c: 'soft', sw: .4 }), tx(76, 6, i === 4 ? 'top layer' : `carries ${4 - i} above`, { fs: 3.2 })], { ty: -14, o: 0, k: [[u0, { ty: -14, o: 0 }], [u0 + .02, { o: 1 }], [u0 + .1, { ty: yF }]] }); }),
      rc(40, 70, 72, 3, { f: 'sand', c: 'soft', sw: .3 }),
      ...Array.from({ length: 5 }, (_, i) => ar(118, 64 - 10 * i, 118 + 3 + 4 * (4 - i) * 0 + 4 * (5 - i) * .9, 64 - 10 * i, { c: 'rubric', sw: .7, on: [.75, 1] })), tx(140, 30, 'pressure', { fs: 3.3, c: 'rubric', on: [.75, 1] }), tx(140, 36, 'grows with depth', { fs: 3.3, c: 'rubric', on: [.75, 1] })],
      [[0, 'Lay the fluid down in layers, one on top of another.'], [.3, 'Each new layer adds its weight to every layer beneath it.'], [.72, 'So the deepest layer carries the most, and the pressure grows steadily with depth: p = ρgh.']], { dur: 11 }),
    misconception: (() => { const W = (x, y, w, k) => rc(x, y, w, 0, { f: 'water', c: 'none', k }), fill = (y, h) => [[.08, { y: y + h, h: 0 }], [.45, { y, h }]];
      const scene = (lakeReading, stampIt) => [W(8, 8, 22, fill(8, 22)), rc(30, 6, 3, 25, { f: 'soft', c: 'none' }), tx(19, 36, 'pond, 10 m deep', { fs: 3 }), M('num', { x: 56, y: 26, v: 0, k: [[.45, { v: 0 }], [.6, { v: 98 }]], suf: ' kPa', fs: 3.6 }),
        W(4, 42, 68, fill(42, 22)), rc(72, 40, 3, 25, { f: 'soft', c: 'none' }), tx(38, 70, 'lake, 10 km long, 10 m deep', { fs: 3 }), M('num', { x: 88, y: 60, v: 0, k: [[.45, { v: 0 }], [.6, { v: lakeReading }]], suf: ' kPa', fs: 3.6 }),
        ...(stampIt ? [stamp(52, 50, 'more water, more push?', .65)] : [])];
      return pair(scene(980, true), [...scene(98, false), tx(50, 4, 'only the depth counts: ρgh = 98 kPa', { fs: 3.2, c: 'verd' })],
        [[0, 'Fill a pond and a long lake to the same depth of 10 m.'], [.45, 'If a bigger lake pushed harder, its dam gauge would read far more…'], [.65, '…but both read ρgh = 1000 × 9.81 × 10 ≈ 98 kPa. Only the total force grows with the dam’s width.']]); })(),
  },
  S3: {
    intuition: one([rc(48, 66, 64, 12, { f: '#b9c0c6', c: 'ink', sw: .4 }), rc(72, 6, 10, 70, { c: 'ink', sw: .5, f: '#fff' }), rc(73, 7, 8, 68, { f: '#9aa3ab', c: 'none', k: [[.1, { y: 7, h: 68 }], [.45, { y: 23, h: 52 }]] }),
      tx(77, 15, 'vacuum', { fs: 3.1, c: 'soft', it: true, on: [.45, 1] }), ...[52, 58, 64, 90, 96, 102, 108].map(x => ar(x, 52, x, 65, { c: 'lapis', sw: .6, on: [.4, 1] })), tx(80, 86, 'the air pushes on the open dish', { fs: 3.2, c: 'lapis', on: [.4, 1] }),
      ln(86, 23, 92, 23, { c: 'rubric', sw: .4, on: [.5, 1] }), ln(86, 66, 92, 66, { c: 'rubric', sw: .4, on: [.5, 1] }), ln(89, 23, 89, 66, { c: 'rubric', sw: .4, on: [.5, 1] }), tx(91, 45, '760 mm', { fs: 3.3, c: 'rubric', a: 'start', on: [.5, 1] }),
      tx(30, 30, 'the column’s weight', { fs: 3.2, on: [.65, 1] }), tx(30, 36, 'per m² = the air’s', { fs: 3.2, on: [.65, 1] }), tx(30, 44, '101 325 Pa', { fs: 3.6, b: true, c: 'verd', on: [.68, 1] })],
      [[0, 'Turn a full tube of mercury upside down in a dish.'], [.15, 'The mercury sinks, leaving empty space at the top…'], [.42, '…and stops 760 mm above the dish, held by the air pressing on the open surface.'], [.65, 'A balance: the column’s weight per square metre equals the weight of the air column outside.']], { dur: 12 }),
    misconception: (() => { const base = [rc(18, 58, 64, 10, { f: '#b9c0c6', c: 'ink', sw: .4 }), rc(45, 10, 10, 56, { c: 'ink', sw: .5, f: '#fff' }), rc(46, 22, 8, 43, { f: '#9aa3ab', c: 'none' }), tx(58, 15, 'vacuum', { fs: 3, c: 'soft', it: true, a: 'start' })];
      return pair([...base, ...[47, 50, 53].map(x => ar(x, 21, x, 12, { c: 'rubric', sw: .6, dash: '1 .8', k: [[0, { draw: 0 }], [.35, { draw: 1 }]] })), tx(70, 14, 'suction?', { fs: 3.4, c: 'rubric', it: true }), stamp(50, 40, 'empty space pulls nothing', .65)],
        [...base, M('gas', { box: [4, 38, 38, 19], sp: [{ n: 9, r: .8, v: 10, c: 'lapis' }], hits: true, frame: false, seed: 5 }), M('gas', { box: [58, 38, 38, 19], sp: [{ n: 9, r: .8, v: 10, c: 'lapis' }], hits: true, frame: false, seed: 6 }), ar(50, 64, 50, 26, { c: 'verd', sw: .8, k: [[.3, { draw: 0 }], [.6, { draw: 1 }]] }), tx(70, 32, 'air pushes it up', { fs: 3.2, c: 'verd' })],
        [[0, 'What holds the mercury up?'], [.25, 'Not the vacuum: empty space exerts no force at all.'], [.5, 'The air molecules striking the open dish push the mercury up the tube until ρgh = P_atm.']]); })(),
  },
  S4: {
    intuition: one([M('gas', { box: [16, 14, 64, 60], sp: [{ n: 34, r: 1, v: 14, c: 'lapis' }], hits: true, vk: [[.15, 1], [.7, 1.41]], seed: 9 }), tx(48, 10, 'sealed, rigid flask', { fs: 3.2, c: 'soft' }),
      thermo(96, 18, 50, [[.15, 25], [.7, 50]]), tx(96, 80, 'T', { fs: 3.4, it: true }),
      M('dial', { x: 130, y: 40, r: 16, v: 1013, min: 900, max: 2200, a0: -130, a1: 130, marks: [[1000, '1000'], [1500, ''], [2000, '2000']], k: [[.15, { v: 1013 }], [.7, { v: 2026 }]] }), tx(130, 64, 'pressure (hPa)', { fs: 3.2 }),
      tx(80, 86, 'absolute temperature doubled: 290 K → 580 K', { fs: 3.2, c: 'soft', on: [.7, 1] })],
      [[0, 'Molecules in a sealed, rigid flask strike its walls all the time; the flashes are the hits.'], [.2, 'Heat it: the molecules speed up, so they hit harder and more often.'], [.6, 'The flask cannot grow, so all the heating can do is raise the pressure: double the absolute temperature, double the pressure.']], { dur: 12 }),
    misconception: (() => { const panel = (base, top0, top1, vk, p1, lab0, lab1) => [rc(10, 12, 6, 50, { c: 'soft', sw: .4, f: '#fff' }), rc(10, 62 - top0, 6, top0, { f: 'rubric', c: 'none', k: [[.15, { y: 62 - top0, h: top0 }], [.6, { y: 62 - top1, h: top1 }]] }), tx(13, 67, base, { fs: 3, c: 'soft' }), tx(18, 62 - top1 - 2, lab1, { fs: 3, a: 'start', on: [.6, 1] }), tx(18, 62 - top0 + 3, lab0, { fs: 3, a: 'start', on: [0, .55] }),
        M('gas', { box: [36, 18, 30, 34], sp: [{ n: 14, r: .9, v: 12, c: 'lapis' }], hits: true, vk: [[.15, 1], [.6, vk]], seed: 4 }), M('dial', { x: 82, y: 30, r: 11, v: 1013, min: 900, max: 2200, a0: -130, a1: 130, marks: [[1000, '1000'], [2000, '2000']], k: [[.15, { v: 1013 }], [.6, { v: p1 }]] }), M('num', { x: 82, y: 50, v: 1013, k: [[.15, { v: 1013 }], [.6, { v: p1 }]], suf: ' hPa', fs: 3.3 })];
      return pair([...panel('0 °C', 10, 20, 1.41, 2026, '10 °C', '20 °C'), stamp(50, 64, 'twice as hot? pressure ×2?', .7)],
        [...panel('0 K', 283 / 6, 293 / 6, 1.017, 1049, '283 K', '293 K'), tx(52, 64, 'measured from absolute zero: +3.5 %', { fs: 3, c: 'verd' })],
        [[0, 'Warm a sealed flask from 10 °C to 20 °C.'], [.3, 'Measured from 0 °C the temperature seems to double, and so would the pressure…'], [.62, '…but 0 °C is not zero. From absolute zero it is 283 K → 293 K: the pressure rises only 3.5 %.']]); })(),
  },
  S5: (() => { const glass = (lvl, extra = []) => [ci(34, 44, 18, { c: 'ink', sw: .6, f: '#eef3f6' }), M('gas', { box: [22, 32, 24, 16], sp: [{ n: 8, r: .8, v: 8, c: 'mute' }], frame: false, seed: 3 }), pa('M17.9 52L50.1 52A18 18 0 0 1 17.9 52Z', { f: 'water', c: 'none' }), pa('M48 56L70 56L70 8', { c: 'ink', sw: .6 }), pa('M48 60L74 60L74 8', { c: 'ink', sw: .6 }), rc(70.3, 30, 3.4, 30, { f: 'water', c: 'none', k: lvl.map(([q, y]) => [q, { y, h: 60 - y }]) }), tx(34, 70, 'trapped air', { fs: 3, c: 'soft' }), tx(77, 7, 'spout, open to the air', { fs: 3, c: 'soft', a: 'start' }), ...extra];
    return {
      intuition: one([...glass([[.15, 44], [.7, 18]]), ar(72, -2, 72, 6, { c: 'lapis', sw: .7, k: [[.15, { sw: .9 }], [.7, { sw: .3 }]] }), dial(122, 36, 18, 1020, [[.15, 1020], [.7, 1000]]), tx(122, 62, 'outside pressure', { fs: 3.2 }), tx(122, 68, 'falls by 20 hPa', { fs: 3.2, c: 'rubric', on: [.5, 1] })],
        [[0, 'Air sealed in the bulb, water in the spout open to the outside air.'], [.25, 'When the outside pressure falls, the trapped air pushes harder than the air outside…'], [.6, '…and drives the water up the spout: the water is the pointer of the balance.']], { w: 160, h: 90, dur: 12 }),
      misconception: pair([...glass([[.15, 44], [.65, 20]], [dial(88, 40, 9, 1020, [[.15, 1020], [.65, 1000]], { marks: [] }), sun(88, 20, 3, { on: [.6, 1] }), tx(88, 62, '“fair”?', { fs: 3.3, c: 'rubric', on: [.6, 1] })])],
        [...glass([[.15, 44], [.65, 20]], [dial(88, 40, 9, 1020, [[.15, 1020], [.65, 1000]], { marks: [] }), cloud(88, 18, .8, { on: [.55, 1] }), rain(82, 22, 12, 8, { on: [.65, 1] }), tx(88, 62, 'worse weather', { fs: 3.2, c: 'verd', on: [.6, 1] })])],
        [[0, 'Watch the spout as the outside pressure falls by 20 hPa.'], [.4, 'The water climbs high, about 10 mm per hPa of fall.'], [.62, 'High water means LOW pressure outside: a sign of worsening weather, not fair.']]),
    }; })(),
  S6: (() => { const mini = (x, lvl, extra) => [ci(x, 44, 12, { c: 'ink', sw: .5, f: '#eef3f6' }), pa(`M${x - 11.2} 49L${x + 11.2} 49A12 12 0 0 1 ${x - 11.2} 49Z`, { f: 'water', c: 'none' }), pa(`M${x + 9} 52L${x + 22} 52L${x + 22} 14`, { c: 'ink', sw: .5 }), pa(`M${x + 9} 55L${x + 25} 55L${x + 25} 14`, { c: 'ink', sw: .5 }), rc(x + 22.3, 40, 2.4, 15, { f: 'water', c: 'none', k: lvl.map(([q, y]) => [q, { y, h: 55 - y }]) }), ...extra];
    return {
      intuition: one([...mini(22, [[.15, 44], [.6, 24]], [M('gas', { box: [14, 37, 16, 10], sp: [{ n: 6, r: .7, v: 7, c: 'mute' }], frame: false, vk: [[.15, 1], [.6, 1.6]], seed: 2 }), thermo(4, 22, 26, [[.15, 8], [.6, 20]]), tx(30, 76, 'the room warms', { fs: 3.4 })]),
        ...mini(96, [[.15, 44], [.6, 24]], [M('gas', { box: [88, 37, 16, 10], sp: [{ n: 6, r: .7, v: 7, c: 'mute' }], frame: false, seed: 2 }), dial(140, 34, 12, 1020, [[.15, 1020], [.6, 1013]], { marks: [] }), tx(110, 76, 'the outside pressure falls', { fs: 3.4 })]),
        tx(80, 87, 'the same rise in both spouts', { fs: 3.4, c: 'rubric', on: [.65, 1] })],
        [[0, 'Two weather glasses, two different causes.'], [.2, 'Left: the room warms, the trapped air pushes harder. Right: the air outside presses less.'], [.62, 'The water rises the same way in both; the glass cannot tell them apart.']], { dur: 12 }),
      misconception: pair([...mini(26, [[.15, 44], [.6, 24]], [dial(74, 30, 10, 1020, [[.3, 1020], [.7, 999]], { marks: [] }), tx(74, 48, 'so pressure fell?', { fs: 3.2, c: 'rubric', on: [.4, 1] })])],
        [...mini(26, [[.15, 44], [.6, 24]], [thermo(8, 14, 22, [[.15, 6], [.6, 16]]), dial(74, 30, 10, 1013, null, { marks: [] }), tx(74, 48, 'pressure unchanged', { fs: 3.2, c: 'verd' }), tx(50, 68, 'the glass warmed 3 K: about 10 hPa', { fs: 3.2, c: 'verd', on: [.6, 1] })])],
        [[0, 'The spout has risen.'], [.3, 'Reading it as “the pressure fell” ignores the other cause…'], [.6, '…here the pressure did not change at all: the bulb warmed. Each kelvin fakes about 3.5 hPa.']]),
    }; })(),
  S7: (() => { const crystals = (k, x0 = 44, n = 7) => g(Array.from({ length: n }, (_, i) => pa(`M${x0 + i * 5} 70l${(i % 2 ? 1.5 : -1.5)} ${-6 - (i % 3) * 3}`, { c: 'ink', sw: .9, draw: 0, k })), {});
    return {
      intuition: one([rc(36, 20, 44, 52, { c: 'ink', sw: .6, f: '#f3f0e6' }), M('gas', { box: [37, 28, 42, 42], sp: [{ n: 26, r: .7, v: 5, c: 'brass' }], frame: false, seed: 8 }), crystals([[.45, { draw: 0 }], [.8, { draw: 1 }]]),
        ln(36, 30, 80, 30, { c: 'verd', dash: '2 1', sw: .6, k: [[.1, { y: 30, y2: 30 }], [.75, { y: 56, y2: 56 }]] }), tx(82, 30, 'can hold', { fs: 3.1, c: 'verd', a: 'start', k: [[.1, { y: 31 }], [.75, { y: 57 }]] }), ln(36, 42, 80, 42, { c: 'brass', dash: '.8 .8', sw: .5 }), tx(82, 43, 'holds now', { fs: 3.1, c: 'brass', a: 'start' }),
        thermo(120, 20, 44, [[.1, 40], [.75, 8]]), M('num', { x: 120, y: 80, v: 25, k: [[.1, { v: 25 }], [.75, { v: 5 }]], suf: ' °C', fs: 3.6 })],
        [[0, 'Camphor dissolved in warm alcohol: the liquid holds all of it.'], [.25, 'Cool it, and the amount it can hold shrinks, like a sponge squeezed smaller.'], [.5, 'Below the line, what no longer fits comes out as crystals.']], { dur: 12 }),
      misconception: pair([rc(28, 18, 40, 52, { c: 'ink', sw: .6, f: '#f3f0e6' }), M('gas', { box: [29, 26, 38, 42], sp: [{ n: 30, r: .65, v: 5, c: 'brass' }], frame: false, seed: 8 }), crystals([[0, { draw: 1 }]], 34, 6), M('num', { x: 84, y: 30, v: 25, k: [[.1, { v: 25 }], [.7, { v: 5 }]], suf: ' °C', fs: 3.4 }), tx(48, 12, 'lots of camphor → crystals?', { fs: 3.2, c: 'rubric' })],
        [rc(28, 18, 40, 52, { c: 'ink', sw: .6, f: '#f3f0e6' }), M('gas', { box: [29, 26, 38, 42], sp: [{ n: 30, r: .65, v: 5, c: 'brass' }], frame: false, seed: 8 }), crystals([[.45, { draw: 0 }], [.8, { draw: 1 }]], 34, 6), M('num', { x: 84, y: 30, v: 25, k: [[.1, { v: 25 }], [.7, { v: 5 }]], suf: ' °C', fs: 3.4 }), M('num', { x: 84, y: 40, v: -.38, k: [[.1, { v: -.38 }], [.7, { v: 1.25 }]], dp: 2, pre: 'σ = ', fs: 3.4 }), tx(84, 50, 'σ > 0: crystals', { fs: 3, c: 'verd', on: [.5, 1] })],
        [[0, 'The same liquid, cooled from 25 °C to 5 °C.'], [.3, 'If the amount of camphor decided, there would be crystals all along.'], [.55, 'What decides is the amount compared with what the liquid can hold now: σ goes from −0.38 (clear) to +1.25 (crystals).']]),
    }; })(),
  S8: { intuition: one([rc(0, 0, 160, 90, { f: '#1d2433', c: 'none', o: 0, k: [[0, { o: 0 }], [.3, { o: 0 }], [.45, { o: .55 }], [.75, { o: .55 }], [.9, { o: 0 }]] }), sun(28, 16, 5, { k: [[.25, { o: 1, ty: 0 }], [.4, { o: 0, ty: 20 }], [.82, { o: 0, ty: 20 }], [.95, { o: 1, ty: 0 }]] }), ci(132, 16, 4, { f: '#e9e4da', c: 'none', o: 0, k: [[.35, { o: 0 }], [.48, { o: 1 }], [.75, { o: 1 }], [.85, { o: 0 }]] }),
      rc(66, 14, 28, 64, { rx: 10, c: 'ink', sw: .6, f: '#f3f0e6' }), M('gas', { box: [68, 24, 24, 50], sp: [{ n: 16, r: .7, v: 4, c: 'brass' }], frame: false, seed: 4 }),
      g(Array.from({ length: 6 }, (_, i) => pa(`M${70 + i * 4} 76l${i % 2 ? 1.6 : -1.6} ${-7 - (i % 3) * 4}`, { c: 'ink', sw: 1, draw: 0, k: [[.35, { draw: 0 }], [.6, { draw: 1 }], [.78, { draw: 1 }], [.95, { draw: 0 }]] }))), M('num', { x: 118, y: 52, v: 22, k: [[.3, { v: 22 }], [.55, { v: 8 }], [.78, { v: 8 }], [.95, { v: 22 }]], suf: ' °C', fs: 3.8, c: 'ink' })],
    [[0, 'A storm glass by a window, through a day and a night.'], [.35, 'At night the liquid cools: the camphor it can no longer hold grows into crystals…'], [.8, '…and by day they dissolve again, like dew forming and drying.']], { dur: 13 }),
    misconception: one([rc(30, 14, 26, 64, { rx: 10, c: 'ink', sw: .6, f: '#f3f0e6' }), g(Array.from({ length: 5 }, (_, i) => pa(`M${33 + i * 4.5} 76l${i % 2 ? 1.5 : -1.5} -7`, { c: 'ink', sw: 1, draw: 1 }))), g(Array.from({ length: 6 }, (_, i) => pa(`M${34 + i * 4} 69l${i % 2 ? 1.5 : -1.5} -9`, { c: 'ink', sw: 1, draw: 0, k: [[.6, { draw: 0 }], [.85, { draw: 1 }]] }))),
      dial(84, 30, 13, 1013, [[.1, 1013], [.4, 993]]), tx(84, 50, 'pressure −20 hPa', { fs: 3.2, on: [.1, 1] }), tx(84, 56, 'crystals: no change', { fs: 3.2, c: 'soft', on: [.4, 1] }),
      thermo(124, 18, 36, [[.55, 26], [.85, 12]]), tx(124, 68, 'cool by 5 K', { fs: 3.2, on: [.55, 1] }), tx(124, 74, 'crystals ×2', { fs: 3.4, c: 'rubric', b: true, on: [.85, 1] })],
    [[0, 'Test the storm glass: first drop the pressure by 20 hPa.'], [.42, 'The crystals do not change.'], [.55, 'Now cool it by 5 K: the crystals more than double. It is a thermometer, not a storm forecaster.']], { dur: 13 }) },
  S9: {
    intuition: one([M('curve', { box: [10, 12, 92, 60], xr: [0, 12], yr: [996, 1016], f: '1013-1.2*x', c: 'rubric', draw: 0, k: [[.05, { draw: 0 }], [.7, { draw: 1 }]], axes: false }), tx(100, 65, 'falling: a low approaches', { fs: 3.1, c: 'rubric', a: 'end', on: [.6, 1] }), M('curve', { box: [10, 12, 92, 60], xr: [0, 12], yr: [996, 1016], f: '1005+0.3*x', c: 'verd', draw: 0, k: [[.05, { draw: 0 }], [.7, { draw: 1 }]], axes: false }), tx(100, 31, 'rising: clearing', { fs: 3.1, c: 'verd', a: 'end', on: [.6, 1] }),
      ln(10, 72, 102, 72, { c: 'soft', sw: .4 }), ln(10, 12, 10, 72, { c: 'soft', sw: .4 }), tx(102, 78, 'hours →', { fs: 3, c: 'soft', a: 'end' }), tx(12, 9, 'hPa', { fs: 3, c: 'soft', a: 'start' }), ...[0, 3, 6, 9, 12].map(h => tx(10 + h / 12 * 92, 77, h, { fs: 2.8, c: 'soft' })),
      ar(10, 34.5, 33, 34.5, { c: 'ink', sw: .5, dash: '1 1', on: [.3, 1] }), tx(22, 31, '−3.6 hPa in 3 h', { fs: 3, c: 'rubric', on: [.3, 1] }),
      dial(138, 40, 15, 1013, [[.05, 1013], [.7, 999]]), tx(138, 62, 'watch which way', { fs: 3.2 }), tx(138, 67, 'the needle moves', { fs: 3.2 })],
      [[0, 'Two barometer traces over 12 hours.'], [.3, 'A fall of 3.6 hPa in 3 hours: a low is coming towards you.'], [.65, 'A slow rise: the weather is clearing. The direction of travel carries the forecast.']], { w: 160, h: 90, dur: 12 }),
    misconception: pair([dial(50, 34, 20, 990, null), sun(80, 12, 4), stamp(50, 62, 'it stays dry', .6), tx(50, 8, '990 hPa, needle on “Rain”', { fs: 3.2 })],
      [dial(50, 34, 20, 1003, [[.15, 1003], [.7, 1000]]), cloud(82, 14, .7, { on: [.5, 1] }), rain(77, 18, 10, 8, { on: [.65, 1] }), tx(50, 64, 'falling > 3 hPa in 3 h: worsening', { fs: 3.2, c: 'verd' })],
      [[0, 'A needle resting on “Rain” at 990 hPa…'], [.35, '…can sit there in sunshine: the dial word is not a forecast.'], [.55, 'Read the change instead: a fall of more than 3 hPa in 3 hours means bad weather is coming, whatever the dial says.']]),
  },
};
// ======================================================================= projectiles and orbits
const clampE = 'min(max(t-1.2,0),6)';
const ORBIT = {
  S1: {
    intuition: one([rc(0, 78, 160, 12, { f: 'sand', c: 'none' }), M('proj', { x: 18, y: 78, vx: 20.4, vy: 20.4, gy: 6.8, u0: .1, u1: .6, floor: 78, vec: true, vs: .6, dots: .6, r: 2 }),
      M('mover', { x: `18+20.4*${clampE}`, y: '84', r: 1.4, f: 'verd' }), tx(150, 86, 'sideways clock', { fs: 3, c: 'verd', a: 'end' }), M('mover', { x: '6', y: `78-(20.4*${clampE}-3.4*${clampE}^2)`, r: 1.4, f: 'rubric' }), ln(6, 20, 6, 78, { c: 'mute', sw: .3, dash: '1 1' }), tx(8, 16, 'up-down clock', { fs: 3, c: 'rubric', a: 'start' })],
      [[0, 'A ball fired at 20 m/s and 45°: two clocks run at once.'], [.25, 'Sideways the speed never changes: the green shadow on the ground moves evenly.'], [.5, 'Up and down, gravity takes 9.81 m/s off the speed each second: the red shadow slows, stops and falls back.']], { dur: 12 }),
    misconception: (() => { const table = [rc(4, 14, 12, 48, { f: 'sand', c: 'soft', sw: .3 }), rc(0, 62, 100, 10, { f: 'sand', c: 'none' })];
      return pair([...table, M('proj', { x: 12, y: 14, vx: 0, vy: 0, gy: 3.17, u0: .15, u1: .7, floor: 60, dots: .7, r: 2, c: 'verd' }), M('proj', { x: 16, y: 14, vx: 12.7, vy: 0, gy: 1.6, u0: .15, u1: .95, floor: 60, dots: .7, r: 2 }), stamp(60, 30, 'stays up longer?', .72)],
        [...table, M('proj', { x: 12, y: 14, vx: 0, vy: 0, gy: 3.17, u0: .15, u1: .7, floor: 60, dots: .7, r: 2, c: 'verd' }), M('proj', { x: 16, y: 14, vx: 12.7, vy: 0, gy: 3.17, u0: .15, u1: .7, floor: 60, dots: .7, r: 2 }), tx(60, 30, 'both land after 0.50 s', { fs: 3.6, c: 'verd', on: [.7, 1] }), tx(60, 36, 'faded dots: equal times, equal heights', { fs: 3, c: 'soft' })],
        [[0, 'One ball is dropped, the other fired sideways off the same 1.25 m table.'], [.3, 'If sideways speed held a ball up, the fired one would land later…'], [.6, '…but both fall 1.25 m in √(2h/g) = 0.50 s. The speed changes where it lands, not when.']], { dur: 10 }); })(),
  },
  S2: {
    intuition: one([rc(0, 78, 160, 12, { f: 'sand', c: 'none' }), M('proj', { x: 18, y: 78, vx: 20.4, vy: 20.4, gy: 6.8, u0: .1, u1: .6, floor: 78, aim: true, drop: true, dots: .6, r: 2 }), tx(80, 10, 'dashed: the line it was aimed along', { fs: 3.3, c: 'soft' }), tx(80, 16, 'red: the drop below it, ½gt²', { fs: 3.3, c: 'rubric' })],
      [[0, 'Aim along a straight line and fire.'], [.25, 'Gravity pulls the ball below the aiming line: ½gt², 4.9 m after the first second…'], [.5, '…and four times as far after two: a drop growing like t² bends the straight shot into a parabola.']], { dur: 12 }),
    misconception: pair([rc(0, 62, 100, 10, { f: 'sand', c: 'none' }), ci(14, 62, 2, { f: 'lapis', c: 'ink', sw: .3, k: [[.1, { x: 14, y: 60 }], [.45, { x: 48, y: 26 }], [.55, { x: 57, y: 24 }], [.62, { x: 61, y: 30 }], [.8, { x: 62, y: 60 }]], lin: true }),
      ar(14, 60, 24, 50, { c: 'rubric', sw: .8, o: 1, label: 'push of the throw?', k: [[.1, { x: 14, y: 60, x2: 26, y2: 48 }], [.45, { x: 48, y: 26, x2: 53, y2: 21 }], [.55, { x: 57, y: 24, x2: 58, y2: 23.5 }], [.58, { o: 0 }]] }), stamp(62, 40, 'runs out, then drops?', .8)],
      [rc(0, 62, 100, 10, { f: 'sand', c: 'none' }), M('proj', { x: 10, y: 60, vx: 14, vy: 14, gy: 4.6, u0: .1, u1: .7, floor: 60, vec: true, vs: .7, dots: .5, r: 2 }), tx(56, 10, 'after launch only gravity acts:', { fs: 3.2, c: 'verd' }), tx(56, 16, 'vₓ = 14.14 m/s, never changing', { fs: 3.2, c: 'verd' })],
      [[0, 'If the throw left a “push” inside the ball, it would fly straight until the push ran out, then drop.'], [.55, 'Really no force acts forwards after launch: the sideways speed stays the same, and gravity alone bends the path.']], { dur: 10 }),
  },
  S3: {
    intuition: one([sun(20, 45, 4), ...[[20, 45, 140, 21], [20, 45, 140, 69]].map(l => ln(...l, { c: 'brass', sw: .5, draw: 0, k: [[0, { draw: 0 }], [.25, { draw: 1 }]] })),
      g([rc(76, 33.8, 4, 22.4, { f: 'brass', fo: .6, c: 'ink', sw: .3 }), tx(78, 62, 'r: 1 tile', { fs: 3.3 }), tx(78, 28, 'all of it', { fs: 3.2, c: 'brass' })], { o: 0, k: [[.25, { o: 0 }], [.35, { o: 1 }]] }),
      g([rc(136, 21, 4, 48, { f: 'brass', fo: .2, c: 'ink', sw: .3 }), ...[0, 1].flatMap(i => [0, 1].map(j => rc(124 + i * 11 - 6, 76 + j * 6 - 70, 0, 0)))], { o: 0, k: [[.45, { o: 0 }], [.55, { o: 1 }]] }),
      g([...[0, 1].flatMap(i => [0, 1].map(j => rc(142 + i * 7, 33 + j * 12, 7, 12, { f: 'brass', fo: .35, c: 'ink', sw: .3 })))], { o: 0, k: [[.55, { o: 0 }], [.65, { o: 1 }]] }), tx(150, 76, '2r: 4 tiles, ¼ each', { fs: 3.3, a: 'end' }),
      M('num', { x: 80, y: 86, v: 1, k: [[.55, { v: 1 }], [.75, { v: .25 }]], dp: 2, pre: 'pull per tile: ', suf: ' of the pull at r', fs: 3.4 })],
      [[0, 'Light from a bulb fills a widening cone.'], [.25, 'At distance r it falls on one tile.'], [.5, 'At 2r the same light covers four tiles (the area grows like r²), so each gets a quarter.'], [.75, 'Gravity spreads the same way: double the distance, a quarter of the pull.']], { dur: 12 }),
    misconception: pair([ci(50, 112, 50, { f: '#c9dbe8', c: 'lapis', sw: .5 }), g([rc(44, 6, 12, 5, { f: 'mute', c: 'ink', sw: .3 }), tx(50, 18, 'g = 0 up here?', { fs: 3.3, c: 'rubric' })], { k: [[0, { ty: 0 }], [.5, { ty: 2 }], [1, { ty: 0 }]] }), stamp(50, 38, 'only 420 km up', .6)],
      [ci(50, 112, 50, { f: '#c9dbe8', c: 'lapis', sw: .5 }), ci(50, 112, 53.3, { c: 'mute', sw: .4, dash: '1.2 1' }), g([rc(44, 56.7, 12, 4, { f: 'mute', c: 'ink', sw: .3 }), ar(50, 61, 50, 72, { c: 'rubric', sw: .8, label: '8.6 m/s²', lx: 10 })], { ox: 50, oy: 112, rot: -40, k: [[0, { rot: -40 }], [1, { rot: 40 }]], lin: true }), tx(50, 8, 'gravity is 88 % of g there;', { fs: 3.2, c: 'verd' }), tx(50, 14, 'crew and station fall together', { fs: 3.2, c: 'verd' })],
      [[0, 'At 420 km the space station is just above the Earth (drawn to scale).'], [.35, 'Gravity there is still 8.6 m/s², 88 % of g.'], [.6, 'The crew float because they and the station fall around the Earth together, always missing it.']]),
  },
  S4: (() => { const a = 50, e = .6, b = a * Math.sqrt(1 - e * e), cx = 70, cy = 45, sx = cx + a * e, P = 14, pos = u => { const Mn = 2 * Math.PI * u * 14 / P; let E = Mn; for (let i = 0; i < 30; i++) E = E - (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E)); return [cx + a * Math.cos(E), cy - b * Math.sin(E)]; };
    const wedge = (u0, u1) => { const pts = [sx, cy]; for (let i = 0; i <= 12; i++) pts.push(...pos(u0 + (u1 - u0) * i / 12)); return po(pts, { closed: true, f: 'brass', fo: .35, c: 'brass', sw: .4, on: [u1, 1] }); };
    return {
      intuition: one([pa(`M${cx + a} ${cy}A${a} ${b} 0 1 0 ${cx - a} ${cy}A${a} ${b} 0 1 0 ${cx + a} ${cy}`, { c: 'mute', sw: .4 }), sun(sx, cy, 3), wedge(-.06, .06), wedge(.44, .56), ln(sx, cy, 0, 0, { c: 'soft', sw: .4, k: kf(160, u => { const [x, y] = pos(u); return { x2: x, y2: y }; }) }), ci(0, 0, 2.2, { f: 'lapis', c: 'ink', sw: .3, k: kf(160, u => { const [x, y] = pos(u); return { x, y }; }) }),
        tx(132, 20, 'equal times,', { fs: 3.4 }), tx(132, 26, 'equal areas', { fs: 3.4 }), tx(132, 70, 'fast near the Sun,', { fs: 3.2, c: 'soft' }), tx(132, 76, 'slow far away', { fs: 3.2, c: 'soft' })],
        [[0, 'A planet on a stretched orbit, the Sun at one focus.'], [.1, 'In the same time near the Sun it sweeps a short, wide wedge…'], [.56, '…and far away a long, thin one of the same area.'], [.75, 'A pull straight towards the Sun can change the speed but not this sweeping rate: angular momentum is conserved.']], { dur: 14 }),
      misconception: (() => { const e2 = .8, a2 = 52, b2 = a2 * Math.sqrt(1 - e2 * e2), fx = 72 + a2 * e2, p2 = u => { const Mn = 2 * Math.PI * u; let E = Mn; for (let i = 0; i < 40; i++) E = E - (E - e2 * Math.sin(E) - Mn) / (1 - e2 * Math.cos(E)); const x = 72 + a2 * Math.cos(E), y = 45 - b2 * Math.sin(E), r = Math.hypot(x - fx, y - 45) / a2, v = Math.sqrt(2 / r - 1), vx = -a2 * Math.sin(E), vy = -b2 * Math.cos(E), n = Math.hypot(vx, vy); return { x, y, x2: x + vx / n * v * 5, y2: y + vy / n * v * 5, v }; };
        return one([pa(`M${72 + a2} 45A${a2} ${b2} 0 1 0 ${72 - a2} 45A${a2} ${b2} 0 1 0 ${72 + a2} 45`, { c: 'mute', sw: .4 }), sun(fx, 45, 2.6), M('mover', { x: `72+${a2}*cos(2*pi*t/14)`, y: `45-${b2.toFixed(2)}*sin(2*pi*t/14)`, r: 1.6, f: 'mute', lab: 'if speed were constant', ly: -2 }),
          ar(0, 0, 1, 1, { c: 'brass', sw: .7, k: kf(200, u => p2(u)) }), ci(0, 0, 2, { f: 'lapis', c: 'ink', sw: .3, k: kf(200, u => p2(u)) }), M('num', { x: 80, y: 86, v: 1, k: kf(200, u => ({ v: p2(u).v / p2(.5).v })), dp: 1, pre: 'speed: ', suf: ' × the slowest', fs: 3.4 })],
          [[0, 'A comet on an orbit with e = 0.8 (the arrow is its speed).'], [.25, 'Far from the Sun it creeps; near it, it is 9 times faster (Halley’s comet: 60 times).'], [.6, 'The grey dot is the constant-speed orbit people imagine: the real comet falls behind it and then races past.']], { dur: 14 }); })(),
    }; })(),
  S5: (() => { const X = r => 10 + (r - .3) / 5.7 * 140, Y = v => 80 - (v + 3.3) / 3.8 * 70, xs = r => `(10+((${r})-0.3)/5.7*140)`, ys = r => `(80-(-1/(${r})+3.3)/3.8*70-2)`, R1 = '(1.2+0.8*cos(1.1*t))', R2 = '(0.5+0.42*(t%13))';
    return {
      intuition: one([M('curve', { box: [10, 10, 140, 70], xr: [.3, 6], yr: [-3.3, .5], f: '-1/x', c: 'soft', sw: 1.1, axes: false }), ln(10, Y(0), 150, Y(0), { c: 'soft', sw: .35 }), tx(150, Y(0) - 2, 'the rim: zero energy', { fs: 3.1, a: 'end', c: 'soft' }),
        ln(X(.4), Y(-.5), X(2), Y(-.5), { c: 'lapis', dash: '1.5 1', sw: .5 }), tx(X(2) + 2, Y(-.5) + 1, 'ε = −0.5: turns back', { fs: 3.2, c: 'lapis', a: 'start' }), ln(X(.4), Y(.05), 150, Y(.05), { c: 'verd', dash: '1.5 1', sw: .5 }), tx(80, Y(.05) - 2, 'ε = +0.05: over the rim', { fs: 3.2, c: 'verd' }),
        M('mover', { x: xs(R1), y: ys(R1), r: 2, f: 'lapis' }), M('mover', { x: xs(R2), y: ys(R2), r: 2, f: 'verd' })],
        [[0, 'A marble in a funnel: the deeper, the stronger the pull (the curve is −GM/r).'], [.3, 'With too little energy (blue) it rolls out, stops and falls back: a bound orbit.'], [.6, 'With a little more than zero (green) it climbs ever more slowly and never comes back.']], { dur: 13 }),
      misconception: pair([rc(0, 64, 100, 8, { f: '#c9dbe8', c: 'none' }), ln(0, 12, 100, 12, { c: 'rubric', dash: '1.5 1', sw: .5 }), tx(50, 9, '“edge of gravity”?', { fs: 3.2, c: 'rubric' }),
        g([pa('M48 0l2 -5l2 5z', { f: 'mute', c: 'ink', sw: .3 }), pa('M48.6 0l1.4 4l1.4 -4z', { f: 'brass', c: 'none', k: [[0, { o: 1 }]] })], { ty: 62, k: [[.1, { ty: 62 }], [.8, { ty: 16 }]] }), stamp(50, 40, 'thrust all the way out?', .82)],
        [rc(0, 64, 100, 8, { f: '#c9dbe8', c: 'none' }), M('curve', { box: [14, 14, 76, 40], xr: [1, 20], yr: [0, 12], f: '11.2/sqrt(x)', c: 'verd', draw: 0, k: [[.1, { draw: 0 }], [.85, { draw: 1 }]], xl: 'distance (Earth radii)', yl: 'speed (km/s)' }),
          M('num', { x: 60, y: 8, v: 11.2, k: kf(60, u => ({ v: 11.2 / Math.sqrt(1 + 19 * Math.max(0, Math.min(1, (u - .1) / .75))) })), dp: 2, pre: 'coasting at ', suf: ' km/s', fs: 3.4 }), tx(52, 62, 'slower and slower, never zero', { fs: 3.2, c: 'verd', on: [.6, 1] })],
        [[0, 'Leaving the Earth for good.'], [.3, 'If gravity had an edge, a rocket would have to burn all the way to it.'], [.55, 'Gravity never ends, but launched at 11.2 km/s a body coasts out, slowing ever more gently, and never stops (ignoring air).']]),
    }; })(),
};

// ======================================================================= five laboratories
const dpend = (a1, a2, dur, n = 200) => { const L = 1, gg = 9.81, h = .002; let s = [a1, a2, 0, 0], t = 0; const out = [];
  const f = ([t1, t2, w1, w2]) => { const d = t1 - t2, den = 3 - Math.cos(2 * d); return [w1, w2, (-3 * gg * Math.sin(t1) - gg * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * (w2 * w2 * L + w1 * w1 * L * Math.cos(d))) / (L * den), (2 * Math.sin(d) * (2 * w1 * w1 * L + 2 * gg * Math.cos(t1) + w2 * w2 * L * Math.cos(d))) / (L * den)]; };
  for (let i = 0; i <= n; i++) { const tt = dur * i / n; while (t < tt) { const k1 = f(s), k2 = f(s.map((v, j) => v + h / 2 * k1[j])), k3 = f(s.map((v, j) => v + h / 2 * k2[j])), k4 = f(s.map((v, j) => v + h * k3[j])); s = s.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); t += h; } out.push([s[0], s[1]]); } return out; };
const dpItems = (S, x, y, L, c, o = {}) => { const P = S.map(([a, b]) => { const x1 = x + L * Math.sin(a), y1 = y + L * Math.cos(a); return [x1, y1, x1 + L * Math.sin(b), y1 + L * Math.cos(b)]; }), K = fn => P.map((p, i) => [i / (P.length - 1), fn(p)]);
  return [ln(x, y, 0, 0, { c, sw: .6, k: K(p => ({ x2: p[0], y2: p[1] })), lin: true, ...o }), ln(0, 0, 0, 0, { c, sw: .6, k: K(p => ({ x: p[0], y: p[1], x2: p[2], y2: p[3] })), lin: true, ...o }), ci(0, 0, 1.6, { f: c, c: 'none', k: K(p => ({ x: p[0], y: p[1] })), lin: true, ...o }), ci(0, 0, 1.8, { f: c, c: 'none', k: K(p => ({ x: p[2], y: p[3] })), lin: true, ...o })]; };
const DPA = dpend(2.1, 1.2, 14), DPB = dpend(2.101, 1.2, 14);
const lens = (() => { const f = 2.5, s = 10, X0 = 80, Y0 = 45, h = 8; const st = u => { const d = 10 - 6.2 * Math.min(1, Math.max(0, (u - .1) / .7)), di = 1 / (1 / f - 1 / d), ox = X0 - s * d, ix = X0 + s * di, ih = -h * di / d; return { d, di, ox, ix, ih }; };
  return { st, items: [ln(0, Y0, 160, Y0, { c: 'mute', sw: .4 }), pa(`M${X0} ${Y0 - 24}l-2 3m2 -3l2 3M${X0} ${Y0 + 24}l-2 -3m2 3l2 -3M${X0} ${Y0 - 24}L${X0} ${Y0 + 24}`, { c: 'lapis', sw: .8 }), ci(X0 - s * f, Y0, .8, { f: 'ink', c: 'none' }), ci(X0 + s * f, Y0, .8, { f: 'ink', c: 'none' }), tx(X0 - s * f, Y0 + 5, 'F', { fs: 3.2 }), tx(X0 + s * f, Y0 + 5, 'F', { fs: 3.2 }),
    ar(0, Y0, 0, Y0 - h, { c: 'verd', sw: 1, k: kf(80, u => ({ x: st(u).ox, x2: st(u).ox })) }), ar(0, Y0, 0, Y0, { c: 'rubric', sw: 1, k: kf(80, u => { const q = st(u); return { x: Math.min(q.ix, 158), x2: Math.min(q.ix, 158), y2: Y0 - Math.max(-40, q.ih), o: q.ix < 158 ? 1 : 0 }; }) }),
    ln(0, 0, X0, Y0 - h, { c: 'brass', sw: .4, k: kf(80, u => ({ x: st(u).ox, y: Y0 - h })) }), ln(X0, Y0 - h, 0, 0, { c: 'brass', sw: .4, k: kf(80, u => { const q = st(u), m = h / (s * f); return { x2: 160, y2: Y0 - h + m * (160 - X0) }; }) }), ln(0, 0, 160, 0, { c: 'brass', sw: .4, k: kf(80, u => { const q = st(u), m = h / (X0 - q.ox); return { x: q.ox, y: Y0 - h, y2: Y0 - h + m * (160 - q.ox) }; }) }),
    M('num', { x: 30, y: 84, v: 10, k: kf(80, u => ({ v: st(u).d })), dp: 1, pre: 'object at ', suf: ' units', fs: 3.4 }), M('num', { x: 120, y: 84, v: 3.3, k: kf(80, u => ({ v: st(u).di })), dp: 1, pre: 'image at ', suf: ' units', fs: 3.4, c: 'rubric' })] }; })();
const bounce = (e, h0, n, x0, x1, yF, sc) => { const segs = []; let h = h0, v = Math.sqrt(2 * 9.81 * h0), t = Math.sqrt(2 * h0 / 9.81); segs.push({ t0: 0, t1: t, type: 'drop', h0 }); for (let i = 0; i < n; i++) { v *= e; const T = 2 * v / 9.81; segs.push({ t0: t, t1: t + T, v }); t += T; } const tot = t;
  const at = tt => { const s = segs.find(q => tt <= q.t1) || segs[segs.length - 1]; const q = Math.min(tt, s.t1) - s.t0; const y = s.type === 'drop' ? h0 - .5 * 9.81 * q * q : s.v * q - .5 * 9.81 * q * q; return [x0 + (x1 - x0) * tt / tot, yF - Math.max(0, y) * sc]; };
  return { tot, at, peaks: segs.slice(1).map(s => s.v * s.v / 19.62) }; };
const FIVE = {
  S1: {
    intuition: one([pa('M80 50l-5 10h10z', { f: 'soft', c: 'none' }), g([rc(20, 47, 120, 3, { f: 'brass', c: 'ink', sw: .3 }), rc(36, 39, 8, 8, { f: 'ink', c: 'none' }), tx(40, 36, '3 kg at 2 m', { fs: 3.2 }), g([rc(-3, -6, 6, 6, { f: 'lapis', c: 'none' }), tx(0, -9, '2 kg', { fs: 3.2 })], { tx: 90, ty: 47, k: [[.1, { tx: 90 }], [.75, { tx: 140 }]] })], { ox: 80, oy: 50, rot: -14, k: kf(60, u => { const d = 1 + 2 * Math.min(1, Math.max(0, (u - .1) / .65)); return { rot: Math.max(-14, Math.min(14, (2 * d - 6) * 3.5)) }; }) }),
      M('num', { x: 40, y: 74, v: 6, pre: 'left: 3 × 2 = ', suf: ' kg·m', fs: 3.4 }), M('num', { x: 120, y: 74, v: 2, k: kf(60, u => ({ v: 2 * (1 + 2 * Math.min(1, Math.max(0, (u - .1) / .65))) })), dp: 1, pre: 'right: 2 × d = ', suf: ' kg·m', fs: 3.4 })],
      [[0, 'A heavy adult sits 2 m from the middle; a light child starts close in.'], [.3, 'The adult’s side wins: their moment, mass × distance, is larger.'], [.7, 'As the child moves out the moments even up; at 3 m, 2 × 3 = 3 × 2 and the beam balances.']], { dur: 12 }),
    misconception: (() => { const beam = rot => g([rc(10, 40, 80, 2.4, { f: 'brass', c: 'ink', sw: .3 }), rc(26, 33, 7, 7, { f: 'ink', c: 'none' }), tx(30, 30, '3 kg, 2 m', { fs: 3 }), rc(77, 35, 5, 5, { f: 'lapis', c: 'none' }), tx(80, 32, '2 kg, 3 m', { fs: 3 })], { ox: 50, oy: 42, rot: 0, k: rot });
      return pair([pa('M50 42l-4 8h8z', { f: 'soft', c: 'none' }), beam([[.2, { rot: 0 }], [.55, { rot: -16 }]]), stamp(50, 62, 'heavier side wins?', .6)], [pa('M50 42l-4 8h8z', { f: 'soft', c: 'none' }), beam([[0, { rot: 0 }]]), tx(50, 62, '3 × 2 = 6 = 2 × 3 kg·m: level', { fs: 3.4, c: 'verd', on: [.4, 1] })],
        [[0, '3 kg at 2 m on one side, 2 kg at 3 m on the other.'], [.25, 'If only the masses counted, the heavy side would tip down.'], [.5, 'The moments are equal, 6 kg·m each, so the beam stays level.']]); })(),
  },
  S2: {
    intuition: one([...dpItems(DPA, 80, 30, 18, 'lapis'), ...dpItems(DPB, 80, 30, 18, 'rubric', { o: .8 }), ci(80, 30, .9, { f: 'ink', c: 'none' }),
      M('num', { x: 80, y: 86, v: .001, k: kf(200, u => { const i = Math.round(u * 200); const d = Math.abs(DPA[i][1] - DPB[i][1]); return { v: d }; }), dp: 3, pre: 'difference in the lower angle: ', suf: ' rad', fs: 3.4 })],
      [[0, 'Two double pendulums started 0.001 rad apart: no eye could tell them apart.'], [.3, 'The equations are exact, and for a while they move as one…'], [.55, '…but the gap grows exponentially, and after a few seconds they have nothing in common.']], { dur: 14 }),
    misconception: pair([...dpItems(DPA, 50, 26, 15, 'lapis'), ...dpItems(DPA, 50, 26, 15, 'rubric', { o: .5 }), stamp(50, 66, 'needs a perfect start', .75)], [...dpItems(DPA, 50, 26, 15, 'lapis'), ...dpItems(DPB, 50, 26, 15, 'rubric', { o: .8 }), tx(50, 68, 'start differs by 0.001 rad', { fs: 3.2, c: 'verd' })],
      [[0, 'Left: what exact equations seem to promise. Right: two starts 0.001 rad apart.'], [.4, 'Exactness is not enough: any error in the start grows like e^(λt).'], [.7, 'After a few seconds the forecast is no better than a guess.']], { dur: 14 }),
  },
  S3: {
    intuition: one([...Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return ln(80 + Math.cos(a) * 5, 45 + Math.sin(a) * 5, 80 + Math.cos(a) * 90, 45 + Math.sin(a) * 90, { c: 'mute', sw: .4 }); }), ci(80, 45, 4, { f: 'rubric', c: 'ink', sw: .3 }), tx(80, 46.4, '+', { fs: 4.4, c: '#fff', b: true, halo: false }),
      ...Array.from({ length: 8 }, (_, i) => { const a = (i * 1.5 + .25) * Math.PI / 6, r = `(216+30000*((t+${i * .7})%4))^(1/3)`; return M('mover', { x: `80+${Math.cos(a).toFixed(3)}*${r}`, y: `45+${Math.sin(a).toFixed(3)}*${r}`, r: 1.2, f: 'brass' }); }),
      tx(104, 30, 'crowded lines: strong push', { fs: 3.2, a: 'start' }), tx(130, 84, 'spread out: weak', { fs: 3.2 })],
      [[0, 'Field lines drawn out from a positive charge.'], [.3, 'Let go of small positive test charges: they shoot away fast where the lines crowd…'], [.6, '…and drift where the lines spread out. The density of lines maps the strength of the push.']], { dur: 12 }),
    misconception: (() => { const q1 = [30, 40], q2 = [70, 40], E = (x, y) => { let ex = 0, ey = 0; [[q1, 1], [q2, -1]].forEach(([q, s]) => { const dx = x - q[0], dy = y - q[1], r = Math.hypot(dx, dy) + 1e-9; ex += s * dx / r ** 3; ey += s * dy / r ** 3; }); return [ex, ey]; };
      const line = []; { let x = q1[0] + 4 * Math.cos(-1), y = q1[1] + 4 * Math.sin(-1); for (let i = 0; i < 2000; i++) { line.push(x, y); const [ex, ey] = E(x, y), n = Math.hypot(ex, ey); x += ex / n * .3; y += ey / n * .3; if (Math.hypot(x - q2[0], y - q2[1]) < 3.5 || y < 2) break; } }
      const tr = []; { let x = line[0], y = line[1], vx = 0, vy = 0; for (let i = 0; i < 6000 && x > 0 && x < 100 && y > 0 && y < 72; i++) { const [ex, ey] = E(x, y); vx += ex * 9; vy += ey * 9; x += vx * .01; y += vy * .01; if (i % 15 === 0) tr.push([x, y]); if (Math.hypot(x - q2[0], y - q2[1]) < 3) break; } }
      const base = [po(line, { c: 'lapis', sw: .5, dash: '1.4 1' }), ci(...q1, 3, { f: 'rubric', c: 'none' }), tx(q1[0], q1[1] + 1.3, '+', { fs: 4, c: '#fff', halo: false }), ci(...q2, 3, { f: 'lapis', c: 'none' }), tx(q2[0], q2[1] + 1.3, '−', { fs: 4, c: '#fff', halo: false })];
      return pair([...base, M('along', { pts: line, n: 1, u0: .1, u1: .8, r: 1.5, c: 'brass' }), tx(50, 66, 'slides along its line?', { fs: 3.3, c: 'rubric' })],
        [...base, po(tr.flat(), { c: 'brass', sw: .5, draw: 0, k: [[.1, { draw: 0 }], [.8, { draw: 1 }]], lin: true }), ci(...tr[0], 1.5, { f: 'brass', c: 'none', k: tr.map((p, i) => [.1 + .7 * i / (tr.length - 1), { x: p[0], y: p[1] }]), lin: true }), tx(50, 66, 'momentum carries it off the line', { fs: 3.2, c: 'verd' })],
        [[0, 'A charge released at rest on a field line of a + and − pair.'], [.3, 'If field lines were tracks, it would slide along the dashed line.'], [.55, 'The line only gives the force direction now; once moving, the charge’s momentum carries it off the line.']]); })(),
  },
  S4: {
    intuition: one([rc(12, 40, 16, 14, { f: 'mute', c: 'ink', sw: .3 }), tx(20, 60, 'pump: fixed push', { fs: 3.1 }), ln(28, 47, 44, 47, { c: 'soft', sw: 1.2 }),
      ci(56, 47, 6, { f: '#e9c4b9', c: 'rubric', sw: .5, k: kf(80, u => ({ r: 6 + 12 * (1 - Math.exp(-u * 12 / 3)) })) }), ar(30, 44, 42, 44, { c: 'lapis', sw: 1.6, k: kf(80, u => ({ sw: .2 + 1.6 * Math.exp(-u * 12 / 3) })) }), tx(36, 40, 'air in', { fs: 3, c: 'lapis' }),
      M('curve', { box: [92, 16, 60, 50], xr: [0, 12], yr: [0, 1.1], f: '1-exp(-x/3)', c: 'rubric', draw: 0, k: [[0, { draw: 0 }], [1, { draw: 1 }]], lin: true, xl: 't (s)', yl: 'charge' }), ...[1, 2, 3].map(n => tx(92 + n * 3 / 12 * 60, 16 + 50 - (1 - Math.exp(-n)) * 50 / 1.1 - 2, ['63 %', '86 %', '95 %'][n - 1], { fs: 2.8, c: 'soft', on: [n * 3 / 12, 1] }))],
      [[0, 'A balloon filled by a pump that pushes with a fixed pressure.'], [.25, 'At first the air rushes in; the fuller the balloon, the harder it pushes back.'], [.55, 'So the flow slows and the filling creeps: 63 % after one time constant, 86 % after two, never quite full. A capacitor charges the same way.']], { dur: 12 }),
    misconception: pair([M('curve', { box: [12, 12, 78, 30], xr: [0, 12], yr: [0, 1.1], f: 'min(x/5,1)', c: 'rubric', draw: 0, k: [[0, { draw: 0 }], [1, { draw: 1 }]], lin: true, yl: 'charge (share of full)', xl: 't (s)' }), M('num', { x: 50, y: 56, v: 1.8, k: [[.415, { v: 1.8 }], [.42, { v: 0 }]], dp: 2, pre: 'current: ', suf: ' A', fs: 3.6 }), stamp(50, 66, 'steady, then a sudden stop?', .5)],
      [M('curve', { box: [12, 12, 78, 30], xr: [0, 12], yr: [0, 1.1], f: '1-exp(-x/3)', c: 'verd', draw: 0, k: [[0, { draw: 0 }], [1, { draw: 1 }]], lin: true, yl: 'charge (share of full)', xl: 't (s)' }), M('num', { x: 50, y: 56, v: 1.8, k: kf(80, u => ({ v: 1.8 * Math.exp(-u * 12 / 3) })), dp: 2, pre: 'current: ', suf: ' A', fs: 3.6 }), tx(50, 66, 'I = 1.8 A × e^(−t/3 s)', { fs: 3.2, c: 'verd' })],
      [[0, 'Charging through a 3 s time constant.'], [.3, 'Not a steady 1.8 A until full…'], [.5, '…the current is largest at the start and fades: 0.66 A after 3 s, 0.09 A after 9 s. The last per cent takes longest.']], { dur: 12 }),
  },
  S5: {
    intuition: one(lens.items, [[0, 'An object far from a converging lens (f = 2.5): its image forms just beyond F.'], [.3, 'Push the object in towards F…'], [.6, '…and the image runs out, growing as it goes; take the object far away and the image settles at F.']], { dur: 12 }),
    misconception: (() => { const ax = [ln(0, 45, 100, 45, { c: 'mute', sw: .4 }), pa('M60 25L60 65', { c: 'lapis', sw: .8 }), ci(47.5, 45, .7, { f: 'ink', c: 'none' }), ci(72.5, 45, .7, { f: 'ink', c: 'none' }), ar(50, 45, 50, 39, { c: 'verd', sw: .9 })];
      return pair([...ax, rc(88, 25, 2, 30, { f: 'soft', c: 'none' }), tx(89, 21, 'screen', { fs: 3 }), ar(89, 45, 89, 55, { c: 'rubric', sw: .9, dash: '1 1', on: [.4, 1] }), stamp(70, 64, 'no image forms there', .7)],
        [...ax, ln(50, 39, 60, 39, { c: 'brass', sw: .45 }), ln(60, 39, 100, 58.2, { c: 'brass', sw: .45, draw: 0, k: [[.1, { draw: 0 }], [.35, { draw: 1 }]] }), ln(50, 39, 100, 69, { c: 'brass', sw: .45, draw: 0, k: [[.1, { draw: 0 }], [.35, { draw: 1 }]] }),
          ln(60, 39, 10, 15, { c: 'brass', sw: .4, dash: '1 1', draw: 0, k: [[.4, { draw: 0 }], [.65, { draw: 1 }]] }), ln(50, 39, 10, 15, { c: 'brass', sw: .4, dash: '1 1', draw: 0, k: [[.4, { draw: 0 }], [.65, { draw: 1 }]] }), ar(10, 45, 10, 15, { c: 'rubric', sw: .9, dash: '1.2 .8', on: [.65, 1] }), tx(18, 12, 'virtual image, ×5', { fs: 3, c: 'rubric', a: 'start', on: [.65, 1] }), tx(94, 40, 'eye', { fs: 3 })],
        [[0, 'An object inside the focal length: 2 units from a lens with f = 2.5.'], [.3, 'The rays leave the lens spreading apart: no screen anywhere catches an image.'], [.6, 'Traced back, they seem to come from an upright image 5 times larger, behind the lens: a virtual image the eye sees.']]); })(),
  },
  S6: (() => { const B = bounce(.8, 1, 6, 14, 140, 76, 60);
    return {
      intuition: one([rc(0, 76, 160, 10, { f: 'sand', c: 'none' }), ...B.peaks.slice(0, 5).map((h, i) => g([ln(14, 76 - h * 60, 150, 76 - h * 60, { c: 'mute', sw: .3, dash: '1 1' }), tx(152, 77 - h * 60, Math.round(h * 100) + ' %', { fs: 3, a: 'start', c: 'soft' })], { on: [.12 + i * .12, 1] })), ln(14, 16, 150, 16, { c: 'mute', sw: .3 }), tx(152, 17, '100 %', { fs: 3, a: 'start', c: 'soft' }),
        ci(0, 0, 2.2, { f: 'lapis', c: 'ink', sw: .3, k: kf(240, u => { const [x, y] = B.at(u * B.tot); return { x, y: y - 2.2 }; }), lin: true })],
        [[0, 'A ball with e = 0.8 dropped on a hard floor.'], [.2, 'Each bounce keeps 64 % of the height of the last…'], [.6, '…the same tax every time, so the heights shrink geometrically: 64 %, 41 %, 26 %…']], { dur: 12 }),
      misconception: (() => { const panel = (frac, lab) => [rc(0, 62, 100, 10, { f: 'sand', c: 'none' }), ln(10, 10, 90, 10, { c: 'mute', sw: .3 }), tx(92, 11, '100 %', { fs: 3, a: 'start' }), ln(10, 62 - 52 * frac, 90, 62 - 52 * frac, { c: 'mute', sw: .3, dash: '1 1' }), tx(92, 63 - 52 * frac, lab, { fs: 3, a: 'start' }),
        ci(50, 10, 2.2, { f: 'lapis', c: 'ink', sw: .3, k: kf(120, u => { const T1 = .4, q = u < T1 ? u / T1 : 1 - (u - T1) / (1 - T1), y = u < T1 ? 10 + 52 * q * q : 62 - 52 * frac * (1 - (1 - (u - T1) / (1 - T1) * 2) ** 2); return { y: Math.min(62, u < T1 ? y : (u - T1) / (1 - T1) <= 1 ? y : 62) - 2.2 }; }) })];
        return pair([...panel(.8, '80 %?')], [...panel(.64, '64 %'), tx(50, 70, 'speed keeps 0.8; height keeps 0.8² = 0.64', { fs: 3, c: 'verd' })],
          [[0, 'Drop a ball with e = 0.8.'], [.4, 'Reading e as the share of height kept, it would climb back to 80 %.'], [.6, 'e is the share of SPEED kept; height, like energy, keeps e² = 64 %.']], { dur: 8 }); })(),
    }; })(),
};
// ======================================================================= the derivative
const cl01 = v => Math.max(0, Math.min(1, v));
const sqN = n => '4/PI*(' + Array.from({ length: n }, (_, i) => `sin(${2 * i + 1}*x)/${2 * i + 1}`).join('+') + ')';
const DERIV = {
  S1: (() => { const X = x => 12 + (x + .2) / 2.4 * 96, Y = y => 82 - (y + .3) / 5.1 * 74, h = u => Math.pow(.02, cl01((u - .1) / .7)), sec = u => { const m = 2 + h(u); return { x: X(-.2), y: Y(1 + m * (-1.2)), x2: X(2.2), y2: Y(1 + m * 1.2) }; };
    return {
      intuition: one([M('curve', { box: [12, 8, 96, 74], xr: [-.2, 2.2], yr: [-.3, 4.8], f: 'x^2', c: 'lapis', lab: 'distance = t²', lx: -26, ly: -4, xl: 'time t (s)', yl: 'distance (m)' }), ln(0, 0, 0, 0, { c: 'rubric', sw: .7, k: kf(120, sec) }), ci(X(1), Y(1), 1.4, { f: 'ink', c: 'none' }), ci(0, 0, 1.4, { f: 'rubric', c: 'none', k: kf(120, u => ({ x: X(1 + h(u)), y: Y((1 + h(u)) ** 2) })) }),
        M('num', { x: 134, y: 34, v: 1, k: kf(120, u => ({ v: h(u) })), dp: 2, pre: 'trip h = ', suf: ' s', fs: 3.8 }), M('num', { x: 134, y: 44, v: 3, k: kf(120, u => ({ v: 2 + h(u) })), dp: 2, pre: 'average speed = ', fs: 3.8, c: 'rubric' }), tx(134, 56, '→ the speed at t = 1:', { fs: 3.4, on: [.75, 1] }), tx(134, 63, '2', { fs: 5, b: true, c: 'rubric', on: [.78, 1] })],
        [[0, 'Distance t², and a trip from t = 1 lasting h seconds.'], [.25, 'Average speed over the trip: distance covered ÷ time taken, the slope of the red line, 2 + h.'], [.6, 'Make the trip shorter and shorter: the averages close in on one number, the speed at the instant t = 1.']], { dur: 12 }),
      misconception: (() => { const Xs = x => 8 + (x + .2) / 2.4 * 84, Ys = y => 54 - (y + .3) / 5.1 * 46, line = (hh) => { const m = 2 + hh; return { x: Xs(-.2), y: Ys(1 + m * (-1.2)), x2: Xs(2.2), y2: Ys(1 + m * 1.2) }; }, curve = M('curve', { box: [8, 8, 84, 46], xr: [-.2, 2.2], yr: [-.3, 4.8], f: 'x^2', c: 'lapis', xl: 'x', yl: 'y = x²' });
        return pair([curve, ln(0, 0, 0, 0, { c: 'rubric', sw: .6, k: [...kf(40, u => ({ ...line(1 - cl01(u / .55)), o: 1 })).map(([q, o]) => [q * .55, o]), [.56, { o: 0 }]] }), ci(Xs(1), Ys(1), 1.2, { f: 'ink', c: 'none' }), M('num', { x: 50, y: 62, v: 1, k: [[0, { v: 1 }], [.55, { v: 0 }]], dp: 2, pre: 'h = ', fs: 3.4 }), tx(50, 68, '(1 − 1) / 0 = 0/0', { fs: 3.4, c: 'rubric', on: [.58, 1] }), stamp(50, 30, 'no slope at all', .68)],
          [curve, ln(0, 0, 0, 0, { c: 'rubric', sw: .6, k: kf(60, u => line(Math.pow(.01, cl01(u / .7)))) }), ci(Xs(1), Ys(1), 1.2, { f: 'ink', c: 'none' }), M('num', { x: 50, y: 62, v: 3, k: kf(60, u => ({ v: 2 + Math.pow(.01, cl01(u / .7)) })), dp: 2, pre: 'slope 2 + h = ', fs: 3.4 }), tx(50, 68, 'h → 0, never = 0: the limit is 2', { fs: 3.2, c: 'verd', on: [.7, 1] })],
          [[0, 'The slope of x² at x = 1, from the quotient (f(1 + h) − f(1))/h.'], [.3, 'Set h = 0 and the two points merge: 0/0 is no number at all.'], [.6, 'Instead simplify to 2 + h, then let h approach 0: the slopes close in on 2.']], { dur: 11 }); })(),
    }; })(),
  S2: (() => { const w = u => 2 * Math.pow(.025, cl01((u - .1) / .7));
    return {
      intuition: one([M('curve', { box: [10, 8, 140, 74], xr: [-1, 3], yr: [-1.12, 3.12], f: 'x^2', c: 'lapis', axes: false, k: kf(100, u => ({ xr: [1 - w(u), 1 + w(u)], yr: [1 - 1.06 * w(u), 1 + 1.06 * w(u)] })) }), M('curve', { box: [10, 8, 140, 74], xr: [-1, 3], yr: [-1.12, 3.12], f: '2*x-1', c: 'rubric', dash: '2 1.2', sw: .7, axes: false, k: kf(100, u => ({ xr: [1 - w(u), 1 + w(u)], yr: [1 - 1.06 * w(u), 1 + 1.06 * w(u)] })) }),
        rc(10, 8, 140, 74, { c: 'mute', sw: .4 }), ci(80, 45, 1.2, { f: 'ink', c: 'none' }), M('num', { x: 80, y: 88, v: 2, k: kf(100, u => ({ v: w(u) })), dp: 3, pre: 'window: x = 1 ± ', fs: 3.4 }), tx(146, 14, 'blue: x²   red: tangent 2x − 1', { fs: 3.2, a: 'end' })],
        [[0, 'The curve x² and its tangent at x = 1.'], [.25, 'Zoom in on the point…'], [.55, '…closer and closer: the curve straightens until it lies on its tangent line. Its slope, 2, is the derivative.']], { dur: 12 }),
      misconception: one([M('curve', { box: [8, 10, 68, 60], xr: [-1, 3], yr: [-2.54, 4.54], f: 'x^2', c: 'lapis', axes: false, k: kf(100, u => ({ xr: [1 - w(u), 1 + w(u)], yr: [1 - 1.77 * w(u), 1 + 1.77 * w(u)] })) }), rc(8, 10, 68, 60, { c: 'mute', sw: .4 }), tx(42, 78, 'x² near 1: straightens', { fs: 3.4, c: 'verd' }),
        M('curve', { box: [84, 10, 68, 60], xr: [-2, 2], yr: [-.5, 3.04], f: 'abs(x)', c: 'rubric', axes: false, k: kf(100, u => ({ xr: [-w(u), w(u)], yr: [-.25 * w(u), 1.52 * w(u)] })) }), rc(84, 10, 68, 60, { c: 'mute', sw: .4 }), tx(118, 78, '|x| near 0: stays a corner', { fs: 3.4, c: 'rubric' }), tx(98, 30, 'slope −1', { fs: 3.2 }), tx(138, 30, 'slope +1', { fs: 3.2 })],
        [[0, 'Zoom in on two continuous curves.'], [.35, 'x² straightens into a line: it has a derivative there.'], [.6, '|x| keeps its corner at every magnification: slopes −1 and +1 never agree, so it has no derivative at 0.']], { dur: 12 }),
    }; })(),
  S3: (() => { const H = u => u < .5 ? 12 * cl01((u - .08) / .3) : 12 * Math.pow(.05, cl01((u - .5) / .35)), x0 = 30, y0 = 28, S = 36;
    return {
      intuition: one([rc(x0, y0, S, S, { f: 'lapis', fo: .18, c: 'lapis', sw: .6 }), tx(x0 + S / 2, y0 + S / 2 + 1.5, 'x²', { fs: 4.4, c: 'lapis' }), tx(x0 + S / 2, y0 + S + 6, 'x', { fs: 3.6, it: true }),
        rc(x0 + S, y0, 0, S, { f: 'verd', fo: .35, c: 'verd', sw: .4, k: kf(120, u => ({ w: H(u) })) }), rc(x0, y0, S, 0, { f: 'verd', fo: .35, c: 'verd', sw: .4, k: kf(120, u => ({ y: y0 - H(u), h: H(u) })) }), rc(x0 + S, y0, 0, 0, { f: 'rubric', fo: .5, c: 'rubric', sw: .3, k: kf(120, u => ({ y: y0 - H(u), w: H(u), h: H(u) })) }),
        tx(x0 + S + 9, y0 + S / 2, 'x·h', { fs: 3.6, c: 'verd', a: 'start', on: [.15, 1] }), tx(x0 + S / 2, y0 - 14, 'x·h', { fs: 3.6, c: 'verd', on: [.15, 1] }), tx(x0 + S + 6, y0 - 14, 'h²', { fs: 3.4, c: 'rubric', a: 'start', on: [.15, .55] }),
        M('num', { x: 128, y: 44, v: 6, k: kf(120, u => { const h = H(u) / S * 3; return { v: h > 1e-4 ? 6 + h : 6 }; }), dp: 3, pre: 'added area ÷ h = ', fs: 3.6 }), tx(128, 52, '= 2x + h, here x = 3', { fs: 3.2, c: 'soft' }), tx(128, 62, '→ 2x as h shrinks', { fs: 3.6, c: 'rubric', on: [.75, 1] })],
        [[0, 'A square of side x.'], [.1, 'Widen it by a thin strip h: two strips x·h and a tiny corner h² appear.'], [.55, 'Now shrink h: the corner vanishes far faster than the strips, so the area grows at 2x per unit of side.']], { dur: 12 }),
      misconception: (() => { const box = [12, 8, 80, 50], cu = M('curve', { box, xr: [.8, 3], yr: [-4, 24], f: 'x^3', c: 'lapis', lab: 'x³', xl: 'x', yl: 'y' }), pt = ci(12 + (2 - .8) / 2.2 * 80, 58 - (8 + 4) / 28 * 50, 1.2, { f: 'ink', c: 'none' }), L = (f, c, lab, u0) => M('curve', { box, xr: [.8, 3], yr: [-4, 24], f, c, sw: .6, axes: false, draw: 0, k: [[u0, { draw: 0 }], [u0 + .2, { draw: 1 }]], lab, lx: -24, ly: 6 });
        return pair([cu, pt, L('8+24*(x-2)', 'rubric', 'slope 24?', .1), L('8+4*(x-2)', 'brass', 'slope 4?', .35), stamp(52, 64, 'both cut across the curve', .7)], [cu, pt, L('8+12*(x-2)', 'verd', 'slope 12', .2), tx(52, 66, 'd/dx x³ = 3x² = 12 at x = 2', { fs: 3.3, c: 'verd', on: [.45, 1] })],
          [[0, 'The slope of x³ at x = 2.'], [.2, 'Forgetting a step of the rule gives 3x³ = 24 or x² = 4: neither line touches the curve.'], [.5, 'Lower the power and bring it in front: 3x² = 12, the line that grazes the curve.']]); })(),
    }; })(),
  S4: (() => { const C = (cx, cy, s, n) => [...Array.from({ length: n }, (_, i) => ci(cx, cy, s * (i + 1), { c: 'mute', sw: .4 })), ...Array.from({ length: n }, (_, i) => tx(cx + s * (i + 1) * .7 + 1, cy + s * (i + 1) * .7 + 3, 'f = ' + (i + 1) ** 2, { fs: 2.8, c: 'soft' }))], phi = Math.atan2(2, 1);
    return {
      intuition: one([...C(56, 45, 9, 4), ar(56 + 9 * Math.cos(phi) * 2.236, 45 - 9 * Math.sin(phi) * 2.236, 56 + 9 * Math.cos(phi) * 2.236 + 6, 45 - 9 * Math.sin(phi) * 2.236 - 12, { c: 'rubric', sw: .9, label: '∇f', lx: 3 }),
        M('mover', { x: `56+9*${Math.cos(phi).toFixed(4)}*(2.236+0.16*t)`, y: `45-9*${Math.sin(phi).toFixed(4)}*(2.236+0.16*t)`, r: 1.6, f: 'rubric', trail: 6 }), M('mover', { x: `56+9*2.236*cos(${phi.toFixed(4)}+0.22*t)`, y: `45-9*2.236*sin(${phi.toFixed(4)}+0.22*t)`, r: 1.6, f: 'verd', trail: 6 }),
        M('num', { x: 132, y: 34, v: 5, k: kf(60, u => ({ v: (2.236 + .16 * u * 12) ** 2 })), dp: 1, pre: 'red climbs: f = ', fs: 3.5, c: 'rubric' }), M('num', { x: 132, y: 44, v: 5, dp: 1, pre: 'green: f = ', fs: 3.5, c: 'verd' }), tx(132, 54, 'along a contour', { fs: 3.2, c: 'verd' }), tx(132, 60, 'the height never changes', { fs: 3.2, c: 'verd' })],
        [[0, 'A hill f = x² + y² seen from above: the circles are contour lines.'], [.25, 'At (1, 2) the gradient arrow points straight uphill, across the contours; its length, |∇f| = 4.5, is the steepness.'], [.55, 'Walk along it and you climb fastest (red); walk along a contour and you do not climb at all (green).']], { dur: 12 }),
      misconception: (() => { const cx = 46, cy = 38, s = 7.5, r0 = 2.236, P0 = [cx + s * r0 * Math.cos(phi), cy - s * r0 * Math.sin(phi)];
        return pair([...C(cx, cy, s, 4), ar(...P0, P0[0] + 10 * Math.sin(phi), P0[1] + 10 * Math.cos(phi), { c: 'rubric', sw: .8, label: '∇f?' }), M('mover', { x: `${cx}+${s}*${r0}*cos(${phi.toFixed(4)}-0.22*t)`, y: `${cy}-${s}*${r0}*sin(${phi.toFixed(4)}-0.22*t)`, r: 1.4, f: 'rubric', trail: 5 }), M('num', { x: 50, y: 70, v: 5, dp: 1, pre: 'height f = ', fs: 3.4 }), stamp(50, 8, 'no climb at all', .6)],
          [...C(cx, cy, s, 4), ar(...P0, P0[0] + 5 * Math.cos(phi), P0[1] - 10, { c: 'verd', sw: .8, label: '∇f' }), M('mover', { x: `${cx}+${s}*${Math.cos(phi).toFixed(4)}*(${r0}+0.13*t)`, y: `${cy}-${s}*${Math.sin(phi).toFixed(4)}*(${r0}+0.13*t)`, r: 1.4, f: 'verd', trail: 5 }), M('num', { x: 50, y: 70, v: 5, k: kf(60, u => ({ v: (r0 + .13 * u * 10) ** 2 })), dp: 1, pre: 'height f = ', fs: 3.4 })],
          [[0, 'If the gradient ran along a contour line…'], [.35, '…following it would never gain height: along a contour f is constant, its slope is 0.'], [.6, 'The gradient is perpendicular to the contours, pointing straight uphill.']], { dur: 10 }); })(),
    }; })(),
  S5: (() => { const box = [14, 10, 96, 66], X = x => 14 + x * 96, Y = y => 76 - y / 1.05 * 66, ns = [4, 8, 16, 32], wins = [[.1, .3], [.3, .5], [.5, .7], [.7, 1]];
    return {
      intuition: one([...ns.flatMap((n, j) => Array.from({ length: n }, (_, i) => rc(X(i / n), Y((i / n) ** 2), 96 / n, Y(0) - Y((i / n) ** 2), { f: 'brass', fo: .45, c: 'brass', sw: .25, on: wins[j] }))), M('curve', { box, xr: [0, 1], yr: [0, 1.05], f: 'x^2', c: 'lapis', xl: 'time', yl: 'speed' }),
        ...ns.map((n, j) => tx(136, 40, n + ' readings', { fs: 3.4, on: wins[j] })), ...ns.map((n, j) => { let S = 0; for (let i = 0; i < n; i++) S += (i / n) ** 2 / n; return tx(136, 48, 'distance ≈ ' + S.toFixed(4), { fs: 3.6, mono: true, on: wins[j] }); }), tx(136, 60, 'exact: 1/3 = 0.3333', { fs: 3.4, c: 'verd', on: [.75, 1] })],
        [[0, 'A speedometer reading, held for one interval, times the interval: one strip of distance.'], [.3, 'Add the strips: the distance travelled, roughly.'], [.6, 'More, shorter readings: the sum closes in on the exact total, ∫₀¹ t² dt = 1/3.']], { dur: 12 }),
      misconception: one([M('curve', { box: [12, 10, 120, 66], xr: [0, 6.2832], yr: [-1.2, 1.2], f: 'sin(x)', c: 'lapis', area: true, xl: 'x (rad)', yl: 'sin x', draw: 0, k: [[.05, { draw: 0 }], [.85, { draw: 1 }]], lin: true }), tx(40, 30, '+', { fs: 6, c: 'verd', on: [.3, 1] }), tx(103, 62, '−', { fs: 6, c: 'rubric', on: [.7, 1] }),
        M('num', { x: 146, y: 40, v: 0, k: kf(80, u => ({ v: 1 - Math.cos(2 * Math.PI * cl01((u - .05) / .8)) })), dp: 2, pre: '∫ = ', fs: 4 }), tx(146, 48, 'so far', { fs: 3.2, c: 'soft' })],
        [[0, 'Integrate sin x from 0 to 2π.'], [.3, 'Above the axis the strips count positive: the total climbs to +2.'], [.6, 'Below it they count negative and take it all back: the integral is 0, though the shaded area is 4.']], { dur: 11 }),
    }; })(),
};

// ======================================================================= linear maps, complex numbers and harmonics
const LIN = {
  S1: {
    intuition: one([M('lin', { x: 80, y: 47, s: 9, n: 6, M: [1, 0, 0, 1], k: [[.15, { M: [1, 0, 0, 1] }], [.35, { M: [1, .8, 0, 1] }], [.6, { M: [1.2, -.5, .45, 1.1] }], [.85, { M: [.8, .35, -.4, 1.3] }], [1, { M: [1, 0, 0, 1] }]] }), tx(80, 6, 'lines stay straight, parallel and evenly spaced', { fs: 3.4, c: 'ink' })],
      [[0, 'A grid drawn on a rubber sheet.'], [.2, 'Stretch it, shear it, turn it: every grid line stays straight…'], [.6, '…parallel lines stay parallel and evenly spaced, and the origin stays put. That is a linear map; where î and ĵ go decides everything.']], { dur: 13 }),
    misconception: (() => { const X = v => 8 + v * 8;
      return pair([M('curve', { box: [10, 8, 80, 50], xr: [-1, 4], yr: [-1, 12], f: '2*x+3', c: 'rubric', draw: 0, k: [[.05, { draw: 0 }], [.4, { draw: 1 }]], xl: 'x', yl: 'f(x)' }), stamp(52, 36, 'straight graph, so linear?', .45)],
        [ln(X(-.5), 18, X(11), 18, { c: 'soft', sw: .4 }), ln(X(-.5), 50, X(11), 50, { c: 'soft', sw: .4 }), tx(4, 19, 'x', { fs: 3.4, it: true }), tx(4, 51, 'f', { fs: 3.4, it: true }), ...[0, 1, 2].map(v => tx(X(v), 14, v, { fs: 3 })), ...[0, 3, 5, 7, 10].map(v => tx(X(v), 56, v, { fs: 3 })),
          ...[[0, 3, .05], [1, 5, .2], [2, 7, .35]].map(([a, b, u0]) => ar(X(a), 19, X(b), 49, { c: 'lapis', sw: .6, draw: 0, k: [[u0, { draw: 0 }], [u0 + .12, { draw: 1 }]] })), tx(50, 62, '0 ↦ 3: the origin moved', { fs: 3.2, c: 'rubric', on: [.2, 1] }),
          tx(50, 68, 'f(1) + f(1) = 10, but f(2) = 7', { fs: 3.2, c: 'verd', on: [.6, 1] })],
        [[0, 'f(x) = 2x + 3 has a straight graph…'], [.3, '…but follow the points: 0 goes to 3, so the origin moves.'], [.6, 'And f(1) + f(1) = 10 while f(2) = 7: it is linear plus a shift (affine), not linear.']]); })(),
  },
  S2: {
    intuition: one([M('lin', { x: 70, y: 60, s: 10, n: 6, M: [1, 0, 0, 1], area: true, k: [[.15, { M: [1, 0, 0, 1] }], [.6, { M: [1.5, .5, 0, 2] }]] }), tx(132, 30, 'det A = 1.5·2 − 0.5·0 = 3', { fs: 3.1 }), tx(140, 38, 'every area × 3', { fs: 3.6, c: 'brass', b: true, on: [.6, 1] })],
      [[0, 'The unit square, area 1.'], [.25, 'Apply the map: the square becomes a parallelogram…'], [.6, '…of area det A = 3. Every shape in the plane is scaled by the same factor: the determinant is the map’s exchange rate for areas.']], { dur: 11 }),
    misconception: pair([M('lin', { x: 50, y: 40, s: 7, n: 5, M: [1, 0, 0, 1], labels: false, k: [[.15, { M: [1, 0, 0, 1] }], [.6, { M: [0, 0, 0, 0] }]] }), stamp(50, 64, 'all to (0, 0)?', .62)],
      [M('lin', { x: 50, y: 40, s: 7, n: 5, M: [1, 0, 0, 1], labels: false, area: true, k: [[.15, { M: [1, 0, 0, 1] }], [.6, { M: [1, 2, 2, 4] }]] }), tx(50, 68, 'flattened onto y = 2x; most images ≠ 0', { fs: 3.1, c: 'verd', on: [.6, 1] })],
      [[0, 'A map with det A = 0.'], [.3, 'It does not send everything to the origin…'], [.55, '…it flattens the plane onto the line y = 2x: areas become 0, so it cannot be undone, but most vectors keep non-zero images.']]),
  },
  S3: (() => { const O = [70, 47], S = 22, tip = u => { const a = u < .1 ? 0 : u < .55 ? (() => { const q = cl01((u - .1) / .45) * 3, k = Math.floor(Math.min(q, 2.999)); return 90 * (k + (q >= 3 ? 1 : (q - k) ** 2 * (3 - 2 * (q - k)))); })() : 270 + 30 * cl01((u - .6) / .35) * 4, r = u < .6 ? 1 : Math.pow(1.2, cl01((u - .6) / .35) * 4); return { x2: O[0] + S * r * Math.cos(a * D2R), y2: O[1] - S * r * Math.sin(a * D2R) }; };
    return {
      intuition: one([ln(10, O[1], 150, O[1], { c: 'soft', sw: .35 }), ln(O[0], 2, O[0], 88, { c: 'soft', sw: .35 }), ci(...O, S, { c: 'mute', sw: .35, dash: '1 1' }), ...[[1, 0, '1'], [0, 1, 'i'], [-1, 0, '−1'], [0, -1, '−i']].map(([a, b, l]) => tx(O[0] + S * a * 1.18, O[1] - S * b * 1.18 + 1.2, l, { fs: 3.4, c: 'lapis' })),
        ar(...O, O[0] + S, O[1], { c: 'rubric', sw: .9, k: kf(160, tip) }), tx(130, 16, '× i: a quarter turn', { fs: 3.4, on: [.1, .58] }), tx(130, 16, '× 1.2∠30°: turn 30°, stretch 1.2', { fs: 3.3, on: [.6, 1] })],
        [[0, 'The number 1 as an arrow.'], [.1, 'Multiply by i, again and again: each time a quarter turn, i, −1, −i.'], [.6, 'Multiply by 1.2∠30° instead: turn by its angle and stretch by its length, a spiral outward.']], { dur: 12 }),
      misconception: pair([ln(5, 40, 95, 40, { c: 'soft', sw: .35 }), ar(50, 40, 75, 40, { c: 'lapis', sw: .9, label: 'z = 1' }), ar(50, 40, 25, 40, { c: 'brass', sw: .9, label: 'w = −1' }), ln(25, 54, 75, 54, { c: 'rubric', sw: .7, draw: 0, k: [[.2, { draw: 0 }], [.5, { draw: 1 }]] }), tx(50, 60, '|z| + |w| = 2', { fs: 3.4, c: 'rubric', on: [.45, 1] }), stamp(50, 22, '|z + w| = 2?', .6)],
        [ln(5, 40, 95, 40, { c: 'soft', sw: .35 }), ar(50, 40, 75, 40, { c: 'lapis', sw: .9, label: 'z = 1' }), ar(50, 40, 25, 40, { c: 'brass', sw: .9, label: 'w', k: [[.15, { x: 50, x2: 25, y: 40, y2: 40 }], [.5, { x: 75, x2: 50, y: 36, y2: 36 }]] }), ci(50, 40, 1.6, { f: 'verd', c: 'none', on: [.55, 1] }), tx(50, 54, 'tip to tail: back to the start', { fs: 3.2, c: 'verd', on: [.5, 1] }), tx(50, 60, '|z + w| = 0', { fs: 3.6, c: 'verd', b: true, on: [.58, 1] })],
        [[0, 'Add z = 1 and w = −1.'], [.3, 'If lengths added, the sum would have length 2.'], [.5, 'Place w at the tip of z: it walks straight back. |z + w| = 0; only |z + w| ≤ |z| + |w| holds.']]),
    }; })(),
  S4: (() => { const ks = [1, 3, 5, 7], r = k => (12 * 4 / (Math.PI * k)), cx = 34, cy = 45; const cxE = j => cx + ks.slice(0, j).map(k => `${r(k).toFixed(3)}*cos(${k}*t)`).map(s => '+' + s).join(''), cyE = j => cy + ks.slice(0, j).map(k => `-${r(k).toFixed(3)}*sin(${k}*t)`).join('');
    const items = [ci(cx, cy, r(1), { c: 'mute', sw: .35 }), ...ks.map((k, j) => M('mover', { x: cxE(j + 1), y: cyE(j + 1), link: [cxE(j), cyE(j)], ring: j < 3 ? r(ks[j + 1]) : 0, r: j === 3 ? 1.2 : .6, f: j === 3 ? 'rubric' : 'soft', lc: 'lapis', trail: j === 3 ? 1.2 : 0 })),
      M('curve', { box: [72, 15, 84, 60], xr: [0, 84], yr: [-2.5, 2.5], f: ks.map(k => `${(4 / (Math.PI * k)).toFixed(4)}*sin(${k}*(t-x/12))`).join('+'), c: 'rubric', sw: .7, axes: false }), M('mover', { x: '72', y: cyE(4), link: [cxE(4), cyE(4)], lc: 'mute', r: .6, f: 'rubric' }), tx(114, 84, 'four circles: k = 1, 3, 5, 7', { fs: 3.3 })];
    return {
      intuition: one(items, [[0, 'Stack circles: radius 4/(πk), turning k times as fast, for k = 1, 3, 5, 7.'], [.35, 'The tip of the last one traces a height that rises and falls…'], [.6, '…and, drawn out over time, it is already close to a square wave. More circles, a sharper square.']], { dur: 14 }),
      misconception: one([...[[1, .05, .3], [3, .3, .5], [9, .5, .7], [25, .7, 1]].map(([n, a, b]) => M('curve', { box: [12, 12, 120, 66], xr: [-.4, 1.4], yr: [-.3, 1.35], f: sqN(n), c: 'lapis', sw: .8, on: [a, b], xl: 'x (rad)', yl: 'partial sum' })), ln(12, 76 - (1 + .3) / 1.65 * 66, 132, 76 - (1 + .3) / 1.65 * 66, { c: 'mute', sw: .35 }),
        ln(12, 76 - (1.18 + .3) / 1.65 * 66, 132, 76 - (1.18 + .3) / 1.65 * 66, { c: 'rubric', sw: .5, dash: '1.5 1' }), tx(132, 76 - (1.18 + .3) / 1.65 * 66 - 2, 'overshoot ≈ 1.18, every time', { fs: 3.2, c: 'rubric', a: 'end' }),
        ...[[1, .05, .3], [3, .3, .5], [9, .5, .7], [49, .7, 1]].map(([n, a, b]) => tx(146, 46, 'up to k = ' + (2 * n - 1 === 1 ? 1 : n === 49 ? 49 : 2 * n - 1), { fs: 3.4, on: [a, b] }))],
        [[0, 'The square wave near its jump, built from more and more terms.'], [.35, 'Each sum hugs the square more closely…'], [.65, '…but the overshoot by the jump stays at about 1.18, 9 % of the jump; it only gets narrower (Gibbs).']], { dur: 12 }),
    }; })(),
  S5: (() => { const conv = n => { let d = [1]; for (let i = 0; i < n; i++) { const o = new Array(d.length + 5).fill(0); d.forEach((v, j) => { for (let f = 0; f < 6; f++) o[j + f] += v; }); d = o; } const m = Math.max(...d); return d.map(v => v / m); };
    const inc = [3, 9, 12, 10, 8, 6, 4.5, 3.4, 2.5, 1.8, 1.3, 1], incM = inc.map(v => v / 12), mean = [0, 0, .02, .1, .35, .8, 1, .7, .3, .08, .02, 0], bell = [.02, .08, .2, .4, .7, .95, 1, .8, .5, .25, .1, .03];
    return {
      intuition: one([M('bars', { box: [20, 14, 120, 60], v: conv(1), max: 1.05, c: 'lapis', on: [0, .3], labels: [1, 2, 3, 4, 5, 6], xl: 'total shown', yl: 'how often (relative)' }), M('bars', { box: [20, 14, 120, 60], v: conv(2), max: 1.05, c: 'lapis', on: [.3, .6], labels: [2, '', '', '', '', 7, '', '', '', '', 12], xl: 'total shown', yl: 'how often (relative)' }), M('bars', { box: [20, 14, 120, 60], v: conv(5), max: 1.05, c: 'lapis', on: [.6, 1], labels: Array.from({ length: 26 }, (_, i) => (i + 5) % 5 ? '' : i + 5), xl: 'total shown', yl: 'how often (relative)' }),
        M('curve', { box: [20, 14, 120, 60], xr: [-.5, 25.5], yr: [0, 1.05], f: 'exp(-((x-12.5)^2)/(2*14.58))', c: 'rubric', sw: .7, axes: false, on: [.75, 1] }), tx(80, 8, '1 die', { fs: 3.6, on: [0, .3] }), tx(80, 8, 'sum of 2 dice', { fs: 3.6, on: [.3, .6] }), tx(80, 8, 'sum of 5 dice: already a bell', { fs: 3.6, on: [.6, 1] })],
        [[0, 'One die: every face equally likely, a flat shape.'], [.3, 'Add two: 36 pairs, and more of them land in the middle.'], [.6, 'Add five: the quirks of one die are smoothed away and a bell remains.']], { dur: 12 }),
      misconception: pair([M('bars', { box: [8, 12, 84, 44], v: incM, max: 1.05, c: 'brass', yl: 'people (relative)', xl: 'income →', k: [[.15, { v: incM }], [.7, { v: bell }]] }), tx(50, 62, 'incomes in the sample', { fs: 3.2 }), stamp(50, 30, '1000 incomes, a bell?', .72)],
        [M('bars', { box: [8, 8, 84, 24], v: incM.map(v => v * .1), max: 1.05, c: 'brass', yl: 'people', k: [[.1, { v: incM.map(v => v * .1) }], [.6, { v: incM }]] }), tx(50, 37, 'incomes: as skewed as ever', { fs: 3.1 }), M('bars', { box: [8, 40, 84, 22], v: mean.map(v => v * .05), max: 1.05, c: 'verd', yl: 'samples', k: [[.35, { v: mean.map(v => v * .05) }], [.9, { v: mean }]] }), tx(50, 68, 'means of many samples: normal', { fs: 3.1, c: 'verd' })],
        [[0, 'Collect more and more incomes.'], [.3, 'They do not turn into a bell: the data stay as skewed as the population.'], [.6, 'What becomes normal is the mean of a sample, taken again and again.']]),
    }; })(),
};
// ======================================================================= collision theory and equilibrium
const erfc = x => { const t = 1 / (1 + .3275911 * x); return t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); };
const above = (Ea, T) => { const a = Ea / T; return erfc(Math.sqrt(a)) + 2 * Math.sqrt(a / Math.PI) * Math.exp(-a); };
const stepConv = (u, a, b) => [[0, { conv: a }], [u - .01, { conv: a }], [u, { conv: b }]];
const COLL = {
  S1: {
    intuition: one([M('gas', { box: [10, 14, 140, 62], sp: [{ n: 40, r: 1, v: 12, c: 'lapis', side: 'L' }], wall: { x: 112, vmin: 15.5, mark: 'verd', c: 'rubric' }, collide: true, hits: 'wall', cross: [80, 84], seed: 21 }),
      tx(112, 10, 'the fence: energy E_a', { fs: 3.4, c: 'rubric' }), tx(132, 40, 'over:', { fs: 3.2, c: 'verd' }), tx(132, 46, 'only the fastest', { fs: 3.2, c: 'verd' })],
      [[0, 'Molecules mill about, bumping into each other and trading speed.'], [.3, 'Most strike the fence and bounce back: they lack the energy E_a.'], [.55, 'Now and then one with a running start gets over (turned green). Only that rare fast fraction reacts.']], { dur: 13 }),
    misconception: (() => { const sp = [{ n: 12, r: 1.3, v: 14, c: 'lapis', id: 'A' }, { n: 12, r: 1.3, v: 14, c: 'brass', id: 'B' }];
      return pair([M('gas', { box: [6, 10, 88, 50], sp, react: { a: 'A', b: 'B', to: 'C', c: 'verd', p: 1 }, collide: true, hits: 'all', count: [['C', 50, 67, 'reacted:']], seed: 3 }), stamp(50, 36, 'every bump reacts?', .7)],
        [M('gas', { box: [6, 10, 88, 50], sp, react: { a: 'A', b: 'B', to: 'C', c: 'verd', p: .04 }, collide: true, hits: 'all', count: [['C', 50, 67, 'reacted:']], seed: 3 }), tx(50, 72, 'here 1 bump in 25 reacts, to be visible; at 298 K: 2 in 10⁹', { fs: 2.7, c: 'soft' })],
        [[0, 'A and B molecules colliding (each flash is a collision).'], [.3, 'If every A–B collision made C, the box would soon be all green.'], [.55, 'Really almost every collision just bounces: only those with energy above E_a, and well oriented, react.']], { dur: 12 }); })(),
  },
  S2: {
    intuition: one([M('curve', { box: [12, 10, 104, 66], xr: [0, 8], yr: [0, .5], f: '2*sqrt(x/PI)/p^1.5*exp(-x/p)', p: 1, k: [[.15, { p: 1 }], [.7, { p: 1.3 }]], c: 'lapis', area: true, afrom: 4, xl: 'collision energy', yl: 'share' }), ln(12 + 4 / 8 * 104, 10, 12 + 4 / 8 * 104, 76, { c: 'rubric', sw: .6, dash: '1.5 1' }), tx(12 + 4 / 8 * 104, 8, 'E_a', { fs: 3.4, c: 'rubric' }),
      M('num', { x: 140, y: 34, v: 1, k: kf(60, u => ({ v: 1 + .3 * cl01((u - .15) / .55) })), dp: 2, pre: 'temperature × ', fs: 3.3 }), M('num', { x: 140, y: 44, v: 4.6, k: kf(60, u => ({ v: 100 * above(4, 1 + .3 * cl01((u - .15) / .55)) })), dp: 1, pre: 'above E_a: ', suf: ' %', fs: 3.6, c: 'verd' }), tx(140, 56, 'the average shifts a little;', { fs: 3.1, c: 'soft' }), tx(140, 61, 'the tail more than doubles', { fs: 3.1, c: 'soft' })],
      [[0, 'How collision energies are spread at one temperature; only the shaded tail clears the barrier.'], [.3, 'Heat it: the hump moves only a little to the right…'], [.6, '…but the rare energetic tail grows several-fold, and the rate with it.']], { dur: 12 }),
    misconception: one([M('bars', { box: [30, 12, 100, 58], v: [1, 1, 1], max: 4, labels: ['20', '50', '100'], xl: 'activation energy E_a (kJ/mol)', yl: 'rate factor (ratio)', c: ['brass', 'verd', 'rubric'], vl: true, dp: 2, k: [[.15, { v: [1, 1, 1] }], [.7, { v: [1.30, 1.93, 3.71] }]] }), ln(26, 12 + 58 - 2 / 4 * 58, 134, 12 + 58 - 2 / 4 * 58, { c: 'ink', sw: .5, dash: '2 1' }), tx(136, 12 + 58 - 2 / 4 * 58 + 1, '“×2 per 10 K”', { fs: 3.2, a: 'start' }), tx(80, 86, 'rate factor, 298 K → 308 K', { fs: 3.4 })],
      [[0, 'Heat three reactions by 10 K, from 298 K to 308 K.'], [.4, 'Their rates grow by ×1.3, ×1.9 and ×3.7.'], [.65, 'The doubling rule fits only a barrier near 50 kJ/mol around room temperature.']], { dur: 11 }),
  },
  S3: {
    intuition: one([M('gas', { box: [10, 12, 140, 62], sp: [{ n: 36, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: { a: 'A', b: 'C', kf: .4, kr: .1 }, count: [['A', 50, 82, 'A:'], ['C', 110, 82, 'C:']], seed: 13 }), tx(80, 9, 'each flash: one molecule changing sides', { fs: 3.2, c: 'soft' })],
      [[0, 'A turns into C (k_f = 4 units) and C back into A (k_r = 1 unit), here slowed down.'], [.3, 'At first mostly A turns into C.'], [.6, 'Then the counts stop changing, about 4 C for each A, yet the flashes go on: as many cross each way per second.']], { dur: 14 }),
    misconception: (() => { const g0 = { a: 'A', b: 'C', kf: .4, kr: .1 }, stop = { a: 'A', b: 'C', kf: 0, kr: 0 };
      return pair([M('gas', { box: [6, 10, 88, 50], sp: [{ n: 24, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: g0, k: stepConv(.5, g0, stop), count: [['A', 30, 67, 'A:'], ['C', 70, 67, 'C:']], seed: 13 }), stamp(50, 34, 'reactions stopped?', .7)],
        [M('gas', { box: [6, 10, 88, 50], sp: [{ n: 24, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: g0, count: [['A', 30, 67, 'A:'], ['C', 70, 67, 'C:']], seed: 13 }), tx(50, 7, 'forward = reverse: both still running', { fs: 3, c: 'verd' })],
        [[0, 'A reaction reaching equilibrium.'], [.4, 'If molecules stopped reacting there, the changes (flashes) would cease.'], [.6, 'Really both directions keep going at equal rates; only the net change is zero (labelled C shows up in A).']], { dur: 13 }); })(),
  },
  S4: {
    intuition: (() => { const c1 = { a: 'A', b: 'C', kf: .4, kr: .1 }, c2 = { a: 'A', b: 'C', kf: .64, kr: .32 };
      return one([M('gas', { box: [10, 12, 110, 62], sp: [{ n: 30, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: c1, k: stepConv(.45, c1, c2), vk: [[.43, 1], [.5, 1.3]], count: [['A', 40, 82, 'A + B:'], ['C', 95, 82, 'C:']], seed: 13 }), thermo(140, 16, 50, [[.43, 15], [.5, 38]]), tx(140, 82, 'heat added', { fs: 3.2, on: [.45, 1] }), tx(66, 8, 'A + B ⇌ C + heat', { fs: 3.6 })],
        [[0, 'An exothermic reaction at equilibrium: heat is one of its products.'], [.4, 'Add heat, as if adding product: both directions speed up, the reverse one more (×3.2 against ×1.6).'], [.65, 'The balance leans back: fewer C, more A and B.']], { dur: 14 }); })(),
    misconception: (() => { const c1 = { a: 'A', b: 'C', kf: .4, kr: .1 };
      return pair([M('gas', { box: [6, 10, 88, 50], sp: [{ n: 24, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: c1, k: stepConv(.4, c1, { a: 'A', b: 'C', kf: .64, kr: .1 }), count: [['A', 30, 67, 'A:'], ['C', 70, 67, 'C:']], seed: 13 }), stamp(50, 34, 'faster, so more C?', .72)],
        [M('gas', { box: [6, 10, 88, 50], sp: [{ n: 24, r: 1.2, v: 9, c: 'lapis', id: 'A' }], conv: c1, k: stepConv(.4, c1, { a: 'A', b: 'C', kf: .64, kr: .32 }), count: [['A', 30, 67, 'A:'], ['C', 70, 67, 'C:']], seed: 13 }), tx(50, 7, 'reverse ×3.2, forward ×1.6: K halves', { fs: 3, c: 'verd' })],
        [[0, 'Heat the equilibrium mixture at the halfway mark.'], [.45, 'If heating only sped up the forward reaction, C would pile up.'], [.65, 'It speeds both; the reverse, with the larger barrier, gains more, so less C remains.']], { dur: 13 }); })(),
  },
};

// ======================================================================= the water cycle
const land = (o = {}) => po([56, 90, 84, 50, 108, 24, 132, 52, 160, 64, 160, 90], { closed: true, f: '#cdbf98', c: 'soft', sw: .5, ...o });
const WATER = {
  S1: {
    intuition: one([rc(0, 0, 160, 90, { f: 'sky', c: 'none', o: .5 }), land(), pa('M0 74Q30 70 58 76L58 90L0 90Z', { f: 'water', c: 'lapis', sw: .4 }), sun(18, 14, 5),
      ...[10, 22, 34, 46].map((x, i) => M('along', { pts: [x, 72, x + 18, 40, x + 46, 26], n: 3, loop: 3.2, r: .7, c: 'water', u0: .08 + i * .02 })), tx(28, 60, 'evaporates', { fs: 3.3, c: 'lapis', on: [.1, 1] }),
      cloud(98, 22, 1.1, { ox: 98, oy: 22, sc: .2, o: 0, k: [[.25, { sc: .2, o: 0 }], [.45, { sc: 1, o: 1 }]] }), tx(126, 12, 'cools, condenses', { fs: 3.3, on: [.4, 1] }),
      rain(92, 28, 14, 14, { on: [.5, 1] }), tx(80, 46, 'rain', { fs: 3.3, c: 'lapis', on: [.55, 1] }), M('along', { pts: [104, 44, 88, 58, 72, 68, 56, 78], n: 6, loop: 3, r: .8, c: 'lapis', u0: .6 }), tx(80, 76, 'flows back', { fs: 3.3, on: [.65, 1] })],
      [[0, 'The Sun heats the lake: water leaves as invisible vapour.'], [.3, 'The vapour rises, cools, and condenses into cloud.'], [.55, 'Rain falls back, and gravity carries it down to the lake: the Sun is the pump, gravity the return.']], { dur: 13 }),
    misconception: one([rc(0, 0, 160, 90, { f: 'sky', c: 'none', o: .45 }), rc(0, 74, 160, 16, { f: '#cdbf98', c: 'none' }), pa('M4 76Q20 73 36 77L36 82L4 82Z', { f: 'water', c: 'lapis', sw: .3 }), M('along', { pts: [20, 74, 22, 40], n: 2, loop: 3.4, r: .7, c: 'water' }),
      rc(70, 40, 5, 34, { f: '#7a5a3a', c: 'none' }), ci(72, 34, 16, { f: '#6f9a6a', c: 'none', o: .9 }), ...[[60, 84], [72, 88], [84, 84]].map(([x, y]) => ln(72, 74, x, y, { c: '#7a5a3a', sw: .6 })),
      ...[[60, 84, 72, 74, 72, 40, 64, 30, 60, 10], [72, 88, 72, 74, 72, 40, 74, 26, 76, 6], [84, 84, 72, 74, 72, 40, 82, 30, 88, 10]].map((pts, i) => M('along', { pts, n: 4, loop: 3, r: .7, c: 'water', u0: i * .03 })),
      tx(20, 36, 'lakes, soil', { fs: 3.2 }), tx(72, 4, 'through plants', { fs: 3.2 }),
      rc(110, 20, 40, 6, { c: 'soft', sw: .3 }), rc(110, 20, 0, 6, { f: 'verd', c: 'none', k: [[.3, { w: 0 }], [.7, { w: 24 }]] }), rc(134, 20, 0, 6, { f: 'verd', c: 'none', o: .4, k: [[.5, { w: 0 }], [.8, { w: 12 }]] }), tx(130, 16, 'share through plants', { fs: 3.1 }), tx(130, 33, 'about 60–90 %', { fs: 3.6, b: true, c: 'verd', on: [.7, 1] }), tx(130, 39, '(80–90 % from isotopes)', { fs: 2.9, c: 'soft', on: [.75, 1] })],
      [[0, 'Where does the water reaching the air over land come from?'], [.3, 'Not mainly from lakes and rivers: plants pull it up through their roots and breathe it out from their leaves.'], [.65, 'Transpiration is the larger share: about 80–90 % by isotope estimates, near 60 % by other methods.']], { dur: 12 }),
  },
  S2: {
    intuition: (() => { const Y = q => 74 - q * 2, cap = u => { const T = 30 - 20 * cl01((u - .1) / .7); const es = 6.112 * Math.exp(17.27 * T / (T + 237.3)); return 622 * es / (1013 - es); };
      return one([rc(20, 14, 60, 60, { c: 'soft', sw: .5, rx: 2 }), M('gas', { box: [20, 14, 60, 60], sp: [{ n: 22, r: .9, v: 8, c: 'water' }], frame: false, seed: 5 }), tx(50, 10, 'a parcel of air', { fs: 3.2, c: 'soft' }),
        ln(20, Y(15), 80, Y(15), { c: 'lapis', sw: .6, dash: '.8 .8' }), tx(82, Y(15) + 1, 'holds 15 g/kg', { fs: 3.1, c: 'lapis', a: 'start' }), ln(20, 0, 80, 0, { c: 'verd', sw: .7, dash: '2 1', k: kf(60, u => ({ y: Y(cap(u)), y2: Y(cap(u)) })) }), M('num', { x: 82, y: 0, v: 27, k: kf(60, u => ({ v: cap(u), y: Y(cap(u)) - 1 })), dp: 1, pre: 'can hold ', suf: ' g/kg', fs: 3.1, a: 'start', c: 'verd' }),
        ...Array.from({ length: 10 }, (_, i) => ci(24 + i * 5.6, 70 - (i % 3) * 3, 1.7, { f: 'lapis', c: 'none', on: [.47 + i * .035, 1] })), thermo(140, 16, 50, [[.1, 46], [.8, 12]]), M('num', { x: 140, y: 82, v: 30, k: [[.1, { v: 30 }], [.8, { v: 10 }]], suf: ' °C', fs: 3.4 })],
        [[0, 'A parcel of air carrying 15 g of vapour per kg.'], [.25, 'Cool it: the most it could hold falls fast, halving about every 10 K.'], [.5, 'Once that falls below what it carries, the excess condenses into drops: cooling, not squeezing, wrings out the water.']], { dur: 13 }); })(),
    misconception: (() => { const jar = [rc(25, 14, 50, 50, { c: 'ink', sw: .6, rx: 1.5 }), rc(26, 54, 48, 9, { f: 'water', c: 'none' }), ar(75, 18, 92, 18, { c: 'soft', sw: .6, on: [.25, .5] }), tx(84, 14, 'pump out the air', { fs: 3, on: [.25, .55] })], air = M('gas', { box: [26, 15, 48, 38], sp: [{ n: 16, r: .9, v: 10, c: 'mute' }], frame: false, seed: 9, on: [0, .45] });
      return pair([...jar, air, M('gas', { box: [26, 15, 48, 38], sp: [{ n: 9, r: .9, v: 10, c: 'lapis' }], frame: false, seed: 4, on: [0, .6] }), M('num', { x: 50, y: 70, v: 23.4, k: [[.45, { v: 23.4 }], [.65, { v: 0 }]], dp: 1, pre: 'vapour pressure ', suf: ' hPa', fs: 3.2 }), stamp(50, 34, 'no sponge, no vapour?', .7)],
        [...jar, air, M('gas', { box: [26, 15, 48, 38], sp: [{ n: 9, r: .9, v: 10, c: 'lapis' }], frame: false, seed: 4 }), M('num', { x: 50, y: 70, v: 23.4, dp: 1, pre: 'vapour pressure ', suf: ' hPa', fs: 3.2 }), tx(50, 8, 'same e_s(20 °C) with or without air', { fs: 3, c: 'verd' })],
        [[0, 'A closed jar of water at 20 °C: air (grey) and water vapour (blue) above it.'], [.3, 'Pump the air out. If air held the vapour like a sponge, the vapour would go with it.'], [.6, 'It stays: saturation, 23.4 hPa at 20 °C, belongs to water at that temperature, not to the air.']]); })(),
  },
  S3: {
    intuition: one([rc(0, 0, 160, 90, { f: 'sky', c: 'none', o: .45 }), po([20, 84, 80, 22, 140, 84], { closed: true, f: '#cdbf98', c: 'soft', sw: .5 }), rc(0, 84, 160, 6, { f: '#cdbf98', c: 'none' }), ar(2, 72, 16, 72, { c: 'lapis', sw: .9, label: 'wind', ly: -4 }),
      M('along', { pts: [0, 78, 22, 78, 50, 52, 78, 26], n: 6, loop: 4, r: 1, c: 'lapis' }), M('along', { pts: [82, 26, 110, 52, 138, 78, 160, 80], n: 5, loop: 4, r: 1, c: 'brass', u0: .2 }), ln(0, 48, 160, 48, { c: 'mute', sw: .35, dash: '1.5 1' }), tx(158, 46, 'condensation level', { fs: 2.9, c: 'soft', a: 'end' }),
      cloud(64, 40, 1.2, { o: 0, k: [[.25, { o: 0 }], [.45, { o: 1 }]] }), rain(50, 46, 16, 16, { on: [.45, 1] }), tx(26, 62, 'moist air forced up', { fs: 3.2, c: 'lapis', a: 'start' }), tx(126, 70, 'dry, warming air:', { fs: 3.2, c: 'brass' }), tx(126, 76, 'rain shadow', { fs: 3.2, c: 'brass' })],
      [[0, 'Wind drives moist air against a mountain.'], [.2, 'Forced up the slope, the air expands and cools…'], [.4, '…above the condensation level its water condenses into cloud and falls as rain on the windward side.'], [.7, 'Over the top it sinks, warms and dries: a rain shadow beyond.']], { dur: 13 }),
    misconception: pair([po([30, 64, 66, 18, 100, 64], { closed: true, f: '#cdbf98', c: 'soft', sw: .5 }), ...[0, 1, 2].map(i => cloud(0, 30 + i * 9, .7, { k: [[0, { tx: -20 + i * 3 }], [.3 + i * .15, { tx: 32 + i * 4 }]] })), stamp(28, 62, 'piling up like snow?', .75)],
      [po([30, 64, 66, 18, 100, 64], { closed: true, f: '#cdbf98', c: 'soft', sw: .5 }), M('along', { pts: [0, 60, 24, 60, 48, 36, 64, 20], n: 5, loop: 3.5, r: .9, c: 'lapis' }), ln(0, 40, 100, 40, { c: 'mute', sw: .35, dash: '1.5 1' }), tx(98, 38, 'dew point reached', { fs: 2.9, c: 'soft', a: 'end' }), cloud(52, 32, .8, { o: 0, k: [[.3, { o: 0 }], [.55, { o: 1 }]] }), tx(50, 70, 'clear air rises; the cloud forms in it', { fs: 3, c: 'verd' })],
      [[0, 'Where does the cloud on the mountain come from?'], [.3, 'Not from clouds drifting in and piling against the slope…'], [.5, '…but from clear air forced up the slope, which expands and cools below its dew point: the cloud forms there, in the rising air.']]),
  },
};

// ======================================================================= the Galton board
const GALTON = {
  S1: {
    intuition: one([M('galton', { box: [40, 4, 80, 80], rows: 6, n: 6, hl: 0, flips: true, u0: .05, u1: .75, fall: 3, bins: true, seed: 8 }), tx(132, 30, 'each peg:', { fs: 3.4, a: 'start' }), tx(132, 36, 'a coin flip', { fs: 3.4, a: 'start' }), tx(132, 46, 'R: step right', { fs: 3.2, c: 'rubric', a: 'start' }), tx(132, 52, 'L: step left', { fs: 3.2, c: 'rubric', a: 'start' })],
      [[0, 'A bead meets a peg and goes right or left: heads or tails.'], [.3, 'It meets one peg in every row, and each time flips again.'], [.6, 'Its bin is just the number of rights among its flips.']], { dur: 12 }),
    misconception: pair([M('galton', { box: [10, 4, 80, 60], rows: 8, n: 90, due: true, u0: .05, u1: .8, fall: 1.4, seed: 4 }), tx(50, 70, 'after two rights, a left is “due”?', { fs: 3.1, c: 'rubric' })],
      [M('galton', { box: [10, 4, 80, 60], rows: 8, n: 90, u0: .05, u1: .8, fall: 1.4, seed: 4 }), tx(50, 70, 'P(right) = 0.5 at every peg, whatever came before', { fs: 3, c: 'verd' })],
      [[0, 'Two boards: one where pegs “remember”, one where they do not.'], [.4, 'If a left were due after a run of rights, the beads would bunch tightly in the middle.'], [.65, 'Real pegs have no memory: each bounce is 50/50, and the spread is wider.']], { dur: 12 }),
  },
  S2: (() => { const rows = 6, box = [30, 4, 100, 80], pegH = box[3] * .55, dy = pegH / rows, dx = box[2] / (rows + 2), cx = box[0] + box[2] / 2, C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
    return {
      intuition: one([M('galton', { box, rows, n: 64, u0: .35, u1: .9, fall: 1.6, seed: 2 }), ...Array.from({ length: rows }, (_, r) => Array.from({ length: r + 1 }, (_, j) => tx(cx + (j - r / 2) * dx, box[1] + (r + 1) * dy - 2.2, C(r, j), { fs: 2.8, c: 'rubric', on: [.05 + r * .045, 1] }))).flat(),
        ...Array.from({ length: rows + 1 }, (_, k) => tx(cx + (k - rows / 2) * dx, box[1] + pegH + dy + 3, C(rows, k), { fs: 3.2, b: true, c: 'rubric', on: [.32, 1] })), tx(148, 30, 'paths to', { fs: 3.2 }), tx(148, 36, 'each peg', { fs: 3.2 })],
        [[0, 'Count the paths that reach each peg: each number is the sum of the two above it.'], [.32, 'At the bottom: 1, 6, 15, 20, 15, 6, 1 paths, binomial coefficients.'], [.5, 'Every path is equally likely, so the bins fill in that proportion: many paths to the middle, one to each edge.']], { dur: 13 }),
      misconception: pair([M('galton', { box: [8, 4, 84, 56], rows: 10, n: 140, steer: true, u0: .05, u1: .85, fall: 1.2, share: 5, shareX: 92, shareY: 67, seed: 8 })],
        [M('galton', { box: [8, 4, 84, 56], rows: 10, n: 140, u0: .05, u1: .85, fall: 1.2, share: 5, shareX: 92, shareY: 67, seed: 8 }), tx(50, 72, 'most likely bin, yet 3 in 4 land elsewhere', { fs: 3, c: 'verd', on: [.8, 1] })],
        [[0, 'The centre bin of a 10-row board is the most likely one.'], [.35, 'If “most likely” meant “likely”, most beads would land there.'], [.6, 'It gets about 25 % (252 of 1024 paths); about three quarters land elsewhere.']], { dur: 13 }),
    }; })(),
  S3: (() => { const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }, v = Array.from({ length: 25 }, (_, i) => C(40, i + 8) / 2 ** 40);
    return {
      intuition: one([g([M('bars', { box: [10, 12, 140, 64], v, max: .13, c: 'lapis', yl: 'probability', xl: 'bin k (8 to 32 of 40)' })], { ox: 80, oy: 44, sc: 1, k: [[.2, { sc: 1, o: 1 }], [.6, { sc: .62, o: .75 }]] }), g([M('curve', { box: [10, 12, 140, 64], xr: [7.5, 32.5], yr: [0, .13], f: 'exp(-((x-20)^2)/20)/sqrt(20*PI)', c: 'rubric', sw: .9, axes: false })], { ox: 80, oy: 44, sc: 1, o: 0, k: [[.2, { sc: 1, o: 0 }], [.6, { sc: .62, o: 1 }]] }), tx(80, 86, 'binomial, 40 fair rows', { fs: 3.4 })],
        [[0, 'The binomial distribution for 40 rows: a staircase of bars.'], [.3, 'Step back from it…'], [.6, '…and the staircase outline melts into the smooth bell, the normal curve.']], { dur: 11 }),
      misconception: pair([M('galton', { box: [10, 4, 80, 60], rows: 8, n: 90, steer: true, u0: .05, u1: .8, fall: 1.4, seed: 6 }), tx(50, 70, 'each ball steered to the centre?', { fs: 3.1, c: 'rubric' })],
        [M('galton', { box: [10, 4, 80, 60], rows: 8, n: 90, u0: .05, u1: .8, fall: 1.4, seed: 6 }), tx(50, 70, 'fair bounces; the hump is the count of paths', { fs: 3, c: 'verd' })],
        [[0, 'Where does the bell come from?'], [.4, 'If balls aimed for the centre, they would all pile into it.'], [.62, 'Every bounce is fair; the hump appears only because more paths lead to the middle, C(N, k).']], { dur: 12 }),
    }; })(),
};

// ======================================================================= markets
const BUY = [45, 40, 34, 30, 27, 22, 15, 10], SELL = [8, 12, 16, 20, 24, 28, 33, 40];
const ziTrades = (constrained, seed, n = 36) => { const R = (() => { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(), out = [];
  while (out.length < n) { let B = BUY.slice(), S = SELL.slice(); for (let tries = 0; tries < 400 && B.length && S.length && out.length < n; tries++) { const bi = Math.floor(R() * B.length), si = Math.floor(R() * S.length), bid = constrained ? R() * B[bi] : R() * 50, ask = constrained ? S[si] + R() * (50 - S[si]) : R() * 50; if (bid >= ask) { out.push((bid + ask) / 2); B.splice(bi, 1); S.splice(si, 1); } } } return out; };
const tradePlot = (P, c) => { const X = i => 12 + i / 36 * 80, Y = p => 58 - p / 50 * 48; return [ln(12, 58, 92, 58, { c: 'soft', sw: .4 }), ln(12, 10, 12, 58, { c: 'soft', sw: .4 }), ln(12, Y(25), 92, Y(25), { c: 'verd', sw: .5, dash: '1.5 1' }), tx(92, Y(25) - 1.5, 'p* = 25', { fs: 3, c: 'verd', a: 'end' }), tx(14, 8, 'trade price', { fs: 3, a: 'start', c: 'soft' }), ...P.map((p, i) => ci(X(i), Y(p), 1, { f: c, c: 'none', on: [.05 + .8 * i / P.length, 1] }))]; };
const MARKET = {
  S1: {
    intuition: one([M('bars', { box: [14, 10, 100, 64], v: BUY, max: 50, c: 'verd', yl: 'value to the buyer ($)', xl: 'buyers, highest first', lvl: 42, lvlLab: 'price {v}', k: [[.12, { lvl: 42 }], [.45, { lvl: 25 }], [.62, { lvl: 25 }], [.88, { lvl: 12 }]] }), M('num', { x: 140, y: 40, v: 2, k: kf(80, u => { const p = u < .12 ? 42 : u < .45 ? 42 - 17 * ((u - .12) / .33) : u < .62 ? 25 : u < .88 ? 25 - 13 * ((u - .62) / .26) : 12; return { v: BUY.filter(b => b >= p).length }; }), pre: 'buyers: ', fs: 4 }), tx(140, 48, 'every step above', { fs: 3.2, c: 'soft' }), tx(140, 53, 'the water buys', { fs: 3.2, c: 'soft' })],
      [[0, 'Eight buyers, each step one buyer’s value of the good, highest first.'], [.2, 'The price is a water level: everyone whose value stands above it buys.'], [.45, 'At 25, five buy; lower the price and more steps rise above the water: the demand curve.']], { dur: 12 }),
    misconception: (() => { const ax = [ln(10, 8, 10, 62, { c: 'soft', sw: .4 }), ln(10, 62, 92, 62, { c: 'soft', sw: .4 }), tx(12, 7, 'price', { fs: 3, a: 'start', c: 'soft' }), tx(92, 67, 'quantity', { fs: 3, a: 'end', c: 'soft' })], D = (o = {}) => ln(15, 12, 85, 52, { c: 'lapis', sw: .9, ...o }), price = ln(10, 25, 92, 25, { c: 'brass', sw: .5, dash: '1.5 1', k: [[.15, { y: 25, y2: 25 }], [.5, { y: 40, y2: 40 }]] });
      return pair([...ax, D({ o: .3 }), g([D(), tx(85, 50, 'D', { fs: 3.4, c: 'lapis', a: 'start' })], { k: [[.3, { tx: 0 }], [.65, { tx: 18 }]] }), price, stamp(50, 18, 'the curve moved?', .72)],
        [...ax, D(), tx(86, 52, 'D(p)', { fs: 3.4, c: 'lapis', a: 'start' }), price, ci(37.75, 25, 1.6, { f: 'rubric', c: 'none', k: [[.15, { x: 37.75, y: 25 }], [.5, { x: 64, y: 40 }]] }), tx(50, 70, 'a lower price: a move along the same curve', { fs: 3, c: 'verd' })],
        [[0, 'The price of the good falls.'], [.3, 'Reading it as “demand increased” shifts the whole curve…'], [.55, '…but the curve is unchanged: the point slides along D(p) to a larger quantity. Only incomes, tastes or other prices shift D.']]); })(),
  },
  S2: {
    intuition: one([M('bars', { box: [14, 10, 100, 64], v: SELL, max: 50, c: 'brass', yl: 'cost to the seller ($)', xl: 'sellers, cheapest first', below: true, lvl: 10, lvlLab: 'price {v}', water: false, k: [[.12, { lvl: 10 }], [.45, { lvl: 25 }], [.62, { lvl: 25 }], [.88, { lvl: 36 }]] }), M('num', { x: 140, y: 40, v: 1, k: kf(80, u => { const p = u < .12 ? 10 : u < .45 ? 10 + 15 * ((u - .12) / .33) : u < .62 ? 25 : u < .88 ? 25 + 11 * ((u - .62) / .26) : 36; return { v: SELL.filter(c => c <= p).length }; }), pre: 'sellers: ', fs: 4 }), tx(140, 48, 'every cost below', { fs: 3.2, c: 'soft' }), tx(140, 53, 'the price sells', { fs: 3.2, c: 'soft' })],
      [[0, 'Eight sellers’ costs, cheapest first.'], [.25, 'A seller joins once the price covers their cost.'], [.5, 'At 25, the five cheapest sell; raise the price and the dearer ones join: the supply curve.']], { dur: 12 }),
    misconception: pair([M('bars', { box: [8, 10, 84, 50], v: SELL, max: 50, c: 'brass', below: true, lvl: 25, water: false, yl: 'cost ($)', k: [[.15, { lvl: 25, v: SELL }], [.6, { lvl: 30, v: SELL.map(c => c * .78) }]] }), stamp(50, 30, 'costs fell?', .7)],
      [M('bars', { box: [8, 10, 84, 50], v: SELL, max: 50, c: 'brass', below: true, lvl: 25, water: false, yl: 'cost ($)', k: [[.15, { lvl: 25 }], [.6, { lvl: 30 }]] }), tx(50, 68, 'costs unchanged; at 30 a sixth seller joins', { fs: 3, c: 'verd' })],
      [[0, 'The price rises from 25 to 30.'], [.35, 'It does not make anyone’s production cheaper…'], [.6, '…it lets sellers with higher costs take part without a loss, so more of them sell.']], { dur: 11 }),
  },
  S3: (() => { const X = q => 12 + q / 100 * 110, Y = p => 78 - p / 50 * 70, pr = u => u < .05 ? 12 : u < .4 ? 12 + 13 * ((u - .05) / .35) : u < .5 ? 25 : u < .55 ? 25 + 13 * ((u - .5) / .05) : u < .9 ? 38 - 13 * ((u - .55) / .35) : 25;
    return {
      intuition: one([ln(12, 8, 12, 78, { c: 'soft', sw: .4 }), ln(12, 78, 122, 78, { c: 'soft', sw: .4 }), ln(X(100), Y(0), X(0), Y(50), { c: 'lapis', sw: .9 }), tx(X(4), Y(48), 'D', { fs: 3.6, c: 'lapis' }), ln(X(0), Y(8.33), X(100), Y(41.67), { c: 'brass', sw: .9 }), tx(X(98), Y(40) - 2, 'S', { fs: 3.6, c: 'brass' }),
        ln(12, 0, 122, 0, { c: 'ink', sw: .4, dash: '1.2 1', k: kf(100, u => ({ y: Y(pr(u)), y2: Y(pr(u)) })) }), ln(0, 0, 0, 0, { c: 'rubric', sw: 1.6, k: kf(100, u => { const p = pr(u); return { x: X(Math.max(0, -25 + 3 * p)), x2: X(100 - 2 * p), y: Y(p), y2: Y(p) }; }) }),
        tx(146, 30, 'shortage:', { fs: 3.4, on: [.05, .4] }), tx(146, 36, 'buyers bid up', { fs: 3.2, c: 'rubric', on: [.05, .4] }), tx(146, 30, 'surplus:', { fs: 3.4, on: [.55, .9] }), tx(146, 36, 'sellers cut', { fs: 3.2, c: 'rubric', on: [.55, .9] }), tx(146, 30, 'p* = 25: clear', { fs: 3.4, c: 'verd', on: [.4, .55] }), tx(146, 30, 'p* = 25: clear', { fs: 3.4, c: 'verd', on: [.9, 1] }),
        M('num', { x: 146, y: 50, v: 65, k: kf(100, u => ({ v: 125 - 5 * pr(u) })), pre: 'D − S = ', fs: 3.6, mono: true })],
      [[0, 'Below the clearing price buyers want more than sellers offer (the red gap): a shortage.'], [.2, 'Unserved buyers bid the price up and the gap closes at p* = 25.'], [.55, 'Above it sellers are left holding goods: a surplus, and they cut prices until neither side is left waiting.']], { dur: 13 }),
      misconception: pair([...tradePlot(ziTrades(false, 7), 'rubric'), stamp(52, 30, 'random traders: chaos?', .85)], [...tradePlot(ziTrades(true, 7), 'verd'), tx(52, 68, 'random bids within a no-loss rule', { fs: 3, c: 'verd' })],
        [[0, 'Trades in a double auction, one dot per trade.'], [.35, 'Without rational, informed traders, you might expect prices all over the place…'], [.6, '…yet robots bidding at random, bound only by never trading at a loss, trade close to 25 (Gode & Sunder 1993).']], { dur: 12 }),
    }; })(),
};

// ======================================================================= osmosis
const OSMO = {
  S1: {
    intuition: one([rc(76, 10, 8, 30, { f: 'brass', fo: .5, c: 'soft', sw: .3 }), rc(76, 50, 8, 28, { f: 'brass', fo: .5, c: 'soft', sw: .3 }), rc(76, 40, 8, 10, { f: '#efe3c3', c: 'soft', sw: .3 }),
      M('gas', { box: [8, 10, 68, 68], sp: [{ n: 26, r: .8, v: 8, c: 'water' }], frame: false, seed: 3 }), M('gas', { box: [84, 10, 68, 68], sp: [{ n: 18, r: .8, v: 8, c: 'water' }, { n: 8, r: 2, v: 5, c: 'brass' }], frame: false, seed: 4 }),
      M('along', { pts: [68, 45, 92, 45], n: 4, loop: 2.2, r: .85, c: 'lapis' }), tx(80, 6, 'aquaporin: a single-file water pore', { fs: 3.3 }), tx(118, 86, 'solute: too big to enter', { fs: 3.2, c: 'brass' })],
      [[0, 'A cell membrane is studded with water channels, aquaporins.'], [.3, 'Water molecules pass through them in single file…'], [.6, '…while larger dissolved particles cannot enter the pore at all.']], { dur: 11 }),
    misconception: pair([rc(46, 10, 8, 52, { f: 'brass', fo: .4, c: 'soft', sw: .3 }), g([ci(50, 36, 6, { f: 'mute', c: 'ink', sw: .4 }), ...Array.from({ length: 8 }, (_, i) => rc(49, 28.5, 2, 3, { f: 'ink', c: 'none' })).map((r, i) => g([r], { ox: 50, oy: 36, rot: i * 45 }))], { ox: 50, oy: 36, rot: 0, k: [[0, { rot: 0 }], [1, { rot: 720 }]], lin: true }),
      M('along', { pts: [20, 36, 80, 36], n: 6, loop: 1.5, r: .9, c: 'lapis' }), tx(50, 22, 'pump?', { fs: 3.4, c: 'rubric' }), stamp(50, 56, 'no motor in there', .7)],
      [M('gas', { box: [6, 10, 88, 52], sp: [{ n: 26, r: .8, v: 10, c: 'water', pass: true }, { n: 7, r: 2, v: 5, c: 'brass', side: 'R' }], wall: { x: 50 }, cross: [50, 68], seed: 12 }), tx(50, 7, 'it only filters: water crosses both ways at random', { fs: 2.9, c: 'verd' })],
      [[0, 'Does the membrane pump the water?'], [.3, 'It has no motor and spends no energy.'], [.55, 'It only decides what can pass; water crosses both ways, and the drive for a net flow comes from the solute’s effect on water.']], { dur: 12 }),
  },
  S2: (() => { const lvL = [[.08, 30], [.75, 42]], lvR = [[.08, 30], [.75, 18]];
    return {
      intuition: one([pa('M28 12L28 82L132 82L132 12M52 12L52 70L108 70L108 12', { c: 'ink', sw: .7 }), rc(28.5, 30, 23, 52, { f: 'water', c: 'none', k: lvL.map(([q, y]) => [q, { y, h: 82 - y }]) }), rc(108.5, 30, 23, 52, { f: 'water', c: 'none', k: lvR.map(([q, y]) => [q, { y, h: 82 - y }]) }), rc(52, 70.5, 56, 11, { f: 'water', c: 'none' }), ln(80, 70, 80, 82, { c: 'brass', sw: 1.1, dash: '1.2 .8' }),
        M('gas', { box: [109, 30, 22, 50], sp: [{ n: 9, r: 1.5, v: 4, c: 'brass' }], frame: false, k: lvR.map(([q, y]) => [q, { box: [109, y, 22, 80 - y] }]), seed: 6 }),
        ...[[5, .05, .35], [3, .35, .55], [1, .55, .72]].map(([n, a, b]) => M('along', { pts: [56, 76, 104, 76], n, loop: 1.8, r: .8, c: 'lapis', on: [a, b] })),
        ln(136, 0, 136, 0, { c: 'rubric', sw: .5, k: kf(60, u => { const q = cl01((u - .08) / .67); return { y: 30 - 12 * q, y2: 30 + 12 * q }; }) }), M('num', { x: 142, y: 32, v: 0, k: kf(60, u => ({ v: 24 * cl01((u - .08) / .67) })), pre: 'Δh ', suf: ' mm', fs: 3.3, a: 'start' }), tx(40, 8, 'water', { fs: 3.2 }), tx(120, 8, 'solution', { fs: 3.2, c: 'brass' })],
        [[0, 'Pure water and a solution, joined through a membrane at the bottom.'], [.15, 'The solute lowers the water’s chemical potential on its side, so water crosses into the solution…'], [.45, '…the solution’s column rises and its extra pressure pushes back…'], [.7, '…until the two potentials are equal and the net flow stops.']], { dur: 13 }),
      misconception: pair([M('gas', { box: [6, 10, 88, 52], sp: [{ n: 26, r: .8, v: 12, c: 'water', pass: true }], wall: { x: 50 }, hits: 'wall', seed: 2 }), tx(50, 68, 'molecule by molecule, at random?', { fs: 3.1, c: 'rubric' })],
        [rc(6, 10, 88, 52, { c: 'soft', sw: .5 }), rc(46, 10, 8, 22, { f: 'brass', fo: .5, c: 'soft', sw: .3 }), rc(46, 40, 8, 22, { f: 'brass', fo: .5, c: 'soft', sw: .3 }), M('along', { pts: [10, 36, 90, 36], n: 14, gap: .05, loop: 2.4, r: 1.1, c: 'lapis' }), tx(50, 68, 'through pores: bulk flow, driven by pressure plus the solute effect', { fs: 2.8, c: 'verd' })],
        [[0, 'How does water get through the membrane?'], [.35, 'Not mostly as single molecules wandering across by diffusion…'], [.55, '…but as bulk flow through the pores, the water moving together, pushed by the difference in its chemical potential.']], { dur: 12 }),
    }; })(),
  S3: {
    intuition: one([M('gas', { box: [14, 20, 56, 50], sp: [{ n: 8, r: 1.6, v: 30, c: 'brass' }], hits: true, rate: [42, 80, 'hits per second: '], seed: 5 }), M('gas', { box: [90, 20, 56, 50], sp: [{ n: 16, r: 1.6, v: 30, c: 'brass' }], hits: true, rate: [118, 80, 'hits per second: '], seed: 6 }), tx(42, 14, 'c', { fs: 3.8, it: true }), tx(118, 14, '2c', { fs: 3.8, it: true }), tx(80, 88, 'π = cRT: twice the particles, twice the push', { fs: 3.3, c: 'verd', on: [.5, 1] })],
      [[0, 'Dissolved particles bounce around in the solution like gas molecules.'], [.35, 'Each strike on the walls is part of the osmotic push.'], [.55, 'Twice the particles, twice the strikes per second: π = cRT, the gas law again.']], { dur: 12 }),
    misconception: one([...[['glucose', 1, 20, 'brass'], ['NaCl', 2, 80, 'verd'], ['CaCl₂', 3, 140, 'rubric']].flatMap(([nm, k, x, c]) => [rc(x - 22, 10, 44, 42, { c: 'ink', sw: .5, rx: 1.5 }), tx(x, 7, nm, { fs: 3.4 }),
      ...[0, 1, 2].flatMap(j => Array.from({ length: k }, (_, i) => { const x0 = x - 12 + j * 12, y0 = 22 + (j % 2) * 14, a = i * 2 * Math.PI / k; return ci(x0 + i * 2.4, y0, 1.6, { f: i ? 'lapis' : c, c: 'ink', sw: .2, k: [[.15, { x: x0 + i * 2.4, y: y0 }], [.45, { x: x0 + (k > 1 ? Math.cos(a) * 5 : 0), y: y0 + (k > 1 ? Math.sin(a) * 5 : 0) }]] }); })),
      rc(x - 6, 82, 12, 0, { f: c, c: 'none', k: [[.5, { y: 82, h: 0 }], [.8, { y: 82 - 7 * k, h: 7 * k }]] }), tx(x, 88, k + ' particle' + (k > 1 ? 's' : ''), { fs: 3, on: [.45, 1] })]), tx(80, 60, 'osmotic pressure, 0.1 mol/L each', { fs: 3.1, c: 'soft', on: [.5, 1] })],
      [[0, 'Dissolve 0.1 mol/L of glucose, salt and calcium chloride.'], [.2, 'Glucose stays whole; NaCl splits into two ions, CaCl₂ into three.'], [.55, 'Osmotic pressure counts particles, so it comes out about 1 : 2 : 3 (the van ’t Hoff factor i).']], { dur: 11 }),
  },
};
// ======================================================================= the "Ways of Explaining" book
const box = (x, y, w, h, label, o = {}) => g([rc(x, y, w, h, { rx: 2, f: o.f || '#fbf6ea', c: o.c || 'soft', sw: .5 }), tx(x + w / 2, y + h / 2 + 1.3, label, { fs: o.fs || 3.2, c: o.tc || 'ink', mono: o.mono })], o.g || {});
const grid4 = (() => { const W = 9, H = 6, wall = new Set(['4,1', '4,2', '4,3', '4,4']), S = [1, 3], G = [7, 2], key = (x, y) => x + ',' + y, nb = ([x, y]) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && !wall.has(key(a, b))), h = ([x, y]) => Math.abs(x - G[0]) + Math.abs(y - G[1]);
  const run = rule => { const order = [], from = new Map([[key(...S), null]]), g = new Map([[key(...S), 0]]); let F = [S]; while (F.length) { let i = 0; if (rule === 'dfs') i = F.length - 1; else if (rule === 'greedy') i = F.reduce((b, c, j) => h(c) < h(F[b]) ? j : b, 0); else if (rule === 'astar') i = F.reduce((b, c, j) => g.get(key(...c)) + h(c) < g.get(key(...F[b])) + h(F[b]) ? j : b, 0); const c = F.splice(i, 1)[0]; order.push(c); if (c[0] === G[0] && c[1] === G[1]) break; for (const n of nb(c)) if (!from.has(key(...n))) { from.set(key(...n), c); g.set(key(...n), g.get(key(...c)) + 1); F.push(n); } }
    const path = []; let p = G; while (p) { path.push(p); p = from.get(key(...p)); } return { order, path }; };
  return { W, H, wall, S, G, run }; })();
const searchPanel = (x0, y0, cs, rule, name) => { const { W, H, wall, S, G, run } = grid4, R = run(rule), N = R.order.length, items = [tx(x0 + W * cs / 2, y0 - 2, name + ' · ' + N + ' cells', { fs: 3, c: 'ink' })];
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) items.push(rc(x0 + i * cs, y0 + j * cs, cs, cs, { f: wall.has(i + ',' + j) ? 'ink' : '#fbf6ea', c: 'mute', sw: .2 }));
  R.order.forEach(([i, j], k) => items.push(rc(x0 + i * cs + .4, y0 + j * cs + .4, cs - .8, cs - .8, { f: 'water', c: 'none', on: [.05 + .65 * k / 54, 1] })));
  R.path.forEach(([i, j]) => items.push(ci(x0 + i * cs + cs / 2, y0 + j * cs + cs / 2, cs * .22, { f: 'rubric', c: 'none', on: [.78, 1] })));
  items.push(tx(x0 + S[0] * cs + cs / 2, y0 + S[1] * cs + cs / 2 + 1, 'S', { fs: 2.8, b: true }), tx(x0 + G[0] * cs + cs / 2, y0 + G[1] * cs + cs / 2 + 1, 'G', { fs: 2.8, b: true, c: 'verd' })); return items; };
const loopPulse = (pts, signs, laps, grow) => { const segs = pts.length, K = []; let amp = 1, sgn = 1; const N = 60 * laps;
  for (let i = 0; i <= N; i++) { const s = i / N * laps * segs, e = Math.min(segs - 1, Math.floor(s % segs)), f = s % segs - e, [x1, y1] = pts[e], [x2, y2] = pts[(e + 1) % segs]; const passed = Math.floor(s); let a = 1, sg = 1; for (let q = 0; q < passed; q++) { if (signs[q % segs] < 0) sg = -sg; a *= grow; } K.push([.05 + .85 * i / N, { x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f, r: Math.min(4.5, 1.6 * a), c: sg > 0 ? 'lapis' : 'rubric' }]); }
  void amp; void sgn; return ci(pts[0][0], pts[0][1], 1.6, { f: 'lapis', c: 'none', k: K.map(([u, o]) => [u, { x: o.x, y: o.y, r: o.r }]), lin: true }); };
const schelling = (() => { const W = 16, H = 10, R = rng7(5), cells = []; for (let i = 0; i < W * H; i++) { const r = R(); cells.push(r < .1 ? 0 : r < .55 ? 1 : 2); }
  const like = (c, i) => { const x = i % W, y = Math.floor(i / W); let s = 0, n = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const v = cells[Y * W + X]; if (v) { n++; if (v === c[i]) s++; } } return n ? s / n : 1; };
  const avg = () => { let s = 0, k = 0; cells.forEach((v, i) => { if (v) { s += like(cells, i); k++; } }); return s / k; };
  const frames = [{ c: cells.slice(), a: avg() }]; for (let f = 0; f < 16; f++) { for (let m = 0; m < 14; m++) { const un = cells.map((v, i) => v && like(cells, i) < .34 ? i : -1).filter(i => i >= 0); if (!un.length) break; const i = un[Math.floor(R() * un.length)], empt = cells.map((v, j) => v ? -1 : j).filter(j => j >= 0), j = empt[Math.floor(R() * empt.length)]; cells[j] = cells[i]; cells[i] = 0; } frames.push({ c: cells.slice(), a: avg() }); }
  return { W, H, frames }; })();
function rng7(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const thermoSim = (gain, delay) => { const dt = .1, n = 600, lag = Math.round(delay / dt), y = [10], u = []; for (let i = 0; i < n; i++) { u.push(Math.max(0, Math.min(3, gain * (20 - y[i])))); const ud = i >= lag ? u[i - lag] : 0; y.push(y[i] + dt * (ud - .1 * (y[i] - 5))); } return y; };
const DOMAIN = {
  'Programming: building and running': {
    S1: { intuition: one([...[['bigram: one char of context', 'it only ever sees the last letter'], ['+ attention: reads the past', 'it ignores the order of words'], ['+ positions: order matters', 'one step of reading is too shallow'], ['+ compute + residual', '']].flatMap(([lab, gripe], i) => { const y = 72 - i * 15, u0 = .05 + i * .22; return [box(30, y, 70, 11, lab, { g: { o: 0, ty: -10, k: [[u0, { o: 0, ty: -10 }], [u0 + .06, { o: 1, ty: 0 }]] } }), ...(gripe ? [g([rc(106, y + 1, 50, 9, { rx: 4, f: '#f6e1da', c: 'rubric', sw: .4 }), tx(131, y + 6.6, gripe, { fs: 2.7, c: 'rubric' })], { o: 0, k: [[u0 + .1, { o: 0 }], [u0 + .14, { o: 1 }], [u0 + .22, { o: 1 }], [u0 + .26, { o: .35 }]] })] : [])]; }), tx(65, 8, 'each part answers a complaint about the last', { fs: 3.3 })],
      [[0, 'Start with the simplest model that runs: predict the next letter from the last one.'], [.15, 'Its complaint, in red, says what is missing…'], [.3, '…and the next part is added only to answer it. Attention, then positions, then more computation.'], [.8, 'Nothing is there because the final diagram has it.']], { dur: 14 }) },
    S2: { intuition: (() => { const B = { PC: [10, 14], MAR: [44, 14], RAM: [80, 14], IR: [10, 50], A: [118, 50], B: [118, 70], ALU: [80, 60] }, ctr = k => [B[k][0] + 14, B[k][1] + 5], hop = (a, b, u0, lab) => [M('along', { pts: [...ctr(a), ...ctr(b)], n: 1, u0, u1: u0 + .14, r: 1.8, c: 'rubric' }), tx(80, 88, lab, { fs: 3.4, c: 'rubric', on: [u0, u0 + .17] })];
      return one([...Object.entries(B).map(([k, [x, y]]) => box(x, y, 28, 10, k, { mono: true, fs: 3.4 })), ...hop('PC', 'MAR', .04, 'fetch 1: PC → MAR (the address)'), ...hop('RAM', 'IR', .22, 'fetch 2: RAM → IR (the instruction)'), ...hop('IR', 'MAR', .4, 'execute 1: IR → MAR (the operand’s address)'), ...hop('RAM', 'A', .58, 'execute 2: RAM → A (the value)'), ...hop('ALU', 'A', .76, 'execute 3: sum → A')],
        [[0, 'One instruction through a tiny computer.'], [.05, 'On each tick exactly one value moves from one register to another.'], [.4, 'Fetch brings the instruction in; execute carries out what it says.'], [.8, 'Then the program counter moves on, and the relay starts again.']], { dur: 13 }); })() },
    S3: { intuition: one([...searchPanel(18, 8, 5.4, 'bfs', 'breadth first'), ...searchPanel(94, 8, 5.4, 'dfs', 'depth first'), ...searchPanel(18, 51, 5.4, 'greedy', 'greedy'), ...searchPanel(94, 51, 5.4, 'astar', 'A*')],
      [[0, 'Four searches on the same grid, from S to G around a wall.'], [.2, 'Each runs the same loop; the blue fill is the order cells were taken.'], [.5, 'Breadth first spreads evenly, depth first plunges, greedy heads for the goal, A* balances both.'], [.8, 'Only the rule for which frontier cell comes next was changed.']], { dur: 14 }) },
  },
  'Mathematics: operations and invariants': {
    S1: { intuition: one([M('lin', { x: 62, y: 66, s: 9, n: 7, M: [1, 0, 0, 1], area: true, k: [[.15, { M: [1, 0, 0, 1] }], [.6, { M: [2, 1, 1, 3] }]] }), tx(134, 20, 'columns: î → (2, 1)', { fs: 3.2 }), tx(134, 26, 'ĵ → (1, 3)', { fs: 3.2 }), tx(134, 40, 'area = |2·3 − 1·1| = 5', { fs: 3.4, c: 'brass', b: true, on: [.6, 1] })],
      [[0, 'Watch only the unit square.'], [.25, 'Its edges go where the columns say: î to (2, 1), ĵ to (1, 3).'], [.6, 'It becomes a parallelogram of area |ad − bc| = 5, and the whole grid follows: every area grows 5-fold.']], { dur: 11 }) },
    S2: { intuition: one([M('galton', { box: [20, 4, 120, 82], rows: 14, n: 190, u0: .02, u1: .85, fall: 1.1, seed: 9 }), tx(150, 20, 'each bead:', { fs: 3.2, a: 'end' }), tx(150, 26, 'one draw', { fs: 3.2, a: 'end' })],
      [[0, 'One draw is one bead: it tells you almost nothing about the curve.'], [.3, 'A hundred draws: a rough shape appears.'], [.7, 'A thousand: close to the curve. The curve is a promise about many draws, not a description of any one.']], { dur: 14 }) },
  },
  'Economics: feedback and rival accounts': {
    S1: { intuition: (() => { const P = [[50, 12], [82, 52], [18, 52]], tri = [po([...P.flat(), ...P[0]], { c: 'soft', sw: .6 }), tx(50, 8, 'wages', { fs: 3 }), tx(90, 60, 'prices', { fs: 3 }), tx(10, 60, 'demand', { fs: 3 })], sg = (x, y, s) => tx(x, y, s, { fs: 4.4, b: true, c: s === '−' ? 'rubric' : 'verd' });
      return pair([...tri, sg(70, 30, '−'), sg(50, 58, '+'), sg(30, 30, '−'), loopPulse(P, [-1, 1, -1], 3, .75), stamp(50, 40, 'a minus, so a brake?', .78)],
        [...tri, sg(70, 30, '−'), sg(50, 58, '+'), sg(30, 30, '−'), loopPulse(P, [-1, 1, -1], 3, 1.18), tx(50, 68, '(−)·(+)·(−) = +: it grows', { fs: 3.3, c: 'verd' })],
        [[0, 'A loop with two minus signs. Follow a push around it (blue up, red down).'], [.35, 'If any minus sign made a brake, the push would die away.'], [.6, 'Each minus flips its sign; two flips cancel, and the push comes back larger every lap: a reinforcing loop.']], { dur: 13 }); })() },
    S2: { intuition: (() => { const A = [['demand fell', 10], ['supply shock', 32], ['skills mismatch', 54], ['wage setting', 76]], card = (lab, x, ok) => g([rc(x - 9, 34, 18, 22, { rx: 2, f: '#fbf6ea', c: 'soft', sw: .5 }), tx(x, 46, lab.split(' ')[0], { fs: 2.7 }), tx(x, 50, lab.split(' ')[1] || '', { fs: 2.7 }), rc(x - 9, 34, 18, 22, { rx: 2, f: 'verd', c: 'none', o: 0, k: ok })], {});
      const chip = (txt, u0, c) => g([rc(30, 8, 40, 8, { rx: 4, f: c, c: 'none' }), tx(50, 13.3, txt, { fs: 2.9, c: '#fff', halo: false })], { o: 0, k: [[u0, { o: 0 }], [u0 + .05, { o: 1 }]] });
      return pair([chip('unemployment rose', .05, 'lapis'), ...A.map(([l, x], i) => card(l, x, i === 0 ? [[.25, { o: 0 }], [.35, { o: .35 }]] : [[0, { o: 0 }]])), stamp(50, 66, 'so demand fell!', .5)],
        [chip('unemployment rose', .05, 'lapis'), ...A.map(([l, x]) => card(l, x, [[.25, { o: 0 }], [.35, { o: .35 }], [.5, { o: .35 }], [.55, { o: 0 }]])), chip('vacancies? which sectors?', .55, 'rubric'), ...A.map(([l, x], i) => card(l, x, [[.62, { o: 0 }], [.72, { o: i === 0 || i === 2 ? .35 : 0 }]]).items[3]).map(r => r), tx(50, 66, 'look where the accounts disagree', { fs: 3.1, c: 'verd' })],
        [[0, 'Four rival accounts of rising unemployment.'], [.25, 'The rise fits the first, so it seems proved…'], [.4, '…but every account predicts the rise: it favours none of them.'], [.6, 'Ask what they disagree about, vacancies and how broad the rise is, and only some survive.']], { dur: 13 }); })() },
  },
  'Business: the model as a system': {
    S1: { intuition: (() => { const parts = [['ingredients & cup', 14, 'brass'], ['staff', 15, 'lapis'], ['rent', 6, 'violet'], ['royalty', 4, 'rubric'], ['other', 5, 'soft'], ['margin', 6, 'verd']]; let k = 0; const coins = [], labels = [];
      parts.forEach(([lab, n, c], j) => { const bx = 12 + j * 24; labels.push(tx(bx + 8, 86, lab, { fs: 2.7 }), tx(bx + 8, 80 - Math.ceil(n / 3) * 3.4 - 3, '$' + (n / 10).toFixed(2), { fs: 3, mono: true, c, on: [.75, 1] })); for (let i = 0; i < n; i++, k++) { const sx = 64 + (k % 10) * 3.2, sy = 12 + Math.floor(k / 10) * 3.2, tx2 = bx + 3 + (i % 3) * 5, ty2 = 78 - Math.floor(i / 3) * 3.4; coins.push(ci(sx, sy, 1.3, { f: c, c: 'ink', sw: .15, k: [[.15 + j * .08, { x: sx, y: sy }], [.25 + j * .08, { x: tx2, y: ty2 }]] })); } });
      return one([tx(80, 8, '$5.00 from the customer, in 10¢ coins', { fs: 3.3 }), ...coins, ...labels, tx(150, 40, '$4.40 out', { fs: 3.4, a: 'end', on: [.7, 1] }), tx(150, 46, '$0.60 kept: 12 %', { fs: 3.4, c: 'verd', a: 'end', b: true, on: [.75, 1] })],
        [[0, 'A customer pays $5.00 for a cup: here fifty 10-cent coins.'], [.2, 'They flow straight back out: ingredients, staff, rent, the brand’s royalty, other costs.'], [.7, 'What is left, 60 cents, is the margin: a price is a bundle of payments to everyone else.']], { dur: 13 }); })() },
  },
  'Philosophy: arguments as objects': {
    S2: { intuition: (() => { const shake = u0 => [[u0, { rot: 0 }], [u0 + .02, { rot: -6 }], [u0 + .04, { rot: 6 }], [u0 + .06, { rot: -4 }], [u0 + .08, { rot: 0 }]];
      return one([g([box(60, 8, 40, 10, 'claim: knowledge = JTB')], { ox: 80, oy: 18, k: shake(.3) }), ...[['justified', 30], ['true', 70], ['believed', 110]].map(([l, x]) => g([box(x, 34, 20, 9, l, { fs: 2.9 }), ln(x + 10, 34, 80, 18, { c: 'soft', sw: .4 })], { ox: x + 10, oy: 43, k: l === 'justified' ? shake(.25) : [[0, { rot: 0 }]] })),
        g([box(2, 58, 46, 10, 'Gettier: a lucky true belief', { c: 'rubric', tc: 'rubric', fs: 2.9 }), ar(26, 58, 38, 44, { c: 'rubric', sw: .7 })], { o: 0, k: [[.15, { o: 0 }], [.2, { o: 1 }]] }), g([box(56, 58, 48, 10, 'revised: no false lemma', { c: 'verd', tc: 'verd', fs: 2.9 })], { o: 0, k: [[.45, { o: 0 }], [.5, { o: 1 }]] }),
        g([box(110, 72, 48, 10, 'fake barns: no lemma, still luck', { c: 'rubric', tc: 'rubric', fs: 2.7 }), ar(124, 72, 96, 68, { c: 'rubric', sw: .7 })], { o: 0, k: [[.65, { o: 0 }], [.7, { o: 1 }]] }), g([box(56, 58, 48, 10, 'revised: no false lemma', { c: 'verd', tc: 'verd', fs: 2.9 })], { ox: 80, oy: 68, o: 0, k: [[.7, { o: 0, rot: 0 }], [.72, { o: 1, rot: -5 }], [.74, { rot: 5 }], [.76, { rot: 0 }]] })],
        [[0, 'The claim stands on three premises.'], [.2, 'A counterexample strikes one premise: justification can reach the truth by luck…'], [.3, '…and the claim that leaned on it wobbles.'], [.5, 'A repair is proposed; the next counterexample attacks the repair.']], { dur: 14 }); })() },
  },
  'Data: evidence as a narrative': {
    S1: { intuition: (() => { const f = '316+0.8*(x-1960)+0.0132*(x-1960)^2', box2 = [12, 10, 80, 46], C = yr => M('curve', { box: box2, xr: [1960, 2023], yr, f, c: 'lapis', sw: .9, xl: 'year, 1960 → 2023', yl: 'CO₂ (ppm)' });
      return pair([C([310, 425]), tx(14, 8, 'ppm, axis from 310', { fs: 2.9, a: 'start', c: 'soft' }), stamp(52, 30, 'how big, relative to all?', .6)],
        [M('curve', { box: box2, xr: [1960, 2023], yr: [310, 425], f, c: 'lapis', sw: .9, xl: 'year, 1960 → 2023', yl: 'CO₂ (ppm)', k: [[.2, { yr: [310, 425] }], [.5, { yr: [0, 425] }], [.75, { yr: [0, 425] }], [.95, { yr: [310, 425] }]] }), tx(14, 8, 'same data, axis moving to zero and back', { fs: 2.9, a: 'start', c: 'soft' }), tx(52, 66, 'a third more, and accelerating: say which view', { fs: 3, c: 'verd' })],
        [[0, 'Carbon dioxide at Mauna Loa, 1960–2023 (smoothed).'], [.25, 'With the axis starting near 310 ppm the rise looks enormous; from zero it looks modest.'], [.6, 'Both are true: about a third more in absolute terms, and an accelerating slope. Show the view you mean, and say so.']], { dur: 12 }); })() },
    S2: { intuition: (() => { const F = y => 316 + .8 * (y - 1960) + .0132 * (y - 1960) ** 2, dec = [1960, 1970, 1980, 1990, 2000, 2010].map(y => F(y + 10) - F(y));
      return one([M('curve', { box: [10, 10, 64, 64], xr: [1960, 2020], yr: [300, 430], f: '316+0.8*(x-1960)+0.0132*(x-1960)^2', c: 'lapis', draw: 0, k: [[.03, { draw: 0 }], [.3, { draw: 1 }]], xl: 'year', yl: 'ppm' }),
        ...[1960, 1970, 1980, 1990, 2000, 2010].map((y, i) => ln(10 + (y - 1960) / 60 * 64, 74 - (F(y) - 300) / 130 * 64, 10 + (y + 10 - 1960) / 60 * 64, 74 - (F(y) - 300) / 130 * 64, { c: 'rubric', sw: .5, dash: '1 .8', on: [.32 + i * .03, 1] })),
        M('bars', { box: [90, 14, 64, 56], v: dec.map(() => 0), max: 30, labels: ['60s', '70s', '80s', '90s', '00s', '10s'], c: 'rubric', vl: true, xl: 'decade', k: [[.45, { v: dec.map(() => 0) }], [.75, { v: dec }]] }), tx(122, 10, 'rise per decade (ppm, smooth fit)', { fs: 3.2 })],
        [[0, 'Annual means: the level keeps climbing.'], [.3, 'Subtract each decade’s starting value…'], [.45, '…and plot the rise per decade.'], [.75, 'The bars grow decade after decade: the rate itself is speeding up, which the level hides.']], { dur: 13 }); })() },
  },
  'Discovery: predict, then see': {
    S1: { misconception: (() => { const items = [], N = 1000, cols = 40, s = 2.6; let fp = 0; const R = rng7(3), pos = []; for (let i = 0; i < N; i++) pos.push(i);
      const ill = new Set([37, 140, 233, 388, 451, 509, 612, 744, 851, 960]), detected = [...ill].slice(0, 9), falsePos = new Set(); while (falsePos.size < 99) { const k = Math.floor(R() * N); if (!ill.has(k)) falsePos.add(k); } void fp; void pos;
      for (let i = 0; i < N; i++) { const x = 10 + (i % cols) * s, y = 12 + Math.floor(i / cols) * s, I = ill.has(i), P = detected.includes(i) || falsePos.has(i); items.push(ci(x, y, .9, { f: I ? 'rubric' : 'mute', c: 'none', o: .9, k: [[.2, { o: .9 }], [.45, { o: P ? 1 : .9 }], [.6, { o: P ? 1 : .18 }]] })); if (P) items.push(ci(x, y, 1.35, { c: 'brass', sw: .4, on: [.42, 1] })); }
      return one([...items, tx(150, 20, '1000 people', { fs: 3.2, a: 'end' }), tx(150, 26, '10 ill (red)', { fs: 3.2, c: 'rubric', a: 'end', on: [.1, 1] }), tx(150, 40, 'positive (ringed):', { fs: 3.2, a: 'end', on: [.42, 1] }), tx(150, 46, '9 ill + 99 healthy', { fs: 3.2, a: 'end', on: [.45, 1] }), tx(150, 60, 'ill, given positive:', { fs: 3.2, a: 'end', on: [.62, 1] }), tx(150, 67, '9 / 108 ≈ 8 %', { fs: 4.2, b: true, c: 'rubric', a: 'end', on: [.65, 1] })],
        [[0, 'A thousand people; the illness is rare: 10 of them have it.'], [.25, 'The test is 90 % accurate: it catches 9 of the 10, and wrongly flags 10 % of the 990 healthy, 99 people.'], [.6, 'Among the 108 positives only 9 are ill: about 8 %, not 90 %. The rarity decides.']], { dur: 13 }); })() },
    S2: { misconception: (() => { const { W, H, frames } = schelling, cs = 4.6, items = [];
      for (let i = 0; i < W * H; i++) { const x = 8 + (i % W) * cs, y = 10 + Math.floor(i / W) * cs, K = frames.map((f, j) => [.05 + .8 * j / (frames.length - 1), { f: ['#f4ead2', '#2d5b8e', '#c9a35a'][f.c[i]] }]); items.push(rc(x, y, cs - .5, cs - .5, { rx: .6, c: 'none', f: K[0][1].f, k: K })); }
      return one([...items, M('num', { x: 128, y: 40, v: frames[0].a * 100, k: frames.map((f, j) => [.05 + .8 * j / (frames.length - 1), { v: f.a * 100 }]), pre: 'alike neighbours: ', suf: ' %', fs: 3.4 }), tx(128, 52, 'each household moves only', { fs: 3.1, c: 'soft' }), tx(128, 57, 'if under 34 % alike', { fs: 3.1, c: 'soft' }), tx(128, 66, 'mild rule, strong pattern', { fs: 3.4, c: 'rubric', on: [.8, 1] })],
        [[0, 'Two groups, mixed at random. Each household is content with a third of its neighbours like itself.'], [.3, 'Only the unhappy few move, one at a time…'], [.7, '…yet the town sorts itself into large blocks: a strong pattern from mild preferences.']], { dur: 13 }); })() },
    S3: { misconception: (() => { const Y = v => 76 - (v - 5) / 20 * 62, P = y => y.filter((_, i) => i % 5 === 0).flatMap((v, i) => [12 + i / 120 * 136, Y(v)]); const weak = thermoSim(.25, 4), strong = thermoSim(3, 4);
      return one([ln(12, Y(20), 148, Y(20), { c: 'verd', sw: .6, dash: '2 1.2' }), tx(148, Y(20) - 1.5, 'setpoint 20 °C', { fs: 3.1, c: 'verd', a: 'end' }), ln(12, 76, 148, 76, { c: 'soft', sw: .4 }), tx(148, 82, 'time →', { fs: 3, a: 'end', c: 'soft' }),
        po(P(weak), { c: 'lapis', sw: .8, draw: 0, k: [[.05, { draw: 0 }], [.8, { draw: 1 }]], lin: true }), po(P(strong), { c: 'rubric', sw: .8, draw: 0, k: [[.05, { draw: 0 }], [.8, { draw: 1 }]], lin: true }), tx(40, 84, 'blue: gentle controller', { fs: 3.1, c: 'lapis' }), tx(100, 84, 'red: strong controller', { fs: 3.1, c: 'rubric' }), tx(80, 8, 'the sensor reports 4 s late', { fs: 3.2 })],
        [[0, 'A heater controlled by a thermometer that reports 4 seconds late.'], [.3, 'A strong controller rushes the room up, but by the time the sensor says “enough” it is already too warm…'], [.6, '…so it overshoots and keeps ringing around the goal. The gentle one settles, though below the goal: the offset of a purely proportional controller.']], { dur: 13 }); })() },
    S4: { misconception: one([pa('M20 20H140V70H20Z', { c: 'ink', sw: .7 }), rc(16, 38, 8, 14, { f: '#fbf6ea', c: 'ink', sw: .5 }), tx(10, 46, '3 V', { fs: 3.2, a: 'end' }), ...[60, 100].map((x, i) => g([ci(x, 20, 5, { f: '#f4d58a', c: 'ink', sw: .5 }), tx(x, 12, i ? 'bulb 2' : 'bulb 1', { fs: 3 }), tx(x, 31, '1.5 V', { fs: 3, c: 'rubric' })])),
      M('along', { d: 'M20 70V20H140V70H20Z', n: 26, loop: 7, r: .9, c: 'lapis', gap: 1 / 26 }), ...[[40, 70], [120, 70]].map(([x, y]) => g([ci(x, y + 8, 4.5, { f: '#fbf6ea', c: 'ink', sw: .4 }), tx(x, y + 9.3, 'A', { fs: 3.2, b: true }), tx(x, y + 17, '0.5 A', { fs: 3.2, mono: true, c: 'verd' })]))],
      [[0, 'Two bulbs in series. Watch the charges: the same stream flows everywhere in the loop.'], [.35, 'Ammeters before and after the bulbs both read 0.5 A: no current is used up.'], [.6, 'What the bulbs share is the voltage, 1.5 V each: energy is handed over, the charge comes back.']], { dur: 12 }) },
  },
};

export const MOTION = {
  'The simple pendulum': PEND,
  'Weather glass, storm glass and barometer': WG,
  'From thrown stones to orbits': ORBIT,
  'Five laboratories': FIVE,
  'The derivative and its two faces': DERIV,
  'Linear maps, complex numbers and harmonics': LIN,
  'Collision theory and chemical equilibrium': COLL,
  'The water cycle': WATER,
  'Galton board': GALTON,
  'Supply and demand': MARKET,
  'Osmosis': OSMO,
  ...DOMAIN,
};

export function seedMotion(title, sid, slot) { const C = MOTION[title], s = C && C[sid]; return s ? s[slot] || null : null; }
