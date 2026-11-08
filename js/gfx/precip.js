// Particle looks that read as the real thing instead of dots: vapour wisps and rain streaks.
//  • Vapour: THREE.Points with a soft, vertically stretched, slowly twisting wisp per point (each with its own seed),
//    lit by the sky; faint and premultiplied so overlapping wisps build up like haze. material.opacity keeps working
//    (copied into the shader every frame), so scene code can fade it as before. Hidden while still a drawing.
//  • Rain: instanced quads aligned with the fall velocity (wind-slanted), a soft profile across, brighter at the
//    head, alpha falling off with distance. Positions live in obj.userData.streaks.pos (x, y, z per drop): the scene
//    code writes them and calls commit(); count limits how many draw.
import * as THREE from 'three';
import { AAA } from './aaa.js';
import { FRONT_GLSL, makeFrontUniforms } from './materialize.js';
import { SKY_U, skyFrom } from './water.js';
import { VEG } from './grass.js';
import { mulberry } from '../util.js';

const hook = m => { m.userData.onFront = U => { for (const k in U) if (k[0] === 'u' && m.uniforms[k]) m.uniforms[k] = U[k]; }; return m; };
export function vapourPoints(n = 160, area = [2, 1.5, 2], size = .16) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), sd = new Float32Array(n), r = mulberry(9);
  for (let i = 0; i < n; i++) { p[i * 3] = (r() - .5) * area[0]; p[i * 3 + 1] = r() * area[1]; p[i * 3 + 2] = (r() - .5) * area[2]; sd[i] = r(); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = hook(new THREE.ShaderMaterial({
    uniforms: Object.assign({ uOpacity: { value: .5 }, uSize: { value: size }, uAaaTime: AAA.uniforms.uAaaTime, uSkyCol: SKY_U.uSkyCol, uSunCol: SKY_U.uSunCol, uTop: { value: area[1] } }, makeFrontUniforms()),
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute float aSeed; uniform float uSize, uAaaTime, uTop; varying float vSeed, vLife; varying vec3 vFrontW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vFrontW = w.xyz; vSeed = aSeed; vLife = clamp(position.y / max(uTop, .01), 0., 1.);
        w.x += sin(uAaaTime * .7 + aSeed * 30. + position.y * 3.) * .04; vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
        gl_PointSize = min(uSize * (0.5 + vLife * .9) * projectionMatrix[1][1] * 300. / max(-mv.z, .05), 26.); }`,   // capped in pixels: close up a wisp stays a thin wisp, never a blurry disc
    fragmentShader: FRONT_GLSL + `uniform float uOpacity, uAaaTime; uniform vec3 uSkyCol, uSunCol; varying float vSeed, vLife;
      void main(){ float isCard = 1.0 - step(frontD(vFrontW), uFrontR); if (isCard > .5) discard;
        vec2 d = gl_PointCoord - .5; d.x += sin(d.y * 9. + vSeed * 20. + uAaaTime * 1.3) * .12 * (.5 - d.y);
        float a = exp(-(d.x * d.x * 90. + d.y * d.y * 5.)) * (.55 + .45 * sin(d.y * 18. + vSeed * 40.));   // a fine, vertically drawn-out thread
        a *= sin(vLife * 3.1416) * uOpacity * .5; if (a < .003) discard;
        gl_FragColor = vec4(vec3(.92, .95, 1.) * (uSkyCol * .9 + uSunCol * .12) * a, a); }`
  }));
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.name = 'vapour wisps'; pts.userData.noInk = true; pts.raycast = () => {};
  pts.onBeforeRender = (r, sc) => { skyFrom(sc); m.uniforms.uOpacity.value = m.opacity; };
  pts.userData.particles = { kind: 'vapour', area };
  return pts;
}
export function rainStreaks(n = 420, { len = .16, width = .007 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, .5, 0);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
  const pos = new Float32Array(n * 3).fill(-50), seed = new Float32Array(n).map((_, i) => (i * .618) % 1);
  const P = new THREE.InstancedBufferAttribute(pos, 3); P.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aPos', P); geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1)); geo.instanceCount = n;
  const m = hook(new THREE.ShaderMaterial({
    uniforms: Object.assign({ uLen: { value: len }, uWidth: { value: width }, uOpacity: { value: .6 }, uWind: VEG.uWind, uSkyCol: SKY_U.uSkyCol, uSunCol: SKY_U.uSunCol }, makeFrontUniforms()),
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec3 aPos; attribute float aSeed; uniform float uLen, uWidth; uniform vec2 uWind; varying vec2 vUv; varying float vFade; varying vec3 vFrontW;
      void main(){ vec3 vel = normalize(vec3(uWind.x * .06, -1., uWind.y * .06)); vec3 w0 = (modelMatrix * vec4(aPos, 1.)).xyz; vec3 toC = normalize(cameraPosition - w0); vec3 side = normalize(cross(vel, toC));
        float L = uLen * (.8 + .4 * aSeed); vec3 w = w0 - vel * position.y * L + side * position.x * uWidth; vFrontW = w0; vUv = uv; float dC = distance(w0, cameraPosition); vFade = (1. - smoothstep(6., 22., dC)) * smoothstep(.25, 1.2, dC);   /* streaks right at the lens fade out instead of smearing */
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.); }`,
    fragmentShader: FRONT_GLSL + `uniform float uOpacity; uniform vec3 uSkyCol, uSunCol; varying vec2 vUv; varying float vFade;
      void main(){ float isCard = 1.0 - step(frontD(vFrontW), uFrontR); if (isCard > .5) discard; float x = abs(vUv.x * 2. - 1.); float a = (1. - x * x) * mix(1., .2, vUv.y) * uOpacity * vFade * .55;
        gl_FragColor = vec4(vec3(.8, .87, .95) * (uSkyCol * 1.1 + uSunCol * .1) * a, a); }`
  }));
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = 'rain streaks'; mesh.userData.noInk = true; mesh.userData.noContact = true; mesh.raycast = () => {}; mesh.renderOrder = 8;
  mesh.onBeforeRender = (r, sc) => { skyFrom(sc); m.uniforms.uOpacity.value = m.opacity; };
  mesh.userData.streaks = { pos, count: n, commit(c = n) { geo.instanceCount = Math.max(0, Math.min(n, c)); P.needsUpdate = true; } };
  return mesh;
}
