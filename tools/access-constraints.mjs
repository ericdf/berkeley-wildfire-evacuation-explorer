#!/usr/bin/env node
// Access-constrained areas: street segments whose loss leaves homes with no drivable route
// out of the model area, and the area behind each. No fire is needed.
//
//   node tools/access-constraints.mjs            writes data/model/access-constraints.json and docs/access-constraints.md
//   node tools/access-constraints.mjs -v         also prints the top areas
//   node tools/access-constraints.mjs --open 2322[,id...]
//                                                what-if: treat these segments as two-way drivable streets
//                                                (a new or reopened connection, or a one-way street run two-way);
//                                                prints results, writes nothing
//
// Method (model rules unless marked otherwise; see docs/access-constraints.md):
// - Graph: the residents' drivable network as js/sim.js builds its links: vehicle edges that are
//   not disconnected and not closed by a barrier (diverter, bollard, gate); one directed arc per
//   direction with lanes, so a one-way street has one arc.
// - Out of the model area means reaching an exit node (net.meta.exitNodes): a street cut at the
//   edge of the elevation grid, the set the simulator uses for shadow evacuees.
// - A choke arc lies on every route from some node to every exit: an edge dominator of the
//   reversed graph rooted at a virtual node joined to all exits (each arc is split by a midpoint
//   node; Cooper-Harvey-Kennedy iterative dominators). If the arc's street is also a bridge of the
//   undirected drivable network, the area behind it is a dead end; otherwise only one-way rules
//   make it a choke ("one-way").
// - Choke arcs along one dead-end stem belong to one area: a choke whose outer end has a single
//   way out (its immediate dominator is itself a choke arc) joins the area above it. A choke whose
//   outer end lies on a loop (two routes out to the next choke) starts a nested area. Nesting
//   counts the areas in series between a home and an exit, its own included.
// - Residents: the simulator's allocation (js/sim.js buildHouseholds): each zone's population
//   inside the model area (Genasys or 2020 Census), spread over the zone's eligible streets in
//   proportion to length (Principal Arterials weighted 0.7). Expected values, no rounding.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parkingState } = await import(R + '/js/parking.js');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const net = readJSON('data/model/network.json'), layers = readJSON('data/model/layers.json'), A = readJSON('data/assumptions.json');
const dem = readJSON('data/terrain/dem.json');
const demBuf = fs.readFileSync(path.join(R, 'data/terrain/dem.i16'));
const Z = new Int16Array(demBuf.buffer, demBuf.byteOffset, demBuf.length / 2);
function elev(x, y) { // local meters → DEM elevation (m), nearest 4 m cell; null if no data
  const c = Math.floor(x / dem.resolution), r = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
  if (c < 0 || r < 0 || c >= dem.width || r >= dem.height) return null;
  const v = Z[r * dem.width + c]; return v === -32768 ? null : v / 10;
}
const r1 = v => v == null ? null : Math.round(v * 10) / 10, r0 = v => v == null ? null : Math.round(v);
const title = s => (s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, d, s) => d + s.toLowerCase());

const argv = process.argv.slice(2);
const OPEN = new Set((argv[argv.indexOf('--open') + 1] && argv.includes('--open') ? argv[argv.indexOf('--open') + 1] : '').split(',').filter(Boolean).map(Number));
const VERBOSE = argv.includes('-v');

const { nodes, edges } = net, nN = nodes.length;
const CLASS_RANK = { Local: 0, 'Major Collector': 1, 'Principal Arterial': 2, Ramp: 3, Interstate: 3 };
const simDrivable = e => e.mode === 'vehicle' && !e.disconnected && !e.barrier?.closed; // js/sim.js links
const drivable = e => simDrivable(e) || OPEN.has(e.id);
const lanesOf = e => OPEN.has(e.id) ? [Math.max(1, e.lanes?.[0] || 0), Math.max(1, e.lanes?.[1] || 0)] : e.lanes; // an opened segment is two-way
const exits = new Set(net.meta.exitNodes);
const hills = e => e.fireZone === 2 || e.fireZone === 3;

// ---------- residents per edge (js/sim.js buildHouseholds, expected values) ----------
const D = A.demand;
const vTot = Object.values(D.vehiclesTakenShares).reduce((a, b) => a + b, 0);
const meanVeh = Object.entries(D.vehiclesTakenShares).reduce((s, [k, p]) => s + k * p, 0) / vTot;
const vehPerHH = (1 - D.householdsWithoutVehicleShare) * meanVeh;
const byZone = new Map();
for (const e of edges) {
  if (!simDrivable(e) || e.evacZone == null || CLASS_RANK[e.cls] === 3) continue;
  const w = e.len * (e.cls === 'Principal Arterial' ? 0.7 : 1);
  if (!byZone.has(e.evacZone)) byZone.set(e.evacZone, []);
  byZone.get(e.evacZone).push([e.id, w]);
}
const people = new Float64Array(edges.length);
const zoneStreetM = new Map();
for (const z of layers.evacZones) {
  const pop = z.popModeled ?? z.pop, list = byZone.get(z.id); if (!list || !pop) continue;
  const W = list.reduce((s, [, w]) => s + w, 0); zoneStreetM.set(z.id, W);
  for (const [id, w] of list) people[id] += pop * w / W;
}

// ---------- status-quo parking, nominal state (both sides where they fit, perfect parking) ----------
const P = parkingState({ A, net }, { hillsParking: 'both' }, null, null);
const clearOf = id => Number.isNaN(P.clear[id]) ? null : P.clear[id];

