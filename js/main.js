import { loadData } from './data.js';
import { buildFireGrid, runFire, fireGridFor, cellOf, demAt, FUEL, LB_MAX, CELL } from './fire.js';
import { makeScenarios, familyOf, comparisonCases, familyWinds, QUAKE_ROS_FACTOR, SEVERITY, SEVERITY_NOTE, TIME_OF_DAY, TIME_NOTE, ETE_TARGETS } from './scenarios.js';
import { Evacuation, DEFAULT_PLAN, titleCase } from './sim.js';
import { PARKING_PLANS, ENFORCE_PLANS } from './parking.js';
import { PRESETS, FIRES } from './presets.js';
import { MapView, STREET_MODES, RISE_BINS } from './map.js';
import { fromUTM } from '../tools/utm.mjs';
import { accessCard, accessSummary, accessTable, accessLegend } from './access.js';
import { ROUTING, routingOf, complianceOf, worseOff, worseOffBeyondChance } from './guidance.js';
import { SHUTOFF } from './operations.js';
import { loadMitigations, mit, MEASURES, GROUPS, stored, costText, costBadge } from './mitigate.js';
import { stackable, conflict, stackOf, dataFor } from './levers.js';
import { LINK_PROVENANCE } from '../tools/egress-link.mjs';
import { loadSpread, spread, QUESTIONS, VIEWS, PALETTE, edgeClasses, areaEdgeClasses, spreadFindings, routesFindings, accessFindings, legendHTML, cardHTML, leverAccessHTML } from './explore.js';
import { direction, chip, levelText } from './robust.js';
// localStorage can be missing or throw (private windows, blocked site data); the page works without it.
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const $ = id => document.getElementById(id);
const fmt = (x, d = 0) => x == null || Number.isNaN(x) ? '—' : x === Infinity ? '∞' : Number(x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const mins = x => x == null ? '—' : x === Infinity ? 'none' : `${fmt(x)} min`;
const hm = s => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const expertOnly = html => html.replace(/^<tr /, '<tr class="expert-only" '); // Expert view only (model time; product brief)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAT = { sourced: 'sourced', derived: 'derived', assumption: 'assumption', 'model rule': 'rule', mixed: 'derived', synthetic: 'synthetic', unknown: 'missing' };
const badge = (cat, tip) => `<span class="badge b-${CAT[cat] || 'missing'}"${tip ? ` title="${esc(tip)}"` : ''}>${cat === 'unknown' ? 'no data' : cat}${tip ? ' ⓘ' : ''}</span>`;
const srcCat = src => !src ? 'unknown' : src.startsWith('city:') ? 'sourced' : src.startsWith('assumption:') ? 'assumption' : src.startsWith('derived:') ? 'derived' : src === 'unknown' ? 'unknown' : 'derived';

const A_NOTE = k => data.A._meta[k]?.note || '';
const state = {
  plans: { A: { ...DEFAULT_PLAN, name: 'Plan A: baseline' }, B: { ...DEFAULT_PLAN, name: 'Plan B: leave early + targeted parking', earlyShare: 0.5, hillsParking: 'narrow' } },
  editing: 'A', preset: null, fire: null, playing: false, speed: 900, sim: null, fires: new Map(), batch: 0,
};

const [data] = await Promise.all([loadData(), loadMitigations(), loadSpread()]);
const grid = buildFireGrid(data);
const scenarios = makeScenarios(data);
state.fire = FIRES.find(f => f.id === localStorage.getItem('bhe-fire'))?.id ?? FIRES[0].id;
const map = new MapView($('map'), data);
$('loading').remove();
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// ---------- controls ----------
for (const s of scenarios) $('scenario').add(new Option(s.name, s.id));
for (const [k, v] of Object.entries(TIME_OF_DAY)) $('tod').add(new Option(v.label, k));
for (const [k, v] of Object.entries(STREET_MODES)) $('street-mode').add(new Option(v, k));
for (const n of data.names) $('street-names').append(new Option(titleCase(n)));
for (const n of [...data.layers.neighborhoods].sort((a, b) => a.name.localeCompare(b.name))) $('nbhd').add(new Option(n.name, n.name));
const LAYER_NAMES = { terrain: 'Terrain (DEM)', contours: 'Contours', streets: 'Streets', paths: 'Paths & stairways', evacZones: 'Evacuation zones', fireZones: 'Fire Zones 2–3',
  neighborhoods: 'Neighborhoods', fire1923: '1923 boundary', cityBoundary: 'City limits', stations: 'Stations & shelters', noParking: 'No-parking signs', tightTurns: 'Tight turns', access: 'Access constraints', demand: 'Residents 75+ (ACS)', structures: 'Structures (Fire Zones 2–3)',
  fire: 'Fire & embers', vehicles: 'Vehicles', queues: 'Queues', responder: 'Responder route' };
for (const [k, label] of Object.entries(LAYER_NAMES)) {
  if ((k === 'access' && !data.access) || (k === 'demand' && !data.demand) || (k === 'structures' && !data.structures)) continue; // optional data files
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox" ${map.layers[k] ? 'checked' : ''}> ${label}`;
  l.querySelector('input').dataset.k = k;
  l.querySelector('input').onchange = e => { map.layers[k] = e.target.checked; if (k === 'access') inspect(map.selected); map.draw(); legend(); };
  $('layers').append(l);
}

function syncLayerBoxes() { $('layers').querySelectorAll('input[data-k]').forEach(b => b.checked = !!map.layers[b.dataset.k]); $('street-mode').value = map.streetMode; }
const scenario = () => scenarios.find(s => s.id === $('scenario').value);
const PLAN_FIELDS = ['name', 'alertKm', 'orderDelayMin', 'hillsOrderMin', 'earlyShare', 'earlyZones', 'hillsParking', 'parkingEnforce', 'r0',
  'contraflow', 'contraflowMode', 'contraflowPower', 'contraflowFallback', 'police', 'officers', 'officerDelayMin'];
function showPlan() {
  const p = state.plans[state.editing];
  for (const f of PLAN_FIELDS) $(`p-${f}`).value = p[f] ?? DEFAULT_PLAN[f] ?? '';
  document.querySelectorAll('#plan-tabs button').forEach(b => b.classList.toggle('on', b.dataset.plan === state.editing));
  parkingNote(); r0Note(); opsNote();
  showRouting(); // driver information and routing (js/guidance.js)
}
function readPlan() {
  const p = state.plans[state.editing];
  p.name = $('p-name').value || `Plan ${state.editing}`;
  p.alertKm = +$('p-alertKm').value; p.orderDelayMin = +$('p-orderDelayMin').value;
  p.hillsOrderMin = $('p-hillsOrderMin').value === '' ? null : +$('p-hillsOrderMin').value;
  p.earlyShare = +$('p-earlyShare').value; p.earlyZones = $('p-earlyZones').value; p.hillsParking = $('p-hillsParking').value; p.parkingEnforce = $('p-parkingEnforce').value || 'none';
  p.r0 = $('p-r0').value || 'none';
  p.contraflow = $('p-contraflow').value; p.contraflowMode = $('p-contraflowMode').value; p.contraflowPower = $('p-contraflowPower').value; p.contraflowFallback = $('p-contraflowFallback').value;
  p.police = $('p-police').value; p.officers = +$('p-officers').value; p.officerDelayMin = +$('p-officerDelayMin').value;
  parkingNote(); r0Note(); opsNote();
}
// ---------- traffic operations: contraflow, police control (plan) and power shutoff (scenario); js/operations.js ----------
const OPS = () => data.A.operations;
function opsNote() {
  const p = state.plans[state.editing], O = OPS(), cf = $('p-contraflow').value, signs = $('p-contraflowMode').value === 'signs';
  $('cf-opts').hidden = cf === 'none';
  document.querySelectorAll('.cf-signs').forEach(el => el.hidden = !signs);
  const lane = data.A.access.movingLaneM / 0.3048, cost = O.contraflow.costPerEntryUSD[$('p-contraflowPower').value];
  $('cf-note').innerHTML = cf === 'none' ? '' : `${cf === 'main' ? `${fmt(data.contraflow?.meta.segments)} street segments on ${fmt(data.contraflow?.meta.streets)} streets that carried the most order-zone traffic out of the hills in status-quo runs, plus the entrances of the larger access-constrained areas ${badge('model rule', data.contraflow?.meta.rule)}.`
    : `${(p.contraflowEdges || []).length} street segments chosen. Click a street on the map and use “Add to contraflow” in the Inspector.`}
    A street runs two outbound lanes only where at least ${fmt(2 * lane)} ft stays clear between this plan's parked cars; narrower streets stay two-way (the Inspector says which). Once it starts, nobody drives in: returning commuters turn back or find another way, and the model sends no engine up it. Junction capacity is unchanged. ${signs
    ? `Signs switch on ${O.contraflow.signDelayMin} min after the zone's order${$('p-contraflowPower').value === 'mechanical' ? ` plus ${O.contraflow.mechanicalExtraMin} min to swing gates and unfold signs by hand` : ''} ${badge('assumption', A_NOTE('operations.contraflow'))}; a sign fails if the fire reaches it first${$('p-contraflowPower').value === 'grid' ? ' or the power is shut off' : ''}. ${cost ? `Signs cost about $${fmt(cost[0] / 1000)}k–$${fmt(cost[1] / 1000)}k per entry point; gates are not costed` : 'No public unit cost was found for mechanical signs and gates'} ${badge('assumption', A_NOTE('operations.contraflow.costPerEntryUSD'))}.`
    : `One officer per entry point (each junction where a driver could turn into the closed direction), from the shared pool below ${badge('assumption', A_NOTE('operations.contraflow'))}.`}`;
  const pol = $('p-police').value;
  $('police-note').innerHTML = pol === 'none' && cf === 'none' ? '' : `Officers ${badge('assumption', A_NOTE('operations.police.officers'))} staff contraflow entry points first, then junctions on the evacuation routes, busiest first. ${pol === 'none' ? '' : `A junction an officer controls passes ${Math.round(O.police.capacityUplift * 100)}% more vehicles than its model capacity and lets traffic heading out go first ${badge('assumption', A_NOTE('operations.police.capacityUplift'))}. The 2025 Evacuation Time Study keeps signals on normal timing and models staffed control only where plans call for it (§4.3), so its times assume none of this.`}`;
}
function shutoffNote() {
  const v = $('powerShutoff').value;
  $('shutoff-note').innerHTML = v === 'none' ? '' : `${esc(SHUTOFF[v])}: each dark signal runs as an all-way stop (California Vehicle Code §21800(d)) and passes at most about ${fmt(OPS().powerShutoff.allWayStopVph)} vehicles per hour ${badge('assumption', A_NOTE('operations.powerShutoff.allWayStopVph'))}. No signal is assumed to have battery backup. Grid-powered contraflow signs fail. ${badge('model rule', A_NOTE('operations.powerShutoff'))}`;
}
$('powerShutoff').onchange = () => { shutoffNote(); newRun(); };
// Hayward Fault earthquake (scenario setting, Expert view, off by default; SOURCE_NOTES EQ10, docs/design/earthquake-fire.md option A).
function quakeNote() {
  const v = $('quake').value, F = data.faultClosures;
  $('quake-note').innerHTML = v === 'none' ? '' : !F ? 'The closure list (data/model/fault-closures.json) did not load; no street closes.'
    : `${fmt(F[v].length)} street segments close to through traffic and fire engines before the fire starts ${badge('model rule', F.meta[v])}; residents on a closed segment can still drive off it. Every City signal is dark, as in the citywide power shutoff ${badge('assumption', 'No source gives power outages for a Hayward Fault rupture; the USGS HayWired scenario describes shaking, not outages (SOURCE_NOTES EQ3).')}. ${scenario().kind === 'earthquake' ? 'This earthquake scenario uses the lower bound unless you choose the upper one here.' : '<b>The fire is still the wildfire scenario\'s</b>: one start at the wildland edge on a dry east wind. An earthquake fire starts in buildings, several at once, on whatever wind is blowing: choose a Hayward Fault earthquake scenario for that.'}`;
}
$('quake').onchange = () => { quakeNote(); newRun(); };
// Visibility (scenario setting, Expert view, off by default; SOURCE_NOTES VZ1–VZ6).
function visibilityNote() {
  const V = data.A.visibility, P = V?.poor;
  const capCut = P ? Math.round(100 * (1 - P.capacityFactor)) : 0;
  $('visibility-note').innerHTML = $('visibility').value !== 'poor' || !P ? '' : `Every street's free-flow speed is ${+(100 * (1 - P.speedFactor)).toFixed(1)}% lower, for residents' cars and fire engines alike ${badge('sourced', V.source)}${capCut ? `, and every lane and junction carries ${fmt(capCut)}% fewer vehicles per hour` : ''}. FHWA gives this for one fog case study, not for city streets, so applying it to every street is ${badge('assumption', 'FHWA has no fog or smoke figure for urban streets or arterials; its arterial figures cover rain and snow (SOURCE_NOTES VZ3).')}. ${capCut ? '' : `Capacity is not cut ${badge('assumption', 'FHWA\'s Road Weather page gives 12% for low visibility on freeways, citing HCM 2000, which could not be read; FHWA-HOP-07-073 reports that the HCM found no study quantifying fog\'s effect on capacity (SOURCE_NOTES VZ2). Eric, 2026-11-05: leave capacity uncut.')}: each lane and junction passes as many vehicles per hour as on a clear day. `}${esc(V.fireNote)}`;
}
$('visibility').onchange = () => { visibilityNote(); newRun(); };
// Home-to-street access time (scenario, both plans, Expert view; tools/walk-access.mjs, SOURCE_NOTES WA13). Off by default.
const walkNote = () => {
  const W = data.walk, on = $('walkAccess').value === 'terrain';
  $('walk-note').innerHTML = !on ? '' : !W ? 'data/model/walk-access.json is missing: no access time is applied.'
    : `Each departing household leaves its street later by the terrain's extra walking time from door to curb for three legs (two trips out with belongings, one back) ${badge('assumption', 'Three legs is this project\'s assumption. Walking speed on slopes: Tobler\'s hiking function; stairs: Fruin\'s free-flow stair speeds (SOURCE_NOTES WA4–WA6).')}, drawn from its street segment's spread across hill homes ${badge('derived', 'Microsoft building footprints and the 4 m lidar DEM: height and distance from each footprint centroid to the nearest point of its street (tools/walk-access.mjs). Only per-segment percentiles are kept.')}. Across ${fmt(W.meta.counts.hillBuildings)} hill buildings the median is ${fmt(W.meta.counts.delayS.central[0])} s and the 90th percentile ${fmt(W.meta.counts.delayS.central[1])} s; for people with reduced mobility ${fmt(W.meta.counts.delayS.reduced[0])} and ${fmt(W.meta.counts.delayS.reduced[1])} s, which this setting does not apply. The Time Study's mobilization times may already include part of this walk.`;
};
$('walkAccess').onchange = () => { walkNote(); newRun(); };
// Night parking on narrow hill streets (Expert view, both plans; SOURCE_NOTES EV1–EV3, NP1–NP4). Acts only at night.
function nightParkingNote() {
  const N = data.A.parking.range.night, ft = m => fmt(m / 0.3048);
  $('nightparking-note').innerHTML = $('nightParking').value === 'pre20261105'
    ? `The rule used before 2026-11-05: residents stop parking a second side where under ${ft(data.A.parking.range.minLeftForCarsM)} ft would remain ${badge('model rule', A_NOTE('parking.range'))}, so most hill streets of 24 ft or less have cars on one side at night. Results match the simulator as it was before the night count.`
    : `At night, on hill streets ${ft(N.narrowMinM)}–${ft(N.narrowMaxM)} ft wide, residents park both sides on ${fmt(100 * N.narrowBothShareHills)}% of segments, leaving one car's width (${ft(N.narrowPinchClearM)} ft): cars take turns and a modeled engine does not pass ${badge('assumption', A_NOTE('parking.range.night.narrow'))}. From one night's count at about 1 a.m. on 11 narrow blocks.`;
}
$('nightParking').onchange = () => { nightParkingNote(); newRun(); };
// Fuel (scenario setting, Expert view, off by default): LANDFIRE FBFM40 in place of the fire-zone proxy (js/fire.js withLandfireFuel).
function fuelNote() {
  const on = $('fuel').value === 'landfire', M = data.fuel40?.meta;
  if (!data.fuel40) { $('fuel').value = 'proxy'; $('fuel').disabled = true; }
  $('fuel-note').innerHTML = !on ? '' : `Spread factors from LANDFIRE ${esc(M.version)} FBFM40 fuel models on the fire grid ${badge('sourced', M.product)}, each factor Rothermel's relative surface spread rate for its Scott and Burgan (2005) fuel model ${badge('model rule', M.provenance.factorRule)}. Urban cells (NB1) keep the fire-zone proxy; ember throw and landing keep the proxy too. This changes the illustrative fire only; it is not a fire-behavior prediction. Comparison in docs/fire-validation.md.`;
}
$('fuel').onchange = () => { fuelNote(); newRun(); };
// Streets I choose: the clicked segment and the same-named two-way street running on from it.
function sameStreet(id) {
  const edges = data.net.edges, name = edges[id].name, seen = new Set([id]), stack = [id];
  const two = e => e.mode === 'vehicle' && !e.disconnected && e.lanes[0] > 0 && e.lanes[1] > 0;
  while (stack.length) { const e = edges[stack.pop()]; for (const n of [e.a, e.b]) for (const o of data.nodeEdges[n]) if (!seen.has(o) && edges[o].name === name && two(edges[o])) { seen.add(o); stack.push(o); } }
  return [...seen].filter(i => two(edges[i]));
}
function toggleContraflow(id) {
  const p = state.plans[state.editing], cur = new Set(p.contraflowEdges || []), ids = sameStreet(id), on = ids.every(i => cur.has(i));
  for (const i of ids) on ? cur.delete(i) : cur.add(i);
  p.contraflowEdges = [...cur]; p.contraflow = 'custom'; $('p-contraflow').value = 'custom';
  if (state.preset) { state.preset = null; renderSimple(); }
  opsNote(); newRun();
}
// ---------- future growth (scenario) and R0 (plan) ----------
// Growth is part of the world both plans face. Guided view always runs today's population.
// Household mix, Fuel and weekday placement (Expert view) join the world only when they are not today's, so default jobs and keys are unchanged.
const world = () => document.body.classList.contains('simple') ? { growth: 'none', powerShutoff: 'none' }
  : { growth: $('growth').value, powerShutoff: $('powerShutoff').value, ...($('quake').value !== 'none' ? { quake: $('quake').value } : {}), ...($('visibility').value === 'poor' ? { visibility: 'poor' } : {}), ...($('householdMix').value === 'citywide' ? { householdMix: 'citywide' } : {}), ...($('fuel').value === 'landfire' ? { fuel: 'landfire' } : {}), ...($('nrPlacement').value !== 'area' ? { nrPlacement: $('nrPlacement').value } : {}), ...($('walkAccess').value !== 'none' ? { walkAccess: $('walkAccess').value } : {}), ...($('nightParking').value !== 'count2026' ? { nightParking: $('nightParking').value } : {}) };
// Household mix (Expert view, both plans; SOURCE_NOTES DM1–DM9, DM18). By place is the default; without
// data/model/demand-by-zone.json the simulator falls back to the Time Study's citywide mix.
if (!data.demand) { const o = $('householdMix').querySelector('option[value="place"]'); o.disabled = true; o.textContent += ' (needs data/model/demand-by-zone.json)'; $('householdMix').value = 'citywide'; }
function mixNote() {
  const D = data.A.demand, g = data.demand?.aggregate?.berkeley, pct = s => s ? `${(s.value * 100).toFixed(1)}% (${(s.range[0] * 100).toFixed(1)}–${(s.range[1] * 100).toFixed(1)}%)` : '—';
  $('mix-note').innerHTML = $('householdMix').value !== 'place'
    ? `Every zone: ${D.personsPerHousehold} persons per household and ${(D.householdsWithoutVehicleShare * 100).toFixed(2)}% of households without a vehicle, from the 2025 Evacuation Time Study's resident survey ${badge('sourced')}. The simulator uses these to check its traffic against the study (calibration); the default uses the ACS by place (SOURCE_NOTES DM3, DM18).`
    : `Each zone with households in its 2020 Census blocks (${fmt(data.demand._meta.zonesUsable)} of ${fmt(data.layers.evacZones.length)}) uses its own persons per household and share of households without a vehicle, from ACS 2020–2024 block groups allocated by housing units ${badge('derived', 'tools/build-demand.mjs; the block group\'s rates are assumed to hold in each of its blocks')}; the rest keep the Time Study's ${D.personsPerHousehold} and ${(D.householdsWithoutVehicleShare * 100).toFixed(2)}%. Berkeley's zones together: ${pct(g?.zeroVehicle)} without a vehicle, ${g?.personsPerHousehold?.value.toFixed(2)} persons per household. The Time Study's resident survey gives 7.47%; the ACS is the larger, census-based measure, and a self-selected survey can under-count carless renters and students (SOURCE_NOTES DM3, DM18). Vehicles per driving household, mobilization and ridesharing are the Time Study's.`
};
$('householdMix').onchange = () => { mixNote(); newRun(); };
function placementNote() {
  const wp = data.workplaces, on = $('nrPlacement').value === 'workplace';
  if (!wp) { const o = $('nrPlacement').querySelector('option[value="workplace"]'); o.disabled = true; o.textContent += ' (needs data/model/workplaces.json)'; }
  $('placement-note').innerHTML = !on ? '' : `The 2025 Evacuation Time Study's employee, student and visitor vehicles per area stay the same ${badge('sourced')}. Employees park on streets within ${wp.params.walkM} m of the workplace blocks where LEHD LODES 2023 counts jobs held by people living outside Berkeley ${badge('derived')}; UC employee and commuting-student cars fill UC's off-street parking first (OpenStreetMap facilities scaled to UC's published 5,500 spaces), the rest park on streets near campus as before; Lab employees park in the Lab's lots ${badge('model rule')}. Visitors and on-campus students are placed as before. See docs/weekday-placement.md.`;
}
placementNote();
$('nrPlacement').onchange = () => { placementNote(); newRun(); };
for (const [k, o] of Object.entries(data.A.growth.options)) $('growth').add(new Option(o.label, k));
if (!data.access) { const o = $('p-r0').querySelector('option[value="access"]'); o.disabled = true; o.textContent += ' (needs data/model/access-constraints.json)'; }
const growthNote = () => { const o = data.A.growth.options[$('growth').value]; $('growth-note').innerHTML = `${esc(o.note)} ${badge(o.category)}`; };
function r0Note() {
  const v = $('p-r0').value, R = data.A.growth.r0;
  $('r0-note').innerHTML = v === 'none' || !v ? esc(R.none)
    : `${esc(R.areas[v])} <b>Legal status:</b> ${esc(R.legal)} ${badge('model rule', R.provenance)}${$('growth').value === 'none' ? ' <span class="muted">No effect while Future growth is set to none.</span>' : ''}`;
}
for (const [k, label] of Object.entries(PARKING_PLANS)) $('p-hillsParking').add(new Option(label, k));
for (const [k, label] of Object.entries(ENFORCE_PLANS)) $('p-parkingEnforce').add(new Option(label, k));
function parkingNote() {
  const v = $('p-hillsParking').value;
  $('parking-note').textContent = v === 'both' ? 'Each run draws which hill blocks are parked on one side or both, where cars sit partly off the pavement, and where one bad parking job (a wide vehicle or a car far from the curb) narrows the gap. Both plans see the same parked cars for the same seed; compare across seeds to see how often engines get through.'
    : v === 'oneside' ? 'Parking stays, but only on one side of hill streets (for example on Red Flag days). Leaves most hill streets with one clear lane for engines and for taking turns. Enforcement and resident impacts are not yet modeled.'
    : v === 'tight' ? 'Parking stays as it is, but cars must park tight to the curb, so there are no bad parking jobs. Shows how much engine access depends on a few badly parked vehicles. Enforcement is not yet modeled.'
    : v === 'none'
    ? 'Broad restriction. Berkeley’s 2025 Evacuation Time Study found broad parking restrictions unlikely to improve evacuation flow, and they could worsen intersection queues. This model does not count parking removal as extra evacuation lanes on two-way streets; its main effect here is on fire-engine access. Resident impacts (lost parking, enforcement) are not yet modeled.'
    : v === 'narrow' ? 'Targeted restriction on the City’s mapped narrow roads (Narrow_Roads layer). Aimed at responder ingress; enforcement and resident impacts are not yet modeled.' : '';
}
for (const f of PLAN_FIELDS) $(`p-${f}`).addEventListener('change', () => { readPlan(); newRun(); });
document.querySelectorAll('#plan-tabs button').forEach(b => b.onclick = () => { readPlan(); state.editing = b.dataset.plan; showPlan(); newRun(); });

