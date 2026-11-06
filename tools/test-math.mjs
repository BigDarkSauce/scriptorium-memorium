#!/usr/bin/env node
// Scriptorium Memorium — unit tests for the maths typesetter in js/util.js (mathHTML / mathRuns / mathText).
// RUN: node tools/test-math.mjs        (no browser needed; exit code 1 when a case fails)
//
// Each case gives the input text and the expected result in a compact "flat" notation of the HTML output:
//   *x*  italic        ^{…} superscript     _{…} subscript      [n|d] stacked fraction     √{…} radical (vinculum over …)
//   everything else is the literal text; thin spaces are written ' (U+2009), narrow no-break spaces ~ (U+202F).
// mode 'label' = compact one-line target (fractions with a solidus); default 'html' = running text (stacked fractions).
import { mathHTML, mathRuns, mathText } from '../js/util.js';

// parse the (well-formed, generated) HTML into a tree and flatten it
function flatHTML(h) {
  const root = { kids: [] }, st = [root]; let i = 0;
  while (i < h.length) {
    if (h[i] === '<') {
      const j = h.indexOf('>', i), tag = h.slice(i + 1, j); i = j + 1;
      if (tag[0] === '/') { st.pop(); continue; }
      const cls = (/class="([^"]+)"/.exec(tag) || [])[1] || '', node = { tag: tag.split(/\s/)[0], cls, kids: [] };
      st[st.length - 1].kids.push(node); st.push(node); continue;
    }
    let j = h.indexOf('<', i); if (j < 0) j = h.length;
    st[st.length - 1].kids.push(h.slice(i, j).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')); i = j;
  }
  const F = n => {
    if (typeof n === 'string') return n;
    const K = n.kids.map(F), all = K.join('');
    if (n.tag === 'i') return '*' + all + '*';
    if (n.tag === 'sup') return '^{' + all + '}';
    if (n.tag === 'sub') return '_{' + all + '}';
    if (n.tag === 'code') return '`' + all + '`';
    if (n.cls === 'm-frac') return '[' + K[0] + '|' + K[1] + ']';
    if (n.cls === 'm-ss') return '_{' + K[1] + '}^{' + K[0] + '}';
    if (n.cls === 'm-idx') return '(' + all + ')';
    if (n.cls === 'm-rad') return '{' + all + '}';
    return all;
  };
  return F(root).replace(/\u2009/g, "'").replace(/\u202F/g, '~');
}

