// Fire families (js/scenarios.js familyOf; docs/design/fire-families.md). Checks:
//   1. every member's ignition lies on a burnable wildland cell (fuel >= 0.7), inside the 1923 clip for ref1923;
//   2. the default member is the fire as it is: memberScenario returns the scenario itself, and a run
//      through the member path reproduces today's run exactly (summary, fire arrival);
//   3. member keys never collide, and distinct members never share a fire (ignition and wind);
//   4. the pass counts of a comparison with families on (18, 27, 18, 18) and off (15);
//   5. households, parked cars and the shared random stream depend on the seed, not the member or the plan.
//   node tests/families.mjs
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire, cellOf, inBB, inPoly, bbox } from '../js/fire.js';
import { makeScenarios, familyOf, defaultMember, memberScenario, comparisonCases, FAMILY_WINDS, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { FIRES, PRESETS } from '../js/presets.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const scen = makeScenarios(data).filter(s => s.kind !== 'earthquake'); // earthquake fires start in buildings and have no families (SOURCE_NOTES EQ11)
const M = JSON.parse(fs.readFileSync('data/model/mitigations.json'));
let bad = 0;
const fail = msg => { bad++; console.log('FAIL ' + msg); };

// 1. burnable ignitions
for (const sc of scen) {
  const clip = sc.clip?.map(z => ({ rings: z.rings, bb: bbox(z.rings) }));
  for (const m of familyOf(sc, data)) {
    const c = cellOf(grid, ...m.ignition);
    const inClip = !clip || clip.some(q => inBB(q.bb, ...m.ignition) && inPoly(...m.ignition, q.rings));
    const ok = c >= 0 && grid.fuel[c] >= Math.fround(0.7) && inClip; // fuel is Float32
    if (!ok) fail(`${sc.id} ${m.id}: ignition cell ${c} fuel ${c >= 0 ? grid.fuel[c] : 'outside the grid'}${inClip ? '' : ', outside the clip'}`);
    else console.log(`ok   ${sc.id.padEnd(11)} ${m.id.padEnd(15)} fuel ${grid.fuel[c].toFixed(1)} elev ${grid.elev[c].toFixed(0)} m${m.isDefault ? ' (default)' : ''}`);
  }
  const fam = familyOf(sc, data), defs = fam.filter(m => m.isDefault);
  if (defs.length !== 1) fail(`${sc.id}: ${defs.length} default members`);
  if (!FAMILY_WINDS.includes(sc.windFrom)) fail(`${sc.id}: wind ${sc.windFrom}° is not one of the family winds ${FAMILY_WINDS.join(', ')} (east wind moves to 60° in Part A)`);
}

// 2. the default member reproduces today's runs
for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id), d = defaultMember(sc, data);
  if (memberScenario(sc, d, data) !== sc || memberScenario(sc, undefined, data) !== sc) fail(`${sc.id}: memberScenario(default) is not the scenario itself`);
  const seed = 2, sev = 'central';
  const run = s => { const fire = runFire(grid, s, SEVERITY[sev], seed); return [fire, new Evacuation(data, grid, fire, s, sev, DEFAULT_PLAN, seed, TIME_OF_DAY.S6).runToEnd()]; };
  const [fa, a] = run(sc), [fb, b] = run(memberScenario(sc, d, data));
  const same = JSON.stringify(a) === JSON.stringify(b) && fa.arrival.every((v, i) => v === fb.arrival[i]);
  const want = M.runs.find(r => r.lever === 'baseline' && r.fire === sc.id && r.sev === sev && r.seed === seed)?.m;
  const tab = !want || (want.ember === a.exposedHome + a.exposedRoad + a.exposedNoVehicle + a.notOrderedExposed && want.engine === a.engineReachBeyond5People);
  if (!same) fail(`${sc.id}: default member run differs from today's run`);
  else if (!tab) fail(`${sc.id}: today's run differs from the stored mitigation table (rerun tools/mitigations.mjs?)`);
  else console.log(`ok   ${sc.id}: default member ${d} reproduces today's run (seed ${seed}, ${sev}) and the stored table`);
}

