# Scene spec: the universal diorama format

Every 3D diorama is one JSON object. Built-in physical models are compact (`{"type":"pendulum","params":{...}}`); everything else is a **scene**: bodies, variables, behaviours, a little dynamics code, a guided tour and lessons. The same text below is what the app sends to Claude, so any AI can author scenes. It is generated from `js/ai/prompts.js` by `node prompts/build.mjs`.

```text
SCENE SPEC (type "scene") — a universal 3D diorama on a round display plinth (radius 7, top at y=0, units ≈ metres; keep content within |x|,|z| < 6.5, 0 < y < 8).
{
 "type":"scene", "title":str, "technique":"card"|"sweep"|"topdown",      // how the drawing materialises (see below)
 "environment":{"preset":"studio|lab|landscape|cosmos|micro|abstract|ocean|night","time":0-24,"glassCase":bool,"base":bool},
 "bodies":[ {"id":"bob","name":"Bob","label":"Bob · mass m","role":"actor"|"decor","describe":"one line shown when the tour introduces it",
             "shape":{"kind":<kind>, ...size fields}, "material":{"preset":<preset>,"color":"#hex","emissive":"#hex","opacity":0-1},
             "position":[x,y,z], "rotation":[degX,degY,degZ], "scale":num|[x,y,z], "parent":"otherId"} ],
 "tour":["id", ...],               // significant bodies in the order the camera introduces them (actors only; decor is never toured)
 "params":[{"key":"L","label":"string length","min":0.5,"max":4,"value":2,"unit":"m","rebuild":false}],
 "behaviors":[{"target":"id"|"prefix*"|"kind:tree","type":"sway|spin|bob|orbit|pulse|scale|move|glow|visible|opacity","axis":"x|y|z","amount":"expr","speed":"expr","center":[x,y,z]}],
 "code":"JS function body run once per build (dynamics; see API)",
 "lessons":[{"title":str,"question":str,"text":str,"set":{"param":value},"focus":"bodyId","run":seconds,"until":"event:<id>","explain":"shown after the step completes","opens":str,"shot":"wide|push|medium|close|pov","pov":"actor", "chain":[...],"isolate":...,"peel":{...},"zoom":{...},"track":{...} (optional cues, see LESSON)}],
 "scale":{"m":0.01},               // metres per world unit (only when the scene has a real size; enables the zoom's scale bar)
 "tracks":{"name":[[x,y,z],...]},   // named camera paths a lesson can ride ("track":"name")
 "camera":{"target":[x,y,z]}
}
Shape kinds: box{w,h,d,round} sphere{r} cylinder{r,rt,rb,h} cone{r,h} torus{R,r} capsule{r,h} plane{w,h} disc{r} ring{ri,ro}
 extrude{points:[[x,y]...],depth,holes} (a 2D outline pushed along z — ideal for the sweep technique) lathe{points:[[r,y]...]} tube{points:[[x,y,z]...],r,closed}
 spring{R,r,turns,h} arrow{length,r} text{text,w,h,color} sign{text,w,h,post}
 Scenic/objects: tree{h} pine{h} bush{h} house{w,d,h,roof} tower{h,r} mountain{r,h,seed,snowline} rock{r,h} cloud{r,puffs} water{w,d} terrain{w,d,h,seed,bowl}
 table{w,d,h} lamp{h} beaker{r,h,fill,liquid} flask testtube molecule{atoms:[["O",x,y,z]...],bonds:[[i,j]...],scale} cell{r} planet{r,rings,color} star{r,color,intensity}
 gear{r,teeth,depth} magnet battery coin{r} die{s} book person{h,color} bars{data:[..],w,gap,scale,colors} surface{expr in x,y,range,h} curve{x,y,z exprs in t,t0,t1,r}
 grid{size,div} axes{size} glasscase{w,d,h} particles{type:rain|snow|dust|bubbles|stars|sparks,count,area:[x,y,z],speed} scale pulley{r} boat car group
 Landscape kit (outdoor scenes, environment.base:false): terrain{w,d,h,seed,low,high,block:true,bottom,peaks:[{x,z,r,h,squash,own}],terraces:[{z0,z1,x0,x1,h}],river:{points:[[x,z]...],width:[a,b],depth},lake:{x,z,rx,rz,depth,level},pads:[[x,z,r]],path:{points,width}} (ONE height field, a specimen block with a soil cross-section; put it FIRST: the kinds below sit on it) peak{id,x,z} (the rock of the terrain peak with own:id as its own actor body, position [x,0,z]) grassField{density} flowers reeds rockScatter{count,r:[min,max]} lake river (with its waterfall) forest{species:oak|birch|cherry|pine|bush|tree,items:[[x,z,h]...]} oak{h} birch{h} cherry{h} cloud{r,puffs,volume:true} (volumetric, casts cloud shadows; code: obj.userData.cloud.set({grey,fade,storm})) particles{type:vapour|streaks} (wisps; velocity-aligned rain); cabin{w,d} (log cabin, porch, stone chimney with smoke; front +z; obj.userData.cabin.setGlow(0..1)) jetty{from:[x,z],to:[x,z],width} hills{r,layers,height} (painted distant hills); scene code reads heights with api.body(terrainId).userData.field.h(x,z) and sets wind with api.scene.userData.wind=[x,z]
Material presets: brass gold copper chrome steel iron mercury wood darkwood bark paper parchment card glass water ice plastic rubber ceramic stone marble plaster fabric leather foliage grass soil sand snow skin membrane gel emissive neon cloud smoke ink chalk
Expressions ("amount","speed", surface/curve): plain maths with + - * / ^ ( ), sin cos tan exp log sqrt abs min max pow, PI, E, t (seconds) and the param keys.
Techniques: "card" = a white card model on a drafting desk seen through a long lens; a light sphere turns card into real materials (good for objects, machines, organisms, economies).
 "sweep" = a section seen dead-on through an extreme telephoto; a vertical cut plane scans across turning ink into light (good for layered things: soils, cells, atmospheres, circuits, cross-sections, timelines).
 "topdown" = a plan seen from straight above; the section cut rises and the camera tilts into perspective (good for maps, networks, fields, populations, board-like systems).
CODE API (spec.code is the body of function(api), no imports/DOM/network):
 api.body(id) -> Object3D of a body; api.bodies(); api.param(key); api.set(key,value); api.p (live values)
 api.onStep((h,t)=>{}) physics substep h≈1/480 s (integrate here: semi-implicit Euler or RK4); api.onFrame((dt,t)=>{}) once per frame (move meshes here)
 api.event(text, Vector3|null, {id:"turning"}) logs + flashes; lessons can wait for it with "until":"event:turning"
 api.readout(name, ()=>number|string); api.plot(name, ()=>number) live sparkline; api.label(text, ()=>Vector3, describe) adds a significant body for the tour
 api.spawn(bodySpec, parent?) -> Object3D at runtime; api.remove(obj); api.shape(shapeSpec, materialSpec) -> Object3D (not added); api.material(spec)
 api.onClick(raycaster=>{}); api.camera({target:[x,y,z], r:distance, ph:polar, th:azimuth}); api.time(); api.THREE (three.js r170); api.V3(x,y,z); api.noise(x,y,z); api.rand(); api.fmt(n); api.clamp; api.lerp
 api.trail(maxPoints, hex) -> line with .add(vec3) (add it to api.world); api.world (Group)
RULES: physics/maths must be correct; every definition must be attached to visible bodies and to events; actors are the bodies the explanation is about (2–7 of them), decor gives place and scale and may react through behaviors (trees sway with wind, windows glow at night); lessons are 3–6 short steps, each changing something and pointing at what to watch, each settling one question and opening the next; keep code under ~200 lines.
LESSON (one step of a 3D demo's guided tour): {"title":str,"question":"the one question this lesson settles","text":"what the learner does and exactly what to watch","focus":"actor name or id","set":{"param":value},"run":seconds | "until":"event:<substring of an api.event text>","explain":"what happened and why, with the numbers","opens":"the next question it raises (= the next lesson's question)","shot":"wide|push|medium|close|pov (optional)","pov":"actor name (only with shot pov)"}. Lessons form a thread: lesson k+1's "question" repeats lesson k's "opens".
OPTIONAL EXPLAINER CUES on a lesson (actor names spelled as in "focus"; see EXPLAINER RULES):
 "chain":["actor",…] the actors in the ORDER OF CAUSE, 2–8 per lesson (an entry may be {"a":"actor","note":"≤ 6 words"}); a highlight travels link by link with numbered badges ("Step k of n"); "chainPace":0.5–2 (seconds per link, default 0.9) or "chainOn":"event:<substring>" (one link per such event, in step with the motion)
 "isolate":true | ["actor",…] everything except the subject (true: the focus and the actors the text names) is dimmed and greyed while the step plays
 "peel":{"layers":["outermost actor",…],"mode":"ghost|lift|clip","order":"out-in|in-out","dwell":2.2,"restore":"step|beat|never"} reveals an inside one named layer at a time ("Layer k of n"), at most 6 layers, restored in reverse
 "zoom":{"to":"small actor","from":"wide|current","perDecade":3,"fovEnd":30,"stations":[{"at":"actor","hold":2}],"back":false} one continuous zoom into a small part, pausing at stations named after the levels of organisation (leave "shot" out: "zoom" is the shot); the diorama needs "scale":{"m":<metres per world unit>} for its scale bar
 "track":{"points":[[x,y,z],…],"dur":8,"lookAhead":0.08,"lookAtSubject":0.3} (or the name of a track in the scene's "tracks") a short ride along an authored path, bracketed by establishing and pull-out shots.
MATHS IN TEXT (titles, body names, labels, lessons, events, readouts, terms, explanations, examples): write every formula in ONE plain syntax the app typesets — italic variables, upright functions and units, real superscripts, subscripts, radicals and fractions:
 * or juxtaposition for products (2*x or 2x, a*sin(x)); / for division (Ea/(k*T)); ^ for powers, with brackets round a compound exponent (x^2, x^(n+1), e^(-Ea/(k*T))); sqrt(…), cbrt(…), exp(…), abs(…), ln(…), log(…), sin cos tan(…); pi; Greek letters by name or symbol (theta, omega, Delta T, or θ ω ΔT); subscripts as x_i, T_max, v_(n+1) (or m1, v0 for a single digit); <= >= != -> +- ~= for ≤ ≥ ≠ → ± ≈; 1.2e-3 for 1.2 × 10⁻³; a number then a space then its unit (9.81 m/s^2, 2.5 kg*m^2, -286 kJ*mol^-1, 300 K); chemistry as H2O, CO2, Ca2+, SO4^2-, 2H2 + O2 -> 2H2O.
 In scroll text ("statement", "math", "derivation", "examples", "terms") LaTeX inside $…$ is also fine; never mix the two syntaxes inside one formula. Never write **, a compound exponent without brackets (e^-Ea/kT), × or · typed between letters, or a formula in backticks (backticks are only for code).

BUILT-IN 3D MODELS. Use {"type":<name>,"title":str,"purpose":str,"params":{...},"lessons":[...]}; each also accepts "technique":"card|sweep|topdown". Listed per model: params; actors (the names to use in a lesson's "focus"/"pov" and in a step's "bodies"); events (the texts it logs; a lesson's "until":"event:<substring>" MUST use a substring of one of them, "<n>" stands for a number).
pendulum{L,g,theta0,damping} actors: bob · m | string · L | pivot | small-angle model | angle scale; events: "bob released from rest" | "turning point: ω = 0" | "period measured: T =" | "amplitude halved" | "lowest point: speed v = Lω"
doublependulum{m1,m2,L1,L2,theta1,theta2,g,eps} actors: m₁ · upper bob | m₂ · lower bob | twin (offset ε); events: "two pendulums released" | "chaos: after" | "lower arm flips over the top" | "the twins are still together"
spring{k,m,c,x0} actors: mass · m | spring · k | metre scale · x = 0; events: "turning point x =" | "period measured: T =" | "amplitude halved" | "passes equilibrium"
projectile{v0,angle,g,drag} actors: ball | cannon | no-drag parabola | flag at the no-drag range R; events: "launch: v₀ =" | "apex: vᵧ = 0 at t =" | "lands after"
orbit{GM,r0,vfactor} actors: star · M | planet · m | equal-area wedges; events: "perihelion: closest" | "aphelion: farthest" | "one orbit complete: T =" | "unbound, the planet escapes" | "planet left the diorama" | "planet falls into the star"
collision{m1,m2,v1,v2,e} actors: cart 1 · m₁ | cart 2 · m₂ | centre of mass | photogates; events: "collision: p" | "gliders reach the end stops"
incline{angle,mu,m,g} actors: block · m | angle gauge; events: "static friction holds the block" | "the block will slide" | "still at rest after 2 s" | "block released at the top" | "reaches the bottom after"
lever{m1,x1,m2,x2,fulcrum,beam} actors: mass 1 · m₁ | mass 2 · m₂ | fulcrum | beam; events: "the lever balances" | "net moment" | "still balanced after 2 s" | "beam strikes the ground"
wave{A,lambda,f,standing} actors: tracked bead | rope | crest | node (never moves); events: "the crest moved one wavelength" | "period <n> complete" | "standing wave on a fixed rope" | "standing wave: the nodes never move"
gas{N,T,V} actors: molecule · m | glass vessel | pressure gauge | piston | burner; events: "first pressure reading" | "new pressure reading after heating/cooling" | "heated/cooled: every velocity scaled" | "tracked molecule strikes the piston" | "tracked molecule strikes the end wall"
reaction{NA,NB,Ea,Eb,T} actors: tracked molecule | reaction cell; events: "the tracked molecule reacts" | "collision with KE" | "first reverse reaction" | "the tracked molecule splits again" | "dynamic equilibrium"
efield{q1,q2,d,qt,m,drag} actors: test charge · q, m | field lines; events: "test charge released from rest" | "test charge released again" | "test charge captured by the" | "test charge escapes the diorama"
circuit{V,R,C,closed} actors: battery · ε | resistor · R | capacitor · C | switch | voltmeter (across C) | tracked electron; events: "switch closed: capacitor charges through R" | "capacitor discharges through R" | "switch flipped" | "t = τ =" | "t = 5τ ="
lens{f,do,ho,sweep} actors: object (candle) | image | screen | light ray (photon) | converging lens | diverging lens; events: "1/f = 1/d_o + 1/d_i" | "converges at the image" | "seem to come from a virtual image" | "the rays leave the lens parallel" | "rays leave parallel, image at infinity" | "real, inverted image" | "virtual, upright image"
surface{gravity,friction; "expr":"f(x,y)"} actors: ball | surface; events: "ball placed" | "ball dropped at" | "at rest: ∇f ≈ 0"
weatherglass{T,P,P0,auto,conc} actors: Goethe weather glass | spout column · water level | trapped air · P_in | flask water | storm glass · sealed tube | crystals | camphor solution | seed bed | mercury barometer | mercury column | thermometer | sky · cloud cover; events: "glass sealed at" | "spout settles at" | "trapped air pushes water up the spout" | "outside air pushes the water back down" | "air bubbles into the flask" | "camphor crystals nucleate" | "the fern crystals redissolve" | "rapid cooling" | "pressure falling" | "pressure rising" | "rain begins" | "rain eases"
When a diorama repeats in a chain (the same model or scene in a later step), name its actors, spelled as above, in that later step's "bodies": the reader draws the repeat as a stage plate that frames and numbers exactly the actors named in "bodies".

2D interactive diagrams: plot{exprs,labels,x,y,params,xlabel,ylabel,points,ref} tangent{expr,x,y} riemann{expr,a,b,y} vectors{a,b} matrix{m} complex{z,w} unitcircle fourier{wave,n} distribution{mode:normal|clt,mu,sigma} parametric{xt,yt,t,x,y} phase{dx,dy,range,yrange,params} customsvg{svg}. "params" is {"key":[min,max,value]}. On a plot, "labels":[str] names each curve in the legend (default: the demo's "ylabel", else its "title"); "points" marks data as [[x,y],…] or [[x,y,"label"],…] (the label is printed beside the dot).
DATA PROVENANCE (every demo): data and points come FROM THE PDF by default: say where in the demo's "ref" (e.g. "Table 1.1, p. 4"), and the reader labels it "From the PDF · Table 1.1, p. 4". Only data from outside the PDF goes in the demo's "extra":[{"what","source"}] (or "source":{…,"outside":true}); the reader labels that "Data added from outside the PDF" with its source. A demo with neither is labelled "Our drawing".
```