const C = [
  // --- the defect strings from the screenshots
  ['surface · z = a*sin(x)*cos(y) + 0.05*(x^2+y^2)', "surface · *z* = *a*'sin'*x*'cos'*y* + 0.05(*x*^{2} + *y*^{2})"],
  ['surface · z = a*sin(x) × cos(y) + 0.05 × (x²+y²)', "surface · *z* = *a*'sin'*x* × cos'*y* + 0.05 × (*x*² + *y*²)", 'html', 'mixed * and × (already half-converted)'],
  ['BODY 2 OF 2 · surface · z = a*sin(x)*cos(y) + 0.05*(x^2+y^2)', "BODY 2 OF 2 · surface · *z* = *a*'sin'*x*'cos'*y* + 0.05(*x*^{2} + *y*^{2})"],
  ['rate 1.5·e^(−Eb/kT)', "rate 1.5e^{−*E*_{*b*}/*kT*}"],
  ['1.5*e^(-Eb/kT)', "1.5e^{−*E*_{*b*}/*kT*}"],
  ['collision theory (1+Ea/kT)e^(−Ea/kT)', "collision theory (1 + [*E*_{*a*}|*kT*])e^{−*E*_{*a*}/*kT*}"],
  ['collision theory (1+Ea/kT)e^(−Ea/kT)', "collision theory (1 + *E*_{*a*}/*kT*)e^{−*E*_{*a*}/*kT*}", 'label'],
  // --- powers, roots, functions
  ['x^2', '*x*^{2}'], ['x**2 + y**2', '*x*^{2} + *y*^{2}'], ['x^(n+1)', '*x*^{*n* + 1}'], ['x^-1', '*x*^{−1}'], ['e^-x', 'e^{−*x*}'],
  ['sqrt(x^2+y^2)', '√{*x*^{2} + *y*^{2}}'], ['T = 2*pi*sqrt(L/g)', '*T* = 2π√{[*L*|*g*]}'], ['T = 2*pi*sqrt(L/g)', '*T* = 2π√{*L*/*g*}', 'label'],
  ['cbrt(V)', '(3)√{*V*}'], ['exp(-x^2/2)', 'e^{−*x*^{2}/2}'], ['abs(v)', '|*v*|'], ['abs(x - y)', '|*x* − *y*|'],
  ['ln(2)/c', "[ln'2|*c*]"], ['log10(I/I0)', 'log₁₀([*I*|*I*_{0}])'], ['sin(theta)', "sin'*θ*"], ['cos(omega*t + phi)', 'cos(*ωt* + *φ*)'],
  ['sin(2x)', "sin'2*x*"], ['a*sin(x)*cos(y)', "*a*'sin'*x*'cos'*y*"], ['atan2(y, x)', 'arctan2(*y*, *x*)'],
  ['pow(r, 3)', '*r*^{3}'], ['hypot(dx, dy)', '√{d*x*^{2} + d*y*^{2}}'],
  ['F = G*m1*m2/r^2', '*F* = [*Gm*_{1}*m*_{2}|*r*^{2}]'],
  ['F = G*m1*m2/r^2', '*F* = *Gm*_{1}*m*_{2}/*r*^{2}', 'label'],
  ['E = 1/2*m*v^2', '*E* = ½*mv*^{2}'], ['KE = 0.5*m*v**2', '*KE* = 0.5*mv*^{2}'],
  ['(x+1)/(x-1)', '[*x* + 1|*x* − 1]'], ['(x+1)/(x-1)', '(*x* + 1)/(*x* − 1)', 'label'],
  ['2*3 = 6', '2'+"'×'"+'3 = 6'], ['x*2', '*x*·2'], ['3*(a+b)', '3(*a* + *b*)'], ['(a+b)*(c+d)', '(*a* + *b*)(*c* + *d*)'],
  ['dy/dx = -k*y', '[d*y*|d*x*] = −*ky*'], ['theta_0 = 0.3', '*θ*_{0} = 0.3'], ['Delta T = T_max - T_min', 'Δ*T* = *T*_{max} − *T*_{min}'],
  ['omega0 = sqrt(k/m)', '*ω*_{0} = √{[*k*|*m*]}'], ['n! / (k!(n-k)!)', '[*n*!|*k*!(*n* − *k*)!]'],
  // --- relations and operators
  ['x <= 2', '*x* ≤ 2'], ['y >= 0', '*y* ≥ 0'], ['a != b', '*a* ≠ *b*'], ['x -> 0', '*x* → 0'], ['v ~= 3.2', '*v* ≈ 3.2'], ['x = 2 +- 0.1', '*x* = 2 ± 0.1'],
  ['A + B -> C', 'A + B → C'], ['C → A + B', 'C → A + B'], ['2H2 + O2 -> 2H2O', '2H_{2} + O_{2} → 2H_{2}O'],
  ['when the answer is <= 3 or -> next', 'when the answer is ≤ 3 or → next'],
  // --- scientific notation and minus
  ['1.2e-3', "1.2'×'10^{−3}"], ['k = 6.02e23 per mol', "*k* = 6.02'×'10^{23} per mol"], ['rate 1.23e+5 /s', "rate 1.23'×'10^{5}~/s"], ['1e-9 m', '10^{−9}~m'],
  ['T = -3', '*T* = −3'], ['-x^2', '−*x*^{2}'], ['x - y', '*x* − *y*'], ['T = 300 K', '*T* = 300~K'],
  // --- subscripts and indices
  ['m1r1 = m2r2', '*m*_{1}*r*_{1} = *m*_{2}*r*_{2}'], ['P_in = P_out', '*P*_{in} = *P*_{out}'], ['x_i + x_{i+1}', '*x*_{*i*} + *x*_{*i* + 1}'], ['k_reverse', '*k*_{reverse}'],
  ['N_A · N_B · N_C', '*N*_{A} · *N*_{B} · *N*_{C}'], ['the mass m1 and the length L2', 'the mass *m*_{1} and the length *L*_{2}'],
  // --- chemistry
  ['H2O', 'H_{2}O'], ['CO2 dissolves', 'CO_{2} dissolves'], ['Ca2+ ions', 'Ca^{2+} ions'], ['SO4^2- and Na+', 'SO_{4}^{2−} and Na^{+}'], ['Cl- and OH-', 'Cl^{−} and OH^{−}'], ['NaCl', 'NaCl'],
  ['C6H12O6 + 6O2 -> 6CO2 + 6H2O', 'C_{6}H_{12}O_{6} + 6O_{2} → 6CO_{2} + 6H_{2}O'],
  // --- units
  ['I = 2.5 kg*m^2', '*I* = 2.5~kg·m^{2}'], ['g = 9.81 m/s^2', '*g* = 9.81~m/s^{2}'], ['ΔH = -286 kJ*mol^-1', 'Δ*H* = −286~kJ·mol^{−1}'], ['J·mol⁻¹', 'J·mol⁻¹'],
  ['speed in m/s', 'speed in m/s'], ['units kg*m^2/s^2', 'units kg·m^{2}/s^{2}'], ['a = 3 m/s^2', '*a* = 3~m/s^{2}'],
  // --- prose that must stay as it is
  ['as it is, this is a test', 'as it is, this is a test'], ['Step S9 follows S8; see G2.', 'Step S9 follows S8; see G2.'],
  ['and/or input/output', 'and/or input/output'], ['a well-known x-ray result', 'a well-known x-ray result'],
  ['see https://example.org/a*b^c/x_y?q=1', 'see https://example.org/a*b^c/x_y?q=1'], ['open room-example.json and util.js', 'open room-example.json and util.js'],
  ['run `x^2 * 3` in code', 'run `x^2 * 3` in code'], ['the $x^2$ in TeX', 'the $x^2$ in TeX'], ['A note* here', 'A note* here'],
  ['It is 2024/05/01 today', 'It is 2024/05/01 today'], ['the file_name_here', 'the file_name_here'], ['e.g. a ball, i.e. one', 'e.g. a ball, i.e. one'],
  ['pH 7 and pKa', 'pH 7 and pKa'], ['10:30 am', '10:30 am'], ['Chapter 3-4', 'Chapter 3-4'],
  // --- Greek names only inside expressions
  ['alpha = 0.5', '*α* = 0.5'], ['the alpha particle', 'the alpha particle'], ['theta1 - theta2', '*θ*_{1} − *θ*_{2}'],
  ['z = f(x,y)', '*z* = *f*(*x*, *y*)'], ['Q = [C]/([A][B])', '*Q* = [[*C*]|[*A*][*B*]]'], ['2 ln 2 / c = 4.62 s', "[2'ln'2|*c*] = 4.62~s"],
  ['ln(|Δθ₂|/ε)/t', "[ln([|Δ*θ*_{2}||*ε*])|*t*]"],
];

