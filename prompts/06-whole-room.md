# A whole book room in one answer

For AIs that can produce long outputs. Attach the PDF and send:

```text
Read the attached book. Split it into its chapters (or major sections) with page ranges, then for EACH part build a rigorous logical chain exactly as specified below. Return ONLY one JSON object:
{"format":"scriptorium-room/1","book":{"title":str,"pages":n},"room":{"parts":[{"title":str,"startPage":n,"endPage":n,"summary":"one sentence","analysis":CHAIN}]}}
where CHAIN is:
{"title":str,"summary":"one sentence","sourceNote":"coverage/limits or empty",
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
 "references":[ the key works for the whole part, same fields as sources ]}

Built-in physical models (use {"type":<name>,"title":str,"params":{...},"lessons":[...]}): pendulum{L,g,theta0,damping} doublependulum{m1,m2,L1,L2,theta1,theta2,g,eps} spring{k,m,c,x0} projectile{v0,angle,g,drag} orbit{GM,r0,vfactor} collision{m1,m2,v1,v2,e} incline{angle,mu,m,g} lever{m1,x1,m2,x2,fulcrum,beam} wave{A,lambda,f,standing} gas{N,T} reaction{NA,NB,Ea,Eb,T} efield{q1,q2,d,qt,m} circuit{V,R,C,closed} lens{f,do,ho,sweep} surface{gravity,friction; "expr":"f(x,y)"} weatherglass{T,P,P0,auto,conc}. Any of them also accepts "technique":"card|sweep|topdown" and "lessons".
2D interactive diagrams: plot{exprs,x,y,params} tangent{expr,x,y} riemann{expr,a,b,y} vectors{a,b} matrix{m} complex{z,w} unitcircle fourier{wave,n} distribution{mode:normal|clt,mu,sigma} parametric{xt,yt,t,x,y} phase{dx,dy,range,yrange,params}.
For 3D scenes not covered by the built-in models, put {"type":"scene","title":str,"technique":"card|sweep|topdown","request":"precise description"}; the app (or prompt 03) authors them later.
```

Import the file in the app with *Import / export → Import JSON*. It appears as a new scroll on your first bookcase.
