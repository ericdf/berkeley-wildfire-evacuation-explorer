#!/usr/bin/env node
// Simulator runs for the street-widening screening (egress plan step 2b): each tested pinch widened,
// or with parking banned on just that pinch, against the network as it stands, same seed with and
// without, for the fires that threaten the pinch (low/central/high severity × seeds 1–5).
//
//   node tools/widening-sim.mjs [--top 10] [--seeds 5] [--workers N]
//        reads data/model/widening.json, writes data/model/widening-sim.json and adds the summaries
//        to data/model/widening.json
//
// Variants (applied in memory to the pinch's edges; data/model/network.json is not changed):
//   widen       pavement widened to the fire-code standard (20 ft clear plus 8 ft per side parked
//               today, tools/widening-core.mjs standards().fireCode); parking posted to the sides
//               parked today so residents do not fill the new curb; lanes unchanged (the builder
//               gives hill Local streets one lane each way at any width)
//   noParking   red curb on the pinch only (edge parking 'none'); nothing else changes
// Time of day: Time Study case S6 (fall night) for every fire, when hill curbs are fullest
// (parking.range.night) and pinches bind most; the parking question uses the same case (ER2).
// Like for like: js/parking.js takes five draws per edge in edge order whatever the width or rule,
// and households are placed by street length, so households, departures and the parked cars on
// every other street are the same draws with and without the change; the worker checks this.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;

const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const { widenedEdge, noParkingEdge, applyEdges, standards, nominalSides } = await import(R + '/tools/widening-core.mjs');
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

const FIRES = ['panoramic', 'ref1923', 'eastWind'];
const SEVS = ['low', 'central', 'high'];
const TOD = 'S6';
const median = a => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// A run that never reaches the percentile counts as slower than any finished run (step 2's rule, Codex review on PR #15).
const medianTime = a => { const s = a.map(v => v == null || !Number.isFinite(v) ? Infinity : v).sort((x, y) => x - y); if (!s.length) return null; const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return Number.isFinite(m) ? m : null; };
const pct = (arr, p, n) => n && arr.length >= Math.ceil(p * n) ? arr[Math.ceil(p * n) - 1] : null;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

// The edge copies a variant puts in place of the pinch's edges.
export function variantEdges(data, pinch, variant) {
  const A = data.A, out = {};
  for (const id of pinch.edges) {
    const e = data.net.edges[id];
    if (variant === 'widen') { const s = nominalSides(A, e); out[id] = widenedEdge(A, e, Math.max(e.widthM, standards(A, s).fireCode), s); }
    else if (variant === 'noParking') out[id] = noParkingEdge(A, e);
  }
  return out;
}

