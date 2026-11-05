#!/usr/bin/env node
// Managed retreat (voluntary buyouts), step 3 of the egress and managed-retreat plan in HANDOFF.md.
// One command reruns everything: node tools/retreat-sim.mjs
//
//   1. Risk by block. A block is one street segment of the simulator's network (the piece of street
//      between two junctions on which js/sim.js places households). Every scenario in js/scenarios.js
//      runs at low, central and high severity, seeds 1–5, default plan, the scenario's time of day, and
//      each hill block gets the share of runs in which its households were still home when the fire
//      front and embers arrived, and in which its cars were cut off; plus static factors from
//      data/model/access-constraints.json and the engine-reach measure in js/sim.js. A weighted sum
//      (model rule) ranks the blocks.
//   2. Buyout cases. The top-ranked blocks up to about 50, 100, 250 and 500 households, Panoramic Hill's
//      upper streets (AC-158) and everything behind the foot of Panoramic Way (AC-155). Each case reruns
//      the simulator with and without the buyout, same seed, for the fires that threaten it
//      (world.retreat in js/sim.js: households on bought-out blocks are placed and drawn as usual, then
//      make no trip, so every other household and car is the same draw; tests/retreat-draws.mjs).
//   3. Costs (screening ranges from public figures; ACS block-group values fetched once and cached).
//   4. Step 2 comparison (second ways out), read from data/model/egress-candidates.json.
//   Writes data/model/retreat.json and docs/managed-retreat.md (tools/retreat-report.mjs).
//
//   node tools/retreat-sim.mjs [--seeds 5] [--workers N] [--refresh-acs] [--report-only]
//
// Privacy: block-group statistics and street-segment counts only; no parcels, owners or addresses.
// Web requests send a generic User-Agent and nothing about the person running the tool.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;

const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN, residentialStreets } = await import(R + '/js/sim.js');
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

const SEVS = ['low', 'central', 'high'];
const OUT = path.join(R, 'data/model/retreat.json');

// ---------- per-run measures (used by the workers) ----------
// Households still home when the fire front (or embers) reached their street: the rule of summary() in
// js/sim.js (a rider counts until the neighbor they ride with leaves; early leavers never count).
function homeAt(sim, h, which) {
  const { hh, t } = sim; if (hh.gone[h] || hh.early[h]) return false;
  const e = hh.ride[h] >= 0 ? hh.ride[h] : h, T = (which === 'front' ? sim.tFire : sim.tEmber)[hh.edge[h]];
  return T <= t && hh.leftHome[e] > T;
}
// A resident vehicle cut off by fire: on a street when the fire front reached it, or on the road at the end with no route to safety.
const noRoute = (sim, i) => { const { v, links } = sim; if (v.state[i] !== 1) return false; const L = links[v.link[i]], c = v.cls[i]; return !sim.safe[c][L.to] && !sim.next[c][L.to]; };

function scoreRun(sim, edges) {
  const idx = new Map(edges.map((e, k) => [e, k])), n = edges.length;
  const r = { nH: new Array(n).fill(0), front: new Array(n).fill(0), ember: new Array(n).fill(0), nV: new Array(n).fill(0), cut: new Array(n).fill(0),
    told: new Array(n).fill(0), emb: new Array(n).fill(0), eng: edges.map(e => Math.round(Math.min(sim.engineReach0[e], 1e6))) };
  const { hh, v } = sim, zl = sim.data.layers.evacZones;
  for (let h = 0; h < hh.n; h++) {
    const k = idx.get(hh.edge[h]); if (k == null) continue;
    r.nH[k]++; if (homeAt(sim, h, 'front')) r.front[k]++; if (homeAt(sim, h, 'ember')) r.ember[k]++;
  }
  for (let i = 0; i < v.n; i++) {
    if (v.hh[i] < 0 || v.cls[i] === 2 || v.state[i] === 4) continue;
    const k = idx.get(v.edge[i]); if (k == null) continue;
    r.nV[k]++; if (v.fireFront[i] || noRoute(sim, i)) r.cut[k]++;
  }
  edges.forEach((e, k) => {
    const z = zl.findIndex(Z => Z.id === sim.data.net.edges[e].evacZone);
    r.told[k] = z >= 0 && (sim.orderT[z] < Infinity || sim.warnT[z] < Infinity) ? 1 : 0;
    r.emb[k] = sim.tEmber[e] <= sim.t ? 1 : 0;
  });
  return r;
}

