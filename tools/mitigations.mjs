#!/usr/bin/env node
// Mitigation synthesis, phase 1 (data only): every mitigation lever run against the same baseline on the
// same fires, severities and seeds, with costs copied from earlier outputs and a robustness count.
//
//   node tools/mitigations.mjs [--seeds 5] [--workers N] [--report-only] [--from-runs] [--fires a,b] [--levers a,b] [--merge] [--add-levers a,b] [--fuel landfire]
//        writes data/model/mitigations.json and docs/mitigations.md
//   --fuel landfire: every run (baseline and levers) on the opt-in LANDFIRE fuel grid (js/fire.js fireGridFor); writes
//        data/model/mitigations-landfire.json and docs/mitigations-landfire.md instead, for the default-fuel decision (SOURCE_NOTES PH13).
//   --merge (with --fires): run only the fires named and keep the saved runs of every other fire in
//        data/model/mitigations.json; the seeds and levers are the saved ones, and summaries are
//        recomputed from all runs (the saved fires' runs are copied unchanged).
//
// Baseline: DEFAULT_PLAN (js/sim.js), Time Study case S6 (fall night) for every fire, fires eastWind,
// ref1923, panoramic, northHills, quake and westWind (the last two added 2026-11-13), low/central/high severity × seeds 1–5. Each lever is one entry in LEVERS below:
// a plan delta (merged onto DEFAULT_PLAN) and/or a world delta, applied the way existing code applies it:
//   plan     Simple-view Plan B deltas, read from js/presets.js (so they stay in step with the presets)
//   edges    run-time edge copies from tools/widening-core.mjs (noParkingEdge, widenedEdge), as tools/widening-sim.mjs
//   links    candidate links inserted at run time by tools/egress-link.mjs (withLinks), as tools/egress-sim.mjs
//   retreat  world.retreat in js/sim.js (bought-out street segments), as tools/retreat-sim.mjs
// Adding a lever is one more entry. data/model/network.json and js/ are never changed.
//
// Like for like: every lever run is checked against the baseline run of the same fire, severity and seed
// before it steps (the rules of tests/plan-draws.mjs and tests/retreat-draws.mjs): same households on the
// same streets with the same vehicles; every household that neither leaves early nor is bought out has the
// same kind, commuter, mobilization delay and ride; the same non-resident counts. A "control" lever (no
// change) reruns the baseline at central severity and must match it exactly.
//
// Educational comparison, not a prediction. "People still there when embers arrived" is not a casualty count.

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
const FUEL = arg('--fuel', process.env.MITIGATIONS_FUEL || 'proxy');
if (!['proxy', 'landfire'].includes(FUEL)) throw new Error('--fuel proxy|landfire');
process.env.MITIGATIONS_FUEL = FUEL; // workers inherit it
const SUFFIX = FUEL === 'landfire' ? '-landfire' : '';
const OUT = path.join(R, `data/model/mitigations${SUFFIX}.json`), DOC = path.join(R, `docs/mitigations${SUFFIX}.md`);

const FIRES = ['eastWind', 'ref1923', 'panoramic', 'northHills', 'quake', 'westWind']; // quake and westWind added 2026-11-13 (SOURCE_NOTES FF24, FF27)
const SEVS = ['low', 'central', 'high'];
const TOD = 'S6';

// ---------- measures (all from Evacuation.summary(), js/sim.js) ----------
const MEASURES = {
  ember: { label: 'People still there when embers arrived', get: S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, unit: 'people',
    def: 'synthetic people at home (with or without a car, ordered or not) when embers reached their street, or on the road in a car under embers after leaving; each person counted once (SOURCE_NOTES FO8; the Simple-view headline, js/presets.js)' },
  front: { label: 'People still home when the fire front arrived', get: S => S.fireFrontHome, unit: 'people',
    def: 'synthetic people still at home when the fire front reached their street (summary().fireFrontHome); early leavers and bought-out households never count' },
  cutOff: { label: 'Cars cut off by fire', get: S => S.vehiclesNoRoute, unit: 'vehicles',
    def: 'vehicles on the road at the end of the run with no route to safety (summary().vehiclesNoRoute; the results panel\'s "vehicles cut off by fire")' },
  engine: { label: 'Hill residents an engine cannot reach within 5 minutes', get: S => S.engineReachBeyond5People, unit: 'people',
    def: 'synthetic Berkeley Fire Zones 2–3 residents whose street no engine reaches from a station within the City\'s 5-minute standard, at ignition, under the run\'s parked cars (summary().engineReachBeyond5People); the same on every fire for a seed' },
  noRoute: { label: 'Hill residents with no engine route', get: S => S.engineReachUnreachablePeople, unit: 'people',
    def: 'synthetic Berkeley Fire Zones 2–3 residents whose street no engine route reaches at all from a Berkeley station, at ignition, under the run\'s parked cars and fixed barriers (summary().engineReachUnreachablePeople); added 2026-11-06 for the spread-and-access explorer\'s paired comparisons (SOURCE_NOTES SA1–SA12)' },
  homes: { label: 'Structures lost in Fire Zones 2–3 (central)', get: S => S.structuresLostCentral ?? null, unit: 'structures',
    def: 'City footprints in Fire Zones 2–3 the fire front reached, each lost with a probability by its gap to the nearest one, cut by any home hardening or Zone 0 (summary().structuresLostCentral; js/structures.js; the midpoints of the assumption ranges and the central cut, SOURCE_NOTES PH23, PH32); the fire does not respond to structures. Added 2026-11-13; for runs saved before then it is copied from the same fire, severity and seed\'s baseline, since no earlier lever sets hardening or Zone 0' },
  clear90: { label: '90% clearance, model minutes (not a forecast)', get: S => S.clearP90, unit: 'minutes', time: true,
    def: 'minutes from the first order until 90% of vehicles starting in Order zones have left the order area (summary().clearP90, the Time Study\'s ETE); null if never reached in the run, which counts as slower than any finished run' },
};
const MKEYS = Object.keys(MEASURES);

// ---------- levers ----------
// Plan B deltas from the Simple-view presets: the keys where Plan B differs from DEFAULT_PLAN.
const { DEFAULT_PLAN } = await import(R + '/js/sim.js');
const { PRESETS } = await import(R + '/js/presets.js');
const presetDelta = id => { const B = PRESETS.find(p => p.id === id).B; return Object.fromEntries(Object.entries(B).filter(([k, v]) => k !== 'name' && DEFAULT_PLAN[k] !== v)); };
const usd = (lo, hi) => [lo, hi];

