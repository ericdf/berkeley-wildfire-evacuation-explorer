// Like-for-like check: for a seed, Plan A and Plan B must see the same households. Builds the
// run (no steps) with DEFAULT_PLAN and with each Simple-view question's Plan A and Plan B, and
// checks that every household that does not leave early has the same kind, vehicles, commuter,
// mobilization delay (departure minus its notice time) and ride, that non-resident counts match,
// and that the shared random stream is in the same state when the run starts.
// An Expert-view plan that orders more zones (alertKm, hillsOrderMin) is checked on households
// whose zone has the same status in both plans.
// With maximum future growth, the same checks run for R0 none against each R0 area and for the
// leave-early plans; households are matched by identity (today's by index, added units by their
// index among all units), and units R0 bars in one plan are skipped. A last check compares growth
// none with maximum growth on today's households alone (SOURCE_NOTES R6): the same draws and
// non-resident counts, except that a carless household with no neighbor to ride with today may
// ride with an added one. Under R0 that household has no ride when R0 bars every added neighbor
// on its street. A household whose neighbor left early in either plan rides with another one.
// Household mix by place (data/model/demand-by-zone.json, when present) repeats the preset, Expert and
// R0 comparisons with each zone's own persons per household and carless share.
//   node tests/plan-draws.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN, growthUnits, r0Edges } from '../js/sim.js';
import { FIRES, PRESETS } from '../js/presets.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scen = makeScenarios(data);
const SEEDS = [1, 2, 3];
const EXPERT = { ...DEFAULT_PLAN, name: 'Expert: alert 2 km, hills ordered at 30 min', alertKm: 2, hillsOrderMin: 30 };
let failures = 0, checks = 0;

const notice = (sim, h) => { const z = sim.hh.zone[h], k = sim.hh.kind[h]; return k === 1 ? sim.orderT[z] : k === 2 ? sim.warnT[z] : sim.firstOrderT; };
const status = (sim, z) => sim.orderT[z] < Infinity ? 1 : sim.warnT[z] < Infinity ? 2 : 0;
// Identity of each household: today's keep their index; an added unit is nBase + its index among all units.
function identities(sim, growth) {
  const nBase = sim.hh.n - sim.growth.built, id = Int32Array.from({ length: sim.hh.n }, (_, h) => h);
  const units = growthUnits(data, growth, sim.seed), r0 = r0Edges(data, sim.plan.r0);
  let h = nBase;
  units.forEach((eid, k) => { if (!(r0 && r0.has(eid))) id[h++] = nBase + k; });
  const at = new Map(); id.forEach((v, i) => at.set(v, i));
  return { nBase, id, at };
}

