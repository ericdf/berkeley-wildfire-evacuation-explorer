#!/usr/bin/env node
// Egress plan step 2b: hill street segments where width binds (pinch points), what widening them
// would take (frontage strips, parcels, buildings, side slope, cost ranges), and the cheaper
// alternative of banning parking on just that segment. The simulator runs are in
// tools/widening-sim.mjs; tools/widening-all.mjs runs everything and writes docs/widening.md.
//
//   node tools/widening.mjs              writes data/model/widening.json (fetches parcels, buildings, ACS)
//   node tools/widening.mjs --no-fetch   ranking only, no web requests (screening fields left null)
//
// Method (model rules unless marked; docs/widening.md has the full list):
// - Hill segment: drivable, Fire Zone 2–3 (or the elevation proxy beyond the city line), pavement
//   width known, not a Lab private street, not closed by a barrier.
// - Binds for an engine: in the nominal status-quo parking state (js/parking.js, seed null: both
//   sides where they fit, perfect parking) the clear width is under access.engineClearM (10 ft).
//   Binds for two-way traffic: clear width under access.fireCodeClearM (20 ft).
// - Removal impact: Berkeley hill residents (the simulator's engine-reach population, SOURCE_NOTES
//   ER1) who lose 5-minute engine reach when the segment alone is closed to engines, starting from a
//   network with no parked cars. Choke: the segment is an entrance (chokeEdges) of an access-
//   constrained area (data/model/access-constraints.json); residents behind = that area's residents.
//   Score = the larger of the two (people who depend on the segment), ties broken by clear width.
// - Pinch: adjacent binding segments of one street with the same dependents (removal impacts within
//   10%, or the same choke area) form one pinch; a widening or parking change applies to all of them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadData } = await import(R + '/js/data.js');
const { parkingState } = await import(R + '/js/parking.js');
const { toUTM, fromUTM } = await import(R + '/tools/utm.mjs');
const { standards, nominalSides, engineDist, reachedWithin, FT } = await import(R + '/tools/widening-core.mjs');
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const argv = process.argv.slice(2), FETCH = !argv.includes('--no-fetch');
const TOP = 30, UA = 'berkeley-wildfire-evacuation-explorer/0.1', TODAY = new Date().toISOString().slice(0, 10);
const r0 = v => v == null ? null : Math.round(v), r1 = v => v == null ? null : Math.round(v * 10) / 10, r2 = v => v == null ? null : Math.round(v * 100) / 100;
const title = s => (s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, d, s) => d + s.toLowerCase());

const data = await loadData(load);
const { net, A, layers } = data, edges = net.edges, O = net.meta.origin;
const toLL = ([x, y]) => fromUTM(x + O[0], y + O[1]).map(v => Math.round(v * 1e6) / 1e6);
const toLocal = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
const ac = JSON.parse(fs.readFileSync(path.join(R, 'data/model/access-constraints.json'), 'utf8'));

// ---------- residents per edge (the simulator's allocation, expected values; as tools/access-constraints.mjs) ----------
const CLASS_RANK = { Local: 0, 'Major Collector': 1, 'Principal Arterial': 2, Ramp: 3, Interstate: 3 };
const simDrivable = e => e.mode === 'vehicle' && !e.disconnected && !e.barrier?.closed;
const people = new Float64Array(edges.length);
{
  const byZone = new Map();
  for (const e of edges) {
    if (!simDrivable(e) || e.evacZone == null || CLASS_RANK[e.cls] === 3) continue;
    const w = e.len * (e.cls === 'Principal Arterial' ? 0.7 : 1);
    if (!byZone.has(e.evacZone)) byZone.set(e.evacZone, []); byZone.get(e.evacZone).push([e.id, w]);
  }
  for (const z of layers.evacZones) {
    const pop = z.popModeled ?? z.pop, list = byZone.get(z.id); if (!list || !pop) continue;
    const W = list.reduce((s, [, w]) => s + w, 0);
    for (const [id, w] of list) people[id] += pop * w / W;
  }
}
// engine-reach population (js/sim.js engineReachStats): households in BER- zones on Fire Zone 2–3 streets
const erPeople = Float64Array.from(edges, e => String(e.evacZone || '').startsWith('BER') && e.fireZone >= 2 ? people[e.id] : 0);
const hills = e => e.fireZone === 2 || e.fireZone === 3;

