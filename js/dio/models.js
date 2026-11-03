// Built-in simulation models (ported from Scriptorium v2), running on the new engine through a small adapter.
// Each model: {params:{key:[min,max,default,unit,label]}, build(D,p) -> {step(h), visual(dt), readouts(), orbit?, live?(k), click?(raycaster), hist?, histCurve?}}
// D.label(text, getPos) marks a significant actor (used for the guided tour); unlabelled meshes are scenic decor.
import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, fmt, lerp, mod, mulberry, compile } from '../util.js';
import { makeMaterial, thinGlass } from '../gfx/materials.js';
import { alignUV, cloudLayer, hillLayer, softDisc, relief, variation } from '../gfx/proc.js';
// Lights: v2 ran with legacy light units; scale to physically based units so scenes keep their look.
const PI = Math.PI;
class PointLight extends T.PointLight { constructor(c, i = 1, d = 0, decay = 2) { super(c, i * PI * 4, d, Math.min(decay, 2)); } }
class SpotLight extends T.SpotLight { constructor(c, i = 1, d = 0, a, p, decay = 2) { super(c, i * PI * 6, d, a, p, Math.min(decay, 2)); } }
class DirectionalLight extends T.DirectionalLight { constructor(c, i = 1) { super(c, i * PI * .8); } }
class HemisphereLight extends T.HemisphereLight { constructor(a, b, i = 1) { super(a, b, i * PI * .6); } }
const THREE = { ...T, PointLight, SpotLight, DirectionalLight, HemisphereLight };
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
function woodMat() { return makeMaterial('wood'); }
export const V3 = (x, y, z) => new T.Vector3(x, y, z);
function cyl(r, h, mat, seg = 16) { const m = new T.Mesh(alignUV(new T.CylinderGeometry(r, r, h, Math.max(seg, 32))), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function ball(r, mat) { const m = new T.Mesh(new T.SphereGeometry(r, 48, 32), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, mat) { const m = new T.Mesh(alignUV(new T.BoxGeometry(w, h, d)), mat); m.castShadow = true; m.receiveShadow = true; return m; }
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
  const ghost=ball(.38,new THREE.MeshPhysicalMaterial({color:0x6aa0e0,transparent:true,opacity:.28,roughness:.2,depthWrite:false}));ghost.castShadow=false;W.add(ghost);
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
  const grid=new THREE.Mesh(new THREE.CircleGeometry(6.8,96).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:canvasTex(1024,1024,(g,w,h)=>{g.clearRect(0,0,w,h);for(let i=0;i<=48;i++){const x=i/48*w,maj=i%4===0;g.strokeStyle=maj?'rgba(207,168,79,.55)':'rgba(207,168,79,.22)';g.lineWidth=maj?2.2:1.2;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();g.beginPath();g.moveTo(0,x);g.lineTo(w,x);g.stroke()}}),transparent:true,depthWrite:false}));grid.position.y=.016;grid.name='measuring grid';grid.userData.noInk=true;W.add(grid);
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
  const E0=.5*(vx*vx+vz*vz)-p.GM/p.r0;if(E0>=0)D.event('energy ε ≥ 0: unbound, the planet escapes',V3(x,Y,z));
  D.label('star · M',()=>V3(0,Y+.9,0));D.label('planet · m',()=>pl.position.clone().add(V3(0,.35,0)));D.label('r',()=>pl.position.clone().lerp(V3(0,Y,0),.5),true);
  const rline=lineFrom([V3(0,Y,0),V3(x,Y,z)],0x8f733a);W.add(rline);
  D.seriesName='distance r(t)';
  return{orbit:{target:V3(0,Y,0),r:16,ph:.75},
   step(h){const r=Math.hypot(x,z),a=-p.GM/(r*r*r);vx+=a*x*h;vz+=a*z*h;x+=vx*h;z+=vz*h;const dr=(x*vx+z*vz);
    if(lastDr!==0&&Math.sign(dr)!==Math.sign(lastDr)){if(dr>0){peri.push(D.t);if(peri.length>1)Tm=peri.at(-1)-peri.at(-2);D.event('perihelion: closest, fastest (v = '+fmt(Math.hypot(vx,vz),2)+')',V3(x,Y,z),0x88c0ff)}else D.event('aphelion: farthest, slowest (v = '+fmt(Math.hypot(vx,vz),2)+')',V3(x,Y,z))}lastDr=dr;
    fanPts.push(V3(x,Y,z));
    if(D.t-markT>Tg){const g=new THREE.BufferGeometry();const arr=[];for(let i=1;i<fanPts.length;i++){arr.push(0,Y,0,fanPts[i-1].x,Y,fanPts[i-1].z,fanPts[i].x,Y,fanPts[i].z)}g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:wi%2?0xcfa84f:0x2d5b8e,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));W.add(m);wedges.push(m);wi++;if(wedges.length>12)W.remove(wedges.shift());fanPts=[V3(x,Y,z)];markT=D.t}
    if(r>14||r<.3){D.event(r<.3?'planet falls into the star — resetting':'planet left the diorama — resetting',V3(x,Y,z));x=p.r0;z=0;vx=0;vz=-p.vfactor*vc;tr.userData.count=0;fanPts=[V3(x,Y,z)]}},
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
  const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(base,0);sh.lineTo(0,hgt);sh.lineTo(0,0);const wg=new THREE.ExtrudeGeometry(sh,{depth:2,bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:2});wg.translate(x0,0,-1);{const u=wg.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)/2.4,u.getY(i)/2.4)}const wedge=new THREE.Mesh(wg,D.mats.wood);wedge.castShadow=wedge.receiveShadow=true;W.add(wedge);
  const blk=box(.9,.6,.9,D.mats.brass);W.add(blk);
  const dir=V3(Math.cos(a),-Math.sin(a),0),nrm=V3(Math.sin(a),Math.cos(a),0);
  const arr=(c)=>{const h=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,c,.25,.16);W.add(h);return h};const aG=arr(0xff8866),aN=arr(0x88c0ff),aF=arr(0x99dd99),aNet=arr(0xffd27a);
  const slides=Math.tan(a)>p.mu;const acc=slides?p.g*(Math.sin(a)-p.mu*Math.cos(a)):0;let s=0,v=0,wait=0;
  D.event(slides?'tan θ > μ: gravity along the slope beats friction, block slides':'tan θ ≤ μ: static friction holds the block',V3(x0,hgt,0).add(dir.clone().multiplyScalar(.6)));
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
 build(D,p){const W=D.world,N=80,Y=2.4,xs=[];const beads=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,20,14),D.mats.brass,N);beads.castShadow=true;beads.userData.noInk=true;W.add(beads);
  for(let i=0;i<N;i++)xs.push(-5+10*i/(N-1));[-5.3,5.3].forEach(x=>{const post=cyl(.1,Y+.5,D.mats.wood);post.position.set(x,(Y+.5)/2,0);W.add(post)});
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));const line=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xffd27a}));line.frustumCulled=false;W.add(line);
  const marker=ball(.16,D.mats.rubric);W.add(marker);const st=p.standing>.5,lam=st?20/Math.max(1,Math.round(20/p.lambda)):p.lambda,k=2*Math.PI/lam,w=2*Math.PI*p.f;let cycles=0;
  // a string fixed at both ends (x = ±5, L = 10) only supports standing modes with λ = 2L/n
  if(st&&Math.abs(lam-p.lambda)>1e-3)D.event('standing wave on a fixed string: λ snapped to 2L/n = '+fmt(lam,3)+' m (n = '+Math.round(20/lam)+')',V3(0,Y,0));
  const yAt=(x,t)=>st?2*p.A*Math.sin(k*(x+5))*Math.cos(w*t):p.A*Math.sin(k*(x+5)-w*t);
  const nodes=[];if(st){for(let n=0;n*lam/2<=10.001;n++){const x=-5+n*lam/2;const r=new THREE.Mesh(new THREE.TorusGeometry(.18,.03,8,24),new THREE.MeshBasicMaterial({color:0x88c0ff}));r.position.set(x,Y,0);W.add(r);nodes.push(x)}}
  const m4=new THREE.Matrix4();D.label(st?'node (never moves)':'crest',()=>st?(nodes[1]!=null?V3(nodes[1],Y-.5,0):null):V3(-5+((w*D.t/k)%lam)+lam/4-0,Y+p.A+.35,0));D.label('tracked bead',()=>marker.position.clone().add(V3(0,.35,0)));D.label('λ',()=>V3(-5+lam/2,Y-2*p.A-.6,0),true);
  W.add(lineFrom([V3(-5,Y-2*p.A-.4,0),V3(-5+lam,Y-2*p.A-.4,0)],0xcfa84f));
  D.seriesName='displacement of tracked bead y(t)';
  return{orbit:{target:V3(0,Y,0),r:13,ph:1.2},
   step(h){const c=Math.floor(D.t*p.f);if(c>cycles){cycles=c;if(c<=12)D.event('period '+c+' complete: T = 1/f = '+fmt(1/p.f,3)+' s',marker.position.clone())}},
   visual(){const a=lg.attributes.position;for(let i=0;i<N;i++){const y=yAt(xs[i],D.t);m4.makeTranslation(xs[i],Y+y,0);beads.setMatrixAt(i,m4);a.setXYZ(i,xs[i],Y+y,0)}beads.instanceMatrix.needsUpdate=true;a.needsUpdate=true;const xm=xs[30];marker.position.set(xm,Y+yAt(xm,D.t),0);D.push(yAt(xm,D.t))},
   readouts(){return[['v = fλ',fmt(p.f*lam,3)+' m/s'],['k = 2π/λ',fmt(k,3)+' rad/m'],['ω = 2πf',fmt(w,3)+' rad/s'],['T',fmt(1/p.f,3)+' s'],['mode',st?'standing':'travelling'],['t',fmt(D.t,2)+' s']]}}}};

