// The Revelation Engine: a step's "Aha" as a loop the reader runs, not a paragraph they read.
//
//   hook      a question that opens a gap (the step's own question, or its "Check yourself")
//   predict   the reader commits to an answer, and says how sure they are, BEFORE seeing it
//   reveal    what is actually so, and why: the rule, compressed to a line
//   surprise  a confident wrong prediction is named as such, with the misconception refuted
//   boundary  the case the rule fails on (the truth constraint: no compression ships without its edge)
//   explain   the reader says why the answer is right, in their own words (kept, never graded by a machine)
//   transfer  a new situation that uses the same rule, asked in the scroll right after the step's analogy (renderTransfer):
//             the analogy says what is alike, the new situation tests whether the likeness was understood
//
// The evidence each phase rests on (all checked in OpenAlex; docs/research/revelation-engine.md):
//   predicting first makes observing correctly ~20 % likelier, right or wrong (Miller et al. 2013, PRST-PER);
//   a failed attempt before the answer improves learning (Kornell, Hays & Bjork 2009; Richland, Kornell & Kao 2009);
//   errors made with high confidence are corrected best (Butterfield & Metcalfe 2001);
//   curiosity about a question improves memory for its answer (Kang et al. 2009; Gruber, Gelman & Ranganath 2014);
//   naming and refuting the misconception beats only stating the right idea (Tippett 2010);
//   prompted self-explanation helps (Chi et al. 1994; Bisra et al. 2018, meta-analysis);
//   retrieval spaced over days beats massed review (Cepeda et al. 2006; Adesope et al. 2017), and interleaving similar
//   material helps (Brunmair & Richter 2019);
//   unguided discovery does not help, guided discovery does (Alfieri et al. 2011): hence hooks and hints, not puzzles.
//
// What the engine refuses to do (the honest part): no random rewards, no streaks for time spent, no "insight" without a
// boundary case, and transfer accuracy (not completion) is the number it shows.
import { el, toast } from '../util.js';
import { prose } from './prose.js';
import * as store from '../store.js';
import { clipSentence } from '../dio/prims/spec.js';

const KEY = 'reveal:ledger', DAY = 864e5;
let ledger = null, loading = null;
export async function loadLedger() { if (ledger) return ledger; if (!loading) loading = store.get(KEY).then(v => (ledger = v && typeof v === 'object' ? v : { e: {}, sessions: [] })).catch(() => (ledger = { e: {}, sessions: [] })); return loading; }
const save = () => { if (ledger) store.saveLater(KEY, () => ledger, 400); };
export const ledgerNow = () => ledger;

