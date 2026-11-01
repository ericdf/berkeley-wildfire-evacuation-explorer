#!/usr/bin/env node
// Build the simulator's data files from the raw inputs.
//
//   node tools/build-network.mjs
//
// Inputs (see DATA_INVENTORY.md):
//   data/raw/street-centerlines.geojson   base road network (Alameda County export, EPSG:4326)
//   data/terrain/dem.i16 + dem.json       elevation grid (tools/fetch-dem.mjs)
//   data/raw/city/*.geojson               City of Berkeley layers (tools/fetch-city-layers.mjs), optional
//   data/raw/osm/east-bay-roads.json      OpenStreetMap streets beyond Berkeley (Overpass; query beside it)
//   data/raw/osm/barriers-on-roads.json   OpenStreetMap barriers (+ berkeley-barriers.json for traffic circles)
//   data/raw/genasys/zones.json           Genasys zone outlines beyond Berkeley (protect.genasys.com WFS)
//   data/raw/census/blocks-2020.json      2020 Census block population at interior points (TIGERweb)
//   data/assumptions.json                 editable defaults (lanes, parking, capacities …)
// Outputs:
//   data/model/network.json   road graph: nodes, edges, per-field provenance
//   data/model/layers.json    zones, fire zones, 1923 boundary, stations, shelters, paths
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
const segD = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - u * dx, py - ay - u * dy); };
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
const zoneLabel = zid => String(zid || '').replace(/^US-CA-X[A-Z]{2}-/, '').replace(/-E0*(\d+)$/, (m, n) => '-' + n.padStart(3, '0'));
// Zones: Berkeley (BER) and Lab (LBL) zones from the City layer. Every other zone from the WFS behind
// protect.genasys.com (data/raw/genasys/zones.json): the City layer's Oakland, Albany and Emeryville
// zones are slivers along the city line (OKL-E021: 2,400 m² in the City layer, 939,000 m² in Genasys)
// carrying the whole zone's population, so only their est_popula and descriptions are kept. The WFS IDs
// drop the "E" (US-CA-XAL-OKL-005); they are stored the way the City layer writes them (US-CA-XAL-OKL-E005)
// so scenario zone lists match either source.
const berkZone = id => /-(BER|LBL)-E\d+$/.test(id);
const cityZoneProps = new Map(cityLayer('evac_zones').map(f => [f.properties.zone_id, f.properties]));
const wfsZones = has('data/raw/genasys/zones.json') ? readJSON('data/raw/genasys/zones.json').features
  .map(f => { const id = f.properties.identifer.replace(/-(\d+)$/, '-E$1'), c = cityZoneProps.get(id);
    return { ...f, properties: { zone_id: id, known_as: (c?.known_as || f.properties.commonly_known_as || '').trim(), est_popula: c ? c.est_popula : null, wfs: true } }; })
  .filter(f => !berkZone(f.properties.zone_id)) : [];
const allZoneFeatures = [...cityLayer('evac_zones').filter(f => berkZone(f.properties.zone_id)), ...wfsZones];
const evacZoneOf = zoneIndex(allZoneFeatures, p => zoneLabel(p.zone_id));

// ---------- 3b. OpenStreetMap streets beyond Berkeley ----------
// data/raw/osm/east-bay-roads.json: drivable OSM ways in the model area (Overpass, 2026-11-01).
// Inside Berkeley the County file wins: OSM vertices inside the city limits or within 8 m of a County
// street are dropped. Where an OSM street meets the County network, its end is moved onto the nearest
// County node (a dead end within 60 m preferred, any node within 25 m otherwise). OSM streets are cut
// 15 m inside the DEM extent; those cut ends are where traffic leaves the modeled area (exitNodes).
const OSM_CLASS = { motorway: 'Interstate', motorway_link: 'Ramp', trunk_link: 'Ramp', trunk: 'Principal Arterial', primary: 'Principal Arterial', primary_link: 'Principal Arterial',
  secondary: 'Principal Arterial', secondary_link: 'Principal Arterial', tertiary: 'Major Collector', tertiary_link: 'Major Collector', unclassified: 'Local', residential: 'Local', living_street: 'Local' };
