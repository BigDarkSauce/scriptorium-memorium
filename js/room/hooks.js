// Revelation techniques: a library of ways to REVEAL knowledge (not transitions, camera moves or effects, which are only
// carriers). Each technique is a small, named move with a mechanism, the evidence for it, the places in a scroll or a
// diorama where it belongs, and the rule that keeps it honest. Families (docs/research/revelation-techniques.md):
//
//   curiosity      Curiosity and anticipation: create the desire to find out (this file renders them)
//   contrast       Contrast and surprise: wrong beside right, a staged misconception refuted (motion.js, reveal.js)
//   disclosure     Progressive disclosure: layer by layer, scale by scale, part by part (grammar.js, focus.js)
//   construction   Construction: the learner builds it, or fails productively first (prims/construct.js)
//   perspective    Perspective: ride the subject, true scale, slowed or sped time, the counterfactual (engine.js POV, lab)
//   closure        Closure and consolidation: the payoff, explain-back, transfer days later (reveal.js, this file)
//
// The curiosity family, five techniques. All five open an information gap, a felt difference between what one knows and
// what one wants to know (Loewenstein 1994); curiosity raised before an answer improves memory for it (Kang et al. 2009;
// Gruber, Gelman & Ranganath 2014), and a gap is felt only when it is small enough to close (Metcalfe, Schwartz & Eich
// 2020), so every hook names where it closes. Its rule: a hook is a promise, and the scroll pays it (resolvedIn), at the
// step that explains it, with the reader's own prediction recalled. A hook that is never paid is clickbait; the gate
// (hookIssues) refuses it.
import { el, mathHTML } from '../util.js';
import { prose } from './prose.js';

export const FAMILIES = [
  { id: 'curiosity', name: 'Curiosity and anticipation', aim: 'create the desire to discover', techniques: ['partial', 'anomaly', 'impossible', 'predict', 'consequence'], built: 'scroll openings, step hooks, fold teasers, diorama openings, experiments (this file, engine.js, lab.js)' },
  { id: 'contrast', name: 'Contrast and surprise', aim: 'make the right idea visible against the wrong one', techniques: ['wrong beside right', 'staged misconception, then refuted', 'contrasting cases', 'near miss'], built: 'motion figures (motion.js), the predict–reveal loop (reveal.js), compare (grammar.js)' },
  { id: 'disclosure', name: 'Progressive disclosure', aim: 'one layer of the answer at a time', techniques: ['peel layers', 'section cut', 'zoom through scales', 'explode and reassemble', 'unroll fold by fold'], built: 'grammar.js, focus.js, the scroll folds (reader.js)' },
  { id: 'construction', name: 'Construction', aim: 'the learner assembles the knowledge', techniques: ['build up from the simplest version', 'productive failure', 'derive one justified move at a time'], built: 'prims/construct.js, derivations (reader.js)' },
  { id: 'perspective', name: 'Perspective', aim: 'see it from where it happens', techniques: ['ride the subject', 'true relative scale', 'slow or fast time', 'counterfactual run'], built: 'POV (engine.js), scaleTo (grammar.js), the laboratory (lab.js)' },
  { id: 'closure', name: 'Closure and consolidation', aim: 'pay the debt and keep the answer', techniques: ['payoff callback', 'explain it back', 'transfer on a later day'], built: 'payoffs (this file), reveal.js' },
];

// the curiosity family, in full
export const TECHNIQUES = {
  partial: { name: 'Partial revelation', tag: 'Half the picture', how: 'Show the result with its key part veiled: the reader sees the shape of the answer and wants the rest.', why: 'An incomplete pattern pulls towards completion; a gap of known size is the one curiosity is greatest for (Loewenstein 1994; Metcalfe et al. 2020).', where: ['scroll opening', 'step hook', 'diorama opening (the drawing before it turns real)'], rule: 'The veiled part is true and is shown in full at resolvedIn; the reader may peek.' },
  anomaly: { name: 'Anomaly introduction', tag: 'Something does not fit', how: 'Present an observation the reader’s current idea cannot explain.', why: 'Anomalous data, when it is credible and cannot be dismissed, is what drives a change of concept (Chinn & Brewer 1993; Posner et al. 1982); surprise feeds curiosity and exploration (Vogl et al. 2019).', where: ['scroll opening', 'step hook', 'diorama opening'], rule: 'A real, checkable observation, stated with its numbers; never invented to be strange.' },
  impossible: { name: 'Apparent impossibility', tag: 'This seems impossible', how: 'State something true that sounds as if it cannot be.', why: 'A contradiction between two things the reader believes opens the widest gap a reader still feels able to close (Berlyne 1954, conceptual conflict).', where: ['scroll opening', 'step hook', 'diorama opening'], rule: 'True as stated; the resolution names which belief was wrong.' },
  predict: { name: 'Prediction invitation', tag: 'Predict first', how: 'Ask the reader to commit to an outcome before it is shown; keep the answer until the place that explains it.', why: 'Generating a prediction boosts learning through the surprise of an error (Brod, Hasselhorn & Bunge 2018); the committed answer is remembered and recalled at the payoff.', where: ['scroll opening', 'step hook', 'diorama step', 'guided experiment'], rule: 'Two to four options, exactly one correct, the wrong ones the real misconceptions; the answer is not revealed at the hook.' },
  consequence: { name: 'Unexplained consequence', tag: 'Effect first, cause later', how: 'Show what happens, in full, and hold back why.', why: 'An effect without its cause is the classic question generator: the reader starts to explain it before being told (Lamnina & Chase 2019: uncertainty raises curiosity).', where: ['scroll opening', 'step hook', 'diorama opening'], rule: 'The consequence is real and the cause is given at resolvedIn.' },
};
export const HOOK_KINDS = Object.keys(TECHNIQUES);

