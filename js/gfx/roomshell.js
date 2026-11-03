// Parametric room shell (rebuildable at any size): plank floor, plaster walls with oak wainscot, beamed ceiling,
// a tall daylight window with a light shaft, warm lamps. Used by the library hub and every book room.
import * as THREE from 'three';
import { woodPlanks, plaster, woodGrain, rug, radialGlow, stone } from './textures.js';
import { makeMaterial } from './materials.js';
import { buildShape } from '../dio/builder.js';

export function makeRoomShell({ w = 14, d = 12, h = 4.6, style = 'library', windowWall = 'back', door = true } = {}) {
  const g = new THREE.Group(); g.name = 'room-shell';
  const pl = woodPlanks([96, 60, 34]); const fm = new THREE.MeshStandardMaterial({ map: pl.map, bumpMap: pl.bump, bumpScale: .6, roughness: .45, metalness: .02 });
  fm.map.repeat.set(w / 4, d / 4); fm.bumpMap.repeat.set(w / 4, d / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor'; floor.userData.floor = true; g.add(floor);
  const wallTone = style === 'gallery' ? [196, 184, 162] : [204, 188, 160];
  const wm = new THREE.MeshStandardMaterial({ map: plaster(wallTone, 'wall' + style), roughness: .95 });
  const wain = new THREE.MeshStandardMaterial({ map: woodGrain([84, 52, 30], 'wain'), roughness: .5 });
  const ceilM = new THREE.MeshStandardMaterial({ map: plaster([224, 214, 196], 'ceil'), roughness: 1 });
  const walls = [
    { name: 'back', p: [0, h / 2, -d / 2], r: 0, len: w },
    { name: 'front', p: [0, h / 2, d / 2], r: Math.PI, len: w },
    { name: 'left', p: [-w / 2, h / 2, 0], r: Math.PI / 2, len: d },
    { name: 'right', p: [w / 2, h / 2, 0], r: -Math.PI / 2, len: d }];
  g.userData.walls = walls;
  walls.forEach(W => {
    const wg = new THREE.Group(); wg.position.set(...W.p); wg.rotation.y = W.r; wg.name = 'wall-' + W.name;
    const wmm = wm.clone(); wmm.map = wm.map.clone(); wmm.map.repeat.set(W.len / 4, h / 4); wmm.map.needsUpdate = true;
    const hasWin = W.name === windowWall;
    if (hasWin) {
      // wall with a tall window opening (built from 4 panels)
      const ww = Math.min(2.2, W.len * .25), wh = h * .62, wy = h * .2 + wh / 2 - h / 2;
      const left = new THREE.Mesh(new THREE.PlaneGeometry((W.len - ww) / 2, h), wmm); left.position.x = -(ww + (W.len - ww) / 2) / 2; wg.add(left);
      const right = left.clone(); right.position.x = -left.position.x; wg.add(right);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(ww, h / 2 - (wy + wh / 2)), wmm); top.position.y = (wy + wh / 2 + h / 2) / 2; wg.add(top);
      const bot = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy - wh / 2 + h / 2), wmm); bot.position.y = (wy - wh / 2 - h / 2) / 2; wg.add(bot);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: skyTex(), color: new THREE.Color(1.25, 1.2, 1.15), toneMapped: true })); sky.position.set(0, wy, -.25); wg.add(sky);
      const frameM = makeMaterial('darkwood');
      [[0, wy + wh / 2, ww + .16, .1], [0, wy - wh / 2, ww + .2, .14], [-ww / 2, wy, .1, wh], [ww / 2, wy, .1, wh], [0, wy, .05, wh], [0, wy + wh * .15, ww, .05]].forEach(([x, y, a, b]) => { const f = new THREE.Mesh(new THREE.BoxGeometry(a, b, .12), frameM); f.position.set(x, y, .02); f.castShadow = true; wg.add(f); });
      g.userData.window = { wall: W, ww, wh, wy };
    } else { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(W.len, h), wmm); wg.add(pnl); }
    wg.children.forEach(c => { c.receiveShadow = true; });
    // wainscot + baseboard + crown
    const wn = new THREE.Mesh(new THREE.BoxGeometry(W.len, 1.05, .04), wain); wn.position.set(0, -h / 2 + .525, .02); wn.receiveShadow = true; wg.add(wn);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W.len, .06, .07), wain); rail.position.set(0, -h / 2 + 1.06, .04); wg.add(rail);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(W.len, .12, .1), wain); crown.position.set(0, h / 2 - .06, .05); wg.add(crown);
    if (door && W.name === 'front') { const dr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, .08), makeMaterial('darkwood')); dr.position.set(0, -h / 2 + 1.15, .05); wg.add(dr); const hd = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), makeMaterial('brass')); hd.position.set(.45, -h / 2 + 1.1, .12); wg.add(hd); }
    g.add(wg);
  });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilM); ceil.rotation.x = Math.PI / 2; ceil.position.y = h; g.add(ceil);
  for (let x = -w / 2 + 1.6; x < w / 2; x += 2.4) { const b = new THREE.Mesh(new THREE.BoxGeometry(.26, .3, d), wain); b.position.set(x, h - .15, 0); b.castShadow = true; g.add(b); }
  // lights: daylight through the window, warm interior lamps
  const lights = new THREE.Group(); g.add(lights);
  const hemi = new THREE.HemisphereLight(0xffe6c8, 0x2a1a0e, style === 'gallery' ? .35 : .22); lights.add(hemi);
  if (g.userData.window) {
    const W = g.userData.window.wall, n = new THREE.Vector3(Math.sin(W.r), 0, Math.cos(W.r)), p = new THREE.Vector3(...W.p);
    const sun = new THREE.DirectionalLight(0xffcf98, 2.6); sun.position.copy(p).addScaledVector(n, -9).add(new THREE.Vector3(2.5, 6, 0)); sun.target.position.copy(p).addScaledVector(n, 4).setY(0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -w; c.right = w; c.top = h * 2; c.bottom = -h * 2; c.near = .5; c.far = 40; sun.shadow.bias = -.0003; sun.shadow.normalBias = .03; sun.shadow.radius = 4;
    lights.add(sun, sun.target); g.userData.sun = sun;
  }
  const lampSpots = [[-w / 2 + 1.2, d / 2 - 1.2], [w / 2 - 1.2, d / 2 - 1.2], [0, 0]];
  lampSpots.forEach(([x, z], i) => {
    if (style === 'gallery' && i < 2) return;
    if (i === 2) { // chandelier
      const ch = buildShape({ kind: 'lamp', h: .1 }); ch.position.set(0, h - .9, 0); ch.rotation.x = Math.PI; g.add(ch);
      const L = new THREE.PointLight(0xffc98a, 22, 16, 2); L.position.set(0, h - 1.05, 0); lights.add(L);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('255,210,150'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(.9); glow.position.copy(L.position); g.add(glow);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .8, 6), makeMaterial('brass')); chain.position.set(0, h - .45, 0); g.add(chain);
    } else { const lp = buildShape({ kind: 'lamp', h: 1.55 }); lp.position.set(x, 0, z); g.add(lp); if (lp.userData.light) { lp.userData.light.intensity = 9; lp.userData.light.distance = 10; } }
  });
  if (style === 'library') { const rg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(5, w * .4), Math.min(3.6, d * .32)), new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 })); rg.rotation.x = -Math.PI / 2; rg.position.y = .004; rg.receiveShadow = true; rg.name = 'rug'; g.add(rg); }
  g.traverse(o => { if (o.isMesh && !o.userData.floor) { o.userData.shell = true; } });
  return g;
}

function skyTex() { // evening sky with distant hills seen through the window
  const c = document.createElement('canvas'); c.width = 256; c.height = 384; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#5a7ca8'); gr.addColorStop(.55, '#e8b98a'); gr.addColorStop(.75, '#f3d2a2'); g.fillStyle = gr; g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#6a7a8a'; g.beginPath(); g.moveTo(0, 300); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 280 - Math.sin(x / 30) * 18 - Math.sin(x / 11) * 6); g.lineTo(256, 384); g.lineTo(0, 384); g.fill();
  g.fillStyle = '#3f5040'; g.beginPath(); g.moveTo(0, 330); for (let x = 0; x <= 256; x += 8) g.lineTo(x, 322 - Math.sin(x / 19 + 1) * 10); g.lineTo(256, 384); g.lineTo(0, 384); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
