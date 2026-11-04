#!/usr/bin/env node
// Simulator comparison for the opt-in "Home-to-street access time" setting (world.walkAccess):
// every scenario at medium severity, seeds 1–3, today's plan, with the setting off and on (same
// fire, households, parked cars and seed). Writes data/model/walk-access-sim.json; rerun
// node tools/walk-access.mjs afterwards to put the table in docs/walk-access.md.
//   node tools/walk-access-sim.mjs [--seeds 3]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const seeds = +(argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : 3);
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY, ETE_TARGETS } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
if (!data.walk) throw new Error('data/model/walk-access.json missing: run node tools/walk-access.mjs first');
const grid = buildFireGrid(data);
const runs = [];
for (const sc of makeScenarios(data)) for (let seed = 1; seed <= seeds; seed++) {
  const fire = runFire(grid, sc, SEVERITY.central, seed);
  const row = { scenario: sc.id, name: sc.name, region: ETE_TARGETS[sc.id]?.region || null, seed };
  for (const opt of ['none', 'terrain']) {
    const world = opt === 'none' ? {} : { walkAccess: 'terrain' };
    const sim = new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay], world);
    const S = sim.runToEnd();
    row[opt] = { embers: Math.round(S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed), embersHome: Math.round(S.exposedHome), embersRoad: Math.round(S.exposedRoad),
      fireFront: Math.round(S.fireFrontHome + S.fireFrontRoad), eteP90: S.clearP90 == null ? null : Math.round(S.clearP90 * 10) / 10, eteP50: S.clearP50 == null ? null : Math.round(S.clearP50 * 10) / 10,
      meanDelayS: Math.round(S.walkAccessMeanS || 0), on: !!S.walkAccessOn };
  }
  console.log(`${sc.id} seed ${seed}: embers ${row.none.embers} → ${row.terrain.embers}; fire front ${row.none.fireFront} → ${row.terrain.fireFront}; ETE p90 ${row.none.eteP90} → ${row.terrain.eteP90} min; mean delay ${row.terrain.meanDelayS} s`);
  runs.push(row);
}
fs.writeFileSync(path.join(R, 'data/model/walk-access-sim.json'), JSON.stringify({ meta: { built: new Date().toISOString().slice(0, 10), severity: 'central (medium)', seeds, plan: 'DEFAULT_PLAN (today\'s plan)', note: 'Same fire, households, parked cars and seed with the setting off (none) and on (terrain). People still there when embers arrived: each person counted once (SOURCE_NOTES FO7); not a casualty count. ETE p90: minutes after the order for 90% of the Berkeley order area\'s vehicles to get out.' }, runs }, null, 1));