const SUFFIX = { Avenue: 'AV', Street: 'ST', Road: 'RD', Drive: 'DR', Boulevard: 'BL', Place: 'PL', Court: 'CT', Lane: 'LN', Way: 'WY', Terrace: 'TE', Circle: 'CIR', Path: 'PATH', Highway: 'HWY', Trail: 'TRL', Crescent: 'CRES', Parkway: 'PKWY', Plaza: 'PLZ', Square: 'SQ', Alley: 'ALY', Walk: 'WALK', Row: 'ROW' };
const osmName = t => {
  if (!t.name) return t.ref ? t.ref.replace(/\s+/g, '').split(';')[0] : 'UNNAMED';
  const w = t.name.split(/\s+/); if (w.length > 1 && SUFFIX[w.at(-1)]) w[w.length - 1] = SUFFIX[w.at(-1)];
  return w.join(' ').toUpperCase();
};
const exitNodes = new Set();
const osmStats = { ways: 0, segments: 0, joins: 0, joinsDeadEnd: 0, unjoined: 0, exits: 0 };
if (has('data/raw/osm/east-bay-roads.json')) {
  const osm = readJSON('data/raw/osm/east-bay-roads.json').elements;
  const onode = new Map(osm.filter(x => x.type === 'node').map(n => [n.id, n]));
  const ways = osm.filter(x => x.type === 'way' && OSM_CLASS[x.tags?.highway]);
  const uses = new Map(); for (const w of ways) w.nodes.forEach((id, i) => uses.set(id, (uses.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
  const berk = cityLayer('city_boundary').flatMap(f => polygonsOf(f.geometry)).map(rings => ({ rings, bb: bboxOf(rings) }));
  const inBerk = p => berk.some(q => p[0] >= q.bb[0] && p[0] <= q.bb[2] && p[1] >= q.bb[1] && p[1] <= q.bb[3] && inPoly(p, q.rings));
  // County vehicle streets: proximity grid and node degrees (nodeFor gives the same ids again in step 4)
  const G = 50, cg = new Map(), cDeg = new Map(), cDir = new Map();
  for (const s of segs) if (s.mode === 'vehicle') {
    for (let k = 1; k < s.pts.length; k++) { const a = s.pts[k - 1], b = s.pts[k]; const key = `${Math.floor((a[0] + b[0]) / 2 / G)},${Math.floor((a[1] + b[1]) / 2 / G)}`; if (!cg.has(key)) cg.set(key, []); cg.get(key).push([a, b]); }
    const tw = s.p.TRVLWAY;
    [s.pts[0], s.pts.at(-1)].forEach((p, end) => { const id = nodeFor(p); cDeg.set(id, (cDeg.get(id) || 0) + 1);
      // can traffic on this County segment leave (out) or reach (in) this node?
      const d = cDir.get(id) || { in: false, out: false, cls: [] }; cDir.set(id, d); d.cls.push(s.p.CLASS);
      if (tw !== 'FT' && tw !== 'TF') { d.in = d.out = true; } else if ((tw === 'FT') === (end === 0)) d.out = true; else d.in = true; });
  }
  const lg = new Map();
  for (const q of berk) for (const r of q.rings) for (let k = 1; k < r.length; k++) { const key = `${Math.floor(r[k][0] / G)},${Math.floor(r[k][1] / G)}`; if (!lg.has(key)) lg.set(key, []); lg.get(key).push([r[k - 1], r[k]]);
    const L = dist(r[k - 1], r[k]); for (let u = G / 2; u < L; u += G / 2) { const m = [r[k - 1][0] + (r[k][0] - r[k - 1][0]) * u / L, r[k - 1][1] + (r[k][1] - r[k - 1][1]) * u / L], k2 = `${Math.floor(m[0] / G)},${Math.floor(m[1] / G)}`; if (!lg.has(k2)) lg.set(k2, []); lg.get(k2).push([r[k - 1], r[k]]); } }
  const nearLine = (p, d) => { const cx = Math.floor(p[0] / G), cy = Math.floor(p[1] / G);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const [a, b] of lg.get(`${cx + dx},${cy + dy}`) || []) if (segD(p[0], p[1], a, b) <= d) return true; return false; };
  const nearCounty = (p, d) => { const cx = Math.floor(p[0] / G), cy = Math.floor(p[1] / G);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const [a, b] of cg.get(`${cx + dx},${cy + dy}`) || []) if (segD(p[0], p[1], a, b) <= d) return true; return false; };
  const countyNodes = [...cDeg.keys()];
  // Join where the OSM street (from its last kept vertex `a` to the first dropped vertex `b`) meets the
  // County network: a County dead end within 30 m of that stretch, nearest to `a`; else any County node
  // within 25 m of `b`.
  // need: 'out' if OSM traffic flows only into the County node, 'in' if only out of it
  // An open end: a County dead end, or (freeways) a node where only a ramp meets the carriageway.
  // Freeway and ramp ends join only freeways and ramps, streets only streets.
  const FWY = c => c === 'Interstate' || c === 'Ramp';
  const sameKind = (id, cls) => cDir.get(id).cls.some(c => FWY(c) === FWY(cls));
  const openEnd = (id, cls) => { const c = cDir.get(id).cls; return sameKind(id, cls) && (c.length === 1 || (c.length === 2 && cls === 'Interstate' && c.filter(x => x === cls).length === 1)); };
  // path: the run's end `a`, then up to three dropped vertices beyond it (b first)
  const joinNode = (a, path, need, not, cls) => { let best = null, bs = Infinity; const b = path[0], P = [a, ...path];
    for (const id of countyNodes) { if (id === not || !openEnd(id, cls) || (need && !cDir.get(id)[need])) continue; const q = nodes[id].pt;
      if (!P.slice(1).some((r, m) => segD(q[0], q[1], P[m], r) <= 30)) continue; const d = dist(q, a); if (d < bs) { bs = d; best = { id, dead: true, d }; } }
    if (best) return best;
    for (const id of countyNodes) { if (id === not || !sameKind(id, cls)) continue; const d = dist(nodes[id].pt, b); if (d <= 25 && d < bs) { bs = d; best = { id, dead: false, d }; } }
    return best; };
  const M = 15, XM = dem.xmax - OX - M, YM = dem.ymax - OY - M;
  const inExtent = p => p[0] >= M && p[1] >= M && p[0] <= XM && p[1] <= YM;
  for (const w of ways) {
    const t = w.tags, pts = w.nodes.map(id => onode.get(id)).map(n => n ? local([n.lon, n.lat]) : null);
    if (pts.some(p => !p)) continue;
    osmStats.ways++;
    // inside Berkeley but within 40 m of the city line, OSM is kept unless a County street is there:
    // streets that run along the line (Claremont Av near Tanglewood Rd) are not in the County file
    // freeways too: the County file stops I-80 at the Ashby Av ramps, short of the Emeryville line
    const fwy = /^motorway/.test(t.highway);
    const keep = pts.map(p => inExtent(p) && (fwy ? !nearCounty(p, 25) : !nearCounty(p, 8) && !(inBerk(p) && !nearLine(p, 40))));
    const cls = OSM_CLASS[t.highway];
    const dirOf = () => { const ow = t.oneway; if (ow === '-1') return 'TF'; if (ow === 'yes' || ow === 'true' || ow === '1' || t.junction === 'roundabout' || (t.highway === 'motorway' && ow !== 'no')) return 'FT'; return 'B'; };
    const motorNo = ['no'].includes(t.motor_vehicle ?? t.vehicle ?? t.access);
    let name = osmName(t);
    let i = 0;
    while (i < pts.length) {
      if (!keep[i]) { i++; continue; }
      let j = i; while (j + 1 < pts.length && keep[j + 1]) j++;
      // run i..j of kept vertices; extend by one vertex onto the County network, or note an exit
      let run = pts.slice(i, j + 1).map(p => [...p]), ids = w.nodes.slice(i, j + 1);
      const ends = [[i - 1, 0], [j + 1, 1]]; let first = null; // a run never joins the same County node at both ends
      for (const [k, side] of ends) {
        if (k < 0 || k >= pts.length) continue;
        const endPt = side ? run.at(-1) : run[0];
        if (!inExtent(pts[k])) { exitNodes.add(endPt); continue; }
        const dir = dirOf(), need = dir === 'B' ? null : (dir === 'FT') === (side === 1) ? 'out' : 'in';
        const path = []; for (let m = k; m >= 0 && m < pts.length && path.length < 3 && !keep[m]; m += side ? 1 : -1) path.push(pts[m]);
        const jn = joinNode(endPt, path, need, first, cls);
        if (!jn) { osmStats.unjoined++; continue; }
        osmStats.joins++; if (jn.dead) osmStats.joinsDeadEnd++; first = jn.id;
        if (side) { run.push([...nodes[jn.id].pt]); ids.push(null); } else { run.unshift([...nodes[jn.id].pt]); ids.unshift(null); }
      }
      // split at OSM junctions (nodes shared with other drivable ways)
      let s0 = 0;
      for (let k = 1; k < run.length; k++) {
        if (k === run.length - 1 || (ids[k] != null && uses.get(ids[k]) > 1)) {
          const sp = run.slice(s0, k + 1);
          if (polyLen(sp) >= 1) {
            let nm = name;
            // name freeway carriageways the way the County file does, so the Time Study's through traffic finds them
            if (cls === 'Interstate' && /\bI ?80\b/.test(t.ref || '')) { const north = sp.at(-1)[1] > sp[0][1]; nm = north ? 'I80 EB' : 'I80 WB'; }
            else if (/\bCA ?24\b/.test(t.ref || '') && t.highway === 'motorway') { const west = sp.at(-1)[0] < sp[0][0]; nm = west ? 'CA24 SB' : 'CA24 NB'; }
            segs.push({ pts: sp, mode: motorNo ? 'restricted' : 'vehicle', osm: { way: w.id, tags: t },
              p: { CLASS: cls, STREET: nm, SFEATYP: null, TRVLWAY: motorNo ? 'NT' : dirOf(), OBJECTID: null, SEGID: null } });
            osmStats.segments++;
          }
          s0 = k;
        }
      }
      i = j + 1;
    }
  }
  osmStats.exits = exitNodes.size;
  console.log('OSM streets', JSON.stringify(osmStats));
}
// Outside Berkeley the City's Fire Zones 2-3 do not exist. Streets whose midpoint is at 90 m elevation or
// higher count as hills (fireZone 2, fireZoneSrc says so): the threshold fire.js already uses for hill
// residential land outside the city. The CAL FIRE LRA layer in the City's FHSZ service was tried first
// and rejected: it rates Hiller Highlands and Claremont Canyon in Oakland "Moderate" (checked 2026-11-01).
const HILL_ELEV_M = 90;
const widthMedian = new Map(); // Berkeley median City width (m) by class and hills, for OSM streets with no width tag

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
  let fireZone = fireZoneOf(mid) ?? null, fireZoneSrc = fireZone == null ? null : 'city:FireZones';
  const zMid = elev(...mid);
  if (s.osm && fireZone == null && zMid != null && zMid >= HILL_ELEV_M) { fireZone = 2; fireZoneSrc = 'proxy:elevation>=90m'; }
  const hills = fireZone === 2 || fireZone === 3;
  const structure = ['Interstate', 'Ramp'].includes(p.CLASS);

  const e = {
    id: edges.length, a, b, name: p.STREET || 'UNNAMED', cls: p.CLASS, type: p.SFEATYP, trav: p.TRVLWAY, mode: s.mode,
    src: s.osm ? { osmWay: s.osm.way } : { OBJECTID: p.OBJECTID, SEGID: p.SEGID },
    len: r1(len), geom: simplify(s.pts, 0.75).map(([x, y]) => [r1(x), r1(y)]),
    z: [za == null ? null : r1(za), zb == null ? null : r1(zb)],
    grade: za == null || zb == null ? null : Math.round((zb - za) / len * 1000) / 10, // % in digitized direction
    gradeMax: Math.round(gmax * 1000) / 10,
    gradeReliable: !structure && gmax < 0.35, // >35% is beyond any Berkeley street; treat as a DEM artefact
    fireZone, evacZone: evacZoneOf(mid),
  };
  if (fireZoneSrc && s.osm) e.fireZoneSrc = fireZoneSrc;

  if (s.mode === 'vehicle') {
    stats.edges++;
    const t = s.osm?.tags;
    const city = t ? null : cityLines(s.pts, e.name, q => q.FULLNAME);
    const widthFt = city && city.PAV_WIDTH_RD > 0 ? city.PAV_WIDTH_RD : null;
    const pavLanes = city && city.PAV_LANES > 0 ? city.PAV_LANES : null;
    const narrow = t ? null : narrowLines(s.pts, e.name, q => q.FULLNAME, 8);
    if (widthFt) stats.width++;
    if (pavLanes) stats.cityLanes++;
    if (narrow) stats.narrow++;
    e.city = city ? { id: city.FACILITYID, speedMph: city.SPEED || null, category: city.CATEGORY || null } : null;

    // lanes (total both directions)
    let lanes, lanesSrc;
    const rule = A.lanes.byClass[p.CLASS] ?? A.lanes.byClass.default;
    const oneway = p.TRVLWAY === 'FT' || p.TRVLWAY === 'TF';
    const osmLanes = t && /^\d+$/.test(t.lanes || '') ? +t.lanes : null; // OSM: total for two-way streets, per direction for one-way
    if (hills && p.CLASS === 'Local') { lanes = A.lanes.hillsLocal; lanesSrc = 'assumption:hillsLocal'; }
    else if (pavLanes && pavLanes <= 6) { lanes = pavLanes; lanesSrc = 'city:PAV_LANES'; }
    else if (osmLanes && osmLanes <= 8) { lanes = osmLanes; lanesSrc = 'osm:lanes'; }
    else if (t && oneway) { lanes = p.CLASS === 'Local' || p.CLASS === 'Ramp' ? 1 : Math.ceil(rule / 2); lanesSrc = 'assumption:byClass'; }
    else { lanes = rule; lanesSrc = 'assumption:byClass'; }
    e.lanes = oneway ? (p.TRVLWAY === 'FT' ? [lanes, 0] : [0, lanes]) : [Math.max(1, Math.floor(lanes / 2)), Math.max(1, Math.ceil(lanes / 2))];
    if (oneway && lanes > 2 && p.CLASS === 'Local') e.lanes = p.TRVLWAY === 'FT' ? [1, 0] : [0, 1];
    e.lanesSrc = lanesSrc;

    // width and parking
    e.widthM = widthFt ? r1(widthFt * FT) : null;
    e.widthSrc = widthFt ? 'city:PAV_WIDTH_RD' : 'unknown';
    if (t) {
      // OSM width tag (meters, or feet'inches"), else Berkeley's median City width for the same class and hills/flats
      const ft = /^(\d+)'(\d+)"?$/.exec(t.width || ''), m = /^[\d.]+$/.test(t.width || '') ? +t.width : ft ? (+ft[1] + ft[2] / 12) * FT : null;
      if (m && m > 2) { e.widthM = r1(m); e.widthSrc = 'osm:width'; }
      else {
        if (!widthMedian.size) for (const q of edges) if (q.widthSrc?.startsWith('city:') && q.widthM) {
          const k = `${q.cls}|${q.fireZone === 2 || q.fireZone === 3}`; if (!widthMedian.has(k)) widthMedian.set(k, []); widthMedian.get(k).push(q.widthM);
        }
        const v = (widthMedian.get(`${p.CLASS}|${hills}`) || widthMedian.get(`${p.CLASS}|false`) || []).slice().sort((x, y) => x - y);
        if (v.length && p.CLASS !== 'Interstate' && p.CLASS !== 'Ramp') { e.widthM = v[Math.floor(v.length / 2)]; e.widthSrc = `assumption:berkeleyMedian(${p.CLASS}${hills ? ', hills' : ''})`; }
      }
      // one-way OSM streets: the median is for two-way Berkeley streets; scale to the lanes this way carries
      if (oneway && e.widthSrc.startsWith('assumption')) e.widthM = r1(Math.max(e.widthM * 0.6, 3.5 * Math.max(e.lanes[0], e.lanes[1])));
    }
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
    // moving lanes that physically fit between parked cars (model rule)
    e.effLanes = e.clearWidthM == null ? null
      : e.clearWidthM >= 2 * A.access.movingLaneM ? 2 : e.clearWidthM >= A.access.movingLaneM ? 1 : 0;
    e.belowFireCodeWidth = e.clearWidthM != null && e.clearWidthM < A.access.fireCodeClearM;
    e.engineBlocked = e.clearWidthM != null && e.clearWidthM < A.access.engineClearM;

    // speed (assumption by class) and capacity (AB 747 / HCM 2022 rules, SOURCE_NOTES B2-B3)
    const C = A.capacity, sk = structure ? p.CLASS : hills && p.CLASS === 'Local' ? 'hillsLocal' : p.CLASS;
    const posted = city?.SPEED || (t && /^\d+ mph$/.test(t.maxspeed || '') ? parseInt(t.maxspeed) : null); // City SPEED, or OSM maxspeed outside Berkeley
    const mph = Math.min(C.speedMph[sk] ?? C.speedMph.Local, posted && !hills ? posted : Infinity);
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
// where OSM streets were cut at the edge of the DEM: traffic leaves the modeled area here. A street
// group that reaches the edge of the model area connects to the rest of the network beyond it.
const exitIds = [...new Set([...exitNodes].map(pt => nodeFor(pt)))].filter(n => comp[n] >= 0);
const outward = new Set(exitIds.map(n => comp[n])); outward.add(main);
for (const e of edges) if (e.mode === 'vehicle' && !outward.has(comp[e.a])) e.disconnected = true;
// One-way OSM pieces that lead into a dead end (a join that failed, e.g. a 13 m El Camino Real stub)
// would trap any car placed on them: drop them, repeating until none is left.
{ const exitSet = new Set(exitIds); let changed = true; stats.osmOneWayStubs = 0;
  while (changed) { changed = false; const out = new Int32Array(nodes.length);
    for (const e of edges) if (e.mode === 'vehicle' && !e.disconnected) { if (e.trav !== 'TF') out[e.a]++; if (e.trav !== 'FT') out[e.b]++; }
    for (const e of edges) if (e.src.osmWay && e.mode === 'vehicle' && !e.disconnected && (e.trav === 'FT' || e.trav === 'TF')) {
      const head = e.trav === 'FT' ? e.b : e.a;
      if (!exitSet.has(head) && !out[head]) { e.disconnected = true; changed = true; stats.osmOneWayStubs++; }
    } } }

// ---------- 5b. Diverters, bollards and gates; traffic circles ----------
// List of record: the City's "Existing Traffic Calming Devices" layer (data/raw/city/traffic_calming.geojson,
// edited 2025-10-28): 75 diverters, 63 traffic circles and 1 gate. The layer gives only a point, so what a
// device does to cars is read from OpenStreetMap around it. OSM draws a diverter as a gap in the street
// bridged by a cycleway, as a one-way stub, or as a barrier node. OSM barrier nodes that close a street away
// from any City device (bollards, the Panoramic Way gate in Oakland) are sites too.
// At each site every street arm of the network is matched to the OSM car network (the OSM segments of the same
// street within 15 m, about 40 m out), and the build tests which arms OSM lets a car drive between without
// leaving the site:
//   an arm OSM cuts off from every other arm      -> closure: the arm is detached from the junction
//   arms OSM joins in pairs (diagonal diverter)   -> node split: one node per pair
//   an arm OSM lets cars only leave or only enter -> one-way: a 15 m one-way piece next to the junction
// A site in mid-block splits the street at the barrier, so both halves of the block stay reachable; where one
// side is a dead-end street (upper Panoramic Way beyond its gate), that side is closed to its end instead, and
// a barrier within 20 m of a dead end is skipped (it would cut the last few meters off).
// A detached arm or pair is joined back by a short connector edge marked barrier.closed: residents' cars never
// use it; engines pass it after access.barrierDelayS where OSM tags the crossing emergency=yes or it is a gate.
// A change that would cut streets off from the rest of the network is undone. Turns banned inside an open
// junction (OSM restriction relations) are not modeled.
const ORDINAL = { FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH' };
const nameKey = s => norm(String(s || '').toUpperCase().replace(/^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)\b/, w => ORDINAL[w]));
const sameName = (a, b) => a === 'UNNAMED' || b === 'UNNAMED' || nameKey(a) === nameKey(b);
const closesCars = t => { const kind = t?.barrier; if (!kind || kind === 'kerb') return false;
  const motor = t.motor_vehicle ?? t.vehicle ?? t.access;
  return /gate/.test(kind) ? ['no', 'private'].includes(motor) : !['yes', 'permissive', 'destination'].includes(motor); };
const vEdge = e => e.mode === 'vehicle' && !e.disconnected;
// OSM car graph from data/raw/osm/east-bay-roads.json (every drivable way in the model area, Berkeley included)
const og = { pt: new Map(), adj: new Map(), blocked: new Set(), grid: new Map() };
const OG = 50;
if (has('data/raw/osm/east-bay-roads.json')) {
  const el = readJSON('data/raw/osm/east-bay-roads.json').elements;
  for (const n of el) if (n.type === 'node') { og.pt.set(n.id, local([n.lon, n.lat])); if (closesCars(n.tags)) og.blocked.add(n.id); }
  for (const w of el) {
    if (w.type !== 'way' || !OSM_CLASS[w.tags?.highway]) continue;
    const t = w.tags; if ((t.motor_vehicle ?? t.vehicle ?? t.access) === 'no') continue;
    const ow = t.oneway, dir = ow === '-1' ? -1 : (ow === 'yes' || ow === 'true' || ow === '1' || t.junction === 'roundabout' || (t.highway === 'motorway' && ow !== 'no')) ? 1 : 0;
    const name = osmName(t);
    for (let i = 1; i < w.nodes.length; i++) {
      const u = w.nodes[i - 1], v = w.nodes[i], a = og.pt.get(u), b = og.pt.get(v), L = dist(a, b);
      for (const x of [u, v]) if (!og.adj.has(x)) og.adj.set(x, []);
      if (dir >= 0) og.adj.get(u).push([v, L]); if (dir <= 0) og.adj.get(v).push([u, L]);
      const s = { u, v, a, b, L, fwd: dir >= 0, bwd: dir <= 0, name }, seen = new Set();
      for (let f = 0; f <= 1.001; f += Math.min(1, 25 / (L || 1))) { const k = `${Math.floor((a[0] + (b[0] - a[0]) * f) / OG)},${Math.floor((a[1] + (b[1] - a[1]) * f) / OG)}`;
        if (seen.has(k)) continue; seen.add(k); if (!og.grid.has(k)) og.grid.set(k, []); og.grid.get(k).push(s); }
    }
  }
}
const osmSegsNear = p => { const out = new Set(), cx = Math.floor(p[0] / OG), cy = Math.floor(p[1] / OG);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const s of og.grid.get(`${cx + dx},${cy + dy}`) || []) out.add(s); return [...out]; };
// Can a car drive from one probe (the OSM segments across an arm) to another within `cap` meters, without passing
// more than R from the site? Barrier nodes block. Reaching a target segment at either end counts.
function osmDrive(from, to, cap, c, R) {
  const d = new Map(), open = [];
  const push = (x, dd) => { if (dd > cap || og.blocked.has(x) || dd >= (d.get(x) ?? Infinity)) return; d.set(x, dd); open.push([dd, x]); };
  for (const { s, t } of from.segs) { if (s.fwd) push(s.v, (1 - t) * s.L); if (s.bwd) push(s.u, t * s.L); }
  while (open.length) { open.sort((x, y) => y[0] - x[0]); const [du, u] = open.pop(); if (du > d.get(u)) continue;
    if (to.segs.some(({ s }) => (s.u === u && s.fwd) || (s.v === u && s.bwd))) return true;
    if (dist(og.pt.get(u), c) > R) continue;
    for (const [v, L] of og.adj.get(u) || []) push(v, du + L); }
  return false;
}
// projection of p on a polyline: distance along it and offset from it
function project(pts, p) { let best = { along: 0, off: Infinity }, acc = 0;
  for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const u = L2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)) : 0, off = Math.hypot(p[0] - ax - u * dx, p[1] - ay - u * dy);
    if (off < best.off) best = { along: acc + u * L, off }; acc += L; }
  return best; }
