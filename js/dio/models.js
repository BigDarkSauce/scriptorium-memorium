// Built-in simulation models (ported from Scriptorium v2), running on the new engine through a small adapter.
// Each model: {params:{key:[min,max,default,unit,label]}, build(D,p) -> {step(h), visual(dt), readouts(), orbit?, live?(k), click?(raycaster), hist?, histCurve?}}
// D.label(text, getPos) marks a significant actor (used for the guided tour); unlabelled meshes are scenic decor.
import * as T from 'three';
import { clamp, fmt, lerp, mod, mulberry, compile } from '../util.js';
import { woodGrain } from '../gfx/textures.js';
// Lights: v2 ran with legacy light units; scale to physically based units so scenes keep their look.
const PI = Math.PI;
class PointLight extends T.PointLight { constructor(c, i = 1, d = 0, decay = 2) { super(c, i * PI * 4, d, Math.min(decay, 2)); } }
class SpotLight extends T.SpotLight { constructor(c, i = 1, d = 0, a, p, decay = 2) { super(c, i * PI * 6, d, a, p, Math.min(decay, 2)); } }
class DirectionalLight extends T.DirectionalLight { constructor(c, i = 1) { super(c, i * PI * .8); } }
class HemisphereLight extends T.HemisphereLight { constructor(a, b, i = 1) { super(a, b, i * PI * .6); } }
const THREE = { ...T, PointLight, SpotLight, DirectionalLight, HemisphereLight };
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
const woodTex = woodGrain([120, 80, 46], 'legacy');
function woodMat() { return new T.MeshStandardMaterial({ map: woodTex, color: 0xb07a4a, roughness: .55, metalness: .05 }); }
export const V3 = (x, y, z) => new T.Vector3(x, y, z);
function cyl(r, h, mat, seg = 16) { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function ball(r, mat) { const m = new T.Mesh(new T.SphereGeometry(r, 40, 24), mat); m.castShadow = true; return m; }
function box(w, h, d, mat) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function trail(n, color) { const g = new T.BufferGeometry(); const a = new Float32Array(n * 3); g.setAttribute('position', new T.BufferAttribute(a, 3)); g.setDrawRange(0, 0); const l = new T.Line(g, new T.LineBasicMaterial({ color, transparent: true, opacity: .85 })); l.userData = { n, count: 0, a, isTrail: true }; l.add = function (v) { const u = this.userData; if (u.count < u.n) { u.a.set([v.x, v.y, v.z], u.count * 3); u.count++; } else { u.a.copyWithin(0, 3); u.a.set([v.x, v.y, v.z], (u.n - 1) * 3); } this.geometry.setDrawRange(0, u.count); this.geometry.attributes.position.needsUpdate = true; return this; }; l.frustumCulled = false; return l; }
function lineFrom(points, color, dashed) { const g = new T.BufferGeometry().setFromPoints(points); const m = dashed ? new T.LineDashedMaterial({ color, dashSize: .2, gapSize: .15 }) : new T.LineBasicMaterial({ color }); const l = new T.Line(g, m); if (dashed) l.computeLineDistances(); return l; }
export const HELPERS = { THREE, V3, cyl, ball, box, trail, lineFrom, canvasTex, woodMat };
export const DIO = {};



/* --- Pendulum --- */
DIO.pendulum={params:{L:[.5,4,2,'m','string length'],g:[1,25,9.81,'m/s²','gravity'],theta0:[2,178,40,'°','release angle'],damping:[0,.6,0,'1/s','damping']},
 build(D,p){const W=D.world,piv=V3(0,5.6,0),Lv=1.2+p.L*.95;
  const postM=D.mats.wood;[-2.6,2.6].forEach(x=>{const c=box(.35,6,.35,postM);c.position.set(x,3,0);W.add(c)});const bar=box(5.6,.3,.4,D.mats.brass);bar.position.copy(piv).y+=.15;W.add(bar);
  const pivot=ball(.12,D.mats.brass);pivot.position.copy(piv);W.add(pivot);
  const rod=cyl(.025,1,D.mats.iron,8);W.add(rod);const bob=ball(.38,D.mats.chrome);W.add(bob);
  const ghost=ball(.38,new THREE.MeshStandardMaterial({color:0x6aa0e0,transparent:true,opacity:.28}));W.add(ghost);
  const tr=trail(260,0xffc56b);W.add(tr);
  const vert=lineFrom([piv,V3(0,piv.y-Lv-.6,0)],0x8f733a,true);W.add(vert);
  const arcG=new THREE.BufferGeometry();arcG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(41*3),3));const arc=new THREE.Line(arcG,new THREE.LineBasicMaterial({color:0xffd27a}));arc.frustumCulled=false;W.add(arc);
  let th=p.theta0*Math.PI/180,w=0,gth=th,gw=0,lastW=0,lastTh=th,turns=[],Tm=NaN;const k=p.g/p.L,c=p.damping;
  const pos=a=>V3(piv.x+Lv*Math.sin(a),piv.y-Lv*Math.cos(a),0);
  D.label('bob · m',()=>bob.position.clone().add(V3(0,.4,0)));D.label('string · L',()=>pos(th*.5).lerp(piv,.45));D.label('θ',()=>V3(piv.x+.9*Math.sin(th/2),piv.y-.9*Math.cos(th/2),0),true);D.label('pivot',()=>piv.clone().add(V3(0,.45,0)));D.label('small-angle model',()=>ghost.position.clone().add(V3(0,-.55,0)));
  D.seriesName='θ(t) in degrees';D.event('bob released from rest at θ₀ = '+p.theta0.toFixed(1)+'°',pos(th));
  return{orbit:{target:V3(0,3.4,0),r:14},
   step(h){const f=(a,b)=>[b,-k*Math.sin(a)-c*b];const k1=f(th,w),k2=f(th+h/2*k1[0],w+h/2*k1[1]),k3=f(th+h/2*k2[0],w+h/2*k2[1]),k4=f(th+h*k3[0],w+h*k3[1]);th+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);w+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);
    gw+=(-k*gth-c*gw)*h;gth+=gw*h;
    if(lastW!==0&&Math.sign(w)!==Math.sign(lastW)&&Math.abs(th)>1e-3){turns.push(D.t);if(turns.length>2){Tm=turns.at(-1)-turns.at(-3)}D.event('turning point: ω = 0, θ = '+(th*180/Math.PI).toFixed(1)+'°',pos(th))}
    if(Math.sign(th)!==Math.sign(lastTh)&&lastTh!==0){D.event('lowest point: speed v = Lω = '+fmt(Math.abs(p.L*w),2)+' m/s',pos(0),0x88c0ff)}
    lastW=w;lastTh=th},
   visual(){const b=pos(th);bob.position.copy(b);ghost.position.copy(pos(gth));const mid=b.clone().add(piv).multiplyScalar(.5);rod.position.copy(mid);rod.scale.y=Lv;rod.rotation.z=th;tr.add(b);D.push(th*180/Math.PI);
    const a=arcG.attributes.position;for(let i=0;i<=40;i++){const s=th*i/40;a.setXYZ(i,piv.x+.8*Math.sin(s),piv.y-.8*Math.cos(s),0)}a.needsUpdate=true},
   readouts(){const T0=2*Math.PI*Math.sqrt(p.L/p.g),E=.5*p.L*p.L*w*w+p.g*p.L*(1-Math.cos(th));return[['θ',fmt(th*180/Math.PI,1)+'°'],['ω',fmt(w,2)+' rad/s'],['T measured',isFinite(Tm)?fmt(Tm,3)+' s':'…'],['T₀=2π√(L/g)',fmt(T0,3)+' s'],['E/m',fmt(E,3)+' J/kg'],['T/T₀',isFinite(Tm)?fmt(Tm/T0,3):'…']]}}}};

/* --- Spring --- */
DIO.spring={params:{k:[1,60,12,'N/m','spring constant'],m:[.2,5,1,'kg','mass'],c:[0,3,0,'kg/s','damping'],x0:[-1,1,.7,'m','initial stretch']},
 build(D,p){const W=D.world,wallX=-5,y=1,S_=2.2;
  const rail=box(11,.12,.6,D.mats.iron);rail.position.set(0,.06,0);W.add(rail);const wall=box(.4,2.6,2,D.mats.wood);wall.position.set(wallX,1.3,0);W.add(wall);
  const sz=.6+Math.cbrt(p.m)*.45;const mass=box(sz,sz,sz,D.mats.brass);W.add(mass);
  const pts=[];for(let i=0;i<=400;i++){const t=i/400;pts.push(V3(t,.32*Math.cos(t*Math.PI*2*14),.32*Math.sin(t*Math.PI*2*14)))}
  const coil=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),400,.045,8),D.mats.chrome);coil.castShadow=true;W.add(coil);
  const eq=lineFrom([V3(0,.15,1.2),V3(0,2.4,1.2)],0x8f733a,true);W.add(eq);
  let x=p.x0,v=0,lv=0,lx=x;const ex=x=>x*S_;
  D.label('mass · m',()=>mass.position.clone().add(V3(0,sz/2+.3,0)));D.label('spring · k',()=>V3((wallX+mass.position.x)/2,y+.6,0));D.label('x = 0 (equilibrium)',()=>V3(0,2.6,1.2));
  D.seriesName='x(t) in metres';
  return{orbit:{target:V3(0,1.2,0),r:13,ph:1.15},
   step(h){const a=(-p.k*x-p.c*v)/p.m;v+=a*h;x+=v*h;if(lv!==0&&Math.sign(v)!==Math.sign(lv))D.event('turning point x = '+fmt(x,3)+' m, all energy potential',V3(ex(x),y,0));if(Math.sign(x)!==Math.sign(lx)&&lx!==0)D.event('passes equilibrium: v = '+fmt(v,3)+' m/s, all energy kinetic',V3(0,y,0),0x88c0ff);lv=v;lx=x},
   visual(){mass.position.set(ex(x),sz/2+.12,0);const len=mass.position.x-sz/2-(wallX+.2);coil.position.set(wallX+.2,y*.5+.3,0);coil.scale.set(len,1,1);D.push(x)},
   readouts(){const KE=.5*p.m*v*v,PE=.5*p.k*x*x,w0=Math.sqrt(p.k/p.m);return[['x',fmt(x,3)+' m'],['v',fmt(v,3)+' m/s'],['KE',fmt(KE,3)+' J'],['PE',fmt(PE,3)+' J'],['E',fmt(KE+PE,3)+' J'],['T=2π√(m/k)',fmt(2*Math.PI/w0,3)+' s']]}}}};

