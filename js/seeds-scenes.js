// Flagship authored dioramas in the universal scene format (the same JSON any AI produces from the prompt pack).
// Each embodies an idea through bodies, events and processes; decor reacts to the simulation.

const trees = (pts, kind = 'tree') => pts.map(([x, z, h], i) => ({ id: kind + i, name: kind === 'pine' ? 'Pine' : 'Tree', role: 'decor', shape: { kind, h }, position: [x, .15, z] }));

export const WATER_CYCLE = {
  type: 'scene', title: 'The water cycle in a glass valley', technique: 'topdown',
  environment: { preset: 'landscape', time: 11, azimuth: -45, base: false, exposure: 1.15, envIntensity: .35 },
  // A specimen block of land (js/gfx/terrain.js): one terrain field with the ridge, two side ridges, a terrace whose
  // edge is a waterfall, a stream from the saddle into the lake, a cottage yard and a path; cut faces show the soil
  // section. Grass, flowers, reeds, rocks and trees are scattered by the field's ecology (realism-playbook §3).
  bodies: [
    { id: 'ground', name: 'Valley floor', role: 'decor', position: [0, 0, 0], shape: { kind: 'terrain', w: 13, d: 10, h: .1, seed: 3, low: '#3c5728', high: '#646d3f', rock: '#3f3c38', rockHigh: '#6a655d', block: true, bottom: -.85, lift: .1,
      backRise: [-4.6, -5, .05],
      // a craggy massif across the back: the Ridge (actor) and three peaks with cliff bands, ledges and gullies; foothills
      peaks: [{ x: .2, z: -2.9, r: 2.2, h: 4.4, squash: 1.6, own: 'ridge', seed: 5, terrace: .38, crag: 1, rough: .4 }, { x: -2.1, z: -3.4, r: 1.9, h: 3.2, squash: 1.1, seed: 11, terrace: .34, crag: 1, rough: .4 },
        { x: 2.6, z: -3.5, r: 1.8, h: 3.0, seed: 6, terrace: .34, crag: 1, rough: .4 }, { x: -2.6, z: -4.5, r: 1.5, h: 3.0, seed: 8, terrace: .34, crag: 1 }, { x: 4.6, z: -3.3, r: 1.5, h: 1.7, seed: 4, terrace: .28, crag: .7 },
        { x: -4.5, z: -3.0, r: 1.6, h: 2.0, seed: 2, terrace: .28, crag: .7 }, { x: -5.0, z: 1.0, r: 1.4, h: .45, rough: .15, seed: 9 }],
      rockHeight: 2.6,
      // the water axis: a spring in the massif, a waterfall over the terrace edge, rapids down the meadow, the lake at the front
      terraces: [{ z0: -1.0, z1: -1.14, x0: -1.7, x1: .3, h: .6 }, { z0: -3.7, z1: -4.4, x0: -.4, x1: 1.9, h: -.4 }],   // the second: a lee hollow behind the Ridge (the air sinks into it)
      river: { points: [[-.65, -2.25], [-.75, -1.7], [-.6, -1.12], [-.5, -.5], [-.2, .3], [.25, 1.15], [.7, 1.9], [.95, 2.5]], width: [.22, .5], depth: .06, fallAt: [-.6, -1.08] },
      lake: { x: 1.15, z: 3.75, rx: 2.25, rz: 2.0, depth: .36, level: .02 },
      pads: [[-3.0, 3.2, .75]], path: { points: [[-2.55, 3.25], [-1.85, 3.45], [-1.05, 3.6]], width: .15 } } },
    { id: 'mountain', name: 'Ridge', label: 'Ridge', role: 'actor', describe: 'Wind forces the moist air up its slope; rising air expands and cools.', shape: { kind: 'peak', id: 'ridge', x: .2, z: -2.9 }, position: [.2, 0, -2.9] },
    { id: 'meadow', name: 'Meadow', role: 'decor', shape: { kind: 'grassField' }, position: [0, 0, 0] },
    { id: 'flowers', name: 'Wild flowers', role: 'decor', shape: { kind: 'flowers' }, position: [0, 0, 0] },
    { id: 'reeds', name: 'Reeds', role: 'decor', shape: { kind: 'reeds' }, position: [0, 0, 0] },
    { id: 'rocks', name: 'Boulders', role: 'decor', shape: { kind: 'rockScatter', count: 150, r: [.04, .22] }, position: [0, 0, 0] },
    { id: 'stream', name: 'Stream and waterfall', role: 'decor', shape: { kind: 'river', flow: .35 }, position: [0, 0, 0] },
    { id: 'lake', name: 'Lake', label: 'Lake · source of vapour', role: 'actor', describe: 'Sunshine warms the water and the air above it; molecules escape as vapour.', shape: { kind: 'lake' }, position: [0, 0, 0] },
    { id: 'vapour', name: 'Water vapour', label: 'Water vapour', role: 'actor', describe: 'An invisible gas in reality; drawn here as faint wisps rising from the lake.', shape: { kind: 'particles', type: 'vapour', count: 140, area: [2.4, 1.7, 2.2], size: .16 }, position: [1.0, .05, 3.6] },
    { id: 'parcel', name: 'Air parcel', label: 'Air parcel · moist air from the lake', role: 'actor', describe: 'One rising bubble of lake air: you can ride it (POV).', shape: { kind: 'sphere', r: .07 }, material: { preset: 'cloud', color: '#eef6ff', emissive: '#4a6c86' }, position: [1.1, .1, 1.4] },
    { id: 'cloud', name: 'Cloud', label: 'Cloud · condensed droplets', role: 'actor', describe: 'Droplets condensed from the vapour; it greys as it fills with water.', shape: { kind: 'cloud', volume: true, r: .9, puffs: 13 }, position: [.7, 2.2, 1.7], rotation: [0, 90, 0] },
    { id: 'cloud2', name: 'Cloud', role: 'decor', shape: { kind: 'cloud', volume: true, r: .9, puffs: 13 }, position: [.7, 2.2, 3.5], rotation: [0, 90, 0] },
    { id: 'cloud3', name: 'Cloud', role: 'decor', shape: { kind: 'cloud', volume: true, r: .9, puffs: 13 }, position: [.7, 2.2, -4.5], rotation: [0, 90, 0] },
    { id: 'windsock', name: 'Windsock', label: 'Wind · carries the cloud to the ridge', role: 'actor', describe: 'It blows from the lake towards the ridge; the sock lifts as the wind strengthens.', shape: { kind: 'group' }, position: [2.9, 0, .2] },
    { id: 'sockpole', name: 'Windsock pole', role: 'decor', parent: 'windsock', shape: { kind: 'cylinder', r: .016, h: 1.0 }, material: { preset: 'steel' }, position: [0, .5, 0] },
    { id: 'sockpivot', name: 'Windsock', role: 'decor', parent: 'windsock', shape: { kind: 'group' }, position: [0, .98, 0] },
    { id: 'sockcone', name: 'Windsock', role: 'decor', parent: 'sockpivot', shape: { kind: 'cone', r: .075, h: .48 }, material: { preset: 'fabric', color: '#d8642a' }, position: [0, .24, 0] },
    { id: 'rain', name: 'Rain', label: 'Rain', role: 'actor', describe: 'Falls once the cloud holds more water than its droplets can keep aloft.', shape: { kind: 'group' }, position: [0, 0, 0] },
    { id: 'sun', name: 'Sun', label: 'Sun · the energy source', role: 'actor', describe: 'Its height through the day sets how strongly the lake is heated; the light and the shadows come from it.', shape: { kind: 'star', r: .45, color: '#ffd9a0', intensity: 2 }, position: [-4.2, 5, 3] },
    { id: 'house', name: 'Log cabin', role: 'decor', shape: { kind: 'cabin', w: .95, d: .72 }, position: [-3.0, .1, 3.2], rotation: [0, 90, 0] },
    { id: 'jetty', name: 'Jetty', role: 'decor', shape: { kind: 'jetty', from: [-1.2, 3.45], to: [-.25, 3.7], width: .2 }, position: [0, 0, 0] },
    { id: 'vitrine', name: 'Glass case', role: 'decor', shape: { kind: 'vitrine', min: [-6.62, -.85, -5.12], max: [6.62, 6.5, 5.12] }, position: [0, 0, 0] },
    { id: 'pines2', name: 'Pines', role: 'decor', shape: { kind: 'forest', species: 'pine', count: 16, region: [-6.2, -4.8, 6.2, -1.2], h: [1.0, 1.6], spacing: .65 }, position: [0, 0, 0] },
    { id: 'oaks2', name: 'Oaks', role: 'decor', shape: { kind: 'forest', species: 'oak', count: 5, region: [-6.2, -1, 6.2, 4.7], h: [1.3, 1.8], spacing: 1.3 }, position: [0, 0, 0] },
    { id: 'hills', name: 'Distant hills', role: 'decor', shape: { kind: 'hills', r: 70, layers: 3, height: 9, y: -6 }, position: [0, 0, 0] },
    { id: 'pines', name: 'Pines', role: 'decor', shape: { kind: 'forest', species: 'pine', items: [[3.6, -2.3, 1.59], [-3.0, -1.3, 1.45], [-3.7, -2.2, 1.74], [4.2, -1.6, 1.45], [-1.9, -1.45, 1.3], [1.9, -1.55, 1.38], [-4.4, -3.6, 1.59], [4.6, -3.0, 1.67], [-2.9, -4.4, 1.45], [3.4, -4.3, 1.45], [-5.6, -2.6, 1.52], [5.7, -2.2, 1.38]] }, position: [0, 0, 0] },
    { id: 'oaks', name: 'Oaks', role: 'decor', shape: { kind: 'forest', species: 'oak', items: [[4.9, 2.0, 1.92], [-2.5, 1.3, 1.76], [-4.2, 2.6, 2.08], [5.4, -.5, 1.6], [-5.2, 4.2, 1.6], [-5.5, -.3, 1.84], [3.9, .4, 1.68]] }, position: [0, 0, 0] },
    { id: 'birches', name: 'Birches', role: 'decor', shape: { kind: 'forest', species: 'birch', items: [[-1.1, -.6, 1.3], [.3, -.15, 1.23], [-.8, .75, 1.16], [.95, .95, 1.16], [-1.35, -1.55, 1.23], [1.45, 1.75, 1.16]] }, position: [0, 0, 0] },
    { id: 'bushes', name: 'Bushes', role: 'decor', shape: { kind: 'forest', species: 'bush', items: [[-.95, 0, 0.61], [.0, .95, 0.57], [1.05, 1.45, 0.65], [-.15, -.95, 0.57], [-1.2, -.9, 0.61], [1.6, -1.6, 0.66], [-2.6, -1.5, 0.65], [3.0, -1.3, 0.57], [-3.6, 1.6, 0.66], [4.2, 1.2, 0.61], [3.1, 4.4, 0.63], [-2.3, 2.4, 0.57], [2.6, 2.6, 0.57], [-1.9, 4.4, 0.53], [5.6, 3.3, 0.65]] }, position: [0, 0, 0] },
    { id: 'cherry', name: 'Cherries in blossom', role: 'decor', shape: { kind: 'forest', species: 'cherry', items: [[-3.9, 2.25, 1.42], [-2.15, 4.3, 1.2], [3.5, 2.7, 1.27]], variants: 2 }, position: [0, 0, 0] }
  ],
  tour: ['sun', 'lake', 'vapour', 'parcel', 'cloud', 'windsock', 'mountain', 'rain'],
  // the path of a parcel of the cloud's air over the ridge (lesson "Over the crest"): along the wind from the lake, up the
  // windward slope, over the crest (the ridge rises to about 2.9 units), down into the rain shadow ('look', marked by a
  // bead). The eye follows it from behind, on the sunlit side and above (points: never inside a cloud, which fills the
  // parcel's own path, and well inside the fog's clear range), looking a little below the bead so the ridge, the lake and
  // the valley floor stay in the frame
  tracks: { parcel: { label: 'a parcel of air over the ridge', dur: 12, lookAhead: .04, fov: 55, marker: '#eef6ff', markerR: .09, aim: [0, -.45, 0],
    look: [[0.8, 3.4, 1.7], [0.7, 3.5, 0.3], [0.7, 3.9, -1.0], [0.7, 4.5, -2.0], [0.7, 4.9, -2.9], [0.7, 4.5, -3.8], [0.6, 3.9, -4.6], [0.5, 3.6, -5.3]],
    points: [[-1.6, 4.8, 4.1], [-1.7, 4.9, 2.7], [-1.7, 5.3, 1.4], [-1.7, 5.9, 0.4], [-1.7, 6.3, -0.5], [-1.7, 5.9, -1.4], [-1.8, 5.3, -2.2], [-1.9, 5.0, -2.9]] } },
  params: [
    { key: 'sun', label: 'sunshine (0 = overcast)', min: 0, max: 1.5, value: .9, unit: '' },
    { key: 'wind', label: 'wind speed', min: 0, max: 10, value: 4, unit: 'm/s' },
    { key: 'hour', label: 'time of day (sun held)', min: 6, max: 19.5, value: 11, unit: 'h' }],
  behaviors: [],   // trees and grass move in the shaders with the wind parameter (scene.userData.wind)
  shots: {
    'has warmed to': { target: [1.0, .7, 3.7], dist: 7 },
    'has cooled to': { target: [1.0, .9, 3.7], dist: 9 },
    'parcel reaches its dew point': { target: [.9, 1.4, 3.6], dist: 6 },
    'windward slope': { target: [.5, 2.8, -1.7], dist: 9 },
    'rain shadow': { target: [.4, 2.2, -4.2], dist: 9 },
    'falls back on the lake': { target: [.9, 1.6, 3.6], dist: 8 }
  },
  flows: {
    'vapour rises': [{ from: [1.0, .15, 3.7], to: [1.0, 1.5, 3.6], label: 'vapour leaves the warm surface' }],
    'dew point': [{ from: [1.35, .2, 3.4], to: [1.35, 1.55, 3.4], label: 'rising air cools 9.8 K per km' }],
    'windward slope': [{ from: [.7, 2.3, 3.3], to: [.7, 2.6, -.3], label: 'wind carries the moist air' }, { from: [.7, 2.4, -.6], to: [.7, 4.4, -2.3], label: 'forced up the slope, it cools' }],
    'rain shadow': [{ from: [.7, 4.6, -2.9], to: [.7, 2.5, -4.8], label: 'sinking air warms; the cloud evaporates' }],
    'falls back on the lake': [{ from: [1.0, .1, 4.2], to: [1.0, 1.6, 4.2], label: 'evaporation' }, { from: [.6, 1.6, 3.2], to: [.6, .2, 3.2], label: 'rain' }]
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
const VS=250, PX=.7, HOME=3.7, LX=1.0, LZ=3.7, AZ=-45, CAP=5.5;   // CAP: clouds are drawn below the case's lid   // AZ: the landscape's sun azimuth offset (environment.azimuth)
// the land is one terrain field (js/gfx/terrain.js): exact heights without raycasts, the lake level found from its rim
const F=ground.userData.field, hAt=(x,z)=>F?F.h(x,z):0;
['house','windsock'].forEach(id=>{const o=api.body(id);if(o) o.position.y=hAt(o.position.x,o.position.z)-.03;});  // decor stands on the ground
const lakeY=F&&F.lake?F.lake.level:.05; vap.position.y=lakeY;
// the air's path over the land: terrain height under the cloud above the lake surface, smoothed (air flows over, not through, the ridge)
const base0=lakeY, raw=[];for(let i=0;i<=210;i++){const z=4-i*.05;raw.push(Math.max(0,hAt(PX,z)-base0));}
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
  else if(c) pp.set(PX+poff.x*.5,Math.min(CAP-.3,base0+(c.zb+c.d*.3+c.L)/VS),c.z+poff.z*.5);   // it rides its cloud until the cloud dissolves
}
for(let i=0;i<60*120;i++) step(1/120); quiet=false;   // start from the steady state of the default sky
api.onStep(h=>step(h));
if(api.scene.fog){ api.scene.fog.near=30; api.scene.fog.far=90; }   // aerial perspective: a light haze over the far side of the block
// ---- sky: the landscape's sky dome shows only grey haze below the horizon, so it gives way to a painted screen-space gradient (repainted with the hour) ----
const dome=api.scene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.turbidity);   // hidden every frame (the materialiser restores the background objects when it finishes)
const GN=64, gd=new Uint8Array(GN*4), skyTex=new T.DataTexture(gd,1,GN); skyTex.colorSpace=T.SRGBColorSpace; skyTex.magFilter=skyTex.minFilter=T.LinearFilter;
const hz=new T.Color(), zn=new T.Color(), cc=new T.Color();
const hz2=new T.Color(); function paintSky(day){ const warm=1-Math.min(1,day*1.7), k=.45+.55*Math.min(1,day*1.5+.2); hz.setRGB(.8+.15*warm,.8-.02*warm,.78-.25*warm).multiplyScalar(k); hz2.setRGB(.6+.2*warm,.68,.78-.15*warm).multiplyScalar(k); zn.setRGB(.2+.12*warm,.36+.04*warm,.66-.14*warm).multiplyScalar(.38+.62*Math.min(1,day*1.5+.2));
  for(let i=0;i<GN;i++){ const u=i/(GN-1); if(u<.22) cc.copy(hz).lerp(hz2,u/.22); else cc.copy(hz2).lerp(zn,Math.pow((u-.22)/.78,.8)); gd[i*4]=cc.r*255; gd[i*4+1]=cc.g*255; gd[i*4+2]=cc.b*255; gd[i*4+3]=255; } skyTex.needsUpdate=true; }   // hazy pale horizon band, then a deepening blue
