#!/usr/bin/env node
// Step 2 of the egress plan: candidate new road connections that would give access-constrained
// areas a second way out, screened on length, grade, buildings, parcels and land, with their effect
// on the choke points (no fire) and a screening cost range. The simulator runs are in
// tools/egress-sim.mjs; tools/egress-all.mjs runs everything.
//
//   node tools/egress-candidates.mjs            writes data/model/egress-candidates.json
//   node tools/egress-candidates.mjs --refresh  re-fetches the cached Overpass and Census lookups
//
// Method (model rules unless marked; docs/egress-candidates.md has the full list):
// - Areas: dead-end areas from tools/access-constraints.mjs with hill residents, the top 40 by
//   residents plus the top 40 by constraint score. One-way areas are left out (two-way operation of
//   the entrance opens them); allocationWarning areas are kept and flagged.
// - New road (type "new"): a straight segment from a node inside the area to a drivable node outside
//   it, up to 250 m, where driving between the two now takes at least 300 m and 3 times the line
//   (the access tool's nearestOtherStreet rule). Best per target street, three streets per area.
// - Path upgrade (type "path"): an existing path, stairway or County no-vehicle segment in the
//   network, or an OpenStreetMap footway, path, steps or track chain (up to 400 m), from the area to
//   a street outside it, widened to a road. Open barrier (type "barrier"): a diverter, bollard or gate
//   closed to residents' cars.
// - City concept (type "city"): the City's "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1),
//   the Dwight Way–Dwight Place link the Evacuation Time Study tested (§10.4), snapped to the nearest
//   network nodes.
// - Nodes only: a link joins existing network nodes, so a street that passes close by but has no
//   node near the area is reached at its nearest junction or end.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { toUTM, fromUTM } = await import(R + '/tools/utm.mjs');
const { demSampler, profile, polyLen, LINK_ASSUMPTIONS, LINK_PROVENANCE } = await import(R + '/tools/egress-link.mjs');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const net = readJSON('data/model/network.json'), layers = readJSON('data/model/layers.json'), A = readJSON('data/assumptions.json');
const dem = readJSON('data/terrain/dem.json');
const demBuf = fs.readFileSync(path.join(R, 'data/terrain/dem.i16'));
const elev = demSampler(dem, new Int16Array(demBuf.buffer, demBuf.byteOffset, demBuf.length / 2));
const argv = process.argv.slice(2), REFRESH = argv.includes('--refresh');
const UA = 'berkeley-wildfire-simulator/0.1';
const CACHE = path.join(R, 'data/raw/egress'); fs.mkdirSync(CACHE, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-'));
const TODAY = new Date().toISOString().slice(0, 10);
const O = net.meta.origin;
const toLL = ([x, y]) => fromUTM(x + O[0], y + O[1]).map(v => Math.round(v * 1e6) / 1e6);
const toLocal = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
const r0 = v => v == null ? null : Math.round(v), r1 = v => v == null ? null : Math.round(v * 10) / 10, r2 = v => v == null ? null : Math.round(v * 100) / 100;
const title = s => (s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, d, s) => d + s.toLowerCase());

