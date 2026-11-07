// AAA surface module: procedural GLSL materials with parallax-occlusion relief, silhouette fracture, wetness and
// quality levels. Everything is generated on the GPU (no image downloads). See docs/research/aaa-rendering.md.
//
//  • GLSL noise library: integer hashes (PCG), simplex 2D/3D (runtime, non-tiling), periodic gradient noise, fBm,
//    ridged multifractal and periodic Voronoi with true border distance (bake, tiling).
//  • Bake: each material kind is rendered ONCE into a small tileable render target (512² at medium/high, 256² at
//    low; RGBA16F where the GPU can render to it): R = height, G = albedo variation, B = kind mask (stone id, grass,
//    vein, crack…), A = roughness variation. Mip-mapped, so the relief anti-aliases with distance. The per-pixel
//    material only reads this texture: one fetch per ray-march step.
//  • Material: an onBeforeCompile extension of MeshPhysicalMaterial (keeps three's lights, shadows, IBL, fog, the
//    materialize card stage). World-space projection (planar Y for ground, dominant-axis triplanar for rocks/bark);
//    parallax occlusion mapping as a ray-march through the height layer with secant + binary refinement, LOD by
//    distance, view angle and texel footprint; silhouette clipping (curvature-corrected ray leaving the shell, or
//    an explicit boundary) by discard; optional pixel-depth offset and self-shadowing (high quality).
//  • Channels: albedo (by slope, height band, macro variation), normal (surface-gradient from the height, two
//    scales), roughness, metalness (mineral flecks), cavity AO that attenuates the ambient (IBL + hemisphere).
//  • Wetness: global uniform uAaaWet (0..1) plus a local wet spot; water collects on up-facing surfaces, darkens
//    porous albedo, smooths roughness, fills cavities as puddles (a clearcoat water film with rain ripples) and
//    adds dew glints.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ---------------------------------------------------------------- quality ----------------------------------------
// pom: max / min ray-march steps; refine: binary steps; cascades: sun shadow cascades for outdoor presets;
// god: god-ray samples (0 = no atmosphere pass); passes: extra full-screen passes; pdo: pixel depth offset.
export const QUALITY = {
  low: { pom: 0, pomMin: 0, refine: 0, cascades: 1, god: 0, passes: 0, pdo: false, selfShadow: false, bake: 256, glints: false },
  medium: { pom: 12, pomMin: 4, refine: 2, cascades: 2, god: 24, passes: 1, pdo: false, selfShadow: false, bake: 512, glints: true },
  high: { pom: 24, pomMin: 4, refine: 4, cascades: 3, god: 48, passes: 2, pdo: true, selfShadow: true, bake: 512, glints: true }
};
export const AAA = {
  quality: 'medium', renderer: null, halfFloat: false,
  // shared uniforms (one object for every AAA material)
  uniforms: {
    uAaaWet: { value: 0 }, uAaaRain: { value: 0 }, uAaaTime: { value: 0 },
    uAaaWetSpot: { value: new THREE.Vector4(0, 0, 1, 0) },        // x, z, radius, amount
    uAaaPomSteps: { value: new THREE.Vector2(12, 4) },             // max, min
    uAaaPomLod: { value: new THREE.Vector2(3, 26) },               // world distance: full steps → min steps
    uAaaPomOn: { value: 1 }
  },
  mats: new Set(), bakes: new Map(),
  get Q() { return QUALITY[this.quality] || QUALITY.medium; }
};

// Cheap GPU tier detection: unmasked renderer string, devicePixelRatio, MSAA/texture limits.
export function detectQuality(renderer) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { }
  const n = name.toLowerCase(), dpr = window.devicePixelRatio || 1, caps = renderer.capabilities;
  let q = 'medium';
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic/.test(n)) q = 'low';
  else if (/mali|adreno|powervr|apple gpu|videocore|tegra/.test(n)) q = 'low';
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?! (r[2-5]|hd|vega [38]))|apple m[1-9] (pro|max|ultra)/.test(n)) q = 'high';
  else if (/intel|iris|uhd|hd graphics|vega [38]|apple m[1-9]/.test(n)) q = 'medium';
  if (q === 'high' && dpr > 2.2) q = 'medium';                           // 4K/5K laptop panels: pixels cost more than steps
  if (caps.maxSamples < 4 || caps.maxTextureSize < 8192) q = q === 'high' ? 'medium' : 'low';
  // adaptive-resolution history: a GPU that has hit the resolution floor before starts one level lower
  try { const h = JSON.parse(localStorage.getItem('sm-gfx-history') || '{}'); if (h.gpu === name && h.down) q = h.down; } catch (e) { }
  return { quality: q, gpu: name };
}

