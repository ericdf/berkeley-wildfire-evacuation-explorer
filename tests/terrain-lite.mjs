// The browser's light terrain set (tools/build-terrain-lite.mjs; js/data.js loadData { lite: true }; SOURCE_NOTES GV19)
// against the full 4 m DEM that tests and tools load. Checks:
//   1. the fire grid (elevation, fuel class and factor, zone, city mask) is identical;
//   2. every candidate new road's edge (profile, grades, capacity) is identical, and so is the network every link
//      lever in data/model/mitigations.json builds (js/levers.js dataFor);
//   3. the same runs give identical summaries: every Guided fire at medium severity, seed 1, today's plan, and a run
//      with a new-road Change;
//   4. the contours decode to the full DEM's within half a meter (display only).
//   node tests/terrain-lite.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { dataFor, stackOf } from '../js/levers.js';
import { withLinks, demSampler } from '../tools/egress-link.mjs';
import { makeContours } from '../js/terrain.js';
import { FIRES } from '../js/presets.js';

const load = async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const full = await loadData(load), lite = await loadData(load, { lite: true }); await lite.deferred;
let bad = 0; const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// 1. fire grid
const gF = buildFireGrid(full), gL = buildFireGrid(lite);
for (const k of ['elev', 'fuel', 'fuelClass', 'zone', 'inCity']) check(same(gF[k], gL[k]), `fire grid ${k}: identical (${gF[k].length} cells)`);

// 2. new roads
const EC = JSON.parse(fs.readFileSync('data/model/egress-candidates.json')), fe = demSampler(full.dem, full.Z);
let n = 0, diff = [];
for (const c of EC.candidates) if (c.geom) {
  const spec = { links: [{ id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone }] };
  const a = withLinks(full.net, full.A, fe, spec), b = withLinks(lite.net, lite.A, lite.linkElev, spec);
  n++; if (JSON.stringify(a.edges.slice(full.net.edges.length)) !== JSON.stringify(b.edges.slice(lite.net.edges.length))) diff.push(c.id);
}
check(!diff.length, `new-road edges identical for ${n} candidates${diff.length ? `; differ: ${diff.join(', ')}` : ''}`);
const M = JSON.parse(fs.readFileSync('data/model/mitigations.json'));
const linkLevers = M.levers.filter(l => l.ran && l.delta?.link);
for (const l of linkLevers) { const st = stackOf([l]); const a = dataFor(full, st.net), b = dataFor(lite, st.net); check(JSON.stringify(a.net.edges) === JSON.stringify(b.net.edges), `${l.id}: network identical`); }

// 3. runs
const scen = makeScenarios(lite), scenF = makeScenarios(full);
const run = (data, grid, sc, plan = DEFAULT_PLAN, d = data) => new Evacuation(d, grid, runFire(grid, sc, SEVERITY.central, 1), sc, 'central', plan, 1, TIME_OF_DAY.S6, { growth: 'none', powerShutoff: 'none' }).runToEnd();
for (const F of FIRES) {
  const a = run(full, gF, scenF.find(s => s.id === F.id)), b = run(lite, gL, scen.find(s => s.id === F.id));
  check(JSON.stringify(a) === JSON.stringify(b), `${F.id}: summary identical (medium, seed 1)`);
}
if (linkLevers[0]) { const st = stackOf([linkLevers[0]]), sc = scen.find(s => s.id === 'panoramic'), scF = scenF.find(s => s.id === 'panoramic');
  const a = run(full, gF, scF, DEFAULT_PLAN, dataFor(full, st.net)), b = run(lite, gL, sc, DEFAULT_PLAN, dataFor(lite, st.net));
  check(JSON.stringify(a) === JSON.stringify(b), `panoramic with ${linkLevers[0].id}: summary identical`); }

// 4. contours (display)
const C = makeContours(full.dem, full.Z, 20, 3);
let worst = 0, cnt = 0;
for (const { level, segs } of C) { const L = lite.contours.find(x => x.level === level); if (!L || L.segs.length !== segs.length) { worst = Infinity; break; } for (let i = 0; i < segs.length; i++) worst = Math.max(worst, Math.abs(L.segs[i] - segs[i])); cnt += segs.length; }
check(worst <= 0.25 + 1e-6, `contours: ${C.length} levels, ${cnt / 4} segments, largest difference ${worst.toFixed(3)} m`);
console.log(bad ? `FAIL (${bad})` : 'terrain-lite: all checks pass');
process.exit(bad ? 1 : 0);
