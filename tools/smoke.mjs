#!/usr/bin/env node
// Scriptorium Memorium — smoke test (node + playwright, headless Chromium).
//
// RUN
//   1. Serve the app:            ./serve.sh            (or: python3 -m http.server 8000 in the project folder)
//   2. Install playwright once:  npm i -g playwright && npx playwright install chromium
//   3. Run:                      node tools/smoke.mjs [url]          default url: http://localhost:8000/
//      Options (environment):    SMOKE_OUT=dir      save the two canvas captures (PNG) there
//                                SMOKE_SLOW=1       also open every built-in model type with the drawing → real transition
//                                SMOKE_HEADED=1     show the browser window
//   The page loads three.js, MathJax and pdf.js from their CDNs, so the machine needs network access (or a page whose
//   import map points at local copies). A software GPU (SwiftShader) is used when there is no real one. A full run
//   takes about 3 minutes on a machine with a GPU and 10–15 minutes with software rendering (rendering stays paused
//   during the logic checks, but every scroll drawing and diorama still renders on the CPU); SMOKE_SLOW=1 adds more.
//
// WHAT IT CHECKS (each is one line of the report; any failure → exit code 1)
//   boot         fresh profile (empty IndexedDB) reaches the library hub with the eight seeded books
//   rooms        every seeded book room opens; every scroll opens in the reader with steps, its 2D diagrams draw
//                without errors and its scroll drawings render (or fall back to a reference)
//   dioramas     every pedestal diorama, the four flagship scenes and every built-in model type open and run 2 s
//   lessons      the first lesson of a few dioramas completes (cinematic on and off) with finite readouts
//   intro        one diorama runs the drawing → real transition to the explore stage
//   edit         edit mode: select an object, move it, undo (Ctrl+Z), hide, add an object, remove it
//   hub          arrange the library: add / rotate / retype / delete a bookcase
//   import       examples/room-example.json imports as a new book and its room opens
//   link         the address names the place (#room=…, &scroll=… with the reader open, none in the hall); the hall's door
//                knows the room visited last
//   delete       a scroll is deleted from its shelf after the app's own confirm, comes back with Undo, and once deleted
//                for real its room leaves storage
//   ui           no "NaN", "undefined" or "[object Object]" in any visible text
//   leaks        3 cycles hub → room → diorama → room → hub: GPU geometries/textures and DOM nodes stay flat
//   context      WebGL context loss and restore: the app pauses, comes back and keeps running
//   captures     two canvas captures (hub, diorama) are not blank (taken once any fade or cut dip has finished)
//   errors       no uncaught exceptions, unhandled promise rejections or console errors during the run
//   polish       node tools/polish.mjs --quick (its own browser): one view per area — hub, a room, a scroll unfolded,
//                a diorama lesson with Guides on and off, the Add-PDF steps — free of overlaps, a label far from its
//                arrow, clipped text, raw notation, italic units, legends over data, off-screen HUD and colour faults
//                (SMOKE_POLISH=0 skips it; the full gate is node tools/polish.mjs, see its header)
// EXIT CODE: 0 = all checks passed, 1 = at least one failed, 2 = could not start (no server / no playwright).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL0 = process.argv[2] || process.env.SMOKE_URL || 'http://localhost:8000/';
const OUT = process.env.SMOKE_OUT || '';
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { }
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(join(g, 'noop.js'))('playwright'); } catch (e) { }
  console.error('playwright is not installed: npm i -g playwright && npx playwright install chromium'); process.exit(2);
}

