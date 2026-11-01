// List order-zone vehicles that never leave the order area (the cause of a "—" 100th percentile
// in tests/calibration.mjs), grouped by the street they start on and the link they end on.
//   node tests/leftover.mjs <scenarioId> <S1..S6> [seed=1]     e.g. node tests/leftover.mjs eastWind S2
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const [id = 'eastWind', tk = 'S2', seed = '1'] = process.argv.slice(2);
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const sc = makeScenarios(data).find(s => s.id === id);
const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 }, +seed, TIME_OF_DAY[tk]);
sim.runToEnd();
const E = data.net.edges, v = sim.v, by = new Map();
for (let i = 0; i < v.n; i++) {
  if (!v.fromOrder[i] || v.exit[i] < Infinity || v.arrive[i] < Infinity) continue;
  const L = v.link[i] >= 0 ? sim.links[v.link[i]] : null, e = E[v.edge[i]];
  const k = `start ${e.name} (${e.evacZone}${e.src.osmWay ? ', OSM' : ''}) | state ${v.state[i]} | on ${L ? E[L.e].name + ' ' + L.from + '->' + L.to : 'not entered'} | dist ${L ? sim.dist[v.cls[i]][L.to] : sim.dist[v.cls[i]][e.a]}`;
  by.set(k, (by.get(k) || 0) + 1);
}
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(n, k);
console.log(`${[...by.values()].reduce((a, b) => a + b, 0)} order-zone vehicles never left the order area`);
