// The library hub: a cozy, resizable room where bookcases are placed, moved, rotated and named,
// PDFs are added as folded scrolls, and opening a scroll unfolds it in a shaft of light and carries you into its room.
import { MapView } from '../mapview.js';
import { lookQ, flyPose, flightDur, easeSine } from '../camfly.js';
import { iconFor, iconSVG, ICONS, ICON_NAMES, rememberIcon } from '../icons.js';
import { openSymbolPicker } from '../symbols.js';
const OPEN_PACE = 1.3;   // the scroll opening's speed (stepOpening)
import { autoTags } from '../share.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeRoomShell, doorPick, doorHit } from '../gfx/roomshell.js';
import { makeBookcase, makeScroll, makeSheet, slotPos, setRestTiers, SHELF_KINDS, poseScroll, setChains, chainItems, hangSlots, caseTierOrder, hangLimits, hangDrop, hangX, tierSpan, ghostScroll, METALS, HANG, slotAt, SCROLL_L, armchair, readingDesk, displayColumn, readingTable, bench, globeStand, runner, quietShadows, lightPool } from './props.js';
import { Navigator } from '../nav.js';
import { RoomProbe, RoomAO, bindRoom, footprints, enrich } from '../gfx/surfaces.js';
import { el, clamp, uid, toast, promptBox, confirmBox, easeInOutQuint, easeOut, ease, esc, disposeTree, mathHTML, mathText, prefersCalm, announce, moreMenu } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TOUCH = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
// the bottom hint, worded for the device in hand (touch screens have no WASD / V keys)
const HINTS = {
  look: () => TOUCH() ? 'Drag to look · pinch to zoom · tap a scroll to open it · long-press it for options' : 'Drag to look · WASD walks (Shift: faster) · V: first person · click a scroll to open it · right-click it for options',
  build: () => TOUCH() ? 'Tap a bookcase to select it · drag it along the floor · drag a scroll to another place' : 'Click a bookcase to select it · drag it along the floor · drag a scroll to another place on any shelf'
};
// The first minutes: one short tip at a time, each replaced once it has been done (look → walk → open), instead of one
// line naming every control at once; then the full reference line above. Kept in this browser (TIPS_KEY: the stage reached).
const TIPS_KEY = 'scriptorium.hallTips', TIPS = [
  () => TOUCH() ? 'Drag to look round the hall · pinch to come closer' : 'Drag to look round the hall',
  () => 'W A S D to walk (Shift: faster) · V: walk at eye height',
  () => TOUCH() ? 'Tap the glowing scroll to open it · long-press a scroll for its options' : 'Click the glowing scroll to open it · [ and ] step through the scrolls, Enter opens'];
const tipStage = () => { try { return clamp(+localStorage.getItem(TIPS_KEY) || 0, 0, TIPS.length); } catch (e) { return TIPS.length; } };
const NEAR_R = 2.5;   // "the library notices you": the nearest scroll within this many metres of the eye warms and names itself
// case-frame bounds (inv: the bookcase's inverse world matrix) of the visible meshes under root that pass keep()
const _bm = new THREE.Matrix4();
export function localBox(root, inv, keep = () => true) {
  const box = new THREE.Box3(), b = new THREE.Box3(); root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !keep(o)) return; for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return;
    if (o.isInstancedMesh) { if (!o.count) return; o.computeBoundingBox(); b.copy(o.boundingBox); } else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox); }
    box.union(b.applyMatrix4(_bm.multiplyMatrices(inv, o.matrixWorld)));
  });
  return box;
}
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
const SUBJECT_COLORS = ['#8a2a1e', '#2d5b8e', '#3f7d6e', '#8f733a', '#6a4a8a', '#a0522d', '#2f4f6f', '#7a2a4a'];