// ---- the spec (written by the AI, js/ai/prompts.js HOOK_SPEC, or by hand, js/seeds-hooks.js) ----
// { technique, text, parts?: [str | {hide}], options?: [{text, correct, why?}], resolvedIn: step id, payoff: str }
//   text: the hook itself (partial: the lead-in before the veiled sentence)
//   parts: partial only: the sentence, its veiled pieces as {hide: "…"}
//   options: predict only
//   payoff: one sentence said at resolvedIn that closes the gap ("Mass cancels from θ̈ = −(g/L) sin θ: …")
export function normHook(h) {
  if (!h || typeof h !== 'object' || !HOOK_KINDS.includes(h.technique)) return null;
  const o = { technique: h.technique, text: String(h.text || '').slice(0, 400), resolvedIn: h.resolvedIn ? String(h.resolvedIn) : '', payoff: String(h.payoff || '').slice(0, 400) };
  if (h.technique === 'partial') { const P = (Array.isArray(h.parts) ? h.parts : []).map(p => typeof p === 'string' ? p : p && p.hide ? { hide: String(p.hide) } : null).filter(Boolean).slice(0, 8); if (!P.some(p => p.hide)) return null; o.parts = P; }
  if (h.technique === 'predict') { const O = (Array.isArray(h.options) ? h.options : []).filter(x => x && x.text).slice(0, 4).map(x => ({ text: String(x.text), correct: !!x.correct, ...(x.why ? { why: String(x.why) } : {}) })); if (O.length < 2 || O.filter(x => x.correct).length !== 1) return null; o.options = O; }
  if (!o.text && !o.parts) return null;
  if (h.lesson != null) o.lesson = h.lesson;   /* a diorama hook: the lesson (index or title) that settles it */
  return o;
}
// the gate: a hook is a promise the scroll must keep
export function hookIssues(h, chain = [], at = null) {
  const out = []; if (!h) return out; const n = normHook(h);
  if (!n) { out.push(`hook: not a valid ${h.technique || 'technique'} (${h.technique === 'predict' ? 'needs 2–4 options, exactly one correct' : h.technique === 'partial' ? 'needs parts with a {hide}' : 'needs a technique from ' + HOOK_KINDS.join(', ') + ' and its text'})`); return out; }
  const ids = chain.map(s => s.id), i = ids.indexOf(n.resolvedIn), i0 = at ? ids.indexOf(at) : -1;
  if (!n.resolvedIn || i < 0) out.push(`hook: "resolvedIn" must name the step that settles it (one of ${ids.slice(0, 12).join(', ')})`);
  else if (i0 >= 0 && i < i0) out.push(`hook at ${at}: it is settled by ${n.resolvedIn}, before it is asked`);
  if (!n.payoff) out.push('hook: needs a "payoff", the sentence that closes the gap at ' + (n.resolvedIn || 'the resolving step'));
  return out;
}

// a scroll without a written hook still opens with one that is true by construction: where the scroll ends, its key
// part veiled (a partial revelation of the scroll's own conclusion, paid where that step is reached)
export function fallbackHook(A) {
  const ch = (A && A.chain) || []; const st = [...ch].reverse().find(s => s.statement && s.statement.length > 40 && s.kind !== 'definition'); if (!st || ch.length < 3) return null;
  const s = String(st.statement); let parts = null;
  const m = /\$[^$]{2,80}\$/.exec(s);
  if (m) parts = [s.slice(0, m.index), { hide: m[0] }, s.slice(m.index + m[0].length)];
  else { const k = s.search(/\b(is|are|equals|gives|grows|falls|depends|satisf(?:y|ies)|converge[s]?)\b/); if (k > 12 && k < s.length - 12) { const w = s.slice(k).match(/^\S+\s*/)[0]; parts = [s.slice(0, k + w.length), { hide: s.slice(k + w.length).replace(/\.\s*$/, '') }, '.']; } }
  if (!parts) return null;
  return { technique: 'partial', text: 'Where this scroll arrives:', parts, resolvedIn: st.id, payoff: 'The sentence the scroll opened with, now complete: ' + s, auto: true };
}