// Group measures for a case: the bought-out blocks (removed), the other households behind the same
// choke points (neighbors) and the other households of the same evacuation zones (zone).
function groupRun(sim, G, track) {
  const { hh, v, t } = sim, pph = sim.data.A.demand.personsPerHousehold, lim = sim.data.A.access.engineServiceMin * 60;
  const out = {};
  for (const [name, set] of Object.entries(G)) {
    let people = 0, front = 0, ember = 0, nV = 0, vFront = 0, vNoRoute = 0, eng5 = 0;
    for (let h = 0; h < hh.n; h++) {
      if (!set.has(hh.edge[h]) || hh.gone[h]) continue;
      const wh = sim.hhPersons ? sim.hhPersons[h] : pph; // zone persons per household (DM18)
      people += wh; if (homeAt(sim, h, 'front')) front += wh; if (homeAt(sim, h, 'ember')) ember += wh;
      if (sim.engineReach0[hh.edge[h]] > lim) eng5 += wh;
    }
    for (let i = 0; i < v.n; i++) {
      if (v.hh[i] < 0 || v.cls[i] === 2 || v.state[i] === 4 || !set.has(v.edge[i])) continue;
      nV++; if (v.fireFront[i]) vFront++; if (noRoute(sim, i)) vNoRoute++;
    }
    out[name] = { people: Math.round(people), frontHome: Math.round(front), emberHome: Math.round(ember), vehicles: nV, vehFireFront: vFront, vehNoRoute: vNoRoute, engineBeyond5: Math.round(eng5) };
  }
  if (track) for (const [name, T] of Object.entries(track)) {
    const times = []; let n0 = 0;
    T.veh.forEach((i, k) => { if (v.cls[i] !== 0 || v.state[i] === 4) return; n0++; if (T.out[k] < Infinity) times.push((T.out[k] - sim.firstOrderT) / 60); });
    times.sort((a, b) => a - b);
    const pct = p => n0 && times.length >= Math.ceil(p * n0) ? times[Math.ceil(p * n0) - 1] : null;
    (out[name] ??= {}).clearP90 = pct(0.9); out[name].clearP100 = pct(1); out[name].evacVehicles = n0;
  }
  return out;
}

// ---------- worker ----------
if (argv[0] === '--worker') {
  const { jobs, cases } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const data = await loadData(load), grid = buildFireGrid(data);
  const scen = Object.fromEntries(makeScenarios(data).map(s => [s.id, s]));
  const fireMemo = new Map();
  const fireFor = (f, sev, seed) => { const k = `${f}|${sev}|${seed}`; if (!fireMemo.has(k)) { if (fireMemo.size > 4) fireMemo.delete(fireMemo.keys().next().value); fireMemo.set(k, runFire(grid, scen[f], SEVERITY[sev], seed)); } return fireMemo.get(k); };
  const sets = Object.fromEntries(Object.entries(cases).map(([id, c]) => [id, { removed: new Set(c.removed), neighbors: new Set(c.neighbors), zone: new Set(c.zone), area: new Set([...c.removed, ...c.neighbors]) }]));
  const out = [];
  for (const j of jobs) {
    if (j.kind === 'engine') { // engine reach at ignition only: parked cars and households, no fire, no steps
      const sc = { ...Object.values(scen)[0], durationMin: 1 }, noFire = { arrival: new Float64Array(grid.W * grid.H).fill(Infinity), ember: new Float32Array(grid.W * grid.H).fill(Infinity) };
      const world = j.case ? { retreat: { edges: cases[j.case].removed, clearParking: j.clearParking } } : {};
      const sim = new Evacuation(data, grid, noFire, sc, 'central', DEFAULT_PLAN, j.seed, TIME_OF_DAY[j.tk], world);
      const ids = j.case ? [j.case] : j.groups;
      const g = {}; for (const id of ids) g[id] = groupRun(sim, { removed: sets[id].removed, neighbors: sets[id].neighbors });
      const E = sim.engineReach.hill;
      out.push({ ...j, groups: g, hill: { beyond5: Math.round(E.total - E.people), unreachable: Math.round(E.unreachable), total: Math.round(E.total) } });
      continue;
    }
    const sc = scen[j.fire];
    const world = j.case ? { retreat: { edges: cases[j.case].removed } } : {};
    const sim = new Evacuation(data, grid, fireFor(j.fire, j.sev, j.seed), sc, j.sev, DEFAULT_PLAN, j.seed, TIME_OF_DAY[sc.timeOfDay], world);
    const ids = j.kind === 'pair' ? (j.case ? [j.case] : j.groups) : [];
    // clearance tracking: vehicles starting in the area (bought-out blocks and neighbors) until they leave it
    const track = {};
    for (const id of ids) {
      const S = sets[id];
      for (const [name, from] of [['area', S.area], ['neighbors', S.neighbors]]) {
        const veh = []; for (let i = 0; i < sim.v.n; i++) if (sim.v.cls[i] !== 2 && from.has(sim.v.edge[i])) veh.push(i);
        track[`${id}|${name}`] = { veh, set: S.area, out: new Float64Array(veh.length).fill(Infinity) };
      }
    }
    const TT = Object.values(track);
    while (sim.t < sim.end) {
      sim.step();
      for (const T of TT) for (let k = 0; k < T.veh.length; k++) {
        if (T.out[k] < Infinity) continue; const i = T.veh[k];
        if (sim.v.state[i] === 2) T.out[k] = sim.v.arrive[i]; else if (sim.v.state[i] === 1 && !T.set.has(sim.links[sim.v.link[i]].e)) T.out[k] = sim.t;
      }
    }
    const S = sim.summary();
    if (j.kind === 'score') { out.push({ ...j, edges: undefined, r: scoreRun(sim, j.edges) }); continue; }
    let vFront = 0; for (let i = 0; i < sim.v.n; i++) if (sim.v.fireFront[i] && sim.v.cls[i] !== 2) vFront++;
    const row = { ...j, overall: { frontPeople: Math.round(S.fireFrontHome + S.fireFrontRoad), frontHome: Math.round(S.fireFrontHome),
      emberPeople: Math.round(S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed), vehNoRoute: S.vehiclesNoRoute, vehFireFront: vFront,
      clearP90: S.clearP90, clearP100: S.clearP100, orderVehicles: S.orderVehicles, engineBeyond5: Math.round(S.engineReachBeyond5People), retreatHouseholds: sim.retreat.households }, groups: {} };
    for (const id of ids) {
      const S2 = sets[id], trk = { area: track[`${id}|area`], neighbors: track[`${id}|neighbors`] };
      const g = groupRun(sim, { removed: S2.removed, neighbors: S2.neighbors, zone: S2.zone }, trk);
      row.groups[id] = g;
    }
    out.push(row);
  }
  fs.writeFileSync(argv[2], JSON.stringify(out));
  process.exit(0);
}

