#!/usr/bin/env node
// Simple-view question test (SOURCE_NOTES P19): every question in js/presets.js on every Simple-view fire,
// Plan A and Plan B on the same fire and seed, low/central/high severity × seeds 1–5, in the Simple view's
// world (no growth, no power shutoff, today's fuel). A question is offered on a fire when Plan B beats Plan A
// on its headline measure in all 15 pairs and the central-severity median changes by 5% or more; a missing
// 90% time counts as a failure. Prints the win count, the central medians behind each "What to look for" text,
// and writes them to --out (default data/model/simple-questions.json).
//
//   node tools/simple-questions.mjs [--workers N] [--mix place|citywide] [--seeds 5] [--out file] [--fires a,b]
//
// --fires: run only the fires named and keep every other fire's saved entries in the output file (added 2026-11-13
// for the west-wind fire, SOURCE_NOTES FF24); meta records the date of each fire's run in fireBuilt.
//
// --mix citywide reruns the test on the Time Study's citywide household mix (the default before DM18).
// Educational comparison, not a prediction. "People still there when embers arrived" is not a casualty count.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEVS = ['low', 'central', 'high'];

// Central medians reported per plan; the "What to look for" texts quote these.
const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const MEASURES = {
  exposed, clearP90: S => S.clearP90, orderVehicles: S => S.orderVehicles, otherCityVehicles: S => S.otherCityVehicles,
  vehicles: S => S.vehicles, noVehicleNoRide: S => S.noVehicle, engineBeyond5: S => S.engineReachBeyond5People,
  engineHillPeople: S => S.engineReachHillPeople, engineShareIgnition: S => S.engineReach5Share, engineShareEnd: S => S.engineReach5ShareNow,
  engineBlockedSegments: S => S.engineBlockedSegments,
};
// Extra plans quoted in a "What to look for" text, run on the same draws as the question's Plan B.
const EXTRA = { leaveEarly: { Blez: { earlyZones: 'lez' } } };

async function setup() {
  const { loadData } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation } = await import(R + '/js/sim.js');
  const { PRESETS } = await import(R + '/js/presets.js');
  const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.resolve(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
  const grid = buildFireGrid(data);
  const scen = Object.fromEntries(makeScenarios(data).map(s => [s.id, s]));
  return { data, grid, scen, runFire, SEVERITY, TIME_OF_DAY, Evacuation, PRESETS };
}