/* --- Projectile --- */
DIO.projectile={params:{v0:[2,60,20,'m/s','launch speed'],angle:[5,85,45,'°','launch angle'],g:[1,25,9.81,'m/s²','gravity'],drag:[0,1,0,'1/s','linear drag']},
 build(D,p){const W=D.world,a=p.angle*Math.PI/180,R=p.v0*p.v0*Math.sin(2*a)/p.g,Hm=p.v0*p.v0*Math.sin(a)**2/(2*p.g),sc=Math.min(10/R,4.5/Hm),X0=-5;
  const grid=new THREE.GridHelper(12,24,0x8f733a,0x3a2c1e);grid.position.y=.02;W.add(grid);
  const base=cyl(.6,.4,D.mats.wood,24);base.position.set(X0,.2,0);W.add(base);const barrel=cyl(.18,1.6,D.mats.iron,20);barrel.geometry.translate(0,.8,0);barrel.position.set(X0,.45,0);barrel.rotation.z=-(Math.PI/2-a);W.add(barrel);
  const b=ball(.2,D.mats.rubric);W.add(b);const tr=trail(600,0xffc56b);W.add(tr);
  const ideal=[];for(let i=0;i<=80;i++){const x=R*i/80,y=x*Math.tan(a)-p.g*x*x/(2*p.v0*p.v0*Math.cos(a)**2);ideal.push(V3(X0+x*sc,.45+y*sc,0))}W.add(lineFrom(ideal,0x88aadd,true));
  const vArrow=new THREE.ArrowHelper(V3(1,0,0),V3(),1,0xffd27a,.3,.18);W.add(vArrow);
  let x,y,vx,vy,state,wait,apex;const reset=()=>{x=0;y=0;vx=p.v0*Math.cos(a);vy=p.v0*Math.sin(a);state=1;wait=0;apex=false;D.event('launch: v₀ = '+p.v0+' m/s at '+p.angle+'°',V3(X0,.45,0))};reset();
  const wp=()=>V3(X0+x*sc,.45+y*sc,0);
  D.label('ball',()=>wp().add(V3(0,.35,0)));D.label('v',()=>wp().add(V3(vx,vy,0).normalize().multiplyScalar(1.1)),true);D.label('no-drag parabola',()=>ideal[60].clone().add(V3(0,.3,0)));
  D.seriesName='height y(t) in metres';
  return{orbit:{target:V3(0,2,0),r:15},
   step(h){if(state===1){const ax=-p.drag*vx,ay=-p.g-p.drag*vy;const pvy=vy;vx+=ax*h;vy+=ay*h;x+=vx*h;y+=vy*h;if(!apex&&pvy>0&&vy<=0){apex=true;D.event('apex: vᵧ = 0, height '+fmt(y,2)+' m',wp())}if(y<0){y=0;state=2;D.event('lands: range '+fmt(x,2)+' m (no-drag R = '+fmt(R,2)+' m)',wp(),0x88c0ff)}}else{wait+=h;if(wait>1.6){tr.userData.count=0;reset()}}},
   visual(){b.position.copy(wp());if(state===1)tr.add(b.position);vArrow.position.copy(b.position);const s=Math.hypot(vx,vy);vArrow.setDirection(V3(vx,vy,0).normalize());vArrow.setLength(.4+s/p.v0*1.2,.25,.15);D.push(y)},
   readouts(){return[['x',fmt(x,2)+' m'],['y',fmt(y,2)+' m'],['vₓ',fmt(vx,2)+' m/s'],['vᵧ',fmt(vy,2)+' m/s'],['R ideal',fmt(R,2)+' m'],['H ideal',fmt(Hm,2)+' m']]}}}};

/* --- Orbit --- */
DIO.orbit={params:{GM:[2,40,12,'u³/s²','gravitational parameter'],r0:[1.5,5,3,'u','start radius'],vfactor:[.3,1.7,.8,'× v_circ','launch speed']},
 build(D,p){const W=D.world,Y=2.4;
  const star=new THREE.Mesh(new THREE.SphereGeometry(.55,48,32),new THREE.MeshBasicMaterial({color:0xffd27a}));star.position.y=Y;W.add(star);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasTex(128,128,(g)=>{const r=g.createRadialGradient(64,64,4,64,64,64);r.addColorStop(0,'rgba(255,220,140,1)');r.addColorStop(.3,'rgba(255,170,60,.5)');r.addColorStop(1,'rgba(255,120,20,0)');g.fillStyle=r;g.fillRect(0,0,128,128)}),blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(3.4,3.4,1);glow.position.y=Y;W.add(glow);
  const sl=new THREE.PointLight(0xffc070,2.5,20,1.5);sl.position.y=Y;W.add(sl);
  const pl=ball(.2,D.mats.lapis);W.add(pl);const tr=trail(1500,0x88c0ff);W.add(tr);
  const pedestal=cyl(.08,Y-.5,D.mats.brass);pedestal.position.y=(Y-.5)/2;W.add(pedestal);
  let x=p.r0,z=0,vc=Math.sqrt(p.GM/p.r0),vx=0,vz=-p.vfactor*vc,lastDr=0,peri=[],Tm=NaN;const L0=x*vz-z*vx;
  const wedges=[];let markT=0,markP=V3(x,Y,z),fanPts=[V3(x,Y,z)],wi=0;const Tg=2*Math.PI*Math.sqrt(Math.pow(p.r0,3)/p.GM)/12;
  const E0=.5*(vx*vx+vz*vz)-p.GM/p.r0;if(E0>=0)D.event('energy ε ≥ 0: unbound, the planet escapes',null);
  D.label('star · M',()=>V3(0,Y+.9,0));D.label('planet · m',()=>pl.position.clone().add(V3(0,.35,0)));D.label('r',()=>pl.position.clone().lerp(V3(0,Y,0),.5),true);
  const rline=lineFrom([V3(0,Y,0),V3(x,Y,z)],0x8f733a);W.add(rline);
  D.seriesName='distance r(t)';
  return{orbit:{target:V3(0,Y,0),r:16,ph:.75},
   step(h){const r=Math.hypot(x,z),a=-p.GM/(r*r*r);vx+=a*x*h;vz+=a*z*h;x+=vx*h;z+=vz*h;const dr=(x*vx+z*vz);
    if(lastDr!==0&&Math.sign(dr)!==Math.sign(lastDr)){if(dr>0){peri.push(D.t);if(peri.length>1)Tm=peri.at(-1)-peri.at(-2);D.event('perihelion: closest, fastest (v = '+fmt(Math.hypot(vx,vz),2)+')',V3(x,Y,z),0x88c0ff)}else D.event('aphelion: farthest, slowest (v = '+fmt(Math.hypot(vx,vz),2)+')',V3(x,Y,z))}lastDr=dr;
    fanPts.push(V3(x,Y,z));
    if(D.t-markT>Tg){const g=new THREE.BufferGeometry();const arr=[];for(let i=1;i<fanPts.length;i++){arr.push(0,Y,0,fanPts[i-1].x,Y,fanPts[i-1].z,fanPts[i].x,Y,fanPts[i].z)}g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:wi%2?0xcfa84f:0x2d5b8e,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));W.add(m);wedges.push(m);wi++;if(wedges.length>12)W.remove(wedges.shift());fanPts=[V3(x,Y,z)];markT=D.t}
    if(r>14||r<.3){D.event(r<.3?'planet falls into the star — resetting':'planet left the diorama — resetting',null);x=p.r0;z=0;vx=0;vz=-p.vfactor*vc;tr.userData.count=0;fanPts=[V3(x,Y,z)]}},
   visual(){pl.position.set(x,Y,z);tr.add(pl.position);const a=rline.geometry.attributes.position;a.setXYZ(1,x,Y,z);a.needsUpdate=true;D.push(Math.hypot(x,z))},
   readouts(){const r=Math.hypot(x,z),v=Math.hypot(vx,vz),E=.5*v*v-p.GM/r,L=x*vz-z*vx;return[['r',fmt(r,3)],['v',fmt(v,3)],['ε = v²/2 − GM/r',fmt(E,4)],['L = r×v',fmt(L,4)],['L drift',fmt(L-L0,2)],['period',isFinite(Tm)?fmt(Tm,3)+' s':'…']]}}}};

/* --- Collision --- */
DIO.collision={params:{m1:[.2,10,2,'kg','mass 1'],m2:[.2,10,1,'kg','mass 2'],v1:[-4,6,3,'m/s','velocity 1'],v2:[-6,4,-1,'m/s','velocity 2'],e:[0,1,1,'','restitution']},
 build(D,p){const W=D.world,track=box(12,.15,1.4,D.mats.wood);track.position.y=.08;W.add(track);
  [-.5,.5].forEach(z=>{const r=box(12,.06,.06,D.mats.brass);r.position.set(0,.18,z);W.add(r)});
  const s1=.5+Math.cbrt(p.m1)*.35,s2=.5+Math.cbrt(p.m2)*.35;const c1=box(s1,s1*.7,1,D.mats.lapis),c2=box(s2,s2*.7,1,D.mats.rubric);W.add(c1,c2);
  let x1=-3,x2=2.5,v1=p.v1,v2=p.v2,done=false,wait=0,hits=0;const P0=p.m1*p.v1+p.m2*p.v2,K0=.5*p.m1*p.v1**2+.5*p.m2*p.v2**2;
  const a1=new THREE.ArrowHelper(V3(1,0,0),V3(),1,0x88c0ff,.25,.15),a2=new THREE.ArrowHelper(V3(1,0,0),V3(),1,0xff9a7a,.25,.15);W.add(a1,a2);
  D.label('cart 1 · m₁',()=>V3(x1,s1*.7+.6,0));D.label('cart 2 · m₂',()=>V3(x2,s2*.7+.6,0));D.seriesName='total momentum p (stays flat)';
  return{orbit:{target:V3(0,.8,0),r:12,ph:1.1},
   step(h){if(done){wait+=h;if(wait>1.5){x1=-3;x2=2.5;v1=p.v1;v2=p.v2;done=false;wait=0}return}x1+=v1*h;x2+=v2*h;
    if(x2-x1<(s1+s2)/2&&v1-v2>0){const u1=v1,u2=v2,M=p.m1+p.m2;v1=(p.m1*u1+p.m2*u2+p.m2*p.e*(u2-u1))/M;v2=(p.m1*u1+p.m2*u2+p.m1*p.e*(u1-u2))/M;hits++;const K=.5*p.m1*v1*v1+.5*p.m2*v2*v2;D.event(`collision: p ${fmt(P0,2)} → ${fmt(p.m1*v1+p.m2*v2,2)} kg·m/s, KE ${fmt(K0,2)} → ${fmt(K,2)} J`,V3((x1+x2)/2,.6,0))}
    if(Math.abs(x1)>6.5||Math.abs(x2)>6.5){done=true}},
   visual(){c1.position.set(x1,s1*.35+.2,0);c2.position.set(x2,s2*.35+.2,0);[[a1,c1,v1,s1],[a2,c2,v2,s2]].forEach(([a,c,v,s])=>{a.visible=Math.abs(v)>.01;a.position.set(c.position.x,s*.7+.35,0);a.setDirection(V3(Math.sign(v)||1,0,0));a.setLength(.3+Math.abs(v)*.35,.22,.14)});D.push(p.m1*v1+p.m2*v2)},
   readouts(){const K=.5*p.m1*v1*v1+.5*p.m2*v2*v2;return[['v₁',fmt(v1,3)+' m/s'],['v₂',fmt(v2,3)+' m/s'],['p total',fmt(p.m1*v1+p.m2*v2,3)],['KE total',fmt(K,3)+' J'],['KE lost',fmt(K0-K,3)+' J'],['collisions',hits]]}}}};