// Each entry: id, group, title, what (one line), how (the existing code it reuses), and one of
//   plan: {...}            plan delta
//   edges: { variant, pinch | edges }   'noParking' | 'widen' on segments (tools/widening-core.mjs)
//   link: candidate id     data/model/egress-candidates.json, inserted by tools/egress-link.mjs
//   retreat: case id       data/model/retreat.json (cases[].removed, or engineFoot.edges for footBlock)
// plus cost (resolved below), cannotMeasure, and pending / notComparable for levers not run.
const LEVERS = [
  { id: 'control', group: 'check', title: 'Control: baseline rerun, no change', what: 'DEFAULT_PLAN again; must match the baseline exactly', plan: {}, centralOnly: true },
  { id: 'leaveEarly', group: 'timing', title: 'Leave early on a Red Flag day', what: 'half of hill households (Fire Zones 2–3) leave on the Red Flag warning, before any fire starts',
    how: 'js/presets.js leaveEarly Plan B delta', plan: presetDelta('leaveEarly'),
    costNote: 'Little capital cost: a warning and outreach the City already runs. The real costs are households\' time away from home on every Red Flag day, unpriced.',
    cannotMeasure: 'Whether half of hill households would actually leave on a real Red Flag day, and whether they keep doing it after Red Flag days with no fire (warning fatigue). The simulator places the early leavers out of the area before ignition.' },
  { id: 'orderSooner', group: 'timing', title: 'Decide faster', what: 'first evacuation order 5 minutes after the fire starts instead of 10, as in today\'s plan',
    how: 'js/presets.js orderSooner Plan B delta (the preset compares 20 → 5 min; here the baseline is DEFAULT_PLAN\'s 10)', plan: presetDelta('orderSooner'),
    costNote: 'Little capital cost: staffing and authority to issue an order on first report. Orders that turn out to be unnecessary have a social cost, unpriced.',
    cannotMeasure: 'Whether a fire can be confirmed and an order issued 5 minutes after ignition, and the cost of orders for fires that would have been caught. How fast alerts reach people is not modeled separately.' },
  { id: 'parkingOneSide', group: 'parking', title: 'One-side parking on narrow hill streets', what: 'parking on one side only in Fire Zones 2–3',
    how: 'js/presets.js parkingEngines Plan B delta', plan: presetDelta('parkingEngines'),
    costNote: 'Little capital cost (signs and paint), plus enforcement and lost parking for hill residents; not priced in this project.',
    cannotMeasure: 'Enforcement on every hill street, night after night, and where the displaced cars go (driveways, other streets). Engines only drive in this simulator, so better engine access does not change the fire or who is still there.' },
  { id: 'redCurbFoot', group: 'parking', title: 'Red curb on the lowest block of Panoramic Way', what: 'no parking on the 49 m lowest block of Panoramic Way only',
    how: 'tools/widening-core.mjs noParkingEdge on widening pinch WP-001 (edge 992, retreat.json engineFoot)', edges: { variant: 'noParking', pinch: 'WP-001' },
    cannotMeasure: 'Enforcement, and where the 7 cars that park there today go instead (probably farther up the same street). Engine access is its only effect here; engines do not fight the fire in this simulator.' },
  { id: 'link-CITY-1', group: 'link', title: 'New link: City concept, Dwight Way to Dwight Place', what: 'the City\'s "2nd Route Out" concept for Panoramic Hill', how: 'tools/egress-link.mjs withLinks, candidate CITY-1', link: 'CITY-1' },
  { id: 'link-AC-160-N3', group: 'link', title: 'New link: upper Panoramic Way to Smyth Ln', what: 'a new 88 m road from the top of Panoramic Way to Smyth Ln, the best-ranked new connection in the egress analysis', how: 'tools/egress-link.mjs withLinks, candidate AC-160-N3', link: 'AC-160-N3' },
  { id: 'link-AC-193-N1', group: 'link', title: 'New link: Buena Vista Way to W Parnassus Ct', what: 'a new road between Buena Vista Way and W Parnassus Ct, the one connection outside Panoramic Hill that reduced cars cut off in its own area in the egress analysis', how: 'tools/egress-link.mjs withLinks, candidate AC-193-N1', link: 'AC-193-N1' },
  { id: 'widen-WP-001', group: 'widen', title: 'Widen the lowest block of Panoramic Way to 20 ft clear', what: 'the 49 m lowest block widened to 20 ft clear between parked cars (the fire-code width), parking kept where it is today',
    how: 'tools/widening-core.mjs widenedEdge (standards().fireCode), as tools/widening-sim.mjs "widen"', edges: { variant: 'widen', pinch: 'WP-001' } },
  { id: 'widen-WP-007', group: 'widen', title: 'Widen Oak Ridge Rd pinch to 20 ft clear', what: 'the narrowest stretch of Oak Ridge Rd widened to 20 ft clear between parked cars (the fire-code width), parking kept where it is today',
    how: 'tools/widening-core.mjs widenedEdge (standards().fireCode), as tools/widening-sim.mjs "widen"', edges: { variant: 'widen', pinch: 'WP-007' } },
  { id: 'retreat-footBlock', group: 'retreat', title: 'Buy out the lowest block of Panoramic Way, curb cleared', what: 'the households on the lowest block of Panoramic Way bought out, and its parked cars gone',
    how: 'world.retreat { edges: retreat.json engineFoot.edges, clearParking: true }, the engine-reach sensitivity of tools/retreat-sim.mjs', retreat: 'footBlock', clearParking: true },
  { id: 'retreat-top100', group: 'retreat', title: 'Buy out the top-ranked blocks, about 90 households', what: 'voluntary buyouts of the hill blocks ranked most exposed and hardest to leave, about 90 households (managed-retreat analysis; about 130 under the citywide household mix it was chosen on)', how: 'world.retreat { edges: retreat.json cases top100 .removed }, as tools/retreat-sim.mjs fire runs', retreat: 'top100' },
  { id: 'retreat-panoramicUpper', group: 'retreat', title: 'Buy out Panoramic Hill\'s upper streets', what: 'voluntary buyouts of every household on Panoramic Hill\'s streets above the second narrow point of Panoramic Way', how: 'world.retreat { edges: retreat.json cases panoramicUpper .removed }, as tools/retreat-sim.mjs fire runs', retreat: 'panoramicUpper' },
  // Not run here.
  { id: 'r0', group: 'notComparable', title: 'R0: no added units in hill areas', notComparable: 'R0 acts only under a future-growth scenario; on today\'s population (no growth) it changes nothing, so it is not comparable with these levers. Its results are in SOURCE_NOTES R1–R8 (with maximum growth, R0 lowers people still there when embers arrived in all 30 pairs).' },
  { id: 'contraflow-officers', group: 'operations', title: 'Contraflow on the main hill exit streets, officer-staffed', what: 'both lanes outbound on the main hill exit streets wide enough between parked cars, started by officers at every entry point (default pool and arrival delay)',
    how: 'plan { contraflow: main, contraflowMode: officers } (js/operations.js, SOURCE_NOTES CF1–CF16)', plan: { contraflow: 'main', contraflowMode: 'officers' },
    costNote: 'Little capital cost; the cost is officers taken from other work (the shared pool), unpriced.',
    cannotMeasure: 'Whether officers can reach and hold every entry point while the fire moves, drivers who ignore the closure, and the engines that can no longer drive up these streets beyond what engine reach shows.' },
  { id: 'contraflow-signs', group: 'operations', title: 'Contraflow on the main hill exit streets, pre-installed signs (battery backup)', what: 'the same streets, started by rehearsed electronic signs and gates with battery backup',
    how: 'plan { contraflow: main, contraflowMode: signs, contraflowPower: battery } (js/operations.js)', plan: { contraflow: 'main', contraflowMode: 'signs', contraflowPower: 'battery' },
    costNote: 'Signs at every entry point; the run logs the count and a range per run (1923 fire, central, seed 1: 75 locations, about $1.1M–$4.3M; gates not costed). Not copied into this table because the count depends on the run.',
    cannotMeasure: 'Whether drivers obey a sign without an officer, signs damaged by the fire itself, and rehearsal: the simulator assumes everyone follows the reversed lanes once they start.' },
  { id: 'policeControl', group: 'operations', title: 'Police control of the pre-timed signals', what: 'officers take over the City\'s 44 pre-timed signals on evacuation routes after their arrival delay (default pool)',
    how: 'plan { police: pretimed } (js/operations.js, SOURCE_NOTES CF7, CF8, CF16)', plan: { police: 'pretimed' },
    costNote: 'Little capital cost; officers taken from other work, unpriced.',
    cannotMeasure: 'How officers actually direct traffic (the simulator gives a fixed capacity gain and outbound priority), radio coordination, and officers lost to other emergencies.' },
  { id: 'powerShutoff', group: 'notComparable', title: 'Power shutoff', notComparable: 'A hazard condition (scenario setting), not a mitigation: signals go dark and run as all-way stops. Its effect on the baseline and on contraflow is in SOURCE_NOTES CF14' },
  { id: 'egressGuidance', group: 'operations', title: 'Constrained egress guidance (hypothetical pilot), all drivers follow', what: 'drivers get a route only if it is no riskier than their own and at most a minute slower, or safer; nobody is told to wait',
    how: 'plan { routing: guided, compliance: 1 } (js/guidance.js, SOURCE_NOTES DG1–DG30)', plan: { routing: 'guided', compliance: 1 },
    costNote: 'Little capital cost in this table; a real system (data feeds, phones, liability) is unpriced.',
    cannotMeasure: 'Today\'s plan already gives every driver an idealized, well-informed route, so guidance has little to add here; against drivers who follow habit it does better in every run (SOURCE_NOTES DG30). Phone networks failing, distrust, and the households a real system would leave worse off are not shown here.' },
  // Home hardening and Zone 0 (added 2026-11-13; SOURCE_NOTES PH29–PH32): loss probability only (js/structures.js).
  ...[['harden', 'Harden homes', 'hardening (ember-resistant vents, roofs, decks and siding)', 'hardenShare', 'hardenMode'], ['zone0', 'Zone 0 around homes', 'a Zone 0: nothing that burns within 5 ft of the building', 'zone0Share', 'zone0Mode']]
    .flatMap(([k, title, what, sk, mk]) => [['HalfScattered', 0.5, 'scattered', 'half the homes, scattered'], ['HalfBlocks', 0.5, 'blocks', 'half the homes, by whole blocks'], ['All', 1, 'blocks', 'every home']]
      .map(([suf, share, mode, who]) => ({ id: `${k}${suf}`, group: 'structures', title: `${title}: ${who}`, what: `${who} in Fire Zones 2–3 have ${what}`,
        how: `plan keys ${sk} ${share}, ${mk} '${mode}' (js/structures.js)`, plan: { [sk]: share, [mk]: mode }, share, mitigation: k,
        cannotMeasure: 'Whether owners would do it and keep it up. The fire in this simulator does not spread from building to building and does not respond to hardening or Zone 0, so these change only the share of reached structures lost, not the fire, its embers, the orders or the traffic. Structures reached only by embers get no loss figure; ember ignition of the first house is what hardening and Zone 0 most prevent (NIST TN 2205 p. 28). Effects are assumption ranges (SOURCE_NOTES PH32).' }))),
];
const CANNOT = {
  link: 'Environmental review, slope and land acquisition, and whether the link is itself in the fire\'s path on the day. Costs exclude engineering, environmental review and legal costs (egress-candidates.json meta.cost.note).',
  widen: 'Takings, retaining walls and construction on a steep street, and whether residents would park on the new pavement (the run posts parking to today\'s sides). Engines do not fight the fire in this simulator.',
  retreat: 'Willingness to sell, the loss of homes and community, where displaced households go, and what happens to the vacated land. Removed households simply make no trip, so part of any drop is the bought-out people no longer being counted.',
};