// ---------- screening thresholds (model rules) and cost inputs (sourced figures, assumed ranges) ----------
export const RULES = {
  maxNewM: 250, maxPathM: 400, minDetourM: 300, detourRatio: 3, perArea: 3, snapM: 25,
  gradeFlagPct: [15, 20], pruneAvgGradePct: 30, pruneBuildings: 3, pathNearM: 6, crossM: 2,
};
const SOURCES = {
  grade15: { what: 'Sonoma County fire-access bulletin: 15% maximum grade by default, steeper sections up to 20% only with Fire Chief approval (an example of a local standard)', url: 'https://permitsonoma.org/divisions/firepreventionandhazmat/bulletinmaximumgrades', retrieved: '2026-11-01' },
  grade20: { what: 'State Minimum Fire Safe Regulations, 14 CCR §1273.03: road and driveway grades shall not exceed 16% at any point; up to 20% only with local approval and mitigation', url: 'https://regulations.justia.com/states/california/title-14/division-1-5/chapter-7/subchapter-2/article-2/section-1273-03', retrieved: '2026-11-01' },
  fdot: { what: 'Florida DOT Cost Per Mile Models, U01 "New Construction 2 Lane Undivided Urban Arterial with 4\' Bike Lanes": $9,116,872.25 per mile (flat terrain, no right of way)', url: 'http://web.archive.org/web/20251006210442/https://www.fdot.gov/fpo/fpc/reports/costpermile', retrieved: '2026-11-01 (Wayback copy of 2025-10-06; the live page returned 404)' },
  cambria: { what: 'Civil Design Studio for the Cambria CSD, "Cambria Emergency Evacuation Route: Preliminary Cost Estimate", 2024-02-12: about $2.55M with 10% contingency for 12,000 ft of 16 ft gravel emergency road on an existing graded alignment', url: 'https://cambriacsd.specialdistrict.org/files/a810aeceb/6C+-+Att+01.pdf', retrieved: '2026-11-01' },
  acs: { what: 'American Community Survey 2020–2024 5-year, table B25077 median value of owner-occupied homes, by block group (via the Census Reporter API; the Census Bureau API now requires a key); block group from TIGERweb', url: 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077', retrieved: TODAY },
  parcels: { what: 'Alameda County Parcel Boundaries (Parcels FeatureServer layer 0), geometry only; counted per candidate and never saved', url: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0', retrieved: TODAY },
  osm: { what: 'OpenStreetMap buildings, footways, paths, steps, tracks, parks and institutional land (Overpass API; © OpenStreetMap contributors, ODbL)', url: 'https://www.openstreetmap.org/copyright', retrieved: null },
  city: { what: 'City of Berkeley "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1, layer 0, "Imagined Road: Connects Dwight Way in Berkeley and Dwight Place in Oakland", "For Evacuation Time Study", edited 2025-06-27)', url: 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Imagined_Road_Panoramic_Hill_Berkeley_WFL1/FeatureServer/0', retrieved: null },
};
const FDOT_PER_M = 9116872.25 / 1609.344, CAMBRIA_PER_M = 2.55e6 / (12000 * 0.3048);
export const COST = {
  newRoadPerM: [r0(FDOT_PER_M), r0(3 * FDOT_PER_M)],
  gravelUpgradePerM: r0(CAMBRIA_PER_M),
  hillsideFactor: 3,
  partialTakeShare: [0.1, 0.25],
  note: 'Low: the FDOT flat-terrain urban two-lane figure; high: 3 times it for hillside retaining walls, grading and drainage (assumption). Fire roads and tracks start from the Cambria gravel-road figure. Steep links are priced at the length a 15% road would need. Acquisition: each building in the corridor taken whole at the block group median home value (± the ACS margin of error); each other parcel crossed is a partial take at 10–25% of that value (assumption). Relocation, engineering, environmental review and legal costs are left out.',
};

// ---------- 1. the access analysis as the network stands ----------
const exec = promisify(execFile);
async function access(args) {
  const out = path.join(TMP, `ac-${Math.random().toString(36).slice(2)}.json`);
  await exec(process.execPath, [path.join(R, 'tools/access-constraints.mjs'), ...args, '--json', out], { maxBuffer: 1 << 26 });
  const j = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); return j;
}
// Network variants: segment ids opened on top of the network as it stands. The "panoramicExit" variant of the
// first run (County edge 2322 opened) is gone: the network builder now opens it (SOURCE_NOTES AC13).
export const VARIANTS = { asIs: [] };
const openArgs = ids => ids.length ? ['--open', ids.join(',')] : [];
console.log('access analysis…');
const [base, quick] = await Promise.all([access([]), Promise.all(Object.values(VARIANTS).map(ids => access(['--quick', ...openArgs(ids)])))]);
const baseQuick = Object.fromEntries(Object.keys(VARIANTS).map((k, i) => [k, quick[i]]));

// ---------- 2. areas ----------
const pool = base.areas.filter(a => a.hillResidents >= 1);
const topBy = (f, n) => pool.slice().sort((a, b) => f(b) - f(a)).slice(0, n);
const chosen = [...new Map([...topBy(a => a.residents, 40), ...topBy(a => a.constraint.score, 40)].map(a => [a.id, a])).values()];
const excludedOneWay = chosen.filter(a => a.type === 'one-way');
const areas = chosen.filter(a => a.type === 'dead end');
const areaById = new Map(base.areas.map(a => [a.id, a]));
const PANORAMIC = new Set(base.areas.filter(a => a.memberEdges.some(id => /^PANORAMIC W/.test(net.edges[id].name))).map(a => a.id));
console.log(`areas: ${chosen.length} chosen, ${excludedOneWay.length} one-way left out, ${areas.length} dead ends`);

// ---------- network helpers ----------
const { nodes, edges } = net, nN = nodes.length;
const FREEWAY = new Set(['Ramp', 'Interstate']);
const drivable = e => e.mode === 'vehicle' && !e.disconnected && !e.barrier?.closed;
const nodeEdges = Array.from({ length: nN }, () => []);
for (const e of edges) { nodeEdges[e.a].push(e.id); if (e.b !== e.a) nodeEdges[e.b].push(e.id); }
const drvEdges = n => nodeEdges[n].filter(id => drivable(edges[id]));
class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { const L = 2 * i + 1, Rr = L + 1; let m = i; if (L < a.length && a[L][0] < a[m][0]) m = L; if (Rr < a.length && a[Rr][0] < a[m][0]) m = Rr; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; } get size() { return this.a.length; } }
function dijkstra(src, allow, limit = 8000) {
  const dist = new Map([[src, 0]]), h = new Heap(); h.push(0, src);
  while (h.size) {
    const [d, n] = h.pop(); if (d > dist.get(n) || d > limit) continue;
    for (const id of nodeEdges[n]) { const e = edges[id]; if (!drivable(e) || !allow(id)) continue;
      const w = e.a === n ? e.b : e.a, nd = d + e.len; if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); h.push(nd, w); } }
  }
  return dist;
}
const deepest = new Map(); // edge → deepest area (as the network stands)
for (const a of base.areas) for (const id of a.memberEdges) { const c = deepest.get(id); if (!c || areaById.get(c).nesting < a.nesting) deepest.set(id, a.id); }
const nodeArea = n => { let best = null; for (const id of drvEdges(n)) { const a = deepest.get(id); if (a && (!best || areaById.get(a).nesting > areaById.get(best).nesting)) best = a; } return best; };
const streetOf = n => { const ids = drvEdges(n).filter(id => !FREEWAY.has(edges[id].cls)); return ids.length ? title(edges[ids.sort((p, q) => edges[q].len - edges[p].len)[0]].name) : null; };
const G = 50, nodeGrid = new Map();
for (let n = 0; n < nN; n++) {
  const ds = drvEdges(n); if (!ds.length || ds.every(id => FREEWAY.has(edges[id].cls))) continue;
  const k = `${Math.floor(nodes[n][0] / G)},${Math.floor(nodes[n][1] / G)}`; if (!nodeGrid.has(k)) nodeGrid.set(k, []); nodeGrid.get(k).push(n);
}
function nodesNear([x, y], r) {
  const out = [], gx = Math.floor(x / G), gy = Math.floor(y / G), k = Math.ceil(r / G);
  for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) for (const n of nodeGrid.get(`${gx + dx},${gy + dy}`) || []) { const d = Math.hypot(nodes[n][0] - x, nodes[n][1] - y); if (d <= r) out.push([n, d]); }
  return out;
}
function fireZoneAt([x, y]) {
  for (const z of layers.fireZones) for (const ring of z.rings) if (inRing(x, y, ring)) return { zone: z.zone, src: 'city:FireZones' };
  const zz = elev(x, y); return zz != null && zz >= 90 ? { zone: 2, src: 'proxy:elevation>=90m' } : { zone: null, src: null };
}
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const zoneOfNode = n => { for (const id of nodeEdges[n]) if (edges[id].evacZone) return edges[id].evacZone; return null; };