// todayOnly: compare today's households only (growth none vs growth), allowing a ride with an added unit
// where there was none.
function compare(label, a, b, { sameZoneOnly = false, growth = 'none', todayOnly = false } = {}) {
  const H = a.hh, K = b.hh, bad = [];
  const ia = identities(a, todayOnly ? 'none' : growth), ib = identities(b, growth);
  if (ia.nBase !== ib.nBase) bad.push(`today's household count ${ia.nBase} vs ${ib.nBase}`);
  if (!todayOnly && a.growth.units !== b.growth.units) bad.push(`unit count ${a.growth.units} vs ${b.growth.units}`);
  let compared = 0, rerouted = 0, toAdded = 0, barred = 0, warnSplit = 0;
  for (let h = 0; h < H.n && bad.length < 5; h++) {
    const j = ib.at.get(ia.id[h]);
    if (j == null) continue; // a unit R0 bars in Plan B
    if (H.early[h] || K.early[j]) continue;
    if (H.veh[h] !== K.veh[j] || H.edge[h] !== K.edge[j]) { bad.push(`hh ${ia.id[h]}: vehicles or street differ`); continue; }
    if (sameZoneOnly && status(a, H.zone[h]) !== status(b, K.zone[j])) continue;
    compared++;
    // A zone warned before another city orders it (js/sim.js otherCityOrders): a household that
    // heeds the warning leaves on it (kind 2) in the plan whose warning comes first, and on the
    // order (kind 1) in a plan whose warning would come after the order. Same draws either way.
    const warnedFirst = (s, i) => s.hh.kind[i] === 2 && s.orderT[s.hh.zone[i]] < Infinity;
    if (H.kind[h] !== K.kind[j] && !(H.kind[h] + K.kind[j] === 3 && (warnedFirst(a, h) || warnedFirst(b, j)))) { bad.push(`hh ${ia.id[h]}: kind ${H.kind[h]} vs ${K.kind[j]}`); continue; }
    if (H.kind[h] !== K.kind[j]) warnSplit++;
    if (!H.kind[h]) continue;
    // with different notice times a commuter can reach home before the run ends in one plan only
    if (H.commuter[h] !== K.commuter[j] && !(sameZoneOnly && notice(a, h) !== notice(b, j))) bad.push(`hh ${ia.id[h]}: commuter ${H.commuter[h]} vs ${K.commuter[j]}`);
    const da = H.depart[h] - notice(a, h), db = K.depart[j] - notice(b, j);
    if (Math.abs(da - db) > 1e-6) bad.push(`hh ${ia.id[h]}: mobilization ${da.toFixed(1)} vs ${db.toFixed(1)} s`);
    if (sameZoneOnly) continue; // more ordered neighbors can change who gives a ride
    const ra = H.ride[h], rb = K.ride[j];
    const ra2 = ra >= 0 ? ib.at.get(ia.id[ra]) ?? -2 : -1; // Plan A's ride, as a household of Plan B
    if (ra2 === rb) continue;
    if (todayOnly && ra < 0 && rb >= ib.nBase) { toAdded++; continue; } // rides with an added unit
    const rb2 = rb >= 0 ? ia.at.get(ib.id[rb]) ?? -2 : -1; // Plan B's ride, as a household of Plan A
    // the neighbor one plan picks left early in the other: each plan's ride is a neighbor still there, or none is left
    if ((ra2 >= 0 && K.early[ra2]) || (rb2 >= 0 && H.early[rb2])) {
      if ((rb < 0 || (K.edge[rb] === K.edge[j] && !K.early[rb])) && (ra < 0 || (H.edge[ra] === H.edge[h] && !H.early[ra]))) { rerouted++; continue; }
    }
    if (ra2 === -2 && rb < 0) { barred++; continue; } // Plan A's ride is an added unit that R0 bars in Plan B
    bad.push(`hh ${ia.id[h]}: ride ${ra < 0 ? ra : ia.id[ra]} vs ${rb < 0 ? rb : ib.id[rb]}`);
  }
  for (const g of new Set([...Object.keys(a.nonResident), ...Object.keys(b.nonResident)]))
    if (!sameZoneOnly && a.nonResident[g] !== b.nonResident[g]) bad.push(`non-resident ${g}: ${a.nonResident[g]} vs ${b.nonResident[g]}`);
  const ua = a.rand(), ub = b.rand();
  if (ua !== ub) bad.push(`shared stream differs after setup (${ua} vs ${ub})`);
  checks++;
  if (bad.length) { failures++; console.log(`FAIL ${label}\n  ${bad.join('\n  ')}`); }
  else console.log(`ok   ${label}: ${compared.toLocaleString()} households compared${rerouted ? `, ${rerouted} rides moved to another neighbor (the other plan's left early)` : ''}${barred ? `, ${barred} without the added neighbor R0 bars` : ''}${toAdded ? `, ${toAdded} ride with an added unit (no neighbor today)` : ''}${warnSplit ? `, ${warnSplit} leave on a warning in one plan and on another city's order in the other` : ''}`);
}

const LE = PRESETS.find(P => P.A.earlyShare === 0 && P.B.earlyShare > 0);
const R0S = ['lez', 'access', 'fz23'];
for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id);
  for (const seed of SEEDS) {
    const fire = runFire(grid, sc, SEVERITY.central, seed);
    const build = (plan, tk, growth = 'none', mix, vis) => new Evacuation(data, grid, fire, sc, 'central', plan, seed, TIME_OF_DAY[tk], { growth, ...(mix ? { householdMix: mix } : {}), ...(vis ? { visibility: vis } : {}) });
    for (const P of PRESETS) {
      const tk = P.tods?.B ?? P.tod;
      compare(`${F.id} seed ${seed} ${P.id}: DEFAULT_PLAN vs B`, build(DEFAULT_PLAN, tk), build(P.B, tk));
      compare(`${F.id} seed ${seed} ${P.id}: A vs B`, build(P.A, tk), build(P.B, tk));
    }
    compare(`${F.id} seed ${seed} ${EXPERT.name}`, build(DEFAULT_PLAN, 'S6'), build(EXPERT, 'S6'), { sameZoneOnly: true });
    // Enforcement of signs and daylighting changes parked cars only, never the household draws (SOURCE_NOTES PH15).
    for (const tk of ['S1', 'S6']) compare(`${F.id} seed ${seed} enforce signs and daylighting ${tk}`, build(DEFAULT_PLAN, tk), build({ ...DEFAULT_PLAN, parkingEnforce: 'both' }, tk));
    // Visibility (scenario setting, SOURCE_NOTES VZ1–VZ6): poor visibility changes speeds and capacities, never the draws,
    // and Plan A and Plan B still see the same households under it.
    for (const tk of ['S1', 'S6']) compare(`${F.id} seed ${seed} visibility clear vs poor ${tk}`, build(DEFAULT_PLAN, tk), build(DEFAULT_PLAN, tk, 'none', undefined, 'poor'));
    for (const P of PRESETS) { const tq = P.tods?.B ?? P.tod; compare(`${F.id} seed ${seed} visibility poor ${P.id}: A vs B`, build(P.A, tq, 'none', undefined, 'poor'), build(P.B, tq, 'none', undefined, 'poor')); }
    // maximum growth: R0 and leave early, Plan A vs Plan B
    const tk = LE.tods?.B ?? LE.tod, G = 'max';
    const base = build(DEFAULT_PLAN, tk, G);
    for (const r0 of R0S) compare(`${F.id} seed ${seed} growth max: R0 none vs ${r0}`, build(DEFAULT_PLAN, tk, G), build({ ...DEFAULT_PLAN, r0 }, tk, G), { growth: G });
    compare(`${F.id} seed ${seed} growth max ${LE.id}: A vs B`, build(LE.A, tk, G), build(LE.B, tk, G), { growth: G });
    compare(`${F.id} seed ${seed} growth max ${LE.id}: A vs B with R0 lez`, build(LE.A, tk, G), build({ ...LE.B, r0: 'lez' }, tk, G), { growth: G });
    compare(`${F.id} seed ${seed} growth max ${LE.id}: B lez-only vs B with R0 access`, build({ ...LE.B, earlyZones: 'lez' }, tk, G), build({ ...LE.B, r0: 'access' }, tk, G), { growth: G });
    compare(`${F.id} seed ${seed} growth max, ${EXPERT.name}, R0 fz23`, base, build({ ...EXPERT, r0: 'fz23' }, tk, G), { growth: G, sameZoneOnly: true });
    // household mix by place (world setting, SOURCE_NOTES DM8): Plan A and Plan B still see the same households
    if (data.demand) {
      for (const P of PRESETS) { const tq = P.tods?.B ?? P.tod; compare(`${F.id} seed ${seed} mix place ${P.id}: A vs B`, build(P.A, tq, 'none', 'place'), build(P.B, tq, 'none', 'place')); }
      compare(`${F.id} seed ${seed} mix place, ${EXPERT.name}`, build(DEFAULT_PLAN, 'S6', 'none', 'place'), build(EXPERT, 'S6', 'none', 'place'), { sameZoneOnly: true });
      compare(`${F.id} seed ${seed} mix place, growth max, R0 none vs fz23`, build(DEFAULT_PLAN, tk, G, 'place'), build({ ...DEFAULT_PLAN, r0: 'fz23' }, tk, G, 'place'), { growth: G });
    }
    // growth and R0 leave today's households and the shared stream unchanged (R6)
    for (const r0 of ['none', ...R0S]) compare(`${F.id} seed ${seed} growth none vs max, R0 ${r0} (today's households)`, build(DEFAULT_PLAN, tk), build({ ...DEFAULT_PLAN, r0 }, tk, G), { growth: G, todayOnly: true });
  }
}
console.log(`\n${checks - failures}/${checks} comparisons like for like`);
process.exit(failures ? 1 : 0);
