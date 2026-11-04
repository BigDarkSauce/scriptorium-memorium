// Flagship authored dioramas in the universal scene format (the same JSON any AI produces from the prompt pack).
// Each embodies an idea through bodies, events and processes; decor reacts to the simulation.

const trees = (pts, kind = 'tree') => pts.map(([x, z, h], i) => ({ id: kind + i, name: kind === 'pine' ? 'Pine' : 'Tree', role: 'decor', shape: { kind, h }, position: [x, .15, z] }));

export const WATER_CYCLE = {
  type: 'scene', title: 'The water cycle in a glass valley', technique: 'topdown',
  environment: { preset: 'landscape', time: 11, azimuth: -45 },
  bodies: [
    { id: 'ground', name: 'Valley floor', role: 'decor', shape: { kind: 'terrain', w: 13, d: 13, h: .2, seed: 3, low: '#4f6a35', high: '#74794a', flat: [[.9, 1.7, 1.95, 1.0, -.15]] }, position: [0, .02, 0] },
    { id: 'mountain', name: 'Ridge', label: 'Ridge', role: 'actor', describe: 'Wind forces the moist air up its slope; rising air expands and cools.', shape: { kind: 'mountain', r: 2.3, h: 1.25, seed: 5, snowline: 2, low: '#5b5348', high: '#8b8273' }, position: [.2, 0, -2.75] },
    { id: 'ridgeN', name: 'Ridge', role: 'decor', shape: { kind: 'mountain', r: 2.0, h: 1.0, seed: 11, snowline: 2, low: '#564f45', high: '#857d6f' }, position: [-1.9, 0, -2.9] },
    { id: 'ridgeS', name: 'Ridge', role: 'decor', shape: { kind: 'mountain', r: 1.7, h: .75, seed: 6, snowline: 2, low: '#5b5348', high: '#8b8273' }, position: [2.3, 0, -2.6] },
    { id: 'farhill1', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 2.4, h: .8, seed: 9, snowline: 2, low: '#4b4c43', high: '#6c6e62' }, position: [-4.6, 0, 1.4] },
    { id: 'farhill2', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 2.0, h: .7, seed: 4, snowline: 2, low: '#4b4c43', high: '#6c6e62' }, position: [-4.5, 0, -4.2] },
    { id: 'farhill3', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 1.6, h: .5, seed: 2, snowline: 2, low: '#4b4c43', high: '#6c6e62' }, position: [-3.0, 0, 4.4] },
    { id: 'lakebed', name: 'Lake bed', role: 'decor', shape: { kind: 'plane', w: 2.5, h: 2.9 }, material: { preset: 'soil', color: '#20383c' }, position: [.9, -.12, 1.7], rotation: [-90, 0, 0] },
    { id: 'lake', name: 'Lake', label: 'Lake · source of vapour', role: 'actor', describe: 'Sunshine warms the water and the air above it; molecules escape as vapour.', shape: { kind: 'water', w: 2.5, d: 2.9, waves: .02 }, material: { preset: 'water', color: '#1f6a80' }, position: [.9, .05, 1.7] },
    { id: 'vapour', name: 'Water vapour', label: 'Water vapour', role: 'actor', describe: 'An invisible gas in reality; drawn here as faint motes rising from the lake.', shape: { kind: 'particles', type: 'bubbles', count: 160, area: [2.2, 1.7, 2.6], size: .035 }, position: [.9, .05, 1.7] },
    { id: 'parcel', name: 'Air parcel', label: 'Air parcel · moist air from the lake', role: 'actor', describe: 'One rising bubble of lake air: you can ride it (POV).', shape: { kind: 'sphere', r: .07 }, material: { preset: 'cloud', color: '#eef6ff', emissive: '#4a6c86' }, position: [1.1, .1, 1.4] },
    { id: 'cloud', name: 'Cloud', label: 'Cloud · condensed droplets', role: 'actor', describe: 'Droplets condensed from the vapour; it greys as it fills with water.', shape: { kind: 'cloud', r: .9, puffs: 13 }, position: [.7, 2.2, 1.7], rotation: [0, 90, 0] },
    { id: 'cloud2', name: 'Cloud', role: 'decor', shape: { kind: 'cloud', r: .9, puffs: 13 }, position: [.7, 2.2, 3.5], rotation: [0, 90, 0] },
    { id: 'cloud3', name: 'Cloud', role: 'decor', shape: { kind: 'cloud', r: .9, puffs: 13 }, position: [.7, 2.2, -4.5], rotation: [0, 90, 0] },
    { id: 'windsock', name: 'Windsock', label: 'Wind · carries the cloud to the ridge', role: 'actor', describe: 'It blows from the lake towards the ridge; the sock lifts as the wind strengthens.', shape: { kind: 'group' }, position: [2.9, 0, .2] },
    { id: 'sockpole', name: 'Windsock pole', role: 'decor', parent: 'windsock', shape: { kind: 'cylinder', r: .016, h: 1.0 }, material: { preset: 'steel' }, position: [0, .5, 0] },
    { id: 'sockpivot', name: 'Windsock', role: 'decor', parent: 'windsock', shape: { kind: 'group' }, position: [0, .98, 0] },
    { id: 'sockcone', name: 'Windsock', role: 'decor', parent: 'sockpivot', shape: { kind: 'cone', r: .075, h: .48 }, material: { preset: 'fabric', color: '#d8642a' }, position: [0, .24, 0] },
    { id: 'rain', name: 'Rain', label: 'Rain', role: 'actor', describe: 'Falls once the cloud holds more water than its droplets can keep aloft.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'sun', name: 'Sun', label: 'Sun · the energy source', role: 'actor', describe: 'Its height through the day sets how strongly the lake is heated; the light and the shadows come from it.', shape: { kind: 'star', r: .34, color: '#ffe2b0', intensity: 2 }, position: [-4.2, 5, 3] },
    { id: 'house', name: 'Cottage', role: 'decor', shape: { kind: 'house', w: .9, d: .75, h: .6 }, position: [3.5, .1, 3.7], rotation: [0, 70, 0] },
    { id: 'rock1', name: 'Boulder', role: 'decor', shape: { kind: 'rock', r: .32, h: .3 }, position: [4.4, .05, -1.2] },
    { id: 'rock2', name: 'Boulder', role: 'decor', shape: { kind: 'rock', r: .22, h: .2 }, position: [2.6, .05, -.9] },
    ...trees([[5.0, -3.4, 1.5], [4.5, -4.5, 1.2], [4.7, 4.4, 1.4], [5.5, 3.0, 1.0], [2.6, -.2, .9], [-1.6, .6, .9], [2.1, 4.5, 1.1], [-.6, -5.0, .8]]),
    ...trees([[-1.0, -.9, 1.1], [1.8, -1.3, 1.0], [-1.4, -5.2, .9], [-.6, 3.1, 1.1], [3.6, -2.3, 1.3], [-3.0, -1.0, 1.0]], 'pine')
  ],
  tour: ['sun', 'lake', 'vapour', 'parcel', 'cloud', 'windsock', 'mountain', 'rain'],
  params: [
    { key: 'sun', label: 'sunshine (0 = overcast)', min: 0, max: 1.5, value: .9, unit: '' },
    { key: 'wind', label: 'wind speed', min: 0, max: 10, value: 4, unit: 'm/s' },
    { key: 'hour', label: 'time of day (sun held)', min: 6, max: 19.5, value: 11, unit: 'h' }],
  behaviors: [{ target: 'tree*', type: 'sway', amount: 'wind*0.3', speed: '1' }, { target: 'pine*', type: 'sway', amount: 'wind*0.2', speed: '0.8' }],
  shots: {
    'has warmed to': { target: [.9, .7, 1.7], dist: 7 },
    'has cooled to': { target: [.9, .9, 1.7], dist: 9 },
    'parcel reaches its dew point': { target: [.8, 1.4, 1.6], dist: 6 },
    'windward slope': { target: [.5, 2.8, -1.7], dist: 9 },
    'rain shadow': { target: [.4, 2.2, -4.2], dist: 9 },
    'falls back on the lake': { target: [.8, 1.6, 1.6], dist: 8 }
  },
  flows: {
    'vapour rises': [{ from: [.9, .15, 1.7], to: [.9, 1.5, 1.6], label: 'vapour leaves the warm surface' }],
    'dew point': [{ from: [1.25, .2, 1.4], to: [1.25, 1.55, 1.4], label: 'rising air cools 9.8 K per km' }],
    'windward slope': [{ from: [.7, 2.3, 1.5], to: [.7, 2.6, -.3], label: 'wind carries the moist air' }, { from: [.7, 2.4, -.6], to: [.7, 4.4, -2.3], label: 'forced up the slope, it cools' }],
    'rain shadow': [{ from: [.7, 4.6, -2.9], to: [.7, 2.5, -4.8], label: 'sinking air warms; the cloud evaporates' }],
    'falls back on the lake': [{ from: [.9, .1, 2.2], to: [.9, 1.6, 2.2], label: 'evaporation' }, { from: [.6, 1.6, 1.2], to: [.6, .2, 1.2], label: 'rain' }]
  },
  code: `const T=api.THREE, V=(x,y,z)=>new T.Vector3(x,y,z), f0=v=>String(Math.round(v)), f1=v=>(Math.round(v*10)/10).toFixed(1);
const lake=api.body('lake'), cloud=api.body('cloud'), rainB=api.body('rain'), vap=api.body('vapour'), sun=api.body('sun'), pivot=api.body('sockpivot'), parcel=api.body('parcel'), ground=api.body('ground'), ridge=api.body('mountain');
// ---- thermodynamics: °C, hPa, g of water per kg of air, metres ----
const es=t=>6.112*Math.exp(17.62*t/(243.12+t));                       // saturation vapour pressure over water (Magnus, WMO coefficients): +6–7 % per K
const qsat=(t,p)=>{const e=es(t);return 622*e/(p-0.378*e);};          // saturation specific humidity
const pAt=z=>1013.25*Math.exp(-z/8400);                                 // pressure at height z (scale height 8.4 km)
const dewOf=(q,p)=>{const e=q*p/(622+0.378*q),a=Math.log(e/6.112);return 243.12*a/(17.62-a);};
const gm=(t,p)=>{const K=t+273.15,r=qsat(t,p)/1000;return 1000*9.81*(1+2.501e6*r/(287*K))/(1005+2.501e6*2.501e6*r*0.622/(287*K*K));}; // moist-adiabatic lapse rate, K/km
const growth=t=>100*17.62*243.12/((243.12+t)*(243.12+t));               // d ln e_s / dT in % per K
// ---- layout: heights in the air are drawn at 1 unit = 250 m; the wind blows towards -z ----
const VS=250, PX=.7, HOME=1.7, LX=.9, LZ=1.7, AZ=-45;   // AZ: the landscape's sun azimuth offset (environment.azimuth)
api.world.updateMatrixWorld(true);
const ray=new T.Raycaster(), DOWN=V(0,-1,0), land=['ground','mountain','ridgeN','ridgeS','farhill1','farhill2','farhill3'].map(api.body).filter(Boolean);
const hAt=(x,z,objs)=>{ray.set(V(x,40,z),DOWN);const h=ray.intersectObjects(objs||land,true)[0];return h?h.point.y:0;};
api.bodies().forEach(o=>{const id=o.userData.bodyId||'';if(/^(tree|pine|house|windsock|rock)/.test(id)) o.position.y=hAt(o.position.x,o.position.z)-(/^rock/.test(id)?.08:.03);});  // decor stands on the ground
let lakeY;{const b=[];for(let i=0;i<=24;i++){const u=i/24-.5;b.push(hAt(LX+u*2.5,LZ-1.45,[ground]),hAt(LX+u*2.5,LZ+1.45,[ground]),hAt(LX-1.25,LZ+u*2.9,[ground]),hAt(LX+1.25,LZ+u*2.9,[ground]));}b.sort((a,c)=>a-c);lakeY=Math.max(hAt(LX,LZ,[ground])+.05,b[Math.floor(b.length*.12)]-.015);}
lake.position.y=lakeY; vap.position.y=lakeY; api.body('lakebed').position.y=hAt(LX,LZ,[ground])+.004;   // the shoreline is where the terrain rises through the water plane
// the air's path over the land: terrain height under the cloud, smoothed (air flows over, not through, the ridge)
const base0=hAt(PX,HOME,[ground]), raw=[];for(let i=0;i<=210;i++){const z=4-i*.05;raw.push(Math.max(0,hAt(PX,z)-base0));}
const lift=raw.map((_,i)=>{let s=0,n=0;for(let j=-14;j<=14;j++){const k=i+j;if(k<0||k>=raw.length)continue;const w=1-Math.abs(j)/15;s+=w*raw[k];n+=w;}return s/n;});
const liftU=z=>{const i=Math.max(0,Math.min(lift.length-1,Math.round((4-z)/.05)));return lift[i];};
let zCrest=HOME,top=0;lift.forEach((v,i)=>{if(v>top){top=v;zCrest=4-i*.05;}});
const heat=()=>api.param('sun')*Math.max(0,Math.sin((api.param('hour')-6)/12*Math.PI)), target=()=>10+14*heat();
let Ts=target(), q=12, E=0, Emm=0, zb=300, Tb=15, rainSlope=0, rainLake=0, Tset=target(), settled=true, quiet=true, warming=true;
// clouds: convection over the warm lake makes a new cloud whenever the last one has drifted away (two at most)
const meshes=[cloud,api.body('cloud2'),api.body('cloud3')], C=[null,null,null]; let since=99;
const newCloud=()=>({z:HOME,d:200,qt:q,qt0:q,zb:zb,Tb:Tb,Ts0:Ts,L:0,Tm:Tb,qc:0,raining:false,over:true,shadow:false,gone:0,rk:0,rained:0});
// the parcel: one bubble of lake air rising into the newest cloud, then riding it
let pp=V(LX+.35,lakeY+.05,LZ-.3), phase='rise', pc=0, poff=V(.15,0,.25);
function step(h){
  const u=api.param('wind'), Tt=target();
  if(Math.abs(Tt-Tset)>1.5){warming=Tt>Ts;Tset=Tt;settled=false;}
  Ts+=(Tt-Ts)*Math.min(1,h/4);
  const qs0=qsat(Ts,1013);
  E=.05*(1+.3*u)*(qs0-q);                          // Dalton: evaporation grows with the saturation deficit q_s(T) − q, faster in wind
  q+=(E-(.02+.004*u)*(q-6))*h; if(q>qs0) q=qs0;   // mixing with drier air; above saturation the excess condenses as dew or mist
  Emm=Math.max(0,.1348*Math.max(1,u)*(qs0-q));    // bulk formula ρ·C_E·U·(q_s − q) with C_E = 1.3e-3, in mm of water per day
  zb=Math.max(60,125*(Ts-dewOf(q,1013)));         // cloud base: lifting condensation level ≈ 125 m per K of dew-point spread (Espy)
  Tb=Ts-9.8*zb/1000;                               // a rising parcel cools at the dry adiabatic rate up to the base
  if(!quiet&&!settled&&Math.abs(Ts-Tt)<.25){ settled=true; api.event((warming?'The lake air has warmed to ':'The lake air has cooled to ')+f1(Ts)+' °C: e_s is now '+f1(es(Ts))+' hPa and evaporation '+f1(Emm)+' mm/day',V(LX,lakeY+.3,LZ),{id:'temp',sound:'tick'}); }
  since+=h; if(since>12&&!C.some(c=>c&&Math.abs(c.z-HOME)<1)){ const k=C.indexOf(null); if(k>=0){ C[k]=newCloud(); since=0; phase='rise'; pc=k; pp.set(LX+.35,lakeY+.05,LZ-.3); } }   // convection over the warm lake starts a new cloud once the last one has moved on
  C.forEach((c,k)=>{ if(!c) return;
    c.over=Math.abs(c.z-HOME)<1.6;
    if(c.over){ c.qt+=(q-c.qt)*Math.min(1,h*.8); c.qt0=c.qt; c.zb=zb; c.Tb=Tb; c.Ts0=Ts; c.d=Math.min(2400,c.d+h*16*heat()*q/12); } else c.d=Math.max(150,c.d-h*6);   // over the lake convection feeds and deepens it; once it leaves, it keeps its own air
    c.z-=u*.08*h; c.L=liftU(c.z)*VS;
    const zm=c.zb+c.d/2+c.L, Tg=c.Tb-gm(c.Tb,pAt(c.zb))*(zm-c.zb)/2000; c.Tm=c.Tb-gm(Tg,pAt((c.zb+zm)/2))*(zm-c.zb)/1000;   // above the base: the moist adiabat
    c.qc=Math.max(0,c.qt-qsat(c.Tm,pAt(zm)));        // condensed water at mid-cloud
    const was=c.raining; c.raining=c.qc>(was?.8:1);
    if(c.raining){ const r=.3*(c.qc-.8)*h; c.qt-=r; const mm=r*c.d/1000; c.rained+=mm; if(c.over) rainLake+=mm; else rainSlope+=mm; }
    if(!quiet&&c.raining&&!was){ if(c.over) api.event('Rain falls back on the lake: the cloud, '+f0(c.d)+' m deep, now holds '+f1(c.qc)+' g of droplets per kg of air',V(PX,lakeY+1.2,c.z),{id:'rainlake',sound:'pour'});
      else api.event('Rain on the windward slope: lifted '+f0(c.L)+' m, the cloud has cooled to '+f1(c.Tm)+' °C and holds '+f1(c.qc)+' g/kg of droplets',V(PX,base0+(c.zb+c.L)/VS,c.z),{id:'rain',sound:'pour'}); }
    const past=c.z<zCrest-.2;
    if(past&&c.qc<.02){ if(!c.shadow&&!quiet&&c.rained>0){ const fw=2.49*Math.max(0,c.qt0-c.qt); api.event('Rain shadow: sinking down the lee side, the air warms and the cloud evaporates; back at valley level it would be '+f1(c.Ts0+fw)+' °C, '+f1(fw)+' K warmer than when it set out',V(PX,base0+(c.zb+c.L)/VS,c.z),{id:'shadow',sound:'whoosh'}); } c.shadow=true; c.gone+=h; }
    if((past&&c.gone>1.5)||c.z<-5.3) C[k]=null;    // dissolved
  });
  // the parcel
  const c=C[pc];
  if(phase==='rise'){ pp.y+=h*(.25+.4*Math.min(1.5,heat())); pp.z-=h*u*.02; if(pp.y>=lakeY+zb/VS){ phase='ride'; poff.set(pp.x-PX,0,c?pp.z-c.z:0); if(!quiet) api.event('The parcel reaches its dew point at '+f0(zb)+' m: at '+f1(Tb)+' °C its vapour condenses into cloud droplets',pp.clone(),{id:'dew',sound:'chime'}); } }
  else if(c) pp.set(PX+poff.x*.5,base0+(c.zb+c.d*.3+c.L)/VS,c.z+poff.z*.5);   // it rides its cloud until the cloud dissolves
}
for(let i=0;i<60*120;i++) step(1/120); quiet=false;   // start from the steady state of the default sky
api.onStep(h=>step(h));
if(api.scene.fog){ api.scene.fog.near=13; api.scene.fog.far=40; }   // aerial perspective: the far hills sink into haze
// ---- painted backdrop: sky and two distant ranges, lighter and bluer with distance (BackSide cylinders: from outside only the far half draws) ----
const BR=6.75, skyG=new T.CylinderGeometry(BR,BR,6.4,96,10,true), sc=[], ca=new T.Color('#c9d3d6'), cb=new T.Color('#6f93b8'), cc=new T.Color();
for(let i=0;i<skyG.attributes.position.count;i++){ const y=skyG.attributes.position.getY(i)/6.4+.5; cc.copy(ca).lerp(cb,Math.pow(Math.max(0,(y-.18)/.82),.8)); sc.push(cc.r,cc.g,cc.b); }
skyG.setAttribute('color',new T.Float32BufferAttribute(sc,3));
const skyM=new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,fog:false}), sky=new T.Mesh(skyG,skyM); sky.position.y=2.95; sky.name='painted sky';
const range=(r,y0,hb,amp,f,seed,col,top)=>{ const n=192, pos=[], cols=[], idx=[], c0=new T.Color(col), c1=new T.Color(top);
  for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2, h=hb+amp*(.5+.5*api.noise.fbm(Math.cos(a)*f+seed,Math.sin(a)*f,seed,4)); pos.push(Math.sin(a)*r,y0,Math.cos(a)*r, Math.sin(a)*r,y0+h,Math.cos(a)*r); cols.push(c0.r,c0.g,c0.b, c1.r,c1.g,c1.b); if(i<n){ const k=i*2; idx.push(k,k+1,k+2, k+1,k+3,k+2); } }
  const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(pos,3)); g.setAttribute('color',new T.Float32BufferAttribute(cols,3)); g.setIndex(idx);
  const m=new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false})); m.name='painted range'; return m; };
const far=range(BR-.06,-.2,1.0,1.7,1.3,3,'#9fb0bb','#aebdc6'), near=range(BR-.14,-.2,.5,1.2,2.1,7,'#6e7d73','#7f8d80');
[sky,far,near].forEach(o=>{ o.userData.noInk=true; o.userData.noContact=true; o.castShadow=false; o.receiveShadow=false; o.raycast=()=>{}; api.world.add(o); });
const sunGlow=new T.Sprite(new T.SpriteMaterial({color:0xffd9a0,transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false,fog:false})); sunGlow.scale.setScalar(1.6); sunGlow.userData.noInk=true; api.world.add(sunGlow);
let lastHr=-1;
// ---- visuals ----
const white=new T.Color('#ffffff'), slate=new T.Color('#5e6670'), cms=meshes.map(m=>{const a=[];m&&m.traverse(o=>{if(o.isMesh)a.push(o);});return a;});
const vapPts=vap.children[0];
const NR=420, RD=[], rg=new T.BufferGeometry(); rg.setAttribute('position',new T.BufferAttribute(new Float32Array(NR*6),3));
const rl=new T.LineSegments(rg,new T.LineBasicMaterial({color:0xb8cfe0,transparent:true,opacity:.6,depthWrite:false})); rl.frustumCulled=false; rl.name='rain streaks'; rainB.add(rl);
for(let i=0;i<NR;i++) RD.push({x:0,y:-1,z:0,v:4.5+api.rand()*1.5,c:i%2});
let fr=0;
function sunDir(hr){ const el=Math.sin((hr-6)/12*Math.PI)*62, az=(hr-12)/12*140+AZ; return new T.Vector3().setFromSphericalCoords(1,(90-el)*Math.PI/180,az*Math.PI/180); }   // same sun path as the landscape light
api.onFrame((dt)=>{ dt=Math.min(dt,.1);
  meshes.forEach((m,k)=>{ const c=C[k]; if(!m) return; if(!c){ m.visible=false; m.position.set(PX,base0+2,HOME); return; } m.visible=true;
    const vis=Math.min(1,c.qc/.12+(c.over?.15:0)), sxz=.75+.22*Math.min(3,c.d/400), sy=Math.max(.35,Math.min(2.6,c.d/VS/.8));
    m.position.set(PX,base0+(c.zb+c.d/2+c.L)/VS,c.z); m.scale.set(sxz,sy,sxz);
    const kk=api.clamp(c.qc/2.2,0,1); cms[k].forEach(o=>{ o.material.color.copy(white).lerp(slate,kk*.85); o.material.transparent=true; o.material.opacity=.94*vis; o.visible=vis>.02; });
    c.rk+=((c.raining?Math.min(1,.35+(c.qc-.8)):0)-c.rk)*Math.min(1,dt*3); });
  parcel.position.copy(pp);
  // rain: streaks from each raining cloud's base to the ground under it
  const rk=Math.max(...C.map(c=>c?c.rk:0)); rl.visible=rk>.02; rl.material.opacity=.6*Math.min(1,rk+.2);
  { const c=C.filter(Boolean).sort((a,b)=>b.rk-a.rk)[0]; rainB.position.set(PX,0,c?c.z:HOME); rl.position.set(-PX,0,-(c?c.z:HOME)); if(!rl.visible) rg.boundingBox=new T.Box3(); }
  if(rl.visible){ const a=rg.attributes.position.array;
    for(let i=0;i<NR;i++){ const s=RD[i], c=C[s.c]; if(!c||c.rk<.02){ a[i*6+1]=a[i*6+4]=-5; continue; }
      const yTop=base0+(c.zb+c.L)/VS-.1; s.y-=dt*s.v; const g=base0+liftU(s.z);
      if(s.y<g||s.y>yTop||Math.abs(s.z-c.z)>1){ s.x=PX+(api.rand()-.5)*.9; s.z=c.z+(api.rand()-.5)*1.6; s.y=g+api.rand()*(yTop-g); }
      a[i*6]=s.x;a[i*6+1]=s.y+.16;a[i*6+2]=s.z+.02;a[i*6+3]=s.x;a[i*6+4]=s.y;a[i*6+5]=s.z; }
    rg.attributes.position.needsUpdate=true; if((fr++)%10===0) rg.computeBoundingBox(); }
  // vapour motes: rise from the lake to the cloud base, drift with the wind; fainter as evaporation falls
  if(vapPts&&vapPts.geometry){ const a=vapPts.geometry.attributes.position, top=zb/VS, w=api.param('wind');
    for(let i=0;i<a.count;i++){ let y=a.getY(i)+dt*(.12+.5*Math.min(1.5,heat())); let z=a.getZ(i)-dt*w*.03; if(y>top){y=0;z=(api.rand()-.5)*2.6;} if(z<-1.3) z+=2.6; a.setY(i,y); a.setZ(i,z); }
    a.needsUpdate=true; vapPts.material.opacity=.08+.5*Math.min(1,Emm/3); }
  const sd=sunDir(api.param('hour')).multiplyScalar(6.2); sun.position.set(sd.x,Math.max(.6,sd.y),sd.z); sunGlow.position.copy(sun.position);
  { const hr=api.param('hour'); if(hr!==lastHr){ lastHr=hr; const day=Math.max(0,Math.sin((hr-6)/12*Math.PI)), warm=1-Math.min(1,day*1.6); skyM.color.setRGB(.55+.45*day+.25*warm,.5+.5*day,.55+.45*day-.15*warm); } }
  const w=api.param('wind'), lift0=Math.PI/2*Math.min(1,w/7)*.95; pivot.rotation.set(Math.PI+lift0+Math.sin(api.time()*7)*.05*Math.min(1,w/3),0,0);
});

const atLake=()=>C.find(c=>c&&c.over), onRidge=()=>C.filter(c=>c&&!c.over).sort((a,b)=>b.L-a.L)[0];
api.readout('lake-air temperature',()=>f1(Ts)+' °C'); api.readout('saturation vapour pressure e_s',()=>f1(es(Ts))+' hPa');
api.readout('e_s growth per kelvin',()=>f1(growth(Ts))+' %/K'); api.readout('relative humidity',()=>f0(100*q/qsat(Ts,1013))+' %');
api.readout('dew point',()=>f1(dewOf(q,1013))+' °C'); api.readout('evaporation',()=>f1(Emm)+' mm/day'); api.readout('cloud base',()=>f0(zb)+' m');
api.readout('cloud water over the lake',()=>{const c=atLake();return c?f1(c.qc)+' g/kg (rain above 1.0)':'no cloud';});
api.readout('cloud over the ridge: lift',()=>{const c=onRidge();return c?f0(c.L)+' m, '+f1(c.Tm)+' °C':'—';});
api.readout('cloud water over the ridge',()=>{const c=onRidge();return c?f1(c.qc)+' g/kg (rain above 1.0)':'—';});
api.readout('rain on the slope',()=>f1(rainSlope)+' mm'); api.readout('rain on the lake',()=>f1(rainLake)+' mm');
api.readout('föhn warming in the lee',()=>{const c=onRidge();return c&&c.z<zCrest?f1(2.49*Math.max(0,c.qt0-c.qt))+' K (2.5 K per g/kg rained out)':'—';});
api.plot('cloud water (g/kg)',()=>{const c=C[0]||C[1];return c?c.qc:0;});
api.camera({target:[.3,1.55,-.3],r:13.5,ph:1.27,th:1.2});`,
  lessons: [
    { title: 'Heat the lake', question: 'What lifts water out of the lake?', text: 'Turn the sunshine up. Watch how the vapour rises faster from the lake, and watch three readouts: the lake-air temperature, the saturation vapour pressure e_s, and the evaporation rate.', set: { sun: 1.4 }, focus: 'lake', shot: 'push', until: 'event:has warmed to', run: 30, explain: 'Stronger sunshine warms the lake air from 22.2 to 28.7 °C. The saturation vapour pressure e_s rises from 26.6 to 39.2 hPa, about 6 % per kelvin: the Clausius–Clapeyron rate (Koutsoyiannis 2012). Evaporation is driven by the gap between e_s and the vapour already in the air, so it more than doubles, from 1.4 to 3.4 mm a day. Saturation is a property of water at a given temperature. It is not a capacity of the air.', opens: 'Where does the vapour go?' },
    { title: 'Ride a parcel of air', question: 'Where does the vapour go?', text: 'You are now inside one parcel of moist lake air as it rises. Look up: the cloud base is above you. Wait until the parcel reaches its dew point.', focus: 'parcel', shot: 'pov', pov: 'Air parcel', until: 'event:parcel reaches its dew point', run: 40, explain: 'Rising air expands and cools by 9.8 K per kilometre while it is unsaturated. Its dew point falls only about 1.8 K per kilometre, so the gap between them closes by about 8 K per kilometre. The parcel therefore saturates about 125 m higher for every kelvin of gap at the ground (Espy). Here the lake air is at 28.9 °C with a dew point of 25.4 °C, a gap of 3.5 K, so condensation starts near 436 m, at 24.7 °C. There the vapour condenses on tiny aerosol particles into cloud droplets.', opens: 'Why does the rain fall on the ridge and not on the lake?' },
    { title: 'Wind to the ridge', question: 'Why does the rain fall on the ridge and not on the lake?', text: 'Raise the wind. The cloud drifts from the lake to the ridge and climbs its windward slope. Watch the cloud water readouts and wait for rain.', set: { wind: 6 }, focus: 'cloud', shot: 'medium', until: 'event:windward slope', run: 35, explain: 'Over the lake the cloud held only about 0.2–0.3 g of droplets per kg of air, too little to rain. Forced 329 m up the slope, it cooled from about 24.1 to 22.7 °C, along the moist adiabat: about 4 K per km in warm, wet air, because condensing vapour releases latent heat. Each kelvin of cooling lowers e_s by about 6 %, so more vapour condenses. Once the droplets pass 1 g per kg, this model lets them grow into falling drops: orographic rain (Roe 2005).', opens: 'What happens to the air beyond the crest?' },
    { title: 'Over the crest', question: 'What happens to the air beyond the crest?', text: 'Follow the cloud over the crest of the ridge and down its far side, then wait for the rain shadow.', focus: 'cloud', shot: 'wide', until: 'event:rain shadow', run: 30, explain: 'Sinking air is compressed and warms. Once its droplets have evaporated it warms at the dry rate of 9.8 K per km, faster than it cooled on the way up while it was condensing. It also left water on the windward slope as rain. Brought back to valley level it is 30.6 °C, 1.7 K warmer than when it set out: each gram of water rained out per kg of air leaves 2.5 K of latent heat behind. The far valley gets dry, warm air: a rain shadow, and in strong cases a föhn wind.', opens: 'Can a cloud rain without a ridge?' },
    { title: 'Calm air', question: 'Can a cloud rain without a ridge?', text: 'Drop the wind almost to zero. The next cloud stays over the warm lake, keeps being fed by rising vapour, and grows deeper. Watch the cloud water over the lake and wait until rain falls back on the lake.', set: { wind: .3 }, focus: 'lake', shot: 'medium', until: 'event:falls back on the lake', run: 50, explain: 'Without wind, convection keeps feeding the same cloud, and it deepens to almost 1 km. Its upper part climbs further along the moist adiabat and holds more condensed water. Past 1 g per kg it rains back onto the lake, so the cycle closes locally. Across the planet the cycle does not close locally: each year about 40 000 km³ of water evaporated from the oceans is carried by the wind to fall on land, and rivers return it to the sea (Trenberth et al. 2007).', opens: 'What sets the pace of the whole cycle?' },
    { title: 'Evening', question: 'What sets the pace of the whole cycle?', text: 'Move the time of day to evening. With the sun low, watch the lake-air temperature, e_s and the evaporation rate fall.', set: { hour: 18.5 }, focus: 'sun', shot: 'wide', until: 'event:has cooled to', run: 45, explain: 'At 18:30 the sun gives almost no heat. The lake air cools to 10.2 °C, and e_s falls to 12.5 hPa, less than a third of its midday value. The air above the lake is now saturated, so evaporation stops and mist forms over the water. The sun powers the cycle: evaporating one kilogram of water takes about 2.45 MJ, and gravity brings the water back down.' }]
};

