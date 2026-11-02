// Which hill streets a Hayward Fault rupture could cut, and whether the hills keep a way out.
// Two bounds (docs/design/earthquake-fire.md, SOURCE_NOTES EQ4–EQ5):
//   trace: close every vehicle segment that crosses a mapped Hayward Fault trace (California
//          Geological Survey fault lines, data/raw/cgs/historic-fault-traces.json). Lower bound.
//   zone:  close every vehicle segment with any point inside the State's Alquist-Priolo
//          Earthquake Fault Zone (data/raw/cgs/earthquake-fault-zones.json). Upper bound: the zone
//          marks where the State requires a fault investigation before building.
// For each bound it reports the closed segments, how the street nodes of Fire Zones 2–3 split
// into connected pieces, which grid edges each piece's exits sit on, and the shortest route to the
// Bay-side (west) grid edge from a few hill points. Read-only: writes nothing.
//
//   node tools/fault-zone-check.mjs [trace|zone|both]

import fs from 'fs';
import { toUTM } from './utm.mjs';

const mode = process.argv[2] || 'both';
const net = JSON.parse(fs.readFileSync(new URL('../data/model/network.json', import.meta.url)));
const [ox, oy] = net.meta.origin;
const W = net.meta.terrain.xmax, H = net.meta.terrain.ymax;
const local = ([lon, lat]) => { const [x, y] = toUTM(lon, lat); return [x - ox, y - oy]; };
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/raw/cgs/${f}`, import.meta.url)));

const veh = net.edges.filter(e => e.mode === 'vehicle' && !e.disconnected);
const hill = new Set();
for (const e of veh) if (e.fireZone === 2 || e.fireZone === 3) { hill.add(e.a); hill.add(e.b); }
const exits = new Set(net.meta.exitNodes);

function lines(g) {
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}
const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a, b, c, d) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);

function closedByTrace() {
  const fc = read('historic-fault-traces.json');
  const segs = [];
  for (const f of fc.features) {
    if (!/^Hayward/.test(f.properties.NAME || '')) continue;
    for (const ln of lines(f.geometry)) { const p = ln.map(local); for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]); }
  }
  const out = new Set();
  for (const e of veh) {
    outer: for (let i = 1; i < e.geom.length; i++) for (const [c, d] of segs) if (crosses(e.geom[i - 1], e.geom[i], c, d)) { out.add(e.id); break outer; }
  }
  return out;
}

function closedByZone() {
  const fc = read('earthquake-fault-zones.json');
  const rings = fc.features.flatMap(f => lines(f.geometry)).map(r => r.map(local));
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, y1] = r[i], [x2, y2] = r[j]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c = !c; } return c; };
  const inZone = (x, y) => rings.reduce((c, r) => (inRing(x, y, r) ? !c : c), false); // even-odd: holes excluded
  const out = new Set();
  for (const e of veh) {
    let hit = false;
    for (let i = 1; i < e.geom.length && !hit; i++) {
      const [a, b] = [e.geom[i - 1], e.geom[i]];
      const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5)); // sample every 5 m
      for (let t = 0; t <= k && !hit; t++) hit = inZone(a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k);
    }
    if (hit) out.add(e.id);
  }
  return out;
}

const edgeOf = (p) => (p[0] < 1500 ? 'west' : p[0] > W - 1500 ? 'east' : p[1] < 300 ? 'south' : p[1] > H - 300 ? 'north' : 'interior');
const STARTS = { 'Grizzly Peak Blvd at Spruce St': [-122.2590, 37.8890], 'Panoramic Hill': [-122.2440, 37.8690], 'upper Claremont Canyon': [-122.2360, 37.8560], 'Cragmont': [-122.2650, 37.8880] };

function report(label, closed) {
  const adj = new Map();
  for (const e of veh) { if (closed.has(e.id)) continue; for (const [u, v] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, e]); } }
  const comp = new Map(); let c = 0;
  for (const s of adj.keys()) { if (comp.has(s)) continue; c++; const q = [s]; comp.set(s, c); while (q.length) { const u = q.pop(); for (const [v] of adj.get(u)) if (!comp.has(v)) { comp.set(v, c); q.push(v); } } }
  const km = [...closed].reduce((s, id) => s + net.edges[id].len, 0) / 1000;
  console.log(`\n== ${label}: ${closed.size} vehicle segments closed (${km.toFixed(1)} km)`);
  const groups = {};
  for (const h of hill) { const k = comp.get(h) ?? 'no open segment'; (groups[k] ??= { nodes: 0, exits: {} }).nodes++; }
  for (const x of exits) { const g = groups[comp.get(x)]; if (g) { const side = edgeOf(net.nodes[x]); g.exits[side] = (g.exits[side] || 0) + 1; } }
  console.log(`Street nodes in Fire Zones 2–3: ${hill.size}`);
  for (const [k, g] of Object.entries(groups).sort((a, b) => b[1].nodes - a[1].nodes).slice(0, 6))
    console.log(`  piece ${k}: ${g.nodes} hill nodes; exits by grid edge ${JSON.stringify(g.exits)}`);
  const west = new Set([...exits].filter(x => edgeOf(net.nodes[x]) === 'west'));
  for (const [name, ll] of Object.entries(STARTS)) {
    const [x, y] = local(ll); let s = null, bd = Infinity;
    for (const h of hill) { if (!adj.has(h)) continue; const p = net.nodes[h]; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; s = h; } }
    const dist = new Map([[s, 0]]), prev = new Map(), pq = [[0, s]]; let hit = null;
    while (pq.length) { pq.sort((a, b) => b[0] - a[0]); const [d, u] = pq.pop(); if (d > dist.get(u)) continue; if (west.has(u)) { hit = u; break; } for (const [v, e] of adj.get(u)) { const nd = d + e.len; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, [u, e]); pq.push([nd, v]); } } }
    if (!hit) { console.log(`  ${name}: no route to the Bay-side grid edge`); continue; }
    const path = []; let u = hit; while (prev.has(u)) { const [p, e] = prev.get(u); path.push(e.name); u = p; }
    console.log(`  ${name}: ${(dist.get(hit) / 1000).toFixed(1)} km to the Bay-side edge via ${path.reverse().filter((n, i, a) => n !== a[i - 1]).join(' > ')}`);
  }
}

if (mode === 'trace' || mode === 'both') report('Bound 1, segments crossing a mapped Hayward Fault trace', closedByTrace());
if (mode === 'zone' || mode === 'both') report('Bound 2, segments touching the Earthquake Fault Zone', closedByZone());