// ---------- driver information and routing (plan setting; js/guidance.js, SOURCE_NOTES DG1–DG14) ----------
// Kept apart from PLAN_FIELDS: a plan without these fields routes with Today's model.
for (const [k, o] of Object.entries(ROUTING)) $('p-routing').add(new Option(o.label, k));
function routingNote() {
  const m = $('p-routing').value, R = ROUTING[m] || ROUTING.today;
  $('p-compliance').disabled = m === 'today';
  $('routing-note').innerHTML = `${esc(R.note)} ${badge(R.category)}${m === 'today' ? '' : ` Share of drivers ${badge('assumption')}: the households that follow are drawn per household from their own seeded stream, so the same households follow in Plan A and Plan B. Compare shows households worse off, household by household.`}`;
}
function showRouting() { const p = state.plans[state.editing]; $('p-routing').value = routingOf(p); $('p-compliance').value = String(complianceOf(p)); routingNote(); }
function readRouting() { const p = state.plans[state.editing]; p.routing = $('p-routing').value; p.compliance = +$('p-compliance').value; routingNote(); }
for (const id of ['p-routing', 'p-compliance']) $(id).addEventListener('change', () => { readRouting(); newRun(); });
// Results panel: who follows, and once the run is complete, households worse off against the
// natural comparison (Habit for the app and guidance options, Today's model for Habit), from two
// background runs of that comparison (the second with a different junction serving order).
const routingPairs = new Map();
// Who may need help (docs/design/assisted-evacuation.md option A; js/sim.js needsHelp; SOURCE_NOTES NH1–NH6).
// Public counts by zone, reported only: nobody in the simulator waits for a pickup.
// Open or closed, kept across the results panel's re-renders during playback ($('results').innerHTML is replaced every frame).
let needsHelpOpen = false;
// The click, not the toggle event: toggle fires after the next re-render may already have replaced the element.
$('results').addEventListener('click', e => { const sm = e.target.closest?.('details.needs-help > summary'); if (sm) needsHelpOpen = !sm.parentElement.open; });
function needsHelpPanel(S) {
  const N = S.needsHelp; if (!N) return '';
  const T = N.pickupMin, G = N.groups, r = o => `${fmt(o.range[0])}–${fmt(o.range[1])}`, v = o => `${fmt(o.value)} <span class="muted">(${r(o)})</span>`;
  const rows = [
    ['People who may need a wheelchair van or ambulance', G.specialized, r, 'derived', 'A range, not an estimate: the low end applies the City\'s emPOWER count (348 Medicare beneficiaries using electricity-dependent equipment, Time Study §3.8) as a share of residents; the high end the Time Study survey\'s 1.6% wheelchair van and 0.2% ambulance (Appendix D). The sources disagree, so both are shown (SOURCE_NOTES NH2).'],
    ['People with an ambulatory difficulty', G.ambulatory, v, 'derived', 'ACS 2020–2024 B18105, tract level, applied to each zone. A difficulty walking or climbing stairs, not a confirmed need for help. Range: ±90% margin of error.'],
    ['People 75 and older', G.age75, v, 'derived', 'ACS 2020–2024 B01001, block groups allocated to zones. Range: ±90% margin of error.'],
    ['Licensed beds in care homes, nursing facilities and hospitals', G.facilityBeds, o => fmt(o.value), 'derived', 'The ember columns spread each zone\'s licensed capacity evenly over its households\' streets (assumption): they do not say whether embers reached any particular facility, whose locations are not kept. The Time Study plans vehicles at medical facilities 90 minutes after the order.'],
  ];
  const cell = (o, f) => f(o);
  return `<details class="needs-help"${needsHelpOpen ? ' open' : ''}><summary>Who may need help: ${r(G.specialized.transitDependent)} people who may need a wheelchair van or ambulance live on streets embers reached within ${T.transitDependent / 60} hours of their zone's order ${badge('derived')}</summary>
    <p class="small">People in zones this run ordered or warned, from public counts by zone. The two right-hand columns count those on streets embers reached before the 2025 Evacuation Time Study's planned pickup: ${T.facilities} minutes after the order at medical facilities and schools, ${T.transitDependent} on transit-dependent pickup routes ${badge('sourced', 'ets.txt §2.4 4.a–c, p. 2-7')}. The simulator runs no pickups, paratransit or facility evacuations: everyone counted here is also among the synthetic households above, which leave on the survey's timing as if they needed no help. Not a prediction and not a casualty count.</p>
    <table class="kv"><tr><th></th><th class="num">In ordered or warned zones</th><th class="num">Embers within ${T.facilities} min of the order</th><th class="num">Within ${T.transitDependent} min</th></tr>
    ${rows.map(([label, g, f, cat, note]) => `<tr><td>${label} ${badge(cat, note)}</td><td class="num">${cell(g.inZones, f)}${g === G.facilityBeds ? ' ' + badge('sourced', 'CDSS and CDPH licensed capacity by zone, summed over the zones ordered or warned: licensed capacity, not occupancy.') : ''}</td><td class="num">${cell(g.facilities, f)}</td><td class="num">${cell(g.transitDependent, f)}</td></tr>`).join('')}
    </table>
    <p class="small muted">Each zone's counts are spread evenly over its synthetic households' streets ${badge('assumption')}, and a buyout removes its share of the zone's residents (not its facilities); ${fmt(N.zonesUsed)} of the ${fmt(N.zonesTold)} zones ordered or warned have ACS figures. Ember arrival is at the middle of each street. Same under both plans when the plans order the same zones at the same times. Design: <code>docs/design/assisted-evacuation.md</code>.</p></details>`;
}
function routingPanel(sim, S, done) {
  const mode = routingOf(sim.plan); if (mode === 'today') return '';
  const R = ROUTING[mode], st = S.routing, base = mode === 'habit' ? 'today' : 'habit';
  const tr = (label, value, tip) => `<tr title="${esc(tip)}"><td>${label} <span class="tip">ⓘ</span></td><td class="num">${value}</td></tr>`;
  let html = `<h3>Driver information and routing ${badge(R.category)}</h3><p class="small">${esc(R.short)}: ${fmt(st.followers)} of ${fmt(st.drivers)} cars ${mode === 'habit' ? 'drive by habit; the rest follow Today\'s model' : 'follow it; the rest drive by habit'} (share ${fmt(st.share * 100)}% ${badge('assumption')}).`
    + (mode === 'guided' ? ` Guidance decisions (one per junction per minute where a following car needed a route): a load-balancing route ${fmt(st.offered)} times; a route safer under the forecast than the driver's own ${fmt(st.safety)} times; an equally safe, faster route ${fmt(st.faster)} times; nothing, so the driver kept their own route, ${fmt(st.declined)} times.` : '')
    + (mode === 'system' ? ' <b>Comparison only:</b> this option can send some households on slower or riskier routes, which is why it is not a recommended design.' : '') + '</p>';
  if (!done) return html + '<p class="small muted">Households worse off appear here when the run is complete.</p>';
  const key = JSON.stringify([sim.scenario.id, sim.sevKey, sim.seed, $('tod').value, sim.plan, world()]);
  let P = routingPairs.get(key);
  if (!P) {
    P = { runs: [], mine: sim.householdOutcomes() }; routingPairs.set(key, P);
    const batch = ++state.batch, plan = { ...sim.plan, routing: base, compliance: 1, name: ROUTING[base].short };
    const job = { scenarioId: sim.scenario.id, sev: sim.sevKey, seed: sim.seed, tod: $('tod').value, plan, world: world(), outcomes: true };
    const on = ev => { const m = ev.data; if (m.batch !== batch) return; if (m.done) { worker.removeEventListener('message', on); P.ready = true; if (state.sim === sim) update(false); return; } P.runs.push(m.outcomes); };
    worker.addEventListener('message', on);
    worker.postMessage({ batch, jobs: [job, { ...job, reshuffle: true }, { ...job, plan: { ...sim.plan }, reshuffle: true }] });
  }
  const thr = data.A.routing.worseOffDelayMin;
  if (!P.ready) return html + `<p class="small muted">Checking households worse off against ${esc(ROUTING[base].short)}: three background runs of the same fire, households and seed…</p>`;
  const w = worseOff(P.runs[0], P.mine, thr), wb = worseOffBeyondChance(P.runs[0], P.runs[1], P.mine, P.runs[2], thr), floor = worseOff(P.runs[0], P.runs[1], thr), better = worseOff(P.mine, P.runs[0], thr);
  if (!w) return html;
  return html + `<table class="kv">
    ${tr(`Households worse off than under ${esc(ROUTING[base].short)}`, fmt(w.households), `Same fire, households, parked cars and seed; only routing differs. Worse off: still there when embers or the fire front reached them, or cut off, where they were not under ${ROUTING[base].short}, or leaving the order and warning area more than ${thr} min later or not at all (model rule).`)}
    ${tr('…beyond chance: worse off in both of two junction serving orders', `${fmt(wb.households)}${wb.later ? ` · worst ${fmt(wb.worstDelayMin)} min later` : ''}`, 'This run and a rerun with another order of serving cars at junctions, against the comparison and its rerun: a household counts only if it does worse in both runs than in both comparison runs. This filters out most households whose outcome changed by the luck of reaching a junction first.')}
    ${tr('…of these, newly still there when embers or the fire front arrived, or cut off', fmt(wb.embers + wb.fireFront + wb.cutOff), 'Households whose outcome level got worse, not only their arrival time.')}
    ${tr('Chance alone: households "worse off" when only the junction serving order changes', fmt(floor.households), `Two runs of ${ROUTING[base].short} that differ only in the order cars are served at junctions. A count near this one is within chance.`)}
    ${tr(`Households better off than under ${esc(ROUTING[base].short)} · average change in model time to leave the order area`, `${fmt(better.households)} · ${w.meanGainMin == null ? '—' : `${w.meanGainMin >= 0 ? fmt(w.meanGainMin, 1) + ' min faster' : fmt(-w.meanGainMin, 1) + ' min slower'}`}`, 'Average over households that left the order and warning area in both runs.')}
  </table><p class="small muted">Synthetic households on an illustrative fire: a comparison, not a prediction.</p>`;
}

function showScenario() {
  const sc = scenario();
  $('scenario-blurb').innerHTML = `${esc(sc.blurb)} <span class="badge b-${sc.kind === 'historical reference' ? 'sourced' : 'rule'}">${sc.kind}</span>`;
  $('scenario-sources').innerHTML = sc.sources.map(s => `<li>${esc(s)}</li>`).join('') + (sc.calibration ? `<li><b>Calibration:</b> ${esc(sc.calibration)}</li>` : '') + `<li>Ignition: ${esc(sc.ignitionLabel)}; ${sc.windSchedule ? `wind ${sc.windSchedule.map(w => `from ${w.windFrom}° at ${w.windMph} mph from minute ${w.fromMin}`).join(', ')}` : `wind from ${sc.windFrom}° at ${sc.windMph} mph`}; runs ${sc.durationMin} min.</li>` + (sc.windSource ? `<li>Wind: ${esc(sc.windSource)}.</li>` : '');
  $('tod').value = sc.timeOfDay; todNote();
  $('scrub').max = sc.durationMin;
  syncFamilies(); // the starting points shown on the map belong to this fire
}
$('scenario').onchange = () => { showScenario(); newRun(); };
const todNote = () => { $('tod-note').textContent = TIME_OF_DAY[$('tod').value].note; };
$('growth').onchange = () => { growthNote(); r0Note(); newRun(); };
mixNote();
['severity', 'seed', 'tod'].forEach(id => $(id).onchange = () => { todNote(); newRun(); });
$('street-mode').onchange = e => { map.streetMode = e.target.value; map.draw(); legend(); };
$('speed').onchange = e => { state.speed = +e.target.value; state.playRate = null; };
$('run').onclick = () => { if (state.sim.t >= state.sim.end) newRun(); state.playing = !state.playing; state.playRate = null; state.playAt = null; runLabel(state.playing ? '❚❚ Pause' : '▶ Run'); update(false); };
$('reset').onclick = () => newRun();
$('map-run').onclick = () => $('run').click();
$('map-reset').onclick = () => newRun();
function runLabel(t) { $('run').textContent = t; $('map-run').textContent = t; }
$('scrub').oninput = e => seek(+e.target.value * 60);
$('search').onchange = e => {
  const SUF = { AVENUE: 'AV', AVE: 'AV', WAY: 'WY', STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', PLACE: 'PL', COURT: 'CT', LANE: 'LN', BOULEVARD: 'BL', TERRACE: 'TE', PATH: 'PA', WALK: 'WK' };
  const name = e.target.value.toUpperCase().trim().replace(/\b(\w+)$/, w => SUF[w] || w);
  const es = data.net.edges.filter(x => x.name === name);
  if (!es.length) return;
  const pts = es.map(x => data.edgeMid[x.id]); const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  map.selected = { kind: 'edge', id: es[Math.floor(es.length / 2)].id }; map.zoomTo(cx, cy, 1500); inspect(map.selected);
};
$('nbhd').onchange = e => {
  const n = data.layers.neighborhoods.find(x => x.name === e.target.value);
  if (!n) { map.fit(); map.draw(); return; } // "All of Berkeley": back to the full view
  const r = n.rings[0]; const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  map.fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); map.draw();
};

// ---------- simple view ----------
// Two tabs (Eric, 2026-11-02). "Today's plan": pick a fire and watch today's plan (only today's plan); every number on
// screen comes from the run the user started. When it ends, the page invites them to explore changes.
// "Change the plan": stack changes and compare them with today's plan in 15 passes (a pass runs both plans on the same fire and households). The
// stored mitigation table is never shown as an answer: it only greys out changes that did not
// reliably help on this fire (js/mitigate.js stored), so people see they were considered.
// A single pass can point the wrong way, so a comparison always runs all 15 passes and only the full
// set earns a verdict; a run watched on the map is labeled as one run.
Object.assign(state, { tab: 'spread', view: { spread: 'ember', routes: 'ways', access: 'wayout' }, goal: {}, picked: new Set(), todayCache: new Map(), stackRuns: new Map(), tries: [], tryBatch: null, families: false });
// todayCache: today's plan, keyed `${fire}|${member}|${severity}|${seed}`; stackRuns: measures of any stack of changes, keyed
// `${fire}|${member}|${stack key}|${severity}|${seed}` (Break down this plan reuses them). member is a fire family member
// (js/scenarios.js familyOf); with families off every pass runs the fire's default member, which is the fire as it is.
const leverById = id => mit()?.levers.find(l => l.id === id);
const pickedLevers = () => [...state.picked].map(leverById).filter(Boolean);
const simDone = () => state.sim && state.sim.t >= state.sim.end;
// How fast the fire moves (Eric, 2026-11-02: "a fine line between alarmist and complacency"; SOURCE_NOTES S19).
// Guided view offers two historical paces: medium severity, calibrated to the City's 1923 repeat (the
// default), and high severity, whose front in this model is a median 1.2 to 1.5 miles downwind (by fire; runs 0.99–1.60; 2025 zones, SOURCE_NOTES FV18) 64 minutes after
// ignition, the pace of the 1991 fire ("more than a mile" in 64 minutes). Low stays in Expert view.
// It changes the watched run only; comparisons already run low, medium and high.
const PACE = {
  central: { label: 'Like 1923 (the City\'s repeat)', short: '1923 pace (medium severity)',
    tip: 'Medium severity, calibrated to the City StoryMap\'s present-day repeat of the 1923 fire: about 5 h from the eastern edge to Shattuck Ave. In this model the front is downwind a median of about half a mile (0.5 to 0.7 mi by fire, five seeds each) 64 minutes after ignition; single runs range from 0.4 to 0.9 mi.' },
  high: { label: 'Like 1991', short: '1991 pace (high severity)',
    tip: 'High severity: twice the medium spread rate, with embers carried farther. In this model the front is downwind a median of 1.2 to 1.5 miles (by fire, five seeds each) 64 minutes after ignition; single runs range from about 1.0 to 1.6 mi. The 1991 Oakland-Berkeley Hills fire was more than a mile downwind 64 minutes after it broke out (US Fire Administration report). After the first hour the model\'s front slows to a fifth of its speed, as the 1991 head did: it advanced "only three quarters of a mile in the next seven hours".' },
};
state.pace = PACE[localStorage.getItem('bhe-pace')] ? localStorage.getItem('bhe-pace') : 'central';
const paceHTML = () => `<div class="pace"><span class="small"><b>How fast the fire moves:</b></span> ${Object.entries(PACE).map(([k, v]) => `<button class="pace-pick${state.pace === k ? ' on' : ''}" data-pace="${k}" title="${esc(v.tip)}">${esc(v.label)}</button>`).join('')}
  <div class="small muted">Both paces have happened in these hills. Neither is a forecast. Hover for what each means in the model.</div>
  <div class="small muted"><b>Fire crews:</b> both paces come from real fires (1923, 1991), so they include what firefighters achieved against the fire's front in those fires. In a wind-driven fire, the Fire Department expects crews to focus on helping people evacuate.</div></div>`;
function setPace(k) {
  state.pace = k; localStorage.setItem('bhe-pace', k);
  $('severity').value = k; newRun(); renderSimple();
}

// ---------- fire families (opt-in; docs/design/fire-families.md, SOURCE_NOTES FF1–FF18) ----------
// Off by default. Checking the box opens the disclosure first; families take effect only after "Use them".
// With families on, a comparison runs every member of the fire (ignition point × wind from 0°, 30°, 45°, 60°);
// Today's plan tab still watches the fire as it is. Users never move a start or set a wind.
const NOTES_URL = 'https://github.com/ericdf/berkeley-wildfire-evacuation-explorer/blob/main/SOURCE_NOTES.md#ignition-points-and-wind-directions-for-fire-families-public-sources-2026-11-02';
const scenById = id => scenarios.find(s => s.id === id);
const familyPoints = sc => [...new Map(familyOf(sc, data).map(m => [m.point, m])).values()];
const famHTML = () => `<label class="small famopt"><input type="checkbox" class="fam-box"${state.families ? ' checked' : ''}> Also test other likely starting points and wind directions</label>
  ${state.families ? `<div class="small muted">On: a comparison tries this fire from ${famStarts(scenario())} and with wind from ${familyWinds(scenario()).map(w => `${w}°`).join(', ')}; red circles on the map mark the starts, with a line toward each wind. <button class="linkish fam-about">What this means</button></div>` : ''}`;
const famStarts = sc => { const n = familyPoints(sc).length; return n > 1 ? `${n} starting points` : 'its usual starting point'; };
function disclose(after) {
  const sc = scenario(), pts = familyPoints(sc);
  modal(`<h2>Other likely starting points and wind directions</h2>
    <p>Fires start in different places and burn under different winds. With this on, a comparison also tries the fire from ${famStarts(sc)} and from ${familyWinds(sc).map(w => `${w}°`).join(', ')} (most dry, windy hours at the Oakland hills weather station blow from 20° to 70°, and about one in six from the north, 340° to 20°). The starts are places where fires here have started or where the County's fire-pathway study shows fire entering Berkeley. They are our choices; no source says where the next fire will start or how likely each start is, so each counts equally. A comparison takes longer.</p>
    <p class="small"><b>${esc(FIRES.find(f => f.id === sc.id)?.title || sc.name)}</b> ${badge('assumption', 'Points and winds are this project\'s choices, anchored to the sources listed. Speed, severity, time of day, duration and Berkeley\'s evacuation orders stay the fire\'s.')}</p>
    <ul class="small">${pts.map(p => `<li>${esc(p.label)}${p.source ? `. ${esc(p.source)}` : ''}</li>`).join('')}</ul>
    <p class="small">Berkeley's orders stay the scenario's, so a fire that starts elsewhere can burn into Berkeley zones nobody ordered; the comparison shows what each plan does then. Other cities and the County order their zones once the fire comes within ${data.A.orders.firePathKm} km ${badge('model rule', 'The distance is an assumption (Eric\'s choice, 2026-11-02, after comparing 2 km and 1 km); no source gives when Oakland, El Cerrito, Kensington, Albany or the County order a zone. Their cars join the traffic. SOURCE_NOTES FO1–FO6.')}, for every start. Today's plan tab still shows the fire as it is. Sources: <a href="${NOTES_URL}" target="_blank" rel="noopener">SOURCE_NOTES FF1–FF18, FO1–FO6, WC9</a>.</p>
    <div class="btns">${after ? '<button id="fam-cancel">Cancel</button> <button class="primary" id="fam-use">Use them</button>' : '<button id="fam-cancel">Close</button>'}</div>`);
  $('fam-cancel').onclick = () => { $('modal').close(); syncFamilies(); };
  if ($('fam-use')) $('fam-use').onclick = () => { $('modal').close(); setFamilies(true); };
}
function setFamilies(on) {
  if (state.families === on) return syncFamilies();
  state.families = on; cancelTry(); syncFamilies();
  if (document.body.classList.contains('simple')) renderSimple();
}
// The opt-in boxes (Guided view, Expert Scenario section) and the map marks follow state.families.
function syncFamilies() {
  document.querySelectorAll('.fam-box').forEach(b => b.checked = state.families);
  $('families').checked = state.families;
  $('families-note').innerHTML = state.families ? `On: Compare (this scenario, low / medium / high) tries this fire from ${famStarts(scenario())} and with wind from ${familyWinds(scenario()).map(w => `${w}°`).join(', ')}, one pass per start, wind and severity (seeds added until there are at least 15). <button class="linkish fam-about">What this means</button>` : '';
  document.querySelectorAll('.fam-about').forEach(b => b.onclick = () => disclose(false));
  map.family = state.families ? familyPoints(scenario()).map(p => ({ ignition: p.ignition, winds: familyWinds(scenario()) })) : [];
  map.draw();
}
const famBox = b => b.onchange = () => { if (b.checked) { b.checked = false; disclose(true); } else setFamilies(false); };
famBox($('families'));

