# Weatherglass: reverse-engineering report

Source: `artifact-e8f582aa-1793293938-cc4b.html` (1.49 MB). It is a Vite single-file bundle: an inline `<style>` (about 26 KB of HUD CSS), then one `<script type="module">` (about 1.46 MB).

After running prettier, the script is about 66,350 lines:
- Lines 1 to about 35,830 are three.js r186, minified.
- Lines 35,830 to 36,770 are three.js addons: EffectComposer, ShaderPass, UnrealBloomPass and OutputPass.
- The app code runs from about line 35,833 (`N = {halfW…}`) to the end.

A prettified copy is in the scratchpad: `/tmp/claude-0/-home-claude/c61ae887-f2bc-5616-8c17-4937082f620d/scratchpad/wg/app.pretty.js` and `app.pretty.css`. Line numbers below refer to that copy.

**How to read the code:** the GLSL comments survived bundling. They are the best documentation of intent, so reading them directly is worth it. Minified names map to three.js through the export table (for example `fi` = MeshStandardMaterial, `Fa` = MeshPhysicalMaterial, `he` = ShaderMaterial, `Fn` = InstancedMesh, `$e` = InstancedBufferAttribute, `ws` = CustomBlending, `sc` = ACESFilmicToneMapping, `ga` = PCFShadowMap). The full map is in `scratchpad/wg/map.txt`.

---

## 1. Architecture

### World constants (one unit is roughly one decimetre of diorama)

```js
N  = { halfW: 6, halfD: 4, bottomY: -1.8, topY: 7.4, glass: 0.08 }   // interior of the glass box
on = { minY: 4.5, maxY: 6.5, defaultY: 5.5 }                          // cloud layer
Ui = { lakeLevel: 0.1, maxRise: 0.28 }
mr = { radius: 11.5, center: [0,0.5,0], yaw: -0.55 }                  // sun/moon orbit (outside the box)
ur = { lapse: 5, seasonBase: [12,24,10,-7], dayNightSwing: 4.5 }     // °C model
Ef = ["hand","wind","cloud","fog","wipe"]                             // tools
```

### Boot (`dL()`, end of the file)

1. Patch the three.js ShaderChunks.
2. Detect the quality tier.
3. Create the WebGLRenderer, Scene and `PerspectiveCamera(34, aspect, 0.1, 250)`.
4. Create the `CameraRig` and the `EventBus`.
5. Create `World`, the baked terrain data texture, the `WindField` and the `GroundFields`.
6. Build a shared context object `ctx`:
   ```
   {scene, camera, cameraRig, renderer, events, quality, world, wind, fields, terrain,
    uniforms: ke, GLSL_COMMON, precip:{sources:[]}, modules:{}, …}
   ```
7. Create `Input`, the wind tool, `Lights` and `Post`.
8. Instantiate the modules in a fixed order:
   ```js
   ud = [["audio",fL],["sky",D4],["terrain",XE],["water",RC],["vegetation",MR],["life",gz],
         ["clouds",Pz],["precipitation",iP],["fog",pP],["glass",a4],["hud",FP]]
   ```

Each module is a class `new M(ctx)` with optional `update(dt,t)`, `beforeRender(dt,t)` and `resize()`. If a module throws during construction or update, it is disabled and logged; the app keeps running without it. The loop also records which scene children each module added, so `__wg.setVisible(name,bool)` can toggle them.

### Loop

```
rAF → dt = min(real, 1/20) → quality.sample(realDt)
  sim(dt):  world.update; wind.update; input.update; cameraRig.update;
            precip.sources.length = 0
            for module in order: (before "precipitation": fields.deposit(all sources); fields.update)
                                 module.update(dt, t)
            world.rainfall/snowfall = Σ source.rate split by snowFractionAt(height)
            lights.update(dt); updateSharedUniforms(ctx)   // KT()
  render:   module.beforeRender…; post.render()
```

The two layers communicate as follows:
- **Events** (string bus): for example `cloud:grab`, `cloud:squeeze`, `cloud:merge`, `lightning`, `thunder`, `wind:stroke`, `glass:wipe`, `tool`, `scenario`, `hud:hint`, `sky:grab`, `season`, `tap` and `key`. Audio, the HUD and the coach only listen.
- **Shared uniform bag** `ke`: about 40 uniforms that every custom shader merges in.

### Shared GLSL (`GLSL_COMMON`, line 38464)

Every custom or patched shader is prefixed with one string that declares all the world uniforms plus helpers:
- `fieldUV(xz)`
- `wgHash`, `wgNoise`, `wgNoise3`, `wgFbm`
- `windAt(xz)` (wind field texture plus travelling gust noise)
- `windTurbAt`
- `groundAt(xz)` (snow, wet, rainNow, frost)
- `snowCover(xz,n)`
- `terrainAt(xz)` (height, river, lake, slope)
- `cloudShadowAt(wp)`
- `temperatureAt(y)`
- `applyHaze(col,d,y)`

### Global state

`World` (`bE`, line 38865) holds season (0..4, float), timeOfDay (0..1), tempOffset, humidity, storminess, cloudCover, rainfall, snowfall, flash, waterRise, fog, wetness and snowCover. It derives sunDir, moonDir, lightDir, lightColor, lightIntensity, skyColor, groundColor, ambientIntensity, hazeColor, roomColor, the seasonal palette and the °C values.

### Scenarios and debug hooks

URL presets (`?scenario=`) are calm, rain, storm, snow, mountainsnow, fog, autumn, night and dusk.

Other URL params: `season`, `time`, `temp`, `tool`, `cam`, `ui=0`, `quality=low|medium|high`, `warm=<sec>` (pre-simulates), `paused` and `stats`.

`window.__wg` exposes `{scenario, simulate(sec), camera(preset), profile(), setVisible}`.

---

## 2. Rendering

### Renderer (`TT`, line 36842)

```js
new WebGLRenderer({canvas, antialias:false, powerPreference:"high-performance", stencil:false})
outputColorSpace = SRGBColorSpace; toneMapping = ACESFilmicToneMapping; toneMappingExposure = 1
shadowMap.enabled = true; shadowMap.type = PCFShadowMap   // the PCF chunk is replaced (below)
setClearColor(0x0d0c0b)   // then each frame: clear colour = world.roomColor (sRGB→linear)
```

### Post chain (`ET`, line 36862)

1. Composer target: HalfFloat render target.
2. `RenderPass` with MSAA: `samples = tier==0 ? 0 : 4`. This is a custom pass that renders into a multisampled target and then copies.
3. `UnrealBloomPass(res, 0.32, 0.55, 0.92)`, updated every frame:
   - `strength = 0.3 + flash*0.9*(1-0.6*day) + night*0.25`
   - `threshold = lerp(1.45,1.0,night)*(1-golden*0.1)`
   - `radius = lerp(0.42,0.62,max(golden,night*0.7))`
4. Two separable tilt-shift blur passes (X, then Y), 5-tap Gaussian whose radius grows away from a focus band:
   ```glsl
   float d = abs(vUv.y - uFocus); float k = smoothstep(uBand, uBand+0.38, d);
   float r = k * uAmount * (uResolution.y/900.0) * 3.2;
   // weights 0.2270, 0.3162@1.3846, 0.0703@3.2308
   ```
   The amount is driven by the camera: closer and higher views get more miniature blur.
   ```js
   p = clamp((22 - radius)/12,0,1); v = smoothstep(0.35,1.05,phi)
   setTiltShift(0.47, lerp(0.24,0.17,p), lerp(0.7,0.95,p)*lerp(0.35,1,v))
   ```