// ---------- nominal status-quo parking ----------
const P = parkingState(data, { hillsParking: 'both' }, null, null);
const clearOf = id => Number.isNaN(P.clear[id]) ? null : P.clear[id];
// measured widths only: City pavement data or an OSM width tag (Berkeley medians assumed outside Berkeley are left out)
const measured = e => /^(city:|osm:width)/.test(e.widthSrc || '');
const hillKnown = edges.filter(e => simDrivable(e) && hills(e) && e.widthM != null && !e.labPrivate);
const cand = hillKnown.filter(e => measured(e) && clearOf(e.id) < A.access.fireCodeClearM);
const assumedWidthBinding = hillKnown.filter(e => !measured(e) && clearOf(e.id) < A.access.fireCodeClearM);
const bindsEngine = e => clearOf(e.id) < A.access.engineClearM;

// ---------- engine removal impact (open network) and gain from passing (nominal parking) ----------
const allPass = new Uint8Array(edges.length).fill(1);
const base = engineDist(data, allPass), baseIn = reachedWithin(data, base.dist);
const treeEdges = new Set(base.prev.filter(x => x >= 0));
function lost(group) {
  if (!group.some(id => treeEdges.has(id))) return { people: 0, edges: [] };
  const pass = allPass.slice(); for (const id of group) pass[id] = 0;
  const now = reachedWithin(data, engineDist(data, pass).dist);
  let ppl = 0; const out = [];
  for (const e of edges) if (baseIn[e.id] && !now[e.id]) { out.push(e.id); ppl += erPeople[e.id]; }
  return { people: ppl, edges: out };
}
const nomPass = Uint8Array.from(P.engineOK);
const nomIn = reachedWithin(data, engineDist(data, nomPass).dist);
const sumIn = inArr => edges.reduce((s, e) => s + (inArr[e.id] ? erPeople[e.id] : 0), 0);
const nomReached = sumIn(nomIn), openReached = sumIn(baseIn), erTotal = erPeople.reduce((a, b) => a + b, 0);
function gainNominal(group) {
  const pass = nomPass.slice(); for (const id of group) pass[id] = 1;
  return sumIn(reachedWithin(data, engineDist(data, pass).dist)) - nomReached;
}

// ---------- chokes ----------
const chokeArea = new Map(); // edge → largest area it is an entrance of
for (const a of ac.areas) for (const id of a.chokeEdges) { const p = chokeArea.get(id); if (!p || a.residents > p.residents) chokeArea.set(id, a); }

// ---------- score each candidate, then group into pinches ----------
const info = new Map();
for (const e of cand) {
  const L = lost([e.id]), ca = chokeArea.get(e.id);
  info.set(e.id, { e, lost: L, choke: ca || null, score: Math.max(L.people, ca ? ca.hillResidents : 0) });
}
const parent = new Map(cand.map(e => [e.id, e.id]));
const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const e of cand) for (const n of [e.a, e.b]) for (const fid of data.nodeEdges[n]) {
  const f = info.get(fid); if (!f || fid === e.id || f.e.name !== e.name) continue;
  const g = info.get(e.id);
  if (bindsEngine(e) !== bindsEngine(f.e)) continue;
  const same = (g.choke && f.choke && g.choke.id === f.choke.id) || (g.lost.people > 1 && f.lost.people > 1 && Math.abs(g.lost.people - f.lost.people) <= 0.1 * Math.max(g.lost.people, f.lost.people));
  if (same) parent.set(find(e.id), find(fid));
}
const groups = new Map();
for (const e of cand) { const k = find(e.id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e.id); }

