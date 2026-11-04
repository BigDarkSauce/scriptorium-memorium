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
 "lessons":[{"title":str,"question":str,"text":str,"set":{"param":value},"focus":"bodyId","run":seconds,"until":"event:<id>","explain":"shown after the step completes","opens":str,"shot":"wide|push|close|pov","pov":"actor"}],
 "camera":{"target":[x,y,z]}
}
Shape kinds: box{w,h,d,round} sphere{r} cylinder{r,rt,rb,h} cone{r,h} torus{R,r} capsule{r,h} plane{w,h} disc{r} ring{ri,ro}
 extrude{points:[[x,y]...],depth,holes} (a 2D outline pushed along z — ideal for the sweep technique) lathe{points:[[r,y]...]} tube{points:[[x,y,z]...],r,closed}
 spring{R,r,turns,h} arrow{length,r} text{text,w,h,color} sign{text,w,h,post}
 Scenic/objects: tree{h} pine{h} bush{h} house{w,d,h,roof} tower{h,r} mountain{r,h,seed,snowline} rock{r,h} cloud{r,puffs} water{w,d} terrain{w,d,h,seed,bowl}
 table{w,d,h} lamp{h} beaker{r,h,fill,liquid} flask testtube molecule{atoms:[["O",x,y,z]...],bonds:[[i,j]...],scale} cell{r} planet{r,rings,color} star{r,color,intensity}
 gear{r,teeth,depth} magnet battery coin{r} die{s} book person{h,color} bars{data:[..],w,gap,scale,colors} surface{expr in x,y,range,h} curve{x,y,z exprs in t,t0,t1,r}
 grid{size,div} axes{size} glasscase{w,d,h} particles{type:rain|snow|dust|bubbles|stars|sparks,count,area:[x,y,z],speed} scale pulley{r} boat car group
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
RULES: physics/maths must be correct; every definition must be attached to visible bodies and to events; actors are the bodies the explanation is about (2–7 of them), decor gives place and scale and may react through behaviors (trees sway with wind, windows glow at night); lessons are 3–7 short steps, each changing something and pointing at what to watch, each settling one question and opening the next; keep code under ~200 lines.
LESSON (one step of a 3D demo's guided tour): {"title":str,"question":"the one question this lesson settles","text":"what the learner does and exactly what to watch","focus":"actor name or id","set":{"param":value},"run":seconds | "until":"event:<substring of an api.event text>","explain":"what happened and why, with the numbers","opens":"the next question it raises (= the next lesson's question)","shot":"wide|push|close|pov (optional)","pov":"actor name (only with shot pov)"}. Lessons form a thread: lesson k+1's "question" repeats lesson k's "opens".

Built-in physical models (use {"type":<name>,"title":str,"params":{...},"lessons":[...]}): pendulum{L,g,theta0,damping} doublependulum{m1,m2,L1,L2,theta1,theta2,g,eps} spring{k,m,c,x0} projectile{v0,angle,g,drag} orbit{GM,r0,vfactor} collision{m1,m2,v1,v2,e} incline{angle,mu,m,g} lever{m1,x1,m2,x2,fulcrum,beam} wave{A,lambda,f,standing} gas{N,T} reaction{NA,NB,Ea,Eb,T} efield{q1,q2,d,qt,m} circuit{V,R,C,closed} lens{f,do,ho,sweep} surface{gravity,friction; "expr":"f(x,y)"} weatherglass{T,P,P0,auto,conc}. Any of them also accepts "technique":"card|sweep|topdown" and "lessons".

2D interactive diagrams: plot{exprs,x,y,params,xlabel,ylabel,points} tangent{expr,x,y} riemann{expr,a,b,y} vectors{a,b} matrix{m} complex{z,w} unitcircle fourier{wave,n} distribution{mode:normal|clt,mu,sigma} parametric{xt,yt,t,x,y} phase{dx,dy,range,yrange,params} customsvg{svg}. "params" is {"key":[min,max,value]}. "points":[[x,y],...] marks measured data on a plot (cite it in "source", or in "extra" when it is from outside the PDF).
```

## Lessons as a question thread

Every lesson settles one question and opens the next, in the authored format of `js/seeds-legacy.js`:

```json
{"title":"Drop the pressure by hand","question":"What does a falling outside pressure do to the spout?",
 "text":"Lower the outside pressure to 990 hPa and watch the spout.","focus":"spout column","set":{"P":990},
 "until":"event:spout settles","explain":"In equilibrium P_in − P = ρ g Δh …",
 "opens":"What happens when the pressure rises far above the sealing pressure?","shot":"close"}
```

- `question`: the one question this lesson settles. The first lesson's question is the question the chain step answers.
- `opens`: the question it raises; the next lesson's `question` repeats it. The last lesson's `opens` is the question the step opens.
- `run` (seconds) or `until: "event:<substring>"` (waits for an `api.event` whose text contains the substring).
- `shot`: `wide`, `push`, `close` or `pov`; with `pov`, `pov` names the actor whose eye the camera rides.

A chain demo also carries `purpose` (the question the whole demo answers); a diorama shown again in a later step needs a different purpose. Values that are not from the book go in a top-level `extra` (`[{what, source}]`) and are labelled as added from outside the PDF.

- `shot` may also be `medium` (static, frames the focus and the actors the text names).
- How the engine picks an event's subject: the first actor, in `tour` order, whose name (the part before ` · `) appears in the event text, else the step's `focus`. During a step, an event whose subject is neither the focus nor named in the step's `text` goes to the ticker and takes no shot, but it still completes an `until`. Word event texts so that the actor you want framed is the first one they name.

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

## Edits stored in a spec

- `hidden`: variable keys hidden from the panel; `ranges`: `{"key":[min,max]}` overrides.
- `overrides`: per-object edits for objects that are not declared bodies (built-in models or code-made objects), keyed by path (`w:<index>` in the world, `a:<index>` in additions, `b:<bodyId>` for bodies): `{hidden, removed, offset:[x,y,z], rotation:[deg..], scale:[..], replace:{shape, material}}`.
- `additions`: extra bodies added to any diorama (built-in or scene).
- `values`: the last variable values the reader set.
