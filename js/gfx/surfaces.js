// Interior realism for the library hub and the book rooms (see docs/research/realism-playbook.md §4):
//  • RoomProbe: the hall (or a room) is rendered once into a cube map from eye height, with its windows and flames at
//    their real HDR radiance, and pre-filtered (PMREM) into scene.environment. Polished marble, gilt, brass, glass and
//    varnish then reflect their real surroundings instead of a generic grey studio. Re-captured only when the room is
//    rebuilt (size, bookcases moved). Reflections are box-projected onto the room's walls (Babylon.js "local cubemaps",
//    CubeTexture.boundingBoxSize/Position), so a window mirrored in the floor stays where the window is as you walk.
//  • surface(material, opts): one onBeforeCompile extension of MeshStandard/PhysicalMaterial adding (uniform-driven,
//    so most materials share a program; only box projection, floor/wall occlusion and traffic are defines):
//    box-projected IBL, a rotated detail normal layer (breaks the tile), world-space macro variation of albedo and
//    roughness, edge wear from per-vertex face-edge distances (boxes built by baroque.js `Acc`) or from screen-space
//    curvature (turned brass), water-gilding logic (burnished highs, matte toned hollows, red bole on rubbed arrises),
//    marble's subsurface wrap, floor contact occlusion from furniture footprints and walls, wall/corner occlusion.
//  • enrich(root): attaches the companion normal/roughness maps made by textures.js to materials that only set a map.
//  • RoomAO: three's GTAOPass at quality 'high' only, fed by the composer's own resolved depth (normals reconstructed
//    from depth), so it costs one AO + one denoise pass and no extra scene render.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { AAA } from './aaa.js';
import { companions } from './textures.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// shared by every patched material; set per scene before it renders (scene.onBeforeRender, see bindRoom)
export const SURF_U = {
  smBoxMin: { value: V3(-1e4, -1e4, -1e4) }, smBoxMax: { value: V3(1e4, 1e4, 1e4) }, smProbePos: { value: V3() }, smBoxK: { value: 0 },
  smRoom: { value: new THREE.Vector4(-7, -6, 7, 6) },          // interior minX, minZ, maxX, maxZ
  smRoomY: { value: new THREE.Vector4(0, 5, 6, .42) },          // floor y, cornice y, ceiling y, wall-case depth
  smFoot: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, -1, -1)) }, smFootN: { value: 0 },
  smAisle: { value: new THREE.Vector4(0, 1.1, 0, 0) }           // traffic: aisle centre x, half width; door z, (unused)
};

