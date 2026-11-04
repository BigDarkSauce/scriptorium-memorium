// Drawing → real materialisation, generalised from flat-to-3d (02 section sweep, 06 card model) and lintel (top-down).
// Principle (from those projects): the drawing IS the real 3D model.
//  • "Flat" = a real perspective camera with a very long lens far away; a dolly zoom opens it while the frame height stays fixed.
//  • The change is a FIELD in world space compared with one animated uniform: behind the front a surface renders as
//    card/ink, past it as its real material, with a glowing amber seam on the boundary.
//  • Ink edges are real edge geometry, faded by the same field. Back faces through a section cut render as poché ink.
import * as THREE from 'three';

export const PAPER = new THREE.Color('#f3f0e8'), INK = new THREE.Color('#1d1c19'), AMBER = new THREE.Color('#e85d04');
const KIND = { sphere: 0, plane: 1 };

// Shared uniforms: one object for every patched material in a scene.
export function makeFrontUniforms() {
  return {
    uFrontKind: { value: 0 }, uFrontC: { value: new THREE.Vector3() }, uFrontN: { value: new THREE.Vector3(1, 0, 0) },
    uFrontR: { value: 1e5 }, uFrontW: { value: .18 }, uSeamK: { value: 0 }, uFrontCol: { value: new THREE.Color(2.15, .82, .24) },
    uJitter: { value: .35 }, uPaper: { value: PAPER.clone() }, uInk: { value: INK.clone() }, uPoche: { value: 0 }, uCardMix: { value: 1 }
  };
}
const FRONT_GLSL = `
uniform int uFrontKind; uniform vec3 uFrontC; uniform vec3 uFrontN; uniform float uFrontR; uniform float uFrontW; uniform float uSeamK;
uniform vec3 uFrontCol; uniform float uJitter; uniform vec3 uPaper; uniform vec3 uInk; uniform float uPoche; uniform float uCardMix;
varying vec3 vFrontW;
float frontHash(vec3 p){ p=floor(p*1.25); return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
float frontD(vec3 p){ float d = uFrontKind==0 ? distance(p,uFrontC) : dot(p-uFrontC,uFrontN); return d + (frontHash(p)-.5)*uJitter; }
`;
export function patchMaterial(mat, U) {
  if (!mat || mat.userData.frontPatched || mat.isShaderMaterial || mat.isLineBasicMaterial || mat.isPointsMaterial || mat.isSpriteMaterial) return mat;
  mat.userData.frontPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    Object.assign(s.uniforms, U);
    s.vertexShader = 'varying vec3 vFrontW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vFrontW = (modelMatrix * vec4(transformed,1.0)).xyz;\n#ifdef USE_INSTANCING\n vFrontW = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;\n#endif');
    if (!s.vertexShader.includes('vFrontW =')) s.vertexShader = s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vFrontW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    let f = FRONT_GLSL + s.fragmentShader;
    const isLit = f.includes('#include <emissivemap_fragment>');
    const cardBlock = `
      float fdv = frontD(vFrontW); float isCard = (1.0 - step(fdv, uFrontR)) * uCardMix;
      float seamD = abs(fdv-uFrontR); float seamV = uSeamK*(exp(-pow(seamD/uFrontW,2.))*1.15 + .28*exp(-pow(seamD/(uFrontW*4.5),2.)));`;
    if (isLit) {
      f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${cardBlock}
      diffuseColor.rgb = mix(diffuseColor.rgb, uPaper, isCard);
      totalEmissiveRadiance *= (1.0-isCard);
      #ifdef USE_TRANSMISSION
      #endif
      `);
      f = f.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.roughness = mix(material.roughness, .92, isCard);
      material.diffuseColor = mix(material.diffuseColor, uPaper, isCard);
      material.specularColor = mix(material.specularColor, vec3(.04), isCard);
      #ifdef USE_TRANSMISSION
      material.transmission *= (1.0-isCard*.7);
      #endif`);
      f = f.replace('#include <opaque_fragment>', `
      #ifdef OPAQUE
      if(uPoche>0.5 && !gl_FrontFacing){ outgoingLight = mix(outgoingLight, uInk, max(isCard, .85)); }
      #endif
      outgoingLight += uFrontCol*seamV;
      #include <opaque_fragment>`);
    } else {
      f = f.replace('#include <opaque_fragment>', `${cardBlock}
      outgoingLight = mix(outgoingLight, uPaper*.9, isCard);
      outgoingLight += uFrontCol*seamV;
      #include <opaque_fragment>`);
    }
    s.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'front-' + (prev ? 'p' : '') + mat.type;
  mat.needsUpdate = true;
  return mat;
}
// Ink edge material (lines), faded by the same field: solid in the drawing, faint once real.
export function inkMaterial(U, after = .0) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uAfter: { value: after }, uOpacity: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vFrontW;void main(){vec4 w=modelMatrix*vec4(position,1.);vFrontW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;gl_Position.z-=0.0008*gl_Position.w;}',
    fragmentShader: FRONT_GLSL + `uniform float uAfter; uniform float uOpacity;
      void main(){ float fdv=frontD(vFrontW); float isCard=1.0-step(fdv,uFrontR); float seamD=abs(fdv-uFrontR);
        float a = mix(uAfter, 1.0, isCard) * uOpacity; vec3 c = mix(uInk, vec3(1.,.5,.15), uSeamK*exp(-pow(seamD/uFrontW,2.)));
        if(a<.01) discard; gl_FragColor=vec4(c,a); }`
  });
}
// Attach ink edges to every mesh under root (skips huge/organic meshes to stay clean).
export function addInk(root, U) {
  const mat = inkMaterial(U); const added = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.noInk || o.userData.isInk) return;
    const g = o.geometry; if (!g || !g.attributes.position) return;
    const n = g.attributes.position.count; if (n > 60000) return;
    const eg = new THREE.EdgesGeometry(g, o.userData.inkAngle || 28);
    if (eg.attributes.position.count > 30000) { eg.dispose(); return; }
    const ls = new THREE.LineSegments(eg, mat); ls.userData.isInk = true; ls.raycast = () => {}; ls.renderOrder = 2;
    added.push([o, ls]);
  });
  added.forEach(([o, ls]) => o.add(ls));
  return mat;
}
// Inverted-hull outlines: a back-face shell pushed out along normals, drawn in ink only while the surface is still a drawing.
// Gives crisp, resolution-independent contour lines (WebGL line width is always 1 px).
export function addOutlines(root, U, thick = .03) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uThick: { value: thick } }, side: THREE.BackSide, clipping: true,
    vertexShader: 'uniform float uThick; varying vec3 vFrontW; void main(){ vec3 n=normalize(normal); vec4 w=modelMatrix*vec4(position,1.); vec3 wn=normalize(mat3(modelMatrix)*n); w.xyz+=wn*uThick; vFrontW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: FRONT_GLSL + 'void main(){ float fdv=frontD(vFrontW); float isCard=(1.0-step(fdv,uFrontR))*uCardMix; if(isCard<.5) discard; gl_FragColor=vec4(uInk,1.); }'
  });
  mat.userData.hull = true;
  const list = [];
  root.traverse(o => { if (!o.isMesh || o.userData.noInk || o.userData.isInk || !o.geometry || !o.geometry.attributes.normal) return; if (o.material && [].concat(o.material).some(m => m.transparent)) return; if (o.geometry.attributes.position.count > 40000) return; list.push(o); });
  list.forEach(o => { const h = new THREE.Mesh(o.geometry, mat); h.userData.isInk = true; h.raycast = () => {}; h.castShadow = false; h.receiveShadow = false; h.renderOrder = -1; o.add(h); });
  return mat;
}
export function patchTree(root, U) { root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => patchMaterial(m, U)); }); }

