// A book's own room. Its parts hang as scrolls along the walls, starting at the left wall and running round
// (left → back → right → front). Before each scroll a pedestal carries a small card model of that part's diorama;
// a part with several 3D demos gets one wide plinth with a bay per demo, in chain order, each bay bordered by brass
// inlay and labelled with its number and title; clicking a model (or its bay) unfolds it and carries you inside.
// The room grows when more scrolls need hanging.
import { MapView } from '../mapview.js';
import { lookQ, flyPose, flightDur, easeSine } from '../camfly.js';
import { iconFor, dioramaIcon, rememberIcon } from '../icons.js';
import { openSymbolPicker } from '../symbols.js';
const plain = t => String(t).replace(/\$([^$]*)\$/g, '$1').replace(/\\[a-zA-Z]+\{?|[{}_^]/g, '');   // a title with maths, readable as plain text
import { CEILINGS, ceilingTheme } from '../gfx/ceilings.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Navigator } from '../nav.js';
import { makeRoomShell, doorPick, doorHit } from '../gfx/roomshell.js';
import { makeMaterial } from '../gfx/materials.js';
import { canvasTex, parchment, radialGlow, labelTex } from '../gfx/textures.js';
import { bmat } from '../gfx/baroque.js';
import { RoomProbe, RoomAO, bindRoom, footprints, enrich } from '../gfx/surfaces.js';
import { PAPER } from '../gfx/materialize.js';
import { DioramaScene } from '../dio/scene.js';
import { Reader, is3D, needsAuthoring } from './reader.js';
import { bookBusy } from '../ai/pipeline.js';
import { el, clamp, uid, toast, easeInOutQuint, easeOut, esc, confirmBox, disposeTree, measureMath, canvasMath, mathText, mathHTML } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// The part of a diorama's world a pedestal should show. The diorama's actors (the bodies it names and points at)
// mark the focus; every mesh whose centre lies within the actors' box (grown by 30 %) and that is no larger than
// 2.2 × that box belongs to the model; the rest (a 250 m ground plane, hills 40–90 m out, a ring of trees: the
// landscape round the cannon of "Projectiles & Orbits") is hidden, so the apparatus fills the card instead of a
// landscape of millimetre props. Without actors: the meshes within 1.6 × the 80th-percentile distance of all mesh
// centres from their median centre. Returns { box, c, rXZ (horizontal half-diagonal), h, hide } in the world's frame.
function fitBox(world, ds) {
  world.updateMatrixWorld(true); const inv = world.matrixWorld.clone().invert(), items = [], sizeOf = b => Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y);
  world.traverse(o => { if (!o.isMesh || !o.visible || o.userData.isInk || !o.geometry) return; const b = new THREE.Box3().setFromObject(o).applyMatrix4(inv); if (b.isEmpty() || !isFinite(b.min.x) || sizeOf(b) < 1e-4) return; items.push({ o, b, c: b.getCenter(V3()), size: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) }); });
  const box = new THREE.Box3(), keep = new Set();
  // the focus: the actors' boxes (or points), leaving out any actor box 8 × larger than the median actor (a ground)
  const ab = []; (ds && ds.actors || []).forEach(a => { try { if (a.obj && a.obj.isObject3D) { const b = new THREE.Box3().setFromObject(a.obj).applyMatrix4(inv); if (!b.isEmpty() && isFinite(b.min.x)) ab.push(b); } else { const q = a.getPos && a.getPos(); if (q && isFinite(q.x)) ab.push(new THREE.Box3(q.clone().applyMatrix4(inv), q.clone().applyMatrix4(inv))); } } catch (e) { } });
  const focus = new THREE.Box3();
  if (ab.length) { const ms = ab.map(sizeOf).sort((x, y) => x - y)[ab.length >> 1]; ab.forEach(b => { if (sizeOf(b) <= 8 * Math.max(ms, .05)) focus.union(b); }); }
  if (!focus.isEmpty()) {
    const fs = focus.getSize(V3()), fc = focus.getCenter(V3()), ext = Math.max(fs.x, fs.z, .3);
    items.forEach(it => { if (Math.abs(it.c.x - fc.x) <= fs.x / 2 + .3 * ext && Math.abs(it.c.z - fc.z) <= fs.z / 2 + .3 * ext && it.size <= 2.2 * ext) keep.add(it.o); });
  } else if (items.length) {
    const med = k => { const v = items.map(it => it.c[k]).sort((x, y) => x - y); return v[v.length >> 1]; }, m = V3(med('x'), med('y'), med('z'));
    items.forEach(it => { it.d = Math.hypot(it.c.x - m.x, it.c.z - m.z); });
    const ds2 = items.map(it => it.d).sort((x, y) => x - y), szm = items.map(it => it.size).sort((x, y) => x - y)[items.length >> 1], R = Math.max(.05, szm * .5, ds2[Math.min(ds2.length - 1, Math.floor(ds2.length * .8))]);
    items.forEach(it => { if (it.d <= 1.6 * R + .05 && it.size <= 4 * Math.max(R, szm, .25)) keep.add(it.o); });
  }
  if (!keep.size) items.forEach(it => keep.add(it.o));
  items.forEach(it => { if (keep.has(it.o)) box.union(it.b); });
  if (box.isEmpty()) box.set(V3(-1, 0, -1), V3(1, 1, 1));
  // hide what is left out (never a mesh with a kept mesh below it)
  const hide = items.filter(it => !keep.has(it.o)).map(it => it.o).filter(o => { let k = false; o.traverse(q => { if (q !== o && keep.has(q)) k = true; }); return !k; });
  const c = box.getCenter(V3()), rXZ = Math.max(.01, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2), h = Math.max(.01, box.max.y - box.min.y);
  return { box, c, rXZ, h, n: keep.size, hide: hide.filter(o => !hide.includes(o.parent)) };
}
// Chronophotograph for a mini (after Marey's stroboscopic photographs), only where motion is the point: a frozen frame
// of a pendulum or a bouncing ball says little. The demo is run for up to ~3.5 s of model time (CPU budget ~180 ms per
// mini) while its small parts are sampled; at most the two parts that really travel (more than 10 % of the model's
// size) get a trail of at most four translucent poses, evenly spaced along the last sweep that ends where the real
// part now stands (walking back from the end until the path turns back), oldest faintest. Each pose is a copy of the
// part in its own colour (one material per pose index). Returns the ghost meshes, in the world's frame.
const GHOST_MAX = 4, GHOST_PARTS = 2, STROBE_T = 3.5, STROBE_DT = 1 / 30;
function strobe(ds) {
  const w = ds.world; w.updateMatrixWorld(true);
  const inv = w.matrixWorld.clone().invert(), all = new THREE.Box3(), cands = [];
  w.traverse(o => { if (!o.isMesh || o.isInstancedMesh || o.userData.isInk || !o.geometry || !o.visible) return; const b = new THREE.Box3().setFromObject(o).applyMatrix4(inv); if (b.isEmpty() || !isFinite(b.min.x)) return; all.union(b); cands.push({ o, b }); });
  if (!cands.length || !ds.playing) return [];
  const ext = Math.max(.1, ...all.getSize(V3()).toArray().filter(isFinite)), small = cands.filter(c => { const s = c.b.getSize(V3()); return Math.max(s.x, s.y, s.z) <= ext * .22; }).slice(0, 60);
  if (!small.length) return [];
  const rel = o => inv.clone().multiply(o.matrixWorld), track = small.map(c => ({ o: c.o, m: [rel(c.o)] })), t0 = performance.now();
  const n = Math.round(STROBE_T / STROBE_DT);
  for (let i = 1; i <= n && performance.now() - t0 < 180; i++) {
    try { ds.step(STROBE_DT); } catch (e) { break; }
    if (i % 2 === 0) { w.updateMatrixWorld(true); track.forEach(t => t.m.push(rel(t.o))); }
  }
  w.updateMatrixWorld(true);
  const pos = m => V3().setFromMatrixPosition(m);
  const moving = track.filter(t => { if (!t.o.visible || t.m.length < 4) return false; const p0 = pos(t.m[0]); t.d = Math.max(...t.m.map(m => pos(m).distanceTo(p0))); return t.d > ext * .1; })
    .sort((a, b) => b.d - a.d).slice(0, GHOST_PARTS);
  if (!moving.length) return [];
  const out = [];
  moving.forEach(t => {
    // the last sweep: back from the end while the distance from the final pose keeps growing
    const P = t.m.map(pos), end = P[P.length - 1]; let i0 = P.length - 1, best = 0;
    for (let i = P.length - 2; i >= 0; i--) { const d = P[i].distanceTo(end); if (d >= best) { best = d; i0 = i; } else if (d < best * .9) break; }
    if (best < ext * .08) return;
    const seg = P.slice(i0), cum = [0]; for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + seg[i].distanceTo(seg[i - 1]));
    const L = cum[cum.length - 1], col = (t.o.material && t.o.material.color) ? t.o.material.color : PAPER, k = GHOST_MAX;
    const mats = [...Array(k)].map((_, j) => new THREE.MeshStandardMaterial({ color: col.clone(), roughness: .7, transparent: true, opacity: .14 + .32 * (j + 1) / k, depthWrite: false }));
    for (let j = 0; j < k; j++) {
      const target = L * j / k; let q = 0; while (q < cum.length - 1 && cum[q] < target) q++;   // poses at 0, ¼, ½, ¾ of the sweep (the real part is at its end)
      const gm = new THREE.Mesh(t.o.geometry, mats[j]);
      gm.matrixAutoUpdate = false; gm.matrix.copy(t.m[i0 + q]); gm.userData.ghost = true; gm.userData.noInk = true; gm.raycast = () => { }; gm.renderOrder = 1; out.push(gm);
    }
  });
  return out;
}
// The engraved brass label of a bay: "n · title" as large as fits on one line (44 → 34 px on a 640 px plate), else on
// two balanced lines (40 → 32 px), else two lines with the end abbreviated (the full title is in the bay's tooltip).
function plateTex(text, aspect) {
  const W = 640, H = Math.round(W / aspect);
  return canvasTex(null, W, H, g => {
    g.fillStyle = '#cfa95a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#7d5a22'; g.lineWidth = 4; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#2a1a0a'; g.textAlign = 'center'; g.textBaseline = 'middle'; const F = fs => `600 ${fs}px "IM Fell English SC", Georgia, serif`, maxW = W - 36;
    for (let fs = 44; fs >= 34; fs -= 2) { g.font = F(fs); if (measureMath(g, text) <= maxW) { canvasMath(g, text, W / 2, H / 2 + 2); return; } }
    const words = text.split(/\s+/);
    for (let fs = 40; fs >= 32; fs -= 2) {
      g.font = F(fs); let best = null;
      for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(measureMath(g, a), measureMath(g, b)); if (m <= maxW && (!best || m < best.m)) best = { a, b, m }; }
      if (best && fs * 2.1 <= H - 10) { const lh = fs * 1.05; canvasMath(g, best.a, W / 2, H / 2 - lh / 2 + 2); canvasMath(g, best.b, W / 2, H / 2 + lh / 2 + 2); return; }
    }
    g.font = F(32); const lh = 33.6; let a = '', i = 0; for (; i < words.length; i++) { const t = a ? a + ' ' + words[i] : words[i]; if (measureMath(g, t) > maxW && a) break; a = t; }
    let b = words.slice(i).join(' '); while (b.length > 1 && measureMath(g, b + '…') > maxW) b = b.slice(0, -1).trimEnd();
    canvasMath(g, a, W / 2, H / 2 - lh / 2 + 2); canvasMath(g, b + (i < words.length && b !== words.slice(i).join(' ') ? '…' : ''), W / 2, H / 2 + lh / 2 + 2);
  }, { aniso: 8 });
}
// the visible extent of a mini (meshes and lines; hidden parts and their children left out), in `frame`'s coordinates
function visibleBox(root, frame) {
  root.updateWorldMatrix(true, true); const inv = frame.matrixWorld.clone().invert(), box = new THREE.Box3(), b = new THREE.Box3();
  const walk = o => { if (!o.visible) return; if ((o.isMesh || o.isLine || o.isSprite) && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv); if (isFinite(b.min.x)) box.union(b); } o.children.forEach(walk); };
  walk(root); return box;
}
// The emblem a bay shows when its diorama cannot be built: a sealed scroll and a small title card on an easel.
function miniEmblem(title) {
  const g = new THREE.Group(); g.name = 'emblem';
  const scroll = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .26, 20), new THREE.MeshStandardMaterial({ map: parchment('pedscroll', 128, 128), roughness: .8 }));
  scroll.rotation.z = Math.PI / 2; scroll.position.set(0, .035, .05); scroll.castShadow = true; g.add(scroll);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .008, 18), new THREE.MeshStandardMaterial({ color: 0x9c3a28, roughness: .45 })); seal.rotation.x = Math.PI / 2; seal.position.set(0, .035, .089); g.add(seal);
  const tex = labelTex(String(title).slice(0, 40), { w: 512, h: 256, bg: '#f3f0e8', fg: '#2a1e15', border: '#8f733a', font: '600 54px "IM Fell English SC", Georgia, serif' });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(.22, .11), new THREE.MeshStandardMaterial({ map: tex, roughness: .9, side: THREE.DoubleSide }));
  card.position.set(0, .085, -.04); card.rotation.x = -.25; card.castShadow = true; g.add(card);
  return g;
}
// a pedestal's walk-collision box: its plinth only (the turning models must not move the box)
const st0 = o => { o.updateMatrixWorld(true); const b = new THREE.Box3(); o.children.forEach(c => { if (c.userData.solid) b.expandByObject(c); }); return b.isEmpty() ? new THREE.Box3().setFromObject(o) : b; };
const SPACING = 2.9;
// Floor-plan margins (metres): a plinth stands WALL_GAP clear of every wall (0.9 m walkway, and 0.6 m clear of the
// 0.42 m wall bookcases); FURN_GAP clear of other plinths, the door and stairs (a full walkway: at 0.6 m the plinths
// read as one crowded counter); scrolls at least STATION_MIN apart
// (niche + pilaster) and CORNER_MIN from a corner; the door zone covers the double door, its frame and columns.
const CASE_D = .42, WALL_GAP = Math.max(1, CASE_D + .6), FURN_GAP = 1.05, STATION_MIN = SPACING, CORNER_MIN = 1.2, DOOR_HALF = 2, DOOR_DEPTH = 1;
// A pedestal's size from its number of demos: one (or none) is the round marble pedestal; several make a long plinth
// with up to 4 bays a row. W × Dp is the marble body; Wf × Df the footprint with the top slab's lip.
function plinthDims(n) {
  if (n <= 1) return { single: true, Wf: .76, Df: .76 };
  const cols = n <= 4 ? n : Math.ceil(n / Math.ceil(n / 4)), rows = Math.ceil(n / cols), B = clamp(2.38 / cols, .5, .72), W = cols * B + .12, Dp = rows * B + .12;
  return { single: false, cols, rows, B, W, Dp, Wf: W + .07, Df: Dp + .07 };
}
// Station heights: every hanging scroll's lower rod sits at SHEET_BOTTOM, above the pedestal and its turning model
// (PED_TOP + up to ~.4 m), so from the opening view (eye ~1.9 m, ~4.5 m back) the model never hides the sheet.
const SHEET_BOTTOM = 1.3, PED_TOP = .965, SPOTS = 8;
// mini models: fitted to ~80 % of the pedestal's card (or of a bay's model area), at most MINI_H tall
const MINI_FIT = .86, MINI_H = .4;