const COMMON = /* glsl */`
uniform vec3 smBoxMin; uniform vec3 smBoxMax; uniform vec3 smProbePos; uniform float smBoxK;
uniform vec4 smRoom; uniform vec4 smRoomY; uniform vec4 smFoot[ 24 ]; uniform int smFootN; uniform vec4 smAisle;
uniform vec4 smMacro; uniform vec4 smDetail; uniform vec4 smEdge; uniform vec4 smSSS; uniform vec4 smMode;
varying vec4 vSmEdge;
vec3 smWorldPos() { return ( vec4( - vViewPosition - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz; }
float smHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float smNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( smHash( i ), smHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( smHash( i + vec3( 0, 1, 0 ) ), smHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( smHash( i + vec3( 0, 0, 1 ) ), smHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( smHash( i + vec3( 0, 1, 1 ) ), smHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float smFbm( vec3 p ) { return ( 0.5 * smNoise( p ) + 0.25 * smNoise( p * 2.03 + 7.1 ) + 0.125 * smNoise( p * 4.01 + 3.3 ) ) / 0.875; }
`;
// box projection of the reflection vector onto the room box (parallax-corrected cube map)
const BOXPROJ = /* glsl */`
reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
#ifdef SM_BOXPROJ
if ( smBoxK > 0.0 ) {
  vec3 wp = smWorldPos();
  vec3 t1 = ( smBoxMax - wp ) / reflectVec, t0 = ( smBoxMin - wp ) / reflectVec, tf = max( t1, t0 );
  float tt = min( min( tf.x, tf.y ), tf.z );
  if ( tt > 0.0 && tt < 1e3 ) reflectVec = normalize( mix( reflectVec, normalize( wp + reflectVec * tt - smProbePos ), smBoxK * ( 1.0 - roughness ) ) );
}
#endif`;
// smMode: x = wear kind (0 none, 1 wood, 2 paint, 3 gilt, 4 metal), y = gilt cavity from vertex colour, z = curvature
// wear on, w = face-edge wear on. Uniform-driven (coherent branches), so most materials share one program.
const WEAR = /* glsl */`
vec3 smWP = smWorldPos(); float smM = 0.5, smWear = 0.0, smCav = 0.0;
if ( smMacro.y + smMacro.z > 0.0 ) { smM = smFbm( smWP * smMacro.x ); diffuseColor.rgb *= 1.0 + smMacro.y * ( smM - 0.5 ) * 2.0; }
if ( smMode.w > 0.5 ) { float d = 9.0; if ( vSmEdge.x + vSmEdge.y > 1e-4 ) d = min( min( vSmEdge.x, vSmEdge.y ), min( vSmEdge.z, vSmEdge.w ) );
  float e = 1.0 - smoothstep( 0.0, smEdge.x, d ); if ( e > 0.0 ) smWear = e * smoothstep( 0.35, 0.75, smNoise( smWP * smEdge.y ) + 0.35 * e ); }
if ( smMode.z > 0.5 ) { vec3 nn = normalize( vNormal ); float c = length( fwidth( nn ) ) / max( length( fwidth( smWP ) ), 1e-5 );
  smWear = max( smWear, smoothstep( smEdge.z, smEdge.w, c ) * smoothstep( 0.25, 0.75, smNoise( smWP * smEdge.y ) ) ); }
#ifdef USE_COLOR
if ( smMode.y > 0.5 ) smCav = clamp( ( 1.0 - vColor.r ) * 1.6, 0.0, 1.0 );
#endif
int smK = int( smMode.x + 0.5 );
if ( smK == 1 ) diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.5 + 0.012, smWear * 0.65 );
else if ( smK == 2 ) diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.72, 0.66, 0.58 ), smoothstep( 0.45, 0.6, smWear ) );
else if ( smK == 3 ) diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.13, 0.06 ), smoothstep( 0.55, 0.65, smWear ) );
else if ( smK == 4 ) diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.1 + 0.02, smWear );`;
const ROUGH = /* glsl */`
roughnessFactor *= 1.0 + smMacro.z * ( smM - 0.5 ) * 2.0;
#ifdef SM_TRAFFIC
{ float dWall = min( min( smWP.x - smRoom.x, smRoom.z - smWP.x ), min( smWP.z - smRoom.y, smRoom.w - smWP.z ) ) - smRoomY.w;
  float tr = 0.7 * ( 1.0 - smoothstep( smAisle.y * 0.5, smAisle.y * 1.6, abs( smWP.x - smAisle.x ) ) ) + 0.45 * smoothstep( 0.25, 0.6, dWall ) * ( 1.0 - smoothstep( 0.9, 1.6, dWall ) );
  tr *= 0.55 + 0.9 * smNoise( smWP * vec3( 1.7, 1.0, 0.6 ) );
  roughnessFactor = mix( roughnessFactor, roughnessFactor + 0.13, clamp( tr, 0.0, 1.0 ) ); }
#endif
if ( smK == 1 ) roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.75, smWear );
else if ( smK == 3 ) roughnessFactor = mix( mix( roughnessFactor, 0.1, smWear * 0.85 ), 0.62, smoothstep( 0.55, 0.65, smWear ) );
else if ( smK == 4 ) roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.45, smWear );
roughnessFactor = mix( roughnessFactor, 0.5, smCav );`;
const METAL = /* glsl */`
if ( smK == 3 ) metalnessFactor *= 1.0 - smoothstep( 0.55, 0.65, smWear );
metalnessFactor *= 1.0 - 0.5 * smCav;`;
const DETAIL = /* glsl */`
if ( smDetail.y > 0.0 ) { vec2 duv = mat2( 0.8, -0.6, 0.6, 0.8 ) * vNormalMapUv * smDetail.x + smDetail.zw; vec3 dN = texture2D( normalMap, duv ).xyz * 2.0 - 1.0; mapN.xy += dN.xy * smDetail.y; }
mapN.xy *= normalScale;`;
const AOCHUNK = /* glsl */`
#ifdef SM_FLOORAO
{ float dWall = min( min( smWP.x - smRoom.x, smRoom.z - smWP.x ), min( smWP.z - smRoom.y, smRoom.w - smWP.z ) ) - smRoomY.w;
  float ao = mix( 0.5, 1.0, smoothstep( 0.0, 0.5, dWall ) );
  for ( int i = 0; i < 24; i ++ ) { if ( i >= smFootN ) break; vec4 f = smFoot[ i ]; vec2 q = abs( smWP.xz - f.xy ) - f.zw; float sd = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ); ao *= mix( 0.42, 1.0, smoothstep( -0.05, 0.32, sd ) ); }
  reflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= mix( 1.0, ao, 0.6 ); reflectedLight.directDiffuse *= mix( 1.0, ao, 0.55 ); }
#endif
#ifdef SM_WALLAO
{ float ao = mix( 0.6, 1.0, smoothstep( 0.0, 0.55, smWP.y - smRoomY.x ) ) * mix( 0.78, 1.0, smoothstep( 0.0, 0.7, abs( smRoomY.y - smWP.y ) ) );
  float dc = max( min( smWP.x - smRoom.x, smRoom.z - smWP.x ), min( smWP.z - smRoom.y, smRoom.w - smWP.z ) ); ao *= mix( 0.7, 1.0, smoothstep( 0.0, 0.6, dc ) );
  reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix( 1.0, ao, 0.4 ); reflectedLight.indirectSpecular *= ao; }
#endif`;