// ---------------------------------------------------------------- GLSL library -----------------------------------
export const NOISE_GLSL = /* glsl */`
uint aaaPcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float aaaHash(vec2 c, float seed){ uvec2 q=uvec2(ivec2(c)+ivec2(32768)); return float(aaaPcg(q.x+aaaPcg(q.y+aaaPcg(uint(seed)))))/4294967295.0; }
vec2 aaaHash2(vec2 c, float seed){ uvec2 q=uvec2(ivec2(c)+ivec2(32768)); uint h=aaaPcg(q.x+aaaPcg(q.y+aaaPcg(uint(seed)+977u))); return vec2(float(h&0xffffu),float(h>>16u))/65535.0; }
// --- simplex 2D / 3D (Ashima Arts / Stefan Gustavson, MIT) — runtime, non-periodic ---
vec3 aaaPerm3(vec3 x){ return mod(((x*34.0)+10.0)*x, 289.0); }
vec4 aaaPerm4(vec4 x){ return mod(((x*34.0)+10.0)*x, 289.0); }
float aaaSimplex2(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx); vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod(i,289.);
  vec3 p=aaaPerm3(aaaPerm3(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw; return 130.*dot(m,g); }
float aaaSimplex3(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod(i,289.);
  vec4 p=aaaPerm4(aaaPerm4(aaaPerm4(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 nr=1.79284291400159-.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)); p0*=nr.x; p1*=nr.y; p2*=nr.z; p3*=nr.w;
  vec4 m=max(.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 105.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
`;
// periodic noise for tiling bakes: every lattice coordinate is wrapped by an integer period P
const BAKE_GLSL = /* glsl */`
vec2 aaaGrad(vec2 c, vec2 P, float seed){ float a=aaaHash(mod(c,P),seed)*6.2831853; return vec2(cos(a),sin(a)); }
float aaaGradNoiseP(vec2 x, vec2 P, float seed){ // periodic gradient (Perlin) noise, ≈ [-0.7, 0.7]
  vec2 i=floor(x), f=x-i, u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(aaaGrad(i,P,seed),f), b=dot(aaaGrad(i+vec2(1,0),P,seed),f-vec2(1,0));
  float c=dot(aaaGrad(i+vec2(0,1),P,seed),f-vec2(0,1)), d=dot(aaaGrad(i+vec2(1,1),P,seed),f-vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float aaaFbmP(vec2 u, vec2 P, int oct, float seed){ float s=0., a=.5, n=0.; vec2 f=P;
  for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*aaaGradNoiseP(u*f,f,seed+float(i)*17.); n+=a; a*=.5; f*=2.; } return clamp(s/n*.75+.5,0.,1.); }
float aaaRidgedP(vec2 u, vec2 P, int oct, float seed){ float s=0., a=.5, n=0., w=1.; vec2 f=P;
  for(int i=0;i<8;i++){ if(i>=oct) break; float r=1.-abs(aaaGradNoiseP(u*f,f,seed+float(i)*13.)*1.4); r*=r; s+=a*r*w; w=clamp(r*1.6,0.,1.); n+=a; a*=.5; f*=2.; } return s/n; }
// periodic Voronoi with true distance to the cell border (two-pass, after Inigo Quilez): x=border, y=F1, z=cell id
vec3 aaaVoronoiP(vec2 x, vec2 P, float seed){
  vec2 n=floor(x), f=x-n, mg, mr; float md=8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), o=aaaHash2(mod(n+g,P),seed)*.85+.075, r=g+o-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; } }
  float bd=8.;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ vec2 g=mg+vec2(i,j), o=aaaHash2(mod(n+g,P),seed)*.85+.075, r=g+o-f; if(dot(mr-r,mr-r)>1e-5) bd=min(bd,dot(.5*(mr+r),normalize(r-mr))); }
  return vec3(bd, sqrt(md), aaaHash(mod(n+mg,P),seed+3.)); }
`;
// kind ids shared by the bake and the material
const KIND_ID = { mud: 0, cobble: 1, crag: 2, meadow: 3, marble: 4, sand: 5, bark: 6 };
const BAKE_FRAG = /* glsl */`
uniform int uKind; uniform float uSeed; varying vec2 vUv;
${NOISE_GLSL}
${BAKE_GLSL}
void main(){
  vec2 u=vUv; float h=0., va=.5, mk=0., ro=.5, s=uSeed;
  if(uKind==0){ // MUD: soft undulation, clods, foot-trodden dimples, fine grain
    float b=aaaFbmP(u,vec2(3),5,s); vec3 v=aaaVoronoiP(u*9.,vec2(9),s+5.); float clod=smoothstep(.45,.0,v.y)*(.4+.6*v.z);
    float dimple=smoothstep(.35,.05,aaaVoronoiP(u*4.,vec2(4),s+9.).y); float fine=aaaFbmP(u,vec2(28),3,s+2.);
    h=.55*b+.22*clod-.18*dimple+.16*fine+.12; va=aaaFbmP(u+.37,vec2(5),4,s+3.); mk=aaaFbmP(u,vec2(2),3,s+4.); ro=aaaFbmP(u,vec2(12),3,s+6.); }
  else if(uKind==1){ // COBBLE: Voronoi setts, domed tops, chipped faces, sandy mortar joints
    vec3 v=aaaVoronoiP(u*5.,vec2(5),s); float e=v.x; float stone=smoothstep(.015,.075,e);
    float dome=pow(clamp(e/.34,0.,1.),.42)*(.72+.28*v.z); float chip=aaaFbmP(u,vec2(36),3,s+1.)-.5;
    float mortar=.04+.07*aaaFbmP(u,vec2(64),2,s+2.);
    h=mix(mortar,dome*.92+.08+chip*.12,stone); va=.55*aaaFbmP(u,vec2(20),3,s+3.)+.45*v.z; mk=v.z; ro=mix(1.,aaaFbmP(u,vec2(14),3,s+4.),stone); }
  else if(uKind==2){ // CRAG: ridged multifractal rock, strata bands, deep fractures
    float r=aaaRidgedP(u,vec2(3),6,s); float w=aaaFbmP(u,vec2(2),3,s+1.);
    float strata=.5+.5*sin(6.2831853*(u.y*7.+1.2*(w-.5))); vec3 v=aaaVoronoiP(u*3.,vec2(3),s+2.); float crack=(1.-smoothstep(.0,.03,v.x+.025*(w-.5)))*smoothstep(.5,.68,aaaFbmP(u,vec2(4),3,s+6.));
    h=.62*r+.2*strata+.12*aaaFbmP(u,vec2(26),3,s+3.)-.22*crack+.14; va=.5*strata+.5*aaaFbmP(u,vec2(6),4,s+4.); mk=crack; ro=aaaFbmP(u,vec2(10),3,s+5.); }
  else if(uKind==3){ // MEADOW: soil with pebbles, root litter and grass clumps (B = grass cover)
    float b=aaaFbmP(u,vec2(4),4,s); vec3 v=aaaVoronoiP(u*14.,vec2(14),s+1.); float peb=smoothstep(.3,.0,v.y)*step(.62,v.z);
    float grass=smoothstep(.42,.62,aaaFbmP(u+.21,vec2(3),4,s+2.)); float blades=aaaFbmP(u,vec2(80,40),2,s+3.);
    h=.42*b+.25*peb+grass*(.22+.22*blades)+.08; va=aaaFbmP(u,vec2(9),4,s+4.); mk=grass; ro=aaaFbmP(u,vec2(16),2,s+5.); }
  else if(uKind==4){ // MARBLE FLOOR: 2×2 polished slabs, grout joints, veins
    vec2 g=fract(u*2.); float gd=min(min(g.x,1.-g.x),min(g.y,1.-g.y)); float grout=smoothstep(.003,.011,gd);
    float w=aaaFbmP(u,vec2(3),5,s); float t=abs(sin(6.2831853*(u.x*2.+u.y+w*2.6))); float vein=pow(1.-t,10.)*.8+pow(1.-t,40.)*.6;
    h=.06+.9*grout+.02*aaaFbmP(u,vec2(40),2,s+1.); va=aaaHash(floor(u*2.),s+2.)*.5+.5*aaaFbmP(u,vec2(6),4,s+3.); mk=clamp(vein,0.,1.); ro=aaaFbmP(u,vec2(8),3,s+4.); }
  else if(uKind==5){ // SAND: wind ripples (gentle stoss, steep lee), grains
    float w=aaaFbmP(u,vec2(2),3,s); float ph=fract(u.x*7.+u.y*1.+ (w-.5)*1.6); float rip=ph<.72?ph/.72:(1.-ph)/.28; rip=rip*rip*(3.-2.*rip);
    h=.5*rip+.28*aaaFbmP(u,vec2(5),3,s+1.)+.16*aaaFbmP(u,vec2(96),2,s+2.)+.04; va=aaaFbmP(u,vec2(7),4,s+3.); mk=step(.985,aaaHash(floor(u*384.),s+4.)); ro=aaaFbmP(u,vec2(20),2,s+5.); }
  else { // BARK: vertical furrows (anisotropic period), cork plates, lichen mask
    float fur=aaaRidgedP(u,vec2(7,1),4,s); vec3 v=aaaVoronoiP(u*vec2(6.,2.),vec2(6,2),s+1.); float plate=smoothstep(.0,.12,v.x);
    h=.58*fur+.3*plate*(.6+.4*v.z)+.12*aaaFbmP(u,vec2(30,10),3,s+2.); va=aaaFbmP(u,vec2(5,2),4,s+3.); mk=smoothstep(.58,.74,aaaFbmP(u+.5,vec2(3),4,s+4.)); ro=aaaFbmP(u,vec2(12),2,s+5.); }
  gl_FragColor=vec4(clamp(h,0.,1.),clamp(va,0.,1.),clamp(mk,0.,1.),clamp(ro,0.,1.));
}`;

