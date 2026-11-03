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
  }
  endBeat(all) {
    const b = this.beat; if (b) { const e = b.el; e && e.classList.remove('in'); setTimeout(() => e && e.remove(), 450); b.line && b.line.remove(); b.dot && b.dot.remove(); (b.guides || []).forEach(g => g.remove()); }
    this.beat = null; if (all) { this.timeScale = 1; return; } this.nextBeat();
  }
  // choose a camera shot for a beat: push in on the subject, keep a three-quarter view, drift around it
  frame(b) {
    const v = this.v, p = b.anchor && b.anchor(); if (!p) return;
    let r = .8; if (b.focus) { const bx = new THREE.Box3().setFromObject(b.focus); if (!bx.isEmpty()) r = bx.getSize(V3()).length() * .5; }
    const R = v.ds.orb ? v.ds.orb.r : 10;
    const dist = clamp(r * 3.2, R * .22, R * .62);
    v.flyTo(p, dist, 1.6, b.kind === 'event' ? 18 : 10);
    this.orbit = { center: p.clone(), rate: (Math.random() < .5 ? -1 : 1) * .06 };
  }
  // guides: an arrow from the callout into the subject, motion arrows for moving bodies, links between named actors
  makeGuides(b) {
    b.guides = [];
    const mk = cls => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); p.setAttribute('marker-end', 'url(#dir-ah)'); this.svg.append(p); b.guides.push(p); return p; };
    b.motion = mk('guide motion');
    b.links = (b.names || []).slice(0, 3).map(a => ({ a, path: mk('guide link') }));   // the named objects already carry their pins
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
      const right = sx < w * .58; let x = right ? sx + 110 : sx - 110 - cw; let y = sy - ch - 40;
      x = clamp(x, panel, w - cw - 24); y = clamp(y, 84, h - ch - 120);
      e.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      b.dot.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`; b.dot.style.opacity = on ? 1 : 0;
      const ax = right ? x : x + cw, ay = y + ch * .6;
      b.line.setAttribute('d', on ? `M${ax} ${ay} C ${(ax + sx) / 2} ${ay}, ${sx} ${(ay + sy) / 2}, ${sx} ${sy - 7}` : '');
      // guides
      if (b.motion) {
        const tr = this.trail.get(b) || []; if (on) tr.push([sx, sy, b.t]); while (tr.length && b.t - tr[0][2] > .5) tr.shift(); this.trail.set(b, tr);
        const a0 = tr[0], dx = a0 ? sx - a0[0] : 0, dy = a0 ? sy - a0[1] : 0, L = Math.hypot(dx, dy);
        if (L > 6) { const k = 60 / L; b.motion.setAttribute('d', `M${sx + dx * .2} ${sy + dy * .2} q ${-dy * k * .25} ${dx * k * .25} ${dx * k} ${dy * k}`); b.motion.style.opacity = 1; } else b.motion.style.opacity = 0;
        (b.links || []).forEach(L2 => {
          const q = L2.a.getPos && L2.a.getPos(); if (!q) return; const s = q.clone().project(cam); if (s.z > 1) { L2.path.setAttribute('d', ''); return; }
          const tx = (s.x * .5 + .5) * w, ty = (-s.y * .5 + .5) * h; if (Math.hypot(tx - sx, ty - sy) < 30) { L2.path.setAttribute('d', ''); return; }
          const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 60; L2.path.setAttribute('d', `M${sx} ${sy} Q ${mx} ${my} ${tx} ${ty - 8}`);
          
        });
      }
    }
    if (b.t >= b.dur) this.endBeat();
  }
}
