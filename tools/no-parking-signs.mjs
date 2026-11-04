// No-parking signs against the street network and the 2020 aerial parking counts (Phase 3 step 3c;
// docs/design/phase-3.md section 5, SOURCE_NOTES PH11). Read-only: writes nothing.
// Each sign (data/model/layers.json noParkingSigns, from the City's two sign layers) is matched to the
// nearest vehicle segment within 20 m and to the side of it the sign stands on. The signs carry no facing
// direction and no extent, so the side is the side of the centerline the point lies on.
//
//   node tools/no-parking-signs.mjs

import fs from 'fs';
const net = JSON.parse(fs.readFileSync('data/model/network.json')), L = JSON.parse(fs.readFileSync('data/model/layers.json'));
const counts = JSON.parse(fs.readFileSync('data/field/aerial-parking-counts-2020.json')).blocks;
const E = net.edges.filter(e => e.mode === 'vehicle');
function near(p) { let best = null, bd = 1e9, side = 0;
  for (const e of E) { const g = e.geom; for (let i = 1; i < g.length; i++) { const [ax, ay] = g[i-1], [bx, by] = g[i], vx = bx-ax, vy = by-ay, L2 = vx*vx+vy*vy; const u = L2 ? Math.max(0, Math.min(1, ((p[0]-ax)*vx+(p[1]-ay)*vy)/L2)) : 0; const d = Math.hypot(p[0]-ax-u*vx, p[1]-ay-u*vy); if (d < bd) { bd = d; best = e; side = Math.sign(vx*(p[1]-ay) - vy*(p[0]-ax)); } } }
  return { e: best, d: bd, side }; }
const per = new Map(); const dists = [];
for (const s of L.noParkingSigns) { const n = near(s.pt); dists.push(n.d); if (n.d > 20) continue; const t = per.get(n.e.id) || { n: 0, sides: new Set(), codes: [] }; t.n++; t.sides.add(n.side); t.codes.push(s.mutcd); per.set(n.e.id, t); }
dists.sort((a,b)=>a-b); console.log('signs', L.noParkingSigns.length, 'dist p50', dists[dists.length>>1].toFixed(1), 'p90', dists[Math.floor(dists.length*.9)].toFixed(1), 'within 20 m', dists.filter(d=>d<=20).length);
const hills = E.filter(e => e.fireZone >= 2);
const signedHills = hills.filter(e => per.has(e.id));
console.log('hill vehicle segments', hills.length, 'with a sign within 20 m', signedHills.length, 'both sides signed', signedHills.filter(e => per.get(e.id).sides.size === 2).length);
console.log('narrow hill segs', hills.filter(e=>e.narrow).length, 'narrow with sign', signedHills.filter(e=>e.narrow).length);
for (const b of counts) { const t = per.get(b.edge); console.log(`${b.street.padEnd(20)} ${String(b.pavementFt).padStart(3)} ft cars ${String(b.carsVisible).padStart(2)} | ${t ? `signs ${t.n} sides ${t.sides.size} ${t.codes.join(',')}` : 'no sign'} | ${b.pattern}`); }