// ---------------------------------------------------------------- bake ------------------------------------------
export function initAAA(renderer) {
  AAA.renderer = renderer;
  AAA.halfFloat = !!(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
}
let bakeQuad = null;
function bakeInto(rt, kind) {
  const r = AAA.renderer; if (!r) return;
  if (!bakeQuad) bakeQuad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { uKind: { value: 0 }, uSeed: { value: 1 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false }));
  const m = bakeQuad.material; m.uniforms.uKind.value = KIND_ID[kind]; m.uniforms.uSeed.value = 11 + KIND_ID[kind] * 7;
  const prev = r.getRenderTarget(), xr = r.xr.enabled; r.xr.enabled = false;
  r.setRenderTarget(rt); bakeQuad.render(r); r.setRenderTarget(prev); r.xr.enabled = xr;
}
// One tileable texture per kind, baked on first use and cached (all scenes share it).
export function bakeTex(kind) {
  const S = AAA.Q.bake, key = kind + S;
  if (AAA.bakes.has(key)) return AAA.bakes.get(key).texture;
  const rt = new THREE.WebGLRenderTarget(S, S, { type: AAA.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, colorSpace: THREE.NoColorSpace });
  rt.texture.anisotropy = 8; rt.texture.userData.shared = true; rt.texture.name = 'aaa-' + kind;
  rt.userData = { kind }; AAA.bakes.set(key, rt);
  if (AAA.renderer) { const t0 = performance.now(); bakeInto(rt, kind); AAA.bakeMs = (AAA.bakeMs || 0) + performance.now() - t0; }
  return rt.texture;
}
// after a WebGL context loss every render target is empty: bake them again
export function rebakeAll() { AAA.bakes.forEach(rt => bakeInto(rt, rt.userData.kind)); }
// bake every kind ahead of time, one per idle slot (the first diorama then opens without bake work)
export function prebake(kinds = Object.keys(KIND_ID)) {
  const next = () => { const k = kinds.shift(); if (!k) return; bakeTex(k); (window.requestIdleCallback || setTimeout)(next, { timeout: 1500 }); };
  (window.requestIdleCallback || setTimeout)(next, { timeout: 3000 });
}

// ---------------------------------------------------------------- scanned detail (realism-playbook R13) ----------
// CC0 ambientCG sets, repacked to two 1K JPEGs each in assets/textures (see CREDITS.txt there): <set>_albedo (colour ×
// AO) and <set>_nrm (normal x, y in R, G; roughness in B). They are the MICRO layer only: the procedural bake keeps the
// macro albedo, relief, masks and wetness; the scan modulates albedo by its colour relative to its own mean, adds its
// normal and scales roughness. Two hashed offsets per low-frequency cell break the tiling (after Quilez). Loaded
// lazily on the first AAA material; until they arrive (or if they never do) the weight is 0 and nothing changes.
const SCAN_SETS = { ground: 'ground103', moss: 'moss002', bark: 'bark001' };
const SCAN_OF = { meadow: ['ground', .6], mud: ['ground', .6], sand: ['ground', .8], crag: ['moss', .45], bark: ['bark', .32] };
const SCAN = {}; let scanStarted = false;
function scanDefaults() {
  if (SCAN.ground) return; const px = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; t.userData.shared = true; return t; };
  for (const k in SCAN_SETS) SCAN[k] = { A: { value: px(128, 128, 128) }, N: { value: px(128, 128, 128) }, K: { value: 0 } };
}
export function loadScans(base = 'assets/textures/') {
  scanDefaults(); if (scanStarted || typeof document === 'undefined') return; scanStarted = true;
  const L = new THREE.TextureLoader();
  for (const k in SCAN_SETS) { const S = SCAN[k]; let n = 0; const done = () => { if (++n === 2) S.K.value = 1; };
    const get = (suffix, srgb, slot) => L.load(base + SCAN_SETS[k] + suffix, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.userData.shared = true; t.generateMipmaps = true; t.needsUpdate = true; S[slot].value = t; done(); }, undefined, () => { S.K.value = 0; });
    get('_albedo.jpg', true, 'A'); get('_nrm.jpg', false, 'N'); }
}
export const scanState = () => Object.fromEntries(Object.keys(SCAN).map(k => [k, SCAN[k].K.value]));
const SCAN_GLSL = /* glsl */`
  #ifdef AAA_SCAN
  { vec2 su = vec2( dot( aPh, aE1 ), dot( aPh, aE2 ) ) / aScanTile; vec2 sdx = dFdx( su ), sdy = dFdy( su );
    float ix = ( aaaSimplex2( su * .21 ) * .5 + .5 ) * 4.; float i0 = floor( ix ), fb = smoothstep( .25, .75, fract( ix ) );
    vec2 o0 = aaaHash2( vec2( i0, 3. ), 11. ) * 7.3, o1 = aaaHash2( vec2( i0 + 1., 3. ), 11. ) * 7.3;
    vec3 sa = mix( textureGrad( aScanA, su + o0, sdx, sdy ).rgb, textureGrad( aScanA, su + o1, sdx, sdy ).rgb, fb );
    vec3 sn = mix( textureGrad( aScanN, su + o0, sdx, sdy ).rgb, textureGrad( aScanN, su + o1, sdx, sdy ).rgb, fb );
    vec3 mean = max( textureLod( aScanA, vec2( .5 ), 12. ).rgb, vec3( .02 ) );
    float sk = aScanK * ( 1. - aCard ) * AAA_SCANMASK;
    aAlb = mix( aAlb, aAlb * clamp( sa / mean, vec3( .25 ), vec3( 2.2 ) ), sk );
    vec2 g2 = ( sn.rg * 2. - 1. ) * .6; aN = normalize( aN + ( aE1 * g2.x + aE2 * g2.y ) * sk );
    aRough = clamp( mix( aRough, aRough * ( .55 + .9 * sn.b ), sk * .6 ), .04, 1. ); }
  #endif
`;
const SCAN_MASK = { crag: 'smoothstep( .55, .9, aNg.y )', bark: '1.', meadow: '1.', mud: '1.', sand: '.6' };

// ---------------------------------------------------------------- material shader -------------------------------
const VERT_DECL = 'varying vec3 vAaaPos;\nvarying vec3 vAaaNrm;\n';
const VERT_BODY = /* glsl */`
  { vec4 aw = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
    aw = instanceMatrix * aw;
    #endif
    aw = modelMatrix * aw; vAaaPos = aw.xyz;
    vec3 an = objectNormal;
    #ifdef USE_INSTANCING
    an = mat3( instanceMatrix ) * an;
    #endif
    vAaaNrm = normalize( transpose( mat3( viewMatrix ) ) * ( normalMatrix * an ) ); }`;
