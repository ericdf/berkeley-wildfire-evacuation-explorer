// Runs batches of headless simulations for plan comparison and uncertainty ranges,
// so the map stays responsive.
import { loadData } from './data.js';
import { buildFireGrid, runFire, fireGridFor } from './fire.js';
import { makeScenarios, memberScenario, SEVERITY, TIME_OF_DAY } from './scenarios.js';
import { Evacuation } from './sim.js';
import { reshuffle } from './guidance.js';
import { dataFor } from './levers.js';

let data, grid, scenarios;
const ready = (async () => { data = await loadData(); grid = buildFireGrid(data); scenarios = makeScenarios(data); })();
const fires = new Map();
const cancelled = new Set(); // batches the page no longer wants (a closed comparison)

self.onmessage = async ev => {
  if (ev.data.cancel != null) { cancelled.add(ev.data.cancel); return; }
  await ready;
  const { batch, jobs } = ev.data;
  for (let k = 0; k < jobs.length; k++) {
    await new Promise(r => setTimeout(r)); // let a cancel message in between runs
    if (cancelled.has(batch)) { cancelled.delete(batch); return; }
    const j = jobs[k];
    // j.member: a fire family member (js/scenarios.js familyOf); none or the default member runs the fire as it is.
    const sc = memberScenario(scenarios.find(s => s.id === j.scenarioId), j.member, data);
    // j.world.fuel: the opt-in "Fuel" scenario setting ('landfire'); absent or 'proxy' is today's fire-zone proxy.
    const fuel = j.world?.fuel === 'landfire' ? 'landfire' : 'proxy';
    const key = `${sc.id}|${sc.ignition}|${sc.windFrom}|${j.sev}|${j.seed}|${fuel}`;
    if (!fires.has(key)) fires.set(key, runFire(fireGridFor(grid, data, fuel), sc, SEVERITY[j.sev], j.seed));
    // j.net: a stacked street network (js/levers.js stackOf), built from this worker's own copy of the data.
    const sim = new Evacuation(dataFor(data, j.net), grid, fires.get(key), sc, j.sev, j.plan, j.seed, TIME_OF_DAY[j.tod || sc.timeOfDay], j.world);
    if (j.reshuffle) reshuffle(sim); // households worse off: the same run with another junction serving order (js/guidance.js)
    const summary = sim.runToEnd();
    self.postMessage({ batch, k, job: j, summary, events: sim.events.slice(0, 40), outcomes: j.outcomes ? sim.householdOutcomes() : undefined });
  }
  self.postMessage({ batch, done: true });
};
