// The Director: documentary-style presentation of what happens in a diorama.
// Principles taken from science documentaries and world-class interactive demos:
//  - one idea at a time: events become "beats" in a queue; a beat is shown fully before the next one
//  - the camera goes to the idea: each beat frames its subject (push-in, gentle orbit), never cutting
//  - reading time is guaranteed: a callout stays for (words / reading speed + a base), and simulated time
//    slows down (time dilation) while the viewer reads, so the process can still be seen as it is described
//  - text sits next to the thing it describes (a callout with a leader line), not in a far corner
//  - optional guides: animated arrows show the direction an object is moving and links between the
//    objects a sentence names (cause → effect)
//  - the viewer stays in charge: grabbing the camera pauses the director's camera for a few seconds
import * as THREE from 'three';
import { el, esc, clamp } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PACE = { slow: 150, normal: 210, fast: 300 };   // words per minute
const NS = 'http://www.w3.org/2000/svg';

export class Director {
  constructor(view, host) {
    this.v = view; this.queue = []; this.beat = null; this.timeScale = 1; this.hold = 0;
    const st = view.prefs; this.cinematic = st.cinematic !== false; this.guides = !!st.guides; this.pace = st.pace || 'normal';
    this.layer = el('div', { class: 'director' }); host.append(this.layer);
    this.svg = document.createElementNS(NS, 'svg'); this.svg.setAttribute('class', 'dir-svg'); this.layer.append(this.svg);
    this.svg.innerHTML = '<defs><marker id="dir-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd98a"/></marker></defs>';
    this.caption = el('div', { class: 'dir-caption', hidden: true }); this.layer.append(this.caption);
    this.trail = new Map();      // object → recent screen positions (for motion arrows)
  }
  dispose() { this.layer.remove(); }
  readTime(text) { const words = String(text || '').trim().split(/\s+/).length; return clamp(1.6 + words / PACE[this.pace] * 60, 3, 14); }
  userGrab() { this.hold = 6; }

