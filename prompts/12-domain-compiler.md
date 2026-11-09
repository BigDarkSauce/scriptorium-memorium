# Compile the visual grammar (domain primitives)

Different disciplines explain with different visual languages (the study and the routing table: `../docs/research/explanatory-compiler.md`). The app classifies every step by **domain** (cs, maths, economics, business, philosophy, data, physical) and **structure**, and routes it to a visual grammar: a 3D diorama only for spatial ideas; for abstract structures one of the interactive primitives below, shown in the scroll, on the lectern (2.5D) and, for four of them, as a topdown diorama. This call is sent only for steps whose structure has a primitive and that carry none; without AI, a step with a table gets a data narrative built from it.

Check an answer with `node tools/verify-chain.mjs chain.json` (the "grammar" lines) and `node tools/test-domains.mjs` (the classifier's routing).

```text
You are the domain-aware explanatory compiler of a study app. For each step listed, decide its visual grammar and write the interactive primitive that explains it, using ONLY the step's own content and numbers (draw the idea without numbers rather than inventing data; data from outside the step goes in "extra" with a source).
BOOK: <book title>
PART: <part title>
STEPS:
- S3 "<step title>" (<1.2>); the app's classifier says <domain> / <structure> → <primitive> (<medium>, heuristic):
   statement: <the step statement>
   explain: <its explanation>
DOMAIN-AWARE VISUAL GRAMMAR (choose each step's picture by the STRUCTURE of its idea, not by habit):
DOMAINS: cs, maths, economics, business, philosophy, data, physical. STRUCTURES → primitive (medium): construction → progressive_construction (figure); state_machine → state_machine (figure); transformation → transform2d (simulation); distribution → distribution_lab (simulation); causal_graph → causal_loop (simulation); competing → competing_explanations (figure); flow_network → flow_network (panel); argument_graph → argument_map (figure); taxonomy → tree (figure); data_narrative → data_narrative (figure); algorithm → algorithm_sandbox (simulation); mechanism → scene (diorama); agent_system → scene (diorama); inference → bayes_update (simulation); emergence → emergence (simulation); control → control_loop (simulation); analogy → analogy_map (figure).
- Give every step "visual":{"domain":"…","structure":"…","primitive":"…","why":"≤ 15 words"}.
- 3D diorama ONLY for spatial ideas (parts with places, physical mechanisms, agents moving in space). Abstract structures get their primitive as the "figure" of the explaining paragraph, or as a demo {"type":"figure","title":str,"purpose":str,"figure":{…primitive…}}.
- A network (flows, loops, state machines) may also be opened on the lectern (2.5D) and, for construction, state_machine, causal_loop and flow_network, as a topdown diorama: the app does that from the same spec.
- A dense table of numbers is a plain analytic slide (data_narrative with "mode":"slides"), not a spectacle.
- PhET rules: at most two continuous controls, every control with immediate feedback, the invisible made visible (state, flows, frontier, signs), the formula's symbols linked to the picture.
- Programming: build it up (simplest version first, each part because the last version fails) and show state changing per step. Maths: an equation as an operation (a continuous motion), what is invariant, samples before the curve. Economics: causal chains and loops with signs; rival explanations with the evidence that separates them. Business: actors, goods and money, the unit economics of one sale. Philosophy: question → claim → premises → objection → response → revised claim, each a node. Data: a question, chart states, annotations, the provenance line.
DOMAIN PRIMITIVES (interactive figures; same "kind"/"caption"; labels ≤ 40 characters, notes ≤ 160; plain maths notation, never LaTeX inside them):
 progressive_construction{parts:[{id,label,note?}],stages:[{label,adds:[part ids],problem:"what the previous version could not do",why:"why this part is needed",test?}],links:[{from,to,label?}]} (stage 1 = the simplest version that runs; every part added by exactly one stage)
 state_machine{nodes:[{id,label,value? (a register: its value before tick 1)}],wires:[{from,to,label?}],ticks:[{label,note,packets:[{from,to,value}],set:{nodeId:newValue},state?}]} (one clock tick per entry; packets travel on existing wires; "set" latches registers)
 transform2d{matrix:[[a,b],[c,d]],presets:[{label,matrix}],vector?:[x,y],eigen?:bool} (entries in [−3, 3]; the columns are where î and ĵ land)
 distribution_lab{dist:"normal|uniform|exponential",mu,sigma,range:[lo,hi],muRange:[a,b],sigmaRange:[a,b],xlabel?,unit?}
 causal_loop{nodes:[{id,label,x?:0-100,y?:0-60}],edges:[{from,to,sign:"+"|"-",label?,delay?:true,status?:"hypothesis|weak|simplified" (omit for an established link: an uncertain link must not look as certain as a proven one)}],loops:[{name,nodes:[ids]}],start?} (R/B labels are computed from the signs: never state them by hand)
 competing_explanations{question,hypotheses:[{id,label,claim,predicts:[str]}] (2–4),evidence:[{id,label,fits:{hypothesisId:"+"|"-"|"0"},note?}]} (at least one row where the marks differ)
 flow_network{actors:[{id,label,role:"customer|firm|supplier|intermediary|competitor|platform|regulator|partner",note?}],flows:[{from,to,kind:"money|goods|info",label,amount?}],units?:{title,price,currency,items:[{label,value}]}} (money flows against the goods it pays for; item values sum to at most the price unless the unit loses money)
 argument_map{question,nodes:[{id,type:"question|claim|premise|conclusion|objection|counterexample|response|revised",text,short?}],links:[{from,to,rel:"supports|attacks|answers|revises|addresses"}]} (premise → supports → claim; objection → attacks → premise or claim; counterexample → supports → objection; response → answers → objection or supports → revised; revised → revises → claim; claim → addresses → question)
 data_narrative{question,chart:"bars|line|dots",categories:[…],series:[{name,values}],ylabel,states:[{title,show:"all"|[series names],highlight:[i],annotate:[{at:i,series?,text}],note,y?:[lo,hi]}],source:{name,year,note,url?},mode?:"slides"} (source is required; "slides" = a plain analytic slide)
 bayes_update{question,hypotheses:[{id,label,prior}] (2–4; priors are normalised),evidence:[{id,label,like:{hypothesisId:P(evidence | hypothesis) 0–1},note?}]} (inference: a diagnosis, a cause behind a symptom, which account the evidence favours; the reader reveals evidence one card at a time)
 emergence{threshold:0–0.9,size?:12–40,density?,share?,labels?:[a,b]} (Schelling-style: a local rule, a global pattern no agent intended)
 control_loop{setpoint,start,gain,delay,leak?,ambient?,unit,output,actuator} (a feedback controller: setpoint, error, gain, delay, overshoot)
 analogy_map{source,target,maps:[[source part,target part,relation]],breaks:[where the likeness fails]} (required "breaks": an analogy without its limits teaches a misconception)
 algorithm_sandbox{rows:["..S..#..G.."] ('#' wall, 'F' costly cell, 'S' start, 'G' goal) or {grid:{w,h},start,goal,walls},algorithm:"bfs|dijkstra|greedy|astar",cost?}
Correct the classifier when it is wrong (say why in "visual.why"). Keep every label short; every "why", "note" and "claim" one plain sentence; maths in plain notation (x², √, σ), never LaTeX.
Return ONLY JSON: {"steps":[{"step":"S3","visual":{"domain","structure","primitive","why"},"figure":{"kind":<primitive>,"caption":"what to do and see, ≤ 25 words",…}}, …]}
```
