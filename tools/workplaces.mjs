#!/usr/bin/env node
// Workplaces, off-street parking and schools for the opt-in scenario setting "Weekday non-resident placement:
// by workplace" (js/sim.js workplaceAreas). Writes data/model/workplaces.json and prints the comparisons with the
// 2025 Evacuation Time Study that docs/weekday-placement.md reports.
//
//   node tools/workplaces.mjs
//
// Inputs (see the retrieved.txt or .retrieved file next to each):
//   data/raw/lodes/wac-od-2023-model-area.csv   LEHD LODES8 2023 jobs by workplace block (SOURCE_NOTES WP1, WP2)
//   data/raw/osm/parking.json                   OSM amenity=parking (WP5)
//   data/raw/osm/parking-campus-geom.json       their footprints near campus and the Lab, for capacity where untagged
//   data/raw/cde/public-schools-model-area.csv  CDE public schools and 2025-26 enrollment (WP8)
//   data/raw/cde/private-schools-by-district.csv
//   data/raw/docs/ets.txt                       Time Study Table 3-5 and Table C-5 (employees by area and zone)
// Points are stored in the network's local meters, not as edge ids, so a network rebuild does not stale them.
// Schools are stored as enrollment by evacuation zone only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const net = JSON.parse(rd('data/model/network.json')), layers = JSON.parse(rd('data/model/layers.json'));
const A = JSON.parse(rd('data/assumptions.json'));
const O = net.meta.origin;
const P = ([lon, lat]) => { const [x, y] = toUTM(lon, lat); return [+(x - O[0]).toFixed(1), +(y - O[1]).toFixed(1)]; };
const csv = p => { const [h, ...rows] = rd(p).trim().split(/\r?\n/); const k = h.split(','); return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [k[i], v]))); };

// geometry helpers (same rules as js/fire.js inPoly)
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, rings) => rings.reduce((c, r) => inRing(x, y, r) ? !c : c, false);
const zoneOf = ([x, y]) => layers.evacZones.find(z => inPoly(x, y, z.rings));
const hood = n => layers.neighborhoods.find(h => h.name === n);
const inHood = (pt, names) => names.some(n => { const h = hood(n); return h && inPoly(pt[0], pt[1], h.rings); });
const fireZone = ([x, y]) => layers.fireZones.filter(f => inPoly(x, y, f.rings)).reduce((m, f) => Math.max(m, f.zone), 1);
const inCity = ([x, y]) => layers.cityBoundary.some(c => inPoly(x, y, c.rings));
const campus = P(A.nonResident.points.campus);
// The model's area rule (js/sim.js nonResidentAreas) applied to a point instead of a street
const areaOf = pt => { const z = zoneOf(pt)?.id || ''; if (z.startsWith('LBL')) return 'lbnl'; if (inHood(pt, ['University of California Berkeley'])) return 'uc';
  if (inHood(pt, A.nonResident.westNeighborhoods)) return 'west'; if (fireZone(pt) >= 2) return pt[1] > campus[1] ? 'northHills' : 'southHills'; return 'flats'; };

const params = { walkM: 800, snapM: 300, ucCampusBlockMinEducJobs: 5000, ucSpacesPublished: 5500, surfaceM2PerSpace: 30 };

// ---- 1. LODES jobs (Berkeley workplace blocks) ----
const blocks = csv('data/raw/lodes/wac-od-2023-model-area.csv');
const berk = blocks.filter(b => b.place === '0606000');
const ucBlocks = berk.filter(b => +b.jobs_educ >= params.ucCampusBlockMinEducJobs);
const jobs = [], byArea = {}, byStudyZone = {};
for (const b of berk) {
  const pt = P([+b.lon, +b.lat]), inb = +b.od_main_home_outside_place, uc = ucBlocks.includes(b);
  const a = uc ? 'uc (campus block)' : areaOf(pt);
  (byArea[a] ??= { blocks: 0, jobs: 0, inbound: 0 }); byArea[a].blocks++; byArea[a].jobs += +b.jobs; byArea[a].inbound += inb;
  const zid = zoneOf(pt)?.zoneId?.replace(/^US-CA-X..-/, '') || 'none';
  (byStudyZone[zid] ??= { jobs: 0, inbound: 0 }); byStudyZone[zid].jobs += +b.jobs; byStudyZone[zid].inbound += inb;
  if (!uc && inb > 0) jobs.push([...pt, inb]);
}
const tot = berk.reduce((s, b) => s + +b.jobs, 0), totOD = berk.reduce((s, b) => s + +b.od_main_jobs, 0), totIn = berk.reduce((s, b) => s + +b.od_main_home_outside_place, 0);