// Apply the feature set of material m (m.userData.surf) to a shader inside onBeforeCompile.
export function patchSurface(s, m) {
  const f = m.userData.surf; if (!f) return;
  Object.assign(s.uniforms, SURF_U, m.userData.smU);
  let fs = s.fragmentShader, vs = s.vertexShader;
  fs = fs.replace('#include <common>', '#include <common>\n' + COMMON);
  if (f.box) fs = fs.replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', BOXPROJ));
  fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + WEAR);
  fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + ROUGH);
  fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + METAL);
  fs = fs.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', DETAIL));
  fs = fs.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment
    .replace('vec3 irradiance = dotNL * directLight.color;', 'vec3 irradiance = dotNL * directLight.color;\n\tfloat smWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + smSSS.w ) / ( 1.0 + smSSS.w ) );\n\tvec3 smDiffIrr = directLight.color * mix( vec3( dotNL ), vec3( smWrapNL ), smSSS.rgb );')
    .replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', 'reflectedLight.directDiffuse += smDiffIrr * BRDF_Lambert( material.diffuseColor );'));
  fs = fs.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nif ( smK == 1 ) material.clearcoat *= 1.0 - 0.6 * smWear;\n#endif');
  if (f.floorAO || f.wallAO) fs = fs.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + AOCHUNK);
  vs = vs.replace('void main() {', 'attribute vec4 aEdge;\nvarying vec4 vSmEdge;\nvoid main() {').replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvSmEdge = aEdge;');
  m.defaultAttributeValues = Object.assign({}, m.defaultAttributeValues, { aEdge: [9, 9, 9, 9] });   // meshes without the attribute: no wear
  s.fragmentShader = fs; s.vertexShader = vs;
}
// opts: { box, detail: [scale, strength], macro: [freq (1/m), albedo ±, roughness ±], edge: width m | curv: [c0, c1],
//   wear: 1 wood | 2 paint | 3 gilt | 4 metal, noise: freq of the wear break-up (1/m), gilt, sss: [r, g, b, wrap],
//   floorAO, wallAO, traffic }. Chains any existing onBeforeCompile (materials.js hook); defines keep programs apart.
export function surface(m, o = {}) {
  if (!m || !(m.isMeshStandardMaterial) || m.userData.frontPatched) return m;
  const f = Object.assign({}, m.userData.surf || {}, o), D = {};
  D.SM_SURF = '';
  if (f.box !== false) { f.box = true; D.SM_BOXPROJ = ''; }
  if (!(f.detail && m.normalMap)) f.detail = null;
  if (f.floorAO) D.SM_FLOORAO = ''; if (f.wallAO) D.SM_WALLAO = ''; if (f.traffic) D.SM_TRAFFIC = '';
  m.userData.surf = f;
  const U = m.userData.smU || (m.userData.smU = { smMacro: { value: new THREE.Vector4() }, smDetail: { value: new THREE.Vector4() }, smEdge: { value: new THREE.Vector4() }, smSSS: { value: new THREE.Vector4() }, smMode: { value: new THREE.Vector4() } });
  U.smMacro.value.set(f.macro ? f.macro[0] : 1, f.macro ? f.macro[1] : 0, f.macro ? f.macro[2] || 0 : 0, 0);
  U.smDetail.value.set(f.detail ? f.detail[0] : 1, f.detail ? f.detail[1] : 0, .37, .61);
  U.smEdge.value.set(f.edge || .01, f.noise || 18, f.curv ? f.curv[0] : 0, f.curv ? f.curv[1] : 1);
  U.smSSS.value.set(...(f.sss || [0, 0, 0, 0]));
  U.smMode.value.set(f.wear || 0, f.gilt ? 1 : 0, f.curv ? 1 : 0, f.edge ? 1 : 0);
  m.defines = Object.assign({}, m.defines, D);
  if (!m.userData.smChained) {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    const own = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');
    m.onBeforeCompile = function (s, r) { if (own) prev.call(this, s, r); patchSurface(s, this); };
    const pk = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? prevKey : null;
    m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|surf';
    m.userData.smChained = true;
  }
  m.needsUpdate = true;
  return m;
}
// Companion maps for materials built elsewhere (props.js, room.js): colour + normal + roughness (+ metalness, sheen).
export function enrich(root, { box = true } = {}) {
  root.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    [].concat(o.material).forEach(m => {
      if (!m || !m.isMeshStandardMaterial || m.userData.frontPatched || m.userData.smEnriched || m.isShaderMaterial) return;
      m.userData.smEnriched = true;
      const c = companions(m.map);
      if (c) {
        if (c.normalMap && !m.normalMap && AAA.quality !== 'low') { m.normalMap = c.normalMap; m.normalScale.setScalar(c.normalScale ?? .5); }
        if (c.roughnessMap && !m.roughnessMap) { m.roughnessMap = c.roughnessMap; if (c.roughness != null) m.roughness = Math.min(1, m.roughness / .6 * c.roughness); }
        if (c.metalMap && !m.metalnessMap) { m.metalnessMap = c.roughnessMap; m.metalness = c.metalness ?? 1; }
        if (c.sheen && m.isMeshPhysicalMaterial && !m.sheen) { m.sheen = .8; m.sheenRoughness = .35; m.sheenColor = m.color.clone().lerp(new THREE.Color(1, .95, .9), .45); }
      }
      if (box && !m.userData.surf && !(m.onBeforeCompile && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.userData.preset)) surface(m, { box: true, detail: m.normalMap ? [4.3, .35] : null });
    });
  });
}

