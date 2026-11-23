// Guided view figures from the stored tables (js/guided-data.js; SOURCE_NOTES GV3–GV8). No simulation runs.
//   node tests/guided.mjs
// Checks: the change groups derived from data/model/mitigations.json on the east-wind fire match the list Eric
// approved on 2026-11-10; a change withheld under P19 (js/presets.js off) is withheld here; engine reach counts as
// "any fire" and people measures as "this fire"; result figures are medians of today's plan's 15 runs; one-change
// comparisons pair the same seeds; new roads that free the same areas give a floor, not a sum.
import fs from 'node:fs';
import { makeGuided, CARDS, median, sortItems, costLine, SEVS, backupRows, BACKUP_ROW_MIN } from '../js/guided-data.js';
import { PRESETS, LEVER_OFF } from '../js/presets.js';
import { plainLabel } from '../js/guided.js';

const R = new URL('..', import.meta.url).pathname;
const M = JSON.parse(fs.readFileSync(R + 'data/model/mitigations.json'));
const SA = JSON.parse(fs.readFileSync(R + 'data/model/spread-access.json'));
const G = makeGuided(M, SA, PRESETS, LEVER_OFF);
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };
const ids = (gs, id) => gs.find(g => g.id === id).items.map(i => i.lever.id).sort().join(',');
const set = xs => [...xs].sort().join(',');

const east = G.groups('eastWind');
check(ids(east, 'people') === set(['leaveEarly', 'leaveEarlyEFW', 'orderSooner']), `east wind, people: ${ids(east, 'people')}`);
check(ids(east, 'engine') === set(['parkingOneSide', 'redCurbFoot', 'widen-WP-001', 'link-AC-160-N3', 'retreat-footBlock', 'retreat-top100', 'retreat-panoramicUpper', 'widen-WP-007', 'link-CITY-1']), `east wind, engines: ${ids(east, 'engine')}`);
check(ids(east, 'cars') === set(['leaveEarly', 'leaveEarlyEFW', 'orderSooner']), `east wind, cars: ${ids(east, 'cars')}`);
check(ids(east, 'none') === set(['contraflow-officers', 'contraflow-signs', 'policeControl', 'egressGuidance', 'link-AC-193-N1']), `east wind, no consistent benefit: ${ids(east, 'none')}`);

// Leave on Extreme Fire Weather (SOURCE_NOTES GV20, GV23): the 10 Leave Early Zones lie in the hills, so on every fire its
// gain in people still there when embers arrived is at most the Red Flag lever's (half of all hill households).
for (const f of M.meta.fires) {
  const efw = G.tableCompare(f, 'leaveEarlyEFW', 'ember').gain, le = G.tableCompare(f, 'leaveEarly', 'ember').gain;
  check(efw != null && le != null && efw <= le, `${f}: leave on Extreme Fire Weather gains no more than leave early on a Red Flag day (${Math.round(efw)} vs ${Math.round(le)} people)`);
}