5. `OutputPass`: ACES and sRGB conversion happen here.
6. "Grade" ShaderPass, which runs after the output pass (in display space):
   ```glsl
   float v = smoothstep(1.05, 0.25, length(q));  c.rgb *= mix(1.0 - uVignette, 1.0, v);   // uVignette .32
   c.rgb = c.rgb*vec3(1.01,1.0,0.985) + vec3(0.008,0.007,0.01)*(1.0-c.rgb);             // warm lift
   c.rgb += (hash-0.5) * uGrain * (1.0 - c.rgb*0.6);                                     // uGrain .035
   c.rgb += uFlash * 0.05;                                                               // lightning
   ```

### Lighting rig (`VT`, line 37767)

- **Key light:** `DirectionalLight(0xffffff, 3)`, positioned at `target + lightDir*30`. Shadow map size is `pick(1024, 2048, 4096)`, with `bias = -1.2e-4`, `normalBias = .012` and `radius = 4`.
  - **Stable shadow fitting** (`_fitShadow`): the 8 corners of the glass box, plus the 4 top corners projected along the light onto the plinth, are put in light space. The ortho bounds are rounded up to 0.5-unit steps with hysteresis and snapped to the texel grid.
  - The shadow radius is then derived from texel size: `radius = clamp(0.075/texel, 1.5, 16)`, `normalBias = texel*lerp(2.2,1.3,…)`, and `bias = -8e-5 - 25e-5*(1-clamp(L.y*2))`.
- **Fill:** `HemisphereLight(0x9ec1ff, 0x4a3b2a, 0.6)`. Its colours and intensity are overwritten each frame from World.
- **Flash:** `PointLight(0xcfd8ff, 0, 18, 1.6)`, moved to 3 units above the lightning strike end. Intensity is `flash*60`.
- **Shadows only update while the key light is on** (`lightIntensity > .02`).
- **Auto exposure:**
  ```js
  target = lerp(1,1.65,night)*(1+golden*0.22)*lerp(1,0.9,overcast*(1-night))*2^bias
  exposure → target with k = 2.5/s
  ```

### Soft shadow chunk override (`BT`, line 37711)

This replaces `getShadow(sampler2DShadow…)` in `ShaderChunk.shadowmap_pars_fragment`. It is a cheap contact-hardening variant of PCSS:
1. Take 4 Vogel-disk taps over a wide radius. If all four are lit or all four are shadowed, return early.
2. Otherwise run a "blocker height probe": re-sample with the reference depth pulled toward the light, which estimates how far away the occluder is.
3. Lerp the filter radius from 1 texel (at contact) up to `shadowRadius` (for distant occluders), then take N Vogel taps, where N = `pick(5,8,10)`. Rotation comes from `interleavedGradientNoise`.

### Time-of-day and season colour model (`World._updateLight`)

Shared terms:
```
overcast s = smoothstep(clamp(cloudCover*.55 + storm*.75))
day   = smoothstep(-.12,.12, sunY)
night = 1 - smoothstep(-.2,.02, sunY)
golden = smoothstep(-.06,.06,sunY) * (1 - smoothstep(.12,.42,sunY))
```

**Sun up** (sunY > -0.03):
```
lightColor = (1,.94,.86) → (1,.68,.38) [smoothstep(.42,0,y)]
                         → (1,.43,.2)  [smoothstep(.1,-.03,y)]
                         → (.86,.9,1)  [s*.6]
intensity = 4.6 * smoothstep(-.035,.07,y) * (0.68+0.32*smoothstep(.1,.55,y)) * lerp(1,.13,s)
```

**Moon:** colour (.42,.56,1), intensity `1*night*lerp(1,.12,s)`.

**Sky (hemisphere) colour chain:**
```
(.4,.58,1) → golden (.47,.5,.8) → twilight (.2,.22,.46) → night (.05,.075,.19)
           → overcast-day (.34,.38,.44) → overcast-night (.05,.055,.08)
```

**Haze colour chain:**
```
(.7,.8,.95) → golden (1,.62,.4)*.85 → night (.04,.06,.14) → storm (.3,.33,.38)
```

**Room** (backdrop) colour: `(.05,.045,.04) * lerp(1,.5,night)`.

**Ambient intensity:** `lerp(lerp(1.15,1.5,s), lerp(.85,.6,s), night) * lerp(1,.82,golden*(1-s))`.

**Flash** pushes sky and haze toward (.85,.88,1) and adds `+2.2*h` ambient.

**Sun direction:**
```
a = (tod-.25)*2π
dir = (cos a*.96, sin a*cos(tilt), sin a*sin(tilt)+.18)
```
The direction is then rotated by yaw -0.55. Tilt per season is `[.55,.3,.62,.92]`, so winter has a low sun. The moon direction is a skewed mirror of the sun direction.

**Season palette:** four keys, interpolated with smoothstep via `ks(table, season)`. Examples:
- grass `[[.33,.6,.2],[.33,.5,.15],[.6,.5,.2],[.46,.42,.3]]`
- foliage `[[.42,.68,.22],[.2,.42,.12],[.86,.36,.08],[.55,.3,.12]]`
- leafAmount `[.85,1,.72,0]`
- flowers `[.8,1,.15,0]`
- breeze `[.35,.2,.55,.45]`

Blossom is a bump around season 0.1. fallingLeaves is a window between seasons 1.55 and 3.

### Environment / IBL

- **Scene environment:** PMREM (`fromScene(…, 0.03)`) of a tiny procedural "dark room": a radius-20 sphere with vertex colours (floor (.05,.033,.02), walls (.034,.03,.027) → (.06,.06,.066)), plus 4 emissive `MeshBasicMaterial` planes acting as softboxes (intensities 5.5, 3, 2.2, 3).
  - `scene.environmentIntensity = lerp(0.17,0.05,night)*(1-overcast*.2) + flash*.3`.
  - The scene is therefore lit mostly by the sun and hemisphere lights; the environment adds faint studio reflections only.
- **Glass and brass studio** (`FR`, line 48173): a separate PMREM (`0.015` blur) of a room shader plus 5 analytic softboxes:
  ```
  jy = [{az:-30,el:-.02,hw:.07,hh:.82,soft:.045,i:2.6},{az:62,…,i:2},{az:156,…,i:1.5},
        {az:-124,…,i:1.4},{dir:[.12,.93,-.35],hw:.42,hh:.22,soft:.12,i:.9}]
  ```
  The same softboxes are evaluated analytically in the glass shader (`gSoftbox`, a gnomonic projection with a soft rectangle). This gives crisp, tall highlight streaks on the panes.
- **No `scene.fog`.** Depth haze comes from three places:
  - (a) `applyHaze()` in custom shaders: `k = 1-exp(-d*(0.012+storm*.02+humidity*.006))`.
  - (b) An **in-box atmosphere volume** (`M4`, line 50808): a box mesh covering the glass interior, raymarched with ATMO_STEPS `pick(5,8,12)`.
    - It stops at the terrain or lake surface (`terrainAt`).
    - It uses HG phase `mix(hg(.2),hg(.75),.12)` and samples the key-light shadow map, which produces god rays.
    - Density is art-directed to thicken past the camera focus point: `mix(0.06,1.5,smoothstep(-3,6, dot(p.xz-focus, camFwdXZ)))`.
    - Blending is premultiplied (`One, OneMinusSrcAlpha`).
  - (c) A volumetric fog module (section 4).

### Cloud shadows applied to every built-in material

`JT()` patches `ShaderChunk.lights_fragment_begin` globally:
```glsl
getDirectionalLightInfo( directionalLight, directLight );
#ifdef WG_COMMON
directLight.color *= cloudShadowAt( ( uCameraWorld * vec4( geometryPosition, 1.0 ) ).xyz );
#endif
```
- `cloudShadowAt` projects the world point along L up to the cloud layer and samples a 120×80 float texture of cloud optical depth: `exp(-tex)`.
- The CPU splats each cloud puff as a sphere-projected disk, then applies a separable 1-2-1 blur (`_syncShadows`, line 58378).
- `uCloudLayerY` is the radius-weighted mean height of the puffs.

