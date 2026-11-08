// Scene-spec builder: turns declarative bodies (shape + material + transform) into three.js objects.
// Every built root carries userData {bodyId, name, role} so tours, labels and the edit tool can find it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterial, thinGlass } from '../gfx/materials.js';
import { aaaMaterial, AAA } from '../gfx/aaa.js';
import { alignUV, relief } from '../gfx/proc.js';
import { canvasTex, labelTex } from '../gfx/textures.js';
import { compile, mulberry, makeNoise } from '../util.js';
import { buildTree, treeForest, speciesOf } from './trees.js';
import { bakeField, buildTerrain, buildPeak, setField, getField } from '../gfx/terrain.js';
import { grassField, flowerField, reedField } from '../gfx/grass.js';
import { buildLake, buildRiver } from '../gfx/water.js';
import { buildCloudVolume } from '../gfx/clouds.js';
import { buildSoilBlock } from '../gfx/soil.js';
import { vapourPoints, rainStreaks } from '../gfx/precip.js';
import { buildCabin, buildJetty, buildHills, buildVitrine } from '../gfx/cabin.js';

const D2R = Math.PI / 180;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const num = (v, d) => (v == null || !isFinite(+v) ? d : +v);
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'plane', 'disc', 'ring', 'extrude', 'lathe', 'tube', 'spring', 'arrow', 'text', 'group',
  'tree', 'pine', 'bush', 'oak', 'birch', 'cherry', 'forest', 'house', 'tower', 'mountain', 'rock', 'cloud', 'water', 'terrain', 'table', 'lamp', 'beaker', 'flask', 'testtube', 'molecule', 'cell', 'planet', 'star', 'gear', 'magnet', 'battery', 'coin', 'die', 'person', 'bars', 'surface', 'curve', 'grid', 'axes', 'sign', 'glasscase', 'particles', 'book', 'scale', 'pulley', 'boat', 'car', 'peak', 'grassField', 'flowers', 'reeds', 'lake', 'river', 'waterfall', 'cloudVolume', 'soilBlock', 'rockScatter', 'cabin', 'jetty', 'hills', 'vitrine'];

