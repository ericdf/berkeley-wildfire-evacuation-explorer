// Household mix: citywide average (today) vs by place (ACS), on today's plan (docs/demand-by-place.md,
// SOURCE_NOTES DM17). Two sets of runs, each seed run under both mixes:
//   fires     the four Simple-view fires at the given severity, each at its own time of day
//   fire off  the Time Study's four regions with the fire switched off (as tests/calibration.mjs), cases S4 and S6
// Writes data/model/demand-compare.json and prints medians [min–max] over seeds.
//   node tools/demand-compare.mjs [--seeds 1,2,3] [--sev central] [--workers 1]   (runs one at a time)
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY, ETE_TARGETS } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { FIRES } from '../js/presets.js';
import { ROOT } from './zones.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number), SEV = arg('sev', 'central');
const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.join(ROOT, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
if (!data.demand) throw new Error('data/model/demand-by-zone.json is missing: run node tools/build-demand.mjs');
const grid = buildFireGrid(data), scen = makeScenarios(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const MIX = { citywide: {}, place: { householdMix: 'place' } };
const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const pick = (S, sim) => ({
  households: sim.hh.n, vehicles: S.vehicles, orderVehicles: S.orderVehicles, orderedPeople: S.orderedPeople,
  carlessHouseholdsOrdered: (() => { let n = 0; for (let h = 0; h < sim.hh.n; h++) if (!sim.hh.veh[h] && (sim.hh.kind[h] === 1 || sim.hh.kind[h] === 2)) n++; return n; })(),
  stranded: S.noVehicle, riders: S.riders,
  clearP90: S.clearP90, clearP100: S.clearP100, clearP90All: S.clearP90All,
  exposed: exposed(S), exposedNoVehicle: S.exposedNoVehicle, fireFront: S.fireFrontHome + S.fireFrontRoad,
  vehiclesOnRoad: S.vehiclesOnRoad, vehiclesNoRoute: S.vehiclesNoRoute, peakQueued: S.peakQueued,
});
const out = { _meta: { built: new Date().toISOString().slice(0, 10), seeds: SEEDS, severity: SEV, plan: 'DEFAULT_PLAN (today\'s plan)',
  note: 'Synthetic runs for comparison, not a prediction. people still there when embers arrived counts people, not casualties.' }, fires: {}, fireOff: {} };
const t0 = Date.now();
for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id); out.fires[F.id] = { tod: sc.timeOfDay, citywide: [], place: [] };
  for (const seed of SEEDS) {
    const fire = runFire(grid, sc, SEVERITY[SEV], seed);
    for (const [m, w] of Object.entries(MIX)) {
      const sim = new Evacuation(data, grid, fire, sc, SEV, DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay], w);
      out.fires[F.id][m].push(pick(sim.runToEnd(), sim));
    }
    console.error(`${F.id} seed ${seed} done, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
const plan = { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 };
for (const sc of scen.filter(s => ETE_TARGETS[s.id])) for (const tk of ['S4', 'S6']) {
  const k = `${sc.id} ${tk}`; out.fireOff[k] = { region: ETE_TARGETS[sc.id].region, study: { p90: ETE_TARGETS[sc.id].p90[tk], p100: ETE_TARGETS[sc.id].p100[tk] }, citywide: [], place: [] };
  for (const seed of SEEDS) for (const [m, w] of Object.entries(MIX)) {
    const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', plan, seed, TIME_OF_DAY[tk], w);
    out.fireOff[k][m].push(pick(sim.runToEnd(), sim));
  }
  console.error(`fire off ${k} done, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(path.join(ROOT, 'data/model/demand-compare.json'), JSON.stringify(out, null, 1));
const med = xs => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const r = x => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const col = (L, k) => { const v = L.map(s => s[k]).filter(x => x != null); return v.length ? `${r(med(v))} [${r(Math.min(...v))}–${r(Math.max(...v))}]` : '—'; };
const KEYS = ['households', 'vehicles', 'carlessHouseholdsOrdered', 'stranded', 'clearP90', 'clearP100', 'exposed', 'exposedNoVehicle', 'fireFront', 'vehiclesNoRoute'];
for (const [set, T] of [['fires', out.fires], ['fire off', out.fireOff]]) {
  console.log(`\n## ${set}`);
  for (const [k, v] of Object.entries(T)) {
    console.log(`${k}${v.region ? ` (${v.region}; study p90 ${v.study.p90}, p100 ${v.study.p100} min)` : ` (${v.tod})`}`);
    for (const key of KEYS) console.log(`  ${key.padEnd(26)} ${col(v.citywide, key).padEnd(28)} ${col(v.place, key)}`);
  }
}