## Lessons as a question thread

A diorama has 3–6 lessons (the same count the chain prompts ask for). Every lesson settles one question and opens the next, in the authored format of `js/seeds-legacy.js`:

```json
{"title":"Drop the pressure by hand","question":"What does a falling outside pressure do to the spout?",
 "text":"Lower the outside pressure to 990 hPa and watch the spout.","focus":"spout column","set":{"P":990},
 "until":"event:spout settles","explain":"In equilibrium P_in − P = ρ g Δh …",
 "opens":"What happens when the pressure rises far above the sealing pressure?","shot":"close"}
```

- `question`: the one question this lesson settles. The first lesson's question is the question the chain step answers.
- `opens`: the question it raises; the next lesson's `question` repeats it. The last lesson's `opens` is the question the step opens.
- `run` (seconds) or `until: "event:<substring>"` (waits for an `api.event` whose text contains the substring). For a built-in model, use a substring of one of the event texts listed for it above; `focus` and `pov` use its actor names. `node tools/verify-chain.mjs` flags an `until` that no event text contains.
- `shot`: `wide`, `push`, `close` or `pov`; with `pov`, `pov` names the actor whose eye the camera rides.

A chain demo also carries `purpose` (the question the whole demo answers); a diorama shown again in a later step needs a different purpose. Values that are not from the book go in a top-level `extra` (`[{what, source}]`) and are labelled as added from outside the PDF.

