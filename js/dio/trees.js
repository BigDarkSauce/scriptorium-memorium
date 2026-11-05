// Believable procedural trees for the scene-spec kinds tree{h} (broadleaf), pine{h} (conifer) and bush{h}.
//
//  • Wood: a tapered, slightly bent trunk with a root flare and a few tapering branches (broadleaf) or a straight
//    spire (pine), one merged geometry, AAA 'bark' material (js/gfx/aaa.js: world-space triplanar relief).
//  • Foliage: noise-displaced icosphere clumps (per-vertex colour: sky-facing light, inner shade, hue jitter) fringed by
//    alpha-tested leaf cards (sprays of leaves / needles drawn once on a canvas atlas), one merged geometry and one
//    material per tree. Pines: whorled tiers of drooping skirts with needle ribbons; bushes: low clumps, small leaves.
//  • Lighting: the foliage material wraps the diffuse term (light reaches past the terminator, as through a leaf
//    canopy) and adds a forward-scattered translucency lobe when the sun is behind the leaves (thin-leaf transmission
//    without three's transmission pass); shadows from the cascades are honoured (the light colour already carries them),
//    leaf cards cast cut-out shadows (three's depth material copies map + alphaTest).
//  • Cost: geometries are built once per kind × variant (4 variants, picked by the body's seed; plus a per-body mirror,
//    yaw and ±12 % size jitter so no two look alike) and shared by every scene (userData.shared: never disposed);
//    materials are cached per scene build (the materialize patch binds a material to its scene's uniforms).
//    Two draw calls per tree (+ shadow passes); ~2.4k triangles broadleaf, ~1.6k pine, ~1.9k bush (see TREE_STATS).
//    treeForest() places many trees as InstancedMeshes (two draw calls per kind × variant for a whole forest).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterial } from '../gfx/materials.js';
import { mulberry, makeNoise } from '../util.js';

export const TREE_KINDS = ['tree', 'pine', 'bush'], TREE_VARIANTS = 4;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V3(0, 1, 0);

