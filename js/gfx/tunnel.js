// The passage behind every door: a classical, heavenly gallery between the hall and the rooms. A marble colonnade of
// fluted Ionic columns on either side under a gilded entablature, a coffered barrel vault (the Pantheon's sunk panels)
// pierced every other bay by an oculus open to the sky, a floor of marble with an inlaid runner, and at
// the far end the light of the place you are going, into which the whole gallery dissolves.
// It is built behind the door's opening, in the door's own frame (x along the wall, y up from the room's floor, +z into
// the room, so the gallery runs to -z), and drawn only while a door stands open or a walk is under way.
// Speed: everything repeats every BAY metres, so the colonnade, the vault's panels and the floor's inlay are all
// shifted by the flow (metres, advanced by the walk; wrapped every two bays): the gallery seems to rush
// past faster than the camera really moves, and nothing ever jumps.
// One small shader lights it all (no lamps out here): marble or gold, lit from the far end and the oculi above,
// fluting on the shafts, panels on the vault, inlay on the floor, and the far end's light as a fog that grows with the
// distance down the gallery.
import * as THREE from 'three';

const BAY = 1.7, HALF = 1.95, COLX = 1.6, ENT = 3.55, VR = HALF;   // bay length; half width; column line; entablature height; vault radius
const VERT = `
uniform mat4 uInv; uniform float uShift;
varying vec3 vT; varying vec3 vN; varying vec3 vObj;
void main(){
  vec4 p = vec4(position, 1.0); vObj = position;
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 w = m * p;
  vT = (uInv * w).xyz;                         // in the gallery's own frame
  vN = normalize(mat3(uInv) * mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = `
precision highp float;
uniform vec3 uColor, uGoldC, uHeaven, uComp; uniform float uKind, uFlow, uLen, uGlow, uBay, uClip;
varying vec3 vT; varying vec3 vN; varying vec3 vObj;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float s = -vT.z;                              // metres down the gallery from the door
  if (uClip > .5 && s < THROAT) discard;        // the moving colonnade never comes through the doorway into the room
  float f = s + uFlow;                          // the pattern's coordinate (moves with the flow)
  vec3 n = normalize(vN);
  vec3 col = uColor;
  // marble: a soft cloud and fine grey veins
  float m = vn(vec2(vT.x * 4.3 + vT.y * 1.7, f * 3.9)) * .55 + vn(vec2(vT.y * 9.1 + vT.x * 2., f * 8.3)) * .45;
  float vein = smoothstep(.012, .0, abs(m - .52)) * .7 + smoothstep(.006, .0, abs(vn(vec2(vT.y * 2.3 + f * .7, vT.x * 2.9 + f * 1.9)) - .5)) * .5;
  if (uKind < .5 || abs(uKind - 3.) < .1) col *= .97 + .05 * m - .07 * vein;
  // 1: the shafts' fluting (24 flutes)
  if (abs(uKind - 1.) < .1) { float a = atan(vObj.z, vObj.x); col *= .82 + .18 * pow(abs(cos(a * 12.)), .6); }
  // 2: the vault's coffers: sunk square panels with a gilt rosette, oculi every other bay
  float sky = 0.;
  if (abs(uKind - 2.) < .1) {
    float ang = atan(vT.y - ${ENT.toFixed(2)}, vT.x);       // 0..pi across the vault
    vec2 c = vec2(ang / 3.14159 * 7., f / (uBay * .5));
    vec2 cf = abs(fract(c) - .5);
    float panel = smoothstep(.36, .30, max(cf.x, cf.y));
    float step2 = smoothstep(.44, .40, max(cf.x, cf.y)) - panel;
    col *= mix(1., .72, panel) * (1. - .12 * step2);
    float ros = smoothstep(.07, .03, length(fract(c) - .5));
    col = mix(col, uGoldC * 1.25, ros * panel);
    // the oculus: the crown's panel, every other bay, open to the sky
    float crown = smoothstep(.55, .5, abs(ang / 3.14159 - .5) * 7.);
    float oc = crown * step(.5, fract(f / (uBay * 2.))) * smoothstep(.34, .2, max(cf.x, cf.y));
    sky = oc;
  }
  // 3: the floor: marble with a gilt-edged runner of dark inlay down the middle and a cross band every bay
  if (abs(uKind - 3.) < .1) {
    float x = abs(vT.x);
    float runner = smoothstep(.62, .6, x);
    col = mix(col, vec3(.36, .13, .1), runner * .62);   // a runner of red porphyry
    float edge = smoothstep(.035, .0, abs(x - .62)) + smoothstep(.035, .0, .5 - abs(fract(f / uBay) - .5)) * smoothstep(1.4, 1.3, x);   // gilt fillets: the runner's edges and a band at every bay
    col = mix(col, uGoldC, clamp(edge, 0., 1.) * .8);
  }
  // light: from the far end (low, ahead) and from above (the oculi), a warm bounce from the floor
  vec3 L = normalize(vec3(0., .55, -1.));
  float diff = max(dot(n, L), 0.) * .55 + max(n.y, 0.) * .35 + max(-n.y, 0.) * .12 + .38;
  // shafts' and columns' faces turned towards the axis catch the axis's light
  diff += .15 * max(dot(n, normalize(vec3(-sign(vT.x), .2, 0.))), 0.);
  vec3 lit = col * diff;
  // gold: metallic, warm, with a soft highlight
  if (abs(uKind - 4.) < .1) { float spec = pow(max(dot(n, normalize(vec3(0., .4, -1.))), 0.), 6.); lit = uGoldC * (.55 + .5 * diff) + uGoldC * spec * .9; }
  lit = mix(lit, uHeaven * 2.3, sky);
  // the far end's light: a haze that thickens down the gallery and brightens as the run speeds up
  float far = smoothstep(uLen * .18, uLen * .92, s);
  vec3 haze = uHeaven * (1.15 + 1.6 * uGlow);
  lit = mix(lit, haze, clamp(far * far * 1.15 + uGlow * .25 * far, 0., 1.));
  // near the door the room's lamplight
  lit += uHeaven * .12 * smoothstep(2.2, .0, s);
  if (uKind > 4.5) lit = haze;                    // 5: the light at the end itself (the haze's own colour: no edge)
  // the place's colour grade pulls warm lamplight back to white (renderer.js HOUSE: blue x3.4); out here there is no
  // lamplight to correct, so that correction is undone, or the marble and the light would turn cold blue
  gl_FragColor = vec4(lit * uComp, 1.);
}`;

export function makeTunnel(door, len = 34) {
  const g = new THREE.Group(); g.name = 'door-tunnel'; g.visible = false; g.userData.noProbe = true;
  const throat = .42, U = { uInv: { value: new THREE.Matrix4() }, uShift: { value: 0 }, uFlow: { value: 0 }, uLen: { value: len }, uGlow: { value: 0 }, uBay: { value: BAY }, uHeaven: { value: new THREE.Color(1, .93, .8) }, uComp: { value: new THREE.Vector3(1, 1, 1) }, uGoldC: { value: new THREE.Color(.86, .66, .3) } };
  const mats = [];
  const mat = (kind, color, clip = 0) => { const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG.replace('THROAT', throat.toFixed(3)), uniforms: { ...U, uKind: { value: kind }, uColor: { value: new THREE.Color(color) }, uClip: { value: clip } }, toneMapped: false, side: THREE.DoubleSide }); mats.push(m); return m; };
  const marble = mat(0, 0xefe6d6), vaultM = mat(2, 0xeee3cf), floorM = mat(3, 0xe9dfcd), gold = mat(4, 0xffffff), wallM = mat(0, 0xe6dac4);
  const marbleF = mat(0, 0xefe6d6, 1), flutedF = mat(1, 0xf2ebdd, 1), goldF = mat(4, 0xffffff, 1);   // (the moving ones: clipped at the doorway)
  const z0 = -throat, L = len;
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; g.add(o); return o; };
  // the fixed shell: floor, walls behind the colonnade, the vault, the entablature on each side
  { const fg = new THREE.PlaneGeometry(HALF * 2, L); fg.rotateX(-Math.PI / 2); add(fg, floorM, 0, 0, z0 - L / 2); }
  for (const sx of [-1, 1]) { const wg = new THREE.PlaneGeometry(L, ENT + .02); wg.rotateY(sx * -Math.PI / 2); add(wg, wallM, sx * HALF, ENT / 2, z0 - L / 2); }
  { const vg = new THREE.CylinderGeometry(VR, VR, L, 48, 1, true, -Math.PI / 2, Math.PI); vg.rotateX(Math.PI / 2); vg.rotateZ(Math.PI); add(vg, vaultM, 0, ENT, z0 - L / 2); }
  // entablature: architrave, a gilt frieze, a cornice (long boxes, fixed: they are uniform along the gallery)
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(.5, .22, L), marble, sx * (COLX), ENT - .11 - .2, z0 - L / 2);
    add(new THREE.BoxGeometry(.42, .16, L), gold, sx * (COLX + .02), ENT - .02 - .12, z0 - L / 2);
    add(new THREE.BoxGeometry(.7, .1, L), marble, sx * (COLX + .1), ENT + .02, z0 - L / 2);
  }
  // the moving colonnade: bases, fluted shafts, Ionic capitals, as instances, and the shafts of light under the oculi
  const flow = new THREE.Group(); g.add(flow);
  const N = Math.ceil(L / BAY) + 2, H = ENT - .42 - .3, inst = (geo, m, n) => { const o = new THREE.InstancedMesh(geo, m, n); o.frustumCulled = false; flow.add(o); return o; };
  const base = inst(new THREE.CylinderGeometry(.25, .28, .2, 24), marbleF, N * 2), plinth = inst(new THREE.BoxGeometry(.6, .12, .6), marbleF, N * 2);
  const shaft = inst(new THREE.CylinderGeometry(.165, .19, H, 32, 1, true), flutedF, N * 2);
  const ech = inst(new THREE.CylinderGeometry(.24, .18, .14, 24), goldF, N * 2), abacus = inst(new THREE.BoxGeometry(.56, .08, .56), marbleF, N * 2);
  const vol = inst(new THREE.TorusGeometry(.085, .03, 8, 20), goldF, N * 4);
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), One = new THREE.Vector3(1, 1, 1), qv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  let c = 0, cv = 0;
  for (let i = 0; i < N; i++) for (const sx of [-1, 1]) {
    const z = z0 - BAY * .5 - i * BAY, x = sx * COLX;
    plinth.setMatrixAt(c, Mx.compose(V.set(x, .06, z), Q.identity(), One)); base.setMatrixAt(c, Mx.compose(V.set(x, .22, z), Q.identity(), One));
    shaft.setMatrixAt(c, Mx.compose(V.set(x, .32 + H / 2, z), Q.identity(), One));
    ech.setMatrixAt(c, Mx.compose(V.set(x, .32 + H + .07, z), Q.identity(), One)); abacus.setMatrixAt(c, Mx.compose(V.set(x, .32 + H + .18, z), Q.identity(), One));
    for (const dz of [-.22, .22]) vol.setMatrixAt(cv++, Mx.compose(V.set(x, .32 + H + .08, z + dz), qv, One));
    c++;
  }
  [base, plinth, shaft, ech, abacus, vol].forEach(o => { o.instanceMatrix.needsUpdate = true; });
  // the throat (the doorway's own depth) and the wall of the gallery's end round the doorway, in marble
  const face = (w, h, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), marble); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); };
  face(throat, door.h, -door.w / 2, door.h / 2, -throat / 2, Math.PI / 2); face(throat, door.h, door.w / 2, door.h / 2, -throat / 2, -Math.PI / 2);
  face(door.w, throat, 0, door.h, -throat / 2, 0, Math.PI / 2); face(door.w, throat, 0, .002, -throat / 2, 0, -Math.PI / 2);   // its lintel and its sill
  { const sh = new THREE.Shape(); sh.moveTo(-HALF - .02, 0); sh.lineTo(HALF + .02, 0); sh.lineTo(HALF + .02, ENT); sh.absarc(0, ENT, VR + .02, 0, Math.PI, false); sh.lineTo(-HALF - .02, 0);
    const hl = new THREE.Path(); hl.moveTo(-door.w / 2, 0); hl.lineTo(-door.w / 2, door.h); hl.lineTo(door.w / 2, door.h); hl.lineTo(door.w / 2, 0); hl.lineTo(-door.w / 2, 0); sh.holes.push(hl);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 32), wallM); m.position.z = -throat; g.add(m); }
  // a gilt architrave round the doorway, seen from the gallery
  { const t = .07, z = -throat - .012; [[door.w + t * 2, t, 0, door.h + t / 2], [t, door.h, -door.w / 2 - t / 2, door.h / 2], [t, door.h, door.w / 2 + t / 2, door.h / 2]].forEach(([w, h, x, y]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .03), gold); m.position.set(x, y, z); g.add(m); }); }
  // the far end: the light itself
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.4, ENT + VR + .4), mat(5, 0xffffff)); m.position.set(0, (ENT + VR) / 2, z0 - L + .05); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noProbe = true; } });
  // every frame it is drawn: the gallery's frame for the shader, and the flow (by the wall clock)
  let v = 0, last = 0;
  const tick = () => { const now = performance.now() / 1000, dt = last ? Math.min(.1, now - last) : 0; last = now; U.uFlow.value += v * dt; flow.position.z = U.uFlow.value % (BAY * 2); g.updateMatrixWorld(); U.uInv.value.copy(g.matrixWorld).invert(); };
  let lastFrame = -1; g.traverse(o => { if (o.isMesh) o.onBeforeRender = (r, sc) => { if (r.info.render.frame !== lastFrame) { lastFrame = r.info.render.frame; tick(); const wb = sc && sc.userData.look && sc.userData.look.wb, gn = (wb && (Array.isArray(wb) ? wb : wb.gain)) || [.84, 1.45, 3.4]; U.uComp.value.set(Math.pow(1 / (gn[0] || 1), .75), Math.pow(1 / (gn[1] || 1), .75), Math.pow(1 / (gn[2] || 1), .75));   /* not all the way: a trace of the grade's coolness keeps the marble ivory, not ochre */ } }; });   // once a frame, before the first of its meshes is drawn
  g.userData.tunnel = { U, setFlow: x => { v = x; }, get flow() { return v; }, setGlow: k => { U.uGlow.value = k; }, len, throat, tick };
  return g;
}