/* --- Incline --- */
DIO.incline={params:{angle:[5,60,30,'°','incline angle'],mu:[0,1,.2,'','friction coefficient'],m:[.5,10,2,'kg','block mass'],g:[1,25,9.81,'m/s²','gravity']},
 build(D,p){const W=D.world,a=p.angle*Math.PI/180,Lw=9,hgt=Lw*Math.sin(a),base=Lw*Math.cos(a),x0=-base/2;
  const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(base,0);sh.lineTo(0,hgt);sh.lineTo(0,0);const wg=new THREE.ExtrudeGeometry(sh,{depth:2,bevelEnabled:false});wg.translate(x0,0,-1);const wedge=new THREE.Mesh(wg,D.mats.wood);wedge.castShadow=wedge.receiveShadow=true;W.add(wedge);
  const blk=box(.9,.6,.9,D.mats.brass);W.add(blk);
  const dir=V3(Math.cos(a),-Math.sin(a),0),nrm=V3(Math.sin(a),Math.cos(a),0);
  const arr=(c)=>{const h=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,c,.25,.16);W.add(h);return h};const aG=arr(0xff8866),aN=arr(0x88c0ff),aF=arr(0x99dd99),aNet=arr(0xffd27a);
  const slides=Math.tan(a)>p.mu;const acc=slides?p.g*(Math.sin(a)-p.mu*Math.cos(a)):0;let s=0,v=0,wait=0;
  D.event(slides?'tan θ > μ: gravity along the slope beats friction, block slides':'tan θ ≤ μ: static friction holds the block',null);
  const pos=()=>V3(x0,hgt,0).add(dir.clone().multiplyScalar(s+.6)).add(nrm.clone().multiplyScalar(.32));
  D.label('block · m',()=>pos().add(V3(0,.7,0)));D.label('mg',()=>pos().add(V3(0,-1.5,0)),true);D.label('N',()=>pos().add(nrm.clone().multiplyScalar(1.6)),true);D.label('f',()=>pos().add(dir.clone().multiplyScalar(-1.3)),true);D.label('θ',()=>V3(-x0-1.1,.3,1.05),true);
  D.seriesName='speed v(t) along slope';
  return{orbit:{target:V3(0,hgt/2,0),r:13,ph:1.2,th:.25},
   step(h){if(!slides)return;if(s<Lw-1.3){v+=acc*h;s+=v*h}else{wait+=h;if(wait<h*1.5)D.event('reaches the bottom at v = '+fmt(v,2)+' m/s (√(2aL) = '+fmt(Math.sqrt(2*acc*(Lw-1.3)),2)+')',pos(),0x88c0ff);if(wait>1.4){s=0;v=0;wait=0}}},
   visual(){const P=pos();blk.position.copy(P);blk.rotation.z=-a;const g=p.g*p.m,N=g*Math.cos(a),f=slides?p.mu*N:g*Math.sin(a),sc=.09;
    aG.position.copy(P);aG.setDirection(V3(0,-1,0));aG.setLength(g*sc+.2,.25,.16);aN.position.copy(P);aN.setDirection(nrm);aN.setLength(N*sc+.2,.25,.16);aF.position.copy(P);aF.setDirection(dir.clone().negate());aF.visible=f>1e-3;aF.setLength(f*sc+.2,.25,.16);aNet.position.copy(P).add(V3(0,0,.6));aNet.visible=acc>0;aNet.setDirection(dir);aNet.setLength(p.m*acc*sc+.2,.25,.16);D.push(v)},
   readouts(){const g=p.g*p.m;return[['a',fmt(acc,3)+' m/s²'],['v',fmt(v,3)+' m/s'],['s',fmt(s,2)+' m'],['mg sin θ',fmt(g*Math.sin(a),2)+' N'],['N = mg cos θ',fmt(g*Math.cos(a),2)+' N'],['friction',fmt(slides?p.mu*g*Math.cos(a):g*Math.sin(a),2)+' N']]}}}};

/* --- Wave --- */
DIO.wave={params:{A:[.1,1.2,.6,'m','amplitude'],lambda:[1,10,5,'m','wavelength'],f:[.1,2,.5,'Hz','frequency'],standing:[0,1,0,'','0 travelling · 1 standing']},
 build(D,p){const W=D.world,N=80,Y=2.4,xs=[];const beads=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,16,10),D.mats.brass,N);beads.castShadow=true;W.add(beads);
  for(let i=0;i<N;i++)xs.push(-5+10*i/(N-1));[-5.3,5.3].forEach(x=>{const post=cyl(.1,Y+.5,D.mats.wood);post.position.set(x,(Y+.5)/2,0);W.add(post)});
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));const line=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xffd27a}));line.frustumCulled=false;W.add(line);
  const marker=ball(.16,D.mats.rubric);W.add(marker);const k=2*Math.PI/p.lambda,w=2*Math.PI*p.f,st=p.standing>.5;let cycles=0;
  const yAt=(x,t)=>st?2*p.A*Math.sin(k*(x+5))*Math.cos(w*t):p.A*Math.sin(k*(x+5)-w*t);
  const nodes=[];if(st){for(let n=0;n*p.lambda/2<=10.001;n++){const x=-5+n*p.lambda/2;const r=new THREE.Mesh(new THREE.TorusGeometry(.18,.03,8,24),new THREE.MeshBasicMaterial({color:0x88c0ff}));r.position.set(x,Y,0);W.add(r);nodes.push(x)}}
  const m4=new THREE.Matrix4();D.label(st?'node (never moves)':'crest',()=>st?(nodes[1]!=null?V3(nodes[1],Y-.5,0):null):V3(-5+((w*D.t/k)%p.lambda)+p.lambda/4-0,Y+p.A+.35,0));D.label('tracked bead',()=>marker.position.clone().add(V3(0,.35,0)));D.label('λ',()=>V3(-5+p.lambda/2,Y-2*p.A-.6,0),true);
  W.add(lineFrom([V3(-5,Y-2*p.A-.4,0),V3(-5+p.lambda,Y-2*p.A-.4,0)],0xcfa84f));
  D.seriesName='displacement of tracked bead y(t)';
  return{orbit:{target:V3(0,Y,0),r:13,ph:1.2},
   step(h){const c=Math.floor(D.t*p.f);if(c>cycles){cycles=c;if(c<=12)D.event('period '+c+' complete: T = 1/f = '+fmt(1/p.f,3)+' s',marker.position.clone())}},
   visual(){const a=lg.attributes.position;for(let i=0;i<N;i++){const y=yAt(xs[i],D.t);m4.makeTranslation(xs[i],Y+y,0);beads.setMatrixAt(i,m4);a.setXYZ(i,xs[i],Y+y,0)}beads.instanceMatrix.needsUpdate=true;a.needsUpdate=true;const xm=xs[30];marker.position.set(xm,Y+yAt(xm,D.t),0);D.push(yAt(xm,D.t))},
   readouts(){return[['v = fλ',fmt(p.f*p.lambda,3)+' m/s'],['k = 2π/λ',fmt(k,3)+' rad/m'],['ω = 2πf',fmt(w,3)+' rad/s'],['T',fmt(1/p.f,3)+' s'],['mode',st?'standing':'travelling'],['t',fmt(D.t,2)+' s']]}}}};

/* --- Gas --- */
DIO.gas={params:{N:[10,160,70,'','molecules'],T:[.2,4,1,'','temperature (k=m=1)']},
 build(D,p){const W=D.world,BX=3,BY=2,BZ=2,Y0=BY+.05,N=Math.round(p.N),r=.09;
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*BX,2*BY,2*BZ)),new THREE.LineBasicMaterial({color:0xcfa84f}));edges.position.y=Y0;W.add(edges);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(2*BX,2*BY,2*BZ),new THREE.MeshPhysicalMaterial({color:0xaaccff,transparent:true,opacity:.07,roughness:.05,side:THREE.DoubleSide,depthWrite:false}));glass.position.y=Y0;W.add(glass);
  const mols=new THREE.InstancedMesh(new THREE.SphereGeometry(r,14,10),new THREE.MeshStandardMaterial({roughness:.3,metalness:.2}),N);mols.castShadow=true;W.add(mols);
  const P=[],V=[];const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
  for(let i=0;i<N;i++){P.push([(Math.random()*2-1)*(BX-r),(Math.random()*2-1)*(BY-r),(Math.random()*2-1)*(BZ-r)]);const s=Math.sqrt(p.T);V.push([gauss()*s,gauss()*s,gauss()*s])}
  let imp=0,win=0,Pm=NaN;const area=2*(4*BY*BZ+4*BX*BZ+4*BX*BY),vol=8*BX*BY*BZ;const m4=new THREE.Matrix4(),col=new THREE.Color();
  D.label('molecule · m',()=>V3(P[0][0],P[0][1]+Y0+.25,P[0][2]));D.label('container wall (pressure = impulse / area / time)',()=>V3(0,Y0+BY+.35,0));
  D.seriesName='speed histogram · red: Maxwell–Boltzmann';let temp=p.T;
  return{orbit:{target:V3(0,Y0,0),r:12,ph:1.1},
   live(k){if(k==='T'){const f=Math.sqrt(p.T/temp);V.forEach(v=>{v[0]*=f;v[1]*=f;v[2]*=f});temp=p.T;D.event('heated/cooled: velocities scaled by √(T′/T) = '+fmt(f,3),null);return true}return false},
   step(h){const B=[BX-r,BY-r,BZ-r];for(let i=0;i<N;i++){const q=P[i],v=V[i];for(let d=0;d<3;d++){q[d]+=v[d]*h;if(q[d]>B[d]){q[d]=2*B[d]-q[d];v[d]=-v[d];imp+=2*Math.abs(v[d])}else if(q[d]<-B[d]){q[d]=-2*B[d]-q[d];v[d]=-v[d];imp+=2*Math.abs(v[d])}}}
    win+=h;if(win>1){Pm=imp/area/win;imp=0;win=0}},
   visual(){let ke=0;for(let i=0;i<N;i++){const v=V[i],s2=v[0]*v[0]+v[1]*v[1]+v[2]*v[2];ke+=s2/2;m4.makeTranslation(P[i][0],P[i][1]+Y0,P[i][2]);mols.setMatrixAt(i,m4);col.setHSL(.62-Math.min(.62,Math.sqrt(s2)/(4*Math.sqrt(temp))*.62),.75,.55);mols.setColorAt(i,col)}mols.instanceMatrix.needsUpdate=true;mols.instanceColor.needsUpdate=true;this._ke=ke/N},
   hist(){const bins=new Array(16).fill(0),mx=4*Math.sqrt(temp);V.forEach(v=>{const s=Math.hypot(...v);const b=Math.min(15,Math.floor(s/mx*16));bins[b]++});return bins},
   histCurve(){const mx=4*Math.sqrt(temp),dv=mx/16;return Array.from({length:16},(_,i)=>{const v=(i+.5)*dv;return N*dv*4*Math.PI*Math.pow(1/(2*Math.PI*temp),1.5)*v*v*Math.exp(-v*v/(2*temp))})},
   readouts(){const ke=this._ke||0,Tk=2*ke/3,Pid=N*Tk/vol;return[['⟨KE⟩',fmt(ke,3)],['T = 2⟨KE⟩/3',fmt(Tk,3)],['P measured',fmt(Pm,4)],['P = NkT/V',fmt(Pid,4)],['PV/NkT',isFinite(Pm)?fmt(Pm/Pid,3):'…'],['N',N]]}}}};

