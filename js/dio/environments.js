// Scene-dependent lighting presets: each sets background, IBL, key/fill/rim lights, fog, the display base and ambient particles.
// update(t, params) lets presets respond to time-of-day or simulation parameters (sun height, storm darkness…).
//  • IBL: a procedural HDR-like environment per preset (softboxes for studio/lab, sky dome + sun for outdoors),
//    so glass and polished metal have something to reflect (gfx.envFor).
//  • Shadows: one PCF-soft key light whose orthographic shadow camera is fitted to the plinth (2048², normal bias),
//    plus real-time CONTACT SHADOWS: the world is rendered from below into a small depth-darkness target, blurred,
//    and laid on the plinth top, so every object (moving ones too) sits on a soft occlusion pool.
//  • Outdoor presets (landscape, ocean, night): the sun/moon is cascade 0 of a 2–3 cascade shadow set (quality level,
//    js/gfx/aaa.js); the hemisphere light is not a flat ambient but the sky dome + ground bounce derived from the sun
//    (ground radiance = ground albedo × sun irradiance on the ground); scene.userData.aaaAtmos describes the height
//    fog and god rays for the renderer's atmosphere pass.
//  • The plinth is a turned, varnished walnut base with a baize top and a brass inlay; the optional glass case is
//    thin-walled transmissive glass at quality 'high' (thin shell below) in a slim brass frame.
//  • Studio, lab and desk surfaces are full stacks (surfaces.js): wood with a rotated detail layer and world-space
//    colour/roughness breakup so the grain never repeats visibly across the plinth or the desk.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { canvasTex } from '../gfx/textures.js';
import { makeMaterial, thinGlass } from '../gfx/materials.js';
import { surface } from '../gfx/surfaces.js';
import { woodSet, feltSet, alignUV, softDisc } from '../gfx/proc.js';
import { mulberry } from '../util.js';
import { AAA, resetWeather, aaaMaterial } from '../gfx/aaa.js';

