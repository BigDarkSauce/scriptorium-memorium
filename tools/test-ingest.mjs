#!/usr/bin/env node
// Scriptorium Memorium — the PDF-to-scroll pipeline, tested without a live Claude (node + playwright, headless Chromium).
//
// RUN   node tools/test-ingest.mjs [url]            default url http://localhost:8810/ (serve the app first: ./serve.sh)
//       TEST_PDF=/path/file.pdf     the PDF to add (default: the BYU22S01 infographics if TEST_PDF is unset and it is
//                                   served as /byu.pdf; it must be reachable from the page at TEST_PDF_URL too)
//       TEST_SHOTS=dir              save screenshots there (≤ 14)
//       TEST_STATS=1                also check the generated statistics tutorial (/stats-tutorial.pdf; make it with
//                                   python3 tools/fixtures/make_stats_pdf.py <served dir>/stats-tutorial.pdf)
// The page gets a stub window.claude whose `sample` answers with the recorded model outputs in tools/fixtures/byu-stub/
// (rebuild them with node tools/fixtures/byu-stub/build.mjs). The first answer for sheet 01 pastes the page twice, so the
// quality gate must catch it and the repair call must replace it.
//
// CHECKS (one line each; any FAIL → exit code 1)
//   fixtures   every recorded figure spec validates; the gate flags the pasted answer (copied, duplicate, unexplained)
//   dialog     + Add PDF scroll → file → bookcase/row/place (hub.highlightSlot ghost) → pages and chapters → breakdown
//   job        analysis runs with progress; Cancel pauses it after the first part; Resume finishes every part
//   gate       sheet 01 was repaired (copied/duplicate/unexplained gone); the PDF page crop is never shown twice
//   coverage   every panel of every sheet has a step (the follow-up wrote the one sheet 03 left out)
//   figures    every text-heavy paragraph and every Picture it / Common mistake / Check yourself has a valid figure
//   dioramas   every subsection the plan marks dynamic has its dioramas; no demo slot is left unbuilt
//   reader     explained steps render: paragraphs with figures, code line by line, examples, small figures, and the
//              check figure only after the answer is revealed
//   diorama    the authored Holling diorama opens and runs
//   errors     no uncaught exceptions or console errors
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL0 = process.argv[2] || process.env.TEST_URL || 'http://localhost:8810/';
const PDF = process.env.TEST_PDF || '';
const PDF_URL = process.env.TEST_PDF_URL || '/byu.pdf';
const SHOTS = process.env.TEST_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = []; let failed = 0;
const report = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} ${detail}`); };

// ---------------------------------------------------------------- fixtures (node)
const FX = {}; const FXDIR = join(ROOT, 'tools/fixtures/byu-stub');
for (const f of readdirSync(FXDIR).filter(f => f.endsWith('.json'))) FX[basename(f, '.json')] = JSON.parse(readFileSync(join(FXDIR, f), 'utf8'));
{
  const F = await import(join(ROOT, 'js/room/figspec.js')), P = await import(join(ROOT, 'js/ai/prompts.js'));
  let n = 0, bad = []; Object.entries(FX).filter(([k]) => k.startsWith('chain-') || k.startsWith('gaps-') || k.startsWith('repair-')).forEach(([k, A]) => (A.chain || A.steps || []).forEach(st => { F.figureSlots(st).forEach(s => { if (s.fig) { n++; const v = F.validateFigure(s.fig); if (!v.ok) bad.push(`${k} ${st.id} ${s.slot}: ${v.errors.join('; ')}`); } }); (st.explain || []).forEach((p, i) => { if (p.figure) { n++; const v = F.validateFigure(p.figure); if (!v.ok) bad.push(`${k} ${st.id} explain.${i}`); } }); }));
  // the gate on the pasted answer, against the panel text it pasted (as the app extracts it: other order, cells joined)
  const src = [{ id: '1.0', title: 'opening', text: '2 Function name | 3 Arguments : the inputs. They live inside the\nthe verb: what to do | brackets, separated by commas.\n1 Store the output | 4 Matched by position | 5 Named: name = value\navg <- saves it as an | the first input fills the first | overrides the default, which is\nobject. Read <- as “gets”. | argument, x (the data) | na.rm = FALSE\nwith na.rm = TRUE\ndat$TotalSleep : hours of sleep for\nna.rm = TRUE / FALSE | left at the default\n62 mammals. 4 are NA (missing).\nAny word followed by brackets is a function. Learn its parts once.', inventory: { code: 3 } }];
  const G = P.qualityGate(JSON.parse(JSON.stringify(FX['chain-01-bad'])), src, [{ id: 'fig-p1-1', page: 1, bbox: [0.03, 0.01, 0.97, 0.77] }]);
  const k = new Set(G.issues.map(i => i.kind));
  report('fixtures', !bad.length && ['copied', 'duplicate', 'unexplained'].every(x => k.has(x)) && G.fixed.length >= 2, `${n} figure specs valid${bad.length ? ', invalid: ' + bad.slice(0, 3).join(' | ') : ''}; gate on the pasted answer: ${[...k].join(', ')}; app fixes: ${G.fixed.length}`);
}

// ---------------------------------------------------------------- browser
async function loadPlaywright() { try { return await import('playwright'); } catch (e) { } try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(join(g, 'noop.js'))('playwright'); } catch (e) { console.error('playwright is not installed'); process.exit(2); } }
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('uncaught: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 240)); });
await page.addInitScript(({ fx }) => {
  // the stub Claude: routes each prompt to its recorded answer (by kind and by sheet number in "PART: 0N · …")
  window.__calls = []; window.__stubDelay = 120; const seen = {};
  const sheet = p => ((p.match(/PART: (\d\d) ·/) || [])[1]) || '';
  const route = p => {
    const n = sheet(p);
    if (/^You are building one scroll/.test(p)) { const k = 'chain:' + n; seen[k] = (seen[k] || 0) + 1; return { kind: 'chain', n, a: n === '01' && seen[k] === 1 ? fx['chain-01-bad'] : fx['chain-' + n] }; }
    if (/^You are completing one scroll/.test(p)) return { kind: 'followup', n, a: fx['gaps-' + n] || { steps: [], coverage: [] } };
    if (/^You are repairing steps/.test(p)) return { kind: 'repair', n, a: fx['repair-' + n] || { steps: [] } };
    if (/^You are illustrating/.test(p)) return { kind: 'figures', n, a: fx['figures-' + n] || { figures: [] } };
    if (/^Author a/.test(p)) { const w = (p.match(/WHAT IT MUST SHOW: ([^\n]*)/) || [])[1] || ''; const simple = /^Author a SIMPLE/.test(p); if (/function machine/i.test(w)) return { kind: 'author', n: 'machine', a: fx['scene-function-machine'] }; if (/Holling|predator/i.test(w)) return { kind: 'author', n: 'holling', a: fx['scene-holling'] }; return { kind: simple ? 'author-simple' : 'author', n: 'none', a: 'I cannot build that scene.' }; }
    return { kind: 'other', n, a: {} };
  };
  const SAMPLE = async (prompt, opts = {}) => { const r = route(String(prompt)); window.__calls.push(r.kind + ':' + r.n); await new Promise(res => setTimeout(res, window.__stubDelay)); if (opts.signal && opts.signal.aborted) throw { code: 'cancelled' }; return { text: typeof r.a === 'string' ? r.a : JSON.stringify(r.a), truncated: false }; };
  SAMPLE.limits = async () => ({ images: { maxCount: 0 } });
  window.claude = { use: async cap => cap === 'sample' ? SAMPLE : null };
  try { localStorage.setItem('scriptorium.readerDock', 'full'); } catch (e) { }
}, { fx: FX });
const shot = async (name, el) => { if (!SHOTS) return; try { await page.evaluate(() => { const W = window.__scriptorium; if (W && W.gfx._r) W.gfx._r(1 / 60, W.t); });  if (el) await page.locator(el).first().screenshot({ path: join(SHOTS, name), timeout: 90000 }); else await page.screenshot({ path: join(SHOTS, name), timeout: 90000 }); } catch (e) { console.log('  (screenshot ' + name + ' failed: ' + e.message.split('\n')[0] + ')'); } };
const T0 = Date.now();
await page.goto(URL0, { timeout: 60000 });
await page.waitForFunction(() => window.__scriptorium && window.__scriptorium.mode && window.__scriptorium.mode.constructor.name === 'Hub' && document.body.classList.contains('ready'), null, { timeout: 120000 });
// software GL is slow and the machine is shared: 3D frames are drawn only for screenshots (the app loop still updates)
await page.evaluate(() => { const g = window.__scriptorium.gfx; g._r = g.render.bind(g); g.render = () => {}; });
await page.waitForTimeout(500);

// ---- the dialog
let dialogOK = false, dialogDetail = '', bookId = null;
try {
  await page.getByRole('button', { name: '+ Add PDF scroll' }).click();
  await page.waitForSelector('.addpdf', { timeout: 5000 });
  const pdfPath = PDF || join(process.env.TEST_SERVE_DIR || '', 'byu.pdf');
  await page.setInputFiles('.addpdf input[type=file]', pdfPath);
  await page.waitForSelector('.addpdf [data-next]:not([disabled])', { timeout: 60000 });
  const fileInfo = await page.locator('.ap-drop span').innerText();
  await shot('01-dialog-file.png', '.addpdf');
  await page.click('.addpdf [data-next]');
  // place: pick the first free place of the second row; the hub shows a ghost scroll there
  await page.waitForSelector('.ap-slot');
  const slots = await page.locator('.ap-row').nth(1).locator('.ap-slot:not(.taken)').count();
  await page.locator('.ap-row').nth(1).locator('.ap-slot:not(.taken)').first().click();
  await page.waitForTimeout(1200);
  const ghost = await page.evaluate(() => { const h = window.__scriptorium.mode; return { api: typeof h.highlightSlot === 'function', ghost: !!(h.ghost && h.ghost.visible) }; });
  await page.evaluate(() => { const v = document.querySelector('.addpdf-veil'); if (v) v.style.background = 'rgba(8,6,4,.15)'; });
  await shot('02-dialog-place.png');
  const placeInfo = await page.locator('.addpdf .ap-body .dim.small').first().innerText();
  await page.click('.addpdf [data-next]');
  // pages: the detected sheets, a range, and ticking chapters
  await page.waitForSelector('.ap-part');
  const nParts = await page.locator('.ap-part').count();
  await page.locator('.ap-part input[type=checkbox]').nth(1).uncheck(); const sumA = await page.locator('.ap-sum').innerText();
  await page.locator('.ap-part input[type=checkbox]').nth(1).check(); const sumB = await page.locator('.ap-sum').innerText();
  await page.locator('.ap-part').first().locator('summary span').first().click();
  await shot('03-dialog-pages.png', '.addpdf');
  await page.click('.addpdf [data-next]');
  // breakdown: exact N spreads over the parts; then back to complete for the run
  await page.locator('input[name=aplevel][value=exact]').check();
  await page.fill('.ap-level input[type=number]', '70'); await page.locator('.ap-level input[type=number]').dispatchEvent('input');
  const alloc = await page.locator('.ap-level.on .dim.small').last().innerText();
  await shot('04-dialog-breakdown.png', '.addpdf');
  await page.locator('input[name=aplevel][value=complete]').check();
  await page.click('.addpdf [data-next]');
  const review = await page.locator('.ap-review').innerText();
  await page.getByRole('button', { name: 'Add and analyse' }).click();
  await page.waitForSelector('.addpdf-progress', { timeout: 20000 });
  bookId = await page.evaluate(() => window.__scriptorium.lib.books[window.__scriptorium.lib.books.length - 1].id);
  dialogOK = /sheet/.test(fileInfo) && nParts === 7 && slots > 0 && ghost.ghost && sumA !== sumB && /Spread over the parts/.test(alloc) && /pages 1–7/.test(review);
  dialogDetail = `${fileInfo}; ${nParts} sheets listed; place: ${placeInfo} (hub API ${ghost.api ? 'used' : 'missing'}, ghost ${ghost.ghost ? 'shown' : 'not shown'}); chapters ticked → "${sumA}" / "${sumB}"; ${alloc.slice(0, 90)}…; review: ${review.replace(/\s+/g, ' ').slice(0, 120)}`;
} catch (e) { dialogDetail = 'error: ' + e.message.split('\n')[0]; }
report('dialog', dialogOK, dialogDetail);

// ---- the job: cancel after the first part, then resume
let jobOK = false, jobDetail = '';
try {
  const room = () => page.evaluate(async id => { const d = await window.__scriptorium.loadRoom(id); return d.parts.map(p => (p.job && p.job.stage) || 'pending'); }, bookId);
  await page.waitForFunction(async id => { const d = await window.__scriptorium.loadRoom(id); return d.parts[0].job && d.parts[0].job.stage === 'done'; }, bookId, { timeout: 120000, polling: 300 });
  await page.evaluate(() => { window.__stubDelay = 600; });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForSelector('.addpdf-progress button:has-text("Resume")', { timeout: 30000 });
  const afterCancel = await room(); const job1 = await page.evaluate(id => window.__scriptorium.store.get('job:' + id), bookId);
  await shot('05-progress-paused.png', '.addpdf-progress .addpdf');
  await page.evaluate(() => { window.__stubDelay = 60; });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForSelector('.addpdf-progress button:has-text("Open the room")', { timeout: 420000 });
  const afterResume = await room(); const job2 = await page.evaluate(id => window.__scriptorium.store.get('job:' + id), bookId);
  await shot('06-progress-done.png', '.addpdf-progress .addpdf');
  jobOK = job1.status === 'paused' && afterCancel[0] === 'done' && afterCancel.slice(1).some(s => s !== 'done') && job2.status === 'done' && afterResume.every(s => s === 'done');
  jobDetail = `after Cancel: job ${job1.status}, stages [${afterCancel.join(', ')}]; after Resume: job ${job2.status}, [${afterResume.join(', ')}]`;
} catch (e) { jobDetail = 'error: ' + e.message.split('\n')[0]; }
report('job', jobOK, jobDetail);

// ---- what the pipeline produced
const R = await page.evaluate(async id => {
  const W = window.__scriptorium, F = await import('/js/room/figspec.js'), D = await W.loadRoom(id), out = { parts: [], calls: window.__calls.slice() };
  const is3D = d => d && (d.type === 'scene' || Array.isArray(d.bodies) || ['pendulum', 'doublependulum', 'spring', 'projectile', 'orbit', 'collision', 'incline', 'lever', 'wave', 'gas', 'reaction', 'efield', 'circuit', 'lens', 'surface', 'weatherglass'].includes(String(d.type)));
  for (const p of D.parts) {
    const A = p.analysis || { chain: [] }, figs = (await W.store.get('figs:' + id + ':' + p.id)) || [];
    const slots = A.chain.flatMap(st => F.figureSlots(st).map(s => ({ st: st.id, slot: s.slot, ok: !!s.fig && F.validateFigure(s.fig).ok, auto: !!(s.fig && s.fig.auto) })));
    const cites = {}; A.chain.forEach(st => (st.figures || []).forEach(f => { cites[f] = (cites[f] || 0) + 1; }));
    const covered = new Set(A.chain.map(st => st.section));
    const plan = (A.dioramaReport && A.dioramaReport.plan) || [];
    const unbuilt = A.chain.flatMap(st => (st.demos || []).filter(d => d.type === 'scene' && !Array.isArray(d.bodies)).map(() => st.id));
    const perSub = plan.map(x => ({ sub: x.subsection, need: x.need, have: A.chain.filter(st => st.section === x.subsection).reduce((a, st) => a + (st.demos || []).filter(is3D).length, 0) }));
    out.parts.push({ title: p.title, steps: A.chain.length, subs: (A.coverageReport && A.coverageReport.sections || []).map(s => s.id), covered: [...covered], slots: slots.length, slotsOk: slots.filter(s => s.ok).length, auto: slots.filter(s => s.auto).length,
      pageFigs: figs.filter(f => f.bbox && (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) > .4).length, figs: figs.map(f => f.id), cites, unbuilt, perSub, made: (A.dioramaReport && A.dioramaReport.made) || [],
      quality: A.qualityReport ? { rounds: A.qualityReport.rounds, repaired: A.qualityReport.repaired, fixed: A.qualityReport.fixed, final: A.qualityReport.final && { ok: A.qualityReport.final.ok, kinds: [...new Set(A.qualityReport.final.issues.map(i => i.kind))] } } : null,
      code: A.chain.filter(st => st.code && st.code.lines && st.code.lines.length).length, examples: A.chain.reduce((a, st) => a + (st.examples || []).length, 0) });
  }
  return out;
}, bookId).catch(e => ({ error: e.message, parts: [], calls: [] }));
const P01 = R.parts[0] || {}, Q = P01.quality || {};
const firstKinds = Q.rounds && Q.rounds[0] ? Object.keys(Q.rounds[0].kinds) : [];
report('gate', ['copied', 'duplicate', 'unexplained'].every(k => firstKinds.includes(k)) && Q.repaired >= 2 && Q.final && !Q.final.kinds.some(k => ['copied', 'duplicate', 'unexplained', 'longQuote'].includes(k)) && R.parts.every(p => Object.values(p.cites).every(n => n <= 1)) && R.parts.every(p => !p.pageFigs) && R.calls.includes('repair:01'),
  `sheet 01 first answer: ${firstKinds.join(', ')} → ${Q.repaired} steps rewritten; fixed by the app: ${(Q.fixed || []).join('; ') || 'none'}; final issues: ${Q.final ? Q.final.kinds.join(', ') || 'none' : '?'}; page-sized crops kept: ${R.parts.reduce((a, p) => a + p.pageFigs, 0)}; PDF figures cited twice: ${R.parts.reduce((a, p) => a + Object.values(p.cites).filter(n => n > 1).length, 0)}`);
const missing = R.parts.flatMap(p => p.subs.filter(s => !p.covered.includes(s)).map(s => p.title.slice(0, 2) + ':' + s));
report('coverage', R.parts.length === 7 && !missing.length && R.calls.includes('followup:03'), `${R.parts.length} sheets, ${R.parts.reduce((a, p) => a + p.subs.length, 0)} panels, ${R.parts.reduce((a, p) => a + p.steps, 0)} steps; uncovered: ${missing.join(', ') || 'none'}; follow-ups: ${R.calls.filter(c => c.startsWith('followup')).join(', ')}; code steps ${R.parts.reduce((a, p) => a + p.code, 0)}, worked examples ${R.parts.reduce((a, p) => a + p.examples, 0)}`);
report('figures', R.parts.length === 7 && R.parts.every(p => p.slots === p.slotsOk) && R.calls.includes('figures:02'), `${R.parts.reduce((a, p) => a + p.slotsOk, 0)} of ${R.parts.reduce((a, p) => a + p.slots, 0)} figure slots valid (${R.parts.reduce((a, p) => a + p.auto, 0)} built by the app from the step); figures call: ${R.calls.filter(c => c.startsWith('figures')).join(', ')}`);
const short = R.parts.flatMap(p => p.perSub.filter(x => x.have < x.need).map(x => p.title.slice(0, 2) + ':' + x.sub));
report('dioramas', R.parts.length === 7 && !short.length && R.parts.every(p => !p.unbuilt.length) && R.parts.some(p => p.made.some(m => /^fallback/.test(m.how))) && R.parts.some(p => p.made.some(m => m.how === 'full')),
  `${R.parts.reduce((a, p) => a + p.perSub.reduce((b, x) => b + x.need, 0), 0)} dioramas planned; made: ${R.parts.flatMap(p => p.made.map(m => p.title.slice(0, 2) + ' ' + m.step + ' ' + m.how)).join(', ')}; short: ${short.join(', ') || 'none'}; unbuilt slots: ${R.parts.reduce((a, p) => a + p.unbuilt.length, 0)}`);

// ---- the reader
let readerOK = false, readerDetail = '';
try {
  const ids = await page.evaluate(async id => (await window.__scriptorium.loadRoom(id)).parts.map(p => p.id), bookId);
  await page.locator('.addpdf-progress').evaluate(n => n.remove()).catch(() => {});
  await page.evaluate(([b, p]) => window.__scriptorium.openRoom(b, { openPart: p }), [bookId, ids[0]]);
  await page.waitForSelector('.reader .step', { timeout: 120000 }); await page.waitForTimeout(4000);
  const D = await page.evaluate(() => { const r = document.querySelector('.reader'); const q = s => r.querySelectorAll(s).length; return { steps: q('.step'), explainFigs: q('.explain .fig svg'), code: q('.code-step'), codeLines: q('.code-lines tr'), examples: q('.example-card'), added: q('.example-card.added'), picture: q('.intuition .fig'), mistake: q('.miscon .fig'), checkBefore: q('.check .ans .fig'), pdfFigs: q('.pdf-fig'), refs: q('.fig-refs'), quality: q('.quality'), bad: q('.fig-bad'), text: (r.innerText.match(/.{0,20}(\bNaN\b|\bundefined\b|\[object Object\]).{0,20}/) || [''])[0] }; });
  await shot('07-reader-sheet01.png');
  await page.locator('.reader .code-step').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  await shot('08-reader-code.png');
  await page.locator('.reader .check button.linkbtn').first().scrollIntoViewIfNeeded(); await page.locator('.reader .check button.linkbtn').first().click(); await page.waitForTimeout(800);
  const checkAfter = await page.locator('.reader .check .ans:not([hidden]) .fig').count();
  await shot('09-check-revealed.png');
  await page.locator('.reader .quality summary').first().click().catch(() => {}); await page.locator('.reader .quality').first().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300);
  await shot('10-quality-panel.png', '.reader .quality');
  // sheet 05 (d p q r): distribution figures; sheet 07: Holling plot and the authored diorama's drawing
  await page.evaluate(id => { const m = window.__scriptorium.mode; const p = m.data.parts.find(x => x.id === id); m.reader && m.reader.close(); setTimeout(() => m.openPart(p, true), 600); }, ids[4]);
  await page.waitForFunction(t => document.querySelector('.reader h2') && /d · p · q · r/.test(document.querySelector('.reader h2').textContent), null, { timeout: 30000 }); await page.waitForTimeout(3000);
  const dist = await page.locator('.reader .fig-distribution').count();
  await page.locator('.reader .fig-distribution').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  await shot('11-reader-dpqr.png');
  await page.evaluate(id => { const m = window.__scriptorium.mode; const p = m.data.parts.find(x => x.id === id); m.reader && m.reader.close(); setTimeout(() => m.openPart(p, true), 600); }, ids[6]);
  await page.waitForFunction(() => document.querySelector('.reader h2') && /Functional responses/.test(document.querySelector('.reader h2').textContent), null, { timeout: 30000 });
  await page.locator('.reader .sketch-card').first().scrollIntoViewIfNeeded(); await page.waitForFunction(() => { const c = document.querySelector('.reader .sketch-card'); return c && (c.classList.contains('ready') || c.querySelector('.sketch-loading') && /Could not/.test(c.textContent)); }, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  const sketch = await page.evaluate(() => { const c = document.querySelector('.reader .sketch-card'); return c ? (c.classList.contains('ready') ? 'drawn' : c.textContent.slice(0, 80)) : 'none'; });
  await shot('12-reader-holling.png');
  readerOK = D.steps >= 9 && D.explainFigs >= 5 && D.code >= 5 && D.codeLines >= 10 && D.examples >= 2 && D.added >= 1 && D.picture >= 9 && D.mistake >= 9 && D.checkBefore === 0 && checkAfter === 1 && D.quality === 1 && !D.bad && !D.text && dist >= 6 && sketch === 'drawn';
  readerDetail = `sheet 01: ${D.steps} steps, ${D.explainFigs} paragraph figures, ${D.code} code steps (${D.codeLines} lines explained), ${D.examples} examples (${D.added} added from outside), ${D.picture} Picture-it and ${D.mistake} Common-mistake figures, check figures before/after reveal ${D.checkBefore}/${checkAfter}, ${D.pdfFigs} PDF figure(s), ${D.refs} link(s) instead of repeats${D.bad ? ', BAD FIGURES ' + D.bad : ''}${D.text ? ', text: ' + D.text : ''}; sheet 05: ${dist} distribution figures; sheet 07 diorama: ${sketch}`;
} catch (e) { readerDetail = 'error: ' + e.message.split('\n')[0]; }
report('reader', readerOK, readerDetail);

// ---- the authored Holling diorama runs
let dioOK = false, dioDetail = '';
try {
  const spec = FX['scene-holling'];
  await page.evaluate(s => window.__scriptorium.openDiorama(JSON.parse(JSON.stringify(s)), { skipIntro: true }), spec);
  await page.waitForFunction(() => { const m = window.__scriptorium.mode; return m && m.ds && m.stage === 'explore'; }, null, { timeout: 90000 });
  await page.waitForTimeout(5000);
  const D = await page.evaluate(() => { const m = window.__scriptorium.mode; return { actors: m.ds.actors.map(a => a.name), reads: (m.ds.readouts() || []).map(r => (r[0] || r.name) + '=' + (r[1] != null ? r[1] : r.value)).join('; '), t: +m.ds.t.toFixed(1) }; });
  await shot('13-diorama-holling.png');
  dioOK = D.actors.length >= 2 && D.t > 1;
  dioDetail = `actors: ${D.actors.join(', ')}; ran ${D.t} s; readouts: ${D.reads.slice(0, 140)}`;
} catch (e) { dioDetail = 'error: ' + e.message.split('\n')[0]; }
report('diorama', dioOK, dioDetail);

// ---- optional: the statistics tutorial (code boxes and captioned figures)
if (process.env.TEST_STATS) {
  const S = await page.evaluate(async () => { const I = window.__scriptorium.ingest, b = await (await fetch('/stats-tutorial.pdf')).blob(); const sp = await I.splitBook(b); const secs = []; for (const p of sp.parts) secs.push(...(await I.partSections(b, p)).sections); const figs = await I.extractFigures(b, 1, sp.pages); return { method: sp.method, parts: sp.parts.length, r: secs.filter(s => /```r\n/.test(s.text)).map(s => s.id), py: secs.filter(s => /```python\n/.test(s.text)).map(s => s.id), figs: figs.map(f => f.id + ':' + ((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])).toFixed(2)) }; }).catch(e => ({ error: e.message }));
  report('stats', S.method === 'outline' && S.r && S.r.length >= 3 && S.py.length >= 1 && S.figs.some(f => f.startsWith('fig-3-1')) && S.figs.every(f => +f.split(':')[1] <= .4), JSON.stringify(S).slice(0, 300));
}
report('errors', !errors.length, errors.length ? errors.slice(0, 5).join(' | ') : `none (${Math.round((Date.now() - T0) / 1000)} s)`);
console.log('stub calls: ' + Object.entries(R.calls.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).map(([k, v]) => k + '×' + v).join(' '));
await browser.close();
process.exit(failed ? 1 : 0);