// Time Study Table 3-5 (by area) and Table C-5 (major employers by study zone)
const ets = rd('data/raw/docs/ets.txt').split('\n');
const c5 = {}; let on = false;
for (const l of ets) {
  if (/Table C-5\. Major Employers3/.test(l)) on = true; else if (on && /Table C-6\./.test(l)) break;
  const m = on && l.match(/^\s+(Berkeley Flats|North Berkeley Hills|South Berkeley Hills|West Berkeley|UC Berkeley|Lawrence Berkeley National Lab)\s+(BER-E\d{3}|LBL Zones)\b.*?\s([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/);
  if (m) { const z = m[2] === 'LBL Zones' ? 'LBL' : m[2]; (c5[z] ??= { area: m[1], employees: 0, vehicles: 0 }); c5[z].employees += +m[3].replace(/,/g, ''); c5[z].vehicles += +m[5].replace(/,/g, ''); }
}
const t35 = { flats: [5553, 6059], northHills: [0, 853], southHills: [172, 103], west: [5035, 2831], uc: [11553, 3563], lbnl: [3028, 1847] };

// ---- 2. off-street parking (OSM) ----
const osm = JSON.parse(rd('data/raw/osm/parking.json'));
// Footprints near campus and the Lab (parking-campus-geom.json: ways with their nodes)
const geo = JSON.parse(rd('data/raw/osm/parking-campus-geom.json')).elements;
const nodeLL = new Map(geo.filter(e => e.type === 'node').map(e => [e.id, [e.lon, e.lat]]));
const wayRing = new Map(geo.filter(e => e.type === 'way').map(e => [e.id, e.nodes.map(n => nodeLL.get(n)).filter(Boolean)]));
const ringArea = g => { let s = 0; for (let i = 0, j = g.length - 1; i < g.length; j = i++) s += (g[j][0] + g[i][0]) * (g[j][1] - g[i][1]); return Math.abs(s / 2); };
const UC_RE = /\b(u\s?c|university of california|cal athletics|clark kerr|lawrence hall of science)\b/i;
const parking = [], unknownCap = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null) || (e.geometry ? { lat: e.geometry.reduce((s, q) => s + q.lat, 0) / e.geometry.length, lon: e.geometry.reduce((s, q) => s + q.lon, 0) / e.geometry.length } : null);
  if (!c) continue;
  const pt = P([c.lon, c.lat]), z = zoneOf(pt)?.id || '';
  const ucTag = UC_RE.test(`${t.operator || ''} ${t.name || ''} ${t.owner || ''}`);
  const kind = z.startsWith('LBL') ? 'lbnl' : (ucTag || (inHood(pt, ['University of California Berkeley']) && t.access !== 'customers')) ? 'uc' : /city of berkeley/i.test(t.operator || '') ? 'city' : null;
  if (!kind) continue;
  let cap = +t.capacity || 0, capSrc = 'osm:capacity';
  if (!cap && e.type === 'way' && wayRing.get(e.id)?.length >= 3) { const ring = wayRing.get(e.id).map(P); const lv = t.parking === 'multi-storey' ? +(t['building:levels'] || t['parking:levels'] || 2) : 1; cap = Math.round(ringArea(ring) * lv / params.surfaceM2PerSpace); capSrc = `footprint/${params.surfaceM2PerSpace}m2${lv > 1 ? `x${lv} levels` : ''}`; }
  if (!cap) { unknownCap.push({ kind, x: pt[0], y: pt[1] }); continue; }
  parking.push({ kind, x: pt[0], y: pt[1], cap, capSrc, name: t.name || null, type: t.parking || null, access: t.access || null });
}
const sum = k => parking.filter(f => f.kind === k).reduce((s, f) => s + f.cap, 0);
const ucOSM = sum('uc');
// Scale UC facilities to UC's published total (pt.berkeley.edu: "5,500+" spaces; SOURCE_NOTES WP6): model rule
for (const f of parking) if (f.kind === 'uc') { f.osmCap = f.cap; f.cap = +(f.cap * params.ucSpacesPublished / ucOSM).toFixed(1); }

// ---- 3. schools by evacuation zone ----
const pubs = csv('data/raw/cde/public-schools-model-area.csv');
const schools = {};
for (const s of pubs) { const z = zoneOf(P([+s.lon, +s.lat]))?.id || 'none'; (schools[z] ??= { publicSchools: 0, enrollment: 0 }); schools[z].publicSchools++; schools[z].enrollment += +s.enrollment_2025_26 || 0; }
const privateByDistrict = csv('data/raw/cde/private-schools-by-district.csv');

