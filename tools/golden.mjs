#!/usr/bin/env node
// Scriptorium Memorialium — golden-image regression (node + playwright, headless Chromium, software WebGL).
// Renders a fixed, deterministic set of views and compares them with stored baselines (or with a second server) using
// a perceptual per-pixel difference (pixelmatch: YIQ colour distance + anti-aliasing detection). Writes an HTML report
// with the two images side by side and a diff image per view. See docs/qa/golden.md.
//
// RUN (serve the app first: ./serve.sh or python3 -m http.server 8000; dev deps once: npm install --prefix tools)
//   node tools/golden.mjs [url]                       render <url> and compare with tests/golden/<viewport>/<view>.png
//   node tools/golden.mjs [url] --update              render <url> and (re)write the baselines
//   node tools/golden.mjs --compare <baseUrl> <newUrl>  render both servers and compare them directly (before/after
//                                                     across branches: no stored baselines needed)
//   node tools/golden.mjs [url] --noise               render <url> twice in two fresh browsers and report the
//                                                     difference between the runs (the noise floor)
//   Options:  --only=regex      views whose id (viewport:view) matches
//             --viewports=desktop,phone   (default both; desktop 1440×900 DPR 1, phone = iPhone 13 390×664 DPR 3)
//             --out=dir         working folder (renders, diffs, state.json, report.html); default
//                               $GOLDEN_OUT or <tmp>/scriptorium-golden/<mode>
//             --fresh           forget finished views and render everything again (default: resume)
//             --quality=medium  graphics quality pinned for every render (low | medium | high)
//             --tol=0.004       allowed share of changed pixels per view (overrides the per-view values)
//             --budget=1500     stop cleanly after this many seconds (exit code 3: run the same command again to go on)
// RESUMABLE: every rendered view is written at once (<out>/<side>/<viewport>/<view>.png + state.json); a restarted
//   run skips views already rendered for that side, so a killed job loses at most the view in progress.
// DETERMINISM (all done by this tool; the app is not changed): Math.random is a seeded generator, re-seeded per view;
//   the app's frame loop is replaced by a fixed-step loop (dt = 1/60 s, adaptive resolution off, pinned quality and
//   pixel ratio); a diorama or a book room (its pedestal models run simulations) is held (dt = 0) until it is framed, then stepped a fixed number of steps; every view is
//   given a fixed camera; capture freezes the loop, steps a fixed number of settle frames by hand and screenshots the
//   last one with CSS animations, transitions, toasts and the caret disabled. Fresh browser context per viewport
//   (empty IndexedDB: the seed library, whose ids come from the seeded generator).
// EXIT CODE: 0 = every view within tolerance, 1 = differences, 2 = could not start, 3 = stopped by the budget.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(ROOT, 'tests/golden');
const argv = process.argv.slice(2), opt = k => { const a = argv.find(x => x === '--' + k || x.startsWith('--' + k + '=')); return a == null ? null : a.includes('=') ? a.split('=').slice(1).join('=') : true; };
const pos = argv.filter(a => !a.startsWith('--'));
const MODE = opt('compare') ? 'compare' : opt('update') ? 'update' : opt('noise') ? 'noise' : 'check';
const URLS = MODE === 'compare' ? [pos[0], pos[1]] : [pos[0] || process.env.GOLDEN_URL || 'http://localhost:8000/'];
if (MODE === 'compare' && !(URLS[0] && URLS[1])) { console.error('usage: node tools/golden.mjs --compare <baseUrl> <newUrl>'); process.exit(2); }
const ONLY = opt('only') && opt('only') !== true ? new RegExp(opt('only')) : null;
const VPS = String(opt('viewports') || 'desktop,phone').split(',');
const QUALITY = opt('quality') && opt('quality') !== true ? opt('quality') : 'medium';
const TOL = opt('tol') && opt('tol') !== true ? +opt('tol') : null;
const BUDGET = +(opt('budget') || 1500) * 1000, T0 = Date.now(), DEBUG = !!process.env.GOLDEN_DEBUG;
const OUT = opt('out') && opt('out') !== true ? opt('out') : process.env.GOLDEN_OUT || join(tmpdir(), 'scriptorium-golden', MODE);
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ dependencies (dev only, never loaded by the app)
const req = createRequire(join(ROOT, 'tools/noop.js'));
function need(name) {
  try { return req(name); } catch (e) { }
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(join(g, 'noop.js'))(name); } catch (e) { }
  return null;
}
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { }
  const p = need('playwright'); if (p) return p;
  console.error('playwright is not installed: npm i -g playwright && npx playwright install chromium'); process.exit(2);
}
const PNG = (need('pngjs') || {}).PNG;
let pixelmatch = need('pixelmatch'); if (pixelmatch && pixelmatch.default) pixelmatch = pixelmatch.default;
if (!PNG || !pixelmatch) { console.error('missing dev dependencies: npm install --prefix tools   (pixelmatch, pngjs)'); process.exit(2); }

