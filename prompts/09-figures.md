# Design the missing figures

Sent for paragraphs of 60+ words and teaching boxes (Picture it, Common mistake, Check yourself) that still have no valid figure. Whatever is still missing afterwards, the app builds from the step itself.

```text
You are illustrating one scroll of a study chain. For each paragraph or box listed, design ONE figure that shows what the text says (not decoration), using the text's own numbers.
BOOK: <book title>
PART: <part title>
NEEDED:
- S3 "<step title>" (<1.2>):
   explain.0: "<the paragraph>"
   misconception (small): "<the mistake>"
FIGURE (a JSON drawing the app renders; every figure has "kind" and "caption" (what to see, ≤ 25 words); optional "animate":true for a short loop (or, on a plot, {"param":"a","from":0.1,"to":1,"period":4}); data from the PDF gives "ref", data from outside gives "extra":[{what,source}]). Kinds:
 flow: a process, a pipeline, cause → effect, a decision path, input → function → output
 plot: functions and curves y = f(x) (axes, labelled curves, data points, shaded areas, reference lines)
 distribution: a probability distribution (normal, t, chisq, binomial, poisson, uniform, exponential) with shaded P(…) areas and marked values
 bars: categories with values, a table turned into a chart (table → chart)
 hist: the shape of one continuous variable (values or bin counts)
 scatter: two continuous variables, with an optional least-squares line and residuals
 boxplot: a continuous variable split by groups (five-number summaries)
 numberline: values, inequalities and intervals on one axis (X ≤ 3 vs X < 3, confidence intervals)
 tree: a branching classification or a probability tree (edge labels = probabilities or conditions)
 venn: sets, events and their overlaps (2 or 3 sets)
 timeline: events in order of time or of execution
 sketch: a labelled sketch of a physical or abstract arrangement (rects, circles, arrows, text on a 100 × 60 canvas)
 codetrace: code run line by line: what each line does and the values it leaves behind; the output
 table: a small table with highlighted cells
 contrast: a wrong idea set against the right one (✗ / ✓), for common mistakes
 pdf: the PDF's own figure (by id), only when it is the best illustration; shown once in the whole scroll
 progressive_construction: a system built up part by part: the simplest version first, each new part added because the previous version fails a stated problem
 state_machine: observable state: components and registers on wires; each clock tick sends a value along a wire and latches a register
 transform2d: a 2×2 matrix as a motion of the plane: grid, basis vectors î ĵ, the unit square becoming a parallelogram of area det, the equation linked
 distribution_lab: a distribution built sample by sample: histogram, density curve, μ and σ sliders, the formula linked to the picture
 causal_loop: variables linked by signed influences (+ / −) with feedback loops labelled reinforcing (R) or balancing (B); a pulse propagates from a node
 competing_explanations: two to four rival explanations of the same facts, what each predicts, and which evidence tells them apart
 flow_network: a business model as a system: customers, firms, suppliers, intermediaries, competitors with money and goods flowing; a unit-economics breakdown
 argument_map: an argument as a navigable graph: question → claim → premises; objection → counterexample; response → revised claim; challenging a premise shows what it affects
 data_narrative: evidence as a sequence of chart states driven by steps, with annotations and a provenance line; "mode":"slides" for a plain dense analytic slide
 algorithm_sandbox: grid pathfinding (BFS, Dijkstra, greedy, A*) with movable start and goal, paintable walls, the frontier and visited set drawn
 bayes_update: competing hypotheses with prior beliefs; each piece of evidence, when revealed, reweights them by how likely it is under each (Bayes), shown as bars and as natural frequencies out of 100
 emergence: agents on a grid following one local rule (e.g. Schelling: move if fewer than t % of neighbours are like me); run it and watch a global pattern no agent intended; compare thresholds
 control_loop: a feedback controller: setpoint, measured output, error, controller gain and a delay; move the setpoint or add a disturbance and watch overshoot or oscillation appear
 analogy_map: a source idea mapped onto a target: which parts correspond, which relations carry over, and where the likeness breaks
Fields: flow{nodes:[{id,label,note?}],edges:[{from,to,label?}],dir:"LR|TB"} · plot{x:[a,b],y:[a,b]?,curves:[{expr,label}],points:[[x,y,"label"?]],vlines:[{x,label}],hlines:[{y,label}],shade:{expr?,from,to,label},xlabel,ylabel} (expr in x and the animate param; sin cos exp log sqrt abs pow min max) · distribution{dist:"normal|t|chisq|binomial|poisson|uniform|exponential",params:{mean,sd | df | size,prob | lambda | min,max | rate},shade:{from?,to?,label},marks:[{x,label}],xlabel} · bars{categories:[…],series:[{name,values:[…]}],highlight:[i],ylabel} or bars{table:{columns,rows}} (a table turned into a chart) · hist{values:[…] | bins:[{from,to,count}],xlabel} · scatter{points:[[x,y,"label"?]],fit:"ols"|{slope,intercept},residuals:bool,logx:bool,xlabel,ylabel} · boxplot{groups:[{label,values:[…]} | {label,min,q1,median,q3,max,outliers:[…]}],ylabel} · numberline{min,max,step?,points:[{x,label,open?}],intervals:[{from,to,label,closedL,closedR}]} · tree{root:{label,children:[{label,edge,children}]}} · venn{sets:["A","B"],regions:{"A":str,"B":str,"AB":str},shade:["AB"],universe?} · timeline{events:[{t,label}]} · sketch{w:100,h:60,items:[{shape:"rect|circle|ellipse|line|arrow|text|path",x,y,w,h,r,x2,y2,d,text,tone:"accent|muted|ok|warn"}]} · codetrace{lang,lines:[{code,note,state:{var:value}}],output:[…]} · table{columns,rows,highlight:[[r,c]]} · contrast{wrong:{title,text},right:{title,text}} · pdf{id:"fig-…"} (the PDF's own figure; at most once in the whole chain).
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
Choose the kind by the idea (and by the step's structure, DOMAIN-AWARE VISUAL GRAMMAR below: a build-up → progressive_construction; registers and a clock → state_machine; a matrix → transform2d; sampling → distribution_lab; feedback → causal_loop; rival accounts → competing_explanations; a business model → flow_network; an argument → argument_map; evidence over time → data_narrative; a search → algorithm_sandbox): a process → flow; a curve or function → plot; a probability → distribution; a table → bars; one variable's shape → hist; two variables → scatter; groups → boxplot; an inequality or interval → numberline; a decision → tree; overlapping events → venn; an order → timeline; an arrangement → sketch; code → codetrace; a mistake → contrast. Small figures: few elements, large labels. Never invent data: use the numbers in the text, or draw the idea without numbers.
DOMAIN-AWARE VISUAL GRAMMAR (choose each step's picture by the STRUCTURE of its idea, not by habit):
DOMAINS: cs, maths, economics, business, philosophy, data, physical. STRUCTURES → primitive (medium): construction → progressive_construction (figure); state_machine → state_machine (figure); transformation → transform2d (simulation); distribution → distribution_lab (simulation); causal_graph → causal_loop (simulation); competing → competing_explanations (figure); flow_network → flow_network (panel); argument_graph → argument_map (figure); taxonomy → tree (figure); data_narrative → data_narrative (figure); algorithm → algorithm_sandbox (simulation); mechanism → scene (diorama); agent_system → scene (diorama); inference → bayes_update (simulation); emergence → emergence (simulation); control → control_loop (simulation); analogy → analogy_map (figure).
- Give every step "visual":{"domain":"…","structure":"…","primitive":"…","why":"≤ 15 words"}.
- 3D diorama ONLY for spatial ideas (parts with places, physical mechanisms, agents moving in space). Abstract structures get their primitive as the "figure" of the explaining paragraph, or as a demo {"type":"figure","title":str,"purpose":str,"figure":{…primitive…}}.
- A network (flows, loops, state machines) may also be opened on the lectern (2.5D) and, for construction, state_machine, causal_loop and flow_network, as a topdown diorama: the app does that from the same spec.
- A dense table of numbers is a plain analytic slide (data_narrative with "mode":"slides"), not a spectacle.
- PhET rules: at most two continuous controls, every control with immediate feedback, the invisible made visible (state, flows, frontier, signs), the formula's symbols linked to the picture.
- Programming: build it up (simplest version first, each part because the last version fails) and show state changing per step. Maths: an equation as an operation (a continuous motion), what is invariant, samples before the curve. Economics: causal chains and loops with signs; rival explanations with the evidence that separates them. Business: actors, goods and money, the unit economics of one sale. Philosophy: question → claim → premises → objection → response → revised claim, each a node. Data: a question, chart states, annotations, the provenance line.
Return ONLY JSON: {"figures":[{"step":"S3","slot":"explain.0","figure":FIGURE}, …]}
```