// ---------- worker ----------
if (argv[0] === '--worker') {
  const { jobs, pinches } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const data = await loadData(load);
  const grid = buildFireGrid(data);
  const scen = Object.fromEntries(makeScenarios(data).map(s => [s.id, s]));
  const fireMemo = new Map();
  const fireFor = (f, sev, seed) => { const k = `${f}|${sev}|${seed}`; if (!fireMemo.has(k)) { if (fireMemo.size > 6) fireMemo.delete(fireMemo.keys().next().value); fireMemo.set(k, runFire(grid, scen[f], SEVERITY[sev], seed)); } return fireMemo.get(k); };
  const pph = data.A.demand.personsPerHousehold, lim = data.A.access.engineServiceMin * 60, edges = data.net.edges;
  const out = [];
  for (const j of jobs) {
    const undo = j.pinch && j.variant !== 'base' ? applyEdges(data, variantEdges(data, pinches[j.pinch], j.variant)) : () => {};
    try {
      const sc = scen[j.fire];
      const sim = new Evacuation(data, grid, fireFor(j.fire, j.sev, j.seed), sc, j.sev, DEFAULT_PLAN, j.seed, TIME_OF_DAY[TOD]);
      const { v, hh, links } = sim;
      // draws fingerprint: households, vehicles and departure times (same for every variant of a seed)
      let fp = hh.n * 1e6 + v.n; for (let i = 0; i < v.n; i += 7) fp += (v.depart[i] % 1000) + v.edge[i] * 1e-3;
      const track = j.areas.map(id => {
        const P_ = pinches[id], set = new Set([...P_.behindEdges, ...P_.edges]);
        const veh = []; for (let i = 0; i < v.n; i++) if (v.cls[i] !== 2 && set.has(v.edge[i])) veh.push(i);
        return { id, set, veh, out: new Float64Array(veh.length).fill(Infinity) };
      });
      // engine reach at ignition for the area's residents (sim.engineReach0: seconds per segment)
      const reach0 = sim.engineReach0;
      while (sim.t < sim.end) {
        sim.step();
        for (const T of track) for (let k = 0; k < T.veh.length; k++) {
          if (T.out[k] < Infinity) continue; const i = T.veh[k];
          if (v.state[i] === 2) T.out[k] = v.arrive[i]; else if (v.state[i] === 1 && !T.set.has(links[v.link[i]].e)) T.out[k] = sim.t;
        }
      }
      const S = sim.summary(), t = sim.t;
      const row = { ...j, fp, overall: { engineNotReached5: Math.round(S.engineReachHillPeople - S.engineReach5People), engineNoRoute: Math.round(S.engineReachUnreachablePeople), vehiclesNoRoute: S.vehiclesNoRoute, fireFrontPeople: Math.round(S.fireFrontHome + S.fireFrontRoad), clearP90: S.clearP90, sharedLanes: S.sharedLanes, engineBlockedSegments: S.engineBlockedSegments } };
      row.area = {};
      for (const T of track) {
        let people = 0, front = 0, ember = 0, erTot = 0, erNot = 0;
        for (let h = 0; h < hh.n; h++) {
          const eid = hh.edge[h]; if (!T.set.has(eid)) continue; const wh = sim.hhPersons ? sim.hhPersons[h] : pph; people += wh; // zone persons per household (DM18)
          if (String(edges[eid].evacZone || '').startsWith('BER') && edges[eid].fireZone >= 2) { erTot += wh; if (!(reach0[eid] <= lim)) erNot += wh; }
          if (hh.early[h]) continue;
          const e = hh.ride[h] >= 0 ? hh.ride[h] : h, tf = sim.tFire[eid], te = sim.tEmber[eid];
          if (tf <= t && hh.leftHome[e] > tf) front += wh;
          if (te <= t && hh.leftHome[e] > te) ember += wh;
        }
        let vFront = 0, noRoute = 0, notOut = 0, n0 = 0; const times = [];
        T.veh.forEach((i, k) => {
          if (v.state[i] === 4) return;
          if (v.fireFront[i]) vFront++;
          if (v.state[i] === 1) { const L = links[v.link[i]], c = v.cls[i]; if (!sim.safe[c][L.to] && !sim.next[c][L.to]) noRoute++; }
          if (T.out[k] === Infinity && v.depart[i] <= t) notOut++;
          if (v.cls[i] === 0) { n0++; if (T.out[k] < Infinity) times.push((T.out[k] - sim.firstOrderT) / 60); }
        });
        times.sort((a, b) => a - b);
        row.area[T.id] = { people: Math.round(people), engineReachPeople: Math.round(erTot), engineNotReached5: Math.round(erNot), fireFrontHome: Math.round(front), emberHome: Math.round(ember),
          vehicles: T.veh.length, vehFireFront: vFront, vehNoRoute: noRoute, vehNotOut: notOut, clearP90: pct(times, 0.9, n0), evacVehicles: n0 };
      }
      out.push(row);
    } finally { undo(); }
  }
  fs.writeFileSync(argv[2], JSON.stringify(out));
  process.exit(0);
}

// ---------- merge only: copy the summaries in data/model/widening-sim.json into a regenerated widening.json ----------
if (argv.includes('--merge-only')) {
  const f = path.join(R, 'data/model/widening.json'), W = JSON.parse(fs.readFileSync(f, 'utf8')), SIM = JSON.parse(fs.readFileSync(path.join(R, 'data/model/widening-sim.json'), 'utf8'));
  for (const p of W.pinches) {
    const s = SIM.summaries.filter(x => x.pinch === p.id);
    const same = JSON.stringify(SIM.pinchEdges?.[p.id]) === JSON.stringify(p.edges); // the pinch ids must still name the same segments
    p.simulation = s.length && same ? s : null;
  }
  W.meta.sim = { built: SIM.meta.built, tested: SIM.tested, runs: SIM.runs.length, timeOfDay: SIM.meta.timeOfDay, file: 'data/model/widening-sim.json', threat: SIM.meta.threat };
  fs.writeFileSync(f, JSON.stringify(W)); console.log('merged'); process.exit(0);
}

// ---------- main ----------
const TOP = +arg('--top', 10), NSEED = +arg('--seeds', 5), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const wf = path.join(R, 'data/model/widening.json');
const W = JSON.parse(fs.readFileSync(wf, 'utf8'));
const base = await loadData(load), grid = buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));

