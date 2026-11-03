// Household mix by place: ACS 5-year block-group and tract figures allocated to the Genasys
// evacuation zones through 2020 Census blocks (SOURCE_NOTES DM1–DM9). Writes data/model/demand-by-zone.json,
// read by the simulator's opt-in "Household mix: by place" setting (js/sim.js buildHouseholds) and by
// the reported figures (results panel, Assumptions & limits).
//
// Method (derived):
//   1. Each 2020 block (data/raw/census/blocks-2020.json: POP100, HU100 at the interior point) goes to
//      the zone that contains its interior point (tools/zones.mjs) and to its block group (GEOID
//      characters 1–12) and tract (1–11).
//   2. A block group's ACS counts are split among its blocks in proportion to housing units (household
//      tables: B25044, B25008, B11007) or population (person tables: B01001, B18105, B18101), assuming
//      the block group's rates hold in every block (assumption). Tract tables split the same way.
//      Block groups at the edge of the block file lose the blocks outside it; shares are unaffected
//      because numerator and denominator scale together.
//   3. Zone totals are sums of the block pieces; margins of error (90%) of a sum use the Census
//      approximation sqrt(sum of squared MOEs), and shares use the ACS formulas for a proportion
//      (zero-vehicle, 75+, 65+ alone, ambulatory) or a ratio (persons per household). Range = estimate
//      ± MOE, clipped to [0, 1] for shares. These ranges are approximations; summed MOEs overstate
//      precision where block groups are correlated, and ignore the error of step 2.
//   4. Implied counts (people 75+, people with an ambulatory difficulty, one-person 65+ households)
//      apply the zone's share and range to the population the simulator places in the zone
//      (layers.json popModeled), which is the Genasys estimate where one exists.
// Facility aggregates come from tools/fetch-demand-facilities.mjs (data/raw/facilities/facilities-by-zone.json)
// and emPOWER ZIP counts from data/raw/hhs/empower-zip.json; both are copied in as they are.
//   node tools/build-demand.mjs
import fs from 'node:fs';
import path from 'node:path';
import { zoneLocator, ROOT } from './zones.mjs';
const P = f => path.join(ROOT, f);
const readJSON = f => JSON.parse(fs.readFileSync(P(f), 'utf8'));
const has = f => fs.existsSync(P(f));

const acs = readJSON('data/raw/census/acs-demand.json');
const blocks = readJSON('data/raw/census/blocks-2020.json').features.map(f => ({
  geoid: f.attributes.GEOID, pop: +f.attributes.POP100 || 0, hu: +f.attributes.HU100 || 0,
  lon: +f.attributes.INTPTLON, lat: +f.attributes.INTPTLAT }));
const { zones, locate } = zoneLocator();

// ---- 1. blocks to zones ----
let overlapBlocks = 0, unzonedPop = 0, unzonedHU = 0;
const bgTot = new Map(), trTot = new Map(); // geoid -> { pop, hu } over the block file
const pieces = new Map(); // zone id -> Map(bg -> { pop, hu })
for (const b of blocks) {
  const bg = b.geoid.slice(0, 12), tr = b.geoid.slice(0, 11);
  for (const [M, g] of [[bgTot, bg], [trTot, tr]]) { const t = M.get(g) || { pop: 0, hu: 0 }; t.pop += b.pop; t.hu += b.hu; M.set(g, t); }
  const { id, n } = locate(b.lon, b.lat);
  if (n > 1) overlapBlocks++;
  if (!id) { unzonedPop += b.pop; unzonedHU += b.hu; continue; }
  if (!pieces.has(id)) pieces.set(id, new Map());
  const m = pieces.get(id), t = m.get(bg) || { pop: 0, hu: 0, tracts: new Map() };
  t.pop += b.pop; t.hu += b.hu; m.set(bg, t);
}

