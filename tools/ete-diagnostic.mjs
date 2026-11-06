#!/usr/bin/env node
// Splits the simulator's evacuation time (ETE, as the 2025 Evacuation Time Study measures it) into departure time and
// road time, to find where the simulator is faster than the study (SOURCE_NOTES CD1-CD7). Same setup as
// tests/calibration.mjs: fire off, the study's order and warning zones, today's plan with the first order at ignition,
// the Time Study's citywide household mix. For every vehicle that starts in an order zone it records the planned
// departure (Time Study Table 5-9 histograms), the time it got onto the road, and the time it left the order area,
// then reports 90th percentiles, shares started and out at 1 h and 2 h, and road time by minutes after the order
// the car got onto the road (compare SOURCE_NOTES E23). Report only; changes no model file.
//
//   node tools/ete-diagnostic.mjs [seeds=3] [--out file.json]
//   REGIONS=ref1923,eastWind CASES=S4,S6 node tools/ete-diagnostic.mjs
//
// Synthetic households, fire off: a check of the traffic model against the study, not a prediction.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(R);
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid } = await import(R + '/js/fire.js');
const { makeScenarios, TIME_OF_DAY, ETE_TARGETS } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity), W: grid.W, H: grid.H, spots: 0, LB: 1 };
const seeds = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 3);
const world = { growth: 'none', householdMix: 'citywide' };
const plan = { ...DEFAULT_PLAN, alertKm: 0, orderDelayMin: 0 };
const REGIONS = (process.env.REGIONS || 'ref1923,eastWind,northHills,panoramic').split(','), CASES = (process.env.CASES || 'S4,S6').split(',');
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const med = a => q(a, 0.5);
const out = {};
for (const sc of makeScenarios(data).filter(s => REGIONS.includes(s.id))) for (const tk of CASES) {
  const agg = { planned: [], entry: [], exit: [], wait: [], road: [], byEntry: {}, n: 0, nOut: 0, p90: [], p90plan: [], p90entry: [], sh60: [], sh120: [], ex60: [], ex120: [] };
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = new Evacuation(data, grid, noFire, { ...sc, durationMin: 360 }, 'central', plan, seed, TIME_OF_DAY[tk], world);
    const entryT = new Float64Array(sim.v.n).fill(Infinity), enter0 = sim.enter.bind(sim);
    sim.enter = i => { const ok = enter0(i); if (ok && entryT[i] === Infinity) entryT[i] = sim.t; return ok; };
    const S = sim.runToEnd(); const v = sim.v, T0 = sim.firstOrderT;
    const P = [], E = [], X = [];
    for (let i = 0; i < v.n; i++) {
      if (v.cls[i] || v.state[i] === 4 || v.fromOrder[i] !== 1) continue;
      const pl = (v.depart[i] - T0) / 60, en = (entryT[i] - T0) / 60, x = (Math.min(v.exit[i], v.zarr[i]) - T0) / 60;
      P.push(pl); E.push(en); X.push(x); agg.n++;
      if (isFinite(en)) { agg.wait.push(en - pl); if (isFinite(x)) { agg.road.push(x - en); const b = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180].find(c => Math.abs(en - c) <= 7.5); if (b != null) (agg.byEntry[b] ||= []).push(x - en); } }
    }
    const fin = a => a.map(x => isFinite(x) ? x : 1e9);
    agg.p90.push(q(fin(X), 0.9)); agg.p90plan.push(q(P, 0.9)); agg.p90entry.push(q(fin(E), 0.9));
    agg.sh60.push(P.filter(x => x <= 60).length / P.length); agg.sh120.push(P.filter(x => x <= 120).length / P.length);
    agg.ex60.push(X.filter(x => x <= 60).length / X.length); agg.ex120.push(X.filter(x => x <= 120).length / X.length);
    process.stderr.write(`${sc.id} ${tk} seed ${seed}: p90 ${S.clearP90?.toFixed(1)}\n`);
  }
  const r1 = x => x == null ? null : +x.toFixed(1);
  out[`${sc.id}|${tk}`] = { region: ETE_TARGETS[sc.id]?.region, studyP90: ETE_TARGETS[sc.id]?.p90?.[tk], orderVehiclesPerSeed: Math.round(agg.n / seeds),
    p90Exit: r1(med(agg.p90)), p90PlannedDeparture: r1(med(agg.p90plan)), p90Entry: r1(med(agg.p90entry)),
    startedBy60: r1(100 * med(agg.sh60)), startedBy120: r1(100 * med(agg.sh120)), outBy60: r1(100 * med(agg.ex60)), outBy120: r1(100 * med(agg.ex120)),
    waitToEnter: { median: r1(med(agg.wait)), p90: r1(q(agg.wait, 0.9)) }, roadTime: { median: r1(med(agg.road)), p90: r1(q(agg.road, 0.9)) },
    roadTimeByEntryMin: Object.fromEntries(Object.entries(agg.byEntry).map(([k, a]) => [k, { n: a.length, median: r1(med(a)), p90: r1(q(a, 0.9)) }])) };
  console.log(JSON.stringify({ [`${sc.id}|${tk}`]: out[`${sc.id}|${tk}`] }));
}
const oi = process.argv.indexOf('--out');
if (oi > 0) fs.writeFileSync(process.argv[oi + 1], JSON.stringify(out, null, 1) + '\n');
