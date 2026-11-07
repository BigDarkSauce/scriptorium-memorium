// Analytic water (realism-playbook R4/R5, ported from Weatherglass): a lake, a river ribbon, a waterfall sheet and a
// plunge pool, all on the terrain field (js/gfx/terrain.js).
//
//  • Lake: depth = level − field height (no depth-buffer read); wind-driven wave trains + advected capillary chop whose
//    octaves fade once they are finer than a pixel (their slope variance widens the glint instead of aliasing);
//    refracted path to the bed and Beer–Lambert transmittance T = e^(−σ·path) with σ = (2.65, .92, 1.04) per unit
//    (red dies first); TWO PASSES without sorting or a screen copy: pass 1 multiplies what is behind by T·(1−F)
//    (blend Zero, SrcColor), pass 2 adds in-scatter + sky reflection·F + sun glint (normalised Blinn–Phong, D·F/(4 N·V):
//    a low sun stretches into a path) + glitter (Cox–Munk facets) + a breathing lapping foam line + rain rings.
//    No transmission anywhere: three's transmission pre-pass (a full re-render of every opaque object) is gone.
//  • Sun shadow on the water: the sun's shadow map and matrix are passed in and compared by hand (r170: RGBA-packed
//    depth, unpackRGBAToDepth), 4 taps.
//  • River: a ribbon along the field's river spline (skipping the waterfall run), flow-space advected streaks and foam
//    that lag at the banks, whitewater where it is steep, froth below the fall. Waterfall: a strip down the cliff,
//    frayed edges opening into strands, aeration as it falls, back-lit glow; a foam disc and spray at its foot.
//  • Card → real: ShaderMaterials are not patched by the materializer; each material here exposes
//    userData.onFront(U) (called by materialize.js patchMaterial) to take the scene's front uniforms, and renders
//    nothing while its surface is still a drawing (the paper bed shows).
import * as THREE from 'three';
import { AAA, NOISE_GLSL } from './aaa.js';
import { FRONT_GLSL, makeFrontUniforms, CLOUD_SH_U } from './materialize.js';
import { FIELD_GLSL, fieldUniforms } from './terrain.js';
import { VEG } from './grass.js';