// ---------- directed graph with arc midpoints; reversed for dominators ----------
const arcs = []; // [edgeId, from, to]
for (const e of edges) if (drivable(e)) { const L = lanesOf(e); for (const d of [0, 1]) if (L[d] > 0) arcs.push([e.id, d ? e.b : e.a, d ? e.a : e.b]); }
const nA = arcs.length, ROOT = nN + nA, NV = nN + nA + 1;
const succ = Array.from({ length: NV }, () => []), pred = Array.from({ length: NV }, () => []);
const link = (u, v) => { succ[u].push(v); pred[v].push(u); };
for (const x of exits) link(ROOT, x);
arcs.forEach(([, u, v], i) => { const m = nN + i; link(v, m); link(m, u); }); // reversed: head → mid → tail
const edgeArcs = new Map(); arcs.forEach(([eid], i) => { if (!edgeArcs.has(eid)) edgeArcs.set(eid, []); edgeArcs.get(eid).push(nN + i); });
const isMid = v => v >= nN && v < ROOT;

const po = new Int32Array(NV).fill(-1), order = [];
{ // postorder from ROOT (iterative DFS)
  const st = [[ROOT, 0]], seen = new Uint8Array(NV); seen[ROOT] = 1;
  while (st.length) {
    const top = st[st.length - 1], v = top[0];
    if (top[1] < succ[v].length) { const w = succ[v][top[1]++]; if (!seen[w]) { seen[w] = 1; st.push([w, 0]); } }
    else { po[v] = order.length; order.push(v); st.pop(); }
  }
}
const idom = new Int32Array(NV).fill(-1); idom[ROOT] = ROOT;
const rpo = order.slice().reverse();
for (let changed = true; changed;) {
  changed = false;
  for (const v of rpo) {
    if (v === ROOT) continue;
    let nd = -1;
    for (const p of pred[v]) {
      if (idom[p] < 0) continue;
      if (nd < 0) { nd = p; continue; }
      let a = p, b = nd;
      while (a !== b) { while (po[a] < po[b]) a = idom[a]; while (po[b] < po[a]) b = idom[b]; }
      nd = a;
    }
    if (nd >= 0 && idom[v] !== nd) { idom[v] = nd; changed = true; }
  }
}
const kids = Array.from({ length: NV }, () => []);
for (let v = 0; v < NV; v++) if (v !== ROOT && idom[v] >= 0) kids[idom[v]].push(v);
const tin = new Int32Array(NV).fill(-1), tout = new Int32Array(NV).fill(-1);
{ let t = 0; const st = [[ROOT, 0]]; tin[ROOT] = t++;
  while (st.length) { const top = st[st.length - 1]; if (top[1] < kids[top[0]].length) { const w = kids[top[0]][top[1]++]; tin[w] = t++; st.push([w, 0]); } else { tout[top[0]] = t++; st.pop(); } } }
const inSub = (a, v) => tin[v] >= 0 && tin[a] <= tin[v] && tout[v] <= tout[a];

// ---------- undirected bridges (virtual root joined to every exit) ----------
const adj = Array.from({ length: nN + 1 }, () => []);
for (const e of edges) if (drivable(e) && e.a !== e.b) { adj[e.a].push([e.b, e.id]); adj[e.b].push([e.a, e.id]); }
{ let k = -1; for (const x of exits) { adj[nN].push([x, k]); adj[x].push([nN, k]); k--; } }
const isBridge = new Set();
{
  const disc = new Int32Array(nN + 1).fill(-1), low = new Int32Array(nN + 1); let t = 0;
  for (const s of [nN, ...Array(nN).keys()]) {
    if (disc[s] >= 0) continue;
    disc[s] = low[s] = t++; const st = [[s, null, 0]];
    while (st.length) {
      const top = st[st.length - 1], [v, pe] = top;
      if (top[2] < adj[v].length) {
        const [w, k] = adj[v][top[2]++];
        if (k === pe) continue;
        if (disc[w] < 0) { disc[w] = low[w] = t++; st.push([w, k, 0]); } else low[v] = Math.min(low[v], disc[w]);
      } else {
        st.pop();
        if (st.length) { const p = st[st.length - 1][0]; low[p] = Math.min(low[p], low[v]); if (low[v] > disc[p] && pe >= 0) isBridge.add(pe); }
      }
    }
  }
}

// ---------- choke arcs, grouped into areas along dead-end stems ----------
const isChoke = m => isMid(m) && kids[m].some(c => c < nN); // the arc dominates at least one node
const chokeArcs = []; for (let m = nN; m < ROOT; m++) if (isChoke(m)) chokeArcs.push(m);
chokeArcs.sort((a, b) => tin[a] - tin[b]); // ancestors first
const chokeAnc = m => { let v = idom[m]; while (v !== ROOT && !isChoke(v)) v = idom[v]; return v === ROOT ? -1 : v; };
// Loops (2-edge-connected pieces of the undirected drivable network) and their street length:
// a loop under SMALL_LOOP_M (a turnaround, a split around an island, a doubled driveway) does
// not count as a place with two routes out (model rule).
const SMALL_LOOP_M = 200;
const uf = Int32Array.from({ length: nN }, (_, i) => i), find = x => { while (uf[x] !== x) x = uf[x] = uf[uf[x]]; return x; };
for (const e of edges) if (drivable(e) && !isBridge.has(e.id)) uf[find(e.a)] = find(e.b);
const loopLen = new Float64Array(nN), onLoop = new Uint8Array(nN);
for (const e of edges) if (drivable(e) && !isBridge.has(e.id) && e.a !== e.b) { loopLen[find(e.a)] += e.len; onLoop[e.a] = onLoop[e.b] = 1; }
const groupOf = new Map();
for (const m of chokeArcs) {
  const a = chokeAnc(m), outer = arcs[m - nN][2];
  // same stem if the outer end has a single way out, or sits only on a small loop
  const stem = isMid(idom[outer]) || (onLoop[outer] && loopLen[find(outer)] < SMALL_LOOP_M);
  groupOf.set(m, a >= 0 && stem ? groupOf.get(a) : m);
}
const groups = new Map(); for (const m of chokeArcs) { const g = groupOf.get(m); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(m); }

