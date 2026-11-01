// Compare the game's traffic model with the 2025 Evacuation Time Study (KLD).
// The study models traffic only, so these runs switch the fire off (no blocked roads,
// no embers) and use only the study's own order/warning zones.
//   node tests/calibration.mjs [seeds=3]
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid } from '../js/fire.js';
import { makeScenarios, TIME_OF_DAY, ETE_TARGETS } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const seeds = +(process.argv[2] || 3);
const hm = m => m == null ? '  —  ' : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const plan = { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 };
for (const sc of makeScenarios(data).filter(s => ETE_TARGETS[s.id])) {
  const T = ETE_TARGETS[sc.id];
  console.log(`\n${T.region} (game scenario "${sc.name}"), ETE after the order, h:mm. Game = median of ${seeds} seeds [min–max]`);
  console.log('case  p90 study  p90 game              p100 study  p100 game             evac veh  shadow veh');
  for (const tk of Object.keys(TIME_OF_DAY)) {
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', plan, seed, TIME_OF_DAY[tk]);
      runs.push(sim.runToEnd());
    }
    const col = f => { const v = runs.map(f).filter(x => x != null).sort((a, b) => a - b); return v.length ? `${hm(v[Math.floor(v.length / 2)])} [${hm(v[0])}–${hm(v.at(-1))}]` : '—'; };
    console.log(`${tk}    ${hm(T.p90[tk])}     ${col(S => S.clearP90).padEnd(22)}${hm(T.p100[tk])}       ${col(S => S.clearP100).padEnd(22)}${String(runs[0].vehicles).padStart(8)}  ${String(runs[0].shadowVehicles).padStart(9)}`);
  }
}
