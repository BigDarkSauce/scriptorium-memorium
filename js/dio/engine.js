// Interactive diorama runtime.
// Stages: sketch (the drawing) → materialise (camera dives in, the world turns real) → guided tour of the significant
// bodies (one per scroll step, names pinned beside them) → explore (foldable left panel: step-by-step instructions,
// variables, objects) with a full edit tool (select anything; move, hide, remove, replace, add, or ask AI to change it).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { DioramaScene, isSceneSpec } from './scene.js';
import { SHAPES } from './builder.js';
import { PRESETS } from '../gfx/materials.js';
import { Materializer, addInk, addOutlines } from '../gfx/materialize.js';
import { el, $, clamp, fmt, esc, ease, easeInOutQuint, toast, typeset, uid, confirmBox } from '../util.js';
import { askJSON, errCopy } from '../ai/claude.js';
import { editPrompt } from '../ai/prompts.js';
import { radialGlow } from '../gfx/textures.js';
import { renderSource } from '../room/reader.js';
import { evidenceTools } from '../ai/evidence.js';
import { Director } from './director.js';
import { DIO } from './models.js';
const PREFS_KEY = 'scriptorium.view';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { } };

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class DioramaView {
  constructor(app, spec, opts = {}) {
    this.app = app; this.gfx = app.gfx; this.spec = spec; this.opts = opts;
    this.ds = new DioramaScene(this.gfx, spec);
    this.camera = this.ds.camera; this.scene = this.ds.scene;
    this.stage = 'init'; this.tourI = -1; this.pins = new Map(); this.lessonI = 0; this.flashes = [];
    this.title = opts.title || spec.title || 'Diorama';
    this.ui = el('div', { class: 'dio-ui' }); app.ui.append(this.ui);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: 2, maxDistance: 60, maxPolarAngle: Math.PI * .49, enabled: false });
    this.prefs = loadPrefs(); this.undoStack = opts.undo || [];
    this.buildHUD();
    this.dir = new Director(this, this.ui);
    this.ds.listeners.event.push(ev => this.onEvent(ev));
    this.gfx.setView(this.scene, this.camera);
    this.onWheel = e => this.wheel(e); this.gfx.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.onKey = e => this.key(e); addEventListener('keydown', this.onKey);
    this.onPointerDown = e => { this.down = { x: e.clientX, y: e.clientY }; if (this.dir) this.dir.userGrab(); };
    this.onPointerUp = e => { if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) this.click(e); this.down = null; };
    this.gfx.canvas.addEventListener('pointerdown', this.onPointerDown); this.gfx.canvas.addEventListener('pointerup', this.onPointerUp);
    this.start();
  }
  // ---------------- stages ----------------
  start() {
    const ds = this.ds, technique = this.spec.technique || this.spec.style || (isSceneSpec(this.spec) ? 'card' : 'card');
    this.inkMat = addInk(ds.world, ds.U); addInk(ds.extras, ds.U); addOutlines(ds.world, ds.U, ds.radius * .0045); addOutlines(ds.extras, ds.U, ds.radius * .0045);
    this.mat = new Materializer({ scene: this.scene, camera: this.camera, world: ds.world, U: ds.U, technique, endKey: ds.overviewKey(), center: ds.center, radius: ds.radius, env: ds.env });
    this.mat.buildIn = !!this.opts.buildIn;
    if (this.opts.skipIntro) { this.mat.finish(); this.removeInk(); this.syncControls(); this.stage = 'explore'; this.showExplore(true); return; }
    this.mat.setProgress(0); this.stage = 'sketch'; ds.playing = false;
    this.showSketchCoach();
    if (this.opts.fromRect && this.opts.fromImg) this.flyFromScroll(); else if (this.opts.autoTransition) setTimeout(() => this.transition(), 600);
  }
  flyFromScroll() {
    const r = this.opts.fromRect, img = el('img', { class: 'fly-img', src: this.opts.fromImg, alt: '' });
    Object.assign(img.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.append(img);
    requestAnimationFrame(() => { img.classList.add('go'); Object.assign(img.style, { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px' }); });
    setTimeout(() => { img.classList.add('fade'); setTimeout(() => img.remove(), 900); if (this.opts.autoTransition !== false) setTimeout(() => this.transition(), 700); }, 1100);
  }
  showSketchCoach() {
    this.coach.innerHTML = '';
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: 'The drawing' }), el('div', { class: 'coach-text', text: this.title })]),
      el('button', { class: 'btn primary', text: 'Transition', onclick: () => this.transition() }));
    this.coach.hidden = false;
  }
  transition(duration = 6.5) {
    if (this.stage !== 'sketch') return; this.stage = 'materialize'; this.coach.innerHTML = '';
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: 'Materialising' }), el('div', { class: 'coach-text', text: this.title })]), el('button', { class: 'btn ghost', text: 'Skip', onclick: () => { this.tm = duration; } }));
    this.tm = 0; this.tmDur = duration; this.ds.playing = true; this.ds.speed = .6;
  }
  endMaterialize() {
    this.mat.finish(); this.removeInk(); this.ds.speed = 1; this.syncControls(); this.ds.computeBounds();
    this.stage = 'tour'; this.tourI = -1; this.next();
  }
  removeInk() { const rm = []; this.scene.traverse(o => { if (o.userData.isInk) rm.push(o); }); rm.forEach(o => o.removeFromParent()); }
  syncControls() { const k = this.ds.overviewKey(); this.controls.target.copy(k.target); this.camera.fov = k.fov; this.camera.position.copy(k.target).addScaledVector(k.dir, this.ds.orb.r); this.camera.near = .1; this.camera.far = 500; this.camera.updateProjectionMatrix(); this.controls.update(); this.controls.enabled = true; this.baseFov = k.fov; }
  // ---------- guided tour: one significant body per step ----------
  next() {
    const A = this.ds.actors;
    if (this.stage !== 'tour') return;
    if (this.tourI + 1 >= A.length) { this.finishTour(); return; }
    this.tourI++; const a = A[this.tourI];
    const p = a.getPos() || this.ds.center; const r = a.obj ? Math.max(.4, new THREE.Box3().setFromObject(a.obj).getSize(V3()).length() * .5) : .8;
    this.flyTo(p, clamp(r * 4.2, 2.6, 10));
    this.ensurePin(a, true);
    this.renderTourCoach();
  }
  prev() { if (this.stage !== 'tour' || this.tourI <= 0) return; this.tourI -= 2; this.next(); }
  renderTourCoach() {
    const A = this.ds.actors, a = A[this.tourI]; this.coach.innerHTML = '';
    const dots = el('div', { class: 'coach-dots' }, A.map((_, i) => el('i', { class: i < this.tourI ? 'seen' : i === this.tourI ? 'now' : '' })));
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: `Body ${this.tourI + 1} of ${A.length}` }), el('div', { class: 'coach-text', text: a.name }), a.describe ? el('div', { class: 'coach-sub', text: a.describe }) : null, dots]),
      el('button', { class: 'ibtn', title: 'Previous (↑)', 'aria-label': 'Previous body', text: '‹', onclick: () => this.prev() }),
      el('button', { class: 'ibtn', title: 'Next (scroll down or ↓)', 'aria-label': 'Next body', text: '›', onclick: () => this.next() }),
      el('button', { class: 'btn ghost small', text: 'Skip', onclick: () => { while (this.stage === 'tour') { this.tourI = this.ds.actors.length; this.finishTour(); } } }));
  }
  finishTour() {
    if (this.stage !== 'tour') return; this.stage = 'explore';
    this.ds.actors.forEach(a => this.ensurePin(a, false));
    const k = this.ds.overviewKey(); this.flyTo(k.target, this.ds.orb.r * .95);
    this.coach.innerHTML = ''; this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: 'All bodies introduced' }), el('div', { class: 'coach-text', text: 'Instructions are now on the left' })]));
    setTimeout(() => { if (this.stage === 'explore') this.coach.hidden = true; }, 3200);
    this.showExplore();
  }
  flyTo(target, dist, dur = 1.7, swingDeg = 0) {
    const c = this.camera, from = { p: c.position.clone(), t: this.controls.target.clone() };
    const dir = c.position.clone().sub(this.controls.target).normalize().lerp(V3(.55, .5, .7).normalize(), .35).normalize();
    if (swingDeg) dir.applyAxisAngle(V3(0, 1, 0), (Math.random() < .5 ? -1 : 1) * swingDeg * Math.PI / 180);
    if (dir.y < .2) { dir.y = .3; dir.normalize(); }
    const to = { t: target.clone(), p: target.clone().addScaledVector(dir, dist) };
    this.fly = { from, to, k: 0, dur, lift: Math.min(2, from.p.distanceTo(to.p) * .15) }; this.controls.enabled = false;
  }
  ensurePin(a, focus) {
    let pin = this.pins.get(a.name);
    if (!pin) { pin = el('div', { class: 'pin' }, [el('span', { class: 'pin-dot' }), el('span', { class: 'pin-name', text: a.name })]); this.labels.append(pin); this.pins.set(a.name, pin); requestAnimationFrame(() => pin.classList.add('in')); }
    this.pins.forEach(p => p.classList.remove('focus')); if (focus) pin.classList.add('focus');
    pin._actor = a; if (this._hot && this._hot.length) pin.classList.toggle('hot', this._hot.some(h => h.name === a.name));
  }
  // ---------- explore: foldable left panel with step-by-step instructions ----------
  showExplore(immediate) {
    this.panel.hidden = false; requestAnimationFrame(() => this.panel.classList.add('in'));
    this.renderLessons(); this.renderParams(); this.renderObjects();
    this.ds.symbols && this.ds.symbols.forEach(s => { const p = el('div', { class: 'pin sym in', text: s.text }); p._sym = s; this.labels.append(p); });
    if (immediate) this.ds.actors.forEach(a => this.ensurePin(a, false));
    this.ds.playing = true; this.syncTimeUI();
  }
  lessons() {
    if (Array.isArray(this.spec.lessons) && this.spec.lessons.length) return this.spec.lessons;
    { const D = DIO[this.spec.type]; if (D && Array.isArray(D.lessons) && D.lessons.length) return D.lessons; }   // a model's own authored lessons
    if (this._auto) return this._auto;
    const ks = Object.keys(this.ds.ranges).filter(k => !(this.spec.hidden || []).includes(k)).slice(0, 3), A = this.ds.actors;
    const L = [{ title: 'Watch it run', text: `Let the model run and follow ${A.length ? A.map(a => a.name).slice(0, 3).join(', ') : 'the bodies'}. Each event the bodies cause is logged at the bottom right.`, run: 8 }];
    ks.forEach(k => { const r = this.ds.ranges[k], lo = r[0] + (r[1] - r[0]) * .2, hi = r[0] + (r[1] - r[0]) * .8, cur = this.ds.p[k], to = Math.abs(cur - hi) > Math.abs(cur - lo) ? hi : lo; L.push({ title: `Change ${r[4] || k}`, text: `Set ${r[4] || k} to ${fmt(to)}${r[3] ? ' ' + r[3] : ''} and compare the readouts and events with the previous run.`, set: { [k]: to }, run: 7 }); });
    return (this._auto = L);
  }
  renderLessons() {
    const L = this.lessons(), box = this.lessonBox; box.innerHTML = '';
    L.forEach((l, i) => {
      if (i > this.lessonI) return;
      const done = i < this.lessonI, card = el('div', { class: 'lesson' + (done ? ' done' : ' current') }, [
        el('div', { class: 'lesson-head' }, [el('span', { class: 'lesson-n', text: done ? '✓' : String(i + 1) }), el('b', { html: esc(l.title || 'Step ' + (i + 1)) })]),
        l.question ? el('div', { class: 'lesson-q', html: '<b>Q</b> ' + esc(l.question) }) : null,
        el('div', { class: 'lesson-text', html: esc(l.text || '') }),
        done && l.explain ? el('div', { class: 'lesson-explain', html: esc(l.explain) }) : null,
        done && l.opens ? el('div', { class: 'lesson-opens', html: '→ ' + esc(l.opens) }) : null,
        !done ? el('div', { class: 'lesson-run' }, [el('button', { class: 'btn primary small', text: this.running === i ? 'Running…' : 'Play this step', onclick: () => this.runLesson(i) }), el('div', { class: 'lesson-bar' }, [el('i')])]) : el('button', { class: 'btn ghost small', text: 'Replay', onclick: () => this.runLesson(i, true) })]);
      box.append(card); if (!done) requestAnimationFrame(() => card.classList.add('in'));
    });
    if (this.lessonI >= L.length) box.append(el('div', { class: 'lesson-all', text: 'All instructions complete. Change any variable or object and explore freely.' }));
    typeset(box);
  }
  runLesson(i, replay) {
    const l = this.lessons()[i]; if (!l) return;
    if (l.reset !== false && i === this.lessonI) { /* keep state continuous */ }
    if (l.set) { for (const k in l.set) this.setParam(k, +l.set[k], true); this.renderParams(); }
    const fa = l.focus ? this.ds.actors.find(a => a.id === l.focus || a.name === l.focus || a.name.toLowerCase().includes(String(l.focus).toLowerCase())) : null;
    this.lessonActor = fa; this.awaitIdle = false; this.dir.clear();   // starting a step is the reader's choice: what was showing gives way, and the new instruction is read before anything moves
    const host = fa || this.namesIn(l.text)[0];
    this.dir.clearCaption();
    // cinematic: the instruction is read first (the model waits), then the step plays; without a subject it shows as a caption
    const flows = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, lt = String(l.text || '').toLowerCase(), fk = Object.keys(flows).find(k => lt.includes(k));
    const povA = l.pov ? this.ds.actors.find(a => a.name === l.pov || a.name.toLowerCase().includes(String(l.pov).toLowerCase())) : null;
    if (this.pov && this.pov.auto) this.exitPOV();
    if (this.dir.cinematic) { if (!this.panel.classList.contains('folded')) { this.panel.classList.add('folded'); this._autoFold = true; } this.readFocus = ((l.title || '') + ' ' + (l.text || '') + ' ' + (l.explain || '')).toLowerCase(); this.readPanel.classList.add('compact'); }
    if (this.dir.cinematic) this.dir.push({ kind: 'lesson', shot: l.shot || (povA ? 'pov' : undefined), caption: !host && !povA, title: l.title || 'Step ' + (i + 1), text: l.text || '', anchor: host ? () => host.getPos() : null, focus: host && host.obj, host: povA || host, names: this.namesIn(l.text, host), flows: fk ? flows[fk] : null });
    else if (fa) this.flyTo(fa.getPos() || this.ds.center, 6);
    this.ds.playing = true; this.syncTimeUI();
    const until = String(l.until || ''); this.running = i; this.runT = 0; this.runDur = +l.run || (until ? 30 : 6); this.runUntil = until.startsWith('event:') ? until.slice(6).toLowerCase() : null; this.runReplay = !!replay;
    const bar = this.lessonBox.querySelectorAll('.lesson')[i]; this.runBar = bar && bar.querySelector('.lesson-bar i');
    const b = bar && bar.querySelector('.lesson-run .btn'); if (b) { b.textContent = 'Running…'; b.disabled = true; }
  }
  completeLesson() {
    const i = this.running; this.running = null; this.awaitIdle = false; this.dir.clearCaption(); if (this.pov && this.pov.auto) this.exitPOV();
    if (this._autoFold) { this.panel.classList.remove('folded'); this._autoFold = false; } this.readFocus = null; this.readPanel.classList.remove('compact');
    const l = this.lessons()[i]; const fa = this.lessonActor;
    if (l && l.explain && this.dir.cinematic) { const F = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, et = l.explain.toLowerCase(), k = Object.keys(F).find(q => et.includes(q)); this.dir.push({ kind: 'explain', caption: !fa, title: 'Why', text: l.explain, anchor: fa ? () => fa.getPos() : null, focus: fa && fa.obj, host: fa, names: this.namesIn(l.explain, fa), flows: k ? F[k] : null }); }
    if (!this.runReplay && i === this.lessonI) { this.lessonI++; toast('Step complete'); if (this.opts.onProgress) this.opts.onProgress(this.lessonI); }
    this.renderLessons();
  }
  renderParams() {
    const box = this.paramBox; box.innerHTML = '';
    for (const k in this.ds.ranges) {
      if ((this.spec.hidden || []).includes(k)) continue;
      const [a, b, , unit, name] = this.ds.ranges[k], v = this.ds.p[k];
      const out = el('b', { text: fmt(v) + (unit ? ' ' + unit : '') });
      const inp = el('input', { type: 'range', min: a, max: b, step: (b - a) / 300, value: v, id: 'dp-' + k, 'aria-label': name || k });
      inp.onpointerdown = inp.onkeydown = () => { if (inp._from == null) inp._from = this.ds.p[k]; };
      inp.oninput = () => { if (inp._from == null) inp._from = this.ds.p[k]; out.textContent = fmt(+inp.value) + (unit ? ' ' + unit : ''); this.setParam(k, +inp.value); };
      inp.onchange = () => { if (inp._from != null && inp._from !== this.ds.p[k]) this.pushUndo({ kind: 'param', k, v: inp._from, label: name || k }); inp._from = null; inp.blur(); };
      box.append(el('label', { class: 'ctrl' }, [el('span', {}, [el('span', { text: name || k }), out]), inp]));
    }
    if (!box.children.length) box.append(el('p', { class: 'dim small', text: 'No variables. Use Edit → Ask AI to add some.' }));
  }
  setParam(k, v, quiet) {
    const ds = this.ds; if (!(k in ds.p)) return; ds.p[k] = clamp(v, ds.ranges[k][0], ds.ranges[k][1]);
    const live = ds.sim && ds.sim.live && ds.sim.live(k);
    const rebuild = !isSceneSpec(this.spec) ? !live : !!(this.spec.params || []).find(q => q.key === k && q.rebuild);
    if (rebuild) { ds.build(); this.refreshPins(); }
    this.spec.values = Object.assign(this.spec.values || {}, { [k]: ds.p[k] });
  }
  // ---------- point of view: the learner's eye rides an actor (a bob, a bubble, a molecule) ----------
  // The camera sits at the actor, looks where it is going (or at what the current step is about), and the
  // learner can still look around by dragging. Small actors are hidden so you see from them, not their inside;
  // large ones (a flask, a cell) stay visible so you are inside them.
  setPOV(a, opts = {}) {
    if (!a) return this.exitPOV();
    const c = this.camera;
    if (!this.pov) this.povPrev = { p: c.position.clone(), t: this.controls.target.clone(), fov: c.fov, near: c.near };
    else this.exitPOV(true);
    let size = .3, center = null; if (a.obj) { const bx = new THREE.Box3().setFromObject(a.obj); if (!bx.isEmpty()) { size = bx.getSize(V3()).length() * .5; center = bx.getCenter(V3()); } }
    const R = this.ds.orb ? this.ds.orb.r : 10, hide = a.obj && size < R * .08;
    if (hide) a.obj.traverse(o => { if (o.isMesh) { o.userData._povVis = o.visible; o.visible = false; } });
    this.pov = { a, size, hide, yaw: 0, pitch: 0, look: null, last: null, auto: !!opts.auto, off: center && a.getPos() ? center.clone().sub(a.getPos()) : V3() };
    this.dir && (this.dir.move = null); this.fly = null; this.controls.enabled = false;
    c.near = Math.max(.003, size * .03); c.fov = 74; c.updateProjectionMatrix();
    const cv = this.gfx.renderer.domElement;
    this._povDown = e => { if (this.pov) this.pov.drag = { x: e.clientX, y: e.clientY, yaw: this.pov.yaw, pitch: this.pov.pitch }; };
    this._povMove = e => { const P = this.pov; if (!P || !P.drag || !(e.buttons & 1)) return; P.yaw = P.drag.yaw - (e.clientX - P.drag.x) * .005; P.pitch = clamp(P.drag.pitch - (e.clientY - P.drag.y) * .005, -1.2, 1.2); };
    this._povUp = () => { if (this.pov) this.pov.drag = null; };
    cv.addEventListener('pointerdown', this._povDown); addEventListener('pointermove', this._povMove); addEventListener('pointerup', this._povUp);
    if (!this.povBar) { this.povBar = el('div', { class: 'pov-bar glass' }); this.ui.append(this.povBar); }
    const others = this.ds.actors, i = others.indexOf(a);
    this.povBar.innerHTML = ''; this.povBar.hidden = false;
    this.povBar.append(el('button', { class: 'ibtn', 'aria-label': 'Previous object', text: '‹', onclick: () => this.setPOV(others[(i - 1 + others.length) % others.length]) }),
      el('span', { html: `Seeing as <b>${esc(a.name.split(' · ')[0])}</b> · drag to look · Esc to leave` }),
      el('button', { class: 'ibtn', 'aria-label': 'Next object', text: '›', onclick: () => this.setPOV(others[(i + 1) % others.length]) }),
      el('button', { class: 'btn small', text: 'Leave', onclick: () => this.exitPOV() }));
    this.app.sfx && this.app.sfx.play && this.app.sfx.play('whoosh');
  }
  exitPOV(keepCam) {
    const P = this.pov; if (!P) return; this.pov = null;
    if (P.hide && P.a.obj) P.a.obj.traverse(o => { if (o.isMesh && o.userData._povVis !== undefined) { o.visible = o.userData._povVis; delete o.userData._povVis; } });
    const cv = this.gfx.renderer.domElement; cv.removeEventListener('pointerdown', this._povDown); removeEventListener('pointermove', this._povMove); removeEventListener('pointerup', this._povUp);
    if (keepCam) return;
    const c = this.camera, q = this.povPrev; if (q) { c.position.copy(q.p); this.controls.target.copy(q.t); c.fov = q.fov; c.near = q.near; c.updateProjectionMatrix(); c.lookAt(q.t); }
    this.controls.enabled = true; if (this.povBar) this.povBar.hidden = true;
  }
  updatePOV(dt) {
    const P = this.pov, c = this.camera, p0 = P.a.getPos(); if (!p0) return;
    const p = p0.clone().add(P.off).addScaledVector(V3(0, 1, 0), P.size * .25);
    // where to look: along the actor's motion when it moves, else at what the current step is about, else at the model's centre
    if (P.last) { const vel = p.clone().sub(P.last).divideScalar(Math.max(dt, 1e-3)); if (vel.length() > P.size * .4) P.look = (P.look || vel.clone()).lerp(vel.normalize(), Math.min(1, dt * 3)).normalize(); }
    P.last = p.clone();
    let fwd = P.look ? P.look.clone() : null;
    if (!fwd) { const b = this.dir.beat, q = b && b.anchor && b.host !== P.a ? b.anchor() : null; fwd = (q || this.ds.center.clone()).sub(p); if (!q) fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize(); if (!q) fwd.y = -.18; fwd.normalize(); }
    const yawQ = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), P.yaw); fwd.applyQuaternion(yawQ);
    const side = V3().crossVectors(fwd, V3(0, 1, 0)).normalize(); fwd.applyAxisAngle(side, P.pitch);
    c.position.lerp(p, Math.min(1, dt * 8)); c.lookAt(c.position.clone().add(fwd));
  }
  highlightPins(actors) { this._hot = actors; const on = actors && actors.length; this.labels.classList.toggle('dir-focus', !!on); this.pins.forEach(p => p.classList.toggle('hot', !!on && actors.includes(p._actor))); }
  refreshPins() { this.pins.forEach(p => p.remove()); this.pins.clear(); this.labels.querySelectorAll('.sym').forEach(p => p.remove()); this.ds.actors.forEach(a => this.ensurePin(a, false)); this.ds.symbols && this.ds.symbols.forEach(s => { const p = el('div', { class: 'pin sym in', text: s.text }); p._sym = s; this.labels.append(p); }); this.renderObjects(); }
  // ---------- HUD ----------
  buildHUD() {
    const u = this.ui;
    this.labels = el('div', { class: 'pins' }); u.append(this.labels);
    this.titleEl = el('div', { class: 'dio-brand' }, [el('div', { class: 'dio-title', text: this.title }), this.opts.subtitle ? el('div', { class: 'dio-sub', text: this.opts.subtitle }) : null]); u.append(this.titleEl);
    this.topBar = u.querySelector('.dio-actions');
    this.editBtn = el('button', { class: 'ibtn', title: 'Edit: select any object (E)', 'aria-label': 'Edit objects', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>', onclick: () => this.toggleEdit() });
    u.append(el('div', { class: 'dio-actions glass' }, [this.editBtn,
      el('button', { class: 'ibtn', title: 'Replay the drawing → real transition', 'aria-label': 'Replay transition', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h16v14H4z M4 15l5-4 4 3 3-2 4 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', onclick: () => this.replay() }),
      el('button', { class: 'ibtn', title: 'Restart the simulation', 'aria-label': 'Restart', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12a7 7 0 1 0 2-5M5 4v4h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>', onclick: () => { this.ds.build(); this.refreshPins(); } }),
      el('button', { class: 'ibtn', title: 'Leave the diorama (Esc)', 'aria-label': 'Close diorama', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.7"/></svg>', onclick: () => this.exit() })]));
    this.coach = el('div', { class: 'coach glass', hidden: true }); u.append(this.coach);
    // left panel
    this.lessonBox = el('div', { class: 'lessons' }); this.paramBox = el('div', { class: 'params' }); this.objBox = el('div', { class: 'objects' });
    const tabs = el('div', { class: 'tabs' }), sections = { Instructions: this.lessonBox, Variables: this.paramBox, Objects: this.objBox };
    const srcs = Array.isArray(this.spec.sources) ? this.spec.sources.filter(x => x && (x.title || x.doi)) : [];
    if (srcs.length) sections.Sources = el('div', { class: 'dio-sources' }, [el('p', { class: 'dim small', text: 'The laws and values this diorama is built on:' }), el('ol', {}, srcs.map(x => el('li', {}, [renderSource(x)])))]);
    Object.keys(sections).forEach((n, i) => { const b = el('button', { class: 'tab', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', text: n, onclick: () => { tabs.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); Object.values(sections).forEach(s => s.hidden = true); sections[n].hidden = false; } }); tabs.append(b); if (i) sections[n].hidden = true; });
    this.fold = el('button', { class: 'ibtn fold', title: 'Fold the panel', 'aria-label': 'Fold panel', text: '‹', onclick: () => { this.panel.classList.toggle('folded'); this.fold.textContent = this.panel.classList.contains('folded') ? '›' : '‹'; } });
    this.panel = el('aside', { class: 'dio-panel glass', hidden: true }, [el('div', { class: 'panel-head' }, [tabs, this.fold]), el('div', { class: 'panel-body' }, Object.values(sections))]);
    u.append(this.panel);
    // time + readouts
    this.playBtn = el('button', { class: 'ibtn', 'aria-label': 'Play or pause', onclick: () => { this.ds.playing = !this.ds.playing; this.syncTimeUI(); } });
    this.speedSel = el('select', { class: 'mini', 'aria-label': 'Speed' }, ['0.25', '0.5', '1', '2', '4'].map(v => el('option', { value: v, text: v + '×', selected: v === '1' })));
    this.speedSel.onchange = () => this.ds.speed = +this.speedSel.value;
    this.clock = el('span', { class: 'clock', text: '0.0 s' });
    const tog = (key, label, title, def) => { const on = () => (this.prefs[key] ?? def); const b = el('button', { class: 'tog', title, 'data-pref': key, 'aria-pressed': String(on()), text: label, onclick: () => { this.setPref(key, !on()); b.setAttribute('aria-pressed', String(on())); } }); return b; };
    this.paceSel = el('select', { class: 'mini', 'aria-label': 'Reading pace', title: 'How long explanations stay on screen' }, [['slow', 'Read slowly'], ['normal', 'Read normally'], ['fast', 'Read fast']].map(([v, t]) => el('option', { value: v, text: t, selected: (this.prefs.pace || 'normal') === v })));
    this.paceSel.onchange = () => this.setPref('pace', this.paceSel.value);
    u.append(el('div', { class: 'dio-time glass' }, [this.playBtn, this.clock, this.speedSel, el('span', { class: 'sep' }), tog('cinematic', 'Cinematic', 'Camera follows each step and event; explanations appear beside what they describe, and time slows while you read', true), tog('guides', 'Guides', 'Show arrows for motion and links between the objects an explanation names', false), this.paceSel]));
    this.reads = el('div', { class: 'reads' }); this.spark = el('canvas', { class: 'spark', width: 440, height: 110 }); this.evlog = el('ul', { class: 'evlog' });
    // readouts stay small by default (six values) so they don't cover the model; one click shows all of them
    this.readMore = el('button', { class: 'reads-more', onclick: () => { this.prefs.readsAll = !this.prefs.readsAll; savePrefs(this.prefs); this._rt = 0; } });
    this.readPanel = el('div', { class: 'dio-reads glass' }, [this.reads, this.readMore, this.spark, this.evlog]); u.append(this.readPanel);
    this.ticker = el('div', { class: 'ticker' }); u.append(this.ticker);
    this.editBar = el('div', { class: 'edit-bar glass', hidden: true }); u.append(this.editBar);
    this.syncTimeUI();
  }
  // actors whose names appear in a sentence (for links and framing)
  namesIn(text, except) { const t = String(text || '').toLowerCase(); return this.ds.actors.filter(a => a !== except && a.name && a.name.length > 2 && t.includes(a.name.toLowerCase().split(' · ')[0])); }
  setPref(k, v) { this.prefs[k] = v; savePrefs(this.prefs); this.ui && this.ui.querySelectorAll(`[data-pref="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(!!v))); if (this.dir) { if (k === 'cinematic') { this.dir.cinematic = v; if (!v) this.dir.clear(); } if (k === 'guides') this.dir.guides = v; if (k === 'pace') this.dir.pace = v; } }
  // the model's own clock when it has one (e.g. "11:00 · day 1"), else simulated seconds
  clockText(t) { const s = this.ds.sim; if (s && s.clock) { try { const c = s.clock(t); if (c) return String(c); } catch (e) { } } return 't=' + (t ?? this.ds.t).toFixed(1) + ' s'; }
  syncTimeUI() { this.playBtn.innerHTML = this.ds.playing ? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>'; }
  onEvent(ev) {
    if (this.stage === 'sketch') return;
    const now = performance.now(); this._seen = this._seen || new Map(); if (now - (this._seen.get(ev.text) || -1e9) < 4000) return; this._seen.set(ev.text, now);
    const named = this.namesIn(ev.text), host = named[0] || this.lessonActor;
    // during a step, events about objects the step doesn't mention don't take the camera (they go to the ticker)
    const L = this.running != null ? this.lessons()[this.running] : null, lt0 = L ? ((L.title || '') + ' ' + (L.text || '')).toLowerCase() : '';
    const offTopic = L && host && host !== this.lessonActor && !lt0.includes(host.name.split(' · ')[0].toLowerCase());
    if (this.dir.cinematic && this.stage === 'explore' && !offTopic) {
      // a model may name the best shot for an event (DIO.<type>.shots: lowercase text substring → {target, dist})
      const shots = (DIO[this.spec.type] && DIO[this.spec.type].shots) || this.spec.shots || {}, lt = ev.text.toLowerCase();
      const key = Object.keys(shots).find(k => lt.includes(k)), shot = key && shots[key];
      const flows = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, fk = Object.keys(flows).find(k => lt.includes(k));
      const tg = shot && shot.target, pos0 = tg ? (typeof tg === 'function' ? tg() : tg) : null, pos = pos0 ? (pos0.isVector3 ? pos0.clone() : new THREE.Vector3().fromArray(pos0)) : ev.pos ? ev.pos.clone() : null;
      this.dir.push({ kind: 'event', text: ev.text, anchor: () => pos || (host ? host.getPos() : null), focus: host && host.obj, names: named.filter(a => a !== host), host, dist: shot && shot.dist, flows: fk ? flows[fk] : null });
    } else { const d = el('div', { text: ev.text }); this.ticker.append(d); setTimeout(() => d.remove(), this.dir.readTime(ev.text) * 1000); while (this.ticker.children.length > 2) this.ticker.firstChild.remove(); }
    // sound, placed left/right where the event happens
    if (this.app.sfx && this.stage === 'explore') { let sx = .5; if (ev.pos) { const q = ev.pos.clone().project(this.camera); sx = q.x * .5 + .5; } if (ev.sound) this.app.sfx.play(ev.sound, { x: sx }); else this.app.sfx.forEvent(ev.text, sx); }
    this.evlog.prepend(el('li', { text: this.clockText(ev.t) + ' · ' + ev.text })); while (this.evlog.children.length > 40) this.evlog.lastChild.remove();
    if (ev.pos && !this.spec.noMarkers) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('255,200,120'), color: ev.color || 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.copy(ev.pos); s.scale.setScalar(.3); this.scene.add(s); this.flashes.push({ s, a: 0 }); }
    if (this.running != null && this.runUntil && (ev.id && ev.id.toLowerCase() === this.runUntil || ev.text.toLowerCase().includes(this.runUntil))) { if (this.dir.cinematic) this.awaitIdle = true; else this.runT = this.runDur; }
  }
  // ---------- input ----------
  wheel(e) {
    if (this.stage === 'tour') { e.preventDefault(); const now = performance.now(); if (now - (this.lastWheel || 0) < 650) return; this.lastWheel = now; if (e.deltaY > 0) this.next(); else this.prev(); }
    else if (this.stage === 'sketch' && e.deltaY > 0) { e.preventDefault(); this.transition(); }
  }
  key(e) {
    const typing = e.target.closest && e.target.closest('textarea,input:not([type=range]):not([type=checkbox]),[contenteditable]');
    if (!typing && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); this.undo(); return; }
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (this.stage === 'tour' && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ')) { e.preventDefault(); this.next(); }
    else if (this.stage === 'tour' && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); this.prev(); }
    else if (e.key === 'Escape') { if (this.pov) this.exitPOV(); else if (this.sel) this.deselect(); else this.exit(); }
    else if ((e.key === 'p' || e.key === 'P') && this.stage === 'explore' && !this.editing) { const A = this.ds.actors; if (A.length) this.setPOV(A[(A.indexOf(this.pov && this.pov.a) + 1) % A.length]); }
    else if (e.key === 'e' || e.key === 'E') this.toggleEdit();
    else if (this.sel && this.tc) { if (e.key === 'g') this.tc.setMode('translate'); if (e.key === 'r') this.tc.setMode('rotate'); if (e.key === 's') this.tc.setMode('scale'); if (e.key === 'Delete') this.editAction('remove'); if (e.key === 'h') this.editAction('hide'); }
  }
  click(e) {
    const r = this.gfx.canvas.getBoundingClientRect(), m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(m, this.camera);
    if (this.editing) {
      if (this.tcDragging) return;
      const hits = rc.intersectObjects([this.ds.world, this.ds.extras], true).filter(h => !h.object.userData.isInk && h.object.visible);
      if (!hits.length) { this.deselect(); return; }
      this.select(this.rootOf(hits[0].object));
    } else if (this.ds.hooks.click) this.ds.hooks.click(rc); else if (this.ds.sim && this.ds.sim.click) this.ds.sim.click(rc);
  }
  rootOf(o) { while (o.parent && o.parent !== this.ds.world && o.parent !== this.ds.extras) o = o.parent; return o; }
  // ---------- edit tool ----------
  toggleEdit(on = !this.editing) {
    this.editing = on; this.editBtn.classList.toggle('on', on); this.gfx.canvas.classList.toggle('editing', on);
    if (!on) this.deselect(); else toast('Edit mode: click any object. G move · R rotate · S scale · H hide · Del remove');
    if (on && this.panel.hidden === false) { this.panel.querySelectorAll('.tab')[2].click(); }
  }
  nameOf(o) { return o.userData.label || o.name || (o.children[0] && o.children[0].geometry && o.children[0].geometry.type.replace('Geometry', '')) || (o.geometry ? o.geometry.type.replace('Geometry', '') : o.type); }
  select(o) {
    this.sel = o; this.gfx.outline.enabled = true; this.gfx.outline.selectedObjects = [o];
    if (!this.tc) {
      this.tc = new TransformControls(this.camera, this.gfx.canvas); this.tcHelper = this.tc.getHelper(); this.scene.add(this.tcHelper);
      this.tc.addEventListener('dragging-changed', ev => { this.controls.enabled = !ev.value && !this.fly; this.tcDragging = ev.value; if (ev.value && this.sel) this.pushUndo({ kind: 'transform', o: this.sel, path: this.ds.pathOf(this.sel), p: this.sel.position.clone(), r: this.sel.rotation.clone(), s: this.sel.scale.clone() }); if (!ev.value) this.commitTransform(); });
    }
    this.selBase = o.position.clone().sub(this.offsetOf(o));
    this.tc.attach(o); this.tc.setMode('translate');
    this.renderEditBar(); this.renderObjects();
  }
  deselect() { this.sel = null; this.gfx.outline.selectedObjects = []; this.gfx.outline.enabled = false; if (this.tc) this.tc.detach(); this.editBar.hidden = true; this.renderObjects(); }
  offsetOf(o) { const ov = (this.spec.overrides || {})[this.ds.pathOf(o)]; return ov && ov.offset ? V3(...ov.offset) : V3(); }
  overrideOf(o) { this.spec.overrides = this.spec.overrides || {}; const p = this.ds.pathOf(o); return (this.spec.overrides[p] = this.spec.overrides[p] || {}); }
  bodySpecOf(o) { if (o.userData.bodyId && isSceneSpec(this.spec)) return (this.spec.bodies || []).find(b => b.id === o.userData.bodyId); if (o.userData.added) return (this.spec.additions || [])[this.ds.extras.children.indexOf(o)]; return null; }
  commitTransform() {
    const o = this.sel; if (!o) return; const b = this.bodySpecOf(o), R2D = 180 / Math.PI;
    if (b) { b.position = o.position.toArray().map(v => +v.toFixed(3)); b.rotation = [o.rotation.x, o.rotation.y, o.rotation.z].map(v => +(v * R2D).toFixed(2)); b.scale = o.scale.toArray().map(v => +v.toFixed(3)); }
    else { const ov = this.overrideOf(o); ov.offset = o.position.clone().sub(this.selBase).toArray().map(v => +v.toFixed(3)); ov.rotation = [o.rotation.x, o.rotation.y, o.rotation.z].map(v => +(v * R2D).toFixed(2)); ov.scale = o.scale.toArray().map(v => +v.toFixed(3)); const it = (this.ds.ovList || []).find(x => x.o === o); if (it) { it.off = V3(...ov.offset); it.applied = o.position.clone(); } else this.ds.ovList.push({ o, e: ov, off: V3(...ov.offset), applied: o.position.clone() }); }
    this.save();
  }
  renderEditBar() {
    const o = this.sel; if (!o) return; const bar = this.editBar; bar.innerHTML = ''; bar.hidden = false;
    const B = (t, f, cls = '') => el('button', { class: 'btn small ' + cls, text: t, onclick: f });
    bar.append(el('div', { class: 'edit-name' }, [el('b', { text: this.nameOf(o) }), el('span', { class: 'dim small', text: o.userData.role === 'actor' ? ' · simulation body' : ' · scenic object' })]),
      el('div', { class: 'row wrap' }, [B('Move', () => this.tc.setMode('translate')), B('Rotate', () => this.tc.setMode('rotate')), B('Scale', () => this.tc.setMode('scale')),
        B(o.userData.hiddenByUser ? 'Show' : 'Hide', () => this.editAction('hide')), B('Replace…', () => this.replaceDialog()), B('Remove', () => this.editAction('remove'), 'danger'),
        B('Ask AI to change…', () => this.askAI(o), 'primary'), B('Done', () => this.deselect(), 'ghost')]));
  }
  // ---------- undo (Ctrl+Z) ----------
  pushUndo(entry) { this.undoStack.push(entry); if (this.undoStack.length > 60) this.undoStack.shift(); }
  snapshot(label) { this.pushUndo({ kind: 'spec', label, json: JSON.stringify(this.spec) }); }
  undo() {
    const u = this.undoStack.pop(); if (!u) { toast('Nothing to undo'); return; }
    if (u.kind === 'transform') {
      let o = u.o; if (!o.parent && u.path) o = this.ds.objectByPath(u.path); if (!o || !o.parent) { toast('That object no longer exists'); return; }
      this.select(o); o.position.copy(u.p); o.rotation.copy(u.r); o.scale.copy(u.s); this.commitTransform(); toast('Undone: move');
    } else if (u.kind === 'param') {
      this.setParam(u.k, u.v, true); this.renderParams(); this.save(); toast('Undone: ' + u.label + ' = ' + fmt(u.v));
    } else if (u.kind === 'spec') {
      const nw = JSON.parse(u.json); this.deselect(); Object.keys(this.spec).forEach(k => delete this.spec[k]); Object.assign(this.spec, nw);
      this.ds.build(); this.refreshPins(); this.renderObjects(); this.renderParams(); this.save(); toast('Undone: ' + (u.label || 'change'));
    }
  }
  editAction(kind, o = this.sel) {
    if (!o) return; const b = this.bodySpecOf(o); this.snapshot(kind);
    if (kind === 'hide') { const h = !o.userData.hiddenByUser; if (b) { b.hidden = h; } else { this.overrideOf(o).hidden = h; } o.userData.hiddenByUser = h; o.visible = !h; if (!h) { const it = (this.ds.ovList || []).find(x => x.o === o); if (it) it.e.hidden = false; } this.renderEditBar(); this.renderObjects(); toast(h ? 'Hidden' : 'Shown'); }
    if (kind === 'remove') {
      if (b && isSceneSpec(this.spec) && o.userData.bodyId) { this.spec.bodies = this.spec.bodies.filter(x => x !== b); this.spec.tour = (this.spec.tour || []).filter(id => id !== b.id); }
      else if (b && o.userData.added) this.spec.additions.splice(this.spec.additions.indexOf(b), 1);
      else this.overrideOf(o).removed = true;
      this.deselect(); this.ds.build(); this.refreshPins(); toast('Removed');
    }
    this.save();
  }
  replaceDialog() {
    const o = this.sel; if (!o) return;
    const kind = el('select', { class: 'field', 'aria-label': 'Shape' }, SHAPES.map(s => el('option', { text: s }))), mat = el('select', { class: 'field', 'aria-label': 'Material' }, PRESETS.map(s => el('option', { text: s }))), col = el('input', { type: 'color', value: '#c9a050', 'aria-label': 'Colour' });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [el('h3', { text: 'Replace ' + this.nameOf(o) }), el('label', { text: 'Shape' }), kind, el('label', { text: 'Material' }), mat, el('label', { text: 'Colour' }), col,
      el('p', { class: 'dim small', text: 'The replacement follows the original body, so the simulation keeps driving it.' }),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), el('button', { class: 'btn primary', text: 'Replace', onclick: () => {
        this.snapshot('replace'); const shape = { kind: kind.value }, material = { preset: mat.value, color: col.value }, b = this.bodySpecOf(o);
        if (b) { b.shape = shape; b.material = material; } else this.overrideOf(o).replace = { shape, material };
        box.remove(); this.deselect(); this.ds.build(); this.refreshPins(); this.save(); toast('Replaced');
      } })])])]);
    document.body.append(box);
  }
  addObjectDialog() {
    const kind = el('select', { class: 'field', 'aria-label': 'Shape' }, SHAPES.map(s => el('option', { text: s }))), mat = el('select', { class: 'field', 'aria-label': 'Material' }, PRESETS.map(s => el('option', { text: s }))), name = el('input', { class: 'field', type: 'text', value: '', placeholder: 'Name (optional)' }), actor = el('input', { type: 'checkbox' });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [el('h3', { text: 'Add an object' }), el('label', { text: 'Shape' }), kind, el('label', { text: 'Material' }), mat, el('label', { text: 'Name' }), name, el('label', { class: 'row' }, [actor, ' Significant body (gets a pinned name)']),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), el('button', { class: 'btn primary', text: 'Add', onclick: () => {
        const c = this.controls.target, b = { id: 'add-' + uid(), name: name.value || kind.value, label: name.value || kind.value, role: actor.checked ? 'actor' : 'decor', shape: { kind: kind.value }, material: { preset: mat.value }, position: [+c.x.toFixed(2), Math.max(0, +c.y.toFixed(2) - 1), +c.z.toFixed(2)] };
        this.snapshot('add object'); if (isSceneSpec(this.spec)) { this.spec.bodies.push(b); if (actor.checked) this.spec.tour = (this.spec.tour || []).concat(b.id); } else this.spec.additions = (this.spec.additions || []).concat(b);
        box.remove(); this.ds.build(); this.refreshPins(); this.save(); toast('Added. Select it to move it');
      } })])])]);
    document.body.append(box);
  }
  renderObjects() {
    const box = this.objBox; if (!box) return; box.innerHTML = '';
    box.append(el('div', { class: 'row wrap' }, [el('button', { class: 'btn small', text: this.editing ? 'Stop editing' : 'Start editing', onclick: () => { this.toggleEdit(); this.renderObjects(); } }), el('button', { class: 'btn small', text: '+ Add object', onclick: () => this.addObjectDialog() }), el('button', { class: 'btn small primary', text: 'Ask AI…', onclick: () => this.askAI(null) })]));
    // named parts first (actors, then scenery); unnamed sub-meshes are gathered under one collapsible line
    const list = el('ul', { class: 'olist' }), rest = el('ul', { class: 'olist' }), seen = new Map();
    const item = (o, nm) => {
      const hidden = !!o.userData.hiddenByUser;
      const eye = el('button', { class: 'ibtn tiny', title: hidden ? 'Show' : 'Hide', 'aria-label': hidden ? 'Show' : 'Hide', text: hidden ? '◌' : '●', onclick: ev => { ev.stopPropagation(); this.editAction('hide', o); } });
      const act = this.ds.actors.find(a => a.obj === o || (a.obj && o.getObjectById(a.obj.id)));
      const pov = act ? el('button', { class: 'ibtn tiny pov', title: 'See from here (P)', 'aria-label': 'See from ' + act.name, text: '◉', onclick: ev => { ev.stopPropagation(); this.setPOV(act); } }) : null;
      return el('li', { class: (this.sel === o ? 'sel ' : '') + (o.userData.role === 'actor' ? 'actor' : ''), onclick: () => { if (!this.editing) this.toggleEdit(true); this.select(o); } }, [eye, el('span', { text: nm }), pov]);
    };
    const all = [...this.ds.world.children, ...this.ds.extras.children].filter(o => !o.userData.isInk && !o.isLight);
    const named = o => !!(o.userData.label || (o.name && !/^(mesh|group|object3d)?$/i.test(o.name)));
    all.sort((a, b) => (b.userData.role === 'actor') - (a.userData.role === 'actor')).forEach(o => {
      if (!named(o)) { rest.append(item(o, this.nameOf(o))); return; }
      let nm = this.nameOf(o); const k = seen.get(nm) || 0; seen.set(nm, k + 1); if (k) nm += ' (' + (k + 1) + ')';
      list.append(item(o, nm));
    });
    box.append(list);
    if (rest.children.length) box.append(el('details', { class: 'orest' }, [el('summary', { text: `Other parts (${rest.children.length})` }), rest]));
  }
  async askAI(o) {
    const ta = el('textarea', { class: 'field', rows: 4, placeholder: o ? 'e.g. "make it twice as heavy", "turn it into a red sailing boat", "attach a spring to it and log every bounce"' : 'e.g. "add wind that bends the trees", "add a second planet and an event when they align", "add a variable for friction"' });
    const st = el('div', { class: 'dim small' }); const go = el('button', { class: 'btn primary', text: 'Send' });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [el('h3', { text: o ? 'Ask AI to change ' + this.nameOf(o) : 'Ask AI to change this diorama' }), ta, st, el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), go])])]);
    document.body.append(box); setTimeout(() => ta.focus(), 30);
    go.onclick = async () => {
      if (!ta.value.trim()) return; go.disabled = true; st.textContent = 'Thinking…';
      const selInfo = o ? { name: this.nameOf(o), path: this.ds.pathOf(o), bodyId: o.userData.bodyId || null, role: o.userData.role || 'decor', position: o.position.toArray().map(v => +v.toFixed(2)) } : null;
      try {
        const nw = await askJSON(editPrompt(this.spec, selInfo, ta.value.trim(), this.opts.context), { tools: evidenceTools(), onTool: (n, i) => st.textContent = 'Looking up: ' + String((i && i.query) || '').slice(0, 60) + '…', onText: t => st.textContent = 'Writing… ' + t.length + ' characters', manualTitle: 'Ask an AI to change this diorama' });
        const spec = nw.spec || nw; if (!spec || (!spec.type && !spec.bodies)) throw { code: 'invalid_json' };
        box.remove(); this.replaceSpec(spec); toast('Diorama updated');
      } catch (e) { go.disabled = false; st.textContent = errCopy(e); }
    };
  }
  replaceSpec(nw) {
    const undo = this.undoStack.filter(u => u.kind === 'spec').concat({ kind: 'spec', label: 'AI change', json: JSON.stringify(this.spec) });
    Object.keys(this.spec).forEach(k => delete this.spec[k]); Object.assign(this.spec, nw); this.save();
    const opts = Object.assign({}, this.opts, { skipIntro: true, fromRect: null, undo }); const app = this.app, spec = this.spec;
    this.dispose(); app.openDiorama(spec, opts);
  }
  save() { if (this.opts.onSave) this.opts.onSave(this.spec); }
  replay() {
    this.deselect(); this.toggleEdit(false); this.panel.classList.remove('in'); this.panel.hidden = true; this.pins.forEach(p => p.remove()); this.pins.clear(); this.labels.innerHTML = '';
    this.controls.enabled = false; this.ds.build(); this.lessonI = 0; this._auto = null; this.start();
  }
  exit() { const f = this.opts.onExit; this.dispose(); if (f) f(); }
  // ---------- frame ----------
  update(dt, t) {
    const ds = this.ds;
    if (this.stage === 'materialize') { this.tm += dt; const k = Math.min(1, this.tm / this.tmDur); this.mat.setProgress(k); if (k >= 1) this.endMaterialize(); }
    if (this.fly) { const f = this.fly; f.k = Math.min(1, f.k + dt / f.dur); const e = easeInOutQuint(f.k); this.controls.target.lerpVectors(f.from.t, f.to.t, e); this.camera.position.lerpVectors(f.from.p, f.to.p, e); this.camera.position.y += Math.sin(Math.PI * e) * f.lift; this.camera.lookAt(this.controls.target); if (f.k >= 1) { this.fly = null; this.controls.enabled = this.stage !== 'materialize' && this.stage !== 'sketch'; } }
    else if (this.pov) this.updatePOV(dt);
    else if (this.controls.enabled) this.controls.update();
    ds.step(this.stage === 'sketch' ? 0 : dt * this.dir.timeScale);
    if (this.awaitIdle && this.dir.idle()) { this.awaitIdle = false; this.runT = this.runDur; }
    if (this.running != null) { if (!this.awaitIdle) this.runT += dt * ds.speed * this.dir.timeScale; if (this.runBar) this.runBar.style.width = Math.min(100, this.runT / this.runDur * 100) + '%'; if (this.runT >= this.runDur) this.completeLesson(); }
    this.flashes = this.flashes.filter(f => { f.a += dt; f.s.scale.setScalar(.3 + f.a * 2.4); f.s.material.opacity = Math.max(0, 1 - f.a / 1.1); if (f.a > 1.1) { f.s.removeFromParent(); return false; } return true; });
    // pins
    const w = innerWidth, h = innerHeight, v = V3();
    this.dir.update(dt, this.camera, w, h);
    // labels: project, then place in priority order (the step's objects first) so they never sit on each other,
    // and fade any label that would land under the instruction panel or the readouts
    if (!this._pr || t - this._pr > 1) { this._pr = t; this._block = [this.panel, this.readPanel, this.titleEl, this.povBar, this.editBar].filter(P => P && !P.hidden && !P.classList.contains('folded')).map(P => P.getBoundingClientRect()); const hr = this.labels.getBoundingClientRect(); this._bo = [hr.left, hr.top]; }
    const placed = [], items = [];
    this.labels.childNodes.forEach(pin => {
      const src = pin._actor ? pin._actor.getPos() : pin._sym ? (() => { try { return pin._sym.getPos(); } catch (e) { return null; } })() : null;
      if (!src || this.stage === 'sketch' || this.stage === 'materialize') { pin.style.visibility = 'hidden'; return; }
      v.copy(src).project(this.camera); if (v.z > 1) { pin.style.visibility = 'hidden'; return; }
      if (!pin._w) pin._w = pin.offsetWidth;
      items.push({ pin, x: clamp((v.x * .5 + .5) * w, 10, w - (pin._w || 120) - 10), y: clamp((-v.y * .5 + .5) * h, 22, h - 22), pr: (pin.classList.contains('hot') ? 4 : 0) + (pin.classList.contains('focus') ? 2 : 0) + (pin._actor ? 1 : 0) });
    });
    items.sort((a, b) => b.pr - a.pr);
    for (const it of items) {
      const W0 = it.pin._w || 120, H0 = 28; let y = it.y, ok = false;
      for (let k = 0; k < 4 && !ok; k++) { const hit = placed.find(q => it.x < q.x + q.w && it.x + W0 > q.x && y - H0 / 2 < q.y + q.h / 2 && y + H0 / 2 > q.y - q.h / 2); if (!hit) ok = true; else y = hit.y + (y >= hit.y ? H0 : -H0); }
      const under = (this._block || []).some(r => { const rx = r.left - this._bo[0], ry = r.top - this._bo[1]; return it.x + 8 > rx && it.x < rx + r.width && y > ry && y < ry + r.height; });
      it.pin.style.visibility = ok && !under ? 'visible' : 'hidden';
      if (ok && !under) { placed.push({ x: it.x, y, w: W0, h: H0 }); it.pin.style.transform = `translate(${it.x.toFixed(1)}px,${y.toFixed(1)}px)`; }
    }
    if (!this._rt || t - this._rt > .15) { this._rt = t; this.clock.textContent = this.clockText(); const rd0 = ds.readouts(), F = this.readFocus; let rd = rd0;
      if (F) { const rel = rd0.filter(([k]) => { const w = String(k).toLowerCase().split(/[^a-zα-ωₐ-ₜ0-9]+/).filter(x => x.length > 2); return w.some(x => F.includes(x)); }); rd = (rel.length ? rel : rd0).slice(0, 6); }
      else if (!this.prefs.readsAll) rd = rd0.slice(0, 6);
      this.readMore.hidden = rd0.length <= 6 || !!F; this.readMore.textContent = this.prefs.readsAll ? 'Fewer readouts ▴' : `All ${rd0.length} readouts ▾`; this.readPanel.classList.toggle('full', !!this.prefs.readsAll && !F);
      this.reads.innerHTML = rd.map(([k, v]) => `<span><i>${esc(k)}</i> ${esc(v)}</span>`).join(''); this.drawSpark(); this.readPanel.hidden = this.stage === 'sketch' || this.stage === 'materialize' || (!rd.length && !ds.series.length); }
  }
  drawSpark() {
    const c = this.spark, g = c.getContext('2d'), ds = this.ds; g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(244,239,230,.55)'; g.font = '20px IBM Plex Mono, monospace'; g.fillText(ds.seriesName || '', 8, 22);
    const H = ds.sim && ds.sim.hist ? ds.sim.hist() : null;
    if (H) { const mx = Math.max(...H, 1); H.forEach((v, i) => { const bw = c.width / H.length; g.fillStyle = 'rgba(255,217,138,.6)'; g.fillRect(i * bw + 1, c.height - v / mx * (c.height - 34), bw - 2, v / mx * (c.height - 34)); }); return; }
    const d = ds.series; if (d.length < 2) return; let lo = Math.min(...d), hi = Math.max(...d);
    if (ds.sim && ds.sim.seriesRange) { try { const r = ds.sim.seriesRange(lo, hi); if (r && isFinite(r[0]) && isFinite(r[1]) && r[1] > r[0]) [lo, hi] = r; } catch (e) { } }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    g.strokeStyle = '#ffd98a'; g.lineWidth = 2.5; g.beginPath(); d.forEach((y, i) => { const x = i / 299 * c.width, yy = c.height - 8 - (y - lo) / (hi - lo) * (c.height - 40); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }); g.stroke();
  }
  dispose() {
    if (this.pov) this.exitPOV(true);
    if (this.disposed) return;
    if (this.dir) this.dir.dispose(); this.gfx.canvas.removeEventListener('wheel', this.onWheel); removeEventListener('keydown', this.onKey);
    this.gfx.canvas.removeEventListener('pointerdown', this.onPointerDown); this.gfx.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose(); if (this.tc) { this.tc.detach(); this.tc.dispose(); }
    this.gfx.outline.selectedObjects = []; this.gfx.outline.enabled = false; this.gfx.canvas.classList.remove('editing');
    this.ui.remove(); this.ds.dispose(); this.disposed = true;
  }
}

// Off-screen sketch renderer: the drawing as an image (scroll illustrations, pedestal previews).
const sketchCache = new Map();
// opts.focusText: render a "stage plate" instead of the overview — the camera frames only the bodies the text names,
// and each is marked with a coloured number and a legend, so a repeated diorama is shown for a different purpose.
const STAGE_COLORS = ['#d1495b', '#2e86ab', '#e9a03b', '#3f7d6e', '#7b4b94'];
const STOP = new Set(['the', 'and', 'with', 'from', 'into', 'that', 'this', 'than', 'over', 'under', 'glass', 'their', 'about']);
const toks = t => String(t || '').toLowerCase().replace(/[^a-z0-9α-ω ]+/g, ' ').split(/\s+/).filter(x => x.length > 3 && !STOP.has(x));
export function matchActors(actors, text) {
  const T = new Set(toks(text)); const full = String(text || '').toLowerCase();
  return actors.map(a => { const n = a.name.split(' · ')[0].toLowerCase(); const ts = toks(n); const hit = full.includes(n) ? 10 : ts.filter(x => T.has(x) || [...T].some(y => y.startsWith(x.slice(0, 5)) && x.length > 4)).length; return { a, hit }; }).filter(x => x.hit > 0).sort((p, q) => q.hit - p.hit).map(x => x.a).slice(0, 5);
}
export async function renderSketch(gfx, spec, w = 800, h = 500, opts = {}) {
  const key = JSON.stringify([spec.type, spec.technique, spec.params, spec.bodies && spec.bodies.length, spec.title, spec.code && spec.code.length, spec.overrides, spec.additions, opts.focusText || '', opts.label || '']);
  if (sketchCache.has(key)) return sketchCache.get(key);
  const ds = new DioramaScene(gfx, spec, { headless: true });
  addInk(ds.world, ds.U); addInk(ds.extras, ds.U); addOutlines(ds.world, ds.U, ds.radius * .005); addOutlines(ds.extras, ds.U, ds.radius * .005);
  const cam = new THREE.PerspectiveCamera(40, w / h, .1, 400);
  ds.step(0);
  // a stage plate shows the step's own state: let the model settle under the step's settings first (≈4 s of model time)
  if (opts.focusText) { const pl = ds.playing; ds.playing = true; try { const t0 = performance.now(); for (let k = 0; k < 96 && performance.now() - t0 < 1500; k++) ds.step(.5); } catch (e) { } ds.playing = pl; }   // ≈48 model-seconds: slow processes (crystals, levels) reach the step's state
  let endKey = ds.overviewKey(), focus = [], fc = ds.center, fr = ds.radius;
  if (opts.focusText) {
    focus = matchActors(ds.actors, opts.focusText);
    { const seenO = new Set(); focus = focus.filter(a => { const k = a.obj || a.name; if (seenO.has(k)) return false; seenO.add(k); return true; }); }   // one marker per mesh
    const bx = new THREE.Box3(); focus.forEach(a => { if (a.obj) bx.expandByObject(a.obj); else { const p = a.getPos && a.getPos(); if (p) bx.expandByPoint(p); } });
    if (!bx.isEmpty()) { fc = bx.getCenter(V3()); fr = clamp(bx.getSize(V3()).length() * .62, ds.radius * .22, ds.radius); }
  }
  if (opts.focusText && !focus.length) { ds.dispose(); sketchCache.set(key, null); return null; }
  const m = new Materializer({ scene: ds.scene, camera: cam, world: ds.world, U: ds.U, technique: spec.technique || spec.style || 'card', endKey, center: fc, radius: fr, env: ds.env });
  m.setProgress(0); ds.step(0); m.setProgress(0);
  const paper = new THREE.Color('#efe9dc'); const keepBg = ds.scene.background, keepFog = ds.scene.fog; ds.scene.background = paper; ds.scene.fog = null;
  ds.scene.traverse(o => { if (o.isPoints || (o.userData.decorBase)) o.visible = false; });
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }); const r = gfx.renderer;
  const prevT = r.getRenderTarget(), prevTM = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
  r.setRenderTarget(rt); r.render(ds.scene, cam); r.setRenderTarget(prevT); r.toneMapping = prevTM;
  const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(img, 0, 0);
  // stage plate: coloured numbered markers on the bodies this step is about, with a legend
  if (focus.length) {
    cam.updateMatrixWorld();
    const legend = [], pts = [];
    focus.forEach((a, i) => {
      let p = null, rr = 24; if (a.obj) { const b3 = new THREE.Box3().setFromObject(a.obj); p = b3.getCenter(V3()); const s2 = b3.getSize(V3()).length() * .5; const e = p.clone().add(V3(s2, 0, 0)).project(cam), c0 = p.clone().project(cam); rr = clamp(Math.abs(e.x - c0.x) * .5 * w * .8, 14, 90); } else p = a.getPos && a.getPos();
      if (!p) return; const q = p.clone().project(cam); if (q.z > 1) return; pts.push({ a, i, x: (q.x * .5 + .5) * w, y: (-q.y * .5 + .5) * h, rr });
    });
    // badges in a column on the side with more room, spaced so they never overlap; leader lines to each part
    const side = pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length) < w / 2 ? 1 : -1, colX = side > 0 ? Math.min(w - 50, Math.max(...pts.map(p => p.x + p.rr)) + 60) : Math.max(50, Math.min(...pts.map(p => p.x - p.rr)) - 60);
    pts.sort((p, q) => p.y - q.y); let lastY = -1e9; pts.forEach((p, n) => { p.by = clamp(Math.max(p.y, lastY + 34), 60, h - 60); lastY = p.by; p.i = n; });   // numbered top to bottom, no gaps
    pts.forEach(({ a, i, x, y, rr, by }) => {
      const col = STAGE_COLORS[i % STAGE_COLORS.length], bx = colX;
      g.strokeStyle = col; g.lineWidth = 2.5; g.globalAlpha = .9; g.setLineDash([]); g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      const ex = x + side * rr * .8, ey = y + (by - y) * .2; g.beginPath(); g.moveTo(ex, ey); g.lineTo(bx - side * 14, by); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(bx, by, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 14px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), bx, by + 1);
      legend.push([col, i + 1, a.name]);
    });
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '14px "IBM Plex Mono", monospace';
    const lw = Math.min(w * .55, 26 + Math.max(...legend.map(l => g.measureText(l[2]).width)) + 40);
    g.fillStyle = 'rgba(250,246,236,.92)'; g.fillRect(24, 24, lw, 18 + legend.length * 24); g.strokeStyle = 'rgba(29,28,25,.4)'; g.lineWidth = 1; g.strokeRect(24, 24, lw, 18 + legend.length * 24);
    legend.forEach(([col, n, name], i) => { g.fillStyle = col; g.beginPath(); g.arc(42, 42 + i * 24, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 11px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText(n, 42, 46 + i * 24); g.textAlign = 'left'; g.fillStyle = '#1d1c19'; g.font = '14px "IBM Plex Mono", monospace'; g.fillText(name.slice(0, 40), 58, 47 + i * 24); });
  }
  // drafting chrome: border, corner marks, title block
  g.strokeStyle = 'rgba(29,28,25,.75)'; g.lineWidth = 1.5; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#e85d04'; [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([x, y]) => { g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 1, y - 6, 2, 12); });
  // title block on an opaque strip; both labels fitted with an ellipsis so they never run into each other
  g.font = '13px "IBM Plex Mono", monospace'; g.textAlign = 'left';
  const fit = (t, max) => { t = String(t); if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
  const L0 = String(spec.title || spec.type).toUpperCase(), R0 = focus.length ? 'STAGE · ' + String(opts.label || '').toUpperCase() : (spec.technique || spec.style || 'card').toUpperCase() + ' · DRAWING';
  const avail = w - 52 - 24, lW = Math.min(g.measureText(L0).width, avail * .5), Lt = fit(L0, lW), Rt = fit(R0, avail - g.measureText(Lt).width);
  g.fillStyle = 'rgba(239,233,220,.94)'; g.fillRect(15, h - 44, w - 30, 29); g.strokeStyle = 'rgba(29,28,25,.35)'; g.beginPath(); g.moveTo(15, h - 44); g.lineTo(w - 15, h - 44); g.stroke();
  g.fillStyle = 'rgba(29,28,25,.85)'; g.fillText(Lt, 26, h - 25); g.textAlign = 'right'; g.fillText(Rt, w - 26, h - 25);
  rt.dispose(); ds.scene.background = keepBg; ds.scene.fog = keepFog; ds.dispose();
  const url = c.toDataURL('image/jpeg', .86); sketchCache.set(key, url); return url;
}