const vehEdges = edges.filter(drivable);
const areas = [];
for (const [h, list] of groups) {
  const members = vehEdges.filter(e => (edgeArcs.get(e.id) || []).every(m => inSub(h, m)));
  const pa = chokeAnc(h);
  // the entrance choke: the head arc plus arcs in series with it through nodes with two drivable streets
  const entrance = [h];
  for (let m = h; ;) {
    const tail = arcs[m - nN][1];
    const next = list.find(c => arcs[c - nN][2] === tail && arcs[c - nN][0] !== arcs[m - nN][0]);
    if (!next || adj[tail].length !== 2) break;
    entrance.push(next); m = next;
  }
  areas.push({ head: h, list, entrance, members, parentHead: pa < 0 ? -1 : groupOf.get(pa) });
}
areas.sort((a, b) => tin[a.head] - tin[b.head]);
const byHead = new Map(areas.map((a, i) => [a.head, i]));
const areaOf = new Int32Array(edges.length).fill(-1); // deepest area each edge belongs to
for (const a of areas) {
  a.parent = a.parentHead < 0 ? -1 : byHead.get(a.parentHead);
  a.nesting = a.parent < 0 ? 1 : areas[a.parent].nesting + 1;
  for (const e of a.members) areaOf[e.id] = byHead.get(a.head);
}

