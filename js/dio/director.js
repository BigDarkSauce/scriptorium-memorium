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
const MAXT = { slow: 32, normal: 24, fast: 15 };      // longest a callout stays, seconds (hover keeps it open)
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
  readTime(text) { const words = String(text || '').trim().split(/\s+/).length; return clamp(1.6 + words / PACE[this.pace] * 60, 3, MAXT[this.pace] || 24); }
  userGrab() { this.hold = 6; this.move = null; this.fovTo = this.baseFov(); this.last = null; }

  // ---------- beats ----------
  // beat: {kind:'event'|'lesson'|'explain', title, text, anchor:()=>Vector3|null, focus:Object3D|null, names:[actor...]}
  push(beat) {
    if (!beat || !beat.text) return;
    // de-duplicate: the same sentence already queued or showing
    if ((this.beat && this.beat.text === beat.text) || this.queue.some(b => b.text === beat.text)) return;
    if (beat.kind === 'event') {
      const evq = this.queue.filter(b => b.kind === 'event'); if (evq.length >= 2) this.queue.splice(this.queue.indexOf(evq[0]), 1);   // only the newest events wait
      if (this.v.running != null && this.cinematic) this.targetScale = Math.min(this.targetScale ?? 1, .3);   // slow the process now, while its description waits
    }
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
    // read first, then watch: an instruction freezes the model until it has been read; events play in slow motion
    this.targetScale = !this.cinematic ? 1 : b.kind === 'lesson' ? 0 : b.kind === 'event' && inStep ? .3 : 1; if (b.kind === 'lesson' && this.cinematic) this.timeScale = 0;
    if (b.caption) { this.setCaption(b.title, b.text); b.el = null; b.capBar = el('div', { class: 'co-time' }, [el('i')]); this.caption.append(b.capBar); if (this.cinematic && this.hold <= 0 && inStep) this.frame(b); return; }
    // the shot
    if (this.cinematic && inStep && this.hold <= 0) this.frame(b);
    // the callout, beside what it describes
    b.el = el('div', { class: 'callout k-' + b.kind }, [
      el('div', { class: 'co-kicker', text: b.kind === 'event' ? 'Now' : b.kind === 'lesson' ? (b.title || 'Step') : 'Why' }),
      el('div', { class: 'co-text', html: esc(b.text) }), el('div', { class: 'co-foot' }, [el('div', { class: 'co-time' }, [el('i')]), el('button', { class: 'co-next', title: 'Next', 'aria-label': 'Next', text: '›', onclick: () => { if (this.beat === b) this.endBeat(); } })])]);
    b.el.addEventListener('mouseenter', () => b.paused = true); b.el.addEventListener('mouseleave', () => b.paused = false);
    this.layer.append(b.el); requestAnimationFrame(() => b.el && b.el.classList.add('in'));
    b.line = document.createElementNS(NS, 'path'); b.line.setAttribute('class', 'co-line'); this.svg.append(b.line);
    b.dot = el('div', { class: 'co-dot' }); this.layer.append(b.dot);
    if (this.guides) this.makeGuides(b);
    this.v.highlightPins && this.v.highlightPins([b.host, ...(b.names || [])].filter(Boolean));
  }
  endBeat(all) {
    const b = this.beat; if (b && b.capBar) b.capBar.remove(); if (b && b.onEnd && !all) { try { b.onEnd(); } catch (e) { console.warn(e); } } if (b) { const e = b.el; e && e.classList.remove('in'); setTimeout(() => e && e.remove(), 450); b.line && b.line.remove(); b.dot && b.dot.remove(); (b.guides || []).forEach(g => g.remove()); }
    this.beat = null; this.v.highlightPins && this.v.highlightPins(null); if (all) { this.timeScale = 1; return; } this.nextBeat();
  }
  // ---------- shots ----------
  // A shot grammar taken from documentary and architectural film (docs/research/presentation-craft.md §5):
  //  wide   static establishing view (the model's overview)            — start of a step without a named subject
  //  push   cut to a medium-wide view, dolly in for ~3.5 s, then HOLD   — an instruction about one object
  //  medium static, frames the subject and the objects the text names — explanations
  //  close  static, narrow lens (~24°), cut in, not flown in            — an event on a small part
  //  pov    the learner's eye rides an actor (engine.setPOV)            — when a step asks for it (lesson.shot = 'pov')
  // Never two moving shots in a row; no floating drift; the subject sits on a third, the callout in the open side.
  frame(b) {
    const v = this.v, cam = v.camera; if (!cam || v.pov) return;
    let p = b.anchor && b.anchor(); if (!p && b.kind !== 'lesson') return;
    const R = v.ds.orb ? v.ds.orb.r : 10;
    let kind = b.shot || (b.kind === 'event' ? 'close' : b.kind === 'explain' ? 'medium' : p ? (this.last && this.last.moving ? 'medium' : 'push') : 'wide');
    if (kind === 'pov') { const a = b.host || (b.names || [])[0]; if (a && v.setPOV) { v.setPOV(a, { auto: true }); this.last = { kind, moving: false, subj: a }; return; } kind = 'close'; }
    if (kind === 'wide' || !p) { const k = v.ds.overviewKey(); this.cutTo(k.target.clone(), k.target.clone().addScaledVector(k.dir, R), this.baseFov(), false); this.last = { kind: 'wide', moving: false }; return; }
    // subject size: its mesh box, grown to include its label point and (for explanations) the other named objects
    let box = null; if (b.focus) { box = new THREE.Box3().setFromObject(b.focus); if (box.isEmpty()) box = null; }
    if (box) { box.expandByPoint(p); if (kind === 'medium') (b.names || []).slice(0, 2).forEach(a => { const q = a.getPos && a.getPos(); if (q) box.expandByPoint(q); }); p = box.getCenter(V3()); }
    let r = box ? box.getSize(V3()).length() * .5 : .8;
    // same subject and kind as the shot on screen: keep it (no needless cut)
    const subj = b.host || b.focus || null;
    if (this.last && this.last.subj && this.last.subj === subj && this.last.kind === kind && !b.dist) return;
    const fov = kind === 'close' ? 24 : 36, half = THREE.MathUtils.degToRad(fov / 2), aspect = cam.aspect || 1.6;
    let dist = b.dist || clamp(r / Math.tan(half) * (kind === 'close' ? 1.25 : 1.55), R * .1, R * 1.4);
    if (b.dist) dist = b.dist * Math.tan(THREE.MathUtils.degToRad(this.baseFov() / 2)) / Math.tan(half);   // the model's hint was for the base lens
    // direction: keep the learner's side of the model (current azimuth), at a calm elevation; eye-level-ish for close-ups
    const off = cam.position.clone().sub(v.controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1); off.normalize();
    const elev = THREE.MathUtils.degToRad(kind === 'close' ? 9 : 17), dir = off.multiplyScalar(Math.cos(elev)); dir.y = Math.sin(elev);
    // rule of thirds: shift the aim so the subject sits on the third away from where the callout will go
    const right = V3().crossVectors(V3(0, 1, 0), dir).normalize().negate(), hw = dist * Math.tan(half) * aspect;
    const sx = p.clone().project(cam).x, side = sx < .16 ? 1 : -1;   // subject left of centre now → keep it on the left third
    const target = p.clone().addScaledVector(right, side * hw * .3);
    const pos = target.clone().addScaledVector(dir, dist);
    if (kind === 'push') {
      const start = target.clone().addScaledVector(dir, dist * 1.45);
      this.cutTo(target.clone(), start, fov, true, () => { this.move = { from: start, to: pos, t0: target.clone(), k: 0, dur: 3.5 }; });
      this.last = { kind, moving: true, subj };
    } else { this.cutTo(target, pos, fov, this.last ? this.last.kind !== kind || !this.near(pos) : true); this.last = { kind, moving: false, subj }; }
  }
  baseFov() { return this.v.baseFov || 40; }
  near(pos) { return this.v.camera.position.distanceTo(pos) < (this.v.ds.orb ? this.v.ds.orb.r : 10) * .12; }
  // a cut: dip through the grade for a fraction of a second, change camera, come back up (or a short ease if the change is small)
  cutTo(target, pos, fov, dip, then) {
    const v = this.v, apply = () => { v.fly = null; v.controls.target.copy(target); v.camera.position.copy(pos); v.camera.fov = fov; v.camera.updateProjectionMatrix(); v.camera.lookAt(target); this.fovTo = fov; then && then(); };
    this.move = null;
    if (!dip) { v.flyTo ? (v.fly = { from: { p: v.camera.position.clone(), t: v.controls.target.clone() }, to: { p: pos.clone(), t: target.clone() }, k: 0, dur: 1.1, lift: 0 }) : apply(); this.fovTo = fov; v.controls.enabled = false; if (then) setTimeout(then, 1100); return; }
    this.dip = { t: 0, apply, done: false };
    v.app && v.app.sfx && v.app.sfx.play('cut', { gain: .5 });
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
    // cut dip (≈0.18 s down, 0.3 s up through a dark grade)
    const g = v.gfx && v.gfx.grade && v.gfx.grade.uniforms;
    if (this.dip) { const d = this.dip; d.t += dt; if (!d.done && d.t >= .18) { d.apply(); d.done = true; } const a = d.t < .18 ? d.t / .18 : Math.max(0, 1 - (d.t - .18) / .3); if (g) { if (d.t < dt * 1.5) { this._fc = g.uFadeColor.value.clone(); g.uFadeColor.value.setRGB(.02, .018, .015); } g.uFade.value = a; } if (d.t >= .48) { if (g) { g.uFade.value = 0; if (this._fc) g.uFadeColor.value.copy(this._fc); } this.dip = null; } }
    // a push: slow dolly, eased, then it simply holds
    if (this.move && this.hold <= 0) { const m = this.move; m.k = Math.min(1, m.k + dt / m.dur); const e = m.k * m.k * (3 - 2 * m.k); v.camera.position.lerpVectors(m.from, m.to, e); v.camera.lookAt(m.t0); v.controls.enabled = false; if (m.k >= 1) { this.move = null; v.controls.enabled = v.stage === 'explore' && !v.pov; } }
    // lens: ease the field of view toward the shot's focal length (or back to the base lens after the learner takes over)
    if (this.fovTo && Math.abs(v.camera.fov - this.fovTo) > .05 && !v.pov) { v.camera.fov += (this.fovTo - v.camera.fov) * Math.min(1, dt * 2.5); v.camera.updateProjectionMatrix(); }
    const b = this.beat; if (!b) return;
    if (!b.paused) b.t += dt;
    if (b.kind === 'event' && this.cinematic && v.running != null) this.targetScale = this.queue.length ? .12 : .3;   // more waiting → slower, so text never lags far behind the process
    const bar = (b.el || b.capBar) && (b.el || b.capBar).querySelector('.co-time i'); if (bar) bar.style.width = Math.min(100, b.t / b.dur * 100) + '%';
    // anchor on screen
    const p = b.anchor && b.anchor(); let sx = w * .5, sy = h * .42, on = false;
    if (p) { const q = p.clone().project(cam); if (q.z < 1) { sx = (q.x * .5 + .5) * w; sy = (-q.y * .5 + .5) * h; on = true; } }
    // callout placement: on the emptier side of the anchor, kept inside the safe frame
    const e = b.el; if (e) {
      const cw = e.offsetWidth || 300, ch = e.offsetHeight || 80, panel = v.panel && !v.panel.hidden && !v.panel.classList.contains('folded') ? 380 : 24;
      if (!b.rects || b.t - (b.rectT || -1) > .25) { b.rectT = b.t; b.rects = [...(v.labels ? v.labels.querySelectorAll('.pin.in') : [])].filter(e => e.style.visibility !== 'hidden').map(e => e.getBoundingClientRect()); const hr = this.layer.getBoundingClientRect(); b.ox = hr.left; b.oy = hr.top; }
      const place = c => { let x = c[0] > 0 ? sx + c[0] : sx + c[0] - cw, y = c[1] < 0 ? sy + c[1] - ch : sy + c[1]; x = clamp(x, panel, w - cw - 24); y = clamp(y, 84, h - ch - 120); return [x, y]; };
      if (!b.avoid || b.t - (b.avoidT || -1) > .3) {
        b.avoidT = b.t; b.avoid = [];
        if (b.focus) { const bx = new THREE.Box3().setFromObject(b.focus); if (!bx.isEmpty()) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < 8; k++) { const q = V3(k & 1 ? bx.max.x : bx.min.x, k & 2 ? bx.max.y : bx.min.y, k & 4 ? bx.max.z : bx.min.z).project(cam); const qx = (q.x * .5 + .5) * w, qy = (-q.y * .5 + .5) * h; x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy); } b.avoid.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, k: 6 }); } }
        [v.readPanel, v.panel].forEach(P => { if (P && !P.hidden) { const r = P.getBoundingClientRect(); b.avoid.push({ x: r.left - b.ox, y: r.top - b.oy, w: r.width, h: r.height, k: 8 }); } });
      }
      const cost = ([x, y]) => { let o = 0; for (const A of b.avoid) { const ix = Math.max(0, Math.min(x + cw, A.x + A.w) - Math.max(x, A.x)), iy = Math.max(0, Math.min(y + ch, A.y + A.h) - Math.max(y, A.y)); o += ix * iy * A.k; } for (const r of b.rects) { const rx = r.left - b.ox, ry = r.top - b.oy, ix = Math.max(0, Math.min(x + cw, rx + r.width) - Math.max(x, rx)), iy = Math.max(0, Math.min(y + ch, ry + r.height) - Math.max(y, ry)); o += ix * iy; } const ix = Math.max(0, Math.min(x + cw, sx + 12) - Math.max(x, sx - 12)), iy = Math.max(0, Math.min(y + ch, sy + 12) - Math.max(y, sy - 12)); return o + ix * iy * 50 + Math.hypot(x + cw / 2 - sx, y + ch / 2 - sy) * 2; };
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
          if (a.z > 1 || c.z > 1 || Math.abs(a.x) > .98 || Math.abs(a.y) > .98 || Math.abs(c.x) > .98 || Math.abs(c.y) > .98) { F.path.setAttribute('d', ''); F.t.textContent = ''; return; }
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