const FRAG_DECL = /* glsl */`
varying vec3 vAaaPos; varying vec3 vAaaNrm;
#ifdef AAA_PDO
uniform mat4 projectionMatrix;
#endif
uniform sampler2D aTex; uniform float aTile, aDepthU, aBump, aSilK;
uniform vec3 aCol0, aCol1, aCol2; uniform vec4 aP0, aP1; uniform vec4 aBound; uniform vec2 aYRange; uniform vec3 aShore;
uniform float uAaaWet, uAaaRain, uAaaTime, uAaaPomOn; uniform vec4 uAaaWetSpot; uniform vec2 uAaaPomSteps, uAaaPomLod;
#ifdef AAA_SCAN
uniform sampler2D aScanA, aScanN; uniform float aScanK, aScanTile;
#endif
${NOISE_GLSL}
float aaaH(vec2 uv, vec2 dx, vec2 dy){ return textureGrad(aTex, uv, dx, dy).r; }
// one projection of the triplanar set at world point p: returns the world-space height gradient (x,y,z) and height (w)
vec4 aaaProj(int ax, vec3 p, float eps, vec2 dx, vec2 dy){
  vec3 e1 = ax==0 ? vec3(0,0,1) : vec3(1,0,0); vec3 e2 = ax==1 ? vec3(0,0,1) : vec3(0,1,0);
  vec2 uv = vec2(dot(p,e1), dot(p,e2)) / aTile; float h = aaaH(uv,dx,dy);
  vec2 g = vec2(aaaH(uv+vec2(eps,0.),dx,dy)-h, aaaH(uv+vec2(0.,eps),dx,dy)-h) / eps;
  return vec4((e1*g.x + e2*g.y) * (aDepthU*aBump/aTile), h); }
// rain ripples on standing water: two layers of expanding rings in a jittered grid (gradient of the ripple height)
vec2 aaaRipples(vec2 p, float t){ vec2 g = vec2(0.);
  for(int L=0; L<2; L++){ float sc = L==0 ? 7. : 11.; vec2 q = p*sc + float(L)*.37; vec2 i = floor(q), f = fract(q) - .5;
    float h = aaaHash(i, 41.+float(L)); float ph = fract(t*(.9+.3*h) + h); vec2 o = (aaaHash2(i, 43.) - .5)*.5; vec2 d = f - o; float r = length(d) + 1e-4;
    float x = (r - ph*.45)*30.; g += d/r * cos(x) * exp(-x*x*.08) * (1. - ph) * (1. - ph); }
  return g*.5; }
`;
// main block, inserted in place of <map_fragment>
const FRAG_MAIN = /* glsl */`
  vec3 aP = vAaaPos; vec3 aNg = normalize( vAaaNrm );
  #ifdef DOUBLE_SIDED
  aNg *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  vec3 aV = normalize( aP - cameraPosition ); float aDist = length( aP - cameraPosition );
  float aCard = AAA_CARD;
  vec3 aA = vec3(0,1,0), aE1 = vec3(1,0,0), aE2 = vec3(0,0,1); vec3 aW3 = vec3(0,1,0); float aWdom = 1.; int aAx = 1;
  #if AAA_PROJ == 1
  { vec3 an = abs(aNg); vec3 w = pow(an, vec3(8.)); w /= (w.x + w.y + w.z); aW3 = w;
    if (an.y >= an.x && an.y >= an.z) { aA = vec3(0., sign(aNg.y), 0.); aAx = 1; }
    else if (an.x >= an.z) { aA = vec3(sign(aNg.x), 0., 0.); aE1 = vec3(0,0,1); aE2 = vec3(0,1,0); aAx = 0; }
    else { aA = vec3(0., 0., sign(aNg.z)); aE2 = vec3(0,1,0); aAx = 2; }
    float wmax = max(w.x, max(w.y, w.z)), wmin = min(w.x, min(w.y, w.z)), wmid = w.x + w.y + w.z - wmax - wmin;
    aWdom = smoothstep(.04, .3, wmax - wmid); }
  #endif
  vec2 aUv0 = vec2( dot(aP, aE1), dot(aP, aE2) ) / aTile;
  vec3 aPdx = dFdx( aP ), aPdy = dFdy( aP );
  vec2 aDx = vec2( dot(aPdx, aE1), dot(aPdx, aE2) ) / aTile, aDy = vec2( dot(aPdy, aE1), dot(aPdy, aE2) ) / aTile;
  float aFoot = max( length(aDx), length(aDy) ); float aMip = log2( max( aFoot * AAA_TEX, 1e-4 ) );
  float aCurv = length( fwidth( aNg ) ) / max( length( fwidth( aP ) ), 1e-5 );
  float aNa = max( dot( aNg, aA ), 1e-3 );
  float aDepth = aDepthU * aWdom * ( 1. - aCard ) * smoothstep( .3, .55, aNa ) * ( 1. - smoothstep( 2.5, 4.5, aMip ) ) * uAaaPomOn;
  float aS = 0.; bool aOut = false; vec2 aUv = aUv0;
  vec2 aG = -vec2( dot(aNg, aE1), dot(aNg, aE2) ) / aNa;              // slope of the geometric surface along the projection axis
  #if AAA_MAXSTEPS > 0
  if ( aDepth > 1e-5 ) {
    vec2 vl = vec2( dot(aV, aE1), dot(aV, aE2) ); float va = dot( aV, aA );
    float rho = max( dot( aG, vl ) - va, 1e-3 );                        // depth gained below the surface per unit ray length
    float lat2 = dot( vl, vl );
    float sMax = min( aDepth / rho, aDepth * 14. / max( sqrt(lat2), 1e-3 ) );
    float kc = aCurv * aSilK;                                             // curvature: the surface falls away as k·s²/2
    float nv = abs( dot( aNg, aV ) );
    float lodK = 1. - smoothstep( uAaaPomLod.x, uAaaPomLod.y, aDist );
    float stF = mix( uAaaPomSteps.y, mix( uAaaPomSteps.x * .6, uAaaPomSteps.x, 1. - nv ), lodK );
    int steps = int( clamp( stF, 2., float(AAA_MAXSTEPS) ) ); float ds = sMax / float( steps );
    float sp = 0., fp = -aDepth * ( 1. - aaaH( aUv0, aDx, aDy ) ); bool hit = false; float sh = sMax;
    for ( int i = 1; i <= AAA_MAXSTEPS; i++ ) {
      if ( i > steps ) break;
      float s = ds * float( i );
      float d = rho * s - .5 * kc * s * s * lat2;
      float f = d - aDepth * ( 1. - aaaH( aUv0 + vl * ( s / aTile ), aDx, aDy ) );
      if ( f >= 0. ) {
        float a0 = sp, a1 = s;
        for ( int k = 0; k < AAA_REFINE; k++ ) { float sm = .5 * ( a0 + a1 ); float fm = rho * sm - .5 * kc * sm * sm * lat2 - aDepth * ( 1. - aaaH( aUv0 + vl * ( sm / aTile ), aDx, aDy ) ); if ( fm >= 0. ) { a1 = sm; f = fm; } else { a0 = sm; fp = fm; } }
        sh = mix( a0, a1, clamp( fp / ( fp - f ), 0., 1. ) ); hit = true; break;   // secant on the final bracket
      }
      if ( d < -.03 * aDepth ) { aOut = true; break; }                    // the ray left the curved shell: silhouette
      sp = s; fp = f;
    }
    if ( !hit && kc * lat2 > 1e-4 ) aOut = true;
    aS = sh; aUv = aUv0 + vl * ( aS / aTile );
  }
  #endif
  vec3 aPh = aP + aV * aS;
  #if AAA_SIL == 1
  if ( aOut && aCard < .5 ) discard;
  #endif
  #if AAA_BOUND == 1
  { float rr = length( aPh.xz - aBound.xy ); if ( ( rr < aBound.z || rr > aBound.w ) && aCard < .5 ) discard; }
  #elif AAA_BOUND == 2
  if ( ( any( lessThan( aPh.xz, aBound.xy ) ) || any( greaterThan( aPh.xz, aBound.zw ) ) ) && aCard < .5 ) discard;
  #endif
  // ---- channels at the hit point ----
  vec4 aT = textureGrad( aTex, aUv, aDx, aDy ); float aHt = aT.r;
  float aEps = max( 1. / AAA_TEX, aFoot );
  vec2 aGr = vec2( aaaH( aUv + vec2(aEps, 0.), aDx, aDy ) - aaaH( aUv - vec2(aEps, 0.), aDx, aDy ), aaaH( aUv + vec2(0., aEps), aDx, aDy ) - aaaH( aUv - vec2(0., aEps), aDx, aDy ) ) / ( 2. * aEps );
  vec3 aGw = ( aE1 * aGr.x + aE2 * aGr.y ) * ( aDepthU * aBump / aTile );
  // micro layer: the same relief at 3.7× frequency, rotated 37°, a third of the amplitude (breaks the tile, adds grain)
  { const mat2 R = mat2( .7986, .6018, -.6018, .7986 ); vec2 um = R * aUv * 3.7 + .31; vec2 mdx = R * aDx * 3.7, mdy = R * aDy * 3.7; float me = max( 1. / AAA_TEX, aFoot * 3.7 );
    float mh = aaaH( um, mdx, mdy ); vec2 mg = vec2( aaaH( um + vec2(me, 0.), mdx, mdy ) - mh, aaaH( um + vec2(0., me), mdx, mdy ) - mh ) / me;
    mg = ( transpose( R ) * mg ) * 3.7 * ( 1. - smoothstep( 3., 6., aMip + 1.9 ) );
    aGw += ( aE1 * mg.x + aE2 * mg.y ) * ( aDepthU * aBump * .33 / aTile ); }
  #if AAA_PROJ == 1
  { // the other two projections, sampled at the displaced point (keeps the triplanar blend continuous)
    vec3 gsum = aGw * aW3[aAx];
    for ( int ax = 0; ax < 3; ax++ ) { if ( ax == aAx || aW3[ax] < .02 ) continue; vec3 ee1 = ax==0 ? vec3(0,0,1) : vec3(1,0,0), ee2 = ax==1 ? vec3(0,0,1) : vec3(0,1,0);
      vec2 qdx = vec2( dot(aPdx, ee1), dot(aPdx, ee2) ) / aTile, qdy = vec2( dot(aPdy, ee1), dot(aPdy, ee2) ) / aTile;
      vec4 q = aaaProj( ax, aPh, max( 1. / AAA_TEX, max( length(qdx), length(qdy) ) ), qdx, qdy ); gsum += q.xyz * aW3[ax]; aHt = mix( aHt, q.w, aW3[ax] ); }
    aGw = gsum; }
  #endif
  vec3 aN = normalize( aNg - ( aGw - aNg * dot( aNg, aGw ) ) );
  // ---- albedo, roughness, metalness by kind (linear values) ----
  float aMacro = aaaSimplex3( aPh * .21 ) * .5 + .5, aMacro2 = aaaSimplex3( aPh * 1.3 + 7. ) * .5 + .5;
  float aYt = clamp( ( aPh.y - aYRange.x ) / max( aYRange.y - aYRange.x, 1e-3 ), 0., 1. );
  vec3 aAlb; float aRough, aMet = 0., aPor = aP0.x, aGlintK = aP1.w, aWetResp = aP0.z, aShoreWet = 0.;
  float aFleck = step( 1. - aP1.z, aaaHash( floor( aUv * AAA_TEX * 1.5 ), 77. ) );
  #if AAA_KIND == 0
    aAlb = mix( aCol0, aCol1, aT.g ) * mix( .82, 1.15, aMacro ); aAlb = mix( aAlb, aCol2, aT.b * .5 ); aRough = mix( .62, .94, aT.a );
  #elif AAA_KIND == 1
    { float stone = smoothstep( .1, .22, aHt ); vec3 st = mix( aCol0, aCol1, aT.b ) * ( .78 + .44 * aT.g ) * mix( .9, 1.1, aMacro2 );
      aAlb = mix( aCol2 * ( .8 + .4 * aT.g ), st, stone ); aRough = mix( .95, mix( .5, .78, aT.a ), stone ); aMet = aFleck * stone; aPor = mix( .8, aP0.x, stone ); }
  #elif AAA_KIND == 2
    { vec3 base = mix( aCol0, aCol1, aYt ) * ( .7 + .55 * aT.g ) * mix( .85, 1.12, aMacro );
      float moss = smoothstep( .62, .9, aNg.y ) * smoothstep( .45, .7, aMacro2 + aT.a * .3 ) * aP1.y;
      aAlb = mix( base, aCol2, moss ) * ( 1. - .55 * aT.b ); aRough = mix( mix( .68, .92, aT.a ), .9, moss ); aMet = aFleck * ( 1. - moss ) * .8; }
  #elif AAA_KIND == 3
    { float flat_ = smoothstep( .72, .93, aNg.y ); float grass = clamp( aT.b * flat_ * aP1.y + flat_ * aP1.y * .25, 0., 1. );
      vec3 soil = aCol2 * ( .75 + .5 * aT.g ) * mix( .85, 1.1, aMacro ); vec3 gr = mix( aCol0, aCol1, aYt ) * ( .7 + .55 * aT.g ) * mix( .8, 1.15, aMacro2 );
      aAlb = mix( soil, gr, grass ); aRough = mix( mix( .82, .97, aT.a ), .78, grass );
      float shore = aShore.z > 0. ? 1. - smoothstep( aShore.x, aShore.x + aShore.y, aPh.y ) : 0.;   // mud band along the water line
      aAlb = mix( aAlb, vec3( .045, .036, .027 ) * ( .8 + .4 * aT.g ), shore ); aPor = mix( aPor, .9, shore ); aRough = mix( aRough, .6, shore );
      aShoreWet = aShore.z > 0. ? 1. - smoothstep( aShore.x, aShore.x + aShore.y * .6, aPh.y ) : 0.; }
  #elif AAA_KIND == 4
    aAlb = aCol0 * mix( .92, 1.04, aT.g ) * ( 1. - aT.b * .55 ); aAlb = mix( aCol2, aAlb, smoothstep( .05, .3, aHt ) ); aRough = mix( .05, .14, aT.a ) + ( 1. - smoothstep( .05, .3, aHt ) ) * .7;
  #elif AAA_KIND == 5
    aAlb = mix( aCol0, aCol1, aT.g ) * mix( .9, 1.08, aMacro ); aAlb = mix( aAlb, aCol2, aT.b ); aRough = mix( .8, .95, aT.a ); aMet = aFleck * .7;
  #else
    { float lich = aT.b * smoothstep( .1, .6, aNg.y + .4 ) * aP1.y; aAlb = mix( aCol0 * ( .55 + .7 * aHt ), aCol2 * ( .8 + .3 * aT.g ), lich ) * mix( .85, 1.12, aMacro2 ); aRough = mix( .82, 1., aT.a ); }
  #endif
SCAN_HOOK
  if ( aP1.x > 0. ) { float sn = smoothstep( aP1.x, aP1.x + .12, aPh.y + aT.g * .1 ) * smoothstep( .45, .75, aNg.y ); aAlb = mix( aAlb, vec3( .82, .84, .88 ), sn ); aRough = mix( aRough, .6, sn ); aPor *= 1. - sn; }
  // ---- ambient occlusion from the relief: cavity (height below its blurred neighbourhood) and depth in the layer ----
  float aHb = textureLod( aTex, aUv, max( aMip, 0. ) + 3. ).r;
  float aAO = clamp( 1. - max( aHb - aHt, 0. ) * aP0.w * 3.5, .2, 1. ) * mix( 1. - .45 * aP0.w, 1., aHt );
  // ---- wetness (Lagarde 2013): capillary darkening, smoother microsurface, puddles in cavities, water film ----
  float aWetG = uAaaWet * aWetResp;
  if ( uAaaWetSpot.w > 0. ) aWetG = max( aWetG, uAaaWetSpot.w * aWetResp * ( 1. - smoothstep( uAaaWetSpot.z * .5, uAaaWetSpot.z, length( aPh.xz - uAaaWetSpot.xy ) ) ) );
  aWetG = max( aWetG, aShoreWet );
  float aUp = smoothstep( .05, .85, aN.y );
  float aW = aWetG * mix( .3, 1., aUp ) * ( 1. - aCard );
  float aPud = aW * smoothstep( aP0.y * aW + .03, aP0.y * aW - .04, aHt ) * smoothstep( .55, .88, aNg.y );
  float aDamp = aW * ( 1. - aPud );
  aAlb *= mix( 1., .32, aPor * aDamp ); aAlb *= mix( 1., .6, aPud );
  aRough = mix( aRough, max( .1, aRough * .4 ), aDamp ); aRough = mix( aRough, .05, aPud );
  aN = normalize( mix( aN, aNg, aPud * .8 ) );
  float aFilm = max( aDamp * .45, aPud ), aFilmR = mix( .2, .03, aPud ); vec3 aFilmN = aN;
  if ( aPud > .01 ) { vec2 rg = uAaaRain > .01 ? aaaRipples( aPh.xz, uAaaTime ) * uAaaRain : vec2( 0. ); aFilmN = normalize( mix( aN, aNg, aPud ) + vec3( rg.x, 0., rg.y ) * aPud ); }
  float aGlint = aGlintK * aDamp * ( 1. - aPud ) * smoothstep( .4, .9, aN.y );
  float aSpecOcc = clamp( pow( max( dot( aN, -aV ), 0. ) + aAO, exp2( -16. * aRough - 1. ) ) - 1. + aAO, 0., 1. );
  diffuseColor.rgb = aAlb * diffuse;
`;
// lights_fragment_end additions: specular clamp (like materials.js), self-shadow, dew glints, AO on the ambient
const FRAG_LIGHT_END = /* glsl */`
  reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( 3.0 ) );
  #ifdef USE_CLEARCOAT
  clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( 3.0 ) );
  #endif
  { vec3 aLw = vec3( 0., 1., 0. ), aLc = vec3( 0. ); bool aHasL = false;
    #if NUM_DIR_LIGHTS > 0
    aLw = normalize( ( vec4( directionalLights[ 0 ].direction, 0. ) * viewMatrix ).xyz ); aLc = directionalLights[ 0 ].color; aHasL = true;
    #elif NUM_SPOT_LIGHTS > 0
    { vec3 lv = spotLights[ 0 ].position - geometryPosition; float ld = length( lv ); aLw = normalize( ( vec4( lv / ld, 0. ) * viewMatrix ).xyz ); aLc = spotLights[ 0 ].color * getDistanceAttenuation( ld, spotLights[ 0 ].distance, spotLights[ 0 ].decay ); aHasL = true; }
    #endif
    #ifdef AAA_SELFSH
    if ( aHasL && aDepth > 1e-5 ) { vec2 ll = vec2( dot( aLw, aE1 ), dot( aLw, aE2 ) ); float rise = dot( aLw, aA ) - dot( aG, ll );
      if ( rise > 1e-3 ) { float d0 = aDepth * ( 1. - aHt ); float sEnd = min( d0 / rise, aDepth * 10. ); float occ = 0.;
        for ( int i = 1; i <= 6; i++ ) { float s = sEnd * float( i ) / 6.; float dr = d0 - rise * s; float dsf = aDepth * ( 1. - aaaH( aUv + ll * ( s / aTile ), aDx, aDy ) ); occ = max( occ, ( dr - dsf ) / aDepth * ( 1. - float( i ) / 7. ) ); }
        float ss = 1. - clamp( occ * 7., 0., 1. ) * .8; reflectedLight.directDiffuse *= ss; reflectedLight.directSpecular *= ss; } }
    #endif
    #ifdef AAA_GLINTS
    if ( aHasL && aGlint > .002 ) { vec2 gp = vec2( dot( aPh, aE1 ), dot( aPh, aE2 ) ) * 160.; vec2 gc = floor( gp ); float hs = aaaHash( gc, 91. );
      float fade = 1. - smoothstep( .6, 2.5, aFoot * aTile * 160. );
      if ( hs > 1. - aGlint * .12 && fade > 0. ) { vec3 mn = normalize( aN + ( vec3( aaaHash2( gc, 92. ), aaaHash( gc, 93. ) ) - .5 ) * .7 ); vec3 hv = normalize( aLw - aV );
        float sp = pow( max( dot( mn, hv ), 0. ), 700. ) * max( dot( aN, aLw ), 0. ) * fade; reflectedLight.directSpecular += aLc * sp * 5.; } }
    #endif
  }
  reflectedLight.indirectDiffuse *= aAO; reflectedLight.indirectSpecular *= aSpecOcc;
`;
function patchShader(s, m) {
  const A = m.userData.aaa, card = !!m.userData.frontPatched;
  Object.assign(s.uniforms, AAA.uniforms, A.U);
  s.vertexShader = VERT_DECL + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
  let f = s.fragmentShader;
  f = f.replace('void main() {', FRAG_DECL + '\nvoid main() {');
  f = f.replace('#include <map_fragment>', FRAG_MAIN.replace('AAA_CARD', card ? '( ( 1.0 - step( frontD( vFrontW ), uFrontR ) ) * uCardMix )' : '0.0').replace('SCAN_HOOK', SCAN_GLSL.replace('AAA_SCANMASK', SCAN_MASK[A.kind] || '1.')));
  f = f.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = aRough;');
  f = f.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = aMet;');
  f = f.replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( aN, 0. ) ).xyz ); normal = normalize( mix( normal, nonPerturbedNormal, aCard ) );');
  f = f.replace('#include <clearcoat_normal_fragment_maps>', '#ifdef USE_CLEARCOAT\n clearcoatNormal = normalize( ( viewMatrix * vec4( aFilmN, 0. ) ).xyz );\n#endif');
  f = f.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n material.clearcoat = aFilm * ( 1. - aCard ); material.clearcoatRoughness = clamp( aFilmR, .0525, 1. );\n#endif');
  f = f.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_LIGHT_END);
  f = f.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef AAA_PDO\n { vec4 ac = projectionMatrix * ( viewMatrix * vec4( aPh, 1. ) ); gl_FragDepth = clamp( .5 * ac.z / ac.w + .5, 0., 1. ); }\n#endif');
  s.fragmentShader = f;
}

