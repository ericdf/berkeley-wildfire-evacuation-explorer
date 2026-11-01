#!/usr/bin/env node
// Build the game's data files from the raw inputs.
//
//   node tools/build-network.mjs
//
// Inputs (see DATA_INVENTORY.md):
//   data/raw/street-centerlines.geojson   base road network (Alameda County export, EPSG:4326)
//   data/terrain/dem.i16 + dem.json       elevation grid (tools/fetch-dem.mjs)
//   data/raw/city/*.geojson               City of Berkeley layers (tools/fetch-city-layers.mjs), optional
//   data/assumptions.json                 editable defaults (lanes, parking, capacities …)
// Outputs:
//   data/game/network.json   road graph: nodes, edges, per-field provenance
//   data/game/layers.json    zones, fire zones, 1923 boundary, stations, shelters, paths
//
// Every coordinate in the outputs is meters in UTM 10N (EPSG:32610) minus the DEM
// origin (xmin, ymin), with y pointing north. Nothing is measured in lon/lat.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);
const readJSON = f => JSON.parse(fs.readFileSync(P(f), 'utf8'));
const has = f => fs.existsSync(P(f));
const A = readJSON('data/assumptions.json');

// ---------- terrain ----------
const dem = readJSON('data/terrain/dem.json');
const demBuf = fs.readFileSync(P('data/terrain/dem.i16'));
const Z = new Int16Array(demBuf.buffer, demBuf.byteOffset, demBuf.length / 2);
const OX = dem.xmin, OY = dem.ymin;
function elev(x, y) { // local meters → elevation (m) by bilinear interpolation, null if no data
  const fx = x / dem.resolution - 0.5, fy = (dem.ymax - OY - y) / dem.resolution - 0.5;
  const c = Math.floor(fx), r = Math.floor(fy);
  if (c < 0 || r < 0 || c >= dem.width - 1 || r >= dem.height - 1) return null;
  const v = [Z[r * dem.width + c], Z[r * dem.width + c + 1], Z[(r + 1) * dem.width + c], Z[(r + 1) * dem.width + c + 1]];
  if (v.some(q => q === -32768)) { const ok = v.filter(q => q !== -32768); return ok.length ? ok.reduce((s, q) => s + q, 0) / ok.length / 10 : null; }
  const tx = fx - c, ty = fy - r;
  return ((v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty) / 10;
}
const local = ([lon, lat]) => { const [x, y] = toUTM(lon, lat); return [x - OX, y - OY]; };
const r1 = v => Math.round(v * 10) / 10;

// ---------- geometry helpers ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyLen = pts => pts.reduce((s, p, i) => i ? s + dist(p, pts[i - 1]) : 0, 0);
function pointAt(pts, t) { // point at fraction t of length
  const L = polyLen(pts) * t; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= L) { const u = d ? (L - acc) / d : 0; return [pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1])]; }
    acc += d;
  }
  return pts[pts.length - 1];
}
function distToPoly(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - ax - u * dx, p[1] - ay - u * dy));
  }
  return best;
}
function simplify(pts, tol) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distToPoly(pts[i], [pts[0], pts[pts.length - 1]]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
}
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (p, rings) => rings.length && inRing(p, rings[0]) && !rings.slice(1).some(h => inRing(p, h));
function polygonsOf(geom) { // → array of polygons (each an array of rings) in local meters
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map(rings => rings.map(r => r.map(local)));
}
const bboxOf = rings => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
function zoneIndex(features, keyFn) {
  const z = [];
  for (const f of features) for (const rings of polygonsOf(f.geometry)) z.push({ rings, bb: bboxOf(rings), key: keyFn(f.properties) });
  return p => { for (const q of z) if (p[0] >= q.bb[0] && p[0] <= q.bb[2] && p[1] >= q.bb[1] && p[1] <= q.bb[3] && inPoly(p, q.rings)) return q.key; return null; };
}
const cityLayer = k => has(`data/raw/city/${k}.geojson`) ? readJSON(`data/raw/city/${k}.geojson`).features : [];