// ---------- helpers for the "second connection" hints ----------
const nodeEdgesAll = Array.from({ length: nN }, () => []);
for (const e of edges) { nodeEdgesAll[e.a].push(e.id); if (e.b !== e.a) nodeEdgesAll[e.b].push(e.id); }
const hasDrivable = new Uint8Array(nN); for (const e of vehEdges) { hasDrivable[e.a] = 1; hasDrivable[e.b] = 1; }
// Driving distance (m) along legal directions: from src to every node, or with toSrc from every node to src.
const outArcs = Array.from({ length: nN }, () => []), inArcs = Array.from({ length: nN }, () => []);
for (const [eid, u, v] of arcs) { outArcs[u].push([eid, v]); inArcs[v].push([eid, u]); }
function dijkstra(src, allowEdge, limit = 8000, toSrc = false) {
  const dist = new Map(), heap = [];
  for (const s of [].concat(src)) { dist.set(s, 0); heap.push([0, s]); }
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, n] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
    if (d > dist.get(n) || d > limit) continue;
    for (const [id, w] of (toSrc ? inArcs : outArcs)[n]) {
      if (!allowEdge(id)) continue;
      const nd = d + edges[id].len;
      if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); heap.push([nd, w]); }
    }
  }
  return dist;
}
const polyLen = g => { let L = 0; for (let i = 1; i < g.length; i++) L += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]); return L; };
// A point s meters from e.a: driving from it to the search source (dist from dijkstra with toSrc), or from the source to it
const fwd = e => lanesOf(e)[0] > 0, back = e => lanesOf(e)[1] > 0; // a→b, b→a allowed
const fromPoint = (dist, e, s) => Math.min(fwd(e) ? (dist.get(e.b) ?? Infinity) + e.len - s : Infinity, back(e) ? (dist.get(e.a) ?? Infinity) + s : Infinity);
const toPoint = (dist, e, s) => Math.min(fwd(e) ? (dist.get(e.a) ?? Infinity) + s : Infinity, back(e) ? (dist.get(e.b) ?? Infinity) + e.len - s : Infinity);
const G = 50, grid = new Map();
for (const e of vehEdges) {
  if (CLASS_RANK[e.cls] === 3) continue; // no freeways or ramps
  for (let i = 1; i < e.geom.length; i++) {
    const [ax, ay] = e.geom[i - 1], [bx, by] = e.geom[i];
    for (let gx = Math.floor(Math.min(ax, bx) / G); gx <= Math.floor(Math.max(ax, bx) / G); gx++)
      for (let gy = Math.floor(Math.min(ay, by) / G); gy <= Math.floor(Math.max(ay, by) / G); gy++) {
        const k = gx * 100000 + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([e.id, i]);
      }
  }
}
const cumLen = new Map(); const cumOf = e => { if (!cumLen.has(e.id)) { const c = [0]; for (let i = 1; i < e.geom.length; i++) c.push(c[i - 1] + Math.hypot(e.geom[i][0] - e.geom[i - 1][0], e.geom[i][1] - e.geom[i - 1][1])); cumLen.set(e.id, c); } return cumLen.get(e.id); };
// Sample the area's streets every 10 m: [x, y, driving distance to the choke's outer end]
function samples(list, dIn) {
  const out = [];
  for (const e of list) {
    const c = cumOf(e), k = e.len / (c[c.length - 1] || 1);
    for (let i = 1; i < e.geom.length; i++) {
      const [ax, ay] = e.geom[i - 1], [bx, by] = e.geom[i], seg = c[i] - c[i - 1], n = Math.max(1, Math.ceil(seg / 10));
      for (let j = 0; j <= n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n, fromPoint(dIn, e, (c[i - 1] + seg * j / n) * k)]);
    }
  }
  return out;
}
// Shortest straight line from the area to an accepted street outside it, among those where the
// existing drive from the area point to the outside point (legal directions, by way of the choke) is at least MIN_DETOUR_M and DETOUR_RATIO times the line
// (model rule: a link that saves no driving is no second way out).
const MIN_DETOUR_M = 300, DETOUR_RATIO = 3, MAX_SEARCH_M = 3000;
function nearestOutside(pts, accept, dOut) {
  let best = { d: Infinity };
  for (const [x, y, din] of pts) {
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let ring = 0; ring * G <= Math.min(best.d, MAX_SEARCH_M) + G; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        for (const [id, i] of grid.get((gx + dx) * 100000 + gy + dy) || []) {
          if (!accept(id)) continue;
          const e = edges[id], g = e.geom, [ax, ay] = g[i - 1], [bx, by] = g[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
          const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)) : 0;
          const qx = ax + u * vx, qy = ay + u * vy, d = Math.hypot(x - qx, y - qy);
          if (d >= best.d) continue;
          const c = cumOf(e), s = (c[i - 1] + u * (c[i] - c[i - 1])) * e.len / (c[c.length - 1] || 1);
          const detour = din + toPoint(dOut, e, s);
          if (detour < Math.max(MIN_DETOUR_M, DETOUR_RATIO * d)) continue;
          best = { d, id, from: [x, y], to: [qx, qy], detour };
        }
      }
    }
  }
  return best.d === Infinity ? null : best;
}
function hint(best) {
  if (!best) return null;
  const z0 = elev(...best.from), z1 = elev(...best.to), e = edges[best.id];
  return { distM: r0(best.d), street: title(e.name), edge: e.id, from: best.from.map(r1), to: best.to.map(r1),
    drivingNowM: Number.isFinite(best.detour) ? r0(best.detour) : null,
    climbM: z0 != null && z1 != null ? r1(z1 - z0) : null, gradePct: z0 != null && z1 != null && best.d > 1 ? r1(Math.abs(z1 - z0) / best.d * 100) : null,
    behindChoke: areaOf[e.id] >= 0 ? areaOf[e.id] : null };
}
const kindOf = e => e.mode === 'path' ? (/STEPS/.test(e.name) ? 'stairs' : 'path') : e.mode === 'restricted' ? 'no-vehicle street' : e.barrier?.closed ? (e.barrier.gate ? 'gate' : e.barrier.kind) : e.disconnected ? 'disconnected street' : 'street';
const areaOfNode = n => { for (const id of nodeEdgesAll[n]) if (drivable(edges[id]) && areaOf[id] >= 0) return areaOf[id]; return null; };
// Existing non-drivable link (paths and stairs, County TRVLWAY NT streets, closed barriers) from the area to a drivable street outside it.
function existingLink(insideNode, allow, dIn, dOut) {
  const dist = new Map(), prev = new Map(), heap = [];
  for (const n of insideNode) { dist.set(n, 0); heap.push([0, n]); }
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, n] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
    if (d > dist.get(n)) continue;
    if (!insideNode.has(n) && hasDrivable[n]) {
      const ids = []; let start = n; for (let v = n; prev.has(v); v = prev.get(v)[0]) { ids.push(prev.get(v)[1]); start = prev.get(v)[0]; }
      const es = ids.reverse().map(i => edges[i]);
      return { lengthM: r0(d), maxGradePct: r1(Math.max(...es.map(e => Math.abs(e.gradeMax ?? e.grade ?? 0)))), names: [...new Set(es.map(e => title(e.name)))],
        kinds: [...new Set(es.map(kindOf))], enginesPass: es.every(e => e.barrier?.closed ? !!e.barrier.engines : e.mode === 'vehicle'), edges: ids,
        reaches: title(edges[nodeEdgesAll[n].find(i => drivable(edges[i]))].name), reachesArea: areaOfNode(n),
        drivingNowM: r0((dIn.get(start) ?? Infinity) + (dOut.get(n) ?? Infinity)) };
    }
    if (d > 1500) continue;
    for (const id of nodeEdgesAll[n]) {
      const e = edges[id]; if (drivable(e) || !allow(e)) continue;
      const w = e.a === n ? e.b : e.a, nd = d + e.len;
      if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); prev.set(w, [n, id]); heap.push([nd, w]); }
    }
  }
  return null;
}

// SB 99 narrow-road tiers by clear width after parking (KLD TR-1380 Rev. 3, p. 4): severely ≤ 6 ft, moderately 7–8 ft, constrained 9–10 ft.
const FT = 0.3048;
const tier = c => c == null ? 'unknown' : c < 6.5 * FT ? 'severely constrained' : c < 8.5 * FT ? 'moderately constrained' : c < 10 * FT ? 'constrained' : 'not narrow';
const NARROW_FACTOR = { 'severely constrained': 4, 'moderately constrained': 3, constrained: 2, 'not narrow': 1, unknown: 1 };