// ---------------------------------------------------------------- kinds -----------------------------------------
// Linear albedo (not sRGB): measured ranges — wet/dark soil 0.03–0.08, dry soil 0.1–0.2, grass 0.08–0.15 (green),
// granite/basalt setts 0.1–0.3, limestone crag 0.25–0.4, quartz sand 0.3–0.45, polished white marble 0.7–0.85,
// bark 0.05–0.15. Roughness: dry soil 0.85–1, polished marble 0.05–0.15. Porosity sets how much water darkens it.
const L = (r, g, b) => new THREE.Color(r, g, b);
const KINDS = {
  mud: { tile: 1.7, depth: .045, bump: 1.4, sil: 1, por: .9, pud: .55, wet: 1, ao: .9, moss: 0, fleck: 0, glint: .4, c0: L(.075, .056, .04), c1: L(.13, .1, .07), c2: L(.12, .07, .04) },
  cobble: { tile: 1.5, depth: .05, bump: 1.6, sil: 1, por: .3, pud: .3, wet: 1, ao: 1, moss: 0, fleck: .0015, glint: .6, c0: L(.13, .13, .14), c1: L(.2, .17, .14), c2: L(.05, .045, .04) },
  crag: { tile: 2.2, depth: .09, bump: 1.8, sil: 1, por: .2, pud: .25, wet: .9, ao: 1, moss: .75, fleck: .0008, glint: .35, c0: L(.12, .11, .1), c1: L(.26, .24, .21), c2: L(.07, .085, .04) },
  meadow: { tile: 1.6, depth: .035, bump: 1.3, sil: 1, por: .7, pud: .45, wet: 1, ao: .9, moss: 1, fleck: 0, glint: 1, c0: L(.06, .1, .03), c1: L(.11, .13, .05), c2: L(.075, .055, .04) },
  marble: { tile: 1.8, depth: .006, bump: 1, sil: 0, por: 0, pud: .15, wet: .6, ao: .6, moss: 0, fleck: 0, glint: 0, c0: L(.78, .76, .72), c1: L(.7, .68, .64), c2: L(.25, .23, .2) },
  sand: { tile: 1.4, depth: .025, bump: 1.2, sil: 1, por: .55, pud: .35, wet: 1, ao: .7, moss: 0, fleck: .004, glint: .8, c0: L(.42, .34, .23), c1: L(.5, .42, .3), c2: L(.6, .56, .5) },
  bark: { tile: .55, depth: .018, bump: 1.6, sil: 1, por: .5, pud: 0, wet: .7, ao: 1, moss: .8, fleck: 0, glint: 0, c0: L(.11, .08, .055), c1: L(.11, .08, .055), c2: L(.2, .22, .15), proj: 1 }
};
export const KIND_NAMES = Object.keys(KINDS);
const PROJ = { crag: 1, bark: 1 };

