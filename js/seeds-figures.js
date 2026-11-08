// Teaching figures for the example library (docs/PEDAGOGY.md; figure specs: schema/figure.schema.json, drawn by
// js/room/diagrams.js renderFigure). Keyed like seeds-sources.js: chain title → step id →
//   explain: [{text, figure}]            explanatory paragraphs (each ≥ 60 words, so each has its figure)
//   intuition / misconception / check    text only where the step has none yet (seeds-sources.js G wins)
//   intuitionFigure / misconceptionFigure / checkFigure (→ check.figure, drawn only after the answer is revealed)
// Every number is worked out from the step itself (its parameters, its demo's settings) or from a cited reference in
// seeds-sources.js; captions and labels use the typesetter's plain notation (θ₀, √, ½), so they read the same in SVG.
// Merged into a chain by seeds-sources.js groundChain; saved example rooms receive it through main.js threadFromSeeds.

// ---- small builders
const sk = (caption, items, o = {}) => ({ kind: 'sketch', caption, w: 100, h: 60, items, ...o });
const T = (x, y, text, o = {}) => ({ shape: 'text', x, y, text, ...o });
const Ln = (x, y, x2, y2, o = {}) => ({ shape: 'line', x, y, x2, y2, ...o });
const Ar = (x, y, x2, y2, o = {}) => ({ shape: 'arrow', x, y, x2, y2, ...o });
const Ci = (x, y, r, o = {}) => ({ shape: 'circle', x, y, r, ...o });
const Rc = (x, y, w, h, o = {}) => ({ shape: 'rect', x, y, w, h, ...o });
const Pa = (d, o = {}) => ({ shape: 'path', d, ...o });
const plot = (caption, x, curves, o = {}) => ({ kind: 'plot', caption, x, curves: curves.map(c => typeof c === 'string' ? { expr: c } : c), ...o });
const C = (expr, label, o = {}) => ({ expr, label, ...o });
const bars = (caption, categories, series, o = {}) => ({ kind: 'bars', caption, categories, series: series.map(([name, values]) => ({ name, values })), ...o });
const contrast = (caption, wrong, right) => ({ kind: 'contrast', caption, wrong: { title: 'Mistaken', text: wrong }, right: { title: 'In fact', text: right } });
const flow = (caption, labels, o = {}) => ({ kind: 'flow', caption, nodes: labels.map((l, i) => ({ id: 'n' + i, label: l })), ...o });
const table = (caption, columns, rows, o = {}) => ({ kind: 'table', caption, columns, rows, ...o });
const nl = (caption, min, max, points, intervals = [], o = {}) => ({ kind: 'numberline', caption, min, max, points: points.map(([x, label]) => ({ x, label })), intervals: intervals.map(([from, to, label]) => ({ from, to, label })), ...o });
const tree = (caption, root) => ({ kind: 'tree', caption, root });
const nd = (label, children = [], edge) => ({ label, ...(edge != null ? { edge } : {}), children });
const sq = n => '4/PI*(' + Array.from({ length: n }, (_, i) => `sin(${2 * i + 1}*x)/${2 * i + 1}`).join('+') + ')';   // square-wave partial sum, odd k ≤ 2n − 1

