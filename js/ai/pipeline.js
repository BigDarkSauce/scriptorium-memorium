// The analysis pipeline without UI (docs/PROTOCOL.md, "Recipe for any AI"), shared by the reader's "Analyse" button and
// the Add-PDF dialog's job runner:
//   material(ctx, part)        subsection text (cached) and the PDF's figures (cached; sheet panels cut as panel figures)
//   analysePart(ctx, part, o)  1 chain → 2 coverage follow-ups → 3 quality gate + targeted repairs → 4 figures for every
//                              text-heavy paragraph and teaching box → 5 dioramas per subsection (authored, retried
//                              simpler, else a fitting built-in or a diagram: never an empty slot) → done.
//                              Each finished stage is saved on the part (part.job), so a cancelled or interrupted run
//                              resumes where it stopped and nothing stored is asked again.
//   runJob(app, job, o)        every part of a book in order (the Add-PDF dialog), with progress, cancel and resume.
// ctx = { app, book, data, save(part), refresh(part) }. Without the viewer's Claude (no `sample`), the chain comes
// through the copy/paste relay and the later stages run without AI: deterministic fixes, figures built from the steps,
// and fallback dioramas (each keeps its request, so "Build this diorama with AI" can still author it later).
import { askJSON, aiAvailable, imageLimit, writer } from './claude.js';
import { startJob, currentJob } from './activity.js';
import { chapterPrompt, verifyChain, gapsOf, followUpPrompt, mergeFollowUp, qualityGate, repairPrompt, mergeRepair, figuresPrompt, mergeFigures, planDioramas, authorPrompt, rewritable, BUILTIN_MODELS, planPrompt, critiquePrompt, modelAuditPrompt, checkPlan, checkSceneContract, domainPrompt, mergeDomains, placePrimitive, grammarIssues } from './prompts.js';
import { classifyStep, autoPrimitive } from '../dio/domains.js';
import { evidenceTools } from './evidence.js';
import { partKey, cached } from '../store.js';
import { validateFigure, figureSlots, setSlotFigure, autoFigure, isPrimitive } from '../room/figspec.js';
import { normalizeChain } from '../room/reader.js';
import { GALTON, MARKET } from '../seeds-scenes.js';
import { compileAtlas, sourceFigureEvidence, selectSourceFigureAttachments, sourceFigureAttachmentManifest } from './atlas.js';