// ---------- 1. read base network ----------
const raw = readJSON('data/raw/street-centerlines.geojson');
const PED_TYPES = new Set(['PA', 'WK']);
const segs = [];
for (const f of raw.features) {
  const p = f.properties;
  if (!f.geometry || f.geometry.type !== 'LineString') continue;
  const pts = f.geometry.coordinates.map(local);
  const ped = PED_TYPES.has(p.SFEATYP) || /\b(STEPS|PATH|WALK)\b/.test(p.STREET || '');
  segs.push({ p, pts, mode: ped ? 'path' : p.TRVLWAY === 'NT' ? 'restricted' : 'vehicle' });
}

// ---------- 2. snap endpoints into nodes ----------
const SNAP = 1.0; // meters
const nodes = [], grid = new Map();
const cellKey = (x, y) => `${Math.floor(x / SNAP)},${Math.floor(y / SNAP)}`;
function nodeFor(pt) {
  const cx = Math.floor(pt[0] / SNAP), cy = Math.floor(pt[1] / SNAP);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const id of grid.get(`${cx + dx},${cy + dy}`) || []) if (dist(nodes[id].pt, pt) <= SNAP) return id;
  }
  const id = nodes.length; nodes.push({ pt });
  const k = cellKey(pt[0], pt[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
  return id;
}

// ---------- 3. conflation index for City attribute layers ----------
function lineIndex(features, keep = () => true) {
  const items = [];
  for (const f of features) {
    if (!keep(f.properties) || !f.geometry) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const l of lines) items.push({ p: f.properties, pts: l.map(local) });
  }
  const G = 100, cells = new Map();
  items.forEach((it, i) => {
    const seen = new Set();
    for (const [x, y] of it.pts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const k = `${Math.floor(x / G) + dx},${Math.floor(y / G) + dy}`;
      if (seen.has(k)) continue; seen.add(k);
      if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
    }
  });
  // best match for a polyline: same street name preferred, mean distance of 3 sample points
  return (pts, name, nameOf, maxD = 12) => {
    const samples = [0.25, 0.5, 0.75].map(t => pointAt(pts, t));
    const cand = new Set();
    for (const s of samples) for (const i of cells.get(`${Math.floor(s[0] / G)},${Math.floor(s[1] / G)}`) || []) cand.add(i);
    let best = null, bestScore = Infinity;
    for (const i of cand) {
      const it = items[i];
      const d = samples.reduce((acc, s) => acc + distToPoly(s, it.pts), 0) / 3;
      const score = d + (norm(nameOf(it.p)) === norm(name) ? 0 : 8);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return bestScore <= maxD ? best.p : null;
  };
}
const norm = s => (s || '').toUpperCase().replace(/\s+/g, ' ').replace(/ (AVE|AV)$/, ' AV').replace(/ (WAY|WY)$/, ' WY').trim();
const cityLines = lineIndex(cityLayer('street_centerline_city'));
const narrowLines = lineIndex(cityLayer('narrow_roads'));
const fireZoneOf = zoneIndex(cityLayer('fire_zones'), p => p.PLN_HILL_Z);
// Genasys zone label as the City website and Genasys map show it, e.g. US-CA-XAL-BER-E006 -> BER-006.
// The layer's zonenum field is not unique (Albany's and Oakland's zone 6 are also "BER-06").
const zoneLabel = zid => String(zid || '').replace(/^US-CA-XAL-/, '').replace(/-E0*(\d+)$/, (m, n) => '-' + n.padStart(3, '0'));
const evacZoneOf = zoneIndex(cityLayer('evac_zones'), p => zoneLabel(p.zone_id));

// ---------- 4. edges ----------
const FT = 0.3048;
const edges = [];
const stats = { width: 0, cityLanes: 0, narrow: 0, edges: 0 };
for (const s of segs) {
  const p = s.p;
  const a = nodeFor(s.pts[0]), b = nodeFor(s.pts[s.pts.length - 1]);
  if (a === b && polyLen(s.pts) < 2) continue;
  const len = polyLen(s.pts);
  // elevation profile every ~4 m
  const n = Math.max(2, Math.ceil(len / dem.resolution) + 1);
  const prof = [];
  for (let i = 0; i < n; i++) prof.push(elev(...pointAt(s.pts, i / (n - 1))));
  const za = prof[0], zb = prof[prof.length - 1];
  // "steep grade": 90th percentile of ~25 m window grades. The single worst window is
  // dominated by DEM artefacts (cuts, retaining walls, cells beside the roadway).
  const step = len / (n - 1) || 1;
  const W = Math.max(1, Math.round(25 / step));
  const wins = [];
  for (let i = 0; i + W < n; i++) if (prof[i] != null && prof[i + W] != null) wins.push(Math.abs(prof[i + W] - prof[i]) / (step * W));
  if (!wins.length && za != null && zb != null) wins.push(Math.abs(zb - za) / len);
  wins.sort((x, y) => x - y);
  const gmax = wins.length ? wins[Math.floor(0.9 * (wins.length - 1))] : 0;
  const mid = pointAt(s.pts, 0.5);
  const fireZone = fireZoneOf(mid) ?? null;
  const hills = fireZone === 2 || fireZone === 3;
  const structure = ['Interstate', 'Ramp'].includes(p.CLASS);

  const e = {
    id: edges.length, a, b, name: p.STREET || 'UNNAMED', cls: p.CLASS, type: p.SFEATYP, trav: p.TRVLWAY, mode: s.mode,
    src: { OBJECTID: p.OBJECTID, SEGID: p.SEGID },
    len: r1(len), geom: simplify(s.pts, 0.75).map(([x, y]) => [r1(x), r1(y)]),
    z: [za == null ? null : r1(za), zb == null ? null : r1(zb)],
    grade: za == null || zb == null ? null : Math.round((zb - za) / len * 1000) / 10, // % in digitized direction
    gradeMax: Math.round(gmax * 1000) / 10,
    gradeReliable: !structure && gmax < 0.35, // >35% is beyond any Berkeley street; treat as a DEM artefact
    fireZone, evacZone: evacZoneOf(mid),
  };

  if (s.mode === 'vehicle') {
    stats.edges++;
    const city = cityLines(s.pts, e.name, q => q.FULLNAME);
    const widthFt = city && city.PAV_WIDTH_RD > 0 ? city.PAV_WIDTH_RD : null;
    const pavLanes = city && city.PAV_LANES > 0 ? city.PAV_LANES : null;
    const narrow = narrowLines(s.pts, e.name, q => q.FULLNAME, 8);
    if (widthFt) stats.width++;
    if (pavLanes) stats.cityLanes++;
    if (narrow) stats.narrow++;
    e.city = city ? { id: city.FACILITYID, speedMph: city.SPEED || null, category: city.CATEGORY || null } : null;

    // lanes (total both directions)
    let lanes, lanesSrc;
    const rule = A.lanes.byClass[p.CLASS] ?? A.lanes.byClass.default;
    if (hills && p.CLASS === 'Local') { lanes = A.lanes.hillsLocal; lanesSrc = 'assumption:hillsLocal'; }
    else if (pavLanes && pavLanes <= 6) { lanes = pavLanes; lanesSrc = 'city:PAV_LANES'; }
    else { lanes = rule; lanesSrc = 'assumption:byClass'; }
    const oneway = p.TRVLWAY === 'FT' || p.TRVLWAY === 'TF';
    e.lanes = oneway ? (p.TRVLWAY === 'FT' ? [lanes, 0] : [0, lanes]) : [Math.max(1, Math.floor(lanes / 2)), Math.max(1, Math.ceil(lanes / 2))];
    if (oneway && lanes > 2 && p.CLASS === 'Local') e.lanes = p.TRVLWAY === 'FT' ? [1, 0] : [0, 1];
    e.lanesSrc = lanesSrc;

    // width and parking
    e.widthM = widthFt ? r1(widthFt * FT) : null;
    e.widthSrc = widthFt ? 'city:PAV_WIDTH_RD' : 'unknown';
    e.parking = hills ? A.parking.hills : A.parking.flats; // 'both' | 'one' | 'none'
    e.parkingSrc = hills ? 'assumption:parking.hills' : 'assumption:parking.flats';
    if (narrow && narrow.PAV_WIDTH_ > 0) {
      e.widthM = r1(narrow.PAV_WIDTH_ * FT); e.widthSrc = 'city:Narrow_Roads.PAV_WIDTH_';
      e.clearWidthM = r1(narrow.Width_w_Parking * FT); e.clearWidthSrc = 'city:Narrow_Roads.Width_w_Parking';
      e.narrow = true;
    } else if (e.widthM) {
      const sides = { both: 2, one: 1, none: 0 }[e.parking];
      e.clearWidthM = r1(Math.max(0, e.widthM - sides * A.parking.parkedCarWidthM));
      e.clearWidthSrc = 'derived:width-minus-parking';
    } else { e.clearWidthM = null; e.clearWidthSrc = 'unknown'; }
    // moving lanes that physically fit between parked cars (game rule)
    e.effLanes = e.clearWidthM == null ? null
      : e.clearWidthM >= 2 * A.access.movingLaneM ? 2 : e.clearWidthM >= A.access.movingLaneM ? 1 : 0;
    e.belowFireCodeWidth = e.clearWidthM != null && e.clearWidthM < A.access.fireCodeClearM;
    e.engineBlocked = e.clearWidthM != null && e.clearWidthM < A.access.engineClearM;

    // speed (assumption by class) and capacity (AB 747 / HCM 2022 rules, SOURCE_NOTES B2-B3)
    const C = A.capacity, sk = structure ? p.CLASS : hills && p.CLASS === 'Local' ? 'hillsLocal' : p.CLASS;
    const mph = Math.min(C.speedMph[sk] ?? C.speedMph.Local, city?.SPEED && !hills ? city.SPEED : Infinity);
    e.speedMps = r1(mph * 0.44704);
    const perDir = Math.max(e.lanes[0], e.lanes[1]);
    if (p.CLASS === 'Interstate') { e.capPerLaneVph = C.freewayPcphPerLane; e.capRule = 'freeway'; }
    else if (p.CLASS === 'Ramp') { e.capPerLaneVph = C.rampPcphPerLane; e.capRule = 'ramp'; }
    else if (perDir >= 2) { e.capPerLaneVph = C.multilanePcphPerLane; e.capRule = 'multilane'; }
    else { e.capPerLaneVph = Math.min(C.twoLaneMaxPcph, C.twoLanePcphPerMph * mph); e.capRule = 'two-lane'; }
    if (e.gradeReliable && e.gradeMax >= A.capacity.steepGradePct) { e.capPerLaneVph = Math.round(e.capPerLaneVph * A.capacity.steepFactor); e.steep = true; }
  }
  edges.push(e);
}

// ---------- 5. connectivity (vehicle graph, ignoring direction) ----------
const adj = nodes.map(() => []);
for (const e of edges) if (e.mode === 'vehicle') { adj[e.a].push(e.b); adj[e.b].push(e.a); }
const comp = new Int32Array(nodes.length).fill(-1); let ncomp = 0; const compSize = [];
for (let i = 0; i < nodes.length; i++) {
  if (comp[i] >= 0 || !adj[i].length) continue;
  let size = 0; const st = [i]; comp[i] = ncomp;
  while (st.length) { const u = st.pop(); size++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = ncomp; st.push(v); } }
  compSize.push(size); ncomp++;
}
const main = compSize.indexOf(Math.max(...compSize));
for (const e of edges) if (e.mode === 'vehicle' && comp[e.a] !== main) e.disconnected = true;

