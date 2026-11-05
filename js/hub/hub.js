// The library hub: a cozy, resizable room where bookcases are placed, moved, rotated and named,
// PDFs are added as folded scrolls, and opening a scroll unfolds it in a shaft of light and carries you into its room.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeRoomShell } from '../gfx/roomshell.js';
import { makeBookcase, makeScroll, makeSheet, slotPos, setRestTiers, SHELF_KINDS, armchair, readingDesk, displayColumn, readingTable, bench, globeStand, runner, quietShadows, lightPool } from './props.js';
import { Navigator } from '../nav.js';
import { el, clamp, uid, toast, promptBox, confirmBox, easeInOutQuint, easeOut, ease, esc, disposeTree } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TOUCH = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
// the bottom hint, worded for the device in hand (touch screens have no WASD / V keys)
const HINTS = {
  look: () => TOUCH() ? 'Drag to look · pinch to zoom · tap a scroll to open it' : 'Drag to look · WASD walks (Shift: faster) · V: first person · click a scroll to open it',
  build: () => TOUCH() ? 'Tap a bookcase to select it · drag it along the floor · it snaps to walls' : 'Click a bookcase to select it · drag it along the floor · it snaps to walls'
};
const SUBJECT_COLORS = ['#8a2a1e', '#2d5b8e', '#3f7d6e', '#8f733a', '#6a4a8a', '#a0522d', '#2f4f6f', '#7a2a4a'];