- `shot` may also be `medium` (static, frames the focus and the actors the text names).
- How the engine picks an event's subject: the first actor, in `tour` order, whose name (the part before ` · `) appears in the event text, else the step's `focus`. During a step, an event whose subject is neither the focus nor named in the step's `text` goes to the ticker and takes no shot, but it still completes an `until`. Word event texts so that the actor you want framed is the first one they name.

## Explainer cues (optional lesson fields)

Five optional lesson fields turn a step into a mechanism explainer (`js/dio/focus.js`, `js/dio/director.js`; the evidence and the full specs are in `research/explainer-animation.md`, §6–7). All of them name actors the way `focus` does (id, full name, the name before ` · `, or a substring). They run only with **Cinematic** on, after the instruction has been read, and every one is undone when the step ends.

| Field | What the learner sees | Notes |
|---|---|---|
| `"chain":["trapped air", {"a":"flask water","note":"pressed down"}, "spout column"]` | a highlight front travels link by link **in the order of cause**: the link reached glows (accent `#ffd98a`) for 0.6 s, then stays at 40 %; each keeps a numbered badge; a chip reads `Step k of n · note`; an arrow joins consecutive links while the front crosses. Two passes (the second at 0.6× the time per link), then the glow ends and the badges stay for the step. | `chainPace` 0.5–2 s per link (default 0.9) or `chainOn:"event:<substring>"` (one link per matching event). More than 8 links are shown in consecutive segments with the numbering continued. The note is ≤ 6 words. |
| `"isolate": true` or `["storm glass","crystals"]` | everything else is desaturated (×0.25) and dimmed (×0.65); far scenery only to ×0.85; the HTML layer (callouts, pins, legends) is never graded | ramps in 0.4 s after the cut, out 0.6 s at the step's end; off in free exploration, in POV and while the learner holds the camera. `true` = the focus plus the actors the text names. A model may default it with `DIO.<type>.isolate = true`; a scene with top-level `"isolate"`. |
| `"peel":{"layers":["case","liner"],"mode":"ghost","order":"out-in","dwell":2.2,"restore":"step"}` | one layer at a time, each with a label beat `Layer k of n · name: describe`: **ghost** fades it to 12 % with its edges kept, **lift** moves it outward by 1.2 × its radius, **clip** sweeps a section plane through it (poché on the cut). After the last layer the inner subject is isolated. Restore runs in reverse at 2× speed. | ≤ 6 layers; glass is skipped (already see-through). `order:"in-out"` builds up from the bare inside; `restore` is `step`, `beat` (right after the last layer) or `never` (until the next step). |
| `"zoom":{"to":"crystals","from":"wide","perDecade":3,"fovEnd":30,"stations":[{"at":"storm glass","hold":1.5}],"back":false}` | a 40 px target ring appears first; the view turns to centre the target (0.6 s), then dollies along one straight axis with the distance changing **exponentially** (constant perceived speed), pausing at each station (`Station k of n · name`); a scale bar names the length (1, 2 or 5 × 10ᵏ, km … nm) | duration per segment = `perDecade` × decades crossed (2.5–14 s); the lens changes only in the last 30 % and by ≤ 10°; near/far follow the distance (ratio ≤ 10⁴). Leave `shot` out: `zoom` is the shot. `back:true` pulls back out after the step. **The scale bar needs the diorama's `"scale":{"m":<metres per world unit>}`**; without it no scale bar is drawn. A scene drawn at two scales (an apparatus with molecules drawn in it) adds `"micro":{"m":<metres per unit for the drawn molecules>,"below":<world units>,"note":"molecule size"}`: once the view is narrower than `below`, the bar switches to the molecular scale and appends the note (osmosis flagship). A model may default it with `DIO.<type>.scale` (gas, reaction, weatherglass do). Stations larger than the starting view are skipped. |
| `"track":{"points":[[0,1,4],[0,1,1],[0.2,0.9,-2]],"dur":8,"lookAhead":0.08,"lookAtSubject":0.3,"preview":true}` or `"track":"vessel"` | the rail is drawn from the overview for 1 s, then a ride along a centripetal Catmull–Rom path (eased over the first and last 15 %), then a 2 s pull-out ("You were here") | named tracks live in the scene's `"tracks":{"vessel":[[x,y,z],…]}` or `{"vessel":{"points":[…],"dur":10,"lookAhead":0.08,"label":"a parcel of air over the ridge"}}` (or `DIO.<type>.tracks`; `label` is what the chip says you will ride). `"track":"actor"` rides the focus actor like `shot:"pov"`. |

