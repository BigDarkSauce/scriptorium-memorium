// Instanced meadow (realism-playbook R2/R3, ported from Weatherglass): grass blades, flowers, reeds and cattails.
//
//  • One draw call per kind. A blade is a strip of rows plus a tip; each instance has aRoot (x, y, z, rand),
//    aShape (height, width, yaw, droop) and aTint (dry, damp, species, —). The vertex shader bends the blade as a
//    circular arc of constant length toward a wind bend vector (it never stretches), with travelling gust crests and
//    per-blade flutter; the normal is the blade's, turned to the eye and bent 45 % toward up so the meadow shades as
//    a sward. Colour is computed per vertex (meadow patches, lush damp swathes, a few straw-coloured dead blades,
//    darker roots, fresher tips, pale flanks on gust crests); light adds a back-lit translucency lobe.
//  • Card → real: blade height × grow, grow = 0 → 1 as the materialize front passes the blade's root, so the meadow
//    grows out of the paper. (The patch's uniforms are declared here with neutral defaults, so a material that is
//    never patched shows full-grown grass.)
//  • Distance LOD without popping: past a distance band a growing share of blades (by their own hash) collapses and
//    the survivors widen to keep the coverage.
//  • Scatter by the terrain field's suitability (js/gfx/terrain.js field.suit): 45 % of blades in tufts of 6–20.
//  • The meshes are flagged transparent (opacity 1, depth write on: the image is identical to opaque) so the focus
//    mask, contact shadows and ink outlines skip them: those passes draw meshes with generic materials, which would
//    pile every instance at the origin. raycast is disabled (the edit tool never picks 50 000 blades).
import * as THREE from 'three';
import { AAA, NOISE_GLSL } from './aaa.js';
import { mulberry } from '../util.js';

// shared wind: scenes write scene.userData.wind = [x, z] (m/s); every vegetation material reads this uniform
export const VEG = { uWind: { value: new THREE.Vector2(1.2, -.4) }, uGustT: { value: 0 } };
const _w = new THREE.Vector2();
export function vegWindFrom(scene) { const w = scene && scene.userData.wind; if (w) _w.set(+w[0] || 0, +w[1] || 0); else _w.set(1.2, -.4); VEG.uWind.value.lerp(_w, .08); }

export const VEG_QUALITY = { low: { density: 160, max: 18000, seg: 3, flowers: 0, reeds: .5 }, medium: { density: 380, max: 46000, seg: 4, flowers: 1, reeds: 1 }, high: { density: 820, max: 100000, seg: 5, flowers: 2, reeds: 1.6 } };

