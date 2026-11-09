// Shared kit for the domain primitives (js/dio/prims/*.js): an SVG stage on parchment with typeset labels that are
// wrapped, measured and kept inside the frame; a minimal control row (PhET: a step bar, one primary action, at most two
// sliders); readouts; a "why" note; a frame loop that pauses off screen and never runs by itself under reduced motion.
import { el, fmt, clamp, uid, svgMath, mathHTML } from '../../util.js';

export const NS = 'http://www.w3.org/2000/svg';
export const FC = { ink: '#2a1e15', soft: '#5b4532', lapis: '#2d5b8e', rubric: '#9c3a28', verd: '#3f7d6e', brass: '#8f733a', gold: '#cfa84f', violet: '#6a4a8a', bg: '#fbf6ea', card: '#fffaf0', hot: '#f3e3b8', grid: 'rgba(90,60,30,.13)', mute: 'rgba(90,60,30,.38)', fillA: 'rgba(45,91,142,.18)', fillR: 'rgba(156,58,40,.16)', fillV: 'rgba(63,125,110,.16)', fillB: 'rgba(207,168,79,.22)' };
export const SERIES = [FC.lapis, FC.rubric, FC.verd, FC.brass];
export function calm() { try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; const v = JSON.parse(localStorage.getItem('scriptorium.view') || '{}'); return v.motion === 'calm' || v.calm === true; } catch (e) { return false; } }
export const isNarrow = () => typeof innerWidth !== 'undefined' && innerWidth < 560;
export { fmt, clamp, mathHTML };
// the width a string takes when typeset (estimate: Alegreya ≈ 0.52 em per character, the mono face 0.6)
export const textW = (s, fs, mono) => String(s).replace(/[̀-ͯ]/g, '').length * fs * (mono ? .6 : .52);
export function wrapText(s, max) { const out = []; let cur = ''; String(s).split(/\s+/).filter(Boolean).forEach(w => { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); return out; }
// shorten to n characters at a word boundary, with an ellipsis (the full text goes in a <title>)
export const short = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), n * .6)).replace(/[\s,;:.]+$/, '') + '…'; };