// 3. keys
const keys = new Set(), fires = new Map(); let n = 0;
for (const sc of scen) for (const m of familyOf(sc, data)) {
  const s = memberScenario(sc, m.id, data), fk = `${sc.id}|${s.ignition}|${s.windFrom}`;
  if (fires.has(fk)) fail(`${sc.id}: members ${fires.get(fk)} and ${m.id} run the same fire`); fires.set(fk, m.id);
  for (const sev of Object.keys(SEVERITY)) for (const seed of [1, 2, 3, 4, 5]) for (const stack of ['', 'leaveEarly', 'leaveEarly+redCurbFoot']) { keys.add(`${sc.id}|${m.id}|${stack}|${sev}|${seed}`); n++; }
}
if (keys.size !== n) fail(`keys collide: ${n - keys.size}`); else console.log(`ok   ${n} member keys, none collide; ${fires.size} members, each its own fire`);

// 4. pass counts
const want = { ref1923: 18, northHills: 27, eastWind: 18, panoramic: 18 };
for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id);
  const on = comparisonCases(sc, data, { families: true, severities: M.meta.severities }), off = comparisonCases(sc, data, { families: false, severities: M.meta.severities, seeds: M.meta.seeds });
  if (on.length !== want[sc.id] || off.length !== 15 || new Set(on.map(c => c.key)).size !== on.length) fail(`${sc.id}: ${on.length} passes with families on (want ${want[sc.id]}), ${off.length} off (want 15)`);
  else console.log(`ok   ${sc.id}: ${on.length} passes with families on (${familyOf(sc, data).length} members), ${off.length} off`);
}

// 5. households depend on the seed, not the member or the plan
const LE = PRESETS.find(P => P.id === 'leaveEarly');
for (const F of FIRES) {
  const sc = scen.find(s => s.id === F.id), fam = familyOf(sc, data), d = fam.find(m => m.isDefault), o = fam.find(m => !m.isDefault) || d;
  const build = (m, plan) => { const s = memberScenario(sc, m.id, data); return new Evacuation(data, grid, runFire(grid, s, SEVERITY.central, 1), s, 'central', plan, 1, TIME_OF_DAY.S6); };
  const a = build(d, DEFAULT_PLAN), b = build(o, DEFAULT_PLAN), c = build(o, LE.B);
  // Other cities' orders follow each member's fire (js/sim.js otherCityOrders), so kind, commuter,
  // departure and ride are compared on households whose zone gets the same order and warning times.
  const same = (x, y, i) => { const z = x.hh.zone[i]; return x.orderT[z] === y.orderT[z] && x.warnT[z] === y.warnT[z]; };
  const eq = (x, y, f, all) => x.hh[f].every((v, i) => v === y.hh[f][i] || (!all && !same(x, y, i)));
  const diff = ['veh', 'edge'].filter(f => !eq(a, b, f, true)).concat(['kind', 'commuter', 'depart', 'ride'].filter(f => !eq(a, b, f, false)));
  const diffPlan = ['veh', 'edge', 'kind'].filter(f => !eq(b, c, f, true));
  const park = a.parking.sides.every((v, i) => v === b.parking.sides[i]);
  const streams = [a.rand(), b.rand(), c.rand()];
  if (diff.length || diffPlan.length || !park || new Set(streams).size !== 1) fail(`${sc.id}: ${d.id} vs ${o.id}: ${diff.join(', ')} differ${diffPlan.length ? `; plans differ in ${diffPlan.join(', ')}` : ''}${park ? '' : '; parked cars differ'}${new Set(streams).size !== 1 ? '; shared stream differs' : ''}`);
  else console.log(`ok   ${sc.id}: ${d.id} and ${o.id}, today's plan and leave early, seed 1: same ${a.hh.n.toLocaleString()} households, parked cars and shared stream (kind, timing and ride compared where both members order the zone alike: ${a.hh.zone.filter((z, i) => same(a, b, i)).length.toLocaleString()})`);
}
console.log(bad ? `FAIL (${bad})` : 'families: all checks pass');
process.exit(bad ? 1 : 0);
