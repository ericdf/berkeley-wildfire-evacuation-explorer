// Screening cost ranges for managed-retreat cases (tools/retreat-sim.mjs). Not an appraisal, policy
// or legal analysis. Public figures and labeled assumptions only; no City requests, no parcel data.
//
// Per bought-out household (one household = one housing unit, synthetic count):
//   acquisition   ACS 2020–2024 5-year B25077 median value of owner-occupied homes in the block group
//                 at the segment's midpoint, low = median − margin of error, high = median + margin
//   relocation    Uniform Relocation Act (49 CFR Part 24) figures. Owner-occupants who sell voluntarily
//                 are not displaced persons under 49 CFR 24.101(b): low $0 assumes every household is one.
//                 High assumes a program pays every household the URA homeowner replacement housing
//                 payment maximum ($41,200, §24.401(b)) plus an 8-room fixed move ($2,690, FHWA schedule
//                 2021, California); a displaced tenant's entitlement (up to $9,570 rental assistance,
//                 §24.402(b), plus a move) lies inside that range. Tenure by block group (ACS B25003) was
//                 not retrievable from Census Reporter on 2026-11-01 (requests timed out).
//   demolition    Delaware County (PA) Demolition Program guidelines: "Residential demolition and site
//                 restoration costs range from $20,000 to $50,000"; high doubled for Bay Area costs and
//                 hillside access (assumption), so $20,000–$100,000 per household.
// Block groups from TIGERweb; values from the Census Reporter API (the Census Bureau API needs a key).
// Cached in data/raw/census/acs-retreat.json; --refresh-acs refetches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromUTM } from './utm.mjs';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'berkeley-wildfire-simulator/0.1';
const CACHE = path.join(R, 'data/raw/census/acs-retreat.json');

export const RATES = {
  relocation: [0, 41200 + 2690], tenantHigh: 9570 + 2690,
  demolition: [20000, 100000],
};
export const SOURCES = {
  acs: { what: 'American Community Survey 2020–2024 5-year, table B25077 (median value of owner-occupied homes), by block group, via the Census Reporter API; block group of each segment\'s midpoint from TIGERweb (Tracts_Blocks layer 1)', url: 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077', category: 'sourced (block-group statistics); applying a median to every home is an assumption' },
  ura401: { what: '49 CFR 24.401(b): "The replacement housing payment for an eligible 90-day homeowner-occupant may not exceed $41,200"', url: 'https://www.law.cornell.edu/cfr/text/49/24.401', category: 'sourced' },
  ura402: { what: '49 CFR 24.402(b): rental assistance for a displaced tenant "not to exceed $9,570"', url: 'https://www.law.cornell.edu/cfr/text/49/24.402', category: 'sourced' },
  ura101: { what: '49 CFR 24.101(b): in a voluntary acquisition (no eminent domain, the owner told so in writing) the relocation provisions apply to tenants who must move, not to the owner-occupant who sells', url: 'https://www.law.cornell.edu/cfr/text/49/24.101', category: 'sourced' },
  move: { what: 'FHWA, Fixed Residential Moving Cost Schedule, Federal Register Vol. 86, No. 141 (July 27, 2021), FR Doc. 2021-15930, California, occupant owns furniture: 4 rooms $1,475, 8 rooms $2,690', url: 'https://www.govinfo.gov/content/pkg/FR-2021-07-27/html/2021-15930.htm', category: 'sourced' },
  demo: { what: 'Delaware County (PA) Office of Housing and Community Development, Demolition Program guidelines (file dated 2025-08): "Residential demolition and site restoration costs range from $20,000 to $50,000." High end doubled for Bay Area costs and hillside access (assumption)', url: 'https://delcopa.gov/sites/default/files/2025-08/DemolitionFundProgramGuidelines.pdf', category: 'sourced low; high is an assumption' },
};

async function fetchRetry(url, tries = 4) {
  let wait = 3000;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); if (r.ok) return r; console.log(`  ${r.status} from ${new URL(url).host}, retrying`); } catch (e) { console.log(`  ${e.message}, retrying`); }
    await new Promise(res => setTimeout(res, wait)); wait *= 2;
  }
  return null;
}

