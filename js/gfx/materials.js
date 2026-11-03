// PBR material presets shared by the hub, the rooms and every diorama.
import * as THREE from 'three';
import { woodGrain, paper, parchment, leather, stone, plaster } from './textures.js';

export const PRESETS = ['brass', 'gold', 'copper', 'chrome', 'steel', 'iron', 'wood', 'darkwood', 'paper', 'parchment', 'card', 'glass', 'water', 'ice', 'plastic', 'rubber', 'ceramic', 'stone', 'marble', 'plaster', 'fabric', 'leather', 'foliage', 'bark', 'grass', 'soil', 'sand', 'snow', 'skin', 'membrane', 'gel', 'emissive', 'neon', 'cloud', 'smoke', 'mercury', 'ink', 'chalk'];

export function makeMaterial(spec = {}, opts = {}) {
  if (typeof spec === 'string') spec = { preset: spec };
  const p = spec.preset || 'plastic', col = spec.color ? new THREE.Color(spec.color) : null;
  let m;
  const P = (o) => new THREE.MeshPhysicalMaterial(o), S = (o) => new THREE.MeshStandardMaterial(o);
  switch (p) {
    case 'brass': m = S({ color: 0xc9a050, metalness: 1, roughness: .3 }); break;
    case 'gold': m = S({ color: 0xffc85a, metalness: 1, roughness: .18 }); break;
    case 'copper': m = S({ color: 0xc0704a, metalness: 1, roughness: .32 }); break;
    case 'chrome': m = S({ color: 0xe6e6e6, metalness: 1, roughness: .08 }); break;
    case 'steel': m = S({ color: 0xb4bac2, metalness: .9, roughness: .35 }); break;
    case 'iron': m = S({ color: 0x3a332d, metalness: .7, roughness: .55 }); break;
    case 'mercury': m = S({ color: 0xd9dde2, metalness: 1, roughness: .06 }); break;
    case 'wood': m = S({ map: woodGrain([150, 98, 56]), color: 0xffffff, roughness: .6 }); break;
    case 'darkwood': m = S({ map: woodGrain([78, 46, 26], 'dk'), color: 0xffffff, roughness: .55 }); break;
    case 'bark': m = S({ map: woodGrain([70, 50, 34], 'bark'), color: 0xffffff, roughness: .95 }); break;
    case 'paper': case 'card': m = S({ map: paper(), color: 0xffffff, roughness: .92 }); break;
    case 'parchment': m = S({ map: parchment(), color: 0xffffff, roughness: .85, side: THREE.DoubleSide }); break;
    case 'glass': m = P({ color: 0xffffff, transmission: 1, roughness: .02, thickness: .15, ior: 1.5, transparent: true, opacity: 1, envMapIntensity: 1.4, clearcoat: 1, specularIntensity: 1, depthWrite: false }); break;
    case 'water': m = P({ color: 0x2a8fa8, transmission: .85, roughness: .06, thickness: 1.2, ior: 1.33, attenuationColor: new THREE.Color(0x1d6f80), attenuationDistance: 2.4, transparent: true }); break;
    case 'ice': m = P({ color: 0xdff4ff, transmission: .7, roughness: .18, thickness: .6, ior: 1.31 }); break;
    case 'plastic': m = P({ color: 0xd94a3a, roughness: .35, clearcoat: .6, clearcoatRoughness: .2 }); break;
    case 'rubber': m = S({ color: 0x222222, roughness: .9 }); break;
    case 'ceramic': m = P({ color: 0xf2efe8, roughness: .25, clearcoat: 1 }); break;
    case 'stone': m = S({ map: stone(), color: 0xffffff, roughness: .95 }); break;
    case 'marble': m = P({ color: 0xf1ede6, roughness: .2, clearcoat: .5 }); break;
    case 'plaster': m = S({ map: plaster(), color: 0xffffff, roughness: .95 }); break;
    case 'fabric': m = P({ color: 0x7a2e24, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xffc0a0), sheenRoughness: .6 }); break;
    case 'leather': m = S({ map: leather(), color: 0xffffff, roughness: .65 }); break;
    case 'foliage': m = S({ color: 0x4f7a3a, roughness: .85, flatShading: true }); break;
    case 'grass': m = S({ color: 0x6f9a48, roughness: .95 }); break;
    case 'soil': m = S({ color: 0x5d4330, roughness: 1 }); break;
    case 'sand': m = S({ color: 0xd8c08e, roughness: 1 }); break;
    case 'snow': m = S({ color: 0xf6f8fb, roughness: .7 }); break;
    case 'skin': m = P({ color: 0xe0ac8c, roughness: .55, sheen: .4, sheenColor: new THREE.Color(0xff9a7a) }); break;
    case 'membrane': m = P({ color: 0xffb0c0, transmission: .55, roughness: .3, thickness: .4, ior: 1.36, transparent: true, opacity: .85, side: THREE.DoubleSide }); break;
    case 'gel': m = P({ color: 0x9fe0c0, transmission: .75, roughness: .15, thickness: 1, ior: 1.34, transparent: true }); break;
    case 'emissive': m = S({ color: 0x000000, emissive: col || new THREE.Color(0xffd27a), emissiveIntensity: 2.2, roughness: .4 }); break;
    case 'neon': m = new THREE.MeshBasicMaterial({ color: col ? col.clone().multiplyScalar(2.5) : new THREE.Color(3, 2.4, 1.2), toneMapped: false }); break;
    case 'cloud': m = S({ color: 0xffffff, roughness: 1, transparent: true, opacity: .92, flatShading: false }); break;
    case 'smoke': m = S({ color: 0x9a9a9a, roughness: 1, transparent: true, opacity: .5, depthWrite: false }); break;
    case 'ink': m = new THREE.MeshBasicMaterial({ color: 0x2a1e15 }); break;
    case 'chalk': m = S({ color: 0xf4f1ea, roughness: 1 }); break;
    default: m = S({ color: 0xcccccc, roughness: .5 });
  }
  if (col && p !== 'emissive' && p !== 'neon') m.color.copy(col).multiply(m.map ? new THREE.Color(1, 1, 1) : new THREE.Color(1, 1, 1));
  if (spec.emissive && m.emissive) { m.emissive.set(spec.emissive); m.emissiveIntensity = spec.emissiveIntensity ?? 1.5; }
  if (spec.opacity != null && spec.opacity < 1) { m.transparent = true; m.opacity = spec.opacity; m.depthWrite = false; }
  if (spec.roughness != null && 'roughness' in m) m.roughness = spec.roughness;
  if (spec.metalness != null && 'metalness' in m) m.metalness = spec.metalness;
  if (spec.wireframe) m.wireframe = true;
  if (spec.side === 'double') m.side = THREE.DoubleSide;
  m.userData.preset = p;
  return m;
}