// Both leave-early changes are withheld on the earthquake fire: earthquakes come without warning (SOURCE_NOTES GV24).
{
  const q = G.groups('quake'), none = q.find(g => g.id === 'none');
  for (const id of ['leaveEarly', 'leaveEarlyEFW']) {
    const it = none.items.find(i => i.lever.id === id);
    check(!!it?.withheld && /^earthquakes come without warning/.test(it.withheld) && !q.filter(g => g.id !== 'none').some(g => g.items.some(i => i.lever.id === id)), `earthquake: ${id} withheld (GV24)`);
  }
}

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
// The earthquake changes the street network (js/guided-data.js NETWORK_FIRES; SOURCE_NOTES FF27): single ways out is not
// computed there, its engine changes are 'this fire', and it is left out of the any-fire test.
if (M.meta.fires.includes('quake')) {
  check(G.oneWay({ areas: [] }, 'quake').na && G.oneWay({ areas: [] }, 'eastWind').na === undefined, 'earthquake: single ways out not computed; wildfires unaffected');
  check(G.groups('quake').every(g => g.items.every(i => !i.anyFire)), 'earthquake: every gain is "this fire"');
  const sameAsEast = M.runs.filter(r => r.lever === 'baseline' && r.fire === 'quake').some(r => r.m.engine !== M.runs.find(x => x.lever === 'baseline' && x.fire === 'eastWind' && x.sev === r.sev && x.seed === r.seed).m.engine);
  check(sameAsEast, 'earthquake: engine reach differs from the wildfires (fault closures), so it is excluded from the any-fire test');
  check(SA.parkingByFire?.quake?.length === SA.meta.seeds.length, 'earthquake: its own engine reach under the alternative night parking rule (spread-access.json parkingByFire, Codex review of PR #87)');
}
// Home hardening and Zone 0 (SOURCE_NOTES PH32): in "Fewer buildings lost" on every fire where the front reaches the hill
// fire zones, and half the homes by whole blocks gains more than half the homes scattered (the same number of homes).
if (M.levers.some(l => l.id === 'hardenHalfBlocks' && l.ran)) {
  for (const f of M.meta.fires) {
    const it = id => G.groups(f).find(g => g.id === 'homes').items.find(i => i.lever.id === id);
    const base = G.baseFigure(f, 'homes').value;
    if (!(base > 0)) { check(!it('hardenAll'), `${f}: no buildings lost, so no hardening gain`); continue; }
    for (const k of ['harden', 'zone0']) check(it(`${k}HalfBlocks`) && it(`${k}HalfScattered`) && it(`${k}HalfBlocks`).gain > it(`${k}HalfScattered`).gain && it(`${k}All`).gain >= it(`${k}HalfBlocks`).gain,
      `${f} ${k}: whole blocks ${Math.round(it(`${k}HalfBlocks`)?.gain)} > scattered ${Math.round(it(`${k}HalfScattered`)?.gain)}, every home ${Math.round(it(`${k}All`)?.gain)}`);
    // loss only: the people and car measures do not move
    for (const id of ['hardenAll', 'zone0All']) for (const key of ['ember', 'frontPeople', 'cutOff', 'engine']) { const c = G.tableCompare(f, id, key); check(c.d.better === 0 && c.d.worse === 0, `${f} ${id}: ${key} unchanged in every run`); }
  }
}
// P19 cleanup (Eric, 2026-11-23): decide faster withdrawn on Panoramic Hill (4.96% against the 5% line, SOURCE_NOTES CD26).
check(!!G.groups('panoramic').find(g => g.id === 'none').items.find(i => i.lever.id === 'orderSooner')?.withheld, 'Panoramic Hill: decide faster withheld (P19, 4.96%)');
// The new fires of 2026-11-13 (SOURCE_NOTES FF24, FF27): decide faster withheld on the west-wind fire (P19).
if (M.meta.fires.includes('westWind')) check(!!G.groups('westWind').find(g => g.id === 'none').items.find(i => i.lever.id === 'orderSooner')?.withheld, 'west wind: decide faster withheld (P19)');

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

// Plain labels (GV12): a sensitive street's direction comes from its own runs by severity, or the label stays neutral.
const reach = lv => plainLabel({ label: 'sensitive', levels: lv }, 'reach').text;
check(reach({ low: [0, 5], central: [5, 5], high: [0, 5] }) === 'Depends on fire strength', 'reached at medium only: neutral wording (McMillian Rd, east wind)');
check(reach({ low: [0, 5], central: [2, 5], high: [5, 5] }) === 'Reached mostly when the fire is stronger' && reach({ low: [5, 5], central: [3, 5], high: [0, 5] }) === 'Reached mostly when the fire is weaker', 'rising or falling with severity: directional wording');

// The four-way split (GV13): in every run, each result's parts add up to the mitigation table's total for that run.
let worstSplit = 0, splitRuns = 0;
for (const r of SA.runs) {
  const m = M.runs.find(x => x.lever === 'baseline' && x.fire === r.fire && x.sev === r.sev && x.seed === r.seed)?.m; if (!m || !r.split) continue;
  worstSplit = Math.max(worstSplit, Math.abs(r.split.ember.reduce((a, b) => a + b, 0) - m.ember), Math.abs(r.split.front.reduce((a, b) => a + b, 0) - m.frontPeople));
  splitRuns++;
}
check(splitRuns === SA.runs.length && worstSplit <= 0.25, `split sums to the total in all ${splitRuns} runs (largest gap ${worstSplit.toFixed(2)} people, from rounding each part to 0.1)`);
const sp = G.splitFigure('ref1923', 'ember');
check(sp?.parts.length === 4 && sp.n === 15, `1923 fire, embers: ${sp.parts.map(p => `${p.short} ${Math.round(p.median)}`).join(', ')}`);

