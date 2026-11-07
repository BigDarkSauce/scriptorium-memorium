// Baroque library architecture (after Metten, Admont, Mafra, Wiblingen; see docs/research/baroque-libraries.md):
// shared materials, a merge-by-material accumulator, draped/atlas figures, and the parametric `baroque` room shell.
// Everything is procedural: canvas textures + generated geometry, merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { marbleTex, gildTex, marbleFloor, frescoTex, rocailleTex, eggDartTex, bookSpinesTex, windowSkyTex, shaftTex, plaster, woodGrain, radialGlow, fluteNormal, figuredWood, spineAtlas, SPINE_VARIANTS, parchment, companions, marbleSet } from './textures.js';
import { surface } from './surfaces.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const Mx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

// ---------- materials (cached; textures use world-metre UVs so one material serves every size) ----------
// Every material is a full surface stack (colour + normal + roughness, metalness where it is metal), lit by the room's
// own probe (surfaces.js RoomProbe; the scene's environmentIntensity is the one that applies, so envMapIntensity stays 1):
//  • marble/scagliola: veins a hair recessed and duller (0.12–0.2) than the polished field (0.055–0.1), pits; a
//    polishing coat (clearcoat 1, 0.04–0.07) over it; warm subsurface wrap on the pale stones (measured scattering
//    radius of marble ≈ (0.85, 0.56, 0.40) mm: red travels farthest); albedo ≤ 0.8 linear (physicallybased.info: 0.83)
//  • gilt: gold F0 (1.0, 0.77, 0.31) (physicallybased.info), leaf seams as fine raised ridges, a burnisher's
//    anisotropy, burnished arrises and red bole where the leaf is rubbed through, matte toned hollows (column capitals)
//  • wood: open pores and the earlywood ripple in the normal map, 0.45–0.6 wood under a varnish coat whose normal
//    stays flat (varnish fills the pores); finish rubbed lighter on the arrises; painted wood chips at its edges
//  • plaster: trowel waves, grit, hairline cracks, ≥ 0.86 rough; walls darken toward floor, cornice and corners
const V2 = (x, y = x) => new THREE.Vector2(x, y);
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
// marble with its companions; k = roughness multiplier on the map, cc = polishing coat roughness
function marbleMat(stone, o = {}) {
  const M = marbleSet(stone, { size: 512, seed: o.seed ?? 2 }), pale = /statuary|cream|pavonazzetto|giallo|rose|warmgrey|dove/.test(stone);
  const m = new THREE.MeshPhysicalMaterial({ map: M.map, normalMap: M.normalMap, normalScale: V2(M.normalScale), roughnessMap: M.roughnessMap, roughness: o.k ?? 2.2, clearcoat: o.cc == null ? 1 : o.cc ? 1 : 0, clearcoatRoughness: o.cc || .05, vertexColors: !!o.vc, envMapIntensity: 1,
    sheen: pale ? .12 : 0, sheenRoughness: .5, sheenColor: new THREE.Color(0xfff2e6) });
  if (/statuary|cream|pavonazzetto/.test(stone)) m.color.setScalar(.92);   // keep white marble below 0.8 linear
  return surface(m, { sss: pale ? [.85, .56, .4, .38] : null, macro: [.8, .07, .2], detail: [3.7, .35] });
}
function giltMat(o = {}) {
  const t = gildTex(), C = companions(t.map) || {};
  const m = new THREE.MeshPhysicalMaterial({ color: o.color || lin(1.12, 1.16, 1.02), map: t.map, roughnessMap: t.rough, normalMap: C.normalMap, normalScale: V2(C.normalScale || .5), metalness: o.metal ?? 1, roughness: o.rough ?? .62,
    anisotropy: .22, anisotropyRotation: Math.PI / 2, vertexColors: !!o.vc, envMapIntensity: 1 });
  if (o.vc) m.defaultAttributeValues = { color: [1, 1, 1] };
  return surface(m, { edge: .007, wear: 3, noise: 26, gilt: !!o.vc, macro: [1.4, .06, .25] });
}
function woodMat(tone, key, o = {}) {
  const map = figuredWood(tone, key, o.fig || {}), C = companions(map);
  const P = o.coat === 0 ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const m = new P(Object.assign({ map, normalMap: C.normalMap, normalScale: V2(C.normalScale), roughnessMap: C.roughnessMap, roughness: o.rough ?? 1, envMapIntensity: 1 }, o.coat === 0 ? {} : { clearcoat: o.coat ?? .5, clearcoatRoughness: o.ccr ?? .22 }));
  return surface(m, { edge: o.paint ? .004 : .005, wear: o.paint ? 2 : 1, noise: o.paint ? 45 : 30, macro: [1.1, .07, .15], detail: [3.1, .3] });
}
function plasterMat(tone, key, amp, o = {}) {
  const map = plaster(tone, key, amp), C = companions(map);
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, map, normalMap: C.normalMap, normalScale: V2(o.ns ?? C.normalScale), roughnessMap: C.roughnessMap, roughness: o.rough ?? 1, envMapIntensity: 1 });
  return surface(m, { macro: [.45, .06, .04], detail: [5.3, .45], wallAO: !!o.wallAO });
}
const MATS = new Map();
export function bmat(name) {
  if (MATS.has(name)) return MATS.get(name);
  let m;
  const S = o => new THREE.MeshStandardMaterial(o), P = o => new THREE.MeshPhysicalMaterial(o);
  if (name.startsWith('col-')) { // polished column marble (vertex-coloured: flute hollows baked darker); statuary a touch softer
    const k = name.slice(4), white = k === 'statuary'; m = marbleMat(k, { seed: 6, vc: true, k: white ? 2.6 : 2.0, cc: white ? .07 : .045 });
  } else if (name.startsWith('scag-')) { // scagliola / polished marble
    const k = name.slice(5); m = marbleMat(k, { seed: 2, k: 2.4, cc: .07 }); m.userData.boxUV = .9;
  } else switch (name) {
    case 'gilt': m = giltMat(); m.userData.boxUV = 2.2; break;
    // gilt that carries the turned parts' cavity shade (column capitals): matte, toned hollows, burnished highs
    case 'gilt-col': m = giltMat({ vc: true }); break;
    // thin gilt mouldings (door frames, beads): the same leaf at ~4× the size, so an 18 mm strip shows one leaf over a
    // long run instead of a dashed row of 57 mm squares that shimmers as the view moves
    case 'gilt-fine': m = giltMat({ rough: .55 }); m.userData.boxUV = .55; break;
    case 'gilt-dim': m = giltMat({ color: lin(.7, .62, .42), rough: .85, metal: .9 }); m.userData.boxUV = 2.2; break;
    case 'stucco': m = plasterMat([240, 234, 222], 'stucco', .1, { color: 0xf3ede2, ns: .3 }); m.userData.boxUV = .35; break;
    // a warm limewash a step darker than the ivory cases, so white-and-gold bookcases separate from the wall behind them
    case 'wall': m = plasterMat([222, 207, 182], 'bwall3', .09, { wallAO: true }); m.userData.boxUV = .22; break;
    // painted wood (Admont's white cases): ivory lacquer with the grain faintly showing through
    case 'cream': m = woodMat([244, 236, 220], 'ivory', { fig: { paint: 1 }, paint: true, coat: .45, ccr: .28 }); m.color.set(0xfbf6ec); m.userData.boxUV = .55; break;
    // case interiors (backs, inner side panels) a shade deeper, as they sit in their own shadow: the shelves read as
    // hollows framed by the ivory carcass instead of one flat white block
    case 'cream-back': m = woodMat([186, 166, 134], 'ivoryb2', { fig: { paint: 1, seed: 3 }, paint: true, coat: 0 }); m.userData.boxUV = .55; break;
    // figured walnut (Metten) and pale rococo oak (Mafra)
    case 'walnut': m = woodMat([128, 80, 46], 'walnut', { coat: .5, ccr: .2 }); m.userData.boxUV = .8; break;
    case 'walnut-dark': m = woodMat([80, 49, 29], 'walnutd', { fig: { seed: 5 }, coat: .35, ccr: .3 }); m.userData.boxUV = .8; break;
    case 'pale': m = woodMat([214, 186, 142], 'pale', { fig: { seed: 9 }, coat: .3, ccr: .32 }); m.userData.boxUV = .8; break;
    case 'pale-dark': m = woodMat([168, 134, 94], 'paled', { fig: { seed: 11 }, coat: .22, ccr: .4 }); m.userData.boxUV = .8; break;
    case 'boiserie-walnut': m = woodMat([104, 64, 36], 'walnutb', { fig: { seed: 13 }, coat: .45, ccr: .24 }); m.userData.boxUV = .8; break;
    case 'spines': { // instanced books: one cell of the spine atlas per binding variant (instance attribute aVar)
      const map = spineAtlas(), C = companions(map);
      m = S({ map, normalMap: C.normalMap, normalScale: V2(C.normalScale), roughnessMap: C.roughnessMap, metalnessMap: C.roughnessMap, roughness: 1, metalness: 1, envMapIntensity: 1 });
      m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVar;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x += aVar / ' + SPINE_VARIANTS.toFixed(1) + ';\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv.x += aVar / ' + SPINE_VARIANTS.toFixed(1) + ';\n#endif\n#ifdef USE_ROUGHNESSMAP\nvRoughnessMapUv.x += aVar / ' + SPINE_VARIANTS.toFixed(1) + ';\n#endif\n#ifdef USE_METALNESSMAP\nvMetalnessMapUv.x += aVar / ' + SPINE_VARIANTS.toFixed(1) + ';\n#endif'); };
      m.customProgramCacheKey = () => 'spines-atlas-2'; m.userData.noCast = true; surface(m, { macro: [2.3, .08, .15] }); break; }
    case 'paint': m = S({ color: 0xf0ebe0, roughness: .55 }); break;
    // antique marbles of the columns: vertex-coloured (flute hollows baked darker), UVs in metres set by the column builder
    case 'statuary': m = marbleMat('statuary', { seed: 4, k: 2.6, cc: .08 }); m.userData.boxUV = 1.6; break;
    case 'books': m = S({ map: bookSpinesTex(), roughness: .72 }); break;
    case 'pages': { const map = parchment('deskbook', 256, 256), C = companions(map); m = S({ map, normalMap: C.normalMap, normalScale: V2(C.normalScale), roughnessMap: C.roughnessMap, roughness: 1 }); break; }
    case 'book-0': case 'book-1': case 'book-2': m = S({ color: [0x5a2a1e, 0x2a3a5a, 0x3a4a2a][+name.slice(5)], roughness: .62 }); break;
    // beeswax: light scatters a few mm into the candle, so its shadow side glows (wrap) and it is never chalky
    case 'candle': m = surface(P({ color: 0xf6eedc, roughness: .45, emissive: 0xffcf8a, emissiveIntensity: .12, sheen: .3, sheenColor: new THREE.Color(0xfff0d8), sheenRoughness: .6 }), { sss: [1, .85, .6, .6] }); break;
    case 'flame': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.5, 1.1), toneMapped: false }); m.userData.noCast = true; break;
    case 'sky': m = new THREE.MeshBasicMaterial({ map: windowSkyTex(), color: new THREE.Color(1.05, 1.02, .98) }); m.userData.noCast = true; m.userData.hdr = 10; break;   // ×10 inside the room probe: a window is 10–20× brighter than the walls
    case 'shaft': { const t = shaftTex(); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m = new THREE.MeshBasicMaterial({ map: t, color: 0xffd9a6, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: true }); m.userData.noCast = true; break; }
    case 'cove': { const t = rocailleTex(3); m = S({ map: t.map, metalnessMap: t.mr, roughnessMap: t.mr, metalness: 1, roughness: 1, envMapIntensity: 1, emissive: 0xffffff, emissiveMap: t.map, emissiveIntensity: .06 }); surface(m, { macro: [.7, .05, .2] }); break; }
    case 'eggdart': m = surface(S({ map: eggDartTex(), metalness: .85, roughness: .34, envMapIntensity: 1 }), {}); break;
    case 'fluted': m = surface(P({ color: 0xf1e9d8, normalMap: fluteNormal(), normalScale: V2(1, 1), roughness: .42, clearcoat: .35, clearcoatRoughness: .3 }), { macro: [1.2, .05, .1] }); m.normalMap.repeat.set(3, 1); break;
    default: m = S({ color: 0xcccccc });
  }
  if (name.startsWith('fresco')) { const t = frescoTex(+name.slice(6) || 1); m = S({ map: t, roughness: .95, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .16, side: THREE.DoubleSide }); }
  m.userData.bmat = name; m.userData.shared = true; MATS.set(name, m); return m;   // shared: util.disposeTree leaves it (and its textures) alone
}

// Box-projected UVs in metres (applied after merging, in final coordinates).
export function boxUV(geo, s = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z * s, y * s); else if (ay >= az) uv.setXY(i, x * s, z * s); else uv.setXY(i, x * s, y * s);
  }
  uv.needsUpdate = true;
}
// Per-vertex distances (m) from a box face's point to that face's four edges, linear across the face, so the fragment's
// min() is its exact distance to the nearest arris (edge wear, surfaces.js SM_EDGE). Other geometry gets 9 (no wear).
function edgeAttr(g, src) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4).fill(9), P = src.parameters;
  if (src.type === 'BoxGeometry' && P && g.attributes.normal) {
    const p = g.attributes.position, nr = g.attributes.normal, hx = P.width / 2, hy = P.height / 2, hz = P.depth / 2;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const [b, hb, c, hc] = ax > .5 ? [z, hz, y, hy] : ay > .5 ? [x, hx, z, hz] : [x, hx, y, hy];
      a[i * 4] = hb - b; a[i * 4 + 1] = hb + b; a[i * 4 + 2] = hc - c; a[i * 4 + 3] = hc + c;
    }
  }
  return new THREE.BufferAttribute(a, 4);
}
// Accumulates geometry per material, merges at the end (one draw call per material).
export class Acc {
  constructor() { this.m = new Map(); }
  add(mat, geo, m4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.aEdge) g.setAttribute('aEdge', edgeAttr(g, geo));   // before the transform: face-local distances
    if (m4) g.applyMatrix4(m4);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aEdge' && !(k === 'color' && mat.vertexColors)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (mat.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.morphAttributes = {}; g.clearGroups();
    if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(g);
    return g;
  }
  build(parent, { cast = true, receive = true, name = '' } = {}) {
    const out = [];
    for (const [mat, list] of this.m) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false); if (!geo) continue;
      if (mat.userData.boxUV) boxUV(geo, mat.userData.boxUV);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat); mesh.name = name + (mat.userData.bmat || 'm');
      mesh.castShadow = cast && !mat.userData.noCast; mesh.receiveShadow = receive && !mat.transparent;
      parent.add(mesh); out.push(mesh);
    }
    this.m.clear(); return out;
  }
}