Rules that always apply (no field needed):
- **Labels** (S5): at most four actor labels are shown in full; the others shrink to numbered dots (the chain index, else the tour order) that stay for the step. A label named by a beat or an event comes up at once and stays at least its reading time. Callout kickers read `Step k of n`, `Layer k of n`, `Station k of n`.
- **POV comfort** (S6): before a `shot:"pov"` ride the director holds a 1.5 s medium shot of the actor with "You will see as: …"; after it, a 2 s pull-out with a fading trail of where the actor went ("You were here"). The automatic turn is capped at 60°/s (acceleration ≤ 120°/s²), roll is locked, a soft vignette darkens the edges during fast turns, an edge arrow points to the step's subject when it is out of view, and an automatic ride ends after 12 s (dragging to look around keeps it). **Calm** in the time bar (or the system's "reduce motion") turns rides into a still view from the actor and zooms into a cut with the scale bar.
- **Moving shots finish** (S4, S9): an event during a zoom, at the zoom's arrival view or during a ride is read in its callout and does not cut the camera away; a step whose `until` or `run` is reached while a zoom, a ride or a POV bracket is still on its way ends when it arrives (at most 12 s later).
- **"You are here" inset** (S10): during a zoom, a `track` or POV ride and a deep close-up in a running step, a small passive overview (220 × 140 px, no controls) sits in the free corner away from the callout, with a dot and a view wedge where the camera is, the zoom target ring or the ride's rail; it fades out 2 s after the shot ends. Hidden in **Calm** and on screens narrower than 600 px. Nothing to author.
- **Peel layers keep what is inside them**: a peeled layer never ghosts the lesson's subject or another actor nested in it (peeling the barometer case leaves the mercury column). Meshes that are part of the layer itself (the gas's molecules are drawn inside its glass vessel group) are peeled with it, so do not peel a container whose contents are not actors.
- **Molecules**: in `micro` scenes, for built-in `gas`/`reaction` and for bodies flagged `"diffusive":true`, a POV lesson's text must not use directed-motion verbs ("travels to", "heads for", "seeks", "finds") without "random" or "diffuses" (`tools/verify-chain.mjs` warns).

