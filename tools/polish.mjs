#!/usr/bin/env node
// Scriptorium Memorium — polish gate (node + playwright, headless Chromium). Catches the visual leftovers a smoke test
// does not: labels on top of each other, a guide label far from its arrow, clipped text, raw notation, italic units,
// chart legends over data, elements off screen, and washed-out or over-saturated views.
//
// RUN
//   1. Serve the app (./serve.sh, or python3 -m http.server 8000 in the project folder).
//   2. node tools/polish.mjs [url] [options]                 default url: http://localhost:8000/
//      --quick        one view per area, desktop only (≈ 2–4 min with software rendering); used by tools/smoke.mjs
//      --views=desktop,phone   which viewports (desktop 1280×720, phone = iPhone 13 at device scale 1)
//      --only=regex   only the items whose id matches
//      --budget=420   stop cleanly after this many seconds (exit code 3: run again to continue)
//      --reset        forget earlier results and start over (a --quick run always starts over unless --resume)
//      --resume       (with --quick) keep earlier quick results
//      --redo=regex   walk the matching finished items again;  --redo-failed: walk again every item with findings
//      --no-report    do not write docs/qa/polish-report.md
//   Environment: POLISH_OUT=dir (state.json, results.json, failure screenshots; default <tmp>/scriptorium-polish),
//                POLISH_REPORT=path (default docs/qa/polish-report.md; the quick run writes no report).
//
// RESUMABLE: the item list is fixed on the first run and every finished item is written to <out>/state.json at once;
// a restarted run skips the items already done, so a killed job never loses finished work. Each item is small
// (one view, one scroll, one diorama in one viewport) and the run stops by itself before --budget runs out.
//
// WHAT IS WALKED (each viewport)
//   hub          the library's default view
//   room:<book>  one book room's overview
//   reader:...   every seeded scroll (and the BYU fixture chains, imported as a room) with every fold unfolded
//   dio:...      every built-in model and each flagship scene: every lesson's beats with Guides on and off, the DOM
//                sampled once per beat (and once per chain step)
//   addpdf       the Add-PDF dialog, every step (a generated three-page PDF)
//
// CHECKS (each failure: selector, rects, screenshot path)
//   a overlap    two visible HUD / text boxes (labels, pins, guide labels, badges, chips, callouts, readouts, panels,
//                buttons, inset, time bar, sheets) overlap by more than 2 px both ways (ALLOW lists intended layering)
//   b arrow      a guide label more than 28 px from its own arrow
//   c clip       text cut off by its box (scroll size > client size with overflow hidden / ellipsis without a tooltip)
//   d notation   raw notation in visible text (* as multiplication, ^, sqrt(, <=, ->, _{, $…$ outside MathJax) and
//                italic units (a unit after a number set in italics, in HTML or SVG)
//   e figure     an SVG figure's legend over its data marks, or text outside its viewBox
//   f offscreen  a HUD element that should be visible extends past the viewport
//   g colour     saturation of the hub / room views (Σ(max − min) / Σ max over the frame) outside [0.06, 0.45], or
//                near-white blow-outs (all channels > 97.5 %) on > 2 % of the frame
// EXIT CODE: 0 = clean, 1 = failures, 2 = could not start, 3 = stopped by the budget before every item was done.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), opt = k => { const a = argv.find(x => x === '--' + k || x.startsWith('--' + k + '=')); return a == null ? null : a.includes('=') ? a.split('=').slice(1).join('=') : true; };
const URL0 = argv.find(a => !a.startsWith('--')) || process.env.POLISH_URL || 'http://localhost:8000/';
const QUICK = !!opt('quick'), BUDGET = +(opt('budget') || 420) * 1000, ONLY = opt('only') ? new RegExp(opt('only')) : null;
const VIEWS = String(opt('views') || (QUICK ? 'desktop' : 'desktop,phone')).split(',');
const OUT = process.env.POLISH_OUT || join(tmpdir(), 'scriptorium-polish'); mkdirSync(OUT, { recursive: true });
const STATE = join(OUT, QUICK ? 'state-quick.json' : 'state.json'), REPORT = process.env.POLISH_REPORT || join(ROOT, 'docs/qa/polish-report.md');
const T0 = Date.now(), VERSION = 3;

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { }
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(join(g, 'noop.js'))('playwright'); } catch (e) { }
  console.error('playwright is not installed: npm i -g playwright && npx playwright install chromium'); process.exit(2);
}
// state: written atomically after every item
let state = { version: VERSION, url: URL0, items: null, done: {} };
if (existsSync(STATE) && !opt('reset') && !(QUICK && !opt('resume'))) { try { const s = JSON.parse(readFileSync(STATE, 'utf8')); if (s.version === VERSION) state = s; } catch (e) { } }
// --redo=regex: walk those finished items again; --redo-failed: walk again every item that had findings
if (opt('redo') && opt('redo') !== true) { const re = new RegExp(opt('redo')); Object.keys(state.done).forEach(k => { if (re.test(k)) delete state.done[k]; }); }
if (opt('redo-failed')) Object.keys(state.done).forEach(k => { if (state.done[k].issues.some(x => !x.justified)) delete state.done[k]; });
const saveState = () => { const tmp = STATE + '.tmp'; writeFileSync(tmp, JSON.stringify(state, null, 1)); renameSync(tmp, STATE); };

