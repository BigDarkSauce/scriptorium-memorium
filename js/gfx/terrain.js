// Terrain field: one height/mask bake shared by everything that sits on a landscape (realism-playbook R1).
//
//  • bakeField(spec) evaluates the height on a regular grid (the same grid the mesh uses, so the mesh, the CPU
//    sampler and the GPU texture agree exactly): fBm meadow + terraces + Gaussian/ridged peaks (polynomial smooth
//    max, no creases) + a river carved along a spline (its water surface computed downhill, a waterfall wherever it
//    drops steeply) + a lake bowl (WG's bowl profile; the level is found from the rim) + flattened pads (a cabin
//    yard). Channels: R = height, G = river mask, B = lake mask, A = slope (tan). The texture is RGBA half float.
//  • field.h(x, z) / field.m(x, z, c) are bilinear CPU samplers (the scene code's old raycast hAt() becomes h()),
//    field.suit(x, z, kind) is the ecology: where grass, flowers, reeds, rocks and trees may grow.
//  • buildTerrain(field, spec) builds the meshes: meadow (AAA meadow) and rock (AAA crag on steep or high ground),
//    sharing one position/normal buffer, quads split along the flatter diagonal; rock owned by a peak body
//    (peaks[i].own = id) is left out and built by that body (shape kind "peak"), so an actor ridge is its own mesh
//    yet seamless with the land.
//  • Fields are stored per scene build (keyed by the scene's params object) so later bodies find them: getField(ctx).
import * as THREE from 'three';
import { makeNoise } from '../util.js';
import { aaaMaterial } from './aaa.js';
import { AAA } from './aaa.js';

const FIELDS = new WeakMap();
export function setField(ctx, f) { const k = ctx && ctx.params; if (k && typeof k === 'object') FIELDS.set(k, f); }
export function getField(ctx) { const k = ctx && ctx.params; return (k && typeof k === 'object' && FIELDS.get(k)) || null; }

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smax = (a, b, k) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return a + (b - a) * h + k * h * (1 - h); };
export const smin = (a, b, k) => -smax(-a, -b, k);
const num = (v, d) => (v == null || !isFinite(+v) ? d : +v);

// grid resolution per quality: cells along the longer side
export const TERRAIN_RES = { low: 150, medium: 260, high: 360 };

// distance from (x, z) to a sampled polyline P = [{x, z, s}] → {d, i, t}
function nearest(P, x, z, bb, pad) {
  if (bb && (x < bb[0] - pad || x > bb[2] + pad || z < bb[1] - pad || z > bb[3] + pad)) return null;
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1), qx = a.x + dx * t - x, qz = a.z + dz * t - z, d = qx * qx + qz * qz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { d: Math.sqrt(best), i: bi, t: bt };
}
function spline(points, n) {
  const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(+p[0], 0, +p[1])), false, 'centripetal');
  const L = c.getLength(), out = [];
  for (let i = 0; i <= n; i++) { const p = c.getPointAt(i / n); out.push({ x: p.x, z: p.z, s: L * i / n }); }
  return out;
}
const bboxOf = P => P.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.z), Math.max(b[2], p.x), Math.max(b[3], p.z)], [1e9, 1e9, -1e9, -1e9]);

