// Compare the simulator's traffic model with the 2025 Evacuation Time Study (KLD).
// The study models traffic only, so these runs switch the fire off (no blocked roads,
// no embers) and use only the study's order/warning zones.
//   node tests/calibration.mjs [seeds=3] [intersection scale]
//   GROWTH=max node tests/calibration.mjs   (Future growth: middle, moderate or max; SOURCE_NOTES R3)
//   PLACEMENT=workplace node tests/calibration.mjs   (Weekday non-resident placement by workplace; docs/weekday-placement.md)
//   CASES=S1,S4 REGIONS=ref1923,eastWind node tests/calibration.mjs   (only these cases and scenarios)
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY, ETE_TARGETS } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const seeds = +(process.argv[2] || 3);
if (process.argv[3]) data.A.intersections.scale = +process.argv[3]; // optional: try another intersection-capacity scale
console.log(`intersection capacity scale ${data.A.intersections.scale}`);
const world = { growth: process.env.GROWTH || 'none' };
if (world.growth !== 'none') console.log(`future growth ${world.growth}`);
if (process.env.PLACEMENT) { world.nrPlacement = process.env.PLACEMENT; console.log(`non-resident placement ${world.nrPlacement}`); }
const CASES = process.env.CASES ? process.env.CASES.split(',') : null, REGIONS = process.env.REGIONS ? process.env.REGIONS.split(',') : null;
const hm = m => { if (m == null) return '  —  '; const r = Math.round(m); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const plan = { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 };
for (const sc of makeScenarios(data).filter(s => ETE_TARGETS[s.id] && (!REGIONS || REGIONS.includes(s.id)))) {
  const T = ETE_TARGETS[sc.id];
  console.log(`\n${T.region} (simulator scenario "${sc.name}"), ETE after the order, h:mm. Sim = median of ${seeds} seeds [min–max]`);
  console.log('case  p90 study  p90 sim               p100 study  p100 sim              order veh  evac veh  shadow veh  inbound  relief');
  for (const tk of Object.keys(TIME_OF_DAY).filter(k => !CASES || CASES.includes(k))) {
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', plan, seed, TIME_OF_DAY[tk], world);
      runs.push(sim.runToEnd());
    }
    const col = f => { const v = runs.map(f).filter(x => x != null).sort((a, b) => a - b); return v.length ? `${hm(v[Math.floor(v.length / 2)])} [${hm(v[0])}–${hm(v.at(-1))}]` : '—'; };
    console.log(`${tk}    ${hm(T.p90[tk])}     ${col(S => S.clearP90).padEnd(22)}${hm(T.p100[tk])}       ${col(S => S.clearP100).padEnd(22)}${String(runs[0].orderVehicles).padStart(9)}  ${String(runs[0].vehicles).padStart(8)}  ${String(runs[0].shadowVehicles).padStart(9)}  ${String(runs[0].commutersInbound).padStart(7)}  ${String(runs[0].gridlockReliefs).padStart(6)}`);
  }
}
