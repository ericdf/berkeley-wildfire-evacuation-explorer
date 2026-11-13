#!/usr/bin/env node
// Spread-and-access run set for the Guided view's four questions (product brief docs/product-brief-spread-access.md;
// method SOURCE_NOTES SA1–SA12). Today's plan (DEFAULT_PLAN) on the four Guided-view fires, the fall-night case
// (Time Study S6), low/central/high severity × seeds 1–5: the same 15 runs per fire as the mitigation table
// (tools/mitigations.mjs baseline) and Change the plan's comparisons. Writes data/model/spread-access.json:
//
//   streets   per fire and severity, for each street segment, in how many of the 5 runs the modeled embers and
//             the modeled fire front reached it within the run (one base-36 digit per segment)
//   residents mean synthetic persons per street segment over the 60 runs (households and persons per
//             household as the simulator draws them, ACS household mix by place)
//   areas     per access-constrained area (data/model/access-constraints.json) and fire: runs in which the fire
//             front and embers reached its entrance (its only drivable way out), synthetic residents behind it
//             who had not left when the front reached it, model minutes from the area's first order or warning to
//             the front reaching the entrance, and runs in which an engine fits through the entrance with the
//             night's parked cars (5 parking draws; the same on every fire)
//   runs      per run: synthetic residents on streets embers or the front reached, cars cut off by fire, hill
//             residents an engine cannot reach within 5 minutes or at all (at ignition), live engine reach
//   parking   engine reach at ignition under the alternative night parking rule (pre-2026-11-05), seeds 1–5
//   levers    per new road or opened path in data/model/mitigations.json and fire: runs in which the fire front or
//             embers reached it; residents no longer behind a single drivable way out (egress-candidates.json)
//
//   node tools/spread-access.mjs [--seeds 5] [--workers N]
//
// Educational comparison, not a prediction. Every count of people is synthetic; no household-level record is kept.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FIRES = ['eastWind', 'ref1923', 'panoramic', 'northHills'];
const SEVS = ['low', 'central', 'high'];
const TOD = 'S6';
const WORLD = { growth: 'none', powerShutoff: 'none' }; // the Guided view's world (js/main.js world())

async function setup() {
  const { loadData } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire, cellOf } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
  const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.resolve(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
  const grid = buildFireGrid(data);
  const scen = Object.fromEntries(makeScenarios(data).map(s => [s.id, s]));
  const mit = JSON.parse(fs.readFileSync(path.join(R, 'data/model/mitigations.json'), 'utf8'));
  return { data, grid, scen, runFire, cellOf, SEVERITY, TIME_OF_DAY, Evacuation, DEFAULT_PLAN, mit };
}

// Persons per household of household h in this run.
const persons = (sim, h) => sim.hhPersons ? sim.hhPersons[h] : sim.data.A.demand.personsPerHousehold;

