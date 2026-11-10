#!/usr/bin/env node
// Scriptorium Memorialium — unit tests for the scroll's prose splitter (js/room/prose.js): TeX spans are found before code
// tokens, so a TeX dollar is never taken for R's $ operator and a call inside TeX (O(\theta^5)) never becomes code.
// RUN: node tools/test-prose.mjs        (no browser needed; exit code 1 when a case fails)
// Each case: input → the parts in a compact notation: {TeX} for a TeX span, `code` for code, plain text as it is.
import { proseParts, prose, isCodeCall } from '../js/room/prose.js';

const flat = t => proseParts(t).map(p => p.k === 'tex' ? '{' + p.v + '}' : p.k === 'code' ? '`' + p.v + '`' : p.v).join('');
const C = [
  // --- code nested in a maths function, and code joined by an operator, is one piece of code (polish gate, BYU sheet 01)
  ['se is sd(x) / sqrt(length(x)) here', 'se is `sd(x) / sqrt(length(x))` here'], ['sqrt(x^2 + 1) stays maths', 'sqrt(x^2 + 1) stays maths'], ['exp(mean(y))', '`exp(mean(y))`'],
  // --- the defects (G/10, G/12, G/28): TeX dollars next to punctuation
  ['in a uniform gravitational field $g$.', 'in a uniform gravitational field {$g$}.'],
  ['moves on a circle of radius $L$.', 'moves on a circle of radius {$L$}.'],
  ['field $g$. The string stays taut, so the bob moves on a circle of radius $L$.', 'field {$g$}. The string stays taut, so the bob moves on a circle of radius {$L$}.'],
  [String.raw`By Taylor expansion $\sin\theta=\theta-\theta^3/6+O(\theta^5)$. For $|\theta|\ll1$ the cubic term is negligible, so $\sin\theta\approx\theta$.`,
    String.raw`By Taylor expansion {$\sin\theta=\theta-\theta^3/6+O(\theta^5)$}. For {$|\theta|\ll1$} the cubic term is negligible, so {$\sin\theta\approx\theta$}.`],
  [String.raw`$\sin\theta = \theta - \theta^3/6 + O(\theta^5)$`, String.raw`{$\sin\theta = \theta - \theta^3/6 + O(\theta^5)$}`],
  ['the mass $m$, the length $L$; and $g$!', 'the mass {$m$}, the length {$L$}; and {$g$}!'],
  ['the $n$th term', 'the {$n$}th term'],
  [String.raw`display $$E=mc^2$$ and inline \(x^2\) and \[y=f(x)\] end`, String.raw`display {$$E=mc^2$$} and inline {\(x^2\)} and {\[y=f(x)\]} end`],
  // --- R code outside TeX
  ['Use dat$TotalSleep for the column.', 'Use `dat$TotalSleep` for the column.'],
  ['mean(x) is the average', '`mean(x)` is the average'],
  ['compare dat$a and dat$b', 'compare `dat$a` and `dat$b`'],
  ['then mean(dat$TotalSleep, na.rm = TRUE) gives 10.5', 'then `mean(dat$TotalSleep, na.rm = TRUE)` gives 10.5'],
  ['read.csv("sleep.csv") loads it', '`read.csv("sleep.csv")` loads it'],
  ['fit lm(y ~ x) and print summary(fit)', 'fit `lm(y ~ x)` and print `summary(fit)`'],
  ['x <- c(1, 2, 3) then sum(x)', 'x <- `c(1, 2, 3)` then `sum(x)`'],
  ['df$col[1] is the first value', '`df$col[1]` is the first value'],
  ['`x$y` stays one code span', '`x$y` stays one code span'],
  // --- R code and TeX in one sentence
  ['The mean of dat$TotalSleep estimates $\\mu$.', 'The mean of `dat$TotalSleep` estimates {$\\mu$}.'],
  ['$\\bar x$ is mean(x) for the sample', '{$\\bar x$} is `mean(x)` for the sample'],
  // --- maths calls are not code
  ['sin(theta) is close to theta', 'sin(theta) is close to theta'],
  ['T = 2*pi*sqrt(L/g)', 'T = 2*pi*sqrt(L/g)'],
  ['the curve f(x) and its slope', 'the curve f(x) and its slope'],
  ['O(h) errors', 'O(h) errors'],
  ['e_s(T) rises 7 % per kelvin', 'e_s(T) rises 7 % per kelvin'],
  ['K(sin 45°) ≈ 1.854', 'K(sin 45°) ≈ 1.854'],
  ['the first correction is (1/16)θ₀²', 'the first correction is (1/16)θ₀²'],
  // --- lone dollars are text
  ['it costs $5 and more', 'it costs $5 and more'],
  ['use $ to pick a column', 'use $ to pick a column'],
];
let fail = 0, n = 0;
for (const [inp, want] of C) { n++; let got; try { got = flat(inp); } catch (e) { got = 'THROWS ' + e.message; } if (got !== want) { fail++; console.log(`FAIL ${JSON.stringify(inp)}\n     want ${want}\n     got  ${got}`); } }
// the HTML: TeX spans reach MathJax whole (no <code> around a TeX $, no $ inside <code> unless it is R)
for (const [inp, bad] of [['field $g$.', /<code>[^<]*\$/], ['radius $L$.', /<code>/], [String.raw`$\sin\theta=\theta-\theta^3/6+O(\theta^5)$`, /<code>/]]) { n++; const h = prose(inp); if (bad.test(h) || !h.includes('$')) { fail++; console.log('FAIL html ' + JSON.stringify(inp) + ' → ' + h); } }
// the shared code rule (also used by figure labels in js/room/diagrams.js)
for (const [nm, a, want] of [['mean', 'x', true], ['sin', 'x', false], ['f', 'x', false], ['O', 'h', false], ['c', '1, 2', true], ['K', 'sin 45°', false], ['read.csv', '"a"', true], ['log', 'x', false], ['summary', 'fit', true], ['P', 'K=k', false], ['rnorm', 'n = 10', true], ['f', 'na.rm = TRUE', true], ['read_csv', 'f', true], ['e_s', 'T', false], ['T_max', 'x', false]]) { n++; if (isCodeCall(nm, a) !== want) { fail++; console.log(`FAIL isCodeCall(${nm}, ${a}) → ${!want}`); } }
console.log(`${n - fail} of ${n} prose cases pass`);
process.exit(fail ? 1 : 0);
