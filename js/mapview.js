// The map of the place you are in (M, or the map button): a top-down plan drawn from the live scene. The hall shows
// its bookcases with their names, how many scrolls they hold and what about; a book's room shows its chapter scrolls
// in reading order with the dioramas on their pedestals. It redraws itself when the place changes (a scroll added,
// renamed or moved, a diorama added or removed): the provider is asked again every second and the plan is redrawn
// only when what it returns has changed. You stand on it as a gilt marker with your field of view; a click on a
// bookcase or a scroll takes you there.
import { el } from './util.js';
import { iconPath, iconSVG } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); kids.forEach(k => k && e.append(k)); return e; };
export class MapView {
  // provider(): { title, kind: 'hall' | 'room', w, d, door: {x, z} | null, items: [{ id, kind: 'case' | 'station', x, z, w, d, rot, label, sub, icon,
  //   dios: [{ name, icon, x, z }] }] }   (rot: the way the footprint faces into the room, as an angle about y)
  // camera: the place's camera; onPick(item)
  constructor(host, { provider, camera, onPick, onIcon = null, key = 'sm-map-open' }) {
    Object.assign(this, { provider, camera, onPick, onIcon, key });
    this.btn = el('button', { class: 'map-btn glass', type: 'button', title: 'Map of this place (M)', 'aria-label': 'Map', 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>', onclick: () => this.toggle() });
    this.card = el('aside', { class: 'map-card glass', 'aria-label': 'Map', hidden: true });
    host.append(this.btn, this.card); this.sig = ''; this.t = 0;
    this.onKey = e => { if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.key === 'm' || e.key === 'M') this.toggle(); };
    addEventListener('keydown', this.onKey);
    let open = false; try { open = localStorage.getItem(key) === '1'; } catch (e) { } if (open) this.toggle(true);
  }
  toggle(on = this.card.hidden) { this.card.hidden = !on; this.btn.setAttribute('aria-expanded', String(on)); this.btn.classList.toggle('on', on); try { localStorage.setItem(this.key, on ? '1' : '0'); } catch (e) { } if (on) { this.sig = ''; this.update(1); } }
  // called by the place every frame; cheap when closed
  update(dt) {
    if (this.card.hidden) return; this.t += dt;
    if (this.t >= 1 || !this.sig) { this.t = 0; let P; try { P = this.provider(); } catch (e) { return; } const sig = JSON.stringify(P); if (sig !== this.sig) { this.sig = sig; this.draw(P); } }
    this.mark();
  }
  // The plan: the place's outline and door; every bookcase or chapter scroll as its footprint with its icon on it and
  // its name written beside it, on the side that faces into the room (labels nudged apart when two would collide);
  // in a room, each diorama as its own icon where its pedestal stands. Hovering any of them names it in full and lights
  // its line in the legend below; a click flies there.
  draw(P) {
    this.P = P; const pad = .9, W = P.w + pad * 2, D = P.d + pad * 2, k = 372 / Math.max(W, D), vw = W * k, vh = D * k; this.k = k; this.pad = pad;
    const X = x => (x + P.w / 2 + pad) * k, Z = z => (z + P.d / 2 + pad) * k, cut = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
    const svg = S('svg', { viewBox: `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`, class: 'map-svg', role: 'img', 'aria-label': 'Plan of ' + P.title });
    svg.append(S('rect', { x: pad * k, y: pad * k, width: P.w * k, height: P.d * k, rx: 4, class: 'map-room' }));
    if (P.door) svg.append(S('rect', { x: X(P.door.x) - .9 * k, y: Z(P.door.z) - 3, width: 1.8 * k, height: 6, class: 'map-door' }), S('text', { x: X(P.door.x), y: Z(P.door.z) > vh / 2 ? Z(P.door.z) - 8 : Z(P.door.z) + 16, class: 'map-small', 'text-anchor': 'middle' }, [document.createTextNode('door')]));
    const icon = (name, cx, cy, size, cls) => S('g', { class: cls, transform: `translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(3)})` }, [S('path', { d: iconPath(name) })]);
    const boxes = [], hit = r => boxes.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    const layer = S('g'), labels = S('g', { class: 'map-labels' }); svg.append(layer);
    const hot = (i, on) => { const L = this.legend && this.legend.children[i]; if (L) L.classList.toggle('hot', on); const g = layer.children[i]; if (g) g.classList.toggle('hot', on); };
    P.items.forEach((it, i) => {
      const cx = X(it.x), cy = Z(it.z), w = Math.max(10, it.w * k), d = Math.max(7, it.d * k), r = it.rot || 0, nx = Math.sin(r), nz = Math.cos(r);
      const g = S('g', { class: 'map-item map-' + it.kind, tabindex: 0, role: 'button', 'aria-label': it.label + (it.sub ? ', ' + it.sub : '') }, [S('title', {}, [document.createTextNode(it.label + (it.sub ? ' · ' + it.sub : ''))])]);
      g.append(S('rect', { x: (-w / 2).toFixed(1), y: (-d / 2).toFixed(1), width: w.toFixed(1), height: d.toFixed(1), rx: 2.5, transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(-r * 180 / Math.PI).toFixed(1)})` }));
      g.append(icon(it.icon || (it.kind === 'case' ? 'book' : 'scroll'), cx, cy, Math.min(15, Math.max(10, Math.min(w, d) + 4)), 'map-ico'));
      // the name, beside the footprint on its room side
      const txt = cut(it.label || '', it.kind === 'case' ? 22 : 24), tw = txt.length * 5.7 + 6, th = 13, gap = Math.max(d / 2 + 9, ...(it.dios || []).map(q => ((q.x - it.x) * nx + (q.z - it.z) * nz) * k + 13));   /* beyond its dioramas */
      let lx = cx + nx * (gap + (Math.abs(nx) > .7 ? tw / 2 : 0)), ly = cy + nz * (gap + (Math.abs(nz) > .7 ? th / 2 : 0)) + 4;
      lx = Math.min(vw - tw / 2 - 2, Math.max(tw / 2 + 2, lx)); ly = Math.min(vh - 4, Math.max(th, ly));
      let R = { x: lx - tw / 2, y: ly - th + 3, w: tw, h: th }; for (let t = 0; t < 6 && hit(R); t++) { const s = (t % 2 ? -1 : 1) * Math.ceil((t + 1) / 2) * 13; R = { ...R, y: ly - th + 3 + s }; } boxes.push(R);
      labels.append(S('text', { x: (R.x + R.w / 2).toFixed(1), y: (R.y + th - 3).toFixed(1), class: 'map-label', 'text-anchor': 'middle' }, [document.createTextNode(txt)]));
      // dioramas where their pedestals stand
      (it.dios || []).forEach(dd => { const q = icon(dd.icon || 'cube', X(dd.x), Z(dd.z), 12, 'map-dio'); q.prepend(S('title', {}, [document.createTextNode(dd.name)])); q.insertBefore(S('circle', { cx: 12, cy: 12, r: 14, class: 'map-dio-bg' }), q.firstChild.nextSibling); g.append(q); });
      const pick = () => this.onPick && this.onPick(it); g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      g.addEventListener('pointerenter', () => hot(i, true)); g.addEventListener('pointerleave', () => hot(i, false));
      layer.append(g);
    });
    svg.append(labels);
    this.me = S('g', { class: 'map-me' }, [S('path', { d: 'M0 0 L-16 -34 A37 37 0 0 1 16 -34 Z', class: 'map-cone' }), S('circle', { r: 5 })]); svg.append(this.me);
    // the legend: every bookcase or scroll by icon and name, what it holds, and (in a room) its dioramas
    this.legend = el('ol', { class: 'map-legend' }, P.items.map((it, i) => el('li', { tabindex: -1, onclick: () => this.onPick && this.onPick(it), onpointerenter: () => hot(i, true), onpointerleave: () => hot(i, false) }, [
      this.onIcon ? el('button', { class: 'map-lico', type: 'button', title: 'Choose an icon', 'aria-label': 'Choose an icon for ' + it.label, html: iconSVG(it.icon || 'book', 16), onclick: e => { e.stopPropagation(); this.onIcon(it); } }) : el('span', { class: 'map-lico', html: iconSVG(it.icon || 'book', 16) }), el('div', {}, [el('b', { text: it.label }), it.sub ? el('span', { class: 'dim', text: ' ' + it.sub }) : null,
        (it.dios || []).length ? el('div', { class: 'map-dios' }, it.dios.map(dd => el('span', { class: 'map-dchip' }, [el('span', { class: 'map-dico', html: iconSVG(dd.icon || 'cube', 13) }), el('span', { text: dd.name })]))) : null])])));
    this.card.innerHTML = ''; this.card.append(el('div', { class: 'map-head' }, [el('b', { text: P.title }), el('span', { class: 'dim small', text: P.items.length + (P.kind === 'hall' ? ' bookcase' : ' scroll') + (P.items.length === 1 ? '' : 's') })]), svg, this.legend);
  }
  mark() {
    if (!this.me || !this.P || !this.camera) return; const c = this.camera.position, k = this.k, P = this.P;
    const x = (c.x + P.w / 2 + this.pad) * k, z = (c.z + P.d / 2 + this.pad) * k; const d = { x: 0, z: 0 }; const e = this.camera.matrixWorld.elements; d.x = -e[8]; d.z = -e[10];
    const a = Math.atan2(d.x, -d.z) * 180 / Math.PI; this.me.setAttribute('transform', `translate(${x.toFixed(1)} ${z.toFixed(1)}) rotate(${a.toFixed(1)})`);
  }
  dispose() { removeEventListener('keydown', this.onKey); this.btn.remove(); this.card.remove(); }
}