// Four guided questions (product brief, Eric 2026-11-06; js/explore.js). The fire scenario picked at the top applies to all four.
// "Set a goal" (js/goal.js) is not offered: its stored table predates the current model and ranks by clearance time (SOURCE_NOTES SA11).
const FIRE_TITLE = () => FIRES.find(f => f.id === state.fire)?.title || state.fire;
function renderSimple() {
  homePlayback(); // out of #simple before it is rebuilt; moved back into the tab below
  const q = QUESTIONS.find(x => x.id === state.tab) || QUESTIONS[0];
  const tabs = `<div class="tabs qtabs">${QUESTIONS.map((x, i) => `<button data-tab="${x.id}" class="${x.id === q.id ? 'on' : ''}" title="${esc(x.title)}"><span class="step">${i + 1}</span> ${esc(x.tab)}</button>`).join('')}</div>`;
  $('simple').innerHTML = fireHeadHTML() + tabs + `<h2 class="qtitle">${esc(q.title)}</h2>` + (q.id === 'changes' ? tryHTML() : questionHTML(q.id));
  $('simple').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('simple').querySelectorAll('.fire-pick').forEach(b => b.onclick = () => pickFire(b.dataset.fire));
  $('simple').querySelectorAll('.pace-pick').forEach(b => b.onclick = () => setPace(b.dataset.pace));
  $('simple').querySelectorAll('[data-view]').forEach(b => b.onclick = () => { state.view[state.tab] = b.dataset.view; renderSimple(); });
  $('simple').querySelectorAll('[data-area]').forEach(b => b.onclick = () => zoomToArea(b.dataset.area));
  if ($('try-fire')) $('try-fire').onchange = e => pickFire(e.target.value);
  if ($('go-changes')) $('go-changes').onclick = () => showTab('changes');
  if (state.tab === 'changes') wireTry();
  $('simple').querySelectorAll('.fam-box').forEach(famBox); syncFamilies();
  if ($('pb-slot') && document.body.classList.contains('simple')) $('pb-slot').replaceWith($('playback')); // Expert keeps them in its Run section
  $('playback').classList.toggle('today', state.tab !== 'changes');
  questionMap(); showMarks(); renderTries(); inspect(map.selected, true);
}
// Comparisons go at the top of the right-hand panel, where results are read (Eric, 2026-11-02).
function renderTries() {
  const show = state.tab === 'changes';
  $('try-out').innerHTML = (show && state.presetOut ? `<h2>Ready-made comparison</h2>${state.presetOut}` : '') + (show && state.tries.length ? `<h2>Your plan compared with today's plan</h2>${triesHTML()}` : '');
  if ($('bd-go')) $('bd-go').onclick = () => breakdown(state.tries[0]);
}
// The fire scenario, shared by the four questions.
function fireHeadHTML() {
  return `<div class="firehead"><label class="small"><b>Fire scenario</b> <select id="try-fire">${FIRES.map(f => `<option value="${f.id}"${f.id === state.fire ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select></label>
    <div class="small muted">${esc(FIRES.find(f => f.id === state.fire)?.line || '')} The ignition, wind and Berkeley's orders are the scenario's choices, not a forecast of where a fire will start. Oakland, Kensington, Albany and the other neighbors order their own zones once the modeled fire comes within ${data.A.orders.firePathKm} km ${badge('model rule', 'The distance and the 10-minute delay are assumptions (Eric\'s choice, 2026-11-02, after comparing 2 km and 1 km); no source gives when these jurisdictions order a zone. Their cars use the same roads. SOURCE_NOTES FO1–FO6.')}.</div></div>`;
}
// Map layers for each question and view: only what the question needs (product brief, Resident-facing experience 3).
const GUIDED_LAYERS = { terrain: true, contours: true, streets: true, paths: false, evacZones: false, fireZones: false, neighborhoods: false, fire1923: false, cityBoundary: true, stations: false, noParking: false, tightTurns: false, access: false, demand: false, structures: false, fire: false, vehicles: false, queues: false, responder: false };
function questionMap() {
  if (!document.body.classList.contains('simple')) return;
  const q = state.tab, v = state.view[q];
  Object.assign(map.layers, GUIDED_LAYERS);
  map.edgeClass = null; map.edgePalette = null; map.streetMode = 'class';
  // The run-set summary (streets reached across 15 runs) waits until the run on the map has finished, so the
  // map shows one thing at a time: the fire as it plays, then what recurs across runs (Eric, 2026-11-06).
  const done = state.sim && state.sim.t >= state.sim.end;
  state.summaryWaits = !done && (q === 'spread' || (q === 'access' && v === 'wayout'));
  if (state.summaryWaits) { map.streetMode = 'robust'; map.edgeClass = {}; map.edgePalette = ['#a9a9a9']; } // plain gray streets, so the fire stands out
  if (q === 'spread') { map.layers.fire = true; const C = done && edgeClasses(state.fire, v); if (C) { map.streetMode = 'robust'; map.edgeClass = C.cls; map.edgePalette = PALETTE.spread; } }
  else if (q === 'routes') { if (v === 'ways') { map.layers.access = true; map.layers.paths = true; } else { map.streetMode = 'engine'; } }
  else if (q === 'access') {
    if (v === 'wayout') { map.layers.fire = true; if (done && spread()) { map.streetMode = 'robust'; map.edgeClass = areaEdgeClasses(data, state.fire); map.edgePalette = [...PALETTE.access]; map.edgePalette[0] = '#c8c8c8'; } }
    else { map.streetMode = 'engineTime'; map.layers.stations = true; }
  } else { map.layers.fire = true; map.layers.vehicles = true; map.layers.queues = true; }
  map.draw(); legend();
}
function zoomToArea(id) {
  const a = data.access?.byId.get(id); if (!a) return;
  const [x0, y0, x1, y1] = a.bbox; map.fit([x0 - 200, y0 - 200, x1 + 200, y1 + 200]);
  map.selected = { kind: 'edge', id: a.chokeEdges[0] }; inspect(map.selected); map.draw();
}
const H_ = { badge, esc, fmt };
function viewsHTML(q) {
  const V = VIEWS[q]; if (!V) return '';
  return `<div class="views small">Show on the map: ${V.map(([k, l]) => `<button class="${state.view[q] === k ? 'on' : ''}" data-view="${k}">${esc(l)}</button>`).join('')}</div>`;
}
// One run of today's plan, watched on the map (questions 1 and 3).
function watchBlock(what) {
  const today = !state.preset || state.preset.id === 'today', done = today && simDone();
  return `<h3>Watch one run</h3>
    ${paceHTML()}
    <p class="small muted">${what} Today's plan: the first evacuation order 10 minutes after the fire starts and today's street parking, on a fall night. <b>Run</b> plays one simulation from ignition, with one draw of the fire and one set of synthetic households; the clock shows <b>model time</b>, not a forecast. The findings above summarize 15 runs.</p>
    <div id="pb-slot"></div>
    ${done ? '<div class="nudge"><b>Next:</b> see which changes keep connections available in these runs. <button id="go-changes" class="primary">Which changes preserve access? →</button></div>' : ''}`;
}
function questionHTML(q) {
  const fire = state.fire, ft = FIRE_TITLE();
  if (q === 'spread') return `<p class="small">The modeled fire starts at the scenario's ignition point and spreads with its wind, slope and a fuel proxy. Embers fly ahead of the front. Below: which streets the modeled embers and fire front reached across 15 runs of this fire (low, medium and high severity × 5 random seeds), and how consistent that is. Choosing another fire changes every question.</p>
    ${famHTML()}
    ${spreadFindings(H_, data, fire, ft)}
    ${viewsHTML('spread')}
    ${watchBlock('The map colors streets by how often embers (or the front) reached them; the run you watch draws its own fire on top.')}`;
  if (q === 'routes') return `<p class="small">Some hill streets have only one modeled drivable way out: a single link whose closure would leave them with no route for cars. These come from the street network, not from any fire, so they are the same in every scenario. Narrow streets matter because parked cars can leave less room than a fire engine needs.</p>
    ${routesFindings(H_, data)}
    ${viewsHTML('routes')}
    <p class="small muted">${state.view.routes === 'ways' ? 'Blue bands mark streets behind a single way out, darker with more modeled residents behind it; a dark bar marks the entrance (red when it is under 10 ft clear with both sides parked).' : 'Streets are colored by whether a fire engine fits past this run\'s parked cars (one night parking draw, seed 1). Other draws park differently; the findings above cover 5.'} Click a street for its card.</p>`;
  if (q === 'access') return `<p class="small">This question combines the fire scenario with the road network: where the modeled fire front reached a street's only way out, and where parked cars leave no modeled engine route within the City's 5-minute standard. These are potential loss-of-access vulnerabilities in these scenarios.</p>
    ${famHTML()}
    ${accessFindings(H_, data, fire, ft)}
    ${viewsHTML('access')}
    ${watchBlock(state.view.access === 'engine' ? 'Streets are colored by modeled engine drive time from Berkeley\'s 7 stations at ignition, with this run\'s parked cars.' : 'Streets with one way out are colored by how often the modeled fire front reached that way out across 15 runs.')}`;
  return '';
}
// The playback controls' home is Expert view's Run section (index.html #playback).
const homePlayback = () => $('run-section').querySelector('h2').after($('playback'));
const TAB_ALIAS = { watch: 'spread', try: 'changes', goal: 'changes' }; // tab names before the 2026-11-06 reframe
function showTab(t) {
  state.tab = TAB_ALIAS[t] || t;
  // Questions 1–3 watch today's plan only; Changes keeps the plan the user built.
  if (state.tab !== 'changes' && state.preset?.id !== 'today') applyPreset(todayPreset());
  else renderSimple();
  $('simple').scrollTop = 0;
}

// Map outlines for a change: the street segments it rewrites or buys out, or its new road.
function marksOf(l, focus = false) {
  const d = l.delta || {}, E = data.net.edges, out = [];
  for (const id of d.edges?.edges || []) out.push({ geom: E[id].geom, kind: 'street', focus });
  for (const id of d.retreat?.edges || []) out.push({ geom: E[id].geom, kind: 'buyout', focus });
  if (d.link) for (const g of d.link.open ? d.link.open.map(id => E[id].geom) : [d.link.geom]) out.push({ geom: g, kind: 'link', focus });
  return out;
}
function showMarks(focusId) {
  map.marks = document.body.classList.contains('simple') && state.tab === 'changes' ? [...pickedLevers().filter(l => l.id !== focusId), ...(focusId ? [leverById(focusId)] : [])].flatMap(l => marksOf(l, l.id === focusId)) : [];
  map.draw();
}
function zoomToLever(l) {
  const pts = marksOf(l).flatMap(m => m.geom); if (!pts.length) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  map.fit([Math.min(...xs) - 300, Math.min(...ys) - 300, Math.max(...xs) + 300, Math.max(...ys) + 300]); showMarks(l.id);
}

function leverItem(l) {
  const on = state.picked.has(l.id), st = stored(l.id, state.fire);
  const grey = st && !st.reliable;
  const clash = !on && !grey && pickedLevers().map(p => ({ p, why: conflict(p, l) })).find(x => x.why);
  const harm = grey && st.harms.length ? ` It made ${st.harms.map(h => `"${esc(h.label.toLowerCase())}" worse in ${h.worse} of ${h.n}`).join(' and ')}.` : '';
  return `<div class="lever pick${on ? ' on' : ''}${grey ? ' grey' : ''}">
    <div class="lever-h"><label><input type="checkbox" data-lever="${esc(l.id)}"${on ? ' checked' : ''}${grey || clash ? ' disabled' : ''}> <b>${esc(l.title)}</b></label><span class="cost">${esc(costText(l.cost))} ${costBadge(l.cost)}</span></div>
    ${l.what ? `<div class="small">${esc(l.what[0].toUpperCase() + l.what.slice(1))}.</div>` : ''}
    ${grey ? `<div class="small greynote">Tested on this fire in ${st.runs} passes against today's plan: it did not improve any access or exposure measure in every pass, or in three of four with none worse.${harm} Shown so you can see it was considered.${state.families ? ' Tested on this fire\'s usual start and wind.' : ''}</div>` : ''}
    ${clash ? `<div class="small muted">Can't add with “${esc(clash.p.title)}”: ${esc(clash.why)}.</div>` : ''}
    ${marksOf(l).length ? `<button class="linkish" data-show="${esc(l.id)}">Show on map</button>` : ''}
    ${l.cannotMeasure ? `<details class="cant"><summary>What the simulator can't tell you</summary>${esc(l.cannotMeasure)}</details>` : ''}
  </div>`;
}

function tryHTML() {
  const M = mit();
  if (!M) return '<p class="small muted">The list of changes (data/model/mitigations.json) did not load.</p>';
  const all = M.levers.filter(stackable), picked = pickedLevers(), p = state.preset, n = passesFor(state.fire).length;
  const running = state.tryBatch != null;
  return `<p class="small">Pick a change and compare it with today's plan on this fire scenario. Start with one change at a time. A comparison makes ${n} paired runs, or passes (${state.families ? passWords(state.fire, passesFor(state.fire)) : `low, medium and high severity × ${M.meta.seeds.length} random seeds`}): each pass runs today's plan and your plan on the same fire, the same synthetic households, the same parked cars and the same seed, so only the change differs. The answer leads with access: whether a modeled connection stays available, hill residents with no engine route or none within 5 minutes, cars with no open route, and residents behind a single way out. Each line says whether its direction is consistent, mixed or sensitive across the passes.</p>
    ${famHTML()}
    ${paceHTML()}
    <div class="yourplan"><b>Your plan:</b> today's plan${picked.length ? ' + ' + picked.map(l => esc(l.title)).join(' + ') : ', nothing changed yet'}
      <div class="btns"><button id="watch-today2">▶ Watch today's plan</button><button id="watch-mine"${picked.length ? '' : ' disabled'}>▶ Watch your plan</button>
      <button id="try-compare" class="primary"${picked.length && !running ? '' : ' disabled'}>Compare with today's plan (${n} passes)</button>${picked.length ? ' <button id="try-clear">Clear</button>' : ''}</div>
      ${picked.length ? '' : '<p class="small muted">Pick at least one change below to make your plan.</p>'}
      <div id="pb-slot"></div>
      <p class="small muted">Watching makes a single run against the fire scenario, on model time. Compare uses ${n} passes, because one pass can point the wrong way.</p>
      <p class="small muted">On the map: <span class="mk" style="background:#15803d"></span>street changed, <span class="mk" style="background:repeating-linear-gradient(90deg,#15803d 0 4px,transparent 4px 7px)"></span>new road, <span class="mk" style="background:#7e22ce"></span>bought out. Point at a change to see where it is.${state.families ? ` Red circles mark the starting points the comparison tries, with lines for winds from ${familyWinds(scenario()).map(w => `${w}°`).join(', ')}.` : ''}</p></div>
    ${state.tries.length ? '<p class="small"><b>Your comparisons are at the top of the right-hand panel →</b></p>' : ''}
    ${GROUPS.map(([phase, sub]) => `<h3 class="phase">${esc(phase)}</h3>` + sub.map(([title, groups]) => { const ls = all.filter(l => groups.includes(l.group)); return ls.length ? `<h4>${esc(title)}</h4>${ls.map(leverItem).join('')}` : ''; }).join('')).join('')}
    <details${p && !['today', 'try'].includes(p.id) ? ' open' : ''}><summary>Ready-made comparisons</summary>${presetsHTML()}</details>`;
}

function presetsHTML() {
  const p = state.preset, fire = FIRES.find(f => f.id === state.fire);
  return `${p && !['today', 'try'].includes(p.id) ? `<div class="chosen"><div class="plans-ab"><div><b>Plan A</b> ${esc(p.A.name.replace(/^A: /, ''))}</div><div><b>Plan B</b> ${esc(p.B.name.replace(/^B: /, ''))}</div>
      <div class="small muted">${esc(scenario().name)} · ${p.tods ? 'time of day as set' : esc(TIME_OF_DAY[p.tod].label)} · ${esc(PACE[state.pace].short)}</div></div>
      <div class="watch"><b>What to look for.</b> ${esc(p.on[state.fire])}</div>
      <div class="btns"><button data-watch="A" class="${state.editing === 'A' ? 'on' : ''}">▶ Watch Plan A</button><button data-watch="B" class="${state.editing === 'B' ? 'on' : ''}">▶ Watch Plan B</button>
      <button class="primary" id="simple-compare">Compare A and B (9 passes)</button> <button id="simple-close">✕ Close</button></div>
      ${state.presetOut ? '<p class="small"><b>The answer is at the top of the right-hand panel →</b></p>' : ''}
      <p class="small muted">Compare makes 9 passes (low, medium and high severity, 3 random seeds each); each pass runs both plans on the same fire and households. It takes a few minutes and puts the answer at the top of the right-hand panel. Trust a difference that shows up in every pass.</p></div>` : ''}
    <div class="presets">${PRESETS.filter(q => !q.hidden).map(q => { const ok = q.on[state.fire]; return `<button class="preset${p?.id === q.id ? ' on' : ''}" data-id="${q.id}"${ok ? '' : ' disabled'}><b>${esc(q.title)}</b><span>${esc(q.question)}</span>${ok ? '' : `<span class="why">Not offered on ${esc(fire.title)}: ${esc(q.off[state.fire])}</span>`}</button>`; }).join('')}</div>
    <p class="small muted">These questions use their own Plan A and time of day. The Expert switch at the top lets you set everything yourself.</p>`;
}

function wireTry() {
  const S = $('simple');
  S.querySelectorAll('[data-lever]').forEach(b => b.onchange = () => { b.checked ? state.picked.add(b.dataset.lever) : state.picked.delete(b.dataset.lever); cancelTry(); renderSimple(); });
  $('try-compare').onclick = compareStack;
  S.querySelectorAll('[data-show]').forEach(b => b.onclick = () => zoomToLever(leverById(b.dataset.show)));
  S.querySelectorAll('.lever.pick').forEach(c => { const id = c.querySelector('[data-lever]')?.dataset.lever; c.onmouseenter = () => showMarks(id); c.onmouseleave = () => showMarks(); });
  $('watch-mine').onclick = () => watch('mine');
  $('watch-today2').onclick = () => watch('today');
  if ($('try-clear')) $('try-clear').onclick = () => { state.picked.clear(); cancelTry(); renderSimple(); };
  S.querySelectorAll('.preset').forEach(b => b.onclick = () => { if (!b.disabled) applyPreset(b.dataset.id); });
  const p = state.preset;
  S.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => { state.editing = b.dataset.watch; showPlan(); if (p.tods) { $('tod').value = p.tods[state.editing]; todNote(); } newRun(); renderSimple(); play(); });
  if ($('simple-compare')) $('simple-compare').onclick = () => { $('cmp-scope').value = 'severities'; $('compare').click(); };
  if ($('simple-close')) $('simple-close').onclick = () => applyPreset(todayPreset());
}
function play() { state.playing = true; runLabel('❚❚ Pause'); }

// Watch today's plan, or the user's stack (Plan B), on the map: one run, central severity, seed 1.
function watch(which) {
  if (which === 'today') applyPreset(todayPreset());
  else {
    const st = stackOf(pickedLevers());
    applyPreset({ id: 'try', title: 'Your plan', tod: 'S6', A: { ...DEFAULT_PLAN, name: "A: today's plan" }, B: { ...st.plan, name: 'B: your plan' }, on: {}, off: {}, headline: null, always: true, stack: st });
    state.editing = 'B'; showPlan(); newRun(); renderSimple();
  }
  play();
}

// ---------- try changes: comparison ----------
// A small pool of workers (the map stays responsive); today's plan results are cached per fire,
// severity and seed, so later comparisons on the same fire run only the user's plan.
let pool = null;
const workers = () => pool ??= Array.from({ length: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) }, () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
function cancelTry() {
  if (state.tryBatch == null) return;
  for (const w of pool || []) w.postMessage({ cancel: state.tryBatch });
  state.tryBatch = null; $('sim-banner').hidden = true;
  state.tries = state.tries.filter(t => t.done); // an unfinished comparison earns no verdict
  for (const t of state.tries) if (t.bd?.running) delete t.bd; // nor does an unfinished breakdown
}
// The passes of a comparison on a fire (js/scenarios.js comparisonCases): severities × seeds of the stored
// table with families off; every family member × severity, with seeds added to reach 15, with families on.
const passesFor = (fire, families = state.families) => comparisonCases(scenById(fire), data, { families, severities: mit().meta.severities, seeds: mit().meta.seeds });
// What a set of passes covers, read from the passes themselves, so a finished comparison keeps its own
// description when the families box changes afterwards (Codex review of PR #35).
function passWords(fire, cases) {
  const fam = familyOf(scenById(fire), data), used = fam.filter(m => cases.some(c => c.member === m.id));
  const pts = new Set(used.map(m => m.point)).size, seeds = new Set(cases.map(c => c.seed)).size;
  return `${pts > 1 ? `${pts} starting points × ` : ''}winds from ${[...new Set(used.map(m => m.windFrom))].sort((a, b) => a - b).map(w => `${w}°`).join(', ')} × low, medium and high severity${seeds > 1 ? ` × ${seeds} random seeds` : ', one random seed'}`;
}
const secs = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
function compareStack() {
  const M = mit(), levers = pickedLevers(); if (!levers.length) return;
  cancelTry(); cancelCompare();
  const st = stackOf(levers), fire = state.fire, W = world();
  const cases = passesFor(fire);
  const T = { fire, titles: levers.map(l => l.title), ids: levers.map(l => l.id), n: cases.length, A: {}, B: {}, done: false, cases, families: state.families, t0: performance.now() };
  for (const c of cases) if (state.todayCache.has(c.key)) T.A[c.key] = state.todayCache.get(c.key);
  const base = { scenarioId: fire, tod: 'S6' };
  const jobs = [...cases.filter(c => !T.A[c.key]).map(c => ({ ...base, member: c.member, sev: c.sev, seed: c.seed, key: c.key, side: 'A', plan: { ...DEFAULT_PLAN, name: "A: today's plan" }, world: W })),
    ...cases.map(c => ({ ...base, member: c.member, sev: c.sev, seed: c.seed, key: c.key, side: 'B', plan: { ...st.plan, name: 'B: your plan' }, world: { ...W, ...st.world }, net: st.net }))];
  state.tries.unshift(T); state.tries.length = Math.min(state.tries.length, 6);
  const batch = ++state.batch; state.tryBatch = batch;
  const ws = workers(), parts = ws.map(() => []); jobs.forEach((j, i) => parts[i % ws.length].push(j));
  let passes = cases.filter(c => T.A[c.key] && T.B[c.key]).length, finished = 0;
  const progress = () => { $('sim-banner').hidden = false; $('sim-banner-text').textContent = `Comparing your plan with today's plan: ${passes} of ${cases.length} passes done (each pass runs both plans)…`; $('sim-banner-bar').style.width = `${Math.round(100 * passes / cases.length)}%`; };
  progress(); renderSimple(); $('try-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  ws.forEach((w, i) => {
    w.onmessage = ev => {
      const m = ev.data; if (m.batch !== batch || state.tryBatch !== batch) return;
      if (m.done) { if (++finished === ws.length) { T.done = true; T.ms = performance.now() - T.t0; state.tryBatch = null; $('sim-banner').hidden = true; renderSimple(); } return; }
      const v = Object.fromEntries(Object.entries(MEASURES).map(([k, d]) => [k, d.f(m.summary)]));
      T[m.job.side][m.job.key] = v; if (m.job.side === 'A') state.todayCache.set(m.job.key, v);
      if (m.job.side === 'B') state.stackRuns.set(`${fire}|${m.job.member}|${st.key}|${m.job.sev}|${m.job.seed}`, v);
      if (T.A[m.job.key] && T.B[m.job.key]) passes++; progress(); renderTries();
    };
    w.postMessage({ batch, jobs: parts[i] });
  });
}

