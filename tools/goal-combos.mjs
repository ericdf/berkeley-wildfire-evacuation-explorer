#!/usr/bin/env node
// Goal seek ("Set a goal" in the Simple view; Eric, 2026-11-02, SOURCE_NOTES GS1–GS4): every combination
// of up to three changes from "Change the plan", run on each fire over the same 15 passes as a
// comparison, with today's plan on the same draws. The browser answers a goal from this table at once.
//
//   node tools/goal-combos.mjs [--fires a,b] [--merge] [--workers N] [--max-size 3] [--limit N] [--out file]
//        writes data/model/goal-combos.json
//   --merge (with --fires): run only the fires named, on every pass the saved output holds (including
//        any added with --add-seeds), and keep the saved fires of the existing output.
//   --limit N: only the first N combinations per fire (a quick test).
//   --only ID (with --merge): rerun only the combinations that include change ID, on every fire named
//        (or all), on every pass the saved output holds, and keep every other saved combination; for a change whose definition was rebuilt
//        in data/model/mitigations.json. The candidates and left-out changes must match the saved ones.
//   --add-seeds A-B [--sevs central,high] (with --merge): run every saved combination on seeds A..B at
//        those severities and append them; the first half are search seeds, the second half held out
//        (Eric, 2026-11-03: 10 search and 10 held-out passes at each Simple-view pace).
//
// Runs use the browser's own code path (js/worker.js): js/levers.js stackOf and dataFor build each
// stack, js/mitigate.js MEASURES reads the outcomes, the world is the Simple view's (no growth, no
// power shutoff), time of day S6 (fall night), severities low/central/high × seeds 1–5.
//
// Each combination runs 30 passes: 15 search passes (seeds 1–5) and 15 held-out passes (seeds 6–10).
//
// Which changes are combined: those in data/model/mitigations.json that reliably helped on the fire
// on some measure when tried alone (js/mitigate.js stored(): better in every pass, or in at least
// three of four and never worse). The rest are listed in the output with their stored verdict, so the
// page can say they were tested (Eric, 2026-11-02: keep the notice that contraflow doesn't help).
// Two changes that rewrite the same street or set the same plan key are alternatives (js/levers.js
// conflict) and never combined.
//
// Chunks (one fire|severity|seed each) are cached in --cache (default: the OS temp folder) so a
// stopped run resumes. Educational comparison, not a prediction.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const TOD = 'S6';
const MK = ['ember', 'front', 'cutOff', 'engine', 'clear90'];
const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;

if (argv[0] === '--worker') {
  const { jobs } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const { loadData } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation } = await import(R + '/js/sim.js');
  const { stackOf, dataFor } = await import(R + '/js/levers.js');
  const { MEASURES } = await import(R + '/js/mitigate.js');
  const M = JSON.parse(fs.readFileSync(path.join(R, 'data/model/mitigations.json'), 'utf8'));
  const byId = Object.fromEntries(M.levers.map(l => [l.id, l]));
  const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const base = await loadData(load), grid = buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
  const fires = new Map(), out = [];
  for (const j of jobs) {
    const sc = scen[j.fire], fk = `${j.fire}|${j.sev}|${j.seed}`;
    if (!fires.has(fk)) { fires.clear(); fires.set(fk, runFire(grid, sc, SEVERITY[j.sev], j.seed)); }
    const st = stackOf(j.ids.map(id => byId[id]));
    const sim = new Evacuation(dataFor(base, st.net), grid, fires.get(fk), sc, j.sev, st.plan, j.seed, TIME_OF_DAY[TOD], { growth: 'none', powerShutoff: 'none', ...st.world });
    const S = sim.runToEnd();
    out.push({ key: j.key, fire: j.fire, sev: j.sev, seed: j.seed, m: MK.map(k => r2(MEASURES[k].f(S))) });
  }
  fs.writeFileSync(argv[2], JSON.stringify(out));
  process.exit(0);
}