const people = (side, n, color, label) => Array.from({ length: n }, (_, i) => ({ id: side + i, name: label.replace(/s$/, '') + ' ' + (i + 1), label: i === 0 ? label : undefined, role: i === 0 ? 'actor' : 'decor', describe: i === 0 ? (side === 'b' ? 'Each buyer has a different willingness to pay; they step up to the stall when the price is below it.' : 'Each seller has a different cost; they step up to sell when the price is above it.') : '', shape: { kind: 'person', h: 1, color }, position: [(side === 'b' ? -1 : 1) * (1.4 + (i % 4) * .72), 0, .7 + Math.floor(i / 4) * .85], rotation: [0, side === 'b' ? 150 : -150, 0] }));
export const MARKET = {
  type: 'scene', title: 'A market finds its price', technique: 'card',
  environment: { preset: 'studio' },
  bodies: [
    { id: 'square', name: 'Market square', role: 'decor', shape: { kind: 'disc', r: 6.4 }, material: { preset: 'stone' }, position: [0, .01, 0] },
    { id: 'board', name: 'Chart board', label: 'Demand and supply curves', role: 'actor', describe: 'Blue: how many would buy at each price. Red: how many would sell. The gold line is the current price.', shape: { kind: 'box', w: 6.8, h: 4.9, d: .1, round: .02 }, material: { preset: 'chalk', color: '#1f2a24' }, position: [0, 3.0, -3.45] },
    { id: 'stall', name: 'Stall', label: 'The stall · where trades happen', role: 'actor', describe: 'Every buyer and seller who steps up here trades; the quantity traded is the smaller group.', shape: { kind: 'table', w: 2.6, d: 1, h: .9 }, position: [0, 0, -1.6] },
    { id: 'awning', name: 'Awning', role: 'decor', shape: { kind: 'box', w: 2.9, h: .07, d: 1.5, round: .01 }, material: { preset: 'fabric', color: '#b8392b' }, position: [0, 1.95, -1.6], rotation: [-8, 0, 0] },
    { id: 'post1', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [-1.35, .97, -1.0] },
    { id: 'post2', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [1.35, .97, -1.0] },
    { id: 'pole', name: 'Price pole', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 3.6 }, material: { preset: 'brass' }, position: [0, 1.8, 1.9] },
    { id: 'price', name: 'Price', label: 'Price', role: 'actor', describe: 'Rises while more want to buy than sell, falls while more want to sell than buy.', shape: { kind: 'coin', r: .26 }, position: [0, 1, 1.9], rotation: [90, 0, 0] },
    ...people('b', 8, '#4f8ad0', 'Buyers'), ...people('s', 8, '#d0553c', 'Sellers'),
    { id: 'lampL', name: 'Lamp', role: 'decor', shape: { kind: 'lamp', h: 1.8 }, position: [-4.6, 0, -2.4] },
    ...trees([[4.8, -2.2, 1.6], [-5.0, 1.8, 1.4], [5.2, 2.0, 1.3]])
  ],
  tour: ['price', 'b0', 's0', 'stall', 'board'],
  params: [
    { key: 'income', label: "buyers' income (shifts demand)", min: 0, max: 4, value: 0 },
    { key: 'cost', label: "sellers' cost (shifts supply)", min: 0, max: 4, value: 0 },
    { key: 'speed', label: 'price adjustment speed', min: .2, max: 2, value: .8 }],
  code: `const T=api.THREE, nb=8, buyers=[], sellers=[];
for(let i=0;i<nb;i++){ const b=api.body('b'+i), s=api.body('s'+i); buyers.push({o:b,z0:b.position.z}); sellers.push({o:s,z0:s.position.z}); }
const coin=api.body('price'); let p=1.5, last=0;
const sig=x=>1/(1+Math.exp(-x/0.25)), W=i=>api.param('income')+9-i, C=i=>api.param('cost')+1+i;
const Dm=q=>{let s=0; for(let i=0;i<nb;i++) s+=sig(W(i)-q); return s;}, Sp=q=>{let s=0; for(let i=0;i<nb;i++) s+=sig(q-C(i)); return s;};
const ox=-3.1, oy=0.75, sx=6.2/8.5, sy=4.2/12, z=-3.38;
const line=c=>{ const g=new T.BufferGeometry().setFromPoints(Array.from({length:61},()=>new T.Vector3())); const l=new T.Line(g,new T.LineBasicMaterial({color:c})); l.frustumCulled=false; api.world.add(l); return l; };
const dl=line(0x6fa8ff), sl=line(0xff7a5c), pl=line(0xffd27a), ax=line(0xd8d2c0);
{ const a=ax.geometry.attributes.position; for(let i=0;i<=60;i++){ const t=i/60; if(t<0.5) a.setXYZ(i,ox,oy+4.2*(1-t*2),z); else a.setXYZ(i,ox+6.2*(t-0.5)*2,oy,z); } a.needsUpdate=true; }
const dot=api.ball(0.1,api.material({preset:'emissive',color:'#ffd27a'})); api.world.add(dot);
api.onStep((h)=>{ const ex=Dm(p)-Sp(p); p=api.clamp(p+api.param('speed')*0.5*ex*h,0,12);
  const s=Math.abs(ex)<0.15?0:Math.sign(ex);
  if(s!==last){ if(s>0) api.event('Excess demand: buyers outbid each other, the price rises',coin.position.clone(),{id:'up'}); else if(s<0) api.event('Excess supply: sellers undercut each other, the price falls',coin.position.clone(),{id:'down'}); else api.event('Market clears: demand equals supply at p ≈ '+api.fmt(p)+', q ≈ '+api.fmt(Dm(p)),coin.position.clone(),{id:'clear'}); last=s; } });
api.onFrame((dt)=>{ coin.position.y=0.3+p*0.26; coin.rotation.z+=dt*1.5;
  buyers.forEach((b,i)=>{ b.o.position.z=b.z0+(-0.95-b.z0)*sig(W(i)-p)*0.7; });
  sellers.forEach((s,i)=>{ s.o.position.z=s.z0+(-0.95-s.z0)*sig(p-C(i))*0.7; });
  const dA=dl.geometry.attributes.position, sA=sl.geometry.attributes.position, pA=pl.geometry.attributes.position;
  for(let i=0;i<=60;i++){ const q=12*i/60; dA.setXYZ(i,ox+Dm(q)*sx,oy+q*sy,z); sA.setXYZ(i,ox+Sp(q)*sx,oy+q*sy,z); pA.setXYZ(i,ox+8.5*sx*i/60,oy+p*sy,z+0.005); }
  dA.needsUpdate=sA.needsUpdate=pA.needsUpdate=true; dot.position.set(ox+Math.min(Dm(p),Sp(p))*sx,oy+p*sy,z+0.03); });
api.readout('price p',()=>p); api.readout('quantity demanded',()=>Dm(p)); api.readout('quantity supplied',()=>Sp(p)); api.readout('excess demand',()=>Dm(p)-Sp(p)); api.readout('trades',()=>Math.min(Dm(p),Sp(p)));
api.plot('price',()=>p); api.camera({target:[0,1.4,0],r:13.5,ph:1.12,th:0.25});`,
  lessons: [
    { title: 'From a low price to the clearing price', text: 'The price starts low: many buyers step up, few sellers. Watch the price climb until the two groups at the stall match.', focus: 'price', until: 'event:clear', run: 30, explain: 'At the clearing price quantity demanded equals quantity supplied; any other price leaves a shortage or a surplus that pushes it back.' },
    { title: 'Buyers get richer', text: 'Raise income. Every buyer will now pay more: the blue curve shifts right, and the price climbs to a new, higher clearing point.', set: { income: 3 }, focus: 'board', until: 'event:clear', run: 30, explain: 'A rise in demand raises both the equilibrium price and the quantity traded.' },
    { title: 'Costs rise', text: 'Raise the sellers\' cost. The red curve shifts left: the price rises further but fewer units change hands.', set: { cost: 3 }, focus: 'board', until: 'event:clear', run: 30, explain: 'A fall in supply raises the price and lowers the quantity.' },
    { title: 'A nervous market', text: 'Make the price adjust quickly and watch it overshoot and settle.', set: { speed: 2, income: 0, cost: 0 }, focus: 'price', run: 12, explain: 'The equilibrium is the same; only the path to it changes.' }]
};

