// Figure specs: the small JSON drawings a chain carries for its paragraphs and for its "Picture it", "Common mistake"
// and "Check yourself" boxes (docs/PROTOCOL.md, "Figures"; schema/figure.schema.json). The model returns data, never
// pictures or SVG code; the reader draws them (js/room/diagrams.js → renderFigure) with typeset maths.
// This module is pure (no DOM), so the quality gate and tools/test-ingest.mjs run it in node:
//   validateFigure(spec)      → { ok, errors:[str], fig }   fig = a normalised copy (defaults filled, data clipped)
//   autoFigure(step, slot, i) → a valid figure built from the step itself (the fallback that keeps no box bare)
//   figureSlots(step)         → [{slot, text, fig, small}]  every place in a step that needs a figure
import { compile } from '../util.js';
import { PRIMITIVES, PRIMITIVE_KINDS, validatePrimitive } from '../dio/domains.js';

export const BASE_KINDS = ['flow', 'plot', 'distribution', 'bars', 'hist', 'scatter', 'boxplot', 'numberline', 'tree', 'venn', 'timeline', 'sketch', 'codetrace', 'table', 'contrast', 'pdf'];
// the domain primitives (js/dio/domains.js, drawn by js/dio/prims/*.js): interactive figures of the explanatory compiler
export const FIGURE_KINDS = [...BASE_KINDS, ...PRIMITIVE_KINDS];
export const isPrimitive = k => PRIMITIVE_KINDS.includes(k);
// one line per kind: what it is for (the prompt lists these, so any AI picks the same kind for the same idea)
export const FIGURE_USES = {
  flow: 'a process, a pipeline, cause → effect, a decision path, input → function → output',
  plot: 'functions and curves y = f(x) (axes, labelled curves, data points, shaded areas, reference lines)',
  distribution: 'a probability distribution (normal, t, chisq, binomial, poisson, uniform, exponential) with shaded P(…) areas and marked values',
  bars: 'categories with values, a table turned into a chart (table → chart)',
  hist: 'the shape of one continuous variable (values or bin counts)',
  scatter: 'two continuous variables, with an optional least-squares line and residuals',
  boxplot: 'a continuous variable split by groups (five-number summaries)',
  numberline: 'values, inequalities and intervals on one axis (X ≤ 3 vs X < 3, confidence intervals)',
  tree: 'a branching classification or a probability tree (edge labels = probabilities or conditions)',
  venn: 'sets, events and their overlaps (2 or 3 sets)',
  timeline: 'events in order of time or of execution',
  sketch: 'a labelled sketch of a physical or abstract arrangement (rects, circles, arrows, text on a 100 × 60 canvas)',
  codetrace: 'code run line by line: what each line does and the values it leaves behind; the output',
  table: 'a small table with highlighted cells',
  contrast: 'a wrong idea set against the right one (✗ / ✓), for common mistakes',
  pdf: 'the PDF\'s own figure (by id), only when it is the best illustration; shown once in the whole scroll',
  ...Object.fromEntries(PRIMITIVE_KINDS.map(k => [k, PRIMITIVES[k].use]))
};
const DISTS = ['normal', 't', 'chisq', 'binomial', 'poisson', 'uniform', 'exponential'];
const SHAPES = ['rect', 'circle', 'ellipse', 'line', 'arrow', 'text', 'path'];
const num = v => typeof v === 'number' ? isFinite(v) : typeof v === 'string' && v.trim() !== '' && isFinite(+v);
const N = v => +v;
const str = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const arr = v => Array.isArray(v) ? v : [];
const range = (v, d) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && +v[1] > +v[0] ? [N(v[0]), N(v[1])] : d;
function exprOk(e, vars) { try { const f = compile(String(e), vars); const y = f(...vars.map(() => 0.5)); return typeof y === 'number'; } catch (x) { return false; } }