// Fires that threaten each pinch: the zones behind it are ordered or warned, or embers reach its streets (central severity, seed 1)
const threat = {};
const zi = new Map(base.layers.evacZones.map((z, i) => [z.id, i]));
for (const f of FIRES) {
  const sim = new Evacuation(base, grid, runFire(grid, scen[f], SEVERITY.central, 1), scen[f], 'central', DEFAULT_PLAN, 1, TIME_OF_DAY[TOD]);
  for (const p of W.pinches) {
    const ids = [...p.behindEdges, ...p.edges];
    const z = id => zi.get(base.net.edges[id].evacZone);
    const ordered = ids.some(id => z(id) != null && sim.orderT[z(id)] < Infinity), warned = ids.some(id => z(id) != null && sim.warnT[z(id)] < Infinity), embers = ids.some(id => sim.tEmber[id] < Infinity);
    if (ordered || warned || embers) (threat[p.id] ??= []).push({ fire: f, ordered, warned, embers });
  }
}
const tested = W.pinches.filter(p => threat[p.id]).slice(0, TOP);
console.log(`testing ${tested.length}: ${tested.map(p => `${p.id} ${p.street} (${threat[p.id].map(t => t.fire).join('/')})`).join(', ')}`);
const pinchMin = Object.fromEntries(tested.map(p => [p.id, { id: p.id, edges: p.edges, behindEdges: p.behindEdges }]));