// ---------- 3. candidates ----------
const cands = [];
const areaCtx = new Map();
for (const a of areas) {
  const mem = new Set(a.memberEdges), outer = a.chokeOuterNode;
  const inside = new Set(); for (const id of mem) for (const n of [edges[id].a, edges[id].b]) if (n !== outer && drvEdges(n).every(i => mem.has(i))) inside.add(n);
  const dIn = dijkstra(outer, id => mem.has(id)), dOut = dijkstra(outer, id => !mem.has(id));
  areaCtx.set(a.id, { mem, inside, dIn, dOut, outer });
  // (a) new straight road
  const byStreet = new Map();
  for (const u of inside) {
    if (!dIn.has(u)) continue;
    for (const [w, d] of nodesNear(nodes[u], RULES.maxNewM)) {
      if (d < 5 || drvEdges(w).some(id => mem.has(id)) || !dOut.has(w)) continue;
      const now = dIn.get(u) + dOut.get(w); if (now < Math.max(RULES.minDetourM, RULES.detourRatio * d)) continue;
      const P = profile([nodes[u].slice(0, 2), nodes[w].slice(0, 2)], elev);
      const effort = d * (1 + Math.max(0, (P.avgGradePct ?? 0) - 10) / 10);
      const st = streetOf(w), cur = byStreet.get(st);
      const free = !nodeArea(w);
      if (!cur || (free && !cur.free) || (free === cur.free && effort < cur.effort)) byStreet.set(st, { u, w, d, now, effort, free });
    }
  }
  [...byStreet.entries()].sort((p, q) => (q[1].free - p[1].free) || p[1].effort - q[1].effort).slice(0, RULES.perArea)
    .forEach(([st, c], k) => cands.push({ id: `${a.id}-N${k + 1}`, area: a.id, type: 'new', a: c.u, b: c.w, geom: [nodes[c.u].slice(0, 2), nodes[c.w].slice(0, 2)], drivingNowM: c.now, toStreet: st }));
  // (b) existing network path, stairway, no-vehicle street or closed barrier (from the access analysis)
  for (const [key, L] of [['P', a.existingLink], ['B', a.emergencyVehicleLink]]) {
    if (!L || L.lengthM > RULES.maxPathM || cands.some(c => c.area === a.id && c.open && c.open.join() === L.edges.join())) continue;
    const chain = chainGeom(L.edges, inside);
    if (!chain) continue;
    const barrier = L.kinds.every(k => !['stairs', 'path', 'no-vehicle street', 'disconnected street', 'street'].includes(k));
    cands.push({ id: `${a.id}-${key}1`, area: a.id, type: barrier ? 'barrier' : 'path', a: chain.a, b: chain.b, geom: chain.geom, open: L.edges.slice(), drivingNowM: L.drivingNowM, toStreet: L.reaches, existing: { names: L.names, kinds: L.kinds, src: 'network' } });
  }
}
// Concatenate a chain of edges into one line from the inside end to the outside end.
function chainGeom(ids, inside) {
  const es = ids.map(i => edges[i]); if (!es.length) return null;
  let start = inside.has(es[0].a) ? es[0].a : inside.has(es[0].b) ? es[0].b : (es.length > 1 && (es[0].a === es[1].a || es[0].a === es[1].b) ? es[0].b : es[0].a);
  let n = start; const g = [];
  for (const e of es) { const fwd = e.a === n; const pts = fwd ? e.geom : e.geom.slice().reverse(); g.push(...(g.length ? pts.slice(1) : pts)); n = fwd ? e.b : e.a; }
  return { a: start, b: n, geom: g };
}

// ---------- 4. OpenStreetMap: buildings, paths, land (Overpass, cached) ----------
const bboxLL = (bb, pad) => { const [w, s] = toLL([bb[0] - pad, bb[1] - pad]), [e, n] = toLL([bb[2] + pad, bb[3] + pad]); return [s, w, n, e].map(v => v.toFixed(5)).join(','); };
const cityLine = (() => {
  const f = path.join(R, 'data/raw/city/imagined_road_panoramic.geojson');
  if (!fs.existsSync(f)) throw new Error('missing data/raw/city/imagined_road_panoramic.geojson: run node tools/fetch-city-layers.mjs imagined_road_panoramic');
  const meta = JSON.parse(fs.readFileSync(f.replace('.geojson', '.meta.json'), 'utf8')); SOURCES.city.retrieved = meta.retrieved;
  const ft = JSON.parse(fs.readFileSync(f, 'utf8')).features[0]; return { geom: ft.geometry.coordinates.map(([lon, lat]) => toLocal(lon, lat)), props: ft.properties };
})();
const boxes = [...areas.map(a => a.bbox), (() => { const xs = cityLine.geom.map(p => p[0]), ys = cityLine.geom.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })()];
const ovq = `[out:json][timeout:300];\n(\n${boxes.map(bb => { const B = bboxLL(bb, 450); return [
  `way["building"](${B});`, `relation["building"](${B});`,
  `way["highway"~"^(footway|path|steps|track|pedestrian|cycleway|bridleway)$"](${B});`,
  `way["leisure"~"^(park|nature_reserve)$"](${B});`, `relation["leisure"~"^(park|nature_reserve)$"](${B});`,
  `way["boundary"="protected_area"](${B});`, `relation["boundary"="protected_area"](${B});`,
  `way["amenity"~"^(university|research_institute)$"](${B});`, `relation["amenity"~"^(university|research_institute)$"](${B});`,
  `way["landuse"~"^(education|institutional)$"](${B});`].join('\n'); }).join('\n')}\n);\nout geom qt;\n`;
