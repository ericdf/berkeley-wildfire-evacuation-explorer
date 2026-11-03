// Phase 3 source check: what the public building and fuel layers hold for the model area.
// Reproduces every figure in docs/design/phase-3.md section 2 (SOURCE_NOTES PH1–PH6).
// Read-only: writes nothing, saves no geometry.
//
//   node tools/phase3-sources.mjs
//
// Privacy: the City structure layer also carries addresses, parcel numbers, owner names,
// owner-occupancy and tract demographics. This script asks the server only for counts and
// statistics on NEAR_DIST and vintage, never for records, fields or geometry.

import { toUTM } from './utm.mjs';
import { readTiff } from './tiff.mjs';
import { bbox, inBB, inPoly } from '../js/fire.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'berkeley-wildfire-simulator/0.1' };
const CITY = 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services';
const STRUCT = `${CITY}/Distance_between_structures_in_Fire_Zones_2_and_3_WFL1/FeatureServer/3/query`;
const RISK = `${CITY}/Alameda_and_Contra_Costa_Wildfire_Hazard_and_Risk_to_Structures_WFL1/FeatureServer/0/query`;
const FBFM40 = 'https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2025/LF2025_FBFM40_CONUS/ImageServer/exportImage';

async function get(url, params, as = 'json') {
  const u = `${url}?${new URLSearchParams(params)}`;
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(u, { headers: UA });
      if (r.ok) {
        if (as === 'buf') return Buffer.from(await r.arrayBuffer());
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j;
      }
    } catch (e) { if (k === 3) throw e; }
    await new Promise(res => setTimeout(res, 2000 * 2 ** k));
  }
  throw new Error(`failed ${u}`);
}
const count = async (url, where, extra = {}) => (await get(url, { where, returnCountOnly: 'true', f: 'json', ...extra })).count;

// Model area in UTM 10N, from data/model/network.json (origin plus terrain extent).
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/network.json'), 'utf8')).meta;
const [x0, y0] = meta.origin;
const env = { xmin: x0, ymin: y0, xmax: x0 + meta.terrain.xmax, ymax: y0 + meta.terrain.ymax, spatialReference: { wkid: 32610 } };

// 1. City structures in Fire Zones 2–3: separation to the nearest structure (NEAR_DIST, feet per
//    the City's map description) in the three NIST bands the City map uses, and vintage.
const total = await count(STRUCT, '1=1');
const bands = {
  'under 25 ft': await count(STRUCT, 'NEAR_DIST < 25'),
  '25 to 50 ft': await count(STRUCT, 'NEAR_DIST >= 25 AND NEAR_DIST < 50'),
  '50 ft or more': await count(STRUCT, 'NEAR_DIST >= 50'),
  '(of which under 10 ft)': await count(STRUCT, 'NEAR_DIST < 10'),
  '(of which 0 ft)': await count(STRUCT, 'NEAR_DIST = 0'),
};
const stat = (await get(STRUCT, { where: '1=1', f: 'json', outStatistics: JSON.stringify(
  ['min', 'max', 'avg'].map(t => ({ statisticType: t, onStatisticField: 'NEAR_DIST', outStatisticFieldName: t }))) })).features[0].attributes;
const vint = (await get(STRUCT, { where: '1=1', f: 'json', groupByFieldsForStatistics: 'vintage', outStatistics: JSON.stringify(
  [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]) })).features.map(f => f.attributes);
console.log(`City structures in Fire Zones 2–3 (Distance_between_structures…, layer 3): ${total}`);
for (const [k, n] of Object.entries(bands)) console.log(`  nearest structure ${k}: ${n} (${(100 * n / total).toFixed(1)}%)`);
console.log(`  NEAR_DIST min ${stat.min}, max ${stat.max.toFixed(1)}, mean ${stat.avg.toFixed(1)}`);
for (const v of vint.sort((a, b) => b.n - a.n)) console.log(`  vintage "${v.vintage.trim() || '(blank)'}": ${v.n} (${(100 * v.n / total).toFixed(1)}%)`);

// 2. Wildfire Risk to Structures (V6), Alameda and Contra Costa: cells touching the model area.
const geo = { geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: '32610', spatialRel: 'esriSpatialRelIntersects' };
const riskCells = await count(RISK, '1=1', geo);
const riskAll = await count(RISK, '1=1');
const byHaz = (await get(RISK, { where: '1=1', f: 'json', ...geo, groupByFieldsForStatistics: 'NEIGHBORHOOD_HAZARD_CLASS',
  outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]) })).features.map(f => f.attributes);