function cutAt(pts, d) { let acc = 0;
  for (let i = 1; i < pts.length; i++) { const L = dist(pts[i - 1], pts[i]);
    if (acc + L >= d) { const u = L ? (d - acc) / L : 0, p = [r1(pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0])), r1(pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1]))];
      return [[...pts.slice(0, i), p], [p, ...pts.slice(i)]]; } acc += L; }
  return [pts, [pts.at(-1), pts.at(-1)]]; }
// Match one arm (geometry oriented away from the site) to the OSM street: at a point about 40 m out, every OSM
// segment of the same name that runs alongside within 15 m (both carriageways of a divided street).
function osmProbe(armPts, name) {
  const L = polyLen(armPts);
  const tries = L < 24 ? [L / 2] : [40, 30, 55, 20, 70, 15, 12].filter(d => d <= L - 5);
  for (const d of tries) {
    const p = pointAt(armPts, d / L), q = pointAt(armPts, Math.min(L, d + 5) / L), r = pointAt(armPts, Math.max(0, d - 5) / L);
    const ax = q[0] - r[0], ay = q[1] - r[1], al = Math.hypot(ax, ay) || 1, segs = [];
    for (const s of osmSegsNear(p)) {
      if (!sameName(s.name, name) || !s.L) continue;
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], t = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / (s.L * s.L);
      if (t < -0.02 || t > 1.02) continue; // the segment must run past the probe point, not end short of it (at a gap)
      if (Math.hypot(p[0] - s.a[0] - t * dx, p[1] - s.a[1] - t * dy) > 15 || Math.abs((dx * ax + dy * ay) / (s.L * al)) < 0.8) continue;
      segs.push({ s, t: Math.max(0, Math.min(1, t)) });
    }
    if (segs.length) return { segs, along: d };
  }
  return null; }