// a small valid PDF (three pages, numbered headings) for the Add-PDF walk, written on the fly
function tinyPDF() {
  const pages = [['1 Motion', 'Speed is distance over time.'], ['2 Forces', 'A force changes motion.'], ['3 Energy', 'Energy is conserved.']];
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach(([h, t]) => { const s = `BT /F1 20 Tf 72 700 Td (${h}) Tj ET BT /F1 12 Tf 72 670 Td (${t}) Tj ET`; objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length + 2} 0 R >>`, `<< /Length ${s.length} >>\nstream\n${s}\nendstream`); });
  let out = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------------------------------------------------------------- in-page helpers and checks
const HELPERS = String.raw`
window.W = window.__scriptorium; const sleep = ms => new Promise(r => setTimeout(r, ms));
window.S = {
  sleep,
  stop() { if (W._polishStopped) return; W._polishStopped = true; W.loop = function () { requestAnimationFrame(() => W.loop()); }; },
  tick(n, dt = 1 / 20) { for (let k = 0; k < n; k++) { W.t += dt; W.mode.update(dt, W.t); } },
  draw() { W.gfx.render(1 / 30, W.t); },
  async settle() { for (let k = 0; k < 400 && (W.gfx.grade.uniforms.uFade.value > 0.01 || W._swBusy); k++) await sleep(50); },
  // colour of the frame just drawn: mean HSV saturation, share of near-white pixels
  colour() { for (let k = 0; k < 3; k++) { S.tick(1); W.gfx.render(1 / 30, W.t); } const c = W.gfx.canvas,   /* drawn and read in the same task: the drawing buffer is not preserved */ s = document.createElement('canvas'); s.width = 160; s.height = 90; const x = s.getContext('2d'); x.drawImage(c, 0, 0, 160, 90); const d = x.getImageData(0, 0, 160, 90).data; let n = 0, sat = 0, white = 0, L = 0;
    let C = 0, V = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); n++; sat += mx ? (mx - mn) / mx : 0; C += mx - mn; V += mx; L += (mx + mn) / 2; if (r > .975 && g > .975 && b > .975) white++; }
    // sat = brightness-weighted saturation Σ(max − min) / Σ max (a dark brown does not count as vivid); satHSV = plain mean
    return { sat: +(C / (V || 1)).toFixed(3), satHSV: +(sat / n).toFixed(3), white: +(white / n).toFixed(4), light: +(L / n).toFixed(3) }; }
};
// ---- the checks; scope = 'hub' | 'room' | 'reader' | 'dio' | 'addpdf'
window.POLISH = function (scope, ctx) {
  const out = [], vw = innerWidth, vh = innerHeight;
  const R = e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  // visible = laid out, not hidden, and (for the overlap and off-screen checks) not fading: cumulative opacity ≥ 0.6
  const vis = (e, minOp = .05) => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; let op = 1; for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const c = getComputedStyle(p); op *= +c.opacity; if (c.display === 'none' || c.visibility === 'hidden' || op < minOp || p.hidden) return false; } return true; };
  const name = e => { const c = (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.'); const t = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32); return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (c ? '.' + c : '') + (t ? ' «' + t + '»' : ''); };
  // (a) overlaps — the floating boxes of the HUD (absolute / fixed, top-level ones) and the label kinds inside layers
  const LABELS = '.pin.in .pin-name, .pin.sym, .pin.mini .pin-num, text.guide-label, .cue-badge, .cue-step, .co-step, .dir-chip, .callout, .toast, .dio-inset, .tooltip, .scroll-menu, .ap-chip';
  const LAYERS = /^(pins|cues|labels|dir-svg|arcs|hub-ui|room-ui|dio-ui)$/;   // full-screen containers of labels: not boxes themselves
  const SKIP = e => e.closest('.reader-body, .modal .ap-body, .fig, .svgdemo, .sketch-card, .reader-menu-pop, .fold-bar, svg.arcs') || e.matches('canvas, #veil, #fatal, .modal-veil, .reader .rod');
  const boxes = [];
  const add = (e, kind) => { if (!vis(e, .6) || boxes.some(b => b.e === e)) return; const r = R(e); if ((r[2] - r[0]) * (r[3] - r[1]) > vw * vh * .85) return; boxes.push({ e, r, kind, n: name(e) }); };
  for (const e of document.querySelectorAll('#ui *, body > .toast, body > .modal-veil .modal')) {
    if (SKIP(e) && !e.matches('.modal')) continue; const cs = getComputedStyle(e); if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
    const cls = (e.getAttribute('class') || '').split(/\s+/)[0]; if (LAYERS.test(cls)) continue;
    let p = e.parentElement, inBox = false; for (; p && p.id !== 'ui'; p = p.parentElement) { const pc = getComputedStyle(p); if ((pc.position === 'absolute' || pc.position === 'fixed') && !LAYERS.test((p.getAttribute('class') || '').split(/\s+/)[0])) { const pr = p.getBoundingClientRect(); if (pr.width * pr.height > vw * vh * .85) continue; inBox = true; break; } } if (inBox) continue;
    if (e.matches('.pin')) continue; add(e, 'box'); }
  document.querySelectorAll(LABELS).forEach(e => { if (!SKIP(e)) add(e, 'label'); });
  // intended layering: a pin's dot under its own name, the callout's leader, the reader over the room's own HUD on a phone
  const ALLOW = [[/\.callout/, /\.dir-svg|leader/], [/\.pin-name/, /\.pin-dot/], [/\.co-dot/, /\.pin/], [/\.reader\b/, /\.(brand|hint|hub-actions|room-ui)/], [/\.tooltip/, /./], [/\.toast/, /./]];
  const allowed = (a, b) => ALLOW.some(([x, y]) => (x.test(a.n) && y.test(b.n)) || (x.test(b.n) && y.test(a.n)));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j]; if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    const x = Math.min(A.r[2], B.r[2]) - Math.max(A.r[0], B.r[0]), y = Math.min(A.r[3], B.r[3]) - Math.max(A.r[1], B.r[1]);
    if (x > 2 && y > 2 && !allowed(A, B)) { const f = { check: 'a', what: 'overlap', a: A.n, b: B.n, ra: A.r, rb: B.r, by: [x, y] }; const bt = W.mode && W.mode.dir && W.mode.dir.beat;
      if (bt && /callout/.test(A.n + B.n) && bt.box) f.callout = { box: bt.box.map(Math.round), ch: bt.ch, side: bt.side, hard: (bt.hard || []).map(H => [H.x, H.y, H.w, H.h].map(Math.round)), chip: bt.chipR && [bt.chipR.x, bt.chipR.y, bt.chipR.w, bt.chipR.h].map(Math.round), kind: bt.kind };   // the director's own view of the callout, for diagnosis
      out.push(f); }
  }
  // (b) guide labels and their own arrows
  const dir = W.mode && W.mode.dir, beat = dir && dir.beat;
  if (beat && beat.flowEls) beat.flowEls.forEach(F => { if (!F.pts || !vis(F.t)) return; let bb; try { bb = F.t.getBBox(); } catch (e) { return; } const [a, b] = F.pts, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const pd = (px, py) => { const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py); };
    const inR = (px, py) => px >= bb.x && px <= bb.x + bb.width && py >= bb.y && py <= bb.y + bb.height;
    let d = Math.min(pd(bb.x, bb.y), pd(bb.x + bb.width, bb.y), pd(bb.x, bb.y + bb.height), pd(bb.x + bb.width, bb.y + bb.height), ...[a, b].map(p => Math.hypot(Math.max(bb.x - p[0], 0, p[0] - bb.x - bb.width), Math.max(bb.y - p[1], 0, p[1] - bb.y - bb.height))));
    for (let k = 0; k <= 10; k++) if (inR(a[0] + dx * k / 10, a[1] + dy * k / 10)) d = 0;
    if (d > 28) out.push({ check: 'b', what: 'label far from its arrow', label: F.t.textContent.slice(0, 50), labelBox: [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height].map(Math.round), arrow: [a, b].map(p => p.map(Math.round)), gap: Math.round(d) }); });
  // guide labels keep ≥ 6 px apart (two equilibrium arrows' labels nearly touching read as one)
  if (beat && beat.flowEls) { const L = beat.flowEls.filter(F => F.pts && vis(F.t)).map(F => { try { const b = (F.pill && vis(F.pill) ? F.pill : F.t).getBBox(); return [F.t.textContent.slice(0, 30), b]; } catch (e) { return null; } }).filter(Boolean);   /* the label as seen: its pill */
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i][1], b = L[j][1], gx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)), gy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)), gap = Math.max(gx, gy); if (gap < 6) out.push({ check: 'a', what: 'guide labels closer than 6 px', a: L[i][0], b: L[j][0], gap: Math.round(gap) }); } }
  // (c) clipped text and (d) raw notation / italic units, over the visible text
  const textEls = [...document.querySelectorAll('#ui *, body > .modal-veil *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('script, style, code, pre, textarea, input, select, option, mjx-container, .code-lines, .code-out, svg, .unf-hidden, [hidden], details:not([open]) > :not(summary)'));
  const seen = new Set();
  for (const e of textEls) {
    if (!vis(e)) continue; const cs = getComputedStyle(e);
    const clipX = /hidden|clip|auto|scroll/.test(cs.overflowX) && !/auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2, clipY = /hidden|clip/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2;
    const ell = (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 1);   // an intended cut (ellipsis, line clamp): fine with a tooltip
    if ((clipX || clipY) && !(ell && (e.title || e.closest('[title]')))) out.push({ check: 'c', what: ell ? 'ellipsis without a tooltip' : 'text clipped', el: name(e), rect: R(e), scroll: [e.scrollWidth, e.scrollHeight], client: [e.clientWidth, e.clientHeight] });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const RAW = [[/\b[A-Za-z0-9)]\s?\*\s?[A-Za-z0-9(]/, '* as multiplication'], [/[A-Za-z0-9)]\^[A-Za-z0-9(\-]/, '^ (raw power)'], [/\bsqrt\(/, 'sqrt('], [/<=|>=/, '<= / >='], [/[^<\-]->(?!>)/, '->'], [/_\{/, '_{'], [/\$[^$\s][^$]{0,80}\$/, '$…$ (TeX not typeset)'], [/\\(frac|sqrt|theta|alpha|cdot|times|mathrm)\b/, 'raw TeX command']];
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent; if (!t || t.trim().length < 2) continue; const p = n.parentElement; if (!p || p.closest('script, style, code, pre, textarea, input, select, option, mjx-container, .code-lines, .code-out, .code-step, .cl, a[href], .src, title, .unf-hidden, [hidden], noscript, .MathJax') || !vis(p)) continue;
    if (!p.closest('#ui, body > .modal-veil, body > .toast')) continue;
    if (p.closest('svg') && /mono/i.test(getComputedStyle(p).fontFamily)) continue;   // a figure label set as code (R / Python, verbatim)
    for (const [re, what] of RAW) { const m = re.exec(t); if (m) { const k = what + '|' + t.slice(0, 40); if (seen.has(k)) continue; seen.add(k); out.push({ check: 'd', what: 'raw notation: ' + what, el: name(p), text: t.slice(Math.max(0, m.index - 25), m.index + 30) }); } }
  }
  // italic units: an italic token that is a unit and follows a number (or %/ or /), in HTML (<i>) and SVG (italic tspan)
  const UNITS = /^(K|Pa|kPa|hPa|MPa|J|kJ|MJ|mol|mmol|W|kW|N|kN|Hz|kHz|kg|g|mg|m|cm|mm|km|nm|µm|s|ms|min|h|V|mV|A|mA|Ω|C|L|mL|bar|atm|eV|cal|kcal|rad|°C|°F|%)$/;
  const prevText = e => { let s = ''; for (let q = e; q && s.length < 14; ) { let pv = q.previousSibling; while (!pv && q.parentElement && !/^(P|DIV|LI|TD|SPAN|text|LABEL|B|H\d)$/i.test(q.parentElement.tagName) ) { q = q.parentElement; pv = q.previousSibling; } if (!pv) { q = q.parentElement; if (!q || /^(P|DIV|LI|TD|H\d)$/.test(q.tagName)) break; continue; } s = (pv.textContent || '') + s; q = pv; } return s; };
  for (const e of document.querySelectorAll('#ui i, #ui em, #ui tspan, body > .modal-veil i')) {
    if (e.closest('.unf-hidden, [hidden], mjx-container') || !UNITS.test((e.textContent || '').trim())) continue;
    const it = e.tagName === 'tspan' ? (e.getAttribute('font-style') === 'italic' || getComputedStyle(e).fontStyle === 'italic') : getComputedStyle(e).fontStyle === 'italic'; if (!it) continue;
    // the text before it within the same typeset span / SVG text / line item (never across two readouts or labels)
    const host0 = e.closest('em, text, li, p, td, dd, .pin-name, .reads > span, .lesson-text, h4, figcaption') || e.parentElement; let pv = ''; try { const rg = document.createRange(); rg.setStart(host0, 0); rg.setEndBefore(e); pv = rg.toString().slice(-14); } catch (x) { pv = prevText(e); }
    if (/(\d[\d.\u2009]*\s?|%\s?\/\s?|\d\s?[A-Za-z]{1,3}\s?\/\s?)$/.test(pv)) { const host = e.closest('[class]'); if (e.tagName !== 'tspan' && !vis(e)) continue; out.push({ check: 'd', what: 'italic unit', el: name(host || e), text: (pv.slice(-12) + e.textContent).trim() }); }
  }
  // (e) SVG figures
  for (const svg of document.querySelectorAll('.fig svg, .svgdemo svg')) {
    if (!vis(svg) || svg.closest('.unf-hidden')) continue; const vb = svg.viewBox.baseVal; if (!vb || !vb.width) continue;
    const where = (() => { const f = svg.closest('.fig, .svgdemo'), c = f && f.querySelector('.fig-cap'), st = svg.closest('[data-sid]'); return (st ? st.dataset.sid + ' ' : '') + (c ? '«' + c.textContent.trim().slice(0, 50) + '»' : ''); })();
    for (const t of svg.querySelectorAll('text')) { if (t.closest('defs, clipPath, marker')) continue; let b; try { b = t.getBBox(); } catch (x) { continue; } if (!b.width) continue; if (b.x < vb.x - 1.5 || b.y < vb.y - 1.5 || b.x + b.width > vb.x + vb.width + 1.5 || b.y + b.height > vb.y + vb.height + 1.5) out.push({ check: 'e', what: 'text outside the viewBox', where, text: t.textContent.slice(0, 30), bbox: [b.x, b.y, b.width, b.height].map(Math.round), viewBox: [vb.x, vb.y, vb.width, vb.height] }); }
    for (const leg of svg.querySelectorAll('.fig-legend')) { const L = leg.getBBox(); let hit = null;
      for (const m of svg.querySelectorAll('rect, circle, ellipse, path, line, polyline, text')) {
        if (leg.contains(m) || m.closest('defs, clipPath, marker') || (m.closest('.fig-axes') && !m.classList.contains('fig-axtitle'))) continue;
        if (/^(rect|circle|ellipse|text)$/.test(m.tagName)) { let b; try { b = m.getBBox(); } catch (x) { continue; } if (b.width >= vb.width * .8 && b.height >= vb.height * .6) continue; const x = Math.min(L.x + L.width, b.x + b.width) - Math.max(L.x, b.x), y = Math.min(L.y + L.height, b.y + b.height) - Math.max(L.y, b.y); if (x > .5 && y > .5) { hit = m.tagName + (m.tagName === 'text' ? ' «' + m.textContent.slice(0, 16) + '»' : '') + ' ' + [b.x, b.y, b.width, b.height].map(Math.round).join(','); break; } }
        else if (!m.getAttribute('transform') && !(m.getAttribute('stroke') === 'none' && m.getAttribute('fill') === 'none')) { let len = 0; try { len = m.getTotalLength(); } catch (x) { continue; } for (let s = 0; s <= len && !hit; s += 3) { const p = m.getPointAtLength(s); if (p.x > L.x + 1 && p.x < L.x + L.width - 1 && p.y > L.y + 1 && p.y < L.y + L.height - 1) hit = m.tagName + ' at ' + Math.round(p.x) + ',' + Math.round(p.y); } if (hit) break; } }
      if (hit) out.push({ check: 'e', what: 'legend over a data mark', where, legend: [L.x, L.y, L.width, L.height].map(Math.round), mark: hit }); }
  }
  // (f) HUD boxes that should be visible but leave the viewport
  // (only a box that is mostly on screen and cut off: one parked wholly or mostly outside is a hidden state)
  for (const b of boxes) { if (b.kind === 'label' && /pin|guide/.test(b.n)) continue; const r = b.r, on = Math.max(0, Math.min(r[2], vw) - Math.max(r[0], 0)) * Math.max(0, Math.min(r[3], vh) - Math.max(r[1], 0)), area = (r[2] - r[0]) * (r[3] - r[1]) || 1; if (on / area < .5) continue; if (r[0] < -2 || r[1] < -2 || r[2] > vw + 2 || r[3] > vh + 2) out.push({ check: 'f', what: 'off screen', el: b.n, rect: r, viewport: [vw, vh] }); }
  return out;
};`;

// findings that are known and accepted, with the reason (they are reported, but do not fail the gate). Each entry:
// [regex over "check · what · element(s) · text", why]. Keep this list short and specific.
const JUSTIFIED = [
  [/^g · saturation 0\.(4[5-9]|5[0-6])\d* \(brightness-weighted\)/, 'a book room framed almost wholly on walnut cases and leather spines measures 0.45–0.56 (the hall 0.30, a room with its pedestals in view 0.38): the material palette of the book rooms, not a grading fault; above 0.56 still fails'],
];
const justify = x => { const k = [x.check, x.what, x.a, x.b, x.el, x.label, x.where, x.text].filter(Boolean).join(' · '); const j = JUSTIFIED.find(([re]) => re.test(k)); if (j) x.justified = j[1]; return x; };
const failing = r => (r.issues || []).filter(x => !x.justified);

// ---------------------------------------------------------------- run
const { chromium, devices } = await loadPlaywright();
const browser = await chromium.launch({ headless: !process.env.POLISH_HEADED, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const VIEWPORTS = { desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, phone: { ...devices['iPhone 13'], deviceScaleFactor: 1 } };
const pages = {};
async function pageFor(view) {
  if (pages[view] && !pages[view].isClosed()) return pages[view];
  const ctx = await browser.newContext({ ...VIEWPORTS[view] }); const page = await ctx.newPage(); page._errors = [];
  page.on('pageerror', e => page._errors.push('uncaught: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/GL Driver|ReadPixels|favicon|KHR_parallel/.test(m.text())) page._errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(URL0, { timeout: 60000 });
  await page.waitForFunction(() => window.__scriptorium && window.__scriptorium.mode && document.body.classList.contains('ready'), null, { timeout: 240000 });
  // drawing at half resolution: a software-rendered frame is slow, and colour and layout do not depend on it
  // no backdrop blur and no CSS transitions in the gate: every sample sees final states (a box fading out is not a
  // finding), and a software compositor is not re-blurring the canvas under every glass panel on each DOM change
  await page.addStyleTag({ content: '*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; transition-duration: 0s !important; transition-delay: 0s !important; }' });
  await page.evaluate(HELPERS); await page.evaluate(() => { S.stop(); W.gfx.setQuality && W.gfx.setQuality('low'); W.gfx.maxDpr = W.gfx.dpr = .5; W.gfx.resize(); });
  pages[view] = page; return page;
}
const shotName = (id, k) => id.replace(/[^\w.-]+/g, '_').slice(0, 90) + (k ? '_' + k : '') + '.png';
async function evidence(page, id, k) { const p = join(OUT, shotName(id, k)); try { await page.evaluate(() => S.draw()); await page.screenshot({ path: p, timeout: 120000 }); return p; } catch (e) { return 'screenshot failed: ' + e.message.split('\n')[0]; } }

// the item list (fixed on the first run)
async function enumerate() {
  const page = await pageFor(VIEWS[0]);
  const L = await page.evaluate(async (quick) => {
    const { DIO } = await import(new URL('js/dio/models.js', location.href).href); const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href);
    const books = []; for (const b of W.lib.books) { const r = await W.loadRoom(b.id); books.push({ title: b.title, parts: (r.parts || []).map((p, i) => ({ i, title: p.title, analysed: !!p.analysis })) }); }
    return { books, models: Object.keys(DIO).filter(t => t !== 'custom3d'), flags: FLAGSHIPS.map((f, i) => ({ i, title: f.title })) };
  }, QUICK);
  const items = [];
  for (const view of VIEWS) {
    items.push(view + ':hub');
    const books = QUICK ? L.books.filter(b => b.title === 'Classical Mechanics').slice(0, 1) : L.books;
    (QUICK ? books : books.slice(0, 2)).forEach(b => items.push(view + ':room:' + b.title));
    books.forEach(b => b.parts.filter(p => p.analysed).slice(0, QUICK ? 1 : 99).forEach(p => items.push(`${view}:reader:${b.title}/${p.i}`)));
    if (!QUICK) for (let k = 1; k <= 7; k++) items.push(`${view}:reader:BYU fixture/${k - 1}`);
    (QUICK ? ['pendulum'] : L.models).forEach(t => items.push(`${view}:dio:model:${t}`));
    if (!QUICK) L.flags.forEach(f => items.push(`${view}:dio:flag:${f.i}`));
    items.push(view + ':addpdf');
  }
  return items;
}

// one item → issues ([{check, what, …, beat?, shot?}]) and notes
async function runItem(id) {
  const [view, area, ...rest] = id.split(':'), arg = rest.join(':'); const page = await pageFor(view); const issues = [], notes = {};
  notes.pms = 0; const sample = async (tag) => { const { r, ms } = await page.evaluate(([sc]) => { const t = performance.now(), r = POLISH(sc); return { r, ms: performance.now() - t }; }, [area]); notes.pms += Math.round(ms); r.forEach(x => { if (tag) x.at = tag; }); return r; };
  const keep = (list, at) => { for (const x of list) { const key = x.check + '|' + (x.what || '') + '|' + (x.a || x.el || x.label || x.where || '') + '|' + (x.b || x.text || ''); if (!issues.some(y => y._k === key)) { x._k = key; if (at) x.at = at; issues.push(x); } } };
  if (area === 'hub') {
    await page.evaluate(async () => { await W.openHub(); await S.settle(); S.tick(8); });
    notes.colour = await page.evaluate(() => S.colour()); keep(await sample());
  } else if (area === 'room') {
    notes.ms = await page.evaluate(async t => { const b = W.lib.books.find(x => x.title === t), t0 = performance.now(); await W.openRoom(b.id); const t1 = performance.now(); await S.settle(); const t2 = performance.now(); S.tick(8); return [t1 - t0, t2 - t1, performance.now() - t2].map(Math.round); }, arg);
    const tc = Date.now(); notes.colour = await page.evaluate(() => S.colour()); notes.ms.push(Date.now() - tc); keep(await sample());
  } else if (area === 'reader') {
    const [book, pi] = [arg.slice(0, arg.lastIndexOf('/')), +arg.slice(arg.lastIndexOf('/') + 1)];
    if (book === 'BYU fixture') await page.evaluate(async (chains) => { if (!W.lib.books.find(x => x.title === 'BYU fixture')) await W.importJSON({ format: 'scriptorium-room/1', book: { title: 'BYU fixture', pages: 7 }, room: { parts: chains.map((c, k) => ({ title: c.title || 'Sheet ' + (k + 1), startPage: k + 1, endPage: k + 1, analysis: c })) } }); }, [1, 2, 3, 4, 5, 6, 7].map(k => JSON.parse(readFileSync(join(ROOT, `tools/fixtures/byu-stub/chain-0${k}.json`), 'utf8'))));
    const r = await page.evaluate(async ([t, i]) => {
      const b = W.lib.books.find(x => x.title === t); if (!(W.mode && W.mode.book && W.mode.book.id === b.id)) { await W.openRoom(b.id); await S.settle(); }
      const R = W.mode, part = R.data.parts[i]; if (R.reader) { R.reader.close(); await S.sleep(50); }
      R.openPart(part, true); await S.sleep(1300); const rd = R.reader; const n = rd.folds ? rd.folds.length : 0, first = rd.shown;
      const firstVisible = rd.el.querySelectorAll('.chain [data-fold]:not(.unf-hidden)').length, all = rd.el.querySelectorAll('.chain [data-fold]').length;
      if (rd.unfoldAll) rd.unfoldAll(); await S.sleep(400); await (window.MathJax && MathJax.startup && MathJax.startup.promise || Promise.resolve()); await S.sleep(300);
      const t0 = performance.now(); while (performance.now() - t0 < 4000 && rd.el.querySelector('.fig-host:empty')) await S.sleep(100);
      return { folds: n, firstShown: first, firstVisible, all, title: part.title, bar: rd.foldBar ? rd.foldBar.textContent.trim() : '' };
    }, [book, pi]);
    notes.reader = r; if (r.folds > 1 && r.firstVisible >= r.all) issues.push({ check: 'unfold', what: 'the whole scroll shows at once', el: r.title });
    keep(await sample());
    // a phone or desktop screenshot of the reader's first fold is not needed unless something failed
  } else if (area === 'dio') {
    const [kind, key] = arg.split(':'); const tOpen = Date.now(); notes.ms = {};
    await page.evaluate(async ([kind, key]) => { let spec; if (kind === 'flag') { const { FLAGSHIPS } = await import(new URL('js/seeds-scenes.js', location.href).href); spec = FLAGSHIPS[+key]; } else spec = { type: key };
      window._pKeys = null; window._pSeen = null; await W.openDiorama(JSON.parse(JSON.stringify(spec)), { skipIntro: true, autoTransition: false, title: kind + ' ' + key }); S.tick(20); }, [kind, key]);   // (1 s: the labels' HUD measure settles)
    const nLessons = Math.min(QUICK ? 1 : 99, await page.evaluate(() => (W.mode.lessons ? W.mode.lessons() : []).length)); notes.beats = 0;
    notes.lessons = nLessons; notes.ms.open = Date.now() - tOpen; let ts = Date.now(); keep(await sample(), 'idle'); notes.ms.sample = Date.now() - ts; notes.ms.ticks = 0; notes.ms.samples = 0;
    let shots = 0; const tItem = Date.now(), ITEM_MS = QUICK ? 120000 : 150000;
    for (const guides of [true, false]) for (let li = 0; li < Math.max(1, nLessons); li++) {
      if (!nLessons || notes.cut) break;
      await page.evaluate(([g, li]) => { const v = W.mode; v.setPref('guides', g); if (v.dir) v.dir.guides = g; v.runLesson(li); }, [guides, li]);
      // run the lesson; sample once per beat (after 1.2 s) and once per chain step
      for (let round = 0; round < 40; round++) {
        // the lesson runs in the page and is sampled once per beat (after 1.2 s) and once per chain step, in the same task
        // as the ticks; control comes back here only with a finding not seen before (for its screenshot) or at the end
        ts = Date.now(); const st = await page.evaluate(() => { const v = W.mode, d = v.dir; const seen = window._pSeen || (window._pSeen = new Set()), keys = window._pKeys || (window._pKeys = new Set()); let k = 0, n = 0;
          const T0 = performance.now(); for (; k < 2400; k++) { if (performance.now() - T0 > 50000) return { end: true, timeout: true, n }; S.tick(1); const b = d && d.beat, c = v.cues && v.cues.chain; const key = b ? (b.kind + ':' + (b.text || b.title || '')).slice(0, 80) : null; const ckey = c && c.gi != null ? 'chain' + c.gi : null;
            let at = null; if (b && b.t > 1.2 && !b.tw && key && !seen.has(key)) at = key;   /* (not mid-glide: a callout changing sides passes over things for 0.35 s) */ else if (ckey && c.ft > .6 && !seen.has(ckey)) at = ckey;
            if (at) { seen.add(at); n++; const r = POLISH('dio'), fresh = r.filter(x => { const q = x.check + '|' + x.what + '|' + (x.a || x.el || x.label || x.where || '') + '|' + (x.b || ''); if (keys.has(q)) return false; keys.add(q); return true; }); if (fresh.length) return { beat: at, r: fresh, n }; }
            if (v.running == null && k > 30) return { end: true, n }; }
          return { end: true, timeout: true, n }; });
        notes.ms.ticks += Date.now() - ts; notes.beats += st.n || 0;
        if (st.end) { notes['L' + li + (guides ? 'g' : '')] = st.timeout ? 'timeout' : 'done'; break; }
        const tag = `lesson ${li + 1}, guides ${guides ? 'on' : 'off'}, ${st.beat}`; const fresh = st.r;
        const shot = shots < 3 ? (shots++, await evidence(page, id, issues.length)) : null; fresh.forEach(x => { if (shot) x.shot = shot; }); keep(fresh, tag);
        if (Date.now() - tItem > ITEM_MS) { notes.cut = 'item time cap reached'; break; }
      }
      await page.evaluate(() => { window._pSeen = null; const v = W.mode; if (v.running != null && v.stopLesson) v.stopLesson(); });
    }
  } else if (area === 'addpdf') {
    await page.evaluate(async () => { await W.openHub(); await S.settle(); S.tick(10); W.addPdfDialog(); await S.sleep(300); });
    keep(await sample(), 'step 1 (empty)');
    await page.setInputFiles('.addpdf input[type=file]', { name: 'polish-test.pdf', mimeType: 'application/pdf', buffer: tinyPDF() });
    await page.waitForFunction(() => { const b = document.querySelector('.addpdf [data-next]'); return b && !b.disabled; }, null, { timeout: 60000 }).catch(() => issues.push({ check: 'addpdf', what: 'the test PDF was not read' }));
    keep(await sample(), 'step 1 (PDF read)');
    for (const step of [2, 3, 4, 5]) { const ok = await page.evaluate(async () => { const b = document.querySelector('.addpdf [data-next]'); if (!b || b.disabled) return false; b.click(); await S.sleep(500); S.tick(30); return true; }); if (!ok) break; const r = await sample(); if (r.length) { const shot = await evidence(page, id, 's' + step); r.forEach(x => { x.shot = shot; }); } keep(r, 'step ' + step); }
    await page.evaluate(() => { document.querySelectorAll('.modal-veil').forEach(v => v.remove()); });
  }
  // (g) colour sanity on the rendered views
  if (notes.colour) { const c = notes.colour; if (c.sat < .06 || c.sat > .45) issues.push({ check: 'g', what: `saturation ${c.sat} (brightness-weighted) outside [0.06, 0.45]` }); if (c.white > .02) issues.push({ check: 'g', what: `near-white blow-out on ${(c.white * 100).toFixed(1)} % of the frame (> 2 %)` }); }
  const errs = page._errors.splice(0); if (errs.length) issues.push({ check: 'errors', what: errs.length + ' page error(s)', text: errs.slice(0, 3).join(' | ') });
  if (issues.length && !issues.some(x => x.shot)) { const shot = await evidence(page, id); issues.forEach(x => { x.shot = x.shot || shot; }); }
  issues.forEach(x => { delete x._k; justify(x); });
  return { issues, notes };
}

// ---------------------------------------------------------------- report
function writeReport(final) {
  Object.values(state.done).forEach(r => (r.issues || []).forEach(x => { delete x.justified; justify(x); }));   // the list may have changed since
  const items = state.items || [], done = items.filter(i => state.done[i]), fails = done.filter(i => failing(state.done[i]).length);
  const byCheck = {}; done.forEach(i => state.done[i].issues.forEach(x => { byCheck[x.check] = (byCheck[x.check] || 0) + 1; }));
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), url: URL0, quick: QUICK, total: items.length, done: done.length, byCheck, results: state.done }, null, 1));
  if (QUICK || opt('no-report')) return;
  const L = [`# Polish gate report`, ``, `Generated by \`node tools/polish.mjs\` (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC) against ${URL0}.`, `${done.length} of ${items.length} items walked${done.length < items.length ? ' (incomplete: run again to continue)' : ''}; ${fails.length} with findings.`, ``,
    `Checks: a overlap · b label far from its arrow · c clipped text · d raw notation / italic units · e figure legend or text · f off screen · g colour · unfold (whole scroll at once) · errors.`, ``,
    `| check | findings |`, `|---|---|`, ...Object.entries(byCheck).sort().map(([k, v]) => `| ${k} | ${v} |`), ``];
  const just = new Map(); done.forEach(i => state.done[i].issues.filter(x => x.justified).forEach(x => { const k = x.justified; if (!just.has(k)) just.set(k, []); just.get(k).push(i + ': ' + x.what + ' ' + (x.a || x.el || x.where || '') + (x.b ? ' / ' + x.b : '')); }));
  if (just.size) { L.push('## Justified (reported, not failing)', ''); just.forEach((v, k) => L.push(`- ${k} — ${v.length} finding${v.length > 1 ? 's' : ''}, e.g. ${v[0]}`)); L.push(''); }
  L.push('## Findings', '');
  if (!fails.length) L.push('None.');
  fails.forEach(i => { L.push(`### ${i}`, ''); const seen = new Map(); failing(state.done[i]).forEach(x => { const k = x.check + ' ' + x.what + ' ' + (x.a || x.el || x.label || x.where || '') + (x.b ? ' / ' + x.b : ''); if (!seen.has(k)) seen.set(k, x); });
    [...seen.values()].slice(0, 25).forEach(x => L.push(`- **${x.check}** ${x.what}${x.a ? `: \`${x.a}\` ${JSON.stringify(x.ra)} × \`${x.b}\` ${JSON.stringify(x.rb)} by ${JSON.stringify(x.by)}` : ''}${x.el ? `: \`${x.el}\`` : ''}${x.rect ? ' ' + JSON.stringify(x.rect) : ''}${x.label ? `: «${x.label}» gap ${x.gap} px` : ''}${x.where ? ` in ${x.where}` : ''}${x.text ? ` — “${x.text}”` : ''}${x.mark ? ` (${x.mark})` : ''}${x.at ? ` _(at ${x.at})_` : ''}${x.shot ? ` — screenshot \`${x.shot.split('/').pop()}\`` : ''}`)); L.push(''); });
  const notes = done.filter(i => state.done[i].notes && (state.done[i].notes.colour || state.done[i].notes.reader));
  if (notes.length) { L.push('## Measurements', '', '| item | measurement |', '|---|---|'); notes.forEach(i => { const n = state.done[i].notes; L.push(`| ${i} | ${n.colour ? `saturation ${n.colour.sat}, near-white ${(n.colour.white * 100).toFixed(2)} %, lightness ${n.colour.light}` : ''}${n.reader ? `${n.reader.folds} folds, first fold shows ${n.reader.firstVisible} of ${n.reader.all} units` : ''} |`); }); L.push(''); }
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, L.join('\n'));
}

let exitCode = 0, KILLED = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { KILLED = true; exitCode = 3; console.log('polish: stopped by ' + sig + ' — finished items are kept'); });
try {
  if (!state.items) { state.items = await enumerate(); saveState(); }
  const todo = state.items.filter(i => !state.done[i] && (!ONLY || ONLY.test(i)) && VIEWS.includes(i.split(':')[0]));
  console.log(`polish: ${state.items.length} items, ${Object.keys(state.done).length} done earlier, ${todo.length} to walk → ${OUT}`);
  for (const id of todo) {
    if (Date.now() - T0 > BUDGET) { console.log(`polish: budget reached, ${todo.length - todo.indexOf(id)} items left — run again to continue`); exitCode = 3; break; }
    const t1 = Date.now(); let res;
    try { res = await runItem(id); } catch (e) { if (KILLED) break;   /* stopped from outside: this item is not done, it runs again next time */ res = { issues: [{ check: 'errors', what: 'the walk failed', text: String(e.message || e).split('\n')[0] }], notes: {} }; const v = id.split(':')[0]; try { await pages[v].close(); } catch (x) { } pages[v] = null; }
    if (KILLED) break; state.done[id] = { ...res, ms: Date.now() - t1 }; saveState(); writeReport(false);
    const fl = failing(res); console.log(`${fl.length ? 'FAIL' : 'ok  '}  ${id}  ${((Date.now() - t1) / 1000).toFixed(0)} s${fl.length ? '  ' + fl.slice(0, 2).map(x => x.check + ': ' + x.what + ' ' + (x.a || x.el || x.label || x.where || '')).join(' | ') : ''}`);
  }
} catch (e) { console.error('polish: could not run: ' + e.message); await browser.close(); process.exit(2); }
writeReport(true); await browser.close();
const all = (state.items || []).filter(i => state.done[i] && VIEWS.includes(i.split(':')[0]) && (!ONLY || ONLY.test(i))), bad = all.filter(i => failing(state.done[i]).length);
console.log(`\npolish: ${all.length - bad.length}/${all.length} items clean${exitCode === 3 ? ' (incomplete)' : ''} in ${((Date.now() - T0) / 1000).toFixed(0)} s` + (bad.length ? ' — see ' + join(OUT, 'results.json') : ''));
process.exit(exitCode === 3 ? 3 : bad.length ? 1 : 0);