### Custom shader inventory (key ideas)

**Terrain surface** (`zE`, line 39978). This is a `MeshStandardMaterial` with chunks replaced through `onBeforeCompile`:
- `begin_vertex`: snow lift. The vertex is raised by `min(depth,1.2)*0.05*…`.
- `map_fragment`: a procedural `terrainSurface()` supplies albedo. Inputs are:
  - terrain texture: height, river, lake, slope
  - ground fields: snow, wet, rain, frost
  - a 2D "detail mask" texture: bank, beach, bare, puddle
- Material layers: meadow with seasonal grass and mowing-streaks, bare earth, banks with pebbles (cellular), beach sand with ripple marks, layered mountain rock (strata, ridged crags, lichen, rain streaks) and lake bed.
- **Wetness** darkens and glosses: `col *= 1-wet*.5*porosity; rough → 0.3..0.62 (rock 0.2)`.
- **Puddles** form in flat, wet hollows, with roughness 0.03.
- **Rain ripples** on puddles: `tRipples` expanding rings, used to perturb the normal.
- **Snow** settles on flat tops first and is shed from steep faces. Its colour is (.55,.58,.63).
- **Frost rime** forms, but thaws on sun-facing slopes.
- **Glints:** sparkles from hashed facets at 70 cells per unit, `pow(dot(gn,H),80)`.
- **Caustics** on the lake and river bed, injected into `directDiffuse`.
- **Bump** without UVs, using Mikkelsen derivative bump mapping:
  ```glsl
  vec3 tBump(vec3 pos, vec3 n, float H){ vec3 dpx=dFdx(pos), dpy=dFdy(pos);
    vec3 r1=cross(dpy,n), r2=cross(n,dpx); float det=dot(dpx,r1);
    vec3 grad=sign(det)*(dFdx(H)*r1+dFdy(H)*r2); return normalize(abs(det)*n-grad); }
  ```
- Detail fades with pixel footprint: `fine = 1-smoothstep(.012,.05,length(fwidth(p)))`.
- `customProgramCacheKey = () => "wg-terrain-surface"`.

**Soil cross-section** (`LE`, line 40246). The "skirt" mesh forms the 4 vertical walls of the cut block, and its shader paints a geological section: bedrock beds, gravel, a clay band, loam, humus, hanging roots and a turf rim. Wetness soaks down from the top, and the section darkens with depth.

**Water** (lake, river, waterfall). Each surface uses **two-pass "multiply + add" transparency** instead of screen-space refraction:
```js
mul: {blending:CustomBlending, blendSrc:ZeroFactor, blendDst:SrcColorFactor}   // dst *= transmittance (absorption)
add: {blending:CustomBlending, blendSrc:OneFactor,  blendDst:OneFactor}        // dst += scattered + reflected light
```
- Water depth is the analytic depth from the terrain height texture. Beer-Lambert extinction is `wSigma()`, with absorption that kills red first and silt after storms.
- **Planar mirror** (`lC`): renders at `pick(.25,.34,.5)` to `pick(.34,.5,.62)` of screen resolution. It re-renders only on camera, light or level motion (`fastEvery`/`slowEvery`) and hides `userData.noReflect` objects.
- **Ripple simulation:** a GPU ping-pong half-float target of `pick(144,208,256)` × aspect resolution. It solves the wave equation:
  ```glsl
  float h = (n*0.5 - c.g) * uDamping;   // n = 4-neighbour sum, damping .988
  h *= wet*(1-ice)  // + gaussian drops from uDrops[] (rain impacts)
  gl_FragColor = vec4(h, c.r, 0, 1);
  ```
- Further features:
  - glint lobe with unresolved-slope variance (anti-aliased sun glitter)
  - shoreline foam line
  - whitecaps
  - ice that freezes from the shallows, with crack stars where the ice is knocked and wind-sculpted snow drifts
  - a meniscus band against the glass
  - a total-internal-reflection band
  - suspended motes
- The ice model lags temperature: `iceTemp → seaTemp at 0.08/s`; ice grows at `0.045*clamp(-T/6)` per second.

**Glass case** (`s4`/`a4`, line 49333). Each of the 5 panes (front, back, left, right and lid) is two meshes on the same plane:
- **Tint, multiply pass:**
  ```glsl
  float F = uF0 + (1.0-uF0)*pow(1.0-NoV,5.0);           // F0 = 0.04
  vec3 tint = mix(vec3(.99,.997,.994), vec3(.72,.9,.85), graze*(0.6+0.3*uLid));  // green at grazing
  tint *= mix(vec3(1), vec3(.78,.93,.89), gEdgeBand(vP)*.75);                 // green edges near frame
  gl_FragColor = vec4(tint*(1.0-F*0.85), 1.0);
  ```
- **Over pass** (premultiplied `One, OneMinusSrcAlpha`, `renderOrder 20.001`):
  - The outer face reflects the analytic studio (`gStudio(R)`) plus sun and moon orb mirror images (`gOrbSpec`) plus the flash. The inner face reflects a dim haze/ground colour.
  - Wavy drawn glass: low-frequency noise slope of about 0.016.
  - Fingerprints (concentric ridge pattern), smudges and micro-scratches that glint only near the sun's mirror direction.
  - Condensation film with organic edges, beads and frost ferns (in the cold).
  - Rain "stick-slip" streams, drips and drop lenses with refraction-like crescent caustics.
  - Tap rings (iridescent expanding rings where the glass is clicked) and pane ringing.
  - A wipe-brush cursor ring.
- `side: DoubleSide`, `depthWrite: false`, `renderOrder 20`.

**Clouds** (`_z`, line 57132). See section 4. Each cloud is a box mesh whose fragment shader raymarches a smooth-union of up to 20 sphere puffs, eroded by a 3D noise texture (`yz`, 48 or 64³, RGBA octaves).

**Precipitation, splashes, hail, lightning, fog, aurora, stars, sun/moon sprites, birds, insects, smoke and leaves:** all are custom ShaderMaterials over `InstancedBufferGeometry` quads or ribbons. Most are stateless, with positions computed analytically in the vertex shader from per-slot uniforms.

**Brass** (`OR`): `MeshPhysicalMaterial({color:(.72,.5,.24), metalness:1, roughness:.32, clearcoat: tier>0?.35:0, clearcoatRoughness:.22})`. Procedural tarnish is added with `vc()`: more tarnish low down and in blotches, polished where hands touch (finials, top), and a rare dark-green patina. Roughness is `0.2+tarnish*.38+patina*.4`.

**Wood plinth** (line 48720+): growth-line wood grain, honey wear on the arrises and contact AO, plus a "studio pool" where the light falls off across the table.

---

## 3. Geometry and scene composition

### Display case
- Glass box: x ±6.08, z ±4.08 (pane thickness term 0.08), y -1.8…7.4.
- Brass corner posts (`sn.r = .088`, collar/cap), a top frame (`dr`) and a bevelled lid rim (`as`, corner radius .07, bevel .026).
- Lathe-profile finials (`VR`, point list) and a lower brass band (`Ci`).
- Wooden plinth: 6.36×4.36 core, height 1.22, frieze, feet at 0.27.
- Brass nameplate: `Rn = {w:2.3,h:.3}`.
- Hygrometer/thermometer gauge: `Di = {x:3.75, r:.24}`. Its needles are springs: `v += ((target-a)*38 - v*7.5)*dt`. Tapping the gauge kicks the needles.
- Table and backdrop shader: dark room with a warm halo behind the case.