api.scene.background=skyTex; api.scene.userData.skyBackground=skyTex; sun.traverse(o=>{ if(o.isMesh) o.userData.skyOnly=true; });   // seen from outside the case the sun is an off-stage lamp: its disc shows only from inside   // the vitrine shows it from inside the case
let lastHr=-1;
// ---- visuals ----
const cms=meshes.map(m=>{const a=[];m&&m.traverse(o=>{if(o.isMesh&&o.userData.cloud)a.push(o);});return a;});   // volumetric clouds (js/gfx/clouds.js): grey and fade are shader uniforms
const vapPts=vap.children[0];
const NR=420, RD=[], rl=api.shape({kind:'particles',type:'streaks',count:NR,length:.17,width:.007}), RS=rl.userData.streaks; rainB.add(rl);   // velocity-aligned soft streaks (js/gfx/precip.js)
for(let i=0;i<NR;i++) RD.push({x:0,y:-1,z:0,v:4.5+api.rand()*1.5,c:i%2});
let fr=0, wetA=0, wetZ=HOME;
function sunDir(hr){ const el=Math.sin((hr-6)/12*Math.PI)*62, az=(hr-12)/12*140+AZ; return new T.Vector3().setFromSphericalCoords(1,(90-el)*Math.PI/180,az*Math.PI/180); }   // same sun path as the landscape light
api.onFrame((dt)=>{ dt=Math.min(dt,.1);
  meshes.forEach((m,k)=>{ const c=C[k]; if(!m) return; if(!c){ m.visible=false; m.position.set(PX,base0+2,HOME); return; } m.visible=true;
    const vis=Math.min(1,c.qc/.12+(c.over?.15:0)), sxz=.75+.22*Math.min(3,c.d/400), sy=Math.max(.35,Math.min(2.6,c.d/VS/.8));
    m.position.set(PX,Math.min(CAP,base0+(c.zb+c.d/2+c.L)/VS),c.z); m.scale.set(sxz,sy,sxz);
    const kk=api.clamp(c.qc/2.2,0,1); cms[k].forEach(o=>{ o.userData.cloud.set({grey:kk*.85,fade:.94*vis,storm:c.raining?Math.min(.6,c.rk*.6):0}); o.visible=vis>.02; });
    c.rk+=((c.raining?Math.min(1,.35+(c.qc-.8)):0)-c.rk)*Math.min(1,dt*3); });
  parcel.position.copy(pp);
  // rain: streaks from each raining cloud's base to the ground under it
  const rk=Math.max(...C.map(c=>c?c.rk:0)); rl.visible=rk>.02; rl.material.opacity=.6*Math.min(1,rk+.2);
  { const c=C.filter(Boolean).sort((a,b)=>b.rk-a.rk)[0]; if(c&&rk>.05) wetZ+=(c.z-wetZ)*Math.min(1,dt*.8); wetA=Math.max(0,Math.min(1,wetA+dt*(rk*.35-.012))); api.scene.userData.aaaWet={g:0,rain:rk,x:PX,z:wetZ,r:1.6,a:wetA}; }   // visuals: where the rain falls the ground darkens, puddles form and dry slowly
  { const c=C.filter(Boolean).sort((a,b)=>b.rk-a.rk)[0]; rainB.position.set(PX,0,c?c.z:HOME); rl.position.set(-PX,0,-(c?c.z:HOME)); }
  if(rl.visible){ const a=RS.pos;
    for(let i=0;i<NR;i++){ const s=RD[i], c=C[s.c]; if(!c||c.rk<.02){ a[i*3+1]=-50; continue; }
      const yTop=Math.min(CAP-.6,base0+(c.zb+c.L)/VS-.1); s.y-=dt*s.v; const g=Math.max(base0,hAt(s.x,s.z));
      if(s.y<g||s.y>yTop||Math.abs(s.z-c.z)>1){ s.x=PX+(api.rand()-.5)*.9; s.z=c.z+(api.rand()-.5)*1.6; s.y=g+api.rand()*(yTop-g); }
      a[i*3]=s.x;a[i*3+1]=s.y;a[i*3+2]=s.z; }
    RS.commit(NR); }
  // vapour motes: rise from the lake to the cloud base, drift with the wind; fainter as evaporation falls
  if(vapPts&&vapPts.geometry){ const a=vapPts.geometry.attributes.position, top=zb/VS, w=api.param('wind');
    for(let i=0;i<a.count;i++){ let y=a.getY(i)+dt*(.12+.5*Math.min(1.5,heat())); let z=a.getZ(i)-dt*w*.03; if(y>top){y=0;z=(api.rand()-.5)*2.6;} if(z<-1.3) z+=2.6; a.setY(i,y); a.setZ(i,z); }
    a.needsUpdate=true; vapPts.material.opacity=.08+.5*Math.min(1,Emm/3); }
  const sd=sunDir(api.param('hour')).multiplyScalar(11.5); sun.position.set(sd.x,Math.max(.6,sd.y),sd.z);   // outside the glass case: a warm lamp in the studio, not a disc floating inside the case
  { const hr=api.param('hour'); if(hr!==lastHr){ lastHr=hr; paintSky(Math.max(0,Math.sin((hr-6)/12*Math.PI))); const cab=api.body('house'); if(cab&&cab.userData.cabin) cab.userData.cabin.setGlow(api.clamp((hr-16.5)/2.5,0,1)); } if(dome) dome.visible=false; }   // evening: the cabin's windows glow
  const w=api.param('wind'), lift0=Math.PI/2*Math.min(1,w/7)*.95; api.scene.userData.wind=[w*.12,-w*.42];   // grass, reeds, trees and the lake's waves follow the wind
  { const rv=api.body('stream'); if(rv&&rv.userData.river) rv.userData.river.setFlow(.35+.5*Math.min(1,rainSlope/2)); }   // runoff: rain on the ridge swells the stream and its waterfall pivot.rotation.set(Math.PI+lift0+Math.sin(api.time()*7)*.05*Math.min(1,w/3),0,0);
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
api.camera({target:[.3,1.5,.1],r:14.2,ph:1.18,th:.5,fov:34});   // the water axis (massif → waterfall → stream → lake at the cut front edge) runs toward the viewer   // a longer lens: a miniature world, not a toy table (realism-playbook R12)`,
  lessons: [
    { title: 'Heat the lake', question: 'What lifts water out of the lake?', text: 'Turn the sunshine up. Watch how the vapour rises faster from the lake, and watch three readouts: the lake-air temperature, the saturation vapour pressure e_s, and the evaporation rate.', set: { sun: 1.4 }, focus: 'lake', shot: 'push', isolate: ['sun', 'lake', 'vapour'], until: 'event:has warmed to', run: 30, explain: 'Stronger sunshine warms the lake air from 22.2 to 28.7 °C. The saturation vapour pressure e_s rises from 26.6 to 39.2 hPa, about 6 % per kelvin: the Clausius–Clapeyron rate (Koutsoyiannis 2012). Evaporation is driven by the gap between e_s and the vapour already in the air, so it more than doubles, from 1.4 to 3.4 mm a day. Saturation is a property of water at a given temperature. It is not a capacity of the air.', opens: 'Where does the vapour go?' },
    { title: 'Ride a parcel of air', question: 'Where does the vapour go?', text: 'You are now inside one parcel of moist lake air as it rises. Look up: the cloud base is above you. Wait until the parcel reaches its dew point.', focus: 'parcel', shot: 'pov', pov: 'Air parcel', until: 'event:parcel reaches its dew point', run: 40, explain: 'Rising air expands and cools by 9.8 K per kilometre while it is unsaturated. Its dew point falls only about 1.8 K per kilometre, so the gap between them closes by about 8 K per kilometre. The parcel therefore saturates about 125 m higher for every kelvin of gap at the ground (Espy). Here the lake air is at 28.9 °C with a dew point of 25.4 °C, a gap of 3.5 K, so condensation starts near 436 m, at 24.7 °C. There the vapour condenses on tiny aerosol particles into cloud droplets.', opens: 'Why does the rain fall on the ridge and not on the lake?' },
    { title: 'Wind to the ridge', question: 'Why does the rain fall on the ridge and not on the lake?', text: 'Raise the wind. The cloud drifts from the lake to the ridge and climbs its windward slope. Watch the cloud water readouts and wait for rain.', set: { wind: 6 }, focus: 'cloud', shot: 'medium', until: 'event:windward slope', run: 35, explain: 'Over the lake the cloud held only about 0.2–0.3 g of droplets per kg of air, too little to rain. Forced 329 m up the slope, it cooled from about 24.1 to 22.7 °C, along the moist adiabat: about 4 K per km in warm, wet air, because condensing vapour releases latent heat. Each kelvin of cooling lowers e_s by about 6 %, so more vapour condenses. Once the droplets pass 1 g per kg, this model lets them grow into falling drops: orographic rain (Roe 2005).', opens: 'What happens to the air beyond the crest?' },
    { title: 'Over the crest', question: 'What happens to the air beyond the crest?', text: 'First ride the path that a parcel of the cloud\'s air will take over the crest of the ridge and down its far side. Then follow the cloud itself and wait for the rain shadow.', focus: 'cloud', track: 'parcel', until: 'event:rain shadow', run: 45, explain: 'Sinking air is compressed and warms. Once its droplets have evaporated it warms at the dry rate of 9.8 K per km, faster than it cooled on the way up while it was condensing. It also left water on the windward slope as rain. Brought back to valley level it is 30.6 °C, 1.7 K warmer than when it set out: each gram of water rained out per kg of air leaves 2.5 K of latent heat behind. The far valley gets dry, warm air: a rain shadow, and in strong cases a föhn wind.', opens: 'Can a cloud rain without a ridge?' },
    { title: 'Calm air', question: 'Can a cloud rain without a ridge?', text: 'Drop the wind almost to zero. The sun keeps heating the lake; its vapour rises in parcels of air that feed the next cloud, which stays over the warm lake and grows deeper. Watch the cloud water over the lake and wait until rain falls back on the lake.', set: { wind: .3 }, focus: 'lake', shot: 'wide', chain: [{ a: 'sun', note: 'heats the lake' }, { a: 'lake', note: 'evaporates faster' }, { a: 'vapour', note: 'rises from the surface' }, { a: 'parcel', note: 'cools to its dew point' }, { a: 'cloud', note: 'condenses and grows deeper' }, { a: 'rain', note: 'falls back on the lake' }], chainPace: 1.1, until: 'event:falls back on the lake', run: 50, explain: 'Without wind, convection keeps feeding the same cloud, and it deepens to almost 1 km. Its upper part climbs further along the moist adiabat and holds more condensed water. Past 1 g per kg it rains back onto the lake, so the cycle closes locally. Across the planet the cycle does not close locally: each year about 40 000 km³ of water evaporated from the oceans is carried by the wind to fall on land, and rivers return it to the sea (Trenberth et al. 2007).', opens: 'What sets the pace of the whole cycle?' },
    { title: 'Evening', question: 'What sets the pace of the whole cycle?', text: 'Move the time of day to evening. With the sun low, watch the lake-air temperature, e_s and the evaporation rate fall.', set: { hour: 18.5 }, focus: 'sun', shot: 'wide', until: 'event:has cooled to', run: 45, explain: 'At 18:30 the sun gives almost no heat. The lake air cools to 10.2 °C, and e_s falls to 12.5 hPa, less than a third of its midday value. The air above the lake is now saturated, so evaporation stops and mist forms over the water. The sun powers the cycle: evaporating one kilogram of water takes about 2.45 MJ, and gravity brings the water back down.', opens: 'How will the cycle change as the climate warms, now that e_s rises about 6–7 % per kelvin?' }]
};

const people = (side, n, color, label) => Array.from({ length: n }, (_, i) => ({ id: side + i, name: label.replace(/s$/, '') + ' ' + (i + 1), label: i === 0 ? label : undefined, role: i === 0 ? 'actor' : 'decor', describe: i === 0 ? (side === 'b' ? 'Each buyer holds a card with the most they would pay: 9, 8, … down to 2.' : 'Each seller holds a card with their cost: 1, 2, … up to 8.') : '', shape: { kind: 'person', h: 1, color }, position: [(side === 'b' ? -1 : 1) * (1.7 + (i % 4) * .62), 0, .55 + Math.floor(i / 4) * .8 + (i % 2) * .12], rotation: [0, side === 'b' ? 140 : -140, 0] }));
export const MARKET = {
  type: 'scene', title: 'A market finds its price', technique: 'card',
  environment: { preset: 'landscape', time: 16.5, azimuth: -8 },
  bodies: [
    { id: 'square', name: 'Market square', role: 'decor', shape: { kind: 'disc', r: 6.5 }, material: { preset: 'stone', color: '#c4bbab' }, position: [0, .01, 0] },
    { id: 'board', name: 'Chalkboard', label: 'Demand and supply curves', role: 'actor', describe: 'Left: the staircases of buyers willing to buy (blue) and sellers willing to sell (red) at each price. Right: the price of every trade, in order.', shape: { kind: 'box', w: 6.4, h: 3.6, d: .1, round: .02 }, material: { preset: 'chalk', color: '#26332c' }, position: [0, 3.35, -3.5] },
    { id: 'boardframe', name: 'Board frame', role: 'decor', shape: { kind: 'box', w: 6.62, h: 3.82, d: .07, round: .02 }, material: { preset: 'darkwood' }, position: [0, 3.35, -3.56] },
    { id: 'legL', name: 'Board leg', role: 'decor', shape: { kind: 'box', w: .14, h: 5.2, d: .14, round: .02 }, material: { preset: 'darkwood' }, position: [-3.2, 2.6, -3.62] },
    { id: 'legR', name: 'Board leg', role: 'decor', shape: { kind: 'box', w: .14, h: 5.2, d: .14, round: .02 }, material: { preset: 'darkwood' }, position: [3.2, 2.6, -3.62] },
    { id: 'tDemand', name: 'Chalk label', role: 'decor', shape: { kind: 'text', text: 'demand', w: .9, h: .25, color: '#9cc2ff' }, position: [-1.55, 4.7, -3.43] },
    { id: 'tSupply', name: 'Chalk label', role: 'decor', shape: { kind: 'text', text: 'supply', w: .8, h: .25, color: '#ffab94' }, position: [-.75, 4.7, -3.43] },
    { id: 'tTrades', name: 'Chalk label', role: 'decor', shape: { kind: 'text', text: 'price of each trade', w: 1.9, h: .25, color: '#ece4cf' }, position: [1.6, 4.85, -3.43] },
    { id: 'stall', name: 'Stall', label: 'The stall · where trades happen', role: 'actor', describe: 'A buyer and a seller whose offers meet trade here, one unit each, at the price on the table.', shape: { kind: 'table', w: 2.6, d: 1, h: .9 }, position: [0, 0, -1.45] },
    { id: 'awning', name: 'Awning', role: 'decor', shape: { kind: 'box', w: 2.9, h: .07, d: 1.5, round: .01 }, material: { preset: 'fabric', color: '#b8392b' }, position: [0, 1.95, -1.45], rotation: [-8, 0, 0] },
    { id: 'post1', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [-1.35, .97, -.85] },
    { id: 'post2', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [1.35, .97, -.85] },
    { id: 'post3', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [-1.35, .97, -2.05] },
    { id: 'post4', name: 'Post', role: 'decor', shape: { kind: 'cylinder', r: .03, h: 1.95 }, material: { preset: 'darkwood' }, position: [1.35, .97, -2.05] },
    { id: 'crate1', name: 'Crate of apples', role: 'decor', shape: { kind: 'box', w: .6, h: .3, d: .4, round: .02 }, material: { preset: 'wood' }, position: [-.6, 1.09, -1.55] },
    { id: 'crate2', name: 'Crate of apples', role: 'decor', shape: { kind: 'box', w: .6, h: .3, d: .4, round: .02 }, material: { preset: 'wood' }, position: [.55, 1.09, -1.6], rotation: [0, 12, 0] },
    { id: 'pole', name: 'Price pole', role: 'decor', shape: { kind: 'cylinder', r: .035, h: 3.6 }, material: { preset: 'brass' }, position: [2.2, 1.8, -1.0] },
    { id: 'polebase', name: 'Pole base', role: 'decor', shape: { kind: 'cylinder', r: .22, rt: .16, h: .1 }, material: { preset: 'darkwood' }, position: [2.2, .05, -1.0] },
    { id: 'price', name: 'Price', label: 'Price · the last trade', role: 'actor', describe: 'Its height on the pole is the price of the latest trade (0 at the foot, 12 at the top). The blue ring is the best bid, the red ring the best ask.', shape: { kind: 'coin', r: .24 }, position: [2.2, 1, -1.0], rotation: [90, 0, 0] },
    { id: 'bidring', name: 'Best bid', role: 'decor', shape: { kind: 'torus', R: .13, r: .025 }, material: { preset: 'plastic', color: '#4f8ad0' }, position: [2.2, .5, -1.0], rotation: [90, 0, 0] },
    { id: 'askring', name: 'Best ask', role: 'decor', shape: { kind: 'torus', R: .13, r: .025 }, material: { preset: 'plastic', color: '#d0553c' }, position: [2.2, 3, -1.0], rotation: [90, 0, 0] },
    ...people('b', 8, '#4f8ad0', 'Buyers'), ...people('s', 8, '#d0553c', 'Sellers'),
    { id: 'lampL', name: 'Street lamp', role: 'decor', shape: { kind: 'lamp', h: 2.4 }, position: [-4.6, 0, -2.4] },
    { id: 'barrel', name: 'Barrel', role: 'decor', shape: { kind: 'cylinder', r: .32, rt: .28, rb: .28, h: .8 }, material: { preset: 'darkwood' }, position: [3.9, .4, 2.5] },
    { id: 'crates', name: 'Crates', role: 'decor', shape: { kind: 'box', w: .9, h: .55, d: .7, round: .03 }, material: { preset: 'wood' }, position: [-4.5, .275, 3.4], rotation: [0, 20, 0] },
    { id: 'crates2', name: 'Crates', role: 'decor', shape: { kind: 'box', w: .7, h: .45, d: .6, round: .03 }, material: { preset: 'wood' }, position: [-4.4, .775, 3.35], rotation: [0, 35, 0] },
    ...trees([[4.9, -2.4, 1.7], [-5.2, .6, 1.5], [5.4, 1.4, 1.3]])
  ],
  tour: ['price', 'b0', 's0', 'stall', 'board'],
  params: [
    { key: 'open', label: 'market open (1) or closed (0)', min: 0, max: 1, value: 1 },
    { key: 'income', label: "buyers' extra income (adds to every value)", min: 0, max: 3, value: 0 },
    { key: 'cost', label: "sellers' extra cost (adds to every cost)", min: 0, max: 3, value: 0 },
    { key: 'rule', label: 'budget rule: never trade at a loss (1 on, 0 off)', min: 0, max: 1, value: 1 },
    { key: 'pace', label: 'offers per second', min: 1, max: 10, value: 3 }],
  shots: {
    'where the curves cross': { dist: 4.5 },
    'closes': { target: [0, 3.3, -3.4], dist: 10 },
    'market opens': { target: [0, 1.0, -.6], dist: 9 },
    'new cards': { target: [0, 3.3, -3.4], dist: 10 }
  },
  flows: {
    'random offers': [{ from: [-2.4, 1.2, .9], to: [-.5, 1.1, -.8], label: 'bids, never above the card' }, { from: [2.4, 1.2, .9], to: [.5, 1.1, -.8], label: 'asks, never below the cost' }],
    'curves cross': [{ from: [1.5, 2.6, -3.38], to: [2.6, 3.1, -3.38], label: 'later trades close in on the crossing' }],
    'at a loss': [{ from: [-2.4, 1.2, .9], to: [-.5, 1.1, -.8], label: 'bids above the card' }, { from: [2.4, 1.2, .9], to: [.5, 1.1, -.8], label: 'asks below the cost' }]
  },
  code: `const T=api.THREE, V=(x,y,z)=>new T.Vector3(x,y,z), f2=v=>v.toFixed(2), PMAX=12, NB=8;
// ---- traders: buyer i values the good at 9 − i (+ income), seller j's cost is 1 + j (+ cost) ----
const B=[], S=[]; for(let i=0;i<NB;i++){ const b=api.body('b'+i), s=api.body('s'+i); B.push({o:b,home:b.position.clone(),r0:b.rotation.y,to:b.position.clone(),active:true}); S.push({o:s,home:s.position.clone(),r0:s.rotation.y,to:s.position.clone(),active:true}); }
const val=i=>9-i+api.param('income'), cst=j=>1+j+api.param('cost');
function equilibrium(){ const v=B.map((_,i)=>val(i)).sort((a,b)=>b-a), c=S.map((_,j)=>cst(j)).sort((a,b)=>a-b); let q=0, gain=0; while(q<NB&&v[q]>=c[q]){ gain+=v[q]-c[q]; q++; }
  const lo=Math.max(q?c[q-1]:0,q<NB?v[q]:0), hi=Math.min(q?v[q-1]:PMAX,q<NB?c[q]:PMAX); return {q,p:(lo+hi)/2,lo,hi,gain}; }
let EQ=equilibrium();
// ---- the double auction (Smith 1962; zero-intelligence traders as in Gode & Sunder 1993) ----
let period=0, bid=null, ask=null, trades=[], all=[], idle=0, acc=0, pause=0, crossSaid=false, lastOpen=api.param('open'), lastKey='', lastRule=api.param('rule');
function startPeriod(){ period++; bid=ask=null; trades=[]; idle=0; crossSaid=false; B.forEach(t=>{t.active=true;t.to.copy(t.home);}); S.forEach(t=>{t.active=true;t.to.copy(t.home);}); }
function closePeriod(){ const n=trades.length, gain=trades.reduce((s,t)=>s+t.v-t.c,0), mp=n?trades.reduce((s,t)=>s+t.p,0)/n:NaN;
  api.event('Period '+period+' closes: '+n+' trades, mean price '+(n?f2(mp):'—')+' (the curves cross at '+f2(EQ.p)+'), '+(EQ.gain>0?Math.round(100*gain/EQ.gain):0)+' % of the possible gains from trade',V(0,3.3,-3.4),{id:'period',sound:'step-done'}); pause=2.5; }
function trade(bi,sj,p){ const b=B[bi], s=S[sj], n=trades.length; b.active=s.active=false; b.to.set(-.3-.32*n,0,-.62); s.to.set(.3+.32*n,0,-.62);
  const t={p,v:val(bi),c:cst(sj),period}; trades.push(t); all.push(t); if(all.length>30) all.shift(); bid=ask=null; idle=0; dotsDirty=true;
  if(!crossSaid&&Math.abs(p-EQ.p)<=.25&&api.param('rule')>.5){ crossSaid=true; api.event('A trade at '+f2(p)+' lands within 0.25 of where the curves cross ('+f2(EQ.p)+')',dotPos(all.length-1),{id:'cross',sound:'chime'}); } }
function offer(){ const rule=api.param('rule')>.5, bl=B.map((t,i)=>t.active?i:-1).filter(i=>i>=0), sl=S.map((t,j)=>t.active?j:-1).filter(j=>j>=0);
  if(!bl.length||!sl.length||(rule&&!bl.some(i=>sl.some(j=>val(i)>=cst(j))))||idle>60){ closePeriod(); return; }
  idle++;
  if(api.rand()<.5){ const i=bl[Math.floor(api.rand()*bl.length)], b=rule?api.rand()*val(i):api.rand()*PMAX;     // a buyer bids at random, never above the card when the rule is on
    if(ask&&b>=ask.p) trade(i,ask.j,ask.p); else if(!bid||b>bid.p) bid={p:b,i}; }
  else { const j=sl[Math.floor(api.rand()*sl.length)], a=rule?cst(j)+api.rand()*(PMAX-cst(j)):api.rand()*PMAX;  // a seller asks at random, never below the cost when the rule is on
    if(bid&&a<=bid.p) trade(bid.i,j,bid.p); else if(!ask||a<ask.p) ask={p:a,j}; } }
api.onStep((h)=>{
  const open=api.param('open')>.5, key=api.param('income').toFixed(2)+'/'+api.param('cost').toFixed(2), rule=api.param('rule')>.5;
  if(key!==lastKey){ const first=lastKey===''; lastKey=key; EQ=equilibrium(); chartDirty=true; if(!first){ api.event('New cards: values and costs have changed; the curves now cross at p = '+f2(EQ.p)+', where '+EQ.q+' units can trade',V(-1.6,3.3,-3.4),{id:'cards',sound:'paper'}); if(open){ startPeriod(); } } }
  if(rule!==(lastRule>.5)){ lastRule=rule?1:0; if(open){ api.event(rule?'Budget rule back on: nobody may trade at a loss':'Budget rule off: traders may now bid above their card or ask below their cost, and trade at a loss',V(0,1.2,-1),{id:'rule'}); startPeriod(); } }
  if(open!==(lastOpen>.5)){ lastOpen=open?1:0; if(open){ period=0; all=[]; dotsDirty=true; startPeriod(); api.event('The bell rings: the market opens for period 1',V(0,1.2,-1),{id:'open',sound:'chime'}); } else { bid=ask=null; B.forEach(t=>t.to.copy(t.home)); S.forEach(t=>t.to.copy(t.home)); } }
  if(!open) return;
  if(pause>0){ pause-=h; if(pause<=0) startPeriod(); return; }
  acc+=h*api.param('pace'); while(acc>=1&&pause<=0){ acc-=1; offer(); } });
if(api.param('open')>.5) startPeriod();
// ---- the chalkboard: staircases on the left, the price of each trade on the right ----
const Z=-3.44, ox=-2.95, oy=1.8, sx=2.55/NB, sy=3.0/PMAX, rx0=.15, rx1=2.95;
const strips=(segs,w,col)=>{ const pos=[], idx=[]; segs.forEach(([x0,y0,x1,y1])=>{ const dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1, nx=-dy/L*w, ny=dx/L*w, k=pos.length/3; pos.push(x0+nx,y0+ny,Z, x0-nx,y0-ny,Z, x1+nx,y1+ny,Z, x1-nx,y1-ny,Z); idx.push(k,k+1,k+2,k+1,k+3,k+2); });
  const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeBoundingBox(); const m=new T.Mesh(g,new T.MeshBasicMaterial({color:col,transparent:true,opacity:.9,depthWrite:false})); m.renderOrder=5; m.name='chalk lines'; return m; };
let chart=null, chartDirty=true, dotsDirty=true;
function drawChart(){ if(chart){ chart.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); chart.removeFromParent(); } chart=new T.Group(); chart.name='chalk drawing';
  const v=B.map((_,i)=>val(i)).sort((a,b)=>b-a), c=S.map((_,j)=>cst(j)).sort((a,b)=>a-b), X=q=>ox+q*sx, Y=p=>oy+Math.min(PMAX,p)*sy, d=[], s=[];
  for(let q=0;q<NB;q++){ d.push([X(q),Y(v[q]),X(q+1),Y(v[q])]); if(q<NB-1) d.push([X(q+1),Y(v[q]),X(q+1),Y(v[q+1])]); s.push([X(q),Y(c[q]),X(q+1),Y(c[q])]); if(q<NB-1) s.push([X(q+1),Y(c[q]),X(q+1),Y(c[q+1])]); }
  const ax=[[ox,oy,ox+NB*sx,oy],[ox,oy,ox,oy+PMAX*sy],[rx0,oy,rx1,oy],[rx0,oy,rx0,oy+PMAX*sy]]; for(let p=0;p<=PMAX;p+=2) ax.push([ox-.06,Y(p),ox,Y(p)],[rx0-.06,Y(p),rx0,Y(p)]);
  const eq=[]; for(let x=ox;x<rx1;x+=.16) eq.push([x,Y(EQ.p),Math.min(rx1,x+.09),Y(EQ.p)]);
  chart.add(strips(ax,.008,0xe8e2d0), strips(d,.016,0x8fb8ff), strips(s,.016,0xff9a80), strips(eq,.012,0xffd27a)); api.world.add(chart); chartDirty=false; }
const dots=new T.InstancedMesh(new T.CircleGeometry(.055,16),new T.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false}),30); dots.count=0; dots.renderOrder=6; dots.frustumCulled=false; dots.name='trade prices'; api.world.add(dots);
const dotPos=i=>V(rx0+.12+i*(rx1-rx0-.2)/29,oy+Math.min(PMAX,all[i]?all[i].p:0)*sy,Z+.002);
const gold=new T.Color(0xffd27a), dim=new T.Color(0x8a7650), m4=new T.Matrix4();
const coin=api.body('price'), bidR=api.body('bidring'), askR=api.body('askring'), PY=p=>.15+Math.min(PMAX,p)*.28;
api.onFrame((dt)=>{ dt=Math.min(dt,.1);
  if(chartDirty) drawChart();
  if(dotsDirty){ all.forEach((t,i)=>{ m4.makeTranslation(...dotPos(i).toArray()); dots.setMatrixAt(i,m4); dots.setColorAt(i,t.period===period?gold:dim); }); dots.count=all.length; dots.instanceMatrix.needsUpdate=true; if(dots.instanceColor) dots.instanceColor.needsUpdate=true; dots.computeBoundingBox&&all.length&&dots.computeBoundingBox(); dotsDirty=false; }
  const last=all.length?all[all.length-1].p:EQ.p; coin.position.y+=(PY(last)-coin.position.y)*Math.min(1,dt*4); coin.rotation.z+=dt*1.2;
  bidR.visible=!!bid; askR.visible=!!ask; if(bid) bidR.position.y+=(PY(bid.p)-bidR.position.y)*Math.min(1,dt*6); if(ask) askR.position.y+=(PY(ask.p)-askR.position.y)*Math.min(1,dt*6);
  [...B,...S].forEach(t=>{ const d=t.to.clone().sub(t.o.position); d.y=0; const L=d.length(); if(L>.01){ const st=Math.min(L,dt*1.6); t.o.position.addScaledVector(d.normalize(),st); t.o.rotation.y=Math.atan2(d.x,d.z); t.o.position.y=Math.abs(Math.sin(api.time()*9))*.04; } else { t.o.position.y=0; t.o.rotation.y+=((t.active?t.r0:Math.PI)-t.o.rotation.y)*Math.min(1,dt*3); } }); });
const gains=()=>trades.reduce((s,t)=>s+t.v-t.c,0);
api.readout('period',()=>api.param('open')>.5?String(period):'market closed');
api.readout('trades this period',()=>trades.length+' (at the crossing: '+EQ.q+')');
api.readout('last trade price',()=>all.length?f2(all[all.length-1].p):'—');
api.readout('mean price this period',()=>trades.length?f2(trades.reduce((s,t)=>s+t.p,0)/trades.length):'—');
api.readout('price where the curves cross',()=>f2(EQ.p));
api.readout('share of the possible gains',()=>EQ.gain>0?Math.round(100*gains()/EQ.gain)+' % (max gain '+EQ.gain+')':'—');
api.readout('best bid / best ask',()=>(bid?f2(bid.p):'—')+' / '+(ask?f2(ask.p):'—'));
api.readout('budget rule',()=>api.param('rule')>.5?'on (no trade at a loss)':'off');
api.plot('trade price',()=>all.length?all[all.length-1].p:NaN);
// late-afternoon sky: the landscape dome shows only haze below the horizon, so a painted gradient replaces it behind the square
{ const dome=api.scene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.turbidity); if(dome) api.onFrame(()=>{ dome.visible=false; });   // every frame: the materialiser restores the background objects when it finishes
  const n=64, d=new Uint8Array(n*4), a=new T.Color('#f0dcb4'), b=new T.Color('#9cbbe0'), c=new T.Color(); for(let i=0;i<n;i++){ c.copy(a).lerp(b,Math.pow(i/(n-1),.7)); d[i*4]=c.r*255; d[i*4+1]=c.g*255; d[i*4+2]=c.b*255; d[i*4+3]=255; }
  const tx=new T.DataTexture(d,1,n); tx.colorSpace=T.SRGBColorSpace; tx.magFilter=tx.minFilter=T.LinearFilter; tx.needsUpdate=true; api.scene.background=tx; }
api.camera({target:[0,2.0,-.7],r:12.4,ph:1.2,th:.3});`,
  lessons: [
    { title: 'Cards before trading', question: 'At what price should trade happen?', text: 'The market is closed. Each buyer holds a card with the most they would pay: 9, 8, 7, down to 2. Each seller holds a card with their cost: 1, 2, 3, up to 8. On the board the blue staircase counts the buyers willing to buy at each price, and the red staircase counts the sellers willing to sell. Find where the curves cross.', set: { open: 0, income: 0, cost: 0, rule: 1 }, focus: 'board', shot: 'medium', run: 10, explain: 'The staircases cross at p = 5. At that price five buyers want to buy and five sellers want to sell; the fifth pair, value 5 and cost 5, gains nothing. Trading every unit whose value exceeds its cost gives the largest total gain possible: 8 + 6 + 4 + 2 = 20. At any lower price buyers outnumber sellers, and at any higher price sellers outnumber buyers.', opens: 'Can traders who know nothing find that price?' },
    { title: 'Open the market', question: 'Can traders who know nothing find that price?', text: 'Open the market. Traders now shout random offers: a buyer bids any price up to their card, and a seller asks any price above their cost. When a bid meets an ask, the two trade at the price already on the table. Watch the price coin and the gold dots on the board until the period closes.', set: { open: 1 }, focus: 'stall', shot: 'push', until: 'event:period 1 closes', run: 60, explain: 'These are zero-intelligence traders: no memory, no strategy, and no knowledge of the curves (Gode & Sunder 1993). Even so, a period usually ends with 4–5 trades at an average price near 5, capturing most of the possible gain. Over thousands of simulated periods the median is 95 % of the gain and the middle 80 % of period averages lie between 4.4 and 5.9. The double-auction rules, together with the ban on trading at a loss, do most of the work.', opens: 'Do the prices settle at the crossing?' },
    { title: 'Close to the crossing', question: 'Do the prices settle at the crossing?', text: 'Look closely at the board. Each gold dot is one trade, in order. Watch the next dots: early trades scatter, later ones close in on the dashed line where the curves cross.', focus: 'board', shot: 'close', until: 'event:where the curves cross', run: 60, explain: 'The first trade of a period typically lands about 0.7 away from 5 and the last about 0.05 away (medians over simulated periods). The traders with the highest values and lowest costs trade first, at scattered prices. As they leave, the remaining traders\' ranges overlap only near 5, so later prices are squeezed towards the crossing. Smith (1962) saw human traders in the first classroom double auctions converge on the predicted price within a few periods.', opens: 'What happens when buyers get richer?' },
    { title: 'Buyers get richer', question: 'What happens when buyers get richer?', text: 'Give every buyer 2 more to spend. The buyers now bid higher at the stall, so the price climbs; on the board the blue staircase moves up, the crossing moves, and a new period starts. Watch the dots and the price coin until the period closes.', set: { income: 2 }, focus: 'board', shot: 'wide', chain: [{ a: 'Buyers', note: 'every card worth 2 more' }, { a: 'stall', note: 'higher bids meet the asks' }, { a: 'price', note: 'settles higher, near 6' }], chainPace: 1.2, until: 'event:closes', run: 60, explain: 'Every value rose by 2, so the blue staircase moved up. The curves now cross at p = 6, where 6 units can trade instead of 5. The period\'s mean price (in the log) moves up with it, near 6 on average. A rise in demand raises both the equilibrium price and the quantity traded.', opens: 'What happens when costs rise?' },
    { title: 'Costs rise', question: 'What happens when costs rise?', text: 'Now raise every seller\'s cost by 2. The sellers now ask more at the stall, so the price rises; on the board the red staircase moves up and a new period starts. Watch where the dots and the price coin settle, and how many trades happen.', set: { cost: 2 }, focus: 'board', shot: 'wide', chain: [{ a: 'Sellers', note: 'every cost 2 higher' }, { a: 'stall', note: 'asks start higher' }, { a: 'price', note: 'settles near 7, fewer trades' }], chainPace: 1.2, until: 'event:closes', run: 60, explain: 'The curves now cross at p = 7, with only 5 units worth trading. Prices rise again, averaging about 6.9 per period in simulation, but fewer units change hands. A fall in supply raises the price and lowers the quantity.', opens: 'Is it the traders or the rules that make the market work?' },
    { title: 'Drop the budget rule', question: 'Is it the traders or the rules that make the market work?', text: 'Switch the budget rule off. Traders may now bid above their card or ask below their cost, and so trade at a loss. Watch the dots and the price coin scatter, and read the share of the possible gains when the period closes.', set: { rule: 0 }, focus: 'stall', shot: 'medium', until: 'event:closes', run: 60, explain: 'Without the rule every trader eventually trades, including buyers whose cards lie below the crossing and sellers whose costs lie above it. Their losses cancel most of the gains: here exactly 40 % remains (gain 8 of a possible 20, with these cards), and prices scatter around 6, the middle of the 0–12 range. The same random traders reach about 95 % with the rule on. As Gode & Sunder (1993) found, the constraint, a rule of the market, not the traders\' intelligence, lifts efficiency close to 100 %.', opens: 'Would human traders, who learn and remember, reach the equilibrium faster or more reliably than these random ones?' }]
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
    'like a coin flip': [{ from: [0, 6.25, .3], to: [.25, 5.8, .3], label: 'right with probability p' }, { from: [0, 6.25, .3], to: [-.25, 5.8, .3], label: 'left with 1 − p' }],
    '150 beads': [{ from: [-2.4, 3.3, .3], to: [-.6, 2.0, .3], label: 'few paths reach the edges' }, { from: [0, 3.6, .3], to: [0, 2.3, .3], label: 'most paths end near N·p' }],
    'pile build up': [{ from: [0, 5.2, .3], to: [1.6, 2.6, .3], label: 'the pile drifts towards N·p' }]
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
let counts=new Array(N+1).fill(0), landed=0, said=false, lastP=api.param('p'), lastRate=api.param('rate'), acc=0, leadCool=0;
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
  if(Math.abs(api.param('p')-lastP)>.005||Math.abs(api.param('rate')-lastRate)>.5){ lastP=api.param('p'); lastRate=api.param('rate'); counts.fill(0); landed=0; said=false; api.event('The bins are emptied for a new run: p = '+f2(lastP)+', '+Math.round(lastRate)+' beads per second',new T.Vector3(0,binY+.5,Z),{id:'reset',sound:'pour'}); }
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
    { title: 'Let the beads fall', question: 'What shape do many beads make?', text: 'Open the funnel wider (12 beads a second); the bins are emptied first. Each bead from the funnel makes one left-or-right choice at every row of pegs and lands in one of the bins. Watch them fill until 150 beads have landed, and compare the mean bin and the spread with the theory readouts and the bell curve.', set: { rate: 12 }, focus: 'bins', shot: 'push', chain: [{ a: 'funnel', note: 'every bead starts at the centre' }, { a: 'pegs', note: '10 coin flips per bead' }, { a: 'bins', note: 'bin k: k right-bounces' }, { a: 'curve', note: 'binomial ≈ normal' }], chainPace: 1.2, until: 'event:150 beads', run: 50, explain: 'The count of right-bounces in N independent flips follows the binomial distribution: mean N·p = 5 bins, spread √(Np(1−p)) = 1.58 bins. After 150 beads the measured mean should sit within about 0.13 of 5 (the standard error 1.58/√150). The pile is already close to the gold normal curve: de Moivre–Laplace, the first central limit theorem (Le Cam 1986).', opens: 'What happens if the pegs favour one side?' },
    { title: 'Bias the pegs', question: 'What happens if the pegs favour one side?', text: 'Make right-bounces likelier (p = 0.75). The bins are emptied and refilled. Watch the pile build up to the right of centre until 150 beads have landed.', set: { p: .75 }, focus: 'bins', shot: 'medium', isolate: ['pegs', 'bins', 'curve'], until: 'event:150 beads', run: 50, explain: 'With p = 0.75 the mean moves to N·p = 7.5 and the spread shrinks to √(10 × 0.75 × 0.25) = 1.37 bins. The pile is lopsided, with a longer tail towards the left: no bin above 10 exists to balance it. The normal curve fits less well when N·p(1−p) is small (here 1.9); a common rule of thumb asks for at least 5–10.', opens: 'What do more rows do?' },
    { title: 'More rows', question: 'What do more rows do?', text: 'Add rows (N = 14) and set p back to 0.5. The board rebuilds with narrower bins. Watch the new bell grow until 150 beads have landed.', set: { rows: 14, p: .5 }, focus: 'curve', shot: 'medium', until: 'event:150 beads', run: 60, explain: 'With 14 flips the mean is 7 and the spread √(14 × 0.25) = 1.87 bins: wider than with 10 rows. But relative to the 14-bin range it is narrower: 1.87/14 = 0.13 against 1.58/10 = 0.16. Sums of many independent nudges spread out like √N while their range grows like N, so the bell sharpens relative to the board. That is the central limit theorem at work.', opens: 'How good is the normal curve for the centre bin?' },
    { title: 'Read the centre bin', question: 'How good is the normal curve for the centre bin?', text: 'Look closely at the bins near the middle and read the share of beads in bin N·p, with the binomial and normal predictions next to it.', focus: 'bins', shot: 'close', run: 15, explain: 'For N = 14 the exact binomial share of the centre bin is C(14,7)/2^14 = 3432/16384 = 20.9 %. The normal curve gives 1/√(2π·N·p(1−p)) = 21.3 %. With a few hundred beads the measured share still wobbles by about 2 percentage points around them (the standard error √(0.21 × 0.79 / n)); more beads shrink that wobble like 1/√n. The curve is an approximation that gets better as N grows (Galton 1889 built the board to show it).', opens: 'Why do sums of other independent random steps, not only coin flips, also make a bell?' }]
};