const { stackable, conflict, stackOf } = await import(R + '/js/levers.js');
const OUT = arg('--out', path.join(R, 'data/model/goal-combos.json'));
const M = JSON.parse(fs.readFileSync(path.join(R, 'data/model/mitigations.json'), 'utf8'));
const FIRES = M.meta.fires, SEVS = M.meta.severities;
// Search seeds are the comparison's (1–5). Held-out seeds (6–10) are never used to pick an answer: an
// answer is shown as holding only if it also meets the goal on them, since checking hundreds of
// combinations on the same 15 passes finds some that clear a target by luck (Eric, 2026-11-02).
const SEARCH = M.meta.seeds, HOLD = SEARCH.map(s => s + SEARCH.length), SEEDS = [...SEARCH, ...HOLD];
const MERGE = argv.includes('--merge') && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
// --add-seeds extends every fire in the saved output
const runFires = arg('--fires', null)?.split(',') ?? (argv.includes('--add-seeds') && MERGE ? Object.keys(MERGE.fires) : FIRES);
for (const f of runFires) if (!FIRES.includes(f)) throw new Error(`unknown fire ${f}`);
const ONLY = arg('--only', null);
if (ONLY && !MERGE) throw new Error('--only needs --merge and an existing output');
const ADD = arg('--add-seeds', null)?.split('-').map(Number);
if (ADD && (!MERGE || ONLY || arg('--fires', null))) throw new Error('--add-seeds needs --merge, every fire, and no --only');
const ADD_SEEDS = ADD ? Array.from({ length: ADD[1] - ADD[0] + 1 }, (_, i) => ADD[0] + i) : [];
if (ADD && (ADD_SEEDS.length < 2 || ADD_SEEDS.length % 2)) throw new Error('--add-seeds needs an even number of seeds');
const ADD_SEVS = arg('--sevs', 'central,high').split(',');
const ADD_SEARCH = ADD_SEEDS.slice(0, ADD_SEEDS.length / 2), ADD_HOLD = ADD_SEEDS.slice(ADD_SEEDS.length / 2);
if (ADD && ADD_SEEDS.some(x => (MERGE.meta.searchSeeds || []).includes(x) || (MERGE.meta.holdoutSeeds || []).includes(x))) throw new Error('--add-seeds: seeds already in the output');
const MAXK = +arg('--max-size', 3), LIMIT = +arg('--limit', 0), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const CACHE = arg('--cache', path.join(os.tmpdir(), 'goal-combos-cache'));
fs.mkdirSync(CACHE, { recursive: true });

// The stored verdict of one change on one fire (same rule as js/mitigate.js stored()).
const verdict = (id, fire) => {
  const s = M.summaries.find(x => x.lever === id && x.fire === fire); if (!s) return null;
  const ms = Object.entries(s.measures);
  return { reliable: ms.some(([, m]) => m.holds || (m.worse === 0 && m.better >= Math.ceil(m.n * 0.75))),
    harms: ms.filter(([, m]) => m.better === 0 && m.worse >= Math.ceil(m.n * 0.75)).map(([k, m]) => ({ measure: k, worse: m.worse, n: m.n })), runs: s.runs };
};
const all = M.levers.filter(stackable);
const plan = {};
for (const fire of runFires) {
  const cand = all.filter(l => verdict(l.id, fire)?.reliable);
  const excluded = all.filter(l => !cand.includes(l)).map(l => ({ id: l.id, ...(verdict(l.id, fire) || { reliable: false, harms: [], runs: 0 }) }));
  const combos = [[]];
  const grow = (start, cur) => { if (cur.length) combos.push(cur); if (cur.length === MAXK) return;
    for (let i = start; i < cand.length; i++) if (cur.every(x => !conflict(x, cand[i]))) grow(i + 1, [...cur, cand[i]]); };
  grow(0, []);
  combos.sort((a, b) => a.length - b.length);
  let use = LIMIT ? combos.slice(0, LIMIT + 1) : combos;
  if (ONLY) {
    const saved = MERGE.fires[fire];
    if (!saved || JSON.stringify(saved.candidates) !== JSON.stringify(cand.map(l => l.id))) throw new Error(`--only: ${fire}'s candidates differ from the saved output; rebuild the fire in full`);
    if (!cand.some(l => l.id === ONLY)) throw new Error(`--only: ${ONLY} is not a candidate on ${fire}`);
    use = use.filter(ls => ls.some(l => l.id === ONLY));
  }
  if (ADD) {
    const saved = MERGE.fires[fire];
    if (!saved || JSON.stringify(saved.candidates) !== JSON.stringify(cand.map(l => l.id))) throw new Error(`--add-seeds: ${fire}'s candidates differ from the saved output`);
    const keys = use.map(ls => ls.length ? stackOf(ls).key : '');
    if (keys.length !== Object.keys(saved.runs).length || keys.some(k => !(k in saved.runs))) throw new Error(`--add-seeds: ${fire}'s combinations differ from the saved output`);
  }
  plan[fire] = { candidates: cand.map(l => l.id), excluded, combos: use.map(ls => ({ ids: ls.map(l => l.id), key: ls.length ? stackOf(ls).key : '' })) };
  console.log(`${fire}: ${cand.length} changes combined, ${excluded.length} left out, ${use.length - 1} combinations + today's plan`);
}

