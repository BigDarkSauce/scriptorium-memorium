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
import { el, esc, clamp, mathHTML, mathText } from '../util.js';
const UP = new THREE.Vector3(0, 1, 0), rad = THREE.MathUtils.degToRad, smoother = x => x * x * x * (x * (x * 6 - 15) + 10);

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PACE = { slow: 150, normal: 210, fast: 300 };   // words per minute
// guides: the shortest arrow drawn (px); a label's short form (the clause before the first comma, colon, dash or
// bracket, else its first four words); segment/segment and segment/rectangle tests for the label placement
const GMIN = 26;
function shortLabel(t) { t = String(t || '').trim(); if (t.length <= 22) return t; const c = t.split(/\s*[,:;(—–]\s*|\s+-\s+|…/)[0].trim(); if (c.length >= 4 && c.length <= 24) return c;
  const w = t.split(/\s+/), out = []; for (const x of w) { if ((out.join(' ') + ' ' + x).length > 20) break; out.push(x); } while (out.length > 1 && /^(the|a|an|of|to|and|or|in|on|at|by|for|its|is|[+\-−×=])$/i.test(out[out.length - 1])) out.pop(); return out.join(' ') + '…'; }
// the gap (px) between segment ab and the rectangle x, y, w, h (0 when they touch or cross)
function segRectDist(a, b, x, y, w, h) { if (segRect(a, b, x, y, w, h)) return 0; const pd = (px, py) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py); };
  const rd = (px, py) => Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h)); return Math.min(pd(x, y), pd(x + w, y), pd(x, y + h), pd(x + w, y + h), rd(a[0], a[1]), rd(b[0], b[1])); }
function segHit(a, b, c, d) { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
function segRect(a, b, x, y, w, h) {   // Liang–Barsky: does segment ab enter the rectangle?
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x], [dx, x + w - a[0]], [-dy, a[1] - y], [dy, y + h - a[1]]]) { if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; } const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  return true;
}
const MAXT = { slow: 32, normal: 24, fast: 15 };      // longest a callout stays, seconds (hover keeps it open)
const NS = 'http://www.w3.org/2000/svg';

