// The map of the place you are in (M, or the map button): a top-down plan drawn from the live scene. The hall shows
// its bookcases with their names, how many scrolls they hold and what about; a book's room shows its chapter scrolls
// in reading order with the dioramas on their pedestals. It redraws itself when the place changes (a scroll added,
// renamed or moved, a diorama added or removed): the provider is asked again every second and the plan is redrawn
// only when what it returns has changed. You stand on it as a gilt marker with your field of view; a click on a
// bookcase or a scroll takes you there.
import { el } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); kids.forEach(k => k && e.append(k)); return e; };
export class MapView {
  // provider(): { title, w, d, door: {x, z} | null, items: [{ id, kind: 'case' | 'station', x, z, w, d, rot, label, sub, n, pins: [names] }] }
  // camera: the place's camera; onPick(item)
  constructor(host, { provider, camera, onPick, key = 'sm-map-open' }) {
    Object.assign(this, { provider, camera, onPick, key });
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
  draw(P) {
    this.P = P; const pad = .6, W = P.w + pad * 2, D = P.d + pad * 2, k = 260 / Math.max(W, D), vw = W * k, vh = D * k; this.k = k; this.pad = pad;
    const X = x => (x + P.w / 2 + pad) * k, Z = z => (z + P.d / 2 + pad) * k;
    const svg = S('svg', { viewBox: `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`, width: vw.toFixed(0), height: vh.toFixed(0), class: 'map-svg', role: 'img', 'aria-label': 'Plan of ' + P.title });
    svg.append(S('rect', { x: pad * k, y: pad * k, width: P.w * k, height: P.d * k, rx: 3, class: 'map-room' }));
    if (P.door) svg.append(S('rect', { x: X(P.door.x) - .9 * k, y: Z(P.door.z) - 3, width: 1.8 * k, height: 6, class: 'map-door' }), S('text', { x: X(P.door.x), y: Z(P.door.z) > vh / 2 ? Z(P.door.z) - 8 : Z(P.door.z) + 16, class: 'map-small', 'text-anchor': 'middle' }, [document.createTextNode('door')]));
    const tips = [];
    P.items.forEach((it, i) => {
      const g = S('g', { class: 'map-item map-' + it.kind, transform: `translate(${X(it.x).toFixed(1)} ${Z(it.z).toFixed(1)}) rotate(${(-(it.rot || 0) * 180 / Math.PI).toFixed(1)})`, tabindex: 0, role: 'button', 'aria-label': it.label + (it.sub ? ', ' + it.sub : '') });
      g.append(S('rect', { x: -it.w * k / 2, y: -it.d * k / 2, width: Math.max(4, it.w * k), height: Math.max(4, it.d * k), rx: 2 }));
      (it.pins || []).forEach((p, j, A) => g.append(S('circle', { cx: (j - (A.length - 1) / 2) * 9, cy: it.d * k / 2 + 8, r: 3.4, class: 'map-pin' })));
      if (it.kind === 'station') g.append(S('text', { x: 0, y: 4, class: 'map-num', 'text-anchor': 'middle' }, [document.createTextNode(String(it.n))]));
      const pick = () => this.onPick && this.onPick(it); g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      g.addEventListener('pointerenter', () => this.legend.querySelectorAll('li')[i] && this.legend.querySelectorAll('li')[i].classList.add('hot'));
      g.addEventListener('pointerleave', () => this.legend.querySelectorAll('li.hot').forEach(l => l.classList.remove('hot')));
      svg.append(g);
    });
    this.me = S('g', { class: 'map-me' }, [S('path', { d: 'M0 0 L-16 -34 A37 37 0 0 1 16 -34 Z', class: 'map-cone' }), S('circle', { r: 5 })]); svg.append(this.me);
    // the legend: every bookcase or scroll by name, with what it holds (the plan itself stays uncluttered)
    this.legend = el('ol', { class: 'map-legend' }, P.items.map(it => el('li', { tabindex: -1, onclick: () => this.onPick && this.onPick(it) }, [el('b', { text: (it.kind === 'station' ? it.n + ' · ' : '') + it.label }), it.sub ? el('span', { class: 'dim', text: ' ' + it.sub }) : null, (it.pins || []).length ? el('span', { class: 'map-dios', text: '◆ ' + it.pins.join(' · ') }) : null])));
    this.card.innerHTML = ''; this.card.append(el('div', { class: 'map-head' }, [el('b', { text: P.title }), el('span', { class: 'dim small', text: P.items.length + (P.items[0] && P.items[0].kind === 'case' ? ' bookcase' : ' scroll') + (P.items.length === 1 ? '' : 's') })]), svg, this.legend);
  }
  mark() {
    if (!this.me || !this.P || !this.camera) return; const c = this.camera.position, k = this.k, P = this.P;
    const x = (c.x + P.w / 2 + this.pad) * k, z = (c.z + P.d / 2 + this.pad) * k; const d = { x: 0, z: 0 }; const e = this.camera.matrixWorld.elements; d.x = -e[8]; d.z = -e[10];
    const a = Math.atan2(d.x, -d.z) * 180 / Math.PI; this.me.setAttribute('transform', `translate(${x.toFixed(1)} ${z.toFixed(1)}) rotate(${a.toFixed(1)})`);
  }
  dispose() { removeEventListener('keydown', this.onKey); this.btn.remove(); this.card.remove(); }
}

