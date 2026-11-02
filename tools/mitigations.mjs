#!/usr/bin/env node
// Mitigation synthesis, phase 1 (data only): every mitigation lever run against the same baseline on the
// same fires, severities and seeds, with costs copied from earlier outputs and a robustness count.
//
//   node tools/mitigations.mjs [--seeds 5] [--workers N] [--report-only] [--fires a,b] [--levers a,b]
//        writes data/model/mitigations.json and docs/mitigations.md
//
// Baseline: DEFAULT_PLAN (js/sim.js), Time Study case S6 (fall night) for every fire, fires eastWind,
// ref1923 and panoramic, low/central/high severity × seeds 1–5. Each lever is one entry in LEVERS below:
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
const OUT = path.join(R, 'data/model/mitigations.json'), DOC = path.join(R, 'docs/mitigations.md');

const FIRES = ['eastWind', 'ref1923', 'panoramic'];
const SEVS = ['low', 'central', 'high'];
const TOD = 'S6';

// ---------- measures (all from Evacuation.summary(), js/sim.js) ----------
const MEASURES = {
  ember: { label: 'People still there when embers arrived', get: S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, unit: 'people',
    def: 'synthetic people at home, on the road or without a car when embers reached their street, including people in zones never told to leave (the Simple-view headline; js/presets.js)' },
  front: { label: 'People still home when the fire front arrived', get: S => S.fireFrontHome, unit: 'people',
    def: 'synthetic people still at home when the fire front reached their street (summary().fireFrontHome); early leavers and bought-out households never count' },
  cutOff: { label: 'Cars cut off by fire', get: S => S.vehiclesNoRoute, unit: 'vehicles',
    def: 'vehicles on the road at the end of the run with no route to safety (summary().vehiclesNoRoute; the results panel\'s "vehicles cut off by fire")' },
  engine: { label: 'Hill residents an engine cannot reach within 5 minutes', get: S => S.engineReachBeyond5People, unit: 'people',
    def: 'synthetic Berkeley Fire Zones 2–3 residents whose street no engine reaches from a station within the City\'s 5-minute standard, at ignition, under the run\'s parked cars (summary().engineReachBeyond5People); the same on every fire for a seed' },
  clear90: { label: '90% clearance (min)', get: S => S.clearP90, unit: 'minutes', time: true,
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
  { id: 'leaveEarly', group: 'timing', title: 'Leave early on a Red Flag day', what: 'half of hill households (Fire Zones 2–3) leave on the Red Flag warning, before ignition',
    how: 'js/presets.js leaveEarly Plan B delta', plan: presetDelta('leaveEarly'),
    costNote: 'Little capital cost: a warning and outreach the City already runs. The real costs are households\' time away from home on every Red Flag day, unpriced.',
    cannotMeasure: 'Whether half of hill households would actually leave on a real Red Flag day, and whether they keep doing it after Red Flag days with no fire (warning fatigue). The simulator places the early leavers out of the area before ignition.' },
  { id: 'orderSooner', group: 'timing', title: 'Decide faster', what: 'first evacuation order 5 minutes after ignition (baseline: 10, DEFAULT_PLAN)',
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
  { id: 'link-AC-160-N3', group: 'link', title: 'New link: upper Panoramic Way to Smyth Ln', what: 'step 2\'s top-ranked candidate (88 m)', how: 'tools/egress-link.mjs withLinks, candidate AC-160-N3', link: 'AC-160-N3' },
  { id: 'link-AC-193-N1', group: 'link', title: 'New link: Buena Vista Way to W Parnassus Ct', what: 'the only non-Panoramic candidate whose own area\'s cars cut off fell in step 2 (ref1923)', how: 'tools/egress-link.mjs withLinks, candidate AC-193-N1', link: 'AC-193-N1' },
  { id: 'widen-WP-001', group: 'widen', title: 'Widen the lowest block of Panoramic Way to 20 ft clear', what: 'pinch WP-001 widened to the fire-code standard, parking posted to today\'s sides',
    how: 'tools/widening-core.mjs widenedEdge (standards().fireCode), as tools/widening-sim.mjs "widen"', edges: { variant: 'widen', pinch: 'WP-001' } },
  { id: 'widen-WP-007', group: 'widen', title: 'Widen Oak Ridge Rd pinch to 20 ft clear', what: 'pinch WP-007 widened to the fire-code standard, parking posted to today\'s sides',
    how: 'tools/widening-core.mjs widenedEdge (standards().fireCode), as tools/widening-sim.mjs "widen"', edges: { variant: 'widen', pinch: 'WP-007' } },
  { id: 'retreat-footBlock', group: 'retreat', title: 'Buy out the lowest block of Panoramic Way, curb cleared', what: 'households on edge 992 bought out and its parked cars removed',
    how: 'world.retreat { edges: retreat.json engineFoot.edges, clearParking: true }, the engine-reach sensitivity of tools/retreat-sim.mjs', retreat: 'footBlock', clearParking: true },
  { id: 'retreat-top100', group: 'retreat', title: 'Buy out the top-ranked blocks, about 100 households', what: 'case top100 of data/model/retreat.json', how: 'world.retreat { edges: retreat.json cases top100 .removed }, as tools/retreat-sim.mjs fire runs', retreat: 'top100' },
  { id: 'retreat-panoramicUpper', group: 'retreat', title: 'Buy out Panoramic Hill\'s upper streets', what: 'case panoramicUpper of data/model/retreat.json (behind the second choke on Panoramic Way)', how: 'world.retreat { edges: retreat.json cases panoramicUpper .removed }, as tools/retreat-sim.mjs fire runs', retreat: 'panoramicUpper' },
  // Not run here.
  { id: 'r0', group: 'notComparable', title: 'R0: no added units in hill areas', notComparable: 'R0 acts only under a future-growth scenario; on today\'s population (no growth) it changes nothing, so it is not comparable with these levers. Its results are in SOURCE_NOTES R1–R8 (with maximum growth, R0 lowers people still there when embers arrived in all 30 pairs).' },
  { id: 'contraflow', group: 'pending', title: 'Contraflow', pending: 'not merged; add an entry here when it is' },
  { id: 'policeControl', group: 'pending', title: 'Police control of signals', pending: 'not merged (HANDOFF punch list 7a); add an entry here when it is' },
  { id: 'powerShutoff', group: 'pending', title: 'Power shutoff', pending: 'PR #19, not merged; add an entry here when it is' },
  { id: 'egressGuidance', group: 'pending', title: 'Egress guidance', pending: 'PR #22, not merged; add an entry here when it is' },
];
const CANNOT = {
  link: 'Environmental review, slope and land acquisition, and whether the link is itself in the fire\'s path on the day. Costs exclude engineering, environmental review and legal costs (egress-candidates.json meta.cost.note).',
  widen: 'Takings, retaining walls and construction on a steep street, and whether residents would park on the new pavement (the run posts parking to today\'s sides). Engines do not fight the fire in this simulator.',
  retreat: 'Willingness to sell, the loss of homes and community, where displaced households go, and what happens to the vacated land. Removed households simply make no trip, so part of any drop is the bought-out people no longer being counted.',
};

// ---------- small helpers ----------
const median = a => { const s = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const medianTime = a => { const s = a.map(x => x == null || !Number.isFinite(x) ? Infinity : x).sort((x, y) => x - y); if (!s.length) return null; const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return Number.isFinite(m) ? m : null; };
const cmp = (a, b) => { const A_ = a ?? Infinity, B_ = b ?? Infinity; return A_ === B_ ? 0 : A_ < B_ ? -1 : 1; }; // lower is better; a missing clearance time is worst
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

// ---------- worker ----------
if (argv[0] === '--worker') {
  const { jobs, levers } = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const { loadData, prepare } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation } = await import(R + '/js/sim.js');
  const { withLinks, demSampler } = await import(R + '/tools/egress-link.mjs');
  const { widenedEdge, noParkingEdge, applyEdges, standards, nominalSides } = await import(R + '/tools/widening-core.mjs');
  const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const base = await loadData(load), grid = buildFireGrid(base), scen = Object.fromEntries(makeScenarios(base).map(s => [s.id, s]));
  const elev = demSampler(base.dem, base.Z);
  const fireMemo = new Map(), dataMemo = new Map(), snaps = new Map();
  const fireFor = (f, sev, seed) => { const k = `${f}|${sev}|${seed}`; if (!fireMemo.has(k)) { if (fireMemo.size > 8) fireMemo.delete(fireMemo.keys().next().value); fireMemo.set(k, runFire(grid, scen[f], SEVERITY[sev], seed)); } return fireMemo.get(k); };
  // A network with the lever's link (tools/egress-sim.mjs dataFor, asIs variant)
  const dataFor = L => {
    if (!L.link) return base;
    if (!dataMemo.has(L.id)) { const c = L.link; const spec = c.open ? { open: c.open, links: [] } : { open: [], links: [{ id: c.id, a: c.a, b: c.b, geom: c.geom, fireZone: c.fireZone }] };
      const net = withLinks(base.net, base.A, elev, spec); dataMemo.set(L.id, prepare({ net, layers: base.layers, dem: base.dem, Z: base.Z, A: base.A })); }
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
    return { n: H.n, edge: H.edge.slice(), veh: H.veh.slice(), kind: H.kind.slice(), commuter: H.commuter.slice(), early: H.early.slice(), gone: H.gone.slice(), ride: H.ride.slice(), mob, nonResident: { ...sim.nonResident } }; };
  const sameT = (x, y) => (!Number.isFinite(x) && !Number.isFinite(y) && x === y) || Math.abs(x - y) <= 1e-6;
  function compare(a, b) { // a: baseline snapshot, b: lever snapshot; returns a list of problems (empty = like for like)
    const bad = []; let compared = 0, gone = 0;
    if (a.n !== b.n) return [`household count ${a.n} vs ${b.n}`];
    for (let h = 0; h < a.n && bad.length < 3; h++) {
      if (a.edge[h] !== b.edge[h] || a.veh[h] !== b.veh[h]) { bad.push(`hh ${h}: street or vehicles differ`); continue; }
      if (b.gone[h]) { gone++; continue; }
      if (a.early[h] || b.early[h]) continue;
      compared++;
      if (a.kind[h] !== b.kind[h]) { bad.push(`hh ${h}: kind ${a.kind[h]} vs ${b.kind[h]}`); continue; }
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
      const m = Object.fromEntries(MKEYS.map(k => { const v = MEASURES[k].get(S); return [k, v == null ? null : r1(v)]; }));
      m.frontPeople = r1(S.fireFrontHome + S.fireFrontRoad);
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
      if (L.group === 'timing' || L.group === 'parking' && L.plan) L.cost = { capital: null, unpriced: true, note: L.costNote, source: null };
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
const costText = c => !c ? 'not priced' : c.capital ? `${money(c.capital[0])}–${money(c.capital[1])}` : c.unpriced && c.note ? 'little capital cost; not priced' : 'not priced';

function writeReport(D) {
  const L = [];
  const p = s => L.push(s);
  const n = D.meta.seeds.length * D.meta.severities.length;
  p('# Mitigation levers on one baseline (phase 1, data only)');
  p('');
  p(`Generated by \`node tools/mitigations.mjs\` on ${D.meta.built}; data in \`data/model/mitigations.json\`. Educational comparison on synthetic households and illustrative fires, not a prediction and not an official evacuation plan. "People still there when embers arrived" counts synthetic people at that moment; it is not a casualty count. Costs are screening ranges copied from earlier outputs, not estimates of a project.`);
  p('');
  p('## Findings');
  p('');
  const ranLevers = D.levers.filter(l => l.ran && l.group !== 'check');
  for (const fire of D.meta.fires) {
    const parts = ranLevers.map(lv => { const s = D.summaries.find(x => x.lever === lv.id && x.fire === fire); const h = s ? MKEYS.filter(k => s.measures[k].holds) : []; return h.length ? `${lv.title} (${h.map(k => MEASURES[k].label.toLowerCase()).join('; ')})` : null; }).filter(Boolean);
    p(`- **${fire}:** holds in every pair: ${parts.length ? parts.join(', ') : 'none'}.`);
  }
  p(`- (Written for the ${D.meta.built} run; check against the tables after a rerun.) Only the timing levers (leave early, decide faster) and buyouts on the Panoramic Hill fire lower the counts of people still there; parking, red curb, widening and new links move those counts by a few dozen people at most, either way, and hold on none of them. Of the street changes, only the City\'s Dwight Way–Dwight Place concept holds on an evacuation measure: cars cut off on the Panoramic Hill fire. The three buyouts tested are all on Panoramic Hill; the two larger ones hold only on the Panoramic Hill fire, and part of their drop is the bought-out people no longer counted.`);
  p(`- Parking, red curb, widening, the curb-clearing buyout and the two Panoramic Hill links all act through engine reach. A change at the foot of Panoramic Way is better in 12 of 15 pairs and equal in the other 3 (the seeds where no parked car blocks that block today), so it never "holds" under the 15-of-15 rule while never being worse. The new Panoramic Hill links also give engines a way around the foot, which step 2 did not measure.`);
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
    p(`## ${{ eastWind: 'East wind, Grizzly Peak', ref1923: '1923 fire, repeated today', panoramic: 'Panoramic Hill' }[fire] || fire} (\`${fire}\`)`);
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
const NSEED = +arg('--seeds', 5), WORKERS = +arg('--workers', Math.max(1, os.cpus().length - 1));
const seeds = Array.from({ length: NSEED }, (_, i) => i + 1);
const fires = arg('--fires', null)?.split(',') ?? FIRES;
const only = arg('--levers', null)?.split(',');
const levers = resolveLevers();
for (const l of levers.filter(l => l.stopped)) console.log(`STOPPED ${l.id}: ${l.stopped}`);
const runnable = levers.filter(l => !l.stopped && !l.pending && !l.notComparable && (!only || only.includes(l.id) || l.id === 'control'));
const byId = Object.fromEntries(runnable.map(l => [l.id, l]));
const jobs = [];
for (const fire of fires) for (const sev of SEVS) for (const seed of seeds) {
  jobs.push({ lever: 'baseline', fire, sev, seed });
  for (const l of runnable) if (!l.centralOnly || sev === 'central') jobs.push({ lever: l.id, fire, sev, seed });
}
// Keep each fire|sev|seed on one worker (its baseline snapshot is reused), baseline first.
const keys = [...new Set(jobs.map(j => `${j.fire}|${j.sev}|${j.seed}`))];
const chunks = Array.from({ length: WORKERS }, () => []);
keys.forEach((k, i) => chunks[i % WORKERS].push(...jobs.filter(j => `${j.fire}|${j.sev}|${j.seed}` === k)));
console.log(`${runnable.length} levers (incl. control), ${jobs.length} runs on ${WORKERS} workers`);
const t0 = Date.now();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mitigations-'));
const rows = (await Promise.all(chunks.filter(c => c.length).map(async (chunk, w) => {
  const fin = path.join(TMP, `jobs-${w}.json`), fout = path.join(TMP, `out-${w}.json`);
  fs.writeFileSync(fin, JSON.stringify({ jobs: chunk, levers: byId }));
  await promisify(execFile)(process.execPath, ['--max-old-space-size=4096', SELF, '--worker', fin, fout], { maxBuffer: 1 << 26 });
  return JSON.parse(fs.readFileSync(fout, 'utf8'));
}))).flat();
fs.rmSync(TMP, { recursive: true, force: true });
const wallMin = r1((Date.now() - t0) / 60000);
console.log(`done in ${wallMin} min`);

// ---------- summaries ----------
const keyOf = r => `${r.fire}|${r.sev}|${r.seed}`;
const baseRow = new Map(rows.filter(r => r.lever === 'baseline').map(r => [keyOf(r), r]));
const checks = rows.filter(r => r.check);
const mismatches = checks.filter(r => !r.check.ok).map(r => ({ lever: r.lever, fire: r.fire, sev: r.sev, seed: r.seed, problems: r.check.problems }));
if (mismatches.length) console.log(`WARNING: ${mismatches.length} lever runs drew different households than their baseline`);
const ctrl = rows.filter(r => r.lever === 'control');
const ctrlSame = ctrl.filter(r => JSON.stringify(r.m) === JSON.stringify(baseRow.get(keyOf(r)).m)).length;
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
  meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/mitigations.mjs', report: 'docs/mitigations.md',
    note: 'Educational comparison, not a prediction and not an official evacuation plan. Synthetic households, illustrative fires. "People still there when embers arrived" and "still home when the fire front arrived" count synthetic people at that moment; they are not casualty counts. Costs are screening ranges copied from earlier outputs (null = not priced, never zero).',
    baseline: 'DEFAULT_PLAN (js/sim.js), Time Study case S6 (fall night) for every fire', plan: DEFAULT_PLAN, timeOfDay: TOD, fires, severities: SEVS, seeds, workers: WORKERS, runs: rows.length, wallMin,
    holdsRule: `better in every same-seed pair (${SEVS.length * seeds.length} of ${SEVS.length * seeds.length}), SOURCE_NOTES P19`, measures: Object.fromEntries(MKEYS.map(k => [k, { label: MEASURES[k].label, unit: MEASURES[k].unit, def: MEASURES[k].def }])) },
  check: { total: checks.length, ok: checks.length - mismatches.length, mismatches },
  control: { total: ctrl.length, identical: ctrlSame },
  levers: levers.map(l => ({ id: l.id, group: l.group, title: l.title, what: l.what ?? null, how: l.how ?? null, ran: !!byId[l.id],
    delta: { plan: l.plan ?? null, edges: l.edges ? { variant: l.edges.variant, pinch: l.edges.pinch, edges: l.edges.edges } : null, link: l.link ? { id: l.link.id, a: l.link.a, b: l.link.b, lengthM: l.link.lengthM, street: l.link.street } : null,
      retreat: l.retreat ? { case: l.retreat.id, edges: l.retreat.edges, clearParking: !!l.clearParking } : null },
    cost: l.cost ?? null, cannotMeasure: l.cannotMeasure ?? null, stopped: l.stopped ?? null, pending: l.pending ?? null, notComparable: l.notComparable ?? null })),
  baseline, summaries, runs: rows,
};
fs.writeFileSync(OUT, JSON.stringify(D));
console.log(`wrote ${path.relative(R, OUT)}`);
writeReport(D);
const f = m => `${m.baselineCentral}→${m.leverCentral} (${m.better}/${m.worse}/${m.same})${m.holds ? ' HOLDS' : ''}`;
for (const s of summaries) console.log(`${s.lever} ${s.fire}: ${MKEYS.map(k => `${k} ${f(s.measures[k])}`).join(' | ')}`);