export class Hub {
  constructor(app) {
    this.app = app; this.gfx = app.gfx; this.lib = app.lib;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0d0a07);
    this.scene.environment = this.gfx.envStudio; this.scene.environmentIntensity = .16;
    // crisp warm daylight (renderer.js), a step less exposure than the house look: the surround sits lower and the hero,
    // under its own key light, separates from it (presentation-craft value check); set before setView
    // bloom kept to the flames and the sky itself (threshold above the sunlit stucco), so the window wall stays clear and warm
    this.scene.userData.look = Object.assign(this.gfx.constructor.HOUSE, { exposure: 1.2, vignette: .36, bloom: .15, bloomThreshold: 2.1 });
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 120);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: .4, maxDistance: 14, maxPolarAngle: Math.PI * .56, screenSpacePanning: false, rotateSpeed: .6 });
    this.keys = {}; this.shelfObjs = new Map(); this.scrollObjs = new Map();
    this.ui = el('div', { class: 'hub-ui' }); app.ui.append(this.ui);
    // the hero's key light: one warm spot (always present, so the light count and the shaders never change), aimed at
    // the bookcase holding the user's newest scrolls; every bookcase with scrolls also gets a warm pool on the floor
    this.key = new THREE.SpotLight(0xffeedd, 0, 0, .5, .75, 2); this.key.castShadow = false; this.key.name = 'hero-key'; this.scene.add(this.key, this.key.target);
    this.buildRoom(); this.buildShelves(); this.buildUI();
    this.frameHero(); this.syncGlow();
    this.gfx.setView(this.scene, this.camera);
    this.nav = new Navigator({ camera: this.camera, controls: this.controls, canvas: this.gfx.canvas, keys: this.keys, host: this.ui,
      bounds: () => { const c = this.caseDepth(); return { minX: -this.lib.hub.w / 2 + c, maxX: this.lib.hub.w / 2 - c, minZ: -this.lib.hub.d / 2 + c, maxZ: this.lib.hub.d / 2 - c, h: this.lib.hub.h }; },
      obstacles: () => this.obstacles() });
    this._obsFn = () => [...this.shelfObjs.values(), ...(this.furn ? this.furn.children.filter(o => o.visible) : []), ...(this.solids || [])].map(o => new THREE.Box3().setFromObject(o)).concat([...(((this.shell && this.shell.userData.baroque && this.shell.userData.baroque.obstacles) || []).map(q => new THREE.Box3(new THREE.Vector3(q.x - q.r, 0, q.z - q.r), new THREE.Vector3(q.x + q.r, 1.8, q.z + q.r))))]);
    this.onKeyD = e => { if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return; this.keys[e.key.toLowerCase()] = true; if (e.key === 'v' || e.key === 'V') this.nav.toggle(); if (e.key === 'Escape') { if (this.opening) this.cancelOpening(); else this.selectShelf(null); } if (e.key === 'Delete' && this.selShelf && this.build) this.deleteShelf(this.selShelf); };
    this.onKeyU = e => { this.keys[e.key.toLowerCase()] = false; };
    addEventListener('keydown', this.onKeyD); addEventListener('keyup', this.onKeyU);
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e);
    this.gfx.canvas.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
  }
  // ---------- world ----------
  // fast: a live preview while a room-size slider is dragged (rebuilt at most every ~150 ms): the shell is built
  // without its wall-case books and pier ornaments, sconces and chandelier metalwork (same lights, so no shader recompiles), and the furniture is only moved, not rebuilt;
  // releasing the slider builds everything. A size the shell cannot be built at leaves the current room in place.
  buildRoom(fast = false) {
    const R = this.lib.hub; if (R.w === 15 && R.d === 12 && R.h === 4.8) Object.assign(R, { w: 18, d: 12, h: 7 });   // old default → the baroque hall with its gallery
    // Admont-like white-and-gold wall bookcases line every wall; sections behind the user's bookcases are left out
    let shell;
    try { shell = makeRoomShell({ w: R.w, d: R.d, h: R.h, style: 'baroque', windowWall: 'back', palette: 'rose', floor: 'diagonal', cases: 'white', caseSkip: this.caseSkip(), fast }); }
    catch (e) { console.error(e); if (!fast) toast('Could not build the room at this size'); return false; }
    const gone = [];   // the old shell and furniture are freed once the rebuilt room has drawn
    if (this.shell) { this.scene.remove(this.shell); gone.push(this.shell); }
    this.shell = shell; this.scene.add(shell); shell.userData.dims = { w: R.w, d: R.d, h: R.h };
    if (!this.furn) { this.furn = new THREE.Group(); this.scene.add(this.furn); }
    if (!this.decor) { this.decor = new THREE.Group(); this.scene.add(this.decor); }
    if (!fast || !this.furn.children.length) { gone.push(...this.furn.children); this.furn.clear(); this.buildFurniture(); }
    this.placeFurniture();
    if (gone.length) this.trash(gone);
    this.floorPlane = new THREE.Plane(V3(0, 1, 0), 0); this.obstaclesDirty = true; this.shadowsDirty = true;
    return true;
  }
  // the reading floor: two reading tables with lecterns and benches, two globes, a fauteuil, a desk, and two display
  // columns of the classical orders framing the window wall (back corners): a Corinthian column in pavonazzetto and a
  // Solomonic one in rosso antico, both with gilt capitals, on pedestals, each carrying an entablature fragment.
  // Each piece's userData.place(R, c) sets its position from the room size (placeFurniture).
  buildFurniture() {
    const R = this.lib.hub, F = this.furn, tl = clamp(R.d * .2, 1.6, 3.0), info = (this.shell && this.shell.userData.baroque) || {};
    const at = (o, fn) => { o.userData.place = fn; F.add(o); return o; };
    const lay = (R, c) => { const tx = clamp(R.w * .13, 1.9, 3.2); return { tx, tz: -R.d * .05 }; };
    [-1, 1].forEach(sd => {
      at(readingTable({ L: tl }), (R, c) => { const { tx, tz } = lay(R, c); return [sd * tx, tz, 0]; });
      [-1, 1].forEach(k => at(bench({ L: tl - .3 }), (R, c) => { const { tx, tz } = lay(R, c); return [sd * tx + k * .78, tz, 0]; }));
      at(globeStand({ celestial: sd > 0 }), (R, c) => { const { tx } = lay(R, c); return R.d >= 9 && R.w >= 10 ? [sd * tx, -R.d / 2 + c + 1.9, sd * .5] : null; });
    });
    at(armchair(), R => [-R.w / 2 + 2.2, R.d / 2 - 2.4, .6]);
    this.desk = at(readingDesk(), R => [R.w / 2 - 2.4, R.d / 2 - 2.6, -.4]);
    const H = clamp((info.yE || 5.3) * .6, 2.1, 3.3), pH = clamp((info.yE || 5.3) * .17, .7, .95);
    [{ order: 'corinthian', marble: 'pavonazzetto', gilt: true, die: 'scag-dark' }, { order: 'solomonic', marble: 'rosso', gilt: true, die: 'scag-dark' }].forEach((o, i) => {
      const sd = i ? 1 : -1; at(displayColumn({ ...o, H, pedestal: pH }), R => [sd * (R.w / 2 - 1.15), -R.d / 2 + 1.15, 0]);
    });
    quietShadows(F);
  }
  placeFurniture() {
    const R = this.lib.hub, c = this.caseDepth();
    if (this.decor.children.length) { const old = [...this.decor.children]; this.decor.clear(); this.trash(old); }
    this.furn.children.forEach(o => { const p = o.userData.place && o.userData.place(R, c); o.visible = !!p; if (p) { o.position.set(p[0], 0, p[1]); o.rotation.y = p[2]; } });
    // carpets: a wide runner from the door to the window wall and one under each reading table (flat, 5–9 mm above
    // the marble, never overlapping each other: a quiet ground for the reading floor)
    const rl = R.d - 2 * c - 2.2, tx = clamp(R.w * .13, 1.9, 3.2), tl = clamp(R.d * .2, 1.6, 3.0), tz = -R.d * .05;
    const rw = Math.min(2.5, R.w * .14, 2 * tx - 2.2); if (rl > 2) { const rn = runner(rl, rw); rn.position.set(0, .005, .3); this.decor.add(rn); }
    [-1, 1].forEach(sd => { const cw = Math.min(2.1, 2 * (tx - rw / 2) - .02); if (cw > 1.2) { const cp = runner(tl + 1.5, cw); cp.position.set(sd * tx, .008, tz); this.decor.add(cp); } });
  }
  // free removed objects a few frames later, keeping whatever the hall still shows (shared materials, cached textures)
  trash(objs) { this.app.retire(() => disposeTree(objs, this.disposed ? null : this.scene)); this.obstaclesDirty = true; this.shadowsDirty = true; }
  buildShelves() {
    const old = [...this.shelfObjs.values()]; this.shelfObjs.forEach(o => o.removeFromParent()); this.shelfObjs.clear(); this.scrollObjs.clear(); if (old.length) this.trash(old);
    this.lib.shelves.forEach(s => this.addShelfObj(s));
    if (this.repairSlots()) this.app.saveLib();
    this.lib.books.forEach(b => this.addScrollObj(b));
    this.refill(); this.glowDirty = true;
  }
  // Libraries saved while several PDFs were imported at once can hold books sharing one shelf+tier+slot (or a slot the
  // bookcase does not have): the first keeps its place, later ones move to the nearest free eye-level slot, on the same
  // bookcase if it has room, else on another. Returns the number of books moved.
  repairSlots() {
    const used = new Map(), bad = [], key = b => (b.tier || 0) + ':' + (b.slot || 0), setOf = id => used.get(id) || used.set(id, new Set()).get(id);
    this.lib.books.forEach(b => {
      const so = this.shelfObjs.get(b.shelf); if (!so) return; const u = so.userData, t = b.tier || 0, sl = b.slot || 0, S = setOf(b.shelf);
      if (S.has(key(b)) || t < 0 || sl < 0 || t >= u.tiers || sl >= u.slotsPerTier) bad.push(b); else S.add(key(b));
    });
    const pick = (so, S) => { const u = so.userData; for (const t of this.tierOrder(u)) for (let j = 0; j < u.slotsPerTier; j++) if (!S.has(t + ':' + j)) return { tier: t, slot: j }; return null; };
    bad.forEach(b => {
      let id = b.shelf, fs = pick(this.shelfObjs.get(id), setOf(id));
      for (const s of this.lib.shelves) { if (fs) break; const so = this.shelfObjs.get(s.id); if (so) { fs = pick(so, setOf(s.id)); id = s.id; } }
      if (!fs) { const s = this.makeDefaultShelf(); id = s.id; fs = pick(this.shelfObjs.get(id), setOf(id)); }
      Object.assign(b, { shelf: id, tier: fs.tier, slot: fs.slot }); setOf(id).add(key(b));
    });
    if (bad.length) console.info(`Scriptorium: ${bad.length} scroll(s) shared a shelf slot and were moved to free slots`);
    return bad.length;
  }
  // The user's bookcases hold scrolls only. Their cradles (props.scrollRests) are shown on the tiers that hold scrolls
  // and on the tier the next scroll will go to; the other tiers stay plain lined shelves, ready but quiet.
  refill(id) {
    if (id == null) { this.lib.shelves.forEach(s => this.refill(s.id)); return; }
    const s = this.lib.shelves.find(x => x.id === id), so = this.shelfObjs.get(id); if (!s || !so) return;
    const tiers = new Set(this.lib.books.filter(b => b.shelf === id).map(b => b.tier || 0)), fs = this.freeSlot(s); if (fs) tiers.add(fs.tier);
    setRestTiers(so, tiers);
  }
  caseDepth() { return (this.shell && this.shell.userData.baroque && this.shell.userData.baroque.caseDepth) || 0; }
  // footprints of the user's bookcases, for leaving out the built-in wall cases behind them
  caseSkip() { return this.lib.shelves.map(s => { const K = SHELF_KINDS[s.kind] || SHELF_KINDS.horizontal; return { x: s.x, z: s.z, w: (s.w || K.w) + .22, d: K.d + .08, rot: s.rot || 0 }; }); }
  updateWallCases() { this.shadowsDirty = true; this.obstaclesDirty = true; if (this.shell && this.shell.userData.setCases) this.shell.userData.setCases({ skip: this.caseSkip() }); }
  // eye-level tiers first (scroll centres nearest 1.35 m), then the rest
  tierOrder(u) { return [...Array(u.tiers).keys()].sort((a, b) => Math.abs(.2 + a * u.tierH - 1.35) - Math.abs(.2 + b * u.tierH - 1.35)); }
  // walk-mode collision boxes, recomputed only when bookcases or furniture change (or a bookcase is being dragged)
  obstacles() { if (this.obstaclesDirty || this.dragging || !this._obs) { this._obs = this._obsFn(); this.obstaclesDirty = false; } return this._obs; }
  addShelfObj(s) { this.obstaclesDirty = true; this.shadowsDirty = true; const o = makeBookcase(s); o.position.set(s.x, 0, s.z); o.rotation.y = s.rot || 0; this.scene.add(o); quietShadows(o); this.shelfObjs.set(s.id, o); return o; }
  addScrollObj(b) {
    const so = this.shelfObjs.get(b.shelf); if (!so) return null;
    const o = makeScroll(b); const p = slotPos(so, b.tier || 0, b.slot || 0); o.position.copy(p); so.add(o); quietShadows(o); this.scrollObjs.set(b.id, o); return o;
  }
  freeSlot(shelf) {
    const so = this.shelfObjs.get(shelf.id); if (!so) return null; const u = so.userData, used = new Set(this.lib.books.filter(b => b.shelf === shelf.id).map(b => (b.tier || 0) + ':' + (b.slot || 0)));
    for (const t of this.tierOrder(u)) for (let s = 0; s < u.slotsPerTier; s++) if (!used.has(t + ':' + s)) return { tier: t, slot: s };
    return null;
  }
  // ---------- the hero: the user's own scrolls ----------
  // The bookcase that holds the newest scroll the user added; before any, the one the next import goes to.
  heroShelf() {
    const mine = this.lib.books.filter(b => !b.example && b.added && this.shelfObjs.get(b.shelf));
    if (mine.length) { const last = mine.reduce((a, b) => (b.added >= a.added ? b : a)); return this.lib.shelves.find(s => s.id === last.shelf); }
    return this.lib.shelves.find(s => this.shelfObjs.get(s.id) && this.freeSlot(s)) || this.lib.shelves.find(s => this.shelfObjs.get(s.id)) || null;
  }
  // Opening view (presentation-craft: three planes, the hero lit and readable). The camera stands ~2.3 m from the
  // hero scrolls' name tags (a 0.112 m tag ≈ 40–45 px tall on an 800 px-high view at 50° FOV), at ~42° to the bookcase's
  // face, on the side of the nearer corner; the view is then turned along the wall, so the hero scrolls and the plaque
  // sit in the left (or right) third, the near corner is the frame edge, and the rest of the hall recedes on the other side.
  frameHero() {
    const R = this.lib.hub, cam = this.camera, s = this.heroShelf(), o = s && this.shelfObjs.get(s.id);
    if (!o) { cam.position.set(R.w * .07, 1.7, R.d * .28); this.controls.target.set(-R.w * .29, 1.75, -R.d * .22); this.controls.update(); return; }
    o.updateMatrixWorld(true); const u = o.userData, M = o.matrixWorld, n = V3(0, 0, 1).transformDirection(M), t = V3(1, 0, 0).transformDirection(M);
    const books = this.lib.books.filter(b => b.shelf === s.id), mine = books.filter(b => !b.example), use = mine.length ? mine : books;
    let lx = 0, ly = .13 + this.tierOrder(u)[0] * u.tierH + .07;
    if (use.length) { const ps = use.map(b => slotPos(o, b.tier || 0, b.slot || 0)); lx = ps.reduce((a, p) => a + p.x, 0) / ps.length; ly = ps.reduce((a, p) => a + p.y, 0) / ps.length; }
    const tagY = ly - .09, plaqueY = u.h + .32, Tg = V3(lx, 0, .4).applyMatrix4(M);   // the tags hang ~0.4 m before the back board
    const fpx = 800 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))), D = clamp(.112 * fpx / 42, 1.8, 3.2), a = THREE.MathUtils.degToRad(42);
    // room left along ±t from the tags (to the inner face of the wall cases); the camera takes the nearer-corner side if it fits
    const c = this.caseDepth() + .5, reach = dir => { let m = Infinity; if (dir.x > 1e-3) m = Math.min(m, (R.w / 2 - c - Tg.x) / dir.x); if (dir.x < -1e-3) m = Math.min(m, (-R.w / 2 + c - Tg.x) / dir.x); if (dir.z > 1e-3) m = Math.min(m, (R.d / 2 - c - Tg.z) / dir.z); if (dir.z < -1e-3) m = Math.min(m, (-R.d / 2 + c - Tg.z) / dir.z); return m; };
    const rp = reach(t), rm = reach(t.clone().negate()), need = D * Math.sin(a);
    let sg = rp < rm ? 1 : -1; if ((sg > 0 ? rp : rm) < need) sg = -sg;
    const eye = u.h > 2.2 ? 1.75 : 1.62, C = Tg.clone().addScaledVector(n, D * Math.cos(a)).addScaledVector(t, sg * D * Math.sin(a)).setY(eye);
    C.x = clamp(C.x, -R.w / 2 + c, R.w / 2 - c); C.z = clamp(C.z, -R.d / 2 + c, R.d / 2 - c);
    // look at the hero, then turn ~60 % of the half-FOV toward the wall's far run (-sg·t): hero in a third, depth beside it
    const h = V3(Tg.x - C.x, 0, Tg.z - C.z), dist = h.length(); h.normalize();
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect), phi = Math.min(.45, half * .6) * (h.clone().cross(t.clone().multiplyScalar(-sg)).y > 0 ? 1 : -1);
    const f = h.applyAxisAngle(V3(0, 1, 0), phi);
    const T = C.clone().addScaledVector(f, dist).setY((tagY + plaqueY) / 2);
    cam.position.copy(C); this.controls.target.copy(T); this.controls.update();
  }
  // warm light pools before every bookcase holding scrolls (they follow a dragged bookcase); the key light on the hero
  syncGlow() {
    this.glowDirty = false;
    if (!this.glow) { this.glow = new THREE.Group(); this.glow.name = 'glow'; this.scene.add(this.glow); this.pools = new Map(); }
    const live = new Set();
    this.lib.shelves.forEach(s => {
      const o = this.shelfObjs.get(s.id); if (!o || !this.lib.books.some(b => b.shelf === s.id)) return; live.add(s.id);
      let p = this.pools.get(s.id); if (!p || p.userData.w !== o.userData.w) { if (p) { p.removeFromParent(); p.geometry.dispose(); } p = lightPool(o.userData.w); p.userData.w = o.userData.w; this.glow.add(p); this.pools.set(s.id, p); }
      const r = o.rotation.y, k = o.userData.d / 2 + 1.0; p.position.set(o.position.x + Math.sin(r) * k, .012, o.position.z + Math.cos(r) * k); p.rotation.set(-Math.PI / 2, r, 0, 'YXZ');
    });
    this.pools.forEach((p, id) => { if (!live.has(id)) { p.removeFromParent(); p.geometry.dispose(); this.pools.delete(id); } });
    const hs = this.heroShelf(), ho = hs && this.lib.books.some(b => b.shelf === hs.id) && this.shelfObjs.get(hs.id);
    if (!ho) { this.key.intensity = 0; return; }
    const r = ho.rotation.y, nx = Math.sin(r), nz = Math.cos(r), u = ho.userData;
    this.key.position.set(ho.position.x + nx * 2.4, Math.max(4.2, u.h + 2.2), ho.position.z + nz * 2.4);
    this.key.target.position.set(ho.position.x + nx * .1, u.h * .55, ho.position.z + nz * .1); this.key.target.updateMatrixWorld();
    const dist = this.key.position.distanceTo(this.key.target.position); this.key.angle = Math.min(.9, Math.atan((Math.max(u.w, u.h) / 2 + .45) / dist));
    this.key.intensity = 24;
  }
  // ---------- UI ----------
  buildUI() {
    const u = this.ui;
    u.append(el('div', { class: 'brand' }, [el('div', { class: 'brand-title', text: 'Scriptorium Memorium' }), el('div', { class: 'brand-sub', text: 'your library' })]));
    this.buildBtn = el('button', { class: 'btn', text: 'Arrange library', onclick: () => this.toggleBuild() });
    const add = el('button', { class: 'btn primary', text: '+ Add PDF scroll', onclick: () => this.pickPDF() });
    const more = el('button', { class: 'btn ghost', text: 'Import / export', onclick: () => this.app.portDialog() });
    u.append(el('div', { class: 'hub-actions glass' }, [add, this.buildBtn, more]));
    this.hint = el('div', { class: 'hint glass', text: HINTS.look() }); u.append(this.hint);
    this.tip = el('div', { class: 'tooltip', hidden: true }); u.append(this.tip);
    this.buildPanel = el('aside', { class: 'side-panel glass', hidden: true }); u.append(this.buildPanel);
    this.fileIn = el('input', { type: 'file', accept: 'application/pdf', multiple: true, hidden: true }); u.append(this.fileIn);
    this.fileIn.onchange = () => { const files = [...this.fileIn.files]; this.fileIn.value = ''; return this.addFiles(files); };
  }
  toggleBuild(on = !this.build) {
    this.build = on; this.buildBtn.classList.toggle('on', on); this.buildBtn.textContent = on ? 'Done arranging' : 'Arrange library';
    this.buildPanel.hidden = !on; this.hint.textContent = on ? HINTS.build() : HINTS.look();
    if (!on) this.selectShelf(null); this.renderBuildPanel();
  }
  renderBuildPanel() {
    const P = this.buildPanel, R = this.lib.hub; P.innerHTML = '';
    P.append(el('h3', { text: 'Arrange the library' }));
    P.append(el('div', { class: 'row wrap' }, [el('button', { class: 'btn small', text: '+ Horizontal bookcase', onclick: () => this.addShelf('horizontal') }), el('button', { class: 'btn small', text: '+ Vertical bookcase', onclick: () => this.addShelf('vertical') })]));
    P.append(el('h4', { text: 'Room size' }));
    [['w', 'Width', 8, 40], ['d', 'Depth', 8, 40], ['h', 'Height', 3.2, 9]].forEach(([k, label, a, b]) => {
      const out = el('b', { text: R[k].toFixed(1) + ' m' }), inp = el('input', { type: 'range', min: a, max: b, step: .1, value: R[k], 'aria-label': label });
      // live: while dragging, the room follows at most every ~150 ms (fast rebuild); on release it is built in full
      inp.oninput = () => { out.textContent = (+inp.value).toFixed(1) + ' m'; R[k] = +inp.value; this.liveResize(); };
      inp.onchange = () => { R[k] = +inp.value; clearTimeout(this._rzT); this._rzT = null; if (this.buildRoom()) this.clampShelves(); this.app.saveLib(); };
      P.append(el('label', { class: 'ctrl' }, [el('span', {}, [label, out]), inp]));
    });
    const s = this.selShelf && this.lib.shelves.find(x => x.id === this.selShelf);
    if (s) {
      const n = this.lib.books.filter(b => b.shelf === s.id).length;
      P.append(el('h4', { text: 'Selected bookcase' }),
        el('div', { class: 'shelf-name' }, [el('b', { text: s.name }), el('span', { class: 'dim small', text: ` · ${s.kind} · ${n} scroll${n === 1 ? '' : 's'}` })]),
        el('div', { class: 'row wrap' }, [
          el('button', { class: 'btn small', text: 'Rename', onclick: async () => { const v = await promptBox('Subject of this bookcase', s.name); if (v) { s.name = v; this.rebuildShelf(s); this.app.saveLib(); this.renderBuildPanel(); } } }),
          el('button', { class: 'btn small', text: '⟲ 90°', onclick: () => this.rotateShelf(s, Math.PI / 2) }),
          el('button', { class: 'btn small', text: '⟳ 15°', onclick: () => this.rotateShelf(s, -Math.PI / 12) }),
          el('button', { class: 'btn small', text: s.kind === 'horizontal' ? 'Make vertical' : 'Make horizontal', onclick: () => { s.kind = s.kind === 'horizontal' ? 'vertical' : 'horizontal'; this.reflowBooks(s); this.snap(s, true); this.rebuildShelf(s); this.sfx('wood', { gain: .5 }); this.app.saveLib(); this.renderBuildPanel(); } }),
          el('button', { class: 'btn small', text: '+ Add PDF here', onclick: () => this.pickPDF(s.id) }),
          el('button', { class: 'btn small danger', text: 'Remove', onclick: () => this.deleteShelf(s.id) })]));
    }
    P.append(el('p', { class: 'dim small', text: 'Tip: name each bookcase by subject (Maths, Physics, Biology…). Bookcases snap flush to the nearest wall.' }));
  }
  // Every slider step shows at once: the built hall is stretched to the new size (a scale on the shell, no rebuild)
  // and the bookcases and furniture move with their walls; 150 ms after the slider stops moving the shell is rebuilt
  // at that size (fast path); on release it is built in full.
  liveResize() {
    this.previewSize();
    clearTimeout(this._rzT); this._rzT = setTimeout(() => { this._rzT = null; if (!this.disposed && this.buildRoom(true)) this.clampShelves(); }, 150);
  }
  previewSize() {
    const R = this.lib.hub, d0 = this.shell && this.shell.userData.dims; if (!d0) return;
    this.shell.scale.set(R.w / d0.w, R.h / d0.h, R.d / d0.d);
    this.lib.shelves.forEach(s => { this.snap(s, true); const o = this.shelfObjs.get(s.id); if (o) { o.position.set(s.x, 0, s.z); o.rotation.y = s.rot || 0; } });
    this.placeFurniture(); this.glowDirty = true; this.shadowsDirty = true; this.obstaclesDirty = true;
  }
  addShelf(kind) {
    const R = this.lib.hub, dir = V3(); this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const p = this.controls.target.clone().addScaledVector(dir, .5);
    const s = { id: 'sh-' + uid(), name: kind === 'horizontal' ? 'New subject' : 'New subject', kind, x: clamp(p.x, -R.w / 2 + 1, R.w / 2 - 1), z: clamp(p.z, -R.d / 2 + 1, R.d / 2 - 1), rot: Math.atan2(-dir.x, -dir.z), color: SUBJECT_COLORS[this.lib.shelves.length % SUBJECT_COLORS.length] };
    this.snap(s); this.lib.shelves.push(s); this.addShelfObj(s); this.refill(s.id); this.updateWallCases(); this.selectShelf(s.id); this.sfx('thud', { gain: .5 }); this.app.saveLib();
    promptBox('Name this bookcase (its subject)', s.name).then(v => { if (v) { s.name = v; this.rebuildShelf(s); this.app.saveLib(); this.renderBuildPanel(); } });
  }
  rebuildShelf(s) {
    const old = this.shelfObjs.get(s.id); if (old) { old.removeFromParent(); this.trash([old]); } this.shelfObjs.delete(s.id);
    this.addShelfObj(s); this.lib.books.filter(b => b.shelf === s.id).forEach(b => this.addScrollObj(b)); this.refill(s.id); this.updateWallCases(); this.glowDirty = true;
    if (this.selShelf === s.id) this.highlight(this.shelfObjs.get(s.id));
  }
  // turn a bookcase in place, then bring its turned footprint back inside the room (flush where it meets a wall)
  rotateShelf(s, da) { s.rot = (s.rot || 0) + da; this.snap(s, true); this.rebuildShelf(s); this.sfx('wood', { gain: .6 }); this.app.saveLib(); }
  reflowBooks(s) {
    const K = SHELF_KINDS[s.kind], per = Math.max(1, Math.floor((K.w - .2) / .17)), order = this.tierOrder({ tiers: K.tiers, tierH: (K.h - .12) / K.tiers }); let i = 0;
    this.lib.books.filter(b => b.shelf === s.id).forEach(b => { b.tier = order[Math.min(order.length - 1, Math.floor(i / per))]; b.slot = i % per; i++; });
  }
  async deleteShelf(id) {
    const s = this.lib.shelves.find(x => x.id === id); if (!s) return;
    const books = this.lib.books.filter(b => b.shelf === id);
    if (books.length && !(await confirmBox(`Remove "${s.name}"? Its ${books.length} scroll(s) move to another bookcase.`, 'Remove'))) return;
    this.lib.shelves = this.lib.shelves.filter(x => x !== s); const o = this.shelfObjs.get(id); if (o) { o.removeFromParent(); this.trash([o]); } this.shelfObjs.delete(id);
    books.forEach(b => { const target = this.lib.shelves.find(x => this.freeSlot(x)) || this.makeDefaultShelf(); const fs = this.freeSlot(target); Object.assign(b, { shelf: target.id, tier: fs.tier, slot: fs.slot }); this.addScrollObj(b); this.refill(target.id); });
    this.updateWallCases(); this.selectShelf(null); this.glowDirty = true; this.sfx('wood', { gain: .6, pitch: .6 }); this.app.saveLib();
  }
  makeDefaultShelf() { const R = this.lib.hub; const s = { id: 'sh-' + uid(), name: 'Unsorted', kind: 'vertical', x: -R.w / 2 + .5, z: 0, rot: Math.PI / 2 }; this.snap(s); this.lib.shelves.push(s); this.addShelfObj(s); this.updateWallCases(); return s; }
  // Dragging (keepRot false): within 0.9 m of a wall the bookcase turns its back to that wall and stands flush.
  // After a turn or a change of kind (keepRot true) the orientation the user chose is kept. Either way the turned
  // footprint (width × depth at s.rot) is then kept inside the room, 3 cm off any wall it meets.
  snap(s, keepRot = false) {
    const R = this.lib.hub, K = SHELF_KINDS[s.kind] || SHELF_KINDS.horizontal, w = s.w || K.w, half = K.d / 2 + .03, lim = .9;
    if (!keepRot) {
      const cands = [{ d: s.z + R.d / 2, set: () => { s.z = -R.d / 2 + half; s.rot = 0; } }, { d: R.d / 2 - s.z, set: () => { s.z = R.d / 2 - half; s.rot = Math.PI; } }, { d: s.x + R.w / 2, set: () => { s.x = -R.w / 2 + half; s.rot = Math.PI / 2; } }, { d: R.w / 2 - s.x, set: () => { s.x = R.w / 2 - half; s.rot = -Math.PI / 2; } }].sort((a, b) => a.d - b.d);
      if (cands[0].d < lim) cands[0].set();
    }
    // (along its width the cornice and crest reach 0.1 m past the carcass on each side; at the back they sit in the wall gap)
    const r = s.rot || 0, c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r)), ww = w + .2, hx = Math.min(R.w / 2 - .05, c * ww / 2 + sn * K.d / 2 + .03), hz = Math.min(R.d / 2 - .05, sn * ww / 2 + c * K.d / 2 + .03);
    s.x = clamp(s.x, -R.w / 2 + hx, R.w / 2 - hx); s.z = clamp(s.z, -R.d / 2 + hz, R.d / 2 - hz);
  }
  clampShelves() { this.lib.shelves.forEach(s => { this.snap(s, true); const o = this.shelfObjs.get(s.id); if (o) { o.position.set(s.x, 0, s.z); o.rotation.y = s.rot || 0; } }); this.updateWallCases(); this.glowDirty = true; }
  selectShelf(id) { this.selShelf = id; this.highlight(id ? this.shelfObjs.get(id) : null); if (this.build) this.renderBuildPanel(); }
  highlight(o) { this.gfx.outline.enabled = !!o; this.gfx.outline.selectedObjects = o ? [o] : []; }
  // ---------- books ----------
  pickPDF(shelfId) { this.addTarget = shelfId || this.selShelf || null; this.fileIn.click(); }
  // several PDFs picked at once are added one after another, each into the slot left free by the one before
  async addFiles(files) {
    for (const f of files) { if (this.disposed) return; try { await this.addPDF(f); } catch (e) { console.warn(e); toast(`Could not add "${f.name}": ${e.message || e}`); } }
  }
  async addPDF(file) {
    const id = 'bk-' + uid(); const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    let shelf = this.lib.shelves.find(s => s.id === this.addTarget && this.freeSlot(s)) || this.lib.shelves.find(s => this.freeSlot(s)) || this.makeDefaultShelf();
    // the slot is reserved (the book is listed) before anything is awaited, so a concurrent call can never take it too
    const fs = this.freeSlot(shelf); const b = { id, title, shelf: shelf.id, tier: fs.tier, slot: fs.slot, color: shelf.color, icon: 'PDF', hasPdf: true, added: Date.now(), size: file.size };
    this.lib.books.push(b);
    try { await this.app.store.set('pdf:' + id, file); } catch (e) { this.lib.books = this.lib.books.filter(x => x !== b); throw e; }
    if (this.disposed) { this.app.saveLib(); return; }
    const o = this.addScrollObj(b); this.refill(shelf.id); this.glowDirty = true; this.app.saveLib();
    if (o) { o.userData.arrive = 0; o.scale.setScalar(.01); }
    this.sfx('unroll', { gain: .45 });
    toast(`"${title}" placed on ${shelf.name}`);
    this.app.ingest.pageCount(file).then(n => { if (n) { b.pages = n; this.app.saveLib(); } }).catch(() => {});
    // the PDF's own Title metadata, when it is a real title, replaces the file-name title (the tag is redrawn)
    if (this.app.ingest.pdfTitle) this.app.ingest.pdfTitle(file).then(t => { if (t && t !== b.title && b.title === title) { b.title = t; this.app.saveLib(); this.retag(b); } }).catch(() => {});
  }
  // redraw a scroll's name tag after its title changed (unless it is being opened)
  retag(b) {
    const o = this.scrollObjs.get(b.id); if (this.disposed || !o || !o.parent || (this.opening && this.opening.sc === o)) return;
    const so = o.parent; o.removeFromParent(); this.trash([o]); this.scrollObjs.delete(b.id);
    const n = this.addScrollObj(b); if (n && o.userData.arrive != null) { n.userData.arrive = o.userData.arrive; n.scale.copy(o.scale); } if (this.hover === o) this.hover = null; this.refill(so.userData.shelfId);
  }
  sfx(name, o) { if (this.app.sfx) this.app.sfx.play(name, o); }
  async removeBook(id) { const bk = this.lib.books.find(b => b.id === id); this.lib.books = this.lib.books.filter(b => b.id !== id); const o = this.scrollObjs.get(id); if (o) { o.removeFromParent(); this.trash([o]); } this.scrollObjs.delete(id); if (bk) this.refill(bk.shelf); this.app.saveLib(); await this.app.store.del('pdf:' + id); await this.app.store.del('room:' + id); }
  // ---------- pointer ----------
  pick(e, list) { const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera); return this.ray.intersectObjects(list, true); }
  ownerOf(o, kind) { while (o && !(o.userData && o.userData.kind === kind)) o = o.parent; return o; }
  pointerDown(e) {
    if (this.opening) return; this.down = { x: e.clientX, y: e.clientY };
    if (this.build) { const h = this.pick(e, [...this.shelfObjs.values()])[0]; const sh = h && this.ownerOf(h.object, 'shelf'); if (sh) { this.selectShelf(sh.userData.shelfId); this.dragging = sh; this._lifted = false; this.controls.enabled = false; } }
  }
  pointerMove(e) {
    if (this.opening || !e.target || e.target !== this.gfx.canvas) { if (!this.dragging) { this.tip.hidden = true; } }
    if (this.dragging) {
      const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera);
      if (!this._lifted) { this._lifted = true; this.sfx('wood', { pitch: .8, gain: .45 }); }   // picked up: a soft, lower knock
      const p = V3(); if (this.ray.ray.intersectPlane(this.floorPlane, p)) { const s = this.lib.shelves.find(x => x.id === this.dragging.userData.shelfId); s.x = p.x; s.z = p.z; this.snap(s); this.dragging.position.set(s.x, 0, s.z); this.dragging.rotation.y = s.rot;
        const now = performance.now(); if (!(now - (this._casesT || 0) < 350)) { this._casesT = now; this.updateWallCases(); } } // wall cases make room while dragging (throttled)
      return;
    }
    if (e.target !== this.gfx.canvas || this.build) return;
    const h = this.pick(e, [...this.scrollObjs.values()])[0]; const sc = h && this.ownerOf(h.object, 'scroll');
    if (sc !== this.hover) { if (this.hover) this.hover.userData.paper.emissiveIntensity = 0; this.hover = sc; if (sc) sc.userData.paper.emissiveIntensity = .25; this.gfx.canvas.style.cursor = sc ? 'pointer' : ''; }
    if (sc) { const b = this.lib.books.find(x => x.id === sc.userData.bookId); this.tip.hidden = false; this.tip.innerHTML = `<b>${esc(b.title)}</b><span>${b.pages ? b.pages + ' pages · ' : ''}${esc((this.lib.shelves.find(s => s.id === b.shelf) || {}).name || '')}</span>`; this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`; } else this.tip.hidden = true;
  }
  pointerUp(e) {
    if (this.dragging) { if (this._lifted) this.sfx('wood', { gain: .6 }); this.dragging = null; this._lifted = false; this.glowDirty = true; this.controls.enabled = this.nav.mode !== 'walk'; this.updateWallCases(); this.app.saveLib(); return; }
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || e.target !== this.gfx.canvas) return; this.down = null;
    if (this.build) { const h = this.pick(e, [...this.shelfObjs.values()])[0]; if (!h) this.selectShelf(null); return; }
    const h = this.pick(e, [...this.scrollObjs.values()])[0]; const sc = h && this.ownerOf(h.object, 'scroll');
    if (sc) this.openScroll(sc);
  }
  // ---------- the opening: fly → lift → unroll in light → dive into the page ----------
  // The camera flies (1.4 s) to stand 1.05 m before the point where the middle of the unrolled sheet will be, looking at
  // that point from the first frame to the last (its target never jumps); the scroll rises from its slot and turns to
  // face it; the sheet then unrolls downward from the roll (1.5 s) with a weighted rod on its lower edge, and only then
  // does the light swell (sheet glow, a warm point light, a touch of bloom) in step with it; fully open it holds a beat,
  // and the camera moves in toward the sheet as the screen fades (1 s); the room opens when the fade is complete.
  openScroll(sc) {
    const b = this.lib.books.find(x => x.id === sc.userData.bookId); if (!b) return;
    this.opening = { sc, b, t: 0 }; this.controls.enabled = false; this.tip.hidden = true; this.highlight(null); this.gfx.canvas.style.cursor = '';
    if (this.hover) { this.hover.userData.paper.emissiveIntensity = 0; this.hover = null; }
    const wp = sc.getWorldPosition(V3()), so = sc.parent, outward = V3(0, 0, 1).applyQuaternion(so.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    if (this.nav.mode === 'walk') { const f = V3(); this.camera.getWorldDirection(f); this.controls.target.copy(this.camera.position).addScaledVector(f, 1.6); }
    const O = this.opening; O.from = { p: this.camera.position.clone(), t: this.controls.target.clone() };
    O.liftTo = wp.clone().addScaledVector(outward, .6).setY(Math.max(1.62, wp.y));
    O.look = O.liftTo.clone().add(V3(0, -.3, 0));                        // the middle of the unrolled sheet
    O.camTo = O.look.clone().addScaledVector(outward, 1.05).add(V3(0, .08, 0));
    O.into = O.look.clone().addScaledVector(outward, .3);
    O.start = wp.clone(); O.q0 = sc.getWorldQuaternion(new THREE.Quaternion());
    this.scene.attach(sc);   // reparent to the hall so it can float free
    // facing: the scroll's axis (local z) across the view, its front (local −x) toward the viewer, kept level
    O.face = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(O.liftTo.clone().add(outward), O.liftTo, V3(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2));
    O.sheet = makeSheet(.42, .6, b.title); sc.add(O.sheet);
    O.light = new THREE.PointLight(0xffe2a8, 0, 4, 2); sc.add(O.light); O.light.position.set(-.45, -.3, 0);
    this.hint.textContent = 'Opening "' + b.title + '"…';
  }
  stepOpening(dt) {
    const O = this.opening, T_FLY = 1.4, T_UN = 1.5, D_UN = 1.5, T_DIVE = T_UN + D_UN + .3, D_DIVE = 1.05;
    O.t += dt; const t = O.t, c = this.camera, sc = O.sc, S = O.sheet.userData;
    const k1 = ease(Math.min(1, t / T_FLY));   // (cubic in-out: the turn toward the scroll never exceeds ~5° a frame at 30 fps)
    this.controls.target.lerpVectors(O.from.t, O.look, k1);
    const k2 = easeOut(clamp((t - .3) / 1.05, 0, 1)); sc.position.lerpVectors(O.start, O.liftTo, k2); sc.quaternion.slerpQuaternions(O.q0, O.face, k2);
    // the unroll, and the light with it (nothing glows before the sheet moves)
    const k3 = clamp((t - T_UN) / D_UN, 0, 1), e3 = ease(k3);
    if (k3 > 0 && !O.sound) { O.sound = true; this.sfx('unroll'); }
    S.sheet.scale.y = Math.max(.001, e3); S.rod.position.y = -S.h * e3; S.sheet.visible = S.rod.visible = k3 > 0;
    S.sheet.material.emissiveIntensity = e3 * 1.1; O.light.intensity = e3 * 5; sc.userData.paper.emissiveIntensity = e3 * .5;
    this.gfx.bloom.strength = this.scene.userData.look.bloom + e3 * .35;
    // the dive: only once the sheet is fully open (and has held a beat)
    const k4 = clamp((t - T_DIVE) / D_DIVE, 0, 1), e4 = ease(k4);
    if (k4 > 0) c.position.lerpVectors(O.camTo, O.into, e4); else c.position.lerpVectors(O.from.p, O.camTo, k1);
    c.lookAt(this.controls.target);
    this.gfx.grade.uniforms.uFade.value = ease(clamp((k4 - .25) / .75, 0, 1));
    if (k4 >= 1 && !O.done) { O.done = true; this.app.openRoom(O.b.id, { fromHub: true }); }
  }
  // ---------- frame ----------
  update(dt) {
    // the hall is static: its 2048² sun shadow map is redrawn only while something moves (opening, dragging, arriving)
    const sm = this.gfx.renderer.shadowMap; sm.autoUpdate = false;
    if (this.shadowsDirty !== false || this.opening || this.dragging || this._arriving) { sm.needsUpdate = true; this.shadowsDirty = false; }
    if (this.opening) { this.stepOpening(dt); return; }
    // walking (overview or first person) — see js/nav.js
    this.nav.update(dt, !!this.dragging);
    if (this.glowDirty || this.dragging) this.syncGlow();
    this._arriving = false;
    this.scrollObjs.forEach(o => { if (o.userData.arrive != null) { this._arriving = true; o.userData.arrive = Math.min(1, o.userData.arrive + dt * 1.4); o.scale.setScalar(easeOut(o.userData.arrive) || .01); if (o.userData.arrive >= 1) delete o.userData.arrive; } });
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    removeEventListener('keydown', this.onKeyD); removeEventListener('keyup', this.onKeyU);
    this.gfx.canvas.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.nav.dispose(); this.controls.dispose(); this.highlight(null); this.ui.remove(); this.gfx.canvas.style.cursor = ''; this.gfx.renderer.shadowMap.autoUpdate = true;
  }
}
