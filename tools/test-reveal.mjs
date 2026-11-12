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
// a transfer with two options is a coin toss: the gate asks for at least three
ok(revealIssues({ id: 'S1', reveal: { transfer: { q: 'new case?', options: [{ text: 'a', correct: true }, { text: 'b' }] } } }).some(x => /at least 3/.test(x)), 'a two-option transfer is flagged');
ok(!revealIssues({ id: 'S1', reveal: { transfer: { q: 'new case?', options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c' }] } } }).length, 'a three-option transfer passes');

// ---- the options' order: shuffled per step, fixed for that step, a permutation; the answer tracked by identity ----
const RV = await import('../js/room/reveal.js'), { shuffleOrder, revisitCard, enrollCheck, renderReveal, ledgerNow, stats, renderTransfer, analogyFigure } = RV;
{ const a = shuffleOrder(4, 'p/S1'), b = shuffleOrder(4, 'p/S1'); ok(JSON.stringify(a) === JSON.stringify(b), 'the order is the same on every render of a step');
  ok([...a].sort().join() === '0,1,2,3', 'the order is a permutation');
  const pos = new Set(); for (let i = 1; i <= 40; i++) pos.add(shuffleOrder(3, 'part/S' + i).indexOf(1)); ok(pos.size === 3, 'the correct option (stored second) is shown in every position across steps'); }
// a minimal DOM, enough for the predict card: click the shown option that holds the right text, commit, check the ledger
class N { constructor(t) { this.tag = t; this.children = []; this.attrs = {}; this.ls = {}; this.className = ''; this._t = ''; this._h = ''; this.dataset = {}; this.parentNode = null; this.hidden = false; this.disabled = false; this.style = {}; }
  get classList() { const s = () => this.className.split(/\s+/).filter(Boolean); const L = { add: (...c) => { this.className = [...new Set([...s(), ...c])].join(' '); }, remove: (...c) => { this.className = s().filter(x => !c.includes(x)).join(' '); }, contains: c => s().includes(c), toggle: (c, on) => { on = on === undefined ? !s().includes(c) : !!on; on ? L.add(c) : L.remove(c); return on; } }; return L; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); if (k === 'hidden') this.hidden = true; if (k === 'disabled') this.disabled = true; }
  getAttribute(k) { return this.attrs[k] ?? null; } addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); } removeEventListener() { }
  click() { const ev = { target: this, currentTarget: this }; (this.ls.click || []).forEach(f => f(ev)); if (this.onclick) this.onclick(ev); }
  append(...k) { k.forEach(c => { if (c == null) return; if (typeof c === 'string') { const x = new N('#text'); x._t = c; c = x; } c.parentNode = this; this.children.push(c); }); } appendChild(c) { this.append(c); return c; }
  get firstChild() { return this.children[0] || null; } remove() { const p = this.parentNode; if (p) { p.children = p.children.filter(x => x !== this); this.parentNode = null; } }
  set innerHTML(h) { this.children = []; this._h = String(h); this._t = ''; } get innerHTML() { return this._h; }
  set textContent(t) { this.children = []; this._t = String(t); this._h = ''; } get textContent() { return this._t + this._h.replace(/<[^>]+>/g, '') + this.children.map(c => c.textContent).join(''); }
  *all() { for (const c of this.children) { yield c; yield* c.all(); } }
  querySelectorAll(sel) { const cs = sel.split(',').map(x => x.trim().replace(/^\./, '')); return [...this.all()].filter(n => cs.some(c => n.classList.contains(c))); } querySelector(sel) { return this.querySelectorAll(sel)[0] || null; } }
globalThis.document = { createElement: t => new N(t), body: new N('body'), head: new N('head'), getElementById: () => ({}), querySelector: () => null }; globalThis.requestAnimationFrame = f => setTimeout(f, 0); globalThis.matchMedia = () => ({ matches: true });
const tick = () => new Promise(r => setTimeout(r, 5));
{ const st = { id: 'S7', title: 'Why the pendulum swings back', check: { q: 'What pulls it back?', a: 'The tangential part of its weight.' }, reveal: { type: 'mechanism', hook: 'Released, which way does it go first?', predict: { options: [{ text: 'Up, away from the bottom' }, { text: 'Down, toward the bottom', correct: true }, { text: 'It stays put' }] }, rule: 'r', boundary: { case: 'c' } } };
  const card = renderReveal(st, { partId: 'pX', partTitle: 'Pendulum' }); await tick();
  const shown = card.querySelectorAll('.rv-opt'); ok(shown.length === 3, 'three options shown');
  ok(shown.map(b => b.dataset.opt).join() === shuffleOrder(3, 'pX/S7').join(), 'shown in the step\'s own order');
  const right = shown.find(b => /toward the bottom/.test(b.textContent)); right.click(); card.querySelectorAll('.rv-c')[1].click();
  card.querySelector('.btn').click(); await tick();
  const e = ledgerNow().e['pX/S7']; ok(e && e.ok === true && e.p === 1, 'the pick is stored as the option itself (original index 1), and judged right wherever it was shown');
  // no transfer: the step's "Check yourself" enters the spaced deck as a free-recall card
  ok(e.tr && e.tr.recall && e.tr.q === st.check.q && e.tr.a === st.check.a, 'a step without a transfer is spaced through its check (free recall)'); }
// ---- every step with a check is spaced: from the predict card (above) or from "Show the answer" (enrollCheck) ----
ok(revisitCard({ id: 'S1', check: { q: 'Q?', a: 'A.' } }, null).recall, 'revisitCard falls back to the check');
ok(revisitCard({ id: 'S1', reveal: { transfer: { q: 'T?', options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c' }] } }, check: { q: 'Q?', a: 'A.' } }).q === 'T?', 'a transfer question is preferred when there is one');
ok(revisitCard({ id: 'S1' }, null) === null, 'no check, no transfer: no card');
{ await enrollCheck('pY', 'Rocks', { id: 'S2', title: 'Types of rock', check: { q: 'Name the three kinds?', a: 'Igneous, sedimentary, metamorphic.' } });
  const e = ledgerNow().e['pY/S2']; ok(e && e.tr && e.tr.recall && !e.t, 'a taxonomy step\'s check is enrolled when its answer is shown (not counted as a predicted loop)');
  const S0 = await stats(); ok(S0.cards >= 2 && S0.due === 0, 'the cards are counted, due tomorrow');
  const { answerTransfer } = await import('../js/room/reveal.js'); answerTransfer('pY/S2', true); ok(e.tr.iv >= 2 && e.tr.due > Date.now() + 864e5, '"Good" spaces the card further'); answerTransfer('pY/S2', false); ok(e.tr.iv === 1, '"Again" brings it back tomorrow');
  const S1 = await stats(); ok(S1.transfers === 0, 'self-graded recall does not count as transfer accuracy'); }
// ---- no Revisit window any more: its "new situations" live in the scroll, right after the step's analogy ----
ok(!('openDeck' in RV) && !('dueTransfers' in RV), 'the Revisit deck (window and queue) is gone');
ok(renderTransfer({ id: 'S1', title: 't' }, { partId: 'pZ' }) === null, 'a step without a transfer gets no "new situation" card');
{ const st = { id: 'S3', title: 'Resistances in series', reveal: { rule: 'Resistances in series add.', boundary: { case: 'c' }, transfer: { q: 'Two heaters in series instead of one: the heat given off is…', options: [{ text: 'Twice as much.' }, { text: 'The same.' }, { text: 'Half as much.', correct: true, why: 'Half the current through twice the resistance.' }], why: 'Power I²R falls to a half.' } } };
  const card = renderTransfer(st, { partId: 'pZ', partTitle: 'Circuits' }); await tick();
  ok(card && card.classList.contains('transfer-card') && /new situation/i.test(card.textContent), 'the inline card is titled "Try it in a new situation"');
  const shown = card.querySelectorAll('rv-opt'); ok(shown.length === 3 && shown.map(b => b.dataset.opt).join() === shuffleOrder(3, 'pZ/S3/transfer').join(), 'its options are shown in an order fixed for the step');
  shown.find(b => /Half/.test(b.textContent)).click(); await tick(); await tick();
  const e = ledgerNow().e['pZ/S3']; ok(e && e.ti && e.ti.ok === true && e.ti.p === 2, 'the answer is kept in the step\'s ledger entry, as the option itself');
  ok(e.tr && !e.tr.recall && e.tr.hist.join() === '1' && e.tr.iv >= 2, 'a right answer counts as transfer accuracy and spaces the question');
  ok(card.classList.contains('rv-right') && /Transferred/.test(card.textContent) && /Resistances in series add/.test(card.textContent), 'the verdict, the why and the rule are shown');
  const again = renderTransfer(st, { partId: 'pZ', partTitle: 'Circuits' }); await tick(); await tick(); ok(again.querySelector('rv-opts').classList.contains('done'), 'on a new render the answered card stays answered');
  again.querySelector('rv-again').click(); const w = again.querySelectorAll('rv-opt').find(b => /Twice/.test(b.textContent)); w.click(); await tick(); await tick();
  ok(ledgerNow().e['pZ/S3'].ti.ok === false && ledgerNow().e['pZ/S3'].tr.iv === 1 && again.classList.contains('rv-surprise'), 'a wrong answer is recorded and the question comes back sooner');
  const S2 = await stats(); ok(S2.transfers === 2 && S2.transferRight === 1, 'transfer accuracy counts both answers'); }
{ const st = { id: 'S4', title: 'x', reveal: { transfer: { q: 'A new case?', why: 'Because the same rule applies.' } } };
  const card = renderTransfer(st, { partId: 'pZ' }); await tick(); const b = card.querySelector('btn'); ok(b && /Show the answer/.test(b.textContent), 'a transfer without options asks to work it out first');
  b.click(); await tick(); ok(/same rule applies/.test(card.textContent), 'then shows its answer'); }
// a reveal's analogy is drawn as the selectable analogy map whenever it has two pairs and a limit
{ const { validateFigure } = await import('../js/room/figspec.js');
  const f = analogyFigure({ source: 'water in pipes', maps: [['pump', 'battery'], ['narrow pipe', 'resistor']], breaks: 'A cut pipe spills water; a cut wire spills nothing.' }, 'Circuits');
  ok(f && validateFigure(f).ok && validateFigure(f).fig.breaks.length === 1, 'the reveal\'s analogy becomes a valid analogy_map');
  ok(analogyFigure({ source: 's', maps: [['a', 'b']], breaks: 'x' }) === null, 'one pair is too thin to map: it stays a small table'); }
// nothing a reader reads is cut in the middle of a sentence
{ const long = 'First sentence of the mistake is here. ' + 'It makes the second one slower per collision than it seems. '.repeat(8);
  const n = normReveal({ misconception: long, rule: 'no stop at all '.repeat(40) });
  ok(/[.]$/.test(n.misconception) && n.misconception.length <= 400, 'a long misconception is shortened at a sentence end');
  ok(n.rule === ('no stop at all '.repeat(40)).trim(), 'a text with no sentence end is kept whole, never cut mid-sentence'); }
console.log(`test-reveal: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
