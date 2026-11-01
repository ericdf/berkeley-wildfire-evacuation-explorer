#!/usr/bin/env node
// Evacuation effect of candidate second ways out (step 2 of the egress plan), fire on.
// Inserts each candidate link into the network at run time (tools/egress-link.mjs; network.json is
// not changed) and runs the simulator (js/sim.js Evacuation) for the fires that threaten the area,
// low/central/high severity × seeds 1–5, the same seed with and without the link.
//
//   node tools/egress-sim.mjs [--top 10] [--seeds 5] [--workers N]
//        reads and updates data/model/egress-candidates.json, writes data/model/egress-sim.json
//
// Like for like: the link has no evacuation zone, so households, parked cars, departures and the
// fire are the same draws with and without it (js/sim.js draws per edge in edge order and the new
// edge comes last). Only the order of cars on the road can differ once traffic uses the link.
//
// Variants (model rules for this harness):
//   asIs            the network as it stands
//   panoramicExit   County edge 2322 (Bancroft Steps Wy, Panoramic Way to Prospect St) opened as a
//                   two-way street in both arms (SOURCE_NOTES AC3), for Panoramic Hill candidates
//   order delay     plan.orderDelayMin 10 (the simulator default) and 20 (a later order)
//   urgent          every mobilization curve replaced by an even spread over 30 minutes, the Time
//                   Study's "urgent mobilization" (§10.4), for the Panoramic Hill benchmark only

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

const { loadData, prepare } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const { withLinks, demSampler } = await import(R + '/tools/egress-link.mjs');
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

const FIRES = ['panoramic', 'ref1923', 'eastWind'];
const SEVS = ['low', 'central', 'high'];
const VARIANT_OPEN = { asIs: [], panoramicExit: [2322] };
const URGENT_HIST = [50, 50]; // % per 15 minutes: everyone ready within 30 minutes

const median = a => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const pct = (arr, p, n) => n && arr.length >= Math.ceil(p * n) ? arr[Math.ceil(p * n) - 1] : null;

// ---------- worker: run a list of jobs ----------
if (argv[0] === '--worker') {
  const { jobs, cands, areas } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const base = await loadData(load);
  const grid = buildFireGrid(base);
  const scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
  const elev = demSampler(base.dem, base.Z);
  const dataMemo = new Map(), fireMemo = new Map();
  const dataFor = (variant, cand, mob) => {
    const k = `${variant}|${cand || ''}|${mob}`; if (dataMemo.has(k)) return dataMemo.get(k);
    if (dataMemo.size > 3) dataMemo.delete(dataMemo.keys().next().value);
    const c = cand ? cands[cand] : null;
    const spec = { open: [...VARIANT_OPEN[variant], ...(c?.open || [])], links: c && !c.open ? [{ id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone }] : [] };
    let A = base.A;
    if (mob === 'urgent') { A = structuredClone(base.A); for (const k2 of Object.keys(A.demand.mobilization15min)) A.demand.mobilization15min[k2] = URGENT_HIST.slice(); }
    const net = withLinks(base.net, base.A, elev, spec);
    const d = prepare({ net, layers: base.layers, dem: base.dem, Z: base.Z, A });
    d.linkEdgeIds = spec.links.length ? [net.edges.length - 1] : spec.open.filter(id => !VARIANT_OPEN[variant].includes(id));
    dataMemo.set(k, d); return d;
  };
  const fireFor = (fire, sev, seed) => { const k = `${fire}|${sev}|${seed}`; if (!fireMemo.has(k)) fireMemo.set(k, runFire(grid, scen[fire], SEVERITY[sev], seed)); return fireMemo.get(k); };
  const out = [];
  for (const j of jobs) {
    const data = dataFor(j.variant, j.cand, j.mob), sc = scen[j.fire];
    const sim = new Evacuation(data, grid, fireFor(j.fire, j.sev, j.seed), sc, j.sev, { ...DEFAULT_PLAN, orderDelayMin: j.delay }, j.seed, TIME_OF_DAY[sc.timeOfDay]);
    const { v, hh, links } = sim, pph = data.A.demand.personsPerHousehold;
    const track = j.areas.map(id => {
      const set = new Set(areas[id]); for (const e of data.linkEdgeIds) set.add(e); // leaving the area = past the far end of the new link
      const veh = []; for (let i = 0; i < v.n; i++) if (v.cls[i] !== 2 && set.has(v.edge[i])) veh.push(i);
      return { id, set, veh, out: new Float64Array(veh.length).fill(Infinity) };
    });
    while (sim.t < sim.end) {
      sim.step();
      for (const T of track) for (let k = 0; k < T.veh.length; k++) {
        if (T.out[k] < Infinity) continue; const i = T.veh[k];
        if (v.state[i] === 2) T.out[k] = v.arrive[i]; else if (v.state[i] === 1 && !T.set.has(links[v.link[i]].e)) T.out[k] = sim.t;
      }
    }
    const S = sim.summary(), t = sim.t;
    const row = { ...j, overall: { vehiclesNoRoute: S.vehiclesNoRoute, fireFrontPeople: Math.round(S.fireFrontHome + S.fireFrontRoad), emberPeople: Math.round(S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed), clearP90: S.clearP90, clearP100: S.clearP100, vehicles: S.vehicles } };
    row.area = {};
    for (const T of track) {
      let people = 0, front = 0, ember = 0;
      for (let h = 0; h < hh.n; h++) {
        if (!T.set.has(hh.edge[h])) continue; people += pph;
        if (hh.early[h]) continue;
        const e = hh.ride[h] >= 0 ? hh.ride[h] : h, tf = sim.tFire[hh.edge[h]], te = sim.tEmber[hh.edge[h]];
        if (tf <= t && hh.leftHome[e] > tf) front += pph;
        if (te <= t && hh.leftHome[e] > te) ember += pph;
      }
      let vFront = 0, vEmber = 0, noRoute = 0, notOut = 0; const times = []; let n0 = 0;
      T.veh.forEach((i, k) => {
        if (v.state[i] === 4) return;
        if (v.fireFront[i]) vFront++; if (v.exposed[i]) vEmber++;
        if (v.state[i] === 1) { const L = links[v.link[i]], c = v.cls[i]; if (!sim.safe[c][L.to] && !sim.next[c][L.to]) noRoute++; }
        if (T.out[k] === Infinity && v.depart[i] <= t) notOut++;
        if (v.cls[i] === 0) { n0++; if (T.out[k] < Infinity) times.push((T.out[k] - sim.firstOrderT) / 60); }
      });
      times.sort((a, b) => a - b);
      row.area[T.id] = { people: Math.round(people), fireFrontHome: Math.round(front), emberHome: Math.round(ember), vehicles: T.veh.length, vehFireFront: vFront, vehEmber: vEmber, vehNoRoute: noRoute, vehNotOut: notOut,
        clearP90: pct(times, 0.9, n0), clearP100: pct(times, 1, n0), evacVehicles: n0 };
    }
    out.push(row);
  }
  fs.writeFileSync(argv[2], JSON.stringify(out));
  process.exit(0);
}

