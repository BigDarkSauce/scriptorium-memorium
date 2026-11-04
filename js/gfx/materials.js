// PBR material presets shared by the hub, the rooms and every diorama.
// Physically based: metals are metalness 1 with measured-ish F0 tints, dielectrics carry procedural normal /
// roughness maps (js/gfx/proc.js), varnished wood has a clearcoat, liquids use transmission + attenuation.
//
// Glass: vessels (flasks, tubes, domes, cases) are THIN-SHELL glass, not transmission. three.js renders
// transmissive objects from a snapshot of the opaque scene only, so a transmissive flask hides any liquid or
// glass inside it. Blown glass walls are ~1 mm thick and barely refract anyway; what you see is Fresnel
// reflection plus the transmitted background. The thin shader outputs reflections with premultiplied blending
// (dst·(1−F) + reflected) and no diffuse, which is what clear glass physically does. Liquids and solid glass
// ('water', 'liquid', 'solidglass', 'ice', 'gel') do use transmission (ior, thickness, attenuation), so they
// refract the opaque world behind them — including crystals or bodies submerged in them.
//
// Card stage: every lit material gets a small hook that, while the materialize front says "card", flattens
// normal maps and removes clearcoat / sheen so the white card model stays matte and clean; thin glass turns into
// a half-opaque vellum sheet. Each hook variant carries its own `defines`, which keeps three's program cache
// keys distinct (patchMaterial gives every patched material of one type the same customProgramCacheKey).
import * as THREE from 'three';
import { paper, parchment, leather, stone, plaster } from './textures.js';
import { woodSet, brushed, smudge, castIron, paperSet, feltSet, marbleSet, relief, variation } from './proc.js';

export const PRESETS = ['brass', 'gold', 'copper', 'chrome', 'steel', 'iron', 'wood', 'darkwood', 'walnut', 'paper', 'parchment', 'card', 'glass', 'solidglass', 'water', 'liquid', 'ice', 'plastic', 'rubber', 'ceramic', 'stone', 'marble', 'plaster', 'fabric', 'felt', 'leather', 'cork', 'foliage', 'bark', 'grass', 'soil', 'sand', 'snow', 'skin', 'membrane', 'gel', 'crystal', 'emissive', 'neon', 'cloud', 'smoke', 'mercury', 'ink', 'chalk'];
const LIQUIDS = new Set(['water', 'liquid', 'gel', 'ice', 'solidglass', 'membrane']);

