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
import { el, $, clamp, fmt, esc, ease, easeInOutQuint, toast, typeset, uid, confirmBox, disposeTree, gpuSet , mathHTML, canvasMath, mathText } from '../util.js';
import { askJSON, errCopy } from '../ai/claude.js';
import { editPrompt } from '../ai/prompts.js';
import { radialGlow } from '../gfx/textures.js';
import { renderSource } from '../room/reader.js';
import { evidenceTools } from '../ai/evidence.js';
import { Director } from './director.js';
import { Cues, cloneMat } from './focus.js';
import { Inset } from './inset.js';
import { DIO } from './models.js';
const PREFS_KEY = 'scriptorium.view';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { } };

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class DioramaView {
  constructor(app, spec, opts = {}) {
    this.app = app; this.gfx = app.gfx; this.spec = spec; this.opts = opts;
    // built-in models were rebuilt (v4): object paths saved for the old scene graph no longer point at the same parts, so set them aside
    if (!isSceneSpec(spec) && spec.overrides && spec.ovV !== 2) { spec.overridesV1 = spec.overrides; delete spec.overrides; }
    this.ds = new DioramaScene(this.gfx, spec);
    this.camera = this.ds.camera; this.scene = this.ds.scene;
    // the beat's subject gets a soft warm accent (always present, intensity 0 at rest, so the light count never changes)
    this.accentLight = new THREE.SpotLight(0xfff0d8, 0, 0, .5, .7, 2); this.accentLight.castShadow = false; this.accentLight.name = 'director accent'; this.accentLight.userData.isInk = true;
    this.scene.add(this.accentLight, this.accentLight.target);
    // ambience from the setting the model actually stages (a model may choose its own preset)
    { const pre = (this.ds.env && this.ds.env.preset) || 'studio'; this.app.sfx && this.app.sfx.ambience({ landscape: 'outdoor', ocean: 'ocean', cosmos: 'space', night: 'outdoor', micro: 'micro', lab: 'lab', abstract: 'studio', desk: 'studio', studio: 'studio' }[pre] || 'studio'); }
    this.stage = 'init'; this.tourI = -1; this.pins = new Map(); this.lessonI = 0; this.flashes = [];
    this.title = opts.title || spec.title || (spec.type && spec.type !== 'scene' ? spec.type.replace(/^./, c => c.toUpperCase()).replace('pendulum', ' pendulum') : 'Diorama');
    this.ui = el('div', { class: 'dio-ui' }); app.ui.append(this.ui);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: 2, maxDistance: 60, maxPolarAngle: Math.PI * .49, enabled: false });
    this.prefs = loadPrefs(); this.undoStack = opts.undo || [];
    this.buildHUD();
    this.dir = new Director(this, this.ui);
    this.cues = new Cues(this);   // chain / isolate / peel cues and the focus mask (js/dio/focus.js)
    this.inset = new Inset(this);   // S10: the passive "you are here" overview during zooms, rides and deep close-ups (js/dio/inset.js)
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
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: 'The drawing' }), el('div', { class: 'coach-text', mathLabel: this.title })]),
      el('button', { class: 'btn primary', text: 'Transition', onclick: () => this.transition() }));
    this.coach.hidden = false;
  }
  transition(duration = 6.5) {
    if (this.stage !== 'sketch') return; this.stage = 'materialize'; this.coach.innerHTML = '';
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: 'Materialising' }), el('div', { class: 'coach-text', mathLabel: this.title })]), el('button', { class: 'btn ghost', text: 'Skip', onclick: () => { this.tm = duration; } }));
    this.tm = 0; this.tmDur = duration; this.ds.playing = true; this.ds.speed = .6;
  }
  endMaterialize() {
    this.mat.finish(); this.removeInk(); this.ds.speed = 1; this.syncControls(); this.ds.computeBounds();
    this.stage = 'tour'; this.tourI = -1; this.next();
  }
  removeInk() { const rm = []; this.scene.traverse(o => { if (o.userData.isInk && !o.isLight) rm.push(o); });   /* lights stay: removing one recompiles every program */ rm.forEach(o => o.removeFromParent()); if (rm.length) this.app.retire(() => disposeTree(rm, this.disposed ? null : this.scene)); }   // edge lines and hull shells (the hulls share their mesh's geometry, which stays)
  // rebuild the model; the old bodies' geometries and materials are freed once the new ones have rendered
  rebuild() { const old = [...this.ds.world.children, ...this.ds.extras.children]; this.ds.build(); this.app.retire(() => disposeTree(old, this.disposed ? null : this.scene)); }
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
    this.coach.append(el('div', { class: 'coach-main' }, [el('div', { class: 'coach-kicker', text: `Body ${this.tourI + 1} of ${A.length}` }), el('div', { class: 'coach-text', mathLabel: a.name }), a.describe ? el('div', { class: 'coach-sub', mathLabel: a.describe }) : null, dots]),
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
    if (!pin) { pin = el('div', { class: 'pin' }, [el('span', { class: 'pin-dot' }), el('span', { class: 'pin-name', html: mathHTML(a.name, 'label') })]); this.labels.append(pin); this.pins.set(a.name, pin); requestAnimationFrame(() => pin.classList.add('in')); }
    this.pins.forEach(p => p.classList.remove('focus')); if (focus) pin.classList.add('focus');
    pin._actor = a; if (this._hot && this._hot.length) pin.classList.toggle('hot', this._hot.some(h => h.name === a.name));
  }
  // ---------- explore: foldable left panel with step-by-step instructions ----------
  showExplore(immediate) {
    this.panel.hidden = false; requestAnimationFrame(() => this.panel.classList.add('in'));
    this.renderLessons(); this.renderParams(); this.renderObjects();
    this.ds.symbols && this.ds.symbols.forEach(s => { const p = el('div', { class: 'pin sym in', mathLabel: s.text }); p._sym = s; this.labels.append(p); });
    if (immediate) this.ds.actors.forEach(a => this.ensurePin(a, false));
    this.ds.playing = true; this.syncTimeUI(); this._wideFix = 2;   // the opening view is re-framed into the free frame once the panels are laid out
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
        el('div', { class: 'lesson-head' }, [el('span', { class: 'lesson-n', text: done ? '✓' : String(i + 1) }), el('b', { html: mathHTML(l.title || 'Step ' + (i + 1)) })]),
        l.question ? el('div', { class: 'lesson-q', html: '<b>Q</b> ' + mathHTML(l.question) }) : null,
        el('div', { class: 'lesson-text', html: mathHTML(l.text || '') }),
        done && l.explain ? el('div', { class: 'lesson-explain', html: mathHTML(l.explain) }) : null,
        done && l.opens ? el('div', { class: 'lesson-opens', html: '→ ' + mathHTML(l.opens) }) : null,
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
    this.lessonActor = fa; this.awaitIdle = false; this._stepKeys = new Set(); this.dir.clear(); this.cues.reset();   // starting a step is the reader's choice: what was showing gives way, and the new instruction is read before anything moves
    const host = fa || this.namesIn(l.text)[0];
    this.dir.clearCaption();
    // cinematic: the instruction is read first (the model waits), then the step plays; without a subject it shows as a caption
    const flows = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, lt = String(l.text || '').toLowerCase(), fk = Object.keys(flows).find(k => lt.includes(k));
    const povA = l.pov ? this.ds.actors.find(a => a.name === l.pov || a.name.toLowerCase().includes(String(l.pov).toLowerCase())) : l.track === 'actor' ? host : null;
    const cue = this.dir.cinematic ? this.lessonCues(l, host) : {}; this.stepCue = cue;
    if (this.pov && this.pov.auto) this.exitPOV(false, true);
    if (this.dir.cinematic) { if (!this.panel.classList.contains('folded')) { this.panel.classList.add('folded'); this._autoFold = true; this.fold.textContent = '›'; } this.readFocus = ((l.title || '') + ' ' + (l.text || '') + ' ' + (l.explain || '')).toLowerCase(); this.readPanel.classList.add('compact'); }
    if (this.dir.cinematic) this.dir.push({ kind: 'lesson', shot: cue.zoom ? 'zoom' : cue.track ? 'track' : l.shot || (povA ? 'pov' : undefined), zoom: cue.zoom, track: cue.track, caption: !host && !povA && !cue.zoom && !cue.track, question: l.question, povLook: l.povLook, title: l.title || 'Step ' + (i + 1), text: l.text || '', anchor: host ? () => host.getPos() : null, focus: host && host.obj, host: povA || host, names: this.namesIn(l.text, host), flows: fk ? flows[fk] : null });
    else if (fa) this.flyTo(fa.getPos() || this.ds.center, 6);
    if (cue.isolate) this.cues.setIsolate(cue.isolate);
    if (cue.chain) this.cues.startChain(cue.chain, { pace: l.chainPace, on: l.chainOn });
    if (cue.peel) this.cues.startPeel(cue.peel, host);
    this.ds.playing = true; this.syncTimeUI();
    const until = String(l.until || ''); this.running = i; this.runT = 0; this.runDur = +l.run || (until ? 30 : 6); this.runUntil = until.startsWith('event:') ? until.slice(6).toLowerCase() : null; this.runReplay = !!replay;
    const bar = this.lessonBox.querySelectorAll('.lesson')[i]; this.runBar = bar && bar.querySelector('.lesson-bar i');
    const b = bar && bar.querySelector('.lesson-run .btn'); if (b) { b.textContent = 'Running…'; b.disabled = true; }
  }
  completeLesson() {
    const i = this.running; this.running = null; this.awaitIdle = false; this.dir.clearCaption(); if (this.pov && this.pov.auto) this.exitPOV(false, true);
    const unfold = () => { if (this._autoFold) { this.panel.classList.remove('folded'); this._autoFold = false; this.fold.textContent = '‹'; } this.readFocus = null; this.readPanel.classList.remove('compact'); };
    const l = this.lessons()[i]; const fa = this.lessonActor;
    const cue = this.stepCue || {}; this.stepCue = null; this.cues.endStep(); const back = !!(cue.zoom && cue.zoom.back && this.dir.zoomBack()); if (cue.zoom && !back) this.dir.endZoomHud();   // zoom back: the generalising pull-out
    if (l && l.explain && this.dir.cinematic) { const F = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, et = l.explain.toLowerCase(), k = Object.keys(F).find(q => et.includes(q)); this.dir.push({ kind: 'explain', noShot: back, onEnd: unfold, opens: l.opens, caption: !fa, title: 'Why', text: l.explain, anchor: fa ? () => fa.getPos() : null, focus: fa && fa.obj, host: fa, names: this.namesIn(l.explain, fa), flows: k ? F[k] : null }); }
    if (!(l && l.explain && this.dir.cinematic)) unfold();
    if (!this.runReplay && i === this.lessonI) { this.lessonI++; toast('Step complete'); if (this.opts.onProgress) this.opts.onProgress(this.lessonI); }
    this.renderLessons();
  }
  renderParams() {
    const box = this.paramBox; box.innerHTML = '';
    for (const k in this.ds.ranges) {
      if ((this.spec.hidden || []).includes(k)) continue;
      const [a, b, , unit, name] = this.ds.ranges[k], v = this.ds.p[k];
      const out = el('b', { mathLabel: fmt(v) + (unit ? ' ' + unit : '') });
      const inp = el('input', { type: 'range', min: a, max: b, step: (b - a) / 300, value: v, id: 'dp-' + k, 'aria-label': name || k });
      inp.onpointerdown = inp.onkeydown = () => { if (inp._from == null) inp._from = this.ds.p[k]; };
      inp.oninput = () => { if (inp._from == null) inp._from = this.ds.p[k]; typeset(out, fmt(+inp.value) + (unit ? ' ' + unit : ''), 'label'); this.setParam(k, +inp.value, false, true); };   // a model that rebuilds rebuilds once per frame while dragging
      inp.onchange = () => { if (inp._from != null && inp._from !== this.ds.p[k]) this.pushUndo({ kind: 'param', k, v: inp._from, label: name || k }); inp._from = null; inp.blur(); };
      box.append(el('label', { class: 'ctrl' }, [el('span', {}, [el('span', { html: mathHTML(name || k, 'label') }), out]), inp]));
    }
    if (!box.children.length) box.append(el('p', { class: 'dim small', text: 'No variables. Use Edit → Ask AI to add some.' }));
    // what the model is doing right now, under the sliders that cause it (newest first)
    this.dynBox = el('div', { class: 'dyn-box' }, [el('h4', { text: 'Dynamic changes' }), this.dynList = el('ul', { class: 'dyn-list' })]);
    box.append(this.dynBox); (this._dyn || []).forEach(d => this.dynList.append(this.dynItem(d)));
  }
  dynItem(d) { return el('li', { class: 'dyn-item' + (d.fresh ? ' fresh' : '') }, [el('time', { text: d.clock }), el('span', { html: mathHTML(d.text, 'label') })]); }
  pushDyn(ev) {
    const d = { text: ev.text, clock: this.clockText(ev.t), fresh: true }; this._dyn = [d].concat(this._dyn || []).slice(0, 12);
    if (this.dynList) { const li = this.dynItem(d); this.dynList.prepend(li); setTimeout(() => { d.fresh = false; li.classList.remove('fresh'); }, 2500); while (this.dynList.children.length > 12) this.dynList.lastChild.remove(); }
    if (this.tab !== 'Variables') { const t = this.ui && this.ui.querySelector('.tab[data-t="Variables"]'); t && t.classList.add('ping'); }
  }
  setParam(k, v, quiet, defer) {
    const ds = this.ds; if (!(k in ds.p)) return; ds.p[k] = clamp(v, ds.ranges[k][0], ds.ranges[k][1]);
    const live = ds.sim && ds.sim.live && ds.sim.live(k);
    const rebuild = !isSceneSpec(this.spec) ? !live : !!(this.spec.params || []).find(q => q.key === k && q.rebuild);
    if (rebuild) { if (defer) this._needRebuild = true; else { this.rebuild(); this.refreshPins(); } }
    this.spec.values = Object.assign(this.spec.values || {}, { [k]: ds.p[k] });
  }
  // ---------- point of view: the learner's eye rides an actor (a bob, a bubble, a molecule) ----------
  // The camera sits at the actor, looks where it is going (or at what the current step is about), and the
  // learner can still look around by dragging. Small actors are hidden so you see from them, not their inside;
  // large ones (a flask, a cell) stay visible so you are inside them.
  setPOV(a, opts = {}) {
    if (!a) return this.exitPOV();
    // entering (or switching) goes through a short dip to dark, so the eye never snaps across the scene
    if (!opts.now && this.dir) { this.dir.move = null; this.dir.dip = { t: 0, done: false, apply: () => this.setPOV(a, Object.assign({}, opts, { now: true })) }; this.app.sfx && this.app.sfx.play('whoosh'); return; }
    const c = this.camera;
    if (!this.pov) this.povPrev = { p: c.position.clone(), t: this.controls.target.clone(), fov: c.fov, near: c.near };
    else this.exitPOV(true);
    this.scene.updateMatrixWorld(true);   // a step's rebuild leaves world matrices stale: measure after updating them
    let size = .3, center = null; if (a.obj) { const bx = new THREE.Box3().setFromObject(a.obj); if (!bx.isEmpty()) { size = bx.getSize(V3()).length() * .5; center = bx.getCenter(V3()); } }
    const R = this.ds.orb ? this.ds.orb.r : 10, hide = !!a.obj && size < R * .08;
    if (hide) a.obj.traverse(o => { if (o.isMesh) { o.userData._povVis = o.visible; o.visible = false; } });
    const p0 = a.getPos();
    // a small body: the eye is the body itself; a large container: the eye sits at its centre (you are inside it)
    const off = !hide && center && p0 ? center.clone().sub(p0) : V3();
    const lookAt = opts.look ? this.ds.actors.find(x => x.name === opts.look || x.name.toLowerCase().includes(String(opts.look).toLowerCase())) : null;
    this.pov = { a, size, hide, yaw: 0, pitch: 0, look: null, last: null, auto: !!opts.auto, off, lookAt, still: !!opts.still, t: 0, rate: 0, eye: V3(), lastV: V3(), f: V3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), qe: new THREE.Quaternion(), eu: new THREE.Euler() };
    this.dir && (this.dir.move = null); this.fly = null; this.controls.enabled = false;
    c.near = Math.max(.003, size * .03); c.fov = 74; c.updateProjectionMatrix();
    if (p0) { const eye = p0.clone().add(off).addScaledVector(V3(0, 1, 0), hide ? size * .25 : 0); c.position.copy(eye); c.lookAt(this.povGoal(eye)); }
    const cv = this.gfx.renderer.domElement;
    this._povDown = e => { if (this.pov) this.pov.drag = { x: e.clientX, y: e.clientY, yaw: this.pov.yaw, pitch: this.pov.pitch }; };
    this._povMove = e => { const P = this.pov; if (!P || !P.drag || !(e.buttons & 1)) return; P.stay = true; P.yaw = P.drag.yaw - (e.clientX - P.drag.x) * .005; P.pitch = clamp(P.drag.pitch - (e.clientY - P.drag.y) * .005, -1.2, 1.2); };
    this._povUp = () => { if (this.pov) this.pov.drag = null; };
    cv.addEventListener('pointerdown', this._povDown); addEventListener('pointermove', this._povMove); addEventListener('pointerup', this._povUp);
    if (!this.povBar) { this.povBar = el('div', { class: 'pov-bar glass' }); this.ui.append(this.povBar); }
    const others = this.ds.actors, i = others.indexOf(a);
    this.povBar.innerHTML = ''; this.povBar.hidden = false;
    this.povBar.append(el('button', { class: 'ibtn', 'aria-label': 'Previous object', text: '‹', onclick: () => this.setPOV(others[(i - 1 + others.length) % others.length]) }),
      el('span', { html: `Seeing as <b>${esc(a.name.split(' · ')[0])}</b> · drag to look · Esc to leave` }),
      el('button', { class: 'ibtn', 'aria-label': 'Next object', text: '›', onclick: () => this.setPOV(others[(i + 1) % others.length]) }),
      el('button', { class: 'btn small', text: 'Leave', onclick: () => this.exitPOV(false, true) }));
  }
  exitPOV(keepCam, soft) {
    const P = this.pov; if (!P) return;
    if (soft && this.dir && !keepCam) { this.dir.move = null; this.dir.dip = { t: 0, done: false, apply: () => this.exitPOV(false) }; return; }   // leave through a dip, like entering
    this.pov = null; if (P.faded) { P.faded.forEach((a, o) => this.povFade(o, false)); P.faded.clear(); }
    if (P.hide && P.a.obj) P.a.obj.traverse(o => { if (o.isMesh && o.userData._povVis !== undefined) { o.visible = o.userData._povVis; delete o.userData._povVis; } });
    const cv = this.gfx.renderer.domElement; cv.removeEventListener('pointerdown', this._povDown); removeEventListener('pointermove', this._povMove); removeEventListener('pointerup', this._povUp);
    if (keepCam) return;
    const c = this.camera, q = this.povPrev; if (q) { c.position.copy(q.p); this.controls.target.copy(q.t); c.fov = q.fov; c.near = q.near; c.updateProjectionMatrix(); c.lookAt(q.t); }
    this.controls.enabled = true; if (this.povBar) this.povBar.hidden = true;
    if (this.dir) this.dir.last = null;
    if (P.auto && this.dir) this.dir.afterPOV(P.a);   // S6.4: the pull-out that shows where the ride went
  }
  // where the eye wants to look: a named target, else along the actor's path, else at what the current step is about, else level at the model
  povGoal(eye) {
    const P = this.pov; if (!P) return this.ds.center.clone();
    if (P.lookAt && P.lookAt.getPos) { const q = P.lookAt.getPos(); if (q) return q.clone(); }
    if (P.look) { const toC = this.ds.center.clone().sub(eye); if (toC.lengthSq() > 1e-6) toC.normalize(); return eye.clone().add(P.look.clone().multiplyScalar(.65).addScaledVector(toC, .35).normalize()); }   // along the path, tilted toward the model so the world stays in view
    const b = this.dir.beat, q = b && b.anchor && b.host !== P.a ? b.anchor() : null; if (q) return q.clone();
    const f = this.ds.center.clone().sub(eye); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); f.y = -.18; return eye.clone().add(f);
  }
  updatePOV(dt) {
    const P = this.pov, c = this.camera, p0 = P.a.getPos(); if (!p0) return;
    P.t += dt; if (P.auto && !P.stay && P.t > 12 && !P.leaving) { P.leaving = true; this.exitPOV(false, true); }   // S6.6: an automatic ride ends after 12 s (the learner may stay by dragging)
    if (P.still) { this.povClear(dt); return; }   // reduced motion: a static POV still, no ride
    const p = P.eye.copy(p0).add(P.off); if (P.hide) p.y += P.size * .25;
    // follow the line of motion, not its sign: an oscillator doesn't whip round at each turning point
    if (P.last) { const vel = P.f.copy(p).sub(P.lastV); if (vel.length() / Math.max(dt, 1e-3) > P.size * .4) { vel.normalize(); if (P.look && vel.dot(P.look) < 0) vel.negate(); P.look = (P.look || vel.clone()).lerp(vel, Math.min(1, dt * 1.5)).normalize(); } }
    P.lastV.copy(p); P.last = true;
    c.position.lerp(p, Math.min(1, dt * 10));
    // S6.1: the automatic turn is capped at 60°/s with ≤ 120°/s² acceleration; the learner's own drag stays fast; roll locked to 0
    P.m.lookAt(c.position, this.povGoal(c.position), V3(0, 1, 0)); P.q.setFromRotationMatrix(P.m);
    P.q.multiply(P.qe.setFromEuler(P.eu.set(P.pitch, P.yaw, 0, 'YXZ')));
    if (P.drag) { c.quaternion.rotateTowards(P.q, 6 * dt); P.rate = 0; }
    else { const want = Math.min(1.047, c.quaternion.angleTo(P.q) * 2.5); P.rate += clamp(want - P.rate, -2.094 * dt, 2.094 * dt); c.quaternion.rotateTowards(P.q, Math.max(0, P.rate) * dt); }
    c.getWorldDirection(P.f); c.lookAt(P.f.add(c.position));
    this.povClear(dt);
  }
  // a clear view from inside the scene: whatever stands between the eye and what it looks at (or encloses the eye) turns
  // see-through with a dashed outline of its edges, and comes back when it is out of the way
  povClear(dt) {
    const P = this.pov, c = this.camera; P.clrT = (P.clrT || 0) - dt; if (P.clrT > 0) return; P.clrT = .15;
    const R = this.ds.orb ? this.ds.orb.r : 10, rc = this._povRay || (this._povRay = new THREE.Raycaster()), hit = new Set();
    const fwd = V3(); c.getWorldDirection(fwd); const goal = this.povGoal(c.position), far = Math.max(.5, c.position.distanceTo(goal));
    const big = o => { if (o.userData._povBig === undefined) { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(V3()).length(); o.userData._povBig = sz > R * 1.6 || /sky|backdrop|ground|meadow|plinth|floor|hill|cloud|haze|terrain|sea|ocean|stars|lake|valley/i.test((o.name || '') + ' ' + (o.parent && o.parent.name || '')); } return o.userData._povBig; };
    const cand = []; this.ds.world.traverse(o => { if (o.isMesh && o.visible && !big(o)) cand.push(o); });
    // rays through the middle of the view (a 3×3 grid in the central half of the frame)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { rc.setFromCamera(new THREE.Vector2(i * .35, j * .35), c); rc.far = far; rc.near = 0; rc.intersectObjects(cand, false).forEach(h => { if (h.distance < far * .97) hit.add(h.object); }); }
    // anything whose box encloses the eye (the string you ride, a part you are inside) is in the way too, if it is opaque
    cand.forEach(o => { if (o.userData._povVis !== undefined) return; const b = new THREE.Box3().setFromObject(o); if (b.containsPoint(c.position) && !(o.material && o.material.transparent)) hit.add(o); });
    P.faded = P.faded || new Map();
    hit.forEach(o => { if (!P.faded.has(o)) this.povFade(o, true); P.faded.set(o, 0); });
    P.faded.forEach((age, o) => { if (!hit.has(o)) { const a = age + .15; if (a > .6) { this.povFade(o, false); P.faded.delete(o); } else P.faded.set(o, a); } });
  }
  povFade(o, on) {
    if (on) {
      if (o.userData._peelMat || o.userData._povMat) return;   // already see-through (a peeled layer) or already faded
      o.userData._povMat = o.material; const ms = [].concat(o.material).map(m => { const k = cloneMat(m); k.transparent = true; k.opacity = Math.min(m.opacity ?? 1, .22); k.depthWrite = false; return k; });
      o.material = Array.isArray(o.material) ? ms : ms[0];
      const eg = new THREE.EdgesGeometry(o.geometry, 30), ln = new THREE.LineSegments(eg, new THREE.LineDashedMaterial({ color: 0xffe3a3, dashSize: .05, gapSize: .035, transparent: true, opacity: .85, depthTest: false }));
      ln.computeLineDistances(); ln.renderOrder = 9; ln.userData.isInk = true; ln.name = 'pov outline'; o.add(ln); o.userData._povLine = ln;
      // dash length in world units follows the object's size
      const sz = new THREE.Box3().setFromObject(o).getSize(V3()).length(); ln.material.dashSize = Math.max(.01, sz * .04); ln.material.gapSize = ln.material.dashSize * .7;
    } else {
      if (o.userData._povMat) { [].concat(o.material).forEach(m => m.dispose()); o.material = o.userData._povMat; delete o.userData._povMat; }
      const ln = o.userData._povLine; if (ln) { o.remove(ln); ln.geometry.dispose(); ln.material.dispose(); delete o.userData._povLine; }
    }
  }
  // ---------- explainer cues: lesson fields chain / isolate / peel / zoom / track (docs/research/explainer-animation.md §6) ----------
  // names are matched like "focus": id, exact name, the name before " · ", then a substring
  actorByName(n) { if (!n) return null; if (typeof n === 'object') return n.getPos ? n : this.actorByName(n.a || n.at || n.name); const s = String(n).toLowerCase(), A = this.ds.actors; return A.find(a => a.id === n || a.name === n) || A.find(a => a.name.toLowerCase() === s) || A.find(a => a.name.toLowerCase().split(' · ')[0] === s) || A.find(a => a.name.toLowerCase().includes(s)) || null; }
  lessonCues(l, host) {
    const A = n => this.actorByName(n), out = {}, D = DIO[this.spec.type] || {};
    if (Array.isArray(l.chain)) { const links = l.chain.map(x => typeof x === 'string' ? { a: A(x) } : x && typeof x === 'object' ? { a: A(x.a || x.actor || x.name), note: x.note } : null).filter(x => x && x.a); if (links.length >= 2) out.chain = links; }
    const iso = l.isolate ?? this.spec.isolate ?? D.isolate;
    if (iso === true) { const set = [host, ...this.namesIn(l.text, host)].filter(Boolean); if (set.length) out.isolate = set; }
    else if (Array.isArray(iso)) { const set = iso.map(A).filter(Boolean); if (set.length) out.isolate = set; }
    if (out.isolate && out.chain) out.isolate = [...new Set(out.isolate.concat(out.chain.map(x => x.a)))];   // the links the front travels are never dimmed
    if (l.peel && Array.isArray(l.peel.layers)) { const layers = l.peel.layers.map(A).filter(Boolean); if (layers.length) out.peel = Object.assign({}, l.peel, { layers }); }
    if (l.zoom && typeof l.zoom === 'object') { const to = l.zoom.to ? A(l.zoom.to) : host; if (to) out.zoom = Object.assign({}, l.zoom, { to, stations: (l.zoom.stations || []).map(x => typeof x === 'string' ? { at: x } : x || {}).map(x => ({ a: A(x.at || x.a), hold: x.hold })).filter(x => x.a) }); }
    if (l.track && l.track !== 'actor') { let T = typeof l.track === 'string' ? (this.spec.tracks || D.tracks || {})[l.track] : l.track; if (Array.isArray(T)) T = { points: T }; if (T && Array.isArray(T.points) && T.points.length >= 2) out.track = Object.assign({ name: typeof l.track === 'string' ? l.track : 'the track' }, T); }
    return out;
  }
  // S6.3: the learner's choice (Calm) or the system's "reduce motion"
  reducedMotion() { const m = this.prefs.motion; if (m === 'reduced') return true; if (m === 'full') return false; try { this._rmq = this._rmq || matchMedia('(prefers-reduced-motion: reduce)'); return this._rmq.matches; } catch (e) { return false; } }
  scaleM() { const s = this.spec.scale || (DIO[this.spec.type] || {}).scale; return s && +s.m > 0 ? +s.m : 0; }   // metres per world unit (no scale → no scale bar)
  scaleMicro() { const s = this.spec.scale || (DIO[this.spec.type] || {}).scale, u = s && s.micro; return u && +u.m > 0 && +u.below > 0 ? { m: +u.m, below: +u.below, note: u.note ? String(u.note) : '' } : null; }   // the molecular scale of a scene drawn at two scales
  // S5 label rules. Free exploration: every label at full size (overlaps are resolved by placement, never by shrinking
  // labels to unexplained numbers). During a step with many bodies: at most 4 full labels (the beat's, the recent and
  // the chain front first); a chain's other links shrink to their step numbers (the chain chip carries the key of what
  // each number is); every other label steps aside (hidden, not numbered). A label named by a beat or an event comes up
  // at once (<= 0.3 s) and stays at least its reading time.
  touchLabels(actors) { const R = this._recent || (this._recent = new Map()), now = this.dir ? this.dir.clock || 0 : 0; (actors || []).forEach(a => { if (!a || !a.name) return; const r = R.get(a.name); R.set(a.name, { t: now, min: r && now - r.t < r.min ? r.min : (this.dir ? this.dir.readTime(a.name) : 3) }); }); this._labT = -1; }
  labelRule(t) {
    if (this._labT != null && t - this._labT < .25) return; this._labT = t;
    const A = this.ds.actors, C = this.cues.chain, step = this.stage === 'explore' && this.running != null && this.dir.cinematic, on = step && (A.length > 4 || !!C);
    if (!on) { if (this._labOn) { this.pins.forEach(p => { this.setMini(p, false); p._quiet = false; }); this._labOn = false; } return; }
    this._labOn = true; const R = this._recent || (this._recent = new Map()), now = this.dir.clock || 0;
    const link = a => C ? C.links.findIndex(x => x.a === a) : -1;
    const score = (a, i) => { const pin = this.pins.get(a.name), r = R.get(a.name); return (pin && pin.classList.contains('hot') ? 1e7 : 0) + (C && C.front === a ? 5e6 : 0) + (r && now - r.t < r.min ? 1e6 : 0) + (a === this.lessonActor ? 5e5 : 0) + (r ? 1e3 + r.t : -i); };
    const full = new Set(A.map((a, i) => [a, score(a, i)]).sort((p, q) => q[1] - p[1]).slice(0, 4).map(x => x[0].name));
    this.pins.forEach((pin, name) => { const a = pin._actor; if (!a) return; const k = link(a); const isFull = full.has(name); this.setMini(pin, !isFull && k >= 0, k + 1); pin._quiet = !isFull && k < 0 && A.length > 4; });
  }
  setMini(pin, on, n) {
    if (on) { let s = pin._num; if (!s) { s = pin._num = el('span', { class: 'pin-num' }); pin.prepend(s); } const tx = String(n || ''); if (s.textContent !== tx) s.textContent = tx; }
    if (pin.classList.contains('mini') !== !!on) { pin.classList.toggle('mini', !!on); pin._w = 0; pin.title = on ? pin._actor && pin._actor.name : ''; }
  }
  highlightPins(actors) { if (actors && actors.length) this.touchLabels(actors); this._hot = actors; const on = actors && actors.length; this.labels.classList.toggle('dir-focus', !!on); this.pins.forEach(p => p.classList.toggle('hot', !!on && actors.includes(p._actor))); }
  refreshPins() { this.pins.forEach(p => p.remove()); this.pins.clear(); this.labels.querySelectorAll('.sym').forEach(p => p.remove()); this.ds.actors.forEach(a => this.ensurePin(a, false)); this.ds.symbols && this.ds.symbols.forEach(s => { const p = el('div', { class: 'pin sym in', mathLabel: s.text }); p._sym = s; this.labels.append(p); }); this.renderObjects(); }
  // ---------- HUD ----------
  buildHUD() {
    const u = this.ui;
    this.labels = el('div', { class: 'pins' }); u.append(this.labels);
    this.titleEl = el('div', { class: 'dio-brand' }, [el('div', { class: 'dio-title', mathLabel: this.title }), this.opts.subtitle ? el('div', { class: 'dio-sub', mathLabel: this.opts.subtitle }) : null]); u.append(this.titleEl);
    this.topBar = u.querySelector('.dio-actions');
    this.editBtn = el('button', { class: 'ibtn', title: 'Edit: select any object (E)', 'aria-label': 'Edit objects', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>', onclick: () => this.toggleEdit() });
    u.append(el('div', { class: 'dio-actions glass' }, [this.editBtn,
      el('button', { class: 'ibtn', title: 'Replay the drawing → real transition', 'aria-label': 'Replay transition', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h16v14H4z M4 15l5-4 4 3 3-2 4 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', onclick: () => this.replay() }),
      el('button', { class: 'ibtn', title: 'Restart the simulation', 'aria-label': 'Restart', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12a7 7 0 1 0 2-5M5 4v4h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>', onclick: () => { this.rebuild(); this.refreshPins(); } }),
      el('button', { class: 'ibtn', title: 'Leave the diorama (Esc)', 'aria-label': 'Close diorama', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.7"/></svg>', onclick: () => this.exit() })]));
    this.coach = el('div', { class: 'coach glass', hidden: true }); u.append(this.coach);
    // left panel
    this.lessonBox = el('div', { class: 'lessons' }); this.paramBox = el('div', { class: 'params' }); this.objBox = el('div', { class: 'objects' });
    const tabs = el('div', { class: 'tabs' }), sections = { Instructions: this.lessonBox, Variables: this.paramBox, Objects: this.objBox };
    const srcs = Array.isArray(this.spec.sources) ? this.spec.sources.filter(x => x && (x.title || x.doi)) : [];
    if (srcs.length) sections.Sources = el('div', { class: 'dio-sources' }, [el('p', { class: 'dim small', text: 'The laws and values this diorama is built on:' }), el('ol', {}, srcs.map(x => el('li', {}, [renderSource(x)])))]);
    Object.keys(sections).forEach((n, i) => { const b = el('button', { class: 'tab', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', text: n, 'data-t': n, onclick: () => { this.tab = n; b.classList.remove('ping'); tabs.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); Object.values(sections).forEach(s => s.hidden = true); sections[n].hidden = false; } }); tabs.append(b); if (i) sections[n].hidden = true; });
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
    u.append(el('div', { class: 'dio-time glass' }, [this.playBtn, this.clock, this.speedSel, el('span', { class: 'sep' }), tog('cinematic', 'Cinematic', 'Camera follows each step and event; explanations appear beside what they describe, and time slows while you read', true), tog('guides', 'Guides', 'Show arrows for motion and links between the objects an explanation names', false), this.calmBtn = el('button', { class: 'tog', title: 'Calm motion: rides become still views and zooms become cuts (also follows the system setting "reduce motion")', 'aria-pressed': String(this.prefs.motion === 'reduced'), text: 'Calm', onclick: () => { this.setPref('motion', this.prefs.motion === 'reduced' ? 'full' : 'reduced'); } }), this.paceSel]));
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
  setPref(k, v) { this.prefs[k] = v; savePrefs(this.prefs); if (k === 'motion' && this.calmBtn) { this.calmBtn.setAttribute('aria-pressed', String(v === 'reduced')); return; } this.ui && this.ui.querySelectorAll(`[data-pref="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(!!v))); if (this.dir) { if (k === 'cinematic') { this.dir.cinematic = v; if (!v) { this.dir.clear(); this.dir.endShots(); this.cues.reset(); } } if (k === 'guides') this.dir.guides = v; if (k === 'pace') this.dir.pace = v; } }
  // the model's own clock when it has one (e.g. "11:00 · day 1"), else simulated seconds
  clockText(t) { const s = this.ds.sim; if (s && s.clock) { try { const c = s.clock(t); if (c) return String(c); } catch (e) { } } return 't=' + (t ?? this.ds.t).toFixed(1) + ' s'; }
  syncTimeUI() { this.playBtn.innerHTML = this.ds.playing ? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>'; }
  onEvent(ev) {
    if (this.stage === 'sketch') return;
    // a step waiting for this event ends even if the same sentence was shown a moment ago
    const hit = this.running != null && this.runUntil && ((ev.id && ev.id.toLowerCase() === this.runUntil) || ev.text.toLowerCase().includes(this.runUntil));
    const now = performance.now(); this._seen = this._seen || new Map(); if (now - (this._seen.get(ev.text) || -1e9) < 4000) { if (hit) { if (this.dir.cinematic) this.awaitIdle = true; else this.runT = this.runDur; } return; } this._seen.set(ev.text, now);
    const named = this.namesIn(ev.text), host = named[0] || this.lessonActor;
    if (this.stage === 'explore') { this.touchLabels(named.length ? named : [host]); this.cues.chainEvent(ev); }   // S5.1: the label comes up with its event; S1: chainOn steps the front
    // during a step, events about objects the step doesn't mention don't take the camera (they go to the ticker)
    const L = this.running != null ? this.lessons()[this.running] : null, lt0 = L ? ((L.title || '') + ' ' + (L.text || '')).toLowerCase() : '';
    const offTopic = L && host && host !== this.lessonActor && !lt0.includes(host.name.split(' · ')[0].toLowerCase());
    // one callout per kind of event: per step while a step runs, once per visit while exploring freely; after the awaited event, the ticker only
    const evKey = Director.evKey(ev.text), keys = this.running != null ? (this._stepKeys = this._stepKeys || new Set()) : (this._freeKeys = this._freeKeys || new Set());
    const repeat = keys.has(evKey); keys.add(evKey);
    if (this.dir.cinematic && this.stage === 'explore' && !offTopic && !repeat && !this.awaitIdle) {
      // a model may name the best shot for an event (DIO.<type>.shots: lowercase text substring → {target, dist})
      const shots = (DIO[this.spec.type] && DIO[this.spec.type].shots) || this.spec.shots || {}, lt = ev.text.toLowerCase();
      const key = Object.keys(shots).find(k => lt.includes(k)), shot = key && shots[key];
      const flows = (DIO[this.spec.type] && DIO[this.spec.type].flows) || this.spec.flows || {}, fk = Object.keys(flows).find(k => lt.includes(k));
      const tg = shot && shot.target, pos0 = tg ? (typeof tg === 'function' ? tg() : tg) : null, pos = pos0 ? (pos0.isVector3 ? pos0.clone() : new THREE.Vector3().fromArray(pos0)) : ev.pos ? ev.pos.clone() : null;
      this.dir.push({ kind: 'event', text: ev.text, anchor: () => pos || (host ? host.getPos() : null), focus: host && host.obj, names: named.filter(a => a !== host), host, dist: shot && shot.dist, flows: fk ? flows[fk] : null, evKey });
    }
    this.pushDyn(ev);   // every change is listed under Variables → Dynamic changes (the old top-of-screen ticker is gone)
    // sound, placed left/right where the event happens
    if (this.app.sfx && this.stage === 'explore') { let sx = .5; if (ev.pos) { const q = ev.pos.clone().project(this.camera); sx = q.x * .5 + .5; } this._sndT = this._sndT || new Map(); if (now - (this._sndT.get(evKey) || -1e9) > 3000) { this._sndT.set(evKey, now); if (ev.sound) this.app.sfx.play(ev.sound, { x: sx }); else this.app.sfx.forEvent(ev.text, sx); } }
    this.evlog.prepend(el('li', { html: esc(this.clockText(ev.t)) + ' · ' + mathHTML(ev.text, 'label') })); while (this.evlog.children.length > 40) this.evlog.lastChild.remove();
    if (ev.pos && !this.spec.noMarkers) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('255,200,120'), color: ev.color || 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.copy(ev.pos); s.scale.setScalar(.3); this.scene.add(s); this.flashes.push({ s, a: 0 }); }
    if (this.running != null && this.runUntil && (ev.id && ev.id.toLowerCase() === this.runUntil || ev.text.toLowerCase().includes(this.runUntil))) { if (this.dir.cinematic) { if (!this.awaitIdle) this.awaitT = 0; this.awaitIdle = true; } else this.runT = this.runDur; }
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
    if (document.querySelector('.modal-veil')) return;   // a dialog is open (replace, add, ask AI): Esc must not leave the diorama behind it
    if (this.stage === 'tour' && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ')) { e.preventDefault(); this.next(); }
    else if (this.stage === 'tour' && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); this.prev(); }
    else if (e.key === 'Escape') { if (this.pov) this.exitPOV(false, true); else if (this.sel) this.deselect(); else this.exit(); }
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
    if (o && o !== this.sel) this.app.sfx && this.app.sfx.play('tick', { gain: .6 });
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
  overrideOf(o) { this.spec.overrides = this.spec.overrides || {}; if (!isSceneSpec(this.spec)) this.spec.ovV = 2; const p = this.ds.pathOf(o); return (this.spec.overrides[p] = this.spec.overrides[p] || {}); }
  bodySpecOf(o) { if (o.userData.bodyId && isSceneSpec(this.spec)) return (this.spec.bodies || []).find(b => b.id === o.userData.bodyId); if (o.userData.added) return (this.spec.additions || [])[this.ds.extras.children.indexOf(o)]; return null; }
  commitTransform() {
    this.app.sfx && this.app.sfx.play('wood', { gain: .45, pitch: 1.3 });
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
      this.rebuild(); this.refreshPins(); this.renderObjects(); this.renderParams(); this.save(); toast('Undone: ' + (u.label || 'change'));
    }
  }
  editAction(kind, o = this.sel) {
    if (!o) return; const b = this.bodySpecOf(o); this.snapshot(kind);
    if (kind === 'hide') { const h = !o.userData.hiddenByUser; if (b) { b.hidden = h; } else { this.overrideOf(o).hidden = h; } o.userData.hiddenByUser = h; o.visible = !h; if (!h) { const it = (this.ds.ovList || []).find(x => x.o === o); if (it) it.e.hidden = false; } this.renderEditBar(); this.renderObjects(); toast(h ? 'Hidden' : 'Shown'); }
    if (kind === 'remove') {
      if (b && isSceneSpec(this.spec) && o.userData.bodyId) { this.spec.bodies = this.spec.bodies.filter(x => x !== b); this.spec.tour = (this.spec.tour || []).filter(id => id !== b.id); }
      else if (b && o.userData.added) this.spec.additions.splice(this.spec.additions.indexOf(b), 1);
      else this.overrideOf(o).removed = true;
      this.deselect(); this.rebuild(); this.refreshPins(); toast('Removed');
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
        box.remove(); this.deselect(); this.rebuild(); this.refreshPins(); this.save(); toast('Replaced');
      } })])])]);
    document.body.append(box);
  }
  addObjectDialog() {
    const kind = el('select', { class: 'field', 'aria-label': 'Shape' }, SHAPES.map(s => el('option', { text: s }))), mat = el('select', { class: 'field', 'aria-label': 'Material' }, PRESETS.map(s => el('option', { text: s }))), name = el('input', { class: 'field', type: 'text', value: '', placeholder: 'Name (optional)' }), actor = el('input', { type: 'checkbox' });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [el('h3', { text: 'Add an object' }), el('label', { text: 'Shape' }), kind, el('label', { text: 'Material' }), mat, el('label', { text: 'Name' }), name, el('label', { class: 'row' }, [actor, ' Significant body (gets a pinned name)']),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), el('button', { class: 'btn primary', text: 'Add', onclick: () => {
        const c = this.controls.target, b = { id: 'add-' + uid(), name: name.value || kind.value, label: name.value || kind.value, role: actor.checked ? 'actor' : 'decor', shape: { kind: kind.value }, material: { preset: mat.value }, position: [+c.x.toFixed(2), Math.max(0, +c.y.toFixed(2) - 1), +c.z.toFixed(2)] };
        this.snapshot('add object'); if (isSceneSpec(this.spec)) { this.spec.bodies.push(b); if (actor.checked) this.spec.tour = (this.spec.tour || []).concat(b.id); } else this.spec.additions = (this.spec.additions || []).concat(b);
        box.remove(); this.rebuild(); this.refreshPins(); this.save(); toast('Added. Select it to move it');
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
    this.controls.enabled = false; this.rebuild(); this.lessonI = 0; this._auto = null; this.start();
  }
  exit() { const f = this.opts.onExit; this.dispose(); if (f) f(); }
  // ---------- frame ----------
  update(dt, t) {
    const ds = this.ds;
    if (this._needRebuild) { this._needRebuild = false; this.rebuild(); this.refreshPins(); }
    if (this.stage === 'materialize') { this.tm += dt; const k = Math.min(1, this.tm / this.tmDur); this.mat.setProgress(k); if (k >= 1) this.endMaterialize(); }
    if (this.fly) { const f = this.fly; f.k = Math.min(1, f.k + dt / f.dur); const e = easeInOutQuint(f.k); this.controls.target.lerpVectors(f.from.t, f.to.t, e); this.camera.position.lerpVectors(f.from.p, f.to.p, e); this.camera.position.y += Math.sin(Math.PI * e) * f.lift; this.camera.lookAt(this.controls.target); if (f.k >= 1) { this.fly = null; this.controls.enabled = this.stage !== 'materialize' && this.stage !== 'sketch'; } }
    else if (this.pov) this.updatePOV(dt);
    else if (this.controls.enabled) this.controls.update();
    this.cues.preStep(); ds.step(this.stage === 'sketch' ? 0 : dt * this.dir.timeScale);
    if (this.awaitIdle) { this.awaitT = (this.awaitT || 0) + dt; if ((this.dir.idle() && !this.dir.busy()) || this.awaitT > 15) { this.awaitIdle = false; this.runT = this.runDur; } }
    if (this.running != null) { if (!this.awaitIdle) this.runT += dt * ds.speed * this.dir.timeScale; if (this.runBar) this.runBar.style.width = Math.min(100, this.runT / this.runDur * 100) + '%'; if (this.runT >= this.runDur) { this._busyT = this.dir.busy() ? (this._busyT || 0) + dt : 0; if (this._busyT === 0 || this._busyT > 12) { this._busyT = 0; this.completeLesson(); } } }   // a zoom, ride or bracket still on its way finishes first (at most 12 s more)
    this.flashes = this.flashes.filter(f => { f.a += dt; f.s.scale.setScalar(.3 + f.a * 2.4); f.s.material.opacity = Math.max(0, 1 - f.a / 1.1); if (f.a > 1.1) { f.s.removeFromParent(); f.s.material.dispose(); return false; } return true; });
    // pins
    const w = innerWidth, h = innerHeight, v = V3();
    this.dir.update(dt, this.camera, w, h);
    this.comfort(dt); this.cues.update(dt); this.inset.update(dt); this.labelRule(t);
    // the opening overview framed in the free part of the screen (not under the instruction panel), once the panel and the
    // readouts are laid out (second frame) and nothing else moves the camera
    if (this._wideFix && this.stage === 'explore' && !this.fly && !this.pov && this.running == null && !this.dir.move && !this.dir.dip && this.controls.enabled) { if (--this._wideFix === 0) { const k = this.dir.wideKey(); this.controls.target.copy(k.target); this.camera.position.copy(k.pos); this.camera.lookAt(k.target); this.controls.update(); } }
    // labels: project, then place in priority order (the step's objects first) so they never sit on each other,
    // and fade any label that would land under the instruction panel or the readouts
    // panels are measured every 0.5 s (cheap); the callout moves every frame, so its drawn box is added fresh each frame
    if (!this._pr || t - this._pr > .5) { this._pr = t; const insB = this.inset && this.inset.box && !this.inset.box.hidden && +this.inset.box.style.opacity > .05 ? this.inset.box : null; this._block = [this.panel, this.readPanel, this.titleEl, this.povBar, this.editBar, insB, this.dir.chipEl, this.cues.chip, this.ui.querySelector('.dio-time')].filter(P => P && !P.hidden && P.style.visibility !== 'hidden' && !(P === this.panel && P.classList.contains('folded'))).map(P => P.getBoundingClientRect()).filter(r => r.width > 0); const hr = this.labels.getBoundingClientRect(); this._bo = [hr.left, hr.top]; this.labels.childNodes.forEach(p => { p._w = 0; }); }
    const cb = this.dir.beat && this.dir.beat.box, blocks = cb ? (this._block || []).concat({ left: cb[0] + this._bo[0], top: cb[1] + this._bo[1], width: cb[2], height: cb[3] }) : (this._block || []);   // re-measure widths: labels grow/shrink (full label ↔ numbered dot), so a stale width let them overflow the right edge
    const placed = [], items = [], vis = (p, x) => { if (p._vis !== x) { p._vis = x; p.style.visibility = x; } };   // style writes only when something changed
    this.labels.childNodes.forEach(pin => {
      const src = pin._actor ? pin._actor.getPos() : pin._sym ? (() => { try { return pin._sym.getPos(); } catch (e) { return null; } })() : null;
      if (!src || this.stage === 'sketch' || this.stage === 'materialize' || pin._quiet) { vis(pin, 'hidden'); return; }
      v.copy(src).project(this.camera); if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02 || (this.pov && pin._actor === this.pov.a)) { vis(pin, 'hidden'); return; }   // off-screen (or the actor you ride): no label pinned to the frame edge
      if (!pin._w) pin._w = pin.offsetWidth;
      items.push({ pin, x: clamp((v.x * .5 + .5) * w, 10, w - (pin._w || 120) - 10), y: clamp((-v.y * .5 + .5) * h, 22, h - 22), pr: (pin.classList.contains('hot') ? 4 : 0) + (pin.classList.contains('focus') ? 2 : 0) + (pin._actor ? 1 : 0) });
    });
    items.sort((a, b) => b.pr - a.pr);
    for (const it of items) {
      const W0 = it.pin._w || 120, H0 = 28; let y = it.y, ok = false;
      for (let k = 0; k < 4 && !ok; k++) { const hit = placed.find(q => it.x < q.x + q.w && it.x + W0 > q.x && y - H0 / 2 < q.y + q.h / 2 && y + H0 / 2 > q.y - q.h / 2); if (!hit) ok = true; else y = hit.y + (y >= hit.y ? H0 : -H0); }
      if (y < 14 || y > h - 14) ok = false;   // pushed off the screen by the collision step: hide it rather than pin it outside
      const under = blocks.some(r => { const rx = r.left - this._bo[0], ry = r.top - this._bo[1]; return it.x + W0 > rx + 2 && it.x < rx + r.width - 2 && y + H0 / 2 > ry + 2 && y - H0 / 2 < ry + r.height - 2; });   // the whole label, not just its dot
      vis(it.pin, ok && !under ? 'visible' : 'hidden');
      if (ok && !under) { placed.push({ x: it.x, y, w: W0, h: H0 }); const tf = `translate(${it.x.toFixed(1)}px,${y.toFixed(1)}px)`; if (it.pin._tf !== tf) { it.pin._tf = tf; it.pin.style.transform = tf; } }
    }
    // weather you can hear: rain follows the model's rain (its own weather() if it has one, else any visible 'rain' object's opacity)
    if (this.app.sfx && (!this._wt || t - this._wt > .5)) { this._wt = t; let rain = 0, wind = 0;
      try { const W = ds.sim && ds.sim.weather && ds.sim.weather(); if (W) { rain = +W.rain || 0; wind = +W.wind || 0; } else { if (!this._rainObjs || t - (this._rainScan || 0) > 4) { this._rainScan = t; this._rainObjs = []; ds.world.traverse(o => { if (/rain/i.test(o.name || '') && o.material && !o.isGroup) this._rainObjs.push(o); }); }
        this._rainObjs.forEach(o => { let vis = o.visible, q = o.parent; while (vis && q) { vis = q.visible; q = q.parent; } if (vis) rain = Math.max(rain, [].concat(o.material)[0].opacity ?? 1); }); } } catch (e) { }
      this.app.sfx.setRain(Math.min(1, rain)); if (wind) this.app.sfx.setWind(Math.min(1, wind)); }
    if (!this._rt || t - this._rt > .15) { this._rt = t; this.clock.textContent = this.clockText(); const rd0 = ds.readouts(), F = this.readFocus; let rd = rd0;
      if (F) { const rel = rd0.filter(([k]) => { const w = String(k).toLowerCase().split(/[^a-zα-ωₐ-ₜ0-9]+/).filter(x => x.length > 2); return w.some(x => F.includes(x)); }); rd = (rel.length ? rel : rd0).slice(0, 6); }
      else if (!this.prefs.readsAll) rd = rd0.slice(0, 6);
      this.readMore.hidden = rd0.length <= 6 || !!F; this.readMore.textContent = this.prefs.readsAll ? 'Fewer readouts ▴' : `All ${rd0.length} readouts ▾`; this.readPanel.classList.toggle('full', !!this.prefs.readsAll && !F);
      this.reads.innerHTML = rd.map(([k, v]) => `<span><em>${mathHTML(k, 'label')}</em> ${mathHTML(v, 'label')}</span>`).join(''); if (rd.length !== this._rdN || !!F !== this._rdF) { this._rdN = rd.length; this._rdF = !!F; this._pr = 0; } /* the readouts changed size: labels re-test against them now */ this.drawSpark(); { const hid = this.stage === 'sketch' || this.stage === 'materialize' || (!rd.length && !ds.series.length); if (hid !== this.readPanel.hidden) { this.readPanel.hidden = hid; this._pr = 0; } } }   // (labels re-test against it at once)
  }
  // S6.2 comfort vignette: while a POV ride or a moving shot turns the camera faster than 30°/s (or a POV moves faster
  // than 3 actor sizes per second), the periphery darkens, at most 0.55; a cut (a jump) never counts
  comfort(dt) {
    const c = this.camera; if (!this._cq) { this._cq = c.quaternion.clone(); this._cp = c.position.clone(); }
    let g = 0; const moving = this.pov || this.dir.busy() || this.dir.move;
    if (dt > 0 && moving && this.dir.cinematic) { const om = this._cq.angleTo(c.quaternion) / dt * 57.2958, lin = this._cp.distanceTo(c.position) / dt; this.omega = om;
      if (om < 400) g = clamp((om - 30) / 60, 0, .55); const sz = this.pov ? Math.max(.05, this.pov.size) : 0; if (sz && lin > 3 * sz && lin < sz * 200) g = Math.max(g, clamp((lin / (3 * sz) - 1) * .25, 0, .55)); }
    this.cues.vigGoal = g; this._cq.copy(c.quaternion); this._cp.copy(c.position);
  }
  drawSpark() {
    const c = this.spark, g = c.getContext('2d'), ds = this.ds; g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(244,239,230,.55)'; g.font = '20px IBM Plex Mono, monospace'; g.textAlign = 'left'; canvasMath(g, ds.seriesName || '', 8, 22);
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
    if (this.dir) this.dir.dispose(); if (this.cues) this.cues.dispose(); if (this.inset) this.inset.dispose(); this.gfx.canvas.removeEventListener('wheel', this.onWheel); removeEventListener('keydown', this.onKey);
    this.gfx.canvas.removeEventListener('pointerdown', this.onPointerDown); this.gfx.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose(); if (this.tc) { this.tc.detach(); this.tc.dispose(); }
    this.gfx.outline.selectedObjects = []; this.gfx.outline.enabled = false; this.gfx.canvas.classList.remove('editing');
    this.ui.remove(); this.disposed = true;
  }
  // GPU resources: called by the app once the next place has rendered (main.js retire), so shared shader programs stay compiled
  disposeGPU() { if (this.gpuFreed) return; this.gpuFreed = true; const keep = this.app.mode && this.app.mode !== this ? this.app.mode.scene : null; const set = gpuSet([this.scene, this.tcHelper].filter(Boolean)); disposeTree(set, keep); }   // like ds.dispose(), plus textures and the gizmo, minus anything the next place still shows
}

// Off-screen sketch renderer: the drawing as an image (scroll illustrations, pedestal previews).
const sketchCache = new Map();
// opts.focusText: render a "stage plate" instead of the overview — the camera frames only the bodies the text names,
// and each is marked with a coloured number and a legend, so a repeated diorama is shown for a different purpose.
const STAGE_COLORS = ['#d1495b', '#2e86ab', '#e9a03b', '#3f7d6e', '#7b4b94'];
const STOP = new Set(['the', 'and', 'with', 'from', 'into', 'that', 'this', 'than', 'over', 'under', 'glass', 'their', 'about']);
const toks = t => String(t || '').toLowerCase().replace(/[^a-z0-9α-ω ]+/g, ' ').split(/\s+/).filter(x => x.length > 3 && !STOP.has(x));
// whole words only: 'column' alone no longer pulls in 'mercury column'
export function matchActors(actors, text) {
  const T = new Set(toks(text)); const full = String(text || '').toLowerCase();
  return actors.map(a => { const n = a.name.split(' · ')[0].toLowerCase(); const ts = toks(n); const word = x => T.has(x) || T.has(x + 's') || T.has(x.replace(/s$/, '')); const hit = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(full) ? 10 : ts.length && ts.every(word) ? ts.length : 0; return { a, hit }; }).filter(x => x.hit > 0).sort((p, q) => q.hit - p.hit).map(x => x.a).slice(0, 5);
}
// The teaching subject of a diorama, for the drawing's framing (the same rule as the room's pedestal minis): the actors'
// boxes (leaving out any actor 8 × larger than the median actor, a ground) mark the focus; a mesh belongs to the subject
// when its centre lies within that box grown by 30 % and it is at most 2.2 × the box's extent; lines (orbits, rays,
// traces) when they lie within the box grown by its extent. Without actors: the meshes within 1.6 × the 80th-percentile
// distance of all mesh centres from their median centre. Everything else (ground planes, hills, rings of trees, rocks
// round the field) is scenery. Returns { box, hide } in world coordinates; box is what the drawing frames.
function sketchSubject(ds) {
  const roots = [ds.world, ds.extras], items = [], lines = [], sizeOf = b => Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y);
  roots.forEach(r => r.updateMatrixWorld(true));
  roots.forEach(r => r.traverse(o => { if (!o.visible || o.userData.isInk || !o.geometry) return; const b = new THREE.Box3().setFromObject(o); if (b.isEmpty() || !isFinite(b.min.x)) return;
    if (o.isMesh && sizeOf(b) >= 1e-4) items.push({ o, b, c: b.getCenter(V3()), size: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) }); else if (o.isLine || o.isSprite || o.isPoints) lines.push({ o, b }); }));
  const ab = []; (ds.actors || []).forEach(a => { try { if (a.obj && a.obj.isObject3D) { const b = new THREE.Box3().setFromObject(a.obj); if (!b.isEmpty() && isFinite(b.min.x)) ab.push(b); } else { const q = a.getPos && a.getPos(); if (q && isFinite(q.x)) ab.push(new THREE.Box3(q.clone(), q.clone())); } } catch (e) { } });
  const focus = new THREE.Box3(), keep = new Set();
  if (ab.length) { const sz = ab.map(sizeOf).filter(s => s > 1e-3).sort((x, y) => x - y), ms = sz.length ? sz[sz.length >> 1] : .05; ab.forEach(b => { if (sizeOf(b) <= 8 * Math.max(ms, .05)) focus.union(b); }); }   // (symbol pins are points: they mark the focus but do not set the median)
  let ext = 1;
  if (!focus.isEmpty()) {
    const fs = focus.getSize(V3()), fc = focus.getCenter(V3()); ext = Math.max(fs.x, fs.y, fs.z, .3);
    items.forEach(it => { if (Math.abs(it.c.x - fc.x) <= fs.x / 2 + .3 * ext && Math.abs(it.c.z - fc.z) <= fs.z / 2 + .3 * ext && Math.abs(it.c.y - fc.y) <= fs.y / 2 + .6 * ext && it.size <= 2.2 * ext) keep.add(it.o); });
  } else if (items.length) {
    const med = k => { const v = items.map(it => it.c[k]).sort((x, y) => x - y); return v[v.length >> 1]; }, m = V3(med('x'), med('y'), med('z'));
    items.forEach(it => { it.d = Math.hypot(it.c.x - m.x, it.c.z - m.z); });
    const d2 = items.map(it => it.d).sort((x, y) => x - y), szm = items.map(it => it.size).sort((x, y) => x - y)[items.length >> 1], R = Math.max(.05, szm * .5, d2[Math.min(d2.length - 1, Math.floor(d2.length * .8))]);
    items.forEach(it => { if (it.d <= 1.6 * R + .05 && it.size <= 4 * Math.max(R, szm, .25)) keep.add(it.o); });
    ext = Math.max(R, .3);
  }
  if (!keep.size) items.forEach(it => keep.add(it.o));
  const box = new THREE.Box3(); items.forEach(it => { if (keep.has(it.o)) box.union(it.b); });
  if (box.isEmpty()) return null;
  // a kept mesh's ancestors and descendants stay visible; scenery is hidden at its top-most hidden node
  const hide = items.filter(it => !keep.has(it.o)).map(it => it.o).filter(o => { let k = false; o.traverse(q => { if (q !== o && keep.has(q)) k = true; }); return !k; });
  const grow = box.clone().expandByScalar(ext);
  lines.forEach(L => { if (grow.containsBox(L.b)) { if (L.o.isLine) box.union(L.b); } else hide.push(L.o); });
  return { box, hide };
}
export async function renderSketch(gfx, spec, w = 800, h = 500, opts = {}) {
  const key = JSON.stringify([spec.type, spec.technique, spec.params, spec.bodies && spec.bodies.length, spec.title, spec.code && spec.code.length, spec.overrides, spec.additions, opts.focusText || '', opts.label || '']);
  if (sketchCache.has(key)) return sketchCache.get(key);
  const ds = new DioramaScene(gfx, spec, { headless: true });
  ds.step(0);
  // the overview frames the subject (sketchSubject): its outlines are as thick as the subject is large, not the world
  // (a landscape's radius made 30 cm hulls round a lever)
  const subj = opts.focusText ? null : sketchSubject(ds), inkR = subj ? Math.max(.5, subj.box.getSize(V3()).length() * .5) : ds.radius;
  addInk(ds.world, ds.U); addInk(ds.extras, ds.U); addOutlines(ds.world, ds.U, inkR * .005); addOutlines(ds.extras, ds.U, inkR * .005);
  const cam = new THREE.PerspectiveCamera(40, w / h, .1, 400);
  // a stage plate shows the step's own state: let the model settle under the step's settings first (≈4 s of model time)
  if (opts.focusText) { const pl = ds.playing; ds.playing = true; try { const t0 = performance.now(); for (let k = 0; k < 96 && performance.now() - t0 < 8000; k++) ds.step(.5); } catch (e) { } ds.playing = pl; }   // a fixed 48 model-seconds (the time cap only guards a runaway model)   // ≈48 model-seconds: slow processes (crystals, levels) reach the step's state
  let endKey = ds.overviewKey(), focus = [], fc = ds.center, fr = ds.radius;
  if (opts.focusText) {
    focus = matchActors(ds.actors, opts.focusText);
    { const seenO = new Set(); focus = focus.filter(a => { const k = a.obj || a.name; if (seenO.has(k)) return false; seenO.add(k); return true; }); }   // one marker per mesh
    const bx = new THREE.Box3(); focus.forEach(a => { if (a.obj) bx.expandByObject(a.obj); else { const p = a.getPos && a.getPos(); if (p) bx.expandByPoint(p); } });
    if (!bx.isEmpty()) { fc = bx.getCenter(V3()); fr = clamp(bx.getSize(V3()).length() * .62, ds.radius * .22, ds.radius); }
  }
  if (opts.focusText && !focus.length) { disposeTree(ds.scene, gfx.scene); sketchCache.set(key, null); return null; }
  const m = new Materializer({ scene: ds.scene, camera: cam, world: ds.world, U: ds.U, technique: spec.technique || spec.style || 'card', endKey, center: fc, radius: fr, env: ds.env });
  m.setProgress(0); ds.step(0); m.setProgress(0);
  const paper = new THREE.Color('#efe9dc'); const keepBg = ds.scene.background, keepFog = ds.scene.fog; ds.scene.background = paper; ds.scene.fog = null;
  ds.scene.traverse(o => { if (o.isPoints || (o.userData.decorBase)) o.visible = false; });
  // the overview drawing frames the teaching subject, not the whole world: scenery is left out and the subject's box
  // fills ~76 % of the card (the larger of its height and its width over the aspect), seen along the technique's own
  // drawing direction and lens
  if (!opts.focusText) {
    const S = subj;
    if (S) {
      S.hide.forEach(o => { o.visible = false; }); ((ds.env && ds.env.bgObjects) || []).forEach(o => { o.visible = false; });
      const fk = m.flatKey, dir = fk.dir.clone().normalize(), up0 = Math.abs(dir.y) > .95 ? V3(0, 0, -1) : V3(0, 1, 0), right = up0.clone().cross(dir).normalize(), up = dir.clone().cross(right).normalize();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; const b = S.box;
      for (let k = 0; k < 8; k++) { const p = V3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z), x = p.dot(right), y = p.dot(up), z = p.dot(dir); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      // the title strip covers the bottom 44 px: the subject is fitted to, and centred in, the area above it
      const hu = h - 44, FILL = .76, useH = Math.max(y1 - y0, (x1 - x0) * hu / w, .05) / FILL, fullH = useH * h / hu, th = Math.tan(fk.fov * Math.PI / 360), dist = fullH / 2 / th;
      const tgt = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2 - fullH * 22 / h).addScaledVector(dir, (z0 + z1) / 2);
      cam.fov = fk.fov; cam.up.copy(up0); cam.position.copy(tgt).addScaledVector(dir, dist); cam.lookAt(tgt);
      const depth = Math.max(z1 - z0, .1); cam.near = Math.max(.01, dist - depth * 2); cam.far = dist + depth * 2 + 1; cam.updateProjectionMatrix();
    }
  }
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
    // markers on (nearly) the same spot become one marker naming both, so circles never nest
    for (let i = 0; i < pts.length; i++) for (let j = pts.length - 1; j > i; j--) { const P = pts[i], Q = pts[j]; if (Math.hypot(P.x - Q.x, P.y - Q.y) < Math.max(P.rr, Q.rr) * .55) { const big = P.rr >= Q.rr ? P : Q, small = big === P ? Q : P; big.alias = (big.alias || []).concat(small.a.name.split(' · ')[0], small.alias || []); pts.splice(pts.indexOf(small), 1); if (small === P) { i--; break; } } }
    // badges in a column on the side with more room, spaced so they never overlap; leader lines to each part
    const side = pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length) < w / 2 ? 1 : -1, colX = side > 0 ? Math.min(w - 50, Math.max(...pts.map(p => p.x + p.rr)) + 60) : Math.max(50, Math.min(...pts.map(p => p.x - p.rr)) - 60);
    pts.sort((p, q) => p.y - q.y); let lastY = -1e9; pts.forEach((p, n) => { p.by = clamp(Math.max(p.y, lastY + 34), 60, h - 60); lastY = p.by; p.i = n; });   // numbered top to bottom, no gaps
    pts.forEach(({ a, i, x, y, rr, by, alias }) => {
      const col = STAGE_COLORS[i % STAGE_COLORS.length], bx = colX;
      g.strokeStyle = col; g.lineWidth = 2.5; g.globalAlpha = .9; g.setLineDash([]); g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      const ex = x + side * rr * .8, ey = y + (by - y) * .2; g.beginPath(); g.moveTo(ex, ey); g.lineTo(bx - side * 14, by); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(bx, by, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 14px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), bx, by + 1);
      legend.push([col, i + 1, a.name.split(' · ')[0] + (alias && alias.length ? ' · ' + alias.join(' · ') : '')]);
    });
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '14px "IBM Plex Mono", monospace';
    const lw = Math.min(w * .55, 26 + Math.max(...legend.map(l => g.measureText(l[2]).width)) + 40);
    g.fillStyle = 'rgba(250,246,236,.92)'; g.fillRect(24, 24, lw, 18 + legend.length * 24); g.strokeStyle = 'rgba(29,28,25,.4)'; g.lineWidth = 1; g.strokeRect(24, 24, lw, 18 + legend.length * 24);
    legend.forEach(([col, n, name], i) => { g.fillStyle = col; g.beginPath(); g.arc(42, 42 + i * 24, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 11px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText(n, 42, 46 + i * 24); g.textAlign = 'left'; g.fillStyle = '#1d1c19'; g.font = '14px "IBM Plex Mono", monospace'; canvasMath(g, name.slice(0, 40), 58, 47 + i * 24); });
  }
  // drafting chrome: border, corner marks, title block
  g.strokeStyle = 'rgba(29,28,25,.75)'; g.lineWidth = 1.5; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#e85d04'; [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([x, y]) => { g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 1, y - 6, 2, 12); });
  // title block on an opaque strip; both labels fitted with an ellipsis so they never run into each other
  g.font = '13px "IBM Plex Mono", monospace'; g.textAlign = 'left';
  const fit = (t, max) => { t = String(t); if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
  const L0 = mathText(spec.title || spec.type).toUpperCase(), R0 = focus.length ? 'STAGE · ' + mathText(opts.label || '').toUpperCase() : (spec.technique || spec.style || 'card').toUpperCase() + ' · DRAWING';
  const avail = w - 52 - 24, lW = Math.min(g.measureText(L0).width, avail * .5), Lt = fit(L0, lW), Rt = fit(R0, avail - g.measureText(Lt).width);
  g.fillStyle = 'rgba(239,233,220,.94)'; g.fillRect(15, h - 44, w - 30, 29); g.strokeStyle = 'rgba(29,28,25,.35)'; g.beginPath(); g.moveTo(15, h - 44); g.lineTo(w - 15, h - 44); g.stroke();
  g.fillStyle = 'rgba(29,28,25,.85)'; g.fillText(Lt, 26, h - 25); g.textAlign = 'right'; g.fillText(Rt, w - 26, h - 25);
  rt.dispose(); ds.scene.background = keepBg; ds.scene.fog = keepFog; disposeTree(ds.scene, gfx.scene);   // like ds.dispose(), plus its textures (labels, canvases); the scene on screen keeps what it shares
  const url = c.toDataURL('image/jpeg', .86); sketchCache.set(key, url); return url;
}
