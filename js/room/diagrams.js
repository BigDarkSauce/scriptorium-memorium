// Interactive 2D diagrams (plot with optional measured "points", tangent, riemann, vectors, matrix, complex, unitcircle, fourier, distribution, parametric, phase, customsvg).
// Ported from Scriptorium v2; used inline in the reading scroll.
import { el, compile, fmt, clamp, uid, mod, MATHNAMES } from '../util.js';
export const SVG_TYPES=['plot','tangent','riemann','vectors','matrix','complex','unitcircle','fourier','distribution','parametric','phase','customsvg'];
export function SVGDEMO(spec,host,fail){
  const NS='http://www.w3.org/2000/svg';const W=600,H=340,P=36;
  const t=spec.type;const wrap=el('div',{class:'svgdemo'});host.append(wrap);
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  wrap.append(el('div',{class:'svgwrap'},[svg]));
  const ctrls=el('div',{class:'ctrls'}),reads=el('div',{class:'readouts'});wrap.append(ctrls,reads);
  const mk=(n,a,parent=svg)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);parent.append(e);return e};
  const P_=t==='customsvg'?{}:normParams(spec.params);const pv={};for(const k in P_)pv[k]=P_[k][2];
  let anim=0,alive=true,shown=false;
  // animation loops end by themselves once the diagram leaves the page (scroll closed or re-rendered without cleanup)
  const gone=()=>{if(wrap.isConnected){shown=true;return false}return shown};
  const slider=(name,min,max,val,step,on,label)=>{const out=el('b',{text:fmt(val)});const inp=el('input',{type:'range',min,max,step:step||(max-min)/200,value:val,id:'r'+uid(),'aria-label':label||name});inp.oninput=()=>{out.textContent=fmt(+inp.value);on(+inp.value)};ctrls.append(el('label',{class:'ctrl'},[el('span',{},[label||name,out]),inp]));return inp};
  if(t!=='customsvg')for(const k in P_)if(!(spec.hidden||[]).includes(k))slider(k,P_[k][0],P_[k][1],P_[k][2],null,v=>{pv[k]=v;draw()});
  const pn=Object.keys(P_);
  let xr=spec.x||[-5,5],yr=spec.y||spec.yrange||[-3,3];
  if(t==='phase'){xr=spec.range||xr;yr=spec.yrange||spec.range||yr}
  if(t==='unitcircle'){xr=[-1.6,6.6];yr=[-1.4,1.4]}
  if(t==='vectors'){xr=spec.x||[-6,6];yr=spec.y||[-3.5,3.5]}
  const X=x=>P+(x-xr[0])/(xr[1]-xr[0])*(W-2*P),Y=y=>H-P-(y-yr[0])/(yr[1]-yr[0])*(H-2*P);
  const IX=px=>xr[0]+(px-P)/(W-2*P)*(xr[1]-xr[0]),IY=py=>yr[0]+(H-P-py)/(H-2*P)*(yr[1]-yr[0]);
  const COLORS=['#2d5b8e','#9c3a28','#3f7d6e','#8f733a','#6a4a8a'];
  function axes(){const g=mk('g',{});const step=niceStep(xr[1]-xr[0]),stepy=niceStep(yr[1]-yr[0]);
    for(let x=Math.ceil(xr[0]/step)*step;x<=xr[1]+1e-9;x+=step){mk('line',{x1:X(x),x2:X(x),y1:P,y2:H-P,stroke:'rgba(90,60,30,.12)'},g);mk('text',{x:X(x),y:H-P+14,'font-size':10,'text-anchor':'middle',fill:'#5b4532','font-family':'IBM Plex Mono, monospace'},g).textContent=fmt(x,2)}
    for(let y=Math.ceil(yr[0]/stepy)*stepy;y<=yr[1]+1e-9;y+=stepy){mk('line',{y1:Y(y),y2:Y(y),x1:P,x2:W-P,stroke:'rgba(90,60,30,.12)'},g);mk('text',{x:P-5,y:Y(y)+3,'font-size':10,'text-anchor':'end',fill:'#5b4532','font-family':'IBM Plex Mono, monospace'},g).textContent=fmt(y,2)}
    if(yr[0]<0&&yr[1]>0)mk('line',{x1:P,x2:W-P,y1:Y(0),y2:Y(0),stroke:'#5b4532','stroke-width':1.2},g);
    if(xr[0]<0&&xr[1]>0)mk('line',{y1:P,y2:H-P,x1:X(0),x2:X(0),stroke:'#5b4532','stroke-width':1.2},g);
    if(spec.xlabel)mk('text',{x:W-P,y:H-P-6,'font-size':12,'text-anchor':'end',fill:'#2a1e15','font-style':'italic'},g).textContent=spec.xlabel;
    if(spec.ylabel)mk('text',{x:P+6,y:P+12,'font-size':12,fill:'#2a1e15','font-style':'italic'},g).textContent=spec.ylabel;return g}
  function curve(f,color,width=2.2,dash){let d='',pen=false;const N=500;for(let i=0;i<=N;i++){const x=xr[0]+(xr[1]-xr[0])*i/N,y=f(x);if(!isFinite(y)||y<yr[0]-(yr[1]-yr[0])*2||y>yr[1]+(yr[1]-yr[0])*2){pen=false;continue}d+=(pen?'L':'M')+X(x).toFixed(1)+' '+Y(y).toFixed(1);pen=true}
    return mk('path',{d,fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dash||'','clip-path':'url(#clp'+cid+')'})}
  const cid=uid();const dfs=mk('defs',{});const cp=mk('clipPath',{id:'clp'+cid},dfs);mk('rect',{x:P,y:P,width:W-2*P,height:H-2*P},cp);
  const svgPt=ev=>{const r=svg.getBoundingClientRect();return[(ev.clientX-r.left)/r.width*W,(ev.clientY-r.top)/r.height*H]};
  let draw=()=>{},state={};
  const clear=()=>{[...svg.childNodes].forEach(n=>{if(n!==dfs)n.remove()})};
  if(t==='plot'){
    const exprs=(spec.exprs||[spec.expr||'sin(x)']).slice(0,5);const fs=exprs.map(e=>compile(e,['x',...pn]));let hx=null;
    // "points": measured data drawn as dots over the curves ([[x,y],…] or [{x,y,label}]); its origin is cited in the demo's source/extra
    const pts=(Array.isArray(spec.points)?spec.points:[]).map(p=>Array.isArray(p)?{x:+p[0],y:+p[1],label:p[2]}:{x:+p.x,y:+p.y,label:p.label}).filter(p=>isFinite(p.x)&&isFinite(p.y));
    // legend: each curve's name ("labels", else the ylabel, else the demo title; the raw expression only as a tooltip),
    // top right inside the frame, so it never meets the y-axis label (top left) or the x-axis label (bottom right)
    const names=exprs.map((e,i)=>{const L=Array.isArray(spec.labels)?spec.labels[i]:null;if(L)return String(L);const base=String(spec.ylabel||spec.title||'f');return exprs.length>1?base+' · '+(i+1):base});
    const legend=()=>{const rows=names.map((n,i)=>({n:n.length>34?n.slice(0,33)+'…':n,c:COLORS[i],e:exprs[i]}));if(pts.length)rows.push({n:spec.pointsLabel||'data points',dot:true});if(!rows.length)return;
      const g=mk('g',{'font-size':11,'font-family':'IBM Plex Mono, monospace'}),wid=Math.min(W/2-P,Math.max(...rows.map(r=>r.n.length))*6.6+30),x0=W-P-8-wid,y0=P+(spec.ylabel?20:6);
      mk('rect',{x:x0,y:y0,width:wid,height:rows.length*16+6,rx:3,fill:'rgba(251,246,234,.86)',stroke:'rgba(90,60,30,.25)'},g);
      rows.forEach((r,i)=>{const y=y0+13+i*16;if(r.dot)mk('circle',{cx:x0+14,cy:y-3,r:3.4,fill:'#fbf6ea',stroke:'#2a1e15','stroke-width':1.5},g);else mk('rect',{x:x0+8,y:y-4.5,width:12,height:3,fill:r.c},g);const tx=mk('text',{x:x0+26,y,fill:'#2a1e15'},g);tx.textContent=r.n;if(r.e){const ti=document.createElementNS(NS,'title');ti.textContent=r.e;tx.append(ti)}})};
    draw=()=>{clear();axes();fs.forEach((f,i)=>curve(x=>f(x,...pn.map(k=>pv[k])),COLORS[i]));
      pts.forEach(p=>{mk('circle',{cx:X(p.x),cy:Y(p.y),r:3.6,fill:'#fbf6ea',stroke:'#2a1e15','stroke-width':1.6});if(p.label)mk('text',{x:X(p.x)+6,y:Y(p.y)-6,'font-size':10,fill:'#2a1e15','font-family':'IBM Plex Mono, monospace'}).textContent=p.label});
      legend();
      reads.innerHTML='';if(hx!=null){mk('line',{x1:X(hx),x2:X(hx),y1:P,y2:H-P,stroke:'#9c3a28','stroke-dasharray':'3 3'});reads.append(el('span',{html:'<i>x</i> '+fmt(hx)}));fs.forEach((f,i)=>{const y=f(hx,...pn.map(k=>pv[k]));if(isFinite(y))mk('circle',{cx:X(hx),cy:Y(y),r:4,fill:COLORS[i]});reads.append(el('span',{html:`<i>f${i+1}</i> ${fmt(y)}`}))})}else reads.append(el('span',{html:'<i>Move the pointer over the plot to read values</i>'}))};
    svg.addEventListener('pointermove',ev=>{const[x]=svgPt(ev);hx=clamp(IX(x),xr[0],xr[1]);draw()});
  }else if(t==='tangent'){
    const f=compile(spec.expr||'x^2',['x',...pn]);let x0=(xr[0]+xr[1])/2+.7,h=1.5;
    slider('h',0.001,Math.max(.5,(xr[1]-xr[0])/3),h,0.001,v=>{h=v;draw()},'h (secant step)');
    draw=()=>{clear();axes();const F=x=>f(x,...pn.map(k=>pv[k]));curve(F,COLORS[0]);
      const y0=F(x0),y1=F(x0+h),ms=(y1-y0)/h,eps=1e-5,md=(F(x0+eps)-F(x0-eps))/(2*eps);
      curve(x=>y0+ms*(x-x0),'#9c3a28',1.6,'6 4');curve(x=>y0+md*(x-x0),'#3f7d6e',1.8);
      mk('line',{x1:X(x0),y1:Y(y0),x2:X(x0+h),y2:Y(y0),stroke:'#8f733a','stroke-dasharray':'2 3'});mk('line',{x1:X(x0+h),y1:Y(y0),x2:X(x0+h),y2:Y(y1),stroke:'#8f733a','stroke-dasharray':'2 3'});
      mk('text',{x:(X(x0)+X(x0+h))/2,y:Y(y0)+14,'font-size':11,fill:'#8f733a','text-anchor':'middle'}).textContent='h';
      mk('circle',{cx:X(x0+h),cy:Y(y1),r:5,fill:'#9c3a28'});const dot=mk('circle',{cx:X(x0),cy:Y(y0),r:8,fill:'#2a1e15',stroke:'#cfa84f','stroke-width':2,style:'cursor:grab'});
      reads.innerHTML=`<span><i>x₀</i> ${fmt(x0)}</span><span><i>secant slope</i> ${fmt(ms)}</span><span><i>f′(x₀)</i> ${fmt(md)}</span><span><i>gap</i> ${fmt(ms-md)}</span><span><i>drag the dark point</i></span>`};
    let drag=false;svg.addEventListener('pointerdown',ev=>{drag=true;svg.setPointerCapture(ev.pointerId);const[x]=svgPt(ev);x0=clamp(IX(x),xr[0],xr[1]);draw()});svg.addEventListener('pointermove',ev=>{if(!drag)return;const[x]=svgPt(ev);x0=clamp(IX(x),xr[0],xr[1]);draw()});svg.addEventListener('pointerup',()=>drag=false);
  }else if(t==='riemann'){
    const f=compile(spec.expr||'x^2',['x',...pn]);const a=+(spec.a??xr[0]),b=+(spec.b??xr[1]);const pad=(b-a)*.08;xr=[a-pad,b+pad];let n=6,modeI=1;
    slider('n',1,120,n,1,v=>{n=v|0;draw()},'rectangles n');
    const sel=el('select',{'aria-label':'Sample point',id:'m'+uid()},[el('option',{text:'left'}),el('option',{text:'midpoint',selected:true}),el('option',{text:'right'})]);sel.onchange=()=>{modeI=sel.selectedIndex;draw()};ctrls.append(el('label',{class:'ctrl'},[el('span',{},['sample point']),sel]));
    draw=()=>{clear();axes();const F=x=>f(x,...pn.map(k=>pv[k]));const dx=(b-a)/n;let sum=0;
      for(let i=0;i<n;i++){const xi=a+dx*(i+[0,.5,1][modeI]),y=F(xi);sum+=y*dx;mk('rect',{x:X(a+i*dx),y:Math.min(Y(y),Y(0)),width:Math.max(.5,X(a+dx)-X(a)),height:Math.abs(Y(y)-Y(0)),fill:y>=0?'rgba(45,91,142,.28)':'rgba(156,58,40,.28)',stroke:'rgba(45,91,142,.7)','stroke-width':.6})}
      curve(F,'#2a1e15',2.2);let I=0;const N=2000,h=(b-a)/N;for(let i=0;i<=N;i++){const w=i===0||i===N?1:(i%2?4:2);I+=w*F(a+i*h)}I*=h/3;
      reads.innerHTML=`<span><i>Σ f(xᵢ)Δx</i> ${fmt(sum,5)}</span><span><i>∫ f dx</i> ${fmt(I,5)}</span><span><i>error</i> ${fmt(sum-I,5)}</span><span><i>Δx</i> ${fmt(dx)}</span>`};
  }else if(t==='vectors'){
    let A=spec.a||[3,1],B=spec.b||[1,2.5],which=null;
    draw=()=>{clear();axes();const arrow=(x0,y0,x1,y1,c,w=2.6)=>{mk('line',{x1:X(x0),y1:Y(y0),x2:X(x1),y2:Y(y1),stroke:c,'stroke-width':w});const ang=Math.atan2(Y(y1)-Y(y0),X(x1)-X(x0));const hx=X(x1),hy=Y(y1);mk('path',{d:`M${hx} ${hy} L${hx-11*Math.cos(ang-.4)} ${hy-11*Math.sin(ang-.4)} L${hx-11*Math.cos(ang+.4)} ${hy-11*Math.sin(ang+.4)}Z`,fill:c})};
      const S_=[A[0]+B[0],A[1]+B[1]];mk('path',{d:`M${X(0)} ${Y(0)}L${X(A[0])} ${Y(A[1])}L${X(S_[0])} ${Y(S_[1])}L${X(B[0])} ${Y(B[1])}Z`,fill:'rgba(207,168,79,.15)',stroke:'rgba(143,115,58,.5)','stroke-dasharray':'4 3'});
      const bb=B[0]*B[0]+B[1]*B[1]||1,k=(A[0]*B[0]+A[1]*B[1])/bb;mk('line',{x1:X(A[0]),y1:Y(A[1]),x2:X(k*B[0]),y2:Y(k*B[1]),stroke:'#3f7d6e','stroke-dasharray':'3 3'});arrow(0,0,k*B[0],k*B[1],'#3f7d6e',4);
      arrow(0,0,S_[0],S_[1],'#8f733a');arrow(0,0,A[0],A[1],'#2d5b8e');arrow(0,0,B[0],B[1],'#9c3a28');
      [[A,'a','#2d5b8e'],[B,'b','#9c3a28']].forEach(([v,n,c])=>{mk('circle',{cx:X(v[0]),cy:Y(v[1]),r:9,fill:'transparent',stroke:c,'stroke-width':1.5,style:'cursor:grab'});mk('text',{x:X(v[0])+12,y:Y(v[1])-8,'font-size':15,'font-style':'italic',fill:c}).textContent=n});
      mk('text',{x:X(S_[0])+8,y:Y(S_[1])-6,'font-size':13,'font-style':'italic',fill:'#8f733a'}).textContent='a+b';
      const dot=A[0]*B[0]+A[1]*B[1],na=Math.hypot(...A),nb=Math.hypot(...B),ang=Math.acos(clamp(dot/(na*nb||1),-1,1))*180/Math.PI;
      reads.innerHTML=`<span><i>|a|</i> ${fmt(na)}</span><span><i>|b|</i> ${fmt(nb)}</span><span><i>a·b</i> ${fmt(dot)}</span><span><i>angle</i> ${fmt(ang,1)}°</span><span><i>a×b (z)</i> ${fmt(A[0]*B[1]-A[1]*B[0])}</span><span><i>projᵦa</i> ${fmt(k)}·b</span>`};
    svg.addEventListener('pointerdown',ev=>{const[x,y]=svgPt(ev);const p=[IX(x),IY(y)];which=Math.hypot(p[0]-A[0],p[1]-A[1])<Math.hypot(p[0]-B[0],p[1]-B[1])?A:B;svg.setPointerCapture(ev.pointerId);which[0]=p[0];which[1]=p[1];draw()});
    svg.addEventListener('pointermove',ev=>{if(!which)return;const[x,y]=svgPt(ev);which[0]=+IX(x).toFixed(2);which[1]=+IY(y).toFixed(2);draw()});svg.addEventListener('pointerup',()=>which=null);
  }else if(t==='unitcircle'){
    let th=0.8,play=false;const pb=el('button',{class:'btn',text:'Play'});pb.onclick=()=>{play=!play;pb.textContent=play?'Pause':'Play'};ctrls.append(pb);
    draw=()=>{clear();const cx=X(0),cy=Y(0),r=X(1)-X(0);mk('line',{x1:P,x2:W-P,y1:cy,y2:cy,stroke:'#5b4532'});mk('line',{x1:cx,x2:cx,y1:P,y2:H-P,stroke:'#5b4532'});mk('circle',{cx,cy,r,fill:'none',stroke:'#2a1e15','stroke-width':1.5});
      const px=cx+r*Math.cos(th),py=cy-r*Math.sin(th);mk('path',{d:`M${cx+18} ${cy} A18 18 0 ${th%(2*Math.PI)>Math.PI?1:0} 0 ${cx+18*Math.cos(th)} ${cy-18*Math.sin(th)}`,fill:'none',stroke:'#8f733a','stroke-width':2});
      mk('line',{x1:cx,y1:cy,x2:px,y2:py,stroke:'#2a1e15','stroke-width':2});mk('line',{x1:px,y1:py,x2:px,y2:cy,stroke:'#9c3a28','stroke-width':3});mk('line',{x1:cx,y1:cy,x2:px,y2:cy,stroke:'#2d5b8e','stroke-width':3});
      const ox=X(1.6);let d='';for(let a=0;a<=2*Math.PI;a+=.03)d+=(a?'L':'M')+(ox+a*r*.75)+' '+(cy-r*Math.sin(a));mk('path',{d,fill:'none',stroke:'rgba(156,58,40,.5)','stroke-width':1.5});
      let d2='';for(let a=0;a<=2*Math.PI;a+=.03)d2+=(a?'L':'M')+(ox+a*r*.75)+' '+(cy-r*Math.cos(a));mk('path',{d:d2,fill:'none',stroke:'rgba(45,91,142,.45)','stroke-width':1.5});
      const tm=th%(2*Math.PI),wx=ox+tm*r*.75;mk('line',{x1:px,y1:py,x2:wx,y2:py,stroke:'#9c3a28','stroke-dasharray':'3 3'});mk('circle',{cx:wx,cy:py,r:5,fill:'#9c3a28'});mk('circle',{cx:px,cy:py,r:8,fill:'#2a1e15',stroke:'#cfa84f','stroke-width':2});
      mk('text',{x:ox,y:P+10,'font-size':11,fill:'#9c3a28','font-family':'IBM Plex Mono, monospace'}).textContent='sin θ';mk('text',{x:ox+60,y:P+10,'font-size':11,fill:'#2d5b8e','font-family':'IBM Plex Mono, monospace'}).textContent='cos θ';
      reads.innerHTML=`<span><i>θ</i> ${fmt(tm)} rad = ${fmt(tm*180/Math.PI,1)}°</span><span><i>sin θ</i> ${fmt(Math.sin(th))}</span><span><i>cos θ</i> ${fmt(Math.cos(th))}</span><span><i>tan θ</i> ${fmt(Math.tan(th))}</span><span><i>sin²+cos²</i> 1</span>`};
    let drag=false;const setTh=ev=>{const[x,y]=svgPt(ev);th=mod(Math.atan2(Y(0)-y,x-X(0)),2*Math.PI);draw()};svg.addEventListener('pointerdown',ev=>{drag=true;svg.setPointerCapture(ev.pointerId);setTh(ev)});svg.addEventListener('pointermove',ev=>{if(drag)setTh(ev)});svg.addEventListener('pointerup',()=>drag=false);
    const loop=()=>{if(!alive||gone())return;if(play){th+=.02;draw()}anim=requestAnimationFrame(loop)};loop();
  }else if(t==='parametric'){
    const fx=compile(spec.xt||spec.xexpr||'cos(t)',['t',...pn]),fy=compile(spec.yt||spec.yexpr||'sin(2*t)',['t',...pn]);const tr=spec.t||[0,2*Math.PI];let tt=tr[0],play=true;
    const pb=el('button',{class:'btn',text:'Pause'});pb.onclick=()=>{play=!play;pb.textContent=play?'Pause':'Play'};ctrls.append(pb);
    draw=()=>{clear();axes();const A_=pn.map(k=>pv[k]);let d='';for(let i=0;i<=600;i++){const s=tr[0]+(tr[1]-tr[0])*i/600;const x=fx(s,...A_),y=fy(s,...A_);if(isFinite(x)&&isFinite(y))d+=(d?'L':'M')+X(x)+' '+Y(y)}mk('path',{d,fill:'none',stroke:'#2d5b8e','stroke-width':2,'clip-path':'url(#clp'+cid+')'});
      const x=fx(tt,...A_),y=fy(tt,...A_),e=1e-4,vx=(fx(tt+e,...A_)-x)/e,vy=(fy(tt+e,...A_)-y)/e,sc=.25;mk('line',{x1:X(x),y1:Y(y),x2:X(x+vx*sc),y2:Y(y+vy*sc),stroke:'#9c3a28','stroke-width':2.5});mk('circle',{cx:X(x),cy:Y(y),r:7,fill:'#2a1e15',stroke:'#cfa84f','stroke-width':2});
      reads.innerHTML=`<span><i>t</i> ${fmt(tt)}</span><span><i>(x,y)</i> (${fmt(x)}, ${fmt(y)})</span><span><i>|v|</i> ${fmt(Math.hypot(vx,vy))}</span>`};
    const loop=()=>{if(!alive||gone())return;if(play){tt+=(tr[1]-tr[0])/600;if(tt>tr[1])tt=tr[0];draw()}anim=requestAnimationFrame(loop)};loop();
  }else if(t==='phase'){
    const fdx=compile(spec.dx||'y',['x','y',...pn]),fdy=compile(spec.dy||'-x',['x','y',...pn]);let trajs=[];
    const cb=el('button',{class:'btn',text:'Clear paths'});cb.onclick=()=>{trajs=[];draw()};ctrls.append(cb);
    const F=(x,y)=>{const A_=pn.map(k=>pv[k]);return[fdx(x,y,...A_),fdy(x,y,...A_)]};
    draw=()=>{clear();axes();const nx=22,ny=13;for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){const x=xr[0]+(xr[1]-xr[0])*i/nx,y=yr[0]+(yr[1]-yr[0])*j/ny,[u,v]=F(x,y),m=Math.hypot(u,v)||1;const L_=9,px=X(x),py=Y(y),ux=u/m*L_*(W-2*P)/(xr[1]-xr[0])/((W-2*P)/(xr[1]-xr[0])),vy=-v/m*L_;
        const ax=u/m,ay=v/m;const sx=ax*(W-2*P)/(xr[1]-xr[0]),sy=-ay*(H-2*P)/(yr[1]-yr[0]);const sm=Math.hypot(sx,sy)||1;mk('line',{x1:px-sx/sm*5,y1:py-sy/sm*5,x2:px+sx/sm*5,y2:py+sy/sm*5,stroke:`rgba(45,91,142,${.25+Math.min(.6,m/8)})`,'stroke-width':1.2});mk('circle',{cx:px+sx/sm*5,cy:py+sy/sm*5,r:1.4,fill:'#2d5b8e'})}
      trajs.forEach((tr,i)=>{let d='';tr.pts.forEach((p,k)=>d+=(k?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1));mk('path',{d,fill:'none',stroke:COLORS[(i+1)%5],'stroke-width':2,'clip-path':'url(#clp'+cid+')'});const p=tr.pts[tr.pts.length-1];mk('circle',{cx:X(p[0]),cy:Y(p[1]),r:5,fill:COLORS[(i+1)%5]})});
      const last=trajs[trajs.length-1];reads.innerHTML=last?`<span><i>start</i> (${fmt(last.pts[0][0])}, ${fmt(last.pts[0][1])})</span><span><i>now</i> (${fmt(last.pts.at(-1)[0])}, ${fmt(last.pts.at(-1)[1])})</span><span><i>paths</i> ${trajs.length}</span>`:'<span><i>Click anywhere in the field to release a state and watch it flow</i></span>'};
    svg.addEventListener('pointerdown',ev=>{const[x,y]=svgPt(ev);trajs.push({pts:[[IX(x),IY(y)]],n:0});if(trajs.length>6)trajs.shift();draw()});
    const loop=()=>{if(!alive||gone())return;let any=false;trajs.forEach(tr=>{if(tr.n>1400)return;any=true;let [x,y]=tr.pts[tr.pts.length-1];const h=.01;for(let s=0;s<3;s++){const k1=F(x,y),k2=F(x+h/2*k1[0],y+h/2*k1[1]),k3=F(x+h/2*k2[0],y+h/2*k2[1]),k4=F(x+h*k3[0],y+h*k3[1]);x+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);y+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1])}if(!isFinite(x)||!isFinite(y)){tr.n=9999;return}tr.pts.push([x,y]);tr.n++});if(any)draw();anim=requestAnimationFrame(loop)};loop();
  }
  else if(t==='matrix'){
    xr=[-5.5,5.5];yr=[-3.2,3.2];const m=spec.m||[[1.2,.6],[.3,1]];let I_=[m[0][0],m[1][0]],J_=[m[0][1],m[1][1]],which=null;
    draw=()=>{clear();axes();const T=(x,y)=>[I_[0]*x+J_[0]*y,I_[1]*x+J_[1]*y];
      for(let k=-6;k<=6;k++){let a=T(k,-6),b=T(k,6);mk('line',{x1:X(a[0]),y1:Y(a[1]),x2:X(b[0]),y2:Y(b[1]),stroke:'rgba(45,91,142,.28)','clip-path':'url(#clp'+cid+')'});a=T(-6,k);b=T(6,k);mk('line',{x1:X(a[0]),y1:Y(a[1]),x2:X(b[0]),y2:Y(b[1]),stroke:'rgba(45,91,142,.28)','clip-path':'url(#clp'+cid+')'})}
      const q=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>T(x,y));const det=I_[0]*J_[1]-J_[0]*I_[1];mk('path',{d:'M'+q.map(v=>X(v[0])+' '+Y(v[1])).join('L')+'Z',fill:det>=0?'rgba(207,168,79,.3)':'rgba(156,58,40,.25)',stroke:'#8f733a'});
      const tr=I_[0]+J_[1],disc=tr*tr-4*det;if(disc>=0){[(tr+Math.sqrt(disc))/2,(tr-Math.sqrt(disc))/2].forEach((l,i)=>{let v=Math.abs(J_[0])>1e-9?[J_[0],l-I_[0]]:Math.abs(I_[1])>1e-9?[l-J_[1],I_[1]]:(i?[0,1]:[1,0]);const n=Math.hypot(...v)||1;v=[v[0]/n*7,v[1]/n*7];mk('line',{x1:X(-v[0]),y1:Y(-v[1]),x2:X(v[0]),y2:Y(v[1]),stroke:'#3f7d6e','stroke-width':1.5,'stroke-dasharray':'6 4','clip-path':'url(#clp'+cid+')'})})}
      const arr=(v,c,n)=>{mk('line',{x1:X(0),y1:Y(0),x2:X(v[0]),y2:Y(v[1]),stroke:c,'stroke-width':3});mk('circle',{cx:X(v[0]),cy:Y(v[1]),r:8,fill:c,'fill-opacity':.25,stroke:c,style:'cursor:grab'});mk('text',{x:X(v[0])+10,y:Y(v[1])-8,'font-size':15,'font-style':'italic',fill:c}).textContent=n};arr(I_,'#2d5b8e','î');arr(J_,'#9c3a28','ĵ');
      reads.innerHTML=`<span><i>A</i> [[${fmt(I_[0],2)}, ${fmt(J_[0],2)}], [${fmt(I_[1],2)}, ${fmt(J_[1],2)}]]</span><span><i>det A (area)</i> ${fmt(det)}</span><span><i>trace</i> ${fmt(tr)}</span><span><i>eigenvalues</i> ${disc>=0?fmt((tr+Math.sqrt(disc))/2)+', '+fmt((tr-Math.sqrt(disc))/2):fmt(tr/2)+' ± '+fmt(Math.sqrt(-disc)/2)+'i (rotation)'}</span><span><i>drag î and ĵ</i></span>`};
    svg.addEventListener('pointerdown',ev=>{const[x,y]=svgPt(ev);const p=[IX(x),IY(y)];which=Math.hypot(p[0]-I_[0],p[1]-I_[1])<Math.hypot(p[0]-J_[0],p[1]-J_[1])?I_:J_;svg.setPointerCapture(ev.pointerId)});
    svg.addEventListener('pointermove',ev=>{if(!which)return;const[x,y]=svgPt(ev);which[0]=Math.round(IX(x)*10)/10;which[1]=Math.round(IY(y)*10)/10;draw()});svg.addEventListener('pointerup',()=>which=null);
  }else if(t==='complex'){
    xr=[-4.5,4.5];yr=[-2.6,2.6];let Z=spec.z||[1.4,.8],Wv=spec.w||[.9,1.1],which=null;
    draw=()=>{clear();spec.xlabel='Re';spec.ylabel='Im';axes();const r=X(1)-X(0);mk('ellipse',{cx:X(0),cy:Y(0),rx:r,ry:Y(0)-Y(1),fill:'none',stroke:'rgba(90,60,30,.35)','stroke-dasharray':'3 3'});
      const P=[Z[0]*Wv[0]-Z[1]*Wv[1],Z[0]*Wv[1]+Z[1]*Wv[0]],S_=[Z[0]+Wv[0],Z[1]+Wv[1]];const arg=v=>Math.atan2(v[1],v[0]),mod_=v=>Math.hypot(...v);
      const arc=(a,rad,c)=>{const a1=0,a2=a;mk('path',{d:`M${X(rad)} ${Y(0)} A${rad*r} ${rad*(Y(0)-Y(1))} 0 ${Math.abs(a2)>Math.PI?1:0} ${a2<0?1:0} ${X(rad*Math.cos(a2))} ${Y(rad*Math.sin(a2))}`,fill:'none',stroke:c,'stroke-width':1.5})};arc(arg(Z),.5,'#2d5b8e');arc(arg(Wv),.7,'#9c3a28');arc(arg(P),.9,'#3f7d6e');
      [[S_,'#8f733a','z+w',false],[P,'#3f7d6e','z·w',false],[Z,'#2d5b8e','z',true],[Wv,'#9c3a28','w',true]].forEach(([v,c,n,drag])=>{mk('line',{x1:X(0),y1:Y(0),x2:X(v[0]),y2:Y(v[1]),stroke:c,'stroke-width':drag?3:2.2,'stroke-dasharray':drag?'':'5 3','clip-path':'url(#clp'+cid+')'});mk('circle',{cx:X(v[0]),cy:Y(v[1]),r:drag?8:4,fill:c,'fill-opacity':drag?.25:1,stroke:c});mk('text',{x:X(v[0])+9,y:Y(v[1])-7,'font-size':14,'font-style':'italic',fill:c}).textContent=n});
      const d=x=>fmt(x*180/Math.PI,1)+'°';reads.innerHTML=`<span><i>z</i> ${fmt(mod_(Z))}∠${d(arg(Z))}</span><span><i>w</i> ${fmt(mod_(Wv))}∠${d(arg(Wv))}</span><span><i>z·w</i> ${fmt(P[0])} ${P[1]<0?'−':'+'} ${fmt(Math.abs(P[1]))}i = ${fmt(mod_(P))}∠${d(arg(P))}</span><span><i>|z||w|</i> ${fmt(mod_(Z)*mod_(Wv))}</span><span><i>arg z + arg w</i> ${d(arg(Z)+arg(Wv))}</span>`};
    svg.addEventListener('pointerdown',ev=>{const[x,y]=svgPt(ev);const p=[IX(x),IY(y)];which=Math.hypot(p[0]-Z[0],p[1]-Z[1])<Math.hypot(p[0]-Wv[0],p[1]-Wv[1])?Z:Wv;svg.setPointerCapture(ev.pointerId)});
    svg.addEventListener('pointermove',ev=>{if(!which)return;const[x,y]=svgPt(ev);which[0]=+IX(x).toFixed(2);which[1]=+IY(y).toFixed(2);draw()});svg.addEventListener('pointerup',()=>which=null);
  }else if(t==='fourier'){
    xr=[-Math.PI*2,Math.PI*2];yr=[-1.6,1.6];let N=spec.n||5,wave=spec.wave||'square';
    slider('n',1,60,N,1,v=>{N=v|0;draw()},'harmonics N');const sel=el('select',{'aria-label':'Waveform',id:'fw'+uid()},['square','sawtooth','triangle'].map(w=>el('option',{text:w,selected:w===wave})));sel.onchange=()=>{wave=sel.value;draw()};ctrls.append(el('label',{class:'ctrl'},[el('span',{},['waveform']),sel]));
    const target=x=>{const u=mod(x+Math.PI,2*Math.PI)-Math.PI;return wave==='square'?Math.sign(Math.sin(x)):wave==='sawtooth'?u/Math.PI:1-2*Math.abs(u)/Math.PI};
    const term=(k,x)=>wave==='square'?(k%2?4/(Math.PI*k)*Math.sin(k*x):0):wave==='sawtooth'?2*Math.pow(-1,k+1)/(Math.PI*k)*Math.sin(k*x):(k%2?8/(Math.PI*Math.PI*k*k)*Math.cos(k*x)*1:0);
    draw=()=>{clear();axes();curve(target,'#8f733a',1.6,'5 4');const S_=x=>{let s=0;for(let k=1;k<=N;k++)s+=term(k,x);return s};curve(S_,'#2d5b8e',2.4);
      let mx=-Infinity;for(let i=0;i<800;i++){const x=.001+i*(Math.PI-.002)/800;mx=Math.max(mx,S_(x))}
      const bw=(W-2*P)/62;for(let k=1;k<=Math.min(N,60);k++){const a=Math.abs(wave==='triangle'?(k%2?8/(Math.PI*Math.PI*k*k):0):wave==='square'?(k%2?4/(Math.PI*k):0):2/(Math.PI*k));mk('rect',{x:P+k*bw,y:H-P-a*40,width:bw*.7,height:a*40,fill:'rgba(156,58,40,.55)'})}
      reads.innerHTML=`<span><i>terms</i> ${N}</span><span><i>max of partial sum</i> ${fmt(mx,4)}</span>${wave==='square'?'<span><i>Gibbs overshoot</i> '+fmt((mx-1)/2*100,3)+'% of the jump (→ 8.95%)</span>':''}<span><i>red bars</i> |coefficient| of each harmonic</span>`};
  }else if(t==='distribution'){
    let mode=spec.mode||'normal',mu=spec.mu??0,sg=spec.sigma??1,n=5,samples=[];
    const sel=el('select',{'aria-label':'Mode',id:'dm'+uid()},[el('option',{value:'normal',text:'sample a normal distribution',selected:mode==='normal'}),el('option',{value:'clt',text:'CLT: means of n fair dice',selected:mode==='clt'})]);sel.onchange=()=>{mode=sel.value;samples=[];draw()};ctrls.append(el('label',{class:'ctrl'},[el('span',{},['mode']),sel]));
    slider('μ',-3,3,mu,.01,v=>{mu=v;samples=[];draw()},'μ (normal)');slider('σ',.2,3,sg,.01,v=>{sg=v;samples=[];draw()},'σ (normal)');slider('n',1,40,n,1,v=>{n=v|0;samples=[];draw()},'n dice (CLT)');
    const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
    const draw1=()=>mode==='normal'?mu+sg*gauss():Array.from({length:n},()=>1+Math.floor(Math.random()*6)).reduce((a,b)=>a+b,0)/n;
    [1,100,1000].forEach(k=>ctrls.append(el('button',{class:'btn',text:'+'+k+' sample'+(k>1?'s':''),onclick:()=>{for(let i=0;i<k;i++)samples.push(draw1());draw()}})));ctrls.append(el('button',{class:'btn',text:'Clear',onclick:()=>{samples=[];draw()}}));
    draw=()=>{const m0=mode==='normal'?mu:3.5,s0=mode==='normal'?sg:Math.sqrt(35/12/n);xr=[m0-4.2*s0,m0+4.2*s0];const peak=1/(s0*Math.sqrt(2*Math.PI));yr=[0,peak*1.35];clear();spec.xlabel='x';axes();
      const B=40,bw=(xr[1]-xr[0])/B,bins=new Array(B).fill(0);samples.forEach(v=>{const b=Math.floor((v-xr[0])/bw);if(b>=0&&b<B)bins[b]++});
      bins.forEach((c,i)=>{if(!c)return;const h=c/(samples.length*bw);mk('rect',{x:X(xr[0]+i*bw),y:Y(h),width:X(xr[0]+bw)-X(xr[0])-1,height:Y(0)-Y(h),fill:'rgba(45,91,142,.45)'})});
      curve(x=>Math.exp(-((x-m0)**2)/(2*s0*s0))/(s0*Math.sqrt(2*Math.PI)),'#9c3a28',2.4);
      const N_=samples.length,mean=N_?samples.reduce((a,b)=>a+b,0)/N_:NaN,sd=N_>1?Math.sqrt(samples.reduce((a,b)=>a+(b-mean)**2,0)/(N_-1)):NaN;
      reads.innerHTML=`<span><i>samples</i> ${N_}</span><span><i>sample mean</i> ${fmt(mean,4)}</span><span><i>sample sd</i> ${fmt(sd,4)}</span><span><i>theory</i> μ=${fmt(m0,4)}, σ=${fmt(s0,4)}</span><span><i>s.e. of mean</i> ${N_?fmt(s0/Math.sqrt(N_),4):'—'}</span>`};
  }else if(t==='customsvg'){
    if(!spec.code)throw new Error('This custom diagram has no code yet.');
    let userDraw=null,userAnim=null,ptr=null;const ro=spec.ranges||{},sv=spec.params||{},hid=spec.hidden||[];
    const safe=f=>(...a)=>{try{return f(...a)}catch(e){alive=false;cancelAnimationFrame(anim);if(fail)fail(e)}};
    const api={svg,W,H,p:pv,colors:COLORS,f:(e,v)=>compile(e,v||['x']),
      el:(n,a,parent)=>mk(n,a||{},parent||svg),clear,
      axes:(x0,x1,y0,y1,o={})=>{xr=[x0,x1];yr=[y0,y1];spec.xlabel=o.xlabel;spec.ylabel=o.ylabel;axes();return{X,Y,IX,IY}},
      param:(k,a,b,d,l)=>{if(!(k in pv)){const r=ro[k]&&+ro[k][1]>+ro[k][0]?ro[k]:[a,b];const v=Array.isArray(sv[k])?+sv[k][2]:+sv[k];pv[k]=clamp(isFinite(v)?v:+d,+r[0],+r[1]);if(!hid.includes(k))slider(k,+r[0],+r[1],pv[k],null,x=>{pv[k]=x;api.redraw()},l)}return pv[k]},
      button:(l,f)=>ctrls.append(el('button',{class:'btn',text:l,onclick:safe(f)})),
      draw:f=>{userDraw=safe(f)},animate:f=>{userAnim=safe(f)},redraw:()=>{if(userDraw)userDraw()},
      onPointer:f=>{ptr=safe(f)},readout:h=>{reads.innerHTML=String(h)}};
    ['pointerdown','pointermove','pointerup'].forEach(n=>svg.addEventListener(n,ev=>{if(!ptr)return;if(n==='pointerdown')svg.setPointerCapture(ev.pointerId);const[x,y]=svgPt(ev);ptr(n.slice(7),x,y,ev)}));
    new Function('api','"use strict";\n'+spec.code)(api);
    draw=()=>api.redraw();let last=performance.now();const loop=()=>{if(!alive||gone())return;const now=performance.now();if(userAnim)userAnim(Math.min(.05,(now-last)/1000),now/1000);last=now;anim=requestAnimationFrame(loop)};loop();
  }
  draw();
  return()=>{alive=false;cancelAnimationFrame(anim)};
}
function niceStep(range){const r=range/8,p=Math.pow(10,Math.floor(Math.log10(r))),n=r/p;return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p}
function normParams(p){const o={};if(!p)return o;for(const k in p){if(!/^[A-Za-z_]\w*$/.test(k)||MATHNAMES.includes(k)||k==='x'||k==='y'||k==='t')continue;const v=p[k];if(Array.isArray(v)&&v.length>=2){const a=+v[0],b=+v[1],c=v.length>2?+v[2]:(a+b)/2;if(isFinite(a)&&isFinite(b)&&b>a)o[k]=[a,b,clamp(c,a,b)]}else if(isFinite(+v)){const c=+v,s=Math.abs(c)||1;o[k]=[c-2*s,c+2*s,c]}}return o}


export { normParams };