// ---------- classical columns (the Greek and Roman orders after Vitruvius and Vignola) ----------
// Built in the column's own frame (y up from its foot, the front toward +z); proportions in units of the lower
// diameter D. Shafts and round mouldings are surfaces of revolution with a per-vertex shade (the hollows of flutes,
// scotiae and volute channels darker) and UVs in metres, so one antique-marble material per stone serves every
// column: 'col-statuary' (white bases, capitals, entablatures), 'col-giallo', 'col-verde', 'col-rosso',
// 'col-pavonazzetto' (shafts). Capitals may be gilt. Everything merges by material through an Acc; a column with
// pedestal, capital and entablature fragment stays under ~30k triangles.
const TAU = Math.PI * 2;
const G1 = (x, c, s) => Math.exp(-((x - c) * (x - c)) / (s * s));
const sstep = (a, b, t) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const TEX_M = .55;   // metres one marble texture repeat covers on a column
// a parametric grid (u across, v along) → indexed geometry with normals, uv and a shade colour.
// fn(u, v) → [x, y, z, shade]. Outward normal = ∂u × ∂v (flip reverses it).
function surf(nu, nv, fn, closeU = false, flip = false) {
  const cu = closeU ? nu : nu + 1, n = cu * (nv + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let q = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cu; i++, q++) {
    const r = fn(i / nu, j / nv), k = r[3] == null ? 1 : clamp(r[3], .25, 1.05);
    pos[q * 3] = r[0]; pos[q * 3 + 1] = r[1]; pos[q * 3 + 2] = r[2]; col[q * 3] = k; col[q * 3 + 1] = k * (.97 + .03 * k); col[q * 3 + 2] = k * (.93 + .07 * k); uv[q * 2] = i / nu; uv[q * 2 + 1] = j / nv;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * cu + i, b = j * cu + (closeU ? (i + 1) % nu : i + 1), c = a + cu, d = b + cu; if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// A closed surface of revolution: nu steps round (u ∈ [0, 1], the seam duplicated with its normals averaged, so
// the texture never smears across it), rows at the given v values. fn(u, v) → [x, y, z, shade]. UVs in metres:
// u along the circumference of radius rRef, v = height.
function lathe3(nu, vs, fn, rRef = .2) {
  const cu = nu + 1, nv = vs.length - 1, n = cu * (nv + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let q = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cu; i++, q++) {
    const r = fn(i === nu ? 1 : i / nu, vs[j]), k = r[3] == null ? 1 : clamp(r[3], .3, 1.05);
    pos[q * 3] = r[0]; pos[q * 3 + 1] = r[1]; pos[q * 3 + 2] = r[2]; col[q * 3] = k; col[q * 3 + 1] = k * (.98 + .02 * k); col[q * 3 + 2] = k * (.95 + .05 * k);
    uv[q * 2] = i / nu * TAU * rRef / TEX_M; uv[q * 2 + 1] = r[1] / TEX_M;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * cu + i, b = a + 1, c = a + cu, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let j = 0; j <= nv; j++) { const a = j * cu, b = a + nu, x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1; nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
// a turned moulding from a profile [[r, y, shade?], …] (bottom to top round the outside, metres)
function latheP(pts, nu = 48) { const rr = pts.reduce((a, p) => a + p[0], 0) / pts.length; return lathe3(nu, pts.map((_, j) => j), (u, j) => { const [r, y, k] = pts[j], th = u * TAU; return [r * Math.sin(th), y, r * Math.cos(th), k == null ? 1 : k]; }, rr); }
// profile helpers: a convex quarter/half round (torus) and a concave hollow (scotia, cavetto), appended bottom → top
const torusP = (out, cr, cy, R, a0 = -Math.PI / 2, a1 = Math.PI / 2, n = 7) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cr + R * Math.cos(a), cy + R * Math.sin(a), .9 + .1 * Math.cos(a)]); } return out; };
const scotiaP = (out, r, y0, y1, depth, n = 7) => { for (let k = 0; k <= n; k++) { const t = k / n, s = Math.sin(Math.PI * t); out.push([r - depth * s, y0 + (y1 - y0) * t, 1 - .45 * s]); } return out; };
// a box with a shade colour and metre UVs (for vertex-coloured marble materials)
function boxC(w, h, d, shade = 1) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), x = p.getX(i) / TEX_M, y = p.getY(i) / TEX_M, z = p.getZ(i) / TEX_M; if (ax > .5) uv.setXY(i, z, y); else if (ay > .5) uv.setXY(i, x, z); else uv.setXY(i, x, y); c[i * 3] = shade; c[i * 3 + 1] = shade; c[i * 3 + 2] = shade; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const withC = (g, shade = 1) => { const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(shade); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return g; };
// The orders: column height in lower diameters (with base and capital), capital height (D), base (Attic) or none.
export const ORDERS = {
  doric: { h: 6.5, cap: .37, base: false, flutes: 20, arris: true },          // Greek Doric (Parthenon ≈ 5.5 D; a little slenderer here)
  ionic: { h: 9, cap: .3, base: true, flutes: 24 },
  corinthian: { h: 10, cap: 1.12, base: true, flutes: 24 },
  composite: { h: 10, cap: 1.12, base: true, flutes: 24 },
  solomonic: { h: 9.5, cap: 1.12, base: true, flutes: 10, twist: 3 } };       // Bernini's baldacchino: three turns, a composite capital
