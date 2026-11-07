// Volumetric puff clouds (realism-playbook R6, ported from Weatherglass's cloud raymarch).
//
//  • Each cloud is a box around its puffs (the same layout as the old merged-icosahedra cloud: spec r, puffs, seed),
//    raymarched in the cloud's own space: density = smooth union of the puffs (signed distance), coverage eroded by a
//    low-frequency 3-D noise (billows), a flat condensation base and soft ceiling, then high-frequency detail that is
//    billowy on top and wispy underneath. Detail only erodes. Coarse strides until the first contact, then a back-off
//    and fine steps (≤ 1 optical depth each), empty-space leaps by the SDF, interleaved-gradient jitter, stop at T < .02.
//  • Light: 4–6 steps toward the sun growing ×1.65 (reused on alternate samples), dual-lobe Henyey–Greenstein over
//    three multiple-scattering octaves (Wrenninge), a powder term darkening the creases of front-lit billows, sky
//    light on top and ground bounce underneath, occlusion by depth in the cloud. grey (condensed water) turns the
//    albedo slate and darkens the belly; fade thins it out.
//  • The march stops where it goes below the terrain (field texture), so a cloud on a ridge never shows through rock.
//  • Double-sided box: outside, only front faces draw; with the camera inside (the POV parcel rides into its cloud) the
//    back faces draw and the march starts at the eye.
//  • Shadows: the clouds' optical depth is splatted into a 128² texture over the block ~15 times a second; every lit
//    material multiplies the sun by exp(−τ) (materialize.js cloud hook, CLOUD_SH_U).
//  • Card → real: invisible while the cloud's centre is still behind the materialize front.
//  • Steps by quality: 20/30/44 primary, 4/5/6 light. 3-D noise: a 32³ tileable RGBA texture made on the CPU once.
import * as THREE from 'three';
import { AAA, NOISE_GLSL } from './aaa.js';
import { FRONT_GLSL, makeFrontUniforms, CLOUD_SH_U } from './materialize.js';
import { FIELD_GLSL } from './terrain.js';
import { SKY_U, skyFrom } from './water.js';
import { mulberry } from '../util.js';

export const CLOUD_QUALITY = { low: { steps: 20, light: 4 }, medium: { steps: 30, light: 5 }, high: { steps: 44, light: 6 } };
let NOISE3 = null;
// tileable 3-D noise: R = Perlin–Worley (low), G/B = inverted Worley at 2× / 4×, A = value fBm
function noise3D(S = 32) {
  if (NOISE3) return NOISE3;
  const r = mulberry(1234), data = new Uint8Array(S * S * S * 4);
  const pts = n => { const a = new Float32Array(n * n * n * 3); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const P = [4, 8, 16].map(n => ({ n, p: pts(n) }));
  const worley = (x, y, z, L) => { const n = L.n, fx = x * n, fy = y * n, fz = z * n, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz); let md = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = ix + i, cy = iy + j, cz = iz + k, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n, wz = ((cz % n) + n) % n, o = ((wz * n + wy) * n + wx) * 3;
      const dx = cx + L.p[o] - fx, dy = cy + L.p[o + 1] - fy, dz = cz + L.p[o + 2] - fz, d = dx * dx + dy * dy + dz * dz; if (d < md) md = d; }
    return Math.min(1, Math.sqrt(md)); };
  const lat = new Float32Array(8 * 8 * 8).map(() => r()), lat2 = new Float32Array(16 * 16 * 16).map(() => r());
  const vn = (x, y, z, n, L) => { const fx = x * n, fy = y * n, fz = z * n, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), u = fx - ix, v = fy - iy, w = fz - iz, s = t => t * t * (3 - 2 * t);
    const g = (a, b, c) => L[((((c % n) + n) % n) * n + (((b % n) + n) % n)) * n + (((a % n) + n) % n)];
    const l = (a, b, t) => a + (b - a) * s(t);
    return l(l(l(g(ix, iy, iz), g(ix + 1, iy, iz), u), l(g(ix, iy + 1, iz), g(ix + 1, iy + 1, iz), u), v), l(l(g(ix, iy, iz + 1), g(ix + 1, iy, iz + 1), u), l(g(ix, iy + 1, iz + 1), g(ix + 1, iy + 1, iz + 1), u), v), w); };
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = x / S, Y = y / S, Z = z / S, o = ((z * S + y) * S + x) * 4;
    const pv = vn(X, Y, Z, 8, lat) * .65 + vn(X, Y, Z, 16, lat2) * .35, w1 = 1 - worley(X, Y, Z, P[0]), w2 = 1 - worley(X, Y, Z, P[1]), w3 = 1 - worley(X, Y, Z, P[2]);
    const pw = Math.min(1, Math.max(0, pv * .5 + w1 * .7 - .15));
    data[o] = pw * 255; data[o + 1] = (w2 * .7 + w3 * .3) * 255; data[o + 2] = w3 * 255; data[o + 3] = pv * 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true; t.userData.shared = true; t.name = 'cloud-noise-3d';
  return (NOISE3 = t);
}