const chunks = [];
// --merge (with or without --only) reruns every pass the saved output holds, including any added with
// --add-seeds, so a partial rebuild never drops passes from the fires it keeps.
const KEEP = MERGE && !ADD;
if (KEEP && !MERGE.meta?.cases) throw new Error('--merge: the saved output has no cases; rebuild in full');
const JOBS = ADD ? ADD_SEVS.flatMap(sev => ADD_SEEDS.map(seed => [sev, seed]))
  : KEEP ? MERGE.meta.cases.map(k => k.split('|')).map(([sev, seed]) => [sev, +seed])
  : SEVS.flatMap(sev => SEEDS.map(seed => [sev, seed]));
for (const fire of runFires) for (const [sev, seed] of JOBS)
  chunks.push(plan[fire].combos.map(c => ({ fire, sev, seed, ids: c.ids, key: c.key })));
// A chunk's cache key: its jobs, the levers' definitions and the model they run on: every module in
// js/ and every data file in data/model/ and data/, except this tool's own output (a list of named
// files missed js/guidance.js, js/operations.js and data/model/layers.json, which sim.js and data.js load).
const codeHash = crypto.createHash('sha1');
const MODEL = [['js', /\.js$/], ['data/model', /\.json$/], ['data', /\.json$/]].flatMap(([d, re]) =>
  fs.readdirSync(path.join(R, d)).filter(f => re.test(f) && !/^goal-combos/.test(f)).sort().map(f => `${d}/${f}`));
