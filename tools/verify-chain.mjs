#!/usr/bin/env node
// Scriptorium Memorium — check a chain JSON offline, before pasting it into the app (no dependencies, node ≥ 18).
//
// RUN
//   node tools/verify-chain.mjs chain.json [sections.json] [--json] [--loose]
//     chain.json     one part's chain (schema/chain.schema.json), or a whole room file (scriptorium-room/1: every
//                    part with an "analysis" is checked against that part's "subsections" and "figureIndex")
//     sections.json  optional: the part's subsections, as the app caches them (Import / export, or partSections()):
//                    [{id,title,startPage,endPage,text,inventory}], or {"sections":[…],"figures":[…]}.
//                    With text and inventory, coverage, resolution and numbers are checked against the PDF's text;
//                    without it, the subsections listed in the chain's own "coverage" are used.
//     --json         print the full report as JSON instead of text
//     --loose        skip the strict profile (schema/chain.strict.schema.json); check the base schema only
//
// WHAT IT CHECKS
//   schema     the strict profile: part question and coverage; on every step id S<n>, section id, answers, opens;
//              id patterns (subsections, steps, figures); every demo has a purpose; every 3D demo has 3–6 lessons
//              with question and opens; every "extra" has a source with a title, DOI or URL
//   verify     verifyChain() from js/ai/prompts.js, the same check the app runs on every answer: every subsection
//              covered, none coarser than the source, every PDF figure cited or skipped, the question thread
//              (step k+1 answers = step k opens), outside additions sourced, numbers found in the PDF text
//   demos      checkDemos(): lesson threads, built-in lessons' "until" against the model's real event texts,
//              repeated dioramas naming their actors in "bodies"
//   links      "from" names earlier steps that exist; step ids are unique and in order; coverage lists real steps
//   cues       checkCues(): the explainer cues of every lesson (chain, isolate, peel, zoom, track): names must be the
//              model's actors or the scene's bodies, enums and track points valid (faults); a chain link the lesson's
//              text never names, a zoom without the diorama's "scale", and directed-motion wording ("travels to",
//              "seeks", "finds") in a POV of a micro or diffusive scene are warnings
// EXIT CODE: 0 = passes, 1 = at least one fault (numbers not found in the text are warnings only), 2 = usage error.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(pathToFileURL(join(ROOT, 'js/ai/prompts.js')).href);
const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.error('usage: node tools/verify-chain.mjs chain.json [sections.json] [--json] [--loose]'); process.exit(2); }
const readJSON = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: ${e.message}`); process.exit(2); } };

// ---------------------------------------------------------------- a small draft 2020-12 validator (the subset the schemas use)
const REG = new Map();
for (const f of ['chain.schema.json', 'chain.strict.schema.json', 'room.schema.json', 'scene.schema.json']) { const s = JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8')); REG.set(s.$id, s); }
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const isType = (v, t) => t === 'number' ? typeof v === 'number' && isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t;
function resolve(ref, base) {
  const u = new URL(ref, base), doc = REG.get(u.href.split('#')[0]); if (!doc) throw new Error('unresolvable $ref ' + ref + ' from ' + base);
  let node = doc; const frag = decodeURIComponent(u.hash.slice(1)); if (frag) frag.split('/').filter(Boolean).forEach(k => { node = node[k.replace(/~1/g, '/').replace(/~0/g, '~')]; });
  if (node === undefined) throw new Error('missing $ref target ' + ref); return { node, base: doc.$id };
}
function validate(v, S, base, path, errs) {
  if (S === true || S == null) return errs; if (S === false) { errs.push(`${path}: not allowed`); return errs; }
  if (S.$id) base = new URL(S.$id, base).href;
  if (S.$ref) { const r = resolve(S.$ref, base); validate(v, r.node, r.base, path, errs); }
  if (S.allOf) S.allOf.forEach(s => validate(v, s, base, path, errs));
  if (S.anyOf && !S.anyOf.some(s => !validate(v, s, base, path, []).length)) errs.push(`${path}: matches none of the allowed forms` + (S.anyOf.every(s => s.required) ? ` (needs one of: ${S.anyOf.map(s => s.required.join('+')).join(', ')})` : ''));
  if (S.oneOf && S.oneOf.filter(s => !validate(v, s, base, path, []).length).length !== 1) errs.push(`${path}: must match exactly one form`);
  if (S.not && !validate(v, S.not, base, path, []).length) errs.push(`${path}: matches a form that is not allowed`);
  if (S.if) { const ok = !validate(v, S.if, base, path, []).length; if (ok && S.then) validate(v, S.then, base, path, errs); if (!ok && S.else) validate(v, S.else, base, path, errs); }
  if (S.type) { const T = [].concat(S.type); if (!T.some(t => isType(v, t))) { errs.push(`${path}: is ${typeOf(v)}, expected ${T.join(' or ')}`); return errs; } }
  if (S.enum && !S.enum.some(e => e === v)) errs.push(`${path}: "${v}" is not one of ${S.enum.filter(Boolean).join(', ')}`);
  if ('const' in S && S.const !== v) errs.push(`${path}: must be "${S.const}"`);
  if (typeof v === 'string') {
    if (S.minLength != null && [...v].length < S.minLength) errs.push(`${path}: ${v ? 'too short' : 'empty'}`);
    if (S.pattern && !new RegExp(S.pattern, 'u').test(v)) errs.push(`${path}: "${v}" does not follow the id rule ${S.description ? '(' + S.description + ')' : S.pattern}`);
  }
  if (typeof v === 'number') { if (S.minimum != null && v < S.minimum) errs.push(`${path}: below ${S.minimum}`); if (S.exclusiveMinimum != null && v <= S.exclusiveMinimum) errs.push(`${path}: must be > ${S.exclusiveMinimum}`); }
  if (Array.isArray(v)) {
    if (S.minItems != null && v.length < S.minItems) errs.push(`${path}: ${v.length} item${v.length === 1 ? '' : 's'}, at least ${S.minItems} needed`);
    if (S.maxItems != null && v.length > S.maxItems) errs.push(`${path}: ${v.length} items, at most ${S.maxItems} allowed`);
    (S.prefixItems || []).forEach((s, i) => { if (i < v.length) validate(v[i], s, base, `${path}[${i}]`, errs); });
    if (S.items) v.forEach((x, i) => { if (i >= (S.prefixItems || []).length) validate(x, S.items, base, `${path}[${i}]`, errs); });
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    (S.required || []).forEach(k => { if (!(k in v) || v[k] === '' || v[k] == null) errs.push(`${path}: "${k}" is required`); });
    for (const k in S.properties || {}) if (k in v && v[k] != null) validate(v[k], S.properties[k], base, `${path}.${k}`, errs);
  }
  return errs;
}
const schemaErrors = (A, strict) => { const id = 'https://scriptorium.invalid/schema/' + (strict ? 'chain.strict.schema.json' : 'chain.schema.json'); return [...new Set(validate(A, REG.get(id), id, '$', []))]; };

// ---------------------------------------------------------------- one chain
function check(A, sections, figures, label) {
  const strict = !flags.has('--loose');
  const out = { part: label, steps: (A.chain || []).length, faults: [], warnings: [] };
  const F = (...a) => out.faults.push(a.join(' ')), W = (...a) => out.warnings.push(a.join(' '));
  schemaErrors(A, strict).forEach(e => F('schema', e));
  const chain = Array.isArray(A.chain) ? A.chain : [];
  // links: unique ids in order, "from" to earlier steps, coverage to real steps
  const pos = new Map(); chain.forEach((st, k) => { if (pos.has(st.id)) F('links', `step id ${st.id} is used twice`); else pos.set(st.id, k); if (st.id !== 'S' + (k + 1)) W('links', `step ${k + 1} has id ${st.id} (expected S${k + 1})`); });
  chain.forEach((st, k) => (st.from || []).forEach(f => { if (!pos.has(String(f))) F('links', `${st.id}.from names ${f}, which is not a step`); else if (pos.get(String(f)) >= k) F('links', `${st.id}.from names ${f}, which comes later`); }));
  (A.coverage || []).forEach(c => (c.steps || []).forEach(id => { const st = chain.find(x => x.id === String(id)); if (!st) F('links', `coverage of ${c.subsection} lists ${id}, which is not a step`); else if (st.section && String(st.section) !== String(c.subsection)) F('links', `coverage puts ${id} under ${c.subsection}, but its "section" is ${st.section}`); }));
  // the app's own check (on a copy: verifyChain rebuilds coverage and normalises figure ids)
  const B = JSON.parse(JSON.stringify(A));
  const secs = sections && sections.length ? sections : (A.coverage || []).map(c => ({ id: String(c.subsection), title: '', text: '' }));
  const rep = P.verifyChain(B, secs, figures || []); out.report = rep;
  rep.missing.forEach(m => F('verify', `subsection ${m.id} ${m.title ? '"' + m.title + '" ' : ''}has no step`));
  rep.thin.forEach(t => F('verify', `subsection ${t.id} is coarser than the source: ${t.steps} step(s) for about ${t.expect}`));
  rep.unknownSections.forEach(id => F('verify', `${id}.section is not a subsection of this part`));
  rep.figuresUncited.forEach(f => F('verify', `PDF figure ${f.id} (${f.label}, p. ${f.page}) is not cited by any step nor listed in figuresSkipped`));
  if (figures && figures.length) rep.unknownFigures.forEach(u => F('verify', `${u.step} cites ${u.id}, which is not a figure of this part`));
  rep.threadMissing.forEach(id => F('verify', `${id} lacks "answers" or "opens"`));
  rep.threadBreaks.forEach(id => { const k = chain.findIndex(s => s.id === id); F('verify', `question thread breaks before ${id}: ${chain[k - 1] ? chain[k - 1].id + ' opens "' + chain[k - 1].opens + '"' : ''} but ${id} answers "${chain[k] && chain[k].answers}"`); });
  if (A.question && chain[0] && chain[0].answers && P.similar(A.question, chain[0].answers) < .6) W('verify', `S1 answers "${chain[0].answers}", not the part's question "${A.question}"`);
  rep.extrasUnsourced.forEach(id => F('verify', `${id} has an outside addition ("extra") without a source`));
  rep.numbers.unmatched.forEach(u => W('numbers', `${u.step}: ${u.values.join(', ')} not found in the PDF text (check against the page)`));
  (rep.demoIssues || []).forEach(d => F('demos', `${d.step} demo ${d.demo + 1} (${d.type}): ${d.issue}`));
  // demo data provenance: outside data needs a source
  (P.checkCues ? P.checkCues(A) : []).forEach(c => (c.level === 'fault' ? F : W)('cues', `${c.step} demo ${c.demo + 1} (${c.type}) lesson ${c.lesson}: ${c.issue}`));
  chain.forEach(st => (st.demos || []).forEach((d, i) => { const ex = Array.isArray(d.extra) ? d.extra : []; if (ex.some(e => !e || !e.source || !(e.source.title || e.source.doi || e.source.url))) F('demos', `${st.id} demo ${i + 1}: outside data ("extra") without a source`); }));
  out.pass = !out.faults.length;
  return out;
}