const VS = /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = /* glsl */`
${FRONT_GLSL}
${NOISE_GLSL}
${FIELD_GLSL}
uniform vec3 uSunDir, uSunCol, uSkyCol, uGndCol; uniform float uAaaTime;
uniform sampler3D uNoise; uniform vec4 uPuffs[MAX_PUFFS]; uniform int uPuffCount; uniform vec3 uBoxMin, uBoxMax; uniform mat4 uInv, uModelW; uniform vec3 uCenterW;
uniform float uGrey, uStorm, uFade, uSteps, uInside, uBase, uTop, uSize, uFieldOn, uSeed;
varying vec3 vW;
float csmin(float a, float b, float k){ float h = clamp(.5 + .5*(b - a)/k, 0., 1.); return mix(b, a, h) - k*h*(1. - h); }
float shapeSD(vec3 p){ float d = 1e3; for (int i = 0; i < MAX_PUFFS; i++){ if (i >= uPuffCount) break; vec4 s = uPuffs[i]; d = csmin(d, length(p - s.xyz) - s.w, uSize*.35); } return d; }
float remap01(float v, float lo, float hi){ return clamp((v - lo)/max(hi - lo, 1e-4), 0., 1.); }
float heightFrac(float y){ return clamp((y - uBase)/max(uTop - uBase, .2), 0., 1.); }
float baseDensity(vec3 p, float sd, out float cov, out vec4 n1){
  float edge = uSize*.16; cov = smoothstep(edge, -edge*1.4, sd);
  vec3 q = p/uSize + uSeed; n1 = texture(uNoise, q*.34 + vec3(0., -uAaaTime*.012, 0.));
  float hf = heightFrac(p.y); float d = remap01(cov, (1. - n1.r)*mix(.66, .82, hf), 1.);
  float soft = uSize*.12; float baseY = uBase + (n1.a - .5)*soft*1.2; d *= smoothstep(baseY - soft*.4, baseY + soft, p.y);
  return d; }
float fullDensity(vec3 p, float sd, out float cov){ vec4 n1; float d = baseDensity(p, sd, cov, n1); if (d <= 0.) return 0.;
  float hf = heightFrac(p.y); vec3 q = p/uSize + uSeed; vec3 w = (n1.aga - .5)*.3; vec4 n2 = texture(uNoise, q*1.55 + w + vec3(0., -uAaaTime*.03, uAaaTime*.006)); vec4 n3 = texture(uNoise, q*3.1 - w*.5 + vec3(uAaaTime*.01, -uAaaTime*.05, 0.));
  float billowy = smoothstep(.06, .4, hf); float detail = mix(mix(n2.b, n3.a, .5), n2.g * .8 + n3.g * .2, billowy);   // wisps below, cauliflower (inverted Worley) above
  d = remap01(d, mix(1. - detail, detail, billowy)*mix(.68, .62, billowy), 1.);
  return pow(d, mix(1.05, .6, hf)); }
float lightDensity(vec3 p){ float sd = shapeSD(p); if (sd > uSize*.16) return 0.; float cov; vec4 n1; return baseDensity(p, sd, cov, n1); }
float hg(float c, float g){ float g2 = g*g; return (1. - g2)/pow(1. + g2 - 2.*g*c, 1.5); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056, .00583715)))); }
void main(){
  float isCard = (1.0 - step(frontD(uCenterW), uFrontR)) * uCardMix; if (isCard > .5 || uFade < .01) discard;
  if (!gl_FrontFacing && uInside < .5) discard;
  vec3 ro = (uInv*vec4(cameraPosition, 1.)).xyz, rd = normalize((uInv*vec4(vW, 1.)).xyz - ro);
  vec3 inv = 1./mix(rd, vec3(1e-6), vec3(lessThan(abs(rd), vec3(1e-6)))); vec3 t0 = (uBoxMin - ro)*inv, t1 = (uBoxMax - ro)*inv, tmn = min(t0, t1), tmx = max(t0, t1);
  float tN = max(max(max(tmn.x, tmn.y), tmn.z), 0.), tF = min(min(tmx.x, tmx.y), tmx.z); if (tF <= tN) discard;
  vec3 L = normalize(mat3(uInv)*uSunDir);
  float sigma = 40./max(.6, pow(uSize, .35)), edge = uSize*.16, chord = tF - tN;
  float dsC = max(chord/(uSteps*.8), .02), dsF = max(min(dsC*.38, 1.2/sigma), .012), ds = dsC, t = tN + ds*ign(gl_FragCoord.xy);
  bool fine = false; int thin = 0, tick = 0; float od = 0.;
  float cosT = dot(rd, L); float ph0 = mix(hg(cosT, -.3), hg(cosT, .8), .5), ph1 = mix(hg(cosT, -.15), hg(cosT, .4), .5), ph2 = mix(hg(cosT, -.07), hg(cosT, .2), .5); float backlit = smoothstep(.1, .95, cosT);
  vec3 albedo = mix(vec3(1.), vec3(.37, .4, .47), uGrey); albedo = mix(albedo, vec3(.2, .215, .26), uStorm*.85); vec3 albTop = mix(vec3(.96, .97, 1.), albedo, .4 + .25*uGrey);
  vec3 sunCol = uSunCol*.4, skyCol = uSkyCol*.7, bounce = uGndCol*.9 + uSunCol*.02;   // more key than fill: lit crowns, shaded bellies
  float T = 1.; vec3 col = vec3(0.); float l0 = uSize*.09 + .03;
  for (int i = 0; i < MAX_STEPS*2; i++){
    if (t >= tF || T < .02) break;
    vec3 p = ro + rd*t;
    float sd = shapeSD(p);
    if (sd > edge){ t += ds*max(1., floor((sd - edge)/ds)); continue; }
    if (uFieldOn > .5 && fine){ vec3 pw = (uModelW*vec4(p, 1.)).xyz; if (pw.y < fieldAt(pw.xz).r) break; }
    float cov; float dens = fullDensity(p, sd, cov)*uFade;
    if (dens > .003){
      if (!fine){ fine = true; ds = dsF; t = max(tN, t - dsC*.8); continue; }
      thin = 0;
      if ((++tick & 1) == 1 || T > .7){ od = 0.; float sl = l0; vec3 lp = p; for (int j = 0; j < LIGHT_STEPS; j++){ lp += L*sl; od += lightDensity(lp)*sl; sl *= 1.65; } od *= sigma*uFade; }
      float powder = mix(1., 1. - exp(-od*2. - dens*.6), .75*(1. - backlit));
      float lum = exp(-od)*ph0*powder + .45*exp(-od*.3)*ph1 + .22*exp(-od*.1)*ph2;
      float hf = heightFrac(p.y), depth = clamp(-sd/(uSize*.7), 0., 1.), amo = mix(1., .3, depth)*(.55 + .45*exp(-od*.35));
      vec3 Lin = sunCol*lum + mix(bounce, skyCol, smoothstep(0., .85, hf))*amo;
      Lin *= 1. - (1. - smoothstep(.02, .7, hf))*(.32 + uGrey*.4 + uStorm*.5);   // shaded, flat-ish bases
      float Tr = exp(-dens*sigma*ds); col += T*mix(albedo, albTop, smoothstep(.4, 1., hf)*.5)*Lin*(1. - Tr); T *= Tr;
    } else if (fine && ++thin > 4){ fine = false; ds = dsC; }
    t += ds;
  }
  float a = 1. - T; if (a < .004) discard;
  gl_FragColor = vec4(col, a);
}`;