/* --- Gas --- */
DIO.gas={params:{N:[10,160,70,'','molecules'],T:[.2,4,1,'','temperature (k=m=1)']},
 build(D,p){const W=D.world,BX=3,BY=2,BZ=2,Y0=BY+.05,N=Math.round(p.N),r=.09;
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*BX,2*BY,2*BZ)),new THREE.LineBasicMaterial({color:0xcfa84f}));edges.position.y=Y0;W.add(edges);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(2*BX,2*BY,2*BZ),thinGlass({absorb:.02,edge:.7,card:.15}));glass.renderOrder=5;glass.position.y=Y0;W.add(glass);
  const mols=new THREE.InstancedMesh(new THREE.SphereGeometry(r,20,14),makeMaterial({preset:'plastic',color:'#ffffff',roughness:.25}),N);mols.castShadow=true;mols.userData.noInk=true;W.add(mols);
  const P=[],V=[];const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
  for(let i=0;i<N;i++){P.push([(Math.random()*2-1)*(BX-r),(Math.random()*2-1)*(BY-r),(Math.random()*2-1)*(BZ-r)]);const s=Math.sqrt(p.T);V.push([gauss()*s,gauss()*s,gauss()*s])}
  let imp=0,win=0,Pm=NaN;const ex=BX-r,ey=BY-r,ez=BZ-r,area=2*(4*ey*ez+4*ex*ez+4*ex*ey),vol=8*ex*ey*ez;const m4=new THREE.Matrix4(),col=new THREE.Color(); // molecule centres reflect at B − r
  D.label('molecule · m',()=>V3(P[0][0],P[0][1]+Y0+.25,P[0][2]));D.label('container wall (pressure = impulse / area / time)',()=>V3(0,Y0+BY+.35,0));
  D.seriesName='speed histogram · red: Maxwell–Boltzmann';let temp=p.T;
  return{orbit:{target:V3(0,Y0,0),r:12,ph:1.1},
   live(k){if(k==='T'){const f=Math.sqrt(p.T/temp);V.forEach(v=>{v[0]*=f;v[1]*=f;v[2]*=f});temp=p.T;D.event('heated/cooled: velocities scaled by √(T′/T) = '+fmt(f,3),V3(0,Y0,0));return true}return false},
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
  const surf=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.4,metalness:.1,clearcoat:.6,clearcoatRoughness:.12,side:THREE.DoubleSide}));surf.castShadow=surf.receiveShadow=true;W.add(surf);
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(2*R_,2*R_,18,18).rotateX(-Math.PI/2)),new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.0}));W.add(wire);
  const bl=ball(.2,D.mats.chrome);W.add(bl);const tr=trail(900,0xff9a6a);W.add(tr);const gA=new THREE.ArrowHelper(V3(1,0,0),V3(),1,0x88c0ff,.2,.12);W.add(gA);
  let bx=2.2,by=1.6,vx=0,vy=0,rest=false,still=0;const grad=(x,y)=>{const e=1e-3;return[(F(x+e,y)-F(x-e,y))/(2*e),(F(x,y+e)-F(x,y-e))/(2*e)]};
  const height=(x,y)=>Y0+(F(x,y)-lo)*sc;
  D.label('ball',()=>bl.position.clone().add(V3(0,.35,0)));D.label('−∇f',()=>gA.visible?gA.position.clone().add(V3(0,.25,0)):null,true);D.label('z = '+ex,()=>V3(-R_,Y0+2.9,-R_));
  D.event('ball placed — click the surface to drop it elsewhere',V3(bx,height(bx,by)+.2,by));D.seriesName='height f(ball) — falls toward a minimum';
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

/* --- Weather glass: Goethe barometer + storm glass + stick barometer under a living sky ---
   Physics (all in hPa, °C, scene unit = 60 mm for the Goethe glass):
   • Goethe glass: trapped gas = dry air + saturated water vapour. Sealed at P₀, T₀ = 15 °C with the spout level
     equal to the flask level. Dry air: (P₀ − e(T₀))·(T/T₀)·(V₀/V); vapour: e(T) (Magnus). Water rising h in the
     spout enlarges the air volume by a·h (a = bore area) and lowers the flask level by a·h/A, so
     P_in(h) − P = ρ g h (1 + a/A). Solved by bisection each step; the column relaxes to it with τ ≈ 0.15 h.
     The "air spring" (P_in·a/V₀ per unit rise) stiffens the glass by ~30 % versus the textbook Δh = (P₀T/T₀ − P)/ρg,
     which is shown alongside as a readout.
   • Mercury barometer: column h = P / (ρ_Hg g) = 0.750062 mm per hPa; the register window shows 945–1055 hPa.
   • Storm glass (Williams 2025, J. Chem. Educ. 10.1021/acs.jchemed.5c00131): crystals follow TEMPERATURE.
     Total camphor is conserved, c + M = C; solubility S(T) = e^{0.065 (T − 16)}; σ = c/S − 1. Nucleation needs
     σ > 0.04 (metastable zone); growth ∝ σ, dissolution ∝ σ·M^{2/3} (surface). High supersaturation / fast cooling
     puts the growth into feathery dendrites (ferns), slow growth into compact crystals at the bottom.
   Visual coupling: falling pressure → water rises in the spout, mercury falls, cloud cover and rain increase. */