// ---------------------------------------------------------------- input
const doc = readJSON(files[0]);
let side = files[1] ? readJSON(files[1]) : null, sideSecs = null, sideFigs = null;
if (side) { if (Array.isArray(side)) sideSecs = side; else { sideSecs = side.sections || null; sideFigs = side.figures || side.figureIndex || null; } }
const jobs = [];
if (doc && doc.format === 'scriptorium-room/1') {
  ((doc.room && doc.room.parts) || []).forEach((p, k) => { if (p.analysis) jobs.push({ A: p.analysis, sections: (p.subsections || []).map(s => ({ ...s, text: s.text || '' })), figures: p.figureIndex || [], label: `part ${k + 1} "${p.title}"` }); });
  if (!jobs.length) { console.error('This room file has no analysed parts.'); process.exit(2); }
} else if (doc && Array.isArray(doc.chain)) {
  const secs = sideSecs || (doc.coverageReport && doc.coverageReport.sections) || null;
  jobs.push({ A: doc, sections: secs, figures: sideFigs || [], label: doc.title || files[0] });
} else { console.error(`${files[0]}: no "chain" array (and not a scriptorium-room/1 file).`); process.exit(2); }

const results = jobs.map(j => check(j.A, j.sections, j.figures, j.label));
if (flags.has('--json')) console.log(JSON.stringify(results.map(r => ({ part: r.part, pass: r.pass, faults: r.faults, warnings: r.warnings, report: r.report })), null, 1));
else results.forEach(r => {
  const R = r.report;
  console.log(`\n${r.pass ? 'PASS' : 'FAIL'}  ${r.part}  (${flags.has('--loose') ? 'base schema' : 'strict profile'})`);
  console.log(`  ${r.steps} steps · ${R.covered}/${R.subsections} subsections covered · ${R.thin.length} coarse · ${R.figuresCited}/${R.figures} PDF figures cited · thread ${R.threadBreaks.length + R.threadMissing.length ? (R.threadBreaks.length + R.threadMissing.length) + ' gap(s)' : 'intact'} · ${(R.demoIssues || []).length} demo issue(s) · ${R.numbers.checked} numbers checked`);
  r.faults.forEach(f => console.log('  ✗ ' + f));
  r.warnings.forEach(w => console.log('  ! ' + w));
  if (!r.faults.length && !r.warnings.length) console.log('  ✓ no faults');
});
process.exit(results.every(r => r.pass) ? 0 : 1);
