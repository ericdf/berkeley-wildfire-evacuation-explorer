// Runs batches of headless simulations for plan comparison and uncertainty ranges,
// so the map stays responsive.
import { loadData } from './data.js';
import { buildFireGrid, runFire } from './fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from './scenarios.js';
import { Evacuation } from './sim.js';
import { reshuffle } from './guidance.js';

let data, grid, scenarios;
const ready = (async () => { data = await loadData(); grid = buildFireGrid(data); scenarios = makeScenarios(data); })();
const fires = new Map();

self.onmessage = async ev => {
  await ready;
  const { batch, jobs } = ev.data;
  for (let k = 0; k < jobs.length; k++) {
    const j = jobs[k];
    const sc = scenarios.find(s => s.id === j.scenarioId);
    const key = `${sc.id}|${j.sev}|${j.seed}`;
    if (!fires.has(key)) fires.set(key, runFire(grid, sc, SEVERITY[j.sev], j.seed));
    const sim = new Evacuation(data, grid, fires.get(key), sc, j.sev, j.plan, j.seed, TIME_OF_DAY[j.tod || sc.timeOfDay], j.world);
    if (j.reshuffle) reshuffle(sim); // households worse off: the same run with another junction serving order (js/guidance.js)
    const summary = sim.runToEnd();
    self.postMessage({ batch, k, job: j, summary, events: sim.events.slice(0, 40), outcomes: j.outcomes ? sim.householdOutcomes() : undefined });
  }
  self.postMessage({ batch, done: true });
};