// ---------- small helpers ----------
const median = a => { const s = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const medianTime = a => { const s = a.map(x => x == null || !Number.isFinite(x) ? Infinity : x).sort((x, y) => x - y); if (!s.length) return null; const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return Number.isFinite(m) ? m : null; };
// Lower is better; a missing clearance time is worst. Differences within floating-point noise
// (relative 1e-9; e.g. 981.18 against 981.1799999999967 from household counts × persons per
// household) count as equal; a 5-second clearance change (about 1e-3 relative) does not.
const cmp = (a, b) => { const A_ = a ?? Infinity, B_ = b ?? Infinity; if (A_ === B_) return 0; if (Number.isFinite(A_) && Number.isFinite(B_) && Math.abs(A_ - B_) <= 1e-9 * Math.max(1, Math.abs(A_), Math.abs(B_))) return 0; return A_ < B_ ? -1 : 1; };
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

// ---------- worker ----------
if (argv[0] === '--worker') {
  const { jobs, levers } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const { loadData, prepare } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire, fireGridFor } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation } = await import(R + '/js/sim.js');
  const { withLinks, demSampler } = await import(R + '/tools/egress-link.mjs');
  const { widenedEdge, noParkingEdge, applyEdges, standards, nominalSides } = await import(R + '/tools/widening-core.mjs');
  const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const base = await loadData(load), grid = FUEL === 'landfire' ? fireGridFor(buildFireGrid(base), base, 'landfire') : buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
  const elev = demSampler(base.dem, base.Z);
  const fireMemo = new Map(), dataMemo = new Map(), snaps = new Map();
  const fireFor = (f, sev, seed) => { const k = `${f}|${sev}|${seed}`; if (!fireMemo.has(k)) { if (fireMemo.size > 8) fireMemo.delete(fireMemo.keys().next().value); fireMemo.set(k, runFire(grid, scen[f], SEVERITY[sev], seed)); } return fireMemo.get(k); };
  // A network with the lever's link (tools/egress-sim.mjs dataFor, asIs variant)
  const dataFor = L => {
    if (!L.link) return base;
    if (!dataMemo.has(L.id)) { const c = L.link; const spec = c.open ? { open: c.open, links: [] } : { open: [], links: [{ id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone }] };
      const net = withLinks(base.net, base.A, elev, spec); dataMemo.set(L.id, prepare({ ...base, net })); } // every optional table, as js/levers.js dataFor (the household mix needs data.demand)
    return dataMemo.get(L.id);
  };
  // Edge copies (tools/widening-sim.mjs variantEdges)
  const edgeCopies = L => { const out = {}; for (const id of L.edges.edges) { const e = base.net.edges[id];
    if (L.edges.variant === 'widen') { const s = nominalSides(base.A, e); out[id] = widenedEdge(base.A, e, Math.max(e.widthM, standards(base.A, s).fireCode), s); }
    else out[id] = noParkingEdge(base.A, e); } return out; };
  const build = (L, j) => { const data = dataFor(L), sc = scen[j.fire];
    const world = L.retreat ? { retreat: { edges: L.retreat.edges, ...(L.clearParking ? { clearParking: true } : {}) } } : {};
    return new Evacuation(data, grid, fireFor(j.fire, j.sev, j.seed), sc, j.sev, { ...DEFAULT_PLAN, ...(L.plan || {}) }, j.seed, TIME_OF_DAY[TOD], world); };
  // Draws snapshot of a run before it steps (tests/plan-draws.mjs, tests/retreat-draws.mjs)
  const notice = (sim, h) => { const z = sim.hh.zone[h], k = sim.hh.kind[h]; return k === 1 ? sim.orderT[z] : k === 2 ? sim.warnT[z] : sim.firstOrderT; };
  const snap = sim => { const H = sim.hh, mob = new Float64Array(H.n); for (let h = 0; h < H.n; h++) mob[h] = H.depart[h] - notice(sim, h);
    return { n: H.n, edge: H.edge.slice(), veh: H.veh.slice(), kind: H.kind.slice(), commuter: H.commuter.slice(), early: H.early.slice(), gone: H.gone.slice(), ride: H.ride.slice(), mob, nonResident: { ...sim.nonResident }, zoneOrdered: Uint8Array.from(H.zone, z => sim.orderT[z] < Infinity ? 1 : 0) }; };
  const sameT = (x, y) => (!Number.isFinite(x) && !Number.isFinite(y) && x === y) || Math.abs(x - y) <= 1e-6;
  function compare(a, b) { // a: baseline snapshot, b: lever snapshot; returns a list of problems (empty = like for like)
    const bad = []; let compared = 0, gone = 0;
    if (a.n !== b.n) return [`household count ${a.n} vs ${b.n}`];
    for (let h = 0; h < a.n && bad.length < 3; h++) {
      if (a.edge[h] !== b.edge[h] || a.veh[h] !== b.veh[h]) { bad.push(`hh ${h}: street or vehicles differ`); continue; }
      if (b.gone[h]) { gone++; continue; }
      if (a.early[h] || b.early[h]) continue;
      compared++;
      // a warning before another city's order (js/sim.js otherCityOrders): heeded, it is kind 2 in the
      // plan whose warning comes first and kind 1 in the other; same draws (tests/plan-draws.mjs)
      const warnedFirst = (s, i) => s.kind[i] === 2 && s.zoneOrdered[i];
      if (a.kind[h] !== b.kind[h] && !(a.kind[h] + b.kind[h] === 3 && (warnedFirst(a, h) || warnedFirst(b, h)))) { bad.push(`hh ${h}: kind ${a.kind[h]} vs ${b.kind[h]}`); continue; }
      if (!a.kind[h]) continue;
      if (a.commuter[h] !== b.commuter[h]) bad.push(`hh ${h}: commuter`);
      if (!sameT(a.mob[h], b.mob[h])) bad.push(`hh ${h}: mobilization ${a.mob[h]} vs ${b.mob[h]}`);
      const ra = a.ride[h], rb = b.ride[h];
      if (ra !== rb && !((ra >= 0 && (b.early[ra] || b.gone[ra])) || (rb >= 0 && a.early[rb]))) bad.push(`hh ${h}: ride ${ra} vs ${rb}`);
    }
    for (const g of new Set([...Object.keys(a.nonResident), ...Object.keys(b.nonResident)])) if (a.nonResident[g] !== b.nonResident[g]) bad.push(`non-resident ${g}: ${a.nonResident[g]} vs ${b.nonResident[g]}`);
    return { bad, compared, gone };
  }
  const L0 = { id: 'baseline', plan: {} };
  const out = [];
  for (const j of jobs) {
    const L = j.lever === 'baseline' ? L0 : levers[j.lever];
    const key = `${j.fire}|${j.sev}|${j.seed}`;
    const undo = L.edges ? applyEdges(base, edgeCopies(L)) : () => {};
    try {
      const sim = build(L, j);
      const s = snap(sim);
      let check = null;
      if (j.lever === 'baseline') snaps.set(key, s);
      else {
        if (!snaps.has(key)) { undo(); try { snaps.set(key, snap(build(L0, j))); } finally { if (L.edges) applyEdges(base, edgeCopies(L)); } }
        const c = compare(snaps.get(key), s); check = Array.isArray(c) ? { ok: false, problems: c } : { ok: !c.bad.length, problems: c.bad, compared: c.compared, gone: c.gone };
      }
      const t0 = Date.now();
      const S = sim.runToEnd();
      const m = Object.fromEntries(MKEYS.map(k => { const v = MEASURES[k].get(S); return [k, v == null ? null : v]; }));
      m.frontPeople = S.fireFrontHome + S.fireFrontRoad; // full precision: pairs are compared unrounded; rounding is for display only
      out.push({ lever: j.lever, fire: j.fire, sev: j.sev, seed: j.seed, m, check, retreatHouseholds: sim.retreat.households, sec: Math.round((Date.now() - t0) / 1000) });
    } finally { undo(); }
  }
  fs.writeFileSync(argv[2], JSON.stringify(out));
  process.exit(0);
}