// ------------------------------------------------------------------ the views
// steps: fixed-step updates after the view is framed (dt 1/60 s); tol: allowed share of changed pixels.
// cam: [position, target] in world metres (null: the view's own opening camera).
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 664 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' }   /* playwright devices['iPhone 13'], driven by Chromium */
};
const VIEWS = [
  { id: 'hub', kind: 'hub', steps: 30, tol: .004 },
  { id: 'hub-desk', kind: 'hub', cam: 'desk', steps: 30, tol: .004 },
  { id: 'hub-globe', kind: 'hub', cam: 'globe', steps: 30, tol: .004 },
  { id: 'bookcase', kind: 'hub', cam: 'bookcase', steps: 30, tol: .004 },
  { id: 'room', kind: 'room', book: 'Classical Mechanics', steps: 30, tol: .004 },
  { id: 'reader-fold1', kind: 'reader', book: 'Classical Mechanics', part: 0, unfold: false, steps: 10, tol: .004 },
  { id: 'reader-unfolded', kind: 'reader', book: 'Classical Mechanics', part: 0, unfold: true, steps: 10, tol: .004 },
  { id: 'dio-pendulum', kind: 'dio', spec: { type: 'pendulum' }, steps: 90, tol: .006 },
  { id: 'dio-galton', kind: 'dio', flag: 1, steps: 180, tol: .006 },
  { id: 'dio-osmosis', kind: 'dio', flag: 3, steps: 90, tol: .006 },
  { id: 'dio-water', kind: 'dio', flag: 0, steps: 60, tol: .006 }
];
const SETTLE = 3;   // hand-stepped, drawn frames after the view's steps (probe, AO and shadow maps settle); the last is the capture
const ITEMS = []; for (const vp of VPS) for (const v of VIEWS) { const id = vp + ':' + v.id; if (!ONLY || ONLY.test(id)) ITEMS.push({ id, vp, v }); }

// ------------------------------------------------------------------ state (resumable per view)
const STATE = join(OUT, 'state.json');
let state = { mode: MODE, urls: URLS, sides: {} };
if (existsSync(STATE) && !opt('fresh')) { try { const s = JSON.parse(readFileSync(STATE, 'utf8')); if (s.mode === MODE && JSON.stringify(s.urls) === JSON.stringify(URLS)) state = s; } catch (e) { } }
const saveState = () => { const t = STATE + '.tmp'; writeFileSync(t, JSON.stringify(state, null, 1)); renameSync(t, STATE); };
const SIDES = MODE === 'compare' ? [{ key: 'base', url: URLS[0] }, { key: 'new', url: URLS[1] }]
  : MODE === 'noise' ? [{ key: 'run1', url: URLS[0] }, { key: 'run2', url: URLS[0] }]
  : MODE === 'update' ? [{ key: 'baseline', url: URLS[0], dir: GOLDEN }] : [{ key: 'new', url: URLS[0] }];
const sidePath = (side, it) => join(side.dir || join(OUT, side.key), it.vp, it.v.id + '.png');

