#!/usr/bin/env node
// Home-to-street walking and stair access in the hills, and carless households' walks out.
//
//   node tools/walk-access.mjs [--ms <global-buildings tile .csv.gz>] [--osm-buildings <overpass json>]
//        writes data/model/walk-access.json and docs/walk-access.md
//
// Inputs: data/model/network.json, data/model/layers.json, the 4 m DEM, OpenStreetMap stairways and
// paths (data/raw/osm/walk-ways.json, query next to it) and building footprints. Footprints come from
// Microsoft Global ML Building Footprints (one quadkey tile, URL in SOURCE_NOTES WA2), reduced on first
// read to centroids and areas in data/raw/walk/ (gitignored, never committed); OpenStreetMap buildings
// are used too when an Overpass response is given (they could not be fetched on 2026-11-03, WA3).
//
// Method (model rules unless marked; docs/walk-access.md lists them with their sources):
// - Hill buildings: footprint centroid in Berkeley's Fire Zones 2–3, or outside Berkeley at 90 m DEM
//   elevation or higher (the simulator's hill proxy, HANDOFF "Gotchas"); footprints under 25 m² are
//   dropped as sheds (assumption).
// - Each hill building is joined to the nearest street segment that carries synthetic households
//   (js/sim.js residentialStreets), up to 150 m; horizontal distance and height difference
//   centroid → nearest point of the street centerline, both from the DEM.
// - Path or stair access: a public stairway or path (OSM steps, footway, path, pedestrian; not
//   sidewalks, crossings or access=private) lies within 30 m of the centroid and at least 10 m closer
//   than the street.
// - Door-to-curb route: the straight line. Where it is steeper than 25% (a steep driveway), stairs
//   take the whole rise at Fruin's 32° stair geometry (178 mm riser, 286 mm tread), the rest is
//   level walking. Tobler's hiking function sets walking speed on slopes; stair speeds are horizontal
//   free-flow speeds (Fruin via Pouw et al. 2024); reduced mobility uses the MUTCD slower-pedestrian
//   walking speed and NIST's stair speed for people with mobility impairments.
// - Departure delay (for the opt-in simulator setting): the terrain's extra time over walking the same
//   distance on the level, for three legs (two trips out with belongings, one back; assumption),
//   central speeds. Only per-segment quantiles are stored; segments with fewer than 5 buildings use
//   their evacuation zone's pooled hill buildings, so no single building's result is stored.
// - Carless walks: a pedestrian network of every street except freeways and ramps, plus OSM
//   stairways and paths snapped to the streets within 15 m; time to the nearest street outside each
//   scenario's order and warning area (the simulator's orders at medium severity, seed 1) and to the
//   nearest of the City's 13 shelter sites, with and without stairways and paths. Nodes upwind of the
//   ignition point are not targets, so no route leads out past the fire's start.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { toUTM } = await import(R + '/tools/utm.mjs');
const { demSampler } = await import(R + '/tools/egress-link.mjs');
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const readJSON = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const net = readJSON('data/model/network.json'), layers = readJSON('data/model/layers.json'), A = readJSON('data/assumptions.json');
const dem = readJSON('data/terrain/dem.json');
const demBuf = fs.readFileSync(path.join(R, 'data/terrain/dem.i16'));
const Z = new Int16Array(demBuf.buffer, demBuf.byteOffset, demBuf.length / 2);
const elev = demSampler(dem, Z);
const O = net.meta.origin;
const toLocal = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
const r0 = v => v == null ? null : Math.round(v), r1 = v => v == null ? null : Math.round(v * 10) / 10, r2 = v => v == null ? null : Math.round(v * 100) / 100;
const CACHE = path.join(R, 'data/raw/walk'); fs.mkdirSync(CACHE, { recursive: true });

// ---------- walking-speed model (sources in SOURCE_NOTES WA4–WA8) ----------
export const SPEEDS = {
  // Tobler (1993): W = 6 exp(-3.5 |dh/dx + 0.05|) km/h; 5.04 km/h (1.40 m/s) on the level.
  tobler: s => 6 * Math.exp(-3.5 * Math.abs(s + 0.05)) / 3.6,
  central: { stairUp: 0.51, stairDown: 0.67 },      // Fruin (1971), 178/286 mm stair, horizontal free-flow speeds (Pouw et al. 2024 Table 1)
  reducedFlat: 0.914,                               // MUTCD §4E.06: 3.0 ft/s, the slower-pedestrian check
  reducedStairAlong: 0.31,                          // Kuligowski et al. (2014), NIST: mean stair speed of people with mobility impairments
  stairRisePerRun: 178 / 286,                       // Fruin's 32° stair
};
const COS32 = Math.cos(Math.atan(SPEEDS.stairRisePerRun));
SPEEDS.reduced = { stairDown: SPEEDS.reducedStairAlong * COS32, stairUp: SPEEDS.reducedStairAlong * COS32 * SPEEDS.central.stairUp / SPEEDS.central.stairDown };
const RULES = { minFootprintM2: 25, maxStreetM: 150, pathNearM: 30, pathCloserM: 10, maxWalkSlope: 0.25, legs: 3, minBuildings: 5, snapM: 15, maxRiseSlope: 1, maxRiseFloorM: 15 };
// level and sloped walking speed for a profile ('central' | 'reduced'); s = rise / run in the direction of travel
const walkV = (p, s) => p === 'central' ? SPEEDS.tobler(s) : SPEEDS.reducedFlat * SPEEDS.tobler(s) / SPEEDS.tobler(0);
const stairV = (p, up) => SPEEDS[p][up ? 'stairUp' : 'stairDown'];
// Door-to-curb time (s) for horizontal distance d and rise dz (curb minus door: negative = going down)
function legTime(p, d, dz) {
  d = Math.max(d, 1);
  if (Math.abs(dz) / d <= RULES.maxWalkSlope) return d / walkV(p, dz / d);
  const run = Math.abs(dz) / SPEEDS.stairRisePerRun;
  return run / stairV(p, dz > 0) + Math.max(0, d - run) / walkV(p, 0);
}

// ---------- geometry helpers ----------
const bbox = rings => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; };
const inBB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function inPoly(x, y, rings) { let inside = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
function nearestOnSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const x = ax + t * dx, y = ay + t * dy; return { t, x, y, d: Math.hypot(px - x, py - y) }; }
const q = (sorted, p) => { if (!sorted.length) return null; const i = p * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]); };
const QS = [0.1, 0.25, 0.5, 0.75, 0.9];