DIO.weatherglass={params:{T:[-5,35,16,'°C','air temperature'],P:[960,1050,1013,'hPa','outside air pressure'],P0:[990,1035,1013,'hPa','pressure when sealed (at 15 °C)'],auto:[0,1,1,'','auto weather (1 on · 0 off)'],conc:[.6,1.4,1,'×','camphor concentration']},
 build(D,p){const W=D.world;D.orb.ph=1.2;const rng=mulberry(42);
  // ---------- materials ----------
  const shell=thinGlass({side:THREE.FrontSide,absorb:.03,edge:.9});            // glass with real wall thickness (two lathe surfaces)
  const film=thinGlass({side:THREE.DoubleSide,absorb:.025,edge:.8,card:.35});            // single-surface glass (spout tube, register glass)
  const water=makeMaterial({preset:'liquid',color:'#6fd3c8'});water.color.set('#f2fffd');water.attenuationDistance=4.5;water.thickness=1.5;water.roughness=.01; // pale teal coloured water
  const sol=thinGlass({side:THREE.FrontSide,absorb:.1,edge:1,color:0x161208,ior:1.36,smudge:false,env:1.15});     // ethanol–water camphor solution (clear; crystals inside stay crisp)
  const merc=makeMaterial('mercury');merc.envMapIntensity=2.2;merc.roughness=.05;const brass=makeMaterial('brass'),walnut=makeMaterial('walnut'),cork=makeMaterial('cork'),crystM=makeMaterial('crystal');crystM.color.set('#b8c2c9');crystM.emissiveIntensity=.02;crystM.sheen=.3;crystM.envMapIntensity=.9;
  const ivory=makeMaterial({preset:'ceramic',color:'#efe6d2'});
  const lathe=(pts,mat,seg=96)=>{const m=new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(Math.max(.0005,x),y)),seg),mat);m.castShadow=true;m.receiveShadow=true;return m};
  // glass shell from an outer profile: outer surface up, inner surface (offset by wall thickness) back down
  const shellPts=(outer,t)=>{const inner=[];for(let i=0;i<outer.length;i++){const a=outer[Math.max(0,i-1)],b=outer[Math.min(outer.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;inner.push([outer[i][0]-dy/L*t,outer[i][1]+dx/L*t])}return outer.concat(inner.reverse())};
  const smooth=(pts,n=6)=>{const c=new THREE.SplineCurve(pts.map(([x,y])=>new THREE.Vector2(x,y)));return c.getPoints(pts.length*n).map(v=>[v.x,v.y])};

  // ---------- sky backdrop with depth: gradient sky, two cloud decks, two hill silhouettes, low scud ----------
  const A0=Math.PI*.45,AL=Math.PI*1.1,H=7.6,sector=(r,h,y0=0)=>{const g=new THREE.CylinderGeometry(r,r,h,72,1,true,A0,AL);g.translate(0,y0+h/2,0);return g};
  const skyCv=document.createElement('canvas');skyCv.width=4;skyCv.height=256;const skyTex=new THREE.CanvasTexture(skyCv);skyTex.colorSpace=THREE.SRGBColorSpace;
  const back=new THREE.Mesh(sector(6.62,H),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide}));back.name='sky backdrop';back.userData.noContact=true;back.userData.noInk=true;W.add(back);
  const coverHook=(m,key)=>{m.userData.cover={value:.3};m.defines={SM_CLOUD:''};m.onBeforeCompile=s=>{s.uniforms.uCover=m.userData.cover;s.fragmentShader='uniform float uCover;\n'+s.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 smC=texture2D(map,vMapUv);float smLo=.5-.48*uCover;float smA=smoothstep(smLo,smLo+.42,smC.a);smA=max(smA,smoothstep(.0,.3,smC.a)*pow(uCover,2.5)*.8);
      diffuseColor.rgb*=smC.rgb;diffuseColor.a*=smA;
    #endif`)};m.customProgramCacheKey=()=>'smcloud';return m};
  const layers=[];const cloudDeck=(r,h,y0,seed,rep,speed,name,size=1)=>{const t=cloudLayer(seed,1024,128,2,size).clone();t.repeat.set(rep,1);t.needsUpdate=true;const m=coverHook(new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.BackSide,fog:false}),name);const me=new THREE.Mesh(sector(r,h,y0),m);me.name=name;me.userData.noContact=true;me.userData.noInk=true;me.renderOrder=-2;W.add(me);layers.push({m,t,speed});return me};
  const hills=(r,h,seed,rough,ht,col,name)=>{const t=hillLayer(seed,1024,256,rough,ht).clone();t.repeat.set(3,1);t.needsUpdate=true;const m=new THREE.MeshBasicMaterial({map:t,alphaTest:.5,alphaToCoverage:true,side:THREE.BackSide,color:col});const me=new THREE.Mesh(sector(r,h,0),m);me.name=name;me.userData.noContact=true;me.userData.noInk=true;W.add(me);return m};
  cloudDeck(6.5,4.4,3.2,11,1.5,.004,'high clouds',.8);const hillFar=hills(6.36,2.6,5,1,.62,0x8fa3b8,'far hills');cloudDeck(6.2,3.6,1.9,23,2,.009,'mid clouds',1.2);
  // aerial perspective: haze veils in front of each hill range, tinted with the horizon colour every sky update
  const hazeTex=(()=>{const c=document.createElement('canvas');c.width=4;c.height=128;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.55,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,.9)');g.fillStyle=gr;g.fillRect(0,0,4,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
  const hazes=[[6.3,2.4,.62],[6.0,1.4,.28]].map(([r,h,o])=>{const m=new THREE.MeshBasicMaterial({map:hazeTex,transparent:true,depthWrite:false,side:THREE.BackSide,opacity:o,fog:false});const me=new THREE.Mesh(sector(r,h,0),m);me.name='haze';me.userData.noInk=true;me.userData.noContact=true;me.renderOrder=-1;W.add(me);return m});
  const hillNear=hills(6.06,1.8,9,1.4,.7,0x4d6440,'near hills');const scud=cloudDeck(5.86,2.6,1.2,37,2.5,.02,'storm scud');
  const sunG=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),new THREE.MeshBasicMaterial({map:softDisc(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:0xfff0c8}));sunG.name='sun glow';sunG.userData.noContact=true;sunG.userData.noInk=true;W.add(sunG);
  const starG=new THREE.BufferGeometry(),sp=[];for(let i=0;i<260;i++){const a=A0+rng()*AL,y=2.5+rng()*5;sp.push(Math.sin(a)*6.55,y,Math.cos(a)*6.55)}starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  const starP=new THREE.Points(starG,new THREE.PointsMaterial({size:.035,color:0xffffff,transparent:true,opacity:0,depthWrite:false}));W.add(starP);
  // ground strip under the sky: grass that gets wet (darker, clearcoated) when it rains; a fence and hedges for scale
  const gr=new THREE.RingGeometry(4.75,6.55,72,4,Math.PI*.5-AL/2,AL);gr.rotateX(-Math.PI/2);
  const rp6=t=>{const c=t.clone();c.repeat.set(7,7);c.needsUpdate=true;return c};const groundM=new THREE.MeshPhysicalMaterial({map:rp6(variation('grass').map),normalMap:rp6(relief('ground').normalMap),normalScale:new THREE.Vector2(1.2,1.2),color:0x2c3a1c,roughness:.95,clearcoat:0,clearcoatRoughness:.08});
  const ground=new THREE.Mesh(gr,groundM);ground.position.y=.02;ground.receiveShadow=true;ground.name='meadow';ground.userData.noContact=true;ground.userData.noInk=true;W.add(ground);
  {const GN=900,blade=new THREE.ConeGeometry(.012,.16,3);blade.translate(0,.08,0);const gm=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.8,sheen:.5,sheenColor:new THREE.Color(0xc8e090)});const tufts=new THREE.InstancedMesh(blade,gm,GN);tufts.name='grass';tufts.userData.noInk=true;tufts.receiveShadow=true;const mm=new THREE.Matrix4(),qq=new THREE.Quaternion(),cc=new THREE.Color();
   for(let i=0;i<GN;i++){const a=A0+rng()*AL,r=4.72+Math.pow(rng(),2.2)*1.75,h=.5+rng()*1.1;qq.setFromEuler(new THREE.Euler((rng()-.5)*.6,rng()*6,(rng()-.5)*.6));mm.compose(V3(Math.sin(a)*r,.02,Math.cos(a)*r),qq,V3(1,h,1));tufts.setMatrixAt(i,mm);tufts.setColorAt(i,cc.setHSL(.2+rng()*.08,.45+rng()*.2,.16+rng()*.14))}W.add(tufts)}
  {const fr=makeMaterial('walnut'),top=new THREE.Mesh(new THREE.TorusGeometry(6.66,.07,8,160,AL),fr);top.rotation.x=Math.PI/2;top.rotation.z=Math.PI/2-(A0+AL);top.position.y=H;top.name='backdrop frame';W.add(top);
   [A0,A0+AL].forEach(a=>{const post=new THREE.Mesh(alignUV(new THREE.BoxGeometry(.16,H,.16)),fr);post.position.set(Math.sin(a)*6.66,H/2,Math.cos(a)*6.66);post.rotation.y=a;post.castShadow=true;W.add(post)})}
  const leaf=makeMaterial({preset:'foliage',color:'#34502a'});leaf.flatShading=false;leaf.normalMap=relief('leather').normalMap;leaf.normalScale.set(1.5,1.5);const fenceM=makeMaterial('darkwood');
  const bushG=(()=>{const g=mergeVertices(new THREE.IcosahedronGeometry(1,4).deleteAttribute('normal').deleteAttribute('uv')),P=g.attributes.position,v=V3();for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);const n=1+.22*Math.sin(v.x*7.1+v.y*3.3)*Math.cos(v.z*6.7-v.y*2.1)+.12*Math.sin(v.x*17+v.z*13);v.multiplyScalar(n);if(v.y<-.3)v.y=-.3-(v.y+.3)*.2;P.setXYZ(i,v.x,v.y,v.z)}g.computeVertexNormals();const uv=[];for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);uv.push(Math.atan2(v.z,v.x)/6.283+.5,v.y*.5+.5)}g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g})();
  for(let i=0;i<14;i++){const a=A0+.06*AL+i/13*AL*.88,r=5.0+rng()*.25,s=.16+rng()*.16;const b=new THREE.Mesh(bushG,leaf);b.position.set(Math.sin(a)*r,s*.3,Math.cos(a)*r);b.scale.set(s*(1+rng()*.5),s*.8,s);b.rotation.y=rng()*6;b.castShadow=true;b.receiveShadow=true;b.userData.noInk=true;W.add(b)}
  for(let i=0;i<=24;i++){const a=A0+.05*AL+i/24*AL*.9,r=5.55;const post=new THREE.Mesh(new THREE.BoxGeometry(.05,.42,.05),fenceM);post.position.set(Math.sin(a)*r,.21,Math.cos(a)*r);post.rotation.y=a;post.castShadow=true;post.userData.noInk=true;W.add(post)}
  [.18,.34].forEach(y=>{const rail=new THREE.Mesh(new THREE.TorusGeometry(5.55,.016,5,96,AL*.9),fenceM);rail.rotation.x=Math.PI/2;rail.rotation.z=Math.PI/2-(A0+.95*AL);rail.position.y=y;rail.userData.noInk=true;W.add(rail)});
  // rain: streaks of varied length, speed and opacity (RGBA vertex colours; the tail fades), splash rings on the meadow
  const RN=760,rp=new Float32Array(RN*6),rc=new Float32Array(RN*8),RD=[];const rainBand=()=>{const a=A0+.03*AL+rng()*AL*.94,r=4.85+rng()*1.55;return[Math.sin(a)*r,Math.cos(a)*r]};
  for(let i=0;i<RN;i++){const [x,z]=rainBand();RD.push({x,z,y:rng()*H,L:.14+rng()*.38,v:6.5+rng()*5,a:.18+rng()*.5});rc.set([.75,.82,.9,0,.85,.9,.97,RD[i].a],i*8)}
  const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(rp,3));rainG.setAttribute('color',new THREE.BufferAttribute(rc,4));
  const rain=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false}));rain.name='rain';rain.frustumCulled=false;W.add(rain);
  const SPN=90,splash=new THREE.InstancedMesh(new THREE.RingGeometry(.6,1,20).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xd8e6f0,transparent:true,opacity:.55,depthWrite:false}),SPN);splash.name='splashes';splash.frustumCulled=false;splash.userData.noInk=true;W.add(splash);const SPL=[];let spI=0;

  // ---------- Goethe weather glass (left) ----------
  const GX=-2.9,GZ=.3,S_MM=60,WALL=.028,body=smooth([[.001,.2],[.5,.24],[.95,.42],[1.2,.8],[1.26,1.25],[1.18,1.8],[.92,2.4],[.55,2.95],[.25,3.3],[.12,3.5],[.07,3.62],[.001,3.66]],5);
  const flask=lathe(shellPts(body,WALL),shell,128);flask.position.set(GX,0,GZ);flask.name='Goethe glass flask';flask.castShadow=false;W.add(flask);
  const rIn=y=>{for(let i=1;i<body.length;i++)if(body[i][1]>=y){const a=body[i-1],b=body[i],t=(y-a[1])/((b[1]-a[1])||1);return a[0]+(b[0]-a[0])*t-WALL}return 0};
  const foot=lathe(smooth([[.001,0],[1.05,0],[1.08,.06],[.98,.1],[.8,.13],[.62,.22],[.52,.26],[.001,.26]],4),walnut,96);foot.position.set(GX,0,GZ);foot.name='flask stand';W.add(foot);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.55,.035,10,64),brass);collar.rotation.x=Math.PI/2;collar.position.set(GX,.27,GZ);W.add(collar);
  // flask water with a wetting (concave) meniscus; its volume barely changes, so it is built once at the fill level
  const WY=1.55,yAtR=[];let V0=0;for(let y=WY;y<3.62;y+=.01){const r=rIn(y);V0+=Math.PI*r*r*.01}
  const A_fl=Math.PI*rIn(WY)**2,RB=.072,a_sp=Math.PI*RB*RB;
  const wprof=[];for(let y=.25;y<=WY+.03;y+=.04)wprof.push([rIn(y)*.995,y]);wprof.push([rIn(WY+.035)*.995,WY+.035]);for(let i=1;i<=8;i++){const t=i/8,rr=rIn(WY)*(1-t);wprof.push([rr,WY+.035*Math.pow(1-t,3)])}
  const fw=lathe([[.001,.25]].concat(wprof),water,96);fw.position.set(GX,0,GZ);fw.name='water in flask';fw.castShadow=false;W.add(fw);
  // spout: a bent tube fused near the bottom, rising vertically to an open flared lip
  const SXp=GX+1.78,TOP=4.75,bend=new THREE.CubicBezierCurve3(V3(GX+1.05,.52,GZ),V3(GX+1.55,.34,GZ),V3(SXp,.42,GZ),V3(SXp,1.05,GZ));const straight=new THREE.LineCurve3(V3(SXp,1.05,GZ),V3(SXp,TOP,GZ));
  const spPath=new THREE.CurvePath();spPath.add(bend);spPath.add(straight);
  const spout=new THREE.Mesh(new THREE.TubeGeometry(spPath,180,RB+WALL,20,false),film);spout.name='spout';spout.castShadow=false;W.add(spout);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(RB+WALL+.012,.022,10,32),shell);lip.rotation.x=Math.PI/2;lip.position.set(SXp,TOP,GZ);W.add(lip);
  const bendW=new THREE.Mesh(new THREE.TubeGeometry(bend,60,RB*.96,16,false),water);bendW.name='water in spout bend';bendW.castShadow=false;W.add(bendW);
  const colG=new THREE.CylinderGeometry(RB*.96,RB*.96,1,20,1,true);colG.translate(0,.5,0);const col=new THREE.Mesh(colG,water);col.position.set(SXp,1.05,GZ);col.name='water column in spout';col.castShadow=false;W.add(col);
  const menG=new THREE.LatheGeometry([[RB*.96,0],[RB*.8,-.025],[RB*.5,-.042],[.001,-.05]].map(([x,y])=>new THREE.Vector2(x,y)),20);const menisc=new THREE.Mesh(menG,water);menisc.name='spout meniscus';W.add(menisc);
  const DN=40,dropM=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,10,8),water,DN);dropM.name='spilled drops';dropM.userData.noInk=true;dropM.frustumCulled=false;W.add(dropM);const drops=[];

  // ---------- storm glass (right) ----------
  const SX=2.8,SZ=.4,SR=.5,SY0=.42,STOP=4.05;
  const tubeOut=smooth([[.001,SY0],[.3,SY0+.02],[.46,SY0+.1],[SR,SY0+.3],[SR,STOP-.2],[SR*.97,STOP]],4);
  const tube=lathe(shellPts(tubeOut,.035),shell,96);tube.position.set(SX,0,SZ);tube.name='storm glass tube';tube.castShadow=false;W.add(tube);
  const sIn=SR-.035,LIQ=STOP-.4;
  const lp=[[.001,SY0+.04],[.28,SY0+.06],[sIn*.97,SY0+.32],[sIn*.995,LIQ+.03]];for(let i=1;i<=8;i++){const t=i/8;lp.push([sIn*.995*(1-t),LIQ+.03*Math.pow(1-t,3)])}
  const liq=lathe(lp,sol,96);liq.position.set(SX,0,SZ);liq.name='camphor solution';liq.castShadow=false;W.add(liq);
  const corkP=lathe([[.001,STOP-.32],[sIn*.98,STOP-.32],[sIn*.995,STOP+.02],[.001,STOP+.02]],cork,48);corkP.position.set(SX,0,SZ);corkP.name='cork';W.add(corkP);
  const capT=lathe(smooth([[.001,STOP+.24],[.3,STOP+.24],[SR+.05,STOP+.2],[SR+.06,STOP+.05],[SR+.07,STOP-.18],[SR+.045,STOP-.2]],4).concat([[SR+.01,STOP-.2],[SR+.01,STOP+.18],[.001,STOP+.18]]).reverse(),brass,64);capT.position.set(SX,0,SZ);capT.name='brass cap';W.add(capT);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.09,24,16),brass);knob.position.set(SX,STOP+.3,SZ);knob.castShadow=true;W.add(knob);
  const baseS=lathe(smooth([[.001,0],[.95,0],[.98,.07],[.85,.12],[.72,.2],[.66,.42],[.6,.44],[.56,.3],[.001,.3]],4),walnut,96);baseS.position.set(SX,0,SZ);baseS.name='storm glass base';W.add(baseS);
  const ringS=new THREE.Mesh(new THREE.TorusGeometry(.64,.03,10,64),brass);ringS.rotation.x=Math.PI/2;ringS.position.set(SX,.44,SZ);W.add(ringS);
  // camphor crystals: fern-like dendrites (instanced elongated shards) + compact crystals settled at the bottom
  const SH=[];const clampIn=(v)=>{const dx=v.x-SX,dz=v.z-SZ,d=Math.hypot(dx,dz),m=sIn-.05;if(d>m){v.x=SX+dx/d*m;v.z=SZ+dz/d*m}return v};
  const qa=new THREE.Quaternion(),up=V3(0,1,0);
  const bm=new THREE.Matrix4(),bx=V3(),by=V3(),bz=V3();let plane=V3(0,0,1);
  const addShard=(pos,dir,len,wid,th,grp)=>{by.copy(dir).normalize();bz.copy(plane).addScaledVector(by,-plane.dot(by)).normalize();bx.crossVectors(by,bz);bm.makeBasis(bx,by,bz);const q=new THREE.Quaternion().setFromRotationMatrix(bm);SH.push({p:clampIn(pos.clone()),q,s:V3(wid,len*.5,wid*.25),th,grp})};
  const frond=(o,dir,len,grp,th0=0,thSpan=1)=>{const side=V3(rng()-.5,0,rng()-.5).cross(dir).normalize();plane=side.clone().cross(dir).normalize();const n=14+Math.floor(rng()*6),d=dir.clone().normalize(),curl=V3(rng()-.5,rng()*.2,rng()-.5).multiplyScalar(.04);let pnt=o.clone();
    for(let i=0;i<n;i++){const t=i/n,seg=len/n;d.add(curl).normalize();const mid=pnt.clone().addScaledVector(d,seg*.5);addShard(mid,d,seg*1.15,.013*(1-.5*t),th0+thSpan*t*.75,grp);
      const ll=len*.3*Math.pow(1-t,.6)*(.75+rng()*.4),sd=side.clone().applyAxisAngle(d,(rng()-.5)*.25);[-1,1].forEach(sg=>{const ld=d.clone().multiplyScalar(.5).addScaledVector(sd,sg*.87).normalize(),m=6;for(let j=0;j<m;j++){const pp=pnt.clone().addScaledVector(ld,ll*(j+.5)/m);addShard(pp,ld,ll/m*1.25,.008*(1-.6*j/m),th0+thSpan*(t*.75+.25*(j+1)/m),grp);if(j%2===1&&t<.7){const bd=ld.clone().multiplyScalar(.5).addScaledVector(d,.87).normalize();addShard(pp.clone().addScaledVector(bd,ll*.08),bd,ll*.16,.005,th0+thSpan*(t*.75+.25*(j+1.5)/m),grp)}}});
      pnt.addScaledVector(d,seg)}};
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2+rng()*.5,r=.1+rng()*.24;const o=V3(SX+Math.cos(a)*r,SY0+.16+rng()*.08,SZ+Math.sin(a)*r);frond(o,V3(Math.cos(a)*(.25+rng()*.35),1,Math.sin(a)*(.25+rng()*.35)),.8+rng()*1.4,0,rng()*.2,.8)}
  for(let i=0;i<5;i++){const a=i/4*Math.PI*2+.4,o=V3(SX+Math.cos(a)*.18,LIQ-.04,SZ+Math.sin(a)*.18);frond(o,V3(Math.cos(a)*.5,-1,Math.sin(a)*.5),.55+rng()*.4,1,0,1)}
  const shards=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),crystM,SH.length);shards.name='camphor crystals';shards.userData.noInk=true;shards.castShadow=false;shards.frustumCulled=false;W.add(shards);
  const BASEN=90,BC=[];for(let i=0;i<BASEN;i++){const a=rng()*Math.PI*2,r=Math.pow(rng(),.7)*(sIn-.1),h=.05*(1-r/sIn)+rng()*.03;BC.push({p:V3(SX+Math.cos(a)*r,SY0+.07+h,SZ+Math.sin(a)*r),q:new THREE.Quaternion().setFromEuler(new THREE.Euler(rng()*3,rng()*3,rng()*3)),s:.012+rng()*.022,th:r/sIn*.8+rng()*.2})}
  const baseC=new THREE.InstancedMesh(new THREE.CylinderGeometry(.6,.6,1.6,6),crystM,BASEN);baseC.name='settled crystals';baseC.userData.noInk=true;baseC.frustumCulled=false;W.add(baseC);
  const specG=new THREE.BufferGeometry(),specN=160,specP=new Float32Array(specN*3);for(let i=0;i<specN;i++){const a=rng()*6.283,r=Math.sqrt(rng())*(sIn-.06);specP.set([SX+Math.cos(a)*r,SY0+.4+rng()*(LIQ-SY0-.5),SZ+Math.sin(a)*r],i*3)}specG.setAttribute('position',new THREE.BufferAttribute(specP,3));
  const specks=new THREE.Points(specG,new THREE.PointsMaterial({size:.02,color:0xffffff,transparent:true,opacity:0,depthWrite:false}));specks.name='suspended microcrystals';W.add(specks);

  // ---------- stick barometer (back): carved walnut case, engraved brass register, mercury tube, thermometer ----------
  const BX=0,BZ=-2.55,PY0=3.35,PH=2.9,PMIN=945,PMAX=1055,yOfP=P=>PY0+(P-PMIN)/(PMAX-PMIN)*PH;
  const cs=new THREE.Shape();cs.moveTo(-.28,.75);cs.lineTo(.28,.75);cs.lineTo(.28,3.05);cs.quadraticCurveTo(.3,3.18,.5,3.22);cs.lineTo(.5,6.35);cs.absarc(0,6.35,.5,0,Math.PI,false);cs.lineTo(-.5,3.22);cs.quadraticCurveTo(-.3,3.18,-.28,3.05);cs.lineTo(-.28,.75);
  const caseG=new THREE.ExtrudeGeometry(cs,{depth:.16,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:3,curveSegments:32});
  const uvb=caseG.attributes.uv;for(let i=0;i<uvb.count;i++)uvb.setXY(i,uvb.getY(i)/2.4,uvb.getX(i)/2.4); // grain runs up the trunk
  const caseM=new THREE.Mesh(caseG,walnut);caseM.position.set(BX,0,BZ-.08);caseM.castShadow=true;caseM.receiveShadow=true;caseM.name='barometer case';W.add(caseM);
  const plinthB=new THREE.Mesh(alignUV(new THREE.BoxGeometry(.9,.12,.5)),walnut);plinthB.position.set(BX,.06,BZ);plinthB.castShadow=true;W.add(plinthB);
  const cist=lathe(smooth([[.001,.12],[.3,.12],[.34,.2],[.3,.34],[.36,.5],[.33,.64],[.24,.72],[.2,.8],[.001,.8]],4),walnut,64);cist.position.set(BX,0,BZ+.1);cist.name='cistern cover';W.add(cist);
  const cistRing=new THREE.Mesh(new THREE.TorusGeometry(.355,.02,8,48),brass);cistRing.rotation.x=Math.PI/2;cistRing.position.set(BX,.5,BZ+.1);W.add(cistRing);
  const fin=lathe(smooth([[.001,0],[.1,0],[.12,.05],[.07,.12],[.11,.22],[.06,.32],[.03,.4],[.001,.42]],5),brass,32);fin.position.set(BX,6.85+.03,BZ);fin.name='finial';W.add(fin);
  // engraved register plate: colour map + roughness(G)/metalness(B) map from one drawing
  const plate=(()=>{const w=512,h=Math.round(512*PH/.82),c1=document.createElement('canvas'),c2=document.createElement('canvas');c1.width=c2.width=w*2;c1.height=c2.height=h*2;const g=c1.getContext('2d'),q=c2.getContext('2d');g.scale(2,2);q.scale(2,2); // drawn at 2× for crisp engraving
    const gb=g.createLinearGradient(0,0,w,0);gb.addColorStop(0,'#c9a35a');gb.addColorStop(.5,'#e4c784');gb.addColorStop(1,'#c29c55');g.fillStyle=gb;g.fillRect(0,0,w,h);
    const r2=mulberry(3);for(let i=0;i<2600;i++){g.fillStyle=`rgba(${r2()<.5?'90,60,20':'255,240,200'},${r2()*.03})`;g.fillRect(0,r2()*h,w,1)}
    q.fillStyle='rgb(0,140,215)';q.fillRect(0,0,w,h);
    const Y=P=>h-(P-PMIN)/(PMAX-PMIN)*h,line=(x0,y0,x1,y1,lw)=>{[g,q].forEach((c,k)=>{c.strokeStyle=k?'rgb(0,235,20)':'#0e0803';c.lineWidth=lw;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke()})};
    const text=(s,x,y,size,al='center',font='Georgia, serif')=>{[g,q].forEach((c,k)=>{c.font=size+'px '+font;c.textAlign=al;c.textBaseline='middle';c.fillStyle=k?'rgb(0,235,20)':'#0e0803';c.fillText(s,x,y)});g.fillStyle='rgba(255,236,190,.35)';g.font=size+'px '+font;g.textAlign=al;g.fillText(s,x+1,y+1.5)};
    const cx0=226,cx1=286;g.fillStyle='#efe9da';g.fillRect(cx0,0,cx1-cx0,h);q.fillStyle='rgb(0,150,0)';q.fillRect(cx0,0,cx1-cx0,h); // silvered channel behind the tube
    line(cx0,0,cx0,h,3);line(cx1,0,cx1,h,3);line(8,0,8,h,2);line(w-8,0,w-8,h,2);
    for(let P=PMIN;P<=PMAX;P++){const y=Y(P),L=P%10===0?46:P%5===0?30:16;line(cx0-L,y,cx0,y,P%10===0?3:1.6);if(P%10===0)text(String(P),cx0-78,y,30)}
    for(let i=Math.ceil(PMIN/33.8639*20);i<=Math.floor(PMAX/33.8639*20);i++){const inHg=i/20,y=Y(inHg*33.8639),big=i%10===0,mid=i%2===0;line(cx1,y,cx1+(big?46:mid?28:14),y,big?3:1.4);if(mid)text(inHg.toFixed(1),cx1+(big?92:80),y,big?30:21)}
    text('hPa',cx0-70,26,26);text('inHg',cx1+80,26,26);
    [['STORMY',965],['RAIN',985],['CHANGE',1000],['FAIR',1020],['SET FAIR',1035],['VERY DRY',1048]].forEach(([s,P])=>text(s,62,Y(P),22,'center','Georgia, serif'));
    const t1=new THREE.CanvasTexture(c1);t1.colorSpace=THREE.SRGBColorSpace;t1.anisotropy=8;const t2=new THREE.CanvasTexture(c2);t2.anisotropy=8;return[t1,t2]})();
  const plateM=new THREE.MeshPhysicalMaterial({map:plate[0],roughnessMap:plate[1],metalnessMap:plate[1],roughness:1,metalness:1,envMapIntensity:1.4});
  const plateMesh=new THREE.Mesh(new THREE.PlaneGeometry(.82,PH),plateM);plateMesh.position.set(BX,PY0+PH/2,BZ+.13);plateMesh.name='engraved scale plates (hPa · inHg)';plateMesh.receiveShadow=true;W.add(plateMesh);
  [[0,PY0+PH+.02,.88,.035],[0,PY0-.02,.88,.035],[-.43,PY0+PH/2,.035,PH+.07],[.43,PY0+PH/2,.035,PH+.07]].forEach(([x,y,w,h])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,.04),brass);b.position.set(BX+x,y,BZ+.15);b.castShadow=true;W.add(b)});
  const regGlass=new THREE.Mesh(new THREE.PlaneGeometry(.84,PH+.04),film);regGlass.position.set(BX,PY0+PH/2,BZ+.24);regGlass.renderOrder=6;W.add(regGlass);
  const tubeX=BX+(256/512-.5)*.82,btube=lathe(shellPts([[.05,PY0-.25],[.05,PY0+PH+.05],[.035,PY0+PH+.12],[.001,PY0+PH+.13]],.012),shell,24);btube.position.set(tubeX,0,BZ+.17);btube.name='barometer tube';btube.castShadow=false;W.add(btube);
  const hgG=new THREE.CylinderGeometry(.036,.036,1,20,1,true);hgG.translate(0,.5,0);const hg=new THREE.Mesh(hgG,merc);hg.position.set(tubeX,PY0-.25,BZ+.17);hg.name='mercury column';W.add(hg);
  const hgTop=new THREE.Mesh(new THREE.SphereGeometry(.036,20,10,0,Math.PI*2,0,Math.PI/2),merc);hgTop.scale.y=.55;hgTop.name='mercury meniscus (convex)';W.add(hgTop);
  const setHand=new THREE.Mesh(new THREE.ConeGeometry(.028,.12,3),brass);setHand.rotation.z=Math.PI/2;setHand.name='set hand (reading 3 h ago)';W.add(setHand);
  // thermometer on the trunk: ivory scale, spirit column
  const thermo=(()=>{const c=document.createElement('canvas');c.width=128;c.height=768;const g=c.getContext('2d');g.fillStyle='#efe6d2';g.fillRect(0,0,128,768);g.strokeStyle='#2b1c0c';g.fillStyle='#2b1c0c';g.textAlign='right';g.textBaseline='middle';g.font='22px Georgia, serif';
    for(let T=-10;T<=40;T++){const y=740-(T+10)/50*712,L=T%10===0?30:T%5===0?20:10;g.lineWidth=T%5===0?2.4:1.2;g.beginPath();g.moveTo(88-L,y);g.lineTo(88,y);g.stroke();if(T%10===0)g.fillText(String(T),50,y)}g.font='20px Georgia, serif';g.fillText('°C',66,14);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t})();
  const TY0=1.25,TH=1.6,thP=new THREE.Mesh(new THREE.PlaneGeometry(.3,TH+.08),new THREE.MeshPhysicalMaterial({map:thermo,roughness:.5,clearcoat:.6}));thP.position.set(BX-.05,TY0+TH/2,BZ+.13);thP.name='thermometer scale';W.add(thP);
  const thT=lathe(shellPts([[.026,TY0-.06],[.026,TY0+TH+.02],[.001,TY0+TH+.05]],.008),shell,16);thT.position.set(BX+.06,0,BZ+.17);thT.castShadow=false;W.add(thT);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),new THREE.MeshPhysicalMaterial({color:0xb01818,roughness:.15,clearcoat:1}));bulb.position.set(BX+.06,TY0-.06,BZ+.17);W.add(bulb);
  const spG=new THREE.CylinderGeometry(.012,.012,1,8);spG.translate(0,.5,0);const spirit=new THREE.Mesh(spG,bulb.material);spirit.position.set(BX+.06,TY0-.06,BZ+.17);spirit.name='thermometer spirit';W.add(spirit);
  // window light from behind (sun through the sky) and a lightning flash
  const sunL=new THREE.DirectionalLight(0xffe6c0,0);sunL.position.set(-1,7,-9);W.add(sunL);W.add(sunL.target);
  const flashL=new THREE.DirectionalLight(0xdfe8ff,0);flashL.position.set(2,9,-8);W.add(flashL);
  const keyL=D.scene.children.find(o=>(o.isDirectionalLight||o.isSpotLight)&&o.castShadow),key0=keyL?keyL.intensity:0;
  // rain on the display case (when the diorama has one): lens-like droplets that grow, stick, then slip down the panes
  const caseObj=D.scene.getObjectByName('glass case');let CD=null;
  if(caseObj){const bb=new THREE.Box3().setFromObject(caseObj),dmM=makeMaterial({preset:'water',color:'#e4f2f6'});dmM.thickness=.05;dmM.normalMap=null;dmM.roughness=.01;dmM.attenuationDistance=20;
    const dm=new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),dmM,90);dm.name='droplets on the case';dm.userData.noInk=true;dm.frustumCulled=false;dm.castShadow=false;W.add(dm);CD={dm,half:(bb.max.x-bb.min.x)/2-.02,top:bb.max.y-.05,L:[]}}

  // ---------- state & physics ----------
  let Pc=p.P,Tc=p.T,P0=p.P0,hs=0,hsEq=0,Pin=p.P0,hist=[],phase=rng()*6,lastTrend=0,overflow=false,bubbled=false,cool=0,lastT=Tc,lastSky=-1,Mb=0,Mf=0,Mt=0,nucl=false,wasCryst=false,cover=.3,rainK=0,raining=false,wet=0,flash=0,hgShown=Pc,setP=Pc,lastSet=0,Gf=0,Gt=0,Gb=0;
  const CLK=10,T0=288.15,eSat=T=>6.112*Math.exp(17.62*T/(243.12+T)),RHOG=998*9.80665/100/1000*S_MM; // hPa per scene unit of water
  const S_=T=>Math.exp(.065*(T-16)),total=()=>p.conc*1.05,mass=()=>Mb+Mf+Mt;
  const PinAt=h=>(P0-eSat(15))*((Tc+273.15)/T0)*(V0/(V0+a_sp*h))+eSat(Tc);
  const solve=()=>{let lo=-4,hi=8;for(let i=0;i<40;i++){const m=(lo+hi)/2,f=PinAt(m)-Pc-RHOG*m*(1+a_sp/A_fl);if(f>0)lo=m;else hi=m}return(lo+hi)/2};
  const ideal_mm=()=>(P0*(Tc+273.15)/T0-Pc)*100/(998*9.80665)*1000;
  hs=hsEq=solve();
  D.label('Goethe weather glass',()=>V3(GX,3.95,GZ));D.label('spout level',()=>V3(SXp,WY+hs+.25,GZ));D.label('trapped air · P_in',()=>V3(GX,2.6,GZ));
  D.label('storm glass',()=>V3(SX,STOP+.65,SZ));D.label('crystals',()=>mass()>.004?V3(SX,.75,SZ):null);D.label('mercury barometer',()=>V3(BX,7.45,BZ));D.label('thermometer',()=>V3(BX+.06,TY0+TH+.25,BZ+.17));
  D.event('glass sealed at '+fmt(P0,4)+' hPa and 15 °C; trapped air now follows P_in = (P₀ − e₀)·(T/T₀)·(V₀/V) + e(T)',V3(GX,2.4,GZ));D.seriesName='outside pressure P (hPa)';
  // ---------- sky / weather rendering ----------
  function drawSky(t){const g=skyCv.getContext('2d'),h=skyCv.height,hour=t%24,elev=Math.sin((hour-6)/12*Math.PI),day=Math.max(0,elev),dusk=Math.exp(-Math.pow(elev/.2,2)),c=cover;
    const top=new THREE.Color().setHSL(.615,.6*(1-c*.8),.045+day*.33*(1-c*.45)+dusk*.04),hor=new THREE.Color().setHSL(.6,.22*(1-c*.6),.08+day*.64*(1-c*.42)).lerp(new THREE.Color().setHSL(.07,.6*(1-c*.7),.42*(1-c*.5)),dusk*.8);
    const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#'+top.getHexString());gr.addColorStop(.75,'#'+top.clone().lerp(hor,.7).getHexString());gr.addColorStop(1,'#'+hor.getHexString());g.fillStyle=gr;g.fillRect(0,0,4,h);skyTex.needsUpdate=true;
    // sun across the backdrop (hidden behind cover), stars at night
    const sa=A0+AL*(.12+.76*clamp((hour-6)/12,0,1)),sy=1.6+day*5.2;sunG.position.set(Math.sin(sa)*6.45,sy,Math.cos(sa)*6.45);sunG.lookAt(0,sy,0);sunG.material.opacity=day>0?(1-c*.95):0;sunG.material.color.setHSL(.1,.8,.6+.2*day);
    starP.material.opacity=(1-Math.min(1,day*4))*(1-c)*.9;
    const lit=.25+day*.75,storm=Math.max(0,(c-.55)/.45);layers.forEach((L,i)=>{L.m.userData.cover.value=clamp(c*(i===2?1.3:1)-(i===2?.45:0),0,1);L.m.color.setRGB(lit*(1-storm*.55)*(i===2?.7:1),lit*(1-storm*.52)*(i===2?.72:1),lit*(1-storm*.45)*(i===2?.78:1))});
    hazes.forEach(m=>m.color.copy(hor));hillFar.color.setHSL(.58,.22*(1-c),.18+.32*day*(1-c*.5));hillNear.color.setHSL(.27,.28*(1-c*.6),.08+.2*day*(1-c*.45));
    sunL.intensity=day*(1-c*.8)*2.2;sunL.color.setHSL(.09,.6*(1-day*.5),.7);sunL.position.set(Math.sin(sa)*8,sy+3,Math.cos(sa)*8);
    if(keyL)keyL.intensity=key0*(1-.35*c);D.scene.environmentIntensity=.85*(1-.3*c)}
  return{orbit:{target:V3(0,2.5,-.3),r:15,ph:1.2,th:.12},
   live(k){if(k==='T'||k==='P'){Pc=p.P;Tc=p.T;return true}if(k==='auto'||k==='conc')return true;if(k==='P0'){P0=p.P0;D.event('re-sealed at '+fmt(P0,4)+' hPa',V3(GX,2.4,GZ));return true}return false},
   step(h){const t=D.t;
    if(p.auto>.5){const target=1010+14*Math.sin(2*Math.PI*t/70+phase)+6*Math.sin(2*Math.PI*t/23+1.3*phase);Pc+=(target-Pc)*Math.min(1,h*.8);Tc=p.T+2.5*Math.sin(2*Math.PI*((t+CLK)%24-9)/24)-(1013-Pc)*.04}
    // Goethe glass: equilibrium with air spring + vapour, then viscous relaxation of the column
    hsEq=solve();hs+=(hsEq-hs)*Math.min(1,h/.15);Pin=PinAt(hs);const y=WY+hs;
    if(y>TOP-.02&&!overflow){overflow=true;D.event('pressure difference '+fmt(Pin-Pc,3)+' hPa pushes water out of the spout (low pressure: storm weather)',V3(SXp,TOP,GZ),0x88c0ff)}if(y<TOP-.2)overflow=false;
    if(y>TOP-.02){hs=TOP-.02-WY;if(rng()<h*14)drops.push({x:SXp+.09,y:TOP,z:GZ,v:0})}
    if(y<.5&&!bubbled){bubbled=true;D.event('high pressure drives the column below the bend: air bubbles into the flask and the glass re-equilibrates',V3(GX+1.4,.45,GZ));P0=Pc*T0/(Tc+273.15)+eSat(15)-eSat(Tc)*T0/(Tc+273.15);hs=solve()}if(y>.9)bubbled=false;
    // storm glass: conserved camphor, temperature-dependent solubility, metastable nucleation
    const c=Math.max(0,total()-mass()),S=S_(Tc),sig=c/S-1,dTdt=(Tc-lastT)/h;lastT=Tc;cool=lerp(cool,dTdt,Math.min(1,h*2));
    if(!nucl&&sig>.04){nucl=true;Mb=.002}
    if(nucl&&sig>0){const g=.55*sig*h,fern=clamp((sig-.04)/.22,.1,.85),top=cool<-.35?clamp(-cool*.5,0,.6):0;Mf+=g*fern*(1-top);Mt+=g*fern*top;Mb+=g*(1-fern)}
    if(sig<0){const k=-.9*sig*h;Mf=Math.max(0,Mf-k*2*Math.pow(Mf+1e-6,.667));Mt=Math.max(0,Mt-k*3.2*Math.pow(Mt+1e-6,.667));Mb=Math.max(0,Mb-k*Math.pow(Mb+1e-6,.667))}
    if(mass()<.0015&&sig<0){Mb=Mf=Mt=0;nucl=false}
    const has=mass()>.02;if(has&&!wasCryst)D.event('solution supersaturated (σ = '+fmt(sig,2)+'): camphor crystals nucleate',V3(SX,.75,SZ));if(!has&&wasCryst)D.event('warming raises solubility: all crystals redissolve, the liquid clears',V3(SX,2,SZ),0x88c0ff);wasCryst=has;
    if(cool<-.6&&Mt>.01&&rng()<h*.4)D.event('rapid cooling grows fine feathery crystals at the top (folklore: "storm coming"; physically a temperature effect)',V3(SX,LIQ-.4,SZ));
    // weather lore with physics: the 3-hour tendency, cloud cover and rain
    hist.push([t,Pc]);while(hist.length&&t-hist[0][0]>3)hist.shift();const tr=hist.length>1?Pc-hist[0][1]:0;
    if(tr<-3&&lastTrend>=-3)D.event('pressure falling '+fmt(-tr,2)+' hPa in 3 h: deteriorating weather likely',V3(tubeX,yOfP(Pc),BZ+.2),0xff9a7a);if(tr>3&&lastTrend<=3)D.event('pressure rising '+fmt(tr,2)+' hPa in 3 h: clearing weather likely',V3(tubeX,yOfP(Pc),BZ+.2),0x88c0ff);lastTrend=tr;
    const coverT=clamp((1021-Pc)/34+clamp(-tr,0,6)*.06-clamp(tr,0,6)*.04,0,1);cover+=(coverT-cover)*Math.min(1,h*.6);
    const rainNow=cover>.68;if(rainNow&&!raining)D.event('rain begins: cloud cover '+Math.round(cover*100)+' % as the low arrives',V3(0,2.5,-5.4),0x88c0ff);if(!rainNow&&raining&&cover<.6)D.event('rain eases as pressure recovers',V3(0,2.5,-5.4));if(rainNow)raining=true;else if(cover<.6)raining=false;
    rainK+=((raining?clamp((cover-.6)*2.5,.25,1):0)-rainK)*Math.min(1,h*1.5);wet=clamp(wet+(raining?h*.5:-h*.12),0,1);
    if(cover>.86&&rng()<h*.25)flash=1;
    // set hand records the reading 3 h ago (like the brass "set" pointer on period barometers)
    if(t-lastSet>3){setP=hist.length?hist[0][1]:Pc;lastSet=t}
   },
   visual(dt){const y=clamp(WY+hs,.45,TOP-.02),vert=y>1.05;
    col.scale.y=Math.max(.001,y-1.05);col.visible=vert;menisc.visible=vert;menisc.position.set(SXp,y,GZ);bendW.visible=y>.62;
    for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.v-=9.8*dt;d.y+=d.v*dt;d.x+=.25*dt;if(d.y<.05)drops.splice(i,1)}while(drops.length>DN)drops.shift();{const m=new THREE.Matrix4();for(let i=0;i<DN;i++){const d=drops[i];if(d)m.makeTranslation(d.x,d.y,d.z);else m.makeScale(0,0,0);dropM.setMatrixAt(i,m)}dropM.instanceMatrix.needsUpdate=true}
    // crystals: shard i is grown when its threshold lies below the group's growth fraction
    const k=Math.min(1,dt*3);Gf+=(clamp(Mf/.35,0,1)-Gf)*k;Gt+=(clamp(Mt/.2,0,1)-Gt)*k;Gb+=(clamp(Mb/.25,0,1)-Gb)*k;
    const m4=new THREE.Matrix4(),sv=V3();for(let i=0;i<SH.length;i++){const s=SH[i],G=s.grp?Gt:Gf,f=clamp((G-s.th)/.08,0,1);if(f<=0){m4.makeScale(0,0,0)}else{sv.copy(s.s).multiplyScalar(f);m4.compose(s.p,s.q,sv)}shards.setMatrixAt(i,m4)}shards.instanceMatrix.needsUpdate=true;
    for(let i=0;i<BASEN;i++){const b=BC[i],f=clamp((Gb*1.1-b.th)/.15,0,1);if(f<=0)m4.makeScale(0,0,0);else{sv.setScalar(b.s*(.4+.6*f));m4.compose(b.p,b.q,sv)}baseC.setMatrixAt(i,m4)}baseC.instanceMatrix.needsUpdate=true;
    const c=Math.max(0,total()-mass()),sig=c/S_(Tc)-1,haze=clamp((sig-.06)/.3,0,1);specks.material.opacity=haze*.8;sol.opacity=.1+haze*.38;sol.color.setRGB(.075+haze*.28,.065+haze*.28,.035+haze*.28);
    // mercury and set hand, thermometer spirit
    hgShown+=(Pc-hgShown)*Math.min(1,dt*4);const yh=yOfP(hgShown);hg.scale.y=Math.max(.01,yh-(PY0-.25));hgTop.position.set(tubeX,yh,BZ+.17);setHand.position.set(tubeX+.09,yOfP(setP),BZ+.2);
    spirit.scale.y=Math.max(.01,TY0+(clamp(Tc,-10,40)+10)/50*TH-(TY0-.06));
    // rain streaks, splashes, wet ground
    rain.material.opacity=rainK;rain.visible=rainK>.01;
    if(rain.visible){const pa=rainG.attributes.position.array,sl=.06;for(let i=0;i<RN;i++){const d=RD[i];d.y-=dt*d.v*(.8+rainK*.4);if(d.y<0){if(rng()<.35*rainK){const s=SPL[spI%SPN]||(SPL[spI%SPN]={});Object.assign(s,{x:d.x,z:d.z,a:0});spI++}const q=rainBand();d.x=q[0];d.z=q[1];d.y+=H}pa[i*6]=d.x+sl*d.L;pa[i*6+1]=d.y+d.L;pa[i*6+2]=d.z;pa[i*6+3]=d.x;pa[i*6+4]=d.y;pa[i*6+5]=d.z}rainG.attributes.position.needsUpdate=true}
    for(let i=0;i<SPN;i++){const s=SPL[i];if(!s||s.a>1){m4.makeScale(0,0,0)}else{s.a+=dt*4;const r=.03+s.a*.1;m4.makeScale(r,1,r);m4.setPosition(s.x,.03,s.z)}splash.setMatrixAt(i,m4)}splash.instanceMatrix.needsUpdate=true;splash.material.opacity=.5*rainK;
    groundM.clearcoat=wet*.9;groundM.roughness=.92-wet*.35;groundM.color.setRGB(.33-.12*wet,.42-.14*wet,.21-.08*wet);
    // sky decks drift at different speeds (motion parallax); storm scud only shows in heavy cover
    layers.forEach(L=>{L.t.offset.x+=dt*L.speed*(1+cover*1.5)});scud.visible=cover>.5;
    flash=Math.max(0,flash-dt*5);flashL.intensity=flash*6;
    if(CD){const L=CD.L,hf=CD.half;if(rainK>.2&&L.length<90&&rng()<dt*30*rainK){const pane=Math.floor(rng()*3);L.push({pane,u:(rng()*2-1)*(hf-.2),y:CD.top*(.35+rng()*.65),r:.012+rng()*.01,v:0,stick:rng()*2})}
      for(let i=L.length-1;i>=0;i--){const d=L[i];d.r=Math.min(.055,d.r+dt*(rainK>.2?.006:-.01));d.stick-=dt;if(d.stick<0&&d.r>.03){d.v=.25+d.r*14;if(rng()<dt*1.5)d.stick=rng()*1.2}else d.v*=.8;d.y-=d.v*dt;if(d.y<.08||d.r<.006)L.splice(i,1)}
      for(let i=0;i<90;i++){const d=L[i];if(!d){m4.makeScale(0,0,0)}else{const r=d.r;if(d.pane===0){m4.makeScale(r,r*1.3,r*.35);m4.setPosition(d.u,d.y,hf+.01)}else{const sx=d.pane===1?-1:1;m4.makeScale(r*.35,r*1.3,r);m4.setPosition(sx*(hf+.01),d.y,d.u)}}CD.dm.setMatrixAt(i,m4)}CD.dm.instanceMatrix.needsUpdate=true}
    const tt=Math.floor(D.t*4);if(tt!==lastSky||flash>0){lastSky=tt;drawSky(D.t+CLK);if(flash>0){const g=skyCv.getContext('2d');g.fillStyle=`rgba(235,240,255,${flash*.7})`;g.fillRect(0,0,4,256);skyTex.needsUpdate=true}}
    D.push(Pc)},
   readouts(){const c=Math.max(0,total()-mass()),sig=c/S_(Tc)-1;const hr=Math.floor((D.t+CLK)%24);return[['time',String(hr).padStart(2,'0')+':00 · day '+(1+Math.floor((D.t+CLK)/24))],['P outside',fmt(Pc,5)+' hPa'],['T air',fmt(Tc,3)+' °C'],['P inside',fmt(Pin,5)+' hPa'],['spout Δh',fmt(hs*S_MM,3)+' mm'],['Δh ideal (P₀T/T₀−P)/ρg',fmt(ideal_mm(),3)+' mm'],['Hg column',fmt(Pc*.750062,4)+' mm'],['solubility S(T)',fmt(S_(Tc),3)],['supersat. σ',fmt(sig,3)],['crystal mass',fmt(mass(),3)],['cloud cover',Math.round(cover*100)+' %']]}}}};