function defsFor(kind, o) {
  const Q = AAA.Q, d = { AAA: '', AAA_KIND: KIND_ID[kind], AAA_PROJ: (o.proj ?? PROJ[kind] ?? 0), AAA_MAXSTEPS: Q.pom, AAA_REFINE: Q.refine, AAA_TEX: (Q.bake).toFixed(1), AAA_SIL: (o.silhouette ?? KINDS[kind].sil) && Q.pom > 0 ? 1 : 0, AAA_BOUND: o.bound ? (o.bound.type === 'rect' ? 2 : 1) : 0 };
  if (Q.pdo && o.pdo !== false && !d.AAA_PROJ) d.AAA_PDO = '';
  if (Q.selfShadow) d.AAA_SELFSH = '';
  if (Q.glints) d.AAA_GLINTS = '';
  if (SCAN_OF[kind] && Q.pom > 0 && o.scan !== false) d.AAA_SCAN = '';
  return d;
}
// Material factory. o: { color (palette base, sRGB hex), color2, color3, tile, depth, bump, bound: {type:'ring', x, z, rIn, rOut}
// | {type:'rect', minX, minZ, maxX, maxZ}, yRange: [y0, y1] (height band for low→high colours), snowY, shoreY, shoreBand,
// moss (0..1 grass/moss/lichen cover), side, silhouette (false to keep straight edges), pdo (false), proj (0 planar Y / 1 triplanar) }
export function aaaMaterial(kind = 'mud', o = {}) {
  if (!KINDS[kind]) kind = 'mud';
  const K = KINDS[kind], c = x => x == null ? null : new THREE.Color(x);
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: o.env ?? 1, side: o.side ?? THREE.FrontSide });
  const b = o.bound || null;
  const U = {
    aTex: { value: bakeTex(kind) }, aTile: { value: o.tile ?? K.tile }, aDepthU: { value: o.depth ?? K.depth }, aBump: { value: o.bump ?? K.bump }, aSilK: { value: 1 },
    aCol0: { value: o.color2 || !o.color ? (c(o.color) || K.c0.clone()) : c(o.color).multiplyScalar(.85) }, aCol1: { value: c(o.color2) || (o.color ? c(o.color).multiplyScalar(1.12) : K.c1.clone()) }, aCol2: { value: c(o.color3) || K.c2.clone() },
    aP0: { value: new THREE.Vector4(K.por, K.pud, o.wet ?? K.wet, K.ao) }, aP1: { value: new THREE.Vector4(o.snowY ?? 0, o.moss ?? K.moss, K.fleck, K.glint) },
    aBound: { value: b ? (b.type === 'rect' ? new THREE.Vector4(b.minX, b.minZ, b.maxX, b.maxZ) : new THREE.Vector4(b.x || 0, b.z || 0, b.rIn || 0, b.rOut || 1e4)) : new THREE.Vector4() },
    aYRange: { value: new THREE.Vector2(...(o.yRange || [0, 1])) }, aShore: { value: new THREE.Vector3(o.shoreY ?? 0, o.shoreBand ?? .1, o.shoreY != null ? 1 : 0) }
  };
  if (SCAN_OF[kind]) { loadScans(); const S = SCAN[SCAN_OF[kind][0]]; Object.assign(U, { aScanA: S.A, aScanN: S.N, aScanK: o.scan === false ? { value: 0 } : S.K, aScanTile: { value: o.scanTile ?? SCAN_OF[kind][1] } }); }
  // the author's colours are sRGB like every other colour in the scene spec; Color() converts to linear
  m.userData.aaa = {
    kind, U, opts: o,
    set(p = {}) { if (p.wet != null) U.aP0.value.z = p.wet; if (p.shoreY != null) { U.aShore.value.set(p.shoreY, p.shoreBand ?? U.aShore.value.y, 1); } if (p.depth != null) U.aDepthU.value = p.depth; if (p.moss != null) U.aP1.value.y = p.moss; return m; }
  };
  m.userData.preset = 'aaa-' + kind;
  m.defines = Object.assign({}, m.defines, defsFor(kind, o));
  m.onBeforeCompile = (s) => patchShader(s, m);
  m.customProgramCacheKey = () => 'aaa';                     // the defines (kind, projection, quality) keep keys distinct
  AAA.mats.add(m); m.addEventListener('dispose', () => AAA.mats.delete(m));
  return m;
}
// named factories (the brief's material set)
export const mud = o => aaaMaterial('mud', o), wetCobble = o => aaaMaterial('cobble', Object.assign({ wet: 1 }, o)), craggyRock = o => aaaMaterial('crag', o),
  meadowSoil = o => aaaMaterial('meadow', o), marbleFloor = o => aaaMaterial('marble', o), sand = o => aaaMaterial('sand', o), bark = o => aaaMaterial('bark', o);