`tools/verify-chain.mjs` checks every cue: names must be actors of the model (or bodies of the scene), enums and track points must be valid, and it warns when a chain link is never named in the lesson's text and when a zoom has no `scale`. The chain schemas still list only `wide|push|medium|close|pov` for `shot`, so give `zoom`/`track` as their own fields, never as a `shot` value.

## Presentation fields (optional, read by the engine)

The four flagship examples use all of these.

- `environment` extras:
  - `"preset":"desk"`: a walnut desk whose brass lamp is the key light, so shadows fall away from a light you can see; `"lamp":[x,z]` places the lamp (put it at a frame edge as foreground).
  - `"azimuth":deg` (landscape) turns the sun's path, so the key light, and a sun body placed by your code, come from where the composition needs them.
- `shots`: `{"<lowercase substring of an event text>": {"target":[x,y,z], "dist":d}}`. When an event's text contains the key, the director frames `target` (or the event's own position, if `target` is left out) at distance `d`, given for the base 40° lens. Example: `"windward slope":{"target":[.5,2.8,-1.7],"dist":9}`, or `"copper bead lands":{"dist":6}` to aim at the event's position.
- `flows`: `{"<lowercase substring>": [{"from":[x,y,z],"to":[x,y,z],"label":str}, …]}` (up to 4 arrows). These are process arrows drawn when Guides are on, for an event, lesson text or explanation that contains the key. Keep both ends inside the shot's frame.
- `api.event(text, pos, {id, sound})`: `sound` names an effect from `js/audio.js` (`chime`, `pour`, `clack`, `bubble`, `tick`, `whoosh`, `step-done`, `paper`, `thud`, `thunder`, `drip`, `fizz`, `snap` …); without it a sound is guessed from the text. Give every event a `pos`, so it can be flashed, framed and panned.
- Actors that are code-made (`api.label`) have no mesh, so the director can only aim at a point. If the camera should frame an actor or ride it (`shot:"pov"`), declare it as a body (`role:"actor"`, listed in `tour`) and move that body from your code (as the flagships do with the air parcel, the copper bead and the tagged molecule).
- Code-made backdrops for the `sweep` and `topdown` techniques: the section-cut materialiser turns every opaque material double-sided. A `BackSide` sky cylinder (seen from outside, only its far half should draw) must therefore use a `transparent:true, opacity:1` material, which the materialiser leaves alone.