if (!isMainThread) {
  const E = await setup();
  const world = { growth: 'none', powerShutoff: 'none', ...(workerData.mix === 'citywide' ? { householdMix: 'citywide' } : {}) };
  parentPort.on('message', j => {
    if (!j) { process.exit(0); }
    const sc = E.scen[j.fire], fire = E.runFire(E.grid, sc, E.SEVERITY[j.sev], j.seed), out = {};
    for (const P of E.PRESETS) {
      out[P.id] = {};
      const plans = { A: P.A, B: P.B, ...Object.fromEntries(Object.entries(EXTRA[P.id] || {}).map(([k, d]) => [k, { ...P.B, ...d }])) };
      for (const [k, plan] of Object.entries(plans)) {
        const tod = P.tods?.[k] ?? P.tods?.B ?? P.tod;
        const S = new E.Evacuation(E.data, E.grid, fire, sc, j.sev, plan, j.seed, E.TIME_OF_DAY[tod], world).runToEnd();
        out[P.id][k] = { headline: P.headline.f(S), ...Object.fromEntries(Object.entries(MEASURES).map(([m, f]) => [m, f(S)])) };
      }
    }
    parentPort.postMessage({ j, out });
  });
  parentPort.postMessage(null);
} else {
  const workers = +arg('--workers', Math.max(1, os.cpus().length - 1)), mix = arg('--mix', 'place'), seeds = +arg('--seeds', 5);
  const outFile = arg('--out', path.join(R, 'data/model/simple-questions.json'));
  const { FIRES, PRESETS } = await import(R + '/js/presets.js');
  const only = arg('--fires', null)?.split(','), RUN = only ? FIRES.filter(F => only.includes(F.id)) : FIRES;
  if (only && RUN.length !== only.length) throw new Error(`--fires: unknown fire in ${only}`);
  const prev = only && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile)) : null;
  const jobs = []; for (const F of RUN) for (const sev of SEVS) for (let seed = 1; seed <= seeds; seed++) jobs.push({ fire: F.id, sev, seed });
  const res = [], t0 = Date.now();
  await new Promise(done => {
    let next = 0, live = workers;
    for (let w = 0; w < workers; w++) {
      const W = new Worker(SELF, { workerData: { mix } });
      W.on('message', m => {
        if (m) { res.push(m); process.stderr.write(`\r${res.length}/${jobs.length}`); }
        if (next < jobs.length) W.postMessage(jobs[next++]); else { W.postMessage(null); if (--live === 0) done(); }
      });
      W.on('error', e => { console.error(e); process.exit(1); });
    }
  });
  process.stderr.write('\n');
  const med = a => { const v = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return v.length === a.length && v.length ? v[Math.floor(v.length / 2)] : null; };
  const result = { meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/simple-questions.mjs', householdMix: mix, seeds, severities: SEVS, rule: 'SOURCE_NOTES P19: Plan B better on the headline in every pair and a central median change of 5% or more; a missing 90% time fails', runs: jobs.length * PRESETS.reduce((n, P) => n + 2 + Object.keys(EXTRA[P.id] || {}).length, 0), wallMin: +((Date.now() - t0) / 60000).toFixed(1), workers }, questions: {} };
  if (prev) { result.meta.runs = prev.meta.runs + result.meta.runs; result.meta.fireBuilt = { ...Object.fromEntries(FIRES.map(F => [F.id, prev.meta.fireBuilt?.[F.id] ?? prev.meta.built])), ...Object.fromEntries(RUN.map(F => [F.id, result.meta.built])) }; }
  for (const P of PRESETS) {
    result.questions[P.id] = {};
    for (const F of FIRES) {
      if (!RUN.includes(F)) { if (prev?.questions?.[P.id]?.[F.id]) result.questions[P.id][F.id] = prev.questions[P.id][F.id]; continue; }
      const rows = res.filter(r => r.j.fire === F.id);
      let wins = 0;
      for (const r of rows) { const a = r.out[P.id].A.headline, b = r.out[P.id].B.headline; if (a != null && b != null && (b - a) * P.headline.dir > 0) wins++; }
      const cen = rows.filter(r => r.j.sev === 'central');
      const medians = Object.fromEntries(['A', 'B', ...Object.keys(EXTRA[P.id] || {})].map(k => [k, {}]));
      for (const k in medians) for (const m of ['headline', ...Object.keys(MEASURES)]) medians[k][m] = med(cen.map(r => r.out[P.id][k][m]));
      const change = medians.A.headline && medians.B.headline != null ? (medians.B.headline - medians.A.headline) / medians.A.headline : null;
      const offered = wins === rows.length && change != null && Math.abs(change) >= 0.05;
      result.questions[P.id][F.id] = { wins, pairs: rows.length, centralChange: change == null ? null : +change.toFixed(4), offered, offeredNow: !!P.on[F.id], medians };
      console.log(`${P.id.padEnd(15)} ${F.id.padEnd(11)} ${String(wins).padStart(2)}/${rows.length}  central ${change == null ? '  —  ' : (100 * change).toFixed(1).padStart(6) + '%'}  ${offered ? 'offer' : 'withhold'}${offered !== !!P.on[F.id] ? '  <-- differs from js/presets.js' : ''}  A ${medians.A.headline?.toFixed(1)}  B ${medians.B.headline?.toFixed(1)}`);
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n');
  console.log(`${result.meta.runs} runs, ${result.meta.wallMin} min on ${workers} workers; wrote ${path.relative(R, outFile)}`);
}