export const GALTON = {
  type: 'scene', title: 'Galton board: many coin flips make a bell', technique: 'sweep',
  environment: { preset: 'desk', lamp: [-5.8, 3.6] },
  bodies: [
    { id: 'back', name: 'Backboard', role: 'decor', shape: { kind: 'box', w: 6.6, h: 6.9, d: .14, round: .02 }, material: { preset: 'darkwood' }, position: [0, 3.72, -.12] },
    { id: 'railL', name: 'Side rail', role: 'decor', shape: { kind: 'box', w: .16, h: 6.9, d: .42, round: .02 }, material: { preset: 'wood' }, position: [-3.38, 3.72, .03] },
    { id: 'railR', name: 'Side rail', role: 'decor', shape: { kind: 'box', w: .16, h: 6.9, d: .42, round: .02 }, material: { preset: 'wood' }, position: [3.38, 3.72, .03] },
    { id: 'cap', name: 'Top rail', role: 'decor', shape: { kind: 'box', w: 6.92, h: .16, d: .42, round: .02 }, material: { preset: 'wood' }, position: [0, 7.2, .03] },
    { id: 'sill', name: 'Base rail', role: 'decor', shape: { kind: 'box', w: 6.92, h: .3, d: .5, round: .02 }, material: { preset: 'wood' }, position: [0, .4, .05] },
    { id: 'footL', name: 'Foot', role: 'decor', shape: { kind: 'box', w: .5, h: .26, d: 1.5, round: .03 }, material: { preset: 'darkwood' }, position: [-2.9, .13, .05] },
    { id: 'footR', name: 'Foot', role: 'decor', shape: { kind: 'box', w: .5, h: .26, d: 1.5, round: .03 }, material: { preset: 'darkwood' }, position: [2.9, .13, .05] },
    { id: 'glass', name: 'Front glass', role: 'decor', shape: { kind: 'box', w: 6.6, h: 6.6, d: .02, round: 0 }, material: { preset: 'glass' }, position: [0, 3.85, .22], castShadow: false },
    { id: 'funnel', name: 'Funnel', label: 'Funnel · releases the beads', role: 'actor', describe: 'Every bead starts in the same place, above the first peg.', shape: { kind: 'cone', r: .5, h: .62 }, material: { preset: 'brass' }, position: [0, 6.72, .05], rotation: [180, 0, 0] },
    { id: 'ball', name: 'Copper bead', label: 'Copper bead · one random path', role: 'actor', describe: 'Its bin is the number of times it bounced right. You can ride it (POV).', shape: { kind: 'sphere', r: .075 }, material: { preset: 'copper' }, position: [0, 6.4, .05] },
    { id: 'pegs', name: 'Pegs', label: 'Pegs · each one a coin flip', role: 'actor', describe: 'At every peg a bead goes right with probability p, left otherwise.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'bins', name: 'Bins', label: 'Bins · the histogram', role: 'actor', describe: 'Bin k collects the beads that bounced right k times.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'curve', name: 'Bell curve', label: 'Bell curve · binomial ≈ normal', role: 'actor', describe: 'Printed on the glass: the normal curve with mean Np and spread √(Np(1−p)), scaled to the beads landed.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'jar', name: 'Bead jar', role: 'decor', shape: { kind: 'beaker', r: .42, h: .8, fill: .45, liquid: '#c8ccd2' }, material: { preset: 'chrome' }, position: [4.6, 0, 1.6] },
    { id: 'notebook', name: 'Notebook', role: 'decor', shape: { kind: 'book', w: 1.3, h: 1.8, d: .14 }, material: { preset: 'leather', color: '#5a2a20' }, position: [4.2, .07, 3.4], rotation: [-90, 0, 24] }
  ],
  tour: ['funnel', 'ball', 'pegs', 'bins', 'curve'],
  params: [
    { key: 'rows', label: 'rows of pegs (N)', min: 4, max: 14, value: 10, rebuild: true },
    { key: 'p', label: 'probability of bouncing right (p)', min: .1, max: .9, value: .5 },
    { key: 'rate', label: 'beads per second', min: 1, max: 25, value: 8 }],
  shots: {
    'copper bead lands': { dist: 6 },
    '150 beads': { target: [0, 1.6, .1], dist: 9 },
    'bins are emptied': { target: [0, 1.4, .1], dist: 9 }
  },
  flows: {
    'one random path': [{ from: [0, 6.25, .3], to: [.25, 5.8, .3], label: 'right with probability p' }, { from: [0, 6.25, .3], to: [-.25, 5.8, .3], label: 'left with 1 − p' }],
    '150 beads': [{ from: [-2.4, 3.3, .3], to: [-.6, 2.0, .3], label: 'few paths reach the edges' }, { from: [0, 3.6, .3], to: [0, 2.3, .3], label: 'most paths end near N·p' }],
    'biased': [{ from: [0, 5.2, .3], to: [1.6, 2.6, .3], label: 'the pile drifts towards N·p' }]
  },
  code: `const T=api.THREE, N=Math.round(api.param('rows')), pegs=api.body('pegs'), bins=api.body('bins'), cg=api.body('curve'), lead=api.body('ball');
const top=6.2, dy=3.7/N, dx=Math.min(.5,6.0/(N+2)), Z=.05, binY=.56, maxH=1.95, R=Math.min(.06,(dx-.03)/6.3), ROW=.22;   // ROW: seconds per row of pegs
const f2=v=>v.toFixed(2), C=(n,k)=>{let c=1;for(let i=1;i<=k;i++)c=c*(n-k+i)/i;return c;}, pmf=(k,p)=>C(N,k)*Math.pow(p,k)*Math.pow(1-p,N-k);
// pegs: brass pins driven into the backboard
const pg=new T.CylinderGeometry(.038,.038,.3,12); pg.rotateX(Math.PI/2);
const pi=new T.InstancedMesh(pg,api.material({preset:'brass'}),N*(N+1)/2), m4=new T.Matrix4(); let n=0;
for(let r=0;r<N;r++) for(let k=0;k<=r;k++){ m4.makeTranslation((k-r/2)*dx,top-r*dy,Z); pi.setMatrixAt(n++,m4); }
pi.castShadow=true; pi.receiveShadow=true; pi.computeBoundingBox(); pi.name='pegs'; pegs.add(pi);
// bins: brass dividers standing on the base rail
const dv=new T.InstancedMesh(new T.BoxGeometry(.03,maxH,.34),api.material({preset:'brass'}),N+2);
for(let k=0;k<=N+1;k++){ m4.makeTranslation((k-.5-N/2)*dx,binY+maxH/2,Z); dv.setMatrixAt(k,m4); } dv.castShadow=true; dv.receiveShadow=true; dv.computeBoundingBox(); dv.name='bin dividers'; bins.add(dv);
// beads: the ones in the bins (stacked three abreast) and the ones falling
const per=Math.max(1,Math.floor((dx-.03)/(2*R*1.02))), rowsMax=Math.floor(maxH/(2*R*.9)), cap=per*rowsMax, beadG=new T.SphereGeometry(R,14,10), steel=api.material({preset:'chrome'});
const stack=new T.InstancedMesh(beadG,steel,(N+1)*cap); stack.castShadow=true; stack.receiveShadow=true; stack.count=0; stack.name='beads in the bins'; bins.add(stack);
const fallN=96, fall=new T.InstancedMesh(beadG,steel,fallN); fall.castShadow=true; fall.frustumCulled=false; fall.count=0; fall.name='falling beads'; api.world.add(fall);
const slot=(k,j)=>{ const row=Math.floor(j/per), col=j%per, off=(row%2)*R*.5; return [(k-N/2)*dx+(col-(per-1)/2)*2*R*1.02+off-(row%2?R*.25:0), binY+R+row*2*R*.9, Z]; };
let counts=new Array(N+1).fill(0), landed=0, said=false, lastP=api.param('p'), acc=0, leadCool=0;
const beads=[];
const CY=.038+R;   // a bead resting on a peg: its centre sits one peg radius plus one bead radius above the peg's centre
const newPath=()=>({row:-1,k:0,t:0,x0:0,x1:0,y0:top+.45,y1:top+CY});
function advance(b,h){ b.t+=h/ROW; if(b.t<1) return false; b.t=0; b.row++;
  if(b.row>=N) return true;   // it has dropped into its bin
  const right=api.rand()<api.param('p'); b.x0=b.x1; b.y0=b.y1; b.k+=right?1:0; b.x1=(b.k-(b.row+1)/2)*dx;
  b.y1=b.row+1<N?top-(b.row+1)*dy+CY:binY+R+Math.floor(Math.min(counts[b.k],cap-1)/per)*2*R*.9;   // onto the next peg, or onto the top of the bin's stack
  return false; }
const posOf=b=>{ const s=b.t, x=b.x0+(b.x1-b.x0)*s, y=b.y0+(b.y1-b.y0)*s+Math.sin(Math.PI*s)*dy*.35; return [x,y]; };
// the copper bead: always one of the falling beads, relaunched after it lands
let L=Object.assign(newPath(),{wait:0,landedAt:null});
const riding=()=>lead.children.some(o=>o.isMesh&&!o.visible);   // the engine hides a small actor while the learner rides it (POV)
function land(k){ counts[k]++; landed++;
  if(landed===150&&!said){ said=true; const m=mean(), sd=spread(); api.event('150 beads: the bins trace a bell. Mean bin '+f2(m)+' (theory N·p = '+f2(N*api.param('p'))+'), spread '+f2(sd)+' (theory √(Np(1−p)) = '+f2(Math.sqrt(N*api.param('p')*(1-api.param('p'))))+') at p = '+f2(api.param('p'))+', N = '+N,new T.Vector3(0,binY+.9,Z),{id:'bell',sound:'chime'}); } }
api.onStep((h)=>{
  if(Math.abs(api.param('p')-lastP)>.005){ lastP=api.param('p'); counts.fill(0); landed=0; said=false; api.event('The bins are emptied for a new run with p = '+f2(lastP),new T.Vector3(0,binY+.5,Z),{id:'reset',sound:'pour'}); }
  acc+=h*api.param('rate'); while(acc>=1){ acc-=1; if(beads.length<fallN) beads.push(newPath()); }
  for(let i=beads.length-1;i>=0;i--){ const b=beads[i]; if(advance(b,h)){ land(b.k); beads.splice(i,1); } }
  leadCool=Math.max(0,leadCool-h);
  if(L.wait>0){ L.wait-=h; if(L.wait<=0) L=Object.assign(newPath(),{wait:0,landedAt:null}); }
  else if(advance(L,h)){ land(L.k); L.wait=riding()?.8:1.6; L.landedAt=L.k;
    if(riding()||leadCool<=0){ leadCool=25; const r=L.k; api.event('The copper bead lands in bin '+r+': '+r+' bounces right, '+(N-r)+' left. '+Math.round(C(N,r))+' of the '+Math.pow(2,N)+' possible paths end there',new T.Vector3((r-N/2)*dx,binY+.5,Z),{id:'lead',sound:'clack'}); } }
});
// the bell curve, printed on the glass: a gold ribbon of the normal density, scaled to the beads landed
const NS=90, rib=new T.BufferGeometry(); rib.setAttribute('position',new T.BufferAttribute(new Float32Array((NS+1)*6),3)); const idx=[]; for(let i=0;i<NS;i++){ const a=i*2; idx.push(a,a+1,a+2,a+1,a+3,a+2); } rib.setIndex(idx);
const ribM=new T.Mesh(rib,new T.MeshBasicMaterial({color:0xffcf6a,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false})); ribM.frustumCulled=false; ribM.renderOrder=30; ribM.name='printed curve'; cg.add(ribM);
const perBead=2*R*.9/per;   // stack height per bead
api.onFrame(()=>{
  let j=0; for(let k=0;k<=N;k++){ const c=Math.min(counts[k],cap); for(let q=0;q<c;q++){ const s=slot(k,q); m4.makeTranslation(s[0],s[1],s[2]); stack.setMatrixAt(j++,m4); } } stack.count=j; stack.instanceMatrix.needsUpdate=true; if(j) stack.computeBoundingBox();
  let f=0; for(const b of beads){ if(b.row<0&&b.t<.01) continue; const [x,y]=posOf(b); m4.makeTranslation(x,y,Z); fall.setMatrixAt(f++,m4); } fall.count=f; fall.instanceMatrix.needsUpdate=true;
  if(L.wait>0){ const s=slot(L.landedAt,Math.min(counts[L.landedAt],cap)); lead.position.set(s[0],s[1]+.02,Z+.01); } else { const [x,y]=posOf(L); lead.position.set(x,y,Z+.01); }
  const p=api.param('p'), mu=N*p, sd=Math.sqrt(N*p*(1-p))||1e-3, a=rib.attributes.position;
  for(let i=0;i<=NS;i++){ const kk=-.5+(N+1)*i/NS, x=(kk-N/2)*dx, d=Math.exp(-((kk-mu)**2)/(2*sd*sd))/(sd*Math.sqrt(2*Math.PI)), y=binY+Math.min(maxH+.25,d*landed*perBead); a.setXYZ(i*2,x,y+.012,.205); a.setXYZ(i*2+1,x,y-.012,.205); }
  a.needsUpdate=true; rib.computeBoundingBox(); });
const mean=()=>{ let s=0; counts.forEach((c,k)=>s+=c*k); return landed?s/landed:NaN; };
const spread=()=>{ if(landed<2) return NaN; const m=mean(); let v=0; counts.forEach((c,k)=>v+=c*(k-m)**2); return Math.sqrt(v/(landed-1)); };
const mode=()=>Math.round(N*api.param('p'));
api.readout('beads landed',()=>String(landed));
api.readout('mean bin',()=>(landed?f2(mean()):'—')+' (theory N·p = '+f2(N*api.param('p'))+')');
api.readout('spread of the bins (sd)',()=>(landed>1?f2(spread()):'—')+' (theory √(Np(1−p)) = '+f2(Math.sqrt(N*api.param('p')*(1-api.param('p'))))+')');
api.readout('standard error of the mean',()=>landed?f2(Math.sqrt(N*api.param('p')*(1-api.param('p'))/landed)):'—');
api.readout('share in bin '+'N·p',()=>(landed?(100*counts[mode()]/landed).toFixed(1):'—')+' % (binomial '+(100*pmf(mode(),api.param('p'))).toFixed(1)+' %, normal '+(100/(Math.sqrt(2*Math.PI*N*api.param('p')*(1-api.param('p')))||1)).toFixed(1)+' %)');
api.plot('beads in the centre bin',()=>counts[mode()]);
api.camera({target:[.3,3.25,0],r:12.6,ph:1.47,th:.12});`,
  lessons: [
    { title: 'Ride one bead', question: 'Where will one bead land?', text: 'You ride the copper bead down the board. At every peg it bounces left or right, like a coin flip. Watch where it ends up.', focus: 'ball', shot: 'pov', pov: 'Copper bead', until: 'event:copper bead lands', run: 40, explain: 'Its path was a string of 10 independent left/right choices, so each particular path has probability (1/2)^10 = 1/1024. The bin number counts only the right-bounces, and many different paths share a bin: C(10,k) of them end in bin k. One path leads to bin 0, 10 to bin 1, and 252 to bin 5. Where one bead lands is unpredictable. Where most beads land is not.', opens: 'What shape do many beads make?' },
    { title: 'Let the beads fall', question: 'What shape do many beads make?', text: 'Let the beads fall and watch the bins fill until 150 beads have landed. Compare the mean bin and the spread with the theory readouts.', focus: 'bins', shot: 'push', until: 'event:150 beads', run: 50, explain: 'The count of right-bounces in N independent flips follows the binomial distribution: mean N·p = 5 bins, spread √(Np(1−p)) = 1.58 bins. After 150 beads the measured mean should sit within about 0.13 of 5 (the standard error 1.58/√150). The pile is already close to the gold normal curve: de Moivre–Laplace, the first central limit theorem (Le Cam 1986).', opens: 'What happens if the pegs favour one side?' },
    { title: 'Bias the pegs', question: 'What happens if the pegs favour one side?', text: 'Make right-bounces likelier (p = 0.75). The bins are emptied and refilled. Watch the pile build up to the right of centre until 150 beads have landed.', set: { p: .75 }, focus: 'bins', shot: 'medium', until: 'event:150 beads', run: 50, explain: 'With p = 0.75 the mean moves to N·p = 7.5 and the spread shrinks to √(10 × 0.75 × 0.25) = 1.37 bins. The pile is lopsided, with a longer tail towards the left: no bin above 10 exists to balance it. The normal curve fits less well when N·p(1−p) is small (here 1.9); a common rule of thumb asks for at least 5–10.', opens: 'What do more rows do?' },
    { title: 'More rows', question: 'What do more rows do?', text: 'Add rows (N = 14) and set p back to 0.5. The board rebuilds with narrower bins. Watch the new bell grow until 150 beads have landed.', set: { rows: 14, p: .5 }, focus: 'curve', shot: 'medium', until: 'event:150 beads', run: 60, explain: 'With 14 flips the mean is 7 and the spread √(14 × 0.25) = 1.87 bins: wider than with 10 rows. But relative to the 14-bin range it is narrower: 1.87/14 = 0.13 against 1.58/10 = 0.16. Sums of many independent nudges spread out like √N while their range grows like N, so the bell sharpens relative to the board. That is the central limit theorem at work.', opens: 'How good is the normal curve for the centre bin?' },
    { title: 'Read the centre bin', question: 'How good is the normal curve for the centre bin?', text: 'Look closely at the bins near the middle and read the share of beads in bin N·p, with the binomial and normal predictions next to it.', focus: 'bins', shot: 'close', run: 15, explain: 'For N = 14 the exact binomial share of the centre bin is C(14,7)/2^14 = 3432/16384 = 20.9 %. The normal curve gives 1/√(2π·N·p(1−p)) = 21.3 %. With only 150 beads the measured share wobbles by about 3 percentage points around them, and more beads shrink that wobble like 1/√n. The curve is an approximation that gets better as N grows (Galton 1889 built the board to show it).' }]
};

export const OSMOSIS = {
  type: 'scene', title: 'Osmosis across a semi-permeable membrane', technique: 'sweep',
  environment: { preset: 'micro', base: true },
  bodies: [
    { id: 'tank', name: 'Tank', role: 'decor', shape: { kind: 'glasscase', w: 6, d: 1.6, h: 3.4 }, position: [0, 0, 0] },
    { id: 'membrane', name: 'Membrane', label: 'Semi-permeable membrane', role: 'actor', describe: 'Pores let water molecules through but not the larger solute molecules.', shape: { kind: 'box', w: .05, h: 3.2, d: 1.55, round: 0 }, material: { preset: 'membrane', color: '#ffb0c8' }, position: [0, 1.6, 0] },
    { id: 'left', name: 'Left level', label: 'Pure water side · level', role: 'actor', describe: 'Water only.', shape: { kind: 'water', w: 2.95, d: 1.55, depth: 2.2 }, material: { preset: 'water', color: '#58b4d0' }, position: [-1.5, 1.3, 0] },
    { id: 'right', name: 'Right level', label: 'Solution side · level', role: 'actor', describe: 'Water plus solute.', shape: { kind: 'water', w: 2.95, d: 1.55, depth: 2.2 }, material: { preset: 'water', color: '#d0a050' }, position: [1.5, 1.3, 0] }],
  tour: ['membrane', 'left', 'right'],
  params: [
    { key: 'solute', label: 'solute molecules', min: 0, max: 90, value: 45, rebuild: true },
    { key: 'T', label: 'temperature', min: .3, max: 2, value: 1 },
    { key: 'pass', label: 'membrane permeability', min: .2, max: 1, value: .6 }],
  code: `const T=api.THREE, nW=200, nS=Math.round(api.param('solute')), rnd=api.rand;
const wm=new T.InstancedMesh(new T.SphereGeometry(0.05,10,8),api.material({preset:'plastic',color:'#4aa3ff'}),nW);
const sm=new T.InstancedMesh(new T.SphereGeometry(0.11,14,10),api.material({preset:'plastic',color:'#ff9a3c'}),Math.max(1,nS)); sm.visible=nS>0; api.world.add(wm,sm);
const L=api.body('left'), R=api.body('right'); const base=1.3; let hL=base, hR=base, phi=0, cLR=0, cRL=0, win=0, flowSaid=false, eqT=0, eqSaid=false, lastDh=0;
const P=[]; for(let i=0;i<nW;i++){ const l=i<nW/2; P.push({x:l?-0.1-rnd()*2.7:0.1+rnd()*2.7,y:0.15+rnd()*(base-0.3),z:(rnd()-0.5)*1.3,w:true}); }
for(let i=0;i<nS;i++) P.push({x:0.2+rnd()*2.6,y:0.2+rnd()*(base-0.4),z:(rnd()-0.5)*1.2,w:false});
P.forEach(q=>q.side=q.x<0?-1:1);
api.label('Water molecules',()=>{ const q=P.find(q=>q.w&&q.side<0); return q?new T.Vector3(q.x,q.y,q.z):null; },'Small enough to pass the pores.');
if(nS) api.label('Solute molecules',()=>{ const q=P.find(q=>!q.w); return q?new T.Vector3(q.x,q.y,q.z):null; },'Too large to pass; they stay on the right.');
api.onStep((h)=>{ const s=Math.sqrt(api.param('T'))*0.9, k=1.8, dh=hR-hL, pass=api.param('pass');
  for(const q of P){ q.x+=(rnd()-0.5)*s*h*14; q.y+=(rnd()-0.5)*s*h*14; q.z+=(rnd()-0.5)*s*h*14;
    const top=(q.side<0?hL:hR)-0.06; if(q.y<0.12)q.y=0.12; if(q.y>top)q.y=top; if(q.z<-0.66)q.z=-0.66; if(q.z>0.66)q.z=0.66; if(q.x<-2.88)q.x=-2.88; if(q.x>2.88)q.x=2.88;
    const side=q.x<0?-1:1;
    if(side!==q.side){ let ok=false; if(q.w) ok = q.side<0 ? rnd()<pass*Math.exp(-k*dh) : rnd()<pass*(1-phi)*Math.exp(k*dh);
      if(ok){ q.side=side; if(side>0) cLR++; else cRL++; } else q.x=q.side<0?-0.04:0.04; } } });
const m4=new T.Matrix4();
api.onFrame((dt)=>{ let nL=0,nRw=0; P.forEach(q=>{ if(q.w){ if(q.side<0) nL++; else nRw++; } }); phi=nS?Math.min(0.85,1.25*nS/(nS+nRw)):0;
  const tL=base+(nL-nW/2)*0.011, tR=base+(nRw-nW/2)*0.011; hL+=(tL-hL)*Math.min(1,dt*3); hR+=(tR-hR)*Math.min(1,dt*3);
  L.position.y=hL; R.position.y=hR; let iw=0,is=0;
  P.forEach(q=>{ m4.makeTranslation(q.x,q.y,q.z); if(q.w) wm.setMatrixAt(iw++,m4); else sm.setMatrixAt(is++,m4); }); wm.instanceMatrix.needsUpdate=true; sm.instanceMatrix.needsUpdate=true;
  win+=dt; if(win>2){ if(!flowSaid&&cLR-cRL>4){ flowSaid=true; api.event('Net water flow into the solution side',new T.Vector3(0,1.2,0),{id:'flow'}); } cLR=0; cRL=0; win=0; }
  const dh=hR-hL; if(Math.abs(dh-lastDh)<0.0015*Math.max(dt*60,1)) eqT+=dt; else eqT=0; lastDh=dh;
  if(!eqSaid&&eqT>4&&api.time()>6){ eqSaid=true; api.event('Osmotic equilibrium: the extra height Δh = '+api.fmt(dh)+' balances the solute\\'s pull',new T.Vector3(1.5,hR,0),{id:'eq'}); } });
api.readout('water left',()=>P.filter(q=>q.w&&q.side<0).length); api.readout('water right',()=>P.filter(q=>q.w&&q.side>0).length);
api.readout('solute fraction φ',()=>phi); api.readout('Δh (right − left)',()=>hR-hL);
api.plot('Δh',()=>hR-hL); api.camera({target:[0,1.5,0],r:9.5,ph:1.35,th:0.1});`,
  lessons: [
    { title: 'Watch the water move', text: 'Water molecules cross the pores in both directions; solute molecules bounce off the membrane on the right. Wait for the net-flow event.', focus: 'membrane', until: 'event:flow', run: 20, explain: 'Solute that cannot enter the pores lowers the water\'s chemical potential on its side, so the net flow runs into the solution. In real membranes this is mostly bulk flow through the pores, not water simply "diffusing down its own gradient" (Kramer & Myers 2013); the particle picture here shows the direction and the balance, not the molecular mechanism.' },
    { title: 'Equilibrium', text: 'The right level rises until its extra pressure pushes water back as fast as it arrives. Wait for equilibrium.', focus: 'right', until: 'event:eq', run: 40, explain: 'The height difference at equilibrium measures the osmotic pressure; it grows with solute concentration (van \'t Hoff: π ≈ cRT).' },
    { title: 'More solute', text: 'Double the solute. The tank refills from scratch and settles at a bigger height difference.', set: { solute: 90 }, focus: 'right', until: 'event:eq', run: 45, explain: 'Osmotic pressure rises with the number of dissolved particles.' },
    { title: 'Pure water both sides', text: 'Remove all solute: nothing drives a net flow and the levels stay equal.', set: { solute: 0 }, focus: 'left', run: 12, explain: 'Osmosis needs a concentration difference across a membrane that blocks the solute.' }]
};
import { REF } from './seeds-sources.js';
WATER_CYCLE.sources = [REF.trenberth, REF.oki, REF.koutsoyiannis, REF.roe];
GALTON.sources = [REF.galton, REF.lecam];
MARKET.sources = [REF.smith62, REF.gode];
OSMOSIS.sources = [REF.vanthoff, REF.kedem, REF.kramer, REF.agre];
export const FLAGSHIPS = [WATER_CYCLE, GALTON, MARKET, OSMOSIS];