// lighting uniforms shared by every water and cloud material of the current scene (filled from the environment)
export const SKY_U = {
  uSunDir: { value: new THREE.Vector3(.4, .8, .3) }, uSunCol: { value: new THREE.Color(3, 2.8, 2.5) }, uSkyCol: { value: new THREE.Color(.5, .65, .9) },
  uHorCol: { value: new THREE.Color(.75, .8, .85) }, uGndCol: { value: new THREE.Color(.1, .1, .06) },
  uSunShadow: { value: null }, uSunShadowM: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }
};
const _d = new THREE.Vector3(); let _lastEnv = null, _lastT = -1;
export function skyFrom(scene) {
  const R = scene && scene.userData.envR; if (!R || !R.sun) return;
  const t = AAA.uniforms.uAaaTime.value; if (R === _lastEnv && t === _lastT) return; _lastEnv = R; _lastT = t;
  const s = R.sun; _d.copy(s.position).sub(s.target.position).normalize(); SKY_U.uSunDir.value.copy(_d);
  SKY_U.uSunCol.value.copy(s.color).multiplyScalar(s.intensity);
  if (R.hemi) { SKY_U.uSkyCol.value.copy(R.hemi.color).multiplyScalar(Math.max(.05, R.hemi.intensity)); SKY_U.uGndCol.value.copy(R.hemi.groundColor); }
  const fogC = scene.fog ? scene.fog.color : null; if (fogC) SKY_U.uHorCol.value.copy(fogC);
  const map = s.shadow && s.shadow.map; SKY_U.uShadowOn.value = map && s.castShadow ? 1 : 0; if (map) { SKY_U.uSunShadow.value = map.texture; SKY_U.uSunShadowM.value.copy(s.shadow.matrix); }
}
const COMMON = /* glsl */`
uniform float uAaaTime, uAaaRain; uniform vec4 uAaaWetSpot; uniform vec2 uWind;
uniform vec3 uSunDir, uSunCol, uSkyCol, uHorCol, uGndCol; uniform sampler2D uSunShadow; uniform mat4 uSunShadowM; uniform float uShadowOn;
${NOISE_GLSL}
${FIELD_GLSL}
#include <packing>
float wN(vec2 p){ return aaaSimplex2(p)*.5+.5; }
vec2 wRot(vec2 v, float a){ float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }
float wFres(float c){ return .02 + .98*pow(1.-c, 5.); }
vec3 wSky(vec3 R){ float up = clamp(R.y, 0., 1.); vec3 c = mix(uHorCol*1.1, uSkyCol*2.2, pow(up, .6)); return c + uSunCol * pow(max(dot(R, uSunDir), 0.), 600.) * 6.; }
vec3 wLand(float up){ vec3 lit = uSkyCol*.5 + uSunCol*max(uSunDir.y,0.)*.3; return mix(vec3(.07,.085,.05)*lit, wSky(vec3(0.,up,0.)), .18); }
float wShadow(vec3 p){ if (uShadowOn < .5) return 1.; vec4 c = uSunShadowM * vec4(p, 1.); vec3 s = c.xyz / c.w; if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1.) return 1.;
  float o = 1. / 2048., v = 0.; for (int i = 0; i < 4; i++) { vec2 d = vec2(i == 1 ? 1. : i == 3 ? -1. : 0., i == 0 ? 1. : i == 2 ? -1. : 0.) * o * 1.5; v += step(s.z - .0015, unpackRGBAToDepth(texture2D(uSunShadow, s.xy + d))); } return v * .25; }
void wTrain(inout vec3 acc, vec2 p, vec2 d, float lambda, float steep, float spd, float t, float ph){ float k = 6.2831853/lambda; float f = (dot(d,p) - t*spd)*k + ph; acc += vec3(steep/k*sin(f), steep*cos(f)*d); }
vec3 wWaves(vec2 p, float t, out float rough, out vec2 dir){
  vec2 w = uWind; float sp = length(w); dir = sp > 1e-4 ? w/sp : vec2(1.,0.);
  float paw = wN((p - dir*t*(.45+sp*.32))*.85 + 11.3), paw2 = wN((p - dir*t*(.6+sp*.4))*2.1 - 4.7);
  rough = .07 + smoothstep(.12, 3.4, sp)*(.45 + 1.35*smoothstep(.42,.8,paw) + .4*paw2);
  vec3 acc = vec3(0.); wTrain(acc,p,dir,.55,.085*rough,.3,t,0.); wTrain(acc,p,wRot(dir,.55),.33,.075*rough,.25,t,1.7); wTrain(acc,p,wRot(dir,-.45),.2,.065*rough,.2,t,4.1); wTrain(acc,p,wRot(dir,1.05),.125,.05*rough,.15,t,2.3);
  return acc; }
vec2 wNG(vec2 q){ const float e=.12; float h=wN(q); return vec2(wN(q+vec2(e,0.))-h, wN(q+vec2(0.,e))-h)/e; }
vec2 wChop(vec2 p, float t, vec2 dir, float rough, float fp){ float k1=1.-smoothstep(.035,.1,fp), k2=1.-smoothstep(.014,.045,fp); vec2 g=vec2(0.);
  if(k1>0.) g += wNG(p*6.5-dir*t*1.2)*(6.5*.0055*k1); if(k2>0.) g += wRot(wNG(wRot(p,.9)*15.-wRot(dir,.9)*t*2.4+7.1),-.9)*(15.*.0021*k2); return g*(.35+rough); }
float wChopLost(float rough, float fp){ float k1=1.-smoothstep(.035,.1,fp), k2=1.-smoothstep(.014,.045,fp), a=.35+rough; return a*a*(.0013*(1.-k1)+.001*(1.-k2)); }
vec3 wRings(vec2 p, float t, float amount, float fp){ vec3 g = vec3(0.); if (amount < .02 || fp > .05) return g;
  for (int L = 0; L < 2; L++){ float sc = L == 0 ? 7. : 12.; vec2 q = p*sc + float(L)*.37; vec2 i = floor(q), f = fract(q) - .5; float h = aaaHash(i, 41.+float(L)); float ph = fract(t*(.9+.3*h) + h);
    vec2 o = (aaaHash2(i, 43.) - .5)*.5; vec2 d = f - o; float r = length(d) + 1e-4; float x = (r - ph*.45)*30.; float e = exp(-x*x*.08)*(1.-ph)*(1.-ph)*step(h, amount);
    g.xy += d/r*cos(x)*e*.6; g.z += max(cos(x),0.)*e; } return g*(1.-smoothstep(.02,.05,fp)); }
vec3 wGlint(vec3 N, vec3 V, float sharp){ vec3 H = normalize(uSunDir + V); float D = pow(max(dot(N,H),0.), sharp)*(sharp+2.)*.159; float F = wFres(max(dot(V,H),0.)); return uSunCol*min(D*F/(4.*max(dot(N,V),.12)), 40.)*smoothstep(0.,.07,uSunDir.y); }
vec3 wGlitter(vec2 p, vec3 N, vec3 V, vec2 dir, float rough, float fade){ vec3 H = normalize(uSunDir + V); float c = max(dot(N,H),1e-3); float t2 = (1.-c*c)/(c*c); float s2 = .004 + .03*clamp(rough,0.,1.);
  float pdf = exp(-t2/s2); vec2 gc = floor(p*90. - dir*uAaaTime*.5); float tw = aaaHash(gc + floor(uAaaTime*5. + aaaHash(gc,3.)*5.)*7., 5.); float g = step(1. - .4*pdf, tw);
  float k = (g*5.*fade + pdf*1.1)*wFres(max(dot(V,H),0.))*smoothstep(.08,.5,rough); return uSunCol*k*smoothstep(0.,.07,uSunDir.y); }
`;
const VS = /* glsl */`
varying vec3 vW; varying vec3 vFrontW; varying vec3 vInfo; varying vec2 vUv2;
attribute vec3 aInfo;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vFrontW = w.xyz; vInfo = aInfo; vUv2 = uv; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const CARD = /* glsl */`float wCard = (1.0 - step(frontD(vFrontW), uFrontR)) * uCardMix;`;
const LAKE_FS = /* glsl */`
${FRONT_GLSL}
${COMMON}
uniform float uLevel; varying vec3 vW; varying vec3 vInfo; varying vec2 vUv2;
#include <fog_pars_fragment>
void main(){
  ${CARD}
  vec2 p = vW.xz; vec2 fw = fwidth(p); float depth = uLevel - fieldAt(p).r; if (depth < -.012) discard;
  vec3 V = normalize(cameraPosition - vW); float rough; vec2 dir; vec3 wv = wWaves(p, uAaaTime, rough, dir); float shore = smoothstep(-.005, .07, depth);
  float fp = max(fw.x, fw.y); vec2 grad = wv.yz*(.3+.7*shore), gradLo = grad; vec3 rain = vec3(0.);
  float rainK = uAaaRain * (uAaaWetSpot.w > 0. ? 1. - smoothstep(uAaaWetSpot.z*.6, uAaaWetSpot.z*1.1, length(p - uAaaWetSpot.xy)) : 1.);
#ifndef W_MUL
  grad += wChop(p, uAaaTime, dir, rough, fp)*shore; rain = wRings(p, uAaaTime, rainK, fp); grad += rain.xy;
#endif
  vec3 N = normalize(vec3(-grad.x, 1., -grad.y)); float nv = dot(N, V); if (nv < .02) N = normalize(N + V*(.02 - nv));
  float F = wFres(clamp(dot(N, V), 0., 1.));
  vec3 Rr = refract(-V, N, .75); float path = max(depth, 0.) / max(-Rr.y, .18);
  vec3 sigma = vec3(2.65, .92, 1.04) + vec3(.8, .95, 1.35)*uTurbid; vec3 T = exp(-sigma*path);
  float lapPos = .011 + .008*sin(uAaaTime*1.15 + wN(p*2.7)*6.28), lace = smoothstep(.28, .72, wN(p*34. + vec2(uAaaTime*.25, -uAaaTime*.1)));
  float foam = smoothstep(.011, 0., abs(depth - lapPos))*lace + smoothstep(.007, 0., depth)*(.35 + .4*lace); foam *= .5 + .5*smoothstep(.1, 1.4, rough);
  foam += smoothstep(1.5, 2.6, rough)*smoothstep(.64, .92, wN(p*8.5 - dir*uAaaTime*1.5))*.55; foam = clamp(foam, 0., 1.);
  float fogK = 0.;
#ifdef USE_FOG
  float fogDepth = length(vW - cameraPosition); fogK = smoothstep(fogNear, fogFar, fogDepth);
#endif
#ifdef W_MUL
  vec3 trans = T*(1. - F)*(1. - foam*.8); trans = mix(trans, vec3(1.), max(fogK, wCard)); gl_FragColor = vec4(trans, 1.);
#else
  vec3 sp = vec3(vW.x, uLevel, vW.z); float sun = wShadow(sp) * uCloudVis(sp);
  vec3 amb = uSkyCol*.52 + uSunCol*max(uSunDir.y, 0.)*.32*mix(.3, 1., sun);
  vec3 alb = mix(vec3(.03, .2, .19), vec3(.2, .22, .12), uTurbid);
  vec3 R = reflect(-V, N); R.y = abs(R.y); vec3 refl = mix(wLand(R.y), wSky(R), smoothstep(.02, .14, R.y));
  float sharp = mix(2200., 320., clamp(rough*.45, 0., 1.)); float m2 = 2./(sharp + 2.) + wChopLost(rough, fp); sharp = 2./m2 - 2.;
  vec3 emit = alb*amb*(1. - T)*(1. - F) + refl*F + (wGlint(N, V, sharp) + wGlitter(p, N, V, dir, rough, 1. - smoothstep(.02, .06, fp)))*sun;
  emit += wSky(vec3(0.,1.,0.))*rain.z*.07;
  emit = mix(emit, vec3(.86, .92, .97)*(uSkyCol*.48 + uSunCol*max(uSunDir.y,0.)*.32*sun), foam*.85);
  emit = mix(emit, vec3(0.), max(fogK, wCard));
  gl_FragColor = vec4(min(emit, vec3(64.)), 1.);
#endif
}`;
// cloud shadow at a world point (filled by js/gfx/clouds.js; 1 when there are no clouds)
const CLOUDVIS = /* glsl */`
uniform sampler2D uCloudSh; uniform vec4 uCloudShM; uniform float uCloudShY, uCloudShOn;
float uCloudVis(vec3 p){ if (uCloudShOn < .5) return 1.; vec2 q = p.xz + uSunDir.xz / max(uSunDir.y, .15) * (uCloudShY - p.y); vec2 uv = (q - uCloudShM.xy) * uCloudShM.zw; if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return 1.; return exp(-texture2D(uCloudSh, uv).r); }`;


function waterMaterial(fs, field, extra = {}, defines = {}, blend = {}) {
  const U = makeFrontUniforms();
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, THREE.UniformsLib.fog, U, SKY_U, CLOUD_SH_U, fieldUniforms(field), { uAaaTime: AAA.uniforms.uAaaTime, uAaaRain: AAA.uniforms.uAaaRain, uAaaWetSpot: AAA.uniforms.uAaaWetSpot, uWind: VEG.uWind, uTurbid: { value: 0 } }, extra),
    vertexShader: VS, fragmentShader: fs.replace('${CLOUDVIS}', CLOUDVIS), defines, transparent: true, depthWrite: false, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, ...blend
  });
  m.extensions = { derivatives: true };
  m.userData.onFront = Ufront => { for (const k in Ufront) if (k[0] === 'u' && m.uniforms[k]) m.uniforms[k] = Ufront[k]; };
  return m;
}
const withCloud = fs => fs.replace(`${COMMON}`, `${COMMON}\n${CLOUDVIS}`);
const prepFS = fs => fs.replace('uniform float uLevel;', 'uniform float uLevel; uniform float uTurbid;');

// the lake: two meshes (multiply, add) over the lake's bounding ellipse at the field's level
export function buildLake(field, o = {}) {
  const L = field.lake; if (!L) return null;
  const g = new THREE.Group(); g.name = 'lake water';
  const geo = new THREE.PlaneGeometry(L.rx * 2.7, L.rz * 2.7, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(L.x, L.level, L.z);
  geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
  const fs = withCloud(prepFS(LAKE_FS)), lv = { uLevel: { value: L.level } };
  const mul = waterMaterial(fs, field, lv, { W_MUL: '' }, { blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor });
  const add = waterMaterial(fs, field, lv, {}, { blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  add.depthWrite = true;   // so the atmosphere pass and god rays see the water surface, not the bed
  const a = new THREE.Mesh(geo, mul), b = new THREE.Mesh(geo, add); a.renderOrder = 1; b.renderOrder = 2; a.name = 'lake (transmittance)'; b.name = 'lake (light)';
  [a, b].forEach(m => { m.castShadow = false; m.receiveShadow = false; m.userData.noInk = true; m.userData.noContact = true; m.onBeforeRender = (r, sc) => skyFrom(sc); g.add(m); });
  g.userData.water = b; g.userData.lake = { level: L.level, mats: [mul, add], setTurbid: v => { mul.uniforms.uTurbid.value = add.uniforms.uTurbid.value = v; } };
  return g;
}

const RIVER_FS = /* glsl */`
${FRONT_GLSL}
${COMMON}
\${CLOUDVIS}
uniform float uFlow; varying vec3 vW; varying vec3 vInfo; varying vec2 vUv2;
#include <fog_pars_fragment>
void main(){
  ${CARD}
  if (wCard > .5) discard;
  float s = vInfo.x, side = vInfo.y, steep = vInfo.z, bank = abs(side); vec3 V = normalize(cameraPosition - vW);
  float ft = s - uAaaTime*uFlow*(1. - .55*bank*bank);
  float st1 = wN(vec2(ft*7., side*2.5)), st2 = wN(vec2(ft*19. + 3., side*6. - uAaaTime*.3));
  vec2 g = vec2(st1 - .5, st2 - .5)*vec2(.25, .5)*(.4 + steep*2.);
  vec3 N = normalize(vec3(g.x, 1., g.y)); float F = wFres(clamp(dot(N, V), 0., 1.));
  vec3 R = reflect(-V, N); R.y = abs(R.y); vec3 refl = mix(wLand(R.y), wSky(R), smoothstep(.05, .25, R.y)*(1. - bank*.6));
  float sun = wShadow(vW) * uCloudVis(vW);
  vec3 body = vec3(.02, .09, .08)*(uSkyCol*.6 + uSunCol*max(uSunDir.y, 0.)*.25*sun);
  float foam = smoothstep(.62, .9, st1*.6 + st2*.5)*(.25 + smoothstep(.15, .6, steep)*.9) + smoothstep(.8, 1., bank)*.35*wN(vec2(ft*30., side*9.)) + vInfo.z*0.;
  foam += uFroth*smoothstep(.5, 0., s - uFallS)*step(uFallS, s)*(.4 + .6*wN(vec2(ft*12., side*5.)));
  foam = clamp(foam, 0., 1.);
  vec3 col = body*(1. - F) + refl*F + wGlint(N, V, 260.)*sun*.6;
  col = mix(col, vec3(.88, .93, .97)*(uSkyCol*.5 + uSunCol*max(uSunDir.y, 0.)*.3*sun), foam);
  float a = mix(.82, 1., foam) * smoothstep(1., .9, bank);
  float fogK = 0.;
#ifdef USE_FOG
  fogK = smoothstep(fogNear, fogFar, length(vW - cameraPosition));
  col = mix(col, fogColor, fogK);
#endif
  gl_FragColor = vec4(col*a, a);
}`;
const FALL_FS = /* glsl */`
${FRONT_GLSL}
${COMMON}
uniform float uFlow; varying vec3 vW; varying vec3 vInfo; varying vec2 vUv2;
#include <fog_pars_fragment>
void main(){
  ${CARD}
  if (wCard > .5) discard;
  float u = vUv2.y, w = vUv2.x; vec3 V = normalize(cameraPosition - vW);
  float y = u*3. - uAaaTime*uFlow*2.2;
  float streak = wN(vec2(w*14., y*1.3))*.6 + wN(vec2(w*38., y*3.))*.4;
  float edge = smoothstep(0., .14 + .1*wN(vec2(y, 3.)), w)*smoothstep(1., .86 - .1*wN(vec2(y, 7.)), w);
  float strands = smoothstep(.18, .45, streak + .3 - .28*u); float aer = smoothstep(.02, .6, u);
  float a = edge*mix(.85, strands, smoothstep(.15, .7, u));
  vec3 sun = uSunCol*max(uSunDir.y, 0.)*.35, sky = uSkyCol*.55;
  vec3 glassy = vec3(.05, .16, .15)*(sky + sun) + wSky(reflect(-V, vec3(0., 0., 1.)))*.1;
  vec3 white = vec3(.86, .92, .97)*(sky + sun*1.1);
  vec3 col = mix(glassy, white, max(aer, .3)*(.6 + .4*streak));
  col += uSunCol*pow(max(dot(-V, uSunDir), 0.), 4.)*.25*a;
  float fogK = 0.;
#ifdef USE_FOG
  fogK = smoothstep(fogNear, fogFar, length(vW - cameraPosition));
  col = mix(col, fogColor, fogK);
#endif
  gl_FragColor = vec4(col*a, a);
}`;
const POOL_FS = /* glsl */`
${FRONT_GLSL}
${COMMON}
uniform float uFlow; varying vec3 vW; varying vec3 vInfo; varying vec2 vUv2;
void main(){
  ${CARD}
  if (wCard > .5) discard;
  vec2 d = vUv2 - .5; float r = length(d)*2., a = atan(d.y, d.x);
  float rings = wN(vec2(r*6. - uAaaTime*uFlow*1.5, a*3.)), bub = step(.82, aaaHash(floor(vUv2*60.), 9.));
  float foam = smoothstep(1., .25, r)*(.45 + .55*smoothstep(.35, .75, rings)) + bub*smoothstep(1., .4, r)*.4; foam = clamp(foam, 0., 1.);
  vec3 col = vec3(.88, .93, .97)*(uSkyCol*.5 + uSunCol*max(uSunDir.y, 0.)*.3);
  gl_FragColor = vec4(col*foam, foam);
}`;
// river ribbon + waterfall + plunge pool, from field.river (bakeField spec.river)
export function buildRiver(field, o = {}) {
  const Rv = field.river; if (!Rv) return null;
  const P = Rv.P, fall = Rv.fall, g = new THREE.Group(); g.name = 'river';
  const pos = [], info = [], uv = [], idx = [];
  const ribbon = (i0, i1) => {
    const b = pos.length / 3;
    for (let i = i0; i <= i1; i++) {
      const p = P[i], q = P[Math.min(P.length - 1, i + 1)], r = P[Math.max(0, i - 1)], tx = q.x - r.x, tz = q.z - r.z, L = Math.hypot(tx, tz) || 1, nx = -tz / L, nz = tx / L;
      const steep = Math.min(1, Math.max(0, (r.y - q.y) / (Math.hypot(q.x - r.x, q.z - r.z) || 1)) * 4), hw = p.hw * 1.2;
      for (const sd of [-1, 1]) { pos.push(p.x + nx * hw * sd, p.y, p.z + nz * hw * sd); info.push(p.s, sd, steep); uv.push(sd * .5 + .5, i / P.length); }
    }
    for (let k = 0; k < i1 - i0; k++) { const a = b + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  const end = field.lake ? P.length - 1 : P.length - 1;
  if (fall) { ribbon(0, fall.i0); ribbon(fall.i1, end); } else ribbon(0, end);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const flow = { uFlow: { value: o.flow ?? .35 } }, fallS = fall ? P[fall.i1].s : -9;
  const rm = waterMaterial(RIVER_FS, field, Object.assign({ uFallS: { value: fallS }, uFroth: { value: fall ? 1 : 0 } }, flow), {}, { blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  rm.fragmentShader = rm.fragmentShader.replace('uniform float uFlow;', 'uniform float uFlow, uFallS, uFroth;');
  rm.side = THREE.DoubleSide;
  const river = new THREE.Mesh(geo, rm); river.name = 'river water'; river.renderOrder = 3;
  const parts = [river];
  if (fall) {
    // the sheet: follows the cliff samples, pushed a little out from the face, slightly bowed
    const fp = [], fu = [], fi = [], fidx = [], n = fall.i1 - fall.i0, rows = Math.max(6, n * 2);
    const a = P[fall.i0], b = P[fall.i1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, hw = (a.hw + b.hw) * .55;
    for (let r = 0; r <= rows; r++) { const t = r / rows, k = fall.i0 + t * n, i = Math.min(P.length - 2, Math.floor(k)), f = k - i, p = { x: P[i].x + (P[i + 1].x - P[i].x) * f, z: P[i].z + (P[i + 1].z - P[i].z) * f };
      const y = a.y + (b.y - a.y) * (t * t * (1.6 - .6 * t)) + .01, out = Math.sin(t * Math.PI) * .03 + .015;
      for (let c = 0; c <= 6; c++) { const w = c / 6, sd = (w - .5) * 2, sw = hw * (1 + .25 * t); fp.push(p.x + nx * sw * sd + dx / L * out, y, p.z + nz * sw * sd + dz / L * out); fu.push(w, t); fi.push(0, 0, 0); } }
    for (let r = 0; r < rows; r++) for (let c = 0; c < 6; c++) { const q = r * 7 + c; fidx.push(q, q + 7, q + 1, q + 1, q + 7, q + 8); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setAttribute('aInfo', new THREE.Float32BufferAttribute(fi, 3)); fg.setIndex(fidx);
    const fm = waterMaterial(FALL_FS, field, flow, {}, { blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }); fm.side = THREE.DoubleSide;
    const sheet = new THREE.Mesh(fg, fm); sheet.name = 'waterfall'; sheet.renderOrder = 4; parts.push(sheet);
    const c = P[Math.min(P.length - 1, fall.i1 + 2)], pr = hw * 2.6;
    const pg = new THREE.PlaneGeometry(pr * 2, pr * 2); pg.rotateX(-Math.PI / 2); pg.translate(c.x, c.y + .006, c.z); pg.setAttribute('aInfo', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const pool = new THREE.Mesh(pg, waterMaterial(POOL_FS, field, flow, {}, { blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor })); pool.name = 'plunge pool foam'; pool.renderOrder = 5; parts.push(pool);
    // spray: stateless soft sprites rising and drifting from the foot
    const N = o.spray ?? 90, sp = new Float32Array(N * 3), sd = new Float32Array(N); for (let i = 0; i < N; i++) { sp.set([c.x + (Math.random() - .5) * hw * 2, c.y, c.z + (Math.random() - .5) * hw * 2], i * 3); sd[i] = Math.random(); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    const smU = makeFrontUniforms();
    const sm = new THREE.ShaderMaterial({ uniforms: Object.assign({ uAaaTime: AAA.uniforms.uAaaTime, uSkyCol: SKY_U.uSkyCol, uSunCol: SKY_U.uSunCol, uDrop: { value: fall.drop } }, smU), transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: 'attribute float aSeed; uniform float uAaaTime, uDrop; varying float vA; varying vec3 vFrontW; void main(){ float t = fract(uAaaTime*.45 + aSeed); vec3 p = position + vec3(sin(aSeed*40.)*.08*t, t*uDrop*.8, cos(aSeed*23.)*.08*t); vFrontW = p; vA = sin(t*3.1416)*.5; vec4 mv = viewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (14. + 26.*t) * 300. / max(-mv.z, .1) / 30.; }',
      fragmentShader: FRONT_GLSL + 'uniform vec3 uSkyCol, uSunCol; varying float vA; void main(){ float isCard = 1.0 - step(frontD(vFrontW), uFrontR); vec2 d = gl_PointCoord - .5; float a = exp(-dot(d,d)*14.)*vA*(1.-isCard); gl_FragColor = vec4(vec3(.9,.94,.98)*(uSkyCol*.6+uSunCol*.25)*a, a); }' });
    sm.userData.onFront = Uf => { for (const k in Uf) if (k[0] === 'u' && sm.uniforms[k]) sm.uniforms[k] = Uf[k]; };
    const spray = new THREE.Points(sg, sm); spray.name = 'waterfall spray'; spray.frustumCulled = false; spray.renderOrder = 6; parts.push(spray);
  }
  parts.forEach(m => { m.castShadow = false; m.receiveShadow = false; m.userData.noInk = true; m.userData.noContact = true; m.raycast = () => {}; if (m.isMesh) m.onBeforeRender = (r, sc) => skyFrom(sc); g.add(m); });
  g.userData.river = { setFlow: v => { [river, ...parts].forEach(m => { if (m.material.uniforms && m.material.uniforms.uFlow) m.material.uniforms.uFlow.value = v; }); } };
  return g;
}