## Worked examples

See `../examples/scene-*.json`:
- **Water cycle** (earth science, top-down): Magnus saturation vapour pressure, Dalton evaporation, Espy cloud base, moist-adiabatic lift over a ridge; ride an air parcel to its dew point.
- **Galton board** (statistics, section sweep): binomial counts against the normal curve; ride one bead.
- **Market** (economics, card model): a double auction of zero-intelligence traders, as in Smith 1962 and Gode & Sunder 1993; close-up on the price crossing.
- **Osmosis** (biology, section sweep): the ideal-solution balance −ln x_w = 2KΔh, reverse osmosis under a piston; ride a tagged molecule through a pore.

## Landscape kit (outdoor dioramas at Weatherglass quality)

Built for the water-cycle flagship (`js/seeds-scenes.js`, `WATER_CYCLE`) and usable by any outdoor scene. The research
and the per-recipe costs are in `research/realism-playbook.md`; the implementation notes are in
`research/aaa-rendering.md`, "Landscape kit".

- **`terrain` with a field** (any of `peaks`, `lake`, `river`, `block`): one height field baked on the mesh grid
  (`js/gfx/terrain.js`): fBm meadow (`h`, `seed`, `lift`), `backRise:[z0,z1,h]`, `terraces:[{z0,z1,x0,x1,h}]` (a sharp
  terrace edge under a river becomes its waterfall), `peaks:[{x,z,r,h,squash,rot,rough,own}]` (smooth-max, no creases),
  `river:{points:[[x,z],…],width:[source,mouth],depth}` (its water surface only runs downhill), `lake:{x,z,rx,rz,depth,level}`
  (level from the rim if left out), `pads:[[x,z,r]]` (flattened yards), `path:{points,width}` (bare, no grass).
  Rock (AAA crag) where it is steep or high, meadow elsewhere. `block:true` (default) cuts the land as a rectangular
  specimen with a painted **soil section** on its four faces down to `bottom`, on a walnut plinth: use it with
  `environment.base:false`. Put the terrain body first; later bodies find its field. Scene code: `api.body('ground').userData.field`
  gives `h(x,z)`, `slope(x,z)`, `normal(x,z)`, `suit(x,z,kind)`, `lake.level`, `river.P`, `river.fall`.