/* --- Surface --- */
DIO.surface={params:{gravity:[1,20,9.81,'m/s²','gravity'],friction:[0,3,.6,'1/s','rolling friction']},extraParams:true,
 build(D,p){const W=D.world,ex=D.spec.expr||'sin(x)*cos(y)';const names=Object.keys(D.ranges).filter(k=>!(k in DIO.surface.params));
  const f0=compile(ex,['x','y',...names]);const F=(x,y)=>f0(x,y,...names.map(k=>D.p[k]));const R_=4,N=90,AMP=.9,Y0=1.8;
  let lo=Infinity,hi=-Infinity;for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){const z=F(-R_+2*R_*i/N,-R_+2*R_*j/N);if(isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z)}}if(!isFinite(lo)){lo=-1;hi=1}const span=Math.max(1e-6,hi-lo),sc=Math.min(2.6/span,AMP*2);
  const geo=new THREE.PlaneGeometry(2*R_,2*R_,N,N);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,cols=[];const c=new THREE.Color(),cA=new THREE.Color(0x1d3d63),cB=new THREE.Color(0xcfa84f);
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getZ(i);let z=F(x,y);if(!isFinite(z))z=lo;pos.setY(i,Y0+(z-lo)*sc);c.copy(cA).lerp(cB,(z-lo)/span);cols.push(c.r,c.g,c.b)}
  geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.computeVertexNormals();
  const surf=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.15,side:THREE.DoubleSide}));surf.castShadow=surf.receiveShadow=true;W.add(surf);
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(2*R_,2*R_,18,18).rotateX(-Math.PI/2)),new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.0}));W.add(wire);
  const bl=ball(.2,D.mats.chrome);W.add(bl);const tr=trail(900,0xff9a6a);W.add(tr);const gA=new THREE.ArrowHelper(V3(1,0,0),V3(),1,0x88c0ff,.2,.12);W.add(gA);
  let bx=2.2,by=1.6,vx=0,vy=0,rest=false,still=0;const grad=(x,y)=>{const e=1e-3;return[(F(x+e,y)-F(x-e,y))/(2*e),(F(x,y+e)-F(x,y-e))/(2*e)]};
  const height=(x,y)=>Y0+(F(x,y)-lo)*sc;
  D.label('ball',()=>bl.position.clone().add(V3(0,.35,0)));D.label('−∇f',()=>gA.visible?gA.position.clone().add(V3(0,.25,0)):null,true);D.label('z = '+ex,()=>V3(-R_,Y0+2.9,-R_));
  D.event('ball placed — click the surface to drop it elsewhere',null);D.seriesName='height f(ball) — falls toward a minimum';
  return{orbit:{target:V3(0,Y0+1,0),r:14,ph:.95},
   click(rc){const hit=rc.intersectObject(surf)[0];if(hit){bx=hit.point.x;by=hit.point.z;vx=vy=0;rest=false;still=0;tr.userData.count=0;D.event('ball dropped at ('+fmt(bx,2)+', '+fmt(by,2)+')',hit.point)}},
   step(h){if(rest)return;const [gx,gy]=grad(bx,by);const s=sc,den=1+s*s*(gx*gx+gy*gy);vx+=(-p.gravity*s*gx/den-p.friction*vx)*h;vy+=(-p.gravity*s*gy/den-p.friction*vy)*h;bx+=vx*h;by+=vy*h;
    if(Math.abs(bx)>R_){bx=Math.sign(bx)*R_;vx=-vx*.5}if(Math.abs(by)>R_){by=Math.sign(by)*R_;vy=-vy*.5}
    if(Math.hypot(vx,vy)<.02&&Math.hypot(gx,gy)<.05){still+=h;if(still>.4){rest=true;D.event('at rest: ∇f ≈ 0, local minimum f = '+fmt(F(bx,by),3),bl.position.clone(),0x88c0ff)}}else still=0},
   visual(){bl.position.set(bx,height(bx,by)+.2,by);tr.add(bl.position);const [gx,gy]=grad(bx,by);const m=Math.hypot(gx,gy);gA.visible=m>.02;if(gA.visible){gA.position.copy(bl.position);gA.setDirection(V3(-gx,0,-gy).normalize());gA.setLength(.3+Math.min(1.5,m*.8),.2,.12)}D.push(F(bx,by))},
   readouts(){const [gx,gy]=grad(bx,by);return[['(x, y)','('+fmt(bx,2)+', '+fmt(by,2)+')'],['f(x,y)',fmt(F(bx,by),3)],['∂f/∂x',fmt(gx,3)],['∂f/∂y',fmt(gy,3)],['|∇f|',fmt(Math.hypot(gx,gy),3)],['speed',fmt(Math.hypot(vx,vy),3)]]}}}};

/* --- Custom 3D (code written by Claude against a small API) --- */
DIO.custom3d={params:{},build(D,p){
  const spec=D.spec;if(!spec.code)throw new Error('This custom scene has no code yet.');
  const H={step:[],frame:[],reads:[],series:null,click:null,orbit:null};const ro=spec.ranges||{},pv=spec.params||{};
  const param=(k,min,max,def,label,unit)=>{if(!D.ranges[k]){const r=ro[k]&&+ro[k][1]>+ro[k][0]?[+ro[k][0],+ro[k][1]]:[+min,+max];D.ranges[k]=[r[0],r[1],+def,unit||'',label||k];if(!(k in D.p)){const v=isFinite(+pv[k])?+pv[k]:+def;D.p[k]=clamp(v,r[0],r[1])}}return D.p[k]};
  const api={THREE,V3,world:D.world,scene:D.scene,mats:D.mats,ball,box,cyl,trail,lineFrom,fmt,p:D.p,
    param,toggle:(k,label,def)=>param(k,0,1,def?1:0,(label||k)+' (0/1)')>.5,
    label:(t,f,sym)=>D.label(t,()=>{try{return f()}catch(e){return null}},sym),event:(t,pos,c)=>D.event(t,pos,c),
    onStep:f=>H.step.push(f),onFrame:f=>H.frame.push(f),readout:(n,f)=>H.reads.push([n,f]),plot:(n,f)=>{D.seriesName=n;H.series=f},onClick:f=>{H.click=f},camera:o=>{H.orbit=o},time:()=>D.t};
  new Function('api','"use strict";\n'+spec.code)(api);
  return{orbit:H.orbit,step(h){for(const f of H.step)f(h,D.t)},visual(dt){for(const f of H.frame)f(dt,D.t);if(H.series){const v=+H.series();if(isFinite(v))D.push(v)}},
    readouts(){return H.reads.map(([n,f])=>{let v;try{v=f()}catch(e){v='—'}return[n,typeof v==='number'?fmt(v):String(v)]})},click:H.click?rc=>H.click(rc):null};
}};

