// "People still there when embers arrived" and "…when the fire front arrived" count each person once
// (SOURCE_NOTES FO7). For each run, recount from the run's state, independently of summary(): the
// distinct households still at home when embers (or the front) reached their street, or whose trip had
// a car on a street under embers (or fire), times persons per household, plus non-resident cars. The
// sum of summary()'s parts must equal that count, and each household must fall in exactly one part.
//   node tests/exposure-once.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), scen = makeScenarios(data), pph = data.A.demand.personsPerHousehold;
const CASES = [['panoramic', 'high', 1], ['northHills', 'high', 3], ['eastWind', 'central', 1], ['ref1923', 'central', 2]];
let bad = 0;
for (const [id, sev, seed] of CASES) {
  const sc = scen.find(s => s.id === id);
  const sim = new Evacuation(data, grid, runFire(grid, sc, SEVERITY[sev], seed), sc, sev, DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay]);
  const S = sim.runToEnd(), { hh, v, t } = sim;
  const carE = new Uint8Array(hh.n), carF = new Uint8Array(hh.n); let nrE = 0, nrF = 0, dHH = 0, dVeh = 0;
  for (let i = 0; i < v.n; i++) { const h = v.hh[i]; if (v.exposed[i]) h < 0 ? nrE++ : carE[h] = 1; if (v.fireFront[i]) h < 0 ? nrF++ : carF[h] = 1; }
  let hE = 0, hF = 0;
  for (let h = 0; h < hh.n; h++) {
    if (hh.gone[h]) continue;
    if (hh.veh[h]) { dHH++; dVeh += hh.veh[h]; }
    if (hh.early[h]) continue;
    const e = hh.ride[h] >= 0 ? hh.ride[h] : h, te = sim.tEmber[hh.edge[h]], tf = sim.tFire[hh.edge[h]];
    if ((te <= t && hh.leftHome[e] > te) || carE[h] || carE[e]) hE++;
    if ((tf <= t && hh.leftHome[e] > tf) || carF[h] || carF[e]) hF++;
  }
  const perCar = pph / Math.max(1, dVeh / Math.max(1, dHH));
  const wantE = hE * pph + nrE * perCar, wantF = hF * pph + nrF * perCar;
  const gotE = S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, gotF = S.fireFrontHome + S.fireFrontRoad;
  const parts = [0, 0, 0, 0, 0]; for (let h = 0; h < hh.n; h++) parts[sim.exposedWhere[h]]++;
  const partsOk = Math.abs(parts[1] * pph - S.exposedHome) < 1e-6 && Math.abs(parts[3] * pph - S.exposedNoVehicle) < 1e-6 && Math.abs(parts[4] * pph - S.notOrderedExposed) < 1e-6 && Math.abs(parts[2] * pph + nrE * perCar - S.exposedRoad) < 1e-6;
  const ok = Math.abs(gotE - wantE) < 1e-6 && Math.abs(gotF - wantF) < 1e-6 && partsOk;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id} ${sev} seed ${seed}: embers ${gotE.toFixed(1)} (distinct people ${wantE.toFixed(1)}; home ${S.exposedHome.toFixed(0)}, road ${S.exposedRoad.toFixed(0)}, no car ${S.exposedNoVehicle.toFixed(0)}, no order ${S.notOrderedExposed.toFixed(0)}), fire front ${gotF.toFixed(1)} (distinct ${wantF.toFixed(1)})`);
}
console.log(bad ? `FAIL (${bad})` : 'exposure-once: every person counted once');
process.exit(bad ? 1 : 0);
