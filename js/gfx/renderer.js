// One shared WebGL renderer + post chain for every mode (hub, room, diorama).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: .32 }, uGrain: { value: .035 }, uWarm: { value: .02 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(1, .97, .9) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uVignette,uGrain,uWarm,uFade;uniform vec3 uFadeColor;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;float v=1.-uVignette*smoothstep(.25,.85,length(d*vec2(1.15,1.)));
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
    const pm = new THREE.PMREMGenerator(r);
    this.envStudio = pm.fromScene(new RoomEnvironment(), .035).texture;
    this.pmrem = pm;
    this.frameMs = 16; this._acc = 0; this._n = 0; this.lowQ = false;
    this.resize(); addEventListener('resize', () => this.resize());
  }
  setView(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    this.outline.renderScene = scene; this.outline.renderCamera = camera;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr); this.composer.setSize(w, h);
    if (this.camera && this.camera.isPerspectiveCamera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  // Adaptive resolution: keep frames under ~22 ms
  adapt(dtMs) {
    this._acc += dtMs; this._n++;
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
