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
import { el, esc, clamp, mathHTML } from '../util.js';
const UP = new THREE.Vector3(0, 1, 0), rad = THREE.MathUtils.degToRad, smoother = x => x * x * x * (x * (x * 6 - 15) + 10);

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
  dispose() { this.endShots(true); this.layer.remove(); const g = this.v.gfx && this.v.gfx.grade && this.v.gfx.grade.uniforms; if (this.dip && g) { g.uFade.value = 0; if (this._fc) g.uFadeColor.value.copy(this._fc); } this.dip = null; this.move = null; }
  readTime(text) { const words = String(text || '').trim().split(/\s+/).length; return clamp(1.6 + words / PACE[this.pace] * 60, 3, MAXT[this.pace] || 24); }
  userGrab() { this.hold = 6; this.move = null; this.fovTo = this.baseFov(); this.last = null; if (this.zoom && this.zoom.phase !== 'done') { this.zoom.phase = 'done'; this.zoomDone(); } if (this.track && this.track.phase !== 'post') this.endTrack(); }

  // ---------- beats ----------
  // beat: {kind:'event'|'lesson'|'explain', title, text, anchor:()=>Vector3|null, focus:Object3D|null, names:[actor...]}
  // the "kind" of an event: its words before ':' without numbers ("turning point x = 1.2 m" → "turning point x")
  static evKey(text) { return String(text || '').split(':')[0].toLowerCase().replace(/[−\-+]?\d[\d.,]*\s*[a-zα-ω°%/·²³]*/gi, '').replace(/\s+/g, ' ').trim().slice(0, 48); }
  push(beat) {
    if (!beat || !beat.text) return;
    // explanations longer than ~35 words become consecutive beats (each readable at any pace, never squeezed by the time cap)
    if (beat.kind === 'explain' && !beat.part) { const parts = Director.split(beat.text, 35); if (parts.length > 1) { parts.forEach((t, i) => this.push(Object.assign({}, beat, { text: t, part: (i + 1) + '/' + parts.length, onEnd: i === parts.length - 1 ? beat.onEnd : null }))); return; } }
    // de-duplicate: the same sentence already queued or showing
    if ((this.beat && this.beat.text === beat.text) || this.queue.some(b => b.text === beat.text)) return;
    if (beat.kind === 'event') {
      const evq = this.queue.filter(b => b.kind === 'event'); if (evq.length >= 2) this.queue.splice(this.queue.indexOf(evq[0]), 1);   // only the newest events wait
      if (this.v.running != null && this.cinematic) { this.targetScale = Math.min(this.targetScale ?? 1, .3); this.timeScale = Math.min(this.timeScale, .35); }   // slow the process at once, while its description waits
    }
    this.queue.push(beat); if (!this.beat) this.nextBeat();
  }
  static split(text, max) {
    const sents = String(text).match(/[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g) || [text], out = []; let cur = '';
    for (const x of sents) { const n = (cur + x).trim().split(/\s+/).length; if (cur && n > max) { out.push(cur.trim()); cur = x; } else cur += x; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  setCaption(title, text) { this.caption.hidden = false; this.caption.innerHTML = `<b>${mathHTML(title || '')}</b> ${mathHTML(text || '')}`; }
  clearCaption() { this.caption.hidden = true; }
  idle() { return !this.beat && !this.queue.length; }
  clear() { this.queue = []; this.endBeat(true); this.bracket = null; if (this.trailEl) this.trailEl.setAttribute('points', ''); }
  nextBeat() {
    const b = this.queue.shift(); this.beat = b || null; if (!b) { this.targetScale = 1; return; }   // nothing left to read: the step eases back to full speed (a lesson beat had set 0)
    b.t = 0; b.dur = b.dur || this.readTime((b.title || '') + ' ' + b.text) + (b.kind === 'lesson' ? 1.2 : 0);
    // time dilation: slow the simulation while an event is being read (the process keeps moving, slowly)
    // (only during an instructed step: free exploration keeps its own camera and pace)
    const inStep = this.v.running != null || b.kind !== 'event';
    // read first, then watch: an instruction freezes the model until it has been read; events play in slow motion
    this.targetScale = !this.cinematic ? 1 : b.kind === 'lesson' ? 0 : b.kind === 'event' && inStep ? .3 : 1; if (b.kind === 'lesson' && this.cinematic) this.timeScale = 0;
    if (b.caption) { this.setCaption(b.title, b.text); b.el = null; b.capBar = el('div', { class: 'co-time' }, [el('i')]); this.caption.append(b.capBar); if (this.cinematic && this.hold <= 0 && inStep && !b.noShot) this.frame(b); return; }
    // the shot
    if (this.cinematic && inStep && this.hold <= 0 && !b.noShot) this.frame(b);   // noShot: a label beat inside a move (peel layers) keeps the camera
    // the callout, beside what it describes
    b.el = el('div', { class: 'callout k-' + b.kind }, [
      el('div', { class: 'co-kicker', text: (b.kicker || (b.kind === 'event' ? 'Now' : b.kind === 'lesson' ? (b.title || 'Step') : 'Why')) + (b.part ? ' · ' + b.part : '') }),
      b.question ? el('div', { class: 'co-q', html: '<b>Q</b> ' + mathHTML(b.question) }) : null,
      el('div', { class: 'co-text', html: mathHTML(b.text) }),
      b.opens && (!b.part || b.part.split('/')[0] === b.part.split('/')[1]) ? el('div', { class: 'co-opens', html: '→ ' + mathHTML(b.opens) }) : null, el('div', { class: 'co-foot' }, [el('div', { class: 'co-time' }, [el('i')]), el('button', { class: 'co-next', title: 'Next', 'aria-label': 'Next', text: '›', onclick: () => { if (this.beat === b) this.endBeat(); } })])]);
    b.el.addEventListener('mouseenter', () => b.paused = true); b.el.addEventListener('mouseleave', () => b.paused = false);
    this.layer.append(b.el); requestAnimationFrame(() => b.el && b.el.classList.add('in'));
    b.line = document.createElementNS(NS, 'path'); b.line.setAttribute('class', 'co-line'); this.svg.append(b.line);
    b.dot = el('div', { class: 'co-dot' }); this.layer.append(b.dot);
    if (this.guides) this.makeGuides(b);
    this.v.highlightPins && this.v.highlightPins([b.host, ...(b.names || [])].filter(Boolean));
  }
  endBeat(all) {
    const b = this.beat; if (b && b.capBar) b.capBar.remove(); if (b && b.onEnd && !all) { try { b.onEnd(); } catch (e) { console.warn(e); } } if (b) { const e = b.el; e && e.classList.remove('in'); setTimeout(() => e && e.remove(), 450); b.line && b.line.remove(); b.dot && b.dot.remove(); (b.guides || []).forEach(g => g.remove()); }
    this.beat = null; this.v.highlightPins && this.v.highlightPins(null); if (all) { this.timeScale = 1; this.targetScale = 1; return; } this.nextBeat();
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
    // the step's own moving shot keeps the camera: an event during a zoom (or at its arrival view) or a ride is read in its
    // callout, it does not cut away (a cut would end the zoom or the ride half-way)
    if (b.kind === 'event' && !b.poseOnly && ((this.zoom && this.zoom.phase !== 'back') || (this.track && this.track.phase !== 'post'))) return;
    let p = b.anchor && b.anchor(); if (!p && b.kind !== 'lesson') return;
    const R = v.ds.orb ? v.ds.orb.r : 10;
    let kind = b.shot || (b.kind === 'event' ? 'close' : b.kind === 'explain' ? 'medium' : p ? (this.last && this.last.moving ? 'medium' : 'push') : 'wide');
    if (kind === 'zoom') { if (b.zoom && b.zoom.to && this.startZoom(b)) return; kind = p ? 'medium' : 'wide'; }
    if (kind === 'track') { if (b.track && this.startTrack(b)) return; kind = p ? 'medium' : 'wide'; }
    if (kind === 'pov') { const a = b.host || (b.names || [])[0]; if (a && v.setPOV) { this.startBracket(a, b); return; } kind = 'close'; }
    if (kind === 'wide' || !p) { const k = v.ds.overviewKey(); if (this.last && this.last.kind === 'wide') return; this.cutTo(k.target.clone(), k.target.clone().addScaledVector(k.dir, R), this.baseFov(), true); this.last = { kind: 'wide', moving: false, t: this.clock }; return; }
    // subject size: its mesh box, grown to include its label point and (for explanations) the other named objects
    v.scene && v.scene.updateMatrixWorld(true);
    let box = null; if (b.focus) { box = new THREE.Box3().setFromObject(b.focus); if (box.isEmpty()) box = null; }
    if (box) { box.expandByPoint(p); if (kind === 'medium') (b.names || []).slice(0, 2).forEach(a => { const q = a.getPos && a.getPos(); if (q) box.expandByPoint(q); }); p = box.getCenter(V3()); }
    let r = box ? box.getSize(V3()).length() * .5 : .8;
    if (kind === 'close' && b.kind === 'event') { const a0 = b.anchor && b.anchor(); if (a0) { p = a0.clone(); r = Math.min(r, R * .14); } }   // a close-up is about where it happens
    // same subject and kind as the shot on screen: keep it (no needless cut)
    const subj = b.host || b.focus || null;
    if (!b.poseOnly && this.last && this.last.subj && this.last.subj === subj && this.last.kind === kind && !b.dist) return;
    if (!b.poseOnly && this.last && b.kind === 'event' && this.last.kind === kind && ((b.evKey && b.evKey === this.last.evKey) || this.clock - (this.last.t || -1e9) < 8)) return;   // hold a shot at least 8 s; a repeated kind of event keeps the shot
    const fov = kind === 'close' ? 24 : 36, half = THREE.MathUtils.degToRad(fov / 2), aspect = cam.aspect || 1.6;
    let dist = b.dist || clamp(r / Math.tan(half) * (kind === 'close' ? 1.25 : 1.55), R * .1, R * 1.4);
    if (b.dist) dist = b.dist * Math.tan(THREE.MathUtils.degToRad(this.baseFov() / 2)) / Math.tan(half);   // the model's hint was for the base lens
    // direction: keep the learner's side of the model (current azimuth), at a calm elevation; eye-level-ish for close-ups
    const off = cam.position.clone().sub(v.controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1); off.normalize();
    const elev = THREE.MathUtils.degToRad(kind === 'close' ? 9 : 17), dir = off.multiplyScalar(Math.cos(elev)); dir.y = Math.sin(elev);
    // rule of thirds: shift the aim so the subject sits on the third away from where the callout will go
    // the free part of the frame (minus the instruction panel and the readouts), and the subject on one of its thirds
    const W = innerWidth, fr = this.freeFrame(W), sxPx = (p.clone().project(cam).x * .5 + .5) * W;
    const want = fr[0] + (fr[1] - fr[0]) * (sxPx < (fr[0] + fr[1]) / 2 ? 1 / 3 : 2 / 3), xd = want / W * 2 - 1;
    const right = V3().crossVectors(V3(0, 1, 0), dir).normalize(), hw = dist * Math.tan(half) * aspect;
    const target = p.clone().addScaledVector(right, -xd * hw);
    const pos = target.clone().addScaledVector(dir, dist);
    if (b.poseOnly) return { target, pos, fov };
    if (kind === 'push') {
      const start = target.clone().addScaledVector(dir, dist * 1.45);
      this.cutTo(target.clone(), start, fov, true, () => { this.move = { from: start, to: pos, t0: target.clone(), k: 0, dur: 3.5 }; });
      this.last = { kind, moving: true, subj, t: this.clock, evKey: b.evKey };
    } else { this.cutTo(target, pos, fov, this.last ? this.last.kind !== kind || !this.near(pos) : true); this.last = { kind, moving: false, subj, t: this.clock, evKey: b.evKey }; }
    this.accent(p, r);
  }
  // the subject of each beat gets a soft accent light (the "hero" key of docs/research/presentation-craft.md §1)
  accent(p, r) { const L = this.v.accentLight; if (!L || !p) return; const c = this.v.camera, up = V3(0, 1, 0); const side = V3().crossVectors(c.position.clone().sub(p).normalize(), up).normalize();
    L.position.copy(p).addScaledVector(c.position.clone().sub(p).normalize(), r * 3 + 1).addScaledVector(up, r * 2.2 + .8).addScaledVector(side, r * 1.6); L.target.position.copy(p); L.target.updateMatrixWorld();
    const d = L.position.distanceTo(p); L.angle = Math.min(.9, Math.atan2(r * 1.4, d)); L.userData.goal = 1.1 * d * d; }
  // ---------- explainer shots (docs/research/explainer-animation.md): zoom (S4), track (S9), the POV bracket (S6.4) ----------
  reduced() { return !!(this.v.reducedMotion && this.v.reducedMotion()); }
  // a moving shot or a bracket is still on its way: cues that play "after the shot" (chain, peel) wait for it
  busy() { const z = this.zoom, k = this.track, br = this.bracket; return !!((z && z.phase !== 'done') || (k && k.phase !== 'post') || (br && br.phase === 'pre') || this.dip); }
  hud() {
    if (this.ring) return;
    this.ring = document.createElementNS(NS, 'circle'); this.ring.setAttribute('class', 'dir-ring'); this.ring.setAttribute('r', '20'); this.ring.style.opacity = 0; this.svg.append(this.ring);
    this.trailEl = document.createElementNS(NS, 'polyline'); this.trailEl.setAttribute('class', 'dir-trail'); this.svg.append(this.trailEl);
    this.sbar = el('div', { class: 'dir-scale', hidden: true }, [el('i'), el('span')]); this.layer.append(this.sbar);
    this.chipEl = el('div', { class: 'dir-chip', hidden: true }); this.layer.append(this.chipEl);
    this.edge = el('div', { class: 'dir-edge', hidden: true, html: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 12h13M12 6l7 6-7 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }); this.layer.append(this.edge);
    this._a = V3(); this._b = V3(); this._f = V3();
  }
  chip(html, ms) { this.hud(); const c = this.chipEl; clearTimeout(this._chipT); if (!html) { c.hidden = true; return; } c.innerHTML = html; c.hidden = false; c.classList.remove('out'); if (ms) this._chipT = setTimeout(() => c.classList.add('out'), ms); }
  restoreLens() { const L = this._lens; if (!L) return; const c = this.v.camera; c.near = L.near; c.far = L.far; c.updateProjectionMatrix(); this.v.controls.minDistance = L.minD; this._lens = null; }
  saveLens() { if (!this._lens) { const c = this.v.camera; this._lens = { near: c.near, far: c.far, minD: this.v.controls.minDistance }; } }
  stopShots() {
    if (this.zoom) { this.zoom = null; if (this.ring) this.ring.style.opacity = 0; if (this.sbar) this.sbar.hidden = true; }
    if (this.track) this.endTrack(true);
    this.restoreLens(); if (this.chipEl && !this.bracket) this.chip(null);
  }
  endZoomHud() { if (!this.zoom || this.zoom.phase === 'back') return; this.zoom = null; if (this.ring) this.ring.style.opacity = 0; if (this.sbar) this.sbar.hidden = true; this.restoreLens(); }
  endShots() { this.stopShots(); this.bracket = null; if (this.trailEl) this.trailEl.setAttribute('points', ''); if (this.edge) this.edge.hidden = true; }
  // S4 zoom: target ring first, centre the target, then one straight exponential dolly (constant perceived speed),
  // pausing at stations; lens change only in the last 30 % and at most 10°; near/far follow the distance (ratio ≤ 10⁴)
  startZoom(b) {
    const v = this.v, Z = b.zoom, a = Z.to, cam = v.camera, R = v.ds.orb ? v.ds.orb.r : 10; if (!a) return false;
    v.scene.updateMatrixWorld(true);
    const size = o => { const bx = o && o.obj ? new THREE.Box3().setFromObject(o.obj) : null; if (bx && !bx.isEmpty()) return { c: bx.getCenter(V3()), r: Math.max(.01, bx.getSize(V3()).length() * .5) }; const q = o && o.getPos && o.getPos(); return { c: (q || v.ds.center).clone(), r: .25 }; };
    const T = size(a), base = this.baseFov(), fovEnd = clamp(+Z.fovEnd || base, base - 10, base + 10), d1 = T.r / Math.tan(rad(fovEnd / 2)) * 1.4;
    const reduced = this.reduced(), wide = !reduced && (Z.from !== 'current' || (this.last && this.last.kind === 'push') || cam.position.distanceTo(T.c) < d1 * 3);   // never right after a push
    const go = () => {
      const axis = cam.position.clone().sub(T.c); let d0 = axis.length(); if (d0 < 1e-6) { axis.set(0, .35, 1); d0 = R; } axis.normalize(); d0 = Math.max(d0, d1 * 1.5);
      const st = (Z.stations || []).filter(s => s && s.a && s.a !== a).map(s => { const S = size(s.a); return { a: s.a, hold: clamp(+s.hold || 2, .5, 8), d: S.r / Math.tan(rad(base / 2)) * 1.4 }; }).filter(s => s.d < d0 * .92 && s.d > d1 * 1.08).sort((p, q) => q.d - p.d);
      const fin = (Z.stations || []).find(s => s && s.a === a), segs = []; let da = d0;
      st.forEach(s => { segs.push({ da, db: s.d, st: s }); da = s.d; }); segs.push({ da, db: d1, st: { a, hold: fin ? clamp(+fin.hold || 2.5, .5, 8) : 1, final: true } });
      segs.forEach(g => { g.T = clamp((+Z.perDecade || 3) * Math.log10(g.da / g.db), segs.length > 1 ? 1.2 : 2.5, 14); });
      const qT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, T.c, UP));
      this.saveLens();
      this.zoom = { phase: reduced ? 'done' : 'ring', t: 0, a, c: T.c, r: T.r, d0, d1, d: d0, axis, fov0: cam.fov, fovEnd, segs, si: 0, q0: cam.quaternion.clone(), qT, back: !!Z.back, perDecade: +Z.perDecade || 3, n: segs.length, k: -1 };
      v.fly = null; this.move = null; this.fovTo = null; v.controls.enabled = false; v.controls.target.copy(T.c); this.hud();
      if (reduced) { this.zoom.d = d1; cam.quaternion.copy(qT); this.zoomPose(true); this.zoomDone(); }   // reduced motion: a cut and the scale bar
    };
    if (wide) { const k = v.ds.overviewKey(); this.cutTo(k.target.clone(), k.target.clone().addScaledVector(k.dir, R), base, true, go); }
    else { this.stopShots(); if (reduced) this.dip = { t: 0, done: false, apply: go }; else go(); }
    this.last = { kind: 'zoom', moving: true, subj: a, t: this.clock };
    return true;
  }
  zoomPose(final) {
    const Z = this.zoom, cam = this.v.camera, R = this.v.ds.orb ? this.v.ds.orb.r : 10;
    cam.position.copy(Z.c).addScaledVector(Z.axis, Z.d); cam.quaternion.copy(Z.qT);
    const uT = final ? 1 : Math.log(Z.d0 / Z.d) / Math.log(Z.d0 / Z.d1), f = clamp((uT - .7) / .3, 0, 1);
    cam.fov = Z.fov0 + (Z.fovEnd - Z.fov0) * f * f * (3 - 2 * f);
    const far = Math.max(Z.d * 100, Z.d + R * 3), near = Math.max(1e-5, Z.d * .01, far / 1e4); cam.near = near; cam.far = far; cam.updateProjectionMatrix();
  }
  zoomDone() {
    const Z = this.zoom, v = this.v; if (!Z) return;
    v.controls.target.copy(Z.c); v.controls.minDistance = Math.min(this._lens ? this._lens.minD : 2, Z.d * .8); v.controls.enabled = v.stage === 'explore' && !v.pov;
    this.fovTo = v.camera.fov; if (this.ring) this.ring.style.opacity = 0; this.chip(null);
  }
  zoomBack() {
    const Z = this.zoom; if (!Z || !Z.back || Z.phase !== 'done') return false;
    if (this.reduced()) { Z.d = Z.d0; this.dip = { t: 0, done: false, apply: () => { this.zoomPose(); this.restoreLens(); this.zoom = null; if (this.sbar) this.sbar.hidden = true; } }; return true; }
    Z.phase = 'back'; Z.t = 0; Z.from = Z.d; Z.T = clamp(Z.perDecade * Math.log10(Z.d0 / Z.d), 2.5, 14); this.v.controls.enabled = false; this.last = { kind: 'zoom', moving: true, subj: Z.a, t: this.clock };
    return true;
  }
  updateZoom(dt) {
    const Z = this.zoom, v = this.v, cam = v.camera; if (!Z) return;
    if (this.dip && !this.dip.done) return;   // the cut to the starting view comes first
    Z.t += dt;
    if (Z.phase === 'ring') { if (Z.t >= .5) { Z.phase = 'centre'; Z.t = 0; } }
    else if (Z.phase === 'centre') { const k = Math.min(1, Z.t / .6); cam.quaternion.slerpQuaternions(Z.q0, Z.qT, k * k * (3 - 2 * k)); if (k >= 1) { Z.phase = 'travel'; Z.t = 0; } }
    else if (Z.phase === 'travel') {
      const g = Z.segs[Z.si], u = Math.min(1, Z.t / g.T); Z.d = g.da * Math.pow(g.db / g.da, smoother(u)); this.zoomPose();
      if (u >= 1) { Z.phase = 'hold'; Z.t = 0; Z.k = Z.si; const nm = g.st.a.name.split(' · ')[0]; if (Z.n > 1 || g.st.final) this.chip(`<b>Station ${Z.si + 1} of ${Z.n}</b> · ${mathHTML(nm)}`); v.touchLabels && v.touchLabels([g.st.a]); }
    } else if (Z.phase === 'hold') {
      const g = Z.segs[Z.si];
      if (Z.t >= g.st.hold) { if (g.st.final) { Z.phase = 'done'; this.zoomDone(); } else { Z.si++; Z.phase = 'travel'; Z.t = 0; this.chip(null); } }
    } else if (Z.phase === 'back') {
      const u = Math.min(1, Z.t / Z.T); Z.d = Z.from * Math.pow(Z.d0 / Z.from, smoother(u)); this.zoomPose();
      if (u >= 1) { this.restoreLens(); v.controls.enabled = v.stage === 'explore' && !v.pov; this.zoom = null; if (this.sbar) this.sbar.hidden = true; this.fovTo = cam.fov; return; }
    }
    // the target ring: constant 40 px until the object outgrows it (against "desert fog")
    if (this.ring) {
      const on = Z.phase !== 'done' && Z.phase !== 'back', q = this._a.copy(Z.c).project(cam), w = innerWidth, h = innerHeight;
      const pr = Z.r / (cam.position.distanceTo(Z.c) * Math.tan(rad(cam.fov / 2))) * h / 2;
      if (Z.pr0 == null) Z.pr0 = pr; const rr = Math.max(20, Math.min(90, Z.pr0 * 1.15 + 4)), op = on && q.z < 1 ? (Z.phase === 'ring' || Z.phase === 'centre' ? 1 : clamp(1 - (pr - rr) / (rr * .6), 0, 1)) : 0;
      this.ring.setAttribute('r', rr.toFixed(1));
      this.ring.setAttribute('cx', ((q.x * .5 + .5) * w).toFixed(1)); this.ring.setAttribute('cy', ((-q.y * .5 + .5) * h).toFixed(1)); this.ring.style.opacity = op.toFixed(2);
    }
  }
  // the scale bar (S4.7): a nice length (1, 2 or 5 × 10ᵏ) of 60–140 px at the target's depth; only when the scene says
  // how many metres a world unit is (spec.scale.m) — never an invented scale
  drawScale() {
    const Z = this.zoom; let m = this.v.scaleM && this.v.scaleM(); if (!this.sbar) return; if (!Z || !m) { this.sbar.hidden = true; return; }
    const cam = this.v.camera, h = innerHeight, d = cam.position.distanceTo(Z.c), span = 2 * d * Math.tan(rad(cam.fov / 2));
    // a second, molecular scale (spec.scale.micro): once the view is narrower than micro.below world units, the bar measures
    // the drawn molecules instead of the apparatus, and says so (a scene drawn at two scales never mixes them in one bar)
    const mic = this.v.scaleMicro && this.v.scaleMicro(), micro = !!(mic && span * (cam.aspect || 1.6) < mic.below); if (micro) m = mic.m;
    const mpp = span / h * m;
    const k0 = Math.floor(Math.log10(100 * mpp)); let N = Math.pow(10, k0), px = N / mpp, best = 1e9;
    for (let k = k0 - 1; k <= k0 + 1; k++) for (const f of [1, 2, 5]) { const n = f * Math.pow(10, k), p = n / mpp, c = (p >= 60 && p <= 140 ? 0 : 1e4) + Math.abs(Math.log(p / 100)); if (c < best) { best = c; N = n; px = p; } }
    const U = [['km', 1e3], ['m', 1], ['cm', 1e-2], ['mm', 1e-3], ['µm', 1e-6], ['nm', 1e-9]], u = U.find(x => N >= x[1] * .999) || U[U.length - 1];
    const lab = +(N / u[1]).toPrecision(3) + ' ' + u[0] + (micro && mic.note ? ' · ' + mic.note : ''), S = this.sbar; S.hidden = false;
    if (S._lab !== lab) { const dec = Math.floor(Math.log10(N) + 1e-9); if (S._dec != null && S._dec !== dec) { S.classList.remove('flash'); void S.offsetWidth; S.classList.add('flash'); } S._dec = dec; S._lab = lab; S.lastChild.textContent = lab; S.dataset.m = String(N); }
    S.firstChild.style.width = px.toFixed(0) + 'px'; const fr = this.freeFrame(innerWidth), tf = `translate(${(fr[0] + 18).toFixed(0)}px,0)`; if (S._tf !== tf) { S._tf = tf; S.style.transform = tf; }
  }
  // S9 track: a ride along an authored path (centripetal Catmull–Rom, arc length), eased in and out over 15 %, looking
  // ahead along the rail; the rail is previewed from the overview for 1 s before departure
  startTrack(b) {
    const v = this.v, T = b.track; if (!T || !Array.isArray(T.points) || T.points.length < 2) return false;
    const pts = T.points.map(p => V3(+p[0] || 0, +p[1] || 0, +p[2] || 0)), curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(96)), new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    line.renderOrder = 40; line.userData.isInk = true; line.raycast = () => { }; line.name = 'track preview';
    const k = v.ds.overviewKey(), R = v.ds.orb ? v.ds.orb.r : 10; this.cutTo(k.target.clone(), k.target.clone().addScaledVector(k.dir, R), this.baseFov(), true);
    v.scene.add(line);
    this.track = { phase: 'pre', t: 0, curve, line, dur: clamp(+T.dur || 8, 3, 20), la: clamp(T.lookAhead ?? .08, 0, .3), ls: clamp(T.lookAtSubject ?? 0, 0, 1), preview: T.preview !== false, subj: b.host, rate: 0, q: new THREE.Quaternion(), m: new THREE.Matrix4(), e: V3(), l: V3() };
    this.hud(); this.chip(`You will ride <b>${esc(T.label || T.name || 'the track')}</b> · the rail shows the way`);
    this.last = { kind: 'track', moving: true, subj: b.host, t: this.clock };
    return true;
  }
  endTrack(now) {
    const K = this.track; if (!K) return; const v = this.v;
    if (now || !this.cinematic) { K.line.removeFromParent(); K.line.geometry.dispose(); K.line.material.dispose(); this.track = null; v.controls.enabled = v.stage === 'explore' && !v.pov; return; }
    // the pull-out: back to a medium of the subject (or the overview), the rail stays as the trail of where you were
    const pose = K.subj ? this.frame({ anchor: () => K.subj.getPos(), focus: K.subj.obj, host: K.subj, names: [], kind: 'explain', shot: 'medium', poseOnly: true }) : null;
    const ok = v.ds.overviewKey(), R = v.ds.orb ? v.ds.orb.r : 10, tgt = pose ? pose.target : ok.target.clone(), to = pose ? pose.pos : ok.target.clone().addScaledVector(ok.dir, R);
    this.restoreLens(); v.controls.target.copy(tgt); this.move = { from: v.camera.position.clone(), to, t0: tgt, k: 0, dur: 2 }; if (pose) this.fovTo = pose.fov;
    K.phase = 'post'; K.t = 0; this.chip('You were here', 2200); this.last = { kind: 'medium', moving: true, subj: K.subj, t: this.clock };
  }
  // turn toward a goal at most 60°/s with ≤ 120°/s² acceleration, roll locked to 0 (S6.1)
  turn(S, eye, look, dt) {
    const cam = this.v.camera; S.m.lookAt(eye, look, UP); S.q.setFromRotationMatrix(S.m);
    const want = Math.min(.9, cam.quaternion.angleTo(S.q) * 2.5); S.rate += clamp(want - S.rate, -2.094 * dt, 2.094 * dt);
    cam.quaternion.rotateTowards(S.q, Math.max(0, S.rate) * dt); cam.getWorldDirection(this._f); this._b.copy(cam.position).add(this._f); cam.lookAt(this._b);
  }
  updateTrack(dt) {
    const K = this.track, v = this.v, cam = v.camera; if (!K) return; if (this.dip && !this.dip.done) return;
    K.t += dt;
    K.line.material.opacity = K.phase === 'pre' ? (K.preview ? Math.min(.6, K.t * 1.5) : 0) : K.phase === 'ride' ? Math.max(0, .45 - K.t * .45) : Math.min(.6, K.t * 2) * clamp(1 - (K.t - 1.4) / .8, 0, 1);
    if (K.phase === 'pre') {
      if (K.t >= (K.preview ? 1.5 : .5)) { K.phase = 'ride'; K.t = 0; this.chip(null); this.move = null; v.fly = null; v.controls.enabled = false; this.saveLens(); cam.near = .02; cam.far = 400; cam.fov = 60; cam.updateProjectionMatrix(); this.fovTo = null;
        const s0 = this.reduced() ? .5 : 0; K.curve.getPointAt(s0, K.e); K.curve.getPointAt(Math.min(1, s0 + K.la), K.l); cam.position.copy(K.e); cam.lookAt(K.l); }
    } else if (K.phase === 'ride') {
      const tau = Math.min(1, K.t / K.dur), f = .15, vm = 1 / (1 - f);
      const s = this.reduced() ? .5 : tau < f ? vm * tau * tau / (2 * f) : tau < 1 - f ? vm * (f / 2 + tau - f) : 1 - vm * (1 - tau) * (1 - tau) / (2 * f);
      K.curve.getPointAt(clamp(s, 0, 1), K.e); K.curve.getPointAt(Math.min(1, s + K.la), K.l);
      if (K.ls > 0 && K.subj && K.subj.getPos) { const q = K.subj.getPos(); if (q) K.l.lerp(q, K.ls); }
      if (K.l.distanceToSquared(K.e) < 1e-8) K.l.add(this._f);
      cam.position.copy(K.e); if (!this.reduced()) this.turn(K, K.e, K.l, dt);
      if (tau >= 1) this.endTrack();
    } else if (K.phase === 'post' && K.t > 2.3) this.endTrack(true);
  }
  // S6.4 bracketing: a medium of the actor in context with "You will see as …" for 1.5 s before the ride, and a 2 s
  // pull-out with a fading trail of where the actor went ("You were here") after it
  startBracket(a, b) {
    const v = this.v; this.hud();
    this.bracket = { phase: 'pre', t: 0, a, look: b.povLook, hist: Array.from({ length: 120 }, () => V3()), n: 0, hi: 0, ht: 0 };
    this.last = null; this.frame({ anchor: () => a.getPos(), focus: a.obj, host: a, names: [], kind: 'explain', shot: 'medium' });
    this.chip(`You will see as: <b>${mathHTML(a.name.split(' · ')[0])}</b>`);
    v.touchLabels && v.touchLabels([a]);
  }
  afterPOV(a) {
    const B = this.bracket; if (!B || B.a !== a || !this.cinematic) { this.bracket = null; return; }
    const pose = this.frame({ anchor: () => a.getPos(), focus: a.obj, host: a, names: [], kind: 'explain', shot: 'medium', poseOnly: true });
    if (!pose) { this.bracket = null; return; }
    const v = this.v, cam = v.camera, start = pose.target.clone().lerp(pose.pos, .3);
    if (this.reduced()) start.copy(pose.pos);
    cam.position.copy(start); cam.fov = pose.fov; cam.updateProjectionMatrix(); v.controls.target.copy(pose.target); cam.lookAt(pose.target); this.fovTo = pose.fov;
    if (!this.reduced()) this.move = { from: start, to: pose.pos, t0: pose.target, k: 0, dur: 2 };
    this.last = { kind: 'medium', moving: !this.reduced(), subj: a, t: this.clock };
    B.phase = 'post'; B.t = 0; this.chip('You were here', 2200);
  }
  updateBracket(dt) {
    const B = this.bracket, v = this.v; if (!B) return;
    if (B.phase === 'pre') { if (this.dip) return; B.t += dt; if (B.t >= 1.5) { B.phase = 'ride'; B.t = 0; this.chip(null); v.setPOV(B.a, { auto: true, look: B.look, still: this.reduced() }); } return; }
    if (B.phase === 'ride') { B.ht += dt; if (B.ht >= 1 / 30) { B.ht = 0; const p = B.a.getPos(); if (p) { B.hist[B.hi].copy(p); B.hi = (B.hi + 1) % 120; B.n = Math.min(B.n + 1, 120); } } return; }
    if (B.phase === 'post') {
      B.t += dt; const cam = v.camera, w = innerWidth, h = innerHeight; let pts = '';
      for (let i = 0; i < B.n; i++) { const q = this._a.copy(B.hist[(B.hi - B.n + i + 120) % 120]).project(cam); if (q.z < 1) pts += ((q.x * .5 + .5) * w).toFixed(0) + ',' + ((-q.y * .5 + .5) * h).toFixed(0) + ' '; }
      this.trailEl.setAttribute('points', pts); this.trailEl.style.opacity = clamp(1 - (B.t - 1.2) / 1.6, 0, 1).toFixed(2);
      if (B.t > 2.8) { this.trailEl.setAttribute('points', ''); this.bracket = null; }
    }
  }
  // S6.5 in POV: an edge arrow toward the step's subject when it is out of view
  drawEdge() {
    const v = this.v, P = v.pov; if (!this.edge) return; let s = null;
    if (P) { const bh = this.beat && this.beat.host; s = bh && bh !== P.a ? bh : v.lessonActor && v.lessonActor !== P.a ? v.lessonActor : null; }
    const p = s && s.getPos && s.getPos(); if (!p) { if (!this.edge.hidden) this.edge.hidden = true; return; }
    const q = this._a.copy(p).project(v.camera), behind = q.z > 1; let x = behind ? -q.x : q.x, y = behind ? -q.y : q.y;
    if (!behind && Math.abs(x) < .95 && Math.abs(y) < .95) { if (!this.edge.hidden) this.edge.hidden = true; return; }
    const m = Math.max(Math.abs(x), Math.abs(y), 1e-6); x /= m; y /= m; const w = innerWidth, h = innerHeight, px = (x * .5 + .5) * (w - 80) + 40, py = (-y * .5 + .5) * (h - 200) + 100;
    this.edge.hidden = false; this.edge.style.transform = `translate(${px.toFixed(0)}px,${py.toFixed(0)}px) rotate(${Math.atan2(-y, x).toFixed(3)}rad)`;
    this.edge.title = 'Toward ' + s.name;
  }
  updateShots(dt) { this.updateZoom(dt); this.updateTrack(dt); this.updateBracket(dt); this.drawScale(); this.drawEdge(); }
  baseFov() { return this.v.baseFov || 40; }
  freeFrame(W) { const v = this.v, P = v.panel, Rp = v.readPanel; const L = P && !P.hidden && !P.classList.contains('folded') ? P.getBoundingClientRect().right + 12 : 70; const R = Rp && !Rp.hidden ? Rp.getBoundingClientRect().left - 12 : W - 24; return R - L > W * .35 ? [L, R] : [0, W]; }
  near(pos) { return this.v.camera.position.distanceTo(pos) < (this.v.ds.orb ? this.v.ds.orb.r : 10) * .12; }
  // a cut: dip through the grade for a fraction of a second, change camera, come back up (or a short ease if the change is small)
  cutTo(target, pos, fov, dip, then) {
    this.stopShots();   // a new shot ends a zoom or a ride still on screen (and gives the lens back)
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
    this.timeScale += ((this.targetScale ?? 1) - this.timeScale) * Math.min(1, dt * 4);
    const v = this.v;
    this.clock = (this.clock || 0) + dt;
    { const L = v.accentLight; if (L) { const goal = this.beat && this.cinematic ? (L.userData.goal || 0) : 0; L.intensity += (goal - L.intensity) * Math.min(1, dt * 2); } }
    // cut dip (≈0.18 s down, 0.3 s up through a dark grade)
    const g = v.gfx && v.gfx.grade && v.gfx.grade.uniforms;
    if (this.dip) { const d = this.dip; d.t += dt; if (!d.done && d.t >= .18) { d.apply(); d.done = true; } const a = d.t < .18 ? d.t / .18 : Math.max(0, 1 - (d.t - .18) / .3); if (g) { if (d.t < dt * 1.5) { this._fc = g.uFadeColor.value.clone(); g.uFadeColor.value.setRGB(.02, .018, .015); } g.uFade.value = a; } if (d.t >= .48) { if (g) { g.uFade.value = 0; if (this._fc) g.uFadeColor.value.copy(this._fc); } this.dip = null; } }
    // a push: slow dolly, eased, then it simply holds
    if (this.move && this.hold <= 0) { const m = this.move; m.k = Math.min(1, m.k + dt / m.dur); const e = m.k * m.k * (3 - 2 * m.k); v.camera.position.lerpVectors(m.from, m.to, e); v.camera.lookAt(m.t0); v.controls.enabled = false; if (m.k >= 1) { this.move = null; v.controls.enabled = v.stage === 'explore' && !v.pov; } }
    // lens: ease the field of view toward the shot's focal length (or back to the base lens after the learner takes over)
    if (this.fovTo && Math.abs(v.camera.fov - this.fovTo) > .05 && !v.pov) { v.camera.fov += (this.fovTo - v.camera.fov) * Math.min(1, dt * 2.5); v.camera.updateProjectionMatrix(); }
    this.updateShots(dt);
    const b = this.beat; if (!b) return;
    if (!b.paused) b.t += dt;
    if (b.kind === 'event' && this.cinematic && v.running != null) this.targetScale = this.queue.length ? .12 : .3;   // more waiting → slower, so text never lags far behind the process
    if (b.bar === undefined) b.bar = (b.el || b.capBar) ? (b.el || b.capBar).querySelector('.co-time i') : null; if (b.bar) b.bar.style.width = Math.min(100, b.t / b.dur * 100).toFixed(1) + '%';
    // anchor on screen
    const p = b.anchor && b.anchor(); let sx = w * .5, sy = h * .42, on = false;
    if (p) { const q = p.clone().project(cam); if (q.z < 1) { sx = (q.x * .5 + .5) * w; sy = (-q.y * .5 + .5) * h; on = sx > 6 && sx < w - 6 && sy > 6 && sy < h - 6; if (!on) { sx = clamp(sx, 6, w - 6); sy = clamp(sy, 6, h - 6); } } }   // anchor off screen (POV): no dot or leader line
    // callout placement: on the emptier side of the anchor, kept inside the safe frame
    const e = b.el; if (e) {
      const panel = v.panel && !v.panel.hidden && !v.panel.classList.contains('folded') ? 380 : 24;
      // layout is read at most every 0.25 s (callout size, pins), never between this frame's writes
      if (!b.rects || b.t - (b.rectT || -1) > .25) { b.rectT = b.t; b.cw = e.offsetWidth || 300; b.ch = e.offsetHeight || 80; b.rects = [...(v.labels ? v.labels.querySelectorAll('.pin.in') : [])].filter(e => e.style.visibility !== 'hidden').map(e => e.getBoundingClientRect()); const hr = this.layer.getBoundingClientRect(); b.ox = hr.left; b.oy = hr.top; }
      const cw = b.cw, ch = b.ch;
      const place = c => { let x = c[0] > 0 ? sx + c[0] : sx + c[0] - cw, y = c[1] < 0 ? sy + c[1] - ch : sy + c[1]; x = clamp(x, panel, w - cw - 24); y = clamp(y, 84, h - ch - 120); return [x, y]; };
      if (!b.avoid || b.t - (b.avoidT || -1) > .3) {
        b.avoidT = b.t; b.avoid = [];
        if (b.focus) { const bx = new THREE.Box3().setFromObject(b.focus); if (!bx.isEmpty()) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < 8; k++) { const q = V3(k & 1 ? bx.max.x : bx.min.x, k & 2 ? bx.max.y : bx.min.y, k & 4 ? bx.max.z : bx.min.z).project(cam); const qx = (q.x * .5 + .5) * w, qy = (-q.y * .5 + .5) * h; x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy); } b.avoid.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, k: 6 }); } }
        [v.readPanel, v.panel, v.titleEl, v.povBar, v.ticker, v.ui && v.ui.querySelector('.dio-actions'), document.querySelector('.sound-btn')].forEach(P => { if (P && !P.hidden && P.getBoundingClientRect) { const r = P.getBoundingClientRect(); if (r.width) b.avoid.push({ x: r.left - b.ox, y: r.top - b.oy, w: r.width, h: r.height, k: 8 }); } });
      }
      const cost = ([x, y]) => { let o = 0; for (const A of b.avoid) { const ix = Math.max(0, Math.min(x + cw, A.x + A.w) - Math.max(x, A.x)), iy = Math.max(0, Math.min(y + ch, A.y + A.h) - Math.max(y, A.y)); o += ix * iy * A.k; } for (const r of b.rects) { const rx = r.left - b.ox, ry = r.top - b.oy, ix = Math.max(0, Math.min(x + cw, rx + r.width) - Math.max(x, rx)), iy = Math.max(0, Math.min(y + ch, ry + r.height) - Math.max(y, ry)); o += ix * iy * 3; } const ix = Math.max(0, Math.min(x + cw, sx + 12) - Math.max(x, sx - 12)), iy = Math.max(0, Math.min(y + ch, sy + 12) - Math.max(y, sy - 12)); return o + ix * iy * 50 + Math.hypot(x + cw / 2 - sx, y + ch / 2 - sy) * 2; };
      const C = [[110, -40], [-110, -40], [110, 40], [-110, 40], [0.01, -90]];
      const right0 = sx < w * .58; if (b.side == null) b.side = right0 ? 0 : 1;
      let best = b.side, bc = cost(place(C[b.side])); C.forEach((c, i) => { const k = cost(place(c)); if (k < bc * .7) { bc = k; best = i; } }); b.side = best;
      let [x, y] = place(C[best]); if (w < 760) { x = 10; y = h - ch - 128; }   // phones: a bottom sheet above the time bar
      const right = x > sx - cw / 2;
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