const fz23 = layers.fireZones.filter(z => z.zone >= 2).map(z => ({ rings: z.rings, bb: bbox(z.rings) }));
const city = layers.cityBoundary.map(z => ({ rings: z.rings, bb: bbox(z.rings) }));
const inCity = (x, y) => city.some(c => inBB(c.bb, x, y) && inPoly(x, y, c.rings));
const zonesL = layers.evacZones.map(z => ({ id: z.id, rings: z.rings, bb: bbox(z.rings) }));
function hillOf(x, y) { // 'fz23' (Berkeley Fire Zones 2–3), 'proxy' (outside Berkeley, ≥ 90 m) or null
  if (fz23.some(f => inBB(f.bb, x, y) && inPoly(x, y, f.rings))) return 'fz23';
  const z = elev(x, y); if (z == null) return null;
  return !inCity(x, y) && z >= 90 ? 'proxy' : null;
}

// ---------- 1. buildings ----------
async function msCentroids(file) {
  const out = path.join(CACHE, 'ms-centroids.json');
  if (fs.existsSync(out) && !file) return JSON.parse(fs.readFileSync(out, 'utf8'));
  if (!file) return null;
  const [w, s] = [-122.334, 37.836], [e, n] = [-122.206, 37.912];
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()) });
  const pts = [];
  for await (const line of rl) {
    if (!line) continue;
    const f = JSON.parse(line), ring = f.geometry.coordinates[0];
    const lon0 = ring[0][0], lat0 = ring[0][1]; if (lon0 < w || lon0 > e || lat0 < s || lat0 > n) continue;
    const P = ring.map(([lo, la]) => toLocal(lo, la));
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < P.length - 1; i++) { const c = P[i][0] * P[i + 1][1] - P[i + 1][0] * P[i][1]; a += c; cx += (P[i][0] + P[i + 1][0]) * c; cy += (P[i][1] + P[i + 1][1]) * c; }
    if (!a) continue; a /= 2; cx /= 6 * a; cy /= 6 * a;
    pts.push([r1(cx), r1(cy), r0(Math.abs(a))]);
  }
  fs.writeFileSync(out, JSON.stringify({ source: path.basename(file), extracted: new Date().toISOString(), bboxLonLat: [w, s, e, n], fields: ['x', 'y', 'areaM2'], pts }));
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}
const NON_HOME = /^(garage|garages|shed|roof|carport|hut|greenhouse|construction|ruins|kiosk|toilets|service|transformer_tower|water_tower|storage_tank|bunker|static_caravan|church|chapel|school|university|college|hospital|commercial|retail|industrial|warehouse|office|public|civic|government|fire_station|train_station|transportation|stadium|sports_hall|parking)$/;
function osmCentroids(file) {
  if (!file || !fs.existsSync(file)) return null;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { pts: j.elements.filter(el => el.center && !NON_HOME.test(el.tags?.building || '')).map(el => [...toLocal(el.center.lon, el.center.lat).map(r1), null]), base: j.osm3s?.timestamp_osm_base };
}
const ms = await msCentroids(arg('--ms'));
const osmB = osmCentroids(arg('--osm-buildings'));
if (!ms && !osmB) throw new Error('no building footprints: pass --ms <tile.csv.gz> (see SOURCE_NOTES WA2) or --osm-buildings <overpass.json>');
const BSRC = ms ? 'ms' : 'osm';
const bpts = (ms ? ms.pts : osmB.pts).filter(([, , a]) => a == null || a >= RULES.minFootprintM2);