// ---------- 5b. OpenStreetMap barriers (diverters, bollards, gates) and traffic circles ----------
// data/raw/osm/barriers-on-roads.json: barrier nodes on public OSM streets (Overpass, 2026-11-01).
// OSM convention: a bollard, block, planter, jersey barrier or chain closes the street to cars
// unless tagged otherwise; a gate is passable unless tagged access/motor_vehicle = no or private.
const segD = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - u * dx, py - ay - u * dy); };
const nearestVehicleEdge = (x, y, maxD) => { let best = null; for (const e of edges) { if (e.mode !== 'vehicle') continue; for (let k = 1; k < e.geom.length; k++) { const d = segD(x, y, e.geom[k - 1], e.geom[k]); if (d <= maxD && (!best || d < best.d)) best = { e, d }; } } return best; };
const barrierStats = { onStreets: 0, matched: 0, closedToCars: 0, enginesPass: 0, gatesClosed: 0 };
if (has('data/raw/osm/barriers-on-roads.json')) {
  const osm = readJSON('data/raw/osm/barriers-on-roads.json').elements;
  const ways = osm.filter(x => x.type === 'way' && x.tags?.highway !== 'service'), bn = new Map(osm.filter(x => x.type === 'node').map(n => [n.id, n]));
  const seen = new Set();
  for (const w of ways) for (const id of w.nodes || []) {
    const n = bn.get(id); if (!n || seen.has(id)) continue; seen.add(id); barrierStats.onStreets++;
    const t = n.tags || {}, kind = t.barrier;
    const motor = t.motor_vehicle ?? t.vehicle ?? t.access;
    const gate = /gate/.test(kind);
    const closed = gate ? ['no', 'private'].includes(motor) : !['yes', 'permissive', 'destination'].includes(motor);
    if (!closed) continue;
    const [x, y] = local([n.lon, n.lat]);
    const m = nearestVehicleEdge(x, y, 15); if (!m) continue;
    barrierStats.matched++; barrierStats.closedToCars++;
    const engines = t.emergency === 'yes' || gate; // emergency=yes bollards are removable; engines can open gates
    if (engines) barrierStats.enginesPass++;
    if (gate) barrierStats.gatesClosed++;
    m.e.barrier = { kind, osm: id, engines, gate, street: w.tags?.name || '', tags: Object.fromEntries(Object.entries(t).filter(([k]) => /access|vehicle|emergency|bicycle|foot/.test(k))) };
  }
}
// Traffic circles: OSM junction=roundabout rings in data/raw/osm/berkeley-barriers.json; every
// network node inside a ring (plus 12 m) gets the Time Study's circle capacity (E16).
const circleNodes = new Set();
if (has('data/raw/osm/berkeley-barriers.json')) {
  const osm = readJSON('data/raw/osm/berkeley-barriers.json').elements;
  const pts = new Map(osm.filter(x => x.type === 'node').map(n => [n.id, n]));
  for (const w of osm.filter(x => x.type === 'way' && /roundabout|circular/.test(x.tags?.junction || ''))) {
    const ring = (w.nodes || []).map(id => pts.get(id)).filter(Boolean).map(n => local([n.lon, n.lat]));
    if (ring.length < 3) continue;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const r = Math.max(...ring.map(p => Math.hypot(p[0] - cx, p[1] - cy))) + 12;
    nodes.forEach((nd, i) => { if (Math.hypot(nd.pt[0] - cx, nd.pt[1] - cy) <= r) circleNodes.add(i); });
  }
}
// A closure that would cut streets off from the rest of the network stays open: our network stops
// at the city line, so the street may have an outlet we cannot see (e.g. Tanglewood Rd into Oakland).
const reach = skip => { const seen = new Uint8Array(nodes.length), st = []; const start = edges.find(e => e.mode === 'vehicle' && !e.disconnected).a; seen[start] = 1; st.push(start);
  const adj2 = nodes.map(() => []); for (const e of edges) if (e.mode === 'vehicle' && !e.disconnected && !skip.has(e)) { adj2[e.a].push(e.b); adj2[e.b].push(e.a); }
  while (st.length) { const u = st.pop(); for (const w of adj2[u]) if (!seen[w]) { seen[w] = 1; st.push(w); } }
  return seen; };