// ------------------------------------------------------------------ in-page code
// Runs before any app script: seeded Math.random (mulberry32), the hooks the harness drives.
const INIT = (quality) => {
  let s = 0x9e3779b9 >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = window.__golden = { seed(n) { s = n >>> 0; }, frozen: false, hold: false, n: 0 };
  try { localStorage.setItem('sm-gfx-quality', quality); localStorage.removeItem('sm-gfx-history'); } catch (e) { }
  addEventListener('unhandledrejection', e => console.error('Unhandled rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
  // one frame of the app, by hand: the body of App.loop with a fixed dt (dt 0 while a diorama is held); clock: whether
  // the app clock W.t moves (it stands still while a view opens, so time-driven motion and rate-limited refreshes depend
  // only on the fixed steps that follow, not on how many frames the opening took)
  G.frame = (dt, render, clock = true) => { const W = G.app; if (clock) W.t += 1 / 60; W.loopDt = 1 / 60; if (W.mode) { try { W.mode.update(dt, W.t); } catch (e) { console.warn(e); } } W.loopDt = 0; if (render) W.gfx.render(1 / 60, W.t); W.flushTrash(); };
  // the app's frame loop is replaced as soon as the app exists (main.js: window.__scriptorium = app, before boot()):
  // fixed steps, no adaptive resolution, and no drawing until a capture (a software-rendered frame of the hall takes
  // 10-15 s; every opening view is veiled anyway)
  let app = null;
  Object.defineProperty(window, '__scriptorium', { configurable: true, get: () => app, set(v) {
    app = G.app = v;
    v.loop = function () { requestAnimationFrame(() => v.loop()); if (G.frozen || v.gfx.lost) return; G.n++; G.frame(G.hold ? 0 : 1 / 60, false, false); };
    v.gfx.adapt = () => { }; v.gfx.dpr = Math.min(v.gfx.maxDpr, 1.5); v.gfx.resize();
  } });
};
const HARNESS = String.raw`
window.W = window.__scriptorium; const G = window.G = window.__golden, sleep = ms => new Promise(r => setTimeout(r, ms));
try { W.sfx.ambience = () => {}; W.sfx.play = () => {}; } catch (e) { }
G.settle = async () => { for (let k = 0; k < 600 && (W.switching || W.gfx.grade.uniforms.uFade.value > .001); k++) await sleep(50); };
G.cam = (p, t) => { const m = W.mode; m.controls.enableDamping = false; m.camera.position.set(...p); m.controls.target.set(...t); m.camera.lookAt(m.controls.target); m.controls.update(); };
// hub camera poses, from the room's real layout (furniture and bookcases are placed from the room size)
G.hubCam = which => {
  const H = W.mode, L = (o, x, y, z) => { o.updateMatrixWorld(true); return o.localToWorld(H.camera.position.clone().set(x, y, z)).toArray(); };
  const at = (o, p, t) => G.cam(L(o, ...p), L(o, ...t));   /* camera and target in the object's own frame */
  if (which === 'desk') return at(H.desk, [.22, 1.2, .88], [.5, .86, -.03]);
  if (which === 'globe') { const g = H.furn.children.find(o => o.name === 'globe' && o.visible); return at(g, [1.35, 1.45, 1.55], [0, .62, 0]); }
  if (which === 'bookcase') { const s = W.lib.shelves.find(x => x.name === 'Physics') || W.lib.shelves[0]; return at(H.shelfObjs.get(s.id), [0, 1.35, 1.9], [0, 1.15, 0]); }
  H.frameHero(); H.controls.enableDamping = false; H.controls.update();
};
G.open = async (v) => {
  G.seed(v.seed); G.hold = false; W.t = 1000;
  const say = m => { if (G.debug) console.log(v.id + ': ' + m + ' (frame ' + G.n + ')'); };
  say('open');
  if (v.kind === 'hub') { await W.openHub(); await G.settle(); }
  else if (v.kind === 'room' || v.kind === 'reader') { const b = W.lib.books.find(x => x.title === v.book); G.hold = true; await W.openRoom(b.id); await G.settle(); }   /* held: the pedestals' card models run their own simulations */
  else if (v.kind === 'dio') { let spec = v.spec; if (v.flag != null) { const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href); spec = FLAGSHIPS[v.flag]; }
    G.hold = true; await W.openDiorama(JSON.parse(JSON.stringify(spec)), { skipIntro: true, autoTransition: false }); await G.settle(); }
  // let the opening view finish its own moves (fixed steps of the loop), then take the loop over
  const f0 = G.n || 0; for (let k = 0; k < 2000 && (G.n || 0) - f0 < 40; k++) await sleep(30);
  G.frozen = true; await sleep(30); say('framed');
  if (v.kind === 'hub') G.hubCam(v.cam);
  if (v.kind === 'reader') { const R = W.mode, part = R.data.parts[v.part]; G.frozen = false; R.openPart(part, true); await sleep(1300);
    const rd = R.reader; if (v.unfold && rd.unfoldAll) rd.unfoldAll(); await sleep(400);
    await (window.MathJax && MathJax.startup && MathJax.startup.promise || Promise.resolve()); await sleep(300);
    const t0 = performance.now(); while (performance.now() - t0 < 6000 && rd.el.querySelector('.fig-host:empty')) await sleep(100);
    const sc = rd.el.querySelector('.reader-body') || rd.el; sc.scrollTop = 0; G.frozen = true; await sleep(30); }
  G.seed(v.seed + 1); G.hold = false; W.t = 1000;
  for (let k = 0; k < v.steps; k++) G.frame(1 / 60, false);
  return { t: W.t, mode: W.mode && W.mode.constructor.name, q: W.gfx.quality, dpr: W.gfx.dpr };
};
G.capture = () => { for (let k = 0; k < ${SETTLE}; k++) G.frame(1 / 60, true); return document.querySelectorAll('.fig-host:empty').length; };
`;
const CSS = '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; } .toast { display: none !important; }';
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ------------------------------------------------------------------ rendering one side
let pw = null;
async function renderSide(side) {
  const S = state.sides[side.key] || (state.sides[side.key] = {});
  const todo = ITEMS.filter(it => !(S[it.id] && S[it.id].ok && existsSync(sidePath(side, it))));
  if (!todo.length) return true;
  pw = pw || await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  try {
    for (const vp of VPS) {
      const list = todo.filter(it => it.vp === vp); if (!list.length) continue;
      let page = null, errors = [];
      const boot = async () => {
        if (page) { try { await page.context().close(); } catch (e) { } }
        const ctx = await browser.newContext({ ...VIEWPORTS[vp], reducedMotion: 'no-preference' }); page = await ctx.newPage(); errors = [];
        page.on('pageerror', e => errors.push('uncaught: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); if (DEBUG) console.log(`    [page ${((Date.now() - T0) / 1000).toFixed(0)} s] ${m.text().slice(0, 200)}`); });
        await page.addInitScript(INIT, QUALITY);
        await page.goto(side.url, { timeout: 180000, waitUntil: 'domcontentloaded' }); if (DEBUG) console.log('    page loaded');
        await page.waitForFunction(() => window.__scriptorium && window.__scriptorium.mode && document.body.classList.contains('ready'), null, { timeout: 300000 });
        await page.addStyleTag({ content: CSS }); await page.evaluate(HARNESS); if (DEBUG) console.log('    app ready ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
      };
      for (const it of list) {
        if (Date.now() - T0 > BUDGET) { console.log('budget reached: run the same command again to continue'); return false; }
        const t1 = Date.now(); let ok = false, info = null, err = '';
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            if (!page || attempt) await boot();
            info = await page.evaluate(v => { G.debug = v.debug; return G.open(v); }, { ...it.v, seed: hash(it.v.id), debug: DEBUG });
            if (DEBUG) console.log('    opened, capturing ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
            const empty = await page.evaluate(() => G.capture());
            const p = sidePath(side, it); mkdirSync(dirname(p), { recursive: true });
            const buf = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css', timeout: 600000 });
            writeFileSync(p, recompress(buf)); await page.evaluate(() => { __golden.frozen = false; });
            info.emptyFigures = empty; ok = true;
          } catch (e) { err = e.message.split('\n')[0]; console.log(`  ${it.id}: ${err} (attempt ${attempt + 1})`); }
        }
        S[it.id] = { ok, ms: Date.now() - t1, info, err: ok ? '' : err, errors: errors.splice(0).slice(0, 5) }; saveState();
        console.log(`${side.key.padEnd(8)} ${ok ? 'rendered' : 'FAILED  '} ${it.id.padEnd(24)} ${((Date.now() - t1) / 1000).toFixed(1)} s${S[it.id].errors.length ? '  page errors: ' + S[it.id].errors.length : ''}`);
      }
      try { await page.context().close(); } catch (e) { }
    }
  } finally { await browser.close(); }
  return true;
}
// smaller PNG files (max deflate), same pixels
function recompress(buf) { const img = PNG.sync.read(buf); return PNG.sync.write(img, { deflateLevel: 9, filterType: -1 }); }

// ------------------------------------------------------------------ comparing
function compare(aPath, bPath, diffPath, tol) {
  if (!existsSync(aPath)) return { status: 'missing-a' }; if (!existsSync(bPath)) return { status: 'missing-b' };
  const a = PNG.sync.read(readFileSync(aPath)), b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) return { status: 'size', what: `${a.width}×${a.height} vs ${b.width}×${b.height}` };
  const { width: w, height: h } = a, diff = new PNG({ width: w, height: h });
  // threshold .1: pixelmatch's YIQ distance (0–1) a pixel must exceed to count; anti-aliased edge pixels are not counted
  const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: .1, includeAA: false, alpha: .25, diffColor: [255, 0, 60], aaColor: [255, 210, 0] });
  // a second, stricter measure for the noise floor: mean absolute channel difference (0–255) and the largest
  let sum = 0, max = 0; for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[i + c] - b.data[i + c]); sum += d; if (d > max) max = d; }
  writeFileSync(diffPath, PNG.sync.write(diff, { deflateLevel: 6 }));
  const ratio = n / (w * h);
  return { status: ratio <= tol ? 'pass' : 'fail', pixels: n, ratio, mad: sum / (w * h * 3), max, w, h };
}