// ---------- 2. streets that carry households (js/sim.js residentialStreets) ----------
const RANK3 = new Set(['Ramp', 'Interstate']);
const resEdge = e => e.mode === 'vehicle' && !e.disconnected && !e.barrier?.closed && e.evacZone != null && !RANK3.has(e.cls);
const G = 100, sGrid = new Map();
const addGrid = (grid, x, y, v) => { const k = `${Math.floor(x / G)},${Math.floor(y / G)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v); };
const streetSegs = [];
for (const e of net.edges) if (resEdge(e)) for (let i = 1; i < e.geom.length; i++) {
  const [a, b] = [e.geom[i - 1], e.geom[i]]; const k = streetSegs.length; streetSegs.push([e.id, a, b]);
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (G / 2)) + 1;
  const seen = new Set(); for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n, key = `${Math.floor(x / G)},${Math.floor(y / G)}`; if (!seen.has(key)) { seen.add(key); addGrid(sGrid, x, y, k); } }
}
function nearest(grid, segs, x, y, maxR) {
  let best = null; const gx = Math.floor(x / G), gy = Math.floor(y / G), rr = Math.ceil(maxR / G);
  for (let i = gx - rr; i <= gx + rr; i++) for (let j = gy - rr; j <= gy + rr; j++) for (const k of grid.get(`${i},${j}`) || []) {
    const [id, a, b] = segs[k]; const p = nearestOnSeg(x, y, a[0], a[1], b[0], b[1]);
    if (p.d <= maxR && (!best || p.d < best.d)) best = { ...p, id, k };
  }
  return best;
}

// ---------- 3. OpenStreetMap stairways and paths ----------
const ways = JSON.parse(fs.readFileSync(path.join(R, 'data/raw/osm/walk-ways.json'), 'utf8'));
const WAYS_BASE = ways.osm3s?.timestamp_osm_base;
const isPublic = t => !/^(private|no)$/.test(t.access || '') && !/^(private|no)$/.test(t.foot || '');
const pedWays = ways.elements.filter(w => w.type === 'way' && w.geometry?.length >= 2 && isPublic(w.tags || {}));
const accessWays = pedWays.filter(w => !/^(sidewalk|crossing)$/.test(w.tags.footway || ''));
const pSegs = [], pGrid = new Map();
for (const w of accessWays) { const pts = w.geometry.map(p => toLocal(p.lon, p.lat)); for (let i = 1; i < pts.length; i++) { const k = pSegs.length; pSegs.push([w.id, pts[i - 1], pts[i]]); addGrid(pGrid, (pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2, k); } }
// public stairways in the hills: length (horizontal) and rise from the DEM
const stairs = [];
for (const w of pedWays) {
  if (w.tags.highway !== 'steps') continue;
  const pts = w.geometry.map(p => toLocal(p.lon, p.lat)), mid = pts[Math.floor(pts.length / 2)];
  const hill = hillOf(...mid); if (!hill) continue;
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const z0 = elev(...pts[0]), z1 = elev(...pts[pts.length - 1]);
  const t = w.tags, hr = t.handrail || t['handrail:left'] || t['handrail:right'] || t['handrail:center'] || null;
  stairs.push({ osmWay: w.id, name: t.name || null, lengthM: r1(len), riseM: z0 != null && z1 != null ? r1(Math.abs(z1 - z0)) : null, stepCount: t.step_count ? +t.step_count || null : null, incline: t.incline || null, handrail: hr, hill });
}

// ---------- 4. per building → nearest street ----------
const hillB = []; let noStreet = 0, implausible = 0;
for (const [x, y] of bpts) {
  const hill = hillOf(x, y); if (!hill) continue;
  const s = nearest(sGrid, streetSegs, x, y, RULES.maxStreetM); if (!s) { noStreet++; continue; }
  const zb = elev(x, y), zc = elev(s.x, s.y); if (zb == null || zc == null) { noStreet++; continue; }
  // DEM cells at or near zero (open water, the edge of coverage) or a slope steeper than 1:1 between the
  // centroid and the curb are data faults, not terrain: the building is left out and counted
  if (zb < 1 || zc < 1 || Math.abs(zb - zc) > Math.max(RULES.maxRiseFloorM, s.d * RULES.maxRiseSlope)) { implausible++; continue; }
  const p = nearest(pGrid, pSegs, x, y, RULES.pathNearM);
  const viaPath = !!(p && p.d <= s.d - RULES.pathCloserM);
  const viaStair = viaPath && accessWaysById().get(pSegs[p.k][0]) === 'steps';
  const d = s.d, dh = zb - zc; // positive: the home is above its street
  const t = {};
  for (const pr of ['central', 'reduced']) {
    const out = legTime(pr, d, -dh), back = legTime(pr, d, dh), flat = d / walkV(pr, 0);
    t[pr] = { out, delay: Math.max(0, 2 * (out - flat) + (back - flat)) }; // a gentle downhill can be quicker than level ground; no negative delay
  }
  hillB.push({ eid: s.id, d, dh, hill, viaPath, viaStair, t });
}
function accessWaysById() { return accessWaysById.m ??= new Map(accessWays.map(w => [w.id, w.tags.highway])); }

// ---------- 5. per-segment aggregates ----------
const D = A.demand, pph = D.personsPerHousehold;
const zonePop = new Map(layers.evacZones.map(z => [z.id, z.popModeled ?? z.pop]));
const zoneW = new Map();
for (const e of net.edges) if (resEdge(e)) zoneW.set(e.evacZone, (zoneW.get(e.evacZone) || 0) + e.len * (e.cls === 'Principal Arterial' ? 0.7 : 1));
const expHH = e => resEdge(e) && zoneW.get(e.evacZone) ? (zonePop.get(e.evacZone) || 0) / pph * e.len * (e.cls === 'Principal Arterial' ? 0.7 : 1) / zoneW.get(e.evacZone) : 0;
const byEdge = new Map(), byZone = new Map();
for (const b of hillB) { if (!byEdge.has(b.eid)) byEdge.set(b.eid, []); byEdge.get(b.eid).push(b); const z = net.edges[b.eid].evacZone; if (!byZone.has(z)) byZone.set(z, []); byZone.get(z).push(b); }
function stats(list) {
  const n = list.length, sorted = f => list.map(f).sort((a, b) => a - b);
  const rise = sorted(b => Math.abs(b.dh));
  return {
    buildings: n, medianDistM: r1(q(sorted(b => b.d), 0.5)), medianRiseM: r1(q(rise, 0.5)), p90RiseM: r1(q(rise, 0.9)),
    above5: r2(list.filter(b => b.dh > 5).length / n), above10: r2(list.filter(b => b.dh > 10).length / n),
    below5: r2(list.filter(b => b.dh < -5).length / n), below10: r2(list.filter(b => b.dh < -10).length / n),
    pathAccess: list.filter(b => b.viaPath).length, stairAccess: list.filter(b => b.viaStair).length,
    outS: { central: [0.5, 0.9].map(p => r0(q(sorted(b => b.t.central.out), p))), reduced: [0.5, 0.9].map(p => r0(q(sorted(b => b.t.reduced.out), p))) },
    delayQ: QS.map(p => r0(q(sorted(b => b.t.central.delay), p))),
    delayQReduced: QS.map(p => r0(q(sorted(b => b.t.reduced.delay), p))),
  };
}
const zonePool = {};
for (const [z, list] of byZone) if (list.length >= RULES.minBuildings) zonePool[z] = stats(list);
const segments = {};
let pooledSegs = 0;
for (const e of net.edges) {
  if (!resEdge(e)) continue;
  const list = byEdge.get(e.id) || [];
  const hh = expHH(e);
  if (!list.length && !(hillOf(...e.geom[Math.floor(e.geom.length / 2)]) && zonePool[e.evacZone])) continue;
  if (list.length >= RULES.minBuildings) segments[e.id] = { name: e.name, zone: e.evacZone, households: r1(hh), ...stats(list) };
  else if (zonePool[e.evacZone]) { segments[e.id] = { name: e.name, zone: e.evacZone, households: r1(hh), buildings: list.length, pooled: true }; pooledSegs++; }
}

// ---------- 6. pedestrian network ----------
const nN = net.nodes.length;
const gx = [], gy = [], gz = [];
const addNode = (x, y) => { gx.push(x); gy.push(y); gz.push(elev(x, y) ?? 0); return gx.length - 1; };
for (const [x, y] of net.nodes) addNode(x, y);
const walkNet = e => !RANK3.has(e.cls) && !e.disconnected;
// split points on network edges where OSM paths join
const wSegs = [], wGrid = new Map();
for (const e of net.edges) if (walkNet(e)) { let acc = 0; for (let i = 1; i < e.geom.length; i++) { const a = e.geom[i - 1], b = e.geom[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const k = wSegs.length; wSegs.push([e.id, a, b, acc, L]); const n = Math.ceil(L / (G / 2)) + 1; const seen = new Set(); for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n, key = `${Math.floor(x / G)},${Math.floor(y / G)}`; if (!seen.has(key)) { seen.add(key); addGrid(wGrid, x, y, k); } } acc += L; } }
const roadNodeIds = new Set();
for (const el of readJSON('data/raw/osm/east-bay-roads.json').elements) if (el.type === 'way') for (const n of el.nodes) roadNodeIds.add(n);
const osmNode = new Map(), splits = new Map(); // edge id → [{at, node}]
const edgesG = []; // [u, v, kind, horizontal length, cUV central, cVU central, cUV reduced, cVU reduced]
function addEdge(u, v, kind, pts) {
  let L = 0; const c = { central: [0, 0], reduced: [0, 0] };
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i], d = Math.max(0.01, Math.hypot(x1 - x0, y1 - y0)), dz = z1 - z0; L += d;
    for (const p of ['central', 'reduced']) {
      if (kind === 'steps') { c[p][0] += Math.max(d, Math.abs(dz) / SPEEDS.stairRisePerRun) / stairV(p, dz > 0); c[p][1] += Math.max(d, Math.abs(dz) / SPEEDS.stairRisePerRun) / stairV(p, dz < 0); }
      else { c[p][0] += d / walkV(p, dz / d); c[p][1] += d / walkV(p, -dz / d); }
    }
  }
  edgesG.push([u, v, kind, L, c.central[0], c.central[1], c.reduced[0], c.reduced[1]]);
}
const densify = (pts, step = 8) => { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); } return out; };
const withZ = pts => pts.map(([x, y]) => [x, y, elev(x, y) ?? 0]);
let snapped = 0;
for (const w of pedWays) {
  const kind = w.tags.highway === 'steps' ? 'steps' : 'path';
  const pts = w.geometry.map(p => toLocal(p.lon, p.lat));
  const ids = w.nodes.map((n, i) => { if (!osmNode.has(n)) osmNode.set(n, addNode(...pts[i])); return osmNode.get(n); });
  for (let i = 1; i < pts.length; i++) addEdge(ids[i - 1], ids[i], kind, withZ(densify([pts[i - 1], pts[i]])));
}
const snappedOsm = new Set();
for (const w of pedWays) {
  w.nodes.forEach((n, i) => {
    if (!(i === 0 || i === w.nodes.length - 1 || roadNodeIds.has(n)) || snappedOsm.has(n)) return;
    snappedOsm.add(n); const g = osmNode.get(n);
    const s = nearest(wGrid, wSegs, gx[g], gy[g], RULES.snapM); if (!s) return;
    const [eid, , , acc, L] = wSegs[s.k];
    if (!splits.has(eid)) splits.set(eid, []);
    splits.get(eid).push({ at: acc + s.t * L, node: g, d: s.d, x: s.x, y: s.y }); snapped++;
  });
}
const edgeChain = new Map(); // network edge id → [[node, at]] in order, for segment midpoints
for (const e of net.edges) {
  if (!walkNet(e)) continue;
  const sp = (splits.get(e.id) || []).sort((p, r) => p.at - r.at);
  const geom = e.geom; let acc = 0; const cum = [0]; for (let i = 1; i < geom.length; i++) cum.push(acc += Math.hypot(geom[i][0] - geom[i - 1][0], geom[i][1] - geom[i - 1][1]));
  const chain = [[e.a, 0]]; let prev = e.a, prevAt = 0;
  const cut = (from, to) => { const pts = []; const at = f => { let i = 1; while (i < cum.length - 1 && cum[i] < f) i++; const u = (f - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); return [geom[i - 1][0] + u * (geom[i][0] - geom[i - 1][0]), geom[i - 1][1] + u * (geom[i][1] - geom[i - 1][1])]; }; pts.push(at(from)); for (let i = 1; i < geom.length - 1; i++) if (cum[i] > from && cum[i] < to) pts.push(geom[i]); pts.push(at(to)); return pts; };
  for (const p of sp) {
    const m = addNode(p.x, p.y);
    addEdge(prev, m, 'street', withZ(densify(cut(prevAt, p.at))));
    addEdge(m, p.node, 'connector', withZ([[p.x, p.y], [gx[p.node], gy[p.node]]]));
    chain.push([m, p.at]); prev = m; prevAt = p.at;
  }
  addEdge(prev, e.b, e.mode === 'path' ? 'path' : 'street', withZ(densify(cut(prevAt, acc))));
  chain.push([e.b, acc]);
  edgeChain.set(e.id, chain);
}
const NG = gx.length;
function buildAdj(keep) {
  const deg = new Int32Array(NG + 1);
  const es = edgesG.filter(keep);
  for (const [u, v] of es) { deg[u + 1]++; deg[v + 1]++; }
  for (let i = 0; i < NG; i++) deg[i + 1] += deg[i];
  const to = new Int32Array(deg[NG]), cIn = { central: new Float32Array(deg[NG]), reduced: new Float32Array(deg[NG]) }, fill = deg.slice(0, NG);
  // cIn: time to walk from the neighbor to this node (for Dijkstra from the targets outward)
  for (const [u, v, , , cuv, cvu, ruv, rvu] of es) {
    let k = fill[u]++; to[k] = v; cIn.central[k] = cvu; cIn.reduced[k] = rvu;
    k = fill[v]++; to[k] = u; cIn.central[k] = cuv; cIn.reduced[k] = ruv;
  }
  return { off: deg, to, cIn };
}
function dijkstra(adj, prof, sources) {
  const dist = new Float64Array(NG).fill(Infinity), heap = [];
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const s of sources) { dist[s] = 0; push(0, s); }
  const c = adj.cIn[prof];
  while (heap.length) {
    const [d, n] = pop(); if (d > dist[n]) continue;
    for (let k = adj.off[n]; k < adj.off[n + 1]; k++) { const m = adj.to[k], nd = d + c[k]; if (nd < dist[m]) { dist[m] = nd; push(nd, m); } }
  }
  return dist;
}
const adjAll = buildAdj(() => true);
const adjStreets = buildAdj(e => e[2] === 'street');
// time from a street segment's middle to the nearest target (min over the nodes on its chain)
function segTime(dist, eid, prof) {
  const ch = edgeChain.get(eid); if (!ch) return Infinity; const mid = ch[ch.length - 1][1] / 2, v = walkV(prof, 0);
  let best = Infinity; for (const [n, at] of ch) best = Math.min(best, dist[n] + Math.abs(at - mid) / v); return best;
}

// targets: streets outside each scenario's order and warning area (the simulator's orders, medium severity, seed 1)
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scenarios = makeScenarios(data).filter(s => s.id !== 'eastWindDay'); // same orders as eastWind
const targetSets = {};
for (const sc of scenarios) {
  const fire = runFire(grid, sc, SEVERITY.central, 1);
  const sim = new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, 1, TIME_OF_DAY[sc.timeOfDay]);
  const told = z => z >= 0 && (sim.orderT[z] < Infinity || sim.warnT[z] < Infinity);
  const th = sc.windFrom * Math.PI / 180, dwx = -Math.sin(th), dwy = -Math.cos(th), [ix, iy] = sc.ignition;
  // no walking out past the fire's start: targets on the upwind side of the ignition point are left out (model rule)
  const exitSet = new Set(net.meta.exitNodes.map(x => typeof x === 'object' ? x.node : x));
  // and, unlike the simulator, a street in no evacuation zone (Tilden's park roads) is not a target unless it is a model-area exit
  const t = []; for (let n = 0; n < nN; n++) if (sim.safe[0][n] && (sim.nodeZone[n] >= 0 || exitSet.has(n)) && (net.nodes[n][0] - ix) * dwx + (net.nodes[n][1] - iy) * dwy >= 0) t.push(n); // the simulator's safe rule: outside the order/warning area (or out of the model area) and never reached by embers
  const toldZones = new Set(); layers.evacZones.forEach((z, i) => { if (told(i)) toldZones.add(z.id); });
  targetSets[sc.id] = { name: sc.name, nodes: t, toldZones };
}
const shelterNodes = layers.shelters.map(s => data.nearestNode(...s.pt));
targetSets.shelter = { name: 'Nearest of the City\'s 13 shelter sites', nodes: shelterNodes, toldZones: null };

const carless = D.householdsWithoutVehicleShare;
const walks = {}; // per target set and profile: per hill segment time; aggregated by zone below
const hillSegs = Object.keys(segments).map(Number);
const segWalk = {};
for (const [k, T] of Object.entries(targetSets)) {
  for (const prof of ['central', 'reduced']) for (const [netName, adj] of [['all', adjAll], ['streets', adjStreets]]) {
    const dist = dijkstra(adj, prof, T.nodes);
    for (const eid of hillSegs) { const s = segments[eid]; if (T.toldZones && !T.toldZones.has(s.zone)) continue; ((segWalk[eid] ??= {})[k] ??= {})[`${prof}_${netName}`] = segTime(dist, eid, prof); }
  }
}
for (const eid of hillSegs) if (segWalk[eid]) segments[eid].walkMin = Object.fromEntries(Object.entries(segWalk[eid]).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([m, t]) => [m, Number.isFinite(t) ? r1(t / 60) : null]))]));
// zone aggregates of carless households' walks (weighted by expected carless households)
function wq(pairs, p) { const s = pairs.filter(([v]) => v != null).sort((a, b) => a[0] - b[0]); const W = s.reduce((t, [, w]) => t + w, 0); if (!W) return null; let acc = 0; for (const [v, w] of s) { acc += w; if (acc >= p * W) return v; } return s[s.length - 1][0]; }
for (const [k, T] of Object.entries(targetSets)) {
  const zs = new Map();
  for (const eid of hillSegs) { const s = segments[eid], w = s.walkMin?.[k]; if (!w) continue; if (!zs.has(s.zone)) zs.set(s.zone, []); zs.get(s.zone).push([w, s.households * carless]); }
  walks[k] = { name: T.name, targets: T.nodes.length, zones: {} };
  let all = [];
  for (const [z, list] of zs) {
    const ch = list.reduce((t, [, w]) => t + w, 0); all = all.concat(list);
    walks[k].zones[z] = { carlessHouseholds: r1(ch), ...Object.fromEntries(['central_all', 'reduced_all', 'central_streets', 'reduced_streets'].map(m => [m, { p50: wq(list.map(([w, c]) => [w[m], c]), 0.5), p90: wq(list.map(([w, c]) => [w[m], c]), 0.9) }])) };
  }
  walks[k].total = { carlessHouseholds: r1(all.reduce((t, [, w]) => t + w, 0)), ...Object.fromEntries(['central_all', 'reduced_all', 'central_streets', 'reduced_streets'].map(m => [m, { p50: wq(all.map(([w, c]) => [w[m], c]), 0.5), p90: wq(all.map(([w, c]) => [w[m], c]), 0.9), over30: r1(all.filter(([w]) => w[m] > 30).reduce((t, [, c]) => t + c, 0)), over60: r1(all.filter(([w]) => w[m] > 60).reduce((t, [, c]) => t + c, 0)) }])) };
}

// ---------- 7. zone summaries and checks ----------
const zoneSummary = {};
for (const [z, s] of Object.entries(zonePool)) {
  const segs = Object.values(segments).filter(v => v.zone === z);
  zoneSummary[z] = { ...s, households: r1(segs.reduce((t, v) => t + v.households, 0)), segments: segs.length };
}
const stairCheck = stairs.filter(s => s.stepCount && s.riseM != null);
const riser = stairCheck.map(s => s.riseM / s.stepCount).sort((a, b) => a - b);
const totals = (() => {
  const n = hillB.length, f = c => hillB.filter(c).length;
  return { hillBuildings: n, noStreetWithin150m: noStreet, demFaultDropped: implausible, above5: f(b => b.dh > 5), above10: f(b => b.dh > 10), below5: f(b => b.dh < -5), below10: f(b => b.dh < -10), pathAccess: f(b => b.viaPath), stairAccess: f(b => b.viaStair),
    medianRiseM: r1(q(hillB.map(b => Math.abs(b.dh)).sort((a, b) => a - b), 0.5)), p90RiseM: r1(q(hillB.map(b => Math.abs(b.dh)).sort((a, b) => a - b), 0.9)),
    outS: Object.fromEntries(['central', 'reduced'].map(p => [p, [0.5, 0.9, 0.99].map(x => r0(q(hillB.map(b => b.t[p].out).sort((a, b) => a - b), x)))])),
    delayS: Object.fromEntries(['central', 'reduced'].map(p => [p, [0.5, 0.9, 0.99].map(x => r0(q(hillB.map(b => b.t[p].delay).sort((a, b) => a - b), x)))])),
    byHill: { fz23: f(b => b.hill === 'fz23'), proxy: f(b => b.hill === 'proxy') } };
})();
const msTile = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/2026-02-03/global-buildings.geojsonl/RegionName=UnitedStates/quadkey=023010212/part-00072-4feead82-d499-422b-94cb-c036c212127a.c000.csv.gz';
const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), network: net.meta.built, networkEdges: net.edges.length,
    note: 'Per street segment (network edge id) aggregates of hill buildings\' height and distance to their nearest street, door-to-curb walking time and carless households\' walks out. No per-building values are stored. Segments with fewer than 5 buildings carry pooled: true and use their zone\'s figures (zones). Edge ids change with every network rebuild: rerun this tool after node tools/build-network.mjs.',
    sources: {
      buildings: BSRC === 'ms' ? { what: 'Microsoft Global ML Building Footprints, quadkey 023010212 (release 2026-02-03, uploaded 2026-02-23); © Microsoft, ODbL', url: msTile, retrieved: '2026-11-03', category: 'sourced (machine-learned footprints)' } : { what: 'OpenStreetMap buildings', base: osmB.base, category: 'sourced' },
      osmWays: { what: 'OpenStreetMap highway=steps, footway, path, pedestrian in the model area (overpass.kumi.systems; © OpenStreetMap contributors, ODbL); query data/raw/osm/walk-ways.overpassql', osmBase: WAYS_BASE, retrieved: '2026-11-03', category: 'sourced' },
      dem: 'derived: USGS 3DEP lidar DEM resampled to 4 m (data/terrain/dem.json); bare earth, so it shows no retaining walls, stairs or floor levels',
      speeds: 'sourced: Tobler (1993) hiking function; Fruin (1971) stair speeds via Pouw et al. (2024) Table 1; MUTCD §4E.06 3.0 ft/s; Kuligowski et al. (2014, NIST) 0.31 m/s. Reduced-mobility stair ascent and the horizontal conversion are derived (SOURCE_NOTES WA4–WA8).',
      orders: 'model rule: the simulator\'s safe nodes for each scenario at medium severity, seed 1: streets outside the order and warning zones (including other cities\' rule-based orders on that fire) that embers never reach, or the model area\'s exits; nodes upwind of the ignition point (behind a line through it across the wind) are left out, so nobody walks out past the fire\'s start',
    },
    rules: RULES, speeds: { toblerLevelMps: r2(SPEEDS.tobler(0)), central: SPEEDS.central, reducedFlatMps: SPEEDS.reducedFlat, reduced: { stairUp: r2(SPEEDS.reduced.stairUp), stairDown: r2(SPEEDS.reduced.stairDown) }, stairRisePerRun: r2(SPEEDS.stairRisePerRun) },
    provenance: {
      rise: 'derived: DEM at the footprint centroid minus DEM at the nearest point of the street centerline (m); positive = home above its street',
      access: 'model rule: nearest household street within 150 m; path or stair access when a public OSM stairway or path is within 30 m and at least 10 m closer than the street',
      outS: 'derived from sourced speeds and model rules: one-way door-to-curb walking time, seconds, [median, 90th percentile]',
      delayQ: 'derived + assumption: extra time over level ground for three legs (two out, one back; assumption), central speeds, seconds at the 10th, 25th, 50th, 75th and 90th percentiles; the simulator\'s opt-in setting draws from it',
      walkMin: 'derived: minutes on foot from the segment\'s middle to the nearest street outside the scenario\'s order and warning area (or to a shelter site), central and reduced mobility, with stairways and paths (all) and on streets only (streets)',
      households: 'derived: expected synthetic households on the segment, as js/sim.js places them (zone population / persons per household, by street length)',
    },
    counts: { buildingsInFile: bpts.length, ...totals, stairsInHills: stairs.length, osmPathEndsSnapped: snapped, segments: Object.keys(segments).length, pooledSegments: pooledSegs, pedNodes: NG, pedEdges: edgesG.length,
      stairRiserCheck: { stairways: stairCheck.length, riserM: riser.length ? [r2(q(riser, 0.25)), r2(q(riser, 0.5)), r2(q(riser, 0.75))] : null } },
  },
  zones: zoneSummary, segments, walks, stairs,
};
fs.writeFileSync(path.join(R, 'data/model/walk-access.json'), JSON.stringify(out));
console.log(JSON.stringify(out.meta.counts, null, 1));
for (const [k, w] of Object.entries(walks)) console.log(k, JSON.stringify(w.total));

// ---------- 8. report: docs/walk-access.md ----------
const fmt = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const label = z => { const k = (layers.evacZones.find(e => e.id === z)?.knownAs || '').replace(/\s+/g, ' ').trim(); return k ? `${z} (${k.length > 70 ? k.slice(0, 67) + '…' : k})` : z; };
const title = s => (s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const C = out.meta.counts, NB = C.hillBuildings;
const L = [];
L.push('# Home-to-street walking and stair access in the hills', '');
L.push(`Built ${out.meta.built} by \`node tools/walk-access.mjs\` from ${fmt(NB)} hill building footprints (Microsoft Global ML Building Footprints), the 4 m lidar DEM and OpenStreetMap stairways and paths. Synthetic households, not real ones; per-segment aggregates only, no building is listed. Not a prediction and not an official evacuation plan. Sources and checks: SOURCE_NOTES WA1–WA15.`, '');
L.push('## Findings', '');
L.push(`- **Most hill homes sit near the level of their street.** Of ${fmt(NB)} hill buildings, the median is ${fmt(C.medianRiseM, 1)} m above or below the nearest point of its street and the 90th percentile ${fmt(C.p90RiseM, 1)} m. ${fmt(C.above5)} (${pct(C.above5 / NB)}) stand more than 5 m above their street and ${fmt(C.above10)} (${pct(C.above10 / NB)}) more than 10 m; ${fmt(C.below5)} (${pct(C.below5 / NB)}) are more than 5 m below and ${fmt(C.below10)} (${pct(C.below10 / NB)}) more than 10 m below. ${fmt(C.pathAccess)} buildings (${pct(C.pathAccess / NB)}) are closer to a public path or stairway than to any street, ${fmt(C.stairAccess)} of them to a stairway.`);
L.push(`- **The walk to the curb takes seconds to a few minutes.** One way, door to curb, at the central speeds: median ${fmt(C.outS.central[0])} s, 90th percentile ${fmt(C.outS.central[1])} s, 99th ${fmt(C.outS.central[2])} s. With reduced mobility: ${fmt(C.outS.reduced[0])}, ${fmt(C.outS.reduced[1])} and ${fmt(C.outS.reduced[2])} s. The terrain's extra time over level ground for three legs (two trips out with belongings, one back) is a median ${fmt(C.delayS.central[0])} s and a 90th percentile ${fmt(C.delayS.central[1])} s (reduced mobility ${fmt(C.delayS.reduced[0])} and ${fmt(C.delayS.reduced[1])} s). The Time Study's mobilization curves spread departures over 2.5 to 3.5 hours in 15-minute steps (\`data/assumptions.json\` demand.mobilization15min), so this is small against them.`);
const wk = out.walks, sh = wk.shelter.total;
const scenRows = Object.entries(wk).filter(([k]) => k !== 'shelter');
const p50s = scenRows.map(([, w]) => w.total.central_all.p50), p90s = scenRows.map(([, w]) => w.total.central_all.p90);
L.push(`- **Carless households would walk a median ${fmt(Math.min(...p50s))} to ${fmt(Math.max(...p50s))} minutes, and a 90th percentile ${fmt(Math.min(...p90s))} to ${fmt(Math.max(...p90s))}, to the edge of the order and warning area.** Weighted by expected carless households on hill streets inside each scenario's order and warning area (the simulator's uniform ${(carless * 100).toFixed(2)}% share), median and 90th percentile walking times on the pedestrian network with stairways: ${scenRows.map(([, w]) => `${w.name.replace(/^Reference: /, '')} ${fmt(w.total.central_all.p50, 0)} and ${fmt(w.total.central_all.p90, 0)} min (reduced mobility ${fmt(w.total.reduced_all.p50, 0)} and ${fmt(w.total.reduced_all.p90, 0)})`).join('; ')}.`);
L.push(`- **Shelters are farther.** To the nearest of the City's 13 shelter sites: median ${fmt(sh.central_all.p50, 0)} min and 90th percentile ${fmt(sh.central_all.p90, 0)} min (reduced mobility ${fmt(sh.reduced_all.p50, 0)} and ${fmt(sh.reduced_all.p90, 0)}); about ${fmt(sh.central_all.over30)} of ${fmt(sh.carlessHouseholds)} expected carless hill households are more than 30 minutes' walk away, ${fmt(sh.reduced_all.over30)} with reduced mobility.`);
L.push(`- **Stairways and paths save little in aggregate.** Without them (streets only), the median walk out changes by at most ${fmt(Math.max(...scenRows.map(([, w]) => w.total.central_streets.p50 - w.total.central_all.p50)), 1)} min in any scenario and the 90th percentile by at most ${fmt(Math.max(...scenRows.map(([, w]) => w.total.central_streets.p90 - w.total.central_all.p90)), 1)} min; the segments where they save most are listed below.`, '');

