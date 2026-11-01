// Headless smoke test: load data, run every scenario at central severity with the
// baseline plan and with an alternative plan, print summaries.
//   node tests/headless.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire, cellOf, FUEL } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const load = async (p, kind) => kind === 'json' ? JSON.parse(fs.readFileSync(p, 'utf8')) : fs.readFileSync(p).buffer.slice(0);
let t0 = performance.now();
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
console.log(`load+grid ${(performance.now() - t0).toFixed(0)} ms, grid ${grid.W}x${grid.H}`);
const scen = makeScenarios(data);
const sevArg = process.argv[2] || 'central';
const plans = [DEFAULT_PLAN, { ...DEFAULT_PLAN, name: 'Early+narrow', alertKm: 2, earlyShare: 0.5, hillsParking: 'narrow' }];
for (const sc of scen) {
  const c = cellOf(grid, ...sc.ignition);
  console.log(`\n=== ${sc.name}: ignition elev ${grid.elev[c].toFixed(0)} m, fuel ${Object.keys(FUEL)[grid.fuelClass[c]]}`);
  t0 = performance.now();
  const fire = runFire(grid, sc, SEVERITY[sevArg], 1);
  let burned = 0, ember = 0; for (let i = 0; i < fire.arrival.length; i++) { if (fire.arrival[i] < Infinity) burned++; if (fire.ember[i] < Infinity) ember++; }
  console.log(`fire ${(performance.now() - t0).toFixed(0)} ms: burned ${(burned * 900 / 1e6).toFixed(2)} km², ember ${(ember * 900 / 1e6).toFixed(2)} km², spots ${fire.spots}, LB ${fire.LB.toFixed(2)}`);
  for (const plan of plans) {
    t0 = performance.now();
    const sim = new Evacuation(data, grid, fire, sc, sevArg, plan, 1, TIME_OF_DAY[sc.timeOfDay]);
    const S = sim.runToEnd();
    const r = x => x == null ? '—' : Math.round(x).toLocaleString();
    console.log(`  [${plan.name}] ${(performance.now() - t0).toFixed(0)} ms; zones ordered ${S.zonesOrdered}; people ordered ${r(S.orderedPeople)}: safe ${r(S.reachedSafety)}, early ${r(S.leftEarly)}, onRoad ${r(S.onRoad)}, notLeft ${r(S.notLeft)}, noVeh ${r(S.noVehicle)}`);
    console.log(`     exposed home ${r(S.exposedHome)}, road ${r(S.exposedRoad)}, noVeh ${r(S.exposedNoVehicle)}, unordered ${r(S.notOrderedExposed)}; vehicles ${S.vehicles} clear p50/p90/p100 ${r(S.clearP50)}/${r(S.clearP90)}/${r(S.clearP100)} min; peak queue ${S.peakQueued}; on road at end ${S.vehiclesOnRoad} (no route ${S.vehiclesNoRoute})`);
    console.log(`     responder free ${S.responderFree.toFixed(1)} min, at end ${S.responderEta.toFixed(1)} min${S.responderBlocked ? ' BLOCKED' : ''}; engine-blocked segs ${S.engineBlockedSegments}; bottlenecks: ${S.bottlenecks.slice(0, 3).map(b => `${b.name} (${b.max})`).join('; ')}`);
    for (const e of sim.events.slice(0, process.env.EV ? 99 : 4)) console.log(`     t+${(e.t / 60).toFixed(0)} ${e.text}`);
  }
}
