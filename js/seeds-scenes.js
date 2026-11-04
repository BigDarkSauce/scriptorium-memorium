// Flagship authored dioramas in the universal scene format (the same JSON any AI produces from the prompt pack).
// Each embodies an idea through bodies, events and processes; decor reacts to the simulation.

const trees = (pts, kind = 'tree') => pts.map(([x, z, h], i) => ({ id: kind + i, name: kind === 'pine' ? 'Pine' : 'Tree', role: 'decor', shape: { kind, h }, position: [x, .15, z] }));

export const WATER_CYCLE = {
  type: 'scene', title: 'The water cycle in a glass valley', technique: 'topdown',
  environment: { preset: 'landscape', glassCase: true, time: 11 },
  bodies: [
    { id: 'ground', name: 'Valley floor', role: 'decor', shape: { kind: 'terrain', w: 13, d: 13, h: .28, seed: 3, low: '#4d6a34', high: '#8c8662', flat: [[.9, 1.7, 1.75, 1.1, -.16]] }, position: [0, .02, 0] },
    { id: 'mountain', name: 'Ridge', label: 'Ridge', role: 'actor', describe: 'Wind forces the moist air up its slope; rising air expands and cools.', shape: { kind: 'mountain', r: 2.1, h: 2.6, seed: 5, snowline: 2, low: '#5b5247', high: '#8e8576' }, position: [.2, 0, -2.7] },
    { id: 'farhill1', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 2.0, h: 2.2, seed: 9, snowline: 2, low: '#4a463f', high: '#6f6a60' }, position: [-4.3, 0, 1.6] },
    { id: 'farhill2', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 1.7, h: 1.9, seed: 4, snowline: 2, low: '#4a463f', high: '#6f6a60' }, position: [-4.0, 0, -3.6] },
    { id: 'farhill3', name: 'Far hills', role: 'decor', shape: { kind: 'mountain', r: 1.3, h: 1.1, seed: 2, snowline: 2, low: '#4a463f', high: '#6f6a60' }, position: [-2.6, 0, 4.6] },
    { id: 'lake', name: 'Lake', label: 'Lake · source of vapour', role: 'actor', describe: 'Sunshine warms the water and the air above it; molecules escape as vapour.', shape: { kind: 'water', w: 2.6, d: 3.0, waves: .02 }, material: { preset: 'water', color: '#2f7f92' }, position: [.9, .05, 1.7] },
    { id: 'vapour', name: 'Water vapour', label: 'Water vapour', role: 'actor', describe: 'An invisible gas in reality; drawn here as faint motes rising from the lake.', shape: { kind: 'particles', type: 'bubbles', count: 160, area: [2.2, 1.7, 2.6], size: .035 }, position: [.9, .05, 1.7] },
    { id: 'parcel', name: 'Air parcel', label: 'Air parcel · moist air from the lake', role: 'actor', describe: 'One rising bubble of lake air: you can ride it (POV).', shape: { kind: 'sphere', r: .07 }, material: { preset: 'cloud', color: '#eef6ff', emissive: '#4a6c86' }, position: [1.1, .1, 1.4] },
    { id: 'cloud', name: 'Cloud', label: 'Cloud · condensed droplets', role: 'actor', describe: 'Droplets condensed from the vapour; it greys as it fills with water.', shape: { kind: 'cloud', r: 1.0, puffs: 9 }, position: [.7, 2.2, 1.7], rotation: [0, 90, 0] },
    { id: 'windsock', name: 'Windsock', label: 'Wind · carries the cloud to the ridge', role: 'actor', describe: 'It blows from the lake towards the ridge; the sock lifts as the wind strengthens.', shape: { kind: 'group' }, position: [2.9, 0, .2] },
    { id: 'sockpole', name: 'Windsock pole', role: 'decor', parent: 'windsock', shape: { kind: 'cylinder', r: .016, h: 1.0 }, material: { preset: 'steel' }, position: [0, .5, 0] },
    { id: 'sockpivot', name: 'Windsock', role: 'decor', parent: 'windsock', shape: { kind: 'group' }, position: [0, .98, 0] },
    { id: 'sockcone', name: 'Windsock', role: 'decor', parent: 'sockpivot', shape: { kind: 'cone', r: .075, h: .48 }, material: { preset: 'fabric', color: '#d8642a' }, position: [0, .24, 0] },
    { id: 'rain', name: 'Rain', label: 'Rain', role: 'actor', describe: 'Falls once the cloud holds more water than its droplets can keep aloft.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'sun', name: 'Sun', label: 'Sun · the energy source', role: 'actor', describe: 'Its height through the day sets how strongly the lake is heated.', shape: { kind: 'star', r: .38, color: '#ffd9a0', intensity: 2 }, position: [-.7, 6.2, 3.5] },
    { id: 'house', name: 'Cottage', role: 'decor', shape: { kind: 'house', w: .9, d: .75, h: .6 }, position: [3.4, .1, 3.9], rotation: [0, 70, 0] },
    { id: 'rock1', name: 'Boulder', role: 'decor', shape: { kind: 'rock', r: .32, h: .3 }, position: [4.4, .05, -1.2] },
    { id: 'rock2', name: 'Boulder', role: 'decor', shape: { kind: 'rock', r: .22, h: .2 }, position: [2.4, .05, -.7] },
    ...trees([[5.0, -3.4, 1.5], [4.5, -4.5, 1.2], [4.6, 4.5, 1.4], [5.4, 3.0, 1.0], [2.5, -.1, .9], [-1.4, .6, .9], [2.0, 4.6, 1.1]]),
    ...trees([[-1.0, -1.0, 1.2], [1.7, -1.5, 1.05], [-1.4, -4.9, .9], [-.6, 2.9, 1.1], [3.6, -2.4, 1.3]], 'pine')
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
const VS=250, PX=.7, HOME=1.7, LX=.9, LZ=1.7;
api.world.updateMatrixWorld(true);
const ray=new T.Raycaster(), DOWN=V(0,-1,0), land=['ground','mountain','farhill1','farhill2','farhill3'].map(api.body).filter(Boolean);
const hAt=(x,z,objs)=>{ray.set(V(x,40,z),DOWN);const h=ray.intersectObjects(objs||land,true)[0];return h?h.point.y:0;};
api.bodies().forEach(o=>{const id=o.userData.bodyId||'';if(/^(tree|pine|house|windsock|rock)/.test(id)) o.position.y=hAt(o.position.x,o.position.z)-(/^rock/.test(id)?.08:.03);});  // decor stands on the ground
let lakeY;{const b=[];for(let i=0;i<=24;i++){const u=i/24-.5;b.push(hAt(LX+u*2.6,LZ-1.5,[ground]),hAt(LX+u*2.6,LZ+1.5,[ground]),hAt(LX-1.3,LZ+u*3,[ground]),hAt(LX+1.3,LZ+u*3,[ground]));}b.sort((a,c)=>a-c);lakeY=Math.max(hAt(LX,LZ,[ground])+.05,b[Math.floor(b.length*.15)]-.01);}
lake.position.y=lakeY; vap.position.y=lakeY;
// the air's path over the land: terrain height under the cloud, smoothed (air flows over, not through, the ridge)
const base0=hAt(PX,HOME,[ground]), raw=[];for(let i=0;i<=210;i++){const z=4-i*.05;raw.push(Math.max(0,hAt(PX,z)-base0));}
const lift=raw.map((_,i)=>{let s=0,n=0;for(let j=-14;j<=14;j++){const k=i+j;if(k<0||k>=raw.length)continue;const w=1-Math.abs(j)/15;s+=w*raw[k];n+=w;}return s/n;});
const liftU=z=>{const i=Math.max(0,Math.min(lift.length-1,Math.round((4-z)/.05)));return lift[i];};
let zCrest=HOME,top=0;lift.forEach((v,i)=>{if(v>top){top=v;zCrest=4-i*.05;}});
const heat=()=>api.param('sun')*Math.max(0,Math.sin((api.param('hour')-6)/12*Math.PI)), target=()=>10+14*heat();
let Ts=target(), q=12, qt=12, qt0=12, d=200, cz=HOME, raining=false, rainSlope=0, rainLake=0, gone=0, shadowSaid=false, E=0, Emm=0, zb=300, qc=0, Tm=15, Tb=15, L=0, over=true, czb=300, cTb=15, Ts0=20;
let Tset=target(), settled=true, quiet=true, warming=true;
// the parcel: one bubble of lake air, rising to the cloud base, then riding the cloud
let pp=V(LX+.35,lakeY+.05,LZ-.3), phase='rise', ride=0, poff=V(.15,-.2,.25);
function step(h){
  const u=api.param('wind'), Tt=target();
  if(Math.abs(Tt-Tset)>1.5){warming=Tt>Ts;Tset=Tt;settled=false;}
  Ts+=(Tt-Ts)*Math.min(1,h/4);
  const qs0=qsat(Ts,1013);
  E=.05*(1+.3*u)*(qs0-q);                          // Dalton: evaporation grows with the saturation deficit q_s(T) − q, faster in wind
  q+=(E-(.02+.004*u)*(q-6))*h; if(q>qs0) q=qs0;   // mixing with drier air; above saturation the excess condenses as dew or mist
  Emm=Math.max(0,.1348*Math.max(1,u)*(qs0-q));    // bulk formula ρ·C_E·U·(q_s − q) with C_E = 1.3e-3, in mm of water per day
  zb=Math.max(60,125*(Ts-dewOf(q,1013)));         // cloud base: lifting condensation level ≈ 125 m per K of dew-point spread (Espy)
  over=Math.abs(cz-HOME)<1.6;
  Tb=Ts-9.8*zb/1000;                               // a rising parcel cools at the dry adiabatic rate up to the base
  if(over){ qt+=(q-qt)*Math.min(1,h*.8); qt0=qt; czb=zb; cTb=Tb; Ts0=Ts; d=Math.min(2400,d+h*16*heat()*q/12); } else d=Math.max(150,d-h*6);   // over the warm lake convection feeds and deepens the cloud; once it leaves, it keeps its own air
  cz-=u*.08*h; L=liftU(cz)*VS;
  const zm=czb+d/2+L, Tg=cTb-gm(cTb,pAt(czb))*(zm-czb)/2000; Tm=cTb-gm(Tg,pAt((czb+zm)/2))*(zm-czb)/1000;   // above the base: the moist adiabat
  qc=Math.max(0,qt-qsat(Tm,pAt(zm)));              // condensed water at mid-cloud
  const was=raining; raining=qc>(was?.8:1);
  if(raining){ const r=.3*(qc-.8)*h; qt-=r; const mm=r*d/1000; if(over) rainLake+=mm; else rainSlope+=mm; }
  if(!quiet){
    if(raining&&!was){ if(over) api.event('Rain falls back on the lake: the cloud, '+f0(d)+' m deep, now holds '+f1(qc)+' g of droplets per kg of air',V(PX,lakeY+1.2,cz),{id:'rainlake',sound:'pour'});
      else api.event('Rain on the windward slope: lifted '+f0(L)+' m, the cloud has cooled to '+f1(Tm)+' °C and holds '+f1(qc)+' g/kg of droplets',V(PX,base0+(czb+L)/VS,cz),{id:'rain',sound:'pour'}); }
    if(!settled&&Math.abs(Ts-Tt)<.25){ settled=true; const msg=warming?'The lake air has warmed to ':'The lake air has cooled to ';
      api.event(msg+f1(Ts)+' °C: e_s is now '+f1(es(Ts))+' hPa and evaporation '+f1(Emm)+' mm/day',V(LX,lakeY+.3,LZ),{id:'temp',sound:'tick'}); }
  }
  const past=cz<zCrest-.2;
  if(past&&qc<.02){ if(!shadowSaid&&!quiet){ const fw=2.49*Math.max(0,qt0-qt); api.event('Rain shadow: sinking down the lee side, the air warms and the cloud evaporates; back at valley level it would be '+f1(Ts0+fw)+' °C, '+f1(fw)+' K warmer than when it left the lake',V(PX,base0+(czb+L)/VS,cz),{id:'shadow',sound:'whoosh'}); } shadowSaid=true; gone+=h; }
  if((past&&gone>1.5)||cz<-5.3){ cz=HOME; qt=q; qt0=q; d=200; shadowSaid=false; gone=0; phase='rise'; pp.set(LX+.35,lakeY+.05,LZ-.3); }   // the old cloud has dissolved; the next one forms over the lake, and a new parcel rises into it
  // the parcel
  const yb=lakeY+zb/VS;
  if(phase==='rise'){ pp.y+=h*(.25+.4*Math.min(1.5,heat())); pp.z-=h*u*.02; if(pp.y>=yb){ phase='ride'; ride=0; poff.set(pp.x-PX,0,pp.z-cz); if(!quiet) api.event('The parcel reaches its dew point at '+f0(zb)+' m: at '+f1(Tb)+' °C its vapour condenses into cloud droplets',pp.clone(),{id:'dew',sound:'chime'}); } }
  else { ride+=h; pp.set(PX+poff.x*.5,base0+(czb+d*.3+L)/VS,cz+poff.z*.5); }   // it rides its cloud until the cloud dissolves
}
for(let i=0;i<60*120;i++) step(1/120); quiet=false;   // start from the steady state of the default sky
api.onStep(h=>step(h));
// ---- visuals ----
const white=new T.Color('#ffffff'), slate=new T.Color('#5e6670'), cm=[]; cloud.traverse(o=>{if(o.isMesh)cm.push(o);});
const vapPts=vap.children[0];
const NR=420, RD=[], rg=new T.BufferGeometry(); rg.setAttribute('position',new T.BufferAttribute(new Float32Array(NR*6),3));
const rl=new T.LineSegments(rg,new T.LineBasicMaterial({color:0xb8cfe0,transparent:true,opacity:.55,depthWrite:false})); rl.frustumCulled=false; rl.name='rain streaks'; rainB.add(rl);
for(let i=0;i<NR;i++) RD.push({x:0,y:-1,z:0,v:4.5+api.rand()*1.5});
let rk=0, fr=0;
function sunDir(hr){ const el=Math.sin((hr-6)/12*Math.PI)*62, az=(hr-12)/12*140; return new T.Vector3().setFromSphericalCoords(1,(90-el)*Math.PI/180,az*Math.PI/180); }   // same sun path as the landscape light
api.onFrame((dt)=>{ dt=Math.min(dt,.1);
  const vis=Math.min(1,qc/.12+.15*(over?1:0)), sxz=.75+.22*Math.min(3,d/400), sy=Math.max(.35,Math.min(2.6,d/VS/.8));
  cloud.position.set(PX,base0+(czb+d/2+L)/VS,cz); cloud.scale.set(sxz,sy,sxz);
  const k=api.clamp(qc/2.2,0,1); cm.forEach(m=>{ m.material.color.copy(white).lerp(slate,k*.85); m.material.opacity=.94*vis; m.material.transparent=true; m.visible=vis>.02; });
  parcel.position.copy(pp);
  // rain: streaks from the cloud base to the ground under it
  rk+=((raining?Math.min(1,.35+(qc-.8)):0)-rk)*Math.min(1,dt*3); rl.visible=rk>.02; rl.material.opacity=.6*rk;
  if(rl.visible){ const a=rg.attributes.position.array, yTop=base0+(czb+L)/VS-.1;
    for(let i=0;i<NR;i++){ const s=RD[i]; s.y-=dt*s.v; const g=base0+liftU(s.z)*1;
      if(s.y<g||s.y>yTop){ s.x=PX+(api.rand()-.5)*.9; s.z=cz+(api.rand()-.5)*1.6; s.y=g+api.rand()*(yTop-g); }
      a[i*6]=s.x;a[i*6+1]=s.y+.16;a[i*6+2]=s.z+.02;a[i*6+3]=s.x;a[i*6+4]=s.y;a[i*6+5]=s.z; }
    rg.attributes.position.needsUpdate=true; if((fr++)%10===0) rg.computeBoundingBox(); }
  // vapour motes: rise from the lake to the cloud base, drift with the wind; fainter as evaporation falls
  if(vapPts&&vapPts.geometry){ const a=vapPts.geometry.attributes.position, top=zb/VS, w=api.param('wind');
    for(let i=0;i<a.count;i++){ let y=a.getY(i)+dt*(.12+.5*Math.min(1.5,heat())); let z=a.getZ(i)-dt*w*.03; if(y>top){y=0;z=(api.rand()-.5)*2.6;} if(z<-1.3) z+=2.6; a.setY(i,y); a.setZ(i,z); }
    a.needsUpdate=true; vapPts.material.opacity=.08+.5*Math.min(1,Emm/3); }
  const sd=sunDir(api.param('hour')).multiplyScalar(7.2); sun.position.set(sd.x,Math.max(.6,sd.y),sd.z);
  const w=api.param('wind'), lift0=Math.PI/2*Math.min(1,w/7)*.95; pivot.rotation.set(Math.PI+lift0+Math.sin(api.time()*7)*.05*Math.min(1,w/3),0,0);
});
if(api.scene.fog){ api.scene.fog.near=15; api.scene.fog.far=46; }   // aerial perspective: the far hills sink into haze
api.readout('lake-air temperature',()=>f1(Ts)+' °C'); api.readout('saturation vapour pressure e_s',()=>f1(es(Ts))+' hPa');
api.readout('e_s growth per kelvin',()=>f1(growth(Ts))+' %/K'); api.readout('relative humidity',()=>f0(100*q/qsat(Ts,1013))+' %');
api.readout('dew point',()=>f1(dewOf(q,1013))+' °C'); api.readout('evaporation',()=>f1(Emm)+' mm/day');
api.readout('cloud base',()=>f0(zb)+' m'); api.readout('lift over the ridge',()=>f0(L)+' m'); api.readout('cloud temperature',()=>f1(Tm)+' °C');
api.readout('cloud water',()=>f1(qc)+' g/kg (rain above 1.0)'); api.readout('rain on the slope',()=>f1(rainSlope)+' mm'); api.readout('rain on the lake',()=>f1(rainLake)+' mm');
api.readout('föhn warming in the lee',()=>over?'—':f1(2.49*Math.max(0,qt0-qt))+' K (2.5 K per g/kg rained out)');
api.plot('cloud water (g/kg)',()=>qc);
api.camera({target:[.1,1.7,-.4],r:16,ph:1.14,th:1.22});`,
  lessons: [
    { title: 'Heat the lake', question: 'What lifts water out of the lake?', text: 'Turn the sunshine up. Watch how the vapour rises faster from the lake, and the readouts: the lake-air temperature, the saturation vapour pressure e_s and the evaporation rate.', set: { sun: 1.4 }, focus: 'lake', shot: 'push', until: 'event:has warmed to', run: 30, explain: 'Stronger sunshine warms the lake air from 22.2 to 28.9 °C. The saturation vapour pressure e_s rises from 26.8 to 39.8 hPa: about 6 % per kelvin, the Clausius–Clapeyron rate (Koutsoyiannis 2012). Evaporation follows the gap between e_s and the vapour already in the air, so it roughly doubles, from about 1.4 to about 3 mm a day. Saturation is a property of water at a given temperature, not a capacity of the air.', opens: 'Where does the vapour go?' },
    { title: 'Ride a parcel of air', question: 'Where does the vapour go?', text: 'You are now inside one parcel of moist lake air as it rises. Look up: the cloud base is above you. Wait until the parcel reaches its dew point.', focus: 'parcel', shot: 'pov', pov: 'Air parcel', until: 'event:parcel reaches its dew point', run: 40, explain: 'Rising air expands and cools by 9.8 K per kilometre while it is dry. Its dew point falls only about 1.8 K per kilometre, so the gap closes at about 8 K per kilometre: the parcel saturates about 125 m higher for every kelvin of gap at the ground (Espy). Here the gap was about 3.6 K, so the cloud base sits near 450 m. There the vapour condenses on tiny aerosol particles into cloud droplets.', opens: 'Why does the rain fall on the ridge and not on the lake?' },
    { title: 'Wind to the ridge', question: 'Why does the rain fall on the ridge and not on the lake?', text: 'Raise the wind. The cloud drifts from the lake to the ridge and climbs its windward slope. Watch the cloud water readout and wait for rain.', set: { wind: 6 }, focus: 'cloud', shot: 'medium', until: 'event:windward slope', run: 35, explain: 'The cloud left the lake holding only about 0.3 g of droplets per kg of air, too little to rain. Forced about 400 m up the slope, it cooled by about 2 K more along the moist adiabat (about 4 K per km in warm, wet air). Each kelvin of cooling lowers e_s by about 6 %, so more vapour condenses. Once the droplets pass 1 g per kg, this model lets them grow into falling drops: orographic rain (Roe 2005).', opens: 'What happens to the air beyond the crest?' },
    { title: 'Over the crest', question: 'What happens to the air beyond the crest?', text: 'Follow the cloud over the crest of the ridge and down its far side, then wait for the rain shadow.', focus: 'mountain', shot: 'wide', until: 'event:rain shadow', run: 30, explain: 'Sinking air is compressed and warms. Once its droplets have evaporated it warms at the dry rate of 9.8 K per km, faster than it cooled on the way up while condensing. The air left part of its water on the windward slope as rain. So it reaches the far valley warmer and drier than it started, about 1 K here (the föhn readout: 2.5 K per gram of water rained out). Lee valleys are dry: a rain shadow.', opens: 'Can a cloud rain without a ridge?' },
    { title: 'Calm air', question: 'Can a cloud rain without a ridge?', text: 'Drop the wind almost to zero. A new cloud now stays over the warm lake, keeps being fed by rising vapour, and grows deeper. Wait until rain falls back on the lake.', set: { wind: .3 }, focus: 'cloud', shot: 'medium', until: 'event:falls back on the lake', run: 50, explain: 'Without wind, convection keeps feeding the same cloud. As it deepens, its upper part climbs further along the moist adiabat and holds more condensed water. Past about 1 g per kg it rains over the lake: the cycle closes locally. Worldwide, about 40 000 km³ of water a year is carried by wind from the oceans to fall on land (Trenberth et al. 2007), and returns to the sea in rivers.', opens: 'What sets the pace of the whole cycle?' },
    { title: 'Evening', question: 'What sets the pace of the whole cycle?', text: 'Move the time of day to evening. With the sun low, watch the lake-air temperature, e_s and the evaporation rate fall.', set: { hour: 18.5 }, focus: 'sun', shot: 'wide', until: 'event:has cooled to', run: 45, explain: 'At 18:30 the sun gives almost no heat. The lake air cools to 10 °C, and e_s falls to 12.3 hPa, less than a third of its midday value. The air above the lake is now close to saturation, so evaporation almost stops and dew or mist can form. The sun powers the cycle: evaporation takes about 2.45 MJ for every kilogram of water, and gravity brings the water back down.' }]
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
  environment: { preset: 'abstract' },
  bodies: [
    { id: 'back', name: 'Board', role: 'decor', shape: { kind: 'box', w: 7.2, h: 6.6, d: .16, round: .03 }, material: { preset: 'darkwood' }, position: [0, 3.3, -.3] },
    { id: 'funnel', name: 'Funnel', label: 'Funnel · releases balls', role: 'actor', describe: 'Every ball starts in the same place.', shape: { kind: 'cone', r: .55, h: .7 }, material: { preset: 'brass' }, position: [0, 6.2, 0], rotation: [180, 0, 0] },
    { id: 'ball', name: 'Ball', label: 'A ball · one random path', role: 'actor', describe: 'Its final bin is the number of times it bounced right.', shape: { kind: 'sphere', r: .09 }, material: { preset: 'chrome' }, position: [0, 5.85, 0] },
    { id: 'pegs', name: 'Pegs', label: 'Pegs · each one a coin flip', role: 'actor', describe: 'At every peg the ball goes right with probability p.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'bins', name: 'Bins', label: 'Bins · the histogram', role: 'actor', describe: 'Bin k collects the paths with k right-bounces.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'curve', name: 'Curve', label: 'Binomial ≈ normal curve', role: 'actor', describe: 'Theory: mean Np, spread √(Np(1−p)).', shape: { kind: 'group' }, position: [0, 0, 0] }],
  tour: ['funnel', 'ball', 'pegs', 'bins', 'curve'],
  params: [
    { key: 'rows', label: 'rows of pegs', min: 4, max: 14, value: 10, rebuild: true },
    { key: 'p', label: 'probability of bouncing right', min: .1, max: .9, value: .5 },
    { key: 'rate', label: 'balls per second', min: 1, max: 25, value: 7 }],
  code: `const T=api.THREE, N=Math.round(api.param('rows')), pegs=api.body('pegs'), bins=api.body('bins'), cg=api.body('curve'), lead=api.body('ball');
const top=5.5, dy=4.3/N, dx=Math.min(0.5,6.2/(N+2)), pegM=api.material({preset:'brass'}), ballM=api.material({preset:'chrome'});
for(let r=0;r<N;r++) for(let k=0;k<=r;k++){ const m=new T.Mesh(new T.CylinderGeometry(0.045,0.045,0.26,12),pegM); m.rotation.x=Math.PI/2; m.position.set((k-r/2)*dx,top-r*dy,0); m.castShadow=true; pegs.add(m); }
const counts=new Array(N+1).fill(0), bars=[], binY=0.12, maxH=2.3;
for(let k=0;k<=N;k++){ const x=(k-N/2)*dx; const w=new T.Mesh(new T.BoxGeometry(0.025,maxH,0.26),api.material({preset:'steel'})); w.position.set(x+dx/2,binY+maxH/2,0); bins.add(w);
  const b=new T.Mesh(new T.BoxGeometry(dx*0.8,1,0.2),api.material({preset:'plastic',color:'#2d5b8e'})); b.position.set(x,binY,0); b.scale.y=0.001; b.castShadow=true; bins.add(b); bars.push(b); }
const balls=[]; let acc=0, landed=0, said=false;
const curve=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:81},()=>new T.Vector3())),new T.LineBasicMaterial({color:0xffd27a})); curve.frustumCulled=false; cg.add(curve);
function spawn(){ let m; if(lead&&!lead.userData.used){ lead.userData.used=true; m=lead; } else { m=new T.Mesh(new T.SphereGeometry(0.085,16,12),ballM); m.castShadow=true; api.world.add(m); } m.visible=true; m.position.set(0,top+0.4,0); balls.push({m,row:-1,k:0,t:0,x0:0,x1:0,y0:top+0.4,y1:top}); }
api.onStep((h)=>{ acc+=h*api.param('rate'); while(acc>=1){ acc-=1; spawn(); }
  for(let i=balls.length-1;i>=0;i--){ const b=balls[i]; b.t+=h/0.11;
    if(b.t>=1){ b.t=0; b.row++;
      if(b.row<N){ const right=api.rand()<api.param('p'); b.x0=b.m.position.x; b.k+=right?1:0; b.x1=(b.k-(b.row+1)/2)*dx; b.y0=top-b.row*dy; b.y1=top-(b.row+1)*dy; }
      else { counts[b.k]++; landed++; if(b.m===lead) b.m.visible=false; else b.m.removeFromParent(); balls.splice(i,1);
        if(landed<=3) api.event('A ball lands in bin '+b.k+' after '+N+' coin flips',new T.Vector3((b.k-N/2)*dx,0.5,0),{id:'land'});
        if(landed===150&&!said){ said=true; api.event('150 balls: the bins now trace a bell (binomial ≈ normal)',null,{id:'bell'}); } continue; } }
    const s=b.t; b.m.position.x=b.x0+(b.x1-b.x0)*s; b.m.position.y=b.y0+(b.y1-b.y0)*s+Math.sin(Math.PI*s)*dy*0.35; } });