// ---------- per-area metrics ----------
const out = areas.map((a, i) => {
  const entrance = a.entrance.map(m => edges[arcs[m - nN][0]]), stem = a.list.map(m => edges[arcs[m - nN][0]]);
  const res = a.members.reduce((s, e) => s + people[e.id], 0);
  const resHill = a.members.reduce((s, e) => s + (hills(e) ? people[e.id] : 0), 0);
  const fz = {}, lenFz = {};
  for (const e of a.members) { const k = e.fireZone ?? 0; fz[k] = (fz[k] || 0) + people[e.id]; lenFz[k] = (lenFz[k] || 0) + e.len; }
  const minClear = list => { let best = null; for (const e of list) { const c = clearOf(e.id); if (c != null && (best == null || c < best.c)) best = { c, e }; } return best; };
  const cE = minClear(entrance), cS = minClear(stem);
  const widths = entrance.map(e => e.widthM).filter(w => w != null);
  const grades = a.members.filter(e => e.gradeReliable !== false).map(e => Math.abs(e.gradeMax ?? e.grade ?? 0));
  const memberSet = new Set(a.members.map(e => e.id));
  const insideNode = new Set(); for (const e of a.members) for (const n of [e.a, e.b]) if (inSub(a.head, n)) insideNode.add(n);
  const outer = arcs[a.head - nN][2];
  const dIn = dijkstra(outer, id => memberSet.has(id), 8000, true), dOut = dijkstra(outer, id => !memberSet.has(id)); // to the choke from inside; from the choke outside
  const pts = samples(a.members, dIn);
  const nearOther = nearestOutside(pts, id => !memberSet.has(id), dOut);
  const nearFree = nearestOutside(pts, id => areaOf[id] < 0, dOut);
  const walk = existingLink(insideNode, e => e.mode === 'path' || e.mode === 'restricted' || e.barrier?.closed, dIn, dOut);
  const gate = existingLink(insideNode, e => e.mode === 'vehicle' && e.barrier?.closed, dIn, dOut);
  const zones = {}; for (const e of a.members) if (people[e.id] > 0) zones[e.evacZone] = (zones[e.evacZone] || 0) + people[e.id];
  const hh = res / D.personsPerHousehold, hillShare = res > 0 ? resHill / res : 0;
  const t = tier(cE?.c ?? null);
  const xs = a.members.flatMap(e => e.geom.map(p => p[0])), ys = a.members.flatMap(e => e.geom.map(p => p[1]));
  return {
    id: `AC-${String(i + 1).padStart(3, '0')}`,
    type: entrance.every(e => isBridge.has(e.id)) ? 'dead end' : 'one-way',
    chokeEdges: entrance.map(e => e.id), chokeStreets: [...new Set(entrance.map(e => title(e.name)))],
    chokeLengthM: r0(entrance.reduce((s, e) => s + e.len, 0)),
    chokeOuterNode: outer, chokeAt: nodes[outer].slice(0, 2),
    stemChokeEdges: stem.map(e => e.id),
    streets: [...new Set(a.members.map(e => title(e.name)))],
    memberEdges: a.members.map(e => e.id),
    streetLengthM: r0(a.members.reduce((s, e) => s + e.len, 0)),
    residents: r1(res), households: r1(hh), vehicles: r1(hh * vehPerHH),
    hillResidents: r1(resHill), hillShare: Math.round(hillShare * 100) / 100,
    residentsByFireZone: Object.fromEntries(Object.entries(fz).map(([k, v]) => [k, r1(v)])),
    streetLengthByFireZoneM: Object.fromEntries(Object.entries(lenFz).map(([k, v]) => [k, r0(v)])),
    evacZones: Object.fromEntries(Object.entries(zones).sort((p, q) => q[1] - p[1]).map(([k, v]) => [k, r1(v)])),
    nesting: a.nesting, parent: a.parent < 0 ? null : a.parent,
    choke: { pavementWidthM: widths.length ? Math.min(...widths) : null, clearWidthM: r1(cE?.c ?? null), clearWidthFt: cE ? r1(cE.c / FT) : null,
      sb99Tier: t, engineFits: cE ? cE.c >= A.access.engineClearM : null, fireCodeWidth: cE ? cE.c >= A.access.fireCodeClearM : null,
      cityNarrowRoad: entrance.some(e => e.narrow), widthSrc: [...new Set(entrance.map(e => e.clearWidthSrc || e.widthSrc).filter(Boolean))],
      gradeMaxPct: r1(Math.max(...entrance.map(e => Math.abs(e.gradeMax ?? 0)))) },
    narrowestStemChoke: cS ? { clearWidthM: r1(cS.c), street: title(cS.e.name), edge: cS.e.id, engineFits: cS.c >= A.access.engineClearM } : null,
    steepestGradePct: grades.length ? r1(Math.max(...grades)) : null,
    nearestOtherStreet: hint(nearOther),
    nearestFreeStreet: hint(nearFree),
    existingLink: walk, emergencyVehicleLink: gate,
    constraint: { residents: r1(res), nesting: a.nesting, narrowFactor: NARROW_FACTOR[t], hillFactor: Math.round((1 + hillShare) * 100) / 100,
      score: r0(res * a.nesting * NARROW_FACTOR[t] * (1 + hillShare)) },
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(r0),
  };
});
const idOf = i => i == null ? null : out[i].id;
for (const o of out) {
  o.parent = idOf(o.parent);
  if (o.nearestOtherStreet) o.nearestOtherStreet.behindChoke = idOf(o.nearestOtherStreet.behindChoke);
  if (o.nearestFreeStreet) delete o.nearestFreeStreet.behindChoke;
  for (const L of [o.existingLink, o.emergencyVehicleLink]) if (L) L.reachesArea = idOf(L.reachesArea);
}
const byId = new Map(out.map(o => [o.id, o]));
const chain = o => { const c = []; for (let a = o; a; a = a.parent ? byId.get(a.parent) : null) c.push(a); return c; };