// zones with many homes far above or below their street
L.push('## Where homes sit far above or below their street', '');
L.push('Zones with at least 20 hill buildings, by the share more than 10 m above or below the nearest point of their street. Rise = |DEM at footprint centroid − DEM at the street|. Door-to-curb times are one way.', '');
L.push('| Zone | Buildings | Synthetic households | Median rise (m) | 90th pct rise (m) | > 5 m above | > 10 m above | > 5 m below | > 10 m below | Path or stair access | One way, central (s, median / p90) | One way, reduced mobility (s) |');
L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [z, s] of Object.entries(zoneSummary).filter(([, s]) => s.buildings >= 20).sort((a, b) => (b[1].above10 + b[1].below10) - (a[1].above10 + a[1].below10)).slice(0, 20))
  L.push(`| ${label(z)} | ${fmt(s.buildings)} | ${fmt(s.households)} | ${fmt(s.medianRiseM, 1)} | ${fmt(s.p90RiseM, 1)} | ${pct(s.above5)} | ${pct(s.above10)} | ${pct(s.below5)} | ${pct(s.below10)} | ${fmt(s.pathAccess)} | ${s.outS.central.join(' / ')} | ${s.outS.reduced.join(' / ')} |`);
L.push('', 'Street segments with at least 5 buildings and the most buildings more than 10 m above or below the street:', '');
L.push('| Street (zone) | Buildings | Synthetic households | 90th pct rise (m) | > 10 m above or below | Path or stair access | Extra time for the three legs, central (s, median / p90) |');
L.push('|---|---:|---:|---:|---:|---:|---:|');
for (const [, s] of Object.entries(segments).filter(([, s]) => !s.pooled).sort((a, b) => (b[1].above10 + b[1].below10) * b[1].buildings - (a[1].above10 + a[1].below10) * a[1].buildings).slice(0, 15))
  L.push(`| ${title(s.name)} (${s.zone}) | ${s.buildings} | ${fmt(s.households, 1)} | ${fmt(s.p90RiseM, 1)} | ${Math.round((s.above10 + s.below10) * s.buildings)} | ${s.pathAccess} | ${s.delayQ[2]} / ${s.delayQ[4]} |`);