const results = []; let failed = 0;
const report = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${detail}`); };

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: !process.env.SMOKE_HEADED, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();   // a new context = empty IndexedDB / localStorage
const errors = [];
await page.addInitScript(() => { addEventListener('unhandledrejection', e => console.error('Unhandled rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason))); });
page.on('pageerror', e => errors.push('uncaught: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
const T0 = Date.now();
try { await page.goto(URL0, { timeout: 60000 }); } catch (e) { console.error('Cannot open ' + URL0 + ' — is the server running? ' + e.message); await browser.close(); process.exit(2); }

// helpers installed in the page: W = the app; freeze() pauses drawing (logic keeps running); pump() drives a diorama by hand
const HELPERS = `
  window.W = window.__scriptorium; const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.S = {
    sleep,
    frames: n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }),
    freeze(on) { const g = W.gfx; if (!g._realRender) g._realRender = g.render.bind(g); g.render = on ? () => {} : g._realRender; },
    book: t => W.lib.books.find(b => b.title === t),
    bad(root = document.body) { const m = (root.innerText || '').match(/.{0,30}(\\bNaN\\b|\\bundefined\\b|\\[object Object\\]).{0,30}/g); return m ? m.slice(0, 3) : null; },
    pump(v, secs, until) { let T = W.t; for (let k = 0; k < secs / .05; k++) { T += .05; v.update(.05, T); if (until && until()) { W.t = T; return k * .05; } } W.t = T; return null; },
    mem() { const r = W.gfx.renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures - (W.gfx.cachedTextures ? W.gfx.cachedTextures() : 0), progs: r.info.programs.length, dom: document.getElementsByTagName('*').length }; },
    capture(name) { const g = W.gfx; (g._realRender || g.render.bind(g))(1 / 60, W.t); const c = g.canvas, url = c.toDataURL('image/png'); const s = document.createElement('canvas'); s.width = 64; s.height = 40; const x = s.getContext('2d'); x.drawImage(c, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data; let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, l); mx = Math.max(mx, l); } return { name, url, range: mx - mn }; }
  };`;
const run = async (fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { return { __error: e.message.split('\n')[0] }; } };
const failMsg = v => v && v.__error ? 'error: ' + v.__error : '';

// ---- boot
// 'ready' (the page veil lifting) now waits for the hall's final look: its probe, compiled programs and settled frames,
// which takes minutes on a busy software GPU
const booted = await page.waitForFunction(() => window.__scriptorium && window.__scriptorium.mode && document.body.classList.contains('ready'), null, { timeout: 600000 }).then(() => true, () => false);
await page.evaluate(HELPERS).catch(() => { });
const boot = booted ? await run(() => ({ mode: W.mode.constructor.name, books: W.lib.books.length, ms: Math.round(performance.now()) })) : null;
report('boot', !!boot && boot.mode === 'Hub' && boot.books >= 8, boot ? `${boot.mode}, ${boot.books} books, ready after ${boot.ms} ms` : 'the hub never appeared');
if (!boot) { console.log(errors.slice(0, 10).join('\n')); await browser.close(); process.exit(1); }
const capHub = await run(() => S.capture('hub'));
await run(() => S.freeze(true));

// ---- rooms and readers
const rooms = await run(async () => {
  const out = [], bad = [];
  for (const b of W.lib.books.slice()) {
    await W.openRoom(b.id); const R = W.mode; if (R.constructor.name !== 'BookRoom') { bad.push(b.title + ': room did not open'); continue; }
    for (const st of R.stations.values()) {
      R.openPart(st.part, true); const rd = R.reader; await S.sleep(60);
      if (st.part.analysis && !rd.el.querySelectorAll('.step').length) bad.push(st.part.title + ': no steps');
      for (const btn of rd.el.querySelectorAll('.demo-btn.svg')) { btn.click(); const e = btn.parentElement.querySelector('.svg-slot .err'); if (e) bad.push(st.part.title + ' / ' + btn.textContent + ': ' + e.textContent); btn.click(); }
      const t0 = performance.now(); while (performance.now() - t0 < 30000 && rd.el.querySelector('.sketch-card:not(.ready) .sketch-loading') && ![...rd.el.querySelectorAll('.sketch-loading')].some(x => /Could not/.test(x.textContent))) await S.sleep(100);
      [...rd.el.querySelectorAll('.sketch-loading')].filter(x => /Could not/.test(x.textContent)).forEach(x => bad.push(st.part.title + ': ' + x.textContent));
      const u = S.bad(rd.el); if (u) bad.push(st.part.title + ' text: ' + u.join(' | '));
      out.push(st.part.title); rd.close(); await S.sleep(20);
    }
  }
  return { n: out.length, bad };
});
report('rooms', !rooms.__error && !rooms.bad.length, rooms.__error ? failMsg(rooms) : `${rooms.n} scrolls read` + (rooms.bad.length ? ' — ' + rooms.bad.slice(0, 4).join('; ') : ''));

// ---- dioramas: pedestals, flagships, every built-in model type
const dios = await run(async (slow) => {
  const { DIO } = await import(new URL('js/dio/models.js', location.href).href); const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href);
  const specs = [];
  for (const b of W.lib.books) { const r = await W.loadRoom(b.id); for (const p of r.parts || []) { const ch = (p.analysis && p.analysis.chain) || []; const s = p.pedestal ? ch.find(x => x.id === p.pedestal.step) : ch.find(x => (x.demos || []).some(d => d.bodies || DIO[d.type])); const d = s && (s.demos || [])[p.pedestal ? p.pedestal.demo : 0]; if (d && (d.bodies || DIO[d.type])) specs.push(['pedestal: ' + p.title, d]); } }
  FLAGSHIPS.forEach(f => specs.push(['flagship: ' + f.title, f])); Object.keys(DIO).filter(t => t !== 'custom3d').forEach(t => specs.push(['model: ' + t, { type: t }]));   // custom3d needs AI-written code
  const bad = [];
  for (const [name, spec] of specs) {
    try {
      await W.openDiorama(JSON.parse(JSON.stringify(spec)), { skipIntro: !slow || !name.startsWith('model'), autoTransition: false, title: name });
      const v = W.mode; if (v.constructor.name !== 'DioramaView') { bad.push(name + ': did not open'); continue; }
      if (slow && v.stage === 'sketch') { v.transition(); S.pump(v, 8); }
      S.pump(v, 2); const rd = v.ds.readouts().filter(([, x]) => /NaN|undefined|Infinity/.test(String(x))); if (rd.length) bad.push(name + ' readouts: ' + rd.map(r => r.join('=')).join(', '));
      const u = S.bad(v.ui); if (u) bad.push(name + ' text: ' + u.join(' | '));
    } catch (e) { bad.push(name + ': ' + e.message); }
  }
  return { n: specs.length, bad };
}, !!process.env.SMOKE_SLOW);
report('dioramas', !dios.__error && !dios.bad.length, dios.__error ? failMsg(dios) : `${dios.n} opened and run` + (dios.bad.length ? ' — ' + dios.bad.slice(0, 4).join('; ') : ''));

// ---- lessons (cinematic on and off)
const lessons = await run(async () => {
  const out = [], bad = [];
  for (const [spec, cine] of [[{ type: 'pendulum' }, true], [{ type: 'pendulum' }, false], [{ type: 'weatherglass' }, true], [{ type: 'collision' }, false]]) {
    await W.openDiorama(spec, { skipIntro: true }); const v = W.mode; v.setPref('cinematic', cine);
    v.setPref('guides', true); v.runLesson(0); const took = S.pump(v, 90, () => v.running == null);
    if (took == null) bad.push(spec.type + (cine ? ' cinematic' : '') + ': lesson 1 never completed'); else out.push(spec.type + (cine ? '·cine ' : ' ') + took.toFixed(0) + 's');
    { const vw = innerWidth * innerHeight, vis = e => { let r = e.getBoundingClientRect(), L = Math.max(0, r.left), T = Math.max(0, r.top), R = Math.min(innerWidth, r.right), B = Math.min(innerHeight, r.bottom); for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if (o === 'auto' || o === 'scroll' || o === 'hidden') { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } } return Math.max(0, R - L) * Math.max(0, B - T); }, cover = [...document.querySelectorAll('#ui *')].filter(e => { return vis(e) > vw * .5 && getComputedStyle(e).pointerEvents !== 'none' && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); }); if (cover.length) bad.push(spec.type + ': a full-screen layer takes the clicks after the step (' + cover.map(e => e.tagName + '.' + (e.getAttribute('class') || '')).slice(0, 2).join(', ') + ')'); }   /* the .ops layer once covered the steps and the camera */
    v.setPref('guides', false);
  }
  W.mode.setPref('cinematic', true);
  return { out, bad };
});
report('lessons', !lessons.__error && !lessons.bad.length, lessons.__error ? failMsg(lessons) : lessons.out.join(', ') + (lessons.bad.length ? ' — ' + lessons.bad.join('; ') : ''));

// ---- the drawing → real transition, POV
const intro = await run(async () => {
  await W.openDiorama({ type: 'spring' }, { title: 'intro' }); const v = W.mode; const s0 = v.stage; v.transition(); S.pump(v, 8);
  for (let i = 0; i < 12 && v.stage === 'tour'; i++) { v.next(); S.pump(v, 2); }
  const A = v.ds.actors; if (A.length) { v.setPOV(A[0]); S.pump(v, 1); v.exitPOV(); }
  return { s0, s1: v.stage };
});
report('intro', !intro.__error && intro.s0 === 'sketch' && intro.s1 === 'explore', intro.__error ? failMsg(intro) : `${intro.s0} → ${intro.s1}, POV in and out`);

// ---- edit mode
const edit = await run(async () => {
  const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href);
  await W.openDiorama(JSON.parse(JSON.stringify(FLAGSHIPS[1])), { skipIntro: true, onSave: () => { } }); const v = W.mode;
  v.toggleEdit(true); const o = v.ds.world.children.find(c => !c.isLight && !c.userData.isInk); if (!o) return { noObject: false }; v.select(o);
  const p0 = o.position.clone(); v.pushUndo({ kind: 'transform', o, path: v.ds.pathOf(o), p: p0.clone(), r: o.rotation.clone(), s: o.scale.clone() }); o.position.x += 1; v.commitTransform();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); const back = v.sel.position.distanceTo(p0) < 1e-6;
  v.editAction('hide'); const hidden = !v.sel.visible; v.editAction('hide');
  // an added object goes into spec.bodies (scene specs) or spec.additions (built-in models)
  const mine = () => [...v.ds.world.children, ...v.ds.extras.children].filter(c => String(c.userData.bodyId || '').startsWith('add-') || c.userData.added);
  const n0 = mine().length; v.addObjectDialog(); document.querySelector('.modal-veil .btn.primary').click(); const added = mine().length === n0 + 1;
  if (added) { v.select(mine()[n0]); v.editAction('remove'); } const removed = mine().length === n0;
  const k = Object.keys(v.ds.ranges)[0]; let slid = true; if (k) { const inp = document.getElementById('dp-' + k); inp.value = +inp.min + (inp.max - inp.min) * .7; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change')); S.pump(v, .2); slid = Math.abs(v.ds.p[k] - +inp.value) < 1e-6; }
  v.toggleEdit(false); return { back, hidden, added, removed, slid };
});
report('edit', !edit.__error && Object.values(edit).every(Boolean), edit.__error ? failMsg(edit) : JSON.stringify(edit));

// ---- hub: arrange the library
const hub = await run(async () => {
  await W.openHub(); const H = W.mode; const n0 = W.lib.shelves.length; H.toggleBuild(true);
  H.addShelf('horizontal'); await S.sleep(50); const box = document.querySelector('.modal-veil'); if (box) { box.querySelector('input').value = 'Smoke test shelf'; box.querySelector('.btn.primary').click(); } await S.sleep(20);
  const s = W.lib.shelves[W.lib.shelves.length - 1]; const r0 = s.rot; H.selectShelf(s.id);
  [...H.buildPanel.querySelectorAll('button')].find(b => b.textContent === '⟲ 90°').click(); const rotated = Math.abs(s.rot - r0 - Math.PI / 2) < 1e-6;
  [...H.buildPanel.querySelectorAll('button')].find(b => /Make vertical/.test(b.textContent)).click(); const retyped = s.kind === 'vertical';
  await H.deleteShelf(s.id); H.toggleBuild(false);
  return { added: s.name === 'Smoke test shelf', rotated, retyped, deleted: W.lib.shelves.length === n0 };
});
report('hub', !hub.__error && Object.values(hub).every(Boolean), hub.__error ? failMsg(hub) : JSON.stringify(hub));

// ---- import a room file
const roomJSON = JSON.parse(readFileSync(join(ROOT, 'examples/room-example.json'), 'utf8')); roomJSON.book.title = 'Smoke import';
const imp = await run(async j => { const n0 = W.lib.books.length; await W.importJSON(j); const b = W.lib.books.find(x => x.title === 'Smoke import'); if (!b) return { ok: false }; await W.openRoom(b.id); const ok = W.mode.constructor.name === 'BookRoom' && W.mode.stations.size > 0; await W.openHub(); return { ok, added: W.lib.books.length - n0 }; }, roomJSON);
report('import', !imp.__error && imp.ok && imp.added === 1, imp.__error ? failMsg(imp) : `room-example.json → ${imp.added} book`);

// ---- the address names the place: #room=<id>, then &scroll=<id> with the reader open; the hall has none
const link = await run(async () => {
  const b = S.book('Classical Mechanics'); await W.openRoom(b.id); const h1 = location.hash, R = W.mode, p = [...R.stations.values()][0].part;
  R.openPart(p, true); await S.sleep(50); const h2 = location.hash; R.reader && R.reader.close(); await S.sleep(20); const h3 = location.hash;
  await W.openHub(); await W._sw;
  return { room: h1 === '#room=' + encodeURIComponent(b.id), scroll: h2 === h1 + '&scroll=' + encodeURIComponent(p.id), closed: h3 === h1, hall: location.hash === '', door: !!W.mode.doorPick && !!W.mode.lastRoom() && W.mode.lastRoom().book.id === b.id };
});
report('link', !link.__error && Object.values(link).every(Boolean), link.__error ? failMsg(link) : JSON.stringify(link));

// ---- delete a scroll from its shelf: the app's own confirm, undo, then for real (its room leaves storage)
const del = await run(async () => {
  const H = W.mode, b = S.book('Smoke import'); if (!b) return { noBook: true };
  const asked = H.deleteScroll(b.id); await S.sleep(30); const dlg = document.querySelector('.modal-veil [role=alertdialog]'); if (!dlg) return { dialog: false };
  dlg.querySelector('.btn.danger').click(); await asked;
  const gone = !W.lib.books.includes(b) && !H.scrollObjs.has(b.id), undo = [...document.querySelectorAll('.toast.act .toast-btn')].pop();
  if (undo) undo.click(); const back = W.lib.books.some(x => x.id === b.id) && H.scrollObjs.has(b.id);
  const again = H.deleteScroll(b.id); await S.sleep(30); document.querySelector('.modal-veil .btn.danger').click(); await again;
  await W.purgeBook(b.id); const left = (await W.store.keys()).filter(k => String(k).includes(b.id));
  return { dialog: true, gone, undo: !!undo, back, purged: !left.length && !W.lib.books.some(x => x.id === b.id) };
});
report('delete', !del.__error && Object.values(del).every(Boolean), del.__error ? failMsg(del) : JSON.stringify(del));

// ---- visible text
const ui = await run(() => S.bad());
report('ui', !ui || !ui.__error && !ui.length, ui && !ui.__error ? ui.join(' | ') : failMsg(ui));

// ---- leaks: three full cycles with drawing on (GPU resources are only created when drawn); a small canvas keeps a
// software GPU quick
await page.setViewportSize({ width: 480, height: 320 }); await run(() => S.freeze(false));
const leaks = await run(async () => {
  const b = S.book('Classical Mechanics'), m = [];
  for (let i = 0; i < 3; i++) {
    await W.openRoom(b.id); await S.frames(4); const st = [...W.mode.stations.values()].find(s => s.spec);
    await W.openDiorama(JSON.parse(JSON.stringify(st.spec.d)), { skipIntro: true, returnTo: { room: b.id } }); await S.frames(4);
    W.mode.exit(); await S.sleep(50); await W._sw; await S.frames(4); await W.openHub(); await S.frames(8); m.push(S.mem());
  }
  return m;
});
const lk = !leaks.__error && leaks.length === 3 ? { geo: leaks[2].geo - leaks[0].geo, tex: leaks[2].tex - leaks[0].tex, dom: leaks[2].dom - leaks[0].dom } : null;
report('leaks', !!lk && lk.geo <= 4 && lk.tex <= 2 && lk.dom <= 10, lk ? `cycle 1 → 3: geometries ${lk.geo >= 0 ? '+' : ''}${lk.geo}, textures ${lk.tex >= 0 ? '+' : ''}${lk.tex}, DOM ${lk.dom >= 0 ? '+' : ''}${lk.dom} (${JSON.stringify(leaks[2])})` : failMsg(leaks));

// ---- WebGL context loss and restore
const ctx = await run(async () => {
  const gl = W.gfx.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { skipped: true };
  ext.loseContext(); await S.sleep(300); const paused = W.gfx.lost === true && !!document.getElementById('gl-lost');
  ext.restoreContext(); await S.sleep(300); await W._sw; await S.frames(4);
  return { paused, back: !W.gfx.lost && !document.getElementById('gl-lost'), mode: W.mode && W.mode.constructor.name };
});
report('context', !ctx.__error && (ctx.skipped || (ctx.paused && ctx.back && ctx.mode === 'Hub')), ctx.__error ? failMsg(ctx) : JSON.stringify(ctx));

// ---- canvas captures
await page.setViewportSize({ width: 960, height: 600 });
const capDio = await run(async () => { const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href); await W.openDiorama(JSON.parse(JSON.stringify(FLAGSHIPS[0])), { skipIntro: true }); for (let k = 0; k < 60 && (W.gfx.grade.uniforms.uFade.value > .02 || (W.mode.dir && W.mode.dir.dip)); k++) await S.frames(1); await S.frames(3); return S.capture('diorama'); });   // (a cut still dipping through dark is a transition, not the view: wait for it, at most 60 frames)
const caps = [capHub, capDio].filter(c => c && !c.__error);
if (OUT) { mkdirSync(OUT, { recursive: true }); caps.forEach(c => writeFileSync(join(OUT, 'smoke-' + c.name + '.png'), Buffer.from(c.url.split(',')[1], 'base64'))); }
report('captures', caps.length === 2 && caps.every(c => c.range > 30), caps.map(c => `${c.name} contrast ${c.range}`).join(', ') + (OUT ? ` → ${OUT}` : ''));

// ---- errors over the whole run
const errs = errors.filter(e => !/GL Driver Message|KHR_parallel_shader_compile|favicon/.test(e));
report('errors', !errs.length, errs.length ? `${errs.length}: ` + errs.slice(0, 5).join(' || ') : 'none');

await browser.close();

// ---- the polish gate, quick mode (a separate process: its own fresh browser profile)
if (process.env.SMOKE_POLISH !== '0') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/polish.mjs'), URL0, '--quick', '--budget=900'], { encoding: 'utf8', timeout: 20 * 60000, env: { ...process.env, POLISH_OUT: process.env.POLISH_OUT || join(OUT || '/tmp', 'polish-quick') } });
  const lines = String(r.stdout || '').trim().split('\n'), last = lines[lines.length - 1] || String(r.stderr || '').trim().split('\n').pop() || 'no output';
  report('polish', r.status === 0, last.replace(/^polish: /, '') + (r.status ? ' — ' + lines.filter(l => /^FAIL/.test(l)).slice(0, 3).join(' || ') : ''));
}
console.log(`\n${results.length - failed}/${results.length} checks passed in ${((Date.now() - T0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
