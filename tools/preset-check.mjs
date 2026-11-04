#!/usr/bin/env node
// The Simple-view question test (SOURCE_NOTES P19 rule): every question in js/presets.js on every fire in
// FIRES, Plan A against Plan B on the same draws, low/central/high severity × seeds 1–5, the question's own
// time of day, the Simple view's world (no growth, no power shutoff), the fire-zone proxy fuel. A question is
// offered on a fire if Plan B beats Plan A on the headline measure in 15 of 15 pairs and the central-severity
// median changes by 5% or more; a missing 90% time counts as a failure. Report only: it prints the verdicts and
// the central medians the "What to look for" texts quote, and writes data/model/preset-check.json; the texts
// in js/presets.js are edited by hand from it.
//
// Also runs "leave early" with only the City's Leave Early Zones (Plan B earlyZones 'lez'), which the texts quote.
//
//   node tools/preset-check.mjs [--workers 4] [--fires a,b] [--presets a,b]
//
// Educational comparison, not a prediction. "People still there when embers arrived" is not a casualty count.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(R);
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const { PRESETS, FIRES } = await import('../js/presets.js');
const SEVS = ['low', 'central', 'high'], SEEDS = [1, 2, 3, 4, 5];
const WORLD = { growth: 'none', powerShutoff: 'none' };

// Question variants: each preset as written, plus leave early in the Leave Early Zones only.
const variants = () => {
  const v = PRESETS.map(p => ({ id: p.id, p }));
  const le = PRESETS.find(p => p.id === 'leaveEarly');
  if (le) v.push({ id: 'leaveEarlyLEZ', p: { ...le, B: { ...le.B, name: 'B: half of Leave Early Zone households leave', earlyZones: 'lez' } } });
  return v;
};

