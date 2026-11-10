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
console.log(`test-hooks: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
