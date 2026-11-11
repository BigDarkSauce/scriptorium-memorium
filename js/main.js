// Scriptorium Memorialium — boot, mode switching (library hub ↔ book room ↔ diorama), persistence, import/export.
import { Gfx } from './gfx/renderer.js';
import { detectQuality, scansReady } from './gfx/aaa.js';
import { BAKE } from './gfx/textures.js';
import * as store from './store.js';
import * as ingest from './ai/ingest.js';
import { initAI } from './ai/claude.js';
import { initEvidence } from './ai/evidence.js';
import { Hub } from './hub/hub.js';
import { BookRoom } from './room/room.js';
import { DioramaView } from './dio/engine.js';
import { normalizeChain } from './room/reader.js';
import { openAddPdf, offerResume, cancelJobFor } from './room/addpdf.js';
import { legacyScrolls } from './seeds-legacy.js';
import { FLAGSHIPS } from './seeds-scenes.js';
import { sceneFp, sceneKey, isSeedCopy } from './seeds-version.js';
import { SEED_LESSON_TITLES } from './seeds-history.js';
import { groundChain } from './seeds-sources.js';
import { applyAxes } from './seeds-axes.js';
import { DOMAIN_BOOK, DOMAIN_BOOK_VERSION } from './seeds-domains.js';
import { sfx } from './audio.js';
import { SCENE_SPEC, BUILTIN_TYPES, DIAGRAM_TYPES, CHAIN_FORMAT, chapterPrompt, authorPrompt, splitPrompt } from './ai/prompts.js';
import { el, $, uid, toast, toastAction, sleep, clamp, disposeTree } from './util.js';
import { installBVH, BVH } from './gfx/bvh.js';
import { parseHash, formatHash } from './route.js';
import { preloadKit, kitStatus } from './hub/kit.js';
import { caseLayout, caseTierOrder, hangSlots } from './hub/props.js';
import { lookQ, flyPose, flightDur, easeSine } from './camfly.js';
import { TitleScreen } from './title.js';
import { openGetScroll, openVisibility, republishLater } from './share.js';
import { choosePlace } from './room/addpdf.js';
import * as THREE from 'three';

