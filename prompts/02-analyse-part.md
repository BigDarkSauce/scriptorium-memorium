# Analyse one part into a logical chain

Replace the placeholders. "depth" options: complete (length from the content), essential (only the spine), or exact N steps.

```text
You are turning one part of a book into a rigorous, minimal logical chain for an interactive 3D study room.
BOOK: <book title>
PART: <part title (pages a-b)>

Build as many as a COMPLETE chain needs (decide from the content; cap 60, merge trivial moves) steps. Order strictly by dependency; never use a symbol before defining it; brief wording, complete meaning, correct by the standards of the field; omit filler; state every assumption; derivations one move per line with a reason; fix errors in the source.
Attach every step to concrete bodies, objects or events ("bodies"). Abstract ideas (maths, statistics, economics, philosophy) get an honest physical embodiment: e.g. probability → balls through pegs, a market → buyers and sellers walking to a price, an argument → weights on a balance.
Showcases: about half of the steps get one. Prefer 3D: a built-in model when it fits exactly, otherwise a {"type":"scene", "request":...} to be authored in full later. Use 2D diagrams for pure graphs.
Built-in physical models (use {"type":<name>,"title":str,"params":{...},"lessons":[...]}): pendulum{L,g,theta0,damping} doublependulum{m1,m2,L1,L2,theta1,theta2,g,eps} spring{k,m,c,x0} projectile{v0,angle,g,drag} orbit{GM,r0,vfactor} collision{m1,m2,v1,v2,e} incline{angle,mu,m,g} lever{m1,x1,m2,x2,fulcrum,beam} wave{A,lambda,f,standing} gas{N,T} reaction{NA,NB,Ea,Eb,T} efield{q1,q2,d,qt,m} circuit{V,R,C,closed} lens{f,do,ho,sweep} surface{gravity,friction; "expr":"f(x,y)"} weatherglass{T,P,P0,auto,conc}. Any of them also accepts "technique":"card|sweep|topdown" and "lessons".
2D interactive diagrams: plot{exprs,x,y,params} tangent{expr,x,y} riemann{expr,a,b,y} vectors{a,b} matrix{m} complex{z,w} unitcircle fourier{wave,n} distribution{mode:normal|clt,mu,sigma} parametric{xt,yt,t,x,y} phase{dx,dy,range,yrange,params}.
Return ONLY JSON:
{"title":str,"summary":"one sentence","sourceNote":"coverage/limits or empty",
 "chain":[{"id":"S1","kind":"definition|axiom|postulate|lemma|theorem|derivation|formula|result|example|remark","title":str,
   "statement":"text with $inline LaTeX$","math":"display LaTeX or empty","derivation":[{"expr":"LaTeX","why":"short reason"}],
   "from":["S#",...],"bodies":["the concrete bodies/events this step is about"],
   "demos":[ a 2D diagram {"type":"plot",...} | a built-in 3D model {"type":"pendulum",...} | a 3D scene to be authored later {"type":"scene","title":str,"technique":"card|sweep|topdown","request":"precise description: actors, decor, variables, events, lessons"} ]}]}
Escape LaTeX backslashes in JSON strings (\\frac).
PART TEXT:
"""
<paste the text of the part here, or attach the PDF and say which pages>
"""
```
