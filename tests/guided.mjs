// Guided view figures from the stored tables (js/guided-data.js; SOURCE_NOTES GV3–GV8). No simulation runs.
//   node tests/guided.mjs
// Checks: the change groups derived from data/model/mitigations.json on the east-wind fire match the list Eric
// approved on 2026-11-10; a change withheld under P19 (js/presets.js off) is withheld here; engine reach counts as
// "any fire" and people measures as "this fire"; result figures are medians of today's plan's 15 runs; one-change
// comparisons pair the same seeds; new roads that free the same areas give a floor, not a sum.
import fs from 'node:fs';
import { makeGuided, CARDS, median, sortItems, costLine } from '../js/guided-data.js';
import { PRESETS } from '../js/presets.js';

const R = new URL('..', import.meta.url).pathname;
const M = JSON.parse(fs.readFileSync(R + 'data/model/mitigations.json'));
const SA = JSON.parse(fs.readFileSync(R + 'data/model/spread-access.json'));
const G = makeGuided(M, SA, PRESETS);
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };
const ids = (gs, id) => gs.find(g => g.id === id).items.map(i => i.lever.id).sort().join(',');
const set = xs => [...xs].sort().join(',');

const east = G.groups('eastWind');
check(ids(east, 'people') === set(['leaveEarly', 'orderSooner']), `east wind, people: ${ids(east, 'people')}`);
check(ids(east, 'engine') === set(['parkingOneSide', 'redCurbFoot', 'widen-WP-001', 'link-AC-160-N3', 'retreat-footBlock', 'retreat-top100', 'retreat-panoramicUpper', 'widen-WP-007', 'link-CITY-1']), `east wind, engines: ${ids(east, 'engine')}`);
check(ids(east, 'cars') === set(['leaveEarly', 'orderSooner']), `east wind, cars: ${ids(east, 'cars')}`);
check(ids(east, 'none') === set(['contraflow-officers', 'contraflow-signs', 'policeControl', 'egressGuidance', 'link-AC-193-N1']), `east wind, no consistent benefit: ${ids(east, 'none')}`);

// P19: decide faster is withheld on the north hills (js/presets.js PRESETS orderSooner.off.northHills).
const north = G.groups('northHills');
const nf = north.find(g => g.id === 'none').items.find(i => i.lever.id === 'orderSooner');
check(!!nf?.withheld && !north.filter(g => g.id !== 'none').some(g => g.items.some(i => i.lever.id === 'orderSooner')), 'north hills: decide faster withheld (P19)');

// Every change appears somewhere on every fire.
for (const f of M.meta.fires) {
  const seen = new Set(G.groups(f).flatMap(g => g.items.map(i => i.lever.id)));
  check(G.levers.every(l => seen.has(l.id)), `${f}: every change listed (${seen.size} of ${G.levers.length})`);
}

check(G.anyFire('engine') && !G.anyFire('ember') && !G.anyFire('cutOff'), 'engine reach is the same on any fire; embers and cars depend on the fire');

for (const c of CARDS.filter(c => c.key)) {
  const f = G.baseFigure('eastWind', c.key), runs = M.runs.filter(r => r.lever === 'baseline' && r.fire === 'eastWind');
  check(f.n === 15 && f.value === median(runs.map(r => r.m[c.key])), `east wind ${c.id}: median of 15 runs = ${Math.round(f.value)} (${f.label.label})`);
}

// One change from the table: leave early, east wind, embers. Gain = median of same-seed differences.
const le = G.tableCompare('eastWind', 'leaveEarly', 'ember'), s = M.summaries.find(x => x.lever === 'leaveEarly' && x.fire === 'eastWind').measures.ember;
check(le.n === 15 && le.d.better === s.better && le.d.worse === s.worse, `leave early, embers: better ${le.d.better}, worse ${le.d.worse} of ${le.n} (table ${s.better}/${s.worse})`);
for (const f of M.meta.fires) for (const l of G.levers) for (const k of ['ember', 'frontPeople', 'engine', 'cutOff']) {
  const t = G.tableCompare(f, l.id, k), m = M.summaries.find(x => x.lever === l.id && x.fire === f).measures[k];
  if (t.d.better !== m.better || t.d.worse !== m.worse) check(false, `${f} ${l.id} ${k}: tally ${t.d.better}/${t.d.worse} against the table's ${m.better}/${m.worse}`);
}
check(true, 'pass tallies recomputed from runs match the table summaries for every change, fire and measure');

const fr = G.freed(['link-CITY-1', 'link-AC-160-N3']);
check(fr.atLeast && fr.value === Math.max(SA.leverStatic['link-CITY-1'].hillResidentsFreed, SA.leverStatic['link-AC-160-N3'].hillResidentsFreed), `two Panoramic roads: a floor of ${fr.value}, not a sum`);

const byCost = sortItems(east.find(g => g.id === 'engine').items, 'cost');
check(costLine(byCost[0].lever.cost) === 'Little capital cost' && byCost.every((it, i) => i === 0 || (it.lever.cost?.capital?.[0] ?? (/^Little/.test(it.lever.cost?.note || '') ? 0 : Infinity)) >= (byCost[i - 1].lever.cost?.capital?.[0] ?? (/^Little/.test(byCost[i - 1].lever.cost?.note || '') ? 0 : Infinity))), 'cost sort: cheapest first, unpriced last');

// One rule (GV10): a difference of 10 on about 9,900 (the Dwight Way road on engine reach) counts in a live tally too.
const live = G.tallyBySev([{ sev: 'central', a: 9926, b: 9916 }, { sev: 'central', a: 9926, b: 9926 + 1e-9 }]);
check(live.better === 1 && live.worse === 0, 'one noise rule: a 0.1% difference counts; floating-point rounding does not');

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