export class Hub {
  constructor(app) {
    this.app = app; this.gfx = app.gfx; this.lib = app.lib;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0d0a07);
    this.scene.environment = this.gfx.envStudio; this.scene.environmentIntensity = .16;   // until the hall's own probe is captured (first update)
    // reflections of the hall itself (surfaces.js): captured after every rebuild; GTAO at quality 'high'
    this.probe = new RoomProbe(this.gfx); this.probeDirty = true; this.ao = new RoomAO(this.gfx, this.scene, null);
    // crisp warm daylight (renderer.js), a step less exposure than the house look: the surround sits lower and the hero,
    // under its own key light, separates from it (presentation-craft value check); set before setView
    // bloom kept to the flames and the sky itself (threshold above the sunlit stucco), so the window wall stays clear and warm
    this.scene.userData.look = Object.assign(this.gfx.constructor.HOUSE, { exposure: .9, vignette: .36, bloom: .15, bloomThreshold: 2.1, warm: .003, sat: .97 });   /* sat .97: the warm lamps on warm plaster and giallo compound into ochre; a touch less chroma keeps stucco cream */   // (exposure lowered from 1.2 with the hall's own probe: its bounce light replaced the fake ambient)
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 120); this.ao.camera = this.camera;
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: .4, maxDistance: 14, maxPolarAngle: Math.PI * .56, screenSpacePanning: false, rotateSpeed: .6 });
    this.keys = {}; this.shelfObjs = new Map(); this.scrollObjs = new Map();
    this.ui = el('div', { class: 'hub-ui' }); app.ui.append(this.ui);
    // the hero's key light: one warm spot (always present, so the light count and the shaders never change), aimed at
    // the bookcase holding the user's newest scrolls; every bookcase with scrolls also gets a warm pool on the floor
    this.key = new THREE.SpotLight(0xffeedd, 0, 0, .5, .75, 2); this.key.castShadow = false; this.key.name = 'hero-key'; this.scene.add(this.key, this.key.target);
    // the light an opening scroll carries (openScroll) is here from the start, dark: a light added on the click changed the
    // hall's light count, and every lit material's shader was rebuilt on that frame (21 programs; seconds on a Radeon 610M
    // the first time). Present from the start, it is compiled with the hall, under the veil.
    this.openLight = new THREE.PointLight(0xffd59a, 0, 2.6, 2); this.openLight.name = 'opening-light'; this.scene.add(this.openLight);
    this.buildRoom(); this.buildShelves(); this.buildUI();
    this.frameHero(); this.syncGlow();
    this.gfx.setView(this.scene, this.camera);
    this.nav = new Navigator({ camera: this.camera, controls: this.controls, canvas: this.gfx.canvas, keys: this.keys, host: this.ui,
      bounds: () => { const c = this.caseDepth(); return { minX: -this.lib.hub.w / 2 + c, maxX: this.lib.hub.w / 2 - c, minZ: -this.lib.hub.d / 2 + c, maxZ: this.lib.hub.d / 2 - c, h: this.lib.hub.h }; },
      obstacles: () => this.obstacles() });
    this._obsFn = () => [...this.shelfObjs.values(), ...(this.furn ? this.furn.children.filter(o => o.visible) : []), ...(this.solids || [])].map(o => new THREE.Box3().setFromObject(o)).concat([...(((this.shell && this.shell.userData.baroque && this.shell.userData.baroque.obstacles) || []).map(q => new THREE.Box3(new THREE.Vector3(q.x - q.r, 0, q.z - q.r), new THREE.Vector3(q.x + q.r, 1.8, q.z + q.r))))]);
    this.onKeyD = e => { if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
      const mod = e.ctrlKey || e.metaKey || e.altKey;   // Ctrl+V, Cmd+F…: the browser's, never a walk toggle or a held key
      if (!mod) this.keys[e.key.toLowerCase()] = true;
      if (!mod && /^(w|a|s|d|arrow(up|down|left|right))$/i.test(e.key)) this.tipDone(1);
      if ((e.key === 'v' || e.key === 'V') && !mod) { this.nav.toggle(); this.tipDone(1); }
      // [ / ]: step through the scrolls (an outline marks the one chosen, its title is announced); Enter opens it
      const onCtl = e.target && e.target.closest && e.target.closest('button, a, [contenteditable], .modal-veil'), inDlg = e.target && e.target.closest && e.target.closest('.modal-veil, .hud-menu, .scroll-menu, [contenteditable]');
      if (!mod && !inDlg && !this.build && !this.opening && (e.key === '[' || e.key === ']')) { e.preventDefault(); this.kbStep(e.key === ']' ? 1 : -1); }
      if (e.key === 'Enter' && !mod && !onCtl && this.kbFocus && !this.opening && !this.menu) { const sc = this.scrollObjs.get(this.kbFocus); if (sc) { e.preventDefault(); this.openScroll(sc); } }
      if (e.key === 'Escape' && this.kbFocus && !this.opening) { this.kbClear(); return; }
      if (e.key === 'Escape') { if (this.opening) this.cancelOpening(); else if (this.menu) this.closeMenu(); else if (this.moveDlg) this.closeMove(); else { if (this.sdrag) this.endScrollDrag(false); this.selectShelf(null); } } if (e.key === 'Delete' || e.key === 'Backspace') { if (this.menu && this.menuBook) { e.preventDefault(); this.deleteScroll(this.menuBook); } else if (e.key === 'Delete' && this.selShelf && this.build) this.deleteShelf(this.selShelf); } };
    this.onKeyU = e => { this.keys[e.key.toLowerCase()] = false; };
    addEventListener('keydown', this.onKeyD); addEventListener('keyup', this.onKeyU);
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e);
    this.gfx.canvas.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    // a scroll's options: right-click (mouse), long-press (touch; pointerDown starts the timer)
    this.onCtx = e => { if (this.opening) return; const id = this.bookAt(e); if (!id) return; e.preventDefault(); e.stopPropagation(); if (this.rdown && Math.hypot(e.clientX - this.rdown.x, e.clientY - this.rdown.y) > 6) return; this.openMenu(id, e.clientX, e.clientY); };
    this.gfx.canvas.addEventListener('contextmenu', this.onCtx, true);
    this.onDocDown = e => { if (this.menu && !this.menu.contains(e.target)) this.closeMenu(); };
    addEventListener('pointerdown', this.onDocDown, true);
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
    this.doorPick = doorPick(this.scene, shell, this.doorPick); this.doorInfo = shell && shell.userData.baroque && shell.userData.baroque.door;
    if (!this.furn) { this.furn = new THREE.Group(); this.scene.add(this.furn); }
    if (!this.decor) { this.decor = new THREE.Group(); this.scene.add(this.decor); }
    if (!fast || !this.furn.children.length) { gone.push(...this.furn.children); this.furn.clear(); this.buildFurniture(); }
    this.placeFurniture();
    if (gone.length) this.trash(gone);
    this.floorPlane = new THREE.Plane(V3(0, 1, 0), 0); this.obstaclesDirty = true; this.shadowsDirty = true;
    if (!fast) this.probeDirty = true;
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
    this.dropGhost(); const old = [...this.shelfObjs.values()]; this.shelfObjs.forEach(o => o.removeFromParent()); this.shelfObjs.clear(); this.scrollObjs.clear(); if (old.length) this.trash(old);
    this.lib.shelves.forEach(s => this.addShelfObj(s));
    if (this.repairSlots()) this.app.saveLib();
    this.lib.books.forEach(b => this.addScrollObj(b));
    this.refill(); this.glowDirty = true;
  }
  // ---------- slots ----------
  // A cradled scroll takes its own slot; a hanging one reserves the run of slots it spans on its tier (props.hangSlots).
  // need(): the 'tier:slot' keys a book takes; occ(caseId, except): Map key → bookId of everything placed on a bookcase.
  need(so, b) { const t = b.tier || 0; return b.hang ? hangSlots(so, b.slot || 0).map(j => t + ':' + j) : [t + ':' + (b.slot || 0)]; }
  occ(caseId, except) {
    const so = this.shelfObjs.get(caseId), M = new Map(); if (!so) return M;
    this.lib.books.forEach(b => { if (b.shelf === caseId && b.id !== except) this.need(so, b).forEach(k => M.set(k, b.id)); }); return M;
  }
  // can `book` (or a new one: except null) take tier/slot on this bookcase, cradled or hanging?
  canPlace(caseId, tier, slot, hang = false, except = null) {
    const so = this.shelfObjs.get(caseId); if (!so) return false; const u = so.userData;
    if (!(tier >= 0 && tier < u.tiers && slot >= 0 && slot < u.slotsPerTier && Number.isInteger(tier) && Number.isInteger(slot))) return false;
    const M = this.occ(caseId, except); return this.need(so, { tier, slot, hang }).every(k => !M.has(k));
  }
  // a free place on a bookcase: the preferred tier first (nearest slots first), then eye-level tiers; null if full
  findSpot(so, M, hang = false, prefTier = null, prefSlot = null) {
    const u = so.userData, tiers = this.tierOrder(u); if (prefTier != null && prefTier >= 0 && prefTier < u.tiers) tiers.splice(tiers.indexOf(prefTier), 1), tiers.unshift(prefTier);
    const slots = [...Array(u.slotsPerTier).keys()]; if (prefSlot != null) slots.sort((a, b) => Math.abs(a - prefSlot) - Math.abs(b - prefSlot));
    for (const t of tiers) for (const j of slots) if (this.need(so, { tier: t, slot: j, hang }).every(k => !M.has(k))) return { tier: t, slot: j };
    return null;
  }
  // Libraries saved while several PDFs were imported at once can hold books sharing one place (or a slot the bookcase
  // does not have; or a hanging scroll whose span covers another): hanging scrolls are kept first, then the cradled ones
  // in order; a book that does not fit moves to the nearest free place, on its bookcase if it has room, else on another
  // (a hanging one that fits nowhere is laid in a cradle). Returns the number of books moved.
  repairSlots() {
    const occ = new Map(), bad = [], O = id => occ.get(id) || occ.set(id, new Map()).get(id);
    [...this.lib.books].sort((a, b) => (!!b.hang) - (!!a.hang)).forEach(b => {
      const so = this.shelfObjs.get(b.shelf); if (!so) return; const u = so.userData, t = b.tier || 0, sl = b.slot || 0, M = O(b.shelf);
      if (!Number.isInteger(t) || !Number.isInteger(sl) || t < 0 || sl < 0 || t >= u.tiers || sl >= u.slotsPerTier) { bad.push(b); return; }
      const ks = this.need(so, b); if (ks.some(k => M.has(k))) bad.push(b); else ks.forEach(k => M.set(k, b.id));
    });
    bad.forEach(b => {
      let fs = null, id = null; const tryAll = hang => { for (const s of [this.lib.shelves.find(x => x.id === b.shelf), ...this.lib.shelves]) { const so = s && this.shelfObjs.get(s.id); if (!so) continue; fs = this.findSpot(so, O(s.id), hang, s.id === b.shelf ? b.tier : null, s.id === b.shelf ? b.slot : null); if (fs) { id = s.id; return; } } };
      tryAll(!!b.hang); if (!fs && b.hang) { delete b.hang; tryAll(false); }
      if (!fs) { const s = this.makeDefaultShelf(); id = s.id; fs = this.findSpot(this.shelfObjs.get(id), O(id)); }
      Object.assign(b, { shelf: id, tier: fs.tier, slot: fs.slot }); this.need(this.shelfObjs.get(id), b).forEach(k => O(id).set(k, b.id));
    });
    if (bad.length) console.info(`Scriptorium: ${bad.length} scroll(s) shared a shelf slot and were moved to free slots`);
    return bad.length;
  }
  // The user's bookcases hold scrolls only. Every tier of every bookcase carries its cradles (props.scrollRests, one
  // instanced draw call per bookcase), so a new bookcase reads as ready on all its rows; hanging scrolls get their chains.
  refill(id) {
    if (id == null) { this.lib.shelves.forEach(s => this.refill(s.id)); return; }
    const so = this.shelfObjs.get(id); if (!so) return;
    setRestTiers(so, null);
    setChains(so, this.lib.books.filter(b => b.shelf === id && b.hang).flatMap(b => chainItems(so, b)));
    this.shadowsDirty = true;
  }
  caseDepth() { return (this.shell && this.shell.userData.baroque && this.shell.userData.baroque.caseDepth) || 0; }
  // footprints of the user's bookcases, for leaving out the built-in wall cases behind them
  caseSkip() { return this.lib.shelves.map(s => { const K = SHELF_KINDS[s.kind] || SHELF_KINDS.horizontal; return { x: s.x, z: s.z, w: (s.w || K.w) + .22, d: K.d + .08, rot: s.rot || 0 }; }); }
  updateWallCases() { this.shadowsDirty = true; this.obstaclesDirty = true; this.probeDirty = true; if (this.shell && this.shell.userData.setCases) this.shell.userData.setCases({ skip: this.caseSkip() }); }
  // eye-level tiers first (scroll centres nearest 1.35 m), then the rest
  tierOrder(u) { return caseTierOrder(u); }
  // walk-mode collision boxes, recomputed only when bookcases or furniture change (or a bookcase is being dragged)
  obstacles() { if (this.obstaclesDirty || this.dragging || !this._obs) { this._obs = this._obsFn(); this.obstaclesDirty = false; } return this._obs; }
  addShelfObj(s) { this.obstaclesDirty = true; this.shadowsDirty = true; const o = makeBookcase(s); o.position.set(s.x, 0, s.z); o.rotation.y = s.rot || 0; this.scene.add(o); quietShadows(o); this.shelfObjs.set(s.id, o); return o; }
  addScrollObj(b) {
    const so = this.shelfObjs.get(b.shelf); if (!so) return null;
    const o = makeScroll(b); so.add(o); poseScroll(o, so, b); quietShadows(o); this.scrollObjs.set(b.id, o); return o;
  }
  freeSlot(shelf, hang = false) { const so = this.shelfObjs.get(shelf.id); return so ? this.findSpot(so, this.occ(shelf.id), hang) : null; }
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
    const R = this.lib.hub, cam = this.camera;
    // the opening view is the hall's own composition: from the middle of the entrance end, eye height, looking down the
    // carpet to the window wall (symmetric: windows, columns, the bookcases either side). A view jammed against one
    // bookcase hid the room it belongs to; the hero scrolls get the warm pool of light instead (syncGlow)
    { const c = this.caseDepth() + .5, z = Math.max(0, R.d / 2 - c - .35), eye = 1.6; cam.position.set(0, eye, z); this.controls.target.set(0, eye + .25, Math.min(z - 4, -R.d / 2 + c)); this.controls.update(); return; }
    // (the hero framing below is kept for a direct call by name: heroView)
  }
  heroView() {
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
    u.append(el('button', { class: 'brand brand-btn', type: 'button', title: 'Back to the title screen (your scriptoria)', onclick: () => this.app.openTitle() }, [el('div', { class: 'brand-title', text: 'Scriptorium Memorialium' }), el('div', { class: 'brand-sub', text: (this.app.slots && (this.app.slots.find(x => x.id === this.app.slotId) || {}).name) || 'your library' })]));
    // the top bar: the main action, Get scroll, and one ⋯ for the rarer ones (arranging, the title screen, import / export);
    // while arranging, "Done arranging" stands in the bar itself so the way out is never hidden in a menu
    this.buildBtn = el('button', { type: 'button', text: 'Arrange library', onclick: () => this.toggleBuild() });
    const add = el('button', { class: 'btn primary', text: '+ Add PDF scroll', onclick: () => this.pickPDF() });
    const get = el('button', { class: 'btn', text: 'Get scroll', title: 'Scrolls other readers have made visible: search them by tag and keep a copy', onclick: () => this.app.getScroll() });
    this.doneBtn = el('button', { class: 'btn on', type: 'button', text: 'Done arranging', hidden: true, onclick: () => this.toggleBuild(false) });
    this.more = moreMenu([this.buildBtn, { text: 'Main menu', title: 'The title screen: continue, your scriptoria, a new one', onclick: () => this.app.openTitle() }, { text: 'Import / export', title: 'Plain JSON: the prompt pack, a room, the whole library', onclick: () => this.app.portDialog() }], { label: 'More: arrange, main menu, import / export' });
    u.append(el('div', { class: 'hub-actions glass' }, [add, get, this.doneBtn, this.more.wrap]));
    // the map of the hall: bookcases, their names, how many scrolls and about what (mapview.js)
    this.map = new MapView(u, { camera: this.camera, provider: () => this.mapPlan(), onIcon: it => { const sh = this.lib.shelves.find(x => x.id === it.id); if (sh) this.chooseShelfIcon(sh); }, onSymbols: () => this.chooseShelfIcon(null), onPick: it => { const so = this.shelfObjs.get(it.id); if (!so) return; const p = so.getWorldPosition(V3()); p.y = 1.5; const n = V3(0, 0, 1).applyQuaternion(so.getWorldQuaternion(new THREE.Quaternion())); this.frameAt(p, n); } });
    this.hint = el('div', { class: 'hint glass' }); u.append(this.hint); this.tipStage = tipStage(); this.restHint();
    // the scroll the library offers on a first visit (cueAt) and the engraved name of the scroll nearest the eye (noticeAt)
    this.cueLabel = el('div', { class: 'cue-label', 'aria-hidden': 'true' }, [el('span', { text: 'Open a scroll' })]); u.append(this.cueLabel);
    this.caption = el('div', { class: 'hall-caption', 'aria-hidden': 'true' }); u.append(this.caption);
    this.tip = el('div', { class: 'tooltip', hidden: true }); u.append(this.tip);
    this.buildPanel = el('aside', { class: 'side-panel glass', hidden: true }); u.append(this.buildPanel);
    this.fileIn = el('input', { type: 'file', accept: 'application/pdf', multiple: true, hidden: true }); u.append(this.fileIn);
    this.fileIn.onchange = () => { const files = [...this.fileIn.files]; this.fileIn.value = ''; return this.addFiles(files); };
  }
  toggleBuild(on = !this.build) {
    this.build = on; this.buildBtn.textContent = on ? 'Done arranging' : 'Arrange library'; this.doneBtn.hidden = !on; if (on) this.kbClear();
    this.buildPanel.hidden = !on; this.restHint();
    if (!on) this.selectShelf(null); this.renderBuildPanel();
  }
  // the hint at rest: arranging, a first-visit tip, or the full reference line. A changed text fades through (.swap).
  restHint() {
    const t = this.build ? HINTS.build() : this.tipStage < TIPS.length ? TIPS[this.tipStage]() : HINTS.look(), h = this.hint;
    h.classList.toggle('tip', !this.build && this.tipStage < TIPS.length); if (h.textContent === t) return;
    if (!h.textContent || prefersCalm()) { h.textContent = t; return; }
    h.classList.add('swap'); clearTimeout(this._hintT); this._hintT = setTimeout(() => { h.textContent = t; h.classList.remove('swap'); }, 260);
  }
  // a tip done: the next one (touch screens have no keys: the walking tip is passed over)
  tipDone(k) {
    if (this.tipStage !== k && !(k === TIPS.length && this.tipStage < k)) return;
    this.tipStage = k + 1; if (this.tipStage === 1 && TOUCH()) this.tipStage = 2; if (k === TIPS.length) this.tipStage = TIPS.length;
    try { localStorage.setItem(TIPS_KEY, String(this.tipStage)); } catch (e) { }
    if (!this.opening) this.restHint();
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
          el('button', { class: 'btn small', title: 'The icon of this bookcase on the map', html: iconSVG(s.icon || iconFor(s.name), 15) + ' Icon', onclick: () => this.chooseShelfIcon(s) }),
          el('button', { class: 'btn small', text: '⟲ 90°', onclick: () => this.rotateShelf(s, Math.PI / 2) }),
          el('button', { class: 'btn small', text: '⟳ 15°', onclick: () => this.rotateShelf(s, -Math.PI / 12) }),
          el('button', { class: 'btn small', text: s.kind === 'horizontal' ? 'Make vertical' : 'Make horizontal', onclick: () => { s.kind = s.kind === 'horizontal' ? 'vertical' : 'horizontal'; this.reflowBooks(s); this.snap(s, true); this.rebuildShelf(s); this.sfx('wood', { gain: .5 }); this.app.saveLib(); this.renderBuildPanel(); } }),
          el('button', { class: 'btn small', text: '+ Add PDF here', onclick: () => this.pickPDF(s.id) }),
          el('button', { class: 'btn small danger', text: 'Remove', onclick: () => this.deleteShelf(s.id) })]));
    }
    P.append(el('p', { class: 'dim small', text: 'Tip: name each bookcase by subject (Maths, Physics, Biology…). Bookcases snap flush to the nearest wall.' }));
  }
  // the icon of a bookcase (on the map and in its legend): chosen from the set, or "automatic" (what its name calls for)
  chooseShelfIcon(s) {
    const items = this.mapPlan().items, targets = this.lib.shelves.map(sh => { const it = items.find(x => x.id === sh.id); return { id: sh.id, label: sh.name, sub: it ? it.sub : '', icon: sh.icon || '', auto: it ? it.auto : iconFor(sh.name) }; });
    openSymbolPicker({ title: 'Select a symbol', kind: 'bookcase', targets, current: s ? s.id : null, onSet: (t, name, d) => {
      const sh = this.lib.shelves.find(x => x.id === t.id); if (!sh) return;
      if (name) sh.icon = name; else delete sh.icon; if (d) sh.iconD = d; else delete sh.iconD;
      this.app.saveLib(); if (this.map) { this.map.sig = ''; this.map.update(1); } if (this.build) this.renderBuildPanel(); } });
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
    const old = this.shelfObjs.get(s.id); if (old) { this.dropGhost(old); old.removeFromParent(); this.trash([old]); } this.shelfObjs.delete(s.id);
    this.addShelfObj(s);
    const where = b => b.shelf + ':' + b.tier + ':' + b.slot + ':' + !!b.hang, before = new Map(this.lib.books.map(b => [b.id, where(b)]));
    if (this.repairSlots()) { this.app.saveLib(); this.lib.books.filter(b => b.shelf !== s.id && before.get(b.id) !== where(b)).forEach(b => { this.rebuildScroll(b); this.refill(b.shelf); }); }
    this.lib.books.filter(b => b.shelf === s.id).forEach(b => this.addScrollObj(b)); this.refill(s.id); this.updateWallCases(); this.glowDirty = true;
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
    this.lib.shelves = this.lib.shelves.filter(x => x !== s); const o = this.shelfObjs.get(id); if (o) { this.dropGhost(o); o.removeFromParent(); this.trash([o]); } this.shelfObjs.delete(id);
    books.forEach(b => { b.shelf = null; this.scrollObjs.delete(b.id); });
    books.forEach(b => {
      let target = this.lib.shelves.find(x => this.freeSlot(x, !!b.hang)); if (!target && b.hang) { delete b.hang; target = this.lib.shelves.find(x => this.freeSlot(x)); }
      target = target || this.makeDefaultShelf(); const fs = this.freeSlot(target, !!b.hang); Object.assign(b, { shelf: target.id, tier: fs.tier, slot: fs.slot }); this.addScrollObj(b); this.refill(target.id); });
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
  // place (optional, the first file only): {caseId, row, slot, hang?} chosen in a dialog (see placeScroll)
  async addFiles(files, place = null) {
    for (const f of files) { if (this.disposed) return; try { await this.addPDF(f, place); place = null; } catch (e) { console.warn(e); toast(`Could not add "${f.name}": ${e.message || e}`); } }
  }
  async addPDF(file, place = null) {
    const id = 'bk-' + uid(); const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const hang = place && place.hang ? this.hangOpts(place.hang) : null;
    let shelf, fs;
    if (place && this.canPlace(place.caseId, place.row, place.slot, !!hang)) { shelf = this.lib.shelves.find(s => s.id === place.caseId); fs = { tier: place.row, slot: place.slot }; }
    else {
      shelf = this.lib.shelves.find(s => s.id === ((place && place.caseId) || this.addTarget) && this.freeSlot(s)) || this.lib.shelves.find(s => this.freeSlot(s)) || this.makeDefaultShelf();
      fs = this.freeSlot(shelf);
    }
    // the slot is reserved (the book is listed) before anything is awaited, so a concurrent call can never take it too
    const b = { id, title, shelf: shelf.id, tier: fs.tier, slot: fs.slot, color: shelf.color, icon: 'PDF', hasPdf: true, added: Date.now(), size: file.size };
    if (hang && this.canPlace(shelf.id, fs.tier, fs.slot, true)) Object.assign(b, { important: true, hang: { ...hang, drop: hangDrop(this.shelfObjs.get(shelf.id), fs.tier, hang.drop) } });
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
  // remove a scroll's object and build it again where its book now says (a new place, pose or tag)
  rebuildScroll(b, arrive = false) {
    const o = this.scrollObjs.get(b.id); if (o && this.opening && this.opening.sc === o) return null;
    if (o) { if (this.hover === o) this.hover = null; o.removeFromParent(); this.trash([o]); this.scrollObjs.delete(b.id); }
    const n = this.addScrollObj(b); if (n && arrive) { n.userData.arrive = 0; n.scale.setScalar(.01); } return n;
  }
  hangOpts(h) { h = h === true ? {} : (h || {}); return { metal: h.metal in METALS ? h.metal : 'brass', drop: h.drop != null ? +h.drop : null }; }
  // ---------- placing, moving and hanging scrolls ----------
  // Move a book to {caseId, row, slot, hang?}. hang: true | {metal, drop} hangs it (and tags it important), false lays
  // it in a cradle, undefined keeps its current pose. If that place is taken, the nearest free place on the same
  // bookcase (same row first) is used. Returns {ok, caseId, row, slot, hang, moved} (moved: not the place asked for).
  moveBook(b, { caseId = b.shelf, row = b.tier || 0, slot = b.slot || 0, hang } = {}, { quiet = false } = {}) {
    const so = this.shelfObjs.get(caseId); if (!so) return { ok: false, reason: 'no such bookcase' };
    let H = hang === undefined ? (b.hang || null) : hang ? this.hangOpts(hang === true && b.hang ? b.hang : hang) : null;
    let fs = this.canPlace(caseId, row, slot, !!H, b.id) ? { tier: row, slot } : this.findSpot(so, this.occ(caseId, b.id), !!H, row, slot), moved = !fs || fs.tier !== row || fs.slot !== slot;
    if (!fs) return { ok: false, reason: H ? 'no row of this bookcase has room to hang it (it needs about 0.8 m free)' : 'this bookcase is full' };
    const from = b.shelf; Object.assign(b, { shelf: caseId, tier: fs.tier, slot: fs.slot });
    if (H) { b.hang = { metal: H.metal, drop: hangDrop(so, fs.tier, H.drop != null ? H.drop : b.hang && b.hang.drop) }; b.important = true; } else delete b.hang;
    this.rebuildScroll(b, !quiet); this.refill(caseId); if (from !== caseId) this.refill(from);
    this.glowDirty = true; this.obstaclesDirty = true; this.app.saveLib(); if (!quiet) this.sfx('wood', { gain: .35, pitch: 1.2 });
    return { ok: true, caseId, row: fs.tier, slot: fs.slot, hang: !!H, moved };
  }
  setImportant(b, on) { b.important = !!on; if (!on && b.hang) delete b.hang; this.rebuildScroll(b); this.refill(b.shelf); this.app.saveLib(); }
  // hang (or lay down) a scroll: at its own place if the span is free, else the nearest free span on its bookcase, else
  // on another bookcase; tells the user where it went when that is not where it was
  setHang(b, on, opts = {}) {
    if (!on) return this.moveBook(b, { hang: false }, { quiet: true });
    const H = this.hangOpts({ ...(b.hang || {}), ...opts });
    let r = this.moveBook(b, { hang: H }, { quiet: true });
    if (!r.ok) for (const s of this.lib.shelves) { if (s.id === b.shelf) continue; const so = this.shelfObjs.get(s.id), fs = so && this.findSpot(so, this.occ(s.id, b.id), true); if (fs) { r = this.moveBook(b, { caseId: s.id, row: fs.tier, slot: fs.slot, hang: H }, { quiet: true }); r.moved = true; break; } }
    if (!r.ok) toast('No shelf has room to hang this scroll: it needs a row with about 0.8 m free.');
    else { this.sfx('wood', { gain: .3, pitch: 1.5 }); if (r.moved) toast(`Hung on ${this.caseName(r.caseId)}, row ${this.rowLabel(r.caseId, r.row)}, to keep clear of its neighbours`); }
    return r;
  }
  // chain metal / drop changed: re-pose in place (no rebuild)
  setHangStyle(b, { metal, drop } = {}) {
    if (!b.hang) return; const so = this.shelfObjs.get(b.shelf), o = this.scrollObjs.get(b.id); if (!so) return;
    if (metal in METALS) b.hang.metal = metal; if (drop != null) b.hang.drop = hangDrop(so, b.tier || 0, drop);
    if (o && o.parent === so) poseScroll(o, so, b); this.refill(b.shelf); this.app.saveLib();
  }
  caseName(id) { return (this.lib.shelves.find(s => s.id === id) || {}).name || 'a bookcase'; }
  // rows are counted from the top for people (row 1 = the top row); the API uses tier indices (0 = the bottom row)
  rowLabel(id, t) { const so = this.shelfObjs.get(id); return so ? so.userData.tiers - t : t + 1; }
  // ---------- public API (for the Add-PDF dialog and other callers) ----------
  // listShelves() → [{caseId, title, kind, rows: [{row, label, hang: {min, max}, slots: [{slot, free, bookId?}]}]}]
  //   row: tier index, 0 = the bottom row (label: 1 = the top row, as people count); free: a new cradled scroll can go
  //   there; hang: the chain drop range of that row in metres. Rows are listed top first.
  listShelves() {
    return this.lib.shelves.filter(s => this.shelfObjs.get(s.id)).map(s => {
      const so = this.shelfObjs.get(s.id), u = so.userData, M = this.occ(s.id), rows = [];
      for (let t = u.tiers - 1; t >= 0; t--) {
        const slots = []; for (let j = 0; j < u.slotsPerTier; j++) { const id = M.get(t + ':' + j); slots.push(id ? { slot: j, free: false, bookId: id } : { slot: j, free: true }); }
        const L = hangLimits(so, t); rows.push({ row: t, label: u.tiers - t, hang: { min: +L.min.toFixed(3), max: +L.max.toFixed(3) }, slots });
      }
      return { caseId: s.id, title: s.name, kind: s.kind, rows };
    });
  }
  // highlightSlot(caseId, row, slot, {hang, frame = true, bookId}) shows a warm ghost scroll at that place (hanging, if
  // hang) and, if frame, turns the camera to it (0.8 s); highlightSlot(null) clears it. Returns {ok, free} (free: the
  // place can be taken; bookId: a book that may move there, its own place counts as free).
  highlightSlot(caseId, row, slot, { hang = false, frame = true, bookId = null } = {}) {
    if (caseId == null) { this.dropGhost(); return { ok: true, free: false }; }
    const so = this.shelfObjs.get(caseId); if (!so || !(row >= 0 && row < so.userData.tiers && slot >= 0 && slot < so.userData.slotsPerTier)) { this.dropGhost(); return { ok: false, free: false }; }
    const free = this.canPlace(caseId, row, slot, !!hang, bookId);
    if (!this.ghost) this.ghost = ghostScroll(); const G = this.ghost; if (G.parent !== so) so.add(G);
    poseScroll(G, so, { tier: row, slot, hang: hang ? this.hangOpts(hang) : null }); G.visible = true; G.userData.mat.color.set(free ? 0xffcf86 : 0xff6a50);
    if (frame) { so.updateMatrixWorld(true); this.frameAt(G.getWorldPosition(V3()), V3(0, 0, 1).transformDirection(so.matrixWorld).setY(0).normalize()); }
    return { ok: true, free };
  }
  dropGhost(onlyFrom) { const G = this.ghost; if (G && (!onlyFrom || G.parent === onlyFrom)) { G.removeFromParent(); G.visible = false; } }
  // placeScroll(bookId, {caseId, row, slot, hang?}) puts a book already in the library (e.g. just ingested) there,
  // cradled or hanging (hang: true | {metal, drop}); nearest free place on that bookcase if taken. → moveBook's result.
  placeScroll(bookId, target = {}) {
    const b = this.lib.books.find(x => x.id === bookId); if (!b) return { ok: false, reason: 'unknown book' };
    this.dropGhost(); const r = this.moveBook(b, target); if (r.ok && r.moved) toast(`That place was taken: "${b.title}" went to row ${this.rowLabel(r.caseId, r.row)}, place ${r.slot + 1}`); return r;
  }
  // a gentle camera move to look at a world point p on a bookcase facing n (overview: orbit target; walk: eye height);
  // the view aims 0.28 m below p, so p sits in the upper third, clear of a dialog at the bottom of the screen
  frameAt(p, n) {
    if (this.opening) return; const R = this.lib.hub, c = this.caseDepth() + .4, walk = this.nav.mode === 'walk';
    const to = p.clone().addScaledVector(n, 2.0).add(V3(n.z, 0, -n.x).multiplyScalar(.35)); to.y = walk ? this.camera.position.y : clamp(p.y + .35, 1.3, R.h - .5);
    to.x = clamp(to.x, -R.w / 2 + c, R.w / 2 - c); to.z = clamp(to.z, -R.d / 2 + c, R.d / 2 - c);
    // land only where walking or the overview allows (js/nav.js): out of every bookcase's footprint, inside the hall; and in
    // the overview, the point orbited must lie inside the hall's limits, so it is drawn back along the line of sight
    // (the view does not turn). Before, the landing spot was pushed sideways on the next frame: the kick to the side.
    const B = this.nav.bounds(); if (walk) this.nav.collide(to, B, .28); else { to.x = clamp(to.x, B.minX + .3, B.maxX - .3); to.z = clamp(to.z, B.minZ + .3, B.maxZ - .3); to.y = clamp(to.y, .4, B.h - .3); }
    const a1 = p.clone().add(V3(0, -.28, 0)), inB = q => q.x >= B.minX + .1 && q.x <= B.maxX - .1 && q.z >= B.minZ + .1 && q.z <= B.maxZ - .1;
    if (!walk && !inB(a1)) { let lo = 0, hi = 1; const d = a1.clone().sub(to), q = V3(); for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; q.copy(to).addScaledVector(d, m); if (inB(q)) lo = m; else hi = m; } a1.copy(to).addScaledVector(d, Math.max(.05, lo)); }
    const far = this.camera.position.distanceTo(to);
    const q1 = lookQ(to, a1); this.camTween = { t: 0, dur: prefersCalm() ? .05 : flightDur(this.camera.position, this.camera.quaternion, to, q1) /* calm motion: a cut */, p0: this.camera.position.clone(), q0: this.camera.quaternion.clone(), p1: to, q1, a1, walk, lift: walk ? 0 : Math.min(.9, far * .07) };   /* longer ways and larger turns take longer; the overview arcs up a little on long ones */
  }
  stepCamTween(dt) {
    const T = this.camTween; T.t += dt; const k = easeSine(Math.min(1, T.t / T.dur));
    flyPose(this.camera, T, k);
    if (k >= 1) { this.camTween = null; if (!T.walk) { this.controls.target.copy(T.a1); this.controls.update(); } }
  }
  sfx(name, o) { if (this.app.sfx) this.app.sfx.play(name, o); }
  // ---------- deleting a scroll (App.deleteBook does the library and storage; these keep the hall in step) ----------
  // ask first, in the app's own dialog (never the browser's)
  async deleteScroll(id) {
    const b = this.lib.books.find(x => x.id === id); if (!b || this.opening) return false; this.closeMenu(); this.closeMove(); this.tip.hidden = true;
    const ok = await confirmBox(`“${b.title}” leaves its shelf, with its room, its analysed chains and its dioramas. You can undo this for a few seconds.`, 'Delete scroll', { danger: true, title: 'Delete this scroll?' });
    return ok && !this.disposed ? this.app.deleteBook(id) : false;
  }
  dropScroll(id, shelfId) { const o = this.scrollObjs.get(id); if (o) { if (this.hover === o) this.hover = null; o.removeFromParent(); this.trash([o]); } this.scrollObjs.delete(id); this.refill(shelfId); this.glowDirty = true; this.sfx('wood', { pitch: .7, gain: .4 }); }
  restoreScroll(b) {
    const so = this.shelfObjs.get(b.shelf);
    if (so && !this.canPlace(b.shelf, b.tier || 0, b.slot || 0, !!b.hang, b.id)) { const f = this.findSpot(so, this.occ(b.shelf, b.id), !!b.hang, b.tier, b.slot) || this.findSpot(so, this.occ(b.shelf, b.id), false, b.tier, b.slot); if (f) { if (!this.canPlace(b.shelf, f.tier, f.slot, !!b.hang, b.id)) delete b.hang; Object.assign(b, f); } }
    if (this.repairSlots()) this.app.saveLib();
    const o = this.addScrollObj(b); if (o) { o.userData.arrive = 0; o.scale.setScalar(.01); } this.refill(b.shelf); this.glowDirty = true;
  }
  // ---------- pointer ----------
  pick(e, list) { const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera); return this.ray.intersectObjects(list, true); }
  ownerOf(o, kind) { while (o && !(o.userData && o.userData.kind === kind)) o = o.parent; return o; }
  // the hall's door leads to the room visited last (App.rememberRoom), with its scroll open if it was left open
  lastRoom() { const L = this.lib.lastRoom, b = L && this.lib.books.find(x => x.id === L.book); return b ? { book: b, part: L.part || null } : null; }
  doorAt(e) { if (e.target !== this.gfx.canvas || !this.doorPick) return false; this.pick(e, []); return doorHit(this.ray, this.doorPick, [...this.shelfObjs.values(), ...(this.furn ? this.furn.children : [])]); }
  enterDoor() {
    const L = this.lastRoom(); if (!L) { toast('Open a scroll on a bookcase to enter its room: this door then leads back to it'); return false; }
    this.tip.hidden = true; this.app.walkThroughDoor(() => this.app.openRoom(L.book.id, { openPart: L.part || undefined })); return true;
  }
  // the book under the pointer: its scroll, or one of the cradles of the place it takes (its holder)
  bookAt(e) {
    const sc = this.scrollAt(e); if (sc) return sc.userData.bookId; if (e.target !== this.gfx.canvas) return null;
    const rests = [...this.shelfObjs.values()].map(so => so.userData.rests).filter(Boolean), h = this.pick(e, rests)[0]; if (!h || h.instanceId == null) return null;
    const so = h.object.parent, u = so.userData, k = h.instanceId >> 1, t = Math.floor(k / u.slotsPerTier), key = t + ':' + (k % u.slotsPerTier);   /* two cradles per place, tiers in order (setRestTiers(o, null)) */
    const b = this.lib.books.find(x => x.shelf === u.shelfId && (x.tier || 0) === t && this.need(so, x).includes(key)); return b ? b.id : null;
  }
  scrollAt(e) { if (e.target !== this.gfx.canvas) return null; const h = this.pick(e, [...this.scrollObjs.values()])[0]; return (h && this.ownerOf(h.object, 'scroll')) || null; }
  pointerDown(e) {
    if (this.opening) return; this.down = { x: e.clientX, y: e.clientY }; if (e.button === 2) this.rdown = { x: e.clientX, y: e.clientY };
    if (this.kbFocus) this.kbClear();   // the pointer takes over from the keyboard's choice
    clearTimeout(this._lpT); this._lpFired = false;
    if (e.pointerType && e.pointerType !== 'mouse') { const id = this.bookAt(e); if (id) this._lpT = setTimeout(() => { if (!this.down || this.opening) return; this._lpFired = true; if (this.sdrag) this.endScrollDrag(false); this.openMenu(id, this.down.x, this.down.y); }, 550); }
    if (e.button !== 0) return;
    if (this.build) {
      // a scroll first (drag it to another place), else its bookcase
      const sc = this.scrollAt(e); if (sc) { this.sdrag = { sc, b: this.lib.books.find(x => x.id === sc.userData.bookId), active: false, target: null }; this.controls.enabled = false; return; }
      const h = this.pick(e, [...this.shelfObjs.values()])[0]; const sh = h && this.ownerOf(h.object, 'shelf'); if (sh) { this.selectShelf(sh.userData.shelfId); this.dragging = sh; this._lifted = false; this.controls.enabled = false; }
    }
  }
  pointerMove(e) {
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) clearTimeout(this._lpT);
    if (this.down && this.tipStage === 0 && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 40) this.tipDone(0);   // looked round: the next tip
    if (this.sdrag) { this.dragScroll(e); return; }
    if (this.opening || !e.target || e.target !== this.gfx.canvas) { if (!this.dragging) { this.tip.hidden = true; } }
    if (this.dragging) {
      const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera);
      if (!this._lifted) { this._lifted = true; this.sfx('wood', { pitch: .8, gain: .45 }); }   // picked up: a soft, lower knock
      const p = V3(); if (this.ray.ray.intersectPlane(this.floorPlane, p)) { const s = this.lib.shelves.find(x => x.id === this.dragging.userData.shelfId); s.x = p.x; s.z = p.z; this.snap(s); this.dragging.position.set(s.x, 0, s.z); this.dragging.rotation.y = s.rot;
        const now = performance.now(); if (!(now - (this._casesT || 0) < 350)) { this._casesT = now; this.updateWallCases(); } } // wall cases make room while dragging (throttled)
      return;
    }
    if (e.target !== this.gfx.canvas || this.build || this.menu) return;
    const sc = this.scrollAt(e);
    if (sc !== this.hover) { this.hover = sc; this.gfx.canvas.style.cursor = sc ? 'pointer' : ''; }   /* its warm glow: glowScrolls */
    if (sc) {
      const b = this.lib.books.find(x => x.id === sc.userData.bookId); this.tip.hidden = false;
      const st = b.hang ? `hanging on ${METALS[b.hang.metal in METALS ? b.hang.metal : 'brass'].label.toLowerCase()} chains · ` : '';
      this.tip.innerHTML = `<b>${b.important ? '★ ' : ''}${mathHTML(b.title, 'label')}</b><span>${st}${b.pages ? b.pages + ' pages · ' : ''}${esc((this.lib.shelves.find(s => s.id === b.shelf) || {}).name || '')}</span><span class="tip-more">${TOUCH() ? 'Long-press' : 'Right-click'} for options: important, hang on chains, move, delete</span>`;
      this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
    } else if (this.doorAt(e)) {
      const L = this.lastRoom(); this.gfx.canvas.style.cursor = L ? 'pointer' : ''; this.tip.hidden = false;
      this.tip.innerHTML = L ? `<b>The door</b><span>Back to the room of “${mathHTML(L.book.title, 'label')}”${L.part ? ', its scroll open' : ''}</span>` : `<b>The door</b><span>Open a scroll to enter its book's room: this door then leads back to it</span>`;
      this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
    } else this.tip.hidden = true;
  }
  pointerUp(e) {
    clearTimeout(this._lpT); if (this._lpFired) { this._lpFired = false; this.down = null; return; }
    if (this.sdrag) { const D = this.endScrollDrag(true); if (!D.active && e.target === this.gfx.canvas && this.down) this.openMenu(D.b.id, e.clientX, e.clientY); this.down = null; return; }
    if (this.dragging) { if (this._lifted) this.sfx('wood', { gain: .6 }); this.dragging = null; this._lifted = false; this.glowDirty = true; this.controls.enabled = this.nav.mode !== 'walk'; this.updateWallCases(); this.app.saveLib(); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || e.target !== this.gfx.canvas) return; this.down = null;
    if (this.build) { const h = this.pick(e, [...this.shelfObjs.values()])[0]; if (!h) this.selectShelf(null); return; }
    const sc = this.scrollAt(e);
    if (sc) this.openScroll(sc); else if (this.doorAt(e)) this.enterDoor();
  }
  // Arrange mode: drag a scroll; a ghost shows the free place it would snap to (nearest free slot on the row under the
  // pointer; red when that row has none). Releasing over a free place moves it there.
  dragScroll(e) {
    const D = this.sdrag; if (!D.b) return;
    if (!D.active) { if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6) return; D.active = true; this.gfx.outline.enabled = true; this.gfx.outline.selectedObjects = [D.sc]; this.sfx('wood', { pitch: 1.3, gain: .25 }); this.tip.hidden = true; this.gfx.canvas.style.cursor = 'grabbing'; }
    let tg = null;
    for (const h of this.pick(e, [...this.shelfObjs.values()])) {
      const so = this.ownerOf(h.object, 'shelf'); if (!so) continue; const u = so.userData, id = u.shelfId, L = so.worldToLocal(h.point.clone());
      const row = clamp(Math.floor((L.y - .13) / u.tierH), 0, u.tiers - 1), j = slotAt(u, L.x);
      let best = null; for (let k = 0; k < u.slotsPerTier; k++) if (this.canPlace(id, row, k, !!D.b.hang, D.b.id) && (best == null || Math.abs(k - j) < Math.abs(best - j))) best = k;
      tg = { caseId: id, row, slot: best != null ? best : j, free: best != null }; break;
    }
    if (tg && D.target && tg.caseId === D.target.caseId && tg.row === D.target.row && tg.slot === D.target.slot) return;
    D.target = tg; if (tg) { this.highlightSlot(tg.caseId, tg.row, tg.slot, { hang: D.b.hang, frame: false, bookId: D.b.id }); this.sfx('click', { gain: .12 }); } else this.dropGhost();
  }
  endScrollDrag(commit) {
    const D = this.sdrag; if (!D) return null; this.sdrag = null; this.dropGhost(); this.highlight(this.selShelf ? this.shelfObjs.get(this.selShelf) : null);
    this.controls.enabled = this.nav.mode !== 'walk'; this.gfx.canvas.style.cursor = '';
    const T = D.target; if (commit && D.active && T && T.free && !(D.b.shelf === T.caseId && (D.b.tier || 0) === T.row && (D.b.slot || 0) === T.slot)) this.moveBook(D.b, { caseId: T.caseId, row: T.row, slot: T.slot });
    return D;
  }
  // ---------- the scroll menu (right-click / long-press / a click in Arrange mode) ----------
  openMenu(bookId, x, y) {
    const b = this.lib.books.find(q => q.id === bookId); if (!b || this.opening) return; this.closeMenu(); this.tip.hidden = true;
    this.menu = el('div', { class: 'scroll-menu glass', role: 'menu', 'aria-label': 'Scroll options' }); this.menuBook = b.id; this.ui.append(this.menu);
    this.renderMenu(); const r = this.menu.getBoundingClientRect();
    this.menu.style.left = clamp(x + 6, 8, innerWidth - r.width - 8) + 'px'; this.menu.style.top = clamp(y + 6, 8, innerHeight - r.height - 8) + 'px';
    this.sfx('click', { gain: .2 });
  }
  renderMenu() {
    const m = this.menu, b = this.lib.books.find(q => q.id === this.menuBook); if (!m) return; if (!b) { this.closeMenu(); return; } m.innerHTML = '';
    const item = (text, fn, extra = '') => el('button', { class: 'menu-item' + extra, role: 'menuitem', text, onclick: fn });
    m.append(el('div', { class: 'menu-title', text: (b.important ? '★ ' : '') + b.title }), el('div', { class: 'menu-sub', text: `${this.caseName(b.shelf)} · row ${this.rowLabel(b.shelf, b.tier || 0)} · place ${(b.slot || 0) + 1}` }));
    m.append(item('Open scroll', () => { const sc = this.scrollObjs.get(b.id); this.closeMenu(); if (sc) this.openScroll(sc); }));
    m.append(item(b.important ? '☆ Remove the “important” tag' : '★ Tag as important', () => { this.setImportant(b, !b.important); this.renderMenu(); }));
    m.append(item(b.hang ? 'Lay it back in a cradle' : 'Hang on chains', () => { this.setHang(b, !b.hang); this.renderMenu(); }));
    if (b.hang) {
      const so = this.shelfObjs.get(b.shelf), L = so ? hangLimits(so, b.tier || 0) : { min: .1, max: .3 };
      m.append(el('div', { class: 'menu-h', text: 'Chain metal' }), el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Chain metal' }, Object.entries(METALS).map(([k, M]) =>
        el('button', { class: 'swatch' + (b.hang.metal === k ? ' on' : ''), title: M.label, 'aria-label': M.label, role: 'radio', 'aria-checked': String(b.hang.metal === k), style: '--c:#' + M.color.toString(16).padStart(6, '0'), onclick: () => { this.setHangStyle(b, { metal: k }); this.renderMenu(); } }))));
      const cm = v => Math.round(v * 100) + ' cm', out = el('b', { text: cm(b.hang.drop) }), inp = el('input', { type: 'range', min: L.min, max: L.max, step: .005, value: b.hang.drop, 'aria-label': 'Chain length' });
      inp.oninput = () => { this.setHangStyle(b, { drop: +inp.value }); out.textContent = cm(b.hang.drop); };
      m.append(el('label', { class: 'ctrl' }, [el('span', {}, ['Chain length (drop)', out]), inp]), el('div', { class: 'menu-note', text: `${cm(L.min)}–${cm(L.max)} on this row: the scroll stays clear of the shelf above and the cradles below` }));
    }
    m.append(item('Move to…', () => { this.closeMenu(); this.openMove(b.id); }));
    m.append(item('Duplicate…', () => { this.closeMenu(); this.app.duplicateBook(b.id); }));
    m.append(item(b.visibility === 'public' ? '◉ Visible to everyone…' : '○ Private · make visible…', () => { this.closeMenu(); this.app.bookVisibility(b.id); }));
    m.append(el('div', { class: 'menu-sep', role: 'separator' }), item('Delete scroll…', () => this.deleteScroll(b.id), ' danger'));
  }
  closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }
  // the plan for the map: each bookcase as its footprint, with its name, its number of scrolls and their subjects
  mapPlan() {
    const R = this.lib.hub, items = [], box = new THREE.Box3(), q = new THREE.Quaternion();
    for (const sh of this.lib.shelves) { if (sh.icon && sh.iconD) rememberIcon(sh.icon, '', sh.iconD); const so = this.shelfObjs.get(sh.id); if (!so) continue;
      if (!so.userData._mapWD) { const r = so.rotation.y; so.rotation.y = 0; so.updateMatrixWorld(true); box.setFromObject(so); so.rotation.y = r; so.updateMatrixWorld(true); so.userData._mapWD = [box.max.x - box.min.x, box.max.z - box.min.z]; }
      const p = so.getWorldPosition(V3()), books = this.lib.books.filter(b => b.shelf === sh.id), subj = {}; books.forEach(b => autoTags(b, { parts: [] }).forEach(t => { subj[t] = (subj[t] || 0) + 1; }));
      const top = Object.entries(subj).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
      so.getWorldQuaternion(q); const rot = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      items.push({ id: sh.id, kind: 'case', x: +p.x.toFixed(2), z: +p.z.toFixed(2), w: +so.userData._mapWD[0].toFixed(2), d: +Math.max(.3, so.userData._mapWD[1]).toFixed(2), rot: +rot.toFixed(3), label: sh.name, icon: sh.icon || iconFor(sh.name + ' ' + top.join(' ')), auto: iconFor(sh.name + ' ' + top.join(' ')), sub: `${books.length} scroll${books.length === 1 ? '' : 's'}${top.length ? ' · ' + top.join(', ') : ''}` }); }
    return { title: 'The library hall', kind: 'hall', w: R.w, d: R.d, door: this.doorPick ? { x: 0, z: R.d / 2 } : null, items };
  }
  // "Move to…": bookcase, then a grid of rows × places (taken places disabled); the ghost and the camera preview the
  // chosen place while the dialog (bottom of the screen, no dark veil) stays open
  openMove(bookId) {
    const b = this.lib.books.find(q => q.id === bookId); if (!b) return; this.closeMove();
    const st = { caseId: b.shelf, row: b.tier || 0, slot: b.slot || 0 };
    const box = el('div', { class: 'modal glass move-dlg', role: 'dialog', 'aria-label': 'Move scroll' }), veil = el('div', { class: 'modal-veil peek' }, [box]);
    document.body.append(veil); this.moveDlg = veil;
    const render = () => {
      box.innerHTML = ''; const list = this.listShelves(); if (!list.length) { this.closeMove(); return; }
      const C = list.find(c => c.caseId === st.caseId) || list[0]; st.caseId = C.caseId;
      const sel = el('select', { class: 'field', 'aria-label': 'Bookcase', onchange: () => { st.caseId = sel.value; st.row = null; this.dropGhost(); render(); } }, list.map(c => el('option', { value: c.caseId, text: c.title, selected: c.caseId === st.caseId })));
      const grid = el('div', { class: 'slot-grid' });
      C.rows.forEach(r => grid.append(el('div', { class: 'slot-row' }, [el('span', { class: 'slot-lab', text: 'Row ' + r.label }), ...r.slots.map(sl => {
        const can = this.canPlace(C.caseId, r.row, sl.slot, !!b.hang, b.id), mine = sl.bookId === b.id, on = st.row === r.row && st.slot === sl.slot;
        return el('button', { class: 'slot' + (mine ? ' mine' : '') + (on ? ' on' : ''), disabled: !can, 'aria-pressed': String(on), title: mine ? 'its place now' : can ? 'free' : 'taken', 'aria-label': `Row ${r.label}, place ${sl.slot + 1}${mine ? ', its place now' : can ? '' : ', taken'}`,
          onclick: () => { st.row = r.row; st.slot = sl.slot; this.highlightSlot(C.caseId, r.row, sl.slot, { hang: b.hang, bookId: b.id }); render(); } });
      })])));
      const same = st.caseId === b.shelf && st.row === (b.tier || 0) && st.slot === (b.slot || 0), ok = st.row != null && !same && this.canPlace(st.caseId, st.row, st.slot, !!b.hang, b.id);
      box.append(el('h3', { text: 'Move “' + b.title + '”' }), el('label', { text: 'Bookcase' }), sel,
        el('label', { text: b.hang ? 'Place (rows top to bottom; a hanging scroll needs the places round it free)' : 'Place (rows top to bottom)' }), grid,
        el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => this.closeMove() }), el('button', { class: 'btn primary', text: 'Move here', disabled: !ok, onclick: () => { this.closeMove(); this.moveBook(b, { caseId: st.caseId, row: st.row, slot: st.slot }); } })]));
    };
    render(); this.highlightSlot(st.caseId, st.row, st.slot, { hang: b.hang, bookId: b.id });
  }
  closeMove() { if (this.moveDlg) { this.moveDlg.remove(); this.moveDlg = null; this.dropGhost(); } }
  // ---------- the opening: fly → lift → unroll in light → dive into the page ----------
  // The interface fades away first (body.cine: the action pill, the hint, the walk panel and the corner buttons), so the
  // opening is a clean shot; Escape before the dive cancels it (the scroll goes back to its slot, the interface returns).
  // The camera flies to stand 1.22 m before the sheet, aimed a little above the sheet's middle so the roll sits in the
  // upper third, well clear of the top edge. The flight lasts 1.4 s + 0.01 s per degree the view has to turn (an 85°
  // turn takes 2.25 s, never a whip-pan), quintic in-out (smootherstep: zero speed and acceleration at both ends, peak
  // 1.875 × the mean rate) on an angle-uniform turn of the view direction; the scroll rises
  // from its slot and turns to face the camera during the flight's second half; the sheet then unrolls downward from the
  // roll (1.5 s) with a weighted rod on its lower edge. The light that comes with it is a warm, restrained halo behind
  // the sheet and a back light on the bookcase behind it: the sheet itself only gains a faint glow, so its parchment
  // and title stay readable and below the bloom threshold. Fully open it holds a beat, then the camera moves in as the
  // screen fades (1.05 s); the room opens when the fade is complete.
  // Taking the scroll out (takeOutPath, scrollPose): it starts where it is (in its cradles or on its chains), rises 3 cm
  // out of the cradles' hollow (a hanging one leaves its hooks going straight forward), slides straight forward out of the case
  // until its back end is 3 cm before everything on the bookcase (case, cornice, neighbours' tags), then rises to the
  // reading height, and turns to face the viewer only once it is out (a turn about its middle never brings its ends
  // back toward the case by more than 6 mm). The flight and the unroll follow as before.
  openScroll(sc) {
    const b = this.lib.books.find(x => x.id === sc.userData.bookId); if (!b) return;
    if (this.app.prefetchRoom) this.app.prefetchRoom(b.id);   // the room's data is read while the scroll flies (the switch then finds it read)
    this.closeMenu(); this.closeMove(); this.dropGhost(); this.camTween = null; if (this.sdrag) this.endScrollDrag(false);
    this.opening = { sc, b, t: 0 }; this.controls.enabled = false; this.tip.hidden = true; this.highlight(null); this.gfx.canvas.style.cursor = '';
    if (this.hover) { this.hover.userData.paper.emissiveIntensity = 0; this.hover = null; }
    this.kbFocus = null; this.unlight(); this.cueLabel.classList.remove('on'); this.caption.classList.remove('on'); this.tipDone(TIPS.length);   /* a scroll opened: the first-visit cue and tips are done */
    const wp = sc.getWorldPosition(V3()), so = sc.parent, outward = V3(0, 0, 1).applyQuaternion(so.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    if (this.nav.mode === 'walk') { const f = V3(); this.camera.getWorldDirection(f); this.controls.target.copy(this.camera.position).addScaledVector(f, 1.6); }
    const O = this.opening; O.from = { p: this.camera.position.clone(), t: this.controls.target.clone() }; O.so = so; O.slotP = sc.position.clone(); O.slotQ = sc.quaternion.clone();
    O.path = this.takeOutPath(sc, so, wp, outward); O.liftTo = O.path.end;
    O.look = O.liftTo.clone().add(V3(0, -.22, 0));                       // a little above the middle of the unrolled sheet
    O.camTo = O.look.clone().addScaledVector(outward, 1.22).add(V3(0, .04, 0));
    O.into = O.look.clone().addScaledVector(outward, .3);
    O.start = wp.clone(); O.q0 = sc.getWorldQuaternion(new THREE.Quaternion());
    // the flight's length grows with the turn: the view direction at the start and at the end
    O.d0 = O.from.t.clone().sub(O.from.p).normalize(); O.d1 = O.look.clone().sub(O.camTo).normalize(); O.dist0 = O.from.t.distanceTo(O.from.p);
    const deg = THREE.MathUtils.radToDeg(O.d0.angleTo(O.d1)); O.tFly = 1.4 + .01 * deg;
    // the scroll's way out ends with the flight (or after it, when the way out is the longer); then the unroll
    O.S0 = Math.max(0, O.tFly - O.path.D); O.tUn = Math.max(O.tFly, O.S0 + O.path.D) + .1;
    O.qd = new THREE.Quaternion().setFromUnitVectors(O.d0, O.d1);
    this.scene.attach(sc);   // reparent to the hall so it can float free
    if (b.hang) { const sid = so.userData.shelfId; setChains(so, this.lib.books.filter(x => x.shelf === sid && x.hang && x !== b).flatMap(x => chainItems(so, x))); O.chainsOff = sid; }   // its chains go with it (no ends left dangling while it is out)
    // facing: the scroll's axis (local z) across the view, its front (local −x) toward the viewer, kept level
    O.face = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(O.liftTo.clone().add(outward), O.liftTo, V3(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2));
    O.sheet = makeSheet(SCROLL_L - .02, .6, b.title);   /* the sheet is as wide as the roll it leaves */ sc.add(O.sheet);
    // the back light: behind the sheet's middle (the viewer is toward local −x), it warms the bookcase behind it into a
    // soft halo round the sheet's edges
    O.light = this.openLight; O.light.intensity = 0; sc.add(O.light); O.light.position.set(.28, -.32, 0);
    this.hint.textContent = 'Opening "' + b.title + '"…';
    document.body.classList.add('cine');
  }
  // The way out, from the scroll's pose on its bookcase so (case frame: +z out of the case, +y up). Box sizes are the
  // case-frame bounds of the bookcase without this scroll, and of the scroll itself.
  takeOutPath(sc, so, wp, outward) {
    so.updateMatrixWorld(true); const inv = so.matrixWorld.clone().invert();
    const caseBox = localBox(so, inv, o => !isUnder(o, sc) && o.name !== 'slot-ghost'), own = localBox(sc, inv), P0 = sc.position.clone();
    const hanging = !!sc.userData.hanging, rise = hanging ? 0 : .03, zClear = caseBox.max.z + .03;   // off the chain hooks: straight forward (the knob tops fall away from the hooks)
    // the reading height: 1.5 m (rod a hand below the case top), also for a scroll taken from a high tier or its chains (held up at the cornice's height
    // it sat across the dentils, the sheet hanging over the case top); never below the top of the case's lower body
    const slide = Math.max(zClear - own.min.z + .02, .62 - P0.z), y1 = wp.y + rise, liftY = 1.5, up = liftY - y1;
    const dUp = clamp(.45 + .4 * Math.abs(up), .5, 1.1), T = { rise: [0, .35], slide: [.25, 1.25], up: [1.1, 1.1 + dUp], turn: [1.22, Math.max(2.1, 1.22 + dUp)] };
    return { A: wp.clone(), out: outward.clone(), rise, slide, up, T, D: Math.max(T.up[1], T.turn[1]), zClear, end: wp.clone().addScaledVector(outward, slide).setY(liftY) };
  }
  // the scroll's pose at s seconds along its way out (each leg eased with smootherstep: still at both ends)
  scrollPose(O, s) {
    const P = O.path, sm = ([a, b]) => { const u = clamp((s - a) / (b - a), 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); }, sc = O.sc;
    sc.position.copy(P.A).addScaledVector(P.out, P.slide * sm(P.T.slide)); sc.position.y += P.rise * sm(P.T.rise) + P.up * sm(P.T.up);
    sc.quaternion.slerpQuaternions(O.q0, O.face, sm(P.T.turn));
  }
  // Escape during the opening (before the dive): the camera eases back and the scroll goes back the way it came
  // (0.7 s, or longer for a scroll already far out), then the interface returns
  cancelOpening() {
    const O = this.opening; if (!O || O.done || O.cancel || O.t > O.tUn + 1.5 + .2) return;
    O.cancel = { t: 0, p: this.camera.position.clone(), tg: this.controls.target.clone(), ps: O.ps || 0, k3: O.k3 || 0, dur: Math.max(.7, (O.ps || 0) * .6) };
  }
  stepCancel(dt) {
    const O = this.opening, C = O.cancel, c = this.camera, sc = O.sc, S = O.sheet.userData; C.t += dt;
    const k = ease(Math.min(1, C.t / C.dur)), e3 = C.k3 * (1 - Math.min(1, C.t / .5));
    c.position.lerpVectors(C.p, O.from.p, k); this.controls.target.lerpVectors(C.tg, O.from.t, k); c.lookAt(this.controls.target);
    this.scrollPose(O, C.ps * (1 - Math.min(1, C.t / C.dur)));
    S.sheet.scale.y = Math.max(.001, e3); S.rod.position.y = -S.h * e3; S.sheet.visible = S.rod.visible = e3 > .002; this.glowAt(O, e3);
    if (C.t < C.dur) return;
    O.so.attach(sc); sc.position.copy(O.slotP); sc.quaternion.copy(O.slotQ); if (O.chainsOff != null) this.refill(O.chainsOff);
    sc.remove(O.sheet); this.trash([O.sheet]); O.light.intensity = 0; this.scene.add(O.light);   /* back to the hall, dark (never removed: the light count stays the same) */
    sc.userData.paper.emissiveIntensity = 0; this.gfx.bloom.strength = this.scene.userData.look.bloom;
    this.opening = null; this.controls.enabled = this.nav.mode !== 'walk'; if (this.controls.enabled) this.controls.update();
    this.restHint(); document.body.classList.remove('cine'); this.shadowsDirty = true;
  }
  // the unroll's light at strength e (0..1): a faint glow in the sheet, the halo behind it, the back light, a touch of bloom
  glowAt(O, e) {
    const S = O.sheet.userData; S.sheet.material.emissiveIntensity = e * .16; if (S.halo) S.halo.material.opacity = e * .55;
    O.light.intensity = e * 1.1; O.sc.userData.paper.emissiveIntensity = e * .12;
    this.gfx.bloom.strength = this.scene.userData.look.bloom + e * .05;
  }
  stepOpening(dt) {
    const O = this.opening; if (O.cancel) { this.stepCancel(dt); return; }
    const T_FLY = O.tFly, T_UN = O.tUn, D_UN = 1.5, T_DIVE = T_UN + D_UN + .3, D_DIVE = 1.05;
    O.t += dt * OPEN_PACE; const t = O.t, c = this.camera, sc = O.sc, S = O.sheet.userData;   /* the whole choreography at 1.3x (it took 5.1 s before the room began to build: long for the hall's most frequent act) */
    // the flight: position along a straight line; the view direction turns by an angle-uniform slerp under a quintic
    // in-out (peak 1.875 × the mean rate: an 85° turn peaks at ~71°/s), its aim distance blending from start to end
    const u1 = Math.min(1, t / T_FLY), k1 = u1 * u1 * u1 * (u1 * (u1 * 6 - 15) + 10);
    const dir = O.d0.clone().applyQuaternion(new THREE.Quaternion().slerp(O.qd, k1)), camP = V3().lerpVectors(O.from.p, O.camTo, k1);
    const aim = THREE.MathUtils.lerp(O.dist0, O.camTo.distanceTo(O.look), k1);
    this.controls.target.copy(camP).addScaledVector(dir, aim);
    O.ps = clamp(t - O.S0, 0, O.path.D); this.scrollPose(O, O.ps);
    // the unroll, and the light with it (nothing glows before the sheet moves)
    const k3 = clamp((t - T_UN) / D_UN, 0, 1), e3 = ease(k3); O.k3 = e3;
    if (k3 > 0 && !O.sound) { O.sound = true; this.sfx('unroll'); }
    S.sheet.scale.y = Math.max(.001, e3); S.rod.position.y = -S.h * e3; S.sheet.visible = S.rod.visible = k3 > 0;
    this.glowAt(O, e3);
    // the dive: only once the sheet is fully open (and has held a beat)
    const k4 = clamp((t - T_DIVE) / D_DIVE, 0, 1), e4 = ease(k4);
    if (k4 > 0) { c.position.lerpVectors(O.camTo, O.into, e4); this.controls.target.copy(O.look); } else c.position.copy(camP);
    c.lookAt(this.controls.target);
    this.gfx.grade.uniforms.uFade.value = ease(clamp((k4 - .25) / .75, 0, 1));
    if (k4 >= 1 && !O.done) { O.done = true; this.app.openRoom(O.b.id, { fromHub: true }); }
  }
  // ---------- the scrolls' warm light: the pointer, the first-visit cue, the scroll nearest the eye ----------
  // One place sets every scroll's glow (its paper's emissive), eased, each frame: the scroll under the pointer (.25), the
  // one chosen with [ / ] (.2), the one the library offers on a first visit (a slow breath between .07 and .2, steady under
  // calm motion) and the one within NEAR_R of the eye (.12). The opening owns its scroll's light (glowAt): none of this
  // runs while a scroll opens.
  unlight() { if (this._lit) this._lit.forEach((v, o) => { o.userData.paper.emissiveIntensity = 0; }); this._lit = new Map(); }
  glowScrolls(dt) {
    const L = this._lit || (this._lit = new Map()), want = new Map(), t = this._gt = (this._gt || 0) + dt, live = o => o && o.parent;
    if (live(this.near)) want.set(this.near, .12);
    if (live(this.cue)) want.set(this.cue, this._calm ? .16 : .07 + .13 * (.5 + .5 * Math.sin(t * 2.4)));
    const kb = this.kbFocus && this.scrollObjs.get(this.kbFocus); if (live(kb)) want.set(kb, .2);
    if (live(this.hover)) want.set(this.hover, .25);
    want.forEach((v, o) => { if (!L.has(o)) L.set(o, o.userData.paper.emissiveIntensity || 0); });
    const a = Math.min(1, dt * 8);
    L.forEach((v, o) => { if (!o.parent) { L.delete(o); return; } const w = want.get(o) || 0, n = Math.abs(w - v) < .003 ? w : v + (w - v) * a; o.userData.paper.emissiveIntensity = n; if (!n && !want.has(o)) L.delete(o); else L.set(o, n); });
  }
  // every 0.4 s: the scroll nearest the eye (within NEAR_R) and, on a first visit, the nearest one in view (the cue); the
  // screen boxes of the interface, which the cue's label keeps clear of
  sense() {
    const cam = this.camera, cp = cam.position, q = V3(), pr = V3(); let near = null, nd = NEAR_R * (this.nav.mode === 'walk' ? 1 : 1.25),   /* the overview's eye stands a little higher and further back */ cue = null, cd = Infinity; this._calm = prefersCalm();
    const showCue = this.tipStage < TIPS.length && !this.build && !this.menu && !this.moveDlg;
    this.scrollObjs.forEach(o => { if (o.userData.arrive != null || !o.parent) return; o.getWorldPosition(q); const d = q.distanceTo(cp);
      if (d < nd) { nd = d; near = o; }
      if (showCue && d < cd) { pr.copy(q).project(cam); if (pr.z < 1 && Math.abs(pr.x) < .8 && pr.y > -.7 && pr.y < .75) { cd = d; cue = o; } } });
    if (this.build || this.menu) near = null;
    this.cue = cue;
    this._hud = [...this.ui.children, ...document.querySelectorAll('.sound-btn, .gfx-btn, .ai-btn, .map-btn, .map-card, .ap-chip')].filter(e => e !== this.cueLabel && e !== this.caption && e !== this.tip && !e.hidden && e.offsetWidth).map(e => e.getBoundingClientRect());
    if (near !== this.near) { this.near = near; this.showCaption(near); }
    // the caption sits low in the middle; a narrow window where it would meet the hint or the walk panel leaves it out
    if (this.caption.classList.contains('on')) { const c = this.caption.getBoundingClientRect(); this.caption.classList.toggle('clash', this._hud.some(b => c.left < b.right && c.right > b.left && c.top < b.bottom && c.bottom > b.top)); }
  }
  // "The library notices you": the scroll nearest the eye names itself, engraved, low in the middle of the view, with a
  // quiet rustle of parchment (at most one every 2.5 s)
  showCaption(o) {
    const C = this.caption, b = o && this.lib.books.find(x => x.id === o.userData.bookId);
    if (!b) { C.classList.remove('on'); return; }
    C.innerHTML = `<span class="hc-k">${esc(this.caseName(b.shelf))}</span><b>${mathHTML(b.title, 'label')}</b>`; C.classList.remove('clash'); C.classList.add('on');
    const now = performance.now(); if (now - (this._rustleT || 0) > 2500) { this._rustleT = now; this.sfx('paper', { gain: .08 }); }
  }
  // the cue's floating label "Open a scroll", just above its scroll; left out wherever it would cover the interface
  placeCue() {
    const E = this.cueLabel, o = this.cue; let on = !!(o && o.parent) && !this.app.cine && !this.camTween && this.hover !== o;
    if (on) {
      const p = o.getWorldPosition(V3()); p.y += .16; p.project(this.camera); const r = this.gfx.canvas.getBoundingClientRect(), x = r.left + (p.x * .5 + .5) * r.width, y = r.top + (-p.y * .5 + .5) * r.height;
      const w = E.offsetWidth || 120, h = E.offsetHeight || 28, R = [x - w / 2 - 8, y - h - 18, x + w / 2 + 8, y + 4];
      on = p.z < 1 && R[0] > 0 && R[2] < innerWidth && R[1] > 0 && !(this._hud || []).some(b => R[0] < b.right && R[2] > b.left && R[1] < b.bottom && R[3] > b.top);
      if (on) E.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h - 10)}px)`;
    }
    E.classList.toggle('on', on);
  }
  // ---------- the keyboard's way through the scrolls: [ and ] (bookcase by bookcase, top row first), Enter opens ----------
  kbList() { const si = new Map(this.lib.shelves.map((s, i) => [s.id, i])); return this.lib.books.filter(b => this.scrollObjs.get(b.id) && si.has(b.shelf)).sort((a, b) => (si.get(a.shelf) - si.get(b.shelf)) || ((b.tier || 0) - (a.tier || 0)) || ((a.slot || 0) - (b.slot || 0))); }
  kbStep(d) {
    const L = this.kbList(); if (!L.length) return; let i = L.findIndex(b => b.id === this.kbFocus); i = i < 0 ? (d > 0 ? 0 : L.length - 1) : (i + d + L.length) % L.length;
    const b = L[i], o = this.scrollObjs.get(b.id), so = o.parent; this.kbFocus = b.id; this.closeMenu(); this.tip.hidden = true;
    this.highlight(o);   // the selection outline (renderer.js, prewarmed) is the focus ring
    so.updateMatrixWorld(true); this.frameAt(o.getWorldPosition(V3()), V3(0, 0, 1).transformDirection(so.matrixWorld).setY(0).normalize());
    announce(`Scroll ${i + 1} of ${L.length}: ${mathText(b.title)}, on ${this.caseName(b.shelf)}. Enter opens it.`); this.sfx('tick', { gain: .15 });
  }
  kbClear() { this.kbFocus = null; this.highlight(this.build && this.selShelf ? this.shelfObjs.get(this.selShelf) : null); }
  // ---------- frame ----------
  // ---------- the hall's reflections and contact occlusion (surfaces.js) ----------
  // A probe at eye height in the middle of the hall, windows at their HDR radiance; the furniture and bookcase
  // footprints darken the floor beneath them. Materials built elsewhere get their companion normal/roughness maps.
  captureProbe() {
    this.probeDirty = false; const R = this.lib.hub, sh = this.shell; if (!sh) return;
    const info = sh.userData.baroque || {}, L = sh.userData.lights;
    enrich(this.scene);
    const feet = footprints([...(this.furn ? this.furn.children : []), ...this.shelfObjs.values()]).concat((info.obstacles || []).map(q => new THREE.Vector4(q.x, q.z, q.r * .75, q.r * .75)));
    bindRoom(this.scene, this.probe, { w: R.w, d: R.d, floor: 0, cornice: info.ys || R.h * .83, ceiling: R.h, caseDepth: info.caseDepth || 0, aisle: [0, 1.3], feet: feet.slice(0, 24) });
    this.probe.begin(this.scene, { pos: V3(0, 1.75, R.d * .08), box: new THREE.Box3(V3(-R.w / 2, 0, -R.d / 2), V3(R.w / 2, R.h, R.d / 2)), hide: [this.ghost], fakeGI: L ? L.children.filter(x => x.userData.fakeGI) : [], giScale: .12 });
    this.shadowsDirty = true;
  }
  // frame budget (main.js loop): the hall at rest, untouched for 5 s, is drawn at 30 frames a second
  renderFps(idleMs) { return this.opening || this.camTween || this.dragging || this.sdrag || this._arriving || idleMs < 5000 ? 60 : 30; }
  update(dt) {
    if (this.map) this.map.update(dt);
    if ((this.probeDirty || this.probe.stale()) && !this.dragging && !this.opening && !this.sdrag && !this.probe.busy) this.captureProbe();
    this.probe.step();
    this.ao.update();
    // the hall is static: its 2048² sun shadow map is redrawn only while something moves (opening, dragging, arriving)
    const sm = this.gfx.renderer.shadowMap; sm.autoUpdate = false;
    if (this.shadowsDirty !== false || this.opening || this.dragging || this._arriving) { sm.needsUpdate = true; this.shadowsDirty = false; }
    if (this.opening) { this.stepOpening(dt); return; }
    if (this.camTween) this.stepCamTween(dt);
    this._senseT = (this._senseT || 0) - dt; if (this._senseT <= 0) { this._senseT = .4; this.sense(); }
    this.glowScrolls(dt); this.placeCue();
    if (this.ghost && this.ghost.visible) { this._gT = (this._gT || 0) + dt; this.ghost.userData.mat.opacity = .24 + .1 * Math.sin(this._gT * 4); }
    // walking (overview or first person) — see js/nav.js
    this.nav.update(dt, !!this.dragging || !!this.sdrag || !!this.camTween || !!this.app.cine);   /* the app's camera moves own the camera too */
    if (this.glowDirty || this.dragging) this.syncGlow();
    this._arriving = false;
    this.scrollObjs.forEach(o => { if (o.userData.arrive != null) { this._arriving = true; o.userData.arrive = Math.min(1, o.userData.arrive + dt * 1.4); o.scale.setScalar(easeOut(o.userData.arrive) || .01); if (o.userData.arrive >= 1) delete o.userData.arrive; } });
  }
  dispose() {
    if (this.map) { this.map.dispose(); this.map = null; }
    if (this.disposed) return; this.disposed = true; document.body.classList.remove('cine'); if (this.more) this.more.dispose(); clearTimeout(this._hintT);
    removeEventListener('keydown', this.onKeyD); removeEventListener('keyup', this.onKeyU);
    this.gfx.canvas.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.gfx.canvas.removeEventListener('contextmenu', this.onCtx, true); removeEventListener('pointerdown', this.onDocDown, true); clearTimeout(this._lpT);
    this.closeMenu(); this.closeMove(); this.dropGhost(); if (this.ghost) { disposeTree(this.ghost); this.ghost = null; }   // off the scene graph after dropGhost: the scene's disposal never sees it
    this.nav.dispose(); this.controls.dispose(); this.highlight(null); this.ui.remove(); this.gfx.canvas.style.cursor = ''; this.gfx.renderer.shadowMap.autoUpdate = true;
    this.ao.dispose(); const pr = this.probe; this.app.retire ? this.app.retire(() => pr.dispose()) : pr.dispose();
  }
}
