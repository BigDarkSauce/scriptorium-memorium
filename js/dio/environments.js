// Scene-dependent lighting presets: each sets background, IBL, sun/fill/rim, fog, the display base and ambient particles.
// update(t, params) lets presets respond to time-of-day or simulation parameters (sun height, storm darkness…).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { canvasTex, woodGrain } from '../gfx/textures.js';
import { makeMaterial } from '../gfx/materials.js';
import { mulberry } from '../util.js';

export const ENV_PRESETS = ['studio', 'lab', 'landscape', 'cosmos', 'micro', 'abstract', 'ocean', 'night', 'desk'];
function bgGradient(inner, outer) {
  return canvasTex('bg' + inner + outer, 1024, 1024, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * .42, 20, w / 2, h / 2, w * .72); gr.addColorStop(0, inner); gr.addColorStop(.62, outer); gr.addColorStop(1, '#050403'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function sunRig(scene, { color = 0xffe2bc, intensity = 3, pos = [6, 12, 7], size = 11, map = 2048 } = {}) {
  const sun = new THREE.DirectionalLight(color, intensity); sun.position.set(...pos); sun.castShadow = true;
  sun.shadow.mapSize.set(map, map); const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = .5; c.far = 60;
  sun.shadow.bias = -.0002; sun.shadow.normalBias = .03; sun.shadow.radius = 3; scene.add(sun); scene.add(sun.target); return sun;
}
function plinth(scene, { r = 7.2, wood = 'darkwood', felt = '#2a2018', brass = true } = {}) {
  const g = new THREE.Group(); g.name = 'display base'; g.userData.decorBase = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + .4, 1, 96), new THREE.MeshStandardMaterial({ map: woodGrain([86, 54, 30], 'plinth'), roughness: .5 })); base.position.y = -.5; base.receiveShadow = true; g.add(base);
  if (brass) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r + .05, .07, 12, 128), makeMaterial('brass')); ring.rotation.x = Math.PI / 2; g.add(ring); }
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshStandardMaterial({ color: felt, roughness: 1 })); top.rotation.x = -Math.PI / 2; top.position.y = .004; top.receiveShadow = true; g.add(top);
  g.traverse(o => { o.userData.noInk = true; }); scene.add(g); return g;
}
function stars(scene, n = 2500, R = 120) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry(4);
  for (let i = 0; i < n; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); p.set([R * s * Math.cos(a), R * u, R * s * Math.sin(a)], i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .35, color: 0xffffff, sizeAttenuation: true, transparent: true, opacity: .9, depthWrite: false })); pts.userData.noInk = true; scene.add(pts); return pts;
}
function motes(scene, color = 0xffd590, n = 400, area = [14, 8, 14]) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry(5);
  for (let i = 0; i < n; i++) p.set([(r() - .5) * area[0], r() * area[1], (r() - .5) * area[2]], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .04, color, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.noInk = true; pts.userData.motes = { area }; scene.add(pts); return pts;
}