// ---- the spec ----
// st.reveal (written by the AI, prompts/13-revelation.md, or by hand):
//   { type, hook, predict: { options: [{ text, correct, why? }] } | { free: true }, rule, boundary: { case, why },
//     transfer: { q, options: [{ text, correct }], why }, analogy?: { source, maps: [[a, b]], breaks } }
// Without one, a step with a "Check yourself" still gets the loop, in free-prediction form (write it, then compare).
// The epistemic type decides whether the loop fits at all: taxonomies and narratives are not "aha" material (a
// vocabulary list turned into insights would be confabulated), so they get retrieval and story instead (docs).
export const EPISTEMIC = ['mechanism', 'causal', 'formal', 'quantitative', 'taxonomy', 'narrative', 'skill'];
export function epistemicType(st) {
  const r = st && st.reveal; if (r && EPISTEMIC.includes(r.type)) return r.type;
  const t = ((st.title || '') + ' ' + (st.statement || '') + ' ' + (st.kind || '')).toLowerCase();
  if (/\b(classif|types? of|kinds? of|taxonom|categor|is called|term for|vocabulary|list of)\b/.test(t)) return 'taxonomy';
  if (/\b(in \d{3,4}|century|history|was founded|then|later|timeline|war|reign|biograph)\b/.test(t)) return 'narrative';
  if (/\b(how to|procedure|practi[cs]e|technique for|steps to)\b/.test(t)) return 'skill';
  if (/\b(prove|theorem|lemma|identity|definition|axiom|derivation|derive)\b/.test(t) || st.kind === 'derivation' || st.kind === 'definition') return 'formal';
  if (/\b(because|causes?|leads? to|so that|therefore|feedback|effect of)\b/.test(t)) return 'causal';
  if (/\d|\b(rate|ratio|proportional|scales?|grows?|equation)\b/.test(t)) return 'quantitative';
  return 'mechanism';
}
export function revealSpec(st) {
  if (!st) return null; const r = st.reveal && typeof st.reveal === 'object' ? st.reveal : null;
  const type = epistemicType(st); if (type === 'taxonomy' || type === 'narrative') return null;
  const hook = (r && r.hook) || (st.check && st.check.q) || null; if (!hook) return null;
  const opts = r && r.predict && Array.isArray(r.predict.options) ? r.predict.options.filter(o => o && o.text).slice(0, 5) : null;
  return {
    type, hook, options: opts && opts.length >= 2 && opts.some(o => o.correct) ? opts : null,
    answer: (r && r.answer) || (st.check && hook === st.check.q && st.check.a) || '', rule: (r && r.rule) || '', boundary: r && r.boundary && r.boundary.case ? r.boundary : null,
    misconception: (r && r.misconception) || st.misconception || '', transfer: r && r.transfer && r.transfer.q ? r.transfer : null,
    analogy: r && r.analogy && r.analogy.source ? r.analogy : null, figure: (st.check && st.check.figure && hook === st.check.q) ? st.check.figure : null,   /* the check's figure goes with the check's question (shown on its own below the reading otherwise) */
  };
}
// an AI's (or an import's) reveal, kept to known fields and plain strings (normalizeChain, reader.js)
export function normReveal(r) {
  if (!r || typeof r !== 'object') return null; const S = (v, n = 400) => v == null ? '' : clipSentence(v, n);   /* a long text is shortened only at a sentence end */
  const opts = o => Array.isArray(o) ? o.filter(x => x && (x.text || typeof x === 'string')).slice(0, 5).map(x => typeof x === 'string' ? { text: S(x, 240) } : { text: S(x.text, 240), ...(x.correct ? { correct: true } : {}), ...(x.why ? { why: S(x.why, 300) } : {}) }) : null;
  const out = { ...(EPISTEMIC.includes(r.type) ? { type: r.type } : {}), ...(r.hook ? { hook: S(r.hook) } : {}), ...(r.rule ? { rule: S(r.rule) } : {}), ...(r.answer ? { answer: S(r.answer, 600) } : {}), ...(r.misconception ? { misconception: S(r.misconception) } : {}) };
  const po = r.predict && opts(r.predict.options); if (po && po.length >= 2) out.predict = { options: po };
  if (r.boundary && (r.boundary.case || typeof r.boundary === 'string')) out.boundary = typeof r.boundary === 'string' ? { case: S(r.boundary) } : { case: S(r.boundary.case), ...(r.boundary.why ? { why: S(r.boundary.why) } : {}) };
  if (r.transfer && r.transfer.q) { const to = opts(r.transfer.options); out.transfer = { q: S(r.transfer.q), ...(to && to.length >= 2 ? { options: to } : {}), ...(r.transfer.why ? { why: S(r.transfer.why) } : {}) }; }
  if (r.analogy && r.analogy.source) out.analogy = { source: S(r.analogy.source, 80), maps: Array.isArray(r.analogy.maps) ? r.analogy.maps.slice(0, 6).map(m => [S(m[0], 80), S(m[1], 80)]) : [], breaks: S(r.analogy.breaks) };
  return Object.keys(out).length ? out : null;
}
// the truth constraint, for the quality gate: a step that states a rule must give the case it fails on
export function revealIssues(st) {
  const r = st && st.reveal; if (!r) return [];
  const out = []; if (r.rule && !(r.boundary && r.boundary.case)) out.push(`${st.id}: the rule "${String(r.rule).slice(0, 60)}" has no boundary case`);
  if (r.predict && Array.isArray(r.predict.options) && !r.predict.options.some(o => o && o.correct)) out.push(`${st.id}: no prediction option is marked correct`);
  if (r.transfer && Array.isArray(r.transfer.options) && r.transfer.options.length && !r.transfer.options.some(o => o && o.correct)) out.push(`${st.id}: the transfer question has no correct option`);
  if (r.transfer && Array.isArray(r.transfer.options) && r.transfer.options.length && r.transfer.options.length < 3) out.push(`${st.id}: the transfer question needs at least 3 options (with 2, a guess is right half the time)`);
  return out;
}
// The options are shown in an order of their own: a model (and the schema's example) tends to put the right answer in
// the same place every time. The order is fixed per step (seeded by its id), so it does not change on a re-render, and
// the answer is tracked by the option's original position (its identity), never by where it is shown.
const seedOf = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
export function shuffleOrder(n, seed) {
  const order = [...Array(n).keys()]; let x = seedOf(String(seed)) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;   // order[k] = the original index of the option shown k-th
}
// The spaced card a step leaves in the revisit deck: its transfer question when it has one, else its "Check yourself"
// (question and answer: free recall, graded by the reader with Again / Good), so every step with a check is spaced.
export function revisitCard(st, R = revealSpec(st)) {
  const due = Date.now() + DAY;
  if (R && R.transfer) return { due, iv: 1, n: 0, hist: [], q: R.transfer.q, options: R.transfer.options || null, why: R.transfer.why || '', rule: R.rule || '' };
  const q = (st && st.check && st.check.q) || (R && R.answer && R.hook) || '', a = (st && st.check && st.check.q ? st.check.a : R && R.answer) || '';
  return q && a ? { due, iv: 1, n: 0, hist: [], q, a, recall: true, rule: (R && R.rule) || '' } : null;
}
// a "Check yourself" opened outside the predict loop (a taxonomy, a chronology) enters the schedule all the same
export async function enrollCheck(partId, partTitle, st) {
  await loadLedger(); const id = partId + '/' + st.id, e = ledger.e[id] || {};
  if (e.tr) return e; const tr = revisitCard(st, null); if (!tr) return e;
  ledger.e[id] = Object.assign(e, { tr, title: st.title || '', part: partTitle || '' }); save(); return ledger.e[id];
}