/* --- Weather glass: Goethe barometer + storm glass + mercury barometer under a living sky --- */
DIO.weatherglass={params:{T:[-5,35,16,'°C','air temperature'],P:[960,1050,1013,'hPa','outside air pressure'],P0:[990,1035,1013,'hPa','pressure when sealed (at 15 °C)'],auto:[0,1,1,'','auto weather (1 on · 0 off)'],conc:[.6,1.4,1,'×','camphor concentration']},
 build(D,p){const W=D.world;D.orb.ph=1.2;
  const glassM=new THREE.MeshPhysicalMaterial({color:0xffffff,transmission:.97,roughness:.03,thickness:.25,ior:1.5,transparent:true,opacity:.55,clearcoat:1,clearcoatRoughness:.05,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:1.6});
  const waterM=new THREE.MeshPhysicalMaterial({color:0x3aa0b0,transmission:.75,roughness:.08,thickness:1.2,ior:1.33,transparent:true,opacity:.82,attenuationColor:new THREE.Color(0x1f7080),attenuationDistance:2.5});
  const liqM=new THREE.MeshPhysicalMaterial({color:0xe8eef0,transmission:.85,roughness:.1,thickness:1,ior:1.36,transparent:true,opacity:.35,depthWrite:false});
  const crystM=new THREE.MeshPhysicalMaterial({color:0xf6fbff,roughness:.25,transmission:.35,thickness:.2,sheen:1,sheenColor:new THREE.Color(0xddeeff),clearcoat:.6,emissive:0x223344,emissiveIntensity:.15});
  // sky backdrop
  const skyCv=document.createElement('canvas');skyCv.width=1024;skyCv.height=512;const skyTex=new THREE.CanvasTexture(skyCv);skyTex.colorSpace=THREE.SRGBColorSpace;
  const back=new THREE.Mesh(new THREE.CylinderGeometry(6.6,6.6,7.5,64,1,true,Math.PI*.62,Math.PI*.76),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,toneMapped:false}));back.position.y=3.75;back.name='sky backdrop';W.add(back);
  const rainG=new THREE.BufferGeometry(),RN=500,rp=new Float32Array(RN*6);for(let i=0;i<RN;i++){const a=Math.PI*.62+Math.random()*Math.PI*.76,r=5.4+Math.random()*1;const x=Math.sin(a)*r,z=Math.cos(a)*r,y=Math.random()*7.5;rp.set([x,y,z,x-.03,y-.35,z],i*6)}rainG.setAttribute('position',new THREE.BufferAttribute(rp,3));
  const rain=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({color:0xaaccee,transparent:true,opacity:0}));rain.name='rain';W.add(rain);
  // --- Goethe glass ---
  const GX=-2.7,prof=[[0,0],[.75,.04],[1.25,.4],[1.45,1.0],[1.4,1.7],[1.1,2.35],[.7,2.8],[.35,3.1],[.18,3.35],[0,3.42]].map(([x,y])=>new THREE.Vector2(Math.max(.001,x),y+.12));
  const flask=new THREE.Mesh(new THREE.LatheGeometry(prof,72),glassM);flask.position.x=GX;flask.name='Goethe glass flask';W.add(flask);
  const foot=cyl(.9,.12,D.mats.wood,48);foot.position.set(GX,.06,0);foot.name='flask stand';W.add(foot);
  const WY=1.55,rAt=y=>{for(let i=1;i<prof.length;i++)if(prof[i].y>=y){const a=prof[i-1],b=prof[i],t=(y-a.y)/(b.y-a.y);return a.x+(b.x-a.x)*t}return 0};
  const wprof=prof.filter(v=>v.y<WY).map(v=>new THREE.Vector2(v.x*.94,v.y+.02));wprof.push(new THREE.Vector2(rAt(WY)*.94,WY),new THREE.Vector2(.001,WY));
  const water=new THREE.Mesh(new THREE.LatheGeometry(wprof,64),waterM);water.position.x=GX;water.name='water in flask';W.add(water);
  const sp0=new THREE.CatmullRomCurve3([V3(GX+1.25,.55,0),V3(GX+1.75,.62,0),V3(GX+2.05,.95,0),V3(GX+2.15,1.6,0),V3(GX+2.2,3.3,0),V3(GX+2.24,4.6,0)]);
  const spout=new THREE.Mesh(new THREE.TubeGeometry(sp0,120,.12,16,false),glassM);spout.name='spout';W.add(spout);
  const spWaterLow=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp0.points.slice(0,4)),60,.085,12,false),waterM);spWaterLow.name='water in spout bend';W.add(spWaterLow);
  const colG=new THREE.CylinderGeometry(.085,.085,1,16);colG.translate(0,.5,0);const col=new THREE.Mesh(colG,waterM);col.position.set(GX+2.15,1.6,0);col.name='water column in spout';W.add(col);
  const menisc=new THREE.Mesh(new THREE.SphereGeometry(.09,16,8,0,Math.PI*2,0,Math.PI/2),waterM);menisc.rotation.x=Math.PI;W.add(menisc);
  const drops=[];const dropM=new THREE.InstancedMesh(new THREE.SphereGeometry(.05,10,8),waterM,40);dropM.name='spilled drops';W.add(dropM);
  // --- storm glass ---
  const SX=2.6,SH=4.1,SR=.55;const tube=new THREE.Mesh(new THREE.CylinderGeometry(SR,SR,SH,48,1,true),glassM);tube.position.set(SX,SH/2+.25,0);tube.name='storm glass tube';W.add(tube);
  const capT=cyl(SR+.06,.3,D.mats.brass,48);capT.position.set(SX,SH+.4,0);capT.name='brass cap';W.add(capT);const baseS=cyl(SR+.25,.25,D.mats.wood,48);baseS.position.set(SX,.12,0);baseS.name='storm glass base';W.add(baseS);
  const liq=new THREE.Mesh(new THREE.CylinderGeometry(SR-.05,SR-.05,SH-.4,40),liqM);liq.position.set(SX,(SH-.4)/2+.3,0);liq.name='camphor solution';W.add(liq);
  const NC=320,cr=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),crystM,NC);cr.castShadow=true;cr.name='camphor crystals';W.add(cr);
  const C=[];const rng=mulberry(42);
  // --- mercury barometer ---
  const BX=0,BZ=-2.9;const board=box(1.1,6,.12,D.mats.wood);board.position.set(BX,3.15,BZ);board.name='barometer board';W.add(board);
  const scaleTex=canvasTex(128,700,(g,w,h)=>{g.fillStyle='#efe2c2';g.fillRect(0,0,w,h);g.fillStyle='#2a1e15';g.font='18px IBM Plex Mono, monospace';for(let mm=700;mm<=790;mm+=2){const y=h-20-(mm-700)/90*(h-40);g.fillRect(mm%10?84:70,y,mm%10?28:42,mm%10?1:2);if(mm%10===0)g.fillText(mm,8,y+6)}g.font='14px serif';g.fillText('mm Hg',30,16)});
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(.75,4.4),new THREE.MeshStandardMaterial({map:scaleTex,roughness:.7}));plate.position.set(BX,3.3,BZ+.07);plate.name='mm scale';W.add(plate);
  const btube=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,5.4,16),glassM);btube.position.set(BX+.42,3.2,BZ+.12);W.add(btube);
  const hgG=new THREE.CylinderGeometry(.05,.05,1,16);hgG.translate(0,.5,0);const hg=new THREE.Mesh(hgG,new THREE.MeshStandardMaterial({color:0xd9dde2,metalness:1,roughness:.12}));hg.position.set(BX+.42,.6,BZ+.12);hg.name='mercury column';W.add(hg);
  const cist=cyl(.25,.3,D.mats.iron,24);cist.position.set(BX+.42,.45,BZ+.12);W.add(cist);
  const sunL=new THREE.DirectionalLight(0xffe6c0,0);sunL.position.set(0,6,-8);W.add(sunL);
  // state
  let Pc=p.P,Tc=p.T,P0=p.P0,lastP=Pc,hist=[],spilled=0,phase=rng()*6,wasCryst=false,lastTrend=0,overflow=false,bubbled=false,cool=0,lastT=Tc,lastSky=-1;
  const S_=T=>Math.exp(.065*(T-16)),total=()=>p.conc*1.05,alpha=2.2;
  const mass=()=>C.reduce((m,c)=>m+alpha*c.s*c.s*c.s,0);
  const lvl=()=>{const Pin=P0*(Tc+273.15)/288.15;const dh_mm=(Pin-Pc)*100/(998*9.80665)*1000;return{Pin,dh_mm,y:WY+dh_mm/60}};
  D.label('Goethe weather glass',()=>V3(GX,3.9,0));D.label('spout level',()=>V3(GX+2.15,lvl().y+.25,0));D.label('trapped air · P_in',()=>V3(GX,2.6,0));
  D.label('storm glass',()=>V3(SX,SH+.95,0));D.label('crystals',()=>C.length?V3(SX,.6,0):null);D.label('mercury barometer',()=>V3(BX,6.45,BZ));
  D.event('glass sealed at '+fmt(P0,4)+' hPa and 15 °C; trapped air now follows P_in = P₀·T/T₀',null);D.seriesName='outside pressure P (hPa)';
  function drawSky(t){const g=skyCv.getContext('2d'),w=skyCv.width,h=skyCv.height;const hour=(t%24),day=Math.max(0,Math.sin((hour-6)/12*Math.PI));const cloud=clamp((1022-Pc)/45,0,1);
    const top=new THREE.Color().setHSL(.58,.5*(1-cloud*.7),.08+day*.42*(1-cloud*.5)),bot=new THREE.Color().setHSL(.08+.5*day,.45*(1-cloud),.12+day*.45*(1-cloud*.4));
    const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#'+top.getHexString());gr.addColorStop(1,'#'+bot.getHexString());g.fillStyle=gr;g.fillRect(0,0,w,h);
    const sx=w*(.15+.7*((hour-6)/12)),sy=h*(.85-.65*day);if(day>0){const sg=g.createRadialGradient(sx,sy,4,sx,sy,90);sg.addColorStop(0,'rgba(255,245,210,'+(1-cloud*.85)+')');sg.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=sg;g.fillRect(0,0,w,h)}
    else{g.fillStyle='rgba(255,255,255,'+(.7*(1-cloud))+')';for(let i=0;i<60;i++){const r=mulberry(i);g.fillRect(r()*w,r()*h*.6,1.5,1.5)}}
    const nC=Math.round(4+cloud*26),rc=mulberry(7);for(let i=0;i<nC;i++){const cx=((rc()*w+t*12*(1+rc()))%(w+300))-150,cy=h*(.1+rc()*.5*(1-cloud*.4)),rr=40+rc()*90*(1+cloud);const shade=Math.round(255-cloud*150-(1-day)*120);g.fillStyle=`rgba(${shade},${shade},${shade+8},${.25+cloud*.5})`;for(let k=0;k<5;k++){g.beginPath();g.ellipse(cx+k*rr*.35,cy+Math.sin(k)*8,rr*.6,rr*.32,0,0,7);g.fill()}}
    if(cloud>.8&&Math.random()<.02){g.fillStyle='rgba(255,255,240,.6)';g.fillRect(0,0,w,h)}
    skyTex.needsUpdate=true;sunL.intensity=day*(1-cloud*.7)*1.2;rain.material.opacity=clamp((cloud-.62)*2.4,0,.7)}
  return{orbit:{target:V3(0,2.4,0),r:15.5,ph:1.2,th:.15},
   live(k){if(k==='T'||k==='P'){Pc=p.P;Tc=p.T;return true}if(k==='auto'||k==='conc')return true;if(k==='P0'){P0=p.P0;D.event('re-sealed at '+fmt(P0,4)+' hPa',null);return true}return false},
   step(h){const t=D.t;
    if(p.auto>.5){const target=1008+19*Math.sin(2*Math.PI*t/70+phase)+7*Math.sin(2*Math.PI*t/23+1.3*phase);Pc+=(target-Pc)*Math.min(1,h*.8);Tc=p.T+5.5*Math.sin(2*Math.PI*(t%24-9)/24)-(1013-Pc)*.08}
    // Goethe glass hydrostatics
    const L=lvl();if(L.y>4.55&&!overflow){overflow=true;D.event('pressure difference '+fmt(L.Pin-Pc,3)+' hPa pushes water out of the spout (low pressure: storm weather)',V3(GX+2.24,4.6,0),0x88c0ff)}if(L.y<4.4)overflow=false;
    if(L.y>4.55){spilled+=h*.5;if(rng()<h*12)drops.push({x:GX+2.24,y:4.6,v:0})}
    if(L.y<.75&&!bubbled){bubbled=true;D.event('high pressure drives the column below the bend: air bubbles into the flask and the glass re-equilibrates',V3(GX+1.3,.6,0));P0=Pc*288.15/(Tc+273.15)}if(L.y>1)bubbled=false;
    // storm glass crystallisation (mass-conserving)
    const c=Math.max(0,total()-mass()),sat=S_(Tc),sig=c/sat-1;
    for(const k of C){k.s=Math.max(0,k.s+h*(sig>0?.045*sig/(1+k.s*4):.08*sig));}
    for(let i=C.length-1;i>=0;i--)if(C[i].s<.004)C.splice(i,1);
    const dTdt=(Tc-lastT)/h;lastT=Tc;cool=lerp(cool,dTdt,h*2);
    if(sig>.04&&C.length<NC&&rng()<h*sig*40){const top=cool<-.35&&rng()<.6;const a=rng()*Math.PI*2,r=Math.sqrt(rng())*(SR-.14);C.push({x:SX+Math.cos(a)*r,z:Math.sin(a)*r,y:top?SH-.5-rng()*1.4:.36+Math.pow(rng(),2.5)*1.2,s:.006,rx:rng()*6,ry:rng()*6,needle:top||rng()<.35,top})}
    const has=mass()>.02;if(has&&!wasCryst){D.event('solution supersaturated (σ = '+fmt(sig,2)+'): camphor crystals nucleate',V3(SX,.6,0))}if(!has&&wasCryst)D.event('warming raises solubility: all crystals redissolve, the liquid clears',V3(SX,2,0),0x88c0ff);wasCryst=has;
    // weather lore with physics
    hist.push([t,Pc]);while(hist.length&&t-hist[0][0]>3)hist.shift();const tr=hist.length>1?Pc-hist[0][1]:0;
    if(tr<-3&&lastTrend>=-3)D.event('pressure falling '+fmt(-tr,2)+' hPa in 3 h: deteriorating weather likely',null,0xff9a7a);if(tr>3&&lastTrend<=3)D.event('pressure rising '+fmt(tr,2)+' hPa in 3 h: clearing weather likely',null,0x88c0ff);lastTrend=tr;
    if(cool<-.6&&C.some(k=>k.top)&&rng()<h*.4)D.event('rapid cooling grows fine feathery crystals at the top (folklore: "storm coming"; physically a temperature effect)',V3(SX,SH-.6,0));
   },
   visual(dt){const L=lvl();const y=clamp(L.y,.62,4.6);const yb=Math.max(1.6,y);col.scale.y=Math.max(.001,yb-1.6);col.visible=y>1.6;menisc.position.set(GX+2.15+(y>1.6?0:-.1),y,0);spWaterLow.visible=y>.8;
    for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.v-=9.8*dt;d.y+=d.v*dt;d.x+=.3*dt;if(d.y<.05)drops.splice(i,1)}while(drops.length>40)drops.shift();{const m=new THREE.Matrix4();for(let i=0;i<40;i++){const d=drops[i];if(d)m.makeTranslation(d.x,d.y,0);else m.makeScale(0,0,0);dropM.setMatrixAt(i,m)}dropM.instanceMatrix.needsUpdate=true}
    const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();for(let i=0;i<NC;i++){const k=C[i];if(!k){m4.makeScale(0,0,0);cr.setMatrixAt(i,m4);continue}e.set(k.rx,k.ry,0);q.setFromEuler(e);const s=k.s;m4.compose(V3(k.x,k.y,k.z),q,k.needle?V3(s*.35,s*3.2,s*.35):V3(s*1.2,s*.55,s));cr.setMatrixAt(i,m4)}cr.instanceMatrix.needsUpdate=true;
    liqM.opacity=.3+clamp((S_(Tc)>0?Math.max(0,total()-mass())/S_(Tc)-1:0),0,.5)*.6;
    const hmm=Pc*.750062;hg.scale.y=Math.max(.01,.63+(hmm-700)/90*4.15);hg.position.y=.6;
    const pa=rain.geometry.attributes.position;if(rain.material.opacity>0){for(let i=0;i<RN;i++){let y=pa.getY(i*2)-dt*6;if(y<.3)y+=7.2;pa.setY(i*2,y);pa.setY(i*2+1,y-.35)}pa.needsUpdate=true}
    const tt=Math.floor(D.t*4);if(tt!==lastSky){lastSky=tt;drawSky(D.t)}D.push(Pc)},
   readouts(){const L=lvl(),c=Math.max(0,total()-mass()),sig=c/S_(Tc)-1;const hr=Math.floor(D.t%24);return[['time',String(hr).padStart(2,'0')+':00 · day '+(1+Math.floor(D.t/24))],['P outside',fmt(Pc,5)+' hPa'],['T air',fmt(Tc,3)+' °C'],['P inside',fmt(L.Pin,5)+' hPa'],['spout Δh',fmt(L.dh_mm,3)+' mm'],['Hg column',fmt(Pc*.750062,4)+' mm'],['solubility S(T)',fmt(S_(Tc),3)],['supersat. σ',fmt(sig,3)],['crystals',C.length],['crystal mass',fmt(mass(),3)]]}}}};