// ---- shadow splat: one driver per scene, ~15 Hz ----
const REG = new Set(); let SH = null, lastSplat = -1;
function shadowTex() { if (SH) return SH; const N = 128; SH = { N, a: new Float32Array(N * N), b: new Float32Array(N * N), half: new Uint16Array(N * N) }; SH.tex = new THREE.DataTexture(SH.half, N, N, THREE.RedFormat, THREE.HalfFloatType); SH.tex.magFilter = SH.tex.minFilter = THREE.LinearFilter; SH.tex.userData.shared = true; SH.tex.needsUpdate = true; return SH; }
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
function splat(scene) {
  const t = AAA.uniforms.uAaaTime.value; if (Math.abs(t - lastSplat) < 1 / 15) return; lastSplat = t;
  const S = shadowTex(), N = S.N, M = CLOUD_SH_U.uCloudShM.value, x0 = M.x, z0 = M.y, cw = 1 / M.z / N, cd = 1 / M.w / N; S.a.fill(0);
  let ySum = 0, yN = 0, any = false;
  for (const m of REG) {
    if (!m.parent || !m.visible) continue; let vis = true; m.traverseAncestors(a => { if (!a.visible) vis = false; }); if (!vis || a0(m)) continue;
    const C = m.userData.cloud, mw = m.matrixWorld, sc = mw.getMaxScaleOnAxis();
    const k = C.U.uFade.value * (1 + C.U.uGrey.value * 1.6 + C.U.uStorm.value);
    for (const p of C.puffs) { _c.set(p[0], p[1], p[2]).applyMatrix4(mw); const r = p[3] * sc * .9; ySum += _c.y; yN++; any = true;
      const i0 = Math.max(0, Math.floor((_c.x - r - x0) / cw)), i1 = Math.min(N - 1, Math.ceil((_c.x + r - x0) / cw)), j0 = Math.max(0, Math.floor((_c.z - r - z0) / cd)), j1 = Math.min(N - 1, Math.ceil((_c.z + r - z0) / cd));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = x0 + (i + .5) * cw - _c.x, dz = z0 + (j + .5) * cd - _c.z, q = r * r - dx * dx - dz * dz; if (q > 0) S.a[j * N + i] += Math.sqrt(q) * 2 * k * 1.8; } }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const g = (ii, jj) => S.a[Math.min(N - 1, Math.max(0, jj)) * N + Math.min(N - 1, Math.max(0, ii))]; S.b[j * N + i] = (g(i - 1, j) + 2 * g(i, j) + g(i + 1, j)) * .25; }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const g = jj => S.b[Math.min(N - 1, Math.max(0, jj)) * N + i]; S.half[j * N + i] = THREE.DataUtils.toHalfFloat((g(j - 1) + 2 * g(j) + g(j + 1)) * .25); }
  S.tex.needsUpdate = true; CLOUD_SH_U.uCloudSh.value = S.tex; CLOUD_SH_U.uCloudShOn.value = any ? 1 : 0; if (yN) CLOUD_SH_U.uCloudShY.value = ySum / yN; CLOUD_SH_U.uCloudSun.value.copy(SKY_U.uSunDir.value);
}
const a0 = m => m.userData.cloud.U.uFade.value < .01;
function driver(scene) {
  if (scene.userData._cloudDriver) return;
  const d = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); d.geometry.setDrawRange(0, 0); d.frustumCulled = false; d.name = 'cloud shadow driver'; d.userData.noInk = true; d.raycast = () => {};
  d.material.userData.frontPatched = true;   // never compiled into anything worth patching
  d.onBeforeRender = (r, sc) => { skyFrom(sc); for (const m of REG) if (!m.parent || !sceneOf(m)) REG.delete(m); splat(sc); };
  scene.add(d); scene.userData._cloudDriver = d;
}
const sceneOf = o => { let p = o; while (p.parent) p = p.parent; return p.isScene ? p : null; };

