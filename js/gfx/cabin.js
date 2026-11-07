// A log cabin worth looking at (realism-playbook R10), a wooden jetty and chimney smoke; plus a painted hill backdrop.
//
//  • Cabin: interlocking log walls (round logs running past the corners, alternate rows offset by half a log), plank
//    gables, a shingled gable roof with overhangs (courses of thin boards), a dry-stone chimney with a cap on one gable
//    end, a plank door, two framed windows that glow warm (userData.cabin.setGlow(0..1) for the evening lesson), a
//    porch with deck, posts and its own lean-to roof, and a woodpile. Geometry merged by material: 6 draw calls.
//    Front = +z, chimney on +x. Footprint ≈ w × d (default .95 × .72), ridge ≈ .78 high.
//  • Smoke: stateless soft billboards rising from the chimney and drifting with the scene's wind (VEG.uWind):
//    position = f(fract(t·speed + seed)); hidden while the cabin is still a drawing.
//  • Jetty: planks on two stringers and posts from the shore point `from` to `to` over the lake, the deck just above
//    the water level, posts down to the bed (field heights).
//  • Hills: painted silhouettes (proc.js hillLayer) on open cylinders around the plinth, fogged into the distance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterial } from './materials.js';
import { AAA } from './aaa.js';
import { FRONT_GLSL, makeFrontUniforms } from './materialize.js';
import { VEG } from './grass.js';
import { SKY_U, skyFrom } from './water.js';
import { hillLayer } from './proc.js';
import { mulberry } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clean = g => { g = g.index ? g.toNonIndexed() : g; Object.keys(g.attributes).forEach(k => { if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
function box(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); list.push(clean(g)); }
function log(list, len, r, x, y, z, along, rng) { const g = new THREE.CylinderGeometry(r * (.92 + rng() * .1), r, len, 9, 1); if (along === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2); g.translate(x, y, z); list.push(clean(g)); }

export function buildCabin(shape = {}, seed = 7) {
  const W = +shape.w || .95, D = +shape.d || .72, rng = mulberry(seed), r = .032, rows = 7, Hw = rows * r * 2 + r;
  const L = { logs: [], roof: [], stone: [], plank: [], dark: [], glass: [] };
  // log walls: front/back logs along x, side logs along z, half a log higher (they interlock at the corners)
  for (let i = 0; i < rows; i++) {
    const y = r + i * 2 * r;
    log(L.logs, W + .14, r, 0, y, D / 2, 'x', rng); log(L.logs, W + .14, r, 0, y, -D / 2, 'x', rng);
    log(L.logs, D + .14, r, W / 2, y + r, 0, 'z', rng); log(L.logs, D + .14, r, -W / 2, y + r, 0, 'z', rng);
  }
  // gables (plank triangles) and the roof: two slabs with shingle courses, overhanging
  const rise = .3, half = D / 2 + .12, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half), top = Hw + rise;
  [-1, 1].forEach(s => { const sh = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise * (D / 2) / half)]); const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2 * s); g.translate(s * (W / 2 + .005), Hw, 0); L.plank.push(clean(g)); });
  [-1, 1].forEach(s => {
    box(L.roof, W + .3, .025, slope + .04, 0, Hw + rise / 2 + .02, s * half / 2, s * ang);
    for (let k = 0; k < 7; k++) { const t = (k + .5) / 7, zz = s * half * (1 - t), yy = Hw + rise * t + .04; box(L.roof, W + .3, .012, slope / 6.2, 0, yy, zz, s * ang + s * .06); }
  });
  box(L.roof, W + .32, .03, .05, 0, top + .035, 0);   // ridge board
  // chimney: stacked stones on the +x gable
  const cx = W / 2 + .1, ch = top + .2;
  for (let y = 0, k = 0; y < ch; k++) { const hh = .045 + rng() * .02; box(L.stone, .2 + (k % 2) * .02, hh, .22 - (k % 2) * .02, cx + (rng() - .5) * .01, y + hh / 2, (rng() - .5) * .01); y += hh; }
  box(L.stone, .26, .03, .28, cx, ch + .015, 0);
  // door, windows (frames + glowing panes), porch, woodpile
  box(L.dark, .17, .3, .02, -.16, .15 + .02, D / 2 + r + .005);
  [[.2, D / 2 + r + .006, 0], [-W / 2 - r - .006, -.05, Math.PI / 2]].forEach(([x, z, ry]) => { box(L.plank, .2, .17, .02, x, .26, z, 0, ry); box(L.glass, .15, .12, .02, x, .26, z + (ry ? 0 : .004), 0, ry); });
  const pz = D / 2 + .2; box(L.plank, W + .1, .03, .34, 0, .04, pz);
  for (let k = 0; k < 9; k++) box(L.plank, .012, .031, .34, -W / 2 + (k + .5) * W / 9, .041, pz);
  [-1, 1].forEach(s => box(L.plank, .04, .4, .04, s * (W / 2 - .02), .24, pz + .15));
  box(L.roof, W + .16, .02, .4, 0, .46, pz + .03, .25);
  for (let k = 0; k < 9; k++) log(L.logs, .12, .022, -W / 2 - .12, .025 + Math.floor(k / 3) * .042, -.2 + (k % 3) * .048 + (Math.floor(k / 3) % 2) * .02, 'x', rng);
  const mats = { logs: makeMaterial({ preset: 'bark', color: '#6e4e33' }), roof: makeMaterial({ preset: 'darkwood' }), stone: makeMaterial({ preset: 'stone', color: '#8d877c' }), plank: makeMaterial({ preset: 'wood' }), dark: makeMaterial({ preset: 'darkwood' }), glass: makeMaterial({ preset: 'emissive', color: '#ffcf86', emissiveIntensity: .5 }) }; mats.plank.side = THREE.DoubleSide;
  const g = new THREE.Group(); g.name = 'log cabin';
  for (const k in L) { if (!L[k].length) continue; const m = new THREE.Mesh(mergeGeometries(L[k]), mats[k]); m.castShadow = k !== 'glass'; m.receiveShadow = true; m.name = 'cabin ' + k; m.userData.inkAngle = 40; if (k === 'roof' || k === 'logs') m.userData.noInk = true; g.add(m); }
  const smoke = chimneySmoke(V3(cx, ch + .05, 0)); g.add(smoke);
  g.userData.windows = [g.children.find(m => m.name === 'cabin glass')].filter(Boolean);
  g.userData.cabin = { smoke, setGlow: k => { mats.glass.emissiveIntensity = .3 + 2.2 * k; } };
  return g;
}
export function chimneySmoke(at, n = 36) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { p.set([at.x, at.y, at.z], i * 3); sd[i] = i / n; }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uAaaTime: AAA.uniforms.uAaaTime, uWind: VEG.uWind, uSkyCol: SKY_U.uSkyCol, uSunCol: SKY_U.uSunCol, uAmt: { value: 1 } }, makeFrontUniforms()),
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute float aSeed; uniform float uAaaTime; uniform vec2 uWind; varying float vT, vS; varying vec3 vFrontW;
      void main(){ float t = fract(uAaaTime * .09 + aSeed); vT = t; vS = aSeed; vec4 w = modelMatrix * vec4(position, 1.); vFrontW = w.xyz;
        w.xyz += vec3(uWind.x * .12 * t * t + sin(aSeed * 40. + uAaaTime) * .03 * t, t * .9, uWind.y * .12 * t * t + cos(aSeed * 23. + uAaaTime * .7) * .03 * t);
        vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = (.05 + .22 * t) * projectionMatrix[1][1] * 300. / max(-mv.z, .05); }`,
    fragmentShader: FRONT_GLSL + `uniform vec3 uSkyCol, uSunCol; uniform float uAmt; varying float vT, vS;
      void main(){ if (1.0 - step(frontD(vFrontW), uFrontR) > .5) discard; vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d) * 9.) * (1. - vT) * smoothstep(0., .08, vT) * .3 * uAmt;
        a *= .75 + .25 * sin(d.x * 9. + vS * 30.); if (a < .003) discard; gl_FragColor = vec4(mix(vec3(.55), vec3(.8, .8, .82), vT) * (uSkyCol * .8 + uSunCol * .15) * a, a); }`
  });
  m.userData.onFront = U => { for (const k in U) if (k[0] === 'u' && m.uniforms[k]) m.uniforms[k] = U[k]; };
  const pts = new THREE.Points(geo, m); pts.name = 'chimney smoke'; pts.frustumCulled = false; pts.userData.noInk = true; pts.raycast = () => {}; pts.renderOrder = 9;
  pts.onBeforeRender = (r, sc) => skyFrom(sc);
  return pts;
}
// jetty from the shore (from) over the lake (to); field gives the bed heights, level the water
export function buildJetty(field, from = [0, 0], to = [1, 0], { width = .17, seed = 3 } = {}) {
  const lv = field && field.lake ? field.lake.level : 0, rng = mulberry(seed), deck = lv + .055;
  const a = V3(from[0], 0, from[1]), b = V3(to[0], 0, to[1]), dir = b.clone().sub(a), len = dir.length(); dir.normalize(); const ry = Math.atan2(dir.x, dir.z);
  const P = [], posts = [];
  const n = Math.round(len / .045);
  for (let i = 0; i < n; i++) { const t = (i + .5) / n, c = a.clone().lerp(b, t); box(P, width * (.96 + rng() * .06), .014, .038, c.x, deck + (rng() - .5) * .004, c.z, 0, ry + (rng() - .5) * .04); }
  [-1, 1].forEach(s => { const off = V3(dir.z, 0, -dir.x).multiplyScalar(s * width * .38), c = a.clone().lerp(b, .5).add(off); box(P, .022, .03, len, c.x, deck - .022, c.z, 0, ry); });
  for (let t = 0; t <= 1.001; t += .25) [-1, 1].forEach(s => { const c = a.clone().lerp(b, t).add(V3(dir.z, 0, -dir.x).multiplyScalar(s * width * .46)), y0 = field ? field.h(c.x, c.z) - .03 : deck - .3, h = deck + .06 - y0; const g = new THREE.CylinderGeometry(.014, .016, h, 7); g.translate(c.x, y0 + h / 2, c.z); posts.push(clean(g)); });
  const gr = new THREE.Group(); gr.name = 'jetty';
  const wood = makeMaterial({ preset: 'wood', color: '#9a8466' }), dark = makeMaterial({ preset: 'darkwood' });
  [[P, wood, 'jetty deck'], [posts, dark, 'jetty posts']].forEach(([l, mt, nm]) => { const m = new THREE.Mesh(mergeGeometries(l), mt); m.castShadow = true; m.receiveShadow = true; m.name = nm; m.userData.noInk = true; gr.add(m); });
  return gr;
}
// painted hills on open cylinders around the block: far layers bluer and hazier (the scene fog adds the rest)
export function buildHills({ r = 34, layers = 3, height = 5, y = -1.2, seed = 4, colors = ['#4f6150', '#6c7d78', '#8d9ca2'] } = {}) {
  const g = new THREE.Group(); g.name = 'distant hills';
  for (let i = 0; i < layers; i++) {
    const R = r * (1 + i * .22), H = height * (1 + i * .35), t = hillLayer(seed + i * 3, 1024, 256, 1 - i * .25, .55 - i * .08).clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3 + i, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(colors[i % colors.length]), transparent: true, depthWrite: false, side: THREE.BackSide, fog: false })   // own aerial perspective (colours bluer and paler with distance): the scene fog would wash them out);
    m.position.y = y + H / 2; m.rotation.y = i * 1.3; m.renderOrder = -10 + i; m.name = 'hills ' + i; m.userData.noInk = true; m.userData.noContact = true; m.raycast = () => {}; m.castShadow = m.receiveShadow = false; g.add(m);
  }
  return g;
}
