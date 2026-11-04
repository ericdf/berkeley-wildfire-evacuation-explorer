// Structure exposure layer (Phase 3, step 3a; docs/design/phase-3.md, SOURCE_NOTES PH9–PH11).
// Writes data/model/structures.json: counts per 30 m fire cell, never footprints.
//
//   Fire Zones 2–3: City footprints (Distance_between_structures_in_Fire_Zones_2_and_3_WFL1, layer 3),
//     counted at each footprint's centroid, with the gap to the nearest footprint (measured here from
//     the geometry) in the City map's three NIST bands (under 25 ft, 25–50 ft, 50 ft or more) and
//     footprint area.
//   Everywhere else in the model area: 2020 Census housing units (HU100) at each block's interior
//     point (data/raw/census/blocks-2020.json), for blocks whose interior point lies outside Fire
//     Zones 2–3. Housing units, not structures: an apartment building is many units.
//
// Privacy: the City layer also carries addresses, parcel numbers, owner names, owner-occupancy and
// tract demographics. The query asks only for NEAR_DIST and the geometry; footprints are reduced to
// cell counts in memory and never written.
//
// Also checks the City's statement that NEAR_DIST is in feet, by comparing it with the measured gap.
//
//   node tools/build-structures.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';
import { CELL, bbox, inBB, inPoly } from '../js/fire.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'berkeley-wildfire-simulator/0.1' };
const LAYER = 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Distance_between_structures_in_Fire_Zones_2_and_3_WFL1/FeatureServer/3';

async function get(url, params) {
  const u = `${url}?${new URLSearchParams(params)}`;
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(u, { headers: UA });
      if (r.ok) { const j = await r.json(); if (j.error) throw new Error(j.error.message); return j; }
    } catch (e) { if (k === 3) throw e; }
    await new Promise(res => setTimeout(res, 2000 * 2 ** k));
  }
  throw new Error(`failed ${u}`);
}

const net = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/network.json'), 'utf8'));
const layers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/layers.json'), 'utf8'));
const [x0, y0] = net.meta.origin, T = net.meta.terrain;
const W = Math.ceil(T.xmax / CELL), H = Math.ceil(T.ymax / CELL); // same grid as js/fire.js buildFireGrid
const cellOf = (x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return c < 0 || r < 0 || c >= W || r >= H ? -1 : r * W + c; };
const local = ([lon, lat]) => { const [e, n] = toUTM(lon, lat); return [e - x0, n - y0]; };

// ---- 1. City footprints, NEAR_DIST and geometry only ----
const idj = await get(`${LAYER}/query`, { where: '1=1', returnIdsOnly: 'true', f: 'json' });
const OID = idj.objectIdFieldName, ids = idj.objectIds.sort((a, b) => a - b); // OBJECTID_1 on this layer
const feats = [];
for (let i = 0; i < ids.length; i += 500) {
  const lo = ids[i], hi = ids[Math.min(ids.length, i + 500) - 1];
  const j = await get(`${LAYER}/query`, { where: `${OID} >= ${lo} AND ${OID} <= ${hi}`, outFields: 'NEAR_DIST', returnGeometry: 'true', outSR: '4326', f: 'json' });
  for (const f of j.features) if (f.geometry?.rings) feats.push({ d: f.attributes.NEAR_DIST, rings: f.geometry.rings.map(r => r.map(local)) });
}
if (feats.length !== ids.length) throw new Error(`asked for ${ids.length} footprints, got ${feats.length} with geometry`);

function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function centroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k; }
  return a ? [cx / (3 * a), cy / (3 * a)] : r[0];
}
for (const f of feats) {
  // outer ring = largest; area = sum of signed rings (holes subtract)
  f.outer = f.rings.reduce((m, r) => Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m);
  f.area = Math.abs(f.rings.reduce((s, r) => s + ringArea(r), 0));
  f.c = centroid(f.outer); f.bb = bbox([f.outer]);
}