// A pass counts as better or worse only when the two scenarios differ by more than 1% (Eric, 2026-11-02:
// "tiny differences can be noise"). A run that never reaches 90% clearance (null) differs from one that does.
const NOISE = 0.01;
const tolSame = (a, b) => a === b || (a != null && b != null && Math.abs(a - b) <= NOISE * Math.max(Math.abs(a), Math.abs(b)));
const asNum = x => x == null ? Infinity : x;
const median = xs => { const s = xs.map(asNum).sort((a, b) => a - b), n = s.length; if (!n) return null; const v = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; return Number.isFinite(v) ? v : null; };
// ---------- break down this plan ----------
// For each change in a finished comparison (two or more changes): what it does alone against today's
// plan, and what the user's plan loses without it, each over the same passes. Overlap shows as a
// change that helps alone but adds nothing on top of the rest (Eric, 2026-11-02: "is there a way to
// say which element of the stack had which effect … It's not great if people have to try multiple
// combinations to discover serious candidates"). SOURCE_NOTES MS14.
const bdVariants = T => {
  const ls = T.ids.map(leverById), out = new Map();
  for (const l of ls) { out.set(stackOf([l]).key, [l]); const rest = ls.filter(x => x !== l); out.set(stackOf(rest).key, rest); }
  return out;
};
const runKey = (T, vk, c) => `${T.fire}|${c.member}|${vk}|${c.sev}|${c.seed}`;
const bdMissing = T => [...bdVariants(T)].flatMap(([vk, ls]) => T.cases.filter(c => !state.stackRuns.has(runKey(T, vk, c))).map(c => ({ vk, ls, c })));
function breakdown(T) {
  cancelTry(); cancelCompare();
  const W = world(), base = { scenarioId: T.fire, tod: 'S6' };
  const jobs = bdMissing(T).map(({ vk, ls, c }) => { const st = stackOf(ls);
    return { ...base, member: c.member, sev: c.sev, seed: c.seed, key: runKey(T, vk, c), side: 'S', plan: { ...st.plan, name: 'B: part of your plan' }, world: { ...W, ...st.world }, net: st.net }; });
  T.bd = { running: true, got: 0, total: jobs.length };
  const progress = () => { $('sim-banner').hidden = !T.bd?.running; $('sim-banner-text').textContent = `Breaking down your plan: ${T.bd?.got ?? 0} of ${jobs.length} simulations done…`; $('sim-banner-bar').style.width = `${Math.round(100 * (T.bd?.got ?? 0) / Math.max(1, jobs.length))}%`; };
  const finish = () => { T.bd.running = false; state.tryBatch = null; $('sim-banner').hidden = true; renderTries(); };
  if (!jobs.length) { finish(); return; }
  const batch = ++state.batch; state.tryBatch = batch;
  const ws = workers(), parts = ws.map(() => []); jobs.forEach((j, i) => parts[i % ws.length].push(j));
  let finished = 0; progress(); renderTries();
  ws.forEach((w, i) => {
    w.onmessage = ev => {
      const m = ev.data; if (m.batch !== batch || state.tryBatch !== batch || !T.bd) return;
      if (m.done) { if (++finished === ws.length) finish(); return; }
      state.stackRuns.set(m.job.key, Object.fromEntries(Object.entries(MEASURES).map(([k, d]) => [k, d.f(m.summary)])));
      T.bd.got++; progress();
    };
    w.postMessage({ batch, jobs: parts[i] });
  });
}
// Tally lower-is-better pairs with the 1% noise rule: how often x beats y.
function tally(xs, ys) { let better = 0, worse = 0; for (let i = 0; i < xs.length; i++) { if (tolSame(xs[i], ys[i])) continue; asNum(xs[i]) < asNum(ys[i]) ? better++ : worse++; } return { better, worse, n: xs.length }; }
const holds = t => t.better === t.n, mostly = t => t.worse === 0 && t.better >= Math.ceil(0.75 * t.n);
function breakdownHTML(T) {
  const ls = T.ids.map(leverById), keys = T.cases.map(c => c.key);
  const run = (vk, c) => state.stackRuns.get(runKey(T, vk, c));
  const today = m => keys.map(k => T.A[k][m]), full = m => keys.map(k => T.B[k][m]);
  const v = (m, x) => x == null ? '—' : fmt(x);
  const rows = ls.map(l => {
    const rest = ls.filter(x => x !== l), aK = stackOf([l]).key, wK = stackOf(rest).key;
    const per = Object.keys(MEASURES).filter(m => !MEASURES[m].time).map(m => { // model time never decides a verdict (product brief)
      const alone = T.cases.map(c => run(aK, c)[m]), without = T.cases.map(c => run(wK, c)[m]);
      return { m, alone, without, ta: tally(alone, today(m)), tc: tally(full(m), without) };
    });
    const own = per.filter(p => holds(p.tc)), helps = per.filter(p => holds(p.ta) || mostly(p.ta));
    // Changes that overlap: others in the plan that also help alone on a measure this one helps alone on.
    const overlaps = helps.length && !own.length ? rest.filter(o => { const oK = stackOf([o]).key; return helps.some(p => { const t = tally(T.cases.map(c => run(oK, c)[p.m]), today(p.m)); return holds(t) || mostly(t); }); }) : [];
    const verdict = own.length ? `<span class="good">Does its own work in your plan</span> (${own.map(p => esc(MEASURES[p.m].label.toLowerCase())).join('; ')})`
      : helps.length ? `<span class="mixed">Helps alone, but adds little on top of the rest of your plan</span>${overlaps.length ? `: it overlaps with ${overlaps.map(o => `“${esc(o.title)}”`).join(' and ')}` : ''}`
      : '<span class="muted">Not reliably helping on this fire, alone or in your plan</span>';
    // Only measures with a reliable signal (better or worse in at least three of four passes and never the other way); the rest is noise.
    const harm = t => t.better === 0 && t.worse >= Math.ceil(0.75 * t.n), signal = p => mostly(p.ta) || mostly(p.tc) || harm(p.ta) || harm(p.tc);
    const quiet = per.filter(p => !signal(p)).length;
    const lines = per.filter(signal).map(p => {
      const d = MEASURES[p.m];
      return `<li title="${esc(d.tip)}"><b>${esc(d.label)}:</b> alone ${v(p.m, median(today(p.m)))} → ${v(p.m, median(p.alone))} (better in ${p.ta.better}, worse in ${p.ta.worse} of ${p.ta.n}); without it your plan goes ${v(p.m, median(full(p.m)))} → ${v(p.m, median(p.without))} (worse in ${p.tc.better}, better in ${p.tc.worse} of ${p.tc.n})</li>`;
    }).join('');
    return `<div class="bd"><b>${esc(l.title)}</b><div class="small">${verdict}</div>${lines ? `<ul class="small">${lines}</ul>` : ''}${quiet ? `<div class="small muted">${lines ? 'Other measures' : 'Every measure'}: no reliable effect, alone or in your plan.</div>` : ''}</div>`;
  }).join('');
  return `<h3>Your plan, change by change</h3>${rows}
    <p class="small muted"><b>Alone</b>: that change by itself against today's plan. <b>Without it</b>: your plan with every change except that one, against your whole plan. Same ${T.n} passes and households throughout; a pass counts only beyond 1%. "Does its own work" means your plan is worse without it in every pass on some measure. A change that helps alone but adds little in your plan usually overlaps with another change that fixes the same problem.</p>`;
}
function bdButtonHTML(T) {
  if (!T.done || T.ids.length < 2) return '';
  if (T.bd?.running) return `<p class="small muted">Breaking down your plan: ${T.bd.got} of ${T.bd.total} simulations done…</p>`;
  if (T.bd) return breakdownHTML(T);
  const n = bdMissing(T).length;
  return `<div class="btns"><button id="bd-go">Break down this plan</button></div><p class="small muted">For each change: what it does alone, and what your plan loses without it, over the same ${T.n} passes${n ? ` (${n} more simulations)` : ''}.</p>`;
}
// Families on: under the verdicts, one line per measure when the change helps at some members and not
// others ("Helps when the fire starts at X; no reliable effect when it starts at Y"). A member's verdict
// uses the same rules over its own passes (3, or 6 on the 1923 fire). Members are listed in their fixed
// order, never ranked (docs/design/fire-families.md).
function memberLines(T) {
  if (!T.families || !T.done) return '';
  const fam = familyOf(scenById(T.fire), data), single = new Set(fam.map(m => m.point)).size === 1;
  const where = ms => {
    const by = new Map(); for (const m of ms) by.set(m.point, [...(by.get(m.point) || []), m.windFrom]);
    return [...by].map(([p, ws]) => { const all = ws.length === fam.filter(f => f.point === p).length;
      return single ? `with wind from ${ws.map(w => `${w}°`).join(' or ')}` : `${fam.find(f => f.point === p).at}${all ? '' : ` with wind from ${ws.map(w => `${w}°`).join(' or ')}`}`; }).join(', or ');
  };
  const lines = Object.entries(MEASURES).filter(([, d]) => !d.time).map(([m, d]) => {
    const cls = fam.map(mem => { const ks = T.cases.filter(c => c.member === mem.id).map(c => c.key), t = tally(ks.map(k => T.B[k][m]), ks.map(k => T.A[k][m]));
      return { mem, c: holds(t) || mostly(t) ? 'helps' : t.better === 0 && t.worse >= Math.ceil(0.75 * t.n) ? 'harms' : 'none' }; });
    if (new Set(cls.map(x => x.c)).size < 2) return '';
    const of = k => cls.filter(x => x.c === k).map(x => x.mem), lead = single ? '' : 'when the fire starts ', then = single ? '' : 'when it starts ';
    const parts = [of('helps').length ? `Helps ${lead}${where(of('helps'))}` : '', of('none').length ? `${of('helps').length ? 'no' : 'No'} reliable effect ${of('helps').length ? then : lead}${where(of('none'))}` : '', of('harms').length ? `worse ${then}${where(of('harms'))}` : ''].filter(Boolean);
    return `<li title="${esc(d.tip)}"><b>${esc(d.label)}:</b> ${parts.join('; ')}.</li>`;
  }).filter(Boolean).join('');
  return lines ? `<h3>Where the fire starts and how the wind blows</h3><ul class="small">${lines}</ul>` : `<p class="small muted">Every start and wind gave the same verdict on every measure.</p>`;
}
// Paired verdict for one measure over a comparison's passes, with its robustness label (js/robust.js): passes are
// grouped by fire severity, the uncertain setting each fire is run at (low, medium, high).
function pairedVerdict(T, keys, m) {
  const byLevel = {};
  for (const key of keys) {
    const c = T.cases.find(x => x.key === key), lv = c?.sev || 'all', t = byLevel[lv] ||= { better: 0, worse: 0, n: 0 };
    const a = T.A[key][m], b = T.B[key][m]; t.n++;
    if (!tolSame(a, b)) asNum(b) < asNum(a) ? t.better++ : t.worse++;
  }
  return direction(byLevel);
}
function verdictHTML(T, d, k) {
  const same = d.n - d.better - d.worse, noise = same ? `, within 1% in ${same}` : '';
  if (!T.done) return `<span class="muted">${d.better} better, ${d.worse} worse${noise} so far (${k} of ${T.n} passes)</span>`;
  const tip = `${T.n} passes: ${T.families ? passWords(T.fire, T.cases) : 'low, medium and high severity × random seeds'}; same fire, households, parked cars and seed in each pass. By severity: ${levelText(d.levels)}. A share of passes is not a probability.`;
  const words = d.label === 'consistent' ? (d.dir === 'better' ? `better in ${d.better} of ${d.n} passes${d.same ? `, within 1% in ${d.same}` : ''}` : d.dir === 'worse' ? `worse in ${d.worse} of ${d.n} passes` : `no real difference: within 1% in ${same} of ${d.n} passes`)
    : `better in ${d.better}, worse in ${d.worse}${noise} of ${d.n} passes${d.label === 'sensitive' ? ` (${levelText(d.levels)})` : ''}`;
  const cls = d.label === 'consistent' ? (d.dir === 'better' ? 'good' : d.dir === 'worse' ? 'bad' : 'muted') : 'mixed';
  return `${chip(d.label, tip)} <span class="${cls}">${words}</span>`;
}
function triesHTML() {
  if (!state.tries.length) return '';
  return state.tries.map((T, i) => {
    const keys = Object.keys(T.B).filter(k => T.A[k]), k = keys.length, fire = FIRES.find(f => f.id === T.fire);
    const row = m => {
      const d = MEASURES[m], v = x => x == null ? (k ? (d.time ? 'not reached' : '—') : '…') : d.time ? `${Math.round(x)} model min` : fmt(x);
      return `<tr title="${esc(d.tip)}"><td>${esc(d.label)} <span class="tip">ⓘ</span></td><td class="num">${v(median(keys.map(x => T.A[x][m])))}</td><td class="num">${v(median(keys.map(x => T.B[x][m])))}</td><td>${verdictHTML(T, pairedVerdict(T, keys, m), k)}</td></tr>`;
    };
    const rowsOf = g => Object.keys(MEASURES).filter(m => MEASURES[m].group === g).map(row).join('');
    const head = '<tr><th></th><th>Today\'s plan</th><th>Your plan</th><th>Your plan, pass by pass</th></tr>';
    const conn = T.ids.map(leverById).map(l => leverAccessHTML(H_, l, T.fire, fire.title)).filter(Boolean).join('');
    const cant = T.ids.map(leverById).filter(l => l?.cannotMeasure);
    return `<div class="tryres${i ? ' old' : ''}"><div><b>Today's plan + ${T.titles.map(esc).join(' + ')}</b> · ${esc(fire.title)}${T.families ? ` · ${familyPoints(scenById(T.fire)).length > 1 ? 'other starts and winds' : 'other winds'}` : ''} · ${T.done ? `${T.n} passes${T.ms != null ? ` in ${secs(T.ms)}` : ''}` : `running, ${k} of ${T.n} passes so far`}</div>
      ${i ? '' : `${conn ? `<h3>Connections</h3><ul class="small">${conn}</ul>` : ''}
      <h3>Access ${badge('synthetic')}</h3><table class="cmp">${head}${rowsOf('access')}</table>
      <h3>Exposure ${badge('synthetic')}</h3><table class="cmp">${head}${rowsOf('exposure')}</table>
      <details class="small"><summary>Model time (secondary; not a forecast)</summary><table class="cmp">${head}${rowsOf('time')}</table>
        <p class="small muted">Simulated model time from the first order. The traffic model's 90% times run 12–45% short of the City's 2025 Evacuation Time Study on 6 of its 8 calibration cases, so these minutes are not real-world estimates and never decide whether a change helps (Assumptions &amp; limits, Model performance).</p></details>
      <p class="small muted">Middle value of the passes so far for each plan. A pass counts as better or worse only when the two plans differ by more than 1%. <b>Consistent</b>: the same direction in at least 90% of passes; <b>sensitive</b>: the result depends mainly on the fire severity assumption; <b>mixed</b>: it changes direction or disappears in some passes. Synthetic households on an illustrative fire: these say what happens in these simulations, not what would happen in a real fire. A change that preserves a modeled connection in these runs does not guarantee safe evacuation.</p>
      ${memberLines(T)}
      ${T.families && T.done ? `<p class="small muted">Passes: ${esc(passWords(T.fire, T.cases))}. The starts and winds are our choices, not probabilities, and count equally. Evacuation orders stay this fire's.</p>` : ''}
      ${T.done ? (T.ids.length >= 2 ? bdButtonHTML(T) : `<p class="small"><b>Keep exploring:</b> add another change to see whether it adds anything.</p>`) : ''}
      ${cant.length ? `<details class="cant"><summary>What the simulator can't tell you about these changes</summary><ul class="small">${cant.map(l => `<li><b>${esc(l.title)}:</b> ${esc(l.cannotMeasure)}</li>`).join('')}</ul></details>` : ''}`}
      ${i ? `<table class="cmp small">${Object.keys(MEASURES).filter(m => MEASURES[m].group !== 'time').map(row).join('')}</table>` : ''}</div>`;
  }).join('');
}
// Today's plan on the chosen fire (the mitigation baseline: DEFAULT_PLAN, fall night).
const todayPreset = () => ({ id: 'today', title: "Today's plan", tod: 'S6', A: { ...DEFAULT_PLAN, name: "A: today's plan" }, B: { ...DEFAULT_PLAN, name: "B: today's plan" }, on: {}, off: {}, headline: null, always: true });
// The chosen fire applies to every question. Keep the current question if it holds on the new
// fire; otherwise switch to the first question that does.
function pickFire(id) {
  state.fire = id; localStorage.setItem('bhe-fire', id);
  // The new fire starts with today's plan; a chosen question is reapplied on the new fire when it holds there.
  const p = state.preset;
  cancelTry(); // a comparison still running belongs to the previous fire
  if (p && !['today', 'try'].includes(p.id) && p.on[id]) applyPreset(p.id);
  else applyPreset(todayPreset());
}
function applyPreset(idOrPreset) {
  const p = typeof idOrPreset === 'string' ? PRESETS.find(q => q.id === idOrPreset) : idOrPreset;
  if (!p.always && !p.on[state.fire]) return; // withheld on this fire
  cancelCompare(); // a comparison still running belongs to the previous plans
  state.preset = p; state.presetOut = null;
  $('scenario').value = state.fire; showScenario();
  $('tod').value = p.tod; todNote(); $('severity').value = document.body.classList.contains('simple') ? state.pace : 'central'; $('seed').value = 1;
  state.plans.A = { ...p.A }; state.plans.B = { ...p.B }; state.editing = 'A'; showPlan();
  $('compare-out').innerHTML = ''; newRun(); renderSimple();
}
function setMode(m) {
  // Guided view runs without growth (world()), so a switch rebuilds the run once the class has changed.
  // Guided view sets the map layers per question (questionMap); Expert view gets its own back.
  const wasSimple = document.body.classList.contains('simple');
  if (m === 'simple' && !wasSimple) state.expertMap = { layers: { ...map.layers }, mode: map.streetMode };
  const rerun = (document.body.classList.contains('simple') || document.body.classList.contains('expert')) && !document.body.classList.contains(m) && ($('growth').value !== 'none' || $('powerShutoff').value !== 'none' || $('quake').value !== 'none' || $('visibility').value !== 'clear' || $('householdMix').value !== (data.demand ? 'place' : 'citywide') || $('fuel').value !== 'proxy' || $('nrPlacement').value !== 'area' || $('walkAccess').value !== 'none' || $('nightParking').value !== 'count2026');
  document.body.classList.toggle('simple', m === 'simple'); document.body.classList.toggle('expert', m === 'expert');
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  localStorage.setItem('bhe-mode', m);
  if (m !== 'simple' && wasSimple && state.expertMap) { Object.assign(map.layers, state.expertMap.layers); map.streetMode = state.expertMap.mode; map.edgeClass = null; syncLayerBoxes(); legend(); }
  if (m !== 'simple') { map.marks = []; map.draw(); homePlayback(); } // Change-the-plan outlines and the moved playback controls belong to the Guided view
  // Street, road and buyout changes run only in the Guided view (Expert's controls and Compare carry plan
  // settings only), so leaving it drops the stack: Plan B keeps its plan settings under a name that says so.
  const dropStack = m !== 'simple' && !!state.preset?.stack;
  if (dropStack) { cancelTry(); state.preset = null; state.plans.B = { ...state.plans.B, name: 'B: your plan settings only (street, road and buyout changes are in Guided view)' }; }
  if (m === 'simple' && store.get('bhe-intro-seen')) setTimeout(guidedNote, 0); // first visit to Guided view
  if (m === 'simple' && !state.preset) pickFire(state.fire); // pickFire starts a new run
  else { if (rerun || dropStack) { if (dropStack) showPlan(); newRun(); } if (m === 'simple') renderSimple(); }
}
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
// Changing any expert control leaves the preset; the simple view then shows no plan detail.
document.querySelectorAll('#left .expert-only select, #left .expert-only input').forEach(el => el.addEventListener('change', () => { if (state.preset) { state.preset = null; renderSimple(); } }));

// ---------- runs ----------
function getFire(sc, sev, seed) {
  const fuel = world().fuel || 'proxy', k = `${sc.id}|${sev}|${seed}|${fuel}`;
  if (!state.fires.has(k)) state.fires.set(k, runFire(fireGridFor(grid, data, fuel), sc, SEVERITY[sev], seed));
  return state.fires.get(k);
}
function newRun() {
  const sc = scenario(), sev = $('severity').value, seed = +$('seed').value || 1;
  // Your plan in Change the plan (Plan B) can change streets, add roads and buy out blocks (js/levers.js); Expert view runs plans only.
  const st = document.body.classList.contains('simple') && state.editing === 'B' ? state.preset?.stack : null, d = st ? dataFor(data, st.net) : data;
  state.sim = new Evacuation(d, grid, getFire(sc, sev, seed), sc, sev, { ...state.plans[state.editing] }, seed, TIME_OF_DAY[$('tod').value], { ...world(), ...(st?.world || {}) });
  map.data = d; map.sim = state.sim;
  state.playing = false; runLabel('▶ Run'); $('scrub').value = 0;
  if (map.selected?.kind === 'edge' && !d.net.edges[map.selected.id]) { map.selected = null; inspect(null); } // a new road from the previous network
  $('run-plan').textContent = `Plan ${state.editing}${state.preset ? ': ' + state.plans[state.editing].name.replace(/^[AB]: /, '') : ''}`;
  update(true); map.draw(); questionMap();
}
function seek(tSec) {
  if (!state.sim || tSec < state.sim.t) newRun();
  while (state.sim.t < tSec && state.sim.t < state.sim.end) state.sim.step();
  update(true); map.draw(); questionMap();
}
let last = performance.now(), lastUi = 0;
function loop(now) {
  // Up to 0.5 s of wall time per frame, so a slower computer keeps the chosen Speed in bigger jumps instead of
  // falling behind it (at 0.1 s, a CPU 4 times slower played 15 min/s at about 7). A longer gap, such as a
  // background tab, is not made up.
  const dt = Math.min(0.5, (now - last) / 1000); last = now;
  const sim = state.sim;
  if (state.playing && sim) {
    state.stepDue = (state.stepDue || 0) + state.speed * dt / sim.dt; // fractional steps carry over, so 1 min/s is not rounded to 0 steps a frame
    let steps = Math.min(400, Math.floor(state.stepDue)); state.stepDue = Math.min(1, state.stepDue - steps);
    const t0 = sim.t; while (steps-- > 0 && sim.t < sim.end) sim.step();
    const wall = (now - (state.playAt ?? now)) / 1000; state.playAt = now; // achieved model seconds per wall second, smoothed
    if (wall > 0 && wall < 2) state.playRate = state.playRate ? state.playRate + Math.min(1, wall / 2) * ((sim.t - t0) / wall - state.playRate) : (sim.t - t0) / wall;
    if (sim.t >= sim.end) { state.playing = false; runLabel('▶ Run again'); update(true); map.draw(); if (document.body.classList.contains('simple')) renderSimple(); requestAnimationFrame(loop); return; }
    $('scrub').value = Math.floor(sim.t / 60);
    map.draw();
    if (now - lastUi > 300) { update(false); lastUi = now; }
  }
  requestAnimationFrame(loop);
}

