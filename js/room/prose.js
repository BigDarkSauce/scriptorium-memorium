// Prose that may hold code and maths (scroll statements, explanations, teaching boxes, code notes). Pure: no DOM, so
// tools/test-prose.mjs runs it in node.
//   prose(t) → HTML: `backtick spans` and R / Python tokens (dat$TotalSleep, mean(x), read.csv("a.csv")) become <code>
//   (MathJax never typesets inside <code>, so R's $ column operator is not read as maths); TeX spans ($…$, $$…$$, \(…\),
//   \[…\]) are kept whole for MathJax; the rest is typeset with mathHTML.
// The order matters: TeX spans are found first, so "field $g$." or "$\sin\theta = \theta - \theta^3/6 + O(\theta^5)$"
// never lose a dollar to the code detector, and function-call detection never runs inside TeX.
import { esc, mathHTML } from '../util.js';

// maths function names (and Greek letters): name(…) with these is maths, not code
const MATHFN = new Set('sin cos tan sec csc cot asin acos atan atan2 arcsin arccos arctan sinh cosh tanh exp ln log log10 log2 lg sqrt cbrt abs sign sgn floor ceil round min max pow hypot det erf gcd lcm mod lim arg tr alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi rho sigma tau phi chi psi omega'.split(' '));

// Split a text into [{k:'text'|'tex', v}] — a TeX span opens at a $ that does not follow a letter or digit (so the R
// operator in dat$col never opens one) and is not followed by white space, and closes at the next unescaped $ on
// the same line. $$…$$, \(…\) and \[…\] are spans too. A lone $ (a price, an R operator) stays text.
export function texSpans(s) {
  s = String(s ?? ''); const out = []; let i = 0, t0 = 0;
  const push = (k, v) => { if (!v) return; const l = out[out.length - 1]; if (l && l.k === k && k === 'text') l.v += v; else out.push({ k, v }); };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) { const close = s[i + 1] === '(' ? '\\)' : '\\]', j = s.indexOf(close, i + 2); if (j > i) { push('text', s.slice(t0, i)); push('tex', s.slice(i, j + 2)); i = t0 = j + 2; continue; } }
    if (c === '\\' && s[i + 1] === '$') { i += 2; continue; }   // an escaped dollar
    if (c === '$') {
      if (s[i + 1] === '$') { const j = s.indexOf('$$', i + 2); if (j > i + 2) { push('text', s.slice(t0, i)); push('tex', s.slice(i, j + 2)); i = t0 = j + 2; continue; } }
      const prev = s[i - 1] || '', next = s[i + 1] || '';
      if (!/[A-Za-z0-9_.\]\)]/.test(prev) && next && !/\s/.test(next) && next !== '$') {
        let j = i + 1; while (j < s.length && s[j] !== '\n' && !(s[j] === '$' && s[j - 1] !== '\\')) j++;
        if (j < s.length && s[j] === '$' && !/\s/.test(s[j - 1])) { push('text', s.slice(t0, i)); push('tex', s.slice(i, j + 1)); i = t0 = j + 1; continue; }
      }
    }
    i++;
  }
  push('text', s.slice(t0)); return out;
}

// a function call that is code, not maths: a dotted name (read.csv) or a snake_case one (read_csv; not e_s or T_max),
// a lower-case name of two or more letters that is not a maths function (mean, summary, lm), or any call whose arguments
// carry R / Python syntax (quotes, $, ~, <-, name = value with a name of 2+ letters, na.rm); c(…) with a comma is R's combine
export function isCodeCall(name, args) {
  if (/\./.test(name) && /[A-Za-z]/.test(name)) return true;
  const us = /^([A-Za-z][A-Za-z0-9]*)_([A-Za-z0-9_]+)$/.exec(name); if (us) return us[1].length >= 2 && us[2].length >= 2 && !MATHFN.has(us[1]);   // read_csv, na_if; e_s, T_max, theta_0 are subscripts
  if (/["'~]|<-|\w\$\w|\b[A-Za-z_][\w.]+\s*=(?!=)|\bna\.rm\b|\bTRUE\b|\bFALSE\b|\bNULL\b/.test(args)) return true;
  if (name === 'c' && /,/.test(args)) return true;
  // a maths function around code is code too: sqrt(length(x)), exp(mean(y))
  for (const m of String(args).matchAll(/([A-Za-z_.][\w.]*)\(([^()]*)\)/g)) if (isCodeCall(m[1], m[2])) return true;
  return /^[a-z][a-z0-9]+$/.test(name) && !MATHFN.has(name) && !/^[a-z]\d+$/.test(name);
}
// code tokens in plain (non-TeX) text: R columns (dat$TotalSleep, df$a$b, x$y[1]) and code calls (mean(x), lm(y ~ x))
const RCOL = /\b[A-Za-z_][\w.]*(?:\$[A-Za-z_][\w.]*)+(?:\[[^\]\s]*\])?/y;
function codeTokens(seg) {
  const out = []; let i = 0, t0 = 0;
  const flush = j => { if (j > t0) out.push({ k: 'text', v: seg.slice(t0, j) }); };
  while (i < seg.length) {
    const before = seg[i - 1] || '';
    if (/[A-Za-z_.]/.test(seg[i]) && !/[\w.$]/.test(before)) {
      RCOL.lastIndex = i; const m = RCOL.exec(seg);
      if (m) { flush(i); out.push({ k: 'code', v: m[0] }); i = t0 = i + m[0].length; continue; }
      const nm = /^[A-Za-z_.][\w.]*/.exec(seg.slice(i)), name = nm && nm[0];
      if (name && seg[i + name.length] === '(') {
        let d = 0, j = i + name.length; for (; j < seg.length; j++) { if (seg[j] === '(') d++; else if (seg[j] === ')' && --d === 0) break; else if (seg[j] === '\n') break; }
        if (j < seg.length && seg[j] === ')' && d === 0) { const args = seg.slice(i + name.length + 1, j); if (isCodeCall(name.replace(/^\.+|\.+$/g, '') || name, args)) { flush(i); out.push({ k: 'code', v: seg.slice(i, j + 1) }); i = t0 = j + 1; continue; } }
        i += name.length; continue;
      }
      if (name) { i += name.length; continue; }
    }
    i++;
  }
  flush(seg.length);
  // code joined by an operator is one piece of code: sd(x) / sqrt(length(x)), mean(x) - median(x)
  for (let k = 1; k + 1 < out.length; k++) if (out[k - 1].k === 'code' && out[k + 1].k === 'code' && out[k].k === 'text' && /^\s*[-+*\/^]\s*$/.test(out[k].v)) { out[k - 1].v += out[k].v + out[k + 1].v; out.splice(k, 2); k--; }
  return out;
}
// prose(t) → [{k: 'text'|'tex'|'code', v}] (exported for the tests) and the HTML
export function proseParts(t) {
  const out = [];
  String(t ?? '').split(/(`[^`\n]+`)/g).forEach((seg, i) => {
    if (i % 2) { out.push({ k: 'code', v: seg.slice(1, -1) }); return; }
    texSpans(seg).forEach(p => { if (p.k === 'tex') out.push(p); else codeTokens(p.v).forEach(q => out.push(q)); });
  });
  return out;
}
export function prose(t) {
  // TeX spans go to MathJax verbatim (escaped); a lone $ left in the text can then never pair with a TeX span's $
  return proseParts(t).map(p => p.k === 'code' ? '<code>' + esc(p.v) + '</code>' : p.k === 'tex' ? esc(p.v) : mathHTML(p.v)).join('');
}