### Terrain (`$T` module, line 38216; height function `We`)
- **Base:** `0.42 + fbm(x*.17, z*.17, 4 octaves)*0.3 + noise*.025`, plus a raised cabin knoll and a rising back edge `smoothstep(.2,-3.9,z)^2*1.25`.
- **Mountains:** 5 Gaussian peaks `PEAKS = [{x:-3.4,z:-2.8,h:3.95,r:2.25,squash:1.25}, …]`, combined with a polynomial **smooth-max** (`Hh(a,b,k)`), modulated by ridged noise `ridged2(x*.5, z*.5, 5)`, then smooth-max-blended with the base.
- **Waterfall cliff:** a smoothstep step band.
- **River:** 8 control points, Catmull-Rom with 28 samples per segment. Width is `Gi(t) = lerp(.1,.24,t)`. The bed is carved by distance-to-polyline with a profile, and the height follows the river's y.
- **Lake:** an ellipse `De = {cx:2.75, cz:2.65, rx:2.35, rz:1.75, bottomY:-.85}` with a noisy rim (`fs()`, sin harmonics plus noise). The bowl profile `bottom + (lvl+.38-bottom)*(n/1.25)^2.1` is applied through a smooth-min.
- **Cabin pad:** flattened within `padRadius*1.8`.
- **Bake:** `bakeTerrainData(384,256)` produces an RGBA float texture of (height, riverMask, lakeMask, slope), used by every shader and by the CPU (bilinear `_s`). The CPU raycast ray-marches at 0.04 steps and then bisects 10 times.
- **Mesh:** grid `pick([160,108],[288,192],[384,256])`, with normals from central differences. Each quad's diagonal is chosen as the flatter of the two. The skirt walls carry `aU/aSurf/aTop/aNy` attributes for the soil shader.
- **Suitability** (`br`) drives scatter. Each type is a product of smoothsteps over slope, height, distance-to-water and distance-to-cabin. For example, grass = `$(.35,.12,slope)*$(2.6,1.6,h)*$(.02,.14,waterDist)`.
- **Rocks:** an InstancedMesh with 110/170/210 instances and 4 variant shapes blended per instance through the `aRock` attribute. Each rock is aligned partly to the terrain normal and sunk into the lowest of 6 surrounding samples. Stepping stones are placed in the river. Rocks get a custom depth material, and their shader adds lichen on top, moss on shaded flanks, wetness and snow caps.

### Water features
- Lake surface mesh, river ribbon (attributes aFlow, aSide, aDir; flow-advected pattern), waterfall sheet (it swells with flow, frays into strands and becomes a fluted ice curtain when frozen), splash and mist particles, and fish (instanced with a travelling body wave, schooling).

### Vegetation (`MR`, line 47204)
- **Trees:** pine, oak, birch, cherry, deciduous bush and evergreen bush. Counts are `pick(16/24/30 pines, 11/16/20 broadleaf, 14/24/32 bushes)`, placed by suitability.
- Rendering is **one merged bark geometry plus one merged foliage geometry** (leaf cards drawn from a canvas leaf atlas of 512 or 1024). Per-vertex `aTree` holds (root.xyz, height) and `aInfo` holds (plantIndex, flex, phase, kind).
- **Grass:** an InstancedBufferGeometry of blades with `pick(20k,60k,120k)` instances and 3/4/5 segments. Attributes are `aRoot` (xz, y, rnd), `aShape` and `aTint`. Winter thins and shortens the blades, snow flattens them and rising lake water drowns them.
- **Flowers** (1.8k/3.5k/7k), **reeds** and **cattails** (0.7k/1.4k/2.2k).
- **Reaction to the simulation:**
  - **Wind:** `vegWindBend()` for grass: travelling crests along the wind, `amt = (1-exp(-sp*.55/stiff))*1.3`, plus flutter. `vegTreeDisplace()` for trees: lean ∝ height², oscillation at `f = .95/sqrt(H)`, the top dipping in an arc, branch noise and leaf-card flutter.
  - **Per-tree spring state:** a `DataTexture(N×1)` holds (bendX, bendZ, rustle, keep). It is integrated on the CPU as a damped oscillator with `ω = 2π*(pine?1.05:0.9)/sqrt(h)` and `ζ = .16/.11/.2`. Gusts above 2.2 units per second "agitate" a tree. You can grab a tree and flick it; the bend is limited with `tanh`.
  - **Leaf transmission:** a custom `RE_Direct` override adds back-lighting `pow(back,3)` plus wrap.
  - Season colours come in through uniforms. Snow and wetness come from `groundAt`.

### Cabin and "life" (`gz`, line 56535; builder `B4`)
- A procedural log cabin, yard and jetty merged into one geometry with a per-vertex material kind: log, plank, grey, painted, bark, iron, chinking, shingles, curtain, lantern glass or flowers.
- One shader (`X4`) covers all of them: wood end-grain rings, shingles with snow load that fills the steps first, wet and algae near the waterline, windows glowing at night (`uLifeGlow`, `uLifeFlicker`) and roof snow (`uRoofSnow`).
- A rowing boat with spring yaw, roll and pitch, plus a rope.
- Chimney smoke particles, birds (instanced, flapping wings), butterflies and dragonflies, fireflies and dust motes (`life-glow` points), falling leaves and blossom, and wisps.
- Everything is gated by an `env` struct: day, night, rain, snow, season weights, activity and fireflies.

### Sky objects
- Sun and moon are **physical orbs on an orbit of radius 11.5 around the case**: billboard sprites with limb darkening, corona and glare (glare drawn at `renderOrder 30`, `depthTest:false`). Dragging an orb changes the time of day.
- Stars are a points shader with scintillation and diffraction spikes.
- Shooting stars.
- Aurora: 3 ribbon curtains inside the box at y≈6, additively blended, folded by the vertex shader. They appear in deep winter at night under clear skies, or when the temperature is below -1°C.
- Rainbow effect, with a "celebrate" chime when it appears.

---

## 4. Simulation

### Temperature (World)
```
seaTemp = seasonBase(ks) + 4.5*sin(2π(tod-0.36))*(1-.5*cloudCover) - 4*storm + tempOffset
T(y)    = seaTemp - 5*max(y,0)                         // lapse 5 °C / unit
snowFraction(y) = smoothstep(1.2, -1.2, T(y))
humidity → target (seasonal + wet*.25 + fog*.15 + storm*.2) at rate .08
waterRise decays: -= dt*.0035*(1+max(0,T)/15), capped at 0.28
flash decays: -= dt*3.2*(0.6+flash)
season glides to a target: step = sign*min(|Δ|, dt*(0.35+|Δ|*0.9)), wrapping mod 4
```

### Wind field (`ME`, line 39096)
- A 2D **stable-fluids** grid of 48×32 over the box floor (cell 0.25).
- Each step:
  1. Semi-Lagrangian advection of (u,w).
  2. Wall boundary conditions.
  3. Divergence.
  4. Pressure decay `p *= 0.8`.
  5. **14 Jacobi iterations** for pressure.
  6. Subtract the gradient.
  7. Damping `exp(-dt*.55)`.
  8. Turbulence = |curl|, smoothed.
- Ambient wind: the direction random-walks with noise, and its magnitude is `breeze(season)*(0.6+0.4*noise) + storm*1.6`.
- Gusts are a 3D noise multiplier: `clamp(1+n*(0.55+gustiness),0.1,2.5)`.
- Forces:
  - `addForce(x,z,vx,vz,radius,strength)`: a Gaussian blend toward a velocity.
  - `addRadial`: storm outflow.
  - `addVortex`.
- The wind tool rasterises the pointer stroke into up to 12 `addForce` calls with speed `clamp(dist/dt*0.9, 0, 9)`.
- The field is uploaded as an RGBA float texture (u, w, |v|, turb), which is how wind reaches the GPU.