// ---------------------------------------------------------------- the room probe ----------------------------------
export class RoomProbe {
  constructor(gfx) { this.gfx = gfx; this.rt = null; this.box = new THREE.Box3(); this.pos = V3(); this.ms = 0; }
  // scene: the room; o: { box: Box3 of the interior, pos: probe position, boost: [[material, k]], hide: [objects],
  //   fakeGI: [lights whose intensity stands in for bounce light: scaled by giScale once the probe lights the room] }
  capture(scene, o = {}) {
    const g = this.gfx, r = g.renderer, q = this.q = AAA.quality, t0 = performance.now();
    const size = q === 'low' ? 128 : 256, bounces = q === 'high' ? 2 : 1;
    const crt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(.05, 200, crt); this.pos.copy(o.pos || V3(0, 1.7, 0)); cam.position.copy(this.pos); cam.updateMatrixWorld(true);
    if (o.box) this.box.copy(o.box);
    const hidden = []; scene.traverse(x => { if (x.userData.noProbe && x.visible) { x.visible = false; hidden.push(x); } }); (o.hide || []).forEach(x => { if (x && x.visible) { x.visible = false; hidden.push(x); } });
    // windows (materials flagged userData.hdr = k) are k× brighter inside the probe: their real radiance relative to the room
    const hdr = new Map(o.boost || []); scene.traverse(x => { if (x.material && x.visible) [].concat(x.material).forEach(m => { if (m && m.userData.hdr && m.color && !hdr.has(m)) hdr.set(m, m.userData.hdr); }); });
    const boosts = [...hdr].filter(([m]) => m && m.color).map(([m, k]) => { const c = m.color.clone(); m.color.multiplyScalar(k); return () => m.color.copy(c); });
    const gi = (o.fakeGI || []).filter(Boolean); gi.forEach(L => { if (L.userData.giBase == null) L.userData.giBase = L.intensity; L.intensity = L.userData.giBase; });
    const sm = r.shadowMap, au = sm.autoUpdate; sm.autoUpdate = false; sm.needsUpdate = true;
    let out = null;
    try {
      for (let b = 0; b < bounces; b++) {
        this.apply(scene, b > 0);
        cam.update(r, scene);
        const next = g.pmrem.fromCubemap(crt.texture);
        if (out) out.dispose(); out = next;
        scene.environment = out.texture; scene.environmentIntensity = 1;
        gi.forEach(L => { L.intensity = L.userData.giBase * (o.giScale ?? .3); });
      }
    } catch (e) { console.warn('room probe', e); }
    finally {
      boosts.forEach(f => f()); hidden.forEach(x => { x.visible = true; }); sm.autoUpdate = au; sm.needsUpdate = true; crt.dispose();
    }
    if (out) { if (this.rt) this.rt.dispose(); this.rt = out; out.texture.userData.shared = true; scene.environment = out.texture; scene.environmentIntensity = 1; }
    this.apply(scene, true); this.ms = performance.now() - t0;
    return this.rt && this.rt.texture;
  }
  // captured at another quality level (probe size and bounces follow gfx.quality): capture again
  stale() { return !!this.rt && this.q !== AAA.quality; }
  // write the probe's box into the shared uniforms (called before every render of this scene)
  apply(scene, on = true) { const U = SURF_U; U.smBoxMin.value.copy(this.box.min); U.smBoxMax.value.copy(this.box.max); U.smProbePos.value.copy(this.pos); U.smBoxK.value = on && this.rt ? 1 : 0; }
  dispose() { if (this.rt) { this.rt.dispose(); this.rt = null; } }
}
// Bind a room's uniforms (probe box, room box, furniture footprints) to its scene, so the shared materials of the hall
// and of a book room never see each other's values. room: { w, d, floor, cornice, ceiling, caseDepth, aisle }
export function bindRoom(scene, probe, room) {
  const st = scene.userData.smRoom = Object.assign(scene.userData.smRoom || { feet: [] }, room);
  scene.onBeforeRender = () => {
    const U = SURF_U; probe.apply(scene, true);
    U.smRoom.value.set(-st.w / 2, -st.d / 2, st.w / 2, st.d / 2); U.smRoomY.value.set(st.floor || 0, st.cornice || 5, st.ceiling || 6, st.caseDepth || 0);
    U.smAisle.value.set(st.aisle ? st.aisle[0] : 0, st.aisle ? st.aisle[1] : 1.1, 0, 0);
    const F = st.feet || []; U.smFootN.value = Math.min(24, F.length); for (let i = 0; i < U.smFootN.value; i++) U.smFoot.value[i].copy(F[i]);
  };
  // anything rendered after this scene (a diorama, a pedestal's sketch, the inset) sees no room box and no footprints
  scene.onAfterRender = () => { SURF_U.smBoxK.value = 0; SURF_U.smFootN.value = 0; };
}
// Floor footprints (x, z, half x, half z) of objects standing on the floor, from their world bounding boxes.
export function footprints(objs, maxY = 1.2) {
  const out = [], b = new THREE.Box3();
  objs.forEach(o => { if (!o || !o.visible) return; b.setFromObject(o); if (b.isEmpty() || b.min.y > .15 || b.max.y < .05) return; const c = b.getCenter(V3()), s = b.getSize(V3()); if (s.x > 6 || s.z > 6) return; out.push(new THREE.Vector4(c.x, c.z, s.x / 2 * .92, s.z / 2 * .92)); });
  return out.slice(0, 24);
}