// ---------- helpers ----------
const median = a => { const s = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// clearance: a run that never reaches the percentile counts as slower than any finished run (as in step 2)
const medianTime = a => { const s = a.map(x => x == null || !Number.isFinite(x) ? Infinity : x).sort((x, y) => x - y); if (!s.length) return null; const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return Number.isFinite(m) ? m : null; };
const cmp = (a, b) => { const A_ = a ?? Infinity, B_ = b ?? Infinity; return A_ === B_ ? 0 : A_ < B_ ? -1 : 1; };
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const titleCase = s => String(s).toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());

async function runJobs(jobs, cases, workers) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'retreat-sim-'));
  const chunks = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => chunks[i % workers].push(j));
  const rows = (await Promise.all(chunks.filter(c => c.length).map(async (chunk, w) => {
    const fin = path.join(TMP, `jobs-${w}.json`), fout = path.join(TMP, `out-${w}.json`);
    fs.writeFileSync(fin, JSON.stringify({ jobs: chunk, cases }));
    await promisify(execFile)(process.execPath, ['--max-old-space-size=4096', SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
    return JSON.parse(fs.readFileSync(fout, 'utf8'));
  }))).flat();
  fs.rmSync(TMP, { recursive: true, force: true });
  return rows;
}

// ---------- main ----------
if (argv.includes('--report-only')) {
  const { writeReport } = await import(R + '/tools/retreat-report.mjs');
  const D = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  D.step2 = step2For(D.cases); fs.writeFileSync(OUT, JSON.stringify(D)); // refresh the step 2 comparison from the current file
  writeReport(D);
  process.exit(0);
}
const NSEED = +arg('--seeds', 5), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const seeds = Array.from({ length: NSEED }, (_, i) => i + 1);
const data = await loadData(load);
const A = data.A, net = data.net, pph = A.demand.personsPerHousehold;
const scenarios = makeScenarios(data), FIRES = scenarios.map(s => s.id);
const ac = data.access; if (!ac) throw new Error('data/model/access-constraints.json is missing: run node tools/access-constraints.mjs');
const vs = A.demand.vehiclesTakenShares, vTot = Object.values(vs).reduce((a, b) => a + b, 0);
const vehPerHH = (1 - A.demand.householdsWithoutVehicleShare) * Object.entries(vs).reduce((s, [k, p]) => s + +k * p, 0) / vTot;

// Blocks: hill residential street segments with their expected households (the simulator's allocation, expected values)
const zones = new Map(data.layers.evacZones.map(z => [z.id, z]));
const expHH = new Map();
for (const [zid, list] of residentialStreets(data)) {
  const z = zones.get(zid); if (!z) continue;
  const H = (z.popModeled ?? z.pop) / pph, W = list.reduce((s, [, w]) => s + w, 0);
  for (const [eid, w] of list) if (W > 0) expHH.set(eid, H * w / W);
}
const hillEdges = [...expHH.keys()].filter(e => net.edges[e].fireZone >= 2).sort((a, b) => a - b);
console.log(`${hillEdges.length} hill blocks, ${Math.round(hillEdges.reduce((s, e) => s + expHH.get(e), 0)).toLocaleString()} expected households`);

// Static factors per block from the access-constraints analysis (dead-end chokes only: a one-way choke opens if police or drivers run the street two ways)
const deadAreas = e => (ac.edgeAreas.get(e) || []).filter(a => a.type === 'dead end');
const outermost = e => { const l = deadAreas(e); return l.length ? l.reduce((m, a) => a.nesting < m.nesting ? a : m) : null; };
const chokeLoad = a => { const ce = net.edges[a.chokeEdges[0]]; const cap = ce.capPerLaneVph || 900; return { vehicles: a.vehicles, capVph: cap, hours: a.vehicles / cap }; };

// ---------- phase 1: risk by block ----------
const t0 = Date.now();
const scoreJobs = []; for (const fire of FIRES) for (const sev of SEVS) for (const seed of seeds) scoreJobs.push({ kind: 'score', fire, sev, seed, edges: hillEdges });
console.log(`phase 1: ${scoreJobs.length} runs on ${WORKERS} workers`);
// --cache <file>: keep the raw runs, to rebuild costs and the report without rerunning (development aid)
const CACHE_F = arg('--cache', null), cached = CACHE_F && fs.existsSync(CACHE_F) ? JSON.parse(fs.readFileSync(CACHE_F, 'utf8')) : null;
const scoreRows = cached?.scoreRows ?? await runJobs(scoreJobs, {}, WORKERS);
console.log(`  done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

const W8 = { front: 3, ember: 1, cut: 2, engine: 1, nest: 0.5, choke: 1 }; // model rule: weights per component
const blocks = hillEdges.map((eid, k) => {
  const e = net.edges[eid];
  let runsHH = 0, rFront = 0, rEmber = 0, rCut = 0, rEng = 0, hhSum = 0, frontShare = 0; const threat = {};
  for (const row of scoreRows) {
    const r = row.r;
    if (r.eng[k] > A.access.engineServiceMin * 60) rEng++;
    if (r.told[k] || r.emb[k]) threat[row.fire] = 1;
    if (!r.nH[k]) continue;
    runsHH++; hhSum += r.nH[k]; frontShare += r.front[k] / r.nH[k];
    if (r.front[k]) rFront++; if (r.ember[k]) rEmber++; if (r.cut[k]) rCut++;
  }
  const areas = deadAreas(eid), outer = outermost(eid), nest = areas.length ? Math.max(...areas.map(a => a.nesting)) : 0;
  const load = outer ? chokeLoad(outer) : null;
  const c = { front: runsHH ? rFront / runsHH : 0, ember: runsHH ? rEmber / runsHH : 0, cut: runsHH ? rCut / runsHH : 0, engine: rEng / scoreRows.length, nest, choke: load ? Math.min(1, load.hours) : 0 };
  const score = W8.front * c.front + W8.ember * c.ember + W8.cut * c.cut + W8.engine * c.engine + W8.nest * c.nest + W8.choke * c.choke;
  const ends = [e.a, e.b].map(n => { const names = [...new Set(data.nodeEdges[n].map(x => net.edges[x]).filter(x => x.mode === 'vehicle' && x.name !== e.name && x.name !== 'UNNAMED').map(x => titleCase(x.name)))]; return names.length ? names.join(' / ') : data.nodeEdges[n].length === 1 ? 'dead end' : '—'; });
  return { edge: eid, street: titleCase(e.name), ends, zone: e.evacZone, fireZone: e.fireZone, fireZoneSrc: e.fireZoneSrc || 'city', lengthM: Math.round(e.len),
    expectedHouseholds: r1(expHH.get(eid)), expectedResidents: r1(expHH.get(eid) * pph), expectedVehicles: r1(expHH.get(eid) * vehPerHH),
    meanHouseholds: r1(hhSum / scoreRows.length), runs: scoreRows.length, runsWithHouseholds: runsHH,
    components: { front: r3(c.front), ember: r3(c.ember), cut: r3(c.cut), engine: r3(c.engine), nest: c.nest, choke: r3(c.choke) },
    meanShareHomeAtFront: runsHH ? r3(frontShare / runsHH) : 0,
    area: outer ? { id: outer.id, street: outer.chokeStreets.join(' / '), clearWidthFt: outer.choke?.clearWidthFt ?? null, vehicles: r1(load.vehicles), chokeCapVph: load.capVph, chokeHours: r3(load.hours) } : null,
    innermostArea: areas.length ? areas[0].id : null, score: r3(score), threat: Object.keys(threat) };
});
const MIN_HH = 1;
const ranked = blocks.filter(b => b.expectedHouseholds >= MIN_HH).sort((a, b) => b.score - a.score || b.expectedHouseholds - a.expectedHouseholds || a.edge - b.edge);
ranked.forEach((b, i) => { b.rank = i + 1; });
console.log('top 15:'); for (const b of ranked.slice(0, 15)) console.log(`  ${b.rank} ${b.street} (${b.ends.join(' – ')}) ${b.zone} hh ${b.expectedHouseholds} score ${b.score} ${JSON.stringify(b.components)}`);

// ---------- buyout cases ----------
const caseList = [];
for (const target of [50, 100, 250, 500]) {
  const sel = []; let hhs = 0;
  for (const b of ranked) { if (hhs >= target) break; sel.push(b.edge); hhs += b.expectedHouseholds; }
  caseList.push({ id: `top${target}`, label: `Top-ranked blocks, about ${target} households`, rule: `highest-scoring blocks in rank order until expected households reach ${target}`, removed: sel });
}
const areaEdges = id => ac.byId.get(id).memberEdges.filter(e => expHH.has(e));
caseList.push({ id: 'panoramicUpper', label: 'Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158)', rule: 'every residential segment of access area AC-158', removed: areaEdges('AC-158') });
caseList.push({ id: 'panoramicAll', label: 'Everything behind the foot of Panoramic Way (9 ft clear, AC-155)', rule: 'every residential segment of access area AC-155', removed: areaEdges('AC-155') });
const cases = {};
for (const c of caseList) {
  const rem = new Set(c.removed), outer = new Set(), zs = new Set();
  for (const e of rem) { const o = outermost(e); if (o) outer.add(o.id); zs.add(net.edges[e].evacZone); }
  const neighbors = [...new Set([...outer].flatMap(id => areaEdges(id)))].filter(e => !rem.has(e));
  const zone = [...expHH.keys()].filter(e => zs.has(net.edges[e].evacZone) && !rem.has(e));
  const threat = FIRES.filter(f => blocks.some(b => rem.has(b.edge) && b.threat.includes(f)) || [...rem].some(e => !hillEdges.includes(e)));
  Object.assign(c, { removed: [...rem].sort((a, b) => a - b), neighbors, zone, outerAreas: [...outer], zones: [...zs].sort(), threat,
    expectedHouseholds: r1(c.removed.reduce((s, e) => s + expHH.get(e), 0)), expectedResidents: r1(c.removed.reduce((s, e) => s + expHH.get(e), 0) * pph),
    neighborExpectedHouseholds: r1(neighbors.reduce((s, e) => s + expHH.get(e), 0)), blocks: c.removed.length,
    streets: [...new Set(c.removed.map(e => titleCase(net.edges[e].name)))] });
  cases[c.id] = { removed: c.removed, neighbors, zone };
  console.log(`case ${c.id}: ${c.blocks} blocks, ${c.expectedHouseholds} hh; neighbors ${c.neighborExpectedHouseholds} hh in ${c.outerAreas.join(',') || 'none'}; fires ${c.threat.join(',')}`);
}
// Residents behind any choke point before and after each buyout (expected values, the access analysis's allocation)
const hillBehind = e => net.edges[e].fireZone >= 2 && (ac.edgeAreas.get(e) || []).length > 0;
for (const c of caseList) {
  const rem = new Set(c.removed);
  c.access = { residentsBehindChokeRemoved: r1([...rem].filter(e => (ac.edgeAreas.get(e) || []).length).reduce((s, e) => s + expHH.get(e), 0) * pph),
    hillResidentsBehindChokeRemoved: r1([...rem].filter(hillBehind).reduce((s, e) => s + expHH.get(e), 0) * pph),
    residentsBehindDeadEndRemoved: r1([...rem].filter(e => deadAreas(e).length).reduce((s, e) => s + expHH.get(e), 0) * pph),
    outerAreasAfter: c.outerAreas.map(id => { const a = ac.byId.get(id); const left = areaEdges(id).filter(e => !rem.has(e)).reduce((s, e) => s + expHH.get(e), 0) * pph; return { id, street: a.chokeStreets.join(' / '), residentsBefore: r1(a.residents), residentsAfter: r1(left) }; }) };
}

// ---------- phase 2: same-seed pairs; phase 3: engine reach with and without parked cars on bought-out blocks ----------
const t1 = Date.now();
const pairJobs = [];
for (const fire of FIRES) {
  const ids = caseList.filter(c => c.threat.includes(fire)).map(c => c.id); if (!ids.length) continue;
  for (const sev of SEVS) for (const seed of seeds) {
    pairJobs.push({ kind: 'pair', fire, sev, seed, case: null, groups: ids });
    for (const id of ids) pairJobs.push({ kind: 'pair', fire, sev, seed, case: id });
  }
}
const engineJobs = [];
for (const tk of ['S4', 'S6']) for (const seed of seeds) {
  engineJobs.push({ kind: 'engine', tk, seed, case: null, groups: caseList.map(c => c.id) });
  for (const c of caseList) for (const clearParking of [false, true]) engineJobs.push({ kind: 'engine', tk, seed, case: c.id, clearParking });
}
console.log(`phase 2–3: ${pairJobs.length} fire runs and ${engineJobs.length} engine-reach builds on ${WORKERS} workers`);
const rows = cached?.rows ?? await runJobs([...pairJobs, ...engineJobs], cases, WORKERS);
if (CACHE_F && !cached) fs.writeFileSync(CACHE_F, JSON.stringify({ scoreRows, rows }));
console.log(`  done in ${((Date.now() - t1) / 60000).toFixed(1)} min`);

// ---------- summaries ----------
const keyOf = r => `${r.fire}|${r.sev}|${r.seed}`;
const baseRow = new Map(rows.filter(r => r.kind === 'pair' && !r.case).map(r => [keyOf(r), r]));
function summarize(pairs, get, m) { // pairs: [with, without]; lower is better
  let better = 0, worse = 0, same = 0; const d = [], dc = [];
  for (const [w, b] of pairs) { const x = get(w)?.[m], y = get(b)?.[m], s = cmp(x, y); if (s < 0) better++; else if (s > 0) worse++; else same++;
    if (x != null && y != null) { d.push(x - y); if (w.sev === 'central') dc.push(x - y); } }
  const med = /^clear/.test(m) ? medianTime : median;
  const B = pairs.map(([, b]) => get(b)?.[m]), Wv = pairs.map(([w]) => get(w)?.[m]);
  const cB = pairs.filter(([w]) => w.sev === 'central').map(([, b]) => get(b)?.[m]), cW = pairs.filter(([w]) => w.sev === 'central').map(([w]) => get(w)?.[m]);
  return { better, worse, same, n: pairs.length, holdsEveryPair: better === pairs.length, neverWorse: worse === 0,
    centralWithout: med(cB), centralWith: med(cW), allWithout: med(B), allWith: med(Wv), medianChange: median(d), centralMedianChange: median(dc),
    notReachedWithout: /^clear/.test(m) ? B.filter(x => x == null).length : undefined, notReachedWith: /^clear/.test(m) ? Wv.filter(x => x == null).length : undefined };
}
const OVERALL_M = ['frontPeople', 'frontHome', 'emberPeople', 'vehNoRoute', 'vehFireFront', 'clearP90', 'clearP100'];
const GROUP_M = ['frontHome', 'emberHome', 'vehFireFront', 'vehNoRoute', 'clearP90', 'clearP100'];
const summaries = [];
for (const c of caseList) for (const fire of c.threat) {
  const pairs = rows.filter(r => r.kind === 'pair' && r.case === c.id && r.fire === fire).map(r => [r, baseRow.get(keyOf(r))]).filter(([, b]) => b);
  if (!pairs.length) continue;
  const G = (k) => r => r.groups[c.id]?.[k];
  // Benefit 1: bought-out residents' exposure in the run without the buyout (zero with it, by definition)
  const removedBase = Object.fromEntries(['people', 'frontHome', 'emberHome', 'vehFireFront', 'vehNoRoute'].map(m => {
    const all = pairs.map(([, b]) => b.groups[c.id].removed[m]), cen = pairs.filter(([w]) => w.sev === 'central').map(([, b]) => b.groups[c.id].removed[m]);
    return [m, { central: median(cen), all: median(all), min: Math.min(...all), max: Math.max(...all) }]; }));
  // Decomposition of the overall change per pair: −(bought-out exposure) + neighbors' change + change elsewhere
  const decomp = {};
  for (const [m, gm] of [['frontHome', 'frontHome'], ['vehNoRoute', 'vehNoRoute']]) {
    const per = pairs.map(([w, b]) => { const tot = w.overall[m] - b.overall[m], rem = -b.groups[c.id].removed[gm], nb = w.groups[c.id].neighbors[gm] - b.groups[c.id].neighbors[gm]; return { sev: w.sev, tot, rem, nb, else: tot - rem - nb }; });
    const md = (k, cen) => median(per.filter(p => !cen || p.sev === 'central').map(p => p[k]));
    decomp[m] = { central: { total: md('tot', 1), boughtOut: md('rem', 1), neighbors: md('nb', 1), elsewhere: md('else', 1) }, all: { total: md('tot'), boughtOut: md('rem'), neighbors: md('nb'), elsewhere: md('else') },
      elsewhereRange: [Math.min(...per.map(p => p.else)), Math.max(...per.map(p => p.else))] };
  }
  summaries.push({ case: c.id, fire, runs: pairs.length, removedHouseholdsPerRun: [Math.min(...pairs.map(([w]) => w.overall.retreatHouseholds)), Math.max(...pairs.map(([w]) => w.overall.retreatHouseholds))],
    overall: Object.fromEntries(OVERALL_M.map(m => [m, summarize(pairs, r => r.overall, m)])),
    neighbors: Object.fromEntries(GROUP_M.map(m => [m, summarize(pairs, G('neighbors'), m)])),
    area: Object.fromEntries(['clearP90', 'clearP100'].map(m => [m, summarize(pairs, G('area'), m)])),
    zone: Object.fromEntries(['frontHome', 'emberHome', 'vehNoRoute'].map(m => [m, summarize(pairs, G('zone'), m)])),
    neighborPeople: median(pairs.map(([, b]) => b.groups[c.id].neighbors.people)), removedBase, decomp });
}
// Engine reach (at ignition, status-quo parking): hill residents beyond 5 minutes, overall and among the neighbors
const engine = [];
for (const c of caseList) {
  const ebase = rows.filter(r => r.kind === 'engine' && !r.case), out = { case: c.id };
  for (const clear of [false, true]) {
    const pr = rows.filter(r => r.kind === 'engine' && r.case === c.id && r.clearParking === clear).map(r => [r, ebase.find(b => b.tk === r.tk && b.seed === r.seed)]);
    const nb = pr.map(([w, b]) => [w.groups[c.id].neighbors.engineBeyond5, b.groups[c.id].neighbors.engineBeyond5]);
    const hill = pr.map(([w, b]) => [w.hill.beyond5, b.hill.beyond5]);
    const rem = pr.map(([, b]) => b.groups[c.id].removed.engineBeyond5);
    const s = arr => ({ without: median(arr.map(p => p[1])), with: median(arr.map(p => p[0])), better: arr.filter(p => p[0] < p[1]).length, worse: arr.filter(p => p[0] > p[1]).length, n: arr.length });
    out[clear ? 'clearParking' : 'keepParking'] = { neighborsBeyond5: s(nb), hillBeyond5: s(hill), boughtOutBeyond5Without: median(rem) };
  }
  engine.push(out);
}

// Engine-only sensitivity: buy out the lowest block of Panoramic Way alone (the 49 m entrance segment of
// AC-155, edge 992 in the current network), with and without its parked cars. SOURCE_NOTES ER3: parked cars on
// that block decide most of the hill's engine reach.
const foot = ac.byId.get('AC-155').chokeEdges.filter(e => expHH.has(e));
const footCase = { removed: foot, neighbors: areaEdges('AC-155').filter(e => !foot.includes(e)), zone: [] };
const footJobs = []; for (const tk of ['S4', 'S6']) for (const seed of seeds) { footJobs.push({ kind: 'engine', tk, seed, case: null, groups: ['footBlock'] }); for (const clearParking of [false, true]) footJobs.push({ kind: 'engine', tk, seed, case: 'footBlock', clearParking }); }
const footRows = await runJobs(footJobs, { ...cases, footBlock: footCase }, WORKERS);
let engineFoot;
{
  const ebase = footRows.filter(r => !r.case), out = { case: 'footBlock', edges: foot, street: titleCase(net.edges[foot[0]].name), expectedHouseholds: r1(foot.reduce((s, e) => s + expHH.get(e), 0)) };
  for (const clear of [false, true]) {
    const pr = footRows.filter(r => r.case && r.clearParking === clear).map(r => [r, ebase.find(b => b.tk === r.tk && b.seed === r.seed)]);
    const hill = pr.map(([w, b]) => [w.hill.beyond5, b.hill.beyond5]);
    const s = arr => ({ without: median(arr.map(p => p[1])), with: median(arr.map(p => p[0])), better: arr.filter(p => p[0] < p[1]).length, worse: arr.filter(p => p[0] > p[1]).length, n: arr.length });
    const nb = pr.map(([w, b]) => [w.groups.footBlock.neighbors.engineBeyond5, b.groups.footBlock.neighbors.engineBeyond5]);
    out[clear ? 'clearParking' : 'keepParking'] = { hillBeyond5: s(hill), neighborsBeyond5: s(nb), boughtOutBeyond5Without: median(pr.map(([, b]) => b.groups.footBlock.removed.engineBeyond5)) };
  }
  engineFoot = out;
}

// ---------- costs (screening ranges) ----------
const { costs, sources: costSources } = await import(R + '/tools/retreat-costs.mjs').then(m => m.computeCosts({ data, caseList: [...caseList, { id: 'footBlock', removed: foot }], expHH, ranked, refresh: argv.includes('--refresh-acs') }));

// ---------- step 2 comparison (second ways out, data/model/egress-candidates.json on this branch) ----------
function step2For(caseList) {
let step2 = null;
try {
  const EC = JSON.parse(fs.readFileSync(path.join(R, 'data/model/egress-candidates.json'), 'utf8'));
  const areasOfCases = new Set(caseList.flatMap(c => c.outerAreas));
  const touched = EC.candidates.filter(k => (k.rank || k.type === 'city') && (k.access?.asIs?.areasAffected || []).some(a => areasOfCases.has(a.id)) && k.access.asIs.hillResidentsFreed > 0);
  const pick = (ev, fire) => { const s = (ev || []).find(x => x.fire === fire && x.mob === 'normal' && x.delay === 10 && x.variant === 'asIs'); if (!s) return null;
    const f = o => o && { without: o.centralMedianWithout, with: o.centralMedianWith, better: o.better, worse: o.worse, same: o.same, n: o.n };
    return { area: s.area, areaFrontHome: f(s.area_.fireFrontHome), areaVehNoRoute: f(s.area_.vehNoRoute), areaClearP90: f(s.area_.clearP90), allVehNoRoute: f(s.overall.vehiclesNoRoute), allFrontPeople: f(s.overall.fireFrontPeople) }; };
  step2 = { provisional: false, source: `data/model/egress-candidates.json (step 2, PR #15; rerun on this network, SOURCE_NOTES EG14), built ${EC.meta?.built}`,
    candidates: touched.map(k => ({ id: k.id, type: k.type, link: `${k.endpoints?.[0]?.street ?? ''} → ${k.toStreet ?? k.endpoints?.[1]?.street ?? ''}`, lengthM: k.lengthM, avgGradePct: k.profile?.avgGradePct,
      rank: k.rank ?? null, areasAffected: k.access.asIs.areasAffected, hillResidentsFreed: k.access.asIs.hillResidentsFreed, cost: k.cost?.total ?? null, buildingsRemoved: k.cost?.buildingsRemoved ?? null, peopleDisplaced: k.cost?.peopleDisplaced ?? null,
      fires: Object.fromEntries(['panoramic', 'ref1923', 'eastWind'].map(f => [f, pick(k.evacuation, f)]).filter(([, v]) => v)) })) };
} catch (e) { console.log(`step 2 comparison skipped: ${e.message.split('\n')[0]}`); }
return step2;
}
const step2 = step2For(caseList);

