import fs from 'node:fs';
import { fromUTM } from '/home/user/berkeley-wildfire-evacuation-explorer/tools/utm.mjs';
const R='/home/user/berkeley-wildfire-evacuation-explorer/';
const net=JSON.parse(fs.readFileSync(R+'data/model/network.json')), A=JSON.parse(fs.readFileSync(R+'data/field/aerial-parking-counts-2020.json'));
const [x0,y0]=net.meta.origin, nN=net.nodes.length;
const out=Array.from({length:nN},()=>[]);
for(const e of net.edges){ if(e.mode!=='vehicle'||e.disconnected||e.barrier?.closed) continue;
  if(e.lanes[0]>0) out[e.a].push([e.b,e.len]); if(e.lanes[1]>0) out[e.b].push([e.a,e.len]); }
function dij(s){const d=new Float64Array(nN).fill(Infinity);d[s]=0;const h=[[0,s]];
  while(h.length){let bi=0;for(let i=1;i<h.length;i++)if(h[i][0]<h[bi][0])bi=i;const [dd,n]=h[bi];h[bi]=h[h.length-1];h.pop();if(dd>d[n])continue;
    for(const [m,w] of out[n]){const nd=dd+w;if(nd<d[m]){d[m]=nd;h.push([nd,m]);}}}return d;}
// each block: drive it from one end to the other; ends = [a,b]; allowed directions from the edge's lanes
const B=A.blocks.map(b=>{const e=net.edges[b.edge];const dirs=[];if(e.lanes[0]>0)dirs.push([e.a,e.b]);if(e.lanes[1]>0)dirs.push([e.b,e.a]);return {...b,e,dirs};});
const ends=[...new Set(B.flatMap(b=>[b.e.a,b.e.b]))];const D=new Map();
for(const n of ends){const d=dij(n);D.set(n,d);}
const dist=(p,q)=>D.get(p)[q];
// cost of an order with the best direction per block (DP over directions); open path, free start
function evalOrder(o){let prev=o[0].dirs.map(([s,t])=>({c:o[0].e.len,end:t,ch:[[s,t]]}));
  for(let k=1;k<o.length;k++){prev=o[k].dirs.map(([s,t])=>{let best=null;for(const p of prev){const c=p.c+dist(p.end,s)+o[k].e.len;if(!best||c<best.c)best={c,end:t,ch:[...p.ch,[s,t]]};}return best;});}
  return prev.reduce((a,b)=>a.c<b.c?a:b);}
let order=[...B];let best=evalOrder(order);
// nearest neighbor seeds then 2-opt + or-opt
for(let s=0;s<B.length;s++){let left=[...B];const o=[left.splice(s,1)[0]];while(left.length){const last=o[o.length-1];left.sort((a,b)=>Math.min(...a.dirs.map(([x])=>dist(last.e.a,x)))-Math.min(...b.dirs.map(([x])=>dist(last.e.a,x))));o.push(left.shift());}
  let cur=o,cc=evalOrder(cur);let improved=true;while(improved){improved=false;
    for(let i=0;i<cur.length-1;i++)for(let j=i+1;j<cur.length;j++){const c2=[...cur.slice(0,i),...cur.slice(i,j+1).reverse(),...cur.slice(j+1)];const e2=evalOrder(c2);if(e2.c<cc.c-1e-6){cur=c2;cc=e2;improved=true;}}
    for(let i=0;i<cur.length;i++)for(let j=0;j<cur.length;j++){if(i===j)continue;const c2=[...cur];const [x]=c2.splice(i,1);c2.splice(j,0,x);const e2=evalOrder(c2);if(e2.c<cc.c-1e-6){cur=c2;cc=e2;improved=true;}}}
  if(cc.c<best.c){best=cc;order=cur;}}
const ll=n=>{const p=net.nodes[n];const [lon,lat]=fromUTM(p[0]+x0,p[1]+y0);return [+lat.toFixed(5),+lon.toFixed(5)];};
const res=order.map((b,k)=>({edge:b.edge,street:b.street,start:ll(best.ch[k][0]),end:ll(best.ch[k][1]),startNode:best.ch[k][0],endNode:best.ch[k][1]}));
let drive=0;for(let k=1;k<res.length;k++)drive+=dist(res[k-1].endNode,res[k].startNode);
console.log('total km',(best.c/1000).toFixed(1),'of which between blocks',(drive/1000).toFixed(1));
console.log(res.map((r,k)=>`${k+1} ${r.street}`).join('\n'));
fs.writeFileSync('route.json',JSON.stringify({totalKm:+(best.c/1000).toFixed(1),order:res}));
