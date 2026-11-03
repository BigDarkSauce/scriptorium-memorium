// Every AI request the app makes. These same texts are exported as the portable prompt pack (prompts/*.md),
// so any AI (any Claude account, ChatGPT, Gemini…) can do the work and the JSON is pasted back into the app.

import { EVIDENCE_RULES } from './evidence.js';
export { EVIDENCE_RULES };

export const SCENE_SPEC = `SCENE SPEC (type "scene") — a universal 3D diorama on a round display plinth (radius 7, top at y=0, units ≈ metres; keep content within |x|,|z| < 6.5, 0 < y < 8).
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
 "lessons":[{"title":str,"text":str,"set":{"param":value},"focus":"bodyId","run":seconds,"until":"event:<id>","explain":"shown after the step completes"}],
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
RULES: physics/maths must be correct; every definition must be attached to visible bodies and to events; actors are the bodies the explanation is about (2–7 of them), decor gives place and scale and may react through behaviors (trees sway with wind, windows glow at night); lessons are 3–7 short steps, each changing something and pointing at what to watch; keep code under ~200 lines.`;

export const BUILTIN_TYPES = `Built-in physical models (use {"type":<name>,"title":str,"params":{...},"lessons":[...]}): pendulum{L,g,theta0,damping} doublependulum{m1,m2,L1,L2,theta1,theta2,g,eps} spring{k,m,c,x0} projectile{v0,angle,g,drag} orbit{GM,r0,vfactor} collision{m1,m2,v1,v2,e} incline{angle,mu,m,g} lever{m1,x1,m2,x2,fulcrum,beam} wave{A,lambda,f,standing} gas{N,T} reaction{NA,NB,Ea,Eb,T} efield{q1,q2,d,qt,m} circuit{V,R,C,closed} lens{f,do,ho,sweep} surface{gravity,friction; "expr":"f(x,y)"} weatherglass{T,P,P0,auto,conc}. Any of them also accepts "technique":"card|sweep|topdown" and "lessons".`;

export const DIAGRAM_TYPES = `2D interactive diagrams: plot{exprs,x,y,params} tangent{expr,x,y} riemann{expr,a,b,y} vectors{a,b} matrix{m} complex{z,w} unitcircle fourier{wave,n} distribution{mode:normal|clt,mu,sigma} parametric{xt,yt,t,x,y} phase{dx,dy,range,yrange,params}.`;

export const CHAIN_FORMAT = `{"title":str,"summary":"one sentence","sourceNote":"coverage/limits or empty",
 "chain":[{"id":"S1","kind":"definition|axiom|postulate|lemma|theorem|derivation|formula|result|example|remark","title":str,
   "statement":"text with $inline LaTeX$","math":"display LaTeX or empty","derivation":[{"expr":"LaTeX","why":"short reason"}],
   "terms":[{"term":"symbol or word","meaning":"plain definition with units"}],
   "intuition":"one or two plain sentences: the picture to hold in mind (no new symbols)",
   "misconception":"the most common wrong belief about this step and why it is wrong (or empty)",
   "check":{"q":"a short question that tests understanding, not recall","a":"its answer with one line of reasoning"},
   "basis":"source-text|standard|derived|empirical",
   "sources":[{"title":str,"authors":"Surname A; Surname B","year":n,"doi":"10.… or empty","url":"or empty","note":"what exactly it supports"}],
   "from":["S#",...],"bodies":["the concrete bodies/events this step is about"],
   "demos":[ a 2D diagram {"type":"plot",...,"source":{"title","year","doi"} if it shows real data} | a built-in 3D model {"type":"pendulum",...} | a 3D scene to be authored later {"type":"scene","title":str,"technique":"card|sweep|topdown","request":"precise description: actors, decor, variables, events, lessons"} ]}],
 "references":[ the key works for the whole part, same fields as sources ]}`;

// How the chain teaches (the app's approach to understanding; see docs/PEDAGOGY.md):
// every step is (1) defined before use with its terms and units, (2) derived one justified move at a time,
// (3) given a plain intuition and (4) a concrete embodiment (bodies + a showcase), (5) guarded against its
// commonest misconception, (6) closed with a self-check question, and (7) grounded in sources that really exist.
export const TEACHING_RULES = `TEACHING. For every step: list the new symbols/words in "terms" (meaning + units); add a one-line "intuition"; name the commonest "misconception" where one exists; end with a "check" question that needs understanding (predict, compare, explain why), with its answer. Mark "basis": source-text (stated in the part), standard (textbook knowledge of the field), derived (follows from earlier steps), empirical (a measured fact: needs a source). When the part's text and the established literature disagree, follow the literature, keep the step, and say what differs in "sourceNote".`;