// ---------------------------------------------------------------- quality switch --------------------------------
export function setQuality(q) {
  if (!QUALITY[q]) return AAA.quality;
  const was = AAA.quality; AAA.quality = q; const Q = QUALITY[q];
  AAA.uniforms.uAaaPomSteps.value.set(Q.pom, Q.pomMin); AAA.uniforms.uAaaPomOn.value = Q.pom > 0 ? 1 : 0;
  if (was !== q) AAA.mats.forEach(m => { const A = m.userData.aaa; const d = defsFor(A.kind, A.opts); Object.keys(m.defines).forEach(k => { if (k.startsWith('AAA') && k !== 'AAA_CASCADES') delete m.defines[k];   /* AAA_CASCADES belongs to materialize.js's patch */ }); Object.assign(m.defines, d); A.U.aTex.value = bakeTex(A.kind); m.needsUpdate = true; });
  return q;
}
// per-frame globals (time for ripples)
export function aaaFrame(t) { AAA.uniforms.uAaaTime.value = t; }
export function resetWeather() { const u = AAA.uniforms; u.uAaaWet.value = 0; u.uAaaRain.value = 0; u.uAaaWetSpot.value.set(0, 0, 1, 0); }

// ---------------------------------------------------------------- atmosphere pass -------------------------------
// Volumetric light scattering in screen space, applied to the linear HDR image before bloom and tone mapping:
//  • exponential height fog: optical depth τ = σ₀·d·e^(−(y_c−y₀)/H)·(1−e^(−k))/k with k = Δy/H (closed form of
//    ∫σ₀e^(−(y(s)−y₀)/H) ds along the view ray), transmittance T = e^(−τ); in-scattered radiance
//    L_s = E_sun·[w_R·P_R(μ) + (1−w_R)·P_HG(μ, g)] + L_amb (single scattering, albedo 1), so L = L₀T + L_s(1−T).
//  • god rays: a radial march from each pixel toward the sun's screen position; each sample is 1 where the depth
//    buffer shows open sky (the Sky dome writes no depth), weighted by the sun's angular glow and an exponential decay;
//    the fraction of sky seen along the line scales the Mie in-scatter of the sun.
// medium: one pass, rays marched inline (24 samples); high: a half-resolution ray pass (48 samples) + the composite.
import { Pass } from 'three/addons/postprocessing/Pass.js';
const ATMOS_COMMON = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D tDepth; uniform mat4 uProjInv, uCamWorld; uniform vec3 uCamPos, uSunDir; uniform vec2 uSunUv, uRes; uniform float uSunVis, uDecay, uTime;
varying vec2 vUv;
float hg(float mu, float g){ float g2 = g*g; return (1. - g2) / (4.*PI*pow(max(1. + g2 - 2.*g*mu, 1e-4), 1.5)); }
vec3 viewRay(vec2 uv){ vec4 p = uProjInv * vec4(uv*2. - 1., 1., 1.); return normalize(p.xyz/p.w); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)) + uTime*.61803)); }
float godRays(vec2 uv){
  vec2 d = uSunUv - uv; float len = length(d); vec2 st = d * min(1., .9 / max(len, 1e-4)) / float(GOD_N);
  vec2 p = uv + st * ign(gl_FragCoord.xy); float w = 1., acc = 0., norm = 0.;
  for(int i = 0; i < GOD_N; i++){ float dd = texture2D(tDepth, p).r; float sky = step(.99999, dd) * step(0., p.x) * step(p.x, 1.) * step(0., p.y) * step(p.y, 1.);
    vec3 rw = mat3(uCamWorld) * viewRay(p); float glow = pow(max(dot(rw, uSunDir), 0.), 64.);
    acc += sky * glow * w; norm += w; w *= uDecay; p += st; }
  return acc / max(norm, 1e-4); }
