// Find jams: run a scenario with the fire off and list links whose head vehicle has waited over
// 15 minutes, with where it is trying to go.
//   node tests/stuck.mjs <scenarioId> <S1..S6> <minutes>     e.g. node tests/stuck.mjs ref1923 S4 150
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const [id = 'ref1923', tk = 'S4', min = '150'] = process.argv.slice(2);
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const sc = makeScenarios(data).find(s => s.id === id);
const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 }, 1, TIME_OF_DAY[tk]);
const E = data.net.edges, v = sim.v;
while (sim.t < +min * 60) sim.step();
let n = 0;
for (const L of sim.links) {
  if (!L.q.length) continue; const i = L.q[0], w = sim.t - v.enter[i] - L.ff; if (w < 900) continue; n++;
  const k = v.cls[i], opts = k === 2 ? [sim.paths.get(i)?.[v.pidx[i]]] : sim.next[k][L.to];
  console.log(`STUCK link ${L.id} ${E[L.e].name} ${L.from}->${L.to} q ${L.q.length}/${L.storage} head class ${k} waited ${w.toFixed(0)} s next ${JSON.stringify(opts)}`);
  for (const nl of opts || []) if (nl != null) { const N = sim.links[nl]; console.log(`    -> ${nl} ${E[N.e].name} q ${N.q.length}/${N.storage}`); }
}
console.log(`${n} stuck links at t+${min} min; ${sim.waiting.length} vehicles waiting to enter the network; gridlock reliefs so far ${sim.gridlockReliefs}`);