const compass = pts => { const L = polyLen(pts), p = pointAt(pts, L ? Math.min(20, L) / L : 0), a = Math.atan2(p[1] - pts[0][1], p[0] - pts[0][0]) * 180 / Math.PI;
  return ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'][Math.round(((a + 360) % 360) / 45) % 8]; };

// network bookkeeping: vehicle edges at each node, dead ends, reachability from the main component and the exits
const exitSet = new Set(exitIds), mainNode = nodes.findIndex((_, i) => comp[i] === main);
let inc; const rebuildInc = () => { inc = nodes.map(() => []); for (const e of edges) if (vEdge(e)) { inc[e.a].push(e); if (e.b !== e.a) inc[e.b].push(e); } };
const deadEnd = n => inc[n].length === 1 && !exitSet.has(n);
const isClosed = e => e.barrier?.closed;
const unreached = (skip = null) => { const seen = new Uint8Array(nodes.length), st = []; for (const s of [mainNode, ...exitIds]) if (!seen[s]) { seen[s] = 1; st.push(s); }
  const adj2 = nodes.map(() => []); for (const e of edges) if (vEdge(e) && !isClosed(e) && e !== skip) { adj2[e.a].push(e.b); adj2[e.b].push(e.a); }
  while (st.length) { const u = st.pop(); for (const w of adj2[u]) if (!seen[w]) { seen[w] = 1; st.push(w); } }
  return { seen, count: edges.filter(e => vEdge(e) && !isClosed(e) && e !== skip && (!seen[e.a] || !seen[e.b])).length }; };
const RANK = { Local: 0, 'Major Collector': 1, 'Principal Arterial': 2, Ramp: 3, Interstate: 3 };
function splitEdge(e, d) { // e becomes a -> X and a copy X -> b is added; returns [e, copy, X]
  const [g1, g2] = cutAt(e.geom, d), L1 = polyLen(g1), L2 = polyLen(g2), X = nodes.length; nodes.push({ pt: g1.at(-1) });
  const zX = elev(...g1.at(-1)), e2 = { ...structuredClone(e), id: edges.length, a: X, geom: g2, len: r1(e.len * L2 / (L1 + L2)), z: [zX == null ? null : r1(zX), e.z[1]] };
  Object.assign(e, { b: X, geom: g1, len: r1(e.len * L1 / (L1 + L2)), z: [e.z[0], e2.z[0]] });
  edges.push(e2); rebuildInc(); return [e, e2, X]; }
function connector(from, to, like, barrier) { // short edge from a detached arm back to the junction, closed to residents' cars
  const g = [[r1(nodes[from].pt[0]), r1(nodes[from].pt[1])], [r1(nodes[to].pt[0]), r1(nodes[to].pt[1])]];
  const e = { ...structuredClone(like), id: edges.length, a: from, b: to, geom: g, len: r1(Math.max(1, dist(g[0], g[1]))), trav: 'B',
    lanes: [1, 1], grade: 0, z: [elev(...g[0]), elev(...g[1])].map(v => v == null ? null : r1(v)), barrier: { ...barrier, closed: true } };
  delete e.steep; edges.push(e); rebuildInc(); return e; }
const wasDir = new Map(); // one-way pieces: direction and lanes before, in case the change is undone
function oneWayPiece(e, ft) { wasDir.set(e, { trav: e.trav, lanes: e.lanes }); const l = Math.max(...e.lanes); e.trav = ft; e.lanes = ft === 'FT' ? [l, 0] : [0, l]; }
const barrierOf = (site, extra) => ({ kind: site.kind, cityId: site.cityId, osm: site.osm, engines: site.engines, gate: site.gate, street: site.street, ...extra });
const sites = [];
// An arm's geometry away from the site, carried on through the far node along the same street while shorter than
// 60 m, so a probe can reach past a gap that covers a short block end (Russell St east of Piedmont Av).
function extend(pts, far, not, name) {
  for (let hop = 0; hop < 2 && polyLen(pts) < 60; hop++) {
    const next = inc[far].filter(g => g !== not && g.a !== g.b && g.name === name); if (next.length !== 1) break;
    const g = next[0], gp = g.a === far ? g.geom : [...g.geom].reverse(); pts = [...pts, ...gp.slice(1)]; not = g; far = g.a === far ? g.b : g.a; }
  return pts; }

// Analyse one site and change the network. c: device point; n: junction node, or null for mid-block on `onEdge` at `along` m.
// dry: only report whether the site would change the network ('restricted') or why not.
function applySite(site, c, n, onEdge, along, dry = false) {
  rebuildInc();
  if (n == null) {
    const [h0, h1] = cutAt(onEdge.geom, along), ends = [onEdge.a, onEdge.b];
    for (const [k, h] of [[0, h0], [1, h1]]) if (deadEnd(ends[k]) && polyLen(h) < 20) { site.action = 'nextToDeadEnd'; site.note = `${Math.round(polyLen(h))} m from a dead end`; return; }
    const arms = [{ pts: extend([...h0].reverse(), onEdge.a, onEdge, onEdge.name) }, { pts: extend(h1, onEdge.b, onEdge, onEdge.name) }];
    const pr = arms.map(a => osmProbe(a.pts, onEdge.name));
    // an OSM barrier node is itself the evidence: if OSM has no street on one side to test, it closes the street
    if (pr.some(p => !p) && site.src !== 'osm') { site.action = 'noOsmMatch'; return; }
    const R = pr.every(Boolean) && Math.max(pr[0].along, pr[1].along) + 25, cap = R && pr[0].along + pr[1].along + 40;
    const fwd = R && osmDrive(pr[0], pr[1], cap, c, R), back = R && osmDrive(pr[1], pr[0], cap, c, R); // fwd: toward e.b
    const needF = onEdge.trav !== 'TF', needB = onEdge.trav !== 'FT';
    if ((fwd || !needF) && (back || !needB)) { site.action = 'openInOsm'; return; }
    if (dry) return 'restricted';
    if (fwd || back) { // one direction only: a 15 m one-way piece at the device
      const [, e2] = splitEdge(onEdge, along), [piece] = splitEdge(e2, Math.min(15, e2.len / 2));
      oneWayPiece(piece, fwd ? 'FT' : 'TF');
      piece.barrier = barrierOf(site, { action: fwd ? 'one-way (drawn direction)' : 'one-way (against drawn direction)', closed: false });
      site.action = 'oneWay'; site.edges = [piece.id]; return; }
    // closed both ways: split the block at the device
    const r0 = unreached(onEdge), deadSide = [onEdge.a, onEdge.b].map(x => !r0.seen[x]);
    if (deadSide[0] && deadSide[1]) { site.action = 'keptOpenCut'; site.note = 'neither side connects elsewhere'; return; }
    if (deadSide[0] || deadSide[1]) { // one side has no other way out: close that piece to its end (upper Panoramic Way beyond the gate)
      const far = deadSide[1] ? onEdge.b : onEdge.a;
      if (!deadEnd(far)) { site.action = 'keptOpenCut'; site.note = 'closing it would cut streets off from the rest of the network'; return; }
      const [e1, e2] = splitEdge(onEdge, along), piece = deadSide[1] ? e2 : e1;
      piece.barrier = barrierOf(site, { action: 'closes the dead-end side', closed: true });
      site.action = 'closure'; site.edges = [piece.id]; return; }
    const [, e2] = splitEdge(onEdge, along), [cn] = splitEdge(e2, Math.min(3, e2.len / 2));
    cn.barrier = barrierOf(site, { action: 'closure', closed: true }); cn.trav = 'B'; cn.lanes = [1, 1];
    site.action = 'closure'; site.edges = [cn.id]; return;
  }
  // junction site
  const arms = inc[n].filter(e => e.a !== e.b).map(e => { const out = e.a === n ? 'FT' : 'TF', inn = e.a === n ? 'TF' : 'FT';
    return { e, jn: n, pts: extend(e.a === n ? e.geom : [...e.geom].reverse(), e.a === n ? e.b : e.a, e, e.name), name: e.name, inOK: e.trav === 'B' || e.trav === inn, outOK: e.trav === 'B' || e.trav === out }; });
  const pr = arms.map(a => osmProbe(a.pts, a.name)), k = arms.length;
  if (pr.filter(Boolean).length < 2) { site.action = 'noOsmMatch'; return; }
  const R = Math.max(...pr.filter(Boolean).map(p => p.along)) + 25;
  const net = (i, j) => arms[i].inOK && arms[j].outOK;
  const osm = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => i !== j && pr[i] && pr[j] && net(i, j) && osmDrive(pr[i], pr[j], pr[i].along + pr[j].along + 40, c, R)));
  // groups: arms OSM connects in either direction; arms with no OSM match stay together
  const grp = arms.map((_, i) => i), find = i => grp[i] === i ? i : (grp[i] = find(grp[i])), join = (i, j) => { grp[find(i)] = find(j); };
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j && (pr[i] && pr[j] ? osm[i][j] || osm[j][i] : !pr[i] && !pr[j])) join(i, j);
  const groups = new Map(); arms.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const G = [...groups.values()];
  // one-way arms: the network lets cars enter (or leave) the junction from this arm, OSM does not
  const oneWay = [];
  for (const g of G) if (g.length > 1) for (const i of g) { if (!pr[i] || arms[i].e.trav !== 'B') continue;
    const mates = g.filter(j => j !== i && pr[j]); if (!mates.length) continue;
    const inBlocked = !mates.some(j => osm[i][j]), outBlocked = !mates.some(j => osm[j][i]);
    if (inBlocked !== outBlocked) oneWay.push({ i, toward: outBlocked }); }
  // OSM bans some movements the network allows but leaves every arm connected both ways: turn bans, not modeled
  if (G.length === 1 && !oneWay.length) { site.action = osm.some((row, i) => row.some((v, j) => i !== j && pr[i] && pr[j] && net(i, j) && !v)) ? 'turnsNotModeled' : 'openInOsm'; return; }
  if (dry) return 'restricted';
  const made = [];
  if (G.length > 1) {
    // the group with unmatched arms, else the highest-class or largest group, stays on the junction node
    const score = g => (g.some(i => !pr[i]) ? 100 : 0) + Math.max(...g.map(i => RANK[arms[i].e.cls] ?? 0)) * 10 + g.length;
    const anchor = G.reduce((b, g) => score(g) > score(b) ? g : b);
    for (const g of G) { if (g === anchor) continue;
      // new node 3 m from the junction toward the group's arms
      const dirs = g.map(i => { const L = polyLen(arms[i].pts), p = pointAt(arms[i].pts, Math.min(3, L / 2) / L); return [p[0] - nodes[n].pt[0], p[1] - nodes[n].pt[1]]; });
      const m = dirs.reduce((s, d) => [s[0] + d[0], s[1] + d[1]], [0, 0]), ml = Math.hypot(...m) || 1;
      const Y = nodes.length; nodes.push({ pt: [r1(nodes[n].pt[0] + m[0] / ml * 3), r1(nodes[n].pt[1] + m[1] / ml * 3)] });
      for (const i of g) { const e = arms[i].e; arms[i].jn = Y; if (e.a === n) { e.a = Y; e.geom[0] = nodes[Y].pt; } else { e.b = Y; e.geom[e.geom.length - 1] = nodes[Y].pt; } }
      const like = arms[g.reduce((b, i) => (RANK[arms[i].e.cls] ?? 0) > (RANK[arms[b].e.cls] ?? 0) ? i : b, g[0])].e;
      made.push(connector(Y, n, like, barrierOf(site, { street: g.map(i => `${titleName(arms[i].name)} ${compass(arms[i].pts)}`).join(' + '), action: g.length === 1 ? 'closure' : 'node split' }))); }
    site.action = G.filter(g => g.length > 1).length > 1 ? 'nodeSplit' : 'closure'; // two or more pairs: a diagonal or similar split
    site.groups = G.map(g => g.map(i => `${titleName(arms[i].name)} ${compass(arms[i].pts)}`).join(' + '));
  }
  for (const { i, toward } of oneWay) { // toward: cars may only drive toward the junction (out of this street)
    const e = arms[i].e, atA = e.a === arms[i].jn, far = atA ? e.b : e.a;
    if (!toward && deadEnd(far)) continue; // cars on a dead-end block could never leave
    const s = Math.min(15, e.len / 2), [e1, e2] = splitEdge(e, atA ? s : e.len - s), piece = atA ? e1 : e2;
    oneWayPiece(piece, atA === toward ? 'TF' : 'FT');
    piece.barrier = barrierOf(site, { street: titleName(arms[i].name), action: toward ? 'one-way out of this street' : 'one-way into this street', closed: false });
    made.push(piece); (site.oneWay ||= []).push(`${titleName(arms[i].name)} ${compass(arms[i].pts)}: ${toward ? 'out only' : 'in only'}`); }
  if (!site.action) site.action = made.length ? 'oneWay' : 'openInOsm';
  site.edges = made.map(e => e.id);
}
// Apply a site, then undo its closures and one-way pieces if they cut streets off from the rest of the network
// or leave cars with no way to drive out of the model area.
const trapped = () => { const rev = nodes.map(() => []), seen = new Uint8Array(nodes.length), st = [...exitSet];
  for (const e of edges) if (vEdge(e) && !isClosed(e)) { if (e.trav !== 'TF') rev[e.b].push(e.a); if (e.trav !== 'FT') rev[e.a].push(e.b); }
  for (const x of st) seen[x] = 1;
  while (st.length) { const u = st.pop(); for (const w of rev[u]) if (!seen[w]) { seen[w] = 1; st.push(w); } }
  return edges.filter(e => vEdge(e) && !isClosed(e) && (!seen[e.a] || !seen[e.b])).length; };