// ---------- shader hooks ----------
// One hook for all lit materials; variants (thin glass) are switched by defines so cache keys differ.
function hook(m) {
  if (m.isMeshBasicMaterial || m.isShaderMaterial) return m;
  m.onBeforeCompile = (s) => {
    const card = !!m.userData.frontPatched; // set synchronously by patchMaterial before the first compile
    // punctual lights are infinitely small: on polished metal their GGX peak is hundreds of times brighter than a real
    // softbox highlight and blooms into a white blob. Cap direct specular radiance (IBL reflections are untouched).
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( 3.0 ) );\n #ifdef USE_CLEARCOAT\n clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( 3.0 ) );\n #endif');
    if (card && s.fragmentShader.includes('#include <lights_physical_fragment>')) {
      s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        normal = normalize( mix( normal, nonPerturbedNormal, isCard ) );
        #ifdef USE_CLEARCOAT
          material.clearcoat *= ( 1.0 - isCard );
        #endif
        #ifdef USE_SHEEN
          material.sheenColor *= ( 1.0 - isCard );
        #endif`);
    }
    if (m.userData.thin) {
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        { float smNdV = abs( dot( normal, geometryViewDir ) );
          float smF = 0.04 + 0.96 * pow( 1.0 - smNdV, 5.0 );
          gl_FragColor.a = clamp( smF * smEdge + opacity * ( 1.0 - smF ), 0.0, 1.0 );
          ${card ? 'gl_FragColor = mix( gl_FragColor, vec4( outgoingLight * smCard, smCard ), isCard );' : ''} }`)
        .replace('void main() {', 'uniform float smEdge;\nuniform float smCard;\nvoid main() {');
      s.uniforms.smEdge = m.userData.smEdge; s.uniforms.smCard = m.userData.smCard;
    }
  };
  m.customProgramCacheKey = () => 'sm' + (m.userData.thin ? 'thin' : '') + m.type;
  if (m.userData.thin) m.defines = Object.assign({}, m.defines, { SM_THIN: '' });
  return m;
}
// Thin-shell glass: reflections + Fresnel-weighted occlusion of the background (premultiplied blending).
export function thinGlass(o = {}) {
  const tint = new THREE.Color(o.color ?? 0x000000);
  const m = new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: o.roughness ?? .015, ior: o.ior ?? 1.5, specularIntensity: 1,
    envMapIntensity: o.env ?? 1.25, transparent: true, opacity: o.absorb ?? .035, depthWrite: false,
    side: o.side ?? THREE.DoubleSide, roughnessMap: o.smudge === false ? null : smudge().roughnessMap
  });
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.userData.thin = true; m.userData.smEdge = { value: o.edge ?? .85 }; m.userData.smCard = { value: o.card ?? .5 }; // card stage: vellum opacity
  m.userData.preset = 'glass';
  return hook(m);
}
// Transmissive liquid / solid dielectric: the colour lives in the attenuation (Beer–Lambert), not the diffuse.
function liquid({ tint = 0xffffff, dist = 2, ior = 1.333, thickness = 1, rough = .02, normal = null, ns = .2 } = {}) {
  const c = new THREE.Color(tint);
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).lerp(c, .25), metalness: 0, roughness: rough, transmission: 1, ior, thickness, attenuationColor: c, attenuationDistance: dist, specularIntensity: 1, envMapIntensity: 1.1 });
  if (normal) { m.normalMap = normal; m.normalScale.set(ns, ns); }
  return m;
}

export function makeMaterial(spec = {}, opts = {}) {
  if (typeof spec === 'string') spec = { preset: spec };
  const p = spec.preset || 'plastic', col = spec.color ? new THREE.Color(spec.color) : null;
  let m;
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const metal = (color, rough, o = {}) => P(Object.assign({ color, metalness: 1, roughness: rough, roughnessMap: smudge().roughnessMap, envMapIntensity: 1.15 }, o));
  const wood = (kind, o = {}) => { const W = woodSet(kind); return P(Object.assign({ map: W.map, normalMap: W.normalMap, normalScale: new THREE.Vector2(.35, .35), roughnessMap: W.roughnessMap, roughness: .7, clearcoat: .55, clearcoatRoughness: .22, color: 0xffffff }, o)); };
  switch (p) {
    case 'brass': m = metal(0xe2c47a, .3); break;
    case 'gold': m = metal(0xffd98c, .22); break;
    case 'copper': m = metal(0xeba283, .3); break;
    case 'chrome': m = metal(0xe2e3e4, .1, { envMapIntensity: 1.3 }); break;
    case 'steel': { const B = brushed(); m = P({ color: 0xc9cdd2, metalness: 1, roughness: .42, roughnessMap: B.roughnessMap, normalMap: B.normalMap, normalScale: new THREE.Vector2(.15, .15), anisotropy: .55, envMapIntensity: 1.1 }); break; }
    case 'iron': { const I = castIron(); m = P({ map: I.map, normalMap: I.normalMap, normalScale: new THREE.Vector2(.5, .5), roughnessMap: I.roughnessMap, color: 0xffffff, metalness: .65, roughness: .85 }); break; }
    case 'mercury': m = P({ color: 0xeceef0, metalness: 1, roughness: .035, envMapIntensity: 1.35 }); break;
    case 'wood': m = wood('oak'); break;
    case 'darkwood': case 'walnut': m = wood('walnut', { clearcoat: .7, clearcoatRoughness: .16 }); break;
    case 'bark': { const W = woodSet('bark'); m = P({ map: W.map, normalMap: W.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: W.roughnessMap, roughness: 1, color: 0xffffff }); break; }
    case 'paper': { const S = paperSet(); m = P({ map: S.map, normalMap: S.normalMap, normalScale: new THREE.Vector2(.25, .25), color: 0xffffff, roughness: .88, sheen: .25, sheenRoughness: .7, sheenColor: new THREE.Color(0xffffff) }); break; }
    case 'card': { const S = paperSet([244, 240, 230], 'card'); m = P({ map: S.map, normalMap: S.normalMap, normalScale: new THREE.Vector2(.35, .35), color: 0xffffff, roughness: .9 }); break; }
    case 'parchment': { const S = paperSet(); m = P({ map: parchment(), normalMap: S.normalMap, normalScale: new THREE.Vector2(.4, .4), color: 0xffffff, roughness: .82, side: THREE.DoubleSide }); break; }
    case 'glass': m = thinGlass({ color: col ? col.clone().multiplyScalar(.05) : 0x000000, absorb: col ? .08 : .035 }); break;
    case 'solidglass': m = liquid({ tint: col || 0xf4fbff, dist: col ? 1.2 : 8, ior: 1.5, thickness: .8, rough: .01 }); break;
    case 'water': m = liquid({ tint: col || 0x3aa6b8, dist: 1.6, ior: 1.333, thickness: 1.2, rough: .03, normal: relief('ripple').normalMap, ns: .12 }); break;
    case 'liquid': m = liquid({ tint: col || 0x7fd6c8, dist: .9, ior: 1.34, thickness: 1, rough: .02 }); break;
    case 'ice': m = liquid({ tint: col || 0xdff4ff, dist: 3, ior: 1.31, thickness: .6, rough: .14, normal: relief('ripple').normalMap, ns: .45 }); break;
    case 'gel': m = liquid({ tint: col || 0x9fe0c0, dist: .8, ior: 1.34, thickness: 1, rough: .18 }); break;
    case 'membrane': m = liquid({ tint: col || 0xffb0c0, dist: .5, ior: 1.36, thickness: .4, rough: .3 }); m.transparent = true; m.opacity = .9; break;
    case 'plastic': { const R = relief('peel'); m = P({ color: 0xd94a3a, roughness: .38, normalMap: R.normalMap, normalScale: new THREE.Vector2(.12, .12), clearcoat: .45, clearcoatRoughness: .18 }); break; }
    case 'rubber': { const R = relief('rubber'); m = P({ color: 0x232323, roughness: .82, normalMap: R.normalMap, normalScale: new THREE.Vector2(.45, .45), sheen: .5, sheenRoughness: .55, sheenColor: new THREE.Color(0x808080) }); break; }
    case 'ceramic': { const R = relief('peel'); m = P({ color: 0xf2efe8, roughness: .45, clearcoat: 1, clearcoatRoughness: .05, clearcoatNormalMap: R.normalMap, clearcoatNormalScale: new THREE.Vector2(.18, .18) }); break; }
    case 'stone': { const R = relief('stone'); m = P({ map: stone(), normalMap: R.normalMap, normalScale: new THREE.Vector2(.9, .9), roughnessMap: R.roughnessMap, color: 0xffffff, roughness: 1 }); break; }
    case 'marble': { const M = marbleSet(); m = P({ map: M.map, roughnessMap: M.roughnessMap, color: 0xffffff, roughness: .32, clearcoat: .45, clearcoatRoughness: .08 }); break; }
    case 'plaster': { const R = relief('ground'); m = P({ map: plaster(), normalMap: R.normalMap, normalScale: new THREE.Vector2(.35, .35), color: 0xffffff, roughness: .95 }); break; }
    case 'fabric': { const R = relief('weave'); m = P({ color: 0x7a2e24, roughness: .95, normalMap: R.normalMap, normalScale: new THREE.Vector2(.5, .5), sheen: 1, sheenColor: new THREE.Color(0xffc0a0), sheenRoughness: .55 }); break; }
    case 'felt': { const F = feltSet(); m = P({ map: F.map, normalMap: F.normalMap, normalScale: new THREE.Vector2(.6, .6), color: 0x2f4a36, roughness: 1, sheen: .8, sheenRoughness: .8, sheenColor: new THREE.Color(0x9ab09a) }); break; }
    case 'leather': { const R = relief('leather'); m = P({ map: leather(), normalMap: R.normalMap, normalScale: new THREE.Vector2(.6, .6), color: 0xffffff, roughness: .6, clearcoat: .25, clearcoatRoughness: .4 }); break; }
    case 'cork': { const V = variation('sand'), R = relief('ground'); m = P({ map: V.map, normalMap: R.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), color: 0xb8875a, roughness: .92 }); break; }
    case 'foliage': m = P({ map: variation('foliage').map, color: 0x4f7a3a, roughness: .78, sheen: .4, sheenColor: new THREE.Color(0xb8e090), sheenRoughness: .5, flatShading: true }); break;
    case 'grass': { const R = relief('ground'); m = P({ map: variation('grass').map, normalMap: R.normalMap, normalScale: new THREE.Vector2(.8, .8), color: 0x6f9a48, roughness: .95, sheen: .5, sheenColor: new THREE.Color(0xd0f0a0) }); break; }
    case 'soil': { const R = relief('ground'); m = P({ map: variation('soil').map, normalMap: R.normalMap, normalScale: new THREE.Vector2(1, 1), color: 0x5d4330, roughness: 1 }); break; }
    case 'sand': { const R = relief('ground'); m = P({ map: variation('sand').map, normalMap: R.normalMap, normalScale: new THREE.Vector2(.6, .6), color: 0xd8c08e, roughness: 1 }); break; }
    case 'snow': { const R = relief('ground'); m = P({ map: variation('snow').map, normalMap: R.normalMap, normalScale: new THREE.Vector2(.4, .4), color: 0xf6f8fb, roughness: .65, sheen: .6, sheenColor: new THREE.Color(0xdde8ff) }); break; }
    case 'skin': m = P({ color: 0xe0ac8c, roughness: .55, sheen: .4, sheenColor: new THREE.Color(0xff9a7a) }); break;
    case 'crystal': m = P({ color: 0xf4f8fb, roughness: .28, metalness: 0, clearcoat: .9, clearcoatRoughness: .08, sheen: .6, sheenColor: new THREE.Color(0xdfeeff), sheenRoughness: .4, emissive: new THREE.Color(0x9ab4c8), emissiveIntensity: .06, envMapIntensity: 1.4, flatShading: true }); break;
    case 'emissive': m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col || new THREE.Color(0xffd27a), emissiveIntensity: 2.2, roughness: .4 }); break;
    case 'neon': m = new THREE.MeshBasicMaterial({ color: col ? col.clone().multiplyScalar(2.5) : new THREE.Color(3, 2.4, 1.2), toneMapped: false }); break;
    case 'cloud': m = P({ color: 0xffffff, roughness: 1, sheen: .6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: .9, transparent: true, opacity: .94 }); break;
    case 'smoke': m = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1, transparent: true, opacity: .5, depthWrite: false }); break;
    case 'ink': m = new THREE.MeshBasicMaterial({ color: 0x2a1e15 }); break;
    case 'chalk': { const R = relief('rubber'); m = P({ color: 0xf4f1ea, roughness: 1, normalMap: R.normalMap, normalScale: new THREE.Vector2(.3, .3) }); break; }
    default: m = P({ color: 0xcccccc, roughness: .5 });
  }
  if (col && p !== 'emissive' && p !== 'neon' && p !== 'glass' && !LIQUIDS.has(p)) m.color.copy(col);
  if (spec.emissive && m.emissive) { m.emissive.set(spec.emissive); m.emissiveIntensity = spec.emissiveIntensity ?? 1.5; }
  if (spec.opacity != null && spec.opacity < 1 && !m.userData.thin) { m.transparent = true; m.opacity = spec.opacity; m.depthWrite = false; }
  if (spec.roughness != null && 'roughness' in m) m.roughness = spec.roughness;
  if (spec.metalness != null && 'metalness' in m) m.metalness = spec.metalness;
  if (spec.wireframe) m.wireframe = true;
  if (spec.side === 'double' && !m.transmission) m.side = THREE.DoubleSide;
  m.userData.preset = p;
  return m.userData.thin ? m : hook(m);
}
// Upgrade a plain material made by older code (MeshStandardMaterial literals) with the card-stage hook.
export { hook as pbrHook };
