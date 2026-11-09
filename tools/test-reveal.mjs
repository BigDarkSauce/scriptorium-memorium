// The Revelation Engine's pure checks (js/room/reveal.js) on the built-in content:
//   every built-in reveal passes the truth constraint (a rule has its boundary), has exactly one correct prediction and
//   one correct transfer option; epistemic routing keeps taxonomies and chronologies out of the predict loop; imported
//   reveals are normalised to known fields.            node tools/test-reveal.mjs
const { revealSpec, revealIssues, epistemicType, normReveal } = await import('../js/room/reveal.js');
const { DOMAIN_BOOK } = await import('../js/seeds-domains.js');
const { addReveals } = await import('../js/seeds-sources.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ', m); } };
// the example library's chains get their loops
const fake = t => ({ title: t, chain: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].map(id => ({ id, title: 'x', check: { q: 'q?', a: 'a' } })) });
for (const t of ['The simple pendulum', 'The water cycle', 'Galton board', 'Supply and demand']) { const A = fake(t); ok(addReveals(A), 'reveals added to ' + t); A.chain.filter(s => s.reveal).forEach(st => checkStep(st, t)); ok(!addReveals(A), 'second pass adds nothing for ' + t); }
DOMAIN_BOOK.parts.forEach(p => p.analysis.chain.filter(s => s.reveal).forEach(st => checkStep(st, p.title)));
function checkStep(st, where) {
  const r = st.reveal, w = where + ' ' + st.id;
  ok(!revealIssues(st).length, w + ': ' + revealIssues(st).join('; '));
  ok(r.boundary && r.boundary.case && r.boundary.case.length > 20, w + ': boundary case present');
  ok(r.predict && r.predict.options.filter(o => o.correct).length === 1, w + ': exactly one correct prediction');
  ok(!r.transfer || !r.transfer.options || r.transfer.options.filter(o => o.correct).length === 1, w + ': exactly one correct transfer');
  ok(r.transfer && r.transfer.q !== r.hook, w + ': the transfer is a new question');
  const S = revealSpec(st); ok(S && S.options && S.boundary, w + ': spec builds');
  ok(JSON.stringify(normReveal(r)) === JSON.stringify(normReveal(normReveal(r))), w + ': normalisation is stable');
}
// routing: no "aha" loop for a taxonomy or a chronology, even with a check
ok(epistemicType({ title: 'Types of rock', check: { q: 'x' } }) === 'taxonomy', 'taxonomy detected');
ok(revealSpec({ title: 'Types of rock', check: { q: 'Name three?', a: '…' } }) === null, 'taxonomy gets no predict loop');
ok(revealSpec({ title: 'The war began in 1914 and later spread', check: { q: 'When?', a: '1914' } }) === null, 'chronology gets no predict loop');
ok(!!revealSpec({ title: 'Why the pendulum swings', check: { q: 'What happens if…?', a: '…' } }), 'mechanism with a check gets a free-prediction loop');
// the gate's truth constraint
ok(revealIssues({ id: 'S1', reveal: { rule: 'r', predict: { options: [{ text: 'a', correct: true }, { text: 'b' }] } } }).some(x => /boundary/.test(x)), 'a rule without a boundary is flagged');
ok(revealIssues({ id: 'S1', reveal: { rule: 'r', boundary: { case: 'c' }, predict: { options: [{ text: 'a' }, { text: 'b' }] } } }).some(x => /correct/.test(x)), 'no correct option is flagged');
// normalisation drops unknown fields and code
const n = normReveal({ type: 'causal', hook: 'h', evil: '<script>', predict: { options: ['a', { text: 'b', correct: 1 }] }, boundary: 'edge' });
ok(n && !('evil' in n) && n.predict.options[1].correct === true && n.boundary.case === 'edge', 'normalised');
console.log(`test-reveal: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