const out = {
  meta: { built: new Date().toISOString().slice(0, 10), note: 'Inputs for the opt-in "by workplace" non-resident placement (js/sim.js workplaceAreas). Points in the network\'s local meters. SOURCE_NOTES WP1-WP12.',
    sources: ['LEHD LODES8 2023 WAC and OD main, California (data/raw/lodes/retrieved.txt)', 'OpenStreetMap amenity=parking (data/raw/osm/parking.retrieved)', 'UC Berkeley Parking & Transportation, pt.berkeley.edu/parking-0 ("5,500+" spaces, read 2026-11-03)', 'CDE public school directory and 2025-26 Census Day enrollment; 2025-26 private school affidavits (data/raw/cde/retrieved.txt)'] },
  params,
  jobs, // [x, y, jobs held by people living outside Berkeley (LODES OD main)] per Berkeley workplace block, UC campus block excluded
  parking: parking.map(({ kind, x, y, cap, capSrc, osmCap, name, type }) => ({ kind, x, y, cap, capSrc, ...(osmCap != null ? { osmCap } : {}), name, type })),
  schoolsByZone: schools, privateSchoolsByDistrict: privateByDistrict,
  checks: { lodesBerkeley: { blocks: berk.length, jobs: tot, odMainJobs: totOD, homeOutsideBerkeley: totIn, shareOutside: +(totIn / totOD).toFixed(3) }, lodesByArea: byArea, timeStudyTable35: t35, timeStudyC5ByZone: c5, lodesByStudyZone: byStudyZone,
    parking: { ucOSMSpaces: ucOSM, ucFacilities: parking.filter(f => f.kind === 'uc').length, lbnlSpaces: sum('lbnl'), lbnlFacilities: parking.filter(f => f.kind === 'lbnl').length, citySpaces: sum('city'), unknownCapacity: unknownCap.length } },
};
fs.writeFileSync(path.join(ROOT, 'data/model/workplaces.json'), JSON.stringify(out));

// ---- report ----
const f = n => Math.round(n).toLocaleString('en-US');
console.log(`LODES 2023, Berkeley workplace blocks: ${berk.length} blocks, ${f(tot)} jobs; OD main ${f(totOD)}, of which home outside Berkeley ${f(totIn)} (${(100 * totIn / totOD).toFixed(1)}%; Time Study 84.4%)`);
console.log(`UC campus block(s) (≥ ${params.ucCampusBlockMinEducJobs} education jobs): ${ucBlocks.map(b => `${b.block} ${f(+b.jobs)} jobs`).join('; ')}`);
console.log('\nArea           Study employees  Study vehicles   LODES jobs  LODES in-commuters  ratio in-commuters/study employees');
for (const a of ['flats', 'northHills', 'southHills', 'west', 'uc', 'lbnl']) {
  const L = a === 'uc' ? { jobs: (byArea.uc?.jobs || 0) + (byArea['uc (campus block)']?.jobs || 0), inbound: (byArea.uc?.inbound || 0) + (byArea['uc (campus block)']?.inbound || 0) } : byArea[a] || { jobs: 0, inbound: 0 };
  console.log(`${a.padEnd(14)} ${f(t35[a][0]).padStart(15)} ${f(t35[a][1]).padStart(15)} ${f(L.jobs).padStart(12)} ${f(L.inbound).padStart(19)}   ${t35[a][0] ? (L.inbound / t35[a][0]).toFixed(2) : '—'}`);
}
console.log('\nStudy zone   Table C-5 employees (major employers)  LODES in-commuters (all employers)');
const zs = [...new Set([...Object.keys(c5), ...Object.keys(byStudyZone)])].filter(z => z.startsWith('BER') || z === 'LBL').sort();
for (const z of zs) { const lz = z === 'LBL' ? Object.entries(byStudyZone).filter(([k]) => k.startsWith('LBL')).reduce((s, [, v]) => s + v.inbound, 0) : byStudyZone[z]?.inbound || 0; if ((c5[z]?.employees || 0) || lz >= 300) console.log(`${z.padEnd(12)} ${f(c5[z]?.employees || 0).padStart(8)}  ${f(lz).padStart(8)}`); }
console.log(`\nOSM parking: UC ${out.checks.parking.ucFacilities} facilities, ${f(ucOSM)} spaces in OSM, scaled to ${f(params.ucSpacesPublished)}; LBNL ${out.checks.parking.lbnlFacilities} facilities, ${f(sum('lbnl'))} spaces; City garages ${f(sum('city'))}; ${unknownCap.length} UC/LBNL/City facilities with no capacity and no footprint, left out`);
console.log('Public schools by zone (enrollment 2025-26):', Object.entries(schools).map(([z, v]) => `${z} ${v.enrollment}`).join(', '));
