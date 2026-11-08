// One shared WebGL renderer + post chain for every mode (hub, room, diorama).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { envScene } from './proc.js';
import { AAA, initAAA, detectQuality, setQuality as setAAAQuality, prebake, rebakeAll, AtmospherePass, aaaFrame, QUALITY } from './aaa.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: .32 }, uGrain: { value: .035 }, uWarm: { value: .02 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(1, .97, .9) }, uContrast: { value: 1 }, uSat: { value: 1 }, uLift: { value: 0 }, uTilt: { value: 0 }, uTiltR: { value: 2.2 }, uPunch: { value: .3 }, uWB: { value: new THREE.Vector3(1, 1, 1) }, uWBMid: { value: 0 }, uWBHi: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 800) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uVignette,uGrain,uWarm,uFade,uContrast,uSat,uLift,uTilt,uTiltR,uPunch,uWBMid,uWBHi;uniform vec3 uWB;uniform vec2 uRes;uniform vec3 uFadeColor;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;
  if(uTilt>0.){float b=uTilt*smoothstep(.16,.5,abs(vUv.y-.46))*uTiltR*uRes.y/800.;if(b>.05){vec3 s=c.rgb;for(int i=0;i<8;i++){float a=float(i)*.785+.39;s+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*b/uRes).rgb;}c.rgb=s/9.;}}
  if(uPunch>0.){vec3 pc=pow(max(c.rgb,0.),vec3(1.+.3*uPunch))*(1.+.1*uPunch);float pl=dot(pc,vec3(.2126,.7152,.0722));c.rgb=max(pl+(pc-pl)*(1.+.25*uPunch),0.);}
  float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,uSat);
  c.rgb=clamp(c.rgb+uLift,0.,1.);c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),clamp((uContrast-1.)*2.5,0.,1.));
  if(uWB!=vec3(1.)||uWBMid>0.||uWBHi>0.){c.rgb=pow(pow(c.rgb,vec3(2.2))*uWB,vec3(1./2.2));float wl=dot(c.rgb,vec3(.2126,.7152,.0722));
    c.rgb*=1.+uWBHi*pow(clamp((wl-.45)/.55,0.,1.),2.)*vec3(-.04,0.,.08);c.b+=uWBMid*clamp(wl*(1.-wl)*4.,0.,1.);c.rgb=clamp(c.rgb,0.,1.);}
  float v=1.-uVignette*smoothstep(.25,.85,length(d*vec2(1.15,1.)));
  c.rgb*=v;c.rgb+=vec3(uWarm,uWarm*.4,-uWarm*.6)*(1.-length(d));
  float g=(h(vUv*vec2(1920.,1080.)+fract(uTime*7.))-.5)*uGrain;c.rgb+=g;
  c.rgb=mix(c.rgb,uFadeColor,uFade);gl_FragColor=c;}`
};

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.localClippingEnabled = true;
    // three.js keeps one transmission render target per (scene, camera) in a private render state and never frees it:
    // each new diorama/room scene with glass leaked one GPU texture. Remember the target on its scene (it is the one three
    // binds inside render() with resolveDepthBuffer === false and mipmaps), so disposeTree(scene) frees it with the rest.
    { const render = r.render.bind(r), setRT = r.setRenderTarget.bind(r), seen = new WeakSet(); let cur = null;
      r.render = (scene, camera) => { const prev = cur; cur = scene; try { return render(scene, camera); } finally { cur = prev; } };
      r.setRenderTarget = (rt, ...a) => { if (rt && cur && cur.isScene && rt.resolveDepthBuffer === false && rt.texture && rt.texture.generateMipmaps && !seen.has(rt)) { seen.add(rt); (cur.userData.__trt || (cur.userData.__trt = new Set())).add(rt); } return setRT(rt, ...a); }; }   // set once: flipping it mid-scene (peel 'clip', the materialize section plane) recompiles every clipped material
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = .9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = Math.min(this.maxDpr, 1.5);
    r.setPixelRatio(this.dpr);
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    c.addPass(this.renderPass);
    // AAA: procedural surfaces + quality level (see js/gfx/aaa.js). Both composer buffers carry a depth texture, so
    // the atmosphere pass (height fog + god rays, linear HDR, before bloom and AgX) can reconstruct world positions.
    initAAA(r); { const d = detectQuality(r); this.gpu = d.gpu; setAAAQuality(d.quality); }
    [c.renderTarget1, c.renderTarget2].forEach(t => { t.depthTexture = new THREE.DepthTexture(2, 2); t.depthTexture.type = THREE.UnsignedIntType; });
    this.atmos = new AtmospherePass(); this.atmos.enabled = false; this.atmos.configure(AAA.Q); c.addPass(this.atmos);
    this.outline = new OutlinePass(new THREE.Vector2(2, 2), this.renderPass.scene, this.renderPass.camera);
    Object.assign(this.outline, { edgeStrength: 4, edgeGlow: .6, edgeThickness: 1.4, pulsePeriod: 2.4 });
    this.outline.visibleEdgeColor.set('#ffd98a'); this.outline.hiddenEdgeColor.set('#7a5a20'); this.outline.enabled = false;
    c.addPass(this.outline);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), .32, .55, .86); c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    this.pmrem = new THREE.PMREMGenerator(r); this.envs = {};
    this.makeStudioEnv();
    this.frameMs = 16; this._acc = 0; this._n = 0; this.lowQ = false; this._slow = 0;
    // bake the procedural surfaces and compile the atmosphere programs in idle time after boot
    prebake(); (window.requestIdleCallback || setTimeout)(() => { this.warmAtmos(); }, { timeout: 2500 });
    this.resize(); addEventListener('resize', () => { cancelAnimationFrame(this._rz); this._rz = requestAnimationFrame(() => this.resize()); });
    // WebGL context loss (GPU reset, driver update, too many tabs): three.js stops drawing and restores its own state;
    // the app pauses, rebuilds the pre-filtered environments (render-target contents are lost) and reopens the place.
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.showLost(true); }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false; this.showLost(false);
      try { const old = this.envStudio; this.makeStudioEnv(); const kinds = Object.keys(this.envs); this.envs = {}; kinds.forEach(k => this.envFor(k)); if (old && old !== this.envStudio) old.dispose(); rebakeAll(); } catch (e) { console.warn(e); }
      this.resize(); this.onRestore && this.onRestore();
    }, false);
  }
  makeStudioEnv() { const sc = new RoomEnvironment(); this.envStudio = this.pmrem.fromScene(sc, .035).texture; this.envStudio.userData.shared = true; sc.dispose && sc.dispose(); }
  showLost(on) {
    let v = document.getElementById('gl-lost');
    if (on && !v) { v = document.createElement('div'); v.id = 'gl-lost'; v.className = 'gl-lost glass'; v.setAttribute('role', 'status'); v.textContent = 'The graphics card was reset. Waiting for it to come back…'; document.body.append(v); }
    if (!on && v) v.remove();
  }
  // Procedural HDR-like studio / sky environments (softboxes, sun disc) for reflections; cached per kind.
  envFor(kind = 'studio') {
    const k = ['landscape', 'ocean', 'night', 'cosmos', 'micro'].includes(kind) ? kind : (kind === 'lab' || kind === 'abstract' ? 'lab' : 'studio');
    if (!this.envs[k]) { try { const sc = envScene(k); this.envs[k] = this.pmrem.fromScene(sc, .02, .1, 120).texture; this.envs[k].userData.shared = true; sc.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } catch (e) { console.warn(e); this.envs[k] = this.envStudio; } }
    return this.envs[k];
  }
  // Per-scene look: scenes may set scene.userData.look = {contrast, sat, vignette, grain, warm, exposure}; others get the house look.
  applyLook(L = {}) {
    const u = this.grade.uniforms; u.uContrast.value = L.contrast ?? 1; u.uSat.value = L.sat ?? 1; u.uLift.value = L.lift ?? 0;
    u.uVignette.value = L.vignette ?? .32; u.uPunch.value = L.punch ?? .3; u.uTiltR.value = L.tiltRadius ?? 2.2; u.uTilt.value = L.tilt ?? 0; u.uGrain.value = L.grain ?? .035; u.uWarm.value = L.warm ?? .02;
    // white balance (display-referred, von Kries in linear light): wb = [r, g, b] gains or {gain, mid (blue lift in the midtones), hi (cooler highlights)}
    const wb = Array.isArray(L.wb) ? { gain: L.wb } : (L.wb || {}), wg = wb.gain || [1, 1, 1]; u.uWB.value.set(wg[0] ?? 1, wg[1] ?? 1, wg[2] ?? 1); u.uWBMid.value = wb.mid ?? 0; u.uWBHi.value = wb.hi ?? 0;   // tiltRadius: miniature look, blur radius (px at 800 px height) at the frame's top and bottom
    if (L.exposure != null) this.renderer.toneMappingExposure = L.exposure;
    if (L.bloom != null) this.bloom.strength = L.bloom;
    this.bloom.threshold = L.bloomThreshold ?? .86; this.bloom.radius = L.bloomRadius ?? .55;
    this.renderer.toneMapping = L.toneMapping ?? THREE.AgXToneMapping; // (OutputPass applies it; scenes without a look keep AgX)
  }
  // The house look of the library and the book rooms: crisp, warm daylight. The neutral studio environment is kept
  // low in these scenes (its grey reflections in lacquer, scagliola and the polished floor were the milky veil; gilt
  // compensates with its own envMapIntensity); bloom only on real highlights (flames, windows); a little contrast.
  static get HOUSE() {
    // wb: the room probes (candles, late-morning sun, gilt and scagliola bounce) cast the halls orange (mean blue 67 → 43);
    // these linear gains bring plaster and marble back to a warm white (hall: plaster B/R .31 → ~.6, floor marble .50 → ~.95)
    return { punch: .15, contrast: 1.06, sat: 1.05, lift: 0, vignette: .3, grain: .022, warm: .012, exposure: 1.35, bloom: .2, bloomThreshold: 1.6, bloomRadius: .4, toneMapping: THREE.NeutralToneMapping, wb: { gain: [.84, 1.45, 3.4], mid: 0, hi: 0 } };
  }
  setView(scene, camera) {
    this.scene = scene; this.camera = camera; this.applyLook(scene.userData.look);
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    this.outline.renderScene = scene; this.outline.renderCamera = camera;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr); this.composer.setSize(w, h); this.grade.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    if (this.camera && this.camera.isPerspectiveCamera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  // Adaptive resolution: keep frames under ~22 ms. One-off stalls (shader compiles, a mode being built, a tab coming
  // back from the background) are not frame cost and are left out of the average.
  resetAdapt() { this._acc = 0; this._n = 0; this._skip = 8; }
  adapt(dtMs) {
    if (!(dtMs > 0)) return; if (this._skip > 0) { this._skip--; return; }
    this._acc += Math.min(dtMs, 100); this._n++;
    if (this._acc > 2000) {
      const avg = this._acc / this._n; this._acc = 0; this._n = 0; this.frameMs = avg;
      if (avg > 24 && this.dpr > .75) { this.dpr = Math.max(.75, this.dpr - .25); this.resize(); }
      else if (avg < 13 && this.dpr < this.maxDpr) { this.dpr = Math.min(this.maxDpr, this.dpr + .25); this.resize(); }
      this.bloom.enabled = !(avg > 30 && this.dpr <= .75);
      // still too slow at the resolution floor for two windows in a row: one quality level down, remembered per GPU
      this._slow = avg > 30 && this.dpr <= .75 ? this._slow + 1 : 0;
      if (this._slow >= 2 && this.quality !== 'low') { const q = this.quality === 'high' ? 'medium' : 'low'; this.setQuality(q); this._slow = 0; try { localStorage.setItem('sm-gfx-history', JSON.stringify({ gpu: this.gpu, down: q })); } catch (e) { } }
    }
  }
  // ---- quality API: 'low' | 'medium' | 'high' (detected at start; see docs/research/aaa-rendering.md) ----
  // POM steps, glints, self-shadowing, pixel-depth offset and the atmosphere pass change at once; the number of
  // sun shadow cascades applies when the next diorama is built.
  get quality() { return AAA.quality; }
  set quality(q) { this.setQuality(q); }
  setQuality(q) { if (!QUALITY[q]) return AAA.quality; setAAAQuality(q); this.atmos.configure(AAA.Q); this.warmAtmos(); this.onQuality && this.onQuality(q); return q; }
  get qualityLevels() { return Object.keys(QUALITY); }
  // compile the atmosphere programs for the target they really draw into (a linear composer buffer, not the screen)
  warmAtmos() { const r = this.renderer, prev = r.getRenderTarget(); try { r.setRenderTarget(this.composer.writeBuffer); this.atmos.warm(r); } catch (e) { console.warn(e); } finally { r.setRenderTarget(prev); } }
  // bounded caches that fill over idle time (one baked AAA surface per kind and quality) - leak checks subtract these
  cachedTextures() { return AAA.bakes.size; }
  // Precompile every program a scene will need across its states (sketch → real), without rendering:
  // variants = [{ apply(), restore() }]; each state is applied, compiled (parallel where KHR_parallel_shader_compile
  // exists) and restored synchronously. Texture/cube backgrounds get their background program from a 1×1 render.
  prewarm(scene, camera, variants = [], backgrounds = []) {
    const r = this.renderer, t0 = performance.now(), jobs = [];
    // r.compile() queues the programs (in parallel where KHR_parallel_shader_compile exists) and returns the material
    // set. We poll readiness ourselves instead of using three's compileAsync: its poll calls currentProgram.isReady()
    // unguarded, and variant materials restored/disposed meanwhile have no program -> uncaught TypeError + a promise
    // that never settles. Missing programs count as done; the poll gives up after 6 s.
    const props = r.properties;
    const compile = () => {
      try {
        const set = r.compile(scene, camera); const mats = set ? [...set] : [];
        jobs.push(new Promise(res => {
          const t1 = performance.now();
          const poll = () => {
            let pending = 0;
            for (const m of mats) { const p = props.get(m).currentProgram; if (p && p.isReady && !p.isReady()) pending++; }
            if (!pending || performance.now() - t1 > 6000) res(); else setTimeout(poll, 10);
          };
          poll();
        }));
      } catch (e) { console.warn(e); }
    };
    // compile for the target the scene really renders into: the composer's linear half-float buffer (no tone mapping,
    // linear output). Compiling against the screen (render target null) builds sRGB + AgX variants that are never used.
    const prevRT = r.getRenderTarget(); r.setRenderTarget(this.composer.readBuffer);
    try { for (const v of variants) { try { v.apply(); compile(); } finally { v.restore(); } } } finally { r.setRenderTarget(prevRT); }
    const bgs = backgrounds.filter(b => b && (b.isTexture || b.isCubeTexture));
    if (bgs.length) { if (!this._warmRT) this._warmRT = new THREE.WebGLRenderTarget(1, 1); const s = new THREE.Scene(), prev = r.getRenderTarget(); r.setRenderTarget(this._warmRT); bgs.forEach(b => { s.background = b; r.render(s, camera); }); r.setRenderTarget(prev); }
    this.prewarmMs = performance.now() - t0;
    return Promise.all(jobs);
  }
  // Frame statistics for profiling (draw calls and triangles of one full composer frame, shadow passes included).
  stats() {
    const r = this.renderer, inf = r.info, ar = inf.autoReset; inf.autoReset = false; inf.reset();
    const t0 = performance.now(); this._frame(0, this._t || 0); const cpu = performance.now() - t0;
    const o = { calls: inf.render.calls, triangles: inf.render.triangles, programs: inf.programs.length, passes: this.composer.passes.filter(p => p.enabled).length, atmos: this.atmos.enabled, quality: this.quality, cpuMs: Math.round(cpu * 10) / 10 };
    inf.autoReset = ar; return o;
  }
  render(dt, t) { this._frame(dt, t); }
  _frame(dt, t) {
    this._t = t;
    this.grade.uniforms.uTime.value = t; aaaFrame(t);
    // atmosphere pass: on for scenes that describe one (outdoor presets), faded by the materialize transition
    const sc = this.scene, A = sc && sc.userData.aaaAtmos, k = A ? (sc.userData.aaaAtmosK ?? 1) : 0;
    this.atmos.enabled = !!(A && k > .001 && AAA.Q.god > 0 && this.camera);
    if (this.atmos.enabled) this.atmos.update(this.camera, A, k, t);
    this.composer.render(dt);
  }
}

// Hook for passes owned by other modules (e.g. js/dio/focus.js: the explainer focus mask). The pass is inserted just
// before the grade pass (display-referred, after tone mapping); the returned function removes it again.
Gfx.prototype.addPass = function (pass, before = this.grade) {
  const P = this.composer.passes, i = P.indexOf(before); this.composer.insertPass(pass, i < 0 ? P.length : i);
  pass.setSize(innerWidth * this.dpr, innerHeight * this.dpr);
  return () => { const k = this.composer.passes.indexOf(pass); if (k >= 0) this.composer.removePass(pass); };
};