// spec: { r, puffs, seed, color?, region:[minX, minZ, maxX, maxZ] (shadow texture rect) }, field (optional, terrain occlusion)
export function buildCloudVolume(shape = {}, seed = 3, field = null) {
  const s = +shape.r > 0 ? +shape.r : 1, n = Math.min(20, Math.max(3, +shape.puffs || 7)), r = mulberry(seed || 3), puffs = [];
  for (let i = 0; i < n; i++) { const x = (r() - .5) * s * 2.2, lob = 1 - Math.min(1, Math.abs(x) / (s * 1.2)); puffs.push([x, (r() - .25) * s * .45 + lob * s * .45 * r(), (r() - .5) * s * 1.1, s * (.38 + r() * .38 + lob * .12)]); }   // a flat base, lobes heaped up in the middle (cumulus)
  const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  puffs.forEach(p => { mn.min(_v.set(p[0] - p[3], p[1] - p[3], p[2] - p[3])); mx.max(_v.set(p[0] + p[3], p[1] + p[3], p[2] + p[3])); });
  const pad = s * .25; mn.subScalar(pad); mx.addScalar(pad);
  const geo = new THREE.BoxGeometry(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z); geo.translate((mx.x + mn.x) / 2, (mx.y + mn.y) / 2, (mx.z + mn.z) / 2);
  const Q = CLOUD_QUALITY[AAA.quality] || CLOUD_QUALITY.medium, FU = makeFrontUniforms();
  const U = { uGrey: { value: 0 }, uStorm: { value: 0 }, uFade: { value: 1 }, uInside: { value: 0 }, uSteps: { value: Q.steps }, uSize: { value: s }, uSeed: { value: (seed % 97) * .173 },
    uBase: { value: Math.min(...puffs.map(p => p[1])) - s * .1 }, uTop: { value: Math.max(...puffs.map(p => p[1] + p[3])) }, uPuffCount: { value: n },
    uPuffs: { value: Array.from({ length: 20 }, (_, i) => new THREE.Vector4(...(puffs[i] || [0, -1e3, 0, 0]))) }, uBoxMin: { value: mn.clone() }, uBoxMax: { value: mx.clone() },
    uInv: { value: new THREE.Matrix4() }, uModelW: { value: new THREE.Matrix4() }, uCenterW: { value: new THREE.Vector3() }, uNoise: { value: noise3D() }, uFieldOn: { value: field ? 1 : 0 },
    uField: { value: field ? field.tex : null }, uFieldM: { value: field ? new THREE.Vector4(field.minX, field.minZ, 1 / field.dx, 1 / field.dz) : new THREE.Vector4() }, uFieldN: { value: field ? new THREE.Vector2(field.NX, field.NZ) : new THREE.Vector2(1, 1) } };
  const mat = new THREE.ShaderMaterial({ uniforms: Object.assign({ uAaaTime: AAA.uniforms.uAaaTime, uSunDir: SKY_U.uSunDir, uSunCol: SKY_U.uSunCol, uSkyCol: SKY_U.uSkyCol, uGndCol: SKY_U.uGndCol }, FU, U),
    vertexShader: VS, fragmentShader: FS, defines: { MAX_PUFFS: 20, MAX_STEPS: Q.steps, LIGHT_STEPS: Q.light }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, glslVersion: null });
  mat.userData.onFront = Uf => { for (const k in Uf) if (k[0] === 'u' && mat.uniforms[k]) mat.uniforms[k] = Uf[k]; };
  const m = new THREE.Mesh(geo, mat); m.name = 'cloud volume'; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 10; m.frustumCulled = false; m.userData.noInk = true; m.userData.noContact = true;
  m.userData.inkAngle = 70;
  m.userData.cloud = { U, puffs, set(o = {}) { if (o.grey != null) U.uGrey.value = o.grey; if (o.fade != null) U.uFade.value = o.fade; if (o.storm != null) U.uStorm.value = o.storm; } };
  if (shape.region) { const g = shape.region; CLOUD_SH_U.uCloudShM.value.set(g[0], g[1], 1 / (g[2] - g[0]), 1 / (g[3] - g[1])); }
  else if (field) CLOUD_SH_U.uCloudShM.value.set(field.minX, field.minZ, 1 / field.w, 1 / field.d);
  REG.add(m);
  const _p = new THREE.Vector3();
  m.onBeforeRender = (rdr, scene, cam) => {
    driver(scene); m.updateMatrixWorld(); U.uInv.value.copy(m.matrixWorld).invert(); U.uModelW.value.copy(m.matrixWorld);
    U.uCenterW.value.set((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2).applyMatrix4(m.matrixWorld);
    _p.copy(cam.position).applyMatrix4(U.uInv.value); U.uInside.value = _p.x > mn.x && _p.x < mx.x && _p.y > mn.y && _p.y < mx.y && _p.z > mn.z && _p.z < mx.z ? 1 : 0;
  };
  m.addEventListener('removed', () => REG.delete(m));
  return m;
}
