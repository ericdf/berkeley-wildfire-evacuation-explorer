#!/usr/bin/env node
// Who may need help on the four Simple-view fires (js/sim.js needsHelp; SOURCE_NOTES NH5): today's plan, the
// Simple view's time of day (S6, fall night), medium severity, seeds 1–3. Medians over seeds, with min–max.
// Reported counts only; no pickups are simulated. Not a prediction and not a casualty count.
//
//   node tools/needs-help-report.mjs [--seeds 3]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const { FIRES } = await import(R + '/js/presets.js');
const i = process.argv.indexOf('--seeds'), seeds = i > 0 ? +process.argv[i + 1] : 3;
const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.resolve(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), scen = Object.fromEntries(makeScenarios(data).map(s => [s.id, s]));
const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const span = a => `${med(a)} [${Math.min(...a)}–${Math.max(...a)}]`;
const groups = { specialized: 'May need a wheelchair van or ambulance (low–high end)', ambulatory: 'Ambulatory difficulty', age75: '75 and older', facilityBeds: 'Licensed care and hospital beds' };
console.log(`Today's plan, S6, medium severity, seeds 1–${seeds}; median [min–max] over seeds. Columns: in ordered or warned zones; on streets embers reached within 90 min of the zone's order or warning; within 180 min.`);
for (const F of FIRES) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const sc = scen[F.id], fire = runFire(grid, sc, SEVERITY.central, seed);
    runs.push(new Evacuation(data, grid, fire, sc, 'central', DEFAULT_PLAN, seed, TIME_OF_DAY.S6, { growth: 'none', powerShutoff: 'none' }).runToEnd().needsHelp);
  }
  console.log(`\n${F.title} (${F.id}): zones ordered or warned ${span(runs.map(r => r.zonesTold))}, with ACS figures ${span(runs.map(r => r.zonesUsed))}`);
  for (const [g, label] of Object.entries(groups)) {
    const col = k => g === 'specialized' ? `${span(runs.map(r => r.groups[g][k].range[0]))} – ${span(runs.map(r => r.groups[g][k].range[1]))}` : span(runs.map(r => r.groups[g][k].value));
    console.log(`  ${label.padEnd(56)} ${col('inZones').padEnd(30)} ${col('facilities').padEnd(30)} ${col('transitDependent')}`);
  }
}
