// Maps of the place you are in, in two sizes, as games do it:
//   the minimap (the map button): a small plan in the corner with markers only (an icon on every bookcase or scroll,
//     a badge on every diorama, you as a gilt arrow with your field of view); hovering a marker names it; a click
//     flies there.
//   the full map (M, or ⤢ on the minimap): a large plan over the scene, where every bookcase or scroll carries its
//     whole name on a plate set right beside it on the room side, joined to it by a short leader line when the plate
//     had to move to stay clear of its neighbours (names are measured, then placed: tried beside their feature first,
//     then a step further out, then a step along the wall, never overlapping another name, footprint or diorama).
//     Hovering a footprint, a plate or a line of the legend lights all three. A click flies there and closes the map.
// The plan is redrawn when the place changes (a scroll added, renamed or moved, a diorama added or removed): the
// provider is asked again every second and both plans are redrawn only when what it returns has changed.
// (Cartographic rules followed: a label must never plausibly belong to a neighbouring feature; leader lines only where a
// label cannot sit beside its feature; names wrap at word breaks rather than being cut.)
import { el } from './util.js';
import { iconPath, iconSVG } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); kids.forEach(k => k && e.append(k)); return e; };
const icon = (name, cx, cy, size, cls) => S('g', { class: cls, transform: `translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(3)})` }, [S('path', { d: iconPath(name) })]);