// The column's lower diameter for a given total height (base + shaft + capital).
export const colDiameter = (order, H) => H / (ORDERS[order] || ORDERS.ionic).h;
// The shaft: entasis (straight for the lower third, then tapering to 5/6 D, after Vignola), apophyges flaring into
// the base and under the astragal, flutes with fillets (Ionic, Corinthian) or sharp arrises (Doric) that end in
// rounded stops; a Solomonic shaft winds round its axis (an offset circle turning `twist` times) with helical flutes.
function shaftGeo(D, y0, Hs, o) {
  const r0 = D / 2, nf = o.flutes || 0, arris = !!o.arris, tw = o.twist || 0;
  const ts = [0, .004, .01, .018, .028, .04, .055, .075], mid = tw ? 20 * tw : 14;
  for (let k = 1; k < mid; k++) ts.push(.075 + .85 * k / mid);
  ts.push(.925, .945, .96, .972, .982, .99, .996, 1);
  const nu = tw ? 96 : Math.max(48, nf * (arris ? 6 : 8)), pitch = nf ? TAU / nf : 1;
  return lathe3(nu, ts, (u, t) => {
    const th = u * TAU, z = t * Hs;
    let r = r0 * (t < 1 / 3 ? 1 : 1 - Math.pow((t - 1 / 3) / (2 / 3), 1.15) / 6);
    if (!arris) r += r0 * (.04 * Math.exp(-z / (.06 * D)) + .05 * Math.exp(-(Hs - z) / (.05 * D)));
    let a = th, k = 1;
    if (tw) { const env = sstep(0, .08, t) * sstep(1, .92, t), ph = TAU * tw * sstep(0, 1, t * .98 + .01); r *= 1 - .12 * env + .22 * env * Math.cos(th - ph); a = th - ph; k = .9 + .1 * Math.cos(th - ph); }
    if (nf) {
      const fade = arris ? sstep(.985, .965, t) : sstep(.02, .055, t) * sstep(.975, .94, t), f = ((a / pitch) % 1 + 1) % 1;
      let d = 0; if (arris) d = 1 - (2 * f - 1) * (2 * f - 1); else { const s = (f - .13) / .74; if (s > 0 && s < 1) d = Math.sqrt(Math.max(0, 1 - (2 * s - 1) * (2 * s - 1))); }
      const fd = (arris ? .16 : .3) * pitch * r * fade;
      r -= fd * d; k *= 1 - .4 * d * fade;
    }
    return [r * Math.sin(th), y0 + z, r * Math.cos(th), k];
  }, r0);
}
// An Ionic volute in its own plane (local xy, the face toward +z): a spiral band (logarithmic, 2¾ turns) standing
// proud of a backing disc, the channel between the turns left in shadow, an eye at the centre. s = +1 winds out to the right.
function volute(add, M, R0, depth, s = 1, eye = .17) {
  const turns = 2.75, Phi = turns * TAU, k = Math.log(1 / eye) / Phi, r = f => R0 * Math.exp(-k * f), shape = new THREE.Shape(), N = 40 * turns;
  for (let i = 0; i <= N; i++) { const f = Phi * i / N, q = r(f); i ? shape.lineTo(s * q * Math.sin(f), q * Math.cos(f)) : shape.moveTo(s * q * Math.sin(f), q * Math.cos(f)); }
  for (let i = N; i >= 0; i--) { const f = Phi * i / N, q = r(f) - .5 * (r(f) - r(f + TAU)); shape.lineTo(s * q * Math.sin(f), q * Math.cos(f)); }
  const band = new THREE.ExtrudeGeometry(shape, { depth: depth * 1.6, bevelEnabled: false, curveSegments: 1 }); band.translate(0, 0, -depth * .2);
  add(withC(band), M);
  const disc = new THREE.CylinderGeometry(R0 * 1.03, R0 * 1.03, depth, 40); disc.rotateX(Math.PI / 2); disc.translate(0, 0, -depth * .62);
  add(withC(disc, .62), M);
  add(withC(new THREE.SphereGeometry(R0 * eye * 1.15, 12, 8), .95), M.clone().multiply(Mx(0, 0, depth * .9, 0, 0, 0, 1, 1, .6)));
}
// An acanthus leaf on the bell of a capital at angle th: lobed outline, raised midrib with a groove either side,
// cupped across, the tip curling forward and down. Two-sided (front and back sheets). rbell(y) = the bell radius.
function acanthus(add, M, th, y0, h, w, lift, out, rbell, D) {
  const er = V(Math.sin(th), 0, Math.cos(th)), et = V(Math.cos(th), 0, -Math.sin(th)), thick = .012 * D;
  [1, -1].forEach(sg => add(surf(8, 12, (u, v) => {
    const x = u * 2 - 1, ax = Math.abs(x), lob = 1 - .26 * Math.pow(Math.abs(Math.sin(v * Math.PI * 3.5)), 4);
    const wd = w / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.06)), .5) * lob * (1 - .25 * v);
    const cu = sstep(.6, 1, v), yy = y0 + h * v - cu * cu * h * .22;
    const rr = rbell(Math.min(yy, y0 + h)) + lift + out * Math.pow(v, 1.7) + cu * h * .3 + .02 * D * (1 - ax * ax) * (1 - .5 * v) + sg * thick / 2;
    const P = er.clone().multiplyScalar(rr).addScaledVector(et, x * wd); P.y = yy;
    return [P.x, P.y, P.z, sg > 0 ? 1 - .3 * G1(ax, .2, .08) - .25 * ax * ax - .15 * cu : .6];
  }, false, sg < 0), M));
}
// A stalk rising from the bell and ending in a spiral: points (th, r, y) up to the start of the scroll, then the scroll
// in the vertical plane through angle thEnd, centre (rc, yc), radius rho shrinking over 1.6 turns (over the top, out, down, in).
function helix(add, M, pts, thEnd, rc, yc, rho, rad) {
  const P = pts.map(([t, r, y]) => V(r * Math.sin(t), y, r * Math.cos(t))), er = V(Math.sin(thEnd), 0, Math.cos(thEnd));
  for (let k = 0; k <= 12; k++) { const ps = k / 12 * Math.PI * 1.6, q = rho * (1 - .62 * k / 12), c = er.clone().multiplyScalar(rc - q * Math.cos(ps)); c.y = yc + q * Math.sin(ps); P.push(c); }
  add(withC(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), 44, rad, 6)), M);
}
// Concave-sided abacus of the Corinthian and Composite capitals (corners chamfered), extruded upward from y = 0.
function abacusGeo(a, sag, ch, h) {
  const s = new THREE.Shape(), C = [[a, a], [-a, a], [-a, -a], [a, -a]];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = C[i], [x1, y1] = C[(i + 1) % 4], dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    const p0 = [x0 + dx * ch, y0 + dy * ch], p1 = [x1 - dx * ch, y1 - dy * ch], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -Math.sign(mx) * (Math.abs(mx) > 1e-6 ? 1 : 0), ny = -Math.sign(my) * (Math.abs(my) > 1e-6 ? 1 : 0);
    if (i === 0) s.moveTo(p0[0], p0[1]); else s.lineTo(p0[0], p0[1]);
    s.quadraticCurveTo(mx + nx * sag * 2, my + ny * sag * 2, p1[0], p1[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); return withC(g);
}
// A column's merged parts (per material, in its own frame), cached by its parameters: rebuilding a hall at a new
// width or depth (or moving a display column) re-uses them instead of re-turning every flute and leaf.
const _cols = new Map();
export function addColumn(A, M, o = {}) {
  const key = JSON.stringify([o.order, o.marble, o.trim, !!o.gilt, +(+o.H || 3).toFixed(3), +(+o.D || 0).toFixed(3), !!o.entab, o.plinth]);
  let c = _cols.get(key);
  if (!c) { const A2 = new Acc(), info = column(A2, null, o), parts = []; for (const [mat, list] of A2.m) parts.push([mat, mergeGeometries(list, false)]); A2.m.clear(); c = { parts, info }; _cols.set(key, c); if (_cols.size > 24) _cols.delete(_cols.keys().next().value); }
  c.parts.forEach(([mat, geo]) => A.add(mat, geo, M)); return c.info;
}
// Pushes one column into the accumulator A at frame M (its foot at y = 0 of M; null = its own frame).
// o: { order, marble (shaft stone), trim (base/capital stone, 'statuary'), gilt (gilt capital), H (base + shaft + capital, m),
//      D (lower diameter; default H / order height), entab (an entablature fragment on top), plinth (Greek Doric stylobate block) }
// Returns { top, D, half } (top of the topmost part, the lower diameter, the half width of the footprint).
export function column(A, M, o = {}) {
  const ord = ORDERS[o.order] || ORDERS.ionic, H = o.H || 3, D = o.D || H / ord.h, r0 = D / 2;
  const shaftM = bmat('col-' + (o.marble || 'giallo')), trimM = bmat('col-' + (o.trim || 'statuary')), capM = o.gilt ? bmat('gilt-col') : trimM, gilt = bmat('gilt');
  M = M || new THREE.Matrix4();
  const add = mat => (geo, m) => A.add(mat, geo, m ? M.clone().multiply(m) : M), T = add(trimM), S = add(shaftM), C = add(capM);
  const capH = ord.cap * D;
  let y = 0, half = D * .68;
  // ---- base ----
  if (ord.base) {
    const pl = D * .167; T(boxC(D * 1.36, pl, D * 1.36), Mx(0, pl / 2, 0));
    const p = [], u = v => v * D; // the Attic base: torus, fillet, scotia, fillet, torus, fillet
    torusP(p, u(.5975), pl + u(.0625), u(.0625));
    p.push([u(.57), pl + u(.125), .8], [u(.57), pl + u(.14), .75]); scotiaP(p, u(.57), pl + u(.14), pl + u(.225), u(.055));
    p.push([u(.578), pl + u(.236), .85]); torusP(p, u(.535), pl + u(.2825), u(.0425), -.95, Math.PI / 2, 6);
    p.push([u(.52), pl + u(.325), .85], [u(.52), pl + u(.333), .9]);
    T(latheP(p, 64)); y = pl + u(.333);
  } else if (o.plinth !== false) { const st = D * .12; T(boxC(D * 1.42, st, D * 1.42), Mx(0, st / 2, 0)); y = st; half = D * .71; }
  // ---- shaft ----
  const Hs = H - y - capH;
  S(shaftGeo(D, y, Hs, ord)); y += Hs;
  const rt = r0 * 5 / 6;
  // ---- capital ----
  if (o.order === 'doric') { // annulets and a broad echinus under a square abacus
    const p = [[rt * .98, y - D * .01, .9], [rt + D * .012, y + D * .012, 1], [rt + D * .002, y + D * .024, .7], [rt + D * .016, y + D * .038, 1], [rt + D * .006, y + D * .05, .7], [rt + D * .02, y + D * .064, 1]];
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI / 2; p.push([rt + D * .02 + D * .18 * Math.sin(a), y + D * .064 + D * .13 * (1 - Math.cos(a)), .85 + .15 * Math.sin(a)]); }
    p.push([D * .5, y + D * .194, 1]); C(latheP(p, 64));
    C(boxC(D * 1.24, D * .175, D * 1.24), Mx(0, y + D * .19 + D * .0875, 0)); y += D * .365;
  } else if (o.order === 'ionic') { // astragal, egg-and-dart echinus, volutes on front and back joined by the bolsters, thin abacus
    const at = []; torusP(at, rt + D * .005, y + D * .01, D * .028, -Math.PI / 2, Math.PI / 2, 6); C(latheP([[rt * .97, y - D * .02, .9], ...at, [rt * .96, y + D * .04, .9]], 48));
    C(lathe3(128, [0, .25, .5, .75, 1], (u, v) => { const th = u * TAU, egg = Math.max(0, Math.cos(16 * th)), rr = rt + D * (.02 + .07 * Math.sin(v * Math.PI / 2)) + D * .018 * Math.pow(egg, 3) * Math.sin(v * Math.PI); return [rr * Math.sin(th), y + D * (.035 + .085 * v), rr * Math.cos(th), .62 + .38 * Math.pow(egg, .6)]; }, rt));
    const zf = D * .4, vx = D * .5, vy = y + D * .02, R0 = D * .205, dep = D * .03;
    [-1, 1].forEach(sx => [1, -1].forEach(sz => volute(C, Mx(sx * vx, vy, sz * zf, 0, sz > 0 ? 0 : Math.PI, 0), R0, dep, sx * sz)));
    const bol = lathe3(32, [0, .1, .25, .4, .48, .52, .6, .75, .9, 1], (u, v) => { const th = u * TAU, w = Math.abs(v - .5) * 2, rr = R0 * (.98 - .3 * Math.pow(1 - w, .8)) + (Math.abs(v - .5) < .03 ? D * .012 : 0); return [rr * Math.sin(th), -zf * .98 + 2 * zf * .98 * v, rr * Math.cos(th), .8 + .2 * w]; }, R0);
    [-1, 1].forEach(sx => C(bol, Mx(sx * vx, vy, 0, Math.PI / 2)));
    C(boxC(2 * vx, D * .1, 2 * zf + D * .008, .9), Mx(0, y + D * .17, 0));
    C(boxC(D * 1.1, D * .085, D * 1.0), Mx(0, y + D * .222 + D * .0425, 0)); y += D * .305;
  } else { // Corinthian / Composite: bell with two rows of acanthus, caulicoli and helices (or Ionic corner volutes), concave abacus
    const hc = capH, comp = o.order === 'composite' || o.order === 'solomonic';
    const bell = yy => { const t = clamp((yy - y) / hc, 0, 1); return rt + D * (.015 + .05 * t * t) + (t > .8 ? D * .3 * Math.pow((t - .8) / .2, 2) * .3 : 0); };
    const at = []; torusP(at, rt + D * .005, y + D * .01, D * .028, -Math.PI / 2, Math.PI / 2, 6); C(latheP([[rt * .97, y - D * .02, .9], ...at, [rt * .97, y + D * .04, .9]], 48));
    const bp = []; for (let k = 0; k <= 10; k++) { const yy = y + D * .03 + (hc * .86 - D * .03) * k / 10; bp.push([bell(yy), yy, .7 + .3 * k / 10]); } bp.push([bell(y + hc * .86) * .8, y + hc * .865, 1]); C(latheP(bp, 40));
    for (let k = 0; k < 8; k++) acanthus(C, null, (k + .5) * TAU / 8, y + D * .02, hc * (comp ? .3 : .34), D * .34, D * .03, D * .05, bell, D);
    for (let k = 0; k < 8; k++) acanthus(C, null, k * TAU / 8, y + hc * .12, hc * (comp ? .44 : .5), D * .32, D * .012, D * .07, bell, D);
    if (!comp) {
      for (let f = 0; f < 4; f++) [-1, 1].forEach(s => {
        const tc = f * Math.PI / 2 + s * .36, yb = y + hc * .5, tC = f * Math.PI / 2 + s * Math.PI / 4;
        C(withC(new THREE.CylinderGeometry(D * .035, D * .03, hc * .12, 8)), Mx(Math.sin(tc) * (bell(yb) + D * .03), yb + hc * .06, Math.cos(tc) * (bell(yb) + D * .03)));
        helix(C, null, [[tc, bell(yb + hc * .1) + D * .04, yb + hc * .1], [(tc * 2 + tC) / 3, bell(yb + hc * .2) + D * .08, yb + hc * .2]], tC, D * .66, y + hc * .76, D * .07, D * .02);
        const tI = f * Math.PI / 2 + s * .07;
        helix(C, null, [[tc, bell(yb + hc * .1) + D * .035, yb + hc * .1], [(tc + tI * 2) / 3, bell(yb + hc * .2) + D * .05, yb + hc * .22]], tI, bell(y + hc * .76) + D * .06, y + hc * .76, D * .035, D * .014);
      });
    } else { // Composite: an egg-and-dart echinus and four large Ionic volutes facing the diagonals
      C(lathe3(96, [0, .5, 1], (u, v) => { const th = u * TAU, egg = Math.max(0, Math.cos(12 * th)), rr = bell(y + hc * .62) + D * (.02 + .03 * Math.sin(v * Math.PI)) + D * .02 * Math.pow(egg, 3) * Math.sin(v * Math.PI); return [rr * Math.sin(th), y + hc * (.56 + .12 * v), rr * Math.cos(th), .65 + .35 * egg]; }, rt));
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, rc = D * .56; volute(C, Mx(Math.sin(a) * rc, y + hc * .7, Math.cos(a) * rc, 0, a, 0), D * .17, D * .028, 1); }
    }
    const a = D * .7, ah = hc * .14;
    C(abacusGeo(a * .965, D * .1, D * .05, ah * .45), Mx(0, y + hc * .86 - .002, 0)); C(abacusGeo(a, D * .1, D * .06, ah * .55), Mx(0, y + hc * .86 + ah * .45 - .004, 0));
    for (let f = 0; f < 4; f++) { const t = f * Math.PI / 2, rr = a - D * .1 + D * .012; add(gilt)(withC(new THREE.SphereGeometry(D * .055, 12, 8)), Mx(Math.sin(t) * rr, y + hc * .93, Math.cos(t) * rr, 0, t, 0, 1, 1, .5)); }
    y += hc; half = Math.max(half, a);
  }
  // ---- entablature fragment: three fasciae, a frieze, dentils and a projecting cornice ----
  if (o.entab) {
    const w = (o.order === 'doric' ? D * 1.24 : o.order === 'ionic' ? D * 1.1 : D * 1.4) + D * .02;
    let yy = y - .003;
    [[.1, 0], [.12, .02], [.14, .04]].forEach(([hh, pj]) => { T(boxC(w + D * pj * 2, D * hh, w + D * pj * 2, .9 + pj), Mx(0, yy + D * hh / 2, 0)); yy += D * hh - .002; });
    T(boxC(w + D * .12, D * .04, w + D * .12), Mx(0, yy + D * .02, 0)); yy += D * .04 - .002;
    S(boxC(w + D * .04, D * .36, w + D * .04, .95), Mx(0, yy + D * .18, 0)); yy += D * .36 - .002;
    T(boxC(w + D * .14, D * .05, w + D * .14), Mx(0, yy + D * .025, 0)); yy += D * .05 - .002;
    const dw = D * .06, dh = D * .09, dn = Math.max(3, Math.floor((w + D * .14) / (dw * 2))), sp = (w + D * .14) / dn, e = (w + D * .14) / 2 + dw * .25;
    for (let s = 0; s < 4; s++) { const t = s * Math.PI / 2; for (let k = 0; k < dn; k++) { const x = -(w + D * .14) / 2 + sp * (k + .5); T(boxC(dw, dh, dw * .9, .85), Mx(Math.cos(t) * x + Math.sin(t) * e, yy + dh / 2, -Math.sin(t) * x + Math.cos(t) * e)); } }
    T(boxC(w + D * .14 + dw * .1, dh + .004, w + D * .14 + dw * .1, .7), Mx(0, yy + dh / 2, 0)); yy += dh;
    T(boxC(w + D * .42, D * .12, w + D * .42), Mx(0, yy + D * .06, 0)); yy += D * .12 - .002;
    T(boxC(w + D * .36, D * .06, w + D * .36, .95), Mx(0, yy + D * .03, 0)); yy += D * .06;
    y = yy; half = Math.max(half, (w + D * .42) / 2);
  }
  return { top: y, D, half };
}
// Pedestal: base, die, cornice (scagliola die, stucco mouldings, gilt beads). Footprint w × d, height h. Pushes into acc.
export function pedestal(acc, M, w = .62, d = .62, h = 1, die = 'scag-rose') {
  const st = bmat('stucco'), gl = bmat('gilt'), dm = bmat(die), L = (geo, m) => M.clone().multiply(m);
  acc.add(st, new THREE.BoxGeometry(w + .1, .12, d + .1), L(0, Mx(0, .06, 0)));
  acc.add(gl, new THREE.BoxGeometry(w + .06, .025, d + .06), L(0, Mx(0, .132, 0)));
  acc.add(dm, new THREE.BoxGeometry(w, h - .3, d), L(0, Mx(0, .145 + (h - .3) / 2, 0)));
  acc.add(gl, new THREE.BoxGeometry(w + .04, .025, d + .04), L(0, Mx(0, h - .145, 0)));
  acc.add(st, new THREE.BoxGeometry(w + .12, .1, d + .12), L(0, Mx(0, h - .08, 0)));
  acc.add(st, new THREE.BoxGeometry(w + .06, .03, d + .06), L(0, Mx(0, h - .015, 0)));
}