// ---- rendering ----
const saveKey = k => 'scriptorium.hook:' + k;
const getPick = k => { try { const v = localStorage.getItem(saveKey(k)); return v == null ? null : +v; } catch (e) { return null; } };
const setPick = (k, v) => { try { localStorage.setItem(saveKey(k), String(v)); } catch (e) { } };
// ctx: { key (storage id), jump(id), stepLabel(id) → "S6 Harmonic solution", where: 'open'|'step', onPeek }
export function renderHook(h0, ctx = {}) {
  const h = normHook(h0); if (!h) return null; const T = TECHNIQUES[h.technique];
  const box = el('aside', { class: 'hook-card hk-' + h.technique + (ctx.where === 'open' ? ' hk-open' : ''), 'data-hook': h.technique, 'aria-label': T.name });
  box.append(el('div', { class: 'hk-tag', title: T.how }, [el('span', { class: 'hk-glyph', text: { partial: '◐', anomaly: '≠', impossible: '⁈', predict: '?', consequence: '↯' }[h.technique] }), el('span', { text: T.tag })]));
  if (h.text) box.append(el('p', { class: 'hk-text', html: prose(h.text) }));
  if (h.parts) {
    const p = el('p', { class: 'hk-parts' });
    h.parts.forEach(x => { if (typeof x === 'string') { p.insertAdjacentHTML('beforeend', mathHTML(x)); return; }
      const v = el('span', { class: 'hk-veil', role: 'button', tabindex: 0, title: 'Veiled until ' + (h.resolvedIn || 'later') + ': click to peek', 'aria-label': 'Veiled part: click to peek' }, [el('span', { class: 'hk-hidden', html: mathHTML(x.hide) })]);
      v.onclick = () => { if (v.classList.contains('peeked')) return; v.classList.add('peeked'); v.removeAttribute('tabindex'); v.setAttribute('aria-label', 'Peeked'); if (ctx.onPeek) ctx.onPeek(); }; v.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.onclick(); } }; p.append(v); });   /* a span, not a button: a button cannot wrap across lines like the words it hides */
    box.append(p);
  }
  if (h.options) {
    const k = ctx.key, pick = k ? getPick(k) : null, row = el('div', { class: 'hk-opts', role: 'radiogroup', 'aria-label': 'Your prediction' });
    const note = el('div', { class: 'hk-note dim small' });
    const paint = j => { row.querySelectorAll('.hk-opt').forEach((b, i) => { b.setAttribute('aria-checked', String(i === j)); b.disabled = j != null; }); note.textContent = j == null ? 'Commit to one before reading on. The answer is kept for the step that explains it.' : 'Your prediction is kept. ' + (h.resolvedIn ? 'It is settled in ' + (ctx.stepLabel ? ctx.stepLabel(h.resolvedIn) : h.resolvedIn) + '.' : ''); };
    h.options.forEach((o, j) => row.append(el('button', { class: 'hk-opt', type: 'button', role: 'radio', html: mathHTML(o.text), onclick: () => { if (k) setPick(k, j); paint(j); if (ctx.onPick) ctx.onPick(j); } })));
    box.append(row, note); paint(pick);
  }
  if (h.resolvedIn && ctx.jump) box.append(el('div', { class: 'hk-where' }, [el('span', { text: h.technique === 'predict' ? '' : 'Settled in ' }), h.technique === 'predict' ? null : el('a', { tabindex: 0, text: ctx.stepLabel ? ctx.stepLabel(h.resolvedIn) : h.resolvedIn, onclick: () => ctx.jump(h.resolvedIn) }), h.technique === 'predict' ? null : el('span', { class: 'dim', text: ' — read on, or jump there' })]));
  return box;
}
// the payoff at the resolving step: the gap named again and closed, with the reader's prediction recalled
export function renderPayoff(h0, ctx = {}) {
  const h = normHook(h0); if (!h || !h.payoff) return null; const T = TECHNIQUES[h.technique];
  const kids = [el('div', { class: 'hk-tag' }, [el('span', { class: 'hk-glyph', text: '↺' }), el('span', { text: ctx.where === 'open' ? 'The opening, answered' : T.tag + ', answered' })])];
  let fill = null;
  if (h.options) {   // the verdict is written when the payoff comes into view, so it recalls the prediction made since the page was drawn
    const v = el('p', { class: 'hk-verdict' }); kids.push(v);
    fill = () => { const j = ctx.key ? getPick(ctx.key) : null, o = j != null && h.options[j], c = h.options.find(x => x.correct); v.className = 'hk-verdict ' + (o ? (o.correct ? 'ok' : 'no') : '');
      v.innerHTML = o ? (o.correct ? '<b>You predicted it.</b> ' : '<b>You predicted “' + mathHTML(o.text) + '”.</b> ') + (o.correct ? '' : 'It is “' + mathHTML(c.text) + '”. ') + (o.why ? mathHTML(o.why) : '') : '<b>The answer:</b> ' + mathHTML(c.text) + '.'; }; }
  else if (h.text) kids.push(el('p', { class: 'hk-recall dim', html: prose(h.text) }));
  kids.push(el('p', { class: 'hk-payoff-text', html: prose(h.payoff) }));
  const box = el('aside', { class: 'hook-payoff', 'data-hook': h.technique }, kids);
  if (fill) { fill(); if (typeof IntersectionObserver === 'function') { const io = new IntersectionObserver(E => { if (E.some(e => e.isIntersecting)) fill(); }); io.observe(box); } }
  return box;
}