const pinches = [];
for (const ids of groups.values()) {
  const es = ids.map(id => edges[id]);
  const L = ids.length > 1 ? lost(ids) : info.get(ids[0]).lost;
  const chokes = [...new Set(ids.map(id => chokeArea.get(id)).filter(Boolean))].sort((p, q) => q.residents - p.residents);
  const ca = chokes[0] || null;
  const lenM = es.reduce((s, e) => s + e.len, 0);
  const minW = Math.min(...es.map(e => e.widthM)), minClear = Math.min(...ids.map(clearOf));
  const sides = Math.max(...es.map(e => nominalSides(A, e)));
  const score = Math.max(L.people, ca ? ca.hillResidents : 0);
  if (score < 1) continue;
  pinches.push({
    edges: ids, street: title(es[0].name), lengthM: r0(lenM),
    pavementWidthM: r2(minW), pavementWidthFt: r0(minW / FT), widthSrc: [...new Set(es.map(e => e.widthSrc))],
    nominalParkedSides: sides, nominalClearM: r2(minClear), nominalClearFt: r1(minClear / FT),
    binds: { engine: minClear < A.access.engineClearM, twoWay: minClear < A.access.fireCodeClearM },
    sb99Tier: minClear / FT <= 6 ? 'severely constrained' : minClear / FT <= 8 ? 'moderately constrained' : minClear / FT <= 10 ? 'constrained' : 'not narrow',
    fireZone: Math.max(...es.map(e => e.fireZone)), fireZoneSrc: es[0].fireZoneSrc || 'city:FireZones', evacZones: [...new Set(es.map(e => e.evacZone))],
    city: es.every(e => String(e.evacZone || '').startsWith('BER') || String(e.evacZone || '').startsWith('LBL')) ? 'Berkeley' : 'outside Berkeley',
    engineReachLost: { people: r1(L.people), edges: L.edges.length },
    engineReachGainNominal: r1(gainNominal(ids)),
    choke: ca ? { area: ca.id, type: ca.type, residents: ca.residents, hillResidents: ca.hillResidents, nesting: ca.nesting, streets: ca.streets.slice(0, 8) } : null,
    score: r1(score),
    behindEdges: ca ? ca.memberEdges : L.edges,
    geom: ids.map(id => edges[id].geom), gradeMaxPct: Math.max(...es.map(e => e.gradeMax ?? 0)),
  });
}
pinches.sort((p, q) => q.score - p.score || p.nominalClearM - q.nominalClearM);
pinches.forEach((p, i) => { p.rank = i + 1; p.id = `WP-${String(i + 1).padStart(3, '0')}`; });
console.log(`hill segments with a width: ${hillKnown.length} (measured ${hillKnown.filter(measured).length}); assumed-width segments under 20 ft clear left out: ${assumedWidthBinding.length}; binding (under 20 ft clear, nominal parking): ${cand.length}, of which under 10 ft: ${cand.filter(bindsEngine).length}; pinches with dependents: ${pinches.length}`);
console.log(`engine-reach population ${r0(erTotal)}; within 5 min, open network ${r0(openReached)}, nominal parking ${r0(nomReached)}`);
for (const p of pinches.slice(0, 40)) console.log(`${p.id} ${p.street} [${p.edges.join(',')}] ${p.lengthM} m, ${p.pavementWidthFt} ft pav, ${p.nominalClearFt} ft clear (${p.nominalParkedSides} sides) ${p.binds.engine ? 'ENGINE' : 'two-way'} | lost ${p.engineReachLost.people} gain ${p.engineReachGainNominal} | choke ${p.choke ? p.choke.area + ' ' + p.choke.hillResidents : '-'} | ${p.evacZones.join(',')}`);

