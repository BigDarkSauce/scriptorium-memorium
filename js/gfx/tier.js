// What a GPU can afford, and how a scene is made cheap enough for the weakest.
//
// Measured on an AMD Radeon 610M (the weakest integrated Radeon; a 618 x 787 view), GPU time per frame:
//   the storm glass diorama 37 ms: refraction (MeshPhysicalMaterial.transmission, which draws the whole scene a second
//     time into a buffer every frame) 17 ms of it, five fill lights beyond the key 7 ms, soft shadows 5 ms, clearcoat /
//     sheen / iridescence 4 ms; the pixel count mattered less (x0.5 the pixels: 60 -> 36 ms for all passes);
//   the library hall 26.7 ms, of which the ambient occlusion pass 9.9 ms.
// The GPU was taken for a fast one ("AMD Radeon" matched the discrete-card rule) and ran at 'high', and 'low' did not
// touch any of the costly parts. Integrated GPUs now start at 'low', and 'low' tames every scene (tame() below);
// renderer.js then measures the GPU's own time per frame and steps the level down, or up, from what it measures.
//
// tame(scene, on): one pass over a scene (and again over what is added later: cheap, every object is marked once).
// Everything changed is remembered on the object and given back when the level rises again.
//   glass that refracts (transmission) -> a glass that is see-through instead (transparent, its tint, a highlight);
//   clearcoat, sheen, iridescence, anisotropy -> off;
//   lights: the shadow-casting light, the hemisphere and ambient lights and the two strongest others stay; the rest
//     are switched off and their energy is given back as one soft ambient fill, so the scene keeps its brightness;
//   shadows: hard-edged PCF instead of PCF-soft, maps at most 1024 square.
import * as THREE from 'three';

// integrated and mobile GPUs: start at 'low' (the measured governor may raise them)
const INTEGRATED = /radeon\(tm\) graphics|radeon\(tm\) [5-9]\d0m|radeon [5-9]\d0m|\b[5-9]\d0m\b|vega \d|radeon vega|intel|iris|uhd graphics|hd graphics|apple m[1-9](?! (pro|max|ultra))|apple gpu|mali|adreno|powervr|videocore|tegra|swiftshader|llvmpipe|softpipe|microsoft basic/;
const DISCRETE = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m[1-9] (pro|max|ultra)/;
export function classifyGpu(name) { const n = String(name || '').toLowerCase(); if (INTEGRATED.test(n)) return 'low'; if (DISCRETE.test(n)) return 'high'; return 'medium'; }

const SAVE = '__tame';
export function tame(scene, on) {
  if (!scene) return; const fill = [];
  scene.traverse(o => {
    if (o.isMesh || o.isPoints) for (const m of [].concat(o.material || [])) tameMaterial(m, on);
    if (o.isLight) fill.push(o);
  });
  // lights: decided over the scene as a whole
  const dynamic = fill.filter(l => !l.isAmbientLight && !l.isHemisphereLight && !l.userData.tameFill);
  if (on) {
    // lights met for the first time: the shadow caster stays, then directional lights by strength while fewer than two
    // others are lit; the rest go dark, directional ones giving their energy to one soft ambient fill (local point and
    // spot lights are accents: they simply go out)
    const fresh = dynamic.filter(l => l.userData[SAVE] === undefined).sort((a, b) => (b.isDirectionalLight - a.isDirectionalLight) || (b.intensity - a.intensity));
    let lit = dynamic.filter(l => l.userData[SAVE] && !l.userData[SAVE].off && !l.castShadow).length, energy = 0; const col = new THREE.Color(0, 0, 0);
    for (const l of fresh) {
      if (l.castShadow || (lit < 2 && l.isDirectionalLight)) { l.userData[SAVE] = { off: false }; if (!l.castShadow) lit++; continue; }
      l.userData[SAVE] = { off: true, visible: l.visible }; if (l.visible && l.isDirectionalLight) { energy += l.intensity; col.add(l.color.clone().multiplyScalar(l.intensity)); } l.visible = false;
    }
    if (energy > 0) { let a = scene.userData.tameFill; if (!a) { a = scene.userData.tameFill = new THREE.AmbientLight(0xffffff, 0); a.userData.tameFill = true; a.name = 'tame-fill'; scene.add(a); } const prev = a.intensity; a.color.multiplyScalar(prev).add(col).multiplyScalar(1 / (prev + energy)); a.intensity = prev + energy * .35; }
    dynamic.forEach(l => { if (l.castShadow && l.shadow && l.shadow.mapSize.x > 1024) { l.userData.tameShadow = l.userData.tameShadow || l.shadow.mapSize.x; l.shadow.mapSize.set(1024, 1024); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } });
  } else {
    dynamic.forEach(l => { const s = l.userData[SAVE]; if (s) { if (s.off) l.visible = s.visible; delete l.userData[SAVE]; } if (l.userData.tameShadow) { l.shadow.mapSize.set(l.userData.tameShadow, l.userData.tameShadow); delete l.userData.tameShadow; if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } });
    const a = scene.userData.tameFill; if (a) { a.parent && a.parent.remove(a); delete scene.userData.tameFill; }
  }
  scene.userData.tamed = on;
}
function tameMaterial(m, on) {
  if (!m) return; const s = m.userData[SAVE];
  if (on) {
    if (s) return; const k = {};
    if (m.transmission > 0) { Object.assign(k, { transmission: m.transmission, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite }); m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, .32 + .4 * (1 - k.transmission)); m.depthWrite = false; }
    for (const p of ['clearcoat', 'sheen', 'iridescence', 'anisotropy']) if (m[p] > 0) { k[p] = m[p]; m[p] = 0; }
    m.userData[SAVE] = k; if (Object.keys(k).length) m.needsUpdate = true;
  } else if (s) { Object.assign(m, s); delete m.userData[SAVE]; if (Object.keys(s).length) m.needsUpdate = true; }
}