export const ENV_PRESETS = ['studio', 'lab', 'landscape', 'cosmos', 'micro', 'abstract', 'ocean', 'night', 'desk'];
function bgGradient(inner, outer) {
  return canvasTex('bg' + inner + outer, 1024, 1024, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * .42, 20, w / 2, h / 2, w * .72); gr.addColorStop(0, inner); gr.addColorStop(.62, outer); gr.addColorStop(1, '#050403'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
// Key light with a shadow camera fitted around the plinth (radius ~7.2): tight frustum = sharper, stabler shadows.
function sunRig(scene, { color = 0xffe2bc, intensity = 3, pos = [6, 12, 7], size = 8.6, map = 2048 } = {}) {
  const sun = new THREE.DirectionalLight(color, intensity); sun.position.set(...pos); sun.castShadow = true;
  sun.shadow.mapSize.set(map, map); const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 50;
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .022; sun.shadow.radius = 2; scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 1.2, 0); return sun;
}
// Shadow cascades around the sun: cascade 0 is the key itself (fitted to the plinth); cascades 1–2 are zero-intensity
// directional lights whose shadow maps cover ±34 and ±110 units (hedgerows, trees, far hills). Biases scale with the
// texel size of each map (normal bias ≈ 2.2 texels, depth bias grows with the depth range).
function cascadeRig(scene, R, n) {
  const sun = R.sun; if (!sun || n < 2) return;
  const sizes = [sun.shadow.camera.right, 34, 110]; R.cascades = [sun]; R.cascadeSizes = sizes;
  for (let i = 1; i < Math.min(3, n); i++) {
    const l = new THREE.DirectionalLight(0xffffff, 0), S = sizes[i], map = i === 1 && AAA.quality === 'high' ? 2048 : 1024; l.castShadow = true; l.name = 'sun shadow cascade ' + i; l.userData.cascade = i; l.userData.noInk = true;
    l.shadow.mapSize.set(map, map); const c = l.shadow.camera; c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.near = 1; c.far = S * 3 + 60; c.updateProjectionMatrix();
    l.shadow.bias = -.0003 * i; l.shadow.normalBias = 2.2 * 2 * S / map; scene.add(l); scene.add(l.target); R.cascades.push(l);
  }
  placeCascades(R);
}
const _cd = new THREE.Vector3();
function placeCascades(R) {
  if (!R.cascades) return; const s = R.sun; _cd.copy(s.position).sub(s.target.position).normalize();
  for (let i = 1; i < R.cascades.length; i++) { const l = R.cascades[i], S = R.cascadeSizes[i]; l.target.position.copy(s.target.position); l.position.copy(s.target.position).addScaledVector(_cd, S * 1.5 + 30); }
}
// Physically derived sky + bounce for the hemisphere light (irradiance units, like a DirectionalLight's intensity):
// ground side = ρ_ground · E_sun · sin(elevation) (an infinite Lambertian ground seen by a downward face), sky side =
// the clear-sky diffuse irradiance, ~15 % of the direct beam on a horizontal surface (more under cloud, which
// scatters the beam). The atmosphere descriptor follows the same sun.
function skyBounce(R, groundAlbedo, skyFrac = .15, cloud = 0, floor = .02) {
  const s = R.sun, h = R.hemi; if (!s || !h) return;
  _cd.copy(s.position).sub(s.target.position).normalize(); const sinE = Math.max(0, _cd.y), E = s.intensity * sinE;
  h.intensity = 1; h.groundColor.copy(groundAlbedo).multiply(s.color).multiplyScalar(E * .85);
  h.color.copy(R.skyTint || _sky).multiplyScalar(E * (skyFrac + cloud * .35) + floor);
  const A = R.atmos; if (A) { A.sunDir.copy(_cd); A.sunColor.copy(s.color).multiplyScalar(s.intensity); A.amb.copy(h.color).multiplyScalar(.25); }
}
const _sky = new THREE.Color(.55, .7, 1), _c1 = new THREE.Color(), _c2 = new THREE.Color();
// Studio key as a spotlight: inverse-square falloff and a wide penumbra give the light pool of a product photograph.
function spotKey(scene, { color = 0xffe6c8, pos = [7, 12, 6.5], lux = 3.6, angle = .62, map = 2048 } = {}) {
  const d = Math.hypot(pos[0], pos[1] - 1.2, pos[2]), s = new THREE.SpotLight(color, lux * d * d, 0, angle, .75, 2); s.position.set(...pos); s.castShadow = true;
  s.shadow.mapSize.set(map, map); s.shadow.camera.near = d - 9; s.shadow.camera.far = d + 9; s.shadow.bias = -.00008; s.shadow.normalBias = .02; s.shadow.radius = 2;
  scene.add(s); scene.add(s.target); s.target.position.set(0, 1.2, 0); return s;
}
function dirLight(scene, color, intensity, pos) { const l = new THREE.DirectionalLight(color, intensity); l.position.set(...pos); scene.add(l); scene.add(l.target); l.target.position.set(0, 1.5, 0); return l; }
function cloneRep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

// Turned walnut plinth: ogee/bead profile, baize top inset, brass inlay ring. Top surface stays at y = 0.
function plinth(scene, { r = 7.2, felt = '#1d3125', brass = true, turf = false } = {}) {
  const g = new THREE.Group(); g.name = 'display base'; g.userData.decorBase = true;
  const W = woodSet('plinth'), rim = .34, prof = [];
  const arc = (cx, cy, rad, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; prof.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)); } };
  prof.push(new THREE.Vector2(r - rim, -.02), new THREE.Vector2(r - rim + .02, .0));
  prof.push(new THREE.Vector2(r - .12, .0)); arc(r - .12, -.12, .12, Math.PI / 2, 0, 8);        // bullnose top edge
  prof.push(new THREE.Vector2(r, -.2)); arc(r - .02, -.32, .1, .3, -Math.PI / 2 + .2, 8);        // cove
  arc(r + .05, -.5, .08, Math.PI / 2, -Math.PI / 2, 10);                                          // bead
  prof.push(new THREE.Vector2(r + .06, -.62), new THREE.Vector2(r + .1, -.82)); arc(r + .18, -.86, .1, Math.PI * .9, Math.PI * 1.5, 6); // flared foot
  prof.push(new THREE.Vector2(r + .34, -.96), new THREE.Vector2(r + .34, -1.0), new THREE.Vector2(.01, -1.0));
  const woodM = surface(new THREE.MeshPhysicalMaterial({ map: cloneRep(W.map, 8, 1), normalMap: cloneRep(W.normalMap, 8, 1), roughnessMap: cloneRep(W.roughnessMap, 8, 1), normalScale: new THREE.Vector2(.3, .3), roughness: .7, clearcoat: .6, clearcoatRoughness: .3, color: 0xffffff }), { box: false, macro: [.6, .08, .18], detail: [3.7, .35] });   // satin varnish: the key's reflection on the bullnose is a sheen, not a pin-point
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 160), woodM); base.receiveShadow = true; base.castShadow = false; base.name = 'walnut base'; g.add(base);
  const F = feltSet(), feltM = new THREE.MeshPhysicalMaterial({ map: cloneRep(F.map, 10, 10), normalMap: cloneRep(F.normalMap, 10, 10), normalScale: new THREE.Vector2(.5, .5), color: new THREE.Color(felt), roughness: 1, sheen: .6, sheenRoughness: .75, sheenColor: new THREE.Color(felt).lerp(new THREE.Color(0xffffff), .12), envMapIntensity: .6 });
  // outdoors the top is turf: AAA meadow soil and grass with parallax relief, its edge fractured against the brass inlay
  const top = new THREE.Mesh(new THREE.CircleGeometry(r - rim + .01, 128), turf ? aaaMaterial('meadow', { color: felt, tile: 1.3, depth: .028, moss: 1, bound: { type: 'ring', x: 0, z: 0, rIn: -1, rOut: r - rim - .02 } }) : feltM); top.rotation.x = -Math.PI / 2; top.position.y = .002; top.receiveShadow = true; top.name = 'baize'; g.add(top);
  if (brass) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r - rim + .02, .028, 10, 192), makeMaterial('brass')); ring.rotation.x = Math.PI / 2; ring.position.y = .008; ring.receiveShadow = true; g.add(ring); }
  g.traverse(o => { o.userData.noInk = true; }); scene.add(g); return g;
}
function stars(scene, n = 2500, R = 120) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry(4);
  for (let i = 0; i < n; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); p.set([R * s * Math.cos(a), R * u, R * s * Math.sin(a)], i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .35, color: 0xffffff, sizeAttenuation: true, transparent: true, opacity: .9, depthWrite: false })); pts.userData.noInk = true; scene.add(pts); return pts;
}
function motes(scene, color = 0xffd590, n = 120, area = [14, 8, 14]) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry(5);
  for (let i = 0; i < n; i++) p.set([(r() - .5) * area[0], r() * area[1], (r() - .5) * area[2]], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .025, color, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.noInk = true; pts.userData.motes = { area }; scene.add(pts); return pts;
}