### Ground fields (`AE`, line 39319)
- 192×128 grids of snow, wet, rain-now and frost, updated at 15 Hz and uploaded as a texture.
- **Deposit** from each precipitation source disk: rain-now `+3S`, snow `+S*snowFrac*.085`, wet `+S*(1-snowFrac)*.45`. Over water, deposits raise the lake (`waterRise += m*2.2e-4`).
- **Melt:** `min(snow,(T+*.006 + sun*.012)*dt)`, and melt water becomes wetness.
- **Evaporation:** `wet -= dt*(.004+sun*.012+wind*.002+T*9e-4)`, reduced to 20% under snow.
- **Rain-now** decays as `exp(-2.5dt)`. **Frost** = `smoothstep(1.5,-3,T)*(1-.8*sun)`.
- `fillSnowByTemperature` and `addWet` exist for scenarios.

### Clouds (`Pz` system, `Az` cloud; line 57436)
- **State per cloud:** position, velocity, size (0.05..2.4), water (0..1.5), squeeze, comp (a spring-compression state), charge, storm, fade, and puffs (up to 13 metaballs plus 7 storm puffs for the tower and anvil).
- **Layout** `rw()`: a core, two body puffs, two top puffs and two base puffs, plus a random subset of extras, then rotated randomly.
- **Puff dynamics:** each puff is a spring toward its rest offset, with stiffness `k = 46..96` (stiffer near the core) and damping `c = 2√k*(.3..0.38)`. The puffs are pushed by relative wind and turbulence. Squeeze compression flattens the cloud horizontally (`1-.38*comp`), and storm stretches it vertically (`1+.32*storm`).
- **Body motion:**
  - **When grabbed:** a critically-damped-ish spring to the pointer target, `v += ((target-p)*48 - v*10.5)*dt` (y: 30, 9).
  - **When free:** relaxes toward half the wind velocity at rate `1-exp(-dt*.75/(0.55+.45*size))`, and returns to its home altitude (minus 0.45×storm).
  - Soft wall springs (60) with a bounce of -0.45. A wall hit kicks `compVel`, which makes a squish.
- **Interactions:** clouds repel with mass ∝ size³. They merge if they collide faster than 2.4 or if a grabbed cloud overlaps another.
  - Merge: `size = cbrt(s1³+s2³)`, water added, charge and storm take the max.
  - If `water≥1 && size≥1.4`, the merged cloud becomes a storm (`stormTarget ≥ .55+.45*smoothstep(1,1.45,water)`).
- **Water cycle** (per second):
  ```
  squeeze → max(heldSqueeze, userSqueeze, wheelSqueeze)  (rate up 5 / down 2.6)
  comp spring: compVel += ((squeeze-comp)*62 - compVel*2*√62*.24)*dt
  rate = smoothstep(.02,.3,water) * ( squeeze^1.25*(0.5+1.1*min(water,1.2))
                                   + smoothstep(1.05,1.5,water)*.5          // overfull clouds drizzle
                                   + storm*(.45+.8*min(water,1.2)) )   (≤2.2, eased)
  water -= rate*dt*0.03*(1-.6*storm)          (0.006 if passively "held")
  water += (humidity-.58)*dt*.06*(…)          if humid; += storm*humidity*dt*.022
  water -= evaporation if humidity<.5 (warmer/sunnier/smaller ⇒ faster)
  size  += Δwater*0.28 ; water<.03 ⇒ shrink & dissolve
  rate>.7 ⇒ wind.addRadial(outflow)  every 0.3 s
  ```
  A cloud with `rate>.02` pushes a precipitation source `{x,y:baseY,z,radius:radius*.72,rate,cloudId}`.
- **Squeezing:** holding still on a grabbed cloud (`pointer.stillTime > 0.2`) ramps `userSqueeze += dt*.55*(1-.35*u)`. Mouse wheel over a cloud adds `wheelSqueeze` (deltaY*0.0016, held for 2.2 s, then it decays).
- **Electrics:** shaking a grabbed cloud builds charge. `shake` is the smoothed magnitude of pointer acceleration, and `charge += dt*smoothstep(9,36,shake)*0.8`. Storm clouds self-charge at `dt*.07*storm*…`.
  - Above a charge of 0.33, internal crackle glows appear at random puffs (`uGlow`).
  - At charge 1, the cloud strikes.
- **Lightning:**
  - Target: the highest nearby tree within radius (scored by height minus distance plus jitter), otherwise the highest terrain point (`highestNear`, Fibonacci-spiral search), otherwise the water surface.
  - Path: recursive midpoint displacement with 4–5 levels, amplitude 0.32 decaying ×0.62 per level, plus 2–4 branches.
  - Events `lightning` and `thunder` fire with `delay = .12 + dist*.025`.
  - Rendering: a channel ribbon with leader progress, afterglow, a scorch mark, sparks or water spray, world flash, a camera shake and the point light.
- **Rendering per cloud:**
  - The bounding box is fitted around the puffs and clamped inside the glass.
  - Raymarch: a coarse stride `chord/(steps*.8)` leaps through empty space using the SDF. On first contact it backs off and refines to `dsF = min(dsC*.38, 1.2/sigma)`. Steps are `pick(26,38,48)`.
  - Light march: `pick(4,5,6)` steps with ×1.65 growth, reused on odd samples.
  - Phase: dual-lobe HG `mix(hg(-.3),hg(.8),.5)` across 3 multiple-scattering octaves (Wrenninge), plus a powder term.
  - Colour: albedo goes from white to slate `(.37,.4,.47)` with grey (wetness/squeeze) and to `(.2,.215,.26)` with storm. Bellies darken with storm and grey. A lavender ambient appears at dusk, and there is a hover rim highlight.
  - Output is premultiplied and hazed by `applyHaze`. Clouds are sorted back-to-front through `renderOrder`, and the material switches to BackSide when the camera is inside the cloud's box.
  - Cap: 10 clouds (`Rz`). The oldest dissolves when a new one is spawned.
- **Cloud tool:** pressing on empty sky spawns a seed cloud (size .22, water .12, fade in). Holding grows it: `size += dt*(.18+.5*humidity)*(1.2-size/1.9)`, `water += dt*(.04+.1*humidity)`. Dragging adds puffs along the stroke every `max(.32,size*.4)` units.

### Precipitation (`iP`, line 60263)
- 8 "slots" are assigned to cloud sources. A slot sticks with its cloud and has a fade tail (`eP=.35s`).
- Particles are **stateless GPU particles**: an instanced quad per particle with random seeds. Each one's position is a closed-form function of `fract(phase*speed + seed)`, and the speed is quantised to k/64 so the phase can wrap without popping.
- **Fall profile:** constant velocity `vs` until `tA`, then exponential acceleration to `vr` over the column, then constant (`precipFallDist`). Horizontal drift is `3*(1-exp(-t/3))*windAt(…)`, minus the cloud's own velocity (lag).
- **Snow vs rain** per particle: `1-smoothstep(-1.2,1.2,T(y))`. A melting layer thinner than 0.6–2 units still reads as rain.
- Rain is drawn as a velocity-aligned streak (motion blur). Snow is a tumbling camera-facing flake with flutter `sin/cos(t*f+ph)` paths. Both are culled at `precipFloorAt` (ground, lake level or river).
- Budgets: `pick(2500,6000,12000)` in total and `pick(1200,2600,4200)` per slot.
- **Curtains** (rain shafts seen from afar), **splash crowns** on land and hops on water (drawn in billboard space), **hail pellets** (two bounces with restitution, then melt) and ripple drops into the lake simulation.

