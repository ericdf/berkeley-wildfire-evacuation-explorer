// Stacked changes (js/levers.js, Simple view "Try changes"): a stack of one lever must reproduce the
// stored mitigation-table run for that lever exactly (tools/mitigations.mjs applies each lever alone),
// conflicting levers must be refused, and building a stack must never change the base data.
//   node tests/stack.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation } = await import(R + '/js/sim.js');
const { stackOf, dataFor, conflict } = await import(R + '/js/levers.js');
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const base = await loadData(load), grid = buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
const M = JSON.parse(fs.readFileSync(R + '/data/model/mitigations.json'));
const lv = id => M.levers.find(l => l.id === id);
const meas = S => ({ ember: S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, front: S.fireFrontHome, cutOff: S.vehiclesNoRoute, engine: S.engineReachBeyond5People, clear90: S.clearP90 });
const fire = 'eastWind', sev = 'central', seed = 2, F = runFire(grid, scen[fire], SEVERITY[sev], seed);
const run = ids => { const st = stackOf(ids.map(lv)); return meas(new Evacuation(dataFor(base, st.net), grid, F, scen[fire], sev, st.plan, seed, TIME_OF_DAY.S6, st.world).runToEnd()); };
let bad = 0;
for (const id of ['baseline', 'redCurbFoot', 'link-AC-160-N3', 'link-CITY-1', 'retreat-footBlock', 'widen-WP-007', 'leaveEarly', 'contraflow-officers']) {
  const got = run(id === 'baseline' ? [] : [id]), want = M.runs.find(r => r.lever === id && r.fire === fire && r.sev === sev && r.seed === seed).m;
  const ok = Object.keys(got).every(k => got[k] === want[k] || Math.abs(got[k] - want[k]) < 1e-6);
  if (!ok) bad++; console.log(id, ok ? 'same' : 'DIFF', JSON.stringify(got), ok ? '' : JSON.stringify(want));
}
console.log('stack', JSON.stringify(run(['leaveEarly', 'redCurbFoot', 'link-AC-160-N3', 'retreat-top100'])));
console.log('conflicts', conflict(lv('redCurbFoot'), lv('widen-WP-001')), '|', conflict(lv('contraflow-officers'), lv('contraflow-signs')), '|', conflict(lv('redCurbFoot'), lv('retreat-footBlock')), '|', conflict(lv('redCurbFoot'), lv('retreat-top100')));
console.log('base untouched', base.net.edges.length, base.net.edges[992].redCurb ?? false);
const c = [conflict(lv("redCurbFoot"), lv("widen-WP-001")), conflict(lv("contraflow-officers"), lv("contraflow-signs")), conflict(lv("redCurbFoot"), lv("retreat-footBlock"))];
if (c.some(x => !x) || conflict(lv("redCurbFoot"), lv("retreat-top100")) || base.net.edges.length !== JSON.parse(fs.readFileSync(R + "/data/model/network.json")).edges.length || base.net.edges[992].redCurb) bad++;
console.log(bad ? `FAIL (${bad})` : "stack: all checks pass"); process.exit(bad);
