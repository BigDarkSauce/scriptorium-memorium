// Built-in simulation models (ported from Scriptorium v2), running on the new engine through a small adapter.
// Each model: {params:{key:[min,max,default,unit,label]}, build(D,p) -> {step(h), visual(dt), readouts(), orbit?, live?(k), click?(raycaster), hist?, histCurve?}}
// D.label(text, getPos, obj) marks a significant actor (guided tour, lesson focus); obj (an Object3D) is the mesh/group the
// director frames by its bounding box. D.label(text, getPos, true) is a symbol pin (θ, F, …). Unlabelled meshes are scenic decor.
// Optional sim.clock(t) returns a display string for the model's own time base; DIO.<model>.shots / .flows give camera
// hints and process arrows keyed by lowercase event-text substrings.
import * as T from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useEnvironment } from './environments.js';
import { PLANS } from './plans.js';
import { clamp, fmt, lerp, mod, mulberry, compile } from '../util.js';
import { makeMaterial, thinGlass } from '../gfx/materials.js';
import { aaaMaterial } from '../gfx/aaa.js';
import { treeForest } from './trees.js';
import { alignUV, cloudDensity, hillRidge, softDisc, relief, variation } from '../gfx/proc.js';
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
function trail(n, color) { const g = new T.BufferGeometry(); const a = new Float32Array(n * 3); g.setAttribute('position', new T.BufferAttribute(a, 3)); g.setDrawRange(0, 0); const l = new T.Line(g, new T.LineBasicMaterial({ color, transparent: true, opacity: .85 })); l.userData = { n, count: 0, a, isTrail: true }; l.add = function (v) { const u = this.userData; if (u.count < u.n) { const o = u.count * 3; u.a[o] = v.x; u.a[o + 1] = v.y; u.a[o + 2] = v.z; u.count++; } else { u.a.copyWithin(0, 3); const o = (u.n - 1) * 3; u.a[o] = v.x; u.a[o + 1] = v.y; u.a[o + 2] = v.z; } this.geometry.setDrawRange(0, u.count); this.geometry.attributes.position.needsUpdate = true; return this; }; l.frustumCulled = false; return l; }
function lineFrom(points, color, dashed) { const g = new T.BufferGeometry().setFromPoints(points); const m = dashed ? new T.LineDashedMaterial({ color, dashSize: .2, gapSize: .15 }) : new T.LineBasicMaterial({ color }); const l = new T.Line(g, m); if (dashed) l.computeLineDistances(); return l; }
// Vector helpers (velocity, force, gradient arrows) share one look: a solid shaft and a cone of fixed thickness and head
// size at any length (ArrowHelper's 1 px line and per-model head sizes read as different weights), unlit, no ink outline,
// no shadow. Same API as ArrowHelper (setDirection, setLength; the head arguments are ignored). alen(q, ref, max) maps a
// quantity to a length proportional to q up to ref (= max), then saturating to at most 1.25 × max, never below .28.
const ARW = { r: .026, hr: .072, hl: .2 }, ARW_SHAFT = new T.CylinderGeometry(1, 1, 1, 10).translate(0, .5, 0), ARW_HEAD = new T.ConeGeometry(1, 1, 16).translate(0, -.5, 0);
ARW_SHAFT.userData.shared = ARW_HEAD.userData.shared = true;
const _UP = new T.Vector3(0, 1, 0), _dn = new T.Vector3();
const vecMuted = o => { for (let r = o.parent; r; r = r.parent) if (r.userData && r.userData.vecMute) return true; return false; };   // any ancestor (the diorama's scene, wherever it is mounted)
class VecArrow extends T.Group {
  constructor(dir = V3(0, 1, 0), origin = V3(0, 0, 0), len = 1, color = 0xffd27a) {
    super(); const m = new T.MeshBasicMaterial({ color }); this.position.copy(origin);
    this.shaft = new T.Mesh(ARW_SHAFT, m); this.head = new T.Mesh(ARW_HEAD, m);
    [this.shaft, this.head].forEach(o => { o.userData.noInk = true; o.castShadow = false; o.receiveShadow = false; o.userData.noContact = true; this.add(o); });
    this.setDirection(dir); this.setLength(len);
  }
  setDirection(d) { if (d.y > .99999) this.quaternion.set(0, 0, 0, 1); else if (d.y < -.99999) this.quaternion.set(1, 0, 0, 0); else this.quaternion.setFromUnitVectors(_UP, _dn.copy(d).normalize()); return this; }
  setLength(L) { const on = !vecMuted(this); if (this.shaft.visible !== on) this.shaft.visible = this.head.visible = on;   // muted while the director's guides draw the same quantity
    L = Math.max(L, .05); const hl = Math.min(ARW.hl, L * .45); this.shaft.scale.set(ARW.r, Math.max(1e-3, L - hl), ARW.r); this.head.scale.set(ARW.hr, hl, ARW.hr); this.head.position.y = L; return this; }
  setColor(c) { this.shaft.material.color.set(c); return this; }
  // the mute is also checked every frame (the renderer updates every matrix before it draws): a model paused while its
  // instruction is read never calls setLength, and its arrow must still step aside for the guide drawing the same quantity
  updateMatrixWorld(force) { const on = !vecMuted(this); if (this.shaft.visible !== on) this.shaft.visible = this.head.visible = on; super.updateMatrixWorld(force); }
}
function vecArrow(dir, origin, len, color) { return new VecArrow(dir, origin, len, color); }
const alen = (q, ref, max = 1.3) => { const r = Math.abs(q) / Math.max(ref, 1e-9); return Math.max(.28, max * (r <= 1 ? r : 1 + .25 * Math.tanh((r - 1) / .5))); };
export const HELPERS = { THREE, V3, cyl, ball, box, trail, lineFrom, canvasTex, woodMat, vecArrow, alen };
export const DIO = {};




// ---------- toolkit shared by the built-in models ----------
// Readouts use FIXED decimals (no width jitter while a value changes) and a true minus sign.
const fx=(v,d=2)=>{if(typeof v!=='number'||!isFinite(v))return '—';const s=(Math.abs(v)<.5*Math.pow(10,-d)?0:v).toFixed(d);return s.charAt(0)==='-'?'−'+s.slice(1):s};
const DEG=180/Math.PI;
function freeTree(o,keep){o.traverse(m=>{if(m.geometry&&!m.geometry.userData.shared)m.geometry.dispose();if(m.material)[].concat(m.material).forEach(x=>{if(!keep.has(x))x.dispose()});if(m.isInstancedMesh)m.dispose()})}
// stage(D, preset, envOpts): picks the setting that suits the subject (unless the author chose one), frees the previous
// build's GPU resources when the world is rebuilt, and returns small helpers:
//  part(name, parent, actor) a named group (the Objects list reads "stand", "bob · m", …); put(o, name, parent)
//  guides  one group for helper lines (trails, arrows, rays): listed once, hidden together
//  at(f)   a label anchor that writes into its own vector (no per-frame allocation)
//  ev(text, pos, {color, sound})  an event; sound is an audio.js effect name (see the scene.js patch in the report)
function stage(D,preset,envOpts={}){
  const W=D.world;
  if(!W.userData.frees){W.userData.frees=true;const keep=new Set(Object.values(D.mats)),clear=W.clear.bind(W);W.clear=function(){for(const c of this.children)freeTree(c,keep);return clear()}}
  const R=useEnvironment(D.scene,preset,envOpts,D.spec)||{};
  const part=(name,parent=W,actor=false)=>{const g=new T.Group();g.name=name;g.userData.label=name;if(actor)g.userData.role='actor';parent.add(g);return g};
  const put=(o,name,parent=W)=>{if(name)o.name=name;parent.add(o);return o};
  const guides=part('guides (arrows, traces)');guides.userData.noContact=true;
  const at=f=>{const v=new T.Vector3();return()=>f(v)};
  const ev=(text,pos,o={})=>D.event(text,pos,o.color,o);
  return {W,R,part,put,guides,at,ev,own:R.preset===preset};
}
// the point on the horizontal plane y = y0 that the default view sees at screen position (sx, sy) ∈ [−1, 1]²
// (used to set a foreground object at the frame edge, so the world reads as continuing past the frame)
function groundAt(o,sx,sy,y0=0,aspect=1.6){const ph=o.ph??1.12,th=o.th??.5,dir=V3(Math.sin(ph)*Math.sin(th),Math.cos(ph),Math.sin(ph)*Math.cos(th)),cam=o.target.clone().addScaledVector(dir,o.r);
  const fwd=dir.clone().negate(),right=V3(0,0,0).crossVectors(fwd,V3(0,1,0)).normalize(),up=V3(0,0,0).crossVectors(right,fwd),t=Math.tan(20/DEG);
  const ray=fwd.addScaledVector(right,sx*t*aspect).addScaledVector(up,sy*t).normalize();return cam.addScaledVector(ray,(y0-cam.y)/ray.y)}
const inDisc=(p,r=6.5)=>{const d=Math.hypot(p.x,p.z);if(d>r){p.x*=r/d;p.z*=r/d}return p};
// key light: move the environment's key to a new place (spot lights keep their illuminance at the target)
function moveKey(R,pos,color){const k=R.sun;if(!k)return;const tg=k.target?k.target.position:V3(0,1.2,0);if(k.isSpotLight){const d0=k.position.distanceTo(tg),d1=V3(...pos).distanceTo(tg);k.intensity*=d1*d1/(d0*d0);k.shadow.camera.near=Math.max(.5,d1-9);k.shadow.camera.far=d1+9}k.position.set(...pos);if(color!=null)k.color.set(color)}
// canvas texture helper (sRGB, anisotropic)
function ctex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t}
// a dial face (gauge, stopwatch, meter): ticks from a0 to a1 (radians, clockwise from up), numbers, a caption
function dialTex({n=10,sub=5,a0=-2.36,a1=2.36,labels=[],caption='',bg='#efe7d4',ink='#22180e',S=512}={}){return ctex(S,S,(g,w)=>{const c=w/2;g.fillStyle=bg;g.beginPath();g.arc(c,c,c-2,0,7);g.fill();g.strokeStyle=ink;g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';
  for(let i=0;i<=n*sub;i++){const a=a0+(a1-a0)*i/(n*sub),big=i%sub===0,r0=c*(big?.72:.8),r1=c*.88;g.lineWidth=big?5:2;g.beginPath();g.moveTo(c+Math.sin(a)*r0,c-Math.cos(a)*r0);g.lineTo(c+Math.sin(a)*r1,c-Math.cos(a)*r1);g.stroke()}
  g.font='600 '+Math.round(S*.075)+'px Georgia, serif';labels.forEach((s,i)=>{const a=a0+(a1-a0)*i/(labels.length-1);g.fillText(s,c+Math.sin(a)*c*.58,c-Math.cos(a)*c*.58)});
  g.font='italic '+Math.round(S*.06)+'px Georgia, serif';g.fillText(caption,c,c*1.42)})}
// a pointer that turns in its dial plane
function needle(len,mat){const g=new T.Group(),b=new T.Mesh(new T.BoxGeometry(.02,len,.008),mat);b.position.y=len*.42;g.add(b);const hub=new T.Mesh(new T.CylinderGeometry(.035,.035,.02,16).rotateX(Math.PI/2),mat);g.add(hub);return g}
// a stopwatch lying on its back (foreground prop for the timing models)
function stopwatch(s=1){const g=new T.Group();g.name='stopwatch';const ch=makeMaterial('chrome'),case_=new T.Mesh(new T.CylinderGeometry(.42*s,.42*s,.12*s,48),ch);case_.position.y=.06*s;case_.castShadow=true;g.add(case_);
  const face=new T.Mesh(new T.CircleGeometry(.37*s,48),new T.MeshPhysicalMaterial({map:dialTex({n:12,sub:5,a0:0,a1:Math.PI*2,labels:['60','5','10','15','20','25','30','35','40','45','50','55','60'],caption:'1/5 sec'}),roughness:.35,clearcoat:1}));face.rotation.x=-Math.PI/2;face.position.y=.121*s;g.add(face);
  const crown=new T.Mesh(new T.CylinderGeometry(.06*s,.06*s,.12*s,16),ch);crown.position.set(0,.06*s,-.48*s);crown.rotation.x=Math.PI/2;g.add(crown);const ring=new T.Mesh(new T.TorusGeometry(.09*s,.02*s,8,20),ch);ring.position.set(0,.06*s,-.58*s);g.add(ring);
  const hand=new T.Mesh(new T.BoxGeometry(.012*s,.004*s,.3*s),new T.MeshBasicMaterial({color:0x9c2a1a}));hand.position.set(0,.125*s,-.12*s);g.add(hand);return g}
// elliptic integral K(k) by the arithmetic–geometric mean (exact pendulum period)
function ellK(k){let a=1,b=Math.sqrt(1-k*k);for(let i=0;i<20;i++){const a1=(a+b)/2;b=Math.sqrt(a*b);a=a1}return Math.PI/(2*a)}
// satin finish for large horizontal boards: a softer clearcoat, so the key light makes a sheen, not a white hotspot
function satin(m){const c=m.clone();c.clearcoat=Math.min(c.clearcoat||0,.3);c.clearcoatRoughness=.6;c.roughness=Math.max(c.roughness,.72);return c}
// countryside around an outdoor plinth: hedgerow trees beyond the plinth and far hills in the haze, so the frame has
// a middle and a far plane (aerial perspective comes from the landscape fog)
function countryside(W,seed=3,camTh=null){const skip=camTh==null?null:a=>Math.abs(Math.atan2(Math.sin(a-camTh),Math.cos(a-camTh)))<1.35; // keep trees out of the camera's side
  const g=new T.Group();g.name='countryside (background)';const r=mulberry(seed),leaf=makeMaterial({preset:'foliage',color:'#3d5a2c'}),bark=makeMaterial('bark'),grass=aaaMaterial('meadow',{tile:2.4,depth:.05,moss:1,bound:{type:'ring',x:0,z:0,rIn:7.6,rOut:120}}); // meadow soil + grass with relief (js/gfx/aaa.js)
  const field=new T.Mesh(new T.RingGeometry(7.6,120,96,3).rotateX(-Math.PI/2),grass);field.position.y=-1.02;field.receiveShadow=true;g.add(field);
  // procedural broadleaf + pine forest (js/dio/trees.js): instanced, 2 draw calls per variant; shadows land in the sun's outer cascades
  const NT=34,broad=[],pines=[];
  for(let i=0;i<NT;i++){const a=r()*Math.PI*2;if(skip&&skip(a))continue;const d=10+r()*9,s=.8+r()*1.1;(r()<.33?pines:broad).push({x:Math.sin(a)*d,y:-1,z:Math.cos(a)*d,h:s*2.6,ry:r()*6.28})}
  if(broad.length)g.add(treeForest('oak',broad,{color:'#3d5a2c',seed}));if(pines.length)g.add(treeForest('pine',pines,{seed:seed+7}));
  const hill=new T.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),hm=new T.MeshStandardMaterial({color:0x4a6040,roughness:1});
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2+r()*.4,d=60+r()*40,h=new T.Mesh(hill,hm);h.castShadow=h.receiveShadow=true;h.scale.set(18+r()*20,5+r()*9,14+r()*10);h.position.set(Math.sin(a)*d,-1.1,Math.cos(a)*d);g.add(h)}
  g.traverse(o=>{o.userData.noInk=true;o.userData.noContact=true});W.add(g);return g}
// shots helper: target may be a function (moving bodies); dist is for the base lens
const SHOT=(target,dist)=>({target,dist});


/* --- Pendulum: a brass bob on a cord from a knife-edge pivot, on an oak stand in the studio ---
   θ̈ = −(g/L) sin θ − c θ̇ (RK4 at h ≤ 1/480 s). Small-angle twin: θ̈ = −(g/L) θ − c θ̇ (symplectic Euler).
   Exact period without damping: T = 4√(L/g)·K(sin(θ₀/2)) (elliptic integral); small swings T₀ = 2π√(L/g).
   Damped small swings decay as e^(−ct/2): the amplitude halves after 2 ln 2 / c. Scene: cord drawn 1.2 + 0.95·L units. */
const PEN={};
DIO.pendulum={params:{L:[.5,4,2,'m','string length'],g:[1,25,9.81,'m/s²','gravity'],theta0:[2,178,40,'°','release angle'],damping:[0,.6,0,'1/s','damping']},
 build(D,p){const {W,R,part,put,guides,at,ev,own}=stage(D,'studio');
  const piv=V3(0,5.6,0),Lv=1.2+p.L*.95,BR=.38,FZ=-.95,oak=D.mats.wood,brass=D.mats.brass,steel=makeMaterial('steel');
  const orbit={target:V3(0,3.3,0),r:14.5,ph:1.2,th:.42};
  // oak stand behind the swing plane: base board, two posts, cross bar, and a steel bracket out to the pivot
  const ST=part('oak stand');
  put(box(6.6,.2,1.2,satin(oak)),'base board',ST).position.set(0,.1,FZ);
  [-2.7,2.7].forEach(x=>{const c=box(.32,piv.y+.2,.32,oak);c.position.set(x,.2+(piv.y+.2)/2,FZ);ST.add(c);const f=box(.5,.1,1.1,oak);f.position.set(x,.25,FZ);ST.add(f)});
  put(box(5.9,.26,.36,oak),'cross bar',ST).position.set(0,piv.y+.46,FZ);
  put(box(.26,.18,Math.abs(FZ)+.25,steel),'pivot bracket',ST).position.set(0,piv.y+.3,FZ/2+.06);
  const PV=part('pivot',W,true);
  const knife=put(new T.Mesh(new T.CylinderGeometry(.11,.11,.5,3).rotateX(Math.PI/2).rotateZ(Math.PI),steel),'knife edge',PV);knife.position.copy(piv).y+=.09;knife.castShadow=true;
  const axle=put(ball(.07,brass),'pivot pin',PV);axle.position.copy(piv);
  // protractor: an engraved brass half-disc behind the swing, centred on the pivot
  const PR=part('angle scale (protractor)');
  {const tex=ctex(1024,512,(g,w,h)=>{g.clearRect(0,0,w,h);const cx=w/2,cy=0,r=w/2-6;g.fillStyle='#d6b46a';g.beginPath();g.arc(cx,cy,r,0,Math.PI);g.fill();g.fillStyle='#120b05';g.beginPath();g.arc(cx,cy,r*.42,0,Math.PI);g.fill();
    g.strokeStyle='#2a1a08';g.fillStyle='#2a1a08';g.textAlign='center';g.textBaseline='middle';g.font='600 30px Georgia, serif';
    for(let a=-90;a<=90;a++){const t=(90+a)/DEG,big=a%10===0,mid=a%5===0,r0=r*(big?.8:mid?.86:.9);g.lineWidth=big?4:2;g.beginPath();g.moveTo(cx+Math.cos(t)*r0,cy+Math.sin(t)*r0);g.lineTo(cx+Math.cos(t)*r*.97,cy+Math.sin(t)*r*.97);g.stroke();if(big&&a%30===0)g.fillText(Math.abs(a)+'°',cx+Math.cos(t)*r*.68,cy+Math.sin(t)*r*.68)}});
   const m=new T.MeshPhysicalMaterial({map:tex,metalness:.85,roughness:.38,alphaTest:.5,side:T.DoubleSide,envMapIntensity:1.2});const pl=put(new T.Mesh(new T.PlaneGeometry(2.6,1.3),m),'brass protractor',PR);pl.position.set(0,piv.y-.65,-.42);pl.receiveShadow=true}
  // the pendulum: a group at the pivot, turned by θ, carries the cord and the bob (no per-frame scaling)
  const SW=part('pendulum',W,true);SW.position.copy(piv);
  const cordM=makeMaterial({preset:'fabric',color:'#e6d8b8',roughness:.9});
  const cord=put(cyl(.014,Lv-BR,cordM,8),'string · L',SW);cord.position.y=-(Lv-BR)/2;
  const BOB=part('bob',SW);BOB.position.y=-Lv;
  const bob=put(ball(BR,brass),'brass bob',BOB);put(new T.Mesh(new T.TorusGeometry(.06,.018,8,20),steel),'hook',BOB).position.y=BR+.02;
  put(cyl(.05,.12,brass),'bob neck',BOB).position.y=BR-.02;
  const GH=part('small-angle model',W,true);GH.position.copy(piv);
  const ghost=put(ball(BR*.85,new T.MeshPhysicalMaterial({color:0x6aa0e0,transparent:true,opacity:.3,roughness:.2,depthWrite:false})),'small-angle bob',GH);ghost.position.set(0,-Lv,-.32);ghost.castShadow=false;
  // helpers: trail, vertical reference, the θ arc
  const tr=put(trail(260,0xffc56b),'trail',guides);
  put(lineFrom([piv,V3(0,piv.y-Lv-.6,0)],0x8f733a,true),'vertical reference',guides);
  const arcG=new T.BufferGeometry();arcG.setAttribute('position',new T.BufferAttribute(new Float32Array(41*3),3));const arc=put(new T.Line(arcG,new T.LineBasicMaterial({color:0xffd27a})),'θ arc',guides);arc.frustumCulled=false;
  // foreground: a stopwatch on the baize at the lower-right frame edge
  {const s=put(stopwatch(1.1),'stopwatch (foreground)');s.position.copy(inDisc(groundAt(orbit,.8,-.84),6.2));s.rotation.y=-.6}
  let th=p.theta0/DEG,w=0,gth=th,gw=0,lastW=0,lastTh=th,turns=[],Tm=NaN,half=false,firstT=false,pA=Math.abs(th),pT=0;const k=p.g/p.L,c=p.damping,th0=th;
  const T0=2*Math.PI*Math.sqrt(p.L/p.g),Tex=4*Math.sqrt(p.L/p.g)*ellK(Math.sin(th0/2));
  const bobW=v=>v.set(piv.x+Lv*Math.sin(th),piv.y-Lv*Math.cos(th),0),bp=V3(0,0,0);
  PEN.bob=()=>bobW(V3(0,0,0));PEN.Lv=Lv;PEN.piv=piv;
  D.label('bob · m',at(v=>{bobW(v);v.y+=.5;return v}),BOB);D.label('string · L',at(v=>v.set(piv.x+Lv*.5*Math.sin(th),piv.y-Lv*.5*Math.cos(th),0)),cord);
  D.label('θ',at(v=>v.set(piv.x+1.05*Math.sin(th/2),piv.y-1.05*Math.cos(th/2),0)),true);D.label('pivot',at(v=>v.copy(piv).setY(piv.y+.5)),PV);
  D.label('small-angle model',at(v=>v.set(piv.x+Lv*Math.sin(gth),piv.y-Lv*Math.cos(gth)-.6,-.32)),GH);
  D.label('angle scale',at(v=>v.set(-1.25,piv.y-.15,-.42)),PR);
  D.seriesName='θ(t) in degrees';ev('bob released from rest at θ₀ = '+fx(p.theta0,1)+'°',bobW(V3(0,0,0)),{sound:'whoosh'});
  return{orbit,
   step(h){// RK4 on (θ, ω) without temporary arrays
    const f=(a,b)=>-k*Math.sin(a)-c*b;
    const k1a=w,k1b=f(th,w),k2a=w+h/2*k1b,k2b=f(th+h/2*k1a,w+h/2*k1b),k3a=w+h/2*k2b,k3b=f(th+h/2*k2a,w+h/2*k2b),k4a=w+h*k3b,k4b=f(th+h*k3a,w+h*k3b);
    th+=h/6*(k1a+2*k2a+2*k3a+k4a);w+=h/6*(k1b+2*k2b+2*k3b+k4b);
    gw+=(-k*gth-c*gw)*h;gth+=gw*h;
    if(lastW!==0&&Math.sign(w)!==Math.sign(lastW)&&Math.abs(th)>1e-3){turns.push(D.t);if(turns.length>2)Tm=turns.at(-1)-turns.at(-3);if(turns.length>6)turns.shift();
     ev('turning point: ω = 0, θ = '+fx(th*DEG,1)+'°',bobW(bp),{sound:'tick'});
     if(!firstT&&isFinite(Tm)){firstT=true;ev('period measured: T = '+fx(Tm,3)+' s (exact 4√(L/g)·K = '+fx(Tex,3)+' s; small-angle T₀ = '+fx(T0,3)+' s)',bobW(bp),{sound:'chime',color:0x88c0ff})}
     const A=Math.abs(th);if(c>0&&!half&&A<th0/2){half=true;const th_=pT+(D.t-pT)*Math.log(pA/(th0/2))/Math.log(pA/A);ev('amplitude halved (to '+fx(th0/2*DEG,1)+'°) by t ≈ '+fx(th_,2)+' s, read between swings (small-swing theory 2 ln2 / c = '+fx(2*Math.LN2/c,2)+' s)',bobW(bp),{sound:'tick'})}pA=A;pT=D.t}
    if(Math.sign(th)!==Math.sign(lastTh)&&lastTh!==0)ev('lowest point: speed v = Lω = '+fx(Math.abs(p.L*w),2)+' m/s',V3(piv.x,piv.y-Lv,0),{color:0x88c0ff,sound:'whoosh'});
    lastW=w;lastTh=th},
   visual(){SW.rotation.z=th;GH.rotation.z=gth;tr.add(bobW(bp));D.push(th*DEG);
    {const sep=Lv*Math.hypot(Math.sin(gth)-Math.sin(th),Math.cos(gth)-Math.cos(th)),k=Math.min(1,Math.max(0,(sep-BR*1.6)/(BR*1.4)));ghost.material.opacity=.32*k*k*(3-2*k);ghost.visible=k>.01}   // the small-angle ghost shows only once it has drifted clear of the real bob (no grey crescent peeking out behind it)
    const a=arcG.attributes.position;for(let i=0;i<=40;i++){const s=th*i/40;a.setXYZ(i,piv.x+.9*Math.sin(s),piv.y-.9*Math.cos(s),.02)}a.needsUpdate=true},
   readouts(){const E=.5*p.L*p.L*w*w+p.g*p.L*(1-Math.cos(th));return[['θ',fx(th*DEG,1)+'°'],['ω',fx(w,2)+' rad/s'],['T measured',isFinite(Tm)?fx(Tm,3)+' s':'…'],['T exact 4√(L/g)·K',fx(Tex,3)+' s'],['T₀ = 2π√(L/g)',fx(T0,3)+' s'],['T/T₀',isFinite(Tm)?fx(Tm/T0,3):'…'],['E/m',fx(E,3)+' J/kg']]}}}};
{const B=()=>PEN.bob?PEN.bob():V3(0,2,0),whole=()=>[0,(PEN.piv?PEN.piv.y:5.6)-(PEN.Lv||3.1)*.55,0];
 DIO.pendulum.shots={'bob released':SHOT(whole,10.5),'turning point':SHOT(()=>B().toArray(),5),'lowest point':SHOT(whole,9.5),'period measured':SHOT(whole,10),'amplitude halved':SHOT(whole,10)};
 DIO.pendulum.flows={
  'bob released':[{from:()=>B().add(V3(0,.5,0)),to:()=>B().lerp(PEN.piv,.4),label:'the cord pulls toward the pivot'},{from:()=>B().add(V3(.6,0,0)),to:()=>B().add(V3(.6,-1.2,0)),label:'gravity pulls straight down'}],
  'lowest point':[{from:()=>B().add(V3(-1.4,.9,0)),to:()=>B().add(V3(-.3,.2,0)),label:'height turned into speed'}],
  'turning point':[{from:()=>B(),to:()=>V3(0,(PEN.piv?PEN.piv.y:5.6)-(PEN.Lv||3.1),0),label:'gravity along the arc restarts the swing'}],
  'period measured':[{from:[-2.2,1.2,1.5],to:()=>B(),label:'one full swing: there and back'}]};}

/* --- Spring: a brass cart on a steel track, tied to an oak wall by a steel coil spring ---
   m ẍ = −k x − c ẋ (symplectic Euler at 480 Hz: energy stays bounded). T = 2π√(m/k) without damping;
   damped: x ∝ e^(−ct/2m), amplitude halves after 2m ln 2 / c. Scene: 1 m = 2.2 units along the track. */
const SPR={};
// a coil spring whose length changes every frame: the tube is regenerated in place (a helix's normal points to its axis)
function helixSpring(turns,R,r,mat,spt=18,sides=8){
  const nr=turns*spt+1,N=nr*sides,pos=new Float32Array(N*3),nor=new Float32Array(N*3),uv=new Float32Array(N*2),idx=[];
  for(let i=0;i<nr-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;idx.push(a,c,b,b,c,d)}
  for(let i=0;i<nr;i++)for(let j=0;j<sides;j++){uv[(i*sides+j)*2]=i/spt;uv[(i*sides+j)*2+1]=j/sides}
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));
  const m=new T.Mesh(g,mat);m.castShadow=true;m.frustumCulled=false;
  m.setLength=L=>{const w=2*Math.PI*turns;for(let i=0;i<nr;i++){const t=i/(nr-1),ph=w*t,cx=L*t,cy=R*Math.cos(ph),cz=R*Math.sin(ph);let tx=L,ty=-R*w*Math.sin(ph),tz=R*w*Math.cos(ph);const tl=Math.hypot(tx,ty,tz);tx/=tl;ty/=tl;tz/=tl;
    const nx=0,ny=-Math.cos(ph),nz=-Math.sin(ph),bx=ty*nz-tz*ny,by=tz*nx-tx*nz,bz=tx*ny-ty*nx;
    for(let j=0;j<sides;j++){const s=j/sides*2*Math.PI,ox=Math.cos(s)*nx+Math.sin(s)*bx,oy=Math.cos(s)*ny+Math.sin(s)*by,oz=Math.cos(s)*nz+Math.sin(s)*bz,o=(i*sides+j)*3;pos[o]=cx+r*ox;pos[o+1]=cy+r*oy;pos[o+2]=cz+r*oz;nor[o]=ox;nor[o+1]=oy;nor[o+2]=oz}}
   g.attributes.position.needsUpdate=true;g.attributes.normal.needsUpdate=true;g.computeBoundingSphere()};
  m.setLength(1);return m}
DIO.spring={params:{k:[1,60,12,'N/m','spring constant'],m:[.2,5,1,'kg','mass'],c:[0,3,0,'kg/s','damping'],x0:[-1,1,.7,'m','initial stretch']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'studio');
  const wallX=-5,S_=2.2,TY=.77,YB=.42,oak=D.mats.wood,walnut=makeMaterial('walnut'),steel=makeMaterial('steel'),brass=D.mats.brass;
  const orbit={target:V3(0,1.1,0),r:12.5,ph:1.17,th:.32};
  const BS=part('track and wall');
  put(box(11.6,.18,1.5,satin(walnut)),'base board',BS).position.set(.3,.09,0);
  [-.32,.32].forEach(z=>{const r=put(box(11,.07,.08,steel),'rail',BS);r.position.set(.35,.215,z)});
  const wall=put(box(.5,2.7,1.5,oak),'oak wall',BS);wall.position.set(wallX-.05,1.35+.18,0);
  const plate=put(box(.04,.5,.5,brass),'anchor plate',BS);plate.position.set(wallX+.22,TY,0);
  // metre scale along the track: the instrument the displacement is read from
  const SC=part('metre scale',W,true);
  {const tex=ctex(2048,96,(g,w,h)=>{g.fillStyle='#efe6d2';g.fillRect(0,0,w,h);g.fillStyle='#24170b';g.strokeStyle='#24170b';g.textAlign='center';g.font='600 34px Georgia, serif';
    for(let cm=-200;cm<=200;cm+=5){const x=w/2+cm/100*S_/9.6*w,big=cm%50===0;g.lineWidth=big?4:2;g.beginPath();g.moveTo(x,0);g.lineTo(x,big?44:cm%10===0?30:18);g.stroke();if(big)g.fillText((cm/100).toFixed(1),x,74)}});
   const s=put(new T.Mesh(new T.PlaneGeometry(9.6,.3),new T.MeshPhysicalMaterial({map:tex,roughness:.55,clearcoat:.4})),'scale strip',SC);s.rotation.x=-Math.PI/2;s.position.set(0,.183,.58)}
  const ptr=put(new T.Mesh(new T.ConeGeometry(.07,.22,3),brass),'equilibrium pointer',SC);ptr.position.set(0,.3,.58);ptr.rotation.x=Math.PI;
  // the cart: a brass mass on four rubber wheels
  const sz=.6+Math.cbrt(p.m)*.45,CA=part('mass · m',W,true);
  put(box(sz,sz,sz*.9,brass),'brass mass',CA).position.y=YB+sz/2;
  const rub=makeMaterial('rubber');[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([a,b])=>{const wh=cyl(.1,.08,rub,20);wh.rotation.x=Math.PI/2;wh.position.set(a*sz*.32,.35,b*.32);CA.add(wh)});
  put(new T.Mesh(new T.TorusGeometry(.07,.02,8,16),steel),'hook',CA).position.set(-sz/2-.04,TY,0);
  const coil=put(helixSpring(14,.26,.035,steel),'spring · k',W);coil.userData.role='actor';coil.position.set(wallX+.24,TY,0);
  // helpers: equilibrium line
  put(lineFrom([V3(0,.2,.58),V3(0,2.2,.58)],0x8f733a,true),'x = 0 line',guides);
  {const s=put(stopwatch(1),'stopwatch (foreground)');s.position.copy(inDisc(groundAt(orbit,-.86,-.84),6.2));s.rotation.y=.7}
  let x=p.x0,v=0,lv=0,lx=x,turns=[],Tm=NaN,first=false,half=false,pA=Math.abs(p.x0),pT=0;const ex=x=>x*S_,A0=Math.abs(p.x0),w0=Math.sqrt(p.k/p.m),Td=p.c<2*Math.sqrt(p.k*p.m)?2*Math.PI/Math.sqrt(p.k/p.m-(p.c/(2*p.m))**2):Infinity;
  const mp=v=>v.set(ex(x),YB+sz*.5,0);
  SPR.mass=()=>mp(V3(0,0,0));SPR.sz=sz;
  D.label('mass · m',at(v=>mp(v).setY(YB+sz+.35)),CA);D.label('spring · k',at(v=>v.set((wallX+ex(x))/2,TY+.75,0)),coil);D.label('metre scale · x = 0',at(v=>v.set(0,2.4,.58)),SC);
  D.seriesName='x(t) in metres';
  return{orbit,
   step(h){const a=(-p.k*x-p.c*v)/p.m;v+=a*h;x+=v*h;const P=V3(0,0,0);
    if(lv!==0&&Math.sign(v)!==Math.sign(lv)){turns.push(D.t);if(turns.length>2)Tm=turns.at(-1)-turns.at(-3);if(turns.length>6)turns.shift();ev('turning point x = '+fx(x,3)+' m: v = 0, all energy potential (½kx² = '+fx(.5*p.k*x*x,3)+' J)',mp(P),{sound:'boing'});
     if(!first&&isFinite(Tm)){first=true;ev('period measured: T = '+fx(Tm,3)+' s (theory '+(p.c>0?'2π/ω_d = '+fx(Td,3):'2π√(m/k) = '+fx(2*Math.PI/w0,3))+' s)',mp(P),{sound:'chime',color:0x88c0ff})}
     const A=Math.abs(x);if(p.c>0&&!half&&A<A0/2){half=true;const th_=pT+(D.t-pT)*Math.log(pA/(A0/2))/Math.log(pA/A);ev('amplitude halved (to '+fx(A0/2,3)+' m) by t ≈ '+fx(th_,2)+' s, read between swings (theory 2m ln2 / c = '+fx(2*p.m*Math.LN2/p.c,2)+' s)',mp(P),{sound:'tick'})}pA=A;pT=D.t}
    if(Math.sign(x)!==Math.sign(lx)&&lx!==0)ev('passes equilibrium: v = '+fx(v,3)+' m/s, all energy kinetic (½mv² = '+fx(.5*p.m*v*v,3)+' J)',V3(0,YB+sz*.5,0),{color:0x88c0ff,sound:'whoosh'});lv=v;lx=x},
   visual(){CA.position.x=ex(x);const L=ex(x)-sz/2-.04-(wallX+.24);coil.setLength(Math.max(.2,L));D.push(x)},
   readouts(){const KE=.5*p.m*v*v,PE=.5*p.k*x*x;return[['x',fx(x,3)+' m'],['v',fx(v,3)+' m/s'],['KE',fx(KE,3)+' J'],['PE',fx(PE,3)+' J'],['E',fx(KE+PE,3)+' J'],['T measured',isFinite(Tm)?fx(Tm,3)+' s':'…'],['T = 2π√(m/k)',fx(2*Math.PI/w0,3)+' s']]}}}};
{const M=()=>SPR.mass?SPR.mass():V3(0,1,0);
 DIO.spring.shots={'turning point x':SHOT(()=>[M().x*.5-2.5,1,0],7.5),'passes equilibrium':SHOT([-2,1,0],8),'period measured':SHOT([-.5,1,0],10),'amplitude halved':SHOT([-.5,1,0],10)};
 DIO.spring.flows={
  'turning point x':[{from:()=>M().add(V3(0,1.1,.6)),to:()=>V3(-1.6,.95,.6),label:'the stretched spring pulls the mass back'}],
  'passes equilibrium':[{from:()=>M().add(V3(-1.2,.9,.6)),to:()=>M().add(V3(.2,.9,.6)),label:'no force here, but full speed carries it on'}],
  'period measured':[{from:[-4.5,1.9,.6],to:()=>M().add(V3(0,.6,0)),label:'one full oscillation'}]};}

/* --- Projectile: a field cannon on a meadow, morning sun ---
   ẍ = −b ẋ, ÿ = −g − b ẏ (linear drag b; symplectic Euler at 480 Hz; landing interpolated to y = 0).
   Without drag: R = v₀² sin 2θ / g, H = v₀² sin²θ / 2g, flight time 2 v₀ sin θ / g. The range is drawn 10 units long. */
const PRJ={};
DIO.projectile={params:{v0:[2,60,20,'m/s','launch speed'],angle:[5,85,45,'°','launch angle'],g:[1,25,9.81,'m/s²','gravity'],drag:[0,1,0,'1/s','linear drag']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'landscape',{time:10.2});
  const a=p.angle/DEG,Rr=p.v0*p.v0*Math.sin(2*a)/p.g,Hm=p.v0*p.v0*Math.sin(a)**2/(2*p.g),Tf=2*p.v0*Math.sin(a)/p.g,sc=Math.min(10/Rr,4.5/Hm),X0=-5,Y0=.62;
  const orbit={target:V3(0,1.9,0),r:15.5,ph:1.3,th:.38};
  const oak=D.mats.wood,iron=D.mats.iron,brass=D.mats.brass;countryside(W,5,orbit.th);
  // cannon: two oak cheeks on an axle, spoked wheels, iron barrel on trunnions at the elevation angle
  const CN=part('cannon',W,true);CN.position.set(X0,0,0);
  [-.32,.32].forEach(z=>{const ch=box(1.5,.36,.1,oak);ch.position.set(-.25,.42,z);ch.rotation.z=.18;CN.add(ch);
   const wh=new T.Group();wh.position.set(0,.42,z*1.6);CN.add(wh);const rim=new T.Mesh(new T.TorusGeometry(.4,.045,10,32),oak);rim.castShadow=true;wh.add(rim);const tire=new T.Mesh(new T.TorusGeometry(.42,.02,8,32),iron);wh.add(tire);
   for(let i=0;i<8;i++){const s=cyl(.02,.8,oak,8);s.rotation.z=i/8*Math.PI;wh.add(s)}const hub=cyl(.08,.14,iron,16);hub.rotation.x=Math.PI/2;wh.add(hub)});
  put(cyl(.05,1.1,iron,12),'axle',CN).rotation.x=Math.PI/2;CN.children.at(-1).position.y=.42;
  const BR=part('barrel',CN);BR.position.set(0,Y0,0);BR.rotation.z=a;
  {const prof=[[.001,-.42],[.19,-.42],[.22,-.36],[.2,-.3],[.18,.2],[.15,.95],[.17,1.0],[.17,1.08],[.13,1.1],[.1,1.1],[.1,.5],[.001,.5]].map(([r,y])=>new T.Vector2(r,y));const bg=new T.LatheGeometry(prof,40);bg.rotateZ(-Math.PI/2);const bm=put(new T.Mesh(bg,iron),'iron barrel',BR);bm.castShadow=true;
   const cas=put(ball(.12,iron),'cascabel',BR);cas.position.x=-.5;const tr_=cyl(.06,.56,iron,12);tr_.rotation.x=Math.PI/2;put(tr_,'trunnions',BR)}
  put(box(.5,.18,.5,oak),'trail block',CN).position.set(-1.05,.12,0);
  // the field: stakes every "nice" distance with plates, a white tape along the line of flight, a flag at the no-drag range
  const FD=part('range markers');
  const step=[1,2,5,10,20,50,100].find(s=>Rr/s<=7)||200,plateM=n=>new T.MeshPhysicalMaterial({map:ctex(256,128,(g,w,h)=>{g.fillStyle='#f2ead6';g.fillRect(0,0,w,h);g.strokeStyle='#5a3a1a';g.lineWidth=8;g.strokeRect(4,4,w-8,h-8);g.fillStyle='#2a1a0c';g.font='600 64px Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.fillText(n+' m',w/2,h/2+4)}),roughness:.7});
  for(let d=step;d<=Rr*1.15&&d*sc<12.4;d+=step){const x=X0+d*sc;if(Math.hypot(x,.95)>6.8)break;const st=cyl(.03,.5,oak,8);st.position.set(x,.25,.95);FD.add(st);const pl=new T.Mesh(new T.PlaneGeometry(.42,.21),plateM(d));pl.position.set(x,.52,.98);pl.castShadow=true;FD.add(pl)}
  {const tape=put(new T.Mesh(new T.PlaneGeometry(Math.min(11.6,Rr*sc+1),.06),makeMaterial({preset:'fabric',color:'#f4efe2'})),'measuring tape',FD);tape.rotation.x=-Math.PI/2;tape.position.set(X0+Math.min(11.6,Rr*sc+1)/2,.012,.95)}
  const FL=part('flag at the no-drag range',W,true);FL.position.set(X0+Rr*sc,0,-.6);put(cyl(.025,1.4,oak,8),'flag pole',FL).position.y=.7;
  {const fl=put(new T.Mesh(new T.PlaneGeometry(.5,.3),makeMaterial({preset:'fabric',color:'#b2382a',side:'double'})),'flag',FL);fl.position.set(.26,1.22,0)}
  // the ball
  const BL=part('ball',W,true);const b=put(ball(.17,iron),'cannon ball',BL);
  const tr=put(trail(600,0xffc56b),'trail',guides);
  const ideal=[];for(let i=0;i<=80;i++){const x=Rr*i/80,y=x*Math.tan(a)-p.g*x*x/(2*p.v0*p.v0*Math.cos(a)**2);ideal.push(V3(X0+x*sc,Y0+y*sc,0))}const idealLine=put(lineFrom(ideal,0x88aadd,true),'no-drag parabola',guides);
  const vArrow=put(vecArrow(V3(1,0,0),V3(0,0,0),1,0xffd27a,.3,.18),'velocity arrow',guides);
  // foreground: a pyramid of shot and a powder keg at the lower-left frame edge
  {const F=part('shot pile (foreground)'),q=inDisc(groundAt(orbit,-.8,-.86),6.1);F.position.copy(q);[[0,0],[.36,0],[.18,.31],[.18,.1,.29]].forEach(([x,z,y=0])=>{const s=ball(.17,iron);s.position.set(x,.17+y,z);F.add(s)});
   const keg=cyl(.3,.6,oak,24);keg.position.set(-.6,.3,-.25);F.add(keg);[.1,.5].forEach(y=>{const h=new T.Mesh(new T.TorusGeometry(.305,.018,6,32),iron);h.rotation.x=Math.PI/2;h.position.set(-.6,y,-.25);F.add(h)})}
  let x,y,vx,vy,state,wait,apex,tf;const reset=()=>{x=0;y=0;vx=p.v0*Math.cos(a);vy=p.v0*Math.sin(a);state=1;wait=0;apex=false;tf=0;ev('launch: v₀ = '+fx(p.v0,1)+' m/s at '+fx(p.angle,1)+'°',V3(X0,Y0,0),{sound:'thud'})};reset();
  const wp=v=>v.set(X0+x*sc,Y0+y*sc,0),tmp=V3(0,0,0);
  PRJ.ball=()=>wp(V3(0,0,0));PRJ.vel=()=>V3(vx,vy,0);PRJ.v0=p.v0;PRJ.g=p.g;PRJ.a=a;PRJ.X0=X0;PRJ.span=Rr*sc;PRJ.H=Hm*sc;PRJ.Y0=Y0;
  D.label('ball',at(v=>wp(v).setY(v.y+.4)),BL);D.label('v',at(v=>{wp(v);const s=Math.hypot(vx,vy)||1;return v.set(v.x+vx/s*1.1,v.y+vy/s*1.1,0)}),true);{const ip=ideal[60].clone().setY(ideal[60].y+.3);D.label('no-drag parabola',()=>ip,idealLine)}
  D.label('cannon',at(v=>v.set(X0-.3,1.5,0)),CN);D.label('flag at the no-drag range R',at(v=>v.set(X0+Rr*sc,1.7,-.6)),FL);
  D.seriesName='height y(t) in metres';
  return{orbit,
   step(h){if(state===1){const pvy=vy,px=x,py=y;vx+=-p.drag*vx*h;vy+=(-p.g-p.drag*vy)*h;x+=vx*h;y+=vy*h;tf+=h;
     if(!apex&&pvy>0&&vy<=0){apex=true;ev('apex: vᵧ = 0 at t = '+fx(tf,2)+' s, height '+fx(y,2)+' m (no-drag H = '+fx(Hm,2)+' m); vₓ = '+fx(vx,2)+' m/s carries on',wp(tmp),{sound:'tick'})}
     if(y<0){const u=py/(py-y);x=px+(x-px)*u;tf-=h*(1-u);y=0;state=2;ev('lands after '+fx(tf,2)+' s: range '+fx(x,2)+' m (no-drag R = '+fx(Rr,2)+' m in '+fx(Tf,2)+' s)',wp(tmp),{color:0x88c0ff,sound:'thud'})}}
    else{wait+=h;if(wait>1.6){tr.userData.count=0;reset()}}},
   visual(){wp(b.position);if(state===1)tr.add(b.position);vArrow.position.copy(b.position);const s=Math.hypot(vx,vy)||1;vArrow.setDirection(tmp.set(vx/s,vy/s,0));vArrow.setLength(alen(s,p.v0,1.5));D.push(y)},
   readouts(){return[['x',fx(x,2)+' m'],['y',fx(y,2)+' m'],['vₓ',fx(vx,2)+' m/s'],['vᵧ',fx(vy,2)+' m/s'],['t',fx(tf,2)+' s'],['R no drag',fx(Rr,2)+' m'],['H no drag',fx(Hm,2)+' m']]}}}};
{const B=()=>PRJ.ball?PRJ.ball():V3(0,1,0);
 DIO.projectile.shots={'launch':SHOT(()=>[(PRJ.X0??-5)+1.2,1.4,0],6.5),'apex':SHOT(()=>[B().x,Math.max(1.6,B().y*.6),0],12),'lands':SHOT(()=>[B().x-2,1,0],8.5)};
 DIO.projectile.flows={
  // quantity arrows ({at, vec, ref}) start at the ball and are as long as the quantity (vec / ref of the director's arrow length)
  'launch':[{at:()=>V3((PRJ.X0??-5)+Math.cos(PRJ.a??.8)*1.1,(PRJ.Y0??.62)+Math.sin(PRJ.a??.8)*1.1,0),vec:()=>V3(Math.cos(PRJ.a??.8),Math.sin(PRJ.a??.8),0),ref:1,rim:4,label:'the charge gives the ball v₀ along the barrel',short:'v₀ along the barrel'}],
  'apex':[{at:B,vec:()=>V3(PRJ.vel?PRJ.vel().x:1,0,0),ref:()=>PRJ.v0||1,label:'sideways speed never changes (no drag)',short:'vₓ constant'},{at:B,vec:()=>V3(0,-.75,0),ref:1,label:'gravity only changes the vertical speed',short:'g changes vᵧ only'}],
  'lands':[{from:()=>V3(PRJ.X0??-5,.25,.95),to:()=>B().setZ(.95).setY(.25),label:'range R'}]};}

/* --- Orbit: a planet around a star in space; the star is the key light ---
   r̈ = −GM r/|r|³ (symplectic Euler at 480 Hz: energy and angular momentum stay bounded). Specific energy
   ε = v²/2 − GM/r, semi-major axis a = −GM/2ε, eccentricity e = √(1 + 2εL²/GM²), Kepler: T = 2π√(a³/GM).
   Kepler II: dA/dt = L/2, so wedges swept in equal times (T/12) have equal areas. */
const ORB={};
DIO.orbit={params:{GM:[2,40,12,'u³/s²','gravitational parameter'],r0:[1.5,5,3,'u','start radius'],vfactor:[.3,1.7,.8,'× v_circ','launch speed']},
 build(D,p){const {W,R,part,put,guides,at,ev,own}=stage(D,'cosmos');const Y=2.4,SR=.55,PR=.27;
  const orbit={target:V3(0,Y,0),r:16,ph:.92,th:.35};
  if(own){if(R.sun){R.sun.intensity=.06;R.sun.castShadow=false}if(R.rim)R.rim.intensity=.12;if(R.hemi)R.hemi.intensity=.02;D.scene.environmentIntensity=.12}
  // the star: an emissive sphere bright enough to bloom, a corona, and the point light that lights the planet
  const SG=part('star · M',W,true);SG.position.y=Y;
  const surf=ctex(512,256,(g,w,h)=>{const r=mulberry(9);g.fillStyle='#ffd27a';g.fillRect(0,0,w,h);for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?'255,240,190':'200,110,30'},${.1+r()*.25})`;g.beginPath();g.arc(r()*w,r()*h,1+r()*6,0,7);g.fill()}});
  const star=put(new T.Mesh(new T.SphereGeometry(SR,48,32),new T.MeshBasicMaterial({map:surf,color:new T.Color(3.2,2.4,1.5),toneMapped:false})),'photosphere',SG);
  const glow=put(new T.Sprite(new T.SpriteMaterial({map:canvasTex(256,256,(g)=>{const r=g.createRadialGradient(128,128,10,128,128,128);r.addColorStop(0,'rgba(255,230,160,1)');r.addColorStop(.25,'rgba(255,180,80,.55)');r.addColorStop(.6,'rgba(255,120,40,.12)');r.addColorStop(1,'rgba(255,100,20,0)');g.fillStyle=r;g.fillRect(0,0,256,256)}),blending:T.AdditiveBlending,depthWrite:false})),'corona',SG);glow.scale.set(4.2,4.2,1);
  const sl=new T.PointLight(0xffe0b0,own?70:25,0,2);SG.add(sl);
  if(!own){const ped=cyl(.08,Y-.5,D.mats.brass);ped.position.y=-(Y-.5)/2-.5;SG.add(ped)} // in a studio it stands on an orrery post
  // the planet: banded ocean world with clouds, tilted axis, turning
  const PG=part('planet · m',W,true);
  const ptex=ctex(512,256,(g,w,h)=>{const r=mulberry(21);g.fillStyle='#1d4f8a';g.fillRect(0,0,w,h);for(let i=0;i<60;i++){g.fillStyle=r()<.6?'#4f7a3a':'#8a7a4a';g.beginPath();g.ellipse(r()*w,h*(.2+r()*.6),10+r()*40,6+r()*18,r()*3,0,7);g.fill()}g.fillStyle='#f2f4f6';g.fillRect(0,0,w,h*.07);g.fillRect(0,h*.93,w,h*.07);for(let i=0;i<120;i++){g.fillStyle='rgba(255,255,255,'+(.2+r()*.4)+')';g.beginPath();g.ellipse(r()*w,r()*h,8+r()*30,2+r()*5,0,0,7);g.fill()}});
  const pl=put(new T.Mesh(new T.SphereGeometry(PR,48,32),new T.MeshPhysicalMaterial({map:ptex,roughness:.6,clearcoat:.3,clearcoatRoughness:.4})),'planet surface',PG);pl.rotation.z=.4;pl.castShadow=false;
  // helpers: trail, ideal ellipse, radius line, velocity arrow, equal-area wedges (preallocated ring of 12)
  const tr=put(trail(1500,0x88c0ff),'trail',guides);
  let x=p.r0,z=0;const vc=Math.sqrt(p.GM/p.r0);let vx=0,vz=-p.vfactor*vc;const L0=x*vz-z*vx,E0=.5*(vx*vx+vz*vz)-p.GM/p.r0,bound=E0<0;
  const aS=bound?-p.GM/(2*E0):Infinity,ecc=Math.sqrt(Math.max(0,1+2*E0*L0*L0/(p.GM*p.GM))),Tk=bound?2*Math.PI*Math.sqrt(aS**3/p.GM):Infinity;
  if(bound){const pts=[],rp=aS*(1-ecc),ra=aS*(1+ecc),ap=p.vfactor<1?Math.PI:0;for(let i=0;i<=180;i++){const nu=i/180*2*Math.PI,r=aS*(1-ecc*ecc)/(1+ecc*Math.cos(nu));pts.push(V3(r*Math.cos(nu+ap)*(p.vfactor<1?1:1),Y,-r*Math.sin(nu+ap)))}put(lineFrom(pts,0x6a7fb0,true),'Kepler ellipse',guides)}
  const rline=put(lineFrom([V3(0,Y,0),V3(x,Y,z)],0x8f733a),'radius line',guides);
  const vArrow=put(vecArrow(V3(1,0,0),V3(0,0,0),1,0xffd27a,.22,.13),'velocity arrow',guides);
  const NW=12,NP=48,WG=part('equal-area wedges',guides);const wedges=[];for(let i=0;i<NW;i++){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(NP*9),3));g.setDrawRange(0,0);const m=new T.Mesh(g,new T.MeshBasicMaterial({color:i%2?0xcfa84f:0x2d5b8e,transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false}));m.frustumCulled=false;WG.add(m);wedges.push({m,n:0,area:0})}
  const Tg=bound?Tk/NW:2*Math.PI*Math.sqrt(p.r0**3/p.GM)/NW;let wi=0,wt=0,lx=x,lz=z,ns=0;
  // foreground: a tumbling asteroid at the lower-left frame edge, lit only by the star; a faint nebula far behind
  {const g=mergeVertices(new T.IcosahedronGeometry(.9,4).deleteAttribute('normal').deleteAttribute('uv')),P=g.attributes.position,q=V3(0,0,0),rr=mulberry(5);for(let i=0;i<P.count;i++){q.fromBufferAttribute(P,i);const n=1+.25*Math.sin(q.x*3.1+q.y*2)*Math.cos(q.z*2.7)+.12*Math.sin(q.x*9+q.z*7);q.multiplyScalar(n);P.setXYZ(i,q.x,q.y*.75,q.z)}g.computeVertexNormals();{const uv=new Float32Array(P.count*2);for(let i=0;i<P.count;i++){q.fromBufferAttribute(P,i);uv[i*2]=Math.atan2(q.z,q.x)/Math.PI+1;uv[i*2+1]=q.y*.6+.5}g.setAttribute('uv',new T.BufferAttribute(uv,2))}
   const ast=put(new T.Mesh(g,makeMaterial('stone')),'asteroid (foreground)');const fp=groundAt(orbit,-.9,-.62,0);ast.position.copy(fp).lerp(orbit.target,.0);ast.position.y=Math.max(ast.position.y,-1.5);ast.rotation.set(.4,.8,.2);ORB.ast=ast}
  {const neb=new T.Sprite(new T.SpriteMaterial({map:canvasTex(256,256,(g)=>{const r=mulberry(3);for(let i=0;i<40;i++){const x=40+r()*176,y=60+r()*136,rad=30+r()*70,gr=g.createRadialGradient(x,y,1,x,y,rad);gr.addColorStop(0,`rgba(${90+r()*60|0},${70+r()*40|0},${150+r()*80|0},.16)`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,256,256)}}),blending:T.AdditiveBlending,depthWrite:false,fog:false}));neb.position.set(-30,14,-70);neb.scale.set(70,50,1);put(neb,'nebula (background)')}
  let lastDr=0,Tm=NaN,laps=0,lastAng=0,swept=0,lapT=0;const tmp=V3(0,0,0);
  if(E0>=0)ev('energy ε ≥ 0: unbound, the planet escapes',V3(x,Y,z));
  ORB.planet=()=>V3(x,Y,z);ORB.Y=Y;ORB.a=aS;ORB.e=ecc;
  D.label('star · M',at(v=>v.set(0,Y+.95,0)),SG);D.label('planet · m',at(v=>v.set(x,Y+.38,z)),PG);D.label('r',at(v=>v.set(x*.5,Y+.15,z*.5)),true);D.label('equal-area wedges',at(v=>{const w=wedges[(wi+NW-1)%NW];return w.n?v.set(x*.6,Y+.1,z*.6):null}),WG);
  D.seriesName='distance r(t)';
  const addRim=(x0,z0,x1,z1)=>{const W_=wedges[wi];if(W_.n>=NP)return;const a=W_.m.geometry.attributes.position.array,o=W_.n*9;a[o]=0;a[o+1]=Y;a[o+2]=0;a[o+3]=x0;a[o+4]=Y;a[o+5]=z0;a[o+6]=x1;a[o+7]=Y;a[o+8]=z1;W_.n++;W_.area+=Math.abs(x0*z1-x1*z0)/2;W_.m.geometry.setDrawRange(0,W_.n*3);W_.m.geometry.attributes.position.needsUpdate=true};
  return{orbit,
   step(h){const r=Math.hypot(x,z),ac=-p.GM/(r*r*r);vx+=ac*x*h;vz+=ac*z*h;x+=vx*h;z+=vz*h;const dr=x*vx+z*vz;
    const ang=Math.atan2(-z,x);let da=ang-lastAng;if(da>Math.PI)da-=2*Math.PI;if(da<-Math.PI)da+=2*Math.PI;swept+=Math.abs(da);lastAng=ang;
    if(swept>=2*Math.PI*(laps+1)){laps++;Tm=D.t-lapT;lapT=D.t;if(laps===1)ev('one orbit complete: T = '+fx(Tm,2)+' s (Kepler 2π√(a³/GM) = '+fx(Tk,2)+' s); the 12 wedges, each swept in T/12, all have area ≈ '+fx(Math.abs(L0)/2*Tg,3)+' u²',V3(x,Y,z),{sound:'chime',color:0x88c0ff})}
    if(ecc>.02&&lastDr!==0&&Math.sign(dr)!==Math.sign(lastDr)){if(dr>0)ev('perihelion: closest (r = '+fx(r,2)+'), fastest (v = '+fx(Math.hypot(vx,vz),2)+')',V3(x,Y,z),{color:0x88c0ff,sound:'whoosh'});else ev('aphelion: farthest (r = '+fx(r,2)+'), slowest (v = '+fx(Math.hypot(vx,vz),2)+')',V3(x,Y,z),{sound:'tick'})}lastDr=dr;
    wt+=h;if(++ns>=Math.max(1,Math.round(Tg/NP/h))){addRim(lx,lz,x,z);lx=x;lz=z;ns=0}
    if(wt>=Tg){wt-=Tg;addRim(lx,lz,x,z);lx=x;lz=z;ns=0;wi=(wi+1)%NW;const nw=wedges[wi];nw.n=0;nw.area=0;nw.m.geometry.setDrawRange(0,0)}
    if(r>14||r<SR+PR){ev(r<SR+PR?'planet falls into the star — resetting':'planet left the diorama — resetting',V3(x,Y,z),{sound:r<SR+PR?'thud':'whoosh'});x=p.r0;z=0;vx=0;vz=-p.vfactor*vc;tr.userData.count=0;lx=x;lz=z;wedges.forEach(w=>{w.n=0;w.area=0;w.m.geometry.setDrawRange(0,0)});wi=0;wt=0;lastDr=0;lastAng=0;swept=0;laps=0;lapT=D.t}},
   visual(dt){PG.position.set(x,Y,z);pl.rotation.y+=dt*1.5;star.rotation.y+=dt*.1;tr.add(PG.position);const a=rline.geometry.attributes.position;a.setXYZ(1,x,Y,z);a.needsUpdate=true;
    const v=Math.hypot(vx,vz)||1;vArrow.position.copy(PG.position);vArrow.setDirection(tmp.set(vx/v,0,vz/v));vArrow.setLength(alen(v,vc*1.5,1.3));if(ORB.ast)ORB.ast.rotation.y+=dt*.05;D.push(Math.hypot(x,z))},
   readouts(){const r=Math.hypot(x,z),v=Math.hypot(vx,vz),E=.5*v*v-p.GM/r,L=x*vz-z*vx,w0=wedges[(wi+NW-1)%NW];return[['r',fx(r,3)],['v',fx(v,3)],['ε = v²/2 − GM/r',fx(E,4)],['L = r×v',fx(L,4)],['a · e',bound?fx(aS,3)+' · '+fx(ecc,3):'unbound'],['T Kepler',bound?fx(Tk,3)+' s':'—'],['T measured',isFinite(Tm)?fx(Tm,3)+' s':'…'],['last wedge area',w0.n?fx(w0.area,3)+' u²':'…']]}}}};
{const P=()=>ORB.planet?ORB.planet():V3(3,2.4,0),Y=()=>ORB.Y??2.4;
 DIO.orbit.shots={'perihelion':SHOT(()=>P().multiplyScalar(.5).setY(Y()).toArray(),6.5),'aphelion':SHOT(()=>P().multiplyScalar(.45).setY(Y()).toArray(),9),'one orbit complete':SHOT(()=>[0,Y(),0],13),'unbound':SHOT(()=>[0,Y(),0],15),'falls into the star':SHOT(()=>[0,Y(),0],5.5),'left the diorama':SHOT(()=>[0,Y(),0],16)};
 DIO.orbit.flows={
  'perihelion':[{from:()=>P(),to:()=>P().multiplyScalar(.45).setY(Y()),label:'gravity strongest here: it bends the path most'}],
  'aphelion':[{from:()=>P(),to:()=>P().multiplyScalar(.7).setY(Y()),label:'weak pull far out: the planet is slowest'}],
  'one orbit complete':[{from:()=>V3(0,Y()+1.2,0),to:()=>P(),label:'equal times sweep equal areas'}]};}


/* --- Collision: two gliders on an air track in the lab ---
   1-D impact with restitution e: v₁′ = (m₁u₁ + m₂u₂ + m₂e(u₂ − u₁))/M, v₂′ = (m₁u₁ + m₂u₂ + m₁e(u₁ − u₂))/M.
   Momentum is always conserved; kinetic energy only for e = 1; the centre of mass moves at v_cm = P/M throughout. */
const COL={};
DIO.collision={params:{m1:[.2,10,2,'kg','mass 1'],m2:[.2,10,1,'kg','mass 2'],v1:[-4,6,3,'m/s','velocity 1'],v2:[-6,4,-1,'m/s','velocity 2'],e:[0,1,1,'','restitution']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'lab');
  const orbit={target:V3(.2,1,0),r:13.8,ph:1.17,th:.24},alu=makeMaterial('steel'),walnut=makeMaterial('walnut'),brass=D.mats.brass,rub=makeMaterial('rubber'),TOP=.78;alu.color.set(0x8a9096);alu.roughness=.55;alu.envMapIntensity=.7;
  // air track: an aluminium beam on walnut feet, a brass end stop with a rubber bumper at each end, and two photogates
  const TR=part('air track');
  put(box(12.6,.24,.42,alu),'aluminium beam',TR).position.set(0,TOP-.12,0);
  [-4.8,4.8].forEach(x=>{const f=box(.5,TOP-.24,1.1,walnut);f.position.set(x,(TOP-.24)/2,0);TR.add(f)});
  [-6.35,6.35].forEach(x=>{const s=box(.12,.6,.6,brass);s.position.set(x,TOP+.18,0);TR.add(s);const b=cyl(.12,.14,rub,16);b.rotation.z=Math.PI/2;b.position.set(x-Math.sign(x)*.12,TOP+.25,0);TR.add(b)});
  put(cyl(.07,.4,brass,12),'air inlet',TR).position.set(-6.2,TOP-.12,.32);
  const PG=part('photogates',W,true),black=makeMaterial({preset:'plastic',color:'#1c1c1e',roughness:.4}),led=new T.MeshBasicMaterial({color:new T.Color(3,.4,.3),toneMapped:false});
  [-1.4,1.6].forEach((x,i)=>{const g=new T.Group();g.name='photogate '+'AB'[i];g.position.x=x;PG.add(g);[-.42,.42].forEach(z=>{const l=box(.12,1.1,.12,black);l.position.set(0,TOP+.55,z);g.add(l)});const t=box(.12,.12,.96,black);t.position.set(0,TOP+1.1,0);g.add(t);const e=new T.Mesh(new T.SphereGeometry(.03,10,8),led);e.position.set(0,TOP+.95,.36);g.add(e)});
  // gliders: a saddle over the beam, a brass flag for the gates, a bumper spring on the facing end
  const glider=(name,m,s,mat,dir)=>{const G=part(name,W,true),h=s*.5;put(box(s,h,.9,mat),'body',G).position.y=TOP+.06+h/2;[-.27,.27].forEach(z=>{const sk=box(s*.96,.22,.06,mat);sk.position.set(0,TOP-.04,z);G.add(sk)});
   const fl=box(.04,.3,.3,brass);fl.position.set(0,TOP+.06+h+.15,0);G.add(fl);const sp=helixSpring(5,.07,.012,makeMaterial('steel'));sp.setLength(.22);sp.position.set(dir*s/2,TOP+.06+h*.5,0);if(dir<0)sp.rotation.y=Math.PI;G.add(sp);return G};
  const s1=.5+Math.cbrt(p.m1)*.35,s2=.5+Math.cbrt(p.m2)*.35,c1=glider('cart 1 · m₁',p.m1,s1,makeMaterial({preset:'plastic',color:'#2d5b8e',roughness:.28}),1),c2=glider('cart 2 · m₂',p.m2,s2,makeMaterial({preset:'plastic',color:'#9c3a28',roughness:.3}),-1);
  // the centre of mass, drawn as a gold marker riding above the track
  const CM=part('centre of mass',W,true);put(new T.Mesh(new T.OctahedronGeometry(.16,0),makeMaterial('gold')),'marker',CM).position.y=TOP+1.75;CM.children[0].scale.y=1.5;
  const cmLine=put(lineFrom([V3(0,TOP+.1,0),V3(0,TOP+1.55,0)],0xcfa84f,true),'centre-of-mass drop line',CM);cmLine.userData.noContact=true;
  const a1=put(vecArrow(V3(1,0,0),V3(0,0,0),1,0x88c0ff,.25,.15),'velocity 1',guides),a2=put(vecArrow(V3(1,0,0),V3(0,0,0),1,0xff9a7a,.25,.15),'velocity 2',guides);
  // foreground: slotted brass masses on the bench at the lower-right frame edge
  {const F=part('slotted masses (foreground)'),q=inDisc(groundAt(orbit,.84,-.84),6.2);F.position.copy(q);for(let i=0;i<4;i++){const d=cyl(.34-i*.03,.09,brass,32);d.position.y=.045+i*.095;F.add(d)}const rod=cyl(.03,.6,brass,8);rod.position.y=.3;F.add(rod)}
  const arrowAt=(a,x,v,s)=>{a.visible=Math.abs(v)>.01;a.position.set(x,TOP+s*.5+.42,0);a.setDirection(v>=0?V3X:V3NX);a.setLength(alen(v,Math.max(Math.abs(p.v1),Math.abs(p.v2),1),1.4))};
  const M=p.m1+p.m2,P0=p.m1*p.v1+p.m2*p.v2,K0=.5*p.m1*p.v1**2+.5*p.m2*p.v2**2,vcm=P0/M;
  let x1=-3,x2=2.5,v1=p.v1,v2=p.v2,done=false,wait=0,hits=0,K=K0;
  COL.mid=()=>V3((x1+x2)/2,TOP+.4,0);COL.cm=()=>V3((p.m1*x1+p.m2*x2)/M,TOP+1.75,0);COL.x=()=>[x1,x2];
  D.label('cart 1 · m₁',at(v=>v.set(x1,TOP+s1*.5+.75,0)),c1);D.label('cart 2 · m₂',at(v=>v.set(x2,TOP+s2*.5+.75,0)),c2);D.label('centre of mass',at(v=>v.set((p.m1*x1+p.m2*x2)/M,TOP+2.1,0)),CM);D.label('photogates',at(v=>v.set(1.6,TOP+1.35,0)),PG);
  D.seriesName='total momentum p (stays flat)';
  return{orbit,
   step(h){if(done){wait+=h;if(wait>1.5){x1=-3;x2=2.5;v1=p.v1;v2=p.v2;done=false;wait=0}return}x1+=v1*h;x2+=v2*h;
    if(x2-x1<(s1+s2)/2&&v1-v2>0){const u1=v1,u2=v2;v1=(p.m1*u1+p.m2*u2+p.m2*p.e*(u2-u1))/M;v2=(p.m1*u1+p.m2*u2+p.m1*p.e*(u1-u2))/M;hits++;K=.5*p.m1*v1*v1+.5*p.m2*v2*v2;
     ev(`collision: p ${fx(P0,2)} → ${fx(p.m1*v1+p.m2*v2,2)} kg·m/s, KE ${fx(K0,2)} → ${fx(K,2)} J; now v₁ = ${fx(v1,2)}, v₂ = ${fx(v2,2)} m/s`,V3((x1+x2)/2,TOP+.5,0),{sound:p.e<.3?'thud':'clack'})}
    if(Math.abs(x1)>6||Math.abs(x2)>6){done=true;if(hits)ev('gliders reach the end stops: centre of mass moved at '+fx(vcm,2)+' m/s the whole time',COL.cm(),{sound:'wood'})}},
   visual(){c1.position.x=x1;c2.position.x=x2;CM.position.x=(p.m1*x1+p.m2*x2)/M;
    arrowAt(a1,x1,v1,s1);arrowAt(a2,x2,v2,s2);D.push(p.m1*v1+p.m2*v2)},
   readouts(){const k=.5*p.m1*v1*v1+.5*p.m2*v2*v2;return[['v₁',fx(v1,3)+' m/s'],['v₂',fx(v2,3)+' m/s'],['p total',fx(p.m1*v1+p.m2*v2,3)+' kg·m/s'],['v centre of mass',fx(vcm,3)+' m/s'],['KE total',fx(k,3)+' J'],['KE lost',fx(K0-k,3)+' J'],['collisions',String(hits)]]}}}};
const V3X=V3(1,0,0),V3NX=V3(-1,0,0);
{const Mid=()=>COL.mid?COL.mid():V3(0,1,0);
 DIO.collision.shots={'collision:':SHOT(()=>Mid().toArray(),6.5),'end stops':SHOT([0,1.2,0],11)};
 DIO.collision.flows={'collision:':[{from:()=>Mid().add(V3(-1.3,.6,.5)),to:()=>Mid().add(V3(-.1,.6,.5)),label:'cart 1 pushes cart 2'},{from:()=>Mid().add(V3(1.3,.6,-.5)),to:()=>Mid().add(V3(.1,.6,-.5)),label:'…and cart 2 pushes back equally'}],
  'end stops':[{from:()=>COL.cm().add(V3(-1.5,.3,0)),to:()=>COL.cm().add(V3(-.2,.3,0)),label:'the centre of mass never felt the crash'}]};}

/* --- Incline: an oak block on an inclined plane in the studio ---
   Along the slope: m a = m g sin θ − μ m g cos θ when tan θ > μ (else static friction holds it). From rest over a
   length L: v = √(2aL), t = √(2L/a). Mass cancels. Friction turns μ m g cos θ · L into heat. */
const INC={};
DIO.incline={params:{angle:[5,60,30,'°','incline angle'],mu:[0,1,.2,'','friction coefficient'],m:[.5,10,2,'kg','block mass'],g:[1,25,9.81,'m/s²','gravity']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'studio');
  const a=p.angle/DEG,Lw=9,hgt=Lw*Math.sin(a),base=Lw*Math.cos(a),x0=-base/2,TH=.22,oak=D.mats.wood,walnut=makeMaterial('walnut'),brass=D.mats.brass;
  const orbit={target:V3(0,Math.max(1.2,hgt*.45),0),r:13.5,ph:1.2,th:.3};
  const dir=V3(Math.cos(a),-Math.sin(a),0),nrm=V3(Math.sin(a),Math.cos(a),0);
  // the plane: an oak board (grain along the slope) on two walnut side cheeks and a back post
  const PL=part('inclined plane');
  const board=put(box(Lw,TH,2,satin(oak)),'oak board',PL);board.position.copy(V3(x0,hgt,0).addScaledVector(dir,Lw/2).addScaledVector(nrm,-TH/2));board.rotation.z=-a;
  {const sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(base,0);sh.lineTo(0,hgt-TH/Math.cos(a));sh.lineTo(0,0);const g=new T.ExtrudeGeometry(sh,{depth:.08,bevelEnabled:false});const u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)/2.4,u.getY(i)/2.4);
   [-1,.92].forEach(z=>{const m=new T.Mesh(g,walnut);m.position.set(x0,0,z);m.castShadow=m.receiveShadow=true;PL.add(m)})}
  put(box(.25,Math.max(.1,hgt-.2),1.8,walnut),'back post',PL).position.set(x0+.12,Math.max(.1,hgt-.2)/2,0);
  // angle gauge at the foot of the slope (θ)
  const AG=part('angle gauge',W,true);
  {const tex=ctex(512,512,(g,w)=>{g.clearRect(0,0,w,w);g.fillStyle='#d6b46a';g.beginPath();g.moveTo(w,w);g.arc(w,w,w-4,Math.PI,Math.PI*1.5);g.fill();g.strokeStyle='#2a1a08';g.fillStyle='#2a1a08';g.font='600 34px Georgia, serif';g.textAlign='center';g.textBaseline='middle';
    for(let d=0;d<=90;d++){const t=Math.PI+d/DEG,big=d%10===0,r0=w*(big?.72:.82);g.lineWidth=big?4:2;g.beginPath();g.moveTo(w+Math.cos(t)*r0,w+Math.sin(t)*r0);g.lineTo(w+Math.cos(t)*w*.95,w+Math.sin(t)*w*.95);g.stroke();if(d%30===0)g.fillText(d+'°',w+Math.cos(t)*w*.58,w+Math.sin(t)*w*.58)}});
   const m=new T.MeshPhysicalMaterial({map:tex,metalness:.85,roughness:.38,alphaTest:.5,side:T.DoubleSide});const q=put(new T.Mesh(new T.PlaneGeometry(1.4,1.4),m),'brass quadrant',AG);q.position.set(x0+base+.05-.7,.7,1.08);q.receiveShadow=true}
  // the block
  const BK=part('block · m',W,true);put(box(.9,.6,.9,walnut),'walnut block',BK);{const hd=new T.Mesh(new T.TorusGeometry(.14,.025,8,20,Math.PI),brass);hd.position.y=.3;BK.add(hd)}
  const arr=(c,n)=>put(vecArrow(V3(0,-1,0),V3(0,0,0),1,c,.25,.16),n,guides);const aG=arr(0xff8866,'weight mg'),aN=arr(0x88c0ff,'normal force N'),aF=arr(0x99dd99,'friction f'),aNet=arr(0xffd27a,'net force');
  // foreground: spare blocks at the lower-left frame edge
  {const F=part('spare blocks (foreground)'),q=inDisc(groundAt(orbit,-.84,-.84),6.1);F.position.copy(q);[[0,.3,0,0],[.95,.3,.1,.3],[.45,.9,.05,.15]].forEach(([x,y,z,r])=>{const b=box(.9,.6,.9,r>.2?oak:walnut);b.position.set(x,y,z);b.rotation.y=r;F.add(b)})}
  const slides=Math.tan(a)>p.mu,acc=slides?p.g*(Math.sin(a)-p.mu*Math.cos(a)):0,Ls=Lw-1.3;let s=0,v=0,wait=0,t=0,started=false;
  ev(slides?'tan θ = '+fx(Math.tan(a),3)+' > μ = '+fx(p.mu,2)+': gravity along the slope beats friction, the block will slide':'tan θ = '+fx(Math.tan(a),3)+' ≤ μ = '+fx(p.mu,2)+': static friction holds the block',V3(x0,hgt,0).addScaledVector(dir,.6),{sound:'wood'});
  const pos=v_=>v_.set(x0,hgt,0).addScaledVector(dir,s+.6).addScaledVector(nrm,.32),tmp=V3(0,0,0);
  INC.block=()=>pos(V3(0,0,0));INC.dir=dir;INC.x0=x0;INC.hgt=hgt;INC.base=base;
  D.label('block · m',at(v=>pos(v).add(V3Y7)),BK);D.label('mg',at(v=>pos(v).setY(v.y-1.5)),true);D.label('N',at(v=>pos(v).addScaledVector(nrm,1.6)),true);D.label('f',at(v=>pos(v).addScaledVector(dir,-1.3)),true);D.label('θ',at(v=>v.set(x0+base-1.25,.3,1.1)),true);D.label('angle gauge',at(v=>v.set(x0+base-.6,1.6,1.08)),AG);
  D.seriesName='speed v(t) along slope';
  return{orbit,
   step(h){if(!slides){t+=h;if(!started&&t>2){started=true;ev('still at rest after 2 s: static friction supplies f = mg sin θ = '+fx(p.m*p.g*Math.sin(a),2)+' N (it could give up to μN = '+fx(p.mu*p.m*p.g*Math.cos(a),2)+' N)',pos(tmp),{sound:'wood',color:0x88c0ff})}return}if(!started){started=true;ev('block released at the top: a = g(sin θ − μ cos θ) = '+fx(acc,2)+' m/s²',pos(tmp),{sound:'wood'})}
    if(s<Ls){v+=acc*h;s+=v*h;t+=h;if(s>=Ls){t-=(s-Ls)/Math.max(v,1e-6);s=Ls;v=Math.sqrt(2*acc*Ls);ev('reaches the bottom after '+fx(t,2)+' s at v = '+fx(v,2)+' m/s (√(2aL) = '+fx(Math.sqrt(2*acc*Ls),2)+' m/s, √(2L/a) = '+fx(Math.sqrt(2*Ls/acc),2)+' s)',pos(tmp),{color:0x88c0ff,sound:'thud'})}}
    else{wait+=h;if(wait>1.4){s=0;v=0;t=0;wait=0;started=false}}},
   visual(){pos(BK.position);BK.rotation.z=-a;const P=BK.position,g=p.g*p.m,N=g*Math.cos(a),f=slides?p.mu*N:g*Math.sin(a),sc=1.5/Math.max(g,1e-6);   // one scale for all four forces: mg is 1.5 long, the rest in proportion
    aG.position.copy(P);aG.setDirection(V3NY);aG.setLength(Math.max(.28,g*sc));aN.position.copy(P);aN.setDirection(nrm);aN.setLength(Math.max(.28,N*sc));aF.position.copy(P);aF.setDirection(tmp.copy(dir).negate());aF.visible=f>1e-3;aF.setLength(Math.max(.28,f*sc));aNet.position.copy(P).setZ(.6);aNet.visible=acc>0;aNet.setDirection(dir);aNet.setLength(Math.max(.28,p.m*acc*sc));D.push(v)},
   readouts(){const g=p.g*p.m;return[['a',fx(acc,3)+' m/s²'],['v',fx(v,3)+' m/s'],['s',fx(s,2)+' m'],['mg sin θ',fx(g*Math.sin(a),2)+' N'],['N = mg cos θ',fx(g*Math.cos(a),2)+' N'],['friction',fx(slides?p.mu*g*Math.cos(a):g*Math.sin(a),2)+' N'],['heat so far μN·s',fx(slides?p.mu*g*Math.cos(a)*s:0,2)+' J']]}}}};
const V3Y7=V3(0,.7,0),V3NY=V3(0,-1,0);
{const B=()=>INC.block?INC.block():V3(0,1,0);
 DIO.incline.shots={'still at rest':SHOT(()=>B().toArray(),6),'tan θ':SHOT(()=>[0,(INC.hgt||4.5)*.45,0],11),'block released':SHOT(()=>B().toArray(),6),'reaches the bottom':SHOT(()=>B().toArray(),6.5),'static friction holds':SHOT(()=>B().toArray(),6)};
 DIO.incline.flows={'block released':[{from:()=>B().add(V3(0,.2,.7)),to:()=>B().addScaledVector(INC.dir||V3(.87,-.5,0),1.5).add(V3(0,.2,.7)),label:'mg sin θ pulls it down the slope'}],
  'static friction holds':[{from:()=>B().add(V3(.9,-.5,.7)),to:()=>B().add(V3(-.2,.1,.7)),label:'friction matches mg sin θ exactly'}],
  'reaches the bottom':[{from:()=>V3(INC.x0??-4,(INC.hgt||4.5)+.4,.8),to:()=>B().add(V3(0,.4,.8)),label:'height turned into speed (minus heat)'}]};}

/* --- Wave: a beaded rope strung between two posts on a pier over the sea ---
   Travelling: y = A sin(k(x + 5) − ωt); standing (fixed ends, L = 10): y = 2A sin(k(x + 5)) cos ωt with λ = 2L/n.
   k = 2π/λ, ω = 2πf, phase speed v = fλ. Every bead moves only vertically; the pattern moves along. */
const WAV={};
DIO.wave={params:{A:[.1,1.2,.6,'m','amplitude'],lambda:[1,10,5,'m','wavelength'],f:[.1,2,.5,'Hz','frequency'],standing:[0,1,0,'','0 travelling · 1 standing']},
 build(D,p){const {W,R,part,put,guides,at,ev,own}=stage(D,'ocean',{sun:[1,.42,-.3]});const N=80,Y=2.6,xs=new Float32Array(N),ys=new Float32Array(N);
  const orbit={target:V3(0,2.2,0),r:13.5,ph:1.25,th:.3},oak=D.mats.wood,walnut=makeMaterial('walnut'),brass=D.mats.brass,iron=D.mats.iron;
  // the pier: planks across, piles into the water, two posts carrying the rope
  const PI_=part('pier');const pr=mulberry(17);
  {const plank=new T.BoxGeometry(.48,.12,4.4);alignUV(plank);for(let i=0;i<28;i++){const m=new T.Mesh(plank,i%3?oak:walnut);m.position.set(-6.75+i*.5,-.06+(pr()-.5)*.015,(pr()-.5)*.08);m.rotation.y=(pr()-.5)*.02;m.castShadow=m.receiveShadow=true;PI_.add(m)}}
  for(let i=0;i<7;i++)[-2,2].forEach(z=>{const c=cyl(.16,3.2,walnut,16);c.position.set(-6+i*2,-1.66,z);PI_.add(c)});
  [-1.95,1.95].forEach(z=>{const b=box(14,.16,.16,walnut);b.position.set(0,-.22,z);PI_.add(b)});
  const POST=part('rope posts');[-5.3,5.3].forEach(x=>{const c=box(.28,Y+.6,.28,walnut);c.position.set(x,(Y+.6)/2,0);POST.add(c);const cap=box(.36,.08,.36,iron);cap.position.set(x,Y+.64,0);POST.add(cap);const ring=new T.Mesh(new T.TorusGeometry(.09,.025,8,20),iron);ring.position.set(x-Math.sign(x)*.15,Y,0);ring.rotation.y=Math.PI/2;POST.add(ring)});
  // the rope: a tube regenerated in place each frame along the beads
  const RP=part('rope',W,true),SIDES=6,rr=.035,rpos=new Float32Array(N*SIDES*3),rnor=new Float32Array(N*SIDES*3),ridx=[];
  for(let i=0;i<N-1;i++)for(let j=0;j<SIDES;j++){const a_=i*SIDES+j,b_=i*SIDES+(j+1)%SIDES,c_=(i+1)*SIDES+j,d_=(i+1)*SIDES+(j+1)%SIDES;ridx.push(a_,c_,b_,b_,c_,d_)}
  const rg=new T.BufferGeometry();rg.setIndex(ridx);rg.setAttribute('position',new T.BufferAttribute(rpos,3));rg.setAttribute('normal',new T.BufferAttribute(rnor,3));
  const rope=put(new T.Mesh(rg,makeMaterial({preset:'fabric',color:'#c8b088',roughness:.95})),'hemp rope',RP);rope.castShadow=true;rope.frustumCulled=false;
  const beads=put(new T.InstancedMesh(new T.SphereGeometry(.08,16,12),brass,N),'brass beads',RP);beads.castShadow=true;beads.userData.noInk=true;beads.frustumCulled=false;
  for(let i=0;i<N;i++)xs[i]=-5+10*i/(N-1);
  const TB=part('tracked bead',W,true);const marker=put(ball(.15,makeMaterial({preset:'plastic',color:'#b2382a',roughness:.3})),'red bead',TB);
  const st=p.standing>.5,lam=st?20/Math.max(1,Math.round(20/p.lambda)):p.lambda,k=2*Math.PI/lam,w=2*Math.PI*p.f;let cycles=0,crossed=false;
  if(st&&Math.abs(lam-p.lambda)>1e-3)ev('standing wave on a fixed rope: λ snapped to 2L/n = '+fx(lam,3)+' m (n = '+Math.round(20/lam)+')',V3(0,Y,0));
  const yAt=(x,t)=>st?2*p.A*Math.sin(k*(x+5))*Math.cos(w*t):p.A*Math.sin(k*(x+5)-w*t);
  // crest marker (travelling) or node rings (standing)
  const CR=part(st?'nodes':'crest',W,true);const nodes=[];
  if(st){for(let n=0;n*lam/2<=10.001;n++){const x=-5+n*lam/2;const r=new T.Mesh(new T.TorusGeometry(.2,.03,8,24),makeMaterial({preset:'plastic',color:'#4a8ad0',roughness:.3}));r.position.set(x,Y,0);r.rotation.y=Math.PI/2;CR.add(r);nodes.push(x)}}
  else{const c=new T.Mesh(new T.ConeGeometry(.14,.32,4),makeMaterial('gold'));c.rotation.x=Math.PI;CR.add(c)}
  const crestX=()=>{let u=(w*D.t/k)%lam;return -5+u+lam/4-(u+lam/4>lam?lam:0)};
  put(lineFrom([V3(-5,Y-2*p.A-.45,0),V3(-5+lam,Y-2*p.A-.45,0)],0xcfa84f),'λ bar',guides);
  // foreground: a mooring bollard and a coil of rope on the planks at the lower-left frame edge
  {const F=part('bollard and rope coil (foreground)'),q=groundAt(orbit,-.82,-.86,0);q.z=Math.min(q.z,2.1);q.x=Math.max(q.x,-6.4);F.position.copy(q);const b=cyl(.22,.5,iron,24);b.position.y=.25;F.add(b);const t=cyl(.3,.08,iron,24);t.position.y=.52;F.add(t);
   const coilG=new T.TorusGeometry(.32,.05,8,32),cm=makeMaterial({preset:'fabric',color:'#c8b088'});for(let i=0;i<3;i++){const c=new T.Mesh(coilG,cm);c.rotation.x=Math.PI/2;c.position.set(.75,.05+i*.09,.15);c.scale.setScalar(1-i*.12);c.castShadow=true;F.add(c)}}
  const m4=new T.Matrix4(),XM=30;
  WAV.bead=()=>V3(xs[XM],Y+yAt(xs[XM],D.t),0);WAV.Y=Y;WAV.crest=()=>V3(crestX(),Y+p.A+.35,0);
  D.label(st?'node (never moves)':'crest',at(v=>st?(nodes[1]!=null?v.set(nodes[1],Y-.55,0):null):v.set(crestX(),Y+p.A+.65,0)),CR);D.label('tracked bead',at(v=>v.set(xs[XM],Y+yAt(xs[XM],D.t)+.4,0)),TB);D.label('rope',at(v=>v.set(3.2,Y+.15,0)),RP);D.label('λ',at(v=>v.set(-5+lam/2,Y-2*p.A-.75,0)),true);
  D.seriesName='displacement of tracked bead y(t)';
  return{orbit,
   step(h){const c=Math.floor(D.t*p.f+1e-9);if(c>cycles){cycles=c;if(c<=12)ev('period '+c+' complete: T = 1/f = '+fx(1/p.f,3)+' s; the red bead is back where it started',V3(xs[XM],Y+yAt(xs[XM],D.t),0),{sound:'tick'});
     if(c===1&&!st&&!crossed){crossed=true;ev('in one period T = '+fx(1/p.f,2)+' s the crest moved one wavelength λ = '+fx(lam,2)+' m: v = fλ = '+fx(p.f*lam,2)+' m/s',WAV.crest(),{color:0x88c0ff,sound:'whoosh'})}
     if(c===1&&st&&!crossed){crossed=true;ev('standing wave: the nodes never move, the antinodes swing ±2A = ±'+fx(2*p.A,2)+' m',V3(-5+lam/4,Y,0),{color:0x88c0ff,sound:'whoosh'})}}},
   visual(){const a=rg.attributes.position.array,n=rg.attributes.normal.array;for(let i=0;i<N;i++){ys[i]=Y+yAt(xs[i],D.t);m4.makeTranslation(xs[i],ys[i],0);beads.setMatrixAt(i,m4)}beads.instanceMatrix.needsUpdate=true;
    for(let i=0;i<N;i++){const i0=Math.max(0,i-1),i1=Math.min(N-1,i+1);let tx=xs[i1]-xs[i0],ty=ys[i1]-ys[i0];const l=Math.hypot(tx,ty);tx/=l;ty/=l;const n1x=-ty,n1y=tx;
     for(let j=0;j<SIDES;j++){const s=j/SIDES*2*Math.PI,ox=Math.cos(s)*n1x,oy=Math.cos(s)*n1y,oz=Math.sin(s),o=(i*SIDES+j)*3;a[o]=xs[i]+rr*ox;a[o+1]=ys[i]+rr*oy;a[o+2]=rr*oz;n[o]=ox;n[o+1]=oy;n[o+2]=oz}}
    rg.attributes.position.needsUpdate=true;rg.attributes.normal.needsUpdate=true;
    marker.position.set(xs[XM],ys[XM],0);if(!st)CR.children[0].position.set(crestX(),Y+p.A+.35,0);D.push(ys[XM]-Y)},
   readouts(){return[['v = fλ',fx(p.f*lam,3)+' m/s'],['λ',fx(lam,3)+' m'],['k = 2π/λ',fx(k,3)+' rad/m'],['ω = 2πf',fx(w,3)+' rad/s'],['T = 1/f',fx(1/p.f,3)+' s'],['tracked bead y',fx(ys[XM]-Y,3)+' m'],['mode',st?'standing':'travelling']]}}}};
{const B=()=>WAV.bead?WAV.bead():V3(0,2.6,0),Y=()=>WAV.Y??2.6;
 DIO.wave.shots={'period':SHOT(()=>[0,Y(),0],11),'λ snapped':SHOT(()=>[0,Y(),0],11),'crest moved one wavelength':SHOT(()=>[0,Y(),0],10.5),'standing wave:':SHOT(()=>[0,Y(),0],10.5)};
 DIO.wave.flows={'crest moved one wavelength':[{from:()=>WAV.crest().add(V3(-2.5,.4,0)),to:()=>WAV.crest().add(V3(0,.4,0)),label:'the shape travels along'},{from:()=>B().add(V3(.35,-.6,0)),to:()=>B().add(V3(.35,.6,0)),label:'each bead only moves up and down'}],
  'period':[{from:()=>B().add(V3(.4,-.5,0)),to:()=>B().add(V3(.4,.5,0)),label:'one up-and-down per period'}],
  'standing wave:':[{from:()=>V3(-5+2,Y()+1.6,0),to:()=>V3(-5+1.25,Y()+.8,0),label:'two waves add: still points (nodes)'}]};}

/* --- Gas: a glass box of molecules with a piston, a pressure gauge and a burner, in the lab ---
   Ideal gas, units k = m = 1. Molecule centres reflect at the walls (B − r); each bounce gives the wall 2|vᵢ|.
   P = impulse / area / time (1-s windows); kinetic theory: P = N k T / V with T = 2⟨KE⟩/3. Maxwell–Boltzmann speeds. */
const GAS={};
DIO.gas={params:{N:[10,160,70,'','molecules'],T:[.2,4,1,'','temperature (k=m=1)'],V:[.5,1.5,1,'×','box volume (piston)']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'lab');
  const XL=-3.6,BY=1.9,BZ=1.9,Y0=BY+.95,N=Math.round(p.N),r=.09,XR=XL+6*(p.V??1),BXh=(XR-XL)/2,XC=(XL+XR)/2;
  const orbit={target:V3(.6,2.6,0),r:13,ph:1.15,th:.3},brass=D.mats.brass,walnut=makeMaterial('walnut'),steel=makeMaterial('steel'),iron=D.mats.iron;
  // vessel: thin glass box in a brass frame (always the full length; the piston sets the volume), on a walnut stand
  const VS=part('glass vessel',W,true),GL=9,GX=XL+GL/2;
  const glass=put(new T.Mesh(new T.BoxGeometry(GL,2*BY,2*BZ),thinGlass({absorb:.02,edge:.7,card:.15,transmit:true})),'glass walls',VS);glass.position.set(GX,Y0,0);glass.renderOrder=5;
  {const e=.05,bars=[];[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([a,b])=>{bars.push([GL,e,e,GX,Y0+a*BY,b*BZ]);bars.push([e,2*BY,e,GX+a*GL/2,Y0,b*BZ]);bars.push([e,e,2*BZ,GX+a*GL/2,Y0+b*BY,0])});bars.forEach(([sx,sy,sz,x,y,z])=>{const m=box(sx,sy,sz,brass);m.position.set(x,y,z);VS.add(m)})}
  const ST=part('stand');[[XL+.6,-1.3],[XL+.6,1.3],[XL+GL-.6,-1.3],[XL+GL-.6,1.3]].forEach(([x,z])=>{const l=cyl(.06,Y0-BY,steel,12);l.position.set(x,(Y0-BY)/2,z);ST.add(l)});put(box(GL+.2,.06,2*BZ+.2,satin(walnut)),'shelf',ST).position.set(GX,Y0-BY-.03,0);
  // piston: the right wall of the gas, a brass plate on a rod through the end wall
  const PS=part('piston',W,true);put(box(.12,2*BY-.08,2*BZ-.08,brass),'piston plate',PS).position.set(0,0,0);{const rod=cyl(.06,XL+GL-XR+.9,steel,12);rod.rotation.z=Math.PI/2;rod.position.x=(XL+GL-XR+.9)/2;PS.add(rod);const kn=ball(.16,makeMaterial('rubber'));kn.position.x=XL+GL-XR+.9;PS.add(kn)}PS.position.set(XR+.06,Y0,0);
  // pressure gauge on a brass pipe from the lid
  const GA=part('pressure gauge',W,true);const ex=XR-XL-2*r,ey=BY-r,ez=BZ-r,area=2*(ex*2*ey+ex*2*ez+4*ey*ez),vol=ex*2*ey*2*ez;
  const Pid0=N*p.T/vol,full=[.2,.5,1,2,5,10,20,50].find(f=>f>=Pid0*2.2)||100;
  {const pipe=cyl(.05,.9,brass,12);pipe.position.set(XL+1,Y0+BY+.45,0);GA.add(pipe);const bz=cyl(.5,.16,brass,40);bz.rotation.x=Math.PI/2;bz.position.set(XL+1,Y0+BY+1.4,0);GA.add(bz);
   const face=new T.Mesh(new T.CircleGeometry(.44,48),new T.MeshPhysicalMaterial({map:dialTex({n:10,sub:5,labels:Array.from({length:6},(_,i)=>fx(full*i/5,full<1?2:full<5?1:0)),caption:'pressure'}),roughness:.4,clearcoat:1}));face.position.set(XL+1,Y0+BY+1.4,.081);GA.add(face);
   const gl=new T.Mesh(new T.CircleGeometry(.45,48),thinGlass({absorb:.02}));gl.position.set(XL+1,Y0+BY+1.4,.1);GA.add(gl)}
  const ndl=needle(.36,new T.MeshBasicMaterial({color:0x9c2a1a}));ndl.position.set(XL+1,Y0+BY+1.4,.09);GA.add(ndl);
  // burner under the box: the flame grows with temperature
  const BU=part('burner',W,true);{const b=cyl(.28,.12,iron,24);b.position.set(XC,.06,0);BU.add(b);const t=cyl(.09,.55,brass,16);t.position.set(XC,.4,0);BU.add(t)}
  const flame=put(new T.Mesh(new T.ConeGeometry(.12,.6,16,1,true),new T.MeshBasicMaterial({color:new T.Color(.5,.9,3),transparent:true,opacity:.7,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false})),'flame',BU);flame.position.set(XC,.98,0);flame.userData.noContact=true;
  // molecules (instanced, coloured by speed) and one tracked molecule with its own mesh and trail
  const mols=put(new T.InstancedMesh(new T.SphereGeometry(r,16,12),makeMaterial({preset:'plastic',color:'#ffffff',roughness:.25}),N),'molecules',VS);mols.castShadow=true;mols.userData.noInk=true;mols.frustumCulled=false;
  const TM=part('molecule · m',W,true);const tm=put(ball(r*1.25,new T.MeshPhysicalMaterial({color:new T.Color().setRGB(1,.773,.307,T.LinearSRGBColorSpace),metalness:1,roughness:.3,envMapIntensity:1.1})),'tracked molecule',TM);tm.geometry.dispose();tm.geometry=new T.SphereGeometry(r*1.25,96,64);   /* plain polished gold: the preset's brushed normals and curvature wear band in facet rows when the zoom fills the frame with it */const ttr=put(trail(240,0xffd27a),'tracked molecule trail',guides);
  const P=new Float64Array(N*3),Vv=new Float64Array(N*3),gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random()),B=[(XR-XL)/2-r,BY-r,BZ-r],C=[XC,0,0];
  for(let i=0;i<N;i++){for(let d=0;d<3;d++){P[i*3+d]=(Math.random()*2-1)*B[d];Vv[i*3+d]=gauss()*Math.sqrt(p.T)}}
  Vv[0]=1.2*Math.sqrt(p.T)*(Math.random()<.5?-1:1);Vv[1]=.5*gauss()*Math.sqrt(p.T);Vv[2]=.5*gauss()*Math.sqrt(p.T); // the tracked molecule: a typical speed, mostly along x
  {const m4=new T.Matrix4();m4.makeScale(0,0,0);mols.setMatrixAt(0,m4)}
  let imp=0,win=0,Pm=NaN,temp=p.T,hitsT=0,firstRead=false,fresh=false;const m4=new T.Matrix4(),col=new T.Color(),bins=new Array(16).fill(0),curve=new Array(16).fill(0),tmp=V3(0,0,0);
  const mp=(i,v)=>v.set(C[0]+P[i*3],Y0+P[i*3+1],P[i*3+2]);
  GAS.mol=()=>mp(0,V3(0,0,0));GAS.Y0=Y0;GAS.XL=XL;GAS.XR=XR;GAS.gauge=V3(XL+1,Y0+BY+1.4,.1);
  D.label('molecule · m',at(v=>mp(0,v).setY(v.y+.3)),TM);D.label('glass vessel (pressure = impulse / area / time)',at(v=>v.set(XL+.4,Y0+BY+.35,BZ)),VS);D.label('pressure gauge',at(v=>v.set(XL+1,Y0+BY+2.05,0)),GA);D.label('piston',at(v=>v.set(XR+.06,Y0+BY*.6,BZ*.6)),PS);D.label('burner',at(v=>v.set(XC+.5,.6,0)),BU);
  D.seriesName='speed histogram · red: Maxwell–Boltzmann';
  return{orbit,
   live(k){if(k==='T'){const f=Math.sqrt(p.T/temp);for(let i=0;i<N*3;i++)Vv[i]*=f;temp=p.T;imp=0;win=0;Pm=NaN;fresh=true;ev('heated/cooled: every velocity scaled by √(T′/T) = '+fx(f,3),V3(XC,Y0,0),{sound:'fizz'});return true}return false},
   step(h){for(let i=0;i<N;i++)for(let d=0;d<3;d++){const j=i*3+d;let q=P[j]+Vv[j]*h;if(q>B[d]){q=2*B[d]-q;Vv[j]=-Vv[j];imp+=2*Math.abs(Vv[j]);if(i===0&&d===0&&hitsT<2){hitsT++;ev('tracked molecule strikes the piston: it hands the wall Δp = 2mvₓ = '+fx(2*Math.abs(Vv[j]),2),mp(0,tmp),{sound:'tick'})}}else if(q<-B[d]){q=-2*B[d]-q;Vv[j]=-Vv[j];imp+=2*Math.abs(Vv[j]);if(i===0&&hitsT<2&&d===0){hitsT++;ev('tracked molecule strikes the end wall: it hands the wall Δp = 2mvₓ = '+fx(2*Math.abs(Vv[j]),2),mp(0,tmp),{sound:'tick'})}}P[j]=q}
    // P measured: impulse / area / time, averaged since the start (or since the last heating), read every second
    win+=h;if(Math.floor(win)>Math.floor(win-h)){Pm=imp/area/win;let ke=0;for(let i=0;i<N*3;i++)ke+=Vv[i]*Vv[i]/2;const Tk=2*ke/N/3,Pid=N*Tk/vol;
     if(win>=3&&(!firstRead||fresh)){ev((fresh?'new pressure reading after heating/cooling':'first pressure reading')+' (3 s of wall hits): P = '+fx(Pm,3)+' (kinetic theory NkT/V = '+fx(Pid,3)+', ratio '+fx(Pm/Pid,2)+')',GAS.gauge,{sound:'tick',color:0x88c0ff});firstRead=true;fresh=false}}},
   visual(dt){let ke=0;for(let i=0;i<N;i++){const vx=Vv[i*3],vy=Vv[i*3+1],vz=Vv[i*3+2],s2=vx*vx+vy*vy+vz*vz;ke+=s2/2;if(i){m4.makeTranslation(C[0]+P[i*3],Y0+P[i*3+1],P[i*3+2]);mols.setMatrixAt(i,m4)}col.setHSL(.62-Math.min(.62,Math.sqrt(s2)/(4*Math.sqrt(temp))*.62),.75,.55);mols.setColorAt(i,col)}mols.instanceMatrix.needsUpdate=true;mols.instanceColor.needsUpdate=true;this._ke=ke/N;
    mp(0,tm.position);ttr.add(tm.position);const Pg=isFinite(Pm)?Pm:N*temp/vol;ndl.rotation.z+=(-(-2.36+4.72*Math.min(1.05,Pg/full))-ndl.rotation.z)*Math.min(1,dt*3);
    const fl=.4+.5*Math.sqrt(p.T);flame.scale.set(1,fl,1);flame.position.y=.68+.3*fl;flame.material.opacity=.45+.25*Math.sin(D.t*23)*.3+.2},
   hist(){bins.fill(0);const mx=4*Math.sqrt(temp);for(let i=0;i<N;i++){const s=Math.hypot(Vv[i*3],Vv[i*3+1],Vv[i*3+2]);bins[Math.min(15,Math.floor(s/mx*16))]++}return bins},
   histCurve(){const mx=4*Math.sqrt(temp),dv=mx/16;for(let i=0;i<16;i++){const v=(i+.5)*dv;curve[i]=N*dv*4*Math.PI*Math.pow(1/(2*Math.PI*temp),1.5)*v*v*Math.exp(-v*v/(2*temp))}return curve},
   readouts(){const ke=this._ke||0,Tk=2*ke/3,Pid=N*Tk/vol;return[['⟨KE⟩',fx(ke,3)],['T = 2⟨KE⟩/3',fx(Tk,3)],['V',fx(vol,2)],['P measured',isFinite(Pm)?fx(Pm,3):'…'],['P = NkT/V',fx(Pid,3)],['PV/NkT',isFinite(Pm)?fx(Pm/Pid,3):'…'],['N',String(N)]]}}}};
{const M=()=>GAS.mol?GAS.mol():V3(0,2.8,0);
 DIO.gas.shots={'tracked molecule strikes':SHOT(()=>M().toArray(),4.5),'pressure reading':SHOT(()=>[GAS.XL+2.4,(GAS.Y0||2.85)+.9,0],8.5),'heated/cooled':SHOT(()=>[GAS.XL+4.5,(GAS.Y0||2.85)-.5,0],10)};
 DIO.gas.flows={'tracked molecule strikes':[{from:()=>M().add(V3(-1.2,.25,0)),to:()=>M().add(V3(-.15,.25,0)),label:'a tiny push on the wall at each bounce'}],
  'pressure reading':[{from:()=>V3(GAS.XL+2.6,(GAS.Y0||2.85)+.4,1.9),to:()=>GAS.gauge.clone().add(V3(.4,-.3,0)),label:'billions of pushes per second = pressure'}],
  'heated/cooled':[{from:()=>V3((GAS.XL+GAS.XR)/2,1.2,.8),to:()=>V3((GAS.XL+GAS.XR)/2,(GAS.Y0||2.85)-.6,.8),label:'heat makes every molecule faster'}]};}

/* --- Surface: a ball rolling on z = f(x, y), a relief model on a walnut block ---
   Horizontal motion of a particle on the surface (tangential gravity, small-slope form): a = −g s∇f / (1 + s²|∇f|²) − b v,
   with s the drawn height scale and b the rolling-friction rate. With b > 0 it settles where ∇f = 0 (a minimum). */
const SUR={};
DIO.surface={params:{gravity:[1,20,9.81,'m/s²','gravity'],friction:[0,3,.6,'1/s','rolling friction']},extraParams:true,
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'abstract');const ex=D.spec.expr||'sin(x)*cos(y)';const names=Object.keys(D.ranges).filter(k=>!(k in DIO.surface.params));
  const f0=compile(ex,['x','y',...names]),vals=new Float64Array(names.length),F=(x,y)=>{for(let i=0;i<names.length;i++)vals[i]=D.p[names[i]];return names.length?f0(x,y,...vals):f0(x,y)};const R_=4,N=90,AMP=.9,Y0=1.8;
  const orbit={target:V3(0,Y0+.9,0),r:14,ph:.98,th:.42};
  let lo=Infinity,hi=-Infinity;for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){const z=F(-R_+2*R_*i/N,-R_+2*R_*j/N);if(isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z)}}if(!isFinite(lo)){lo=-1;hi=1}const span=Math.max(1e-6,hi-lo),sc=Math.min(2.6/span,AMP*2);
  const geo=new T.PlaneGeometry(2*R_,2*R_,N,N);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,cols=[],hgt=[];const c=new T.Color(),cA=new T.Color(0x1d3d63),cB=new T.Color(0xcfa84f);
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getZ(i);let z=F(x,y);if(!isFinite(z))z=lo;pos.setY(i,Y0+(z-lo)*sc);c.copy(cA).lerp(cB,(z-lo)/span);cols.push(c.r,c.g,c.b);hgt.push((z-lo)/span)}
  geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));geo.setAttribute('fz',new T.Float32BufferAttribute(hgt,1));geo.computeVertexNormals();
  // the surface: lacquered relief with contour lines every 1/12 of its height (drawn in the shader, crisp at any zoom)
  const RM=part('relief z = f(x, y)',W,true);
  const sm=new T.MeshPhysicalMaterial({vertexColors:true,roughness:.42,metalness:.05,clearcoat:.7,clearcoatRoughness:.1,side:T.DoubleSide});
  sm.onBeforeCompile=s=>{s.vertexShader='attribute float fz;\nvarying float vFz;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vFz=fz;');
   s.fragmentShader='varying float vFz;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n { float q=vFz*12.; float d=abs(fract(q-.5)-.5)/fwidth(q); diffuseColor.rgb*=mix(.55,1.,clamp(d-.25,0.,1.)); }')};sm.customProgramCacheKey=()=>'sm-contour';
  const surf=put(new T.Mesh(geo,sm),'lacquered relief',RM);surf.castShadow=surf.receiveShadow=true;
  // walnut block under the relief: skirts follow the edge heights, so it reads as one carved solid
  {const walnut=makeMaterial('walnut'),edges=[[[-R_,-R_],[R_,-R_]],[[R_,-R_],[R_,R_]],[[R_,R_],[-R_,R_]],[[-R_,R_],[-R_,-R_]]];edges.forEach(([[ax,ay],[bx,by]])=>{const P_=[],I=[],U=[],n=N;for(let i=0;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;let z=F(x,y);if(!isFinite(z))z=lo;P_.push(x,0,y,x,Y0+(z-lo)*sc,y);const u=t*2*R_/2.4;U.push(u,0,u,(Y0+(z-lo)*sc)/2.4)}for(let i=0;i<n;i++){const a=i*2;I.push(a,a+2,a+1,a+1,a+2,a+3)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P_,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);g.computeVertexNormals();const m=new T.Mesh(g,walnut);m.material.side=T.DoubleSide;m.castShadow=m.receiveShadow=true;RM.add(m)});}
  const BL=part('ball',W,true);const bl=put(ball(.2,D.mats.chrome),'steel ball',BL);const tr=put(trail(900,0xff9a6a),'trail',guides);const gA=put(vecArrow(V3(1,0,0),V3(0,0,0),1,0x88c0ff,.2,.12),'−∇f arrow',guides);
  // foreground: a pair of brass dividers lying on the plinth at the lower-right frame edge (the surveyor's tool)
  {const F=part('dividers (foreground)'),q=inDisc(groundAt(orbit,.86,-.84),6.1);F.position.copy(q);F.rotation.y=.5;[-.2,.2].forEach(a=>{const l=cyl(.03,1.6,D.mats.brass,8);l.rotation.set(Math.PI/2,0,0);l.position.set(0,.04,.8);const g=new T.Group();g.rotation.y=a;g.add(l);F.add(g)});const h=cyl(.08,.06,D.mats.brass,16);h.position.y=.05;F.add(h)}
  let bx=2.2,by=1.6,vx=0,vy=0,rest=false,still=0;const grad=(x,y,o)=>{const e=1e-3;o[0]=(F(x+e,y)-F(x-e,y))/(2*e);o[1]=(F(x,y+e)-F(x,y-e))/(2*e);return o},G=[0,0],tmp=V3(0,0,0);
  const height=(x,y)=>Y0+(F(x,y)-lo)*sc;
  SUR.ball=()=>V3(bx,height(bx,by)+.2,by);SUR.Y0=Y0;
  D.label('ball',at(v=>v.set(bx,height(bx,by)+.55,by)),BL);D.label('−∇f',at(v=>gA.visible?v.copy(gA.position).setY(gA.position.y+.25):null),true);D.label('surface · z = '+ex,at(v=>v.set(-R_,Y0+2.9,-R_)),RM);
  ev('ball placed — click the surface to drop it elsewhere',V3(bx,height(bx,by)+.2,by));D.seriesName='height f(ball) — falls toward a minimum';
  return{orbit,
   click(rc){const hit=rc.intersectObject(surf)[0];if(hit){bx=hit.point.x;by=hit.point.z;vx=vy=0;rest=false;still=0;tr.userData.count=0;ev('ball dropped at ('+fx(bx,2)+', '+fx(by,2)+')',hit.point,{sound:'clack'})}},
   step(h){if(rest)return;grad(bx,by,G);const gx=G[0],gy=G[1],s=sc,den=1+s*s*(gx*gx+gy*gy);vx+=(-p.gravity*s*gx/den-p.friction*vx)*h;vy+=(-p.gravity*s*gy/den-p.friction*vy)*h;bx+=vx*h;by+=vy*h;
    if(Math.abs(bx)>R_){bx=Math.sign(bx)*R_;vx=-vx*.5}if(Math.abs(by)>R_){by=Math.sign(by)*R_;vy=-vy*.5}
    if(Math.hypot(vx,vy)<.02&&Math.hypot(gx,gy)<.05){still+=h;if(still>.4){rest=true;ev('at rest: ∇f ≈ 0, a local minimum f = '+fx(F(bx,by),3)+' at ('+fx(bx,2)+', '+fx(by,2)+')',tmp.set(bx,height(bx,by)+.2,by),{color:0x88c0ff,sound:'tick'})}}else still=0},
   visual(){bl.position.set(bx,height(bx,by)+.2,by);tr.add(bl.position);grad(bx,by,G);const m=Math.hypot(G[0],G[1]);gA.visible=m>.02;if(gA.visible){gA.position.copy(bl.position);gA.setDirection(tmp.set(-G[0],0,-G[1]).normalize());gA.setLength(alen(m,1.6,1.4))}D.push(F(bx,by))},
   readouts(){grad(bx,by,G);return[['(x, y)','('+fx(bx,2)+', '+fx(by,2)+')'],['f(x,y)',fx(F(bx,by),3)],['∂f/∂x',fx(G[0],3)],['∂f/∂y',fx(G[1],3)],['|∇f|',fx(Math.hypot(G[0],G[1]),3)],['speed',fx(Math.hypot(vx,vy),3)]]}}}};
{const B=()=>SUR.ball?SUR.ball():V3(0,2.5,0);
 DIO.surface.shots={'ball placed':SHOT([0,2.7,0],11),'ball dropped':SHOT(()=>B().toArray(),7),'at rest':SHOT(()=>B().toArray(),6)};
 DIO.surface.flows={'at rest':[{from:()=>B().add(V3(-1.2,1,0)),to:()=>B().add(V3(-.2,.25,0)),label:'downhill in every direction is uphill: a minimum'}],'ball dropped':[{from:()=>B().add(V3(0,1.2,0)),to:()=>B().add(V3(0,.3,0)),label:'gravity along the slope, −∇f'}]};}

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
   Time base: 1 simulated second = 1 hour of weather; clock() gives the model's time of day ("11:00 · day 1").
   Physics (all in hPa, °C; scene unit = 60 mm at the Goethe glass):
   • Goethe glass: a pear-shaped glass body with a narrow spout fused at the base, rising beside the body, open at
     the top. Sealed at P₀ and T₀ = 15 °C with the water in the spout level with the water in the body. Trapped gas =
     dry air + saturated water vapour: P_in = (P₀ − e(T₀))·(T/T₀)·(V₀/V) + e(T) (Magnus). Water rising h in the spout
     enlarges the air volume by a·h (a = bore area) and lowers the body level by a·h/A, so in equilibrium
     P_in(h) − P = ρ g h (1 + a/A). Solved by bisection each step; the column relaxes to it with τ = 0.3 h.
     The textbook Δh = (P₀T/T₀ − P)/ρg ignores the vapour and the "air spring" (P_in·a/V₀ per unit rise); it is
     shown as its own readout, next to the equilibrium the model actually settles to.
   • Mercury barometer: column h = P / (ρ_Hg g) = 0.750062 mm per hPa; the register window shows 945–1055 hPa.
   • Storm glass (Williams 2025, J. Chem. Educ. 10.1021/acs.jchemed.5c00131): crystals follow the TEMPERATURE of the
     liquid, which lags the air with τ = 1.5 h (thermal mass of glass and solution). Total camphor is conserved,
     c + M = C; solubility S(T) = e^{0.065 (T − 16)}; σ = c/S − 1. Seeded growth on the bottom bed starts at σ > 0;
     fern fronds need fresh nucleation, σ > 0.04 (metastable zone). Growth ∝ σ, dissolution ∝ σ·M^{2/3}. The
     compact seed bed dissolves ~13× slower than fronds (only its top face meets the still, near-saturated liquid
     of a sealed, unstirred tube), so a little undissolved camphor survives near saturation, as in real glasses.
     Fast cooling (> 1.5 K/h) also grows feathery crystals hanging from the top.
   Visual coupling: falling pressure → water rises in the spout, mercury falls, cloud cover and rain increase;
   the key light follows the painted sun (warm, hard shadows in fair weather; dim, cool and flat in storms). */
// Layout shared by the model, its camera shots and its process arrows. Placed so that no instrument hides another
// from the default view (front, slightly right) nor from the card-drawing view (high, from the front-right diagonal).
const WGL={GX:-2.55,GZ:.6,SPX:1.23,WY:1.9,TOP:4.75,YB:.44,RBD:.15,SX:2.2,SZ:1.7,BX:0,BZ:-2.55};
DIO.weatherglass={params:{T:[-5,35,16,'°C','air temperature'],P:[960,1050,1013,'hPa','outside air pressure'],P0:[990,1035,1013,'hPa','pressure when sealed (at 15 °C)'],auto:[0,1,1,'','auto weather (1 on · 0 off)'],conc:[.6,1.4,1,'×','camphor concentration']},
 build(D,p){const W=D.world;D.orb.ph=1.2;const rng=mulberry(42);
  // every part lives in a named group, so the edit list reads "Goethe weather glass", "mercury barometer", …
  const part=(name,parent=W)=>{const g=new THREE.Group();g.name=name;g.userData.label=name;parent.add(g);return g};
  const put=(o,name,parent)=>{o.name=name;if(parent)parent.add(o);return o};
  const deco=o=>{o.userData.noContact=true;o.userData.noInk=true;return o};
  // lights that the environment preset made (the weather dims and tints them)
  const base0=o=>{if(!o.userData.wgBase)o.userData.wgBase={i:o.intensity,p:o.position.clone(),c:o.color.clone()};return o.userData.wgBase}; // originals kept on the light, so a rebuild never compounds the dimming
  const keyL=D.scene.children.find(o=>(o.isDirectionalLight||o.isSpotLight)&&o.castShadow),key0=keyL?base0(keyL).i:0;
  const keyT=keyL&&keyL.target?keyL.target.position.clone():V3(0,1.2,0),keyD=keyL?base0(keyL).p.distanceTo(keyT):14;
  const envLights=D.scene.children.filter(o=>o.isLight&&o!==keyL).map(l=>[l,base0(l).i]);if(D.scene.userData.wgEnv0==null)D.scene.userData.wgEnv0=D.scene.environmentIntensity??.85;const env0=D.scene.userData.wgEnv0;

  // ---------- materials ----------
  const shell=thinGlass({side:THREE.FrontSide,absorb:.03,edge:.9});            // glass with real wall thickness (two lathe surfaces)
  const film=thinGlass({side:THREE.DoubleSide,absorb:.05,edge:1,card:.35});    // single-surface glass (register glass, lens)
  const oldGlass=thinGlass({side:THREE.FrontSide,absorb:.38,edge:1,color:0x1d3a2e,env:2.4});   // Goethe body: hand-blown, green-grey, dense enough that the empty upper pear reads as glass (not as a bowl of water with nothing above)
  const oldTube=thinGlass({side:THREE.DoubleSide,absorb:.38,edge:1,color:0x1d3a2e,env:2.4,card:.35}); // the spout, same glass: its empty upper part stays visible up to the open lip
  const mkWater=()=>{const m=makeMaterial({preset:'liquid',color:'#2f7fcf'});m.color.set('#8cc0ee');m.transmission=.6;m.attenuationDistance=1.2;m.thickness=1.6;m.roughness=.02;return m},water=mkWater(); // tinted (blue) water, as real Goethe glasses use
  const spoutW=makeMaterial({preset:'plastic',color:'#2a7ad0'});spoutW.normalMap=null;spoutW.roughness=.05;spoutW.clearcoat=1;spoutW.clearcoatRoughness=.03;spoutW.emissive=new THREE.Color(0x0d3866);spoutW.emissiveIntensity=.6;spoutW.envMapIntensity=1.3; // the narrow column: dense tinted water so its level reads across the room
  const menM=makeMaterial({preset:'plastic',color:'#d8ecff'});menM.normalMap=null;menM.roughness=.04;menM.clearcoat=1;menM.emissive=new THREE.Color(0x5a88b8);menM.emissiveIntensity=.5; // bright meniscus rim (light caught by the curved surface)
  const sol=thinGlass({side:THREE.FrontSide,absorb:.1,edge:1,color:0x161208,ior:1.36,smudge:false,env:1.15});     // ethanol–water camphor solution (clear; crystals inside stay crisp)
  const merc=makeMaterial('mercury');merc.color.set(0xf4f6f8);merc.roughness=.06;merc.envMapIntensity=2.4;merc.emissive=new THREE.Color(0x8a929c);merc.emissiveIntensity=.42; // liquid metal: mirror-bright, a little self-light so it reads in dull weather
  const brass=makeMaterial('brass'),walnut=makeMaterial('walnut'),cork=makeMaterial('cork'),crystM=makeMaterial('crystal');crystM.color.set('#b8c2c9');crystM.emissiveIntensity=.02;crystM.sheen=.3;crystM.envMapIntensity=.9;
  const lathe=(pts,mat,seg=96)=>{const m=new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(Math.max(.0005,x),y)),seg),mat);m.castShadow=true;m.receiveShadow=true;return m};
  // glass shell from an outer profile: outer surface up, inner surface (offset by wall thickness) back down
  const shellPts=(outer,t)=>{const inner=[];for(let i=0;i<outer.length;i++){const a=outer[Math.max(0,i-1)],b=outer[Math.min(outer.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;inner.push([outer[i][0]-dy/L*t,outer[i][1]+dx/L*t])}return outer.concat(inner.reverse())};
  const smooth=(pts,n=6)=>{const c=new THREE.SplineCurve(pts.map(([x,y])=>new THREE.Vector2(x,y)));return c.getPoints(pts.length*n).map(v=>[v.x,v.y])};
  const fixedBox=(m,min,max)=>{m.boundingBox=new THREE.Box3(min,max);m.boundingSphere=m.boundingBox.getBoundingSphere(new THREE.Sphere());return m}; // instanced meshes: bounds of the fully grown set, for framing

  // ---------- painted backdrop: sky, three cloud decks, three hill ranges with aerial perspective, meadow ----------
  // The painted world is a full circle (every layer is a BackSide cylinder, so from outside only its far half draws):
  // whichever way the director's camera turns there is sky and land behind the instruments, never the studio dark.
  // Outside the cylinder (frame corners, above its rim) the scene background and fog take the sky's own colours.
  // The sun, stars and rain keep to the back arc (SA0 … SA0+SAL), the part the default view looks at.
  const A0=0,AL=Math.PI*2,SA0=Math.PI*.45,SAL=Math.PI*1.1,H=7.9,FW=.42,sector=(r,h,y0=0)=>{const g=new THREE.CylinderGeometry(r,r,h,192,1,true,A0,AL);g.translate(0,y0+h/2,0);return g};
  const skyHook=(m,mode,key,extra={})=>{ // mode: 'alpha' (veils), 'color' (opaque, unlit), 'albedo' (lit ground); a full circle has no end fade
    const U=Object.assign({uFadeA:{value:new THREE.Vector3(A0-1,A0+AL+1,FW)},uFadeCol:{value:new THREE.Color(mode==='albedo'?0x1d3125:0x0d0a07)},uArc:{value:new THREE.Vector2(SA0,SAL)}},extra.uniforms||{});m.userData.skyU=U;
    m.defines=Object.assign({},m.defines,{['SM_SKY_'+key.toUpperCase()]:''});
    m.onBeforeCompile=s=>{Object.assign(s.uniforms,U);
      s.vertexShader='varying float vSkyA;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSkyA=atan(position.x,position.z); if(vSkyA<0.) vSkyA+=6.2831853;');
      const fa='float skyF=smoothstep(uFadeA.x,uFadeA.x+uFadeA.z,vSkyA)*smoothstep(uFadeA.y,uFadeA.y-uFadeA.z,vSkyA);\n';
      let f='uniform vec3 uFadeA;\nuniform vec3 uFadeCol;\nuniform vec2 uArc;\nvarying float vSkyA;\n'+(extra.decl||'')+s.fragmentShader;
      if(extra.map)f=f.replace('#include <map_fragment>',extra.map);
      if(mode==='albedo')f=f.replace('#include <map_fragment>','#include <map_fragment>\n'+fa+'diffuseColor.rgb=mix(uFadeCol,diffuseColor.rgb,skyF);');
      else f=f.replace('#include <opaque_fragment>',fa+(mode==='alpha'?'diffuseColor.a*=skyF;':'outgoingLight=mix(uFadeCol,outgoingLight,skyF);')+'\n#include <opaque_fragment>');
      s.fragmentShader=f};
    m.customProgramCacheKey=()=>'smsky-'+key;return m};
  // sky: vertical gradient + sun halo, repainted as the hour and the cloud cover change
  const skyCv=document.createElement('canvas');skyCv.width=192;skyCv.height=96;const skyTex=new THREE.CanvasTexture(skyCv);skyTex.colorSpace=THREE.SRGBColorSpace;
  const back=deco(put(new THREE.Mesh(sector(6.62,H),skyHook(new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,fog:false}),'color','sky')),'backdrop sky',W));
  // beyond the painted cylinder: a screen-space gradient in the same sky colours (repainted with the sky), and fog of the
  // horizon colour, so frame corners and the space above the rim read as haze, not as a black studio
  const bgCv=document.createElement('canvas');bgCv.width=4;bgCv.height=128;const bgTex=new THREE.CanvasTexture(bgCv);bgTex.colorSpace=THREE.SRGBColorSpace;
  D.scene.background=bgTex;D.scene.fog=new THREE.Fog(0x9fb3c6,40,160);
  if(D.scene.userData.look)D.scene.userData.look.vignette=Math.min(D.scene.userData.look.vignette??.32,.2);
  // cloud decks, lit in the shader: alpha = density rank; threshold 1 − cover; optical depth marched toward the sun
  const CLOUD_GLSL=`#ifdef USE_MAP
    float smLo=1.-uCover,smW=.2;
    float smD=texture2D(map,vMapUv).a;
    float smA=smoothstep(smLo-.03,smLo+smW,smD);
    float smU=(vSkyA-uArc.x)/uArc.y;
    vec2 smDir=normalize(vec2(clamp((uSun.x-smU)*5.,-1.,1.)*.8,.35+.65*uSun.y));
    float smOD=0.;
    for(int i=1;i<=5;i++){smOD+=smoothstep(smLo-.03,smLo+smW,texture2D(map,vMapUv+smDir*uStep*float(i)).a)*(1.-float(i)*.12);}
    smOD/=3.2;
    float smCore=smoothstep(smLo+.05,smLo+.55,smD);
    float smLit=clamp(exp(-2.4*smOD)*(1.-.35*smCore),0.,1.);
    vec3 smCol=mix(uShade,uLit,smLit)+uLit*.45*smA*(1.-smA)*(1.-smOD);
    diffuseColor.rgb*=smCol;diffuseColor.a*=smA;
  #endif`;
  const decks=[];const cloudDeck=(r,h,y0,seed,rep,speed,name,o,ro)=>{const t=cloudDensity(seed,768,192,o).clone();t.repeat.set(rep,1);t.needsUpdate=true;
    const arc=r*AL/rep,U={uCover:{value:.3},uLit:{value:new THREE.Color(1,1,1)},uShade:{value:new THREE.Color(.6,.65,.72)},uSun:{value:new THREE.Vector2(.5,.8)},uStep:{value:new THREE.Vector2(.026*h/arc,.026)}};
    const m=skyHook(new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.BackSide,fog:false}),'alpha','cloud',{uniforms:U,decl:'uniform float uCover;\nuniform vec3 uLit;\nuniform vec3 uShade;\nuniform vec2 uSun;\nuniform vec2 uStep;\n',map:CLOUD_GLSL});
    const me=deco(put(new THREE.Mesh(sector(r,h,y0),m),name,W));me.renderOrder=ro;decks.push({m,t,U,speed});return me};
  // hills sink into the meadow toward the sector ends (the ridge is looked up higher in the texture as the fade grows)
  const HILL_GLSL=`#ifdef USE_MAP
    float hlF=smoothstep(uFadeA.x,uFadeA.x+uFadeA.z*1.3,vSkyA)*smoothstep(uFadeA.y,uFadeA.y-uFadeA.z*1.3,vSkyA);
    diffuseColor*=texture2D(map,vec2(vMapUv.x,vMapUv.y+(1.-hlF)*.85));
  #endif`;
  const hills=(r,h,seed,rough,ht,name)=>{const t=hillRidge(seed,1024,256,rough,ht).clone();t.repeat.set(5,1);t.needsUpdate=true;const m=skyHook(new THREE.MeshBasicMaterial({map:t,alphaTest:.5,alphaToCoverage:true,side:THREE.BackSide,fog:false}),'color','hill',{map:HILL_GLSL});deco(put(new THREE.Mesh(sector(r,h,0),m),name,W));return m};
  const hazeTex=(()=>{const c=document.createElement('canvas');c.width=4;c.height=128;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.55,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,.9)');g.fillStyle=gr;g.fillRect(0,0,4,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
  const haze=(r,h,o,name,ro)=>{const m=skyHook(new THREE.MeshBasicMaterial({map:hazeTex,transparent:true,depthWrite:false,side:THREE.BackSide,opacity:o,fog:false}),'alpha','haze');const me=deco(put(new THREE.Mesh(sector(r,h,0),m),name,W));me.renderOrder=ro;return m};
  const sunG=deco(put(new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3),new THREE.MeshBasicMaterial({map:softDisc(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:0xfff0c8,fog:false})),'sun',W));sunG.renderOrder=-9;
  const starG=new THREE.BufferGeometry(),sp=[];for(let i=0;i<260;i++){const a=SA0-.3+rng()*(SAL+.6),y=2.5+rng()*5.2;sp.push(Math.sin(a)*6.58,y,Math.cos(a)*6.58)}starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  const starP=put(new THREE.Points(starG,new THREE.PointsMaterial({size:.035,color:0xffffff,transparent:true,opacity:0,depthWrite:false,fog:false})),'night stars',W);starP.renderOrder=-9;
  cloudDeck(6.5,4.6,3.2,11,3,.004,'cloud deck (upper)',{fx:5,base:.12,tall:.7,stratus:.3},-8);
  const hillFar=hills(6.4,2.6,5,1,.62,'hills (far)'),hazeFar=haze(6.34,2.4,.55,'haze over the far hills',-7);
  const deckMid=cloudDeck(6.25,3.6,1.9,23,4,.009,'cloud deck (middle)',{fx:6,base:.2,tall:.6,stratus:.2},-6);
  const hillMid=hills(6.2,2.1,7,1.2,.55,'hills (middle)'),hazeMid=haze(6.15,1.7,.4,'haze over the middle hills',-5);
  const hillNear=hills(6.06,1.8,9,1.4,.62,'hills (near)'),hazeNear=haze(6.0,1.0,.22,'haze over the near hills',-4);
  const scud=cloudDeck(5.88,2.6,1.2,37,5,.02,'storm scud (low cloud)',{fx:8,base:.15,tall:.45,stratus:.5},-3);
  // meadow strip under the sky: grass that gets wet (darker, clearcoated) when it rains; a fence and hedges for scale
  const MW=part('meadow (grass, hedges, fence)');
  const gr=new THREE.RingGeometry(4.75,6.55,192,4);gr.rotateX(-Math.PI/2);
  const rp6=t=>{const c=t.clone();c.repeat.set(7,7);c.needsUpdate=true;return c};const groundM=aaaMaterial('meadow',{tile:1.25,depth:.032,moss:1,bound:{type:'ring',x:0,z:0,rIn:4.75,rOut:6.55},pdo:false}); // AAA meadow (js/gfx/aaa.js): relief, fractured edges; rain wets it (see the weather below)
  const ground=deco(put(new THREE.Mesh(gr,groundM),'meadow ground',MW));ground.position.y=.02;ground.receiveShadow=true;
  const inMeadow=()=>rng()*AL;
  {const GN=1600,blade=new THREE.ConeGeometry(.012,.16,3);blade.translate(0,.08,0);const gm=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.8,sheen:.5,sheenColor:new THREE.Color(0xc8e090)});const tufts=put(new THREE.InstancedMesh(blade,gm,GN),'grass tufts',MW);tufts.userData.noInk=true;tufts.receiveShadow=true;const mm=new THREE.Matrix4(),qq=new THREE.Quaternion(),cc=new THREE.Color();
   for(let i=0;i<GN;i++){const a=inMeadow(),r=4.72+Math.pow(rng(),2.2)*1.75,h=.5+rng()*1.1;qq.setFromEuler(new THREE.Euler((rng()-.5)*.6,rng()*6,(rng()-.5)*.6));mm.compose(V3(Math.sin(a)*r,.02,Math.cos(a)*r),qq,V3(1,h,1));tufts.setMatrixAt(i,mm);tufts.setColorAt(i,cc.setHSL(.2+rng()*.08,.45+rng()*.2,.16+rng()*.14))}tufts.computeBoundingBox();tufts.computeBoundingSphere()}
  const fenceM=makeMaterial('darkwood');
  const hedges=part('hedges',MW),fence=part('fence',MW);
  {const items=[];for(let i=0;i<26;i++){const a=(i+rng()*.5)/26*AL,r=5.0+rng()*.25,s=.16+rng()*.16;items.push({x:Math.sin(a)*r,y:0,z:Math.cos(a)*r,h:s*2.4,ry:rng()*6.28})}const hf=treeForest('bush',items,{color:'#34502a',seed:5});hf.traverse(o=>{o.userData.noInk=true});hedges.add(hf)} // procedural hedge bushes (js/dio/trees.js)
  {const postG=new THREE.BoxGeometry(.05,.42,.05);for(let i=0;i<36;i++){const a=i/36*AL,r=5.55;const post=new THREE.Mesh(postG,fenceM);post.position.set(Math.sin(a)*r,.21,Math.cos(a)*r);post.rotation.y=a;post.castShadow=true;post.userData.noInk=true;fence.add(post)}}
  [.18,.34].forEach(y=>{const rail=new THREE.Mesh(new THREE.TorusGeometry(5.55,.016,5,192),fenceM);rail.rotation.x=Math.PI/2;rail.position.y=y;rail.userData.noInk=true;fence.add(rail)});
  // rain: streaks of varied length, speed and opacity (RGBA vertex colours; the tail fades), splash rings on the meadow
  const RAIN=part('rain');
  const RN=760,rp=new Float32Array(RN*6),rc=new Float32Array(RN*8),RD=[];const rainBand=()=>{const a=SA0+rng()*SAL,r=4.85+rng()*1.55;return[Math.sin(a)*r,Math.cos(a)*r]};
  for(let i=0;i<RN;i++){const [x,z]=rainBand();RD.push({x,z,y:rng()*H,L:.14+rng()*.38,v:6.5+rng()*5,a:.18+rng()*.5});rc.set([.75,.82,.9,0,.85,.9,.97,RD[i].a],i*8)}
  const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(rp,3));rainG.setAttribute('color',new THREE.BufferAttribute(rc,4));
  const rain=put(new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false})),'rain streaks',RAIN);rain.frustumCulled=false;
  const SPN=90,splash=put(new THREE.InstancedMesh(new THREE.RingGeometry(.6,1,20).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xd8e6f0,transparent:true,opacity:.55,depthWrite:false}),SPN),'splashes',RAIN);splash.frustumCulled=false;splash.userData.noInk=true;fixedBox(splash,V3(-6.6,0,-6.6),V3(6.6,.1,1.2));const SPL=[];let spI=0;

  // ---------- Goethe weather glass (left): pear-shaped body (low belly, long tapering shoulder, sealed tip); the spout
  // leaves the foot of the belly with a short tight bend and rises straight up close beside the body, open at the top ----------
  const GW=part('Goethe weather glass');GW.userData.role='actor';
  const {GX,GZ,WY,TOP,YB,RBD}=WGL,S_MM=60,WALL=.026;
  const body=smooth([[.001,.3],[.42,.32],[.82,.42],[1.04,.62],[1.12,.9],[1.08,1.22],[.96,1.58],[.83,1.95],[.72,2.35],[.6,2.8],[.47,3.3],[.34,3.8],[.22,4.25],[.13,4.55],[.07,4.68],[.001,4.72]],5);
  const flask=put(lathe(shellPts(body,WALL),oldGlass,128),'glass body (trapped air above the water)',GW);flask.position.set(GX,0,GZ);flask.castShadow=false;
  const rIn=y=>{for(let i=1;i<body.length;i++)if(body[i][1]>=y){const a=body[i-1],b=body[i],t=(y-a[1])/((b[1]-a[1])||1);return a[0]+(b[0]-a[0])*t-WALL}return 0};
  const foot=put(lathe(smooth([[.001,0],[1.3,0],[1.33,.06],[1.2,.1],[.95,.13],[.62,.2],[.46,.27],[.001,.27]],4),walnut,96),'turned walnut stand',GW);foot.position.set(GX,0,GZ);
  const collar=put(new THREE.Mesh(new THREE.TorusGeometry(.45,.03,10,64),brass),'brass collar',GW);collar.rotation.x=Math.PI/2;collar.position.set(GX,.29,GZ);
  // water in the body: a lathe that follows the inner wall up to the water line, closed by a flat free surface that meets
  // the glass (no rim); its volume barely changes, so it is built once at the fill level
  let V0=0;for(let y=WY;y<4.75;y+=.01){const r=Math.max(0,rIn(y));V0+=Math.PI*r*r*.01}
  const A_fl=Math.PI*rIn(WY)**2,RB=.05,a_sp=Math.PI*RB*RB;
  const wprof=[[.001,.33]];for(let y=.34;y<WY-.01;y+=.03)wprof.push([rIn(y)*.995,y]);wprof.push([rIn(WY)*.995,WY]);
  const fw=put(lathe(wprof,water,96),'water in the body',GW);fw.position.set(GX,0,GZ);fw.castShadow=false;
  const wsM=new THREE.MeshPhysicalMaterial({color:0x2f69a3,roughness:.06,metalness:0,envMapIntensity:.55,specularIntensity:.55}); /* the free surface seen from above: deep blue, glossy, never a pale lid */const wSurf=new THREE.Mesh(new THREE.CircleGeometry(rIn(WY)*.995,96).rotateX(-Math.PI/2),wsM);wSurf.position.y=WY;wSurf.name='water surface';wSurf.castShadow=false;fw.add(wSurf);
  // spout: a short stub out of the foot of the belly, a tight quarter bend, then straight up beside the body to an open lip;
  // a small glass weld at the belly ties it to the body
  const SPG=part('spout (open to the air)',GW);
  const SXp=GX+WGL.SPX,SB=YB+RBD,xW=GX+rIn(YB)+WALL*.5;
  const stub=new THREE.LineCurve3(V3(xW-.05,YB,GZ),V3(SXp-RBD,YB,GZ)),bend=new THREE.QuadraticBezierCurve3(V3(SXp-RBD,YB,GZ),V3(SXp,YB,GZ),V3(SXp,SB,GZ)),straight=new THREE.LineCurve3(V3(SXp,SB,GZ),V3(SXp,TOP,GZ));
  const spPath=new THREE.CurvePath();[stub,bend,straight].forEach(c=>spPath.add(c));
  const spout=put(new THREE.Mesh(new THREE.TubeGeometry(spPath,260,RB+WALL,20,false),oldTube),'spout tube',SPG);spout.castShadow=false;
  const lip=put(new THREE.Mesh(new THREE.TorusGeometry(RB+WALL+.012,.02,10,32),oldGlass),'open lip',SPG);lip.rotation.x=Math.PI/2;lip.position.set(SXp,TOP,GZ);
  const mark=put(new THREE.Mesh(new THREE.TorusGeometry(RB+WALL+.006,.007,6,32),brass),'level mark (spout = body when sealed)',SPG);mark.rotation.x=Math.PI/2;mark.position.set(SXp,WY,GZ);
  {const yW=.95,x0=GX+rIn(yW)+WALL*.6,x1=SXp-RB-WALL*.4,wd=new THREE.Mesh(new THREE.CylinderGeometry(.034,.034,Math.max(.02,x1-x0),12),oldGlass);wd.rotation.z=Math.PI/2;wd.position.set((x0+x1)/2,yW,GZ);put(wd,'fused glass weld',SPG)}
  const SCG=part('spout water column',SPG);
  const bendP=new THREE.CurvePath();bendP.add(stub);bendP.add(bend);
  const bendW=put(new THREE.Mesh(new THREE.TubeGeometry(bendP,40,RB*.97,16,false),spoutW),'water in the bend',SCG);bendW.castShadow=false;
  const colG=new THREE.CylinderGeometry(RB*.97,RB*.97,1,20,1,true);colG.translate(0,.5,0);const col=put(new THREE.Mesh(colG,spoutW),'water column',SCG);col.position.set(SXp,SB,GZ);col.castShadow=false;
  const menisc=put(new THREE.Mesh(new THREE.LatheGeometry([[RB*.97,0],[RB*.8,-.02],[RB*.5,-.034],[.001,-.04]].map(([x,y])=>new THREE.Vector2(x,y)),20),spoutW),'meniscus (concave)',SCG);
  const menRing=put(new THREE.Mesh(new THREE.TorusGeometry(RB*.9,.008,6,24),menM),'meniscus rim',SCG);menRing.rotation.x=Math.PI/2;
  const DN=40,dropM=put(new THREE.InstancedMesh(new THREE.SphereGeometry(.035,10,8),spoutW,DN),'spilled drops',SPG);dropM.userData.noInk=true;dropM.frustumCulled=false;fixedBox(dropM,V3(SXp-.1,0,GZ-.1),V3(SXp+.6,TOP+.1,GZ+.1));const drops=[];

  // ---------- storm glass (right) ----------
  const SG=part('storm glass');SG.userData.role='actor';
  const {SX,SZ}=WGL,SR=.5,SY0=.42,STOP=4.05;
  const tubeOut=smooth([[.001,SY0],[.3,SY0+.02],[.46,SY0+.1],[SR,SY0+.3],[SR,STOP-.2],[SR*.97,STOP]],4);
  const tube=put(lathe(shellPts(tubeOut,.035),shell,96),'sealed glass tube',SG);tube.position.set(SX,0,SZ);tube.castShadow=false;
  const sIn=SR-.035,LIQ=STOP-.4;
  const lp=[[.001,SY0+.04],[.28,SY0+.06],[sIn*.97,SY0+.32],[sIn*.995,LIQ+.03]];for(let i=1;i<=8;i++){const t=i/8;lp.push([sIn*.995*(1-t),LIQ+.03*Math.pow(1-t,3)])}
  const liq=put(lathe(lp,sol,96),'camphor solution',SG);liq.position.set(SX,0,SZ);liq.castShadow=false;
  const corkP=put(lathe([[.001,STOP-.32],[sIn*.98,STOP-.32],[sIn*.995,STOP+.02],[.001,STOP+.02]],cork,48),'cork seal',SG);corkP.position.set(SX,0,SZ);
  const capT=put(lathe(smooth([[.001,STOP+.24],[.3,STOP+.24],[SR+.05,STOP+.2],[SR+.06,STOP+.05],[SR+.07,STOP-.18],[SR+.045,STOP-.2]],4).concat([[SR+.01,STOP-.2],[SR+.01,STOP+.18],[.001,STOP+.18]]).reverse(),brass,64),'brass cap',SG);capT.position.set(SX,0,SZ);
  const knob=put(new THREE.Mesh(new THREE.SphereGeometry(.09,24,16),brass),'cap knob',SG);knob.position.set(SX,STOP+.3,SZ);knob.castShadow=true;
  const baseS=put(lathe(smooth([[.001,0],[.95,0],[.98,.07],[.85,.12],[.72,.2],[.66,.42],[.6,.44],[.56,.3],[.001,.3]],4),walnut,96),'walnut base',SG);baseS.position.set(SX,0,SZ);
  const ringS=put(new THREE.Mesh(new THREE.TorusGeometry(.64,.03,10,64),brass),'brass ring',SG);ringS.rotation.x=Math.PI/2;ringS.position.set(SX,.44,SZ);
  // camphor crystals: fern-like dendrites (instanced elongated shards) + a compact seed bed at the bottom
  const CG=part('camphor crystals',SG);
  const SH=[];const clampIn=(v)=>{const dx=v.x-SX,dz=v.z-SZ,d=Math.hypot(dx,dz),m=sIn-.05;if(d>m){v.x=SX+dx/d*m;v.z=SZ+dz/d*m}return v};
  const bm=new THREE.Matrix4(),bx=V3(),by=V3(),bz=V3();let plane=V3(0,0,1);
  const addShard=(pos,dir,len,wid,th,grp)=>{by.copy(dir).normalize();bz.copy(plane).addScaledVector(by,-plane.dot(by)).normalize();bx.crossVectors(by,bz);bm.makeBasis(bx,by,bz);const q=new THREE.Quaternion().setFromRotationMatrix(bm);SH.push({p:clampIn(pos.clone()),q,s:V3(wid,len*.5,wid*.25),th,grp})};
  const frond=(o,dir,len,grp,th0=0,thSpan=1)=>{const side=V3(rng()-.5,0,rng()-.5).cross(dir).normalize();plane=side.clone().cross(dir).normalize();const n=14+Math.floor(rng()*6),d=dir.clone().normalize(),curl=V3(rng()-.5,rng()*.2,rng()-.5).multiplyScalar(.04);let pnt=o.clone();
    for(let i=0;i<n;i++){const t=i/n,seg=len/n;d.add(curl).normalize();const mid=pnt.clone().addScaledVector(d,seg*.5);addShard(mid,d,seg*1.15,.013*(1-.5*t),th0+thSpan*t*.75,grp);
      const ll=len*.3*Math.pow(1-t,.6)*(.75+rng()*.4),sd=side.clone().applyAxisAngle(d,(rng()-.5)*.25);[-1,1].forEach(sg=>{const ld=d.clone().multiplyScalar(.5).addScaledVector(sd,sg*.87).normalize(),m=6;for(let j=0;j<m;j++){const pp=pnt.clone().addScaledVector(ld,ll*(j+.5)/m);addShard(pp,ld,ll/m*1.25,.008*(1-.6*j/m),th0+thSpan*(t*.75+.25*(j+1)/m),grp);if(j%2===1&&t<.7){const bd=ld.clone().multiplyScalar(.5).addScaledVector(d,.87).normalize();addShard(pp.clone().addScaledVector(bd,ll*.08),bd,ll*.16,.005,th0+thSpan*(t*.75+.25*(j+1.5)/m),grp)}}});
      pnt.addScaledVector(d,seg)}};
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2+rng()*.5,r=.1+rng()*.24;const o=V3(SX+Math.cos(a)*r,SY0+.16+rng()*.08,SZ+Math.sin(a)*r);frond(o,V3(Math.cos(a)*(.25+rng()*.35),1,Math.sin(a)*(.25+rng()*.35)),.8+rng()*1.4,0,rng()*.2,.8)}
  for(let i=0;i<5;i++){const a=i/4*Math.PI*2+.4,o=V3(SX+Math.cos(a)*.18,LIQ-.04,SZ+Math.sin(a)*.18);frond(o,V3(Math.cos(a)*.5,-1,Math.sin(a)*.5),.55+rng()*.4,1,0,1)}
  const tubeBox=[V3(SX-sIn,SY0,SZ-sIn),V3(SX+sIn,LIQ,SZ+sIn)];
  const shards=put(new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),crystM,SH.length),'fern fronds',CG);shards.userData.noInk=true;shards.castShadow=false;shards.frustumCulled=false;fixedBox(shards,...tubeBox);
  const BASEN=130,BC=[];for(let i=0;i<BASEN;i++){const a=rng()*Math.PI*2,r=Math.pow(rng(),.7)*(sIn-.1),h=.05*(1-r/sIn)+rng()*.03;BC.push({p:V3(SX+Math.cos(a)*r,SY0+.07+h,SZ+Math.sin(a)*r),q:new THREE.Quaternion().setFromEuler(new THREE.Euler(rng()*3,rng()*3,rng()*3)),s:.016+rng()*.026,th:r/sIn*.7+rng()*.3})}
  const bedM=crystM.clone();bedM.color.set('#e6ebee');bedM.emissiveIntensity=.08;const baseC=put(new THREE.InstancedMesh(new THREE.CylinderGeometry(.6,.6,1.6,6),bedM,BASEN),'seed bed (compact crystals)',CG);baseC.userData.noInk=true;baseC.frustumCulled=false;fixedBox(baseC,V3(SX-sIn,SY0,SZ-sIn),V3(SX+sIn,SY0+.3,SZ+sIn));
  // a faint milky layer just above the bed: undissolved micro-crystals near saturation
  const bedHaze=(()=>{const c=document.createElement('canvas');c.width=4;c.height=64;const g=c.getContext('2d'),q=g.createLinearGradient(0,0,0,64);q.addColorStop(0,'rgba(255,255,255,0)');q.addColorStop(.7,'rgba(255,255,255,.55)');q.addColorStop(1,'rgba(255,255,255,.9)');g.fillStyle=q;g.fillRect(0,0,4,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
  const hz=put(new THREE.Mesh(new THREE.CylinderGeometry(sIn*.96,sIn*.96,.7,32,1,true),new THREE.MeshBasicMaterial({map:bedHaze,color:0xe8ecee,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})),'milky haze near the bed',CG);hz.position.set(SX,SY0+.38,SZ);deco(hz);hz.renderOrder=3;
  const specG=new THREE.BufferGeometry(),specN=160,specP=new Float32Array(specN*3);for(let i=0;i<specN;i++){const a=rng()*6.283,r=Math.sqrt(rng())*(sIn-.06);specP.set([SX+Math.cos(a)*r,SY0+.25+Math.pow(rng(),1.6)*(LIQ-SY0-.4),SZ+Math.sin(a)*r],i*3)}specG.setAttribute('position',new THREE.BufferAttribute(specP,3));
  const specks=put(new THREE.Points(specG,new THREE.PointsMaterial({size:.02,color:0xffffff,transparent:true,opacity:0,depthWrite:false})),'suspended microcrystals',CG);

  // ---------- stick barometer (back): carved walnut case, engraved brass register, mercury tube, vernier, thermometer ----------
  const BG=part('mercury barometer');BG.userData.role='actor';
  const {BX,BZ}=WGL,PY0=3.35,PH=2.9,PMIN=945,PMAX=1055,yOfP=P=>PY0+(P-PMIN)/(PMAX-PMIN)*PH;
  const cs=new THREE.Shape();cs.moveTo(-.28,.75);cs.lineTo(.28,.75);cs.lineTo(.28,3.05);cs.quadraticCurveTo(.3,3.18,.5,3.22);cs.lineTo(.5,6.35);cs.absarc(0,6.35,.5,0,Math.PI,false);cs.lineTo(-.5,3.22);cs.quadraticCurveTo(-.3,3.18,-.28,3.05);cs.lineTo(-.28,.75);
  const caseG=new THREE.ExtrudeGeometry(cs,{depth:.16,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:3,curveSegments:32});
  const uvb=caseG.attributes.uv;for(let i=0;i<uvb.count;i++)uvb.setXY(i,uvb.getY(i)/2.4,uvb.getX(i)/2.4); // grain runs up the trunk
  const caseM=put(new THREE.Mesh(caseG,walnut),'carved walnut case',BG);caseM.position.set(BX,0,BZ-.08);caseM.castShadow=true;caseM.receiveShadow=true;
  const plinthB=put(new THREE.Mesh(alignUV(new THREE.BoxGeometry(.9,.12,.5)),walnut),'case foot',BG);plinthB.position.set(BX,.06,BZ);plinthB.castShadow=true;
  const cist=put(lathe(smooth([[.001,.12],[.3,.12],[.34,.2],[.3,.34],[.36,.5],[.33,.64],[.24,.72],[.2,.8],[.001,.8]],4),walnut,64),'cistern cover',BG);cist.position.set(BX,0,BZ+.1);
  const cistRing=put(new THREE.Mesh(new THREE.TorusGeometry(.355,.02,8,48),brass),'cistern ring',BG);cistRing.rotation.x=Math.PI/2;cistRing.position.set(BX,.5,BZ+.1);
  const fin=put(lathe(smooth([[.001,0],[.1,0],[.12,.05],[.07,.12],[.11,.22],[.06,.32],[.03,.4],[.001,.42]],5),brass,32),'finial',BG);fin.position.set(BX,6.85+.03,BZ);
  // engraved register plate: colour map + roughness(G)/metalness(B) map from one drawing; a dark enamel channel behind the tube
  const CH0=212,CH1=300;
  const plate=(()=>{const w=512,h=Math.round(512*PH/.82),c1=document.createElement('canvas'),c2=document.createElement('canvas');c1.width=c2.width=w*2;c1.height=c2.height=h*2;const g=c1.getContext('2d'),q=c2.getContext('2d');g.scale(2,2);q.scale(2,2);
    const gb=g.createLinearGradient(0,0,w,0);gb.addColorStop(0,'#c9a35a');gb.addColorStop(.5,'#e4c784');gb.addColorStop(1,'#c29c55');g.fillStyle=gb;g.fillRect(0,0,w,h);
    const r2=mulberry(3);for(let i=0;i<2600;i++){g.fillStyle=`rgba(${r2()<.5?'90,60,20':'255,240,200'},${r2()*.03})`;g.fillRect(0,r2()*h,w,1)}
    q.fillStyle='rgb(0,140,215)';q.fillRect(0,0,w,h);
    const Y=P=>h-(P-PMIN)/(PMAX-PMIN)*h,line=(x0,y0,x1,y1,lw)=>{[g,q].forEach((c,k)=>{c.strokeStyle=k?'rgb(0,235,20)':'#0e0803';c.lineWidth=lw;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke()})};
    const text=(s,x,y,size,al='center',font='Georgia, serif')=>{[g,q].forEach((c,k)=>{c.font=size+'px '+font;c.textAlign=al;c.textBaseline='middle';c.fillStyle=k?'rgb(0,235,20)':'#0e0803';c.fillText(s,x,y)});g.fillStyle='rgba(255,236,190,.35)';g.font=size+'px '+font;g.textAlign=al;g.fillText(s,x+1,y+1.5)};
    const chg=g.createLinearGradient(CH0,0,CH1,0);chg.addColorStop(0,'#0c0f14');chg.addColorStop(.5,'#232a36');chg.addColorStop(1,'#0c0f14');g.fillStyle=chg;g.fillRect(CH0,0,CH1-CH0,h);q.fillStyle='rgb(0,70,0)';q.fillRect(CH0,0,CH1-CH0,h); // black enamel slot: the silver column stands out against it
    line(CH0,0,CH0,h,3);line(CH1,0,CH1,h,3);line(8,0,8,h,2);line(w-8,0,w-8,h,2);
    for(let P=PMIN;P<=PMAX;P++){const y=Y(P),L=P%10===0?44:P%5===0?28:15;line(CH0-L,y,CH0,y,P%10===0?3:1.6);if(P%10===0)text(String(P),CH0-76,y,30)}
    for(let i=Math.ceil(PMIN/33.8639*20);i<=Math.floor(PMAX/33.8639*20);i++){const inHg=i/20,y=Y(inHg*33.8639),big=i%10===0,mid=i%2===0;line(CH1,y,CH1+(big?44:mid?26:13),y,big?3:1.4);if(mid)text(inHg.toFixed(1),CH1+(big?88:76),y,big?30:21)}
    text('hPa',CH0-68,26,26);text('inHg',CH1+76,26,26);
    [['STORMY',965],['RAIN',985],['CHANGE',1000],['FAIR',1020],['SET FAIR',1035],['VERY DRY',1048]].forEach(([s,P])=>text(s,58,Y(P),21,'center','Georgia, serif'));
    const t1=new THREE.CanvasTexture(c1);t1.colorSpace=THREE.SRGBColorSpace;t1.anisotropy=8;const t2=new THREE.CanvasTexture(c2);t2.anisotropy=8;return[t1,t2]})();
  const REG=part('register (scale plates, bezel, glass)',BG);
  const plateM=new THREE.MeshPhysicalMaterial({map:plate[0],roughnessMap:plate[1],metalnessMap:plate[1],roughness:1,metalness:1,envMapIntensity:1.4});
  const plateMesh=put(new THREE.Mesh(new THREE.PlaneGeometry(.82,PH),plateM),'engraved scale plates (hPa · inHg)',REG);plateMesh.position.set(BX,PY0+PH/2,BZ+.13);plateMesh.receiveShadow=true;
  [[0,PY0+PH+.02,.88,.035],[0,PY0-.02,.88,.035],[-.43,PY0+PH/2,.035,PH+.07],[.43,PY0+PH/2,.035,PH+.07]].forEach(([x,y,w,h])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,.06),brass);b.position.set(BX+x,y,BZ+.16);b.castShadow=true;REG.add(b)});
  const regGlass=put(new THREE.Mesh(new THREE.PlaneGeometry(.84,PH+.04),film),'register glass',REG);regGlass.position.set(BX,PY0+PH/2,BZ+.3);regGlass.renderOrder=6;
  const tubeX=BX+((CH0+CH1)/2/512-.5)*.82,TZ=BZ+.19,RHG=.058;
  const HGG=part('mercury column',BG);
  const btube=put(lathe(shellPts([[RHG+.014,PY0-.25],[RHG+.014,PY0+PH+.05],[RHG*.7,PY0+PH+.13],[.001,PY0+PH+.15]],.012),shell,24),'glass tube (vacuum above the mercury)',HGG);btube.position.set(tubeX,0,TZ);btube.castShadow=false;
  const hgG=new THREE.CylinderGeometry(RHG,RHG,1,24,1,true);hgG.translate(0,.5,0);const hg=put(new THREE.Mesh(hgG,merc),'mercury',HGG);hg.position.set(tubeX,PY0-.25,TZ);
  const hgTop=put(new THREE.Mesh(new THREE.SphereGeometry(RHG,24,12,0,Math.PI*2,0,Math.PI/2),merc),'convex meniscus',HGG);hgTop.scale.y=.6;
  // the window's reflection running down the column: the glint that makes mercury read as liquid metal from across the room
  const glG=new THREE.PlaneGeometry(.014,1);glG.translate(0,.5,0);const glint=put(new THREE.Mesh(glG,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})),'reflection glint',HGG);glint.position.set(tubeX-.022,PY0-.25,TZ+RHG+.002);glint.userData.noInk=true;
  // vernier slider with a magnifier: a brass-bezelled lens riding on the meniscus; behind it, the column top drawn 1.8× wide
  const VER=part('vernier & magnifier',HGG),LR=.1; // origin = apex of the meniscus; lens sits just inside the register glass
  put(new THREE.Mesh(new THREE.TorusGeometry(LR,.013,10,48),brass),'lens bezel',VER).position.z=.085;
  put(new THREE.Mesh(new THREE.CircleGeometry(LR,48),film),'magnifier lens',VER).position.z=.088;
  {const MR=.07,mg=new THREE.CylinderGeometry(MR,MR,.028,32,1,true);mg.translate(0,-.056,0);const m1=put(new THREE.Mesh(mg,merc),'magnified column',VER);m1.scale.z=.45;m1.position.z=.035;
   const mg2=new THREE.CylinderGeometry(.045,.045,.018,24,1,true);mg2.translate(0,-.079,0);const m2=put(new THREE.Mesh(mg2,merc),'magnified column (lower)',VER);m2.scale.z=.45;m2.position.z=.035;
   const md=put(new THREE.Mesh(new THREE.SphereGeometry(MR,32,12,0,Math.PI*2,0,Math.PI/2),merc),'magnified meniscus',VER);md.scale.set(1,.6,.45);md.position.set(0,-MR*.6,.035);
   const ivory=new THREE.Mesh(new THREE.CircleGeometry(LR*.98,48),makeMaterial({preset:'ceramic',color:'#ece4d2'}));ivory.position.z=-.005;put(ivory,'lens backing',VER);
   const hair=put(new THREE.Mesh(new THREE.BoxGeometry(.34,.005,.004),new THREE.MeshBasicMaterial({color:0xb02016})),'hairline (reading line)',VER);hair.position.set(0,0,.092)}
  const setHand=put(new THREE.Mesh(new THREE.ConeGeometry(.028,.12,3),brass),'set hand (reading 3 h ago)',BG);setHand.rotation.z=Math.PI/2;
  // thermometer on the trunk: ivory scale, spirit column
  const THG=part('thermometer',BG);
  const thermo=(()=>{const c=document.createElement('canvas');c.width=128;c.height=768;const g=c.getContext('2d');g.fillStyle='#efe6d2';g.fillRect(0,0,128,768);g.strokeStyle='#2b1c0c';g.fillStyle='#2b1c0c';g.textAlign='right';g.textBaseline='middle';g.font='22px Georgia, serif';
    for(let T=-10;T<=40;T++){const y=740-(T+10)/50*712,L=T%10===0?30:T%5===0?20:10;g.lineWidth=T%5===0?2.4:1.2;g.beginPath();g.moveTo(88-L,y);g.lineTo(88,y);g.stroke();if(T%10===0)g.fillText(String(T),50,y)}g.font='20px Georgia, serif';g.fillText('°C',66,14);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t})();
  const TY0=1.25,TH=1.6,thP=put(new THREE.Mesh(new THREE.PlaneGeometry(.3,TH+.08),new THREE.MeshPhysicalMaterial({map:thermo,roughness:.5,clearcoat:.6})),'thermometer scale',THG);thP.position.set(BX-.05,TY0+TH/2,BZ+.13);
  const thT=put(lathe(shellPts([[.026,TY0-.06],[.026,TY0+TH+.02],[.001,TY0+TH+.05]],.008),shell,16),'thermometer tube',THG);thT.position.set(BX+.06,0,BZ+.17);thT.castShadow=false;
  const bulb=put(new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),new THREE.MeshPhysicalMaterial({color:0xb01818,roughness:.15,clearcoat:1})),'thermometer bulb',THG);bulb.position.set(BX+.06,TY0-.06,BZ+.17);
  const spG=new THREE.CylinderGeometry(.012,.012,1,8);spG.translate(0,.5,0);const spirit=put(new THREE.Mesh(spG,bulb.material),'thermometer spirit',THG);spirit.position.set(BX+.06,TY0-.06,BZ+.17);
  // light through the sky from behind (rim on the glass) and a lightning flash
  const sunL=put(new THREE.DirectionalLight(0xffe6c0,0),'sunlight through the sky',W);sunL.position.set(-1,7,-9);sunL.target.name='sunlight target';MW.add(sunL.target); // under the meadow group: the target is not a part of its own in the object list
  const flashL=put(new THREE.DirectionalLight(0xdfe8ff,0),'lightning flash',W);flashL.position.set(2,9,-8);
  // rain on the display case (when the diorama has one): lens-like droplets that grow, stick, then slip down the panes
  const caseObj=D.scene.getObjectByName('glass case');let CD=null;
  if(caseObj){const bb=new THREE.Box3().setFromObject(caseObj),dmM=makeMaterial({preset:'water',color:'#e4f2f6'});dmM.thickness=.05;dmM.normalMap=null;dmM.roughness=.01;dmM.attenuationDistance=20;
    const dm=put(new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),dmM,90),'raindrops on the case',W);dm.userData.noInk=true;dm.frustumCulled=false;dm.castShadow=false;fixedBox(dm,bb.min.clone(),bb.max.clone());CD={dm,half:(bb.max.x-bb.min.x)/2-.02,top:bb.max.y-.05,L:[]}}

  // ---------- state & physics ----------
  const CLK=10,T0=288.15,eSat=T=>6.112*Math.exp(17.62*T/(243.12+T)),RHOG=998*9.80665/100/1000*S_MM,TAU_SP=.3,TAU_G=1.5,BED=.04; // RHOG: hPa per scene unit of water
  const autoP=s=>1008+17*Math.cos(2*Math.PI*s/60+.3)+3*Math.sin(2*Math.PI*s/19+2.2); // a fair-weather high, a low ~27 h later, recovery
  let Pc=p.auto>.5?autoP(0):p.P,Tc=p.T,P0=p.P0,hs=0,hsEq=0,Pin=p.P0,hist=[],tA=0,lastTrend=0,overflow=false,bubbled=false,cool=0,Tg=p.T,lastTg=p.T,lastSky=-1,Mb=0,Mf=0,Mt=0,nucl=false,wasFern=false,topped=false,cover=.3,rainK=0,raining=false,wet=0,flash=0,hgShown=Pc,setP=Pc,lastSet=0,Gf=0,Gt=0,Gb=0,armed=0,lastPush=-1;
  const S_=T=>Math.exp(.065*(T-16)),total=()=>p.conc*1.05,mass=()=>Mb+Mf+Mt,fern=()=>Mf+Mt;
  const PinAt=h=>(P0-eSat(15))*((Tc+273.15)/T0)*(V0/(V0+a_sp*h))+eSat(Tc);
  const solve=()=>{let lo=-4,hi=8;for(let i=0;i<40;i++){const m=(lo+hi)/2,f=PinAt(m)-Pc-RHOG*m*(1+a_sp/A_fl);if(f>0)lo=m;else hi=m}return(lo+hi)/2};
  const ideal_mm=()=>(P0*(Tc+273.15)/T0-Pc)*100/(998*9.80665)*1000;
  hs=hsEq=solve();Pin=PinAt(hs);
  // the storm glass has stood at the starting temperature for a long time: dissolved c = S(T), the excess as crystals
  {const ex=Math.max(0,total()-BED-S_(Tg));Mb=Math.min(BED,total())+ex*.15;Mf=ex*.85;nucl=ex>0;wasFern=Mf>.02;Gf=clamp(Mf/.35,0,1);Gb=clamp(Math.sqrt(Mb/.3),0,1)}
  const spoutY=()=>clamp(WY+hs,.45,TOP-.02);
  DIO.weatherglass._live={spoutY,hgY:()=>yOfP(hgShown),bedY:()=>SY0+.15};
  D.label('Goethe weather glass',()=>V3(GX,5.05,GZ),GW);D.label('spout column · water level',()=>V3(SXp+.05,Math.max(1.1,spoutY())+.25,GZ),false,SPG);D.label('trapped air · P_in',()=>V3(GX,3.15,GZ),false,flask);D.label('flask water',()=>V3(GX-.45,WY-.3,GZ+.7),false,fw);
  D.label('storm glass · sealed tube',()=>V3(SX,STOP+.65,SZ),false,SG);D.label('crystals',()=>mass()>.004?V3(SX+.05,.82,SZ+.3):null,false,CG);D.label('camphor solution',()=>V3(SX+.25,2.6,SZ+.35),false,liq);D.label('seed bed',()=>V3(SX-.1,SY0+.22,SZ+.38),false,baseC);
  D.label('mercury barometer',()=>V3(BX,7.45,BZ),false,BG);D.label('mercury column',()=>V3(tubeX+.3,yOfP(hgShown),TZ+.15),false,HGG);D.label('thermometer',()=>V3(BX+.06,TY0+TH+.25,BZ+.17),false,THG);
  D.label('sky · cloud cover',()=>V3(-3.6,6.4,-4.7),false,deckMid);
  D.event('glass sealed at '+P0.toFixed(1)+' hPa and 15 °C; trapped air now follows P_in = (P₀ − e₀)·(T/T₀)·(V₀/V) + e(T)',V3(GX,2.4,GZ));D.seriesName='outside pressure P (hPa)';
  // ---------- sky / weather rendering ----------
  const css=c=>'#'+c.getHexString(),C1=new THREE.Color(),C2=new THREE.Color();
  function drawSky(t){const g=skyCv.getContext('2d'),Wc=skyCv.width,Hc=skyCv.height,hour=t%24,elev=Math.sin((hour-6)/12*Math.PI),day=Math.max(0,elev),dusk=Math.exp(-Math.pow(elev/.22,2)),c=cover,storm=clamp((c-.5)/.5,0,1),fl=flash;
    const top=new THREE.Color().setHSL(.6,.62*(1-c*.85),.05+day*.36*(1-c*.5)+dusk*.03),hor=new THREE.Color().setHSL(.58,.3*(1-c*.7),.1+day*.58*(1-c*.45)).lerp(new THREE.Color().setHSL(.06,.75*(1-c*.6),.45*(1-c*.5)),dusk*.75);
    const gr=g.createLinearGradient(0,0,0,Hc);gr.addColorStop(0,css(top));gr.addColorStop(.6,css(top.clone().lerp(hor,.55)));gr.addColorStop(1,css(hor));g.fillStyle=gr;g.fillRect(0,0,Wc,Hc);
    const su=.12+.76*clamp((hour-6)/12,0,1),sa=A0+AL*su,sy=1.6+day*5.2,glow=(day>0?1:dusk)*(1-c*.85);
    if(glow>.01){const sc=new THREE.Color().setHSL(.09+.04*day,.9,.7),rgb=`${Math.round(sc.r*255)},${Math.round(sc.g*255)},${Math.round(sc.b*255)}`;g.save();g.translate(su*Wc,(1-sy/H)*Hc);g.scale(1,1.45);const rg=g.createRadialGradient(0,0,0,0,0,Wc*.42);rg.addColorStop(0,`rgba(${rgb},${.6*glow})`);rg.addColorStop(.25,`rgba(${rgb},${.22*glow})`);rg.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=rg;g.fillRect(-Wc,-Hc,2*Wc,2*Hc);g.restore()}
    if(fl>0){g.fillStyle=`rgba(235,240,255,${fl*.7})`;g.fillRect(0,0,Wc,Hc)}
    skyTex.needsUpdate=true;
    {const b=bgCv.getContext('2d'),bg=b.createLinearGradient(0,0,0,bgCv.height),hf=hor.clone().lerp(new THREE.Color(1,1,1),fl*.4);bg.addColorStop(0,css(top.clone().lerp(hor,.45)));bg.addColorStop(.5,css(hf));bg.addColorStop(1,css(hf.clone().multiplyScalar(.8)));b.fillStyle=bg;b.fillRect(0,0,bgCv.width,bgCv.height);bgTex.needsUpdate=true;
     if(D.scene.fog&&D.scene.fog.isFog)D.scene.fog.color.copy(hor)}
    sunG.position.set(Math.sin(sa)*6.58,sy,Math.cos(sa)*6.58);sunG.lookAt(0,sy,0);sunG.material.opacity=day>0?(1-c*.95):0;sunG.material.color.setHSL(.1,.8,.6+.2*day);
    starP.material.opacity=(1-Math.min(1,day*4))*(1-c)*.9;
    // clouds: sunlit side warm at low sun, white at noon; shadow side takes the sky colour, slate grey in storms
    const sunC=C1.setHSL(.08+.05*day,.75-.45*day,.72+.16*day).multiplyScalar(.35+.85*Math.min(1,day*1.4)+dusk*.25).multiplyScalar(1-storm*.5);
    const shade=C2.copy(top).lerp(hor,.5).multiplyScalar(.75).lerp(new THREE.Color(0x30363f),storm*.75).addScalar(.05*Math.min(1,day*2)*(1-storm));
    decks.forEach((L,i)=>{const U=L.U;U.uCover.value=clamp(i===2?1.5*c-.62:i===0?.08+c*.95:c,0,1);U.uLit.value.copy(sunC).multiplyScalar(i===2?.75:1).addScalar(fl*.8);U.uShade.value.copy(shade).multiplyScalar(i===2?.8:1).addScalar(fl*.5);U.uSun.value.set(su,clamp((sy-1.6)/5.2,0,1))});
    // hills: aerial perspective — the farther the range, the more it takes the horizon colour
    const lightH=(.3+.7*Math.min(1,day*1.5))*(1-.45*storm);
    hillFar.color.setHSL(.6,.25,.42*lightH).lerp(hor,.6);hillMid.color.setHSL(.36,.25,.3*lightH).lerp(hor,.38);hillNear.color.setHSL(.27,.35,.22*lightH).lerp(hor,.15);
    [hazeFar,hazeMid,hazeNear].forEach(m=>m.color.copy(hor));
    sunL.intensity=day*(1-c*.8)*2.2;sunL.color.setHSL(.09,.6*(1-day*.5),.7);sunL.position.set(Math.sin(sa)*8,sy+3,Math.cos(sa)*8);
    // key light follows the painted sun: warm and hard in fair weather, dim, cool and flat under storm cloud, moonlit at night
    if(keyL){const dir=V3(Math.sin(sa)*.85,.8+.35*day,.62).normalize();keyL.position.copy(keyT).addScaledVector(dir,keyD);
      keyL.color.setHSL(.085+.03*day,.75-.4*day,.74+.1*day).lerp(C2.set(0xa8b4c4),storm*.85).lerp(C2.set(0x8ea2cc),(1-Math.min(1,day*3))*.7);
      keyL.intensity=key0*(.3+.95*Math.min(1,day*1.6))*(1-.62*storm)*(1-.15*c)+key0*fl*.6}
    envLights.forEach(([l,i0])=>{l.intensity=i0*(.7+.3*day)*(1-.35*storm)});D.scene.environmentIntensity=env0*(.55+.45*Math.min(1,day*2))*(1-.35*storm)}
  const ev=(text,pos,color)=>D.event(text,pos,color);
  return{orbit:{target:V3(-.3,2.5,-.2),r:15,ph:1.2,th:.12},
   live(k){if(k==='T'||k==='P'){Pc=p.P;Tc=p.T;return true}
     if(k==='auto'){if(p.auto>.5){tA=D.t;Pc=autoP(0);hist=[];lastTrend=0;ev('auto weather (re)started: a fair-weather high, then a low moves in',V3(0,5.6,-4.6))}else{Pc=p.P;Tc=p.T}return true}
     if(k==='conc')return true;if(k==='P0'){P0=p.P0;ev('re-sealed at '+P0.toFixed(1)+' hPa',V3(GX,2.4,GZ));return true}return false},
   step(h){const t=D.t;
    if(p.auto>.5){Pc+=(autoP(t-tA)-Pc)*Math.min(1,h*.8);Tc=p.T+2.5*Math.sin(2*Math.PI*((t+CLK)%24-9)/24)-(1013-Pc)*.04}
    // Goethe glass: equilibrium with air spring + vapour, then viscous relaxation of the column
    hsEq=solve();const lag=(hsEq-hs)*S_MM;hs+=(hsEq-hs)*Math.min(1,h/TAU_SP);Pin=PinAt(hs);const y=WY+hs;
    if(p.auto<=.5){if(!armed&&Math.abs(lag)>3){armed=Math.sign(lag);ev(armed>0?'outside pressure below P_in: the trapped air pushes water up the spout':'outside pressure above P_in: the outside air pushes the water back down the spout',V3(SXp,clamp(y,.9,TOP),GZ),armed>0?0x88c0ff:0xffd27a)}
      if(armed&&Math.abs(lag)<.3&&!overflow){armed=0;ev('spout settles at Δh = '+(hs*S_MM).toFixed(1)+' mm: P_in − P = '+(Pin-Pc).toFixed(1)+' hPa, carried by the weight of the raised water',V3(SXp,clamp(y,.9,TOP),GZ),0x88c0ff)}}else armed=0;
    if(y>TOP-.02&&!overflow){overflow=true;ev('pressure difference '+(Pin-Pc).toFixed(1)+' hPa pushes water out of the spout (low pressure: storm weather)',V3(SXp,TOP,GZ),0x88c0ff)}if(y<TOP-.2)overflow=false;
    if(y>TOP-.02){hs=TOP-.02-WY;if(rng()<h*14)drops.push({x:SXp+.09,y:TOP,z:GZ,v:0})}
    if(y<.5&&!bubbled){bubbled=true;P0=(Pc-eSat(Tc))*T0/(Tc+273.15)+eSat(15);hs=hsEq=solve();armed=0;ev('high pressure drives the column below the bend: air bubbles into the flask; the glass is now effectively re-sealed at '+P0.toFixed(1)+' hPa',V3(GX+.9,.45,GZ))}if(y>.9)bubbled=false;
    // storm glass: liquid temperature lags the air; conserved camphor, temperature-dependent solubility, metastable nucleation
    Tg+=(Tc-Tg)*Math.min(1,h/TAU_G);const dTdt=(Tg-lastTg)/h;lastTg=Tg;cool=lerp(cool,dTdt,Math.min(1,h*2));
    const c=Math.max(0,total()-mass()),S=S_(Tg),sig=c/S-1;
    if(!nucl&&sig>.04){nucl=true;Mf=Math.max(Mf,.002)}
    if(sig>0){const g=.55*sig*h,fr=nucl?clamp((sig-.04)/.22,.1,.85):0,top=cool<-1.5?clamp(-cool*.15,0,.6):0;Mf+=g*fr*(1-top);Mt+=g*fr*top;Mb+=g*(1-fr)}
    if(sig<0){const k=-.9*sig*h;Mf=Math.max(0,Mf-k*2*Math.pow(Mf+1e-6,.667));Mt=Math.max(0,Mt-k*3.2*Math.pow(Mt+1e-6,.667));Mb=Math.max(0,Mb-k*.15*Math.pow(Mb+1e-6,.667))}
    if(fern()<.0015&&sig<0){Mf=Mt=0;nucl=false}
    const hasF=fern()>.02;
    if(hasF&&!wasFern)ev('solution supersaturated (σ = '+sig.toFixed(3)+'): camphor crystals nucleate and grow into fern fronds',V3(SX,1.1,SZ));
    if(!hasF&&wasFern)ev('warming raises solubility: the fern crystals redissolve and the liquid clears'+(Mb>.005?'; a small seed bed stays at the bottom':''),V3(SX,2,SZ),0x88c0ff);wasFern=hasF;
    if(Mt>.02&&!topped){topped=true;ev('rapid cooling ('+(-cool).toFixed(1)+' K/h) grows fine feathery crystals at the top (folklore: "storm coming"; physically a temperature effect)',V3(SX,LIQ-.4,SZ))}if(Mt<.005)topped=false;
    // weather lore with physics: the 3-hour tendency, cloud cover and rain
    hist.push([t,Pc]);while(hist.length&&t-hist[0][0]>3)hist.shift();const tr=hist.length>1?Pc-hist[0][1]:0;
    if(tr<-3&&lastTrend>=-3)ev('pressure falling '+(-tr).toFixed(1)+' hPa in 3 h: deteriorating weather likely',V3(tubeX,yOfP(Pc),TZ),0xff9a7a);if(tr>3&&lastTrend<=3)ev('pressure rising '+tr.toFixed(1)+' hPa in 3 h: clearing weather likely',V3(tubeX,yOfP(Pc),TZ),0x88c0ff);lastTrend=tr;
    const coverT=clamp((1021-Pc)/34+clamp(-tr,0,6)*.06-clamp(tr,0,6)*.04,0,1);cover+=(coverT-cover)*Math.min(1,h*.6);
    const rainNow=cover>.68;if(rainNow&&!raining)ev('rain begins: cloud cover '+Math.round(cover*100)+' % as the low arrives',V3(0,2.5,-5.4),0x88c0ff);if(!rainNow&&raining&&cover<.6)ev('rain eases as pressure recovers',V3(0,2.5,-5.4));if(rainNow)raining=true;else if(cover<.6)raining=false;
    rainK+=((raining?clamp((cover-.6)*2.5,.25,1):0)-rainK)*Math.min(1,h*1.5);wet=clamp(wet+(raining?h*.5:-h*.12),0,1);
    if(cover>.86&&rng()<h*.25)flash=1;
    // set hand records the reading 3 h ago (like the brass "set" pointer on period barometers)
    if(t-lastSet>3){setP=hist.length?hist[0][1]:Pc;lastSet=t}
   },
   visual(dt){const y=spoutY(),vert=y>SB;
    col.scale.y=Math.max(.001,y-SB);col.visible=vert;menisc.visible=menRing.visible=vert;menisc.position.set(SXp,y,GZ);menRing.position.set(SXp,y-.004,GZ);bendW.visible=y>.45;
    for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.v-=9.8*dt;d.y+=d.v*dt;d.x+=.25*dt;if(d.y<.05)drops.splice(i,1)}while(drops.length>DN)drops.shift();{const m=new THREE.Matrix4();for(let i=0;i<DN;i++){const d=drops[i];if(d)m.makeTranslation(d.x,d.y,d.z);else m.makeScale(0,0,0);dropM.setMatrixAt(i,m)}dropM.instanceMatrix.needsUpdate=true}
    // crystals: shard i is grown when its threshold lies below the group's growth fraction; the bed by √mass (a thin layer shows early)
    const k=Math.min(1,dt*3);Gf+=(clamp(Mf/.35,0,1)-Gf)*k;Gt+=(clamp(Mt/.2,0,1)-Gt)*k;Gb+=(clamp(Math.sqrt(Mb/.3),0,1)-Gb)*k;
    const m4=new THREE.Matrix4(),sv=V3();for(let i=0;i<SH.length;i++){const s=SH[i],G=s.grp?Gt:Gf,f=clamp((G-s.th)/.08,0,1);if(f<=0){m4.makeScale(0,0,0)}else{sv.copy(s.s).multiplyScalar(f);m4.compose(s.p,s.q,sv)}shards.setMatrixAt(i,m4)}shards.instanceMatrix.needsUpdate=true;
    for(let i=0;i<BASEN;i++){const b=BC[i],f=clamp((Gb*1.5-b.th)/.15,0,1);if(f<=0)m4.makeScale(0,0,0);else{sv.setScalar(b.s*(.4+.6*f));m4.compose(b.p,b.q,sv)}baseC.setMatrixAt(i,m4)}baseC.instanceMatrix.needsUpdate=true;
    const c=Math.max(0,total()-mass()),sig=c/S_(Tg)-1,haze=clamp((sig-.06)/.3,0,1),near=clamp(1+sig/.35,0,1)*clamp(Mb/.02,0,1); // near: close to saturation with a bed present
    specks.material.opacity=Math.max(haze*.8,near*.14);hz.material.opacity=.02+near*.08+haze*.25;sol.opacity=.1+haze*.38+near*.04;sol.color.setRGB(.075+haze*.28,.065+haze*.28,.035+haze*.28);
    // mercury, vernier and set hand, thermometer spirit
    hgShown+=(Pc-hgShown)*Math.min(1,dt*4);const yh=yOfP(clamp(hgShown,PMIN-8,PMAX+6));hg.scale.y=Math.max(.01,yh-(PY0-.25));glint.scale.y=Math.max(.01,yh-(PY0-.25)-.01);hgTop.position.set(tubeX,yh,TZ);VER.position.set(tubeX,clamp(yh,PY0,PY0+PH)+RHG*.6,TZ);setHand.position.set(tubeX+.22,yOfP(setP),BZ+.24);
    spirit.scale.y=Math.max(.01,TY0+(clamp(Tc,-10,40)+10)/50*TH-(TY0-.06));
    // rain streaks, splashes, wet ground
    rain.material.opacity=rainK;rain.visible=rainK>.01;
    if(rain.visible){const pa=rainG.attributes.position.array,sl=.06;for(let i=0;i<RN;i++){const d=RD[i];d.y-=dt*d.v*(.8+rainK*.4);if(d.y<0){if(rng()<.35*rainK){const s=SPL[spI%SPN]||(SPL[spI%SPN]={});Object.assign(s,{x:d.x,z:d.z,a:0});spI++}const q=rainBand();d.x=q[0];d.z=q[1];d.y+=H}pa[i*6]=d.x+sl*d.L;pa[i*6+1]=d.y+d.L;pa[i*6+2]=d.z;pa[i*6+3]=d.x;pa[i*6+4]=d.y;pa[i*6+5]=d.z}rainG.attributes.position.needsUpdate=true}
    for(let i=0;i<SPN;i++){const s=SPL[i];if(!s||s.a>1){m4.makeScale(0,0,0)}else{s.a+=dt*4;const r=.03+s.a*.1;m4.makeScale(r,1,r);m4.setPosition(s.x,.03,s.z)}splash.setMatrixAt(i,m4)}splash.instanceMatrix.needsUpdate=true;splash.material.opacity=.5*rainK;
    D.scene.userData.aaaWet={g:wet,rain:rainK}; // wet ground: darker, glossier, puddles in the hollows, ripples while it rains (AAA wetness)
    // sky decks drift at different speeds (motion parallax); storm scud only shows in heavy cover
    decks.forEach(L=>{L.t.offset.x+=dt*L.speed*(1+cover*1.5)});scud.visible=cover>.45;
    flash=Math.max(0,flash-dt*5);flashL.intensity=flash*6;
    if(CD){const L=CD.L,hf=CD.half;if(rainK>.2&&L.length<90&&rng()<dt*30*rainK){const pane=Math.floor(rng()*3);L.push({pane,u:(rng()*2-1)*(hf-.2),y:CD.top*(.35+rng()*.65),r:.012+rng()*.01,v:0,stick:rng()*2})}
      for(let i=L.length-1;i>=0;i--){const d=L[i];d.r=Math.min(.055,d.r+dt*(rainK>.2?.006:-.01));d.stick-=dt;if(d.stick<0&&d.r>.03){d.v=.25+d.r*14;if(rng()<dt*1.5)d.stick=rng()*1.2}else d.v*=.8;d.y-=d.v*dt;if(d.y<.08||d.r<.006)L.splice(i,1)}
      for(let i=0;i<90;i++){const d=L[i];if(!d){m4.makeScale(0,0,0)}else{const r=d.r;if(d.pane===0){m4.makeScale(r,r*1.3,r*.35);m4.setPosition(d.u,d.y,hf+.01)}else{const sx=d.pane===1?-1:1;m4.makeScale(r*.35,r*1.3,r);m4.setPosition(sx*(hf+.01),d.y,d.u)}}CD.dm.setMatrixAt(i,m4)}CD.dm.instanceMatrix.needsUpdate=true}
    const tt=Math.floor(D.t*4);if(tt!==lastSky||flash>0){lastSky=tt;drawSky(D.t+CLK)}
    // the sparkline: one sample per 0.2 h of model time (300 samples = 60 h, one auto-weather cycle), none while paused
    if(D.t<lastPush||D.t-lastPush>=.2){lastPush=D.t;D.push(Pc)}},
   // y-range for the sparkline (engine hook: called with the data's own [lo, hi]): at least 16 hPa tall, so a steady
   // pressure draws as a level line in the middle of a sensible scale, not as noise blown up to full height
   seriesRange(lo,hi){const m=(lo+hi)/2,s=Math.max(16,(hi-lo)*1.15);return[m-s/2,m+s/2]},
   clock(t){const tt=(t??D.t)+CLK,hr=Math.floor(tt%24),mn=Math.floor((tt%1)*6)*10;return String(hr).padStart(2,'0')+':'+String(mn).padStart(2,'0')+' · day '+(1+Math.floor(tt/24))},
   readouts(){const c=Math.max(0,total()-mass()),sig=c/S_(Tg)-1,tr=hist.length>1?Pc-hist[0][1]:0,f1=v=>v.toFixed(1),dh=hs*S_MM,de=hsEq*S_MM;
    return[['time scale','1 s = 1 h'],['P outside',f1(Pc)+' hPa'],['3-h tendency',(tr>=0?'+':'−')+Math.abs(tr).toFixed(1)+' hPa'],['T air',f1(Tc)+' °C'],['P inside (trapped air)',f1(Pin)+' hPa'],
     ['spout Δh (now)',f1(dh)+' mm'],['Δh at equilibrium',f1(de)+' mm'],['spout',overflow?'overflowing':Math.abs(de-dh)<.5?'settled':'settling…'],['Δh textbook (P₀T/T₀−P)/ρg',f1(ideal_mm())+' mm'],
     ['mercury column',f1(Pc*.750062)+' mm'],['T storm-glass liquid',f1(Tg)+' °C'],['solubility S(T)',S_(Tg).toFixed(3)],['supersaturation σ',sig.toFixed(3)],['crystal mass',mass().toFixed(3)],['cloud cover',Math.round(cover*100)+' %']]}}}};
// Camera hints for the director: keys are lowercase substrings of the event text (the same matching lessons use).
// Targets may be functions (evaluated when the event fires). The spout shots aim at the live water column, a little
// toward the body, at a distance that keeps the whole spout (bend to open top) and the flask in frame.
{const L=()=>DIO.weatherglass._live||{spoutY:()=>WGL.WY,hgY:()=>4.3,bedY:()=>.57},{GX,GZ,SX,SZ,BZ,WY,TOP,YB,RBD}=WGL,SXp=GX+WGL.SPX,SB=YB+RBD,TZ=BZ+.19,tubeX=0;
 const spoutShot=dist=>({target:()=>[SXp,Math.min(2.8,Math.max(2.5,(SB+L().spoutY())/2+1)),GZ],dist}); // checked: bend, open top and flask tip stay inside ±0.8 of the frame for the director's ±18° swing
 DIO.weatherglass.shots={
 'glass sealed at':{target:[GX+.45,2.45,GZ],dist:8.2},
 're-sealed at':{target:[GX+.45,2.45,GZ],dist:8.2},
 'auto weather (re)started':{target:[0,3.2,-1.2],dist:12},
 'pushes water up the spout':spoutShot(8.6),
 'pushes the water back down':spoutShot(8.6),
 'spout settles':spoutShot(8.6),
 'pushes water out of the spout':{target:[SXp,2.9,GZ],dist:8.6},
 'air bubbles into the flask':{target:[SXp-.3,.95,GZ],dist:4},
 'camphor crystals nucleate':{target:[SX,1.7,SZ],dist:4.2},
 'crystals redissolve':{target:[SX,1.9,SZ],dist:4.4},
 'feathery crystals at the top':{target:[SX,3.1,SZ],dist:3.2},
 'pressure falling':{target:[0,4.4,BZ+.25],dist:4.4},
 'pressure rising':{target:[0,4.4,BZ+.25],dist:4.4},
 'rain begins':{target:[0,2.8,-4.2],dist:8.5},
 'rain eases':{target:[0,2.8,-4.2],dist:8.5}};
 // Process arrows for the director (drawn when Guides are on): world coordinates, or functions for moving ends.
 // Spout arrows run on the spout's own axis, a hair in front of it; every end stays within the shot's frame.
 const hgArrow=(up)=>[{from:()=>V3(tubeX-.32,L().hgY()+(up?-.45:.45),TZ+.2),to:()=>V3(tubeX-.32,L().hgY(),TZ+.2),label:up?'more air above the cistern: mercury rises':'less air above the cistern: mercury falls'},{from:[.9,.95,BZ+.4],to:[.3,.6,BZ+.3],label:up?'heavier air presses on the cistern':'lighter air presses on the cistern'}];
 const FZ=GZ+.12;
 DIO.weatherglass.flows={
  'pushes water up the spout':[{from:[GX,3.3,GZ],to:[GX,WY+.12,GZ],label:'trapped air presses on the water'},{from:[GX+.55,YB,FZ],to:[SXp,SB+.15,FZ],label:'water flows through the bend'},{from:()=>V3(SXp,Math.max(SB+.2,L().spoutY()-.9),FZ),to:()=>V3(SXp,L().spoutY()+.05,FZ),label:'air pushes water up the spout'}],
  'pushes the water back down':[{from:[SXp,TOP+.25,FZ],to:()=>V3(SXp,L().spoutY()+.1,FZ),label:'outside air presses down the open spout'},{from:[SXp,SB+.1,FZ],to:[GX+.55,YB,FZ],label:'water returns to the body'}],
  'spout settles':[{from:[SXp+.22,WY,GZ],to:()=>V3(SXp+.22,L().spoutY(),GZ),label:'Δh: weight of water = P_in − P'}],
  'pushes water out of the spout':[{from:[SXp,TOP-.6,FZ],to:[SXp+.35,TOP+.25,FZ],label:'trapped air overflows the spout'}],
  'air bubbles into the flask':[{from:[SXp,2.1,FZ],to:[SXp,SB,FZ],label:'outside air drives the column below the bend'},{from:[GX+.75,.55,FZ],to:[GX+.35,1.75,FZ],label:'an air bubble rises into the flask'}],
  'camphor crystals nucleate':[{from:[SX+.15,3.1,SZ+.2],to:[SX+.05,1.1,SZ+.2],label:'dissolved camphor comes out of solution'}],
  'crystals redissolve':[{from:[SX,1,SZ+.2],to:[SX,2.8,SZ+.2],label:'crystals dissolve back into the liquid'}],
  'feathery crystals at the top':[{from:[SX+.85,3.9,SZ],to:[SX+.1,3.35,SZ],label:'fast cooling: growth hangs from the top'}],
  'pressure falling':hgArrow(false),
  'pressure rising':hgArrow(true),
  'rain begins':[{from:[-1.6,5.2,-4.9],to:[-1.6,1.4,-4.6],label:'rain from the thickening cloud'}]};}
// 1 world unit = 5 cm (the storm glass is about 20 cm tall): the scale bar of the zoom into the crystals
DIO.weatherglass.scale={m:.05};
DIO.weatherglass.levels=[{name:'Room'},{name:'Instrument',at:'storm glass'},{name:'Crystals',at:'crystals'},{name:'Seed bed',at:'seed bed'}];
// Default lessons (used when a weatherglass demo brings none). Same format as the lessons at the end of this file;
// every `until` was checked by stepping the model headlessly from its default parameters, and the numbers in
// "explain" are the ones that run produces.
DIO.weatherglass.lessons=[
 {title:'Read the barometer',question:'What holds the mercury column up?',focus:'mercury column',set:{auto:0,P:1013,T:15,P0:1013},run:8,shot:'close',
  cameraMode:'object',section:{on:['mercury barometer'],axis:'z',sweep:1.6,keep:['mercury column'],caption:'The walnut case cut open: a glass tube standing in a cistern of mercury, vacuum above the column.'},
  text:'Auto weather is switched off and the outside pressure is held at 1013 hPa. Look at the top of the mercury column in the brass window and read it against the scale. The walnut case of the mercury barometer fades for a moment, so you can follow the mercury down to its cistern.',
  explain:'Above the mercury there is vacuum, so only the air pressing on the open cistern holds the column up: h = P/(ρ_Hg g) = 101 325 Pa ÷ (13 595 kg/m³ × 9.81 m/s²) ≈ 760 mm. Each hPa of air pressure holds 0.75 mm of mercury, so the barometer reads the weight of the air directly, in absolute terms.',
  opens:'What does the Goethe glass do when the outside pressure falls?'},
 {title:'A deep low',question:'What does the Goethe glass do when the outside pressure falls?',focus:'spout column',set:{P:995},until:'event:spout settles',run:30,shot:'close',
  chain:[{a:'trapped air',note:'pushes as hard as when sealed'},{a:'flask water',note:'pressed down'},{a:'spout column',note:'climbs until it balances'}],chainPace:1.2,
  text:'Lower the outside pressure to 995 hPa, as a low arrives. Watch the trapped air of the Goethe glass press on the flask water and push the spout column up until it settles.',
  explain:'The trapped air keeps close to its sealing pressure while the outside air now pushes 18 hPa less, so the difference lifts water up the open spout until the weight of the raised water balances it: P_in − P = ρgΔh. The spout settles near 113 mm, well below the textbook (P₀T/T₀ − P)/ρg ≈ 184 mm, because the trapped air expands as the water climbs and its pressure falls (readout “P inside”).',
  opens:'Is a high spout always a sign of low pressure?'},
 {title:'A warm afternoon',question:'Is a high spout always a sign of low pressure?',focus:'spout column',set:{P:1013,T:20},until:'event:spout settles',run:30,shot:'medium',isolate:['Goethe weather glass','thermometer'],
  text:'Return the outside pressure to a normal 1013 hPa, but warm the air to 20 °C. Watch where the spout settles this time.',
  explain:'Warming raises the pressure of the trapped air by about 3.5 hPa per kelvin for the air itself and 1.3 hPa per kelvin from extra water vapour, so 5 K of warming imitates a fall of about 24 hPa: the spout settles near 148 mm although the pressure is normal. A Goethe glass mixes temperature and pressure; only the barometer reads pressure alone.',
  opens:'What makes crystals appear in the sealed storm glass?'},
 {title:'A cold night',question:'What makes crystals appear in the sealed storm glass?',focus:'storm glass',set:{T:12},until:'event:crystals nucleate',run:40,
  zoom:{to:'seed bed',from:'wide',perDecade:2.5,anchor:'storm glass',stations:[{at:'storm glass',hold:1.5,level:'Instrument'},{at:'crystals',hold:1.5,level:'Crystals'}]},
  text:'Cool the air to 12 °C and watch the clear liquid of the storm glass on the right, down to the seed bed at the bottom. (The Goethe glass reacts too: its trapped air cools and shrinks, the spout water sinks below the bend, and outside air bubbles in.)',
  explain:'The sealed tube never feels the outside pressure, only the temperature. Camphor dissolves less in cold liquid (its solubility changes by about 7 % per kelvin in this model), so once the liquid has followed the air down (it lags by about an hour and a half), it holds more camphor than it can keep: the supersaturation σ = c/S − 1 passes 0.04 and fern fronds nucleate (σ was about 0.07 when they appeared in our run).',
  opens:'Do the crystals vanish again when it warms?'},
 {title:'Morning sun',question:'Do the crystals vanish again when it warms?',focus:'crystals',set:{T:20},until:'event:crystals redissolve',run:45,shot:'close',isolate:['storm glass','thermometer'],
  text:'Warm the air to 20 °C. Watch the fronds thin from their tips while the seed bed at the bottom stays.',
  explain:'Warming raises the solubility above the camphor in solution, so σ turns negative and the young fronds dissolve, within an hour or so in our run. The compact bed at the bottom meets the liquid only on its top face and dissolves far more slowly. The storm glass is a slow thermometer, not a barometer (Williams 2025).',
  opens:'Explore: switch auto weather back on and see which instruments follow the storm and which follow the clock.'}];


/* --- Double pendulum: two pendulums released together at night, under the moon; one is offset by ε ---
   Lagrangian equations for two point masses on massless arms (RK4 at 480 Hz, no temporary arrays); energy
   E = ½(m₁+m₂)L₁²ω₁² + ½m₂L₂²ω₂² + m₂L₁L₂ω₁ω₂cos(θ₁−θ₂) − (m₁+m₂)gL₁cos θ₁ − m₂gL₂cos θ₂ is conserved.
   Chaos: the twins' separation grows ~e^(λt) (λ estimated as ln(|Δθ₂|/ε)/t). A flip = θ₂ passes an odd multiple of π. */
const DPN={};
DIO.doublependulum={params:{m1:[.5,5,2,'kg','upper mass'],m2:[.5,5,1,'kg','lower mass'],L1:[.5,3,1.5,'m','upper arm'],L2:[.5,3,1.5,'m','lower arm'],theta1:[-180,180,120,'°','upper angle'],theta2:[-180,180,-10,'°','lower angle'],g:[1,25,9.81,'m/s²','gravity'],eps:[0,.01,.001,'rad','twin offset']},
 build(D,p){const {W,R,part,put,guides,at,ev,own}=stage(D,'night',{moon:[-.55,.07,-.83]});if(own){R.sun.intensity*=6;if(R.fill)R.fill.intensity=2.4;if(R.rim)R.rim.intensity=3.2;R.nightFloor=.3;D.scene.environmentIntensity=1.6;if(D.scene.userData.look){D.scene.userData.look.exposure=1.25;D.scene.userData.look.vignette=.34}} // the low moon behind is the key (rims every edge), the lantern side a warm front fill; moonlit skylight (hemisphere floor) and a brighter exposure lift the faces out of the dark while the frame stays nocturnal
 const piv=V3(0,6.4,0),sc=4.6/(p.L1+p.L2),oak=D.mats.wood,brass=D.mats.brass,steel=makeMaterial('steel');
  const orbit={target:V3(0,3.7,0),r:15,ph:1.32,th:.34};
  const FR=part('frame');[-3,3].forEach(x=>{const c=box(.35,6.9,.35,oak);c.position.set(x,3.45,-.7);FR.add(c);const f=box(.6,.12,1.4,oak);f.position.set(x,.06,-.7);FR.add(f)});put(box(6.6,.3,.34,oak),'cross bar',FR).position.set(0,6.75,-.7);put(box(.2,.16,.8,steel),'pivot bracket',FR).position.set(0,6.55,-.32);
  const r1=Math.cbrt(p.m1)*.22,r2=Math.cbrt(p.m2)*.22;
  const mk=(name,ghost)=>{const G=part(name,W,!ghost),gm=ghost?new T.MeshPhysicalMaterial({color:0x7ab0f0,transparent:true,opacity:.32,roughness:.2,depthWrite:false}):null;
   const A1=new T.Group(),A2=new T.Group();A1.name='upper arm';A2.name='lower arm';G.add(A1,A2);
   const bar=(L,grp)=>{const b=box(.07,L,.035,gm||steel);b.position.y=-L/2;grp.add(b);if(ghost)b.castShadow=false};bar(p.L1*sc,A1);bar(p.L2*sc,A2);
   const B1=part(ghost?'twin m₁':'m₁ · upper bob',G),B2=part(ghost?'twin m₂':'m₂ · lower bob',G);const b1=ball(r1,gm||brass),b2=ball(r2,gm||D.mats.chrome);B1.add(b1);B2.add(b2);if(ghost){b1.castShadow=b2.castShadow=false}
   if(!ghost){[A1,A2].forEach(a=>{const pin=cyl(.05,.1,brass,12);pin.rotation.x=Math.PI/2;a.add(pin)})}
   return{G,A1,A2,B1,B2}};
  const A=mk('pendulum',false),B=mk('twin (offset ε)',true);B.G.userData.role='actor';
  const glowLine=(c)=>{const t=trail(700,c);t.material.blending=T.AdditiveBlending;t.material.opacity=.9;t.material.depthWrite=false;return t};
  const tA=put(glowLine(0xffc56b),'trail of m₂',guides),tB=put(glowLine(0x7ab0f0),'trail of the twin',guides);
  // foreground: a lantern on the plinth at the lower-right frame edge; its warm light is the fill (the moon is the key)
  {const F=part('lantern (foreground)'),q=inDisc(groundAt(orbit,.82,-.8),6.1);F.position.copy(q);const iron=D.mats.iron;
   const base=cyl(.32,.1,iron,6);base.position.y=.05;F.add(base);[0,1,2,3,4,5].forEach(i=>{const a=i/6*Math.PI*2,r=cyl(.018,.8,iron,6);r.position.set(Math.cos(a)*.28,.5,Math.sin(a)*.28);F.add(r)});
   const top=new T.Mesh(new T.ConeGeometry(.38,.3,6),iron);top.position.y=1.05;F.add(top);const gl=new T.Mesh(new T.CylinderGeometry(.27,.27,.8,6,1,true),thinGlass({absorb:.05,color:0x2a1a08}));gl.position.y=.5;F.add(gl);
   const fl=new T.Mesh(new T.SphereGeometry(.07,12,10),new T.MeshBasicMaterial({color:new T.Color(5,2.6,.9),toneMapped:false}));fl.scale.y=1.8;fl.position.y=.42;F.add(fl);fl.userData.noContact=true;
   const L=new T.PointLight(0xffa860,14,12,2);L.position.y=.5;F.add(L);DPN.flame=fl}
  const d2r=Math.PI/180,s=new Float64Array([p.theta1*d2r,p.theta2*d2r,0,0]),u=new Float64Array([p.theta1*d2r,p.theta2*d2r+p.eps,0,0]),k1=new Float64Array(4),k2=new Float64Array(4),k3=new Float64Array(4),k4=new Float64Array(4),tmpS=new Float64Array(4);
  const f=(y,o)=>{const t1=y[0],t2=y[1],w1=y[2],w2=y[3],m1=p.m1,m2=p.m2,L1=p.L1,L2=p.L2,g=p.g,dd=t1-t2,den=2*m1+m2-m2*Math.cos(2*t1-2*t2);
    o[0]=w1;o[1]=w2;o[2]=(-g*(2*m1+m2)*Math.sin(t1)-m2*g*Math.sin(t1-2*t2)-2*Math.sin(dd)*m2*(w2*w2*L2+w1*w1*L1*Math.cos(dd)))/(L1*den);o[3]=(2*Math.sin(dd)*(w1*w1*L1*(m1+m2)+g*(m1+m2)*Math.cos(t1)+w2*w2*L2*m2*Math.cos(dd)))/(L2*den)};
  const rk=(y,h)=>{f(y,k1);for(let i=0;i<4;i++)tmpS[i]=y[i]+h/2*k1[i];f(tmpS,k2);for(let i=0;i<4;i++)tmpS[i]=y[i]+h/2*k2[i];f(tmpS,k3);for(let i=0;i<4;i++)tmpS[i]=y[i]+h*k3[i];f(tmpS,k4);for(let i=0;i<4;i++)y[i]+=h/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i])};
  const E=y=>{const t1=y[0],t2=y[1],w1=y[2],w2=y[3],{m1,m2,L1,L2,g}=p;return .5*(m1+m2)*L1*L1*w1*w1+.5*m2*L2*L2*w2*w2+m2*L1*L2*w1*w2*Math.cos(t1-t2)-(m1+m2)*g*L1*Math.cos(t1)-m2*g*L2*Math.cos(t2)};const E0=E(s);
  const sep=()=>Math.abs(Math.atan2(Math.sin(s[1]-u[1]),Math.cos(s[1]-u[1])));
  let diverged=false,flips=0,lastFlip=Math.floor((s[1]+Math.PI)/(2*Math.PI)),told=false;const P1=V3(0,0,0),P2=V3(0,0,0),tmp=V3(0,0,0);
  const place=(Q,y,tr)=>{P1.set(piv.x+p.L1*sc*Math.sin(y[0]),piv.y-p.L1*sc*Math.cos(y[0]),0);P2.set(P1.x+p.L2*sc*Math.sin(y[1]),P1.y-p.L2*sc*Math.cos(y[1]),0);
    Q.A1.position.copy(piv);Q.A1.rotation.z=y[0];Q.A2.position.copy(P1);Q.A2.rotation.z=y[1];Q.B1.position.copy(P1);Q.B2.position.copy(P2);if(tr)tr.add(P2)};
  const bobs=(y,v)=>v.set(piv.x+p.L1*sc*Math.sin(y[0])+p.L2*sc*Math.sin(y[1]),piv.y-p.L1*sc*Math.cos(y[0])-p.L2*sc*Math.cos(y[1]),0);
  DPN.m2=()=>bobs(s,V3(0,0,0));DPN.piv=piv;
  D.label('m₁ · upper bob',at(v=>v.set(piv.x+p.L1*sc*Math.sin(s[0]),piv.y-p.L1*sc*Math.cos(s[0])+r1+.3,0)),A.B1);D.label('m₂ · lower bob',at(v=>bobs(s,v).setY(v.y+r2+.3)),A.B2);D.label('twin (offset ε)',at(v=>bobs(u,v).setY(v.y-r2-.35)),B.B2);
  ev('two pendulums released: identical except Δθ₂ = '+p.eps+' rad',bobs(s,V3(0,0,0)),{sound:'whoosh'});D.seriesName='separation |Δθ₂| (log scale)';
  return{orbit,
   step(h){rk(s,h);rk(u,h);const dv=sep();if(!diverged&&dv>10*d2r){diverged=true;ev('chaos: after '+fx(D.t,1)+' s the twins differ by more than 10° (they started '+p.eps+' rad apart: sensitive dependence on initial conditions)',bobs(s,tmp),{sound:'zap',color:0xff9a7a})}
    const fl=Math.floor((s[1]+Math.PI)/(2*Math.PI));if(fl!==lastFlip){flips++;lastFlip=fl;ev('lower arm flips over the top (flip '+flips+' at t = '+fx(D.t,1)+' s)',bobs(s,tmp),{color:0x88c0ff,sound:'whoosh'})}
    if(!told&&!diverged&&D.t>15){told=true;ev('after 15 s the twins are still together (|Δθ₂| = '+fx(dv*DEG,4)+'°): this motion is regular, not chaotic',bobs(s,tmp),{color:0x88c0ff,sound:'chime'})}},
   visual(dt){place(A,s,tA);place(B,u,tB);if(DPN.flame)DPN.flame.scale.y=1.8+Math.sin(D.t*17)*.15+Math.sin(D.t*7.3)*.1;D.push(Math.log10(sep()+1e-9))},
   readouts(){const d=sep();return[['θ₁',fx(s[0]/d2r,1)+'°'],['θ₂',fx(s[1]/d2r,1)+'°'],['ω₁',fx(s[2],2)+' rad/s'],['ω₂',fx(s[3],2)+' rad/s'],['E',fx(E(s),4)+' J'],['E drift',fx(E(s)-E0,5)+' J'],['|Δθ₂|',fx(d*DEG,4)+'°'],['λ ≈ ln(|Δθ₂|/ε)/t',p.eps>0&&D.t>1&&d>0?fx(Math.log(d/p.eps)/D.t,2)+' /s':'…']]}}}};
{const M=()=>DPN.m2?DPN.m2():V3(0,3,0);
 DIO.doublependulum.shots={'two pendulums released':SHOT([0,4,0],12),'chaos':SHOT([0,3.8,0],10.5),'lower arm flips':SHOT(()=>[0,M().y*.5+2.2,0],9.5),'still together':SHOT([0,3.8,0],10.5)};
 DIO.doublependulum.flows={'chaos':[{from:()=>M().add(V3(-1.4,1,0)),to:()=>M().add(V3(-.2,.2,0)),label:'a 0.001 rad difference has grown to a different path'}],'lower arm flips':[{from:()=>V3(0,(DPN.piv?DPN.piv.y:6.4)-1.4,0),to:()=>M(),label:'the upper arm whips the lower one over'}]};}

/* --- Lever: an oak beam on a granite fulcrum, in a meadow in the late afternoon ---
   Torque about the fulcrum τ = −g Σ mᵢ rᵢ cos θ (beam mass at its centre); I = Σ mᵢrᵢ² + M(L²/12 + d²);
   balance when Σ mᵢrᵢ = 0. θ̈ = τ/I − 0.6 θ̇ (pivot damping). The beam stops where its low end meets the ground. */
const LEV={};
DIO.lever={params:{m1:[.2,10,3,'kg','left mass'],x1:[-4,4,-2.5,'m','left position'],m2:[.2,10,2,'kg','right mass'],x2:[-4,4,3,'m','right position'],fulcrum:[-2,2,0,'m','fulcrum position'],beam:[0,5,1,'kg','beam mass']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'landscape',{time:16.3,felt:'#46552e'});const H=2.2,g=9.81,oak=D.mats.wood,iron=D.mats.iron;
  const orbit={target:V3(0,1.9,0),r:12.5,ph:1.28,th:.28};countryside(W,9,orbit.th);
  const FU=part('fulcrum',W,true);{const sh=new T.Shape();sh.moveTo(-.75,0);sh.lineTo(.75,0);sh.lineTo(.04,H);sh.lineTo(-.04,H);sh.lineTo(-.75,0);const gq=new T.ExtrudeGeometry(sh,{depth:1,bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:2});gq.translate(0,0,-.5);const u=gq.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)/2,u.getY(i)/2);
   const m=put(new T.Mesh(gq,makeMaterial('stone')),'granite wedge',FU);m.castShadow=m.receiveShadow=true}FU.position.x=p.fulcrum;
  const BM=part('beam',W,true);BM.position.set(p.fulcrum,H+.1,0);const beam=put(box(9,.16,.7,oak),'oak beam',BM);beam.position.x=-p.fulcrum;
  const weight=(name,m,x)=>{const G=part(name,BM,true),sz=Math.cbrt(m)*.5;const b=box(sz,sz,sz,iron);b.position.y=.08+sz/2;G.add(b);const hd=new T.Mesh(new T.TorusGeometry(sz*.25,.03,8,20,Math.PI),iron);hd.position.y=.08+sz;G.add(hd);G.position.x=x-p.fulcrum;return G};
  const w1=weight('mass 1 · m₁',p.m1,p.x1),w2=weight('mass 2 · m₂',p.m2,p.x2);
  const a1=put(vecArrow(V3(0,-1,0),V3(0,0,0),1,0x88c0ff,.2,.12),'weight 1',guides),a2=put(vecArrow(V3(0,-1,0),V3(0,0,0),1,0xff9a7a,.2,.12),'weight 2',guides);
  // foreground: field stones at the lower-left frame edge
  {const F=part('field stones (foreground)'),q=inDisc(groundAt(orbit,-.84,-.84),6.1);F.position.copy(q);const sm=makeMaterial('stone'),rr=mulberry(4);for(let i=0;i<4;i++){const gq=new T.IcosahedronGeometry(.25+rr()*.25,2),P=gq.attributes.position,v=V3(0,0,0);for(let j=0;j<P.count;j++){v.fromBufferAttribute(P,j);v.multiplyScalar(1+.18*Math.sin(v.x*9+i)*Math.cos(v.z*7));P.setXYZ(j,v.x,Math.max(-.05,v.y*.6),v.z)}gq.computeVertexNormals();const m=new T.Mesh(gq,sm);m.position.set((rr()-.5)*1.4,.1,(rr()-.5)*.8);m.castShadow=m.receiveShadow=true;F.add(m)}}
  const r1=p.x1-p.fulcrum,r2=p.x2-p.fulcrum,rb=-p.fulcrum,I=p.m1*r1*r1+p.m2*r2*r2+p.beam*(81/12+rb*rb)+.05,tq=th=>-g*(p.m1*r1+p.m2*r2+p.beam*rb)*Math.cos(th);
  const limL=Math.asin(Math.min(1,(H+.02)/(4.5+p.fulcrum))),limR=Math.asin(Math.min(1,(H+.02)/(4.5-p.fulcrum)));let th=0,w=0,hit=false,bal=false,told=false,tSt=0;const tmp=V3(0,0,0);
  LEV.ful=V3(p.fulcrum,H,0);LEV.w1=()=>w1.getWorldPosition(V3(0,0,0));LEV.w2=()=>w2.getWorldPosition(V3(0,0,0));LEV.m=[p.m1,p.m2];LEV.end=()=>V3(p.fulcrum+(th>0?-(4.5+p.fulcrum):4.5-p.fulcrum)*Math.cos(th),.2,0);
  D.label('mass 1 · m₁',at(v=>w1.getWorldPosition(v).setY(v.y+.75)),w1);D.label('mass 2 · m₂',at(v=>w2.getWorldPosition(v).setY(v.y+.75)),w2);D.label('fulcrum',at(v=>v.set(p.fulcrum,.45,.8)),FU);D.label('beam',at(v=>v.set(p.fulcrum+3.6*Math.cos(th)*(p.x1<0?1:-1),H+.45+3.6*Math.sin(th)*(p.x1<0?1:-1),0)),BM);
  const net=tq(0);if(Math.abs(net)<.05*g){bal=true;ev('Σ moments ≈ 0: the lever balances (m₁r₁ + m₂r₂ + M·r_beam = 0)',V3(p.fulcrum,H,0),{color:0x88c0ff,sound:'wood'})}else ev('net moment '+fx(net,2)+' N·m: the lever tips '+(net>0?'left':'right'),V3(p.fulcrum,H+.1,0),{sound:'wood'});
  D.seriesName='tilt angle θ (deg)';
  return{orbit,
   step(h){tSt+=h;if(bal){if(!told&&tSt>2){told=true;ev('still balanced after 2 s: the moments m₁g·'+fx(-r1,2)+' m and m₂g·'+fx(r2,2)+' m cancel',V3(p.fulcrum,H+.3,0),{color:0x88c0ff,sound:'chime'})}return}
    const a=tq(th)/I-.6*w;w+=a*h;th+=w*h;const lim=th>0?limL:limR;if(Math.abs(th)>lim){th=Math.sign(th)*lim;if(!hit){hit=true;ev('beam strikes the ground, stopped at '+fx(th*DEG,1)+'°',LEV.end(),{sound:'thud'})}w=-w*.25}},
   visual(){BM.rotation.z=th;w1.getWorldPosition(a1.position);a1.position.y-=.05;a1.setLength(alen(p.m1,Math.max(p.m1,p.m2),1.4));w2.getWorldPosition(a2.position);a2.position.y-=.05;a2.setLength(alen(p.m2,Math.max(p.m1,p.m2),1.4));D.push(th*DEG)},
   readouts(){return[['τ₁ = −m₁g r₁',fx(-p.m1*g*r1,2)+' N·m'],['τ₂ = −m₂g r₂',fx(-p.m2*g*r2,2)+' N·m'],['τ beam',fx(-p.beam*g*rb,2)+' N·m'],['Σ τ (θ = 0)',fx(net,2)+' N·m'],['θ',fx(th*DEG,2)+'°'],['I about fulcrum',fx(I,2)+' kg·m²']]}}}};
{DIO.lever.shots={'moments ≈ 0':SHOT([0,2.2,0],10),'net moment':SHOT([0,2.2,0],10.5),'still balanced':SHOT([0,2.2,0],10),'beam strikes the ground':SHOT(()=>LEV.end?LEV.end().setY(1).toArray():[3,1,0],7)};
 DIO.lever.flows={'net moment':[{at:()=>LEV.w1?LEV.w1().add(V3(0,-.05,.55)):V3(-2.4,2.6,.6),vec:()=>V3(0,-(LEV.m?LEV.m[0]:1),0),ref:()=>LEV.m?Math.max(...LEV.m):1,rim:2,label:'m₁g × r₁ turns it one way',short:'m₁g × r₁'},{at:()=>LEV.w2?LEV.w2().add(V3(0,-.05,.55)):V3(2.8,2.6,.6),vec:()=>V3(0,-(LEV.m?LEV.m[1]:1),0),ref:()=>LEV.m?Math.max(...LEV.m):1,rim:2,label:'m₂g × r₂ the other way',short:'m₂g × r₂'}],'beam strikes the ground':[{from:()=>LEV.ful.clone().add(V3(0,.6,.5)),to:()=>LEV.end().add(V3(0,.4,.5)),label:'the larger moment wins'}],'still balanced':[{from:[-2.5,3.4,.6],to:[2.5,3.4,.6],label:'equal and opposite moments'}]};}

/* --- Reaction A + B ⇌ C in a cell, seen at molecular scale ---
   Hard-sphere gas (m = 1) in a box; an A–B encounter (centres within 0.3) reacts if its relative kinetic energy
   ½μv_rel² (μ = ½) exceeds Ea. Collision theory for this rule: the fraction of encounters that react is
   (1 + Ea/kT) e^(−Ea/kT) (encounters weighted by relative speed). C splits back with rate 1.5·e^(−Eb/kT) (Arrhenius).
   A thermostat relaxes the temperature to T (τ = 0.5 s), standing in for the solvent. Equilibrium: forward = reverse. */
const RXN={};
DIO.reaction={params:{NA:[10,120,60,'','molecules A'],NB:[10,120,60,'','molecules B'],Ea:[0,3,.8,'','forward barrier Ea'],Eb:[0,4,2,'','reverse barrier'],T:[.3,3,1,'','temperature']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'micro');const BX=3.2,BY=2,BZ=2,Y0=BY+.25,RC=.3,RC2=RC*RC;
  const orbit={target:V3(0,Y0,0),r:12,ph:1.12,th:.32};
  const CELL=part('reaction cell',W,true);const gl=put(new T.Mesh(new T.BoxGeometry(2*BX,2*BY,2*BZ),thinGlass({absorb:.015,edge:.6,card:.12,color:0x0a2a2a,transmit:true})),'cell wall',CELL);gl.position.y=Y0;gl.renderOrder=5;
  const ed=put(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(2*BX,2*BY,2*BZ)),new T.LineBasicMaterial({color:0x7fffd8,transparent:true,opacity:.55,blending:T.AdditiveBlending,depthWrite:false})),'cell edges',CELL);ed.position.y=Y0;
  const NA=Math.round(p.NA),NB=Math.round(p.NB),CAP=NA+NB;
  const K=new Int8Array(CAP),P=new Float64Array(CAP*3),Vv=new Float64Array(CAP*3),AX=new Float32Array(CAP*3);let n=0;const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
  const B_=[BX-.12,BY-.12,BZ-.12];
  const add=(k,x,y,z,vx,vy,vz)=>{const i=n++;K[i]=k;P[i*3]=x;P[i*3+1]=y;P[i*3+2]=z;Vv[i*3]=vx;Vv[i*3+1]=vy;Vv[i*3+2]=vz;const a=V3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();AX[i*3]=a.x;AX[i*3+1]=a.y;AX[i*3+2]=a.z;return i};
  const rnd=d=>(Math.random()*2-1)*B_[d],sT=Math.sqrt(p.T);for(let i=0;i<NA;i++)add(0,rnd(0),rnd(1),rnd(2),gauss()*sT,gauss()*sT,gauss()*sT);for(let i=0;i<NB;i++)add(1,rnd(0),rnd(1),rnd(2),gauss()*sT,gauss()*sT,gauss()*sT);
  const remove=i=>{const j=--n;if(i!==j){K[i]=K[j];for(let d=0;d<3;d++){P[i*3+d]=P[j*3+d];Vv[i*3+d]=Vv[j*3+d];AX[i*3+d]=AX[j*3+d]}if(tr===j)tr=i}};
  // atoms drawn instanced: A red, B blue; C = an A and a B fused along the molecule's axis
  const atoms=put(new T.InstancedMesh(new T.SphereGeometry(1,20,14),makeMaterial({preset:'plastic',color:'#ffffff',roughness:.22}),CAP*2),'molecules (A red, B blue, C = A–B)',CELL);atoms.castShadow=false;atoms.userData.noInk=true;atoms.frustumCulled=false;
  const cA=new T.Color(0xd2553c),cB=new T.Color(0x3c78d2),m4=new T.Matrix4(),q4=new T.Quaternion(),s4=V3(1,1,1),p4=V3(0,0,0);
  // the tracked molecule: a halo that rides with one A (and with the C it becomes)
  const TRK=part('tracked molecule',W,true);const halo=put(new T.Mesh(new T.TorusGeometry(.26,.025,8,32),new T.MeshBasicMaterial({color:new T.Color(2.2,2,1),toneMapped:false})),'halo',TRK);const ttr=put(trail(70,0xffe08a),'tracked molecule trail',guides);   // a short tail (a long zigzag across the cell read as a chart)
  // the energy profile on its own card beside the cell (not drawn through the molecules): reactants A + B, the barrier Ea
  // above them, the product C = AB lower by ΔE = Eb − Ea, the reverse barrier Eb measured from C; built from the parameters
  {const PF=part('energy profile',CELL);const cw=1024,chh=720,tex=ctex(cw,chh,(g,w,h)=>{g.fillStyle='rgba(12,22,24,.92)';g.fillRect(0,0,w,h);g.strokeStyle='rgba(127,255,216,.5)';g.lineWidth=4;g.strokeRect(6,6,w-12,h-12);
    const Ea=p.Ea,Eb=p.Eb,lo=Math.min(0,Ea-Eb),hi=Math.max(Ea,.4),x0=120,x1=w-60,yb=h-120,yt=150,sc=(yb-yt)/(hi-lo+.25),lev=e=>yb-(e-lo+.1)*sc,eR=lev(0),eP=lev(Ea),eC=lev(Ea-Eb);   /* levels relative to A + B: the peak at Ea, C at Ea − Eb */
    g.fillStyle='#cfeee6';g.font='italic 46px Georgia, serif';g.textAlign='left';g.fillText('energy along the reaction',x0-40,90);
    g.strokeStyle='rgba(207,238,230,.55)';g.lineWidth=3;g.beginPath();g.moveTo(x0-30,yt-20);g.lineTo(x0-30,yb+20);g.lineTo(x1,yb+20);g.stroke();
    const X=t=>x0+(x1-x0)*t,Y=t=>{const b=Math.exp(-Math.pow((t-.5)/.12,2));return t<.5?eR+(eP-eR)*b:eC+(eP-eC)*b};
    g.strokeStyle='#ffd98a';g.lineWidth=7;g.beginPath();for(let i=0;i<=120;i++){const t=i/120;i?g.lineTo(X(t),Y(t)):g.moveTo(X(t),Y(t))}g.stroke();
    const arrow=(x,ya,yb2,lab)=>{g.strokeStyle='#9fe3ff';g.fillStyle='#9fe3ff';g.lineWidth=4;g.beginPath();g.moveTo(x,ya);g.lineTo(x,yb2);g.stroke();const d=Math.sign(yb2-ya)||1;g.beginPath();g.moveTo(x,yb2);g.lineTo(x-12,yb2-18*d);g.lineTo(x+12,yb2-18*d);g.fill();g.font='italic 44px Georgia, serif';g.textAlign='left';const ym=(ya+yb2)/2+14;g.fillText('E',x+16,ym);g.font='italic 30px Georgia, serif';g.fillText(lab,x+16+g.measureText('E').width*1.45,ym+10)};
    if(Ea>.05)arrow(X(.3),eR,eP+8,'a');if(Eb>.05)arrow(X(.7),eC,eP+8,'b');
    g.fillStyle='#ffffff';g.font='600 50px Georgia, serif';g.textAlign='center';g.fillText('A + B',X(.08),eR-26);g.fillText('C = AB',X(.9),eC-26);
    g.fillStyle='rgba(207,238,230,.75)';g.font='italic 36px Georgia, serif';g.fillText('reaction coordinate →',(x0+x1)/2,yb+80)});
   const card=put(new T.Mesh(new T.PlaneGeometry(2.6,2.6*chh/cw),new T.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false,depthWrite:false})),'energy profile card',PF);card.userData.noInk=true;card.userData.noContact=true;
   PF.position.set(-BX-1.8,Y0+.2,.4);PF.rotation.y=.32;RXN.prof=()=>V3(-BX-1.8,Y0+.2,.4)}   // on the left, turned to the default view (the right-hand side is where the readouts sit)
  let Tk=p.T,tr=0,nf=0,nb=0,flashT=0,enc=0,encOK=0,firstRev=false,eqd=false,tAcc=0,samp=0,tLast=0;const hist=new Float32Array(400);let hn=0;
  const cnt=k=>{let c=0;for(let i=0;i<n;i++)if(K[i]===k)c++;return c};const Vbox=8*BX*BY*BZ,theory=()=>(1+p.Ea/p.T)*Math.exp(-p.Ea/p.T),kr=1.5*Math.exp(-p.Eb/p.T);
  const mp=(i,v)=>v.set(P[i*3],P[i*3+1]+Y0,P[i*3+2]);
  RXN.trk=()=>mp(tr,V3(0,0,0));RXN.Y0=Y0;
  D.label('tracked molecule',at(v=>mp(tr,v).setY(v.y+.4)),TRK);D.label('reaction cell',at(v=>v.set(-BX+.3,Y0+BY+.3,BZ)),CELL);
  D.label('A',at(v=>{for(let i=0;i<n;i++)if(K[i]===0&&i!==tr)return mp(i,v).setY(v.y+.25);return null}),true);D.label('B',at(v=>{for(let i=0;i<n;i++)if(K[i]===1)return mp(i,v).setY(v.y+.25);return null}),true);D.label('C = AB',at(v=>{for(let i=0;i<n;i++)if(K[i]===2&&i!==tr)return mp(i,v).setY(v.y+.3);return null}),true);
  D.seriesName='number of C molecules';const tmp=V3(0,0,0);
  return{orbit,
   step(h){for(let i=0;i<n;i++)for(let d=0;d<3;d++){const j=i*3+d;let q=P[j]+Vv[j]*h;if(q>B_[d]){q=2*B_[d]-q;Vv[j]=-Vv[j]}else if(q<-B_[d]){q=-2*B_[d]-q;Vv[j]=-Vv[j]}P[j]=q}
    flashT-=h;
    // A + B encounters (each counted once, when the pair first comes within RC)
    for(let i=0;i<n;i++){if(K[i]!==0)continue;for(let j=0;j<n;j++){if(K[j]!==1)continue;const dx=P[i*3]-P[j*3],dy=P[i*3+1]-P[j*3+1],dz=P[i*3+2]-P[j*3+2],d2=dx*dx+dy*dy+dz*dz;if(d2>=RC2)continue;
      const vx=Vv[i*3]-Vv[j*3],vy=Vv[i*3+1]-Vv[j*3+1],vz=Vv[i*3+2]-Vv[j*3+2],px=dx-vx*h,py=dy-vy*h,pz=dz-vz*h;if(px*px+py*py+pz*pz<RC2)continue; // already inside last step
      enc++;const ke=.25*(vx*vx+vy*vy+vz*vz);if(ke<=p.Ea)continue;encOK++;
      const wasT=i===tr||j===tr,ci=i===n-1?j:i;K[i]=2;for(let d=0;d<3;d++){P[i*3+d]=(P[i*3+d]+P[j*3+d])/2;Vv[i*3+d]=(Vv[i*3+d]+Vv[j*3+d])/2}remove(j);if(wasT)tr=ci;nf++;
      if(wasT)ev('the tracked molecule reacts: its A meets a B with ½μv² = '+fx(ke,2)+' > Ea = '+fx(p.Ea,2)+' and they bond into C',mp(ci,tmp),{sound:'fizz',color:0xffd27a});
      else if(flashT<=0&&nf<40){ev('collision with KE '+fx(ke,2)+' > Ea = '+fx(p.Ea,2)+': A + B → C',mp(ci,tmp),{sound:'fizz'});flashT=.8}break}}
    // C → A + B (Arrhenius)
    const pr=1-Math.exp(-kr*h);for(let i=0;i<n;i++){if(K[i]!==2||Math.random()>=pr)continue;const wasT=i===tr,ks=Math.sqrt(p.T/2),kx=gauss()*ks,ky=gauss()*ks,kz=gauss()*ks,ax=AX[i*3]*.16,ay=AX[i*3+1]*.16,az=AX[i*3+2]*.16;
      const j=add(1,P[i*3]-ax,P[i*3+1]-ay,P[i*3+2]-az,Vv[i*3]-kx,Vv[i*3+1]-ky,Vv[i*3+2]-kz);K[i]=0;P[i*3]+=ax;P[i*3+1]+=ay;P[i*3+2]+=az;Vv[i*3]+=kx;Vv[i*3+1]+=ky;Vv[i*3+2]+=kz;nb++;
      if(!firstRev){firstRev=true;ev('first reverse reaction: a jostled C breaks apart, C → A + B (rate 1.5·e^(−Eb/kT) = '+fx(kr,3)+' per C per second)',mp(i,tmp),{sound:'snap',color:0x88c0ff})}else if(wasT)ev('the tracked molecule splits again: C → A + B',mp(i,tmp),{sound:'snap'})}
    // thermostat (the solvent): relax ⟨v²⟩/3 toward T with τ = 0.5 s
    let s2=0;for(let i=0;i<n;i++){const mm=K[i]===2?2:1;s2+=mm*(Vv[i*3]*Vv[i*3]+Vv[i*3+1]*Vv[i*3+1]+Vv[i*3+2]*Vv[i*3+2])}const Tn=s2/(3*n);Tk=Tn;const fT=1+(Math.sqrt(p.T/Math.max(.02,Tn))-1)*(1-Math.exp(-h/.5));for(let i=0;i<n*3;i++)Vv[i]*=fT;
    // equilibrium: N_C sampled every 0.1 s; the last 8 s and the 8 s before agree within noise
    tAcc+=h;if(tAcc-tLast>=.1){tLast=tAcc;hist[hn%400]=cnt(2);hn++;if(!eqd&&hn>=160&&tAcc>12){let a=0,b=0;for(let k=0;k<80;k++){a+=hist[(hn-1-k)%400];b+=hist[(hn-81-k)%400]}a/=80;b/=80;const tol=Math.max(1.5,Math.sqrt(Math.max(a,1))*.6);
      if(Math.abs(a-b)<tol){eqd=true;const A=cnt(0),Bn=cnt(1),C=cnt(2);let ci=-1;for(let i=0;i<n;i++)if(K[i]===2&&i!==tr){ci=i;break}ev('dynamic equilibrium: [C] steady at ≈ '+Math.round(a)+' (A '+A+', B '+Bn+'): forward and reverse rates balance, Q = '+fx(A&&Bn?C*Vbox/(A*Bn):NaN,2),ci>=0?mp(ci,V3(0,0,0)):V3(0,Y0,0),{color:0x88c0ff,sound:'chime'})}}}},
   visual(dt){let k=0;for(let i=0;i<n;i++){const x=P[i*3],y=P[i*3+1]+Y0,z=P[i*3+2];if(K[i]===2){const ax=AX[i*3]*.085,ay=AX[i*3+1]*.085,az=AX[i*3+2]*.085;m4.makeScale(.12,.12,.12);m4.setPosition(x+ax,y+ay,z+az);atoms.setMatrixAt(k,m4);atoms.setColorAt(k++,cA);m4.makeScale(.12,.12,.12);m4.setPosition(x-ax,y-ay,z-az);atoms.setMatrixAt(k,m4);atoms.setColorAt(k++,cB)}
      else{m4.makeScale(.11,.11,.11);m4.setPosition(x,y,z);atoms.setMatrixAt(k,m4);atoms.setColorAt(k++,K[i]?cB:cA)}}
    m4.makeScale(0,0,0);for(;k<CAP*2;k++)atoms.setMatrixAt(k,m4);atoms.instanceMatrix.needsUpdate=true;if(atoms.instanceColor)atoms.instanceColor.needsUpdate=true;
    mp(tr,halo.position);halo.rotation.y+=dt*2;halo.rotation.x=.6;ttr.add(halo.position);D.push(cnt(2))},
   readouts(){const a=cnt(0),b=cnt(1),c=cnt(2);return[['N_A · N_B · N_C',a+' · '+b+' · '+c],['Q = [C]/([A][B])',a&&b?fx(c*Vbox/(a*b),2):'—'],['encounters reacting',enc?fx(encOK/enc,3):'…'],['collision theory (1+Ea/kT)e^(−Ea/kT)',fx(theory(),3)],['kinetic T',fx(Tk,2)],['forward events',String(nf)],['reverse events',String(nb)],['k_reverse',fx(kr,3)+' /s']]}}}};
{const M=()=>RXN.trk?RXN.trk():V3(0,2.2,0);
 DIO.reaction.shots={'collision with ke':SHOT(()=>[0,RXN.Y0??2.25,0],8),'tracked molecule reacts':SHOT(()=>M().toArray(),4),'tracked molecule splits':SHOT(()=>M().toArray(),4),'first reverse reaction':SHOT(()=>[0,RXN.Y0??2.25,0],8),'dynamic equilibrium':SHOT(()=>[0,RXN.Y0??2.25,0],10)};
 DIO.reaction.flows={'tracked molecule reacts':[{from:()=>M().add(V3(-1,.6,0)),to:()=>M().add(V3(-.2,.15,0)),label:'enough energy to cross the barrier: a bond forms'}],'dynamic equilibrium':[{from:[-.8,4.6,2],to:[2.4,4.6,2],lane:1,label:'A + B → C'},{from:[2.4,4.6,2],to:[-.8,4.6,2],lane:1,label:'C → A + B, at the same rate',short:'C → A + B'}]};}

/* --- Electric field: two charges on insulating glass stands, their field lines, and a test charge ---
   Softened Coulomb field E = Σ K qᵢ (r − rᵢ)/(|r − rᵢ|² + ε)^{3/2}, V = Σ K qᵢ/√(|r − rᵢ|² + ε), K = 2, ε = 0.01, so E = −∇V
   exactly and ½mv² + qV is conserved (velocity Verlet, 480 Hz). Field lines start on + charges (and on − charges for
   lines that escape), so their density follows |q|; little cones show the direction of E. */
const EFD={};
DIO.efield={params:{q1:[-5,5,3,'','charge q₁'],q2:[-5,5,-3,'','charge q₂'],d:[1,6,3.5,'','separation'],qt:[-2,2,1,'','test charge'],m:[.2,5,1,'','test mass'],drag:[0,8,0,'1/s','drag (charge in oil)']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'abstract');const Y=2.6,K=2,EPS=.01,Q=[[p.q1,V3(-p.d/2,Y,0)],[p.q2,V3(p.d/2,Y,0)]];
  const orbit={target:V3(0,Y-.1,0),r:13,ph:1.08,th:.36};
  const Ef=(x,y,z,o)=>{let ex=0,ey=0,ez=0;for(let i=0;i<2;i++){const q=Q[i][0],c=Q[i][1],dx=x-c.x,dy=y-c.y,dz=z-c.z,r2=dx*dx+dy*dy+dz*dz+EPS,k=K*q/(r2*Math.sqrt(r2));ex+=k*dx;ey+=k*dy;ez+=k*dz}o[0]=ex;o[1]=ey;o[2]=ez;return o};
  const Vp=(x,y,z)=>{let s=0;for(let i=0;i<2;i++){const c=Q[i][1];s+=K*Q[i][0]/Math.sqrt((x-c.x)**2+(y-c.y)**2+(z-c.z)**2+EPS)}return s};
  const glassR=thinGlass({absorb:.06,edge:.9}),walnut=makeMaterial('walnut'),brass=D.mats.brass;
  Q.forEach(([q,c],i)=>{const G=part('charge q'+'₁₂'[i]+(Math.abs(q)<.01?' (zero)':q>0?' (+)':' (−)'),W,true);const r=.18+Math.sqrt(Math.abs(q))*.12;
   if(Math.abs(q)>=.01){const m=put(new T.Mesh(new T.SphereGeometry(r,40,28),new T.MeshPhysicalMaterial({color:q>0?0xd2553c:0x3c78d2,emissive:q>0?0x801800:0x0a2a80,emissiveIntensity:1.1,roughness:.18,clearcoat:1})),'sphere',G);m.position.copy(c);m.castShadow=true;const pl=new T.PointLight(q>0?0xff7050:0x5080ff,4,5,2);pl.position.copy(c);G.add(pl)}
   const rod=new T.Mesh(new T.CylinderGeometry(.05,.05,Y-r,16),glassR);rod.position.set(c.x,(Y-r)/2,c.z);G.add(rod);const base=cyl(.42,.12,walnut,32);base.position.set(c.x,.06,c.z);G.add(base);const ring=new T.Mesh(new T.TorusGeometry(.12,.03,8,20),brass);ring.rotation.x=Math.PI/2;ring.position.set(c.x,.13,c.z);G.add(ring)});
  // field lines as thin glowing tubes (one merged geometry) and direction cones (instanced)
  const lines=[],E3=[0,0,0];const totalQ=p.q1+p.q2;
  Q.forEach(([q,c],qi)=>{if(Math.abs(q)<.01)return;const nL=Math.round(4*Math.abs(q)),sgn=Math.sign(q);for(let i=0;i<nL;i++){const yy=1-2*(i+.5)/nL,rr=Math.sqrt(1-yy*yy),ph=i*2.39996;let x=c.x+.25*rr*Math.cos(ph),y=c.y+.25*yy,z=c.z+.25*rr*Math.sin(ph);const pts=[V3(x,y,z)];let endsOn=-1;
    for(let k=0;k<300;k++){Ef(x,y,z,E3);const m=Math.hypot(E3[0],E3[1],E3[2])||1;x+=sgn*.06*E3[0]/m;y+=sgn*.06*E3[1]/m;z+=sgn*.06*E3[2]/m;if(y<.05||Math.hypot(x,z)>6.6||y>7.5)break;const o=Q[1-qi];if(Math.abs(o[0])>.01&&Math.hypot(x-o[1].x,y-o[1].y,z-o[1].z)<.22){endsOn=1-qi;pts.push(o[1].clone());break}pts.push(V3(x,y,z))}
    if(sgn<0&&endsOn>=0&&Q[endsOn][0]>0)continue; // already drawn from the positive end
    if(pts.length>2)lines.push(pts)}});
  const FLG=part('field lines',W,true);
  if(lines.length){const geos=lines.map(pts=>new T.TubeGeometry(new T.CatmullRomCurve3(pts),Math.max(8,pts.length),.012,4,false));const mg=mergeGeometries(geos);geos.forEach(g=>g.dispose());
   put(new T.Mesh(mg,new T.MeshBasicMaterial({color:new T.Color(1.5,1.15,.5),transparent:true,opacity:.75,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false})),'glowing field lines',FLG).userData.noContact=true;
   const cones=put(new T.InstancedMesh(new T.ConeGeometry(.06,.18,10),new T.MeshBasicMaterial({color:new T.Color(1.8,1.4,.6),toneMapped:false}),lines.length),'direction cones',FLG);cones.frustumCulled=false;cones.userData.noContact=true;const mm=new T.Matrix4(),qq=new T.Quaternion(),up=V3(0,1,0),dv=V3(0,0,0),one=V3(1,1,1);
   lines.forEach((pts,i)=>{const j=Math.floor(pts.length*.5),a=pts[j],b=pts[Math.min(pts.length-1,j+1)];Ef(a.x,a.y,a.z,E3);dv.set(E3[0],E3[1],E3[2]).normalize();qq.setFromUnitVectors(up,dv);mm.compose(a,qq,one);cones.setMatrixAt(i,mm)})}
  // equipotential plate: the potential in the plane of the charges, banded every 0.5 units of V
  const pc=document.createElement('canvas');pc.width=pc.height=256;const g=pc.getContext('2d'),img=g.createImageData(256,256);for(let j=0;j<256;j++)for(let i=0;i<256;i++){const x=-6+12*i/255,z=-6+12*j/255,V_=Vp(x,Y,z),v=Math.tanh(V_/3);const o=(j*256+i)*4;const band=Math.abs(Math.sin(V_*Math.PI*2))<.1?60:0,fade=Math.max(0,1-Math.hypot(x,z)/6.3);img.data[o]=(v>0?170:30)+band;img.data[o+1]=50+band+(1-Math.abs(v))*30;img.data[o+2]=(v<0?190:40)+band;img.data[o+3]=Math.min(200,(Math.abs(v)*170+20+band*1.5)*fade)}g.putImageData(img,0,0);
  const ptex=new T.CanvasTexture(pc);ptex.colorSpace=T.SRGBColorSpace;const plate=put(new T.Mesh(new T.CircleGeometry(6.3,64),new T.MeshBasicMaterial({map:ptex,transparent:true,opacity:.42,depthWrite:false,side:T.DoubleSide})),'potential map (equipotential bands)',guides);plate.rotation.x=-Math.PI/2;plate.position.y=Y;
  // the test charge
  const TC=part('test charge · q, m',W,true);const tc=put(ball(.13,D.mats.chrome),'test charge',TC);const tr=put(trail(800,0x9fe0ff),'test charge trail',guides);
  const P0=[-p.d/2+.45,Y+.4,.25],V0=[0,0,0],gam=p.drag??0;let P=P0.slice(),Vv=V0.slice(),A=[0,0,0],gone=false,wait=0,again=false;const Etot=()=>.5*p.m*(Vv[0]**2+Vv[1]**2+Vv[2]**2)+p.qt*Vp(P[0],P[1],P[2]);let Einit=Etot();
  const acc=()=>{Ef(P[0],P[1],P[2],A);const k=p.qt/p.m;A[0]*=k;A[1]*=k;A[2]*=k};acc();
  // foreground: a brass Leyden jar on the plinth at the lower-left frame edge
  {const F=part('Leyden jar (foreground)'),q=inDisc(groundAt(orbit,-.84,-.82),6.1);F.position.copy(q);const j=new T.Mesh(new T.CylinderGeometry(.34,.34,.9,32),thinGlass({absorb:.05,transmit:true}));j.position.y=.45;F.add(j);const foil=cyl(.345,.5,makeMaterial('steel'),32);foil.position.y=.26;F.add(foil);const cap=cyl(.36,.06,walnut,32);cap.position.y=.93;F.add(cap);const rod=cyl(.02,.6,brass,8);rod.position.y=1.2;F.add(rod);const kn=ball(.08,brass);kn.position.y=1.52;F.add(kn)}
  const tp=V3(0,0,0);EFD.tc=()=>V3(P[0],P[1],P[2]);EFD.Y=Y;EFD.Q=Q;
  D.label('q₁',at(v=>v.copy(Q[0][1]).setY(Y+.55)),true);D.label('q₂',at(v=>v.copy(Q[1][1]).setY(Y+.55)),true);D.label('test charge · q, m',at(v=>gone?null:v.set(P[0],P[1]+.32,P[2])),TC);D.label('field lines',at(v=>lines.length?v.copy(lines[0][Math.floor(lines[0].length*.5)]).setY(lines[0][Math.floor(lines[0].length*.5)].y+.2):null),FLG);
  ev('test charge released from rest beside q₁; force F = qE'+(gam>0?', drag −γmv (in oil)':', energy ½mv² + qV conserved'),V3(...P),{sound:'zap'});D.seriesName='potential V at test charge';
  return{orbit,
   step(h){if(gone){wait+=h;if(wait>1.2){P=P0.slice();Vv=V0.slice();gone=false;wait=0;tr.userData.count=0;acc();Einit=Etot();if(!again){again=true;ev('test charge released again from the same point',tp.set(P[0],P[1],P[2]),{sound:'zap'})}}return}
    if(gam>0){acc();for(let d=0;d<3;d++){Vv[d]=(Vv[d]+A[d]*h)/(1+gam*h);P[d]+=Vv[d]*h}} // in oil: implicit drag, the charge creeps along E
    else{for(let d=0;d<3;d++){Vv[d]+=A[d]*h/2;P[d]+=Vv[d]*h}acc();for(let d=0;d<3;d++)Vv[d]+=A[d]*h/2} // velocity Verlet: ½mv² + qV conserved
    for(const [q,c] of Q)if(Math.abs(q)>.01&&Math.hypot(P[0]-c.x,P[1]-c.y,P[2]-c.z)<.25){gone=true;ev('test charge captured by the '+(q>0?'+':'−')+' charge ('+(q*p.qt<0?'opposite signs attract':'it was flung into it')+')'+(gam>0?' after creeping along a field line; drag took '+fx(Einit-Etot(),2)+' of its energy':'; energy drift '+fx(Etot()-Einit,3)),c.clone(),{color:0xff9a7a,sound:'zap'});break}
    if(!gone&&(Math.hypot(P[0],P[2])>6.5||P[1]<.1||P[1]>8)){gone=true;ev('test charge escapes the diorama at speed '+fx(Math.hypot(...Vv),2)+' (repelled or flung)',tp.set(P[0],P[1],P[2]),{sound:'whoosh'})}},
   visual(){tc.position.set(P[0],P[1],P[2]);TC.visible=!gone;if(!gone)tr.add(tc.position);D.push(Vp(P[0],P[1],P[2]))},
   readouts(){Ef(P[0],P[1],P[2],E3);const e=Math.hypot(E3[0],E3[1],E3[2]);return[['|E| at q',fx(e,3)],['V at q',fx(Vp(P[0],P[1],P[2]),3)],['speed',fx(Math.hypot(Vv[0],Vv[1],Vv[2]),3)],['energy ½mv² + qV',fx(Etot(),4)],[gam>0?'energy taken by drag':'energy drift',fx(gam>0?Einit-Etot():Etot()-Einit,4)],['|F| = |q|E',fx(Math.abs(p.qt)*e,3)],['field lines drawn',String(lines.length)]]}}}};
{const C=()=>EFD.tc?EFD.tc():V3(0,4,0),Y=()=>EFD.Y??2.6;
 DIO.efield.shots={'test charge released':SHOT(()=>[0,Y()+.3,0],9.5),'captured':SHOT(()=>C().toArray(),5.5),'escapes':SHOT(()=>[0,Y(),0],12)};
 DIO.efield.flows={'test charge released':[{from:()=>C(),to:()=>{const q=EFD.Q,E=[0,0,0];let ex=0,ey=0,ez=0;const c=C();for(const [qq,cc] of q){const d=c.clone().sub(cc),r2=d.lengthSq()+.01,k=2*qq/(r2*Math.sqrt(r2));ex+=k*d.x;ey+=k*d.y;ez+=k*d.z}const v=V3(ex,ey,ez).normalize().multiplyScalar(1.2);return c.add(v)},label:'F = qE, along the field line through it'}],
  'captured':[{from:()=>C().add(V3(0,1.2,0)),to:()=>C().add(V3(0,.25,0)),label:'opposite charges attract'}]};}

/* --- RC circuit on a breadboard in the lab: battery, two-way switch, resistor, capacitor, voltmeter ---
   Kirchhoff around the loop: ε = IR + q/C (charging) or 0 = IR + q/C (battery switched out); I = dq/dt.
   q(t) approaches its final value as e^(−t/RC); after one τ = RC it has gone 63.2 % of the way, after 5τ 99.3 %.
   Units: R in kΩ and C in mF, so τ = RC comes out in seconds. Electrons drift opposite to the conventional current
   (drawn ~10⁴× faster than real drift); none cross the gap between the plates: charge piles up on them instead. */
const RCC={};
DIO.circuit={params:{V:[1,12,9,'V','battery emf'],R:[1,20,5,'kΩ','resistance'],C:[.1,2,.6,'mF','capacitance'],closed:[0,1,1,'','switch: 1 charge · 0 discharge']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'lab');const Y=.35;
  const orbit={target:V3(-.3,.9,0),r:12,ph:1.0,th:.3},walnut=makeMaterial('walnut'),brass=D.mats.brass,copper=makeMaterial('copper');
  const A=[V3(-4.5,Y,-2.5),V3(4.5,Y,-2.5),V3(4.5,Y,2.5),V3(-4.5,Y,2.5),V3(-4.5,Y,-2.5)],Bp=[V3(-4.5,Y,-2.5),V3(-1.6,Y,-2.5),V3(-1.6,Y,-3.3),V3(1.6,Y,-3.3),V3(1.6,Y,-2.5),V3(4.5,Y,-2.5),V3(4.5,Y,2.5),V3(-4.5,Y,2.5),V3(-4.5,Y,-2.5)];
  const mkPath=pts=>{const c=new T.CurvePath();for(let i=0;i<pts.length-1;i++)c.add(new T.LineCurve3(pts[i],pts[i+1]));return c},pathA=mkPath(A),pathB=mkPath(Bp);
  const BD=part('breadboard');put(box(10.6,.16,7.6,satin(walnut)),'walnut board',BD).position.set(0,.08,-.3);
  [[-5,-3.7],[5,-3.7],[-5,3.1],[5,3.1]].forEach(([x,z])=>{const t=cyl(.12,.14,brass,16);t.position.set(x,.23,z);BD.add(t)});
  const WR=part('wires');const wire=(a,b)=>{const L=a.distanceTo(b);if(L<1e-3)return;const m=cyl(.05,L,copper,10);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V3(0,1,0),b.clone().sub(a).normalize());WR.add(m)};
  // loop A with gaps at the battery, the capacitor and the switch; the bypass branch under the battery
  wire(V3(-4.5,Y,-2.5),V3(-2.0,Y,-2.5));wire(V3(-1.1,Y,-2.5),V3(-.95,Y,-2.5));wire(V3(.95,Y,-2.5),V3(4.5,Y,-2.5));wire(V3(4.5,Y,-2.5),V3(4.5,Y,-.75));wire(V3(4.5,Y,.75),V3(4.5,Y,2.5));wire(V3(4.5,Y,2.5),V3(-4.5,Y,2.5));wire(V3(-4.5,Y,2.5),V3(-4.5,Y,.2));wire(V3(-4.5,Y,-.2),V3(-4.5,Y,-2.5));
  wire(V3(-1.6,Y,-3.3),V3(1.6,Y,-3.3));wire(V3(1.6,Y,-3.3),V3(1.6,Y,-2.5));wire(V3(-1.6,Y,-3.3),V3(-1.6,Y,-3.0));
  const BAT=part('battery · ε',W,true);{const b=cyl(.42,1.9,makeMaterial({preset:'plastic',color:'#1d2a3a',roughness:.3}),48);b.rotation.z=Math.PI/2;b.position.set(0,Y+.42,-2.5);BAT.add(b);const band=cyl(.425,.6,makeMaterial({preset:'plastic',color:'#cfa84f',roughness:.3}),48);band.rotation.z=Math.PI/2;band.position.set(.55,Y+.42,-2.5);BAT.add(band);const tp=cyl(.14,.14,brass,16);tp.rotation.z=Math.PI/2;tp.position.set(1.02,Y+.42,-2.5);BAT.add(tp);const tm=cyl(.3,.04,makeMaterial('steel'),24);tm.rotation.z=Math.PI/2;tm.position.set(-.97,Y+.42,-2.5);BAT.add(tm)}
  // knife switch: a brass blade from its hinge at x = −2 to the battery contact (charge) or to the bypass contact (discharge)
  const SW=part('switch',W,true);{const hinge=box(.22,.22,.22,brass);hinge.position.set(-2.05,Y+.05,-2.5);SW.add(hinge);[[-1.1,-2.5],[-1.6,-3.0]].forEach(([x,z])=>{const c=box(.16,.24,.16,brass);c.position.set(x,Y+.07,z);SW.add(c)});const bl=new T.Group();bl.position.set(-2.05,Y+.12,-2.5);SW.add(bl);const blade=box(.95,.04,.1,brass);blade.position.x=.48;bl.add(blade);const hd=cyl(.06,.24,makeMaterial('rubber'),12);hd.position.set(.95,.12,0);bl.add(hd);RCC.blade=bl}
  // resistor with colour bands for its value (two digits and a multiplier), gold tolerance
  const RES=part('resistor · R',W,true);{const body=cyl(.24,1.3,makeMaterial({preset:'ceramic',color:'#d8c8a2',roughness:.5}),24);body.rotation.x=Math.PI/2;body.position.set(4.5,Y+.1,0);RES.add(body);
   const ohm=Math.round(p.R*1000),e=Math.floor(Math.log10(ohm))-1,d2=Math.round(ohm/Math.pow(10,e)),COLS=['#141414','#7a4a1a','#c0281c','#e0701c','#e8c81c','#2a8a3a','#2a4ac0','#8a3ac0','#808080','#f0f0f0'];
   [Math.floor(d2/10)%10,d2%10,Math.max(0,e)].map(i=>COLS[i]).concat(['#cfa84f']).forEach((c,i)=>{const b=cyl(.248,.1,makeMaterial({preset:'ceramic',color:c}),32);b.rotation.x=Math.PI/2;b.position.set(4.5,Y+.1,-.42+i*.26+(i===3?.12:0));RES.add(b)})}
  // capacitor: two plates across the wire (normal along the wire), a dielectric sheet between them
  const CAPG=part('capacitor · C',W,true);const plM=makeMaterial('steel');plM.emissive=new T.Color(0xff6040);plM.emissiveIntensity=0;const plM2=makeMaterial('steel');plM2.emissive=new T.Color(0x4070ff);plM2.emissiveIntensity=0;
  {const a=box(1.3,1.2,.06,plM),b=box(1.3,1.2,.06,plM2);a.position.set(-4.5,Y+.55,-.18);b.position.set(-4.5,Y+.55,.18);CAPG.add(a,b);const di=box(1.2,1.1,.26,makeMaterial({preset:'plastic',color:'#e8d8a0',roughness:.6,opacity:.5}));di.position.set(-4.5,Y+.55,0);CAPG.add(di)}
  const glow=new T.PointLight(0xffa060,0,3,2);glow.position.set(-4.5,Y+.6,0);CAPG.add(glow);
  // voltmeter across the capacitor
  const VM=part('voltmeter (across C)',W,true);{const cs=box(1.3,1.1,.45,walnut);cs.position.set(-2.8,Y+.62,.3);VM.add(cs);const face=new T.Mesh(new T.PlaneGeometry(1.1,.9),new T.MeshPhysicalMaterial({map:dialTex({n:6,sub:5,a0:-1.1,a1:1.1,labels:['0','2','4','6','8','10','12'],caption:'volts',S:512}),roughness:.4,clearcoat:1}));face.position.set(-2.8,Y+.62,.53);VM.add(face);
   [[-.3,0x111111],[.3,0xb02016]].forEach(([dz,c])=>{const l=lineFrom([V3(-2.8+dz,Y+.15,.35),V3(-4.1,Y+.25,dz*.6)],c);VM.add(l)})}
  const vn=needle(.42,new T.MeshBasicMaterial({color:0x111111}));vn.position.set(-2.8,Y+.4,.54);VM.add(vn);
  // electrons and one tracked electron (they skip the capacitor gap: charge collects on the plates)
  const NE=70,el_=put(new T.InstancedMesh(new T.SphereGeometry(.06,10,8),new T.MeshBasicMaterial({color:new T.Color(.7,1.6,2.2),toneMapped:false}),NE),'electrons',W);el_.userData.noInk=true;el_.frustumCulled=false;el_.userData.noContact=true;
  const TE=part('tracked electron',W,true);const te=put(new T.Mesh(new T.SphereGeometry(.1,14,10),new T.MeshBasicMaterial({color:new T.Color(2.4,2.2,.8),toneMapped:false})),'tracked electron',TE);
  const eu=new Float32Array(NE+1);for(let i=0;i<=NE;i++)eu[i]=i/NE;
  const gapOf=(path,len)=>{const pts=path.getSpacedPoints(2000);let a=-1,b=-1;pts.forEach((q,i)=>{if(Math.abs(q.x+4.5)<1e-3&&Math.abs(q.z)<.2){if(a<0)a=i/2000;b=i/2000}});return[a,b]},gA=gapOf(pathA),gB=gapOf(pathB);
  {const s=put(stopwatch(1),'stopwatch (foreground)');s.position.copy(inDisc(groundAt(orbit,.84,-.84),6.2));s.rotation.y=-.5}
  let q=p.closed>.5?0:p.C*1e-3*p.V,t0=0,m1=false,m5=false,q0=q;const Cf=p.C*1e-3,Rr=p.R*1e3,tau=Rr*Cf;const tmp=V3(0,0,0),m4=new T.Matrix4();
  const target=()=>p.closed>.5?Cf*p.V:0;
  RCC.te=()=>te.position.clone();RCC.Y=Y;
  D.label('battery · ε',at(v=>v.set(0,Y+1.2,-2.5)),BAT);D.label('resistor · R',at(v=>v.set(4.5,Y+.8,0)),RES);D.label('capacitor · C',at(v=>v.set(-4.5,Y+1.6,0)),CAPG);D.label('switch',at(v=>v.set(-1.8,Y+.7,-2.6)),SW);D.label('voltmeter (across C)',at(v=>v.set(-2.8,Y+1.45,.3)),VM);D.label('tracked electron',at(v=>v.copy(te.position).setY(te.position.y+.3)),TE);
  ev((p.closed>.5?'switch closed: capacitor charges through R':'switch to the bypass: capacitor discharges through R')+', τ = RC = '+fx(tau,2)+' s',V3(-2,Y+.3,-2.5),{sound:'click'});D.seriesName='capacitor voltage V_C (V)';
  return{orbit,
   live(k){if(k==='closed'){t0=D.t;m1=m5=false;q0=q;ev(p.closed>.5?'switch flipped: charging':'switch flipped: discharging',V3(-2,Y+.3,-2.5),{sound:'click'});return true}return false},
   step(h){const src=p.closed>.5?p.V:0,I=(src-q/Cf)/Rr;q+=I*h;const el2=D.t-t0,Vc=q/Cf;
    if(!m1&&el2>=tau){m1=true;ev('t = τ = '+fx(tau,2)+' s: V_C = '+fx(Vc,2)+' V has covered 63.2 % of the way (1 − 1/e) from '+fx(q0/Cf,2)+' V to '+fx(src,2)+' V',V3(-4.5,Y+.8,0),{sound:'zap'})}
    if(!m5&&el2>=5*tau){m5=true;ev('t = 5τ = '+fx(5*tau,2)+' s: V_C = '+fx(Vc,2)+' V, within 0.7 % of its final value',V3(-4.5,Y+.8,0),{color:0x88c0ff,sound:'chime'})}},
   visual(dt){const src=p.closed>.5?p.V:0,I=(src-q/Cf)/Rr,Vc=q/Cf,sp=I*Rr/p.V*.25,path=p.closed>.5?pathA:pathB,gp=p.closed>.5?gA:gB,du=sp*dt*(D.playing?D.speed:0);
    RCC.blade.rotation.y=p.closed>.5?0:Math.atan2(.5,.45);
    for(let i=0;i<=NE;i++){let u=mod(eu[i]-du,1);if(u>gp[0]&&u<gp[1])u=du>0?gp[0]-1e-4:gp[1]+1e-4;eu[i]=u;path.getPointAt(u,tmp);if(i<NE){m4.makeTranslation(tmp.x,tmp.y+.1,tmp.z);el_.setMatrixAt(i,m4)}else te.position.set(tmp.x,tmp.y+.14,tmp.z)}el_.instanceMatrix.needsUpdate=true;
    const f=clamp(Vc/12,0,1);plM.emissiveIntensity=f*1.4;plM2.emissiveIntensity=f*1.4;glow.intensity=f*2.5;vn.rotation.z+=(-(-1.1+2.2*clamp(Vc/12,0,1.04))-vn.rotation.z)*Math.min(1,dt*6);D.push(Vc)},
   readouts(){const src=p.closed>.5?p.V:0,I=(src-q/Cf)/Rr,Vc=q/Cf;return[['V_C',fx(Vc,2)+' V'],['I',fx(I*1e3,3)+' mA'],['V_R = IR',fx(I*Rr,2)+' V'],['V_R + V_C',fx(I*Rr+Vc,2)+' V (= '+fx(src,1)+' V)'],['q',fx(q*1e3,2)+' mC'],['τ = RC',fx(tau,2)+' s'],['energy ½CV²',fx(.5*Cf*Vc*Vc*1e3,2)+' mJ'],['t − t_switch',fx(D.t-t0,2)+' s']]}}}};
{const Y=()=>RCC.Y??.35;
 DIO.circuit.shots={'switch closed':SHOT(()=>[-1.6,Y()+.4,-2.4],5),'switch to the bypass':SHOT(()=>[-1.6,Y()+.4,-2.6],5),'switch flipped':SHOT(()=>[-1.6,Y()+.4,-2.5],5),'t = τ':SHOT(()=>[-3.7,Y()+.6,0],5),'t = 5τ':SHOT(()=>[-3.7,Y()+.6,0],5)};
 DIO.circuit.flows={'switch closed':[{from:[1.3,.9,-2.5],to:[4.2,.9,-2.2],label:'current leaves the + terminal'},{from:[4.4,.9,1.6],to:[-3.8,.9,2.3],label:'electrons drift the other way'}],
  't = τ':[{from:[-4.5,1.9,-.9],to:[-4.5,1.2,-.25],label:'charge piles up on the plates'},{from:[-3.4,1.6,.6],to:[-2.9,1.2,.6],label:'the meter reads V_C = q/C'}],'switch flipped: discharging':[{from:[-4.2,.8,1.6],to:[3.5,.8,2.4],label:'the capacitor now drives the current back'}]};}

/* --- Thin lens on an optical bench at a writing desk; the candle flame is the object, the desk lamp the key light ---
   1/f = 1/d_o + 1/d_i (real-is-positive), m = −d_i/d_o, h_i = m h_o. The three principal rays leave the flame tip:
   parallel → through F′; through the centre undeviated; toward F → parallel. A real image (d_i > 0) forms on the
   screen; a virtual one (d_i < 0) is where the outgoing rays seem to come from (dashed). */
const LNS={};
DIO.lens={params:{f:[-4,6,2.5,'','focal length (negative: diverging)'],do:[.5,6,4,'','object distance'],ho:[.3,1.5,.8,'','object height'],sweep:[0,1,0,'','sweep object (1 on)']},
 build(D,p){const {W,R,part,put,guides,at,ev}=stage(D,'desk');const Y=2.2,fl=Math.abs(p.f)<.05?.05:p.f,RB=Y-1.55,brass=D.mats.brass,walnut=makeMaterial('walnut'),steel=makeMaterial('steel');
  const orbit={target:V3(.8,Y-.3,0),r:12.8,ph:1.22,th:.2};
  // optical bench: a steel rail on walnut feet, with brass carriers for candle, lens and screen
  const OB=part('optical bench');put(box(13.2,.12,.45,steel),'steel rail',OB).position.set(0,RB,0);[-5.8,5.8].forEach(x=>{const f=box(.6,RB-.06,.9,walnut);f.position.set(x,(RB-.06)/2,0);OB.add(f)});
  {const tex=ctex(2048,64,(g,w,h)=>{g.fillStyle='#e8dcc0';g.fillRect(0,0,w,h);g.fillStyle='#24170b';g.strokeStyle='#24170b';g.font='600 26px Georgia, serif';g.textAlign='center';for(let x=-6;x<=6;x+=.25){const px=(x+6.5)/13*w,big=Math.abs(x%1)<1e-6;g.lineWidth=big?3:1.5;g.beginPath();g.moveTo(px,0);g.lineTo(px,big?30:16);g.stroke();if(big)g.fillText(String(x),px,54)}});const sc=new T.Mesh(new T.PlaneGeometry(13,.2),new T.MeshPhysicalMaterial({map:tex,roughness:.5}));sc.position.set(0,RB+.061,.12);sc.rotation.x=-Math.PI/2;sc.name='scale';OB.add(sc)}
  const carrier=(G,x,h)=>{const c=box(.5,.22,.6,brass);c.position.set(x,RB+.17,0);G.add(c);const post=cyl(.04,h,steel,12);post.position.set(x,RB+.28+h/2,0);G.add(post);return[c,post]};
  // the lens: a biconvex (or biconcave) solid-glass lathe in a brass ring
  const LG=part(fl>0?'converging lens':'diverging lens',W,true);
  {const a=1.4,n=1.52,Rc=Math.max(a*1.02,2*(n-1)*Math.abs(fl)),s=r=>Rc-Math.sqrt(Rc*Rc-r*r),te=.08,prof=[],N=24;
   for(let i=0;i<=N;i++){const r=a*i/N,hh=fl>0?te/2+Math.min(.45,s(a))*(1-s(r)/s(a)):te/2+Math.min(.35,s(a))*s(r)/s(a);prof.push(new T.Vector2(Math.max(.001,r),hh))}for(let i=N;i>=0;i--){const q=prof[i];prof.push(new T.Vector2(q.x,-q.y))}
   const lg=new T.LatheGeometry(prof,64);lg.rotateZ(Math.PI/2);const lm=makeMaterial('solidglass');lm.thickness=fl>0?.5:.25;lm.ior=n;const lens=put(new T.Mesh(lg,lm),'glass lens',LG);lens.position.y=Y;
   const ring=new T.Mesh(new T.TorusGeometry(a+.04,.05,10,64),brass);ring.rotation.y=Math.PI/2;ring.position.y=Y;LG.add(ring);carrier(LG,0,Y-RB-a-.3)}
  // F and F′ markers on the rail
  [fl,-fl].forEach((x,i)=>{const m=ball(.07,makeMaterial({preset:'plastic',color:'#b2382a'}));m.position.set(x,RB+.12,.32);m.name='focal point '+(i?'F':'F′');OB.add(m)});
  // the object: a candle whose flame tip is the object point (the flame lights the bench)
  const CN=part('object (candle)',W,true),flameH=.34;
  const wax=makeMaterial({preset:'ceramic',color:'#efe6d0',roughness:.55}),flameM=new T.MeshBasicMaterial({color:new T.Color(4,2.4,.8),toneMapped:false,transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false});
  const mkCandle=(mat,fm)=>{const g=new T.Group(),bodyH=Math.max(.2,p.ho-flameH+(Y-RB-.3)),body=new T.Mesh(new T.CylinderGeometry(.14,.15,bodyH,24),mat);body.position.y=p.ho-flameH-bodyH/2;body.castShadow=!fm;g.add(body);
   const fg=new T.SphereGeometry(.07,16,12);fg.translate(0,.07,0);const fla=new T.Mesh(fg,fm);fla.scale.set(1,flameH/.14,1);fla.position.y=p.ho-flameH;g.add(fla);const wick=cyl(.008,.06,new T.MeshBasicMaterial({color:0x111111}),6);wick.position.y=p.ho-flameH+.02;g.add(wick);return{g,fla}};
  const cand=mkCandle(wax,flameM);CN.add(cand.g);const cLight=new T.PointLight(0xffa860,1.6,6,2);cLight.position.y=p.ho-.1;cand.g.add(cLight);const [cc]=carrier(CN,0,.01);
  // the image: a ghost of the candle scaled by m (inverted when real), and a white screen that catches a real image
  const IM=part('image',W,true);const ghostM=new T.MeshPhysicalMaterial({color:0x9fd0ff,transparent:true,opacity:.28,roughness:.3,depthWrite:false}),ghostF=new T.MeshBasicMaterial({color:new T.Color(2,1.3,.5),transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
  const ig=mkCandle(ghostM,ghostF);IM.add(ig.g);ig.g.children.forEach(o=>o.castShadow=false);
  const SCR=part('screen',W,true);{const cardM=makeMaterial({preset:'card'});cardM.color.set(0x8a857c);cardM.roughness=1;const card=new T.Mesh(new T.PlaneGeometry(1.8,2.2),cardM);card.rotation.y=-Math.PI/2;card.position.y=Y;SCR.add(card);card.material.side=T.DoubleSide;const fr=box(.06,2.3,.08,walnut);fr.position.set(.04,Y,-.95);SCR.add(fr);const fr2=fr.clone();fr2.position.z=.95;SCR.add(fr2);carrier(SCR,0,Y-RB-1.4)}
  const spot=put(new T.Sprite(new T.SpriteMaterial({map:softDisc(),color:0xffc070,transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false})),'image on the screen',SCR);
  // rays: three principal rays (preallocated 3-point lines) and their dashed back-extensions
  const rayM=[0xffd27a,0xff9a7a,0x9fe0ff].map(c=>new T.LineBasicMaterial({color:c,transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false}));
  const mkLine=(mat,n)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(n*3),3));if(mat.isLineDashedMaterial)g.setAttribute('lineDistance',new T.BufferAttribute(new Float32Array(n),1));const l=new T.Line(g,mat);l.frustumCulled=false;return l};
  const rays=[0,1,2].map(i=>put(mkLine(rayM[i],3),'ray '+(i+1),guides)),dashM=new T.LineDashedMaterial({color:0xcccccc,dashSize:.15,gapSize:.1,transparent:true,opacity:.6}),backs=[0,1,2].map(()=>put(mkLine(dashM,2),'virtual ray',guides));
  const setL=(l,pts)=>{const a=l.geometry.attributes.position;let d=0;for(let i=0;i<pts.length;i++){a.setXYZ(i,pts[i].x,pts[i].y,pts[i].z);if(l.geometry.attributes.lineDistance){if(i)d+=pts[i].distanceTo(pts[i-1]);l.geometry.attributes.lineDistance.setX(i,d)}}a.needsUpdate=true;if(l.geometry.attributes.lineDistance)l.geometry.attributes.lineDistance.needsUpdate=true};
  // a photon riding ray 1 (for the "follow a ray" point of view)
  const PH=part('light ray (photon)',W,true);const ph=put(new T.Mesh(new T.SphereGeometry(.06,12,10),new T.MeshBasicMaterial({color:new T.Color(3,2.6,1.4),toneMapped:false})),'photon',PH);ph.userData.noContact=true;
  // foreground: an open notebook and a pencil on the desk at the lower-right frame edge
  {const F=part('notebook (foreground)'),q=groundAt(orbit,.8,-.86,0);q.z=Math.min(q.z,5);q.x=Math.min(q.x,8);F.position.copy(q);F.rotation.y=-.35;const pg=ctex(512,384,(g,w,h)=>{g.fillStyle='#f3ecdc';g.fillRect(0,0,w,h);g.strokeStyle='rgba(60,90,140,.35)';g.lineWidth=2;for(let y=40;y<h;y+=24){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}g.strokeStyle='rgba(30,20,10,.75)';g.lineWidth=2.4;g.font='italic 26px Georgia, serif';g.fillStyle='rgba(30,20,10,.8)';g.fillText('1/f = 1/dₒ + 1/dᵢ',40,88);g.fillText('m = − dᵢ / dₒ',40,136)});
   const pa=new T.Mesh(new T.PlaneGeometry(2.2,1.6),new T.MeshPhysicalMaterial({map:pg,roughness:.9}));pa.rotation.x=-Math.PI/2;pa.position.y=.02;pa.receiveShadow=true;F.add(pa);const pen=cyl(.04,1.5,makeMaterial({preset:'plastic',color:'#c8a028',roughness:.5}),6);pen.rotation.set(0,.5,Math.PI/2);pen.position.set(.3,.06,.95);F.add(pen)}
  let dObj=p.do,regime=null,di=0,hi=0,ut=0,arrived=false,lastDi=NaN;const O=V3(0,0,0),P1=V3(0,0,0),P3=V3(0,0,0),Ef=V3(0,0,0),img=V3(0,0,0),d2=V3(0,0,0),tmp=V3(0,0,0),q1=V3(0,0,0),q2=V3(0,0,0);
  const classify=()=>Math.abs(dObj-fl)<.04?'inf':(1/(1/fl-1/dObj))>0?'real':'virtual';
  const solve=()=>{di=Math.abs(dObj-fl)<1e-3?Infinity:1/(1/fl-1/dObj);hi=-p.ho*di/dObj;const r=classify();if(r!==regime){if(regime!==null)ev(r==='inf'?'object at the focal point: rays leave parallel, image at infinity':r==='real'?'object beyond F: real, inverted image on the far side':'object inside F (or diverging lens): virtual, upright image',V3(-dObj,Y,0),{color:0x88c0ff,sound:'glass'});regime=r}};
  LNS.ph=()=>ph.position.clone();LNS.obj=()=>V3(-dObj,Y+p.ho,0);LNS.img=()=>isFinite(di)?V3(di,Y+hi,0):V3(6,Y,0);LNS.Y=Y;
  D.label('object (candle)',at(v=>v.set(-dObj,Y+p.ho+.35,0)),CN);D.label('image',at(v=>isFinite(di)&&Math.abs(di)<7?v.set(di,Y+hi+(hi<0?-.35:.35),0):null),IM);D.label(fl>0?'converging lens':'diverging lens',at(v=>v.set(0,Y+1.75,0)),LG);D.label('screen',at(v=>SCR.visible?v.set(di,Y+1.35,-.6):null),SCR);D.label('light ray (photon)',at(v=>v.copy(ph.position).setY(ph.position.y+.22)),PH);
  D.label('F',at(v=>v.set(-fl,RB+.45,.32)),true);D.label('F′',at(v=>v.set(fl,RB+.45,.32)),true);
  D.seriesName='image distance dᵢ';solve();ev('1/f = 1/d_o + 1/d_i  with f = '+fx(fl,2),V3(0,Y,0),{sound:'glass'});
  return{orbit,
   step(h){if(p.sweep>.5){dObj=3.4+2.9*Math.sin(D.t*.35);solve()}
    ut+=h/2.2;if(ut>=1){ut-=1;const r=classify();if(!arrived||(isFinite(di)&&Math.abs(di-lastDi)>Math.max(.05,Math.abs(lastDi)*.05))){arrived=true;lastDi=di;
      if(r==='real')ev('light from the flame tip converges at the image: dᵢ = '+fx(di,2)+', m = '+fx(-di/dObj,2)+' (1/f = '+fx(1/fl,3)+' = 1/'+fx(dObj,2)+' + 1/'+fx(di,2)+')',img.set(di,Y+hi,0),{sound:'glass',color:0x88c0ff});
      else if(r==='virtual')ev('rays from the flame tip spread after the lens: traced back they seem to come from a virtual image at dᵢ = '+fx(di,2)+' (m = '+fx(-di/dObj,2)+')',img.set(di,Y+hi,0),{sound:'glass',color:0x88c0ff});
      else ev('the rays leave the lens parallel: no image forms (dᵢ → ∞)',V3(3,Y,0),{sound:'glass'})}}},
   visual(dt){CN.position.x=-dObj;O.set(-dObj,Y+p.ho,0);const far=6.5;cand.fla.scale.y=flameH/.14*(1+Math.sin(D.t*19)*.06+Math.sin(D.t*7.7)*.04);
    const isImg=isFinite(di)&&Math.abs(di)<7;IM.visible=isImg;SCR.visible=isImg&&di>0;if(isImg){IM.position.set(di,Y,0);const m=-di/dObj;ig.g.scale.set(Math.abs(m),m,Math.abs(m));ig.g.position.y=0;IM.position.y=Y;ghostM.opacity=di>0?.32:.18;SCR.position.set(di,0,0);spot.position.set(di-.03,Y+hi,0);spot.scale.setScalar(.25+.15*Math.abs(m))}
    // cand.g is drawn from the axis: the group sits at y = Y
    cand.g.position.y=Y;
    P1.set(0,O.y,0);q1.set(far,O.y-p.ho*far/fl,0);setL(rays[0],[O,P1,q1]);
    d2.set(dObj,-p.ho,0).normalize();q2.copy(O).addScaledVector(d2,(far+dObj)/d2.x);setL(rays[1],[O,q2,q2]);
    P3.set(0,Y-p.ho*fl/(dObj-fl),0);tmp.set(far,P3.y,0);setL(rays[2],[O,P3,tmp]);
    if(isFinite(di)&&di<0){img.set(di,Y+hi,0);setL(backs[0],[P1,img]);setL(backs[1],[O,img]);setL(backs[2],[P3,img]);backs.forEach(b=>b.visible=true)}else backs.forEach(b=>b.visible=false);
    // the photon: from the flame tip to the lens, then along ray 1 to the image point (or 4 units on, for a virtual image)
    const L1=dObj,end=isFinite(di)&&di>0?Math.min(di,far):4,s=ut*(L1+end);if(s<L1)ph.position.set(-dObj+s,O.y,0);else{const u=s-L1;ph.position.set(u,O.y-p.ho*u/fl,0)}
    D.push(isFinite(di)?clamp(di,-20,20):20)},
   readouts(){return[['d_o',fx(dObj,2)],['d_i',isFinite(di)?fx(di,2):'∞'],['1/d_o + 1/d_i',isFinite(di)?fx(1/dObj+1/di,3):fx(1/dObj,3)],['1/f',fx(1/fl,3)],['m = −d_i/d_o',isFinite(di)?fx(-di/dObj,2):'∞'],['h_i',isFinite(hi)?fx(hi,2):'∞'],['image',regime==='inf'?'at infinity':regime]]}}}};
{const Y=()=>LNS.Y??2.2;
 DIO.lens.shots={'1/f = 1/d_o':SHOT(()=>[0,Y(),0],10.5),'converges at the image':SHOT(()=>[LNS.img().x/2,Y(),0],9),'seem to come from a virtual image':SHOT(()=>[LNS.img().x/2,Y(),0],8.5),'rays leave the lens parallel':SHOT(()=>[1,Y(),0],10),'focal point: rays leave parallel':SHOT(()=>[0,Y(),0],9),'real, inverted image':SHOT(()=>[1.5,Y(),0],9),'virtual, upright image':SHOT(()=>[-1,Y(),0],8.5)};
 DIO.lens.flows={'converges at the image':[{from:()=>LNS.obj().add(V3(0,.2,0)),to:()=>V3(-.1,LNS.obj().y+.2,0),label:'light leaves the flame tip'},{from:()=>V3(.3,LNS.obj().y-.4,0),to:()=>LNS.img(),label:'the lens bends every ray to one point'}],
  'seem to come from a virtual image':[{from:()=>V3(2.5,Y()+.9,0),to:()=>LNS.img().add(V3(.2,0,0)),label:'traced back, the rays meet here'}]};}


// ---------- authored documentary lessons for the built-in models ----------
// Each lesson answers one question and opens the next. Fields: title, question, text (the instruction), focus (an actor),
// set (variables), until:'event:<lowercase substring>' or run (seconds), explain (the cause, with the numbers this run
// produces), opens (the next question), optional shot ('wide'|'push'|'medium'|'close'|'pov') + pov (actor name).
// Every `until` below was checked by stepping the model headlessly (see the report): the event fires within `run`.
DIO.pendulum.lessons=[
 {title:'Time one swing',question:'How long does one swing take?',focus:'bob',set:{L:2,g:9.81,theta0:8,damping:0},until:'event:period measured',run:12,
  chain:[{a:'pivot',note:'holds the top fixed'},{a:'string · L',note:'keeps the bob on an arc'},{a:'bob · m',note:'gravity pulls it back down'}],chainPace:1.1,
  text:'Pull the bob only 8° aside and let it go. The pivot holds the string, and the string keeps the bob on its arc. Watch it swing there and back; the period is the time for one full there-and-back.',
  explain:'One full swing took 2.84 s. Near the bottom, the part of gravity that pulls the bob along its arc grows in step with how far it is from the bottom, just as a spring pulls harder the more it is stretched. That makes the period 2π√(L/g) = 2π√(2 m ÷ 9.81 m/s²) = 2.84 s, and it does not depend on how far you pulled it, as long as the swing is small.',
  opens:'Does a wide swing take longer?'},
 {title:'A wide swing',question:'Does a wide swing take longer?',focus:'bob',set:{theta0:8},run:16,cameraMode:'object',
  compare:{mode:'side',a:{label:'released at 8°',read:'T measured'},b:{set:{theta0:150},label:'released at 150°',read:'T measured'}},
  text:'Two copies of the same pendulum, side by side and seen through one camera: on the left released from 8°, on the right from 150°, almost upside down. Watch which one comes back first, and read the period measured under each.',
  explain:'The swing took 5.00 s, 1.76 times the small-swing 2.84 s. Far out on the arc, gravity\'s pull along the path grows more slowly than the distance (it goes like sin θ, not θ), so the bob is pulled back more gently and lingers near the top. The exact result 4√(L/g)·K(sin(θ₀/2)) = 5.00 s matches the measurement.',
  opens:'Where is the bob fastest, and where does it stop?'},
 {title:'Ride the bob',question:'Where is the bob fastest, and where does it stop?',focus:'bob',set:{theta0:40},shot:'pov',pov:'bob',cameraMode:'frame',until:'event:period measured',run:12,
  text:'Sit on the bob for a full swing from 40°. Feel it rush through the bottom and pause at each end.',
  explain:'At the bottom you passed at 3.03 m/s; at each end you stopped for an instant. All the height lost on the way down, L(1 − cos 40°) = 0.47 m, became speed: v = √(2·9.81·0.47) = 3.03 m/s. On the way up the same speed is turned back into height, so the bob stops at the same 40° on the other side. The 40° swing took 2.93 s, 3 % longer than a small swing.',
  opens:'What does the length of the string do?'},
 {title:'A shorter string',question:'What does the length of the string do?',focus:'string',set:{L:.5,theta0:8},until:'event:period measured',run:12,isolate:true,
  text:'Cut the string to a quarter, 0.5 m, and time one small swing again.',
  explain:'The period fell from 2.84 s to 1.42 s: a quarter of the length, half the time. The period goes as √L: a shorter pendulum has less arc to cover and is pulled back more steeply, so it swings faster. Gravity does the opposite: a stronger g also shortens the period, as √(1/g).',
  opens:'Where does the energy go when the swing dies away?'},
 {title:'Friction in the pivot',question:'Where does the energy go when the swing dies away?',focus:'bob',set:{L:2,theta0:40,damping:.3},until:'event:amplitude halved',run:20,
  chain:[{a:'pivot',note:'friction turns motion into heat'},{a:'bob · m',note:'each swing a little smaller'}],chainPace:1.4,
  text:'Add a little friction in the pivot (damping 0.3 per second) and watch how the swings of the bob shrink.',
  explain:'The swing shrank from 40° to 20° in about 4.6 s, close to the small-swing estimate 2 ln 2 / c = 4.62 s. Friction takes a fixed fraction of the motion each second, so the amplitude decays exponentially, e^(−ct/2). The energy is not lost: it becomes heat in the pivot. The period hardly changes, which is why a pendulum keeps good time even as it slows.',
  opens:'Explore: try a long string on the Moon (g = 1.62 m/s²).'}];

DIO.spring.lessons=[
 {title:'One bounce',question:'How long does one oscillation take?',focus:'mass',set:{k:12,m:1,c:0,x0:.7},until:'event:period measured',run:10,
  chain:[{a:'spring · k',note:'pulls back, F = −kx'},{a:'mass · m',note:'speeds up toward x = 0'},{a:'metre scale',note:'overshoots x = 0, then returns'}],chainPace:1.1,
  text:'The cart (the mass) is pulled 0.7 m from x = 0 on the metre scale and released. The stretched spring pulls it back: watch it pass through the middle and come back.',
  explain:'One oscillation took 1.81 s. The spring pulls back in proportion to the stretch (F = −kx), so a bigger stretch means a bigger pull and a faster return; the two effects cancel and every swing takes the same time, T = 2π√(m/k) = 2π√(1/12) = 1.81 s.',
  opens:'What does a heavier mass do?'},
 {title:'A heavier mass',question:'What does a heavier mass do?',focus:'mass',set:{m:4},until:'event:period measured',run:12,isolate:['mass · m','spring · k'],
  text:'Make the cart four times heavier, 4 kg, with the same spring.',
  explain:'The period doubled to 3.63 s. The same spring force now has four times the mass to accelerate, so the cart picks up speed four times more slowly; the period grows as √m, and √4 = 2.',
  opens:'And a stiffer spring?'},
 {title:'A stiffer spring',question:'And a stiffer spring?',focus:'spring',set:{m:1,k:48},until:'event:period measured',run:10,
  text:'Back to 1 kg, but with a spring four times as stiff, 48 N/m.',
  explain:'The period halved to 0.91 s. A stiffer spring pulls four times harder at the same stretch, so the cart turns around twice as fast: T goes as 1/√k.',
  opens:'Where is the energy at each moment?'},
 {title:'Where the energy is',question:'Where is the energy at each moment?',focus:'mass',set:{k:12,x0:.7},shot:'close',until:'event:passes equilibrium',run:8,
  text:'Look closely at the cart as it rushes through the middle of the track. Watch KE and PE in the readouts.',
  explain:'At the middle the spring is relaxed (PE = 0) and the cart has its full ½mv² = 2.94 J, moving at 2.42 m/s. At the ends it stops and all 2.94 J is stored in the spring as ½kx² = ½·12·0.7². The total stays 2.94 J: the energy only changes form.',
  opens:'What happens when there is friction?'},
 {title:'Damping',question:'What happens when there is friction?',focus:'mass',set:{c:.8},until:'event:amplitude halved',run:12,isolate:true,
  text:'Add damping, 0.8 kg/s, as if the cart rolled through oil.',
  explain:'The swing halved to 0.35 m after 1.73 s, exactly the prediction 2m ln 2 / c = 1.73 s. The damping force opposes the velocity, so it takes energy away on every pass and the swings shrink exponentially, while each one still takes about the same time.',
  opens:'Explore: what damping stops it without any overshoot? (critical damping c = 2√(km) ≈ 6.9 kg/s)'}];

DIO.projectile.lessons=[
 {title:'How far does it fly?',question:'How far does the ball fly?',focus:'ball',set:{v0:20,angle:45,g:9.81,drag:0},until:'event:lands',run:8,
  chain:[{a:'cannon',note:'launches it at 20 m/s'},{a:'ball',note:'falls while it flies forward'},{a:'flag',note:'the no-drag range R'}],chainPace:1.1,
  text:'Fire the cannon at 20 m/s and 45°. Watch the ball land next to the flag.',
  explain:'The ball landed 40.75 m away after 2.88 s, matching R = v₀² sin 2θ / g = 400 × 1 / 9.81 = 40.77 m. Gravity only slows the climb and then speeds the fall; the forward speed v₀ cos θ = 14.1 m/s carries the ball sideways the whole time, so range = forward speed × flight time.',
  opens:'Does the ball stop at the top?'},
 {title:'Ride the ball',question:'Does the ball stop at the top?',focus:'ball',set:{angle:45},shot:'pov',pov:'ball',until:'event:apex',run:6,
  text:'Ride along on the cannon ball and look ahead as it reaches the top of its arc.',
  explain:'At the top (10.18 m, after 1.44 s) the ball stopped climbing but kept moving forward at 14.14 m/s. Only the vertical speed is changed by gravity; nothing pushes it sideways, so the sideways speed never changes. The top is where vertical speed passes through zero.',
  opens:'Which angle flies farthest?'},
 {title:'A lower angle',question:'Which angle flies farthest?',focus:'ball',set:{angle:30},until:'event:lands',run:8,
  text:'Fire again at 30°.',
  explain:'At 30° the ball landed at 35.3 m, shorter than at 45°. A low shot moves forward fast but falls back to the ground too soon; a high shot stays up long but moves forward slowly. Range ∝ sin 2θ is largest at 45°.',
  opens:'Is there another angle that lands at the same place?'},
 {title:'The twin angle',question:'Is there another angle that lands at the same place?',focus:'ball',set:{angle:60},until:'event:lands',run:8,
  text:'Fire at 60°, as far above 45° as 30° was below it.',
  explain:'At 60° the ball also landed at 35.3 m, but it flew higher and longer (3.53 s instead of 2.04 s). sin 2θ is the same for 30° and 60°, so complementary angles share a range: what one gains in flight time the other gains in forward speed.',
  opens:'What does the air do?'},
 {title:'Air drag',question:'What does the air do?',focus:'ball',set:{angle:45,drag:.3},until:'event:lands',run:8,isolate:['ball','no-drag parabola'],
  text:'Add air drag (0.3 per second) and fire at 45° again. Compare the path with the dashed no-drag parabola.',
  explain:'With drag the ball landed at 25.2 m instead of 40.8 m, and its path is no longer symmetric: it climbs along a parabola-like curve but comes down more steeply. Drag takes speed away all the time, most at the start when the ball is fastest, so it falls short; with drag the best angle is below 45°.',
  opens:'Explore: the same shot on the Moon (g = 1.62).'}];

DIO.orbit.lessons=[
 {title:'Why it does not fall in',question:'Why doesn\'t the planet fall into the star?',focus:'planet',set:{GM:12,r0:3,vfactor:.8},until:'event:perihelion',run:10,
  chain:[{a:'star · M',note:'pulls the planet inward'},{a:'planet · m',note:'its sideways speed carries it past'}],chainPace:1.4,
  text:'The planet starts sideways at 80 % of the speed a circular orbit would need. Watch it fall toward the star.',
  explain:'It fell inward, but its sideways motion carried it past the star: at the closest point (r = 1.41) it was moving at 3.40, more than twice its start speed 1.60. Gravity pulled it inward and sped it up; the speed swings it around, and the same gravity then slows it on the way out. It keeps missing the star, which is what an orbit is.',
  opens:'Does it sweep space evenly?'},
 {title:'Equal areas in equal times',question:'Does the planet sweep out space evenly?',focus:'equal-area wedges',set:{vfactor:.8},until:'event:one orbit complete',run:12,isolate:['equal-area wedges','planet · m','star · M'],
  text:'Each coloured wedge is swept in the same time, one twelfth of an orbit. Watch their shapes over a full orbit.',
  explain:'One orbit took 5.94 s, as Kepler\'s third law 2π√(a³/GM) predicts for a = 2.21. The wedges near the star are short and wide, the far ones long and thin, yet each has the same area, about 1.19. Gravity always points at the star, so it can never twist the planet around it: angular momentum L = r × v stays 4.80, and the area swept per second is L/2.',
  opens:'What does the planet see?'},
 {title:'Ride the planet',question:'What does the planet experience?',focus:'planet',set:{vfactor:.8},shot:'pov',pov:'planet',until:'event:aphelion',run:10,
  text:'Ride the planet from its far point, around the star, and back out.',
  explain:'The star swelled as you swung in to r = 1.41 at speed 3.40, then shrank as you climbed out to r = 3.00 at 1.60, the slowest point. Kinetic and potential energy trade places along the way, but the total ε = v²/2 − GM/r stays −2.72.',
  opens:'What launch speed gives a circle?'},
 {title:'A circular orbit',question:'What speed makes a circle?',focus:'planet',set:{vfactor:1},until:'event:one orbit complete',run:12,
  text:'Launch at exactly the circular speed √(GM/r₀) = 2.00.',
  explain:'The orbit closed after 9.42 s at constant distance 3.00: gravity GM/r² = 1.33 is exactly the pull needed to bend the path into a circle at this speed (v²/r = 4/3). Kepler\'s period for a = r₀ is 2π√(27/12) = 9.42 s.',
  opens:'How fast must it go to escape?'},
 {title:'Escape',question:'How fast must it go to escape?',focus:'planet',set:{vfactor:1.45},until:'event:left the diorama',run:20,
  text:'Launch at 1.45 times the circular speed, a little above √2 ≈ 1.41.',
  explain:'Now ε = v²/2 − GM/r is positive (+0.21): the planet has more kinetic energy than gravity can take back, so it never returns and leaves along an open curve (a hyperbola). Escape speed is √2 times the circular speed.',
  opens:'How big are real planets next to their star?'},
 {title:'Real planets, true size',question:'How big are real planets next to their star?',focus:'star',set:{vfactor:.8},run:4,cameraMode:'global',
  scaleTo:{unit:'km',hold:4,source:'mean radii, NASA Planetary Fact Sheet',items:[{name:'Sun',r:695700,color:'#ffcf6b',star:true},{name:'Mercury',r:2440,color:'#a39b91'},{name:'Venus',r:6052,color:'#e3c48f'},{name:'Earth',r:6371,color:'#5d8fd6'},{name:'Mars',r:3390,color:'#c4673e'},{name:'Jupiter',r:69911,color:'#d4b18a'},{name:'Saturn',r:58232,color:'#e2cf9a'},{name:'Uranus',r:25362,color:'#9fd6dc'},{name:'Neptune',r:24622,color:'#4f73c9'}],
   captions:{common:'The classroom picture: the Sun and the eight planets drawn the same size, side by side.',true:'Each radius to scale: the Sun is 109 Earths across, and Jupiter, the largest planet, is a tenth of the Sun.'}},
  text:'The diorama steps aside for a lineup of the real Solar System: first the textbook picture, every body drawn the same size; then each one resized to its true radius.',
  explain:'Our diorama draws star and planet at a convenient size; the real ratios are far more extreme. The Sun\'s radius is 695 700 km, 109 times the Earth\'s 6 371 km; even Jupiter (69 911 km) is only a tenth of the Sun. That is why the star in an orbit diagram can be treated as a fixed point holding almost all the mass (99.86 % of the Solar System). (Distances, not shown, are larger still: the Earth orbits 23 500 Earth radii from the Sun.)',
  explainBack:'Why does a planet keep missing the star instead of falling in, and why can the star be treated as fixed?',
  opens:'Explore: try vfactor 0.5 for a stretched orbit that dives close to the star.'}];

DIO.collision.lessons=[
 {title:'What survives a crash?',question:'What stays the same in a collision?',focus:'cart 1',set:{m1:2,m2:1,v1:3,v2:-1,e:1},until:'event:collision:',run:6,
  chain:[{a:'cart 1 · m₁',note:'pushes cart 2'},{a:'cart 2 · m₂',note:'pushes back just as hard'},{a:'centre of mass',note:'keeps its speed'}],chainOn:'event:collision: p',
  text:'Cart 1, a 2 kg glider moving at 3 m/s, meets cart 2, a 1 kg glider coming the other way at 1 m/s. The springs make the impact elastic. Keep an eye on the gold centre of mass.',
  explain:'After the impact cart 1 moves at 0.33 m/s and cart 2 at 4.33 m/s. The total momentum is 5.00 kg·m/s before and after, because the two carts push on each other with equal and opposite forces for the same time. With elastic springs the kinetic energy, 9.50 J, is also kept.',
  opens:'What if the masses are equal?'},
 {title:'Equal masses',question:'What happens when equal masses collide?',focus:'cart 2',set:{m1:1,m2:1,v1:3,v2:0,e:1},until:'event:collision:',run:6,isolate:['cart 1 · m₁','cart 2 · m₂'],
  text:'Two equal 1 kg gliders: one moving at 3 m/s, the other at rest.',
  explain:'Cart 1 stopped dead and cart 2 left at 3.00 m/s: equal masses in an elastic collision simply swap velocities. That is the only way to keep both the momentum (3 kg·m/s) and the kinetic energy (4.50 J) with equal masses.',
  opens:'Where does the energy go if they stick?'},
 {title:'A sticky collision',question:'Where does the energy go if they stick?',focus:'cart 1',set:{m1:2,m2:1,v1:3,v2:-1,e:0},until:'event:collision:',run:6,
  text:'Set the restitution to 0: the carts lock together on impact.',
  explain:'They moved off together at 1.67 m/s. Momentum is still 5.00 kg·m/s, but the kinetic energy fell from 9.50 J to 4.17 J: 5.33 J went into denting, heat and sound. Momentum is always conserved in a collision; kinetic energy only when nothing is deformed for good.',
  opens:'What does the centre of mass do during the crash?'},
 {title:'Ride the centre of mass',question:'What does the centre of mass do during the crash?',focus:'centre of mass',set:{m1:2,m2:1,v1:3,v2:-1,e:1},shot:'pov',pov:'centre of mass',until:'event:end stops',run:8,
  text:'Ride the gold marker, the centre of mass of the two carts, through the collision.',
  explain:'The centre of mass glided at a steady 1.67 m/s from start to finish, crash or no crash. The forces in the collision are internal: equal and opposite, they cancel for the pair as a whole. Seen from this moving point, the two carts come in, bounce, and leave with their speeds reversed.',
  opens:'Explore: a very heavy cart hitting a light one at rest.'}];

DIO.incline.lessons=[
 {title:'Why does it slide?',question:'Why does the block slide, and how fast?',focus:'block',set:{angle:30,mu:.2,m:2,g:9.81},until:'event:reaches the bottom',run:6,isolate:['block · m','angle gauge'],
  text:'The block is let go at the top of a 30° slope with friction 0.2. Watch the force arrows.',
  explain:'It reached the bottom after 2.19 s at 7.03 m/s. Along the slope, gravity pulls with mg sin θ = 9.81 N; friction holds back with μ mg cos θ = 3.40 N. The difference accelerates it at a = g(sin θ − μ cos θ) = 3.21 m/s², so v = √(2aL) = √(2·3.21·7.7) = 7.03 m/s.',
  opens:'Would a heavier block slide faster?'},
 {title:'A heavier block',question:'Would a heavier block slide faster?',focus:'block',set:{m:8},until:'event:reaches the bottom',run:6,
  text:'Make the block four times heavier, 8 kg.',
  explain:'Same time, 2.19 s, same speed, 7.03 m/s. Every force here is proportional to the mass: four times the weight pulls it down, but friction is also four times larger and there is four times as much to accelerate. The mass cancels, as Galileo argued.',
  opens:'What does the block feel on the way down?'},
 {title:'Ride the block',question:'What does the ride feel like?',focus:'block',set:{m:2},shot:'pov',pov:'block',until:'event:reaches the bottom',run:6,
  text:'Sit on the block for the slide.',
  explain:'You gained speed evenly, 3.21 m/s every second, the whole way down: a constant net force means a constant acceleration. The block dropped 3.85 m, releasing mgh = 75.5 J: 49.4 J became speed (½mv²) and 26.2 J became heat in the sliding surfaces.',
  opens:'Can friction hold it still?'},
 {title:'A rough surface',question:'Can friction hold it still?',focus:'block',set:{mu:.7},until:'event:still at rest',run:6,
  text:'Make the surface rough: friction coefficient 0.7.',
  explain:'The block stays put. Static friction is not a fixed force: it supplies just what is needed, here mg sin θ = 9.81 N, up to a limit μN = 11.89 N. As long as tan θ (0.577) is below μ (0.7), the limit is never reached.',
  opens:'And with no friction at all?'},
 {title:'No friction',question:'And with no friction at all?',focus:'block',set:{mu:0},until:'event:reaches the bottom',run:6,
  chain:[{a:'angle gauge',note:'θ = 30° sets the pull'},{a:'block · m',note:'speeds up 4.91 m/s every second'}],chainPace:1.4,
  text:'Make the slope perfectly slippery. Now only the slope, 30° on the angle gauge, sets how fast the block speeds up.',
  explain:'Now a = g sin θ = 4.91 m/s² and the block arrives after 1.77 s at 8.69 m/s. Without friction no energy is turned into heat: all of mgh becomes ½mv², so v = √(2gh) = √(2·9.81·3.85), the same as falling straight down through the height of the slope.',
  opens:'Explore: find the angle where a block with μ = 0.5 just starts to slide (tan θ = μ, 26.6°).'}];

DIO.wave.lessons=[
 {title:'What travels along the rope?',question:'What moves along the rope: the rope, or something else?',focus:'crest',set:{A:.6,lambda:5,f:.5,standing:0},until:'event:crest moved one wavelength',run:6,
  chain:[{a:'tracked bead',note:'only moves up and down'},{a:'rope',note:'each bead pulls the next'},{a:'crest',note:'the shape travels on'}],chainPace:1.2,
  text:'Watch the gold marker on a crest, and the red tracked bead on the rope, for one period.',
  explain:'In 2.00 s the crest moved 5.00 m along the rope, a speed of 2.50 m/s = fλ, but the red bead only went up and down. A wave carries a shape and energy, not the material: each bead pulls its neighbour, which follows a moment later.',
  opens:'What does a bead actually do?'},
 {title:'Ride a bead',question:'What does a single bead do?',focus:'tracked bead',set:{f:.5},shot:'pov',pov:'tracked bead',until:'event:period 2 complete',run:6,
  text:'Ride the red bead for two periods and watch the crests come at you.',
  explain:'You moved straight up and down, 0.6 m each way, once every 2.00 s, while crests rushed past along the rope at 2.50 m/s. Every bead does the same motion, each a little later than the one before: that delay along the rope is the wave.',
  opens:'What changes if the rope is shaken faster?'},
 {title:'Shake faster',question:'What changes if it is shaken faster?',focus:'crest',set:{f:1},until:'event:crest moved one wavelength',run:6,
  text:'Double the frequency to 1 Hz, keeping the wavelength at 5 m.',
  explain:'The crest now covers 5.00 m in 1.00 s: v = fλ = 5.00 m/s. Here we held λ fixed, so the speed doubled. On a real rope the speed is set by its tension and weight per metre, so shaking faster would instead squeeze the crests closer (λ = v/f).',
  opens:'What happens when waves reflect from both ends?'},
 {title:'A standing wave',question:'What happens when waves reflect from both ends?',focus:'node',set:{f:.5,standing:1},until:'event:standing wave:',run:6,isolate:['tracked bead','node (never moves)','rope'],
  text:'Fix both ends: the wave reflects back and forth and the two directions add up. Compare the tracked bead with a node.',
  explain:'The pattern stopped travelling. At the nodes (blue rings, every 2.5 m) the two waves always cancel, so those points never move; halfway between, at the antinodes, they add up to swing ±1.20 m. Only wavelengths that fit the rope, λ = 2L/n, can make a steady pattern: here n = 4.',
  opens:'Explore: set the wavelength to 6.67 m (n = 3) and count the loops.'}];

// 1 world unit ≈ 3.4 nm: the box holds 70 molecules in about 76 units³, so they sit about 1 unit apart, the spacing of the
// molecules in air at room conditions (n ≈ 2.5 × 10²⁵ m⁻³, n^(−1/3) ≈ 3.4 nm). The drawn molecules (r = 0.09) are about twice
// real size; the burner, piston and gauge are symbols, not to scale. Used only for the scale bar of the zoom (S4).
DIO.gas.scale={m:3.4e-9};
DIO.gas.levels=[{name:'Room'},{name:'Vessel',at:'glass vessel'},{name:'Molecule',at:'molecule · m'}];
DIO.gas.lessons=[
 {title:'Into the gas',question:'Where does a gas\'s pressure come from?',focus:'molecule',set:{N:70,T:1,V:1},until:'event:tracked molecule strikes',run:12,
  zoom:{to:'molecule · m',from:'wide',perDecade:3,anchor:'glass vessel',stations:[{at:'glass vessel',hold:1.5,level:'Vessel'}]},
  text:'Zoom from the glass vessel down to the gold molecule. Up close the gas is a crowd: every molecule flies at random, in a straight line until it hits another molecule or a wall.',
  explain:'The scale bar reads nanometres: these 70 molecules sit about 3.4 nm apart, the spacing of the molecules in the air of a room (about 2.5 × 10²⁵ per cubic metre), and they are drawn about twice their real size, so most of the box is empty space. In real air each one flies at about 500 m/s and changes direction at every collision. Every hit on a wall is a tiny push; the pressure is the sum of all of them.',
  opens:'What does one molecule do to the wall it hits?'},
 {title:'Ride a molecule',question:'What does one molecule do to the wall it hits?',focus:'molecule',shot:'pov',pov:'molecule',cameraMode:'frame',until:'event:tracked molecule strikes',run:10,
  text:'Ride the gold molecule, knocked about at random by the others, until it hits a wall.',
  explain:'When you hit the wall your sideways speed reversed, and the wall received a push of 2mvₓ. A gas is millions of molecules doing this; each push is tiny but they add up to a steady force on every square centimetre: the pressure.',
  opens:'Does the measured pressure match the gas law?'},
 {title:'The gas law',question:'Does the measured pressure match the ideal gas law?',focus:'pressure gauge',set:{V:1},until:'event:first pressure reading',run:6,isolate:['pressure gauge','glass vessel'],
  text:'The walls count every push for three seconds. Compare the measured pressure with N k T / V.',
  explain:'The walls measured a pressure within a few per cent of N k T / V ≈ 0.99 (70 molecules at T ≈ 1 in V = 76.3); the exact numbers differ from run to run because the molecules start at random. Kinetic theory says the pushes per second on the walls depend only on how many molecules there are per volume and on their mean kinetic energy, which is what temperature measures.',
  opens:'What does heating do?'},
 {title:'Heat it',question:'What does heating do to the pressure?',focus:'burner',set:{T:3},until:'event:new pressure reading',run:8,
  chain:[{a:'burner',note:'triples the temperature'},{a:'molecule · m',note:'every speed × √3'},{a:'piston',note:'struck harder, more often'},{a:'pressure gauge',note:'reads about 3 times higher'}],chainOn:'event:tracked molecule strikes the piston',
  text:'Turn up the burner: triple the temperature. Every molecule speeds up, strikes the piston harder and more often, and the pressure gauge climbs.',
  explain:'The pressure rose about three times, to near 2.7–3.0, again matching NkT/V. Heating multiplied every speed by √3 = 1.73, so each molecule hits the walls 1.73 times as often and 1.73 times as hard: 3 times the pressure.',
  opens:'What does squeezing do?'},
 {title:'Squeeze it',question:'What does halving the volume do?',focus:'piston',set:{T:1,V:.5},until:'event:first pressure reading',run:6,
  text:'Push the piston in to halve the volume, at the original temperature.',
  explain:'The pressure doubled, to about 2.0 (NkT/V ≈ 2.0). The molecules move as fast as before, but each now crosses a shorter box and returns to the walls twice as often. That is Boyle\'s law, PV = constant at fixed temperature.',
  opens:'Explore: watch the speed histogram follow the red Maxwell–Boltzmann curve as you change T.'}];

DIO.surface.lessons=[
 {title:'Which way does it roll?',question:'Where does a ball on a curved surface end up?',focus:'ball',set:{gravity:9.81,friction:.6},until:'event:at rest',run:40,
  text:'Let the ball go and follow the blue arrow: it points straight downhill, along −∇f.',
  explain:'The ball came to rest in a hollow at f = −1.00, after about 17 s. At every point gravity\'s pull along the surface points down the steepest slope, −∇f. Friction drained its energy until it could not climb out of the nearest hollow, where the slope is zero in every direction: a local minimum.',
  opens:'What does the ball see on the way?'},
 {title:'Ride the ball',question:'What path does the ball take?',focus:'ball',set:{friction:1.2},shot:'pov',pov:'ball',until:'event:at rest',run:40,
  text:'Ride the steel ball from its starting point into the valley.',
  explain:'It curved rather than heading straight for the bottom: at each moment it turns toward the local downhill direction, but its momentum carries it on. With more friction (1.2) it settled sooner, in the same hollow, f = −1.00.',
  opens:'What if there is no friction at all?'},
 {title:'No friction',question:'What if there is no friction?',focus:'ball',set:{friction:0},run:12,isolate:['ball'],
  text:'Remove the rolling friction and watch for 12 seconds.',
  explain:'The ball never stops. Without friction its energy (height plus speed) stays constant, so every time it rolls into a hollow it has exactly enough speed to climb out to the height it started from. Only a loss of energy lets something settle at a minimum, which is why gradient descent needs a way to shed momentum.',
  opens:'Explore: click anywhere on the surface to drop the ball there.'}];

DIO.doublependulum.lessons=[
 {title:'Can we predict it?',question:'Can a simple machine be unpredictable?',focus:'twin',set:{m1:2,m2:1,L1:1.5,L2:1.5,theta1:120,theta2:-10,g:9.81,eps:.001},until:'event:chaos',run:20,isolate:['twin (offset ε)','m₂ · lower bob'],
  text:'Two double pendulums are released together. The blue twin starts just 0.001 rad (0.06°) away from the gold one. Watch their paths.',
  explain:'For a few seconds they move as one. After 6.8 s they differ by more than 10° and soon follow completely different paths. The rules are exact and nothing is random, but each tiny difference is amplified: here the gap grows about e-fold every 1.3 s (λ ≈ 0.8 per second). That sensitivity to the starting state is chaos.',
  opens:'What is it like to ride the lower bob?'},
 {title:'Ride the lower bob',question:'What does the lower bob go through?',focus:'m₂',set:{theta1:120,theta2:-10},shot:'pov',pov:'m₂',until:'event:lower arm flips',run:12,
  text:'Sit on the lower bob as the upper arm whips it around.',
  explain:'After 3.3 s the upper arm flung you right over the top. The upper arm hands energy to the lower one and takes it back, irregularly; the total energy, 7.58 J, stays the same (its drift is below 0.00001 J), so the motion is wild but not lawless.',
  opens:'Is the double pendulum always chaotic?'},
 {title:'Small swings',question:'Is it always chaotic?',focus:'twin',set:{theta1:15,theta2:10},until:'event:still together',run:20,
  chain:[{a:'m₁ · upper bob',note:'swings gently'},{a:'m₂ · lower bob',note:'follows it, almost in step'}],chainPace:1.4,
  text:'Release both from small angles: the upper bob m₁ at 15°, the lower bob m₂ at 10°.',
  explain:'After 15 s the twins are still within 0.03° of each other. For small swings the double pendulum is a pair of coupled, nearly linear oscillators: the motion repeats regular patterns and small differences stay small. Chaos needs the large, nonlinear swings.',
  opens:'Is the chaos randomness?'},
 {title:'No offset',question:'Is the chaos randomness?',focus:'twin',set:{theta1:120,theta2:-10,eps:0},run:12,
  text:'Start the twins at exactly the same angles (offset 0) and watch for 12 seconds.',
  explain:'The twins move as one, forever. The motion is fully determined by the starting state: the same start always gives the same path. What chaos removes is not determinism but practical predictability: we can never know the start exactly enough.',
  opens:'Explore: heavier lower bob (m₂ = 5) or a longer lower arm.'}];

DIO.lever.lessons=[
 {title:'What is a lever made of?',question:'What is a lever made of, and which part does what?',focus:'beam',set:{m1:3,x1:-2.5,m2:2,x2:3.75,fulcrum:0,beam:1},run:3,cameraMode:'object',
  explode:{parts:['fulcrum','beam','mass 1','mass 2'],axis:'y',labels:true,hold:3.5,reassemble:true,caption:'Four parts: 1 the fulcrum, a stone wedge the beam turns on; 2 the oak beam, a rigid bar; 3 and 4 the two iron weights that load it. Each dashed line leads back to where the part sits.'},
  text:'Before anything moves, take the lever apart. The fulcrum, the beam and the two weights lift off along the vertical, each with its number, then drop back onto their seats.',
  explain:'A lever is a rigid beam that can only turn about one point, the fulcrum. Everything that happens next is about turning: each weight tries to turn the beam about the fulcrum, and how hard it turns depends on its weight and on how far from the fulcrum it sits.',
  opens:'Which way will the lever tip?'},
 {title:'Which way will it tip?',question:'Which way will the lever tip?',cameraMode:'mechanism',focus:'beam',set:{m1:3,x1:-2.5,m2:2,x2:3,fulcrum:0,beam:1},until:'event:strikes the ground',run:6,
  chain:[{a:'mass 1 · m₁',note:'moment 3 × 2.5 = 7.5'},{a:'beam',note:'turns toward the larger moment'},{a:'fulcrum',note:'both moments act about it'},{a:'mass 2 · m₂',note:'moment 2 × 3 = 6.0'}],chainPace:1.1,
  text:'Mass 1, 3 kg, sits 2.5 m left of the fulcrum; mass 2, 2 kg, sits 3 m to the right. The heavier weight is closer in. Let go and watch the beam.',
  explain:'The left side went down and hit the ground. What turns the beam is weight × distance (the moment): 3 kg × 2.5 m = 7.5 against 2 kg × 3 m = 6.0. The left moment is larger by 1.5 kg·m, 14.7 N·m, so the beam turns that way.',
  opens:'Where must the 2 kg go to balance?'},
 {title:'Balance it',question:'Where must the right weight go to balance?',focus:'mass 2',set:{x2:3.75},until:'event:still balanced',run:6,isolate:true,
  text:'Move the 2 kg weight out to 3.75 m.',
  explain:'The beam stays level: 2 kg × 3.75 m = 7.5, equal to 3 kg × 2.5 m. A lever balances when the moments on both sides are equal, m₁r₁ = m₂r₂. A small weight far out balances a large one close in.',
  opens:'Can a heavier weight balance closer in?'},
 {title:'Heavier, closer',question:'Can a heavier weight balance closer in?',focus:'mass 2',set:{m2:6,x2:1.25},until:'event:still balanced',run:6,
  text:'Put 6 kg at only 1.25 m from the fulcrum.',
  explain:'Balanced again: 6 × 1.25 = 7.5. Double the weight, half the distance. This is how a crowbar works the other way round: a small force far from the pivot lifts a large load close to it.',
  opens:'Can moving the pivot balance the original weights?'},
 {title:'Move the fulcrum',question:'Can moving the pivot balance the original weights?',focus:'fulcrum',set:{m2:2,x2:3,fulcrum:-.25},until:'event:still balanced',run:6,isolate:['fulcrum','beam'],
  text:'Put the 2 kg back at 3 m and slide the fulcrum 0.25 m toward the heavier weight.',
  explain:'Balanced: the arms are now 2.25 m and 3.25 m. 3 × 2.25 = 6.75 and 2 × 3.25 = 6.5, and the 1 kg beam, whose middle is now 0.25 m right of the pivot, adds 0.25: 6.5 + 0.25 = 6.75. A real beam\'s own weight counts as a weight at its centre.',
  explainBack:'Why does the lever balance now, although the two weights are unequal and the fulcrum is not in the middle?',
  opens:'Explore: make the beam heavy (5 kg) and find the new balance point.'}];

// the same convention as the gas: 120 molecules in a 6.4 × 4 × 4 cell sit about 0.95 units apart; as a gas near
// atmospheric pressure that spacing is about 3.4 nm, so 1 unit ≈ 3.6 nm (scale bar of the zoom only)
DIO.reaction.scale={m:3.6e-9};
DIO.reaction.lessons=[
 {title:'Why not every collision reacts',question:'Why don\'t all collisions make C?',focus:'reaction cell',set:{NA:60,NB:60,Ea:.8,Eb:2,T:1},until:'event:collision with ke',run:6,
  zoom:{to:'tracked molecule',from:'wide',perDecade:3,stations:[{at:'reaction cell',hold:1.5}]},
  text:'Zoom into the reaction cell, down to the tracked molecule in the gold halo. Red A and blue B molecules fly about at random and collide. Only some collisions join them into the A–B pair, C.',
  explain:'A pair reacts only if it hits hard enough: the energy of the collision must exceed the barrier Ea = 0.8. At T = 1 collision theory predicts that a fraction (1 + Ea/kT)e^(−Ea/kT) = 0.81 of encounters qualify; over a longer run this model measures about 0.75–0.79 (the fastest pairs react first, which slightly thins out the fast molecules). The scale bar treats the cell as a gas near atmospheric pressure: the molecules sit about 3.4 nm apart, as in air.',
  opens:'What happens to a single molecule?'},
 {title:'Ride a molecule',question:'What happens to a single molecule?',focus:'tracked molecule',set:{T:1},shot:'pov',pov:'tracked molecule',until:'event:the tracked molecule reacts',run:45,
  text:'Travel with the molecule inside the gold halo, knocked about at random, until it reacts.',
  explain:'You bounced off walls and grazed past B molecules until one collision was energetic enough to cross the barrier, and you bonded into C. Every molecule\'s history is random, but the fraction that react each second is steady: that fraction is the reaction rate.',
  opens:'Does the reaction ever stop?'},
 {title:'Dynamic equilibrium',question:'Does the reaction ever stop?',focus:'reaction cell',set:{T:1},until:'event:dynamic equilibrium',run:45,
  text:'Watch the number of C molecules (the sparkline) until it levels off.',
  explain:'C rose and then levelled off at about 30 to 35 of the 60 possible pairs (Q of roughly 3 to 6; small numbers make it noisy). The reaction never stopped: A + B kept forming C, and C kept falling apart (rate 1.5·e^(−Eb/kT) = 0.20 per second), but now both happen equally often. That balance of opposite processes is dynamic equilibrium.',
  opens:'What does heating do to the balance?'},
 {title:'Heat it up',question:'What does heating do to the balance?',focus:'reaction cell',set:{T:2.4},until:'event:dynamic equilibrium',run:45,
  text:'Raise the temperature to 2.4 and let the cell settle again.',
  explain:'Both reactions speed up, but at equilibrium there is less C (about 20 to 24 instead of 30 to 35, Q ≈ 1.2–1.9). The reverse reaction has the bigger barrier (2 against 0.8), and a higher temperature helps a big barrier the most: e^(−2/2.4) is 3.2 times e^(−2/1), while the forward fraction barely changes. So heat shifts the balance back toward A + B, as Le Chatelier\'s principle says.',
  opens:'What does a catalyst-like lower barrier do?'},
 {title:'Lower the barrier',question:'What does a lower barrier change?',focus:'reaction cell',set:{T:1,Ea:.2},until:'event:dynamic equilibrium',run:45,
  text:'Lower the forward barrier to 0.2.',
  explain:'Now 98 % of encounters can react, so C forms faster and the balance moves further toward C (about 34 C, Q ≈ 5). Note what a real catalyst does differently: it lowers both barriers by the same amount, so it speeds up reaching equilibrium without moving it.',
  opens:'Explore: change NA and NB and see whether Q stays about the same.'}];

DIO.efield.lessons=[
 {title:'Which way does it go?',question:'Which way is the test charge pushed?',focus:'test charge',set:{q1:3,q2:-3,d:3.5,qt:1,m:1,drag:0},until:'event:escapes',run:8,
  chain:[{a:'field lines',note:'E points away from +'},{a:'test charge',note:'F = qE pushes it'}],chainPace:1.4,
  text:'A small positive test charge is let go from rest beside the positive charge q₁. The field lines show which way it is pushed.',
  explain:'It shot away from q₁ and left the diorama at 3.85. Like charges repel: the force F = qE points along the field, away from + charges and toward − ones. Its starting potential energy qV turned into kinetic energy, ½mv² + qV staying 7.15 the whole way.',
  opens:'What if the test charge is negative?'},
 {title:'Opposite charges',question:'What does a negative test charge do?',focus:'test charge',set:{qt:-1},until:'event:captured',run:6,
  text:'Flip the sign of the test charge.',
  explain:'It was pulled straight onto q₁ in 0.2 s. For a negative charge the force points against the field: toward + charges. Field lines show the push on a positive charge; a negative one feels the opposite.',
  opens:'Does a charge move along the field lines?'},
 {title:'Ride a field line',question:'Does a charge travel along the field lines?',focus:'test charge',set:{qt:1,drag:4},shot:'pov',pov:'test charge',until:'event:captured',run:10,
  text:'Put the test charge in oil (drag 4 per second) and ride it from q₁.',
  explain:'Now it crept along a curving field line from q₁ round to q₂ and was captured after 4.3 s. In oil the drag cancels most of its inertia, so its velocity simply follows the force, and the force follows the field line. Without drag (the first step) inertia carried it off the lines: field lines show the direction of the force, not the path.',
  opens:'What do two like charges do to the field?'},
 {title:'Like charges',question:'What does the field of two like charges look like?',focus:'field lines',set:{q2:3,drag:0},until:'event:escapes',run:8,isolate:['field lines','test charge'],
  text:'Make both charges positive.',
  explain:'No line now joins the two charges: every line runs outward, and between them the lines bend away from each other, leaving a point where the fields cancel. The test charge is repelled by both and escapes at speed 4.3.',
  opens:'Explore: move the charges apart (separation 6) and watch the lines.'}];

// a ride along the wire with the discharge current: from the capacitor's + plate along the near wire, through the
// resistor, along the far wire and through the bypass branch beside the battery (switch open to the battery). The eye
// rides 1.2 above the board and 1.1 outside the loop (never inside a part), and looks at the wire a little ahead on the
// subject path ('look', the copper itself), so the wire and its drifting electrons stay framed with the parts beyond
DIO.circuit.tracks={discharge:{label:'the discharge current along the wire',dur:13,lookAhead:.07,fov:55,
 points:[[-5.7,1.7,-.2],[-5.6,1.55,1.4],[-5.2,1.5,3.2],[-3.6,1.5,3.6],[0,1.5,3.6],[3.6,1.5,3.6],[5.2,1.5,3.2],[5.6,1.5,1.4],[5.6,1.5,-1.4],[5.2,1.5,-3.2],[3.6,1.5,-3.6],[2.4,1.5,-3.8],[1.4,1.5,-4.4],[0,1.5,-4.5],[-1.2,1.55,-4.4]],
 look:[[-4.5,.6,.2],[-4.5,.45,1.4],[-4.3,.45,2.4],[-3.0,.45,2.5],[0,.45,2.5],[3.0,.45,2.5],[4.3,.45,2.4],[4.5,.45,1.0],[4.5,.45,-1.0],[4.3,.45,-2.4],[3.0,.45,-2.5],[1.8,.45,-2.6],[1.5,.45,-3.2],[0,.45,-3.3],[-1.5,.45,-3.2]]}};
DIO.circuit.lessons=[
 {title:'What is in the loop?',question:'What does each part of the circuit do?',focus:'battery',set:{V:9,R:5,C:.6,closed:1},run:4,cameraMode:'global',
  inspect:{parts:[{a:'battery · ε',note:'Battery: pushes charge round the loop with an emf of 9 V.'},{a:'switch',note:'Switch: closes the loop through the battery, or bypasses it.'},{a:'resistor · R',note:'Resistor: 5 kΩ that limits how much current can flow.'},{a:'capacitor · C',note:'Capacitor: two metal plates with an insulating gap; charge piles up on them.'},{a:'voltmeter (across C)',note:'Voltmeter: reads the voltage across the capacitor.'}]},
  text:'The camera visits each part of the circuit in turn, then returns to the whole loop. Note what each one does before anything is explained.',
  explain:'Five parts, one loop: the battery pushes, the switch decides the path, the resistor limits the current, the capacitor stores the charge that arrives, and the voltmeter reads how full it is. The question is how fast it fills.',
  opens:'How fast does a capacitor charge?'},
 {title:'How fast does it charge?',question:'How fast does a capacitor charge?',focus:'capacitor',set:{V:9,R:5,C:.6,closed:1},until:'event:t = τ',run:8,cameraMode:'mechanism',
  chain:[{a:'battery · ε',note:'ε = 9 V drives it'},{a:'switch',note:'closes the loop'},{a:'resistor · R',note:'limits the current'},{a:'capacitor · C',note:'charge piles up on its plates'},{a:'voltmeter',note:'reads V_C rising'}],chainPace:1,
  text:'Close the switch: the 9 V battery charges the capacitor through the 5 kΩ resistor. Watch the voltmeter.',
  explain:'After τ = RC = 5 kΩ × 0.6 mF = 3.00 s the capacitor was at 5.69 V, 63.2 % of 9 V. The current is driven by the difference between the battery and the capacitor (ε − V_C)/R; as the capacitor fills, the difference shrinks, so it fills ever more slowly: V_C = ε(1 − e^(−t/RC)).',
  opens:'Where does the charge actually go inside the capacitor?'},
 {title:'Inside the capacitor',question:'Where does the charge actually go inside the capacitor?',focus:'capacitor',run:6,cameraMode:'component',
  section:{on:['capacitor · C'],axis:'y',sweep:1.6,caption:'Cut open: two steel plates and the insulating sheet between them. No charge crosses the sheet.'},
  text:'Keep the switch closed. The camera moves in on the capacitor (the small overview in the corner keeps the whole loop) and cuts it open from the top: watch the two plates glow as charge piles up, red (+) on one, blue (−) on the other.',
  explain:'The charge never crosses the gap: electrons pile up on one plate and leave the other, so the plates carry +q and −q with q = C·V_C. At 5.69 V the 0.6 mF capacitor holds q = 0.6 mF × 5.69 V ≈ 3.4 mC. The more charge on the plates, the more they push back against the battery, which is why the current dies away.',
  opens:'How long until it is full, and what does an electron do meanwhile?'},
 {title:'Ride an electron',question:'How long until it is full, and what does an electron do meanwhile?',focus:'tracked electron',set:{R:2},shot:'pov',pov:'tracked electron',until:'event:t = 5τ',run:10,cameraMode:'frame',
  text:'With a 2 kΩ resistor (τ = 1.2 s), ride one electron around the wires.',
  explain:'You raced at first, slowed, and nearly stopped after 5τ = 6.0 s, when V_C reached 8.94 V, within 0.7 % of 9 V. Electrons drift opposite to the conventional current, and they never cross the gap between the plates: they pile up on one plate and leave the other, which is what charging is. (Real drift is about 0.1 mm/s; it is drawn far faster.)',
  opens:'What does a bigger resistor do?'},
 {title:'A bigger resistor',question:'What does a bigger resistor do?',focus:'resistor',set:{R:10},until:'event:t = τ',run:10,isolate:['resistor · R','capacitor · C','voltmeter'],
  text:'Use 10 kΩ instead.',
  explain:'Now τ = 10 kΩ × 0.6 mF = 6.00 s: the capacitor took twice as long to reach the same 63 %. The resistor limits the current, I = (ε − V_C)/R, so the same charge takes longer to arrive.',
  opens:'What happens when the battery is switched out?'},
 {title:'Discharge',question:'What happens when the battery is switched out?',focus:'capacitor',set:{closed:0},until:'event:t = τ',run:10,track:'discharge',cameraMode:'frame',
  text:'Flip the switch to the bypass wire. The charged capacitor is now the only source in the loop: ride along the wire with the discharge current, from the capacitor back through the resistor.',
  explain:'The capacitor drove the current back through the resistor, the other way round, and after one τ = 6.00 s its voltage had fallen 63.2 % of the way to zero. With nothing to oppose it, the plates\' charge flows back until they are equal: V_C = V₀ e^(−t/RC). The stored energy ½CV² becomes heat in the resistor.',
  explainBack:'Why does the capacitor charge quickly at first and ever more slowly later, and what sets the time scale?',
  opens:'Explore: change C and predict τ before you run it.'}];

DIO.lens.lessons=[
 {title:'Where does the image form?',question:'Where does the lens form an image of the flame?',focus:'converging lens',set:{f:2.5,do:4,ho:.8,sweep:0},until:'event:converges at the image',run:6,
  chain:[{a:'candle',note:'light leaves the flame tip'},{a:'light ray',note:'straight to the glass'},{a:'converging lens',note:'bends every ray inward'},{a:'image',note:'the rays meet again'},{a:'screen',note:'catches the inverted flame'}],chainPace:1,
  text:'The candle stands 4 units in front of a converging lens of focal length 2.5. Follow the three light rays from the tip of the flame to the image on the screen.',
  explain:'All three rays from the flame tip met again 6.67 units behind the lens, upside down and 1.67 times larger, where the screen catches a sharp, inverted flame. The lens bends each ray by an amount that grows with its distance from the centre, which sends every ray from one point to one point: 1/f = 1/d_o + 1/d_i, 0.400 = 0.250 + 0.150.',
  opens:'What path does one ray take?'},
 {title:'Follow a ray',question:'What path does a single ray of light take?',focus:'light ray',set:{do:4},shot:'pov',pov:'light ray',until:'event:converges at the image',run:6,
  text:'Ride the light that leaves the flame tip parallel to the axis.',
  explain:'You travelled straight to the lens, were bent at the glass, and went straight on through the focal point F′ to the image point at 6.67. Light only changes direction where it meets a new material; the curved glass makes that bend steeper near the rim.',
  opens:'What if the object is inside the focal length?'},
 {title:'Closer than F',question:'What if the object is inside the focal length?',focus:'image',set:{do:1.5},until:'event:seem to come from a virtual image',run:6,isolate:['image','converging lens','candle'],
  text:'Move the candle to 1.5 units, inside F.',
  explain:'The rays still spread after the lens, so they never meet: there is nothing for a screen to catch. Traced backward (dashed) they seem to come from an upright flame 3.75 units in front of the lens, 2.5 times larger: a virtual image. This is a magnifying glass.',
  opens:'What happens right at F?'},
 {title:'Sweep through F',question:'What happens as the object passes F?',focus:'object',set:{do:4,sweep:1},until:'event:rays leave parallel',run:14,
  text:'Let the candle slide back and forth along the bench. Watch the image as the candle passes the focal point.',
  explain:'As the candle approached F the image ran away to infinity, and at F the rays left the lens parallel. Beyond F the image is real and inverted; inside F it is virtual and upright. At exactly d_o = f the lens equation gives 1/d_i = 0.',
  opens:'What does a diverging lens do?'},
 {title:'A diverging lens',question:'What does a diverging lens do?',focus:'diverging lens',set:{f:-3,do:4,sweep:0},until:'event:seem to come from a virtual image',run:6,
  text:'Swap in a diverging lens, f = −3.',
  explain:'The rays spread out even more after the lens; traced back they meet 1.71 units in front of it, in a small upright virtual image (m = 0.43). A diverging lens always does this, wherever the object is: it is how glasses for short sight work.',
  opens:'Explore: try a stronger converging lens (f = 1.5) with the candle at 6.'}];
// the didactic plans of the built-in models (js/dio/plans.js): the comprehension check the explore panel offers at the end
for (const k in PLANS) if (DIO[k]) DIO[k].plan = PLANS[k];