// ---- the loop, in the reader ----
const CONF = [['guess', 'A guess'], ['fair', 'Fairly sure'], ['sure', 'Certain']];
export function renderReveal(st, ctx) {
  const R = revealSpec(st); if (!R) return null;
  const id = ctx.partId + '/' + st.id, card = el('div', { class: 'reveal-card', 'data-type': R.type });
  const prior = () => ledger && ledger.e[id];
  const head = el('div', { class: 'rvl-head' }, [el('span', { class: 'rv-kicker', text: 'Predict, then unfold' }), el('div', { class: 'rv-hook', html: prose(R.hook) })]);
  card.append(head);
  const body = el('div', { class: 'rv-body' }); card.append(body);
  let pick = null, conf = null, free = '';   // pick: the ORIGINAL index of the chosen option (shown in `order`)
  const order = R.options ? shuffleOrder(R.options.length, id) : [];
  const commitBtn = el('button', { class: 'btn primary small', type: 'button', text: 'Commit my prediction', disabled: true });
  const ready = () => { commitBtn.disabled = !((R.options ? pick != null : free.trim().length >= 2) && conf != null); };
  const ask = () => {
    body.innerHTML = '';
    if (R.options) body.append(el('div', { class: 'rv-opts', role: 'radiogroup', 'aria-label': 'Your prediction' }, order.map((i, k) => el('button', { class: 'rv-opt', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-opt': String(i), html: '<i>' + String.fromCharCode(65 + k) + '</i> ' + prose(R.options[i].text), onclick: e => { pick = i; body.querySelectorAll('.rv-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.opt === String(i)))); ready(); } }))));
    else { const ta = el('textarea', { class: 'rv-free', rows: 2, placeholder: 'What do you expect, and why? One line is enough.', 'aria-label': 'Your prediction' }); ta.oninput = () => { free = ta.value; ready(); }; body.append(ta); }
    body.append(el('div', { class: 'rv-conf', role: 'radiogroup', 'aria-label': 'How sure are you?' }, [el('span', { class: 'dim small', text: 'How sure?' }), ...CONF.map(([k, t], i) => el('button', { class: 'rv-c', type: 'button', role: 'radio', 'aria-checked': 'false', text: t, onclick: () => { conf = i; body.querySelectorAll('.rv-c').forEach((b, j) => b.setAttribute('aria-checked', String(j === i))); ready(); } }))]),
      el('div', { class: 'rv-actions' }, [commitBtn, el('button', { class: 'linkbtn', type: 'button', text: 'No idea yet: show me', onclick: () => { conf = -1; done(true); } })]));
    commitBtn.onclick = () => done(false);
  };
  const done = async (skipped) => {
    await loadLedger();
    const ok = skipped ? null : R.options ? !!R.options[pick].correct : null;
    const e = ledger.e[id] = Object.assign(ledger.e[id] || {}, { t: Date.now(), p: skipped ? null : R.options ? pick : free.slice(0, 400), c: conf, ok, title: st.title || '', part: ctx.partTitle || '' });
    if (!e.tr || (e.tr.recall && !e.tr.n && R.transfer)) { const tr = revisitCard(st, R); if (tr) e.tr = tr; }   /* a recall card enrolled by "Check yourself" yields to the transfer card */
    session(); save(); show(e, true);
  };
  const show = (e, fresh) => {
    body.innerHTML = ''; card.classList.add('revealed');
    const hyper = e.ok === false && e.c === 2, surprise = e.ok === false;
    card.classList.toggle('rv-surprise', surprise); card.classList.toggle('rv-hyper', hyper); card.classList.toggle('rv-right', e.ok === true);
    head.querySelector('.rv-kicker').textContent = e.ok === true ? 'Your model predicted it' : hyper ? 'You were certain, and it went the other way' : surprise ? 'Not what you expected' : e.p != null ? 'Compare with what you wrote' : 'Revealed';
    if (R.options) body.append(el('div', { class: 'rv-opts done' }, order.map((i, k) => { const o = R.options[i]; return el('div', { class: 'rv-opt' + (o.correct ? ' right' : '') + (i === e.p && !o.correct ? ' wrong' : '') + (i === e.p ? ' picked' : ''), html: '<i>' + String.fromCharCode(65 + k) + '</i> ' + prose(o.text) + (o.why && (o.correct || i === e.p) ? `<span class="rv-why">${prose(o.why)}</span>` : '') }); })));
    else if (typeof e.p === 'string' && e.p) body.append(el('div', { class: 'rv-yours' }, [el('span', { class: 'dim small', text: 'You wrote: ' }), el('q', { text: e.p })]));
    if (R.answer) body.append(el('div', { class: 'rv-answer', html: prose(R.answer) }));
    if (R.figure && ctx.figure) body.append(ctx.figure(R.figure));
    if (R.rule) body.append(el('div', { class: 'rv-rule' }, [el('span', { class: 'rvl-tag', text: 'The rule' }), el('span', { html: prose(R.rule) })]));
    // a confident error is the best moment to correct a misconception: say what the wrong model was, and why it fails
    if (surprise && R.misconception) body.append(el('div', { class: 'rv-refute' }, [el('span', { class: 'rvl-tag', text: hyper ? 'Why it felt right' : 'The tempting model' }), el('span', { html: prose(R.misconception) })]));
    if (hyper) body.append(el('p', { class: 'rvl-note dim small', text: 'Confident errors, once corrected, are among the best-remembered things there are. This one is now worth more than a lucky guess.' }));
    if (R.analogy) body.append(renderAnalogy(R.analogy, ctx, st));
    // the truth constraint: the rule's edge, opened by the reader (finding where it breaks is the second "aha")
    if (R.boundary) { const b = el('div', { class: 'rv-bound', hidden: true, html: '<b>Where it stops working.</b> ' + prose(R.boundary.case) + (R.boundary.why ? ' <span class="dim">' + prose(R.boundary.why) + '</span>' : '') }); body.append(el('button', { class: 'linkbtn rv-edge', type: 'button', text: 'Find the edge of this rule', onclick: ev => { b.hidden = false; ev.target.remove(); ctx.typeset && ctx.typeset(b); } }), b); }
    // self-explanation: in their words, kept for them; never graded
    const ex = el('textarea', { class: 'rv-free', rows: 2, placeholder: 'Why is it so? Say it back in one line (it stays with this step).', 'aria-label': 'Your explanation', text: e.why || '' });
    ex.onchange = () => { e.why = ex.value.slice(0, 600); save(); };
    body.append(el('details', { class: 'rv-explain', open: !!e.why }, [el('summary', { text: e.why ? 'Your explanation' : 'Explain it back (optional)' }), ex]));
    if (R.transfer) body.append(el('div', { class: 'rv-next dim small', text: 'A new situation that uses this rule waits further down this step, after the explanation: try it there.' }));
    body.append(el('button', { class: 'linkbtn rv-again', type: 'button', text: 'Predict again', onclick: () => { card.classList.remove('revealed', 'rv-surprise', 'rv-hyper', 'rv-right'); head.querySelector('.rv-kicker').textContent = 'Predict, then unfold'; pick = conf = null; free = ''; ask(); } }));
    ctx.typeset && ctx.typeset(card);
    if (fresh) {
      ctx.sfx && ctx.sfx.play(e.ok === true ? 'step-done' : surprise ? 'chime' : 'paper', { gain: hyper ? 1 : .7, pitch: hyper ? .8 : 1 });
      if (card.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) card.animate([{ boxShadow: `0 0 0 0 ${hyper ? 'rgba(212,175,80,.85)' : 'rgba(63,125,110,.55)'}` }, { boxShadow: `0 0 0 ${hyper ? 22 : 12}px rgba(212,175,80,0)` }], { duration: hyper ? 1200 : 800, easing: 'ease-out' });
      ctx.onReveal && ctx.onReveal(e);
    }
  };
  loadLedger().then(() => { const e = prior(); if (e && e.t) show(e, false); else ask(); });
  return card;
}
// an analogy in a reveal is drawn the same way as everywhere else: the selectable analogy map (js/dio/prims/analogy.js),
// each row drawn on both sides when selected; only one too thin to map (fewer than two pairs) stays a small table
export function analogyFigure(a, target) {
  if (!a || !a.source || !Array.isArray(a.maps) || a.maps.length < 2) return null; const br = Array.isArray(a.breaks) ? a.breaks : a.breaks ? [a.breaks] : [];
  if (!br.length) return null;
  return { kind: 'analogy_map', caption: 'Click a row to see both sides drawn; the torn edge is where the likeness stops.', source: String(a.source), target: String(target || a.target || 'this idea'), maps: a.maps.map(m => Array.isArray(m) ? [m[0], m[1], m[2] || ''] : m), breaks: br };
}
function renderAnalogy(a, ctx, st) {
  const f = analogyFigure(a, st && st.title); if (f && ctx.figure) return el('div', { class: 'rv-analogy' }, [el('span', { class: 'rvl-tag', text: 'Like ' + (a.source || 'this') }), ctx.figure(f)]);
  return el('div', { class: 'rv-analogy' }, [el('span', { class: 'rvl-tag', text: 'Like ' + (a.source || 'this') }),
    Array.isArray(a.maps) && a.maps.length ? el('table', { class: 'rv-map' }, [el('tbody', {}, a.maps.slice(0, 6).map(m => el('tr', {}, [el('td', { html: prose(String(m[0] || '')) }), el('td', { class: 'dim', text: '↔' }), el('td', { html: prose(String(m[1] || '')) })])))]) : null,
    a.breaks ? el('div', { class: 'rv-breaks', html: '<b>Where the likeness breaks:</b> ' + prose(a.breaks) }) : null]);
}
const dueText = d => { const n = Math.max(0, Math.round((d - Date.now()) / DAY)); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };

// ---- pacing: closed loops are counted, time is not. After several in one sitting the engine says so, once ----
function session() {
  const now = Date.now(), S = ledger.sessions = (ledger.sessions || []).filter(s => now - s < 3 * 3600e3); S.push(now);
  if (S.length === 6) toast('Six new models in one sitting. Spacing beats cramming: the ones due tomorrow will mean more then than a seventh would now.');
}

// ---- the ledger's numbers (loops closed, transfer questions answered) ----
export async function stats() {
  await loadLedger(); const E = Object.values(ledger.e), H = E.flatMap(e => (e.tr && !e.tr.recall && e.tr.hist) || []);   /* transfer accuracy counts transfer questions only, not self-graded recall */
  return { loops: E.filter(e => e.t).length, cards: E.filter(e => e.tr).length, predicted: E.filter(e => e.ok != null).length, rightFirst: E.filter(e => e.ok === true).length, transfers: H.length, transferRight: H.filter(Boolean).length, due: E.filter(e => e.tr && e.tr.due <= Date.now()).length };
}
export function answerTransfer(id, correct) {
  const e = ledger && ledger.e[id]; if (!e || !e.tr) return; const T = e.tr; T.n++; T.hist.push(correct ? 1 : 0); T.hist = T.hist.slice(-12);
  T.iv = correct ? Math.min(120, Math.max(2, T.iv * 2.5)) : 1; T.due = Date.now() + T.iv * DAY; save();
}

