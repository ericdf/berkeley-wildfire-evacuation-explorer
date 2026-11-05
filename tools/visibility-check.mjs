#!/usr/bin/env node
// Visibility setting (SOURCE_NOTES VZ1–VZ7): today's plan with visibility clear and poor on the same fire and households.
//   node tools/visibility-check.mjs [fire ids, default eastWind,ref1923,quake] [seeds, default 1,2,3]
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), scen = makeScenarios(data);
const ids = (process.argv[2] || 'eastWind,ref1923,quake').split(','), seeds = (process.argv[3] || '1,2,3').split(',').map(Number);
for (const id of ids) {
  const sc = scen.find(s => s.id === id);
  for (const seed of seeds) {
    const fire = runFire(grid, sc, SEVERITY.central, seed);
    const r = ['clear', 'poor'].map(v => new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay], v === 'poor' ? { visibility: 'poor' } : {}).runToEnd());
    const f = S => `90% out ${S.clearP90 == null ? '—' : S.clearP90.toFixed(1)} min, still there when embers arrived ${Math.round(S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed).toLocaleString()}, hill residents beyond 5-min engine reach ${Math.round(S.engineReachBeyond5People).toLocaleString()}`;
    console.log(`${id} seed ${seed}: clear ${f(r[0])} | poor ${f(r[1])}`);
  }
}
