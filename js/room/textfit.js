// Readable figure text in the reading scroll (js/room/reader.js). A generic post-pass over every SVG drawn in the sheet,
// whoever drew it (diagrams, primitives, reveal cards): it never changes how a figure is specified, only how its text
// lands on screen.
//  1. size: every <text> renders at least MIN_PX on screen, and grows with the reader's text zoom (its own size × zoom);
//     text is never shrunk below the minimum, whatever the figure's scale.
//  2. boxes: a label that sits in a node (a rect, circle or ellipse beside it in the same group) and no longer fits is
//     wrapped onto two lines when that helps, and the node grows around it: the text is never squeezed.
//  3. overlaps: labels that land on each other are moved apart vertically, by the least distance that clears them
//     (ties alternate above / below); a label moved further than its own height gets a thin leader line back to where
//     it was. Deterministic: the same figure at the same width and zoom always comes out the same.
//  4. room: a figure whose labels now reach past its top or bottom edge grows its viewBox to keep them in.
// A figure is laid out again only when its text, its width or the zoom changed (fitAll is cheap to call often).
const NS = 'http://www.w3.org/2000/svg';
export const MIN_PX = 12.5;
const SKIP = 'defs, clipPath, mask, marker, pattern, symbol, foreignObject';
const ctm = n => (n && n.getScreenCTM ? n.getScreenCTM() : null);
const sx = m => (m ? Math.hypot(m.a, m.b) : 0), sy = m => (m ? Math.hypot(m.c, m.d) : 0);
const rotated = m => !m || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6;
const hit = (a, b, g = 1) => a.left < b.right - g && b.left < a.right - g && a.top < b.bottom - g && b.top < a.bottom - g;
const shift = (r, dy) => ({ left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy, width: r.width, height: r.height });

