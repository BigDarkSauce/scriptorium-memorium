// The explanatory visual grammar: declarative, reusable operations a lesson names (docs/SCENE_SPEC.md, "Explainer
// cues"; docs/PEDAGOGY.md, "The didactic planner"). Each operation answers one KIND of question (Jared Owen's rule:
// choose the technique by the knowledge to be acquired), so the AI only says which one and with what parameters:
//   explode     structural  parts move apart along an axis (or radially), dashed guides back to their seats, numbered
//                           callouts as in a parts diagram, a hold, then reassembly in assembly order (S8)
//   assemble    history     chronological reconstruction: the parts arrive one at a time, each with its caption, on a
//                           timeline of chips (initial state → action → intermediate state → result)
//   inspect     internal    the camera visits one component after another (component mode), then returns to the whole
//   compare     pathology   two states of the same model in IDENTICAL framing: side by side (two viewports, one camera)
//                           or a split wipe (one camera, the frame cut in two); the second state is a second world in the
//                           same scene, so the light, the environment and the post chain are the same for both
//   progression pathology   normal → initiating event → structural change → … → intervention: parameter sets in order,
//                           each a stage chip with its caption
//   scaleTo     scale       relative size: a lineup at one common size, then each resized to its true relative size
//   levels      scale       the level indicator (Organism ▸ Organ ▸ … or System ▸ Subsystem ▸ Part ▸ Mechanism) and the
//                           landmark kept as a ghost while a zoom goes inside it (nested-scale storytelling)
// The section (a clip plane with a capped poché, swept in) is peel's clip mode with a fixed axis (focus.js). The camera
// mode of a beat (global | object | component | mechanism | frame) is mapped to the director's shots in engine.js.
// Cost: nothing is built, no DOM is made and no pass is touched until an operation runs; everything is disposed when the
// step ends. Offsets (explode, assemble) are applied after the simulation and taken off before it, like peel's lift.
import * as THREE from 'three';
import { el, clamp, esc, mathHTML } from '../util.js';
import { cloneMat } from './focus.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NS = 'http://www.w3.org/2000/svg';
const smoother = x => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
const easeOut = x => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
const short = a => String(a && a.name || a || '').split(' · ')[0];

const CSS = `
.ops{position:absolute;inset:0;pointer-events:none;z-index:2}
.ops-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ops-svg .ops-lead{stroke:rgba(255,217,138,.75);stroke-width:1.2;fill:none}
.ops-badge{position:absolute;left:0;top:0;min-width:22px;height:22px;margin:-11px 0 0 -11px;padding:0 6px;border-radius:11px;display:flex;align-items:center;justify-content:center;gap:5px;font:600 12px var(--f-mono,monospace);color:#1d140b;background:rgba(255,217,138,.86);box-shadow:0 0 0 2px rgba(20,17,14,.65),0 2px 8px rgba(0,0,0,.55);white-space:nowrap;transition:opacity .3s}
.ops-badge span{font-weight:500}
.ops-chip{position:absolute;left:0;top:0;padding:4px 12px 5px;border-radius:12px;background:rgba(18,14,10,.84);border:1px solid rgba(255,217,138,.5);color:var(--ink,#f3ead8);font:12px var(--f-mono,monospace);max-width:min(520px,calc(100vw - 20px));text-align:center;line-height:1.5}
.ops-chip b,.co-ops b{color:var(--brass,#d8b46a);font-weight:500}
.ops-key{display:flex;flex-wrap:wrap;justify-content:center;gap:1px 10px;margin-top:2px;font:11px var(--f-mono,monospace);color:var(--ink-2,#cbbfa6)}
.ops-key i{font-style:normal;white-space:nowrap}.ops-key i.now{color:var(--brass,#d8b46a)}.ops-key i.done{color:var(--ink,#f3ead8)}
.co-ops{margin:-1px 0 6px;font:12px var(--f-mono,monospace);color:var(--ink-2,#cbbfa6);line-height:1.45}.co-ops .ops-key{justify-content:flex-start;margin-top:3px}
.ops-div{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:linear-gradient(rgba(255,217,138,0),rgba(255,217,138,.8) 12%,rgba(255,217,138,.8) 88%,rgba(255,217,138,0));box-shadow:0 0 6px rgba(0,0,0,.6)}
.ops-cap{position:absolute;left:0;top:0;padding:4px 12px;border-radius:14px;max-width:calc(50vw - 24px);white-space:normal;text-align:center;line-height:1.45;background:rgba(18,14,10,.84);border:1px solid rgba(255,217,138,.5);color:var(--ink,#f3ead8);font:12px var(--f-mono,monospace)}
.ops-cap b{color:var(--brass,#d8b46a);font-weight:500}
.ops-level{position:absolute;left:0;top:0;display:flex;align-items:center;gap:2px;padding:3px 10px;border-radius:999px;background:rgba(18,14,10,.78);border:1px solid rgba(255,217,138,.35);color:var(--ink-2,#cbbfa6);font:11px var(--f-mono,monospace);white-space:nowrap;transition:opacity .4s}
.ops-level i{font-style:normal;padding:0 3px}.ops-level i.now{color:#1d140b;background:var(--brass,#d8b46a);border-radius:999px;padding:0 7px}.ops-level s{text-decoration:none;opacity:.55}
.ops-level em{font-style:normal;margin-left:6px;color:var(--ink,#f3ead8);opacity:.85}`;
function injectCSS() { if (document.getElementById('ops-css')) return; const s = document.createElement('style'); s.id = 'ops-css'; s.textContent = CSS; document.head.append(s); }

