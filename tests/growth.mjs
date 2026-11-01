// Future growth and R0 with the fire on (SOURCE_NOTES R4, R5): default plan, scenario time of
// day, seeds 1..n. Prints one line per run and the median per setting.
//   node tests/growth.mjs <scenario id> [severity=central] [seeds=5]
// R0 "access" needs data/model/access-constraints.json; without it, that setting bars nothing.
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const [id, sev = 'central', nSeeds = 5] = process.argv.slice(2);
const sc = makeScenarios(data).find(s => s.id === id);
if (!sc) { console.error(`unknown scenario ${id}`); process.exit(1); }
const SETTINGS = [['none', 'none'], ['moderate', 'none'], ['moderate', 'lez'], ['max', 'none'], ['max', 'lez'], ['max', 'access'], ['max', 'fz23']];
const embers = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const rows = [];
for (let seed = 1; seed <= +nSeeds; seed++) {
  const fire = runFire(grid, sc, SEVERITY[sev], seed);
  for (const [growth, r0] of SETTINGS) {
    const S = new Evacuation(data, grid, fire, sc, sev, { ...DEFAULT_PLAN, r0 }, seed, TIME_OF_DAY[sc.timeOfDay], { growth }).runToEnd();
    const row = { growth, r0, seed, embers: Math.round(embers(S)), p90: S.clearP90 == null ? null : Math.round(S.clearP90), cutOff: S.vehiclesNoRoute,
      addedResidents: Math.round(S.addedResidents), barredResidents: Math.round(S.growthBlocked * data.A.demand.personsPerHousehold) };
    rows.push(row); console.log(JSON.stringify(row));
  }
}
const med = v => { const s = v.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log(`\n${sc.id} ${sev}, median of ${nSeeds} seeds (p90 null = not reached)`);
for (const [growth, r0] of SETTINGS) {
  const r = rows.filter(x => x.growth === growth && x.r0 === r0);
  console.log(`${growth.padEnd(9)} R0 ${r0.padEnd(7)} embers ${med(r.map(x => x.embers))}  p90 ${med(r.map(x => x.p90))}  cut off ${med(r.map(x => x.cutOff))}  barred people ${r[0].barredResidents}  p90 not reached in ${r.filter(x => x.p90 == null).length}`);
}