// makeStage(box, {W, H, small}) → S: the frame and its helpers. box is the <figure> the primitive fills.
export function makeStage(box, { W = 600, H = 320, small = false, panel = false } = {}) {
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'prim-svg'); svg.setAttribute('role', 'img');
  const frame = el('div', { class: 'fig-frame prim-frame' }, [svg]);
  const ctrls = el('div', { class: 'prim-ctrls' }), reads = el('div', { class: 'prim-reads', 'aria-live': 'polite' }), note = el('div', { class: 'prim-note' });
  box.append(frame, ctrls, reads, note);
  const fs = panel ? 13 : small ? 11 : 12.5;
  const S = { svg, frame, box, ctrls, reads, note, W, H, fs, small, panel, calm: calm(), narrow: isNarrow(), alive: true };
  const defs = document.createElementNS(NS, 'defs'); svg.append(defs);
  const markers = new Map();
  // an arrowhead marker per colour
  S.arrow = (c = FC.soft) => { if (markers.has(c)) return `url(#${markers.get(c)})`; const id = 'pa' + uid(); const m = document.createElementNS(NS, 'marker'); [['id', id], ['viewBox', '0 0 10 10'], ['refX', '8.5'], ['refY', '5'], ['markerWidth', '7'], ['markerHeight', '7'], ['orient', 'auto-start-reverse'], ['markerUnits', 'userSpaceOnUse']].forEach(([a, b]) => m.setAttribute(a, b)); m.innerHTML = `<path d="M0 0L10 5L0 10z" fill="${c}"/>`; m.firstChild.setAttribute('transform', 'scale(1)'); defs.append(m); markers.set(c, id); return `url(#${id})`; };
  // markers drawn at 7 user units whatever the stroke width
  const layer = document.createElementNS(NS, 'g'); svg.append(layer); S.layer = layer;
  S.clear = () => { layer.innerHTML = ''; };
  S.mk = (n, a = {}, parent = layer) => { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k]); parent.append(e); return e; };
  S.g = (a = {}, parent = layer) => S.mk('g', a, parent);
  // one line of typeset text; "fit" = the widest it may be (it shrinks to fit, then is cut with an ellipsis + tooltip)
  S.txt = (x, y, s, a = {}, parent = layer) => { const { fit, mono, ...rest } = a; const e = S.mk('text', { x, y, 'font-size': fs, fill: FC.ink, 'font-family': mono ? 'IBM Plex Mono, monospace' : 'Alegreya, Georgia, serif', ...rest }, parent); if (mono) e.textContent = String(s); else svgMath(e, String(s)); if (fit) { e.dataset.fit = fit; e.dataset.full = String(s); } return e; };
  // wrapped lines inside a box of width w (characters estimated from the font size), at most maxL lines (the last cut
  // with an ellipsis); returns {n, h} — the number of lines and their height
  S.lines = (x, y, s, w, a = {}, parent = layer, maxL = 4) => { const f = +(a['font-size'] || fs), per = Math.max(6, Math.floor(w / (f * .52))); let L = wrapText(s, per); if (L.length > maxL) { L = L.slice(0, maxL); L[maxL - 1] = L[maxL - 1].replace(/[\s,;:.]*$/, '') + '…'; } const lh = f * 1.22; const an = a['text-anchor']; const { valign: va = 'top', ...rest } = a; const y0 = va === 'middle' ? y - (L.length - 1) * lh / 2 + f * .35 : y + f * .82; L.forEach((l, i) => S.txt(x, y0 + i * lh, l, { ...rest, fit: w, 'text-anchor': an }, parent)); return { n: L.length, h: L.length * lh }; };
  S.pt = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H]; };
  // measure every fitted label once it is laid out: shrink to 72 % at most, then cut; keep it inside the viewBox
  S.fit = () => { if (!svg.isConnected || !svg.getBoundingClientRect().width) return; svg.querySelectorAll('text').forEach(t => { let b; try { b = t.getBBox(); } catch (e) { return; } if (!b.width) return; const max = +t.dataset.fit || 0; if (max && b.width > max + .5) { const f0 = +t.getAttribute('font-size') || fs, k = Math.max(.72, max / b.width); t.setAttribute('font-size', (f0 * k).toFixed(2)); try { b = t.getBBox(); } catch (e) { return; } if (b.width > max + .5 && t.dataset.full) { const full = t.dataset.full; let n = Math.floor(full.length * max / b.width) - 1; svgMath(t, short(full, Math.max(4, n))); const ti = document.createElementNS(NS, 'title'); ti.textContent = full; t.append(ti); try { b = t.getBBox(); } catch (e) { return; } } }
      const x = +t.getAttribute('x') || 0, an = t.getAttribute('text-anchor'); if (b.x < 1) t.setAttribute('x', (x + 1 - b.x).toFixed(1)); else if (b.x + b.width > W - 1) t.setAttribute('x', (x - (b.x + b.width - (W - 1))).toFixed(1)); void an;
      if (b.y < 1) t.setAttribute('y', ((+t.getAttribute('y') || 0) + 1 - b.y).toFixed(1)); else if (b.y + b.height > H - 1) t.setAttribute('y', ((+t.getAttribute('y') || 0) - (b.y + b.height - (H - 1))).toFixed(1)); }); };
  // ---- controls (each a real button / input; labels typeset)
  S.btn = (label, on, { primary = false, title = null, cls = '' } = {}, parent = ctrls) => { const b = el('button', { type: 'button', class: 'pbtn' + (primary ? ' primary' : '') + (cls ? ' ' + cls : ''), title: title || null, html: mathHTML(label, 'label') }); b.onclick = e => { e.stopPropagation(); on(b); }; parent.append(b); return b; };
  S.slider = (label, min, max, val, step, on, show = v => fmt(v)) => { const out = el('b', { text: show(val) }); const inp = el('input', { type: 'range', min, max, step, value: val, 'aria-label': label.replace(/<[^>]+>/g, '') }); inp.oninput = () => { out.textContent = show(+inp.value); on(+inp.value); }; const lab = el('label', { class: 'pslider' }, [el('span', {}, [el('span', { html: mathHTML(label, 'label') }), out]), inp]); ctrls.append(lab); return { inp, set(v) { inp.value = v; out.textContent = show(+v); } }; };
  S.select = (label, opts, val, on) => { const s = el('select', { 'aria-label': label }, opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === val }))); s.onchange = () => on(s.value); ctrls.append(el('label', { class: 'pselect' }, [el('span', { text: label }), s])); return s; };
  // the step bar: ◂ k / n · title ▸ (keyboard: the buttons; the title is aria-live through reads)
  S.stepper = (n, on, title = k => '') => { let k = 0; const prev = el('button', { type: 'button', class: 'pbtn step', 'aria-label': 'Previous step', text: '◂' }), next = el('button', { type: 'button', class: 'pbtn step', 'aria-label': 'Next step', text: '▸' }), lab = el('span', { class: 'pstep-lab' });
    const set = j => { k = clamp(j, 0, n - 1); prev.disabled = k === 0; next.disabled = k === n - 1; lab.innerHTML = `<b>${k + 1}</b>/${n}` + (title(k) ? ' · ' + mathHTML(title(k), 'label') : ''); on(k); };
    prev.onclick = e => { e.stopPropagation(); set(k - 1); }; next.onclick = e => { e.stopPropagation(); set(k + 1); };
    ctrls.append(el('div', { class: 'pstepper' }, [prev, lab, next])); return { set, get k() { return k; }, next: () => set(k + 1) }; };
  S.read = items => { reads.innerHTML = items.filter(Boolean).map(([k, v]) => `<span><i>${mathHTML(k, 'label')}</i> ${mathHTML(String(v), 'label')}</span>`).join(''); };
  S.say = html => { note.innerHTML = html || ''; note.hidden = !html; };
  // ---- the frame loop: tick(dt) returns true while it still has something to animate; paused off screen
  let raf = 0, visible = true, tickFn = null, last = 0;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { const v = es.some(e => e.isIntersecting); if (v && !visible) { visible = true; S.redraw && S.redraw(); S.fit(); kick(); } visible = v; }) : null; if (io) io.observe(box);
  const frameFn = now => { raf = 0; if (!S.alive) return; if (!box.isConnected && performance.now() - S.t0 > 3000) { S.dispose(); return; } if (!visible || !tickFn) return; const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; let more = false; try { more = tickFn(dt); } catch (e) { console.warn(e); more = false; } S.fit(); if (more) raf = requestAnimationFrame(frameFn); else last = 0; };
  const kick = () => { if (!raf && S.alive && tickFn) { last = 0; raf = requestAnimationFrame(frameFn); } };
  S.t0 = performance.now();
  S.animate = fn => { tickFn = fn; kick(); };   // fn(dt) → keep going?
  S.kick = kick;
  S.dispose = () => { S.alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); };
  // a fit pass once the figure is in the page (it may be inside a fold that is still rolled up: then on reveal)
  requestAnimationFrame(() => requestAnimationFrame(() => S.fit()));
  return S;
}
// a rounded node box with a wrapped label, centred at (x, y); tone sets the fill and stroke
export function nodeBox(S, x, y, w, h, label, { tone = 'card', stroke = FC.lapis, sw = 1.3, fs, sub = null, rx = 8, parent, maxL = 3, cls = null, dash = null, weight = null } = {}) {
  const g = S.g(cls ? { class: cls } : {}, parent || S.layer); const fill = { card: FC.card, hot: FC.hot, mute: '#f1e9d8', verd: '#e8f1ec', rubric: '#f6e4dc', lapis: '#e4ebf3', brass: '#f4ead2', ink: FC.ink }[tone] || tone;
  S.mk('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx, fill, stroke, 'stroke-width': sw, 'stroke-dasharray': dash }, g);
  const f = fs || S.fs, subF = f * .82, pad = 6, subH = sub ? subF * 1.3 : 0, L = wrapText(label, Math.max(5, Math.floor((w - 2 * pad) / (f * .52)))), n = Math.max(1, Math.min(maxL, L.length, Math.floor((h - 4 - subH) / (f * 1.2)) || 1));
  S.lines(x, y - subH / 2, label, w - 2 * pad, { 'text-anchor': 'middle', valign: 'middle', 'font-size': f, fill: tone === 'ink' ? FC.bg : FC.ink, 'font-weight': weight }, g, n);
  if (sub) S.txt(x, y + h / 2 - 5, sub, { 'text-anchor': 'middle', 'font-size': subF, fill: FC.soft, 'font-style': 'italic', fit: w - 2 * pad }, g);
  return g;
}
// a point at fraction t along a quadratic Bézier (a, control c, b)
export const qpt = (a, c, b, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
// where the segment from the centre of a box (w × h at c) toward p leaves the box
export function boxExit(c, w, h, p, pad = 2) { const dx = p[0] - c[0], dy = p[1] - c[1]; if (!dx && !dy) return c; const sx = (w / 2 + pad) / Math.abs(dx || 1e-9), sy = (h / 2 + pad) / Math.abs(dy || 1e-9), s = Math.min(sx, sy); return [c[0] + dx * s, c[1] + dy * s]; }
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
// a seeded random generator (mulberry32), so a figure draws the same samples on every visit
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// automatic placement of n items on a ring inside the frame (for graphs whose spec gives no positions)
export function ring(n, W, H, mx = 70, my = 44, phase = -Math.PI / 2) { const cx = W / 2, cy = H / 2, rx = W / 2 - mx, ry = H / 2 - my; return [...Array(n)].map((_, i) => [cx + rx * Math.cos(phase + i * 2 * Math.PI / n), cy + ry * Math.sin(phase + i * 2 * Math.PI / n)]); }
// a wire from box a to box b (centres, sizes [w, h]) as a quadratic curve that bends round any obstacle box
// ([cx, cy, w, h]) it would cross; bend0 > 0 pushes it to the left of its direction (two opposite wires part)
export function route(a, b, sa, sb, obstacles = [], bend0 = 0, frame = null) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // how much of the curve runs through other boxes (or out of the frame): the least wins, the straightest on a tie
  const hits = (p, c, q) => { let n = 0; for (let i = 1; i < 24; i++) { const s = qpt(p, c, q, i / 24); if (obstacles.some(o => Math.abs(s[0] - o[0]) < o[2] / 2 + 3 && Math.abs(s[1] - o[1]) < o[3] / 2 + 3)) n++; if (frame && (s[0] < 2 || s[1] < 2 || s[0] > frame[0] - 2 || s[1] > frame[1] - 2)) n += 2; } return n; };
  let best = null, bn = Infinity;
  for (const k of [0, 1, -1, 1.8, -1.8, 2.7, -2.7, 3.6, -3.6, 4.6, -4.6]) { const off = bend0 + k * 30, c = [m[0] + nx * off, m[1] + ny * off], p = boxExit(a, sa[0], sa[1], c, 2), q = boxExit(b, sb[0], sb[1], c, 5), n = hits(p, c, q); if (n < bn) { bn = n; best = { a: p, b: q, c }; } if (!n) break; }
  return best;
}
export const qpath = r => `M${r.a[0].toFixed(1)} ${r.a[1].toFixed(1)}Q${r.c[0].toFixed(1)} ${r.c[1].toFixed(1)} ${r.b[0].toFixed(1)} ${r.b[1].toFixed(1)}`;
