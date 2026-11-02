// Like-for-like check for managed retreat (world.retreat in js/sim.js, used by tools/retreat-sim.mjs):
// removing the households on bought-out street segments must leave every other household and every
// non-resident car exactly as drawn without the buyout. For each Simple-view fire and seeds 1–3, builds
// the run (no steps) without and with a buyout of (a) everything behind the foot of Panoramic Way
// (AC-155) and (b) every 5th hill segment (a scattered set that splits neighbors who share rides),
// and checks: the same households in the same order; every household not bought out has the same
// street, vehicles, kind, leave-early flag, commuter, departure time and ride; bought-out households
// make no trip, give no ride and own no vehicle on the road; non-resident vehicles have the same count,
// departures and streets; and the shared random stream is in the same state when the run starts.
//   node tests/retreat-draws.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN, residentialStreets } from '../js/sim.js';
import { FIRES } from '../js/presets.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scen = makeScenarios(data);
const panoramic = data.access.byId.get('AC-155').memberEdges;
const hill = [...residentialStreets(data).values()].flat().map(([eid]) => eid).filter(eid => data.net.edges[eid].fireZone >= 2).sort((a, b) => a - b);
const SETS = { 'AC-155': panoramic, 'every 5th hill segment': hill.filter((_, i) => i % 5 === 0) };
let failures = 0, checks = 0;

function compare(label, a, b) {
  const H = a.hh, K = b.hh, bad = [];
  if (H.n !== K.n) bad.push(`household count ${H.n} vs ${K.n}`);
  let kept = 0, gone = 0;
  for (let h = 0; h < H.n && bad.length < 5; h++) {
    if (H.edge[h] !== K.edge[h] || H.veh[h] !== K.veh[h]) { bad.push(`hh ${h}: street or vehicles differ`); continue; }
    if (K.gone[h]) {
      gone++;
      if (K.kind[h] || K.ride[h] >= 0 || K.depart[h] < Infinity) bad.push(`hh ${h}: bought out but kind ${K.kind[h]}, ride ${K.ride[h]}, departs ${K.depart[h]}`);
      continue;
    }
    kept++;
    for (const f of ['kind', 'early', 'commuter', 'depart', 'ride'])
      if (H[f][h] !== K[f][h]) bad.push(`hh ${h}: ${f} ${H[f][h]} vs ${K[f][h]}`);
    if (K.ride[h] >= 0 && K.gone[K.ride[h]]) bad.push(`hh ${h}: rides with a bought-out household`);
  }
  for (let i = 0; i < b.v.n; i++) if (b.v.hh[i] >= 0 && K.gone[b.v.hh[i]]) { bad.push(`vehicle ${i} belongs to a bought-out household`); break; }
  const nr = s => { const out = []; for (let i = 0; i < s.v.n; i++) if (s.v.hh[i] < 0) out.push(`${s.v.depart[i]}|${s.v.edge[i]}|${s.v.cls[i]}`); return out.sort().join(','); };
  if (nr(a) !== nr(b)) bad.push('non-resident vehicles differ');
  for (const g of Object.keys(a.nonResident)) if (a.nonResident[g] !== b.nonResident[g]) bad.push(`non-resident ${g}: ${a.nonResident[g]} vs ${b.nonResident[g]}`);
  const ua = a.rand(), ub = b.rand();
  if (ua !== ub) bad.push(`shared stream differs after setup (${ua} vs ${ub})`);
  if (!gone) bad.push('no household was bought out');
  checks++;
  if (bad.length) { failures++; console.log(`FAIL ${label}\n  ${bad.join('\n  ')}`); }
  else console.log(`ok   ${label}: ${kept.toLocaleString()} households identical, ${gone.toLocaleString()} bought out`);
}

for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id);
  for (const seed of [1, 2, 3]) {
    const fire = runFire(grid, sc, SEVERITY.central, seed);
    const tod = TIME_OF_DAY[sc.timeOfDay];
    for (const [name, edges] of Object.entries(SETS))
      compare(`${F.id} seed ${seed} buyout ${name}`, new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, tod),
        new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, tod, { retreat: { edges } }));
  }
}
console.log(`\n${checks - failures}/${checks} comparisons like for like`);
process.exit(failures ? 1 : 0);