let fail = 0, n = 0;
for (const [inp, want, mode = 'html', note] of C) {
  n++; let got;
  try { got = flatHTML(mathHTML(inp, mode)); } catch (e) { got = 'THROWS ' + e.message; }
  if (got !== want) { fail++; console.log(`FAIL ${mode.padEnd(5)} ${JSON.stringify(inp)}${note ? ' (' + note + ')' : ''}\n     want ${want}\n     got  ${got}`); }
}
// runs for SVG / canvas: scripts are smaller and shifted, variables italic, a radicand is overlined
{
  n++; const r = mathRuns('e^(−Eb/kT)'); const sup = r.filter(x => x.sh > 0).map(x => x.t).join(''), sub = r.find(x => x.sh > 0 && x.sh < .42 && x.t === 'b');
  if (sup !== '−E/kT' && sup !== '−Eb/kT') { fail++; console.log('FAIL runs: superscript of e^(−Eb/kT) = ' + JSON.stringify(r)); }
  n++; const q = mathRuns('sqrt(L/g)'); if (!q.some(x => x.ov && /L/.test(x.t)) || !q.some(x => x.t.includes('√'))) { fail++; console.log('FAIL runs: radical ' + JSON.stringify(q)); }
  n++; const t = mathText('z = a*sin(x)*cos(y)'); if (/[*^]/.test(t)) { fail++; console.log('FAIL mathText ' + t); }
}
console.log(`${n - fail} of ${n} maths typesetting cases pass`);
process.exit(fail ? 1 : 0);