export class BookRoom {
  constructor(app, book, data, opts = {}) {
    this.app = app; this.gfx = app.gfx; this.book = book; this.data = data; this.opts = opts;
    this.data.dims = this.data.dims || { w: 12, d: 10, h: 5.5 }; if (this.data.dims.h === 4.4) this.data.dims.h = 5.5; this.data.parts = this.data.parts || [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0907); this.scene.environment = this.gfx.envStudio; this.scene.environmentIntensity = .2; this.scene.userData.look = Object.assign(this.gfx.constructor.HOUSE, { exposure: 1.3, warm: .006 }); // no window here: a touch more exposure than the hall (1.65 before the room's own probe lit it)
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 120);
    // the room's own reflections (surfaces.js): captured after every rebuild; GTAO at quality 'high'
    this.probe = new RoomProbe(this.gfx); this.probeDirty = true; this.ao = new RoomAO(this.gfx, this.scene, this.camera);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: .4, maxDistance: 12, maxPolarAngle: Math.PI * .56, rotateSpeed: .6 });
    this.stations = new Map(); this.keys = {};
    this.ui = el('div', { class: 'room-ui' }); app.ui.append(this.ui); this.buildUI();
    this.layout(); this.buildShell(); this.buildStations();
    this.frameStart();
    this.gfx.setView(this.scene, this.camera);
    // the map of the room: the chapter scrolls in reading order, the dioramas on their pedestals (mapview.js)
    this.map = new MapView(this.ui, { camera: this.camera, provider: () => this.mapPlan(), onIcon: it => this.chooseSymbol(it.id), onSymbols: () => this.chooseSymbol(null), onPick: it => { const st = this.stations.get(it.id); if (!st) return; const n = st.slot.n, c = st.sheet.getWorldPosition(V3()); const to = c.clone().addScaledVector(n, 2.6).setY(1.62), look = c.clone().setY(1.3); this.flyTo(to, look, flightDur(this.camera.position, this.camera.quaternion, to, lookQ(to, look))); if (this.anim) this.anim.ease = easeSine; } });
    this.nav = new Navigator({ camera: this.camera, controls: this.controls, canvas: this.gfx.canvas, keys: this.keys, host: this.ui,
      bounds: () => { const D = this.data.dims, c = (this.shell && this.shell.userData.baroque && this.shell.userData.baroque.caseDepth) || 0; return { minX: -D.w / 2 + c, maxX: D.w / 2 - c, minZ: -D.d / 2 + c, maxZ: D.d / 2 - c, h: D.h }; },
      obstacles: () => [...this.stations.values()].map(st => st.ped).filter(Boolean).map(o => st0(o)).concat([...(((this.shell && this.shell.userData.baroque && this.shell.userData.baroque.obstacles) || []).map(q => new THREE.Box3(new THREE.Vector3(q.x - q.r, 0, q.z - q.r), new THREE.Vector3(q.x + q.r, 1.8, q.z + q.r))))]) });
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.onDown = e => { this.down = { x: e.clientX, y: e.clientY }; }; this.onUp = e => this.pointerUp(e); this.onMove = e => this.pointerMove(e);
    this.onKeyD = e => { if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return; this.keys[e.key.toLowerCase()] = true; if ((e.key === 'v' || e.key === 'V') && !this.reader) this.nav.toggle(); }; this.onKeyU = e => { this.keys[e.key.toLowerCase()] = false; };
    this.gfx.canvas.addEventListener('pointerdown', this.onDown); this.gfx.canvas.addEventListener('pointerup', this.onUp); this.gfx.canvas.addEventListener('pointermove', this.onMove);
    addEventListener('keydown', this.onKeyD); addEventListener('keyup', this.onKeyU);
    if (!this.data.parts.length) this.ingest();
    if (opts.openPart) { const p = this.data.parts.find(x => x.id === opts.openPart); if (p) setTimeout(() => { if (!this.disposed) this.openPart(p, true); }, 200); }
  }
  save() { this.app.saveRoom(this.book.id, this.data); }
  // a symbol for a scroll on the room's map (js/symbols.js): from the wide map's "Select symbol" or a scroll's own icon
  chooseSymbol(id) {
    const items = this.mapPlan().items; if (!items.length) { toast('This room has no scrolls yet.'); return; }
    openSymbolPicker({ title: 'Select a symbol', kind: 'scroll', current: id, targets: items.map(it => ({ id: it.id, label: it.label, sub: it.sub, icon: (this.data.parts.find(p => p.id === it.id) || {}).icon || '', auto: it.auto })), onSet: (t, name, d) => {
      const p = this.data.parts.find(x => x.id === t.id); if (!p) return;
      if (name) p.icon = name; else delete p.icon; if (d) p.iconD = d; else delete p.iconD;
      this.save(); if (this.map) { this.map.sig = ''; this.map.update(1); } } });
  }
  mapPlan() {
    const D = this.data.dims, items = [];
    this.orderedParts().forEach((p, i) => { if (p.icon && p.iconD) rememberIcon(p.icon, '', p.iconD); const st = this.stations.get(p.id); if (!st) return; const c = st.group.getWorldPosition(V3()), n = st.slot.n;
      items.push({ id: p.id, kind: 'station', n: i + 1, x: +(c.x + n.x * .5).toFixed(2), z: +(c.z + n.z * .5).toFixed(2), w: p.subOf ? .9 : 1.15, d: .5, rot: +Math.atan2(n.x, n.z).toFixed(3), label: p.title || 'Scroll', icon: p.icon || iconFor(p.title, 'scroll'), auto: iconFor(p.title, 'scroll'), sub: p.analysis ? ((p.analysis.chain || []).length + ' steps') : 'not analysed yet',
        dios: st.bays.filter(b => b.spec).map(b => { const q = b.group.getWorldPosition(V3()); return { name: plain(b.spec.d.title || b.spec.st.title || b.spec.d.type || 'Diorama'), icon: dioramaIcon({ ...b.spec.d, sceneTitle: b.spec.st && b.spec.st.title }), x: +q.x.toFixed(2), z: +q.z.toFixed(2) }; }) }); });
    return { title: 'The room of “' + this.book.title + '”', kind: 'room', w: D.w, d: D.d, door: this.doorPick ? { x: 0, z: D.d / 2 } : null, items };
  }
  // free removed objects once the rebuilt room has drawn, keeping what is still on screen (shared materials, cached textures)
  trash(objs) { this.app.retire(() => disposeTree(objs, this.disposed ? null : this.scene)); }
  // GPU resources (main.js calls this after the next place has rendered): the room, plus each pedestal model's own
  // off-screen environment (its world was moved onto the pedestal; lights, floor and sky stayed in ds.scene)
  disposeGPU() { const keep = this.app.mode && this.app.mode !== this ? this.app.mode.scene : null; const roots = [this.scene]; this.stations.forEach(s => s.bays.forEach(b => { if (b.ds) roots.push(b.ds.scene); })); disposeTree(roots, keep); }
  // Opening view: the first scrolls (up to three) with their pedestals are the hero. The camera stands back from them
  // and off to the side of their wall that has more room, looking back across at ~46°: the hero sits left or right of
  // centre, its wall (with the next scrolls) recedes beside it, and the near corner's wall is distant background behind
  // the hero instead of a close slab of bookcases filling a third of the frame.
  frameStart() {
    const D = this.data.dims, first = (this.placed || []).slice(0, 3);
    if (!first.length) { this.camera.position.set(0, 1.65, D.d / 2 - 1.2); this.controls.target.set(0, 1.5, -D.d / 2); this.controls.update(); return; }
    // eye a little above standing height, looking slightly down: the line of sight over each pedestal's model meets the
    // wall below the scroll's lower rod (SHEET_BOTTOM), so banners show whole with their pedestals in front
    const t = V3(), n = V3(); first.forEach(({ slot }) => { t.add(slot.p.clone().addScaledVector(slot.n, .55)); n.add(slot.n); }); t.divideScalar(first.length).setY(1.62); n.normalize();
    const tg = V3(n.z, 0, -n.x), m = 1.1, reach = d => { let r = Infinity; if (d.x > 1e-3) r = Math.min(r, (D.w / 2 - m - t.x) / d.x); if (d.x < -1e-3) r = Math.min(r, (-D.w / 2 + m - t.x) / d.x); if (d.z > 1e-3) r = Math.min(r, (D.d / 2 - m - t.z) / d.z); if (d.z < -1e-3) r = Math.min(r, (-D.d / 2 + m - t.z) / d.z); return r; };
    const sg = reach(tg) >= reach(tg.clone().negate()) ? 1 : -1, back = clamp(Math.min(D.w, D.d) * .5, 3.2, 5.2), a = .8;
    const p = t.clone().addScaledVector(n, back * Math.cos(a)).addScaledVector(tg, sg * back * Math.sin(a)).setY(1.95);
    p.x = clamp(p.x, -D.w / 2 + m, D.w / 2 - m); p.z = clamp(p.z, -D.d / 2 + m, D.d / 2 - m);
    this.camera.position.copy(p); this.controls.target.copy(t.clone().addScaledVector(tg, sg * back * .26)); this.controls.update();
  }
  placeSpots(force) {
    if (!this.spots || !this.spots.length) return; const now = performance.now(); if (!force && now - this._spotT < 250) return; this._spotT = now;
    const c = this.camera.position, list = [...this.stations.values()].map(st => ({ st, d: st.group.position.distanceToSquared(c) })).sort((a, b) => a.d - b.d);
    this.spots.forEach((L, i) => { const it = list[i]; if (!it) { L.visible = false; return; } L.visible = true; if (L.target !== it.st.sheet) { L.target = it.st.sheet; it.st.group.updateMatrixWorld(); L.position.copy(it.st.spotAt).applyMatrix4(it.st.group.matrixWorld); } });
  }
  partIndex(p) { return this.data.parts.filter(x => !x.subOf).indexOf(p); }
  // ---------- ingestion: split the PDF into parts (outline → headings → contents page → windows) ----------
  async ingest() {
    if (!this.book.hasPdf) { this.status('This book has no PDF attached. Import a room JSON or add parts with AI.'); return; }
    const blob = await this.app.store.get('pdf:' + this.book.id); if (blob && this.app.ingest.keyPDF) this.app.ingest.keyPDF(blob, this.book.id); if (!blob) { this.status('The PDF for this book is not stored in this browser.'); return; }
    this.status('Finding the chapters…');
    try {
      const r = await this.app.ingest.splitBook(blob, { onProgress: k => this.status('Finding the chapters… ' + Math.round(k * 100) + '%') });
      this.book.pages = r.pages;
      // the PDF's own Title metadata (cleaned by splitBook) replaces the file-name title the hub gave the book
      const ft = this.app.ingest.fileTitle ? this.app.ingest.fileTitle(blob) : '';
      if (r.title && r.title !== this.book.title && (!ft || this.book.title === ft)) { this.book.title = r.title; const bt = this.ui.querySelector('.brand-title'); if (bt) bt.textContent = r.title; }
      this.app.saveLib();
      this.data.parts = r.parts.map(p => ({ id: 'p-' + uid(), ...p })); this.data.splitMethod = r.method; this.save();
      this.status(`${r.parts.length} parts found (${{ outline: 'from the PDF bookmarks', headings: 'from the headings', contents: 'from the contents page', windows: 'in fixed page windows' }[r.method]}).`, 4000);
      this.layout(); this.buildShell(); this.buildStations(); if (!this.reader && !this.anim && this.nav && this.nav.mode !== 'walk') this.frameStart();
    } catch (e) { this.status('Could not read the PDF: ' + e.message); }
  }
  status(msg, ms) { this.statusEl.textContent = msg; this.statusEl.hidden = !msg; clearTimeout(this._st); if (ms) this._st = setTimeout(() => { this.statusEl.hidden = true; }, ms); }
  // ---------- layout along the walls, starting at the left wall ----------
  orderedParts() { const out = []; this.data.parts.filter(p => !p.subOf).forEach(p => { out.push(p); this.data.parts.filter(s => s.subOf === p.id).forEach(s => out.push(s)); }); this.data.parts.filter(s => s.subOf && !this.data.parts.some(p => p.id === s.subOf)).forEach(s => out.push(s)); return out; }
  // Stations go round the walls in order (left wall from the front, back, right, front either side of the door). Each
  // station's floor footprint is its plinth (bays, label plates and the top slab's lip: plinthDims) standing WALL_GAP
  // out from its wall; a station is placed at the first spot along its wall where that footprint stays WALL_GAP from
  // every wall, FURN_GAP from every other station's footprint, the door and the hall's stairs, and STATION_MIN from the
  // previous scroll (niche + pilaster). Whatever does not fit makes the room grow (a fresh layout), except while the
  // size sliders move (preview): then the stations that do not fit are hidden until the room is big enough.
  layout(preview = false) {
    const D = this.data.dims, parts = this.orderedParts(), fps = parts.map(p => plinthDims(this.pedestalSpecs(p).length));
    let r = this.fitStations(D, fps), grew = false;
    while (!preview && r.slots.length < parts.length && D.w < 80) { D.w = +(D.w + SPACING).toFixed(2); D.d = +(D.d + SPACING * .6).toFixed(2); grew = true; r = this.fitStations(D, fps); }
    if (grew) { this.save(); toast('The room grew to fit every scroll'); }
    this.slots = r.slots; this.footprints = r.rects; this.placed = parts.map((p, i) => ({ part: p, slot: r.slots[i] })).filter(x => x.slot);
  }
  fitStations(D, fps) {
    const walls = [
      { wall: 'left', o: V3(-D.w / 2, 0, D.d / 2), u: V3(0, 0, -1), n: V3(1, 0, 0), L: D.d },
      { wall: 'back', o: V3(-D.w / 2, 0, -D.d / 2), u: V3(1, 0, 0), n: V3(0, 0, 1), L: D.w },
      { wall: 'right', o: V3(D.w / 2, 0, -D.d / 2), u: V3(0, 0, 1), n: V3(-1, 0, 0), L: D.d },
      { wall: 'front', o: V3(D.w / 2, 0, D.d / 2), u: V3(-1, 0, 0), n: V3(0, 0, -1), L: D.w }];
    // fixed furniture: the double door with its columns (front wall), and the hall's corner stairs when the shell has them
    const fixed = [{ x0: -DOOR_HALF, x1: DOOR_HALF, z0: D.d / 2 - DOOR_DEPTH, z1: D.d / 2 }];
    const sh = this.shell && this.shell.userData, bq = sh && sh.baroque, sd = sh && sh.dims;
    if (bq && sd && sd.w === D.w && sd.d === D.d) (bq.obstacles || []).filter(q => q.kind === 'stair').forEach(q => fixed.push({ x0: q.x - q.r, x1: q.x + q.r, z0: q.z - q.r, z1: q.z + q.r }));
    const rectAt = (Wl, c, f) => { const p = Wl.o.clone().addScaledVector(Wl.u, c), m = p.clone().addScaledVector(Wl.n, WALL_GAP + f.Df / 2), hu = f.Wf / 2, hn = f.Df / 2, ax = Math.abs(Wl.u.x) > .5;
      return { x0: m.x - (ax ? hu : hn), x1: m.x + (ax ? hu : hn), z0: m.z - (ax ? hn : hu), z1: m.z + (ax ? hn : hu), p }; };
    const gap = (a, b, g) => a.x0 < b.x1 + g && b.x0 < a.x1 + g && a.z0 < b.z1 + g && b.z0 < a.z1 + g;   // closer than g on both axes
    const inside = q => q.x0 >= -D.w / 2 + WALL_GAP - 1e-6 && q.x1 <= D.w / 2 - WALL_GAP + 1e-6 && q.z0 >= -D.d / 2 + WALL_GAP - 1e-6 && q.z1 <= D.d / 2 - WALL_GAP + 1e-6;
    const slots = [], rects = []; let wi = 0, prev = null;
    for (const f of fps) {
      let done = false;
      while (!done && wi < walls.length) {
        const Wl = walls[wi];
        let c = Math.max(WALL_GAP + f.Wf / 2, CORNER_MIN, prev ? prev.c + Math.max(STATION_MIN, (prev.f.Wf + f.Wf) / 2 + FURN_GAP) : 0);
        for (; c + f.Wf / 2 <= Wl.L - WALL_GAP + 1e-6 && c <= Wl.L - CORNER_MIN + 1e-6; c += .1) {
          const q = rectAt(Wl, c, f); if (!inside(q)) continue;
          if (rects.some(R => gap(q, R, FURN_GAP)) || fixed.some(R => gap(q, R, FURN_GAP))) continue;
          slots.push({ wall: Wl.wall, p: q.p, n: Wl.n.clone() }); rects.push(q); prev = { c, f }; done = true; break;
        }
        if (!done) { wi++; prev = null; }
      }
      if (!done) break;
    }
    return { slots, rects };
  }
  buildShell(fast = false) {
    // Metten-like walnut-and-gilt wall bookcases; every hanging scroll gets an open, panelled niche in its bay
    // (a size the shell cannot be built at keeps the current one)
    const D = this.data.dims; let sh;
    try { sh = makeRoomShell({ w: D.w, d: D.d, h: D.h, style: 'baroque', windowWall: 'none', palette: 'teal', floor: 'cubes', ceiling: this.ceiling(), avoid: (this.slots || []).map(s => s.p), cases: 'walnut', niches: (this.placed || []).map(x => x.slot.p), fast }); }
    catch (e) { console.error(e); if (!fast) toast('Could not build the room at this size'); return false; }
    if (this.shell) { this.scene.remove(this.shell); this.trash([this.shell]); }
    this.shell = sh; sh.userData.dims = { w: D.w, d: D.d, h: D.h }; this.scene.add(sh); this.doorPick = doorPick(this.scene, sh, this.doorPick); this.doorInfo = sh.userData.baroque && sh.userData.baroque.door; if (!fast) this.probeDirty = true; return true;
    // daylight-free gallery: a few warm spots on the scrolls are added per station
  }
  // the painted domes follow the subject (js/gfx/ceilings.js): the reader's choice, else the bookcase, else the titles
  ceiling() { const sh = this.app.lib && this.app.lib.shelves.find(x => x.id === this.book.shelf); return ceilingTheme(this.data.ceiling, sh ? sh.name : '', [this.book.title, ...(this.data.parts || []).slice(0, 12).map(p => p.title)].join(' ')); }
  buildStations() {
    const old = []; this.stations.forEach(s => { s.group.removeFromParent(); old.push(s.group); s.bays.forEach(b => { if (b.ds) old.push(b.ds.scene); }); }); this.stations.clear(); if (old.length) this.trash(old);
    if (this.shell && this.shell.userData.setCases) this.shell.userData.setCases({ niches: this.placed.map(x => x.slot.p) }); // no-op when unchanged
    this.placed.forEach(({ part, slot }, i) => this.makeStation(part, slot, i));
    // one spot per scroll, up to SPOTS: a big book's room (dozens of scrolls) would otherwise shade every pixel with
    // dozens of lights; the pool follows the scrolls nearest the viewer (a spot only reaches 6 m anyway)
    const n = Math.min(SPOTS, this.stations.size); while ((this.spots || []).length > n) this.spots.pop().removeFromParent(); this.spots = this.spots || [];
    while (this.spots.length < n) { const L = new THREE.SpotLight(0xffd8a0, 26, 6, .5, .7, 2); this.scene.add(L); this.spots.push(L); }
    this._spotT = -1; this.placeSpots(true); this.probeDirty = true;
  }
  // a probe at eye height in the middle of the room (no windows here: chandeliers, sconces and the scroll spots light it);
  // pedestals and the hall's stairs darken the floor at their feet
  captureProbe() {
    this.probeDirty = false; const D = this.data.dims, sh = this.shell; if (!sh) return;
    const info = sh.userData.baroque || {}, L = sh.userData.lights;
    enrich(this.shell); this.stations.forEach(st => { if (st.ped) enrich(st.ped); });
    const feet = footprints([...this.stations.values()].map(st => st.ped).filter(Boolean)).concat((info.obstacles || []).map(q => new THREE.Vector4(q.x, q.z, q.r * .75, q.r * .75)));
    bindRoom(this.scene, this.probe, { w: D.w, d: D.d, floor: 0, cornice: info.ys || D.h * .83, ceiling: D.h, caseDepth: info.caseDepth || 0, aisle: [0, 1.2], feet: feet.slice(0, 24) });
    this.probe.begin(this.scene, { pos: V3(0, 1.7, 0), box: new THREE.Box3(V3(-D.w / 2, 0, -D.d / 2), V3(D.w / 2, D.h, D.d / 2)), fakeGI: L ? L.children.filter(x => x.userData.fakeGI) : [], giScale: .15, hide: [...this.stations.values()].flatMap(st => st.bays.map(b => b.mini)).filter(Boolean) });
  }
  makeStation(part, slot, i) {
    const g = new THREE.Group(); g.position.copy(slot.p); g.lookAt(slot.p.clone().add(slot.n)); this.scene.add(g);
    const sub = !!part.subOf, sc = sub ? .78 : 1;
    // hanging scroll: two rods and a parchment sheet with the part's title written on it
    const W = 1.15 * sc, H = 1.55 * sc, nt = (this.shell && this.shell.userData.baroque && this.shell.userData.baroque.nicheTop) || 3.22, y0 = Math.min(SHEET_BOTTOM + H, nt - .12);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: this.sheetTexture(part, i), roughness: .85, emissive: 0xffe6b0, emissiveIntensity: 0 }));
    sheet.position.set(0, y0 - H / 2, .06); sheet.castShadow = true; sheet.receiveShadow = true; g.add(sheet);
    [y0, y0 - H].forEach(y => { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, W + .16, 16), makeMaterial('darkwood')); rod.rotation.z = Math.PI / 2; rod.position.set(0, y, .08); rod.castShadow = true; g.add(rod); [-1, 1].forEach(s => { const k = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), makeMaterial('brass')); k.position.set(s * (W / 2 + .1), y, .08); g.add(k); }); });
    const cl = Math.max(.08, nt - y0), cord = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, cl, 4), makeMaterial('iron')); cord.position.set(0, y0 + cl / 2, .07); g.add(cord); // up to the niche head
    const spotAt = V3(0, y0 + 1.4, 1.4);   // where this scroll's warm spot hangs (the lights themselves are a pool, see placeSpots)
    sheet.userData = { station: part.id, kind: 'sheet' };
    const st = { part, group: g, sheet, ped: null, mini: null, bays: [], slot, spec: null, spotAt };
    this.stations.set(part.id, st); this.buildPedestal(st);
    return st;
  }
  // every 3D demo of a part, in chain order (step by step, demo by demo)
  pedestalSpecs(part) {
    const A = part.analysis, out = []; if (!A) return out;
    (A.chain || []).forEach(s => (s.demos || []).forEach((d, k) => { if (is3D(d) && !needsAuthoring(d)) out.push({ d, st: s, k }); }));
    return out;
  }
  pedestalSpec(part) {
    const all = this.pedestalSpecs(part); if (!all.length) return null;
    if (part.pedestal) { const f = all.find(x => x.st.id === part.pedestal.step && x.k === part.pedestal.demo); if (f) return f; }
    return all[0];
  }
  // The pedestal before a scroll, rebuilt when the part's demos change. One demo (or none): a round marble pedestal
  // with a paper card. Several: a long plinth with one bay per demo in chain order (up to 4 a row; further rows stand
  // forward into the room), each bay a paper card bordered by brass inlay with an engraved brass label "n · title";
  // each bay is its own pick target (userData.bay). Mini models fit ~80 % of their card (fitMini).
  buildPedestal(st) {
    const gone = []; if (st.ped) { st.ped.removeFromParent(); gone.push(st.ped); } st.bays.forEach(b => { if (b.ds) gone.push(b.ds.scene); }); if (gone.length) this.trash(gone);
    const specs = this.pedestalSpecs(st.part), single = specs.length <= 1, ped = new THREE.Group(); st.group.add(ped);
    ped.userData = { station: st.part.id, kind: 'pedestal' }; st.ped = ped; st.bays = [];
    const marble = makeMaterial('marble'), solid = o => { o.userData.solid = true; o.castShadow = true; o.receiveShadow = true; ped.add(o); return o; };
    const P = plinthDims(specs.length);   // the same footprint the floor plan reserved (layout → fitStations)
    if (single) {
      ped.position.set(0, 0, WALL_GAP + P.Df / 2);
      const col = solid(new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, PED_TOP - .065, 32), marble)); col.position.y = (PED_TOP - .065) / 2;
      const capM = solid(new THREE.Mesh(new THREE.CylinderGeometry(.38, .34, .06, 32), marble)); capM.position.y = PED_TOP - .035; capM.castShadow = false;
      const bay = this.makeBay(st, ped, 0, specs[0] || null, { x: 0, z: 0, card: .36, round: true });
      st.spec = bay.spec; st.mini = bay.mini; return;
    }
    const { cols, rows, B, W, Dp } = P;
    ped.position.set(0, 0, WALL_GAP + P.Df / 2);   // the slab's back lip WALL_GAP from the wall
    const gilt = bmat('gilt'), wn = bmat('walnut-dark'), body = new THREE.Group();
    const box = (mat, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); return solid(o); };
    // plinth, body and top slab overlap a few mm (no two faces share a plane); the gilt fillets' tops and bottoms lie inside the body
    box(wn, W + .06, .1, Dp + .06, 0, .05, 0); box(gilt, W + .03, .016, Dp + .03, 0, .114, 0).castShadow = false;
    const yb0 = .104, yb1 = PED_TOP - .045; box(marble, W, yb1 - yb0, Dp, 0, (yb0 + yb1) / 2, 0);
    box(gilt, W + .03, .016, Dp + .03, 0, PED_TOP - .064, 0).castShadow = false;
    box(marble, W + .07, .05, Dp + .07, 0, PED_TOP - .025, 0);
    // a sunk panel on the front for each bay of the front row (frame 3 mm proud, panel 3 mm sunk: no shared planes)
    for (let c = 0; c < cols; c++) { const x = -W / 2 + .06 + B * (c + .5), ph = PED_TOP - .36; box(gilt, B - .1, ph + .03, .008, x, .2 + ph / 2 + .02, Dp / 2 + .004).castShadow = false; box(wn, B - .13, ph, .008, x, .2 + ph / 2 + .02, Dp / 2 + .006); }
    // brass inlay round every bay: strips 8 mm wide standing 4.5 mm proud of the top (the cards lie 2 mm proud)
    const inlay = (w, d, x, z) => box(gilt, w, .005, d, x, PED_TOP + .0025 - .0005, z).castShadow = false;
    for (let c = 0; c <= cols; c++) inlay(.008, Dp - .04, -W / 2 + .06 + B * c, 0);
    for (let r = 0; r <= rows; r++) inlay(W - .12 + .008, .008, 0, -Dp / 2 + .06 + B * r);
    // with two rows or more, the back rows' plates stand 6 cm higher and the front row's models are kept low (26 cm),
    // so the models in front do not hide the plates behind them from a standing viewer
    specs.forEach((sp, i) => { const r = Math.floor(i / cols), c = i % cols, back = rows > 1 && r < rows - 1, front = rows > 1 && r === rows - 1;
      this.makeBay(st, ped, i, sp, { x: -W / 2 + .06 + B * (c + .5), z: -Dp / 2 + .06 + B * (r + .5), card: B - .05, label: true, raise: back ? .06 : 0, hMax: front ? .26 : MINI_H }); });
    st.spec = this.pedestalSpec(st.part); st.mini = st.bays[0].mini;
  }
  // one showcase place on a pedestal: card, optional label plate, the mini model; returns the bay record
  makeBay(st, ped, i, spec, { x, z, card, round = false, label = false, raise = 0, hMax = MINI_H }) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.userData = { station: st.part.id, kind: 'pedestal', bay: i }; ped.add(g);
    const paper = new THREE.MeshStandardMaterial({ color: PAPER, roughness: .9 });
    const cm = new THREE.Mesh(round ? new THREE.CircleGeometry(card, 48) : new THREE.PlaneGeometry(card, card), paper); cm.rotation.x = -Math.PI / 2; cm.position.y = PED_TOP + (round ? 0 : .002); cm.receiveShadow = true; g.add(cm);
    let area = { r: card * MINI_FIT, dz: 0 };
    if (label && spec) {   // an engraved brass label at the bay's front edge, tilted toward the viewer (two lines when long)
      const title = String(spec.d.title || spec.st.title || 'Demo'), lw = card * .9, lh = .1, pz = card / 2 - .05, tex = plateTex(`${i + 1} · ${title}`, lw / lh);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshStandardMaterial({ map: tex, metalness: .55, roughness: .38, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .08 }));
      plate.rotation.x = -Math.PI / 2 + .9; plate.position.set(0, PED_TOP + .006 + raise + lh / 2 * Math.sin(.9) + .004, pz); plate.name = 'label'; g.add(plate);
      const sh = .012 + raise, stand = new THREE.Mesh(new THREE.BoxGeometry(lw + .01, sh, .028), bmat('gilt')); stand.position.set(0, PED_TOP + .002 + sh / 2, pz + .006); g.add(stand);
      // the model's circle (it turns) stays behind the plate's back edge (pz − lh·cos .9 / 2) with 1.3 cm to spare, and
      // 1.5 cm inside the card's back edge
      const front = pz - lh * Math.cos(.9) / 2 - .013, back = -card / 2 + .015;
      area = { r: (front - back) / 2, dz: (front + back) / 2 };
    }
    const mini = new THREE.Group(); mini.position.set(0, PED_TOP + .005, area.dz); mini.userData.y0 = PED_TOP + .005; g.add(mini);
    const bay = { group: g, mini, spec, ds: null, area, i, hMax }; st.bays.push(bay);
    this.buildMini(bay);
    return bay;
  }
  buildMini(bay) {
    const gone = [...bay.mini.children]; if (bay.ds) { gone.push(bay.ds.scene); bay.ds = null; } bay.mini.clear(); if (gone.length) this.trash(gone);
    const ps = bay.spec;
    if (!ps) { // a closed scroll lying on the pedestal
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .4, 24), new THREE.MeshStandardMaterial({ map: parchment('pedscroll', 128, 128), roughness: .8 })); r.rotation.z = Math.PI / 2; r.position.y = .05; r.castShadow = true; bay.mini.add(r); return;
    }
    let ds = null;
    try {
      ds = new DioramaScene(this.gfx, JSON.parse(JSON.stringify(ps.d)), { headless: true }); ds.step(0);
      // a small painted maquette: the demo's real materials (the materialize front past everything), no card or ink
      ds.U.uFrontR.value = 1e5; ds.U.uJitter.value = 0; ds.U.uSeamK.value = 0;
      const w = ds.world, ghosts = strobe(ds);   // motion demos: a few poses of their moving parts (see strobe)
      ghosts.forEach(gm => w.add(gm));   // they count in the fit
      const fit = fitBox(w, ds);
      if (!fit.n) throw new Error('nothing to show');
      w.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.ghost; } if (o.isLight) o.visible = false; if (o.isPoints) o.visible = false; });
      fit.hide.forEach(o => { o.visible = false; });
      // lines and sprites reaching well outside the model's box (field lines, guides, labels) are left out too
      const grow = fit.box.clone().expandByScalar(Math.max(fit.rXZ, fit.h) * .15), wb = new THREE.Box3(), winv = w.matrixWorld.clone().invert();
      w.traverse(o => { if (!(o.isLine || o.isSprite) || !o.visible || !o.geometry) return; wb.setFromObject(o).applyMatrix4(winv); if (isFinite(wb.min.x) && !grow.containsBox(wb)) o.visible = false; });
      // helper wireframes (a cell's glowing edge lines, wireframe meshes) are diagram ink, not part of a maquette
      w.traverse(o => { if (o.isLineSegments || (o.isMesh && [].concat(o.material).some(m => m && m.wireframe))) o.visible = false; });
      // what the mini leaves out is taken out of it, not just hidden: the station's bounds (layout checks, picking, the
      // probe's box) then measure the maquette, not a 250 m ground or hills 40–90 m out still hanging off the plinth
      { const out = []; w.traverse(o => { if (o !== w && !o.visible && !o.isLight) out.push(o); }); { const top = out.filter(o => !out.includes(o.parent)); top.forEach(o => o.removeFromParent()); disposeTree(top); }   /* detached subtrees are freed here: the room's disposal never reaches them */ bay.cut = out.length; }
      let s = Math.min(bay.area.r / fit.rXZ, (bay.hMax || MINI_H) / fit.h); w.scale.setScalar(s); w.position.set(-fit.c.x * s, -fit.box.min.y * s + .004, -fit.c.z * s);
      bay.mini.add(w);
      // never past its area: the model turns, so its farthest visible point from the turning axis must lie inside r
      const vb = visibleBox(w, bay.mini); if (!vb.isEmpty()) { const ext = Math.max(...[vb.min.x, vb.max.x].flatMap(x => [vb.min.z, vb.max.z].map(z => Math.hypot(x, z)))); if (ext > bay.area.r) { const f = bay.area.r / ext; s *= f; w.scale.setScalar(s); w.position.set(w.position.x * f, -fit.box.min.y * s + .004, w.position.z * f); } }
      bay.ds = ds; bay.fit = { s, rXZ: fit.rXZ, h: fit.h, hidden: fit.hide.length, shown: fit.n, ghosts: ghosts.length };
    } catch (e) {
      // last resort, never an empty card: an emblem (a sealed scroll with the demo's title on a small easel)
      console.warn('mini', ps.d && (ps.d.title || ps.d.type), e && e.message);
      if (ds) { this.trash([ds.scene]); } bay.ds = null; bay.mini.clear(); bay.mini.add(miniEmblem(ps.d.title || ps.st.title || 'Diorama')); bay.fit = { emblem: true };
    }
  }
  sheetTexture(part, i) {
    const A = part.analysis, n = A ? (A.chain || []).length : 0;
    return canvasTex(null, 512, 690, (g, w, h) => {
      const src = parchment('roomsheet', 512, 690).image; g.drawImage(src, 0, 0, w, h);
      g.fillStyle = '#2a1e15'; g.textAlign = 'center';
      g.font = '22px "IBM Plex Mono", monospace'; g.globalAlpha = .7; g.fillText(part.subOf ? 'SUB-SCROLL' : 'PART ' + (this.partIndex(part) + 1), w / 2, 70); g.globalAlpha = 1;
      g.font = '600 44px "IM Fell English SC", Georgia, serif'; const words = mathText(String(part.title)).split(/\s+/); let line = '', y = 140; const lines = [];
      const fitW = t => { if (g.measureText(t).width <= w - 80) return t; while (t.length > 1 && g.measureText(t + '…').width > w - 80) t = t.slice(0, -1); return t + '…'; };   // one very long word is cut, not drawn off the sheet
      words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w - 80 && line) { lines.push(line); line = wd; } else line = t; }); if (line) lines.push(line);
      if (lines.length > 5) { lines.length = 5; lines[4] = lines[4] + '…'; }
      lines.forEach(l => { g.fillText(fitW(l), w / 2, y); y += 52; });
      g.strokeStyle = '#8f733a'; g.lineWidth = 2; g.beginPath(); g.moveTo(140, y); g.lineTo(w - 140, y); g.stroke();
      g.font = '24px "IBM Plex Mono", monospace'; g.fillStyle = '#5b4532';
      if (part.startPage) g.fillText(`pages ${part.startPage}–${part.endPage}`, w / 2, y + 44);
      g.fillText(A ? `${n} steps · analysed` : 'sealed · click to open', w / 2, y + 84);
      if (A && A.summary) { g.font = 'italic 24px "Alegreya", Georgia, serif'; const ws = mathText(A.summary).split(/\s+/); let L = '', yy = y + 150; ws.forEach(wd => { const t = L ? L + ' ' + wd : wd; if (g.measureText(t).width > w - 90) { g.fillText(L, w / 2, yy); yy += 32; L = wd; } else L = t; }); if (yy < h - 60) g.fillText(L, w / 2, yy); }
      g.fillStyle = A ? '#9c3a28' : '#8f733a'; g.beginPath(); g.arc(w / 2, h - 70, 26, 0, 7); g.fill(); g.fillStyle = '#efe2c2'; g.font = '600 24px "IM Fell English SC", serif'; g.fillText(A ? '✓' : String(i + 1), w / 2, h - 62);
    });
  }
  refreshStation(part) {
    const st = this.stations.get(part.id); if (!st) { this.layout(); this.buildStations(); return; }
    // a different number of demos changes the plinth's footprint: lay the floor out again so nothing overlaps
    { const i = this.orderedParts().indexOf(part), f0 = this.footprints && this.footprints[i], f1 = plinthDims(this.pedestalSpecs(part).length), R = f0 && (Math.abs(f0.x1 - f0.x0) + Math.abs(f0.z1 - f0.z0)), want = f1.Wf + f1.Df;
      if (f0 && Math.abs(R - want) > 1e-3) { const D0 = { ...this.data.dims }; this.layout(); if (D0.w !== this.data.dims.w || D0.d !== this.data.dims.d) this.buildShell(); this.buildStations(); return; } }
    const oldMap = st.sheet.material.map; st.sheet.material.map = this.sheetTexture(part, this.placed.findIndex(x => x.part === part)); st.sheet.material.needsUpdate = true; if (oldMap) this.app.retire(() => oldMap.dispose()); this.buildPedestal(st);
  }
  // Live room size: each slider step stretches the built shell to the new size at once and moves every station to
  // its new place on the walls; 150 ms after the slider stops the shell is rebuilt there (fast path); release builds all.
  liveResize() {
    const D = this.data.dims, d0 = this.shell && this.shell.userData.dims;
    if (d0) this.shell.scale.set(D.w / d0.w, D.h / d0.h, D.d / d0.d);
    this.layout(true);
    this.stations.forEach(st => { const x = this.placed.find(q => q.part === st.part); st.group.visible = !!x; if (x) { st.slot = x.slot; st.group.position.copy(x.slot.p); st.group.lookAt(x.slot.p.clone().add(x.slot.n)); } });
    (this.spots || []).forEach(L => { L.target = L; }); this.placeSpots(true);
    clearTimeout(this._rzT); this._rzT = setTimeout(() => { this._rzT = null; if (!this.disposed) this.buildShell(true); }, 150);
  }
  addPart(part, after) {
    const i = this.data.parts.indexOf(after); this.data.parts.splice(i + 1, 0, part); this.save();
    const D0 = { ...this.data.dims }; this.layout(); if (D0.w !== this.data.dims.w || D0.d !== this.data.dims.d) this.buildShell(); this.buildStations();
  }
  // ---------- UI ----------
  buildUI() {
    const u = this.ui;
    u.append(el('div', { class: 'brand' }, [el('div', { class: 'brand-title', text: this.book.title }), el('div', { class: 'brand-sub', text: 'the room of this book' })]));
    u.append(el('div', { class: 'hub-actions glass' }, [
      el('button', { class: 'btn', text: '‹ Library', onclick: () => this.app.openHub({ fromRoom: this.book.id }) }),
      el('button', { class: 'btn', text: 'Room', onclick: () => this.togglePanel() }),
      el('button', { class: 'btn', text: 'Main menu', title: 'The title screen: continue, your scriptoria, a new one', onclick: () => this.app.openTitle() }),
      el('button', { class: 'btn ghost', text: 'Import / export', onclick: () => this.app.portDialog(this.book.id) })]));
    const touch = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    this.hint = el('div', { class: 'hint glass', text: touch ? 'Scrolls begin on the left wall · tap a scroll to read it · tap a model to enter its diorama' : 'Scrolls begin on the left wall · click a scroll to read it · click a model to enter its diorama · V: walk' }); u.append(this.hint);
    this.statusEl = el('div', { class: 'status-pill glass', hidden: true }); u.append(this.statusEl);
    this.panel = el('aside', { class: 'side-panel glass', hidden: true }); u.append(this.panel);
    this.tip = el('div', { class: 'tooltip', hidden: true }); u.append(this.tip);
  }
  togglePanel() {
    const P = this.panel; P.hidden = !P.hidden; if (P.hidden) return; P.innerHTML = ''; const D = this.data.dims;
    P.append(el('h3', { text: 'This room' }));
    [['w', 'Width', 8, 80], ['d', 'Depth', 8, 80], ['h', 'Height', 3.2, 9]].forEach(([k, label, a, b]) => { const out = el('b', { text: D[k].toFixed(1) + ' m' }), inp = el('input', { type: 'range', min: a, max: b, step: .1, value: D[k] }); inp.oninput = () => { out.textContent = (+inp.value).toFixed(1) + ' m'; D[k] = +inp.value; this.liveResize(); }; inp.onchange = () => { D[k] = +inp.value; clearTimeout(this._rzT); this._rzT = null; this.layout(); this.buildShell(); this.buildStations(); this.save(); }; P.append(el('label', { class: 'ctrl' }, [el('span', {}, [label, out]), inp])); });
    { const sel = el('select', { class: 'field small', 'aria-label': 'Ceiling' }, [el('option', { value: 'auto', text: 'From the subject (' + CEILINGS[this.ceiling()] + ')', selected: !this.data.ceiling || this.data.ceiling === 'auto' }), ...Object.entries(CEILINGS).map(([k, t]) => el('option', { value: k, text: t, selected: this.data.ceiling === k }))]);
      sel.onchange = () => { this.data.ceiling = sel.value; this.save(); this.buildShell(); }; P.append(el('label', { class: 'ctrl' }, [el('span', { text: 'Ceiling' }), sel])); }
    const parts = this.orderedParts(), done = parts.filter(p => p.analysis).length;
    P.append(el('h4', { text: `Scrolls · ${done} of ${parts.length} analysed` }));
    const list = el('ol', { class: 'part-list' }); parts.forEach(p => list.append(el('li', { class: (p.analysis ? 'done ' : '') + (p.subOf ? 'sub' : ''), onclick: () => this.openPart(p) }, [el('span', { text: p.title }), p.startPage ? el('small', { text: ` ${p.startPage}–${p.endPage}` }) : null]))); P.append(list);
    P.append(el('div', { class: 'row wrap' }, [
      el('button', { class: 'btn small', text: 'Re-split the PDF', onclick: async () => { if (await confirmBox('Find the chapters again? Analysed scrolls are kept only if their titles match.', 'Re-split')) { const old = this.data.parts; this.data.parts = []; await this.ingest(); this.data.parts.forEach(p => { const o = old.find(x => x.title === p.title); if (o && o.analysis) p.analysis = o.analysis; }); this.save(); this.layout(); this.buildStations(); } } }),
      el('button', { class: 'btn small', text: '+ Empty scroll', onclick: () => { const p = { id: 'p-' + uid(), title: 'New scroll', summary: '' }; this.data.parts.push(p); this.save(); this.layout(); this.buildShell(); this.buildStations(); this.togglePanel(); this.togglePanel(); } })]));
  }
  // ---------- interaction ----------
  // the station object under the pointer (a sheet, a pedestal bay, or a pedestal: then its bay nearest the hit point)
  pick(e) {
    const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera);
    const objs = []; this.stations.forEach(s => objs.push(s.sheet, s.ped)); const h = this.ray.intersectObjects(objs, true)[0]; if (!h) return null;
    let o = h.object; while (o && !o.userData.station) o = o.parent; if (!o) return null;
    let bay = o.userData.bay;
    if (o.userData.kind === 'pedestal' && bay == null) { const st = this.stations.get(o.userData.station); let best = 1e9; (st ? st.bays : []).forEach(b => { const d = b.group.getWorldPosition(V3()).distanceToSquared(h.point); if (d < best) { best = d; bay = b.i; } }); }
    return { o, kind: o.userData.kind, station: o.userData.station, bay: bay || 0 };
  }
  pointerMove(e) {
    if (this.reader || this.anim) return; const o = this.pick(e); this.gfx.canvas.style.cursor = o ? 'pointer' : '';
    if (o) {
      const p = this.data.parts.find(x => x.id === o.station), st = this.stations.get(p.id), b = st && st.bays[o.bay], many = st && st.bays.length > 1;
      const what = o.kind === 'pedestal' ? (b && b.spec ? (many ? `${o.bay + 1} · ${mathHTML(b.spec.d.title || b.spec.st.title || 'Demo', 'label')} — enter the diorama` : 'Enter the diorama') : 'No diorama yet: analyse the scroll') : (p.analysis ? 'Read the chain' : 'Open and analyse');
      this.tip.hidden = false; this.tip.innerHTML = `<b>${mathHTML(p.title, 'label')}</b><span>${what}</span>`; this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
    } else if (this.doorAt()) { this.gfx.canvas.style.cursor = 'pointer'; this.tip.hidden = false; this.tip.innerHTML = '<b>The door</b><span>Back to the library hall</span>'; this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`; }
    else this.tip.hidden = true;
  }
  // the room's double door leads back to the hall (pick() has just aimed the ray at the pointer)
  doorAt() { return doorHit(this.ray, this.doorPick, [...this.stations.values()].flatMap(s => [s.sheet, s.ped]).filter(Boolean)); }
  pointerUp(e) {
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || this.anim) return; this.down = null;
    const o = this.pick(e); if (!o) { if (this.doorAt() && !this.reader) this.app.walkThroughDoor(() => this.app.openHub({ fromRoom: this.book.id })); return; } const p = this.data.parts.find(x => x.id === o.station);
    if (o.kind === 'pedestal') this.enterPedestal(p, o.bay); else this.openPart(p);
  }
  flyTo(pos, look, dur = 1.4, then) { if (this.nav && this.nav.mode === 'walk') { const f = V3(); this.camera.getWorldDirection(f); this.controls.target.copy(this.camera.position).addScaledVector(f, 1.6); } this.anim = { from: { p: this.camera.position.clone(), t: this.controls.target.clone() }, to: { p: pos, t: look }, F: { p0: this.camera.position.clone(), q0: this.camera.quaternion.clone(), p1: pos.clone(), q1: lookQ(pos, look) }, k: 0, dur, then }; this.controls.enabled = false; }
  openPart(p, instant) {
    const st = this.stations.get(p.id); if (!st) return; if (this.reader) { this._swapReader = true; try { this.reader.close(); } finally { this._swapReader = false; } }
    const n = st.slot.n, c = st.sheet.getWorldPosition(V3());
    const pos = c.clone().addScaledVector(n, 2.2).add(V3(0, -.2, 0)).addScaledVector(V3().crossVectors(n, V3(0, 1, 0)), -.55);
    const open = () => { st.sheet.material.emissiveIntensity = .15; this.app.sfx && this.app.sfx.play('unroll'); this.reader = new Reader(this.app, this, p); this.app.route({ room: this.book.id, scroll: p.id }); this.app.rememberRoom(this.book.id, p.id); };
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(c); this.controls.update(); open(); } else this.flyTo(pos, c, 1.3, open);
    this.hint.hidden = true; this.tip.hidden = true;
  }
  onReaderClosed(r) {
    if (this.reader === r) this.reader = null; this.stations.forEach(s => s.sheet.material.emissiveIntensity = 0); this.hint.hidden = false;
    // the address loses its scroll (unless another scroll replaces it, or the room is being left)
    if (!this._swapReader && !this.disposed && this.app.mode === this) { this.app.route({ room: this.book.id }); this.app.rememberRoom(this.book.id, null); }
  }
  enterPedestal(p, bi = 0) {
    const st = this.stations.get(p.id), bay = st && (st.bays[bi] || st.bays[0]);
    if (!st || !bay || !bay.spec) { toast(p.analysis ? 'No 3D showcase in this scroll yet' : 'Analyse the scroll first'); this.openPart(p); return; }
    if (this.reader) this.reader.close();
    // aim at the model itself (its bounding box, not the card under it), at a distance that fits it in view; the unfold
    // then follows the model as it grows ×2.4 and lifts, so it stays centred all the way into the dive
    const n = st.slot.n, mi = bay.mini; mi.updateWorldMatrix(true, true); const bb = new THREE.Box3().setFromObject(mi), org = mi.getWorldPosition(V3());
    const c0 = bb.isEmpty() ? bay.group.getWorldPosition(V3()).add(V3(0, PED_TOP + .2, 0)) : bb.getCenter(V3()), r0 = bb.isEmpty() ? .25 : Math.max(.12, bb.getSize(V3()).length() * .5);
    const c1 = org.clone().add(c0.clone().sub(org).multiplyScalar(2.4)).add(V3(0, .25, 0)), r1 = r0 * 2.4, th = Math.tan(this.camera.fov * Math.PI / 360);
    const pose = (c, r, k) => c.clone().addScaledVector(n, r / th * k).add(V3(0, r * .35, 0));   /* in front of the model, a little above, looking slightly down */
    const p0 = pose(c0, r0, 1.5), p1 = pose(c1, r1, 1.25);
    this.app.sfx && this.app.sfx.play('wood', { pitch: 1.4, gain: .6 });
    this.flyTo(p0, c0, 1.2, () => { this.unfold = { st, bay, k: 0, c: c1, n, c0, c1, p0, p1 }; });
  }
  // ---------- frame ----------
  // frame budget (main.js loop): under an open scroll the room is a backdrop (20 frames a second); at rest and untouched
  // for 5 s, 30; moving, unfolding or flying, every frame
  renderFps(idleMs) { if (this.anim || this.unfold) return 60; if (this.reader) return 20; return idleMs < 5000 ? 60 : 30; }
  update(dt, t) {
    if (this.map) this.map.update(dt);
    { const sm = this.gfx.renderer.shadowMap; sm.autoUpdate = false; this._shF = (this._shF || 0) + 1; if (this.anim || this.unfold || this._shF % (this.reader ? 8 : 3) === 0) sm.needsUpdate = true; }   /* the room's shadows: only the turning card models move them, slowly */
    if ((this.probeDirty || this.probe.stale()) && !this.unfold && !this.probe.busy) this.captureProbe();
    this.probe.step();
    this.ao.update();
    if (this.anim) { const a = this.anim; a.k = Math.min(1, a.k + dt / a.dur); const e = (a.ease || easeInOutQuint)(a.k); this.controls.target.lerpVectors(a.from.t, a.to.t, e); flyPose(this.camera, a.F, e); if (a.k >= 1) { this.anim = null; this.nav.needsSync = true;   /* walking takes up the heading the flight ended on (it used to snap back to the one it had before) */ this.controls.enabled = this.nav.mode !== 'walk'; if (this.controls.enabled) this.controls.update(); a.then && a.then(); } }
    else {
      this.nav.update(dt, !!this.reader || !!this.unfold || !!this.app.cine);
    }
    this.placeSpots();
    // card models turn slowly; the chosen one unfolds (grows, lifts, glows) before the dive
    this.stations.forEach(s => s.bays.forEach(b => { b.mini.rotation.y += dt * .15; }));
    if (this.unfold) {
      const U = this.unfold; U.k += dt / 1.6; const e = easeInOutQuint(Math.min(1, U.k));
      const mi = U.bay.mini; mi.scale.setScalar(1 + e * 1.4); mi.position.y = mi.userData.y0 + e * .25; mi.rotation.y += dt * 1.2 * e;
      if (U.bay.ds) { U.bay.ds.U.uFrontR.value = 1e5; }
      { const m = e, aim = U.c0.clone().lerp(U.c1, m); this.camera.position.lerpVectors(U.p0, U.p1, m); this.camera.lookAt(aim); this.controls.target.copy(aim); }
      this.gfx.grade.uniforms.uFade.value = clamp((U.k - .55) * 2.2, 0, 1);
      if (U.k >= 1 && !U.done) { U.done = true; const sp = U.bay.spec; this.app.openDiorama(sp.d, { buildIn: true, autoTransition: true, title: sp.d.title || sp.st.title, subtitle: U.st.part.title + ' · ' + sp.st.id, context: `${sp.st.title}: ${sp.st.statement || ''}`, onSave: () => this.save(), returnTo: { room: this.book.id } }); }
    }
  }
  dispose() {
    if (this.map) { this.map.dispose(); this.map = null; }
    if (this.disposed) return; this.disposed = true;
    if (this.app.ingest && this.app.ingest.closePDF && !bookBusy(this.book.id)) this.app.ingest.closePDF(this.book.id);   // its parsed PDF (pdf.js worker memory); a running analysis keeps it
    this.gfx.canvas.removeEventListener('pointerdown', this.onDown); this.gfx.canvas.removeEventListener('pointerup', this.onUp); this.gfx.canvas.removeEventListener('pointermove', this.onMove);
    removeEventListener('keydown', this.onKeyD); removeEventListener('keyup', this.onKeyU);
    this.ao.dispose(); const pr = this.probe; this.app.retire ? this.app.retire(() => pr.dispose()) : pr.dispose();
    this.gfx.renderer.shadowMap.autoUpdate = true; this.nav.dispose(); this.controls.dispose(); if (this.reader) { this.reader.releaseFigures(); this.reader.el.remove(); removeEventListener('keydown', this.reader.onKey); if (this.reader._dockKey) { removeEventListener('keydown', this.reader._dockKey); this.reader._dockKey = null; } } this.ui.remove(); this.gfx.canvas.style.cursor = '';
  }
}
