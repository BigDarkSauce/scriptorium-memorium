// Builds a diorama scene (no UI): environment + bodies/model + code API + behaviours + user edits.
// Used both by the interactive runtime (engine.js) and the off-screen sketch renderer (scroll images, pedestal minis).
import * as THREE from 'three';
import { DIO, HELPERS } from './models.js';
import { buildBody, buildShape } from './builder.js';
import { setupEnvironment } from './environments.js';
import { makeMaterial } from '../gfx/materials.js';
import { makeFrontUniforms, patchTree } from '../gfx/materialize.js';
import { clamp, fmt, lerp, compile, hashStr, mulberry, makeNoise } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const isSceneSpec = s => s && (s.type === 'scene' || Array.isArray(s.bodies));

export function defaultParams(spec) {
  if (isSceneSpec(spec)) { const o = {}; (spec.params || []).forEach(p => { o[p.key] = p; }); return o; }
  const def = DIO[spec.type]; return def ? def.params : {};
}

export class DioramaScene {
  constructor(gfx, spec, { headless = false } = {}) {
    this.gfx = gfx; this.spec = spec; this.headless = headless;
    this.scene = new THREE.Scene(); this.world = new THREE.Group(); this.world.name = 'world'; this.scene.add(this.world);
    this.extras = new THREE.Group(); this.extras.name = 'added objects'; this.scene.add(this.extras);
    this.U = makeFrontUniforms();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 400);
    this.t = 0; this.playing = true; this.speed = 1; this.series = []; this.seriesName = '';
    this.actors = []; this.labelsDirty = true; this.events = []; this.listeners = { event: [] };
    this.orb = { th: .5, ph: 1.12, r: 15, target: V3(0, 2.2, 0) };
    this.env = setupEnvironment(this.scene, gfx, isSceneSpec(spec) ? (spec.environment || {}) : (spec.environment || { preset: 'studio', glassCase: !!spec.dome }));
    this.mats = { chrome: makeMaterial('chrome'), brass: makeMaterial('brass'), wood: makeMaterial('wood'), lapis: makeMaterial({ preset: 'plastic', color: '#2d5b8e', roughness: .25 }), rubric: makeMaterial({ preset: 'plastic', color: '#9c3a28', roughness: .3 }), ivory: makeMaterial({ preset: 'ceramic', color: '#eee2c8' }), iron: makeMaterial('iron'), glass: makeMaterial('glass') };
    this.initParams(); this.build();
  }
  initParams() {
    const spec = this.spec; this.p = {}; this.ranges = {};
    const ro = spec.ranges || {};
    if (isSceneSpec(spec)) {
      (spec.params || []).forEach(q => { const r = ro[q.key] || [q.min, q.max]; this.ranges[q.key] = [+r[0], +r[1], +q.value, q.unit || '', q.label || q.key, q.step]; this.p[q.key] = clamp(+(spec.values && spec.values[q.key] != null ? spec.values[q.key] : q.value), +r[0], +r[1]); });
    } else {
      const def = DIO[spec.type]; if (!def) throw new Error('Unknown diorama type "' + spec.type + '"');
      for (const k in def.params) { const r = ro[k]; const d = def.params[k]; this.ranges[k] = r && +r[1] > +r[0] ? [+r[0], +r[1], d[2], d[3], d[4]] : d; this.p[k] = clamp(d[2], this.ranges[k][0], this.ranges[k][1]); }
      const sp = spec.params || {}; for (const k in sp) { if (this.ranges[k]) { const v = Array.isArray(sp[k]) ? +sp[k][2] : +sp[k]; if (isFinite(v)) this.p[k] = clamp(v, this.ranges[k][0], this.ranges[k][1]); } }
    }
  }
  // ---------- building ----------
  build() {
    this.world.clear(); this.extras.clear(); this.actors = []; this.series = []; this.t = 0; this.hooks = { step: [], frame: [], reads: [], series: null, click: null }; this.behaviors = [];
    const spec = this.spec;
    if (isSceneSpec(spec)) this.buildScene(); else this.buildModel();
    (spec.additions || []).forEach(b => { try { const o = buildBody(b, this.bodyCtx()); o.userData.added = true; this.extras.add(o); if (b.role === 'actor') this.addActor(o.userData.label, () => this.centerOf(o), o, b.describe); } catch (e) { console.warn(e); } });
    this.applyOverrides();
    patchTree(this.scene, this.U);
    this.world.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
    this.computeBounds();
    if (isSceneSpec(spec) && !(spec.camera && spec.camera.r) && !this._camSet) { this.orb.r = Math.max(8, this.radius * 2.35); this.orb.target.copy(this.center).setY(Math.max(1, this.center.y * .8)); }
    this._camSet = true;
  }
  bodyCtx() { return { seedOf: id => hashStr(String(id)), params: this.p }; }
  addActor(name, getPos, obj, describe = '', id) { if (!name) return; if (this.actors.some(a => a.name === name)) return; this.actors.push({ name, getPos, obj, describe, id: id || name }); }
  centerOf(o) { const b = new THREE.Box3().setFromObject(o); return b.isEmpty() ? o.getWorldPosition(V3()) : b.getCenter(V3()); }
  buildModel() {
    const self = this, spec = this.spec, def = DIO[spec.type];
    const D = {
      get world() { return self.world; }, get scene() { return self.scene; }, mats: this.mats, spec, p: this.p, ranges: this.ranges,
      get t() { return self.t; }, get playing() { return self.playing; }, get speed() { return self.speed; }, orb: this.orb, cam: this.camera,
      label: (text, getPos, sym, obj) => { if (sym && sym.isObject3D) { obj = sym; sym = false; } if (!sym) self.addActor(text, () => { try { return getPos(); } catch (e) { return null; } }, obj); else self.symbols = (self.symbols || []).concat([{ text, getPos }]); return {}; },
      event: (text, pos, color, o) => { if (color && typeof color === 'object' && !color.isColor) { o = color; color = o.color; } return self.fire(text, pos, color, o && o.id, o && o.sound); },
      push: v => self.push(v), set seriesName(v) { self.seriesName = v; }, get seriesName() { return self.seriesName; }
    };
    this.D = D; this.sim = def.build(D, this.p);
    if (this.sim.orbit) Object.assign(this.orb, this.sim.orbit);
  }
  buildScene() {
    const spec = this.spec, ctx = this.bodyCtx(); this.bodyMap = new Map();
    const pending = (spec.bodies || []).slice();
    for (const b of pending) {
      try {
        const o = buildBody(b, ctx); this.bodyMap.set(b.id, o);
        const parent = b.parent && this.bodyMap.get(b.parent); (parent || this.world).add(o);
      } catch (e) { console.warn('body', b.id, e); }
    }
    const order = (spec.tour && spec.tour.length ? spec.tour : (spec.bodies || []).filter(b => b.role === 'actor').map(b => b.id));
    order.forEach(id => { const o = this.bodyMap.get(id); if (o) this.addActor(o.userData.label, () => this.centerOf(o), o, o.userData.describe, id); });
    // behaviours
    const vars = ['t', ...Object.keys(this.p)];
    (spec.behaviors || []).forEach(bh => {
      const targets = this.resolveTargets(bh.target); if (!targets.length) return;
      const ex = k => { try { return compile(bh[k] ?? (k === 'amount' ? 1 : k === 'speed' ? 1 : 0), vars); } catch (e) { return () => 0; } };
      this.behaviors.push({ type: bh.type, axis: bh.axis || 'y', targets: targets.map(o => ({ o, p0: o.position.clone(), r0: o.rotation.clone(), s0: o.scale.clone() })), amount: ex('amount'), speed: ex('speed'), phase: Math.random() * 6, center: bh.center, color: bh.color });
    });
    // code: dynamics written against the scene API
    if (spec.code) {
      const api = this.makeAPI();
      new Function('api', '"use strict";\n' + spec.code)(api);
    }
    if (spec.camera && spec.camera.target) this.orb.target.set(...spec.camera.target);
  }
  resolveTargets(sel) {
    if (!sel) return [];
    const list = [].concat(sel), out = [];
    list.forEach(s => {
      s = String(s);
      if (s.startsWith('kind:')) { const k = s.slice(5); (this.spec.bodies || []).forEach(b => { if ((b.shape && b.shape.kind) === k) { const o = this.bodyMap.get(b.id); if (o) out.push(o); } }); }
      else if (s.endsWith('*')) { const pre = s.slice(0, -1); this.bodyMap.forEach((o, id) => { if (id.startsWith(pre)) out.push(o); }); }
      else { const o = this.bodyMap.get(s); if (o) out.push(o); }
    });
    return out;
  }
  makeAPI() {
    const self = this, ctx = this.bodyCtx();
    const api = {
      THREE, V3, world: this.world, scene: this.scene, mats: this.mats, p: this.p, fmt, clamp, lerp, noise: makeNoise(7), rand: mulberry(11),
      body: id => self.bodyMap.get(id), bodies: () => [...self.bodyMap.values()],
      param: k => self.p[k], set: (k, v) => { if (k in self.p) self.p[k] = clamp(+v, self.ranges[k][0], self.ranges[k][1]); },
      material: m => makeMaterial(m), shape: (s, m) => buildShape(s, m, ctx),
      spawn: (b, parent) => { const o = buildBody(Object.assign({ id: 'spawn' + Math.random().toString(36).slice(2, 7) }, b), ctx); patchTree(o, self.U); (parent || self.world).add(o); return o; },
      remove: o => { if (o) o.removeFromParent(); },
      label: (text, f, describe) => self.addActor(text, () => { try { return f(); } catch (e) { return null; } }, null, describe),
      event: (text, pos, opts = {}) => self.fire(text, pos, opts.color, opts.id, opts.sound),
      onStep: f => self.hooks.step.push(f), onFrame: f => self.hooks.frame.push(f),
      readout: (n, f) => self.hooks.reads.push([n, f]), plot: (n, f) => { self.seriesName = n; self.hooks.series = f; },
      onClick: f => { self.hooks.click = f; }, camera: o => (self._camSet = true, Object.assign(self.orb, o.target ? { ...o, target: Array.isArray(o.target) ? V3(...o.target) : o.target } : o)),
      time: () => self.t, trail: HELPERS.trail, lineFrom: HELPERS.lineFrom, ball: HELPERS.ball, box: HELPERS.box, cyl: HELPERS.cyl
    };
    return api;
  }
  // ---------- user edits (any diorama type): hide / remove / move / replace / add ----------
  pathOf(o) { // stable id for objects of built-in models and code-made scenes
    if (o.userData.bodyId) return 'b:' + o.userData.bodyId;
    if (o.userData.added) return 'a:' + this.extras.children.indexOf(o);
    return 'w:' + this.world.children.indexOf(o);
  }
  objectByPath(path) {
    const [k, v] = [path.slice(0, 1), path.slice(2)];
    if (k === 'b') return this.bodyMap ? this.bodyMap.get(v) : null;
    if (k === 'a') return this.extras.children[+v];
    return this.world.children[+v];
  }
  applyOverrides() {
    const ov = (!isSceneSpec(this.spec) && this.spec.ovV !== 2 ? null : this.spec.overrides) || {}; this.ovList = [];   // edits saved for the pre-v4 model graphs are ignored
    for (const path in ov) {
      const o = this.objectByPath(path), e = ov[path]; if (!o) continue;
      if (e.removed) { o.removeFromParent(); continue; }
      if (e.hidden) o.userData.hiddenByUser = true;
      if (e.rotation) o.rotation.set(...e.rotation.map(d => d * Math.PI / 180));
      if (e.scale) o.scale.set(...e.scale);
      let rep = null;
      if (e.replace) { try { rep = buildShape(e.replace.shape || { kind: 'box' }, e.replace.material || {}, this.bodyCtx()); const g = new THREE.Group(); g.add(rep); rep = g; rep.name = (e.replace.shape && e.replace.shape.kind) + ' (replacement)'; (o.parent || this.world).add(rep); o.userData.replacedBy = rep; rep.userData.replaces = path; } catch (err) { } }
      this.ovList.push({ o, e, rep, off: e.offset ? V3(...e.offset) : null, applied: null });
    }
  }
  postFrame() {
    for (const it of this.ovList || []) {
      const { o, e, rep, off } = it;
      if (off) { if (!it.applied || !o.position.equals(it.applied)) { o.position.add(off); it.applied = o.position.clone(); } }
      if (e.hidden || rep) o.visible = false;
      if (rep) { rep.position.copy(o.position); rep.quaternion.copy(o.quaternion); rep.scale.copy(o.scale); rep.visible = !e.hidden; }
    }
  }
  // ---------- running ----------
  fire(text, pos, color = 0xffd27a, id, sound) {
    const ev = { t: this.t, text: String(text), pos: pos ? pos.clone() : null, color, id: id || null, sound: sound || null };   // sound: a name for sfx.play (the engine plays it)
    this.events.push(ev); if (this.events.length > 200) this.events.shift();
    this.listeners.event.forEach(f => f(ev));
  }
  push(v) { this.series.push(v); if (this.series.length > 300) this.series.shift(); }
  step(dt) {
    const h = dt * this.speed;
    if (this.playing && h > 0) {
      const n = Math.max(1, Math.ceil(h / (1 / 480)));
      for (let i = 0; i < n; i++) { const hh = h / n; if (this.sim) this.sim.step(hh); for (const f of this.hooks.step) f(hh, this.t); this.t += hh; }
    }
    if (this.sim && this.sim.visual) this.sim.visual(this.playing ? dt : 0);
    for (const f of this.hooks.frame) f(this.playing ? dt * this.speed : 0, this.t);
    if (this.hooks.series) { const v = +this.hooks.series(); if (isFinite(v)) this.push(v); }
    this.runBehaviors();
    this.env.update(this.t, this.p, dt);
    this.postFrame();
    this.world.traverse(o => { if (o.userData.hiddenByUser) o.visible = false; });
  }
  runBehaviors() {
    const t = this.t, pv = Object.values(this.p);
    for (const b of this.behaviors) {
      const A = b.amount(t, ...pv), S = b.speed(t, ...pv);
      b.targets.forEach(({ o, p0, r0, s0 }, i) => {
        const ph = b.phase + i * .7;
        switch (b.type) {
          case 'sway': o.rotation.z = r0.z + Math.sin(t * S * 2 + ph) * A * .08; o.rotation.x = r0.x + Math.cos(t * S * 1.6 + ph) * A * .04; break;
          case 'spin': o.rotation[b.axis] = r0[b.axis] + t * S; break;
          case 'bob': o.position.y = p0.y + Math.sin(t * S * 2 + ph) * A; break;
          case 'orbit': { const c = b.center ? V3(...b.center) : V3(0, p0.y, 0), r = Math.hypot(p0.x - c.x, p0.z - c.z), a0 = Math.atan2(p0.z - c.z, p0.x - c.x); o.position.set(c.x + r * Math.cos(a0 + t * S), p0.y, c.z + r * Math.sin(a0 + t * S)); break; }
          case 'pulse': o.scale.copy(s0).multiplyScalar(1 + Math.sin(t * S * 2 + ph) * A * .1); break;
          case 'scale': o.scale.set(s0.x, Math.max(.001, s0.y * A), s0.z); break;
          case 'move': o.position[b.axis] = p0[b.axis] + A; break;
          case 'glow': o.traverse(m => { if (m.material && m.material.emissive) { m.material.emissiveIntensity = Math.max(0, A); if (b.color) m.material.emissive.set(b.color); } }); break;
          case 'visible': o.visible = A > .5; break;
          case 'opacity': o.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = clamp(A, 0, 1); } }); break;
        }
      });
    }
  }
  readouts() {
    let r = [];
    if (this.sim && this.sim.readouts) { try { r = this.sim.readouts(); } catch (e) { r = []; } }
    for (const [n, f] of this.hooks.reads) { let v; try { v = f(); } catch (e) { v = '—'; } r.push([n, typeof v === 'number' ? fmt(v) : String(v)]); }
    return r;
  }
  computeBounds() {
    const b = new THREE.Box3();
    [this.world, this.extras].forEach(g => g.traverse(o => { if (o.isMesh && o.visible && !o.userData.isInk && o.geometry) { const bb = new THREE.Box3().setFromObject(o); if (isFinite(bb.min.x) && bb.max.distanceTo(bb.min) < 200) b.union(bb); } }));
    if (b.isEmpty()) b.set(V3(-5, 0, -5), V3(5, 5, 5));
    this.bounds = b; this.center = b.getCenter(V3()); this.radius = Math.max(2, b.getSize(V3()).length() * .5);
  }
  overviewKey() {
    const o = this.orb, dir = V3(Math.sin(o.ph) * Math.sin(o.th), Math.cos(o.ph), Math.sin(o.ph) * Math.cos(o.th)).normalize();
    const fov = 40, dist = o.r, frameH = 2 * dist * Math.tan(fov * Math.PI / 360);
    return { target: o.target.clone(), dir, fov, frameH };
  }
  rebuildKeepView() { const keep = this.p; this.build(); }
  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { for (const k in m) if (m[k] && m[k].isTexture && !m[k].userData?.shared) { } m.dispose(); }); });
  }
}
