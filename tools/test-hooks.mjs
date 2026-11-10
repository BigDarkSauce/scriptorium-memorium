// Revelation hooks (js/room/hooks.js) and the laboratory's pure parts, on the built-in content:
//   every seeded scroll hook is valid and paid at a step that exists (and not before it is asked); every diorama
//   opening names a lesson its model really has; the gate refuses a hook without a payoff, a predict without exactly
//   one correct option and a partial with nothing veiled; the fallback opening veils a piece of the scroll's own
//   conclusion.                                                    node tools/test-hooks.mjs
import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem() { return null; }, setItem() { } };
const { normHook, hookIssues, fallbackHook, TECHNIQUES, FAMILIES } = await import('../js/room/hooks.js');
const { SCROLL_HOOKS, DIO_HOOKS } = await import('../js/seeds-hooks.js');
const { legacyScrolls } = await import('../js/seeds-legacy.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ', m); } };
// the example chains: the legacy seeds in full, the four flagship scrolls (main.js) as S1–S3
const chains = {}; Object.values(legacyScrolls()).flat().forEach(s => { chains[s.analysis.title] = s.analysis.chain; });
['The water cycle', 'Galton board', 'Supply and demand', 'Osmosis'].forEach(t => { chains[t] = ['S1', 'S2', 'S3'].map(id => ({ id })); });
const used = new Set();
for (const [title, H] of Object.entries(SCROLL_HOOKS)) {
  const ch = chains[title]; ok(ch, title + ': a chain of that title exists'); if (!ch) continue;
  ok(H.open, title + ': has an opening hook');
  for (const [at, h] of Object.entries(H)) { used.add(h.technique); const w = title + ' / ' + at;
    ok(normHook(h), w + ': valid'); const iss = hookIssues(h, ch, at === 'open' ? null : at); ok(!iss.length, w + ': ' + iss.join('; '));
    ok(String(h.payoff || '').length > 40, w + ': a real payoff'); if (h.options) ok(h.options.filter(o => o.correct).length === 1, w + ': exactly one correct option'); }
}
ok(Object.keys(TECHNIQUES).every(k => used.has(k)), 'all five curiosity techniques are used in the example library: ' + [...used].join(', '));
ok(FAMILIES.find(f => f.id === 'curiosity').techniques.length === 5, 'the curiosity family lists five techniques');
// diorama openings: the lesson they name exists in that model (or flagship scene)
const models = readFileSync(new URL('../js/dio/models.js', import.meta.url), 'utf8'), scenes = readFileSync(new URL('../js/seeds-scenes.js', import.meta.url), 'utf8');
const lessonsOf = key => { const m = new RegExp('DIO\\.' + key + '\\.lessons=\\[').exec(models); if (m) { const blk = models.slice(m.index, models.indexOf('\n];', m.index)); return [...blk.matchAll(/\{title:'((?:[^'\\]|\\.)*)'/g)].map(x => x[1].replace(/\\'/g, "'")); }
  const i = scenes.indexOf("title: '" + key + "'"); if (i < 0) return null; const j = scenes.indexOf('lessons:', i); return [...scenes.slice(j, j + 40000).matchAll(/\{ ?title: '((?:[^'\\]|\\.)*)'/g)].map(x => x[1].replace(/\\'/g, "'")); };