export function setupEnvironment(scene, gfx, env = {}) {
  const preset = ENV_PRESETS.includes(env.preset) ? env.preset : 'studio';
  const R = { preset, update() {}, base: null, sun: null, bgObjects: [] };
  scene.environment = gfx.envStudio; scene.environmentIntensity = .9;
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x2a1d10, .6); scene.add(hemi); R.hemi = hemi;
  const showBase = env.base !== false;
  switch (preset) {
    case 'studio': case 'lab': case 'desk': {
      scene.background = bgGradient('#3a2a1c', '#140e09'); scene.fog = new THREE.Fog(0x0b0806, 26, 60);
      R.sun = sunRig(scene, { intensity: 3.2, pos: [6, 12, 7] });
      const rim = new THREE.SpotLight(0x88aaff, 40, 40, .5, .6, 2); rim.position.set(-8, 9, -8); scene.add(rim);
      if (showBase) R.base = plinth(scene);
      R.motes = motes(scene);
      break;
    }
    case 'landscape': {
      const sky = new Sky(); sky.scale.setScalar(450); sky.userData.noInk = true; scene.add(sky); R.sky = sky; R.bgObjects.push(sky);
      const u = sky.material.uniforms; u.turbidity.value = 3; u.rayleigh.value = 2.4; u.mieCoefficient.value = .005; u.mieDirectionalG.value = .8;
      R.sun = sunRig(scene, { intensity: 3.6, size: 12 }); scene.fog = R.fog = new THREE.Fog(0xc9d6e2, 45, 220); scene.environmentIntensity = .45;
      const sunV = new THREE.Vector3();
      R.update = (t, p = {}) => {
        const hour = p.hour ?? p.time ?? env.time ?? 10, elev = Math.sin((hour - 6) / 12 * Math.PI) * 62, az = (hour - 12) / 12 * 140;
        const phi = THREE.MathUtils.degToRad(90 - elev), th = THREE.MathUtils.degToRad(az); sunV.setFromSphericalCoords(1, phi, th);
        u.sunPosition.value.copy(sunV); R.sun.position.copy(sunV).multiplyScalar(30); const day = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
        const storm = Math.min(1, Math.max(0, p.storm ?? p.cloud ?? 0));
        R.sun.intensity = 4 * Math.pow(day, .6) * (1 - storm * .75); hemi.intensity = .25 + day * .7 * (1 - storm * .5);
        R.sun.color.setHSL(.08 + .05 * day, .6 - .3 * day, .55 + .2 * day); u.rayleigh.value = 2.2 + storm * 2; u.turbidity.value = 2.5 + storm * 14;
        gfx.renderer.toneMappingExposure = .5 + day * .32; R.fog.color.setHSL(.58, .2 * (1 - storm), .15 + .55 * day * (1 - storm * .6));
      };
      if (showBase) R.base = plinth(scene, { felt: '#4a5a33' });
      break;
    }
    case 'cosmos': {
      scene.background = new THREE.Color(0x020308); scene.environmentIntensity = .15; hemi.intensity = .08;
      R.stars = stars(scene); R.bgObjects.push(R.stars); R.sun = sunRig(scene, { intensity: .6, color: 0xbcc8ff });
      if (env.base) R.base = plinth(scene, { felt: '#0b0d18' });
      break;
    }
    case 'micro': {
      scene.background = bgGradient('#0f3a3a', '#03100f'); scene.fog = new THREE.FogExp2(0x062020, .035); scene.environmentIntensity = .5; hemi.color.set(0x9fe8d8); hemi.groundColor.set(0x0a2020); hemi.intensity = .9;
      R.sun = sunRig(scene, { intensity: 1.8, color: 0xd8fff0, pos: [3, 14, 4] }); R.motes = motes(scene, 0x9fffe0, 600, [16, 10, 16]);
      if (env.base) R.base = plinth(scene, { felt: '#0d2a28' });
      break;
    }
    case 'abstract': {
      scene.background = bgGradient('#1c2438', '#070a12'); scene.fog = new THREE.Fog(0x070a12, 30, 70);
      R.sun = sunRig(scene, { intensity: 2.4, color: 0xf0f4ff }); hemi.color.set(0xc8d8ff); hemi.groundColor.set(0x101420);
      const grid = new THREE.GridHelper(40, 40, 0x3a5a8a, 0x1a2438); grid.userData.noInk = true; grid.position.y = -.01; scene.add(grid);
      if (showBase) R.base = plinth(scene, { felt: '#111827', brass: false });
      break;
    }
    case 'ocean': {
      const sky = new Sky(); sky.scale.setScalar(450); scene.add(sky); sky.material.uniforms.sunPosition.value.set(.4, .25, -1); sky.userData.noInk = true;
      R.sun = sunRig(scene, { intensity: 3, pos: [8, 6, -12] }); scene.fog = new THREE.Fog(0xa8c4d8, 25, 120);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1), makeMaterial({ preset: 'water', color: '#1d5a78' })); sea.rotation.x = -Math.PI / 2; sea.position.y = -.6; sea.userData.noInk = true; scene.add(sea);
      break;
    }
    case 'night': {
      scene.background = bgGradient('#141a2a', '#03040a'); R.stars = stars(scene, 1200); R.bgObjects.push(R.stars); scene.environmentIntensity = .25; hemi.color.set(0x6070a0); hemi.intensity = .3;
      R.sun = sunRig(scene, { intensity: .8, color: 0xaabbff, pos: [-6, 10, 4] });
      if (showBase) R.base = plinth(scene);
      break;
    }
  }
  if (env.glassCase) {
    const w = env.caseW || 13, h = env.caseH || 8, glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: .03, thickness: .04, ior: 1.45, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
    const gc = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), glass); gc.position.y = h / 2; gc.userData.noInk = true; gc.userData.decorBase = true; gc.renderOrder = 20; gc.raycast = () => {}; scene.add(gc);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(gc.geometry), new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: .45 })); e.position.copy(gc.position); e.raycast = () => {}; scene.add(e);
  }
  const prevUpdate = R.update;
  R.update = (t, p, dt) => {
    prevUpdate(t, p);
    if (R.motes) { const a = R.motes.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .08; if (y > R.motes.userData.motes.area[1]) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * .3 + i) * .0015); } a.needsUpdate = true; }
    if (R.stars) R.stars.rotation.y += dt * .004;
  };
  return R;
}