// ---- 2. ACS values ----
const E = (geo, t, cols) => cols.reduce((s, c) => s + (geo?.[t]?.e?.[`${t}${String(c).padStart(3, '0')}`] ?? NaN), 0);
const M = (geo, t, cols) => Math.sqrt(cols.reduce((s, c) => s + (geo?.[t]?.m?.[`${t}${String(c).padStart(3, '0')}`] ?? NaN) ** 2, 0));
const colsNamed = (t, re, level = 'blockGroups') => Object.entries(acs[level].columns[t]).filter(([, n]) => re.test(n)).map(([k]) => +k.slice(t.length));
const AMB = colsNamed('B18105', /^With an ambulatory difficulty/, 'tracts');
const DIS = colsNamed('B18101', /^With a disability/, 'tracts');
const AGE75 = [23, 24, 25, 47, 48, 49], AGE65 = [20, 21, 22, 23, 24, 25, 44, 45, 46, 47, 48, 49];
// [numerator cols, denominator cols, table, level, weight]
const Q = {
  zeroVehicle: { t: 'B25044', num: [3, 10], den: [1], level: 'blockGroups', w: 'hu', kind: 'share' },
  personsPerHousehold: { t: ['B25008', 'B25044'], num: [1], den: [1], level: 'blockGroups', w: 'hu', kind: 'ratio' },
  alone65: { t: 'B11007', num: [3], den: [1], level: 'blockGroups', w: 'hu', kind: 'share' },
  age75: { t: 'B01001', num: AGE75, den: [1], level: 'blockGroups', w: 'pop', kind: 'share' },
  age65: { t: 'B01001', num: AGE65, den: [1], level: 'blockGroups', w: 'pop', kind: 'share' },
  ambulatory: { t: 'B18105', num: AMB, den: [1], level: 'tracts', w: 'pop', kind: 'share' },
  disability: { t: 'B18101', num: DIS, den: [1], level: 'tracts', w: 'pop', kind: 'share' },
};

// Sum of allocated counts and their MOE for one zone's pieces (or for any set of pieces)
function total(q, list) { // list: [{ geo id at q.level, w (weight share of that geography) }]
  const [tn, td] = Array.isArray(q.t) ? q.t : [q.t, q.t];
  let x = 0, mx2 = 0, y = 0, my2 = 0, ok = 0;
  for (const { g, w } of list) {
    const geo = acs[q.level].geos[g];
    const xe = E(geo, tn, q.num), ye = E(geo, td, q.den);
    if (!Number.isFinite(xe) || !Number.isFinite(ye) || !w) continue;
    x += w * xe; y += w * ye; mx2 += (w * M(geo, tn, q.num)) ** 2; my2 += (w * M(geo, td, q.den)) ** 2; ok++;
  }
  if (!ok || y <= 0) return null;
  const r = x / y;
  let rad = q.kind === 'share' ? mx2 - r * r * my2 : mx2 + r * r * my2;
  if (rad < 0) rad = mx2 + r * r * my2; // ACS guidance: use the ratio formula when the proportion's is negative
  const moe = Math.sqrt(rad) / y;
  const lo = q.kind === 'share' ? Math.max(0, r - moe) : Math.max(0, r - moe), hi = q.kind === 'share' ? Math.min(1, r + moe) : r + moe;
  const round = v => Math.round(v * 10000) / 10000;
  return { value: round(r), moe: round(moe), range: [round(lo), round(hi)], denominator: Math.round(y), moeDenominator: Math.round(Math.sqrt(my2)) };
}

// weights of each geography in a zone (or a set of zones)
function weights(q, zoneIds) {
  const tot = q.level === 'tracts' ? trTot : bgTot, acc = new Map();
  for (const id of zoneIds) for (const [bg, p] of pieces.get(id) || []) {
    const g = q.level === 'tracts' ? bg.slice(0, 11) : bg;
    acc.set(g, (acc.get(g) || 0) + p[q.w]);
  }
  return [...acc].map(([g, v]) => ({ g, w: tot.get(g)[q.w] ? v / tot.get(g)[q.w] : 0 }));
}

const facilities = has('data/raw/facilities/facilities-by-zone.json') ? readJSON('data/raw/facilities/facilities-by-zone.json') : null;
const empower = has('data/raw/hhs/empower-zip.json') ? readJSON('data/raw/hhs/empower-zip.json') : null;

