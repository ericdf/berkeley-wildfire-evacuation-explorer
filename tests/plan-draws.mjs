// Like-for-like check: for a seed, Plan A and Plan B must see the same households. Builds the
// run (no steps) with DEFAULT_PLAN and with each Simple-view question's Plan A and Plan B, and
// checks that every household that does not leave early has the same kind, vehicles, commuter,
// mobilization delay (departure minus its notice time) and ride, that non-resident counts match,
// and that the shared random stream is in the same state when the run starts. A household whose
// Plan A neighbor left early in Plan B must ride with another neighbor still there.
// An Expert-view plan that orders more zones (alertKm, hillsOrderMin) is checked on households
// whose zone has the same status in both plans.
//   node tests/plan-draws.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { FIRES, PRESETS } from '../js/presets.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scen = makeScenarios(data);
const SEEDS = [1, 2, 3];
const EXPERT = { ...DEFAULT_PLAN, name: 'Expert: alert 2 km, hills ordered at 30 min', alertKm: 2, hillsOrderMin: 30 };
let failures = 0, checks = 0;

const notice = (sim, h) => { const z = sim.hh.zone[h], k = sim.hh.kind[h]; return k === 1 ? sim.orderT[z] : k === 2 ? sim.warnT[z] : sim.firstOrderT; };
const status = (sim, z) => sim.orderT[z] < Infinity ? 1 : sim.warnT[z] < Infinity ? 2 : 0;

function compare(label, a, b, sameZoneOnly) {
  const H = a.hh, K = b.hh, bad = [];
  if (H.n !== K.n) { bad.push(`household count ${H.n} vs ${K.n}`); }
  let compared = 0, rerouted = 0;
  for (let h = 0; h < Math.min(H.n, K.n) && bad.length < 5; h++) {
    if (H.early[h] || K.early[h]) continue;
    if (H.veh[h] !== K.veh[h] || H.edge[h] !== K.edge[h]) { bad.push(`hh ${h}: vehicles or street differ`); continue; }
    if (sameZoneOnly && status(a, H.zone[h]) !== status(b, K.zone[h])) continue;
    compared++;
    if (H.kind[h] !== K.kind[h]) { bad.push(`hh ${h}: kind ${H.kind[h]} vs ${K.kind[h]}`); continue; }
    if (!H.kind[h]) continue;
    if (H.commuter[h] !== K.commuter[h]) bad.push(`hh ${h}: commuter ${H.commuter[h]} vs ${K.commuter[h]}`);
    const da = H.depart[h] - notice(a, h), db = K.depart[h] - notice(b, h);
    if (Math.abs(da - db) > 1e-6) bad.push(`hh ${h}: mobilization ${da.toFixed(1)} vs ${db.toFixed(1)} s`);
    if (sameZoneOnly) continue; // more ordered neighbors can change who gives a ride
    const ra = H.ride[h], rb = K.ride[h];
    if (ra === rb) continue;
    if (ra >= 0 && K.early[ra] && rb >= 0 && K.edge[rb] === K.edge[h] && !K.early[rb]) { rerouted++; continue; }
    if (ra >= 0 && K.early[ra] && rb < 0) { rerouted++; continue; } // every neighbor with a car left early
    bad.push(`hh ${h}: ride ${ra} vs ${rb}`);
  }
  for (const g of new Set([...Object.keys(a.nonResident), ...Object.keys(b.nonResident)]))
    if (!sameZoneOnly && a.nonResident[g] !== b.nonResident[g]) bad.push(`non-resident ${g}: ${a.nonResident[g]} vs ${b.nonResident[g]}`);
  const ua = a.rand(), ub = b.rand();
  if (ua !== ub) bad.push(`shared stream differs after setup (${ua} vs ${ub})`);
  checks++;
  if (bad.length) { failures++; console.log(`FAIL ${label}\n  ${bad.join('\n  ')}`); }
  else console.log(`ok   ${label}: ${compared.toLocaleString()} households compared${rerouted ? `, ${rerouted} rides moved to another neighbor (Plan A's left early)` : ''}`);
}

for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id);
  for (const seed of SEEDS) {
    const fire = runFire(grid, sc, SEVERITY.central, seed);
    const build = (plan, tk) => new Evacuation(data, grid, fire, sc, 'central', plan, seed, TIME_OF_DAY[tk]);
    for (const P of PRESETS) {
      const tk = P.tods?.B ?? P.tod;
      compare(`${F.id} seed ${seed} ${P.id}: DEFAULT_PLAN vs B`, build(DEFAULT_PLAN, tk), build(P.B, tk));
      compare(`${F.id} seed ${seed} ${P.id}: A vs B`, build(P.A, tk), build(P.B, tk));
    }
    compare(`${F.id} seed ${seed} ${EXPERT.name}`, build(DEFAULT_PLAN, 'S6'), build(EXPERT, 'S6'), true);
  }
}
console.log(`\n${checks - failures}/${checks} comparisons like for like`);
process.exit(failures ? 1 : 0);