// ---------- main: resolve levers from the existing outputs ----------
const readJ = p => JSON.parse(fs.readFileSync(path.join(R, p), 'utf8'));
function resolveLevers() {
  const EC = readJ('data/model/egress-candidates.json'), ES = readJ('data/model/egress-sim.json');
  const W = readJ('data/model/widening.json'), WS = readJ('data/model/widening-sim.json');
  const RT = readJ('data/model/retreat.json'), NET = readJ('data/model/network.json');
  const out = [];
  for (const L0 of LEVERS) {
    const L = { ...L0, cost: null, stopped: null };
    if (!L.cannotMeasure && CANNOT[L.group]) L.cannotMeasure = CANNOT[L.group];
    try {
      if (L.group === 'structures') {
        const n = Math.round(readJ('data/model/structures.json').meta.totals.structures * L.share);
        L.cost = L.mitigation === 'harden'
          ? { capital: [n * 10000, n * 40000], unpriced: false, structures: n, source: 'Headwaters Economics, Retrofitting a Home for Wildfire Resistance, 2024: ember-focused retrofits $10,000–$15,000 (p. 4), complete retrofit for adequate resistance $23,000–$40,000 (p. 13), for a 2,000 sq ft California home; SOURCE_NOTES PH31',
            note: `Screening range: $10,000–$40,000 per structure × ${n.toLocaleString()} City footprints in Fire Zones 2–3 (some are outbuildings, so this reads high). Not an estimate for Berkeley homes.` }
          : { capital: null, unpriced: true, structures: n, source: null, note: 'Not priced: no public per-home cost for Zone 0 was found. The City\'s 2025 financing draft floats "up to $2500?" per homeowner as a grant, not a cost (SOURCE_NOTES PH31).' };
      }
      if (L.group === 'timing' || L.group === 'operations' || L.group === 'parking' && L.plan) L.cost = { capital: null, unpriced: true, note: L.costNote, source: null };
      if (L.edges) {
        const p = W.pinches.find(x => x.id === L.edges.pinch); if (!p) throw new Error(`pinch ${L.edges.pinch} not in widening.json`);
        if (JSON.stringify(WS.pinchEdges?.[p.id]) !== JSON.stringify(p.edges)) throw new Error(`pinch ${p.id} edges differ between widening.json and widening-sim.json`);
        L.edges = { ...L.edges, edges: p.edges, street: p.street };
        if (L.edges.variant === 'noParking') {
          if (L.id === 'redCurbFoot' && JSON.stringify(RT.engineFoot.edges) !== JSON.stringify(p.edges)) throw new Error('WP-001 is not retreat.json engineFoot\'s block');
          L.cost = { capital: p.parkingOnly?.cost ?? null, unpriced: false, stallsLost: p.parkingOnly?.stallsLost ?? null, source: `data/model/widening.json pinches ${p.id} parkingOnly.cost`,
            note: `Paint and signs for ${p.parkingOnly?.curbLengthM ?? '?'} m of curb at $1–$4 per foot (assumption, unsourced; SOURCE_NOTES WD5); ${p.parkingOnly?.stallsLost ?? '?'} parking spaces lost.` };
        } else {
          const fc = p.widening?.fireCode;
          const lt = fc?.leastTaking?.cost?.total ?? null, sy = fc?.symmetric?.cost?.total ?? null;
          const all = [lt, sy].filter(Boolean);
          L.cost = { capital: all.length ? [Math.min(...all.map(x => x[0])), Math.max(...all.map(x => x[1]))] : null, unpriced: !all.length, leastTaking: lt, symmetric: sy,
            parcelsToAcquire: { leastTaking: fc?.leastTaking?.parcelsToAcquire ?? null, symmetric: fc?.symmetric?.parcelsToAcquire ?? null },
            buildingsInNewPavement: { leastTaking: fc?.leastTaking?.buildingsInNewPavement ?? null, symmetric: fc?.symmetric?.buildingsInNewPavement ?? null },
            source: `data/model/widening.json pinches ${p.id} widening.fireCode (leastTaking and symmetric layouts)`, note: 'Screening range: construction and acquisition, low end of the least-taking layout to high end of the symmetric layout; not engineering or appraisal.' };
        }
      }
      if (L.link) {
        const c = EC.candidates.find(x => x.id === L.link); if (!c) throw new Error(`candidate ${L.link} not in egress-candidates.json`);
        if (JSON.stringify(ES.links?.[c.id]) !== JSON.stringify({ a: c.a, b: c.b, open: c.open || null })) throw new Error(`candidate ${c.id} endpoints differ from egress-sim.json`);
        const nN = NET.nodes.length; if (!(c.a < nN && c.b < nN)) throw new Error(`candidate ${c.id} nodes not in network.json`);
        L.link = { id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone, open: c.open || null, lengthM: c.lengthM, street: `${c.endpoints?.[0]?.street ?? ''} → ${c.toStreet ?? ''}` };
        L.cost = { capital: c.cost?.total ?? null, unpriced: !c.cost?.total, buildingsRemoved: c.cost?.buildingsRemoved ?? null, peopleDisplaced: c.cost?.peopleDisplaced ?? null, parcelsToAcquire: c.cost?.parcelsToAcquire ?? null,
          source: `data/model/egress-candidates.json candidates ${c.id} cost.total`, note: 'Screening range: construction (FDOT flat-terrain figure to 3× for hillside) and acquisition; excludes relocation, engineering, environmental review and legal costs.' };
      }
      if (L.retreat) {
        const id = L.retreat;
        const edges = id === 'footBlock' ? RT.engineFoot?.edges : RT.cases.find(c => c.id === id)?.removed;
        if (!edges?.length) throw new Error(`retreat case ${id} not in retreat.json`);
        for (const e of edges) if (!NET.edges[e]?.evacZone) throw new Error(`retreat case ${id}: edge ${e} has no evacuation zone in network.json`);
        if (id === 'footBlock' && !/PANORAMIC/i.test(NET.edges[edges[0]].name)) throw new Error('footBlock edge is not on Panoramic Way');
        const k = RT.costs?.[id];
        L.retreat = { id, edges };
        L.cost = { capital: k?.total ?? null, unpriced: !k?.total, households: k?.households ?? null, residents: k?.residents ?? null,
          source: `data/model/retreat.json costs.${id}.total`, note: 'Screening range: acquisition at block-group median home values, relocation under the URA, demolition; not an appraisal or a buyout proposal.' };
      }
    } catch (e) { L.stopped = e.message; }
    out.push(L);
  }
  return out;
}