function applyChecked(site, ...args) {
  const cut0 = unreached().count, trap0 = trapped();
  applySite(site, ...args);
  if (!['closure', 'nodeSplit', 'oneWay'].includes(site.action)) return;
  const cut = unreached().count > cut0, trap = !cut && trapped() > trap0; if (!cut && !trap) return;
  const why = cut ? 'closing it would cut streets off from the rest of the network' : 'it would leave cars on one-way streets with no way out';
  for (const id of site.edges || []) { const e = edges[id];
    if (e.barrier?.closed) e.barrier.closed = false;
    if (wasDir.has(e)) Object.assign(e, wasDir.get(e));
    if (e.barrier) e.barrier.keptOpen = why; }
  site.action = 'keptOpenCut'; site.note = why;
}
const titleName = s => String(s).toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase());
function nearestVehicleEdge(p, maxD, name) { let best = null;
  for (const e of edges) { if (!vEdge(e) || isClosed(e) || (name && !sameName(e.name, name))) continue; const d = distToPoly(p, e.geom); if (d <= maxD && (!best || d < best.d)) best = { e, d }; }
  return best; }

// engines: the device is a gate, or OSM tags the cycleway or a bollard across it emergency=yes
// (data/raw/osm/diverter-surroundings.json: non-car ways and barrier nodes within 60 m of each City device)
const around = has('data/raw/osm/diverter-surroundings.json') ? readJSON('data/raw/osm/diverter-surroundings.json').elements : [];
const gapWays = around.filter(x => x.type === 'way' && /^(cycleway|path|footway|pedestrian)$/.test(x.tags?.highway) && x.geometry).map(w => ({ t: w.tags, pts: w.geometry.map(g => local([g.lon, g.lat])) }));
const aroundBarriers = around.filter(x => x.type === 'node' && x.tags?.barrier && x.tags.barrier !== 'kerb').map(nd => ({ t: nd.tags, pt: local([nd.lon, nd.lat]) }));
const enginesAt = c => gapWays.some(w => w.t.emergency === 'yes' && distToPoly(c, w.pts) <= 30) || aroundBarriers.some(b => dist(b.pt, c) <= 30 && (b.t.emergency === 'yes' || /gate/.test(b.t.barrier)));