if (argv[0] === '--worker') {
  const [, fin, fout] = argv;
  const { loadData } = await import('../js/data.js');
  const { buildFireGrid, runFire } = await import('../js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import('../js/scenarios.js');
  const { Evacuation } = await import('../js/sim.js');
  const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
  const grid = buildFireGrid(data), scen = makeScenarios(data), V = Object.fromEntries(variants().map(v => [v.id, v.p]));
  const fires = new Map(), out = [];
  for (const j of JSON.parse(fs.readFileSync(fin))) {
    const sc = scen.find(s => s.id === j.fire), p = V[j.variant], key = `${j.fire}|${j.sev}|${j.seed}`;
    if (!fires.has(key)) fires.set(key, runFire(grid, sc, SEVERITY[j.sev], j.seed));
    const tod = p.tods?.[j.plan] ?? p.tod;
    const S = new Evacuation(data, grid, fires.get(key), sc, j.sev, { ...p[j.plan] }, j.seed, TIME_OF_DAY[tod], { ...WORLD }).runToEnd();
    out.push({ ...j, headline: p.headline.f(S), clearP90: S.clearP90, orderVehicles: S.orderVehicles, vehicles: S.vehicles,
      engineBeyond5: S.engineReachBeyond5People, engineShareEnd: S.engineReach5ShareNow, hillPeople: S.engineReachHillPeople });
  }
  fs.writeFileSync(fout, JSON.stringify(out));
  process.exit(0);
}

const WORKERS = +arg('--workers', Math.max(1, os.cpus().length));
const onlyFires = arg('--fires', null)?.split(','), onlyPresets = arg('--presets', null)?.split(',');
const V = variants().filter(v => !onlyPresets || onlyPresets.includes(v.id));
const F = FIRES.map(f => f.id).filter(f => !onlyFires || onlyFires.includes(f));
const jobs = [];
for (const v of V) for (const fire of F) for (const sev of SEVS) for (const seed of SEEDS) for (const plan of ['A', 'B']) jobs.push({ variant: v.id, fire, sev, seed, plan });
// Group by fire, severity and seed so each worker builds each fire once.
jobs.sort((a, b) => `${a.fire}|${a.sev}|${a.seed}`.localeCompare(`${b.fire}|${b.sev}|${b.seed}`));
const parts = Array.from({ length: WORKERS }, () => []);
const groups = new Map(); for (const j of jobs) { const k = `${j.fire}|${j.sev}|${j.seed}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); }
[...groups.values()].forEach((g, i) => parts[i % WORKERS].push(...g));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-check-'));
const t0 = Date.now();
console.log(`${V.length} questions × ${F.length} fires: ${jobs.length} runs on ${WORKERS} workers`);
const rows = (await Promise.all(parts.map(async (p, i) => {
  const fin = path.join(tmp, `in${i}.json`), fout = path.join(tmp, `out${i}.json`);
  fs.writeFileSync(fin, JSON.stringify(p));
  await promisify(execFile)(process.execPath, ['--max-old-space-size=4096', SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
  return JSON.parse(fs.readFileSync(fout));
}))).flat();
const wallMin = Math.round((Date.now() - t0) / 6000) / 10;

const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const result = {};
for (const v of V) for (const fire of F) {
  const dir = v.p.headline.dir, pairs = [];
  for (const sev of SEVS) for (const seed of SEEDS) {
    const a = rows.find(r => r.variant === v.id && r.fire === fire && r.sev === sev && r.seed === seed && r.plan === 'A');
    const b = rows.find(r => r.variant === v.id && r.fire === fire && r.sev === sev && r.seed === seed && r.plan === 'B');
    const win = a.headline != null && b.headline != null && (b.headline - a.headline) * dir > 0;
    pairs.push({ sev, seed, a, b, win });
  }
  const cen = pairs.filter(x => x.sev === 'central');
  const mA = med(cen.map(x => x.a.headline)), mB = med(cen.map(x => x.b.headline));
  const change = mA ? (mB - mA) / mA : null;
  const wins = pairs.filter(x => x.win).length;
  const pass = wins === pairs.length && change != null && Math.abs(change) >= 0.05;
  const m = (k, plan) => med(cen.map(x => x[plan.toLowerCase()][k]));
  result[`${v.id}|${fire}`] = { question: v.id, fire, wins, pairs: pairs.length, pass, centralA: mA, centralB: mB, change,
    byRun: pairs.map(x => x.a.headline ? (x.b.headline - x.a.headline) / x.a.headline : null),
    central: Object.fromEntries(['clearP90', 'orderVehicles', 'vehicles', 'engineBeyond5', 'engineShareEnd', 'hillPeople'].map(k => [k, { A: m(k, 'A'), B: m(k, 'B') }])),
    missingP90: pairs.filter(x => x.a.clearP90 == null || x.b.clearP90 == null).length };
}
const pct = x => x == null ? '—' : `${(x * 100).toFixed(1)}%`;
for (const r of Object.values(result)) {
  const br = r.byRun.filter(x => x != null);
  console.log(`${r.pass ? 'ON ' : 'OFF'} ${r.question.padEnd(15)} ${r.fire.padEnd(10)} B better ${r.wins}/${r.pairs}; central median ${r.centralA?.toFixed?.(1)} → ${r.centralB?.toFixed?.(1)} (${pct(r.change)}; runs ${pct(Math.min(...br))} to ${pct(Math.max(...br))}); 90% ${r.central.clearP90.A?.toFixed(1)} → ${r.central.clearP90.B?.toFixed(1)} min; missing 90% times ${r.missingP90}; order vehicles ${r.central.orderVehicles.A} → ${r.central.orderVehicles.B}; engine beyond 5 min ${r.central.engineBeyond5.A} → ${r.central.engineBeyond5.B}, share at end ${pct(r.central.engineShareEnd.A)} → ${pct(r.central.engineShareEnd.B)}`);
}
fs.writeFileSync('data/model/preset-check.json', JSON.stringify({ meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/preset-check.mjs', rule: 'B better in 15 of 15 pairs and central median change ≥ 5%; missing 90% time fails', severities: SEVS, seeds: SEEDS, world: WORLD, wallMin }, result }, null, 1));
console.log(`done in ${wallMin} min; wrote data/model/preset-check.json`);