// the texts of one figure that are drawn (not inside defs / markers, not empty, not hidden)
function textsOf(svg) {
  return [...svg.querySelectorAll('text')].filter(t => !t.closest(SKIP) && (t.textContent || '').trim() && t.getClientRects().length && getComputedStyle(t).display !== 'none' && getComputedStyle(t).visibility !== 'hidden');
}
// undo the last layout (moved labels, leaders, wrapped lines, grown nodes, grown viewBox) so it can be done again
function reset(svg) {
  svg.querySelectorAll('.fit-leader').forEach(l => l.remove());
  svg.querySelectorAll('[data-fit-y]').forEach(t => { const o = t.dataset.fitY; if (o) t.setAttribute('y', o); else t.removeAttribute('y'); delete t.dataset.fitY; });
  svg.querySelectorAll('[data-fit-wrap]').forEach(t => { const s = t.dataset.fitWrap; while (t.firstChild) t.firstChild.remove(); t.append(document.createTextNode(s)); delete t.dataset.fitWrap; });
  svg.querySelectorAll('[data-fit-geom]').forEach(n => { const g = JSON.parse(n.dataset.fitGeom); Object.entries(g).forEach(([k, v]) => v == null ? n.removeAttribute(k) : n.setAttribute(k, v)); delete n.dataset.fitGeom; });
  if (svg.dataset.fitVb != null) { if (svg.dataset.fitVb) svg.setAttribute('viewBox', svg.dataset.fitVb); delete svg.dataset.fitVb; }
}
// 1. sizes: the figure's own size × zoom, never under MIN_PX on screen
function sizeTexts(texts, zoom) {
  texts.forEach(t => {
    const k = sx(ctm(t.parentNode)); if (!k) return;
    let f0 = +t.dataset.fs0; if (!f0) { f0 = parseFloat(getComputedStyle(t).fontSize) || 12; t.dataset.fs0 = f0; }
    const want = Math.max(f0 * zoom, MIN_PX / k);
    if (Math.abs((parseFloat(t.style.fontSize) || f0) - want) > .02) t.style.fontSize = want.toFixed(2) + 'px';
  });
}
// 2. the node a label sits in: the smallest rect / circle / ellipse among its siblings that contains its centre
function nodeOf(t) {
  if (t.getAttribute('transform')) return null;
  let b; try { b = t.getBBox(); } catch (e) { return null; }
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2; let best = null, area = Infinity;
  for (const n of t.parentNode.children) {
    if (n === t || !/^(rect|circle|ellipse)$/.test(n.tagName) || n.getAttribute('transform')) continue;
    let r; try { r = n.getBBox(); } catch (e) { continue; }
    if (r.width < 4 || r.height < 4 || cx < r.x || cx > r.x + r.width || cy < r.y || cy > r.y + r.height) continue;
    if (r.width * r.height < area) { area = r.width * r.height; best = n; }
  }
  return best;
}
function keepGeom(n, keys) { if (!n.dataset.fitGeom) n.dataset.fitGeom = JSON.stringify(Object.fromEntries(keys.map(k => [k, n.getAttribute(k)]))); }
// two lines at the space nearest the middle (plain text only: typeset maths keeps its runs)
function wrapTwo(t) {
  if (t.children.length) return false; const s = t.textContent.trim(), sp = [...s.matchAll(/\s+/g)].map(m => m.index); if (!sp.length) return false;
  const mid = s.length / 2, at = sp.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const x = t.getAttribute('x') || '0'; t.dataset.fitWrap = t.textContent; while (t.firstChild) t.firstChild.remove();
  const a = document.createElementNS(NS, 'tspan'), b = document.createElementNS(NS, 'tspan');
  a.setAttribute('x', x); a.setAttribute('dy', '-0.55em'); a.textContent = s.slice(0, at).trim();
  b.setAttribute('x', x); b.setAttribute('dy', '1.1em'); b.textContent = s.slice(at).trim(); t.append(a, b); return true;
}
function fitBox(t, n) {
  const pad = 4; let tb = t.getBBox(), nb = n.getBBox();
  const over = Math.max(0, tb.width + 2 * pad - nb.width), overH = Math.max(0, tb.height + pad - nb.height);
  if (n.tagName === 'rect') {
    if (!over && !overH && tb.x >= nb.x && tb.x + tb.width <= nb.x + nb.width) return;
    if (over > nb.width * .35 && wrapTwo(t)) tb = t.getBBox();
    const x0 = Math.min(nb.x, tb.x - pad), x1 = Math.max(nb.x + nb.width, tb.x + tb.width + pad), y0 = Math.min(nb.y, tb.y - pad / 2), y1 = Math.max(nb.y + nb.height, tb.y + tb.height + pad / 2);
    if (x0 === nb.x && x1 === nb.x + nb.width && y0 === nb.y && y1 === nb.y + nb.height) return;
    keepGeom(n, ['x', 'y', 'width', 'height']); n.setAttribute('x', x0.toFixed(2)); n.setAttribute('y', y0.toFixed(2)); n.setAttribute('width', (x1 - x0).toFixed(2)); n.setAttribute('height', (y1 - y0).toFixed(2));
  } else {
    const ell = n.tagName === 'ellipse', rx = nb.width / 2, ry = nb.height / 2, cx = nb.x + rx, cy = nb.y + ry;
    const need = (w, h) => { const hw = Math.max(Math.abs(w.x - cx), Math.abs(w.x + w.width - cx)) + pad, hh = Math.max(Math.abs(w.y - cy), Math.abs(w.y + w.height - cy)) + pad / 2; return (hw / rx) ** 2 + (hh / ry) ** 2 > 1 ? [hw, hh] : null; };
    let nd = need(tb); if (!nd) return;
    if (nd[0] > rx * 1.25 && wrapTwo(t)) { tb = t.getBBox(); nd = need(tb); if (!nd) return; }
    // the smallest ellipse of the same shape (or circle) through the text box's corner
    const k = Math.sqrt((nd[0] / rx) ** 2 + (nd[1] / ry) ** 2);
    if (ell) { keepGeom(n, ['rx', 'ry']); n.setAttribute('rx', (rx * k).toFixed(2)); n.setAttribute('ry', (ry * k).toFixed(2)); }
    else { keepGeom(n, ['r']); n.setAttribute('r', (rx * k).toFixed(2)); }
  }
}
// a label moves by its y (and its lines' own y), not by a transform, so its box (getBBox) says where it is drawn
function moveY(t, du) {
  [t, ...t.querySelectorAll('tspan[y]')].forEach(e => { const y = e.getAttribute('y'); if (y == null && e !== t) return; const ys = String(y == null ? '0' : y).trim().split(/[\s,]+/).map(Number); if (ys.some(v => !isFinite(v))) return; if (!e.dataset.fitY) e.dataset.fitY = y == null ? '' : y; e.setAttribute('y', ys.map(v => +(v + du).toFixed(2)).join(' ')); });
}
// 3. overlaps: in document order, each label that lands on an earlier one moves by the least vertical distance that clears
// every label placed so far (ties: alternately above and below); labels in nodes stay and count as obstacles
function separate(svg, texts, inNode) {
  const placed = [], gap = 2; let conflict = 0;
  const clashes = r => placed.filter(p => hit(r, p));
  // labels that cannot move (in a node, turned) are obstacles from the start; the free ones are placed after them
  const fixed = t => { const m = ctm(t); return !m || rotated(m) || inNode.has(t); };
  texts.filter(fixed).forEach(t => { const r = t.getBoundingClientRect(); if (r.width) placed.push(r); });
  texts.filter(t => !fixed(t)).forEach(t => {
    const r = t.getBoundingClientRect(); if (!r.width) return;
    if (!clashes(r).length) { placed.push(r); return; }
    const solve = dir => { let dy = 0; for (let i = 0; i < 12; i++) { const c = clashes(shift(r, dy)); if (!c.length) return dy; dy = dir < 0 ? Math.min(...c.map(p => p.top - r.bottom - gap)) : Math.max(...c.map(p => p.bottom - r.top + gap)); } return null; };
    const up = solve(-1), down = solve(1); conflict++;
    let dy = up == null ? down : down == null ? up : Math.abs(Math.abs(up) - Math.abs(down)) < 1 ? (conflict % 2 ? up : down) : Math.abs(up) < Math.abs(down) ? up : down;
    if (dy == null || !dy) { placed.push(r); return; }
    const pm = ctm(t.parentNode), k = sy(pm) || 1, du = dy / k;
    moveY(t, du);
    const nr = shift(r, dy); placed.push(nr);
    // moved further than its own height: a thin leader from where it was to where it is
    if (Math.abs(dy) > r.height * .9 && pm) {
      const inv = pm.inverse(), P = (x, y) => new DOMPoint(x, y).matrixTransform(inv), cx = r.left + r.width / 2;
      const a = P(cx, dy < 0 ? r.top + r.height * .25 : r.bottom - r.height * .25), b = P(cx, dy < 0 ? nr.bottom : nr.top);
      const l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'fit-leader'); l.setAttribute('aria-hidden', 'true');
      [['x1', a.x], ['y1', a.y], ['x2', b.x], ['y2', b.y]].forEach(([q, v]) => l.setAttribute(q, v.toFixed(2)));
      t.parentNode.insertBefore(l, t);
    }
  });
  return placed;
}
// 4. room: grow the viewBox (vertically) when a label now reaches past the figure's top or bottom edge
function makeRoom(svg, rects) {
  const vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.height || !rects.length) return;
  const R = svg.getBoundingClientRect(), k = sy(ctm(svg)); if (!k || !R.height) return;
  const top = Math.min(...rects.map(r => r.top)), bot = Math.max(...rects.map(r => r.bottom)), a = Math.max(0, R.top - top + 2) / k, b = Math.max(0, bot - R.bottom + 2) / k;
  if (a < .5 && b < .5) return;
  const w0 = R.width; svg.dataset.fitVb = svg.getAttribute('viewBox') || '';
  svg.setAttribute('viewBox', [vb.x, vb.y - a, vb.width, vb.height + a + b].map(v => +v.toFixed(2)).join(' '));
  // a figure whose height is fixed would scale down to fit: then the text would shrink, so the change is undone
  if (svg.getBoundingClientRect().width < w0 - .5 || sy(ctm(svg)) < k - 1e-3) { svg.setAttribute('viewBox', svg.dataset.fitVb); delete svg.dataset.fitVb; }
}
export function fitSVG(svg, zoom = 1) {
  if (!svg || !svg.isConnected || svg.classList.contains('arcs') || svg.closest('.fit-skip')) return false;
  const w = svg.getBoundingClientRect().width; if (!w) return false;   // in a fold not yet unrolled: laid out once shown
  const texts0 = textsOf(svg), key = [zoom, Math.round(w), texts0.length, texts0.map(t => t.dataset.fitWrap || t.textContent).join('|').length].join(':');
  if (svg._fitKey === key) return false;
  reset(svg); const texts = textsOf(svg); sizeTexts(texts, zoom);
  // animated stages (their labels move by design) keep their own layout: only the sizes are made readable
  const still = !svg.closest('.mo-host, .fit-size-only');
  if (still) {
    const inNode = new Set(); texts.forEach(t => { const n = nodeOf(t); if (n) { fitBox(t, n); inNode.add(t); } });
    const rects = separate(svg, texts, inNode); makeRoom(svg, rects);
  }
  svg._fitKey = [zoom, Math.round(svg.getBoundingClientRect().width), textsOf(svg).length, textsOf(svg).map(t => t.dataset.fitWrap || t.textContent).join('|').length].join(':');
  return true;
}
// every figure in a container (the reader's sheet); svgs that are icons (no text) cost one query each
export function fitAll(root, zoom = 1) {
  if (!root) return 0; let n = 0;
  root.querySelectorAll('svg').forEach(s => { if (s.parentNode && s.parentNode.closest && s.parentNode.closest('svg')) return; try { if (fitSVG(s, zoom)) n++; } catch (e) { console.warn('textfit', e); } });
  return n;
}
