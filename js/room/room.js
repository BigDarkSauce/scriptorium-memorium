// A book's own room. Its parts hang as scrolls along the walls, starting at the left wall and running round
// (left → back → right → front). Beside each scroll a pedestal carries a small card model of that part's diorama;
// clicking it unfolds the model and carries you inside. The room grows when more scrolls need hanging.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Navigator } from '../nav.js';
import { makeRoomShell } from '../gfx/roomshell.js';
import { makeMaterial } from '../gfx/materials.js';
import { canvasTex, parchment, radialGlow } from '../gfx/textures.js';
import { addInk, addOutlines, PAPER } from '../gfx/materialize.js';
import { DioramaScene } from '../dio/scene.js';
import { Reader, is3D, needsAuthoring } from './reader.js';
import { el, clamp, uid, toast, easeInOutQuint, easeOut, esc, confirmBox } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SPACING = 2.9;
// Station heights: every hanging scroll's lower rod sits at SHEET_BOTTOM, above the pedestal and its turning model
// (PED_TOP + up to ~.4 m), so from the opening view (eye ~1.9 m, ~4.5 m back) the model never hides the sheet.
const SHEET_BOTTOM = 1.3, PED_TOP = .965;

export class BookRoom {
  constructor(app, book, data, opts = {}) {
    this.app = app; this.gfx = app.gfx; this.book = book; this.data = data; this.opts = opts;
    this.data.dims = this.data.dims || { w: 12, d: 10, h: 5.5 }; if (this.data.dims.h === 4.4) this.data.dims.h = 5.5; this.data.parts = this.data.parts || [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0907); this.scene.environment = this.gfx.envStudio; this.scene.environmentIntensity = .2; this.scene.userData.look = Object.assign(this.gfx.constructor.HOUSE, { exposure: 1.65 }); // no window here: a touch more exposure than the hall
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 120);
    this.controls = new OrbitControls(this.camera, this.gfx.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, minDistance: .4, maxDistance: 12, maxPolarAngle: Math.PI * .56, rotateSpeed: .6 });
    this.stations = new Map(); this.keys = {};
    this.ui = el('div', { class: 'room-ui' }); app.ui.append(this.ui); this.buildUI();
    this.layout(); this.buildShell(); this.buildStations();
    this.frameStart();
    this.gfx.setView(this.scene, this.camera);
    this.nav = new Navigator({ camera: this.camera, controls: this.controls, canvas: this.gfx.canvas, keys: this.keys, host: this.ui,
      bounds: () => { const D = this.data.dims, c = (this.shell && this.shell.userData.baroque && this.shell.userData.baroque.caseDepth) || 0; return { minX: -D.w / 2 + c, maxX: D.w / 2 - c, minZ: -D.d / 2 + c, maxZ: D.d / 2 - c, h: D.h }; },
      obstacles: () => [...this.stations.values()].map(st => st.ped).filter(Boolean).map(o => new THREE.Box3().setFromObject(o)).concat([...(((this.shell && this.shell.userData.baroque && this.shell.userData.baroque.obstacles) || []).map(q => new THREE.Box3(new THREE.Vector3(q.x - q.r, 0, q.z - q.r), new THREE.Vector3(q.x + q.r, 1.8, q.z + q.r))))]) });
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.onDown = e => { this.down = { x: e.clientX, y: e.clientY }; }; this.onUp = e => this.pointerUp(e); this.onMove = e => this.pointerMove(e);
    this.onKeyD = e => { if (e.target.closest('input,textarea,select')) return; this.keys[e.key.toLowerCase()] = true; if ((e.key === 'v' || e.key === 'V') && !this.reader) this.nav.toggle(); }; this.onKeyU = e => { this.keys[e.key.toLowerCase()] = false; };
    this.gfx.canvas.addEventListener('pointerdown', this.onDown); this.gfx.canvas.addEventListener('pointerup', this.onUp); this.gfx.canvas.addEventListener('pointermove', this.onMove);
    addEventListener('keydown', this.onKeyD); addEventListener('keyup', this.onKeyU);
    if (!this.data.parts.length) this.ingest();
    if (opts.openPart) { const p = this.data.parts.find(x => x.id === opts.openPart); if (p) setTimeout(() => this.openPart(p, true), 200); }
  }
  save() { this.app.saveRoom(this.book.id, this.data); }
  // Opening view: stand back from the first scrolls (up to three) along their mean wall normal, looking at the scrolls
  // and their pedestals; drift a little toward the room centre so the neighbouring bays show too.
  frameStart() {
    const D = this.data.dims, first = (this.placed || []).slice(0, 3);
    if (!first.length) { this.camera.position.set(0, 1.65, D.d / 2 - 1.2); this.controls.target.set(0, 1.5, -D.d / 2); this.controls.update(); return; }
    // eye a little above standing height, looking slightly down: the line of sight over each pedestal's model meets the
    // wall below the scroll's lower rod (SHEET_BOTTOM), so banners show whole with their pedestals in front
    const t = V3(), n = V3(); first.forEach(({ slot }) => { t.add(slot.p.clone().addScaledVector(slot.n, .55)); n.add(slot.n); }); t.divideScalar(first.length).setY(1.62); n.normalize();
    const back = clamp(Math.min(D.w, D.d) * .5, 3.2, 5.2), p = t.clone().addScaledVector(n, back).lerp(V3(0, 0, 0), .22).setY(1.95);
    p.x = clamp(p.x, -D.w / 2 + 1.1, D.w / 2 - 1.1); p.z = clamp(p.z, -D.d / 2 + 1.1, D.d / 2 - 1.1);
    this.camera.position.copy(p); this.controls.target.copy(t); this.controls.update();
  }
  partIndex(p) { return this.data.parts.filter(x => !x.subOf).indexOf(p); }
  // ---------- ingestion: split the PDF into parts (outline → headings → contents page → windows) ----------
  async ingest() {
    if (!this.book.hasPdf) { this.status('This book has no PDF attached. Import a room JSON or add parts with AI.'); return; }
    const blob = await this.app.store.get('pdf:' + this.book.id); if (!blob) { this.status('The PDF for this book is not stored in this browser.'); return; }
    this.status('Finding the chapters…');
    try {
      const r = await this.app.ingest.splitBook(blob, { onProgress: k => this.status('Finding the chapters… ' + Math.round(k * 100) + '%') });
      this.book.pages = r.pages; this.app.saveLib();
      this.data.parts = r.parts.map(p => ({ id: 'p-' + uid(), ...p })); this.data.splitMethod = r.method; this.save();
      this.status(`${r.parts.length} parts found (${{ outline: 'from the PDF bookmarks', headings: 'from the headings', contents: 'from the contents page', windows: 'in fixed page windows' }[r.method]}).`, 4000);
      this.layout(); this.buildShell(); this.buildStations(); if (!this.reader && !this.anim && this.nav && this.nav.mode !== 'walk') this.frameStart();
    } catch (e) { this.status('Could not read the PDF: ' + e.message); }
  }
  status(msg, ms) { this.statusEl.textContent = msg; this.statusEl.hidden = !msg; clearTimeout(this._st); if (ms) this._st = setTimeout(() => { this.statusEl.hidden = true; }, ms); }
  // ---------- layout along the walls, starting at the left wall ----------
  orderedParts() { const out = []; this.data.parts.filter(p => !p.subOf).forEach(p => { out.push(p); this.data.parts.filter(s => s.subOf === p.id).forEach(s => out.push(s)); }); this.data.parts.filter(s => s.subOf && !this.data.parts.some(p => p.id === s.subOf)).forEach(s => out.push(s)); return out; }
  layout() {
    const D = this.data.dims, parts = this.orderedParts();
    const capacity = () => { const L = Math.floor((D.d - 2.4) / SPACING) + 1, B = Math.floor((D.w - 2.4) / SPACING) + 1; return { L, B, F: Math.max(0, Math.floor((D.w - 2.4) / SPACING) - 1), total: 2 * L + B + Math.max(0, Math.floor((D.w - 2.4) / SPACING) - 1) }; };
    let grew = false; while (capacity().total < parts.length && D.w < 80) { D.w += SPACING; D.d += SPACING * .6; grew = true; }
    if (grew) { this.save(); toast('The room grew to fit every scroll'); }
    const c = capacity(), slots = [];
    for (let i = 0; i < c.L; i++) slots.push({ wall: 'left', p: V3(-D.w / 2, 0, D.d / 2 - 1.2 - i * SPACING), n: V3(1, 0, 0) });
    for (let i = 0; i < c.B; i++) slots.push({ wall: 'back', p: V3(-D.w / 2 + 1.2 + i * SPACING, 0, -D.d / 2), n: V3(0, 0, 1) });
    for (let i = 0; i < c.L; i++) slots.push({ wall: 'right', p: V3(D.w / 2, 0, -D.d / 2 + 1.2 + i * SPACING), n: V3(-1, 0, 0) });
    for (let i = 0; i < c.F; i++) { const x = D.w / 2 - 1.2 - i * SPACING; if (Math.abs(x) < 1.4) continue; slots.push({ wall: 'front', p: V3(x, 0, D.d / 2), n: V3(0, 0, -1) }); }
    this.slots = slots; this.placed = parts.map((p, i) => ({ part: p, slot: slots[i] })).filter(x => x.slot);
  }
  buildShell() {
    if (this.shell) { this.scene.remove(this.shell); this.shell.userData.dispose && this.shell.userData.dispose(); }
    // Metten-like walnut-and-gilt wall bookcases; every hanging scroll gets an open, panelled niche in its bay
    const D = this.data.dims; this.shell = makeRoomShell({ w: D.w, d: D.d, h: D.h, style: 'baroque', windowWall: 'none', palette: 'teal', floor: 'cubes', avoid: (this.slots || []).map(s => s.p), cases: 'walnut', niches: (this.placed || []).map(x => x.slot.p) }); this.scene.add(this.shell);
    // daylight-free gallery: a few warm spots on the scrolls are added per station
  }
  buildStations() {
    this.stations.forEach(s => s.group.removeFromParent()); this.stations.clear();
    if (this.shell && this.shell.userData.setCases) this.shell.userData.setCases({ niches: this.placed.map(x => x.slot.p) }); // no-op when unchanged
    this.placed.forEach(({ part, slot }, i) => this.makeStation(part, slot, i));
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
    const spot = new THREE.SpotLight(0xffd8a0, 26, 6, .5, .7, 2); spot.position.set(0, y0 + 1.4, 1.4); spot.target = sheet; g.add(spot);
    sheet.userData = { station: part.id, kind: 'sheet' };
    // pedestal with the card model
    const ped = new THREE.Group(); ped.position.set(0, 0, 1.15); g.add(ped);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, PED_TOP - .065, 32), makeMaterial('marble')); col.position.y = (PED_TOP - .065) / 2; col.castShadow = true; col.receiveShadow = true; ped.add(col);
    const capM = new THREE.Mesh(new THREE.CylinderGeometry(.38, .34, .06, 32), makeMaterial('marble')); capM.position.y = PED_TOP - .035; capM.receiveShadow = true; ped.add(capM);
    const card = new THREE.Mesh(new THREE.CircleGeometry(.36, 48), new THREE.MeshStandardMaterial({ color: PAPER, roughness: .9 })); card.rotation.x = -Math.PI / 2; card.position.y = PED_TOP; card.receiveShadow = true; ped.add(card);
    ped.userData = { station: part.id, kind: 'pedestal' };
    const mini = new THREE.Group(); mini.position.y = PED_TOP + .005; ped.add(mini);
    const st = { part, group: g, sheet, ped, mini, slot, spec: null };
    this.stations.set(part.id, st); this.buildMini(st);
    return st;
  }
  pedestalSpec(part) {
    const A = part.analysis; if (!A) return null;
    if (part.pedestal) { const s = (A.chain || []).find(x => x.id === part.pedestal.step); const d = s && s.demos && s.demos[part.pedestal.demo]; if (d && is3D(d) && !needsAuthoring(d)) return { d, st: s }; }
    for (const s of A.chain || []) for (const d of s.demos || []) if (is3D(d) && !needsAuthoring(d)) return { d, st: s };
    return null;
  }
  buildMini(st) {
    st.mini.clear(); const ps = this.pedestalSpec(st.part); st.spec = ps;
    if (!ps) { // a closed scroll lying on the pedestal
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .4, 24), new THREE.MeshStandardMaterial({ map: parchment('pedscroll', 128, 128), roughness: .8 })); r.rotation.z = Math.PI / 2; r.position.y = .05; r.castShadow = true; st.mini.add(r); return;
    }
    try {
      const ds = new DioramaScene(this.gfx, JSON.parse(JSON.stringify(ps.d)), { headless: true }); ds.step(0);
      ds.U.uFrontR.value = -1e5; ds.U.uJitter.value = 0; ds.U.uSeamK.value = 0; addInk(ds.world, ds.U); addOutlines(ds.world, ds.U, .0022);
      const w = ds.world; const s = .3 / ds.radius; w.scale.setScalar(s); w.position.set(-ds.center.x * s, -Math.min(0, ds.bounds.min.y) * s + .005, -ds.center.z * s);
      w.traverse(o => { if (o.isMesh) { o.castShadow = true; } if (o.isLight) o.visible = false; if (o.isPoints) o.visible = false; });
      st.mini.add(w); st.ds = ds;
    } catch (e) { console.warn('mini', e); }
  }
  sheetTexture(part, i) {
    const A = part.analysis, n = A ? (A.chain || []).length : 0;
    return canvasTex(null, 512, 690, (g, w, h) => {
      const src = parchment('roomsheet', 512, 690).image; g.drawImage(src, 0, 0, w, h);
      g.fillStyle = '#2a1e15'; g.textAlign = 'center';
      g.font = '22px "IBM Plex Mono", monospace'; g.globalAlpha = .7; g.fillText(part.subOf ? 'SUB-SCROLL' : 'PART ' + (this.partIndex(part) + 1), w / 2, 70); g.globalAlpha = 1;
      g.font = '600 44px "IM Fell English SC", Georgia, serif'; const words = String(part.title).split(/\s+/); let line = '', y = 140; const lines = [];
      words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w - 80) { lines.push(line); line = wd; } else line = t; }); if (line) lines.push(line);
      lines.slice(0, 5).forEach(l => { g.fillText(l, w / 2, y); y += 52; });
      g.strokeStyle = '#8f733a'; g.lineWidth = 2; g.beginPath(); g.moveTo(140, y); g.lineTo(w - 140, y); g.stroke();
      g.font = '24px "IBM Plex Mono", monospace'; g.fillStyle = '#5b4532';
      if (part.startPage) g.fillText(`pages ${part.startPage}–${part.endPage}`, w / 2, y + 44);
      g.fillText(A ? `${n} steps · analysed` : 'sealed · click to open', w / 2, y + 84);
      if (A && A.summary) { g.font = 'italic 24px "Alegreya", Georgia, serif'; const ws = A.summary.split(/\s+/); let L = '', yy = y + 150; ws.forEach(wd => { const t = L ? L + ' ' + wd : wd; if (g.measureText(t).width > w - 90) { g.fillText(L, w / 2, yy); yy += 32; L = wd; } else L = t; }); if (yy < h - 60) g.fillText(L, w / 2, yy); }
      g.fillStyle = A ? '#9c3a28' : '#8f733a'; g.beginPath(); g.arc(w / 2, h - 70, 26, 0, 7); g.fill(); g.fillStyle = '#efe2c2'; g.font = '600 24px "IM Fell English SC", serif'; g.fillText(A ? '✓' : String(i + 1), w / 2, h - 62);
    });
  }
  refreshStation(part) {
    const st = this.stations.get(part.id); if (!st) { this.layout(); this.buildStations(); return; }
    st.sheet.material.map = this.sheetTexture(part, this.placed.findIndex(x => x.part === part)); st.sheet.material.needsUpdate = true; this.buildMini(st);
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
      el('button', { class: 'btn ghost', text: 'Import / export', onclick: () => this.app.portDialog(this.book.id) })]));
    this.hint = el('div', { class: 'hint glass', text: 'The scrolls begin on the left wall · click a scroll to read it · click a pedestal to enter its diorama' }); u.append(this.hint);
    this.statusEl = el('div', { class: 'status-pill glass', hidden: true }); u.append(this.statusEl);
    this.panel = el('aside', { class: 'side-panel glass', hidden: true }); u.append(this.panel);
    this.tip = el('div', { class: 'tooltip', hidden: true }); u.append(this.tip);
  }
  togglePanel() {
    const P = this.panel; P.hidden = !P.hidden; if (P.hidden) return; P.innerHTML = ''; const D = this.data.dims;
    P.append(el('h3', { text: 'This room' }));
    [['w', 'Width', 8, 80], ['d', 'Depth', 8, 80], ['h', 'Height', 3.2, 9]].forEach(([k, label, a, b]) => { const out = el('b', { text: D[k].toFixed(1) + ' m' }), inp = el('input', { type: 'range', min: a, max: b, step: .1, value: D[k] }); inp.oninput = () => out.textContent = (+inp.value).toFixed(1) + ' m'; inp.onchange = () => { D[k] = +inp.value; this.layout(); this.buildShell(); this.buildStations(); this.save(); }; P.append(el('label', { class: 'ctrl' }, [el('span', {}, [label, out]), inp])); });
    const parts = this.orderedParts(), done = parts.filter(p => p.analysis).length;
    P.append(el('h4', { text: `Scrolls · ${done} of ${parts.length} analysed` }));
    const list = el('ol', { class: 'part-list' }); parts.forEach(p => list.append(el('li', { class: (p.analysis ? 'done ' : '') + (p.subOf ? 'sub' : ''), onclick: () => this.openPart(p) }, [el('span', { text: p.title }), p.startPage ? el('small', { text: ` ${p.startPage}–${p.endPage}` }) : null]))); P.append(list);
    P.append(el('div', { class: 'row wrap' }, [
      el('button', { class: 'btn small', text: 'Re-split the PDF', onclick: async () => { if (await confirmBox('Find the chapters again? Analysed scrolls are kept only if their titles match.', 'Re-split')) { const old = this.data.parts; this.data.parts = []; await this.ingest(); this.data.parts.forEach(p => { const o = old.find(x => x.title === p.title); if (o && o.analysis) p.analysis = o.analysis; }); this.save(); this.layout(); this.buildStations(); } } }),
      el('button', { class: 'btn small', text: '+ Empty scroll', onclick: () => { const p = { id: 'p-' + uid(), title: 'New scroll', summary: '' }; this.data.parts.push(p); this.save(); this.layout(); this.buildShell(); this.buildStations(); this.togglePanel(); this.togglePanel(); } })]));
  }
  // ---------- interaction ----------
  pick(e) { const r = this.gfx.canvas.getBoundingClientRect(); this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mouse, this.camera); const objs = []; this.stations.forEach(s => objs.push(s.sheet, s.ped)); const h = this.ray.intersectObjects(objs, true)[0]; if (!h) return null; let o = h.object; while (o && !o.userData.station) o = o.parent; return o; }
  pointerMove(e) {
    if (this.reader || this.anim) return; const o = this.pick(e); this.gfx.canvas.style.cursor = o ? 'pointer' : '';
    if (o) { const p = this.data.parts.find(x => x.id === o.userData.station); this.tip.hidden = false; this.tip.innerHTML = `<b>${esc(p.title)}</b><span>${o.userData.kind === 'pedestal' ? (this.stations.get(p.id).spec ? 'Enter the diorama' : 'No diorama yet: analyse the scroll') : (p.analysis ? 'Read the chain' : 'Open and analyse')}</span>`; this.tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`; } else this.tip.hidden = true;
  }
  pointerUp(e) {
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || this.anim) return; this.down = null;
    const o = this.pick(e); if (!o) return; const p = this.data.parts.find(x => x.id === o.userData.station);
    if (o.userData.kind === 'pedestal') this.enterPedestal(p); else this.openPart(p);
  }
  flyTo(pos, look, dur = 1.4, then) { if (this.nav && this.nav.mode === 'walk') { const f = V3(); this.camera.getWorldDirection(f); this.controls.target.copy(this.camera.position).addScaledVector(f, 1.6); } this.anim = { from: { p: this.camera.position.clone(), t: this.controls.target.clone() }, to: { p: pos, t: look }, k: 0, dur, then }; this.controls.enabled = false; }
  openPart(p, instant) {
    const st = this.stations.get(p.id); if (!st) return; if (this.reader) this.reader.close();
    const n = st.slot.n, c = st.sheet.getWorldPosition(V3());
    const pos = c.clone().addScaledVector(n, 2.2).add(V3(0, -.2, 0)).addScaledVector(V3().crossVectors(n, V3(0, 1, 0)), -.55);
    const open = () => { st.sheet.material.emissiveIntensity = .15; this.reader = new Reader(this.app, this, p); };
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(c); this.controls.update(); open(); } else this.flyTo(pos, c, 1.3, open);
    this.hint.hidden = true; this.tip.hidden = true;
  }
  onReaderClosed(r) { if (this.reader === r) this.reader = null; this.stations.forEach(s => s.sheet.material.emissiveIntensity = 0); this.hint.hidden = false; }
  enterPedestal(p) {
    const st = this.stations.get(p.id); if (!st || !st.spec) { toast(p.analysis ? 'No 3D showcase in this scroll yet' : 'Analyse the scroll first'); this.openPart(p); return; }
    if (this.reader) this.reader.close();
    const c = st.ped.getWorldPosition(V3()).add(V3(0, PED_TOP + .085, 0)), n = st.slot.n;
    const pos = c.clone().addScaledVector(n, 1.1).add(V3(0, .45, 0));
    this.flyTo(pos, c, 1.2, () => { this.unfold = { st, k: 0, c, n }; });
  }
  // ---------- frame ----------
  update(dt, t) {
    if (this.anim) { const a = this.anim; a.k = Math.min(1, a.k + dt / a.dur); const e = easeInOutQuint(a.k); this.camera.position.lerpVectors(a.from.p, a.to.p, e); this.controls.target.lerpVectors(a.from.t, a.to.t, e); this.camera.lookAt(this.controls.target); if (a.k >= 1) { this.anim = null; this.controls.enabled = this.nav.mode !== 'walk'; if (this.controls.enabled) this.controls.update(); a.then && a.then(); } }
    else {
      this.nav.update(dt, !!this.reader || !!this.unfold);
    }
    // card models turn slowly; the chosen one unfolds (grows, lifts, glows) before the dive
    this.stations.forEach(s => { s.mini.rotation.y += dt * .15; });
    if (this.unfold) {
      const U = this.unfold; U.k += dt / 1.6; const e = easeInOutQuint(Math.min(1, U.k));
      U.st.mini.scale.setScalar(1 + e * 1.4); U.st.mini.position.y = PED_TOP + .005 + e * .25; U.st.mini.rotation.y += dt * 1.2 * e;
      if (U.st.ds) { U.st.ds.U.uFrontR.value = -1e5; }
      this.camera.position.lerp(U.c.clone().addScaledVector(U.n, .7).add(V3(0, .3, 0)), dt * 1.5); this.camera.lookAt(U.c);
      this.gfx.grade.uniforms.uFade.value = clamp((U.k - .55) * 2.2, 0, 1);
      if (U.k >= 1 && !U.done) { U.done = true; const sp = U.st.spec; this.app.openDiorama(sp.d, { buildIn: true, autoTransition: true, title: sp.d.title || sp.st.title, subtitle: U.st.part.title + ' · ' + sp.st.id, context: `${sp.st.title}: ${sp.st.statement || ''}`, onSave: () => this.save(), returnTo: { room: this.book.id } }); }
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.gfx.canvas.removeEventListener('pointerdown', this.onDown); this.gfx.canvas.removeEventListener('pointerup', this.onUp); this.gfx.canvas.removeEventListener('pointermove', this.onMove);
    removeEventListener('keydown', this.onKeyD); removeEventListener('keyup', this.onKeyU);
    this.nav.dispose(); this.controls.dispose(); if (this.reader) { this.reader.el.remove(); removeEventListener('keydown', this.reader.onKey); } this.ui.remove(); this.gfx.canvas.style.cursor = '';
  }
}
