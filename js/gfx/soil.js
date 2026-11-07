// Soil cross-section (realism-playbook R7, after Weatherglass's section shader): the four cut faces of a terrain
// block, from the surface down to a flat bottom, painted from the top as turf rim (blade streaks, overhang shadow),
// humus, loam (iron mottles, burrows, embedded stones), a laminated clay band, gravel (two scales of domed stones in
// grit) and bedrock beds of uneven thickness that thicken and tilt under the mountains, with sparse joints and roots
// hanging below the turf. Layer boundaries follow the surface (thick soil under meadows, rock near the surface under
// peaks); rain soaks down from the top (AAA wetness); normals come from a screen-derivative bump of the painted
// height, so no UVs or tangents are needed. It is a MeshStandardMaterial extension: three's lights, shadows, fog and
// the materialize card stage work unchanged. Plus a walnut plinth under the block.
import * as THREE from 'three';
import { NOISE_GLSL, AAA } from './aaa.js';
import { makeMaterial } from './materials.js';

const SOIL_FRAG = /* glsl */`
varying vec3 vSoilW; varying float vSoilS; varying float vSoilU;
uniform float uAaaWet; uniform vec4 uAaaWetSpot; uniform vec3 uSoilGrass; uniform float uLakeLevel;
${NOISE_GLSL}
float sN(vec2 p){ return aaaSimplex2(p)*.5+.5; }
vec3 sCell(vec2 p){ vec2 n=floor(p), f=fract(p); float md=8.; vec2 mi=vec2(0.); for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), o=aaaHash2(n+g,5.); vec2 r=g+o-f; float d=dot(r,r); if(d<md){ md=d; mi=n+g; } } return vec3(sqrt(md), aaaHash(mi,7.), 0.); }
vec3 sPebble(float id, float n){ vec3 a=mix(vec3(.30,.27,.23),vec3(.45,.40,.33),fract(id*3.7)); a=mix(a,vec3(.22,.18,.15),step(.7,fract(id*9.1))); return a*(.8+.4*n); }
`;
const SOIL_MAIN = /* glsl */`
  float sS = vSoilS, sY = vSoilW.y, sU = vSoilU, sD = sS - sY; vec2 q = vec2(sU, sY);
  float w1=sN(vec2(sU*2.3,1.3))-.5, w2=sN(vec2(sU*1.2,7.9))-.5, w3=sN(vec2(sU*.6,3.3))-.5, w4=sN(vec2(sU*6.,9.1))-.5;
  float m = smoothstep(.55, 1.3, sS);                       // mountain column: thin soil, rock near the top
  float rimB = .035 + .012*sN(vec2(sU*34.,.5));
  float topB = mix(.2, .07, m) + w1*.05 + w4*.012;
  float yTop = sS - topB, yRock = mix(SOIL_BOTTOM + .55 + w3*.2, sS - .12 - abs(w1)*.1, m);
  float yLoam = min(max(yTop - .16 - w2*.06, yRock), yTop - .02);
  float yClay = min(max(yLoam - (.12 + w1*.05 + w3*.04), yRock), yLoam);
  float yGrav = min(max(yClay - (.13 + w3*.06), yRock), yClay);
  float inRim = smoothstep(sS - rimB - .004, sS - rimB + .004, sY);
  float inTop = smoothstep(yTop - .03, yTop + .02, sY + (sN(q*24.)-.5)*.03);
  float inLoam = smoothstep(yLoam - .01, yLoam + .01, sY + w4*.012), inClay = smoothstep(yClay - .004, yClay + .004, sY), inGrav = smoothstep(yGrav - .004, yGrav + .008, sY + w4*.02);
  // bedrock: sandstone/shale beds tilting under the mountains, laminations, joints
  float sc = sY + sU*mix(.04,.35,m) + w2*.12 + (sN(q*vec2(1.5,3.))-.5)*.05; float sb = sc*9. + sin(sc*21.+w3*3.)*.45; float sid = floor(sb), sfr = fract(sb), sh = aaaHash(vec2(sid,1.),3.);
  vec3 col = mix(mix(vec3(.25,.155,.095),vec3(.38,.26,.16),sh), mix(vec3(.17,.165,.16),vec3(.3,.285,.265),sh), smoothstep(.25,.85,m + (sY - sS + 1.)*.25));
  col = mix(col, vec3(.15,.11,.09), step(.82,sh)*.8);
  float bedE = smoothstep(0.,.08,sfr)*smoothstep(1.,.9,sfr); col *= (.86+.14*bedE)*(.85+.25*sN(q*14.))*(.92+.08*sin(sb*18.85));
  float joint = (1.-smoothstep(0.,.012,abs(sN(vec2(sU*1.6+sY*.9,sid*1.7))-.5)))*step(.6,aaaHash(vec2(sid,9.),4.))*bedE; col *= 1.-joint*.5;
  float sH = bedE*.006 - joint*.006 + sN(q*30.)*.004;
  // gravel
  { vec3 gc = sCell(q*vec2(16.,20.)); float gr=.3+.2*gc.y, gIn=1.-smoothstep(gr-.06,gr,gc.x); vec3 grit=vec3(.14,.11,.08)*(.75+.4*sN(q*90.));
    vec3 gv = mix(grit, sPebble(gc.y, sN(q*70.)), gIn); col = mix(col, gv, inGrav); sH = mix(sH, gIn*sqrt(max(0.,1.-gc.x*gc.x/(gr*gr)))*.012, inGrav); }
  // clay
  { vec3 clay = mix(vec3(.36,.17,.07),vec3(.45,.25,.12),sN(q*vec2(3.,20.))); clay *= .92+.08*sin(sY*260.+w4*24.); col = mix(col, clay, inClay); sH = mix(sH, (sN(q*30.)-.5)*.002, inClay); }
  // loam: mottles, burrows, stones
  { float mott = sN(q*vec2(2.2,6.)+3.); vec3 loam = mix(vec3(.11,.07,.042),vec3(.19,.12,.07), sN(q*9.)*.6+mott*.4); loam = mix(loam, vec3(.21,.12,.06), smoothstep(.62,.8,mott)*.5);
    loam *= .88+.24*sN(q*vec2(20.,90.)); float bur = smoothstep(.86,.9,sN(q*vec2(16.,13.)+9.))*step(.5,sN(q*3.+1.)); loam = mix(loam, vec3(.05,.035,.025), bur*.7);
    vec3 ec = sCell(q*9.+17.); float er=.12+.3*ec.y, eIn=(1.-smoothstep(er-.04,er,ec.x))*step(fract(ec.y*3.1),.14); loam = mix(loam, sPebble(ec.y, sN(q*70.))*.6, eIn);
    col = mix(col, loam, inLoam); sH = mix(sH, eIn*.02 + (sN(q*45.)-.5)*.003 - bur*.004, inLoam); }
  // large stones: rounded boulders embedded in the loam, clay and gravel (domed, shaded, with a dark contact rim)
  { vec3 bc = sCell(q*vec2(2.6, 3.4) + 5.); float br = .22 + .2*bc.y, bIn = (1. - smoothstep(br - .04, br, bc.x))*step(.5, fract(bc.y*5.3))*step(sY, yTop - .04)*(1. - inRim);
    float dome = sqrt(max(0., 1. - bc.x*bc.x/(br*br))); vec3 stone = sPebble(bc.y, sN(q*40.))*(.55 + .45*dome)*1.15;
    col = mix(col*(1. - .5*(1. - smoothstep(br, br + .06, bc.x))*step(sY, yTop - .04)), stone, bIn); sH = mix(sH, dome*.03, bIn); }
  // the lake bed in section: grey-green silt over the soil where the column lies under the lake
  { float lk = step(sS, uLakeLevel - .01); col = mix(col, vec3(.07, .075, .06)*(.8 + .4*sN(q*30.)), lk*smoothstep(sS - .09, sS - .02, sY)); }
  // humus and roots
  vec3 humus = mix(vec3(.03,.022,.016), vec3(.055,.04,.028), sN(q*25.)); col = mix(col, humus, inTop*(1.-m*.5)); sH = mix(sH, (sN(q*60.)-.5)*.003, inTop);
  { float rz = (1.-m)*smoothstep(yClay, yClay+.05, sY)*step(sY, sS - rimB*.6); float x = sU*30.; float c = floor(x), f = fract(x)-.5; float len = (.15+.35*aaaHash(vec2(c,1.),2.))*rz; float wig = sin(sD*30.+c)*.08 + sin(sD*11.+c*2.)*.12;
    float root = (1.-smoothstep(.0,.06,abs(f-wig)))*step(sD - rimB, len)*step(.3,aaaHash(vec2(c,3.),2.)); col = mix(col, vec3(.2,.13,.08), root*.85); sH += root*.004; }
  // turf rim: blades seen in section, an overhang shadow just below
  { float blade = sN(vec2(sU*260., sY*8.)); vec3 turf = uSoilGrass*(.6+.6*blade)*smoothstep(sS - rimB, sS, sY + blade*.01); col = mix(col, turf, inRim); col *= 1. - .45*(1.-smoothstep(0.,.05,sS - rimB - sY))*(1.-inRim); }
  // depth darkening, wetness soaking down from the top
  col *= mix(1., .62, smoothstep(.1, 1.2, sD));
  float wet = uAaaWet; if (uAaaWetSpot.w > 0.) wet = max(wet, uAaaWetSpot.w*(1.-smoothstep(uAaaWetSpot.z*.5, uAaaWetSpot.z, length(vSoilW.xz-uAaaWetSpot.xy))));
  wet *= 1. - smoothstep(.05, .45, sD); col *= mix(1., .55, wet);
  diffuseColor.rgb = col * diffuse; float soilRough = mix(mix(.92, .62, inClay*(1.-inLoam)), .45, wet);
`;
export function soilMaterial({ bottom = -.9, grass = '#4a6a2c', lake = -99 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: 0 });
  m.defines = { SOIL_SECTION: '', SOIL_BOTTOM: (+bottom).toFixed(3) };
  const gc = new THREE.Color(grass);
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uAaaWet: AAA.uniforms.uAaaWet, uAaaWetSpot: AAA.uniforms.uAaaWetSpot, uSoilGrass: { value: gc }, uLakeLevel: { value: lake } });
    s.vertexShader = 'attribute float aSurf; attribute float aU; varying vec3 vSoilW; varying float vSoilS; varying float vSoilU;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vSoilW = (modelMatrix * vec4(transformed, 1.)).xyz; vSoilS = aSurf; vSoilU = aU;');
    let f = s.fragmentShader.replace('void main() {', SOIL_FRAG + '\nvoid main() {');
    f = f.replace('#include <map_fragment>', SOIL_MAIN);
    f = f.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = soilRough;');
    f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(sH), hy = dFdy(sH); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 gr = sign(det) * (hx * r1 + hy * r2) * 1.4; normal = normalize(abs(det) * normal - gr); }`);
    s.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'soil-section';
  m.userData.preset = 'soil-section';
  return m;
}
// The skirt: four walls under the terrain grid's edges. field from js/gfx/terrain.js.
export function buildSoilBlock(field, { bottom = -.9, grass, plinth = true, plinthPad = .22 } = {}) {
  const { NX, NZ, H, minX, minZ, dx, dz } = field, g = new THREE.Group(); g.name = 'soil section';
  const P = [], S = [], U = [], idx = []; let u = 0;
  const side = (pts) => {   // pts: [[x, z, k]] along the edge, outward = to the right of the walk
    const b = P.length / 3;
    pts.forEach(([x, z, k], i) => { if (i) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]); const y = H[k * 4]; P.push(x, y, z, x, bottom, z); S.push(y, y); U.push(u, u); });
    for (let i = 0; i < pts.length - 1; i++) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  };
  const row = j => Array.from({ length: NX }, (_, i) => [minX + i * dx, minZ + j * dz, j * NX + i]), col = i => Array.from({ length: NZ }, (_, j) => [minX + i * dx, minZ + j * dz, j * NX + i]);
  side(row(NZ - 1)); side(col(NX - 1).reverse()); side(row(0).reverse()); side(col(0));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(S, 1)); geo.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  // winding check: make the first wall face +z (outward at the front edge)
  const nz = geo.getAttribute('normal').getZ(0); if (nz < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
  const wall = new THREE.Mesh(geo, soilMaterial({ bottom, grass, lake: field.lake ? field.lake.level : -99 })); wall.name = 'soil section faces'; wall.receiveShadow = true; wall.castShadow = false; wall.userData.noInk = true; g.add(wall);
  if (plinth) {
    const W = field.w + plinthPad * 2, D = field.d + plinthPad * 2, wood = makeMaterial({ preset: 'darkwood', color: '#5a3f2c' });   // a dark wooden base, as under Weatherglass's case
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, .34, D), wood); slab.position.set(minX + field.w / 2, bottom - .17, minZ + field.d / 2); slab.receiveShadow = true; slab.castShadow = false; slab.name = 'walnut plinth';
    const foot = new THREE.Mesh(new THREE.BoxGeometry(W + .2, .1, D + .2), wood); foot.position.set(slab.position.x, bottom - .39, slab.position.z); foot.receiveShadow = true; foot.name = 'walnut plinth foot';
    const cap = new THREE.Mesh(new THREE.BoxGeometry(field.w + .02, .02, field.d + .02), makeMaterial('brass')); cap.position.set(slab.position.x, bottom + .005, slab.position.z); cap.name = 'brass fillet';
    [slab, foot, cap].forEach(m => { m.userData.noInk = true; g.add(m); });
  }
  return g;
}