/* --- Double pendulum --- */
DIO.doublependulum={params:{m1:[.5,5,2,'kg','upper mass'],m2:[.5,5,1,'kg','lower mass'],L1:[.5,3,1.5,'m','upper arm'],L2:[.5,3,1.5,'m','lower arm'],theta1:[-180,180,120,'°','upper angle'],theta2:[-180,180,-10,'°','lower angle'],g:[1,25,9.81,'m/s²','gravity'],eps:[0,.01,.001,'rad','twin offset']},
 build(D,p){const W=D.world,piv=V3(0,6.4,0),sc=4.6/(p.L1+p.L2);
  [-3,3].forEach(x=>{const c=box(.35,6.8,.35,D.mats.wood);c.position.set(x,3.4,-.6);W.add(c)});const bar=box(6.4,.3,.3,D.mats.brass);bar.position.set(0,6.6,-.6);W.add(bar);
  const arm=m=>{const a=cyl(.04,1,m,8);W.add(a);return a};const mk=(mat,op)=>{const r1=Math.cbrt(p.m1)*.22,r2=Math.cbrt(p.m2)*.22;const m=op?new THREE.MeshStandardMaterial({color:0x7ab0f0,transparent:true,opacity:.35}):mat;return{a1:arm(op?m:D.mats.iron),a2:arm(op?m:D.mats.iron),b1:(()=>{const b=ball(r1,op?m:D.mats.brass);W.add(b);return b})(),b2:(()=>{const b=ball(r2,op?m:D.mats.chrome);W.add(b);return b})()}};
  const A=mk(null,false),B=mk(null,true);const tA=trail(700,0xffc56b),tB=trail(700,0x7ab0f0);W.add(tA,tB);
  const d2r=Math.PI/180;let s=[p.theta1*d2r,p.theta2*d2r,0,0],u=[p.theta1*d2r,p.theta2*d2r+p.eps,0,0],diverged=false,flips=0,lastT2=s[1];
  const f=(y)=>{const [t1,t2,w1,w2]=y,{m1,m2,L1,L2,g}=p,dd=t1-t2,den=2*m1+m2-m2*Math.cos(2*t1-2*t2);
    return[w1,w2,(-g*(2*m1+m2)*Math.sin(t1)-m2*g*Math.sin(t1-2*t2)-2*Math.sin(dd)*m2*(w2*w2*L2+w1*w1*L1*Math.cos(dd)))/(L1*den),(2*Math.sin(dd)*(w1*w1*L1*(m1+m2)+g*(m1+m2)*Math.cos(t1)+w2*w2*L2*m2*Math.cos(dd)))/(L2*den)]};
  const rk=(y,h)=>{const k1=f(y),k2=f(y.map((v,i)=>v+h/2*k1[i])),k3=f(y.map((v,i)=>v+h/2*k2[i])),k4=f(y.map((v,i)=>v+h*k3[i]));return y.map((v,i)=>v+h/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]))};
  const E=y=>{const [t1,t2,w1,w2]=y,{m1,m2,L1,L2,g}=p;return .5*(m1+m2)*L1*L1*w1*w1+.5*m2*L2*L2*w2*w2+m2*L1*L2*w1*w2*Math.cos(t1-t2)-(m1+m2)*g*L1*Math.cos(t1)-m2*g*L2*Math.cos(t2)};const E0=E(s);
  const place=(P,y,tr)=>{const p1=V3(piv.x+p.L1*sc*Math.sin(y[0]),piv.y-p.L1*sc*Math.cos(y[0]),0),p2=V3(p1.x+p.L2*sc*Math.sin(y[1]),p1.y-p.L2*sc*Math.cos(y[1]),0);P.b1.position.copy(p1);P.b2.position.copy(p2);
    [[P.a1,piv,p1],[P.a2,p1,p2]].forEach(([a,u,v])=>{a.position.copy(u).add(v).multiplyScalar(.5);a.scale.y=u.distanceTo(v);a.rotation.z=-Math.atan2(v.x-u.x,u.y-v.y)});tr.add(p2)};
  D.label('m₁',()=>A.b1.position.clone().add(V3(0,.35,0)),true);D.label('m₂',()=>A.b2.position.clone().add(V3(0,.35,0)),true);D.label('twin (offset ε)',()=>B.b2.position.clone().add(V3(0,-.4,0)));
  D.event('two pendulums released: identical except Δθ₂ = '+p.eps+' rad',A.b2.position);D.seriesName='separation |Δθ₂| (log scale)';
  return{orbit:{target:V3(0,4,0),r:14},
   step(h){s=rk(s,h);u=rk(u,h);const dv=Math.abs(Math.atan2(Math.sin(s[1]-u[1]),Math.cos(s[1]-u[1])));if(!diverged&&dv>10*d2r){diverged=true;D.event('chaos: the twins now differ by >10° (sensitive dependence on initial conditions)',A.b2.position.clone())}
    const w=Math.atan2(Math.sin(s[1]),Math.cos(s[1]));if(Math.abs(w)>Math.PI-.05&&Math.abs(lastT2)<=Math.PI-.05){flips++;D.event('lower arm flips over the top (flip '+flips+')',A.b2.position.clone(),0x88c0ff)}lastT2=w},
   visual(){place(A,s,tA);place(B,u,tB);D.push(Math.log10(Math.abs(Math.atan2(Math.sin(s[1]-u[1]),Math.cos(s[1]-u[1])))+1e-9))},
   readouts(){return[['θ₁',fmt(s[0]/d2r,1)+'°'],['θ₂',fmt(s[1]/d2r,1)+'°'],['ω₁',fmt(s[2],2)],['ω₂',fmt(s[3],2)],['E',fmt(E(s),4)+' J'],['E drift',fmt(E(s)-E0,2)]]}}}};

/* --- Lever --- */
DIO.lever={params:{m1:[.2,10,3,'kg','left mass'],x1:[-4,4,-2.5,'m','left position'],m2:[.2,10,2,'kg','right mass'],x2:[-4,4,3,'m','right position'],fulcrum:[-2,2,0,'m','fulcrum position'],beam:[0,5,1,'kg','beam mass']},
 build(D,p){const W=D.world,H=2.2,g=9.81;const ful=new THREE.Mesh(new THREE.ConeGeometry(.6,H,3),D.mats.iron);ful.position.set(p.fulcrum,H/2,0);ful.castShadow=true;W.add(ful);
  const grp=new THREE.Group();grp.position.set(p.fulcrum,H+.1,0);W.add(grp);const beam=box(9,.16,.7,D.mats.wood);beam.position.x=-p.fulcrum;grp.add(beam);
  const w1=box(Math.cbrt(p.m1)*.5,Math.cbrt(p.m1)*.5,Math.cbrt(p.m1)*.5,D.mats.lapis),w2=box(Math.cbrt(p.m2)*.5,Math.cbrt(p.m2)*.5,Math.cbrt(p.m2)*.5,D.mats.rubric);w1.position.set(p.x1-p.fulcrum,.08+Math.cbrt(p.m1)*.25,0);w2.position.set(p.x2-p.fulcrum,.08+Math.cbrt(p.m2)*.25,0);grp.add(w1,w2);
  const a1=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,0x88c0ff,.2,.12),a2=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,0xff9a7a,.2,.12);W.add(a1,a2);
  const r1=p.x1-p.fulcrum,r2=p.x2-p.fulcrum,rb=0-p.fulcrum,I=p.m1*r1*r1+p.m2*r2*r2+p.beam*(81/12+rb*rb)+.05;const tq=th=>-g*(p.m1*r1+p.m2*r2+p.beam*rb)*Math.cos(th);
  let th=0,w=0,hit=false,bal=false;const lim=Math.atan2(H-.1,4.5);
  D.label('m₁',()=>w1.getWorldPosition(V3()).add(V3(0,.5,0)),true);D.label('m₂',()=>w2.getWorldPosition(V3()).add(V3(0,.5,0)),true);D.label('fulcrum',()=>V3(p.fulcrum,.4,.8));
  const net=tq(0);if(Math.abs(net)<.05*g){bal=true;D.event('Σ moments ≈ 0: the lever balances (m₁r₁ + m₂r₂ + M·r_beam = 0)',V3(p.fulcrum,H,0),0x88c0ff)}else D.event('net moment '+fmt(net,3)+' N·m: the lever tips '+(net>0?'left':'right'),null);
  D.seriesName='tilt angle θ (deg)';
  return{orbit:{target:V3(0,2,0),r:12.5,ph:1.2},
   step(h){if(bal)return;const a=tq(th)/I-.6*w;w+=a*h;th+=w*h;if(Math.abs(th)>lim){th=Math.sign(th)*lim;if(!hit){hit=true;D.event('beam strikes the ground, stopped at '+fmt(th*180/Math.PI,2)+'°',V3(p.fulcrum+Math.sign(th)*-4.5,0.1,0))}w=-w*.25}},
   visual(){grp.rotation.z=th;[[a1,w1,p.m1],[a2,w2,p.m2]].forEach(([a,m,ms])=>{const P=m.getWorldPosition(V3());a.position.copy(P);a.setLength(.3+ms*g*.025,.2,.12)});D.push(th*180/Math.PI)},
   readouts(){return[['τ₁ = m₁g r₁',fmt(-p.m1*g*r1,3)+' N·m'],['τ₂ = m₂g r₂',fmt(-p.m2*g*r2,3)+' N·m'],['τ beam',fmt(-p.beam*g*rb,3)+' N·m'],['Σ τ (θ=0)',fmt(net,3)+' N·m'],['θ',fmt(th*180/Math.PI,2)+'°'],['I about fulcrum',fmt(I,3)+' kg·m²']]}}}};