function runOne(E, j) {
  const { data, grid, scen } = E, sc = scen[j.fire], fire = E.runFire(grid, sc, E.SEVERITY[j.sev], j.seed);
  const sim = new E.Evacuation(data, grid, fire, sc, j.sev, { ...E.DEFAULT_PLAN }, j.seed, E.TIME_OF_DAY[TOD], WORLD);
  const nE = data.net.edges.length, end = sim.end, hh = sim.hh;
  // Fire on each segment within the run (fire-only: the same under every plan).
  const ember = new Uint8Array(nE), front = new Uint8Array(nE);
  for (let e = 0; e < nE; e++) { ember[e] = sim.tEmber[e] <= end ? 1 : 0; front[e] = sim.tFire[e] <= end ? 1 : 0; }
  // Synthetic persons per segment (before any trip; bought-out households: none in today's plan).
  const pe = new Float64Array(nE);
  for (let h = 0; h < hh.n; h++) pe[hh.edge[h]] += persons(sim, h);
  const S = sim.runToEnd();
  // Areas: entrance (choke) timing, residents behind who had not left when the front reached it.
  const areas = {};
  for (const a of data.access?.areas || []) {
    if (!(a.residents > 0)) continue;
    const tF = Math.min(...a.chokeEdges.map(e => sim.tFire[e])), tE = Math.min(...a.chokeEdges.map(e => sim.tEmber[e]));
    const member = new Set(a.memberEdges);
    let res = 0, notLeft = 0, firstTold = Infinity;
    for (let h = 0; h < hh.n; h++) {
      if (!member.has(hh.edge[h])) continue;
      const p = persons(sim, h); res += p;
      const z = hh.zone[h]; firstTold = Math.min(firstTold, sim.orderT[z], sim.warnT[z]);
      const r = hh.ride[h] >= 0 ? hh.ride[h] : h;
      if (tF <= end && !hh.early[h] && !hh.gone[h] && hh.leftHome[r] > tF) notLeft += p;
    }
    const fits = a.chokeEdges.every(e => sim.engineOK[e]);
    const beyond5 = a.memberEdges.reduce((s, e) => s + (sim.engineReach0[e] > 300 ? pe[e] : 0), 0);
    areas[a.id] = { f: tF <= end ? 1 : 0, m: tE <= end ? 1 : 0, nl: Math.round(notLeft * 10) / 10, res: Math.round(res * 10) / 10,
      gap: tF <= end && firstTold < Infinity ? Math.round((tF - firstTold) / 60) : null, fits: fits ? 1 : 0, b5: Math.round(beyond5 * 10) / 10 };
  }
  // New roads and opened paths in the mitigation table: fire at the link (midpoint cell of each piece).
  const levers = {};
  for (const l of E.mit.levers) {
    const L = l.delta?.link; if (!L) continue;
    const pts = L.open ? L.open.map(id => data.edgeMid[id]) : [L.geom[Math.floor(L.geom.length / 2)]];
    const at = arr => Math.min(...pts.map(([x, y]) => { const c = E.cellOf(grid, x, y); return c < 0 ? Infinity : arr[c] * 60; }));
    levers[l.id] = { f: at(fire.arrival) <= end ? 1 : 0, m: at(fire.ember) <= end ? 1 : 0 };
  }
  let emberRes = 0, frontRes = 0; for (let e = 0; e < nE; e++) { if (ember[e]) emberRes += pe[e]; if (front[e]) frontRes += pe[e]; }
  const run = { fire: j.fire, sev: j.sev, seed: j.seed, emberResidents: Math.round(emberRes), frontResidents: Math.round(frontRes),
    cutOff: S.vehiclesNoRoute, engineBeyond5: Math.round(S.engineReachBeyond5People), engineNoRoute: Math.round(S.engineReachUnreachablePeople),
    engineHill: Math.round(S.engineReachHillPeople), engineLiveMeanShare: S.engineReach5ShareLiveMean == null ? null : Math.round(S.engineReach5ShareLiveMean * 1000) / 1000,
    clearP90ModelMin: S.clearP90,
    // The two "people not yet out" results split four ways (Guided view, SOURCE_NOTES GV13); each set sums to the
    // mitigation table's ember and frontPeople measures for the same run. Persons, rounded to 0.1.
    split: Object.fromEntries(Object.entries({
      ember: [S.exposedHome, S.exposedNoVehicle, S.notOrderedExposed, S.exposedRoad],
      front: [S.fireFrontHome - S.fireFrontNoVehicle - S.fireFrontNotOrdered, S.fireFrontNoVehicle, S.fireFrontNotOrdered, S.fireFrontRoad],
    }).map(([k, v]) => [k, v.map(x => Math.round(x * 10) / 10)])) };
  return { j, run, ember: Buffer.from(ember).toString('base64'), front: Buffer.from(front).toString('base64'), pe: Array.from(pe, x => Math.round(x * 100) / 100), areas, levers };
}