// ---------- totals, data checks ----------
const sumP = (list, f = () => true) => list.reduce((s, e) => s + (f(e) ? people[e.id] : 0), 0);
const behind = vehEdges.filter(e => areaOf[e.id] >= 0);
const isBerk = e => /^(BER|LBL)-/.test(e.evacZone || '');
const dead = e => out[areaOf[e.id]] && chain(out[areaOf[e.id]]).some(a => a.type === 'dead end');
const trappedEdges = vehEdges.filter(e => !(edgeArcs.get(e.id) || []).some(m => tin[m] >= 0));
const hillExits = [...exits].filter(n => nodeEdgesAll[n].some(id => drivable(edges[id]) && hills(edges[id])));
const totals = {
  modeledResidents: r0(sumP(vehEdges)), modeledHillResidents: r0(sumP(vehEdges, hills)),
  residentsBehindAnyChoke: r0(sumP(behind)), hillResidentsBehindAnyChoke: r0(sumP(behind, hills)),
  hillResidentsBehindDeadEnd: r0(sumP(behind, e => hills(e) && dead(e))),
  hillResidentsBehindOneWayOnly: r0(sumP(behind, e => hills(e) && !dead(e))),
  hillResidentsBehindTwoOrMore: r0(sumP(behind, e => hills(e) && out[areaOf[e.id]].nesting >= 2)),
  hillResidentsBehindEngineBlockedChoke: r0(sumP(behind, e => hills(e) && chain(out[areaOf[e.id]]).some(a => a.choke.engineFits === false || a.narrowestStemChoke?.engineFits === false))),
  berkeleyHillResidents: r0(sumP(vehEdges, e => hills(e) && isBerk(e))),
  berkeleyHillResidentsBehindAnyChoke: r0(sumP(behind, e => hills(e) && isBerk(e))),
  berkeleyHillResidentsBehindDeadEnd: r0(sumP(behind, e => hills(e) && isBerk(e) && dead(e))),
  areas: out.length, areasWithResidents: out.filter(o => o.residents >= 1).length,
  deadEndAreas: out.filter(o => o.type === 'dead end').length, oneWayAreas: out.filter(o => o.type === 'one-way').length,
  hillAreasWithResidents: out.filter(o => o.residents >= 1 && o.hillShare >= 0.5).length,
  byNesting: Object.fromEntries([...new Set(out.map(o => o.nesting))].sort((a, b) => a - b).map(k => [k, out.filter(o => o.nesting === k).length])),
  exits: exits.size, exitsOnHillStreets: hillExits.length,
  residentsWithNoRouteOut: r1(sumP(trappedEdges)),
};
const trapped = { edges: trappedEdges.map(e => e.id), streets: [...new Set(trappedEdges.map(e => title(e.name)))], residents: r1(sumP(trappedEdges)) };
// Zones whose whole population lands on a short street length (allocation artifact check)
const crowded = layers.evacZones.filter(z => (z.popModeled ?? z.pop) > 300 && zoneStreetM.get(z.id) != null)
  .map(z => ({ zone: z.id, people: z.popModeled ?? z.pop, streetM: r0(zoneStreetM.get(z.id)), perKm: r0((z.popModeled ?? z.pop) / zoneStreetM.get(z.id) * 1000) }))
  .filter(z => z.perKm > 2000).sort((a, b) => b.perKm - a.perKm);