async function fetchRetry(url, opt = {}, tries = 6) {
  let wait = 4000;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...opt, headers: { 'User-Agent': UA, ...(opt.headers || {}) } }); if (r.ok) return r; console.log(`  ${r.status} from ${new URL(url).host}, retrying`); } catch (e) { console.log(`  ${e.message}, retrying`); }
    await new Promise(res => setTimeout(res, wait)); wait *= 2;
  }
  throw new Error(`failed ${url}`);
}
async function overpass() {
  const f = path.join(CACHE, 'overpass.json'), q = path.join(CACHE, 'overpass.overpassql');
  if (!REFRESH && fs.existsSync(f) && fs.existsSync(q) && fs.readFileSync(q, 'utf8') === ovq) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const h of hosts) {
    try {
      console.log(`Overpass: ${h}`);
      const r = await fetchRetry(h, { method: 'POST', body: new URLSearchParams({ data: ovq }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 4);
      const j = await r.json();
      fs.writeFileSync(f, JSON.stringify(j)); fs.writeFileSync(q, ovq);
      fs.writeFileSync(path.join(CACHE, 'overpass.retrieved'), `${h} ${new Date().toISOString()} (OSM data as of ${j.osm3s?.timestamp_osm_base})\n`);
      return j;
    } catch (e) { console.log(`  ${h}: ${e.message}`); }
  }
  throw new Error('Overpass unavailable');
}
const osm = await overpass();
SOURCES.osm.retrieved = fs.readFileSync(path.join(CACHE, 'overpass.retrieved'), 'utf8').trim();
const ringLocal = g => g.map(p => toLocal(p.lon, p.lat));
function joinRings(ways) { // outer member ways → closed rings (simple endpoint joiner)
  const rings = [], open = ways.map(w => w.slice());
  while (open.length) {
    let r = open.shift();
    for (let guard = 0; guard < 500 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]); guard++) {
      const end = r[r.length - 1], i = open.findIndex(w => (w[0][0] === end[0] && w[0][1] === end[1]) || (w[w.length - 1][0] === end[0] && w[w.length - 1][1] === end[1]));
      if (i < 0) break; const w = open.splice(i, 1)[0]; r = r.concat((w[0][0] === end[0] && w[0][1] === end[1] ? w : w.reverse()).slice(1));
    }
    if (r.length >= 4) rings.push(r);
  }
  return rings;
}
const polysOf = el => el.type === 'way' ? (el.geometry && el.geometry.length >= 4 ? [ringLocal(el.geometry)] : [])
  : joinRings((el.members || []).filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat]))).map(r => r.map(([lon, lat]) => toLocal(lon, lat)));
const buildings = [], paths = [], land = [];
const seen = new Set();
for (const el of osm.elements) {
  const key = el.type + el.id; if (seen.has(key)) continue; seen.add(key);
  const t = el.tags || {};
  if (t.building) { for (const ring of polysOf(el)) buildings.push(withBox({ ring })); continue; }
  if (el.type === 'way' && t.highway) { if (el.geometry?.length >= 2) paths.push({ id: el.id, hw: t.highway, nodes: el.nodes, pts: ringLocal(el.geometry), access: t.access || null }); continue; }
  const label = [t.name, t.operator, t.owner].filter(Boolean).join(' / ');
  const flags = {
    park: /^(park|nature_reserve)$/.test(t.leisure || '') || t.boundary === 'protected_area',
    uc: /University of California|UC Berkeley/i.test(label) || (t.amenity === 'university' && !/Lawrence/i.test(label)),
    lbnl: /Lawrence Berkeley/i.test(label),
    ebrpd: /East Bay Regional Park|Regional (Park|Preserve|Shoreline|Recreation)/i.test(label),
  };
  for (const ring of polysOf(el)) land.push(withBox({ ring, flags, name: t.name || null }));
}
function withBox(o) { const xs = o.ring.map(p => p[0]), ys = o.ring.map(p => p[1]); o.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; return o; }
const inBB = (bb, x, y, pad = 0) => x >= bb[0] - pad && x <= bb[2] + pad && y >= bb[1] - pad && y <= bb[3] + pad;
const bGrid = new Map(); buildings.forEach((b, i) => { for (let gx = Math.floor(b.bb[0] / G); gx <= Math.floor(b.bb[2] / G); gx++) for (let gy = Math.floor(b.bb[1] / G); gy <= Math.floor(b.bb[3] / G); gy++) { const k = `${gx},${gy}`; if (!bGrid.has(k)) bGrid.set(k, []); bGrid.get(k).push(i); } });
// path segments: OSM footways etc. and the network's non-drivable segments
const pSegs = [];
for (const p of paths) for (let i = 1; i < p.pts.length; i++) pSegs.push([p.pts[i - 1], p.pts[i], p.hw]);
for (const e of edges) if (e.mode === 'path' || e.mode === 'restricted') for (let i = 1; i < e.geom.length; i++) pSegs.push([e.geom[i - 1], e.geom[i], e.mode]);
const sGrid = new Map(); pSegs.forEach(([p, q], i) => { for (let gx = Math.floor(Math.min(p[0], q[0]) / G); gx <= Math.floor(Math.max(p[0], q[0]) / G); gx++) for (let gy = Math.floor(Math.min(p[1], q[1]) / G); gy <= Math.floor(Math.max(p[1], q[1]) / G); gy++) { const k = `${gx},${gy}`; if (!sGrid.has(k)) sGrid.set(k, []); sGrid.get(k).push(i); } });
const segDist = ([x, y], [a, b]) => { const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L2)) : 0; return Math.hypot(x - a[0] - u * vx, y - a[1] - u * vy); };