- **`peak{id,x,z}`**: the rock of the terrain peak whose `own` is `id`, as its own body (an actor ridge that labels,
  isolates and glows on its own); give the body `position:[x,0,z]`.
- **`grassField{density,height,amount}`**, **`flowers{amount}`**, **`reeds{amount}`**: instanced, wind-bent blades,
  six flower species, reeds and cattails on the shore, scattered by the field's ecology; they grow out of the paper as the
  materialize front passes. Counts follow `gfx.quality`.
- **`rockScatter{count,r:[min,max],region,moss,anywhere}`**: half-buried mossy boulders on rocky ground (2 draw calls).
- **`lake`** and **`river`** (alias `waterfall`): analytic water on the field: depth colour, Fresnel sky reflection, sun
  glint and glitter, lapping foam, rain rings where it rains; the river has flowing streaks, a waterfall sheet, plunge
  foam and spray. No transmission.
- **`forest{species,items:[[x,z,h],…]|count,region,h:[min,max],variants}`** and **`oak|birch|cherry{h}`** (also
  `tree{species}`): species with crown-shaded foliage and wind in the vertex shader (2 draw calls per variant).
- **`cloud{r,puffs,volume:true}`** (alias `cloudVolume`): a raymarched volumetric cloud; it shadows the land. Code drives
  it with `mesh.userData.cloud.set({grey,fade,storm})` (find the mesh with `traverse(o => o.userData.cloud)`).