export class Ops {
  constructor(view) { this.v = view; this.ex = null; this.as = null; this.ins = null; this.cmp = null; this.pr = null; this.sc = null; this.lv = null; this.off = new Map(); this._q = V3(); this._p = V3(); this._s = V3(); this._qq = new THREE.Quaternion(); }
  // ---------- small shared parts ----------
  get on() { return !!(this.ex || this.as || this.ins || this.cmp || this.pr || this.sc || this.lv); }
  ensure() {
    if (this.layer) return; injectCSS();
    this.layer = el('div', { class: 'ops' }); this.v.ui.append(this.layer);
    this.svg = document.createElementNS(NS, 'svg'); this.svg.setAttribute('class', 'ops-svg'); this.layer.append(this.svg);
    this.chip = el('div', { class: 'ops-chip', hidden: true }); this.layer.append(this.chip);
  }
  ready() { const c = this.v.cues; return !!(c && c.ready()); }
  // the previous stage's callout has been read (or nearly): the next stage never runs ahead of the text on screen
  read() { const d = this.v.dir; return !(d.beat && d.beat.opsBeat && d.beat.t < d.beat.dur * .85) && !d.queue.some(b => b.opsBeat); }
  reduced() { return !!(this.v.reducedMotion && this.v.reducedMotion()); }
  actor(n) { if (!n) return null; const a = this.v.actorByName(n); if (a) return a; const ds = this.v.ds, o = ds.bodyMap && ds.bodyMap.get(String(n)); return o ? { name: o.userData.label || o.name || String(n), obj: o, getPos: () => ds.centerOf(o), describe: o.userData.describe || '', id: String(n) } : null; }   // an actor, else a scene body by id (decor can be cut or moved too)
  boxOf(o, out = new THREE.Box3()) { out.makeEmpty(); if (o) { o.updateWorldMatrix(true, true); out.setFromObject(o); } return out; }
  // the HUD the overlays keep clear of (read at most every 0.25 s): panels, readouts, title, buttons, time bar, callout, chips, inset
  hud() {
    const now = performance.now(); if (this._hud && now - this._hudT < 250) return this._hud; this._hudT = now;
    const v = this.v, d = v.dir, R = [];
    [v.readPanel, v.panel && !v.panel.classList.contains('folded') ? v.panel : null, v.titleEl, v.povBar, v.ui && v.ui.querySelector('.dio-actions'), v.ui && v.ui.querySelector('.dio-time'), document.querySelector('.sound-btn'), document.querySelector('.gfx-btn'), d && d.beat && d.beat.el, v.inset && v.inset.box, d && d.chipEl, v.cues && v.cues.chip, d && d.sbar].forEach(P => { if (!P || P.hidden || !P.getBoundingClientRect || P.style.visibility === 'hidden') return; const r = P.getBoundingClientRect(); if (r.width > 1 && r.height > 1 && getComputedStyle(P).display !== 'none' && +getComputedStyle(P).opacity !== 0) R.push([r.left - 8, r.top - 8, r.right + 8, r.bottom + 8]); });   /* >= 8 px clear of every HUD rect (the polish gate's rule) */
    this._pins = []; v.labels && v.labels.querySelectorAll('.pin').forEach(P => { if (P.style.visibility === 'hidden') return; const n = P.querySelector('.pin-name') || P, r = n.getBoundingClientRect(); if (r.width > 1 && r.height > 1) this._pins.push([r.left - 3, r.top - 3, r.right + 3, r.bottom + 3]); });   /* nor on an object's name */
    return (this._hud = R);
  }
  // the HUD without the director's callout: an overlay that reserves its own slot (compare captions, the level indicator)
  // ignores the callout, and the director steps the callout round it (its hard obstacles), so the two never chase each other.
  // On a phone the callout is a fixed bottom sheet: everything keeps off it.
  hudNoCallout() { const R = this.hud(), bel = this.v.dir && this.v.dir.beat && this.v.dir.beat.el; if (innerWidth < 760 || !bel || !bel.isConnected) return R; const q = bel.getBoundingClientRect(); return R.filter(r => !(Math.abs(q.left - 8 - r[0]) < 1 && Math.abs(q.top - 8 - r[1]) < 1)); }
  hits(x, y, w, h, R = this.hud()) { return R.some(r => x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1]); }
  // the legend / timeline: inside the current callout under its kicker (never over text), else a chip at the top of the free frame
  legend(html) {
    this.ensure(); this.legendHTML = html || ''; if (!html) { this.chip.hidden = true; this.dropCo(); return; }
    const d = this.v.dir, b = d && d.beat, co = b && b.el && b.el.isConnected ? b.el : null;
    if (co) { if (!this.co || this.co.parentNode !== co) { this.dropCo(); this.co = el('div', { class: 'co-ops' }); const k = co.querySelector('.co-step') || co.querySelector('.co-kicker'); if (k) k.after(this.co); else co.prepend(this.co); this.co._h = null; } if (this.co._h !== html) { this.co._h = html; this.co.innerHTML = html; b.rectT = -1; } this.chip.hidden = true; return; }
    this.dropCo(); if (this.chip._h !== html) { this.chip._h = html; this.chip.innerHTML = html; this.chip._w = 0; } this.chip.hidden = false;
    const w = innerWidth, h = innerHeight; if (!this.chip._w) { this.chip._w = this.chip.offsetWidth || 260; this.chip._hh = this.chip.offsetHeight || 30; }
    const fr = d ? d.freeFrame(w) : [0, w], cw = this.chip._w, ch = this.chip._hh; let x = clamp((fr[0] + fr[1]) / 2 - cw / 2, fr[0] + 8, Math.max(fr[0] + 8, fr[1] - cw - 8)), y = 74;
    for (let k = 0; k < 8 && this.hits(x, y, cw, ch); k++) y += 30;
    if (w < 760) { x = 10; y = h - 128 - ch - 10; }
    const tf = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; if (this.chip._tf !== tf) { this.chip._tf = tf; this.chip.style.transform = tf; }
  }
  dropCo() { if (this.co) { this.co.remove(); this.co = null; } }
  keyHTML(items, cur = -1, done = -1) { return '<span class="ops-key">' + items.map((t, i) => `<i${i === cur ? ' class="now"' : i <= done ? ' class="done"' : ''}>${i + 1} ${mathHTML(t, 'label')}</i>`).join('') + '</span>'; }
  // numbered (or named) callouts on world points, kept off the HUD and off each other; a leader line when moved away
  badges(list) {
    this.ensure(); const B = this._badges || (this._badges = []), cam = this.v.camera, w = innerWidth, h = innerHeight, q = this._q, placed = [];
    while (B.length < list.length) { const e = el('div', { class: 'ops-badge' }), ln = document.createElementNS(NS, 'path'); ln.setAttribute('class', 'ops-lead'); this.layer.append(e); this.svg.append(ln); B.push({ e, ln }); }
    const hide = b => { b.e.style.opacity = 0; b.ln.setAttribute('d', ''); };
    for (let i = 0; i < B.length; i++) {
      const b = B[i], it = list[i]; if (!it) { hide(b); continue; }
      const txt = it.name ? `${it.n}<span>${esc(it.name)}</span>` : String(it.n); if (b._t !== txt) { b._t = txt; b.e.innerHTML = txt; b.w = 0; }
      q.copy(it.p).project(cam); if (q.z > 1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) { hide(b); continue; }
      if (!b.w) b.w = b.e.offsetWidth || 24; const sx = (q.x * .5 + .5) * w, sy = (-q.y * .5 + .5) * h, bw = b.w;
      let x = sx + (it.dx || 0), y = sy + (it.dy != null ? it.dy : -26);
      for (let k = 0; k < 8; k++) { const hit = placed.find(p => Math.abs(p.x - x) < (p.w + bw) / 2 + 4 && Math.abs(p.y - y) < 26); if (!hit) break; y = hit.y + (y <= sy ? -27 : 27); }
      const box = (x0, y0) => [x0 - 11, y0 - 11, bw, 22];   /* the badge's box: its left edge is 11 px left of its anchor (CSS margin) */
      const HP = this.hud().concat(this._pins || []), clear = (x0, y0) => !this.hits(...box(x0, y0), HP);
      if (!clear(x, y)) { const alt = [[x, y + 52], [x - bw - 10, y], [x + bw + 10, y], [x, y - 30], [x - bw - 10, y + 52]].find(([ax, ay]) => ax > 14 && ay > 14 && ax < w - bw - 4 && ay < h - 14 && clear(ax, ay) && !placed.some(p => Math.abs(p.x - ax) < (p.w + bw) / 2 && Math.abs(p.y - ay) < 26)); if (!alt) { hide(b); continue; } [x, y] = alt; }
      placed.push({ x, y, w: bw }); const tf = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; if (b._tf !== tf) { b._tf = tf; b.e.style.transform = tf; } b.e.style.opacity = it.op == null ? '' : String(it.op);
      const far = Math.hypot(x - sx, y - sy) > 16; b.ln.setAttribute('d', far ? `M${sx.toFixed(0)} ${sy.toFixed(0)} L${x.toFixed(0)} ${(y + (y > sy ? -11 : 11)).toFixed(0)}` : ''); b.ln.style.opacity = it.op == null ? 1 : it.op;
    }
  }
  clearBadges() { (this._badges || []).forEach(b => { b.e.remove(); b.ln.remove(); }); this._badges = null; }
  // a pose that frames a world box like the director's medium (thirds, free frame), or close
  poseFor(box, shot = 'medium') {
    const c = box.getCenter(V3()), s = box.getSize(V3()), P = this._proxy || (this._proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    P.position.copy(c); P.scale.set(Math.max(s.x, 1e-3), Math.max(s.y, 1e-3), Math.max(s.z, 1e-3)); P.updateMatrixWorld(true);
    return this.v.dir.frame({ poseOnly: true, kind: 'explain', shot, focus: P, anchor: () => c, names: [], host: null });
  }
  // the same pose turned round its target until nothing opaque stands between the lens and the part (the director's ray test)
  clearPose(pose, a) {
    if (!pose) return pose; const d = this.v.dir, c = pose.target, ax = pose.pos.clone().sub(c), dist = ax.length(); if (dist < 1e-6) return pose; ax.divideScalar(dist);
    // a close-up looks down on its part (about 40°): wires and neighbours on the bench then rarely stand in front of it
    { const h = Math.hypot(ax.x, ax.z) || 1, e = THREE.MathUtils.degToRad(40); ax.set(ax.x / h * Math.cos(e), Math.sin(e), ax.z / h * Math.cos(e)); }
    const bx = this.boxOf(a.obj), rs = Math.max(.02, bx.isEmpty() ? .2 : bx.getSize(V3()).length() * .3);
    try { const occ = d.occluders(a), nx = d.blockCost(bx.isEmpty() ? c : bx.getCenter(V3()), ax, dist, dist, rs, occ) === 0 ? ax : d.clearAxis(bx.isEmpty() ? c : bx.getCenter(V3()), ax, dist, dist, rs, occ, 105); return { target: c, pos: c.clone().addScaledVector(nx, dist), fov: pose.fov }; } catch (e) { return pose; }
  }
  // an eased camera glide (a moving shot: smoothstep position, slerped heading, so start and stop are gentle and the turn
  // rate stays bounded); Calm turns it into a cut through a dip
  glide(pose, dur) {
    const v = this.v, d = v.dir, cam = v.camera; if (!pose) return;
    if (this.reduced()) { d.cutTo(pose.target, pose.pos, pose.fov, true); return; }
    d.stopShots(); v.fly = null; v.controls.enabled = false; v.controls.target.copy(pose.target);
    const m = new THREE.Matrix4().lookAt(pose.pos, pose.target, V3(0, 1, 0)), turn = cam.quaternion.angleTo(new THREE.Quaternion().setFromRotationMatrix(m)), dist = cam.position.distanceTo(pose.pos) / Math.max(.1, pose.pos.distanceTo(pose.target));
    d.move = { from: cam.position.clone(), to: pose.pos.clone(), t0: pose.target.clone(), k: 0, dur: dur || clamp(1.6 + turn / Math.PI * 2.4 + dist * .5, 1.6, 4), q0: cam.quaternion.clone() };
    d.fovTo = pose.fov; d.last = { kind: 'medium', moving: true, subj: null, t: d.clock };
  }
  // ---------- offsets (explode, assemble): world displacements applied as local deltas after the simulation ----------
  setOff(obj, w) { let e = this.off.get(obj); if (!e) { e = { w: V3(), applied: V3(), at: V3(), has: false, anc: null }; this.off.set(obj, e); for (let q = obj.parent; q; q = q.parent) if (this.off.has(q)) { e.anc = q; break; } this.off.forEach((x, o) => { for (let q = o.parent; q; q = q.parent) if (q === obj) { if (!x.anc || this.isAncestor(x.anc, obj)) x.anc = obj; break; } }); } e.w.copy(w); }
  isAncestor(a, b) { for (let q = b.parent; q; q = q.parent) if (q === a) return true; return false; }
  preStep() { this.off.forEach((e, o) => { if (!e.has) return; if (o.position.equals(e.at)) o.position.sub(e.applied); e.has = false; }); }
  applyOff() {
    if (!this.off.size) return;
    // outermost first, so a child's parent already carries its own displacement when the child's is converted
    const list = [...this.off.entries()].sort((a, b) => this.depth(a[0]) - this.depth(b[0]));
    for (const [o, e] of list) {
      if (!o.parent) continue; const own = this._p.copy(e.w); if (e.anc && this.off.has(e.anc)) own.sub(this.off.get(e.anc).w);
      if (own.lengthSq() < 1e-12) { e.applied.set(0, 0, 0); continue; }
      o.parent.updateWorldMatrix(true, false); o.parent.matrixWorld.decompose(this._q, this._qq, this._s);
      own.applyQuaternion(this._qq.invert()).divide(this._s); o.position.add(own); e.applied.copy(own); e.at.copy(o.position); e.has = true;
      o.updateMatrixWorld(true);
    }
  }
  depth(o) { let n = 0; for (let q = o.parent; q; q = q.parent) n++; return n; }
  clearOff() { this.preStep(); this.off.clear(); }

  // ---------- lifecycle (engine) ----------
  // before the step's own parameters are set: a comparison builds its second world, a reconstruction hides its parts
  prepare(l, cue) {
    if (cue && cue.compare) this.startCompare(cue.compare, l);
  }
  start(cue, l, host) {
    if (cue.explode) this.startExplode(cue.explode, host);
    if (cue.assemble) this.startAssemble(cue.assemble);
    if (cue.inspect) this.startInspect(cue.inspect);
    if (cue.progression) this.startProgression(cue.progression);
    if (cue.scaleTo) this.startScale(cue.scaleTo);
    if (cue.hide && cue.hide.length) { this.hid = cue.hide.filter(x => x && x.obj).map(x => ({ o: x.obj, v: x.obj.visible })); this.hid.forEach(h => { h.o.visible = false; }); }   // actors set aside for the step (a meter standing in front of a section)
    this.startLevels(l, cue);
    if (this.cmp) this.frameCompare();
  }
  // the simulation is frozen while parts are apart (exploding contradicts the dynamics) and during a lineup
  simRate() { const E = this.ex; return (E && E.phase !== 'done' && E.phase !== 'wait') || (this.sc && this.sc.phase !== 'wait' && !this.sc.done) ? 0 : 1; }
  busy() { return !!((this.ex && this.ex.phase !== 'done') || (this.as && !this.as.done) || (this.ins && !this.ins.done) || (this.pr && !this.pr.done) || (this.sc && !this.sc.done)); }
  holdShot() { return !!(this.cmp || this.sc || (this.ex && this.ex.phase !== 'done') || (this.ins && !this.ins.done)); }   // the director does not cut away for an event while one of these owns the frame
  muteVectors() { return !!((this.ex && /^(frame|out|hold|in)$/.test(this.ex.phase)) || (this.sc && this.sc.phase !== 'wait')); }
  ownsFrame() { return !!((this.cmp && this.cmp.pose) || (this.sc && this.sc.phase !== 'wait')); }
  noAnchor() { return !!(this.cmp && this.cmp.mode === 'side'); }   // side by side: a callout leader into one half would point at the wrong state
  hidePins() { return !!(this.cmp || this.sc || (this.ex && /^(out|hold|in)$/.test(this.ex.phase))); }   // the parts' own callouts replace the pins while they are apart
  endStep() { if (this.hid) { this.hid.forEach(h => { h.o.visible = h.v; }); this.hid = null; } this.endExplode(); this.endAssemble(); this.endInspect(); this.endProgression(); this.endScale(); this.endCompare(); this.endLevels(); this.legend(null); }
  reset() { this.endStep(); this.clearOff(); }
  update(dt) {
    if (!this.on && !this.off.size) return;
    if (this.ex) this.updateExplode(dt);
    if (this.as) this.updateAssemble(dt);
    if (this.ins) this.updateInspect(dt);
    if (this.pr) this.updateProgression(dt);
    if (this.sc) this.updateScale(dt);
    this.applyOff();
    if (this.cmp) this.updateCompare(dt);
    if (this.lv) this.updateLevels(dt);
    if (this.legendHTML && this.layer) this.legend(this.legendHTML);
  }
  dispose() { this.reset(); if (this._proxy) { this._proxy.geometry.dispose(); this._proxy = null; } if (this.layer) { this.layer.remove(); this.layer = null; } }

  // ================================================================ explode (structural)
  // E: {parts:[actor], axis:'auto'|'x'|'y'|'z'|[x,y,z], distance (× assembly radius per rank; radial: of the radius),
  //     labels:true|'numbered'|false, hold:s, reassemble:true, stagger:s, anchor:actor (stays at its seat), caption}
  startExplode(E, host) {
    const parts = (E.parts || []).filter(a => a && a.obj).slice(0, 12); if (parts.length < 2) return;
    this.ensure(); this.v.scene.updateMatrixWorld(true);
    const objs = new Set(parts.map(a => a.obj)), own = (o, out) => { out.makeEmpty(); const q = new THREE.Box3(); o.updateWorldMatrix(true, true); o.traverse(m => { if (!m.isMesh || m.userData.isInk) return; for (let p = m; p && p !== o; p = p.parent) if (objs.has(p)) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); q.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); out.union(q); }); if (out.isEmpty()) this.boxOf(o, out); return out; };   /* a part's OWN box: a beam group that holds the weights does not count them */
    const all = new THREE.Box3(), bx = new THREE.Box3(), homes = parts.map(a => { own(a.obj, bx); all.union(bx); return { c: bx.getCenter(V3()), s: bx.getSize(V3()) }; });
    const C0 = all.getCenter(V3()), R = Math.max(.2, all.getSize(V3()).length() * .5);
    const ax = Array.isArray(E.axis) ? V3(+E.axis[0] || 0, +E.axis[1] || 0, +E.axis[2] || 0).normalize() : E.axis === 'x' ? V3(1, 0, 0) : E.axis === 'z' ? V3(0, 0, 1) : E.axis === 'y' ? V3(0, 1, 0) : null;
    const anchor = E.anchor ? this.actor(E.anchor) : null;
    let dirs;
    if (ax) {
      // a stack along the axis: rank by position along it (ties share a rank), the lowest (or the named anchor) stays
      const pr = homes.map((h, i) => ({ i, t: h.c.dot(ax) })).sort((a, b) => a.t - b.t); let rank = 0, last = null; const rk = [];
      pr.forEach(o => { if (last != null && o.t - last > R * .04) rank++; rk[o.i] = rank; last = o.t; });
      const a0 = anchor ? parts.indexOf(parts.find(p => p.obj === anchor.obj)) : -1, base = a0 >= 0 ? rk[a0] : 0, gap = Math.max(.01, ...homes.filter((h, i) => rk[i] !== base).map(h => Math.abs(h.s.dot(ax)))),   /* the parts that move (the base stays) */ d = Math.max((+E.distance || .25) * R, gap * 1.8);   /* every rank clears the tallest part along the axis: visible gaps */
      dirs = rk.map(r => ax.clone().multiplyScalar((r - base) * d));
    } else {
      const d = (+E.distance || .55) * R;
      dirs = homes.map((h, i) => { if (anchor && parts[i].obj === anchor.obj) return V3(); const o = h.c.clone().sub(C0); if (o.lengthSq() < R * R * 1e-4) o.set(0, 1, 0); o.normalize(); if (o.y < -.2) o.y = -.2; return o.normalize().multiplyScalar(d); });
    }
    const names = parts.map(short);
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffd98a, dashSize: R * .03, gapSize: R * .02, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(parts.length * 6), 3)); lines.frustumCulled = false; lines.renderOrder = 35; lines.userData.isInk = true; lines.raycast = () => { }; lines.name = 'explode guides'; this.v.scene.add(lines);
    const fin = all.clone(); homes.forEach((h, i) => { bx.setFromCenterAndSize(h.c.clone().add(dirs[i]), h.s); fin.union(bx); });
    this.ex = { E, parts, homes, dirs, names, k: parts.map(() => 0), phase: 'wait', t: 0, lines, fin, R, C0, stagger: clamp(+E.stagger || .25, 0, 1), hold: Math.max(1.5, +E.hold || 3), back: E.reassemble !== false, labels: E.labels === false ? 0 : E.labels === 'numbered' || parts.length > 5 ? 1 : 2, host };
  }
  updateExplode(dt) {
    const X = this.ex, v = this.v, d = v.dir; let go = false;
    if (X.phase === 'wait') { if (!this.ready()) return; X.phase = 'frame'; X.t = 0; this.glide(this.poseFor(X.fin.clone().expandByScalar(X.R * .15)), 2.2); X.lines.material.opacity = 0; }
    X.t += dt;
    if (X.phase === 'frame') { if (!d.move && !d.dip || X.t > 4.5) { X.phase = 'out'; X.t = 0; if (this.reduced()) { X.k = X.k.map(() => 1); d.dip = { t: 0, done: false, apply: () => { } }; } } }
    else if (X.phase === 'out') { const dur = .9; X.parts.forEach((a, i) => { X.k[i] = this.reduced() ? 1 : clamp((X.t - i * X.stagger) / dur, 0, 1); }); if (X.k.every(k => k >= 1)) { X.phase = 'hold'; X.t = 0; this.explodeBeat(); } }
    else if (X.phase === 'hold') { if (X.t >= X.holdFor && !(d.beat && d.beat.kind === 'explain' && d.beat.opsBeat && d.beat.t < d.beat.dur * .8)) { if (X.back) { X.phase = 'in'; X.t = 0; X.order = X.parts.map((_, i) => i).reverse(); } else { X.phase = 'done'; } } }
    else if (X.phase === 'in') { const dur = .7, st = .35; X.order.forEach((i, j) => { X.k[i] = this.reduced() ? 0 : 1 - clamp((X.t - j * st) / dur, 0, 1); }); if (X.k.every(k => k <= 0)) { X.phase = 'done'; go = true; } }
    // the offsets, the guides back to the seats, the callouts
    const pos = X.lines.geometry.attributes.position, items = [];
    X.parts.forEach((a, i) => { const e = smoother(X.k[i]), w = this._p.copy(X.dirs[i]).multiplyScalar(e); this.setOff(a.obj, w); const h = X.homes[i].c, c = h.clone().add(w); pos.setXYZ(i * 2, h.x, h.y, h.z); pos.setXYZ(i * 2 + 1, c.x, c.y, c.z); if (X.labels && (X.phase === 'out' || X.phase === 'hold' || X.phase === 'in')) items.push({ p: c, n: i + 1, name: X.labels === 2 ? X.names[i] : null, op: clamp(X.k[i] * 1.5, 0, 1) }); });
    pos.needsUpdate = true; X.lines.computeLineDistances(); const m = Math.max(...X.k); X.lines.material.opacity = .75 * clamp(m * 2, 0, 1);
    this.badges(items);
    const cur = X.phase === 'out' ? X.k.findIndex(k => k < 1) : -1;
    if (X.phase === 'out' || X.phase === 'hold' || X.phase === 'in') this.legend(`<b>${X.phase === 'in' ? 'Reassembly' : 'Exploded view'}</b> · ${X.parts.length} parts` + this.keyHTML(X.names, X.phase === 'in' ? X.order.find(i => X.k[i] > 0) ?? -1 : cur));
    if (go) { this.clearBadges(); this.legend(null); X.lines.material.opacity = 0; this.v.touchLabels && this.v.touchLabels(X.parts); }
  }
  explodeBeat() {
    const X = this.ex, d = this.v.dir, txt = X.E.caption || `The ${X.parts.length} parts, apart: ${X.names.map((n, i) => (i + 1) + ' ' + n).join(', ')}. Each dashed line leads back to where the part sits.`;
    X.holdFor = Math.max(X.hold, d.readTime(txt));
    const P = X.proxy || (X.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))), fc = X.fin.getCenter(V3()), fs = X.fin.getSize(V3()); P.position.copy(fc); P.scale.set(Math.max(fs.x, .01), Math.max(fs.y, .01), Math.max(fs.z, .01)); P.updateMatrixWorld(true);   /* the callout keeps off the whole exploded assembly */
    d.push({ kind: 'explain', kicker: 'Exploded view', noShot: true, opsBeat: true, title: 'Parts', text: txt, anchor: () => X.C0, focus: P, host: X.host, names: [] });
  }
  endExplode() { const X = this.ex; if (!X) return; X.parts.forEach(a => this.setOff(a.obj, V3())); this.applyOffAndDrop(X.parts.map(a => a.obj)); X.lines.removeFromParent(); X.lines.geometry.dispose(); X.lines.material.dispose(); if (X.proxy) X.proxy.geometry.dispose(); this.clearBadges(); this.ex = null; }
  applyOffAndDrop(objs) { this.preStep(); objs.forEach(o => this.off.delete(o)); }

  // ================================================================ assemble (chronological reconstruction)
  // A: {parts:[actor | {a, caption}], from:'above'|'outside', hold, stagger}: hidden at the step's start, they arrive in order
  startAssemble(A) {
    const parts = (A.parts || []).map(p => p && p.a ? p : { a: p }).filter(p => p.a && p.a.obj).slice(0, 10); if (!parts.length) return;
    this.ensure(); this.v.scene.updateMatrixWorld(true);
    const all = new THREE.Box3(), bx = new THREE.Box3(); parts.forEach(p => all.union(this.boxOf(p.a.obj, bx))); const R = Math.max(.2, all.getSize(V3()).length() * .5), C0 = all.getCenter(V3());
    parts.forEach(p => { p.vis0 = p.a.obj.visible; p.a.obj.visible = false; p.k = 0; const c = this.boxOf(p.a.obj, bx).getCenter(V3()); p.from = A.from === 'outside' ? c.sub(C0).setY(0).normalize().multiplyScalar(R * .8).add(V3(0, R * .2, 0)) : V3(0, R * .7, 0); });
    this.as = { A, parts, i: -1, t: 0, wait: 0, done: false, names: parts.map(p => p.label || short(p.a)), R };
  }
  updateAssemble(dt) {
    const S = this.as, d = this.v.dir; if (S.done && S.parts.every(p => p.k >= 1)) return;
    S.parts.forEach((p, j) => { if (j > S.i) p.a.obj.visible = false; });   // (re-asserted every frame: a model may set visibility itself)
    if (!S.done && this.ready()) {
      S.t += dt;
      if (S.i < 0 || (S.t >= S.wait && this.read())) {
        S.i++; S.t = 0;
        if (S.i >= S.parts.length) { S.done = true; }
        else { const p = S.parts[S.i], txt = p.caption || (short(p.a) + (p.a.describe ? ': ' + p.a.describe : '')); p.a.obj.visible = p.vis0 !== false; S.wait = Math.max(+S.A.stagger || 1.6, d.readTime(txt)) + .5;
          d.push({ kind: 'explain', kicker: `Stage ${S.i + 1} of ${S.parts.length}`, noShot: true, opsBeat: true, title: short(p.a), text: txt, anchor: () => p.a.getPos(), focus: p.a.obj, host: p.a, names: [] }); this.v.touchLabels && this.v.touchLabels([p.a]); }
      }
    }
    S.parts.forEach((p, j) => { if (j <= S.i) p.k = this.reduced() ? 1 : Math.min(1, p.k + dt / 1.1); this.setOff(p.a.obj, this._p.copy(p.from).multiplyScalar(1 - easeOut(p.k))); });
    this.legend(`<b>Built in order</b> · stage ${Math.min(S.i + 1, S.parts.length)} of ${S.parts.length}` + this.keyHTML(S.names, S.done ? -1 : S.i, S.done ? S.parts.length : S.i - 1));
  }
  endAssemble() { const S = this.as; if (!S) return; S.parts.forEach(p => { p.a.obj.visible = p.vis0 !== false; this.setOff(p.a.obj, V3()); }); this.applyOffAndDrop(S.parts.map(p => p.a.obj)); this.as = null; }

  // ================================================================ inspect (component close-ups, then back to the whole)
  // I: {parts:[actor | {a, note}], hold}
  startInspect(I) {
    const parts = (I.parts || []).map(p => p && p.a ? p : { a: p }).filter(p => p.a && p.a.obj).slice(0, 8); if (!parts.length) return;
    this.ensure(); this.ins = { I, parts, i: -1, t: 0, wait: 0, done: false, names: parts.map(p => short(p.a)) };
  }
  updateInspect(dt) {
    const S = this.ins, d = this.v.dir; if (S.done || !this.ready() && S.i < 0) return;
    S.t += dt;
    if (S.i < 0 || (S.t >= S.wait && !d.move && this.read())) {
      S.i++; S.t = 0;
      if (S.i >= S.parts.length) { S.done = true; const k = d.wideKey(); this.glide({ target: k.target, pos: k.pos, fov: d.baseFov() }); this.legend(null); return; }   // back to the whole: an internal part is never left without its place in it
      const p = S.parts[S.i], txt = p.note || (short(p.a) + (p.a.describe ? ': ' + p.a.describe : ''));
      this.glide(this.clearPose(this.poseFor(this.boxOf(p.a.obj), 'close'), p.a)); S.wait = Math.max(+S.I.hold || 2.2, d.readTime(txt)) + 1.2;
      d.push({ kind: 'explain', kicker: `Part ${S.i + 1} of ${S.parts.length}`, noShot: true, opsBeat: true, title: short(p.a), text: txt, anchor: () => p.a.getPos(), focus: p.a.obj, host: p.a, names: [] }); this.v.touchLabels && this.v.touchLabels([p.a]);
    }
    if (!S.done) this.legend(`<b>Component by component</b>` + this.keyHTML(S.names, S.i, S.i - 1));
  }
  endInspect() { if (this.ins) { this.ins = null; } }

  // ================================================================ progression (normal → event → change → consequence → intervention)
  // P: {stages:[{label, set:{param:value}, caption, hold}]}
  startProgression(P) { const st = (P.stages || []).filter(s => s && (s.label || s.caption)).slice(0, 7); if (!st.length) return; this.ensure(); this.pr = { P, st, i: -1, t: 0, wait: 0, done: false }; }
  updateProgression(dt) {
    const S = this.pr, d = this.v.dir; if (S.done) return; if (S.i < 0 && !this.ready()) return;
    S.t += dt;
    if (S.i < 0 || (S.t >= S.wait && this.read())) {
      S.i++; S.t = 0; if (S.i >= S.st.length) { S.done = true; this.legend(null); return; }
      const s = S.st[S.i], txt = s.caption || s.label; for (const k in s.set || {}) this.v.setParam(k, +s.set[k], true); if (s.set) this.v.renderParams && this.v.renderParams();
      S.wait = Math.max(+s.hold || 4, d.readTime(txt)) + .4;
      const host = this.actor(s.focus) || this.v.lessonActor;
      d.push({ kind: 'explain', kicker: `Stage ${S.i + 1} of ${S.st.length} · ${s.label || ''}`, noShot: true, opsBeat: true, title: s.label || 'Stage', text: txt, anchor: host ? () => host.getPos() : null, focus: host && host.obj, host, names: [] });
    }
    this.legend(`<b>Progression</b>` + this.keyHTML(S.st.map(s => s.label || 'stage'), S.i, S.i - 1));
  }
  endProgression() { this.pr = null; }

  // ================================================================ scaleTo (relative-size comparison: a lineup, then true scale)
  // S: {items:[{name, r, color, a?}], unit:'km', hold:s, captions:{common, true}, source}
  startScale(S) {
    const items = (S.items || []).filter(x => x && +x.r > 0).slice(0, 10); if (items.length < 2) return;
    this.ensure(); const v = this.v, ds = v.ds, cam = v.camera, n = items.length;
    // the model's own meshes step aside (their lights stay, so no shader is recompiled); they come back at the step's end
    const hid = []; [ds.world, ds.extras].forEach(g => g.traverse(o => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible) { hid.push(o); o.visible = false; } }));
    const tgt = v.controls.target.clone(), D = cam.position.distanceTo(tgt), Hv = 2 * D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), Wv = Hv * (cam.aspect || 1.6) * .72;
    const right = V3(1, 0, 0).applyQuaternion(cam.quaternion), up = V3(0, 1, 0).applyQuaternion(cam.quaternion), rmax = Math.max(...items.map(x => +x.r));
    const s0 = Math.min(Hv * .07, Wv / (n * 3)), common = items.map((x, i) => ({ s: s0, x: (i - (n - 1) / 2) * (Wv / n) }));
    let tr = items.map(x => +x.r / rmax * Hv * .36), gap = Wv * .012, tot = tr.reduce((a, s) => a + 2 * s, 0) + gap * (n - 1); if (tot > Wv) { const f = Wv / tot; tr = tr.map(s => s * f); gap *= f; tot = Wv; }
    let xc = -tot / 2; const truth = tr.map(s => { const x = xc + s; xc += 2 * s + gap; return { s, x }; });
    const G = new THREE.Group(); G.name = 'scale lineup'; v.scene.add(G); const geo = new THREE.SphereGeometry(1, 48, 32), box = new THREE.Box3();
    const meshes = items.map((x, i) => { const col = new THREE.Color(x.color || '#c9b38a'), star = !!x.star || /^sun$/i.test(x.name); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: .75, metalness: 0, emissive: col.clone().multiplyScalar(star ? 1.4 : .22) })); m.name = 'lineup · ' + x.name; m.userData.isInk = false; m.castShadow = false; m.receiveShadow = false; m.scale.setScalar(1e-4); m.position.copy(tgt); G.add(m); return m; });
    this.sc = { S, items, meshes, geo, G, hid, tgt, right, up, common, truth, phase: 'wait', t: 0, k: 0, done: false, names: items.map(x => x.name), hold: Math.max(2.5, +S.hold || 3.5), box };
  }
  scalePose(k) { const Z = this.sc; Z.meshes.forEach((m, i) => { const st = clamp(k * 1.25 - i * .25 / Z.meshes.length, 0, 1), e = smoother(st), a = Z.common[i], b = Z.truth[i], s = a.s + (b.s - a.s) * e, x = a.x + (b.x - a.x) * e; m.scale.setScalar(Math.max(1e-5, s * Z.grow)); m.position.copy(Z.tgt).addScaledVector(Z.right, x); }); }
  updateScale(dt) {
    const Z = this.sc, d = this.v.dir;
    if (Z.phase === 'wait') { if (!this.ready()) { Z.meshes.forEach(m => m.scale.setScalar(1e-5)); return; } Z.phase = 'common'; Z.t = 0; this.scaleBeat('common'); }
    Z.t += dt;
    if (Z.phase === 'common') { Z.grow = this.reduced() ? 1 : smoother(Z.t / .8); this.scalePose(0); if (Z.t >= Math.max(Z.hold, Z.holdFor || 0)) { Z.phase = 'morph'; Z.t = 0; if (this.reduced()) d.dip = { t: 0, done: false, apply: () => { } }; } }
    else if (Z.phase === 'morph') { Z.grow = 1; const T = this.reduced() ? .2 : 3.2; this.scalePose(Z.t / T); if (Z.t >= T) { Z.phase = 'true'; Z.t = 0; this.scaleBeat('true'); } }
    else if (Z.phase === 'true') { this.scalePose(1); if (Z.t >= Math.max(Z.hold, Z.holdFor || 0)) { Z.done = true; } }
    // callouts: numbered when crowded, named otherwise; the key names them
    const many = Z.items.length > 5, items = Z.meshes.map((m, i) => ({ p: m.position.clone().addScaledVector(Z.up, m.scale.x * 1.05), n: i + 1, name: many ? null : Z.names[i], dy: -18 }));
    this.badges(items);
    this.legend(`<b>${Z.phase === 'common' ? 'One common size' : Z.phase === 'morph' ? 'Resizing to true scale…' : 'True relative size'}</b>` + (Z.S.unit ? ` · radius in ${esc(Z.S.unit)}` : '') + this.keyHTML(Z.names.map((nm, i) => nm + (Z.phase !== 'common' && Z.S.unit ? ' ' + Number(Z.items[i].r).toLocaleString('en') : ''))));
  }
  scaleBeat(which) {
    const Z = this.sc, d = this.v.dir, C = Z.S.captions || {}, txt = which === 'common' ? (C.common || 'All drawn the same size, as in a classroom chart.') : (C.true || 'Now each is drawn at its true size relative to the others.');
    Z.holdFor = d.readTime(txt);
    d.push({ kind: 'explain', kicker: which === 'common' ? 'Classroom picture' : 'True scale', noShot: true, opsBeat: true, title: which === 'common' ? 'Same size' : 'True size', text: txt + (which === 'true' && Z.S.source ? ' (' + Z.S.source + ')' : ''), anchor: null,   /* the whole lineup is the subject: no leader onto one sphere */ focus: null, host: null, names: [] });
  }
  endScale() { const Z = this.sc; if (!Z) return; Z.hid.forEach(o => { o.visible = true; }); Z.G.removeFromParent(); Z.meshes.forEach(m => m.material.dispose()); Z.geo.dispose(); this.clearBadges(); this.sc = null; }

  // ================================================================ compare (identical framing, two states)
  // C: {mode:'side'|'split', a:{set, label, read}, b:{set, label, read}, label}. The second state is a second world built
  // from the same spec with b's parameters, in the SAME scene (same light, environment and post chain); the render pass
  // draws the scene twice into two halves of the frame with one camera, each time with the other world hidden.
  startCompare(C, l) {
    this.endCompare(); const v = this.v, ds = v.ds, spec = v.spec, isScene = spec.type === 'scene' || Array.isArray(spec.bodies);
    const pa = Object.assign({}, ds.p, l.set || {}, (C.a && C.a.set) || {}), pb = Object.assign({}, pa, (C.b && C.b.set) || {});
    const specB = JSON.parse(JSON.stringify(spec)); delete specB.additions; delete specB.overrides;
    if (isScene) specB.values = pb; else specB.params = Object.assign({}, specB.params || {}, pb);
    // a second DioramaScene that shares the scene, the uniforms of the drawing → real patch, the materials and the environment
    const B = Object.create(Object.getPrototypeOf(ds));
    Object.assign(B, { gfx: ds.gfx, spec: specB, headless: false, scene: ds.scene, U: ds.U, camera: ds.camera, t: 0, playing: true, speed: ds.speed, series: [], seriesName: '', actors: [], labelsDirty: true, events: [], listeners: { event: [] }, orb: { th: ds.orb.th, ph: ds.orb.ph, r: ds.orb.r, target: ds.orb.target.clone() }, env: { update() { }, preset: ds.env && ds.env.preset }, mats: ds.mats, _camSet: true });
    B.world = new THREE.Group(); B.world.name = 'compare world (B)'; B.extras = new THREE.Group(); B.extras.name = 'compare extras (B)'; ds.scene.add(B.world, B.extras);
    try { B.initParams(); B.build(); } catch (e) { console.warn('compare: the second state could not be built', e); B.world.removeFromParent(); B.extras.removeFromParent(); return; }
    // a built-in model keeps module state (the bob's position for shots and flows): build the main model last again
    if (!isScene) { for (const k in pa) if (k in ds.p) ds.p[k] = pa[k]; v.rebuild(); v.refreshPins && v.refreshPins(); }
    else for (const k in (C.a && C.a.set) || {}) v.setParam(k, +C.a.set[k], true);
    const rp = v.gfx.renderPass, orig = rp.render;
    this.ensure();
    const div = el('div', { class: 'ops-div' }), capA = el('div', { class: 'ops-cap' }), capB = el('div', { class: 'ops-cap' }); this.layer.append(div, capA, capB);
    this.cmp = { C, B, mode: C.mode === 'split' ? 'split' : 'side', rp, orig, div, capA, capB, t: 0 };
    const self = this, cm = this.cmp;
    rp.render = function (r, wb, rb, dtt, mask) {
      const K = self.cmp; if (!K || K !== cm || this.renderToScreen) return orig.call(this, r, wb, rb, dtt, mask);
      const T = rb, W = T.width, H = T.height, half = W >> 1, cam = this.camera, asp = cam.aspect, A = [ds.world, ds.extras], va = A.map(o => o.visible);
      try {
        if (K.mode === 'side') { cam.aspect = half / H; cam.updateProjectionMatrix(); }
        T.scissorTest = true;
        // A: left
        K.B.world.visible = false; K.B.extras.visible = false;
        if (K.mode === 'side') T.viewport.set(0, 0, half, H); T.scissor.set(0, 0, half, H); orig.call(this, r, wb, rb, dtt, mask);
        // B: right
        A.forEach(o => { o.visible = false; }); K.B.world.visible = true; K.B.extras.visible = true;
        if (K.mode === 'side') T.viewport.set(half, 0, W - half, H); T.scissor.set(half, 0, W - half, H); orig.call(this, r, wb, rb, dtt, mask);
      } finally {
        A.forEach((o, i) => { o.visible = va[i]; }); K.B.world.visible = false; K.B.extras.visible = false;
        T.viewport.set(0, 0, W, H); T.scissor.set(0, 0, W, H); T.scissorTest = false; r.setRenderTarget(T);
        if (K.mode === 'side') { cam.aspect = asp; cam.updateProjectionMatrix(); }
      }
    };
    // the atmosphere pass (fog, god rays) reconstructs view rays from the full frame: in side mode each half gets its own,
    // through the half-aspect projection composed with the map from the full frame's NDC to the half's
    const at = v.gfx.atmos; if (at && this.cmp.mode === 'side') { const ao = at.render, tmp = new THREE.PerspectiveCamera(), M = new THREE.Matrix4(); this.cmp.atmos = { at, ao };
      at.render = function (r, wb, rb, dtt, mask) {
        const K = self.cmp, cam = v.camera; if (!K || K !== cm || !this.enabled) return ao.call(this, r, wb, rb, dtt, mask);
        tmp.copy(cam); tmp.aspect = (cam.aspect || 1.6) / 2; tmp.updateProjectionMatrix();
        const sets = [this.mat, this.godMat].filter(m => m && m.uniforms && m.uniforms.uProjInv), keep = sets.map(m => m.uniforms.uProjInv.value.clone()), T = wb, W = T.width, H = T.height, half = W >> 1;
        try { T.scissorTest = true;
          [[-1, 0, half], [1, half, W - half]].forEach(([sx, x0, w0]) => { M.set(2, 0, 0, sx === -1 ? 1 : -1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); sets.forEach(m => m.uniforms.uProjInv.value.multiplyMatrices(tmp.projectionMatrixInverse, M)); T.scissor.set(x0, 0, w0, H); ao.call(this, r, wb, rb, dtt, mask); });
        } finally { sets.forEach((m, i) => m.uniforms.uProjInv.value.copy(keep[i])); T.scissor.set(0, 0, W, H); T.scissorTest = false; }
      }; }
    B.world.visible = false; B.extras.visible = false;   // (outside the pass, the second world is never drawn: shadow maps, the inset, the focus mask)
  }
  // one framing for both: the whole model centred, fitted to a half-width frame (side) or to the full frame (split)
  frameCompare() {
    const K = this.cmp, v = this.v, ds = v.ds, cam = v.camera, R0 = ds.orb ? ds.orb.r : 10, bx = new THREE.Box3(), all = new THREE.Box3();
    v.scene.updateMatrixWorld(true); ds.actors.concat(K.B.actors || []).forEach(a => { if (!a.obj) return; this.boxOf(a.obj, bx); if (!bx.isEmpty() && bx.getSize(V3()).length() < R0 * 1.6) all.union(bx); });
    if (all.isEmpty()) all.setFromCenterAndSize(ds.center.clone(), V3(4, 4, 4));
    const c = all.getCenter(V3()), r = Math.max(.5, all.getSize(V3()).length() * .5), fov = v.dir.baseFov(), asp = (cam.aspect || 1.6) / (K.mode === 'side' ? 2 : 1);
    const off = cam.position.clone().sub(v.controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1); off.normalize(); const el2 = THREE.MathUtils.degToRad(12), dir = off.multiplyScalar(Math.cos(el2)); dir.y = Math.sin(el2);
    const dist = Math.max(r / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 1.25, ds.orb ? ds.orb.r : 0) / Math.min(1, asp);   /* at least the model's own overview distance (its stand and scenery count), widened for a half-width frame */
    K.pose = { target: c, pos: c.clone().addScaledVector(dir, dist), fov };
    v.dir.cutTo(K.pose.target, K.pose.pos, fov, true);
  }
  updateCompare(dt) {
    const K = this.cmp, w = innerWidth, h = innerHeight, half = w / 2; K.t += dt;
    const lab = (s, side, ds) => { if (!s) return ''; let t = `<b>${side}</b> · ${mathHTML(s.label || '', 'label')}`; if (s.read) { const r = (ds.readouts() || []).find(x => String(x[0]).toLowerCase().startsWith(String(s.read).toLowerCase())); if (r) t += ' · ' + (/^…$|^\.\.\.$/.test(String(r[1]).trim()) ? mathHTML(r[0], 'label') + ' measuring…' : mathHTML(r[0] + ' ' + r[1], 'label')); } return t; };
    if (!K._rt || K.t - K._rt > .25) { K._rt = K.t; const a = lab(K.C.a, 'A', this.v.ds), b = lab(K.C.b, 'B', K.B); if (K.capA._h !== a) { K.capA._h = a; K.capA.innerHTML = a; K.capA._w = 0; } if (K.capB._h !== b) { K.capB._h = b; K.capB.innerHTML = b; K.capB._w = 0; } }
    K.div.style.left = half.toFixed(0) + 'px';
    { const P = this.v.readPanel; if (P && K.mode === 'side' && P.style.visibility !== 'hidden') { K.rp0 = P.style.visibility; P.style.visibility = 'hidden'; } }   // side by side, the captions carry the readout: the panel would cover the right half's subject
    // the captions: bottom of the free band, centred in each half, stepped up off the HUD
    const band = this.v.dir.freeBand(h), place = (e, cx) => { if (!e._w) { e._w = e.offsetWidth || 160; e._h = e.offsetHeight || 26; } let x = clamp(cx - e._w / 2, 8, w - e._w - 8), y = band[1] - e._h - 8; const HR = this.hudNoCallout(); for (let k = 0; k < 10 && this.hits(x, y, e._w, e._h, HR); k++) y -= 30; const tf = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; if (e._tf !== tf) { e._tf = tf; e.style.transform = tf; } };
    place(K.capA, half / 2); place(K.capB, half * 1.5);
  }
  // the second state runs in step with the first (same time scale)
  stepB(dt) { const K = this.cmp; if (!K) return; try { K.B.step(dt); } catch (e) { console.warn(e); this.endCompare(); } }
  endCompare() {
    const K = this.cmp; if (!K) return; this.cmp = null;
    K.rp.render = K.orig; if (Object.prototype.hasOwnProperty.call(K.rp, 'render') && K.rp.render === Object.getPrototypeOf(K.rp).render) delete K.rp.render;
    if (K.atmos) { K.atmos.at.render = K.atmos.ao; if (K.atmos.at.render === Object.getPrototypeOf(K.atmos.at).render) delete K.atmos.at.render; }
    K.B.world.removeFromParent(); K.B.extras.removeFromParent();
    // the second world's own geometry and materials go; the shared materials (ds.mats) and everything the main world still uses stay
    const keep = new Set(); this.v.ds.world.traverse(o => { if (o.geometry) keep.add(o.geometry); [].concat(o.material || []).forEach(m => { keep.add(m); for (const k in m) if (m[k] && m[k].isTexture) keep.add(m[k]); }); });
    Object.values(this.v.ds.mats || {}).forEach(m => keep.add(m));
    K.B.world.traverse(o => { if (o.geometry && !keep.has(o.geometry) && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose(); [].concat(o.material || []).forEach(m => { if (!m || keep.has(m) || (m.userData && m.userData.shared)) return; for (const k in m) if (m[k] && m[k].isTexture && !keep.has(m[k]) && !(m[k].userData && m[k].userData.shared)) m[k].dispose(); m.dispose(); }); });
    K.div.remove(); K.capA.remove(); K.capB.remove(); if (K.rp0 != null && this.v.readPanel) this.v.readPanel.style.visibility = K.rp0;
  }

  // ================================================================ levels (the camera knows which level it is on)
  // spec.levels / DIO.<type>.levels: ["System","Subsystem",…] or [{name, at:actor}]. Shown while a step zooms, rides or names a
  // level. During a zoom the current level is the deepest whose `at` actor the camera is close to (≤ 4 × its radius);
  // the zoom's `anchor` (a landmark) turns into a ghost with its edges while the camera is near or inside it, so the old
  // level stays visible around the new one.
  startLevels(l, cue) {
    const v = this.v, L0 = cue.levels || null;
    const zoom = cue.zoom, show = !!(l.level || zoom || cue.scaleTo);   /* only beats that move between levels or name one */
    if (!show || (!L0 && !l.level && !(zoom && zoom.anchor))) return;
    const L = (L0 || [l.level]).map(x => typeof x === 'string' ? { name: x } : x).filter(x => x && x.name).slice(0, 6).map(x => ({ name: String(x.name), a: x.at ? this.actor(x.at) : null }));
    const st = zoom && (zoom.stations || []).map(s => s.level).filter(Boolean);
    this.ensure(); const box = el('div', { class: 'ops-level', title: 'Level of explanation' }); this.layer.append(box);
    this.lv = { L, box, cur: l.level ? Math.max(0, L.findIndex(x => x.name.toLowerCase() === String(l.level).toLowerCase())) : 0, fixed: !!l.level && !zoom, anchor: zoom && zoom.anchor ? this.actor(zoom.anchor) : null, ghost: null, t: 0, st };
  }
  updateLevels(dt) {
    const Lv = this.lv, v = this.v, cam = v.camera, bx = Lv._b || (Lv._b = new THREE.Box3()); Lv.t += dt;
    if (!Lv.fixed && (!Lv._ct || Lv.t - Lv._ct > .2)) { Lv._ct = Lv.t; let cur = 0;
      Lv.L.forEach((x, i) => { if (!x.a || !x.a.obj) return; this.boxOf(x.a.obj, bx); if (bx.isEmpty()) return; const r = Math.max(.01, bx.getSize(this._q).length() * .5), dd = cam.position.distanceTo(bx.getCenter(this._p)); if (dd < r * 4.2) cur = Math.max(cur, i); });
      // the zoom's own target counts as reached once the dolly is near its end (an actor drawn as a crowd has no single box)
      const Z = v.dir.zoom; if (Z && Z.a && Z.d <= Z.d1 * 1.6) { const k = Lv.L.findIndex(x => x.a && (x.a === Z.a || x.a.obj === Z.a.obj || x.a.name === Z.a.name)); if (k >= 0) cur = Math.max(cur, k); }
      Lv.cur = cur; }
    // the landmark: a ghost while the camera is near or inside it (hysteresis: on at 1.15 ×, off at 1.5 × its box)
    if (Lv.anchor && Lv.anchor.obj) { this.boxOf(Lv.anchor.obj, bx); const c = bx.getCenter(this._p), r = bx.getSize(this._q).length() * .5, dd = cam.position.distanceTo(c); const want = Lv.ghost ? dd < r * 1.5 : dd < r * 1.15; if (want && !Lv.ghost) this.ghost(Lv, true); else if (!want && Lv.ghost) this.ghost(Lv, false); }
    const html = Lv.L.map((x, i) => `<i${i === Lv.cur ? ' class="now"' : ''}>${esc(x.name)}</i>`).join('<s>▸</s>') + (Lv.ghost ? `<em>in: ${esc(short(Lv.anchor).split(' (')[0])}</em>` : '');
    if (Lv.box._h !== html) { Lv.box._h = html; Lv.box.innerHTML = html; Lv.box._w = 0; }
    if (!Lv.box._w) { Lv.box._w = Lv.box.offsetWidth || 200; Lv.box._hh = Lv.box.offsetHeight || 22; }
    const w = innerWidth, h = innerHeight, fr = v.dir.freeFrame(w); let x = Math.max(fr[0] + 18, 12), y = h - 96 - 36 - Lv.box._hh;
    if (w < 760) { x = 10; y = 64; }
    const bel = v.dir.beat && v.dir.beat.el, HR = this.hud().filter(r => !(bel && bel.isConnected && (() => { const q = bel.getBoundingClientRect(); return Math.abs(q.left - 8 - r[0]) < 1 && Math.abs(q.top - 8 - r[1]) < 1; })()));   /* the callout steps round the indicator (director), not the other way */
    for (let k = 0; k < 10 && this.hits(x, y, Lv.box._w, Lv.box._hh, HR); k++) y -= 28;
    const tf = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; if (Lv.box._tf !== tf) { Lv.box._tf = tf; Lv.box.style.transform = tf; }
  }
  ghost(Lv, on) {
    const a = Lv.anchor, keep = new Set(); this.v.ds.actors.forEach(x => { if (x !== a && x.obj) { let inside = false; for (let q = x.obj.parent; q; q = q.parent) if (q === a.obj) inside = true; if (inside) x.obj.traverse(o => keep.add(o)); } });
    if (on) { Lv.ghost = []; a.obj.traverse(m => { if (!m.isMesh || m.userData.isInk || keep.has(m) || m.userData._peelMat || m.userData._povMat) return; const ms = [].concat(m.material); if (ms.some(x => x.transparent && x.opacity < .6)) return; m.userData._lvMat = m.material; const k = ms.map(x => { const c = cloneMat(x); c.transparent = true; c.opacity = .16; c.depthWrite = false; return c; }); m.material = Array.isArray(m.material) ? k : k[0]; Lv.ghost.push(m); }); }
    else { (Lv.ghost || []).forEach(m => { if (!m.userData._lvMat) return; [].concat(m.material).forEach(x => x.dispose()); m.material = m.userData._lvMat; delete m.userData._lvMat; }); Lv.ghost = null; }
  }
  endLevels() { const Lv = this.lv; if (!Lv) return; if (Lv.ghost) this.ghost(Lv, false); Lv.box.remove(); this.lv = null; }
}