// ---------------------------------------------------------------- GTAO at 'high' --------------------------------------
// Inserted before the outline pass (linear HDR). It multiplies the final colour, so its intensity stays at 0.55.
export class RoomAO {
  constructor(gfx, scene, camera) {
    this.gfx = gfx; this.scene = scene; this.camera = camera; this.pass = null; this.remove = null;
  }
  update() {
    const want = AAA.quality === 'high' && !this.gfx.lowQ;
    if (want && !this.pass) {
      const g = this.gfx, rb = g.composer.readBuffer;
      // (r170's setGBuffer(depthTexture) dereferences a normal target it never made: build it normally, then switch it
      // to depth-only input — normals reconstructed from depth — and shrink the unused normal target to 1×1)
      const p = this.pass = new GTAOPass(this.scene, this.camera, Math.max(2, innerWidth * g.dpr), Math.max(2, innerHeight * g.dpr));
      p._renderGBuffer = false; p.depthTexture = rb.depthTexture; p.normalTexture = null;
      [p.gtaoMaterial, p.pdMaterial].forEach(m => { m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x'; m.uniforms.tNormal.value = null; m.uniforms.tDepth.value = rb.depthTexture; m.needsUpdate = true; });
      const setSize = p.setSize.bind(p); p.setSize = (w, h) => { setSize(w, h); p.normalRenderTarget.setSize(1, 1); }; p.normalRenderTarget.setSize(1, 1);
      p.output = GTAOPass.OUTPUT.Default; p.blendIntensity = .55;
      p.updateGtaoMaterial({ radius: .3, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      p.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
      // the composer's two buffers alternate between frames: read the depth of the one the scene was drawn into
      const render = p.render.bind(p); p.render = (r, w, read, dt, mask) => { const d = read.depthTexture; if (d && p.gtaoMaterial.uniforms.tDepth.value !== d) { p.gtaoMaterial.uniforms.tDepth.value = d; p.pdMaterial.uniforms.tDepth.value = d; } return render(r, w, read, dt, mask); };
      this.remove = g.addPass(p, g.outline);
    } else if (!want && this.pass) this.dispose();
    if (this.pass) this.pass.camera = this.camera;
  }
  dispose() { if (this.remove) this.remove(); this.remove = null; if (this.pass) { this.pass.dispose(); this.pass = null; } }
}