const VEG_HEAD = /* glsl */`
attribute vec4 aRoot; attribute vec4 aShape; attribute vec4 aTint;
uniform float uAaaTime; uniform vec2 uWind;
uniform int uFrontKind; uniform vec3 uFrontC; uniform vec3 uFrontN; uniform float uFrontR; uniform float uJitter;
varying vec3 vGCol; varying float vGT;
${NOISE_GLSL}
float vegFrontD(vec3 p){ vec3 q=floor(p*1.25); float hsh=fract(sin(dot(q,vec3(12.9898,78.233,45.164)))*43758.5453); float d = uFrontKind==0 ? distance(p,uFrontC) : dot(p-uFrontC,uFrontN); return d + (hsh-.5)*uJitter; }
vec3 vegArc(vec2 B, float L, float t, out vec3 T){ float th=max(length(B),.002); vec2 d=B/th; float a=th*t, s=sin(a), c=cos(a), r=L/th; T=vec3(d.x*s,c,d.y*s); return vec3(d.x*r*(1.-c), r*s, d.y*r*(1.-c)); }
vec2 vegWindBend(vec2 xz, float rnd, float stiff, out float gust){
  vec2 W=uWind; float sp=length(W); vec2 dir=sp>1e-4?W/sp:vec2(1,0), perp=vec2(-dir.y,dir.x); float along=dot(xz,dir); float t=uAaaTime;
  float wave=.5+.5*sin(along*2.3-t*(2.2+min(sp,4.)*.5)+aaaSimplex2(xz*.8)*5.); wave*=wave*(3.-2.*wave);
  float amt=(1.-exp(-sp*.55/stiff))*1.3*(.68+.64*wave);
  float fl=sin(t*(6.5+rnd*4.)+rnd*40.+along*5.), fl2=sin(t*(4.1+rnd*2.)+rnd*23.-along*3.); float flA=(.035+.035*min(sp,4.))/stiff;
  gust=wave*(1.-exp(-sp*.7)); return dir*(amt+fl*flA*.5)+perp*fl2*flA*.55; }
`;
// per kind: where the vertex lands (vegPos), its normal and its colour
const VEG_BODY = {
  grass: /* glsl */`
  float grow = smoothstep(0., .6, uFrontR - vegFrontD(aRoot.xyz));
  float dist = distance(aRoot.xyz, cameraPosition); float cull = smoothstep(VEG_LOD0, VEG_LOD1, dist);
  float H = aShape.x * grow * step(cull * .85, aRoot.w);
  float gust; vec2 B = vegWindBend(aRoot.xz, aRoot.w, 1., gust) * mix(.65, 1.3, clamp(H / .16, 0., 1.));
  B += vec2(-sin(aShape.z), cos(aShape.z)) * aShape.w;
  vec3 T; vec3 off = vegArc(B, H, position.y, T);
  float tw = aShape.z + (aRoot.w - .5) * 1.3 * position.y; vec3 side = vec3(cos(tw), 0., sin(tw));
  float wdt = aShape.y * mix(1., 1.8, cull) * pow(max(1. - pow(position.y, 1.5), 0.), .8);
  vec3 vegPos = aRoot.xyz + off + side * position.x * wdt;
  vec3 n = normalize(cross(side, T)); n *= sign(dot(n, cameraPosition - vegPos) + 1e-5);
  vec3 objectNormal = normalize(mix(n, vec3(0, 1, 0), .45));
  float p1 = aaaSimplex2(aRoot.xz * .9) * .5 + .5, p2 = aaaSimplex2(aRoot.xz * 3.1 + 7.) * .5 + .5;
  vec3 c = mix(vec3(.055, .105, .028), vec3(.12, .16, .045), p1) * mix(.8, 1.15, p2);
  c = mix(c, vec3(.05, .13, .04), aTint.y * .7);
  c = mix(c, vec3(.2, .17, .08), aTint.x * .55);
  c = mix(c, vec3(.32, .27, .13), step(.94, fract(aRoot.w * 17.9)));
  float t = position.y; vec3 tipC = c * 1.3 + vec3(.02, .025, .0);
  vGCol = mix(c * .32, tipC, pow(t, .75)) + vec3(.05, .06, .03) * gust * t; vGT = t;`,
  flower: /* glsl */`
  float grow = smoothstep(0., .6, uFrontR - vegFrontD(aRoot.xyz));
  float H = aShape.x * grow; float gust; vec2 B = vegWindBend(aRoot.xz, aRoot.w, 1.6, gust) * .8;
  float part = aTint.w; vec3 T; float ty = part > .5 ? 1. : position.y; vec3 top = vegArc(B, H, ty, T);
  float yaw = aShape.z; vec3 sd = vec3(cos(yaw), 0., sin(yaw)), fw = vec3(-sin(yaw), 0., cos(yaw));
  vec3 vegPos; vec3 objectNormal;
  if (part < .5) { vec3 eye = normalize(vec3(cameraPosition.x - aRoot.x, 0., cameraPosition.z - aRoot.z) + 1e-4); vec3 s2 = normalize(cross(vec3(0,1,0), eye)); vegPos = aRoot.xyz + top + s2 * position.x * .0035 * grow; objectNormal = eye; }
  else { float hs = aShape.y * grow; vegPos = aRoot.xyz + top + (sd * position.x + fw * position.z) * hs + vec3(0., position.y * hs, 0.); objectNormal = normalize(vec3(B.x * .3, 1., B.y * .3)); }
  int sp = int(aTint.z); vec3 pc = sp == 0 ? vec3(.85, .85, .8) : sp == 1 ? vec3(.9, .7, .05) : sp == 2 ? vec3(.18, .3, .85) : sp == 3 ? vec3(.45, .2, .7) : sp == 4 ? vec3(.85, .1, .06) : vec3(.75, .5, .8);
  vGCol = part < .5 ? vec3(.06, .11, .03) : pc; vGT = part < .5 ? position.y : 1. + length(position.xz) * 2.;`,
  reed: /* glsl */`
  float grow = smoothstep(0., .6, uFrontR - vegFrontD(aRoot.xyz));
  float H = aShape.x * grow; float gust; vec2 B = vegWindBend(aRoot.xz, aRoot.w, 2.2, gust) * .7 + vec2(-sin(aShape.z), cos(aShape.z)) * aShape.w;
  float part = aTint.w; vec3 T; vec3 vegPos; vec3 objectNormal;
  if (part < .5) { vec3 off = vegArc(B, H, position.y, T); float tw = aShape.z + position.y * .6; vec3 side = vec3(cos(tw), 0., sin(tw));
    vegPos = aRoot.xyz + off + side * position.x * aShape.y * (1. - position.y * .85); vec3 n = normalize(cross(side, T)); n *= sign(dot(n, cameraPosition - vegPos) + 1e-5); objectNormal = normalize(mix(n, vec3(0,1,0), .3));
    vGCol = mix(vec3(.05, .08, .03), vec3(.16, .19, .07), position.y) * mix(1., .8, aTint.x); }
  else { float cat = step(.5, aTint.z); vec3 c0 = vegArc(B, H * 1.05, .78, T); vegPos = aRoot.xyz + c0 + T * position.y * H * .2 * cat + vec3(position.x, 0., position.z) * .011 * cat * grow;
    objectNormal = normalize(vec3(position.x, 0.2, position.z) + 1e-4); vGCol = vec3(.18, .1, .05); }
  vGT = position.y;`
};
export function vegMaterial(kind = 'grass', { lod = [5, 14] } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: kind === 'flower' ? .6 : .72, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 1, envMapIntensity: .6 });
  m.forceSinglePass = true;   // transparent + double-sided would otherwise draw twice
  m.defines = { VEG_KIND: kind === 'grass' ? 0 : kind === 'flower' ? 1 : 2, VEG_LOD0: lod[0].toFixed(2), VEG_LOD1: lod[1].toFixed(2) }; m.defines['VEG_' + kind.toUpperCase()] = '';
  m.onBeforeCompile = s => {
    const def = { uFrontKind: { value: 0 }, uFrontC: { value: new THREE.Vector3() }, uFrontN: { value: new THREE.Vector3(1, 0, 0) }, uFrontR: { value: 1e5 }, uJitter: { value: 0 } };
    for (const k in def) if (!s.uniforms[k]) s.uniforms[k] = def[k];
    s.uniforms.uAaaTime = AAA.uniforms.uAaaTime; s.uniforms.uWind = VEG.uWind;
    s.vertexShader = VEG_HEAD + s.vertexShader.replace('#include <beginnormal_vertex>', VEG_BODY[kind]).replace('#include <begin_vertex>', 'vec3 transformed = vegPos;');
    s.fragmentShader = 'varying vec3 vGCol; varying float vGT;\n' + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vGCol;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        { vec3 L = directionalLights[0].direction; float back = pow(saturate(dot(normalize(-vViewPosition), L)), 3.); reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor * vec3(1., 1.15, .55) * back * ${kind === 'flower' ? '.3' : '.9'} * smoothstep(0., .6, vGT); }
        #endif
        reflectedLight.indirectDiffuse *= mix(.35, 1., smoothstep(0., .7, vGT));`);
  };
  m.customProgramCacheKey = () => 'veg-' + kind;
  m.userData.preset = 'veg-' + kind;
  return m;
}
// blade / stem geometry (instanced)
function bladeGeo(seg) {
  const P = [], I = [];
  for (let i = 0; i < seg; i++) { const t = i / seg; P.push(-.5, t, 0, .5, t, 0); }
  P.push(0, 1, 0);
  for (let i = 0; i < seg - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (seg - 1) * 2; I.push(a, a + 1, seg * 2);
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); return g;
}
function instAttrs(g, list, part) {
  const n = list.length, R = new Float32Array(n * 4), S = new Float32Array(n * 4), T = new Float32Array(n * 4);
  list.forEach((b, i) => { R.set([b.x, b.y, b.z, b.r], i * 4); S.set([b.h, b.w, b.yaw, b.droop || 0], i * 4); T.set([b.dry || 0, b.damp || 0, b.sp || 0, part || 0], i * 4); });
  g.setAttribute('aRoot', new THREE.InstancedBufferAttribute(R, 4)); g.setAttribute('aShape', new THREE.InstancedBufferAttribute(S, 4)); g.setAttribute('aTint', new THREE.InstancedBufferAttribute(T, 4));
  g.instanceCount = n;
}
function vegMesh(g, mat, field, name) {
  const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.raycast = () => {};
  m.userData.noInk = true; m.userData.noContact = true;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(field.minX + field.w / 2, .5, field.minZ + field.d / 2), Math.hypot(field.w, field.d) / 2 + 1);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(field.minX, -1, field.minZ), new THREE.Vector3(field.minX + field.w, 2, field.minZ + field.d));
  m.onBeforeRender = (r, scene) => vegWindFrom(scene);
  return m;
}
// rejection-sample points by suitability over the field; tuft: fraction clustered
function scatter(field, kind, n, rng, tuft = 0, tuftR = [.025, .06], tuftN = [6, 20], region) {
  const out = [], x0 = region ? region[0] : field.minX, z0 = region ? region[1] : field.minZ, w = region ? region[2] - region[0] : field.w, d = region ? region[3] - region[1] : field.d;
  let guard = n * 30;
  while (out.length < n && guard-- > 0) {
    const x = x0 + rng() * w, z = z0 + rng() * d, s = field.suit(x, z, kind); if (rng() > s) continue;
    if (tuft && rng() < tuft) { const k = tuftN[0] + Math.floor(rng() * (tuftN[1] - tuftN[0])), R = tuftR[0] + rng() * (tuftR[1] - tuftR[0]);
      for (let i = 0; i < k && out.length < n; i++) { const a = rng() * 6.283, rr = R * Math.sqrt(rng()), px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (field.suit(px, pz, kind) > .05) out.push({ x: px, z: pz, s, tuft: 1 }); } }
    else out.push({ x, z, s });
  }
  return out;
}
const suitArea = (field, kind, rng) => { let a = 0; const N = 900; for (let i = 0; i < N; i++) a += field.suit(field.minX + rng() * field.w, field.minZ + rng() * field.d, kind); return a / N * field.w * field.d; };

export function grassField(field, o = {}) {
  const Q = VEG_QUALITY[AAA.quality] || VEG_QUALITY.medium, rng = mulberry(o.seed || 77);
  const n = Math.min(o.max || Q.max, Math.round(suitArea(field, 'grass', rng) * (o.density || Q.density) * (o.amount ?? 1)));
  const pts = scatter(field, 'grass', n, rng, .45);
  const H = o.height || 1, lv = field.lake ? field.lake.level : -9;
  const list = pts.map(p => { const r = rng(), damp = Math.max(0, 1 - (field.h(p.x, p.z) - lv) / .25); return { x: p.x, y: field.h(p.x, p.z) - .004, z: p.z, r, h: (.042 + .07 * r * r + .03 * damp) * H * (.55 + .45 * p.s), w: .009 + rng() * .008, yaw: rng() * 6.283, droop: .15 + rng() * .35, dry: Math.max(0, field.slope(p.x, p.z) - .25) * 1.5, damp }; });
  const g = bladeGeo(Q.seg); instAttrs(g, list);
  const m = vegMesh(g, vegMaterial('grass', { lod: o.lod || [5, 15] }), field, 'grass');
  m.userData.stats = { blades: list.length, triangles: list.length * (2 * Q.seg - 1) };
  return m;
}
function flowerGeo() {
  // stem strip (part 0: x ∈ ±.5, y 0..1) + a petal disc (part 1: 8-fan, radius 1, slightly cupped)
  const P = [], I = [], part = [];
  for (let i = 0; i < 3; i++) { const t = i / 2; P.push(-.5, t, 0, .5, t, 0); part.push(0, 0); }
  I.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4);
  const c = P.length / 3; P.push(0, 0, 0); part.push(1);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? .55 : 1; P.push(Math.cos(a) * r, .25 * r, Math.sin(a) * r); part.push(1); }
  for (let i = 0; i < 10; i++) I.push(c, c + 1 + i, c + 1 + (i + 1) % 10);
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setIndex(I); return g;
}
export function flowerField(field, o = {}) {
  const Q = VEG_QUALITY[AAA.quality] || VEG_QUALITY.medium; if (!Q.flowers && !o.force) return null;
  const rng = mulberry(o.seed || 91), n = Math.round(Math.min(7000, suitArea(field, 'flower', rng) * 28 * Q.flowers * (o.amount ?? 1)));
  if (n < 1) return null;
  const pts = scatter(field, 'flower', n, rng, .6, [.05, .14], [3, 9]);
  const patch = (x, z) => Math.floor((Math.sin(x * 1.7 + 3) * Math.cos(z * 1.3) * .5 + .5) * 5.99);
  const list = pts.map(p => ({ x: p.x, y: field.h(p.x, p.z) - .003, z: p.z, r: rng(), h: .06 + rng() * .07, w: .009 + rng() * .006, yaw: rng() * 6.283, sp: rng() < .7 ? patch(p.x, p.z) : Math.floor(rng() * 6) }));
  const g = flowerGeo(); instAttrs(g, list);
  const mat = vegMaterial('flower'); const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = s => { prev(s); s.vertexShader = 'attribute float aPart;\n' + s.vertexShader.replace('float part = aTint.w;', 'float part = aPart;'); };
  const m = vegMesh(g, mat, field, 'flowers'); m.userData.stats = { flowers: list.length, triangles: list.length * 14 }; return m;
}
function reedGeo() {
  const P = [], I = [], part = [];
  for (let i = 0; i < 4; i++) { const t = i / 4; P.push(-.5, t, 0, .5, t, 0); part.push(0, 0); }
  P.push(0, 1, 0); part.push(0);
  for (let i = 0; i < 3; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } I.push(6, 7, 8);
  const c = P.length / 3;   // cattail spindle: 4 sides × 2 rings (part 1)
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; P.push(Math.cos(a), r, Math.sin(a)); part.push(1); }
  for (let k = 0; k < 4; k++) { const a = c + k, b = c + (k + 1) % 4; I.push(a, b, a + 4, b, b + 4, a + 4); }
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setIndex(I); return g;
}
export function reedField(field, o = {}) {
  const Q = VEG_QUALITY[AAA.quality] || VEG_QUALITY.medium, rng = mulberry(o.seed || 55);
  const n = Math.round(Math.min(2400, suitArea(field, 'reed', rng) * 900 * Q.reeds * (o.amount ?? 1))); if (n < 1) return null;
  const pts = scatter(field, 'reed', n, rng, .7, [.03, .09], [4, 12]);
  const list = pts.map(p => ({ x: p.x, y: field.h(p.x, p.z) - .004, z: p.z, r: rng(), h: .14 + rng() * .16, w: .012 + rng() * .008, yaw: rng() * 6.283, droop: .1 + rng() * .3, sp: rng() < .35 ? 1 : 0, dry: rng() * .5 }));
  const g = reedGeo(); instAttrs(g, list);
  const mat = vegMaterial('reed'); const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = s => { prev(s); s.vertexShader = 'attribute float aPart;\n' + s.vertexShader.replace('float part = aTint.w;', 'float part = aPart;'); };
  const m = vegMesh(g, mat, field, 'reeds'); m.userData.stats = { reeds: list.length, triangles: list.length * 15 }; return m;
}
