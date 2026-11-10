#!/usr/bin/env node
// Motion figures (js/room/motion.js, js/seeds-motion.js): every "Picture it" and "Common mistake" box of the example
// library has an animation; every spec passes motionIssues (known shapes and makers, expressions that compile); beats
// are ordered captions inside [0, 1]; contrasts have both worlds; makers draw without throwing at several times
// (a minimal DOM stand-in records the marks). Run: node tools/test-motion.mjs
import { MOTION, seedMotion } from '../js/seeds-motion.js';
import { legacyScrolls } from '../js/seeds-legacy.js';
import { groundChain } from '../js/seeds-sources.js';
import { DOMAIN_BOOK } from '../js/seeds-domains.js';
let fail = 0, n = 0; const bad = m => { fail++; console.log('FAIL', m); };
// a tiny DOM stand-in: enough for createElementNS / setAttribute / append / textContent
class E { constructor(t) { this.tagName = t; this.attrs = {}; this.children = []; this.style = {}; } setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; } append(...c) { this.children.push(...c); } remove() { } set textContent(v) { this.children = []; this._t = v; } get textContent() { return this._t || ''; } getTotalLength() { return 100; } getPointAtLength(l) { return { x: l, y: 0 }; } }
globalThis.document = { createElementNS: (ns, t) => new E(t), createElement: t => new E(t) };
const { MAKERS_FOR_TEST, motionIssues, interp } = await import('../js/room/motion.js');
// every seeded box has its animation
const seen = new Set(), slots = [];
const visit = A => { if (!A || seen.has(A.title)) return; seen.add(A.title); A = groundChain(JSON.parse(JSON.stringify(A))); for (const st of A.chain || []) for (const k of ['intuition', 'misconception']) if (st[k]) slots.push([A.title, st.id, k]); };
const L = legacyScrolls(); for (const k in L) for (const s of L[k]) visit(s.analysis);
for (const t of ['The water cycle', 'Galton board', 'Supply and demand', 'Osmosis']) visit({ title: t, chain: [1, 2, 3].map(i => ({ id: 'S' + i, title: '' })) });
DOMAIN_BOOK.parts.forEach(p => visit(p.analysis));
for (const [t, sid, k] of slots) { n++; if (!seedMotion(t, sid, k)) bad(`no animation for ${t} ${sid} ${k}`); }
// every spec is well formed and draws
let specs = 0, marks = 0;
for (const [t, steps] of Object.entries(MOTION)) for (const [sid, s] of Object.entries(steps)) for (const k of ['intuition', 'misconception']) { const sp = s[k]; if (!sp) continue; specs++;
  const iss = motionIssues(sp, { max: 1500 });   /* hand-made seeds may draw a crowd (1000 people); written ones stay ≤ 80 */ if (iss.length) bad(`${t} ${sid} ${k}: ${iss.join('; ')}`);
  const B = sp.beats || []; if (!B.length) bad(`${t} ${sid} ${k}: no captions`); B.forEach((b, i) => { if (!(b[0] >= 0 && b[0] <= 1) || (i && b[0] < B[i - 1][0]) || !String(b[1] || '').trim()) bad(`${t} ${sid} ${k}: beat ${i} out of order or empty`); });
  if (k === 'misconception' && (sp.wrong || sp.right) && !(sp.wrong && sp.right)) bad(`${t} ${sid}: a contrast needs both worlds`);
  for (const panel of sp.wrong ? [sp.wrong, sp.right] : [sp]) for (const u of [0, .33, .66, 1]) { const r = MAKERS_FOR_TEST(panel.items, u, sp.dur || 12); if (r.error) bad(`${t} ${sid} ${k} at u=${u}: ${r.error}`); marks += r.marks; } }
// keyframe interpolation
if (interp([[0, 0], [1, 10]], .5) !== 5 || interp([[.2, 1], [.8, 3]], 0) !== 1 || interp([[.2, 1], [.8, 3]], 1) !== 3) bad('interp');
console.log(`${fail ? 'FAIL' : 'PASS'}  ${n} boxes covered, ${specs} specs drawn at 4 times (${marks} marks)`); process.exit(fail ? 1 : 0);
