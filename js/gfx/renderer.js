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

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: .32 }, uGrain: { value: .035 }, uWarm: { value: .02 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(1, .97, .9) }, uContrast: { value: 1 }, uSat: { value: 1 }, uLift: { value: 0 }, uTilt: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 800) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uVignette,uGrain,uWarm,uFade,uContrast,uSat,uLift,uTilt;uniform vec2 uRes;uniform vec3 uFadeColor;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;
  if(uTilt>0.){float b=uTilt*smoothstep(.16,.5,abs(vUv.y-.46))*2.2;if(b>.05){vec3 s=c.rgb;for(int i=0;i<8;i++){float a=float(i)*.785+.39;s+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*b/uRes).rgb;}c.rgb=s/9.;}}
  float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,uSat);
  c.rgb=clamp(c.rgb+uLift,0.,1.);c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),clamp((uContrast-1.)*2.5,0.,1.));
  float v=1.-uVignette*smoothstep(.25,.85,length(d*vec2(1.15,1.)));
  c.rgb*=v;c.rgb+=vec3(uWarm,uWarm*.4,-uWarm*.6)*(1.-length(d));
  float g=(h(vUv*vec2(1920.,1080.)+fract(uTime*7.))-.5)*uGrain;c.rgb+=g;
  c.rgb=mix(c.rgb,uFadeColor,uFade);gl_FragColor=c;}`
};

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = .9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = Math.min(this.maxDpr, 1.5);
    r.setPixelRatio(this.dpr);
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    c.addPass(this.renderPass);
    this.outline = new OutlinePass(new THREE.Vector2(2, 2), this.renderPass.scene, this.renderPass.camera);
    Object.assign(this.outline, { edgeStrength: 4, edgeGlow: .6, edgeThickness: 1.4, pulsePeriod: 2.4 });
    this.outline.visibleEdgeColor.set('#ffd98a'); this.outline.hiddenEdgeColor.set('#7a5a20'); this.outline.enabled = false;
    c.addPass(this.outline);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), .32, .55, .86); c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    this.pmrem = new THREE.PMREMGenerator(r); this.envs = {};
    this.makeStudioEnv();
    this.frameMs = 16; this._acc = 0; this._n = 0; this.lowQ = false;
    this.resize(); addEventListener('resize', () => { cancelAnimationFrame(this._rz); this._rz = requestAnimationFrame(() => this.resize()); });
    // WebGL context loss (GPU reset, driver update, too many tabs): three.js stops drawing and restores its own state;
    // the app pauses, rebuilds the pre-filtered environments (render-target contents are lost) and reopens the place.
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.showLost(true); }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false; this.showLost(false);
      try { const old = this.envStudio; this.makeStudioEnv(); const kinds = Object.keys(this.envs); this.envs = {}; kinds.forEach(k => this.envFor(k)); if (old && old !== this.envStudio) old.dispose(); } catch (e) { console.warn(e); }
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
    u.uVignette.value = L.vignette ?? .32; u.uTilt.value = L.tilt ?? 0; u.uGrain.value = L.grain ?? .035; u.uWarm.value = L.warm ?? .02;
    if (L.exposure != null) this.renderer.toneMappingExposure = L.exposure;
    if (L.bloom != null) this.bloom.strength = L.bloom;
    this.bloom.threshold = L.bloomThreshold ?? .86; this.bloom.radius = L.bloomRadius ?? .55;
    this.renderer.toneMapping = L.toneMapping ?? THREE.AgXToneMapping; // (OutputPass applies it; scenes without a look keep AgX)
  }
  // The house look of the library and the book rooms: crisp, warm daylight. The neutral studio environment is kept
  // low in these scenes (its grey reflections in lacquer, scagliola and the polished floor were the milky veil; gilt
  // compensates with its own envMapIntensity); bloom only on real highlights (flames, windows); a little contrast.
  static get HOUSE() {
    return { contrast: 1.06, sat: 1.05, lift: 0, vignette: .3, grain: .022, warm: .012, exposure: 1.35, bloom: .2, bloomThreshold: 1.6, bloomRadius: .4, toneMapping: THREE.NeutralToneMapping };
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
    }
  }
  render(dt, t) {
    this.grade.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}