L.push('');

// public stairways
{ const rs = stairs.map(x => x.riseM).filter(v => v != null).sort((a, b) => a - b), ls = stairs.map(x => x.lengthM).sort((a, b) => a - b);
  L.push('## Public stairways in the hills', '');
  L.push(`${fmt(stairs.length)} OpenStreetMap stairways (highway=steps, public) lie in the hills. Rise from the DEM between their ends: median ${fmt(q(rs, 0.5), 1)} m, 90th percentile ${fmt(q(rs, 0.9), 1)} m; horizontal length median ${fmt(q(ls, 0.5), 1)} m. Tags: step_count on ${fmt(stairs.filter(x => x.stepCount).length)}, incline on ${fmt(stairs.filter(x => x.incline).length)}, a handrail tag on ${fmt(stairs.filter(x => x.handrail).length)}. Named stairways with the largest rise (all ways of one name summed; walking time one way, central / reduced mobility):`, '');
  const byName = new Map(); for (const x of stairs) if (x.name && x.riseM != null) { const v = byName.get(x.name) || { len: 0, rise: 0, up: 0, upR: 0 }; v.len += x.lengthM; v.rise += x.riseM; byName.set(x.name, v); }
  L.push('| Stairway | Horizontal length (m) | Rise (m) | Up, central (min) | Up, reduced mobility (min) | Down, central / reduced (min) |');
  L.push('|---|---:|---:|---:|---:|---:|');
  for (const [nm, v] of [...byName].sort((a, b) => b[1].rise - a[1].rise).slice(0, 12)) {
    const run = Math.max(v.len, v.rise / SPEEDS.stairRisePerRun);
    L.push(`| ${nm} | ${fmt(v.len)} | ${fmt(v.rise, 1)} | ${fmt(run / stairV('central', true) / 60, 1)} | ${fmt(run / stairV('reduced', true) / 60, 1)} | ${fmt(run / stairV('central', false) / 60, 1)} / ${fmt(run / stairV('reduced', false) / 60, 1)} |`);
  }
  L.push('', 'A named path is often several OSM ways, some of them level footway; only the ways tagged steps are summed here.', '');
}