### Fog (`pP`, line 61636)
- A 2.5D **fog-layer heightfield** (64 × Ge grid): density, layer top, proxy top and billow.
- Fog flows downhill. Its velocity is `wind*.9 + ambient - ∇(ground + fogThickness)*drain(.32)`, then advection, diffusion (.4), a wind-shear erosion term and sun burn-off.
- Sources: valley pooling at night or in humid conditions, steam over warm water, banks and mist.
- The fog tool "pours" fog with `splat`.
- Rendering: a lid mesh plus an inside box. Steps are `pick(14,22,32)`, with a blue-noise jitter texture (64²) and a 3D noise texture (32³).
  - Billowing tops use Worley noise when fresh and Perlin when settled.
  - Light is marched through the layer top, with shadow-map shafts.
- Extra puff sprites appear while pouring.

### Condensation on the glass (`o4`, line 49533)
- Per pane: a grid of `pick(64,96)`×`pick(48,72)` holding film, beads, clear (wiped), rain and base.
- Drive:
  ```
  (humidity-.64)*1.45 + fog*1.05 + min(rain,1.5)*.18 + snow*.1 + storm*.15
  + clamp((12-T)/16)*.38*humidity - sunlight*.3     (clamped 0..1)
  ```
  A pane facing the sun dries: `film += (target-film)*rate`, with the forming rate reduced where the pane was recently wiped.
- Beads follow the film. Rain hitting a pane comes from nearby precipitation sources (Gaussian along the pane, below the cloud).
- Drips spawn from heavy beads, then stick and slip: `vel = min(.22+r*10, vel+1.4dt)`, with random holds. Up to 6 drips per pane.
- Data is packed into a Uint8 RGBA atlas for the shader.
- The wipe tool clears a capsule of radius 0.46. A hint toast says "Wiped glass slowly mists back over".

---

## 5. Interaction

### Input manager (`LT`, line 37200)
- A single **handler registry**: `{name, priority, tools, hitTest(pointer)→{distance…}, onDown, onMove, onFrame, onUp, onHover, onWheel, cursor, activeCursor}`.
- On pointer down, the highest priority wins, with nearest distance as the tiebreak. Priorities: sky orbs 50 > clouds 40 > glass wipe 10 > wind tool 5. Vegetation also registers a handler (tree grab and flick), as do the cloud-condense and fog tools.
- If nothing claims the left button, it orbits. Right button orbits; shift+right or middle pans. A tap is a non-moved left click (under 6 px) and emits `tap`; glass taps produce ringing plus a chime pitched per pane.
- **Pointer state** tracks `vx/vy` (smoothed velocity), `holdTime` and `stillTime`, which is reset when the pointer moves more than 1.5 px. `stillTime` drives "hold still to squeeze".
- Hover picking is throttled: it runs when the pointer is dirty or every 0.15 s.
- Touch: 2-finger pinch zooms (distance ratio) and the 2-finger centroid rotates.
- **Keyboard:** 1–5 select tools; H, W, C, F and G select hand, wind, cloud, fog and wipe; U hides or shows the UI; Esc closes the drawer or unhides. Inputs inside text fields are ignored.

### Camera rig (`PT`, line 37079)
- Orbit coordinates: theta, phi and radius around a target, all with **exponential smoothing** `x = lerp(x, goal, 1-exp(-k*dt))`, k = 7 for angles, 6 for radius and 5 for target.
- Limits: `minPhi .22, maxPhi 1.5, minRadius 8.5, maxRadius 34`. The pan target is clamped to x ±5, y -0.5..5, z ±3.5.
- Sensitivity: rotate `0.0052` rad/px horizontally and `0.0045` vertically; pan `radius*0.0012` per px; wheel zoom `exp(deltaY*0.0011)`.
- **Aspect fitting:** in portrait, FOV = `34+(1-aspect)*20`, and the radius is multiplied so that 12.5 units of width fit the screen.
- **Idle drift:** after 30 s idle, `theta += sin(t*.05)*dt*.012`. There is an always-on bob `y += sin(t*.4)*.03` and a shake that decays as `exp(-6t)`.
- Presets:
  ```
  hero{θ.38,φ1.13,r21.5,target[0,1.7,0]}, front, side, top, low,
  close{θ.5,φ1.1,r12,[1,1,1]}, mountains, lake
  ```
- **No scripted intro flight.** Startup is a CSS veil ("Weatherglass / sealing the atmosphere…", serif) that fades out over 1.4 s once two frames have rendered (`body.ready`). The camera starts at "hero". The coach starts 2.6 s later.

### Sun and moon dragging
`orbit.solve` finds the time-of-day whose projected orb position is closest to the pointer (96 samples). The clock follows with a spring: `vel += (ω²Δ - 2ζω·vel)dt`, with ω = 13 and ζ = .62 while dragging, and ω = 4.5 when gliding. On release the clock keeps momentum (decay `exp(-2.4t)`).

### Audio
- A Web Audio procedural engine (`YP`, synthesised voices) plus a weather "soundscape" bed (`hL`): wind, rain, river, waterfall and lake, panned by projecting world x/z onto the camera's right vector.
- Event-driven one-shots (grab, squish, merge, pop, splash, crack, rumble, tink, squeak, chime) with de-duplication: at most 3 in 40 ms, plus minimum gaps.
- The wind stroke is a continuous pink-noise bandpass whose frequency is `320+1500*strength`.

---

## 6. UI / HUD

### Design tokens (`.wg-hud`)
```css
--ink:#f4efe6; --ink-2:rgba(244,239,230,.7); --ink-3:.44; --ink-4:.2;
--brass:#ffd98a; --brass-hi:#fff1cc; --brass-lo:#b98a45;
--glass-bg:rgba(21,19,17,.56); --glass-edge:rgba(255,246,228,.13); --glass-hi:rgba(255,250,240,.14);
--shadow:0 14px 34px -14px rgba(0,0,0,.62), 0 3px 10px -2px rgba(0,0,0,.22);
--spring:cubic-bezier(.3,1.45,.45,1); --ease:cubic-bezier(.2,.7,.2,1);
--gut:18px; --tool-w:62px; --tool-h:54px; --dial:128px; safe-area insets
font: 500 12px/1.3 ui-sans-serif…; --serif:"Iowan Old Style",Palatino,Georgia (titles, coach text)
page bg #0d0c0b
```

### Glass panel
```css
.wg-panel{ background: linear-gradient(180deg,#fffaf013,#fffaf004 38%,#0000000d), var(--glass-bg);
  backdrop-filter: blur(16px) saturate(1.4); border:1px solid var(--glass-edge); border-radius:20px;
  box-shadow: inset 0 1px 0 var(--glass-hi), inset 0 -1px #0003, var(--shadow); }
```
There is an opaque fallback when `backdrop-filter` is not supported.

### Layout
- Top-left: brand ("Weatherglass" title plus a readout of humidity %, wind and precipitation with a rain/snow icon).
- Top-right: action buttons (clear skies, reset, sound, fullscreen).
- Bottom-centre: toolbar.
- Bottom-left: time panel.
- Bottom-right: climate panel (temperature readout, condition text, thermometer slider, season dial).
- In compact mode (`(max-width:859px),(max-height:519px)`) the time and climate panels collapse into a "Climate" drawer button.
- A UI shield stops pointer and wheel events from reaching the canvas.

### Toolbar
- Buttons are 62×54. A sliding **puck** is moved with `transform: translate(calc(var(--i)*var(--tool-w)))` over `.42s var(--spring)`, plus a `wgSquash` keyframe (scale 1.14/.88).
- The active icon is brass with a drop-shadow glow and a `wgPop` animation.
- Rich tooltips show a label, a kbd hint and a description. On touch, the first tap on a tool shows its description as a toast.