// ---------------------------------------------------------------- leaf atlas (canvas, drawn once) -------------------
// UV regions (v up): broad-leaf spray u∈[0,.5] v∈[.5,1]; needle spray u∈[.5,1] v∈[.5,1]; small-leaf spray u∈[.5,1]
// v∈[0,.5]; opaque leaf mass u∈[0,.25] v∈[0,.5]; opaque needle mass u∈[.25,.5] v∈[0,.5]. Colours are light and nearly
// neutral greens: the material colour (the spec's colour) and the vertex colours tint them.
const R = { broad: [0, .5, .5, 1], needle: [.5, .5, 1, 1], small: [.5, 0, 1, .5], mass: [0, 0, .25, .5], nmass: [.25, 0, .5, .5] };
let ATLAS = null;
function leafAtlas() {
  if (ATLAS) return ATLAS;
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = mulberry(4242);
  const shade = (l, a = 1) => `rgba(${Math.round(150 + 90 * l)},${Math.round(175 + 75 * l)},${Math.round(115 + 85 * l)},${a})`;
  const leaf = (x, y, len, wid, ang, l) => {   // an ovate leaf with a darker midrib, stem at (x, y)
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(-wid, 0, wid, 0); gr.addColorStop(0, shade(l * .7)); gr.addColorStop(.5, shade(l)); gr.addColorStop(1, shade(l * .8));
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * .25, wid * .8, -len * .8, 0, -len); g.bezierCurveTo(-wid * .8, -len * .8, -wid, -len * .25, 0, 0); g.fill();
    g.strokeStyle = 'rgba(70,95,50,.55)'; g.lineWidth = Math.max(1, wid * .12); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * .92); g.stroke(); g.restore();
  };
  const twig = (x0, y0, x1, y1, w) => { w *= .6; g.strokeStyle = 'rgba(110,105,70,1)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (r() - .5) * 20, (y0 + y1) / 2, x1, y1); g.stroke(); };
  const H = S / 2;
  // broad-leaf spray (top left): a twig with alternating ovate leaves and a terminal one
  for (let k = 0; k < 2; k++) { const ox = k * 0, cx = ox + H / 2; twig(cx, H - 8, cx + (r() - .5) * 30, 40, 7);
    for (let i = 0; i < 9; i++) { const t = .12 + i * .095, y = H - 8 - t * (H - 60), s = i % 2 ? 1 : -1; leaf(cx + s * 4, y, 120 - i * 6, 44 - i * 2, s * (.9 + r() * .4), .55 + r() * .45); }
    leaf(cx, 46, 110, 40, (r() - .5) * .3, .9); }
  // needle spray (top right): a drooping twig with fishbone needles leaning to the tip
  { const x0 = H + H / 2; twig(x0, H - 6, x0, 18, 6);
    for (let i = 0; i < 70; i++) { const t = i / 70, y = H - 14 - t * (H - 40), L = 70 * (1 - t * .55); [-1, 1].forEach(s => { g.strokeStyle = shade(.45 + r() * .5); g.lineWidth = 3.2; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + s * L * (.8 + r() * .3), y - L * .55); g.stroke(); }); } }
  // small-leaf spray (bottom right): forked twigs with many small round leaves
  { const x0 = H + H / 2, yb = S - 6; twig(x0, yb, x0 - 60, H + 40, 5); twig(x0, yb - 90, x0 + 80, H + 60, 4); twig(x0 - 10, yb - 40, x0 - 120, H + 140, 3);
    for (let i = 0; i < 120; i++) { const a = r() * Math.PI * 2, rr = 40 + r() * 190, x = x0 + Math.cos(a) * rr * .55, y = yb - 40 - Math.abs(Math.sin(a)) * rr * .9 - r() * 60; leaf(x, y, 34 + r() * 18, 15 + r() * 6, (r() - .5) * 3, .5 + r() * .5); } }
  // opaque leaf mass (bottom left, left half) and needle mass (right half): filled, then covered with leaves / strokes
  g.fillStyle = shade(.25); g.fillRect(0, H, H / 2, H); g.fillStyle = shade(.2); g.fillRect(H / 2, H, H / 2, H);
  g.save(); g.beginPath(); g.rect(0, H, H / 2, H); g.clip(); for (let i = 0; i < 2600; i++) leaf(r() * H / 2, H + r() * H, 13 + r() * 9, 6 + r() * 3, r() * 6.3, .15 + r() * .85); g.restore();
  g.save(); g.beginPath(); g.rect(H / 2, H, H / 2, H); g.clip(); for (let i = 0; i < 4200; i++) { const x = H / 2 + r() * H / 2, y = H + r() * H, a = r() * 6.3, L = 9 + r() * 9; g.strokeStyle = shade(.1 + r() * .9); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true; t.name = 'leaf-atlas';
  return (ATLAS = t);
}
const uvIn = (reg, u, v) => [reg[0] + (reg[2] - reg[0]) * u, reg[1] + (reg[3] - reg[1]) * v];