// Camera hints for the director: keys are lowercase substrings of the event text (the same matching lessons use).
DIO.weatherglass.shots={
 'glass sealed at':{target:[-2.3,2.1,.3],dist:6.5},
 're-sealed at':{target:[-2.3,2.1,.3],dist:6.5},
 'pushes water out of the spout':{target:[-1.12,4.4,.3],dist:2.6},
 'air bubbles into the flask':{target:[-1.5,.6,.3],dist:2.6},
 'camphor crystals nucleate':{target:[2.8,1.2,.4],dist:3},
 'all crystals redissolve':{target:[2.8,2,.4],dist:3.6},
 'feathery crystals at the top':{target:[2.8,3.2,.4],dist:2.6},
 'pressure falling':{target:[0,3,-1.2],dist:10},
 'pressure rising':{target:[0,3,-1.2],dist:10},
 'rain begins':{target:[0,2.6,-4.2],dist:8.5},
 'rain eases':{target:[0,2.6,-4.2],dist:8.5}};

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
 build(D,p){const W=D.world,H=2.2,g=9.81;const ful=new THREE.Mesh(new THREE.ConeGeometry(.6,H,3),D.mats.iron);ful.receiveShadow=true;ful.position.set(p.fulcrum,H/2,0);ful.castShadow=true;W.add(ful);
  const grp=new THREE.Group();grp.position.set(p.fulcrum,H+.1,0);W.add(grp);const beam=box(9,.16,.7,D.mats.wood);beam.position.x=-p.fulcrum;grp.add(beam);
  const w1=box(Math.cbrt(p.m1)*.5,Math.cbrt(p.m1)*.5,Math.cbrt(p.m1)*.5,D.mats.lapis),w2=box(Math.cbrt(p.m2)*.5,Math.cbrt(p.m2)*.5,Math.cbrt(p.m2)*.5,D.mats.rubric);w1.position.set(p.x1-p.fulcrum,.08+Math.cbrt(p.m1)*.25,0);w2.position.set(p.x2-p.fulcrum,.08+Math.cbrt(p.m2)*.25,0);grp.add(w1,w2);
  const a1=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,0x88c0ff,.2,.12),a2=new THREE.ArrowHelper(V3(0,-1,0),V3(),1,0xff9a7a,.2,.12);W.add(a1,a2);
  const r1=p.x1-p.fulcrum,r2=p.x2-p.fulcrum,rb=0-p.fulcrum,I=p.m1*r1*r1+p.m2*r2*r2+p.beam*(81/12+rb*rb)+.05;const tq=th=>-g*(p.m1*r1+p.m2*r2+p.beam*rb)*Math.cos(th);
  let th=0,w=0,hit=false,bal=false;const lim=Math.atan2(H-.1,4.5);
  D.label('m₁',()=>w1.getWorldPosition(V3()).add(V3(0,.5,0)),true);D.label('m₂',()=>w2.getWorldPosition(V3()).add(V3(0,.5,0)),true);D.label('fulcrum',()=>V3(p.fulcrum,.4,.8));
  const net=tq(0);if(Math.abs(net)<.05*g){bal=true;D.event('Σ moments ≈ 0: the lever balances (m₁r₁ + m₂r₂ + M·r_beam = 0)',V3(p.fulcrum,H,0),0x88c0ff)}else D.event('net moment '+fmt(net,3)+' N·m: the lever tips '+(net>0?'left':'right'),V3(p.fulcrum,H+.1,0));
  D.seriesName='tilt angle θ (deg)';
  return{orbit:{target:V3(0,2,0),r:12.5,ph:1.2},
   step(h){if(bal)return;const a=tq(th)/I-.6*w;w+=a*h;th+=w*h;if(Math.abs(th)>lim){th=Math.sign(th)*lim;if(!hit){hit=true;D.event('beam strikes the ground, stopped at '+fmt(th*180/Math.PI,2)+'°',V3(p.fulcrum+Math.sign(th)*-4.5,0.1,0))}w=-w*.25}},
   visual(){grp.rotation.z=th;[[a1,w1,p.m1],[a2,w2,p.m2]].forEach(([a,m,ms])=>{const P=m.getWorldPosition(V3());a.position.copy(P);a.setLength(.3+ms*g*.025,.2,.12)});D.push(th*180/Math.PI)},
   readouts(){return[['τ₁ = m₁g r₁',fmt(-p.m1*g*r1,3)+' N·m'],['τ₂ = m₂g r₂',fmt(-p.m2*g*r2,3)+' N·m'],['τ beam',fmt(-p.beam*g*rb,3)+' N·m'],['Σ τ (θ=0)',fmt(net,3)+' N·m'],['θ',fmt(th*180/Math.PI,2)+'°'],['I about fulcrum',fmt(I,3)+' kg·m²']]}}}};

