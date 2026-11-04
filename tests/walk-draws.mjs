// The opt-in "Home-to-street access time" setting (world.walkAccess 'terrain') must change only
// departure times: with it on, every household keeps its street, vehicles, kind, leave-early flag
// and ride, non-resident counts match, the shared random stream is in the same state when the run
// starts, and each household's departure moves later by its drawn delay (never earlier). Checked for
// every scenario, seeds 1–2, with and without maximum growth.
//   node tests/walk-draws.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
if (!data.walk) { console.log('FAIL data/model/walk-access.json missing'); process.exit(1); }
const grid = buildFireGrid(data);
let fails = 0, checks = 0;
for (const sc of makeScenarios(data)) for (const seed of [1, 2]) for (const growth of ['none', 'max']) {
  const fire = runFire(grid, sc, SEVERITY.central, seed);
  const mk = w => new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay], { growth, ...w });
  const a = mk({}), b = mk({ walkAccess: 'terrain' });
  const bad = [];
  if (!b.walkAccess.on) bad.push('setting did not switch on');
  if (a.hh.n !== b.hh.n) bad.push(`households ${a.hh.n} vs ${b.hh.n}`);
  let later = 0, earlier = 0, moved = 0;
  for (let h = 0; h < Math.min(a.hh.n, b.hh.n); h++) {
    for (const k of ['edge', 'veh', 'kind', 'early', 'ride', 'commuter']) if (a.hh[k][h] !== b.hh[k][h]) { bad.push(`household ${h} ${k}`); break; }
    const da = a.hh.depart[h], db = b.hh.depart[h];
    if (db < da) earlier++; else if (db > da) { later++; moved++; }
  }
  if (earlier) bad.push(`${earlier} households leave earlier`);
  if (JSON.stringify(a.nonResident) !== JSON.stringify(b.nonResident)) bad.push('non-resident counts differ');
  if (a.rand() !== b.rand()) bad.push('shared stream state differs');
  checks++;
  if (bad.length) { fails++; console.log(`FAIL ${sc.id} seed ${seed} growth ${growth}: ${bad.slice(0, 5).join('; ')}`); }
  else console.log(`ok   ${sc.id} seed ${seed} growth ${growth}: ${a.hh.n.toLocaleString()} households, ${moved.toLocaleString()} leave later, mean delay ${(b.walkAccess.delaySum / Math.max(1, b.walkAccess.households)).toFixed(0)} s`);
}
console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