  // ---------- beats ----------
  // beat: {kind:'event'|'lesson'|'explain', title, text, anchor:()=>Vector3|null, focus:Object3D|null, names:[actor...]}
  push(beat) {
    if (!beat || !beat.text) return;
    // de-duplicate: the same sentence already queued or showing
    if ((this.beat && this.beat.text === beat.text) || this.queue.some(b => b.text === beat.text)) return;
    if (this.queue.length > 4) this.queue.splice(1, this.queue.length - 4);   // keep the newest few, never flood
    this.queue.push(beat); if (!this.beat) this.nextBeat();
  }
  setCaption(title, text) { this.caption.hidden = false; this.caption.innerHTML = `<b>${esc(title || '')}</b> ${esc(text || '')}`; }
  clearCaption() { this.caption.hidden = true; }
  idle() { return !this.beat && !this.queue.length; }
  clear() { this.queue = []; this.endBeat(true); }
  nextBeat() {
    const b = this.queue.shift(); this.beat = b || null; if (!b) { this.timeScale = 1; return; }
    b.t = 0; b.dur = b.dur || this.readTime((b.title || '') + ' ' + b.text) + (b.kind === 'lesson' ? 1.2 : 0);
    // time dilation: slow the simulation while an event is being read (the process keeps moving, slowly)
    // (only during an instructed step: free exploration keeps its own camera and pace)
    const inStep = this.v.running != null || b.kind !== 'event';
    this.targetScale = this.cinematic && b.kind === 'event' && inStep ? .3 : 1;
    // the shot
    if (this.cinematic && inStep && this.hold <= 0) this.frame(b);
    // the callout, beside what it describes
    b.el = el('div', { class: 'callout k-' + b.kind }, [
      el('div', { class: 'co-kicker', text: b.kind === 'event' ? 'Now' : b.kind === 'lesson' ? (b.title || 'Step') : 'Why' }),
      el('div', { class: 'co-text', html: esc(b.text) }), el('div', { class: 'co-time' }, [el('i')])]);
    this.layer.append(b.el); requestAnimationFrame(() => b.el && b.el.classList.add('in'));
    b.line = document.createElementNS(NS, 'path'); b.line.setAttribute('class', 'co-line'); this.svg.append(b.line);
    b.dot = el('div', { class: 'co-dot' }); this.layer.append(b.dot);
    if (this.guides) this.makeGuides(b);
    this.v.highlightPins && this.v.highlightPins([b.host, ...(b.names || [])].filter(Boolean));
  }
  endBeat(all) {
    const b = this.beat; if (b) { const e = b.el; e && e.classList.remove('in'); setTimeout(() => e && e.remove(), 450); b.line && b.line.remove(); b.dot && b.dot.remove(); (b.guides || []).forEach(g => g.remove()); }
    this.beat = null; this.v.highlightPins && this.v.highlightPins(null); if (all) { this.timeScale = 1; return; } this.nextBeat();
  }
  // choose a camera shot for a beat: push in on the subject, keep a three-quarter view, drift around it
  frame(b) {
    const v = this.v; let p = b.anchor && b.anchor(); if (!p) return;
    let r = .8;
    if (b.focus && !b.dist) { const bx = new THREE.Box3().setFromObject(b.focus); if (!bx.isEmpty()) { r = bx.getSize(V3()).length() * .5; p = bx.getCenter(V3()); } }
    const R = v.ds.orb ? v.ds.orb.r : 10;
    const dist = b.dist || clamp(r * 3.2, R * .22, R * .62);
    v.flyTo(p, dist, 1.6, b.kind === 'event' ? 18 : 10);
    this.orbit = { center: p.clone(), rate: (Math.random() < .5 ? -1 : 1) * .06 };
  }
  // guides: an arrow from the callout into the subject, motion arrows for moving bodies, links between named actors
  makeGuides(b) {
    b.guides = [];
    const mk = cls => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); p.setAttribute('marker-end', 'url(#dir-ah)'); this.svg.append(p); b.guides.push(p); return p; };
    b.motion = mk('guide motion'); b.wtrail = [];
    b.links = (b.names || []).slice(0, 3).map(a => ({ a, path: mk('guide link') }));   // the named objects already carry their pins
    // process arrows supplied by the model for this event (DIO.<type>.flows): what pushes what, where
    b.flowEls = (b.flows || []).slice(0, 4).map(f => {
      const path = mk('guide flow'), t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'guide-label'); t.textContent = f.label || ''; this.svg.append(t); b.guides.push(t);
      return { f, path, t };
    });
  }
  // ---------- per frame ----------
  update(dt, cam, w, h) {
    this.hold = Math.max(0, this.hold - dt);
    this.timeScale += ((this.targetScale ?? 1) - this.timeScale) * Math.min(1, dt * 3);
    const v = this.v;
    // slow cinematic drift around the current subject while the director has the camera
    if (this.cinematic && this.orbit && this.hold <= 0 && !v.fly && v.stage === 'explore' && (this.beat || v.running != null)) {
      const c = cam.position, t = v.controls.target, off = c.clone().sub(t), ang = this.orbit.rate * dt;
      off.applyAxisAngle(V3(0, 1, 0), ang); c.copy(t).add(off); cam.lookAt(t);
    }
    const b = this.beat; if (!b) return;
    b.t += dt;
    const bar = b.el && b.el.querySelector('.co-time i'); if (bar) bar.style.width = Math.min(100, b.t / b.dur * 100) + '%';
    // anchor on screen
    const p = b.anchor && b.anchor(); let sx = w * .5, sy = h * .42, on = false;
    if (p) { const q = p.clone().project(cam); if (q.z < 1) { sx = (q.x * .5 + .5) * w; sy = (-q.y * .5 + .5) * h; on = true; } }
    // callout placement: on the emptier side of the anchor, kept inside the safe frame
    const e = b.el; if (e) {
      const cw = e.offsetWidth || 300, ch = e.offsetHeight || 80, panel = v.panel && !v.panel.hidden && !v.panel.classList.contains('folded') ? 380 : 24;
      if (!b.rects || b.t - (b.rectT || -1) > .25) { b.rectT = b.t; b.rects = [...(v.labels ? v.labels.querySelectorAll('.pin.in') : [])].filter(e => e.style.visibility !== 'hidden').map(e => e.getBoundingClientRect()); const hr = this.layer.getBoundingClientRect(); b.ox = hr.left; b.oy = hr.top; }
      const place = c => { let x = c[0] > 0 ? sx + c[0] : sx + c[0] - cw, y = c[1] < 0 ? sy + c[1] - ch : sy + c[1]; x = clamp(x, panel, w - cw - 24); y = clamp(y, 84, h - ch - 120); return [x, y]; };
      const cost = ([x, y]) => { let o = 0; for (const r of b.rects) { const rx = r.left - b.ox, ry = r.top - b.oy, ix = Math.max(0, Math.min(x + cw, rx + r.width) - Math.max(x, rx)), iy = Math.max(0, Math.min(y + ch, ry + r.height) - Math.max(y, ry)); o += ix * iy; } const ix = Math.max(0, Math.min(x + cw, sx + 12) - Math.max(x, sx - 12)), iy = Math.max(0, Math.min(y + ch, sy + 12) - Math.max(y, sy - 12)); return o + ix * iy * 50 + Math.hypot(x + cw / 2 - sx, y + ch / 2 - sy) * 2; };
      const C = [[110, -40], [-110, -40], [110, 40], [-110, 40], [0.01, -90]];
      const right0 = sx < w * .58; if (b.side == null) b.side = right0 ? 0 : 1;
      let best = b.side, bc = cost(place(C[b.side])); C.forEach((c, i) => { const k = cost(place(c)); if (k < bc * .7) { bc = k; best = i; } }); b.side = best;
      let [x, y] = place(C[best]); const right = x > sx - cw / 2;
      e.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      b.dot.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`; b.dot.style.opacity = on ? 1 : 0;
      const ax = right ? x : x + cw, ay = y + ch * .6;
      b.line.setAttribute('d', on ? `M${ax} ${ay} C ${(ax + sx) / 2} ${ay}, ${sx} ${(ay + sy) / 2}, ${sx} ${sy - 7}` : '');
      // guides
      if (b.motion) {
        // motion: from how the subject moves in the WORLD (camera moves don't count), shown only when it really moves
        const wp = (b.host && b.host.getPos && b.host.getPos()) || p;
        const tr = b.wtrail; if (wp) tr.push([wp.clone(), b.t]); while (tr.length > 2 && b.t - tr[0][1] > .6) tr.shift();
        const R = v.ds.orb ? v.ds.orb.r : 10, a0 = tr[0];
        const hq = wp && wp.clone().project(cam), hx = hq ? (hq.x * .5 + .5) * w : sx, hy = hq ? (-hq.y * .5 + .5) * h : sy;
        if (hq && hq.z < 1 && a0 && b.t - a0[1] > .2) {
          const dW = wp.clone().sub(a0[0]), sp = dW.length() / (b.t - a0[1]);
          if (sp > R * .006) {
            const q2 = wp.clone().add(dW.normalize().multiplyScalar(R * .05)).project(cam), ex = (q2.x * .5 + .5) * w - hx, ey = (-q2.y * .5 + .5) * h - hy, L = Math.hypot(ex, ey);
            if (L > 1) { const k = 64 / L; b.motion.setAttribute('d', `M${hx + ex * k * .25} ${hy + ey * k * .25} q ${-ey * k * .2} ${ex * k * .2} ${ex * k} ${ey * k}`); b.motion.style.opacity = 1; } else b.motion.style.opacity = 0;
          } else b.motion.style.opacity = 0;
        } else b.motion.style.opacity = 0;
        (b.links || []).forEach(L2 => {
          const q = L2.a.getPos && L2.a.getPos(); if (!q) return; const s2 = q.clone().project(cam); if (s2.z > 1) { L2.path.setAttribute('d', ''); return; }
          const tx = (s2.x * .5 + .5) * w, ty = (-s2.y * .5 + .5) * h; if (Math.hypot(tx - sx, ty - sy) < 30) { L2.path.setAttribute('d', ''); return; }
          const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 60; L2.path.setAttribute('d', `M${sx} ${sy} Q ${mx} ${my} ${tx} ${ty - 8}`);
        });
        (b.flowEls || []).forEach(F => {
          const fv = q => typeof q === 'function' ? q() : V3().fromArray(q), a = fv(F.f.from).clone().project(cam), c = fv(F.f.to).clone().project(cam);
          if (a.z > 1 || c.z > 1) { F.path.setAttribute('d', ''); F.t.textContent = ''; return; }
          const ax = (a.x * .5 + .5) * w, ay = (-a.y * .5 + .5) * h, cx = (c.x * .5 + .5) * w, cy = (-c.y * .5 + .5) * h;
          const grow = Math.min(1, b.t / 1.2), ex = ax + (cx - ax) * grow, ey = ay + (cy - ay) * grow, nx = -(cy - ay) * .18, ny = (cx - ax) * .18;
          F.path.setAttribute('d', `M${ax} ${ay} Q ${(ax + ex) / 2 + nx} ${(ay + ey) / 2 + ny} ${ex} ${ey}`);
          F.t.textContent = F.f.label || ''; F.t.setAttribute('x', ((ax + cx) / 2 + nx + 8).toFixed(0)); F.t.setAttribute('y', ((ay + cy) / 2 + ny).toFixed(0));
        });
      }
    }
    if (b.t >= b.dur) this.endBeat();
  }
}