### Time dial (`SP`)
- An SVG sine-arc track (200×56). The day part above the horizon line has a gradient fill (`#ffd98a` at .30 → 0) and stroke (`#f3a36a` → `#ffe2a0` → `#f3a36a`). The night part below is dim.
- Ticks at 6:00, 12:00 and 18:00.
- The knob slides along the curve and swaps between sun and moon faces.
- A play button toggles `dayCycle` (one day = 300 s).
- Readout: HH:MM plus a phase name (Night, Dawn, Sunrise, Morning, Midday, Afternoon, Golden hour, Dusk).

### Season dial (`wP`)
- A 128 px circular dial: a dish with radial gradient and inset shadows, and a conic-gradient ring (blossom pink → spring green → summer → `#e47c36` autumn → winter blue-white) masked to a 12 px band at opacity .6.
- Glow, ticks, season icons and a draggable heart.
- Dragging sets `world.setSeasonTarget()` (shortest path around the wheel).

### Thermometer (`zP`)
- A vertical mercury rail of 96 px for `tempOffset` ±15. The colour ramp is -15→(130,186,255), 0→(186,222,246), 10→(255,216,140), 22→(255,164,92) and 34→(240,96,72).
- Double-click resets it.

### Toasts (`LP`)
- A centred pill stack above the toolbar (`border-radius:999px`, blur 14px), with at most 3 visible.
- They enter with `opacity 0→1; translate 0 10px→0; scale .97→1` (spring 0.5 s), triggered by a double rAF that adds `.is-in`.
- They exit with `.is-out` (translate -6px, 0.3 s) and are removed after 420 ms. Duplicate text re-arms the existing toast. Clicking dismisses.
- Hints from modules (`hud:hint`) are throttled to once per 30 s per text.

### Coach (`IP`)
- Six steps stored in `localStorage["weatherglass.coach.v1"] = {done, seen[]}`:
  1. grab: "Grab a cloud and drag it across the sky"
  2. squeeze: "Hold still on a cloud to squeeze out rain"
  3. storm: "Shake a cloud hard to build a storm"
  4. wind: "Pick the Wind tool and sweep across the meadow", switching to "Now sweep across the meadow" once the tool is active
  5. sun: "Drag the sun to change the time of day"
  6. season: "Turn the season dial"
- Each step completes from **real events**:
  - `cloud:grab`
  - `cloud:squeeze` with amount > .15 within 15 s of a grab
  - `lightning` within 20 s of a grab
  - 8 `wind:stroke` events
  - accumulated |Δtime-of-day| > .025 while dragging the sun (not from scenarios or autoplay)
  - a `season` event
- Out-of-order completion is recorded in `seen`; the coach always shows the first unseen step.
- The card is a toast variant with:
  - a 34 px brass circle icon that swaps to a check mark on completion
  - serif 15 px text
  - progress **dots**: 5×5 px each, brass/50% when seen, and the current one 14 px wide in brass with a glow
  - Next and Dismiss round buttons
- **Done state:** `.is-done` adds a brass border and glow, plays a chime, waits 1.1 s, closes the card, waits 650 ms, then shows the next step.
- The relevant control gets `.wg-coach-target`, a pulsing `:before` ring (`wgBeacon` 1.6 s, opacity .25↔1, scale .97↔1.03). The toolbar's Wind button is targeted for step 4 and the season dial (or the drawer button in compact mode) for step 6.
- When finished, a toast says "That's the whole glass — press U to hide the controls".
- `?coach=1` forces the coach to show; `?shot` or `ui=0` suppresses it.

### Other UI
- Unhide button: a 40 px round button that appears top-right when the UI is hidden.
- `prefers-reduced-motion` handling.
- Small-screen breakpoints at 379 px, and at 519 px height with at least 600 px width.

---

## 7. Performance techniques

- **Tier detection:** read `WEBGL_debug_renderer_info`, then:
  - software, Mali, Adreno and similar → tier 0
  - Apple GPU on mobile → 0, otherwise 1
  - NVIDIA, RTX, Radeon RX, Apple M-Pro/Max, M3+ → 2
  - Intel/Iris/Apple M → 1
  - any mobile device → at most 0
  - `quality.pick(low,med,high)` is used everywhere for counts, resolutions and step counts.
- **DPR cap:** `maxDpr = max(.75, min(devicePixelRatio, tier cap 1.25/1.5/2, sqrt(pixelBudget/(w*h))))`, with pixel budgets of 1.4M, 2.6M and 4.2M.
- **Adaptive quality:** FPS is measured over 0.75 s windows.
  - Below 50 fps, DPR is multiplied by 0.9 (0.8 if below 35), with a minimum of 0.6. Above 58 fps, DPR is multiplied by 1.06.
  - With a cooldown, three consecutive windows below 45 fps at minimum DPR step `postLevel` down: first tilt-shift is disabled, then bloom.
- **dt clamp:** 1/20. The tab-hidden state suspends audio.
- **Instancing and merging:**
  - grass, flowers and reeds use InstancedBufferGeometry
  - rocks use InstancedMesh
  - trees are merged into 2 draw calls with per-plant attributes, and the per-tree spring state lives in a texture read by `texelFetch`
  - the cabin and props are one merged geometry with a material-kind attribute
  - precipitation uses 8 instanced draws
- **Stateless GPU particles:** rain, snow, splashes and hail need no CPU per-particle work. Only per-slot uniforms change.
- **CPU→GPU data textures:** wind 48×32, ground fields 192×128 (upload throttled to 15 Hz), cloud shadow 120×80, condensation (Uint8), fog 64×N and the terrain bake 384×256. All are float textures, falling back to half-float when `OES_texture_float_linear` is missing (CPU conversion via `toHalfFloat`).
- **Raymarch economy:** clouds use SDF empty-space leaping, coarse-to-fine refinement, light-sample reuse on alternate samples, IGN jitter and early exit at T < 0.02. The atmosphere uses 5–12 steps. Fog adapts its step to layer thickness and uses blue noise.
- **Analytic-AA:** detail fades by `fwidth`, unresolved normal variance widens the glint lobe, and screen-derivative bump mapping avoids normal maps and UVs.
- **Shader program caching:** `customProgramCacheKey` is set on every patched material.
- **Planar reflection:** reduced resolution with scissor, re-rendered only on motion, with selective hiding.
- **Shadow map updates** only while the key light is on. The shadow frustum is fitted tightly and texel-snapped, so there is no shimmer.
- **Error isolation:** modules that throw are disabled rather than crashing the app. A profiler is available under `?stats`.

---

## 8. Fifteen reusable techniques for a "diorama builder" (modern three.js)

### 1. Shared world-uniform bag and GLSL prelude, injected into standard materials
```js
const U = { uTime:{value:0}, uSunDir:{value:new THREE.Vector3()}, uSkyColor:{value:new THREE.Color()}, /*…*/ };
const PRELUDE = `#define WG_COMMON\nuniform float uTime; uniform vec3 uSunDir; uniform vec3 uSkyColor; /* helpers */`;
function patch(mat, key, {vertex = {}, fragment = {}} = {}) {
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    for (const [chunk, code] of Object.entries(vertex))   s.vertexShader   = s.vertexShader.replace(`#include <${chunk}>`, code);
    for (const [chunk, code] of Object.entries(fragment)) s.fragmentShader = s.fragmentShader.replace(`#include <${chunk}>`, code);
    s.vertexShader = PRELUDE + s.vertexShader; s.fragmentShader = PRELUDE + s.fragmentShader;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
```

### 2. Global cloud-shadow and light-attenuation hook (patch a ShaderChunk once)
```js
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  `getDirectionalLightInfo( directionalLight, directLight );
   #ifdef WG_COMMON
   directLight.color *= cloudShadowAt((uCameraWorld * vec4(geometryPosition,1.)).xyz);
   #endif`);