for (const f of MODEL) codeHash.update(f + '\0').update(fs.readFileSync(path.join(R, f)));
const CODE = codeHash.digest('hex');
const hashOf = c => crypto.createHash('sha1').update(JSON.stringify(c) + JSON.stringify(M.levers.filter(l => c.some(j => j.ids.includes(l.id))).map(l => l.delta)) + CODE).digest('hex').slice(0, 16);
const total = chunks.reduce((s, c) => s + c.length, 0);
console.log(`${total} runs in ${chunks.length} chunks on ${WORKERS} workers (cache ${CACHE})`);
const t0 = Date.now();
let next = 0, doneRuns = 0;
const results = [];
async function lane() {
  while (next < chunks.length) {
    const c = chunks[next++], h = hashOf(c), fout = path.join(CACHE, `${h}.json`);
    if (!fs.existsSync(fout)) {
      const fin = path.join(CACHE, `${h}.in.json`);
      fs.writeFileSync(fin, JSON.stringify({ jobs: c }));
      await promisify(execFile)(process.execPath, ['--max-old-space-size=4096', SELF, '--worker', fin, fout + '.part'], { maxBuffer: 1 << 26 });
      fs.renameSync(fout + '.part', fout); fs.rmSync(fin);
    }
    results.push(...JSON.parse(fs.readFileSync(fout, 'utf8')));
    doneRuns += c.length;
    const min = (Date.now() - t0) / 60000;
    console.log(`${c[0].fire}|${c[0].sev}|${c[0].seed} done: ${doneRuns}/${total} runs, ${min.toFixed(1)} min`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, lane));
const wallMin = Math.round((Date.now() - t0) / 6000) / 10;

// Cases in a fixed order: the search passes (severity, then seed), then the held-out passes.
const newCases = KEEP ? MERGE.meta.cases : ADD ? [...ADD_SEVS.flatMap(sev => ADD_SEARCH.map(seed => `${sev}|${seed}`)), ...ADD_SEVS.flatMap(sev => ADD_HOLD.map(seed => `${sev}|${seed}`))]
  : [...SEVS.flatMap(sev => SEARCH.map(seed => `${sev}|${seed}`)), ...SEVS.flatMap(sev => HOLD.map(seed => `${sev}|${seed}`))];
const cases = ADD ? [...MERGE.meta.cases, ...newCases] : newCases;
const searchSeeds = ADD ? [...MERGE.meta.searchSeeds, ...ADD_SEARCH] : KEEP ? MERGE.meta.searchSeeds : SEARCH;
const holdoutSeeds = ADD ? [...MERGE.meta.holdoutSeeds, ...ADD_HOLD] : KEEP ? MERGE.meta.holdoutSeeds : HOLD;
const byRun = new Map(results.map(x => [`${x.fire}|${x.key}|${x.sev}|${x.seed}`, x.m]));
const firesOut = MERGE ? Object.fromEntries(Object.entries(MERGE.fires).filter(([f]) => ONLY || !runFires.includes(f))) : {};
for (const fire of runFires) {
  const runs = ONLY ? { ...MERGE.fires[fire].runs } : {};
  for (const c of plan[fire].combos) runs[c.key] = [...(ADD ? MERGE.fires[fire].runs[c.key] : []), ...newCases.map(k => byRun.get(`${fire}|${c.key}|${k}`) ?? null)];
  firesOut[fire] = { candidates: plan[fire].candidates, excluded: plan[fire].excluded, runs };
  if (ONLY && Object.keys(runs).length !== Object.keys(MERGE.fires[fire].runs).length) throw new Error(`--only: ${fire} gained combinations`);
}

// Check: single changes and today's plan reproduce the stored table on the measures defined alike
// (ember, cutOff, engine, clear90; the table's "front" counts people at home only). Every fire in the
// output is checked, saved or new, against the table as it is now.
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 0.01 + 1e-6 * Math.abs(b));
let checked = 0, agree = 0; const off = [];
for (const fire of Object.keys(firesOut)) for (const [key, rows] of Object.entries(firesOut[fire].runs)) {
  if (key.includes('+')) continue;
  const lever = key || 'baseline';
  cases.forEach((k, i) => { const [sev, seed] = k.split('|'); const t = M.runs.find(r => r.lever === lever && r.fire === fire && r.sev === sev && r.seed === +seed); if (!t || !rows[i]) return;
    checked++; const ok = ['ember', 'cutOff', 'engine', 'clear90'].every(m => same(rows[i][MK.indexOf(m)], r2(t.m[m]))); ok ? agree++ : off.length < 5 && off.push(`${fire} ${lever} ${k}`); });
}
console.log(`check against data/model/mitigations.json: ${agree} of ${checked} single-change and baseline runs agree${off.length ? `; first differences: ${off.join(', ')}` : ''}`);

const extraSevs = SEVS.filter(sv => cases.some(k => k.startsWith(sv + '|') && !SEEDS.includes(+k.split('|')[1])));
const prevRuns = MERGE ? MERGE.meta.runs : 0, prevMin = MERGE ? MERGE.meta.wallMin : 0;
const meta = {
  built: new Date().toISOString().slice(0, 10), tool: 'tools/goal-combos.mjs',
  note: `Every combination of up to three changes that reliably helped alone on the fire, against today's plan on the same draws: low, medium and high severity × search seeds 1–5 and held-out seeds 6–10${searchSeeds.length > SEARCH.length ? `, plus ${extraSevs.join(' and ')} severity × search seeds ${searchSeeds.slice(SEARCH.length).join(', ')} and held-out seeds ${holdoutSeeds.slice(HOLD.length).join(', ')}` : ''}. Synthetic households on an illustrative fire; an educational comparison, not a prediction.`,
  baseline: 'DEFAULT_PLAN (js/sim.js), Time Study case S6 (fall night), no growth, no power shutoff', timeOfDay: TOD,
  fires: Object.keys(firesOut), severities: SEVS, searchSeeds, holdoutSeeds, cases, nSearch: cases.filter(k => searchSeeds.includes(+k.split('|')[1])).length, measures: MK, maxSize: MAXK,
  runs: prevRuns + total, wallMin: Math.round((prevMin + wallMin) * 10) / 10, workers: WORKERS,
  check: { checked, agree },
  mitigationsBuilt: M.meta.built,
};
fs.writeFileSync(OUT, JSON.stringify({ meta, fires: firesOut }));
console.log(`wrote ${path.relative(R, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), ${total} runs in ${wallMin} min`);