// carless walks by scenario and zone
L.push('## Carless households: walking out', '');
L.push('Time on foot from the middle of each hill street segment to the nearest street the simulator counts as safe in that scenario (outside the order and warning zones, never reached by embers, at medium severity, seed 1), not past the fire\'s start; zones weighted by expected carless households (synthetic: the uniform citywide share). "All" uses stairways and paths, "streets" does not. Minutes, median / 90th percentile.', '');
L.push('| Scenario | Expected carless hill households | Central, all | Central, streets | Reduced mobility, all | Reduced mobility, streets | Over 30 min, central / reduced |');
L.push('|---|---:|---:|---:|---:|---:|---:|');
for (const [, w] of Object.entries(wk)) { const t = w.total; L.push(`| ${w.name} | ${fmt(t.carlessHouseholds)} | ${fmt(t.central_all.p50, 1)} / ${fmt(t.central_all.p90, 1)} | ${fmt(t.central_streets.p50, 1)} / ${fmt(t.central_streets.p90, 1)} | ${fmt(t.reduced_all.p50, 1)} / ${fmt(t.reduced_all.p90, 1)} | ${fmt(t.reduced_streets.p50, 1)} / ${fmt(t.reduced_streets.p90, 1)} | ${fmt(t.central_all.over30)} / ${fmt(t.reduced_all.over30)} |`); }
L.push('', 'Zones with the longest walks (90th percentile, central, with stairways), by scenario:', '');
for (const [k, w] of Object.entries(wk)) {
  const zs = Object.entries(w.zones).filter(([, v]) => v.carlessHouseholds >= 2 && v.central_all.p90 != null).sort((a, b) => b[1].central_all.p90 - a[1].central_all.p90).slice(0, 5);
  L.push(`- ${w.name}: ${zs.map(([z, v]) => `${z} ${fmt(v.central_all.p90, 0)} min (reduced ${fmt(v.reduced_all.p90, 0)}; ${fmt(v.carlessHouseholds, 0)} households)`).join('; ')}.`);
}
const saves = hillSegs.map(eid => { const s = segments[eid], w = s.walkMin?.shelter; return w && w.central_streets != null && w.central_all != null ? [s, w.central_streets - w.central_all] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]).slice(0, 10);
L.push('', 'Where stairways and paths shorten the walk to a shelter most (minutes saved against streets only, central):', '');
L.push(saves.map(([s, d]) => `${title(s.name)} (${s.zone}) ${fmt(d, 1)}`).join('; ') + '.', '');

