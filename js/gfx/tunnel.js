// The passage behind every door: a hyperloop tunnel between the hall and the rooms. It is built behind the door's
// opening (in the door's own frame: x along the wall, y up from the floor, +z into the room, so the tunnel runs to -z)
// and is drawn only while a door stands open. The tube's surface is one shader: a dark, polished bore with six light
// rails running its length, rings of light at even spacing and short streaks along the rails; all of them are offset by
// `flow` (metres), which the door's walk advances, so the light rushes past faster than the camera really moves. Far
// down the tube the bore brightens into the warm light of the place at its other end; the walk fades through that light
// (the app's veil is the same warm cream) and the next place begins inside its own tunnel, looking out through its
// door into the room.
import * as THREE from 'three';

const VERT = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
precision highp float;
varying vec3 vP;
uniform float uFlow, uLen, uCy, uGlow, uTime;
uniform vec3 uWarm, uCool;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float s = -vP.z;                                  // metres from the door
  float a = atan(vP.y - uCy, vP.x) / 6.2831853 + .5; // around the bore, 0..1
  float f = s + uFlow;                              // the pattern's coordinate (flow moves it towards the door)
  // the bore: dark lacquer, a little lighter towards the floor where the rails' light falls
  float floorK = smoothstep(.15, .0, abs(a - .25));
  vec3 col = mix(vec3(.012, .014, .022), vec3(.03, .026, .022), floorK);
  // six rails along the length
  float ra = abs(fract(a * 6.) - .5);
  float rail = smoothstep(.014, .0, .5 - ra);
  col += rail * uCool * .32;
  // streaks running along the rails
  float lane = floor(a * 6.);
  float sk = fract(f * .22 + hash(lane) * 7.);
  col += rail * smoothstep(.0, .02, sk) * smoothstep(.16, .02, sk) * uCool * 1.5;
  // rings of light every 2.4 m
  float rg = fract(f / 2.4);
  float ring = smoothstep(.0, .012, rg) * smoothstep(.05, .012, rg);
  col += ring * mix(uWarm, uCool, .3) * .95;
  // ribs between the rings (structure, catching light)
  float rib = smoothstep(.06, .0, abs(fract(f / .8) - .5) - .44);
  col += rib * .02;
  // the far end: the other place's warm light grows down the bore
  float far = smoothstep(uLen * .25, uLen * .97, s);
  col = mix(col, uWarm * (1.4 + 2.2 * uGlow), far * far);
  // near the door, the room's lamplight spills a little way in
  col += uWarm * .22 * smoothstep(2.5, .0, s);
  gl_FragColor = vec4(col, 1.);
}`;

// door: { w, h }; returns the tunnel group, with setFlow(v) (m/s, signed) and update() driven by onBeforeRender
export function makeTunnel(door, len = 30) {
  const g = new THREE.Group(); g.name = 'door-tunnel'; g.visible = false; g.userData.noProbe = true;
  const R = Math.max(door.h, door.w) / 2 + .45, cy = door.h / 2, throat = .42;
  const U = { uFlow: { value: 0 }, uLen: { value: len }, uCy: { value: cy }, uGlow: { value: 0 }, uTime: { value: 0 }, uWarm: { value: new THREE.Color(1, .9, .72) }, uCool: { value: new THREE.Color(.55, .78, 1) } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, side: THREE.BackSide, toneMapped: false });
  // the tube (open-ended), its axis along -z from the end of the throat
  const tube = new THREE.CylinderGeometry(R, R, len, 64, 1, true); tube.rotateX(Math.PI / 2); tube.translate(0, cy, -throat - len / 2);
  const T = new THREE.Mesh(tube, mat); T.frustumCulled = false; g.add(T);
  // the throat: the doorway's own depth (four dark faces), then a wall closing the tube round the doorway, so nothing
  // of the room's outside shows round the opening when you look back from inside
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0c14, side: THREE.DoubleSide });
  const face = (w, h, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); };
  face(throat, door.h, -door.w / 2, door.h / 2, -throat / 2, Math.PI / 2); face(throat, door.h, door.w / 2, door.h / 2, -throat / 2, -Math.PI / 2);
  face(door.w, throat, 0, door.h, -throat / 2, 0, Math.PI / 2); face(door.w, throat, 0, 0, -throat / 2, 0, -Math.PI / 2);
  { const sh = new THREE.Shape(); sh.absarc(0, cy, R + .02, 0, Math.PI * 2, false); const h = new THREE.Path(); h.moveTo(-door.w / 2, 0); h.lineTo(-door.w / 2, door.h); h.lineTo(door.w / 2, door.h); h.lineTo(door.w / 2, 0); h.lineTo(-door.w / 2, 0); sh.holes.push(h);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 48), dark); m.position.z = -throat; g.add(m); }
  // the doorway seen from the tunnel: outlined in warm light
  { const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .86, .6).multiplyScalar(1.6), toneMapped: false }), t = .035, z = -throat - .01;
    [[door.w + t * 2, t, 0, door.h + t / 2], [t, door.h, -door.w / 2 - t / 2, door.h / 2], [t, door.h, door.w / 2 + t / 2, door.h / 2]].forEach(([w, h, x, y]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lm); m.position.set(x, y, z); m.rotation.y = Math.PI; g.add(m); }); }
  // a floor to walk on: a dark glass strip along the bottom of the bore
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(door.w * .9, len), new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: .12, metalness: .3 })); m.rotation.x = -Math.PI / 2; m.position.set(0, cy - R * .93, -throat - len / 2); g.add(m); }
  // the far end's light
  { const m = new THREE.Mesh(new THREE.CircleGeometry(R + .05, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .9, .72).multiplyScalar(3.6), toneMapped: false })); m.position.set(0, cy, -throat - len + .02); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noProbe = true; } });
  // the flow advances by the wall clock whenever the tunnel is drawn
  let v = 0, last = 0; T.onBeforeRender = () => { const now = performance.now() / 1000; const dt = last ? Math.min(.1, now - last) : 0; last = now; U.uFlow.value += v * dt; U.uTime.value = now % 1000; };
  g.userData.tunnel = { U, setFlow: x => { v = x; }, get flow() { return v; }, setGlow: k => { U.uGlow.value = k; }, R, cy, len, throat };
  return g;
}