- **`particles{type:"vapour"}`** (soft rising wisps; `material.opacity` still fades them) and **`particles{type:"streaks"}`**
  (rain as velocity-aligned soft streaks; write drop positions into `obj.userData.streaks.pos` and call `commit()`).
- **`cabin{w,d}`** (log walls, shingled roof, porch, woodpile, stone chimney with smoke; front = +z; `obj.userData.cabin.setGlow(0..1)` lights the windows), **`jetty{from:[x,z],to:[x,z],width}`** (planks and posts out over the lake), **`hills{r,layers,height,y}`** (painted distant hills around the block, hazed by the fog).
- The lake reflects the scene in a half-resolution planar mirror at medium/high quality (sky only at low); the meadow has a short ground-cover layer under the blades (`grassField{cover:false}` turns it off).
- Wind for grass, reeds, trees and lake waves: `api.scene.userData.wind = [x, z]` (m/s). A scene may set its overview lens
  with `api.camera({fov})`.

## Edits stored in a spec

- `hidden`: variable keys hidden from the panel; `ranges`: `{"key":[min,max]}` overrides.
- `overrides`: per-object edits for objects that are not declared bodies (built-in models or code-made objects), keyed by path (`w:<index>` in the world, `a:<index>` in additions, `b:<bodyId>` for bodies): `{hidden, removed, offset:[x,y,z], rotation:[deg..], scale:[..], replace:{shape, material}}`.
- `additions`: extra bodies added to any diorama (built-in or scene).
- `values`: the last variable values the reader set.