// ---------- chandelier & sconce (pushed into accumulators; flames returned for the glow layer) ----------
function chandelier(acc, M, s, flames) {
  const gl = bmat('gilt'), cd = bmat('candle'), fl = bmat('flame'), A = (mat, geo, m) => acc.add(mat, geo, M.clone().multiply(m));
  A(gl, new THREE.LatheGeometry([[0, -.42], [.05, -.4], [.035, -.3], [.09, -.18], [.07, -.08], [.03, 0], [.05, .12], [.02, .3], [0, .32]].map(([r, y]) => new THREE.Vector2(r * s, y * s)), 20), Mx());
  A(gl, new THREE.TorusGeometry(.32 * s, .014 * s, 6, 40), Mx(0, -.16 * s, 0, Math.PI / 2));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), R = (i % 2 ? .44 : .52) * s, yA = (i % 2 ? .02 : -.06) * s;
    const curve = new THREE.CubicBezierCurve3(V(c * .05 * s, -.16 * s, sn * .05 * s), V(c * R * .55, -.34 * s, sn * R * .55), V(c * R, -.3 * s, sn * R), V(c * R, yA, sn * R));
    A(gl, new THREE.TubeGeometry(curve, 10, .012 * s, 6), Mx());
    A(gl, new THREE.CylinderGeometry(.045 * s, .03 * s, .03 * s, 12), Mx(c * R, yA + .015 * s, sn * R));
    A(cd, new THREE.CylinderGeometry(.016 * s, .016 * s, .13 * s, 10), Mx(c * R, yA + .095 * s, sn * R));
    const fp = V(c * R, yA + .185 * s, sn * R).applyMatrix4(M);
    A(fl, new THREE.SphereGeometry(.014 * s, 8, 6), Mx(c * R, yA + .185 * s, sn * R, 0, 0, 0, 1, 1.9, 1)); flames.push(fp);
  }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; A(gl, new THREE.SphereGeometry(.018 * s, 8, 6), Mx(Math.cos(a) * .32 * s, -.2 * s, Math.sin(a) * .32 * s)); }
}
function sconce(acc, M, flames) { // local: wall plane z = 0, arm out along +z
  const gl = bmat('gilt'), cd = bmat('candle'), fl = bmat('flame'), A = (mat, geo, m) => acc.add(mat, geo, M.clone().multiply(m));
  A(gl, new THREE.CylinderGeometry(.07, .07, .03, 16, 1, false, 0, Math.PI), Mx(0, 0, .03, Math.PI / 2, 0, Math.PI / 2, 1, 1, 2.2));
  A(gl, new THREE.TubeGeometry(new THREE.CubicBezierCurve3(V(0, -.05, .04), V(0, -.18, .2), V(0, -.02, .3), V(0, .02, .3)), 10, .013, 6), Mx());
  A(gl, new THREE.CylinderGeometry(.05, .03, .03, 12), Mx(0, .03, .3));
  A(cd, new THREE.CylinderGeometry(.017, .017, .15, 10), Mx(0, .12, .3));
  A(fl, new THREE.SphereGeometry(.015, 8, 6), Mx(0, .215, .3, 0, 0, 0, 1, 1.9, 1)); flames.push(V(0, .215, .3).applyMatrix4(M));
}
// Gilt cartouche shape (for crests and overdoors), centred at the origin, height ≈ 1.
export function cartoucheShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -.5); s.bezierCurveTo(.18, -.48, .26, -.38, .3, -.3); s.bezierCurveTo(.46, -.32, .5, -.12, .4, -.05); s.bezierCurveTo(.48, .08, .44, .26, .3, .3);
  s.bezierCurveTo(.26, .42, .12, .5, 0, .5); s.bezierCurveTo(-.12, .5, -.26, .42, -.3, .3); s.bezierCurveTo(-.44, .26, -.48, .08, -.4, -.05); s.bezierCurveTo(-.5, -.12, -.46, -.32, -.3, -.3); s.bezierCurveTo(-.26, -.38, -.18, -.48, 0, -.5);
  return s;
}


// ---------- books: instanced, one draw call for every volume in a room ----------
let _bookGeo;
function bookGeo() { // unit box: spine (+z), page edges (+y), covers (±x); no back or bottom (never seen)
  if (_bookGeo) return _bookGeo;
  const pos = [], nor = [], uv = [], cw = 1 / SPINE_VARIANTS;
  const quad = (v, n, t) => [0, 1, 2, 0, 2, 3].forEach(k => { pos.push(...v[k]); nor.push(...n); uv.push(...t[k]); });
  const h = .5;
  quad([[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], [0, 0, 1], [[.006, 0], [cw - .006, 0], [cw - .006, .962], [.006, .962]]);
  quad([[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]], [0, 1, 0], [[.01, .975], [cw - .01, .975], [cw - .01, .995], [.01, .995]]);
  quad([[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]], [1, 0, 0], [[cw - .004, .1], [cw - .002, .1], [cw - .002, .9], [cw - .004, .9]]);
  quad([[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]], [-1, 0, 0], [[.002, .1], [.004, .1], [.004, .9], [.002, .9]]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return (_bookGeo = g);
}
// Fill one shelf row with books standing on y, spines flush at zf, between xa and xb (all in the frame M).
// Books come in sets (same binding and height), with the odd folio, gap and leaning volume. Pushes {m, v, c} into out.
export function bookRow(out, M, xa, xb, y, hmax, zf, dmax, r) {
  let x = xa + .003, run = 0, v = 0, hh = 0, ww = 0, dd = 0;
  while (x < xb - .02) {
    if (run <= 0) { run = 3 + (r() * 11 | 0); v = r() * SPINE_VARIANTS | 0; hh = hmax * (.7 + r() * .28); ww = .026 + r() * .028; if (r() < .12) { ww *= 1.6; hh = Math.min(hmax, hh * 1.15); run = Math.min(run, 4); } dd = Math.min(dmax, .12 + hh * .3); }
    run--;
    const w = ww * (.92 + r() * .16), hgt = Math.min(hmax, hh * (.975 + r() * .04));
    if (r() < .03 && x > xa + .15 && x < xb - .25) { // a gap, and a volume leaning into it
      const a = .16 + r() * .14, adv = w * Math.cos(a) + hgt * Math.sin(a); if (x + adv + .01 > xb) break;
      out.push({ m: M.clone().multiply(Mx(x + w / 2 * Math.cos(a) + hgt / 2 * Math.sin(a) + .004, y - w / 2 * Math.sin(a) + hgt / 2 * Math.cos(a), zf - dd / 2, 0, 0, -a, w, hgt, dd)), v, c: .8 + r() * .25 });
      x += adv + .006; run = 0; continue;
    }
    if (x + w > xb) break;
    out.push({ m: M.clone().multiply(Mx(x + w / 2, y + hgt / 2, zf - dd / 2, 0, 0, 0, w, hgt, dd)), v, c: .8 + r() * .28 });
    x += w + .0012;
  }
}
export function bookMesh(items) {
  if (!items.length) return null;
  // very large halls (> 9k volumes): spine and top only, half the triangles (the covers only show at gaps)
  const n0 = items.length, geo = bookGeo().clone(), n = n0, im = new THREE.InstancedMesh(geo, bmat('spines'), n), va = new Float32Array(n), c = new THREE.Color();
  if (n0 > 9000) geo.setDrawRange(0, 12);   // (setDrawRange returns nothing: calling it in the expression above left geo undefined and the shell unbuilt)
  items.forEach((b, i) => { im.setMatrixAt(i, b.m); va[i] = b.v; im.setColorAt(i, c.setScalar(b.c)); });
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(va, 1));
  im.castShadow = false; im.receiveShadow = true; im.name = 'books'; im.userData.books = n; im.computeBoundingSphere(); return im;
}
// small seeded generator (stable book layouts per bookcase / wall)
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a band of carved ornament (egg-and-dart) as a plane whose texture repeats every `period` metres
export function bandPlane(w, h, period = .09) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / period); return g; }

// ---------- built-in wall bookcases (Admont white-and-gold · Metten walnut-and-gilt · Mafra pale rococo wood) ----------
export const CASE_FINISHES = {
  white: { car: 'cream', back: 'cream-back', trim: 'gilt', flute: 'fluted', plinth: 'cream', inset: null, niche: 'cream' },
  walnut: { car: 'walnut', back: 'walnut-dark', trim: 'gilt', flute: 'walnut', plinth: 'walnut-dark', inset: 'scag', niche: 'boiserie-walnut' },
  pale: { car: 'pale', back: 'pale-dark', trim: 'pale-dark', flute: 'pale', plinth: 'pale-dark', inset: null, niche: 'pale' } };