// simulator comparison
const simF = path.join(R, 'data/model/walk-access-sim.json');
if (fs.existsSync(simF)) {
  const S = JSON.parse(fs.readFileSync(simF, 'utf8'));
  L.push('## Simulator: the opt-in setting on and off', '');
  L.push(`\`node tools/walk-access-sim.mjs\`, ${S.meta.severity} severity, seeds 1–${S.meta.seeds}, today's plan, each scenario's time of day; same fire, households, parked cars and seed with the setting off and on. People still there when embers arrived count each person once and are not a casualty count. ETE (evacuation time estimate): minutes after the order until 90% of the Berkeley order area's vehicles are out (Time Study region in brackets). Built ${S.meta.built}.`, '');
  const dE = S.runs.map(r => r.terrain.embers - r.none.embers), dT = S.runs.filter(r => r.none.eteP90 != null && r.terrain.eteP90 != null).map(r => r.terrain.eteP90 - r.none.eteP90);
  L.push(`Across the ${S.runs.length} pairs, people still there when embers arrived change by ${fmt(Math.min(...dE))} to +${fmt(Math.max(...dE))} (both directions, so no clear difference), people at the fire front by ${fmt(Math.min(...S.runs.map(r => r.terrain.fireFront - r.none.fireFront)))} to +${fmt(Math.max(...S.runs.map(r => r.terrain.fireFront - r.none.fireFront)))}, and the 90% ETE by ${fmt(Math.min(...dT), 1)} to +${fmt(Math.max(...dT), 1)} min. The mean delay counts every departing household, most of them in the flats with none. A dash means 90% of the order area's vehicles were not out before the run ended.`, '');
  L.push('| Scenario | Seed | Still there when embers arrived, off → on | At the fire front, off → on | 90% ETE (min), off → on | Mean delay, all departing households (s) |');
  L.push('|---|---:|---:|---:|---:|---:|');
  for (const r of S.runs) L.push(`| ${r.name}${r.region ? ` (${r.region})` : ''} | ${r.seed} | ${fmt(r.none.embers)} → ${fmt(r.terrain.embers)} | ${fmt(r.none.fireFront)} → ${fmt(r.terrain.fireFront)} | ${fmt(r.none.eteP90, 1)} → ${fmt(r.terrain.eteP90, 1)} | ${fmt(r.terrain.meanDelayS)} |`);
  L.push('');
}