// ---------- report ----------
const fmtN = (v, unit) => v == null ? (unit === 'minutes' ? 'not reached' : '—') : unit === 'minutes' ? `${Math.round(v)}` : Math.round(v).toLocaleString('en-US');
const fmtD = (v, unit) => { if (v == null) return '—'; const a = Math.round(Math.abs(v)); return `${a === 0 ? '±' : v > 0 ? '+' : '−'}${a.toLocaleString('en-US')}`; };
const money = v => v == null ? null : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v < 1e7 ? 2 : 0)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${v}`;
const costText = c => !c ? 'not priced' : c.capital ? `${money(c.capital[0])}–${money(c.capital[1])}` : c.unpriced && /^Little capital/.test(c.note || '') ? 'little capital cost; not priced' : 'not priced in this table (see notes)';

function writeReport(D) {
  const L = [];
  const p = s => L.push(s);
  const n = D.meta.seeds.length * D.meta.severities.length;
  const LF = (D.meta.fuel || 'proxy') === 'landfire';
  p(LF ? '# Mitigation levers on one baseline, with the opt-in LANDFIRE fuel (test for the default-fuel decision)' : '# Mitigation levers on one baseline (phase 1, data only)');
  p('');
  p(`Generated by \`node tools/mitigations.mjs\` on ${D.meta.built}; data in \`data/model/mitigations${LF ? '-landfire' : ''}.json\`.${LF ? ' Every run, baseline and levers, uses the LANDFIRE FBFM40 fuel setting (js/fire.js fireGridFor) instead of the fire-zone proxy. This is a test, not what the simulator shows: the default fuel stays the proxy (Eric, 2026-11-04; SOURCE_NOTES PH13, PH28), and the comparison with the default run is in PH28.' : ''} Educational comparison on synthetic households and illustrative fires, not a prediction and not an official evacuation plan. "People still there when embers arrived" counts synthetic people at that moment; it is not a casualty count. Costs are screening ranges copied from earlier outputs, not estimates of a project.`);
  p('');
  p('## Findings');
  p('');
  const ranLevers = D.levers.filter(l => l.ran && l.group !== 'check');
  for (const fire of D.meta.fires) {
    const parts = ranLevers.map(lv => { const s = D.summaries.find(x => x.lever === lv.id && x.fire === fire); const h = s ? MKEYS.filter(k => s.measures[k].holds) : []; return h.length ? `${lv.title} (${h.map(k => MEASURES[k].label.toLowerCase()).join('; ')})` : null; }).filter(Boolean);
    p(`- **${fire}:** holds in every pair: ${parts.length ? parts.join(', ') : 'none'}.`);
  }
  // The paragraphs below are prose written for the full experiment of 2026-11-02 (UTC) (every lever,
  // all four fires, 15 pairs). They are omitted for any narrower run (--seeds, --fires, --levers);
  // the per-fire "holds" lines above are always computed from this run's summaries.
  const PROSE_LEVERS = 'leaveEarly orderSooner parkingOneSide redCurbFoot link-CITY-1 link-AC-160-N3 link-AC-193-N1 widen-WP-001 widen-WP-007 retreat-footBlock retreat-top100 retreat-panoramicUpper contraflow-officers contraflow-signs policeControl egressGuidance';
  const full = !LF && n === 15 && FIRES.every(f => D.meta.fires.includes(f)) && PROSE_LEVERS.split(' ').every(id => ranLevers.some(l => l.id === id)); // later levers (hardening, Zone 0) get their own paragraph
  if (full) {
  p(`- (Prose written for the full run of 2026-11-02 with 16 levers, extended the same day to the north-hills fire and checked against the rerun with the east-wind fire from 60°, SOURCE_NOTES P32, the reruns with other cities' orders at 2 km and 1 km, FO1 and FO6, the rerun with each person counted once, FO8, rewritten for the rerun under the night parking rule of 2026-11-05, NP9, and for the rerun after evacuees drive on to the model exits, 2026-11-06, CD17 and CD20; check it against the tables after any rerun.) Only the timing levers (leave early, decide faster) and buyouts on the Panoramic Hill fire hold on the counts of people still there; parking, red curb, widening and new links hold on none of them. No street change holds on an evacuation measure. The City\'s Dwight Way–Dwight Place concept comes closest, on the Panoramic Hill fire: fewer cars cut off in 14 of 15 pairs and never more (140 → 100, central median) and fewer hill residents with no engine route in 15 of 15 (rerun of 2026-11-06 after evacuees drive on, SOURCE_NOTES CD20). The three buyouts tested are all on Panoramic Hill; the two larger ones hold on evacuation measures only on the Panoramic Hill fire, and part of their drop is the bought-out people no longer counted.`);
  p(`- Parking, red curb, widening, the curb-clearing buyout and the two Panoramic Hill links all act through engine reach. At night about 9,900 hill residents are beyond 5-minute engine reach with today's parking, most of them behind 17–24 ft streets parked on both sides (SOURCE_NOTES NP1–NP6). A change at the foot of Panoramic Way (red curb, widening, the curb-clearing buyout, the AC-160 link) is better in 12 of 15 pairs and equal in the other 3 (the seeds where no parked car blocks that block today), so it never "holds" under the 15-of-15 rule while never being worse. The Dwight Way–Dwight Place concept and the two larger buyouts hold on engine reach on every fire: the concept gives engines a way around the foot, and the buyouts take residents engines cannot reach off the count.`);
  p(`- Operations: contraflow on the main hill exit streets (officer-staffed or with battery-backed signs), police control of the pre-timed signals and constrained egress guidance hold on nothing on any of the four fires. Contraflow leaves more cars cut off by fire in every pair on the Panoramic Hill fire and fewer in none; on the east-wind fire more in 15 of 15 with signs and either way officer-staffed (6 more, 1 fewer); on the 1923 fire more in 10 of 15 with signs and either way officer-staffed (2 more, 4 fewer); on the north-hills fire more in 7 of 15 with signs (fewer in none) and either way officer-staffed (6 more, 1 fewer). Both leave more people still there when embers arrived in 9 to 11 of 15 pairs on every fire and fewer in 4 to 6. Before other cities ordered their zones (FO1), the east-wind fire from 60° went either way (SOURCE_NOTES CF14). Guidance is measured here against today's plan, whose drivers already take an idealized, well-informed route, so it does little here: people still there when embers arrived go either way on the east-wind and Panoramic Hill fires (7 and 8 of 15 pairs more), more in 13 of 15 on the 1923 fire and fewer in 12 of 15 on the north-hills fire, and the 90% clearance goes either way; against drivers who follow habit it does better in every pair (DG30).`);
  if (D.meta.fires.includes('quake')) p(`- (Added 2026-11-13 with the earthquake fire in Guided view, SOURCE_NOTES FF27.) **Earthquake: fires start in buildings** is run here on a fall night like every fire (HayWired's quake strikes on a spring weekday afternoon), with the scenario's own fault closures and dark signals. About 19,800 people are still there when embers arrive (central median). Leaving early holds on all three counts of people and cars; deciding faster holds on people home when the front arrived and is better on embers in 14 of 15 pairs (1 worse). The two larger buyouts hold on cars cut off. The red curb and widening at the foot of Panoramic Way, the upper Panoramic Way–Smyth Ln link and the Dwight Way–Dwight Place link gain nothing for engines here (the curb-clearing buyout of the lowest block gains 19): the fault closes two Panoramic Way segments. Constrained egress guidance and both contraflow variants leave more people still there when embers arrived in 10 to 13 of 15 pairs.`);
  if (D.meta.fires.includes('westWind')) p(`- (Added 2026-11-13 with the west-wind fire, SOURCE_NOTES FF25.) **West wind, Claremont Canyon** is a much smaller fire for people: about 156 people still there when embers arrived (central median), against 4,000–13,600 on the other four fires; most of them live in Oakland's zones on the canyon's south rim. Leaving early holds on it (73, 15 of 15), and so does constrained egress guidance (131, 15 of 15). Deciding faster goes either way (6 pairs better, 8 worse): Oakland orders those zones as the fire comes within 1 km, whatever Berkeley decides. Both contraflow variants leave more cars cut off by fire in 15 of 15 pairs (3 → 13). Engine reach is the same on every fire.`);
  } else if (LF) p('- The written conclusions in `docs/mitigations.md` are for the default fuel and are not repeated here. Against the default run, 14 lever-fire-measure results lose "holds in every pair" under LANDFIRE fuel and 1 gains it; 13 of the 14 lose it to ties in low-severity runs where the slower fire reaches almost no one, and one pair goes the other way. Under Change the plan\'s greying rule one change would turn grey (order sooner, north hills). The ready-made Simple-view questions use their own measures and settings and are not part of this run (SOURCE_NOTES PH28).');
  else p('- This run is not the full experiment the prose was written for (different seeds, fires or levers); see the tables and the lines above. The written conclusions for the full run are in the committed `docs/mitigations.md`.');
  p('');
  p('## How it was run');
  p('');
  p(`Every lever runs against the same baseline: \`DEFAULT_PLAN\` (first order 10 minutes after ignition, status-quo parking), the Time Study's fall-night case S6, fires ${D.meta.fires.join(', ')}, ${D.meta.severities.join('/')} severity × seeds ${D.meta.seeds.join(', ')} (${n} same-seed pairs per lever and fire). A lever **holds** on a measure only if it improves that measure in all ${n} pairs (the Simple-view rule, SOURCE_NOTES P19). Medians are central severity (${D.meta.seeds.length} runs). The change is the lever's central median minus the baseline's. A 90% clearance that is never reached counts as slower than any finished run, and a median that lands on such a run shows "not reached". ${D.meta.runs} simulator runs, ${D.meta.wallMin} minutes on ${D.meta.workers} workers.`);
  p('');
  p(`**Like for like:** ${D.check.ok} of ${D.check.total} lever runs drew the same households, vehicles, mobilization delays, rides and non-resident counts as their baseline run (households that leave early or are bought out are left out of the check, as in \`tests/plan-draws.mjs\` and \`tests/retreat-draws.mjs\`)${D.check.ok === D.check.total ? '' : `; mismatches: ${D.check.mismatches.map(x => `${x.lever} ${x.fire} ${x.sev} ${x.seed}: ${x.problems.join('; ')}`).join(' | ')}`}. The control lever (baseline rerun) matched the baseline on every measure in ${D.control.identical} of ${D.control.total} runs.`);
  p('');
  p('Measures (all from `summary()` in `js/sim.js`):');
  p('');
  for (const k of MKEYS) p(`- **${MEASURES[k].label}**: ${MEASURES[k].def}.`);
  p('');
  for (const fire of D.meta.fires) {
    p(`## ${{ eastWind: 'East wind, Grizzly Peak', ref1923: '1923 fire, repeated today', panoramic: 'Panoramic Hill', northHills: 'North hills, Tilden', quake: 'Earthquake: fires start in buildings', westWind: 'West wind, Claremont Canyon' }[fire] || fire} (\`${fire}\`)`);
    p('');
    const base = D.baseline[fire];
    p(`Baseline, central median: ${MKEYS.map(k => `${MEASURES[k].label.toLowerCase()} ${fmtN(base[k], MEASURES[k].unit)}`).join('; ')}.`);
    p('');
    p(`Each cell: lever's central median (change from baseline; pairs better of ${n}). **Bold** = holds (better in ${n} of ${n}).`);
    p('');
    p(`| Lever | ${MKEYS.map(k => MEASURES[k].label).join(' | ')} | Capital cost |`);
    p(`|---|${MKEYS.map(() => '---').join('|')}|---|`);
    for (const lv of D.levers.filter(l => l.ran && l.group !== 'check')) {
      const s = D.summaries.find(x => x.lever === lv.id && x.fire === fire); if (!s) continue;
      const cells = MKEYS.map(k => { const m = s.measures[k]; const t = `${fmtN(m.leverCentral, MEASURES[k].unit)} (${fmtD(m.change, MEASURES[k].unit)}; ${m.better}/${m.n}${m.worse ? `, ${m.worse} worse` : ''})`; return m.holds ? `**${t}**` : t; });
      p(`| ${lv.title} | ${cells.join(' | ')} | ${costText(lv.cost)} |`);
    }
    p('');
  }
  p('## What each lever is, its cost basis, and what the simulator cannot measure');
  p('');
  for (const lv of D.levers.filter(l => l.ran && l.group !== 'check')) {
    const holds = D.meta.fires.map(f => { const s = D.summaries.find(x => x.lever === lv.id && x.fire === f); const h = s ? MKEYS.filter(k => s.measures[k].holds).map(k => MEASURES[k].label.toLowerCase()) : []; return `${f}: ${h.length ? h.join(', ') : 'none'}`; }).join('; ');
    p(`### ${lv.title}`);
    p('');
    p(`${lv.what[0].toUpperCase() + lv.what.slice(1)}. Applied with ${lv.how}.`);
    p('');
    p(`- **Holds on:** ${holds}.`);
    const nw = D.meta.fires.map(f => { const s = D.summaries.find(x => x.lever === lv.id && x.fire === f); const h = s ? MKEYS.filter(k => !s.measures[k].holds && !s.measures[k].worse && s.measures[k].better >= s.measures[k].n / 2) : []; return h.length ? `${f}: ${h.map(k => `${MEASURES[k].label.toLowerCase()} (${s.measures[k].better} better, ${s.measures[k].same} equal)`).join(', ')}` : null; }).filter(Boolean);
    if (nw.length) p(`- **Better in most pairs and never worse:** ${nw.join('; ')}.`);
    p(`- **Cost:** ${costText(lv.cost)}. ${lv.cost?.note ?? ''}${lv.cost?.source ? ` Source: \`${lv.cost.source}\`.` : ''}`);
    p(`- **What the simulator can't measure:** ${lv.cannotMeasure}`);
    p('');
  }
  const stopped = D.levers.filter(l => l.stopped);
  if (stopped.length) { p('## Levers stopped'); p(''); for (const l of stopped) p(`- **${l.title}**: ${l.stopped}`); p(''); }
  p('## Not run');
  p('');
  for (const l of D.levers.filter(l => l.notComparable)) p(`- **${l.title}** (not comparable on today's population): ${l.notComparable}`);
  for (const l of D.levers.filter(l => l.pending)) p(`- **${l.title}** (pending): ${l.pending}.`);
  p('');
  p('## Limits');
  p('');
  p('- All levers run at fall night (S6), when hill curbs are fullest; the Simple-view leave-early and parking questions use the same case, the order-timing question uses a weekday (S4). Weekday evacuation times in the simulator run 25–80 minutes fast against the Time Study (HANDOFF calibration table).');
  p('- Measures are model-wide. A lever that acts on one street (a link, a widening, a red curb) moves a model-wide count only a little even where it helps its own area; the per-area effects are in `docs/egress-candidates.md`, `docs/widening.md` and `docs/managed-retreat.md`.');
  p('- Engine reach is measured at ignition from parked cars, so it is the same on every fire for a seed. Engines only drive in this simulator: better reach does not change the fire or who is still there.');
  p('- Bought-out households make no trip and are not counted, so part of a buyout\'s drop in people still there is the removed people themselves (SOURCE_NOTES RT5).');
  p('- Costs are copied, not recomputed: timing and parking levers have little capital cost and are left unpriced (null), not zero.');
  p('');
  fs.writeFileSync(DOC, L.join('\n'));
  console.log(`wrote ${path.relative(R, DOC)}`);
}