// ---------- merge only: copy the summaries in data/model/egress-sim.json into a regenerated candidates file ----------
if (argv.includes('--merge-only')) {
  const f = path.join(R, 'data/model/egress-candidates.json'), EC = JSON.parse(fs.readFileSync(f, 'utf8')), SIM = JSON.parse(fs.readFileSync(path.join(R, 'data/model/egress-sim.json'), 'utf8'));
  for (const c of EC.candidates) {
    const s = SIM.summaries.filter(x => x.cand === c.id);
    const same = SIM.links?.[c.id] && JSON.stringify(SIM.links[c.id]) === JSON.stringify({ a: c.a, b: c.b, open: c.open || null });
    c.evacuation = s.length && same ? s : null;
  }
  EC.sim = { built: SIM.meta.built, tested: SIM.tested, threat: SIM.meta.threat, runs: SIM.runs.length, file: 'data/model/egress-sim.json' };
  fs.writeFileSync(f, JSON.stringify(EC)); console.log('merged'); process.exit(0);
}

// ---------- main ----------
const TOP = +arg('--top', 10), NSEED = +arg('--seeds', 5), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const candF = path.join(R, 'data/model/egress-candidates.json');
const EC = JSON.parse(fs.readFileSync(candF, 'utf8'));
const ac = JSON.parse(fs.readFileSync(path.join(R, 'data/model/access-constraints.json'), 'utf8'));
const areaEdges = Object.fromEntries(ac.areas.map(a => [a.id, a.memberEdges]));

// Which fires threaten each area: its zones are ordered or warned, or embers reach its streets (central severity, seed 1)
const base = await loadData(load), grid = buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
const threat = {};
for (const f of FIRES) {
  const fire = runFire(grid, scen[f], SEVERITY.central, 1);
  const sim = new Evacuation(base, grid, fire, scen[f], 'central', DEFAULT_PLAN, 1, TIME_OF_DAY[scen[f].timeOfDay]);
  const zi = new Map(base.layers.evacZones.map((z, i) => [z.id, i]));
  for (const [id, ids] of Object.entries(areaEdges)) {
    const told = ids.some(e => { const z = zi.get(base.net.edges[e].evacZone); return z != null && (sim.orderT[z] < Infinity || sim.warnT[z] < Infinity); });
    const embers = ids.some(e => sim.tEmber[e] < Infinity);
    if (told || embers) (threat[id] ??= []).push({ fire: f, ordered: ids.some(e => { const z = zi.get(base.net.edges[e].evacZone); return z != null && sim.orderT[z] < Infinity; }), embers });
  }
}