console.log(`\nWildfire Risk to Structures (V6): ${riskAll} cells in the two counties, ${riskCells} touching the model area`);
for (const h of byHaz.sort((a, b) => a.NEIGHBORHOOD_HAZARD_CLASS - b.NEIGHBORHOOD_HAZARD_CLASS)) console.log(`  NEIGHBORHOOD_HAZARD_CLASS ${h.NEIGHBORHOOD_HAZARD_CLASS}: ${h.n}`);

// 3. LANDFIRE 2025 FBFM40 (Scott and Burgan 40 fuel models), 30 m, nearest neighbor over the model area.
const w = Math.round((env.xmax - env.xmin) / 30), h = Math.round((env.ymax - env.ymin) / 30);
const buf = await get(FBFM40, { bbox: `${env.xmin},${env.ymin},${env.xmax},${env.ymax}`, bboxSR: '32610', imageSR: '32610',
  size: `${w},${h}`, format: 'tiff', pixelType: 'S16', interpolation: 'RSP_NearestNeighbor', compression: 'None', f: 'image' }, 'buf');
const img = readTiff(buf);
const NAMES = { 91: 'NB1 urban or developed (non-burnable)', 93: 'NB3 agriculture', 98: 'NB8 open water', 99: 'NB9 bare ground',
  101: 'GR1', 102: 'GR2', 103: 'GR3', 104: 'GR4', 121: 'GS1', 122: 'GS2', 123: 'GS3', 124: 'GS4',
  141: 'SH1', 142: 'SH2', 143: 'SH3', 144: 'SH4', 145: 'SH5', 146: 'SH6', 147: 'SH7', 148: 'SH8', 149: 'SH9',
  161: 'TU1', 162: 'TU2', 163: 'TU3', 164: 'TU4', 165: 'TU5', 181: 'TL1', 182: 'TL2', 183: 'TL3', 184: 'TL4', 185: 'TL5', 186: 'TL6',
  187: 'TL7', 188: 'TL8', 189: 'TL9', 201: 'SB1', 202: 'SB2', 203: 'SB3', 204: 'SB4' };
const tally = new Map();
for (const v of img.data) tally.set(v, (tally.get(v) || 0) + 1);
const n = img.data.length;
const group = c => c < 100 ? 'non-burnable (NB)' : c < 120 ? 'grass (GR)' : c < 140 ? 'grass-shrub (GS)' : c < 160 ? 'shrub (SH)'
  : c < 180 ? 'timber understory (TU)' : c < 200 ? 'timber litter (TL)' : 'slash-blowdown (SB)';
const groups = new Map();
for (const [c, k] of tally) groups.set(group(c), (groups.get(group(c)) || 0) + k);
console.log(`\nLANDFIRE 2025 FBFM40, ${img.width} × ${img.height} cells of 30 m over the model area (${n} cells)`);
for (const [g, k] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`  ${g}: ${k} (${(100 * k / n).toFixed(1)}%)`);
for (const [c, k] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${c} ${NAMES[c] || '?'}: ${k} (${(100 * k / n).toFixed(1)}%)`);

// 4. The same cells by Berkeley Fire Zone 1, 2 or 3 (data/model/layers.json), cell centers; "rest of
//    Berkeley" is city cells in no fire zone (mostly the Bay). Raster row 0 is the north edge.
const layers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/layers.json'), 'utf8'));
const fz = layers.fireZones.map(z => ({ ...z, bb: bbox(z.rings) }));
const city = layers.cityBoundary.map(z => ({ ...z, bb: bbox(z.rings) }));
const H = meta.terrain.ymax;
const byZone = {};
for (let r = 0; r < img.height; r++) for (let c = 0; c < img.width; c++) {
  const x = c * 30 + 15, y = H - (r * 30 + 15);
  const f = fz.find(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
  const zone = f ? `Fire Zone ${f.zone}` : city.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings)) ? 'rest of Berkeley' : null;
  if (!zone) continue;
  const v = img.data[r * img.width + c];
  const t = byZone[zone] ||= { n: 0, nb1: 0, nb: 0 };
  t.n++; if (v === 91) t.nb1++; if (v < 100) t.nb++;
}
console.log('\nLANDFIRE 2025 FBFM40 by Berkeley Fire Zone (30 m cell centers)');
for (const [z, t] of Object.entries(byZone).sort()) console.log(`  ${z}: ${t.n} cells; NB1 urban ${t.nb1} (${(100 * t.nb1 / t.n).toFixed(1)}%), any non-burnable ${t.nb} (${(100 * t.nb / t.n).toFixed(1)}%)`);