export const STAGES = ['chain', 'coverage', 'gate', 'figures', 'dioramas', 'atlas', 'done'];
export const STAGE_NAMES = { chain: 'writing the steps', coverage: 'filling gaps against the PDF', gate: 'checking and repairing', figures: 'drawing the figures', dioramas: 'building the dioramas', atlas: 'mapping concepts and diorama sequences' };
const cancelled = () => ({ code: 'cancelled' });
const check = signal => { if (signal && signal.aborted) throw cancelled(); };
const C = o => JSON.parse(JSON.stringify(o));
const TOOLNAME = { search_literature: 'OpenAlex', search_evidence: 'Consensus', search_biomedical: 'PubMed', search_any_discipline: 'SciSpace', search_computing: 'Hugging Face', search_clinical_trials: 'ClinicalTrials.gov' };
const bookName = ctx => ctx.book.pdfTitle || ctx.book.title;
function dataUrlBlob(u) { const [h, b] = String(u).split(','); const bin = atob(b || ''); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' }); }

// ---------------------------------------------------------------- material (no AI)
export async function material(ctx, part, { onStatus } = {}) {
  const { app, book } = ctx, P = part, src = P.subOf ? ((ctx.data.parts || []).find(x => x.id === P.subOf) || P) : P;
  if (book.sourceType === 'pptx') {
    onStatus && onStatus('Reading slide text, notes, chart data and SmartArt structure…');
    // The room retains extracted text for portability. When the original package is present, inspect its embedded
    // images too; shared JSON imports without the package still retain their textual source trail.
    const sec = await cached(partKey('sections', book.id, src.id), () => app.ingest.presentationSections(null, src));
    let figures = [];
    const presentation = await app.store.get('pptx:' + book.id).catch(() => null);
    if (presentation && app.ingest.extractPresentationFigures) {
      try {
        onStatus && onStatus('Inspecting embedded PowerPoint images…');
        figures = await cached(partKey('figs', book.id, src.id), () => app.ingest.extractPresentationFigures(
          presentation, src.startPage || 1, src.endPage || src.startPage || 1,
          { onProgress: k => onStatus && onStatus('Inspecting embedded PowerPoint images… ' + Math.round(k * 100) + '%') }
        ));
      } catch (e) {
        onStatus && onStatus('Some embedded images could not be decoded; continuing with slide text, chart data and SmartArt structure.');
        figures = [];
      }
    }
    if (presentation) src.figureIndex = app.ingest.figureMeta(figures);
    else if (!Array.isArray(src.figureIndex)) src.figureIndex = [];
    // A room JSON import can carry the slide/media index but not the original ZIP binary. Preserve that audit
    // metadata rather than replacing it with an empty list when re-analysis is text-only.
    return { sections: sec.sections, figures, blob: null, src, text: P.text || sec.text };
  }
  if (!book.hasPdf) return { sections: null, figures: [], text: P.text || '' };
  const blob = app.ingest.keyPDF ? app.ingest.keyPDF(await app.store.get('pdf:' + book.id), book.id) : await app.store.get('pdf:' + book.id); if (!blob) return { sections: null, figures: [], text: P.text || '' };
  if (book.pdfTitle == null && app.ingest.pdfTitle) { try { book.pdfTitle = await app.ingest.pdfTitle(blob) || ''; if (app.saveLib) app.saveLib(); } catch (e) { } }
  onStatus && onStatus('Reading the subsections…');
  const sec = P.subOf ? { sections: null } : await cached(partKey('sections', book.id, src.id), () => app.ingest.partSections(blob, src));
  // panels of a sheet that are drawings (a chart, a curve) are cut as figures; text cards never are
  const panels = (sec.sections || []).filter(s => s.box).map(s => ({ id: s.id, title: s.title, page: s.boxPage || s.startPage, box: s.box }));
  let figures = [];
  try { onStatus && onStatus('Cutting the figures out of the pages…'); figures = await cached(partKey('figs', book.id, src.id), () => app.ingest.extractFigures(blob, src.startPage || 1, src.endPage || src.startPage || 1, { panels, onProgress: k => onStatus && onStatus('Cutting the figures out of the pages… ' + Math.round(k * 100) + '%') })); } catch (e) { figures = []; }
  if (!src.figureIndex || src.figureIndex.length !== figures.length) { src.figureIndex = app.ingest.figureMeta(figures); }
  let text = '';
  if (!sec.sections) { try { text = await app.ingest.partText(blob, P.startPage || src.startPage || 1, P.endPage || src.endPage || 1); } catch (e) { } }
  return { sections: sec.sections, figures, blob, src, text: P.text || text };
}

// Keep each actual provider search once, even though the same record arrives through both the live callback
// (for failed/retried outputs) and the accepted JSON response (including cached responses).
function recordResearch(audit, x, task) {
  if (!Array.isArray(audit) || !x) return;
  const key = x.callId || [x.provider || '', x.model || '', +x.searched || 0, (x.citations || []).map(c => c && c.url || '').sort().join('|')].join('::');
  if (audit.some(y => (y.callId || [y.provider || '', y.model || '', +y.searched || 0, (y.citations || []).map(c => c && c.url || '').sort().join('|')].join('::')) === key)) return;
  audit.push({ ...x, task: task || x.task || 'AI authoring call' });
}
async function ask(prompt, o = {}, title) {
  const answer = await askJSON(prompt, {
    tools: o.tools === false ? [] : evidenceTools(), signal: o.signal, images: o.images,
    onTool: (n, i) => o.onStatus && o.onStatus(`Looking it up in ${TOOLNAME[n] || n}: “${String((i && (i.query || i.condition)) || '').slice(0, 60)}”…`),
    onText: t => o.onStatus && o.onStatus((o.writing || 'Writing') + '… ' + t.length.toLocaleString() + ' characters'),
    onStatus: o.onStatus,
    onResearch: x => recordResearch(o.researchAudit, x, title || o.writing || 'AI authoring call'),
    role: o.role || 'worker', validate: o.validate, acceptTruncated: !!o.acceptTruncated,
    fresh: !!(o.fresh || o.force), manualTitle: title
  });
  // Cache hits retain the original search metadata but do not trigger onResearch again.
  if (answer && answer._webResearch) recordResearch(o.researchAudit, answer._webResearch, title || o.writing || 'AI authoring call');
  return answer;
}
// stage 1: one structured call for the whole part
export async function writeChain(ctx, P, M, o) {
  let images = [], attached = [], pageImgs = 0;
  const thinText = M.sections && M.sections.reduce((a, s) => a + s.inventory.chars, 0) < 400;
  if (thinText && imageLimit() && M.blob) { images = await ctx.app.ingest.pageImages(M.blob, P.startPage || 1, P.endPage || 1, imageLimit()); pageImgs = images.length; }
  else if (imageLimit() && M.figures.length) { const pick = M.figures.filter(f => !/^Unlabelled/.test(f.label)).concat(M.figures.filter(f => /^Unlabelled/.test(f.label))).slice(0, Math.min(6, imageLimit())); images = pick.map(f => dataUrlBlob(f.dataUrl)); attached = pick.map(f => f.id); }
  const meta = ctx.app.ingest.figureMeta(M.figures), unit = ctx.book.sourceType === 'pptx' ? 'slides' : 'pages', chapter = P.title + (P.startPage ? ` (${unit} ${P.startPage}-${P.endPage})` : '');
  const prompt = chapterPrompt({ book: bookName(ctx), chapter, text: M.text, depth: o.level || 'complete', deep: !!o.deep, n: o.n, images: attached.length, pageImages: pageImgs, sections: M.sections, figures: meta, attached, sourceType: ctx.book.sourceType || 'pdf' });
  o.onStatus && o.onStatus(writer('director') + ' is reading and planning. Long parts can take a minute or two.');
  // a chain cut off by the output limit is kept when at least two complete steps came back: the coverage check and its
  // follow-ups (stage 2) write what is missing, which costs less than asking for the whole chain again
  const A = await ask(prompt, { ...o, images, writing: 'Writing the chain', role: 'director', acceptTruncated: true, validate: v => !(v && Array.isArray(v.chain) && v.chain.length) ? 'the answer has no "chain" array of steps' : v._truncated && v.chain.length < 2 ? 'the answer was cut off before two complete steps' : null }, 'Analyse "' + P.title + '" in any AI');
  if (!A || !Array.isArray(A.chain)) throw { code: 'invalid_json' };
  if (A._truncated && A.chain.length > 1) A.chain.pop();
  const N = normalizeChain(A); delete N._truncated; if (N._webResearch) { N.researchEvidence = N._webResearch; delete N._webResearch; } N.level = o.level || 'complete'; if (o.level === 'exact') N.levelN = o.n; if (o.deep) N.deep = true;
  return N;
}
// stage 2: coverage against the subsections; targeted follow-ups write what is missing (≤ 100k characters each)
export async function coverageFill(ctx, P, M, o = {}) {
  const A = P.analysis; if (!M.sections) { A.coverageReport = null; return; }
  const meta = ctx.app.ingest.figureMeta(M.figures), auto = o.auto !== false, rounds = o.rounds || 2;
  const secMeta = M.sections.map(x => ({ id: x.id, title: x.title, level: x.level, startPage: x.startPage, endPage: x.endPage }));
  let rep = verifyChain(A, M.sections, meta); A.coverageReport = { ...rep, sections: secMeta, followUps: (A.coverageReport && A.coverageReport.followUps) || 0 };
  for (let r = 0; auto && r < rounds; r++) {
    const gaps = gapsOf(rep, M.sections, meta); if (!gaps.length) break;
    const batches = []; let cur = [], size = 0;
    gaps.forEach(g => { const s = M.sections.find(x => x.id === g.id), k = s ? s.text.length : 0; if (cur.length && size + k > 100000) { batches.push(cur); cur = []; size = 0; } cur.push(g); size += k; }); if (cur.length) batches.push(cur);
    for (const b of batches) {
      check(o.signal); o.onStatus && o.onStatus(`Filling ${b.length} gap${b.length > 1 ? 's' : ''}: ${b.map(g => g.id).join(', ')}…`);
      const add = await ask(followUpPrompt({ book: bookName(ctx), chapter: P.title, A, gaps: b, sections: M.sections, figures: meta }), { ...o, writing: 'Writing the missing steps' }, 'Write the missing steps in any AI');
      if (add && (Array.isArray(add.steps) || Array.isArray(add.chain))) { mergeFollowUp(A, { ...add, steps: normalizeChain({ chain: add.steps || add.chain }).chain }, M.sections); A.coverageReport.followUps = (A.coverageReport.followUps || 0) + 1; }
    }
    rep = verifyChain(A, M.sections, meta); A.coverageReport = { ...rep, sections: secMeta, followUps: A.coverageReport.followUps };
  }
}
// stage 3: the quality gate; copied, repeated, unexplained and code-blind steps are rewritten (≤ 2 rounds, only those steps)
export async function gateAndRepair(ctx, P, M, o = {}) {
  const A = P.analysis, sections = M.sections || [], meta = (M.figures || []).map(f => ({ id: f.id, label: f.label, page: f.page, bbox: f.bbox }));
  let G = qualityGate(A, sections, meta); const log = [{ round: 0, issues: G.issues.length, kinds: kinds(G) }]; let repaired = 0;
  for (let r = 1; o.auto !== false && r <= (o.rounds || 2); r++) {
    const bad = G.issues.filter(rewritable); if (!bad.length) break;
    bad.forEach(i => { if (i.kind === 'numbers' || i.kind === 'unfinished') { const st = A.chain.find(s => s.id === i.step); if (st) st[i.kind === 'numbers' ? 'numFix' : 'endFix'] = true; } });   // one numbers rewrite per step, ever
    check(o.signal); o.onStatus && o.onStatus(`Quality check: rewriting ${[...new Set(bad.map(i => i.step))].join(', ')} (${[...new Set(bad.map(i => i.kind))].join(', ')})…`);
    const ans = await ask(repairPrompt({ book: bookName(ctx), chapter: P.title, A, issues: G.issues, sections }), { ...o, writing: 'Rewriting the steps' }, 'Repair these steps in any AI');
    const norm = ans && (ans.steps || ans.chain) ? normalizeChain({ chain: ans.steps || ans.chain }).chain : [];
    repaired += mergeRepair(A, { steps: norm });
    G = qualityGate(A, sections, meta); log.push({ round: r, issues: G.issues.length, kinds: kinds(G) });
  }
  A.qualityReport = { checked: new Date().toISOString(), rounds: log, repaired, fixed: G.fixed, remaining: G.issues.filter(i => i.kind !== 'noFigure' && i.kind !== 'badFigure' && i.kind !== 'dioramas'), stats: G.stats };
  return G;
}
const kinds = G => G.issues.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {});
// stage 4: a figure for every text-heavy paragraph and every Picture it / Common mistake / Check yourself box
export function missingFigureSlots(A) {
  const out = []; (A.chain || []).forEach(st => figureSlots(st).forEach(sl => { const v = sl.fig ? validateFigure(sl.fig) : null; if (!v || !v.ok) out.push({ step: st.id, slot: sl.slot, text: sl.text, small: !!sl.small, ...(v ? { error: v.errors.join('; ') } : {}) }); }));
  return out;
}
export async function completeFigures(ctx, P, o = {}) {
  const A = P.analysis; let need = missingFigureSlots(A), asked = 0;
  if (need.length && o.auto !== false) {
    for (let i = 0; i < need.length; i += 24) {
      check(o.signal); o.onStatus && o.onStatus(`Drawing ${need.length} missing figure${need.length > 1 ? 's' : ''}…`);
      const ans = await ask(figuresPrompt({ book: bookName(ctx), chapter: P.title, A, slots: need.slice(i, i + 24) }), { ...o, tools: false, writing: 'Designing the figures' }, 'Design the figures in any AI');
      asked += mergeFigures(A, ans, setSlotFigure);
    }
    need = missingFigureSlots(A);
  }
  // whatever is still bare gets a figure built from the step itself (never an empty box)
  need.forEach(x => { const st = A.chain.find(s => s.id === x.step); if (st) setSlotFigure(st, x.slot, autoFigure(st, x.slot.replace(/\.\d+$/, ''), x.text)); });
  A.figureReport = { asked, auto: need.length, slots: (A.chain || []).reduce((a, st) => a + figureSlots(st).length, 0) };
  await compileDomains(ctx, P, o);
}
// stage 4b, the explanatory compiler (docs/research/explanatory-compiler.md): every step is classified (domain, structure
// → primitive, medium); steps whose grammar is a primitive and that carry none get one: from the AI (prompts/12, ≤ 12
// steps a call), else built from the step's own table (autoPrimitive). The routing is kept in A.domainReport.
export async function compileDomains(ctx, P, o = {}) {
  const A = P.analysis; let asked = 0, auto = 0;
  const todo = () => grammarIssues(A).filter(i => i.kind === 'grammar' && /no domain primitive/.test(i.detail)).map(i => A.chain.find(st => st.id === i.step)).filter(Boolean);
  let need = todo();
  if (need.length && o.auto !== false && aiAvailable()) for (let i = 0; i < need.length; i += 12) {
    check(o.signal); o.onStatus && o.onStatus(`Choosing the visual grammar of ${need.length} step${need.length > 1 ? 's' : ''}…`);
    try { const ans = await ask(domainPrompt({ book: bookName(ctx), chapter: P.title, A, steps: need.slice(i, i + 12).map(st => ({ st, route: classifyStep(st) })) }), { ...o, tools: false, writing: 'Compiling the explanations' }, 'Compile the visual grammar in any AI'); asked += mergeDomains(A, ans); } catch (e) { if (e && e.code === 'cancelled') throw e; }
  }
  need = todo(); need.forEach(st => { const f = autoPrimitive(st, classifyStep(st)); if (f && validateFigure(f).ok) { placePrimitive(st, validateFigure(f).fig); auto++; } });
  A.domainReport = { asked, auto, routes: (A.chain || []).map(st => { const r = classifyStep(st); return { step: st.id, domain: r.domain, structure: r.structure, primitive: r.primitive, medium: r.medium, source: r.source, confidence: r.confidence }; }) };
  return A.domainReport;
}
// stage 5: dioramas per subsection — planned, inserted, authored (retry simpler), else a fitting built-in or a diagram
export const needsAuthoring = d => d && d.type === 'scene' && !Array.isArray(d.bodies);
const isThreeD = d => d && (d.type === 'scene' || Array.isArray(d.bodies) || !!BUILTIN_MODELS[String(d.type || '').toLowerCase()]);
const DYN = /\b(mov\w*|motion|flow\w*|rate|speed|sampl\w*|simulat\w*|random|distribut\w*|process\w*|cycle|mechanism|predator|prey|search\w*|handling|loop|iterat\w*|over time|grow\w*|curve|plateau|level\w* off)\b/gi;
export function planAndInsertDioramas(A, sections) {
  const plan = planDioramas(A, sections || []), added = [];
  plan.forEach(p => {
    let k = p.need - p.have; if (k <= 0) return;
    const steps = (A.chain || []).filter(st => st.section === p.subsection); if (!steps.length) return;
    // the explanatory compiler first: a step routed to a 3D diorama scores high; one drawn by its own primitive low
    const route = st => classifyStep(st), score = st => ((st.title + ' ' + st.statement + ' ' + (st.explain || []).map(e => e && e.text).join(' ')).match(DYN) || []).length - (st.demos || []).filter(isThreeD).length * 3 + (route(st).medium === 'diorama' ? 6 : (st.explain || []).some(e => e && e.figure && isPrimitive(e.figure.kind)) ? -12 : 0);
    while (k-- > 0) {
      const st = steps.slice().sort((a, b) => score(b) - score(a))[0]; st.demos = st.demos || [];
      if (score(st) < -6) break;   // every step of this subsection is explained by its own primitive: no 3D decoration
      const d = { type: 'scene', title: st.title.slice(0, 70), purpose: st.answers || `How does “${st.title}” work?`, technique: 'card', sourceStepIds: [String(st.id)], request: `Embody "${st.title}" as a living miniature: ${st.statement} ${(st.explain || []).map(e => e && e.text).join(' ').slice(0, 600)} Actors: the bodies this step is about (${(st.bodies || []).join(', ') || 'choose 2–5'}); variables the learner can change with the source's numbers; events at the meaningful moments; 3–6 lessons, the first answering "${st.answers || st.title}", the last opening "${st.opens || 'the next question'}".`, auto: true, planned: p.why };
      st.demos.push(d); added.push({ step: st.id, subsection: p.subsection });
    }
  });
  return { plan, added };
}
export function validScene(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.bodies) || s.bodies.length < 2) return 'no bodies';
  if (s.bodies.some(b => !b || !b.shape || !b.shape.kind)) return 'a body without a shape';
  if (s.code) { try { new Function('api', '"use strict";\n' + s.code); } catch (e) { return 'code does not parse: ' + e.message; } }
  if (!s.bodies.some(b => b.role === 'actor') && !s.code) return 'no actor';
  return '';
}
// The didactic plan (docs/PEDAGOGY.md): a short storyboard written BEFORE the scene, checked by checkPlan; one retry with
// the faults named. Small and tool-free (about 1.5k tokens out); null when there is no AI or it cannot produce a valid plan.
export async function planDemo(ctx, st, d, context, o = {}) {
  const sourceStepIds = (d.sourceStepIds || [st.id]).map(String);
  let issues = '';
  if (d.plan && d.plan.version === 'scriptorium-model-plan/1') {
    const cachedFaults = checkPlan(d.plan, null, null, sourceStepIds).filter(x => x.level === 'fault');
    if (!cachedFaults.length) return d.plan;
    issues = 'Saved plan needs correction: ' + cachedFaults.slice(0, 6).map(x => x.issue).join('; ');
  }
  for (let k = 0; k < 2; k++) {
    check(o.signal); o.onStatus && o.onStatus(`Planning the explanation: diorama “${d.title || st.title}”${k ? ' (second try)' : ''}…`);
    try {
      const p = await ask(planPrompt({ ...d, issues, sourceStepIds }, context), { ...o, tools: false, writing: 'Planning the explanation', role: 'director' }, 'Plan this diorama in any AI');
      const plan = p && (p.plan || p);
      const faults = checkPlan(plan, null, null, sourceStepIds).filter(x => x.level === 'fault');
      if (!plan || plan.version !== 'scriptorium-model-plan/1') faults.push({ level: 'fault', issue: 'plan must use version scriptorium-model-plan/1 and include its source-mapped modelContract' });
      if (!faults.length) return plan;
      issues = faults.slice(0, 6).map(x => x.issue).join('; ');
    } catch (e) { if (e && e.code === 'cancelled') throw e; return null; }
  }
  return null;
}
// The self-critique: could a newcomer explain the concept after these lessons (weighed above "is it attractive")? A short,
// tool-free call that may only patch lesson texts; the deterministic plan check runs first and is stored with it.
export async function critiqueDemo(s, plan, o = {}) {
  const sourceStepIds = (o.sourceStepIds || s.sourceStepIds || []).map(String);
  const names = (s.bodies || []).flatMap(b => [b.id, b.name, b.label].filter(Boolean)), local = checkPlan(plan, s.lessons || [], names, sourceStepIds);
  s.critique = { local: local.length, faults: local.filter(x => x.level === 'fault').map(x => x.issue).slice(0, 8) };
  try {
    check(o.signal); o.onStatus && o.onStatus('Checking the explanation: could a newcomer explain it after watching?');
    const ans = await ask(critiquePrompt(plan, s), { ...o, tools: false, writing: 'Checking the explanation', role: 'director' }, 'Check this diorama in any AI');
    if (ans && typeof ans === 'object') {
      Object.assign(s.critique, { canExplain: +ans.canExplain || 0, attractive: +ans.attractive || 0, verdict: ans.verdict === 'revise' ? 'revise' : 'pass', issues: (ans.issues || []).slice(0, 6).map(String) });
      let n = 0; if (ans.verdict === 'revise' && Array.isArray(ans.patch)) ans.patch.forEach(P => { const l = P && (s.lessons || [])[+P.i]; if (!l) return; ['text', 'explain', 'explainBack'].forEach(k => { if (typeof P[k] === 'string' && P[k].trim().length > 8 && P[k].length < 1400) { l[k] = P[k].trim(); n++; } }); });
      s.critique.patched = n;
    }
  } catch (e) { if (e && e.code === 'cancelled') throw e; s.critique.error = (e && (e.code || e.message)) || 'failed'; }
  try {
    check(o.signal); o.onStatus && o.onStatus('Auditing the scene model: entities, mechanisms, units, constraints and controls…');
    const audit = await ask(modelAuditPrompt(plan, s, sourceStepIds, o.sourceContext || ''), { ...o, tools: false, writing: 'Auditing the simulation model', role: 'director' }, 'Independently audit this simulation model');
    if (audit && typeof audit === 'object') s.modelAudit = {
      checkedAt: new Date().toISOString(), verdict: ['pass', 'revise', 'uncertain'].includes(audit.verdict) ? audit.verdict : 'uncertain',
      score: Number.isFinite(+audit.score) ? Math.max(0, Math.min(1, +audit.score)) : null,
      issues: (audit.issues || []).slice(0, 12).map(x => ({ severity: x.severity || 'minor', area: x.area || 'scope', problem: String(x.problem || '').slice(0, 500), evidence: String(x.evidence || '').slice(0, 500), repair: String(x.repair || '').slice(0, 500) })),
      unverified: (audit.unverified || []).slice(0, 12).map(String), assumptionsToSurface: (audit.assumptionsToSurface || []).slice(0, 12).map(String), summary: String(audit.summary || '').slice(0, 500)
    };
  } catch (e) { if (e && e.code === 'cancelled') throw e; s.modelAudit = { checkedAt: new Date().toISOString(), verdict: 'uncertain', error: (e && (e.code || e.message)) || 'audit failed' }; }
  return s.critique;
}
// Author one scene request in place: plan → full prompt (from the plan) → self-critique; then a simpler one; then a fallback.
export async function authorDemo(ctx, st, d, o = {}) {
  // asked on its own (the reader's "Build this diorama"): a job of its own in the activity panel; inside an analysis
  // it is part of that job's "building the dioramas" stage
  if (currentJob() && !o._own) return authorDemo0(ctx, st, d, o);
  const J = startJob('Diorama “' + String(d.title || st.title || st.id).slice(0, 50) + '”', { stages: ['plan', 'author', 'check'], names: { plan: 'planning what it must show', author: 'writing the scene', check: 'checking it against the plan' }, signal: o.signal });
  try { return await authorDemo0(ctx, st, d, { ...o, signal: J.signal, onStatus: t => { J.status(t); if (/^Authoring|^Retrying/.test(t)) J.stage('author'); else if (/critique|check|audit/i.test(t)) J.stage('check'); o.onStatus && o.onStatus(t); } }); }
  finally { J.end(); }
}
async function authorDemo0(ctx, st, d, o = {}) {
  const context = `${st.title}: ${st.statement || ''}${st.answers ? ' | the step answers: ' + st.answers : ''}${st.opens ? ' | and opens: ' + st.opens : ''}`;
  let fail = '', rejectedAttempts = [];
  if (o.auto !== false && aiAvailable()) {
    const sourceStepIds = (d.sourceStepIds || [st.id]).map(String);
    const plan = o.plan === false ? null : await planDemo(ctx, st, d, context, o);
    if (!plan) fail = 'no validated versioned model plan was available; scene authoring was not allowed to proceed without the source-mapped contract';
    for (const simple of (plan ? [false, true] : [])) {
      check(o.signal); o.onStatus && o.onStatus(`${simple ? 'Retrying, simpler' : 'Authoring'}: diorama “${d.title || st.title}” for ${st.id}…`);
      try {
        const spec = await ask(authorPrompt({ ...d, plan, sourceStepIds, failure: fail }, context, { simple }), { ...o, writing: 'Authoring the diorama' }, 'Author this diorama in any AI');
        const s = spec && (spec.spec || spec);
        // the author may answer that the idea is not spatial, with the primitive of its structure (prompts/03)
        if (s && s.type === 'figure' && s.figure) { const v = validateFigure(s.figure); if (v.ok && isPrimitive(v.fig.kind)) { const req = { request: d.request, title: d.title, purpose: d.purpose }; Object.keys(d).forEach(k => delete d[k]); Object.assign(d, { type: 'figure', title: s.title || req.title, purpose: s.purpose || req.purpose, figure: v.fig, request: req.request, authored: 'primitive' }); return 'primitive'; } fail = 'figure: ' + v.errors.join('; '); continue; }
        const why = validScene(s);
        if (!why) {
          s.type = 'scene'; s.technique = s.technique || d.technique || 'card'; s.title = s.title || d.title; s.purpose = s.purpose || d.purpose; s.request = d.request; s.sourceStepIds = sourceStepIds; s.authored = simple ? 'simple' : 'full';
          if (plan) {
            s.plan = s.plan && s.plan.sequence ? s.plan : plan; if (!s.levels && plan.levels) s.levels = plan.levels;
            if (plan.version === 'scriptorium-model-plan/1') {
              s.modelContract = JSON.parse(JSON.stringify(plan.modelContract));
              const local = checkSceneContract(s, plan, sourceStepIds);
              s.modelValidation = { checkedAt: new Date().toISOString(), method: 'deterministic scene-to-contract checks', pass: !local.faults.length, faults: local.faults, warnings: local.warnings };
              if (local.faults.length) { rejectedAttempts.push({ attempt: simple ? 'simple' : 'full', stage: 'modelValidation', faults: local.faults.slice(0, 12) }); fail = 'scene-to-model contract validation failed: ' + local.faults.slice(0, 8).join('; '); continue; }
            }
            await critiqueDemo(s, s.plan, { ...o, sourceStepIds, sourceContext: [context, d.request || ''].filter(Boolean).join('\n\n') });
            const major = (s.modelAudit && s.modelAudit.issues || []).filter(x => x.severity === 'critical' || x.severity === 'major');
            if (s.modelAudit && s.modelAudit.verdict === 'revise' && major.length) {
              rejectedAttempts.push({ attempt: simple ? 'simple' : 'full', stage: 'modelAudit', verdict: s.modelAudit.verdict, issues: s.modelAudit.issues.slice(0, 12), unverified: s.modelAudit.unverified || [] });
              fail = 'independent model audit: ' + major.slice(0, 5).map(x => x.problem + (x.repair ? ' — ' + x.repair : '')).join('; ');
              continue;
            }
          }
          if (rejectedAttempts.length) s.rejectedAttempts = rejectedAttempts;
          Object.keys(d).forEach(k => delete d[k]); Object.assign(d, s); return d.authored;
        }
        fail = why;
      } catch (e) { if (e && e.code === 'cancelled') throw e; fail = (e && (e.code || e.message)) || 'failed'; }
    }
  }
  const fb = fallbackDemo(st, d);
  const req = { request: d.request, title: d.title, purpose: d.purpose, technique: d.technique };
  Object.keys(d).forEach(k => delete d[k]); Object.assign(d, fb, { requested: req, fallback: fail || 'no AI here', ...(rejectedAttempts.length ? { rejectedAttempts } : {}) });
  return 'fallback:' + (fb.type === 'figure' ? 'diagram' : fb.type);
}
export async function buildDioramas(ctx, P, M, o = {}) {
  const A = P.analysis, ins = planAndInsertDioramas(A, M.sections || []), made = [];
  for (const st of A.chain || []) for (const d of st.demos || []) if (needsAuthoring(d)) { made.push({ step: st.id, how: await authorDemo(ctx, st, d, o) }); ctx.save && ctx.save(P); }
  A.dioramaReport = { plan: ins.plan.map(p => ({ subsection: p.subsection, need: p.need, why: p.why })), added: ins.added, made };
}