rebuildInc();
const city = cityLayer('traffic_calming');
const nearestJunction = (c, maxD) => { let n = null, bd = maxD; for (let i = 0; i < nodes.length; i++) { if (inc[i].length < 3) continue; const d = dist(nodes[i].pt, c); if (d < bd) { bd = d; n = i; } } return n; };
const cityCenters = [];
for (const f of city.filter(f => f.geometry?.type === 'Point' && /Diverter|Gate/.test(f.properties.Full_Type))) {
  const c = local(f.geometry.coordinates), gate = /Gate/.test(f.properties.Full_Type);
  const site = { src: 'city', cityId: f.properties.OBJECTID, kind: gate ? 'gate' : 'diverter', gate, pt: c.map(r1), engines: gate || enginesAt(c) };
  if (/KLD/.test(f.properties.Notes || '')) site.cityNote = f.properties.Notes.trim();
  sites.push(site);
  // where: the nearest junction (3 or more streets) within 25 m, else mid-block on the nearest street within 25 m
  // where: the City points sit at the junction or up to about 50 m along one of its streets. Try the nearest
  // junction within 25 m, then mid-block on the nearest street within 25 m, then the nearest junction within 50 m;
  // use the first place where OSM restricts traffic, else report the first place tried.
  rebuildInc();
  const tries = [], n1 = nearestJunction(c, 25), m = nearestVehicleEdge(c, 25), n2 = nearestJunction(c, 50);
  if (n1 != null) tries.push({ n: n1 });
  if (m) tries.push({ e: m.e, along: Math.max(1, Math.min(m.e.len - 1, project(m.e.geom, c).along)) });
  if (n2 != null && n2 !== n1) tries.push({ n: n2 });
  if (!tries.length) { site.action = 'notOnNetwork'; site.note = 'no street within 25 m'; continue; }
  const pick = tries.find(t => applySite({ ...site }, c, t.n ?? null, t.e, t.along, true) === 'restricted') || tries[0];
  const names = pick.n != null ? inc[pick.n].map(e => e.name) : [pick.e.name];
  site.street = [...new Set(names.map(titleName))].join(' / '); site.at = pick.n != null ? 'junction' : 'mid-block';
  cityCenters.push({ c: pick.n != null ? [...nodes[pick.n].pt] : c, names: new Set(names) });
  applyChecked(site, c, pick.n ?? null, pick.e, pick.along);
}
// OSM barrier nodes that close a public street (data/raw/osm/barriers-on-roads.json, and east-bay-roads.json for the
// whole model area). Kerbs and service roads are left out; a barrier closes only a street of the same name (a
// bollard on Southwest Place once closed Derby St). Barriers within 45 m of a City device on the same street were
// read with that device.
const barrierSeen = new Set();
for (const f of ['data/raw/osm/barriers-on-roads.json', 'data/raw/osm/east-bay-roads.json']) if (has(f)) {
  const osm = readJSON(f).elements;
  const ways = osm.filter(x => x.type === 'way' && x.tags?.highway !== 'service'), bn = new Map(osm.filter(x => x.type === 'node' && x.tags?.barrier).map(nd => [nd.id, nd]));
  for (const w of ways) for (const id of w.nodes || []) {
    const nd = bn.get(id); if (!nd || barrierSeen.has(id) || !closesCars(nd.tags)) continue; barrierSeen.add(id);
    const t = nd.tags, gate = /gate/.test(t.barrier), c = local([nd.lon, nd.lat]), street = osmName(w.tags || {});
    if (cityCenters.some(q => dist(q.c, c) <= 45 && [...q.names].some(nm => sameName(nm, street)))) continue;
    const site = { src: 'osm', osm: id, kind: t.barrier, gate, pt: c.map(r1), street: titleName(street), engines: t.emergency === 'yes' || gate,
      tags: Object.fromEntries(Object.entries(t).filter(([k]) => /access|vehicle|motorcar|emergency|bicycle|foot/.test(k))) };
    sites.push(site);
    rebuildInc(); const m = nearestVehicleEdge(c, 15, street);
    if (!m) { site.action = 'notOnNetwork'; site.note = `no ${titleName(street)} in the network within 15 m`; continue; }
    const along = project(m.e.geom, c).along, end = along < 3 ? m.e.a : along > m.e.len - 3 ? m.e.b : null;
    if (end != null && inc[end].length >= 3) applyChecked(site, c, end);
    else if (end != null && deadEnd(end)) { site.action = 'nextToDeadEnd'; site.note = 'at the end of the street'; }
    else applyChecked(site, c, null, m.e, Math.max(Math.min(1, m.e.len / 2), Math.min(m.e.len - 1, along)));
  }
}
rebuildInc();
const tally = list => list.reduce((o, s) => (o[s.action] = (o[s.action] || 0) + 1, o), {});
// Traffic circles: the City's 63 circles (nearest junction within 20 m) and OSM junction=roundabout rings in
// data/raw/osm/berkeley-barriers.json (every node inside a ring plus 12 m) get the Time Study's circle capacity (E16).
const circleNodes = new Set(); let cityCircles = 0;
for (const f of city.filter(f => f.geometry?.type === 'Point' && /Circle/.test(f.properties.Full_Type))) {
  const n = nearestJunction(local(f.geometry.coordinates), 20); if (n != null) { circleNodes.add(n); cityCircles++; } }