// ---- 2. Measured gap to the nearest other footprint (meters), for every footprint ----
// NEAR_DIST is not in ground feet: measured gaps run 0.2404 m per NEAR_DIST unit against 0.3048 for
// feet, a factor of 0.789 = cos(37.87°), the Web Mercator scale at Berkeley (SOURCE_NOTES PH10). So
// the bands below use the measured gap; the City's NEAR_DIST bands are kept in meta for comparison.
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
  const u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy);
}
function ringGap(A, B) { // vertex-to-edge both ways; 0 if one ring's vertex lies inside the other
  let m = Infinity;
  for (const p of A) { if (inPoly(p[0], p[1], [B])) return 0; for (let i = 1; i < B.length; i++) m = Math.min(m, segDist(p, B[i - 1], B[i])); }
  for (const p of B) { if (inPoly(p[0], p[1], [A])) return 0; for (let i = 1; i < A.length; i++) m = Math.min(m, segDist(p, A[i - 1], A[i])); }
  return m;
}
const SEARCH = 60, G = 60, idx = new Map(); // a gap over 60 m counts as "50 ft or more" either way
const key = (i, j) => `${i},${j}`;
feats.forEach((f, n) => { for (let i = Math.floor(f.bb[0] / G); i <= Math.floor(f.bb[2] / G); i++) for (let j = Math.floor(f.bb[1] / G); j <= Math.floor(f.bb[3] / G); j++) { const k = key(i, j); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(n); } });
const ratios = [];
feats.forEach((f, n) => {
  const seen = new Set(); let g = Infinity;
  for (let i = Math.floor((f.bb[0] - SEARCH) / G); i <= Math.floor((f.bb[2] + SEARCH) / G); i++) for (let j = Math.floor((f.bb[1] - SEARCH) / G); j <= Math.floor((f.bb[3] + SEARCH) / G); j++) for (const m of idx.get(key(i, j)) || []) {
    if (m === n || seen.has(m)) continue; seen.add(m);
    const o = feats[m];
    if (o.bb[0] > f.bb[2] + SEARCH || o.bb[2] < f.bb[0] - SEARCH || o.bb[1] > f.bb[3] + SEARCH || o.bb[3] < f.bb[1] - SEARCH) continue;
    g = Math.min(g, ringGap(f.outer, o.outer));
  }
  f.gapM = g;
  if (f.d >= 10 && g > 0 && g < Infinity) ratios.push(g / f.d); // gaps of a few feet are dominated by digitizing
});
ratios.sort((a, b) => a - b);
const q = p => +ratios[Math.floor(p * (ratios.length - 1))].toFixed(4);
const unitsCheck = { sample: ratios.length, medianMetersPerUnit: q(0.5), p10: q(0.1), p25: q(0.25), p75: q(0.75), p90: q(0.9), feetWouldBe: 0.3048, webMercatorFeetAtBerkeley: +(0.3048 * Math.cos(37.87 * Math.PI / 180)).toFixed(4) };

const FT = 0.3048, band = m => m < 25 * FT ? 1 : m < 50 * FT ? 2 : 3;
const cells = new Map(); // cell -> [structures, under 25 ft, 25–50 ft, 50 ft or more, footprint m²]
let outside = 0; const cityBands = [0, 0, 0, 0], measuredBands = [0, 0, 0, 0];
for (const f of feats) {
  cityBands[f.d < 25 ? 1 : f.d < 50 ? 2 : 3]++; measuredBands[band(f.gapM)]++;
  const c = cellOf(...f.c);
  if (c < 0) { outside++; continue; }
  const t = cells.get(c) || [0, 0, 0, 0, 0];
  t[0]++; t[band(f.gapM)]++; t[4] += f.area;
  cells.set(c, t);
}
const gaps = feats.map(f => f.gapM / FT).sort((a, b) => a - b);
const gapFt = p => +gaps[Math.floor(p * (gaps.length - 1))].toFixed(1);

