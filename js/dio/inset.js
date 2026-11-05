// S10 · the "you are here" inset (docs/research/explainer-animation.md §4.7, S10): during a zoom (S4), a track ride (S9),
// a POV ride (S6) and a deep close-up in a running step, a small PASSIVE overview of the whole diorama sits in a free
// corner of the frame, with a dot and a view wedge where the main camera is, the zoom target ring or the ride's rail.
// Worlds in miniature (Stoakley, Conway & Pausch 1995): an overview helps orientation; Hornbæk et al. (2002): 80 % prefer
// one, but switching between views costs time, so it has no controls, appears only while the main view has lost the
// overview, and fades out 2 s after the shot ends.
// Rendering: a second render of the scene from the establishing (overview) pose into a small half-resolution render
// target (no post chain), at most every other frame (every 3rd/4th when it costs more than 1.5/3 ms or when the renderer's
// adaptive resolution is already reducing quality), composited by InsetPass, a tiny quad drawn into the frame just
// before the grade pass (gfx.addPass, the same hook as the focus mask). The pass is disabled, at zero cost, while hidden.
// Hidden in Calm mode (reduced motion: no zooms or rides to get lost in) and on screens narrower than 600 px.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { el, clamp } from '../util.js';

const NS = 'http://www.w3.org/2000/svg', V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIZE = [220, 140];   // CSS px (S10); phones narrower than 600 px get no inset at all