// Fire pace (Eric, 2026-11-23; SOURCE_NOTES GV21): every figure is the median of the 5 runs at the chosen pace, labels count
// those 5 runs only (no "sensitive" by severity), and the change groups are derived per pace from the same pairs.
for (const f of M.meta.fires) for (const sev of SEVS) {
  for (const c of CARDS.filter(c => c.key)) {
    const v = G.baseFigure(f, c.key, sev), rs = M.runs.filter(r => r.lever === 'baseline' && r.fire === f && r.sev === sev);
    if (!(v.n === 5 && v.value === median(rs.map(r => r.m[c.key])) && ['consistent', 'mixed'].includes(v.label.label))) check(false, `${f} ${sev} ${c.id}: ${v.value} (${v.n} runs, ${v.label.label}) against the table's median ${median(rs.map(r => r.m[c.key]))}`);
  }
  const sp = G.splitFigure(f, 'ember', sev);
  if (sp && sp.n !== 5) check(false, `${f} ${sev}: split over ${sp.n} runs`);
  for (const l of G.levers) for (const k of ['ember', 'frontPeople', 'engine', 'cutOff']) {
    const t = G.tableCompare(f, l.id, k, sev), P = M.runs.filter(r => r.lever === l.id && r.fire === f && r.sev === sev);
    const base = P.map(r => M.runs.find(x => x.lever === 'baseline' && x.fire === f && x.sev === sev && x.seed === r.seed).m[k]);
    if (t.n !== 5 || t.gain !== median(P.map((r, i) => base[i] - r.m[k])) || !['consistent', 'mixed', null].includes(t.d.label)) check(false, `${f} ${sev} ${l.id} ${k}: gain ${t.gain} over ${t.n} pairs (${t.d.label})`);
  }
}
check(true, 'every result figure, split and one-change gain at each pace is the median of that pace\'s 5 runs in the table, labeled over those 5 only');
// The verdict over all 15 pairs (no pace) still reproduces the stored summaries: groups without a pace are unchanged.
for (const f of M.meta.fires) check(JSON.stringify(G.groups(f).map(g => g.items.map(i => i.lever.id))) === JSON.stringify(G.groups(f, undefined).map(g => g.items.map(i => i.lever.id))), `${f}: groups over 15 runs unchanged`);
// Groups per pace: a change is in a group at a pace when all 5 of its pairs are better on the card's measure, or 4 with
// the fifth identical, and none worse (MASTER, 2026-11-23). Report which memberships change by pace (for SOURCE_NOTES GV21 and the PR).
const memb = (f, sev) => new Set(G.groups(f, sev).flatMap(g => g.items.map(i => `${g.id}:${i.lever.id}`)));
for (const f of M.meta.fires) {
  const by = Object.fromEntries(SEVS.map(s => [s, memb(f, s)])), all = new Set(SEVS.flatMap(s => [...by[s]]));
  const varies = [...all].filter(k => !SEVS.every(s => by[s].has(k)) && !k.startsWith('none:'));
  console.log(`     ${f}: ${varies.length ? varies.map(k => `${k} (${SEVS.filter(s => by[s].has(k)).map(s => ({ low: 'Slower', central: '1923', high: '1991' })[s]).join('/')})`).join('; ') : 'same groups at every pace'}`);
  for (const s of SEVS) for (const g of G.groups(f, s)) for (const it of g.items) if (g.id !== 'none') {
    const P = M.runs.filter(r => r.lever === it.lever.id && r.fire === f && r.sev === s), k = it.card.key;
    const b = P.filter(r => { const a = M.runs.find(x => x.lever === 'baseline' && x.fire === f && x.sev === s && x.seed === r.seed).m[k]; return r.m[k] < a && Math.abs(a - r.m[k]) > 1e-9 * Math.max(Math.abs(a), Math.abs(r.m[k])); }).length;
    const w = P.filter(r => { const a = M.runs.find(x => x.lever === 'baseline' && x.fire === f && x.sev === s && x.seed === r.seed).m[k]; return r.m[k] > a && Math.abs(a - r.m[k]) > 1e-9 * Math.max(Math.abs(a), Math.abs(r.m[k])); }).length;
    if (!(b >= 4 && w === 0)) check(false, `${f} ${s}: ${it.lever.id} in ${g.id} with ${b} better, ${w} worse of 5`);
  }
}
const eastC = G.groups('eastWind', 'central');
check(['people', 'engine', 'cars', 'none'].every(id => ids(eastC, id) === ids(east, id)), 'east wind at 1923 pace (the default): the groups Eric approved on 2026-11-10');
// The rule's edges: 4 better and 1 identical joins; 4 better and 1 worse does not (four Panoramic Hill engine changes are
// better in 4 of 5 seeds and identical in the fifth, so they stay in the engine group at every pace).
for (const sev of SEVS) check(['link-AC-160-N3', 'redCurbFoot', 'retreat-footBlock', 'widen-WP-001'].every(id => G.groups('eastWind', sev).find(g => g.id === 'engine').items.some(i => i.lever.id === id)), `east wind at ${sev}: the four engine changes better in 4 of 5 seeds, identical in the fifth, are in the engine group`);
for (const f of M.meta.fires) for (const sev of SEVS) for (const l of G.levers) for (const k of ['ember', 'frontPeople', 'cutOff']) {
  const t = G.tableCompare(f, l.id, k, sev).d, gr = G.groups(f, sev), card = CARDS.find(c => c.key === k), gid = { ember: 'people', frontPeople: 'people', cutOff: 'cars' }[k];
  if (t.better === 4 && t.worse === 1 && card && gr.find(g => g.id === gid).items.some(i => i.lever.id === l.id && i.card.key === k)) check(false, `${f} ${sev} ${l.id}: 4 better, 1 worse on ${k}, yet in ${gid}`);
}
check(true, 'no change with a worse run at a pace joins a group on that measure');
for (const f of M.meta.fires) for (const sev of SEVS) for (const g of G.groups(f, sev)) for (const it of g.items) for (const c of g.cards) {
  const t = G.tableCompare(f, it.lever.id, CARDS.find(x => x.id === c).key, sev).d;
  if (t.worse > 0) check(false, `${f} ${sev}: ${it.lever.id} in ${g.id} but worse on ${c} in ${t.worse} of ${t.n}`);
}
check(true, 'at each pace no group member is worse in any run on any of its group\'s results (egress guidance, 1923 fire, 1923 pace: out)');
check(!G.groups('ref1923', 'central').find(g => g.id === 'people').items.some(i => i.lever.id === 'egressGuidance'), '1923 fire at 1923 pace: egress guidance not in "people" (front better 4 of 5, embers worse 5 of 5)');
check(true, 'every per-pace group member is better in at least 4 of its 5 runs at that pace, the rest identical, never worse');
check(plainLabel(G.baseFigure('eastWind', 'ember', 'central').label, 'result').text !== 'Depends on fire strength', 'within one pace no result reads "Depends on fire strength"');

