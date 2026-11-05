// Explainer cues for the diorama director (docs/research/explainer-animation.md, specs S1–S3 and the badge part of S5).
//  chain    a progressive causal-path cue: a highlight "front" travels link by link along the actors a lesson names, in the
//           order of cause, each link keeps a numbered badge (Boucheix et al. 2013; Hegarty 1992)
//  isolate  focus + context: everything outside the subject is desaturated and dimmed, never the HTML layer
//  peel     ordered layer reveal (ghost, lift or clip), one named layer at a time, restored in reverse
// Rendering: one screen-space pass (FocusPass) placed just before the grade pass through gfx.addPass. When a cue is on it
// renders a half-resolution focus mask (R = chain weight, G = isolate subject, B = background) depth-tested against the
// opaque context, so occluded links never glow through and no material is cloned for chain or isolate. Only peel clones
// materials, and every clone keeps the card → real patch (cloneMat).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { el, clamp, mathHTML } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// layers of the mask renders: context and scenery keep their own face culling (a BackSide sky cylinder seen from outside
// must not cover the model), so each comes in three sides: + 0 front, + 1 back, + 2 double
const L_ISO = 20, L_PAST = 21, L_FRONT = 22, L_BG = 24, L_CTX = 27;
const BITS = (1 << L_ISO) | (1 << L_PAST) | (1 << L_FRONT) | (0b111 << L_BG) | (0b111 << L_CTX);
const SIDE = m => m && m.side === THREE.BackSide ? 1 : m && m.side === THREE.DoubleSide ? 2 : 0;
const NS = 'http://www.w3.org/2000/svg';
const smoother = x => x * x * x * (x * (x * 6 - 15) + 10);
const BIG_RE = /sky|backdrop|ground|meadow|plinth|floor|hill|cloud|haze|terrain|sea|ocean|stars|lake|valley|table|desk/i;

// Material.clone() does not carry onBeforeCompile or an instance customProgramCacheKey over (three.js r170): a plain
// clone would silently drop the card → real patch of materialize.js. Re-attach both (userData, and with it
// frontPatched, is copied by clone()).
export function cloneMat(m) {
  const k = m.clone();
  k.onBeforeCompile = m.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) k.customProgramCacheKey = m.customProgramCacheKey;
  return k;
}