// ---------- contact shadows (after three.js webgl_shadow_contact, adapted: skips glass, lines, decor, sky) ----------
function contactShadows(scene, gfx, { size = 15, res = 512, height = 2.4, darkness = 1.15, blur = 2.6, opacity = .9 } = {}) {
  // render targets are shared on gfx (one diorama renders at a time) so reopening scenes never leaks GPU memory
  const key = '_contactRT' + res; if (!gfx[key]) { gfx[key] = [new THREE.WebGLRenderTarget(res, res), new THREE.WebGLRenderTarget(res, res)]; gfx[key].forEach(t => { t.texture.generateMipmaps = false; }); }
  const [rt, rtB] = gfx[key];
  const grp = new THREE.Group(); grp.position.y = .012; grp.userData.decorBase = true; grp.userData.noInk = true; scene.add(grp);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity, depthWrite: false }));
  plane.scale.y = -1; plane.renderOrder = 1; plane.raycast = () => {}; plane.name = 'contact shadow'; plane.userData.noInk = true; grp.add(plane);
  const blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2)); blurPlane.visible = false; grp.add(blurPlane);
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height); cam.rotation.x = Math.PI / 2; grp.add(cam);
  const depthM = new THREE.MeshDepthMaterial(); depthM.userData.darkness = { value: darkness };
  depthM.onBeforeCompile = s => { s.uniforms.darkness = depthM.userData.darkness; s.fragmentShader = 'uniform float darkness;\n' + s.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * darkness );'); };
  depthM.depthTest = false; depthM.depthWrite = false; depthM.side = THREE.DoubleSide;
  const hB = new THREE.ShaderMaterial(HorizontalBlurShader), vB = new THREE.ShaderMaterial(VerticalBlurShader); hB.depthTest = vB.depthTest = false;
  let hidden = [], frame = 0;
  const collect = () => {
    hidden = [];
    scene.traverse(o => {
      if (o === scene || !o.visible) return;
      if (o === grp || o.userData.decorBase || o.isPoints || o.isLine || o.isSprite || o.userData.isInk || o.userData.noContact) { hidden.push(o); return; }
      if (o.isMesh) {
        const ms = [].concat(o.material), g = o.geometry; if (g && !g.boundingSphere) g.computeBoundingSphere();
        const big = g && g.boundingSphere && g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 6.2; // ground planes, terrain, sea, sky
        if (big || ms.some(m => m.transparent || m.transmission > 0 || m.isShaderMaterial)) hidden.push(o);
      }
    });
  };
  const blurPass = (amt) => {
    blurPlane.visible = true; const r = gfx.renderer;
    blurPlane.material = hB; hB.uniforms.tDiffuse.value = rt.texture; hB.uniforms.h.value = amt / 256; r.setRenderTarget(rtB); r.render(blurPlane, cam);
    blurPlane.material = vB; vB.uniforms.tDiffuse.value = rtB.texture; vB.uniforms.v.value = amt / 256; r.setRenderTarget(rt); r.render(blurPlane, cam);
    blurPlane.visible = false;
  };
  return {
    plane, rt,
    update() {
      if (frame++ % 2) return; // every other frame is plenty for soft occlusion
      if (frame % 60 === 1) collect();
      const r = gfx.renderer, prevRT = r.getRenderTarget(), bg = scene.background, prevSM = r.shadowMap.autoUpdate, vis = hidden.map(o => o.visible);
      hidden.forEach(o => { o.visible = false; });
      scene.background = null; scene.overrideMaterial = depthM; r.shadowMap.autoUpdate = false;
      const cc = r.getClearAlpha(); r.setClearAlpha(0);
      r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
      scene.overrideMaterial = null;
      blurPass(blur); blurPass(blur * .45);
      r.setRenderTarget(prevRT); r.setClearAlpha(cc); r.shadowMap.autoUpdate = prevSM; scene.background = bg;
      hidden.forEach((o, i) => { o.visible = vis[i]; });
    },
  };
}