export function buildShape(shape = {}, matSpec, ctx = {}) {
  const k = String(shape.kind || 'box').toLowerCase(), F = () => getField(ctx);
  const mat = () => makeMaterial(matSpec || {});
  const g = new THREE.Group();
  switch (k) {
    case 'box': {
      const w = num(shape.w, 1), h = num(shape.h, 1), d = num(shape.d, 1), r = num(shape.round, Math.min(w, h, d) * .06);
      return mesh(alignUV(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d)), mat());
    }
    case 'sphere': return mesh(new THREE.SphereGeometry(num(shape.r, .5), 48, 32), mat());
    case 'cylinder': { const r = num(shape.r, .5); return mesh(alignUV(new THREE.CylinderGeometry(num(shape.rt, r), num(shape.rb, r), num(shape.h, 1), Math.max(24, num(shape.seg, 64)))), mat()); }
    case 'cone': return mesh(new THREE.ConeGeometry(num(shape.r, .5), num(shape.h, 1), 64), mat());
    case 'torus': return mesh(new THREE.TorusGeometry(num(shape.R, 1), num(shape.r, .2), 32, 128), mat());
    case 'capsule': return mesh(new THREE.CapsuleGeometry(num(shape.r, .3), num(shape.h, 1), 12, 24), mat());
    case 'plane': { const m = mesh(new THREE.PlaneGeometry(num(shape.w, 1), num(shape.h, 1)), mat(), false); m.material.side = THREE.DoubleSide; return m; }
    case 'disc': { const m = mesh(new THREE.CircleGeometry(num(shape.r, 1), 64), mat(), false); m.rotation.x = -Math.PI / 2; g.add(m); return g; }
    case 'ring': { const m = mesh(new THREE.RingGeometry(num(shape.ri, .6), num(shape.ro, 1), 64), mat(), false); m.material.side = THREE.DoubleSide; m.rotation.x = -Math.PI / 2; g.add(m); return g; }
    case 'extrude': {
      const pts = (shape.points || [[0, 0], [1, 0], [1, 1], [0, 1]]).map(p => new THREE.Vector2(+p[0], +p[1]));
      const sh = new THREE.Shape(pts);
      (shape.holes || []).forEach(hp => sh.holes.push(new THREE.Path(hp.map(p => new THREE.Vector2(+p[0], +p[1])))));
      const depth = num(shape.depth, .2), bev = num(shape.bevel, Math.min(.03, depth * .2));
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: 2, curveSegments: 24 });
      geo.translate(0, 0, -depth / 2); return mesh(geo, mat());
    }
    case 'lathe': return mesh(new THREE.LatheGeometry((shape.points || [[0, 0], [.5, 0], [.5, 1], [0, 1]]).map(p => new THREE.Vector2(Math.max(.001, +p[0]), +p[1])), 96), mat());
    case 'tube': {
      const pts = (shape.points || [[0, 0, 0], [1, 1, 0]]).map(p => V3(+p[0], +p[1], +p[2] || 0));
      return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !!shape.closed), Math.max(32, pts.length * 12), num(shape.r, .05), 12, !!shape.closed), mat());
    }
    case 'spring': {
      const R = num(shape.R, .3), turns = num(shape.turns, 12), h = num(shape.h, 2), pts = [];
      for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(V3(R * Math.cos(a), h * i / (turns * 24), R * Math.sin(a))); }
      return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, num(shape.r, .04), 8), mat());
    }
    case 'arrow': {
      const L = num(shape.length, 1.5), r = num(shape.r, .05), hl = num(shape.head, Math.min(.4, L * .3));
      const m1 = mesh(new THREE.CylinderGeometry(r, r, L - hl, 16), mat()); m1.position.y = (L - hl) / 2;
      const m2 = mesh(new THREE.ConeGeometry(r * 3, hl, 24), m1.material); m2.position.y = L - hl / 2; g.add(m1, m2); return g;
    }
    case 'text': case 'sign': {
      const txt = String(shape.text || 'Label'), w = num(shape.w, Math.max(1, txt.length * .22)), h = num(shape.h, .5);
      const tex = labelTex(txt, { w: 1024, h: Math.round(1024 * h / w), bg: k === 'sign' ? '#1a120b' : 'rgba(0,0,0,0)', border: k === 'sign' ? '#8f733a' : null, fg: shape.color || '#f2e2b8', font: '600 120px "IM Fell English SC", Georgia, serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: k !== 'sign', roughness: .7, side: THREE.DoubleSide }));
      if (k === 'sign') { const post = mesh(new THREE.CylinderGeometry(.04, .04, num(shape.post, 1), 8), makeMaterial('darkwood')); post.position.y = -num(shape.post, 1) / 2 - h / 2; g.add(post); }
      g.add(m); return g;
    }
    case 'group': return g;
    // believable trees (js/dio/trees.js): bent tapered trunk + branches in AAA bark, displaced leaf clumps fringed by
    // alpha-tested leaf cards, whorled drooping tiers for pines; shared geometry (4 variants per kind), 2 draw calls each
    case 'tree': case 'bush': case 'pine': case 'oak': case 'birch': case 'cherry': return buildTree(k, shape, matSpec, ctx);
    // ---- landscape kit (realism-playbook; js/gfx/terrain.js, grass.js, water.js, clouds.js, soil.js) ----
    // forest{species, items:[[x,z,h],…]} or {species, count, region:[x0,z0,x1,z1], h:[min,max]}: instanced trees (2 draw calls per variant)
    case 'forest': {
      const sp = speciesOf(shape.species || 'tree'), f = F(), r = mulberry(ctx.seed || 5), hr = shape.h || [.8, 1.3], yAt = (x, z) => (f ? f.h(x, z) : 0) - .03;
      let items = (shape.items || []).map(it => ({ x: +it[0], z: +it[1], h: +it[2] || hr[0] + r() * (hr[1] - hr[0]) }));
      if (!items.length && shape.count) { const rg = shape.region || [-5, -4, 5, 4], kind = sp === 'pine' ? 'pine' : 'tree';
        for (let n = 0, g2 = 0; n < shape.count && g2 < shape.count * 60; g2++) { const x = rg[0] + r() * (rg[2] - rg[0]), z = rg[1] + r() * (rg[3] - rg[1]); if (f && r() > f.suit(x, z, kind)) continue; if (items.some(o => Math.hypot(o.x - x, o.z - z) < (shape.spacing || .55))) continue; items.push({ x, z, h: hr[0] + r() * (hr[1] - hr[0]) }); n++; } }
      if (f) items = items.filter(it => !(f.lake && f.h(it.x, it.z) < f.lake.level + .03) && !(f.m(it.x, it.z, 1) > 0));   // never in the lake or the stream
      items.forEach(it => { it.y = yAt(it.x, it.z); });
      const fo = treeForest(sp, items, { color: matSpec && matSpec.color, seed: ctx.seed || 1, variants: shape.variants || 2 }); fo.userData.forest = { species: sp, items }; return fo;
    }
    // peak{id, x, z}: the rock of a terrain peak that has own:id, as its own (actor) body; place the body at [x,0,z]
    case 'peak': { const f = F(), m = f && buildPeak(f, shape.id || shape.own, num(shape.x, 0), num(shape.z, 0)); if (m) { g.add(m); return g; } return buildShape(Object.assign({}, shape, { kind: 'mountain' }), matSpec, ctx); }
    case 'grassfield': { const f = F(); if (!f) return g; const m = grassField(f, { density: shape.density, height: shape.height, amount: shape.amount, seed: ctx.seed, cover: shape.cover }); g.add(m); g.userData.stats = m.userData.stats; return g; }
    case 'flowers': { const f = F(); const m = f && flowerField(f, { amount: shape.amount, seed: ctx.seed, force: shape.force }); if (m) g.add(m); return g; }
    case 'reeds': { const f = F(); const m = f && reedField(f, { amount: shape.amount, seed: ctx.seed }); if (m) g.add(m); return g; }
    case 'lake': { const f = F(); const l = f && buildLake(f, ctx.headless ? Object.assign({}, shape, { reflect: false }) : shape);   // sketches/pedestal minis: no live planar reflection if (l) return l; return buildShape(Object.assign({}, shape, { kind: 'water' }), matSpec, ctx); }
    case 'river': case 'waterfall': { const f = F(); const rv = f && buildRiver(f, { flow: shape.flow, spray: shape.spray }); return rv || g; }
    // cabin{w,d}: log cabin with porch, stone chimney + smoke, woodpile (front = +z); jetty{from:[x,z],to:[x,z],width}; hills{r,layers,height}
    case 'cabin': return buildCabin(shape, ctx.seed || 7);
    // vitrine{min:[x,y,z],max:[x,y,z]}: glass case with a brass frame; warm studio backdrop seen from outside, the sky from inside
    case 'vitrine': return buildVitrine({ min: shape.min, max: shape.max });
    case 'jetty': return buildJetty(F(), shape.from, shape.to, { width: num(shape.width, .17), seed: ctx.seed || 3 });
    case 'hills': return buildHills({ r: num(shape.r, 34), layers: num(shape.layers, 3), height: num(shape.height, 5), y: num(shape.y, -1.2), seed: num(shape.seed, 4) });
    case 'cloudvolume': { g.add(buildCloudVolume(shape, ctx.seed || 3, F())); return g; }
    case 'soilblock': { const f = F(); if (f && !f.soil) { f.soil = true; g.add(buildSoilBlock(f, { bottom: num(shape.bottom, -.9), grass: shape.grass, plinth: shape.plinth !== false })); } return g; }
    // rockScatter{count, r:[min,max], region?, moss}: half-buried boulders on the field's rocky ground, 2 shape variants
    case 'rockscatter': {
      const f = F(), r = mulberry(ctx.seed || 9), n = Math.round(num(shape.count, 60) * ({ low: .6, medium: 1, high: 1.3 }[AAA.quality] || 1)), rr = shape.r || [.04, .16], rg = shape.region;
      const noise = makeNoise(ctx.seed || 9), mat = aaaMaterial('crag', { color: shape.low || '#57524a', color2: shape.high || '#8c8578', yRange: [-.2, 1.2], moss: num(shape.moss, .95), tile: .6, depth: .02, silhouette: false });
      const geos = [0, 1].map(v => { let q = new THREE.IcosahedronGeometry(1, 2); q.deleteAttribute('uv'); q.deleteAttribute('normal'); q = mergeVertices(q); const P = q.attributes.position, t = V3();
        for (let i = 0; i < P.count; i++) { t.fromBufferAttribute(P, i); const d = 1 + .35 * noise.fbm(t.x * 1.5 + v * 7, t.y * 1.5, t.z * 1.5, 4); t.multiplyScalar(d); t.y *= .62; P.setXYZ(i, t.x, t.y, t.z); } q.computeVertexNormals(); return q; });
      const lists = [[], []], m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), nrm = V3();
      for (let i = 0, guard = 0; i < n && guard < n * 80; guard++) {
        const x = rg ? rg[0] + r() * (rg[2] - rg[0]) : (f ? f.minX + r() * f.w : (r() - .5) * 10), z = rg ? rg[1] + r() * (rg[3] - rg[1]) : (f ? f.minZ + r() * f.d : (r() - .5) * 10);
        if (f && r() > f.suit(x, z, 'rock') + (shape.anywhere ? .25 : 0)) continue;
        const R0 = rr[0] + Math.pow(r(), 2.2) * (rr[1] - rr[0]);
        let y = 0; if (f) { y = 9; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; y = Math.min(y, f.h(x + Math.cos(a) * R0 * .8, z + Math.sin(a) * R0 * .8)); } f.normal(x, z, nrm); } else nrm.set(0, 1, 0);
        qq.setFromUnitVectors(V3(0, 1, 0), nrm.lerp(V3(0, 1, 0), .5).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), r() * 6.283));
        m4.compose(V3(x, y - R0 * .22, z), qq, V3(R0 * (.8 + r() * .5), R0 * (.7 + r() * .5), R0 * (.8 + r() * .5))); lists[i % 2].push(m4.clone()); i++;
      }
      lists.forEach((L, v) => { if (!L.length) return; const im = new THREE.InstancedMesh(geos[v], mat, L.length); L.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.userData.noInk = true; im.name = 'rocks'; g.add(im); });
      return g;
    }
    case 'house': {
      const w = num(shape.w, 1.6), d = num(shape.d, 1.2), h = num(shape.h, 1);
      const wall = mesh(alignUV(new THREE.BoxGeometry(w, h, d)), makeMaterial(matSpec || { preset: 'plaster', color: '#efe3cc' })); wall.position.y = h / 2; g.add(wall);
      const roofGeo = new THREE.CylinderGeometry(.001, w * .78, h * .7, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(1, 1, d / w);
      const roof = mesh(roofGeo, makeMaterial({ preset: 'ceramic', color: shape.roof || '#8a3a2a', roughness: .7 })); roof.position.y = h + h * .35; g.add(roof);
      const win = makeMaterial({ preset: 'emissive', color: '#ffcf7a', emissiveIntensity: .8 });
      [[-w * .25, h * .55], [w * .25, h * .55]].forEach(([x, y]) => { const q = mesh(new THREE.PlaneGeometry(w * .18, h * .25), win, false); q.position.set(x, y, d / 2 + .005); g.add(q); g.userData.windows = (g.userData.windows || []).concat(q); });
      const door = mesh(new THREE.PlaneGeometry(w * .18, h * .45), makeMaterial('darkwood'), false); door.position.set(0, h * .225, d / 2 + .006); g.add(door);
      const ch = mesh(new THREE.BoxGeometry(w * .12, h * .5, w * .12), makeMaterial('stone')); ch.position.set(w * .25, h * 1.25, 0); g.add(ch); g.userData.chimney = ch;
      return g;
    }
    case 'tower': { const h = num(shape.h, 3), r = num(shape.r, .5); const t = mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 24), makeMaterial(matSpec || 'stone')); t.position.y = h / 2; const c = mesh(new THREE.ConeGeometry(r * 1.3, h * .35, 24), makeMaterial({ preset: 'ceramic', color: '#5a3a4a' })); c.position.y = h + h * .17; g.add(t, c); return g; }
    case 'terrain': if (shape.peaks || shape.lake || shape.river || shape.block) {
      // field terrain: one bake (heights + river/lake masks + slope) shared by every body that follows (getField)
      const f = bakeField(shape); setField(ctx, f); const t = buildTerrain(f, shape); t.userData.field = f;
      if (shape.block !== false) { f.soil = true; t.add(buildSoilBlock(f, { bottom: num(shape.bottom, -.9), grass: shape.turf || '#4a6a2c', plinth: shape.plinth !== false })); }
      return t;
    }
    // falls through to the legacy displaced terrain
    case 'mountain': case 'rock': {
      const isT = k === 'terrain', R = num(shape.r, isT ? 6 : (k === 'rock' ? .5 : 3)), H = num(shape.h, isT ? .8 : (k === 'rock' ? .4 : 3));
      const noise = makeNoise(num(shape.seed, 3)), seg = isT ? 128 : 64;
      let geo = isT ? new THREE.PlaneGeometry(num(shape.w, R * 2), num(shape.d, R * 2), seg, seg) : new THREE.IcosahedronGeometry(1, k === 'rock' ? 3 : 5);
      if (isT) geo.rotateX(-Math.PI / 2);
      else { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); geo = mergeVertices(geo); }   // shared vertices: smooth normals (the relief comes from the material), same surface
      const pos = geo.attributes.position, cols = [], c = new THREE.Color();
      const low = new THREE.Color(shape.low || (isT ? '#5f7f3e' : '#5a5148')), high = new THREE.Color(shape.high || (isT ? '#9a8a5e' : '#8d847a')), snow = new THREE.Color('#f4f6fa');
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (isT) { let e = noise.fbm(x * .18, z * .18, 0, 5) * H * 2 + (shape.bowl ? (x * x + z * z) * shape.bowl : 0);
          for (const f of (shape.flat || [])) { const dd = Math.hypot(x - f[0], z - f[1]), k = Math.max(0, Math.min(1, (dd - f[2]) / (f[3] ?? .8))); e = (f[4] ?? -.05) * (1 - k) + e * k; }
          const edge = Math.min(num(shape.w, R * 2), num(shape.d, R * 2)) / 2, rr = Math.hypot(x, z); if (shape.round !== false && rr > edge * .86) { e -= Math.min(1, Math.pow((rr - edge * .86) / (edge * .14), 2)) * (H + .4); if (rr > edge) { const k = edge / rr; x *= k; z *= k; pos.setX(i, x); pos.setZ(i, z); e = -(H + .4); } } pos.setY(i, e); /* round terrain: corners fold onto a circular rim instead of spiking down */ const t = Math.min(1, Math.max(0, (e + H) / (2.5 * H))); c.copy(low).lerp(high, t); }
        else { const v = V3(x, y, z).normalize(); const n = 1 + noise.fbm(v.x * 1.6, v.y * 1.6, v.z * 1.6, 5) * .55; let yy = v.y * n; if (k === 'mountain') yy = Math.max(0, yy) * (1 + Math.pow(Math.max(0, v.y), 2)); pos.setXYZ(i, v.x * n * R, yy * H * (k === 'mountain' ? 1 : .7), v.z * n * R); const hh = yy; c.copy(low).lerp(high, Math.min(1, Math.max(0, hh))); if (k === 'mountain' && Math.min(1, hh / 2) > (shape.snowline ?? .75)) c.copy(snow); }   // heights reach ~3× base: snowline is a 0–1 fraction of the peak range
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
      // AAA surfaces (js/gfx/aaa.js): terrain = meadow soil with grass on the flats (low → high colours by height, a mud
      // band along shape.shore / a water line set by the scene), mountains and rocks = craggy rock with parallax relief
      // and fractured silhouettes; an explicit material in the spec still wins.
      const sl = shape.snowline ?? .75, peak = k === 'mountain' ? H : H * .7;
      const mat = matSpec && matSpec.preset ? makeMaterial(matSpec) : isT
        ? aaaMaterial('meadow', { color: shape.low || '#5f7f3e', color2: shape.high || '#9a8a5e', yRange: [-H * .5, H * 1.5], shoreY: shape.shore != null ? num(shape.shore, 0) : undefined, moss: num(shape.grass, 1) })
        : aaaMaterial('crag', { color: shape.low || '#5a5148', color2: shape.high || '#8d847a', yRange: [0, peak], snowY: k === 'mountain' && sl < 1.4 ? 2 * sl * H : 0, tile: Math.min(2.2, Math.max(.35, R * .9)), depth: Math.min(.09, Math.max(.012, R * .045)), moss: k === 'rock' ? .5 : .75 });
      const m = mesh(geo, mat);
      if (isT) { m.castShadow = false; m.userData.noInk = true; } else m.userData.inkAngle = 60; return m;
    }
    case 'cloud': {
      if (shape.volume) { g.add(buildCloudVolume(shape, ctx.seed || 3, F())); return g; }
      const s = num(shape.r, 1), r = mulberry(ctx.seed || 3), cm = makeMaterial({ preset: 'cloud', color: shape.color || '#ffffff' });
      const n = num(shape.puffs, 7), geos = [];
      for (let i = 0; i < n; i++) { const q = new THREE.IcosahedronGeometry(s * (.45 + r() * .4), 2); q.translate((r() - .5) * s * 2.2, (r() - .3) * s * .5, (r() - .5) * s * 1.1); geos.push(q); }
      const m = mesh(mergeGeometries(geos), cm); m.castShadow = true; m.userData.inkAngle = 70; return m;
    }
    case 'water': { const m = mesh(new THREE.PlaneGeometry(num(shape.w, 4), num(shape.d, 3), 64, 64), makeMaterial(matSpec || 'water'), false); m.rotation.x = -Math.PI / 2; m.userData.waves = num(shape.waves, .03); m.userData.noInk = true; g.add(m); g.userData.water = m;
      // optional water body below the surface (shape.depth): a transmissive volume, so submerged bodies refract and the water reads as a mass
      if (num(shape.depth, 0) > 0) { const D = num(shape.depth, 0), body = mesh(new THREE.BoxGeometry(num(shape.w, 4) * .998, D, num(shape.d, 3) * .998), m.material, false); body.position.y = -D / 2 - .003; body.userData.noInk = true; g.add(body); m.material.thickness = Math.min(num(shape.w, 4), num(shape.d, 3)); } return g; }
    case 'table': {
      const w = num(shape.w, 3), d = num(shape.d, 1.6), h = num(shape.h, 1.1), wm = makeMaterial(matSpec || 'darkwood');
      const top = mesh(alignUV(new RoundedBoxGeometry(w, .08, d, 2, .02)), wm); top.position.y = h; g.add(top);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => { const l = mesh(new THREE.CylinderGeometry(.04, .03, h, 10), wm); l.position.set(a * (w / 2 - .1), h / 2, b * (d / 2 - .1)); g.add(l); });
      return g;
    }
    case 'lamp': {
      const h = num(shape.h, 1); const base = mesh(new THREE.CylinderGeometry(.15, .18, .04, 24), makeMaterial('brass')); g.add(base);
      const pole = mesh(new THREE.CylinderGeometry(.015, .015, h, 8), base.material); pole.position.y = h / 2; g.add(pole);
      const shade = mesh(new THREE.ConeGeometry(.22, .25, 32, 1, true), makeMaterial({ preset: 'fabric', color: '#e9d2a0', side: 'double' })); shade.position.y = h; g.add(shade);
      const bulb = mesh(new THREE.SphereGeometry(.05, 16, 12), makeMaterial({ preset: 'emissive', color: '#ffd9a0', emissiveIntensity: 4 }), false); bulb.position.y = h - .05; g.add(bulb);
      const L = new THREE.PointLight(0xffc98a, 3, 6, 2); L.position.y = h - .1; g.add(L); g.userData.light = L; return g;
    }
    case 'beaker': case 'flask': case 'testtube': {
      // blown-glass vessel with real wall thickness (outer + inner lathe surfaces) and a liquid with a wetting meniscus
      const r = num(shape.r, k === 'testtube' ? .12 : .45), h = num(shape.h, k === 'testtube' ? 1.2 : 1), fill = Math.min(.95, num(shape.fill, .55)), t = Math.max(.008, r * .05);
      const outer = k === 'flask' ? [[.001, 0], [r * .9, 0], [r, h * .06], [r * .98, h * .25], [r * .3, h * .7], [r * .3, h * .97], [r * .34, h]] : k === 'testtube' ? [[.001, 0], [r * .55, r * .12], [r * .9, r * .45], [r, r], [r, h * .98], [r * 1.08, h]] : [[.001, 0], [r * .96, 0], [r, r * .06], [r, h * .97], [r * 1.06, h]];
      const prof = new THREE.SplineCurve(outer.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(outer.length * 8);
      const inner = prof.map((p, i) => { const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return new THREE.Vector2(Math.max(.0005, p.x - dy / L * t), p.y + dx / L * t); }).reverse();
      const glass = mesh(new THREE.LatheGeometry(prof.concat(inner), 96), thinGlass({ side: THREE.FrontSide, absorb: .03, edge: .9 }), false); g.add(glass);
      const rAt = y => { for (let i = 1; i < prof.length; i++) if (prof[i].y >= y) { const a = prof[i - 1], b = prof[i], u = (y - a.y) / ((b.y - a.y) || 1); return Math.max(.001, a.x + (b.x - a.x) * u - t * 1.1); } return r - t; };
      const top = h * fill, lp = [new THREE.Vector2(.001, t * 1.2)]; for (let y = t * 1.2; y < top; y += h / 40) lp.push(new THREE.Vector2(rAt(y), y));
      const rt = rAt(top), mh = Math.min(.04, rt * .25); lp.push(new THREE.Vector2(rt, top + mh)); for (let i = 1; i <= 8; i++) { const u = i / 8; lp.push(new THREE.Vector2(Math.max(.001, rt * (1 - u)), top + mh * Math.pow(1 - u, 3))); }
      const lmat = makeMaterial(matSpec && ['water', 'liquid', 'gel'].includes(matSpec.preset) ? matSpec : { preset: 'liquid', color: shape.liquid || '#4aa3c0' }); lmat.thickness = r * 1.6;
      const liquid = mesh(new THREE.LatheGeometry(lp, 64), lmat, false);
      g.add(liquid); g.userData.liquid = liquid; return g;
    }
    case 'molecule': {
      const atoms = shape.atoms || [['O', 0, 0, 0], ['H', .76, .59, 0], ['H', -.76, .59, 0]], bonds = shape.bonds || [[0, 1], [0, 2]];
      const CPK = { H: '#f2f2f2', C: '#333333', N: '#3050f8', O: '#e33', S: '#ffd030', P: '#ff8000', Cl: '#1ff01f', Na: '#ab5cf2', Fe: '#e06633' }, RAD = { H: .25, C: .38, N: .36, O: .35, S: .45, P: .45, Cl: .42, Na: .5, Fe: .5 };
      const sc = num(shape.scale, 1);
      atoms.forEach(a => { const s = mesh(new THREE.SphereGeometry((RAD[a[0]] || .35) * sc, 32, 20), makeMaterial({ preset: 'plastic', color: CPK[a[0]] || '#d0d', roughness: .25 })); s.position.set(a[1] * sc, a[2] * sc, a[3] * sc); s.userData.atom = a[0]; g.add(s); });
      bonds.forEach(([i, j]) => { const A = V3(atoms[i][1], atoms[i][2], atoms[i][3]).multiplyScalar(sc), B = V3(atoms[j][1], atoms[j][2], atoms[j][3]).multiplyScalar(sc); const L = A.distanceTo(B); const c = mesh(new THREE.CylinderGeometry(.07 * sc, .07 * sc, L, 12), makeMaterial({ preset: 'plastic', color: '#bbbbbb' })); c.position.copy(A).add(B).multiplyScalar(.5); c.quaternion.setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize()); g.add(c); });
      return g;
    }
    case 'cell': {
      const R = num(shape.r, 1.5); const mem = mesh(new THREE.SphereGeometry(R, 64, 48), makeMaterial(matSpec || 'membrane'), false); g.add(mem);
      const nuc = mesh(new THREE.SphereGeometry(R * .32, 48, 32), makeMaterial({ preset: 'gel', color: '#9a6ad0' })); nuc.position.set(R * .15, 0, 0); g.add(nuc); g.userData.nucleus = nuc;
      const r = mulberry(5); for (let i = 0; i < 8; i++) { const o = mesh(new THREE.CapsuleGeometry(R * .05, R * .18, 6, 12), makeMaterial({ preset: 'gel', color: '#e88a5a' })); const v = V3(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(R * (.45 + r() * .35)); o.position.copy(v); o.rotation.set(r() * 3, r() * 3, 0); g.add(o); }
      return g;
    }
    case 'planet': { const R = num(shape.r, .6); const p = mesh(new THREE.SphereGeometry(R, 64, 48), makeMaterial(matSpec || { preset: 'ceramic', color: shape.color || '#5a8ad0', roughness: .6 })); g.add(p); if (shape.rings) { const rg = mesh(new THREE.RingGeometry(R * 1.4, R * 2.2, 96), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, side: THREE.DoubleSide, transparent: true, opacity: .7, roughness: .8 }), false); rg.rotation.x = -Math.PI / 2 + .35; g.add(rg); } return g; }
    case 'star': { const R = num(shape.r, .6), col = shape.color || '#ffd27a'; const s = mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3), toneMapped: false }), false); g.add(s); const L = new THREE.PointLight(col, num(shape.intensity, 60), 0, 2); g.add(L); g.userData.light = L; return g; }
    case 'gear': {
      const R = num(shape.r, .6), n = num(shape.teeth, 14), d = num(shape.depth, .15), sh = new THREE.Shape();
      for (let i = 0; i <= n * 4; i++) { const a = i / (n * 4) * Math.PI * 2, rr = (i % 4 < 2) ? R : R * .82; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      sh.holes.push(new THREE.Path().absarc(0, 0, R * .18, 0, Math.PI * 2, true));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 1 }); geo.translate(0, 0, -d / 2); return mesh(geo, makeMaterial(matSpec || 'brass'));
    }
    case 'magnet': { const a = mesh(new THREE.BoxGeometry(.5, .4, .4), makeMaterial({ preset: 'plastic', color: '#c03a2a' })); a.position.x = .25; const b = mesh(new THREE.BoxGeometry(.5, .4, .4), makeMaterial({ preset: 'plastic', color: '#2a5ac0' })); b.position.x = -.25; g.add(a, b); return g; }
    case 'battery': { const b = mesh(new THREE.CylinderGeometry(.25, .25, 1, 32), makeMaterial({ preset: 'plastic', color: '#1d2a3a' })); const c = mesh(new THREE.CylinderGeometry(.1, .1, .08, 16), makeMaterial('brass')); c.position.y = .54; const band = mesh(new THREE.CylinderGeometry(.252, .252, .3, 32), makeMaterial({ preset: 'plastic', color: '#cfa84f' })); band.position.y = .3; g.add(b, c, band); return g; }
    case 'coin': return mesh(new THREE.CylinderGeometry(num(shape.r, .3), num(shape.r, .3), .05, 48), makeMaterial(matSpec || 'gold'));
    case 'die': return mesh(new RoundedBoxGeometry(num(shape.s, .4), num(shape.s, .4), num(shape.s, .4), 3, .05), makeMaterial(matSpec || 'ceramic'));
    case 'book': { const w = num(shape.w, .5), h = num(shape.h, .7), d = num(shape.d, .12); const c = mesh(new RoundedBoxGeometry(w, h, d, 2, .01), makeMaterial(matSpec || 'leather')); const p = mesh(new THREE.BoxGeometry(w * .96, h * .96, d * .8), makeMaterial('paper')); p.position.x = .01; g.add(c, p); return g; }
    case 'person': {
      const h = num(shape.h, 1.7), m = makeMaterial(matSpec || { preset: 'ceramic', color: shape.color || '#d8c8b0', roughness: .6 });
      const body = mesh(new THREE.CapsuleGeometry(h * .12, h * .38, 8, 16), m); body.position.y = h * .52; g.add(body);
      const head = mesh(new THREE.SphereGeometry(h * .09, 24, 16), m); head.position.y = h * .9; g.add(head);
      [-1, 1].forEach(s => { const l = mesh(new THREE.CapsuleGeometry(h * .045, h * .3, 6, 10), m); l.position.set(s * h * .06, h * .18, 0); g.add(l); const a = mesh(new THREE.CapsuleGeometry(h * .035, h * .28, 6, 10), m); a.position.set(s * h * .17, h * .55, 0); a.rotation.z = s * .15; g.add(a); });
      return g;
    }
    case 'bars': {
      const data = shape.data || [1, 2, 3, 2, 1], gap = num(shape.gap, .2), w = num(shape.w, .5), sc = num(shape.scale, 1);
      data.forEach((v, i) => { const b = mesh(new RoundedBoxGeometry(w, 1, w, 2, .03), makeMaterial({ preset: 'plastic', color: (shape.colors && shape.colors[i % shape.colors.length]) || '#2d5b8e' })); b.scale.y = Math.max(.001, v * sc); b.position.set((i - (data.length - 1) / 2) * (w + gap), v * sc / 2, 0); b.userData.bar = i; g.add(b); });
      return g;
    }
    case 'surface': {
      const f = compile(shape.expr || 'sin(x)*cos(y)', ['x', 'y', ...Object.keys(ctx.params || {})]);
      const R = num(shape.range, 4), N = 80, H = num(shape.h, 1), pk = Object.keys(ctx.params || {}), pv = () => pk.map(k => ctx.params[k]);
      const geo = new THREE.PlaneGeometry(2 * R, 2 * R, N, N); geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, cols = [], cA = new THREE.Color(shape.low || '#1d3d63'), cB = new THREE.Color(shape.high || '#cfa84f'), c = new THREE.Color();
      let lo = Infinity, hi = -Infinity; const zs = [];
      for (let i = 0; i < pos.count; i++) { const z = f(pos.getX(i), pos.getZ(i), ...pv()); zs.push(z); if (isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); } }
      const span = Math.max(1e-6, hi - lo);
      for (let i = 0; i < pos.count; i++) { const z = isFinite(zs[i]) ? zs[i] : lo; pos.setY(i, (z - lo) / span * H * 2.5); c.copy(cA).lerp(cB, (z - lo) / span); cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
      const m = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .1, side: THREE.DoubleSide })); m.userData.surface = { f, lo, span, H, R, pv }; return m;
    }
    case 'curve': {
      const t0 = num(shape.t0, 0), t1 = num(shape.t1, Math.PI * 2), fx = compile(shape.x || 'cos(t)', ['t']), fy = compile(shape.y || 't*0.2', ['t']), fz = compile(shape.z || 'sin(t)', ['t']), pts = [];
      for (let i = 0; i <= 300; i++) { const t = t0 + (t1 - t0) * i / 300; pts.push(V3(fx(t), fy(t), fz(t))); }
      return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, num(shape.r, .04), 8), makeMaterial(matSpec || { preset: 'neon', color: '#ffd27a' }), false);
    }
    case 'grid': { const gh = new THREE.GridHelper(num(shape.size, 10), num(shape.div, 20), shape.color || 0x8f733a, shape.color2 || 0x3a2c1e); gh.position.y = .01; g.add(gh); return g; }
    case 'axes': {
      const s = num(shape.size, 3); [[0xd2553c, [1, 0, 0]], [0x5aa03c, [0, 1, 0]], [0x3c78d2, [0, 0, 1]]].forEach(([c, d]) => g.add(new THREE.ArrowHelper(V3(...d), V3(), s, c, .25, .12))); return g;
    }
    case 'glasscase': {
      const w = num(shape.w, 12), d = num(shape.d, 12), h = num(shape.h, 7), gm = thinGlass({ absorb: .012, edge: .55, card: .1 }), fm = makeMaterial('brass'), b = .06;
      [[0, h / 2, d / 2, 0, w], [0, h / 2, -d / 2, Math.PI, w], [w / 2, h / 2, 0, Math.PI / 2, d], [-w / 2, h / 2, 0, -Math.PI / 2, d]].forEach(([x, y, z, ry, pw]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, h), gm); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 10; g.add(m); });
      const tp = new THREE.Mesh(new THREE.PlaneGeometry(w, d), gm); tp.rotation.x = -Math.PI / 2; tp.position.y = h; tp.renderOrder = 10; g.add(tp);
      const bar = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), fm); m.position.set(x, y, z); g.add(m); };
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, c]) => bar(b, h, b, a * w / 2, h / 2, c * d / 2));
      [h, b / 2].forEach(y => { bar(w + b, b, b, 0, y, d / 2); bar(w + b, b, b, 0, y, -d / 2); bar(b, b, d + b, w / 2, y, 0); bar(b, b, d + b, -w / 2, y, 0); });
      g.traverse(o => { o.userData.noInk = true; }); return g;
    }
    case 'scale': { const base = mesh(new THREE.CylinderGeometry(.3, .4, .1, 32), makeMaterial('brass')); const post = mesh(new THREE.CylinderGeometry(.04, .04, 1.4, 12), base.material); post.position.y = .7; const beam = mesh(new THREE.BoxGeometry(2.2, .05, .06), base.material); beam.position.y = 1.4; g.add(base, post, beam); g.userData.beam = beam; [-1, 1].forEach(s => { const pan = mesh(new THREE.CylinderGeometry(.35, .3, .05, 32), base.material); pan.position.set(s * 1.05, .9, 0); g.add(pan); }); return g; }
    case 'pulley': { const w = mesh(new THREE.CylinderGeometry(num(shape.r, .3), num(shape.r, .3), .12, 48), makeMaterial('brass')); w.rotation.x = Math.PI / 2; g.add(w); return g; }
    case 'boat': { const hull = mesh(new THREE.LatheGeometry([[.001, -.25], [.35, -.2], [.5, 0], [.52, .05]].map(p => new THREE.Vector2(p[0], p[1])), 32), makeMaterial(matSpec || 'wood')); hull.scale.set(1, 1, .45); g.add(hull); const mast = mesh(new THREE.CylinderGeometry(.02, .02, 1, 8), makeMaterial('darkwood')); mast.position.y = .5; g.add(mast); const sail = mesh(new THREE.PlaneGeometry(.5, .7), makeMaterial({ preset: 'fabric', color: '#efe6d0', side: 'double' }), false); sail.position.set(.27, .55, 0); g.add(sail); g.userData.sail = sail; return g; }
    case 'car': { const b = mesh(new RoundedBoxGeometry(1.2, .35, .6, 3, .08), makeMaterial(matSpec || { preset: 'plastic', color: '#c03a2a' })); b.position.y = .3; const c = mesh(new RoundedBoxGeometry(.6, .28, .55, 3, .08), makeMaterial('glass')); c.position.set(-.05, .55, 0); g.add(b, c); [[.4, .3], [.4, -.3], [-.4, .3], [-.4, -.3]].forEach(([x, z]) => { const w = mesh(new THREE.CylinderGeometry(.14, .14, .1, 24), makeMaterial('rubber')); w.rotation.x = Math.PI / 2; w.position.set(x, .14, z); g.add(w); }); return g; }
    case 'particles': {
      if (shape.type === 'vapour') return vapourPoints(num(shape.count, 160), shape.area || [2, 1.5, 2], num(shape.size, .16));
      if (shape.type === 'streaks') return rainStreaks(num(shape.count, 420), { len: num(shape.length, .16), width: num(shape.width, .007) });
      const n = num(shape.count, 400), a = shape.area || [8, 6, 8], kind = shape.type || 'dust', geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry(9);
      for (let i = 0; i < n; i++) { p[i * 3] = (r() - .5) * a[0]; p[i * 3 + 1] = r() * a[1]; p[i * 3 + 2] = (r() - .5) * a[2]; }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const col = { rain: 0xaaccee, snow: 0xffffff, dust: 0xffd590, bubbles: 0xcfeeff, stars: 0xffffff, sparks: 0xffb050 }[kind] || 0xffffff;
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: num(shape.size, kind === 'snow' ? .08 : .04), color: col, transparent: true, opacity: .8, depthWrite: false, blending: kind === 'sparks' || kind === 'dust' ? THREE.AdditiveBlending : THREE.NormalBlending }));
      pts.userData.particles = { kind, area: a, speed: num(shape.speed, kind === 'rain' ? 6 : kind === 'snow' ? .6 : .15) }; pts.frustumCulled = false; return pts;
    }
    default: return mesh(new THREE.BoxGeometry(1, 1, 1), mat());
  }
}