// ---------- camera keys (dolly zoom in tan space, frame height in log space) ----------
// key: {target:Vector3, dir:Vector3 (from target to camera), fov (deg), frameH}
export function poseAt(a, b, u, out = {}) {
  const ta = Math.tan(a.fov * Math.PI / 360), tb = Math.tan(b.fov * Math.PI / 360), th = ta + (tb - ta) * u;
  const fov = 2 * Math.atan(th) * 180 / Math.PI, frameH = Math.exp(Math.log(a.frameH) + (Math.log(b.frameH) - Math.log(a.frameH)) * u);
  const dir = a.dir.clone().lerp(b.dir, u).normalize(), target = a.target.clone().lerp(b.target, u);
  const dist = frameH / 2 / th;
  out.fov = fov; out.target = target; out.position = target.clone().addScaledVector(dir, dist); out.dist = dist; return out;
}
export function applyPose(cam, pose, radius = 20) {
  cam.fov = pose.fov; cam.position.copy(pose.position); cam.lookAt(pose.target);
  cam.near = Math.max(.05, pose.dist - radius * 2.2); cam.far = pose.dist + radius * 4 + 50; cam.updateProjectionMatrix();
}

// ---------- the three techniques ----------
const span = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const sstep = t => t * t * (3 - 2 * t);
const eInCont = x => x * x * (2.3 - 1.3 * x);
export const TECHNIQUES = {
  // 06 Card Model: a white card model on the drafting desk; parts drop in; a sphere from the lamp turns card into the real world.
  card: {
    flat: (c, R) => ({ target: c.clone(), dir: new THREE.Vector3(.62, .55, .56).normalize(), fov: 2.2, frameH: R * 2.4 }),
    field: (c, R, U) => { U.uFrontKind.value = KIND.sphere; U.uFrontC.value.copy(c).add(new THREE.Vector3(-R * .9, R * 1.2, R * .6)); U.uFrontN.value.set(0, 1, 0); },
    frontAt: (t, R) => -R * .3 + sstep(span(t, .38, .95)) * R * 3.6,
    build: true
  },
  // 02 Section Sweep: the section seen dead-on through an extreme telephoto; a vertical cut plane scans left→right turning ink into light.
  sweep: {
    flat: (c, R) => ({ target: c.clone(), dir: new THREE.Vector3(0, .02, 1).normalize(), fov: .9, frameH: R * 1.9 }),
    field: (c, R, U) => { U.uFrontKind.value = KIND.plane; U.uFrontC.value.copy(c); U.uFrontN.value.set(1, 0, 0); },
    frontAt: (t, R) => -R * 1.3 + sstep(span(t, .3, .92)) * R * 2.7,
    poche: true
  },
  // Lintel Top-Down: the plan seen from straight above (3° lens), cut at a low height; the cut rises and the camera tilts into perspective.
  topdown: {
    flat: (c, R) => ({ target: c.clone(), dir: new THREE.Vector3(0, 1, .012).normalize(), fov: 3, frameH: R * 2.3 }),
    field: (c, R, U) => { U.uFrontKind.value = KIND.sphere; U.uFrontC.value.copy(c); },
    frontAt: (t, R) => -R * .2 + sstep(span(t, .45, .92)) * R * 2.2,
    cut: true, poche: true
  }
};