// (b2) OpenStreetMap path chains from the area to a street outside it
{
  const pg = new Map(), coord = new Map();
  for (const p of paths) {
    if (p.access === 'private' || p.access === 'no') continue;
    p.nodes.forEach((nid, i) => { coord.set(nid, p.pts[i]); if (!pg.has(nid)) pg.set(nid, []); if (i) { const d = Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); pg.get(nid).push([p.nodes[i - 1], d, p.hw]); pg.get(p.nodes[i - 1]).push([nid, d, p.hw]); } });
  }
  const oGrid = new Map(); for (const [nid, [x, y]] of coord) { const k = `${Math.floor(x / G)},${Math.floor(y / G)}`; if (!oGrid.has(k)) oGrid.set(k, []); oGrid.get(k).push(nid); }
  const osmNear = ([x, y], r) => { const out = []; const gx = Math.floor(x / G), gy = Math.floor(y / G); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const nid of oGrid.get(`${gx + dx},${gy + dy}`) || []) { const d = Math.hypot(coord.get(nid)[0] - x, coord.get(nid)[1] - y); if (d <= r) out.push([nid, d]); } return out; };
  for (const a of areas) {
    const { mem, inside, dIn, dOut } = areaCtx.get(a.id);
    const dist = new Map(), prev = new Map(), src = new Map(), h = new Heap();
    for (const u of inside) for (const [nid, d] of osmNear(nodes[u], RULES.snapM)) if (d < (dist.get(nid) ?? Infinity)) { dist.set(nid, d); src.set(nid, u); prev.set(nid, null); h.push(d, nid); }
    const ends = new Map();
    while (h.size) {
      const [d, nid] = h.pop(); if (d > dist.get(nid) || d > RULES.maxPathM) continue;
      for (const [w, dw] of nodesNear(coord.get(nid), RULES.snapM)) {
        if (inside.has(w) || drvEdges(w).some(id => mem.has(id)) || !dOut.has(w)) continue;
        const tot = d + dw, u = src.get(nid), now = (dIn.get(u) ?? Infinity) + dOut.get(w);
        if (tot > RULES.maxPathM || now < Math.max(RULES.minDetourM, RULES.detourRatio * tot)) continue;
        const st = streetOf(w), cur = ends.get(st); if (!cur || tot < cur.tot) ends.set(st, { tot, nid, w, u, now });
      }
      for (const [m, dm] of pg.get(nid) || []) { const nd = d + dm; if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, nid); src.set(m, src.get(nid)); h.push(nd, m); } }
    }
    [...ends.entries()].sort((p, q) => p[1].tot - q[1].tot).slice(0, 2).forEach(([st, c], k) => {
      const chain = []; for (let x = c.nid; x != null; x = prev.get(x)) chain.push(coord.get(x));
      const geom = [nodes[c.u].slice(0, 2), ...chain.reverse(), nodes[c.w].slice(0, 2)];
      if (cands.some(o => o.area === a.id && o.a === c.u && o.b === c.w)) return;
      cands.push({ id: `${a.id}-O${k + 1}`, area: a.id, type: 'path', a: c.u, b: c.w, geom, drivingNowM: c.now, toStreet: st, existing: { src: 'osm' } });
    });
  }
}
// (c) the City's concept, snapped to the nearest drivable nodes
{
  const g = cityLine.geom, [s0] = nodesNear(g[0], 80).sort((p, q) => p[1] - q[1]), [s1] = nodesNear(g[g.length - 1], 80).sort((p, q) => p[1] - q[1]);
  // the end inside a choke area is the "a" end
  const [u, w] = nodeArea(s1[0]) && !nodeArea(s0[0]) ? [s1, s0] : [s0, s1];
  const area = nodeArea(u[0]);
  const geom = u === s0 ? [nodes[u[0]].slice(0, 2), ...g, nodes[w[0]].slice(0, 2)] : [nodes[u[0]].slice(0, 2), ...g.slice().reverse(), nodes[w[0]].slice(0, 2)];
  cands.push({ id: 'CITY-1', area, type: 'city', a: u[0], b: w[0], geom, toStreet: streetOf(w[0]), snapM: [r1(u[1]), r1(w[1])], cityName: cityLine.props.Name, cityDescription: cityLine.props.Description.trim(), cityLengthM: r0(polyLen(g)) });
  if (area && !areas.some(a => a.id === area)) areas.push(areaById.get(area));
}
// The same link found from nested areas (an inner area shares nodes with the one around it): keep one.
{
  const key = c => c.open ? `open:${c.open.join(',')}` : [c.a, c.b].sort((x, y) => x - y).join('-');
  const first = new Map();
  for (let i = 0; i < cands.length; i++) {
    const k = key(cands[i]), f = first.get(k);
    if (f) { (f.alsoFor ??= []).push(cands[i].area); cands.splice(i--, 1); } else first.set(k, cands[i]);
  }
}
console.log(`candidates generated: ${cands.length}`);