// Extend an existing atlas with real search records from later scene authoring or learner-requested builds.
// The call IDs make this idempotent across save/resume cycles and keep a failed/retried model call auditable.
export function mergeAtlasResearch(atlas, records = []) {
  if (!atlas || !Array.isArray(records) || !records.length) return;
  atlas.sourceIndex = atlas.sourceIndex || {};
  const W = atlas.sourceIndex.webResearch || { provider: '', model: '', searched: 0, tasks: [], records: [], citations: [] };
  W.records = Array.isArray(W.records) ? W.records : [];
  W.tasks = Array.isArray(W.tasks) ? W.tasks : [];
  W.citations = Array.isArray(W.citations) ? W.citations : [];
  const key = x => x.callId || [x.provider || '', x.model || '', +x.searched || 0, (x.citations || []).map(c => c && c.url || '').sort().join('|')].join('::');
  const seen = new Set(W.records.map(key));
  const fresh = records.filter(x => x && !seen.has(key(x)) && (seen.add(key(x)), true));
  if (!fresh.length) return;
  fresh.forEach(x => {
    W.records.push({ callId: x.callId || null, provider: x.provider || '', model: x.model || '', searched: +x.searched || 0,
      task: x.task || 'AI authoring call', citations: (x.citations || []).filter(c => c && /^https:\/\//i.test(c.url)) });
  });
  W.provider = [...new Set([W.provider, ...fresh.map(x => x.provider)].filter(Boolean))].join(', ');
  W.model = [...new Set([W.model, ...fresh.map(x => x.model)].filter(Boolean))].join(', ');
  W.searched = (+W.searched || 0) + fresh.reduce((n, x) => n + (+x.searched || 0), 0);
  W.tasks = [...W.tasks, ...fresh.map(x => x.task || 'AI authoring call')];
  const allCitations = [...W.citations, ...fresh.flatMap(x => x.citations || [])];
  W.citations = allCitations.filter((c, i) => c && c.url && allCitations.findIndex(y => y && y.url === c.url) === i);
  atlas.sourceIndex.webResearch = W;
  atlas.audit = atlas.audit || {};
  atlas.audit.webResearch = {
    provider: W.provider || null, model: W.model || null,
    searches: W.searched || 0, citations: W.citations.length,
    callIds: W.records.map(x => x.callId).filter(Boolean)
  };
}

// Give every concept node its own grouped visual model when the concept genuinely benefits from 3D.
// Existing step-level dioramas remain linked as supporting views; abstract material stays 2D.
async function ensureAtlasDioramas(ctx, P, atlas, o = {}) {
  const A = P.analysis, byId = new Map((A.chain || []).map(st => [String(st.id), st]));
  const sourceFigures = Array.isArray(o.sourceFigures) ? o.sourceFigures : [];
  for (const node of atlas.nodes || []) {
    const refs = [];
    (node.stepIds || []).forEach(id => {
      const st = byId.get(String(id)); if (!st) return;
      (st.demos || []).forEach((d, i) => {
        if (isThreeD(d) && !needsAuthoring(d)) refs.push({ stepId: st.id, demoIndex: i, title: d.title || st.title, purpose: d.purpose || st.answers || st.title });
      });
    });
    const needsGroupedScene = (node.dioramaSet || []).some(v => v && v.medium === '3d');
    const groupedResult = (node.stepIds || []).flatMap(id => {
      const st = byId.get(String(id));
      return (st && st.demos || []).map((d, demoIndex) => ({ st, d, demoIndex })).filter(x => x.d && x.d.atlasNodeId === node.id && !needsAuthoring(x.d));
    })[0] || null;
    const alreadyGrouped = !!groupedResult;
    if (groupedResult && groupedResult.d.type === 'figure' && groupedResult.d.figure) {
      node.generatedFigure = groupedResult.d.figure;
      node.explanatoryFigures = node.explanatoryFigures || [];
      if (!node.explanatoryFigures.some(x => x.generatedByAtlas && x.stepId === String(groupedResult.st.id))) {
        node.explanatoryFigures.push({
          stepId: String(groupedResult.st.id), title: groupedResult.d.title || node.title,
          purpose: groupedResult.d.purpose || node.question, figure: groupedResult.d.figure, generatedByAtlas: true
        });
      }
    }
    if (needsGroupedScene && !alreadyGrouped) {
      const st = (node.stepIds || []).map(id => byId.get(String(id))).find(Boolean);
      if (st) {
        check(o.signal);
        const views = (node.dioramaSet || []).filter(v => v && v.medium === '3d').slice(0, 6).map(v => ({
          title: v.title, purpose: v.purpose, mustShow: v.mustShow, manipulations: v.manipulations,
          sourceFigureIds: Array.isArray(v.sourceFigureIds) ? v.sourceFigureIds : []
        }));
        const sourceSteps = (node.stepIds || []).map(id => byId.get(String(id))).filter(Boolean).map(step => ({
          id: step.id, title: step.title, statement: String(step.statement || '').slice(0, 1200),
          answers: step.answers || '', opens: step.opens || '', math: step.math || '',
          terms: (step.terms || []).slice(0, 12), explanation: (step.explain || []).map(x => x && x.text).filter(Boolean).join(' ').slice(0, 1400),
          pages: step.pages || [], figures: step.figures || [], figureRefs: step.figureRefs || [], table: step.table || null
        }));
        const figureEvidence = sourceFigureEvidence(node.stepIds, A.chain || [], sourceFigures);
        const selectedFigures = selectSourceFigureAttachments(node, A.chain || [], sourceFigures, imageLimit());
        const sourceFigureRefs = figureEvidence.figures;
        const sourceVisualAttachmentManifest = sourceFigureAttachmentManifest(node, A.chain || [], sourceFigures, imageLimit());
        const sourceVisualAttachments = sourceVisualAttachmentManifest.map(f => f.id);
        const sourceEvidenceStatus = {
          referenced: sourceFigureRefs.length + figureEvidence.unresolvedFigureIds.length,
          indexed: sourceFigureRefs.length,
          attached: sourceVisualAttachments.length,
          unresolved: figureEvidence.unresolvedFigureIds
        };
        const d = {
          type: 'scene', title: node.title, purpose: node.question, auto: true, planned: true, sourceStepIds: (node.stepIds || []).map(String),
          sourceFigureRefs, sourceVisualAttachments, sourceVisualAttachmentManifest, sourceEvidenceStatus,
          request: 'Build a grouped, high-fidelity explanatory diorama for this semantic topic node. ' +
            'Concept summary: ' + node.summary + '. Visual intent: ' + node.visualIntent + '. Planned explanatory views: ' + JSON.stringify(views) +
            '. COMPLETE SOURCE STEP MATERIAL FOR THIS NODE (use all of it; IDs remain the audit anchors): ' + JSON.stringify(sourceSteps) +
            '. SOURCE-FIGURE EVIDENCE (each record is linked to the listed validated source steps; inspect the attached images but do not claim details that the pixels do not support): ' + JSON.stringify(sourceFigureRefs) +
            '. ATTACHED IMAGE MANIFEST (image 1, image 2, etc. match the request attachments in this exact order; the manifest records each image ID, caption and source location): ' + JSON.stringify(sourceVisualAttachmentManifest) +
            '. Unresolved source figure references (not attached and not evidence): ' + JSON.stringify(figureEvidence.unresolvedFigureIds) +
            '. Use only these source steps and linked source figures for factual claims, quantities, actors and relationships. Do not infer an unprovided measurement. ' +
            'Choose the most suitable materialisation technique and environment for the domain. Make structures and mechanisms inspectable, make meaningful variables changeable, and sequence 3–6 lessons from global orientation through mechanism to reconstruction and a prediction/check. ' +
            'This scene belongs to concept "' + node.title + '" and is connected to source steps ' + node.stepIds.join(', ') + '. Keep source claims separate from externally researched additions.'
        };
        st.demos = st.demos || [];
        sayAtlasStatus(o, 'Authoring the concept-level diorama for "' + node.title + '"…');
        const auditBefore = (o.researchAudit || []).length;
        let how;
        const images = selectedFigures.map(f => dataUrlBlob(f.dataUrl));
        try {
          how = await authorDemo(ctx, st, d, { ...o, images: images.length ? images : o.images });
        } catch (e) {
          mergeAtlasResearch(atlas, (o.researchAudit || []).slice(auditBefore));
          if (ctx.save) await ctx.save(P);
          throw e;
        }
        mergeAtlasResearch(atlas, (o.researchAudit || []).slice(auditBefore));
        // authorDemo replaces its draft object; restore the audit metadata after that in-place rewrite.
        d.atlasNodeId = node.id;
        d.sourceFigureRefs = sourceFigureRefs;
        d.sourceVisualAttachments = sourceVisualAttachments;
        d.sourceVisualAttachmentManifest = sourceVisualAttachmentManifest;
        d.sourceEvidenceStatus = sourceEvidenceStatus;
        st.demos.push(d);
        if (isThreeD(d) && !needsAuthoring(d)) refs.push({ stepId: st.id, demoIndex: st.demos.length - 1, title: d.title || node.title, purpose: d.purpose || node.question, atlasNodeId: node.id });
        else if (d.type === 'figure' && d.figure) {
          node.generatedFigure = d.figure;
          node.explanatoryFigures = node.explanatoryFigures || [];
          if (!node.explanatoryFigures.some(x => x.generatedByAtlas && x.stepId === String(st.id))) {
            node.explanatoryFigures.push({ stepId: String(st.id), title: d.title || node.title, purpose: d.purpose || node.question, figure: d.figure, generatedByAtlas: true });
          }
        }
        node.dioramaBuild = how;
        if (ctx.save) await ctx.save(P);
      }
    }
    node.dioramaRefs = refs;
    node.visualKind = refs.length ? 'diorama' : node.generatedFigure ? 'diagram' : (node.dioramaSet || []).some(d => d.medium === '2d') ? 'diagram' : 'concept';
    node.figureRefs = (node.stepIds || []).flatMap(id => {
      const step = byId.get(String(id));
      return step ? stepFigureIdsSafe(step).map(figureId => ({ stepId: step.id, id: figureId })) : [];
    });
    const evidence = sourceFigureEvidence(node.stepIds, A.chain || [], sourceFigures);
    node.sourceFigureRecords = evidence.figures;
    node.unresolvedFigureIds = evidence.unresolvedFigureIds;
  }
  atlas.audit = { ...(atlas.audit || {}), conceptNodes: (atlas.nodes || []).length, linkedDioramas: (atlas.nodes || []).reduce((n, x) => n + (x.dioramaRefs || []).length, 0), nodesWithout3D: (atlas.nodes || []).filter(x => !x.dioramaRefs || !x.dioramaRefs.length).map(x => x.id) };
}
function stepFigureIdsSafe(step) {
  return [
    ...(step && Array.isArray(step.figures) ? step.figures.map(x => typeof x === 'string' ? x : x && x.id) : []),
    ...(step && Array.isArray(step.figureRefs) ? step.figureRefs.map(x => typeof x === 'string' ? x : x && x.id) : [])
  ].filter(Boolean).map(String);
}
function sayAtlasStatus(o, message) { o.onStatus && o.onStatus(message); }

// ---------------------------------------------------------------- fallbacks: a fitting built-in model, a flagship scene, a bars scene, or a diagram
const ROUTES = [
  [/galton|binomial|bernoulli|coin|central limit|bell curve|normal distribution|sampling distribution|random (draws|values|sample)|rbinom|dbinom|pbinom/i, () => ({ ...C(GALTON), purpose: null })],
  [/supply|demand|market|equilibrium price|auction/i, () => ({ ...C(MARKET), purpose: null })],
  [/pendulum|swing/i, () => ({ type: 'pendulum', params: {} })], [/spring|hooke|oscillat/i, () => ({ type: 'spring', params: {} })],
  [/projectile|trajector|launch/i, () => ({ type: 'projectile', params: {} })], [/orbit|kepler|planet|gravitat/i, () => ({ type: 'orbit', params: {} })],
  [/collision|momentum/i, () => ({ type: 'collision', params: {} })], [/incline|friction|slope/i, () => ({ type: 'incline', params: {} })],
  [/lever|torque|moment|balance/i, () => ({ type: 'lever', params: {} })], [/wave|wavelength|frequency/i, () => ({ type: 'wave', params: {} })],
  [/\bgas\b|pressure|temperature|kinetic theory/i, () => ({ type: 'gas', params: {} })], [/reaction|activation energy|equilibrium constant|kinetics/i, () => ({ type: 'reaction', params: {} })],
  [/electric field|charge|coulomb/i, () => ({ type: 'efield', params: {} })], [/circuit|capacitor|resistor/i, () => ({ type: 'circuit', params: {} })],
  [/lens|refract|focal/i, () => ({ type: 'lens', params: {} })], [/gradient|minimi[sz]|optimi[sz]|descent|surface/i, () => ({ type: 'surface', params: {}, expr: 'sin(x)*cos(y)' })]
];
const LESSONS3 = (subject, q0, q3) => [
  { title: 'Look', question: q0, text: `Look at the ${subject}. What stands out first?`, focus: subject, run: 3, explain: 'The tallest part carries most of the weight of the story.', opens: 'How do the other parts compare with it?' },
  { title: 'Compare', question: 'How do the other parts compare with it?', text: 'Move around and compare the heights.', focus: subject, run: 4, explain: 'Equal heights mean equal values; differences are read straight off the bars.', opens: 'What would change if one value changed?' },
  { title: 'Change', question: 'What would change if one value changed?', text: 'Picture one bar growing: the order and the total change with it.', focus: subject, run: 4, explain: 'Each bar is one value of the table; the whole shape is the distribution of the values.', opens: q3 }];
function barsScene(title, purpose, cats, vals, st) {
  const max = Math.max(...vals.map(Math.abs), 1e-9), sc = 4.5 / max;
  return { type: 'scene', title, purpose, technique: 'card', environment: { preset: 'studio' },
    bodies: [{ id: 'base', name: 'Base', role: 'decor', shape: { kind: 'box', w: Math.max(4, cats.length * .9 + 1), h: .1, d: 1.6 }, material: { preset: 'darkwood' }, position: [0, .05, 0] },
      { id: 'bars', name: 'bars', label: 'bars · ' + (st.table && st.table.columns ? st.table.columns.slice(1).join(', ') : 'values'), role: 'actor', describe: 'One bar per row of the table, its height the value.', shape: { kind: 'bars', data: vals.map(v => Math.max(0, v)), w: .55, gap: .3, scale: sc }, material: { preset: 'plastic', color: '#2d5b8e' }, position: [0, .1, 0] },
      ...cats.slice(0, 14).map((c, i) => ({ id: 'lab' + i, name: String(c), role: 'decor', shape: { kind: 'text', text: String(c).slice(0, 14), w: .8, h: .28 }, material: { preset: 'paper' }, position: [(i - (cats.length - 1) / 2) * .85, .3, .9], rotation: [-30, 0, 0] }))],
    tour: ['bars'], lessons: LESSONS3('bars', purpose || 'Which value is the largest?', st.opens || 'What does the shape of the values tell us?') };
}
export function fallbackDemo(st, d = {}) {
  const text = [d.request, d.title, st.title, st.statement, ...(st.explain || []).map(e => e && e.text)].join(' ');
  for (const [re, make] of ROUTES) if (re.test(text)) { const m = make(); m.title = m.title || d.title || st.title; m.purpose = d.purpose || m.purpose || st.answers || ''; return m; }
  if (st.table && Array.isArray(st.table.rows) && st.table.rows.length >= 2) { const num = st.table.rows.map(r => +String(r[1] ?? '').replace(/[,%]/g, '')); if (num.every(isFinite)) return barsScene(d.title || st.title, d.purpose || st.answers || '', st.table.rows.map(r => r[0]), num, st); }
  // a diagram: the step's best own figure, else one built from the step
  const own = (st.explain || []).map(e => e && e.figure).find(f => f && validateFigure(f).ok && ['plot', 'distribution', 'scatter', 'bars', 'flow', 'sketch', 'tree'].includes(f.kind));
  return { type: 'figure', title: d.title || st.title, purpose: d.purpose || st.answers || '', figure: own ? C(own) : autoFigure(st, 'explain', st.statement + ' ' + ((st.explain || [])[0] && st.explain[0].text || '')) };
}

// ---------------------------------------------------------------- one part, all stages (resumable)
// one analysis per part at a time (the book job, the reader's Analyse / Repair / Paste): a second caller gets code 'busy'
const BUSY = new Set(), busyKey = (ctx, P) => ((ctx.book && ctx.book.id) || '?') + '/' + P.id;
export const partBusy = (bookId, partId) => BUSY.has(bookId + '/' + partId);
export const bookBusy = bookId => [...BUSY].some(k => k.startsWith(bookId + '/'));
export async function analysePart(ctx, P, o = {}) {
  const key = busyKey(ctx, P); if (BUSY.has(key)) { const e = new Error('This part is already being analysed. Wait until that run finishes.'); e.code = 'busy'; throw e; }
  // the activity panel: a bar through the stages, the live status, and Stop (what is written so far is kept)
  const J = startJob('Writing “' + String(P.title || 'this part').slice(0, 60) + '”', { stages: STAGES.slice(0, -1), names: STAGE_NAMES, signal: o.signal });
  const say0 = o.onStatus, stg0 = o.onStage;
  BUSY.add(key); let ok = false;
  try { const r = await analyseOne(ctx, P, { ...o, signal: J.signal, onStatus: t => { J.status(t); say0 && say0(t); }, onStage: st => { J.stage(st); stg0 && stg0(st); } }); ok = true; return r; }
  finally { BUSY.delete(key); J.end(ok ? 'Written: every stage done.' : J.signal.aborted ? 'Stopped: what was written is kept.' : 'Stopped by an error (the scroll says which).'); }
}
async function analyseOne(ctx, P, o) {
  const researchAudit = [];
  o = { ...o, researchAudit };
  const auto = o.auto != null ? o.auto : aiAvailable(), say = o.onStatus || (() => {}), stage = s => { P.job = { ...(P.job || {}), stage: s, level: o.level || (P.job && P.job.level) || 'complete', n: o.n || (P.job && P.job.n) || null, updated: Date.now() }; o.onStage && o.onStage(s); };
  const save = () => ctx.save && ctx.save(P);
  if (o.force) { delete P.analysis; P.job = null; }
  if (P.analysis && !P.job) P.job = { stage: 'coverage' };   // a chain written before stages existed (or pasted): check it, do not rewrite it
  const done = s => P.job && STAGES.indexOf(P.job.stage) > STAGES.indexOf(s);
  const M = await material(ctx, P, { onStatus: say }); check(o.signal);
  // progressive: the scroll is readable as soon as the chain is written, and again once its gaps are filled (the reader
  // re-renders on refresh while later stages keep improving it); figures and dioramas arrive with the final refresh
  const show = () => { if (ctx.refresh) { try { ctx.refresh(P); } catch (e) { console.warn('refresh', e); } } };
  if (!P.analysis || P.job.stage === 'chain') { stage('chain'); P.analysis = await writeChain(ctx, P, M, { ...o, onStatus: say }); stage('coverage'); save(); show(); }
  if (!done('coverage')) { check(o.signal); await coverageFill(ctx, P, M, { ...o, auto, onStatus: say }); stage('gate'); save(); show(); }
  if (!done('gate')) { check(o.signal); await gateAndRepair(ctx, P, M, { ...o, auto, onStatus: say }); stage('figures'); save(); }
  if (!done('figures')) { check(o.signal); await completeFigures(ctx, P, { ...o, auto, onStatus: say }); stage('dioramas'); save(); }
  if (!done('dioramas')) { check(o.signal); if (o.dioramas !== false) await buildDioramas(ctx, P, M, { ...o, auto, onStatus: say }); stage('atlas'); save(); show(); }
  if (!P.analysis.atlas || !done('atlas')) {
    check(o.signal); stage('atlas');
    // The atlas itself is persisted before the slower grouped-scene authoring pass. If that pass is interrupted,
    // resume the existing concept graph and fill its missing diorama links instead of paying to recompile the map.
    if (!P.analysis.atlas) {
      P.analysis.atlas = await compileAtlas({ book: bookName(ctx), sourceType: ctx.book.sourceType || 'pdf', part: P.title, analysis: P.analysis, sections: M.sections || [], figures: M.figures || [], auto, signal: o.signal, researchAudit, onStatus: say });
      save(); show();
    }
    if (o.dioramas !== false && auto) await ensureAtlasDioramas(ctx, P, P.analysis.atlas, { ...o, sourceFigures: M.figures || [], onStatus: say });
    stage('done'); save(); show();
  }
  // the final gate result (figures, dioramas and semantic atlas now in place) is what the quality panel shows
  const G = qualityGate(P.analysis, M.sections || [], (M.figures || []).map(f => ({ id: f.id, label: f.label, page: f.page, bbox: f.bbox })));
  P.analysis.qualityReport = { ...(P.analysis.qualityReport || {}), final: { ok: G.ok, issues: G.issues, stats: G.stats } };
  if (researchAudit.length) P.analysis.researchEvidenceCalls = [...(P.analysis.researchEvidenceCalls || []), ...researchAudit].slice(-120);
  save();
  ctx.refresh && ctx.refresh(P);
  return P.analysis;
}

// ---------------------------------------------------------------- a whole book (the Add-PDF dialog's job)
// job = { bookId, parts:[partId], level, n, alloc:{partId:n}, status, current, error } stored under 'job:<bookId>'.
export function roomCtx(app, bookId) {
  const book = app.lib.books.find(b => b.id === bookId);
  const live = () => app.mode && app.mode.book && app.mode.book.id === bookId && app.mode.data ? app.mode : null;
  const exists = () => app.lib.books.some(b => b.id === bookId);   // removed while the job ran: write nothing back
  let chain = Promise.resolve();   // saves run one after another, each on a fresh copy of the stored room
  const ctx = { app, book, data: null,
    async load() { await chain; const L = live(); ctx.data = L ? L.data : await app.loadRoom(bookId); return ctx.data; },
    // a room opened (or reloaded) during a long call holds its own copy: the part is written into whichever is current;
    // with no room open, the stored room is read again and only this part replaced (edits made meanwhile are kept)
    save(part) {
      if (!exists()) return chain;
      const L = live();
      if (L) { const D = L.data; if (part && D && D.parts) { const i = D.parts.findIndex(p => p.id === part.id); if (i >= 0 && D.parts[i] !== part) D.parts[i] = part; } L.save(); return chain; }
      const snap = part ? C(part) : null;
      chain = chain.then(async () => {
        if (!exists()) return; const D = await app.store.get('room:' + bookId); if (!D || !Array.isArray(D.parts)) return;
        if (snap) { const i = D.parts.findIndex(p => p.id === snap.id); if (i < 0) return; D.parts[i] = snap; }
        await app.store.set('room:' + bookId, D);
      }).catch(e => console.warn('room save', e));
      return chain;
    },
    refresh(part) { const L = live(); if (L && L.refreshStation) { try { L.refreshStation(part); } catch (e) { } } } };
  return ctx;
}
export async function saveJob(app, job) { if (app.lib && !app.lib.books.some(b => b.id === job.bookId)) return; job.updated = Date.now(); await app.store.set('job:' + job.bookId, C(job)); }   // never re-creates the job of a removed book
export async function pendingJobs(app) { const ks = await app.store.keys('job:'); const out = []; for (const k of ks) { const j = await app.store.get(k); if (j && j.status !== 'done' && app.lib.books.some(b => b.id === j.bookId)) out.push(j); } return out; }
export async function runJob(app, job, { signal, onProgress = () => {} } = {}) {
  const ctx = roomCtx(app, job.bookId); job.status = 'running'; job.error = null; await saveJob(app, job);
  try {
    for (let i = 0; i < job.parts.length; i++) {
      check(signal);
      if (!app.lib.books.some(b => b.id === job.bookId)) throw cancelled();   // the book was removed
      while (partBusy(job.bookId, job.parts[i])) { check(signal); await new Promise(r => setTimeout(r, 1000)); }   // the reader is analysing this part: wait, then take up what it left
      const D = await ctx.load(), P = D.parts.find(p => p.id === job.parts[i]); if (!P) continue;
      if (P.job && P.job.stage === 'done' && P.analysis) { onProgress({ index: i, part: P, stage: 'done', status: 'already analysed' }); continue; }
      job.current = P.id; await saveJob(app, job);
      const n = job.level === 'exact' ? (job.alloc && job.alloc[P.id]) || job.n : null;
      await analysePart(ctx, P, { level: job.level, deep: !!job.deep, n, signal, onStage: s => onProgress({ index: i, part: P, stage: s }), onStatus: t => onProgress({ index: i, part: P, status: t }) });
      onProgress({ index: i, part: P, stage: 'done' });
    }
    job.status = 'done'; job.current = null; await saveJob(app, job);
  } catch (e) { job.status = e && e.code === 'cancelled' ? 'paused' : 'failed'; job.error = e && e.code === 'cancelled' ? null : String((e && (e.message || e.code)) || e); if (app.lib.books.some(b => b.id === job.bookId)) await saveJob(app, job); throw e; } finally { const live = app.mode && app.mode.book && app.mode.book.id === job.bookId; if (!live && !bookBusy(job.bookId) && app.ingest.closePDF) app.ingest.closePDF(job.bookId); }   // the room, if open, closes it when it ends
  return job;
}
// N steps for the whole selected range, spread over the parts by how much text they hold (never fewer than a part's
// subsections: the resolution is never coarser than the source)
export function allocateSteps(parts, N) {
  const w = parts.map(p => Math.max(1, (p.endPage - p.startPage + 1))), total = w.reduce((a, b) => a + b, 0), out = {};
  parts.forEach((p, i) => { out[p.id] = Math.max((p.subsections || []).length || 1, Math.round(N * w[i] / total)); });
  return out;
}