// One bookcase section in a wall-local frame M (wall plane z = 0, room toward +z): x0..x1, y0..y1 (cornice included), depth D.
function caseSection(A, books, M, F, x0, x1, y0, y1, D, r, { base = false, niche = null, cornice = true, pitch = .36, stile = .045 } = {}) {
  const car = bmat(F.car), back = bmat(F.back), trim = bmat(F.trim), plinth = bmat(F.plinth), W = x1 - x0, cx = (x0 + x1) / 2;
  const B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), M.clone().multiply(Mx(x, y, z)));
  const cH = cornice ? .16 : 0, top = y1 - cH, st = stile;
  let yb = y0;
  if (!niche && y0 < .05) { B(plinth, cx, .05, (D + .02) / 2, W, .1, D + .02); B(trim, cx, .102, D + .02, W, .012, .012); yb = .108; }
  if (!niche && base && top - yb > 1.9) { // closed cupboard for folios, two fielded doors per section, a ledge on top
    const yc = .8, ch = yc - yb; B(car, cx, yb + ch / 2, D / 2, W, ch, D);
    const nd = Math.max(1, Math.round(W / .5)), dw = (W - .02) / nd;
    for (let k = 0; k < nd; k++) { const dx = x0 + .01 + dw * (k + .5); B(car, dx, yb + ch / 2, D + .008, dw - .05, ch - .1, .016); B(back, dx, yb + ch / 2, D + .017, dw - .14, ch - .22, .006); [[0, ch / 2 - .11, dw - .13, .01], [0, -ch / 2 + .11, dw - .13, .01], [-(dw - .14) / 2, 0, .01, ch - .21], [(dw - .14) / 2, 0, .01, ch - .21]].forEach(([ox, oy, a, b]) => B(trim, dx + ox, yb + ch / 2 + oy, D + .02, a, b, .006)); B(trim, dx + (k % 2 ? -1 : 1) * (dw / 2 - .06), yb + ch / 2 + .05, D + .03, .014, .05, .014); }
    B(car, cx, yc + .0175, (D + .05) / 2, W + .01, .035, D + .05); B(trim, cx, yc + .0175, D + .052, W + .01, .012, .006); yb = yc + .035;
  }
  if (niche) { // an open niche for a hanging scroll: framed panelling behind it, a shelf bridge above it when there is room
    const nt = niche.top, nm = bmat(F.niche), yd = niche.dado || .9;
    // panelling 36 mm deep (before the dado ring's 26 mm and the pilasters' 32 mm gilt edges), its fielded panel 12 mm
    // prouder, the gilt frame 3 mm prouder again
    B(nm, cx, (yd + nt) / 2, .018, W, nt - yd, .036);
    B(back, cx, (yd + nt) / 2, .042, W - .16, nt - yd - .2, .012);
    [[0, nt - .1, W - .14, .014], [0, yd + .1, W - .14, .014], [-(W - .16) / 2, (yd + nt) / 2, .014, nt - yd - .2], [(W - .16) / 2, (yd + nt) / 2, .014, nt - yd - .2]].forEach(([ox, y, a, b]) => B(trim, cx + ox, y, .046, a, b, .01));
    [-1, 1].forEach(s => B(trim, cx + s * (W / 2 - .008), (y0 + nt) / 2, D - .004, .016, nt - y0, .016)); // gilt jamb beads
    if (top - nt < .3) { if (cornice) caseCornice(A, M, F, x0, x1, top, D, true); return; }
    B(car, cx, nt + .025, D / 2, W, .05, D); B(trim, cx, nt + .006, D + .002, W, .012, .008);
    yb = nt + .05;
  }
  // carcass: back, side stiles, shelves with gilt edges, the books
  // the back: 34 mm thick, so it covers the dado and skirting rings (26 mm proud of the wall), the pilaster bases (30 mm)
  // and their gilt edges (32 mm) with 2 mm or more to spare, and 2 mm short of the section's ends (never in a stile's plane)
  B(back, cx, (yb + top) / 2, .017, W - .004, top - yb, .034);
  [x0 + st / 2, x1 - st / 2].forEach(x => { B(car, x, (yb + top) / 2, D / 2, st, top - yb, D); B(trim, x, (yb + top) / 2, D + .002, .01, top - yb, .004); });
  const rows = Math.max(1, Math.round((top - yb) / pitch)), p = (top - yb) / rows;
  for (let k = 0; k < rows; k++) {
    const yy = yb + k * p; if (k > 0) { B(car, cx, yy, (D - .01) / 2, W - 2 * st, .022, D - .01); B(trim, cx, yy - .002, D - .008, W - 2 * st, .01, .005); }
    if (books) bookRow(books, M, x0 + st, x1 - st, yy + (k > 0 ? .011 : 0), p - .055, D - .03, D - .07, r);
  }
  if (cornice) caseCornice(A, M, F, x0, x1, top, D);
}
function caseCornice(A, M, F, x0, x1, top, D) {
  const car = bmat(F.car), trim = bmat(F.trim), W = x1 - x0, cx = (x0 + x1) / 2;
  const B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), M.clone().multiply(Mx(x, y, z)));
  B(car, cx, top + .035, (D + .02) / 2, W, .07, D + .02);
  A.add(F.trim === 'gilt' ? bmat('eggdart') : car, bandPlane(W, .046, .085), M.clone().multiply(Mx(cx, top + .035, D + .023)));   // 3 mm before the frieze
  B(trim, cx, top + .076, (D + .05) / 2, W, .012, D + .05);
  B(car, cx, top + .107, (D + .09) / 2, W, .05, D + .09);
  B(trim, cx, top + .14, (D + .1) / 2, W, .016, D + .1);
  B(car, cx, top + .154, (D + .07) / 2, W, .012, D + .07);
}
// A case pilaster at a pier: carved front (fluted ivory, or a scagliola panel framed in gilt), gilt base, capital, ressaut.
function casePier(A, M, F, s, pp, y0, top, D, palette) {
  const car = bmat(F.car), trim = bmat(F.trim), Dp = D + .035;
  const B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), M.clone().multiply(Mx(x, y, z)));
  B(bmat(F.plinth), s, .06, Dp / 2, pp + .04, .12, Dp + .02); B(trim, s, .125, Dp + .012, pp + .04, .014, .012);
  B(car, s, (top + .12) / 2, Dp / 2, pp, top - .12, Dp);
  const fy0 = .3, fy1 = top - .2;
  if (F.inset) { // fielded walnut pilaster: two sunk panels of dark scagliola (the dado's marble) in gilt frames, a gilt rosette between
    const im = bmat(palette === 'teal' ? 'scag-dark' : 'scag-red'), bw = pp * .62, ym = Math.min(.86, fy0 + (fy1 - fy0) * .3);
    [[fy0, ym - .05], [ym + .07, fy1]].forEach(([a, b]) => { if (b - a < .12) return; const c = (a + b) / 2, hh = b - a;
      B(trim, s, c, Dp + .003, bw + .03, hh + .03, .006); B(bmat(F.back), s, c, Dp + .007, bw, hh, .004); B(im, s, c, Dp + .009, bw - .05, hh - .05, .004); });
    A.add(trim, new THREE.SphereGeometry(pp * .09, 12, 8), M.clone().multiply(Mx(s, ym + .01, Dp + .006, 0, 0, 0, 1, 1, .45)));
    [-1, 1].forEach(k => A.add(trim, new THREE.SphereGeometry(pp * .05, 8, 6), M.clone().multiply(Mx(s + k * pp * .12, ym + .01, Dp + .004, 0, 0, 0, 1, .7, .4)))); }
  else { const fl = A.add(bmat(F.flute), new THREE.BoxGeometry(pp * .72, fy1 - fy0, .012), M.clone().multiply(Mx(s, (fy0 + fy1) / 2, Dp + .006))); B(trim, s, fy0 - .01, Dp + .008, pp * .78, .02, .016); B(trim, s, fy1 + .01, Dp + .008, pp * .78, .02, .016); }
  // capital: abacus, a gilt bell with leaves and two volutes, then the cornice ressaut
  B(trim, s, top - .1, Dp + .01, pp + .02, .03, .03);
  for (let k = -1; k <= 1; k++) A.add(trim, new THREE.SphereGeometry(pp * .12, 8, 6), M.clone().multiply(Mx(s + k * pp * .28, top - .05, Dp + .015, -.3, 0, 0, .8, 1.5, .5)));
  [-1, 1].forEach(sd => A.add(trim, new THREE.TorusGeometry(pp * .09, pp * .03, 5, 10), M.clone().multiply(Mx(s + sd * pp * .4, top - .03, Dp + .012))));
  B(car, s, top + .07, (Dp + .03) / 2, pp + .06, .14, Dp + .03); B(trim, s, top + .14, (Dp + .11) / 2, pp + .08, .018, Dp + .11); B(car, s, top + .107, (Dp + .1) / 2, pp + .07, .05, Dp + .1);
}
// Intervals (wall-local x) a footprint blocks along the case zone of wall frame Minv. f: {x, z, r} or {x, z, w, d, rot}
function blockOf(f, Minv, D) {
  if (f.r != null) { const q = V(f.x, 0, f.z).applyMatrix4(Minv); if (q.z - f.r > D + .03) return null; return [q.x - f.r - .06, q.x + f.r + .06]; }
  const c = Math.cos(f.rot || 0), sn = Math.sin(f.rot || 0); let x0 = Infinity, x1 = -Infinity, z0 = Infinity;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const lx = a * f.w / 2, lz = b * f.d / 2, q = V(f.x + lx * c + lz * sn, 0, f.z - lx * sn + lz * c).applyMatrix4(Minv); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); });
  return z0 > D + .02 ? null : [x0, x1];
}
const overlaps = (a, b, c, d) => a < d && c < b;
function subtract(spans, blocks) {
  let out = spans;
  blocks.forEach(([b0, b1]) => { const nx = []; out.forEach(([a0, a1]) => { if (b1 <= a0 || b0 >= a1) nx.push([a0, a1]); else { if (b0 - a0 > .02) nx.push([a0, b0]); if (a1 - b1 > .02) nx.push([b1, a1]); } }); out = nx; });
  return out;
}
// Builds every wall bookcase of a baroque shell (ctx from makeBaroqueShell). skip: footprints whose sections are left out
// (the user's own bookcases standing at the wall); niches: [{x, z}] wall positions that need an open niche (hanging scrolls).
function buildWallCases(ctx, { skip = [], niches = [], fast = false } = {}) {
  const grp = new THREE.Group(); grp.name = 'wall-cases'; const A = new Acc(), books = [], F = CASE_FINISHES[ctx.cases] || CASE_FINISHES.white;
  const { walls, WM, D, yLow, yWin, yg, yE, gWalls, windowWall, door, doorW, palette, fixedBlocks, pp, dadoH } = ctx;
  walls.forEach((W, wi) => {
    const M = WM(W), Minv = M.clone().invert(), L = W.len, r = rng(977 + wi * 131), isWin = W.name === windowWall;
    const endIn = W.name === 'back' || W.name === 'front' ? D + .005 : 0;
    const blocks = fixedBlocks.map(f => blockOf(f, Minv, D)).filter(Boolean);
    if (door && W.name === 'front') blocks.push([-doorW / 2 - .34, doorW / 2 + .34]);
    const userBlocks = skip.map(f => blockOf(f, Minv, D)).filter(Boolean);
    const nich = niches.map(p => V(p.x, 0, p.z).applyMatrix4(Minv)).filter(q => Math.abs(q.z) < .6 && Math.abs(q.x) < L / 2).map(q => q.x);
    const top = isWin ? yWin : (yg != null && gWalls.has(W.name) ? ctx.yGal : yLow), base = !isWin;
    // piers become case pilasters; spans between them are split into ~1 m sections (or a scroll niche)
    const piers = W.piers.slice(1, -1).filter(s => s > -L / 2 + endIn + pp && s < L / 2 - endIn - pp && !blocks.some(([a, b]) => overlaps(s - pp / 2, s + pp / 2, a, b)));
    const cuts = [-L / 2 + endIn, ...piers.flatMap(s => [s - pp / 2, s + pp / 2]), L / 2 - endIn];
    let spans = []; for (let k = 0; k < cuts.length; k += 2) if (cuts[k + 1] - cuts[k] > .2) spans.push([cuts[k], cuts[k + 1]]);
    spans = subtract(spans, blocks);
    const secs = [];
    spans.forEach(([a, b]) => {
      const pieces = []; let lo = a;
      nich.filter(c => c > a && c < b).sort((u, v) => u - v).forEach(c => { const n0 = Math.max(lo, c - .86), n1 = Math.min(b, c + .86); if (n0 - lo > .02) pieces.push([lo, n0, false]); pieces.push([n0, n1, true]); lo = n1; });
      if (b - lo > .02) pieces.push([lo, b, false]);
      pieces.forEach(([p0, p1, isN]) => {
        if (isN) { secs.push({ x0: p0, x1: p1, niche: true }); return; }
        if (p1 - p0 < .22) return; const n = Math.max(1, Math.round((p1 - p0) / 1.0));
        for (let k = 0; k < n; k++) secs.push({ x0: p0 + (p1 - p0) * k / n, x1: p0 + (p1 - p0) * (k + 1) / n });
      });
    });
    const kept = secs.filter(sc => !userBlocks.some(([a, b]) => overlaps(sc.x0, sc.x1, a, b)));
    // stiles at least wide enough to reach 6 mm past the side of the shell's pilaster behind a pier (the section ends at the
    // narrower case pier): the pilaster's side then lies inside the stile instead of in the stile's inner face
    const stile = Math.max(.045, (ctx.pw - pp) / 2 + .006);
    kept.forEach(sc => caseSection(A, fast ? null : books, M, F, sc.x0, sc.x1, 0, top, D, r, { base, stile, niche: sc.niche ? { top: ctx.nicheTop, dado: dadoH } : null }));
    if (!fast) piers.forEach(s => { if (kept.some(sc => Math.abs(sc.x1 - (s - pp / 2)) < .01 || Math.abs(sc.x0 - (s + pp / 2)) < .01) && !userBlocks.some(([a, b]) => overlaps(s - pp / 2, s + pp / 2, a, b))) casePier(A, M, F, s, pp, 0, top - .16, D, palette); });
    if (piers.length) ctx.pierFronts[W.name] = piers;
    // the gallery tier: shelves between the shell's pilasters, shallower, no cupboards
    if (yg != null && gWalls.has(W.name)) {
      const n = W.piers.length - 1, tP = gWalls.has(NEXT[W.name]) ? ctx.gd : 0, tM = gWalls.has(PREV[W.name]) ? ctx.gd : 0;
      for (let i = 0; i < n; i++) {
        let a = W.pil[i] + ctx.pw / 2 + .015, b = W.pil[i + 1] - ctx.pw / 2 - .015; if (i === 0 && tM) a = Math.max(a, -L / 2 + .32); if (i === n - 1 && tP) b = Math.min(b, L / 2 - .32); if (b - a < .3) continue;
        const k = Math.max(1, Math.round((b - a) / 1.05));
        for (let j = 0; j < k; j++) caseSection(A, fast ? null : books, M, F, a + (b - a) * j / k, a + (b - a) * (j + 1) / k, yg + .02, yE - .04, .3, r, { pitch: .4 });
      }
    }
  });
  A.build(grp, { name: 'case-' }).forEach(m => { const k = m.material.userData.bmat; if (k === 'gilt' || k === 'eggdart' || k === 'pale-dark' || k.startsWith('scag')) m.castShadow = false; });
  const bm = bookMesh(books); if (bm) grp.add(bm);
  grp.traverse(o => { if (o.isMesh) o.userData.shell = true; });
  grp.userData.books = books.length;
  return grp;
}

// ======================================================================================================
// The baroque room shell
// ======================================================================================================
const NEXT = { back: 'right', front: 'left', left: 'back', right: 'front' }, PREV = { back: 'left', front: 'right', left: 'front', right: 'back' };
function oddCount(len, bay) { const x = len / bay; let n = Math.max(1, Math.round(x)); if (n % 2 === 0) n = Math.abs(len / (n - 1) - bay) < Math.abs(len / (n + 1) - bay) && n > 1 ? n - 1 : n + 1; return n; }

