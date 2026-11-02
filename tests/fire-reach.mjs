// How much of an area each fire reaches: vehicle street segments whose midpoint cell the fire front
// (or embers) reaches within the scenario's run, per severity and seed. The default box is the north
// hills above Marin Ave (Cragmont, the Thousand Oaks hills, Grizzly Peak Blvd down to Fire Station 7,
// the Kensington edge), local meters (SOURCE_NOTES P30).
//   node tests/fire-reach.mjs [scenarioId|all] [seeds=5] [xmin,ymin,xmax,ymax]
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire, cellOf } from '../js/fire.js';
import { makeScenarios, SEVERITY } from '../js/scenarios.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const [which = 'all', nSeeds = '5', boxArg = '4500,5400,7200,7000'] = process.argv.slice(2);
const [x0, y0, x1, y1] = boxArg.split(',').map(Number);
const E = data.net.edges.filter(e => e.mode === 'vehicle' && !e.disconnected).map(e => data.edgeMid[e.id]).filter(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
console.log(`box x ${x0}–${x1}, y ${y0}–${y1}: ${E.length} vehicle street segments; fire front / embers within the run, seeds 1–${nSeeds}`);
const seeds = Array.from({ length: +nSeeds }, (_, i) => i + 1);
for (const sc of makeScenarios(data).filter(s => which === 'all' || s.id === which)) {
  const out = [];
  for (const sev of ['low', 'central', 'high']) {
    const r = seeds.map(seed => { const F = runFire(grid, sc, SEVERITY[sev], seed); let front = 0, ember = 0;
      for (const p of E) { const c = cellOf(grid, ...p); if (c < 0) continue; if (F.arrival[c] <= sc.durationMin) front++; if (F.ember[c] <= sc.durationMin) ember++; }
      return [front, ember]; });
    const med = k => r.map(x => x[k]).sort((a, b) => a - b)[Math.floor(r.length / 2)];
    const rng = k => `${Math.min(...r.map(x => x[k]))}–${Math.max(...r.map(x => x[k]))}`;
    out.push(`${sev} ${med(0)} [${rng(0)}] / ${med(1)} [${rng(1)}]`);
  }
  console.log(`${sc.id.padEnd(12)} ${out.join(' | ')}`);
}