// ---- 3. Census housing units outside Fire Zones 2–3 ----
const fz23 = layers.fireZones.filter(z => z.zone >= 2).map(z => ({ ...z, bb: bbox(z.rings) }));
const blocks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/census/blocks-2020.json'), 'utf8')).features.map(f => f.attributes);
const hu = new Map(); let huIn = 0, huOut = 0, huSkipped = 0;
for (const b of blocks) {
  if (!b.HU100) continue;
  const [x, y] = local([+b.INTPTLON, +b.INTPTLAT]);
  if (fz23.some(z => inBB(z.bb, x, y) && inPoly(x, y, z.rings))) { huSkipped += b.HU100; continue; }
  const c = cellOf(x, y);
  if (c < 0) { huOut += b.HU100; continue; }
  hu.set(c, (hu.get(c) || 0) + b.HU100); huIn += b.HU100;
}

const sum = (m, k) => [...m.values()].reduce((s, t) => s + (k == null ? t : t[k]), 0);
const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), tool: 'tools/build-structures.mjs', cell: CELL, W, H,
    note: 'Counts per 30 m fire cell (index r * W + c, r from the south edge; js/fire.js cellOf). Exposure context only: not ignition, not loss. No footprints, addresses or parcel data are stored.',
    sources: {
      structures: 'City of Berkeley ArcGIS Online, Distance_between_structures_in_Fire_Zones_2_and_3_WFL1 layer 3 (edited 2023-09-13), fields NEAR_DIST and geometry only; counted at footprint centroids; gaps measured from the geometry (SOURCE_NOTES PH1, PH10)',
      housingUnits: 'US Census 2020 blocks, HU100 at interior points (data/raw/census/blocks-2020.json), blocks outside Fire Zones 2–3 only (SOURCE_NOTES PH10)',
    },
    provenance: { structures: 'sourced (City footprints), counted per cell: derived', bands: 'derived: gap to the nearest footprint measured from the City geometry, in the NIST bands the City map uses (under 25 ft, 25–50 ft, 50 ft or more)', housingUnits: 'sourced (Census), placed at block interior points: derived' },
    totals: {
      structures: feats.length - outside, structuresOutsideGrid: outside,
      under25ft: sum(cells, 1), from25to50ft: sum(cells, 2), atLeast50ft: sum(cells, 3),
      cityNearDistBands: { under25: cityBands[1], from25to50: cityBands[2], atLeast50: cityBands[3] },
      measuredGapFt: { p10: gapFt(0.1), median: gapFt(0.5), p90: gapFt(0.9), touchingOrOverlapping: feats.filter(f => f.gapM === 0).length },
      // Structures under each distance, by the City's NEAR_DIST and by the measured gap (ISSUES.md I1).
      underFt: Object.fromEntries([5, 10, 20, 25, 30, 50, 100].map(ft => [ft, { city: feats.filter(f => f.d < ft).length, measured: feats.filter(f => f.gapM < ft * FT).length }])),
      footprintM2: Math.round(sum(cells, 4)),
      housingUnitsOutsideFZ23: huIn, housingUnitsOutsideGrid: huOut, housingUnitsInFZ23NotUsed: huSkipped,
    },
    nearDistUnitsCheck: unitsCheck,
  },
  // [cell, structures, under 25 ft, 25–50 ft, 50 ft or more, footprint m²]
  structures: [...cells].sort((a, b) => a[0] - b[0]).map(([c, t]) => [c, t[0], t[1], t[2], t[3], Math.round(t[4])]),
  // [cell, housing units]
  housingUnits: [...hu].sort((a, b) => a[0] - b[0]),
};
fs.writeFileSync(path.join(ROOT, 'data/model/structures.json'), JSON.stringify(out));
console.log(JSON.stringify(out.meta.totals, null, 1));
console.log('NEAR_DIST units check:', unitsCheck);
console.log(`cells with structures: ${cells.size}; cells with housing units: ${hu.size}`);