const closedSet = new Set(edges.filter(e => e.barrier));
for (const e of [...closedSet]) {
  const seen = reach(closedSet);
  const cut = edges.some(x => x.mode === 'vehicle' && !x.disconnected && !closedSet.has(x) && (!seen[x.a] || !seen[x.b]));
  if (!cut) break;
  // find closures whose removal isolates streets, one at a time
  const alone = reach(new Set([e]));
  if (edges.some(x => x.mode === 'vehicle' && !x.disconnected && x !== e && (!alone[x.a] || !alone[x.b]))) { closedSet.delete(e); e.barrier.keptOpen = 'closing it would cut streets off in our network, which stops at the city line'; barrierStats.closedToCars--; barrierStats.keptOpen = (barrierStats.keptOpen || 0) + 1; }
}
for (const e of edges) if (e.barrier) e.barrier.closed = closedSet.has(e);
stats.osmBarriers = barrierStats; stats.circleNodes = circleNodes.size;
console.log('OSM barriers', JSON.stringify(barrierStats), '| traffic-circle nodes', circleNodes.size);

// ---------- 6. nodes out ----------
const nodesOut = nodes.map(nd => { const z = elev(...nd.pt); return [r1(nd.pt[0]), r1(nd.pt[1]), z == null ? null : r1(z)]; });