// ---------- results panel ----------
function update(full) {
  const sim = state.sim, S = sim.summary(), sc = sim.scenario;
  const done = sim.t >= sim.end;
  $('clock').classList.toggle('done', done);
  $('scrub-t').textContent = hm(sim.t);
  $('clock').innerHTML = `${done ? '<span class="done-tag">✓ Run complete</span> ' : ''}Model time ${hm(sim.t)} <span class="of">of ${hm(sim.end)} (not a forecast)${done ? '' : state.playing ? ' · running' + (state.playRate && state.playRate < 0.85 * state.speed ? ` · this computer plays it at about ${Math.max(1, Math.round(state.playRate / 60))} min/s, slower than the chosen speed` : '') : sim.t > 0 ? ' · paused' : ''}</span> <span class="sub">${esc(sc.name)} · ${SEVERITY[sim.sevKey].label} severity · seed ${sim.seed} · ${esc(sim.plan.name)}</span>`;
  const c = (k, v, cls = '', tip = '') => `<div class="card ${cls}" title="${esc(tip)}"><div class="v">${v}</div><div class="k">${k}${tip ? ' <span class="tip">ⓘ</span>' : ''}</div></div>`;
  const tr = (label, value, tip) => `<tr title="${esc(tip)}"><td>${label} <span class="tip">ⓘ</span></td><td class="num">${value}</td></tr>`;
  const exposed = S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  if ($('run-status')) $('run-status').innerHTML = done ? `<b>✓ Run complete.</b> ${esc(sim.plan.name)} ran the full ${hm(sim.end)} (h:mm of model time) after ignition. The outcomes on the right are final for this one run; Run again restarts it.` : '';
  $('results').innerHTML = `<h2>${done ? 'This run, at the end' : 'This run, so far'} ${badge('synthetic')}</h2>
    <p class="small muted">One run of one modeled scenario. People are synthetic households placed from Genasys zone population estimates (2020 Census blocks where Genasys publishes none); the fire is an illustrative overlay. These numbers show what happens in this simulation, not what would happen in a real fire: not a prediction.</p>
    <div class="cards">
      ${c('people in ordered zones', fmt(S.orderedPeople), '', `Residents of zones under an evacuation order so far. An order means leave now; the 2025 Evacuation Time Study assumes everyone in an order zone leaves. Of them, ${fmt(S.otherCityOrderedPeople)} live in zones of other cities and the County (Oakland, Kensington, Albany and others), which order a zone once the fire comes within ${data.A.orders.firePathKm} km (model rule; the distance is an assumption).`)}
      ${c('warned and leaving', fmt(S.warnedLeaving), '', 'Residents of zones under an evacuation warning (get ready, and leave now if you need extra time) who leave anyway. The Time Study assumes half of warned households leave.')}
      ${c('out of the order and warning area', fmt(S.reachedSafety), 'good', `Ordered or warned people whose household's vehicles left the order and warning area and the modeled ember area (model rule). Includes ${fmt(S.riders)} people riding with a neighbor.`)}
      ${c('shadow evacuees on the move', fmt(S.shadowLeaving), '', `"Shadow evacuees" are people outside every order and warning zone who leave anyway, out of caution. The Time Study assumes 20% of them leave. They drive out of the modeled area and add ${fmt(S.shadowVehicles)} cars to the roads, but they are not counted in evacuation time.`)}
      ${c('left early (before ignition)', fmt(S.leftEarly), S.leftEarly ? 'good' : '', 'People who left on the Red Flag warning, before the fire started (plan setting: early departure). They are never in the evacuation traffic.')}
      ${c('on the road now', fmt(S.onRoad), '', 'Ordered or warned people whose car has left home but has not yet left the order and warning area.')}
      ${c('ordered, not yet left', fmt(S.notLeft), S.notLeft ? 'bad' : '', 'People in ordered or warned zones still at home: getting ready (departure times from the Time Study survey), waiting for a commuter to drive home, or picking up children.')}
      ${c('no vehicle and no ride', fmt(S.noVehicle), S.noVehicle ? 'bad' : '', 'Carless households that found no neighbor to ride with (Time Study: 86.9% rideshare). Phase 2 adds buses, paratransit and check-ins.')}
      ${c('not yet out when embers reached their street', fmt(exposed), exposed ? 'bad' : '', `People still at home when embers first reached their street, or on the road in a car that drove a street under embers after they left; each person counted once, where they were when embers first reached them. Not a count of deaths or injuries: many would shelter or come through unharmed. At home ${fmt(S.exposedHome)}; on roads ${fmt(S.exposedRoad)}; without a vehicle ${fmt(S.exposedNoVehicle)}; in zones with no order ${fmt(S.notOrderedExposed)}`)}
      ${c('not yet out when the fire front reached their street', fmt(S.fireFrontHome + S.fireFrontRoad), S.fireFrontHome + S.fireFrontRoad ? 'bad' : '', `People still at home when the fire itself reached their street, or on the road in a car that drove a burning street after they left; each person counted once. A harsher measure than embers. Still not a count of deaths or injuries. At home ${fmt(S.fireFrontHome)}; on roads ${fmt(S.fireFrontRoad)}`)}
      ${c('cars with no open modeled route', fmt(S.vehiclesNoRoute), S.vehiclesNoRoute ? 'bad' : '', 'Cars for which the modeled fire had closed every route from where they were, almost always before they set off. A model state, not a count of people trapped. Parking rules do not change this number; leaving earlier does.')}
    </div>
    <table class="kv" style="margin-top:8px">
      ${expertOnly(tr('Model time after the first order until 50% / 90% / all vehicles are out (not a forecast)', `${mins(S.clearP50)} / ${mins(S.clearP90)} / ${S.clearP100 == null ? 'not yet' : mins(S.clearP100)}`, `Simulated model time, not a forecast: the traffic model's 90% times run 12–45% short of the City's 2025 Evacuation Time Study on 6 of its 8 calibration cases (Assumptions & limits, Model performance). Minutes from the first evacuation order until half, 90% and all of the cars that started in zones Berkeley's plan orders have left the order and warning area. This is how the 2025 Evacuation Time Study measures its evacuation time estimate (ETE). The ${fmt(S.otherCityVehicles)} cars from zones only other cities order are on the same roads but not in this count; counting them, 90% are out after ${mins(S.clearP90All)}.`))}
      ${expertOnly(tr('Last household with a car out, model time after the first order (not a forecast)', S.lastHousehold == null ? 'not yet' : mins(S.lastHousehold), 'Model minutes from the first order until the last ordered or warned household with a car left the order and warning area. Not a forecast.'))}
      ${tr('Vehicles on roads now · peak queued', `${fmt(S.vehiclesOnRoad)} · ${fmt(S.peakQueued)}`, 'Cars on the road at this moment, and the most cars waiting in queues at any one moment so far.')}
      ${tr(`Modeled engine drive to the fire edge, model time: at ignition → now (City standard: ${data.A.access.engineServiceMin} min)`, `${S.responderFree === Infinity ? '<b style="color:#b91c1c">no modeled route past parked cars</b>' : mins(S.responderFree)} → ${S.responderBlocked ? '<b style="color:#b91c1c">no modeled route</b>' : mins(S.responderEta)}`, 'Model minutes for a fire engine to drive from the nearest station to the nearest point of the fire edge it can reach: at ignition, and now, with evacuation traffic in the way. At ignition, "no modeled route past parked cars" means parked cars leave less than an engine\'s width on every modeled route. Later, "no modeled route" means none is left: parked cars, streets the fire has burned across, fixed barriers or a contraflow street\'s closed direction cut every one. The City\'s standard is 5 minutes.')}
      ${tr(`Hill homes an engine can reach within ${data.A.access.engineServiceMin} minutes (City standard)`, `${fmt(S.engineReach5Share * 100, 1)}% · ${fmt(S.engineReach5People)} people`, `Share of synthetic residents of Berkeley's Fire Zones 2–3 whose street a fire engine can reach from the nearest of Berkeley's 7 fire stations within the City's ${data.A.access.engineServiceMin}-minute standard, at ignition, before traffic and fire, under this plan's parking rules and this seed's parked cars. Model rule: the engine must reach the nearer end of the home's street segment by a route on which every segment leaves an engine's width (10 ft) clear and no fixed barrier closes it; the home's own segment need not pass. ${fmt(S.engineReachUnreachablePeople)} of ${fmt(S.engineReachHillPeople)} hill residents have no engine route at all. Now, with evacuation traffic and the fire: ${fmt(S.engineReach5ShareNow * 100, 1)}% (a street the fire has reached counts as not reached; the model sends no engine up a contraflow street); averaged every 5 min since the first order: ${fmt(S.engineReach5ShareLiveMean * 100, 1)}%. This measures access only: engines do not fight the fire in this simulator, so it says nothing about firefighting outcomes. Color streets by "Engine drive time" (Expert view, Map) to see where.`)}
      ${tr('Street segments narrower than an engine needs with this run\'s parked cars', fmt(S.engineBlockedSegments), 'Street segments where parked cars leave less than 10 ft, an engine\'s width, under this plan\'s parking rules and this seed\'s parked cars.')}
      ${tr('Two-way segments where oncoming drivers take turns', fmt(S.sharedLanes), 'Two-way street segments where parked cars leave room for only one moving car, so drivers meeting from opposite directions take turns at gaps such as driveways.')}
      ${tr('Commuters driving home into the area: home · turned back', `${fmt(S.commutersHome)} of ${fmt(S.commutersInbound)} · ${fmt(S.commutersTurnedBack)}`, 'On weekdays some households wait for a family member to drive home before leaving (Time Study: 13% of households midweek). How many of those commuters got home, out of all driving in, and how many turned back because the fire, or a contraflow street closed to inbound traffic, left no way home.')}
      ${S.contraflowPlannedEntries || S.officersUsed || S.signalsDark ? tr('Traffic operations: contraflow segments running · officers used · junctions officers control · signals dark', `${fmt(S.contraflowSegments)} · ${fmt(S.officersUsed)} · ${fmt(S.junctionsControlled)} · ${fmt(S.signalsDark)}`, 'Contraflow street segments with both lanes outbound so far; officers assigned from the plan\'s pool to contraflow entry points and junctions; junctions under officer control; signals dark in the Red Flag power shutoff (scenario setting). Model rules and assumptions; see Assumptions & limits. The event log lists what started when and what did not run.') : ''}
      ${tr('Zones ordered · warned', `${fmt(S.zonesOrdered)} · ${fmt(S.zonesWarned)}`, 'Evacuation zones under an order (leave now) and under a warning (get ready) so far.')}
      ${data.structures ? `<tr title="${esc(`Context, the same under every plan for this scenario and seed: the fire overlay does not depend on the plan. Structures: City of Berkeley footprints in Fire Zones 2–3 (${fmt(S.structuresTotal)} in all), each counted in the 30 m fire cell holding its center, reached when the fire front or embers reach that cell. Elsewhere: OpenStreetMap building outlines, counted the same way; OpenStreetMap maps about 23% more outlines than the City in Fire Zones 2–3, likely garages and sheds, so read that count as high. Counts exposure only: not ignition, not homes lost, and not a prediction.`)}"><td>Structures the fire front · embers had reached: Fire Zones 2–3 (City footprints); elsewhere (OpenStreetMap). Same under every plan ${badge('derived', 'City footprints (2023) and OpenStreetMap building outlines, counted per fire cell by tools/build-structures.mjs; SOURCE_NOTES PH10, PH24.')} <span class="tip">ⓘ</span></td><td class="num">${fmt(S.structuresFireFront)} · ${fmt(S.structuresEmbers)}; ${data.structures.meta.osmBuilt ? `${fmt(S.structuresOtherFireFront)} · ${fmt(S.structuresOtherEmbers)}` : 'not available'}</td></tr>` : ''}
      ${data.structures && data.A.structures?.lossIfFront ? `<tr title="${esc(`Of the City-footprint structures in Fire Zones 2–3 the fire front had reached, how many would be lost, as a range: ${Math.round(100 * data.A.structures.lossIfFront.within18m[0])}–${Math.round(100 * data.A.structures.lossIfFront.within18m[1])}% of those under 50 ft from their nearest neighbor and ${Math.round(100 * data.A.structures.lossIfFront.beyond18m[0])}–${Math.round(100 * data.A.structures.lossIfFront.beyond18m[1])}% of those farther apart, from homes in Paradise in the 2018 Camp Fire (Knapp et al. 2021). An assumption, not a prediction. Structures reached only by embers get no loss figure, because no source gives that share. The same under every plan.`)}"><td>Structures lost where the fire front reached them (Fire Zones 2–3), same under every plan ${badge('assumption', 'data/assumptions.json structures.lossIfFront; SOURCE_NOTES PH18, PH23; docs/design/structure-spread.md.')} <span class="tip">ⓘ</span></td><td class="num">${fmt(S.structuresLostLow)}–${fmt(S.structuresLostHigh)}</td></tr>` : ''}
      ${S.growthOption !== 'none' ? `<tr title="Homes added by the Future growth setting (Scenario, Expert view) and the residents living in them. They are counted in every number above. Homes barred by R0 are those the plan\'s R0 setting blocks in its area."><td>Future growth: added homes · residents (counted in every number above)${S.growthBlocked ? ` · homes barred by R0` : ''} ${badge('synthetic')}</td><td class="num">${fmt(S.addedUnits)} · ${fmt(S.addedResidents)}${S.growthBlocked ? ` · ${fmt(S.growthBlocked)}` : ''}</td></tr>` : ''}
    </table>
    ${needsHelpPanel(S)}
    ${routingPanel(sim, S, done)}
    <canvas class="spark" id="spark" width="330" height="60"></canvas>
    <div class="small muted"><span style="color:#b91c1c">■</span> vehicles queued &nbsp; <span style="color:#1d4ed8">■</span> on roads &nbsp; <span style="color:#0e7490">■</span> engine ETA (scaled)</div>
    ${S.bottlenecks.length ? `<h3>Worst queues so far</h3><table>${S.bottlenecks.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${b.max} veh</td><td class="num">t+${fmt(b.at)}m</td></tr>`).join('')}</table>` : ''}
    ${disputedNote(sc, S)}
    <p class="small muted">Where embers land is illustrative: across runs it does not follow the County's Ember Threat Zones (rank correlation −0.20 at medium severity), though it ranks the City's 2025 fire hazard zones in the City's order (docs/fire-validation.md, finding 4). Structures lost is an assumption range for structures the fire front reached; embers alone get no loss figure, and the fire does not respond to structures. Population outside the modeled street network: ${fmt(S.unplacedPeople)}.</p>`;
  spark(sim);
  $('events').innerHTML = sim.events.map(e => `<li class="k-${e.kind}"><span class="t">t+${hm(e.t)}</span>${esc(e.text)}</li>`).join('');
  if (map.selected) inspect(map.selected, true);
}
// Model performance (Assumptions & limits): the simulator's fire-off 90% times against the 2025 Evacuation Time Study,
// shown as a known limitation of the traffic model, not as validation (product brief, "Evacuation-time outputs";
// SOURCE_NOTES CD1–CD16). Times come from tests/calibration.mjs (data/model/calibration.json) and ETE_TARGETS.
function modelPerformanceHTML() {
  const C = data.calibration, M = C?._meta;
  const rows = Object.entries(ETE_TARGETS).flatMap(([id, T]) => ['S4', 'S6'].map(tk => {
    const v = T.p90[tk], c = C?.regions?.[id]?.[tk]?.p90, d = c ? Math.round(100 * (c.median - v) / v) : null;
    return `<tr><td>${esc(T.region)}</td><td>${esc(TIME_OF_DAY[tk].label)}</td><td class="num">${v}</td><td class="num">${c ? Math.round(c.median) : '—'}</td><td class="num">${d == null ? '—' : `${d > 0 ? '+' : ''}${d}%`}</td></tr>`;
  })).join('');
  return `<h3>Model performance: evacuation time against the City study (a known limitation)</h3>
  <p class="small">The explorer does not report evacuation times as results, because its traffic model clears roads much faster than the City's 2025 Evacuation Time Study in most cases. With the fire off, on the study's zones, the simulator's time until 90% of order-zone vehicles are out ${badge('synthetic', `tests/calibration.mjs, ${M?.seeds ?? 3} seeds, built ${M?.built ?? 'n/a'}; the Time Study's citywide household mix.`)} against the study's ${badge('sourced', '2025 Evacuation Time Study, Table 7-1 (js/scenarios.js ETE_TARGETS).')}:</p>
  <table><tr><th>Region</th><th>Time Study case</th><th class="num">Study, min</th><th class="num">Simulator, min</th><th class="num">Difference</th></tr>${rows}</table>
  <p class="small">Departures match the study; the gap is time on the road. The simulator has almost no congestion inside the order area (median road time 1–5 min against the study's 40–80 min on a 1923 weekday), evacuees leave the model at the edge of the order and warning area instead of driving on, and junctions carry flow without the City's signal timings (SOURCE_NOTES CD1–CD7). A counting fix on 2026-11-06 (CD12–CD15) moved the 90% times by at most 2 min. The next model steps (CD16, docs/model-fix-plan.md) are not built. This comparison is a record of the traffic model's limitation. It does not validate the fire spread or access results, which come from the fire model and the street network, and it is the reason any clock the explorer shows is labeled model time, not a forecast.</p>`;
}
// Disputed input beside the results it moves (SOURCE_NOTES DM3, DM18): the household mix this run did not use, on
// this fire, from tools/demand-compare.mjs (today's plan, medium severity, the fire's usual time of day).
function disputedNote(sc, S) {
  const id = sc.id === 'eastWindDay' ? 'eastWind' : sc.id, F = data.demandCompare?.fires?.[id]; if (!F?.citywide || !F?.place) return '';
  const med = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const m = k => ({ stranded: med(F[k].map(r => r.stranded)), exposedNoVehicle: med(F[k].map(r => r.exposedNoVehicle)) });
  const P = m('place'), C = m('citywide'), place = S.householdMix === 'place';
  return `<p class="small"><b>Disputed input: households without a vehicle</b> ${badge('derived', 'docs/demand-by-place.md; data/model/demand-compare.json; SOURCE_NOTES DM3, DM17, DM18')}. This run uses ${place ? 'each zone\'s ACS share (about a fifth of households in Berkeley\'s zones)' : 'the Time Study survey\'s 7.47% in every zone'}. On this fire (today's plan, medium severity, ${esc(TIME_OF_DAY[F.tod]?.label || F.tod)}, median of ${data.demandCompare._meta.seeds.length} seeds), ${place ? 'the survey\'s 7.47%' : 'the ACS by place'} gives ${fmt(place ? C.stranded : P.stranded)} people with no vehicle and no ride against ${fmt(place ? P.stranded : C.stranded)}, and ${fmt(place ? C.exposedNoVehicle : P.exposedNoVehicle)} of them still home when embers arrived against ${fmt(place ? P.exposedNoVehicle : C.exposedNoVehicle)}. Evacuation times move by a few minutes at most.</p>`;
}
function spark(sim) {
  const cv = $('spark'); if (!cv) return; const ctx = cv.getContext('2d'), s = sim.series;
  const W = cv.width, H = cv.height, n = sim.end / 60;
  ctx.clearRect(0, 0, W, H);
  const maxV = Math.max(10, ...s.onRoad);
  const line = (arr, color, scale) => { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); arr.forEach((v, i) => { const x = s.t[i] / 60 / n * W, y = H - 2 - (v === Infinity || v == null ? 0 : Math.min(1, v / scale)) * (H - 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
  line(s.onRoad, '#1d4ed8', maxV); line(s.queued, '#b91c1c', maxV);
  line(s.eta.map(e => e === Infinity ? null : e), '#0e7490', Math.max(600, ...s.eta.filter(isFinite)));
}

// ---------- inspector ----------
map.onSelect = sel => inspect(sel);
map.onHover = (x, y) => {
  const z = demAt(data.dem, data.Z, x, y); const [lon, lat] = fromUTM(x + data.net.meta.origin[0], y + data.net.meta.origin[1]);
  $('status').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} · elevation ${z == null ? '—' : z.toFixed(0) + ' m'} (bare-earth DEM)`;
};
// ACS and licensing figures for one zone (data/model/demand-by-zone.json): reported, never trips.
function zoneDemandRows(id, row) {
  const d = data.demand?.zones?.[id]; if (!d) return '';
  const pct = s => s ? `${(s.value * 100).toFixed(1)}% <span class="muted">(${(s.range[0] * 100).toFixed(1)}–${(s.range[1] * 100).toFixed(1)}%)</span>` : '—';
  const n = c => c ? `${fmt(c.value)} <span class="muted">(${fmt(c.range[0])}–${fmt(c.range[1])})</span>` : '—';
  const acs = `ACS 2020–2024 5-year, block groups ${d.blockGroups.join(', ') || 'none'}, allocated to the zone by 2020 housing units or population (tools/build-demand.mjs). Range: estimate ± 90% margin of error.`;
  let out = row('Households without a vehicle (ACS)', pct(d.zeroVehicle), 'derived', acs + ' Used by default (Household mix: by place).')
    + row('Persons per household (ACS)', d.personsPerHousehold ? `${d.personsPerHousehold.value.toFixed(2)} <span class="muted">(${d.personsPerHousehold.range.map(v => v.toFixed(2)).join('–')})</span>` : '—', 'derived', acs + ' Used by default (Household mix: by place).')
    + row('People 75 and older', n(d.implied.peopleAge75), 'derived', acs + ' Share of population applied to the zone\'s modeled population. Reported only; no trips.')
    + row('People with an ambulatory difficulty', n(d.implied.peopleAmbulatory), 'derived', 'ACS 2020–2024 B18105, tract level (no block-group table exists), share of the civilian noninstitutionalized population 5 and older, applied to the zone\'s modeled population. Reported only; no trips.')
    + row('Households of one person 65+', n(d.implied.households65Alone), 'derived', acs + ' B11007. Reported only; no trips.');
  const F = d.facilities, L = { rcfe: 'Residential care for the elderly', adultResidential: 'Adult residential', skilledNursing: 'Skilled nursing', intermediateCare: 'Intermediate care', hospital: 'Hospitals', childCareCenter: 'Child care centers', publicSchool: 'Public schools', privateSchool: 'Private schools' };
  if (F) out += row('Licensed facilities and schools', Object.entries(L).filter(([k]) => F[k]).map(([k, l]) => { const f = F[k], c = f.capacity ?? f.beds ?? f.enrollment; return `${l}: ${f.n} (${fmt(c)} ${f.beds != null ? 'beds' : f.enrollment != null ? 'enrolled' : 'licensed capacity'}${f.unknown ? `; ${f.unknown} unknown` : ''})`; }).join('<br>'), 'sourced',
    'CDSS Community Care Licensing (licensed facilities, capacity), CDPH licensed healthcare facilities (beds), CDE school directory with 2025-26 enrollment and NCES private school locations (tools/fetch-demand-facilities.mjs). Counts by zone only. Reported only; no trips.');
  return out;
}
function inspect(sel, quiet) {
  const box = $('inspector');
  map.selectedArea = sel?.kind === 'edge' && map.layers.access ? data.access?.edgeAreas.get(sel.id)?.[0] ?? null : null;
  // Guided view: a card that answers what the feature is, why it is highlighted, who depends on it, how consistent that is and what it does not establish.
  if (document.body.classList.contains('simple')) { $('card').innerHTML = cardHTML(H_, data, sel, { q: state.tab, fire: state.fire, fireTitle: FIRE_TITLE(), sim: state.sim, levers: pickedLevers() }); if (!quiet) map.draw(); return; }
  if (!sel) { box.innerHTML = '<h2>Inspector</h2><p class="muted small">Click a street or an evacuation zone.</p>'; return; }
  const sim = state.sim, F = data.net.meta.fields, net = (sim?.data || data).net; // a watched stack may add links
  const row = (k, v, cat, note) => `<tr><td>${k}</td><td>${v}${badge(cat, note)}</td></tr>`;
  if (sel.kind === 'edge') {
    const e = net.edges[sel.id];
    // A hypothetical road from Change the plan (tools/egress-link.mjs): not a County record; every value is an assumption, derived or a model rule.
    if (e.newLink || e.opened) {
      const P = LINK_PROVENANCE, cat = s => s.split(':')[0];
      box.innerHTML = `<h2>Hypothetical new road ${badge('assumption', 'Not a County street record: added for Change the plan by tools/egress-link.mjs. Not a design.')}</h2><table class="kv">
        ${row('Connection', esc(e.opened ? titleCase(e.name) + ' (an existing path opened to cars)' : mit()?.levers.find(l => l.delta?.link?.id === e.src?.egressCandidate)?.delta.link.street || e.name), 'derived', P.geom)}
        ${row('Lanes [forward, back]', e.lanes.join(', '), cat(P.lanes), P.lanes)}
        ${row('Pavement width', `${fmt(e.widthM, 1)} m (${fmt(e.widthM / 0.3048)} ft), no parking`, cat(P.widthM), P.widthM)}
        ${row('Length', `${fmt(e.len)} m`, 'derived', P.geom)}
        ${e.grade == null ? '' : row('Grade (ground profile)', `${fmt(e.grade, 1)}%`, cat(P.grade), P.grade)}
        ${row('Speed', `${fmt(e.speedMps * 2.23694)} mph`, cat(P.speedMps), P.speedMps)}
        ${row('Capacity per lane', `${fmt(e.capPerLaneVph)} vehicles/h${e.steep ? ' (steep)' : ''}`, cat(P.capPerLaneVph), P.capPerLaneVph)}
        ${row('Households on it', 'none', cat(P.evacZone), P.evacZone)}</table>`;
      return;
    }
    const travel = { B: 'two-way', FT: 'one-way (drawn direction)', TF: 'one-way (against drawn direction)', NT: 'no vehicle travel' }[e.trav] || e.trav;
    const fix = e.correction, fixNote = fix ? (fix.why || data.A._meta['network.segmentCorrections']?.note || F.correction?.source || '') : '';
    let rows = row('Street', esc(titleCase(e.name)), 'sourced', fix ? fixNote : undefined) + row('Class', esc(e.cls), 'sourced') + row('Direction', travel, 'sourced', fix ? fixNote : F.trav.source)
      + (fix ? row('Corrected County record', `County file: ${esc(titleCase(fix.county.STREET || e.name))}, ${{ B: 'two-way', FT: 'one-way', TF: 'one-way', NT: 'no vehicle travel' }[fix.county.TRVLWAY] || esc(fix.county.TRVLWAY)}. Corrected to a street from OpenStreetMap way <a href="https://www.openstreetmap.org/way/${fix.osmWay}" target="_blank" rel="noopener">${fix.osmWay}</a> and the sources in the note`, 'sourced', fixNote) : '')
      + row('Use', e.mode, 'derived', F.mode.source) + row('Length', `${fmt(e.len)} m`, 'derived', 'Measured in UTM 10N meters');
    if (e.mode === 'vehicle') {
      rows += row('Lanes [forward, back]', `${e.lanes.join(', ')}`, srcCat(e.lanesSrc), e.lanesSrc)
        + row('Pavement width', e.widthM == null ? 'unknown' : `${fmt(e.widthM, 1)} m (${fmt(e.widthM / 0.3048)} ft)`, srcCat(e.widthSrc), e.widthSrc)
        + (e.narrow ? row('City survey: width with parking', `${fmt(e.clearWidthM / 0.3048)} ft`, 'sourced', 'City Narrow_Roads Width_w_Parking: pavement minus 7 ft per parked side, assuming perfect parking. Used as one possible state, not a measurement.') : '');
      if (sim) {
        const cw = sim.clear[e.id], P = sim.parking, sd = P.sides[e.id];
        rows += row('Parked sides (this run)', sd < 0 ? '—' : `${sd}${P.offPave[e.id] ? ', partly off the pavement' : ''}${P.pinchM[e.id] ? `; one bad parking job takes ${fmt(P.pinchM[e.id] / 0.3048, 1)} ft more` : ''}${P.nightPinch?.[e.id] ? `; night rule: both sides parked, leaving one car's width (${fmt(A.parking.range.night.narrowPinchClearM / 0.3048, 1)} ft)` : ''}`, 'model rule', A_NOTE('parking.range'))
          + row('Clear width under this plan', Number.isNaN(cw) ? 'unknown' : `${fmt(cw, 1)} m (${fmt(cw / 0.3048)} ft)`, Number.isNaN(cw) ? 'unknown' : 'derived', 'Pavement width minus parked cars (8 ft per side, KLD), minus any bad parking job, for this run\'s seed; at night, a 17–24 ft hill street parked on both sides keeps one car\'s width (8 ft; assumption from the 2026-11-05 count)')
          + row('Moving lanes that fit', sim.eff[e.id] < 0 ? 'unknown' : sim.eff[e.id], 'model rule', F.effLanes.source)
          + row('Fire engine can pass', sim.engineOK[e.id] ? 'yes' : '<b style="color:#b91c1c">no</b>', 'model rule', F.engineBlocked.source)
          + opsRows(e, sim, row);
      }
      rows += row('Steep grade', e.gradeReliable ? `${fmt(e.gradeMax, 1)}%` : `${fmt(e.gradeMax, 1)}% (unreliable)`, 'derived', F.gradeMax.source)
        + row('Net grade (drawn direction)', `${fmt(e.grade, 1)}%`, 'derived', F.grade.source)
        + row('Elevation at ends', `${fmt(e.z[0])} m → ${fmt(e.z[1])} m`, 'derived', F.z.source)
        + row('Speed · capacity per lane', `${fmt(e.speedMps * 2.237)} mph · ${fmt(e.capPerLaneVph)} veh/h${e.steep ? ' (steep)' : ''}`, 'model rule', F.capPerLaneVph.source)
        + (e.barrier ? row(e.barrier.cityId ? `${e.barrier.gate ? 'Gate' : 'Diverter'} (City list #${e.barrier.cityId}, shape from OpenStreetMap)` : 'Barrier (OpenStreetMap)',
          `${esc(String(e.barrier.kind).replace('_', ' '))}${e.barrier.action ? ' · ' + esc(e.barrier.action) : ''}${e.barrier.street ? ' (' + esc(e.barrier.street) + ')' : ''}${e.barrier.closed ? ': closed to residents\' cars' + (e.barrier.engines ? '; engines pass after ' + data.A.access.barrierDelayS / 60 + ' min' : '; engines blocked') : e.barrier.keptOpen ? ': left open (' + esc(e.barrier.keptOpen) + ')' : ''}`, 'sourced', F.barrier.source) : '')
        + (e.fireZoneSrc?.startsWith('proxy') ? row('Fire zone', 'hills (outside Berkeley)', 'model rule', F.fireZoneSrc.source) : row('Fire zone', e.fireZone ?? 'outside', 'sourced', F.fireZone.source))
        + row('Evacuation zone', e.evacZone ?? '—', 'sourced', F.evacZone.source)
        + (e.src.osmWay ? '' : row('City segment match', e.city?.id ?? 'none', e.city ? 'derived' : 'unknown', 'Matched by street name and distance'));
      if (sim) {
        const ls = sim.edgeLinks.get(e.id) || [];
        const q = ls.map(l => sim.links[l].q.length).reduce((a, b) => a + b, 0);
        rows += row('Vehicles on segment now', q, 'synthetic')
          + row('Fire reaches · embers reach', `${sim.tFire[e.id] === Infinity ? 'never' : 't+' + hm(sim.tFire[e.id])} · ${sim.tEmber[e.id] === Infinity ? 'never' : 't+' + hm(sim.tEmber[e.id])}`, 'model rule', 'Illustrative overlay for this scenario, severity and seed');
      }
    }
    rows += e.src.osmWay ? row('Source record', `OpenStreetMap way <a href="https://www.openstreetmap.org/way/${e.src.osmWay}" target="_blank" rel="noopener">${e.src.osmWay}</a> (© OpenStreetMap contributors, ODbL)`, 'sourced', F.osm.source)
      : row('Source record', `County OBJECTID ${e.src.OBJECTID}, SEGID ${e.src.SEGID}`, 'sourced');
    const areas = data.access?.edgeAreas.get(e.id);
    if (areas && !map.layers.access) rows += row('Access-constrained area', `${esc(areas[0].id)}, behind ${esc(areas[0].chokeStreets.join(' / '))} (turn on the Access constraints layer)`, 'derived');
    box.innerHTML = (map.selectedArea ? accessCard(data, map.selectedArea, H) : '') + `<h2>Street segment</h2><table class="kv">${rows}</table>`;
    if ($('cf-toggle')) $('cf-toggle').onclick = () => toggleContraflow(e.id);
  } else {
    const z = data.layers.evacZones[sel.id];
    const berk = /^(BER|LBL)-/.test(z.id);
    let rows = row('Zone', esc(z.id), 'sourced') + row('Described as', esc(z.knownAs || '—'), 'sourced')
      + row('Outline', z.outlineSrc === 'genasys' ? 'Genasys Protect map' : 'City of Berkeley zones layer', 'sourced',
        z.outlineSrc !== 'genasys' ? 'City of Berkeley GenasysZonesBerkeley layer'
          : berk ? 'The City layer clips this zone at the city line (or lacks it), so the outline comes from the Genasys Protect map service (2026-11-01); population and description stay from the City layer where it has them. SOURCE_NOTES Z1–Z4.'
          : 'Genasys Protect map service (2026-11-01); the City layer holds only a sliver of zones outside Berkeley. SOURCE_NOTES X4.')
      + row('Estimated population', fmt(z.pop) + (z.popOverride ? ` (census2020; Genasys estimate ${fmt(z.genasysPop)})` : ''), z.popOverride ? 'assumption' : 'sourced', z.popOverride ? z.popOverride : z.popSrc === 'census2020' ? '2020 Census population of the blocks whose interior point lies in this Genasys zone (Genasys publishes no estimate for it)' : 'Genasys zone estimate in the City layer (method not documented there)')
      + row('2020 Census, same zone', fmt(z.census2020), 'sourced', 'Population of 2020 Census blocks whose interior point lies in the zone, inside the model area plus a small margin. A check on the Genasys estimate.');
    if (sim) {
      let hh = 0, left = 0, noCar = 0;
      for (let h = 0; h < sim.hh.n; h++) if (sim.hh.zone[h] === sel.id) { hh++; if (sim.hh.leftHome[h] <= sim.t || sim.hh.early[h]) left++; if (!sim.hh.veh[h]) noCar++; }
      rows += row('Share inside the modeled area', `${fmt(sim.zoneModeledShare[sel.id] * 100)}%`, 'derived', 'Share of the zone\'s population inside the model area (the elevation grid\'s extent): 2020 Census blocks for zones without a Genasys estimate, the zone\'s area share otherwise')
        + row('Modeled households', fmt(hh), 'synthetic', sim.hhPersons ? `Population inside the modeled area ÷ the zone's persons per household (household mix by place)` : `Population inside the modeled area ÷ ${data.A.demand.personsPerHousehold} persons per household`)
        + row('Households without a vehicle', fmt(noCar), 'synthetic')
        + row('Order issued', sim.orderT[sel.id] === Infinity ? 'no order in this run' : `t+${hm(sim.orderT[sel.id])}`, 'model rule')
        + row('Households gone so far', fmt(left), 'synthetic');
    }
    rows += zoneDemandRows(z.id, row);
    box.innerHTML = `<h2>Evacuation zone</h2><table class="kv">${rows}</table>`;
  }
}

