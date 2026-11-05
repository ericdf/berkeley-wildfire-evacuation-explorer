// Reproduces the City's NEAR_DIST field (ISSUES.md I1). For every footprint in the City layer
// "Distance Between Structures" it measures the shortest edge-to-edge gap to any other footprint twice:
// in Web Mercator (EPSG:3857) units divided by 0.3048, and in UTM Zone 10N meters divided by 0.3048 (ground feet).
// If NEAR_DIST was computed in Web Mercator, the first matches it and the second is about cos(37.87°) = 0.789 times it.
// Reads only OBJECTID_1, NEAR_DIST and geometry; writes nothing.
//   node tools/near-dist-check.mjs            (about 15 s after the download)
import { toUTM } from './utm.mjs';

const UA = { 'User-Agent': 'berkeley-wildfire-evacuation-explorer/0.1' };
const LAYER = 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Distance_between_structures_in_Fire_Zones_2_and_3_WFL1/FeatureServer/3/query';
async function get(params) {
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(`${LAYER}?${new URLSearchParams(params)}`, { headers: UA });
      if (r.ok) { const j = await r.json(); if (j.error) throw new Error(j.error.message); return j; }
    } catch (e) { if (k === 3) throw e; }
    await new Promise(res => setTimeout(res, 2000 * 2 ** k));
  }
  throw new Error('query failed');
}

const idj = await get({ where: '1=1', returnIdsOnly: 'true', f: 'json' });
const OID = idj.objectIdFieldName, ids = idj.objectIds.sort((a, b) => a - b);
const F = [];
for (let i = 0; i < ids.length; i += 1000) {
  const where = `${OID} >= ${ids[i]} AND ${OID} <= ${ids[Math.min(ids.length, i + 1000) - 1]}`;
  const geo = await get({ where, outFields: `${OID},NEAR_DIST`, returnGeometry: 'true', outSR: '4326', f: 'json' });
  const wm = await get({ where, outFields: OID, returnGeometry: 'true', outSR: '3857', f: 'json' });
  const wmBy = new Map(wm.features.map(f => [f.attributes[OID], f.geometry?.rings]));
  for (const f of geo.features) {
    const w = wmBy.get(f.attributes[OID]);
    if (!f.geometry?.rings || !w) continue;
    F.push({ id: f.attributes[OID], d: f.attributes.NEAR_DIST, u: f.geometry.rings.map(r => r.map(([x, y]) => toUTM(x, y))), w });
  }
}
if (F.length !== ids.length) throw new Error(`asked for ${ids.length} footprints, got ${F.length} with geometry`);

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const oneWay = (R, S) => { let m = Infinity; for (const r of R) for (const p of r) for (const s of S) for (let i = 1; i < s.length; i++) m = Math.min(m, segDist(p, s[i - 1], s[i])); return m; };
const gap = (R, S) => Math.min(oneWay(R, S), oneWay(S, R)); // 0 only if outlines touch; overlap without touching edges is not tested
const bbox = R => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of R) for (const [x, y] of r) a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; return a; };
for (const f of F) { f.bu = bbox(f.u); f.bw = bbox(f.w); }
function nearest(f, key, bk, reach) {
  let m = Infinity;
  for (const g of F) {
    if (g === f) continue;
    const A = f[bk], B = g[bk];
    if (B[0] > A[2] + reach || B[2] < A[0] - reach || B[1] > A[3] + reach || B[3] < A[1] - reach) continue;
    m = Math.min(m, gap(f[key], g[key]));
  }
  return m;
}

let within005 = 0, within1 = 0, n = 0;
const ratios = [], examples = [];
for (const f of F) {
  const reach = Math.max(f.d * 0.3048 * 1.5, 30); // search beyond the City's stated distance
  const wmFt = nearest(f, 'w', 'bw', reach) / 0.3048, groundFt = nearest(f, 'u', 'bu', reach) / 0.3048;
  if (!isFinite(wmFt)) continue;
  n++;
  const e = Math.abs(wmFt - f.d);
  if (e < 0.05) within005++;
  if (e < 1) within1++;
  if (f.d >= 10) ratios.push(groundFt / f.d);
  if ([62, 85, 665, 3414].includes(f.id)) examples.push({ [OID]: f.id, NEAR_DIST: +f.d.toFixed(2), webMercatorFt: +wmFt.toFixed(2), groundFt: +groundFt.toFixed(2) });
}
ratios.sort((a, b) => a - b);
const q = p => ratios[Math.floor(p * (ratios.length - 1))].toFixed(4);
console.log(`footprints ${F.length}; with a neighbor in reach ${n}`);
console.log(`Web Mercator gap reproduces NEAR_DIST within 0.05 ft: ${within005}; within 1 ft: ${within1}`);
console.log(`ground gap / NEAR_DIST for NEAR_DIST >= 10 (${ratios.length}): p10 ${q(0.1)}, median ${q(0.5)}, p90 ${q(0.9)}; cos(37.87°) = ${Math.cos(37.87 * Math.PI / 180).toFixed(4)}`);
console.table(examples);