// ---------- write ----------
const OUTJ = {
  meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/retreat-sim.mjs', report: 'docs/managed-retreat.md',
    note: 'Educational comparison, not a prediction, not an official evacuation plan and not a buyout proposal. Households and residents are synthetic (the simulator\'s allocation of Genasys zone populations); a block is a street segment; no parcels, owners or addresses are used. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count. Costs are screening ranges, not an appraisal, policy or legal analysis.',
    fires: FIRES, severities: SEVS, seeds, plan: 'DEFAULT_PLAN (first order 10 min after ignition, status-quo parking), each scenario\'s default time of day', workers: WORKERS,
    blockRule: 'derived: A block is one street segment of data/model/network.json on which js/sim.js places households (drivable, not a freeway or ramp, in an evacuation zone), in City Fire Zones 2–3 or, outside Berkeley, at 90 m elevation or higher (the simulator\'s hill proxy). Ranked if it holds at least 1 expected household.',
    provenance: {
      expectedHouseholds: 'synthetic: zone population (Genasys, or 2020 Census where data/assumptions.json says so) spread over street length as js/sim.js does, / 2.37 persons per household; expected values',
      front: 'derived from synthetic runs: share of runs (among runs where the block has at least one household) in which at least one household was still home when the fire front reached the block',
      ember: 'derived from synthetic runs: same, when embers arrived',
      cut: 'derived from synthetic runs: share of runs in which at least one of the block\'s cars was on a street when the fire front reached it, or ended the run on the road with no route to safety',
      engine: 'derived from synthetic runs: share of runs in which no engine reaches the block within the City\'s 5-minute standard at ignition, status-quo parking (js/sim.js engineReachTimes; parked cars depend on seed and day or night)',
      nest: 'derived: number of dead-end access areas in series between the block and an exit (data/model/access-constraints.json; one-way chokes left out)',
      choke: 'derived, capped at 1: vehicles behind the block\'s outermost dead-end choke ÷ the choke segment\'s capacity per lane (veh/h), i.e. hours of choke capacity the area\'s cars need',
      score: `model rule: ${W8.front} × front + ${W8.ember} × ember + ${W8.cut} × cut + ${W8.engine} × engine + ${W8.nest} × nest + ${W8.choke} × choke (no calibration; the components are shown so a reader can re-sort)` },
    weights: W8, vehiclesPerHousehold: r3(vehPerHH) },
  totals: { hillBlocks: hillEdges.length, ranked: ranked.length, hillHouseholds: r1(hillEdges.reduce((s, e) => s + expHH.get(e), 0)), unrankedHouseholds: r1(blocks.filter(b => b.expectedHouseholds < MIN_HH).reduce((s, b) => s + b.expectedHouseholds, 0)) },
  ranking: ranked, cases: caseList.map(c => ({ ...c, zone: undefined, neighbors: undefined, neighborBlocks: c.neighbors.length })),
  summaries, engine, engineFoot, costs, costSources, step2, runs: rows.length + scoreRows.length,
};
fs.writeFileSync(OUT, JSON.stringify(OUTJ));
console.log(`wrote ${path.relative(R, OUT)}`);
const { writeReport } = await import(R + '/tools/retreat-report.mjs');
writeReport(OUTJ);