// Candidates to test: the top ranked whose area some fire threatens (at most 2 per area), plus the City concept
const ranked = EC.candidates.filter(c => c.rank).sort((a, b) => a.rank - b.rank);
const tested = [], perArea = new Map();
for (const c of ranked) {
  if (tested.length >= TOP) break;
  if (!threat[c.measureArea] || (perArea.get(c.measureArea) || 0) >= 2 || !(c.access?.asIs?.hillResidentsFreed > 0)) continue;
  tested.push(c); perArea.set(c.measureArea, (perArea.get(c.measureArea) || 0) + 1);
}
const city = EC.candidates.find(c => c.type === 'city'); if (city && threat[city.measureArea]) tested.push(city);
const candsMin = Object.fromEntries(tested.map(c => [c.id, { id: c.id, a: c.a, b: c.b, geom: c.geom, open: c.open, fireZone: c.fireZone?.zone ?? null }]));
console.log(`testing ${tested.length}: ${tested.map(c => `${c.id} for ${c.measureArea} (${threat[c.measureArea].map(t => t.fire).join('/')})`).join(', ')}`);

// jobs
const seeds = Array.from({ length: NSEED }, (_, i) => i + 1);
const jobs = [], baseKeys = new Map();
const addPair = (c, variant, mob, fire, delay) => {
  for (const sev of SEVS) for (const seed of seeds) {
    const k = `${variant}|${mob}|${fire}|${sev}|${seed}|${delay}`;
    if (!baseKeys.has(k)) { const j = { variant, mob, fire, sev, seed, delay, cand: null, areas: [] }; baseKeys.set(k, j); jobs.push(j); }
    const bj = baseKeys.get(k); if (!bj.areas.includes(c.measureArea)) bj.areas.push(c.measureArea);
    jobs.push({ variant, mob, fire, sev, seed, delay, cand: c.id, areas: [c.measureArea] });
  }
};
for (const c of tested) for (const { fire } of threat[c.measureArea]) {
  for (const delay of [10, 20]) addPair(c, 'asIs', 'normal', fire, delay);
  if (c.panoramic) {
    for (const delay of [10, 20]) addPair(c, 'panoramicExit', 'normal', fire, delay);
    if (fire !== 'eastWind') { addPair(c, 'asIs', 'urgent', fire, 10); addPair(c, 'panoramicExit', 'urgent', fire, 10); }
  }
}
console.log(`${jobs.length} runs on ${WORKERS} workers`);
// group by network so each worker builds few variants
jobs.sort((a, b) => `${a.cand}|${a.variant}|${a.mob}`.localeCompare(`${b.cand}|${b.variant}|${b.mob}`));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-sim-'));
const chunks = Array.from({ length: WORKERS }, () => []);
const per = Math.ceil(jobs.length / WORKERS); jobs.forEach((j, i) => chunks[Math.floor(i / per)].push(j));
const t0 = Date.now();
const rows = (await Promise.all(chunks.filter(c => c.length).map(async (chunk, w) => {
  const fin = path.join(TMP, `jobs-${w}.json`), fout = path.join(TMP, `out-${w}.json`);
  fs.writeFileSync(fin, JSON.stringify({ jobs: chunk, cands: candsMin, areas: Object.fromEntries([...new Set(chunk.flatMap(j => j.areas))].map(id => [id, areaEdges[id]])) }));
  await promisify(execFile)(process.execPath, [SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
  return JSON.parse(fs.readFileSync(fout, 'utf8'));
}))).flat();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// ---------- pairs and summaries ----------
const keyOf = r => `${r.variant}|${r.mob}|${r.fire}|${r.sev}|${r.seed}|${r.delay}`;
const baseRow = new Map(rows.filter(r => !r.cand).map(r => [keyOf(r), r]));
// lower is better for every measure; a null clearance time (not all out) counts as worse than any time
const AREA_M = ['fireFrontHome', 'emberHome', 'vehFireFront', 'vehEmber', 'vehNoRoute', 'vehNotOut', 'clearP90', 'clearP100'];
const ALL_M = ['vehiclesNoRoute', 'fireFrontPeople', 'emberPeople', 'clearP90', 'clearP100'];
const cmp = (a, b) => { const A_ = a ?? Infinity, B_ = b ?? Infinity; return A_ === B_ ? 0 : A_ < B_ ? -1 : 1; }; // with vs without
function summarize(pairs, get, m) {
  let better = 0, worse = 0, same = 0; const d = [], dc = [];
  for (const [w, b] of pairs) { const x = get(w)?.[m], y = get(b)?.[m], s = cmp(x, y); if (s < 0) better++; else if (s > 0) worse++; else same++;
    if (x != null && y != null) { d.push(x - y); if (w.sev === 'central') dc.push(x - y); } }
  const B = pairs.map(([, b]) => get(b)?.[m]), W = pairs.map(([w]) => get(w)?.[m]);
  const cB = pairs.filter(([w]) => w.sev === 'central').map(([, b]) => get(b)?.[m]), cW = pairs.filter(([w]) => w.sev === 'central').map(([w]) => get(w)?.[m]);
  return { better, worse, same, n: pairs.length, holdsEveryPair: better === pairs.length, neverWorse: worse === 0,
    medianWithout: median(B), medianWith: median(W), centralMedianWithout: median(cB), centralMedianWith: median(cW), medianChange: median(d), centralMedianChange: median(dc),
    notAllOutWithout: B.filter(v => v == null).length, notAllOutWith: W.filter(v => v == null).length };
}
const summaries = [];
for (const c of tested) {
  const groups = new Map();
  for (const r of rows.filter(r => r.cand === c.id)) { const g = `${r.variant}|${r.mob}|${r.fire}|${r.delay}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([r, baseRow.get(keyOf(r))]); }
  for (const [g, pairs] of groups) {
    const [variant, mob, fire, delay] = g.split('|');
    summaries.push({ cand: c.id, area: c.measureArea, variant, mob, fire, delay: +delay, runs: pairs.length,
      area_: Object.fromEntries(AREA_M.map(m => [m, summarize(pairs, r => r.area[c.measureArea], m)])),
      overall: Object.fromEntries(ALL_M.map(m => [m, summarize(pairs, r => r.overall, m)])),
      residents: median(pairs.map(([, b]) => b.area[c.measureArea].people)), areaVehicles: median(pairs.map(([, b]) => b.area[c.measureArea].vehicles)) });
  }
}
const SIM = {
  meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/egress-sim.mjs', note: 'Synthetic runs of the simulator, same seed with and without each link. Educational comparison, not a prediction. "People still there when the fire front or embers arrived" counts synthetic people at home at that moment; it is not a casualty count.',
    fires: FIRES, severities: SEVS, seeds, delays: [10, 20], workers: WORKERS, runs: rows.length,
    measures: { fireFrontHome: 'synthetic people of the area still at home when the fire front reached their street', emberHome: 'same, when embers arrived', vehFireFront: 'area vehicles on a street when the fire front reached it', vehEmber: 'area vehicles on a street under embers', vehNoRoute: 'area vehicles on the road at the end with no route to safety (cut off)', vehNotOut: 'area vehicles that set off but never left the area', clearP90: 'minutes from the first order until 90% of the area\'s evacuating vehicles had left the area (Time Study §10.4 measure: beyond Panoramic Way or Dwight Way); null if not reached', clearP100: 'same, 100%' },
    threat },
  tested: tested.map(c => c.id), links: Object.fromEntries(tested.map(c => [c.id, { a: c.a, b: c.b, open: c.open || null }])), summaries, runs: rows,
};
fs.writeFileSync(path.join(R, 'data/model/egress-sim.json'), JSON.stringify(SIM));
for (const c of EC.candidates) { const s = summaries.filter(x => x.cand === c.id); c.evacuation = s.length ? s : null; }
EC.sim = { built: SIM.meta.built, tested: SIM.tested, threat, runs: rows.length, file: 'data/model/egress-sim.json' };
// re-read: the candidates file may have been regenerated while the runs were going
const EC2 = JSON.parse(fs.readFileSync(candF, 'utf8'));
for (const c of EC2.candidates) { const s = summaries.filter(x => x.cand === c.id); c.evacuation = s.length ? s : null; }
EC2.sim = EC.sim;
fs.writeFileSync(candF, JSON.stringify(EC2));
console.log('wrote data/model/egress-sim.json and updated data/model/egress-candidates.json');
for (const s of summaries.filter(s => s.mob === 'normal')) {
  const a = s.area_;
  console.log(`${s.cand} ${s.variant} ${s.fire} d${s.delay}: front ${a.fireFrontHome.centralMedianWithout}→${a.fireFrontHome.centralMedianWith} (${a.fireFrontHome.better}/${a.fireFrontHome.worse}/${a.fireFrontHome.same}) ember ${a.emberHome.centralMedianWithout}→${a.emberHome.centralMedianWith} (${a.emberHome.better}/${a.emberHome.worse}) noRoute ${a.vehNoRoute.centralMedianWithout}→${a.vehNoRoute.centralMedianWith} (${a.vehNoRoute.better}/${a.vehNoRoute.worse}) p90 ${a.clearP90.centralMedianWithout}→${a.clearP90.centralMedianWith} (${a.clearP90.better}/${a.clearP90.worse}) | all noRoute ${s.overall.vehiclesNoRoute.centralMedianWithout}→${s.overall.vehiclesNoRoute.centralMedianWith}`);
}