// Display case: thin-shell glass panes (no bottom) in a slim brass frame.
function glassCase(scene, w, h) {
  const g = new THREE.Group(); g.name = 'glass case'; g.userData.decorBase = true;
  const gm = thinGlass({ absorb: .012, edge: .55, env: 1.1, card: .07, transmit: 'high' }), pane = (pw, ph) => new THREE.PlaneGeometry(pw, ph);
  [[0, h / 2, w / 2, 0], [0, h / 2, -w / 2, Math.PI], [w / 2, h / 2, 0, Math.PI / 2], [-w / 2, h / 2, 0, -Math.PI / 2]].forEach(([x, y, z, ry]) => { const m = new THREE.Mesh(pane(w, h), gm); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); });
  const topP = new THREE.Mesh(pane(w, w), gm); topP.rotation.x = -Math.PI / 2; topP.position.y = h; g.add(topP);
  const fm = makeMaterial('brass'), t = .07, bar = (L, axis, x, y, z) => { const geo = axis === 'y' ? new THREE.BoxGeometry(t, L, t) : axis === 'x' ? new THREE.BoxGeometry(L, t, t) : new THREE.BoxGeometry(t, t, L); const m = new THREE.Mesh(geo, fm); m.position.set(x, y, z); m.castShadow = false; g.add(m); };
  const s = w / 2;
  [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(([x, z]) => bar(h, 'y', x, h / 2, z));
  [h, t / 2].forEach(y => { bar(w + t, 'x', 0, y, s); bar(w + t, 'x', 0, y, -s); bar(w + t, 'z', s, y, 0); bar(w + t, 'z', -s, y, 0); });
  g.traverse(o => { o.userData.noInk = true; o.raycast = () => {}; if (o.isMesh && o.material === gm) { o.renderOrder = 20; o.castShadow = false; } }); scene.add(g); return g;
}

const LOOKS = {
  studio: { punch: .45, contrast: 1.12, sat: 1.04, vignette: .36, grain: .028, warm: .018, exposure: 1.0, bloomThreshold: 2.2, bloom: .22, tilt: 1 },
  lab: { punch: .4, bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.1, sat: 1.02, vignette: .32, grain: .025, warm: .0, exposure: 1.0 },
  landscape: { punch: .9, bloomThreshold: 9, bloom: .2, tilt: .8, contrast: 1.04, sat: 1.04, vignette: .28, grain: .022, warm: .01 },
  cosmos: { punch: .4, bloomThreshold: 1.6, bloom: .26, contrast: 1.1, sat: 1.05, vignette: .4, grain: .03, warm: 0, exposure: 1.0 },
  micro: { punch: .4, bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.08, sat: 1.06, vignette: .38, grain: .03, warm: 0, exposure: 1.0 },
  abstract: { punch: .35, bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.1, sat: 1.0, vignette: .34, grain: .025, warm: 0, exposure: 1.0 },
  ocean: { punch: .8, bloomThreshold: 9, bloom: .2, contrast: 1.06, sat: 1.06, vignette: .26, grain: .02, warm: .01, exposure: .95 },
  desk: { punch: .45, contrast: 1.12, sat: 1.04, vignette: .4, grain: .028, warm: .03, exposure: 1.0, bloomThreshold: 1.8, bloom: .26, tilt: 1 },
  night: { punch: .35, bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.12, sat: 1.0, vignette: .42, grain: .035, warm: 0, exposure: 1.05 }
};