// Contraflow status of a street segment and officer or power status of the junctions at its ends.
function opsRows(e, sim, row) {
  let out = '';
  const cf = sim.ops?.cf, st = cf?.status.get(e.id), need = 2 * data.A.access.movingLaneM / 0.3048;
  if (st) {
    const c = cf.comps[st.comp], d = st.dir === 0 ? [e.a, e.b] : [e.b, e.a];
    out += row('Contraflow (this plan)', st.note ? `Stays two-way: ${esc(st.note)}. In a run that orders or warns its zone, both lanes would run toward ${esc(sim.nodeName(d[1]))}.` : !st.ok ? `<b>Gains nothing here</b>: ${esc(st.reason)}. The street stays two-way. Widening it or a red curb (no parking) would let it run two lanes out.`
      : `Both lanes toward ${esc(sim.nodeName(d[1]))}; ${c?.state === 'running' ? `running since t+${hm(c.t)}` : c?.state === 'scheduled' ? `starts at t+${hm(c.t)}` : esc(c?.state || '')}`, 'model rule', `Two outbound lanes need at least ${need.toFixed(0)} ft clear between parked cars (2 × access.movingLaneM). Clear width here: ${Number.isNaN(st.clear) ? 'unknown' : (st.clear / 0.3048).toFixed(0) + ' ft'}.`);
  } else if (sim.plan.contraflow === 'custom' || (sim.plan.contraflow === 'main' && data.contraflow)) out += row('Contraflow (this plan)', 'not on this plan\'s list', 'model rule');
  if (sim.plan.contraflow === 'custom' && e.lanes[0] > 0 && e.lanes[1] > 0) out += `<tr><td></td><td><button id="cf-toggle">${(sim.plan.contraflowEdges || []).includes(e.id) ? 'Remove this street from contraflow' : 'Add this street to contraflow'}</button></td></tr>`;
  const J = data.signals?.junctions; if (!J) return out;
  for (const n of [e.a, e.b]) {
    const j = J.find(x => x.node === n); if (!j) continue;
    const ctl = sim.ops?.police?.nodes.includes(n), dark = sim.ops?.shutoff && j.signal && (sim.world.powerShutoff === 'all' || j.hills);
    out += row(`Junction ${esc(j.name)}`, `${j.signal ? `${j.control === 'pretimed' ? 'pre-timed' : 'actuated'} signal (City layer)` : 'no signal'}${j.appF ? `; Time Study congestion point: ${esc(j.appF)}` : ''}`, j.signal ? 'sourced' : 'derived', data.signals.meta.rule);
    if (ctl) out += row('Officer control (this plan)', sim.ops.police.controlled ? `officers in control since t+${hm(sim.ops.police.t)}` : `officers take over at t+${hm(sim.ops.police.t)}`, 'assumption', `Officers from the plan's pool arrive ${sim.plan.officerDelayMin ?? data.A.operations.police.delayMin} min after the first order; the junction then passes ${Math.round(data.A.operations.police.capacityUplift * 100)}% more vehicles and serves approaches heading out of the order area first (SOURCE_NOTES CF7, CF8).`);
    if (dark) out += row('Power shutoff (scenario)', ctl ? 'signal dark; all-way stop until officers arrive' : 'signal dark: all-way stop', 'model rule', `Signals ${sim.world.powerShutoff === 'all' ? 'across the city' : 'in and next to the hills'} go dark from the start and pass at most ${data.A.operations.powerShutoff.allWayStopVph} vehicles per hour (SOURCE_NOTES CF9, CF10). No source says which Berkeley signals went dark in past shutoffs.`);
  }
  return out;
}

// ---------- legend ----------
function legend() {
  const m = map.streetMode, sw = (c, t) => `<div><span class="sw" style="background:${c}"></span>${t}</div>`;
  const L = {
    class: sw('#c0703a', 'Principal arterial') + sw('#c09a3a', 'Collector') + sw('#3d4f63', 'Local, hill fire zones') + sw('#5b5b5b', 'Local, flats') + sw('#7a4b9c', 'Freeway / ramp'),
    clearWidth: sw('#2f8a4a', '≥ 20 ft: two 10-ft lanes') + sw('#9cc65a', '10–20 ft: one 10-ft lane') + sw('#e8c21e', '9–10 ft: constrained') + sw('#e07a1e', '7–8 ft: moderately constrained') + sw('#c0262d', '≤ 6 ft: severely constrained') + sw('#aaa', 'width unknown') + '<div class="small muted">Tiers from the City SB 99 analysis (KLD)</div>',
    engine: sw('#2f8a4a', 'Engine passes oncoming traffic') + sw('#e08a1e', 'Engine fits, but oncoming cars must pull over') + sw('#c0262d', 'Too narrow for an engine with parked cars') + sw('#aaa', 'unknown'),
    engineTime: sw('#2f8a4a', `Within ${data.A.access.engineServiceMin} min (City standard)`) + sw('#e0a21e', `${data.A.access.engineServiceMin}–8 min`) + sw('#c0262d', 'Over 8 min') + sw('#7f1d1d', 'No engine route (parked cars, barriers)') + '<div class="small muted">At ignition, no traffic or fire.</div><div class="small muted">From Berkeley\'s 7 stations only.</div><div class="small muted">A home counts at its segment\'s nearer end.</div>',
    grade: sw('#4f7f9b', '< 5%') + sw('#8fae4a', '5–10%') + sw('#e0b21e', '10–15%') + sw('#e07a1e', '15–20%') + sw('#c0262d', '≥ 20%') + sw('#aaa', 'unreliable (structure or DEM artefact)'),
    widthSource: sw('#2b6cb0', 'City pavement-management width') + sw('#8a3fb8', 'City narrow-roads survey') + sw('#aaa', 'no width data'),
    oneway: sw('#d1495b', 'One-way (arrow = direction)') + sw('#666', 'Two-way'),
    walkRise: RISE_BINS.map(([, c, t]) => sw(c, t)).join('') + sw('#d4d4d4', 'not a hill street, or no data') + '<div class="small muted">90th percentile of hill homes\' height above or below the nearest point of their street (DEM at footprint centroids, Microsoft footprints). Segments with fewer than 5 buildings show their zone\'s figure.</div>',
    ops: sw('#1d4ed8', 'Contraflow running: both lanes out') + sw('#93c5fd', 'Contraflow planned, not started') + sw('#e07a1e', 'On the plan, too narrow for two lanes out') + sw('#9ca3af', 'On the plan, not running (see event log)') + '<div class="small muted">Junctions: <span class="dot" style="background:#7c3aed"></span>officer control · <span class="dot" style="background:#111"></span>dark signal (all-way stop)</div>',
  }[m];
  const extra = (map.layers.fire ? `<div><span class="dot" style="background:#ff7a00"></span>Active fire (last 15 min)</div><div><span class="dot" style="background:#5a1e19"></span>Burned</div><div><span class="dot" style="background:#ffb020;opacity:.6"></span>Ember exposure</div>` : '')
    + (map.layers.vehicles ? `<div><span class="dot" style="background:#1d4ed8"></span>Vehicle leaving · <span class="dot" style="background:#d97706"></span>commuter driving home · <span class="dot" style="background:#e11d48"></span>in ember area</div>` : '')
    + (map.layers.queues ? sw('rgba(200,20,40,.8)', 'Queue (width = how full)') : '')
    + (map.layers.responder ? sw('#0e7490', 'Engine route to fire edge') : '')
    + (map.layers.streets ? '<div><b style="color:#111">✕</b> diverter or bollard, closed to cars · <b style="color:#7c3aed">✕</b> engines can pass (City diverter list, OpenStreetMap)</div>' : '')
    + (map.layers.demand && data.demand ? `<div><b>Residents 75 and older</b>, share by zone (ACS 2020–2024 block groups, allocated by 2020 Census population; figures only, no trips)</div>${[[0.06, 'under 5%'], [0.18, '5–10%'], [0.32, '10–15%'], [0.48, '15% or more']].map(([a, l]) => sw(`rgba(13,110,140,${a})`, l)).join('')}` : '')
    + (map.layers.paths ? `<div><span class="sw" style="background:repeating-linear-gradient(90deg,#8a5a2b 0 3px,transparent 3px 6px)"></span>Paths &amp; stairways (no vehicles)</div>` : '')
    + (map.layers.structures && data.structures ? `<div><span class="dot" style="background:rgb(60,30,100)"></span>30 m square with structures (Fire Zones 2–3): darker where more stand under 25 ft apart; more opaque with more structures</div>` : '');
  const access = map.layers.access && data.access ? accessLegend() : '';
  let saved = null; try { saved = localStorage.getItem('bhe-key'); } catch {}
  const open = saved ? saved !== 'hidden' : !matchMedia('(max-width: 760px)').matches; // on a phone the key starts closed: open, it covers half the map
  $('legend').innerHTML = `<button class="key-toggle" title="${open ? 'Hide' : 'Show'} the map key">${open ? 'Hide key ▾' : 'Show key ▸'}</button>${open ? `<div>${state.summaryWaits && document.body.classList.contains('simple') ? '<b>Streets</b><div class="small muted">Gray while the run plays. When it finishes, the map colors the streets by how often the modeled fire reached them across 15 runs.</div>' : m === 'robust' ? legendHTML(state.tab, state.view[state.tab]) : `<b>${STREET_MODES[m]}</b>${L}`}${extra}${access}</div>` : ''}`;
  $('legend').querySelector('.key-toggle').onclick = () => { try { localStorage.setItem('bhe-key', open ? 'hidden' : 'shown'); } catch {} legend(); };
}