/* --- Reaction A + B ⇌ C --- */
DIO.reaction={params:{NA:[10,120,60,'','molecules A'],NB:[10,120,60,'','molecules B'],Ea:[0,3,.8,'','forward barrier Ea'],Eb:[0,4,2,'','reverse barrier'],T:[.3,3,1,'','temperature']},
 build(D,p){const W=D.world,BX=3.2,BY=2,BZ=2,Y0=BY+.05;const ed=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*BX,2*BY,2*BZ)),new THREE.LineBasicMaterial({color:0xcfa84f}));ed.position.y=Y0;W.add(ed);
  const cols={A:new THREE.Color(0xd2553c),B:new THREE.Color(0x3c78d2),C:new THREE.Color(0x9b5bd0)};const MAX=260;const im=new THREE.InstancedMesh(new THREE.SphereGeometry(1,24,16),makeMaterial({preset:'plastic',color:'#ffffff',roughness:.22}),MAX);im.castShadow=true;im.userData.noInk=true;im.name='molecules';W.add(im);
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
    const nc=cnt('C');hist.push(nc);if(hist.length>240)hist.shift();eqT+=dt;if(!eqd&&eqT>6&&hist.length>200){const a=hist.slice(-200),mn=Math.min(...a),mx=Math.max(...a);if(mx-mn<=Math.max(4,.12*(p.NA+p.NB)/2)){eqd=true;D.event('dynamic equilibrium: forward and reverse rates balance, [C] steady',V3(0,Y0,0),0x88c0ff)}}
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
  const wireM=makeMaterial('copper');for(let i=0;i<4;i++){const w=new THREE.Mesh(new THREE.TubeGeometry(path.curves[i],20,.06,8,false),wireM);w.castShadow=true;W.add(w)}
  const board=box(10.5,.15,6.5,D.mats.wood);board.position.y=.08;board.name='board';W.add(board);
  const bat=cyl(.45,1.6,makeMaterial({preset:'plastic',color:'#1d2a3a',roughness:.3}),48);bat.rotation.z=Math.PI/2;bat.position.set(0,Y+.4,-2.5);bat.name='battery';W.add(bat);const capb=cyl(.2,.15,D.mats.brass,16);capb.rotation.z=Math.PI/2;capb.position.set(.85,Y+.4,-2.5);W.add(capb);
  const res=cyl(.22,1.4,D.mats.ivory,24);res.rotation.x=Math.PI/2;res.position.set(4.5,Y+.1,0);res.name='resistor';W.add(res);[0x8b4513,0x111111,0xd04020,0xcfa84f].forEach((c,i)=>{const b=cyl(.235,.1,makeMaterial({preset:'ceramic',color:'#'+new THREE.Color(c).getHexString()}),32);b.rotation.x=Math.PI/2;b.position.set(4.5,Y+.1,-.45+i*.28);W.add(b)});
  const plM=makeMaterial('steel');plM.emissive=new THREE.Color(0xffb050);plM.emissiveIntensity=0;const pl1=box(.12,1.6,1.4,plM),pl2=box(.12,1.6,1.4,plM.clone());pl1.position.set(-4.75,Y+.8,0);pl2.position.set(-4.25,Y+.8,0);pl1.name='capacitor plate +';pl2.name='capacitor plate −';W.add(pl1,pl2);
  const sw=box(1,.08,.12,D.mats.brass);sw.position.set(-2,Y+.3,2.5);sw.name='switch';W.add(sw);
  const NE=70,el_=new THREE.InstancedMesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshBasicMaterial({color:0x9fe0ff}),NE);el_.name='electrons';el_.userData.noInk=true;W.add(el_);const eu=Array.from({length:NE},(_,i)=>i/NE);
  const glow=new THREE.PointLight(0xffb050,0,4);glow.position.set(-4.5,Y+.8,0);W.add(glow);
  let q=p.closed>.5?0:p.C*1e-3*p.V,lastSw=p.closed,tau=p.R*1e3*p.C*1e-3,t0=0,m1=false,m5=false;const Cf=p.C*1e-3,R=p.R*1e3;
  D.label('battery · ε',()=>V3(0,Y+1.2,-2.5));D.label('resistor · R',()=>V3(4.5,Y+.8,0));D.label('capacitor · C',()=>V3(-4.5,Y+1.9,0));D.label('switch',()=>V3(-2,Y+.7,2.5));
  D.event((p.closed>.5?'switch closed: capacitor charges through R':'switch open to battery: capacitor discharges through R')+', τ = RC = '+fmt(tau,3)+' s',V3(-2,Y+.3,2.5));D.seriesName='capacitor voltage V_C (V)';
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
  const lensG=new THREE.SphereGeometry(1.5,48,32);lensG.scale(fl>0?.12:.05,1,1);const lens=new THREE.Mesh(lensG,makeMaterial('solidglass'));lens.material.thickness=fl>0?.36:.15;lens.material.ior=1.52;lens.position.y=Y;lens.name=fl>0?'converging lens':'diverging lens';W.add(lens);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.5,.05,8,48),D.mats.brass);ring.rotation.y=Math.PI/2;ring.position.y=Y;W.add(ring);const post=cyl(.06,1.6,D.mats.brass);post.position.set(0,Y-.8,0);W.add(post);
  [fl,-fl].forEach((x,i)=>{const m=ball(.08,D.mats.rubric);m.position.set(x,Y,0);m.name='focal point '+(i?'F':'F′');W.add(m)});
  const arrow=(mat)=>{const g=new THREE.Group();const s=cyl(.05,1,mat,10);s.geometry.translate(0,.5,0);const h=new THREE.Mesh(new THREE.ConeGeometry(.14,.3,16),mat);g.add(s,h);g.userData={s,h};return g};
  const objA=arrow(makeMaterial({preset:'plastic',color:'#ffc56b',emissive:'#553300',emissiveIntensity:.6}));objA.name='object';W.add(objA);const imgM=new THREE.MeshStandardMaterial({color:0x9fd0ff,emissive:0x113355,transparent:true,opacity:.9});const imgA=arrow(imgM);imgA.name='image';W.add(imgA);
  const setA=(a,x,h)=>{a.position.set(x,Y,0);const s=Math.abs(h);a.userData.s.scale.y=Math.max(.01,s-.3);a.userData.h.position.y=Math.max(.01,s-.3)+.15;a.rotation.z=h<0?Math.PI:0};
  const rayM=[0xffd27a,0xff9a7a,0x9fe0ff].map(c=>new THREE.LineBasicMaterial({color:c,transparent:true,opacity:.95})),dashM=new THREE.LineDashedMaterial({color:0xcccccc,dashSize:.15,gapSize:.1,transparent:true,opacity:.6});
  const rays=[0,1,2].map(i=>{const l=new THREE.Line(new THREE.BufferGeometry(),rayM[i]);l.frustumCulled=false;W.add(l);return l}),backs=[0,1,2].map(()=>{const l=new THREE.Line(new THREE.BufferGeometry(),dashM);l.frustumCulled=false;W.add(l);return l});
  let dObj=p.do,regime=null,di=0,hi=0;
  const solve=()=>{di=Math.abs(dObj-fl)<1e-3?Infinity:1/(1/fl-1/dObj);hi=-p.ho*di/dObj;const r=!isFinite(di)?'inf':di>0?'real':'virtual';if(r!==regime){if(regime!==null)D.event(r==='inf'?'object at the focal point: rays leave parallel, image at infinity':r==='real'?'object beyond F: real, inverted image on the far side':'object inside F (or diverging lens): virtual, upright image',V3(-dObj,Y,0),0x88c0ff);regime=r}};
  const setLine=(l,pts)=>{l.geometry.setFromPoints(pts);if(l.material.isLineDashedMaterial)l.computeLineDistances()};
  D.label('object',()=>V3(-dObj,Y+p.ho+.3,0));D.label('image',()=>isFinite(di)&&Math.abs(di)<7?V3(di,Y+hi+(hi<0?-.3:.3),0):null);D.label('F',()=>V3(-fl,Y-.35,0),true);D.label("F′",()=>V3(fl,Y-.35,0),true);
  D.seriesName='image distance dᵢ';solve();D.event('1/f = 1/d_o + 1/d_i  with f = '+fmt(fl,3),V3(0,Y,0));
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