// A writing desk: a long walnut top whose front edge runs out of the frame (the foreground plane), lit by a brass
// desk lamp standing on it. The lamp's spot IS the key light (it starts at the bulb), so shadows fall away from a
// light you can see.
function desk(scene, { w = 18, d = 11, lampAt = [-5.4, -3.4], aim = [.6, 1.1, .2] } = {}) {
  const g = new THREE.Group(); g.name = 'desk'; g.userData.decorBase = true;
  const W = woodSet('walnut'), tile = 2.4, rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const topM = surface(new THREE.MeshPhysicalMaterial({ map: rep(W.map, 1, 1), normalMap: rep(W.normalMap, 1, 1), roughnessMap: rep(W.roughnessMap, 1, 1), normalScale: new THREE.Vector2(.3, .3), roughness: .66, clearcoat: .3, clearcoatRoughness: .4, envMapIntensity: .5, color: 0xffffff }), { box: false, macro: [.35, .09, .25], detail: [3.1, .35] });
  const top = new THREE.Mesh(alignUV(new THREE.BoxGeometry(w, .5, d), tile), topM); top.position.y = -.25; top.receiveShadow = true; top.name = 'walnut desk top'; g.add(top);
  const blotM = makeMaterial({ preset: 'leather', color: '#2c3a2a' }); blotM.roughness = .85; blotM.clearcoat = 0; blotM.normalScale.set(.25, .25);
  const blot = new THREE.Mesh(new THREE.PlaneGeometry(w * .62, d * .7), blotM); blot.rotation.x = -Math.PI / 2; blot.position.set(.4, .004, .2); blot.receiveShadow = true; blot.name = 'leather blotter'; g.add(blot);
  // brass desk lamp: weighted base, two arms, a cone shade with the bulb inside
  const L = new THREE.Group(); L.name = 'desk lamp'; const brass = makeMaterial('brass'); brass.roughness = .42; const dark = makeMaterial({ preset: 'plastic', color: '#1c3a2c', roughness: .35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.55, .62, .14, 48), brass); base.position.y = .07; base.castShadow = true; L.add(base);
  const P0 = new THREE.Vector3(0, .14, 0), P1 = new THREE.Vector3(.35, 2.6, .2), head = new THREE.Vector3(1.6, 3.7, 1.0);
  const arm = (a, b) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, a.distanceTo(b), 12), brass); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; L.add(m); };
  arm(P0, P1); arm(P1, head); const knuckle = new THREE.Mesh(new THREE.SphereGeometry(.08, 16, 12), brass); knuckle.position.copy(P1); L.add(knuckle);
  L.position.set(lampAt[0], 0, lampAt[1]); scene.add(L); L.updateMatrixWorld(true);
  const headW = L.localToWorld(head.clone()), aimV = new THREE.Vector3(...aim), axis = aimV.clone().sub(headW).normalize();
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.16, .62, .7, 40, 1, true), dark); shade.material.side = THREE.DoubleSide; shade.castShadow = true;
  const sh = new THREE.Group(); sh.position.copy(head); sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis); L.add(sh); shade.position.y = -.2; sh.add(shade);
  // the lamp head must read as a light without being the brightest thing in the frame: the shade's lining and the
  // bulb stay below the bloom threshold and are tone-mapped (AgX rolls them off), the glow is a faint halo
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(.155, .6, .69, 40, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(.62, .5, .36), side: THREE.BackSide })); inner.position.y = -.2; sh.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.28, .95) })); bulb.position.y = -.38; sh.add(bulb);
  const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(), color: 0xffd9a0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false })); glowS.scale.setScalar(.95); glowS.position.y = -.5; sh.add(glowS);
  L.traverse(o => { o.userData.noInk = true; if (o.isMesh) o.receiveShadow = true; }); g.traverse(o => { o.userData.noInk = true; });
  L.userData.decorBase = true; scene.add(g);
  L.updateMatrixWorld(true); const bulbW = bulb.getWorldPosition(new THREE.Vector3()).addScaledVector(axis, .25);
  return { g, lamp: L, bulbW, aim: aimV };
}
function moonDisc(scene, dir) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(58, 56, 4, 64, 64, 62); gr.addColorStop(0, '#f6f3ea'); gr.addColorStop(.7, '#d8d4ca'); gr.addColorStop(.96, '#b8b4ac'); gr.addColorStop(1, 'rgba(180,176,170,0)'); x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  const r = mulberry(8); for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(120,118,112,${.12 + r() * .2})`; x.beginPath(); x.arc(30 + r() * 68, 30 + r() * 68, 3 + r() * 12, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(1.8, 1.8, 1.9), depthWrite: false, fog: false, toneMapped: false })); m.position.copy(dir).multiplyScalar(90); m.scale.setScalar(7);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(), color: 0x8fa0d0, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.position.copy(m.position); halo.scale.setScalar(26);
  m.userData.noInk = halo.userData.noInk = true; scene.add(halo, m); return m;
}

export function setupEnvironment(scene, gfx, env = {}) {
  const R = { gfx, input: Object.assign({}, env) };
  buildEnvironment(R, scene, gfx, env); R.key = JSON.stringify(env);
  scene.userData.envR = R; return R;
}
// A built-in model may choose the setting that suits its subject (an orbit in space, a wave over the sea). The
// author's explicit choice (spec.environment.preset) always wins. Rebuilds with the same choice cost nothing.
export function useEnvironment(scene, preset, opts = {}, spec = null) {
  const R = scene && scene.userData.envR; if (!R) return null;
  if (spec && spec.environment && spec.environment.preset) return R;
  const want = Object.assign({}, R.input, opts, { preset }), key = JSON.stringify(want);
  if (R.key === key) return R;
  (R.objects || []).forEach(o => { o.removeFromParent(); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) [].concat(m.material).forEach(x => x.dispose()); }); if (o.dispose && o.isLight) o.dispose(); });
  scene.fog = null; scene.background = null; delete scene.userData.aaaAtmos;
  for (const k of Object.keys(R)) if (k !== 'gfx' && k !== 'input') delete R[k];
  buildEnvironment(R, scene, R.gfx, want); R.key = key; return R;
}
function buildEnvironment(R, scene, gfx, env) {
  const before = new Set(scene.children);
  const preset = ENV_PRESETS.includes(env.preset) ? env.preset : 'studio';
  Object.assign(R, { preset, update() {}, base: null, sun: null, bgObjects: [] });
  resetWeather(); delete scene.userData.aaaAtmos; delete scene.userData.aaaWet;
  const nC = AAA.Q.cascades, atmos = o => { R.atmos = Object.assign({ sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), amb: new THREE.Color(), density: .01, height: 2, base: 0, g: .76, rayleigh: .25, maxDist: 150, skyFog: .3, god: .4 }, o); scene.userData.aaaAtmos = R.atmos; };
  scene.environment = gfx.envFor ? gfx.envFor(preset === 'desk' ? 'studio' : preset) : gfx.envStudio; scene.environmentIntensity = .85;
  scene.userData.look = Object.assign({}, LOOKS[preset]);
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x2a1d10, .25); scene.add(hemi); R.hemi = hemi;
  const showBase = env.base !== false;
  switch (preset) {
    case 'studio': case 'lab': {
      const lab = preset === 'lab';
      scene.background = bgGradient(lab ? '#2c3036' : '#3b2c1f', lab ? '#0e1013' : '#140e09'); scene.fog = new THREE.Fog(lab ? 0x0a0c0f : 0x0b0806, 30, 70);
      R.sun = spotKey(scene, { color: lab ? 0xf4f6ff : 0xffe6c8, pos: [7, 12, 6.5] });                         // key: high front-right spot, a soft pool of light on the plinth
      R.fill = dirLight(scene, lab ? 0xdfe8ff : 0xcfdcff, .35, [-9, 5, 5]);                                        // fill: large, cool, left (≈ 1:10 of key)
      R.rim = dirLight(scene, lab ? 0xffffff : 0xfff0dc, 2.0, [-4, 7, -10]);                                     // rim: behind, separates silhouettes
      hemi.intensity = .15; scene.environmentIntensity = .75;
      R.kick = dirLight(scene, 0xffd6a0, .6, [10, 3, -7]);                                                         // warm kicker, back-right
      if (showBase) R.base = plinth(scene, lab ? { felt: '#20262c' } : {});
      R.motes = motes(scene);
      break;
    }
    case 'desk': {
      scene.background = bgGradient('#33251a', '#0d0907'); scene.fog = new THREE.Fog(0x0d0907, 24, 60);
      const dk = desk(scene, env.lamp ? { lampAt: env.lamp } : {}); R.base = dk.g; R.lamp = dk.lamp;
      const d = dk.bulbW.distanceTo(dk.aim);
      R.sun = new THREE.SpotLight(0xffd8a8, 3.4 * d * d, 0, .78, .55, 2); R.sun.position.copy(dk.bulbW); R.sun.castShadow = true; R.sun.shadow.mapSize.set(2048, 2048);
      R.sun.shadow.camera.near = .3; R.sun.shadow.camera.far = d + 14; R.sun.shadow.bias = -.0001; R.sun.shadow.normalBias = .02; R.sun.shadow.radius = 3;
      scene.add(R.sun); scene.add(R.sun.target); R.sun.target.position.copy(dk.aim);
      R.fill = dirLight(scene, 0xb8c8e8, .22, [8, 4, 7]);                                                           // cool spill from a window off-frame right
      R.rim = dirLight(scene, 0xffe2c0, 1.2, [3, 6, -10]);
      hemi.intensity = .08; scene.environmentIntensity = .45; R.motes = motes(scene, 0xffd9a8, 90, [10, 6, 8]);
      break;
    }
    case 'landscape': {
      const sky = new Sky(); sky.scale.setScalar(450); sky.userData.noInk = true; scene.add(sky); R.sky = sky; R.bgObjects.push(sky);
      const u = sky.material.uniforms; u.turbidity.value = 3; u.rayleigh.value = 2.4; u.mieCoefficient.value = .005; u.mieDirectionalG.value = .8;
      R.sun = sunRig(scene, { intensity: 3.6 }); scene.fog = R.fog = new THREE.Fog(0xc9d6e2, 45, 220); scene.environmentIntensity = .55;
      hemi.color.set(0xbcd4f0); hemi.groundColor.set(0x4a4030); hemi.intensity = .45;
      cascadeRig(scene, R, nC); atmos({ density: .012, height: 2.2, base: -1, g: .76, rayleigh: .3, maxDist: 160, skyFog: .22, god: .45 });
      const ground = new THREE.Color(.1, .12, .06);   // meadow albedo (linear)
      R.rim = dirLight(scene, 0xdde8ff, .5, [-6, 5, -9]);
      const sunV = new THREE.Vector3();
      R.update = (t, p = {}) => {
        const hour = p.hour ?? p.time ?? env.time ?? 10, elev = Math.sin((hour - 6) / 12 * Math.PI) * 62, az = (hour - 12) / 12 * 140 + (env.azimuth ?? 0);
        const phi = THREE.MathUtils.degToRad(90 - elev), th = THREE.MathUtils.degToRad(az); sunV.setFromSphericalCoords(1, phi, th);
        u.sunPosition.value.copy(sunV); R.sun.position.copy(sunV).multiplyScalar(30); const day = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
        const storm = Math.min(1, Math.max(0, p.storm ?? p.cloud ?? 0));
        // sun colour and strength from its elevation (Weatherglass World._updateLight): white-warm → gold below
        // sin(el) = .42 → red near the horizon; I = 4.6·smoothstep(−.035, .07, y)·(.68 + .32·smoothstep(.1, .55, y))
        const y = Math.max(-.1, sunV.y), sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        R.sun.intensity = 4.4 * sm(-.035, .07, y) * (.68 + .32 * sm(.1, .55, y)) * (1 - storm * .75); hemi.intensity = .2 + day * .45 * (1 - storm * .5);
        _c1.setRGB(1, .43, .2).lerp(_c2.setRGB(1, .68, .38), sm(.0, .14, y)); R.sun.color.copy(_c1).lerp(_c2.setRGB(1, .94, .86), sm(.2, .45, y)); u.rayleigh.value = 2.2 + storm * 2; u.turbidity.value = 2.5 + storm * 14;
        gfx.renderer.toneMappingExposure = (.62 + day * .4) * (env.exposure ?? 1);   // a little brighter than AgX base: the grade's punch look restores the contrast R.fog.color.setHSL(.58, .2 * (1 - storm), .15 + .55 * day * (1 - storm * .6));
        R.skyTint = _sky; placeCascades(R); skyBounce(R, ground, .15, storm);
        if (R.atmos) { R.atmos.density = .012 + storm * .03; R.atmos.god = .45 * (1 - storm * .8); }
      };
      if (showBase) R.base = plinth(scene, { felt: env.felt || '#3e4c2c', turf: env.turf !== false });
      break;
    }
    case 'cosmos': {
      scene.background = new THREE.Color(0x020308); scene.environmentIntensity = .35; hemi.intensity = .04;
      R.stars = stars(scene); R.bgObjects.push(R.stars); R.sun = sunRig(scene, { intensity: .5, color: 0xbcc8ff });
      R.rim = dirLight(scene, 0x6a80ff, .35, [-8, 3, -8]);
      if (env.base) R.base = plinth(scene, { felt: '#0b0d18' });
      break;
    }
    case 'micro': {
      scene.background = bgGradient('#0f3a3a', '#03100f'); scene.fog = new THREE.FogExp2(0x062020, .03); scene.environmentIntensity = .7; hemi.color.set(0x9fe8d8); hemi.groundColor.set(0x0a2020); hemi.intensity = .45;
      R.sun = sunRig(scene, { intensity: 2.0, color: 0xd8fff0, pos: [3, 14, 4] }); R.motes = motes(scene, 0x9fffe0, 400, [16, 10, 16]);
      R.rim = dirLight(scene, 0x7fffd8, 1.2, [-6, 4, -8]);
      if (env.base) R.base = plinth(scene, { felt: '#0d2a28' });
      break;
    }
    case 'abstract': {
      scene.background = bgGradient('#1c2438', '#070a12'); scene.fog = new THREE.Fog(0x070a12, 30, 70);
      R.sun = sunRig(scene, { intensity: 2.6, color: 0xf0f4ff }); hemi.color.set(0xc8d8ff); hemi.groundColor.set(0x101420);
      R.fill = dirLight(scene, 0xb8c8ff, .5, [-9, 4, 6]); R.rim = dirLight(scene, 0xffffff, 1.4, [-3, 7, -10]);
      const grid = new THREE.GridHelper(40, 40, 0x3a5a8a, 0x1a2438); grid.userData.noInk = true; grid.position.y = -1.01; scene.add(grid);
      if (showBase) R.base = plinth(scene, { felt: '#111827', brass: false });
      break;
    }
    case 'ocean': {
      // env.sun: direction of the sun (the sky's bright spot and the key light agree)
      const sd = new THREE.Vector3(...(env.sun || [.4, .25, -1])).normalize();
      const sk = new Sky(); sk.scale.setScalar(450); scene.add(sk); sk.material.uniforms.sunPosition.value.copy(sd); sk.userData.noInk = true; R.bgObjects.push(sk); R.sky = sk;
      R.sun = sunRig(scene, { intensity: 3, pos: sd.clone().multiplyScalar(15).toArray() }); scene.fog = new THREE.Fog(0xa8c4d8, 25, 120); hemi.intensity = .4;
      cascadeRig(scene, R, nC); atmos({ density: .014, height: 3, base: -.6, g: .8, rayleigh: .3, maxDist: 140, skyFog: .25, god: .5 });
      skyBounce(R, new THREE.Color(.03, .06, .08), .15); const sea0 = R.update; R.update = (t, p) => { sea0(t, p); skyBounce(R, new THREE.Color(.03, .06, .08), .15); };
      // open sea: an opaque, glossy dielectric (no transmission: a 200 m transmissive plane re-renders the whole scene and
      // shows displaced ghost copies of everything above it); ripples come from the normal map, depth from the dark colour
      const seaM = makeMaterial({ preset: 'water', color: '#1d5a78' }); seaM.transmission = 0; seaM.thickness = 0; seaM.color.set(0x0f3448); seaM.roughness = .14; seaM.metalness = 0; seaM.envMapIntensity = 1.0; if (seaM.normalMap) { seaM.normalMap = seaM.normalMap.clone(); seaM.normalMap.repeat.set(40, 40); seaM.normalMap.needsUpdate = true; seaM.normalScale.set(.35, .35); }
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1), seaM); sea.rotation.x = -Math.PI / 2; sea.position.y = -.6; sea.userData.noInk = true; scene.add(sea); R.sea = sea;
      break;
    }
    case 'night': {
      scene.background = bgGradient('#141a2a', '#03040a'); R.stars = stars(scene, 1200); R.bgObjects.push(R.stars); scene.environmentIntensity = .45; hemi.color.set(0x6070a0); hemi.intensity = .15;
      // env.moon: direction of a visible moon; the key light then comes from it
      const md = new THREE.Vector3(...(env.moon || [-6, 10, 4])).normalize();
      R.sun = sunRig(scene, { intensity: .9, color: 0xaabbff, pos: md.clone().multiplyScalar(13).toArray() });
      if (env.moon) { R.moon = moonDisc(scene, md); R.bgObjects.push(R.moon); }
      cascadeRig(scene, R, nC); atmos({ density: .03, height: .9, base: -.2, g: .7, rayleigh: .2, maxDist: 90, skyFog: .15, god: .15 });
      R.skyTint = new THREE.Color(.35, .42, .7); R.nightFloor = .1;   // moonlit sky + airglow: night skylight does not vanish with a low moon
      skyBounce(R, new THREE.Color(.09, .09, .08), .25, 0, R.nightFloor); R.update = () => { skyBounce(R, new THREE.Color(.09, .09, .08), .25, 0, R.nightFloor); };
      R.fill = dirLight(scene, 0xffb070, .35, [8, 3, 6]); R.rim = dirLight(scene, 0x8fa8ff, .8, [2, 6, -10]);
      if (showBase) R.base = plinth(scene);
      break;
    }
  }
  if (R.base) R.contact = contactShadows(scene, gfx);
  if (env.glassCase) R.glassCase = glassCase(scene, env.caseW || 13, env.caseH || 8);
  const prevUpdate = R.update;
  R.update = (t, p, dt) => {
    prevUpdate(t, p);
    if (R.motes) { const a = R.motes.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .08; if (y > R.motes.userData.motes.area[1]) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * .3 + i) * .0015); } a.needsUpdate = true; }
    if (R.stars) R.stars.rotation.y += dt * .004;
    if (R.contact) R.contact.update();
    // weather written by a model or a scene's code: { g: global wetness, x, z, r, a: wet spot, rain: 0..1 }
    const w = scene.userData.aaaWet; if (w) { const u = AAA.uniforms; if (w.g != null) u.uAaaWet.value = w.g; if (w.rain != null) u.uAaaRain.value = w.rain; if (w.a != null) u.uAaaWetSpot.value.set(w.x || 0, w.z || 0, w.r || 1, w.a); }
  };
  R.objects = scene.children.filter(o => !before.has(o));
  return R;
}