// ---- "Try it in a new situation": the step's transfer question, inline in the scroll, right after its analogy ----
// (it replaces the separate Revisit window: a new situation means most next to the analogy and the rule it tests)
// The answer is kept in the ledger entry of the step (e.ti = {p: the option's original index, ok, t}) and counted in
// the transfer history (answerTransfer), so an older ledger with deck cards stays valid.
export function transferSpec(st) { const r = st && st.reveal; return r && r.transfer && r.transfer.q ? r.transfer : null; }
export function renderTransfer(st, ctx) {
  const T = transferSpec(st); if (!T) return null;
  const id = ctx.partId + '/' + st.id, opts = Array.isArray(T.options) && T.options.length >= 2 && T.options.some(o => o && o.correct) ? T.options : null, order = opts ? shuffleOrder(opts.length, id + '/transfer') : [];
  const rule = (st.reveal && st.reveal.rule) || '';
  const card = el('div', { class: 'transfer-card', 'data-sid': st.id }), body = el('div', { class: 'tr-body' });
  card.append(el('div', { class: 'tr-head' }, [el('span', { class: 'rv-kicker', text: 'Try it in a new situation' }), el('div', { class: 'rv-hook', html: prose(T.q) })]), body);
  const record = async (p, ok) => { await loadLedger(); const e = ledger.e[id] = Object.assign(ledger.e[id] || {}, { title: st.title || '', part: ctx.partTitle || '' }); if (!e.tr || e.tr.recall) e.tr = revisitCard(st, { transfer: T, rule }); e.ti = { p, ok, t: Date.now() }; if (e.tr && ok != null) answerTransfer(id, ok); else save(); };
  const verdict = (ok) => el('div', { class: 'rv-answer tr-why', html: (ok === true ? '<b>Transferred.</b> ' : ok === false ? '<b>Not yet.</b> ' : '') + prose(T.why || '') + (rule ? `<div class="rv-rule"><span class="rvl-tag">The rule</span> <span>${prose(rule)}</span></div>` : '') });
  const ask = () => { body.innerHTML = ''; card.classList.remove('rv-right', 'rv-surprise');
    if (opts) body.append(el('div', { class: 'rv-opts', role: 'group', 'aria-label': 'Your answer' }, order.map((i, k) => el('button', { class: 'rv-opt', type: 'button', 'data-opt': String(i), html: '<i>' + String.fromCharCode(65 + k) + '</i> ' + prose(opts[i].text), onclick: () => { record(i, !!opts[i].correct); shown(i, true); } }))));
    else body.append(el('div', { class: 'rv-actions' }, [el('span', { class: 'dim small', text: 'Work it out first, then look.' }), el('button', { class: 'btn small', type: 'button', text: 'Show the answer', onclick: () => { record(null, null); shown(null, true); } })]));
  };
  const shown = (p, fresh) => { body.innerHTML = '';
    if (opts) { const ok = p != null && !!opts[p].correct; card.classList.toggle('rv-right', ok); card.classList.toggle('rv-surprise', p != null && !ok);
      body.append(el('div', { class: 'rv-opts done' }, order.map((i, k) => { const o = opts[i]; return el('div', { class: 'rv-opt' + (o.correct ? ' right' : '') + (i === p && !o.correct ? ' wrong' : '') + (i === p ? ' picked' : ''), html: '<i>' + String.fromCharCode(65 + k) + '</i> ' + prose(o.text) + (o.why && (o.correct || i === p) ? `<span class="rv-why">${prose(o.why)}</span>` : '') }); })), verdict(ok)); }
    else body.append(verdict(null));
    body.append(el('button', { class: 'linkbtn rv-again', type: 'button', text: 'Try it again', onclick: ask }));
    ctx.typeset && ctx.typeset(card); if (fresh && ctx.sfx) ctx.sfx.play(opts && p != null && opts[p].correct ? 'step-done' : 'paper', { gain: .6 }); };
  ask(); loadLedger().then(() => { const e = ledger.e[id]; if (e && e.ti && (e.ti.p == null || (opts && opts[e.ti.p]))) shown(e.ti.p, false); }).catch(() => { });
  return card;
}