api.onFrame(()=>{ bars.forEach((b,k)=>{ const H=Math.max(0.001,Math.min(maxH,counts[k]*0.045)); b.scale.y=H; b.position.y=binY+H/2; });
  const p=api.param('p'), mu=N*p, sd=Math.sqrt(N*p*(1-p))||1e-3, a=curve.geometry.attributes.position;
  for(let i=0;i<=80;i++){ const kk=-0.5+(N+1)*i/80, x=(kk-N/2)*dx, d=Math.exp(-((kk-mu)**2)/(2*sd*sd))/(sd*Math.sqrt(2*Math.PI)); a.setXYZ(i,x,binY+Math.min(maxH+0.6,d*landed*0.045),0.16); } a.needsUpdate=true; });
const mean=()=>{ let s=0; counts.forEach((c,k)=>s+=c*k); return landed?s/landed:NaN; };
api.readout('balls landed',()=>landed); api.readout('mean bin',()=>mean()); api.readout('theory N·p',()=>N*api.param('p'));
api.readout('spread measured',()=>{ if(landed<2) return NaN; const m=mean(); let v=0; counts.forEach((c,k)=>v+=c*(k-m)**2); return Math.sqrt(v/(landed-1)); });
api.readout('theory √(Np(1−p))',()=>Math.sqrt(N*api.param('p')*(1-api.param('p'))));
api.plot('balls in the centre bin',()=>counts[Math.round(N/2)]); api.camera({target:[0,3.1,0],r:13,ph:1.4,th:0});`,
  lessons: [
    { title: 'Let the balls fall', text: 'Each ball meets one peg per row and goes left or right at random. Watch the bins fill until the bell event.', focus: 'funnel', until: 'event:bell', run: 40, explain: 'A bin count is the number of right-bounces in N independent flips: a binomial distribution, which for many rows is close to a normal curve.' },
    { title: 'Bias the coin', text: 'Make right-bounces likelier. The pile slides right; its centre moves to N·p.', set: { p: .75 }, focus: 'bins', run: 14, explain: 'The mean of a binomial is Np; the spread √(Np(1−p)) also changes.' },
    { title: 'More rows', text: 'Add rows. The board rebuilds; with more flips per ball the bell becomes smoother and wider in bins but narrower relative to N.', set: { rows: 14, p: .5 }, focus: 'curve', run: 20, explain: 'Spread grows like √N while the range grows like N: averages concentrate (the central limit theorem).' }]
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