export function bakeField(spec = {}, quality = AAA.quality) {
  const w = num(spec.w, 13), d = num(spec.d, 10), noise = makeNoise(num(spec.seed, 3)), amp = num(spec.h, .2) * 2, fq = num(spec.freq, .18);
  const res = num(spec.res, TERRAIN_RES[quality] || TERRAIN_RES.medium), NX = Math.round(w >= d ? res : res * w / d) + 1, NZ = Math.round(d >= w ? res : res * d / w) + 1;
  const minX = -w / 2, minZ = -d / 2, dx = w / (NX - 1), dz = d / (NZ - 1);
  const peaks = (spec.peaks || []).map(p => ({ x: num(p.x, 0), z: num(p.z, 0), r: num(p.r, 2), h: num(p.h, 1), sq: num(p.squash, 1), rot: num(p.rot, 0) * Math.PI / 180, seed: num(p.seed, 5), own: p.own || null, rough: num(p.rough, .3) }));
  const terr = spec.terraces || [];
  // height before the river and lake: meadow fBm, back edge rising, terraces, peaks
  const hp = (x, z) => {
    let h = noise.fbm(x * fq, z * fq, 0, 5) * amp + num(spec.lift, 0);
    if (spec.backRise) h += Math.pow(sstep(spec.backRise[0], spec.backRise[1], z), 2) * spec.backRise[2];
    for (const t of terr) { const kz = sstep(t.z0, t.z1, z), kx = t.x0 == null ? 1 : sstep(t.x0 - .6, t.x0, x) * sstep(t.x1 + .6, t.x1, x); h += t.h * kz * kx * (1 + .25 * noise(x * 1.7, z * 1.7, 9)); }
    for (const p of peaks) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot), u = (x - p.x) * c - (z - p.z) * s, v = ((x - p.x) * s + (z - p.z) * c) * p.sq;
      const r2 = (u * u + v * v) / (p.r * p.r); if (r2 > 4) continue;
      const rid = 1 - Math.abs(noise(x * 1.1 + p.seed, z * 1.1, p.seed)); const det = noise.fbm(x * 2.6 + p.seed, z * 2.6, 3, 3);
      const ph = p.h * Math.exp(-Math.pow(r2, .8) * 1.6) * (1 + p.rough * (rid * rid - .4) + .12 * det);
      h = smax(h, ph, .35);
    }
    return h;
  };
  // ---- river: a spline, its water surface going only downhill, a waterfall where it drops steeply ----
  let river = null;
  if (spec.river && spec.river.points && spec.river.points.length > 1) {
    const R = spec.river, P = spline(R.points, num(R.samples, 140)), wd = R.width || [.1, .24], depth = num(R.depth, .05);
    let surf = 1e9;
    P.forEach((p, i) => { const t = i / (P.length - 1); p.hw = (wd[0] + (wd[1] - wd[0]) * t) / 2; const g = Math.min(hp(p.x, p.z), hp(p.x + .06, p.z), hp(p.x - .06, p.z), hp(p.x, p.z + .06), hp(p.x, p.z - .06)); surf = Math.min(surf - .0006, g - .025); p.y = surf; });
    river = { P, depth, bb: bboxOf(P), fall: null };
  }
  // ---- lake: ellipse with a noisy rim; level from the rim heights; bowl carved down to the bottom ----
  let lake = null;
  if (spec.lake) {
    const L = spec.lake; lake = { x: num(L.x, 0), z: num(L.z, 0), rx: num(L.rx, 1.2), rz: num(L.rz, 1.4), depth: num(L.depth, .38) };
    const rim = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; rim.push(hp(lake.x + Math.cos(a) * lake.rx * .95, lake.z + Math.sin(a) * lake.rz * .95)); }
    rim.sort((a, b) => a - b); lake.level = L.level != null ? +L.level : Math.max(hp(lake.x, lake.z) + .05, rim[0] - .02);   // below the lowest rim point: the lake never spills
    lake.bottom = lake.level - lake.depth;
  }
  if (river) {   // the steepest drop over a short run is the waterfall (lip → foot)
    const P = river.P; let best = 0, bi = -1, K = 4;
    for (let i = 0; i + K < P.length; i++) { const dr = P[i].y - P[i + K].y; if (dr > best) { best = dr; bi = i; } }
    if (best > .12) { let i0 = bi, i1 = bi + K; while (i0 > 0 && P[i0 - 1].y - P[i0].y > .01) i0--; while (i1 < P.length - 1 && P[i1].y - P[i1 + 1].y > .01) i1++; river.fall = { i0, i1, drop: P[i0].y - P[i1].y }; }
  }
  const pads = (spec.pads || []).map(p => ({ x: +p[0], z: +p[1], r: num(p[2], .6), y: p[3] }));
  const path = spec.path && spec.path.points ? { P: spline(spec.path.points, 60), hw: num(spec.path.width, .14) / 2 } : null;
  if (path) path.bb = bboxOf(path.P);
  // ---- full height ----
  const hFull = (x, z, out) => {
    let h = hp(x, z), rm = 0, lm = 0;
    if (river) { const q = nearest(river.P, x, z, river.bb, .6); if (q) { const a = river.P[q.i], b = river.P[q.i + 1], ys = a.y + (b.y - a.y) * q.t, hw = a.hw + (b.hw - a.hw) * q.t, u = q.d / hw;
      rm = Math.max(0, 1 - u); const bed = ys - river.depth * Math.max(0, 1 - u * u) + Math.max(0, q.d - hw) * 1.1 + .006; h = smin(h, bed, .035); } }
    if (lake) { const ang = Math.atan2(z - lake.z, x - lake.x), n = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz) * (1 + .06 * Math.sin(5 * ang + 1.3) + .03 * Math.sin(11 * ang)); lm = Math.max(0, 1 - n);
      h = smin(h, lake.bottom + (lake.level + lake.depth - lake.bottom) * Math.pow(n / 1.25, 2.1), .12); }
    for (const p of pads) { const k = Math.min(1, Math.hypot(x - p.x, z - p.z) / p.r), py = p.y ?? p._y; h = h * k * k + py * (1 - k * k); }
    if (out) { out.rm = rm; out.lm = lm; }
    return h;
  };
  pads.forEach(p => { p._y = hp(p.x, p.z); });
  const H = new Float32Array(NX * NZ * 4), o = {};
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = minX + i * dx, z = minZ + j * dz, k = (j * NX + i) * 4; H[k] = hFull(x, z, o); H[k + 1] = o.rm; H[k + 2] = o.lm; }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = (j * NX + i) * 4, gx = (H[(j * NX + Math.min(NX - 1, i + 1)) * 4] - H[(j * NX + Math.max(0, i - 1)) * 4]) / (2 * dx), gz = (H[(Math.min(NZ - 1, j + 1) * NX + i) * 4] - H[(Math.max(0, j - 1) * NX + i) * 4]) / (2 * dz); H[k + 3] = Math.hypot(gx, gz); }
  const half = new Uint16Array(H.length); for (let i = 0; i < H.length; i++) half[i] = THREE.DataUtils.toHalfFloat(H[i]);
  const tex = new THREE.DataTexture(half, NX, NZ, THREE.RGBAFormat, THREE.HalfFloatType); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; tex.name = 'terrain-field';
  const sample = (x, z, c) => {
    const fx = clamp((x - minX) / dx, 0, NX - 1.001), fz = clamp((z - minZ) / dz, 0, NZ - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[(j * NX + i) * 4 + c], b = H[(j * NX + i + 1) * 4 + c], e = H[((j + 1) * NX + i) * 4 + c], f = H[((j + 1) * NX + i + 1) * 4 + c];
    return (a * (1 - u) + b * u) * (1 - v) + (e * (1 - u) + f * u) * v;
  };
  const F = {
    w, d, minX, minZ, NX, NZ, dx, dz, H, tex, lake, river, peaks, path, pads, spec,
    h: (x, z) => sample(x, z, 0), m: (x, z, c) => sample(x, z, c), slope: (x, z) => sample(x, z, 3),
    inside: (x, z, m = 0) => x > minX + m && x < minX + w - m && z > minZ + m && z < minZ + d - m,
    normal(x, z, out = new THREE.Vector3()) { const e = dx; return out.set(sample(x - e, z, 0) - sample(x + e, z, 0), 2 * e, sample(x, z - e, 0) - sample(x, z + e, 0)).normalize(); },
    pathD(x, z) { if (!path) return 9; const q = nearest(path.P, x, z, path.bb, .5); return q ? q.d : 9; },
    // how much a kind of plant or stone wants to be at (x, z): 0..1
    suit(x, z, kind = 'grass') {
      if (!F.inside(x, z, .015)) return 0;
      const h = sample(x, z, 0), s = sample(x, z, 3), rm = sample(x, z, 1), lv = lake ? lake.level : -9, wet = h - lv;
      const pd = F.pathD(x, z), pad = pads.reduce((m, p) => Math.min(m, Math.hypot(x - p.x, z - p.z) / p.r), 9);
      const rock = sstep(.55, .95, s) + sstep(1.05, 1.5, h);
      switch (kind) {
        case 'grass': if (wet < .006 || rm > .05) return 0; return clamp((1 - sstep(.5, 1.0, s)) * (1 - sstep(1.0, 1.55, h)) * sstep(path ? path.hw * .6 : 0, path ? path.hw * 1.6 : .01, pd) * sstep(.55, 1, pad), 0, 1);
        case 'flower': if (wet < .05 || rm > 0) return 0; return clamp((1 - sstep(.25, .45, s)) * (1 - sstep(.7, .9, h)) * sstep(.25, .5, pd) * sstep(.8, 1.4, pad), 0, 1);
        case 'reed': { if (!lake || rm > 0) return 0; const lm = sample(x, z, 2); if (lm <= 0 || lm > .6) return 0; return clamp(1 - Math.abs(wet - .015) / .09, 0, 1) * (1 - sstep(.3, .6, s)); }   // the shore shallows only
        case 'rock': return clamp(rock * .7 + sstep(.3, .6, s) * .3, 0, 1) * (wet < -.03 ? 0 : 1);
        case 'tree': if (wet < .06 || rm > 0) return 0; return clamp((1 - sstep(.45, .7, s)) * sstep(.35, .6, pd) * sstep(1.1, 1.6, pad), 0, 1);
        case 'pine': if (wet < .1 || rm > 0) return 0; return clamp((1 - sstep(.6, .95, s)) * sstep(.3, .6, h), 0, 1);
      }
      return 1;
    }
  };
  return F;
}