const network = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    crs: 'EPSG:32610 local: x = easting - xmin, y = northing - ymin (meters)', origin: [OX, OY],
    terrain: { width: dem.width, height: dem.height, resolution: dem.resolution, xmax: dem.xmax - OX, ymax: dem.ymax - OY },
    stats: { ...stats, nodes: nodes.length, components: ncomp, mainComponentNodes: compSize[main] },
    circleNodes: [...circleNodes],
    fields: {
      geom: { category: 'sourced', source: 'Alameda County Street Centerlines export (data.acgov.org), downloaded 2026-10-20; segment data revised 2015-09-26', note: 'Projected to UTM 10N, simplified to 0.75 m.' },
      name: { category: 'sourced', source: 'County STREET field' },
      cls: { category: 'sourced', source: 'County CLASS field' },
      trav: { category: 'sourced', source: 'County TRVLWAY: B both ways, FT one-way in the digitized direction, TF against it, NT no vehicle travel. FT/TF meaning checked against the right-hand rule on 100 divided-street pairs (97 agree).' },
      mode: { category: 'derived', source: 'path = SFEATYP PA/WK or names with STEPS/PATH/WALK; restricted = TRVLWAY NT; else vehicle' },
      z: { category: 'derived', source: 'Elevation at segment ends, bilinear from data/terrain/dem.i16 (USGS 3DEP 1 m lidar DEM, 4 m overview)' },
      grade: { category: 'derived', source: 'Net grade % along digitized direction from DEM endpoint elevations' },
      gradeMax: { category: 'derived', source: '90th percentile of ~25 m window grades along the centerline, DEM sampled every 4 m. Can be wrong where the road sits on a cut, fill, bridge or retaining wall.' },
      gradeReliable: { category: 'derived', source: 'false for Interstate and Ramp (the bare-earth DEM is the ground under the structure) and where the steep grade exceeds 35% (a DEM artefact: cut, fill or retaining wall)' },
      fireZone: { category: 'sourced', source: 'City of Berkeley FireZones_WFL1 PLN_HILL_Z at segment midpoint' },
      evacZone: { category: 'sourced', source: 'City of Berkeley GenasysZonesBerkeley zone_id at segment midpoint, shown as e.g. BER-006 (the layer\'s zonenum field is not unique across cities)' },
      lanes: { category: 'mixed', source: '[forward, backward] lanes. lanesSrc says where: city:PAV_LANES = City pavement-management lanes (total); assumption:hillsLocal = Eric, 2026-10-31: hill streets are one lane each way; assumption:byClass = data/assumptions.json' },
      widthM: { category: 'sourced', source: 'City of Berkeley Street_Centerline PAV_WIDTH_RD (pavement-management width, feet) or Narrow_Roads PAV_WIDTH_, matched to County segments by name and distance (<= 12 m)' },
      parking: { category: 'assumption', source: 'data/assumptions.json parking.hills / parking.flats. Hills default per Eric, 2026-10-31: parking on both sides. Not yet checked against posted no-parking signs.' },
      clearWidthM: { category: 'mixed', source: 'City Narrow_Roads Width_w_Parking where present; else widthM minus parked-car width per parked side (assumption)' },
      effLanes: { category: 'game rule', source: 'Moving lanes that fit in clearWidthM: 2 if >= 2 x access.movingLaneM, 1 if >= one lane, else 0. With one effective lane, opposing vehicles must wait for each other.' },
      belowFireCodeWidth: { category: 'derived', source: 'clearWidthM below access.fireCodeClearM (20 ft unobstructed width, California Fire Code 503.2.1 for new fire apparatus access roads; context only, existing streets are not required to meet it)' },
      engineBlocked: { category: 'game rule', source: 'clearWidthM below access.engineClearM: a fire engine cannot get through without parked cars being moved' },
      barrier: { category: 'sourced', source: 'OpenStreetMap barrier node on this street (Overpass API, 2026-11-01; © OpenStreetMap contributors, ODbL), matched within 15 m. Closed to residents\' cars; engines pass where tagged emergency=yes or at gates. Diverters that block only some turns are treated as closing the whole segment (approximation).' },
      speedMps: { category: 'assumption', source: 'data/assumptions.json capacity.speedMph by road class, capped by City SPEED where known' },
      capPerLaneVph: { category: 'sourced', source: 'AB 747 report capacity rules (HCM 2022): two-lane roads 45 pc/h per mph up to 1,700; multilane 1,900 per lane; freeway 2,250 per lane (capRule says which). Speed input is an assumption; steep segments reduced by a game rule.' },
    },
  },
  nodes: nodesOut,
  edges,
};
fs.mkdirSync(P('data/game'), { recursive: true });
fs.writeFileSync(P('data/game/network.json'), JSON.stringify(network));