// one plan (minimap or full map) drawn into an SVG of the given pixel size; returns what hover and marking need
// G: { k (px per metre), ox, oy (where the room's corner -w/2,-d/2 is drawn), vw, vh (the SVG's size) }
const fitGeom = (P, box, pad) => { const k = Math.min(box.w / (P.w + pad * 2), box.h / (P.d + pad * 2)); return { k, ox: pad * k, oy: pad * k, vw: (P.w + pad * 2) * k, vh: (P.d + pad * 2) * k }; };
function drawPlan(P, G, { badge, dioBadge }) {
  const { k, ox, oy, vw, vh } = G, pad = 0;
  const X = x => ox + (x + P.w / 2) * k, Z = z => oy + (z + P.d / 2) * k;
  const svg = S('svg', { viewBox: `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`, width: vw.toFixed(0), height: vh.toFixed(0), class: 'map-svg', role: 'img', 'aria-label': 'Plan of ' + P.title });
  svg.append(S('rect', { x: ox, y: oy, width: P.w * k, height: P.d * k, rx: 5, class: 'map-room' }));
  if (P.door) svg.append(S('rect', { x: X(P.door.x) - .9 * k, y: Z(P.door.z) - 3, width: 1.8 * k, height: 6, rx: 2, class: 'map-door' }));
  const groups = [], obstacles = [];
  P.items.forEach((it, i) => {
    const cx = X(it.x), cy = Z(it.z), w = Math.max(10, it.w * k), d = Math.max(8, it.d * k), r = it.rot || 0;
    const g = S('g', { class: 'map-item map-' + it.kind, tabindex: 0, role: 'button', 'aria-label': it.label + (it.sub ? ', ' + it.sub : ''), 'data-i': i });
    g.append(S('rect', { class: 'map-foot', x: (-w / 2).toFixed(1), y: (-d / 2).toFixed(1), width: w.toFixed(1), height: d.toFixed(1), rx: 3, transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(-r * 180 / Math.PI).toFixed(1)})` }));
    g.append(S('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: (badge / 2 + 3).toFixed(1), class: 'map-badge' }), icon(it.icon || (it.kind === 'case' ? 'book' : 'scroll'), cx, cy, badge, 'map-ico'));
    // its footprint, rotated, as an axis-aligned box (for keeping names off it)
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), bw = w * c + d * s, bh = w * s + d * c;
    obstacles.push({ x: cx - bw / 2 - 2, y: cy - bh / 2 - 2, w: bw + 4, h: bh + 4 }, { x: cx - badge / 2 - 4, y: cy - badge / 2 - 4, w: badge + 8, h: badge + 8 });
    (it.dios || []).forEach(dd => { const x = X(dd.x), y = Z(dd.z), q = S('g', { class: 'map-dio', 'data-name': dd.name }); q.append(S('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (dioBadge / 2 + 3).toFixed(1), class: 'map-dio-bg' }), icon(dd.icon || 'cube', x, y, dioBadge, 'map-dio-ico')); g.append(q); obstacles.push({ x: x - dioBadge / 2 - 5, y: y - dioBadge / 2 - 5, w: dioBadge + 10, h: dioBadge + 10 }); });
    groups.push({ g, it, cx, cy, d, n: { x: Math.sin(r), z: Math.cos(r) } });
    svg.append(g);
  });
  const me = S('g', { class: 'map-me' }, [S('path', { d: 'M0 0 L-18 -40 A44 44 0 0 1 18 -40 Z', class: 'map-cone' }), S('path', { d: 'M0 -9 L6 6 L0 3 L-6 6 Z', class: 'map-arrow' })]); svg.append(me);
  return { svg, k, vw, vh, X, Z, groups, obstacles, me, pad };
}
// the camera as the gilt arrow and its field of view
function markMe(D, P, camera) {
  if (!D || !camera) return; const c = camera.position, e = camera.matrixWorld.elements;
  const a = Math.atan2(-e[8], e[10]) * 180 / Math.PI; D.me.setAttribute('transform', `translate(${D.X(c.x).toFixed(1)} ${D.Z(c.z).toFixed(1)}) rotate(${a.toFixed(1)})`);
}
const hit = (r, L) => L.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);

export class MapView {
  // provider(): { title, kind: 'hall' | 'room', w, d, door: {x, z} | null, items: [{ id, kind: 'case' | 'station', x, z, w, d, rot,
  //   label, sub, icon, dios: [{ name, icon, x, z }] }] }   (rot: the way the footprint faces into the room, about y)
  constructor(host, { provider, camera, onPick, onIcon = null, onSymbols = null, key = 'sm-map-open' }) {
    Object.assign(this, { provider, camera, onPick, onIcon, onSymbols, key, host });
    this.btn = el('button', { class: 'map-btn glass', type: 'button', title: 'Minimap: show or fold it (the full map: M)', 'aria-label': 'Minimap', 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>', onclick: () => this.toggle() });
    this.card = el('aside', { class: 'map-card glass', 'aria-label': 'Minimap', hidden: true });
    this.tip = el('div', { class: 'map-tip', hidden: true, role: 'tooltip' });
    host.append(this.btn, this.card); document.body.append(this.tip); this.sig = ''; this.t = 0;
    this.onKey = e => {
      if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); this.full ? this.closeFull() : this.openFull(); }
      else if (e.key === 'Escape' && this.full) { e.stopPropagation(); this.closeFull(); }
    };
    addEventListener('keydown', this.onKey, true);
    let open = false; try { open = localStorage.getItem(key) === '1'; } catch (e) { } if (open) this.toggle(true);
  }
  toggle(on = this.card.hidden) { this.card.hidden = !on; this.btn.setAttribute('aria-expanded', String(on)); this.btn.classList.toggle('on', on); try { localStorage.setItem(this.key, on ? '1' : '0'); } catch (e) { } if (on) { this.sig = ''; this.update(1); } }
  // called by the place every frame; cheap when both maps are closed
  update(dt) {
    if (this.card.hidden && !this.full) return; this.t += dt;
    if (this.t >= 1 || !this.sig) { this.t = 0; let P; try { P = this.provider(); } catch (e) { return; } const sig = JSON.stringify(P); if (sig !== this.sig) { this.sig = sig; this.P = P; if (!this.card.hidden) this.drawMini(P); if (this.full) this.drawFull(P); } }
    if (!this.card.hidden) markMe(this.mini, this.P, this.camera); if (this.full) markMe(this.fullD, this.P, this.camera);
  }
  // hover: a name in a small plate by the pointer (the minimap), and the item lit wherever it appears
  wire(g, it, i, withTip) {
    const pick = () => { this.hideTip(); if (this.full) this.closeFull(); this.onPick && this.onPick(it); };
    g.addEventListener('click', e => { e.stopPropagation(); pick(); }); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    g.addEventListener('pointerenter', () => this.hot(i, true)); g.addEventListener('pointerleave', () => { this.hot(i, false); this.hideTip(); });
    if (withTip) g.addEventListener('pointermove', e => { const d = e.target.closest && e.target.closest('.map-dio'); this.showTip(e, d ? d.dataset.name : it.label, d ? 'diorama · ' + it.label : it.sub); });
    else g.querySelectorAll('.map-dio').forEach(d => d.addEventListener('pointermove', e => { e.stopPropagation(); this.showTip(e, d.dataset.name, 'diorama'); }));
  }
  showTip(e, name, sub) { const T = this.tip; T.hidden = false; T.innerHTML = ''; T.append(el('b', { text: name }), sub ? el('span', { text: sub }) : ''); const x = Math.min(innerWidth - T.offsetWidth - 8, e.clientX + 14), y = Math.min(innerHeight - T.offsetHeight - 8, e.clientY + 16); T.style.transform = `translate(${x}px, ${y}px)`; }
  hideTip() { this.tip.hidden = true; }
  hot(i, on) { document.querySelectorAll(`.map-item[data-i="${i}"], .fm-label[data-i="${i}"], .fm-lead[data-i="${i}"], .map-legend li[data-i="${i}"]`).forEach(n => n.classList.toggle('hot', on)); }
  // ---------- the minimap ----------
  drawMini(P) {
    const D = drawPlan(P, fitGeom(P, { w: 288, h: 230 }, .5), { badge: 15, dioBadge: 10 }); this.mini = D;
    D.groups.forEach(({ g, it }, i) => this.wire(g, it, i, true));
    const head = el('div', { class: 'map-head' }, [el('b', { text: P.title }), el('span', { class: 'map-tools' }, [el('button', { class: 'ibtn map-expand', type: 'button', title: 'The full map, with every name (M)', 'aria-label': 'Open the full map', html: '⤢', onclick: () => this.openFull() }), el('button', { class: 'ibtn map-fold', type: 'button', title: 'Fold the minimap away (the map button brings it back; remembered)', 'aria-label': 'Fold the minimap', html: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', onclick: () => { this.toggle(false); this.btn.focus(); } })])]);
    this.card.innerHTML = ''; this.card.append(head, D.svg, el('div', { class: 'map-hint dim small', text: `${P.items.length} ${P.kind === 'hall' ? 'bookcase' : 'scroll'}${P.items.length === 1 ? '' : 's'} · hover to name · M for the full map` }));
  }
  // ---------- the full map ----------
  openFull() {
    if (this.full) return; this.hideTip();
    this.full = el('div', { class: 'fullmap', role: 'dialog', 'aria-label': 'Map', tabindex: -1 });
    this.full.addEventListener('click', e => { if (e.target === this.full) this.closeFull(); });
    document.body.append(this.full); void this.full.offsetWidth; this.full.classList.add('in');   /* the fade starts from a forced layout, not a later frame */
    this.sig = ''; this.update(1); this.full.focus();
  }
  closeFull() { const F = this.full; if (!F) return; this.full = null; this.fullD = null; this.hideTip(); F.classList.remove('in'); setTimeout(() => F.remove(), 260); }
  drawFull(P) {
    const F = this.full; F.innerHTML = '';
    const plate = el('div', { class: 'fm-plan' }), legend = el('ol', { class: 'map-legend fm-legend' });
    const panel = el('div', { class: 'fm-panel glass' }, [
      el('div', { class: 'fm-head' }, [el('div', {}, [el('div', { class: 'fm-kicker', text: P.kind === 'hall' ? 'The library hall' : 'The room' }), el('h2', { text: P.kind === 'hall' ? 'Map of the hall' : P.title })]), el('div', { class: 'fm-actions' }, [this.onSymbols ? el('button', { class: 'btn fm-sym', type: 'button', title: 'Search the symbol library and give a symbol to a ' + (P.kind === 'hall' ? 'bookcase' : 'scroll'), html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M17 14v6 M14 17h6"/></svg> Select symbol', onclick: () => this.onSymbols(null) }) : null, el('button', { class: 'btn', text: 'Close · M', onclick: () => this.closeFull() })])]),
      el('div', { class: 'fm-body' }, [plate, el('div', { class: 'fm-side' }, [el('div', { class: 'fm-count dim small', text: `${P.items.length} ${P.kind === 'hall' ? 'bookcase' : 'scroll'}${P.items.length === 1 ? '' : 's'}` + (P.kind === 'room' ? ` · ${P.items.reduce((a, it) => a + (it.dios || []).length, 0)} dioramas` : '') }), legend])])]);
    F.append(panel);
    // Names are placed as on an annotated plan (boundary labelling): every footprint against a wall has its name in a
    // column (or row) outside that wall, in the same order as along the wall, joined by a leader that leaves straight
    // through the wall and bends once to its plate, so leaders never cross and the room's interior stays clear for the
    // footprints and the dioramas. Footprints standing free in the room (islands) keep their name on a plate beside them.
    const r = plate.getBoundingClientRect(), AW = Math.max(480, r.width - 4), AH = Math.max(360, r.height - 4);
    const meas = el('div', { class: 'fm-wrap', style: 'position:absolute;visibility:hidden;left:0;top:0;width:2400px;height:10px' });   /* wide: a plate measured in a narrow box would wrap after every word */ plate.append(meas);
    const L = P.items.map((it, i) => { const b = el('button', { class: 'fm-label fm-' + it.kind, type: 'button', 'data-i': i, title: it.label + (it.sub ? ' · ' + it.sub : '') }, [el('span', { class: 'fm-lico', html: iconSVG(it.icon || 'book', 15) }), el('span', { class: 'fm-txt' }, [el('b', { text: it.label }), it.sub ? el('span', { text: it.sub }) : null])]); meas.append(b); return b; });
    const wallOf = it => { const d = { left: it.x + P.w / 2, right: P.w / 2 - it.x, top: it.z + P.d / 2, bottom: P.d / 2 - it.z }; const m = Object.entries(d).sort((x, y) => x[1] - y[1])[0]; return m[1] < 1.6 ? m[0] : 'in'; };
    const walls = { left: [], right: [], top: [], bottom: [], in: [] }; P.items.forEach((it, i) => { L[i].classList.add('fm-' + wallOf(it)); });
    P.items.forEach((it, i) => walls[wallOf(it)].push(i));
    const sz = L.map(b => ({ w: b.offsetWidth, h: b.offsetHeight })), GAP = 6, LEAD = 26;
    const colW = side => walls[side].length ? Math.max(...walls[side].map(i => sz[i].w)) + LEAD + 8 : 12;
    // rows above / below: as many as it takes for the names to fit side by side
    const rowsFor = (side, avail) => { const n = walls[side]; if (!n.length) return 0; const tot = n.reduce((a, i) => a + sz[i].w + GAP, 0); return Math.min(6, Math.max(1, Math.ceil(tot / Math.max(180, avail * .94)))); };
    const mL = colW('left'), mR = colW('right'), hOf = side => Math.max(24, ...walls[side].map(i => sz[i].h)), hT = hOf('top'), hB = hOf('bottom');
    // the rows above and below may only use the plan's own width (beside it stand the columns); how many rows that takes
    // depends on the scale, and the scale on how much height the rows take: settle both by a few rounds
    let rT = 1, rB = 1, k = 1, pw = 0, ph = 0, mT = 0, mB = 0;
    for (let round = 0; round < 4; round++) {
      mT = rT && walls.top.length ? rT * (hT + GAP) + LEAD : 14; mB = (rB && walls.bottom.length ? rB * (hB + GAP) + LEAD : 14) + 18;
      k = Math.min((AW - mL - mR) / P.w, (AH - mT - mB) / P.d); pw = P.w * k; ph = P.d * k;
      rT = rowsFor('top', mL + pw + mR - 8); rB = rowsFor('bottom', mL + pw + mR - 8);   /* rows may run above the columns too (they start at the plan's edge) */
    }
    mT = rT ? rT * (hT + GAP) + LEAD : 14; mB = (rB ? rB * (hB + GAP) + LEAD : 14) + 18;
    k = Math.min((AW - mL - mR) / P.w, (AH - mT - mB) / P.d); pw = P.w * k; ph = P.d * k;
    const vw = mL + pw + mR, vh = mT + ph + mB, ox = mL, oy = mT;
    const D = drawPlan(P, { k, ox, oy, vw, vh }, { badge: 24, dioBadge: 17 }); this.fullD = D; meas.remove();
    const wrap = el('div', { class: 'fm-wrap', style: `width:${vw.toFixed(0)}px;height:${vh.toFixed(0)}px` }, [D.svg]); plate.append(wrap);
    const leads = S('g', { class: 'fm-leads' }); D.svg.insertBefore(leads, D.me);
    // order-keeping spread of intervals along a line: wanted centres c, sizes s, kept within [lo, hi]
    const spread = (c, s2, lo, hi) => { const n = c.length, p = c.slice(); for (let i = 0; i < n; i++) { p[i] = Math.max(p[i], lo + s2[i] / 2); if (i) p[i] = Math.max(p[i], p[i - 1] + (s2[i - 1] + s2[i]) / 2 + GAP); } for (let i = n - 1; i >= 0; i--) { p[i] = Math.min(p[i], hi - s2[i] / 2); if (i < n - 1) p[i] = Math.min(p[i], p[i + 1] - (s2[i + 1] + s2[i]) / 2 - GAP); } return p; };
    const put = (i, x, y) => { L[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; wrap.append(L[i]); };
    // a leader leaves its icon's ring at the ring's edge, towards its first bend (not from the icon's centre)
    const RING = 24 / 2 + 3;
    const lead = (i, pts) => { const [c, nx] = pts, dx = nx[0] - c[0], dy = nx[1] - c[1], L = Math.hypot(dx, dy) || 1; const p0 = [c[0] + dx / L * RING, c[1] + dy / L * RING];
      leads.append(S('path', { class: 'fm-lead', 'data-i': i, d: 'M' + [p0, ...pts.slice(1)].map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') })); };
    const g = i => D.groups[i];
    for (const side of ['left', 'right']) {   // columns beside the plan
      const ids = walls[side].sort((a, b) => g(a).cy - g(b).cy); if (!ids.length) continue;
      const ys = spread(ids.map(i => g(i).cy), ids.map(i => sz[i].h), Math.max(4, oy - 14), Math.min(vh - 4, oy + ph + 14)), xw = side === 'left' ? ox : ox + pw;
      ids.forEach((i, j) => { const { w, h } = sz[i], x = side === 'left' ? xw - LEAD - w : xw + LEAD, y = ys[j] - h / 2, ex = side === 'left' ? x + w : x;
        put(i, x, y); lead(i, [[g(i).cx, g(i).cy], [xw + (side === 'left' ? -8 : 8), g(i).cy], [ex, ys[j]]]); });
    }
    for (const side of ['top', 'bottom']) {   // rows above and below, the nearest row first
      const ids = walls[side].sort((a, b) => g(a).cx - g(b).cx); if (!ids.length) continue; const rows = side === 'top' ? rT : rB;
      for (let rI = 0; rI < rows; rI++) {
        const mine = ids.filter((_, j) => j % rows === rI); if (!mine.length) continue;
        const xs = spread(mine.map(i => g(i).cx), mine.map(i => sz[i].w), 4, vw - 4), yw = side === 'top' ? oy : oy + ph, hR = side === 'top' ? hT : hB;
        mine.forEach((i, j) => { const { w, h } = sz[i], off = LEAD + rI * (hR + GAP), y = side === 'top' ? yw - off - h : yw + off, x = xs[j] - w / 2, ey = side === 'top' ? y + h : y;
          put(i, x, y); lead(i, [[g(i).cx, g(i).cy], [g(i).cx, yw + (side === 'top' ? -8 : 8)], [xs[j], ey]]); });
      }
    }
    // islands: a plate beside the footprint on whichever side is free
    const taken = [...D.obstacles]; P.items.forEach((_, i) => { if (L[i].isConnected) { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(L[i].style.transform); if (m) taken.push({ x: +m[1] - 3, y: +m[2] - 3, w: sz[i].w + 6, h: sz[i].h + 6 }); } });
    walls.in.forEach(i => { const { cx, cy, d } = g(i), { w, h } = sz[i];
      const cands = [[cx - w / 2, cy + d / 2 + 14], [cx - w / 2, cy - d / 2 - 14 - h], [cx + d / 2 + 16, cy - h / 2], [cx - d / 2 - 16 - w, cy - h / 2]];
      let best = null; for (let step = 0; step < 6 && !best; step++) for (const [x0, y0] of cands) { const R = { x: x0, y: y0 + (y0 > cy ? 1 : -1) * step * (h + GAP), w, h }; if (!hit(R, taken)) { best = R; break; } }
      best = best || { x: cands[0][0], y: cands[0][1], w, h }; taken.push(best); put(i, best.x, best.y);
      const tx = Math.min(best.x + w, Math.max(best.x, cx)), ty = Math.min(best.y + h, Math.max(best.y, cy)); lead(i, [[cx, cy], [tx, ty]]); });
    P.items.forEach((it, i) => {
      this.wire(g(i).g, it, i, false);
      L[i].addEventListener('click', () => { this.closeFull(); this.onPick && this.onPick(it); }); L[i].addEventListener('pointerenter', () => this.hot(i, true)); L[i].addEventListener('pointerleave', () => this.hot(i, false));
      legend.append(el('li', { 'data-i': i, tabindex: 0, onclick: () => { this.closeFull(); this.onPick && this.onPick(it); }, onpointerenter: () => this.hot(i, true), onpointerleave: () => this.hot(i, false) }, [
        this.onIcon ? el('button', { class: 'map-lico', type: 'button', title: 'Select a symbol', 'aria-label': 'Select a symbol for ' + it.label, html: iconSVG(it.icon || 'book', 18), onclick: e => { e.stopPropagation(); this.onIcon(it); } }) : el('span', { class: 'map-lico', html: iconSVG(it.icon || 'book', 18) }),
        el('div', {}, [el('b', { text: it.label }), it.sub ? el('span', { class: 'dim', text: ' ' + it.sub }) : null,
          (it.dios || []).length ? el('div', { class: 'map-dios' }, it.dios.map(dd => el('span', { class: 'map-dchip' }, [el('span', { class: 'map-dico', html: iconSVG(dd.icon || 'cube', 14) }), el('span', { text: dd.name })]))) : null])]));
    });
    if (P.door) { const t = el('div', { class: 'fm-door', text: 'door' }); wrap.append(t); const x = D.X(P.door.x), y = D.Z(P.door.z); t.style.transform = `translate(${(x - t.offsetWidth / 2).toFixed(1)}px, ${(y > D.vh / 2 ? y - t.offsetHeight - 6 : y + 8).toFixed(1)}px)`; }
    markMe(D, P, this.camera);
  }
  dispose() { removeEventListener('keydown', this.onKey, true); this.closeFull(); this.btn.remove(); this.card.remove(); this.tip.remove(); }
}