// ---------- screening of the top pinches: strips, parcels, buildings, side slope, cost ----------
// Inputs (labeled in meta.sources and meta.cost; every cost is an assumption built on the cited figure).
const SOURCES = {
  sb99: { what: 'KLD TR-1380 SB 99 Access Impaired Neighborhood Analysis, Rev. 3 (2024-02-19), p. 2–3: 10 ft minimum travel lane, 8 ft per parked side', retrieved: 'SOURCE_NOTES A1–A2' },
  cfc: { what: 'California Fire Code (2022) §503.2.1: fire apparatus access roads shall have an unobstructed width of not less than 20 feet', url: 'https://codes.iccsafe.org/content/CAFC2022P1/chapter-5-fire-service-features', retrieved: 'data/assumptions.json access.fireCodeClearM' },
  fdotU19: { what: 'Florida DOT Cost Per Mile Models, U19 "Add 2 Lanes to Existing 2 Lane Undivided Arterial (1 Lane Each Side), with 4\' Bike Lanes", curb and gutter, sidewalk, drainage and lighting: $9,540,676.51 per mile (October 2024 update), with 14,467.2 SY of new base per mile (12,096 m², 7.5 m of added width): $789 per m² of added pavement, all items included, flat terrain, no right of way', url: 'http://web.archive.org/web/20251006210442/https://fdotwww.blob.core.windows.net/sitefinity/docs/default-source/fpo/fpc/reports/costpermile/urban/urban-19.pdf', retrieved: '2026-11-01 (Wayback copy of 2025-10-06; listed on the cost-per-mile page also used by step 2)' },
  wsdotWalls: { what: 'WSDOT Bridge Design Manual M 23-50.24 (June 2025), Appendix 12.3-A1 Structural Estimating Aids, scoping-level unit costs updated April 2025 (mobilization included; no sales tax, engineering or contingency): reinforced concrete retaining wall $70–$110 per sq ft of exposed face; soldier pile wall $125–$170; soldier pile tieback wall $175–$250', url: 'https://wsdot.wa.gov/publications/manuals/fulltext/M23-50/Chapter12.pdf', retrieved: '2026-11-01' },
  acs: { what: 'American Community Survey 2020–2024 5-year, table B25077 median value of owner-occupied homes, by block group (Census Reporter API); block group from TIGERweb', url: 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077', retrieved: TODAY },
  parcels: { what: 'Alameda County Parcel Boundaries (Parcels FeatureServer layer 0), geometry only; counted per pinch in memory and never saved', url: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0', retrieved: TODAY },
  osm: { what: 'OpenStreetMap building footprints (Overpass API; © OpenStreetMap contributors, ODbL); counted in memory and never saved', url: 'https://www.openstreetmap.org/copyright', retrieved: null },
  dem: { what: 'USGS 3DEP 1 m lidar DEM (Alameda County 2021), resampled to 4 m in data/terrain (bare earth)', retrieved: 'data/terrain/dem.json' },
  step2: { what: 'Egress step 2 (branch egress-candidates, PR #15, tools/egress-candidates.mjs): parcel counting from the County layer, block-group median home value from ACS B25077, partial takes at 10–25% of it, buildings taken whole', retrieved: '2026-11-01' },
};
const COST = {
  pavementPerM2: [789, 2 * 789],
  wallPerM2: [70, 250].map(v => r0(v / (FT * FT))), // $ per sq ft of face → per m²
  wallMinHeightM: 0.6, wallBeyondEdgeM: 1,
  partialTakeShare: [0.1, 0.25],
  redCurbPerFt: [1, 4],
  setbackM: 3,
  minTakeM2: 1,
  stallM: 6.7,
  note: 'Pavement: the FDOT U19 all-in figure per m² of added pavement (low) and twice it (high, assumption: a small hillside job in the Bay Area). Retaining walls: where the ground 1 m beyond the new edge of pavement sits 0.6 m (2 ft) or more above or below the road centerline (DEM), a wall that tall along that stretch, priced from the WSDOT low (reinforced concrete wall, $70 per sq ft) to high (soldier pile tieback wall, $250 per sq ft) unit costs. Acquisition: each parcel holding 1 m² or more of the new strip is a partial take at 10–25% of the block group median home value (± the ACS margin of error); each building the new pavement reaches is taken whole at that value (step 2\'s rule). Red curb: $1–$4 per foot of curb for paint and signs (assumption; no public unit cost verified). Parked-car stall 6.7 m (22 ft, assumption). Left out: engineering, environmental review, legal costs, relocation benefits, utility poles and lines, drainage beyond the FDOT items, inflation since the figures\' dates, and a contingency.',
};

const { demAt } = await import(R + '/js/fire.js');
const zAt = (x, y) => demAt(data.dem, data.Z, x, y);
function samplesAlong(geom, step = 1) {
  const out = [];
  for (let i = 1; i < geom.length; i++) {
    const [ax, ay] = geom[i - 1], [bx, by] = geom[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step)), nx = L ? -(by - ay) / L : 0, ny = L ? (bx - ax) / L : 0;
    for (let j = i === 1 ? 0 : 1; j <= n; j++) out.push({ p: [ax + (bx - ax) * j / n, ay + (by - ay) * j / n], nx, ny, ds: L / n });
  }
  return out;
}
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const withBox = o => { const xs = o.ring.map(p => p[0]), ys = o.ring.map(p => p[1]); o.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; return o; };
const inBB = (bb, x, y) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3];
const inPolyH = (P_, x, y) => inBB(P_.bb, x, y) && inRing(x, y, P_.ring) && !(P_.holes || []).some(h => inRing(x, y, h));