export class Director {
  constructor(view, host) {
    this.v = view; this.queue = []; this.beat = null; this.timeScale = 1; this.hold = 0;
    const st = view.prefs; this.cinematic = st.cinematic !== false; this.guides = !!st.guides; this.pace = st.pace || 'normal';
    this.layer = el('div', { class: 'director' }); host.append(this.layer);
    this.svg = document.createElementNS(NS, 'svg'); this.svg.setAttribute('class', 'dir-svg'); this.layer.append(this.svg);
    // one arrowhead shape for every guide (in stroke-width units, so heads match the one line weight), one per colour
    this.svg.innerHTML = '<defs>' + [['dir-ah', '#ffd98a'], ['dir-ah-c', '#9fe3ff'], ['dir-ah-g', '#9fd8c6']].map(([id, c]) => `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('') + '</defs>';
    this.caption = el('div', { class: 'dir-caption', hidden: true }); this.layer.append(this.caption);
    this.trail = new Map();      // object → recent screen positions (for motion arrows)
    this._f = V3(); this._qI = new THREE.Quaternion(); this._qL = new THREE.Quaternion(); this._m4 = new THREE.Matrix4(); this.tsV = 0;
  }
  dispose() { this.endShots(true); this.layer.remove(); const g = this.v.gfx && this.v.gfx.grade && this.v.gfx.grade.uniforms; if (this.dip && g) { g.uFade.value = 0; if (this._fc) g.uFadeColor.value.copy(this._fc); } this.dip = null; this.move = null; }
  readTime(text) { const words = String(text || '').trim().split(/\s+/).length; return clamp(1.6 + words / PACE[this.pace] * 60, 3, MAXT[this.pace] || 24); }
  userGrab() { this.hold = 6; this.move = null; if (this.zoom) { this.zoom.follow = false; this.zoom.sw = null; } this.fovTo = this.baseFov(); this.last = null; if (this.zoom && this.zoom.phase === 'back') { this.restoreLens(); this.zoom = null; if (this.sbar) this.sbar.hidden = true; if (this.ring) this.ring.style.opacity = 0; } else if (this.zoom && this.zoom.phase !== 'done') { this.zoom.phase = 'done'; this.zoomDone(); } if (this.track && this.track.phase !== 'post') this.endTrack(true); }   // grabbing ends rides at once (no delayed snap-back)

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
      if (this.v.running != null && this.cinematic) this.targetScale = Math.min(this.targetScale ?? 1, .3);   // slow the process while its description waits (eased over ~0.4 s in update: a jump in speed shows as a hitch in a ride)
    }
    this.queue.push(beat); if (!this.beat) this.nextBeat();
  }
  static split(text, max) {
    const sents = String(text).match(/(?:[^.!?]|[.!?](?=\S))+(?:[.!?]+["”)]?(?:\s+|$)|$)/g) || [text], out = []; let cur = '';
    for (const x of sents) { const n = (cur + x).trim().split(/\s+/).length; if (cur && n > max) { out.push(cur.trim()); cur = x; } else cur += x; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  setCaption(title, text) { this.caption.hidden = false; this.caption.innerHTML = `<b>${mathHTML(title || '', 'label')}</b> ${mathHTML(text || '', 'label')}`; }
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
    this.targetScale = !this.cinematic ? 1 : b.kind === 'lesson' ? 0 : b.kind === 'event' && inStep ? .3 : 1; if (b.kind === 'lesson' && this.cinematic) { this.timeScale = 0; this.tsV = 0; }   // a new step starts frozen (read first); everything else eases
    if (b.caption) { this.setCaption(b.title, b.text); b.el = null; b.capBar = el('div', { class: 'co-time' }, [el('i')]); this.caption.append(b.capBar); if (this.cinematic && this.hold <= 0 && inStep && !b.noShot) this.frame(b); return; }
    // the shot
    if (this.cinematic && inStep && this.hold <= 0 && !b.noShot) this.frame(b);   // noShot: a label beat inside a move (peel layers) keeps the camera
    // the callout, beside what it describes
    b.el = el('div', { class: 'callout k-' + b.kind }, [
      el('div', { class: 'co-kicker', mathLabel: (b.kicker || (b.kind === 'event' ? 'Now' : b.kind === 'lesson' ? (b.title || 'Step') : 'Why')) + (b.part ? ' · ' + b.part : '') }),
      b.question ? el('div', { class: 'co-q' }, [el('b', { text: 'Q' }), ' ', el('span', { math: b.question })]) : null,
      el('div', { class: 'co-text', math: b.text }),
      b.opens && (!b.part || b.part.split('/')[0] === b.part.split('/')[1]) ? el('div', { class: 'co-opens', html: '→ ' + mathHTML(b.opens) }) : null, el('div', { class: 'co-foot' }, [el('div', { class: 'co-time' }, [el('i')]), el('button', { class: 'co-next', title: 'Next', 'aria-label': 'Next', text: '›', onclick: () => { if (this.beat === b) this.endBeat(); } })])]);
    b.el.addEventListener('mouseenter', () => b.paused = true); b.el.addEventListener('mouseleave', () => b.paused = false);
    this.layer.append(b.el); requestAnimationFrame(() => b.el && this.beat === b && b.el.classList.add('in'));   // (a beat already ended never fades in)
    b.line = document.createElementNS(NS, 'path'); b.line.setAttribute('class', 'co-line'); this.svg.append(b.line);
    b.dot = el('div', { class: 'co-dot' }); this.layer.append(b.dot);
    if (this.guides) this.makeGuides(b);
    this.v.highlightPins && this.v.highlightPins([b.host, ...(b.names || [])].filter(Boolean));
  }
  endBeat(all) {
    const b = this.beat; if (b && b.capBar) b.capBar.remove(); if (this.v.readPanel) this.v.readPanel.classList.remove('under-sheet'); if (b && b.onEnd && !all) { try { b.onEnd(); } catch (e) { console.warn(e); } } if (b) { const e = b.el; e && e.classList.remove('in'); setTimeout(() => e && e.remove(), 450); b.line && b.line.remove(); b.dot && b.dot.remove(); (b.guides || []).forEach(g => g.remove()); }
    this.beat = null; this.v.highlightPins && this.v.highlightPins(null); if (all) { this.timeScale = 1; this.tsV = 0; this.targetScale = 1; return; } this.nextBeat();
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
    // (nor during the pull-out after a ride or a POV, nor while a dolly is still on its way: the next shot waits for it)
    if (b.kind === 'event' && !b.poseOnly && ((this.zoom && this.zoom.phase !== 'back') || this.track || (this.bracket && this.bracket.phase !== 'pre') || this.move)) return;
    // the beat's camera mode (grammar.js): global, object and mechanism shots hold while the process plays (an event is read in
    // its callout, the frame stays); an operation that owns the frame (a comparison, an exploded view, a lineup) holds it too
    if (b.kind === 'event' && !b.poseOnly && ((this.mode && /^(global|object|mechanism)$/.test(this.mode)) || (v.ops && v.ops.holdShot()))) return;
    if (!b.poseOnly && v.ops && v.ops.ownsFrame()) return;   // a comparison or a lineup has its own fixed framing for the whole step
    let p = b.anchor && b.anchor(); if (!p && b.kind !== 'lesson') return;
    const R = v.ds.orb ? v.ds.orb.r : 10;
    let kind = b.shot || (b.kind === 'event' ? 'close' : b.kind === 'explain' ? 'medium' : p ? (this.last && this.last.moving ? 'medium' : 'push') : 'wide');
    if (kind === 'zoom') { if (b.zoom && b.zoom.to && this.startZoom(b)) return; kind = p ? 'medium' : 'wide'; }
    if (kind === 'track') { if (b.track && this.startTrack(b)) return; kind = p ? 'medium' : 'wide'; }
    if (kind === 'pov') { const a = b.host || (b.names || [])[0]; if (a && v.setPOV) { this.startBracket(a, b); return; } kind = 'close'; }
    if (kind === 'wide' || !p) { if (this.last && this.last.kind === 'wide') return; const k = this.wideKey(); this.cutTo(k.target, k.pos, this.baseFov(), true); this.last = { kind: 'wide', moving: false, t: this.clock }; return; }
    // subject size: its mesh box, grown to include its label point and (for explanations) the other named objects
    v.scene && v.scene.updateMatrixWorld(true);
    let box = null; if (b.focus) { box = new THREE.Box3().setFromObject(b.focus); if (box.isEmpty()) box = null; }
    if (box && b.extra && b.kind === 'lesson') { const eb = new THREE.Box3(); b.extra.forEach(a => { if (a.obj) { eb.setFromObject(a.obj); if (!eb.isEmpty() && eb.getSize(V3()).length() < R * 1.2) box.union(eb); } else { const q = a.getPos && a.getPos(); if (q) box.expandByPoint(q); } }); }
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
    // the free band vertically (below the title and the top buttons, above the time bar and, on a phone, the callout's
    // bottom sheet): the subject is centred in it, and the distance grows until the subject fits across the band and
    // across the free width (a portrait phone is narrow: its width, not its height, limits the shot)
    const H = innerHeight, fy = this.freeBand(H), bandF = Math.max(.25, (fy[1] - fy[0]) / H), wideF = Math.max(.25, (fr[1] - fr[0]) / W);
    if (!b.dist) dist = Math.max(dist, Math.min(R * 1.6, r / Math.tan(half) * 1.12 / bandF, r / (Math.tan(half) * Math.min(1, aspect)) * 1.12 / wideF));
    const yd = 1 - (fy[0] + fy[1]) / H;   /* NDC y of the band's centre */
    const right = V3().crossVectors(V3(0, 1, 0), dir).normalize(), hw = dist * Math.tan(half) * aspect, up2 = V3().crossVectors(dir, right).normalize();
    const target = p.clone().addScaledVector(right, -xd * hw).addScaledVector(up2, -yd * dist * Math.tan(half));
    const pos = target.clone().addScaledVector(dir, dist);
    if (b.poseOnly) return { target, pos, fov };
    if (kind === 'push') {
      const start = target.clone().addScaledVector(dir, dist * 1.45);
      this.cutTo(target.clone(), start, fov, true, () => { this.move = { from: start, to: pos, t0: target.clone(), k: 0, dur: 3.5 }; });
      this.last = { kind, moving: true, subj, t: this.clock, evKey: b.evKey };
    } else { this.cutTo(target, pos, fov, this.last ? this.last.kind !== kind || !this.near(pos) : true); this.last = { kind, moving: false, subj, t: this.clock, evKey: b.evKey }; }
    this.accent(p, r);
  }
  // the establishing view framed in the FREE part of the screen (not under the instruction panel or the readouts): the
  // model's overview, panned sideways so the significant bodies sit in the middle of the free frame, and pulled back
  // when they would not fit across it. Returns {target, pos} (the orbit pivot pans with the view).
  wideKey(W = innerWidth) {
    const v = this.v, k = v.ds.overviewKey(), R = v.ds.orb ? v.ds.orb.r : 10, target = k.target.clone(), pos = target.clone().addScaledVector(k.dir, R);
    const H = innerHeight, phone = W < 760, fr = this.freeFrame(W, true), fy = this.freeBand(H), sideOK = !(fr[1] - fr[0] < 120 || (fr[0] <= 80 && fr[1] >= W - 30));
    if (!sideOK && !phone) return { target, pos };
    const c = this._wc || (this._wc = new THREE.PerspectiveCamera()); c.fov = this.baseFov(); c.aspect = v.camera.aspect || 1.6; c.near = .05; c.far = 1e3; c.position.copy(pos); c.lookAt(target); c.updateProjectionMatrix(); c.updateMatrixWorld();
    v.scene.updateMatrixWorld(true);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const q = V3(), bx = new THREE.Box3();
    v.ds.actors.forEach(a => { if (!a.obj) return; bx.setFromObject(a.obj); if (bx.isEmpty() || bx.getSize(q).length() > R * 1.6) return; for (let i = 0; i < 8; i++) { q.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).project(c); if (q.z > 1) continue; const sx = (clamp(q.x, -1.6, 1.6) * .5 + .5) * W, sy = (-clamp(q.y, -1.6, 1.6) * .5 + .5) * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); } });
    if (!(x1 > x0)) return { target, pos };
    const fw = sideOK ? fr[1] - fr[0] : W - 32, fcx = sideOK ? (fr[0] + fr[1]) / 2 : W / 2, fh = fy[1] - fy[0];
    const grow = clamp(Math.max((x1 - x0) / (fw * .92), phone ? (y1 - y0) / (fh * .92) : 1), 1, phone ? 2.2 : 1.6), dist = R * grow, hh = dist * Math.tan(rad(c.fov / 2)), hw = hh * c.aspect;
    const shiftPx = ((x0 + x1) / 2 - W / 2) / grow - (fcx - W / 2), right = V3().crossVectors(V3(0, 1, 0), k.dir).normalize();   // positive: the bodies sit right of the free centre
    target.addScaledVector(right, shiftPx / W * 2 * hw);
    if (phone) { const up2 = V3().crossVectors(k.dir, right).normalize(), shiftY = ((y0 + y1) / 2 - H / 2) / grow - ((fy[0] + fy[1]) / 2 - H / 2); target.addScaledVector(up2, -shiftY / H * 2 * hh); }   /* positive shiftY: the bodies sit below the band's centre */
    pos.copy(target).addScaledVector(k.dir, dist);
    return { target, pos };
  }
  // the subject of each beat gets a soft accent light (the "hero" key of docs/research/presentation-craft.md §1)
  accent(p, r) { const L = this.v.accentLight; if (!L || !p) return; const c = this.v.camera, up = V3(0, 1, 0); const side = V3().crossVectors(c.position.clone().sub(p).normalize(), up).normalize();
    L.position.copy(p).addScaledVector(c.position.clone().sub(p).normalize(), r * 3 + 1).addScaledVector(up, r * 2.2 + .8).addScaledVector(side, r * 1.6); L.target.position.copy(p); L.target.updateMatrixWorld();
    const d = L.position.distanceTo(p); L.angle = Math.min(.9, Math.atan2(r * 1.4, d)); L.userData.goal = 1.1 * d * d; }
  // ---------- explainer shots (docs/research/explainer-animation.md): zoom (S4), track (S9), the POV bracket (S6.4) ----------
  reduced() { return !!(this.v.reducedMotion && this.v.reducedMotion()); }
  // a moving shot or a bracket is still on its way: cues that play "after the shot" (chain, peel) wait for it
  // (the pull-out after a ride or a POV and any dolly still on its way count too: the next beat waits for them to land)
  busy() { const z = this.zoom, k = this.track, br = this.bracket; return !!((z && z.phase !== 'done') || k || (br && br.phase !== 'ride') || this.dip || (this.move && this.hold <= 0)); }
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
  restoreLens() { const L = this._lens; if (!L) return; const c = this.v.camera; const d = c.position.distanceTo(this.v.controls.target); c.near = Math.min(L.near, Math.max(1e-4, d * .05)); c.far = L.far; c.updateProjectionMatrix(); this.v.controls.minDistance = Math.min(L.minD, d * .98); this._minD0 = L.minD; this._near0 = L.near; this._lens = null; }   // never clamp the orbit radius while the camera is still close in (no snap); the old minimum returns at the next cut
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
    const size = o => { const bx = o && o.obj ? new THREE.Box3().setFromObject(o.obj) : null; if (bx && !bx.isEmpty()) { const sz = bx.getSize(V3()); return { c: bx.getCenter(V3()), r: Math.max(.01, sz.length() * .5), rs: Math.max(.005, Math.max(sz.x, sz.y, sz.z) * .5) }; } const q = o && o.getPos && o.getPos(); return { c: (q || v.ds.center).clone(), r: .25, rs: .2 }; };
    const T = size(a), base = this.baseFov(), fovEnd = clamp(+Z.fovEnd || base, base - 10, base + 10), d1 = T.r / Math.tan(rad(fovEnd / 2)) * 1.4;
    const reduced = this.reduced(), wide = !reduced && (Z.from !== 'current' || (this.last && this.last.kind === 'push') || cam.position.distanceTo(T.c) < d1 * 3);   // never right after a push
    const go = () => {
      v.scene.updateMatrixWorld(true); this.subjPos(a, T.c);   // where the subject is NOW (the cut may have taken a moment)
      const axis = cam.position.clone().sub(T.c); let d0 = axis.length(); if (d0 < 1e-6) { axis.set(0, .35, 1); d0 = R; } axis.normalize(); d0 = Math.max(d0, d1 * 1.5);
      const st = (Z.stations || []).filter(s => s && s.a && s.a !== a).map(s => { const S = size(s.a); return { a: s.a, hold: clamp(+s.hold || 2, .5, 8), d: S.r / Math.tan(rad(base / 2)) * 1.4 }; }).filter(s => s.d < d0 * .92 && s.d > d1 * 1.08).sort((p, q) => q.d - p.d);
      const fin = (Z.stations || []).find(s => s && s.a === a), segs = []; let da = d0;
      st.forEach(s => { segs.push({ da, db: s.d, st: s }); da = s.d; }); segs.push({ da, db: d1, st: { a, hold: fin ? clamp(+fin.hold || 2.5, .5, 8) : 1, final: true } });
      segs.forEach(g => { g.T = clamp((+Z.perDecade || 3) * Math.log10(g.da / g.db), segs.length > 1 ? 1.2 : 2.5, 14); });
      const qT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, T.c, UP));
      this.saveLens();
      // the approach: the axis the dolly arrives along is chosen so nothing opaque stands between the lens and the subject
      // at the end (other molecules, a shelf, a frame bar), and the camera swings onto it during the first 75 % of the travel
      const occ = this.occluders(a), ax1 = this.clearAxis(T.c, axis, d0, d1, T.rs, occ, 105);
      this.zoom = { phase: reduced ? 'done' : 'ring', t: 0, a, c: T.c, r: T.r, rs: T.rs, d0, d1, d: d0, axis: axis.clone(), ax0: axis.clone(), ax1, qa: new THREE.Quaternion().setFromUnitVectors(axis, ax1), occ, cv: V3(), goal: V3(), follow: true, chk: 0, blockedN: 0, sw: null, fov0: cam.fov, fovEnd, segs, si: 0, q0: cam.quaternion.clone(), qT, back: !!Z.back, perDecade: +Z.perDecade || 3, n: segs.length, k: -1 };
      v.fly = null; this.move = null; this.fovTo = null; v.controls.enabled = false; v.controls.target.copy(T.c); this.hud();
      if (reduced) { this.zoom.d = d1; this.zoom.axis.copy(ax1); this.zoomPose(true); this.zoomDone(); }   // reduced motion: a cut and the scale bar
    };
    if (wide) { const k = v.ds.overviewKey(); this.cutTo(k.target.clone(), k.target.clone().addScaledVector(k.dir, R), base, true, go); }
    else { this.stopShots(); if (reduced) this.dip = { t: 0, done: false, apply: go }; else go(); }
    this.last = { kind: 'zoom', moving: true, subj: a, t: this.clock };
    return true;
  }
  // the subject's position: the centre of its mesh (a label point sits above it), else its anchor
  subjPos(a, out) { const bx = this._sbx || (this._sbx = new THREE.Box3()); if (a && a.obj) { bx.setFromObject(a.obj); if (!bx.isEmpty()) return bx.getCenter(out); } const q = a && a.getPos && a.getPos(); if (q) out.copy(q); return out; }
  // opaque meshes that can stand in the way of a zoom target (not the target itself, glass, ink, labels or sprites)
  occluders(a) {
    const out = [], ds = this.v.ds, mine = new Set(); if (a && a.obj) a.obj.traverse(o => mine.add(o));
    const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    const see = []; [ds.world, ds.extras].forEach(g => g && g.traverse(o => { if (!o.isMesh || mine.has(o) || o.userData.isInk || o.isSprite || !shown(o) || (o.isInstancedMesh && o.count > 200)) return;   /* dense instanced decor (grass tufts, fronds, molecules) never decides an approach */ const ms = [].concat(o.material); if (ms.some(m => !m || m.visible === false)) return; if (ms.some(m => m.transmission > 0 || (m.transparent && m.opacity < .6))) see.push(o); else out.push(o); }));
    out.see = see;   // see-through surfaces (glass, a membrane, water): they still dim and tint the view, so they count a little
    return out;
  }
  // how blocked the view of a target at c is from direction ax: five rays (centre and four around the target's rim) up to
  // the final distance d1 (heavy), and the centre ray up to the start distance d0 (light: the dolly passes through it)
  blockCost(c, ax, d0, d1, r, occ) {
    const rc = this._rc || (this._rc = new THREE.Raycaster()); rc.firstHitOnly = true; const u = V3(), w = V3(), o = V3(); let cost = 0;
    u.crossVectors(ax, Math.abs(ax.y) > .9 ? V3(1, 0, 0) : UP).normalize(); w.crossVectors(ax, u);
    const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.75, .75], [-.75, .75], [.75, -.75], [-.75, -.75]];
    for (const [i, j] of offs) {
      o.copy(c).addScaledVector(u, i * r * .85).addScaledVector(w, j * r * .85); const e = (this._bf || (this._bf = V3())).copy(c).addScaledVector(ax, d1).sub(o), L = e.length(); rc.set(o, e.divideScalar(L)); rc.near = r * .5; rc.far = L;   // toward the lens: the rays follow the view cone   // r: the subject's own radius; from inside its surface, so a neighbour pressed against it counts
      if (rc.intersectObjects(occ, false).length) cost += i || j ? 120 : 260;
      else if (occ.see && occ.see.length && rc.intersectObjects(occ.see, false).length) cost += i || j ? 25 : 50;
    }
    if (d0 > d1 * 1.1) { rc.set(c, ax); rc.near = d1 * 1.05; rc.far = d0; cost += rc.intersectObjects(occ, false).length * 3; }
    return cost;
  }
  // the clearest approach direction near ax0 (azimuth steps of 20°, a little above or below), never below the orbit's limit
  clearAxis(c, ax0, d0, d1, r, occ, maxAz = 75) {
    if (!occ || !occ.length) return ax0.clone();
    const base = this.blockCost(c, ax0, d0, d1, r, occ); if (base === 0) return ax0.clone();
    let best = ax0.clone(), bc = base; const az = [0, 20, -20, 40, -40, 60, -60, 80, -80, 105, -105].filter(x => Math.abs(x) <= maxAz), el = [0, 18, 34, -12], t = V3(), side = V3();
    for (const a of az) for (const e of el) {
      if (!a && !e) continue; t.copy(ax0).applyAxisAngle(UP, rad(a)); side.crossVectors(t, UP); if (side.lengthSq() > 1e-6) t.applyAxisAngle(side.normalize(), rad(e));
      if (t.y < Math.max(.05, Math.cos(this.v.controls.maxPolarAngle ?? Math.PI) + .02) || t.y > .94) continue;   // never below the orbit's polar limit: the controls would snap the view back once they take over
      const k = this.blockCost(c, t, d0, d1, r, occ) + (Math.abs(a) + Math.abs(e)) * .4; if (k < bc) { bc = k; best = t.clone(); }
    }
    return best;
  }
  zoomPose(final) {
    const Z = this.zoom, cam = this.v.camera, R = this.v.ds.orb ? this.v.ds.orb.r : 10;
    cam.position.copy(Z.c).addScaledVector(Z.axis, Z.d); cam.lookAt(Z.c);
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
    // the subject moves (a molecule in a running gas): the aim follows it on a critically damped spring (no jerk when it
    // bounces), so the view never ends on the empty space it has left; the learner taking the camera stops the follow
    const c0x = Z.c.x, c0y = Z.c.y, c0z = Z.c.z;
    if (Z.follow && Z.phase !== 'back') { this.subjPos(Z.a, Z.goal); const w = 7, ax = this._f.copy(Z.goal).sub(Z.c).multiplyScalar(w * w).addScaledVector(Z.cv, -2 * w); Z.cv.addScaledVector(ax, dt); Z.c.addScaledVector(Z.cv, dt); }
    // while held, keep the line of sight clear: other molecules drift in front; a blocked view (for over 0.5 s) swings the
    // camera round the subject to the clearest nearby direction, in 1.4 s (at most 50°)
    if ((Z.phase === 'hold' || (Z.phase === 'done' && Z.follow)) && this.timeScale > .05) {
      Z.chk += dt; if (Z.chk > .25 && !Z.sw) { Z.chk = 0; const k = this.blockCost(Z.c, Z.axis, Z.d, Z.d, Z.rs, Z.occ); Z.blockedN = k >= 240 ? Z.blockedN + 1 : 0;
        if (Z.blockedN >= 2) { Z.blockedN = 0; const nx = this.clearAxis(Z.c, Z.axis, Z.d, Z.d, Z.rs, Z.occ, 50); if (nx.angleTo(Z.axis) > .05) Z.sw = { a0: Z.axis.clone(), q: new THREE.Quaternion().setFromUnitVectors(Z.axis, nx), t: 0 }; } }
      if (Z.sw) { const S = Z.sw; S.t += dt; const k = Math.min(1, S.t / 1.4); Z.axis.copy(S.a0).applyQuaternion(this._qI.identity().slerp(S.q, smoother(k))); if (k >= 1) Z.sw = null; }
    }
    if (Z.phase === 'done') {
      // after arrival the learner may orbit; until they grab the camera it keeps following (and swinging clear of) the subject
      if (Z.follow && (v.running != null || (this.beat && this.beat.kind === 'explain')) && this.hold <= 0) { const dx = Z.c.x - c0x, dy = Z.c.y - c0y, dz = Z.c.z - c0z; v.controls.target.copy(Z.c); if (Z.sw) { cam.position.copy(Z.c).addScaledVector(Z.axis, cam.position.distanceTo(Z.c) || Z.d); cam.lookAt(Z.c); } else { cam.position.x += dx; cam.position.y += dy; cam.position.z += dz; } }
    } else if (Z.phase === 'hold') this.zoomPose(true);
    if (Z.phase === 'ring') { if (Z.t >= .5) { Z.phase = 'centre'; Z.t = 0; } }
    else if (Z.phase === 'centre') { const k = Math.min(1, Z.t / .6); this._m4.lookAt(cam.position, Z.c, UP); Z.qT.setFromRotationMatrix(this._m4); cam.quaternion.slerpQuaternions(Z.q0, Z.qT, k * k * (3 - 2 * k)); if (k >= 1) { Z.phase = 'travel'; Z.t = 0; } }
    else if (Z.phase === 'travel') {
      const g = Z.segs[Z.si], u = Math.min(1, Z.t / g.T); Z.d = g.da * Math.pow(g.db / g.da, smoother(u));
      const uT = Math.log(Z.d0 / Z.d) / Math.log(Z.d0 / Z.d1), e = clamp(uT / .75, 0, 1); Z.axis.copy(Z.ax0).applyQuaternion(this._qI.identity().slerp(Z.qa, e * e * (3 - 2 * e)));   // swing onto the clear axis
      this.zoomPose();
      if (u >= 1) { Z.phase = 'hold'; Z.t = 0; Z.k = Z.si; const nm = g.st.a.name.split(' · ')[0]; if (Z.n > 1 || g.st.final) this.chip(`<b>Station ${Z.si + 1} of ${Z.n}</b> · ${mathHTML(nm, 'label')}`); v.touchLabels && v.touchLabels([g.st.a]); }
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
    // both rails are reparametrised by arc length finely enough that the speed stays even through tight control points
    const mk = arr => { const c = new THREE.CatmullRomCurve3(arr.map(p => V3(+p[0] || 0, +p[1] || 0, +p[2] || 0)), false, 'centripetal'); c.arcLengthDivisions = Math.max(600, arr.length * 160); c.updateArcLengths(); return c; };
    const curve = mk(T.points), look = Array.isArray(T.look) && T.look.length >= 2 ? mk(T.look) : null;   // look: the subject's own path, framed from the rail at the same fraction
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(96)), new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    line.renderOrder = 40; line.userData.isInk = true; line.raycast = () => { }; line.name = 'track preview';
    // a marker on the subject's path (the parcel of air you follow): a small bright bead, so the ride has a subject in frame
    let marker = null; if (look && T.marker) { marker = new THREE.Mesh(new THREE.SphereGeometry(+T.markerR || .1, 18, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.marker === true ? '#ffe7b0' : T.marker).multiplyScalar(1.6), toneMapped: false, depthTest: false, transparent: true, opacity: .95 })); marker.renderOrder = 41; marker.userData.isInk = true; marker.raycast = () => { }; marker.name = 'track marker'; marker.visible = false; }
    const k = this.wideKey(); this.cutTo(k.target, k.pos, this.baseFov(), true);
    v.scene.add(line); if (marker) v.scene.add(marker);
    this.track = { phase: 'pre', t: 0, curve, look, line, marker, fov: clamp(+T.fov || 55, 30, 75), dur: clamp(+T.dur || 8, 3, 20), la: clamp(T.lookAhead ?? .08, 0, .3), ls: clamp(T.lookAtSubject ?? 0, 0, 1), preview: T.preview !== false, aim: Array.isArray(T.aim) ? V3(+T.aim[0] || 0, +T.aim[1] || 0, +T.aim[2] || 0) : null, subj: b.host, rate: 0, q: new THREE.Quaternion(), m: new THREE.Matrix4(), e: V3(), l: V3() };
    this.hud(); this.chip(`You will ride <b>${esc(T.label || T.name || 'the track')}</b> · the rail shows the way`);
    this.last = { kind: 'track', moving: true, subj: b.host, t: this.clock };
    return true;
  }
  endTrack(now) {
    const K = this.track; if (!K) return; const v = this.v;
    if (now || !this.cinematic) { K.line.removeFromParent(); K.line.geometry.dispose(); K.line.material.dispose(); if (K.marker) { K.marker.removeFromParent(); K.marker.geometry.dispose(); K.marker.material.dispose(); } this.track = null; if (!this.move) v.controls.enabled = v.stage === 'explore' && !v.pov; return; }
    if (K.phase !== 'ride') { this.endTrack(true); return; }   // ended before the ride began (a new step): nothing to pull out from
    // the pull-out: back to a medium of the subject (or the overview), the rail stays as the trail of where you were
    const pose = K.subj ? this.frame({ anchor: () => K.subj.getPos(), focus: K.subj.obj, host: K.subj, names: [], kind: 'explain', shot: 'medium', poseOnly: true }) : null;
    const ok = this.wideKey(), tgt = pose ? pose.target : ok.target, to = pose ? pose.pos : ok.pos, cam = v.camera;
    // the heading turns from the ride's toward the subject over the whole move (a slerp, never a snap); a bigger turn takes longer
    this._m4.lookAt(to, tgt, UP); this._qL.setFromRotationMatrix(this._m4); const turn = cam.quaternion.angleTo(this._qL);
    this.restoreLens(); v.controls.target.copy(tgt); this.move = { from: cam.position.clone(), to, t0: tgt, k: 0, dur: clamp(2 + turn / Math.PI * 1.6, 2, 3.6), q0: cam.quaternion.clone() }; if (pose) this.fovTo = pose.fov;
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
      // departure: the lens change and the jump onto the rail happen under a dip (like entering a POV), never as a visible cut
      if (!K.go && K.t >= (K.preview ? 1.5 : .5)) { K.go = true; this.chip(null); this.move = null; v.fly = null; v.controls.enabled = false;
        this.dip = { t: 0, done: false, apply: () => { if (this.track !== K) return; this.saveLens(); cam.near = .02; cam.far = 400; cam.fov = K.fov; cam.updateProjectionMatrix(); this.fovTo = null; K.phase = 'ride'; K.t = 0; K.rate = 0;
          this.trackPose(K, this.reduced() ? .5 : 0); cam.position.copy(K.e); cam.lookAt(K.l); if (K.marker) K.marker.visible = true; if (this.beat && this.beat.kind === 'lesson') this.beat.thawed = true; } };
        v.app && v.app.sfx && v.app.sfx.play('whoosh'); }
    } else if (K.phase === 'ride') {
      const tau = Math.min(1, K.t / K.dur), f = .15, vm = 1 / (1 - f);
      const s = this.reduced() ? .5 : tau < f ? vm * tau * tau / (2 * f) : tau < 1 - f ? vm * (f / 2 + tau - f) : 1 - vm * (1 - tau) * (1 - tau) / (2 * f);
      this.trackPose(K, clamp(s, 0, 1));
      if (K.l.distanceToSquared(K.e) < 1e-8) K.l.add(this._f);
      cam.position.copy(K.e); if (!this.reduced()) this.turn(K, K.e, K.l, dt);
      if (tau >= 1) this.endTrack();
    } else if (K.phase === 'post' && K.t > 2.3) this.endTrack(true);
  }
  // the eye on the rail at fraction s, and where it looks: the subject's path a little ahead (or the rail ahead), blended
  // toward the subject itself by lookAtSubject
  trackPose(K, s) {
    K.curve.getPointAt(s, K.e);
    if (K.look) { K.look.getPointAt(Math.min(1, s + K.la), K.l); if (K.marker) K.look.getPointAt(s, K.marker.position); }
    else K.curve.getPointAt(Math.min(1, s + K.la), K.l);
    if (K.aim) K.l.add(K.aim);   // aim: an offset of the look point (a little below the subject keeps the ground in frame)
    if (K.ls > 0 && K.subj) { const q = this.subjPos(K.subj, this._b || (this._b = V3())); if (q) K.l.lerp(q, K.ls); }
  }
  // S6.4 bracketing: a medium of the actor in context with "You will see as …" for 1.5 s before the ride, and a 2 s
  // pull-out with a fading trail of where the actor went ("You were here") after it
  startBracket(a, b) {
    const v = this.v; this.hud();
    this.bracket = { phase: 'pre', t: 0, a, look: b.povLook, hist: Array.from({ length: 120 }, () => V3()), n: 0, hi: 0, ht: 0 };
    this.last = null; this.frame({ anchor: () => a.getPos(), focus: a.obj, host: a, names: [], kind: 'explain', shot: 'medium' });
    this.chip(`You will see as: <b>${mathHTML(a.name.split(' · ')[0], 'label')}</b>`);
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
  // the free part of the frame, from the panels' final layout (offsets ignore the slide/fold transforms in progress)
  freeFrame(W, raw) { const v = this.v, P = v.panel, Rp = v.readPanel, ox = P && P.offsetParent ? P.offsetParent.getBoundingClientRect().left : 0; const L = P && !P.hidden && !P.classList.contains('folded') ? ox + P.offsetLeft + P.offsetWidth + 12 : 70; const R = Rp && !Rp.hidden && Rp.offsetWidth ? ox + Rp.offsetLeft - 12 : W - 24; return raw || R - L > W * .35 ? [L, R] : [0, W]; }   // raw: the gap itself, however narrow
  // the free band of the frame vertically: [top, bottom] in px. Top: below the title and the top button row. Bottom: above
  // the time bar, and on a phone above the callout's bottom sheet (its last measured height, else a typical one)
  freeBand(H = innerHeight) { const phone = innerWidth < 760, top = phone ? 70 : 64; const bot = phone ? H - 128 - (this._sheetH || 170) - 10 : H - 84; return bot - top > H * .25 ? [top, bot] : [top, Math.max(top + H * .25, bot)]; }
  near(pos) { return this.v.camera.position.distanceTo(pos) < (this.v.ds.orb ? this.v.ds.orb.r : 10) * .12; }
  // a cut: dip through the grade for a fraction of a second, change camera, come back up (or a short ease if the change is small)
  cutTo(target, pos, fov, dip, then) {
    this.stopShots();   // a new shot ends a zoom or a ride still on screen (and gives the lens back)
    const v = this.v, apply = () => { v.fly = null; v.controls.target.copy(target); v.camera.position.copy(pos); v.camera.fov = fov; if (this._minD0 != null) { const d = pos.distanceTo(target); v.controls.minDistance = Math.min(this._minD0, d); v.camera.near = Math.min(this._near0 ?? v.camera.near, Math.max(1e-4, d * .05)); this._minD0 = null; } v.camera.updateProjectionMatrix(); v.camera.lookAt(target); this.fovTo = fov; then && then(); };
    this.move = null;
    if (!dip) { v.flyTo ? (v.fly = { from: { p: v.camera.position.clone(), t: v.controls.target.clone() }, to: { p: pos.clone(), t: target.clone() }, k: 0, dur: 1.1, lift: 0 }) : apply(); this.fovTo = fov; v.controls.enabled = false; if (then) setTimeout(then, 1100); return; }
    this.dip = { t: 0, apply, done: false };
    v.app && v.app.sfx && v.app.sfx.play('cut', { gain: .5 });
  }
  // Guides (the Guides toggle): screen-space SVG arrows that show the flow of the dynamics.
  //  - one grammar: straight shafts, one line weight, one arrowhead per colour (amber motion, cyan process/quantity,
  //    green links); solid for quantities, dashed for processes, dotted for links;
  //  - motion: from the moving body's rim along its world velocity, length ∝ speed, clamped to [GMIN, gmax];
  //  - quantity flows ({at, vec, ref}): anchored at the body, length ∝ |vec| / ref, clamped the same way;
  //  - process flows ({from, to}): a straight arrow, at most gcap long (shortened toward its head); two opposite flows
  //    between the same places (a forward and a backward process) become two parallel lanes;
  //  - links to the other actors a sentence names: a short connector with at most one bend, trimmed off both bodies;
  //  - labels: beside their own arrow's midpoint, offset perpendicular; placed greedily so that none crosses an arrow,
  //    another label, a pin or the callout; a shorter text when space is tight (the full text is the hover tooltip).
  // Hidden (display:none) while Guides is off; made on demand when it is switched on during a beat.
  makeGuides(b) {
    b.guides = [];
    const mk = (cls, mark) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); p.setAttribute('marker-end', `url(#${mark})`); this.svg.append(p); b.guides.push(p); return p; };
    b.motion = mk('guide motion', 'dir-ah'); b.wtrail = [];
    b.links = (b.names || []).slice(0, 3).map(a => ({ a, path: mk('guide link', 'dir-ah-g') }));   // the named objects already carry their pins
    // process arrows supplied by the model for this event (DIO.<type>.flows): what pushes what, where
    b.flowEls = (b.flows || []).slice(0, 4).map(f => {
      const path = mk(f.vec ? 'guide vec' : 'guide flow', 'dir-ah-c'), t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'guide-label');
      const pill = document.createElementNS(NS, 'rect'); pill.setAttribute('class', 'guide-pill'); pill.setAttribute('rx', '9'); pill.style.opacity = 0; this.svg.append(pill); b.guides.push(pill);
      const full = mathText(String(f.label || '')), short = mathText(f.short || shortLabel(String(f.label || ''))),   /* typeset (plain Unicode: SVG tspan, compared by text) */ tip = document.createElementNS(NS, 'title'), vis = document.createElementNS(NS, 'tspan');
      tip.textContent = full; vis.textContent = full; t.append(tip, vis); this.svg.append(t); b.guides.push(t);
      // widths measured once (one layout read per beat): the placement then works on numbers
      const wF = t.getComputedTextLength ? t.getComputedTextLength() : full.length * 7; vis.textContent = short; const wS = short === full ? wF : (t.getComputedTextLength ? t.getComputedTextLength() : short.length * 7); vis.textContent = full;
      return { f, path, t, vis, pill, full, short, wF: wF || full.length * 7, wS: wS || short.length * 7 };
    });
  }
  showGuides(b, on) { (b.guides || []).forEach(g => { g.style.display = on ? '' : 'none'; }); b.gOff = !on; }
  drawGuides(b, cam, w, h, sx, sy, p) {
    const v = this.v, R = v.ds.orb ? v.ds.orb.r : 10, gmax = clamp(Math.min(w, h) * .15, 56, 118), gcap = clamp(Math.min(w, h) * .42, 150, 340);
    const gv = this._gv || (this._gv = V3()), scr = q => { const s = gv.copy(q).project(cam); return { x: (s.x * .5 + .5) * w, y: (-s.y * .5 + .5) * h, ok: s.z < 1 && Math.abs(s.x) < .98 && Math.abs(s.y) < .98 }; };
    const segs = [];   // every arrow drawn this frame, for the labels to stay off
    const setLine = (path, pts) => { if (!pts) { path.setAttribute('d', ''); return; } path.setAttribute('d', 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L')); for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); };
    // the on-screen radius of a body (arrows start at its rim, links stop short of it)
    const sph = this._gSph || (this._gSph = new THREE.Sphere()), bx = this._gBox || (this._gBox = new THREE.Box3());
    const bodyOf = obj => { if (!obj || !obj.isObject3D) return null; bx.setFromObject(obj); if (bx.isEmpty()) return null; bx.getBoundingSphere(sph); return sph; };
    const rimOf = obj => { const S = bodyOf(obj); if (!S) return 9; const c = scr(S.center), e = scr(this._f.copy(S.center).addScaledVector(cam.up, S.radius)); return clamp(Math.hypot(e.x - c.x, e.y - c.y) * .8, 7, 42); };
    const arrowFrom = (x, y, dx, dy, L, rim) => { const n = Math.hypot(dx, dy); if (n < 1e-6) return null; dx /= n; dy /= n; return [[x + dx * rim, y + dy * rim], [x + dx * (rim + L), y + dy * (rim + L)]]; };
    const grow = Math.min(1, b.t / 1.2), ease = grow * grow * (3 - 2 * grow);
    // motion: from how the subject moves in the WORLD (camera moves don't count), shown only when it really moves
    {
      const hs = bodyOf(b.host && b.host.obj), wp = hs ? hs.center.clone() : (b.host && b.host.getPos && b.host.getPos()) || p, tr = b.wtrail;   // the body itself (its label anchor floats above it)
      if (wp) tr.push([wp.clone(), b.t]); while (tr.length > 2 && b.t - tr[0][1] > .6) tr.shift();
      const a0 = tr[0]; let pts = null;
      if (wp && a0 && b.t - a0[1] > .2) {
        const hq = scr(wp), dW = wp.clone().sub(a0[0]), sp = dW.length() / (b.t - a0[1]);
        // (quantity arrows at the body already show how it moves: no motion arrow then)
        if (hq.ok && sp > R * .006 && !(b.flowEls || []).some(F => F.f.vec)) { const q2 = scr(wp.clone().addScaledVector(dW.normalize(), R * .05)); pts = arrowFrom(hq.x, hq.y, q2.x - hq.x, q2.y - hq.y, clamp(gmax * sp / (R * .5), GMIN, gmax), b.rim ?? 9); }
      }
      if (b.rimT == null || b.t - b.rimT > .5) { b.rimT = b.t; b.rim = rimOf(b.host && b.host.obj); }
      setLine(b.motion, pts); b.motion.style.opacity = pts ? 1 : 0;
    }
    // flows: quantities at the body, processes between places
    const FE = b.flowEls || [], fv = q => typeof q === 'function' ? q() : V3().fromArray(q);
    FE.forEach(F => { F.pts = null; const f = F.f;
      try {
        if (f.vec) {
          const A = f.at ? fv(f.at) : (b.host && b.host.getPos && b.host.getPos()) || p; if (!A) return; const V = fv(f.vec), m = V.length(); if (m < 1e-6) return;
          const a = scr(A), c = scr(A.clone().addScaledVector(V, R * .05 / m)); if (!a.ok) return;
          F.pts = arrowFrom(a.x, a.y, c.x - a.x, c.y - a.y, clamp(gmax * m / ((typeof f.ref === 'function' ? f.ref() : f.ref) || 1), GMIN, gmax * 1.15) * ease, f.rim ?? (b.rim ?? 9));
        } else {
          const a = scr(fv(f.from)), c = scr(fv(f.to)); if (!a.ok || !c.ok) return;
          let ax = a.x, ay = a.y, cx = c.x, cy = c.y, L = Math.hypot(cx - ax, cy - ay); if (L < 4) return;
          if (L > gcap) { ax = cx - (cx - ax) * gcap / L; ay = cy - (cy - ay) * gcap / L; L = gcap; }   // too long: shortened toward its head
          if (L < GMIN) { const ux = (cx - ax) / L, uy = (cy - ay) / L, mx = (ax + cx) / 2, my = (ay + cy) / 2; ax = mx - ux * GMIN / 2; ay = my - uy * GMIN / 2; cx = mx + ux * GMIN / 2; cy = my + uy * GMIN / 2; L = GMIN; }
          F.raw = [ax, ay, cx, cy, L];
        }
      } catch (e) { F.pts = null; F.raw = null; }
    });
    // opposite processes between the same two places (A + B → C and C → A + B): two parallel lanes, 8 px either side
    FE.forEach(F => { F.lane = F.f.lane || 0; });
    for (let i = 0; i < FE.length; i++) for (let j = i + 1; j < FE.length; j++) { const P = FE[i].raw, Q = FE[j].raw; if (FE[i].f.vec || FE[j].f.vec || !P || !Q) continue; const near = Math.hypot(P[0] - Q[2], P[1] - Q[3]) + Math.hypot(P[2] - Q[0], P[3] - Q[1]) < .35 * (P[4] + Q[4]) + 30; if (near && !FE[i].f.lane && !FE[j].f.lane) { FE[i].lane = 1; FE[j].lane = 1; } }
    FE.forEach(F => { if (F.f.vec || !F.raw) return; let [ax, ay, cx, cy, L] = F.raw; F.raw = null; const ux = (cx - ax) / L, uy = (cy - ay) / L;
      if (F.lane) { const o = 8 * Math.sign(F.lane), tr = L * .1; ax += -uy * o + ux * tr; ay += ux * o + uy * tr; cx += -uy * o - ux * tr; cy += ux * o - uy * tr; }   // the left side of each direction: opposite arrows sit on opposite sides
      F.pts = [[ax, ay], [ax + (cx - ax) * ease, ay + (cy - ay) * ease]]; });
    FE.forEach(F => setLine(F.path, F.pts));
    // while quantity arrows are drawn, the model's own 3D vector arrows step aside (VecArrow in models.js reads this)
    if (v.ds && v.ds.scene) v.ds.scene.userData.vecMute = FE.some(F => F.f.vec && F.pts);
    // links: subject → each named actor, one bend at most, trimmed off both bodies
    (b.links || []).forEach(L2 => {
      const q = L2.a.getPos && L2.a.getPos(); if (!q) { setLine(L2.path, null); return; } const t = scr(q); if (!t.ok) { setLine(L2.path, null); return; }
      const dx = t.x - sx, dy = t.y - sy, d = Math.hypot(dx, dy); if (d < 40) { setLine(L2.path, null); return; }
      const r0 = 12, r1 = (L2.rimT == null || b.t - L2.rimT > .5) ? (L2.rimT = b.t, L2.rim = rimOf(L2.a.obj) + 6) : L2.rim;
      let pts;
      if (Math.abs(dx) < 28 || Math.abs(dy) < 28 || d < 110) pts = [[sx + dx / d * r0, sy + dy / d * r0], [t.x - dx / d * r1, t.y - dy / d * r1]];
      else {   // an elbow: leave the subject level, then go straight up/down into the actor (or the other way when that crosses less)
        const opt = k => k ? [[sx + Math.sign(dx) * r0, sy], [t.x, sy], [t.x, t.y - Math.sign(dy) * r1]] : [[sx, sy + Math.sign(dy) * r0], [sx, t.y], [t.x - Math.sign(dx) * r1, t.y]];
        const hits = P => segs.reduce((n, s) => n + (segHit(P[0], P[1], s[0], s[1]) ? 1 : 0) + (segHit(P[1], P[2], s[0], s[1]) ? 1 : 0), 0);
        if (L2.k == null || hits(opt(L2.k)) > hits(opt(1 - L2.k))) L2.k = hits(opt(1)) <= hits(opt(0)) ? 1 : 0; pts = opt(L2.k);
      }
      setLine(L2.path, pts);
    });
    // labels: greedy, in flow order; obstacles are every arrow (padded), the labels already placed, the pins, the callout and the frame
    const LH = 17, pad = 5, placed = [], boxes = [], pins = [];
    (b.rects || []).forEach(r => pins.push([r.left - b.ox - 4, r.top - b.oy - 3, r.width + 8, r.height + 6]));
    const CC = v.cues && v.cues.chain; if (CC && CC.rects) CC.rects.forEach(r => pins.push([r[0] - 15 - (b.ox || 0), r[1] - 15 - (b.oy || 0), 30, 30]));   // the chain's numbered badges (centres)   // the pins (a label over a pin hides its name): weighed more than an arrow
    if (b.box) boxes.push(b.box);
    if (b.dot && b.dot.style.opacity === '1') { boxes.push([sx - 11, sy - 11, 22, 22]); if (b.box) { const bx2 = b.box, ax2 = bx2[0] > sx - bx2[2] / 2 ? bx2[0] : bx2[0] + bx2[2]; segs.push([[ax2, bx2[1] + bx2[3] * .6], [sx, sy]]); } }   /* the callout's anchor dot and (roughly) its leader */
    (b.hard || []).forEach(A => boxes.push([A.x, A.y, A.w, A.h]));   // the readouts, button column, POV bar, inset
    if (v.panel && !v.panel.hidden) boxes.push([0, 0, v.panel.classList.contains('folded') ? 70 : 370, h]);   // the lesson panel (the same widths the callout keeps clear of)
    // a label's cost: 10 per arrow crossing its padded box (soft), 100 for leaving the frame or covering a HUD box,
    // another label or a pin (hard: never accepted)
    const cost = (x, y, wd) => { let c = 0; if (x < 4 || y < 4 || x + wd > w - 4 || y + LH > h - 4) c += 100;
      for (const s of segs) if (segRect(s[0], s[1], x - pad, y - pad, wd + 2 * pad, LH + 2 * pad)) c += 10;
      for (const B of boxes.concat(placed, pins)) { const ix = Math.min(x + wd + 6, B[0] + B[2]) - Math.max(x - 6, B[0]), iy = Math.min(y + LH + 6, B[1] + B[3]) - Math.max(y - 6, B[1]); if (ix > 0 && iy > 0) c += 100; }
      return c; };
    FE.forEach(F => {
      if (!F.pts || !F.full) { F.t.style.opacity = 0; if (F.pill) F.pill.style.opacity = 0; return; }
      const [[ax, ay], [cx, cy]] = F.pts, L = Math.hypot(cx - ax, cy - ay) || 1, ux = (cx - ax) / L, uy = (cy - ay) / L, side0 = F.lane ? 1 : (F.side || 1);
      // candidates hug their own arrow: beside the shaft (midpoint first, then along it), at a gap of 6–18 px, never
      // more than LMAX from the arrow; the full text first, then the short form. No clear spot → the label hides and the
      // arrow carries the full text as its tooltip (a label far from its arrow reads as belonging to something else).
      const cand = [], seg = F.pts, LMAX = 24;
      [F.full, F.short].forEach((txt, vi) => { if (vi && txt === F.full) return; const wd = vi ? F.wS : F.wF;
        [.5, .38, .62, .25, .75, .9, .1].forEach(k => [side0, -side0].forEach(sd => [0, 1].forEach(far => { const nx = -uy * sd, ny = ux * sd, off = 6 + far * 12 + Math.abs(nx) * wd / 2 + Math.abs(ny) * LH / 2, mx = ax + (cx - ax) * k + nx * off, my = ay + (cy - ay) * k + ny * off, x = mx - wd / 2, y = my - LH / 2;
          if (segRectDist(seg[0], seg[1], x, y, wd, LH) <= LMAX) cand.push({ txt, wd, x, y, sd, k, vi, far }); }))); });
      // keep last frame's choice while it is still clear (no flicker); otherwise the cheapest acceptable candidate
      let best = null, bc = 1e9; const keep = F.lc && cand.find(c => c.vi === F.lc.vi && c.k === F.lc.k && c.sd === F.lc.sd && c.far === F.lc.far);
      if (keep && cost(keep.x, keep.y, keep.wd) === 0) best = keep;
      else for (const c of cand) { const k = cost(c.x, c.y, c.wd) + c.vi * 4 + Math.abs(c.k - .5) * 6 + c.far * 3; if (k < bc) { bc = k; best = c; if (k === 0) break; } }
      if (!best || bc >= 100) { F.lc = null; F.t.style.opacity = 0; if (F.pill) F.pill.style.opacity = 0; F.hidden = true; if (!F.tip) { F.tip = document.createElementNS(NS, 'title'); F.tip.textContent = F.full; F.path.append(F.tip); } F.path.style.pointerEvents = 'stroke'; F.path.style.cursor = 'help'; return; }
      F.hidden = false; F.path.style.pointerEvents = ''; F.lc = { vi: best.vi, k: best.k, sd: best.sd, far: best.far }; if (!F.lane) F.side = best.sd;
      if (F.vis.textContent !== best.txt) F.vis.textContent = best.txt;
      F.t.setAttribute('x', (best.x + best.wd / 2).toFixed(0)); F.t.setAttribute('y', (best.y + LH - 4).toFixed(0)); F.t.style.opacity = ease > .6 ? 1 : 0;
      // the backing: a dark translucent pill behind the text, so it reads on grass, sky or a bright model alike
      if (F.pill) { F.pill.setAttribute('x', (best.x - 6).toFixed(0)); F.pill.setAttribute('y', (best.y - 1).toFixed(0)); F.pill.setAttribute('width', (best.wd + 12).toFixed(0)); F.pill.setAttribute('height', LH + 2); F.pill.style.opacity = ease > .6 ? 1 : 0; }
      placed.push([best.x - 12, best.y - 7, best.wd + 24, LH + 14]);   // its pill plus 6 px: the next label's pill keeps ≥ 6 px away
    });
  }
  // ---------- per frame ----------
  update(dt, cam, w, h) {
    this.hold = Math.max(0, this.hold - dt);
    const v = this.v;
    // a ride is the step's experience, not something to read before: the process runs (slowed) while you ride, so something
    // happens on the way (an instruction still being read would otherwise hold it at 0)
    const riding = ((this.track && this.track.phase === 'ride') || (this.beat && this.beat.thawed)) && v.running != null;   // (once the ride has begun its instruction no longer freezes the model)
    if (riding) this.targetScale = Math.max(this.targetScale ?? 1, .6);
    // time scale: a critically damped ease (settles in ~0.4 s, no step in speed or in acceleration)
    if (dt > 0) { const goal = this.targetScale ?? 1, w = 10, acc = w * w * (goal - this.timeScale) - 2 * w * this.tsV; this.tsV += acc * dt; this.timeScale += this.tsV * dt; if (this.timeScale < 0) { this.timeScale = 0; if (this.tsV < 0) this.tsV = 0; } }
    this.clock = (this.clock || 0) + dt;
    { const L = v.accentLight; if (L) { const goal = this.beat && this.cinematic ? (L.userData.goal || 0) : 0; L.intensity += (goal - L.intensity) * Math.min(1, dt * 2); } }
    // cut dip (≈0.18 s down, 0.3 s up through a dark grade)
    const g = v.gfx && v.gfx.grade && v.gfx.grade.uniforms;
    // a cut never shows a freeze: while the frame dips to dark the camera glides on with the motion it had (decaying),
    // instead of stopping dead on the first frame of the dip (a zoom, a ride or a dolly ends when the cut is called)
    { const cam = v.camera; if (cam && dt > 0) {
      if (this.dip && !this.dip.done) { if (this._cv) { this._cv.multiplyScalar(Math.exp(-dt * 5)); cam.position.addScaledVector(this._cv, dt); } }
      else if (!this.dip) { const R = v.ds && v.ds.orb ? v.ds.orb.r : 10; if (this._cp) { const vel = (this._cv || (this._cv = V3())).subVectors(cam.position, this._cp).divideScalar(dt); if (vel.length() > R * 2.5) vel.set(0, 0, 0); }   /* a teleport (a cut) is not a motion */
        (this._cp || (this._cp = V3())).copy(cam.position); }
      else { this._cp = null; if (this._cv) this._cv.set(0, 0, 0); } } }
    if (this.dip) { const d = this.dip; d.t += dt; if (!d.done && d.t >= .18) { d.apply(); d.done = true; } const a = d.t < .18 ? d.t / .18 : Math.max(0, 1 - (d.t - .18) / .3); if (g) { if (d.t < dt * 1.5) { this._fc = g.uFadeColor.value.clone(); g.uFadeColor.value.setRGB(.02, .018, .015); } g.uFade.value = a; } if (d.t >= .48) { if (g) { g.uFade.value = 0; if (this._fc) g.uFadeColor.value.copy(this._fc); } this.dip = null; } }
    // a push: slow dolly, eased, then it simply holds
    if (this.move && this.hold <= 0) { const m = this.move; m.k = Math.min(1, m.k + dt / m.dur); const e = m.k * m.k * (3 - 2 * m.k); v.camera.position.lerpVectors(m.from, m.to, e);
      if (m.q0) { this._m4.lookAt(v.camera.position, m.t0, UP); this._qL.setFromRotationMatrix(this._m4); v.camera.quaternion.slerpQuaternions(m.q0, this._qL, e); } else v.camera.lookAt(m.t0);   // q0: turn from the previous heading over the move
      v.controls.enabled = false; if (m.k >= 1) { this.move = null; v.controls.enabled = v.stage === 'explore' && !v.pov; } }
    // the director's chip sits at the top of the FREE frame (not over the instruction panel or the readouts)
    if (this.chipEl && !this.chipEl.hidden && (this._chipLT == null || this.clock - this._chipLT > .25)) { this._chipLT = this.clock; const fr = this.freeFrame(w), lx = ((fr[0] + fr[1]) / 2).toFixed(0) + 'px', mw = Math.max(200, fr[1] - fr[0] - 16).toFixed(0) + 'px'; if (this.chipEl.style.left !== lx) this.chipEl.style.left = lx; if (this.chipEl.style.maxWidth !== mw) this.chipEl.style.maxWidth = mw; }
    // lens: ease the field of view toward the shot's focal length (or back to the base lens after the learner takes over)
    if (this.fovTo && Math.abs(v.camera.fov - this.fovTo) > .05 && !v.pov) { v.camera.fov += (this.fovTo - v.camera.fov) * Math.min(1, dt * 2.5); v.camera.updateProjectionMatrix(); }
    this.updateShots(dt);
    if (v.ds && v.ds.scene) { const om = !!(v.ops && v.ops.muteVectors()); if (om) v.ds.scene.userData.vecMute = true; else if (v.ds.scene.userData.vecMute && !(this.guides && this.beat && this.beat.flowEls)) v.ds.scene.userData.vecMute = false; }   // (a model's own vector arrows step aside while parts are apart or a lineup shows)
    const b = this.beat; if (!b) return;
    if (!b.paused) b.t += dt;
    if (b.kind === 'event' && this.cinematic && v.running != null) this.targetScale = Math.max(riding ? .6 : 0, this.queue.length ? .12 : .3);   // more waiting → slower, so text never lags far behind the process
    if (b.bar === undefined) b.bar = (b.el || b.capBar) ? (b.el || b.capBar).querySelector('.co-time i') : null; if (b.bar) b.bar.style.width = Math.min(100, b.t / b.dur * 100).toFixed(1) + '%';
    // anchor on screen
    const p = b.anchor && b.anchor(); let sx = w * .5, sy = h * .42, on = false;
    if (p) { const q = p.clone().project(cam); if (q.z < 1) { sx = (q.x * .5 + .5) * w; sy = (-q.y * .5 + .5) * h; on = sx > 6 && sx < w - 6 && sy > 6 && sy < h - 6; if (!on) { sx = clamp(sx, 6, w - 6); sy = clamp(sy, 6, h - 6); } } }   // anchor off screen (POV): no dot or leader line
    // callout placement: on the emptier side of the anchor, kept inside the safe frame and OFF the hard HUD (readouts, the
    // right-hand button column, the action bar, the POV bar, the inset, the chips); it changes side only when the other side
    // is much better for over 0.6 s, and then glides there (0.35 s) instead of teleporting
    const e = b.el; if (e) {
      const panel = v.panel && !v.panel.hidden ? (v.panel.classList.contains('folded') ? 74 : 380) : 24, phone = w < 760;   // (right of the folded panel's tab too)
      // layout is read at most every 0.25 s (callout size, pins, panels), never between this frame's writes
      if (!b.rects || b.t - (b.rectT || -1) > .25) {
        b.rectT = b.t; b.cw = e.offsetWidth || 300; b.ch = e.offsetHeight || 80; b.rects = [...(v.labels ? v.labels.querySelectorAll('.pin') : [])].filter(e => e.style.visibility !== 'hidden').map(e => e.getBoundingClientRect()).filter(r => r.width > 1); const hr = this.layer.getBoundingClientRect(); b.ox = hr.left; b.oy = hr.top;
        const R = P => { if (!P || P.hidden || !P.getBoundingClientRect || P.style.visibility === 'hidden') return null; const r = P.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(P).display === 'none') return null; return { x: r.left - b.ox - 8, y: r.top - b.oy - 8, w: r.width + 16, h: r.height + 16 }; };   // inflated by the 8 px HUD margin: closer than 8 px counts as an overlap
        const ins = v.inset && v.inset.box && !v.inset.box.hidden && +v.inset.box.style.opacity > .05 ? v.inset.box : null, cueChip = v.cues && v.cues.chip && !v.cues.chip.hidden && v.cues.chip.style.visibility !== 'hidden' ? v.cues.chip : null;
        b.hard = [v.readPanel, v.povBar, v.ui && v.ui.querySelector('.dio-actions'), document.querySelector('.sound-btn'), document.querySelector('.gfx-btn'), ins, this.chipEl, cueChip, v.ops && v.ops.lv && v.ops.lv.box].map(R).filter(Boolean);   /* (the level indicator of grammar.js)*/
        const ch0 = R(this.chipEl); b.chipR = ch0; b.titleR = R(v.titleEl); b.timeR = R(v.ui && v.ui.querySelector('.dio-time')); b.panR = v.panel && !v.panel.hidden ? R(v.panel) : null;
      }
      const cw = b.cw, ch = b.ch;
      // top limit: below the director's chip where the callout would sit under it; right limit: clear of the button column
      const topAt = x => b.chipR && x < b.chipR.x + b.chipR.w && x + cw > b.chipR.x ? Math.max(84, b.chipR.y + b.chipR.h) : 84;
      const bounds = y => [panel, y < 176 ? w - cw - 66 : w - cw - 24];
      const place = c => { let x = c[0] > 0 ? sx + c[0] : sx + c[0] - cw, y = c[1] < 0 ? sy + c[1] - ch : sy + c[1]; y = clamp(y, topAt(x), h - ch - 120); const [xa, xb] = bounds(y); x = clamp(x, xa, Math.max(xa, xb)); return [x, y]; };
      if (!b.avoid || b.t - (b.avoidT || -1) > .3) {
        b.avoidT = b.t; b.avoid = [];
        if (b.focus) { const bx = new THREE.Box3().setFromObject(b.focus); if (!bx.isEmpty()) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < 8; k++) { const q = V3(k & 1 ? bx.max.x : bx.min.x, k & 2 ? bx.max.y : bx.min.y, k & 4 ? bx.max.z : bx.min.z).project(cam); const qx = (q.x * .5 + .5) * w, qy = (-q.y * .5 + .5) * h; x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy); } b.avoid.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, k: 6 }); } }
        [v.readPanel, v.panel, v.titleEl, v.povBar, v.ticker, v.ui && v.ui.querySelector('.dio-actions'), document.querySelector('.sound-btn'), document.querySelector('.gfx-btn')].forEach(P => { if (P && !P.hidden && P.getBoundingClientRect && !(P === v.panel && P.classList.contains('folded'))) { const r = P.getBoundingClientRect(); if (r.width) b.avoid.push({ x: r.left - b.ox, y: r.top - b.oy, w: r.width, h: r.height, k: 8 }); } });
        (b.hard || []).forEach(A => b.avoid.push(Object.assign({ k: 8 }, A)));
        if (this.track && this.track.phase === 'ride') b.avoid.push({ x: w * .3, y: h * .25, w: w * .4, h: h * .5, k: 6 });   // during a ride the middle of the frame is the view itself: text goes to the side
      }
      const cost = ([x, y]) => { let o = on && x < sx + 14 && x + cw > sx - 14 && y < sy + 14 && y + ch > sy - 14 ? 4e5 : 0; /* never over its own anchor dot */ for (const A of b.avoid) { const ix = Math.max(0, Math.min(x + cw, A.x + A.w) - Math.max(x, A.x)), iy = Math.max(0, Math.min(y + ch, A.y + A.h) - Math.max(y, A.y)); o += ix * iy * A.k; } for (const r of b.rects) { const rx = r.left - b.ox, ry = r.top - b.oy, ix = Math.max(0, Math.min(x + cw, rx + r.width) - Math.max(x, rx)), iy = Math.max(0, Math.min(y + ch, ry + r.height) - Math.max(y, ry)); o += ix * iy * 3; } const ix = Math.max(0, Math.min(x + cw, sx + 12) - Math.max(x, sx - 12)), iy = Math.max(0, Math.min(y + ch, sy + 12) - Math.max(y, sy - 12)); return o + ix * iy * 50 + Math.hypot(x + cw / 2 - sx, y + ch / 2 - sy) * 2; };
      const C = [[110, -40], [-110, -40], [110, 40], [-110, 40], [0.01, -90]];
      const right0 = sx < w * .58; const first = b.side == null; if (first) b.side = right0 ? 0 : 1;
      // hysteresis: the side changes only when another is far better (less than half the cost, by a real margin) for 0.6 s
      { const cur = cost(place(C[b.side])); let best = b.side, bc = cur; C.forEach((c, i) => { const k = cost(place(c)); if (k < bc) { bc = k; best = i; } });
        if (first) b.side = best; else if (best !== b.side && bc < cur * .5 && cur - bc > 1500) { b.badT = (b.badT || 0) + dt; if (b.badT > .6) { b.side = best; b.badT = 0; if (b.rx != null) b.tw = { x0: b.rx, y0: b.ry, t: 0 }; } } else b.badT = 0; }
      let [x, y] = place(C[b.side]);
      if (phone) { const chp = e.offsetHeight || ch, tb = b.timeR ? b.timeR.y : h - 128; if (v.readPanel && !v.readPanel.classList.contains('under-sheet')) v.readPanel.classList.add('under-sheet');   /* the readouts step aside while the sheet is up (no room for both on a phone) */ x = 10; y = Math.max(84, tb - chp - 8); this._sheetH = chp; }   // phones: a bottom sheet just above the time bar (measured: it wraps to two rows), its height read fresh
      else {
        // hard obstacles: step out of each by the smallest move that stays inside the frame (two passes)
        for (let pass = 0; pass < 2; pass++) for (const A of b.hard || []) {
          if (!(x < A.x + A.w && x + cw > A.x && y < A.y + A.h && y + ch > A.y)) continue;
          const opts = [[A.x - cw - 8, y], [A.x + A.w + 8, y], [x, A.y - ch - 8], [x, A.y + A.h + 8]].filter(([px, py]) => { const [xa, xb] = bounds(py); return px >= xa - .5 && px <= xb + .5 && py >= topAt(px) - .5 && py <= h - ch - 16; });
          if (opts.length) { opts.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y)); [x, y] = opts[0]; }
        }
      }
      const offHard = yy => !(b.hard || []).some(A => x < A.x + A.w && x + cw > A.x && yy < A.y + A.h && yy + ch > A.y);   // the late steps below never move onto the HUD
      // still over its own anchor dot (clamped against the panel or the frame): step above or below the dot instead
      if (on && x < sx + 14 && x + cw > sx - 14 && y < sy + 24 && y + ch > sy - 24) { const ys = [sy + 24, sy - 24 - ch]   /* (24: the measured height may lag the text by a line) */.filter(yy => yy >= topAt(x) - .5 && yy <= h - ch - 16 && offHard(yy)); if (ys.length) y = ys.sort((p, q) => Math.abs(p - y) - Math.abs(q - y))[0]; }
      // still over an object's name: step just above or below that name (if that stays in the frame and off the dot)
      for (const r of b.rects || []) { const rx = r.left - b.ox, ry = r.top - b.oy; if (!(x < rx + r.width - 2 && x + cw > rx + 2 && y < ry + r.height - 2 && y + ch > ry + 2)) continue;
        const ys = [ry - ch - 8, ry + r.height + 8].filter(yy => yy >= topAt(x) - .5 && yy <= h - ch - 16 && offHard(yy) && !(on && x < sx + 14 && x + cw > sx - 14 && yy < sy + 24 && yy + ch > sy - 24)); if (ys.length) y = ys.sort((p, q) => Math.abs(p - y) - Math.abs(q - y))[0]; break; }
      // the glide after a change of side: from where it was drawn toward where it now belongs
      if (b.tw) { b.tw.t += dt; const k = Math.min(1, b.tw.t / .35), s = k * k * (3 - 2 * k); x = b.tw.x0 + (x - b.tw.x0) * s; y = b.tw.y0 + (y - b.tw.y0) * s; if (k >= 1) b.tw = null; }
      b.rx = x; b.ry = y; b.box = [x, y, cw, ch];   // the callout as drawn this frame (labels test themselves against it)
      const right = x > sx - cw / 2;
      e.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      // an anchor under the HUD (the title, the panel tab, the readouts, the buttons): no dot and no leader onto it
      const dotOn = on && ![...(b.hard || []), b.titleR, b.panR].some(A => A && sx > A.x - 9 && sx < A.x + A.w + 9 && sy > A.y - 9 && sy < A.y + A.h + 9);
      b.dot.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`; b.dot.style.opacity = dotOn ? 1 : 0;
      const ax = right ? x : x + cw, ay = y + ch * .6;
      b.line.setAttribute('d', dotOn ? `M${ax} ${ay} C ${(ax + sx) / 2} ${ay}, ${sx} ${(ay + sy) / 2}, ${sx} ${sy - 7}` : '');
      // guides (made when Guides is switched on mid-beat, hidden while it is off)
      if (this.guides && !b.guides) this.makeGuides(b);
      if (b.guides) {
        if (!this.guides) { if (!b.gOff) this.showGuides(b, false); }
        else { if (b.gOff) this.showGuides(b, true); this.drawGuides(b, cam, w, h, sx, sy, p); }
      }
    }
    if (b.t >= b.dur) this.endBeat();
  }
}
