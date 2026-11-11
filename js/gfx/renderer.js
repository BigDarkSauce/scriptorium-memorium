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
import { tame, classifyGpu } from './tier.js';
import { AAA, initAAA, detectQuality, setQuality as setAAAQuality, prebake, rebakeAll, AtmospherePass, aaaFrame, QUALITY } from './aaa.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: .32 }, uGrain: { value: .035 }, uWarm: { value: .02 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(1, .97, .9) }, uIris: { value: 2 }, uDim: { value: 0 }, uContrast: { value: 1 }, uSat: { value: 1 }, uLift: { value: 0 }, uTilt: { value: 0 }, uTiltR: { value: 2.2 }, uPunch: { value: .3 }, uWB: { value: new THREE.Vector3(1, 1, 1) }, uWBMid: { value: 0 }, uWBHi: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 800) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uVignette,uGrain,uWarm,uFade,uIris,uDim,uContrast,uSat,uLift,uTilt,uTiltR,uPunch,uWBMid,uWBHi;uniform vec3 uWB;uniform vec2 uRes;uniform vec3 uFadeColor;varying vec2 vUv;
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
  c.rgb=mix(c.rgb,uFadeColor,uFade);
  if(uIris<1.6){float asp=uRes.x/max(uRes.y,1.),ir=length(d*vec2(asp,1.))/(.5*length(vec2(asp,1.)));c.rgb*=1.-smoothstep(uIris-.3,uIris,ir);}   /* the iris: dark from the edges in (App.iris) */
  if(uDim>0.){float e=smoothstep(.2,.75,length(d*vec2(1.15,1.)));c.rgb*=1.-clamp(uDim*(1.+.45*e)-.45*e*uDim*uDim,0.,1.);}   /* a slow fade to black, the edges a little ahead of the centre (title showcase) */
  gl_FragColor=c;}`
};

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.localClippingEnabled = true;
    // A program that failed to link: three's own report, plus what it leaves out. One smoke run logged "Shader Error 0 -
    // VALIDATE_STATUS false" for ShaderMaterials with every log empty (shaders compiled, link failed, no reason), which
    // 20 forced context losses at each phase of a switch and switch churn under CPU load did not reproduce. A link that
    // fails with no log points at the GPU process (a reset or an out-of-memory link under load) rather than at a shader
    // source; the extra line says which: context lost or not, the program still valid, both stages compiled, sizes.
    r.debug.onShaderError = (gl, prog, vs, fs) => {
      const L = x => { try { return (x || '').trim(); } catch (e) { return ''; } }, q = f => { try { return f(); } catch (e) { return 'n/a'; } };
      const pl = L(q(() => gl.getProgramInfoLog(prog))), vl = L(q(() => gl.getShaderInfoLog(vs))), fl = L(q(() => gl.getShaderInfoLog(fs)));
      const d = { lost: q(() => gl.isContextLost()), glError: q(() => gl.getError()), program: q(() => gl.isProgram(prog)), vsCompiled: q(() => gl.getShaderParameter(vs, gl.COMPILE_STATUS)), fsCompiled: q(() => gl.getShaderParameter(fs, gl.COMPILE_STATUS)), vsLen: q(() => (gl.getShaderSource(vs) || '').length), fsLen: q(() => (gl.getShaderSource(fs) || '').length) };
      console.error('THREE.WebGLProgram: Shader Error - link failed' + (pl || vl || fl ? '' : ' with empty logs') + ' ' + JSON.stringify(d) + (pl ? '\nProgram Info Log: ' + pl : '') + (vl ? '\nVERTEX: ' + vl : '') + (fl ? '\nFRAGMENT: ' + fl : ''));
    };
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
    // the resolution never goes below 85 % of a CSS pixel: at the old floor (half) a weak GPU's hall was drawn at 620 × 390
    // in a 1240 × 790 window, and walking through it looked pixelated, its thin gilt strips broken into dashes
    this.minDpr = Math.min(this.maxDpr, .85);
    r.setPixelRatio(this.dpr);
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    c.addPass(this.renderPass);
    // AAA: procedural surfaces + quality level (see js/gfx/aaa.js). Both composer buffers carry a depth texture, so
    // the atmosphere pass (height fog + god rays, linear HDR, before bloom and AgX) can reconstruct world positions.
    initAAA(r); { const d = detectQuality(r); this.gpu = d.gpu; this.gpuClass = classifyGpu(d.gpu) === 'low' ? 'medium' : 'high'; setAAAQuality(d.quality); this.dpr = Math.min(this.maxDpr, { high: 1.5, medium: 1.25, low: 1 }[d.quality] || 1.25); r.setPixelRatio(this.dpr); }   /* integrated and software GPUs start at a resolution they can hold; adapt() raises it when frames are fast */
    this._tameTick = 0; { const gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); this._gpuT = ext ? { gl, ext, pend: [], ms: [], busy: false } : null; }
    r.shadowMap.type = AAA.quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
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
  setView(scene, camera) { this._smReset();
    this.scene = scene; this.camera = camera; this.applyLook(scene.userData.look);
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    this.outline.renderScene = scene; this.outline.renderCamera = camera;
    this.resize();
  }
  // another scene under the same camera and canvas (the title screen's showcase): no resize, so the composer's targets
  // are not reallocated on every change of scene (setView resizes, which costs a frame or more)
  _smReset() { if (this._smHalf) { this.renderer.shadowMap.autoUpdate = true; this.renderer.shadowMap.needsUpdate = true; this._smHalf = false; } }
  swapScene(scene, camera) { this._smReset(); this.scene = scene; this.camera = camera; this.applyLook(scene.userData.look); this.renderPass.scene = scene; this.renderPass.camera = camera; this.outline.renderScene = scene; this.outline.renderCamera = camera; }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr); this.composer.setSize(w, h); this.grade.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    if (this.camera && this.camera.isPerspectiveCamera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  // Adaptive resolution: keep frames under ~22 ms. One-off stalls (shader compiles, a mode being built, a tab coming
  // back from the background) are not frame cost and are left out of the average.
  resetAdapt() { this._acc = 0; this._n = 0; this._skip = 8; this._gpuSkip = 1; if (this._gpuT) this._gpuT.ms.length = 0; }
  adapt(dtMs) {
    if (!(dtMs > 0) || this._gpuT) return;   // with the GPU timer, pollGpu() decides (from the GPU's own time) if (this._skip > 0) { this._skip--; return; }
    // A scene that draws at one frame a second must be lightened at once, not after minutes: frames used to be counted
    // as at most 100 ms each with a 2 s window, so at 1 fps a window took 20 s and the step-down several windows, and
    // the scene looked frozen. Now four slow frames in a row (each over 150 ms; a single stall from a compile or a
    // collection is not a run, and a frame over 3 s is a hidden tab, not a slow one) drop straight to the floor: the
    // lowest resolution, no bloom, one quality level down.
    if (dtMs > 3000) { this._slowRun = 0; return; }
    this._slowRun = dtMs > 150 ? (this._slowRun || 0) + 1 : 0;
    if (this._slowRun >= 4) { this._slowRun = 0; this._acc = 0; this._n = 0; this.frameMs = dtMs; this._skip = 3; if (this.dpr > this.minDpr) { this.dpr = this.minDpr; this.resize(); } this.msaa(2);
      if (this.quality !== 'low') { const q = this.quality === 'high' ? 'medium' : 'low'; this.setQuality(q); try { localStorage.setItem('sm-gfx-history', JSON.stringify({ gpu: this.gpu, down: q })); } catch (e) { } this.onSevere && this.onSevere(q, dtMs); } return; }
    this._acc += Math.min(dtMs, 100); this._n++;
    if (this._acc > 2000) {
      const avg = this._acc / this._n; this._acc = 0; this._n = 0; this.frameMs = avg;
      if (avg > 24 && this.dpr > this.minDpr) { this.dpr = Math.max(this.minDpr, this.dpr - .1); this.resize(); }
      else if (avg < 13 && this.dpr < this.maxDpr && !this.moving) { this.dpr = Math.min(this.maxDpr, this.dpr + .1); this.resize(); }
      // still too slow at the resolution floor for two windows in a row: one quality level down, remembered per GPU
      this._slow = avg > 30 && this.dpr <= this.minDpr ? this._slow + 1 : 0;
      if (this._slow >= 2 && this.quality !== 'low') { const q = this.quality === 'high' ? 'medium' : 'low'; this.setQuality(q); this._slow = 0; try { localStorage.setItem('sm-gfx-history', JSON.stringify({ gpu: this.gpu, down: q })); } catch (e) { } }
    }
  }
  // ---- the GPU governor: decisions from the GPU's own time per frame (where the timer extension exists) ----
  // A frame's GPU time is what the scene costs; the time between frames also holds the page's own work and the
  // browser's, which made the old governor (below) both late and blind to a scene that holds 30-40 fps on a weak GPU.
  // Budget: 13 ms of GPU per frame (60 fps with room for the rest). Every 1.5 s, from the median of the window:
  //   over 17 ms: one quality level down at once (taming the scene at 'low'); at 'low', the resolution down a step;
  //   under 6.5 ms for three windows running: the resolution up a step, then (never past what the GPU was classed as,
  //   and never after this session has had to step down) the quality up a level.
  pollGpu() {
    const T = this._gpuT, gl = T.gl; if (!T.pend.length) return;
    const disjoint = gl.getParameter(T.ext.GPU_DISJOINT_EXT);
    while (T.pend.length) { const q = T.pend[0]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; T.pend.shift(); if (!disjoint) T.ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    if (T.pend.length > 12) { T.pend.splice(0, T.pend.length - 12).forEach(q => gl.deleteQuery(q)); }
    const now = performance.now(); if (!this._gpuAt) this._gpuAt = now;
    if (now - this._gpuAt < 1500 || T.ms.length < 12) return; this._gpuAt = now;
    const xs = T.ms.splice(0).sort((a, b) => a - b), med = xs[xs.length >> 1]; this.gpuMs = med;
    if (this._gpuSkip > 0) { this._gpuSkip--; return; } if (this.holdQuality) return;
    // a steady picture first: a change of resolution or of the bloom is itself a visible jump, so the governor waits for
    // agreement (two slow windows, 3 s; or one very slow) before stepping down, for four fast windows and 8 s of calm
    // before stepping up, never steps up while the camera moves (walking costs more than standing: it would only step
    // down again), and never switches the bloom off and on. At the floor it trades multisampling (4x -> 2x) before
    // anything else: far less visible than a coarser picture.
    const now2 = performance.now(), calm = now2 - (this._lastStep || 0) > 8000;
    if (med > 18) { this._fast = 0; this._slowW = (this._slowW || 0) + 1; if (this._slowW < 2 && med < 28) return; this._slowW = 0; this._downs = (this._downs || 0) + 1; this._lastStep = now2;
      if (this.quality !== 'low') { const q = this.quality === 'high' ? 'medium' : 'low'; this.setQuality(q); this._gpuSkip = 1; try { localStorage.setItem('sm-gfx-history', JSON.stringify({ gpu: this.gpu, down: q })); } catch (e) { } }
      else if (!this.fixedRes && this.dpr > this.minDpr + .01) { this.dpr = Math.max(this.minDpr, this.dpr - .1); this.resize(); this._gpuSkip = 1; }
      else if (this.msaa() > 2) { this.msaa(2); this._gpuSkip = 1; }
    } else if (med < 8) { this._slowW = 0; this._fast = (this._fast || 0) + 1; if (this._fast < 4 || !calm || this.moving) return; this._fast = 0; this._lastStep = now2;
      if (this.msaa() < 4 && this.dpr >= this.minDpr) this.msaa(4);
      else if (!this.fixedRes && this.dpr < this.maxDpr) { this.dpr = Math.min(this.maxDpr, this.dpr + .1); this.resize(); this._gpuSkip = 1; }
      else if (!this._downs) { const cap = this.gpuClass || 'high', order = ['low', 'medium', 'high'], i = order.indexOf(this.quality); if (i < order.indexOf(cap)) { this.setQuality(order[i + 1]); this._gpuSkip = 1; } }
    } else { this._fast = 0; this._slowW = 0; }
  }
  // the composer's multisampling (4 by default; 2 when a weak GPU is at its resolution floor)
  msaa(n) { const c = this.composer, T = [c.renderTarget1, c.renderTarget2]; if (n == null) return T[0].samples; T.forEach(t => { if (t.samples !== n) { t.samples = n; t.dispose(); } }); return n; }
  get timed() { return !!this._gpuT; }
  // ---- quality API: 'low' | 'medium' | 'high' (detected at start; see docs/research/aaa-rendering.md) ----
  // POM steps, glints, self-shadowing, pixel-depth offset and the atmosphere pass change at once; the number of
  // sun shadow cascades applies when the next diorama is built.
  get quality() { return AAA.quality; }
  set quality(q) { this.setQuality(q); }
  setQuality(q) {
    if (!QUALITY[q]) return AAA.quality; setAAAQuality(q); this.atmos.configure(AAA.Q); this.warmAtmos();
    const st = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; if (this.renderer.shadowMap.type !== st) { this.renderer.shadowMap.type = st; if (this.scene) this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    this._gpuWin = []; this.onQuality && this.onQuality(q); return q;
  }
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
            if (!pending || performance.now() - t1 > 20000) res(); else setTimeout(poll, 10);
          };
          poll();
        }));
      } catch (e) { console.warn(e); }
    };
    // compile for the target the scene really renders into: the composer's linear half-float buffer (no tone mapping,
    // linear output). Compiling against the screen (render target null) builds sRGB + AgX variants that are never used.
    const prevRT = r.getRenderTarget(); r.setRenderTarget(this.composer.readBuffer);
    // (no variants: the scene as it is. Called with none, it used to compile nothing at all: the title screen's dioramas
    // then compiled synchronously on their first frame, a 1.1 s stall on a Radeon 610M)
    if (!variants.length) { r.setRenderTarget(prevRT); jobs.push(this.compileSliced(scene, camera)); }
    else try { for (const v of variants) { try { v.apply(); compile(); } finally { v.restore(); } } } finally { r.setRenderTarget(prevRT); }
    const bgs = backgrounds.filter(b => b && (b.isTexture || b.isCubeTexture));
    if (bgs.length) { if (!this._warmRT) this._warmRT = new THREE.WebGLRenderTarget(1, 1); const s = new THREE.Scene(), prev = r.getRenderTarget(); r.setRenderTarget(this._warmRT); bgs.forEach(b => { s.background = b; r.render(s, camera); }); r.setRenderTarget(prev); }
    this.prewarmMs = performance.now() - t0;
    return Promise.all(jobs);
  }
  // How many of the programs the next frame of this scene will use are still being compiled. r.compile() asks for exactly
  // what a frame in the scene's present state needs (its lights as they are now: a room switches its scroll spots and
  // lamps on in its first frames, so a prewarm made earlier had compiled variants with other light counts and the first
  // frames compiled 94 programs synchronously, 3-5 s each frame on a Radeon 610M with a cold shader cache). New programs
  // start compiling in the GPU process (KHR_parallel_shader_compile); a frame drawn before they are linked would wait for
  // them on the page's thread, so under the veil such a frame is skipped instead (main.js loop) and the veil waits.
  pending(scene, camera) {
    const r = this.renderer, props = r.properties, prev = r.getRenderTarget(); let set = null;
    r.setRenderTarget(this.composer.readBuffer); try { set = r.compile(scene, camera); } catch (e) { return 0; } finally { r.setRenderTarget(prev); }
    let n = 0; if (set) for (const m of set) { const p = props.get(m).currentProgram; if (p && p.isReady && !p.isReady()) n++; } return n;
  }
  // The scene as it is, compiled a few objects at a time, each slice in its own task of about 25 ms: three builds every
  // new material's shader source on the page's thread (dozens of materials took one 450 ms task on a Radeon 610M); the
  // GPU then compiles in parallel (KHR_parallel_shader_compile) and the programs are polled until ready. Within a slice
  // the other objects are hidden and shown again before the task ends, so no frame ever draws the scene half hidden.
  async compileSliced(scene, camera) {
    const r = this.renderer, props = r.properties, objs = []; scene.traverseVisible(o => { if (o.material && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) objs.push(o); });
    const mats = new Set(); let i = 0, k = 6;
    while (i < objs.length) {
      const t0 = performance.now(), chunk = objs.slice(i, i + k), keep = new Set(chunk), vis = objs.map(o => o.visible);
      objs.forEach(o => { if (!keep.has(o)) o.visible = false; });
      const prevRT = r.getRenderTarget(); r.setRenderTarget(this.composer.readBuffer);
      try { const set = r.compile(scene, camera); if (set) set.forEach(m => mats.add(m)); } catch (e) { console.warn(e); }
      finally { r.setRenderTarget(prevRT); objs.forEach((o, j) => { o.visible = vis[j]; }); }
      i += k; const dt = performance.now() - t0; k = Math.max(2, Math.min(40, Math.round(k * (dt > 0 ? 25 / dt : 2))));
      if (i < objs.length) await new Promise(res => setTimeout(res, 0));
    }
    const t1 = performance.now();
    await new Promise(res => { const poll = () => { let pending = 0; for (const m of mats) { const p = props.get(m).currentProgram; if (p && p.isReady && !p.isReady()) pending++; } if (!pending || performance.now() - t1 > 20000) res(); else setTimeout(poll, 10); }; poll(); });
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
    // 'low' tames the scene (tier.js): glass that refracts, fill lights, soft shadows; checked again every 30 frames
    // for what was added since (every object is marked once, so the pass is cheap)
    if (sc) { const low = AAA.quality === 'low'; if (sc.userData.tamed !== low || (low && ++this._tameTick % 30 === 0)) tame(sc, low); }
    // 'low': shadows of a moving scene drawn every other frame (where the place has not taken the shadow updates over
    // itself, as the hall does: it redraws them only when something changed). Measured: 4 of the storm glass's 17 ms.
    { const sm = this.renderer.shadowMap, low = AAA.quality === 'low';
      if (low && sm.autoUpdate) { sm.autoUpdate = false; this._smHalf = true; }
      if (this._smHalf) { if (!low) { sm.autoUpdate = true; this._smHalf = false; } else if ((this._smTick = (this._smTick || 0) + 1) % 2 === 0) sm.needsUpdate = true; } }
    // the GPU's own time for the frame (EXT_disjoint_timer_query_webgl2): read a few frames later, never waited for
    const T = this._gpuT; let q = null; if (T && !T.busy) { q = T.gl.createQuery(); T.gl.beginQuery(T.ext.TIME_ELAPSED_EXT, q); T.busy = true; }
    this.composer.render(dt);
    if (q) { T.gl.endQuery(T.ext.TIME_ELAPSED_EXT); T.pend.push(q); T.busy = false; } if (T) this.pollGpu();
    // a still of this frame for a dissolve (App.snapshot): read now, in the task that drew it, while the buffer still holds it
    if (this._snap) { const f = this._snap; this._snap = null; try { f(this.renderer.domElement); } catch (e) { console.warn(e); } }
  }
}

// Hook for passes owned by other modules (e.g. js/dio/focus.js: the explainer focus mask). The pass is inserted just
// before the grade pass (display-referred, after tone mapping); the returned function removes it again.
Gfx.prototype.addPass = function (pass, before = this.grade) {
  const P = this.composer.passes, i = P.indexOf(before); this.composer.insertPass(pass, i < 0 ? P.length : i);
  pass.setSize(innerWidth * this.dpr, innerHeight * this.dpr);
  return () => { const k = this.composer.passes.indexOf(pass); if (k >= 0) this.composer.removePass(pass); };
};