export const OSMOSIS = {
  type: 'scene', title: 'Osmosis across a semi-permeable membrane', technique: 'sweep',
  environment: { preset: 'lab' },
  bodies: [
    { id: 'slab', name: 'Tank base', role: 'decor', shape: { kind: 'box', w: 6.4, h: .12, d: 1.9, round: .02 }, material: { preset: 'plastic', color: '#2b3036' }, position: [0, .06, 0] },
    { id: 'tank', name: 'Glass tank', role: 'decor', shape: { kind: 'glasscase', w: 6, d: 1.6, h: 3.4 }, position: [0, .12, 0] },
    { id: 'membrane', name: 'Membrane', label: 'Semi-permeable membrane', role: 'actor', describe: 'Its pores let water molecules through but not the larger solute molecules.', shape: { kind: 'box', w: .07, h: 3.3, d: 1.56, round: 0 }, material: { preset: 'membrane', color: '#e0507a' }, position: [0, 1.77, 0] },
    { id: 'clampT', name: 'Membrane clamp', role: 'decor', shape: { kind: 'box', w: .16, h: .1, d: 1.66, round: .01 }, material: { preset: 'steel' }, position: [0, 3.47, 0] },
    { id: 'clampB', name: 'Membrane clamp', role: 'decor', shape: { kind: 'box', w: .16, h: .1, d: 1.66, round: .01 }, material: { preset: 'steel' }, position: [0, .17, 0] },
    { id: 'left', name: 'Left level', label: 'Pure water side · level', role: 'actor', describe: 'Water only.', shape: { kind: 'water', w: 2.95, d: 1.55, depth: 1.3 }, material: { preset: 'water', color: '#58b4d0' }, position: [-1.5, 1.42, 0] },
    { id: 'right', name: 'Right level', label: 'Solution side · level', role: 'actor', describe: 'Water plus dissolved solute.', shape: { kind: 'water', w: 2.95, d: 1.55, depth: 1.3 }, material: { preset: 'water', color: '#d8b070' }, position: [1.5, 1.42, 0] },
    { id: 'tracer', name: 'Tagged water molecule', label: 'Tagged water molecule', role: 'actor', describe: 'One water molecule marked so you can follow it, or ride it (POV).', shape: { kind: 'sphere', r: .075 }, material: { preset: 'plastic', color: '#b4f2ff', emissive: '#3cc6ee', emissiveIntensity: .6, roughness: .25 }, position: [-.6, .9, .2] },
    { id: 'piston', name: 'Piston', label: 'Piston · extra pressure on the solution', role: 'actor', describe: 'Pressing on the solution side pushes back against the osmotic flow.', shape: { kind: 'group' }, position: [1.5, 3.3, 0] },
    { id: 'plate', name: 'Piston plate', role: 'decor', parent: 'piston', shape: { kind: 'box', w: 2.86, h: .08, d: 1.5, round: .02 }, material: { preset: 'plastic', color: '#c9ced4' }, position: [0, .04, 0] },
    { id: 'rod', name: 'Piston rod', role: 'decor', parent: 'piston', shape: { kind: 'cylinder', r: .05, h: 1.6 }, material: { preset: 'chrome' }, position: [0, .84, 0] },
    { id: 'weight', name: 'Weight', role: 'decor', parent: 'piston', shape: { kind: 'cylinder', r: .32, h: .22 }, material: { preset: 'iron' }, position: [0, 1.75, 0] },
    { id: 'beaker', name: 'Beaker', role: 'decor', shape: { kind: 'beaker', r: .42, h: 1.0, fill: .6, liquid: '#d8b070' }, position: [-4.3, 0, 1.9] },
    { id: 'flask', name: 'Flask', role: 'decor', shape: { kind: 'flask', r: .5, h: 1.3, fill: .4, liquid: '#58b4d0' }, position: [4.4, 0, -1.4] },
    { id: 'notebook', name: 'Lab notebook', role: 'decor', shape: { kind: 'book', w: 1.2, h: 1.6, d: .12 }, material: { preset: 'leather', color: '#2c3e50' }, position: [4.0, .06, 2.4], rotation: [-90, 0, -18] }
  ],
  tour: ['membrane', 'left', 'right', 'tracer', 'piston'],
  // two scales: the apparatus at 1 unit = 10 cm (the levels and Δh in mm use it), and the drawn molecules (a water molecule,
  // r = 0.045 units, stands for one about 0.28 nm across: 1 unit ≈ 3.1 nm). The zoom's scale bar switches to the molecular
  // one once the view is narrower than 1.2 units, and says so.
  scale: { m: .1, micro: { m: 3.1e-9, below: 1.2, note: 'molecule size' } },
  params: [
    { key: 'solute', label: 'solute molecules', min: 0, max: 90, value: 45, rebuild: true },
    { key: 'T', label: 'temperature (thermal motion)', min: .3, max: 2, value: 1 },
    { key: 'pass', label: 'membrane permeability', min: .2, max: 1, value: .7 },
    { key: 'press', label: 'extra pressure on the solution', min: 0, max: 120, value: 0, unit: 'mm water' }],
  shots: {
    'net water flow': { target: [0, 1.0, .1], dist: 6 },
    'tagged water molecule': { dist: 4 },
    'osmotic equilibrium': { target: [0, 1.6, 0], dist: 9 },
    'reverse osmosis': { target: [.6, 1.6, 0], dist: 8 }
  },
  flows: {
    'net water flow': [{ from: [-1.0, .7, .9], to: [1.0, .7, .9], label: 'more water crosses into the solution' }],
    'osmotic equilibrium': [{ from: [2.6, 2.3, .9], to: [2.6, 1.4, .9], label: 'the extra height presses back' }, { from: [-1.0, .7, .9], to: [1.0, .7, .9], label: 'the solute side draws water' }],
    'reverse osmosis': [{ from: [1.5, 3.0, .9], to: [1.5, 2.0, .9], label: 'piston pressure' }, { from: [1.0, .7, .9], to: [-1.0, .7, .9], label: 'water squeezed back' }]
  },
  code: `const T=api.THREE, V=(x,y,z)=>new T.Vector3(x,y,z), rnd=api.rand, f0=v=>String(Math.round(v)), f2=v=>v.toFixed(2);
// scale: 1 unit = 10 cm. Each column's height is proportional to its number of water molecules (water does not compress).
const nW=400, nS=Math.round(api.param('solute')), Y0=.12, HV=1.3/(nW/2), K=.23, W=1.47, ZD=.7;
const wm=new T.InstancedMesh(new T.SphereGeometry(.045,10,8),api.material({preset:'plastic',color:'#4aa3ff'}),nW); wm.name='water molecules';
const sm=new T.InstancedMesh(new T.SphereGeometry(.11,14,10),api.material({preset:'plastic',color:'#ff9a3c'}),Math.max(1,nS)); sm.visible=nS>0; sm.name='solute molecules'; api.world.add(wm,sm);
const L=api.body('left'), R=api.body('right'), tr=api.body('tracer'), piston=api.body('piston');
let m=0, nL=nW/2, nR=nW/2, visL=nW/2, visR=nW/2, hL=nL*HV, hR=nR*HV, cLR=0, cRL=0, win=0, rate=[0,0], flowSaid=false, eqSaid=false, revSaid=false, ema=0, hist=[], netEma=0;
const P=[]; for(let i=0;i<nW;i++){ const l=i<nW/2; P.push({x:l?-.08-rnd()*2.8:.08+rnd()*2.8,y:Y0+.05+rnd()*(hL-.1),z:(rnd()-.5)*1.3,w:true}); }
for(let i=0;i<nS;i++) P.push({x:.2+rnd()*2.6,y:Y0+.08+rnd()*(hR-.2),z:(rnd()-.5)*1.2,w:false});
P.forEach(q=>q.side=q.x<0?-1:1);
api.label('Water molecules',()=>{ const q=P.find(q=>q.w&&q.side<0); return q?V(q.x,q.y,q.z):null; },'Small enough to pass the pores.');
if(nS) api.label('Solute molecules',()=>{ const q=P.find(q=>!q.w); return q?V(q.x,q.y,q.z):null; },'Too large for the pores: they stay on the right.');
const press=()=>api.param('press')/100;     // piston pressure as a water head, in scene units (1 unit = 100 mm)
const xw=()=>nR/(nR+nS);                    // mole fraction of water on the solution side
const dhEff=()=>(hR-hL)+press();          // hydrostatic head of the solution side plus the piston, in scene units
// a water molecule tries a pore: into the solution with weight e^(−KΔ); back out with x_w·e^(+KΔ). At balance −ln x_w = 2KΔ: the ideal-solution law (van 't Hoff when dilute).
const KAP=12;   // pore traffic: water molecules per second crossing each way through the wetted membrane when Δ = 0 and x_w = 1
const rates=()=>{ const k=KAP*api.param('pass')*Math.sqrt(api.param('T')), d=dhEff(); return [k*Math.exp(-K*d), k*xw()*Math.exp(K*d)]; };
const hop=(from,top)=>{ let best=null,bd=9; for(const q of P){ if(q.w&&q.side===from&&q.y<top){ const d=Math.abs(q.x); if(d<bd){bd=d;best=q;} } } if(best){ best.side=-from; best.x=-best.x; if(from<0){visL--;visR++;cLR++;} else {visL++;visR--;cRL++;} } };   // the molecule nearest the pores goes through
// the tagged molecule: Brownian motion with a little persistence (so a rider's view turns smoothly), plus the drift of the bulk flow
const tq={x:-.3,y:Y0+.6,z:.25,vx:.2,vy:0,vz:0,side:-1}; let tcool=0, tsay=0, tn=0; const riding=()=>tr.children.some(o=>o.isMesh&&!o.visible);   // the engine hides a small actor while the learner rides it
api.onStep((h,t)=>{ const s=Math.sqrt(api.param('T'))*.9, st=s*h*20, top=Math.min(hL,hR)+Y0-.05;
  for(const q of P){ q.x+=(rnd()-.5)*st; q.y+=(rnd()-.5)*st; q.z+=(rnd()-.5)*st;
    const lim=Y0+(q.side<0?hL:hR)-.05; if(q.y<Y0+.05)q.y=Y0+.05; if(q.y>lim)q.y=lim; if(q.z<-ZD)q.z=-ZD; if(q.z>ZD)q.z=ZD; if(q.x<-2.9)q.x=-2.9; if(q.x>2.9)q.x=2.9;
    if((q.x<0?-1:1)!==q.side) q.x=-q.x; }                                // walking into the membrane: reflected (crossing happens only through the pores, below)
  // the levels follow the net flow J = J_in − J_out (deterministic); the drawn molecules hop both ways at the gross rates, kept in step with the levels
  const [jin,jout]=rates(); m+=(jin-jout)*h; nL=nW/2-m; nR=nW/2+m; hL=nL*HV; hR=nR*HV;
  const dv=visR-nR; if(rnd()<h*jin*Math.exp(-.4*dv)) hop(-1,top); if(rnd()<h*jout*Math.exp(.4*dv)) hop(1,top);
  // tagged molecule
  const tau=.6, sg=.9*Math.sqrt(api.param('T')), g=()=>(rnd()+rnd()+rnd()-1.5)*2; tq.vx+=(-tq.vx/tau)*h+sg*Math.sqrt(h)*g()+netEma*.02*h; tq.vy+=(-tq.vy/tau)*h+sg*Math.sqrt(h)*g(); tq.vz+=(-tq.vz/tau)*h+sg*Math.sqrt(h)*g();
  tq.x+=tq.vx*h; tq.y+=tq.vy*h; tq.z+=tq.vz*h; const tl=Y0+(tq.side<0?hL:hR)-.08;
  if(tq.y<Y0+.08){tq.y=Y0+.08;tq.vy=Math.abs(tq.vy);} if(tq.y>tl){tq.y=tl;tq.vy=-Math.abs(tq.vy);} if(Math.abs(tq.z)>ZD-.05){tq.z=Math.sign(tq.z)*(ZD-.05);tq.vz*=-1;} if(Math.abs(tq.x)>.8){tq.x=Math.sign(tq.x)*.8;tq.vx*=-1;}   // we follow it in the region next to the membrane
  tcool=Math.max(0,tcool-h); tsay=Math.max(0,tsay-h);
  if((tq.x<0?-1:1)!==tq.side){ const pr=Math.min(1,api.param('pass')*1.2)*(tq.side<0?Math.exp(-K*dhEff()):xw()*Math.exp(K*dhEff()));   // at the membrane: through a pore, or bounced back
    if(tcool<=0&&tq.y<top&&rnd()<pr){ tq.side=-tq.side; tcool=1.5; const ts=tq.side; if(riding()||tsay<=0){ tsay=20; tn++; api.event((ts>0?'The tagged water molecule slips through a pore into the solution side':'The tagged water molecule slips back through a pore into the pure water')+' (crossing '+tn+')',V(0,tq.y,tq.z),{id:'cross',sound:'bubble'}); } } else { tq.x=-tq.x; tq.vx=-tq.vx; } }
  win+=h; if(win>=3){ const net=cLR-cRL; rate=[cLR/3,cRL/3]; netEma+=(net/3-netEma)*.5;
    if(!flowSaid&&net>=4&&nS>0){ flowSaid=true; api.event('Net water flow into the solution side: in 3 s, '+cLR+' molecules crossed into it and '+cRL+' came back',V(0,Y0+.6,.1),{id:'flow',sound:'pour'}); }
    if(!revSaid&&press()>0&&net<=-4){ revSaid=true; api.event('Reverse osmosis: pressed harder than the osmotic pressure, water is squeezed back into the pure side ('+cRL+' out, '+cLR+' in, in 3 s)',V(.6,Y0+1.2,.1),{id:'reverse',sound:'pour'}); }
    cLR=0; cRL=0; win=0; }
  ema+=((hR-hL)-ema)*Math.min(1,h/2); hist.push([t,ema]); while(hist.length&&t-hist[0][0]>8) hist.shift();
  if(!eqSaid&&nS>0&&t>8&&press()===0&&Math.abs((hR-hL)-bal())<.025){ eqSaid=true; api.event('Osmotic equilibrium: the solution stands Δh = '+f0((hR-hL)*100)+' mm higher, and water now crosses equally both ways (about '+f0((rate[0]+rate[1])/2)+' molecules per second each way)',V(1.5,Y0+hR,0),{id:'eq',sound:'chime'}); } });
const bal=()=>nS?-Math.log(xw())/(2*K)-press():0;   // head at which the two crossing rates balance (scene units)
const m4=new T.Matrix4();
api.onFrame(()=>{ let iw=0,is=0; P.forEach(q=>{ m4.makeTranslation(q.x,q.y,q.z); if(q.w) wm.setMatrixAt(iw++,m4); else sm.setMatrixAt(is++,m4); }); wm.instanceMatrix.needsUpdate=true; sm.instanceMatrix.needsUpdate=true;
  const D=1.3; L.position.y=Y0+hL; L.scale.y=hL/D; R.position.y=Y0+hR; R.scale.y=hR/D; tr.position.set(tq.x,tq.y,tq.z);
  const py=press()>0?Y0+hR+.005:Math.max(Y0+hR+.5,2.75); piston.position.y+=(py-piston.position.y)*.15; });
api.readout('water molecules left / right',()=>visL+' / '+visR);
api.readout('water fraction x_w on the solution side',()=>nS?f2(xw()):'1 (no solute)');
api.readout('Δh (solution − pure water)',()=>f0((hR-hL)*100)+' mm');
api.readout('Δh where crossings balance',()=>nS?f0(bal()*100)+' mm':'0 mm');
api.readout('crossings per second (in / out)',()=>rate[0].toFixed(1)+' / '+rate[1].toFixed(1));
api.readout('piston pressure',()=>f0(api.param('press'))+' mm of water');
api.plot('Δh (mm)',()=>(hR-hL)*100); api.camera({target:[0,1.55,0],r:9.6,ph:1.36,th:.14});`,
  lessons: [
    { title: 'Watch the water move', question: 'Which way does water move?', text: 'The tank starts with both levels equal. Water molecules (blue) cross the membrane pores in both directions; the solute molecules (orange) bounce off it on the right. Wait for the net water flow.', set: { solute: 45 }, focus: 'membrane', shot: 'medium', until: 'event:net water flow', run: 30, explain: 'Solute that cannot enter the pores lowers the chemical potential of the water on its side, so more water enters the solution than leaves it. In real membranes this flow is mostly bulk flow through the pores, driven by a pressure difference set up inside them; it is not water simply "diffusing down its own gradient" (Kramer & Myers 2013). The particle picture here shows the direction and the balance, not the molecular mechanism.', opens: 'How does one molecule get across?' },
    { title: 'Down to the pores', question: 'How does one molecule get across?', text: 'Zoom from the tank to the semi-permeable membrane and on down to one tagged water molecule. Every molecule here is jostled at random by thermal motion; the small water molecules can slip through the pores, the larger solute molecules cannot.', focus: 'tracer', zoom: { to: 'tracer', from: 'wide', perDecade: 3, stations: [{ at: 'membrane', hold: 2 }] }, run: 10, explain: 'The scale bar changes level on the way down: the tank is about 60 cm wide, but near the molecule the bar switches to the size of the drawn molecules (a water molecule is about 0.28 nm across). Real pores are a few tenths of a nanometre wide, and billions of molecules meet them every second; this tank shows 400 water molecules, so it shows the direction and the balance of the crossings, not their true numbers.', opens: 'What does one molecule go through at the membrane?' },
    { title: 'Ride one molecule', question: 'What does one molecule go through at the membrane?', text: 'You are now riding a single tagged water molecule, jostled at random by thermal motion. Watch the pink membrane ahead and wait until the molecule slips through a pore.', focus: 'tracer', shot: 'pov', pov: 'Tagged water molecule', until: 'event:tagged water molecule slips', run: 40, explain: 'No single molecule knows which way is "downhill". It wanders at random, and when it reaches a pore it may pass in either direction. The net flow is a small imbalance between two large, opposite streams. In living cells water crosses mainly through aquaporins, channels that pass water molecules in single file, discovered by Preston et al. (1992).', opens: 'When does the flow stop?' },
    { title: 'Equilibrium', question: 'When does the flow stop?', text: 'Follow the two levels: the solution side rises while the pure water side falls. The extra height presses back on the membrane. Wait for equilibrium.', focus: 'right', shot: 'medium', chain: [{ a: 'Pure water side', note: 'loses water through the pores' }, { a: 'membrane', note: 'passes water, holds back solute' }, { a: 'Solution side', note: 'rises until its weight presses back' }], chainPace: 1.3, until: 'event:osmotic equilibrium', run: 90, explain: 'The higher column pushes water back, and the flow stops when its hydrostatic pressure ρgΔh balances the solute\'s effect: here near 40 mm, where −ln x_w = 2KΔh. For dilute solutions this is van \'t Hoff\'s law, π = cRT (van \'t Hoff 1887): the osmotic pressure grows with the number of dissolved particles, not with their kind. In the real world a 0.01 mol/L sugar solution at 25 °C has π ≈ 25 kPa, enough to hold up a column of water 2.5 m high.', opens: 'Does more solute make the column taller?' },
    { title: 'More solute', question: 'Does more solute make the column taller?', text: 'Double the solute to 90 molecules. The tank refills from equal levels. Watch the solution rise higher this time, and wait for equilibrium.', set: { solute: 90 }, focus: 'right', shot: 'medium', until: 'event:osmotic equilibrium', run: 100, explain: 'With twice the solute the column settles near 65 mm instead of 40 mm. It is not exactly double, because −ln x_w grows a little faster than the solute fraction, and the incoming water dilutes the solution as it rises. In dilute solutions the osmotic pressure is proportional to the solute concentration (π = cRT).', opens: 'Can pressure push the water back?' },
    { title: 'Push back: reverse osmosis', question: 'Can pressure push the water back?', text: 'Lower the piston onto the solution with 120 mm of water pressure, more than the osmotic pressure. Watch which way the water now crosses.', set: { press: 120 }, focus: 'piston', shot: 'medium', isolate: ['piston', 'Solution side', 'membrane'], until: 'event:reverse osmosis', run: 60, explain: 'Pressure on the solution raises the water\'s chemical potential there. Once it exceeds the osmotic pressure, the net flow reverses and water is squeezed out of the solution through the membrane, leaving the solute behind. The flow follows J = Lp(ΔP − σΔπ) (Kedem & Katchalsky 1958). Desalination plants work this way: seawater has an osmotic pressure of about 27 bar, so they press it at 55–80 bar.', opens: 'What happens to a living cell placed in water that is saltier or fresher than its inside?' }]
};
import { REF } from './seeds-sources.js';
WATER_CYCLE.sources = [REF.trenberth, REF.oki, REF.koutsoyiannis, REF.roe];
GALTON.sources = [REF.galton, REF.lecam];
MARKET.sources = [REF.smith62, REF.gode];
OSMOSIS.sources = [REF.vanthoff, REF.kedem, REF.kramer, REF.agre];
export const FLAGSHIPS = [WATER_CYCLE, GALTON, MARKET, OSMOSIS];