// cloudShadowAt: project wp along L to the layer height, sample a CPU-splatted optical-depth texture, exp(-tau)
```

### 3. Scene-dependent lighting rig driven by sun elevation
```js
const day = THREE.MathUtils.smoothstep(sunY, -.12, .12), night = 1 - THREE.MathUtils.smoothstep(sunY, -.2, .02);
const golden = THREE.MathUtils.smoothstep(sunY, -.06, .06) * (1 - THREE.MathUtils.smoothstep(sunY, .12, .42));
key.color.copy(WHITE_WARM).lerp(GOLD, ss(.42,0,sunY)).lerp(RED, ss(.1,-.03,sunY)).lerp(OVERCAST, cover*.6);
key.intensity = 4.6 * ss(-.035,.07,sunY) * (.68 + .32*ss(.1,.55,sunY)) * THREE.MathUtils.lerp(1,.13,cover);
hemi.color.copy(SKY).lerp(DUSK, golden).lerp(NIGHT, night);
renderer.toneMappingExposure = damp(exp, lerp(1,1.65,night)*(1+golden*.22), 2.5, dt);
bloom.threshold = lerp(1.45, 1.0, night);
```

### 4. Stable, fitted directional shadow for a bounded diorama
```js
// light-space AABB of the box corners plus their projection onto the floor; quantise the size and snap to texels
const sz = Math.ceil((maxX-minX+.1)/.5)*.5, texel = sz/mapSize;
cam.left = Math.floor((cx - sz/2)/texel)*texel; cam.right = cam.left + sz; // same for top/bottom
light.shadow.radius = THREE.MathUtils.clamp(0.075/texel, 1.5, 16);
light.shadow.normalBias = texel * THREE.MathUtils.lerp(2.2, 1.3, Math.min(1, L.y*1.6));
```
Pair this with the contact-hardening `getShadow` override (4-tap early-out, blocker probe, Vogel disk).

### 5. Miniature "photoreal under glass" post stack
```js
composer.addPass(new RenderPass(scene, cam));                          // into a HalfFloat RT with samples: 4
composer.addPass(new UnrealBloomPass(res, .32, .55, .92));
composer.addPass(tiltX); composer.addPass(tiltY);                      // separable 5-tap, radius ∝ smoothstep(band, band+.38, |uv.y-focus|)
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass(Grade));                               // vignette .32, warm lift, grain .035, flash
// focus band and amount follow camera distance and pitch (closer ⇒ stronger miniature blur)
```

### 6. Two-pass glass and water transparency (multiply then premultiplied over)
```js
const base = { transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.CustomBlending, blendEquation:THREE.AddEquation };
const tint = new THREE.ShaderMaterial({...base, blendSrc:THREE.ZeroFactor, blendDst:THREE.SrcColorFactor, fragmentShader: /* rgb = tint*(1-F*.85) */});
const over = new THREE.ShaderMaterial({...base, blendSrc:THREE.OneFactor, blendDst:THREE.OneMinusSrcAlphaFactor, fragmentShader: /* premultiplied reflections + film */});
paneTint.renderOrder = 20; paneOver.renderOrder = 20.001;
```
For water, the second pass is additive (`One, One`) emission and the first is Beer-Lambert absorption.

### 7. Analytic studio reflections (softboxes) instead of an HDRI
```glsl
float softbox(vec3 r, vec3 c, vec3 rt, vec3 up, vec4 s){ float d=dot(r,c); if(d<.3) return 0.;
  vec2 q=vec2(dot(r,rt),dot(r,up))/d; vec2 e=smoothstep(s.xy+s.z, s.xy-s.z, abs(q));
  vec2 k=q/(s.xy+s.z); return e.x*e.y*(1.-.35*dot(k,k))*s.w; }
vec3 studio(vec3 r){ /* dark room gradient * .4 */ + vec3(1.,.95,.88)*Σ softbox(...) * uStudio; }
```
Also bake the same rig into a PMREM for the PBR metals (`pmrem.fromScene(studioScene, 0.015)`).

### 8. Raymarched metaball clouds in fitted proxy boxes
Each cloud is a `BoxGeometry(1,1,1)` scaled to the AABB of its puffs, with `uPuffs[20]`, a smooth-min SDF and 3D noise erosion. The march uses an SDF leap, then coarse-to-fine refinement, a Beer-Lambert light march, dual-lobe HG with 3 octaves, and premultiplied output. Materials sort back-to-front by `renderOrder` and switch to BackSide when the camera is inside.

### 9. Spring-puff soft bodies for touchable objects
```js
p.vel.addScaledVector(rest.clone().sub(p.pos).multiplyScalar(k).sub(p.vel.clone().multiplyScalar(c)).add(wind.multiplyScalar(E)), dt);
// k 46..96, c = 2√k·0.3; global compression spring: compVel += ((squeeze-comp)*62 - compVel*2*√62*.24)*dt
```
This gives jelly-like squish, merge pops and wall bumps with very little code.

### 10. Coarse CPU fluid field exported as a texture
Use a 48×32 stable-fluids grid (advect, divergence, 14 Jacobi iterations, project, damp, curl as turbulence). Upload it as RGBA float `(u, w, |v|, turb)`. GPU consumers call `windAt(xz)` and add travelling gust noise. Brush strokes call `addForce` along the pointer path.

### 11. Ground-state fields (snow, wet, puddle, frost) as a live texture plus shader layering
Use a 192×128 grid with deposit, melt, evaporate and frost equations, uploaded at 15 Hz. Every surface shader reads `groundAt(xz)`:
- darken and gloss when wet
- form puddles where `flat*wet*noise`
- add rain rings on puddles
- add snow on flat normals (`smoothstep(.35,.85,n.y)`) with a vertex lift
- add frost that thaws on sunny slopes
- add glints

### 12. Heightfield terrain from analytic SDF-like composition plus a baked data texture
Compose fbm, Gaussian peaks with ridged noise, a river spline carved by distance-to-polyline, a lake ellipse bowl and a flattened building pad, all blended with **polynomial smooth-max/min**:
```js
const smax = (a,b,k)=>{ const h=clamp(.5+.5*(b-a)/k,0,1); return lerp(a,b,h)+k*h*(1-h); };
```
Bake (height, river, lake, slope) into one float texture for shaders, CPU sampling, raycast (march plus bisect), the precipitation floor and scatter suitability. The cut-away soil skirt uses a stratigraphy shader.

### 13. Stateless GPU precipitation slots
Instanced quads with random seeds. Position is a closed-form function of `fract(time*quantisedSpeed + seed)`, the fall profile, wind drift `3(1-e^{-t/3})` and the temperature-at-altitude snow fraction. Rain is drawn as a velocity-aligned streak and snow as a fluttering billboard. Particles are culled below `floorAt(xz)`. The CPU only updates per-cloud slot uniforms.

### 14. Damped-spring vegetation state in a texture, plus shader sway
Each plant is a 2D oscillator (`ω = 2π·0.9/√h`, `ζ ≈ .11..0.2`) integrated on the CPU and written to a DataTexture(N,1) as `(bendX, bendZ, rustle, keep)`. The vertex shader adds wind lean ∝ r², an arc dip, branch and leaf flutter, and `texelFetch(uVegShake, ivec2(id,0),0).xy`. Grass uses travelling crest waves: `sin(dot(xz,dir)*2.3 - t*(2.2+.5*speed))`.

### 15. Interaction and UX scaffolding
- A priority-based handler registry (`hitTest → onDown/onFrame/onUp`, tools filter, "stillTime" gesture for hold-to-act, shake = smoothed pointer acceleration).
- An exp-smoothed orbit rig with aspect fitting, idle drift and shake.
- An event bus that drives audio, the HUD and the **event-validated coach** (localStorage progress, dots, done-check plus a beacon highlight on the target control).
- Adaptive DPR, then post-level stepping (`fps<50 → dpr*0.9`; three low windows → disable tilt-shift, then bloom).