function report(rows, title) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rel = p => p ? relative(OUT, p).split('\\').join('/') : '';
  const body = rows.map(r => `<section class="${r.res.status}"><h2>${esc(r.id)} <span>${esc(r.res.status)}</span></h2>
<p>${r.res.ratio != null ? `changed pixels <b>${(r.res.ratio * 100).toFixed(3)} %</b> (${r.res.pixels}) · tolerance ${(r.tol * 100).toFixed(2)} % · mean |Δ| ${r.res.mad.toFixed(3)} · max |Δ| ${r.res.max}` : esc(r.res.what || '')}</p>
<div class="row"><figure><img loading="lazy" src="${rel(r.a)}"><figcaption>${esc(r.la)}</figcaption></figure><figure><img loading="lazy" src="${rel(r.b)}"><figcaption>${esc(r.lb)}</figcaption></figure>${r.res.ratio != null ? `<figure><img loading="lazy" src="${rel(r.d)}"><figcaption>diff (red: changed, yellow: anti-aliasing)</figcaption></figure>` : ''}</div></section>`).join('\n');
  const pass = rows.filter(r => r.res.status === 'pass').length;
  const html = `<!doctype html><meta charset="utf-8"><title>Golden images</title><style>
:root{--bg:#f6f2ea;--fg:#2a2118;--mut:#6d6255;--ok:#2f7a4a;--bad:#b3261e;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#16130f;--fg:#ece4d6;--mut:#a59a8a;--ok:#6fcf8f;--bad:#ff8a80;--card:#221d17}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px 24px}h1{font-size:22px}h2{font-size:16px;margin:0 0 4px}
h2 span{font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:9px;margin-left:8px}
.pass h2 span{background:var(--ok);color:var(--bg)}.fail h2 span,.size h2 span,[class^=missing] h2 span{background:var(--bad);color:var(--bg)}
section{background:var(--card);border-radius:10px;padding:12px 14px;margin:14px 0}p{margin:2px 0 10px;color:var(--mut)}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}figure{margin:0}img{width:100%;height:auto;display:block;border-radius:4px;background:#000}
figcaption{font-size:12px;color:var(--mut);margin-top:4px;word-break:break-all}</style>
<h1>${esc(title)}</h1><p>${pass} of ${rows.length} views within tolerance · ${new Date().toISOString()}</p>${body}`;
  const p = join(OUT, 'report.html'); writeFileSync(p, html); return p;
}