if (has('data/raw/osm/berkeley-barriers.json')) {
  const osm = readJSON('data/raw/osm/berkeley-barriers.json').elements;
  const pts = new Map(osm.filter(x => x.type === 'node').map(nd => [nd.id, nd]));
  for (const w of osm.filter(x => x.type === 'way' && /roundabout|circular/.test(x.tags?.junction || ''))) {
    const ring = (w.nodes || []).map(id => pts.get(id)).filter(Boolean).map(nd => local([nd.lon, nd.lat]));
    if (ring.length < 3) continue;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const r = Math.max(...ring.map(p => Math.hypot(p[0] - cx, p[1] - cy))) + 12;
    nodes.forEach((nd, i) => { if (Math.hypot(nd.pt[0] - cx, nd.pt[1] - cy) <= r) circleNodes.add(i); });
  }
}
const citySites = sites.filter(s => s.src === 'city'), osmSites = sites.filter(s => s.src === 'osm');
stats.barriers = { cityDevices: citySites.length, city: tally(citySites), osmBarrierSites: osmSites.length, osm: tally(osmSites),
  enginesPass: sites.filter(s => s.engines && ['closure', 'nodeSplit'].includes(s.action)).length, closedEdges: edges.filter(e => e.barrier?.closed).length };
stats.circleNodes = circleNodes.size; stats.cityCirclesMatched = cityCircles;
console.log('Barriers: City', JSON.stringify(stats.barriers.city), '| OSM', JSON.stringify(stats.barriers.osm), '| engines pass', stats.barriers.enginesPass, '| traffic-circle nodes', circleNodes.size, `(City circles matched ${cityCircles})`);

// ---------- 6. nodes out ----------
const nodesOut = nodes.map(nd => { const z = elev(...nd.pt); return [r1(nd.pt[0]), r1(nd.pt[1]), z == null ? null : r1(z)]; });

const network = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    crs: 'EPSG:32610 local: x = easting - xmin, y = northing - ymin (meters)', origin: [OX, OY],
    terrain: { width: dem.width, height: dem.height, resolution: dem.resolution, xmax: dem.xmax - OX, ymax: dem.ymax - OY },
    stats: { ...stats, osm: osmStats, nodes: nodes.length, components: ncomp, mainComponentNodes: compSize[main] },
    circleNodes: [...circleNodes],
    barrierSites: sites,
    exitNodes: exitIds,
    fields: {
      geom: { category: 'sourced', source: 'Berkeley: Alameda County Street Centerlines export (data.acgov.org), downloaded 2026-10-20; segment data revised 2015-09-26. Outside Berkeley (src.osmWay): OpenStreetMap drivable ways (Overpass API, 2026-11-01; © OpenStreetMap contributors, ODbL), joined to the County network at the city line.', note: 'Projected to UTM 10N, simplified to 0.75 m. OSM ends are moved onto the nearest County node (up to 60 m) where the two networks meet.' },
      name: { category: 'sourced', source: 'County STREET field; outside Berkeley the OSM name, upper-cased with the County\'s suffix abbreviations (I-80 and CA-24 carriageways named by direction as in the County file)' },
      cls: { category: 'sourced', source: 'County CLASS field. Outside Berkeley mapped from OSM highway (model rule): motorway = Interstate; motorway_link, trunk_link = Ramp; trunk, primary, secondary = Principal Arterial; tertiary = Major Collector; residential, unclassified, living_street = Local' },
      osm: { category: 'sourced', source: 'OpenStreetMap contributors, ODbL (openstreetmap.org/copyright). Streets outside Berkeley, barriers and traffic circles.' },
      exitNodes: { category: 'model rule', source: 'Nodes where an OSM street was cut 15 m inside the DEM extent (UTM 10N x 558896-569512, y 4188272-4196124). Traffic that reaches one has left the modeled area.' },
      fireZoneSrc: { category: 'model rule', source: 'Outside Berkeley the City fire zones do not apply; OSM streets whose midpoint is at 90 m elevation or higher (DEM) get fireZone 2, so the hill rules for lanes, speed and parking apply (proxy:elevation>=90m). Same threshold fire.js uses for hill residential land outside the city.' },
      trav: { category: 'sourced', source: 'County TRVLWAY: B both ways, FT one-way in the digitized direction, TF against it, NT no vehicle travel. FT/TF meaning checked against the right-hand rule on 100 divided-street pairs (97 agree).' },
      mode: { category: 'derived', source: 'path = SFEATYP PA/WK or names with STEPS/PATH/WALK; restricted = TRVLWAY NT; else vehicle' },
      z: { category: 'derived', source: 'Elevation at segment ends, bilinear from data/terrain/dem.i16 (USGS 3DEP 1 m lidar DEM, 4 m overview)' },
      grade: { category: 'derived', source: 'Net grade % along digitized direction from DEM endpoint elevations' },
      gradeMax: { category: 'derived', source: '90th percentile of ~25 m window grades along the centerline, DEM sampled every 4 m. Can be wrong where the road sits on a cut, fill, bridge or retaining wall.' },
      gradeReliable: { category: 'derived', source: 'false for Interstate and Ramp (the bare-earth DEM is the ground under the structure) and where the steep grade exceeds 35% (a DEM artefact: cut, fill or retaining wall)' },
      fireZone: { category: 'sourced', source: 'City of Berkeley FireZones_WFL1 PLN_HILL_Z at segment midpoint' },
      evacZone: { category: 'sourced', source: 'Genasys zone at segment midpoint, shown as e.g. BER-006 (the City layer\'s zonenum field is not unique across cities). Berkeley and LBNL zones from the City of Berkeley GenasysZonesBerkeley layer; other zones from the Genasys Protect WFS (2026-11-01).' },
      lanes: { category: 'mixed', source: '[forward, backward] lanes. lanesSrc says where: city:PAV_LANES = City pavement-management lanes (total); osm:lanes = OSM lanes tag (total for two-way streets, per direction for one-way); assumption:hillsLocal = Eric, 2026-10-31: hill streets are one lane each way (applied in Oakland and Kensington hills too); assumption:byClass = data/assumptions.json (one-way OSM streets: 1 lane for Local and ramps, half the class total otherwise)' },
      widthM: { category: 'mixed', source: 'widthSrc says where. city: City of Berkeley Street_Centerline PAV_WIDTH_RD (pavement-management width, feet) or Narrow_Roads PAV_WIDTH_, matched to County segments by name and distance (<= 12 m). osm:width = OSM width tag. assumption:berkeleyMedian(...) = median City width of Berkeley streets of the same class in the hills or flats (one-way streets: 60% of it, at least 3.5 m per lane), used for Oakland, Albany, Emeryville and Kensington streets with no width tag.' },
      parking: { category: 'assumption', source: 'data/assumptions.json parking.hills / parking.flats. Hills default per Eric, 2026-10-31: parking on both sides. Not yet checked against posted no-parking signs.' },
      clearWidthM: { category: 'mixed', source: 'City Narrow_Roads Width_w_Parking where present; else widthM minus parked-car width per parked side (assumption)' },
      effLanes: { category: 'model rule', source: 'Moving lanes that fit in clearWidthM: 2 if >= 2 x access.movingLaneM, 1 if >= one lane, else 0. With one effective lane, opposing vehicles must wait for each other.' },
      belowFireCodeWidth: { category: 'derived', source: 'clearWidthM below access.fireCodeClearM (20 ft unobstructed width, California Fire Code 503.2.1 for new fire apparatus access roads; context only, existing streets are not required to meet it)' },
      engineBlocked: { category: 'model rule', source: 'clearWidthM below access.engineClearM: a fire engine cannot get through without parked cars being moved' },
      barrier: { category: 'sourced', source: 'Diverters and gates from the City of Berkeley list of record, layer \"Existing Traffic Calming Devices\" (Berkeley_Fire_Apparatus_Route_Map_WFL1, layer 1, edited 2025-10-28; cityId = its OBJECTID); bollards, gates and blocks elsewhere from OpenStreetMap barrier nodes on a street of the same name (osm = node id). How each device channels cars is read from the OpenStreetMap street geometry around it (Overpass API, 2026-11-01; © OpenStreetMap contributors, ODbL): action says what the network does. closure and node split: a short connector edge (or, beyond a gate on a dead-end street, the rest of that street) closed to residents\' cars; engines pass after access.barrierDelayS where OSM tags the crossing emergency=yes or it is a gate. one-way: a 15 m one-way piece, open to all. Banned turns inside an open junction are not modeled. meta.barrierSites lists every device and what was done with it.' },
      speedMps: { category: 'assumption', source: 'data/assumptions.json capacity.speedMph by road class, capped by City SPEED where known, or by the OSM maxspeed tag outside Berkeley (outside the hills)' },
      capPerLaneVph: { category: 'sourced', source: 'AB 747 report capacity rules (HCM 2022): two-lane roads 45 pc/h per mph up to 1,700; multilane 1,900 per lane; freeway 2,250 per lane (capRule says which). Speed input is an assumption; steep segments reduced by a model rule.' },
    },
  },
  nodes: nodesOut,
  edges,
};
fs.mkdirSync(P('data/model'), { recursive: true });
fs.writeFileSync(P('data/model/network.json'), JSON.stringify(network));

