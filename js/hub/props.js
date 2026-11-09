// Library furniture in the baroque language of the hall (see docs/research/baroque-libraries.md):
// bookcases (horizontal / vertical) with cream-lacquer or walnut carcass, fluted pilasters, gilded cornice and crest,
// their tiers left open for scrolls (a velvet cradle marks every slot); scroll-books with legible, non-overlapping
// name tags; a fauteuil, a reading desk with lectern, display columns of the classical orders in antique marbles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { parchment, labelTex, leather, damaskTex, canvasTex, runnerTex, radialGlow } from '../gfx/textures.js';
import { hashStr } from '../util.js';
import { makeMaterial } from '../gfx/materials.js';
import { Acc, bmat, Mx, cartoucheShape, pedestal, addColumn, colDiameter, bandPlane, rng } from '../gfx/baroque.js';
import { kitAdd } from './kit.js';

export const SHELF_KINDS = {
  horizontal: { w: 3.2, h: 1.7, d: .5, tiers: 3 },
  vertical: { w: 1.15, h: 2.9, d: .5, tiers: 6 }
};
export const SLOT = .17; // slot pitch along a tier (hub.js: per = floor((w - .2) / .17))
// Scrolls: radius .058 m (0.116 m across: 54 mm between neighbours at the 0.17 m pitch, 38 mm between their ribbons),
// lying in velvet cradles whose hollow (radius R + 3 mm) is centred on the scroll's axis, AXIS above the tier board
// (the scroll's underside 14 mm above the board). SCROLL_L 0.29 m: knob to knob a scroll is 0.40 m long, so it lies
// wholly on the tier board (0.43 m from the silk liner to the board's front edge); at 0.5 m the front knob, the tag
// and the front cradles stood 15 cm out past the case's face.
export const SCROLL_R = .058, SCROLL_L = .29, AXIS = .072;
function m(geo, mat) { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.receiveShadow = true; return o; }
const urnGeo = () => new THREE.LatheGeometry([[0, 0], [.045, 0], [.05, .015], [.025, .03], [.02, .045], [.055, .08], [.05, .11], [.02, .13], [.012, .15], [.02, .165], [0, .18]].map(([r, y]) => new THREE.Vector2(r, y)), 16);

