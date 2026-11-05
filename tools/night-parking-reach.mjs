#!/usr/bin/env node
// Engine reach at ignition under the night parking rule (SOURCE_NOTES NP5): hill residents in Berkeley zones an
// engine cannot reach within the City's 5-minute standard, and hill segments too narrow for an engine, for status-quo
// parking and every hill parking option, night (S6), seeds 1–5, under today's night rule and the pre-2026-11-05 rule
// (world.nightParking). Reach at ignition depends on the seed's parked cars only, not on the fire or severity
// (ER2); the east-wind fire at central severity sets up the run.
//
//   node tools/night-parking-reach.mjs [--seeds 1-5] [--fire eastWind] [--tod S6]
//
// Educational comparison on synthetic households, not a prediction.
import fs from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(R);
const { loadData } = await import('../js/data.js');
const { buildFireGrid, runFire } = await import('../js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import('../js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import('../js/sim.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const [s0, s1] = arg('--seeds', '1-5').split('-').map(Number), SEEDS = Array.from({ length: (s1 ?? s0) - s0 + 1 }, (_, i) => s0 + i);
const FIRE = arg('--fire', 'eastWind'), TOD = arg('--tod', 'S6');
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), sc = makeScenarios(data).find(s => s.id === FIRE);
const OPTIONS = ['both', 'oneside', 'tight', 'narrow', 'none'];
const RULES = { pre: { nightParking: 'pre20261105' }, now: {} };
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};
for (const seed of SEEDS) {
  const fire = runFire(grid, sc, SEVERITY.central, seed);
  for (const [rk, w] of Object.entries(RULES)) for (const opt of OPTIONS) {
    const sim = new Evacuation(data, grid, fire, sc, 'central', { ...DEFAULT_PLAN, hillsParking: opt }, seed, TIME_OF_DAY[TOD], { growth: 'none', powerShutoff: 'none', ...w });
    const h = sim.engineReach.hill;
    (out[`${rk}|${opt}`] ||= []).push({ seed, beyond5: Math.round(h.total - h.people), noRoute: Math.round(h.unreachable), hill: Math.round(h.total), blocked: sim.parkingStats.engineBlocked, nightPinched: sim.parkingStats.nightPinched, sharedLanes: sim.sharedLanes });
  }
}
console.log(`fire ${FIRE}, central, ${TOD}, seeds ${SEEDS.join(',')}: medians (by seed)`);
console.log('rule | option | hill residents beyond 5 min | no engine route | engine-blocked segments | night-pinched segments | take-turns segments');
for (const [k, v] of Object.entries(out)) {
  const [rk, opt] = k.split('|'), c = f => `${med(v.map(f))} (${v.map(f).join(', ')})`;
  console.log([rk, opt, c(r => r.beyond5), c(r => r.noRoute), c(r => r.blocked), c(r => r.nightPinched), c(r => r.sharedLanes)].join(' | '));
}
const pairs = OPTIONS.slice(1).map(o => `${o}: B better in ${SEEDS.filter((s, i) => out[`now|${o}`][i].beyond5 < out['now|both'][i].beyond5).length} of ${SEEDS.length}`);
console.log('new rule, against status quo:', pairs.join('; '));