if (argv.includes('--report-only')) { writeReport(JSON.parse(fs.readFileSync(OUT, 'utf8'))); process.exit(0); }

// ---------- main: run ----------
// --from-runs: recompute summaries and the report from the runs saved in the output (no simulation).
const SAVED = argv.includes('--from-runs') ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
// --merge: run the --fires named and keep the saved runs of every other fire (same seeds and levers).
const MERGE = !SAVED && argv.includes('--merge') ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
if (MERGE && !arg('--fires', null)) throw new Error('--merge needs --fires');
if (MERGE && (arg('--seeds', null) || arg('--levers', null))) throw new Error('--merge takes the saved seeds and levers; drop --seeds and --levers');
// --add-levers a,b: run the baseline and only the levers named, on the saved fires, severities and seeds, and keep every
// other saved run. The new baseline must match the saved one on every saved measure; a measure the saved runs lack is
// copied into each saved lever run from its new baseline run, which is valid only for levers that cannot change it
// (the structures-lost measure, for levers that set no hardening or Zone 0; checked below).
const ADD = !SAVED && !MERGE && arg('--add-levers', null) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const ADDIDS = ADD ? arg('--add-levers').split(',') : null;
if (ADD && (arg('--seeds', null) || arg('--levers', null) || arg('--fires', null))) throw new Error('--add-levers takes the saved seeds, fires and levers');
const OLD = SAVED || MERGE || ADD;
const NSEED = OLD ? OLD.meta.seeds.length : +arg('--seeds', 5), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const seeds = Array.from({ length: NSEED }, (_, i) => i + 1);
if (MERGE && JSON.stringify(seeds) !== JSON.stringify(MERGE.meta.seeds)) throw new Error('saved seeds are not 1..n');
const runFires = SAVED || ADD ? OLD.meta.fires : arg('--fires', null)?.split(',') ?? FIRES;
for (const f of runFires) if (!FIRES.includes(f)) throw new Error(`unknown fire ${f}; known: ${FIRES.join(', ')}`);
const kept = MERGE ? MERGE.runs.filter(r => !runFires.includes(r.fire)) : [];
const fires = MERGE ? FIRES.filter(f => runFires.includes(f) || kept.some(r => r.fire === f)) : runFires;
const only = OLD ? [...OLD.levers.filter(l => l.ran).map(l => l.id), ...(ADDIDS || [])] : arg('--levers', null)?.split(',');
const levers = resolveLevers();
for (const l of levers.filter(l => l.stopped)) console.log(`STOPPED ${l.id}: ${l.stopped}`);
const runnable = levers.filter(l => !l.stopped && !l.pending && !l.notComparable && (!only || only.includes(l.id) || l.id === 'control'));
if (MERGE && runnable.map(l => l.id).join(' ') !== only.join(' ')) throw new Error(`levers differ from the saved run: ${runnable.map(l => l.id).join(' ')} vs ${only.join(' ')}`);
const byId = Object.fromEntries(runnable.map(l => [l.id, l]));
const jobs = [];
for (const fire of runFires) for (const sev of SEVS) for (const seed of seeds) {
  jobs.push({ lever: 'baseline', fire, sev, seed });
  for (const l of runnable) if ((!ADD || ADDIDS.includes(l.id)) && (!l.centralOnly || sev === 'central')) jobs.push({ lever: l.id, fire, sev, seed });
}
// Keep each fire|sev|seed on one worker (its baseline snapshot is reused), baseline first.
const keys = [...new Set(jobs.map(j => `${j.fire}|${j.sev}|${j.seed}`))];
const chunks = Array.from({ length: WORKERS }, () => []);
keys.forEach((k, i) => chunks[i % WORKERS].push(...jobs.filter(j => `${j.fire}|${j.sev}|${j.seed}` === k)));
console.log(`${runnable.length} levers (incl. control), ${jobs.length} runs on ${WORKERS} workers`);
const t0 = Date.now();
let rows, wallMin;
if (SAVED) { rows = SAVED.runs; wallMin = SAVED.meta.wallMin; console.log('summaries from saved runs'); } else {
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mitigations-'));
rows = (await Promise.all(chunks.filter(c => c.length).map(async (chunk, w) => {
  const fin = path.join(TMP, `jobs-${w}.json`), fout = path.join(TMP, `out-${w}.json`);
  fs.writeFileSync(fin, JSON.stringify({ jobs: chunk, levers: byId }));
  await promisify(execFile)(process.execPath, ['--max-old-space-size=4096', SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
  return JSON.parse(fs.readFileSync(fout, 'utf8'));
}))).flat();
fs.rmSync(TMP, { recursive: true, force: true });
wallMin = r1((Date.now() - t0) / 60000);
console.log(`done in ${wallMin} min`);
if (ADD) {
  const key = r => `${r.fire}|${r.sev}|${r.seed}`, savedBase = new Map(ADD.runs.filter(r => r.lever === 'baseline').map(r => [key(r), r]));
  const newBase = new Map(rows.filter(r => r.lever === 'baseline').map(r => [key(r), r]));
  const added = MKEYS.filter(k => ADD.runs.some(r => !(k in r.m)));
  for (const [k, r] of newBase) { const o = savedBase.get(k); if (!o) throw new Error(`no saved baseline for ${k}`);
    for (const m of Object.keys(o.m)) if (JSON.stringify(o.m[m]) !== JSON.stringify(r.m[m])) throw new Error(`baseline ${k} ${m} differs from the saved run: ${o.m[m]} vs ${r.m[m]}`); }
  if (newBase.size !== savedBase.size) throw new Error(`baseline runs ${newBase.size} vs saved ${savedBase.size}`);
  const keptRuns = ADD.runs.filter(r => r.lever !== 'baseline' && !ADDIDS.includes(r.lever)).map(r => {
    if (!added.length) return r;
    const L = LEVERS.find(l => l.id === r.lever);
    if (added.includes('homes') && (L?.plan?.hardenShare || L?.plan?.zone0Share)) throw new Error(`cannot copy homes into ${r.lever}`);
    const mm = { ...r.m, ...Object.fromEntries(added.map(k => [k, newBase.get(key(r)).m[k]])) };
    return { ...r, m: Object.fromEntries([...MKEYS, ...Object.keys(mm).filter(k => !MKEYS.includes(k))].map(k => [k, mm[k]])) }; // measure order, as in new runs; extra keys (frontPeople) kept
  });
  console.log(`added ${ADDIDS.join(', ')}; baseline matches the saved one on ${Object.keys(ADD.runs[0].m).length} measures in ${newBase.size} runs; copied ${added.join(', ') || 'nothing'} into ${keptRuns.length} saved lever runs`);
  rows = [...rows.filter(r => r.lever === 'baseline'), ...keptRuns, ...rows.filter(r => r.lever !== 'baseline')]; wallMin = r1(ADD.meta.wallMin + wallMin);
}
if (MERGE) { console.log(`merged with ${kept.length} saved runs (${[...new Set(kept.map(r => r.fire))].join(', ')})`); rows = [...kept, ...rows]; wallMin = r1(MERGE.meta.wallMin + wallMin); }
}

// ---------- summaries ----------
const keyOf = r => `${r.fire}|${r.sev}|${r.seed}`;
const baseRow = new Map(rows.filter(r => r.lever === 'baseline').map(r => [keyOf(r), r]));
const checks = rows.filter(r => r.check);
const mismatches = checks.filter(r => !r.check.ok).map(r => ({ lever: r.lever, fire: r.fire, sev: r.sev, seed: r.seed, problems: r.check.problems }));
if (mismatches.length) console.log(`WARNING: ${mismatches.length} lever runs drew different households than their baseline`);
const ctrl = rows.filter(r => r.lever === 'control');
const ctrlSame = ctrl.filter(r => MKEYS.every(k => JSON.stringify(r.m[k]) === JSON.stringify(baseRow.get(keyOf(r)).m[k]))).length; // per measure, so key order does not matter
if (ctrlSame !== ctrl.length) console.log(`WARNING: control differs from baseline in ${ctrl.length - ctrlSame} of ${ctrl.length} runs`);
const baseline = Object.fromEntries(fires.map(f => [f, Object.fromEntries(MKEYS.map(k => { const v = rows.filter(r => r.lever === 'baseline' && r.fire === f && r.sev === 'central').map(r => r.m[k]); return [k, MEASURES[k].time ? medianTime(v) : median(v)]; }))]));
const summaries = [];
for (const l of runnable) for (const fire of fires) {
  const pairs = rows.filter(r => r.lever === l.id && r.fire === fire).map(r => [r, baseRow.get(keyOf(r))]);
  if (!pairs.length) continue;
  const measures = {};
  for (const k of [...MKEYS, 'frontPeople']) {
    let better = 0, worse = 0, same = 0; const dc = [];
    for (const [w, b] of pairs) { const s = cmp(w.m[k], b.m[k]); if (s < 0) better++; else if (s > 0) worse++; else same++; if (w.sev === 'central' && w.m[k] != null && b.m[k] != null) dc.push(w.m[k] - b.m[k]); }
    const med = MEASURES[k]?.time ? medianTime : median;
    const cB = pairs.filter(([w]) => w.sev === 'central').map(([, b]) => b.m[k]), cW = pairs.filter(([w]) => w.sev === 'central').map(([w]) => w.m[k]);
    const bc = med(cB), lc = med(cW);
    measures[k] = { baselineCentral: r1(bc), leverCentral: r1(lc), change: bc != null && lc != null ? r1(lc - bc) : null, pairedCentralChange: r1(median(dc)),
      better, worse, same, n: pairs.length, holds: better === pairs.length && pairs.length > 0,
      ...(MEASURES[k]?.time ? { notReachedBaseline: pairs.filter(([, b]) => b.m[k] == null).length, notReachedLever: pairs.filter(([w]) => w.m[k] == null).length } : {}) };
  }
  const rh = pairs.map(([w]) => w.retreatHouseholds);
  summaries.push({ lever: l.id, fire, runs: pairs.length, measures, holdsOn: MKEYS.filter(k => measures[k].holds), ...(l.retreat ? { retreatHouseholdsPerRun: [Math.min(...rh), Math.max(...rh)] } : {}) });
}

const D = {
  meta: { built: SAVED ? SAVED.meta.built : new Date().toISOString().slice(0, 10), workersNote: SAVED ? 'summaries recomputed from saved runs (--from-runs)' : ADD ? `baseline rerun and levers ${ADDIDS.join(', ')} added to the saved runs (--add-levers); wallMin is the sum` : MERGE ? `runs of ${runFires.join(', ')} added to the saved runs of ${fires.filter(f => !runFires.includes(f)).join(', ')} (--merge); wallMin is the sum` : undefined, tool: 'tools/mitigations.mjs', report: 'docs/mitigations.md',
    note: 'Educational comparison, not a prediction and not an official evacuation plan. Synthetic households, illustrative fires. "People still there when embers arrived" and "still home when the fire front arrived" count synthetic people at that moment; they are not casualty counts. Costs are screening ranges copied from earlier outputs (null = not priced, never zero).',
    fuel: FUEL,
    baseline: 'DEFAULT_PLAN (js/sim.js), Time Study case S6 (fall night) for every fire', plan: DEFAULT_PLAN, timeOfDay: TOD, fires, severities: SEVS, seeds, workers: SAVED ? SAVED.meta.workers : WORKERS, runs: rows.length, wallMin,
    holdsRule: `better in every same-seed pair (${SEVS.length * seeds.length} of ${SEVS.length * seeds.length}), SOURCE_NOTES P19`, measures: Object.fromEntries(MKEYS.map(k => [k, { label: MEASURES[k].label, unit: MEASURES[k].unit, def: MEASURES[k].def }])) },
  check: { total: checks.length, ok: checks.length - mismatches.length, mismatches },
  control: { total: ctrl.length, identical: ctrlSame },
  levers: levers.map(l => ({ id: l.id, group: l.group, title: l.title, what: l.what ?? null, how: l.how ?? null, ran: !!byId[l.id],
    delta: { plan: l.plan ?? null, edges: l.edges ? { variant: l.edges.variant, pinch: l.edges.pinch, edges: l.edges.edges } : null, link: l.link ? { id: l.link.id, a: l.link.a, b: l.link.b, lengthM: l.link.lengthM, street: l.link.street, geom: l.link.geom, fireZone: l.link.fireZone ?? null, open: l.link.open } : null,
      retreat: l.retreat ? { case: l.retreat.id, edges: l.retreat.edges, clearParking: !!l.clearParking } : null },
    cost: l.cost ?? null, cannotMeasure: l.cannotMeasure ?? null, stopped: l.stopped ?? null, pending: l.pending ?? null, notComparable: l.notComparable ?? null })),
  baseline, summaries, runs: rows,
};
fs.writeFileSync(OUT, JSON.stringify(D));
console.log(`wrote ${path.relative(R, OUT)}`);
writeReport(D);
const f = m => `${m.baselineCentral}→${m.leverCentral} (${m.better}/${m.worse}/${m.same})${m.holds ? ' HOLDS' : ''}`;
for (const s of summaries) console.log(`${s.lever} ${s.fire}: ${MKEYS.map(k => `${k} ${f(s.measures[k])}`).join(' | ')}`);