// ---------- 7. context layers ----------
// One entry per zone: parts and duplicate features merged, population counted once.
function zonesOut(features, tol = 3) {
  const by = new Map();
  for (const f of features) {
    const p = f.properties, k = p.zone_id;
    if (!by.has(k)) by.set(k, { id: zoneLabel(k), zoneId: k, pop: +p.est_popula || 0, knownAs: p.known_as || '', rings: [], seen: new Set() });
    const z = by.get(k);
    if ((+p.est_popula || 0) !== z.pop) console.warn(`zone ${k}: features disagree on population (${z.pop} vs ${p.est_popula}); keeping the first`);
    for (const rings of polygonsOf(f.geometry)) {
      const rr = rings.map(r => simplify(r, tol).map(([x, y]) => [Math.round(x), Math.round(y)]));
      const sig = JSON.stringify(rr[0]); if (z.seen.has(sig)) continue; z.seen.add(sig);
      z.rings.push(...rr);
    }
  }
  return [...by.values()].map(({ seen, ...z }) => z);
}
function polysOut(features, propFn, tol = 3) {
  const out = [];
  for (const f of features) for (const rings of polygonsOf(f.geometry))
    out.push({ ...propFn(f.properties), rings: rings.map(r => simplify(r, tol).map(([x, y]) => [Math.round(x), Math.round(y)])) });
  return out;
}
const pointsOut = (features, propFn) => features.filter(f => f.geometry?.type === 'Point').map(f => ({ ...propFn(f.properties), pt: local(f.geometry.coordinates).map(Math.round) }));
const layers = {
  meta: { built: network.meta.built, note: 'All City layers downloaded from the City of Berkeley ArcGIS Online organization; see data/raw/city/*.meta.json',
    sources: [
      { key: 'streets', title: 'Street Centerlines (base network)', publisher: 'County of Alameda open data portal (data.acgov.org)', retrieved: '2026-10-20', category: 'sourced', why: 'Road geometry, names, class, direction of travel. Segment data revised 2015-09-26.' },
      { key: 'dem', title: dem.provenance.sources.join('; '), publisher: 'USGS 3D Elevation Program', retrieved: dem.provenance.retrieved, category: 'derived', why: dem.provenance.method + ' ' + dem.provenance.limits },
      ...(fs.existsSync(P('data/raw/city')) ? fs.readdirSync(P('data/raw/city')).filter(f => f.endsWith('.meta.json')).map(f => {
        const m = readJSON(`data/raw/city/${f}`);
        return { key: m.key, title: m.layers.map(l => l.name).join(', '), publisher: 'City of Berkeley (ArcGIS Online)', retrieved: m.retrieved, lastEdit: m.layers.map(l => l.lastEdit).filter(Boolean).join(', '), category: 'sourced', why: m.why, url: m.service };
      }) : []),
    ] },
  cityBoundary: polysOut(cityLayer('city_boundary'), () => ({}), 2),
  neighborhoods: polysOut(cityLayer('neighborhoods'), p => ({ name: p.Name })),
  evacZones: zonesOut(cityLayer('evac_zones')),
  evacRegions: polysOut(cityLayer('evac_regions'), p => ({ id: p.Region, name: p.RegionName })),
  fireZones: polysOut(cityLayer('fire_zones'), p => ({ zone: p.PLN_HILL_Z })),
  fire1923: polysOut(cityLayer('fire_1923'), () => ({}), 2),
  fireStations: pointsOut(cityLayer('fire_stations'), p => ({ name: p.TITLE, address: p.ADDRESS })),
  shelters: pointsOut(cityLayer('shelters'), p => ({ name: p.Name })),
  tightTurns: cityLayer('tight_turns').filter(f => f.geometry).map(f => ({ name: f.properties.FULLNAME, radius: f.properties.Radius,
    pts: (f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat()).map(local).map(([x, y]) => [r1(x), r1(y)]) })),
  noParkingSigns: [...cityLayer('no_parking_fz23'), ...cityLayer('no_parking_narrow')].filter(f => f.geometry?.type === 'Point')
    .map(f => ({ mutcd: f.properties.MUTCD, pt: local(f.geometry.coordinates).map(Math.round) })),
};
fs.writeFileSync(P('data/game/layers.json'), JSON.stringify(layers));
const kb = f => (fs.statSync(P(f)).size / 1024).toFixed(0) + ' KB';
console.log(`nodes ${nodes.length}, edges ${edges.length} (${stats.edges} vehicle), components ${ncomp}, main ${compSize[main]} nodes`);
console.log(`City width matched ${stats.width}/${stats.edges}, City lanes ${stats.cityLanes}, narrow ${stats.narrow}`);
console.log(`network.json ${kb('data/game/network.json')}, layers.json ${kb('data/game/layers.json')}`);