export function chapterPrompt({ book, chapter, text, depth = 'complete', n, images = 0 }) {
  const steps = depth === 'exact' ? `exactly ${n}` : depth === 'essential' ? 'as many as the essential spine needs (decide from the content)' : 'as many as a COMPLETE chain needs (decide from the content; cap 60, merge trivial moves)';
  return `You are turning one part of a book into a rigorous, minimal logical chain for an interactive 3D study room.
BOOK: ${book}
PART: ${chapter}
${images ? `Attached: ${images} page image(s) from this part.` : ''}
Build ${steps} steps. Order strictly by dependency; never use a symbol before defining it; brief wording, complete meaning, correct by the standards of the field; omit filler; state every assumption; derivations one move per line with a reason; fix errors in the source.
Attach every step to concrete bodies, objects or events ("bodies"). Abstract ideas (maths, statistics, economics, philosophy) get an honest physical embodiment: e.g. probability → balls through pegs, a market → buyers and sellers walking to a price, an argument → weights on a balance.
Showcases: about half of the steps get one. Prefer 3D: a built-in model when it fits exactly, otherwise a {"type":"scene", "request":...} to be authored in full later. Use 2D diagrams for pure graphs.
${BUILTIN_TYPES}
${DIAGRAM_TYPES}
${TEACHING_RULES}
${EVIDENCE_RULES}
Return ONLY JSON:
${CHAIN_FORMAT}
Escape LaTeX backslashes in JSON strings (\\\\frac).
PART TEXT:
"""
${String(text || '').slice(0, 180000)}
"""`;
}

export function authorPrompt(req, context = '') {
  return `Author a high-fidelity interactive 3D diorama that embodies an idea through bodies, events and processes.
WHAT IT MUST SHOW: ${req.request || req.title}
${context ? 'CONTEXT (the study step it illustrates): ' + context : ''}
Preferred technique: ${req.technique || 'choose the best'}.
Make it beautiful and alive like a living miniature under glass: a composed scene with 2–7 actors (the bodies the idea is about, each with a clear label and one-line "describe"), scenic decor that gives place and scale and reacts to the simulation through behaviors, scene-appropriate environment and lighting, correct dynamics in code, events at the meaningful moments, readouts and a live plot of the telling quantity, and 3–7 lessons that each change something and say what to watch.
Ground the physics and any numbers (constants, rates, sizes, prices) in the literature: when search tools are available, look up the governing law and realistic parameter values first; put what you used in a top-level "sources" array (title, authors, year, doi, note) and never invent a DOI.
${SCENE_SPEC}
Return ONLY the JSON scene spec.`;
}

export function editPrompt(spec, sel, request, context = '') {
  return `You are editing an interactive 3D diorama spec.
${context ? 'STUDY CONTEXT: ' + context + '\n' : ''}CURRENT SPEC: ${JSON.stringify(spec)}
${sel ? 'SELECTED OBJECT: ' + JSON.stringify(sel) + ' (for built-in models, edits to objects live in "overrides" keyed by path, and new objects in "additions" (body specs))' : 'No object selected: the request is about the whole diorama.'}
VIEWER REQUEST: ${request}
Return ONLY the complete new spec as JSON. Keep everything the request does not change (including overrides/additions). You may keep the type, change params/lessons/overrides/additions, or convert a built-in model into a full "scene" spec when the request needs new bodies, events or behaviour.
${BUILTIN_TYPES}
${SCENE_SPEC}`;
}

export function splitPrompt({ book, pages, outline }) {
  return `Split this book into study parts (chapters or major sections) with page ranges.
BOOK: ${book} (${pages} pages)
${outline ? 'OUTLINE/TEXT SAMPLE:\n' + outline.slice(0, 60000) : ''}
Return ONLY JSON: {"parts":[{"title":str,"startPage":n,"endPage":n,"summary":"one sentence"}]}`;
}

export function detailPrompt({ step, chain, request }) {
  return `Expand one step of a study chain into its own detailed sub-chain (a sub-scroll), in the same format.
PARENT STEP: ${JSON.stringify(step)}
WHOLE CHAIN (for context): ${JSON.stringify((chain || []).map(s => ({ id: s.id, title: s.title })))}
REQUEST: ${request || 'Derive and explain this step in full detail, with intermediate definitions, a worked example and showcases.'}
${BUILTIN_TYPES}
${DIAGRAM_TYPES}
${TEACHING_RULES}
${EVIDENCE_RULES}
Return ONLY JSON: ${CHAIN_FORMAT}`;
}
