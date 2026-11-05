# Author a 3D diorama

```text
Author a high-fidelity interactive 3D diorama that embodies an idea through bodies, events and processes.
WHAT IT MUST SHOW: <what the diorama must show: actors, decor, variables, events, lessons>
THE QUESTION IT MUST ANSWER: <the question the demo answers>
CONTEXT (the study step it illustrates): <the study step it illustrates | the step answers: … | and opens: …>
Preferred technique: <card | sweep | topdown>.
Make it beautiful and alive like a living miniature under glass: a composed scene with 2–7 actors (the bodies the idea is about, each with a clear label and one-line "describe"), scenic decor that gives place and scale and reacts to the simulation through behaviors, scene-appropriate environment and lighting, correct dynamics in code, events at the meaningful moments, readouts and a live plot of the telling quantity, and 3–6 lessons that each change something and say what to watch.
Use the numbers of the study step (the book's own values) for params and readouts. Lessons form a question thread: each lesson's "question" is the one it settles, its "opens" the next lesson's question; the first lesson's question is the question the step answers, the last lesson's "opens" is the question the step opens.
Ground the physics and any numbers (constants, rates, sizes, prices) in the literature: when search tools are available, look up the governing law and realistic parameter values first; put what you used in a top-level "sources" array (title, authors, year, doi, note) and never invent a DOI. Values that are not in the study step are additions from outside the book: list them in a top-level "extra" array ({what, source}).
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
EXPLAINER RULES (how a 3D demo's lessons show a mechanism):
1. Start from the phenomenon or the problem (what happens without it, what you see or hear), not from the list of parts.
2. Name the parts before the process: every actor's "describe" gives its JOB in ≤ 10 words (the tour introduces them first).
3. Order every explanation along the causal chain and give that order as "chain" (cause first, effect last), never in the order of position.
4. One scale per cause: when the cause moves to a smaller scale, use "zoom" with "stations" named after the levels of organisation (organ, tissue, cell, molecule).
5. Peel ("peel") only to reveal the active part, and go back afterwards; use "isolate" for the subsystem that acts now, not on every lesson.
6. A POV ("shot":"pov" or "track") only for what a part experiences (a squeeze, an impulse, its timing), never as the only view of the structure. Molecules move randomly, in crowds, and most collisions do nothing: in micro scenes say "random"/"diffuses", never "travels to", "heads for", "seeks" or "finds".
7. Put a worked number with its unit on every mechanism that has one (a ratio, a period, a rate), in "explain" or a readout, e.g. 7:56 × 8:60 = 1:60.
8. At most one counterfactual ("what if it weren't there") per diorama, marked as hypothetical.
9. Name what is left out ("there are many parts; here are the three that matter").
10. Keep 3–6 lessons, each with ≤ 8 chain links and on-object labels of ≤ 4 words (definitions go in the text); expand every acronym at first use.
Return ONLY the JSON scene spec.
```