// ---------------------------------------------------------------- meshes ---------------------------------------
// Rock where it is steep or high (with noise so the border is ragged); peaks with .own are left to their bodies.
export function buildTerrain(field, spec = {}) {
  const { NX, NZ, H, minX, minZ, dx, dz, lake } = field, noise = makeNoise(num(spec.seed, 3) + 17);
  const pos = new Float32Array(NX * NZ * 3);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; pos[k * 3] = minX + i * dx; pos[k * 3 + 1] = H[k * 4]; pos[k * 3 + 2] = minZ + j * dz; }
  const rockW = new Float32Array(NX * NZ);
  const rs = num(spec.rockSlope, .75), rh = num(spec.rockHeight, 1.05);
  for (let k = 0; k < NX * NZ; k++) { const x = pos[k * 3], z = pos[k * 3 + 2], y = pos[k * 3 + 1], n = noise(x * 2.3, z * 2.3, 1) * .5 + noise(x * 6.1, z * 6.1, 2) * .25;
    rockW[k] = Math.max(sstep(rs - .2, rs + .2, H[k * 4 + 3] + n * .35), sstep(rh - .15, rh + .25, y + n * .2)) * (lake && y < lake.level + .02 ? 0 : 1); }
  const groups = { meadow: [], rock: [] }; const own = {}; field.peaks.forEach(p => { if (p.own) own[p.own] = []; });
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, e = c + 1;
    const flip = Math.abs(H[a * 4] - H[e * 4]) > Math.abs(H[b * 4] - H[c * 4]);   // split along the flatter diagonal
    const tris = flip ? [[a, c, b], [b, c, e]] : [[a, c, e], [a, e, b]];
    for (const t of tris) {
      const w = (rockW[t[0]] + rockW[t[1]] + rockW[t[2]]) / 3; let list = w > .5 ? groups.rock : groups.meadow;
      if (w > .5) { const cx = pos[t[0] * 3], cz = pos[t[0] * 3 + 2]; for (const p of field.peaks) if (p.own && Math.hypot(cx - p.x, (cz - p.z) * p.sq) < p.r * 1.25) { list = own[p.own]; break; } }
      list.push(t[0], t[1], t[2]);
    }
  }
  const P = new THREE.BufferAttribute(pos, 3), base = new THREE.BufferGeometry(); base.setAttribute('position', P);
  const all = []; [groups.meadow, groups.rock, ...Object.values(own)].forEach(l => { for (const v of l) all.push(v); });
  base.setIndex(all); base.computeVertexNormals(); const N = base.getAttribute('normal');
  const geo = idx => { const g = new THREE.BufferGeometry(); g.setAttribute('position', P); g.setAttribute('normal', N); g.setIndex(idx); g.computeBoundingBox(); g.computeBoundingSphere(); return g; };
  base.dispose();
  field.geo = geo; field.own = own;
  const hiY = Math.max(...field.peaks.map(p => p.h), .6);
  field.mats = {
    meadow: () => aaaMaterial('meadow', { color: spec.low || '#3f5a2a', color2: spec.high || '#6d7346', color3: spec.soil, yRange: [-.1, hiY * .7], shoreY: lake ? lake.level - .006 : undefined, shoreBand: .03, moss: num(spec.grass, 1), silhouette: false, tile: 1.4 }),
    rock: () => aaaMaterial('crag', { color: spec.rock || '#4f4a42', color2: spec.rockHigh || '#8a8173', yRange: [.2, hiY], snowY: 0, tile: 1.6, depth: .06, moss: .85, silhouette: false })
  };
  const g = new THREE.Group(); g.name = 'terrain';
  const add = (idx, mat, name) => { if (!idx.length) return null; const m = new THREE.Mesh(geo(idx), mat); m.name = name; m.receiveShadow = true; m.castShadow = name === 'rock'; m.userData.noInk = true; g.add(m); return m; };
  add(groups.meadow, field.mats.meadow(), 'meadow'); add(groups.rock, field.mats.rock(), 'rock');
  return g;
}
// the rock of one owned peak as its own mesh (shape kind "peak"); world coordinates minus (ox, oz)
export function buildPeak(field, id, ox = 0, oz = 0) {
  const idx = field.own && field.own[id]; if (!idx || !idx.length) return null;
  const m = new THREE.Mesh(field.geo(idx), field.mats.rock()); m.position.set(-ox, 0, -oz); m.castShadow = true; m.receiveShadow = true; m.userData.inkAngle = 60; m.userData.noInk = true; m.name = 'ridge rock';
  return m;
}
// GLSL: sample the field texture at a world xz (uField, uFieldM = (minX, minZ, 1/dx, 1/dz), uFieldN = grid size)
export const FIELD_GLSL = /* glsl */`
uniform sampler2D uField; uniform vec4 uFieldM; uniform vec2 uFieldN;
vec4 fieldAt(vec2 xz){ return texture2D(uField, ((xz - uFieldM.xy) * uFieldM.zw + .5) / uFieldN); }`;
export const fieldUniforms = f => ({ uField: { value: f.tex }, uFieldM: { value: new THREE.Vector4(f.minX, f.minZ, 1 / f.dx, 1 / f.dz) }, uFieldN: { value: new THREE.Vector2(f.NX, f.NZ) } });