// ------------------------------------------------------------------ main
for (const side of SIDES) { const done = await renderSide(side); if (!done) process.exit(3); }
if (MODE === 'update') {
  let total = 0; for (const it of ITEMS) { const p = sidePath(SIDES[0], it); if (existsSync(p)) total += statSync(p).size; }
  const bad = ITEMS.filter(it => !(state.sides.baseline[it.id] || {}).ok);
  console.log(`baselines written to ${relative(ROOT, GOLDEN)}/ (${ITEMS.length - bad.length} views, ${(total / 1048576).toFixed(2)} MB)`); process.exit(bad.length ? 1 : 0);
}
const rows = [];
for (const it of ITEMS) {
  const [A, B] = MODE === 'check' ? [{ path: join(GOLDEN, it.vp, it.v.id + '.png'), label: 'baseline (tests/golden)' }, { path: sidePath(SIDES[0], it), label: URLS[0] }]
    : [{ path: sidePath(SIDES[0], it), label: SIDES[0].key + ': ' + SIDES[0].url }, { path: sidePath(SIDES[1], it), label: SIDES[1].key + ': ' + SIDES[1].url }];
  const dDir = join(OUT, 'diff', it.vp); mkdirSync(dDir, { recursive: true });
  let a = A.path; if (MODE === 'check' && existsSync(a)) { const c = join(OUT, 'baseline', it.vp, it.v.id + '.png'); mkdirSync(dirname(c), { recursive: true }); copyFileSync(a, c); a = c; }
  const tol = TOL != null ? TOL : it.v.tol, d = join(dDir, it.v.id + '.png');
  const res = compare(a, B.path, d, tol); rows.push({ id: it.id, a, b: B.path, d, la: A.label, lb: B.label, res, tol });
  console.log(`${res.status.padEnd(9)} ${it.id.padEnd(24)} ${res.ratio != null ? `${(res.ratio * 100).toFixed(4)} % changed (tol ${(tol * 100).toFixed(2)} %), mean |Δ| ${res.mad.toFixed(3)}, max |Δ| ${res.max}` : res.what || ''}`);
}
const summary = { mode: MODE, urls: URLS, quality: QUALITY, at: new Date().toISOString(), rows: rows.map(r => ({ id: r.id, ...r.res, tol: r.tol })) };
writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 1));
if (MODE === 'noise') { const worst = Math.max(0, ...rows.map(r => r.res.ratio || 0)), mad = Math.max(0, ...rows.map(r => r.res.mad || 0)); console.log(`noise floor: worst view ${(worst * 100).toFixed(4)} % changed pixels, worst mean |Δ| ${mad.toFixed(3)}`); }
const rp = report(rows, MODE === 'compare' ? `Golden images: ${URLS[0]} → ${URLS[1]}` : MODE === 'noise' ? `Golden images: noise floor (two runs of ${URLS[0]})` : `Golden images: ${URLS[0]} vs baselines`);
console.log('report: ' + rp);
process.exit(rows.every(r => r.res.status === 'pass') ? 0 : 1);