// ---------- comparison ----------
function cancelCompare() {
  if (state.compareBatch == null) return;
  worker.postMessage({ cancel: state.compareBatch }); state.compareBatch = null;
  $('sim-banner').hidden = true; if ($('simple-compare')) $('simple-compare').disabled = false;
}
$('compare').onclick = () => {
  readPlan();
  const scope = $('cmp-scope').value, seeds = [1, 2, 3], sc = scenario();
  // Fire families on (Scenario section): this scenario's passes run every member (js/scenarios.js comparisonCases).
  const fam = scope === 'severities' && state.families && !document.body.classList.contains('simple'); // Ready-made comparisons keep their 9 passes
  const cases = fam ? comparisonCases(sc, data, { families: true, severities: ['low', 'central', 'high'] }).map(c => ({ scenarioId: sc.id, member: c.member, sev: c.sev, seed: c.seed, tod: $('tod').value }))
    : scope === 'severities' ? ['low', 'central', 'high'].flatMap(sev => seeds.map(seed => ({ scenarioId: sc.id, sev, seed, tod: $('tod').value })))
    : scenarios.flatMap(s => seeds.map(seed => ({ scenarioId: s.id, sev: 'central', seed, tod: s.timeOfDay })));
  const W = world(), jobs = ['A', 'B'].flatMap(p => cases.map(c => ({ ...c, tod: state.preset?.tods?.[p] ?? c.tod, planKey: p, plan: { ...state.plans[p] }, world: W })));
  if (routingDiffers()) { for (const j of jobs) j.outcomes = true; jobs.push(...jobs.filter(j => j.planKey === 'A' || j.planKey === 'B').map(j => ({ ...j, planKey: j.planKey + '2', reshuffle: true }))); } // households worse off (js/guidance.js)
  const batch = ++state.batch, results = []; state.compareBatch = batch;
  // Progress goes in a small banner above the map (Eric, 2026-11-01), visible from either panel.
  const progress = (t, done = 0) => { $('sim-banner').hidden = !t; $('sim-banner-text').textContent = t; $('sim-banner-bar').style.width = `${Math.round(100 * done / jobs.length)}%`; };
  if ($('simple-compare')) $('simple-compare').disabled = true;
  progress(`Comparing Plan A and Plan B: running ${jobs.length} simulations on the same fires and households. This takes a few minutes…`);
  worker.onmessage = ev => {
    const m = ev.data; if (m.batch !== batch || state.compareBatch !== batch) return; // a closed comparison renders nothing
    if (m.done) {
      state.compareBatch = null;
      progress(''); renderCompare(results, scope, fam ? { n: cases.length, words: `${familyPoints(sc).length > 1 ? `${familyPoints(sc).length} starting points × ` : ''}winds from ${familyWinds(sc).join('°, ')}°` } : null);
      if ($('simple-compare')) $('simple-compare').disabled = false;
      if (document.body.classList.contains('simple')) {
        state.presetOut = takeaway(results, scope) + '<p class="small muted">The full table is below the run results in this panel.</p>'; renderSimple();
        $('try-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    results.push(m); progress(`Comparing Plan A and Plan B: ${results.length} of ${jobs.length} simulations done…`, results.length);
  };
  worker.postMessage({ batch, jobs });
};
const METRICS = [
  ['Modeled residents not yet out when embers reached their street', S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, -1],
  ['  …at home with a car, not yet left', S => S.exposedHome, -1],
  ['  …on roads', S => S.exposedRoad, -1],
  ['  …without a vehicle', S => S.exposedNoVehicle, -1],
  ['Modeled residents not yet out when the fire front reached their street', S => S.fireFrontHome + S.fireFrontRoad, -1],
  ['People in ordered zones', S => S.orderedPeople, 0],
  ['Added residents (growth)', S => S.addedResidents, 0],
  ['People with no vehicle and no ride', S => S.noVehicle, -1],
  ['Left early', S => S.leftEarly, 0],
  ['Vehicles evacuating', S => S.vehicles, 0],
  ['Model time until 90% of vehicles are out, min after order (not a forecast)', S => S.clearP90, -1],
  ['Peak vehicles queued', S => S.peakQueued, -1],
  ['Cars with no open modeled route', S => S.vehiclesNoRoute, -1],
  ['Modeled engine drive to the fire edge at ignition (model min; ∞ = no route past parked cars)', S => S.responderFree, -1],
  ['Hill residents with no engine route meeting the 5-min standard (at ignition)', S => S.engineReachBeyond5People, -1],
  ['Hill residents with no engine route (at ignition)', S => S.engineReachUnreachablePeople, -1],
  ['Segments too narrow for an engine', S => S.engineBlockedSegments, -1],
  ['Commuters turned back (fire, or a contraflow street closed to them)', S => S.commutersTurnedBack, -1],
  ['Cars following the routing option (Habit: driving by habit)', S => S.routing ? S.routing.followers : null, 0],
  ['Hill residents an engine can reach within 5 min, live (mean share since the first order, %)', S => S.engineReach5ShareLiveMean == null ? null : S.engineReach5ShareLiveMean * 100, 1],
  ['Contraflow segments running', S => S.contraflowSegments, 0],
  ['Officers used (contraflow and junctions)', S => S.officersUsed, 0],
  ['Signals dark (power shutoff)', S => S.signalsDark, 0],
];
function renderCompare(results, scope, fam = null) {
  const groups = scope === 'severities' ? ['low', 'central', 'high'] : scenarios.map(s => s.id);
  const gname = g => scope === 'severities' ? SEVERITY[g].label + ' severity' : scenarios.find(s => s.id === g).name;
  const pick = (p, g) => results.filter(r => r.job.planKey === p && (scope === 'severities' ? r.job.sev === g : r.job.scenarioId === g)).map(r => r.summary);
  const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const range = a => { const s = a.filter(x => x != null && !Number.isNaN(x)); return s.length ? `${fmt(Math.min(...s))}–${fmt(Math.max(...s))}` : '—'; };
  let html = `<h2>Plan comparison ${badge('synthetic')}</h2>
    <p class="small">Green or red means B is better or worse than A in every run, by at least 10%; gray means the change is smaller or points different ways across runs, so there is no clear difference. A: <b>${esc(state.plans.A.name)}</b> · B: <b>${esc(state.plans.B.name)}</b>.${results[0]?.job.world?.growth && results[0].job.world.growth !== 'none' ? ` Future growth for both: ${esc(data.A.growth.options[results[0].job.world.growth].label)}.` : ''}${results[0]?.job.world?.householdMix === 'citywide' ? ' Household mix for both: the Time Study\'s citywide values.' : ''} ${fam ? ` Fire families on: each severity ran ${esc(fam.words)} (${fam.n / 3} runs per plan per severity, our choices, counted equally; Berkeley's orders stay the scenario's, other cities order their zones within ${data.A.orders.firePathKm} km of each fire). Both plans ran the same fires, households and seeds. Values are the median of those runs with the min–max range under it.` : ' Both plans ran the same fires, households and random seeds (1–3). Values are the median of 3 seeds with the min–max range under it.'} A difference smaller than the range is not a robust result.</p>`;
  html += takeaway(results, scope) + householdTakeaway(results, scope);
  for (const g of groups) {
    const A = pick('A', g), B = pick('B', g);
    html += `<h3>${esc(gname(g))}</h3><table><tr><th></th><th class="num">A</th><th class="num">B</th><th class="num">B − A</th></tr>`;
    for (const [label, f, dir] of METRICS) {
      const a = A.map(f), b = B.map(f), ma = med(a), mb = med(b);
      let d = ma != null && mb != null && isFinite(ma) && isFinite(mb) ? mb - ma : null;
      if (d != null && Math.abs(d) < 0.5) d = 0;
      // Color a difference only when every same-seed run has a value for both plans and B moves the same way in all of them; otherwise it is noise or incomplete.
      const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && isFinite(x) && isFinite(y));
      const better = pairs.filter(([x, y]) => (y - x) * dir > 0.5 * Math.abs(dir)).length, worse = pairs.filter(([x, y]) => (y - x) * dir < -0.5 * Math.abs(dir)).length;
      // ...and only when the median change is at least 10% of A's value: three runs can agree on a small change by chance (the parking question showed +2 to +8 people at low severity in seeds 1–3, but −6 in seed 4).
      const steady = pairs.length && pairs.length === a.length && (better === pairs.length || worse === pairs.length) && (d != null && Math.abs(d) >= 0.10 * Math.abs(ma || 0));
      const cls = d == null || dir === 0 || Math.abs(d) < 1e-9 ? '' : !steady ? 'delta-mixed' : (d * dir > 0 ? 'delta-good' : 'delta-bad');
      html += `<tr><td>${esc(label)}</td><td class="num">${fmt(ma)}<div class="small muted">${range(a)}</div></td><td class="num">${fmt(mb)}<div class="small muted">${range(b)}</div></td><td class="num ${cls}"${cls === 'delta-mixed' ? ' title="Smaller than 10%, or B is better in some runs and worse in others: no clear difference"' : ''}>${d == null ? '—' : (d > 0 ? '+' : '') + fmt(d)}</td></tr>`;
    }
    html += '</table>' + householdTable(results, g, scope);
  }
  html += `<h3>Why the outcomes differ (Plan B, first seed)</h3><ul class="small">${explain(results, groups[Math.floor(groups.length / 2)], scope)}</ul>`;
  $('compare-out').innerHTML = html;
}
// One plain sentence on the preset's headline metric: medians and in how many runs B beat A.
function takeaway(results, scope) {
  const p = state.preset; if (!p?.headline || scope !== 'severities') return '';
  const { label, f, dir } = p.headline;
  const twin = a => results.find(b => b.job.planKey === 'B' && b.job.sev === a.job.sev && b.job.seed === a.job.seed && b.job.member === a.job.member);
  const pairs = results.filter(r => r.job.planKey === 'A').map(a => [f(a.summary), f(twin(a).summary)]);
  const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const ma = med(pairs.map(x => x[0])), mb = med(pairs.map(x => x[1]));
  const better = pairs.filter(([a, b]) => (b - a) * dir > 0).length, worse = pairs.filter(([a, b]) => (b - a) * dir < 0).length;
  const robust = better === pairs.length || worse === pairs.length;
  const byLevel = {}; for (const a of results.filter(r => r.job.planKey === 'A')) { const t = byLevel[a.job.sev] ||= { better: 0, worse: 0, n: 0 }, d = (f(twin(a).summary) - f(a.summary)) * dir; t.n++; if (d > 0) t.better++; else if (d < 0) t.worse++; }
  const D = direction(byLevel), dtip = `${pairs.length} paired runs: low, medium and high severity × seeds; same fire, households and parked cars in each pair. By severity: ${levelText(byLevel)}. A share of runs is not a probability.`;
  const exF = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  let other = '';
  if (f.toString() !== exF.toString() && !/embers/.test(label)) {
    const ex = results.filter(r => r.job.planKey === 'A').map(a => exF(twin(a).summary) - exF(a.summary));
    if (!(ex.every(x => x < -0.5) || ex.every(x => x > 0.5))) other = ` Modeled residents not yet out when embers reached their street show no clear difference (B − A ranges from ${fmt(Math.min(...ex))} to ${fmt(Math.max(...ex))} across runs).${p.otherNote ? ' ' + esc(p.otherNote) : ''}`;
  }
  return `<div class="takeaway${robust ? '' : ' mixed'}">${chip(D.label, dtip)} <b>${esc(label)}:</b> about ${fmt(ma)} under Plan A and ${fmt(mb)} under Plan B (median of ${pairs.length} runs). Plan B did better in ${better} of ${pairs.length} runs and worse in ${worse}.${robust ? '' : ' The difference does not hold in every run, so treat it as uncertain.'}${other} These are synthetic households on an illustrative fire: they show what happens in these simulations, not a prediction.</div>`;
}
// ---------- households worse off (Compare, when Plan A and Plan B differ in routing; js/guidance.js) ----------
function routingDiffers() {
  const a = state.plans.A, b = state.plans.B, ra = routingOf(a), rb = routingOf(b);
  return ra !== rb || (ra !== 'today' && complianceOf(a) !== complianceOf(b));
}
// Same-seed pairs: B against A; B in both serving orders against A in both (beyond chance: each
// plan also reruns with another junction serving order); A against its rerun (chance alone); and
// A against B (better off under B).
function householdPairs(results, g, scope) {
  const thr = data.A.routing.worseOffDelayMin, same = (x, y) => x.job.sev === y.job.sev && x.job.seed === y.job.seed && x.job.scenarioId === y.job.scenarioId && x.job.member === y.job.member;
  return results.filter(r => r.job.planKey === 'A' && r.outcomes && (g == null || (scope === 'severities' ? r.job.sev === g : r.job.scenarioId === g))).map(a => {
    const f = k => results.find(r => r.job.planKey === k && same(r, a)), b = f('B'), a2 = f('A2'), b2 = f('B2');
    if (!b?.outcomes || !a2?.outcomes || !b2?.outcomes) return null;
    const w = worseOff(a.outcomes, b.outcomes, thr); if (!w) return null;
    return { w, wb: worseOffBeyondChance(a.outcomes, a2.outcomes, b.outcomes, b2.outcomes, thr), floor: worseOff(a.outcomes, a2.outcomes, thr), better: worseOff(b.outcomes, a.outcomes, thr) };
  }).filter(Boolean);
}
const medOf = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rangeOf = a => { const s = a.filter(x => x != null); return s.length ? `${fmt(Math.min(...s))}–${fmt(Math.max(...s))}` : '—'; };
function householdTable(results, g, scope) {
  const P = householdPairs(results, g, scope); if (!P.length) return '';
  const row = (label, xs, tip, d = 0) => `<tr title="${esc(tip)}"><td>${esc(label)}</td><td class="num">${fmt(medOf(xs), d)}<div class="small muted">${rangeOf(xs)}</div></td></tr>`;
  const thr = data.A.routing.worseOffDelayMin;
  return `<table><tr><th>Household by household, B against A ${badge('synthetic')}</th><th class="num">median (range)</th></tr>
    ${row('Households worse off under B', P.map(p => p.w.households), `Still there when embers or the fire front reached them, or cut off, where they were not under A, or leaving the order and warning area more than ${thr} min later or not at all (model rule).`)}
    ${row('  …beyond chance: worse off under B in both serving orders than under A in both', P.map(p => p.wb.households), 'Each plan also runs a second time with another order of serving cars at junctions; a household counts only if it does worse under both B runs than under both A runs.')}
    ${row('  …of these, newly still there when embers or the fire front arrived, or cut off', P.map(p => p.wb.embers + p.wb.fireFront + p.wb.cutOff), 'Outcome level worse, not only time.')}
    ${row('  …of these, worst delay (min)', P.map(p => p.wb.later ? p.wb.worstDelayMin : 0), 'Largest delay among households beyond chance that left the order and warning area later.')}
    ${row('Chance alone: A against A rerun with another serving order', P.map(p => p.floor.households), 'Households "worse off" when nothing changes except which car reaches a junction first.')}
    ${row('Households better off under B', P.map(p => p.better.households), 'Households worse off under A than under B, by the same rule.')}
    ${row('Average change in model time to leave the order area (min; + = faster under B)', P.map(p => p.w.meanGainMin), 'Households that left the order and warning area under both plans.', 1)}
  </table>`;
}
function householdTakeaway(results, scope) {
  const P = householdPairs(results, null, scope); if (!P.length) return '';
  const n = P.length, wb = P.map(p => p.wb.households), worseRuns = wb.filter(x => x > 0).length, aboveChance = P.filter(p => p.wb.households > p.floor.households).length;
  const lvl = P.map(p => p.wb.embers + p.wb.fireFront + p.wb.cutOff), worst = Math.max(0, ...P.map(p => p.wb.later ? p.wb.worstDelayMin : 0));
  const rb = routingOf(state.plans.B);
  const flag = worseRuns
    ? ` <b>⚠ Plan B leaves households worse off in ${worseRuns} of ${n} runs</b> (beyond chance: median ${fmt(medOf(wb))}, up to ${fmt(Math.max(...wb))}; ${fmt(Math.max(...lvl))} at most newly still there when embers or the fire front arrived, or cut off; worst delay ${fmt(worst)} min). ${aboveChance ? `In ${aboveChance} of ${n} runs that is more than chance alone produces.` : 'In every run that is no more than chance alone produces (Plan A against its rerun with only the junction serving order changed).'}${rb === 'system' ? ' Unconstrained system-optimal routing has no protection for the individual.' : ''}`
    : ' No household did worse under Plan B than under both Plan A runs, in any run.';
  return `<div class="takeaway${worseRuns ? ' mixed' : ''}"><b>Households worse off, household by household:</b> under Plan B, ${fmt(medOf(P.map(p => p.w.households)))} households (median of ${n} runs, range ${rangeOf(P.map(p => p.w.households))}) did worse than under Plan A, and ${fmt(medOf(P.map(p => p.better.households)))} did better. Changing only the order cars are served at junctions moves ${rangeOf(P.map(p => p.floor.households))} households by as much.${flag} Synthetic households on an illustrative fire, not a prediction.</div>`;
}
function explain(results, g, scope) {
  const r = results.find(x => x.job.planKey === 'B' && x.job.seed === 1 && (scope === 'severities' ? x.job.sev === g : x.job.scenarioId === g));
  return r ? r.events.filter(e => ['plan', 'responder', 'warn'].includes(e.kind)).slice(0, 6).map(e => `<li>${esc(e.text)}</li>`).join('') || '<li>No plan-specific events.</li>' : '';
}

// ---------- modals ----------
function modal(html, cls = '') { $('modal').className = cls; $('modal-body').innerHTML = html; $('modal').showModal(); }
const INPUTS = [
  ['Fire scenario', 'Where the modeled fire starts and how the wind blows, and so which zones the scenario orders out. Four illustrative fires; none is a forecast of where a fire will start.', 'Every question: where embers and the front reach, which ways out they reach.'],
  ['Fire severity', 'How fast the modeled fire spreads and how far embers fly: low, medium (calibrated to the City\'s 1923 repeat) and high (the 1991 fire\'s pace in its first hour). Findings cover all three.', 'Whether a finding is consistent or depends on spread rate (sensitive).'],
  ['Random seed', 'Which synthetic households live where, where cars are parked tonight, and random spot fires. Findings cover seeds 1–5.', 'Whether a finding repeats across draws (consistent) or not (mixed).'],
  ['Night parking', 'Today\'s rule: both sides of most 17–24 ft hill streets parked at night, from one night\'s count of 11 blocks (2026-11-05). Expert view also runs the earlier rule.', 'Engine access: findings that change with the rule are labeled sensitive.'],
  ['A change (question 4)', 'Leave earlier, decide faster, clear a curb, widen a block, add a road, buy out blocks, traffic operations. Each is compared with today\'s plan on the same fires, households, parked cars and seeds.', 'Whether a modeled connection stays available, engine reach, cars with no open route, and exposure.'],
  ['Expert view', 'Every scenario and plan setting: time of day, growth, power shutoff, earthquake, visibility, routing, contraflow, police control.', 'Everything above, plus model time (labeled, not a forecast).'],
];
function intro() {
  modal(`<div class="intro"><h2>Berkeley Wildfire Spread and Access Explorer</h2>
  <p>Explore how different wildfire scenarios could affect Berkeley's neighborhoods and routes, and see which access vulnerabilities and possible mitigations recur across scenarios. The map uses Berkeley's real streets and terrain, illustrative fires and synthetic households.</p>
  <p class="note">This tool explores modeled wildfire and access scenarios using public data and stated assumptions. Its maps show what happens in these simulations, not what will happen in an actual emergency. Fire behavior, road access, traffic, and emergency response can differ. This is not an evacuation order or route recommendation, and not an official evacuation plan or a prediction. Follow current instructions from Berkeley and Alameda County emergency officials: <a href="https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation" target="_blank" rel="noopener">City of Berkeley fire weather and evacuation</a>.</p>
  <p><b>Choose a fire scenario to explore where fire may spread, which routes may become vulnerable, and what access options a mitigation could preserve.</b></p>
  <div class="steps"><div><b>1 · Where could fire spread?</b>The modeled fire front and ember exposure for the chosen ignition and wind, across 15 runs.</div><div><b>2 · Which routes are critical?</b>Streets with only one modeled drivable way out, the links many residents share, and entrances narrower than a fire engine needs.</div><div><b>3 · What could lose access?</b>Where the modeled fire reached a street's only way out, and where parked cars leave no engine route within the City's 5-minute standard.</div><div><b>4 · Which changes preserve access?</b>One change at a time against the same runs, with and without it: which connections and access measures change, and whether that repeats.</div></div>
  <p class="small">Every finding says whether it is <b>consistent</b> in the tested scenarios, <b>mixed</b> across them, or <b>sensitive</b> to an assumption, and names the runs behind it. A share of model runs is not a probability. Every number shows whether it is sourced, derived, an assumption, a model rule or synthetic.</p>
  <h3>The inputs and what they change</h3>
  <table><tr><th>Input</th><th>What it sets</th><th>What to watch</th></tr>${INPUTS.map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>
  <p class="small muted">The traffic model clears roads faster than the City's 2025 Evacuation Time Study, so the explorer does not report evacuation times as results; where a clock appears it is model time, not a forecast (Assumptions &amp; limits, Model performance). Streets and residents beyond Berkeley (Oakland, Albany, Kensington, El Cerrito) are included up to the edge of the elevation data; north Kensington and Oakland south of about 37.84° N are not.</p>
  <div class="start"><button id="intro-expert">Open expert view</button><button class="primary" id="intro-simple">Start: choose a fire scenario</button></div></div>`, 'intro');
  const go = m => { localStorage.setItem('bhe-intro-seen', '1'); $('modal').close(); setMode(m); };
  $('intro-simple').onclick = () => go('simple'); $('intro-expert').onclick = () => go('expert');
}
$('btn-intro').onclick = intro;
// First visit to Guided view, after How to use: what Guided view fixes, with two of the most consequential choices (Eric, 2026-11-04).
function guidedNote() {
  if (store.get('bhe-guided-seen') || $('modal').open || !document.body.classList.contains('simple')) return;
  modal(`<div class="guided-note"><h2>Guided view sets most inputs for you</h2>
  <p>Guided view runs each fire with fixed settings so you can compare scenarios without tuning dozens of inputs. Two of those choices matter most for access:</p>
  <ul>
    <li><b>When the order goes out.</b> The first evacuation order comes 10 minutes after the modeled fire starts. The ready-made comparison "Decide faster" (question 4) shows how much the timing alone changes who is still home when embers arrive.</li>
    <li><b>Parked cars at night.</b> Both sides of most 17–24 ft hill streets are parked, leaving one car's width. That rule rests on one night's count; findings that change with it are labeled sensitive.</li>
  </ul>
  <p>Expert view (the switch at the top right) lets you set every input, including power shutoffs, routing, time of day and future housing growth.</p>
  <div class="start"><button class="primary" id="guided-ok">Got it</button></div></div>`, 'guided');
  $('guided-ok').onclick = () => $('modal').close();
}
$('modal').addEventListener('close', () => {
  const was = $('modal').className;
  if (was === 'guided') store.set('bhe-guided-seen', '1');
  else store.set('bhe-intro-seen', '1');
  if (was === 'intro') setTimeout(guidedNote, 0); // after How to use closes; setMode has run if a start button closed it
});
$('btn-assumptions').onclick = () => {
  const A = data.A, F = data.net.meta.fields;
  const val = path => { const v = path.split('.').reduce((o, k) => o?.[k], A);
    if (path === 'network.segmentCorrections') return v.map(c => `County SEGID ${c.SEGID}: ${c.county.STREET} ${c.county.TRVLWAY} → ${c.set.STREET} ${c.set.TRVLWAY}`).join('; '); if (path === 'growth.options') return Object.values(v).map(o => `${o.label.replace(/ \(.*/, '')}: ${o.units.toLocaleString()} units`).join(', '); return typeof v === 'object' ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ') : v; };
  modal(`<h2>Assumptions &amp; limits</h2>
  <p class="note">This is an educational comparison tool. It is not a calibrated fire-behavior or traffic model, not an official evacuation plan, and it must not guide real evacuation decisions. Follow official instructions: <a href="https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation" target="_blank" rel="noopener">City of Berkeley fire weather &amp; evacuation</a>.</p>
  <p>Labels used throughout: ${badge('sourced')} published data used as-is · ${badge('derived')} computed from sourced data · ${badge('assumption')} a placeholder you can change in <code>data/assumptions.json</code> · ${badge('model rule')} a simplification that makes the simulator work · ${badge('synthetic')} generated people or vehicles.</p>
  <h3>Editable assumptions and model rules (data/assumptions.json)</h3>
  <table>${Object.entries(A._meta).map(([k, m]) => `<tr><td><code>${k}</code></td><td>${esc(val(k))}</td><td>${badge(m.category)} ${esc(m.note)}</td></tr>`).join('')}</table>
  <h3>Street network fields</h3>
  <table>${Object.entries(F).map(([k, m]) => `<tr><td><code>${k}</code></td><td>${badge(m.category)} ${esc(m.source)}${m.note ? ' ' + esc(m.note) : ''}</td></tr>`).join('')}</table>
  <h3>Fire and ember overlay ${badge('model rule')}</h3>
  <p class="small"><b>Fire crews.</b> The fire's pace comes from real fires and the City's repeat of 1923 (Guided view: "Like 1923" and "Like 1991"), so it includes the firefighting effort seen in those fires. In a wind-driven fire the Fire Department expects crews to focus on supporting evacuation, and aircraft are grounded in high wind (SOURCE_NOTES FS14). The simulator does not add crews holding the fire's sides, or the fire stopping when the wind changes, as both 1923 and 1991 did (FS15). High severity ("Like 1991") slows after its first hour, as the 1991 head did in the built-up neighborhoods while crews arrived ${badge('model rule', 'After 60 minutes every spread rate at high severity is multiplied by 0.2; ember throw continues, as the 1991 wind blew until about 7:30 p.m. Fitted to the 1991 record: a 1991-like fire in the model reaches a median of 693 structures in its first hour, 1,067 by 2 h, 1,772 by 4 h and 2,995 by 8.5 h, against about 800, 1,100, 1,700 and 2,900 ("almost 800 structures were ignited within the first hour and more than 300 per hour for the next seven hours", USFA-TR-060). Its burned area, 3.9 km² by 8.5 h, is under the 1991 fire\'s 6.0 km² on the model\'s grid. SOURCE_NOTES FV17.')}. Medium and low severity keep their rate for the whole run, so they may exaggerate the spread as winds die and firefighters establish control. Engines in the simulator only drive, to measure whether they could reach homes.</p>
  <p class="small">${esc(SEVERITY_NOTE)} Spread runs on ${CELL} m cells: wind sets an elliptical shape (Anderson 1983 length-to-breadth, capped at ${LB_MAX}); uphill is faster and downhill slower; a proxy fuel factor comes from the City fire zones of the 2025 Fire Code (${Object.entries(FUEL).map(([k, v]) => `${k} ${v}`).join(', ')}; the Panoramic and Grizzly Peak Mitigation Zones are wildland interface, the rest of the hill fire zones hill residential), not from vegetation data ${badge('sourced', 'Zones: Berkeley Fire Code 2025 (Council 2025-04-15, Special Item 02, Attachment 1); outlines from the City layer grizz_pano_mitigation (72 and 271 acres). No City layer draws the 2025 Hills zone, so it keeps the 2013 Fire Zones 2–3 outline less the two new zones (SOURCE_NOTES FV18, ISSUES.md I3).')}. The Fuel setting (Scenario, Expert view, off by default) swaps in LANDFIRE 2025 FBFM40 fuel models on the same cells, each with a factor from Rothermel's relative spread rate for its Scott and Burgan (2005) model ${badge('model rule', data.fuel40?.meta.provenance.factorRule || '')}; homes (LANDFIRE's NB1 urban class) keep the proxy, and the medium severity stays calibrated to the proxy (docs/fire-validation.md). Spot fires are random, so seeds differ. A cell is "ember-exposed" once any burning cell lies within the ember distance upwind. The 1923 reference fire is confined to the City's archival boundary.</p>
  <p class="small"><b>Wind.</b> Each wildfire's wind, 30 to 35 mph, is an extreme hour: dry north-east winds at the Oakland hills weather station average that strongly about 1% of the time (1992–2026). The 1923 and 1991 fires burned in such winds. In this model the speed sets only the fire's shape, which stops changing above about 18 mph, so a lower speed would give the same fires ${badge('derived', 'Oakland North RAWS, WRCC frequency tool, June 1992 – October 2026: of 7,340 hours with wind from 0–90° and humidity ≤ 25%, 1.3% averaged 30 mph or more (SOURCE_NOTES FF5). Length-to-breadth is capped at ' + LB_MAX + ', reached at about 11 mph (high severity), 14 mph (medium) and 18 mph (low); the head spread rate is calibrated, not computed from wind.')}.</p>
  <p class="small"><b>Earthquake fires</b> (Expert view only). Fires start in buildings, about 20 at once, drawn for each pass from the USGS HayWired fire-following model, and spread by the wildfire rules at ${fmt(Math.round(100 * QUAKE_ROS_FACTOR))}% of medium severity's rate ${badge('model rule', 'Fitted so the spring-afternoon fire reaches a median 2,363 structures inside Berkeley by 6 hours (seeds 1–5) against about 2,270 single-family-home equivalents of floor area HayWired burns in Berkeley\'s fire station areas. Before the winds were measured the factor was 0.37, fitted on an assumed wind from 270° at 10 mph; the lighter measured wind widens each fire, so the same factor burned about twice as much (SOURCE_NOTES EQ11, WC8).')}. Three winds, each measured at the Oakland hills weather station, June 1992 – October 2026 ${badge('derived', 'tools/wind-climate.mjs, data/model/wind-climate.json; SOURCE_NOTES WC1–WC8.')}: a spring afternoon at HayWired's 4:18 p.m., from 205° (south-south-west, off the Bay) at the hour's median speed, 7.0 mph easing to 5.4 mph by evening; a winter day with a north wind, from 0° at 5.9 mph rising to 9.2 mph after dark (north winds there are mostly humid, not the dry Diablo wind); and the rare dry wind from 45° at 30 mph as the worst case. The wind changes each hour of the run; each crossing of a 30 m cell uses the wind in force when it starts, and a burning cell can start a crossing again when the wind changes. At the ridge the spring wind keeps its direction into the evening and only slows; the reversal to an offshore wind comes later at night, on about one spring night in seven at Oakland airport (SOURCE_NOTES WC5). Starts, spread and winds are the same under every plan.</p>
  <p class="small"><b>Visibility</b> (scenario setting, Expert view, off by default). Poor visibility, from fog or smoke, lowers free-flow speed on every street by ${+(100 * (1 - A.visibility.poor.speedFactor)).toFixed(1)}%, for residents and fire engines ${badge('sourced', A.visibility.source)}${A.visibility.poor.capacityFactor < 1 ? `, and every lane's and junction's capacity by ${fmt(Math.round(100 * (1 - A.visibility.poor.capacityFactor)))}%` : '; lane and junction capacity is not cut, because the only FHWA capacity figure (12%, freeways) traces to a source that could not be read and that another FHWA report contradicts'}. FHWA gives no figure for fog or smoke on city streets, so applying the speed cut to every street is ${badge('assumption')}. ${esc(A.visibility.fireNote)} The households, parked cars and fire are the same as on a clear day.</p>
  <p class="small"><b>Fire families</b> ${badge('assumption')} (off by default; the box under the fire in Guided view, and in Expert view's Scenario section). With them on, a comparison also runs each fire from other starting points (the 1923 fire keeps the City's) and with wind from 0°, 30°, 45° and 60°: 30–60° is the core of dry, windy hours at that station (20–70° held 71.8% of them), and 0° stands for the north winds (340–20° held 17.6%). The points are tied to past fire origins and the County's fire-pathway study and are our choices: no source gives where the next fire will start, so every start and wind counts equally. Speed, severity, time of day, duration and Berkeley's orders stay the fire's, so a start elsewhere can burn into Berkeley zones the fire's orders leave out; other cities' zones follow the rule below for every start. The 1923 fire stays inside the City's footprint at every wind, which cuts it more at 30° and 60° than at 45°; it would remove 93% of a fire from 0°, so the 1923 family leaves that wind out (SOURCE_NOTES FF16–FF18, WC9).</p>
  <p class="small"><b>Other cities' orders</b> ${badge('model rule')} Berkeley and Lab zones are ordered as the scenario says: the City's region for that fire. Every other evacuation zone (Oakland, Kensington and El Cerrito, Albany, Emeryville, Richmond, Orinda and unincorporated Contra Costa) is ordered ${A.orders.firePathDelayMin} minutes after the fire front first comes within ${A.orders.firePathKm} km of it ${badge('assumption', 'Eric\'s choice, 2026-11-02, after comparing 2 km and 1 km. No source gives when these jurisdictions order a zone. The delay is the simulator\'s default decision delay; a plan\'s order delay changes the scenario\'s orders only.')}, on every fire and every start, the same under both plans. Their residents' cars use the same roads. Evacuation time (ETE) still counts only cars from zones Berkeley's plan orders, as the Time Study does for its regions; the cars from other cities' zones slow it as traffic (SOURCE_NOTES FO1–FO6). The plan setting "…plus any zone within N km of the fire" still adds Berkeley zones, and other cities' zones a little sooner, since it measures a square around the fire rather than a circle.</p>
  <table><tr><th>Severity</th><th>Head spread (m/min)</th><th>Wind ×</th><th>Ember distance (m)</th><th>Spot probability</th><th>After the first hour</th></tr>${Object.values(SEVERITY).map(s => `<tr><td>${s.label}</td><td>${s.rosMpm}</td><td>${s.windFactor}</td><td>${s.emberM}</td><td>${s.spotProb}</td><td>${s.slowFactor ? `spread × ${s.slowFactor} after ${s.slowAfterMin} min` : 'same rate'}</td></tr>`).join('')}</table>
  <h3>Time of day ${badge('assumption')}</h3><p class="small">${esc(TIME_NOTE)}</p>
  <table>${Object.values(TIME_OF_DAY).map(t => `<tr><td>${t.label}</td><td>households awaiting a commuter ${t.commuterShare * 100}%, school in session ${t.schoolInSession * 100}%, background traffic allowance ${t.background * 100}%</td><td class="small">${esc(t.note)}</td></tr>`).join('')}</table>
  <h3>How people and vehicles are modeled ${badge('synthetic')}</h3>
  <ul class="small">
    <li>Households are synthetic. Each zone's Genasys population estimate (sourced; the 2020 Census count of the zone's blocks where Genasys publishes none, as in Oakland's hills beyond the City's layer, Kensington and El Cerrito) is cut to the share inside the model area, divided by its persons per household (ACS by place; the Time Study's ${A.demand.personsPerHousehold} where the ACS has no households, or everywhere under the citywide mix), and spread over the zone's streets in proportion to length. Residents are not reduced by time of day (Time Study).</li>
    <li><b>Future growth</b> (Scenario, both plans; Expert view only): added homes from the 2025 Evacuation Time Study's Hillside Overlay figures (${badge('sourced')} middle housing 870 units, maximum ADU build-out 27,060) or a moderate case (${badge('assumption')} ${A.growth.options.moderate.units.toLocaleString()} units). The study gives no split by street, so units go to Berkeley's Fire Zones 2–3 in proportion to today's households on each street ${badge('assumption')}. Each unit is a synthetic household drawn like today's (${A.demand.personsPerHousehold} persons, about 1.12 vehicles against the study's 1.14) and is counted in every result. Parked cars do not increase with growth. With the maximum build-out the simulator's 90% evacuation time in the large regions rises less than the study's (fall weekday, fire off: 1923 region +42% against +58%, Fire Zones 2–3 +3% against +97%), because its junctions pass traffic faster than the study's signals, so read growth's effect there as a lower bound. On Panoramic Hill it rises more (+120% against +25%): with one way out, its streets lock up and the simulator's gridlock rule decides much of the result, so that figure is less certain. <b>R0</b> (plan setting ${badge('model rule')}) bars added homes in one area and moves none elsewhere; it does not treat homes lost to fire as people moving out. Legal status: ${esc(A.growth.r0.legal)}</li>
    <li>Households without a vehicle: each zone's ACS share by default (about ${data.demand ? `${(data.demand.aggregate.berkeley.zeroVehicle.value * 100).toFixed(1)}%` : 'a fifth'} across Berkeley's zones), or the Time Study's ${(A.demand.householdsWithoutVehicleShare * 100).toFixed(2)}% under the citywide mix. ${A.demand.carlessRideshareShare * 100}% of those ride with a neighbor on the same street (Time Study survey, whose carless respondents may differ from the ACS's carless households); the rest are stranded and counted as at risk. Households that drive take 1–4 vehicles (Time Study survey). Age is not used at all.</li>
    <li><b>Household mix</b> (Scenario, both plans; by place is the default, citywide is an Expert setting): <i>by place</i> gives each zone its own persons per household and share of households without a vehicle from ACS 2020–2024 block groups ${badge('derived')}, allocated to zones by 2020 Census housing units ${badge('assumption', 'A block group\'s rates are assumed to hold in each of its blocks.')}; zones without households in their 2020 blocks keep the Time Study's values ${badge('model rule')}. The ACS puts ${data.demand ? `${(data.demand.aggregate.berkeley.zeroVehicle.value * 100).toFixed(1)}%` : 'about a fifth'} of households in Berkeley's zones without a vehicle, against the Time Study survey's 7.47%. The ACS is the default because it is the census measure, with published margins of error, and shows where carless households live; the survey is self-selected (Eric, 2026-11-04; SOURCE_NOTES DM3, DM18). <i>Citywide</i> uses the Time Study's values everywhere and is what the calibration against the study runs on. Each zone's people 75 and older, people with an ambulatory difficulty (ACS, tract level), households of one person 65+, and licensed care, hospital and school capacity are shown in the Inspector as figures only. Nobody in the simulator needs help to leave: no pickup, no paratransit, no facility evacuation. Walking from the door to the car takes no time unless the home-to-street access setting is on, and that setting uses central walking speeds, not reduced-mobility ones. A design for assisted evacuation is in <code>docs/design/assisted-evacuation.md</code>.</li>
    <li>Who leaves: everyone in Order zones, ${A.demand.compliance.warning * 100}% of Warning zones, and ${A.demand.compliance.shadow * 100}% of all other households in the model area (Berkeley and the neighboring parts of Oakland, Emeryville, Albany, Kensington, El Cerrito and Richmond, which roughly match the Time Study's Shadow Region) as shadow evacuees driving out of the modeled area (Time Study). Orders follow the Time Study's zone lists for the 1923 and Panoramic Hill regions, the City's Fire Zones 2–3 region for the east-wind fires, and optionally the plan's distance rule.</li>
    <li>When: each household's departure after the order is drawn from the Time Study's survey-based mobilization tables (Table 5-9), which include noticing the order and getting ready. Households waiting for a commuter, or picking up children on school days, leave later.</li>
    <li>Evacuation time is measured like the Time Study's ETE: from the first order until 90% (and 100%) of evacuating vehicles have left the order and warning area. <code>node tests/calibration.mjs</code> compares the simulator with the study's results with the fire switched off.</li>
    <li>Vehicles may use every street. They head for the nearest road node outside every ordered or warned zone and the ember area, and, under Today's model, re-plan every minute around queues, fire and embers. Other ways drivers could find their route are under Driver information and routing below.</li>
    <li>Each link passes at most its capacity, holds at most its storage, and each intersection passes at most its capacity. On two-way streets with only one moving lane between parked cars, both directions share that lane: when cars come from both ways they take turns at gaps such as driveways, and the street loses capacity. Removing parking does not add evacuation lanes on two-way streets.</li>
    <li>Parked cars vary by block and seed: hill blocks are parked on one side or both, some cars sit partly off the pavement, and an occasional bad parking job (a wide vehicle, or a car far from the curb) narrows the gap. Residents stop parking where less than 8 ft would remain for a car. The City survey's "width with parking" is treated as the both-sides case.</li>
    <li>At night, hill streets ${fmt(data.A.parking.range.night.narrowMinM / 0.3048)}–${fmt(data.A.parking.range.night.narrowMaxM / 0.3048)} ft wide are parked on both sides on ${fmt(100 * data.A.parking.range.night.narrowBothShareHills)}% of segments, leaving one car's width (8 ft): cars take turns and a modeled engine does not pass ${badge('assumption', A_NOTE('parking.range.night.narrow'))}. The rule rests on one night's count, at about 1 a.m. on 2026-11-05, of 11 narrow blocks, 10 of them parked on both sides. An Expert-view setting (Scenario) restores the rule used before that count.</li>
    <li>Households awaiting a commuter (Time Study) wait for that person to drive home first. The commuter enters at the edge of the evacuating area nearest home and drives in against the outbound traffic. A commuter turned back by fire leaves the household one car short.</li>
    <li>Gridlock relief: a vehicle stuck ${data.A.capacity.gridlockReliefS} s at the head of a queue squeezes forward. Without it the queue model can lock up for good in rings such as traffic circles.</li>
    <li>Engines travel from the nearest station to the road point nearest the ignition that the fire has not yet reached. Modeled engines do not pass segments narrower than an engine (with parked cars), and are delayed by oncoming evacuees where only one lane is clear.</li>
    <li>Engine reach ${badge('model rule')}: a home counts as reached within the City's ${data.A.access.engineServiceMin}-minute standard ${badge('sourced')} when an engine from one of Berkeley's 7 stations can drive to the nearer end of the home's street segment in that time, at ignition, before traffic and fire, on a route where every segment leaves 10 ft clear between parked cars and no fixed barrier closes it (gates and removable bollards cost ${data.A.access.barrierDelayS / 60} min). The home's own segment need not pass: the engine stops at its end. Engines drive both ways on one-way streets at 1.15 times the posted speed, with no turn or grade delays, so drive times are short: in the runs tested nearly every hill home with an engine route is within 5 minutes, and the measure mostly counts homes that parked cars cut off. Stations in Oakland, Kensington and Albany are not modeled, so the measure covers Berkeley's evacuation zones only. It says nothing about what an engine does on arrival.</li>
  </ul>
  <h3>Driver information and routing (plan setting, Expert view)</h3>
  <p class="small">Every option sends drivers to the same places (outside the ordered and warned zones and the illustrative fire's ember area) ${badge('model rule')}; the options differ in what drivers know on the way and whom they follow. The households that follow an option are drawn per household from a seeded stream of their own, so plans that differ only in routing see the same households, parked cars and fire.</p>
  <ul class="small">${Object.values(ROUTING).map(o => `<li><b>${esc(o.label)}</b> ${badge(o.category)}: ${esc(o.note)}</li>`).join('')}
    <li><b>Share of drivers who follow</b> ${badge('assumption')}: 100%, 65%, 50% or 15%. 15%: after the 2017 Northern and Southern California fires, 18–19% of surveyed evacuees used GPS and followed its route, and 7.5% after the 2018 Carr fire (Wong, Broader and Shaheen 2020, UC Institute of Transportation Studies, Table 10). 65%: in a 2024 evacuation drill in Roxborough Park, Colorado, 78 of 122 answers said the driver followed the route instructions (Dugstad et al. 2026). No real wildfire has measured compliance with official route guidance. The share stands in for everything the simulator cannot show: phone networks down or overloaded, people who distrust or ignore instructions, and agencies unwilling to direct people because of liability.</li>
    <li><b>Constrained guidance, settings</b>: forecast margin ${data.A.routing.forecastMarginMin} min ${badge('assumption')}; time tolerance ${data.A.routing.timeToleranceS} s ${badge('assumption')}; one second in the forecast ember area counts as ${data.A.routing.emberSecondWeight} s of driving ${badge('model rule')}; load balancing counts each car's queue delay ${1 + data.A.routing.systemQueueWeight} times ${badge('model rule')}. A street counts as in the forecast ember or fire area if embers or the front are forecast there by the time the driver would leave it, plus the margin. The forecast is the simulator's own fire, so it is never wrong; a real forecast would be uncertain, and the margin stands in for that. The comparison is the route the driver would take on their own (by habit). The time check uses current queues, and every following car at a junction gets the same route, so "never worse off" holds when the route is offered, not after the cars it sends together have built new queues. A route that is strictly safer under the forecast may be slower: with a perfect forecast the margin buys no safety in the simulator and only costs time, so some guided households reach safety later than by habit (see Households worse off below).</li>
    <li><b>Households worse off</b> ${badge('model rule')} (Compare, when the plans differ in routing; outcomes panel, against Habit or Today's model): a household is worse off under Plan B if it is still there when embers or the fire front reach it, or cut off, where it was not under Plan A, or leaves the order and warning area more than ${data.A.routing.worseOffDelayMin} min later, or not at all. Runs are paired by seed, households by identity. Which car reaches a junction first is partly chance, and changing only that order moves hundreds to thousands of households by more than ${data.A.routing.worseOffDelayMin} min, so Compare runs each plan a second time with another serving order and counts households worse off under both B runs than under both A runs ("beyond chance"). In test runs on three fires (SOURCE_NOTES DG23), every option, constrained guidance included, left some households worse off than Habit beyond chance in nearly every run, while leaving thousands better off.</li>
    <li><b>What no simulator run can justify.</b> These runs compare designs on synthetic households and an illustrative fire. None of them justifies deploying route guidance in an evacuation; at most they help decide whether a carefully constrained pilot study is worth designing. The simulator does not model the liability of telling people which way to go, how people respond to an instruction they do not trust, or what happens when the guidance itself is wrong.</li>
  <h3>Contraflow, police control and power shutoff ${badge('model rule')} ${badge('assumption')}</h3>
  <ul class="small">
    <li><b>Contraflow</b> (plan setting): once it starts, both lanes of a chosen two-way street carry traffic away from the order area and the inbound direction is closed. It runs only where at least ${fmt(2 * data.A.access.movingLaneM / 0.3048)} ft stays clear between the plan's parked cars (two 10-ft lanes); on narrower streets it gains nothing and the street stays two-way. The main hill exit streets are those that carried the most order-zone traffic out of the hills in status-quo runs, plus the entrances of the larger access-constrained areas (<code>tools/contraflow-streets.mjs</code>). A street runs contraflow only while its zone is ordered or warned: a segment in a zone told later starts later, and one in a zone the run never orders or warns stays two-way. Junction capacity is unchanged, so where the junction at the bottom of a street is the bottleneck, contraflow adds room to queue but not throughput. Costs it models: returning commuters do not drive in (they turn back or reroute), and the model sends no engine up a contraflow street (engines take another route or find none). Officer-staffed contraflow needs one officer at every entry point (the street's outbound end and every side-street junction) and starts when they arrive; pre-installed signs and gates start ${OPS().contraflow.signDelayMin} min after the order. A sign fails if the fire reaches it first, or if it runs on grid power alone during a power shutoff; a failed sign falls back to officers or to no contraflow. Battery backup is assumed to last the whole run, which a shutoff that starts a day ahead of the fire might not allow. Not modeled: drivers who ignore the signs, wrong-way crashes, the time to clear inbound traffic off the street before it reverses, and rehearsal making people leave sooner.</li>
    <li><b>Police control of junctions</b> (plan setting): officers arrive a set time after the first order and staff contraflow entry points first, then target junctions on the evacuation routes, busiest first (by the households whose first route passes through). An officer-controlled junction passes ${Math.round(OPS().police.capacityUplift * 100)}% more vehicles than its model capacity and lets approaches heading out of the order area go first. That uplift is an assumption kept modest: the Time Study models staffed control as actuated signal timing (§4.3, p. 4-7) and finds converting pre-timed signals to actuated cuts evacuation time by up to 13% (p. 10-9); manual control can also do worse than a signal. The simulator models signals only as a capacity per road class, so officer control acts on that capacity, not on real signal phases.</li>
    <li><b>Night parking on narrow hill streets</b> (scenario setting, both plans; Expert view only): the default parks both sides of most 17–24 ft hill streets at night, leaving 8 ft ${badge('assumption', A_NOTE('parking.range.night.narrow'))}; the other option is the rule used before the 2026-11-05 count, under which residents stop parking a second side where under 8 ft would remain. Daytime parking is the same under both.</li>
    <li><b>Home-to-street access time</b> (scenario setting, both plans; Expert view only; off by default): a household leaves its street later by the terrain's extra walking time from door to curb, for three legs (two trips out with belongings, one back) ${badge('assumption')}. Height and distance come from Microsoft building footprints and the 4 m lidar DEM, joined to the nearest street ${badge('derived')}; walking speed on slopes from Tobler's hiking function and stair speeds from Fruin (${badge('sourced')}). Each household's delay is drawn from a separate random stream, so turning the setting on moves no other draw. Reduced-mobility times (MUTCD 3.0 ft/s, NIST stair speeds) are reported in <code>docs/walk-access.md</code> and not applied. The DEM is bare earth: it shows no retaining walls, inside stairs or floor levels, and the route is a straight line, so a winding stair or driveway takes longer than this.</li>
    <li><b>Red Flag power shutoff</b> (scenario setting): dark signals run as all-way stops (California Vehicle Code §21800(d)) at about ${fmt(OPS().powerShutoff.allWayStopVph)} vehicles per hour through the junction, or less where the model's capacity was already lower. No public source says which Berkeley signals have battery backup, so none is assumed. An officer at a dark signal restores it to officer control. Streetlights, phones, alerts and water pressure, which a shutoff also affects, are not modeled.</li>
    <li><b>Weekday non-resident placement</b> (scenario setting, Expert view; default by area): the Time Study gives employee, student and visitor vehicles by area, not by street ${badge('sourced')}. By area spreads each area's vehicles over its streets by length ${badge('model rule')}. By workplace keeps those totals and places employees within a 10-minute walk (800 m) of the blocks where LEHD LODES 2023 counts jobs held by people living outside Berkeley ${badge('derived')}, and UC and Lab cars in off-street parking from OpenStreetMap, scaled to UC's published 5,500 spaces ${badge('model rule')}. LODES counts every employer, the study only those with 100 or more staff, and LODES puts all of UC's jobs on one block, so UC uses parking instead. With it on, weekday 90% times move by 0–5 min (calibration, fire off); the weekday gap to the study stays (docs/weekday-placement.md).</li>
  </ul>
  ${modelPerformanceHTML()}
  <h3>Known data gaps ${badge('assumption')}</h3>
  <ul class="small">
    <li><b>Traffic signal timing.</b> The City has not published its signal timings, so every junction gets a typical delay and a capacity by road class (<code>intersections</code> above). The 2025 Time Study used the City's timings and found intersections to be the main constraint.</li>
    <li><b>Parked cars at night.</b> One night's count (2026-11-05, about 1 a.m., 19 of 22 blocks) sets the night rule; there is no count for streets under 17 ft or for corners. Findings that change with the rule are labeled sensitive.</li>
    <li><b>Where employees, students and visitors park.</b> The Time Study gives vehicles by area, not by street; the simulator places them by area.</li>
    <li><b>How the Lab runs its gates, and which Berkeley signals have battery backup.</b> No public source; the simulator assumes exit-only gates and no backup.</li>
    <li><b>Fire behavior.</b> The fire uses a fuel proxy from the City fire zones, not vegetation data by default; where its embers land does not follow the County's Ember Threat Zones (docs/fire-validation.md).</li>
    <li>None of these needs a government response or a field survey to use the explorer; each is disclosed here and in DATA_INVENTORY.md.</li>
  </ul>
  <h3>What Phase 1 does not do</h3>
  <ul class="small">
    <li>Engines do not fight the fire. The simulator times an engine's drive from the nearest station to the fire edge, but nothing an engine does slows the fire, protects homes or helps people leave, so better engine access has no effect on the fire. Parking rules still change how much traffic hill streets carry; in the runs tested, the parking options made no consistent difference to people still there when embers arrived.</li>
    <li>No deaths or injuries. "Still there when embers arrived" counts people at home or on the road when embers first reached their street (any burning cell within the ember distance upwind); "…when the fire front arrived" counts those still there when the fire itself reached the street. Whether they would be hurt depends on house survival, sheltering, fire intensity and smoke, none of which the simulator models.</li>
    <li>Structures do not change how the fire spreads. Structures lost is an assumption range applied after the fact to City-footprint structures the fire front reached (below); structures reached only by embers get none; there are no home-hardening or vegetation effects yet (Phase 3, step 3e).</li>
    <li>Home-to-street access time is off by default; when on, it uses central walking speeds, not reduced-mobility ones. No assistance for people who need help (Phase 2).</li>
    <li>Employees, students, visitors and I-80 and CA-24 through traffic use the Time Study's vehicle counts, placed by area (an approximation).</li>
    <li>Intersection capacities are illustrative per road class; the study models each signal and stop sign. Traffic circles (900 vehicles per hour, Time Study) and diverters come from the City's list of traffic-calming devices (75 diverters, 63 circles); how each one channels traffic is read from OpenStreetMap. 13 of the 75 stay open: OpenStreetMap shows no restriction at 6 and only banned turns at 1 (turn bans are not modeled), 2 could not be placed on the network, and 4 would cut streets off or leave cars on one-way streets with no way out.</li>
    <li>Road closures beyond fire-blocked segments and contraflow streets are not modeled. Officers do not direct turning movements or close streets; they raise a junction's capacity and let outbound traffic go first.</li>
    <li>Streets outside Berkeley come from OpenStreetMap, with widths assumed from Berkeley's medians and lanes from OSM tags or by road class. The model area stops at the edge of the elevation grid (37.84–37.91° N, 122.33–122.21° W: about 1 km into Oakland, the middle of Kensington, the Caldecott Tunnel); traffic that reaches the edge has left, and people beyond it are not modeled (about 1,500 of Kensington's 5,428 residents in the 2020 Census).</li>
    ${data.structures ? `<li>Structures the fire front or embers reached ${badge('derived')} count City of Berkeley footprints in Fire Zones 2–3 (${fmt(data.structures.meta.totals.structures)}, 2023), each in the 30 m fire cell holding its center, and OpenStreetMap building outlines elsewhere (OpenStreetMap maps about 23% more outlines than the City inside Fire Zones 2–3, likely including garages and sheds). They are exposure, the same under every plan: the simulator does not model structures igniting or burning, so these are not homes lost and not a prediction. The gap between structures is measured from the footprints: ${fmt(data.structures.meta.totals.under25ft)} of them stand under 25 ft from the nearest one. The City layer's distance field reads about 27% high, as distances measured on a Web Mercator map do at Berkeley's latitude (SOURCE_NOTES PH10).</li>` : ''}
  </ul>`);
};
$('btn-sources').onclick = () => {
  const S = [...(data.layers.meta.sources || []), ...(data.structures ? [
    { title: 'Structures in Fire Zones 2–3 (footprints, counted per 30 m cell)', category: 'sourced', publisher: 'City of Berkeley ArcGIS Online, Distance_between_structures_in_Fire_Zones_2_and_3_WFL1', retrieved: data.structures.meta.built, lastEdit: '2023-09-13', url: 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Distance_between_structures_in_Fire_Zones_2_and_3_WFL1/FeatureServer/3', why: 'Structures the fire front or embers reach (results, context) and the Structures map layer. Only geometry and the distance field are read; counts per cell are kept, footprints are not.' },
    { title: 'OpenStreetMap building outlines (outside Fire Zones 2–3)', category: 'sourced', publisher: '© OpenStreetMap contributors, ODbL; Overpass API', retrieved: (data.structures.meta.sources.structuresOther || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '', why: 'Structures the fire front or embers reach outside Fire Zones 2–3 (results, context). Geometry only; counts per cell are kept.' }] : [])];
  modal(`<h2>Data sources</h2><p class="small">Every imported layer, where it came from and how the simulator uses it. See <code>DATA_INVENTORY.md</code> for missing inputs.</p>
  <p class="small">Each layer stays under its publisher's terms. OpenStreetMap data © OpenStreetMap contributors, available under the <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Open Database License</a>; the street network built with it carries that license. The simulator's code is MIT-licensed; its writing, including the text on this page, is CC BY 4.0, both © 2026 Eric Friedman and both requiring attribution (<code>LICENSE</code>, <code>LICENSE-TEXT.md</code>).</p>
  <table><tr><th>Layer</th><th>Publisher · retrieved</th><th>Used for</th></tr>${S.map(s => `<tr><td>${esc(s.title)} ${badge(s.category)}${s.url ? `<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener">service</a></div>` : ''}</td><td class="small">${esc(s.publisher)}<br>${esc(s.retrieved || '')}${s.lastEdit ? `<br>last edited ${esc(s.lastEdit)}` : ''}</td><td class="small">${esc(s.why)}</td></tr>`).join('')}</table>`);
};

// ---------- access-constrained areas (Expert view, Map section) ----------
const H = { badge, esc, fmt };
if (data.access) {
  $('access-summary').innerHTML = accessSummary(data, H);
  $('access-table-link').onclick = ev => {
    ev.preventDefault();
    const t = accessTable(data, H, a => {
      $('modal').close();
      if (!map.layers.access) { map.layers.access = true; [...$('layers').querySelectorAll('label')].find(l => l.textContent.trim() === LAYER_NAMES.access).querySelector('input').checked = true; legend(); }
      const [x0, y0, x1, y1] = a.bbox; map.fit([x0 - 150, y0 - 150, x1 + 150, y1 + 150]);
      map.selected = { kind: 'edge', id: a.chokeEdges[0] }; inspect(map.selected); map.draw();
    });
    modal(t.html, 'wide'); t.render();
  };
}

// ---------- start ----------
growthNote(); shutoffNote(); quakeNote(); visibilityNote(); fuelNote(); walkNote(); nightParkingNote(); showScenario(); showPlan(); legend(); newRun();
setMode(localStorage.getItem('bhe-mode') || 'simple');
if (!localStorage.getItem('bhe-intro-seen')) intro();
requestAnimationFrame(loop);
