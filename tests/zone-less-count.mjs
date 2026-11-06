// Regression test (SOURCE_NOTES CD3, CD10–CD12): no order-zone car is counted out at a node that lies in no zone.
// Fire off, one seed, two calibration cases; every counted-out car must have its counted node inside a zone.
//   node tests/zone-less-count.mjs            (exit 1 if any car is counted out at a zone-less node)
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const plan = { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 };
const world = { growth: 'none', householdMix: 'citywide' };
let failures = 0;
for (const [id, tk] of [['ref1923', 'S4'], ['eastWind', 'S6']]) {
  const sc = makeScenarios(data).find(s => s.id === id);
  const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', plan, 1, TIME_OF_DAY[tk], world);
  sim.runToEnd();
  const v = sim.v, zl = []; let counted = 0;
  for (let i = 0; i < v.n; i++) {
    if (v.cls[i] || v.state[i] === 4 || v.fromOrder[i] !== 1) continue;
    if (v.cntNode[i] < 0) continue; // not counted out by the simulator's ETE measure
    counted++;
    if (sim.nodeZone[v.cntNode[i]] < 0) zl.push(i);
  }
  console.log(`${id} ${tk}: ${counted} order-zone cars counted out, ${zl.length} at a node in no zone`);
  failures += zl.length;
}
if (failures) { console.error(`FAIL: ${failures} car(s) counted out at a node outside every zone`); process.exit(1); }
console.log('PASS: no car is counted out at a node outside every zone');
