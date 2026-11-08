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
import { makeMaterial, thinGlass } from './materials.js';
import { AAA } from './aaa.js';
import { FRONT_GLSL, makeFrontUniforms } from './materialize.js';
import { VEG } from './grass.js';
import { SKY_U, skyFrom } from './water.js';
import { hillLayer } from './proc.js';
import { mulberry } from '../util.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clean = g => { g = g.index ? g.toNonIndexed() : g; Object.keys(g.attributes).forEach(k => { if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
function box(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); list.push(clean(g)); }
function boxC(list, col, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); const q = clean(g), n = q.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); q.setAttribute('color', new THREE.BufferAttribute(a, 3)); list.push(q); }
function log(list, len, r, x, y, z, along, rng) { const g = new THREE.CylinderGeometry(r * (.92 + rng() * .1), r, len, 9, 1); if (along === 'x') g.rotateZ(Math.PI / 2); else if (along === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); list.push(clean(g)); }

export function buildCabin(shape = {}, seed = 7) {
  const W = +shape.w || .95, D = +shape.d || .72, rng = mulberry(seed), r = .032, rows = 7, Hw = rows * r * 2 + r;
  const L = { logs: [], shingle: [], deck: [], trim: [], stone: [], plank: [], glass: [], glow: [] };
  // log walls: front/back logs along x, side logs along z, half a log higher (they interlock at the corners)
  for (let i = 0; i < rows; i++) {
    const y = r + i * 2 * r;
    log(L.logs, W + .14, r, 0, y, D / 2, 'x', rng); log(L.logs, W + .14, r, 0, y, -D / 2, 'x', rng);
    log(L.logs, D + .14, r, W / 2, y + r, 0, 'z', rng); log(L.logs, D + .14, r, -W / 2, y + r, 0, 'z', rng);
  }
  // gables (plank triangles) and the roof: cedar shingles in staggered, overlapping courses on a dark underlay; the
  // front slope runs on over the porch. Each shingle is its own thin board with its own tone (fresh cedar, weathered
  // silver, moss in the lower courses and in patches), so the roof reads as shingles at any distance.
  const rise = .3, half = D / 2 + .12, ang = Math.atan2(rise, half), top = Hw + rise, halfF = D / 2 + .42, tn = Math.tan(ang);
  [-1, 1].forEach(s => { const sh = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise * (D / 2) / half)]); const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2 * s); g.translate(s * (W / 2 + .005), Hw, 0); L.plank.push(clean(g)); });
  const RW = W + .3, cs = .042, cedar = new THREE.Color(), tmp = new THREE.Color();
  [-1, 1].forEach(s => {
    const hs = s > 0 ? halfF : half, len = hs / Math.cos(ang), ey = top - hs * tn, dz = -s * Math.cos(ang), dy = Math.sin(ang), nz = s * Math.sin(ang), ny = Math.cos(ang);
    boxC(L.shingle, tmp.setRGB(.05, .04, .035), RW, .01, len, 0, ey + (len / 2) * dy - .006 * ny, s * hs + (len / 2) * dz - .006 * nz, s * ang);   // underlay
    const nc = Math.ceil(len / cs);
    for (let c = 0; c < nc; c++) {
      let x = -RW / 2 + (c % 2) * .03 - .03;
      while (x < RW / 2) { const w = .045 + rng() * .04, d0 = Math.min(len - .01, c * cs), sl = Math.min(cs * 1.9, len - d0 + .01), cx = x + w / 2; x += w + .004; if (cx > RW / 2 + .01) break;
        const mossy = (c < 2 ? .5 : .12) + .35 * Math.max(0, Math.sin(cx * 7 + c * .9 + s) * Math.sin(c * 1.7 + cx * 3));
        const tone = .85 + rng() * .3; cedar.setRGB(.075 * tone, .048 * tone, .03 * tone); if (rng() < .35) cedar.lerp(tmp.setRGB(.1, .095, .085), .25 + rng() * .25); if (rng() < mossy) cedar.lerp(tmp.setRGB(.04, .06, .02), .25 + rng() * .3);   // linear albedo: cedar, weathered silver, moss
        const lift = .004 + .003 * c * 0 + rng() * .002, dd = d0 + sl / 2;
        boxC(L.shingle, cedar, Math.min(w, RW / 2 - x + w + .004), .007, sl, cx, ey + dd * dy + lift * ny, s * hs + dd * dz + lift * nz, s * (ang + .05 + rng() * .03), (rng() - .5) * .04); }
    }
  });
  boxC(L.shingle, tmp.setRGB(.09, .06, .035), RW + .02, .02, .05, 0, top + .012, 0, Math.PI / 4);   // ridge cap
  // chimney: stacked stones on the +x gable
  const cx = W / 2 + .1, ch = top + .2;
  for (let y = 0, k = 0; y < ch; k++) { const hh = .045 + rng() * .02; box(L.stone, .2 + (k % 2) * .02, hh, .22 - (k % 2) * .02, cx + (rng() - .5) * .01, y + hh / 2, (rng() - .5) * .01); y += hh; }
  box(L.stone, .26, .03, .28, cx, ch + .015, 0);
  // door: framed board-and-batten with a Z brace and an iron latch
  const fz = D / 2 + r + .004, trim = tmp.setRGB(.07, .045, .028).clone(), iron = new THREE.Color(.05, .05, .05);
  boxC(L.trim, trim, .02, .33, .025, -.26, .165, fz); boxC(L.trim, trim, .02, .33, .025, -.06, .165, fz); boxC(L.trim, trim, .22, .022, .025, -.16, .33, fz);
  for (let b = 0; b < 4; b++) boxC(L.trim, cedar.setRGB(.12 + rng() * .03, .075 + rng() * .02, .04), .042, .3, .012, -.235 + b * .046, .15, fz);
  boxC(L.trim, trim, .17, .024, .01, -.16, .07, fz + .009); boxC(L.trim, trim, .17, .024, .01, -.16, .25, fz + .009); boxC(L.trim, trim, .2, .02, .01, -.16, .16, fz + .009, 0, 0, .95); boxC(L.trim, iron, .012, .03, .012, -.1, .16, fz + .016);
  // windows: frame, mullion cross, reflective glass, warm interior glow behind it
  [[.2, D / 2 + r, 0], [-W / 2 - r, -.05, Math.PI / 2]].forEach(([x, z, ry]) => {
    const at = (u, v, dz) => { const c = Math.cos(ry), sn = Math.sin(ry); return ry ? [z * 0 + x - dz, v, u + z] : [x + u, v, z + dz]; };
    const part = (list, col, w, h, d, u, v, dz) => { const [px, py, pz] = at(u, v, dz); boxC(list, col, w, h, d, px, py, pz, 0, ry); };
    part(L.trim, trim, .2, .022, .03, 0, .355, .012); part(L.trim, trim, .2, .022, .03, 0, .175, .012); part(L.trim, trim, .022, .2, .03, -.09, .265, .012); part(L.trim, trim, .022, .2, .03, .09, .265, .012);
    part(L.trim, trim, .01, .17, .02, 0, .265, .014); part(L.trim, trim, .17, .01, .02, 0, .265, .014); part(L.trim, trim, .23, .018, .05, 0, .16, .02);
    const [gx, gy, gz] = at(0, .265, .008); box(L.glass, .17, .17, .003, gx, gy, gz, 0, ry); const [lx, ly, lz] = at(0, .265, .002); box(L.glow, .17, .17, .002, lx, ly, lz, 0, ry); });
  // porch: individual deck planks with gaps and wear on two joists; round posts carry the front roof slope
  const pz = D / 2 + .21, eaveF = top - halfF * tn;
  for (let k = 0; k < 7; k++) { const z0 = D / 2 + .05 + k * .05, wear = .9 + .25 * Math.exp(-Math.pow((k - 3) / 2.2, 2)); cedar.setRGB((.2 + rng() * .05) * wear, (.13 + rng() * .03) * wear, (.075 + rng() * .02) * wear);
    boxC(L.deck, cedar, W + .06 + (rng() - .5) * .03, .014, .044, (rng() - .5) * .015, .047, z0 + .022); }
  [-1, 1].forEach(s2 => boxC(L.deck, tmp.setRGB(.15, .1, .06), .03, .035, .37, s2 * (W / 2 - .06), .022, pz));
  [-1, 1].forEach(s2 => log(L.logs, eaveF - .02, .022, s2 * (W / 2 - .02), (eaveF - .02) / 2 + .03, D / 2 + .37, 'y', rng));
  for (let k = 0; k < 9; k++) log(L.logs, .12, .022, -W / 2 - .12, .025 + Math.floor(k / 3) * .042, -.2 + (k % 3) * .048 + (Math.floor(k / 3) % 2) * .02, 'x', rng);
  const vc = (o = {}) => Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: 0, envMapIntensity: .5 }), o);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2228, roughness: .04, metalness: 0, transparent: true, opacity: .42, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: .02 });
  const glowM = new THREE.MeshStandardMaterial({ color: 0x281a10, emissive: new THREE.Color('#ffb15c'), emissiveIntensity: .25, roughness: 1 });
  const mats = { shingle: vc(), deck: vc({ roughness: .8 }), trim: vc(), glow: glowM, glass, logs: makeMaterial({ preset: 'bark', color: '#6e4e33', aaa: { color3: '#4a3a2a', moss: .25 } }), stone: makeMaterial({ preset: 'stone', color: '#8d877c' }), plank: makeMaterial({ preset: 'wood' }) }; mats.plank.side = THREE.DoubleSide;
  const g = new THREE.Group(); g.name = 'log cabin';
  for (const k in L) { if (!L[k].length) continue; const m = new THREE.Mesh(mergeGeometries(L[k]), mats[k]); m.castShadow = k !== 'glass'; m.receiveShadow = true; m.name = 'cabin ' + k; m.userData.inkAngle = 40; if (k === 'shingle' || k === 'logs' || k === 'deck' || k === 'trim') m.userData.noInk = true; if (k === 'glass' || k === 'glow') m.castShadow = false; g.add(m); }
  const smoke = chimneySmoke(V3(cx, ch + .05, 0)); g.add(smoke);
  g.userData.windows = [g.children.find(m => m.name === 'cabin glass')].filter(Boolean);
  g.userData.cabin = { smoke, setGlow: k => { glowM.emissiveIntensity = .25 + 2.6 * k; } };
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
export function buildHills({ r = 34, layers = 3, height = 5, y = -1.2, seed = 4, colors = ['#71837a', '#8d9c9c', '#a8b6bc'] } = {}) {
  const g = new THREE.Group(); g.name = 'distant hills';
  for (let i = 0; i < layers; i++) {
    const R = r * (1 + i * .22), H = height * (1 + i * .35), t = hillLayer(seed + i * 3, 1024, 256, 1 - i * .25, .55 - i * .08).clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3 + i, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(colors[i % colors.length]), transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }));   // own aerial perspective (colours bluer and paler with distance): the scene fog would wash them out
    m.position.y = y + H / 2; m.rotation.y = i * 1.3; m.renderOrder = -10 + i; m.name = 'hills ' + i; m.userData.noInk = true; m.userData.skyOnly = true; m.userData.noContact = true; m.raycast = () => {}; m.castShadow = m.receiveShadow = false; g.add(m);
  }
  return g;
}