const seeds = Array.from({ length: NSEED }, (_, i) => i + 1);
const jobs = [], baseJobs = new Map();
for (const p of tested) for (const { fire } of threat[p.id]) for (const sev of SEVS) for (const seed of seeds) {
  const k = `${fire}|${sev}|${seed}`;
  if (!baseJobs.has(k)) { const j = { variant: 'base', pinch: null, fire, sev, seed, areas: [] }; baseJobs.set(k, j); jobs.push(j); }
  baseJobs.get(k).areas.push(p.id);
  for (const variant of ['widen', 'noParking']) jobs.push({ variant, pinch: p.id, fire, sev, seed, areas: [p.id] });
}
console.log(`${jobs.length} runs on ${WORKERS} workers`);
jobs.sort((a, b) => `${a.fire}|${a.sev}|${a.seed}`.localeCompare(`${b.fire}|${b.sev}|${b.seed}`)); // a worker reuses each fire
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'widening-sim-'));
const chunks = Array.from({ length: WORKERS }, () => []);
const per = Math.ceil(jobs.length / WORKERS); jobs.forEach((j, i) => chunks[Math.floor(i / per)].push(j));
const t0 = Date.now();
const rows = (await Promise.all(chunks.filter(c => c.length).map(async (chunk, w) => {
  const fin = path.join(TMP, `jobs-${w}.json`), fout = path.join(TMP, `out-${w}.json`);
  fs.writeFileSync(fin, JSON.stringify({ jobs: chunk, pinches: pinchMin }));
  await promisify(execFile)(process.execPath, [SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
  return JSON.parse(fs.readFileSync(fout, 'utf8'));
}))).flat();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// ---------- pairs and summaries ----------
const keyOf = r => `${r.fire}|${r.sev}|${r.seed}`;
const baseRow = new Map(rows.filter(r => r.variant === 'base').map(r => [keyOf(r), r]));
const fpMismatch = rows.filter(r => r.variant !== 'base' && r.fp !== baseRow.get(keyOf(r)).fp).length;
if (fpMismatch) console.log(`WARNING: ${fpMismatch} runs drew different households or departures than their base run`);
const AREA_M = ['engineNotReached5', 'fireFrontHome', 'emberHome', 'vehFireFront', 'vehNoRoute', 'vehNotOut', 'clearP90'];
const ALL_M = ['engineNotReached5', 'engineNoRoute', 'vehiclesNoRoute', 'fireFrontPeople', 'clearP90', 'sharedLanes'];
const cmp = (a, b) => { const A_ = a ?? Infinity, B_ = b ?? Infinity; return A_ === B_ ? 0 : A_ < B_ ? -1 : 1; }; // lower is better; a missing clearance time is worst
function summarize(pairs, get, m) {
  let better = 0, worse = 0, same = 0; const d = [], dc = [];
  for (const [w, b] of pairs) { const x = get(w)?.[m], y = get(b)?.[m], s = cmp(x, y); if (s < 0) better++; else if (s > 0) worse++; else same++;
    if (x != null && y != null) { d.push(x - y); if (w.sev === 'central') dc.push(x - y); } }
  const med = /^clear/.test(m) ? medianTime : median;
  const cB = pairs.filter(([w]) => w.sev === 'central').map(([, b]) => get(b)?.[m]), cW = pairs.filter(([w]) => w.sev === 'central').map(([w]) => get(w)?.[m]);
  return { better, worse, same, n: pairs.length, holdsEveryPair: better === pairs.length, neverWorse: worse === 0,
    centralMedianWithout: med(cB), centralMedianWith: med(cW), medianChange: r1(median(d)), centralMedianChange: r1(median(dc)),
    notReachedWithout: pairs.filter(([, b]) => get(b)?.[m] == null).length, notReachedWith: pairs.filter(([w]) => get(w)?.[m] == null).length };
}
const summaries = [];
for (const p of tested) for (const variant of ['widen', 'noParking']) {
  const byFire = new Map();
  for (const r of rows.filter(r => r.pinch === p.id && r.variant === variant)) { if (!byFire.has(r.fire)) byFire.set(r.fire, []); byFire.get(r.fire).push([r, baseRow.get(keyOf(r))]); }
  for (const [fire, pairs] of byFire) summaries.push({ pinch: p.id, street: p.street, variant, fire, runs: pairs.length,
    area: Object.fromEntries(AREA_M.map(m => [m, summarize(pairs, r => r.area[p.id], m)])),
    overall: Object.fromEntries(ALL_M.map(m => [m, summarize(pairs, r => r.overall, m)])),
    residents: median(pairs.map(([, b]) => b.area[p.id].people)), areaVehicles: median(pairs.map(([, b]) => b.area[p.id].vehicles)) });
}
const SIM = {
  meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/widening-sim.mjs', timeOfDay: TOD, fires: FIRES, severities: SEVS, seeds, workers: WORKERS, runs: rows.length, drawsMismatch: fpMismatch,
    note: 'Synthetic runs of the simulator, same seed with and without each change. Educational comparison, not a prediction. "People still there when the fire front arrived" counts synthetic people at home at that moment; it is not a casualty count.',
    variants: { widen: 'pavement widened to 20 ft clear plus 8 ft per side parked today (standards().fireCode), parking posted to those sides, lanes unchanged (assumption)', noParking: 'no parking on the pinch only (red curb)' },
    measures: { engineNotReached5: 'synthetic Berkeley hill residents (area: those behind the pinch) whose street no engine reaches within 5 minutes at ignition under the seed\'s parked cars', engineNoRoute: 'same, with no engine route at all', fireFrontHome: 'synthetic people behind the pinch still at home when the fire front reached their street', emberHome: 'same, when embers arrived', vehFireFront: 'vehicles from behind the pinch on a street when the fire front reached it', vehNoRoute: 'vehicles from behind the pinch on the road at the end with no route to safety', vehNotOut: 'vehicles from behind the pinch that set off but never left the area behind it (cut off)', clearP90: 'minutes from the first order until 90% of the evacuating vehicles from behind the pinch had left that area; null if never', sharedLanes: 'two-way segments left with one lane between parked cars', vehiclesNoRoute: 'all vehicles on the road at the end with no route to safety', fireFrontPeople: 'all synthetic people at home or on the road when the fire front reached them' },
    threat },
  tested: tested.map(p => p.id), pinchEdges: Object.fromEntries(tested.map(p => [p.id, p.edges])), summaries, runs: rows,
};
fs.writeFileSync(path.join(R, 'data/model/widening-sim.json'), JSON.stringify(SIM));
const W2 = JSON.parse(fs.readFileSync(wf, 'utf8'));
for (const p of W2.pinches) { const s = summaries.filter(x => x.pinch === p.id); p.simulation = s.length ? s : null; }
W2.meta.sim = { built: SIM.meta.built, tested: SIM.tested, runs: rows.length, timeOfDay: TOD, file: 'data/model/widening-sim.json', threat };
fs.writeFileSync(wf, JSON.stringify(W2));
console.log('wrote data/model/widening-sim.json and updated data/model/widening.json');
const f = s => `${s.centralMedianWithout}→${s.centralMedianWith} (${s.better}/${s.worse}/${s.same})`;
for (const s of summaries) console.log(`${s.pinch} ${s.street} ${s.variant} ${s.fire}: engine ${f(s.area.engineNotReached5)} front ${f(s.area.fireFrontHome)} notOut ${f(s.area.vehNotOut)} p90 ${f(s.area.clearP90)} | all engine ${f(s.overall.engineNotReached5)}`);