async function fetchRetry(url, opt = {}, tries = 6) {
  let wait = 4000;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(opt.timeoutMs || 120000), ...opt, headers: { 'User-Agent': UA, ...(opt.headers || {}) } }); if (r.ok) return r; console.log(`  ${r.status} from ${new URL(url).host}, retrying`); } catch (e) { console.log(`  ${e.message}, retrying`); }
    await new Promise(res => setTimeout(res, wait)); wait *= 2;
  }
  throw new Error(`failed ${url}`);
}
const bboxOf = geoms => { const pts = geoms.flat(); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const PAD = 40;
async function buildingsFor(list) { // one Overpass query for every screened pinch; footprints kept in memory only
  const q = `[out:json][timeout:180];\n(\n${list.map(p => { const bb = bboxOf(p.geom); const [w, s] = toLL([bb[0] - PAD, bb[1] - PAD]), [e, n] = toLL([bb[2] + PAD, bb[3] + PAD]); return `way["building"](${s},${w},${n},${e});`; }).join('\n')}\n);\nout geom qt;\n`;
  for (const h of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const j = await (await fetchRetry(h, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 3)).json();
      SOURCES.osm.retrieved = `${TODAY} from ${new URL(h).host} (OSM data as of ${j.osm3s?.timestamp_osm_base})`;
      return j.elements.filter(el => el.geometry?.length >= 4).map(el => withBox({ ring: el.geometry.map(p => toLocal(p.lon, p.lat)) }));
    } catch (e) { console.log(`  ${h}: ${e.message}`); }
  }
  throw new Error('Overpass unavailable');
}
async function parcelsFor(p) { // geometry only, in memory for this pinch
  const bb = bboxOf(p.geom); const [w, s] = toLL([bb[0] - PAD, bb[1] - PAD]), [e, n] = toLL([bb[2] + PAD, bb[3] + PAD]);
  const q = new URLSearchParams({ geometry: `${w},${s},${e},${n}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID', returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '2000' });
  const fc = await (await fetchRetry(`${SOURCES.parcels.url}/query?${q}`)).json(); if (fc.error) throw new Error(JSON.stringify(fc.error));
  const all = fc.features.flatMap(f => (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [])
    .map(poly => withBox({ ring: poly[0].map(([lon, lat]) => toLocal(lon, lat)), holes: poly.slice(1).map(h => h.map(([lon, lat]) => toLocal(lon, lat))) })));
  // stacked polygons (condominium units drawn on one lot) count once: same outline to the decimeter
  const seen = new Set(); return all.filter(q => { const k = q.bb.map(v => Math.round(v * 10)).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
}
// Block-group values are cached in data/raw/widening/acs.json (aggregates only; gitignored): the Census
// Reporter API is sometimes slow to answer.
const ACS_F = path.join(R, 'data/raw/widening/acs.json');
const acsCache = fs.existsSync(ACS_F) ? JSON.parse(fs.readFileSync(ACS_F, 'utf8')) : { bg: {}, value: {} };
let acsDown = false; // after one failed Census Reporter lookup, skip the rest of this run
async function homeValue([lon, lat]) {
  const k = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  try {
    if (!(k in acsCache.bg)) {
      const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID', returnGeometry: 'false', f: 'json' });
      acsCache.bg[k] = (await (await fetchRetry(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/1/query?${q}`)).json()).features?.[0]?.attributes?.GEOID || null;
    }
    const g = acsCache.bg[k]; if (!g) return { blockGroup: null, value: null };
    if (!acsCache.value[g]) {
      if (acsDown) return { blockGroup: g, value: null };
      let j; try { j = await (await fetchRetry(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077&geo_ids=15000US${g}`, { timeoutMs: 30000 }, 3)).json(); }
      catch (e) { acsDown = true; throw e; }
      const d = j.data?.[`15000US${g}`]?.B25077;
      acsCache.value[g] = d && d.estimate.B25077001 ? { median: d.estimate.B25077001, moe: d.error.B25077001, release: j.release?.name, retrieved: TODAY } : null;
    }
    fs.mkdirSync(path.dirname(ACS_F), { recursive: true }); fs.writeFileSync(ACS_F, JSON.stringify(acsCache));
    return { blockGroup: g, value: acsCache.value[g] };
  } catch (e) { console.log(`  ACS lookup failed (${e.message}); acquisition left unpriced`); return { blockGroup: acsCache.bg[k] || null, value: null }; }
}

// One side of a widening: the strip between today's edge of pavement (half the City width from the
// centerline; assumption: the County centerline runs down the middle of the pavement) and the new edge.
function side(p, S, sgn, gain, parcels, buildings) {
  const W = p.pavementWidthM / 2, out = { gainM: r2(gain), lengthM: 0, areaM2: 0, areaInParcelsM2: 0, parcels: 0, buildingsInNewPavement: 0, buildingsWithinSetback: 0, wallM2: 0, wallLengthM: 0 };
  if (gain <= 0) return out;
  for (const { p: [x, y], nx, ny, ds } of S) {
    const zc = zAt(x, y), d = W + gain + COST.wallBeyondEdgeM, z1 = zAt(x + sgn * nx * d, y + sgn * ny * d);
    if (zc != null && z1 != null) { const h = Math.abs(z1 - zc); if (h >= COST.wallMinHeightM) { out.wallM2 += h * ds; out.wallLengthM += ds; } }
  }
  const hitP = new Map(), hitB = new Set(), hitB2 = new Set();
  let n = 0, nIn = 0;
  for (const { p: [x, y], nx, ny, ds } of S) {
    out.lengthM += ds;
    for (let o = W + 0.125; o < W + gain; o += 0.25) {
      const qx = x + sgn * nx * o, qy = y + sgn * ny * o; n++;
      let inside = false;
      parcels.forEach((P_, i) => { if (inPolyH(P_, qx, qy)) { hitP.set(i, (hitP.get(i) || 0) + ds * 0.25); inside = true; } });
      if (inside) nIn++;
    }
    // Buildings: only the added strip (today's edge of pavement outward) counts as a taking; a footprint
    // inside the modeled existing pavement is a centerline/footprint misalignment (existingPavementOverlap).
    for (let o = 0.25; o < W + gain + COST.setbackM; o += 0.25) {
      if (o < W) continue; // existing pavement
      const qx = x + sgn * nx * o, qy = y + sgn * ny * o;
      buildings.forEach((B, i) => { if (inPolyH(B, qx, qy)) { if (o < W + gain) hitB.add(i); else hitB2.add(i); } });
    }
  }
  out.areaM2 = r0(out.lengthM * gain); out.areaInParcelsM2 = r0(n ? out.lengthM * gain * nIn / n : 0); out.lengthM = r0(out.lengthM);
  out.parcels = hitP.size; out.parcelsOver1M2 = [...hitP.values()].filter(a => a >= COST.minTakeM2).length; out.buildingsInNewPavement = hitB.size; out.buildingsWithinSetback = [...hitB2].filter(i => !hitB.has(i)).length;
  out.wallM2 = r0(out.wallM2); out.wallLengthM = r0(out.wallLengthM);
  return out;
}
// Footprints inside the modeled existing pavement (both sides, centerline to half the City width):
// the County centerline or the pavement width does not match the OSM footprint there. Reported as an
// alignment flag, never counted as a building taken.
function existingPavementOverlap(p, S, buildings) {
  const W = p.pavementWidthM / 2, hit = new Set();
  for (const { p: [x, y], nx, ny } of S) for (const sgn of [1, -1]) for (let o = 0.25; o < W; o += 0.25) { // the grid side() uses
    const qx = x + sgn * nx * o, qy = y + sgn * ny * o;
    buildings.forEach((B, i) => { if (inPolyH(B, qx, qy)) hit.add(i); });
  }
  return hit.size;
}
// Side slope: median rise of the ground from today's edge of pavement to 6 m beyond it (positive uphill).
function sideSlope(p, S, sgn) {
  const W = p.pavementWidthM / 2, v = [];
  for (const { p: [x, y], nx, ny } of S) { const a = zAt(x + sgn * nx * W, y + sgn * ny * W), b = zAt(x + sgn * nx * (W + 6), y + sgn * ny * (W + 6)); if (a != null && b != null) v.push((b - a) / 6 * 100); }
  v.sort((a, b) => a - b); return v.length ? r0(v[Math.floor(v.length / 2)]) : null;
}
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
const rr = x => r0(x / 1e4) * 1e4;
function layout(p, S, gain, how, parcels, buildings, hv) {
  const g = how === 'both' ? [gain / 2, gain / 2] : how === 'left' ? [gain, 0] : [0, gain];
  const sides = [side(p, S, 1, g[0], parcels, buildings), side(p, S, -1, g[1], parcels, buildings)];
  const area = sum(sides, 'areaM2'), wall = sum(sides, 'wallM2'), nB = sum(sides, 'buildingsInNewPavement');
  const pave = COST.pavementPerM2.map(c => area * c), walls = COST.wallPerM2.map(c => wall * c);
  const v = hv?.median ? [Math.max(0, hv.median - (hv.moe || 0)), hv.median + (hv.moe || 0)] : null;
  const taken = sum(sides, 'parcelsOver1M2');
  // No home value (ACS lookup failed or no median): acquisition and total stay null unless nothing is acquired.
  const acq = v ? [nB * v[0] + Math.max(0, taken - nB) * v[0] * COST.partialTakeShare[0], nB * v[1] + Math.max(0, taken - nB) * v[1] * COST.partialTakeShare[1]] : !taken && !nB ? [0, 0] : null;
  return { layout: how, left: sides[0], right: sides[1], newPavementM2: area, stripInParcelsM2: sum(sides, 'areaInParcelsM2'), parcelsEntered: sum(sides, 'parcels'), parcelsToAcquire: taken,
    buildingsInNewPavement: nB, buildingsWithinSetback: sum(sides, 'buildingsWithinSetback'), retainingWallM2: wall, retainingWallLengthM: sum(sides, 'wallLengthM'),
    cost: { pavement: pave.map(rr), walls: walls.map(rr), construction: [rr(pave[0] + walls[0]), rr(pave[1] + walls[1])], acquisition: acq && acq.map(rr), total: acq ? [rr(pave[0] + walls[0] + acq[0]), rr(pave[1] + walls[1] + acq[1])] : null } };
}

const screened = pinches.slice(0, TOP);
for (const p of pinches) { p.standards = standards(A, p.nominalParkedSides); p.gainM = Object.fromEntries(Object.entries(p.standards).map(([k, w]) => [k, r2(Math.max(0, w - p.pavementWidthM))])); }
if (FETCH) {
  console.log(`screening ${screened.length} pinches: Overpass, County parcels, ACS`);
  const allBuildings = await buildingsFor(screened);
  for (const p of screened) {
    const parcels = await parcelsFor(p);
    const bb = bboxOf(p.geom), near = q => q.bb[2] >= bb[0] - PAD && q.bb[0] <= bb[2] + PAD && q.bb[3] >= bb[1] - PAD && q.bb[1] <= bb[3] + PAD;
    const buildings = allBuildings.filter(near);
    const S = p.edges.flatMap(id => samplesAlong(edges[id].geom, 1));
    const hv = await homeValue(toLL(S[Math.floor(S.length / 2)].p));
    p.blockGroup = hv.blockGroup; p.medianHomeValue = hv.value;
    p.sideSlopePct = { left: sideSlope(p, S, 1), right: sideSlope(p, S, -1) };
    p.buildingsOverlappingExistingPavement = existingPavementOverlap(p, S, buildings);
    p.widening = {};
    for (const [k, gain] of Object.entries(p.gainM)) {
      if (gain <= 0) { p.widening[k] = null; continue; }
      const opts = ['both', 'left', 'right'].map(h => layout(p, S, gain, h, parcels, buildings, hv.value));
      const key = o => [o.buildingsInNewPavement, o.buildingsWithinSetback, o.parcelsToAcquire, o.retainingWallM2];
      const best = opts.slice().sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; })[0];
      p.widening[k] = { symmetric: opts[0], leastTaking: best };
    }
    const f = w => w ? `${w.leastTaking.layout} +${r2(w.leastTaking.newPavementM2 / Math.max(1, p.lengthM))} m parcels ${w.leastTaking.parcelsToAcquire} (${w.leastTaking.stripInParcelsM2}/${w.leastTaking.newPavementM2} m²) bldg ${w.leastTaking.buildingsInNewPavement}+${w.leastTaking.buildingsWithinSetback} wall ${w.leastTaking.retainingWallM2} m² ${(c => c.total ? `$${(c.total[0] / 1e6).toFixed(2)}–${(c.total[1] / 1e6).toFixed(2)}M` : `construction $${(c.construction[0] / 1e6).toFixed(2)}–${(c.construction[1] / 1e6).toFixed(2)}M, acquisition not priced`)(w.leastTaking.cost)}` : 'met';
    console.log(`  ${p.id} ${p.street}: slope L ${p.sideSlopePct.left}% R ${p.sideSlopePct.right}% | in existing pavement ${p.buildingsOverlappingExistingPavement} | ` + Object.entries(p.widening).map(([k, w]) => `${k}: ${f(w)}`).join(' | '));
  }
}
// Parking-only alternative: no parking on just this pinch (red curb), no taking.
for (const p of pinches) {
  const W = p.pavementWidthM, s0 = p.nominalParkedSides, curbFt = p.lengthM * s0 / FT;
  p.parkingOnly = {
    clearM: r2(W), clearFt: r1(W / FT), engine: W >= A.access.engineClearM, twoWay: W >= A.access.fireCodeClearM,
    parkedSidesRemoved: s0, curbLengthM: r0(p.lengthM * s0), stallsLost: r0(p.lengthM * s0 / COST.stallM),
    cost: [r0(curbFt * COST.redCurbPerFt[0] / 100) * 100, r0(curbFt * COST.redCurbPerFt[1] / 100) * 100],
    note: !s0 ? 'Nobody parks here in the nominal state; a red curb matters only where cars park partly off the pavement (the simulator\'s random draws).'
      : W >= A.access.fireCodeClearM ? 'With no parked cars the pavement gives 20 ft or more: two-way traffic and engine access without a taking.'
      : W >= A.access.engineClearM ? 'With no parked cars an engine passes, but the pavement is under 20 ft: one shared lane for two-way traffic; a pull-out would need pavement the street does not have.'
      : 'Even with no parked cars the pavement is under 10 ft.',
  };
}

// ---------- write ----------
const strip = p => { const { geom, ...rest } = p; return { ...rest, geomLonLat: geom.map(g => g.map(toLL)) }; };
const out = {
  meta: {
    built: TODAY, tool: 'tools/widening.mjs', report: 'docs/widening.md', crs: net.meta.crs,
    note: 'Educational comparison, not a prediction and not an official plan. A screening estimate of where street width binds and what widening or a parking change would take; not engineering, environmental review, appraisal or legal analysis. Counts only: no parcel identifiers, owners, addresses or imagery are stored; parcel and building geometry is fetched, counted in memory and dropped.',
    rules: {
      hillSegment: 'model rule: drivable, Fire Zone 2–3 (City layer, or elevation ≥ 90 m beyond the city line), not a Lab private street, not closed by a barrier, pavement width measured (City pavement data or an OSM width tag)',
      nominalParking: 'model rule: js/parking.js with seed null: both sides where they fit while leaving 8 ft, perfect parking, no bad parking jobs',
      bindsEngine: `model rule: nominal clear width under access.engineClearM (${A.access.engineClearM} m, 10 ft; SB 99 p. 2–3)`,
      bindsTwoWay: `model rule: nominal clear width under access.fireCodeClearM (${A.access.fireCodeClearM} m, 20 ft; CFC §503.2.1)`,
      engineReachLost: 'derived: Berkeley hill residents (BER- zones, Fire Zone 2–3 streets; js/sim.js engineReachStats) whose street an engine reaches within 5 minutes with no parked cars anywhere and does not when this pinch alone is closed to engines (js/sim.js engineTimes rules at ignition: Berkeley stations, 1.15 × posted speed, gates 3 min; a home counts at the nearer end of its segment). Synthetic expected residents, allocated as tools/access-constraints.mjs does',
      engineReachGainNominal: 'derived: hill residents who come within 5-minute engine reach when this pinch alone becomes passable, every other segment in its nominal parking state',
      choke: 'derived: the pinch is an entrance (chokeEdges) of an access-constrained area in data/model/access-constraints.json; residents behind = that area (synthetic)',
      score: 'model rule: the larger of engineReachLost.people and choke.hillResidents',
      grouping: 'model rule: adjacent binding segments of one street are one pinch when they enter the same choke area or their engine-reach losses are within 10%',
      standards: 'engine: 10 ft clear plus 8 ft per side parked today (nominal); fireCode: 20 ft unobstructed (CFC §503.2.1) plus 8 ft per side parked today; full: two 10 ft lanes plus parking on both sides, 36 ft (assumption)',
      strip: 'model rule: today\'s edge of pavement at half the City width from the County centerline; layouts: symmetric (half the gain each side) or all on one side; leastTaking = fewest buildings in the new pavement, then within the setback, then parcels, then retaining wall',
      buildings: `derived: OpenStreetMap footprints the added strip reaches (sampled from today's edge of pavement outward), and others within ${COST.setbackM} m beyond the new edge (assumption: a working setback); counts only`,
      buildingsOverlappingExistingPavement: 'derived: OpenStreetMap footprints inside the modeled existing pavement (centerline to half the City width, either side). A flag that the County centerline or the pavement width does not line up with the footprint there; not counted as a building taken',
      parcels: 'derived: County parcel polygons the new strip enters (sampled every 1 m along and 0.25 m across); stacked polygons with the same outline (condominium units) count once; parcelsToAcquire counts parcels holding 1 m² or more of strip (assumption); stripInParcelsM2 = strip area inside any parcel (the rest lies in public right of way or unparceled land)',
      sideSlopePct: 'derived: median over the pinch of the ground rise from today\'s edge of pavement to 6 m beyond it, per side (left = left of the County digitizing direction), from the 4 m DEM; positive uphill',
      retainingWall: `model rule: a wall where the ground ${COST.wallBeyondEdgeM} m beyond the new edge is ${COST.wallMinHeightM} m or more above or below the centerline; wall face = that height along that length`,
    },
    cost: COST, sources: SOURCES,
    totals: {
      hillSegmentsWithWidth: hillKnown.length, measuredWidth: hillKnown.filter(measured).length, assumedWidthUnder20ftLeftOut: assumedWidthBinding.length,
      bindingTwoWay: cand.length, bindingEngine: cand.filter(bindsEngine).length, pavementUnder10ft: cand.filter(e => e.widthM < A.access.engineClearM).length,
      bindingEngineStreets: [...new Set(cand.filter(bindsEngine).map(e => title(e.name)))].sort(),
      bindingEngineLengthM: r0(cand.filter(bindsEngine).reduce((s, e) => s + e.len, 0)), bindingTwoWayLengthM: r0(cand.reduce((s, e) => s + e.len, 0)),
      pinchesWithDependents: pinches.length,
      engineReachPopulation: r0(erTotal), within5OpenNetwork: r0(openReached), within5Nominal: r0(nomReached),
    },
    screened: FETCH ? screened.length : 0,
  },
  pinches: pinches.map(strip),
};
if (FETCH) { fs.writeFileSync(path.join(R, 'data/model/widening.json'), JSON.stringify(out)); console.log('wrote data/model/widening.json'); }
else console.log('--no-fetch: nothing written');