/* --- Reaction A + B ⇌ C --- */
DIO.reaction={params:{NA:[10,120,60,'','molecules A'],NB:[10,120,60,'','molecules B'],Ea:[0,3,.8,'','forward barrier Ea'],Eb:[0,4,2,'','reverse barrier'],T:[.3,3,1,'','temperature']},
 build(D,p){const W=D.world,BX=3.2,BY=2,BZ=2,Y0=BY+.05;const ed=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*BX,2*BY,2*BZ)),new THREE.LineBasicMaterial({color:0xcfa84f}));ed.position.y=Y0;W.add(ed);
  const cols={A:new THREE.Color(0xd2553c),B:new THREE.Color(0x3c78d2),C:new THREE.Color(0x9b5bd0)};const MAX=260;const im=new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshPhysicalMaterial({roughness:.25,clearcoat:.7}),MAX);im.castShadow=true;im.name='molecules';W.add(im);
  const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());const M=[];const add=(k,pos,v)=>M.push({k,p:pos||[(Math.random()*2-1)*(BX-.2),(Math.random()*2-1)*(BY-.2),(Math.random()*2-1)*(BZ-.2)],v:v||[gauss()*Math.sqrt(p.T),gauss()*Math.sqrt(p.T),gauss()*Math.sqrt(p.T)]});
  for(let i=0;i<p.NA;i++)add('A');for(let i=0;i<p.NB;i++)add('B');let nf=0,nb=0,flashT=0,eqT=0,eqd=false;const hist=[];
  D.label('A',()=>{const m=M.find(x=>x.k==='A');return m?V3(m.p[0],m.p[1]+Y0+.2,m.p[2]):null},true);D.label('B',()=>{const m=M.find(x=>x.k==='B');return m?V3(m.p[0],m.p[1]+Y0+.2,m.p[2]):null},true);D.label('C = AB',()=>{const m=M.find(x=>x.k==='C');return m?V3(m.p[0],m.p[1]+Y0+.25,m.p[2]):null});
  D.seriesName='number of C molecules';const cnt=k=>M.reduce((n,m)=>n+(m.k===k),0);const V=8*BX*BY*BZ;
  return{orbit:{target:V3(0,Y0,0),r:12,ph:1.1},
   step(){},
   visual(dt){dt*=D.playing?D.speed:0;if(dt<=0)return;const B_=[BX-.12,BY-.12,BZ-.12];
    for(const m of M){for(let d=0;d<3;d++){m.p[d]+=m.v[d]*dt;if(m.p[d]>B_[d]){m.p[d]=2*B_[d]-m.p[d];m.v[d]*=-1}else if(m.p[d]<-B_[d]){m.p[d]=-2*B_[d]-m.p[d];m.v[d]*=-1}}}
    flashT-=dt;const As=M.filter(m=>m.k==='A'),Bs=M.filter(m=>m.k==='B'),dead=new Set();
    for(const a of As){if(dead.has(a))continue;for(const b of Bs){if(dead.has(b))continue;const dx=a.p[0]-b.p[0],dy=a.p[1]-b.p[1],dz=a.p[2]-b.p[2];if(dx*dx+dy*dy+dz*dz<.09){const vr=[a.v[0]-b.v[0],a.v[1]-b.v[1],a.v[2]-b.v[2]];const ke=.25*(vr[0]**2+vr[1]**2+vr[2]**2);
      if(ke>p.Ea){dead.add(a);dead.add(b);add('C',[(a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2,(a.p[2]+b.p[2])/2],[(a.v[0]+b.v[0])/2,(a.v[1]+b.v[1])/2,(a.v[2]+b.v[2])/2]);nf++;if(flashT<=0&&nf<40){D.event('collision with KE '+fmt(ke,2)+' > Ea: A + B → C',V3(a.p[0],a.p[1]+Y0,a.p[2]));flashT=.8}}break}}}
    for(const m of M){if(m.k==='C'&&!dead.has(m)&&Math.random()<dt*1.5*Math.exp(-p.Eb/p.T)){dead.add(m);const kick=[gauss()*.6,gauss()*.6,gauss()*.6];add('A',[m.p[0]+.15,m.p[1],m.p[2]],[m.v[0]+kick[0],m.v[1]+kick[1],m.v[2]+kick[2]]);add('B',[m.p[0]-.15,m.p[1],m.p[2]],[m.v[0]-kick[0],m.v[1]-kick[1],m.v[2]-kick[2]]);nb++}}
    if(dead.size){for(let i=M.length-1;i>=0;i--)if(dead.has(M[i]))M.splice(i,1)}
    const sT=Math.sqrt(p.T/Math.max(.05,M.reduce((s,m)=>s+(m.v[0]**2+m.v[1]**2+m.v[2]**2)/3,0)/M.length));for(const m of M)for(let d=0;d<3;d++)m.v[d]*=lerp(1,sT,.02);
    const nc=cnt('C');hist.push(nc);if(hist.length>240)hist.shift();eqT+=dt;if(!eqd&&eqT>6&&hist.length>200){const a=hist.slice(-200),mn=Math.min(...a),mx=Math.max(...a);if(mx-mn<=Math.max(4,.12*(p.NA+p.NB)/2)){eqd=true;D.event('dynamic equilibrium: forward and reverse rates balance, [C] steady',null,0x88c0ff)}}
    const m4=new THREE.Matrix4();for(let i=0;i<MAX;i++){const m=M[i];if(!m){m4.makeScale(0,0,0);im.setMatrixAt(i,m4);continue}const r=m.k==='C'?.16:.11;m4.makeScale(r,r,r);m4.setPosition(m.p[0],m.p[1]+Y0,m.p[2]);im.setMatrixAt(i,m4);im.setColorAt(i,cols[m.k])}im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;D.push(nc)},
   readouts(){const a=cnt('A'),b=cnt('B'),c=cnt('C');return[['N_A',a],['N_B',b],['N_C',c],['Q = [C]/([A][B])',fmt(a&&b?c*V/(a*b):NaN,3)],['forward events',nf],['reverse events',nb]]}}}};

/* --- Electric field --- */
DIO.efield={params:{q1:[-5,5,3,'','charge q₁'],q2:[-5,5,-3,'','charge q₂'],d:[1,6,3.5,'','separation'],qt:[-2,2,1,'','test charge'],m:[.2,5,1,'','test mass']},
 build(D,p){const W=D.world,Y=2.6,K=2,Q=[[p.q1,V3(-p.d/2,Y,0)],[p.q2,V3(p.d/2,Y,0)]];
  const Ef=(x,y,z)=>{let ex=0,ey=0,ez=0;for(const [q,c] of Q){const dx=x-c.x,dy=y-c.y,dz=z-c.z,r2=dx*dx+dy*dy+dz*dz+.01,r=Math.sqrt(r2),k=K*q/(r2*r);ex+=k*dx;ey+=k*dy;ez+=k*dz}return[ex,ey,ez]};
  const Vp=(x,y,z)=>Q.reduce((s,[q,c])=>s+K*q/Math.sqrt((x-c.x)**2+(y-c.y)**2+(z-c.z)**2+.01),0);
  Q.forEach(([q,c],i)=>{if(Math.abs(q)<.01)return;const m=new THREE.Mesh(new THREE.SphereGeometry(.18+Math.sqrt(Math.abs(q))*.12,32,20),new THREE.MeshStandardMaterial({color:q>0?0xd2553c:0x3c78d2,emissive:q>0?0x801800:0x0a2a80,emissiveIntensity:1.2,roughness:.3}));m.position.copy(c);m.name=(q>0?'positive':'negative')+' charge '+(i+1);W.add(m);
    const pl=new THREE.PointLight(q>0?0xff7050:0x5080ff,.8,5);pl.position.copy(c);W.add(pl)});
  const lines=new THREE.Group();lines.name='field lines';W.add(lines);const lm=new THREE.LineBasicMaterial({color:0xe8c46a,transparent:true,opacity:.75});
  Q.forEach(([q,c])=>{if(Math.abs(q)<.01)return;const n=Math.round(10+Math.abs(q)*3),sgn=Math.sign(q);for(let i=0;i<n;i++){const yy=1-2*(i+.5)/n,rr=Math.sqrt(1-yy*yy),ph=i*2.39996;let x=c.x+.25*rr*Math.cos(ph),y=c.y+.25*yy,z=c.z+.25*rr*Math.sin(ph);const pts=[V3(x,y,z)];
    for(let k=0;k<260;k++){const [ex,ey,ez]=Ef(x,y,z),m=Math.hypot(ex,ey,ez)||1;x+=sgn*.06*ex/m;y+=sgn*.06*ey/m;z+=sgn*.06*ez/m;if(y<.05||Math.hypot(x,z)>6.6||y>7.5)break;if(Q.some(([q2,c2])=>c2!==c&&Math.hypot(x-c2.x,y-c2.y,z-c2.z)<.2))break;pts.push(V3(x,y,z))}
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lm))}});
  const pc=document.createElement('canvas');pc.width=pc.height=128;const g=pc.getContext('2d'),img=g.createImageData(128,128);for(let j=0;j<128;j++)for(let i=0;i<128;i++){const x=-6+12*i/127,z=-6+12*j/127,v=Math.tanh(Vp(x,Y,z)/3);const o=(j*128+i)*4;const band=Math.abs(Math.sin(v*12))<.12?40:0;img.data[o]=v>0?190+band:40+band;img.data[o+1]=60+band+(1-Math.abs(v))*40;img.data[o+2]=v<0?200+band:50+band;img.data[o+3]=Math.min(200,Math.abs(v)*220+30)}g.putImageData(img,0,0);
  const ptex=new THREE.CanvasTexture(pc);const plane=new THREE.Mesh(new THREE.CircleGeometry(6.3,64),new THREE.MeshBasicMaterial({map:ptex,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide}));plane.rotation.x=-Math.PI/2;plane.position.y=Y;plane.name='potential map (equipotential bands)';W.add(plane);
  const tc=ball(.13,D.mats.chrome);W.add(tc);const tr=trail(800,0x9fe0ff);W.add(tr);let P=[0,Y+1.6,.8],Vv=[.6,0,0],gone=false,wait=0;const E0=()=>.5*p.m*(Vv[0]**2+Vv[1]**2+Vv[2]**2)+p.qt*Vp(...P);let Einit=E0();
  D.label('q₁',()=>Q[0][1].clone().add(V3(0,.5,0)),true);D.label('q₂',()=>Q[1][1].clone().add(V3(0,.5,0)),true);D.label('test charge · q, m',()=>gone?null:tc.position.clone().add(V3(0,.3,0)));
  D.event('test charge released; force F = qE, energy ½mv² + qV conserved',V3(...P));D.seriesName='potential V at test charge';
  return{orbit:{target:V3(0,Y,0),r:13,ph:.95},
   step(h){if(gone){wait+=h;if(wait>1.2){P=[0,Y+1.6,.8];Vv=[.6,0,0];gone=false;wait=0;tr.userData.count=0;Einit=E0()}return}const [ex,ey,ez]=Ef(...P),k=p.qt/p.m;Vv[0]+=k*ex*h;Vv[1]+=k*ey*h;Vv[2]+=k*ez*h;for(let d=0;d<3;d++)P[d]+=Vv[d]*h;
    for(const [q,c] of Q)if(Math.abs(q)>.01&&Math.hypot(P[0]-c.x,P[1]-c.y,P[2]-c.z)<.25){gone=true;D.event('test charge captured by '+(q>0?'+':'−')+' charge (opposite signs attract)',c.clone(),0xff9a7a)}
    if(!gone&&(Math.hypot(P[0],P[2])>6.5||P[1]<.1||P[1]>8)){gone=true;D.event('test charge escapes the diorama (repelled or flung)',V3(...P))}},
   visual(){tc.position.set(...P);if(!gone)tr.add(tc.position);D.push(Vp(...P))},
   readouts(){const [ex,ey,ez]=Ef(...P);return[['|E| at q',fmt(Math.hypot(ex,ey,ez),3)],['V at q',fmt(Vp(...P),3)],['speed',fmt(Math.hypot(...Vv),3)],['energy',fmt(E0(),4)],['energy drift',fmt(E0()-Einit,2)],['F = qE',fmt(p.qt*Math.hypot(ex,ey,ez),3)]]}}}};