// ---------------------------------------------------------------- the screen-space pass
const MASK_VS = `#include <common>
#include <batching_pars_vertex>
void main(){
#include <batching_vertex>
#include <begin_vertex>
#include <project_vertex>
}`;
const maskMat = (r, g, b, max, side = THREE.DoubleSide) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Vector3(r, g, b) } }, vertexShader: MASK_VS, fragmentShader: 'uniform vec3 uC;void main(){gl_FragColor=vec4(uC,1.);}',
  side, depthTest: true, depthWrite: true, toneMapped: false,
  blending: max ? THREE.CustomBlending : THREE.NoBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor
});
const COMPOSITE = {
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse,tMask;uniform float uIso,uChain,uVig,uMaskOn;uniform vec3 uAccent;varying vec2 vUv;
  void main(){vec4 c=texture2D(tDiffuse,vUv);
   if(uMaskOn>.5){vec4 m=texture2D(tMask,vUv);float l=dot(c.rgb,vec3(.2126,.7152,.0722));
    float ctx=(1.-m.g)*uIso;float val=mix(.65,.85,m.b),sat=mix(.25,.7,m.b);
    c.rgb=mix(c.rgb,mix(vec3(l),c.rgb,sat)*val,ctx);
    c.rgb=mix(c.rgb,c.rgb+uAccent*.55,m.r*uChain);}
   if(uVig>0.){vec2 d=vUv-.5;c.rgb*=1.-uVig*smoothstep(.2,.62,length(d*vec2(1.25,1.)));}
   gl_FragColor=c;}`
};
export class FocusPass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null }, tMask: { value: null }, uIso: { value: 0 }, uChain: { value: 0 }, uVig: { value: 0 }, uMaskOn: { value: 0 }, uAccent: { value: new THREE.Color(1, .851, .541) } };
    this.fsQuad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: COMPOSITE.vertexShader, fragmentShader: COMPOSITE.fragmentShader, depthTest: false, depthWrite: false }));
    this.maskRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.uniforms.tMask.value = this.maskRT.texture;
    const sides = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide];
    this.mats = [...sides.map((sd, i) => [L_BG + i, maskMat(0, 0, 1, false, sd)]), ...sides.map((sd, i) => [L_CTX + i, maskMat(0, 0, 0, false, sd)]), [L_ISO, maskMat(0, 1, 0, true)], [L_PAST, maskMat(.4, 0, 0, true)], [L_FRONT, maskMat(1, 0, 0, true)]];
    this.counts = {}; this.scene = null; this.camera = null; this._cc = new THREE.Color(); this.enabled = false; this.maskMs = 0;
  }
  setSize(w, h) { this.maskRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }   // the focus mask at half resolution
  renderMask(r) {
    const sc = this.scene, cam = this.camera, bg = sc.background, fog = sc.fog, ov = sc.overrideMaterial, lm = cam.layers.mask, au = r.shadowMap.autoUpdate, ac = r.autoClear, ca = r.getClearAlpha();
    r.getClearColor(this._cc); sc.background = null; sc.fog = null; r.shadowMap.autoUpdate = false; r.autoClear = false;
    r.setRenderTarget(this.maskRT); r.setClearColor(0x0000ff, 0); r.clear(true, true, false);
    for (let i = 0; i < this.mats.length; i++) { const L = this.mats[i][0]; if (!this.counts[L]) continue; cam.layers.mask = 1 << L; sc.overrideMaterial = this.mats[i][1]; r.render(sc, cam); }
    sc.overrideMaterial = ov; sc.background = bg; sc.fog = fog; cam.layers.mask = lm; r.shadowMap.autoUpdate = au; r.autoClear = ac; r.setClearColor(this._cc, ca);
  }
  render(r, writeBuffer, readBuffer) {
    const U = this.uniforms, on = (U.uIso.value > .002 || U.uChain.value > .002) && this.scene && this.camera;
    if (on) { const t0 = performance.now(); this.renderMask(r); this.maskMs = performance.now() - t0; }
    U.uMaskOn.value = on ? 1 : 0; U.tDiffuse.value = readBuffer.texture;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); if (this.clear) r.clear(); this.fsQuad.render(r);
  }
  dispose() { this.maskRT.dispose(); this.fsQuad.material.dispose(); this.fsQuad.dispose(); this.mats.forEach(m => m[1].dispose()); }
}

// ---------------------------------------------------------------- the cues controller (one per diorama view)
export class Cues {
  constructor(view) {
    this.v = view; this.iso = { set: [], w: 0, goal: 0 }; this.chain = null; this.peel = null; this.vig = 0; this.vigGoal = 0;
    this.pass = new FocusPass(); this.pass.scene = view.scene; this.pass.camera = view.camera;
    const g = view.gfx; this.unhook = g.addPass ? g.addPass(this.pass) : (() => { const P = g.composer.passes, i = P.indexOf(g.grade); g.composer.insertPass(this.pass, i < 0 ? P.length : i); return () => g.composer.removePass(this.pass); })();
    this.layer = el('div', { class: 'cues' }); view.ui.append(this.layer);
    this.svg = document.createElementNS(NS, 'svg'); this.svg.setAttribute('class', 'cue-svg'); this.layer.append(this.svg);
    this.svg.innerHTML = '<defs><marker id="cue-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd98a"/></marker></defs>';
    this.flow = document.createElementNS(NS, 'path'); this.flow.setAttribute('class', 'cue-flow'); this.flow.setAttribute('marker-end', 'url(#cue-ah)'); this.svg.append(this.flow);
    this.chip = el('div', { class: 'cue-step', hidden: true }); this.layer.append(this.chip);
    this.meshes = []; this.memo = new Map(); this.gatherT = 0; this._w0 = null; this._q = V3(); this._q2 = V3(); this.log = [];
  }
  get active() { return this.v.dir && this.v.dir.cinematic && this.v.stage === 'explore'; }
  // a step may play only once its instruction has been read, the cut has settled and any zoom has arrived
  ready() { const v = this.v, d = v.dir; return v.running != null && this.active && d.timeScale > .05 && !(d.beat && d.beat.kind === 'lesson') && !d.busy(); }
  // ---------- mask membership ----------
  meshesOf(a) { if (!a || !a.obj) return []; let m = this.memo.get(a.obj); if (!m) { m = []; a.obj.traverse(o => { if (o.isMesh && !o.userData.isInk) m.push(o); }); this.memo.set(a.obj, m); } return m; }
  gather() {
    const ds = this.v.ds, R = ds.orb ? ds.orb.r : 10, out = []; this.memo.clear();
    [ds.world, ds.extras].forEach(g => g.traverse(o => {
      if (!o.isMesh || o.userData.isInk || o.isLine || o.isPoints || o.isSprite) return;
      const ms = [].concat(o.material), see = ms.some(m => m && (m.transparent || m.opacity < .99 || m.transmission > 0 || m.visible === false));
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() : 0;
      o.userData._cueBase = see ? 0 : 1 << (((s * 2 > R * 1.6 || BIG_RE.test((o.name || '') + ' ' + (o.parent && o.parent.name || ''))) ? L_BG : L_CTX) + SIDE(ms[0]));
      out.push(o);
    }));
    this.meshes = out; this._w0 = ds.world.children[0] || null; this._wn = ds.world.children.length; this.dirty = true;
  }
  stale() { const w = this.v.ds.world; return w.children[0] !== this._w0 || w.children.length !== this._wn; }
  applyLayers() {
    const C = this.chain, peeled = this.peel ? this.peel.meshSet : null, cnt = {}; [L_ISO, L_PAST, L_FRONT, L_BG, L_BG + 1, L_BG + 2, L_CTX, L_CTX + 1, L_CTX + 2].forEach(L => { cnt[L] = 0; });
    const extra = new Map(), add = (a, L) => this.meshesOf(a).forEach(m => extra.set(m, (extra.get(m) || 0) | (1 << L)));
    if (this.iso.goal > 0 || this.iso.w > 0) this.iso.set.forEach(a => add(a, L_ISO));
    if (C) { C.passed.forEach(a => add(a, L_PAST)); if (C.front) add(C.front, L_FRONT); }
    for (const m of this.meshes) {
      let b = m.userData._cueBase || 0; const x = extra.get(m); if (x) { b = x; } if (peeled && peeled.has(m)) b &= ~(0b111 << L_CTX);
      m.layers.mask = (m.layers.mask & ~BITS) | b;
      for (const L in cnt) if (b & (1 << L)) cnt[L]++;
    }
    extra.forEach((b, m) => { if (!m.userData._cueBase && m.userData._cueBase !== 0) { m.layers.mask = (m.layers.mask & ~BITS) | b; for (const L in cnt) if (b & (1 << L)) cnt[L]++; } });   // meshes made after the last gather
    this.pass.counts = cnt; this.dirty = false;
  }
  clearLayers() { for (const m of this.meshes) m.layers.mask &= ~BITS; this.pass.counts = {}; }
  // ---------- S2 isolate ----------
  setIsolate(actors) {
    const set = (actors || []).filter(Boolean);
    if (!set.length) { this.iso.goal = 0; return; }
    if (!this.meshes.length || this.stale()) this.gather();
    this.iso.set = set; this.iso.goal = 1; this.dirty = true;
  }
  // ---------- S1 chain ----------
  // links: [{a: actor, note}] in causal order; opts: {pace, on: event substring}
  startChain(links, opts = {}) {
    this.stopChain(); if (!links.length) return;
    if (!this.meshes.length || this.stale()) this.gather();
    const segs = []; for (let i = 0; i < links.length; i += 8) segs.push(links.slice(i, i + 8));   // > 8 links: consecutive segments, numbering continued
    this.chain = { links, n: links.length, segs, seg: 0, pass: 1, k: -1, t: 0, ft: 0, front: null, passed: [], on: opts.on ? String(opts.on).replace(/^event:/i, '').toLowerCase() : null, pace: clamp(+opts.pace || .9, .5, 2), w: 0, goal: 0, done: false, ev: false, badges: links.map((L, i) => { const b = el('div', { class: 'cue-badge', text: String(i + 1), hidden: true }); this.layer.append(b); return b; }) };
    this.log = []; this.dirty = true;
  }
  stopChain() { const C = this.chain; if (!C) return; C.badges.forEach(b => b.remove()); this.chain = null; this.chip.hidden = true; this.flow.setAttribute('d', ''); this.dirty = true; }
  chainEvent(ev) { const C = this.chain; if (!C || !C.on || C.done) return; const t = String(ev.text || '').toLowerCase(); if ((ev.id && ev.id.toLowerCase() === C.on) || t.includes(C.on)) { C.ev = true; C.evAt = performance.now(); } }
  advance() {
    const C = this.chain; C.t = 0; C.ev = false;
    let seg = C.segs[C.seg]; C.k++;
    if (C.k >= seg.length) {
      if (C.pass === 1) { C.pass = 2; C.k = 0; C.passed = []; }   // a second, quicker pass: cue loyalty drops after the first exposure
      else if (C.seg + 1 < C.segs.length) { C.seg++; seg = C.segs[C.seg]; C.pass = 1; C.k = 0; C.passed = []; }
      else { C.done = true; C.goal = 0; C.front = null; this.chip.hidden = true; this.flow.setAttribute('d', ''); this.dirty = true; return; }
    }
    C.goal = 1; const prev = C.front; if (prev && !C.passed.includes(prev)) C.passed.push(prev);
    const L = seg[C.k]; C.front = L.a; C.frontLink = L; C.ft = 0; C.prevLink = C.k > 0 ? seg[C.k - 1] : null;
    const gi = C.seg * 8 + C.k; C.gi = gi; C.badges[gi].hidden = false; C.badges[gi].classList.add('now');
    C.badges.forEach((b, i) => { if (i !== gi) b.classList.remove('now'); });
    this.chip.hidden = false; this.chip.innerHTML = `<b>Step ${gi + 1} of ${C.n}</b>` + (L.note ? ' · ' + mathHTML(String(L.note).split(/\s+/).slice(0, 6).join(' ')) : '');
    this.kicker(`Step ${gi + 1} of ${C.n}`);
    this.v.highlightPins && this.v.touchLabels && this.v.touchLabels([L.a]);
    this.log.push({ k: gi + 1, pass: C.pass, t: performance.now(), evAt: C.evAt || null, sim: this.v.ds.t });
    this.dirty = true;
  }
  // the current callout carries the k-of-n numbering too (S5.8)
  kicker(txt) { const b = this.v.dir && this.v.dir.beat, k = b && b.el && b.el.querySelector('.co-kicker'); if (!k) return; if (k.dataset.base == null) k.dataset.base = k.textContent.split(' · Step')[0].split(' · Layer')[0]; k.textContent = k.dataset.base + ' · ' + txt; }
  // ---------- S3 peel ----------
  // P: {layers:[actor], mode, order, dwell, restore}, host: the inner subject
  startPeel(P, host) {
    this.endPeel(true); const layers = (P.layers || []).filter(a => a && a.obj).slice(0, 6); if (!layers.length) return;
    const mode = ['ghost', 'lift', 'clip'].includes(P.mode) ? P.mode : 'ghost', ds = this.v.ds;
    ds.scene.updateMatrixWorld(true);
    const all = new THREE.Box3(); layers.forEach(a => all.expandByObject(a.obj)); if (host && host.obj) all.expandByObject(host.obj);
    const C0 = all.getCenter(V3());
    // a layer never takes the inner subject, nor another actor that sits inside it (the mercury column inside the
    // barometer case), with it: their meshes stay as they are
    const inside = (o, root) => { for (let q = o; q; q = q.parent) if (q === root) return true; return false; };
    const keep = new Set((host ? this.meshesOf(host) : []).concat(...ds.actors.filter(x => x.obj && !layers.some(l => l.obj === x.obj) && layers.some(l => inside(x.obj, l.obj))).map(x => this.meshesOf(x))));
    const L = layers.map((a, i) => {
      const bx = new THREE.Box3().setFromObject(a.obj), c = bx.getCenter(V3()), r = Math.max(.05, bx.getSize(V3()).length() * .5);
      const out = c.clone().sub(C0); out.y = Math.max(out.y, 0); if (out.lengthSq() < 1e-6) out.set(0, 1, 0); out.normalize();
      const meshes = this.meshesOf(a).filter(m => !keep.has(m) && ![].concat(m.material).some(x => x && (x.transmission > 0 || (x.transparent && x.opacity < .6))));   // thin-shell glass is already see-through: skip it
      return { a, i, c, r, out, meshes, k: 0, goal: 0, off: V3(), lastOff: V3(), ap: V3(), has: false, plane: new THREE.Plane(V3(1, 0, 0), 1e5), swapped: false };
    });
    this.peel = { L, n: L.length, mode, order: P.order === 'in-out' ? 'in-out' : 'out-in', dwell: Math.max(.8, +P.dwell || 2.2), restore: ['step', 'beat', 'never'].includes(P.restore) ? P.restore : 'step', host, idx: -1, t: 0, wait: 0, phase: 'run', meshSet: new Set(L.flatMap(l => l.meshes)), speed: 1 };
    this.peel.ord = this.peel.order === 'out-in' ? L : L.slice().reverse();
    if (this.peel.order === 'in-out') L.forEach(l => { l.k = l.goal = 1; this.swap(l, true); });   // build up: start from the bare inside
    if (!this.meshes.length || this.stale()) this.gather(); this.dirty = true;
  }
  swap(l, on) {
    const P = this.peel; if (on === l.swapped) return; l.swapped = on;
    if (P.mode === 'lift') return;
    if (on) {
      if (P.mode === 'clip') { this.v.gfx.renderer.localClippingEnabled = true; const U = this.v.ds.U; if (P.poche0 == null) { P.poche0 = U.uPoche.value; } U.uPoche.value = 1; }
      l.meshes.forEach(m => {
        m.userData._peelMat = m.material; m.userData._peelRO = m.renderOrder;
        const ms = [].concat(m.material).map(x => { const k = cloneMat(x); k.userData._op0 = x.opacity ?? 1;
          if (P.mode === 'ghost') { k.transparent = true; k.depthWrite = false; k.side = THREE.FrontSide; }
          else { k.clippingPlanes = [l.plane]; if (!k.transparent) k.side = THREE.DoubleSide; }
          return k; });
        m.material = Array.isArray(m.material) ? ms : ms[0];
        if (P.mode === 'ghost') {
          m.renderOrder = 10 + (P.n - l.i);
          if (m.geometry && m.geometry.attributes.position && m.geometry.attributes.position.count < 60000) {
            const ln = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), new THREE.LineBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0, depthWrite: false }));
            ln.userData.isInk = true; ln.raycast = () => { }; ln.renderOrder = 30; ln.name = 'peel edge'; m.add(ln); m.userData._peelLine = ln;
          }
        }
      });
    } else {
      l.meshes.forEach(m => {
        if (m.userData._peelMat) { [].concat(m.material).forEach(x => x.dispose()); m.material = m.userData._peelMat; delete m.userData._peelMat; m.renderOrder = m.userData._peelRO || 0; }
        const ln = m.userData._peelLine; if (ln) { m.remove(ln); ln.geometry.dispose(); ln.material.dispose(); delete m.userData._peelLine; }
      });
      if (P.mode === 'clip' && !P.L.some(x => x.swapped) && P.poche0 != null) { this.v.ds.U.uPoche.value = P.poche0; P.poche0 = null; }
    }
  }
  restorePeel() { const P = this.peel; if (!P || P.phase === 'restore') return; P.phase = 'restore'; P.speed = 2; P.t = 0; P.ri = 0; P.rorder = P.ord.slice().reverse(); }
  endPeel(now) { const P = this.peel; if (!P) return; if (now) { P.L.forEach(l => { this.unlift(l); this.swap(l, false); }); this.peel = null; this.dirty = true; } else this.restorePeel(); }
  unlift(l) { if (this.peel && this.peel.mode === 'lift' && l.has) { const p = l.a.obj.position; if (p.equals(l.ap)) p.sub(l.lastOff); l.lastOff.set(0, 0, 0); l.has = false; } }
  // before the simulation steps: take the lift offsets off again, so the model (and the edit tool's offsets) see their own positions
  preStep() { const P = this.peel; if (!P || P.mode !== 'lift') return; for (const l of P.L) { if (!l.has) continue; const p = l.a.obj.position; if (p.equals(l.ap)) p.sub(l.lastOff); l.has = false; } }
  layerBeat(l) {
    const P = this.peel, d = this.v.dir, a = l.a, nm = a.name.split(' · ')[0], idx = P.order === 'out-in' ? l.i : P.n - 1 - l.i;
    d.push({ kind: 'explain', kicker: `Layer ${idx + 1} of ${P.n}`, noShot: true, title: nm, text: (a.describe ? nm + ': ' + a.describe : nm), anchor: () => a.getPos(), focus: a.obj, host: a, names: [] });
    this.v.touchLabels && this.v.touchLabels([a]);
  }
  updatePeel(dt) {
    const P = this.peel; if (!P) return; const ord = P.ord;
    if (P.phase === 'run' && this.ready()) {
      P.t += dt;
      if (P.idx < 0 || P.t >= P.wait) {
        P.idx++;
        if (P.idx >= ord.length) {
          P.phase = 'held';
          if (P.order === 'out-in' && P.host) this.setIsolate([P.host].concat(this.iso.set.filter(a => a !== P.host)));   // after the last layer the inner subject is isolated
          if (P.restore === 'beat') { P.holdT = P.dwell; }
        } else { const l = ord[P.idx]; this.layerBeat(l); l.startAt = .4; P.t = 0; const d = this.v.dir; P.wait = Math.max(P.dwell, d.readTime(l.a.name + ' ' + (l.a.describe || ''))) + .4; P.cur = l; }
      }
      if (P.cur && P.t >= P.cur.startAt) { P.cur.goal = P.order === 'out-in' ? 1 : 0; }
    }
    if (P.phase === 'held' && P.holdT != null) { P.holdT -= dt; if (P.holdT <= 0) { P.holdT = null; this.restorePeel(); } }
    if (P.phase === 'restore') { P.t += dt; const k = Math.min(P.rorder.length, Math.floor(P.t / .45) + 1); for (let i = 0; i < k; i++) P.rorder[i].goal = 0; }
    // animate every layer toward its goal: ghost 0.8 s, lift 0.9 s, clip 1.2 s (restore at 2× speed)
    const dur = P.mode === 'ghost' ? .8 : P.mode === 'lift' ? .9 : 1.2, cam = this.v.camera;
    for (const l of P.L) {
      if (l.k !== l.goal) { l.k = l.goal > l.k ? Math.min(l.goal, l.k + dt * P.speed / dur) : Math.max(l.goal, l.k - dt * P.speed / dur); }
      if (l.k > 0) this.swap(l, true); else if (l.swapped) this.swap(l, false);
      const e = smoother(l.k);
      if (P.mode === 'ghost' && l.swapped) l.meshes.forEach(m => { [].concat(m.material).forEach(x => { x.opacity = x.userData._op0 + (.12 - x.userData._op0) * e; }); const ln = m.userData._peelLine; if (ln) ln.material.opacity = .5 * e; });
      else if (P.mode === 'clip' && l.swapped) { const n = this._q.copy(l.c).sub(cam.position); n.y = 0; if (n.lengthSq() < 1e-6) n.set(0, 0, -1); n.normalize(); l.plane.normal.copy(n); l.plane.constant = l.r * (1 - e) - n.dot(l.c) + 1e-4; }
      else if (P.mode === 'lift' && l.k > 0) { const p = l.a.obj.position; l.off.copy(l.out).multiplyScalar(1.2 * l.r * e); p.add(l.off); l.lastOff.copy(l.off); l.ap.copy(p); l.has = true; }
    }
    if (P.phase === 'restore' && P.L.every(l => l.k === 0)) { P.L.forEach(l => { this.unlift(l); this.swap(l, false); }); this.peel = null; this.dirty = true; }
  }
  // ---------- step lifecycle (engine) ----------
  endStep() {
    this.iso.goal = 0;
    if (this.chain) { this.chain.goal = 0; this.chain.done = true; this.chip.hidden = true; this.flow.setAttribute('d', ''); }   // badges stay until the next step: the scene keeps a record of the path
    if (this.peel && this.peel.restore === 'step') this.restorePeel();
  }
  reset() { this.stopChain(); this.endPeel(true); this.iso.goal = 0; this.iso.w = 0; this.iso.set = []; this.dirty = true; }
  // ---------- per frame (after the simulation step) ----------
  update(dt) {
    const v = this.v, d = v.dir, U = this.pass.uniforms;
    if (this.chain || this.iso.w > 0 || this.iso.goal > 0 || this.peel) { this.gatherT += dt; if (this.gatherT > .5) { this.gatherT = 0; if (this.stale()) { this.gather(); if (this.peel && !this.peel.L[0].a.obj.parent) this.peel = null; } } }
    // isolate: in 0.4 s, out 0.6 s; off while the learner holds the camera, in POV and outside instructed steps
    const isoGoal = this.iso.goal > 0 && this.active && v.running != null && !(d.hold > 0) && !v.pov && !d.dip ? 1 : 0;
    const w0 = this.iso.w; this.iso.w = isoGoal ? Math.min(1, w0 + dt / .4) : Math.max(0, w0 - dt / .6);
    if ((w0 > 0) !== (this.iso.w > 0)) this.dirty = true;
    // the subject of the beat on screen is never dimmed
    if (this.iso.w > 0 && d.beat && d.beat.host && !this.iso.set.includes(d.beat.host) && d.beat !== this._lastBeat) { this._lastBeat = d.beat; this.iso.set = this.iso.set.concat(d.beat.host); this.dirty = true; }
    // chain timeline
    const C = this.chain;
    if (C && !C.done && this.ready()) {
      C.t += dt; C.ft += dt; const pace = C.pace * (C.pass === 2 ? .6 : 1);
      if (C.k < 0) this.advance();
      else if (C.on && C.pass === 1 ? (C.ev || C.t > Math.max(6, pace * 5)) : C.t >= pace) this.advance();
      if (this.chain && this.chain.front && C.ft > .6 && !C.passed.includes(C.front)) { C.passed.push(C.front); this.dirty = true; }   // full weight for 0.6 s, then 0.4 like the links already passed
    }
    if (C) { const g = C.done ? 0 : C.goal; C.w += (g - C.w) * Math.min(1, dt * (g > C.w ? 6 : 2.5)); if (C.done && C.w < .01) C.w = 0; }
    if (this.peel) this.updatePeel(dt);
    if (this.dirty && (this.chain || this.iso.w > 0 || this.peel)) this.applyLayers(); else if (this.dirty && !this.chain && !this.peel && this.iso.w === 0) { this.clearLayers(); this.dirty = false; }
    // the comfort vignette (S6.2): ease in 0.2 s, out 0.5 s
    this.vig += (this.vigGoal - this.vig) * Math.min(1, dt / (this.vigGoal > this.vig ? .2 : .5));
    U.uIso.value = this.iso.w * this.iso.w * (3 - 2 * this.iso.w); U.uChain.value = C ? C.w : 0; U.uVig.value = this.vig < .005 ? 0 : this.vig;
    this.pass.enabled = U.uIso.value > .002 || U.uChain.value > .002 || U.uVig.value > 0;
    this.pass.camera = v.camera; this.pass.scene = v.scene;
    if (C) this.drawChain();
  }
  // badges on the links (pin style), kept apart from each other; the arrow between consecutive links while the front crosses
  drawChain() {
    const C = this.chain, cam = this.v.camera, w = innerWidth, h = innerHeight, q = this._q, placed = [];
    const order = []; C.badges.forEach((b, i) => { if (b.hidden) return; const p = C.links[i].a.getPos && C.links[i].a.getPos(); if (!p) { b.style.opacity = 0; return; } q.copy(p).project(cam); if (q.z > 1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) { b.style.opacity = 0; return; } order.push({ b, i, x: (q.x * .5 + .5) * w + 10, y: (-q.y * .5 + .5) * h - 26 }); });
    order.sort((a, b2) => a.y - b2.y);
    for (const o of order) {
      for (let k = 0; k < 6; k++) { const hit = placed.find(p => Math.abs(p.x - o.x) < 26 && Math.abs(p.y - o.y) < 26); if (!hit) break; o.y = hit.y + 27; }
      placed.push(o); const tf = `translate(${o.x.toFixed(0)}px,${o.y.toFixed(0)}px)`; if (o.b._tf !== tf) { o.b._tf = tf; o.b.style.transform = tf; } o.b.style.opacity = '';
      if (o.i === C.gi && !this.chip.hidden) { const cx = Math.min(w - 260, o.x + 30), tc = `translate(${cx.toFixed(0)}px,${(o.y - 2).toFixed(0)}px)`; if (this.chip._tf !== tc) { this.chip._tf = tc; this.chip.style.transform = tc; } }
    }
    C.rects = placed.map(p => [p.x, p.y, 22, 22]);
    // the flow arrow from the link just left to the link reached, while the front crosses (one pace)
    const pace = C.pace * (C.pass === 2 ? .6 : 1);
    if (!C.done && C.prevLink && C.ft < pace) {
      const a = C.prevLink.a.getPos && C.prevLink.a.getPos(), b = C.frontLink.a.getPos && C.frontLink.a.getPos();
      if (a && b) { const A = this._q.copy(a).project(cam), ax = (A.x * .5 + .5) * w, ay = (-A.y * .5 + .5) * h, B = this._q2.copy(b).project(cam), bx = (B.x * .5 + .5) * w, by = (-B.y * .5 + .5) * h;
        if (A.z < 1 && B.z < 1 && Math.hypot(bx - ax, by - ay) > 24) { const g = Math.min(1, C.ft / (pace * .6)), ex = ax + (bx - ax) * g, ey = ay + (by - ay) * g, nx = -(by - ay) * .16, ny = (bx - ax) * .16; this.flow.setAttribute('d', `M${ax.toFixed(0)} ${ay.toFixed(0)} Q ${((ax + ex) / 2 + nx).toFixed(0)} ${((ay + ey) / 2 + ny).toFixed(0)} ${ex.toFixed(0)} ${ey.toFixed(0)}`); } else this.flow.setAttribute('d', ''); }
    } else if (this.flow.getAttribute('d')) this.flow.setAttribute('d', '');
  }
  dispose() {
    this.reset(); this.clearLayers(); this.layer.remove();
    try { this.unhook && this.unhook(); } catch (e) { }
    this.pass.dispose();
  }
}
