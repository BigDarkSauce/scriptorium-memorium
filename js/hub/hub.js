// The library hub: a cozy, resizable room where bookcases are placed, moved, rotated and named,
// PDFs are added as folded scrolls, and opening a scroll unfolds it in a shaft of light and carries you into its room.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeRoomShell } from '../gfx/roomshell.js';
import { makeBookcase, makeScroll, makeSheet, slotPos, SHELF_KINDS, armchair, readingDesk, statue } from './props.js';
import { Navigator } from '../nav.js';
import { el, clamp, uid, toast, promptBox, confirmBox, easeInOutQuint, easeOut, esc } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SUBJECT_COLORS = ['#8a2a1e', '#2d5b8e', '#3f7d6e', '#8f733a', '#6a4a8a', '#a0522d', '#2f4f6f', '#7a2a4a'];

export class Hub {
  constructor(app) {
    this.app = app; this.gfx = app.gfx; this.lib = app.lib;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0d0a07);
    this.scene.environment = this.gfx.envStudio; this.scene.environmentIntensity = .35;
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 120);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: .4, maxDistance: 14, maxPolarAngle: Math.PI * .56, screenSpacePanning: false, rotateSpeed: .6 });
    this.keys = {}; this.shelfObjs = new Map(); this.scrollObjs = new Map();
    this.ui = el('div', { class: 'hub-ui' }); app.ui.append(this.ui);
    this.buildRoom(); this.buildShelves(); this.buildUI();
    const R = this.lib.hub; this.camera.position.set(0, 1.7, R.d / 2 - 1.2); this.controls.target.set(0, 1.35, -R.d * .15); this.controls.update();
    this.gfx.setView(this.scene, this.camera);
    this.nav = new Navigator({ camera: this.camera, controls: this.controls, canvas: this.gfx.canvas, keys: this.keys, host: this.ui,
      bounds: () => ({ minX: -this.lib.hub.w / 2, maxX: this.lib.hub.w / 2, minZ: -this.lib.hub.d / 2, maxZ: this.lib.hub.d / 2, h: this.lib.hub.h }),
      obstacles: () => [...this.shelfObjs.values(), ...(this.furn ? this.furn.children : []), ...(this.solids || [])].map(o => new THREE.Box3().setFromObject(o)).concat([...(((this.shell && this.shell.userData.baroque && this.shell.userData.baroque.obstacles) || []).map(q => new THREE.Box3(new THREE.Vector3(q.x - q.r, 0, q.z - q.r), new THREE.Vector3(q.x + q.r, 1.8, q.z + q.r))))]) });
    this.onKeyD = e => { if (e.target.closest('input,textarea,select')) return; this.keys[e.key.toLowerCase()] = true; if (e.key === 'v' || e.key === 'V') this.nav.toggle(); if (e.key === 'Escape') this.selectShelf(null); if (e.key === 'Delete' && this.selShelf && this.build) this.deleteShelf(this.selShelf); };
    this.onKeyU = e => { this.keys[e.key.toLowerCase()] = false; };
    addEventListener('keydown', this.onKeyD); addEventListener('keyup', this.onKeyU);
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e);
    this.gfx.canvas.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
  }
  // ---------- world ----------
  buildRoom() {
    if (this.shell) { this.scene.remove(this.shell); this.shell.userData.dispose && this.shell.userData.dispose(); }
    const R = this.lib.hub; if (R.w === 15 && R.d === 12 && R.h === 4.8) Object.assign(R, { w: 18, d: 12, h: 7 });   // old default → the baroque hall with its gallery
    this.shell = makeRoomShell({ w: R.w, d: R.d, h: R.h, style: 'baroque', windowWall: 'back', palette: 'rose', floor: 'diagonal' }); this.scene.add(this.shell);
    if (!this.furn) { this.furn = new THREE.Group(); this.scene.add(this.furn); }
    this.furn.clear();
    const ch = armchair(); ch.position.set(-R.w / 2 + 2.2, 0, R.d / 2 - 2.4); ch.rotation.y = .6; this.furn.add(ch);
    const dk = readingDesk(); dk.position.set(R.w / 2 - 2.4, 0, R.d / 2 - 2.6); dk.rotation.y = -.4; this.furn.add(dk); this.desk = dk;
    // baroque: allegorical statues framing the window wall (back corners), facing the hall
    [-1, 1].forEach((sd, i) => { const st = statue({ variant: i ? 1 : 0, seed: i + 1 }); st.position.set(sd * (R.w / 2 - 1.15), 0, -R.d / 2 + 1.15); st.rotation.y = sd * -.75; this.furn.add(st); });
    this.floorPlane = new THREE.Plane(V3(0, 1, 0), 0);
  }
  buildShelves() {
    this.shelfObjs.forEach(o => o.removeFromParent()); this.shelfObjs.clear(); this.scrollObjs.clear();
    this.lib.shelves.forEach(s => this.addShelfObj(s));
    this.lib.books.forEach(b => this.addScrollObj(b));
  }
  addShelfObj(s) { const o = makeBookcase(s); o.position.set(s.x, 0, s.z); o.rotation.y = s.rot || 0; this.scene.add(o); this.shelfObjs.set(s.id, o); return o; }
  addScrollObj(b) {
    const so = this.shelfObjs.get(b.shelf); if (!so) return null;
    const o = makeScroll(b); const p = slotPos(so, b.tier || 0, b.slot || 0); o.position.copy(p); so.add(o); this.scrollObjs.set(b.id, o); return o;
  }
  freeSlot(shelf) {
    const so = this.shelfObjs.get(shelf.id); if (!so) return null; const u = so.userData, used = new Set(this.lib.books.filter(b => b.shelf === shelf.id).map(b => (b.tier || 0) + ':' + (b.slot || 0)));
    for (let t = u.tiers - 1; t >= 0; t--) for (let s = 0; s < u.slotsPerTier; s++) if (!used.has(t + ':' + s)) return { tier: t, slot: s };
    return null;
  }
  // ---------- UI ----------
  buildUI() {
    const u = this.ui;
    u.append(el('div', { class: 'brand' }, [el('div', { class: 'brand-title', text: 'Scriptorium Memorium' }), el('div', { class: 'brand-sub', text: 'your library' })]));
    this.buildBtn = el('button', { class: 'btn', text: 'Arrange library', onclick: () => this.toggleBuild() });
    const add = el('button', { class: 'btn primary', text: '+ Add PDF scroll', onclick: () => this.pickPDF() });
    const more = el('button', { class: 'btn ghost', text: 'Import / export', onclick: () => this.app.portDialog() });
    u.append(el('div', { class: 'hub-actions glass' }, [add, this.buildBtn, more]));
    this.hint = el('div', { class: 'hint glass', text: 'Drag to look · WASD to walk (Shift hurries) · V: first-person walk · click a scroll to open it' }); u.append(this.hint);
    this.tip = el('div', { class: 'tooltip', hidden: true }); u.append(this.tip);
    this.buildPanel = el('aside', { class: 'side-panel glass', hidden: true }); u.append(this.buildPanel);
    this.fileIn = el('input', { type: 'file', accept: 'application/pdf', multiple: true, hidden: true }); u.append(this.fileIn);
    this.fileIn.onchange = () => { [...this.fileIn.files].forEach(f => this.addPDF(f)); this.fileIn.value = ''; };
  }
  toggleBuild(on = !this.build) {
    this.build = on; this.buildBtn.classList.toggle('on', on); this.buildBtn.textContent = on ? 'Done arranging' : 'Arrange library';
    this.buildPanel.hidden = !on; this.hint.textContent = on ? 'Click a bookcase to select it · drag it along the floor · it snaps to walls' : 'Drag to look · WASD to walk (Shift hurries) · V: first-person walk · click a scroll to open it';
    if (!on) this.selectShelf(null); this.renderBuildPanel();
  }
  renderBuildPanel() {
    const P = this.buildPanel, R = this.lib.hub; P.innerHTML = '';
    P.append(el('h3', { text: 'Arrange the library' }));
    P.append(el('div', { class: 'row wrap' }, [el('button', { class: 'btn small', text: '+ Horizontal bookcase', onclick: () => this.addShelf('horizontal') }), el('button', { class: 'btn small', text: '+ Vertical bookcase', onclick: () => this.addShelf('vertical') })]));
    P.append(el('h4', { text: 'Room size' }));
    [['w', 'Width', 8, 40], ['d', 'Depth', 8, 40], ['h', 'Height', 3.2, 9]].forEach(([k, label, a, b]) => {
      const out = el('b', { text: R[k].toFixed(1) + ' m' }), inp = el('input', { type: 'range', min: a, max: b, step: .1, value: R[k], 'aria-label': label });
      inp.oninput = () => { out.textContent = (+inp.value).toFixed(1) + ' m'; };
      inp.onchange = () => { R[k] = +inp.value; this.buildRoom(); this.clampShelves(); this.app.saveLib(); };
      P.append(el('label', { class: 'ctrl' }, [el('span', {}, [label, out]), inp]));
    });
    const s = this.selShelf && this.lib.shelves.find(x => x.id === this.selShelf);
    if (s) {
      const n = this.lib.books.filter(b => b.shelf === s.id).length;
      P.append(el('h4', { text: 'Selected bookcase' }),
        el('div', { class: 'shelf-name' }, [el('b', { text: s.name }), el('span', { class: 'dim small', text: ` · ${s.kind} · ${n} scroll${n === 1 ? '' : 's'}` })]),
        el('div', { class: 'row wrap' }, [
          el('button', { class: 'btn small', text: 'Rename', onclick: async () => { const v = await promptBox('Subject of this bookcase', s.name); if (v) { s.name = v; this.rebuildShelf(s); this.app.saveLib(); this.renderBuildPanel(); } } }),
          el('button', { class: 'btn small', text: '⟲ 90°', onclick: () => { s.rot = (s.rot || 0) + Math.PI / 2; this.rebuildShelf(s); this.app.saveLib(); } }),
          el('button', { class: 'btn small', text: '⟳ 15°', onclick: () => { s.rot = (s.rot || 0) - Math.PI / 12; this.rebuildShelf(s); this.app.saveLib(); } }),
          el('button', { class: 'btn small', text: s.kind === 'horizontal' ? 'Make vertical' : 'Make horizontal', onclick: () => { s.kind = s.kind === 'horizontal' ? 'vertical' : 'horizontal'; this.reflowBooks(s); this.rebuildShelf(s); this.app.saveLib(); this.renderBuildPanel(); } }),
          el('button', { class: 'btn small', text: '+ Add PDF here', onclick: () => this.pickPDF(s.id) }),
          el('button', { class: 'btn small danger', text: 'Remove', onclick: () => this.deleteShelf(s.id) })]));
    }
    P.append(el('p', { class: 'dim small', text: 'Tip: name each bookcase by subject (Maths, Physics, Biology…). Bookcases snap flush to the nearest wall.' }));
  }
  addShelf(kind) {
    const R = this.lib.hub, dir = V3(); this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const p = this.controls.target.clone().addScaledVector(dir, .5);
    const s = { id: 'sh-' + uid(), name: kind === 'horizontal' ? 'New subject' : 'New subject', kind, x: clamp(p.x, -R.w / 2 + 1, R.w / 2 - 1), z: clamp(p.z, -R.d / 2 + 1, R.d / 2 - 1), rot: Math.atan2(-dir.x, -dir.z), color: SUBJECT_COLORS[this.lib.shelves.length % SUBJECT_COLORS.length] };
    this.snap(s); this.lib.shelves.push(s); this.addShelfObj(s); this.selectShelf(s.id); this.app.saveLib();
    promptBox('Name this bookcase (its subject)', s.name).then(v => { if (v) { s.name = v; this.rebuildShelf(s); this.app.saveLib(); this.renderBuildPanel(); } });
  }
  rebuildShelf(s) {
    const old = this.shelfObjs.get(s.id); if (old) old.removeFromParent(); this.shelfObjs.delete(s.id);
    this.addShelfObj(s); this.lib.books.filter(b => b.shelf === s.id).forEach(b => this.addScrollObj(b));
    if (this.selShelf === s.id) this.highlight(this.shelfObjs.get(s.id));
  }
  reflowBooks(s) {
    const K = SHELF_KINDS[s.kind], per = Math.max(1, Math.floor((K.w - .2) / .17)); let i = 0;
    this.lib.books.filter(b => b.shelf === s.id).forEach(b => { b.tier = K.tiers - 1 - Math.floor(i / per); b.slot = i % per; i++; if (b.tier < 0) { b.tier = 0; } });
  }
  async deleteShelf(id) {
    const s = this.lib.shelves.find(x => x.id === id); if (!s) return;
    const books = this.lib.books.filter(b => b.shelf === id);
    if (books.length && !(await confirmBox(`Remove "${s.name}"? Its ${books.length} scroll(s) move to another bookcase.`, 'Remove'))) return;
    this.lib.shelves = this.lib.shelves.filter(x => x !== s); const o = this.shelfObjs.get(id); if (o) o.removeFromParent(); this.shelfObjs.delete(id);
    books.forEach(b => { const target = this.lib.shelves.find(x => this.freeSlot(x)) || this.makeDefaultShelf(); const fs = this.freeSlot(target); Object.assign(b, { shelf: target.id, tier: fs.tier, slot: fs.slot }); this.addScrollObj(b); });
    this.selectShelf(null); this.app.saveLib();
  }
  makeDefaultShelf() { const R = this.lib.hub; const s = { id: 'sh-' + uid(), name: 'Unsorted', kind: 'vertical', x: -R.w / 2 + .5, z: 0, rot: Math.PI / 2 }; this.snap(s); this.lib.shelves.push(s); this.addShelfObj(s); return s; }
  snap(s) {
    const R = this.lib.hub, K = SHELF_KINDS[s.kind], half = K.d / 2 + .03, lim = .9;
    const cands = [{ d: s.z + R.d / 2, set: () => { s.z = -R.d / 2 + half; s.rot = 0; } }, { d: R.d / 2 - s.z, set: () => { s.z = R.d / 2 - half; s.rot = Math.PI; } }, { d: s.x + R.w / 2, set: () => { s.x = -R.w / 2 + half; s.rot = Math.PI / 2; } }, { d: R.w / 2 - s.x, set: () => { s.x = R.w / 2 - half; s.rot = -Math.PI / 2; } }].sort((a, b) => a.d - b.d);
    if (cands[0].d < lim) cands[0].set();
    s.x = clamp(s.x, -R.w / 2 + .3, R.w / 2 - .3); s.z = clamp(s.z, -R.d / 2 + .3, R.d / 2 - .3);
  }
  clampShelves() { this.lib.shelves.forEach(s => { this.snap(s); const o = this.shelfObjs.get(s.id); if (o) { o.position.set(s.x, 0, s.z); o.rotation.y = s.rot; } }); }
  selectShelf(id) { this.selShelf = id; this.highlight(id ? this.shelfObjs.get(id) : null); if (this.build) this.renderBuildPanel(); }
  highlight(o) { this.gfx.outline.enabled = !!o; this.gfx.outline.selectedObjects = o ? [o] : []; }
  // ---------- books ----------
  pickPDF(shelfId) { this.addTarget = shelfId || this.selShelf || null; this.fileIn.click(); }
  async addPDF(file) {
    const id = 'bk-' + uid(); const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    let shelf = this.lib.shelves.find(s => s.id === this.addTarget && this.freeSlot(s)) || this.lib.shelves.find(s => this.freeSlot(s)) || this.makeDefaultShelf();
    const fs = this.freeSlot(shelf); const b = { id, title, shelf: shelf.id, tier: fs.tier, slot: fs.slot, color: shelf.color, icon: 'PDF', hasPdf: true, added: Date.now(), size: file.size };
    await this.app.store.set('pdf:' + id, file);
    this.lib.books.push(b); const o = this.addScrollObj(b); this.app.saveLib();
    if (o) { o.userData.arrive = 0; o.scale.setScalar(.01); }
    toast(`"${title}" placed on ${shelf.name}`);
    this.app.ingest.pageCount(file).then(n => { if (n) { b.pages = n; this.app.saveLib(); } }).catch(() => {});
  }
  async removeBook(id) { this.lib.books = this.lib.books.filter(b => b.id !== id); const o = this.scrollObjs.get(id); if (o) o.removeFromParent(); this.app.saveLib(); await this.app.store.del('pdf:' + id); await this.app.store.del('room:' + id); }
  // ---------- pointer ----------
  pick(e, list) { const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera); return this.ray.intersectObjects(list, true); }
  ownerOf(o, kind) { while (o && !(o.userData && o.userData.kind === kind)) o = o.parent; return o; }
  pointerDown(e) {
    if (this.opening) return; this.down = { x: e.clientX, y: e.clientY };
    if (this.build) { const h = this.pick(e, [...this.shelfObjs.values()])[0]; const sh = h && this.ownerOf(h.object, 'shelf'); if (sh) { this.selectShelf(sh.userData.shelfId); this.dragging = sh; this.controls.enabled = false; } }
  }
  pointerMove(e) {
    if (this.opening || !e.target || e.target !== this.gfx.canvas) { if (!this.dragging) { this.tip.hidden = true; } }
    if (this.dragging) {
      const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera);
      const p = V3(); if (this.ray.ray.intersectPlane(this.floorPlane, p)) { const s = this.lib.shelves.find(x => x.id === this.dragging.userData.shelfId); s.x = p.x; s.z = p.z; this.snap(s); this.dragging.position.set(s.x, 0, s.z); this.dragging.rotation.y = s.rot; }
      return;
    }
    if (e.target !== this.gfx.canvas || this.build) return;
    const h = this.pick(e, [...this.scrollObjs.values()])[0]; const sc = h && this.ownerOf(h.object, 'scroll');
    if (sc !== this.hover) { if (this.hover) this.hover.userData.paper.emissiveIntensity = 0; this.hover = sc; if (sc) sc.userData.paper.emissiveIntensity = .25; this.gfx.canvas.style.cursor = sc ? 'pointer' : ''; }
    if (sc) { const b = this.lib.books.find(x => x.id === sc.userData.bookId); this.tip.hidden = false; this.tip.innerHTML = `<b>${esc(b.title)}</b><span>${b.pages ? b.pages + ' pages · ' : ''}${esc((this.lib.shelves.find(s => s.id === b.shelf) || {}).name || '')}</span>`; this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`; } else this.tip.hidden = true;
  }
  pointerUp(e) {
    if (this.dragging) { this.dragging = null; this.controls.enabled = this.nav.mode !== 'walk'; this.app.saveLib(); return; }
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || e.target !== this.gfx.canvas) return; this.down = null;
    if (this.build) { const h = this.pick(e, [...this.shelfObjs.values()])[0]; if (!h) this.selectShelf(null); return; }
    const h = this.pick(e, [...this.scrollObjs.values()])[0]; const sc = h && this.ownerOf(h.object, 'scroll');
    if (sc) this.openScroll(sc);
  }
  // ---------- the opening: fly → lift → unfold in light → dive into the page ----------
  openScroll(sc) {
    const b = this.lib.books.find(x => x.id === sc.userData.bookId); if (!b) return;
    this.opening = { sc, b, t: 0 }; this.controls.enabled = false; this.tip.hidden = true; this.highlight(null);
    const wp = sc.getWorldPosition(V3()), so = sc.parent, outward = V3(0, 0, 1).applyQuaternion(so.getWorldQuaternion(new THREE.Quaternion()));
    if (this.nav.mode === 'walk') { const f = V3(); this.camera.getWorldDirection(f); this.controls.target.copy(this.camera.position).addScaledVector(f, 1.6); }
    const O = this.opening; O.from = { p: this.camera.position.clone(), t: this.controls.target.clone() };
    O.liftTo = wp.clone().addScaledVector(outward, .55).setY(Math.max(1.35, wp.y)); O.camTo = O.liftTo.clone().addScaledVector(outward, .95).add(V3(0, .05, 0));
    O.start = wp.clone(); O.q0 = sc.getWorldQuaternion(new THREE.Quaternion());
    // reparent to the scene so it can float free
    this.scene.attach(sc); O.sheet = makeSheet(.4, .62); sc.add(O.sheet); O.sheet.position.set(0, -.05, 0); O.sheet.rotation.y = 0;
    O.face = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(O.camTo, O.liftTo, V3(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2));
    O.light = new THREE.PointLight(0xffe2a8, 0, 6, 2); sc.add(O.light); O.light.position.set(0, -.3, .3);
    this.hint.textContent = 'Opening "' + b.title + '"…';
  }
  stepOpening(dt) {
    const O = this.opening; O.t += dt; const t = O.t, c = this.camera, sc = O.sc;
    const k1 = easeInOutQuint(Math.min(1, t / 1.3));
    c.position.lerpVectors(O.from.p, O.camTo, k1); this.controls.target.lerpVectors(O.from.t, O.liftTo, k1); c.lookAt(this.controls.target);
    const k2 = easeOut(clamp((t - .35) / 1.0, 0, 1)); sc.position.lerpVectors(O.start, O.liftTo, k2); sc.quaternion.slerpQuaternions(O.q0, O.face, k2);
    const k3 = clamp((t - 1.35) / 1.25, 0, 1), e3 = easeInOutQuint(k3);
    O.sheet.scale.y = Math.max(.001, e3); sc.rotation.z += 0; O.sheet.material.emissiveIntensity = e3 * 1.6; O.light.intensity = e3 * 6; sc.userData.paper.emissiveIntensity = e3 * .8;
    this.gfx.bloom.strength = .32 + e3 * .5;
    const k4 = clamp((t - 2.7) / 1.1, 0, 1), e4 = easeInOutQuint(k4);
    if (k4 > 0) { const into = O.liftTo.clone().add(V3(0, -.3, 0)); c.position.lerpVectors(O.camTo, into.clone().lerp(O.camTo, .18), e4); this.controls.target.copy(into); c.lookAt(into); this.gfx.grade.uniforms.uFade.value = e4; }
    if (t > 3.85 && !O.done) { O.done = true; this.gfx.bloom.strength = .32; this.app.openRoom(O.b.id, { fromHub: true }); }
  }
  // ---------- frame ----------
  update(dt) {
    if (this.opening) { this.stepOpening(dt); return; }
    // walking (overview or first person) — see js/nav.js
    this.nav.update(dt, !!this.dragging);
    this.scrollObjs.forEach(o => { if (o.userData.arrive != null) { o.userData.arrive = Math.min(1, o.userData.arrive + dt * 1.4); o.scale.setScalar(easeOut(o.userData.arrive) || .01); if (o.userData.arrive >= 1) delete o.userData.arrive; } });
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    removeEventListener('keydown', this.onKeyD); removeEventListener('keyup', this.onKeyU);
    this.gfx.canvas.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.nav.dispose(); this.controls.dispose(); this.highlight(null); this.ui.remove(); this.gfx.canvas.style.cursor = '';
  }
}