// Where traffic backed up (SOURCE_NOTES GV25): rows derive from spread-access.json backups; every segment is a hill street
// (Fire Zones 2–3), none in the flats or on I-80; a row's figure is the median of its runs' sums; labels follow the rule.
if (SA.backups) {
  const net = JSON.parse(fs.readFileSync(R + 'data/model/network.json'));
  let rowsN = 0;
  for (const f of M.meta.fires) for (const sev of SEVS) {
    const B = SA.backups[f][sev], rows = backupRows(SA, net, f, sev), at = new Map(B.edges.map((e, i) => [e, i]));
    if (!B.edges.every(e => net.edges[e].fireZone >= 2 && !/I-?80\b/i.test(net.edges[e].name || ''))) check(false, `${f} ${sev}: a backup segment outside Fire Zones 2–3`);
    for (const r of rows) {
      rowsN++;
      const vals = B.seeds.map((_, k) => r.edges.reduce((s, e) => s + B.pm[at.get(e)][k], 0));
      if (JSON.stringify(vals) !== JSON.stringify(r.vals) || r.median !== median(vals) || r.median < BACKUP_ROW_MIN || !r.edges.every(e => net.edges[e].name === r.name)) check(false, `${f} ${sev} ${r.street}: row does not follow the table`);
      if ((r.label === 'consistent') !== (r.top === B.seeds.length)) check(false, `${f} ${sev} ${r.street}: label ${r.label} with ${r.top} of ${B.seeds.length}`);
    }
    for (let i = 1; i < rows.length; i++) if (rows[i].median > rows[i - 1].median) check(false, `${f} ${sev}: rows out of order`);
  }
  check(rowsN > 0, `backup rows derive from spread-access.json (${rowsN} rows over ${M.meta.fires.length} fires × 3 paces), hill streets only, ranked by median, labels by the 5-of-5 rule`);
  const e19 = backupRows(SA, net, 'eastWind', 'central').slice(0, 3).map(r => r.street).sort().join(',');
  check(e19 === 'Arlington Av,Boynton Av,Vassar Av', `east wind at 1923 pace, top 3: ${e19}`);
}

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