// Build a body from the scene spec into the world; returns its root Object3D.
export function buildBody(b, ctx) {
  const shape = b.shape || { kind: 'box' };
  let o = buildShape(shape, b.material, { seed: ctx.seedOf(b.id), params: ctx.params, headless: ctx.headless });
  if (!o.isGroup) { const g = new THREE.Group(); g.add(o); o = g; }
  const p = b.position || [0, 0, 0], r = b.rotation || [0, 0, 0], s = b.scale;
  o.position.set(num(p[0], 0), num(p[1], 0), num(p[2], 0));
  o.rotation.set(num(r[0], 0) * D2R, num(r[1], 0) * D2R, num(r[2], 0) * D2R);
  if (s != null) { if (Array.isArray(s)) o.scale.set(num(s[0], 1), num(s[1], 1), num(s[2], 1)); else o.scale.setScalar(num(s, 1)); }
  o.name = b.name || b.id;
  o.userData.bodyId = b.id; o.userData.role = b.role || 'decor'; o.userData.label = b.label || b.name || b.id; o.userData.describe = b.describe || '';
  o.userData.spec = b;
  if (b.castShadow === false) o.traverse(m => { m.castShadow = false; });
  if (b.hidden) o.visible = false;
  return o;
}
export { V3, treeForest };