const out = {};
let zonesWith = 0, fallback = [];
for (const z of zones) {
  const p = pieces.get(z.id), pop = z.popModeled ?? z.pop;
  const hu = p ? [...p.values()].reduce((s, v) => s + v.hu, 0) : 0, bpop = p ? [...p.values()].reduce((s, v) => s + v.pop, 0) : 0;
  const rec = { blockGroups: p ? [...p.keys()].sort() : [], census2020: { population: bpop, housingUnits: hu }, popModeled: pop };
  for (const [k, q] of Object.entries(Q)) rec[k] = hu || bpop ? total(q, weights(q, [z.id])) : null;
  // by-place inputs: need households in the zone's blocks
  rec.usable = !!(hu && rec.zeroVehicle && rec.personsPerHousehold);
  if (rec.usable) zonesWith++; else if (pop > 0) fallback.push(z.id);
  const cnt = (s) => s ? { value: Math.round(s.value * pop), range: s.range.map(v => Math.round(v * pop)) } : null;
  const hhBy = rec.personsPerHousehold ? pop / rec.personsPerHousehold.value : null;
  rec.implied = {
    households: hhBy == null ? null : Math.round(hhBy),
    peopleAge75: cnt(rec.age75), peopleAge65: cnt(rec.age65), peopleAmbulatory: cnt(rec.ambulatory),
    householdsZeroVehicle: rec.zeroVehicle && hhBy != null ? { value: Math.round(rec.zeroVehicle.value * hhBy), range: rec.zeroVehicle.range.map(v => Math.round(v * hhBy)) } : null,
    households65Alone: rec.alone65 && hhBy != null ? { value: Math.round(rec.alone65.value * hhBy), range: rec.alone65.range.map(v => Math.round(v * hhBy)) } : null,
  };
  rec.facilities = facilities?.zones?.[z.id] || null;
  out[z.id] = rec;
}
// aggregates (the same method over every zone of a group)
const group = ids => Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, total(q, weights(q, ids))]));
const ber = zones.filter(z => z.id.startsWith('BER-')).map(z => z.id), all = zones.map(z => z.id);
const A = readJSON('data/assumptions.json').demand;
const doc = {
  _meta: {
    built: new Date().toISOString().slice(0, 10),
    category: 'derived (ACS block-group and tract estimates allocated to zones through 2020 Census blocks; within-block-group uniformity is an assumption)',
    release: acs.blockGroups.release?.name, acsRetrieved: acs.retrieved,
    sources: {
      acs: 'American Community Survey 5-year (ACS 2024 5-year, 2020–2024) via the Census Reporter API: B25044 tenure by vehicles available, B25008 population in occupied housing units, B11007 households with people 65+ by household size, B01001 sex by age (block groups); B18105 ambulatory difficulty, B18101 disability status (tracts). Cache: data/raw/census/acs-demand.json (tools/fetch-demand-acs.mjs).',
      blocks: '2020 Census blocks POP100 and HU100 at interior points (TIGERweb Tracts_Blocks layer 12), data/raw/census/blocks-2020.json.',
      zones: 'Genasys evacuation zones as merged in data/model/layers.json (tools/build-network.mjs).',
      facilities: facilities?._meta || null, empower: empower?._meta || null,
    },
    method: 'See the header of tools/build-demand.mjs. Shares: zero-vehicle = households with no vehicle / households; personsPerHousehold = population in occupied housing units / households; alone65 = one-person households with a person 65+ / households; age75, age65 = share of population; ambulatory, disability = share of the civilian noninstitutionalized population 5+ (ambulatory) or all ages (disability), tract level. range = estimate ± 90% MOE. implied counts apply each share to popModeled.',
    blocks: { total: blocks.length, overlapping: overlapBlocks, unzonedPopulation: unzonedPop, unzonedHousingUnits: unzonedHU },
    zonesUsable: zonesWith, zonesFallback: fallback,
    fallbackRule: `model rule: a zone without households in the 2020 blocks keeps the citywide values (${A.personsPerHousehold} persons per household, ${A.householdsWithoutVehicleShare} without a vehicle)`,
    citywideConstants: { personsPerHousehold: A.personsPerHousehold, householdsWithoutVehicleShare: A.householdsWithoutVehicleShare },
  },
  aggregate: { berkeley: { zones: ber.length, ...group(ber) }, modelArea: { zones: all.length, ...group(all) } },
  empower: empower ? empower.zips : null,
  zones: out,
};
fs.writeFileSync(P('data/model/demand-by-zone.json'), JSON.stringify(doc, null, 1));
const f = s => s ? `${(s.value * 100).toFixed(1)}% [${(s.range[0] * 100).toFixed(1)}–${(s.range[1] * 100).toFixed(1)}]` : '—';
for (const [k, g] of Object.entries(doc.aggregate)) console.log(`${k} (${g.zones} zones): zero-vehicle ${f(g.zeroVehicle)}, persons/household ${g.personsPerHousehold?.value} [${g.personsPerHousehold?.range.join('–')}], 75+ ${f(g.age75)}, 65+ alone ${f(g.alone65)}, ambulatory ${f(g.ambulatory)}`);
console.log(`zones usable ${zonesWith}/${zones.length}; fallback (population but no 2020 households) ${fallback.length}: ${fallback.join(', ')}`);
console.log(`blocks in two zones ${overlapBlocks}; outside every zone: ${unzonedPop} people, ${unzonedHU} housing units`);
console.log(`wrote data/model/demand-by-zone.json (${(fs.statSync(P('data/model/demand-by-zone.json')).size / 1e3).toFixed(0)} kB)`);