L.push('## Method', '');
L.push(`- **Hill buildings** (model rule): footprint centroid in Berkeley's Fire Zones 2–3 (${fmt(C.byHill.fz23)}), or outside Berkeley at 90 m DEM elevation or higher (${fmt(C.byHill.proxy)}), the simulator's hill proxy. Footprints under ${RULES.minFootprintM2} m² are dropped as sheds (assumption). ${fmt(C.noStreetWithin150m)} buildings with no household street within ${RULES.maxStreetM} m and ${fmt(C.demFaultDropped)} on DEM faults (a cell at sea level or a slope steeper than 1:1 to the curb) are left out.`);
L.push(`- **Street**: the nearest point of a segment on which the simulator places households (\`js/sim.js\` residentialStreets). Rise and distance are centroid to centerline: the door, the driveway and the curb are not mapped.`);
L.push(`- **Path or stair access** (model rule): a public OpenStreetMap stairway, footway, path or pedestrian way (not sidewalks or crossings, not access=private) within ${RULES.pathNearM} m of the centroid and at least ${RULES.pathCloserM} m closer than the street.`);
L.push(`- **Door-to-curb route** (model rule): the straight line. Up to a ${RULES.maxWalkSlope * 100}% slope it is walked; steeper, stairs take the whole rise at Fruin's 178 mm riser and 286 mm tread (32°) and the rest is level walking.`);
L.push(`- **Speeds**: walking, Tobler's hiking function, 6·exp(−3.5·|s + 0.05|) km/h (${out.meta.speeds.toblerLevelMps} m/s on the level); stairs, Fruin's free-flow horizontal speeds on that stair, ${SPEEDS.central.stairUp} m/s up and ${SPEEDS.central.stairDown} m/s down (sourced). Reduced mobility: ${SPEEDS.reducedFlat} m/s on the level (MUTCD 3.0 ft/s), scaled by Tobler's slope factor (derived); stairs, NIST's mean ${SPEEDS.reducedStairAlong} m/s for people with mobility impairments, taken as along the stair and converted to ${out.meta.speeds.reduced.stairDown} m/s horizontal (derived), and ${out.meta.speeds.reduced.stairUp} m/s up, scaled by Fruin's up/down ratio (assumption: no ascent figure was found).`);
L.push(`- **Departure delay** for the simulator setting (assumption + derived): the terrain's extra time over level ground for three legs, at central speeds, never below zero. Each segment keeps the 10th, 25th, 50th, 75th and 90th percentiles; a segment with fewer than ${RULES.minBuildings} buildings uses its zone's pooled figures (${fmt(C.pooledSegments)} of ${fmt(C.segments)} hill segments). A household draws its delay from a separate random stream.`);
L.push(`- **Pedestrian network**: every network street except freeways and ramps, walkable both ways whatever the one-way coding, plus ${fmt(pedWays.length)} public OpenStreetMap ways (stairways, footways including sidewalks, paths, pedestrian ways), ${fmt(C.osmPathEndsSnapped)} of their ends or road crossings joined to a street within ${RULES.snapM} m. Times from the DEM profile every 8 m.`);
L.push('', '## Limits', '');
L.push(`- The DEM is bare earth at 4 m: it shows no retaining walls, garages, decks, inside stairs or floor levels. A home on a steep lot may have its door at street level by a bridge, or many more steps than the ground between centroid and curb.`);
L.push(`- Public stairways in OpenStreetMap (${fmt(C.stairsInHills)} in the hills) carry step counts on only ${fmt(C.stairRiserCheck.stairways)}; on those, DEM rise per step is a median ${fmt(C.stairRiserCheck.riserM?.[1], 2)} m (quartiles ${fmt(C.stairRiserCheck.riserM?.[0], 2)}–${fmt(C.stairRiserCheck.riserM?.[2], 2)}), lower than a typical 0.15–0.18 m riser, so the DEM rise along stairways is probably low and stair times short. The OSM extract is the server's copy as of ${WAYS_BASE}.`);
L.push('- Building footprints are machine-learned (Microsoft) and include garages and outbuildings over 25 m²; a building is not a household. OpenStreetMap buildings could be fetched for only 3 of 9 tiles (Overpass timeouts on 2026-11-03); in those, OpenStreetMap has 25–30% more buildings than the Microsoft footprints of 25 m² or more, so building counts here are low, by an unknown share in the hills.');
L.push(`- Carless households are the simulator's uniform ${(carless * 100).toFixed(2)}% of households; no tenure, age or disability data by block. The walk ignores fire, smoke, darkness, traffic and crowding, and the order area is one seed's.`);
L.push('- The Time Study\'s mobilization curves come from a survey of residents and may already include part of the walk to the car; the simulator setting adds the whole terrain excess on top.');
fs.writeFileSync(path.join(R, 'docs/walk-access.md'), L.join('\n') + '\n');
console.log('wrote docs/walk-access.md');
