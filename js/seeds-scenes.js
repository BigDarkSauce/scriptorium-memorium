// Flagship authored dioramas in the universal scene format (the same JSON any AI produces from the prompt pack).
// Each embodies an idea through bodies, events and processes; decor reacts to the simulation.

const trees = (pts, kind = 'tree') => pts.map(([x, z, h], i) => ({ id: kind + i, name: kind === 'pine' ? 'Pine' : 'Tree', role: 'decor', shape: { kind, h }, position: [x, .15, z] }));

export const WATER_CYCLE = {
  type: 'scene', title: 'The water cycle in a glass valley', technique: 'topdown',
  environment: { preset: 'landscape', glassCase: true, time: 11 },
  bodies: [
    { id: 'ground', name: 'Valley floor', role: 'decor', shape: { kind: 'terrain', w: 13, d: 13, h: .3, seed: 3, low: '#5f7f3e', high: '#8a8a5a', flat: [[2.6, 1.2, 2.0, .9, .18], [1.0, -2.7, .7, .6, .2]] }, position: [0, .02, 0] },
    { id: 'mountain', name: 'Mountains', label: 'Mountains', role: 'actor', describe: 'Air forced up their slopes expands and cools.', shape: { kind: 'mountain', r: 1.8, h: 2.7, seed: 5, snowline: .7 }, position: [-3.1, 0, -1.4] },
    { id: 'mountain2', name: 'Mountain', role: 'decor', shape: { kind: 'mountain', r: 1.5, h: 2.1, seed: 9, snowline: .72 }, position: [-3.3, 0, 1.7] },
    { id: 'mountain3', name: 'Hill', role: 'decor', shape: { kind: 'mountain', r: 1.1, h: 1.2, seed: 2, snowline: 2 }, position: [-1.7, 0, -3.1] },
    { id: 'lake', name: 'Lake', label: 'Lake · source of vapour', role: 'actor', describe: 'Sunlight gives water molecules the energy to escape as vapour.', shape: { kind: 'water', w: 3.4, d: 2.6 }, position: [2.6, .38, 1.2] },
    { id: 'vapour', name: 'Water vapour', label: 'Water vapour', role: 'actor', describe: 'Invisible gas in reality; drawn here as rising motes.', shape: { kind: 'particles', type: 'bubbles', count: 220, area: [3.4, 3, 2.4], size: .05 }, position: [2.6, .4, 1.2] },
    { id: 'cloud', name: 'Cloud', label: 'Cloud · condensed droplets', role: 'actor', describe: 'Vapour condenses on dust into droplets; the cloud darkens as it fills.', shape: { kind: 'cloud', r: .9, puffs: 8 }, position: [2.6, 4.3, 1.2] },
    { id: 'wind', name: 'Wind', label: 'Wind', role: 'actor', describe: 'Carries the cloud west, towards the mountains.', shape: { kind: 'arrow', length: 1.3, r: .05 }, material: { preset: 'neon', color: '#9fd0ff' }, position: [-.4, 5.6, 3.4], rotation: [0, 0, 90] },
    { id: 'rain', name: 'Rain', label: 'Rain', role: 'actor', describe: 'Falls when the cloud holds more water than its air can keep suspended.', shape: { kind: 'particles', type: 'rain', count: 600, area: [2.2, 4, 1.4], size: .035 }, position: [2.6, .3, 1.2] },
    { id: 'sun', name: 'Sun', label: 'Sun · the energy source', role: 'actor', describe: 'Its height through the day sets how strongly the lake is heated.', shape: { kind: 'star', r: .42, color: '#ffd27a', intensity: 2 }, position: [4.5, 6.4, -3.5] },
    { id: 'house', name: 'Cottage', role: 'decor', shape: { kind: 'house', w: 1, d: .8, h: .65 }, position: [1.0, .22, -2.7], rotation: [0, 18, 0] },
    ...trees([[0, -1.2, 1.1], [.6, -2.0, .9], [3.2, -1.6, 1.2], [-.4, 2.6, 1], [4.0, 3.2, .9], [1.0, 3.4, 1.1]]),
    ...trees([[-2.0, .2, 1.3], [-1.6, -1.2, 1.1], [-2.2, 3.0, 1.2]], 'pine')
  ],
  tour: ['sun', 'lake', 'vapour', 'cloud', 'wind', 'mountain', 'rain'],
  params: [
    { key: 'sun', label: 'solar heating', min: 0, max: 1.5, value: .9, unit: '' },
    { key: 'wind', label: 'wind speed', min: 0, max: 3, value: 1.2, unit: '' },
    { key: 'hour', label: 'time of day', min: 6, max: 19.5, value: 11, unit: 'h' }],
  behaviors: [{ target: 'tree*', type: 'sway', amount: 'wind', speed: '1' }, { target: 'pine*', type: 'sway', amount: 'wind*0.7', speed: '0.8' }],
  code: `const T=api.THREE, lake=api.body('lake'), cloud=api.body('cloud'), rain=api.body('rain'), vap=api.body('vapour'), sun=api.body('sun'), wind=api.body('wind');
let H=0.2, W=0.1, level=0, raining=false, rained=0, evap=0, lifted=false;
const home=cloud.position.clone(), white=new T.Color('#ffffff'), slate=new T.Color('#59626c'), cm=[]; cloud.traverse(o=>{ if(o.isMesh) cm.push(o); });
const rainPts=rain.children[0]||rain; const vapPts=vap.children[0]||vap;
function sunDir(h){ const elev=Math.sin((h-6)/12*Math.PI)*62, az=(h-12)/12*140; return new T.Vector3().setFromSphericalCoords(1,(90-elev)*Math.PI/180,az*Math.PI/180); }
const heat=()=>api.param('sun')*Math.max(0,Math.sin((api.param('hour')-6)/12*Math.PI));
api.onStep((h)=>{
  const E=0.09*heat()*(1+0.3*api.param('wind'))*Math.max(0,1-H);
  H+=E*h; evap+=E*h; level-=E*h*0.12;
  if(Math.abs(cloud.position.x-home.x)<1.6){ const c=Math.min(H,0.14*h*(0.5+H)); H-=c; W+=c; }
  cloud.position.x-=api.param('wind')*0.32*h;
  const lift=Math.max(0,(-1.2-cloud.position.x))/2.5, sat=Math.max(0.35,1.0-0.6*Math.min(1,lift));
  const was=raining; raining=W>sat;
  if(raining){ const r=(W-sat)*0.6*h+0.02*h; W=Math.max(0,W-r); rained+=r; if(Math.abs(cloud.position.x-home.x)<2) level+=r*0.12; }
  H=Math.max(0,H-0.01*h);
  if(raining&&!was) api.event('Cloud saturated: rain begins',cloud.position.clone(),{id:'rain'});
  if(!raining&&was) api.event('Rain stops: the cloud has given up its excess water',cloud.position.clone(),{id:'dry'});
  if(lift>0.05&&!lifted){ lifted=true; api.event('Orographic lift: rising over the mountains, the air cools and holds less water',cloud.position.clone(),{id:'lift'}); }
  if(cloud.position.x<-5.2){ cloud.position.x=home.x; W=0.05; lifted=false; api.event('A new cloud forms over the lake',cloud.position.clone(),{id:'newcloud'}); }
  level=api.clamp(level,-0.22,0.22);
});
api.onFrame((dt)=>{
  cloud.scale.setScalar(0.6+W*0.9); const k=api.clamp(W,0,1); cm.forEach(m=>m.material.color.copy(white).lerp(slate,k*0.8));
  lake.position.y=0.38+level; rain.visible=raining; rain.position.x=cloud.position.x; rain.position.z=cloud.position.z;
  if(raining&&rainPts.geometry){ const a=rainPts.geometry.attributes.position; for(let i=0;i<a.count;i++){ let y=a.getY(i)-dt*7; if(y<0) y+=4; a.setY(i,y);} a.needsUpdate=true; }
  if(vapPts.geometry){ const a=vapPts.geometry.attributes.position, e=heat(); for(let i=0;i<a.count;i++){ let y=a.getY(i)+dt*(0.12+e*0.8); if(y>3) y=0; a.setY(i,y); let x=a.getX(i)-dt*api.param('wind')*0.15; if(x<-1.7) x=1.7; a.setX(i,x);} a.needsUpdate=true; vapPts.material.opacity=0.12+0.6*Math.min(1,e); }
  const d=sunDir(api.param('hour')).multiplyScalar(7.2); sun.position.set(d.x,Math.max(0.6,d.y),d.z);
  wind.scale.setScalar(0.35+api.param('wind')*0.35);
});
api.readout('heating',()=>heat()); api.readout('humidity over lake',()=>H); api.readout('cloud water',()=>W);
api.readout('lake level',()=>(level*1000).toFixed(0)+' mm'); api.readout('total rain',()=>rained); api.readout('total evaporation',()=>evap);
api.plot('cloud water',()=>W);`,
  lessons: [
    { title: 'Heat the lake', text: 'Turn the sun up. Watch the vapour rise faster above the lake and the humidity readout climb: evaporation needs energy.', set: { sun: 1.4 }, focus: 'lake', run: 8, explain: 'Each molecule that leaves takes its latent heat with it; more heating means a higher evaporation rate.' },
    { title: 'Let the wind carry the cloud', text: 'With a steady wind the cloud drifts west. Follow it to the mountains and wait for the rain event.', set: { wind: 2 }, focus: 'cloud', until: 'event:rain', run: 25, explain: 'Rising over the slopes the air expands and cools, its capacity to hold water falls below what the cloud carries, and the excess falls as rain.' },
    { title: 'Calm air', text: 'Drop the wind almost to zero. The cloud now stays over the lake and keeps filling until it rains back where it came from.', set: { wind: 0.2 }, focus: 'cloud', run: 14, explain: 'Without transport the cycle closes locally: evaporation, condensation and rain over the same water.' },
    { title: 'Evening', text: 'Move the time of day to evening. With the sun low, heating falls and so does evaporation.', set: { hour: 18.5 }, focus: 'sun', run: 10, explain: 'The energy input sets the pace of the whole cycle.' }]
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
    { id: 'left', name: 'Left level', label: 'Pure water side · level', role: 'actor', describe: 'Water only.', shape: { kind: 'water', w: 2.95, d: 1.55 }, material: { preset: 'water', color: '#3a9ec0', opacity: .55 }, position: [-1.5, 1.3, 0] },
    { id: 'right', name: 'Right level', label: 'Solution side · level', role: 'actor', describe: 'Water plus solute.', shape: { kind: 'water', w: 2.95, d: 1.55 }, material: { preset: 'water', color: '#c08a3a', opacity: .55 }, position: [1.5, 1.3, 0] }],
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
    { title: 'Watch the water move', text: 'Water molecules wander through the pores in both directions, but on the right some pore openings are blocked by solute. Wait for the net-flow event.', focus: 'membrane', until: 'event:flow', run: 20, explain: 'Fewer water molecules per unit area reach the pores from the solution side, so more cross into it than out of it.' },
    { title: 'Equilibrium', text: 'The right level rises until its extra pressure pushes water back as fast as it arrives. Wait for equilibrium.', focus: 'right', until: 'event:eq', run: 40, explain: 'The height difference at equilibrium measures the osmotic pressure; it grows with solute concentration (van \'t Hoff: π ≈ cRT).' },
    { title: 'More solute', text: 'Double the solute. The tank refills from scratch and settles at a bigger height difference.', set: { solute: 90 }, focus: 'right', until: 'event:eq', run: 45, explain: 'Osmotic pressure rises with the number of dissolved particles.' },
    { title: 'Pure water both sides', text: 'Remove all solute: nothing drives a net flow and the levels stay equal.', set: { solute: 0 }, focus: 'left', run: 12, explain: 'Osmosis needs a concentration difference across a membrane that blocks the solute.' }]
};
export const FLAGSHIPS = [WATER_CYCLE, GALTON, MARKET, OSMOSIS];
