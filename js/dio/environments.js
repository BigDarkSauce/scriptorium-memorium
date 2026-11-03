// Scene-dependent lighting presets: each sets background, IBL, key/fill/rim lights, fog, the display base and ambient particles.
// update(t, params) lets presets respond to time-of-day or simulation parameters (sun height, storm darkness…).
//  • IBL: a procedural HDR-like environment per preset (softboxes for studio/lab, sky dome + sun for outdoors),
//    so glass and polished metal have something to reflect (gfx.envFor).
//  • Shadows: one PCF-soft key light whose orthographic shadow camera is fitted to the plinth (2048², normal bias),
//    plus real-time CONTACT SHADOWS: the world is rendered from below into a small depth-darkness target, blurred,
//    and laid on the plinth top, so every object (moving ones too) sits on a soft occlusion pool.
//  • The plinth is a turned, varnished walnut base with a baize top and a brass inlay; the optional glass case is
//    thin-shell glass in a slim brass frame.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { canvasTex } from '../gfx/textures.js';
import { makeMaterial, thinGlass } from '../gfx/materials.js';
import { woodSet, feltSet } from '../gfx/proc.js';
import { mulberry } from '../util.js';

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
// Studio key as a spotlight: inverse-square falloff and a wide penumbra give the light pool of a product photograph.
function spotKey(scene, { color = 0xffe6c8, pos = [7, 12, 6.5], lux = 3.6, angle = .62, map = 2048 } = {}) {
  const d = Math.hypot(pos[0], pos[1] - 1.2, pos[2]), s = new THREE.SpotLight(color, lux * d * d, 0, angle, .75, 2); s.position.set(...pos); s.castShadow = true;
  s.shadow.mapSize.set(map, map); s.shadow.camera.near = d - 9; s.shadow.camera.far = d + 9; s.shadow.bias = -.00008; s.shadow.normalBias = .02; s.shadow.radius = 2;
  scene.add(s); scene.add(s.target); s.target.position.set(0, 1.2, 0); return s;
}
function dirLight(scene, color, intensity, pos) { const l = new THREE.DirectionalLight(color, intensity); l.position.set(...pos); scene.add(l); scene.add(l.target); l.target.position.set(0, 1.5, 0); return l; }
function cloneRep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

// Turned walnut plinth: ogee/bead profile, baize top inset, brass inlay ring. Top surface stays at y = 0.
function plinth(scene, { r = 7.2, felt = '#1d3125', brass = true } = {}) {
  const g = new THREE.Group(); g.name = 'display base'; g.userData.decorBase = true;
  const W = woodSet('plinth'), rim = .34, prof = [];
  const arc = (cx, cy, rad, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; prof.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)); } };
  prof.push(new THREE.Vector2(r - rim, -.02), new THREE.Vector2(r - rim + .02, .0));
  prof.push(new THREE.Vector2(r - .12, .0)); arc(r - .12, -.12, .12, Math.PI / 2, 0, 8);        // bullnose top edge
  prof.push(new THREE.Vector2(r, -.2)); arc(r - .02, -.32, .1, .3, -Math.PI / 2 + .2, 8);        // cove
  arc(r + .05, -.5, .08, Math.PI / 2, -Math.PI / 2, 10);                                          // bead
  prof.push(new THREE.Vector2(r + .06, -.62), new THREE.Vector2(r + .1, -.82)); arc(r + .18, -.86, .1, Math.PI * .9, Math.PI * 1.5, 6); // flared foot
  prof.push(new THREE.Vector2(r + .34, -.96), new THREE.Vector2(r + .34, -1.0), new THREE.Vector2(.01, -1.0));
  const woodM = new THREE.MeshPhysicalMaterial({ map: cloneRep(W.map, 8, 1), normalMap: cloneRep(W.normalMap, 8, 1), roughnessMap: cloneRep(W.roughnessMap, 8, 1), normalScale: new THREE.Vector2(.3, .3), roughness: .7, clearcoat: .85, clearcoatRoughness: .12, color: 0xffffff });
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 160), woodM); base.receiveShadow = true; base.castShadow = false; base.name = 'walnut base'; g.add(base);
  const F = feltSet(), feltM = new THREE.MeshPhysicalMaterial({ map: cloneRep(F.map, 10, 10), normalMap: cloneRep(F.normalMap, 10, 10), normalScale: new THREE.Vector2(.5, .5), color: new THREE.Color(felt), roughness: 1, sheen: .6, sheenRoughness: .75, sheenColor: new THREE.Color(felt).lerp(new THREE.Color(0xffffff), .12), envMapIntensity: .6 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(r - rim + .01, 128), feltM); top.rotation.x = -Math.PI / 2; top.position.y = .002; top.receiveShadow = true; top.name = 'baize'; g.add(top);
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
  const gm = thinGlass({ absorb: .012, edge: .55, env: 1.1, card: .07 }), pane = (pw, ph) => new THREE.PlaneGeometry(pw, ph);
  [[0, h / 2, w / 2, 0], [0, h / 2, -w / 2, Math.PI], [w / 2, h / 2, 0, Math.PI / 2], [-w / 2, h / 2, 0, -Math.PI / 2]].forEach(([x, y, z, ry]) => { const m = new THREE.Mesh(pane(w, h), gm); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); });
  const topP = new THREE.Mesh(pane(w, w), gm); topP.rotation.x = -Math.PI / 2; topP.position.y = h; g.add(topP);
  const fm = makeMaterial('brass'), t = .07, bar = (L, axis, x, y, z) => { const geo = axis === 'y' ? new THREE.BoxGeometry(t, L, t) : axis === 'x' ? new THREE.BoxGeometry(L, t, t) : new THREE.BoxGeometry(t, t, L); const m = new THREE.Mesh(geo, fm); m.position.set(x, y, z); m.castShadow = false; g.add(m); };
  const s = w / 2;
  [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(([x, z]) => bar(h, 'y', x, h / 2, z));
  [h, t / 2].forEach(y => { bar(w + t, 'x', 0, y, s); bar(w + t, 'x', 0, y, -s); bar(w + t, 'z', s, y, 0); bar(w + t, 'z', -s, y, 0); });
  g.traverse(o => { o.userData.noInk = true; o.raycast = () => {}; if (o.isMesh && o.material === gm) { o.renderOrder = 20; o.castShadow = false; } }); scene.add(g); return g;
}