/* --- RC circuit --- */
DIO.circuit={params:{V:[1,12,9,'V','battery emf'],R:[1,20,5,'kΩ','resistance'],C:[.1,2,.6,'mF','capacitance'],closed:[0,1,1,'','switch: 1 charge · 0 discharge']},
 build(D,p){const W=D.world,Y=.35,path=new THREE.CurvePath();const pts=[V3(-4.5,Y,-2.5),V3(4.5,Y,-2.5),V3(4.5,Y,2.5),V3(-4.5,Y,2.5),V3(-4.5,Y,-2.5)];for(let i=0;i<4;i++)path.add(new THREE.LineCurve3(pts[i],pts[i+1]));
  const wireM=new THREE.MeshStandardMaterial({color:0xb87333,metalness:1,roughness:.3});for(let i=0;i<4;i++){const w=new THREE.Mesh(new THREE.TubeGeometry(path.curves[i],20,.06,8,false),wireM);w.castShadow=true;W.add(w)}
  const board=box(10.5,.15,6.5,D.mats.wood);board.position.y=.08;board.name='board';W.add(board);
  const bat=cyl(.45,1.6,new THREE.MeshStandardMaterial({color:0x1d2a3a,roughness:.4,metalness:.3}),32);bat.rotation.z=Math.PI/2;bat.position.set(0,Y+.4,-2.5);bat.name='battery';W.add(bat);const capb=cyl(.2,.15,D.mats.brass,16);capb.rotation.z=Math.PI/2;capb.position.set(.85,Y+.4,-2.5);W.add(capb);
  const res=cyl(.22,1.4,D.mats.ivory,24);res.rotation.x=Math.PI/2;res.position.set(4.5,Y+.1,0);res.name='resistor';W.add(res);[0x8b4513,0x111111,0xd04020,0xcfa84f].forEach((c,i)=>{const b=cyl(.235,.1,new THREE.MeshStandardMaterial({color:c}),24);b.rotation.x=Math.PI/2;b.position.set(4.5,Y+.1,-.45+i*.28);W.add(b)});
  const plM=new THREE.MeshStandardMaterial({color:0xcccccc,metalness:.9,roughness:.25,emissive:0xffb050,emissiveIntensity:0});const pl1=box(.12,1.6,1.4,plM),pl2=box(.12,1.6,1.4,plM.clone());pl1.position.set(-4.75,Y+.8,0);pl2.position.set(-4.25,Y+.8,0);pl1.name='capacitor plate +';pl2.name='capacitor plate −';W.add(pl1,pl2);
  const sw=box(1,.08,.12,D.mats.brass);sw.position.set(-2,Y+.3,2.5);sw.name='switch';W.add(sw);
  const NE=70,el_=new THREE.InstancedMesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshBasicMaterial({color:0x9fe0ff}),NE);el_.name='electrons';W.add(el_);const eu=Array.from({length:NE},(_,i)=>i/NE);
  const glow=new THREE.PointLight(0xffb050,0,4);glow.position.set(-4.5,Y+.8,0);W.add(glow);
  let q=p.closed>.5?0:p.C*1e-3*p.V,lastSw=p.closed,tau=p.R*1e3*p.C*1e-3,t0=0,m1=false,m5=false;const Cf=p.C*1e-3,R=p.R*1e3;
  D.label('battery · ε',()=>V3(0,Y+1.2,-2.5));D.label('resistor · R',()=>V3(4.5,Y+.8,0));D.label('capacitor · C',()=>V3(-4.5,Y+1.9,0));D.label('switch',()=>V3(-2,Y+.7,2.5));
  D.event((p.closed>.5?'switch closed: capacitor charges through R':'switch open to battery: capacitor discharges through R')+', τ = RC = '+fmt(tau,3)+' s',null);D.seriesName='capacitor voltage V_C (V)';
  return{orbit:{target:V3(0,.8,0),r:12,ph:.95},
   live(k){if(k==='closed'){t0=D.t;m1=m5=false;D.event(p.closed>.5?'switch flipped: charging':'switch flipped: discharging',V3(-2,Y+.3,2.5));return true}return false},
   step(h){const src=p.closed>.5?p.V:0;const I=(src-q/Cf)/R;q+=I*h;const el2=D.t-t0;if(!m1&&el2>=tau){m1=true;D.event('t = τ: V_C has covered 63.2% of the way (1 − 1/e)',V3(-4.5,Y+.8,0))}if(!m5&&el2>=5*tau){m5=true;D.event('t = 5τ: within 0.7% of final value',V3(-4.5,Y+.8,0),0x88c0ff)}},
   visual(dt){const src=p.closed>.5?p.V:0,I=(src-q/Cf)/R,Vc=q/Cf;const sp=I*R/p.V*.25;sw.rotation.y=p.closed>.5?0:.6;
    const m4=new THREE.Matrix4();for(let i=0;i<NE;i++){eu[i]=mod(eu[i]-sp*dt*(D.playing?D.speed:0),1);const P=path.getPointAt(eu[i]);m4.makeTranslation(P.x,P.y+.1,P.z);el_.setMatrixAt(i,m4)}el_.instanceMatrix.needsUpdate=true;
    const f=clamp(Vc/12,0,1);plM.emissiveIntensity=f*1.5;pl2.material.emissive.setHex(0x5080ff);pl2.material.emissiveIntensity=f*1.5;glow.intensity=f*2;D.push(Vc)},
   readouts(){const src=p.closed>.5?p.V:0,I=(src-q/Cf)/R,Vc=q/Cf;return[['V_C',fmt(Vc,3)+' V'],['I',fmt(I*1e3,3)+' mA'],['q',fmt(q*1e3,3)+' mC'],['τ = RC',fmt(tau,3)+' s'],['energy ½CV²',fmt(.5*Cf*Vc*Vc*1e3,3)+' mJ'],['t − t_switch',fmt(D.t-t0,2)+' s']]}}}};

/* --- Thin lens --- */
DIO.lens={params:{f:[-4,6,2.5,'','focal length (negative: diverging)'],do:[.5,6,4,'','object distance'],ho:[.3,1.5,.8,'','object height'],sweep:[0,1,0,'','sweep object (1 on)']},
 build(D,p){const W=D.world,Y=2.2,fl=Math.abs(p.f)<.05?.05:p.f;const rail=box(13,.1,.5,D.mats.iron);rail.position.set(0,Y-1.6,0);W.add(rail);W.add(lineFrom([V3(-6.5,Y,0),V3(6.5,Y,0)],0x8f733a,true));
  const lensG=new THREE.SphereGeometry(1.5,48,32);lensG.scale(fl>0?.12:.05,1,1);const lens=new THREE.Mesh(lensG,new THREE.MeshPhysicalMaterial({color:0xddeeff,transmission:.95,roughness:.02,thickness:.6,ior:1.52,transparent:true,opacity:.6,clearcoat:1}));lens.position.y=Y;lens.name=fl>0?'converging lens':'diverging lens';W.add(lens);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.5,.05,8,48),D.mats.brass);ring.rotation.y=Math.PI/2;ring.position.y=Y;W.add(ring);const post=cyl(.06,1.6,D.mats.brass);post.position.set(0,Y-.8,0);W.add(post);
  [fl,-fl].forEach((x,i)=>{const m=ball(.08,D.mats.rubric);m.position.set(x,Y,0);m.name='focal point '+(i?'F′':'F');W.add(m)});
  const arrow=(mat)=>{const g=new THREE.Group();const s=cyl(.05,1,mat,10);s.geometry.translate(0,.5,0);const h=new THREE.Mesh(new THREE.ConeGeometry(.14,.3,16),mat);g.add(s,h);g.userData={s,h};return g};
  const objA=arrow(new THREE.MeshStandardMaterial({color:0xffc56b,emissive:0x553300}));objA.name='object';W.add(objA);const imgM=new THREE.MeshStandardMaterial({color:0x9fd0ff,emissive:0x113355,transparent:true,opacity:.9});const imgA=arrow(imgM);imgA.name='image';W.add(imgA);
  const setA=(a,x,h)=>{a.position.set(x,Y,0);const s=Math.abs(h);a.userData.s.scale.y=Math.max(.01,s-.3);a.userData.h.position.y=Math.max(.01,s-.3)+.15;a.rotation.z=h<0?Math.PI:0};
  const rayM=[0xffd27a,0xff9a7a,0x9fe0ff].map(c=>new THREE.LineBasicMaterial({color:c,transparent:true,opacity:.95})),dashM=new THREE.LineDashedMaterial({color:0xcccccc,dashSize:.15,gapSize:.1,transparent:true,opacity:.6});
  const rays=[0,1,2].map(i=>{const l=new THREE.Line(new THREE.BufferGeometry(),rayM[i]);l.frustumCulled=false;W.add(l);return l}),backs=[0,1,2].map(()=>{const l=new THREE.Line(new THREE.BufferGeometry(),dashM);l.frustumCulled=false;W.add(l);return l});
  let dObj=p.do,regime=null,di=0,hi=0;
  const solve=()=>{di=Math.abs(dObj-fl)<1e-3?Infinity:1/(1/fl-1/dObj);hi=-p.ho*di/dObj;const r=!isFinite(di)?'inf':di>0?'real':'virtual';if(r!==regime){if(regime!==null)D.event(r==='inf'?'object at the focal point: rays leave parallel, image at infinity':r==='real'?'object beyond F: real, inverted image on the far side':'object inside F (or diverging lens): virtual, upright image',V3(-dObj,Y,0),0x88c0ff);regime=r}};
  const setLine=(l,pts)=>{l.geometry.setFromPoints(pts);if(l.material.isLineDashedMaterial)l.computeLineDistances()};
  D.label('object',()=>V3(-dObj,Y+p.ho+.3,0));D.label('image',()=>isFinite(di)&&Math.abs(di)<7?V3(di,Y+hi+(hi<0?-.3:.3),0):null);D.label('F',()=>V3(fl,Y-.35,0),true);D.label("F′",()=>V3(-fl,Y-.35,0),true);
  D.seriesName='image distance dᵢ';solve();D.event('1/f = 1/d_o + 1/d_i  with f = '+fmt(fl,3),null);
  return{orbit:{target:V3(0,Y,0),r:12,ph:1.25,th:.0},
   step(h){if(p.sweep>.5){dObj=3.4+2.9*Math.sin(D.t*.35);solve()}},
   visual(){setA(objA,-dObj,p.ho);const O=V3(-dObj,Y+p.ho,0),Ytop=Y+p.ho;const far=6.5;
    const img=isFinite(di)?V3(di,Y+hi,0):null;imgA.visible=!!img&&Math.abs(di)<7;if(imgA.visible){setA(imgA,di,hi);imgM.opacity=di>0?.95:.4}
    // ray 1: parallel then through F' (or away from F for diverging)
    const P1=V3(0,Ytop,0);setLine(rays[0],[O,P1,V3(far,Ytop-p.ho*far/fl,0)]);
    // ray 2: through centre
    const d2=V3(dObj,-p.ho,0).normalize();setLine(rays[1],[O,O.clone().add(d2.clone().multiplyScalar((far+dObj)/d2.x))]);
    // ray 3: toward F then parallel
    const P3=V3(0,Y-p.ho*fl/(dObj-fl),0);setLine(rays[2],[O,P3,V3(far,P3.y,0)]);
    if(img&&di<0){setLine(backs[0],[P1,img]);setLine(backs[1],[O,img]);setLine(backs[2],[P3,img]);backs.forEach(b=>b.visible=true)}else backs.forEach(b=>b.visible=false);
    D.push(isFinite(di)?clamp(di,-20,20):20)},
   readouts(){return[['d_o',fmt(dObj,3)],['d_i',isFinite(di)?fmt(di,3):'∞'],['m = −d_i/d_o',isFinite(di)?fmt(-di/dObj,3):'∞'],['h_i',isFinite(hi)?fmt(hi,3):'∞'],['image',regime==='inf'?'at infinity':regime],['power 1/f',fmt(1/fl,3)]]}}}};