// ---------- 7. context layers ----------
// One entry per zone: parts and duplicate features merged, population counted once.
// pop: the City layer's Genasys estimate, or for zones only in the Genasys WFS (no population there) the
// 2020 Census population of blocks whose interior point lies in the zone (data/raw/census/blocks-2020.json,
// which covers the model area plus a small margin). popModeled: the part inside the DEM extent, which is
// what the simulator places on streets (Genasys estimates scaled by the zone's area share inside the extent).
const blocks = has('data/raw/census/blocks-2020.json') ? readJSON('data/raw/census/blocks-2020.json').features
  .map(f => ({ pt: local([+f.attributes.INTPTLON, +f.attributes.INTPTLAT]), pop: +f.attributes.POP100 || 0 })) : [];
const EXT = [0, 0, dem.xmax - OX, dem.ymax - OY];
const inExt = ([x, y]) => x >= EXT[0] && y >= EXT[1] && x <= EXT[2] && y <= EXT[3];
function zonesOut(features, tol = 3) {
  const by = new Map();
  for (const f of features) {
    const p = f.properties, k = p.zone_id;
    const est = p.est_popula == null ? null : +p.est_popula || 0;
    if (!by.has(k)) by.set(k, { id: zoneLabel(k), zoneId: k, pop: est, popSrc: est == null ? 'census2020' : 'genasys', knownAs: (p.known_as || '').trim(), rings: [], seen: new Set(), polys: [] });
    const z = by.get(k);
    if (est != null && est !== z.pop) console.warn(`zone ${k}: features disagree on population (${z.pop} vs ${p.est_popula}); keeping the first`);
    for (const rings of polygonsOf(f.geometry)) {
      const rr = rings.map(r => simplify(r, tol).map(([x, y]) => [Math.round(x), Math.round(y)]));
      const sig = JSON.stringify(rr[0]); if (z.seen.has(sig)) continue; z.seen.add(sig);
      z.rings.push(...rr); z.polys.push({ rings, bb: bboxOf(rings) });
    }
  }
  const inZone = (z, p) => z.polys.some(q => p[0] >= q.bb[0] && p[0] <= q.bb[2] && p[1] >= q.bb[1] && p[1] <= q.bb[3] && inPoly(p, q.rings));
  const out = [];
  for (const z of by.values()) {
    // area share inside the extent, sampled on a 25 m lattice
    let all = 0, ins = 0;
    for (const q of z.polys) for (let x = q.bb[0] + 12.5; x < q.bb[2]; x += 25) for (let y = q.bb[1] + 12.5; y < q.bb[3]; y += 25)
      if (inPoly([x, y], q.rings)) { all++; if (inExt([x, y])) ins++; }
    const share = all ? ins / all : 0;
    let cAll = 0, cIn = 0;
    for (const b of blocks) if (inZone(z, b.pt)) { cAll += b.pop; if (inExt(b.pt)) cIn += b.pop; }
    // labeled per-zone override (data/assumptions.json population.overrides): use the Census count instead of Genasys
    if (A.population?.overrides?.[z.id] === 'census2020' && z.popSrc !== 'census2020') { z.genasysPop = z.pop; z.popSrc = 'census2020'; z.popOverride = A._meta['population.overrides'].note; }
    if (z.popSrc === 'census2020') { z.pop = cAll; z.popModeled = cIn; }
    else z.popModeled = Math.round(z.pop * share);
    z.census2020 = cAll; z.areaShareModeled = Math.round(share * 1000) / 1000;
    if (!berkZone(z.zoneId) && !share) continue; // entirely outside the model area (e.g. Orinda zones)
    const { seen, polys, ...rest } = z; out.push(rest);
  }
  return out;
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
      { key: 'osm', title: 'OpenStreetMap drivable streets, barriers and traffic circles', publisher: '© OpenStreetMap contributors, ODbL (Overpass API)', retrieved: '2026-11-01', category: 'sourced', why: 'Streets outside Berkeley (Oakland, Emeryville, Albany, Kensington, El Cerrito, Richmond), joined to the County network at the city line; name, class, one-way, lanes and maxspeed tags. Widths outside Berkeley are assumptions (Berkeley medians). Barriers and traffic circles everywhere.', url: 'https://www.openstreetmap.org/copyright' },
      { key: 'genasys', title: 'Genasys Protect evacuation zones (WFS layer zonehavenv2:evacuation_zone)', publisher: 'Genasys Protect (protect.genasys.com)', retrieved: '2026-11-01', category: 'sourced', why: 'Zone outlines outside Berkeley (Oakland, Albany, Emeryville, Kensington and El Cerrito, Richmond, Contra Costa County). The City layer holds only slivers of these zones along the city line; its population estimates are kept where it has them.' },
      { key: 'census', title: '2020 Census blocks (POP100) and Kensington CDP', publisher: 'U.S. Census Bureau, TIGERweb', retrieved: '2026-11-01', category: 'sourced', why: 'Population of Genasys zones that have no estimate in the City layer (counted from block interior points), the share of each zone inside the model area, and a check on the Genasys estimates.', url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/12' },
      { key: 'dem', title: dem.provenance.sources.join('; '), publisher: 'USGS 3D Elevation Program', retrieved: dem.provenance.retrieved, category: 'derived', why: dem.provenance.method + ' ' + dem.provenance.limits },
      ...(fs.existsSync(P('data/raw/city')) ? fs.readdirSync(P('data/raw/city')).filter(f => f.endsWith('.meta.json')).map(f => {
        const m = readJSON(`data/raw/city/${f}`);
        return { key: m.key, title: m.layers.map(l => l.name).join(', '), publisher: 'City of Berkeley (ArcGIS Online)', retrieved: m.retrieved, lastEdit: m.layers.map(l => l.lastEdit).filter(Boolean).join(', '), category: 'sourced', why: m.why, url: m.service };
      }) : []),
    ] },
  cityBoundary: polysOut(cityLayer('city_boundary'), () => ({}), 2),
  neighborhoods: polysOut(cityLayer('neighborhoods'), p => ({ name: p.Name })),
  evacZones: zonesOut(allZoneFeatures),
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
fs.writeFileSync(P('data/model/layers.json'), JSON.stringify(layers));
{ const Z = layers.evacZones, sum = (f, k) => Z.filter(f).reduce((s, z) => s + (z[k] || 0), 0), city = c => z => z.id.startsWith(c);
  for (const c of ['BER', 'LBL', 'OKL', 'ALB', 'EMV', 'ECK', 'CCC', 'RCH', 'ORI']) console.log(`zones ${c}: ${Z.filter(city(c)).length}, pop ${sum(city(c), 'pop')}, modeled ${sum(city(c), 'popModeled')}, census2020 ${sum(city(c), 'census2020')}`);
  for (const z of Z.filter(z => !/^(BER|LBL)/.test(z.id) && z.popSrc === 'genasys')) console.log(`  ${z.id} Genasys ${z.pop} vs Census 2020 ${z.census2020} (area share in model area ${z.areaShareModeled})`); }
const kb = f => (fs.statSync(P(f)).size / 1024).toFixed(0) + ' KB';
console.log(`nodes ${nodes.length}, edges ${edges.length} (${stats.edges} vehicle), components ${ncomp}, main ${compSize[main]} nodes`);
console.log(`City width matched ${stats.width}/${stats.edges}, City lanes ${stats.cityLanes}, narrow ${stats.narrow}`);
console.log(`network.json ${kb('data/model/network.json')}, layers.json ${kb('data/model/layers.json')}`);