`;
const ATMOS_VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export class AtmospherePass extends Pass {
  constructor() {
    super(); this.needsSwap = true; this.split = false; this.samples = 24;
    const base = () => ({ tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunUv: { value: new THREE.Vector2(.5, .5) }, uRes: { value: new THREE.Vector2(1, 1) }, uSunVis: { value: 0 }, uDecay: { value: .965 }, uTime: { value: 0 } });
    this.godRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.godMat = new THREE.ShaderMaterial({ uniforms: base(), defines: { GOD_N: 48 }, vertexShader: ATMOS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: ATMOS_COMMON + 'void main(){ gl_FragColor = vec4(godRays(vUv), 0., 0., 1.); }' });
    const U = Object.assign(base(), { tDiffuse: { value: null }, tGod: { value: null }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uDens: { value: .01 }, uHgt: { value: 2 }, uBase: { value: 0 }, uG: { value: .76 }, uRay: { value: .25 }, uMaxD: { value: 150 }, uSkyFog: { value: .3 }, uGodK: { value: .4 }, uStrength: { value: 1 } });
    this.mat = new THREE.ShaderMaterial({ uniforms: U, defines: { GOD_N: 24, GOD_MODE: 1 }, vertexShader: ATMOS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: ATMOS_COMMON + /* glsl */`
      uniform sampler2D tDiffuse, tGod; uniform vec3 uSunCol, uAmb; uniform float uDens, uHgt, uBase, uG, uRay, uMaxD, uSkyFog, uGodK, uStrength;
      void main(){
        vec4 col = texture2D(tDiffuse, vUv); float dz = texture2D(tDepth, vUv).r; bool sky = dz >= .99999;
        vec3 rv = viewRay(vUv); vec3 rd = normalize(mat3(uCamWorld) * rv);
        float dist; if (sky) dist = uMaxD * uSkyFog; else { vec4 vp = uProjInv * vec4(vUv*2. - 1., dz*2. - 1., 1.); dist = min(length(vp.xyz/vp.w), uMaxD); }
        float yc = uCamPos.y - uBase, k = rd.y * dist / uHgt;
        float fk = abs(k) > 1e-3 ? (1. - exp(-k)) / k : 1. - .5*k;
        float tau = uDens * dist * exp(-clamp(yc / uHgt, -8., 40.)) * fk;      // exponential height fog, closed-form integral
        float T = exp(-tau), mu = dot(rd, uSunDir);
        float phase = uRay * (3. / (16.*PI)) * (1. + mu*mu) + (1. - uRay) * hg(mu, uG);   // Rayleigh + Henyey–Greenstein (Mie)
        vec3 Ls = uSunCol * phase * uSunVis + uAmb;
        vec3 c = col.rgb * T + Ls * (1. - T);
        #if GOD_MODE == 1
        float gr = godRays(vUv);
        #elif GOD_MODE == 2
        float gr = texture2D(tGod, vUv).r;
        #else
        float gr = 0.;
        #endif
        c += uSunCol * hg(mu, uG) * gr * uGodK * uSunVis * .2;           // shafts: Mie in-scatter of the sun over an effective optical depth 0.2·weight
        gl_FragColor = vec4(mix(col.rgb, c, uStrength), col.a);
      }` });
    this.quad = new FullScreenQuad(this.mat); this.k = 0;
  }
  configure(Q) {
    this.samples = Q.god; this.split = Q.passes >= 2 && Q.god > 0;
    const d = this.mat.defines, mode = Q.god <= 0 ? 0 : this.split ? 2 : 1, n = Math.max(1, Math.min(Q.god, 32));
    if (d.GOD_MODE !== mode || d.GOD_N !== n) { d.GOD_MODE = mode; d.GOD_N = n; this.mat.needsUpdate = true; }
    if (this.godMat.defines.GOD_N !== Math.max(1, Q.god)) { this.godMat.defines.GOD_N = Math.max(1, Q.god); this.godMat.needsUpdate = true; }
  }
  setSize(w, h) { this.godRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); this.mat.uniforms.uRes.value.set(w, h); this.godMat.uniforms.uRes.value.set(w >> 1, h >> 1); }
  // A: scene.userData.aaaAtmos = { sunDir, sunColor (Color × intensity), amb (Color), density, height, base, g, rayleigh, maxDist, skyFog, god }
  update(camera, A, k, t) {
    const sets = [this.mat.uniforms, this.godMat.uniforms];
    camera.updateMatrixWorld();
    sets.forEach(u => { u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld); u.uSunDir.value.copy(A.sunDir).normalize(); u.uTime.value = t % 100; });
    const sp = _v.copy(camera.position).addScaledVector(this.mat.uniforms.uSunDir.value, 1e4).project(camera), front = _v2.copy(this.mat.uniforms.uSunDir.value).dot(camera.getWorldDirection(_v3));
    const vis = front > .05 ? Math.min(1, front * 3) * (1 - Math.min(1, Math.max(0, Math.hypot(sp.x, sp.y) - 1.2) / 1.5)) : 0;
    sets.forEach(u => { u.uSunUv.value.set(sp.x * .5 + .5, sp.y * .5 + .5); u.uSunVis.value = vis; });
    const u = this.mat.uniforms; u.uSunVis.value = 1; // fog in-scatter uses the sun even when it is off screen; god rays are scaled below
    u.uSunCol.value.copy(A.sunColor); u.uAmb.value.copy(A.amb || _black); u.uDens.value = A.density ?? .01; u.uHgt.value = A.height ?? 2; u.uBase.value = A.base ?? 0; u.uG.value = A.g ?? .76; u.uRay.value = A.rayleigh ?? .25;
    u.uMaxD.value = A.maxDist ?? 150; u.uSkyFog.value = A.skyFog ?? .3; u.uGodK.value = (A.god ?? .4) * vis; u.uStrength.value = k;
  }
  render(renderer, writeBuffer, readBuffer) {
    const dt = readBuffer.depthTexture; this.mat.uniforms.tDiffuse.value = readBuffer.texture; this.mat.uniforms.tDepth.value = dt; this.godMat.uniforms.tDepth.value = dt;
    if (this.split && this.mat.uniforms.uGodK.value > 0) { this.quad.material = this.godMat; renderer.setRenderTarget(this.godRT); this.quad.render(renderer); this.mat.uniforms.tGod.value = this.godRT.texture; }
    else this.mat.uniforms.tGod.value = null;
    this.quad.material = this.mat; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  // compile both programs up front (no hitch the first time an outdoor diorama opens)
  warm(renderer) { const cam = new THREE.OrthographicCamera(); [this.mat, this.godMat].forEach(m => { this.quad.material = m; renderer.compile(this.quad._mesh, cam); }); this.quad.material = this.mat; }
  dispose() { this.godRT.dispose(); this.mat.dispose(); this.godMat.dispose(); this.quad.dispose(); }
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _black = new THREE.Color(0, 0, 0);