// A glass vitrine around a specimen block (Weatherglass's case): thin-shell panes in a slim brass frame on the plinth,
// and a warm, dark studio backdrop while the camera looks at the case from outside. Inside the case (low views, POV
// rides) the scene's own sky background and the objects marked userData.skyOnly (painted hills) come back, with the
// atmosphere's sky haze. min/max: [x, y, z] corners of the case.
export function buildVitrine({ min = [-6.7, -.85, -5.2], max = [6.7, 6.6, 5.2], studio = ['#6a5140', '#2e2219'] } = {}) {
  const g = new THREE.Group(); g.name = 'glass vitrine';
  const [x0, y0, z0] = min, [x1, y1, z1] = max, W = x1 - x0, H = y1 - y0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const gm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .04, metalness: 0, transparent: true, opacity: .045, envMapIntensity: .45, depthWrite: false, side: THREE.DoubleSide, clearcoat: .5 }); gm.userData.frontPatched = true;   // nearly invisible: only faint reflections and the brass edges say 'glass case'
  const pane = (w, h, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 20; m.castShadow = false; m.raycast = () => {}; g.add(m); };
  pane(W, H, cx, y0 + H / 2, z1, 0); pane(W, H, cx, y0 + H / 2, z0, Math.PI); pane(D, H, x1, y0 + H / 2, cz, Math.PI / 2); pane(D, H, x0, y0 + H / 2, cz, -Math.PI / 2); pane(W, D, cx, y1, cz, 0, -Math.PI / 2);
  const brass = makeMaterial('brass'), t = .035, bars = [], teal = [];
  const bar = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); bars.push(clean(b)); };
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z]) => bar(t, H, t, x, y0 + H / 2, z));
  [y1, y0 + t / 2].forEach(y => { bar(W + t, t, t, cx, y, z0); bar(W + t, t, t, cx, y, z1); bar(t, t, D + t, x0, y, cz); bar(t, t, D + t, x1, y, cz); });
  // the glass's edges seen end-on: a thin teal-green line just inside every frame bar (soda-lime glass, WG)
  const tb = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); teal.push(clean(b)); }, e = .012, o = t * .5 + e * .5;
  [[x0 + o, z0 + o], [x1 - o, z0 + o], [x1 - o, z1 - o], [x0 + o, z1 - o]].forEach(([x, z]) => tb(e, H - t, e, x, y0 + H / 2, z));
  [y1 - o].forEach(y => { tb(W - t, e, e, cx, y, z0 + o); tb(W - t, e, e, cx, y, z1 - o); tb(e, e, D - t, x0 + o, y, cz); tb(e, e, D - t, x1 - o, y, cz); });
  const tm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(.25, .62, .55), roughness: .15, transparent: true, opacity: .55, emissive: new THREE.Color(.03, .09, .08), depthWrite: false }); tm.userData.frontPatched = true;
  const tl = new THREE.Mesh(mergeGeometries(teal), tm); tl.renderOrder = 21; tl.raycast = () => {}; tl.castShadow = false; tl.name = 'vitrine glass edges'; g.add(tl);
  const fr = new THREE.Mesh(mergeGeometries(bars), brass); fr.castShadow = false; fr.receiveShadow = true; fr.raycast = () => {}; fr.name = 'vitrine frame'; g.add(fr);
  g.traverse(o => { o.userData.noInk = true; o.userData.noContact = true; o.userData.noReflect = true; });
  // backdrop switch: outside the case → studio gradient; inside → the scene's sky (kept in scene.userData.skyBackground)
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'), gr = x.createRadialGradient(256, 200, 20, 256, 256, 420);
  gr.addColorStop(0, studio[0]); gr.addColorStop(.7, studio[1]); gr.addColorStop(1, '#100b08'); x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  const lamp = x.createRadialGradient(70, 40, 4, 70, 40, 230); lamp.addColorStop(0, 'rgba(255,214,160,.55)'); lamp.addColorStop(1, 'rgba(255,214,160,0)'); x.fillStyle = lamp; x.fillRect(0, 0, 512, 512);   // a warm lamp glow in the studio corner
  const bg = new THREE.CanvasTexture(c); bg.colorSpace = THREE.SRGBColorSpace;
  let sky = null, skyOnly = null, atm0 = null;
  fr.onBeforeRender = (r, scene, cam) => {
    if (!cam.isPerspectiveCamera) return;
    const p = cam.position, inside = p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < y1, cur = scene.background;
    if (!sky && cur && cur !== bg && cur.isTexture) { sky = scene.userData.skyBackground || cur; g.userData.gpu.push(sky); }   // freed with the group even while the backdrop is up
    if (sky && (cur === sky || cur === bg)) scene.background = inside ? sky : bg;   // never touch the paper background of the drawing stage
    if (!skyOnly) { skyOnly = []; scene.traverse(o => { if (o.userData.skyOnly) skyOnly.push(o); }); }
    skyOnly.forEach(o => { o.visible = inside; });
    const A = scene.userData.aaaAtmos; if (A) { if (!atm0) atm0 = { skyFog: A.skyFog, god: A.god }; A.skyFog = inside ? atm0.skyFog : 0; A.god = inside ? atm0.god : 0; A.vitrineK = inside ? 1 : .2; }   // a specimen seen from outside has no aerial perspective
  };
  fr.frustumCulled = false;
  g.userData.vitrine = { min, max, backdrop: bg }; g.userData.gpu = [bg];   // util.js gpuSet: disposed with the group (whichever of the two is not the scene background)
  return g;
}