// ---------- SB 99 Table 1 primary AINs (KLD TR-1380 Rev. 3, pp. 6–9) vs the areas found here ----------
let sb99 = null;
const sbPath = path.join(R, 'data/raw/docs/sb99.txt');
if (fs.existsSync(sbPath)) {
  const lines = fs.readFileSync(sbPath, 'utf8').split('\n');
  const s0 = lines.findIndex(l => /Table 1\. Access Impaired Neighborhoods\s*$/.test(l)), s1 = lines.findIndex(l => /Total Primary AIN\b/.test(l));
  // Zone labels are printed in the middle of each zone's group of rows, so a row belongs to the
  // label before it or the one after it; both are kept and either may match.
  const rows = [], labels = []; let pending = null;
  lines.slice(s0, s1).forEach((l, i) => {
    const zm = l.match(/(BER|OKL|ALB|LBL)-E(\d{3})/); if (zm) labels.push([i, `${zm[1]}-${zm[2]}`]);
    const m = l.replace(/^\s*(Primary)?\s*((BER|OKL|ALB|LBL)-E\d{3})?/, '').match(/^\s*(.+?)\s{2,}(Yes|No)\s+(\d+)\s*$/);
    if (m) { rows.push({ i, street: (pending ? pending + ' ' : '') + m[1].trim(), exit: m[2] === 'Yes', parcels: +m[3] }); pending = null; }
    else if (/^\s+Private (Dr|Driveway|Drive)/.test(l)) pending = l.trim();
    else if (pending && l.trim() && !/(BER|OKL)-E/.test(l)) pending += ' ' + l.trim();
  });
  for (const r of rows) {
    const before = labels.filter(([i]) => i <= r.i).pop(), after = labels.find(([i]) => i > r.i);
    r.zones = [...new Set([before?.[1], after?.[1]].filter(Boolean))]; delete r.i;
  }
  const norm = s => s.toUpperCase().replace(/\bAVE\b/, 'AV').replace(/\bCIRCLE\b/, 'CI').replace(/\bCIR\b/, 'CI').replace(/\bCOURT\b/, 'CT').replace(/\bPLACE\b/, 'PL').replace(/\bWAY\b/, 'WY').replace(/\bBLVD\b/, 'BL').replace(/\bCOMMONS\b/, 'CM').replace(/^[EW] /, '')
    .replace(/\bNOTH\b/, 'NORTH').replace(/\bACTION\b/, 'ACTON').replace(/\bHIGARD\b/, 'HILGARD') // typos in Table 1.replace(/\s+/g, ' ').trim();
  const zoneBox = new Map(layers.evacZones.map(z => { const p = z.rings.flat(); return [z.id, [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]]; }));
  const areaKeys = out.map(o => ({ o, names: new Set(o.memberEdges.map(id => norm(title(edges[id].name)))), zones: new Set(o.memberEdges.map(id => edges[id].evacZone)) }));
  const matched = rows.map(r => {
    const k = norm(r.street), private_ = /^Private/i.test(r.street);
    const named = areaKeys.filter(a => a.names.has(k));
    // same zone, or the area lies within 150 m of the zone's outline box (zone outlines and street midpoints disagree at edges)
    const near = a => r.zones.some(z => { const b = zoneBox.get(z), q = a.o.bbox; return b && q[0] < b[2] + 150 && q[2] > b[0] - 150 && q[1] < b[3] + 150 && q[3] > b[1] - 150; });
    const hit = named.filter(a => r.zones.some(z => a.zones.has(z)) || near(a)).map(a => a.o);
    const inNetwork = edges.some(e => e.mode === 'vehicle' && norm(title(e.name)) === k);
    return { ...r, private: private_, inNetwork, areas: hit.map(o => o.id), deadEnd: hit.some(o => o.type === 'dead end') };
  });
  const nonPrivate = matched.filter(r => !r.private);
  const sbNames = new Set(matched.map(r => norm(r.street)));
  const ourHill = out.filter(o => o.type === 'dead end' && o.residents >= 5 && o.hillShare >= 0.5 && o.memberEdges.some(id => /^(BER|LBL)-/.test(edges[id].evacZone || '')));
  const notInSb = ourHill.filter(o => !o.memberEdges.some(id => sbNames.has(norm(title(edges[id].name)))));
  sb99 = {
    source: 'SB 99 Access Impaired Neighborhood Analysis, KLD TR-1380 Rev. 3 (2024-02-19), Table 1, primary AINs; parsed from data/raw/docs/sb99.txt',
    primaryRows: matched.length, primaryParcels: matched.reduce((s, r) => s + r.parcels, 0),
    privateDriveRows: matched.length - nonPrivate.length,
    rowsMatched: nonPrivate.filter(r => r.areas.length).length,
    parcelsMatched: nonPrivate.filter(r => r.areas.length).reduce((s, r) => s + r.parcels, 0),
    rowsMatchedDeadEnd: nonPrivate.filter(r => r.deadEnd).length,
    unmatched: nonPrivate.filter(r => !r.areas.length).map(r => ({ zones: r.zones, street: r.street, parcels: r.parcels, potentialEmergencyExit: r.exit, streetInNetwork: r.inNetwork })),
    berkeleyHillDeadEnds: ourHill.length,
    berkeleyHillDeadEndsNotInTable1: notInSb.map(o => ({ id: o.id, streets: o.streets, residents: o.residents })),
    rows: matched,
  };
}
// City Narrow_Roads segments among the choke edges and among the streets behind them
const narrowStats = {
  hillChokeAreas: out.filter(o => o.residents >= 1 && o.hillShare >= 0.5).length,
  hillChokeAreasWithNarrowRoadChoke: out.filter(o => o.residents >= 1 && o.hillShare >= 0.5 && o.choke.cityNarrowRoad).length,
  narrowRoadSegments: edges.filter(e => e.narrow && drivable(e)).length,
  narrowRoadSegmentsBehindChoke: edges.filter(e => e.narrow && drivable(e) && areaOf[e.id] >= 0).length,
  narrowRoadKmBehindChoke: r1(edges.filter(e => e.narrow && drivable(e) && areaOf[e.id] >= 0).reduce((s, e) => s + e.len, 0) / 1000),
  narrowRoadKm: r1(edges.filter(e => e.narrow && drivable(e)).reduce((s, e) => s + e.len, 0) / 1000),
};

// Areas whose residents come mostly from a zone with more than 5,000 people per km of street (allocation artifact)
const crowdedSet = new Set(crowded.filter(z => z.perKm > 5000).map(z => z.zone));
for (const o of out) { const c = Object.entries(o.evacZones).filter(([z]) => crowdedSet.has(z)).reduce((s, [, v]) => s + v, 0); if (c > o.residents / 2) o.allocationWarning = `most residents come from ${Object.keys(o.evacZones).filter(z => crowdedSet.has(z)).join(', ')}, whose whole population lands on ${crowded.find(z => crowdedSet.has(z.zone)).streetM} m of street`; }
// Edge effect: hill residents within 500 m of driving to an exit on a hill street (that exit may hide a dead end beyond the grid)
{ const d = dijkstra(hillExits, () => true, 500, true), near = e => (d.get(e.a) ?? Infinity) <= 500 || (d.get(e.b) ?? Infinity) <= 500;
  totals.hillResidentsWithin500mOfHillExit = r0(sumP(vehEdges, e => hills(e) && near(e))); }