const LOOKS = {
  studio: { contrast: 1.12, sat: 1.04, vignette: .36, grain: .028, warm: .018, exposure: 1.0, bloomThreshold: 2.2, bloom: .22, tilt: 1 },
  lab: { bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.1, sat: 1.02, vignette: .32, grain: .025, warm: .0, exposure: 1.0 },
  landscape: { bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.08, sat: 1.08, vignette: .28, grain: .022, warm: .01 },
  cosmos: { bloomThreshold: 1.6, bloom: .26, contrast: 1.1, sat: 1.05, vignette: .4, grain: .03, warm: 0, exposure: 1.0 },
  micro: { bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.08, sat: 1.06, vignette: .38, grain: .03, warm: 0, exposure: 1.0 },
  abstract: { bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.1, sat: 1.0, vignette: .34, grain: .025, warm: 0, exposure: 1.0 },
  ocean: { bloomThreshold: 1.6, bloom: .26, contrast: 1.06, sat: 1.06, vignette: .26, grain: .02, warm: .01, exposure: .95 },
  night: { bloomThreshold: 1.6, bloom: .26, tilt: .8, contrast: 1.12, sat: 1.0, vignette: .42, grain: .035, warm: 0, exposure: 1.05 }
};

export function setupEnvironment(scene, gfx, env = {}) {
  const preset = ENV_PRESETS.includes(env.preset) ? env.preset : 'studio';
  const R = { preset, update() {}, base: null, sun: null, bgObjects: [] };
  scene.environment = gfx.envFor ? gfx.envFor(preset === 'desk' ? 'studio' : preset) : gfx.envStudio; scene.environmentIntensity = .85;
  scene.userData.look = Object.assign({}, LOOKS[preset === 'desk' ? 'studio' : preset]);
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x2a1d10, .25); scene.add(hemi); R.hemi = hemi;
  const showBase = env.base !== false;
  switch (preset) {
    case 'studio': case 'lab': case 'desk': {
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
    case 'landscape': {
      const sky = new Sky(); sky.scale.setScalar(450); sky.userData.noInk = true; scene.add(sky); R.sky = sky; R.bgObjects.push(sky);
      const u = sky.material.uniforms; u.turbidity.value = 3; u.rayleigh.value = 2.4; u.mieCoefficient.value = .005; u.mieDirectionalG.value = .8;
      R.sun = sunRig(scene, { intensity: 3.6 }); scene.fog = R.fog = new THREE.Fog(0xc9d6e2, 45, 220); scene.environmentIntensity = .55;
      hemi.color.set(0xbcd4f0); hemi.groundColor.set(0x4a4030); hemi.intensity = .45;
      R.rim = dirLight(scene, 0xdde8ff, .5, [-6, 5, -9]);
      const sunV = new THREE.Vector3();
      R.update = (t, p = {}) => {
        const hour = p.hour ?? p.time ?? env.time ?? 10, elev = Math.sin((hour - 6) / 12 * Math.PI) * 62, az = (hour - 12) / 12 * 140;
        const phi = THREE.MathUtils.degToRad(90 - elev), th = THREE.MathUtils.degToRad(az); sunV.setFromSphericalCoords(1, phi, th);
        u.sunPosition.value.copy(sunV); R.sun.position.copy(sunV).multiplyScalar(30); const day = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
        const storm = Math.min(1, Math.max(0, p.storm ?? p.cloud ?? 0));
        R.sun.intensity = 4 * Math.pow(day, .6) * (1 - storm * .75); hemi.intensity = .2 + day * .45 * (1 - storm * .5);
        R.sun.color.setHSL(.08 + .05 * day, .6 - .3 * day, .55 + .2 * day); u.rayleigh.value = 2.2 + storm * 2; u.turbidity.value = 2.5 + storm * 14;
        gfx.renderer.toneMappingExposure = .55 + day * .35; R.fog.color.setHSL(.58, .2 * (1 - storm), .15 + .55 * day * (1 - storm * .6));
      };
      if (showBase) R.base = plinth(scene, { felt: '#3e4c2c' });
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
      const sky = new Sky(); sky.scale.setScalar(450); scene.add(sky); sky.material.uniforms.sunPosition.value.set(.4, .25, -1); sky.userData.noInk = true; R.bgObjects.push(sky);
      R.sun = sunRig(scene, { intensity: 3, pos: [8, 6, -12] }); scene.fog = new THREE.Fog(0xa8c4d8, 25, 120); hemi.intensity = .4;
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1), makeMaterial({ preset: 'water', color: '#1d5a78' })); sea.rotation.x = -Math.PI / 2; sea.position.y = -.6; sea.userData.noInk = true; scene.add(sea);
      break;
    }
    case 'night': {
      scene.background = bgGradient('#141a2a', '#03040a'); R.stars = stars(scene, 1200); R.bgObjects.push(R.stars); scene.environmentIntensity = .45; hemi.color.set(0x6070a0); hemi.intensity = .15;
      R.sun = sunRig(scene, { intensity: .9, color: 0xaabbff, pos: [-6, 10, 4] });
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
  };
  return R;
}