// ---------- 5. screening: grade, buildings, paths, land, parcels, fire zone ----------
function samplesAlong(geom, step = 1) {
  const out = [];
  for (let i = 1; i < geom.length; i++) {
    const [ax, ay] = geom[i - 1], [bx, by] = geom[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step)), nx = L ? -(by - ay) / L : 0, ny = L ? (bx - ax) / L : 0;
    for (let j = i === 1 ? 0 : 1; j <= n; j++) out.push({ p: [ax + (bx - ax) * j / n, ay + (by - ay) * j / n], nx, ny });
  }
  return out;
}
const HW = LINK_ASSUMPTIONS.rightOfWayM / 2;
async function parcelsFor(geom) {
  const xs = geom.map(p => p[0]), ys = geom.map(p => p[1]);
  const [w, s] = toLL([Math.min(...xs) - HW - 5, Math.min(...ys) - HW - 5]), [e, n] = toLL([Math.max(...xs) + HW + 5, Math.max(...ys) + HW + 5]);
  const q = new URLSearchParams({ geometry: `${w},${s},${e},${n}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID', returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '2000' });
  const r = await fetchRetry(`${SOURCES.parcels.url}/query?${q}`);
  const fc = await r.json(); if (fc.error) throw new Error(JSON.stringify(fc.error));
  // geometry only, kept in memory for this candidate
  return fc.features.flatMap(f => (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [])
    .map(poly => withBox({ ring: poly[0].map(([lon, lat]) => toLocal(lon, lat)), holes: poly.slice(1).map(h => h.map(([lon, lat]) => toLocal(lon, lat))) })));
}
const inPoly = (P, x, y) => inBB(P.bb, x, y) && inRing(x, y, P.ring) && !(P.holes || []).some(h => inRing(x, y, h));
async function screen(c) {
  const P = profile(c.geom, elev), len = P.len;
  c.lengthM = r0(len);
  c.straightM = r0(Math.hypot(c.geom[c.geom.length - 1][0] - c.geom[0][0], c.geom[c.geom.length - 1][1] - c.geom[0][1]));
  c.profile = { startElevM: r1(P.za), endElevM: r1(P.zb), climbM: P.climbM, avgGradePct: P.avgGradePct, p90GradePct: P.p90GradePct, maxGradePct: P.maxGradePct,
    every4mM: P.prof.map(r1) };
  const worst = Math.max(P.avgGradePct ?? 0, P.p90GradePct ?? 0); // p90 of 25 m windows, as the builder's gradeMax: the single worst window over open ground is often a terrace, wall or cut
  c.gradeFlags = { over15: worst > RULES.gradeFlagPct[0], over20: worst > RULES.gradeFlagPct[1] };
  c.lengthAt15PctM = r0(Math.max(len, Math.abs(P.climbM ?? 0) / 0.15));
  const S = samplesAlong(c.geom, 1);
  // existing path or stairway along the line
  let onPath = 0, onTrack = 0;
  for (const { p } of S) { const near = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(sGrid.get(`${Math.floor(p[0] / G) + dx},${Math.floor(p[1] / G) + dy}`) || []));
    const hits = near.filter(i => segDist(p, pSegs[i]) <= RULES.pathNearM);
    if (hits.length) onPath++; if (hits.some(i => pSegs[i][2] === 'track')) onTrack++; }
  c.pathShare = r2(onPath / S.length); c.trackShare = r2(onTrack / S.length);
  c.pathKinds = [...new Set(S.flatMap(({ p }) => { const out = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of sGrid.get(`${Math.floor(p[0] / G) + dx},${Math.floor(p[1] / G) + dy}`) || []) if (segDist(p, pSegs[i]) <= RULES.pathNearM) out.push(pSegs[i][2]); return out; }))];
  // buildings in the corridor
  const hit = new Set();
  for (const { p, nx, ny } of S) for (const off of [-HW, -HW / 2, 0, HW / 2, HW]) {
    const x = p[0] + nx * off, y = p[1] + ny * off;
    for (const i of bGrid.get(`${Math.floor(x / G)},${Math.floor(y / G)}`) || []) if (!hit.has(i) && inPoly(buildings[i], x, y)) hit.add(i);
  }
  c.buildingsInCorridor = hit.size;
  c.buildingsOnCenterline = [...hit].filter(i => S.some(({ p }) => inPoly(buildings[i], p[0], p[1]))).length;
  // land
  const share = f => r2(S.filter(({ p }) => land.some(L => L.flags[f] && inPoly(L, p[0], p[1]))).length / S.length);
  c.land = { parkShare: share('park'), ucShare: share('uc'), lbnlShare: share('lbnl'), ebrpdShare: share('ebrpd'),
    names: [...new Set(land.filter(L => S.some(({ p }) => inPoly(L, p[0], p[1]))).map(L => L.name).filter(Boolean))] };
  // parcels (geometry only, counted and dropped)
  try {
    const parcels = await parcelsFor(c.geom);
    if (!parcels.length) c.parcels = null;
    else {
      const cnt = parcels.map(Pp => S.filter(({ p }) => inPoly(Pp, p[0], p[1])).length);
      const corridor = parcels.filter(Pp => S.some(({ p, nx, ny }) => [-HW, 0, HW].some(off => inPoly(Pp, p[0] + nx * off, p[1] + ny * off)))).length;
      const inAny = S.filter(({ p }) => parcels.some(Pp => inPoly(Pp, p[0], p[1]))).length;
      c.parcels = { crossed: cnt.filter(n => n >= RULES.crossM).length, inCorridor: corridor, outsideParcelsShare: r2(1 - inAny / S.length) };
    }
  } catch (e) { console.log(`  parcels ${c.id}: ${e.message}`); c.parcels = null; }
  c.followsRightOfWay = c.parcels ? c.parcels.outsideParcelsShare >= 0.9 : null;
  const mid = S[Math.floor(S.length / 2)].p;
  c.fireZone = fireZoneAt(mid);
  c.endpoints = [c.a, c.b].map(n => ({ node: n, xy: nodes[n].slice(0, 2).map(r1), lonLat: toLL(nodes[n]), street: streetOf(n), zone: zoneOfNode(n), behindChoke: nodeArea(n) }));
  c.geomLonLat = c.geom.map(toLL);
  c.geom = c.geom.map(p => p.map(r1));
  c.savingM = c.drivingNowM != null ? r0(c.drivingNowM - len) : null;
}
for (const c of cands) await screen(c);
console.log('screened');

// prune physically implausible candidates (model rules), keeping the City concept as a benchmark
const pruned = [], kept = [];
for (const c of cands) {
  const why = [];
  if ((c.profile.avgGradePct ?? 0) > RULES.pruneAvgGradePct) why.push(`average grade ${c.profile.avgGradePct}% (over ${RULES.pruneAvgGradePct}%: a road at 15% would need ${c.lengthAt15PctM} m, at least twice the line)`);
  if (c.buildingsInCorridor >= RULES.pruneBuildings) why.push(`${c.buildingsInCorridor} buildings in the ${LINK_ASSUMPTIONS.rightOfWayM} m corridor`);
  if (c.type !== 'city' && why.length) { pruned.push({ ...c, prunedBecause: why }); continue; }
  if (why.length) c.wouldBePrunedBecause = why;
  kept.push(c);
}
// Of several survivors in one area that reach the same street from the same node, keep one.
console.log(`kept ${kept.length}, pruned ${pruned.length}`);

// ---------- 6. access effect (no fire): rerun the choke-point analysis with each link ----------
async function pool_(items, n, f) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k], k); } })); return out; }
const linkSpec = c => c.open ? { open: c.open } : { links: [{ id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone.zone }] };
function effect(c, variant) {
  const before = baseQuick[variant];
  return async () => {
    const f = path.join(TMP, `links-${c.id}-${variant}.json`), spec = linkSpec(c);
    fs.writeFileSync(f, JSON.stringify({ links: spec.links || [], open: [...(spec.open || []), ...VARIANTS[variant]] }));
    const after = await access(['--quick', '--links', f]);
    const tgt = areaById.get(c.area);
    const sumE = (j, ids) => ids.reduce((s, id) => s + (j.edgeResidents[id] || 0), 0);
    const afterDeep = new Map(); for (const a of after.areas) for (const id of a.memberEdges) { const cur = afterDeep.get(id); if (!cur || cur.nesting < a.nesting) afterDeep.set(id, a); }
    const remain = new Map(); if (tgt) for (const id of tgt.memberEdges) { const a = afterDeep.get(id); if (a) remain.set(a.id, a); }
    const chainOf = a => { const c2 = []; for (let x = a; x; x = x.parent ? after.areas.find(y => y.id === x.parent) : null) c2.push(x); return c2; };
    const chokes = new Map(); for (const a of remain.values()) for (const x of chainOf(a)) chokes.set(x.id, x);
    // every chosen dead-end area whose residents behind a choke change with this link
    const areasAffected = areas.map(a => ({ id: a.id, before: sumE(before, a.memberEdges), after: sumE(after, a.memberEdges) }))
      .filter(x => Math.abs(x.before - x.after) >= 1).map(x => ({ id: x.id, residentsBehindBefore: r1(x.before), residentsBehindAfter: r1(x.after) }));
    return {
      variant, areasAffected,
      residentsFreed: r0(before.totals.residentsBehindAnyChoke - after.totals.residentsBehindAnyChoke),
      hillResidentsFreed: r0(before.totals.hillResidentsBehindAnyChoke - after.totals.hillResidentsBehindAnyChoke),
      hillBehindTwoOrMoreChange: r0(after.totals.hillResidentsBehindTwoOrMore - before.totals.hillResidentsBehindTwoOrMore),
      area: tgt ? { residentsBehindBefore: r1(sumE(before, tgt.memberEdges)), residentsBehindAfter: r1(sumE(after, tgt.memberEdges)),
        nestingBefore: tgt.nesting, nestingAfter: Math.max(0, ...[...remain.values()].map(a => a.nesting)),
        remainingChokes: [...chokes.values()].sort((p, q) => p.nesting - q.nesting).map(a => ({ streets: a.chokeStreets, type: a.type, nesting: a.nesting, residents: a.residents, clearWidthFt: a.choke.clearWidthFt, engineFits: a.choke.engineFits })) } : null,
    };
  };
}
const NPAR = Math.max(2, os.cpus().length - 2);
const asIsEff = await pool_(kept, NPAR, c => effect(c, 'asIs')());
kept.forEach((c, i) => { c.access = { asIs: asIsEff[i] }; });
const touchesPanoramic = c => PANORAMIC.has(c.area) || c.access.asIs.areasAffected.some(x => PANORAMIC.has(x.id));
console.log(`access what-ifs: ${kept.length}`);
// The area whose residents the simulator runs measure: of the chosen areas this link changes, the one
// with the most residents behind a choke today (for a link into Panoramic Hill, all of Panoramic Hill).
for (const c of kept) {
  const aff = c.access.asIs.areasAffected.slice().sort((p, q) => q.residentsBehindBefore - p.residentsBehindBefore);
  c.measureArea = aff[0]?.id || c.area;
  c.panoramic = touchesPanoramic(c);
}

// ---------- 7. cost and acquisition (screening estimate; labeled assumptions) ----------
const acsCacheF = path.join(CACHE, 'acs.json');
const acsCache = !REFRESH && fs.existsSync(acsCacheF) ? JSON.parse(fs.readFileSync(acsCacheF, 'utf8')) : {};
async function blockGroup([lon, lat]) {
  const k = `${lon.toFixed(5)},${lat.toFixed(5)}`; if (acsCache.bg?.[k]) return acsCache.bg[k];
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID', returnGeometry: 'false', f: 'json' });
  const j = await (await fetchRetry(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/1/query?${q}`)).json();
  const g = j.features?.[0]?.attributes?.GEOID || null; (acsCache.bg ??= {})[k] = g; return g;
}
async function medianValue(geoid) {
  if (!geoid) return null; if (acsCache.value?.[geoid]) return acsCache.value[geoid];
  const j = await (await fetchRetry(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077&geo_ids=15000US${geoid}`)).json();
  const d = j.data?.[`15000US${geoid}`]?.B25077; const v = d ? { median: d.estimate.B25077001, moe: d.error.B25077001, release: j.release?.name, name: j.geography?.[`15000US${geoid}`]?.name } : null;
  (acsCache.value ??= {})[geoid] = v; return v;
}
for (const c of kept) {
  // block group at the midpoint; where it has no median (campus or park land, few owner-occupied homes), the area end, then the far end
  let geoid = null, mv = null;
  for (const pt of [c.geomLonLat[Math.floor(c.geomLonLat.length / 2)], c.geomLonLat[0], c.geomLonLat[c.geomLonLat.length - 1]]) {
    geoid = await blockGroup(pt); mv = await medianValue(geoid); if (mv?.median) break;
  }
  const buildLen = c.type === 'barrier' ? 0 : c.lengthM, steepLen = Math.max(c.lengthM, c.lengthAt15PctM);
  const lowPerM = c.type === 'path' && c.trackShare >= 0.8 ? COST.gravelUpgradePerM : COST.newRoadPerM[0]; // a fire road or track: start from the gravel-road figure
  const construction = c.type === 'barrier' ? null : [r0(buildLen * lowPerM / 1e4) * 1e4, r0(steepLen * COST.newRoadPerM[1] / 1e4) * 1e4];
  const hv = mv && mv.median ? [Math.max(0, mv.median - (mv.moe || 0)), mv.median + (mv.moe || 0)] : null;
  const nb = c.buildingsInCorridor, np = c.parcels ? Math.max(0, c.parcels.inCorridor - nb) : null;
  const acquisition = c.type === 'barrier' ? null : hv && np != null ? [r0((nb * hv[0] + np * hv[0] * COST.partialTakeShare[0]) / 1e4) * 1e4, r0((nb * hv[1] + np * hv[1] * COST.partialTakeShare[1]) / 1e4) * 1e4] : null;
  c.cost = {
    construction, acquisition,
    total: construction && acquisition ? [construction[0] + acquisition[0], construction[1] + acquisition[1]] : construction || acquisition,
    parcelsToAcquire: c.parcels ? c.parcels.inCorridor : null, buildingsRemoved: nb,
    peopleDisplaced: r0(nb * A.demand.personsPerHousehold),
    blockGroup: geoid, medianHomeValue: mv,
    note: c.type === 'barrier' ? 'Opening an existing diverter, bollard or gate on an existing street: not priced here (any access agreement over a private street included); small next to a new road.'
      : !c.parcels ? 'No County parcel data here (Contra Costa County): acquisition not estimated.' : null,
  };
}
fs.writeFileSync(acsCacheF, JSON.stringify(acsCache));

// ---------- 8. rank and write ----------
const accessScore = c => c.access?.asIs?.hillResidentsFreed ?? 0;
kept.sort((p, q) => (q.type === 'city') - (p.type === 'city') || accessScore(q) - accessScore(p) || (p.cost?.total?.[1] ?? 0) - (q.cost?.total?.[1] ?? 0));
const ranked = kept.filter(c => c.type !== 'city').sort((p, q) => accessScore(q) - accessScore(p) || (p.cost?.total?.[1] ?? Infinity) - (q.cost?.total?.[1] ?? Infinity));
ranked.forEach((c, i) => { c.rank = i + 1; });
const prevSim = fs.existsSync(path.join(R, 'data/model/egress-candidates.json')) ? JSON.parse(fs.readFileSync(path.join(R, 'data/model/egress-candidates.json'), 'utf8')) : null;
const result = {
  meta: {
    built: TODAY, tool: 'tools/egress-candidates.mjs', simulation: 'tools/egress-sim.mjs', report: 'docs/egress-candidates.md', rerun: 'node tools/egress-all.mjs',
    note: 'Educational comparison, not a prediction and not an official evacuation plan. A screening of where a second way out could go, not engineering, environmental review or legal analysis. Counts only: no parcel identifiers, owners, addresses or imagery are stored. Coordinates in local meters (network.json crs) and WGS84.',
    crs: net.meta.crs, rules: RULES, linkAssumptions: LINK_ASSUMPTIONS, cost: COST, sources: SOURCES, variants: VARIANTS,
    provenance: {
      area: 'derived: area id in data/model/access-constraints.json (as the network stands)',
      type: 'model rule: new = straight segment between two network nodes; path = existing path, stairway or no-vehicle segment widened; barrier = diverter, bollard or gate opened; city = the City\'s "2nd Route Out" snapped to network nodes',
      geom: LINK_PROVENANCE.geom, lengthM: 'derived: geometry length (m)',
      profile: 'derived: ground elevation every ~4 m from the 4 m lidar DEM; avg = end-to-end climb / length; p90 and max = 25 m windows (p90 as the network builder\'s gradeMax)',
      gradeFlags: 'model rule: over15 / over20 when the average or the 90th-percentile 25 m window exceeds 15% (a common local fire-access limit; Sonoma County example) or 20% (the ceiling in 14 CCR §1273.03 with approval)',
      lengthAt15PctM: 'derived: length a road would need to keep a 15% grade over the same climb (switchbacks); not a design',
      pathShare: `derived: share of the line within ${RULES.pathNearM} m of an OpenStreetMap footway, path, steps, track or a network path/no-vehicle segment`,
      buildingsInCorridor: `derived: OpenStreetMap building footprints touching a ${LINK_ASSUMPTIONS.rightOfWayM} m corridor centered on the line (assumption: corridor width); counts only`,
      parcels: `derived: Alameda County parcel polygons (geometry only, not stored) crossed by the centerline for ${RULES.crossM} m or more (crossed), touching the corridor (inCorridor), and the share of the centerline outside every parcel (public right of way or unparceled land); null where the County layer has no parcels (Contra Costa County)`,
      followsRightOfWay: 'derived: 90% or more of the centerline lies outside parcels',
      land: 'derived: share of the line inside OpenStreetMap park or nature-reserve or protected-area polygons, UC, LBNL or East Bay Regional Park District land (by name, operator or owner tags); outer rings only',
      fireZone: 'sourced (City Fire Zones) at the midpoint, or the simulator\'s 90 m elevation proxy outside Berkeley',
      drivingNowM: 'derived: drivable distance between the two endpoints today (undirected)',
      access: 'derived: tools/access-constraints.mjs rerun with the link added (two-way local street, 20 ft, no residents on it): residents no longer behind any choke, and the target area\'s residents still behind one, its nesting and the chokes that remain',
      cost: 'assumption: screening ranges from public figures (meta.cost, meta.sources); not an engineer\'s estimate',
      evacuation: 'derived from synthetic runs: tools/egress-sim.mjs, same seed with and without the link',
    },
  },
  selection: {
    areasChosen: chosen.map(a => a.id), oneWayLeftOut: excludedOneWay.map(a => ({ id: a.id, streets: a.chokeStreets, residents: a.residents })),
    deadEndAreas: areas.map(a => ({ id: a.id, streets: a.streets.slice(0, 6), chokeStreets: a.chokeStreets, residents: a.residents, hillResidents: a.hillResidents, nesting: a.nesting, score: a.constraint.score, allocationWarning: a.allocationWarning || null, panoramic: PANORAMIC.has(a.id), candidates: kept.filter(c => c.area === a.id).map(c => c.id), pruned: pruned.filter(c => c.area === a.id).map(c => c.id) })),
  },
  baseline: Object.fromEntries(Object.entries(baseQuick).map(([k, j]) => [k, { residentsBehindAnyChoke: j.totals.residentsBehindAnyChoke, hillResidentsBehindAnyChoke: j.totals.hillResidentsBehindAnyChoke, hillResidentsBehindTwoOrMore: j.totals.hillResidentsBehindTwoOrMore }])),
  candidates: kept,
  pruned: pruned.map(c => ({ id: c.id, area: c.area, type: c.type, toStreet: c.toStreet, lengthM: c.lengthM, profile: { climbM: c.profile.climbM, avgGradePct: c.profile.avgGradePct, maxGradePct: c.profile.maxGradePct }, buildingsInCorridor: c.buildingsInCorridor, parcels: c.parcels, pathShare: c.pathShare, endpoints: c.endpoints, geomLonLat: c.geomLonLat, prunedBecause: c.prunedBecause })),
  sim: prevSim?.sim || null,
};
fs.writeFileSync(path.join(R, 'data/model/egress-candidates.json'), JSON.stringify(result));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`wrote data/model/egress-candidates.json: ${kept.length} candidates (${ranked.length} ranked + City concept), ${pruned.length} pruned`);
for (const c of ranked.slice(0, 15)) console.log(`${c.rank}. ${c.id} ${c.type} → ${c.toStreet} ${c.lengthM} m avg ${c.profile.avgGradePct}% max ${c.profile.maxGradePct}% bldg ${c.buildingsInCorridor} parcels ${c.parcels?.crossed} path ${c.pathShare} | freed ${c.access?.asIs?.residentsFreed} hill ${c.access?.asIs?.hillResidentsFreed} | area ${c.access?.asIs?.area?.residentsBehindBefore}→${c.access?.asIs?.area?.residentsBehindAfter} n${c.access?.asIs?.area?.nestingBefore}→${c.access?.asIs?.area?.nestingAfter}`);
