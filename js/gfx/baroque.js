// Baroque library architecture (after Metten, Admont, Mafra, Wiblingen; see docs/research/baroque-libraries.md):
// shared materials, a merge-by-material accumulator, draped/atlas figures, and the parametric `baroque` room shell.
// Everything is procedural: canvas textures + generated geometry, merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { marbleTex, gildTex, marbleFloor, frescoTex, rocailleTex, eggDartTex, bookSpinesTex, windowSkyTex, shaftTex, plaster, woodGrain, radialGlow, fluteNormal, figuredWood, spineAtlas, SPINE_VARIANTS, parchment } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const Mx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

// ---------- materials (cached; textures use world-metre UVs so one material serves every size) ----------
const MATS = new Map();
export function bmat(name) {
  if (MATS.has(name)) return MATS.get(name);
  let m;
  const S = o => new THREE.MeshStandardMaterial(o), P = o => new THREE.MeshPhysicalMaterial(o);
  if (name.startsWith('scag-')) { // scagliola / polished marble
    const k = name.slice(5); m = P({ map: marbleTex(k, { size: 512, seed: 2 }), roughness: .3, clearcoat: .75, clearcoatRoughness: .14, envMapIntensity: 1.1 }); m.userData.boxUV = .9;
  } else switch (name) {
    case 'gilt': { const t = gildTex(); m = S({ color: 0xffffff, map: t.map, roughnessMap: t.rough, metalness: 1, roughness: 1, envMapIntensity: 1.9 }); m.userData.boxUV = 2.2; break; }
    case 'gilt-dim': { const t = gildTex(); m = S({ color: 0xd8c08a, map: t.map, roughnessMap: t.rough, metalness: .85, roughness: 1.15, envMapIntensity: 1.3 }); m.userData.boxUV = 2.2; break; }
    case 'stucco': m = S({ color: 0xf3ede2, map: plaster([240, 234, 222], 'stucco', .1), roughness: .78 }); m.userData.boxUV = .35; break;
    case 'wall': m = S({ color: 0xffffff, map: plaster([228, 219, 202], 'bwall', .09), roughness: .9 }); m.userData.boxUV = .22; break;
    // painted wood (Admont's white cases): ivory lacquer with the grain faintly showing through
    case 'cream': m = P({ color: 0xfbf6ec, map: figuredWood([244, 236, 220], 'ivory', { paint: 1 }), roughness: .4, clearcoat: .45, clearcoatRoughness: .28 }); m.userData.boxUV = .55; break;
    case 'cream-back': m = S({ color: 0xffffff, map: figuredWood([214, 200, 174], 'ivoryb', { paint: 1, seed: 3 }), roughness: .72 }); m.userData.boxUV = .55; break;
    // figured walnut (Metten) and pale rococo oak (Mafra)
    case 'walnut': m = P({ map: figuredWood([128, 80, 46], 'walnut'), roughness: .42, clearcoat: .45, clearcoatRoughness: .22 }); m.userData.boxUV = .8; break;
    case 'walnut-dark': m = P({ map: figuredWood([80, 49, 29], 'walnutd', { seed: 5 }), roughness: .5, clearcoat: .3, clearcoatRoughness: .3 }); m.userData.boxUV = .8; break;
    case 'pale': m = P({ map: figuredWood([214, 186, 142], 'pale', { seed: 9 }), roughness: .5, clearcoat: .25, clearcoatRoughness: .35 }); m.userData.boxUV = .8; break;
    case 'pale-dark': m = P({ map: figuredWood([168, 134, 94], 'paled', { seed: 11 }), roughness: .55, clearcoat: .2, clearcoatRoughness: .4 }); m.userData.boxUV = .8; break;
    case 'boiserie-walnut': m = P({ map: figuredWood([104, 64, 36], 'walnutb', { seed: 13 }), roughness: .45, clearcoat: .4, clearcoatRoughness: .25 }); m.userData.boxUV = .8; break;
    case 'spines': { // instanced books: one cell of the spine atlas per binding variant (instance attribute aVar)
      m = S({ map: spineAtlas(), roughness: .6, metalness: .05 });
      m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVar;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x += aVar / ' + SPINE_VARIANTS.toFixed(1) + ';\n#endif'); };
      m.customProgramCacheKey = () => 'spines-atlas-1'; m.userData.noCast = true; break; }
    case 'paint': m = S({ color: 0xf0ebe0, roughness: .55 }); break;
    case 'statuary-head': m = bmat('statuary').clone(); m.vertexColors = true; m.userData = { boxUV: 1.6 }; break;
    case 'statuary': m = P({ map: marbleTex('statuary', { size: 512, seed: 4 }), roughness: .36, clearcoat: .25, clearcoatRoughness: .4, sheen: .3, sheenColor: new THREE.Color(0xfff4e8), envMapIntensity: 1.1 }); m.userData.boxUV = 1.6; break;
    case 'books': m = S({ map: bookSpinesTex(), roughness: .72 }); break;
    case 'pages': m = S({ map: parchment('deskbook', 256, 256), roughness: .85 }); break;
    case 'book-0': case 'book-1': case 'book-2': m = S({ color: [0x5a2a1e, 0x2a3a5a, 0x3a4a2a][+name.slice(5)], roughness: .62 }); break;
    case 'candle': m = S({ color: 0xf6eedc, roughness: .5, emissive: 0xffcf8a, emissiveIntensity: .12 }); break;
    case 'flame': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.5, 1.1), toneMapped: false }); m.userData.noCast = true; break;
    case 'sky': m = new THREE.MeshBasicMaterial({ map: windowSkyTex(), color: new THREE.Color(1.05, 1.02, .98) }); m.userData.noCast = true; break;
    case 'shaft': { const t = shaftTex(); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m = new THREE.MeshBasicMaterial({ map: t, color: 0xffd9a6, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: true }); m.userData.noCast = true; break; }
    case 'cove': { const t = rocailleTex(3); m = S({ map: t.map, metalnessMap: t.mr, roughnessMap: t.mr, metalness: 1, roughness: 1, envMapIntensity: 1.5, emissive: 0xffffff, emissiveMap: t.map, emissiveIntensity: .06 }); break; }
    case 'eggdart': m = S({ map: eggDartTex(), metalness: .7, roughness: .38, envMapIntensity: 1.6 }); break;
    case 'fluted': m = P({ color: 0xf1e9d8, normalMap: fluteNormal(), normalScale: new THREE.Vector2(1, 1), roughness: .42, clearcoat: .35, clearcoatRoughness: .3 }); m.normalMap.repeat.set(3, 1); break;
    default: m = S({ color: 0xcccccc });
  }
  if (name.startsWith('fresco')) { const t = frescoTex(+name.slice(6) || 1); m = S({ map: t, roughness: .95, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .16, side: THREE.DoubleSide }); }
  m.userData.bmat = name; MATS.set(name, m); return m;
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
// Accumulates geometry per material, merges at the end (one draw call per material).
export class Acc {
  constructor() { this.m = new Map(); }
  add(mat, geo, m4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m4) g.applyMatrix4(m4);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(k === 'color' && mat.vertexColors)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
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

// ---------- small geometry helpers ----------
const UP = V(0, 1, 0);
// tapered limb between two points (open cylinder + spherical joints), pushed into `add(geo, m4)`
function limb(add, a, b, r0, r1, seg = 12) {
  const dir = b.clone().sub(a), len = dir.length(), mid = a.clone().add(b).multiplyScalar(.5);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  add(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true), new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
  add(new THREE.SphereGeometry(r0, seg, 8), Mx(a.x, a.y, a.z)); add(new THREE.SphereGeometry(r1, seg, 8), Mx(b.x, b.y, b.z));
}
// lathe with drapery folds: radius modulated by sin(k·θ) with amplitude amp(y)
function drapedLathe(profile, folds = 9, amp = () => 0, segs = 40, zScale = .8, phase = 0, phiStart = 0, phiLength = Math.PI * 2) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), k = 1 + amp(y) * Math.sin(folds * th + y * 4 + phase) + amp(y) * .4 * Math.sin(folds * 2.3 * th + 1.7); p.setXYZ(i, x * k, y, z * k * zScale); }
  geo.computeVertexNormals(); return geo;
}
// ---------- figures (unit height ≈ 1; caller scales) ----------
// A bearing atlas: legs braced, arms raised to a cushion at y = 1. Abstract, built from limbs and lathes.
export function atlasFigure(add, mirror = 1, { herm = false, addTerm = null, addGilt = null, addHead = null } = {}) {
  const m = mirror, P = (x, y, z) => V(x * m, y, z);
  if (herm) { // a herm-atlas: the torso rises from a tapering term wrapped in drapery and a gilt acanthus cuff
    const term = new THREE.CylinderGeometry(.17 * Math.SQRT2, .11 * Math.SQRT2, .47, 4, 1); term.rotateY(Math.PI / 4); term.scale(1, 1, .78); (addTerm || add)(term, Mx(0, .235, 0));
    if (addGilt) { addGilt(new THREE.BoxGeometry(.25, .025, .19), Mx(0, .012, 0)); addGilt(new THREE.BoxGeometry(.37, .03, .29), Mx(0, .46, 0));
      for (let k = 0; k < 6; k++) addGilt(new THREE.SphereGeometry(.016 - k * .0013, 8, 6), Mx(0, .4 - k * .05, .143 - k * .006, 0, 0, 0, 1, 1.25, .7));
      addGilt(drapedLathe([[0, .45], [.17, .45], [.18, .48], [.15, .53], [0, .535]], 14, y => .12 * clamp((.53 - y) / .08, 0, 1), 40, .8), Mx(0, 0, 0)); }
    add(drapedLathe([[0, .5], [.15, .5], [.13, .54], [.105, .58], [.09, .61], [0, .615]], 11, y => .08 * clamp((.61 - y) / .1, 0, 1), 40, .78, 1), Mx(0, 0, 0));
    add(new THREE.SphereGeometry(.05, 12, 10), Mx(.06 * m, .56, .08, .3, 0, .4 * m, .9, 1.4, .3)); // a fold of the drape over the hip
  } else {
  // legs: weight on one leg, the other knee forward (contrapposto under load)
  limb(add, P(-.062, .04, .0), P(-.066, .265, .005), .022, .034); limb(add, P(-.066, .265, .005), P(-.07, .49, -.005), .036, .05);
  limb(add, P(.07, .05, .06), P(.075, .27, .05), .022, .033); limb(add, P(.075, .27, .05), P(.07, .49, .0), .035, .049);
  add(new THREE.SphereGeometry(.028, 10, 8), Mx(-.062 * m, .02, .025, 0, 0, 0, 1, .55, 1.7)); add(new THREE.SphereGeometry(.028, 10, 8), Mx(.07 * m, .028, .085, 0, 0, 0, 1, .55, 1.7));
  add(new THREE.SphereGeometry(.03, 10, 8), Mx(-.066 * m, .265, .02, 0, 0, 0, 1, .9, .8)); add(new THREE.SphereGeometry(.03, 10, 8), Mx(.075 * m, .27, .068, 0, 0, 0, 1, .9, .8));
  // draped loincloth with a hanging front fold
  add(drapedLathe([[0, .44], [.098, .44], [.118, .47], [.115, .53], [.1, .57], [0, .575]], 12, y => .07 * clamp((.56 - y) / .12, 0, 1), 36, .78), Mx(0, 0, 0));
  add(new THREE.SphereGeometry(.05, 12, 10), Mx(.02 * m, .45, .07, .2, 0, .15 * m, .9, 1.6, .35));
  }
  // torso: V-shaped, slightly bowed forward under the weight
  add(drapedLathe([[0, .55], [.082, .56], [.086, .6], [.1, .66], [.122, .72], [.135, .77], [.11, .8], [.05, .825], [0, .83]], 1, () => 0, 32, .66), Mx(0, 0, -.005, .12));
  add(new THREE.SphereGeometry(.052, 14, 10), Mx(-.05, .73, .05, .1, 0, 0, 1, .72, .45)); add(new THREE.SphereGeometry(.052, 14, 10), Mx(.05, .73, .05, .1, 0, 0, 1, .72, .45));
  [[.66, .036], [.62, .034], [.585, .032]].forEach(([y, r]) => [-1, 1].forEach(s => add(new THREE.SphereGeometry(r, 10, 8), Mx(s * .024, y, .05 + (y - .58) * .2, 0, 0, 0, 1, .75, .5))));
  add(new THREE.SphereGeometry(.07, 14, 10), Mx(0, .81, -.015, 0, 0, 0, 1.6, .55, .8)); // trapezius
  add(new THREE.CylinderGeometry(.03, .04, .055, 12), Mx(0, .84, .02, .45));
  // a bearded head bowed forward and turned a little under the load: carved features, curled hair and beard
  (addHead || add)(headGeo({ beard: true, seed: m > 0 ? 1 : 2 }), Mx(0, .878, .068, .32, -.18 * m, 0, .05, .05, .05));
  // a mantle knotted on the shoulder, falling behind the back, with a fold across the breast
  add(drapedLathe([[.07, .84], [.13, .82], [.16, .77], [.155, .7], [.14, .62], [.13, .56]], 6, y => .06 * clamp((.84 - y) / .3, 0, 1), 26, .75, 2 + m, Math.PI * .58, Math.PI * .84), Mx(0, 0, -.01));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-.13 * m, .81, .0), V(-.07 * m, .76, .07), V(.02 * m, .7, .085), V(.09 * m, .64, .06), V(.13 * m, .6, .0)]), 20, .022, 8), Mx(0, 0, 0, 0, 0, 0, 1, 1, .8));
  add(new THREE.SphereGeometry(.03, 10, 8), Mx(-.12 * m, .815, .02, 0, 0, 0, 1, .8, .9));
  [-1, 1].forEach(s => {
    add(new THREE.SphereGeometry(.047, 12, 10), Mx(s * .135, .79, 0, 0, 0, 0, 1, .95, .9));
    const sh = V(s * .14, .8, 0), el = V(s * .19, .93, -.01), hd = V(s * .075, .99, .02);
    limb(add, sh, el, .04, .032); limb(add, el, hd, .031, .022);
    add(new THREE.SphereGeometry(.028, 10, 8), Mx(hd.x, hd.y + .008, hd.z, 0, 0, 0, 1.3, .6, 1.2));
  });
}
// A draped allegorical figure holding an attribute. variant 0 book · 1 globe · 2 ring (astronomy) · 3 tablet · 4 torch
export function drapedFigure(add, addGilt, variant = 0, seed = 1, addHead = null) {
  const ph = seed * 1.7;
  add(drapedLathe([[0, 0], [.14, 0], [.15, .03], [.13, .2], [.1, .42], [.078, .52], [.085, .6], [.1, .7], [.108, .76], [.08, .8], [.036, .83], [0, .835]], 9, y => .085 * Math.pow(clamp(1 - y / .82, 0, 1), 1.3) + .012, 44, .78, ph), Mx(0, 0, 0));
  // mantle: a cape falling from the shoulders behind (half lathe with folds) and a sash across the breast
  const s = seed % 2 ? 1 : -1; // which hand holds the attribute
  const cape = drapedLathe([[.17, .015], [.165, .25], [.135, .5], [.122, .7], [.112, .78], [.07, .815]], 7, y => .07 * Math.pow(clamp(1 - y / .8, 0, 1), 1.1) + .012, 30, .8, ph + 2, Math.PI * .62, Math.PI * .76);
  add(cape, Mx(0, 0, -.012, 0, 0, 0, 1.06, 1, 1.12));
  const sash = new THREE.CatmullRomCurve3([V(-s * .1, .77, .01), V(-s * .04, .72, .085), V(s * .04, .63, .09), V(s * .095, .54, .07), V(s * .115, .46, .02)]);
  add(new THREE.TubeGeometry(sash, 24, .03, 8), Mx(0, 0, 0, 0, 0, 0, 1, 1, .7));
  add(new THREE.CylinderGeometry(.03, .036, .06, 12), Mx(0, .845, .005));
  // carved head turned toward the attribute, waved hair gathered into a knot, a gilt fillet
  const HQ = Mx(0, .9, .014, .14, .32 * s, 0, .049, .049, .049);
  (addHead || add)(headGeo({ female: true, seed }), HQ);
  add(new THREE.SphereGeometry(.6, 14, 10), HQ.clone().multiply(Mx(0, .35, -1.0, 0, 0, 0, 1, .85, .9))); // knot
  [[-.35, .5], [.35, .5]].forEach(([x]) => add(new THREE.TorusGeometry(.32, .14, 6, 12), HQ.clone().multiply(Mx(x, .3, -1.05, 0, Math.PI / 2, 0)))); // coils of the knot
  addGilt(new THREE.TorusGeometry(1.02, .05, 6, 40), HQ.clone().multiply(Mx(0, .4, -.08, Math.PI / 2 - .35, 0, 0, .92, 1, 1)));
  limb(add, V(-s * .1, .765, 0), V(-s * .125, .61, .03), .026, .022); limb(add, V(-s * .125, .61, .03), V(-s * .07, .55, .085), .022, .018); // lowered arm across, holding the sash
  const sh = V(s * .1, .765, 0), el = V(s * .15, .63, .07), hd = V(s * .12, .72, .17);
  limb(add, sh, el, .026, .022); limb(add, el, hd, .021, .018);
  const H = hd;
  if (variant === 0) { const BM = Mx(H.x, H.y + .035, H.z + .015, -.5, s * .3); add(new THREE.BoxGeometry(.075, .1, .024), BM); addGilt(new THREE.BoxGeometry(.068, .094, .026), BM); [-1, 1].forEach(k => add(new THREE.BoxGeometry(.078, .103, .004), BM.clone().multiply(Mx(0, 0, k * .013)))); }
  else if (variant === 1) { add(new THREE.SphereGeometry(.065, 20, 14), Mx(H.x, H.y + .07, H.z)); addGilt(new THREE.TorusGeometry(.075, .006, 6, 36), Mx(H.x, H.y + .07, H.z, .4, 0, .3)); }
  else if (variant === 2) { addGilt(new THREE.TorusGeometry(.07, .008, 6, 36), Mx(H.x, H.y + .08, H.z, 0, s * .5)); addGilt(new THREE.TorusGeometry(.055, .006, 6, 30), Mx(H.x, H.y + .08, H.z, Math.PI / 2, s * .5)); }
  else if (variant === 3) { add(new THREE.BoxGeometry(.1, .14, .018), Mx(H.x, H.y + .05, H.z, -.15, s * .2)); }
  else { addGilt(new THREE.CylinderGeometry(.012, .016, .2, 8), Mx(H.x, H.y + .06, H.z)); addGilt(new THREE.ConeGeometry(.03, .08, 10), Mx(H.x, H.y + .2, H.z)); }
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

// ---------- carved heads (statues and atlantes) ----------
// A head carved from a displaced sphere: unit radius, face toward +z, crown toward +y. Brow ridge, eye sockets with
// the eyeballs left standing, a nose with alae, cheekbones, parted lips, chin, ears; a mass of hair (waved for a
// female figure, curled for a bearded one) and an optional curled beard and moustache. Shading does the rest.
const _heads = new Map();
export function headGeo({ female = false, beard = false, seed = 1 } = {}) {
  const key = (female ? 'f' : 'm') + (beard ? 'b' : '') + seed; if (_heads.has(key)) return _heads.get(key);
  const geo = new THREE.SphereGeometry(1, 48, 36), p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const G = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) * (x - cx) / (sx * sx) + (y - cy) * (y - cy) / (sy * sy)));
  const sm = (a, b, t) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const fk = female ? .7 : 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), f = sm(.05, .5, z), lon = Math.atan2(x, z);
    let d = 0, cav = 0;
    // face: brow, sockets (eyeballs and lids left standing), nose with alae, cheekbones, parted lips, chin, ears
    d += .1 * fk * G(x, y, 0, .3, .52, .08) * f;
    const sock = G(ax, y, .3, .1, .15, .1) * f; d -= .16 * sock; cav += .5 * sock;
    const eye = G(ax, y, .29, .08, .08, .055) * f; d += .1 * eye; cav -= .35 * eye;
    d += .04 * G(ax, y, .29, .15, .1, .025) * f; d -= .02 * G(ax, y, .3, .015, .1, .02) * f;
    const nose = (.13 * G(x, y, 0, .04, .06, .15) + .27 * G(x, y, 0, -.22, .08, .12) + .1 * G(x, y, 0, -.36, .085, .055)) * f * (female ? .85 : 1); d += nose;
    d += .07 * G(ax, y, .105, -.36, .05, .045) * f; const nost = G(ax, y, .07, -.43, .035, .02) * f; d -= .05 * nost; cav += .6 * nost;
    d += .08 * G(ax, y, .44, -.1, .16, .13) * f;
    const hol = G(ax, y, .32, -.33, .12, .13) * f; d -= .05 * hol * (1 - fk * .5); cav += .18 * hol;
    const nl = G(ax, y, .2, -.42, .04, .1) * f; cav += .3 * nl; // naso-labial fold
    d += .08 * G(x, y, 0, -.5, .2, .05) * f; const mg = G(x, y, 0, -.565, .22, .018) * f; d -= .07 * mg; cav += .7 * mg; d += .075 * G(x, y, 0, -.62, .16, .045) * f;
    const cg = G(x, y, 0, -.73, .14, .03) * f; d -= .03 * cg; cav += .25 * cg;
    d += .13 * fk * G(x, y, 0, -.87, .2, .12) * f;
    const ear = sm(.75, .95, ax), earB = G(z, y, -.08, .0, .12, .24) * ear; d += .16 * earB; cav += .35 * G(z, y, -.05, .02, .05, .12) * ear;
    // hair: a raised cap with a sharp edge at the hairline (dipping at the temples), waved (female) or curled
    const hairline = .48 - .14 * G(ax, 0, .45, 0, .2, 1) - .6 * sm(.1, -.6, z);
    const hm = sm(hairline - .04, hairline + .03, y) * sm(-.98, -.6, y);
    if (hm > 0) {
      const wave = female ? Math.sin(lon * 10 + y * 2.5) : Math.sin(x * 21 + y * 8) * Math.sin(y * 19 - z * 11);
      d += hm * (female ? .12 + .045 * wave + .05 * G(ax, y, .72, .05, .3, .35) : .11 + .06 * Math.max(0, wave));
      cav += hm * (female ? .28 * Math.max(0, -wave) : .32 * Math.max(0, -wave) + .08);
    }
    if (beard) { // beard over jaw and chin, moustache over the upper lip, the lower lip left free
      const bm = sm(-.22, -.48, y) * sm(-.55, -.12, z) * (1 - .92 * G(x, y, 0, -.6, .15, .07)), curl = Math.sin(x * 23 + y * 9) * Math.sin(y * 21 + z * 7);
      d += bm * (.24 + .07 * Math.max(0, curl)) + .1 * G(ax, y, .14, -.48, .15, .045) * f + .12 * G(x, y, 0, -1, .3, .22) * f;
      cav += bm * .3 * Math.max(0, -curl) + .25 * G(ax, y, .26, -.52, .05, .05) * f;
    }
    cav += .3 * sm(-.75, -1, y) * sm(0, .6, z); // shadow under the chin
    const sx = .8 * (1 - .2 * sm(-.2, -1, y)), sy = female ? 1.1 : 1.14, sz = .95, zf = 1 + .09 * sm(-.3, -.9, y) * f;
    p.setXYZ(i, x * (1 + d) * sx, y * (1 + d) * sy, z * (1 + d) * sz * zf);
    const k = clamp(1 - cav, .38, 1.08); col[i * 3] = k; col[i * 3 + 1] = k * (.97 + .03 * k); col[i * 3 + 2] = k * (.92 + .08 * k);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals(); _heads.set(key, geo); return geo;
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
  const geo = bookGeo().clone(), n = items.length, im = new THREE.InstancedMesh(geo, bmat('spines'), n), va = new Float32Array(n), c = new THREE.Color();
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
function caseSection(A, books, M, F, x0, x1, y0, y1, D, r, { base = false, niche = null, cornice = true, pitch = .36 } = {}) {
  const car = bmat(F.car), back = bmat(F.back), trim = bmat(F.trim), plinth = bmat(F.plinth), W = x1 - x0, cx = (x0 + x1) / 2;
  const B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), M.clone().multiply(Mx(x, y, z)));
  const cH = cornice ? .16 : 0, top = y1 - cH, st = .045;
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
    B(nm, cx, (yd + nt) / 2, .012, W, nt - yd, .024);
    B(back, cx, (yd + nt) / 2, .03, W - .16, nt - yd - .2, .012);
    [[0, nt - .1, W - .14, .014], [0, yd + .1, W - .14, .014], [-(W - .16) / 2, (yd + nt) / 2, .014, nt - yd - .2], [(W - .16) / 2, (yd + nt) / 2, .014, nt - yd - .2]].forEach(([ox, y, a, b]) => B(trim, cx + ox, y, .042, a, b, .01));
    [-1, 1].forEach(s => B(trim, cx + s * (W / 2 - .008), (y0 + nt) / 2, D - .004, .016, nt - y0, .016)); // gilt jamb beads
    if (top - nt < .3) { if (cornice) caseCornice(A, M, F, x0, x1, top, D, true); return; }
    B(car, cx, nt + .025, D / 2, W, .05, D); B(trim, cx, nt + .006, D + .002, W, .012, .008);
    yb = nt + .05;
  }
  // carcass: back, side stiles, shelves with gilt edges, the books
  B(back, cx, (yb + top) / 2, .011, W, top - yb, .022);
  [x0 + st / 2, x1 - st / 2].forEach(x => { B(car, x, (yb + top) / 2, D / 2, st, top - yb, D); B(trim, x, (yb + top) / 2, D + .002, .01, top - yb, .004); });
  const rows = Math.max(1, Math.round((top - yb) / pitch)), p = (top - yb) / rows;
  for (let k = 0; k < rows; k++) {
    const yy = yb + k * p; if (k > 0) { B(car, cx, yy, (D - .01) / 2, W - 2 * st, .022, D - .01); B(trim, cx, yy - .002, D - .008, W - 2 * st, .01, .005); }
    bookRow(books, M, x0 + st, x1 - st, yy + (k > 0 ? .011 : 0), p - .055, D - .03, D - .07, r);
  }
  if (cornice) caseCornice(A, M, F, x0, x1, top, D);
}
function caseCornice(A, M, F, x0, x1, top, D) {
  const car = bmat(F.car), trim = bmat(F.trim), W = x1 - x0, cx = (x0 + x1) / 2;
  const B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), M.clone().multiply(Mx(x, y, z)));
  B(car, cx, top + .035, (D + .02) / 2, W, .07, D + .02);
  A.add(F.trim === 'gilt' ? bmat('eggdart') : car, bandPlane(W, .046, .085), M.clone().multiply(Mx(cx, top + .035, D + .021)));
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
  if (F.inset) { B(trim, s, (fy0 + fy1) / 2, Dp + .004, pp * .7, fy1 - fy0, .008); B(bmat('scag-' + palette), s, (fy0 + fy1) / 2, Dp + .01, pp * .7 - .03, fy1 - fy0 - .03, .006); }
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
function buildWallCases(ctx, { skip = [], niches = [] } = {}) {
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
    kept.forEach(sc => caseSection(A, books, M, F, sc.x0, sc.x1, 0, top, D, r, { base, niche: sc.niche ? { top: ctx.nicheTop, dado: dadoH } : null }));
    piers.forEach(s => { if (kept.some(sc => Math.abs(sc.x1 - (s - pp / 2)) < .01 || Math.abs(sc.x0 - (s + pp / 2)) < .01) && !userBlocks.some(([a, b]) => overlaps(s - pp / 2, s + pp / 2, a, b))) casePier(A, M, F, s, pp, 0, top - .16, D, palette); });
    if (piers.length) ctx.pierFronts[W.name] = piers;
    // the gallery tier: shelves between the shell's pilasters, shallower, no cupboards
    if (yg != null && gWalls.has(W.name)) {
      const n = W.piers.length - 1, tP = gWalls.has(NEXT[W.name]) ? ctx.gd : 0, tM = gWalls.has(PREV[W.name]) ? ctx.gd : 0;
      for (let i = 0; i < n; i++) {
        let a = W.pil[i] + ctx.pw / 2 + .015, b = W.pil[i + 1] - ctx.pw / 2 - .015; if (i === 0 && tM) a = Math.max(a, -L / 2 + .32); if (i === n - 1 && tP) b = Math.min(b, L / 2 - .32); if (b - a < .3) continue;
        const k = Math.max(1, Math.round((b - a) / 1.05));
        for (let j = 0; j < k; j++) caseSection(A, books, M, F, a + (b - a) * j / k, a + (b - a) * (j + 1) / k, yg + .02, yE - .04, .3, r, { pitch: .4 });
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

export function makeBaroqueShell({ w = 14, d = 12, h = 6, windowWall = 'back', door = true, palette = 'rose', floor = 'diagonal', gallery = 'auto', atlantes = 'auto', bay = 3.2, avoid = null, chandeliers = true, frescoSeed = 1, cases = false, caseSkip = [], niches = [] } = {}) {
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
      [-1, 1].forEach(sd => P(new THREE.BoxGeometry(.024, sh, pd + .004), gilt, sd * (pw / 2 - .012), baseH + sh / 2, (pd + .004) / 2));
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
    const F = marbleFloor(floor, clamp(Math.min(w, d) / 16, .5, .8), floor === 'cubes' ? ['cream', 'warmgrey', 'red'] : ['cream', 'warmgrey']);
    const fm = new THREE.MeshPhysicalMaterial({ map: F.map, roughnessMap: F.rough, roughness: 1, clearcoat: .6, clearcoatRoughness: .13, envMapIntensity: 1.0 });
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / F.span[0] + .5, -p.getZ(i) / F.span[1] + .5);
    const floorM = new THREE.Mesh(geo, fm); floorM.receiveShadow = true; floorM.name = 'floor'; floorM.userData.floor = true; g.add(floorM);
  }
  // ---- door: double door, gilt-beaded frame, hood and cartouche ----
  if (door) {
    const W = walls[1], M = WM(W), D = (mat, geo, x, y, z) => A.add(mat, geo, M.clone().multiply(Mx(x, y, z)));
    const wn = bmat('walnut'), wd = bmat('walnut-dark'), lw = doorW / 2 - .01;
    [-1, 1].forEach(sd => {
      const cx = sd * doorW / 4; D(wn, new THREE.BoxGeometry(lw, doorH, .07), cx, doorH / 2, .035);
      [[.2, .26], [.56, .3], [.84, .12]].forEach(([fy, fh]) => { const ph = doorH * fh, py = doorH * fy; D(wd, new THREE.BoxGeometry(lw - .16, ph, .03), cx, py, .085); D(gilt, new THREE.BoxGeometry(lw - .12, .018, .034), cx, py + ph / 2 + .01, .085); D(gilt, new THREE.BoxGeometry(lw - .12, .018, .034), cx, py - ph / 2 - .01, .085); D(gilt, new THREE.BoxGeometry(.018, ph + .02, .034), cx - (lw - .12) / 2, py, .085); D(gilt, new THREE.BoxGeometry(.018, ph + .02, .034), cx + (lw - .12) / 2, py, .085); });
      D(gilt, new THREE.SphereGeometry(.035, 12, 10), sd * .1, doorH * .48, .11); D(gilt, new THREE.BoxGeometry(.05, .16, .02), sd * .1, doorH * .48, .075);
    });
    D(stucco, new THREE.BoxGeometry(.22, doorH + .22, .12), -doorW / 2 - .11, (doorH + .22) / 2, .06); D(stucco, new THREE.BoxGeometry(.22, doorH + .22, .12), doorW / 2 + .11, (doorH + .22) / 2, .06);
    D(stucco, new THREE.BoxGeometry(doorW + .44, .22, .12), 0, doorH + .11, .06);
    D(gilt, new THREE.BoxGeometry(.03, doorH + .02, .13), -doorW / 2 - .015, doorH / 2, .065); D(gilt, new THREE.BoxGeometry(.03, doorH + .02, .13), doorW / 2 + .015, doorH / 2, .065); D(gilt, new THREE.BoxGeometry(doorW + .06, .03, .13), 0, doorH + .015, .065);
    D(stucco, new THREE.BoxGeometry(doorW + .7, .14, .3), 0, doorH + .29, .15); D(gilt, new THREE.BoxGeometry(doorW + .74, .04, .32), 0, doorH + .38, .16);
    const cs = Math.min(.7, (gWalls.has('front') ? yg - .2 : yE) - doorH - .5); if (cs > .25) { const cg = new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .05, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2, curveSegments: 10 }); A.add(gilt, cg, M.clone().multiply(Mx(0, doorH + .42 + cs / 2, .05, 0, 0, 0, cs * .9, cs, 1))); A.add(bmat('scag-' + palette), new THREE.CircleGeometry(.24, 32), M.clone().multiply(Mx(0, doorH + .42 + cs / 2, .125, 0, 0, 0, cs * .9, cs, 1))); }
  }
  // ---- atlantes (Metten): pairs carrying the entablature beside the central window and the door ----
  if (useAtl) {
    const st = bmat('statuary');
    walls.forEach(W => {
      const isWin = W.name === windowWall, isDoor = door && W.name === 'front' && !gWalls.has('front'); if (!isWin && !isDoor) return;
      const M = WM(W); let pair;
      if (isWin) { const n = W.piers.length - 1; if (n < 3) return; const k = (n - 1) >> 1; pair = [W.piers[k], W.piers[k + 1]]; }
      else { const cand = W.pil.filter(s => Math.abs(s) >= doorW / 2 + .3 + pw / 2); const l = Math.max(...cand.filter(s => s < 0)), r = Math.min(...cand.filter(s => s > 0)); if (!isFinite(l) || !isFinite(r)) return; pair = [l, r]; }
      pair.forEach((s, j) => {
        const pH = clamp(yE * .2, .7, 1.1), M0 = M.clone().multiply(Mx(s, 0, .34));
        pedestal(A, M0, .7, .62, pH, 'scag-' + palette);
        const Hf = yE - pH - .2; if (Hf < 1) return;
        const FM = M0.clone().multiply(Mx(0, pH, -.02, 0, j ? -.1 : .1, 0, Hf * .82, Hf, Hf * .82));
        atlasFigure((geo, m) => A.add(st, geo, FM.clone().multiply(m)), j ? -1 : 1, { herm: true, addTerm: (geo, m) => A.add(scag, geo, FM.clone().multiply(m)), addGilt: (geo, m) => A.add(gilt, geo, FM.clone().multiply(m)), addHead: (geo, m) => A.add(bmat('statuary-head'), geo, FM.clone().multiply(m)) });
        A.add(gilt, new THREE.BoxGeometry(.62, .2, .52), M.clone().multiply(Mx(s, yE - .1, .3)));
        A.add(stucco, new THREE.BoxGeometry(.7, E * .34 - .004, .6), M.clone().multiply(Mx(s, yE + E * .17, .3)));
        A.add(scag, new THREE.BoxGeometry(.66, E * .28 - .004, .56), M.clone().multiply(Mx(s, yE + E * .48, .28)));
        A.add(stucco, new THREE.BoxGeometry(.84, E * .26 - .004, .72), M.clone().multiply(Mx(s, yE + E * .75, .36)));
        A.add(gilt, new THREE.BoxGeometry(.88, E * .06 - .004, .75), M.clone().multiply(Mx(s, yE + E * .91, .375)));
        const wp = V(s, 0, .34).applyMatrix4(M); info.obstacles.push({ x: wp.x, z: wp.z, r: .5, kind: 'atlas' });
      });
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
  // ---- sconces on the pilasters, chandeliers under the domes ----
  walls.forEach(W => {
    const M = WM(W), isDoor = door && W.name === 'front';
    const atlS = useAtl && W.name === windowWall && W.piers.length >= 4 ? [W.piers[(W.piers.length - 2) >> 1], W.piers[((W.piers.length - 2) >> 1) + 1]] : [];
    let y = gWalls.has(W.name) ? Math.min(yg + 1.5, yE - .4) : clamp(yE - .95, 2.35, 3.6), z = pd;
    if (cases && !gWalls.has(W.name) && !(W.name === windowWall && y > caseTops.win + .15)) { y = Math.min(y, caseTops.low - .55); z = CD + .035; } // on the case pilasters
    W.pil.slice(1, -1).forEach(s => { if (atlS.includes(s) || (isDoor && Math.abs(s) < doorW / 2 + .3 + pw / 2)) return; if (useAtl && isDoor && !gWalls.has('front')) return; sconce(FX, M.clone().multiply(Mx(s, y, z)), flames); });
  });
  const lights = new THREE.Group(); lights.name = 'lights'; g.add(lights); g.userData.lights = lights;
  const hasWin = !!g.userData.window;
  lights.add(new THREE.HemisphereLight(0xfff1de, 0x4a3828, hasWin ? .36 : .5));
  const chs = chandeliers ? domes.slice() : []; if (chs.length > 3) { const k = chs.length; chs.splice(0, k, chs[0], chs[k >> 1], chs[k - 1]); }
  const sCh = clamp(h / 6, .75, 1.35), yc = clamp(Math.min(yE - .5, h * .62), 2.5, h - 1);
  chs.forEach(D => {
    chandelier(FX, Mx(D.x, yc, D.z), sCh, flames);
    FX.add(gilt, new THREE.CylinderGeometry(.012, .012, h + D.rise - yc - .3 * sCh, 6), Mx(D.x, (h + D.rise + yc + .3 * sCh) / 2, D.z));
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
    if (sp.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); geo.computeVertexNormals(); geo.applyMatrix4(M); const sh = new THREE.Mesh(geo, bmat('shaft')); sh.name = 'sun-shafts'; sh.renderOrder = 5; sh.castShadow = false; sh.receiveShadow = false; g.add(sh); }
  }
  // ---- merge everything ----
  A.build(g, { name: 'shell-' }).forEach(m => { if (m.material.userData.bmat === 'gilt' || m.material.userData.bmat === 'eggdart') m.castShadow = false; });
  const fxMeshes = FX.build(g, { name: 'fx-' }); fxMeshes.forEach(m => { m.castShadow = false; });
  if (flames.length) { // one Points draw call for every candle glow, with a gentle flicker
    const pg = new THREE.BufferGeometry().setFromPoints(flames);
    const pm = new THREE.PointsMaterial({ map: radialGlow('255,196,130'), size: .55, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55, color: 0xffd2a0 });
    const pts = new THREE.Points(pg, pm); pts.name = 'candle-glow'; pts.renderOrder = 6; g.add(pts);
    pts.onBeforeRender = () => { const tt = performance.now() * .001; pm.size = .55 * (1 + .05 * Math.sin(tt * 7.3) + .03 * Math.sin(tt * 13.1)); lights.children.forEach((L, i) => { if (L.isPointLight && L.userData.base) L.intensity = L.userData.base * (1 + .035 * Math.sin(tt * 8.7 + i * 2.1) + .02 * Math.sin(tt * 15.3 + i)); }); };
  }
  g.traverse(o => { if (o.isMesh && !o.userData.floor) o.userData.shell = true; });
  g.userData.baroque = info;
  // ---- built-in wall bookcases, rebuildable on their own when the user's bookcases or the scroll niches change ----
  if (cases) {
    const ctx = { walls, WM, D: CD, yLow: caseTops.low, yGal: caseTops.gal, yWin: caseTops.win, yg: galleryOn ? yg : null, yE, gWalls, windowWall, door, doorW, palette, pp: clamp(pw * .8, .26, .42), pw, gd, dadoH,
      nicheTop: 3.02, fixedBlocks: info.obstacles.map(o => ({ x: o.x, z: o.z, r: o.r })), cases, pierFronts: {} };
    let cur = null, key = '';
    g.userData.setCases = ({ skip = [], niches: ni = [] } = {}) => {
      const k = JSON.stringify([skip.map(f => [f.x, f.z, f.w, f.d, f.rot, f.r].map(v => v == null ? 0 : +(+v).toFixed(2))), ni.map(p => [+p.x.toFixed(2), +p.z.toFixed(2)])]);
      if (k === key && cur) return cur; key = k;
      if (cur) { cur.removeFromParent(); cur.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      cur = buildWallCases(ctx, { skip, niches: ni }); g.add(cur); info.books = cur.userData.books; return cur;
    };
    g.userData.setCases({ skip: caseSkip, niches });
  }
  g.userData.dispose = () => g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); // geometry only: materials/textures are shared and cached
  return g;
}