// ---------- shot hints for the camera director ----------
// DIO.<model>.shots = { '<lowercase substring of the event text>': {target:[x,y,z], dist} } — the same substring
// matching lessons use for "until":"event:<id>". Every built-in event also carries a world position (ev.pos).
const SH_=(o)=>Object.fromEntries(Object.entries(o).map(([k,[x,y,z,d]])=>[k,{target:[x,y,z],dist:d}]));
DIO.pendulum.shots=SH_({'bob released':[0,3.4,0,9],'turning point':[0,3.4,0,7.5],'lowest point':[0,2.6,0,6]});
DIO.spring.shots=SH_({'turning point x':[0,1,0,8],'passes equilibrium':[0,1,0,7]});
DIO.projectile.shots=SH_({'launch':[-5,1,0,6],'apex':[0,3,0,11],'lands':[2,.5,0,9]});
DIO.orbit.shots=SH_({'perihelion':[0,2.4,0,9],'aphelion':[0,2.4,0,11],'unbound':[0,2.4,0,15],'falls into the star':[0,2.4,0,6],'left the diorama':[0,2.4,0,16]});
DIO.collision.shots=SH_({'collision:':[0,.6,0,6]});
DIO.incline.shots=SH_({'tan θ':[0,2.2,0,10],'reaches the bottom':[3,.6,0,6]});
DIO.wave.shots=SH_({'period':[0,2.4,0,10],'λ snapped':[0,2.4,0,11]});
DIO.gas.shots=SH_({'heated/cooled':[0,2,0,9]});
DIO.surface.shots=SH_({'ball placed':[0,2.6,0,11],'ball dropped':[0,2.6,0,9],'at rest':[0,2.2,0,7]});
DIO.doublependulum.shots=SH_({'two pendulums released':[0,4,0,11],'chaos':[0,3.6,0,9],'lower arm flips':[0,4,0,9]});
DIO.lever.shots=SH_({'moments ≈ 0':[0,2.2,0,9],'net moment':[0,2.2,0,10],'beam strikes the ground':[3,.6,0,6]});
DIO.reaction.shots=SH_({'collision with ke':[0,2,0,8],'dynamic equilibrium':[0,2,0,10]});
DIO.efield.shots=SH_({'test charge released':[0,2.6,0,9],'captured':[0,2.6,0,6],'escapes':[0,2.6,0,12]});
DIO.circuit.shots=SH_({'switch closed':[-2,.6,2.5,5],'switch open':[-2,.6,2.5,5],'switch flipped':[-2,.6,2.5,5],'t = τ':[-4.5,1.2,0,5],'t = 5τ':[-4.5,1.2,0,5]});
DIO.lens.shots=SH_({'1/f = 1/d_o':[0,2.2,0,10],'focal point: rays leave parallel':[0,2.2,0,9],'real, inverted image':[1.5,2.2,0,8],'virtual, upright image':[-1,2.2,0,8]});
