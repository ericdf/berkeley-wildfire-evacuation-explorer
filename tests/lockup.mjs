// Lock-up check for the gridlock relief rule (SOURCE_NOTES CD17): fire off, the Time Study's
// order and warning zones, as tests/calibration.mjs runs them. Reports when and where relief
// fires, whether the network keeps draining (vehicles on the road, links whose head vehicle has
// waited over 15 min), whether every order-zone car is counted out by the end, and the 90%/100%
// ETE, at the assumed relief wait and at a multiple of it.
//   node tests/lockup.mjs [scenario=ref1923] [case=S4] [seeds=3] [relief multiple=1]
//   SIGNALS=low or high: signal green share (central by default; SOURCE_NOTES CD21)
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const [id = 'ref1923', tk = 'S4', nSeeds = '3', mult = '1'] = process.argv.slice(2);
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
data.A.capacity.gridlockReliefS *= +mult;
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const sc = makeScenarios(data).find(s => s.id === id);
const E = data.net.edges;
console.log(`${sc.name}, ${tk}, gridlock relief after ${data.A.capacity.gridlockReliefS} s`);
for (let seed = 1; seed <= +nSeeds; seed++) {
  const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 }, seed, TIME_OF_DAY[tk], { householdMix: 'citywide', ...(process.env.SIGNALS ? { signalGreen: process.env.SIGNALS } : {}) });
  const reliefs = [], relieve = sim.relieve.bind(sim);
  sim.relieve = (i, L, N) => { const r = relieve(i, L, N); if (r) reliefs.push({ t: sim.t, name: E[L.e].name || '(unnamed)', node: L.to, cls: sim.v.cls[i] }); return r; };
  const v = sim.v, rows = [], stuckSeen = new Map();
  const counted = () => { let n = 0, all = 0; for (let i = 0; i < v.n; i++) { if (v.cls[i] || v.state[i] === 4 || v.fromOrder[i] !== 1) continue; all++; if (Math.min(v.exit[i], v.zarr[i]) < Infinity) n++; } return [n, all]; };
  for (let m = 30; m <= 360; m += 30) {
    while (sim.t < m * 60) sim.step();
    let onRoad = 0; for (let i = 0; i < v.n; i++) if (v.state[i] === 1) onRoad++;
    const stuck = [];
    for (const L of sim.links) { if (!L.q.length) continue; const w = sim.t - v.enter[L.q[0]] - L.ff; if (w >= 900) { stuck.push(L.id); stuckSeen.set(L.id, (stuckSeen.get(L.id) || 0) + 1); } }
    const [n, all] = counted();
    rows.push({ m, onRoad, waiting: sim.waiting.length, stuck: stuck.length, relief: reliefs.filter(r => r.t > (m - 30) * 60 && r.t <= m * 60).length, counted: n, of: all });
  }
  const S = sim.summary();
  console.log(`\nseed ${seed}: 90% ${S.clearP90?.toFixed(1)} min, 100% ${S.clearP100 == null ? '—' : S.clearP100.toFixed(1)} min, reliefs ${sim.gridlockReliefs}, order-zone cars counted out ${rows.at(-1).counted} of ${rows.at(-1).of}`);
  console.log('min  on road  waiting to enter  links stuck ≥15 min  reliefs in last 30 min  order cars counted out');
  for (const r of rows) console.log(`${String(r.m).padStart(3)}  ${String(r.onRoad).padStart(7)}  ${String(r.waiting).padStart(16)}  ${String(r.stuck).padStart(19)}  ${String(r.relief).padStart(22)}  ${r.counted}`);
  const byPlace = new Map(); for (const r of reliefs) { const k = `${r.name} → node ${r.node}`; const o = byPlace.get(k) || { n: 0, first: Infinity, last: 0 }; o.n++; o.first = Math.min(o.first, r.t); o.last = Math.max(o.last, r.t); byPlace.set(k, o); }
  console.log('where relief fired (link entering node; count, first and last minute):');
  for (const [k, o] of [...byPlace].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) console.log(`  ${k}: ${o.n} (${(o.first / 60).toFixed(0)}–${(o.last / 60).toFixed(0)} min)`);
  const persistent = [...stuckSeen].filter(([, c]) => c >= 4).length;
  console.log(`links stuck ≥15 min at 4 or more of the 12 half-hour marks: ${persistent}; stuck at 360 min: ${rows.at(-1).stuck}`);
}