// Drives one materialisation. setProgress(t) is pure (0..1): scroll-able, replayable, recordable.
export class Materializer {
  constructor({ scene, camera, world, U, technique = 'card', endKey, center, radius, onBuild, env }) {
    this.env = env; this.bg0 = scene.background; this.fog0 = scene.fog; this.paperBg = new THREE.Color('#ddd5c4');
    this.scene = scene; this.camera = camera; this.world = world; this.U = U; this.T = TECHNIQUES[technique] || TECHNIQUES.card; this.name = technique;
    this.c = center.clone(); this.R = radius; this.endKey = endKey; this.onBuild = onBuild;
    this.flatKey = this.T.flat(this.c, this.R); this.T.field(this.c, this.R, U);
    U.uPoche.value = this.T.poche ? 1 : 0;
    this.cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5); this.maxY = 0;
    const box = new THREE.Box3().setFromObject(world); this.minY = box.min.y; this.maxY = box.max.y;
    // build order for the card technique: actors and decor drop in, shortest/lowest first
    this.parts = world.children.filter(o => !o.userData.isInk).map((o, i) => ({ o, y0: o.position.y, s0: o.scale.clone(), i, h: new THREE.Box3().setFromObject(o).max.y }));
    this.parts.sort((a, b) => a.h - b.h);
    if (this.T.cut) world.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { if (m.userData.hull) m.clippingPlanes = [this.cut]; else if (!m.isShaderMaterial) { m.clippingPlanes = [this.cut]; if (!m.transparent && m.side !== THREE.BackSide) m.side = THREE.DoubleSide; } }); });
    this.pose = {}; this.buildIn = false;
  }
  setProgress(t) {
    const U = this.U, T = this.T, R = this.R;
    // camera: hold the drawing, then dolly-zoom + swing into the end key
    const kCam = eInCont(span(t, .1, .82));
    poseAt(this.flatKey, this.endKey, kCam, this.pose); applyPose(this.camera, this.pose, R * 1.6);
    // build-in (card): parts drop with a soft bounce in order of height
    if (T.build && this.buildIn) {
      const n = this.parts.length;
      this.parts.forEach((p, i) => {
        const a = .02 + .3 * i / Math.max(1, n), k = span(t, a, a + .12);
        const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1, bounce = k > 0 && k < 1 ? Math.sin(k * Math.PI * 2.5) * Math.exp(-6 * k) * .08 : 0;
        p.o.position.y = p.y0 + (1 - e) * R * .9 + bounce * R * .1;
        p.o.visible = !p.o.userData.hiddenByUser && (t > a - .001 || t >= 1);
      });
    }
    // section cut rising (top-down)
    if (T.cut) { const kr = sstep(span(t, .12, .62)); this.cut.constant = kr >= 1 ? 1e5 : this.minY + (this.maxY - this.minY) * (.35 + .7 * kr); }
    // the drawing sits on paper; the real environment (sky, stars, fog) arrives once the front has crossed the model
    const drawing = t < .74;
    if (drawing !== this._drawing) { this._drawing = drawing; this.scene.background = drawing ? this.paperBg : this.bg0; this.scene.fog = drawing ? null : this.fog0; ((this.env && this.env.bgObjects) || []).forEach(o => { o.visible = !drawing; }); }
    // the front
    U.uFrontR.value = t >= 1 ? 1e5 : T.frontAt(t, R);
    U.uSeamK.value = t > .02 && t < .99 ? 1 : 0;
    U.uJitter.value = R * .06;
  }
  sketchFrame() { this.setProgress(0); }
  finish() { this.setProgress(1); this._drawing = null; this.setProgress(1); this.parts.forEach(p => { p.o.position.y = p.y0; }); this.cut.constant = 1e5; this.U.uFrontR.value = 1e5; this.U.uSeamK.value = 0; }
}