// boot and switch phases on the performance timeline (DevTools, tools/: performance.getEntriesByType('mark'))
const mark = n => { try { performance.mark(n); } catch (e) { } };
const LIB_KEY = 'library.v3', PENDING_DEL = 'sm-pending-deletes', UNDO_MS = 9000;
// the version of the built-in scenes this code ships: an example room stamped with another one is brought up to date
// once (App.refreshSeedScenes)
const SEED_STAMP = FLAGSHIPS.map(sceneFp).join('.') + '.L' + FLAGSHIPS.map(f => JSON.stringify(f.lessons || []).length).join('-');   /* the steps too: a scene whose steps were rewritten refreshes them */
class App {
  constructor() {
    this.canvas = $('#scene'); this.ui = $('#ui'); this.store = store; this.ingest = ingest;
    try { this.gfx = new Gfx(this.canvas); } catch (e) { this.fatal('WebGL is not available in this browser: ' + e.message); throw e; }
    this.mode = null; this.last = performance.now(); this.t = 0; this.trash = []; this._swTok = 0;
    this.gfx.onRestore = () => { toast('Graphics restored'); this.restoreMode(); };
    initAI(); initEvidence();
    // sound: one speaker button, a soft click for every button, ambience per place
    this.sfx = sfx; document.body.append(sfx.button());
    this.qualityControl();
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button, .btn, [role=button], summary'); if (b && !b.classList.contains('sound-btn')) sfx.play('click', { gain: .6 }); }, true);
  }
  // Graphics quality (renderer.js: 'low' | 'medium' | 'high'). "auto" keeps the detected level and the automatic step-
  // down when frames stay slow; picking a level pins it (localStorage 'sm-gfx-quality'). A step-down taken later still
  // shows up here (gfx.onQuality), marked "(auto)". The control: a round button under the speaker, opening a small card.
  qualityControl() {
    const G = this.gfx, KEY = 'sm-gfx-quality', names = { low: 'Low', medium: 'Medium', high: 'High' };
    let pref = 'auto'; try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { }
    let byUser = false, autoSet = pref === 'auto';
    if (pref !== 'auto' && G.qualityLevels.includes(pref)) { byUser = true; G.setQuality(pref); byUser = false; }
    const btn = el('button', { class: 'gfx-btn glass', type: 'button', title: 'Graphics quality', 'aria-haspopup': 'true', 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/><path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9h2.5M2.5 15h2.5M19 9h2.5M19 15h2.5" stroke="currentColor" stroke-width="1.6"/></svg>' });
    const seg = el('div', { class: 'gfx-seg', role: 'radiogroup', 'aria-label': 'Graphics quality' });
    const note = el('p', { class: 'gfx-note' });
    const autoBtn = el('button', { class: 'btn small ghost', type: 'button', text: 'Auto' });
    const card = el('div', { class: 'gfx-card glass', hidden: true, role: 'dialog', 'aria-label': 'Graphics' }, [el('div', { class: 'gfx-head' }, [el('b', { text: 'Graphics' }), autoBtn]), seg, note]);
    const opts = G.qualityLevels.map(q => { const b = el('button', { type: 'button', role: 'radio', class: 'gfx-opt', 'data-q': q }); b.onclick = () => { autoSet = false; try { localStorage.setItem(KEY, q); } catch (e) { } byUser = true; G.setQuality(q); byUser = false; sync(); }; seg.append(b); return b; });
    // back to automatic: forget the remembered step-down and detect again (GPU string, DPR, caps)
    autoBtn.onclick = () => { autoSet = true; try { localStorage.setItem(KEY, 'auto'); localStorage.removeItem('sm-gfx-history'); } catch (e) { } let d = G.quality; try { d = detectQuality(G.renderer).quality; } catch (e) { } byUser = true; G.setQuality(d); byUser = false; sync(); };
    const sync = () => {
      const cur = G.quality;
      opts.forEach(b => { const q = b.dataset.q, on = q === cur; b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); b.textContent = names[q] + (on && autoSet ? ' (auto)' : ''); });
      autoBtn.hidden = autoSet; btn.dataset.q = cur;
      note.textContent = autoSet ? 'Chosen for this device; lowered by itself if frames stay slow.' : 'Kept at your choice. Shadow detail changes with the next diorama.';
    };
    const prev = G.onQuality; G.onQuality = q => { try { prev && prev(q); } catch (e) { } if (!byUser) { autoSet = true; } sync(); };
    const close = () => { card.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.onclick = e => { e.stopPropagation(); card.hidden = !card.hidden; btn.setAttribute('aria-expanded', String(!card.hidden)); if (!card.hidden) sync(); };
    document.addEventListener('pointerdown', e => { if (!card.hidden && !card.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) close(); });
    sync(); document.body.append(btn, card); this.gfxControl = { btn, card, sync };
  }
  fatal(msg) { const f = $('#fatal'); f.textContent = msg; f.style.display = 'block'; }
  async boot() {
    try { performance.mark('sm:boot'); } catch (e) { }
    const kit = preloadKit();   // the hub's hand-made props load under the veil (at most 6 s; else procedural ones)
    // the save slot played last (store.js: each private scriptorium is its own set of keys)
    this.slots = await this.loadSlots(); store.useSlot(this.slotId = (await store.getGlobal('lastSlot')) || this.slots[0].id);
    if (!this.slots.some(x => x.id === this.slotId)) store.useSlot(this.slotId = this.slots[0].id);
    await this.loadLibrary(); mark('sm:lib');
    await kit; this.kit = kitStatus(); mark('sm:kit');
    // the place in the address (route.js): a link or a reload reopens that room (and scroll); otherwise the hub
    addEventListener('popstate', () => this.onRoute());
    const r = parseHash(location.hash), book = r.room ? this.lib.books.find(b => b.id === r.room) : null;
    this.loop();   // drawing runs under the veil: the switch below draws (and counts) its settling frames
    this._routing = true;   // the first place replaces the address instead of adding a history entry
    // a link or a reload into a room goes straight there; otherwise the title screen (automated test browsers skip it
    // unless the address asks for it with ?title=1)
    const q = location.search, title = /[?&]title=1/.test(q) || (!r.room && !navigator.webdriver && !/[?&]title=0/.test(q));
    try { await (title ? this.openTitle() : book ? this.openRoom(book.id, { openPart: r.scroll || undefined }) : this.openHub()); } finally { this._routing = false; }
    if (r.room && !book) toast('That room is not in this library any more: here is the hall');
    offerResume(this);   // an analysis interrupted by a reload is offered again (corner chip)
    // the veil ("lighting the lamps…") lifts only now: the place has its final reflections, compiled programs and a few
    // drawn frames behind it (_switch), so it never shows a provisional look first
    document.body.classList.add('ready'); mark('sm:ready');
  }
  // ---------- the library of the current slot: read, seeded when new, migrated ----------
  async loadLibrary({ empty = false } = {}) {
    this.lib = await store.get(LIB_KEY);
    if (this.lib && (!Array.isArray(this.lib.books) || !this.lib.hub)) this.lib = null;   // damaged or foreign data: start from the seed library
    if (!this.lib || !Array.isArray(this.lib.shelves)) {
      this.lib = this.seedLibrary();
      if (empty) { this.lib.books = []; this.lib.dismissedSeeds = [DOMAIN_BOOK.title]; this.lib.lastRoom = null; }   /* a blank scriptorium: the bookcases, no books */
      else for (const [id, room] of this.seedRooms) await store.set('room:' + id, room);
      await store.set(LIB_KEY, this.lib);
    }
    await this.migrateV2();
    this.sweepDeleted();
    await this.ensureDomainBook();
  }
  // ---------- save slots: private scriptoria, each its own library (store.js useSlot) ----------
  async loadSlots() {
    let S = await store.getGlobal('slots');
    if (!Array.isArray(S) || !S.length) { S = [{ id: 'main', name: 'My scriptorium', created: Date.now(), played: Date.now() }]; await store.setGlobal('slots', S); }
    return S;
  }
  slotMeta(patch) { const m = this.slots.find(x => x.id === this.slotId); if (!m) return; Object.assign(m, patch); clearTimeout(this._slotT); this._slotT = setTimeout(() => store.setGlobal('slots', this.slots), 400); }
  async switchSlot(id) { if (id === this.slotId) return; store.flushSaves(); store.useSlot(id); this.slotId = id; await store.setGlobal('lastSlot', id); await this.loadLibrary(); }
  async createSlot(name, examples = true) {
    const id = 's' + uid().replace(/[^a-z0-9]/gi, '').slice(0, 10), m = { id, name: String(name || 'A new scriptorium').slice(0, 60), created: Date.now(), played: Date.now() };
    this.slots.push(m); await store.setGlobal('slots', this.slots); store.flushSaves(); store.useSlot(id); this.slotId = id; await store.setGlobal('lastSlot', id);
    await this.loadLibrary({ empty: !examples }); this.saveLib();
    this._arrive = { enter: true }; this._irisNext = true; return this.openHub();
  }
  async renameSlot(id, name) { const m = this.slots.find(x => x.id === id); if (m) { m.name = String(name).slice(0, 60); await store.setGlobal('slots', this.slots); } }
  async deleteSlot(id) { if (id === 'main' || id === this.slotId) return false; await store.dropSlot(id); this.slots = this.slots.filter(x => x.id !== id); await store.setGlobal('slots', this.slots); return true; }
  // the title screen; "Continue" returns to the place the slot was left in, by a camera move into it
  openTitle() { try { this.rememberPlace(); store.flushSaves(); } catch (e) { }   /* Continue comes back to exactly here */
    this._irisNext = true;
    this.route({}); sfx.ambience('library'); return this.switchMode(() => new TitleScreen(this)); }
  async continueSlot(id) {
    await this.switchSlot(id); this.slotMeta({ played: Date.now() }); const L = this.lib.lastPlace, book = L && L.book && this.lib.books.find(b => b.id === L.book);
    this._arrive = { enter: true, pose: L && L.cam && !L.part ? L.cam : null }; this._irisNext = true;
    return book ? this.openRoom(book.id, { openPart: L.part || undefined }) : this.openHub();
  }
  // ---------- camera choreography owned by the app: runs after the place's own update, before drawing ----------
  // keys: [{ p, a, dur, at(k) }] poses (position, look-at point) reached one after another; resolves at the end
  cineRun(M, keys) {
    return new Promise(res => {
      const cam = M.camera, f = new THREE.Vector3(); cam.getWorldDirection(f);
      const start = { p: cam.position.clone(), q: cam.quaternion.clone(), a: M.controls && M.controls.target && !(M.nav && M.nav.mode === 'walk') ? M.controls.target.clone() : cam.position.clone().addScaledVector(f, 2.5) };
      if (M.controls) M.controls.enabled = false;
      this.cine = { M, keys: keys.map(k => ({ ...k, p: new THREE.Vector3(...[].concat(k.p.toArray ? k.p.toArray() : k.p)), a: new THREE.Vector3(...[].concat(k.a.toArray ? k.a.toArray() : k.a)) })), i: 0, t: 0, from: start, res };
    });
  }
  stepCine(dt) {
    const C = this.cine; if (!C) return; if (C.M !== this.mode || C.M.disposed) { this.cine = null; C.res(); return; }
    const K = C.keys[C.i]; if (K.hold && K.hold()) { C.t = 0; if (!K.q0) { C.M.camera.position.copy(K.p); C.M.camera.quaternion.copy(lookQ(K.p, K.a)); C.from = { p: K.p.clone(), q: lookQ(K.p, K.a), a: K.a.clone() }; } return; }   /* (hold: a pose kept until the veil has lifted) */
    C.t += dt; const cam = C.M.camera;
    // each key turns along the shortest arc (camfly.js) from where the last key ended: never from the camera as it stands
    // this frame, which the place's own walking or orbit controls may already have turned back to their old heading (that
    // was the kick to the right on the way into the tunnel). dur 'auto': as long as the way and the turn need.
    if (!K.q0) { K.q0 = C.from.q.clone(); K.q1 = lookQ(K.p, K.a); K.p0 = C.from.p.clone(); if (K.dur === 'auto') { K.dur = flightDur(K.p0, K.q0, K.p, K.q1, .9, 2.8); K.ease = K.ease || easeSine; } }
    const k = Math.min(1, C.t / K.dur), e = K.ease ? K.ease(k) : k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    flyPose(cam, { p0: K.p0, p1: K.p, q0: K.q0, q1: K.q1 }, e); const a = new THREE.Vector3().lerpVectors(C.from.a, K.a, e); if (K.at) K.at(k);
    if (k >= 1) { C.from = { p: K.p.clone(), q: K.q1.clone(), a: K.a.clone() }; C.i++; C.t = 0;
      if (C.i >= C.keys.length) { this.cine = null; const M = C.M; if (M.controls) { M.controls.target.copy(a); M.controls.enabled = !(M.nav && M.nav.mode === 'walk') && !M.anim; M.controls.update(); } if (M.nav && M.nav.syncFromCamera) M.nav.syncFromCamera(); C.res(); } }
  }
  // arriving in a place: through its door (the leaves stand open and close behind you), from the title screen (a slow
  // descent into the view), or at a remembered pose (Continue)
  arrive(M, how) {
    if (!M || !M.camera) return; const cam = M.camera, f = new THREE.Vector3(); cam.getWorldDirection(f);
    const goal = how.pose ? { p: new THREE.Vector3(...how.pose.p), a: new THREE.Vector3(...how.pose.a) } : { p: cam.position.clone(), a: M.controls && !(M.nav && M.nav.mode === 'walk') ? M.controls.target.clone() : cam.position.clone().addScaledVector(f, 2.5) };
    const D = M.doorInfo, pick = M.doorPick;
    if (how.enter && D && D.set && pick) {
      // from the title screen, through the door: the iris opens on the closed double door seen from the gallery behind it;
      // the leaves swing open onto the place, the camera walks in over the threshold, the doors close behind it, and the
      // camera goes on to where it was left (or the place's opening view)
      const c = pick.position, T = D.tunnel, p0 = new THREE.Vector3(c.x, 1.6, c.z + 2.6), a0 = new THREE.Vector3(c.x, 1.48, c.z - 4);
      const p1 = new THREE.Vector3(c.x, 1.62, c.z - 1.5), a1 = new THREE.Vector3(c.x, 1.5, c.z - 7);
      cam.position.copy(p0); cam.lookAt(a0); D.travel = true; D.set(0); if (T) { T.setFlow(0); T.setGlow(0); }
      let swing = 'wait', shut = false, irisAt = 0;
      const hold = () => {   // until the change is done and the iris has opened enough to see the doors; then the swing
        if (this.switching) return true;
        if (swing === 'wait') { irisAt = irisAt || performance.now(); if (performance.now() - irisAt < 900) return true; swing = 'go'; sfx.play('whoosh', { gain: .22 });
          const t0 = performance.now(); const st = () => { if (M.disposed) return; const k = Math.min(1, (performance.now() - t0) / 1100); D.set(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(st); else swing = 'open'; }; st(); }
        return swing !== 'open';
      };
      const close = q => { D.set(1 - (q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2)); if (q >= 1 && !shut) { shut = true; D.travel = false; D.set(0); sfx.play('thud', { gain: .35 }); } };
      this.cineRun(M, [{ p: p0, a: a0, dur: .05, hold },
        { p: p1, a: a1, dur: 2.2, ease: k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, at: k => { if (k > .55) close((k - .55) / .45 * .6); } },
        { p: goal.p, a: goal.a, dur: 'auto', at: k => { if (!shut) close(.6 + Math.min(1, k * 2.5) * .4); } }]).then(() => { if (!shut) { D.travel = false; D.set(0); } });
      return;
    }
    if (how.door && D && D.set && pick) {
      // out of this place's own tunnel: the camera starts far down the bore with the room framed by the open door ahead,
      // held there until the veil has lifted, glides up the tunnel (the light slowing round it), through the doorway, and
      // on to the view; the leaves close behind
      const c = pick.position, T = D.tunnel, p0 = new THREE.Vector3(c.x, 1.5, c.z + 9.5), a0 = new THREE.Vector3(c.x, 1.45, c.z - 6), p1 = new THREE.Vector3(c.x, 1.6, c.z - .35), a1 = new THREE.Vector3(c.x, 1.5, c.z - 6);
      cam.position.copy(p0); cam.lookAt(a0); D.travel = true; D.set(1); if (T) { T.setFlow(-14); T.setGlow(0); }
      let shut = false; const done = () => { D.travel = false; D.set(D.open); };
      this.cineRun(M, [{ p: p0, a: a0, dur: .05, hold: () => this.switching },
        { p: p1, a: a1, dur: 2.1, ease: k => 1 - Math.pow(1 - k, 3), at: k => { if (T) T.setFlow(-14 * Math.pow(1 - k, 2) - .6); if (k > .9 && D.travel) done(); } },
        { p: goal.p, a: goal.a, dur: 2.4, at: k => { if (k > .2) { const q = Math.min(1, (k - .2) / .5); D.set(1 - (q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2)); if (q >= 1 && !shut) { shut = true; sfx.play('thud', { gain: .35 }); } } } }]).then(() => { D.travel = false; if (!shut) D.set(0); });
      sfx.play('whoosh', { gain: .3, pitch: .8 });
      return;
    }
    const back = goal.p.clone().sub(goal.a).setY(0).normalize(); if (!isFinite(back.x)) back.set(0, 0, 1);
    const p0 = goal.p.clone().addScaledVector(back, how.pose ? 2.2 : 3).add(new THREE.Vector3(0, how.pose ? .9 : 1.6, 0));
    cam.position.copy(p0); cam.lookAt(goal.a);
    this.cineRun(M, [{ p: p0, a: goal.a, dur: .05, hold: () => this.switching }, { p: goal.p, a: goal.a, dur: how.pose ? 3 : 3.6, ease: easeSine }]);   /* held until the change is done, then the descent runs under the dissolve */
  }
  // the door: the camera walks up to it, the leaves swing open, the camera passes through into the light, and the next
  // place is entered through its own door (arrive) — never a cut from where you stood
  async walkThroughDoor(go) {
    const M = this.mode; if (!M || this.cine || this.switching) return; const D = M.doorInfo, pick = M.doorPick;
    if (!D || !D.set || !pick) return go();
    const c = pick.position, T = D.tunnel;
    await this.cineRun(M, [{ p: new THREE.Vector3(c.x, 1.62, c.z - 2.4), a: new THREE.Vector3(c.x, 1.45, c.z), dur: 'auto' }]);
    if (M.disposed || this.mode !== M) return;
    sfx.play('whoosh', { gain: .25 }); if (T) { T.setFlow(1.5); T.setGlow(0); }
    await new Promise(res => { const t0 = performance.now(); const step = () => { if (M.disposed) return res(); const k = Math.min(1, (performance.now() - t0) / 950); D.set(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); else res(); }; step(); });   /* by the clock: a slow frame never stretches the swing */
    if (M.disposed || this.mode !== M) return;
    // into the tunnel: a step over the threshold, then the run down the bore, the light rushing faster and the far end
    // brightening until it fills the view; the next place is opened through that light (arrive: {door})
    D.travel = true; let gone = false;
    const leave = () => { if (gone) return; gone = true; this._arrive = { door: true }; go(); };
    sfx.play('whoosh', { gain: .45, pitch: 1.2 });
    this.cineRun(M, [{ p: new THREE.Vector3(c.x, 1.58, c.z + 1.2), a: new THREE.Vector3(c.x, 1.5, c.z + 12), dur: .9 },
      { p: new THREE.Vector3(c.x, 1.5, c.z + 17), a: new THREE.Vector3(c.x, 1.48, c.z + 40), dur: 1.9, ease: k => k * k * k, at: k => { if (T) { T.setFlow(1.5 + 30 * k * k); T.setGlow(k * k); } if (k > .62) leave(); } }]);
    // whatever the frame rate, the switch starts by the clock too (a slow software GPU still leaves)
    setTimeout(() => { if (this.mode === M) leave(); }, 4200);
  }
  // where you are, kept as you move (Continue returns there): the place, the scroll open in it, the camera
  rememberPlace() {
    const M = this.mode; if (!M || this.switching || this.cine || !(M instanceof Hub || M instanceof BookRoom) || !M.camera) return;
    const cam = M.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); const a = cam.position.clone().addScaledVector(f, 2.5), r = v => Math.round(v * 100) / 100;
    const L = { kind: M instanceof Hub ? 'hub' : 'room', book: M instanceof BookRoom ? M.book.id : null, part: M instanceof BookRoom && M.reader && M.reader.part ? M.reader.part.id : null, cam: { p: cam.position.toArray().map(r), a: a.toArray().map(r) } };
    const sig = JSON.stringify(L); if (sig === this._placeSig) return; this._placeSig = sig; this.lib.lastPlace = { ...L, at: Date.now() }; this.saveLib();
    const b = L.book && this.lib.books.find(x => x.id === L.book); this.slotMeta({ played: Date.now(), place: b ? `In the room of “${b.title}”` : 'In the library hall' });
  }
  // ---------- copies of a scroll: a duplicate of one of yours, or one fetched from the shared shelf ----------
  async duplicateBook(bookId) {
    const b = this.lib.books.find(x => x.id === bookId); if (!b) return; const room = await this.loadRoom(bookId);
    return this.addBookCopy({ title: b.title + ' (copy)', color: b.color, icon: b.icon, room: JSON.parse(JSON.stringify(room)), heading: `Where should the copy of “${b.title}” go?`, verb: 'Duplicate it there', pdfFrom: b.hasPdf ? b.id : null });
  }
  addBookCopy({ title, color, icon, room, heading, verb, pdfFrom = null, from = null }) {
    choosePlace(this, { title: heading, verb, onChoose: async ({ place }) => {
      const nb = { id: 'bk-' + uid(), title, shelf: null, tier: 0, slot: 0, color: color || '#8a2a1e', icon: icon || '', hasPdf: false, ...(from ? { from } : {}) };
      const ids = {}; (room.parts || []).forEach(p => { ids[p.id] = 'p-' + uid(); p.id = ids[p.id]; }); (room.parts || []).forEach(p => { if (p.subOf) p.subOf = ids[p.subOf] || null; });   /* new ids, sub-scrolls still under their parents */
      await store.set('room:' + nb.id, room);
      if (pdfFrom) { const pdf = await store.get('pdf:' + pdfFrom); if (pdf) { await store.set('pdf:' + nb.id, pdf); nb.hasPdf = true; } }
      this.lib.books.push(nb); const r = place(nb); if (!nb.shelf) { const s = this.firstShelf(), at = this.seedSpot(s) || { tier: 0, slot: 0 }; Object.assign(nb, { shelf: s.id, tier: at.tier, slot: at.slot }); }
      this.saveLib(); toast(`“${title}” is on ${(this.lib.shelves.find(s => s.id === nb.shelf) || {}).name || 'its bookcase'}`); return r;
    } });
  }
  getScroll() { return openGetScroll(this); }
  bookVisibility(bookId) { const b = this.lib.books.find(x => x.id === bookId); if (b) return openVisibility(this, b); }
  // ---------- the address of the place on screen (route.js) ----------
  // A new place adds a history entry; one reached by Back / Forward, or the first at boot, replaces it instead.
  route(r) {
    const h = formatHash(r); this.here = r;
    try { if (h === location.hash || (!h && !location.hash)) return; const url = h || location.pathname + location.search; if (this._routing) history.replaceState(null, '', url); else history.pushState(null, '', url); } catch (e) { }   /* a sandbox without history: the app still works */
  }
  // the room (and scroll) visited last: the hall's door leads back to it (hub.js)
  rememberRoom(book, part) {
    if (!this.lib) return; const L = this.lib.lastRoom; part = part || null;
    if (L && L.book === book && (L.part || null) === part) return; this.lib.lastRoom = { book, part }; this.saveLib();
  }
  // Back / Forward (or a hash typed into the address bar): go to the place the address names
  async onRoute() {
    const r = parseHash(location.hash), m = this.mode; this._routing = true;
    try {
      if (!r.room) { if (!(m instanceof Hub) || this.switching) await this.openHub(); return; }
      if (!this.lib.books.some(b => b.id === r.room)) { toast('That room is not in this library any more'); await this.openHub(); return; }
      if (m instanceof BookRoom && m.book.id === r.room && !this.switching) {   // the same room: open or close the reader only
        const p = r.scroll && m.data.parts.find(x => x.id === r.scroll);
        if (p) { if (!(m.reader && m.reader.part === p)) m.openPart(p, true); } else if (m.reader) m.reader.close();
        this.here = r; return;
      }
      await this.openRoom(r.room, { openPart: r.scroll || undefined });
    } finally { this._routing = false; }
  }
  // Scrolls written with Scriptorium v2 (same page, localStorage) become a book on the first bookcase.
  async migrateV2() {
    if (this.lib.migratedV2) return; let old = null; try { old = JSON.parse(localStorage.getItem('scriptorium.v2') || 'null'); } catch (e) { }
    this.lib.migratedV2 = true; this.saveLib(); if (!old || !Array.isArray(old.layers)) return;
    const parts = []; old.layers.forEach(L => (L.scrolls || []).forEach(sc => { if (sc.analysis && Array.isArray(sc.analysis.chain)) parts.push({ id: 'p-' + uid(), title: sc.title || sc.analysis.title || 'Scroll', summary: sc.analysis.summary || '', analysis: normalizeChain(sc.analysis), layer: L.name }); }));
    const mine = parts.filter(p => !/^Example scroll/.test(p.analysis.sourceNote || '')); if (!mine.length) return;
    const shelf = this.firstShelf(); const n = this.lib.books.filter(b => b.shelf === shelf.id).length;
    const b = { id: 'bk-' + uid(), title: 'My earlier scrolls', shelf: shelf.id, tier: 2 - Math.floor(n / 17), slot: n % 17, color: '#9c3a28', icon: 'V2', hasPdf: false };
    this.lib.books.push(b); await store.set('room:' + b.id, { dims: { w: 12, d: 10, h: 5.5 }, parts: mine }); this.saveLib(); toast(`Your ${mine.length} earlier scroll(s) are on ${shelf.name} as "My earlier scrolls"`);
  }
  // The explanatory compiler's example book (js/seeds-domains.js) reaches libraries seeded before it existed, once:
  // on the Mathematics bookcase (else the first one), in the free place nearest to the books already on its eye-level
  // tier (seedSpot). A library seeded with it already has it (seedLibrary); one whose owner deleted it never gets it
  // back, not even from a later DOMAIN_BOOK_VERSION (lib.dismissedSeeds, written by deleteBook).
  async ensureDomainBook() {
    if ((this.lib.domainBookV || 0) >= DOMAIN_BOOK_VERSION) return; this.lib.domainBookV = DOMAIN_BOOK_VERSION;
    const gone = Array.isArray(this.lib.dismissedSeeds) && this.lib.dismissedSeeds.includes(DOMAIN_BOOK.title);
    if (!gone && !this.lib.books.some(b => b.title === DOMAIN_BOOK.title)) {
      const pref = this.lib.shelves.find(s => s.name === 'Mathematics') || this.firstShelf();
      let shelf = pref, at = this.seedSpot(pref);
      if (!at) for (const s of this.lib.shelves) if ((at = this.seedSpot(s))) { shelf = s; break; }
      at = at || { tier: 0, slot: 0 };   /* every bookcase full: the hub's repairSlots finds it a place (a new bookcase if need be) */
      const b = { id: 'bk-' + uid(), title: DOMAIN_BOOK.title, shelf: shelf.id, tier: at.tier, slot: at.slot, color: shelf.color || '#2d5b8e', icon: DOMAIN_BOOK.icon, hasPdf: false, example: true };
      this.lib.books.push(b); await store.set('room:' + b.id, this.domainRoom());
    } else if (!gone) {   /* the book is already there: a later version's new parts are appended (the reader's own parts and edits stay) */
      const b = this.lib.books.find(x => x.title === DOMAIN_BOOK.title), room = b && await store.get('room:' + b.id);
      if (room && Array.isArray(room.parts)) { const have = new Set(room.parts.map(p => p.title)), add = this.domainParts().filter(p => !have.has(p.title)); if (add.length) { room.parts.push(...add.map(p => ({ id: 'p-' + uid(), ...p }))); await store.set('room:' + b.id, room); } }
    }
    this.saveLib();
  }
  domainRoom() { return { dims: { w: 12, d: 10, h: 5.5 }, parts: this.domainParts().map(p => ({ id: 'p-' + uid(), ...p })), threadV: 4, lessonsV: 5, grounded: 1, seedStamp: SEED_STAMP }; }
  // A free cradle for a book added to a saved library, in data only (no hub yet): the bookcase's slot layout as the hub
  // builds it (props.caseLayout), every place its books take (a hanging scroll reserves the 3 slots it spans,
  // props.hangSlots), tiers from eye level down (props.caseTierOrder); on a tier, the free slot nearest to the books
  // already there (the centre of an empty tier). null when the bookcase is full.
  seedSpot(shelf) {
    const u = caseLayout(shelf), so = { userData: u }, taken = new Set();
    this.lib.books.filter(b => b.shelf === shelf.id).forEach(b => { const t = b.tier || 0; (b.hang ? hangSlots(so, b.slot || 0) : [b.slot || 0]).forEach(j => taken.add(t + ':' + j)); });
    for (const t of caseTierOrder(u)) {
      const here = this.lib.books.filter(b => b.shelf === shelf.id && (b.tier || 0) === t).map(b => b.slot || 0), mid = (u.slotsPerTier - 1) / 2;
      const d = j => here.length ? Math.min(...here.map(k => Math.abs(k - j))) : Math.abs(j - mid);
      const free = [...Array(u.slotsPerTier).keys()].filter(j => !taken.has(t + ':' + j)).sort((a, b) => d(a) - d(b) || a - b);
      if (free.length) return { tier: t, slot: free[0] };
    }
    return null;
  }
  domainParts() { const C = o => JSON.parse(JSON.stringify(o)); return DOMAIN_BOOK.parts.map(p => ({ title: p.title, summary: p.summary, subsections: C(p.subsections), analysis: normalizeChain(C(p.analysis)) })); }
  // a library whose bookcases were all removed still gets a place for imported books
  firstShelf() { if (!this.lib.shelves.length) { const R = this.lib.hub; this.lib.shelves.push({ id: 'sh-' + uid(), name: 'Unsorted', kind: 'vertical', x: -R.w / 2 + .28, z: 0, rot: Math.PI / 2, color: '#8a2a1e' }); } return this.lib.shelves[0]; }
  saveLib() { store.saveLater(LIB_KEY, () => this.lib, 300); }
  saveRoom(id, room) { store.saveLater('room:' + id, () => room, 400); republishLater(this, this.lib.books.find(b => b.id === id)); }
  async loadRoom(id) {
    const r = (await store.get('room:' + id)) || { dims: { w: 12, d: 10, h: 5.5 }, parts: [] };
    // example rooms saved before grounding existed get their verified sources and teaching fields once
    const b = this.lib && this.lib.books.find(x => x.id === id);
    // example rooms saved before the authored diorama lessons existed get them once (matched by demo type + title)
    if (b && b.example && (r.lessonsV || 0) < 4) {
      const L = new Map(), walk = (o, f) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(x => walk(x, f)); if (o.type && o.title) f(o); Object.values(o).forEach(x => walk(x, f)); };
      walk(legacyScrolls(), d => { if (Array.isArray(d.lessons) && d.lessons.length) L.set(d.type + '|' + d.title, d.lessons); });
      walk(r.parts, d => { const l = L.get(d.type + '|' + d.title); if (l && !(d.lessons && d.lessons.length)) d.lessons = JSON.parse(JSON.stringify(l)); });
      r.lessonsV = 4; store.set('room:' + id, r);
    }
    // v5 (the explanatory grammar, js/dio/grammar.js): example demos whose lessons are still the authored ones (every title is
    // a seed title, now or before v5) get the new lessons with their operations, the demo's levels and its didactic plan;
    // lessons a learner or an AI has changed are kept
    if (b && b.example && (r.lessonsV || 0) < 5) {
      const OLD = new Set(['Heat the lake', 'Ride a parcel of air', 'Wind to the ridge', 'Over the crest', 'Calm air', 'Evening']), N = new Map(), walk = (o, f) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(x => walk(x, f)); if (o.type && o.title) f(o); Object.values(o).forEach(x => walk(x, f)); };
      walk(legacyScrolls(), d => { if (Array.isArray(d.lessons) && d.lessons.length) N.set(d.type + '|' + d.title, d); }); FLAGSHIPS.forEach(d => N.set(d.type + '|' + d.title, d));
      walk(r.parts, d => { const n = N.get(d.type + '|' + d.title); if (!n || !Array.isArray(n.lessons)) return; const T = new Set(n.lessons.map(l => l.title));
        if (!(d.lessons && d.lessons.length) || d.lessons.every(l => l && (T.has(l.title) || OLD.has(l.title)))) { d.lessons = JSON.parse(JSON.stringify(n.lessons)); if (n.plan) d.plan = JSON.parse(JSON.stringify(n.plan)); if (n.levels) d.levels = JSON.parse(JSON.stringify(n.levels)); } });
      r.lessonsV = 5; store.set('room:' + id, r);
    }
    // v6, seed versioning (js/seeds-version.js): a room keeps its own copy of every diorama it shows, so an example room
    // seeded by an older version kept that version's scene (the water cycle's cone mountains and sphere clouds after the
    // valley was rebuilt). Untouched copies of a built-in scene are replaced by the current one; edited ones are kept.
    if (b && b.example && r.seedStamp !== SEED_STAMP) { try { this.refreshSeedScenes(r); } catch (e) { console.warn(e); } r.seedStamp = SEED_STAMP; store.set('room:' + id, r); }
    if (b && b.example && !r.grounded) { r.parts.forEach(p => { if (p.analysis) p.analysis = normalizeChain(groundChain(p.analysis)); }); r.grounded = 1; store.set('room:' + id, r); }
    // example rooms saved before the question thread existed get it once (v1): part question, subsections and coverage,
    // step section/answers/opens, demo purpose, lesson question/opens/shot/pov (threadFromSeeds; user-made books are never touched)
    // v4: the explanatory paragraphs and the figures of every teaching box (seeds-figures.js), where the learner has not edited
    if (b && b.example && (r.threadV || 0) < 4) { try { this.threadFromSeeds(b, r); } catch (e) { console.warn(e); } r.threadV = 4; store.set('room:' + id, r); }
    // v5: axis titles with their units, once per axis, on the example graphs (seeds-axes.js)
    if (b && b.example && (r.threadV || 0) < 5) { try { r.parts.forEach(p => { if (p.analysis) applyAxes(p.analysis); }); } catch (e) { console.warn(e); } r.threadV = 5; store.set('room:' + id, r); }
    return r;
  }
  // Bring the built-in scenes of an example room up to date. A copy of a flagship scene (matched by type + title) that is
  // an untouched copy of any shipped version (isSeedCopy: its fingerprint is stamped on it or in js/seeds-history.js, and
  // it has no edits) becomes the current scene; the learner's slider values are kept where the parameter still exists,
  // and lessons are replaced only while every title is a seed title (rewritten or added lessons stay). Copies the learner
  // edited (moved, retinted, added or removed objects, rewrote the scene) are kept as they are. Returns the number replaced.
  refreshSeedScenes(room) {
    const cur = new Map(FLAGSHIPS.map(f => [sceneKey(f), f])), C = o => JSON.parse(JSON.stringify(o)); let n = 0;
    for (const p of room.parts || []) for (const st of (p.analysis && p.analysis.chain) || []) for (const d of st.demos || []) {
      const key = sceneKey(d), f = cur.get(key); if (!f || !d || !Array.isArray(d.bodies)) continue;
      const fp = sceneFp(f);
      if (sceneFp(d) === fp) {   // the scene is current; its steps may still be an older shipped version (renamed or rewritten): those are replaced while every one is a seed step
        d.seedFp = fp; const T = new Set([...(SEED_LESSON_TITLES[key] || []), ...(f.lessons || []).map(l => l.title)]);
        if (Array.isArray(f.lessons) && Array.isArray(d.lessons) && d.lessons.length && d.lessons.every(l => l && T.has(l.title)) && JSON.stringify(d.lessons) !== JSON.stringify(f.lessons)) { d.lessons = C(f.lessons); if (f.plan) d.plan = C(f.plan); if (f.levels) d.levels = C(f.levels); n++; }
        continue; }
      if (!isSeedCopy(d, key)) continue;
      const titles = new Set([...(SEED_LESSON_TITLES[key] || []), ...(f.lessons || []).map(l => l.title)]);
      const ownLessons = Array.isArray(d.lessons) && d.lessons.length && !d.lessons.every(l => l && titles.has(l.title));
      const keep = { purpose: d.purpose, lessons: ownLessons ? d.lessons : null, plan: ownLessons ? d.plan : null, levels: ownLessons ? d.levels : null };
      const vals = d.values && typeof d.values === 'object' ? d.values : null, pk = new Set((f.params || []).map(q => q.key));
      Object.keys(d).forEach(k => delete d[k]); Object.assign(d, C(f));
      if (keep.purpose) d.purpose = keep.purpose;
      if (keep.lessons) { d.lessons = keep.lessons; if (keep.plan) d.plan = keep.plan; else delete d.plan; if (keep.levels) d.levels = keep.levels; else delete d.levels; }
      if (vals) { const v = {}; Object.keys(vals).forEach(k => { if (pk.has(k)) v[k] = vals[k]; }); if (Object.keys(v).length) d.values = v; }
      d.seedFp = fp; n++;
    }
    return n;
  }
  // ---------- deleting a scroll (a book) from its shelf ----------
  // The book leaves the library at once (its place on the shelf is free, the library is saved); its room, PDF, analysis
  // job and per-part caches stay in storage for UNDO_MS, so "Undo" in the toast puts it all back as it was. Then they are
  // deleted (purgeBook). Ids waiting for that are listed in localStorage, so a page closed during the undo window has
  // its leftovers deleted at the next start (sweepDeleted) instead of keeping them for ever.
  deleteBook(id) {
    const i = this.lib.books.findIndex(b => b.id === id); if (i < 0) return false; const b = this.lib.books[i];
    this.cancelJob(id); try { ingest.closePDF && ingest.closePDF(id); } catch (e) { console.warn(e); }
    this.lib.books.splice(i, 1); const last = this.lib.lastRoom && this.lib.lastRoom.book === id ? this.lib.lastRoom : null; if (last) delete this.lib.lastRoom;
    if (b.example) this.lib.dismissedSeeds = [...new Set([...(this.lib.dismissedSeeds || []), b.title])];   /* a built-in book the owner deleted is never added back (ensureDomainBook) */
    this.saveLib();
    store.lsSet(PENDING_DEL, [...new Set([...store.lsGet(PENDING_DEL, []), id])]);
    if (this.mode instanceof Hub) this.mode.dropScroll(id, b.shelf);
    const timer = setTimeout(() => this.purgeBook(id), UNDO_MS);
    toastAction(`“${b.title}” was deleted`, 'Undo', () => { clearTimeout(timer); this.restoreBook(b, i, last); }, UNDO_MS);
    return true;
  }
  restoreBook(b, i, last) {
    if (this.lib.books.some(x => x.id === b.id)) return;
    if (b.example && Array.isArray(this.lib.dismissedSeeds)) this.lib.dismissedSeeds = this.lib.dismissedSeeds.filter(t => t !== b.title);
    store.lsSet(PENDING_DEL, store.lsGet(PENDING_DEL, []).filter(x => x !== b.id));
    if (!this.lib.shelves.some(s => s.id === b.shelf)) b.shelf = this.firstShelf().id;   // its bookcase went meanwhile
    this.lib.books.splice(Math.min(i, this.lib.books.length), 0, b); if (last && !this.lib.lastRoom) this.lib.lastRoom = last;
    if (this.mode instanceof Hub) this.mode.restoreScroll(b);   // back in its place (the nearest free one if that was taken meanwhile)
    this.saveLib(); toast(`“${b.title}” is back on its shelf`);
  }
  async purgeBook(id) {
    if (this.lib.books.some(b => b.id === id)) return;
    const own = k => k === 'pdf:' + id || k === 'room:' + id || k === 'job:' + id || k.startsWith('sections:' + id + ':') || k.startsWith('figs:' + id + ':');
    try { for (const k of await store.keys()) { if (this.lib.books.some(b => b.id === id)) return; /* restored meanwhile: keep the rest */ if (own(String(k))) await store.del(k); } } catch (e) { console.warn(e); return; }
    store.lsSet(PENDING_DEL, store.lsGet(PENDING_DEL, []).filter(x => x !== id));
  }
  sweepDeleted() { const ids = store.lsGet(PENDING_DEL, []); if (!Array.isArray(ids)) return store.lsSet(PENDING_DEL, []); ids.forEach(id => this.lib.books.some(b => b.id === id) ? store.lsSet(PENDING_DEL, store.lsGet(PENDING_DEL, []).filter(x => x !== id)) : this.purgeBook(id)); }
  // ---------- modes, with a warm fade between them ----------
  // Switches run one at a time (a second request while one is fading waits, and only the latest waiting one runs),
  // so a double click or an exit pressed during a fade never leaves two modes alive.
  switchMode(make) {
    const tok = ++this._swTok;
    const run = () => tok === this._swTok ? this._switch(make) : null;
    return (this._sw = (this._sw || Promise.resolve()).then(run, run));
  }
  async _switch(make) {
    const g = this.gfx.grade.uniforms.uFade; this.switching = true;   // the switch owns the veil (uFade) until it has faded back in: a mode's own cut applies at once under it (director.js)
    // the flag is always cleared (try/finally): left set by an exception, every later cut would apply without a dip; a switch
    // that failed half-way also lifts the veil, so the screen is never left black
    let done = false;
    try {
      // the fade is timed by the clock, not by frame count, so a slow frame never stretches it
      const fade = async (a, b, ms) => { const t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); g.value = a + (b - a) * k; if (k >= 1) return; await sleep(16); } };
      // a dissolve (title screen <-> library): the still covers the change, so the veil drops at once beneath it
      // the iris (title screen <-> library): shut from the edges in before anything is built; the change happens in black
      const irisNext = this._irisNext && this.mode && !this.veilHold; this._irisNext = false;
      if (irisNext) { const U = document.getElementById('ui'); if (U) { U.style.transition = 'opacity .5s ease'; U.style.opacity = '0'; } await this.iris(0, 1100); }
      const still = !irisNext && this._dissolveNext && this.mode && !this.veilHold ? await this.snapshot() : null; this._dissolveNext = false;
      const uiEl = document.getElementById('ui'); if (still && uiEl) uiEl.style.opacity = '0';   // the next place's buttons rise with the dissolve, not before it
      if (!still && !irisNext && g.value < .99) await fade(g.value, 1, 200 * (1 - g.value));
      g.value = 1;
      // from here until the new place's reflections are captured nothing is drawn: the screen is black (uFade 1) and the
      // frames would only compete with the bakes, the compile and the probe for the GPU (with a software GPU a hall frame
      // costs seconds, and a bake's canvas read-back waited for it). The settle frames below draw again.
      this.veilHold = true;
      const old = this.mode;
      if (old) { try { old.dispose(); } catch (e) { console.warn(e); } this.mode = null; }
      try { this.gfx.outline.enabled = false; this.gfx.outline.selectedObjects = []; this.gfx.renderer.toneMappingExposure = .9; this.gfx.bloom.strength = .32; this.gfx.renderer.shadowMap.autoUpdate = true; this.gfx.renderer.shadowMap.needsUpdate = true; } catch (e) { console.warn(e); }   /* a reset that throws never skips opening the next mode */
      this.cine = null; mark('sm:sw-start'); try { this.mode = await make(); if (this._arrive) { const a = this._arrive; this._arrive = null; try { this.arrive(this.mode, a); } catch (e) { console.warn(e); } } } catch (e) { console.error(e); toast('Could not open: ' + e.message); try { this.mode = new Hub(this); } catch (e2) { console.error(e2); } }
      // the old scene's GPU resources go once the new one has drawn (programs both use stay compiled)
      if (old) this.retire(() => old.disposeGPU ? old.disposeGPU() : disposeTree(old.scene, this.mode && this.mode.scene));
      // the place's final look before the veil lifts. A room's reflection probe used to be captured over ~14 frames
      // starting 0.8 s after the veil had lifted, so the hall first showed under the flat studio light, then popped to its
      // own reflections. Now: its materials are enriched and the capture scheduled (captureProbe draws nothing), the
      // surface maps still waiting for an idle slice are baked (BAKE.now), a diorama's scanned detail is waited for, every
      // program is compiled for that look (in parallel where the browser can), and only then is the probe drawn in full
      // (RoomProbe.finish), with programs that are already compiled
      const M = this.mode, P = M && M.probe && M.captureProbe ? M.probe : null;
      if (P) { try { if (M.probeDirty || !P.rt) M.captureProbe(); } catch (e) { console.warn(e); } }
      // the programs are queued first (r.compile; flushed so the GPU process starts on them now) and the surface maps baked
      // meanwhile: the bakes are CPU canvases, the compile and link run in the GPU process, so the two overlap instead of
      // the probe's first draw waiting for every link afterwards. (Baking only swaps a texture's pixels: no program
      // changes.) The awaited prewarm below picks up what a diorama's scanned detail adds.
      mark('sm:sw-mode'); const early = this.mode && this.mode.scene && this.mode.camera ? this.mode : null;
      if (early) { try { this.gfx.prewarm(early.scene, early.camera, [{ apply() { }, restore() { } }]).catch(() => { }); this.gfx.renderer.getContext().flush(); } catch (e) { console.warn(e); } }
      try { BAKE.now(); } catch (e) { console.warn(e); } mark('sm:sw-bake');
      if (scansReady()) await Promise.race([scansReady(), sleep(4000)]);   /* aaa.js loadScans, asked for by a diorama's first realistic material */
      // compile the new scene's shaders while the screen is still veiled (parallel where the browser supports it)
      if (this.mode && this.mode.scene && this.mode.camera) { try { await Promise.race([this.gfx.prewarm(this.mode.scene, this.mode.camera, [{ apply() { }, restore() { } }]), sleep(4000)]); } catch (e) { } }
      mark('sm:sw-prewarm'); if (P && this.mode === M) { try { P.finish(); M.shadowsDirty = true; } catch (e) { console.warn(e); } } mark('sm:sw-probe');
      this.gfx.resetAdapt(); this.veilHold = false;
      // the new mode settles its opening view under the veil (a diorama re-frames once its panels are laid out): a few
      // drawn frames, counted (not timed: a software GPU may take seconds per frame), until it says it is framed
      for (let k = 0; k < 12 && this.mode && (k < 3 || (this.mode.framing && this.mode.framing())); k++) await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      mark('sm:sw-frames'); await sleep(60);
      if (irisNext) { g.value = 0; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); this.switching = false;
        const U = document.getElementById('ui'); if (U) { U.style.transition = 'opacity 1.2s ease .5s'; U.style.opacity = ''; setTimeout(() => { U.style.transition = ''; }, 1900); }
        this.iris(1.35, 1900); }   // opens from the centre while the arrival's camera move runs
      else if (still) { g.value = 0; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); this.switching = false; this.dissolve(still, 1700, true); }
      else await fade(1, 0, 330);
      g.value = 0; done = true; mark('sm:sw-end');
    } finally { this.switching = false; this.veilHold = false; if (!done) { g.value = 0; this.gfx.grade.uniforms.uIris.value = 2; document.querySelectorAll('.xfade').forEach(o => this.dissolve(o, 300)); const U = document.getElementById('ui'); if (U) U.style.opacity = ''; } }
  }
  // The iris: the view darkens from its edges towards its centre until it is black, and opens again from the centre
  // outwards (the grade pass's uIris: about 1.35 fully open, 0 shut). By the wall clock, eased.
  iris(to, ms) {
    const U = this.gfx.grade.uniforms.uIris, from = Math.min(1.35, U.value), t0 = performance.now();
    return new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; U.value = from + (to - from) * e; if (k < 1) requestAnimationFrame(step); else { U.value = to >= 1.3 ? 2 : to; res(); } }; requestAnimationFrame(step); });
  }
  // Dissolves. The last drawn frame is copied into a canvas laid over the 3D view (under the interface), and what is
  // costly happens under it: building the next scene, compiling its programs, uploading its textures, its first frames.
  // Then the still fades away (a CSS transition, run by the compositor: it keeps its pace even while the page's own thread
  // or the GPU is busy) onto the new scene, already moving. A slow drift of the still hides that it has stopped.
  snapshot() {
    return new Promise(res => {
      let done = false; const fin = o => { if (done) return; done = true; res(o); };
      this.gfx._snap = cv => { const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; o.className = 'xfade'; o.setAttribute('aria-hidden', 'true'); o.getContext('2d').drawImage(cv, 0, 0); cv.insertAdjacentElement('afterend', o); fin(o); };
      setTimeout(() => { if (!done) { this.gfx._snap = null; fin(null); } }, 1200);   // nothing drawn meanwhile: carry on without one
    });
  }
  dissolve(o, ms = 1500, ui = false) {
    const U = ui && document.getElementById('ui'); if (U && U.style.opacity === '0') { U.style.transition = `opacity ${Math.round(ms * .8)}ms ease ${Math.round(ms * .25)}ms`; void U.offsetWidth; U.style.opacity = ''; setTimeout(() => { U.style.transition = ''; }, ms + 200); }
    if (!o) return; o.style.transition = `opacity ${ms}ms cubic-bezier(.45,0,.25,1)`; void o.offsetWidth; o.style.opacity = '0'; setTimeout(() => o.remove(), ms + 120); }
  // free GPU resources a few frames from now (after the next mode or rebuilt model has rendered once)
  retire(fn, frames = 3) { this.trash.push({ fn, frames }); }
  flushTrash() { if (!this.trash.length) return; const due = this.trash.filter(x => --x.frames <= 0); this.trash = this.trash.filter(x => x.frames > 0); due.forEach(x => { try { x.fn(); } catch (e) { console.warn(e); } }); }
  openHub(opts = {}) { this.route({}); sfx.ambience('library'); return this.switchMode(() => new Hub(this, opts)); }
  async openRoom(bookId, opts = {}) {
    const book = this.lib.books.find(b => b.id === bookId); if (!book) return this.openHub();
    this.route({ room: bookId, scroll: opts.openPart || null }); this.rememberRoom(bookId, opts.openPart);
    const data = await this.loadRoom(bookId);
    // a scroll the room no longer has (a stale link, a re-split book) leaves the address (replaced, not a new entry) and
    // the door's memory
    if (opts.openPart && !(data.parts || []).some(p => p.id === opts.openPart)) {
      opts = { ...opts, openPart: undefined }; this.rememberRoom(bookId, null);
      if (this.here && this.here.room === bookId && this.here.scroll) { const r0 = this._routing; this._routing = true; try { this.route({ room: bookId }); } finally { this._routing = r0; } }
    }
    sfx.ambience('room'); sfx.play('door', { gain: .6 });
    return this.switchMode(() => new BookRoom(this, book, data, opts));
  }
  openDiorama(spec, opts = {}) {
    const back = opts.returnTo;
    const o = Object.assign({}, opts, { onExit: () => { if (back && back.room) this.openRoom(back.room, { openPart: back.part }); else this.openHub(); } });
    // keep the scroll image visible during the fade: the flight starts after the switch
    const pre = (spec.environment && spec.environment.preset) || 'studio';
    sfx.ambience({ landscape: 'outdoor', ocean: 'ocean', cosmos: 'space', night: 'outdoor', micro: 'micro', lab: 'lab', abstract: 'studio', desk: 'studio' }[pre] || (spec.type === 'weatherglass' ? 'outdoor' : 'studio')); sfx.play('whoosh', { gain: .5 });
    return this.switchMode(() => new DioramaView(this, spec, o));
  }
  loop() {
    if (!this._inputHook) { this._inputHook = true; const mark = () => { this.lastInput = performance.now(); }; ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(k => addEventListener(k, mark, { passive: true, capture: true })); this.lastInput = performance.now(); }
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), raw = now - this.last, dt = Math.min(.05, raw / 1000); this.last = now; this.t += dt;
    if (this.gfx.lost) return;   // WebGL context lost: wait for it to come back (renderer.js)
    this.loopDt = raw / 1000;   // the wall-clock frame time (dt is capped at 50 ms): timed transitions (a cut's dip) read it, so a slow frame never stretches them
    if (this.mode) { try { this.mode.update(dt, this.t); } catch (e) { if (!this._errT || now - this._errT > 5000) { this._errT = now; console.error(e); } } }
    this.loopDt = 0;   // (an update driven by hand, outside this loop, steps by its own dt only)
    if (this.cine) this.stepCine(Math.min(.1, raw / 1000));   /* the app's camera moves (doors, arrivals) after the place's own update, by the wall clock (capped): a slow frame never stretches a door walk */
    this._placeT = (this._placeT || 0) + dt; if (this._placeT > 1.5) { this._placeT = 0; this.rememberPlace(); }
    // nothing to see under a closed veil (_switch); the old place's GPU resources wait for the new one's first drawn frames
    // a frame budget per place (docs/ARCHITECTURE.md, "Frame budget"): a still hall or room, or a room under an open
    // scroll, is drawn at a lower rate (the state still updates every frame); any input brings the full rate back at once
    if (!this.veilHold) {
      const cam = this.gfx.camera; let moved = false; if (cam) { const k = this._camK || (this._camK = new Float64Array(7)), v = [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w]; for (let i = 0; i < 7; i++) if (Math.abs(v[i] - k[i]) > 1e-5) { moved = true; k[i] = v[i]; } }   /* a moving camera is always drawn every frame */
      const fps = !moved && this.mode && this.mode.renderFps ? this.mode.renderFps(now - (this.lastInput || 0)) : 60; this._rAcc = (this._rAcc || 0) + raw;
      if (fps >= 60 || this._rAcc >= 1000 / fps - 4) { const full = fps >= 60 && this._lastFps >= 60; if (full) this.gfx.adapt(this._rAcc); else this.gfx.resetAdapt(); this._lastFps = fps; this._rAcc = 0; this.gfx.render(dt, this.t); this.flushTrash(); }
    }
    if (!this._firstFrame) { this._firstFrame = true; try { performance.mark('sm:first-frame'); } catch (e) { } }
  }
  // the context came back: environments are rebuilt by the renderer; reopen the current place so every render target is fresh
  async restoreMode() {
    const m = this.mode; if (!m) return;
    if (m instanceof DioramaView) return this.openDiorama(m.spec, Object.assign({}, m.opts, { skipIntro: true, fromRect: null, autoTransition: false }));
    if (m instanceof BookRoom) return this.openRoom(m.book.id);
    return this.openHub();
  }
  // ---------- seed library: subject bookcases with example books and flagship dioramas ----------
  seedLibrary() {
    this.seedRooms = new Map();
    const lib = { v: 3, hub: { w: 18, d: 12, h: 7 }, shelves: [], books: [] };
    const W = lib.hub.w, D = lib.hub.d;
    const sh = (name, kind, x, z, rot, color) => { const s = { id: 'sh-' + uid(), name, kind, x, z, rot, color }; lib.shelves.push(s); return s; };
    const physics = sh('Physics', 'horizontal', -4.6, -D / 2 + .28, 0, '#8a2a1e');
    const maths = sh('Mathematics', 'horizontal', 4.6, -D / 2 + .28, 0, '#2d5b8e');
    const chem = sh('Chemistry', 'vertical', -W / 2 + .28, -2.2, Math.PI / 2, '#3f7d6e');
    const bio = sh('Biology', 'vertical', -W / 2 + .28, .2, Math.PI / 2, '#6a8a3a');
    const econ = sh('Economics & Statistics', 'vertical', W / 2 - .28, -2.2, -Math.PI / 2, '#8f733a');
    const earth = sh('Earth Science', 'vertical', W / 2 - .28, .2, -Math.PI / 2, '#2f6f8f');
    const shelves = { physics, maths, chem, bio, econ, earth };
    const book = (shelf, title, parts, icon = 'EX') => {
      const b = { id: 'bk-' + uid(), title, shelf: shelf.id, tier: 0, slot: 0, color: shelf.color, icon, hasPdf: false, example: true };
      lib.books.push(b); this.seedRooms.set(b.id, { dims: { w: 12, d: 10, h: 5.5 }, seedStamp: SEED_STAMP, parts: parts.map(p => ({ id: 'p-' + uid(), ...p })) });
    };
    this.seedBooks().forEach(B => book(shelves[B.shelf], B.title, B.parts, B.icon));
    lib.domainBookV = DOMAIN_BOOK_VERSION;   /* seedBooks holds the explanatory compiler's example book; older libraries get it once (ensureDomainBook) */
    // Each bookcase's example books are spread evenly along its eye-level tier (1.25 m on the wide cases, 1.59 m on the
    // tall ones; the tier below once that is full), not packed from the left end: the k-th of n books on a tier of
    // `per` slots takes slot floor((k + ½)·per / n), so one book sits in the middle, two at a quarter and three quarters.
    lib.shelves.forEach(sh => {
      const u = caseLayout(sh), per = u.slotsPerTier, eye = sh.kind === 'horizontal' ? 2 : 3, mine = lib.books.filter(b => b.shelf === sh.id);
      const order = [eye, ...caseTierOrder(u).filter(t => t !== eye)];
      mine.forEach((b, i) => { const r = Math.floor(i / per), onTier = Math.min(per, mine.length - r * per), k = i - r * per; b.tier = order[Math.min(order.length - 1, r)]; b.slot = Math.min(per - 1, Math.floor((k + .5) * per / onTier)); });
    });
    return lib;
  }
  // The example books' content (parts without ids), in the chain format of docs/PROTOCOL.md: every part has its question
  // and subsections, every step its section and its place in the question thread (answers = the previous step's opens),
  // every demo its purpose. Also the source the saved example rooms are brought up to date from (threadFromSeeds).
  seedBooks() {
    const L = legacyScrolls(), C = o => JSON.parse(JSON.stringify(o));
    // the coverage map, from each step's section
    const covered = P => { P.analysis.coverage = (P.subsections || []).map(x => ({ subsection: x.id, steps: P.analysis.chain.filter(st => st.section === x.id).map(st => st.id) })); return P; };
    const asPart = s => covered({ title: s.title, summary: s.analysis.summary, subsections: C(s.subsections || []), analysis: normalizeChain(groundChain(C(s.analysis))) });
    const subs = list => list.map(([id, title]) => ({ id, num: id, title, level: 2 }));
    // a part built around one flagship scene; steps: {kind, title, statement, math?, bodies?, section, opens, demo?}.
    // The thread is unbroken by construction: step 1 answers the part's question, step k+1 answers step k's "opens".
    const scenePart = (spec, title, summary, { question, subsections, purpose }, steps) => covered({ title, summary, subsections: subs(subsections), analysis: normalizeChain(groundChain({ title, summary, question, sourceNote: 'Example diorama authored in the universal scene format (see docs/SCENE_SPEC.md).', chain: steps.map((s, i) => ({ id: 'S' + (i + 1), kind: s.kind, title: s.title, section: s.section, answers: i ? steps[i - 1].opens : question, opens: s.opens, statement: s.statement, math: s.math || '', from: i ? ['S' + i] : [], bodies: s.bodies || [], demos: i === steps.length - 1 || s.demo ? [{ ...C(spec), purpose, seedFp: sceneFp(spec) }] : [] })) })), pedestal: { step: 'S' + steps.length, demo: 0 } });
    const [water, galton, market, osmo] = FLAGSHIPS;
    return [
      { shelf: DOMAIN_BOOK.shelf, title: DOMAIN_BOOK.title, icon: DOMAIN_BOOK.icon, parts: this.domainParts() },
      { shelf: 'physics', title: 'Classical Mechanics', icon: 'PHY', parts: L[0].filter(s => /Pendulum|Projectiles|Five/.test(s.title)).map(asPart) },
      { shelf: 'earth', title: 'The Weather Glass', icon: 'ATM', parts: L[0].filter(s => /Weather/.test(s.title)).map(asPart) },
      { shelf: 'maths', title: 'Calculus & Linear Maps', icon: 'MATH', parts: L[1].map(asPart) },
      { shelf: 'chem', title: 'Collision Theory', icon: 'CHEM', parts: L[2].map(asPart) },
      { shelf: 'earth', title: 'The Water Cycle', icon: 'H2O', parts: [scenePart(water, 'The water cycle', 'Energy from the sun moves water from lake to cloud to mountain and back.', {
        question: 'How does energy from the sun move water from a lake into a cloud, onto a mountainside and back?',
        subsections: [['1.1', 'Evaporation'], ['1.2', 'Saturation'], ['1.3', 'Orographic rain']],
        purpose: 'Can you follow the water through the whole cycle: evaporation from the sunlit lake, a parcel rising to its dew point, orographic rain on the windward slope, and the dry, warm rain shadow beyond the crest?' }, [
        { kind: 'definition', title: 'Evaporation', section: '1.1', statement: 'Molecules at the surface of liquid water that gain enough energy escape as vapour; the rate grows with heating.', bodies: ['lake', 'sun'], opens: 'How much water vapour can collect above water at a given temperature?' },
        { kind: 'definition', title: 'Saturation', section: '1.2', statement: 'Air at a given temperature can hold at most a certain amount of water vapour; cooler air holds less.', bodies: ['air parcel'], opens: 'How does moist air carried over a mountain reach saturation and rain?' },
        { kind: 'result', title: 'Orographic rain', section: '1.3', statement: 'Wind forces moist air up a mountain slope; it expands, cools below saturation, and the excess condenses and falls as rain.', bodies: ['cloud', 'wind', 'mountains', 'rain'], opens: 'How will the cycle change as the climate warms, now that e_s rises about 6–7 % per kelvin?' }])] },
      { shelf: 'econ', title: 'Probability & the Bell Curve', icon: 'STAT', parts: [scenePart(galton, 'Galton board', 'A bell curve made of coin flips.', {
        question: 'Why do many independent left-or-right bounces pile up into a bell curve?',
        subsections: [['1.1', 'Bernoulli trials'], ['1.2', 'The binomial distribution'], ['1.3', 'The normal approximation']],
        purpose: 'Can you watch single random paths add up, bead by bead, into the binomial histogram and its normal curve, and see the pile shift and widen as p and N change?' }, [
        { kind: 'definition', title: 'Bernoulli trial', section: '1.1', statement: 'One random event with two outcomes: "right" with probability $p$, "left" with probability $1-p$.', bodies: ['peg', 'ball'], opens: 'How many right-bounces does a bead make in N independent trials?' },
        { kind: 'theorem', title: 'Binomial distribution', section: '1.2', statement: 'The number $K$ of right-bounces in $N$ independent trials satisfies $P(K=k)=\\binom{N}{k}p^k(1-p)^{N-k}$, with mean $Np$ and variance $Np(1-p)$.', math: 'P(K=k)=\\binom{N}{k}p^k(1-p)^{N-k}', bodies: ['bins'], opens: 'What curve does the binomial distribution approach when N is large?' },
        { kind: 'result', title: 'Normal approximation', section: '1.3', statement: 'For large $N$ the binomial is close to a normal curve with the same mean and spread (de Moivre–Laplace, a case of the central limit theorem).', bodies: ['curve', 'bins'], opens: 'Why do sums of other independent random steps, not only coin flips, also make a bell?' }])] },
      { shelf: 'econ', title: 'Markets', icon: 'ECON', parts: [scenePart(market, 'Supply and demand', 'How a market finds the price where buyers and sellers agree.', {
        question: 'How does a market find the price at which buyers and sellers agree?',
        subsections: [['1.1', 'Demand'], ['1.2', 'Supply'], ['1.3', 'Equilibrium']],
        purpose: 'Do random traders bound only by a no-loss rule really converge on the price where the staircases cross, and how do the price and the quantity move when demand, costs or the rules change?' }, [
        { kind: 'definition', title: 'Demand', section: '1.1', statement: 'At each price $p$, the quantity $D(p)$ buyers want; it falls as $p$ rises because fewer buyers value the good above the price.', bodies: ['buyers'], opens: 'How much do sellers offer at each price?' },
        { kind: 'definition', title: 'Supply', section: '1.2', statement: 'At each price $p$, the quantity $S(p)$ sellers offer; it rises with $p$ because more sellers cover their cost.', bodies: ['sellers'], opens: 'At what price do the quantities demanded and supplied match, and does trading actually reach it?' },
        { kind: 'result', title: 'Equilibrium', section: '1.3', statement: 'In a double auction, bids and asks meet at the stall; trade prices converge towards $p^*$ where $D(p^*)=S(p^*)$, even with random traders bound only by a no-loss rule (Smith 1962; Gode & Sunder 1993).', math: 'D(p^*)=S(p^*)', bodies: ['price', 'stall', 'curves'], opens: 'Would human traders, who learn and remember, reach the equilibrium faster or more reliably than these random ones?' }])] },
      { shelf: 'bio', title: 'Cell Membranes', icon: 'BIO', parts: [scenePart(osmo, 'Osmosis', 'Why water flows towards dissolved particles across a membrane.', {
        question: 'Why does water flow across a membrane towards dissolved particles, and what stops the flow?',
        subsections: [['1.1', 'The semi-permeable membrane'], ['1.2', 'Osmosis'], ['1.3', 'Osmotic pressure']],
        purpose: 'Can you see water cross the membrane, the solution column rise until its pressure balances the flow, and the flow reverse when a piston presses harder than the osmotic pressure?' }, [
        { kind: 'definition', title: 'Semi-permeable membrane', section: '1.1', statement: 'A barrier with pores that pass small solvent molecules (water) but not larger solute molecules.', bodies: ['membrane'], opens: 'Which way does water move when solute sits on only one side of the membrane?' },
        { kind: 'result', title: 'Osmosis', section: '1.2', statement: 'Water moves by diffusion across the membrane towards the side with more solute until the extra pressure there balances the flow.', bodies: ['water molecules', 'solute molecules'], opens: 'How large is the pressure that stops the flow?' },
        { kind: 'theorem', title: 'Osmotic pressure', section: '1.3', statement: 'For dilute solutions the balancing pressure is $\\pi = cRT$ (van \'t Hoff), proportional to the solute concentration.', math: '\\pi = cRT', bodies: ['water levels'], opens: 'What happens to a living cell placed in water that is saltier or fresher than its inside?' }])] }];
  }
  // Example rooms saved before the question thread existed: fill, from the current seeds, the part's question, subsections
  // and coverage map, each step's section/answers/opens, each demo's purpose and each lesson's question/opens/shot/pov.
  // Parts are matched by title (in the same book first), steps by id (and title), demos by type + title, lessons by title.
  // Only empty fields are filled, so nothing the reader changed is overwritten. Since v4 also the explanatory paragraphs
  // and the figures of the teaching boxes (seeds-figures.js), each only beside text that is still the seed's own.
  threadFromSeeds(book, room) {
    const books = this.seedBooks(), C = o => JSON.parse(JSON.stringify(o));
    const own = (books.find(x => x.title === book.title) || { parts: [] }).parts, all = books.flatMap(x => x.parts);
    const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
    const fill = (to, from, keys) => keys.forEach(k => { if (empty(to[k]) && !empty(from[k])) to[k] = C(from[k]); });
    let n = 0;
    for (const p of room.parts || []) {
      const s = own.find(x => x.title === p.title) || all.find(x => x.title === p.title);
      if (!s || !p.analysis || !Array.isArray(p.analysis.chain) || p.subOf) continue;
      fill(p, s, ['subsections']); fill(p.analysis, s.analysis, ['question']);
      for (const st of p.analysis.chain) {
        const ss = s.analysis.chain.find(x => x.id === st.id && x.title === st.title); if (!ss) continue;
        fill(st, ss, ['section', 'answers', 'opens']); n++;
        // explanatory paragraphs and teaching-box figures: added where the box is empty, or where its text is still the
        // seed's own (so a figure never illustrates words the learner rewrote); nothing the learner wrote is replaced
        const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim(), txt = p => typeof p === 'string' ? p : p && p.text;
        if (empty(st.explain) && !empty(ss.explain)) st.explain = C(ss.explain);
        else if (Array.isArray(st.explain) && Array.isArray(ss.explain)) st.explain.forEach((p, k) => { const sp = ss.explain[k]; if (p && sp && sp.figure && !(p && p.figure) && same(txt(p), sp.text)) st.explain[k] = { text: sp.text, figure: C(sp.figure) }; });
        for (const [t, fk] of [['intuition', 'intuitionFigure'], ['misconception', 'misconceptionFigure']]) {
          if (!ss[t]) continue;
          if (empty(st[t])) { st[t] = ss[t]; if (ss[fk]) st[fk] = C(ss[fk]); }
          else if (same(st[t], ss[t]) && !st[fk] && ss[fk]) st[fk] = C(ss[fk]);
        }
        if (ss.check && ss.check.q) {
          if (!st.check || !st.check.q) st.check = C(ss.check);
          else if (same(st.check.q, ss.check.q) && same(st.check.a, ss.check.a) && !st.check.figure && ss.check.figure) st.check.figure = C(ss.check.figure);
        }
        (st.demos || []).forEach(d => {
          const sd = (ss.demos || []).find(x => x.type === d.type && (x.title || '') === (d.title || '')); if (!sd) return;
          fill(d, sd, ['purpose', 'scale', 'tracks']);
          // lessons the learner never rewrote (every title is still a seed title) are replaced by the current seed lessons,
          // so lessons inserted or re-cued since (zooms, chains, tracks) reach saved example rooms; edited ones are only filled
          const sl0 = sd.lessons || [], titles = new Set(sl0.map(x => x && x.title));
          if (sl0.length && (d.lessons || []).every(l => l && titles.has(l.title))) { d.lessons = C(sl0); return; }
          (d.lessons || []).forEach(l => { const sl = l && l.title && (sd.lessons || []).find(x => x.title === l.title); if (sl) fill(l, sl, ['question', 'opens', 'shot', 'pov', 'chain', 'chainPace', 'chainOn', 'isolate', 'peel', 'zoom', 'track']); });
        });
      }
      // the coverage map follows the steps' sections
      if (empty(p.analysis.coverage) && (p.subsections || []).length) p.analysis.coverage = p.subsections.map(x => ({ subsection: x.id, steps: p.analysis.chain.filter(st => st.section === x.id).map(st => st.id) }));
    }
    return n;
  }
  // ---------- universal import / export (any AI can produce these files) ----------
  portDialog(bookId) {
    const book = bookId && this.lib.books.find(b => b.id === bookId);
    const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const out = (name, obj) => this.download(name, JSON.stringify(obj, null, 2));
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass wide' }, [
      el('h3', { text: 'Import / export' }),
      el('p', { class: 'dim', text: 'Everything is plain JSON in one documented format (docs/PROTOCOL.md). Any AI (another Claude account, ChatGPT, Gemini) can produce a room from your PDF with the prompt pack, and you import the result here.' }),
      el('div', { class: 'row wrap' }, [
        el('button', { class: 'btn', text: 'Copy the prompt pack', onclick: async () => { try { await navigator.clipboard.writeText(this.promptPack(book)); toast('Prompt pack copied'); } catch (e) { toast('Clipboard blocked: use Download instead'); } } }),
        el('button', { class: 'btn', text: 'Download prompt pack', onclick: () => this.download('scriptorium-prompt-pack.md', this.promptPack(book)) }),
        book ? el('button', { class: 'btn', text: 'Export this room', onclick: async () => out(book.title.replace(/\W+/g, '-') + '.room.json', { format: 'scriptorium-room/1', book: { title: book.title, pages: book.pages || null }, room: await this.loadRoom(book.id) }) }) : null,
        el('button', { class: 'btn', text: 'Export whole library', onclick: async () => { const rooms = {}; for (const b of this.lib.books) rooms[b.id] = await this.loadRoom(b.id); out('scriptorium-library.json', { format: 'scriptorium-library/1', library: this.lib, rooms }); } }),
        el('button', { class: 'btn primary', text: 'Import JSON…', onclick: () => file.click() })]),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Close', onclick: () => box.remove() })]), file])]);
    file.onchange = async () => { try { const j = JSON.parse(await file.files[0].text()); await this.importJSON(j, bookId); box.remove(); } catch (e) { toast('Could not import: ' + e.message); } };
    document.body.append(box);
  }
  async importJSON(j, bookId) {
    if (j.format === 'scriptorium-library/1' && j.library) { if (!Array.isArray(j.library.books) || !Array.isArray(j.library.shelves) || !j.library.hub) throw new Error('the library file has no bookcases or books'); this.lib = j.library; await store.set(LIB_KEY, this.lib); for (const id in (j.rooms || {})) await store.set('room:' + id, j.rooms[id]); toast('Library imported'); return this.openHub(); }
    const room = j.room || (j.parts ? j : null);
    if (room && Array.isArray(room.parts)) {
      room.parts.forEach(p => { p.id = p.id || 'p-' + uid(); if (p.analysis) normalizeChain(p.analysis); });
      if (bookId) { const cur = await this.loadRoom(bookId); room.dims = room.dims || cur.dims; await store.set('room:' + bookId, room); toast('Room imported'); return this.openRoom(bookId); }
      const shelf = this.firstShelf(); const title = String((j.book && j.book.title) || room.title || 'Imported book').slice(0, 300);
      const b = { id: 'bk-' + uid(), title, shelf: shelf.id, tier: 0, slot: this.lib.books.filter(x => x.shelf === shelf.id).length, color: shelf.color, icon: 'JSON', hasPdf: false };
      this.lib.books.push(b); this.saveLib(); await store.set('room:' + b.id, room); toast(`"${title}" added to ${shelf.name}`); return this.openHub();
    }
    if (j.chain) { toast('That is a single chain: open a scroll and use "Paste JSON from another AI".'); return; }
    if (j.type || j.bodies) { return this.openDiorama(j, {}); }
    throw new Error('Unrecognised JSON');
  }
  promptPack(book) {
    return `# Scriptorium Memorialium — prompt pack
Use these prompts with any AI that can read your PDF. Paste each JSON answer back into the app (open a scroll → "Paste JSON from another AI", or Import JSON for a whole room).

## 1. Split the book into parts
${splitPrompt({ book: book ? book.title : '<book title>', pages: book && book.pages || '<n>', outline: '' })}

## 2. Analyse one part into a logical chain (repeat per part)
${chapterPrompt({ book: book ? book.title : '<book title>', chapter: '<part title, pages a–b>', text: '<paste the part text, or attach the PDF and name the pages>' })}

## 3. Author a 3D diorama for a step
${authorPrompt({ request: '<what the diorama must show>', technique: 'card' })}

## 4. A whole room in one go (optional)
Return {"format":"scriptorium-room/1","book":{"title":str,"pages":n},"room":{"parts":[{"title":str,"startPage":n,"endPage":n,"summary":str,"analysis":${CHAIN_FORMAT}}]}}
`;
  }
  async download(name, text) {
    try { const d = window.claude && await claude.use('downloads'); if (d) { await d.save({ filename: name, data: text }); return; } } catch (e) { if (e && e.code === 'declined') return; }
    try { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast('Download blocked here: use Copy instead'); }
  }
}
// "+ Add PDF scroll" (and "+ Add PDF here" on a bookcase) open the guided dialog: place, pages, breakdown, analysis
App.prototype.addPdfDialog = function (opts = {}) { return openAddPdf(this, opts); };
App.prototype.cancelJob = function (bookId) { try { cancelJobFor(bookId); } catch (e) { console.warn(e); } };   // removing a book stops its analysis (js/hub/hub.js removeBook)
Hub.prototype.pickPDF = function (shelfId) { return openAddPdf(this.app, { hub: this, shelfId: shelfId || this.selShelf || null }); };
installBVH();   // accelerated raycasts (three-mesh-bvh); off with ?bvh=0, falls back to three's own raycast if it cannot load
const app = new App(); window.__scriptorium = app; app.bvh = BVH;
app.boot().catch(e => { console.error(e); app.fatal('Could not start: ' + e.message); });