export async function computeCosts({ data, caseList, expHH, refresh = false }) {
  const cache = !refresh && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { retrieved: null, edgeBlockGroup: {}, blockGroups: {} };
  const O = data.net.meta.origin, today = new Date().toISOString().slice(0, 10);
  let fetched = 0, failed = 0;
  const save = () => { cache.retrieved = today; cache.userAgent = UA; fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1)); };
  const edges = [...new Set(caseList.flatMap(c => c.removed))];
  for (const eid of edges) {
    if (cache.edgeBlockGroup[eid] !== undefined) continue;
    const [x, y] = data.edgeMid[eid], [lon, lat] = fromUTM(x + O[0], y + O[1]);
    const q = new URLSearchParams({ geometry: `${lon.toFixed(6)},${lat.toFixed(6)}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID', returnGeometry: 'false', f: 'json' });
    const r = await fetchRetry(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/1/query?${q}`);
    if (!r) { failed++; continue; }
    cache.edgeBlockGroup[eid] = (await r.json()).features?.[0]?.attributes?.GEOID || null; fetched++; save();
  }
  for (const g of new Set(Object.values(cache.edgeBlockGroup).filter(Boolean))) {
    if (cache.blockGroups[g]) continue;
    const r = await fetchRetry(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077&geo_ids=15000US${g}`);
    if (!r) { failed++; continue; }
    const j = await r.json();
    const d = j.data?.[`15000US${g}`] || {};
    cache.blockGroups[g] = { name: j.geography?.[`15000US${g}`]?.name ?? null, release: j.release?.name ?? null,
      median: d.B25077?.estimate?.B25077001 ?? null, moe: d.B25077?.error?.B25077001 ?? null };
    fetched++; save();
  }
  console.log(`ACS: ${fetched} requests${failed ? `, ${failed} failed (rerun to retry)` : ''}, cache retrieved ${cache.retrieved}`);

  // A block group with no median (few owner-occupied homes) takes the household-weighted median of the case's other block groups.
  const TOP = 2000001, costs = {};
  for (const c of caseList) {
    const byBG = new Map();
    for (const e of c.removed) { const g = cache.edgeBlockGroup[e] || 'none'; byBG.set(g, (byBG.get(g) || 0) + expHH.get(e)); }
    const known = [...byBG].filter(([g]) => cache.blockGroups[g]?.median);
    const wHH = known.reduce((s, [, h]) => s + h, 0);
    const fallback = wHH ? { median: known.reduce((s, [g, h]) => s + cache.blockGroups[g].median * h, 0) / wHH, moe: known.reduce((s, [g, h]) => s + (cache.blockGroups[g].moe || 0) * h, 0) / wHH } : { median: null, moe: null };
    let acqLo = 0, acqHi = 0, hhs = 0, topCoded = 0, filled = 0; const bgs = [];
    for (const [g, h] of byBG) {
      const B = cache.blockGroups[g] || {}, has = B.median != null;
      const med = has ? B.median : fallback.median, moe = has ? (B.moe || 0) : fallback.moe;
      if (!has) filled += h; if (has && B.median >= TOP) topCoded += h;
      acqLo += h * Math.max(0, med - moe); acqHi += h * (med + moe); hhs += h;
      bgs.push({ blockGroup: g, name: B.name ?? null, households: Math.round(h * 10) / 10, median: B.median ?? null, moe: B.moe ?? null });
    }
    const relLo = hhs * RATES.relocation[0], relHi = hhs * RATES.relocation[1];
    const demLo = hhs * RATES.demolition[0], demHi = hhs * RATES.demolition[1];
    const rnd = x => Math.round(x / 1e5) * 1e5;
    costs[c.id] = { households: Math.round(hhs * 10) / 10, residents: Math.round(hhs * data.A.demand.personsPerHousehold),
      acquisition: [rnd(acqLo), rnd(acqHi)], relocation: [rnd(relLo), rnd(relHi)], demolition: [rnd(demLo), rnd(demHi)], total: [rnd(acqLo + relLo + demLo), rnd(acqHi + relHi + demHi)],
      perHousehold: [Math.round((acqLo + relLo + demLo) / hhs / 1e3) * 1e3, Math.round((acqHi + relHi + demHi) / hhs / 1e3) * 1e3],
      householdsTopCoded: Math.round(topCoded), householdsNoMedian: Math.round(filled), blockGroups: bgs.sort((a, b) => b.households - a.households) };
  }
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { ...s, retrieved: k === 'acs' ? cache.retrieved : '2026-11-01' }]));
  return { costs, sources: { ...sources, rates: RATES } };
}
