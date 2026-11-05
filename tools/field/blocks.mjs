import fs from 'node:fs';
import { fromUTM } from '/home/user/berkeley-wildfire-evacuation-explorer/tools/utm.mjs';
const R='/home/user/berkeley-wildfire-evacuation-explorer/';
const a=JSON.parse(fs.readFileSync(R+'data/field/aerial-parking-counts-2020.json')), n=JSON.parse(fs.readFileSync(R+'data/model/network.json'));
const [x0,y0]=n.meta.origin, byNode=new Map();
for(const e of n.edges){for(const v of [e.a,e.b]){if(!byNode.has(v))byNode.set(v,[]);byNode.get(v).push(e);}}
const norm=s=>(s||'').trim();
function cross(e,node,seen=new Set()){ // walk along same-name edges to the first node with another named street
  for(let k=0;k<20;k++){const others=byNode.get(node).filter(x=>x!==e&&!seen.has(x.id));const names=[...new Set(others.map(x=>norm(x.name)).filter(s=>s&&s!==norm(e.name)))];
    if(names.length) return names.join(' / ');
    const cont=others.find(x=>norm(x.name)===norm(e.name)); if(!cont) return others.length?'(end of street)':'(dead end)';
    seen.add(e.id); e=cont; node=cont.a===node?cont.b:cont.a;}
  return '?';}
const out=a.blocks.map((b,i)=>{const e=n.edges[b.edge]; if(norm(e.name)!==norm(b.street)) throw new Error(`edge ${b.edge} is ${e.name}, not ${b.street}`);
  const g=e.geom, m=g[Math.floor(g.length/2)]; const [lon,lat]=fromUTM(m[0]+x0,m[1]+y0);
  return {i, street:b.street, from:cross(e,e.a), to:cross(e,e.b), lengthM:b.lengthM, pavementFt:b.pavementFt, cars:b.carsVisible, pattern:b.pattern, canopy:b.canopyHidden, lat:+lat.toFixed(5), lon:+lon.toFixed(5), zone:e.fireZone, parking:e.parking};});
fs.writeFileSync('/tmp/claude-0/-home-user/9a9e590e-09b7-569b-b51f-fa358c1c5b3e/scratchpad/blocks.json',JSON.stringify(out,null,1));
for(const o of out) console.log(o.street,'|',o.from,'→',o.to,'|',o.lengthM,'m',o.pavementFt,'ft',o.cars,'cars',o.lat,o.lon);
