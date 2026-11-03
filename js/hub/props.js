// Library furniture: bookcases (horizontal/vertical), scroll-books, plaques, furniture pieces.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodGrain, parchment, labelTex, leather } from '../gfx/textures.js';
import { makeMaterial } from '../gfx/materials.js';

export const SHELF_KINDS = {
  horizontal: { w: 3.2, h: 1.7, d: .5, tiers: 3 },
  vertical: { w: 1.15, h: 2.9, d: .5, tiers: 6 }
};
const woodM = () => new THREE.MeshStandardMaterial({ map: woodGrain([96, 60, 34], 'shelfwood'), roughness: .55 });
let _wood; const wood = () => (_wood = _wood || woodM());
function m(geo, mat) { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.receiveShadow = true; return o; }

export function makeBookcase(shelf) {
  const K = SHELF_KINDS[shelf.kind] || SHELF_KINDS.horizontal, w = shelf.w || K.w, h = K.h, d = K.d, tiers = shelf.tiers || K.tiers;
  const g = new THREE.Group(); g.userData = { shelfId: shelf.id, kind: 'shelf', w, h, d, tiers };
  const t = .05, W = wood();
  const side = new RoundedBoxGeometry(t, h, d, 2, .012);
  [-1, 1].forEach(s => { const o = m(side, W); o.position.set(s * (w / 2 - t / 2), h / 2, 0); g.add(o); });
  const back = m(new THREE.BoxGeometry(w - t * 2, h - .06, .02), new THREE.MeshStandardMaterial({ map: woodGrain([60, 36, 20], 'shelfback'), roughness: .7 })); back.position.set(0, h / 2, -d / 2 + .02); g.add(back);
  const top = m(new RoundedBoxGeometry(w + .06, .06, d + .04, 2, .015), W); top.position.y = h + .03; g.add(top);
  const kick = m(new THREE.BoxGeometry(w, .1, d - .04), W); kick.position.y = .05; g.add(kick);
  const tierH = (h - .12) / tiers;
  for (let i = 0; i <= tiers; i++) { if (i === 0) continue; const b = m(new THREE.BoxGeometry(w - t * 2, .03, d - .04), W); b.position.y = .1 + i * tierH - .015; if (i < tiers) g.add(b); }
  const bottom = m(new THREE.BoxGeometry(w - t * 2, .03, d - .04), W); bottom.position.y = .115; g.add(bottom);
  // brass plaque with the shelf's subject name
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * .7, 1.6), .2), new THREE.MeshStandardMaterial({ map: labelTex(shelf.name || 'Unnamed', { w: 768, h: 96, bg: '#c9a050', fg: '#2a1a0c', border: '#7a5a20', font: '600 60px "IM Fell English SC", Georgia, serif' }), metalness: .6, roughness: .35 }));
  plaque.position.set(0, h + .17, d / 2 - .1); plaque.name = 'plaque'; g.add(plaque);
  const pstand = m(new THREE.BoxGeometry(Math.min(w * .72, 1.64), .22, .02), makeMaterial('brass')); pstand.position.set(0, h + .17, d / 2 - .115); g.add(pstand);
  g.userData.tierH = tierH; g.userData.slotsPerTier = Math.max(1, Math.floor((w - .2) / .17));
  // scenic props on top: a stack of old tomes and a candle (and a globe on wide cases)
  const rnd = (i) => (Math.sin((shelf.id || 'x').length * 9.7 + i * 12.9898) * 43758.5453) % 1, top0 = h + .06;
  const tones = ['#5a2a1e', '#2a3a5a', '#3a4a2a', '#6a4a20', '#4a2a40'];
  let y = top0; for (let i = 0; i < 4; i++) { const tw = .26 + Math.abs(rnd(i)) * .08, th = .05 + Math.abs(rnd(i + 3)) * .03; const tome = m(new RoundedBoxGeometry(tw, th, .2 + Math.abs(rnd(i + 5)) * .05, 2, .008), new THREE.MeshStandardMaterial({ color: tones[i % 5], roughness: .7 })); tome.position.set(-w / 2 + .3, y + th / 2, -.02); tome.rotation.y = rnd(i + 7) * .4; g.add(tome); y += th; }
  const candle = m(new THREE.CylinderGeometry(.025, .025, .14, 12), new THREE.MeshStandardMaterial({ color: 0xf2e8d0, roughness: .6 })); candle.position.set(w / 2 - .25, top0 + .07, 0); g.add(candle);
  const holder = m(new THREE.CylinderGeometry(.05, .06, .02, 16), makeMaterial('brass')); holder.position.set(w / 2 - .25, top0 + .01, 0); g.add(holder);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.2), toneMapped: false })); flame.scale.y = 1.8; flame.position.set(w / 2 - .25, top0 + .16, 0); g.add(flame); g.userData.flame = flame;
  if (w > 2) { const globe = m(new THREE.SphereGeometry(.12, 32, 20), new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: .5, metalness: .2 })); globe.position.set(w / 2 - .7, top0 + .2, 0); g.add(globe); const st = m(new THREE.CylinderGeometry(.015, .06, .08, 12), makeMaterial('brass')); st.position.set(w / 2 - .7, top0 + .04, 0); g.add(st); const ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .006, 6, 40), makeMaterial('brass')); ring.position.copy(globe.position); ring.rotation.y = Math.PI / 2; g.add(ring); }
  return g;
}
// Slot position (local to the bookcase) for tier i, slot j: scrolls lie horizontally, ends facing out.
export function slotPos(shelfObj, tier, slot) {
  const u = shelfObj.userData, y = .13 + tier * u.tierH + .07, x = -u.w / 2 + .14 + slot * .17;
  return new THREE.Vector3(x, y, .02);
}
const ribbonColors = ['#8a2a1e', '#2d5b8e', '#3f7d6e', '#8f733a', '#6a4a8a', '#a0522d', '#2f4f4f'];
export function makeScroll(book, scale = 1) {
  const g = new THREE.Group(); g.userData = { bookId: book.id, kind: 'scroll' };
  const L = .5 * scale, R = .068 * scale;
  const paperM = new THREE.MeshStandardMaterial({ map: parchment('parchscroll', 256, 256), roughness: .8, color: 0xffffff, emissive: 0xffe2a8, emissiveIntensity: 0 });
  const body = m(new THREE.CylinderGeometry(R, R, L, 32), paperM); body.rotation.x = Math.PI / 2; g.add(body); g.userData.paper = paperM;
  // spiral end caps (rolled paper) + wooden knobs
  [-1, 1].forEach(s => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshStandardMaterial({ map: spiralTex(), roughness: .8 })); cap.position.z = s * L / 2; if (s < 0) cap.rotation.y = Math.PI; g.add(cap);
    const knob = m(new THREE.SphereGeometry(R * .55, 16, 12), makeMaterial('darkwood')); knob.position.z = s * (L / 2 + R * .4); g.add(knob);
  });
  const col = book.color || ribbonColors[(book.title || '').length % ribbonColors.length];
  const rib = m(new THREE.TorusGeometry(R * 1.02, R * .12, 8, 32), new THREE.MeshStandardMaterial({ color: col, roughness: .6 })); g.add(rib);
  // seal + hanging name tag
  const seal = m(new THREE.CylinderGeometry(R * .4, R * .4, R * .15, 20), new THREE.MeshStandardMaterial({ color: col, roughness: .4, metalness: .1 })); seal.rotation.x = Math.PI / 2; seal.position.set(0, -R * .2, R * 1.05); g.add(seal);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.2 * scale, .07 * scale), new THREE.MeshStandardMaterial({ map: labelTex(book.title || 'Untitled', { w: 512, h: 160, bg: '#efe2c2', fg: '#2a1e15', border: col, font: '600 64px "IM Fell English", Georgia, serif', sub: book.icon || '' }), roughness: .8, side: THREE.DoubleSide }));
  tag.position.set(0, -R * 1.9, L / 2 + .01); tag.rotation.x = -.15; g.add(tag); g.userData.tag = tag;
  return g;
}
function spiralTex() {
  if (spiralTex.t) return spiralTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#e8d8b0'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(120,90,50,.55)'; x.lineWidth = 1.4; x.beginPath();
  for (let a = 0; a < 40; a += .1) { const r = a * 1.5; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (spiralTex.t = t);
}
// Unrolled sheet used by the open animation
export function makeSheet(w = .42, h = .6) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 1); geo.translate(0, -h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map: parchment('sheet', 512, 768), roughness: .8, side: THREE.DoubleSide, emissive: 0xfff0c8, emissiveIntensity: 0 });
  const s = new THREE.Mesh(geo, mat); s.scale.y = .001; return s;
}
export function armchair() {
  const g = new THREE.Group(), fab = makeMaterial({ preset: 'fabric', color: '#5a2420' }), W = wood();
  const seat = m(new RoundedBoxGeometry(.9, .22, .85, 3, .08), fab); seat.position.y = .42; g.add(seat);
  const back = m(new RoundedBoxGeometry(.9, .8, .2, 3, .08), fab); back.position.set(0, .8, -.34); back.rotation.x = -.12; g.add(back);
  [-1, 1].forEach(s => { const arm = m(new RoundedBoxGeometry(.16, .32, .82, 3, .06), fab); arm.position.set(s * .45, .6, 0); g.add(arm); });
  [[.38, .36], [-.38, .36], [.38, -.36], [-.38, -.36]].forEach(([x, z]) => { const l = m(new THREE.CylinderGeometry(.03, .025, .32, 8), W); l.position.set(x, .16, z); g.add(l); });
  return g;
}
export function readingDesk() {
  const g = new THREE.Group(), W = wood();
  const top = m(new RoundedBoxGeometry(1.6, .06, .8, 2, .015), W); top.position.y = .76; g.add(top);
  const blotter = new THREE.Mesh(new THREE.PlaneGeometry(.9, .5), new THREE.MeshStandardMaterial({ map: leather('#27402f', 'blotter'), roughness: .7 })); blotter.rotation.x = -Math.PI / 2; blotter.position.y = .792; g.add(blotter);
  [[.72, .34], [-.72, .34], [.72, -.34], [-.72, -.34]].forEach(([x, z]) => { const l = m(new THREE.BoxGeometry(.06, .76, .06), W); l.position.set(x, .38, z); g.add(l); });
  return g;
}