// Engine reach at ignition under the pre-2026-11-05 night parking rule (Expert-view scenario setting): fire-independent.
function parkingAlt(E, seed) {
  const sc = E.scen.eastWind, fire = E.runFire(E.grid, sc, E.SEVERITY.central, seed), out = {};
  for (const rule of ['count2026', 'pre20261105']) {
    const sim = new E.Evacuation(E.data, E.grid, fire, sc, 'central', { ...E.DEFAULT_PLAN }, seed, E.TIME_OF_DAY[TOD], { ...WORLD, ...(rule === 'count2026' ? {} : { nightParking: rule }) });
    const S = sim.summary();
    out[rule] = { engineBeyond5: Math.round(S.engineReachBeyond5People), engineNoRoute: Math.round(S.engineReachUnreachablePeople),
      areaFits: Object.fromEntries((E.data.access?.areas || []).filter(a => a.residents > 0).map(a => [a.id, a.chokeEdges.every(e => sim.engineOK[e]) ? 1 : 0])) };
  }
  return out;
}

if (!isMainThread) {
  const E = await setup();
  parentPort.on('message', j => {
    if (!j) process.exit(0);
    parentPort.postMessage(j.parking ? { j, parking: parkingAlt(E, j.seed) } : runOne(E, j));
  });
  parentPort.postMessage(null);
} else {
  const workers = +arg('--workers', Math.max(1, os.cpus().length - 1)), nSeeds = +arg('--seeds', 5);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const jobs = [...seeds.map(seed => ({ parking: true, seed })), ...FIRES.flatMap(fire => SEVS.flatMap(sev => seeds.map(seed => ({ fire, sev, seed }))))];
  const t0 = Date.now(), results = [];
  await new Promise((done, fail) => {
    let next = 0, live = 0;
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const W = new Worker(SELF); live++;
      W.on('error', fail);
      W.on('exit', () => { if (--live === 0) done(); });
      W.on('message', m => {
        if (m) { results.push(m); console.log(`${results.length}/${jobs.length} ${m.j.parking ? `parking seed ${m.j.seed}` : `${m.j.fire} ${m.j.sev} ${m.j.seed}`} ${((Date.now() - t0) / 60000).toFixed(1)} min`); }
        W.postMessage(next < jobs.length ? jobs[next++] : null);
      });
    }
  });
  const { loadData } = await import(R + '/js/data.js');
  const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.resolve(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
  const nE = data.net.edges.length, mit = JSON.parse(fs.readFileSync(path.join(R, 'data/model/mitigations.json'), 'utf8'));
  const egress = JSON.parse(fs.readFileSync(path.join(R, 'data/model/egress-candidates.json'), 'utf8'));
  const runs = results.filter(r => !r.j.parking);
  const dec = s => Buffer.from(s, 'base64');
  const digits = counts => Array.from(counts, c => c.toString(36)).join('');
  const streets = {}, areas = {}, levers = {};
  const peSum = new Float64Array(nE);
  for (const r of runs) for (let e = 0; e < nE; e++) peSum[e] += r.pe[e];
  for (const fire of FIRES) {
    streets[fire] = {}; areas[fire] = {}; levers[fire] = {};
    for (const sev of SEVS) {
      const rs = runs.filter(r => r.j.fire === fire && r.j.sev === sev).sort((a, b) => a.j.seed - b.j.seed);
      const em = new Uint8Array(nE), fr = new Uint8Array(nE);
      for (const r of rs) { const a = dec(r.ember), b = dec(r.front); for (let e = 0; e < nE; e++) { em[e] += a[e]; fr[e] += b[e]; } }
      streets[fire][sev] = { runs: rs.length, ember: digits(em), front: digits(fr) };
      for (const r of rs) {
        for (const [id, a] of Object.entries(r.areas)) {
          const A = areas[fire][id] ||= { front: {}, ember: {}, notLeft: [], gapMin: [] };
          A.front[sev] = [(A.front[sev]?.[0] || 0) + a.f, (A.front[sev]?.[1] || 0) + 1];
          A.ember[sev] = [(A.ember[sev]?.[0] || 0) + a.m, (A.ember[sev]?.[1] || 0) + 1];
          if (a.f) { A.notLeft.push(a.nl); if (a.gap != null) A.gapMin.push(a.gap); }
        }
        for (const [id, l] of Object.entries(r.levers)) {
          const L = levers[fire][id] ||= { front: {}, ember: {} };
          L.front[sev] = [(L.front[sev]?.[0] || 0) + l.f, (L.front[sev]?.[1] || 0) + 1];
          L.ember[sev] = [(L.ember[sev]?.[0] || 0) + l.m, (L.ember[sev]?.[1] || 0) + 1];
        }
      }
    }
  }
  // Fire-independent per area: residents (mean over runs) and engine fit at the entrance per parking draw (seed).
  const areaStatic = {};
  const central = runs.filter(r => r.j.fire === 'eastWind' && r.j.sev === 'central');
  for (const a of data.access?.areas || []) {
    if (!(a.residents > 0)) continue;
    const rs = runs.map(r => r.areas[a.id]).filter(Boolean);
    const alt = results.filter(r => r.j.parking).map(r => r.parking.pre20261105.areaFits[a.id]);
    areaStatic[a.id] = { residents: Math.round(10 * rs.reduce((s, x) => s + x.res, 0) / rs.length) / 10,
      engineFits: [central.reduce((s, r) => s + (r.areas[a.id]?.fits || 0), 0), central.length],
      engineFitsAltRule: [alt.reduce((s, x) => s + (x || 0), 0), alt.length],
      beyond5: Math.round(10 * central.reduce((s, r) => s + (r.areas[a.id]?.b5 || 0), 0) / Math.max(1, central.length)) / 10 };
  }
  const leverStatic = {};
  for (const l of mit.levers) {
    const L = l.delta?.link; if (!L) continue;
    const c = egress.candidates.find(x => x.id === L.id);
    leverStatic[l.id] = { residentsFreed: c?.access?.asIs?.residentsFreed ?? null, hillResidentsFreed: c?.access?.asIs?.hillResidentsFreed ?? null,
      source: c ? `data/model/egress-candidates.json, candidate ${L.id}, access.asIs.residentsFreed (tools/access-constraints.mjs --links, built ${egress.meta?.built || 'n/a'})` : null };
  }
  const parking = results.filter(r => r.j.parking).sort((a, b) => a.j.seed - b.j.seed).map(r => ({ seed: r.j.seed, count2026: { engineBeyond5: r.parking.count2026.engineBeyond5, engineNoRoute: r.parking.count2026.engineNoRoute }, pre20261105: { engineBeyond5: r.parking.pre20261105.engineBeyond5, engineNoRoute: r.parking.pre20261105.engineNoRoute } }));
  const out = {
    meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/spread-access.mjs', fires: FIRES, severities: SEVS, seeds, timeOfDay: TOD, plan: 'DEFAULT_PLAN (js/sim.js): today\'s plan', world: WORLD,
      runs: runs.length, wallMin: Math.round((Date.now() - t0) / 6000) / 10, edges: nE,
      note: 'Educational comparison, not a prediction and not an official evacuation plan. Fires are illustrative scenario outputs; people are synthetic households; minutes are model time, not a forecast. A share of runs is not a probability.',
      encoding: 'streets[fire][severity].ember/front: one base-36 digit per street segment (network edge id order), the number of runs (of streets[fire][severity].runs) in which the modeled embers or fire front reached the segment\'s midpoint cell within the run' },
    residentsPerEdge: Array.from(peSum, x => Math.round(10 * x / runs.length) / 10),
    streets, areas, areaStatic, levers, leverStatic, parking,
    runs: runs.map(r => r.run).sort((a, b) => FIRES.indexOf(a.fire) - FIRES.indexOf(b.fire) || SEVS.indexOf(a.sev) - SEVS.indexOf(b.sev) || a.seed - b.seed),
  };
  // Keep only what the page needs: drop per-area entries never reached and with no residents.
  for (const fire of FIRES) for (const [id, A] of Object.entries(areas[fire])) {
    const med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    A.notLeftMedian = med(A.notLeft); A.notLeftMax = A.notLeft.length ? Math.max(...A.notLeft) : null; A.gapMedianMin = med(A.gapMin);
    delete A.notLeft; delete A.gapMin;
    if (!Object.values(A.front).some(v => v[0]) && !Object.values(A.ember).some(v => v[0])) delete areas[fire][id];
  }
  const file = path.join(R, 'data/model/spread-access.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} kB), ${runs.length} runs in ${out.meta.wallMin} min`);
}
