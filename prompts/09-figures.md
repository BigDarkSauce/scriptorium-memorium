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
Fields: flow{nodes:[{id,label,note?}],edges:[{from,to,label?}],dir:"LR|TB"} · plot{x:[a,b],y:[a,b]?,curves:[{expr,label}],points:[[x,y,"label"?]],vlines:[{x,label}],hlines:[{y,label}],shade:{expr?,from,to,label},xlabel,ylabel} (expr in x and the animate param; sin cos exp log sqrt abs pow min max) · distribution{dist:"normal|t|chisq|binomial|poisson|uniform|exponential",params:{mean,sd | df | size,prob | lambda | min,max | rate},shade:{from?,to?,label},marks:[{x,label}],xlabel} · bars{categories:[…],series:[{name,values:[…]}],highlight:[i],ylabel} or bars{table:{columns,rows}} (a table turned into a chart) · hist{values:[…] | bins:[{from,to,count}],xlabel} · scatter{points:[[x,y,"label"?]],fit:"ols"|{slope,intercept},residuals:bool,logx:bool,xlabel,ylabel} · boxplot{groups:[{label,values:[…]} | {label,min,q1,median,q3,max,outliers:[…]}],ylabel} · numberline{min,max,step?,points:[{x,label,open?}],intervals:[{from,to,label,closedL,closedR}]} · tree{root:{label,children:[{label,edge,children}]}} · venn{sets:["A","B"],regions:{"A":str,"B":str,"AB":str},shade:["AB"],universe?} · timeline{events:[{t,label}]} · sketch{w:100,h:60,items:[{shape:"rect|circle|ellipse|line|arrow|text|path",x,y,w,h,r,x2,y2,d,text,tone:"accent|muted|ok|warn"}]} · codetrace{lang,lines:[{code,note,state:{var:value}}],output:[…]} · table{columns,rows,highlight:[[r,c]]} · contrast{wrong:{title,text},right:{title,text}} · pdf{id:"fig-…"} (the PDF's own figure; at most once in the whole chain).
Choose the kind by the idea: a process → flow; a curve or function → plot; a probability → distribution; a table → bars; one variable's shape → hist; two variables → scatter; groups → boxplot; an inequality or interval → numberline; a decision → tree; overlapping events → venn; an order → timeline; an arrangement → sketch; code → codetrace; a mistake → contrast. Small figures: few elements, large labels. Never invent data: use the numbers in the text, or draw the idea without numbers.
Return ONLY JSON: {"figures":[{"step":"S3","slot":"explain.0","figure":FIGURE}, …]}
```
