// Hand-made hero props (assets/kit/<name>.glb, authored by script in tools/blender/props.py, compressed with meshopt +
// WebP by tools/blender/build.sh). Loaded once under the opening veil (main.js boot: preloadKit) with three's own
// GLTFLoader and meshopt decoder (both in three/addons, no extra CDN or WASM fetch). A prop builder asks kitAdd(); when
// the file is not there yet (slow network) or failed to load, it gets false and builds its procedural version instead,
// with the same footprint, so the layout never depends on the download.
// Resources: one parsed scene per prop, cached for the session; every clone shares its geometry, materials and the
// baked occlusion texture, all marked userData.shared (util.disposeTree keeps them), so leaving the hub frees nothing
// that the next hub would load again and the GPU counts stay flat. disposeKit() frees the cache.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../../assets/kit/', import.meta.url);
const cache = new Map();   // name -> { promise, scene | null, error }
// three.js materials per finish (glTF material name). Values tuned against the hall's own probe (surfaces.js): the brass
// a touch rougher than a mirror so the windows read as soft highlights; the baked occlusion keeps the hollows dark.
const FINISH = {
  brass: () => new THREE.MeshPhysicalMaterial({ color: 0xd9a55a, metalness: 1, roughness: .3, clearcoat: .25, clearcoatRoughness: .35 }),
  gilt: () => new THREE.MeshPhysicalMaterial({ color: 0xe0b060, metalness: 1, roughness: .36 }),
  silver: () => new THREE.MeshPhysicalMaterial({ color: 0xd8d6d0, metalness: 1, roughness: .24, clearcoat: .3, clearcoatRoughness: .25 }),
  wax: () => new THREE.MeshPhysicalMaterial({ color: 0xf1e6cc, roughness: .5, sheen: .4, sheenColor: new THREE.Color(0xfff0d8), sheenRoughness: .6, emissive: 0x3a2610, emissiveIntensity: .25 }),
  wick: () => new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: .9 }),
  ink: () => new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: .05, clearcoat: 1, clearcoatRoughness: .03 }),
  quill: () => new THREE.MeshPhysicalMaterial({ color: 0xece4d4, roughness: .7, sheen: .7, sheenColor: new THREE.Color(0xffffff), sheenRoughness: .4, side: THREE.DoubleSide }),
  shaft: () => new THREE.MeshPhysicalMaterial({ color: 0xdccfa8, roughness: .35, clearcoat: .4, transmission: 0 }),
  paper: () => new THREE.MeshStandardMaterial({ color: 0xd8c8a4, roughness: .88 }),
  walnut: () => new THREE.MeshPhysicalMaterial({ color: 0x4a2a16, roughness: .42, clearcoat: .5, clearcoatRoughness: .3 })
};
let loader = null;
function getLoader() { if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); } return loader; }

// load one prop (once); resolves to the cached scene or null, never rejects
export function loadKit(name) {
  let e = cache.get(name); if (e) return e.promise;
  e = { scene: null, error: null }; cache.set(name, e);
  e.promise = getLoader().loadAsync(new URL(name + '.glb', BASE).href).then(gltf => { e.scene = prepare(gltf.scene, name); return e.scene; })
    .catch(err => { e.error = String(err && err.message || err); console.warn('kit: ' + name + ' not loaded, using the procedural version (' + e.error + ')'); return null; });
  return e.promise;
}
// all of them, but never longer than ms (the veil does not wait for a slow network)
export function preloadKit(names = ['candlestick', 'inkstand', 'globestand'], ms = 6000) {
  return Promise.race([Promise.all(names.map(loadKit)), new Promise(r => setTimeout(r, ms))]);
}
export const kitReady = name => !!(cache.get(name) && cache.get(name).scene);
export const kitStatus = () => Object.fromEntries([...cache].map(([k, e]) => [k, e.scene ? 'ready' : e.error ? 'failed: ' + e.error : 'loading']));

function prepare(root, name) {
  const mats = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material, key = (src.name || 'brass').replace(/\.\d+$/, '');
    let m = mats.get(key);
    if (!m) {
      m = (FINISH[key] || FINISH.brass)(); m.name = 'kit:' + name + ':' + key;
      if (src.aoMap) { m.aoMap = src.aoMap; m.aoMapIntensity = key === 'ink' ? .4 : 1; m.aoMap.userData.shared = true; }
      m.userData.shared = true; mats.set(key, m);
    }
    src.dispose(); o.material = m;
    o.geometry.userData.shared = true; o.castShadow = true; o.receiveShadow = true;
  });
  root.name = 'kit:' + name; root.userData.kit = name;
  return root;
}

// add a clone of the prop to parent with the matrix m4 (local frame of the parent); false when it is not loaded
export function kitAdd(parent, name, m4) {
  const e = cache.get(name); if (!e || !e.scene) return false;
  const o = e.scene.clone(true); if (m4) o.applyMatrix4(m4);
  parent.add(o); return o;
}
export function disposeKit() {
  cache.forEach(e => { if (!e.scene) return; e.scene.traverse(o => { if (!o.isMesh) return; o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m.aoMap) m.aoMap.dispose(); m.dispose(); }); }); });
  cache.clear();
}