// ---------------------------------------------------------------- geometry builders ---------------------------------
// tapered tube along a curve: radius(t), seg sides, n rings; uvs follow the bark (not needed: AAA bark is world-space)
function tube(curve, radius, seg = 8, n = 8) {
  const pos = [], idx = [], fr = curve.computeFrenetFrames(n, false);
  for (let i = 0; i <= n; i++) { const t = i / n, p = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], rr = radius(t);
    for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(p.x + rr * (c * N.x + s * B.x), p.y + rr * (c * N.y + s * B.y), p.z + rr * (c * N.z + s * B.z)); } }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c2 = a + seg, d = b + seg; idx.push(a, c2, b, b, c2, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// a displaced icosphere clump (detail 2: 320 triangles), flattened underneath
function clump(c, r, noise, off, squash = .8) {
  let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const P = g.attributes.position, v = V3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i);
    const n = 1 + .45 * noise.fbm(v.x * 1.9 + off, v.y * 1.9, v.z * 1.9 - off, 3) + .22 * noise(v.x * 5 + off, v.y * 5, v.z * 5);
    v.multiplyScalar(n); if (v.y < -.25) v.y = -.25 + (v.y + .25) * .35; P.setXYZ(i, c.x + v.x * r, c.y + v.y * r * squash, c.z + v.z * r); }
  g.computeVertexNormals(); return g;
}
// a quad card: base at p, growing along dir (unit), rolled by `roll`; w × h; uv region reg
function card(p, dir, roll, w, h, reg, bend = .25, cols = 2) {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, dir), qr = new THREE.Quaternion().setFromAxisAngle(dir, roll); q.premultiply(qr);
  const pos = [], uv = [];
  // 2 × 2 segments, bent backwards along its length (a spray droops)
  const C = cols + 1;
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= cols; j++) { const u = j / cols, t = i / 2; const lp = V3((u - .5) * w, t * h, -bend * h * t * t).applyQuaternion(q).add(p); pos.push(lp.x, lp.y, lp.z); uv.push(...uvIn(reg, u, t)); }
  const idx = []; for (let i = 0; i < 2; i++) for (let j = 0; j < cols; j++) { const a = i * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// planar uvs into an opaque mass region (continuous: no seam)
function massUV(g, reg, c, r) {
  const P = g.attributes.position, uv = [];
  for (let i = 0; i < P.count; i++) { const x = (P.getX(i) - c.x) / r, y = (P.getY(i) - c.y) / r, z = (P.getZ(i) - c.z) / r; uv.push(...uvIn(reg, .5 + .22 * x + .1 * z, .5 + .25 * y + .12 * z)); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
// vertex colours: sky-facing and outer surfaces lit, inner and lower ones in shade; a per-clump hue jitter
function tint(g, crownC, crownR, hue, rng) {
  const P = g.attributes.position, N = g.attributes.normal, col = [], c = new THREE.Color(), p = V3(), n = V3();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    const out = Math.min(1, p.clone().sub(crownC).length() / crownR), up = n.y * .5 + .5, h = Math.min(1, Math.max(0, (p.y - (crownC.y - crownR)) / (2 * crownR)));
    const L = (.42 + .34 * up + .24 * out) * (.75 + .25 * h) * (.94 + .12 * rng());
    c.setRGB(L * (1 + hue * .6), L, L * (1 - hue * .5)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
const prep = g => { if (g.index) g = g.toNonIndexed(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); return g; };
const woodPrep = g => { g = g.index ? g.toNonIndexed() : g; ['uv', 'color'].forEach(k => g.deleteAttribute(k)); return g; };

// unit-height trees (h = 1; the caller scales by h). Returns { wood, leaf } BufferGeometries.
function buildBroadleaf(seed) {
  const r = mulberry(seed), noise = makeNoise(seed), wood = [], leaf = [];
  const lean = V3((r() - .5) * .12, 0, (r() - .5) * .12), top = V3(lean.x, .56 + r() * .06, lean.z);
  const trunk = new THREE.CatmullRomCurve3([V3(0, -.02, 0), V3(lean.x * .2 + (r() - .5) * .03, .2, lean.z * .2 + (r() - .5) * .03), V3(lean.x * .6, .4, lean.z * .6), top]);
  const r0 = .036 + r() * .008; wood.push(tube(trunk, t => r0 * (1 - .55 * t) * (1 + 1.1 * Math.pow(Math.max(0, 1 - t * 9), 2)), 9, 9));
  const crownC = V3(top.x, .7, top.z), crownR = .34, ends = [];
  const nb = 4 + Math.floor(r() * 2);
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2 + r() * .8, t0 = .55 + r() * .35, base = trunk.getPointAt(t0), L = .2 + r() * .1;
    const dir = V3(Math.cos(a), .75 + r() * .5, Math.sin(a)).normalize(), mid = base.clone().addScaledVector(dir, L * .5).add(V3(0, .03, 0)), end = base.clone().addScaledVector(dir, L);
    wood.push(tube(new THREE.CatmullRomCurve3([base, mid, end]), t => r0 * .42 * (1 - .7 * t), 6, 4)); ends.push(end);
  }
  ends.push(top.clone().add(V3(0, .1, 0)));
  // crown clumps: one at each branch end, the top, and fill-ins
  const cl = ends.slice(0, -1).map(e => ({ c: e.clone().add(V3(0, .05, 0)), r: .11 + r() * .04 })).slice(0, 4);
  // the upper crown: a dome of clumps over the branch ends (a broadleaf crown is rounder than its scaffold)
  cl.push({ c: crownC.clone().add(V3((r() - .5) * .08, .19, (r() - .5) * .08)), r: .15 + r() * .03 });
  while (cl.length < 6) { const a = r() * 6.28; cl.push({ c: crownC.clone().add(V3(Math.cos(a) * .13, .06 + r() * .1, Math.sin(a) * .13)), r: .12 + r() * .04 }); }
  cl.forEach((k, i) => { const hue = (r() - .5) * .14; let g = clump(k.c, k.r, noise, i * 3.7); g = massUV(g, R.mass, k.c, k.r); leaf.push(tint(g, crownC, crownR, hue, r)); k.hue = hue; });
  // leaf cards on the clump surfaces (outward and upward), the fringe of the silhouette
  for (let i = 0; i < 140; i++) { const k = cl[i % cl.length], d = V3(r() - .5, r() * .8 - .2, r() - .5).normalize(), p = k.c.clone().addScaledVector(d, k.r * (.6 + r() * .5));
    const dir = d.clone().add(V3((r() - .5) * .7, .3, (r() - .5) * .7)).normalize(), s = .12 + r() * .08;
    leaf.push(tint(card(p, dir, r() * 6.28, s * .75, s, R.broad, .25, 1), crownC, crownR, k.hue, r)); }
  return { wood: mergeGeometries(wood.map(woodPrep)), leaf: mergeGeometries(leaf.map(prep)) };
}
function buildPine(seed) {
  const r = mulberry(seed), noise = makeNoise(seed), wood = [], leaf = [];
  const H = .98, bend = V3((r() - .5) * .04, 0, (r() - .5) * .04);
  const trunk = new THREE.CatmullRomCurve3([V3(0, -.02, 0), V3(bend.x, H * .5, bend.z), V3(bend.x * 1.4, H, bend.z * 1.4)]);
  const r0 = .03 + r() * .006; wood.push(tube(trunk, t => Math.max(.003, r0 * (1 - .92 * t) * (1 + .9 * Math.pow(Math.max(0, 1 - t * 10), 2))), 8, 8));
  const crownC = V3(0, .55, 0), crownR = .45, T = 8 + Math.floor(r() * 2), y0 = .14 + r() * .04;
  for (let i = 0; i < T; i++) {
    const f = i / (T - 1), y = y0 + (H - .1 - y0) * Math.pow(f, .9), Rt = .03 + .28 * Math.pow(1 - f, .95) * (.9 + r() * .2), ax = trunk.getPointAt(Math.min(1, y / H)), hue = (r() - .5) * .1;
    const nbr = Math.max(4, 9 + Math.floor(r() * 2) - Math.round(f * 5)), ph = r() * 6.28;
    // the whorl's skirt: an open cone drooping from the trunk, its rim lobed under each branch and torn by noise (dark:
    // it is the shaded inside of the tier; the needle ribbons carry the light)
    const sk = new THREE.ConeGeometry(Rt * .8, Rt * .8, 20, 2, true); sk.deleteAttribute('normal'); sk.deleteAttribute('uv');
    const P = sk.attributes.position, v = V3();
    for (let j = 0; j < P.count; j++) { v.fromBufferAttribute(P, j); const rr = Math.hypot(v.x, v.z) / (Rt * .8 + 1e-6), a = Math.atan2(v.z, v.x);
      const lobe = .72 + .4 * Math.pow(Math.abs(Math.cos((a + ph) * nbr / 2)), .6), n = lobe * (1 + .28 * noise(Math.cos(a) * 3 + i, Math.sin(a) * 3, i * 1.3));
      P.setXYZ(j, ax.x + v.x * n, ax.y + v.y + Rt * .25 - rr * rr * Rt * .3 * n, ax.z + v.z * n); }
    sk.computeVertexNormals(); const g2 = tint(massUV(sk, R.nmass, ax, Rt), crownC, crownR, hue, r); const C2 = g2.attributes.color; for (let j = 0; j < C2.count; j++) C2.setXYZ(j, C2.getX(j) * .7, C2.getY(j) * .72, C2.getZ(j) * .7); leaf.push(g2);
    // drooping branches along the lobes: two crossed needle ribbons each, reaching past the skirt
    for (let b = 0; b < nbr; b++) { const a = b / nbr * Math.PI * 2 - ph + (r() - .5) * .25, out = V3(Math.cos(a), 0, Math.sin(a)), L = Rt * (1.1 + r() * .3), droop = -.3 - r() * .3;
      const dir = out.clone().add(V3(0, droop * .6, 0)).normalize(), base = ax.clone().addScaledVector(out, .01).add(V3(0, Rt * .15, 0));
      [0, Math.PI / 2.4].forEach(roll => leaf.push(tint(card(base, dir, Math.PI / 2 + roll + (r() - .5) * .3, L * .62, L, R.needle, -.2), crownC, crownR, hue, r))); }
  }
  // the leader at the top
  leaf.push(tint(card(V3(bend.x * 1.4, H - .1, bend.z * 1.4), Y.clone(), r() * 3, .06, .14, R.needle, .05), crownC, crownR, 0, r));
  return { wood: mergeGeometries(wood.map(woodPrep)), leaf: mergeGeometries(leaf.map(prep)) };
}
function buildBush(seed) {
  const r = mulberry(seed), noise = makeNoise(seed), wood = [], leaf = [];
  const crownC = V3(0, .32, 0), crownR = .5, cl = [];
  const n = 5;
  for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r() * .6, d = .2 + r() * .1; cl.push({ c: V3(Math.cos(a) * d, .2 + r() * .1, Math.sin(a) * d), r: .2 + r() * .07 }); }
  cl.push({ c: V3((r() - .5) * .1, .45, (r() - .5) * .1), r: .24 });
  // a few stems where the clumps meet the ground
  for (let i = 0; i < 3; i++) { const a = r() * 6.28; wood.push(tube(new THREE.CatmullRomCurve3([V3(0, -.02, 0), V3(Math.cos(a) * .08, .12, Math.sin(a) * .08), V3(Math.cos(a) * .16, .22, Math.sin(a) * .16)]), t => .02 * (1 - .6 * t), 5, 3)); }
  cl.forEach((k, i) => { const hue = (r() - .5) * .16; k.hue = hue; leaf.push(tint(massUV(clump(k.c, k.r, noise, i * 2.3, .72), R.mass, k.c, k.r), crownC, crownR, hue, r)); });
  for (let i = 0; i < 120; i++) { const k = cl[i % cl.length], d = V3(r() - .5, r() * .9 - .1, r() - .5).normalize(), p = k.c.clone().addScaledVector(d, k.r * (.55 + r() * .35));
    const dir = d.clone().add(V3((r() - .5) * .5, .25, (r() - .5) * .5)).normalize(), s = .13 + r() * .06;
    leaf.push(tint(card(p, dir, r() * 6.28, s, s, R.small, .15, 1), crownC, crownR, k.hue, r)); }
  return { wood: mergeGeometries(wood.map(woodPrep)), leaf: mergeGeometries(leaf.map(prep)) };
}

const GEO = new Map();
export const TREE_STATS = {};
export function treeGeometry(kind, variant) {
  const key = kind + ':' + variant; if (GEO.has(key)) return GEO.get(key);
  const seed = 1301 + variant * 7919 + TREE_KINDS.indexOf(kind) * 104729;
  const G = kind === 'pine' ? buildPine(seed) : kind === 'bush' ? buildBush(seed) : buildBroadleaf(seed);
  [G.wood, G.leaf].forEach(g => { g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.shared = true; g.name = key; });
  TREE_STATS[key] = { woodTris: G.wood.attributes.position.count / 3, leafTris: G.leaf.attributes.position.count / 3 };
  GEO.set(key, G); return G;
}

// ---------------------------------------------------------------- materials ----------------------------------------
// foliage: MeshStandardMaterial + alpha-tested atlas + vertex colours; wrap diffuse and a back-light translucency lobe.
const WRAP_FROM = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;';
// (the specular term keeps the true N·L: GGX's visibility term blows up where N·L = N·V = 0, so a wrapped irradiance
// there gave bloom-blinding speckles on the clump silhouettes; only the diffuse is wrapped, as the difference term)
const WRAP_TO = `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	{ float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + FOL_WRAP ) / ( 1.0 + FOL_WRAP ) );
	  float back = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 ) * 0.7 + saturate( - dot( geometryNormal, directLight.direction ) ) * 0.25;
	  reflectedLight.directDiffuse += directLight.color * ( BRDF_Lambert( material.diffuseColor ) * ( wrapNL - dotNL ) + BRDF_Lambert( material.diffuseColor * vec3( 1.0, 1.1, 0.6 ) ) * back * FOL_TRANS ); }`;
export function foliageMaterial(color = '#4f7a3a') {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(1.25), map: leafAtlas(), alphaTest: .45, side: THREE.DoubleSide, vertexColors: true, roughness: .82, metalness: 0, envMapIntensity: .6 });
  m.defines = { SM_FOLIAGE: '', FOL_WRAP: '0.45', FOL_TRANS: '0.55' };   // own defines: a distinct program key
  m.onBeforeCompile = s => {
    const ch = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (ch.includes(WRAP_FROM)) s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_pars_fragment>', ch.replace(WRAP_FROM, WRAP_TO));
  };
  m.customProgramCacheKey = () => 'foliage';
  m.userData.preset = 'foliage';
  return m;
}
// per-scene material cache: keyed by the scene's params object (one per DioramaScene) or an explicit ctx.matCache
const MATS = new WeakMap();
function matCache(ctx) { if (ctx && ctx.matCache) return ctx.matCache; const k = ctx && ctx.params; if (!k || typeof k !== 'object') return null; let m = MATS.get(k); if (!m) MATS.set(k, m = new Map()); return m; }
function cached(ctx, key, make) { const C = matCache(ctx); if (!C) return make(); if (!C.has(key)) C.set(key, make()); return C.get(key); }
const DEF_COL = { tree: '#4f7a3a', pine: '#2f5a3a', bush: '#4a7238' };

// ---------------------------------------------------------------- the scene-spec shape -----------------------------
// h: overall height as before (tree ≈ h tall with a crown ≈ 0.75 h wide; pine h tall, 0.6 h wide; bush 0.85 h tall).
export function buildTree(kind, shape = {}, matSpec, ctx = {}) {
  const dh = kind === 'bush' ? .6 : kind === 'pine' ? 2.4 : 2, h = +shape.h > 0 ? +shape.h : dh, seed = (ctx.seed >>> 0) || 7, r = mulberry(seed);
  const variant = seed % TREE_VARIANTS, G = treeGeometry(kind, variant);
  const col = (matSpec && matSpec.color) || shape.color || DEF_COL[kind], trunkSpec = (matSpec && matSpec.trunk) || 'bark';
  const wm = cached(ctx, 'wood:' + JSON.stringify(trunkSpec), () => makeMaterial(trunkSpec)), lm = cached(ctx, 'leaf:' + col, () => foliageMaterial(col));
  const g = new THREE.Group(), s = h * (kind === 'bush' ? 1 / .85 : 1), j = 1 + (r() - .5) * .16, flip = r() < .5 ? -1 : 1;
  const wood = new THREE.Mesh(G.wood, wm), leaf = new THREE.Mesh(G.leaf, lm);
  [wood, leaf].forEach(m => { m.scale.set(s * flip, s * j, s); m.rotation.y = r() * Math.PI * 2; m.castShadow = true; m.receiveShadow = true; g.add(m); });
  wood.userData.inkAngle = 60; leaf.userData.noInk = true; leaf.userData.sway = 1; leaf.name = kind + ' foliage'; wood.name = kind + ' wood';
  g.userData.sway = true; g.userData.tree = { kind, variant };
  return g;
}

// ---------------------------------------------------------------- forests (instanced) ------------------------------
// items: [{x, y, z, h, ry?}] → a Group with two InstancedMeshes per variant used (wood + foliage), per-instance colour
// jitter. For backgrounds and hedgerows of built-in models: a 34-tree hedgerow is 8 draw calls instead of 68.
export function treeForest(kind = 'tree', items = [], { color, seed = 1, trunk = 'bark', castShadow = true } = {}) {
  const g = new THREE.Group(); g.name = kind + ' forest'; const r = mulberry(seed), byV = new Map();
  items.forEach((it, i) => { const v = Math.floor(r() * TREE_VARIANTS); if (!byV.has(v)) byV.set(v, []); byV.get(v).push(it); });
  const wm = makeMaterial(trunk), lm = foliageMaterial(color || DEF_COL[kind]), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  byV.forEach((list, v) => {
    const G = treeGeometry(kind, v), W = new THREE.InstancedMesh(G.wood, wm, list.length), L = new THREE.InstancedMesh(G.leaf, lm, list.length);
    list.forEach((it, i) => { const h = (it.h || 2) * (kind === 'bush' ? 1 / .85 : 1); q.setFromAxisAngle(Y, it.ry ?? r() * 6.28); m4.compose(V3(it.x || 0, it.y || 0, it.z || 0), q, V3(h, h * (.92 + r() * .16), h)); W.setMatrixAt(i, m4); L.setMatrixAt(i, m4); c.setRGB(.9 + r() * .2, .92 + r() * .16, .85 + r() * .2); L.setColorAt(i, c); });
    [W, L].forEach(m => { m.castShadow = castShadow; m.receiveShadow = true; m.computeBoundingSphere(); m.userData.noInk = true; g.add(m); });
  });
  return g;
}