// Bookcase. shelf: { id, name, kind, w?, tiers?, finish?: 'cream' (ivory and gold, Admont) | 'walnut' (Metten) | 'pale' (Mafra) }
// The tiers carry the scrolls and nothing else: every slot has a pair of velvet cradles (one instanced draw call),
// so an empty bookcase reads as ready for scrolls. Boards' tops at .13 + i·tierH; slotPos() y = board + AXIS.
export function makeBookcase(shelf) {
  const K = SHELF_KINDS[shelf.kind] || SHELF_KINDS.horizontal, w = shelf.w || K.w, h = K.h, d = K.d, tiers = shelf.tiers || K.tiers;
  const g = new THREE.Group(); g.userData = { shelfId: shelf.id, kind: 'shelf', w, h, d, tiers };
  const fin = shelf.finish === 'walnut' || shelf.finish === 'pale' ? shelf.finish : 'cream', A = new Acc();
  const car = bmat(fin), back = bmat(fin === 'cream' ? 'cream-back' : fin + '-dark'), gilt = bmat(fin === 'pale' ? 'pale-dark' : 'gilt'), flute = bmat(fin === 'cream' ? 'fluted' : fin);
  const t = .05, tierH = (h - .12) / tiers, B = (mat, x, y, z, a, b, c) => A.add(mat, new THREE.BoxGeometry(a, b, c), Mx(x, y, z));
  // plinth with a gilt bead
  B(car, 0, .06, .0, w + .1, .12, d + .06); B(gilt, 0, .126, d / 2 + .028, w + .104, .014, .014); B(back, 0, .006, 0, w + .06, .012, d + .02);
  // carcass
  [-1, 1].forEach(s => B(car, s * (w / 2 - t / 2), h / 2, 0, t, h, d));
  B(back, 0, .13 + (h - .13) / 2, -d / 2 + .02, w - 2 * t, h - .13, .02);
  const board = fin === 'cream' ? bmat('cream-board') : car;   // the tier boards: matte painted wood (a lacquered top mirrored the sky as cold lavender)
  B(board, 0, .115, -.005, w - 2 * t, .03, d - .05);   // boards stop 5 mm before the back panel's rear face
  for (let i = 1; i < tiers; i++) { const top = .13 + i * tierH; B(board, 0, top - .0125, -.01, w - 2 * t, .025, d - .05); B(gilt, 0, top - .0125, (d - .05) / 2 - .01 + .004, w - 2 * t, .014, .008); }
  B(car, 0, h - .015, -.005, w - 2 * t, .03, d - .05);
  // fluted pilasters on the stiles, gilt bases and capitals
  [-1, 1].forEach(s => {
    const x = s * (w / 2 - .025), y0 = .135, y1 = h - .07;
    A.add(flute, new THREE.BoxGeometry(.085, y1 - y0, .03), Mx(x, (y0 + y1) / 2, d / 2 + .015));
    B(gilt, x, y0 + .006, d / 2 + .018, .1, .024, .036); B(gilt, x, y1 + .02, d / 2 + .02, .11, .04, .04);
    A.add(gilt, new THREE.TorusGeometry(.016, .006, 6, 12), Mx(x - s * .022, y1 + .03, d / 2 + .042)); A.add(gilt, new THREE.TorusGeometry(.016, .006, 6, 12), Mx(x + s * .022, y1 + .03, d / 2 + .042));
  });
  // fielded side panels with gilt frames
  [-1, 1].forEach(s => {
    const x = s * (w / 2 + .004), ph = h - .42, pz = d - .16;
    B(car, x, .2 + ph / 2 + .02, -.01, .008, ph, pz); B(back, s * (w / 2 + .0085), .2 + ph / 2 + .02, -.01, .002, ph - .1, pz - .1);
    [[.2 + .02, pz + .04, .014], [.2 + ph + .02, pz + .04, .014]].forEach(([y, a, b]) => B(gilt, s * (w / 2 + .01), y, -.01, .006, b, a));
    [-1, 1].forEach(t => B(gilt, s * (w / 2 + .01), .22 + ph / 2, -.01 + t * (pz / 2 + .013), .006, ph + .014, .014));
  });
  // a carved shell on the apron of the plinth
  A.add(gilt, new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .012, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 1, curveSegments: 6 }), Mx(0, .065, d / 2 + .03, 0, 0, 0, .2, .085, 1));
  // frieze (carved egg-and-dart), dentils and the gilded cornice
  B(car, 0, h + .05, .0, w + .04, .1, d + .02);
  A.add(fin === 'pale' ? car : bmat('eggdart'), bandPlane(w + .04, .046, .085), Mx(0, h + .05, d / 2 + .013));   // 3 mm before the frieze
  for (let x = -w / 2 - .055; x <= w / 2 + .056; x += .045) B(car, x, h + .088, d / 2 + .035, .024, .026, .03); B(gilt, 0, h + .006, d / 2 + .012, w + .06, .014, .012); B(gilt, 0, h + .094, d / 2 + .016, w + .07, .014, .014);
  B(car, 0, h + .125, .0, w + .16, .05, d + .1); B(gilt, 0, h + .1625, .0, w + .2, .025, d + .12); B(car, 0, h + .185, -.005, w + .14, .02, d + .08);
  const top0 = h + .195;
  // crest: a gilt framed plaque with C-scrolls and a shell, carrying the subject name
  const pw = Math.min(w * .62, 1.5), ph = .17, cy = top0 + ph / 2 + .04, cz = d / 2 - .03;
  B(gilt, 0, cy, cz, pw + .05, ph + .05, .035); B(gilt, 0, top0 + .02, cz, pw * .7, .04, .06);
  [-1, 1].forEach(s => {
    A.add(gilt, new THREE.TorusGeometry(.06, .016, 8, 20, Math.PI * 1.4), Mx(s * (pw / 2 + .055), cy - .01, cz, 0, 0, s > 0 ? -Math.PI * .45 : Math.PI * 1.05));
    A.add(gilt, new THREE.TorusGeometry(.03, .012, 6, 14), Mx(s * (pw / 2 + .1), cy - .07, cz));
  });
  const shell = new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .02, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 1, curveSegments: 8 });
  A.add(gilt, shell, Mx(0, cy + ph / 2 + .075, cz - .01, 0, 0, 0, .2, .14, 1));
  A.add(gilt, urnGeo(), Mx(0, cy + ph / 2 + .14, cz, 0, 0, 0, .6));
  [-1, 1].forEach(s => A.add(gilt, urnGeo(), Mx(s * (w / 2 + .03), top0, d / 2 - .03)));
  // a globe on wide cases, a stack of tomes on the other end
  if (w > 2) {
    const gx = w / 2 - .45; A.add(gilt, new THREE.CylinderGeometry(.02, .07, .1, 14), Mx(gx, top0 + .05, -.02)); A.add(gilt, new THREE.TorusGeometry(.14, .006, 6, 48), Mx(gx, top0 + .24, -.02, 0, Math.PI / 2, .4));
    const globe = m(new THREE.SphereGeometry(.125, 32, 20), new THREE.MeshPhysicalMaterial({ map: globeTex(), roughness: .45, clearcoat: .6 })); globe.position.set(gx, top0 + .24, -.02); globe.rotation.z = .4; g.add(globe);
    const tones = ['#5a2a1e', '#2a3a5a', '#3a4a2a', '#6a4a20'];
    let y = top0; for (let i = 0; i < 3; i++) { const th = .055 + i * .008; const tome = m(new RoundedBoxGeometry(.3 - i * .03, th, .22 - i * .01, 2, .008), new THREE.MeshStandardMaterial({ color: tones[i], roughness: .65 })); tome.position.set(-w / 2 + .42, y + th / 2, -.03); tome.rotation.y = (i - 1) * .22; g.add(tome); y += th; }
  }
  A.build(g);
  g.userData.tierH = tierH; g.userData.slotsPerTier = Math.max(1, Math.floor((w - .2) / SLOT));
  // the tiers' back lined with sage silk damask (3 mm before the back board), so empty tiers read as a finished display case
  const lw = w - 2 * t - .004, lh = h - .13 - .034, lg = new THREE.PlaneGeometry(lw, lh), luv = lg.attributes.uv; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * lw / .32, luv.getY(i) * lh / .32);
  const liner = new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({ map: damaskTex('#3e5446', 'liner'), roughness: .8, sheen: .6, sheenColor: new THREE.Color(0xc8d8c0), sheenRoughness: .5 }));
  liner.position.set(0, .13 + (h - .13) / 2 - .002, -d / 2 + .033); liner.receiveShadow = true; liner.name = 'liner'; g.add(liner);
  scrollRests(g);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: labelTex(shelf.name || 'Unnamed', { w: 1024, h: 116, bg: '#f4ecd9', fg: '#3b2814', border: '#b48a3e', font: '600 72px "IM Fell English SC", Georgia, serif' }), roughness: .6, emissive: 0xffffff, emissiveIntensity: .06, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  plaque.material.emissiveMap = plaque.material.map;
  plaque.position.set(0, cy, cz + .0185 + .003); plaque.name = 'plaque'; g.add(plaque);   // 3 mm before the gilt frame's face
  return g;
}
function globeTex() {
  return canvasTex('globe2', 512, 256, (g, w, h) => {
    g.fillStyle = '#c9b48a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a7444';
    const blob = (x, y, rx, ry, k) => { g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 1 + .25 * Math.sin(a * 3 + k) + .15 * Math.sin(a * 5 + k * 2); g.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r); } g.fill(); };
    blob(110, 90, 60, 45, 1); blob(140, 170, 30, 50, 2); blob(270, 80, 70, 35, 3); blob(290, 160, 35, 45, 4); blob(420, 170, 40, 25, 5);
    g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 1; for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); } for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, j * h / 6); g.lineTo(w, j * h / 6); g.stroke(); }
  });
}
// The scroll rests: for every slot of every tier one holder, a pair of low cradles (a saddle 7 cm wide with a hollow of
// radius R + 3 mm centred on the scroll's axis, 18 mm high at its horns), under the scroll at REST_DZ either side of its
// middle, in a dark, matte walnut-brown velvet close to the tier's own tone: quiet furniture, not a row of red accents.
// Shared geometry and material, one draw call per bookcase. Every tier carries them (setRestTiers(o, null)), so a new
// bookcase reads as ready for scrolls on all its rows.
let _restGeo, _restMat;
function restGeo() {
  if (_restGeo) return _restGeo;
  const hw = .025, rr = SCROLL_R + .006,   // (the 3 mm bevel narrows the hollow to R + 3 mm)
    a0 = Math.atan2(-Math.sqrt(rr * rr - hw * hw), hw), yE = AXIS + rr * Math.sin(a0), s = new THREE.Shape();
  s.moveTo(-hw, -.001); s.lineTo(hw, -.001); s.lineTo(hw, yE); s.absarc(0, AXIS, rr, a0, -Math.PI - a0, true); s.lineTo(-hw, -.001);
  const g = new THREE.ExtrudeGeometry(s, { depth: .018, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2, curveSegments: 12 }); g.translate(0, 0, -.009);
  g.userData.shared = true; return (_restGeo = g);
}
function scrollRests(o) {
  const u = o.userData, n = u.tiers * u.slotsPerTier * 2; if (!n) return null;
  const mat = _restMat || (_restMat = new THREE.MeshPhysicalMaterial({ color: 0x8c6c58, roughness: .95, sheen: .5, sheenColor: new THREE.Color(0xd8b8a0), sheenRoughness: .7 }))   /* a soft camel velvet a few steps below the board's cream: low contrast, warm */; mat.userData.shared = true;
  const im = new THREE.InstancedMesh(restGeo(), mat, n);
  im.castShadow = false; im.receiveShadow = true; im.name = 'scroll-rests'; o.add(im); u.rests = im;
  setRestTiers(o, null); return im;
}
// show the cradles on the given tiers only (a Set of tier indices; null: every tier, the default the hub uses)
export function setRestTiers(o, tiers) {
  const u = o.userData, im = u.rests; if (!im) return; const M = new THREE.Matrix4(); let i = 0;
  for (let t = 0; t < u.tiers; t++) { if (tiers && !tiers.has(t)) continue; for (let j = 0; j < u.slotsPerTier; j++) { const p = slotPos(o, t, j); [-REST_DZ, REST_DZ].forEach(dz => im.setMatrixAt(i++, M.makeTranslation(p.x, p.y - AXIS, p.z + dz))); } }
  im.count = i; im.visible = i > 0; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox();
}
// Slot position (local to the bookcase) for tier i, slot j: scrolls lie horizontally, ends facing out.
// The slots of a tier are centred between the stiles (they started 0.14 m from the left end, so every row was shifted
// left: on a vertical case 0.09 m of free board on the left against 0.28 m on the right).
export const slotX = (u, slot) => (slot - (u.slotsPerTier - 1) / 2) * SLOT;
// the slot nearest to x (bookcase frame) on a tier of u.slotsPerTier slots
export const slotAt = (u, x) => Math.max(0, Math.min(u.slotsPerTier - 1, Math.round(x / SLOT + (u.slotsPerTier - 1) / 2)));
// Along the scroll (local z), from its middle: the back knob reaches KNOB_TIP behind and the front knob as far before;
// the name tag hangs from the front knob TAG_Z before the middle (odd slots 7 mm further). SLOT_Z puts the front knob's
// tip at the tier board's front edge and the tag just before the board (2 mm clear of its gilt bead), where it hangs over
// the edge like a shelf label, still behind the stiles' face (d/2): nothing of a lying scroll leaves its bookcase, and
// the back knob stays 3 cm before the silk liner.
const KNOB_TIP = SCROLL_L / 2 + SCROLL_R * .95, TAG_Z = KNOB_TIP + .006;
const BOARD_FRONT = (SHELF_KINDS.horizontal.d - .05) / 2 - .01;
export const SLOT_Z = BOARD_FRONT + .006 - TAG_Z;
// the cradles: one under each end of the roll, 4 cm in from the spiral caps
export const REST_DZ = SCROLL_L / 2 - .04;
export function slotPos(shelfObj, tier, slot) {
  const u = shelfObj.userData, y = .13 + tier * u.tierH + AXIS, x = slotX(u, slot);
  return new THREE.Vector3(x, y, SLOT_Z);
}
// ---------- hanging scrolls ----------
// An important scroll can hang on two chains from the underside of the board above its tier (the top tier: from the
// case's top board), its axis across the case (along x), its front and name tag toward the room, in front of the row of
// cradles (z = HANG.z). Across the case it spans the roll and both knobs (±HALF = 0.2 m), so it reserves every slot
// whose cradled scroll (radius R, tag ±0.076 m) would come within 1 cm of it: |slotX − hangX| < HANG.reach (3 slots at
// the 0.17 m pitch). hangX keeps the knobs 2 cm inside the stiles.
// The drop (board underside → axis) is limited by the tier: at least HANG.min (the roll and its seal clear the board
// above by ≥ 4 cm), at most what keeps the hanging tag's lower edge ≥ 1.2 cm above the cradles' horns (HANG.below).
export const HALF = SCROLL_L / 2 + SCROLL_R * .95;
export const HANG = { z: .11, reach: HALF + .076 + .01, min: .11, below: .163 };
export const METALS = {
  brass: { label: 'Brass', color: 0xc9a253, rough: .36, metal: 1 },
  iron: { label: 'Iron', color: 0x75716a, rough: .55, metal: 1 },
  silver: { label: 'Silver', color: 0xdcdde0, rough: .26, metal: 1 },
  gold: { label: 'Gold', color: 0xf2c25c, rough: .22, metal: 1 },
  black: { label: 'Black', color: 0x1d1b19, rough: .42, metal: .85 }
};
export function tierSpan(so, t) { const u = so.userData, floor = .13 + t * u.tierH, ceil = t < u.tiers - 1 ? .13 + (t + 1) * u.tierH - .025 : u.h - .03; return { floor, ceil }; }
export function hangLimits(so, t) { const { floor, ceil } = tierSpan(so, t); return { min: HANG.min, max: Math.max(HANG.min, ceil - floor - HANG.below) }; }
export function hangX(so, slot) { const u = so.userData, lim = Math.max(0, u.w / 2 - .05 - HALF - .02); return Math.max(-lim, Math.min(lim, slotX(u, slot))); }
// the slots a scroll hanging at `slot` reserves on its tier
export function hangSlots(so, slot) { const u = so.userData, hx = hangX(so, slot), out = []; for (let j = 0; j < u.slotsPerTier; j++) if (Math.abs(slotX(u, j) - hx) < HANG.reach) out.push(j); return out; }
export const hangDrop = (so, t, drop) => { const L = hangLimits(so, t); return Math.max(L.min, Math.min(L.max, drop == null ? (L.min + L.max) / 2 : +drop || L.min)); };
// Put a scroll object (a child of its bookcase) in its pose: lying in its cradles, or hanging (book.hang = {metal, drop}).
export function poseScroll(o, so, book) {
  const u = o.userData, tag = u.tag, cord = u.cord, R = SCROLL_R;
  if (tag && !u.tag0) u.tag0 = { p: tag.position.clone(), r: tag.rotation.clone(), cp: cord.position.clone(), cs: cord.scale.y, len: cord.userData.len };
  const t = book.tier || 0, sl = book.slot || 0;
  if (book.hang) {
    const { ceil } = tierSpan(so, t), drop = hangDrop(so, t, book.hang.drop);
    o.position.set(hangX(so, sl), ceil - drop, HANG.z); o.rotation.set(0, Math.PI / 2, 0);
    // the tag hangs from the ribbon at the roll's middle, before its front (local −x faces the room)
    const top = -R * .25; if (tag) { tag.position.set(-(R + .008), top - TAG_H / 2, 0); tag.rotation.set(0, -Math.PI / 2, 0);
      const cl = -top + R * .2; cord.position.set(-(R + .005), top + cl / 2, 0); cord.scale.y = cl / u.tag0.len; }
    u.hanging = true;
  } else {
    o.position.copy(slotPos(so, t, sl)); o.rotation.set(0, 0, 0);
    if (tag) { tag.position.copy(u.tag0.p); tag.rotation.copy(u.tag0.r); cord.position.copy(u.tag0.cp); cord.scale.y = u.tag0.cs; }
    u.hanging = false;
  }
  return o;
}
// The chains of a bookcase's hanging scrolls: two per scroll, from the board's underside to the tops of the knobs, in
// small elongated links turned 90° each (pitch 10.6 mm). One InstancedMesh per metal in use on the bookcase (shared link
// geometry and metal materials), in a group 'chains' on the bookcase. items: [{x, top, bot, metal}] in bookcase space.
let _linkGeo; const _metalMat = {};
const LINK_PITCH = .0106;
function linkGeo() { if (_linkGeo) return _linkGeo; const g = new THREE.TorusGeometry(.0042, .00115, 4, 10); g.scale(1, 1.55, 1); g.userData.shared = true; return (_linkGeo = g); }
export function metalMat(k) {
  const M = METALS[k] || METALS.brass; if (_metalMat[k]) return _metalMat[k];
  const m = new THREE.MeshStandardMaterial({ color: M.color, metalness: M.metal, roughness: M.rough, envMapIntensity: 3 }); m.userData.shared = true; return (_metalMat[k] = m);
}
export function setChains(so, items) {
  let grp = so.userData.chains;
  if (grp) { grp.children.forEach(c => c.dispose && c.dispose()); grp.clear(); } else { grp = new THREE.Group(); grp.name = 'chains'; so.add(grp); so.userData.chains = grp; }
  const by = {}; items.forEach(it => (by[it.metal in METALS ? it.metal : 'brass'] ||= []).push(it));
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const k in by) {
    const mats = []; by[k].forEach(it => { const n = Math.max(2, Math.round((it.top - it.bot) / LINK_PITCH)); for (let i = 0; i < n; i++) { q.setFromAxisAngle(Y, (i % 2) * Math.PI / 2); p.set(it.x, it.top - .004 - i * (it.top - it.bot - .006) / (n - 1), it.z); mats.push(M.compose(p, q, one).clone()); } });
    const im = new THREE.InstancedMesh(linkGeo(), metalMat(k), mats.length); mats.forEach((m4, i) => im.setMatrixAt(i, m4));
    im.castShadow = false; im.receiveShadow = false; im.name = 'chain-' + k; im.raycast = () => { }; im.computeBoundingSphere(); grp.add(im);
  }
  return grp;
}
// the chain items for one hanging scroll (knob tops at ±(L/2 + 0.4 R) along the roll, 0.55 R high)
export function chainItems(so, book) {
  const t = book.tier || 0, { ceil } = tierSpan(so, t), drop = hangDrop(so, t, book.hang && book.hang.drop), x = hangX(so, book.slot || 0), kx = SCROLL_L / 2 + SCROLL_R * .4, yc = ceil - drop;
  return [-1, 1].map(s => ({ x: x + s * kx, z: HANG.z, top: ceil, bot: yc + SCROLL_R * .55 - .002, metal: (book.hang && book.hang.metal) || 'brass' }));
}
// A ghost of a scroll for previews (a slot chosen in a dialog, a drag in Arrange mode): a soft warm translucent roll.
export function ghostScroll() {
  const g = new THREE.Group(); g.name = 'slot-ghost';
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcf86, transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(SCROLL_R * 1.05, SCROLL_R * 1.05, SCROLL_L + .1, 24, 1), mat); body.rotation.x = Math.PI / 2; g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(SCROLL_R * 1.25, .0035, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); ring.position.z = SCROLL_L / 2 + .06; g.add(ring);
  g.traverse(o => { if (o.isMesh) { o.raycast = () => { }; o.renderOrder = 6; o.castShadow = o.receiveShadow = false; } });
  g.userData.mat = mat; return g;
}
const ribbonColors = ['#8a2a1e', '#2d5b8e', '#3f7d6e', '#8f733a', '#6a4a8a', '#a0522d', '#2f4f4f'];
// Name tag for a scroll end: an ivory card narrower than the slot pitch (0.152 m < 0.17 m, 18 mm between neighbours),
// the title in a bold, open book face (Alegreya) wrapped on up to three lines and fitted as large as it will go, the
// book's colour as a thin band with its short code. 512 px canvas (≈ 3.4 px/mm: crisp at 1.5–3 m). Cached per title/colour.
const TAG_W = .152, TAG_H = .112;
function tagTex(title, col, icon, star) {
  return canvasTex('tag2|' + title + '|' + col + '|' + icon + (star ? '|*' : ''), 512, 376, (g, w, h) => {
    g.fillStyle = '#f7efdc'; g.fillRect(0, 0, w, h);
    const band = 44; g.fillStyle = col; g.fillRect(0, 0, w, band);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, band, w, 4);
    g.fillStyle = '#f7efdc'; g.beginPath(); g.arc(w / 2, band / 2, 11, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.stroke();
    if (star) { g.fillStyle = '#f4d27a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 16; g.lineTo(w - 30 + Math.cos(a) * r, band / 2 + 1 + Math.sin(a) * r); } g.fill(); }
    if (icon) { g.fillStyle = 'rgba(255,248,232,.95)'; g.font = '500 28px "IBM Plex Mono", monospace'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(String(icon).slice(0, 5), 18, band / 2 + 1); }
    g.strokeStyle = col; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#1e140b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const maxW = w - 40, words = String(title || 'Untitled').split(/\s+/), avail = h - band - 26;
    let lines, fs;
    for (fs = 104; fs >= 40; fs -= 4) {
      g.font = `700 ${fs}px "Alegreya", Georgia, serif`; lines = []; let cur = '';
      for (const wd of words) { const t2 = cur ? cur + ' ' + wd : wd; if (g.measureText(t2).width <= maxW) cur = t2; else { if (cur) lines.push(cur); cur = wd; } }
      if (cur) lines.push(cur);
      if (lines.length <= 3 && lines.every(l => g.measureText(l).width <= maxW) && lines.length * fs * 1.04 <= avail) break;
    }
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/\s*\S*$/, '') + '…'; }
    lines = lines.map(l => { while (g.measureText(l).width > maxW && l.length > 2) l = l.slice(0, -2) + '…'; return l; });
    const lh = fs * 1.04, y0 = band + 4 + (h - band - 4) / 2 - (lines.length - 1) * lh / 2 + fs * .04;
    lines.forEach((l, i) => g.fillText(l, w / 2, y0 + i * lh));
  }, { aniso: 16 });
}
export function makeScroll(book, scale = 1) {
  const g = new THREE.Group(); g.userData = { bookId: book.id, kind: 'scroll' };
  const L = SCROLL_L * scale, R = SCROLL_R * scale;
  const paperM = new THREE.MeshStandardMaterial({ map: parchment('parchscroll', 256, 256), roughness: .8, color: 0xffffff, emissive: 0xffe2a8, emissiveIntensity: 0 });
  // the roll is an open tube: its ends are the spiral caps alone (a closed cylinder put its own caps in the caps' plane)
  const body = m(new THREE.CylinderGeometry(R, R, L, 32, 1, true), paperM); body.rotation.x = Math.PI / 2; g.add(body); g.userData.paper = paperM;
  // spiral end caps (rolled paper) + wooden knobs
  [-1, 1].forEach(s => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 32), spiralMat()); cap.position.z = s * L / 2; if (s < 0) cap.rotation.y = Math.PI; g.add(cap);
    const knob = m(new THREE.SphereGeometry(R * .55, 16, 12), makeMaterial('darkwood')); knob.position.z = s * (L / 2 + R * .4); g.add(knob);
  });
  const col = book.color || ribbonColors[(book.title || '').length % ribbonColors.length];
  const rib = m(new THREE.TorusGeometry(R * 1.02, R * .12, 8, 32), new THREE.MeshStandardMaterial({ color: col, roughness: .6 })); g.add(rib);
  const seal = m(new THREE.CylinderGeometry(R * .38, R * .4, R * .16, 20), new THREE.MeshStandardMaterial({ color: col, roughness: .35, metalness: .05 })); seal.position.set(0, R * 1.05, 0); g.add(seal);
  // name tag hanging below the front knob; odd slots sit a little forward and lower, so neighbours never share a plane
  const odd = (book.slot | 0) % 2, sc = scale;
  const tagM = new THREE.MeshStandardMaterial({ map: tagTex(book.title || 'Untitled', col, book.icon || '', !!book.important), roughness: .82, emissive: 0xffffff, emissiveIntensity: .16, polygonOffset: true, polygonOffsetFactor: -1 - odd, polygonOffsetUnits: -1 - odd });
  tagM.emissiveMap = tagM.map;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(TAG_W * sc, TAG_H * sc), tagM);
  const zf = L / 2 + R * .4 + R * .55 + .006 * sc + odd * .007 * sc, yTop = -R * .5 - odd * .014 * sc;
  tag.position.set(0, yTop - TAG_H * sc / 2, zf); tag.rotation.x = -.1; tag.name = 'tag'; g.add(tag); g.userData.tag = tag;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.0018 * sc, .0018 * sc, -yTop + .01 * sc, 4), new THREE.MeshStandardMaterial({ color: col, roughness: .8 }));
  cord.position.set(0, yTop / 2 + .004 * sc, zf - .004 * sc); cord.userData.len = -yTop + .01 * sc; g.add(cord); g.userData.cord = cord;
  return g;
}
let _spiral; function spiralMat() { return _spiral || (_spiral = new THREE.MeshStandardMaterial({ map: spiralTex(), roughness: .8 })); }
function spiralTex() {
  if (spiralTex.t) return spiralTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#e8d8b0'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(120,90,50,.55)'; x.lineWidth = 1.4; x.beginPath();
  for (let a = 0; a < 40; a += .1) { const r = a * 1.5; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (spiralTex.t = t);
}
// The sheet that unrolls from a scroll when it is opened, in the scroll's frame (its axis along z, the viewer toward −x):
// it leaves the front of the roll and hangs down, facing the viewer; scale.y (0 → 1) unrolls it, its top edge fixed.
// A weighted rod rides on its lower edge (userData.rod: set rod.position.y = −h · scale.y). The title is written on it.
export function makeSheet(w = .42, h = .6, title = '', R = SCROLL_R) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 1); geo.translate(0, -h / 2, 0); geo.rotateY(-Math.PI / 2);
  const tex = canvasTex(null, 512, Math.round(512 * h / w), (g, W, H) => {   /* the canvas has the sheet's own proportions: the title is never squeezed */
    g.drawImage(parchment('sheet', 512, 768).image, 0, 0, W, H); g.strokeStyle = 'rgba(143,115,58,.8)'; g.lineWidth = 3; g.strokeRect(26, 26, W - 52, H - 52);
    g.fillStyle = '#2a1e15'; g.textAlign = 'center'; g.font = '600 46px "IM Fell English SC", Georgia, serif';
    const words = String(title || '').split(/\s+/), lines = []; let cur = ''; words.forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > W - 110 && cur) { lines.push(cur); cur = wd; } else cur = t; }); if (cur) lines.push(cur);
    lines.slice(0, 5).forEach((l, i) => g.fillText(l, W / 2, 150 + i * 56, W - 100));
    g.strokeStyle = '#8f733a'; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 190 + Math.min(5, lines.length) * 56); g.lineTo(W - 150, 190 + Math.min(5, lines.length) * 56); g.stroke();
    g.font = 'italic 26px "Alegreya", Georgia, serif'; g.fillStyle = '#5b4532'; g.fillText('the room of this book', W / 2, 240 + Math.min(5, lines.length) * 56);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .8, side: THREE.DoubleSide, emissive: 0xfff0c8, emissiveMap: tex, emissiveIntensity: 0 });
  const s = new THREE.Mesh(geo, mat); s.scale.y = .001; s.position.x = -R * .98; s.castShadow = false;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, w + .05, 16), makeMaterial('darkwood')); rod.rotation.x = Math.PI / 2; rod.position.set(-R * .98 - .006, 0, 0);
  [-1, 1].forEach(k => { const kn = new THREE.Mesh(new THREE.SphereGeometry(.018, 12, 8), makeMaterial('darkwood')); kn.position.y = k * (w / 2 + .03); rod.add(kn); });
  // the halo: a soft warm glow behind the sheet (additive, no depth writes), a little wider and taller than the sheet and
  // unrolled with it (a child of the sheet: same top-fixed scale); only its rim shows round the opaque sheet
  const hg = new THREE.PlaneGeometry(w * 2.1, h * 1.5); hg.translate(0, -h / 2, 0); hg.rotateY(-Math.PI / 2);
  const halo = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ map: radialGlow('255,196,120'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }));
  halo.position.x = .03; halo.renderOrder = -1; halo.raycast = () => { }; s.add(halo);
  const grp = new THREE.Group(); grp.add(s, rod); grp.userData = { sheet: s, rod, h, halo }; grp.name = 'open-sheet';
  return grp;
}
// A cabriole leg as a tube along a curve (knee forward, ankle in, a gilt pad foot)
function cabriole(A, mat, foot, x, z, top, sx, sz, r = .026) {
  const c = new THREE.CubicBezierCurve3(new THREE.Vector3(x, top, z), new THREE.Vector3(x + sx * .07, top - .1, z + sz * .07), new THREE.Vector3(x - sx * .03, .1, z - sz * .03), new THREE.Vector3(x + sx * .01, .02, z + sz * .01));
  A.add(mat, new THREE.TubeGeometry(c, 14, r, 8), new THREE.Matrix4());
  A.add(foot, new THREE.SphereGeometry(r * 1.25, 10, 8), Mx(x + sx * .015, .022, z + sz * .015, 0, 0, 0, 1, .7, 1));
}
// Baroque fauteuil: gilt cabriole frame, damask seat and cartouche back
export function armchair() {
  const g = new THREE.Group(), A = new Acc(), gilt = bmat('gilt');
  const fab = new THREE.MeshPhysicalMaterial({ map: damaskTex('#7c3038'), roughness: .9, sheen: 1, sheenColor: new THREE.Color(0xffc8b0), sheenRoughness: .5 });
  A.add(fab, new RoundedBoxGeometry(.68, .12, .6, 3, .05), Mx(0, .47, .02));
  [[0, .405, .32, .7, .07, .03], [0, .405, -.28, .7, .07, .03], [.345, .405, .02, .03, .07, .62], [-.345, .405, .02, .03, .07, .62]].forEach(([x, y, z, a, b, c]) => A.add(gilt, new THREE.BoxGeometry(a, b, c), Mx(x, y, z)));
  A.add(gilt, new THREE.TorusGeometry(.05, .012, 6, 16, Math.PI), Mx(0, .38, .335, 0, 0, Math.PI));
  [[.32, .3, 1, 1], [-.32, .3, -1, 1], [.31, -.26, 1, -1], [-.31, -.26, -1, -1]].forEach(([x, z, sx, sz]) => cabriole(A, gilt, gilt, x, z, .42, sx, sz));
  // back: an arched cartouche, upholstered, framed by a gilt moulding
  const bs = new THREE.Shape(); bs.moveTo(-.29, 0); bs.lineTo(.29, 0); bs.lineTo(.3, .42); bs.bezierCurveTo(.3, .56, .14, .6, 0, .66); bs.bezierCurveTo(-.14, .6, -.3, .56, -.3, .42); bs.lineTo(-.29, 0);
  const BM = Mx(0, .53, -.3, -.14);
  const bg = new THREE.ExtrudeGeometry(bs, { depth: .06, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 3, curveSegments: 14 }); bg.translate(0, 0, -.03);
  A.add(fab, bg, BM);
  const outline = new THREE.CatmullRomCurve3(bs.getPoints(16).map(p => new THREE.Vector3(p.x * 1.05, p.y * 1.02 - .005, .0)), true);
  A.add(gilt, new THREE.TubeGeometry(outline, 80, .02, 6, true), BM);
  A.add(gilt, new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .015, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 1 }), BM.clone().multiply(Mx(0, .7, .07, 0, 0, 0, .14, .1, 1)));
  [-1, 1].forEach(s => {
    A.add(gilt, new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(s * .3, .72, -.24), new THREE.Vector3(s * .36, .7, -.05), new THREE.Vector3(s * .36, .66, .2), new THREE.Vector3(s * .33, .62, .27)), 16, .02, 6), new THREE.Matrix4());
    A.add(gilt, new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(s * .33, .62, .27), new THREE.Vector3(s * .36, .56, .3), new THREE.Vector3(s * .33, .5, .28), new THREE.Vector3(s * .33, .44, .3)), 10, .018, 6), new THREE.Matrix4());
    A.add(fab, new RoundedBoxGeometry(.07, .035, .3, 2, .015), Mx(s * .355, .715, .0, 0, 0, s * .05));
  });
  A.build(g); return g;
}
// Reading desk (bureau plat) with a lectern, an open book, an inkwell and a candlestick
export function readingDesk() {
  const g = new THREE.Group(), A = new Acc(), wn = bmat('walnut'), gilt = bmat('gilt');
  A.add(wn, new RoundedBoxGeometry(1.6, .05, .8, 2, .015), Mx(0, .765, 0));
  A.add(gilt, new THREE.BoxGeometry(1.62, .012, .012), Mx(0, .745, .405)); A.add(gilt, new THREE.BoxGeometry(1.62, .012, .012), Mx(0, .745, -.405));
  [[0, .68, .37, 1.44, .12, .03], [0, .68, -.37, 1.44, .12, .03], [.72, .68, 0, .03, .12, .74], [-.72, .68, 0, .03, .12, .74]].forEach(([x, y, z, a, b, c]) => A.add(wn, new THREE.BoxGeometry(a, b, c), Mx(x, y, z)));
  A.add(gilt, new THREE.ExtrudeGeometry(cartoucheShape(), { depth: .01, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 1 }), Mx(0, .68, .386, 0, 0, 0, .16, .1, 1));
  [-1, 1].forEach(s => { A.add(gilt, new THREE.BoxGeometry(.3, .01, .006), Mx(s * .42, .66, .388)); A.add(gilt, new THREE.SphereGeometry(.016, 8, 6), Mx(s * .42, .68, .392)); });
  [[.7, .35, 1, 1], [-.7, .35, -1, 1], [.7, -.35, 1, -1], [-.7, -.35, -1, -1]].forEach(([x, z, sx, sz]) => cabriole(A, wn, gilt, x, z, .7, sx, sz, .032));
  // tooled-leather top
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1.34, .6), new THREE.MeshStandardMaterial({ map: leather('#2c4634', 'blotter2'), roughness: .62 })); top.rotation.x = -Math.PI / 2; top.position.y = .7925; top.receiveShadow = true; g.add(top);   // 2.5 mm above the desk top
  [[0, .3, 1.36, .01], [0, -.3, 1.36, .01], [.67, 0, .01, .6], [-.67, 0, .01, .6]].forEach(([x, z, a, b]) => A.add(gilt, new THREE.BoxGeometry(a, .006, b), Mx(x, .793, z)));
  // lectern with an open book
  const LM = Mx(-.18, .79, -.12, -.42);
  A.add(wn, new THREE.BoxGeometry(.56, .02, .4), LM.clone().multiply(Mx(0, .01, .2 - .02))); A.add(wn, new THREE.BoxGeometry(.5, .03, .03), LM.clone().multiply(Mx(0, .025, .39)));
  A.add(wn, new THREE.BoxGeometry(.06, .18, .03), Mx(-.18, .86, -.24, .3));
  const pageM = new THREE.MeshStandardMaterial({ map: parchment('deskbook', 256, 256), roughness: .85 });
  A.add(new THREE.MeshStandardMaterial({ color: 0x5a2418, roughness: .6 }), new THREE.BoxGeometry(.5, .012, .35), LM.clone().multiply(Mx(0, .026, .19)));
  [-1, 1].forEach(s => A.add(pageM, new THREE.BoxGeometry(.235, .022, .33), LM.clone().multiply(Mx(s * .12, .044, .19, 0, 0, -s * .07))));

  // an inkstand (inkwell, pounce pot, quill) and a candlestick: the hand-made props (js/hub/kit.js) when they are loaded,
  // else procedural ones with the same footprint (candle top 0.40 m above the desk top, so the flame sits on the wick)
  if (!kitAdd(g, 'inkstand', Mx(.4, .7942, -.14, 0, .2))) {   /* its bun feet on the leather (0.7925) */
    A.add(gilt, new THREE.CylinderGeometry(.035, .04, .05, 16), Mx(.42, .815, -.15)); A.add(new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: .2 }), new THREE.CylinderGeometry(.022, .022, .006, 12), Mx(.42, .842, -.15));
    A.add(bmat('paint'), new THREE.ConeGeometry(.012, .28, 6), Mx(.45, .93, -.15, .2, 0, -.35));
  }
  if (!kitAdd(g, 'candlestick', Mx(.58, .79, .12))) {
    A.add(gilt, new THREE.LatheGeometry([[0, 0], [.07, 0], [.07, .015], [.025, .03], [.015, .12], [.03, .2], [.012, .23], [.04, .25], [.04, .26], [0, .26]].map(([r, y]) => new THREE.Vector2(r, y)), 18), Mx(.58, .79, .12));
    A.add(bmat('candle'), new THREE.CylinderGeometry(.018, .018, .14, 12), Mx(.58, 1.12, .12));
  }
  A.add(bmat('flame'), new THREE.SphereGeometry(.013, 8, 6), Mx(.58, 1.205, .12, 0, 0, 0, 1, 1.9, 1));
  A.build(g); return g;
}
// A display column of one of the classical orders on a pedestal, with an entablature fragment on top (it replaces
// the statues). opts: { order: 'doric'|'ionic'|'corinthian'|'composite'|'solomonic', marble (shaft stone), gilt
// (gilt capital), H (column with base and capital, m), pedestal (m), die (pedestal die material) }. Local: foot at y = 0.
export function displayColumn({ order = 'corinthian', marble = 'pavonazzetto', gilt = false, H = 3.2, pedestal: pH = .9, die = 'scag-dark' } = {}) {
  const g = new THREE.Group(); g.name = 'column'; g.userData = { kind: 'column', order };
  const A = new Acc(), D = colDiameter(order, H), w = D * 1.36 + .1;
  if (pH > 0) pedestal(A, new THREE.Matrix4(), w, w, pH, die);
  addColumn(A, Mx(0, pH, 0), { order, marble, gilt, H, D, entab: true });
  A.build(g); return g;
}