// Normalise and check one figure. Unknown kinds, missing data and expressions that do not compile are errors; data that
// is only too long is clipped. Animation is optional on every kind ("animate": true, or for plot {param, from, to, period}).
export function validateFigure(spec) {
  const E = [], f = spec && typeof spec === 'object' ? JSON.parse(JSON.stringify(spec)) : null;
  if (!f) return { ok: false, errors: ['not an object'], fig: null };
  f.kind = String(f.kind || f.type || '').toLowerCase(); delete f.type;
  if (!FIGURE_KINDS.includes(f.kind)) return { ok: false, errors: [`unknown kind "${f.kind}"`], fig: null };
  f.caption = str(f.caption || f.title || '', 220); if (!f.caption && f.kind !== 'pdf') E.push('no "caption"');
  if (f.title) f.title = str(f.title, 90);
  const k = f.kind;
  if (k === 'flow') {
    f.nodes = arr(f.nodes).slice(0, 12).map((n, i) => typeof n === 'string' ? { id: 'n' + i, label: str(n, 60) } : { id: str(n.id || 'n' + i, 30), label: str(n.label || n.id, 60), ...(n.note ? { note: str(n.note, 60) } : {}) }).filter(n => n.label);
    const ids = new Set(f.nodes.map(n => n.id));
    f.edges = arr(f.edges).map(e => Array.isArray(e) ? { from: e[0], to: e[1], label: e[2] } : e).filter(e => e && ids.has(String(e.from)) && ids.has(String(e.to))).slice(0, 24).map(e => ({ from: String(e.from), to: String(e.to), ...(e.label ? { label: str(e.label, 40) } : {}) }));
    if (f.nodes.length < 2) E.push('flow needs at least 2 nodes');
    if (!f.edges.length && f.nodes.length >= 2) f.edges = f.nodes.slice(1).map((n, i) => ({ from: f.nodes[i].id, to: n.id }));
    f.dir = f.dir === 'TB' ? 'TB' : 'LR';
  } else if (k === 'plot') {
    f.x = range(f.x, [-5, 5]); f.y = range(f.y, null);
    const pv = f.animate && typeof f.animate === 'object' && f.animate.param ? [String(f.animate.param)] : [];
    f.curves = arr(f.curves || (f.exprs ? f.exprs.map(e => ({ expr: e })) : f.expr ? [{ expr: f.expr }] : [])).slice(0, 5).map(c => typeof c === 'string' ? { expr: c } : c).filter(c => c && c.expr);
    f.curves.forEach((c, i) => { c.expr = String(c.expr); if (c.label) c.label = str(c.label, 40); if (!exprOk(c.expr, ['x', ...pv])) E.push(`curve ${i + 1}: "${c.expr}" does not compile (use x${pv.length ? ' and ' + pv[0] : ''}; sin cos exp log sqrt abs pow min max)`); });
    f.points = arr(f.points).filter(p => Array.isArray(p) && num(p[0]) && num(p[1])).slice(0, 300).map(p => [N(p[0]), N(p[1]), ...(p[2] != null ? [str(p[2], 30)] : [])]);
    f.vlines = arr(f.vlines).filter(v => v && num(v.x)).slice(0, 6).map(v => ({ x: N(v.x), label: str(v.label, 30) }));
    f.hlines = arr(f.hlines).filter(v => v && num(v.y)).slice(0, 6).map(v => ({ y: N(v.y), label: str(v.label, 30) }));
    if (f.shade) { if (!f.shade.expr && f.curves[0]) f.shade.expr = f.curves[0].expr; if (!exprOk(f.shade.expr, ['x', ...pv]) || !num(f.shade.from) || !num(f.shade.to)) { E.push('"shade" needs expr, from and to'); delete f.shade; } }
    if (!f.curves.length && !f.points.length) E.push('plot needs "curves" or "points"');
    if (pv.length) { const a = f.animate; if (!num(a.from) || !num(a.to)) { E.push('animate needs from and to'); f.animate = false; } else f.animate = { param: pv[0], from: N(a.from), to: N(a.to), period: num(a.period) ? Math.max(1, N(a.period)) : 4 }; }
  } else if (k === 'distribution') {
    f.dist = String(f.dist || f.family || 'normal').toLowerCase(); if (!DISTS.includes(f.dist)) E.push(`unknown dist "${f.dist}" (${DISTS.join(', ')})`);
    const P = f.params || {}; f.params = {};
    const need = { normal: ['mean', 'sd'], t: ['df'], chisq: ['df'], binomial: ['size', 'prob'], poisson: ['lambda'], uniform: ['min', 'max'], exponential: ['rate'] }[f.dist] || [];
    const alias = { mean: ['mean', 'mu'], sd: ['sd', 'sigma'], size: ['size', 'n'], prob: ['prob', 'p'], lambda: ['lambda'], df: ['df'], min: ['min', 'a'], max: ['max', 'b'], rate: ['rate', 'lambda'] };
    const dflt = { mean: 0, sd: 1, df: 5, size: 10, prob: .5, lambda: 3, min: 0, max: 1, rate: 1 };
    need.forEach(p => { const v = alias[p].map(a => P[a]).find(num); f.params[p] = v != null ? N(v) : dflt[p]; });
    if (f.dist === 'binomial' && !(f.params.size >= 1 && f.params.prob >= 0 && f.params.prob <= 1)) E.push('binomial needs size ≥ 1 and 0 ≤ prob ≤ 1');
    if (f.shade) { const s = f.shade; f.shade = { ...(num(s.from) ? { from: N(s.from) } : {}), ...(num(s.to) ? { to: N(s.to) } : {}), label: str(s.label, 40) }; if (f.shade.from == null && f.shade.to == null) delete f.shade; }
    f.marks = arr(f.marks).filter(m => m && num(m.x)).slice(0, 6).map(m => ({ x: N(m.x), label: str(m.label, 30) }));
  } else if (k === 'bars') {
    if (f.table && Array.isArray(f.table.rows)) { const T = f.table, xi = num(f.xcol) ? N(f.xcol) : 0, ys = arr(f.ycols).length ? f.ycols.map(N) : (T.columns || []).map((c, i) => i).filter(i => i !== xi && T.rows.every(r => num(String(r[i]).replace(/[,%]/g, '')))); f.categories = T.rows.map(r => str(r[xi], 24)); f.series = ys.map(i => ({ name: str((T.columns || [])[i] || 'value', 30), values: T.rows.map(r => +String(r[i]).replace(/[,%]/g, '')) })); delete f.table; }
    f.categories = arr(f.categories).slice(0, 24).map(c => str(c, 24));
    f.series = arr(f.series).slice(0, 4).map(s => ({ name: str(s.name, 30), values: arr(s.values).slice(0, f.categories.length).map(v => num(v) ? N(v) : 0) })).filter(s => s.values.length);
    if (!f.categories.length || !f.series.length) E.push('bars need "categories" and "series" (or a "table")');
    f.highlight = arr(f.highlight).filter(num).map(N);
  } else if (k === 'hist') {
    f.values = arr(f.values).filter(num).slice(0, 2000).map(N);
    f.bins = arr(f.bins).filter(b => b && num(b.from) && num(b.to) && num(b.count)).slice(0, 60).map(b => ({ from: N(b.from), to: N(b.to), count: N(b.count) }));
    if (f.values.length < 3 && !f.bins.length) E.push('hist needs "values" (≥ 3) or "bins"');
  } else if (k === 'scatter') {
    f.points = arr(f.points).filter(p => Array.isArray(p) && num(p[0]) && num(p[1])).slice(0, 400).map(p => [N(p[0]), N(p[1]), ...(p[2] != null ? [str(p[2], 24)] : [])]);
    if (f.points.length < 2) E.push('scatter needs ≥ 2 "points"');
    if (f.fit && f.fit !== 'ols' && !(num(f.fit.slope) && num(f.fit.intercept))) { E.push('"fit" is "ols" or {slope, intercept}'); delete f.fit; }
  } else if (k === 'boxplot') {
    f.groups = arr(f.groups).slice(0, 8).map(g => { if (arr(g.values).length >= 3) { const v = g.values.filter(num).map(N).sort((a, b) => a - b), q = p => { const i = (v.length - 1) * p, a = Math.floor(i); return v[a] + (v[Math.min(v.length - 1, a + 1)] - v[a]) * (i - a); }; return { label: str(g.label, 24), min: v[0], q1: q(.25), median: q(.5), q3: q(.75), max: v[v.length - 1] }; } return ['min', 'q1', 'median', 'q3', 'max'].every(x => num(g[x])) ? { label: str(g.label, 24), min: N(g.min), q1: N(g.q1), median: N(g.median), q3: N(g.q3), max: N(g.max), outliers: arr(g.outliers).filter(num).map(N) } : null; }).filter(Boolean);
    if (!f.groups.length) E.push('boxplot needs "groups" with values or min, q1, median, q3, max');
  } else if (k === 'numberline') {
    if (!num(f.min) || !num(f.max) || +f.max <= +f.min) E.push('numberline needs min < max'); else { f.min = N(f.min); f.max = N(f.max); }
    f.points = arr(f.points).filter(p => p && num(p.x)).slice(0, 12).map(p => ({ x: N(p.x), label: str(p.label, 30), ...(p.open ? { open: true } : {}) }));
    f.intervals = arr(f.intervals).filter(v => v && num(v.from) && num(v.to)).slice(0, 6).map(v => ({ from: N(v.from), to: N(v.to), label: str(v.label, 40), closedL: v.closedL !== false, closedR: v.closedR !== false }));
    if (num(f.step)) f.step = N(f.step); else delete f.step;
  } else if (k === 'tree') {
    let count = 0; const walk = (n, d) => { if (!n || count > 40 || d > 4) return null; count++; return { label: str(n.label, 50), ...(n.edge != null ? { edge: str(n.edge, 30) } : {}), children: arr(n.children).map(c => walk(c, d + 1)).filter(Boolean).slice(0, 6) }; };
    f.root = walk(f.root, 0); if (!f.root || !f.root.children.length) E.push('tree needs a "root" with "children"');
  } else if (k === 'venn') {
    f.sets = arr(f.sets).slice(0, 3).map(s => str(typeof s === 'string' ? s : s.label, 24)); if (f.sets.length < 2) E.push('venn needs 2 or 3 "sets"');
    const R = f.regions || {}; f.regions = {}; Object.keys(R).forEach(key => { if (/^[ABC]{1,3}$/.test(key)) f.regions[key] = str(R[key], 40); });
    f.shade = arr(f.shade).filter(x => /^[ABC]{1,3}$/.test(x));
  } else if (k === 'timeline') {
    f.events = arr(f.events).filter(e => e && (num(e.t) || e.t != null) && e.label).slice(0, 12).map((e, i) => ({ t: num(e.t) ? N(e.t) : i, tl: str(e.t, 16), label: str(e.label, 50) }));
    if (f.events.length < 2) E.push('timeline needs ≥ 2 "events"');
  } else if (k === 'sketch') {
    f.w = num(f.w) ? N(f.w) : 100; f.h = num(f.h) ? N(f.h) : 60;
    f.items = arr(f.items).filter(it => it && SHAPES.includes(it.shape)).slice(0, 40).map(it => { const o = { shape: it.shape }; ['x', 'y', 'w', 'h', 'r', 'rx', 'ry', 'x2', 'y2'].forEach(p => { if (num(it[p])) o[p] = N(it[p]); }); ['text', 'label'].forEach(p => { if (it[p]) o[p] = str(it[p], 40); }); if (it.d && /^[MmLlHhVvCcQqAaZz0-9\s.,\-]+$/.test(it.d)) o.d = String(it.d).slice(0, 600); if (it.fill && /^#[0-9a-f]{3,8}$|^none$/i.test(it.fill)) o.fill = it.fill; if (it.tone) o.tone = ['accent', 'muted', 'warn', 'ok'].includes(it.tone) ? it.tone : undefined; return o; });
    if (f.items.length < 2) E.push('sketch needs ≥ 2 "items" (shapes: ' + SHAPES.join(', ') + ')');
  } else if (k === 'codetrace') {
    f.lang = str(f.lang || 'r', 12).toLowerCase();
    f.lines = arr(f.lines).slice(0, 18).map(l => typeof l === 'string' ? { code: l } : { code: String(l.code ?? '').slice(0, 120), ...(l.note ? { note: str(l.note, 90) } : {}), ...(l.state && typeof l.state === 'object' ? { state: Object.fromEntries(Object.entries(l.state).slice(0, 4).map(([a, b]) => [str(a, 16), str(b, 30)])) } : {}) }).filter(l => l.code.trim());
    f.output = arr(f.output).slice(0, 8).map(o => String(o).slice(0, 100));
    if (!f.lines.length) E.push('codetrace needs "lines"');
  } else if (k === 'table') {
    f.columns = arr(f.columns).slice(0, 8).map(c => str(c, 30)); f.rows = arr(f.rows).filter(Array.isArray).slice(0, 14).map(r => r.slice(0, 8).map(c => str(c, 40)));
    f.highlight = arr(f.highlight).filter(h => Array.isArray(h) && num(h[0]) && num(h[1]));
    if (!f.rows.length) E.push('table needs "rows"');
  } else if (k === 'contrast') {
    const side = s => typeof s === 'string' ? { text: str(s, 200) } : s && s.text ? { title: str(s.title, 40), text: str(s.text, 200) } : null;
    f.wrong = side(f.wrong); f.right = side(f.right); if (!f.wrong || !f.right) E.push('contrast needs "wrong" and "right"');
  } else if (k === 'pdf') {
    f.id = str(f.id || f.figure, 40); if (!f.id) E.push('pdf needs the figure "id"');
  } else if (isPrimitive(k)) validatePrimitive(f, E);
  if (f.animate === true || f.animate === false) { /* keep */ } else if (k !== 'plot') delete f.animate;
  return { ok: !E.length, errors: E, fig: f };
}

// ---------------------------------------------------------------- where a step needs figures
const words = s => String(s || '').replace(/\$[^$]*\$/g, ' x ').split(/\s+/).filter(Boolean).length;
export const TEXT_HEAVY = 60;   // a paragraph of 60 words or more is text-heavy: it must come with a figure
// Every place in a step that needs a figure: each text-heavy paragraph of "explain" (and a text-heavy statement), and the
// three teaching boxes (small figures). Returns [{slot, text, fig, small}] with slot ids "explain.k", "statement",
// "intuition", "misconception", "check".
export function figureSlots(st) {
  const out = [];
  (Array.isArray(st.explain) ? st.explain : []).forEach((p, k) => { const t = typeof p === 'string' ? p : p && p.text; if (words(t) >= TEXT_HEAVY) out.push({ slot: 'explain.' + k, text: t, fig: p && p.figure || null }); });
  if (words(st.statement) >= TEXT_HEAVY) out.push({ slot: 'statement', text: st.statement, fig: st.statementFigure || null });
  if (st.intuition) out.push({ slot: 'intuition', text: st.intuition, fig: st.intuitionFigure || null, small: true });
  if (st.misconception) out.push({ slot: 'misconception', text: st.misconception, fig: st.misconceptionFigure || null, small: true });
  if (st.check && st.check.q) out.push({ slot: 'check', text: st.check.q + ' ' + (st.check.a || ''), fig: st.check.figure || null, small: true });
  return out;
}
export function setSlotFigure(st, slot, fig) {
  if (slot.startsWith('explain.')) { const k = +slot.split('.')[1]; if (!Array.isArray(st.explain) || !Number.isInteger(k) || k < 0 || k >= st.explain.length || st.explain[k] == null) return; const p = st.explain[k]; st.explain[k] = typeof p === 'string' ? { text: p, figure: fig } : { ...p, figure: fig }; }
  else if (slot === 'statement') st.statementFigure = fig;
  else if (slot === 'intuition') st.intuitionFigure = fig;
  else if (slot === 'misconception') st.misconceptionFigure = fig;
  else if (slot === 'check' && st.check) st.check.figure = fig;
}

// ---------------------------------------------------------------- the deterministic fallback
// Built only from what the step already says, so it never invents data: a chain of the paragraph's clauses (flow), the
// step's code (codetrace), its table (bars or table), a wrong-vs-right card for a mistake, question → answer for a check.
const clauses = t => String(t || '').replace(/\$[^$]*\$/g, m => m.slice(1, -1)).split(/(?<=[.;:!?])\s+|\s+(?:so|then|because|therefore|which|and then)\s+/i).map(s => s.replace(/[.;:]$/, '').trim()).filter(s => s.length > 3);
const short = (s, n = 46) => { s = String(s || '').trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n * .6)) + '…'; };
export function autoFigure(st, slot, text) {
  text = text || '';
  const cap = (s => s.charAt(0).toUpperCase() + s.slice(1))(short(String(text).replace(/\$[^$]*\$/g, m => m.slice(1, -1)), 120));
  if (slot === 'misconception') { const c = clauses(text); return { kind: 'contrast', caption: 'The mistake, and what is true instead.', wrong: { title: 'Mistaken', text: short(c[0] || text, 140) }, right: { title: 'Instead', text: short(c.slice(1).join('. ') || (st.statement || ''), 160) }, auto: true }; }
  if (slot === 'check') return { kind: 'flow', caption: 'From the question to its answer.', nodes: [{ id: 'q', label: short(st.check && st.check.q, 50) }, ...clauses(st.check && st.check.a).slice(0, 2).map((c, i) => ({ id: 'a' + i, label: short(c, 46) }))], dir: 'LR', auto: true };
  if (st.code && Array.isArray(st.code.lines) && st.code.lines.length && slot !== 'intuition') return { kind: 'codetrace', caption: 'The code, line by line.', lang: st.code.lang || 'r', lines: st.code.lines.slice(0, 8).map(l => ({ code: l.code || String(l), note: short(l.explain || l.note || '', 80) })), output: Array.isArray(st.code.output) ? st.code.output.slice(0, 4) : st.code.output ? String(st.code.output).split('\n').slice(0, 4) : [], auto: true };
  if (st.table && Array.isArray(st.table.rows) && st.table.rows.length >= 2) { const b = validateFigure({ kind: 'bars', caption: st.table.caption || 'The table as a chart.', table: st.table }); if (b.ok) return { ...b.fig, auto: true }; return { kind: 'table', caption: st.table.caption || 'The table.', columns: st.table.columns, rows: st.table.rows, auto: true }; }
  const c = clauses(text).slice(0, 4);
  const nodes = (c.length >= 2 ? c : [...(st.terms || []).map(t => String(t.term).replace(/\$/g, '')), ...(st.bodies || [])].slice(0, 4)).map((s, i) => ({ id: 'n' + i, label: short(s, 44) }));
  if (nodes.length < 2) nodes.push({ id: 'n9', label: short(st.title || 'this step', 44) }, { id: 'n10', label: short(st.opens || 'next question', 44) });
  return { kind: 'flow', caption: cap || 'The idea in steps.', nodes, dir: nodes.length > 3 ? 'TB' : 'LR', auto: true };
}
