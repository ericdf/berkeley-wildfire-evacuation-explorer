#!/usr/bin/env node
// Earthquake fires' spread-rate factor (js/scenarios.js QUAKE_ROS_FACTOR; SOURCE_NOTES EQ11, WC8): structures
// inside Berkeley the fire front reaches by the end of the 6-hour run, medium severity, seeds 1–5, for each
// earthquake scenario and each factor tried, against HayWired's about 2,270 single-family-home equivalents
// burned in Berkeley's station areas (EQ11, derived).
//   node tools/quake-ros-fit.mjs [factors, default 0.30,0.33,0.35,0.37,0.40] [scenario ids, default every quake*]
// Structures: City footprints in Fire Zones 2–3 and OpenStreetMap outlines elsewhere (data/model/structures.json),
// counted in fire cells inside the city boundary.
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY } from '../js/scenarios.js';

const factors = (process.argv[2] || '0.30,0.33,0.35,0.37,0.40').split(',').map(Number);
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const ids = process.argv[3] ? process.argv[3].split(',') : null;
const scen = makeScenarios(data).filter(s => s.kind === 'earthquake' && (!ids || ids.includes(s.id)));
const st = data.structures, cells = [];
for (const list of [st.structures, st.structuresOther || []]) for (const [c, n] of list) if (grid.inCity[c]) cells.push([c, n]);
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};
for (const sc of scen) {
  out[sc.id] = {};
  for (const k of factors) {
    const r = [1, 2, 3, 4, 5].map(seed => { const F = runFire(grid, { ...sc, rosFactor: k }, SEVERITY.central, seed); let n = 0; for (const [c, m] of cells) if (F.arrival[c] <= sc.durationMin) n += m; return n; });
    out[sc.id][k] = { median: median(r), seeds: r };
    console.log(`${sc.id.padEnd(16)} factor ${k.toFixed(2)}: median ${median(r).toLocaleString()} structures in Berkeley by ${sc.durationMin / 60} h (seeds 1–5: ${r.join(', ')})`);
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