const top = (k, n) => out.slice().sort((a, b) => k(b) - k(a)).slice(0, n);
const result = {
  meta: {
    built: new Date().toISOString().slice(0, 10), tool: 'tools/access-constraints.mjs', report: 'docs/access-constraints.md',
    note: 'Educational comparison, not a prediction and not an official evacuation plan. Street-segment level only; no parcels or addresses. Coordinates in local meters (network.json crs).',
    crs: net.meta.crs, opened: [...OPEN],
    provenance: {
      graph: 'derived: data/model/network.json drivable edges as js/sim.js builds links (vehicle mode, not disconnected, not closed by a barrier; one arc per direction with lanes)',
      exits: 'model rule: net.meta.exitNodes, streets cut at the edge of the elevation grid',
      chokeEdges: 'derived: the entrance choke, edge dominators of the reversed graph rooted at the exits; arcs in series through a node with two drivable streets form one entrance',
      stemChokeEdges: 'derived: every choke arc on the same dead-end stem (model rule: a choke whose outer end has a single way out joins the area above it)',
      type: 'derived: "dead end" if every entrance edge is a bridge of the undirected drivable network, else "one-way" (one-way directions from the County TRVLWAY field and OSM oneway tags)',
      nesting: `derived: number of areas in series between the area and an exit, its own included (model rule: a loop of under ${SMALL_LOOP_M} m of street does not start a new area)`,
      residents: 'synthetic: zone population inside the model area (Genasys, or the 2020 Census where data/assumptions.json population.overrides or a missing estimate says so) spread over street length as js/sim.js does (Principal Arterials weighted 0.7; no freeways or ramps); expected values',
      households: `assumption: residents / ${D.personsPerHousehold} persons per household (data/assumptions.json demand)`,
      vehicles: `assumption: households × (1 − ${D.householdsWithoutVehicleShare}) × ${meanVeh.toFixed(3)} vehicles taken (Time Study Fig. D-11 shares, data/assumptions.json demand)`,
      choke: 'derived: narrowest entrance edge under status-quo parking in its nominal state (js/parking.js, seed null: both sides where they fit, perfect parking); engine fits if clear width ≥ access.engineClearM (10 ft); fire-code width 20 ft; tiers from the SB 99 report p. 4',
      steepestGradePct: 'derived: largest 25 m-window grade (gradeMax, DEM) on any street in the area, unreliable segments left out',
      nearestOtherStreet: `derived: shortest straight line from the area streets (sampled every 10 m) to a drivable street outside the area (no freeways or ramps) where driving from the area point to the outside point now, along legal one-way directions, takes at least ${MIN_DETOUR_M} m and ${DETOUR_RATIO} times the line (model rule); climb from the DEM. A hint, not a route or a design`,
      nearestFreeStreet: 'derived: same, to a street behind no choke point',
      existingLink: 'derived: shortest chain of path, stairway, no-vehicle (County TRVLWAY NT) or barrier-closed segments from the area to a drivable street outside it (search limit 1.5 km)',
      emergencyVehicleLink: 'derived: same, through barrier-closed vehicle segments only (diverters, bollards, gates); enginesPass from OSM emergency=yes',
      constraint: 'model rule: score = residents × nesting × narrowFactor × hillFactor; narrowFactor 4/3/2/1 for SB 99 tiers severely (≤ 6 ft) / moderately (7–8 ft) / constrained (9–10 ft) / not narrow, unknown width 1; hillFactor = 1 + share of residents on Fire Zone 2–3 streets',
    },
  },
  totals, trapped, crowdedZones: crowded, narrowRoads: narrowStats, hillExitNodes: hillExits, sb99,
  rankings: { byResidents: top(o => o.residents, 50).map(o => o.id), byConstraint: top(o => o.constraint.score, 50).map(o => o.id) },
  areas: out,
};

const fmt = o => `${o.id} ${o.type} n${o.nesting} [${o.chokeStreets.join('/')}] ${o.streets.slice(0, 6).join(', ')}${o.streets.length > 6 ? '…' : ''} | res ${o.residents} hill ${o.hillResidents} hh ${o.households} veh ${o.vehicles} | clear ${o.choke.clearWidthM} ${o.choke.engineFits === false ? 'NO-ENGINE' : o.choke.engineFits ? 'engine' : '?'} stem ${o.narrowestStemChoke?.clearWidthM} | ${o.streetLengthM} m | grade ${o.steepestGradePct} | alt ${o.nearestOtherStreet?.street} ${o.nearestOtherStreet?.distM} m (drive ${o.nearestOtherStreet?.drivingNowM}) free ${o.nearestFreeStreet?.street} ${o.nearestFreeStreet?.distM}${o.existingLink ? ` | link ${o.existingLink.kinds.join('+')} ${o.existingLink.names.join('+')} ${o.existingLink.lengthM} m` : ''} | score ${o.constraint.score}`;
if (argv.includes('--json')) { fs.writeFileSync(argv[argv.indexOf('--json') + 1], JSON.stringify(result)); process.exit(0); } // used by the report's what-if
console.log(JSON.stringify(totals));
if (VERBOSE || OPEN.size) {
  console.log('\nBY RESIDENTS'); top(o => o.residents, 30).forEach(o => console.log(fmt(o)));
  console.log('\nBY CONSTRAINT'); top(o => o.constraint.score, 30).forEach(o => console.log(fmt(o)));
  console.log('\ntrapped', JSON.stringify(trapped), '\ncrowded', JSON.stringify(crowded), '\nnarrow', JSON.stringify(narrowStats));
  if (sb99) console.log('\nSB99', JSON.stringify({ ...sb99, rows: undefined }));
}
if (OPEN.size) process.exit(0);
fs.writeFileSync(path.join(R, 'data/model/access-constraints.json'), JSON.stringify(result));
fs.mkdirSync(path.join(R, 'docs'), { recursive: true });
// What-if for the report: the County's no-vehicle piece of Bancroft Way between Prospect St and the
// foot of Panoramic Way (edge 2322, "BANCROFT STEPS WY", TRVLWAY NT) opened to cars, as OSM maps it.
const { execFileSync } = await import('node:child_process');
const tmp = path.join((await import('node:os')).tmpdir(), `access-constraints-whatif-${process.pid}.json`);
execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--open', '2322', '--json', tmp]);
const whatIf = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
fs.writeFileSync(path.join(R, 'docs/access-constraints.md'), (await import(R + '/tools/access-constraints-report.mjs')).report(result, whatIf));
console.log('wrote data/model/access-constraints.json and docs/access-constraints.md');
