// Interactive 2D diagrams (plot with optional measured "points", tangent, riemann, vectors, matrix, complex, unitcircle, fourier, distribution, parametric, phase, customsvg).
// Ported from Scriptorium v2; used inline in the reading scroll.
import { el, compile, fmt, clamp, uid, mod, MATHNAMES, svgMath, mathHTML, mathText, unitish } from '../util.js';
import { validateFigure, isPrimitive } from './figspec.js';
import { renderPrimitive } from '../dio/prims/index.js';
import { isCodeCall } from './prose.js';
import { glyphFor, drawGlyph } from './glyphs.js';
const TC = typeof Node !== 'undefined' ? Object.getOwnPropertyDescriptor(Node.prototype, 'textContent') : null;
export const SVG_TYPES=['plot','tangent','riemann','vectors','matrix','complex','unitcircle','fourier','distribution','parametric','phase','customsvg','figure'];
export function SVGDEMO(spec,host,fail){
  const NS='http://www.w3.org/2000/svg';const W=600,H=340,P=36;
  if(spec.type==='figure'){const w=el('div',{class:'svgdemo'});host.append(w);return renderFigure(spec.figure||spec,w,{})}
  const t=spec.type;const wrap=el('div',{class:'svgdemo'});host.append(wrap);
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  wrap.append(el('div',{class:'svgwrap'},[svg]));
  const ctrls=el('div',{class:'ctrls'}),reads=el('div',{class:'readouts'});wrap.append(ctrls,reads);
  // every <text> typesets its maths (m2 → m₂ with a real subscript, x^2 → x², …) when its text is set
  const mk=(n,a,parent=svg)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(n==='text')Object.defineProperty(e,'textContent',{configurable:true,get(){return TC.get.call(e)},set(v){svgMath(e,v)}});parent.append(e);return e};
  const P_=t==='customsvg'?{}:normParams(spec.params);const pv={};for(const k in P_)pv[k]=P_[k][2];
  let anim=0,alive=true,shown=false;
  // animation loops end by themselves once the diagram leaves the page (scroll closed or re-rendered without cleanup)
  const gone=()=>{if(wrap.isConnected){shown=true;return false}return shown};
  const slider=(name,min,max,val,step,on,label)=>{const out=el('b',{text:fmt(val)});const inp=el('input',{type:'range',min,max,step:step||(max-min)/200,value:val,id:'r'+uid(),'aria-label':label||name});inp.oninput=()=>{out.textContent=fmt(+inp.value);on(+inp.value)};ctrls.append(el('label',{class:'ctrl'},[el('span',{},[label||name,out]),inp]));return inp};
  if(t!=='customsvg')for(const k in P_)if(!(spec.hidden||[]).includes(k))slider(k,P_[k][0],P_[k][1],P_[k][2],null,v=>{pv[k]=v;state.legReset&&state.legReset();draw()});
  const pn=Object.keys(P_);
  let xr=spec.x||[-5,5],yr=spec.y||spec.yrange||[-3,3];
  if(t==='phase'){xr=spec.range||xr;yr=spec.yrange||spec.range||yr}
  if(t==='unitcircle'){xr=[-1.6,6.6];yr=[-1.4,1.4]}
  if(t==='vectors'){xr=spec.x||[-6,6];yr=spec.y||[-3.5,3.5]}
  const X=x=>P+(x-xr[0])/(xr[1]-xr[0])*(W-2*P),Y=y=>H-P-(y-yr[0])/(yr[1]-yr[0])*(H-2*P);
  const IX=px=>xr[0]+(px-P)/(W-2*P)*(xr[1]-xr[0]),IY=py=>yr[0]+(H-P-py)/(H-2*P)*(yr[1]-yr[0]);
  const COLORS=['#2d5b8e','#9c3a28','#3f7d6e','#8f733a','#6a4a8a'];
  function axes(){const g=mk('g',{class:'fig-axes'});const step=niceStep(xr[1]-xr[0]),stepy=niceStep(yr[1]-yr[0]);
    for(let x=Math.ceil(xr[0]/step)*step;x<=xr[1]+1e-9;x+=step){mk('line',{x1:X(x),x2:X(x),y1:P,y2:H-P,stroke:'rgba(90,60,30,.12)'},g);mk('text',{x:X(x),y:H-P+14,'font-size':10,'text-anchor':'middle',fill:'#5b4532','font-family':'IBM Plex Mono, monospace'},g).textContent=fmt(x,2)}
    for(let y=Math.ceil(yr[0]/stepy)*stepy;y<=yr[1]+1e-9;y+=stepy){mk('line',{y1:Y(y),y2:Y(y),x1:P,x2:W-P,stroke:'rgba(90,60,30,.12)'},g);mk('text',{x:P-5,y:Y(y)+3,'font-size':10,'text-anchor':'end',fill:'#5b4532','font-family':'IBM Plex Mono, monospace'},g).textContent=fmt(y,2)}
    if(yr[0]<0&&yr[1]>0)mk('line',{x1:P,x2:W-P,y1:Y(0),y2:Y(0),stroke:'#5b4532','stroke-width':1.2},g);
    if(xr[0]<0&&xr[1]>0)mk('line',{y1:P,y2:H-P,x1:X(0),x2:X(0),stroke:'#5b4532','stroke-width':1.2},g);
    if(spec.xlabel)mk('text',{x:W-P,y:H-P-6,'font-size':12,'text-anchor':'end',fill:'#2a1e15','font-style':unitish(spec.xlabel)?'normal':'italic',class:'fig-axtitle'},g);{const e=g.lastChild;if(unitish(spec.xlabel)&&!/\(/.test(spec.xlabel))TC.set.call(e,spec.xlabel);else e.textContent=spec.xlabel}
    if(spec.ylabel)mk('text',{x:P+6,y:P+12,'font-size':12,fill:'#2a1e15','font-style':unitish(spec.ylabel)?'normal':'italic',class:'fig-axtitle'},g);{const e=g.lastChild;if(unitish(spec.ylabel)&&!/\(/.test(spec.ylabel))TC.set.call(e,spec.ylabel);else e.textContent=spec.ylabel}return g}
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
    let legPos=null;const names=exprs.map((e,i)=>{const L=Array.isArray(spec.labels)?spec.labels[i]:null;if(L)return String(L);const base=String(spec.ylabel||spec.title||'f');return exprs.length>1?base+' · '+(i+1):base});
    const legend=()=>{const rows=names.map((n,i)=>({n:n.length>34?n.slice(0,33)+'…':n,c:COLORS[i],e:exprs[i]}));if(pts.length)rows.push({n:spec.pointsLabel||'data points',dot:true});if(!rows.length)return;
      const wid=Math.min(W/2-P,Math.max(...rows.map(r=>r.n.length))*6.6+30),hgt=rows.length*16+6;
      // the corner (or top/bottom middle) the curves and points cross least; the y label sits top left, the x label bottom right
      if(!legPos){const pv2=pn.map(k=>pv[k]),cand=[[W-P-8-wid,P+(spec.ylabel?20:6)],[P+8,P+(spec.ylabel?24:6)],[W-P-8-wid,H-P-hgt-(spec.xlabel?22:8)],[P+8,H-P-hgt-8],[(W-wid)/2,P+6],[(W-wid)/2,H-P-hgt-8]];
        const hits=([x,y])=>{let n=0;fs.forEach(f=>{for(let i=0;i<=200;i++){const xx=xr[0]+(xr[1]-xr[0])*i/200,yy=f(xx,...pv2);if(!isFinite(yy))continue;const px=X(xx),py=Y(yy);if(px>=x-4&&px<=x+wid+4&&py>=y-4&&py<=y+hgt+4)n++}});pts.forEach(p=>{const px=X(p.x),py=Y(p.y);if(px>=x-6&&px<=x+wid+6&&py>=y-6&&py<=y+hgt+6)n+=3});return n};
        let bh=Infinity;cand.forEach(c=>{const h=hits(c);if(h<bh){bh=h;legPos=c}})}
      const g=mk('g',{class:'fig-legend','font-size':11,'font-family':'IBM Plex Mono, monospace'}),[x0,y0]=legPos;
      mk('rect',{x:x0,y:y0,width:wid,height:rows.length*16+6,rx:3,fill:'rgba(251,246,234,.86)',stroke:'rgba(90,60,30,.25)'},g);
      rows.forEach((r,i)=>{const y=y0+13+i*16;if(r.dot)mk('circle',{cx:x0+14,cy:y-3,r:3.4,fill:'#fbf6ea',stroke:'#2a1e15','stroke-width':1.5},g);else mk('rect',{x:x0+8,y:y-4.5,width:12,height:3,fill:r.c},g);const tx=mk('text',{x:x0+26,y,fill:'#2a1e15'},g);tx.textContent=r.n;if(r.e){const ti=document.createElementNS(NS,'title');ti.textContent=mathText(r.e);tx.append(ti)}})};
    draw=()=>{clear();axes();fs.forEach((f,i)=>curve(x=>f(x,...pn.map(k=>pv[k])),COLORS[i]));
      pts.forEach(p=>{mk('circle',{cx:X(p.x),cy:Y(p.y),r:3.6,fill:'#fbf6ea',stroke:'#2a1e15','stroke-width':1.6});if(p.label)mk('text',{x:X(p.x)+6,y:Y(p.y)-6,'font-size':10,fill:'#2a1e15','font-family':'IBM Plex Mono, monospace'}).textContent=p.label});
      legend();
      reads.innerHTML='';if(hx!=null){mk('line',{x1:X(hx),x2:X(hx),y1:P,y2:H-P,stroke:'#9c3a28','stroke-dasharray':'3 3'});reads.append(el('span',{html:'<i>x</i> '+fmt(hx)}));fs.forEach((f,i)=>{const y=f(hx,...pn.map(k=>pv[k]));if(isFinite(y))mk('circle',{cx:X(hx),cy:Y(y),r:4,fill:COLORS[i]});reads.append(el('span',{html:`<i>f${i+1}</i> ${fmt(y)}`}))})}else reads.append(el('span',{html:'<i>Move the pointer over the plot to read values</i>'}))};
    state.legReset=()=>{legPos=null};
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

// ---------------------------------------------------------------- figures (explanatory drawings in the scroll)
// renderFigure(spec, host, {small, figStore}) draws one figure spec (js/room/figspec.js, schema/figure.schema.json) as
// SVG on parchment: flow, plot, distribution, bars, hist, scatter, boxplot, numberline, tree, venn, timeline, sketch,
// codetrace, table, contrast, or the PDF's own figure (pdf). Labels are typeset with svgMath (m2 → m₂, x^2 → x²).
// "animate" makes a short loop (a token running through a flow, a curve sweeping a parameter, samples filling a
// histogram, points arriving before the fitted line, code executing line by line); with prefers-reduced-motion or the
// Calm preference the final frame is drawn and a ▶ button plays the loop on request. Loops stop when the figure leaves
// the page and pause while it is scrolled out of view. Returns a cleanup function.
const FC = { ink: '#2a1e15', soft: '#5b4532', lapis: '#2d5b8e', rubric: '#9c3a28', verd: '#3f7d6e', brass: '#8f733a', violet: '#6a4a8a', bg: '#fbf6ea', grid: 'rgba(90,60,30,.13)', fillA: 'rgba(45,91,142,.22)', fillR: 'rgba(156,58,40,.2)' };
const SERIES = [FC.lapis, FC.rubric, FC.verd, FC.brass, FC.violet];
export function prefersCalm() { try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; const v = JSON.parse(localStorage.getItem('scriptorium.view') || '{}'); return v.motion === 'calm' || v.calm === true; } catch (e) { return false; } }
const lgamma = z => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .1208650973866179e-2, -.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + .5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
export function densityOf(f) {
  const P = f.params, d = f.dist;
  if (d === 'normal') return { cont: true, lo: P.mean - 4 * P.sd, hi: P.mean + 4 * P.sd, f: x => Math.exp(-((x - P.mean) ** 2) / (2 * P.sd * P.sd)) / (P.sd * Math.sqrt(2 * Math.PI)), sample: () => P.mean + P.sd * Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random()) };
  if (d === 't') { const v = P.df; return { cont: true, lo: -5, hi: 5, f: x => Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2)) / Math.sqrt(v * Math.PI) * Math.pow(1 + x * x / v, -(v + 1) / 2) }; }
  if (d === 'chisq') { const k = P.df; return { cont: true, lo: 0, hi: Math.max(8, k + 4 * Math.sqrt(2 * k)), f: x => x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lgamma(k / 2)) }; }
  if (d === 'uniform') return { cont: true, lo: P.min - (P.max - P.min) * .25, hi: P.max + (P.max - P.min) * .25, f: x => x >= P.min && x <= P.max ? 1 / (P.max - P.min) : 0, sample: () => P.min + Math.random() * (P.max - P.min) };
  if (d === 'exponential') return { cont: true, lo: 0, hi: 5 / P.rate, f: x => x < 0 ? 0 : P.rate * Math.exp(-P.rate * x), sample: () => -Math.log(1 - Math.random()) / P.rate };
  if (d === 'binomial') { const n = Math.round(P.size), p = P.prob; const lc = k => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); const pm = k => k < 0 || k > n ? 0 : p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0) : Math.exp(lc(k) + k * Math.log(p) + (n - k) * Math.log(1 - p)); let hi = n; while (hi > 6 && pm(hi) < 1e-4 && hi > n * p) hi--; return { cont: false, lo: 0, hi: Math.max(6, hi), f: pm, sample: () => { let c = 0; for (let i = 0; i < n; i++) if (Math.random() < p) c++; return c; } }; }
  if (d === 'poisson') { const l = P.lambda; const pm = k => k < 0 ? 0 : Math.exp(k * Math.log(l) - l - lgamma(k + 1)); let hi = Math.ceil(l + 4 * Math.sqrt(l) + 3); return { cont: false, lo: 0, hi, f: pm, sample: () => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= Math.random(); } while (p > L); return k - 1; } }; }
  return { cont: true, lo: -1, hi: 1, f: () => 0 };
}
export function renderFigure(spec, host, { small = false, figStore = null, terms = null } = {}) {
  const NS = 'http://www.w3.org/2000/svg', V = validateFigure(spec), f = V.fig;
  const box = el('figure', { class: 'fig' + (small ? ' small' : '') + (f && f.kind ? ' fig-' + f.kind : '') }); host.append(box);
  if (!V.ok && !(f && f.kind === 'pdf')) { box.append(el('div', { class: 'fig-bad', text: 'This figure could not be drawn: ' + V.errors.join('; ') })); return () => {}; }
  const capEl = () => f.caption ? el('figcaption', { class: 'fig-cap' }, [f.ref ? el('span', { class: 'pdf-tag', text: 'From the PDF · ' + f.ref }) : null, f.extra || (f.source && f.source.outside) ? el('span', { class: 'extra-badge', text: 'Added from outside the PDF' }) : null, el('span', { html: ' ' + mathHTML(f.caption) })]) : null;
  if (f.kind === 'pdf') {
    const P = figStore && figStore.get(f.id);
    if (P && P.dataUrl) { box.classList.add('fig-pdf'); box.append(el('img', { src: P.dataUrl, alt: (P.caption || P.label || 'Figure') + ' (from the PDF, page ' + P.page + ')', loading: 'lazy' }), el('figcaption', { class: 'fig-cap' }, [el('span', { class: 'pdf-tag', text: 'From the PDF, p. ' + P.page }), el('span', { text: ' ' + (f.caption || P.caption || P.label || '') })])); }
    else box.append(el('div', { class: 'fig-bad', text: 'The PDF figure ' + f.id + ' is not stored in this browser.' }));
    return () => {};
  }
  // the domain primitives of the explanatory compiler (js/dio/prims): interactive, step-controlled, drawn by their module
  if (isPrimitive(f.kind)) { let stop = () => {}; try { stop = renderPrimitive(f, box, { small }); } catch (e) { box.innerHTML = ''; box.append(el('div', { class: 'fig-bad', text: 'This figure could not be drawn: ' + e.message })); return () => {}; } const c = capEl(); if (c) box.append(c); return stop; }
  const W = small ? 340 : 600, H = small ? 190 : f.kind === 'codetrace' ? Math.max(170, 40 + f.lines.length * 22 + (f.output.length ? 16 + f.output.length * 16 : 0)) : f.kind === 'table' ? 36 + (f.rows.length + 1) * 22 : f.kind === 'contrast' ? 150 : f.kind === 'flow' && f.dir === 'TB' ? 70 + Math.min(6, f.nodes.length) * 58 : 300;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', f.alt || f.caption || f.kind);
  box.append(el('div', { class: 'fig-frame' }, [svg])); const c = capEl(); if (c) box.append(c);
  const fs = small ? 10 : 11.5;
  // everything drawn after the layer exists goes into it, so each animation frame clears it all (defs stay on the svg)
  // every data mark drawn (bars, dots, curve points, labels) is recorded as boxes, so the legend can be placed where
  // it covers none of them (axes and grid lines are not recorded: rec is off while they are drawn)
  let target = svg, rec = true; const marks = []; const est = (a, s) => { const fz = +(a['font-size'] || fs), w = String(s).length * fz * .56, x = +a.x || 0, y = +a.y || 0, an = a['text-anchor']; return [an === 'end' ? x - w : an === 'middle' ? x - w / 2 : x, y - fz * .8, an === 'end' ? x : an === 'middle' ? x + w / 2 : x + w, y + fz * .25]; };
  const record = (n, a) => { if (!rec) return; const N = v => +v || 0;
    if (n === 'rect') marks.push([N(a.x), N(a.y), N(a.x) + N(a.width), N(a.y) + N(a.height)]);
    else if (n === 'circle') marks.push([N(a.cx) - N(a.r), N(a.cy) - N(a.r), N(a.cx) + N(a.r), N(a.cy) + N(a.r)]);
    else if (n === 'ellipse') marks.push([N(a.cx) - N(a.rx), N(a.cy) - N(a.ry), N(a.cx) + N(a.rx), N(a.cy) + N(a.ry)]);
    else if (n === 'line') { const L = Math.hypot(N(a.x2) - N(a.x1), N(a.y2) - N(a.y1)), k = Math.max(1, Math.ceil(L / 3)); for (let i = 0; i <= k; i++) { const x = N(a.x1) + (N(a.x2) - N(a.x1)) * i / k, y = N(a.y1) + (N(a.y2) - N(a.y1)) * i / k; marks.push([x - 1, y - 1, x + 1, y + 1]); } }
    else if (n === 'path' && a.d && !a.transform) { const v = String(a.d).match(/-?\d+(?:\.\d+)?/g) || []; let px = null, py = null; for (let i = 0; i + 1 < v.length; i += 2) { const x = +v[i], y = +v[i + 1]; if (px != null) { const k = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 3)); for (let j = 1; j <= k; j++) { const qx = px + (x - px) * j / k, qy = py + (y - py) * j / k; marks.push([qx - 1, qy - 1, qx + 1, qy + 1]); } } else marks.push([x - 1, y - 1, x + 1, y + 1]); px = x; py = y; } if (a.fill && a.fill !== 'none') { const xs = v.filter((_, i) => i % 2 === 0).map(Number), ys = v.filter((_, i) => i % 2).map(Number); marks.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); } } };
  const mk = (n, a = {}, parent = target) => { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); (parent || target).append(e); record(n, a); return e; };
  // labels are typeset maths (m2 → m₂), except code (dnorm(x), avg <- mean(…), dat$col), which stays verbatim in a code face
  // a short label (a point's or a line's name) never leaves the drawing: shifted back inside the viewBox by its estimated
  // width (only short ones: for a line of wrapped text the estimate is too rough and would shift it out of its column)
  let clampTxt = true; const txt = (x, y, s, a = {}, parent) => { const code = looksLikeCode(String(s)); const bb = est({ x, y, 'font-size': fs, ...a }, s); if (clampTxt && String(s).length <= 14) { if (bb[2] > W - 2) x -= bb[2] - (W - 2); else if (bb[0] < 2) x += 2 - bb[0]; if (bb[1] < 1) y += 1 - bb[1]; else if (bb[3] > H - 1) y -= bb[3] - (H - 1); } if (rec) marks.push(est({ x, y, 'font-size': fs, ...a }, s)); const e = mk('text', { x, y, 'font-size': fs, fill: FC.ink, 'font-family': code ? 'IBM Plex Mono, monospace' : 'Alegreya, Georgia, serif', ...a, ...(code ? { 'font-size': (a['font-size'] || fs) * .92 } : {}) }, parent); if (code || (a.class === 'fig-axtitle' && unitish(s) && !/\(/.test(s))) e.textContent = String(s); else svgMath(e, String(s)); return e; };
  // (a number and its unit stay on one line: "2 m" never breaks into "2" / "m", which would read as a variable)
  const wrapText = (s, max) => { const w = String(s).split(/\s+/).reduce((a, x) => { if (a.length && /\d[°%]?$/.test(a[a.length - 1]) && x.length <= 5 && unitish(x.replace(/[.,;:)]+$/, ''))) a[a.length - 1] += '\u00a0' + x; else a.push(x); return a; }, []), out = []; let cur = ''; w.forEach(x => { if ((cur + ' ' + x).trim().length > max && cur) { out.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); }); if (cur) out.push(cur); return out; };
  // wrapped lines centred on y, the block kept inside the drawing (a label near the top or bottom edge moves in)
  const multi = (x, y, s, max, a = {}, parent, lh = fs * 1.25) => { const L = wrapText(s, max).slice(0, 4), f = +(a['font-size'] || fs), top = y - (L.length - 1) / 2 * lh - f * .8, bot = y + (L.length - 1) / 2 * lh + f * .25; if (top < 1) y += 1 - top; else if (bot > H - 1) y -= bot - (H - 1);
    { const wl = Math.max(...L.map(l => l.length)) * f * .52, an = a['text-anchor'], x0 = an === 'middle' ? x - wl / 2 : an === 'end' ? x - wl : x; if (x0 + wl > W - 2) x -= Math.min(x0 + wl - (W - 2), Math.max(0, x0 - 2)); else if (x0 < 2) x += 2 - x0; }   // and sideways
    L.forEach((l, i) => txt(x, y + (i - (L.length - 1) / 2) * lh, l, a, parent)); return L.length; };
  const defs = mk('defs'); defs.innerHTML = `<marker id="fa${uid()}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="${FC.soft}"/></marker>`; const arrowId = defs.firstChild.id;
  const layer = mk('g'); target = layer; const clear = () => { layer.innerHTML = ''; marks.length = 0; };
  // a picture of what a label names (glyphs.js), drawn only when its keyword is in the label (or the spec names one);
  // f.icons === false turns them off for the whole figure. Its box is recorded so a legend never covers it.
  const calmG = prefersCalm(), T = Array.isArray(terms) ? terms : [], symOf = t => mathText(String(t.term || '')).replace(/\s+/g, ''),
    meaningOf = l => { const k = mathText(String(l || '')).replace(/\s+/g, ''); const t = k && k.length <= 6 && T.find(t => symOf(t) === k); return t ? { text: t.meaning, icon: t.icon } : null; };   /* a symbol label ("m") is pictured as what it means ("mass of the bob") */
  const glyph = (label, x, y, size, icon, color) => { if (f.icons === false) return null; const tm = meaningOf(label); const id = glyphFor(tm ? tm.text : label, icon || (tm && tm.icon)); if (!id) return null; marks.push([x - size / 2, y - size / 2, x + size / 2, y + size / 2]); return drawGlyph(layer, id, x, y, size, color || FC.soft, { animate: !calmG, halo: '#fbf6ea' }); };
  // axes helper for the chart kinds
  const P0 = { l: small ? 34 : 46, r: small ? 10 : 16, t: small ? 14 : 18, b: small ? 30 : 38 };
  const axes = (xr, yr, { xlabel, ylabel, logx, cats } = {}) => {
    { const s0 = niceStep(yr[1] - yr[0]), wmax = Math.max(0, ...(() => { const o = []; for (let v = Math.ceil(yr[0] / s0) * s0; v <= yr[1] + s0 * 1e-6 && o.length < 40; v += s0) o.push(mathText(String(fmt(+v.toFixed(10), 3))).length); return o; })()) * (fs - 1.5) * .62; P0.l = Math.max(small ? 34 : 46, Math.ceil(wmax + 8)); }   // wide tick labels (1.00 × 10⁵) widen the margin
    const X = v => P0.l + ((logx ? Math.log10(v) : v) - (logx ? Math.log10(xr[0]) : xr[0])) / ((logx ? Math.log10(xr[1]) - Math.log10(xr[0]) : xr[1] - xr[0]) || 1) * (W - P0.l - P0.r), Y = v => H - P0.b - (v - yr[0]) / ((yr[1] - yr[0]) || 1) * (H - P0.t - P0.b);
    rec = false; const g = mk('g', { class: 'fig-axes' }, layer), tick = r => { const s = niceStep(r[1] - r[0]); const out = []; for (let v = Math.ceil(r[0] / s) * s; v <= r[1] + s * 1e-6; v += s) out.push(+v.toFixed(10)); return out; };
    tick(yr).forEach(v => { mk('line', { x1: P0.l, x2: W - P0.r, y1: Y(v), y2: Y(v), stroke: FC.grid }, g); txt(P0.l - 4, Y(v) + 3, fmt(v, 3), { 'text-anchor': 'end', 'font-size': fs - 1.5, fill: FC.soft, 'font-family': 'IBM Plex Mono, monospace' }, g); });
    if (!cats) (logx ? [1e-3, 1e-2, .1, 1, 10, 100, 1e3, 1e4].filter(v => v >= xr[0] && v <= xr[1]) : tick(xr)).forEach(v => txt(X(v), H - P0.b + 13, fmt(v, 3), { 'text-anchor': 'middle', 'font-size': fs - 1.5, fill: FC.soft, 'font-family': 'IBM Plex Mono, monospace' }, g));
    mk('line', { x1: P0.l, x2: W - P0.r, y1: H - P0.b, y2: H - P0.b, stroke: FC.soft }, g); mk('line', { x1: P0.l, x2: P0.l, y1: P0.t, y2: H - P0.b, stroke: FC.soft }, g); rec = true;
    // axis titles in italics, except a unit (J, s⁻², "height (m)"): units are always upright; variables in them are
    // still italicised by the typesetter
    if (xlabel) txt(W - P0.r, H - 4, xlabel, { 'text-anchor': 'end', 'font-style': unitish(xlabel) ? null : 'italic', 'font-size': fs - .5, class: 'fig-axtitle' }, g);
    if (ylabel) txt(P0.l + 4, P0.t + 2, ylabel, { 'font-style': unitish(ylabel) ? null : 'italic', 'font-size': fs - .5, class: 'fig-axtitle' }, g);
    return { X, Y };
  };
  const pathOf = (fn, xr, X, Y, yr) => { let d = '', pen = false; for (let i = 0; i <= 240; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / 240, y = fn(x); if (!isFinite(y) || y < yr[0] - (yr[1] - yr[0]) || y > yr[1] + (yr[1] - yr[0])) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(Math.max(yr[0] - (yr[1] - yr[0]) * .02, Math.min(yr[1] + (yr[1] - yr[0]) * .02, y))).toFixed(1); pen = true; } return d; };
  // the legend goes where it covers no data mark: the emptiest of the plot's corners (and top/bottom middles), or, when
  // every spot inside would cover something, in a strip above the plot (the viewBox grows upward). The choice is made
  // on the first drawing and kept, so an animated chart's legend never jumps.
  let legendAt = null; const legendPlace = (w, h) => {
    const L = P0.l + 6, R = W - P0.r - 4 - w, T = P0.t + 4, B = H - P0.b - 4 - h, M = (P0.l + W - P0.r - w) / 2;
    const cand = [[R, T], [L + 30, T], [R, B], [L + 4, B], [M, T], [M, B]];
    const cover = ([x, y]) => marks.reduce((a, m) => a + Math.max(0, Math.min(x + w + 3, m[2]) - Math.max(x - 3, m[0])) * Math.max(0, Math.min(y + h + 3, m[3]) - Math.max(y - 3, m[1])), 0);
    let best = null, bc = Infinity; cand.forEach(c => { const v = cover(c); if (v < bc - 1e-6) { bc = v; best = c; } });
    return bc <= 0 ? { x: best[0], y: best[1] } : { outside: true };
  };
  const legend = rows => { if (!rows.length) return; rec = false; const g = mk('g', { class: 'fig-legend' }, layer), w = Math.min(W * .45, Math.max(...rows.map(r => r.n.length)) * (fs * .58) + 28), rh = fs + 5;
    if (!legendAt) legendAt = legendPlace(w, rows.length * rh + 6);
    let x0, y0, pos;
    clampTxt = !legendAt.outside;
    if (legendAt.outside) { // one row above the plot, items side by side
      const ws = rows.map(r => Math.min(W * .45, r.n.length * (fs * .58)) + 30), tot = ws.reduce((a, b) => a + b, 0), hh = rh + 6; x0 = Math.max(P0.l, W - P0.r - tot); y0 = -hh - 2;
      svg.setAttribute('viewBox', `0 ${-hh - 6} ${W} ${H + hh + 6}`);
      mk('rect', { x: x0, y: y0, width: tot, height: hh, rx: 3, fill: 'rgba(251,246,234,.9)', stroke: FC.grid }, g);
      let x = x0; pos = rows.map((r, i) => { const p = [x, y0 + 5 + .75 * rh]; x += ws[i]; return p; });
    } else { x0 = legendAt.x; y0 = legendAt.y; mk('rect', { x: x0, y: y0, width: w, height: rows.length * rh + 6, rx: 3, fill: 'rgba(251,246,234,.9)', stroke: FC.grid }, g); pos = rows.map((r, i) => [x0, y0 + 5 + (i + .75) * rh]); }
    rows.forEach((r, i) => { const [x, y] = pos[i]; if (r.dot) mk('circle', { cx: x + 12, cy: y - 3, r: 3.2, fill: r.c }, g); else mk('rect', { x: x + 6, y: y - 5, width: 12, height: 3, fill: r.c }, g); txt(x + 24, y, r.n, { 'font-size': fs - 1 }, g); }); rec = true; clampTxt = true; };
  let draw = () => {}, loopT = 0, animated = false;
  const k = f.kind;
  if (k === 'flow') {
    const ids = f.nodes.map(n => n.id), indeg = new Map(ids.map(i => [i, 0])); f.edges.forEach(e => indeg.set(e.to, indeg.get(e.to) + 1));
    const layerOf = new Map(); const order = [...ids]; let changed = true, guard = 0; ids.forEach(i => layerOf.set(i, 0));
    while (changed && guard++ < 30) { changed = false; f.edges.forEach(e => { if (ids.indexOf(e.to) > ids.indexOf(e.from) || indeg.get(e.from) === 0) { const v = layerOf.get(e.from) + 1; if (v > layerOf.get(e.to) && v < 12) { layerOf.set(e.to, v); changed = true; } } }); }
    const L = Math.max(...layerOf.values()) + 1, cols = [...Array(L)].map(() => []); order.forEach(i => cols[layerOf.get(i)].push(i));
    const LR = f.dir !== 'TB', pos = new Map(), nw = LR ? Math.min(150, (W - 20) / L - 22) : Math.min(260, W - 60), nh = LR ? 54 : 42;
    cols.forEach((col, li) => col.forEach((id, j) => { const n = col.length; pos.set(id, LR ? { x: 10 + (li + .5) * (W - 20) / L, y: (j + .5) * H / n } : { x: (j + .5) * W / n, y: 10 + (li + .5) * (H - 20) / L }); }));
    const nodeW = LR ? nw : Math.min(nw, W / Math.max(...cols.map(c => c.length)) - 18);
    const edgePath = e => { const a = pos.get(e.from), b = pos.get(e.to); if (LR) { const x1 = a.x + nodeW / 2, x2 = b.x - nodeW / 2 - 2; return `M${x1} ${a.y} C${(x1 + x2) / 2} ${a.y} ${(x1 + x2) / 2} ${b.y} ${x2} ${b.y}`; } const y1 = a.y + nh / 2, y2 = b.y - nh / 2 - 2; return `M${a.x} ${y1} C${a.x} ${(y1 + y2) / 2} ${b.x} ${(y1 + y2) / 2} ${b.x} ${y2}`; };
    const paths = [];
    draw = t => { clear();
      f.edges.forEach((e, i) => { const p = mk('path', { d: edgePath(e), fill: 'none', stroke: FC.soft, 'stroke-width': 1.4, 'marker-end': `url(#${arrowId})` }, layer); paths[i] = p; if (e.label) { const a = pos.get(e.from), b = pos.get(e.to); txt((a.x + b.x) / 2, (a.y + b.y) / 2 - 5, e.label, { 'text-anchor': 'middle', 'font-size': fs - 1.5, fill: FC.rubric, 'font-style': 'italic' }); } });
      const hot = t == null ? -1 : Math.floor(t / 1.1) % f.nodes.length;
      f.nodes.forEach((n, i) => { const p = pos.get(n.id); mk('rect', { x: p.x - nodeW / 2, y: p.y - nh / 2, width: nodeW, height: nh, rx: 8, fill: i === hot ? '#f3e3b8' : '#fffaf0', stroke: i === hot ? FC.rubric : FC.lapis, 'stroke-width': i === hot ? 2 : 1.3 }, layer); multi(p.x, p.y + 3 - (n.note ? 6 : 0), n.label, Math.max(10, Math.floor(nodeW / (fs * .52))), { 'text-anchor': 'middle' }); if (n.note) txt(p.x, p.y + nh / 2 - 6, n.note, { 'text-anchor': 'middle', 'font-size': fs - 2, fill: FC.soft, 'font-style': 'italic' }); });
      if (t != null && f.edges.length) { const e = f.edges[Math.floor(t / 1.1) % f.edges.length], p = paths[f.edges.indexOf(e)]; if (p && p.getTotalLength) { try { const Lp = p.getTotalLength(), q = p.getPointAtLength(Lp * ((t % 1.1) / 1.1)); mk('circle', { cx: q.x, cy: q.y, r: 4.5, fill: FC.rubric }, layer); } catch (x) { } } }
    };
    animated = !!f.animate;
  } else if (k === 'plot') {
    const pk = f.animate ? f.animate.param : null; const fns = f.curves.map(c => compile(c.expr, pk ? ['x', pk] : ['x']));
    let yr = f.y; if (!yr) { let lo = Infinity, hi = -Infinity; const pv = pk ? [f.animate.from, f.animate.to] : [0]; fns.forEach(fn => pv.forEach(a => { for (let i = 0; i <= 120; i++) { const y = fn(f.x[0] + (f.x[1] - f.x[0]) * i / 120, a); if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } } })); f.points.forEach(p => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }); if (!isFinite(lo)) { lo = -1; hi = 1; } const pad = (hi - lo || 1) * .1; yr = [lo - pad, hi + pad]; if (lo >= 0 && lo < (hi - lo) * .3) yr[0] = 0; }
    draw = t => { clear(); const { X, Y } = axes(f.x, yr, f); const a = pk ? f.animate.from + (f.animate.to - f.animate.from) * (t == null ? 1 : (1 - Math.cos(t / f.animate.period * 2 * Math.PI)) / 2) : 0;
      if (f.shade) { const sf = compile(f.shade.expr, pk ? ['x', pk] : ['x']), a0 = Math.max(f.x[0], f.shade.from), b0 = Math.min(f.x[1], f.shade.to); let d = `M${X(a0)} ${Y(Math.max(yr[0], 0))}`; for (let i = 0; i <= 80; i++) { const x = a0 + (b0 - a0) * i / 80; d += `L${X(x)} ${Y(Math.max(yr[0], Math.min(yr[1], sf(x, a))))}`; } d += `L${X(b0)} ${Y(Math.max(yr[0], 0))}Z`; mk('path', { d, fill: FC.fillA }, layer); if (f.shade.label) txt(X((a0 + b0) / 2), Y((yr[0] + yr[1]) / 2), f.shade.label, { 'text-anchor': 'middle', fill: FC.lapis }); }
      f.vlines.forEach(v => { mk('line', { x1: X(v.x), x2: X(v.x), y1: P0.t, y2: H - P0.b, stroke: FC.rubric, 'stroke-dasharray': '4 3' }, layer); if (v.label) txt(X(v.x) + 4, P0.t + 10, v.label, { fill: FC.rubric, 'font-size': fs - 1 }); });
      f.hlines.forEach(v => { mk('line', { x1: P0.l, x2: W - P0.r, y1: Y(v.y), y2: Y(v.y), stroke: FC.rubric, 'stroke-dasharray': '4 3' }, layer); if (v.label) txt(P0.l + 6, Y(v.y) - 4, v.label, { fill: FC.rubric, 'font-size': fs - 1 }); });
      fns.forEach((fn, i) => mk('path', { d: pathOf(x => fn(x, a), f.x, X, Y, yr), fill: 'none', stroke: SERIES[i % 5], 'stroke-width': small ? 1.8 : 2.2, 'stroke-dasharray': f.curves[i].dash ? '6 4' : null }, layer));
      f.points.forEach(p => { mk('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.4, fill: FC.bg, stroke: FC.ink, 'stroke-width': 1.4 }, layer); if (p[2]) txt(X(p[0]) + 5, Y(p[1]) - 5, p[2], { 'font-size': fs - 1.5 }); });
      if (pk) txt(W - P0.r - 4, H - P0.b - 6, `${pk} = ${fmt(a, 3)}`, { 'text-anchor': 'end', fill: FC.rubric, 'font-family': 'IBM Plex Mono, monospace', 'font-size': fs - 1 });
      legend(f.curves.map((c, i) => ({ n: c.label || '', c: SERIES[i % 5] })).filter(r => r.n).concat(f.points.length && f.pointsLabel ? [{ n: f.pointsLabel, c: FC.ink, dot: true }] : []));
    };
    animated = !!pk;
  } else if (k === 'distribution') {
    const D = densityOf(f), xr = [D.lo, D.hi]; let peak = 0; if (D.cont) for (let i = 0; i <= 200; i++) peak = Math.max(peak, D.f(xr[0] + (xr[1] - xr[0]) * i / 200)); else for (let x = 0; x <= D.hi; x++) peak = Math.max(peak, D.f(x));
    const yr = [0, peak * 1.25 || 1], inShade = x => f.shade && (f.shade.from == null || x >= f.shade.from - 1e-9) && (f.shade.to == null || x <= f.shade.to + 1e-9);
    let samples = [];
    draw = t => { clear(); const { X, Y } = axes(D.cont ? xr : [-.6, D.hi + .6], yr, { xlabel: f.xlabel || 'x', ylabel: D.cont ? 'density' : 'P(X = x)' });
      let area = 0;
      if (D.cont) { if (f.shade) { const a0 = Math.max(xr[0], f.shade.from ?? xr[0]), b0 = Math.min(xr[1], f.shade.to ?? xr[1]); let d = `M${X(a0)} ${Y(0)}`; for (let i = 0; i <= 100; i++) { const x = a0 + (b0 - a0) * i / 100; d += `L${X(x)} ${Y(D.f(x))}`; area += i ? D.f(x) * (b0 - a0) / 100 : 0; } mk('path', { d: d + `L${X(b0)} ${Y(0)}Z`, fill: FC.fillA }, layer); } mk('path', { d: pathOf(D.f, xr, X, Y, yr), fill: 'none', stroke: FC.lapis, 'stroke-width': 2.2 }, layer); }
      else { const bw = Math.max(3, (X(1) - X(0)) * .7); for (let x = 0; x <= D.hi; x++) { const p = D.f(x), sh = inShade(x); if (sh) area += p; mk('rect', { x: X(x) - bw / 2, y: Y(p), width: bw, height: Y(0) - Y(p), fill: sh ? FC.rubric : 'rgba(45,91,142,.35)' }, layer); if (x <= 14 || x % 2 === 0) txt(X(x), H - P0.b + 13, x, { 'text-anchor': 'middle', 'font-size': fs - 1.5, fill: FC.soft }); } }
      f.marks.forEach(m => { mk('line', { x1: X(m.x), x2: X(m.x), y1: P0.t, y2: H - P0.b, stroke: FC.rubric, 'stroke-dasharray': '4 3' }, layer); txt(X(m.x) + 4, P0.t + 12, m.label || fmt(m.x, 3), { fill: FC.rubric, 'font-size': fs - 1 }); });
      if (f.shade) txt(W - P0.r - 6, P0.t + 14, (f.shade.label ? f.shade.label + ' = ' : 'shaded area = ') + fmt(area, 3), { 'text-anchor': 'end', fill: D.cont ? FC.lapis : FC.rubric, 'font-family': 'IBM Plex Mono, monospace', 'font-size': fs - 1 });
      if (t != null && D.sample) { const want = Math.min(400, Math.floor(t * 30) % 420); if (want < samples.length) samples = []; while (samples.length < want) samples.push(D.sample()); const bins = new Map(); samples.forEach(v => { const b = D.cont ? Math.round(v / ((xr[1] - xr[0]) / 40)) : v; bins.set(b, (bins.get(b) || 0) + 1); }); bins.forEach((c, b) => { const x = D.cont ? b * (xr[1] - xr[0]) / 40 : b; for (let j = 0; j < c && j < 60; j++) mk('circle', { cx: X(x), cy: H - P0.b - 3 - j * 4, r: 1.7, fill: 'rgba(42,30,21,.55)' }, layer); }); txt(P0.l + 6, H - P0.b - 6, `${samples.length} random draws`, { 'font-size': fs - 2, fill: FC.soft, 'font-family': 'IBM Plex Mono, monospace' }); }
    };
    animated = !!f.animate && !!D.sample;
  } else if (k === 'bars' || k === 'hist') {
    let cats, series;
    if (k === 'hist') { let bins = f.bins; if (!bins.length) { const v = f.values, lo = Math.min(...v), hi = Math.max(...v), nb = Math.max(4, Math.min(20, Math.ceil(Math.log2(v.length) + 1))), w = (hi - lo) / nb || 1; bins = [...Array(nb)].map((_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: v.filter(x => x >= lo + i * w && (x < lo + (i + 1) * w || i === nb - 1 && x <= hi)).length })); } cats = bins.map(b => fmt(b.from, 3)); series = [{ name: f.ylabel || 'count', values: bins.map(b => b.count) }]; }
    else { cats = f.categories; series = f.series; }
    const max = Math.max(1e-9, ...series.flatMap(s => s.values)), min = Math.min(0, ...series.flatMap(s => s.values));
    draw = () => { clear(); const { X, Y } = axes([0, cats.length], [min, max * 1.12], { cats: true, xlabel: f.xlabel, ylabel: f.ylabel }); const gw = (X(1) - X(0)), bw = k === 'hist' ? gw : gw * .78 / series.length;
      cats.forEach((cname, i) => { series.forEach((s, j) => { const v = s.values[i] ?? 0, x0 = k === 'hist' ? X(i) : X(i) + gw * .11 + j * bw; mk('rect', { x: x0, y: Y(Math.max(0, v)), width: Math.max(1, bw - (k === 'hist' ? 1 : 2)), height: Math.abs(Y(v) - Y(0)), fill: f.highlight && f.highlight.includes(i) ? FC.rubric : SERIES[j % 5], 'fill-opacity': .82 }, layer); if (k === 'bars' && cats.length <= 12 && !small) txt(x0 + bw / 2, Y(Math.max(0, v)) - 3, fmt(v, 3), { 'text-anchor': 'middle', 'font-size': fs - 2.5, fill: FC.soft }); }); if (k === 'bars' || i % Math.ceil(cats.length / 10) === 0) txt(k === 'hist' ? X(i) : X(i + .5), H - P0.b + 13, cname, { 'text-anchor': k === 'hist' ? 'middle' : 'middle', 'font-size': fs - 2, fill: FC.soft }); });
      if (series.length > 1) legend(series.map((s, j) => ({ n: s.name, c: SERIES[j % 5] }))); };
  } else if (k === 'scatter') {
    const xs = f.points.map(p => p[0]), ys = f.points.map(p => p[1]); const pad = (a, lo, hi) => [lo - (hi - lo) * .08, hi + (hi - lo) * .08];
    const xr = f.logx ? [Math.min(...xs) / 2, Math.max(...xs) * 2] : pad(0, Math.min(...xs), Math.max(...xs)), yr = pad(0, Math.min(...ys), Math.max(...ys));
    let fit = null; if (f.fit === 'ols' || f.fit === true) { const n = xs.length, tx = f.logx ? xs.map(Math.log10) : xs, mx = tx.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n, sxy = tx.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), sxx = tx.reduce((a, x) => a + (x - mx) ** 2, 0); fit = { slope: sxy / (sxx || 1), intercept: my - sxy / (sxx || 1) * mx }; } else if (f.fit) fit = f.fit;
    const yhat = x => fit.intercept + fit.slope * (f.logx ? Math.log10(x) : x);
    draw = t => { clear(); const { X, Y } = axes(xr, yr, f); const shown = t == null ? f.points.length : Math.min(f.points.length, Math.floor(t * 4) % (f.points.length + 8));
      f.points.slice(0, shown).forEach(p => { if (fit && f.residuals) mk('line', { x1: X(p[0]), x2: X(p[0]), y1: Y(p[1]), y2: Y(yhat(p[0])), stroke: FC.rubric, 'stroke-dasharray': '2 2' }, layer); mk('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.4, fill: FC.lapis, 'fill-opacity': .8 }, layer); if (p[2]) txt(X(p[0]) + 5, Y(p[1]) - 5, p[2], { 'font-size': fs - 2 }); });
      if (fit && shown >= f.points.length) { mk('line', { x1: X(xr[0]), y1: Y(yhat(xr[0])), x2: X(xr[1]), y2: Y(yhat(xr[1])), stroke: FC.ink, 'stroke-width': 1.8 }, layer); txt(W - P0.r - 4, P0.t + 12, `ŷ = ${fmt(fit.intercept, 3)} + ${fmt(fit.slope, 3)}${f.logx ? '·log10 x' : 'x'}`, { 'text-anchor': 'end', 'font-family': 'IBM Plex Mono, monospace', 'font-size': fs - 1.5 }); } };
    animated = !!f.animate;
  } else if (k === 'boxplot') {
    const lo = Math.min(...f.groups.map(g => Math.min(g.min, ...(g.outliers || [])))), hi = Math.max(...f.groups.map(g => Math.max(g.max, ...(g.outliers || []))));
    draw = () => { clear(); const { X, Y } = axes([0, f.groups.length], [lo - (hi - lo) * .08, hi + (hi - lo) * .08], { cats: true, xlabel: f.xlabel, ylabel: f.ylabel }); const gw = X(1) - X(0);
      f.groups.forEach((g, i) => { const cx = X(i + .5), w = Math.min(60, gw * .5); mk('line', { x1: cx, x2: cx, y1: Y(g.min), y2: Y(g.max), stroke: FC.soft }, layer); [g.min, g.max].forEach(v => mk('line', { x1: cx - w / 4, x2: cx + w / 4, y1: Y(v), y2: Y(v), stroke: FC.soft }, layer)); mk('rect', { x: cx - w / 2, y: Y(g.q3), width: w, height: Y(g.q1) - Y(g.q3), fill: FC.fillA, stroke: FC.lapis }, layer); mk('line', { x1: cx - w / 2, x2: cx + w / 2, y1: Y(g.median), y2: Y(g.median), stroke: FC.ink, 'stroke-width': 2.4 }, layer); (g.outliers || []).forEach(o => mk('circle', { cx, cy: Y(o), r: 2.6, fill: 'none', stroke: FC.rubric }, layer)); txt(cx, H - P0.b + 13, g.label, { 'text-anchor': 'middle', 'font-size': fs - 2, fill: FC.soft }); }); };
  } else if (k === 'numberline') {
    const y0 = H * .55, X = v => 30 + (v - f.min) / (f.max - f.min) * (W - 60), step = f.step || niceStep(f.max - f.min);
    draw = t => { clear(); mk('line', { x1: 20, x2: W - 20, y1: y0, y2: y0, stroke: FC.ink, 'stroke-width': 1.4, 'marker-end': `url(#${arrowId})` }, layer);
      for (let v = Math.ceil(f.min / step) * step; v <= f.max + 1e-9; v += step) { mk('line', { x1: X(v), x2: X(v), y1: y0 - 5, y2: y0 + 5, stroke: FC.ink }, layer); txt(X(v), y0 + 19, fmt(v, 3), { 'text-anchor': 'middle', 'font-size': fs - 1, 'font-family': 'IBM Plex Mono, monospace' }); }
      f.intervals.forEach((iv, i) => { const yy = y0 - 18 - i * 16, c = SERIES[i % 5]; mk('line', { x1: X(iv.from), x2: X(iv.to), y1: yy, y2: yy, stroke: c, 'stroke-width': 5, 'stroke-linecap': 'butt', opacity: .8 }, layer); [[iv.from, iv.closedL], [iv.to, iv.closedR]].forEach(([v, cl]) => mk('circle', { cx: X(v), cy: yy, r: 4.5, fill: cl ? c : FC.bg, stroke: c, 'stroke-width': 2 }, layer)); if (iv.label) txt((X(iv.from) + X(iv.to)) / 2, yy - 8, iv.label, { 'text-anchor': 'middle', fill: c, 'font-size': fs - 1 }); });
      f.points.forEach(p => { mk('circle', { cx: X(p.x), cy: y0, r: 5, fill: p.open ? FC.bg : FC.rubric, stroke: FC.rubric, 'stroke-width': 2 }, layer); if (p.label) txt(X(p.x), y0 + 36, p.label, { 'text-anchor': 'middle', fill: FC.rubric, 'font-size': fs - 1 }); });
      if (t != null) { const v = f.min + (f.max - f.min) * ((Math.sin(t * .8) + 1) / 2); mk('path', { d: `M${X(v)} ${y0 - 9}l-6 -10h12z`, fill: FC.verd }, layer); txt(X(v), y0 - 24 - f.intervals.length * 16, 'x = ' + fmt(v, 2) + (f.intervals.length ? '  ' + f.intervals.map(iv => (v > iv.from || iv.closedL && v === iv.from) && (v < iv.to || iv.closedR && v === iv.to) ? '✓' : '✗').join(' ') : ''), { 'text-anchor': 'middle', fill: FC.verd, 'font-size': fs - 1, 'font-family': 'IBM Plex Mono, monospace' }); } };
    animated = !!f.animate;
  } else if (k === 'tree') {
    const leaves = n => n.children.length ? n.children.reduce((a, c) => a + leaves(c), 0) : 1, depth = n => 1 + Math.max(0, ...n.children.map(depth));
    const D = depth(f.root), total = leaves(f.root), lh = (H - 30) / D;
    draw = () => { clear(); const place = (n, d, x0, x1) => { const x = (x0 + x1) / 2, y = 22 + d * lh; let acc = x0; n.children.forEach(c => { const w = (x1 - x0) * leaves(c) / leaves(n); const cx = acc + w / 2, cy = 22 + (d + 1) * lh; mk('line', { x1: x, y1: y + 10, x2: cx, y2: cy - 12, stroke: FC.soft, 'stroke-width': 1.3 }, layer); if (c.edge) txt((x + cx) / 2 + 4, (y + cy) / 2, c.edge, { 'font-size': fs - 2, fill: FC.rubric, 'font-style': 'italic' }); place(c, d + 1, acc, acc + w); acc += w; });
        const lw = Math.min((x1 - x0) - 6, 170); mk('rect', { x: x - lw / 2, y: y - 11, width: lw, height: 22, rx: 6, fill: n.children.length ? '#fffaf0' : '#eef4f0', stroke: n.children.length ? FC.lapis : FC.verd }, layer); const gw = lw >= 96 && glyph(n.label, x - lw / 2 + 11, y, 13, n.icon) ? 9 : 0; txt(x + gw, y + 4, wrapText(n.label, Math.max(6, Math.floor((lw - 2 * gw) / (fs * .55))))[0], { 'text-anchor': 'middle', 'font-size': fs - 1 }); };
      place(f.root, 0, 4, W - 4); void total; };
  } else if (k === 'venn') {
    const n = f.sets.length, R = Math.min(H * .34, W * .2), cx = W / 2, cy = H / 2 + (n === 3 ? 10 : 0), C = n === 2 ? [[cx - R * .55, cy], [cx + R * .55, cy]] : [[cx - R * .55, cy - R * .35], [cx + R * .55, cy - R * .35], [cx, cy + R * .55]];
    draw = () => { clear(); mk('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 8, fill: 'none', stroke: FC.grid }, layer); if (f.universe) txt(16, 24, f.universe, { 'font-style': 'italic' });
      C.forEach((c, i) => { mk('circle', { cx: c[0], cy: c[1], r: R, fill: f.shade.includes('ABC'[i]) ? FC.fillR : 'rgba(45,91,142,.08)', stroke: SERIES[i], 'stroke-width': 1.8 }, layer); txt(c[0] + (i === 0 ? -R * .9 : i === 1 ? R * .9 : 0), c[1] + (i === 2 ? R + 16 : -R - 6), f.sets[i], { 'text-anchor': 'middle', fill: SERIES[i], 'font-weight': 600 }); });
      const at = { A: [-R * .9, 0], B: [R * .9, 0], C: [0, R * .9], AB: [0, n === 3 ? -R * .55 : 0], AC: [-R * .5, R * .35], BC: [R * .5, R * .35], ABC: [0, 0] };
      Object.entries(f.regions).forEach(([key, v]) => { const o = at[key]; if (!o) return; const base = n === 2 ? [cx, cy] : [cx, cy - R * .1]; multi(base[0] + o[0] * (key.length === 1 ? .62 : 1), base[1] + o[1], v, 16, { 'text-anchor': 'middle', 'font-size': fs - 1.5 }); }); };
  } else if (k === 'timeline') {
    const ts = f.events.map(e => e.t), lo = Math.min(...ts), hi = Math.max(...ts), X = v => 40 + (v - lo) / ((hi - lo) || 1) * (W - 80), y0 = H / 2;
    draw = t => { clear(); mk('line', { x1: 24, x2: W - 24, y1: y0, y2: y0, stroke: FC.ink, 'stroke-width': 1.6, 'marker-end': `url(#${arrowId})` }, layer); const hot = t == null ? -1 : Math.floor(t / 1.2) % f.events.length;
      f.events.forEach((e, i) => { const x = X(e.t), up = i % 2 === 0; mk('circle', { cx: x, cy: y0, r: i === hot ? 7 : 5, fill: i === hot ? FC.rubric : FC.lapis }, layer); mk('line', { x1: x, x2: x, y1: y0, y2: y0 + (up ? -26 : 26), stroke: FC.grid }, layer); multi(x, y0 + (up ? -46 : 46), e.label, 22, { 'text-anchor': 'middle', 'font-size': fs - 1 }); txt(x, y0 + (up ? 14 : -8), e.tl || fmt(e.t, 3), { 'text-anchor': 'middle', 'font-size': fs - 2.5, fill: FC.soft, 'font-family': 'IBM Plex Mono, monospace' }); }); };
    animated = !!f.animate;
  } else if (k === 'sketch') {
    const sx = W / f.w, sy = H / f.h, s = Math.min(sx, sy), ox = (W - f.w * s) / 2, oy = (H - f.h * s) / 2, X = v => ox + v * s, Y = v => oy + v * s;
    const tone = it => it.fill || ({ accent: FC.fillR, muted: 'rgba(90,60,30,.08)', warn: FC.fillR, ok: 'rgba(63,125,110,.2)' }[it.tone] || 'rgba(45,91,142,.12)');
    draw = () => { clear(); f.items.forEach(it => { const g = mk('g', {}, layer);
      if (it.shape === 'rect') mk('rect', { x: X(it.x || 0), y: Y(it.y || 0), width: (it.w || 10) * s, height: (it.h || 10) * s, rx: 4, fill: tone(it), stroke: FC.lapis }, g);
      else if (it.shape === 'circle') mk('circle', { cx: X(it.x || 0), cy: Y(it.y || 0), r: (it.r || 5) * s, fill: tone(it), stroke: FC.lapis }, g);
      else if (it.shape === 'ellipse') mk('ellipse', { cx: X(it.x || 0), cy: Y(it.y || 0), rx: (it.rx || it.r || 8) * s, ry: (it.ry || it.r || 5) * s, fill: tone(it), stroke: FC.lapis }, g);
      else if (it.shape === 'line' || it.shape === 'arrow') mk('line', { x1: X(it.x || 0), y1: Y(it.y || 0), x2: X(it.x2 || 0), y2: Y(it.y2 || 0), stroke: it.tone === 'accent' ? FC.rubric : FC.soft, 'stroke-width': 1.6, 'marker-end': it.shape === 'arrow' ? `url(#${arrowId})` : null }, g);
      else if (it.shape === 'path' && it.d) { const p = mk('path', { d: it.d, fill: it.fill || 'none', stroke: FC.lapis, 'stroke-width': 1.6 / s, transform: `translate(${ox} ${oy}) scale(${s})` }, g); void p; }
      let gl0 = 0; { const lab = it.text || it.label || it.name || ''; if (it.shape === 'rect' && (it.h || 10) * s >= 46 && (it.w || 10) * s >= 46) { if (glyph(lab, X((it.x || 0) + (it.w || 10) / 2), Y(it.y || 0) + 15, 18, it.icon)) gl0 = 9; }
        else if ((it.shape === 'circle' || it.shape === 'ellipse') && (it.r || it.ry || 5) * s >= 22) { if (glyph(lab, X(it.x || 0), Y(it.y || 0) - (lab ? 10 : 0), lab ? 16 : 22, it.icon)) gl0 = 9; } }
      if (it.text || it.label) { const cxp = it.shape === 'line' || it.shape === 'arrow' ? (X(it.x || 0) + X(it.x2 || 0)) / 2 : it.shape === 'rect' ? X((it.x || 0) + (it.w || 10) / 2) : X(it.x || 0), cyp = it.shape === 'line' || it.shape === 'arrow' ? (Y(it.y || 0) + Y(it.y2 || 0)) / 2 - 6 : it.shape === 'rect' ? Y((it.y || 0) + (it.h || 10) / 2) + 4 : it.shape === 'text' ? Y(it.y || 0) : Y(it.y || 0) + 4; multi(cxp, cyp + gl0, it.text || it.label, 22, { 'text-anchor': 'middle', 'font-size': fs - .5 }, g); const lab = String(it.text || it.label); if (!gl0 && meaningOf(lab)) glyph(lab, cxp - Math.min(22, mathText(lab).length) * (fs - .5) * .29 - 11, cyp - 4, 14, it.icon); } }); };   /* a symbol ("m", "L") gets a picture of what it means beside it */
  } else if (k === 'codetrace') {
    const lh = 22, x0 = 34, notesX = small ? W : W * .5;
    draw = t => { clear(); const hot = t == null ? -1 : Math.floor(t / 1.4) % (f.lines.length + (f.output.length ? 1 : 0));
      mk('rect', { x: 6, y: 6, width: W - 12, height: H - 12, rx: 8, fill: '#f6f1e6', stroke: FC.grid }, layer);
      f.lines.forEach((l, i) => { const y = 28 + i * lh; if (i === hot) mk('rect', { x: 8, y: y - 15, width: W - 16, height: lh, fill: 'rgba(207,168,79,.28)' }, layer); txt(26, y, i + 1, { 'text-anchor': 'end', 'font-size': fs - 2, fill: FC.soft, 'font-family': 'IBM Plex Mono, monospace' }); const ct = mk('text', { x: x0, y, 'font-size': fs - 1, fill: FC.ink, 'font-family': 'IBM Plex Mono, monospace' }, layer); ct.textContent = l.code.length > (small ? 44 : 52) ? l.code.slice(0, small ? 43 : 51) + '…' : l.code;
        if (!small && l.note) txt(notesX, y, '← ' + (l.note.length > 46 ? l.note.slice(0, 45) + '…' : l.note), { 'font-size': fs - 1.5, fill: FC.lapis, 'font-style': 'italic' });
        if (i === hot && l.state) { const st = Object.entries(l.state).map(([a, b]) => a + ' = ' + b).join('   '); txt(W - 14, H - 14, st, { 'text-anchor': 'end', 'font-size': fs - 1.5, fill: FC.rubric, 'font-family': 'IBM Plex Mono, monospace' }); } });
      if (f.output.length) { const y1 = 28 + f.lines.length * lh + 6; mk('line', { x1: 12, x2: W - 12, y1: y1 - 12, y2: y1 - 12, stroke: FC.grid }, layer); f.output.forEach((o, j) => { const ot = mk('text', { x: x0, y: y1 + j * 16, 'font-size': fs - 1.5, fill: hot === f.lines.length ? FC.rubric : FC.verd, 'font-family': 'IBM Plex Mono, monospace' }, layer); ot.textContent = o; }); } };
    animated = !!f.animate;
  } else if (k === 'table') {
    const nc = Math.max(f.columns.length, ...f.rows.map(r => r.length)), cw = (W - 12) / nc;
    const rowPics = f.icons !== false && f.rows.filter(r => glyphFor(String(r[0] || ''))).length >= Math.max(2, f.rows.length * .6);   /* pictures in the first column only when most rows have one: a lone icon reads as a highlight */
    draw = () => { clear(); const row = (cells, y, head, ri) => cells.forEach((c, j) => { const hl = !head && f.highlight.some(h => +h[0] === ri && +h[1] === j); mk('rect', { x: 6 + j * cw, y: y - 15, width: cw, height: 22, fill: head ? '#efe4c8' : hl ? 'rgba(156,58,40,.18)' : ri % 2 ? '#fbf6ea' : '#fffaf0', stroke: FC.grid }, layer); const gi = !head && j === 0 && cw >= 80 && rowPics && glyph(String(c), 16 + j * cw, y - 4, 13) ? 14 : 0; txt(10 + gi + j * cw, y, String(c).slice(0, Math.floor((cw - gi) / (fs * .55))), { 'font-weight': head ? 600 : 400, 'font-size': fs - 1 }); });
      if (f.columns.length) row(f.columns, 26, true, -1); f.rows.forEach((r, i) => row(r, 26 + (i + (f.columns.length ? 1 : 0)) * 22, false, i)); };
  } else if (k === 'contrast') {
    draw = () => { clear(); const w = (W - 30) / 2; [[f.wrong, 10, FC.rubric, '✗'], [f.right, 20 + w, FC.verd, '✓']].forEach(([side, x, c, mark]) => { mk('rect', { x, y: 10, width: w, height: H - 20, rx: 10, fill: c === FC.rubric ? 'rgba(156,58,40,.07)' : 'rgba(63,125,110,.09)', stroke: c, 'stroke-width': 1.4 }, layer); mk('circle', { cx: x + 22, cy: 32, r: 12, fill: c }, layer); txt(x + 22, 37, mark, { 'text-anchor': 'middle', fill: '#fff', 'font-size': 14, 'font-weight': 700 }); if (side.title) txt(x + 42, 37, side.title, { fill: c, 'font-weight': 600 });  const L = wrapText(side.text, Math.floor((w - 20) / (fs * (looksLikeCode(String(side.text)) ? .6 : .53))));   /* a code line is set in the wider mono face */ const cap = Math.max(1, Math.floor((H - 13 - 62) / (fs * 1.3)) + 1); if (L.length > cap) { L.length = cap; L[cap - 1] = L[cap - 1].replace(/[\s,;:.]*$/, '') + '…'; }   /* as many lines as the panel holds; a cut text ends in an ellipsis */ L.forEach((l, i) => txt(x + 14, 62 + i * fs * 1.3, l, { 'font-size': fs - .5 })); { const free = H - 10 - (62 + L.length * fs * 1.3), id = f.icons === false ? null : glyphFor(side.text, side.icon); if (id && id !== 'cross' && id !== 'check' && free >= 46) { const sz = Math.min(54, free - 12); glyph(side.text, x + w / 2, H - 10 - free / 2, sz, side.icon, c); } } }); };   /* the card's empty lower part shows what its sentence is about */
  }
  // ---- run: a static drawing, or a loop (paused off screen, never with reduced motion unless asked)
  let raf = 0, alive = true, visible = true, t0 = performance.now(), playing = false;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); }) : null; if (io) io.observe(box);
  const loop = () => { if (!alive) return; if (!box.isConnected && t0 + 2000 < performance.now()) { stop(); return; } if (visible) { try { draw((performance.now() - t0) / 1000); } catch (e) { stop(); } } raf = requestAnimationFrame(loop); };
  const stop = () => { alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); };
  try { draw(null); } catch (e) { box.innerHTML = ''; box.append(el('div', { class: 'fig-bad', text: 'This figure could not be drawn: ' + e.message })); return () => {}; }
  if (animated) {
    box.classList.add('animated');
    if (prefersCalm()) { const b = el('button', { class: 'fig-play', type: 'button', 'aria-label': 'Play the animation', title: 'Play', text: '▶' }); b.onclick = () => { if (playing) { playing = false; alive = false; cancelAnimationFrame(raf); draw(null); b.textContent = '▶'; return; } playing = true; alive = true; t0 = performance.now(); b.textContent = '❚❚'; loop(); }; box.querySelector('.fig-frame').append(b); }
    else loop();
  }
  return stop;
}
// a label is code when it holds R / Python syntax or a code call (mean(x), read.csv(…)); maths calls such as sin(θ),
// e_s(T) or K(sin 45°) stay typeset maths (the rule is js/room/prose.js isCodeCall, shared with the scroll's prose)
export const looksLikeCode = s => /<-|\b\w+\$\w|^\[1\]|\bna\.rm\b|==|::/.test(s) || [...String(s).matchAll(/([A-Za-z_][\w.]*)\(([^)]*)\)/g)].some(m => isCodeCall(m[1], m[2]));
function mathCap(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
