// Checks for the scenario wind schedule (js/fire.js windSegments, runFire):
//   node tests/wind-schedule.mjs
// 1. A one-entry schedule equal to the scenario's wind gives the same fire as no schedule.
// 2. Splitting the run into two segments with the same wind gives the same fire.
// 3. A shift at minute T leaves every cell the fire reached before T unchanged.
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY } from '../js/scenarios.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scen = makeScenarios(data);
let failed = 0;
const fail = m => { failed++; console.log('FAIL ' + m); };
const same = (a, b) => a.arrival.every((v, i) => v === b.arrival[i]) && a.ember.every((v, i) => v === b.ember[i]) && a.spots === b.spots;

for (const id of ['eastWind', 'ref1923', 'quake']) {
  const sc0 = scen.find(s => s.id === id); if (!sc0) { console.log(`skip ${id}: not loaded`); continue; }
  const sc = { ...sc0, windSchedule: undefined }; // the constant-wind version of the scenario
  for (const sev of ['central', 'high']) {
    const base = runFire(grid, sc, SEVERITY[sev], 1);
    const one = runFire(grid, { ...sc, windSchedule: [{ fromMin: 0, windFrom: sc.windFrom, windMph: sc.windMph }] }, SEVERITY[sev], 1);
    if (!same(base, one)) fail(`${id} ${sev}: one-entry schedule differs from no schedule`);
    const two = runFire(grid, { ...sc, windSchedule: [{ fromMin: 0, windFrom: sc.windFrom, windMph: sc.windMph }, { fromMin: 60, windFrom: sc.windFrom, windMph: sc.windMph }] }, SEVERITY[sev], 1);
    if (!same(base, two)) fail(`${id} ${sev}: two segments with the same wind differ from no schedule`);
    const T = 45, shifted = runFire(grid, { ...sc, windSchedule: [{ fromMin: 0, windFrom: sc.windFrom, windMph: sc.windMph }, { fromMin: T, windFrom: (sc.windFrom + 180) % 360, windMph: sc.windMph }] }, SEVERITY[sev], 1);
    let before = 0, bad = 0, after = 0;
    for (let i = 0; i < base.arrival.length; i++) {
      if (base.arrival[i] < T) { before++; if (shifted.arrival[i] !== base.arrival[i]) bad++; }
      else if (shifted.arrival[i] < Infinity) after++;
    }
    if (bad) fail(`${id} ${sev}: ${bad} of ${before} cells reached before minute ${T} changed after a shift at ${T}`);
    console.log(`${id} ${sev}: same fire with one or two equal segments; reversal at ${T} min keeps ${before} early cells, reaches ${after} later ones (constant wind: ${base.arrival.filter(v => v >= T && v < Infinity).length})`);
  }
}
console.log(failed ? `${failed} failure(s)` : 'all wind-schedule checks pass');
process.exit(failed ? 1 : 0);
