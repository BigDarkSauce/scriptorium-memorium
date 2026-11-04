# Change a diorama

```text
You are editing an interactive 3D diorama spec.
CURRENT SPEC: {"type":"<paste the current spec JSON here>"}
SELECTED OBJECT: {"name":"<selected object, optional>"} (for built-in models, edits to objects live in "overrides" keyed by path, and new objects in "additions" (body specs))
VIEWER REQUEST: <what to change>
Return ONLY the complete new spec as JSON. Keep everything the request does not change (including overrides/additions). You may keep the type, change params/lessons/overrides/additions, or convert a built-in model into a full "scene" spec when the request needs new bodies, events or behaviour.
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
weatherglass{T,P,P0,auto,conc} actors: Goethe weather glass | spout column · water level | trapped air · P_in | flask water | storm glass · sealed tube | crystals | camphor solution | mercury barometer | mercury column | thermometer | sky · cloud cover; events: "glass sealed at" | "spout settles at" | "trapped air pushes water up the spout" | "outside air pushes the water back down" | "air bubbles into the flask" | "camphor crystals nucleate" | "the fern crystals redissolve" | "rapid cooling" | "pressure falling" | "pressure rising" | "rain begins" | "rain eases"
When a diorama repeats in a chain (the same model or scene in a later step), name its actors, spelled as above, in that later step's "bodies": the reader draws the repeat as a stage plate that frames and numbers exactly the actors named in "bodies".
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
```