export const FIGS = {
  // ======================================================================= the simple pendulum (L = 2 m, g = 9.81 m/s²)
  'The simple pendulum': {
    S1: {
      explain: [{ text: 'The model keeps only what decides the swing. The bob is so small that its size does not matter, the string weighs nothing and never stretches, and gravity is the same at every height the bob reaches. With these choices the bob can only move on a circle of radius $L$ about the pivot, so a problem in three dimensions shrinks to one number. The idealisation is good: a solid bob of radius $r$ lengthens the period only by a fraction of about $r^2/(5L^2)$, which for a 5 cm bob on the 2 m string of the demo is 0.01 %.',
        figure: sk('The ideal pendulum: a point bob of mass m on a string of length L = 2 m, confined to a circle about the pivot, in a uniform field g.', [Ln(50, 6, 70, 40.6), Ci(70, 40.6, 3, { tone: 'accent' }), Pa('M23.5 35.6 A40 40 0 0 0 76.5 35.6', { fill: 'none' }), Ln(50, 6, 50, 48), Ci(50, 6, 1.2), T(50, 3.5, 'pivot'), T(66, 22, 'L = 2 m'), T(78, 44, 'm'), Ar(90, 14, 90, 34), T(94, 26, 'g'), T(32, 54, 'path: circle of radius L')]) }],
      intuition: 'The string is a rail: whatever pushes the bob, it can only slide along one circle, like a bead threaded on a hoop.',
      intuitionFigure: sk('A bead on a hoop moves exactly like the bob: the string, like the hoop, allows motion only along the circle.', [Ci(50, 30, 22, { fill: 'none' }), Ci(65.6, 45.6, 3, { tone: 'accent' }), Ar(65.6, 45.6, 73, 38, { tone: 'accent' }), Ar(65.6, 45.6, 58, 53, { tone: 'accent' }), T(83, 34, 'allowed'), T(50, 4, 'hoop = string of length L'), Ar(65.6, 45.6, 60, 40), T(52, 40, 'blocked')]),
      misconception: 'That the string pulls the bob along its path. The tension always points at the pivot, across the path, so it only keeps the bob on the circle and does no work.',
      misconceptionFigure: contrast('Tension and the path are always at right angles, so tension never speeds the bob up or slows it down.', 'The string drags the bob along the arc, speeding it up on the way down.', 'Tension points at the pivot, perpendicular to the motion: its work over any swing is 0 J. Only gravity changes the speed.'),
      check: { q: 'Why can a single number describe where the bob is?', a: 'The taut, inextensible string keeps the bob exactly L from the pivot, so in the plane of the swing it lives on a circle; one angle fixes the point on that circle.' },
      checkFigure: flow('From the constraint to one coordinate.', ['string taut and inextensible', 'bob always L = 2 m from the pivot', 'bob on a circle', 'one angle θ fixes the position']),
    },
    S2: {
      explain: [{ text: 'Measuring the swing by the angle $\\theta$ instead of by $x$ and $y$ builds the constraint in. An arc of a circle has length $s = L\\theta$ when $\\theta$ is in radians, so the 2 m pendulum released at 40° (0.698 rad) starts 1.40 m along the arc from the bottom. Because $L$ is fixed, the speed along the path is $L$ times the rate of turning, $\\dot s = L\\dot\\theta$, and the tangential acceleration is $\\ddot s = L\\ddot\\theta$. Radians make these relations this simple; in degrees every one of them would carry a factor π/180.',
        figure: plot('Arc length s = Lθ for L = 2 m: a straight line in θ (radians). The demo’s 40° release is 0.698 rad, 1.40 m along the arc.', [0, 0.8], [C('2*x', 's = 2θ')], { points: [[0.698, 1.396, '40°: 1.40 m'], [0.1396, 0.279, '8°: 0.28 m']], xlabel: 'θ (rad)', ylabel: 's (m)' }) }],
      intuition: 'Unroll the arc onto a ruler: θ says how many string-lengths along it the bob has travelled from the bottom.',
      intuitionFigure: sk('Unrolling the arc: the bob’s 1.40 m of arc at 40° laid flat is 0.698 string-lengths of 2 m.', [Ln(50, 6, 70, 40.6), Ci(70, 40.6, 2.5, { tone: 'accent' }), Pa('M50 46 A40 40 0 0 0 70 40.6', { fill: 'none' }), Ln(50, 6, 50, 46), Ln(10, 54, 90, 54), Ln(10, 51, 10, 57), Ln(38, 51, 38, 57, { tone: 'accent' }), Ln(90, 51, 90, 57), T(24, 50, 's = 1.40 m'), T(72, 50, 'L = 2 m mark at 50'), T(60, 30, 'θ = 0.698')]),
      misconception: 'Putting degrees into s = Lθ. At 40°, 2 m × 40 = 80 m is absurd; the formula needs radians: 2 m × 0.698 = 1.40 m.',
      misconceptionFigure: contrast('s = Lθ holds only with θ in radians (1 rad = 57.3°).', 'θ = 40, so s = 2 m × 40 = 80 m along the arc.', 'θ = 40° = 0.698 rad, so s = 2 m × 0.698 = 1.40 m.'),
      check: { q: 'The 2 m pendulum swings out to 8°. How long is the arc from the bottom to the turning point?', a: '8° = 0.140 rad, so s = 2 m × 0.140 ≈ 0.28 m.' },
      checkFigure: nl('Arc length from the bottom for the 2 m pendulum (m): 8° gives 0.28 m, 40° gives 1.40 m.', 0, 1.6, [[0.279, '8°'], [1.396, '40°']], [], { step: 0.2 }),
    },
    S3: {
      explain: [{ text: 'Two forces act on the bob: its weight $mg$, straight down, and the string tension, along the string. The tension is always perpendicular to the circle, so it has no component along the path. Split the weight into a part along the string, $mg\\cos\\theta$, which the tension balances or exceeds, and a part along the tangent, $mg\\sin\\theta$, pointing back towards the bottom; the minus sign in $F_t = -mg\\sin\\theta$ records that it always opposes the displacement. At 40° a 1 kg bob feels a restoring force of 9.81 × sin 40° ≈ 6.3 N.',
        figure: sk('Splitting the weight at θ = 40°: the tangential part mg sin θ (6.3 N for 1 kg) restores; the part along the string, mg cos θ (7.5 N), is taken up by the tension.', [Ln(40, 4, 62, 30), Ci(62, 30, 2.6, { tone: 'accent' }), Ar(62, 30, 62, 56), T(66, 52, 'mg = 9.81 N'), Ar(62, 30, 49.4, 40.6, { tone: 'accent' }), T(44, 47, 'mg sin θ = 6.3 N'), Ar(62, 30, 74.6, 44.9), T(86, 40, 'mg cos θ = 7.5 N'), Ar(62, 30, 51, 17), T(42, 22, 'tension'), Ln(40, 4, 40, 30), T(46, 12, 'θ')]) }],
      intuition: 'Tilt the string and a share of the weight starts pulling the bob back; the steeper the string, the bigger the share, up to all of it when the string is horizontal.',
      intuitionFigure: plot('The restoring share of the weight, sin θ, grows with the angle and reaches 1 at 90°.', [0, 180], [C('sin(x*PI/180)', 'F_t/mg = sin θ')], { points: [[40, 0.643, '40°: 0.64'], [90, 1, '90°: all of it']], xlabel: 'θ (degrees)', ylabel: '|F_t|/mg' }),
      misconception: 'That the tension pulls the bob back to the bottom. The tension is perpendicular to the path; only the weight’s tangential component, mg sin θ, restores.',
      misconceptionFigure: contrast('Which force brings the bob back?', 'The string’s tension pulls the bob back towards the lowest point.', 'Tension is perpendicular to the path and cannot push along it; the restoring force is the weight’s tangential part, −mg sin θ.'),
      check: { q: 'What restoring force acts on a 0.5 kg bob at θ = 30°?', a: 'F_t = −mg sin θ = −0.5 × 9.81 × 0.5 ≈ −2.45 N, directed towards the bottom.' },
      checkFigure: bars('Restoring force on a 0.5 kg bob, 0.5 × 9.81 × sin θ, at four angles; 30° gives 2.45 N.', ['10°', '20°', '30°', '40°'], [['|F_t| (N)', [0.852, 1.678, 2.453, 3.153]]], { highlight: [2], ylabel: 'N' }),
    },
    S4: {
      explain: [{ text: 'Putting the kinematics and the force law together gives $mL\\ddot\\theta = -mg\\sin\\theta$. The mass appears on both sides: once as inertia, the resistance to being accelerated, and once in the weight, the strength of gravity’s pull. Dividing by $mL$ leaves $\\ddot\\theta = -(g/L)\\sin\\theta$, with no $m$ in it at all. For the 2 m pendulum g/L = 4.905 s⁻², so at 40° the angular acceleration is about −3.15 rad/s². The equation is nonlinear because of sin θ, which is why the next step approximates it for small angles.',
        figure: plot('Angular acceleration of the 2 m pendulum, −(g/L) sin θ with g/L = 4.905 s⁻², against the angle; at 40° (0.698 rad) it is −3.15 rad/s².', [-3.14, 3.14], [C('-4.905*sin(x)', 'θ̈ = −4.905 sin θ')], { points: [[0.698, -3.153, '40°']], hlines: [{ y: 0, label: '' }], xlabel: 'θ (rad)', ylabel: 'θ̈ (rad/s²)' }) }],
      intuition: 'A heavy bob is harder to accelerate but pulled harder in exactly the same proportion, so a lead bob and a wooden bob of the same size swing together.',
      intuitionFigure: bars('Angular acceleration at 40° for three bob masses on the 2 m string: the same −3.15 rad/s² each time, because m cancels.', ['0.1 kg', '1 kg', '10 kg'], [['|θ̈| (rad/s²)', [3.153, 3.153, 3.153]]], { ylabel: 'rad/s²' }),
      misconception: 'That a heavier bob swings faster. Mass cancels: θ̈ depends only on g, L and θ (air drag aside).',
      misconceptionFigure: contrast('Mass appears as inertia and as weight, and the two cancel.', 'A 10 kg bob is pulled ten times harder, so it swings faster than a 1 kg bob.', 'It is pulled ten times harder but is also ten times harder to accelerate: θ̈ = −(g/L) sin θ for both.'),
      check: { q: 'On the Moon (g = 1.62 m/s²), what is g/L for the same 2 m pendulum, and what does it mean for the swing?', a: 'g/L = 0.81 s⁻², about a sixth of Earth’s 4.905 s⁻²: the same angle gives a sixth of the angular acceleration, and the period is √6 ≈ 2.45 times longer.' },
      checkFigure: bars('g/L for a 2 m pendulum on the Earth and on the Moon.', ['Earth', 'Moon'], [['g/L (s⁻²)', [4.905, 0.81]]], { ylabel: 's⁻²' }),
    },
    S5: {
      explain: [{ text: 'How good is $\\sin\\theta\\approx\\theta$? The first neglected term is $\\theta^3/6$, so the relative error is about $\\theta^2/6$. At 10° (0.175 rad) sin θ = 0.1736 against θ = 0.1745, an error of 0.5 %; at 20° it is 2.0 %; at 40° it has grown to 7.9 %. The approximation makes the equation of motion linear, and linear equations can be solved exactly and their solutions added. Most textbook results about pendulums, including the familiar period formula, hold only in this small-angle regime.',
        figure: bars('Relative error of sin θ ≈ θ, (θ − sin θ)/θ, at five release angles.', ['5°', '10°', '20°', '30°', '40°'], [['error (%)', [0.127, 0.507, 2.02, 4.51, 7.93]]], { highlight: [4], ylabel: '%' }) }],
      intuitionFigure: plot('Below about 0.3 rad (17°) the line θ and the curve sin θ are hard to tell apart: the restoring push is proportional to the displacement, as for a spring.', [0, 1.2], [C('x', 'θ'), C('sin(x)', 'sin θ')], { vlines: [{ x: 0.3, label: '17°' }], xlabel: 'θ (rad)' }),
      misconceptionFigure: bars('Small-swing period of a 2 m pendulum, 2π√(L/g), for three bob masses: 2.84 s each.', ['0.1 kg', '1 kg', '10 kg'], [['T₀ (s)', [2.837, 2.837, 2.837]]], { ylabel: 's' }),
      checkFigure: plot('First correction to the period, T/T₀ ≈ 1 + θ₀²/16: +0.03 % at 4°, +0.12 % at 8°.', [0, 20], [C('1+(x*PI/180)^2/16', 'T/T₀')], { points: [[4, 1.0003, '4°'], [8, 1.0012, '8°: +0.12 %']], xlabel: 'θ₀ (degrees)' }),
    },
    S6: {
      explain: [{ text: 'With sin θ replaced by θ the equation becomes $\\ddot\\theta = -\\omega_0^2\\theta$: the angular acceleration is proportional to the displacement and opposite to it, the mark of simple harmonic motion. A cosine has exactly this property, since differentiating it twice returns minus itself times $\\omega_0^2$. Released from rest at 8°, the 2 m pendulum follows θ(t) = 8° cos(2.215 t) and returns after T₀ = 2π/ω₀ = 2.84 s. The period depends only on L and g; a seconds pendulum, with T₀ = 2 s, is 0.994 m long, and clockmakers regulate one by moving the bob along its rod.',
        figure: plot('θ(t) = 8° cos(ω₀t) for the 2 m pendulum, ω₀ = √(g/L) = 2.215 rad/s; one period T₀ = 2.84 s.', [0, 6], [C('8*cos(2.2147*x)', 'θ (degrees)')], { vlines: [{ x: 2.837, label: 'T₀ = 2.84 s' }], xlabel: 't (s)', ylabel: 'θ (°)' }) }],
      intuition: 'Like a mass on a spring: pulled out further, it is pulled back harder, so a 4° swing and an 8° swing take the same time.',
      intuitionFigure: plot('Released at 8° and at 4°, the 2 m pendulum keeps step: both return after 2.84 s.', [0, 6], [C('8*cos(2.2147*x)', 'θ₀ = 8°'), C('4*cos(2.2147*x)', 'θ₀ = 4°')], { xlabel: 't (s)', ylabel: 'θ (°)' }),
      misconception: 'That the period is proportional to the length. It grows like √L: a pendulum four times longer swings only twice as slowly.',
      misconceptionFigure: plot('T₀ = 2π√(L/g) grows like √L: 2 s at 0.994 m, 2.84 s at 2 m, 4.01 s at 4 m.', [0, 4.2], [C('2*PI*sqrt(x/9.81)', 'T₀ (s)')], { points: [[0.994, 2, 'seconds pendulum'], [2, 2.837, '2 m'], [4, 4.012, '4 m']], xlabel: 'L (m)', ylabel: 's' }),
      check: { q: 'What length gives a small-swing period of exactly 1 s on Earth?', a: 'L = gT²/(4π²) = 9.81/39.48 ≈ 0.248 m, about 25 cm.' },
      checkFigure: nl('Lengths for three small-swing periods: 1 s at 0.248 m, 2 s at 0.994 m, 2.84 s at 2 m.', 0, 2.2, [[0.248, 'T₀ = 1 s'], [0.994, '2 s'], [2, '2.84 s']], [], { step: 0.5 }),
    },
    S7: {
      explain: [{ text: 'Multiplying the equation of motion by $\\dot\\theta$ turns each term into a time derivative, so their sum cannot change: the kinetic energy $\\tfrac12 mL^2\\dot\\theta^2$ plus the potential energy $mgL(1-\\cos\\theta)$, measured from the lowest point. A 1 kg bob on the 2 m string released at 40° starts 2 × (1 − cos 40°) = 0.468 m above the bottom with 4.59 J, all potential. At the bottom all of it is kinetic, so the speed there is √(2 × 9.81 × 0.468) = 3.03 m/s. Each value of E draws one closed curve in the phase plane; above 2mgL = 39.2 J the bob goes over the top and the curves no longer close.',
        figure: plot('Potential energy mgL(1 − cos θ) of a 1 kg bob on a 2 m string. Released at 40° with E = 4.59 J it turns back at ±0.698 rad; above 2mgL = 39.2 J it would loop over the top.', [-3.2, 3.2], [C('19.62*(1-cos(x))', 'mgL(1 − cos θ)')], { hlines: [{ y: 4.59, label: 'E = 4.59 J' }, { y: 39.24, label: '2mgL = 39.2 J' }], vlines: [{ x: -0.698, label: '' }, { x: 0.698, label: '40°' }], xlabel: 'θ (rad)', ylabel: 'J' }) }],
      intuition: 'A ball rolling in a bowl: it climbs back to the height it started from, trading height for speed and speed for height.',
      intuitionFigure: bars('Energy of the 1 kg bob released at 40° on the 2 m string: the split changes, the 4.59 J total does not.', ['at 40°', 'at 20°', 'at 0°'], [['potential (J)', [4.59, 1.183, 0]], ['kinetic (J)', [0, 3.407, 4.59]]], { ylabel: 'J' }),
      misconception: 'That energy is used up at the bottom, where the bob is fastest. In the ideal model the total stays 4.59 J at every point; only the split between kinetic and potential changes. Real pendulums lose a little to air drag and the pivot.',
      misconceptionFigure: contrast('Where does the energy go during a swing?', 'The bob spends its energy on the way down and has to get it back on the way up.', 'Potential becomes kinetic and back again; the sum E = 4.59 J stays the same all the way (no friction in the model).'),
      check: { q: 'At what speed does the 2 m pendulum released from 40° pass the bottom?', a: 'v = √(2gL(1 − cos 40°)) = √(2 × 9.81 × 0.468) ≈ 3.03 m/s, whatever the mass.' },
      checkFigure: plot('Speed at the bottom against release angle for L = 2 m, v = √(2gL(1 − cos θ₀)); 3.03 m/s from 40°.', [0, 90], [C('sqrt(2*9.81*2*(1-cos(x*PI/180)))', 'v at the bottom (m/s)')], { points: [[40, 3.03, '40°: 3.03 m/s']], xlabel: 'θ₀ (degrees)', ylabel: 'm/s' }),
    },
    S8: {
      explain: [{ text: 'Energy conservation gives $\\dot\\theta$ as a function of $\\theta$, so the time for a quarter swing is the integral of $d\\theta/\\dot\\theta$ from 0 to $\\theta_0$. It cannot be done with elementary functions: it is the complete elliptic integral $K(k)$ with $k = \\sin(\\theta_0/2)$. The exact period exceeds T₀ by 3.1 % at 40°, 7.3 % at 60°, 18 % at 90° and 76 % at 150°, the demo’s large swing. Near 180°, where the bob would balance upside down, the period grows without bound. The series 1 + θ₀²/16 + 11θ₀⁴/3072 follows the exact values well up to about 90°.',
        figure: plot('T/T₀ against amplitude: the series 1 + θ₀²/16 + 11θ₀⁴/3072 (line) and the exact elliptic-integral values (points).', [0, 160], [C('1+(x*PI/180)^2/16+11*(x*PI/180)^4/3072', 'series to θ₀⁴')], { points: [[40, 1.0313, '40°'], [60, 1.0732, '60°'], [90, 1.1803, '90°'], [120, 1.3729, '120°'], [150, 1.7622, '150°']], pointsLabel: 'exact', xlabel: 'θ₀ (degrees)', ylabel: 'T/T₀' }) }],
      intuitionFigure: plot('Angular speed against angle for the 2 m pendulum, θ̇ = √(2(g/L)(cos θ − cos θ₀)): released at 150° the bob crawls near the turning point, where it spends most of its time.', [0, 150], [C('sqrt(max(0,9.81*(cos(x*PI/180)-cos(150*PI/180))))', 'θ₀ = 150°'), C('sqrt(max(0,9.81*(cos(x*PI/180)-cos(40*PI/180))))', 'θ₀ = 40°')], { xlabel: 'θ (degrees)', ylabel: 'θ̇ (rad/s)' }),
      misconceptionFigure: bars('Exact period of the 2 m pendulum (T₀ = 2.84 s) at four amplitudes: isochronous only for small swings.', ['10°', '40°', '90°', '150°'], [['T (s)', [2.842, 2.926, 3.349, 4.999]]], { ylabel: 's', highlight: [3] }),
      checkFigure: nl('T/T₀ at four amplitudes: 1.031 at 40°, 1.073 at 60°, 1.180 at 90°.', 1, 1.25, [[1, 'small'], [1.031, '40°'], [1.073, '60°'], [1.18, '90°']], [], { step: 0.05 }),
    },
  },
  // ======================================================================= the weather glass
  'Weather glass, storm glass and barometer': {
    S1: {
      explain: [{ text: 'Air has weight. A column of air one square metre in cross-section, from sea level to the top of the atmosphere, has a mass of about 10 300 kg, and its weight presses on that square metre: 101 325 Pa, or 1013.25 hPa. Pressure falls with height because less air lies above; at 5.6 km it is half the sea-level value, at the summit of Everest about 314 hPa, less than a third. Weather changes the surface pressure by only a few per cent, typically between 980 and 1040 hPa, and those small changes are what a barometer reads.',
        figure: plot('Pressure against height in the standard atmosphere, 1013.25 (1 − 0.0226 h)^5.256 hPa (h in km): half at 5.6 km, 314 hPa at Everest’s 8.85 km.', [0, 11], [C('1013.25*pow(1-0.0225577*x,5.25588)', 'P (hPa)')], { points: [[5.57, 500, '500 hPa'], [8.85, 314, 'Everest']], xlabel: 'height (km)', ylabel: 'hPa' }) }],
      intuition: 'We live at the bottom of an ocean of air: every square centimetre of skin carries the weight of about 1 kg of air above it.',
      intuitionFigure: sk('The air column above one square metre at sea level: about 10 300 kg, pressing with 101 325 N.', [Rc(38, 4, 24, 42, { tone: 'muted' }), T(50, 18, 'air column'), T(50, 26, '≈ 10 300 kg'), Ar(50, 34, 50, 50, { tone: 'accent' }), Rc(30, 50, 40, 5), T(50, 58, '1 m² at sea level: 101 325 Pa')]),
      misconception: 'That air pressure only pushes downwards, like a weight. In a fluid at rest pressure acts equally in all directions, which is why an evacuated can is crushed from the sides too.',
      misconceptionFigure: contrast('Pressure in a fluid at rest has no preferred direction.', 'Atmospheric pressure presses down on things from above, like a weight resting on them.', 'At any point the air pushes equally in every direction: 1013 hPa on the top, the sides and the underside of a book alike.'),
      check: { q: 'What force does the atmosphere exert on a 30 cm × 20 cm book cover at sea level?', a: 'F = PA = 101 325 Pa × 0.06 m² ≈ 6.1 kN, balanced by the same pressure on the other side.' },
      checkFigure: table('Force of 101 325 Pa on three areas.', ['area', 'force'], [['1 cm²', '10.1 N'], ['book cover, 0.06 m²', '6.1 kN'], ['1 m²', '101 kN']], { highlight: [[1, 1]] }),
    },
    S2: {
      explain: [{ text: 'Take a thin horizontal slab of fluid at rest. The pressure on its underside must exceed the pressure on its top by just enough to carry the slab’s weight, $\\rho g\\,\\Delta h$ per unit area. Stacking slabs gives $\\Delta P = \\rho g\\,\\Delta h$: pressure grows linearly with depth in any fluid of constant density. In water (ρ = 1000 kg/m³) each 10.3 m adds one atmosphere; in mercury (13 595 kg/m³) 0.76 m does the same. The shape of the container does not matter, only the depth, which is why every connected arm of a vessel fills to the same level.',
        figure: plot('Pressure against depth below an open surface at 101.3 kPa: water gains 9.8 kPa per metre, mercury 133 kPa per metre and doubles the pressure at 0.76 m.', [0, 1], [C('101.325+9.807*x', 'water'), C('101.325+133.32*x', 'mercury')], { hlines: [{ y: 202.65, label: '2 atm' }], xlabel: 'depth (m)', ylabel: 'P (kPa)' }) }],
      intuition: 'Each layer of fluid carries the weight of all the layers above it, like the bottom book in a stack.',
      intuitionFigure: sk('Each slab carries all the slabs above: the pressure on the deepest is the largest.', [Rc(30, 6, 40, 10, { tone: 'muted' }), Rc(30, 18, 40, 10, { tone: 'muted' }), Rc(30, 30, 40, 10, { tone: 'muted' }), Rc(30, 42, 40, 10, { tone: 'accent' }), Ar(80, 8, 80, 52), T(90, 30, 'depth'), T(18, 11, 'P₀'), T(16, 47, 'P₀ + 3ρgΔh')]),
      misconception: 'That a big lake pushes harder on its dam than a small pond of the same depth. Pressure depends only on depth: 10 m down it is about 98 kPa above atmospheric whatever the lake’s size; only the total force grows with the dam’s width.',
      misconceptionFigure: contrast('Pressure depends on depth, not on how much water there is.', 'A reservoir 10 km long presses harder on its dam than a 10 m pond of the same depth.', 'At 10 m depth both give ρgh = 1000 × 9.81 × 10 ≈ 98 kPa; the long lake behind the dam adds nothing.'),
      check: { q: 'How much does the pressure rise 5 m under a lake surface?', a: 'ΔP = 1000 × 9.81 × 5 ≈ 49 kPa, about half an atmosphere.' },
      checkFigure: nl('Depth under water (m): 49 kPa extra at 5 m, one atmosphere extra at 10.3 m.', 0, 12, [[5, '+49 kPa'], [10.33, '+1 atm']], [], { step: 2 }),
    },
    S3: {
      explain: [{ text: 'Fill a glass tube about a metre long with mercury, close the open end, turn it over into a dish of mercury and open it: the column sinks until it stands about 760 mm above the dish, leaving an almost empty space at the top (Torricelli, 1643). Nothing pulls the mercury up; the air pressing on the open dish pushes it up until the column’s weight per unit area equals the atmospheric pressure. A water barometer would need a 10.3 m tube, which is why the 13.6 times denser mercury was used. A change of 30 hPa in the weather moves the column by about 22 mm.',
        figure: sk('Torricelli’s barometer: air pressure on the dish holds up a 760 mm mercury column; above it, a near-vacuum.', [Rc(44, 4, 12, 48, { fill: 'none' }), Rc(44, 4, 12, 9, { tone: 'muted' }), Rc(44, 13, 12, 39, { tone: 'accent' }), Rc(24, 46, 52, 10, { tone: 'accent' }), T(70, 9, 'vacuum'), Ln(62, 13, 62, 46), T(76, 30, 'h = 760 mm'), Ar(18, 34, 26, 45), Ar(84, 34, 76, 45), T(14, 30, 'P_atm'), T(86, 30, 'P_atm')]) }],
      intuition: 'The air and the mercury are on a balance: the column rises until its weight per square metre matches the weight of the air column outside.',
      intuitionFigure: bars('Height of a liquid column that 101 325 Pa holds up: the denser the liquid, the shorter the column.', ['mercury', 'water', 'ethanol'], [['height (m)', [0.76, 10.33, 13.09]]], { ylabel: 'm' }),
      misconception: 'That the vacuum at the top sucks the mercury up. A vacuum exerts no force; the outside air pushes the column up.',
      misconceptionFigure: contrast('What holds the mercury up?', 'The empty space at the top of the tube sucks the mercury upwards.', 'Empty space exerts no force at all; the air pushing on the open dish lifts the column until ρgh = P_atm.'),
      check: { q: 'The column falls from 760 mm to 745 mm. How much has the pressure dropped?', a: 'ΔP = ρgΔh = 13 595 × 9.81 × 0.015 ≈ 2.0 kPa = 20 hPa, a strong fall that often heralds a storm.' },
      checkFigure: plot('Pressure read from a mercury column: 1.333 hPa per millimetre; 760 mm → 1013 hPa, 745 mm → 993 hPa.', [700, 800], [C('1.33322*x', 'P (hPa)')], { points: [[760, 1013.25, '760 mm'], [745, 993.25, '745 mm']], xlabel: 'h (mm)', ylabel: 'hPa' }),
    },
    S4: {
      explain: [{ text: 'Air trapped in a sealed flask keeps its amount $n$ and, if the walls are rigid, its volume $V$. The ideal gas law $PV = nRT$ then makes the pressure proportional to the absolute temperature. Absolute matters: warming from 15 °C to 25 °C is a rise from 288.15 K to 298.15 K, which raises the pressure by 3.5 %, not by two thirds. Near room temperature a sealed volume of air at 1013 hPa gains about 3.5 hPa for every kelvin, as much as the weather changes the outside pressure in an hour of a fast fall.',
        figure: plot('Pressure of air sealed at 1013 hPa and 15 °C in a rigid flask, P = 1013 × T/288.15 K: 1048 hPa at 25 °C.', [-10, 40], [C('1013*(x+273.15)/288.15', 'P (hPa)')], { points: [[15, 1013, '15 °C'], [25, 1048.2, '25 °C']], xlabel: 'T (°C)', ylabel: 'hPa' }) }],
      intuition: 'Faster molecules hit the walls harder and more often; in a box that cannot grow, all a temperature rise can do is raise the pressure.',
      intuitionFigure: flow('Why heating a sealed flask raises its pressure.', ['the flask warms', 'molecules move faster', 'harder, more frequent hits on the walls', 'pressure rises ≈ 3.5 hPa per K']),
      misconception: 'Using degrees Celsius in P/T = constant. Going from 10 °C to 20 °C does not double the pressure; in kelvin it is 283 K → 293 K, a 3.5 % rise.',
      misconceptionFigure: contrast('Gas laws need absolute temperature.', '10 °C → 20 °C doubles T, so the sealed pressure doubles to about 2000 hPa.', '283.15 K → 293.15 K is a 3.5 % rise: about 1013 → 1049 hPa.'),
      check: { q: 'A flask sealed at 1013 hPa and 15 °C warms to 30 °C. What is its pressure?', a: 'P = 1013 × 303.15/288.15 ≈ 1066 hPa.' },
      checkFigure: nl('Sealed-flask pressure (hPa) at 15 °C and at 30 °C.', 1000, 1080, [[1013, '15 °C'], [1066, '30 °C']], [], { step: 20 }),
    },
    S5: {
      explain: [{ text: 'The weather glass is a flask of trapped air whose water-filled spout opens to the outside. If the outside pressure $P$ falls below the pressure of the trapped air, the water is pushed up the spout until the extra water column makes up the difference. Each hectopascal of difference lifts the water by 100/(1000 × 9.81) m ≈ 10.2 mm, so the glass is very sensitive: a fall from 1013 to 990 hPa at constant temperature would raise the spout level by about 23 cm, more than many spouts are tall. A glass 5 K warmer than when it was sealed reads as if the pressure were 17.6 hPa lower.',
        figure: plot('Ideal spout height Δh = (P₀T/T₀ − P)/(ρg) for a glass sealed at 1013 hPa and 15 °C: 23 cm at 990 hPa; 5 K warmer the whole line moves up by 18 cm.', [980, 1035], [C('(1013-x)*1.0194', 'at 15 °C'), C('(1030.58-x)*1.0194', 'at 20 °C')], { points: [[990, 23.4, '990 hPa']], hlines: [{ y: 0, label: '' }], xlabel: 'outside P (hPa)', ylabel: 'Δh (cm)' }) }],
      intuition: 'A balance between the air sealed in the bulb and the air outside, with the water in the spout as its pointer.',
      intuitionFigure: sk('The weather glass: trapped air in the bulb, water in the spout open to the outside air; the level difference Δh measures the pressure difference.', [Ci(40, 38, 16, { tone: 'muted' }), Pa('M24 44 A16 16 0 0 0 56 44 L24 44 Z', { fill: '#9fc3d8' }), Pa('M54 40 L80 16', { fill: 'none' }), Ln(80, 16, 84, 12), T(40, 33, 'trapped air P_in'), T(88, 8, 'outside P'), Ln(60, 44, 74, 44), Ln(70, 22, 80, 22), T(84, 33, 'Δh'), Ar(78, 42, 78, 24)]),
      misconception: 'That a high water level in the spout means fair weather. It is the reverse: the level rises when the outside pressure falls (or the glass warms).',
      misconceptionFigure: contrast('Which way does the spout move before bad weather?', 'High water in the spout means high pressure and fair weather.', 'The water rises when the outside pressure falls below the trapped air’s: 10 mm per hPa of fall, a sign of worsening weather.'),
      check: { q: 'At constant temperature the outside pressure falls by 10 hPa. How far does the water rise in the spout?', a: 'Δh = 1000 Pa/(1000 kg/m³ × 9.81 m/s²) ≈ 0.10 m, about 10 cm.' },
      checkFigure: bars('Spout rise for three pressure falls at constant temperature (10.2 mm per hPa).', ['5 hPa', '10 hPa', '20 hPa'], [['rise (cm)', [5.1, 10.2, 20.4]]], { highlight: [1], ylabel: 'cm' }),
    },
    S6: {
      explain: [{ text: 'In the formula for Δh, temperature and outside pressure enter together through $P_0T/T_0 - P$. Warming the trapped air by 1 K raises its pressure by $P_0/T_0$ ≈ 1013/288 = 3.5 hPa, exactly what a fall of 3.5 hPa outside would do. A sunny window sill that warms the glass by 5 K therefore mimics a pressure drop of 18 hPa, the size of a passing depression. A weather glass can be read as a barometer only if it stays at one temperature, or if a thermometer beside it is used to correct the reading.',
        figure: bars('Apparent pressure fall produced by warming the glass (3.5 hPa per kelvin).', ['1 K', '2 K', '5 K', '10 K'], [['apparent fall (hPa)', [3.5, 7.0, 17.6, 35.2]]], { highlight: [2], ylabel: 'hPa' }) }],
      intuition: 'The glass cannot tell a warmer room from a lower pressure outside: both make the trapped air push harder than the air outside.',
      intuitionFigure: flow('Two different causes, one reading.', ['glass warms by 5 K', 'outside pressure falls 17.6 hPa', 'trapped air 17.6 hPa above outside', 'water rises ≈ 18 cm'], { edges: [{ from: 'n0', to: 'n2' }, { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }] }),
      misconception: 'That the weather glass measures the weather alone. Any temperature change of the bulb gives a false pressure signal of 3.5 hPa per kelvin.',
      misconceptionFigure: contrast('What does a rising spout tell you?', 'The spout rose, so the pressure outside must have fallen.', 'Either the pressure fell or the glass warmed (3.5 hPa per K); without a thermometer the two cannot be told apart.'),
      check: { q: 'The water rose 7 cm overnight, but the room cooled by 3 K. What happened outside?', a: 'Cooling alone would have lowered the level by about 10.7 cm (3 K × 3.5 hPa = 10.5 hPa); a 7 cm rise therefore means the outside pressure fell by about 6.9 + 10.5 ≈ 17 hPa.' },
      checkFigure: table('Untangling the night’s reading (10.2 mm of spout per hPa).', ['effect', 'pressure', 'spout'], [['room cooled 3 K', '−10.5 hPa inside', '−10.7 cm'], ['observed', '', '+7 cm'], ['outside fall needed', '−17.4 hPa outside', '+17.7 cm']], { highlight: [[2, 1]] }),
    },
    S7: {
      explain: [{ text: 'Camphor dissolves in the storm glass’s ethanol–water mixture only up to a limit, the solubility $S(T)$, which rises steeply with temperature; in this scroll’s model by a factor $e^{0.065}$ ≈ 1.07 for every kelvin, so 10 K of warming lets the liquid hold almost twice as much ($e^{0.65}$ = 1.92). The supersaturation $\\sigma = c/S(T) - 1$ compares what is dissolved with what can stay dissolved. A sealed glass holds a fixed total of camphor, so a cold night that lowers S makes σ positive and drives camphor out of solution.',
        figure: plot('The model’s solubility S(T)/S(16 °C) = e^(0.065(T − 16)) against the glass’s camphor content c = 1.1 S(16 °C): supersaturated (σ > 0) below 17.5 °C.', [-5, 35], [C('exp(0.065*(x-16))', 'S(T)/S(16 °C)')], { hlines: [{ y: 1.1, label: 'c = 1.1' }], vlines: [{ x: 17.5, label: 'σ = 0 at 17.5 °C' }], xlabel: 'T (°C)' }) }],
      intuition: 'A sponge that shrinks as it cools: the liquid can hold only so much camphor, and colder liquid holds less.',
      intuitionFigure: bars('Model solubility at four temperatures, relative to 16 °C (a factor 1.07 per kelvin).', ['0 °C', '10 °C', '20 °C', '30 °C'], [['S/S(16 °C)', [0.353, 0.677, 1.297, 2.486]]]),
      misconception: 'That crystals appear whenever there is a lot of camphor. What matters is the amount compared with the solubility at the present temperature: the same liquid is clear at 25 °C and full of crystals at 5 °C.',
      misconceptionFigure: contrast('Crystals depend on c/S(T), not on c alone.', 'Lots of dissolved camphor means crystals.', 'With c = 1.1 S(16 °C): at 25 °C σ = −0.38, clear; at 5 °C σ = +1.25, crystals grow.'),
      check: { q: 'With c = 1.1 S(16 °C), what is σ at 2 °C in the model?', a: 'S(2 °C) = e^(0.065 × (−14)) S(16 °C) = 0.40 S(16 °C), so σ = 1.1/0.40 − 1 ≈ 1.7: strongly supersaturated, crystals grow.' },
      checkFigure: plot('Supersaturation σ = c/S(T) − 1 of the model glass: positive (crystals) below 17.5 °C, 1.73 at 2 °C.', [-5, 35], [C('1.1/exp(0.065*(x-16))-1', 'σ(T)')], { hlines: [{ y: 0, label: 'σ = 0' }], points: [[2, 1.73, '2 °C']], xlabel: 'T (°C)' }),
    },
    S8: {
      explain: [{ text: 'Once σ > 0, crystals nucleate on the glass and on dust and grow until the dissolved concentration falls back to $S(T)$; when the glass warms and σ turns negative they dissolve again. Because the total camphor is conserved, the mass of crystals simply tracks how far the temperature has fallen below the clearing point, 17.5 °C for the model glass with c = 1.1 S(16 °C). The tube is sealed, so a 20 hPa change outside barely reaches the liquid. Williams (2025) measured exactly this: crystal growth followed temperature, not approaching weather.',
        figure: plot('Fraction of the model glass’s camphor in crystals, 1 − S(T)/c (zero above the 17.5 °C clearing point).', [-5, 30], [C('max(0,1-exp(0.065*(x-16))/1.1)', 'crystal fraction')], { vlines: [{ x: 17.5, label: 'clear above 17.5 °C' }], xlabel: 'T (°C)' }) }],
      intuition: 'Like dew on a cold window: the crystals are the camphor that a cooled liquid can no longer hold.',
      intuitionFigure: flow('A day and a night in a storm glass.', ['night cools the glass', 'S(T) falls, σ > 0', 'crystals grow', 'day warms it, σ < 0', 'crystals dissolve']),
      misconceptionFigure: bars('Crystal fraction in the model glass: a 20 hPa pressure fall changes nothing, cooling by 5 K more than doubles the crystals.', ['15 °C, 1013 hPa', '15 °C, 993 hPa', '10 °C, 1013 hPa'], [['crystal fraction', [0.148, 0.148, 0.385]]], { highlight: [2] }),
      check: { q: 'The model glass (c = 1.1 S(16 °C)) stands at 20 °C. Are there crystals?', a: 'No: S(20 °C) = e^0.26 S(16 °C) = 1.30 S(16 °C) > c, so σ = 1.1/1.30 − 1 ≈ −0.15 and any crystals dissolve.' },
      checkFigure: nl('Temperature (°C) of the model glass: crystals below 17.5 °C, clear above.', 0, 30, [[20, '20 °C']], [[0, 17.5, 'crystals (σ > 0)'], [17.5, 30, 'clear (σ < 0)']], { step: 5 }),
    },
    S9: {
      explain: [{ text: 'A single reading says little, because 1000 hPa can come with fair weather at one place and a storm at another. Forecasters read the tendency: how much the pressure has changed in the last three hours. A fall of more than about 3 hPa in three hours signals that a low is approaching and the weather is likely to worsen, and a fall of more than 6 hPa (“falling very rapidly” in marine forecasts) often comes before gales. A steady rise means a high is building and the sky is likely to clear. A barometer with a reference needle, set at each reading, shows the tendency at a glance.',
        figure: nl('Pressure change in three hours (hPa) and the terms of marine forecasts: steady, slowly, (no adverb), quickly, very rapidly.', 0, 8, [[3, '3 hPa: low approaching']], [[0, 1.5, 'slowly'], [1.6, 3.5, 'falling / rising'], [3.6, 6, 'quickly'], [6, 8, 'very rapidly']], { step: 1 }) }],
      intuition: 'Watch the direction of travel, not the number: a falling needle means the low is coming towards you.',
      intuitionFigure: plot('Two barometer traces over 12 hours: a fall of 3.6 hPa in 3 h (a low approaching) and a slow rise (clearing).', [0, 12], [C('1012-1.2*x', 'falling 1.2 hPa/h'), C('1008+0.5*x', 'rising 0.5 hPa/h')], { vlines: [{ x: 3, label: '3 h' }], xlabel: 't (h)', ylabel: 'hPa' }),
      misconception: 'That the words “Rain” and “Fair” on the dial are forecasts for the current reading. The same 1000 hPa can come with sunshine or a storm; only the trend over hours carries the forecast.',
      misconceptionFigure: contrast('Reading a barometer.', 'The needle points to “Rain” at 990 hPa, so it will rain.', 'Read the change: falling > 3 hPa in 3 h means worsening weather, whatever the dial says.'),
      check: { q: 'At 09:00 the barometer reads 1012 hPa, at 12:00 1005 hPa. What do you expect?', a: 'A fall of 7 hPa in three hours, “falling very rapidly”: a deep low is close; expect worsening weather and strong winds.' },
      checkFigure: plot('A 7 hPa fall between 09:00 and 12:00.', [8.5, 12.5], [C('1012-7/3*(x-9)', 'pressure')], { points: [[9, 1012, '09:00'], [12, 1005, '12:00']], xlabel: 'time (h)', ylabel: 'hPa' }),
    },
  },
  // ======================================================================= projectiles and orbits (v₀ = 20 m/s, 45°)
  'From thrown stones to orbits': {
    S1: {
      explain: [{ text: 'Near the ground the Earth’s pull is the same at every point a thrown stone reaches: g = 9.81 m/s² downwards, changing by less than 0.1 % over the first 3 km of height. With air drag ignored, the only force is vertical, so the motion splits into two independent ones. Horizontally nothing acts and the velocity stays what it was at launch. Vertically the velocity changes by 9.81 m/s every second. A ball fired horizontally and a ball dropped from the same height therefore reach the ground at the same moment.',
        figure: plot('Velocity components of the cannon ball, 20 m/s at 45°: vₓ = 14.14 m/s stays constant, vᵧ = 14.14 − 9.81t falls steadily and is zero at the apex, t = 1.44 s.', [0, 2.9], [C('14.14+0*x', 'vₓ (m/s)'), C('14.14-9.81*x', 'vᵧ (m/s)')], { hlines: [{ y: 0, label: '' }], vlines: [{ x: 1.442, label: 'apex' }], xlabel: 't (s)', ylabel: 'm/s' }) }],
      intuition: 'Two independent clocks: one for the sideways motion, which never changes, and one for the up-and-down motion, which gravity winds down by 9.81 m/s each second.',
      intuitionFigure: table('The two components of the cannon ball’s velocity, 20 m/s at 45°.', ['t (s)', 'vₓ (m/s)', 'vᵧ (m/s)'], [['0', '14.14', '14.14'], ['0.5', '14.14', '9.24'], ['1.0', '14.14', '4.33'], ['1.44', '14.14', '0'], ['2.0', '14.14', '−5.48'], ['2.88', '14.14', '−14.14']], { highlight: [[3, 2]] }),
      misconception: 'That a horizontally fired ball stays up longer than a dropped one. Without drag both fall the same height in the same time; the fired one only lands further away.',
      misconceptionFigure: contrast('Horizontal speed does not hold a ball up.', 'The faster ball is carried along and stays in the air longer.', 'Both fall 1.25 m in √(2h/g) = 0.50 s; horizontal speed changes where it lands, not when.'),
      check: { q: 'A ball rolls off a 1.25 m table at 2 m/s. When and where does it land?', a: 't = √(2h/g) = √(2 × 1.25/9.81) ≈ 0.50 s; it lands 2 × 0.50 ≈ 1.0 m from the table.' },
      checkFigure: plot('Path of a ball leaving a 1.25 m table at 2 m/s: y = 1.25 − 9.81x²/8; it lands 1.01 m out after 0.50 s.', [0, 1.1], [C('1.25-1.22625*x^2', 'height (m)')], { points: [[1.01, 0, 'lands']], xlabel: 'x (m)', ylabel: 'y (m)' }),
    },
    S2: {
      explain: [{ text: 'Integrating twice gives $x = v_0\\cos\\alpha\\,t$ and $y = v_0\\sin\\alpha\\,t - \\tfrac12 gt^2$; eliminating $t$ leaves a parabola. For the cannon’s 20 m/s at 45° the ball climbs to H = 10.2 m after 1.44 s and lands R = 40.8 m away after 2.88 s. The range depends on sin 2α, so it is largest at 45° and the same for complementary angles: 30° and 60° both reach 35.3 m, the 60° shot taking longer and climbing to 15.3 m.',
        figure: plot('Trajectories at 20 m/s: 30° and 60° land at the same 35.3 m, 45° goes furthest, 40.8 m.', [0, 42], [C('0.57735*x-0.01635*x^2', '30°'), C('x-0.024525*x^2', '45°'), C('1.73205*x-0.04905*x^2', '60°')], { y: [0, 16], xlabel: 'x (m)', ylabel: 'y (m)' }) }],
      intuition: 'Gravity bends a straight shot into a parabola by pulling the ball ½gt² below the line it was aimed along.',
      intuitionFigure: plot('After 1 s the 45° ball is 4.9 m (½g × 1 s²) below the aiming line y = x.', [0, 42], [C('x', 'aiming line'), C('x-0.024525*x^2', 'actual path')], { y: [0, 30], points: [[14.14, 14.14, 'aimed, t = 1 s'], [14.14, 9.24, 'actual']], xlabel: 'x (m)', ylabel: 'y (m)' }),
      misconception: 'That a projectile is pushed along its path by a “force of the throw”. After launch the only force is gravity (and drag); the forward motion continues by itself.',
      misconceptionFigure: contrast('What keeps the ball moving forward?', 'The push from the cannon travels with the ball and slowly runs out.', 'No force acts forwards after launch: vₓ = 14.14 m/s stays constant, and gravity only bends the path down.'),
      check: { q: 'At what other angle does the 20 m/s cannon reach the same range as at 30°?', a: '60°: sin 2α is the same for α and 90° − α, so both give 35.3 m.' },
      checkFigure: plot('Range against launch angle, R = v₀² sin 2α/g for 20 m/s: equal at 30° and 60°, largest at 45°.', [0, 90], [C('400*sin(2*x*PI/180)/9.81', 'R (m)')], { points: [[30, 35.31, '30°'], [60, 35.31, '60°'], [45, 40.77, '45°']], xlabel: 'α (degrees)', ylabel: 'm' }),
    },
    S3: {
      explain: [{ text: 'Far from the ground the pull weakens with the square of the distance from the Earth’s centre. At the surface, r = 6371 km, $GM/r^2$ gives g = 9.82 m/s²; at the International Space Station, 420 km up, it is still 8.6 m/s², about 88 % of the surface value. Astronauts float not because gravity is absent but because they and their station fall together around the Earth. At the Moon’s distance, about 60 Earth radii, the pull is roughly 1/3600 of g, the comparison Newton used to tie falling apples to the Moon’s orbit.',
        figure: plot('g = GM/r² against distance from the Earth’s centre in Earth radii: 8.6 m/s² at the ISS, 0.22 m/s² at geostationary height.', [1, 8], [C('9.82/x^2', 'g (m/s²)')], { points: [[1.066, 8.64, 'ISS'], [6.62, 0.224, 'geostationary']], xlabel: 'r / R_E', ylabel: 'm/s²' }) }],
      intuition: 'The pull spreads like light from a bulb over a sphere whose area grows as r², so doubling the distance quarters it.',
      intuitionFigure: bars('g at 1, 2, 3 and 4 Earth radii from the centre: 1/r² falls fast.', ['1 R_E', '2 R_E', '3 R_E', '4 R_E'], [['g (m/s²)', [9.82, 2.455, 1.091, 0.614]]], { ylabel: 'm/s²' }),
      misconception: 'That there is no gravity in orbit. At the ISS’s height gravity is 8.6 m/s²; the crew is weightless because everything around them falls freely together.',
      misconceptionFigure: contrast('Why do astronauts float?', 'At 420 km up they are beyond the reach of the Earth’s gravity.', 'Gravity there is 8.6 m/s², 88 % of g; they float because they and the station fall around the Earth together.'),
      check: { q: 'By what factor is the gravitational pull smaller at twice the Earth’s radius from its centre?', a: 'By 4: F ∝ 1/r², so g there is 9.82/4 ≈ 2.5 m/s².' },
      checkFigure: plot('Doubling r divides g by four: 9.82 → 2.46 m/s².', [1, 4], [C('9.82/x^2', 'g (m/s²)')], { points: [[1, 9.82, 'surface'], [2, 2.455, '2 R_E']], xlabel: 'r / R_E', ylabel: 'm/s²' }),
    },
    S4: {
      explain: [{ text: 'Because the pull always points at the Sun, it has no lever arm about the Sun and exerts no torque, so the angular momentum $\\vec L = m\\,\\vec r\\times\\vec v$ stays fixed. The area swept in a short time is a thin triangle, $\\tfrac12|\\vec r\\times\\vec v|\\,dt$, so the radius sweeps area at the constant rate $|\\vec L|/(2m)$. Close to the Sun r is small, so v must be large; far away the planet slows. The Earth moves at 30.29 km/s at perihelion in early January, 147.1 million km from the Sun, and at 29.29 km/s at aphelion in July, 152.1 million km away: r times v is the same, 4456 in these units.',
        figure: table('The Earth at perihelion and aphelion: r × v, twice the areal speed, is the same.', ['', 'r (10⁶ km)', 'v (km/s)', 'r × v'], [['perihelion (Jan)', '147.1', '30.29', '4456'], ['aphelion (Jul)', '152.1', '29.29', '4455']], { highlight: [[0, 3], [1, 3]] }) }],
      intuitionFigure: sk('Equal areas in equal times (sketch): near the Sun the radius sweeps a short, wide wedge, far away a long, thin one of the same area.', [{ shape: 'ellipse', x: 50, y: 30, rx: 40, ry: 26, fill: 'none' }, Ci(80.6, 30, 3, { tone: 'accent' }), Pa('M80.6 30 L90 30 L87.6 17 Z', { fill: '#f0c47a' }), Pa('M80.6 30 L10.1 27.4 L10.1 32.6 Z', { fill: '#f0c47a' }), T(80.6, 40, 'Sun'), T(94, 20, 'fast'), T(18, 22, 'slow')]),
      misconceptionFigure: bars('Orbital speed at perihelion and aphelion: the Earth’s changes by 3 %, comet Halley’s by a factor of 60.', ['Earth peri.', 'Earth aph.', 'Halley peri.', 'Halley aph.'], [['v (km/s)', [30.29, 29.29, 54.5, 0.91]]], { ylabel: 'km/s' }),
      checkFigure: sk('For a central force F is antiparallel to r, so the torque r × F = 0.', [Ci(20, 30, 3, { tone: 'accent' }), T(20, 40, 'Sun'), Ci(78, 30, 2.5), T(84, 38, 'planet'), Ar(20, 30, 76, 30), T(48, 24, 'r'), Ar(78, 30, 60, 30, { tone: 'accent' }), T(66, 42, 'F (along −r)'), T(50, 54, 'r × F = 0: no torque')]),
    },
    S5: {
      explain: [{ text: 'The specific energy ε, kinetic energy per kilogram minus the depth of the gravitational well, decides whether an orbit closes. With ε < 0 the body cannot climb out and follows an ellipse; at ε = 0 it just escapes along a parabola; with ε > 0 it leaves on a hyperbola. A circular orbit at radius r has speed $\\sqrt{GM/r}$, and escape needs √2 times that. From the Earth’s surface, ignoring the air, 7.9 km/s would circle the Earth and 11.2 km/s escapes it; in the demo the launch at 1.45 times circular speed is just above the √2 ≈ 1.414 needed.',
        figure: plot('Specific energy in units of GM/r against launch speed in units of circular speed, ε = ½k² − 1: bound below √2, escaping above.', [0, 2], [C('0.5*x^2-1', 'ε / (GM/r)')], { hlines: [{ y: 0, label: 'ε = 0' }], vlines: [{ x: 1, label: 'circle' }, { x: 1.414, label: 'escape' }], points: [[1.45, 0.051, 'demo 1.45']], xlabel: 'v / v_circ' }) }],
      intuition: 'A marble in a funnel: with enough speed it rolls up and over the rim; with too little it keeps circling inside.',
      intuitionFigure: plot('The gravitational well −GM/r (units GM/r₀ = 1) with two energy levels: a bound orbit (ε = −0.5) turns back, the demo’s ε = +0.05 clears the rim.', [0.3, 6], [C('-1/x', 'potential −1/r')], { y: [-3, 0.5], hlines: [{ y: -0.5, label: 'bound: ε < 0' }, { y: 0.05, label: 'demo: ε > 0' }], xlabel: 'r / r₀' }),
      misconception: 'That escaping needs a rocket firing all the way out. Escape speed is a launch speed: a body coasting at 11.2 km/s from the Earth’s surface (ignoring air) never comes back.',
      misconceptionFigure: contrast('Escape speed is a launch speed.', 'To leave the Earth a rocket must keep thrusting until it is out of the Earth’s gravity.', 'Gravity never ends, but coasting from 11.2 km/s the body slows ever more gently and never stops: ε ≥ 0.'),
      check: { q: 'A satellite circles just above the Earth at 7.9 km/s. What speed would let it escape?', a: '√2 × 7.9 ≈ 11.2 km/s.' },
      checkFigure: nl('Launch speeds from the Earth’s surface (km/s, no air).', 0, 12, [[7.9, 'circular'], [11.2, 'escape']], [[0, 11.2, 'bound (ε < 0)'], [11.2, 12, 'escapes']], { step: 2 }),
    },
  },
  // ======================================================================= five laboratories
  'Five laboratories': {
    S1: {
      explain: [{ text: 'A beam pivoted at its fulcrum turns when the weights on the two sides have unequal moments, weight times distance from the pivot. In the demo 3 kg hangs 2 m to the left and 2 kg hangs 3 m to the right: 3 × 9.81 × 2 = 58.9 N m on one side and 2 × 9.81 × 3 = 58.9 N m on the other, so the beam balances although the masses differ. This is Archimedes’ law of the lever: a small force far from the pivot balances a large one close to it, at the price of moving through a longer arc.',
        figure: sk('The demo’s lever: 3 kg at 2 m balances 2 kg at 3 m (58.9 N m each side).', [Ln(10, 30, 90, 30), Pa('M50 30 L46 38 L54 38 Z', { fill: '#c9a86a' }), Ln(30, 30, 30, 40), Rc(25, 40, 10, 9, { tone: 'accent' }), T(30, 46, '3 kg'), Ln(80, 30, 80, 40), Rc(76, 40, 8, 7, { tone: 'accent' }), T(80, 45, '2 kg'), T(40, 25, '2 m'), T(65, 25, '3 m'), T(50, 56, '3 × 2 = 2 × 3')]) }],
      intuition: 'A see-saw: a light child far out balances a heavy adult sitting near the middle.',
      intuitionFigure: plot('Mass needed at distance d to balance 3 kg at 2 m: m = 6 kg·m / d.', [0.5, 6], [C('6/x', 'm (kg)')], { points: [[2, 3, '3 kg at 2 m'], [3, 2, '2 kg at 3 m'], [4, 1.5, '1.5 kg at 4 m']], xlabel: 'd (m)', ylabel: 'kg' }),
      misconception: 'That a beam balances only with equal masses. Only the moments must match: 3 kg at 2 m balances 2 kg at 3 m.',
      misconceptionFigure: contrast('Balance needs equal moments, not equal masses.', 'The 3 kg side is heavier, so the beam must tip that way.', 'Moments: 3 kg × 2 m = 6 kg·m = 2 kg × 3 m, so the beam stays level.'),
      check: { q: 'Where must a 1.5 kg mass hang to balance 3 kg at 2 m?', a: 'At 4 m on the other side: 1.5 × 4 = 3 × 2.' },
      checkFigure: nl('Positions on the beam (m), fulcrum at 0.', -5, 5, [[-2, '3 kg'], [0, 'fulcrum'], [4, '1.5 kg']], [], { step: 1 }),
    },
    S2: {
      explain: [{ text: 'Two releases 0.001 rad apart start as alike as any real measurement could make them. In the chaotic regime the gap grows roughly like $e^{\\lambda t}$. To see what that means take, for illustration, λ = 2 s⁻¹: the gap reaches 0.1 rad after 2.3 s and a whole radian after 3.5 s, by which time the two motions are as different as two unrelated releases. Measuring the start a thousand times more precisely buys only another 3.5 s. The equations stay exact; it is prediction from imperfect data that fails.',
        figure: plot('Growth of the gap between two releases 0.001 rad apart, log₁₀ |δ| = −3 + 0.869 t for an illustrative λ = 2 s⁻¹: 1 rad after 3.5 s.', [0, 4.5], [C('-3+0.8686*x', 'log₁₀ |δ| (rad)')], { hlines: [{ y: 0, label: 'δ = 1 rad' }], vlines: [{ x: 3.45, label: '3.5 s' }], xlabel: 't (s)' }) }],
      intuitionFigure: bars('Time until a starting error grows to 1 rad, ln(1/δ₀)/λ with λ = 2 s⁻¹: each thousandfold improvement in precision buys only 3.5 s.', ['δ₀ = 10⁻³', '10⁻⁶', '10⁻⁹'], [['time (s)', [3.45, 6.91, 10.36]]], { ylabel: 's' }),
      misconceptionFigure: contrast('Determinism is not predictability.', 'Exact equations of motion mean the double pendulum can be predicted as far ahead as we like.', 'The equations are exact, but a 0.001 rad error grows like e^(λt); after a few seconds the forecast is no better than a guess.'),
      checkFigure: plot('The gap 0.001 e^(2t) (rad) stays invisible for two seconds, then explodes past 1 rad.', [0, 4], [C('0.001*exp(2*x)', '|δ| (rad)')], { hlines: [{ y: 1, label: 'size of the motion' }], xlabel: 't (s)' }),
    },
    S3: {
      explain: [{ text: 'Each charge contributes a field pointing away from it if positive and towards it if negative, of strength $k|q|/r^2$ with $k$ = 8.99 × 10⁹ N m² C⁻². The fields of several charges add as vectors. Around the demo’s dipole of +3 and −3 the lines leave the positive charge, bend round and enter the negative one; between the two the fields add and the field is strongest. A test charge feels $\\vec F = q\\vec E$ along the line through its position. Two charges of 1 μC, 10 cm apart, push or pull each other with 0.90 N.',
        figure: plot('Field strength on the line between the demo’s charges +3 and −3, 3.5 apart (k = 1 units): the two contributions add, weakest at the midpoint and soaring near each charge.', [-1.5, 1.5], [C('3/(x+1.75)^2+3/(x-1.75)^2', '|E| between the charges')], { xlabel: 'x (charges at ±1.75)', ylabel: '|E|' }) }],
      intuition: 'Field lines are a wind map for a positive test charge: where they crowd together, the push is strong.',
      intuitionFigure: bars('Field of a 1 nC charge, kq/r², at three distances: 89 900, 22 500 and 10 000 N/C.', ['1 cm', '2 cm', '3 cm'], [['E (N/C)', [89900, 22475, 9989]]], { ylabel: 'N/C' }),
      misconceptionFigure: contrast('Field lines are not trajectories.', 'A charge released in the dipole’s field slides along the field line it starts on.', 'The line gives the force direction now; once the charge moves, its momentum carries it off the line.'),
      check: { q: 'What force acts between two 1 μC charges 10 cm apart?', a: 'F = kq₁q₂/r² = 8.99 × 10⁹ × 10⁻¹²/0.01 ≈ 0.90 N, repulsive.' },
      checkFigure: plot('Force between two 1 μC charges against their distance, F = 8.99 × 10⁻³ N m²/r²: 0.90 N at 10 cm.', [0.05, 0.5], [C('0.00899/x^2', 'F (N)')], { points: [[0.1, 0.899, '10 cm']], xlabel: 'r (m)', ylabel: 'N' }),
    },
    S4: {
      explain: [{ text: 'When the switch closes the empty capacitor offers no opposing voltage, so the whole 9 V emf drives a current ε/R = 9/5 = 1.8 A. As charge collects, the capacitor’s voltage $q/C$ rises and the current falls, and the two changes feed each other into an exponential. After one time constant τ = RC = 3 s the capacitor holds 63 % of its final charge Cε = 5.4 C, after 3τ 95 %, after 5τ 99.3 %. Doubling either R or C doubles τ: more resistance lets the charge in more slowly, more capacitance needs more of it.',
        figure: plot('Charging the demo circuit (ε = 9 V, R = 5 Ω, C = 0.6 F, τ = 3 s): q rises to 5.4 C while the current decays from 1.8 A.', [0, 15], [C('5.4*(1-exp(-x/3))', 'q (C)'), C('1.8*exp(-x/3)', 'I (A)')], { vlines: [{ x: 3, label: 'τ = 3 s' }], xlabel: 't (s)' }) }],
      intuition: 'Filling a balloon from a pump of fixed pressure: the fuller it gets, the harder it pushes back and the slower the air goes in.',
      intuitionFigure: bars('Share of the final charge after whole time constants: 63, 86, 95, 98, 99.3 %.', ['1τ', '2τ', '3τ', '4τ', '5τ'], [['charged (%)', [63.2, 86.5, 95.0, 98.2, 99.3]]], { ylabel: '%' }),
      misconception: 'That a capacitor charges at a steady rate until it is full. The current is largest at the start (1.8 A) and decays exponentially; strictly the capacitor is never quite full.',
      misconceptionFigure: contrast('How does the charging current behave?', 'The current stays at 1.8 A until the capacitor is full, then stops.', 'I = 1.8 A × e^(−t/3 s): 0.66 A after 3 s, 0.09 A after 9 s; the last per cent takes longest.'),
      check: { q: 'How long until the demo’s capacitor reaches half its final charge?', a: '1 − e^(−t/τ) = ½ gives t = τ ln 2 = 3 s × 0.693 ≈ 2.1 s.' },
      checkFigure: plot('q/q_final = 1 − e^(−t/3 s) crosses ½ at t = τ ln 2 = 2.08 s.', [0, 10], [C('1-exp(-x/3)', 'q / q_final')], { hlines: [{ y: 0.5, label: 'half' }], vlines: [{ x: 2.08, label: '2.08 s' }], xlabel: 't (s)' }),
    },
    S5: {
      explain: [{ text: 'Rays from each point of an object meet again at one point behind a thin lens, at a distance $d_i$ given by $1/f = 1/d_o + 1/d_i$. With f = 2.5 and the object at d_o = 4, 1/d_i = 0.40 − 0.25 = 0.15, so the image forms at 6.67, inverted and 1.67 times larger (m = −d_i/d_o). As the object approaches the focal point the image runs off towards infinity, and inside the focal length d_i turns negative: the lens then acts as a magnifying glass, showing an upright virtual image on the object’s side.',
        figure: plot('Image distance against object distance for f = 2.5: real images beyond F, virtual (negative d_i) inside it; the demo’s d_o = 4 gives d_i = 6.67.', [0.5, 12], [C('1/(0.4-1/x)', 'd_i')], { y: [-15, 15], vlines: [{ x: 2.5, label: 'F' }], points: [[4, 6.67, 'd_o = 4']], xlabel: 'd_o', ylabel: 'd_i' }) }],
      intuition: 'The lens trades distance for distance: push the object in towards F and the image runs out; take the object far away and the image settles at F.',
      intuitionFigure: table('Object and image for f = 2.5.', ['d_o', 'd_i', 'm'], [['10', '3.33', '−0.33'], ['5', '5', '−1'], ['4', '6.67', '−1.67'], ['3', '15', '−5'], ['2', '−10', '+5 (virtual)']], { highlight: [[2, 1]] }),
      misconception: 'That a lens always forms an image you can catch on a screen. Inside the focal length (d_o < f) the rays leave diverging; the eye sees an upright virtual image instead.',
      misconceptionFigure: contrast('Real and virtual images.', 'Any object in front of a converging lens gives a picture on a screen behind it.', 'For d_o = 2 < f = 2.5, d_i = −10: no screen catches it; the eye sees an upright image 5 times larger.'),
      check: { q: 'Where is the image when the object stands at 2f = 5?', a: '1/d_i = 0.4 − 0.2 = 0.2, so d_i = 5 = 2f: inverted and the same size (m = −1).' },
      checkFigure: nl('Distances along the axis for f = 2.5: object and image both at 2f.', 0, 12, [[2.5, 'F'], [5, 'd_o = d_i = 2f']], [], { step: 1 }),
    },
    S6: {
      explain: [{ text: 'The coefficient of restitution compares how fast a ball leaves the floor with how fast it arrived. Kinetic energy goes as v², so each bounce keeps the fraction $e^2$ of it, and the height reached scales the same way. A ball with e = 0.8 dropped from 1 m rises to 0.64 m, then 0.41 m, then 0.26 m: a geometric sequence. Sports rules fix e indirectly: a tennis ball dropped from 254 cm onto concrete must rebound to between 135 and 147 cm, which means e between 0.73 and 0.76.',
        figure: bars('Successive bounce heights from 1 m with e = 0.8: each is e² = 0.64 of the one before.', ['drop', '1', '2', '3', '4', '5'], [['height (m)', [1, 0.64, 0.41, 0.262, 0.168, 0.107]]], { ylabel: 'm' }) }],
      intuition: 'Each bounce pays the same tax on the energy, so the heights shrink by the same factor every time.',
      intuitionFigure: plot('Bounce height after n bounces, hₙ = 0.64ⁿ h₀ for e = 0.8: a geometric decay.', [0, 8], [C('pow(0.64,x)', 'hₙ/h₀')], { points: [[1, 0.64, ''], [2, 0.41, ''], [3, 0.262, ''], [4, 0.168, '']], xlabel: 'n (bounces)' }),
      misconception: 'That e is the fraction of height kept. It is the fraction of speed; the height (like the energy) keeps e²: with e = 0.8 only 64 % of the height returns.',
      misconceptionFigure: contrast('Speed ratio, not height ratio.', 'e = 0.8, so the ball returns to 80 % of the height.', 'Speed keeps 80 %, energy and height keep 0.8² = 64 %.'),
      check: { q: 'A tennis ball dropped from 2.54 m rebounds to 1.41 m. What is e?', a: 'e = √(1.41/2.54) ≈ 0.75.' },
      checkFigure: nl('Coefficient of restitution: the measured ball (0.745) and the band the tennis rules allow (0.73–0.76).', 0.6, 0.9, [[0.745, 'measured']], [[0.729, 0.761, 'allowed by the rules']], { step: 0.05 }),
    },
  },
  // ======================================================================= the derivative
  'The derivative and its two faces': {
    S1: {
      explain: [{ text: 'The difference quotient is rise over run between two points of the graph a distance $h$ apart. For $f(x) = x^2$ at $x = 1$ it equals $((1+h)^2 - 1)/h = 2 + h$: with h = 1 the secant slope is 3, with h = 0.1 it is 2.1, with h = 0.01 it is 2.01. The secant line pivots about the fixed point (1, 1) as h shrinks, and its slope settles towards 2. Nothing in the definition needs h > 0; a negative h puts the second point on the left and approaches 2 from below.',
        figure: plot('Secants of y = x² through (1, 1): slope 3 for h = 1, 2.1 for h = 0.1.', [-0.5, 2.5], [C('x^2', 'x²'), C('1+3*(x-1)', 'secant, h = 1'), C('1+2.1*(x-1)', 'secant, h = 0.1', { dash: true })], { y: [-1, 5], points: [[1, 1, '(1, 1)'], [2, 4, '(2, 4)']], xlabel: 'x' }) }],
      intuition: 'An average speed over a trip: distance covered divided by time taken, for a shorter and shorter trip.',
      intuitionFigure: table('Secant slopes of x² at x = 1, Q_h = 2 + h.', ['h', 'Q_h'], [['1', '3'], ['0.5', '2.5'], ['0.1', '2.1'], ['0.01', '2.01'], ['−0.1', '1.9']]),
      misconception: 'Setting h = 0 in the quotient. That gives 0/0, which means nothing; the derivative is the limit as h approaches 0, not the value at h = 0.',
      misconceptionFigure: contrast('A limit, not a substitution.', 'Put h = 0 into (f(x + h) − f(x))/h to get the slope.', 'At h = 0 the quotient is 0/0; simplify first (2 + h for x² at 1), then let h approach 0.'),
      check: { q: 'For f(x) = x³ at x = 2, what is the secant slope with h = 0.1?', a: '((2.1)³ − 8)/0.1 = (9.261 − 8)/0.1 = 12.61, close to the derivative 12.' },
      checkFigure: bars('Secant slopes of x³ at x = 2 approach 12 as h shrinks.', ['h = 1', '0.5', '0.1', '0.01'], [['Q_h', [19, 15.25, 12.61, 12.06]]], { highlight: [2] }),
    },
    S2: {
      explain: [{ text: '$f$ is differentiable at $x$ when the secant slopes have one limit, from whichever side h approaches 0. For x² at 1 the slopes 2 + h tend to 2, the slope of the tangent line y = 2x − 1. A function can be continuous and still not differentiable: |x| at 0 has secant slope +1 from the right and −1 from the left, so no single tangent exists and the graph has a corner. When the limit exists at every point it defines a new function, f′, the slope of f as x varies.',
        figure: plot('y = x² and its tangent at x = 1, y = 2x − 1 (slope 2).', [-0.5, 2.5], [C('x^2', 'x²'), C('2*x-1', 'tangent, slope 2')], { y: [-1, 5], points: [[1, 1, '(1, 1)']], xlabel: 'x' }) }],
      intuition: 'Zoom in on a smooth curve and it straightens into its tangent line; the derivative is the slope of that line.',
      intuitionFigure: plot('Zoomed in to 0.9 ≤ x ≤ 1.1, x² and its tangent 2x − 1 are almost the same line (they differ by (x − 1)², at most 0.01).', [0.9, 1.1], [C('x^2', 'x²'), C('2*x-1', 'tangent', { dash: true })], { xlabel: 'x' }),
      misconception: 'That every continuous function has a derivative. |x| is continuous at 0, but the slopes from the left (−1) and from the right (+1) disagree, so it has none there.',
      misconceptionFigure: plot('|x| has a corner at 0: slope −1 on the left, +1 on the right, no tangent at the corner.', [-2, 2], [C('abs(x)', '|x|'), C('x', 'right slope +1', { dash: true }), C('-x', 'left slope −1', { dash: true })], { y: [-0.5, 2], xlabel: 'x' }),
      check: { q: 'What is the derivative of x² at x = 3, and what is the tangent line there?', a: 'f′(3) = 6, and the tangent is y = 9 + 6(x − 3) = 6x − 9.' },
      checkFigure: plot('y = x² and its tangent at x = 3, y = 6x − 9.', [0, 5], [C('x^2', 'x²'), C('6*x-9', 'tangent at 3')], { y: [-2, 25], points: [[3, 9, '(3, 9)']], xlabel: 'x' }),
    },
    S3: {
      explain: [{ text: 'Expanding $(x+h)^n$ with the binomial theorem, every term after $x^n + nx^{n-1}h$ carries $h^2$ or a higher power. Subtracting $x^n$ and dividing by h leaves $nx^{n-1}$ plus terms that still contain h, and these vanish in the limit. So x² has slope 2x, x³ has slope 3x² and x¹⁰ has slope 10x⁹. The same rule holds for negative and fractional powers (1/x has slope −1/x², √x has slope 1/(2√x)), though proving that needs more than the binomial theorem for natural n.',
        figure: plot('y = x³ and its derivative 3x²: the slope is never negative and is zero only at x = 0.', [-2, 2], [C('x^3', 'x³'), C('3*x^2', 'slope 3x²')], { y: [-8, 12], xlabel: 'x' }) }],
      intuition: 'Grow a square of side x by a thin strip h: the new area is mostly two strips x·h, so the area grows at 2x per unit of side.',
      intuitionFigure: sk('d(x²)/dx = 2x: widening a square of side x by h adds two strips x·h and a tiny corner h².', [Rc(20, 10, 40, 40, { tone: 'muted' }), Rc(60, 10, 6, 40, { tone: 'accent' }), Rc(20, 50, 40, 6, { tone: 'accent' }), Rc(60, 50, 6, 6), T(40, 32, 'x²'), T(76, 30, 'x·h'), T(40, 58, 'x·h'), T(74, 56, 'h²')], { h: 62 }),
      misconception: 'Differentiating xⁿ to n·xⁿ (forgetting to lower the power) or to xⁿ⁻¹ (forgetting the factor n). For x³ at x = 2 the slope is 3 × 2² = 12, not 24 or 4.',
      misconceptionFigure: contrast('Both parts of the power rule.', 'd/dx x³ = 3x³ (24 at x = 2), or x² (4 at x = 2).', 'd/dx x³ = 3x²: lower the power by one and bring it in front; 12 at x = 2.'),
      check: { q: 'Using the power rule, what is the slope of x⁴ at x = 1.5?', a: '4 × 1.5³ = 4 × 3.375 = 13.5.' },
      checkFigure: plot('y = x⁴ and its tangent at x = 1.5, slope 4 × 1.5³ = 13.5.', [0, 2.2], [C('x^4', 'x⁴'), C('5.0625+13.5*(x-1.5)', 'tangent, slope 13.5')], { y: [-5, 20], points: [[1.5, 5.0625, '(1.5, 5.06)']], xlabel: 'x' }),
    },
    S4: {
      explain: [{ text: 'For a function of two variables the partial derivatives measure the slope in the x and in the y direction, each with the other variable held fixed. Together they form the gradient $\\nabla f$, a vector that points uphill along the steepest direction, with a length equal to that steepest slope. For $f(x,y) = x^2 + y^2$ at (1, 2), ∇f = (2, 4): the steepest climb leads straight away from the bowl’s bottom, with slope √20 ≈ 4.47. A ball released on the surface accelerates along −∇f, which is why water runs across contour lines, never along them.',
        figure: sk('Contours of f = x² + y² (circles) at (1, 2): ∇f = (2, 4) points straight uphill, across the contour; a ball rolls along −∇f.', [Ci(40, 32, 8, { fill: 'none' }), Ci(40, 32, 16, { fill: 'none' }), Ci(40, 32, 24, { fill: 'none' }), Ci(47.2, 17.7, 1.6, { tone: 'accent' }), Ar(47.2, 17.7, 53, 6, { tone: 'accent' }), T(64, 8, '∇f = (2, 4)'), Ar(47.2, 17.7, 43.6, 24.9), T(58, 26, '−∇f: ball'), T(40, 34, 'minimum')]) }],
      intuition: 'On a hillside map, the gradient is the arrow a climber would point to go straight up; its length says how steep that is.',
      intuitionFigure: bars('Slopes of f = x² + y² at (1, 2) in four directions: steepest along ∇f, zero along the contour.', ['along x', 'along y', 'along ∇f', 'along contour'], [['slope', [2, 4, 4.47, 0]]], { highlight: [2] }),
      misconception: 'That ∇f points along the contour lines. It is perpendicular to them: along a contour f does not change at all.',
      misconceptionFigure: contrast('The gradient and the contour lines.', 'The gradient follows the contour lines, like a path around the hill.', 'Along a contour f is constant (slope 0); ∇f is perpendicular to it, pointing straight uphill.'),
      check: { q: 'For f(x, y) = x² + y², what is ∇f at (3, 4), and how steep is the steepest climb?', a: '∇f = (6, 8); its length, √(36 + 64) = 10, is the steepest slope.' },
      checkFigure: sk('∇f at (3, 4) has components 6 and 8 and length 10.', [Ar(20, 50, 56, 50), Ar(56, 50, 56, 2), Ar(20, 50, 56, 2, { tone: 'accent' }), T(38, 56, '∂f/∂x = 6'), T(70, 26, '∂f/∂y = 8'), T(26, 22, '|∇f| = 10')]),
    },
    S5: {
      explain: [{ text: 'Chop $[a, b]$ into n strips of width Δx and add up f times the width of each strip. For f(x) = x² on [0, 1] with left endpoints the sum is 0.285 for n = 10, 0.328 for n = 100 and 0.3328 for n = 1000, closing in on 1/3. The fundamental theorem says why the limit is so easy to find: a function F with F′ = f, here F = x³/3, accumulates exactly the same total, so the integral is F(1) − F(0) = 1/3. Differentiating and integrating undo each other.',
        figure: plot('The area under y = x² from 0 to 1 is F(1) − F(0) = 1/3 with F = x³/3.', [0, 1.2], [C('x^2', 'x²')], { shade: { expr: 'x^2', from: 0, to: 1, label: 'area 1/3' }, xlabel: 'x' }) }],
      intuition: 'Adding up small changes gives the total change: speedometer readings, each multiplied by its second and added, give the distance travelled.',
      intuitionFigure: bars('Left Riemann sums of x² on [0, 1] approach the exact 1/3.', ['n = 10', 'n = 100', 'n = 1000', 'exact'], [['sum', [0.285, 0.32835, 0.33283, 0.33333]]], { highlight: [3] }),
      misconception: 'That the integral is simply the area under the curve. It is a signed area: where f < 0 the strips count negatively, so ∫ sin x dx over [0, 2π] is 0.',
      misconceptionFigure: plot('Over one period of sin x the area above the axis (+2) and below it (−2) cancel: the integral is 0.', [0, 6.2832], [C('sin(x)', 'sin x')], { shade: { expr: 'sin(x)', from: 0, to: 6.2832, label: '+2 and −2' }, xlabel: 'x' }),
      check: { q: 'Evaluate ∫₀² 3x² dx with the fundamental theorem.', a: 'F(x) = x³, so the integral is 2³ − 0³ = 8.' },
      checkFigure: plot('∫₀² 3x² dx = F(2) − F(0) = 8 with F = x³.', [0, 2.3], [C('3*x^2', '3x²')], { shade: { expr: '3*x^2', from: 0, to: 2, label: 'area 8' }, xlabel: 'x' }),
    },
  },
  // ======================================================================= linear maps and harmonics
  'Linear maps, complex numbers and harmonics': {
    S1: {
      explain: [{ text: 'A linear map keeps straight lines straight, keeps the origin fixed and keeps evenly spaced grid lines evenly spaced. All of that follows from $A(\\alpha u + \\beta v) = \\alpha Au + \\beta Av$: once you know where the two basis vectors go, every other vector’s image is the same combination of their images. For A with columns (2, 1) and (−1, 1), the vector (3, 2) = 3î + 2ĵ goes to 3(2, 1) + 2(−1, 1) = (4, 5). Rotations, stretches, shears and reflections are all linear; a shift by a fixed vector is not, because it moves the origin.',
        figure: sk('A with Aî = (2, 1) and Aĵ = (−1, 1): the image of (3, 2) is 3·(2, 1) + 2·(−1, 1) = (4, 5).', [Ln(10, 50, 90, 50), Ln(30, 58, 30, 4), Ar(30, 50, 46, 42, { tone: 'accent' }), T(54, 46, 'Aî = (2, 1)'), Ar(30, 50, 22, 42, { tone: 'accent' }), T(13, 38, 'Aĵ = (−1, 1)'), Ar(30, 50, 62, 10), T(76, 10, 'A(3, 2) = (4, 5)')]) }],
      intuition: 'A grid drawn on a rubber sheet that is stretched and turned but never bent or torn: grid lines stay straight, parallel and evenly spaced.',
      intuitionFigure: flow('Why two images are enough.', ['choose Aî and Aĵ', 'any v = xî + yĵ', 'Av = x·Aî + y·Aĵ']),
      misconception: 'That f(x) = 2x + 3 is linear in this sense. It moves the origin to 3, and f(1 + 1) = 7 ≠ f(1) + f(1) = 10: it is affine, not linear.',
      misconceptionFigure: contrast('Straight graph ≠ linear map.', 'f(x) = 2x + 3 has a straight graph, so it is linear.', 'f(0) = 3 ≠ 0 and f(2) = 7 ≠ f(1) + f(1) = 10: it is linear plus a shift (affine).'),
      check: { q: 'With Aî = (2, 1) and Aĵ = (−1, 1), where does (1, −1) go?', a: '(2, 1) − (−1, 1) = (3, 0).' },
      checkFigure: table('Images under A with columns (2, 1) and (−1, 1).', ['v', 'Av'], [['(1, 0)', '(2, 1)'], ['(0, 1)', '(−1, 1)'], ['(3, 2)', '(4, 5)'], ['(1, −1)', '(3, 0)']], { highlight: [[3, 1]] }),
    },
    S2: {
      explain: [{ text: 'Under the map the unit square spanned by î and ĵ becomes the parallelogram spanned by the columns (a, c) and (b, d), whose area is |ad − bc|. Every other region’s area is multiplied by the same factor, because any region can be filled with tiny squares. The sign records orientation: a negative determinant means the map flips the plane over, like a mirror. For columns (2, 1) and (−1, 1), det A = 2 × 1 − (−1) × 1 = 3, so every area triples. If the columns are parallel, as (1, 2) and (2, 4) are, det A = 0 and the whole plane is squashed onto a line.',
        figure: sk('The unit square (area 1) and its image, the parallelogram spanned by (2, 1) and (−1, 1): area det A = 3.', [Ln(10, 50, 90, 50), Ln(30, 58, 30, 6), Pa('M30 50 L38 50 L38 42 L30 42 Z', { fill: '#d8e2ee' }), Pa('M30 50 L46 42 L38 34 L22 42 Z', { fill: '#f0c47a' }), T(43, 55, 'unit square: 1'), T(60, 32, 'image: area 3')]) }],
      intuition: 'The determinant is the map’s exchange rate for areas: put one square metre in, get det A square metres out.',
      intuitionFigure: bars('Areas before and after the map with det A = 3: every shape triples.', ['unit square', 'triangle', 'unit disc'], [['before', [1, 0.5, 3.14]], ['after', [3, 1.5, 9.42]]]),
      misconception: 'That a zero determinant means the map sends everything to zero. It collapses the plane onto a line (or a point), so the map cannot be undone, but most vectors still have non-zero images.',
      misconceptionFigure: contrast('det A = 0 means flattened, not erased.', 'det A = 0, so every vector is sent to (0, 0).', 'Columns (1, 2) and (2, 4): every image lies on the line y = 2x; only areas become 0.'),
      check: { q: 'What is det A for columns (3, 0) and (1, 2), and what happens to a region of area 5?', a: 'det A = 3 × 2 − 1 × 0 = 6, so the region’s image has area 30.' },
      checkFigure: table('det A = ad − bc for columns (a, c) = (3, 0) and (b, d) = (1, 2).', ['a', 'b', 'c', 'd', 'ad − bc', 'area 5 →'], [['3', '1', '0', '2', '6', '30']], { highlight: [[0, 4]] }),
    },
    S3: {
      explain: [{ text: 'Write each complex number as a length and a direction, $z = r_1e^{i\\varphi_1}$. Multiplying exponentials adds their exponents, so $zw$ has length $r_1r_2$ and angle $\\varphi_1 + \\varphi_2$: multiplying by w turns the plane by w’s angle and stretches it by w’s length. Multiplying by i (length 1, angle 90°) turns any number a quarter turn, 1 → i → −1 → −i → 1. For z = 1 + i (length √2, angle 45°) and w = √3 + i (length 2, angle 30°), zw = (√3 − 1) + (√3 + 1)i, of length 2√2 and angle 75°.',
        figure: sk('z = 1 + i (√2, 45°) times w = √3 + i (2, 30°) is zw ≈ 0.73 + 2.73i: lengths multiply (2√2), angles add (75°).', [Ln(10, 50, 90, 50), Ln(30, 58, 30, 4), Ar(30, 50, 39, 41), T(46, 40, 'z'), Ar(30, 50, 45.6, 41), T(54, 46, 'w'), Ar(30, 50, 36.6, 25.4, { tone: 'accent' }), T(48, 22, 'zw: 2√2, 75°')]) }],
      intuition: 'Multiplying by a complex number works like a dial: turn by its angle and stretch by its length.',
      intuitionFigure: table('Powers of i: each multiplication by i is a quarter turn.', ['power', 'value', 'angle'], [['i⁰', '1', '0°'], ['i¹', 'i', '90°'], ['i²', '−1', '180°'], ['i³', '−i', '270°'], ['i⁴', '1', '360°']]),
      misconception: 'That lengths add when complex numbers are added, as they multiply when numbers are multiplied. Under addition |z + w| ≤ |z| + |w|: |1 + (−1)| = 0.',
      misconceptionFigure: contrast('Products and sums treat lengths differently.', '|z + w| = |z| + |w|, just as |zw| = |z||w|.', '|zw| = |z||w| always, but |1 + (−1)| = 0 while |1| + |−1| = 2: only |z + w| ≤ |z| + |w| holds.'),
      check: { q: 'What are the length and the angle of (1 + i)²?', a: 'Length (√2)² = 2, angle 2 × 45° = 90°: (1 + i)² = 2i.' },
      checkFigure: sk('Squaring 1 + i doubles its angle (45° → 90°) and squares its length (√2 → 2): (1 + i)² = 2i.', [Ln(10, 50, 90, 50), Ln(30, 58, 30, 4), Ar(30, 50, 40, 40), T(50, 40, '1 + i'), Ar(30, 50, 30, 30, { tone: 'accent' }), T(16, 30, '2i')]),
    },
    S4: {
      explain: [{ text: 'Each harmonic is a sine or cosine that repeats a whole number of times per period, and the coefficients $a_k$, $b_k$ say how much of each the shape contains. For the square wave that jumps between −1 and +1 only the odd sines appear, with amplitudes 4/(πk): 1.273 for k = 1, 0.424 for k = 3, 0.255 for k = 5. Adding them builds the flat tops and the steep edges; the more terms, the closer the sum comes, except right at the jumps, where an overshoot of about 9 % of the jump never goes away.',
        figure: plot('Partial sums of the square wave’s series, (4/π) Σ sin(kx)/k over odd k: the first term, up to k = 5, and up to k = 15.', [-3.1416, 3.1416], [C(sq(1), 'k = 1'), C(sq(3), 'k ≤ 5'), C(sq(8), 'k ≤ 15')], { y: [-1.5, 1.5], xlabel: 'x' }) }],
      intuitionFigure: bars('The square wave’s harmonic amplitudes b_k = 4/(πk), odd k only.', ['1', '2', '3', '4', '5', '6', '7', '8', '9'], [['b_k', [1.273, 0, 0.424, 0, 0.255, 0, 0.182, 0, 0.141]]], { xlabel: 'k' }),
      misconceptionFigure: plot('Near the jump at x = 0 the sum up to k = 49 still overshoots to about 1.18, 9 % of the jump of 2; only the overshoot’s width shrinks.', [0, 1], [C(sq(25), 'k ≤ 49')], { hlines: [{ y: 1.179, label: '1.18' }, { y: 1, label: '' }], xlabel: 'x' }),
      checkFigure: table('Harmonics of the square wave.', ['k', 'b_k = 4/(πk)'], [['1', '1.273'], ['2', '0'], ['3', '0.424'], ['4', '0'], ['5', '0.255']]),
    },
    S5: {
      explain: [{ text: 'Take any distribution with a finite variance, draw n values and average them. The average has the same mean μ, but its standard deviation shrinks to $\\sigma/\\sqrt n$, and its histogram looks more and more like a normal curve as n grows. For a fair die (μ = 3.5, σ = 1.71) the mean of 2 throws already has a peaked, triangular distribution; the mean of 30 throws is close to normal with standard deviation 1.71/√30 = 0.31. The theorem explains why measurement errors, heights and many sums of small effects look bell-shaped.',
        figure: { kind: 'distribution', caption: 'Mean of 30 throws of a fair die: approximately normal with mean 3.5 and standard deviation 1.71/√30 = 0.31; about 95 % of such means lie between 2.9 and 4.1.', dist: 'normal', params: { mean: 3.5, sd: 0.312 }, shade: { from: 2.9, to: 4.1, label: 'P(2.9 < mean < 4.1)' }, xlabel: 'mean of 30 throws' } }],
      intuitionFigure: bars('Sum of two dice: 36 equally likely pairs already pile up in the middle.', ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], [['ways (of 36)', [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]]], { highlight: [5] }),
      misconceptionFigure: contrast('What becomes normal?', 'With 1000 incomes in a sample, the incomes themselves follow a bell curve.', 'The incomes stay as skewed as ever; it is the mean of many samples of incomes whose distribution approaches normal.'),
      checkFigure: plot('Spread of the mean, σ/√n with σ = 1: quadrupling n halves it.', [1, 64], [C('1/sqrt(x)', 'σ/√n')], { points: [[4, 0.5, 'n = 4'], [16, 0.25, 'n = 16'], [64, 0.125, 'n = 64']], xlabel: 'n' }),
    },
  },
  // ======================================================================= collision theory
  'Collision theory and chemical equilibrium': {
    S1: {
      explain: [{ text: 'In a gas at room temperature each molecule collides billions of times a second, yet most reactions are far slower, because only collisions with enough energy along the line of approach can break and remake bonds. That threshold is the activation energy $E_a$. Kinetic energies are spread out (the Maxwell–Boltzmann distribution), so at any moment a small, temperature-sensitive fraction of collisions is energetic enough. For E_a = 50 kJ/mol at 298 K that fraction is about e^(−20.2) ≈ 1.7 × 10⁻⁹: two collisions in a billion.',
        figure: plot('Distribution of molecular kinetic energies, 2√(E/π) e^(−E) with E in units of kT; only the shaded tail above an illustrative E_a = 3kT (here 11 % of molecules) can react.', [0, 7], [C('2*sqrt(x/PI)*exp(-x)', 'energy distribution')], { shade: { expr: '2*sqrt(x/PI)*exp(-x)', from: 3, to: 7, label: 'E > E_a' }, vlines: [{ x: 3, label: 'E_a' }], xlabel: 'E / kT' }) }],
      intuition: 'A crowd trying to get over a fence: everyone mills about, but only the few with a running start make it over.',
      intuitionFigure: tree('The fate of one collision.', nd('A meets B', [nd('reacts → C', [], 'E ≥ E_a, oriented'), nd('bounces apart', [], 'E < E_a')])),
      misconception: 'That every collision between A and B produces C. Only the small fraction above E_a, and suitably oriented, reacts; most collisions just bounce.',
      misconceptionFigure: contrast('Collisions are common; reactions are rare.', 'Every A–B collision makes a molecule of C.', 'With E_a = 50 kJ/mol at 298 K only about 2 in a billion collisions have the energy to react.'),
      check: { q: 'Doubling [A] doubles the rate; why can a 10 K rise in temperature have a similar effect?', a: 'More A means proportionally more collisions. A 10 K rise barely changes the number of collisions (+1.7 %), but it raises the fraction above E_a, which is exponentially sensitive: about ×1.9 for E_a = 50 kJ/mol.' },
      checkFigure: bars('What changes the rate at 298 K (E_a = 50 kJ/mol): doubling [A], the collision count after +10 K, and the reacting fraction after +10 K.', ['2 × [A]', 'collisions, +10 K', 'fraction > E_a, +10 K'], [['factor', [2, 1.017, 1.93]]]),
    },
    S2: {
      explain: [{ text: 'The Arrhenius law $k = A\\,e^{-E_a/RT}$ combines the collision rate and orientation (in A) with the fraction of collisions above the barrier. Because $E_a/RT$ sits in an exponent, small temperature changes matter: with E_a = 50 kJ/mol, warming from 298 K to 308 K raises k by a factor 1.9, and to 348 K (75 °C) by about 18. Plotting ln k against 1/T turns the law into a straight line of slope $-E_a/R$, which is how activation energies are measured.',
        figure: plot('Rate constant relative to 298 K for E_a = 50 kJ/mol, k/k(298 K) = e^(6014 K × (1/298 K − 1/T)): ×1.9 at 308 K, ×18 at 348 K.', [280, 360], [C('exp(6014*(1/298-1/x))', 'k / k(298 K)')], { points: [[308, 1.93, '308 K'], [348, 18.2, '348 K']], xlabel: 'T (K)' }) }],
      intuitionFigure: bars('Fraction of collisions above E_a = 50 kJ/mol, e^(−E_a/RT), in units of 10⁻⁹: heating multiplies the rare energetic ones.', ['298 K', '308 K', '348 K'], [['fraction (× 10⁻⁹)', [1.72, 3.3, 31.3]]]),
      misconceptionFigure: bars('Rate factor for 298 → 308 K: about 2 only for E_a near 50 kJ/mol.', ['E_a = 20 kJ/mol', '50 kJ/mol', '100 kJ/mol'], [['factor for +10 K', [1.3, 1.93, 3.71]]], { highlight: [1] }),
      checkFigure: plot('An Arrhenius plot for E_a = 50 kJ/mol: ln(k/A) = −(E_a/R)(1/T), a straight line of slope −6014 K (x = 1000 K/T).', [2.8, 3.6], [C('-6.014*x', 'ln(k/A)')], { xlabel: '1000 / T (K⁻¹)' }),
    },
    S3: {
      explain: [{ text: 'In A + B ⇌ C the forward rate $k_f[A][B]$ falls as A and B are used up, while the reverse rate $k_r[C]$ grows as C accumulates. They meet when $k_f[A][B] = k_r[C]$, which can be rewritten $[C]/([A][B]) = k_f/k_r = K$. Molecules keep reacting in both directions at equilibrium; only the net change is zero. Starting from [A] = [B] = 1 mol/L and no C, with K = 4 L/mol, the mixture settles at [C] = 0.61 mol/L and [A] = [B] = 0.39 mol/L, however fast or slow the reaction is.',
        figure: plot('Forward and reverse rates against [C] for A + B ⇌ C from [A] = [B] = 1 mol/L, with k_f = 4 and k_r = 1 (K = 4 L/mol): they cross at [C] = 0.61 mol/L.', [0, 1], [C('4*(1-x)^2', 'forward k_f[A][B]'), C('x', 'reverse k_r[C]')], { vlines: [{ x: 0.61, label: 'equilibrium' }], xlabel: '[C] (mol/L)', ylabel: 'rate' }) }],
      intuition: 'Two-way traffic over a bridge: once as many cars cross each way per minute, the numbers on each bank stop changing, though cars never stop crossing.',
      intuitionFigure: bars('Rates at the start and at equilibrium (k_f = 4, k_r = 1): equal, not zero, at the end.', ['start', 'equilibrium'], [['forward', [4, 0.61]], ['reverse', [0, 0.61]]]),
      misconception: 'That reactions stop at equilibrium. Both directions continue at equal rates; isotope-labelled C added to the mixture shows up in A and B.',
      misconceptionFigure: contrast('Equilibrium is dynamic.', 'At equilibrium the molecules stop reacting.', 'Forward and reverse both run at 0.61 (mol/L)/unit time; only the net change is zero.'),
      check: { q: 'With K = 4 L/mol, is a mixture with [A] = [B] = [C] = 0.5 mol/L at equilibrium?', a: 'Q = 0.5/(0.5 × 0.5) = 2 L/mol < K, so not yet: more C forms until Q = 4.' },
      checkFigure: nl('Reaction quotient Q (L/mol): 2 now, K = 4 at equilibrium, so the reaction runs forward.', 0, 6, [[2, 'Q now'], [4, 'K']], [[0, 4, 'Q < K: forward']], { step: 1 }),
    },
    S4: {
      explain: [{ text: 'The equilibrium constant is the ratio $k_f/k_r$, and each rate constant has its own barrier. Heating raises the rate with the larger barrier more, because the barrier sits in the exponent. In this model the reverse barrier (2.0 in units of k_B at T = 1) is larger than the forward one (0.8), so C lies 1.2 units lower than A + B and the forward reaction releases heat. Raising T from 1 to 2.4 multiplies k_f by e^(0.8 × 0.583) = 1.6 but k_r by e^(2.0 × 0.583) = 3.2, so K halves and the mixture shifts back towards A + B.',
        figure: plot('Rate constants e^(−E/T) for the forward (E = 0.8) and reverse (E = 2.0) barriers, and K = e^(1.2/T), against the model temperature: K halves from T = 1 to T = 2.4.', [0.5, 3], [C('exp(-0.8/x)', 'k_f'), C('exp(-2/x)', 'k_r'), C('exp(1.2/x)', 'K = k_f/k_r')], { y: [0, 4], vlines: [{ x: 1, label: 'T = 1' }, { x: 2.4, label: 'T = 2.4' }], xlabel: 'T (model units)' }) }],
      intuition: 'Here heat is a product of the forward reaction; adding heat is like adding product, so the equilibrium leans back.',
      intuitionFigure: flow('Heating an exothermic equilibrium (model, T = 1 → 2.4).', ['heat the mixture', 'k_r grows ×3.2, k_f ×1.6', 'K halves', 'more A + B']),
      misconception: 'That heating always pushes a reaction forward because everything speeds up. It speeds both directions; the one with the larger barrier gains more, and for an exothermic reaction that is the reverse one.',
      misconceptionFigure: contrast('Faster is not further.', 'Heating speeds the reaction, so more C forms.', 'Both directions speed up; the reverse (barrier 2.0) gains ×3.2, the forward (0.8) only ×1.6, so K halves and less C remains.'),
      check: { q: 'If instead the forward barrier were the larger one, which way would heating shift the equilibrium?', a: 'Forward, towards C: k_f would grow more than k_r, K would rise, and the reaction would be endothermic.' },
      checkFigure: plot('K against temperature for a barrier difference of 1.2: falling for an exothermic reaction, rising for an endothermic one.', [0.5, 3], [C('exp(1.2/x)', 'exothermic: K = e^(1.2/T)'), C('exp(-1.2/x)', 'endothermic: K = e^(−1.2/T)')], { y: [0, 4], xlabel: 'T (model units)' }),
    },
  },
  // ======================================================================= the water cycle (flagship)
  'The water cycle': {
    S1: {
      explain: [{ text: 'Water molecules at the surface jostle with a spread of energies; the few moving fast enough upward break free of their neighbours. Each kilogram that escapes carries off about 2.45 MJ of latent heat at 20 °C, which is why evaporation cools a lake. The rate rises with the water temperature, with wind that sweeps the moist layer away, and with dry air above. Worldwide, oceans and land send about 486 000 km³ of water into the air each year (Trenberth et al. 2007), lifted by the Sun’s energy and returned as rain and snow.',
        figure: bars('The global water cycle’s yearly fluxes in 1000 km³ (Trenberth et al. 2007): evaporation over the ocean exceeds rain there by the 40 that rivers bring back from land.', ['ocean evap.', 'ocean rain', 'land rain', 'land evap.', 'rivers'], [['10³ km³ per year', [413, 373, 113, 73, 40]]], { ylabel: '10³ km³/yr' }) }],
      intuitionFigure: flow('The Sun-driven cycle.', ['Sun heats the lake', 'water evaporates', 'vapour rises and cools', 'cloud forms', 'rain flows back to the lake']),
      misconceptionFigure: bars('Where land water reaching the air comes from: transpiration through plants is the larger share (isotope estimate about 80–90 %; other methods give lower, near 60 %).', ['plants (transpiration)', 'soil, lakes, wet leaves'], [['share (%)', [80, 20]]], { ylabel: '%' }),
      checkFigure: flow('Why wind and dry air cool a lake.', ['wind and dry air', 'faster evaporation', '2.45 MJ taken per kg evaporated', 'lake cools']),
    },
    S2: {
      explain: [{ text: 'Above a water surface molecules leave and return all the time. When the vapour’s partial pressure reaches $e_s(T)$, as many return as leave and the air is saturated. $e_s$ depends only on temperature, and steeply: about 1.23 kPa at 10 °C, 2.34 kPa at 20 °C and 4.25 kPa at 30 °C, close to 7 % more per kelvin. Relative humidity is the ratio $e/e_s$. Cooling air with a fixed vapour content raises its relative humidity until it reaches 100 % at the dew point; further cooling makes the excess condense as dew, fog or cloud.',
        figure: plot('Saturation vapour pressure e_s(T) = 0.6112 e^(17.62T/(243.12 + T)) kPa (Magnus formula): 1.23 kPa at 10 °C, 2.34 at 20 °C, 4.25 at 30 °C.', [-10, 40], [C('0.6112*exp(17.62*x/(243.12+x))', 'e_s (kPa)')], { points: [[10, 1.228, '10 °C'], [20, 2.339, '20 °C'], [30, 4.246, '30 °C']], xlabel: 'T (°C)', ylabel: 'kPa' }) }],
      intuitionFigure: bars('Water vapour that saturated air can hold at sea level, 622 e_s/(p − e_s) g per kg of dry air: it doubles about every 10 K.', ['0 °C', '10 °C', '20 °C', '30 °C'], [['g/kg', [3.8, 7.6, 14.7, 27.2]]], { ylabel: 'g/kg' }),
      misconceptionFigure: contrast('Saturation belongs to water, not to air.', 'Air soaks up water like a sponge until it is full.', 'Saturation is reached when vapour pressure equals e_s(T); with no air at all, the vapour above water would still saturate at the same pressure.'),
      checkFigure: plot('Air at 20 °C and 50 % relative humidity holds e = 1.17 kPa of vapour; cooled, it saturates where e_s falls to 1.17 kPa, at 9.3 °C.', [0, 25], [C('0.6112*exp(17.62*x/(243.12+x))', 'e_s (kPa)')], { hlines: [{ y: 1.17, label: 'e = 1.17 kPa' }], vlines: [{ x: 9.3, label: 'dew point 9.3 °C' }], points: [[20, 1.17, 'start, 50 %']], xlabel: 'T (°C)', ylabel: 'kPa' }),
    },
    S3: {
      explain: [{ text: 'When wind meets a mountain range the air has to rise. Rising air expands into lower pressure and cools, by about 9.8 °C per kilometre while it is unsaturated. At the height where it reaches its dew point, the cloud base, condensation begins; from there it cools more slowly, about 6 °C per km, because the condensing vapour releases latent heat. The windward slope gets the rain. On the far side the air sinks and warms at the dry rate all the way down: air that left the coast at 20 °C can arrive in the lee at about 28 °C, warmer and much drier, the rain shadow or föhn.',
        figure: plot('Temperature of air crossing a 3 km range (start 20 °C, dew point 12 °C): dry ascent to the cloud base at 1 km, moist ascent to −1.8 °C at the crest, dry descent to 27.6 °C in the lee.', [0, 3], [C('x<1 ? 20-9.8*x : 10.2-6*(x-1)', 'rising, windward'), C('-1.8+9.8*(3-x)', 'sinking, lee side')], { points: [[1, 10.2, 'cloud base'], [3, -1.8, 'crest'], [0, 27.6, 'lee foot']], xlabel: 'height (km)', ylabel: 'T (°C)' }) }],
      intuitionFigure: sk('A mountain as a lift: moist air rises and rains out on the windward slope; dry air sinks into the rain shadow beyond.', [Pa('M5 55 L50 12 L95 55 Z', { fill: '#b9a98a' }), Ar(6, 48, 30, 30), Ellipse(32, 18, 12, 5), Ln(28, 24, 26, 30), Ln(33, 24, 31, 30), Ln(38, 24, 36, 30), Ar(66, 26, 90, 46), T(18, 12, 'wind, moist'), T(30, 34, 'rain'), T(84, 32, 'dry, warm'), T(50, 8, 'crest')]),
      misconceptionFigure: contrast('What makes the cloud on the mountain?', 'Clouds drifting with the wind pile up against the mountain like snow against a fence.', 'The air is forced up the slope, expands and cools below its dew point; the cloud forms there, in the rising air.'),
      checkFigure: bars('The same air before and after crossing the 3 km range: warmer and drier on the lee side.', ['windward foot', 'lee foot'], [['temperature (°C)', [20, 27.6]]], { ylabel: '°C' }),
    },
  },
  // ======================================================================= the Galton board (flagship)
  'Galton board': {
    S1: {
      explain: [{ text: 'At each peg the bead goes right with probability $p$ and left with $1 - p$, and nothing about earlier pegs changes those odds. Such a two-outcome, independent experiment is a Bernoulli trial. Code right as 1 and left as 0: the mean outcome is p and the variance p(1 − p), largest, 0.25, for a fair peg with p = 0.5. A bead’s final bin is just the number of 1s it collected, so the whole board is a machine for adding up Bernoulli trials.',
        figure: bars('Variance p(1 − p) of one bounce: largest, 0.25, for a fair peg.', ['p = 0.1', '0.3', '0.5', '0.7', '0.9'], [['p(1 − p)', [0.09, 0.21, 0.25, 0.21, 0.09]]], { highlight: [2] }) }],
      intuition: 'Each peg is a coin flip: heads, the bead steps right; tails, it steps left.',
      intuitionFigure: tree('Two pegs, four equally likely paths when p = 0.5.', nd('bead', [nd('right', [nd('RR: 0.25', [], 'p'), nd('RL: 0.25', [], '1 − p')], 'p = 0.5'), nd('left', [nd('LR: 0.25', [], 'p'), nd('LL: 0.25', [], '1 − p')], '1 − p')])),
      misconception: 'That after several rights a left is “due”. The trials are independent: the next bounce goes right with probability p whatever happened before.',
      misconceptionFigure: contrast('Pegs have no memory.', 'After five rights in a row, the next bounce is more likely to go left.', 'P(right) = 0.5 at every peg, after any history: the five earlier bounces change nothing.'),
      checkFigure: table('In the model the next bounce ignores the last one.', ['previous bounce', 'P(next right)'], [['right', '0.5'], ['left', '0.5']]),
    },
    S2: {
      explain: [{ text: 'A bead lands in bin k when it bounced right exactly k times out of N. Each particular path with k rights has probability $p^k(1-p)^{N-k}$, and there are $\\binom{N}{k}$ such paths. With 10 rows and p = 0.5 every path has probability 1/1024, and 252 of them end in the middle bin: P(K = 5) = 252/1024 ≈ 0.246. Only one path reaches each edge bin, so P(K = 0) = 1/1024 ≈ 0.001. The mean is Np = 5 and the variance Np(1 − p) = 2.5.',
        figure: { kind: 'distribution', caption: 'Binomial distribution for 10 rows with p = 0.5: the centre bin takes 24.6 % of the beads.', dist: 'binomial', params: { size: 10, prob: 0.5 }, shade: { from: 5, to: 5, label: 'P(K = 5)' }, xlabel: 'bin k' } }],
      intuitionFigure: bars('Number of paths to each bin on a 10-row board, C(10, k): 252 lead to the centre, 1 to each edge.', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], [['paths', [1, 10, 45, 120, 210, 252, 210, 120, 45, 10, 1]]], { highlight: [5], xlabel: 'bin k' }),
      misconception: 'That the most likely bin is very likely. With 10 fair rows the centre bin gets only 24.6 % of the beads; three quarters land elsewhere.',
      misconceptionFigure: contrast('Most likely is not likely.', 'The centre bin is the most likely, so most beads land there.', 'P(K = 5) = 252/1024 ≈ 25 %; P(K ≠ 5) ≈ 75 %.'),
      checkFigure: table('Counting paths on a 10-row board with p = 0.5.', ['bin', 'paths', 'probability'], [['0', '1', '0.001'], ['3', '120', '0.117'], ['5', '252', '0.246'], ['all', '1024', '1']], { highlight: [[2, 1]] }),
    },
    S3: {
      explain: [{ text: 'For many rows the binomial bars hug a bell curve with the same mean $Np$ and standard deviation $\\sqrt{Np(1-p)}$. With N = 100 fair rows the bins centre on 50 with σ = 5. The exact chance of landing between 45 and 55 inclusive is 72.9 %; the normal curve gives the same 72.9 % if the bins are counted as the interval 44.5 to 55.5 (a continuity correction), and 68 % if they are not. De Moivre found this approximation in 1733; Laplace extended it, and it became the first central limit theorem.',
        figure: { kind: 'distribution', caption: 'Normal approximation to 100 fair rows, mean 50 and σ = 5: the area from 44.5 to 55.5 is 0.729, the binomial chance of bins 45–55.', dist: 'normal', params: { mean: 50, sd: 5 }, shade: { from: 44.5, to: 55.5, label: 'P(44.5 < X < 55.5)' }, xlabel: 'bin' } }],
      intuition: 'Step back from a tall histogram and its staircase outline melts into the smooth bell.',
      intuitionFigure: { kind: 'distribution', caption: 'Binomial distribution for 40 fair rows: the bars already trace the bell curve.', dist: 'binomial', params: { size: 40, prob: 0.5 }, xlabel: 'bin k' },
      misconceptionFigure: contrast('Where does the bell come from?', 'Each ball is steered towards the centre, so the centre fills up.', 'Every bounce is a fair 50/50; the bell is the count of paths, C(N, k), and nothing steers any ball.'),
      checkFigure: plot('Spread of the pile, √(Np(1 − p)) for p = 0.5: doubling the rows multiplies it by √2.', [0, 200], [C('sqrt(x/4)', 'σ (bins)')], { points: [[50, 3.54, 'N = 50'], [100, 5, 'N = 100'], [200, 7.07, 'N = 200']], xlabel: 'rows N' }),
    },
  },
  // ======================================================================= supply and demand (flagship; example curves)
  'Supply and demand': {
    S1: {
      explain: [{ text: 'Line up the buyers by how much the good is worth to each, their reservation values. At a price $p$ everyone who values it above p wants to buy, so the quantity demanded $D(p)$ counts the buyers whose values lie above p. Raising the price loses the buyers at the margin, which is why demand curves slope down. With the example demand D(p) = 100 − 2p, 60 units are wanted at p = 20 and 40 at p = 30, and at p = 50 nobody buys.',
        figure: plot('Example demand D(p) = 100 − 2p: 60 units at p = 20, 40 at p = 30, none at p = 50.', [0, 50], [C('100-2*x', 'D(p)')], { points: [[20, 60, 'p = 20'], [30, 40, 'p = 30']], xlabel: 'price p', ylabel: 'quantity' }) }],
      intuition: 'A staircase of buyers: each step is one buyer’s value, the price is a water level, and every step above the water buys.',
      intuitionFigure: bars('Eight buyers’ values, highest first (illustrative): at p = 25 the five whose values exceed 25 buy.', ['1', '2', '3', '4', '5', '6', '7', '8'], [['value', [45, 40, 34, 30, 26, 21, 15, 10]]], { highlight: [0, 1, 2, 3, 4], xlabel: 'buyer' }),
      misconception: 'Confusing a movement along the demand curve with a shift of it. A change in the good’s own price moves along D(p); a change in incomes or tastes shifts the whole curve.',
      misconceptionFigure: contrast('Along the curve, or a new curve?', 'The price fell, so demand increased: the demand curve moved right.', 'A lower price moves along the same D(p) to a larger quantity; only incomes, tastes or other prices shift D itself.'),
      check: { q: 'With D(p) = 100 − 2p, how many units are demanded at p = 35?', a: '100 − 70 = 30 units.' },
      checkFigure: plot('Reading the example demand at p = 35: 30 units.', [0, 50], [C('100-2*x', 'D(p)')], { points: [[35, 30, 'p = 35: 30 units']], xlabel: 'price p', ylabel: 'quantity' }),
    },
    S2: {
      explain: [{ text: 'Sellers line up by cost. At a price $p$ every seller whose cost lies below p can sell without loss, so the quantity supplied $S(p)$ counts the sellers with costs below p; a higher price brings in costlier sellers, and supply slopes up. With the example supply S(p) = 3p − 25, nothing is offered below p = 8.33, 35 units are offered at p = 20 and 65 at p = 30. Shifts come from costs: a cheaper input moves the whole curve right.',
        figure: plot('Example supply S(p) = 3p − 25: nothing below p = 8.33, 35 units at p = 20, 65 at p = 30.', [0, 45], [C('max(0,3*x-25)', 'S(p)')], { points: [[20, 35, 'p = 20'], [30, 65, 'p = 30']], xlabel: 'price p', ylabel: 'quantity' }) }],
      intuition: 'A staircase of sellers’ costs, cheapest first: the price line decides how many steps lie below it.',
      intuitionFigure: bars('Eight sellers’ costs, cheapest first (illustrative): at p = 25 the five with costs below 25 sell.', ['1', '2', '3', '4', '5', '6', '7', '8'], [['cost', [9, 12, 15, 18, 22, 27, 33, 40]]], { highlight: [0, 1, 2, 3, 4], xlabel: 'seller' }),
      misconception: 'That a higher price makes each seller’s production cheaper. The price does not change costs; it lets sellers with higher costs join in.',
      misconceptionFigure: contrast('Why does supply rise with the price?', 'At a higher price the same sellers can produce more cheaply.', 'Costs stay the same; at p = 30 sellers with costs up to 30 can sell without loss, so more of them take part.'),
      check: { q: 'At what price does the example supply first offer 50 units?', a: '3p − 25 = 50 gives p = 25.' },
      checkFigure: plot('Solving S(p) = 50 for the example supply: p = 25.', [0, 45], [C('max(0,3*x-25)', 'S(p)')], { hlines: [{ y: 50, label: '50 units' }], points: [[25, 50, 'p = 25']], xlabel: 'price p', ylabel: 'quantity' }),
    },
    S3: {
      explain: [{ text: 'At the price $p^*$ where $D(p^*) = S(p^*)$ every buyer who values the good above p* can meet a seller whose cost is below it, and nobody is left waiting. For the example curves 100 − 2p = 3p − 25 gives p* = 25 and q* = 50. Above p* sellers offer more than buyers want and unsold goods push the price down; below it buyers queue and bid it up. In Smith’s 1962 classroom double auctions prices settled near p* within a few trading periods, and Gode and Sunder (1993) found high efficiency even with random traders forbidden only to trade at a loss.',
        figure: plot('Example demand and supply cross at p* = 25, q* = 50.', [0, 50], [C('100-2*x', 'demand D(p)'), C('max(0,3*x-25)', 'supply S(p)')], { points: [[25, 50, 'p* = 25, q* = 50']], xlabel: 'price p', ylabel: 'quantity' }) }],
      intuitionFigure: plot('Excess demand D(p) − S(p) = 125 − 5p for the example: positive (shortage, prices bid up) below p* = 25, negative (surplus) above.', [8.33, 45], [C('125-5*x', 'D − S')], { hlines: [{ y: 0, label: '' }], vlines: [{ x: 25, label: 'p*' }], xlabel: 'price p' }),
      misconceptionFigure: contrast('Who makes the market clear?', 'Prices converge only if traders are well informed and rational.', 'Gode and Sunder’s random “zero-intelligence” traders, bound only by a no-loss rule, still reached allocative efficiency near 100 %.'),
      checkFigure: plot('A tax of 5 per unit on sellers shifts supply to 3(p − 5) − 25: the equilibrium moves from (25, 50) to (28, 44).', [0, 50], [C('100-2*x', 'demand'), C('max(0,3*x-25)', 'supply'), C('max(0,3*x-40)', 'supply with tax', { dash: true })], { points: [[25, 50, 'before'], [28, 44, 'after']], xlabel: 'price p', ylabel: 'quantity' }),
    },
  },
  // ======================================================================= osmosis (flagship)
  'Osmosis': {
    S1: {
      explain: [{ text: 'A semi-permeable membrane is a sieve at the molecular scale. Water molecules, about 0.28 nm across, fit through its pores; sucrose molecules, about 1 nm, and hydrated ions do not. Living cells use lipid bilayers that water crosses slowly on its own and quickly through aquaporins, protein channels that pass water in single file, up to a few billion molecules per second per channel, while blocking ions and even protons. Agre’s 1992 discovery of these channels explained why some cells swell within seconds in fresh water.',
        figure: bars('Sizes that decide what passes (nm): water fits the aquaporin’s 0.28 nm constriction; hydrated Na⁺ and sucrose do not.', ['water', 'aquaporin pore', 'hydrated Na⁺', 'sucrose'], [['size (nm)', [0.28, 0.28, 0.72, 1.0]]], { highlight: [1], ylabel: 'nm' }) }],
      intuitionFigure: sk('A semi-permeable membrane: small water molecules pass through the pores, larger solute molecules are held back.', [Rc(48, 4, 4, 52, { tone: 'muted' }), Rc(48, 18, 4, 4, { fill: '#ffffff' }), Rc(48, 38, 4, 4, { fill: '#ffffff' }), Ci(30, 20, 1.5), Ci(36, 30, 1.5), Ar(40, 20, 60, 20), Ci(70, 30, 4.5, { tone: 'accent' }), Ci(80, 46, 4.5, { tone: 'accent' }), T(22, 50, 'water'), T(80, 14, 'solute'), T(50, 58, 'membrane')]),
      misconception: 'That the membrane pumps water. A semi-permeable membrane is passive; it only decides what can pass. The drive comes from the difference in the water’s chemical potential.',
      misconceptionFigure: contrast('Who does the work?', 'The membrane actively pumps water towards the solute.', 'The membrane only filters; water moves down its own chemical-potential difference, which the solute creates.'),
      check: { q: 'Which passes an ideal semi-permeable membrane: water, sucrose or Na⁺ ions?', a: 'Only water: sucrose and hydrated ions are too large for its pores.' },
      checkFigure: table('What an ideal semi-permeable membrane lets through.', ['particle', 'size', 'passes?'], [['water', '0.28 nm', 'yes'], ['hydrated Na⁺', '≈ 0.7 nm', 'no'], ['sucrose', '≈ 1 nm', 'no']], { highlight: [[0, 2]] }),
    },
    S2: {
      explain: [{ text: 'Dissolved particles lower the chemical potential of the water around them. With the same pressure on both sides, the water on the pure side therefore has the higher potential and crosses towards the solution. As the solution column rises, its extra hydrostatic pressure raises the water’s potential on that side, and the flow stops when the two potentials are equal. Across a membrane with reflection coefficient σ the volume flow is $J = L_p(\\Delta P - \\sigma\\Delta\\pi)$: press on the solution harder than its osmotic pressure and the flow reverses, which is how reverse-osmosis desalination works.',
        figure: plot('Volume flow out of the solution, J = L_p(ΔP − Δπ) for σ = 1, against the applied pressure in units of Δπ: osmosis into the solution below 1, reverse osmosis above.', [0, 2], [C('x-1', 'J / (L_p Δπ)')], { hlines: [{ y: 0, label: '' }], vlines: [{ x: 1, label: 'ΔP = Δπ: no flow' }], xlabel: 'ΔP / Δπ' }) }],
      intuitionFigure: flow('How the flow starts and stops.', ['solute lowers water’s chemical potential', 'water crosses into the solution', 'column rises, pressure builds', 'potentials equal: flow stops']),
      misconceptionFigure: contrast('Diffusion of water, or bulk flow?', 'Water simply diffuses down its own concentration gradient, molecule by molecule.', 'In pores the flow is largely bulk flow driven by the difference in water’s chemical potential (pressure plus solute effect).'),
      checkFigure: bars('Driving pressure σΔπ across membranes that reflect a solute fully, half or not at all (Δπ = 7.7 bar).', ['σ = 1', 'σ = 0.5', 'σ = 0'], [['σΔπ (bar)', [7.7, 3.85, 0]]], { highlight: [2], ylabel: 'bar' }),
    },
    S3: {
      explain: [{ text: 'For dilute solutions van ’t Hoff found that the osmotic pressure obeys the ideal gas law, $\\pi = cRT$, with $c$ the concentration of dissolved particles. The numbers are large: 0.1 mol/L of sucrose at 25 °C gives 100 mol/m³ × 8.314 × 298 K = 2.48 × 10⁵ Pa, enough to hold up a water column about 25 m tall. Seawater, about 1.1 osmol/L of particles, has an osmotic pressure near 27 bar, which is why reverse-osmosis plants press seawater at 55 to 80 bar.',
        figure: plot('π = cRT at 25 °C: 2.5 bar for 0.1 mol/L sucrose, 7.2 bar for body fluids (0.29 osmol/L), 27 bar for seawater (1.1 osmol/L).', [0, 1.2], [C('24.78*x', 'π (bar)')], { points: [[0.1, 2.48, 'sucrose 0.1 M'], [0.29, 7.19, 'body fluids'], [1.1, 27.3, 'seawater']], xlabel: 'c (osmol/L)', ylabel: 'bar' }) }],
      intuition: 'Each dissolved particle acts like a gas molecule bouncing in the solution: twice the particles, twice the pressure.',
      intuitionFigure: table('The same law for gases and dilute solutions.', ['', 'ideal gas', 'dilute solution'], [['law', 'P = nRT/V', 'π = cRT'], ['particles', 'gas molecules', 'solute particles'], ['1 mol per L, 298 K', '24.8 bar', '24.8 bar']]),
      misconceptionFigure: bars('Osmotic pressure of 0.1 mol/L solutions at 25 °C: what counts is particles, about 1, 2 and 3 per formula unit.', ['sucrose', 'NaCl', 'CaCl₂'], [['π (bar)', [2.48, 4.96, 7.43]]], { ylabel: 'bar' }),
      checkFigure: nl('Osmotic pressures (bar): 0.15 mol/L NaCl at 37 °C and seawater.', 0, 30, [[7.7, '0.15 M NaCl, 37 °C'], [27, 'seawater']], [], { step: 5 }),
    },
  },
};
function Ellipse(x, y, rx, ry, o = {}) { return { shape: 'ellipse', x, y, rx, ry, ...o }; }

// merge into one chain (after the grounding of seeds-sources.js): text only where the step has none, figures always
export function figureChain(A) {
  const F = FIGS[A && A.title]; if (!F) return A;
  const C2 = o => JSON.parse(JSON.stringify(o));
  for (const st of A.chain || []) {
    const f = F[st.id]; if (!f) continue;
    if (f.explain && !(Array.isArray(st.explain) && st.explain.length)) st.explain = C2(f.explain);
    if (f.intuition && !st.intuition) st.intuition = f.intuition;
    if (f.misconception && !st.misconception) st.misconception = f.misconception;
    if (f.check && !(st.check && st.check.q)) st.check = C2(f.check);
    if (f.intuitionFigure && st.intuition && !st.intuitionFigure) st.intuitionFigure = C2(f.intuitionFigure);
    if (f.misconceptionFigure && st.misconception && !st.misconceptionFigure) st.misconceptionFigure = C2(f.misconceptionFigure);
    if (f.checkFigure && st.check && st.check.q && !st.check.figure) st.check.figure = C2(f.checkFigure);
  }
  return A;
}
