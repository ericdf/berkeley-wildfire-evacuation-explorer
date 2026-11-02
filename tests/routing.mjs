// Driver information and routing with the fire on (SOURCE_NOTES DG19–DG24): default plan apart
// from routing, scenario time of day, seeds 1..n. For each seed it runs every routing option
// twice, the second time with another junction serving order (js/guidance.js reshuffle; totals are
// the mean of the two), and pairs
// the runs household by household against Habit: worse off (single runs), beyond chance (worse
// under both runs of the option than under both Habit runs) and chance alone (the option against
// its rerun). Prints one JSON line per option and seed, then medians.
//   node tests/routing.mjs <scenario id> [severity=central] [seeds=5] [options=today,habit,app,guided,system,guided50]
// It also checks that every option sees the same households and the same shared random stream at
// the start of the run as Today's model.
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { worseOff, worstOf, bestOf, reshuffle } from '../js/guidance.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const [id, sev = 'central', nSeeds = 5, list = 'today,habit,app,guided,system,guided50'] = process.argv.slice(2);
const sc = makeScenarios(data).find(s => s.id === id);
if (!sc) { console.error(`unknown scenario ${id}`); process.exit(1); }
const thr = data.A.routing.worseOffDelayMin;
const OPT = { today: ['today', 1], habit: ['habit', 1], app: ['app', 1], guided: ['guided', 1], system: ['system', 1], guided50: ['guided', 0.5], app50: ['app', 0.5], guided15: ['guided', 0.15] };
const names = [...new Set(['today', 'habit', ...list.split(',')])];
const embers = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const rows = []; let bad = 0;
for (let seed = 1; seed <= +nSeeds; seed++) {
  const fire = runFire(grid, sc, SEVERITY[sev], seed), out = {};
  for (const k of names) {
    const [routing, compliance] = OPT[k];
    const build = () => new Evacuation(data, grid, fire, sc, sev, { ...DEFAULT_PLAN, routing, compliance }, seed, TIME_OF_DAY[sc.timeOfDay]);
    // same households and shared-stream state as Today's model, checked on a separate copy
    const probe = build(), key = probe.householdOutcomes().key, u = probe.rand();
    if (k === 'today') { out.key0 = key; out.u0 = u; }
    else if (key !== out.key0 || u !== out.u0) { bad++; console.log(`FAIL seed ${seed} ${k}: households or shared stream differ from Today's model`); }
    const a = build(), S = a.runToEnd(), b = reshuffle(build()), S2 = b.runToEnd();
    out[k] = { S, S2, O: a.householdOutcomes(), O2: b.householdOutcomes() };
  }
  const H = out.habit, hw = worstOf(H.O, H.O2);
  for (const k of names) {
    const { S, S2, O, O2 } = out[k], w = worseOff(H.O, O, thr), wb = worseOff(hw, bestOf(O, O2), thr), better = worseOff(O, H.O, thr);
    // totals: mean of the two serving orders
    const mean = f => { const x = f(S), y = f(S2); return x == null || y == null ? null : Math.round((x + y) / 2); };
    const row = { seed, v: k, embers: mean(embers), fireFront: mean(s => s.fireFrontHome + s.fireFrontRoad), cutOff: mean(s => s.vehiclesNoRoute), p90: mean(s => s.clearP90),
      followers: S.routing?.followers ?? null, offered: S.routing?.offered ?? null, declined: S.routing?.declined ?? null,
      worse: w.households, beyond: wb.households, beyondLevel: wb.embers + wb.fireFront + wb.cutOff, beyondCut: wb.cutOff, beyondWorstMin: Math.round(wb.worstDelayMin),
      better: better.households, gainMin: w.meanGainMin == null ? null : +w.meanGainMin.toFixed(2), chance: worseOff(O, O2, thr).households };
    rows.push(row); console.log(JSON.stringify(row));
  }
}
const med = v => { const s = v.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rng = v => { const s = v.filter(x => x != null); return s.length ? `${Math.min(...s)}–${Math.max(...s)}` : '—'; };
console.log(`\n${sc.id} ${sev}, ${nSeeds} seeds: median [range]. Households against Habit: worse off; beyond chance (worse under both runs of the option than under both Habit runs), of which embers/fire front/cut off; chance alone (option against its rerun)`);
for (const k of names) {
  const r = rows.filter(x => x.v === k), f = key => `${med(r.map(x => x[key]))} [${rng(r.map(x => x[key]))}]`;
  console.log(`${k.padEnd(9)} embers ${f('embers')}  fire front ${f('fireFront')}  cut off ${f('cutOff')}  p90 ${med(r.map(x => x.p90))} (not reached ${r.filter(x => x.p90 == null).length})  worse ${f('worse')}  beyond chance ${f('beyond')} level ${f('beyondLevel')} worst ${Math.max(...r.map(x => x.beyondWorstMin))} min  better ${f('better')}  gain ${med(r.map(x => x.gainMin))} min  chance ${f('chance')}`);
}
if (bad) { console.log(`\n${bad} runs with different households`); process.exit(1); }
