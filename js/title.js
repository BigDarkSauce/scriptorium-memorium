// The title screen. On the left, a cinematic showcase of the dioramas in your scriptorium: each one built live, fully
// materialised and running, seen through a slow camera move (an orbit, a low push-in, a crane descending, a close
// circle), a new diorama every few seconds through a soft dip to black. On the right, the menu: Continue (back to the
// very place you left, by a camera move into it), New scriptorium (a private slot of its own), Load scriptorium, Get a
// scroll, and the settings that already sit in the corner (sound, graphics quality).
import * as THREE from 'three';
import { DioramaScene } from './dio/scene.js';
import { is3D, needsAuthoring } from './room/reader.js';
import { DIO } from './dio/models.js';
import { el, toast, mathHTML, disposeTree, confirmBox } from './util.js';
import * as store from './store.js';
const sleep = ms => new Promise(r => setTimeout(r, ms)), frames = n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

const SHOT = 9.5, DIP = .45;
const ago = t => { if (!t) return ''; const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
// the dioramas this scriptorium holds (the room visited last first), up to 12; the built-in models if it holds none
async function showcase(app) {
  const out = [], L = app.lib.lastRoom, books = [...app.lib.books].sort((a, b) => (b.id === (L && L.book)) - (a.id === (L && L.book)));
  for (const b of books.slice(0, 14)) {
    const room = await store.get('room:' + b.id); if (!room || !Array.isArray(room.parts)) continue;
    for (const p of room.parts) for (const s of ((p.analysis || {}).chain || [])) for (const d of (s.demos || [])) if (is3D(d) && !needsAuthoring(d) && out.length < 40) out.push({ spec: d, book: b.title, part: p.title, step: s.title });
  }
  const seen = new Set(), pick = out.filter(x => { const k = (x.spec.type || '') + '|' + (x.spec.title || ''); if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); if (i > 2) [pick[i], pick[j]] = [pick[j], pick[i]]; }
  if (pick.length) return pick.slice(0, 12);
  return ['orbit', 'pendulum', 'doublependulum', 'wave', 'lens', 'reaction'].filter(t => DIO[t]).map(t => ({ spec: { type: t, title: DIO[t].title || t }, book: 'The built-in models', part: '' }));
}
export class TitleScreen {
  constructor(app) {
    this.app = app; this.gfx = app.gfx; this.t = 0; this.i = -1; this.items = []; this.ds = null; this.fixedRes = true;
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .1, 500);
    this._scene = new THREE.Scene(); this._scene.background = new THREE.Color('#0c0a08'); this.gfx.setView(this._scene, this.camera);
    // the dips between dioramas go through the title's own dark, not the paper colour the rest of the app fades through
    const G = this.gfx.grade.uniforms; this._fc = G.uFadeColor.value.clone(); G.uFadeColor.value.setRGB(.047, .039, .031);
    if (this.gfx.dpr > 1) { this.gfx.dpr = 1; this.gfx.resize(); }   // one steady resolution for the whole showcase (fixedRes)
    this.ui = el('div', { class: 'title-ui' }); app.ui.append(this.ui); this.buildUI();
    this.onResize = () => this.frame(); addEventListener('resize', this.onResize);
    this.ready = showcase(app).then(L => { this.items = L; if (!this.disposed) this.next(true); });
  }
  get scene() { return this.ds ? this.ds.scene : this._scene; }
  framing() { return !this.ds; }   // main.js waits under the veil until the first diorama stands
  // ---------- the showcase ----------
  // The change of diorama happens entirely in the dark: the screen dips to the title's dark, the next diorama is built
  // there (the build is a stall of a frame or two, unseen), its programs are compiled (in parallel where the GPU allows)
  // and one frame is drawn, still dark, so textures and shadows are on the GPU; only then does it fade in. Nothing is
  // compiled or uploaded on a visible frame, and the canvas is never resized (gfx.swapScene).
  async next(first) {
    if (!this.items.length || this.disposed || this.preparing) return; this.preparing = true;
    try {
      if (!first) await frames(2);   // the dark frame is on screen before the build stalls the thread
      let ds = null, tries = this.items.length;
      while (!ds && tries-- > 0 && !this.disposed) {
        this.i = (this.i + 1) % this.items.length; const it = this.items[this.i];
        try { ds = new DioramaScene(this.gfx, JSON.parse(JSON.stringify(it.spec))); ds.U.uFrontR.value = 1e5; ds.U.uJitter.value = 0; ds.U.uSeamK.value = 0; ds.step(.016); }
        catch (e) { console.warn('title showcase', e); ds = null; if (this.items.length > 1) { this.items.splice(this.i, 1); this.i--; } }
      }
      if (!ds || this.disposed) { if (ds) ds.dispose(); return; }
      const old = this.ds; this.shot = { kind: ['orbit', 'push', 'crane', 'circle'][this.i % 4], t: 0, dir: Math.random() < .5 ? -1 : 1 };
      this.ds = ds; this.frame(); this.pose(0);
      if (first) this.gfx.setView(ds.scene, this.camera); else this.gfx.swapScene(ds.scene, this.camera);
      if (this.gfx.prewarm) { try { await Promise.race([this.gfx.prewarm(ds.scene, this.camera), sleep(2500)]); } catch (e) { } }
      // run and drawn a few frames in the dark: textures uploaded, shadow maps drawn, and the variants a scene only switches
      // on once it runs (cloud shadows, effects that start with the first step) compiled there rather than on screen
      for (let f = 0; f < 6 && !this.disposed; f++) { await frames(1); try { ds.step(1 / 30); this.pose(); } catch (e) { } }
      this.shot.t = 0; this.fadeIn = 0;
      if (old) this.app.retire(() => { try { old.dispose(); } catch (e) { disposeTree(old.scene); } });
      if (!this.disposed) this.caption(this.items[this.i], first);
    } finally { this.preparing = false; }
  }
  // the subject sits in the left part of the frame: the camera's view is shifted (setViewOffset), not the scene
  frame() { const W = innerWidth, H = innerHeight; this.camera.aspect = W / H; this.camera.setViewOffset(W, H, W * .2, 0, W, H); this.camera.updateProjectionMatrix(); }
  pose() {
    const S = this.shot, o = this.ds.orb, k = Math.min(1, S.t / SHOT), tg = o.target.clone(), r0 = Math.max(2, o.r);
    let th = o.th, ph = o.ph, r = r0;
    if (S.kind === 'orbit') { th += S.dir * (-.5 + k) * .8; ph = o.ph * .96; }
    else if (S.kind === 'push') { th += S.dir * .35; ph = Math.min(1.42, o.ph + .18); r = r0 * (1.25 - .4 * k); tg.y -= r0 * .04; }
    else if (S.kind === 'crane') { th += S.dir * (.2 - .3 * k); ph = o.ph * (.62 + .36 * k); r = r0 * 1.12; }
    else { th += S.dir * k * 1.4; ph = o.ph * .9; r = r0 * .78; }
    const p = new THREE.Vector3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)).multiplyScalar(r).add(tg);
    this.camera.position.copy(p); this.camera.lookAt(tg);
  }
  update(dt) {
    if (!this.ds) return; const g = this.gfx.grade.uniforms.uFade;
    if (this.preparing) { if (!this.app.switching) g.value = 1; return; }   // held in the dark while the next one is made ready
    // the shot's clock is the wall clock (a slow frame never stretches a fade); the scene itself steps by the frame's dt
    const wall = Math.min(.1, this.app.loopDt || dt); this.ds.step(dt); this.shot.t += wall; this.pose();
    if (this.app.switching) return;
    const left = SHOT - this.shot.t;
    if (left < DIP) g.value = Math.min(1, 1 - left / DIP); else if (this.shot.t < DIP) g.value = Math.max(0, 1 - this.shot.t / DIP); else g.value = 0;
    if (left <= 0) { if (this.items.length > 1) this.next(); else this.shot.t = DIP; }
    this.prog.style.transform = `scaleX(${Math.min(1, this.shot.t / SHOT).toFixed(4)})`;
  }
  // ---------- the menu ----------
  buildUI() {
    const A = this.app, cur = A.slots.find(x => x.id === A.slotId) || A.slots[0];
    this.cap = el('div', { class: 'tt-cap' }); this.prog = el('i');
    const item = (label, sub, fn, cls = '') => el('button', { class: 'tt-item ' + cls, type: 'button', onclick: fn, onpointerenter: () => A.sfx && A.sfx.play('tick', { gain: .12 }) }, [el('span', { class: 'tt-l', text: label }), sub ? el('span', { class: 'tt-s', text: sub }) : null]);
    const menu = el('nav', { class: 'tt-menu', 'aria-label': 'Title menu' }, [
      item('Continue', cur ? `${cur.name} · ${cur.place || 'In the library hall'} · ${ago(cur.played)}` : '', () => this.go(() => A.continueSlot(A.slotId)), 'primary'),
      item('New scriptorium', 'A private library of your own, saved in this browser', () => this.newSlot()),
      item('Load scriptorium', `${A.slots.length} saved`, () => this.loadSlots()),
      item('Get a scroll', 'From what other readers have shared', () => this.go(async () => { await A.continueSlot(A.slotId); setTimeout(() => A.getScroll(), 1600); })),
    ]);
    this.panel = el('div', { class: 'tt-panel' });
    this.ui.append(el('div', { class: 'tt-rays', 'aria-hidden': 'true' }), el('div', { class: 'tt-motes', 'aria-hidden': 'true' }, Array.from({ length: 28 }, (_, i) => el('i', { style: `--x:${(i * 37) % 100}%;--d:${8 + (i * 7) % 11}s;--o:${(i * 13) % 10 / 10}` }))),
      el('header', { class: 'tt-head' }, [el('div', { class: 'tt-kicker', text: 'A library of living knowledge' }), el('h1', { class: 'tt-title' }, [el('span', { text: 'Scriptorium' }), el('span', { text: 'Memorialium' })]), el('div', { class: 'tt-rule' })]),
      menu, this.panel, el('div', { class: 'tt-saved', text: 'Everything is saved as you go, in this browser' }),
      el('div', { class: 'tt-capbox' }, [this.cap, el('div', { class: 'tt-prog' }, [this.prog])]));
    setTimeout(() => this.ui.classList.add('in'), 60);
  }
  caption(it, first) {
    this.cap.classList.remove('show'); void this.cap.offsetWidth;
    this.cap.innerHTML = ''; this.cap.append(el('div', { class: 'tt-ck', text: it.book + (it.part ? ' · ' + it.part : '') }), el('div', { class: 'tt-ct', html: mathHTML(it.spec.title || it.step || 'Diorama', 'label') }), el('div', { class: 'tt-cn', text: `${this.i + 1} / ${this.items.length}` }));
    setTimeout(() => this.cap.classList.add('show'), first ? 400 : 120);
  }
  go(fn) { if (this.leaving) return; this.leaving = true; this.ui.classList.add('out'); setTimeout(() => fn(), 380); }
  newSlot() {
    const name = el('input', { class: 'field', value: 'My scriptorium ' + (this.app.slots.length + 1), 'aria-label': 'Name' }), ex = el('input', { type: 'checkbox', checked: true });
    this.panel.innerHTML = ''; this.panel.append(el('div', { class: 'tt-card glass' }, [el('h3', { text: 'A new scriptorium' }), el('p', { class: 'dim small', text: 'Private to you: kept in this browser, with its own bookcases, scrolls and dioramas. Your other scriptoria stay as they are.' }),
      el('label', { text: 'Its name' }), name, el('label', { class: 'ap-check' }, [ex, ' Start with the example library (nine books, their scrolls and dioramas)']),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => { this.panel.innerHTML = ''; } }), el('button', { class: 'btn primary', text: 'Create and enter', onclick: () => this.go(() => this.app.createSlot(name.value.trim() || 'My scriptorium', ex.checked)) })])]));
    name.focus(); name.select();
  }
  loadSlots() {
    const A = this.app, list = el('div', { class: 'tt-slots' });
    const draw = () => { list.innerHTML = ''; [...A.slots].sort((a, b) => (b.played || 0) - (a.played || 0)).forEach(s => list.append(el('div', { class: 'tt-slot' + (s.id === A.slotId ? ' cur' : '') }, [
      el('button', { class: 'tt-slot-go', type: 'button', onclick: () => this.go(() => A.continueSlot(s.id)) }, [el('b', { text: s.name }), el('span', { class: 'dim small', text: [s.place || 'In the library hall', ago(s.played)].filter(Boolean).join(' · ') })]),
      el('button', { class: 'ibtn', title: 'Rename', 'aria-label': 'Rename ' + s.name, text: '✎', onclick: async () => { const n = prompt('A new name for this scriptorium', s.name); if (n && n.trim()) { await A.renameSlot(s.id, n.trim()); draw(); } } }),
      s.id === 'main' || s.id === A.slotId ? null : el('button', { class: 'ibtn', title: 'Delete', 'aria-label': 'Delete ' + s.name, text: '🗑', onclick: async () => { if (await confirmBox(`Delete the scriptorium “${s.name}” with all its scrolls? This cannot be undone.`, 'Delete')) { await A.deleteSlot(s.id); draw(); toast('Deleted'); } } })]))); };
    draw(); this.panel.innerHTML = ''; this.panel.append(el('div', { class: 'tt-card glass' }, [el('h3', { text: 'Your scriptoria' }), list, el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Close', onclick: () => { this.panel.innerHTML = ''; } })])]));
  }
  dispose() {
    this.disposed = true; removeEventListener('resize', this.onResize); this.camera.clearViewOffset(); this.ui.remove(); this.gfx.resetAdapt();
    // the app's own fade colour comes back once the next place has faded in (changing it under a closed veil would flash)
    const A = this.app, G = this.gfx.grade.uniforms, fc = this._fc, back = () => { if (A.mode instanceof TitleScreen) return; if (!A.switching && G.uFade.value < .01) G.uFadeColor.value.copy(fc); else requestAnimationFrame(back); }; requestAnimationFrame(back);
    if (this.ds) { const d = this.ds; this.ds = null; try { d.dispose(); } catch (e) { disposeTree(d.scene); } }
  }
}