// The scene renders into the inset target in linear HDR (three.js applies tone mapping and the output transfer only when
// drawing to the screen), so the composite does what OutputPass does for the main frame: exposure, AgX, sRGB. It then
// undoes the grade pass's vignette at its own pixels (the inset sits in a corner, where the vignette is strongest).
const VERT = 'precision highp float;uniform mat4 modelViewMatrix,projectionMatrix;attribute vec3 position;attribute vec2 uv;varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const FRAG = `precision highp float;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
uniform sampler2D tInset;uniform float uAlpha,uVig;uniform vec2 uRes;varying vec2 vUv;
void main(){vec4 c=texture2D(tInset,vUv);c.rgb=AgXToneMapping(c.rgb);c=sRGBTransferOETF(c);
 vec2 d=gl_FragCoord.xy/uRes-.5;float v=1.-uVig*smoothstep(.25,.85,length(d*vec2(1.15,1.)));c.rgb/=max(v,.35);
 vec2 e=min(vUv,1.-vUv)*vec2(${SIZE[0]}.,${SIZE[1]}.);c.rgb*=mix(.72,1.,smoothstep(0.,7.,min(e.x,e.y)));
 gl_FragColor=vec4(c.rgb,uAlpha);}`;

export class InsetPass extends Pass {
  constructor() {
    super(); this.needsSwap = false; this.enabled = false;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.uniforms = { tInset: { value: this.rt.texture }, uAlpha: { value: 0 }, uVig: { value: .32 }, uRes: { value: new THREE.Vector2(1, 1) }, toneMappingExposure: { value: 1 } };
    this.quad = new FullScreenQuad(new THREE.RawShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.rect = [0, 0, 1, 1]; this.scene = null; this.camera = null; this.dirty = false; this.ms = 0; this.renders = 0; this._cc = new THREE.Color();
  }
  setSize() { }
  // the overview into the small target: no post chain, no shadow-map update (the main frame already drew them)
  renderInset(r) {
    const sc = this.scene, cam = this.camera; if (!sc || !cam) return;
    const t0 = performance.now(), au = r.shadowMap.autoUpdate, ac = r.autoClear;
    r.shadowMap.autoUpdate = false; r.autoClear = true; r.setRenderTarget(this.rt); r.render(sc, cam);
    r.shadowMap.autoUpdate = au; r.autoClear = ac; this.ms = performance.now() - t0; this.renders++; this.dirty = false;
  }
  render(r, writeBuffer, readBuffer) {
    if (this.dirty) this.renderInset(r);
    const rb = readBuffer, [x, y, w, h] = this.rect, vp = rb.viewport.clone(), sc = rb.scissor.clone(), st = rb.scissorTest;
    this.uniforms.toneMappingExposure.value = r.toneMappingExposure; this.uniforms.uRes.value.set(rb.width, rb.height);
    rb.viewport.set(x, y, w, h); rb.scissor.set(x, y, w, h); rb.scissorTest = true;
    r.setRenderTarget(rb); this.quad.render(r);
    rb.viewport.copy(vp); rb.scissor.copy(sc); rb.scissorTest = st; r.setRenderTarget(rb);
  }
  dispose() { this.rt.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

// one per DioramaView (view.inset); update() runs after the director and the cues each frame
export class Inset {
  constructor(view) {
    this.v = view; this.pass = new InsetPass(); this.cam = new THREE.PerspectiveCamera(40, SIZE[0] / SIZE[1], .05, 400);
    const g = view.gfx; this.unhook = g.addPass ? g.addPass(this.pass) : (() => { const P = g.composer.passes, i = P.indexOf(g.grade); g.composer.insertPass(this.pass, i < 0 ? P.length : i); return () => g.composer.removePass(this.pass); })();
    this.box = el('div', { class: 'dio-inset', hidden: true, 'aria-hidden': 'true' }, [el('span', { class: 'dio-inset-cap', text: 'You are here' })]);
    this.svg = document.createElementNS(NS, 'svg'); this.svg.setAttribute('class', 'dio-inset-svg'); this.svg.setAttribute('viewBox', `0 0 ${SIZE[0]} ${SIZE[1]}`); this.box.prepend(this.svg);
    const mk = (tag, cls) => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); this.svg.append(e); return e; };
    this.rail = mk('polyline', 'ins-rail'); this.wedge = mk('path', 'ins-wedge'); this.dot = mk('circle', 'ins-dot'); this.dot.setAttribute('r', '3.6'); this.tgt = mk('circle', 'ins-target'); this.tgt.setAttribute('r', '6');
    view.ui.append(this.box);
    this.a = 0; this.linger = 0; this.frame = 0; this.corner = -1; this.placeT = 0; this.avgMs = 0; this.why = ''; this.force = false; this._q = V3(); this._f = V3(); this._r = V3(); this._railKey = null;
  }
  // why the main view has lost the overview (or '' when it has not)
  reason() {
    const v = this.v, d = v.dir, Z = d && d.zoom, K = d && d.track;
    if (Z && Z.phase !== 'ring' && Z.phase !== 'centre') return 'zoom';
    if (K && K.phase === 'ride') return 'track';
    if (v.pov) return 'pov';
    if (v.running != null && d && d.cinematic && v.controls) { const R = v.ds.orb ? v.ds.orb.r : 10; if (v.camera.position.distanceTo(v.controls.target) < R * .16) return 'close'; }
    return '';
  }
  allowed() { const v = this.v; return this.force || (v.stage === 'explore' && innerWidth >= 600 && !(v.reducedMotion && v.reducedMotion())); }
  pose() {
    const v = this.v, k = v.ds.overviewKey(), R = v.ds.orb ? v.ds.orb.r : 10, c = this.cam;
    c.position.copy(k.target).addScaledVector(k.dir, R * 1.08); c.near = Math.max(.02, R * .01); c.far = R * 30; c.fov = 40; c.aspect = SIZE[0] / SIZE[1]; c.updateProjectionMatrix(); c.lookAt(k.target); c.updateMatrixWorld();
    this.R = R;
  }
  // a free corner: the least overlap with the panels, the readouts, the time bar, the callout, the chip and the scale bar;
  // among equals, the corner farthest from the callout (S10: "the free-frame corner opposite the callout")
  place() {
    const v = this.v, d = v.dir, W = innerWidth, H = innerHeight, [w, h] = SIZE, m = 16;
    const blocks = [v.readPanel, v.panel, v.titleEl, v.povBar, v.ticker, v.ui && v.ui.querySelector('.dio-time'), v.ui && v.ui.querySelector('.dio-actions'), d && d.chipEl, d && d.sbar, d && d.beat && d.beat.el, document.querySelector('.sound-btn')]
      .filter(P => P && !P.hidden && P.getBoundingClientRect).map(P => P.getBoundingClientRect()).filter(r => r.width && r.height);
    const co = d && d.beat && d.beat.el ? d.beat.el.getBoundingClientRect() : null;
    // the left corners start right of the instruction panel (also when it is folded to its tab)
    const pr = v.panel && !v.panel.hidden && v.panel.getBoundingClientRect ? v.panel.getBoundingClientRect() : null, xl = Math.min(W - w - m, Math.max(m, pr && pr.width ? pr.right + 12 : m));
    const C = [[W - w - m, 78], [xl, 78], [W - w - m, H - h - 112], [xl, H - h - 112]];
    let best = this.corner >= 0 ? this.corner : 0, bc = 1e18;
    C.forEach(([x, y], i) => {
      let o = 0; for (const r of blocks) o += Math.max(0, Math.min(x + w, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + h, r.bottom) - Math.max(y, r.top));
      const far = co ? Math.hypot(x + w / 2 - (co.left + co.width / 2), y + h / 2 - (co.top + co.height / 2)) : 0, cost = o * 10 - far + (i === this.corner ? -60 : 0);
      if (cost < bc) { bc = cost; best = i; }
    });
    if (best !== this.corner) { this.corner = best; const [x, y] = C[best]; this.x = x; this.y = y; this.box.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; }
  }
  show(on) { if (on === !this.box.hidden) return; this.box.hidden = !on; if (on) { this.corner = -1; this.placeT = 1e9; this._railKey = null; } }
  update(dt) {
    const v = this.v, P = this.pass, why = this.allowed() ? this.reason() : '';
    if (why) { this.why = why; this.linger = 2; } else this.linger = Math.max(0, this.linger - dt);   // S10: it fades out 2 s after the shot ends
    const want = !!why || (this.linger > 0 && this.allowed());
    this.a = clamp(this.a + (want ? dt / .35 : -dt / .4), 0, 1);
    if (this.a <= 0) { if (P.enabled) { P.enabled = false; this.show(false); } return; }
    if (!P.enabled) { P.enabled = true; this.show(true); this.pose(); P.dirty = true; this.frame = 0; }
    this.placeT += dt; if (this.placeT > .5) { this.placeT = 0; this.place(); }
    // the rectangle in drawing-buffer pixels (bottom-left origin), from the composer's own size
    const g = v.gfx, r = g.renderer, k = r.getPixelRatio(), [w, h] = SIZE, W = Math.round(w * k), H = Math.round(h * k);
    P.rect = [Math.round(this.x * k), Math.round((innerHeight - this.y - h) * k), W, H];
    // half resolution, but never below 0.6 of a CSS pixel per pixel (the rail and the wedge are drawn crisp in SVG on top)
    const s = Math.max(.6, k * .5), tw = Math.max(16, Math.round(w * s)), th = Math.max(10, Math.round(h * s));
    if (P.rt.width !== tw || P.rt.height !== th) { P.rt.setSize(tw, th); P.dirty = true; }
    P.scene = v.scene; P.camera = this.cam; P.uniforms.uAlpha.value = this.a * this.a * (3 - 2 * this.a); P.uniforms.uVig.value = g.grade ? g.grade.uniforms.uVignette.value : .32;
    // at most every other frame; every 3rd/4th when it is expensive or the adaptive resolution is already reduced
    this.avgMs += (P.ms - this.avgMs) * .1; const slow = g.dpr != null && g.maxDpr != null && g.dpr < Math.min(1, g.maxDpr);
    const every = this.avgMs > 3 || slow ? 4 : this.avgMs > 1.5 ? 3 : 2; if (this.frame++ % every === 0) P.dirty = true;
    this.box.style.opacity = P.uniforms.uAlpha.value.toFixed(3);
    this.drawMarks();
  }
  // where the main camera is: a dot and a wedge of its view; the zoom target; the ride's rail
  proj(p) { const q = this._q.copy(p).project(this.cam); return q.z > 1 ? null : [(q.x * .5 + .5) * SIZE[0], (-q.y * .5 + .5) * SIZE[1]]; }
  drawMarks() {
    const v = this.v, cam = v.camera, d = v.dir, R = this.R || 10, e = cam.position, a = this.proj(e);
    if (a) { this.dot.setAttribute('cx', a[0].toFixed(1)); this.dot.setAttribute('cy', a[1].toFixed(1)); this.dot.style.opacity = 1; } else this.dot.style.opacity = 0;
    cam.getWorldDirection(this._f); const right = this._r.crossVectors(this._f, cam.up).normalize(), hf = THREE.MathUtils.degToRad(cam.fov / 2) * Math.min(1.6, cam.aspect || 1.6), L = R * .16;
    const ends = [-1, 1].map(sg => this.proj(V3().copy(e).addScaledVector(this._f, L * Math.cos(hf)).addScaledVector(right, sg * L * Math.sin(hf))));
    if (a && ends[0] && ends[1]) this.wedge.setAttribute('d', `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${ends[0][0].toFixed(1)} ${ends[0][1].toFixed(1)}L${ends[1][0].toFixed(1)} ${ends[1][1].toFixed(1)}Z`); else this.wedge.setAttribute('d', '');
    const Z = d && d.zoom, t = Z ? this.proj(Z.c) : null;
    if (t) { this.tgt.setAttribute('cx', t[0].toFixed(1)); this.tgt.setAttribute('cy', t[1].toFixed(1)); this.tgt.style.opacity = 1; } else this.tgt.style.opacity = 0;
    const K = d && d.track; if ((K && K.curve) !== this._railKey) { this._railKey = K && K.curve; this.rail.setAttribute('points', K && K.curve ? K.curve.getSpacedPoints(40).map(p => this.proj(p)).filter(Boolean).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') : ''); }
  }
  // measured cost of one inset render, GPU included (a 1-pixel read waits for the GPU): for the docs' performance check
  bench(n = 10) {
    const r = this.v.gfx.renderer, P = this.pass, gl = r.getContext(), px = new Uint8Array(4); if (!P.scene) { P.scene = this.v.scene; P.camera = this.cam; this.pose(); }
    const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };   // the default framebuffer is RGBA8: a 1-pixel read waits for the GPU
    if (P.rt.width < 8) P.rt.setSize(Math.round(SIZE[0] * .6), Math.round(SIZE[1] * .6));
    sync(); const out = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); P.renderInset(r); sync(); out.push(performance.now() - t0); }
    r.setRenderTarget(null); out.sort((x, y) => x - y); return { median: out[n >> 1], min: out[0], max: out[n - 1], rt: [P.rt.width, P.rt.height] };
  }
  dispose() { try { this.unhook && this.unhook(); } catch (e) { } this.pass.dispose(); this.box.remove(); }
}