export function makeBaroqueShell({ w = 14, d = 12, h = 6, windowWall = 'back', door = true, palette = 'rose', floor = 'diagonal', gallery = 'auto', atlantes = 'auto', doorColumns = true, bay = 3.2, avoid = null, chandeliers = true, frescoSeed = 1, cases = false, caseSkip = [], niches = [], fast = false } = {}) {
  const g = new THREE.Group(); g.name = 'room-shell';
  const A = new Acc(), FX = new Acc(), flames = [];
  const scag = bmat('scag-' + palette), gilt = bmat('gilt'), stucco = bmat('stucco'), wallM = bmat('wall'), dadoM = bmat(palette === 'teal' ? 'scag-dark' : 'scag-red');
  // ---- vertical scheme ----
  const C = clamp(h * .17, .6, 1.6), ys = h - C, E = clamp(ys * .085, .3, .62), yE = ys - E, ci = C * .95;
  const yg = 3.65, gd = .8;
  const galleryOn = gallery === true || (gallery === 'auto' && yE - yg >= 1.55);
  const dadoH = Math.min(.92, yE * .2), pw = clamp(yE * .085, .36, .6), pd = .028, capH = pw * 1.1, baseH = Math.min(.32, pw * .55);
  const walls = [
    { name: 'back', p: [0, h / 2, -d / 2], r: 0, len: w },
    { name: 'front', p: [0, h / 2, d / 2], r: Math.PI, len: w },
    { name: 'left', p: [-w / 2, h / 2, 0], r: Math.PI / 2, len: d },
    { name: 'right', p: [w / 2, h / 2, 0], r: -Math.PI / 2, len: d }];
  g.userData.walls = walls;
  const WM = W => new THREE.Matrix4().makeRotationY(W.r).setPosition(W.p[0], 0, W.p[2]);
  const gWalls = new Set(galleryOn ? walls.filter(W => W.name !== windowWall).map(W => W.name) : []);
  const useAtl = atlantes === true || (atlantes === 'auto' && windowWall !== 'none' && !avoid);
  const CD = cases ? .42 : 0; // depth of the built-in wall bookcases
  const info = { ys, yE, E, C, yg: galleryOn ? yg : null, gallery: galleryOn, piers: {}, obstacles: [], windows: [], caseDepth: CD };
  // ---- bay rhythm per wall ----
  walls.forEach(W => {
    const L = W.len, inv = WM(W).invert(); let piers;
    const pts = (avoid || []).map(p => V(p.x, 0, p.z).applyMatrix4(inv)).filter(q => Math.abs(q.z) < .6 && Math.abs(q.x) < L / 2).map(q => q.x).sort((a, b) => a - b);
    if (pts.length) { piers = [-L / 2]; for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > 1.3) piers.push((pts[i] + pts[i + 1]) / 2); piers.push(L / 2); }
    else { const n = oddCount(L, bay); piers = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * L / n); }
    W.piers = piers; info.piers[W.name] = piers;
    // pilaster centres (corner ones folded in)
    W.pil = piers.map((s, i) => i === 0 ? s + pw / 2 + .012 : i === piers.length - 1 ? s - pw / 2 - .012 : s);
  });
  const doorW = 1.76, doorH = Math.min(clamp(yE * .68, 2.1, 3.1), yE - .4, galleryOn ? yg - .6 : 99);
  // ---- walls (with arched window openings) ----
  walls.forEach(W => {
    const M = WM(W), L = W.len, isWin = W.name === windowWall, isDoor = door && W.name === 'front';
    const shape = new THREE.Shape(); shape.moveTo(-L / 2, 0); shape.lineTo(L / 2, 0); shape.lineTo(L / 2, ys + .02); shape.lineTo(-L / 2, ys + .02); shape.lineTo(-L / 2, 0);
    const wins = [];
    if (isWin) {
      for (let i = 0; i < W.piers.length - 1; i++) {
        const a = W.pil[i] + pw / 2, b = W.pil[i + 1] - pw / 2, bw = b - a, c = (a + b) / 2; if (bw < 1.1) continue;
        const sill = clamp(yE - 3.2, 1.2, 2.1), yT = yE - .26; let ww = clamp(bw * .56, .8, 1.9); if (yT - sill < ww * 1.55) ww = (yT - sill) / 1.55; if (ww < .5) continue;
        const rr = ww / 2, spring = yT - rr; wins.push({ c, sill, spring, rr, ww, i });
        const hole = new THREE.Path(); hole.moveTo(c - rr, sill); hole.lineTo(c + rr, sill); hole.lineTo(c + rr, spring); hole.absarc(c, spring, rr, 0, Math.PI, false); hole.lineTo(c - rr, sill); shape.holes.push(hole);
      }
    }
    A.add(wallM, new THREE.ShapeGeometry(shape, 24), M);
    W.wins = wins;
    // windows: reveal, surround, keystone, glazing bars, sky beyond
    wins.forEach(o => {
      const { c, sill, spring, rr } = o, arch = (e, P = new THREE.Shape()) => { P.moveTo(c - rr - e, sill - e); P.lineTo(c + rr + e, sill - e); P.lineTo(c + rr + e, spring); P.absarc(c, spring, rr + e, 0, Math.PI, false); P.lineTo(c - rr - e, sill - e); return P; };
      const rv = arch(.004); rv.holes.push(arch(0, new THREE.Path())); A.add(stucco, new THREE.ExtrudeGeometry(rv, { depth: .55, bevelEnabled: false, curveSegments: 24 }), M.clone().multiply(Mx(0, 0, -.55)));
      const sr = arch(.2); sr.holes.push(arch(.035, new THREE.Path())); A.add(stucco, new THREE.ExtrudeGeometry(sr, { depth: .06, bevelEnabled: false, curveSegments: 24 }), M);
      const gb = arch(.05); gb.holes.push(arch(0, new THREE.Path())); A.add(gilt, new THREE.ExtrudeGeometry(gb, { depth: .075, bevelEnabled: false, curveSegments: 24 }), M);
      A.add(stucco, new THREE.BoxGeometry(rr * 2 + .5, .07, .16), M.clone().multiply(Mx(c, sill - .07, .05)));
      A.add(gilt, new THREE.BoxGeometry(.2, .32, .1), M.clone().multiply(Mx(c, spring + rr + .1, .05)));
      A.add(stucco, new THREE.BoxGeometry(.28, .06, .13), M.clone().multiply(Mx(c, spring + rr + .27, .05)));
      const pt = bmat('paint'), bz = -.3, top = spring + rr;
      A.add(pt, new THREE.BoxGeometry(.045, top - sill, .05), M.clone().multiply(Mx(c, (top + sill) / 2, bz)));
      for (let y = sill + .55; y < spring - .1; y += .55) A.add(pt, new THREE.BoxGeometry(rr * 2, .035, .04), M.clone().multiply(Mx(c, y, bz)));
      A.add(pt, new THREE.BoxGeometry(rr * 2, .05, .05), M.clone().multiply(Mx(c, spring, bz)));
      A.add(pt, new THREE.TorusGeometry(rr * .5, .02, 6, 20, Math.PI), M.clone().multiply(Mx(c, spring, bz)));
      [.25, .75].forEach(f => { const a = f * Math.PI; A.add(pt, new THREE.BoxGeometry(.03, rr, .035), M.clone().multiply(Mx(c + Math.cos(a) * rr * .5, spring + Math.sin(a) * rr * .5, bz, 0, 0, a - Math.PI / 2).multiply(Mx(0, rr * .25, 0)))); });
      const skyG = new THREE.PlaneGeometry(rr * 2 + .5, top - sill + .5); FX.add(bmat('sky'), skyG, M.clone().multiply(Mx(c, (top + sill) / 2, -.6)));
      info.windows.push({ wall: W.name, c, sill, top, ww: rr * 2 });
    });
    if (wins.length) { const mid = wins[(wins.length - 1) >> 1]; g.userData.window = { wall: W, ww: mid.ww, wh: mid.spring + mid.rr - mid.sill, wy: (mid.spring + mid.rr + mid.sill) / 2 - h / 2, list: wins }; }
    // ---- pilasters: flat in the bookcase zone (≤ 3 cm, the gap the hub leaves behind a bookcase), gilt capitals above ----
    const skipDoor = s => isDoor && Math.abs(s) < doorW / 2 + .3 + pw / 2;
    W.pil.forEach((s, i) => {
      if (skipDoor(s)) return;
      const P = (geo, mat, x, y, z, m2) => A.add(mat, geo, M.clone().multiply(Mx(s + x, y, z)).multiply(m2 || new THREE.Matrix4()));
      P(new THREE.BoxGeometry(pw + .06, baseH * .55, pd + .001), dadoM, 0, baseH * .275, (pd + .001) / 2);
      P(new THREE.BoxGeometry(pw + .035, baseH * .2, pd + .002), gilt, 0, baseH * .65, (pd + .002) / 2);
      P(new THREE.BoxGeometry(pw + .02, baseH * .25, pd), stucco, 0, baseH * .875, pd / 2);
      const sh = yE - capH - baseH; P(new THREE.BoxGeometry(pw, sh, pd), scag, 0, baseH + sh / 2, pd / 2);
      [-1, 1].forEach(sd => P(new THREE.BoxGeometry(.024, sh, pd + .004), gilt, sd * (pw / 2 - .01), baseH + sh / 2, (pd + .004) / 2));   // gilt edges 2 mm beyond the shaft's sides
      // capital (above any bookcase: it may project)
      const y0 = yE - capH;
      P(new THREE.BoxGeometry(pw + .03, .035, .06), gilt, 0, y0 + .018, .03);
      P(new THREE.CylinderGeometry(pw * .62 * Math.SQRT2 / 2 * 1.2, pw * .5 * Math.SQRT2 / 2 * 1.2, capH * .62, 4, 1), gilt, 0, y0 + .035 + capH * .31, .0, Mx(0, 0, 0, 0, Math.PI / 4, 0, 1, 1, .34));
      for (let k = -1; k <= 1; k++) { P(new THREE.SphereGeometry(pw * .13, 8, 6), gilt, k * pw * .3, y0 + capH * .3, .07, Mx(0, 0, 0, -.3, 0, 0, .8, 1.5, .55)); P(new THREE.SphereGeometry(pw * .11, 8, 6), gilt, k * pw * .3 + pw * .15, y0 + capH * .55, .085, Mx(0, 0, 0, -.3, 0, 0, .8, 1.4, .55)); }
      [-1, 1].forEach(sd => { P(new THREE.TorusGeometry(pw * .1, pw * .035, 5, 12), gilt, sd * pw * .45, y0 + capH * .74, .1); P(new THREE.CylinderGeometry(pw * .06, pw * .06, .04, 10), gilt, sd * pw * .45, y0 + capH * .74, .1, Mx(0, 0, 0, Math.PI / 2)); });
      P(new THREE.BoxGeometry(pw * 1.32, capH * .16, .2), gilt, 0, yE - capH * .08, .1);
      // entablature ressaut over the pilaster (skipped at folded corners)
      if (i > 0 && i < W.pil.length - 1) {
        P(new THREE.BoxGeometry(pw + .06, E * .34 - .004, .17), stucco, 0, yE + E * .17, .085);
        P(new THREE.BoxGeometry(pw - .02, E * .28 - .004, .13), scag, 0, yE + E * .48, .065);
        P(new THREE.BoxGeometry(pw + .2, E * .26 - .004, .4), stucco, 0, yE + E * .75, .2);
        P(new THREE.BoxGeometry(pw + .24, E * .06 - .004, .43), gilt, 0, yE + E * .91, .215);
      }
    });
  });
  // ---- entablature, dado and skirting as mitred rings round the room ----
  const ring = (y0, y1, p, mat, uvFn) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2 - .01, -d / 2 - .01); s.lineTo(w / 2 + .01, -d / 2 - .01); s.lineTo(w / 2 + .01, d / 2 + .01); s.lineTo(-w / 2 - .01, d / 2 + .01); s.lineTo(-w / 2 - .01, -d / 2 - .01);
    const hl = new THREE.Path(); hl.moveTo(-w / 2 + p, -d / 2 + p); hl.lineTo(-w / 2 + p, d / 2 - p); hl.lineTo(w / 2 - p, d / 2 - p); hl.lineTo(w / 2 - p, -d / 2 + p); hl.lineTo(-w / 2 + p, -d / 2 + p); s.holes.push(hl);
    const geo = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, y0, 0);
    const gg = A.add(mat, geo); if (uvFn) uvFn(gg, y0, y1);
  };
  const bandUV = (k) => (geo, y0, y1) => { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * k, (p.getY(i) - y0) / (y1 - y0)); };
  ring(0, .13, .026, dadoM); ring(.13, dadoH, .019, dadoM); ring(dadoH, dadoH + .045, .026, gilt);
  ring(yE, yE + E * .16, .075, stucco); ring(yE + E * .16, yE + E * .3, .095, stucco); ring(yE + E * .3, yE + E * .34, .11, gilt);
  ring(yE + E * .34, yE + E * .62, .065, stucco); ring(yE + E * .62, yE + E * .7, .13, bmat('eggdart'), bandUV(1 / (E * .08 * 8)));
  ring(yE + E * .7, yE + E * .88, .3, stucco); ring(yE + E * .88, yE + E * .94, .33, gilt); ring(yE + E * .94, ys, .3, stucco);
  // ---- coved vault: mitred strips with rocaille (one cartouche per bay) and gilt ribs over each pilaster ----
  const K = 14, prof = t => ({ z: ci * (1 - Math.cos(t * Math.PI / 2)), y: ys + C * Math.sin(t * Math.PI / 2), nz: C * Math.cos(t * Math.PI / 2), ny: -ci * Math.sin(t * Math.PI / 2) });
  walls.forEach(W => {
    const L = W.len, M = WM(W), pos = [], nor = [], uv = [], n = W.piers.length - 1, pitch = L / Math.max(1, n);
    const ustart = W.piers[0];
    const vert = (s, t) => { const q = prof(t), l = Math.hypot(q.nz, q.ny); return { p: [s, q.y, q.z], n: [0, q.ny / l, q.nz / l] }; };
    for (let k = 0; k < K; k++) {
      const t0 = k / K, t1 = (k + 1) / K, i0 = prof(t0).z, i1 = prof(t1).z;
      const a = vert(-L / 2 + i0, t0), b = vert(L / 2 - i0, t0), c2 = vert(L / 2 - i1, t1), d2 = vert(-L / 2 + i1, t1);
      const U = s => { // map s to bay-relative u so each bay holds one cartouche
        let j = 0; while (j < n - 1 && s > W.piers[j + 1]) j++; return j + (s - W.piers[j]) / (W.piers[j + 1] - W.piers[j]); };
      // split the quad at every pier so u is piecewise linear per bay
      const cuts = [a.p[0], ...W.piers.filter(s => s > a.p[0] && s < b.p[0]), b.p[0]];
      for (let j = 0; j < cuts.length - 1; j++) {
        const sA = cuts[j], sB = cuts[j + 1];
        const lerpS = (s, lo, hi, l2, h2) => l2 + (h2 - l2) * (s - lo) / (hi - lo);
        const sA1 = lerpS(sA, a.p[0], b.p[0], d2.p[0], c2.p[0]), sB1 = lerpS(sB, a.p[0], b.p[0], d2.p[0], c2.p[0]);
        const uA = U(sA + 1e-6), uB = U(sB - 1e-6), uA1 = U(sA1 + 1e-6), uB1 = U(sB1 - 1e-6);
        const P0 = [sA, a.p[1], a.p[2]], P1 = [sB, a.p[1], a.p[2]], P2 = [sB1, c2.p[1], c2.p[2]], P3 = [sA1, c2.p[1], c2.p[2]];
        [[P0, a.n, uA, t0], [P1, a.n, uB, t0], [P2, c2.n, uB1, t1], [P0, a.n, uA, t0], [P2, c2.n, uB1, t1], [P3, c2.n, uA1, t1]].forEach(([p, nn, u, v]) => { pos.push(...p); nor.push(...nn); uv.push(u, v); });
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    A.add(bmat('cove'), geo, M);
    // gilt ribs continuing the interior pilasters
    W.piers.slice(1, -1).forEach(s => {
      const rp = [], rn = []; const hw = .07, off = .022;
      for (let k = 0; k < K; k++) {
        const q0 = prof(k / K), q1 = prof((k + 1) / K), l0 = Math.hypot(q0.nz, q0.ny), l1 = Math.hypot(q1.nz, q1.ny);
        const o0 = [q0.y + q0.ny / l0 * off, q0.z + q0.nz / l0 * off], o1 = [q1.y + q1.ny / l1 * off, q1.z + q1.nz / l1 * off];
        const n0 = [0, q0.ny / l0, q0.nz / l0], n1 = [0, q1.ny / l1, q1.nz / l1];
        [[[-hw, ...o0], n0], [[hw, ...o0], n0], [[hw, ...o1], n1], [[-hw, ...o0], n0], [[hw, ...o1], n1], [[-hw, ...o1], n1]].forEach(([p, nn]) => { rp.push(s + p[0], p[1], p[2]); rn.push(...nn); });
        [-hw, hw].forEach(x => { const sx = Math.sign(x); [[x, q0.y, q0.z], [x, o0[0], o0[1]], [x, o1[0], o1[1]], [x, q0.y, q0.z], [x, o1[0], o1[1]], [x, q1.y, q1.z]].forEach(p => { rp.push(s + p[0], p[1], p[2]); rn.push(sx, 0, 0); }); });
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
      A.add(gilt, rg, M);
    });
  });
  // ---- flat ceiling with shallow painted domes (one per bay group, like Admont's) ----
  const Lx = w - 2 * ci, Lz = d - 2 * ci, alongX = Lx >= Lz, Ll = alongX ? Lx : Lz, Ls = alongX ? Lz : Lx;
  const nd = Math.max(1, Math.round(Ll / Ls)), cell = Ll / nd, domes = [];
  for (let i = 0; i < nd; i++) {
    const cc = -Ll / 2 + (i + .5) * cell; let a = cell * .4, b = Ls * .4; if (a / b > 1.3) a = b * 1.3; if (b / a > 1.3) b = a * 1.3;
    domes.push(alongX ? { x: cc, z: 0, a, b } : { x: 0, z: cc, a: b, b: a });
  }
  {
    const s = new THREE.Shape(); s.moveTo(-Lx / 2, -Lz / 2); s.lineTo(Lx / 2, -Lz / 2); s.lineTo(Lx / 2, Lz / 2); s.lineTo(-Lx / 2, Lz / 2); s.lineTo(-Lx / 2, -Lz / 2);
    domes.forEach(D => { const p = new THREE.Path(); p.absellipse(D.x, D.z, D.a, D.b, 0, Math.PI * 2, true); s.holes.push(p); });
    const geo = new THREE.ShapeGeometry(s, 48); geo.rotateX(Math.PI / 2); geo.translate(0, h, 0); A.add(stucco, geo);
  }
  domes.forEach((D, i) => {
    const rise = clamp(Math.min(D.a, D.b) * .36, .25, 1.5), R = 16, S = 64, pos = [], uv = [], idx = [];
    for (let k = 0; k <= R; k++) for (let j = 0; j <= S; j++) { const r = k / R, th = j / S * Math.PI * 2; pos.push(D.x + D.a * r * Math.cos(th), h + rise * (1 - r * r) - .002, D.z + D.b * r * Math.sin(th)); uv.push(.5 + .5 * r * Math.cos(th), .5 + .5 * r * Math.sin(th)); }
    for (let k = 0; k < R; k++) for (let j = 0; j < S; j++) { const a = k * (S + 1) + j, b = a + S + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) > 0) { for (let q = 0; q < idx.length; q += 3) { const t = idx[q]; idx[q] = idx[q + 1]; idx[q + 1] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
    A.add(bmat('fresco' + (((frescoSeed + i) % 3) + 1)), geo);
    // gilt rim + stucco frame + gilt panel frame round the cell
    const rimG = new THREE.TorusGeometry(1, .045, 8, 72); rimG.rotateX(Math.PI / 2);
    A.add(gilt, rimG, Mx(D.x, h - .01, D.z, 0, 0, 0, D.a, 1, D.b));
    const fr = new THREE.Shape(); fr.absellipse(0, 0, D.a + .32, D.b + .32, 0, Math.PI * 2, false); const fh = new THREE.Path(); fh.absellipse(0, 0, D.a + .03, D.b + .03, 0, Math.PI * 2, true); fr.holes.push(fh);
    const frg = new THREE.ExtrudeGeometry(fr, { depth: .05, bevelEnabled: false, curveSegments: 64 }); frg.rotateX(Math.PI / 2); A.add(stucco, frg, Mx(D.x, h, D.z));
    const rim2 = new THREE.TorusGeometry(1, .025, 6, 72); rim2.rotateX(Math.PI / 2); A.add(gilt, rim2, Mx(D.x, h - .05, D.z, 0, 0, 0, D.a + .32, 1, D.b + .32));
    const cw = alongX ? cell : Lx, cd = alongX ? Lz : cell, inset = .25;
    [[0, -cd / 2 + inset, cw - 2 * inset, .05], [0, cd / 2 - inset, cw - 2 * inset, .05], [-cw / 2 + inset, 0, .05, cd - 2 * inset], [cw / 2 - inset, 0, .05, cd - 2 * inset]].forEach(([x, z, a, b]) => A.add(gilt, new THREE.BoxGeometry(a, .03, b), Mx(D.x + x, h - .015, D.z + z)));
    D.rise = rise;
  });
  // ceiling-edge gilt moulding where the cove meets the flat ceiling
  { const s = new THREE.Shape(); s.moveTo(-Lx / 2 - .02, -Lz / 2 - .02); s.lineTo(Lx / 2 + .02, -Lz / 2 - .02); s.lineTo(Lx / 2 + .02, Lz / 2 + .02); s.lineTo(-Lx / 2 - .02, Lz / 2 + .02); s.lineTo(-Lx / 2 - .02, -Lz / 2 - .02); const hl = new THREE.Path(); const q = .12; hl.moveTo(-Lx / 2 + q, -Lz / 2 + q); hl.lineTo(-Lx / 2 + q, Lz / 2 - q); hl.lineTo(Lx / 2 - q, Lz / 2 - q); hl.lineTo(Lx / 2 - q, -Lz / 2 + q); hl.lineTo(-Lx / 2 + q, -Lz / 2 + q); s.holes.push(hl); const geo = new THREE.ExtrudeGeometry(s, { depth: .06, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, h, 0); A.add(gilt, geo); }
  // ---- floor: polished checkered marble ----
  {
    // the hall's diagonal floor: cream and dove-grey marble (close values: the floor is a ground, not a checkerboard)
    const F = marbleFloor(floor, clamp(Math.min(w, d) / 16, .5, .8), floor === 'cubes' ? ['cream', 'warmgrey', 'red'] : ['cream', 'dove']);
    // polished marble: the polish IS the surface (no clearcoat: a coat on top doubles the reflection and reads as
    // lacquer); 0.055–0.1 on the tiles, duller along the walking paths (traffic), 0.9 in the joints; each tile tilted a
    // fraction of a degree (lippage) so a mirrored window kinks between tiles; contact occlusion from walls/furniture
    const fm = surface(new THREE.MeshPhysicalMaterial({ map: F.map, roughnessMap: F.rough, normalMap: F.nrm, normalScale: new THREE.Vector2(.3, .3), roughness: 1, specularIntensity: 1, envMapIntensity: 1 }), { floorAO: true, traffic: true, macro: [.35, .05, .3] });
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / F.span[0] + .5, -p.getZ(i) / F.span[1] + .5);
    const floorM = new THREE.Mesh(geo, fm); floorM.receiveShadow = true; floorM.name = 'floor'; floorM.userData.floor = true; g.add(floorM);
  }
  // ---- door: double door, gilt-beaded frame, hood and cartouche ----
  if (door) {
    const W = walls[1], M = WM(W), D = (mat, geo, x, y, z) => A.add(mat, geo, M.clone().multiply(Mx(x, y, z)));
    const wn = bmat('walnut'), wd = bmat('walnut-dark'), gf = bmat('gilt-fine'), lw = doorW / 2 - .01;
    [-1, 1].forEach(sd => {
      const cx = sd * doorW / 4; D(wn, new THREE.BoxGeometry(lw, doorH, .07), cx, doorH / 2, .035);
      // fielded panels: the sunk walnut panel (front 30 mm before the leaf), its gilt frame 4 mm prouder; the frame's
      // rails stop at the stiles (no two boxes overlap, so no faces share a plane)
      [[.2, .26], [.56, .3], [.84, .12]].forEach(([fy, fh]) => { const ph = doorH * fh, py = doorH * fy, fw = lw - .12; D(wd, new THREE.BoxGeometry(lw - .16, ph, .03), cx, py, .085); [-1, 1].forEach(q => { D(gf, new THREE.BoxGeometry(fw - .018, .018, .034), cx, py + q * (ph / 2 + .01), .087); D(gf, new THREE.BoxGeometry(.018, ph + .038, .034), cx + q * fw / 2, py, .087); }); });
      D(gilt, new THREE.SphereGeometry(.035, 12, 10), sd * .1, doorH * .48, .11); D(gilt, new THREE.BoxGeometry(.05, .16, .02), sd * .1, doorH * .48, .075);
    });
    D(stucco, new THREE.BoxGeometry(.22, doorH + .22, .12), -doorW / 2 - .11, (doorH + .22) / 2, .06); D(stucco, new THREE.BoxGeometry(.22, doorH + .22, .12), doorW / 2 + .11, (doorH + .22) / 2, .06);
    D(stucco, new THREE.BoxGeometry(doorW + .44, .22, .12), 0, doorH + .11, .06);
    // the gilt bead round the opening stands 4 mm into it (its inner faces never share the stucco jambs' plane)
    D(gf, new THREE.BoxGeometry(.034, doorH + .02, .13), -doorW / 2 - .013, doorH / 2, .065); D(gf, new THREE.BoxGeometry(.034, doorH + .02, .13), doorW / 2 + .013, doorH / 2, .065); D(gf, new THREE.BoxGeometry(doorW + .06, .034, .13), 0, doorH + .013, .065);
    D(stucco, new THREE.BoxGeometry(doorW + .7, .14, .3), 0, doorH + .29, .15); D(gilt, new THREE.BoxGeometry(doorW + .74, .04, .32), 0, doorH + .38, .16);
    const cs = Math.min(.7, (gWalls.has('front') ? yg - .2 : yE) - doorH - .5); if (cs > .25) { const cg = new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .05, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2, curveSegments: 10 }); A.add(gilt, cg, M.clone().multiply(Mx(0, doorH + .42 + cs / 2, .05, 0, 0, 0, cs * .9, cs, 1))); A.add(bmat('scag-' + palette), new THREE.CircleGeometry(.24, 32), M.clone().multiply(Mx(0, doorH + .42 + cs / 2, .125, 0, 0, 0, cs * .9, cs, 1))); }
  }
  // ---- columns (they replace the atlantes of Metten; the option keeps its name): beside the central window a pair of
  // Ionic columns in giallo antico on pedestals carries the entablature ressaut; at the door a pair of Greek Doric
  // columns in verde antico carries the gallery deck (or, without a gallery, a ressaut). Each joins the obstacles,
  // so the wall cases leave room for it and walkers go round it. ----
  const ressaut = (M, s, wd, dz) => { // entablature break over a column (mitred onto the rings): stucco, scagliola frieze, cornice
    A.add(stucco, new THREE.BoxGeometry(wd, E * .34 - .004, dz), M.clone().multiply(Mx(s, yE + E * .17, dz / 2)));
    A.add(scag, new THREE.BoxGeometry(wd - .04, E * .28 - .004, dz - .04), M.clone().multiply(Mx(s, yE + E * .48, (dz - .04) / 2)));
    A.add(stucco, new THREE.BoxGeometry(wd + .14, E * .26 - .004, dz + .12), M.clone().multiply(Mx(s, yE + E * .75, (dz + .12) / 2)));
    A.add(gilt, new THREE.BoxGeometry(wd + .18, E * .06 - .004, dz + .15), M.clone().multiply(Mx(s, yE + E * .91, (dz + .15) / 2)));
  };
  if (useAtl) walls.forEach(W => {
    if (W.name !== windowWall) return; const n = W.piers.length - 1; if (n < 3) return; const k = (n - 1) >> 1, M = WM(W);
    [W.piers[k], W.piers[k + 1]].forEach(s => {
      const pH = clamp(yE * .2, .7, 1.1), H = yE - pH + .006, D = Math.min(.5, H / ORDERS.ionic.h); if (H < 1.6) return;
      const cz = D * .5 + .22, pw0 = D * 1.36 + .08, M0 = M.clone().multiply(Mx(s, 0, cz));
      pedestal(A, M0, pw0, pw0, pH, 'stucco');
      if (pH > .9) { // a fielded panel on the die's face: gilt frame round a scagliola inset (each layer 3 mm proud of the last)
        const ph = pH - .62, pc = .145 + (pH - .3) / 2, P = (mat, geo, x, y, z) => A.add(mat, geo, M0.clone().multiply(Mx(x, y, pw0 / 2 + z)));
        P(scag, new THREE.BoxGeometry(pw0 - .26, ph - .1, .006), 0, pc, .003); [-1, 1].forEach(q => { P(gilt, new THREE.BoxGeometry(pw0 - .18, .022, .014), 0, pc + q * (ph / 2 - .02), .007); P(gilt, new THREE.BoxGeometry(.022, ph - .062, .012), q * (pw0 / 2 - .1), pc, .006); });
      }
      addColumn(A, M0.clone().multiply(Mx(0, pH, 0)), { order: 'ionic', marble: 'giallo', H, D });
      ressaut(M, s, pw0 + .06, cz + pw0 / 2 + .05);
      const wp = V(s, 0, cz).applyMatrix4(M); info.obstacles.push({ x: wp.x, z: wp.z, r: pw0 / 2 + .1, kind: 'column' });
    });
  });
  const doorColX = [];
  if (door && doorColumns) {
    const W = walls[1], M = WM(W), inv = M.clone().invert(), gal = gWalls.has('front'), top = gal ? yg - .17 : yE;
    const H = top - (gal ? .2 : 0) + .004, D = Math.min(.46, H / ORDERS.doric.h), x = doorW / 2 + .32 + D * .71, cz = D * .71 + .06;
    const free = !(avoid || []).some(p => { const q = V(p.x, 0, p.z).applyMatrix4(inv); return Math.abs(q.z) < .6 && Math.abs(Math.abs(q.x) - x) < 1.3; });
    if (free && H > 2 && x + D < W.len / 2 - 1) [-1, 1].forEach(sd => {
      const M0 = M.clone().multiply(Mx(sd * x, 0, cz));
      addColumn(A, M0, { order: 'doric', marble: 'verde', trim: 'verde', H, D }); doorColX.push(sd * x);
      if (gal) { // a plain architrave beam from the abacus to the deck, running back into the wall
        const bw = D * 1.3, dz = cz + D * .7; A.add(stucco, new THREE.BoxGeometry(bw, .2 + .006, dz), M.clone().multiply(Mx(sd * x, top - .1 + .001, dz / 2 + .002)));
        A.add(gilt, new THREE.BoxGeometry(bw + .03, .022, dz + .015), M.clone().multiply(Mx(sd * x, top - .2 + .02, (dz + .015) / 2 + .002)));
      } else ressaut(M, sd * x, D * 1.3, cz + D * .7);
      const wp = V(sd * x, 0, cz).applyMatrix4(M); info.obstacles.push({ x: wp.x, z: wp.z, r: D * .71 + .08, kind: 'column' });
    });
  }
  // ---- gallery (Admont / Mafra / Wiblingen): deck on consoles, serpentine balustrade, upper tier of books ----
  if (galleryOn) {
    const bal = [], wn = bmat('walnut'), cr = bmat('cream'), books = bmat('books');
    walls.forEach(W => {
      if (!gWalls.has(W.name)) return;
      const M = WM(W), L = W.len, tP = gWalls.has(NEXT[W.name]) ? gd : 0, tM = gWalls.has(PREV[W.name]) ? gd : 0, n = W.piers.length - 1, bow = .2;
      const front = []; // front edge (s, z) from +end to −end
      const zAt = s => { for (let i = 1; i < n - 1; i++) { const a = W.piers[i], b = W.piers[i + 1]; if (s >= a && s <= b) return gd + bow * Math.sin(Math.PI * (s - a) / (b - a)); } return gd; };
      const s0 = L / 2 - tP, s1 = -L / 2 + tM, N = Math.max(8, Math.ceil((s0 - s1) / .12));
      for (let k = 0; k <= N; k++) { const s = s0 + (s1 - s0) * k / N; front.push([s, zAt(s)]); }
      const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); front.forEach(([s, z]) => sh.lineTo(s, -z)); sh.lineTo(-L / 2, 0);
      const dg = new THREE.ExtrudeGeometry(sh, { depth: .17, bevelEnabled: false }); dg.rotateX(-Math.PI / 2); A.add(wn, dg, M.clone().multiply(Mx(0, yg - .17, 0)));
      const curve = new THREE.CatmullRomCurve3(front.map(([s, z]) => V(s, 0, z)));
      const tube = (y, r, mat, inset = 0) => { const c2 = new THREE.CatmullRomCurve3(front.map(([s, z]) => V(s, y, z - inset))); A.add(mat, new THREE.TubeGeometry(c2, Math.max(16, front.length), r, 6), M); };
      tube(yg - .17, .028, gilt); tube(yg + .005, .02, gilt); tube(yg + .1, .028, gilt, .07); tube(yg + .96, .042, wn, .07);
      const len = curve.getLength(), nb = Math.floor(len / .15);
      for (let k = 1; k < nb; k++) { const p = curve.getPointAt(k / nb); const wp = V(p.x, yg + .12, p.z - .07).applyMatrix4(M); bal.push(wp); }
      // posts at bay boundaries and consoles below the deck at interior piers
      W.piers.slice(1, -1).forEach(s => {
        const z = gd - .07; A.add(cr, new THREE.BoxGeometry(.14, .86, .14), M.clone().multiply(Mx(s, yg + .54, z))); A.add(gilt, new THREE.BoxGeometry(.18, .05, .18), M.clone().multiply(Mx(s, yg + .99, z)));
        if (cases) return; // the lower bookcases carry the deck
        const cs = new THREE.Shape(); cs.moveTo(0, 0); cs.lineTo(gd * .82, 0); cs.bezierCurveTo(gd * .82, -.12, gd * .5, -.12, gd * .35, -.2); cs.bezierCurveTo(gd * .15, -.28, .18, -.36, .12, -.46); cs.lineTo(0, -.5); cs.lineTo(0, 0);
        const cg = new THREE.ExtrudeGeometry(cs, { depth: .16, bevelEnabled: true, bevelThickness: .015, bevelSize: .015, bevelSegments: 1, curveSegments: 8 }); cg.translate(0, 0, -.08); cg.rotateY(-Math.PI / 2);
        A.add(stucco, cg, M.clone().multiply(Mx(s, yg - .17, 0)));
        A.add(gilt, new THREE.TorusGeometry(.055, .018, 6, 14), M.clone().multiply(Mx(s, yg - .58, .14, 0, Math.PI / 2, 0)));
      });
      // upper tier of books between the pilasters (with wall cases on, buildWallCases builds a real one)
      if (!cases) {
      const yTop = yE - .06, yBot = yg + .02, rows = Math.max(1, Math.floor((yTop - yBot) / .42)), rh = (yTop - yBot) / rows;
      for (let i = 0; i < n; i++) {
        let a = W.pil[i] + pw / 2 + .015, b = W.pil[i + 1] - pw / 2 - .015; if (i === 0 && tM) a = Math.max(a, -L / 2 + .32); if (i === n - 1 && tP) b = Math.min(b, L / 2 - .32); if (b - a < .3) continue;
        const bw = b - a, c = (a + b) / 2;
        for (let r = 0; r < rows; r++) {
          const y0 = yBot + r * rh; A.add(cr, new THREE.BoxGeometry(bw, .03, .3), M.clone().multiply(Mx(c, y0 + .015, .15)));
          const pg = new THREE.PlaneGeometry(bw, rh - .035); const uv = pg.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setX(q, (uv.getX(q) * bw + a + r * .37 + i * .91) / 1.7);
          A.add(books, pg, M.clone().multiply(Mx(c, y0 + .03 + (rh - .035) / 2, .24)));
        }
        A.add(cr, new THREE.BoxGeometry(bw, .03, .3), M.clone().multiply(Mx(c, yTop - .015, .15)));
        [a, b].forEach(x => A.add(cr, new THREE.BoxGeometry(.035, yTop - yBot, .3), M.clone().multiply(Mx(x, (yTop + yBot) / 2, .15))));
      }
      }
    });
    if (bal.length) { // balusters: one instanced mesh
      const bg = new THREE.LatheGeometry([[.04, 0], [.04, .04], [.025, .07], [.045, .28], [.02, .62], [.034, .72], [.025, .8]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
      const im = new THREE.InstancedMesh(bg, bmat('cream'), bal.length); bal.forEach((p, i) => im.setMatrixAt(i, Mx(p.x, p.y, p.z))); im.castShadow = false; im.receiveShadow = true; im.name = 'balusters'; g.add(im);
    }
    // spiral stairs in the corners between two gallery walls (hidden stairs, as at Admont)
    if (!avoid) walls.forEach(W => {
      if (!gWalls.has(W.name) || !gWalls.has(NEXT[W.name])) return;
      const M = WM(W), cx = W.len / 2 - .85, cz = .85, steps = Math.round(yg / .2), R = .72;
      A.add(gilt, new THREE.CylinderGeometry(.06, .07, yg + .9, 12), M.clone().multiply(Mx(cx, (yg + .9) / 2, cz)));
      const rail = [];
      for (let k = 0; k < steps; k++) { const a = k * .42 + 1.2, y = (k + 1) * yg / steps; A.add(wn, new THREE.BoxGeometry(R, .05, .3), M.clone().multiply(Mx(cx, y - .025, cz, 0, -a, 0)).multiply(Mx(R / 2, 0, 0))); rail.push(V(cx + Math.cos(a) * (R - .03), y + .9, cz - Math.sin(a) * (R - .03))); }
      A.add(gilt, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), steps * 3, .02, 6), M);
      for (let k = 0; k < steps; k += 1) { const a = k * .42 + 1.2, y = (k + 1) * yg / steps; A.add(gilt, new THREE.CylinderGeometry(.008, .008, .9, 5), M.clone().multiply(Mx(cx + Math.cos(a) * (R - .03), y + .45, cz - Math.sin(a) * (R - .03)))); }
      const wp = V(cx, 0, cz).applyMatrix4(M); info.obstacles.push({ x: wp.x, z: wp.z, r: R + .05, kind: 'stair' });
    });
  }
  // ---- wall bookcase heights: under the gallery deck, under the window sills, or up to the capitals ----
  const caseTops = { low: clamp(yE - capH - .12, 2.3, 3.9), gal: yg - .17, win: info.windows.length ? clamp(Math.min(...info.windows.map(o => o.sill)) - .15, .9, 2.0) : clamp(yE - capH - .12, 2.3, 3.9) };
  info.nicheTop = Math.min(3.22, caseTops.low - .02); // scroll niches: tall enough that a hanging scroll clears the pedestal in front of it (room.js)
  // ---- sconces on the pilasters, chandeliers under the domes ----
  walls.forEach(W => {
    const M = WM(W), isDoor = door && W.name === 'front';
    const atlS = useAtl && W.name === windowWall && W.piers.length >= 4 ? [W.piers[(W.piers.length - 2) >> 1], W.piers[((W.piers.length - 2) >> 1) + 1]] : [];
    let y = gWalls.has(W.name) ? Math.min(yg + 1.5, yE - .4) : clamp(yE - .95, 2.35, 3.6), z = pd;
    if (cases && !gWalls.has(W.name) && !(W.name === windowWall && y > caseTops.win + .15)) { y = Math.min(y, caseTops.low - .55); z = CD + .035; } // on the case pilasters
    if (!fast) W.pil.slice(1, -1).forEach(s => { if (atlS.includes(s) || (isDoor && Math.abs(s) < doorW / 2 + .3 + pw / 2) || (isDoor && doorColX.some(c => Math.abs(c - s) < .9))) return; sconce(FX, M.clone().multiply(Mx(s, y, z)), flames); });
  });
  const lights = new THREE.Group(); lights.name = 'lights'; g.add(lights); g.userData.lights = lights;
  const hasWin = !!g.userData.window;
  // the hemisphere light stands in for bounce light until the room probe has been captured (surfaces.js RoomProbe
  // scales it down then: the probe's irradiance is the real bounce)
  { const hemi = new THREE.HemisphereLight(0xfff1de, 0x4a3828, hasWin ? .36 : .5); hemi.userData.fakeGI = true; lights.add(hemi); }
  const chs = chandeliers ? domes.slice() : []; if (chs.length > 3) { const k = chs.length; chs.splice(0, k, chs[0], chs[k >> 1], chs[k - 1]); }
  const sCh = clamp(h / 6, .75, 1.35), yc = clamp(Math.min(yE - .5, h * .62), 2.5, h - 1);
  chs.forEach(D => {
    if (!fast) { chandelier(FX, Mx(D.x, yc, D.z), sCh, flames);
    FX.add(gilt, new THREE.CylinderGeometry(.012, .012, h + D.rise - yc - .3 * sCh, 6), Mx(D.x, (h + D.rise + yc + .3 * sCh) / 2, D.z));
    }   // (a fast preview leaves out the chandelier's metalwork, never its light: the light count, and so every shader, stays the same)
    const L = new THREE.PointLight(0xffc68c, 7 * yc * yc / 4 * (hasWin ? 1 : 1.35), 0, 2); L.position.set(D.x, yc - .1, D.z); L.userData.base = L.intensity; lights.add(L);
  });
  // ---- the sun through the window wall: shadowed directional light + soft additive shafts ----
  if (hasWin) {
    const W = walls.find(x => x.name === windowWall), n = V(Math.sin(W.r), 0, Math.cos(W.r)), t = V(Math.cos(W.r), 0, -Math.sin(W.r));
    const el = THREE.MathUtils.degToRad(33), az = THREE.MathUtils.degToRad(24);
    const dir = n.clone().multiplyScalar(Math.cos(el) * Math.cos(az)).addScaledVector(t, Math.cos(el) * Math.sin(az)).add(V(0, -Math.sin(el), 0)).normalize();
    const R = .5 * Math.hypot(w, d, h) + 1, D0 = 40;
    const sun = new THREE.DirectionalLight(0xffd2a0, 4.6); sun.position.copy(dir).multiplyScalar(-D0).add(V(0, h * .35, 0)); sun.target.position.set(0, h * .35, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = D0 - R - 2; c.far = D0 + R + 2; c.updateProjectionMatrix();
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .035; sun.shadow.radius = 3;
    lights.add(sun, sun.target); g.userData.sun = sun;
    const fill = new THREE.DirectionalLight(0xffe6c8, .3); fill.position.copy(n).multiplyScalar(-10).add(V(0, h, 0)); fill.target.position.set(0, 1, 0); lights.add(fill, fill.target);
    // shafts
    const M = WM(W), sp = [], su = [];
    const dl = dir.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(-W.r)); // into wall-local frame
    W.wins.forEach(o => {
      const x0 = o.c - o.rr * .92, x1 = o.c + o.rr * .92, y0 = o.sill + .02, y1 = o.spring + o.rr * .55, maxT = (d - .4) / Math.max(.05, dl.z);
      const proj = (x, y) => { const tt = Math.min(y / -dl.y, maxT); return [x + dl.x * tt, y + dl.y * tt, -.05 + dl.z * tt]; };
      const Wp = [[x0, y0, -.05], [x1, y0, -.05], [x1, y1, -.05], [x0, y1, -.05]], Fp = Wp.map(([x, y]) => proj(x, y));
      [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b]) => { [[Wp[a], 0, 1], [Wp[b], 1, 1], [Fp[b], 1, 0], [Wp[a], 0, 1], [Fp[b], 1, 0], [Fp[a], 0, 0]].forEach(([p, u, v]) => { sp.push(...p); su.push(u, v); }); });
    });
    if (sp.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); geo.computeVertexNormals(); geo.applyMatrix4(M); const sh = new THREE.Mesh(geo, bmat('shaft')); sh.name = 'sun-shafts'; sh.renderOrder = 5; sh.userData.noProbe = true; sh.userData.noAO = true; sh.castShadow = false; sh.receiveShadow = false; g.add(sh); }
  }
  // ---- merge everything ----
  A.build(g, { name: 'shell-' }).forEach(m => { if (/^gilt|^eggdart/.test(m.material.userData.bmat)) m.castShadow = false; });
  const fxMeshes = FX.build(g, { name: 'fx-' }); fxMeshes.forEach(m => { m.castShadow = false; });
  if (flames.length) { // one Points draw call for every candle glow, with a gentle flicker
    const pg = new THREE.BufferGeometry().setFromPoints(flames);
    const pm = new THREE.PointsMaterial({ map: radialGlow('255,196,130'), size: .55, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55, color: 0xffd2a0 });
    const pts = new THREE.Points(pg, pm); pts.name = 'candle-glow'; pts.renderOrder = 6; pts.userData.noProbe = true; g.add(pts);
    // candle flicker: band-limited noise (a slow 1–2 Hz breathing, a 6–9 Hz shiver) plus a rare draught that dips the
    // flame for ~0.3 s; each chandelier on its own phase. A chandelier of 8 candles averages its flames, so it moves less.
    const n1 = t => { const i = Math.floor(t), f = t - i, h = k => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; const u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u - .5; };
    const flick = (tt, k, a) => 1 + a * (1.1 * n1(tt * 1.6 + k * 17) + .55 * n1(tt * 7.3 + k * 5) + .25 * n1(tt * 13.7 + k * 3)) - a * 2.2 * Math.max(0, n1(tt * .35 + k * 9) - .38);
    pts.onBeforeRender = () => { const tt = performance.now() * .001; pm.size = .55 * flick(tt, 0, .09); lights.children.forEach((L, i) => { if (L.isPointLight && L.userData.base) L.intensity = L.userData.base * flick(tt, i + 1, .05); }); };
  }
  g.traverse(o => { if (o.isMesh && !o.userData.floor) o.userData.shell = true; });
  g.userData.baroque = info;
  // ---- built-in wall bookcases, rebuildable on their own when the user's bookcases or the scroll niches change ----
  if (cases) {
    const ctx = { walls, WM, D: CD, yLow: caseTops.low, yGal: caseTops.gal, yWin: caseTops.win, yg: galleryOn ? yg : null, yE, gWalls, windowWall, door, doorW, palette, pp: clamp(pw * .8, .26, .42), pw, gd, dadoH,
      nicheTop: info.nicheTop, fixedBlocks: info.obstacles.map(o => ({ x: o.x, z: o.z, r: o.r })), cases, pierFronts: {} };
    let cur = null, key = '';
    g.userData.setCases = ({ skip = [], niches: ni = [], fast: fc = fast } = {}) => {
      const k = JSON.stringify([skip.map(f => [f.x, f.z, f.w, f.d, f.rot, f.r].map(v => v == null ? 0 : +(+v).toFixed(2))), ni.map(p => [+p.x.toFixed(2), +p.z.toFixed(2)])]);
      if (k === key && cur && !!cur.userData.fast === !!fc) return cur; key = k;
      if (cur) { cur.removeFromParent(); cur.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      cur = buildWallCases(ctx, { skip, niches: ni, fast: fc }); cur.userData.fast = fc; g.add(cur); info.books = cur.userData.books; return cur;
    };
    g.userData.setCases({ skip: caseSkip, niches });
  }
  g.userData.dispose = () => g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); // geometry only: materials/textures are shared and cached
  return g;
}