for (const [key, h] of Object.entries(DIO_HOOKS)) { const L = lessonsOf(key); ok(L, key + ': model or scene found'); ok(normHook(h), key + ': valid'); ok(L && L.includes(h.lesson), `${key}: lesson "${h.lesson}" exists (${L && L.slice(0, 6).join(' | ')})`); ok(String(h.payoff || '').length > 30, key + ': payoff'); }
// the gate
ok(hookIssues({ technique: 'anomaly', text: 'x', resolvedIn: 'S2' }, [{ id: 'S1' }, { id: 'S2' }]).some(d => /payoff/.test(d)), 'gate: a hook without its payoff is refused');
ok(hookIssues({ technique: 'anomaly', text: 'x', resolvedIn: 'S9', payoff: 'p' }, [{ id: 'S1' }]).length, 'gate: a hook paid at a step that does not exist is refused');
ok(hookIssues({ technique: 'anomaly', text: 'x', resolvedIn: 'S1', payoff: 'p' }, [{ id: 'S1' }, { id: 'S2' }], 'S2').length, 'gate: a hook settled before it is asked is refused');
ok(!normHook({ technique: 'predict', text: 'q', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }), 'gate: two correct options are refused');
ok(!normHook({ technique: 'partial', text: 'q', parts: ['nothing hidden'] }), 'gate: a partial revelation that veils nothing is refused');
ok(!normHook({ technique: 'clickbait', text: 'q' }), 'gate: an unknown technique is refused');
// the fallback opening: a piece of the scroll's own conclusion, veiled, paid where that step is
const F = fallbackHook({ chain: [{ id: 'S1', statement: 'short' }, { id: 'S2', kind: 'definition', statement: 'A definition that is long enough to be chosen but is a definition.' }, { id: 'S3', kind: 'result', statement: 'For dilute solutions the balancing pressure is $\\pi = cRT$, proportional to the concentration.' }] });
ok(F && F.technique === 'partial' && F.resolvedIn === 'S3' && F.parts.some(p => p.hide === '$\\pi = cRT$'), 'fallback veils the conclusion’s formula');
const F2 = fallbackHook({ chain: [{ id: 'S1', statement: 'a' }, { id: 'S2', statement: 'b' }, { id: 'S3', kind: 'result', statement: 'Trade prices in a double auction converge towards the price where demand meets supply.' }] });
ok(F2 && F2.parts.some(p => p.hide && /towards/.test(p.hide)), 'fallback veils the second half of a sentence without maths');
// the deepest dive's gate (js/ai/prompts.js): a hand-waving step, a formula without its use, a derivation line without its
// reason and a chain without foundations are all sent back for repair; a step that meets every rule passes
{ const { qualityGate, chapterPrompt, DEEPEST_DIVE } = await import('../js/ai/prompts.js');
  const good = { id: 'S1', section: '1', kind: 'result', title: 'Period', statement: 'The period of a small swing is T = 2π√(L/g).', recap: 'We have the equation of motion; now we solve it.', math: 'T=2\\pi\\sqrt{L/g}', derivation: [{ expr: 'a', why: 'divide both sides by m: allowed because m is not zero' }], use: { answers: 'How long one swing takes', symbols: 'L length (m), g gravity (m/s²)', holds: 'small swings', example: 'L = 1 m gives T = 2.0 s', check: 'units: √(m / (m/s²)) = s' }, groundwork: [{ idea: 'square root', plain: 'the number that times itself gives the original', why: 'T has √', build: ['2 × 2 = 4, so √4 = 2'], example: '√9 = 3' }], explain: [{ text: 'A small swing takes the same time whatever its size.' }] };
  const bad = { ...good, id: 'S2', statement: 'Clearly the period follows.', use: null, derivation: [{ expr: 'b' }], recap: '', groundwork: [] };
  const G = qualityGate({ deep: true, chain: [good, bad] }, [], []), deep = G.issues.filter(i => i.kind === 'deep');
  ok(!deep.some(i => i.step === 'S1'), 'deep gate: a step that meets every rule passes (' + deep.filter(i => i.step === 'S1').map(i => i.detail).join('; ') + ')');
  ['clearly', 'use', 'why', 'recap'].forEach(w => ok(deep.some(i => i.step === 'S2' && i.detail.includes(w)), 'deep gate: flags ' + w));
  ok(qualityGate({ deep: true, chain: [bad] }, [], []).issues.some(i => i.kind === 'deep' && /groundwork/.test(i.detail)), 'deep gate: a chain without foundations is flagged');
  ok(!qualityGate({ chain: [bad] }, [], []).issues.some(i => i.kind === 'deep'), 'deep gate: off unless the scroll is a deepest dive');
  const P1 = chapterPrompt({ book: 'b', chapter: 'c', text: 'x', deep: true }), P0 = chapterPrompt({ book: 'b', chapter: 'c', text: 'x' });
  ok(P1.includes('DEEPEST DIVE') && !P0.includes('DEEPEST DIVE (this overrides'), 'the deepest dive goes into the prompt only when chosen');
  ok(/groundwork/.test(DEEPEST_DIVE) && /never assume|Never assume/i.test(DEEPEST_DIVE), 'the deepest dive asks for foundations and assumes nothing'); }
console.log(`test-hooks: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