// ---------- the reading floor: refectory reading tables with lecterns, benches, a pair of globes, a carpet runner ----------
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const legProfile = h => [[0, 0], [.045, 0], [.05, .035], [.032, .08], [.042, .2], [.056, .36], [.05, .46], [.032, .56], [.03, .62], [.042, h - .05], [.042, h], [0, h]].map(([r, y]) => [r, Math.min(y, h)]);
// A lectern on a table top (local: stands on y = 0, the reader at +z), with an open book on its sloped board.
function lectern(A, M, wn, gilt) {
  const L = M.clone().multiply(Mx(0, .03, 0, -.5));
  A.add(wn, new THREE.BoxGeometry(.5, .02, .36), L.clone().multiply(Mx(0, .01, 0)));
  A.add(wn, new THREE.BoxGeometry(.46, .028, .03), L.clone().multiply(Mx(0, .03, .19)));
  A.add(wn, new THREE.BoxGeometry(.44, .03, .3), M.clone().multiply(Mx(0, .015, .0)));
  A.add(wn, new THREE.BoxGeometry(.05, .17, .05), M.clone().multiply(Mx(0, .1, -.1, .45)));
  A.add(gilt, new THREE.BoxGeometry(.46, .008, .008), M.clone().multiply(Mx(0, .032, .15)));
  A.add(bmat('walnut-dark'), new THREE.BoxGeometry(.46, .012, .32), L.clone().multiply(Mx(0, .026, 0)));
  const pageM = bmat('pages');
  [-1, 1].forEach(s => A.add(pageM, new THREE.BoxGeometry(.215, .02, .3), L.clone().multiply(Mx(s * .11, .042, 0, 0, 0, -s * .08))));
}
export function readingTable({ L = 2.4, W = .9 } = {}) {
  const g = new THREE.Group(), A = new Acc(), wn = bmat('walnut'), gilt = bmat('gilt'), H = .76; g.name = 'reading-table';
  A.add(wn, new RoundedBoxGeometry(W, .055, L, 2, .015), Mx(0, H + .0275, 0));
  [-1, 1].forEach(s => { A.add(gilt, new THREE.BoxGeometry(.012, .012, L + .01), Mx(s * (W / 2 + .002), H + .01, 0)); A.add(wn, new THREE.BoxGeometry(.03, .1, L - .2), Mx(s * (W / 2 - .07), H - .05, 0)); A.add(wn, new THREE.BoxGeometry(W - .14, .1, .03), Mx(0, H - .05, s * (L / 2 - .1))); });
  const nl = L > 2 ? 3 : 2;
  for (let i = 0; i < nl; i++) { const z = -L / 2 + .14 + i * (L - .28) / (nl - 1); [-1, 1].forEach(s => { A.add(wn, lathe(legProfile(H)), Mx(s * (W / 2 - .1), 0, z)); A.add(gilt, new THREE.TorusGeometry(.045, .008, 6, 14), Mx(s * (W / 2 - .1), .36, z, Math.PI / 2)); }); A.add(wn, new THREE.BoxGeometry(W - .2, .05, .05), Mx(0, .13, z)); }
  A.add(wn, new THREE.BoxGeometry(.05, .05, L - .28), Mx(0, .13, 0));
  // tooled leather top and a lectern facing each bench, an inkwell between them
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W - .16, L - .16), new THREE.MeshStandardMaterial({ map: leather('#2c4634', 'blotter2'), roughness: .62 })); top.rotation.x = -Math.PI / 2; top.position.y = H + .0575; top.receiveShadow = true; g.add(top);   // 2.5 mm above the board
  [[0, (L - .16) / 2, W - .16, .008], [0, -(L - .16) / 2, W - .16, .008], [(W - .16) / 2, 0, .008, L - .16], [-(W - .16) / 2, 0, .008, L - .16]].forEach(([x, z, a, b]) => A.add(gilt, new THREE.BoxGeometry(a, .006, b), Mx(x, H + .058, z)));   // gilt fillets 3.5 mm above the leather
  lectern(A, Mx(.1, H + .055, -L / 4, 0, Math.PI / 2), wn, gilt); lectern(A, Mx(-.1, H + .055, L / 4, 0, -Math.PI / 2), wn, gilt);
  A.add(gilt, new THREE.CylinderGeometry(.032, .038, .05, 14), Mx(0, H + .08, 0)); A.add(new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: .2 }), new THREE.CylinderGeometry(.02, .02, .006, 12), Mx(0, H + .106, 0));
  const tones = [0x5a2a1e, 0x2a3a5a, 0x3a4a2a];
  tones.forEach((c, i) => A.add(bmat('book-' + i), new RoundedBoxGeometry(.26 - i * .02, .05, .19 - i * .01, 2, .006), Mx(-.22, H + .08 + i * .05, -.08 + i * .01, 0, (i - 1) * .25)));
  A.build(g); return g;
}
export function bench({ L = 2.0 } = {}) {
  const g = new THREE.Group(), A = new Acc(), wn = bmat('walnut'), gilt = bmat('gilt'), H = .45; g.name = 'bench';
  A.add(wn, new RoundedBoxGeometry(.38, .05, L, 2, .012), Mx(0, H - .025, 0));
  const fab = new THREE.MeshPhysicalMaterial({ map: damaskTex('#7c3038'), roughness: .9, sheen: 1, sheenColor: new THREE.Color(0xffc8b0), sheenRoughness: .5 });
  A.add(fab, new RoundedBoxGeometry(.33, .055, L - .08, 3, .022), Mx(0, H + .022, 0));
  [-1, 1].forEach(sz => [-1, 1].forEach(sx => A.add(wn, lathe(legProfile(H - .05).map(([r, y]) => [r * .75, y])), Mx(sx * .12, 0, sz * (L / 2 - .12)))));
  A.add(wn, new THREE.BoxGeometry(.04, .04, L - .24), Mx(0, .1, 0)); A.add(wn, new THREE.BoxGeometry(.3, .07, .025), Mx(0, H - .085, L / 2 - .12)); A.add(wn, new THREE.BoxGeometry(.3, .07, .025), Mx(0, H - .085, -L / 2 + .12));
  [-1, 1].forEach(s => A.add(gilt, new THREE.BoxGeometry(.006, .01, L - .02), Mx(s * .193, H - .03, 0)));
  A.build(g); return g;
}
// A library globe (terrestrial or celestial) in a horizon ring on four cabriole legs, ~1.2 m tall.
export function globeStand({ celestial = false } = {}) {
  const g = new THREE.Group(), A = new Acc(), wn = bmat('walnut'), gilt = bmat('gilt'), R = .3, yc = .9; g.name = 'globe';
  // the stand: hand-made (turned legs, horizon ring with gilt beads, an engraved brass meridian; js/hub/kit.js) when
  // loaded, else built here; the globe itself is always drawn here (its map is a canvas texture)
  if (kitAdd(g, 'globestand')) { addGlobe(g, R, yc, celestial); return g; }
  [0, 1, 2, 3].forEach(i => { const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a); cabriole(A, wn, gilt, c * .3, s * .3, .84, c, s, .026); });
  A.add(wn, new THREE.BoxGeometry(.78, .035, .05), Mx(0, .16, 0, 0, Math.PI / 4)); A.add(wn, new THREE.BoxGeometry(.78, .035, .05), Mx(0, .16, 0, 0, -Math.PI / 4));
  A.add(gilt, lathe([[0, 0], [.04, 0], [.03, .04], [.012, .1], [.02, .14], [0, .16]], 12), Mx(0, .175, 0));
  const ring = new THREE.TorusGeometry(R + .07, .04, 6, 48); ring.rotateX(Math.PI / 2); A.add(wn, ring, Mx(0, yc, 0, 0, 0, 0, 1, .35, 1));
  const ring2 = new THREE.TorusGeometry(R + .11, .008, 6, 48); ring2.rotateX(Math.PI / 2); A.add(gilt, ring2, Mx(0, yc + .012, 0));
  A.add(gilt, new THREE.TorusGeometry(R + .025, .009, 6, 48, Math.PI * 1.6), Mx(0, yc, 0, 0, 0, Math.PI * .7 + .41));
  A.add(gilt, new THREE.CylinderGeometry(.008, .008, R * 2 + .12, 6), Mx(0, yc, 0, 0, 0, .41));
  [0, 1, 2, 3].forEach(i => { const a = i * Math.PI / 2 + Math.PI / 4; A.add(wn, new THREE.BoxGeometry(.03, yc - .84 + .02, .03), Mx(Math.cos(a) * (R + .07), (yc + .84) / 2 - .01, Math.sin(a) * (R + .07))); });
  A.build(g); addGlobe(g, R, yc, celestial);
  return g;
}
function addGlobe(g, R, yc, celestial) {
  const globe = m(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshPhysicalMaterial({ map: celestial ? celestialTex() : globeTex(), roughness: .42, clearcoat: .7, clearcoatRoughness: .2 }));
  globe.position.set(0, yc, 0); globe.rotation.set(0, celestial ? 1.2 : -.6, .41); g.add(globe);
}
function celestialTex() {
  return canvasTex('celestial', 512, 256, (g, w, h) => {
    g.fillStyle = '#1d2a44'; g.fillRect(0, 0, w, h); const r = rng(5);
    g.strokeStyle = 'rgba(214,180,100,.35)'; g.lineWidth = 1; for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); } for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, j * h / 6); g.lineTo(w, j * h / 6); g.stroke(); }
    g.strokeStyle = 'rgba(230,196,120,.8)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h / 2 + Math.sin(x / w * Math.PI * 2) * h * .13); g.stroke();
    for (let c = 0; c < 14; c++) { const cx = r() * w, cy = h * (.15 + r() * .7), pts = []; for (let k = 0; k < 4 + (r() * 4 | 0); k++) pts.push([cx + (r() - .5) * 70, cy + (r() - .5) * 50]); g.strokeStyle = 'rgba(214,180,100,.55)'; g.lineWidth = 1; g.beginPath(); pts.forEach(([x, y]) => g.lineTo(x, y)); g.stroke(); pts.forEach(([x, y]) => { g.fillStyle = '#f2d78e'; g.beginPath(); g.arc(x, y, 2 + r() * 2.5, 0, 7); g.fill(); }); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(240,220,160,${.3 + r() * .5})`; g.fillRect(r() * w, r() * h, 1.2, 1.2); }
  });
}
// The carpet runner along the hall's axis (a flat mesh: not an obstacle).
export function runner(len = 8, wid = 1.5) {
  const t = runnerTex(); t.repeat.set(1, len / (wid * 2)); const m2 = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), m2); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .005; mesh.receiveShadow = true; mesh.name = 'runner'; return mesh;
}

// A soft warm pool of light on the floor before a bookcase that holds the user's scrolls: an additive decal (no light,
// no shader cost, never an obstacle or a pick target). w: the bookcase width (m). Local: centred, lying on y = 0.
let _poolM;
export function lightPool(w = 3.2) {
  const mat = _poolM || (_poolM = new THREE.MeshBasicMaterial({ map: radialGlow('255,212,160'), color: 0xffd6a0, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false }));
  mat.userData.shared = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.rotation.x = -Math.PI / 2; mesh.scale.set(w + 1.8, 2.6, 1);
  mesh.renderOrder = 4; mesh.name = 'light-pool'; mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {}; return mesh;
}

// Small parts and gilt trim do not need to cast shadows (keeps the sun's shadow pass short). minR: world radius, m.
export function quietShadows(root, minR = .14) {
  const sc = new THREE.Vector3(); root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh || !o.castShadow || o.isInstancedMesh) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(sc);
    if ((o.material && o.material.userData && o.material.userData.bmat === 'gilt') || g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) < minR) o.castShadow = false; });
  return root;
}
