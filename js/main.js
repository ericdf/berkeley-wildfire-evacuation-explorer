import { loadData } from './data.js';
import { buildFireGrid, runFire, cellOf, demAt, FUEL, LB_MAX, CELL } from './fire.js';
import { makeScenarios, SEVERITY, SEVERITY_NOTE, TIME_OF_DAY, TIME_NOTE, ETE_TARGETS } from './scenarios.js';
import { Evacuation, DEFAULT_PLAN, titleCase } from './sim.js';
import { PARKING_PLANS } from './parking.js';
import { PRESETS, FIRES } from './presets.js';
import { MapView, STREET_MODES } from './map.js';
import { fromUTM } from '../tools/utm.mjs';
import { accessCard, accessSummary, accessTable, accessLegend } from './access.js';
import { ROUTING, routingOf, complianceOf, worseOff, worseOffBeyondChance } from './guidance.js';
import { SHUTOFF } from './operations.js';
import { loadMitigations, damageHTML, leversHTML, leverPreset } from './mitigate.js';

const $ = id => document.getElementById(id);
const fmt = (x, d = 0) => x == null || Number.isNaN(x) ? '—' : x === Infinity ? '∞' : Number(x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const mins = x => x == null ? '—' : x === Infinity ? 'none' : `${fmt(x)} min`;
const hm = s => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAT = { sourced: 'sourced', derived: 'derived', assumption: 'assumption', 'model rule': 'rule', mixed: 'derived', synthetic: 'synthetic', unknown: 'missing' };
const badge = (cat, tip) => `<span class="badge b-${CAT[cat] || 'missing'}"${tip ? ` title="${esc(tip)}"` : ''}>${cat === 'unknown' ? 'no data' : cat}${tip ? ' ⓘ' : ''}</span>`;
const srcCat = src => !src ? 'unknown' : src.startsWith('city:') ? 'sourced' : src.startsWith('assumption:') ? 'assumption' : src.startsWith('derived:') ? 'derived' : src === 'unknown' ? 'unknown' : 'derived';

const A_NOTE = k => data.A._meta[k]?.note || '';
const state = {
  plans: { A: { ...DEFAULT_PLAN, name: 'Plan A: baseline' }, B: { ...DEFAULT_PLAN, name: 'Plan B: leave early + targeted parking', earlyShare: 0.5, hillsParking: 'narrow' } },
  editing: 'A', preset: null, fire: null, playing: false, speed: 900, sim: null, fires: new Map(), batch: 0,
};

const [data] = await Promise.all([loadData(), loadMitigations()]);
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
  neighborhoods: 'Neighborhoods', fire1923: '1923 boundary', cityBoundary: 'City limits', stations: 'Stations & shelters', noParking: 'No-parking signs', tightTurns: 'Tight turns', access: 'Access constraints',
  fire: 'Fire & embers', vehicles: 'Vehicles', queues: 'Queues', responder: 'Responder route' };
for (const [k, label] of Object.entries(LAYER_NAMES)) {
  if (k === 'access' && !data.access) continue; // optional data file
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox" ${map.layers[k] ? 'checked' : ''}> ${label}`;
  l.querySelector('input').onchange = e => { map.layers[k] = e.target.checked; if (k === 'access') inspect(map.selected); map.draw(); legend(); };
  $('layers').append(l);
}

const scenario = () => scenarios.find(s => s.id === $('scenario').value);
const PLAN_FIELDS = ['name', 'alertKm', 'orderDelayMin', 'hillsOrderMin', 'earlyShare', 'earlyZones', 'hillsParking', 'r0',
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
  p.earlyShare = +$('p-earlyShare').value; p.earlyZones = $('p-earlyZones').value; p.hillsParking = $('p-hillsParking').value;
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
    A street runs two outbound lanes only where at least ${fmt(2 * lane)} ft stays clear between this plan's parked cars; narrower streets stay two-way (the Inspector says which). Once it starts, nobody drives in: returning commuters turn back or find another way, and engines cannot drive up it. Junction capacity is unchanged. ${signs
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
// Growth is part of the world both plans face. Simple view always runs today's population.
const world = () => document.body.classList.contains('simple') ? { growth: 'none', powerShutoff: 'none' } : { growth: $('growth').value, powerShutoff: $('powerShutoff').value };
for (const [k, o] of Object.entries(data.A.growth.options)) $('growth').add(new Option(o.label, k));
if (!data.access) { const o = $('p-r0').querySelector('option[value="access"]'); o.disabled = true; o.textContent += ' (needs data/model/access-constraints.json)'; }
const growthNote = () => { const o = data.A.growth.options[$('growth').value]; $('growth-note').innerHTML = `${esc(o.note)} ${badge(o.category)}`; };
function r0Note() {
  const v = $('p-r0').value, R = data.A.growth.r0;
  $('r0-note').innerHTML = v === 'none' || !v ? esc(R.none)
    : `${esc(R.areas[v])} <b>Legal status:</b> ${esc(R.legal)} ${badge('model rule', R.provenance)}${$('growth').value === 'none' ? ' <span class="muted">No effect while Future growth is set to none.</span>' : ''}`;
}
for (const [k, label] of Object.entries(PARKING_PLANS)) $('p-hillsParking').add(new Option(label, k));
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
    ${tr(`Households worse off than under ${esc(ROUTING[base].short)}`, fmt(w.households), `Same fire, households, parked cars and seed; only routing differs. Worse off: still there when embers or the fire front reached them, or cut off, where they were not under ${ROUTING[base].short}, or reaching safety more than ${thr} min later or not at all (model rule).`)}
    ${tr('…beyond chance: worse off in both of two junction serving orders', `${fmt(wb.households)}${wb.later ? ` · worst ${fmt(wb.worstDelayMin)} min later` : ''}`, 'This run and a rerun with another order of serving cars at junctions, against the comparison and its rerun: a household counts only if it does worse in both runs than in both comparison runs. This filters out most households whose outcome changed by the luck of reaching a junction first.')}
    ${tr('…of these, newly still there when embers or the fire front arrived, or cut off', fmt(wb.embers + wb.fireFront + wb.cutOff), 'Households whose outcome level got worse, not only their arrival time.')}
    ${tr('Chance alone: households "worse off" when only the junction serving order changes', fmt(floor.households), `Two runs of ${ROUTING[base].short} that differ only in the order cars are served at junctions. A count near this one is within chance.`)}
    ${tr(`Households better off than under ${esc(ROUTING[base].short)} · average change in time to safety`, `${fmt(better.households)} · ${w.meanGainMin == null ? '—' : `${w.meanGainMin >= 0 ? fmt(w.meanGainMin, 1) + ' min faster' : fmt(-w.meanGainMin, 1) + ' min slower'}`}`, 'Average over households that reached safety in both runs.')}
  </table><p class="small muted">Synthetic households on an illustrative fire: a comparison, not a prediction.</p>`;
}

function showScenario() {
  const sc = scenario();
  $('scenario-blurb').innerHTML = `${esc(sc.blurb)} <span class="badge b-${sc.kind === 'historical reference' ? 'sourced' : 'rule'}">${sc.kind}</span>`;
  $('scenario-sources').innerHTML = sc.sources.map(s => `<li>${esc(s)}</li>`).join('') + (sc.calibration ? `<li><b>Calibration:</b> ${esc(sc.calibration)}</li>` : '') + `<li>Ignition: ${esc(sc.ignitionLabel)}; wind from ${sc.windFrom}° at ${sc.windMph} mph; runs ${sc.durationMin} min.</li>`;
  $('tod').value = sc.timeOfDay; todNote();
  $('scrub').max = sc.durationMin;
}
$('scenario').onchange = () => { showScenario(); newRun(); };
const todNote = () => { $('tod-note').textContent = TIME_OF_DAY[$('tod').value].note; };
$('growth').onchange = () => { growthNote(); r0Note(); newRun(); };
['severity', 'seed', 'tod'].forEach(id => $(id).onchange = () => { todNote(); newRun(); });
$('street-mode').onchange = e => { map.streetMode = e.target.value; map.draw(); legend(); };
$('speed').onchange = e => state.speed = +e.target.value;
$('run').onclick = () => { if (state.sim.t >= state.sim.end) newRun(); state.playing = !state.playing; runLabel(state.playing ? '❚❚ Pause' : '▶ Play'); update(false); };
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
// Presets fix the time of day and both plans; the chosen fire sets the scenario. The expert
// controls are hidden but stay in sync, so switching to Expert shows exactly what the preset set.
// A question is offered on a fire only where its answer held in every tested run (presets.js).
function renderSimple() {
  const p = state.preset, fire = FIRES.find(f => f.id === state.fire);
  const lever = p?.lever;
  $('simple').innerHTML = `<h2><span class="step">1</span> Pick a fire</h2>
    <div class="fires">${FIRES.map(f => `<button class="fire-pick${f.id === state.fire ? ' on' : ''}" data-fire="${f.id}"><b>${esc(f.title)}</b><span>${esc(f.line)}</span></button>`).join('')}</div>
    <h2><span class="step">2</span> See what it does</h2>
    ${damageHTML(state.fire)}
    <div class="btns"><button id="watch-today" class="${p?.id === 'today' ? 'on' : ''}">▶ Watch it with today's plan</button></div>
    <h2><span class="step">3</span> Explore what would help</h2>
    ${p && p.id !== 'today' ? `<div class="chosen"><div class="plans-ab"><div><b>Plan A</b> ${esc(p.A.name.replace(/^A: /, ''))}</div><div><b>Plan B</b> ${esc(p.B.name.replace(/^B: /, ''))}</div>
      <div class="small muted">${esc(scenario().name)} · ${p.tods ? 'time of day as above' : esc(TIME_OF_DAY[p.tod].label)} · central severity</div></div>
      <div class="watch"><b>What to look for.</b> ${esc(p.on[state.fire])}</div>
      <div class="btns"><button data-watch="A" class="${state.editing === 'A' ? 'on' : ''}">▶ Watch Plan A</button><button data-watch="B" class="${state.editing === 'B' ? 'on' : ''}">▶ Watch Plan B</button>
      <button class="primary" id="simple-compare">Compare A and B on 9 fires</button> <button id="simple-close">✕ Close</button></div>
      <div id="simple-result"></div>
      <p class="small muted">Watch starts that plan on the map; pause, restart or slow it with the buttons beside the clock on the map. Compare runs both plans on the same 9 fires (low, central and high severity, 3 random seeds each) and the same households, takes a few minutes, and shows the answer here. Trust a difference that shows up in every run.</p></div>` : ''}
    <div id="levers">${leversHTML(state.fire)}</div>
    <details${p && !lever && p.id !== 'today' ? ' open' : ''}><summary>Other questions</summary>
      <div class="presets">${PRESETS.map(q => { const ok = q.on[state.fire]; return `<button class="preset${p?.id === q.id ? ' on' : ''}" data-id="${q.id}"${ok ? '' : ' disabled'}><b>${esc(q.title)}</b><span>${esc(q.question)}</span>${ok ? '' : `<span class="why">Not offered on ${esc(fire.title)}: ${esc(q.off[state.fire])}</span>`}</button>`; }).join('')}</div>
      <p class="small muted">These questions use their own Plan A and time of day, so their numbers differ from the list above. The Expert switch at the top lets you set everything yourself.</p></details>`;
  $('simple').querySelectorAll('.fire-pick').forEach(b => b.onclick = () => pickFire(b.dataset.fire));
  $('simple').querySelectorAll('.preset').forEach(b => b.onclick = () => { if (!b.disabled) applyPreset(b.dataset.id); });
  $('simple').querySelectorAll('.try').forEach(b => b.onclick = () => { applyPreset(leverPreset(b.dataset.lever, state.fire)); $('simple').scrollIntoView({ behavior: 'smooth' }); });
  $('watch-today').onclick = () => { applyPreset(todayPreset()); state.playing = true; runLabel('❚❚ Pause'); };
  $('simple').querySelectorAll('[data-watch]').forEach(b => b.onclick = () => { state.editing = b.dataset.watch; showPlan(); if (p.tods) { $('tod').value = p.tods[state.editing]; todNote(); } newRun(); renderSimple(); state.playing = true; runLabel('❚❚ Pause'); });
  if ($('simple-compare')) $('simple-compare').onclick = () => { $('cmp-scope').value = 'severities'; $('compare').click(); };
  if ($('simple-close')) $('simple-close').onclick = () => applyPreset(todayPreset());
}
// Today's plan on the chosen fire, as in step 2 (the mitigation baseline: DEFAULT_PLAN, fall night).
const todayPreset = () => ({ id: 'today', title: "Today's plan", tod: 'S6', A: { ...DEFAULT_PLAN, name: "A: today's plan" }, B: { ...DEFAULT_PLAN, name: "B: today's plan" }, on: {}, off: {}, headline: null, always: true });
// The chosen fire applies to every question. Keep the current question if it holds on the new
// fire; otherwise switch to the first question that does.
function pickFire(id) {
  state.fire = id; localStorage.setItem('bhe-fire', id);
  // Step 2 shows the fire with today's plan; a chosen lever or question is reapplied on the new fire when it can be.
  const p = state.preset;
  if (p?.lever) applyPreset(leverPreset(p.lever, id));
  else if (p && p.id !== 'today' && p.on[id]) applyPreset(p.id);
  else applyPreset(todayPreset());
}
function applyPreset(idOrPreset) {
  const p = typeof idOrPreset === 'string' ? PRESETS.find(q => q.id === idOrPreset) : idOrPreset;
  if (!p.always && !p.on[state.fire]) return; // withheld on this fire
  state.preset = p;
  $('scenario').value = state.fire; showScenario();
  $('tod').value = p.tod; todNote(); $('severity').value = 'central'; $('seed').value = 1;
  state.plans.A = { ...p.A }; state.plans.B = { ...p.B }; state.editing = 'A'; showPlan();
  $('compare-out').innerHTML = ''; newRun(); renderSimple();
}
function setMode(m) {
  // Simple view runs without growth (world()), so a switch rebuilds the run once the class has changed.
  const rerun = (document.body.classList.contains('simple') || document.body.classList.contains('expert')) && !document.body.classList.contains(m) && ($('growth').value !== 'none' || $('powerShutoff').value !== 'none');
  document.body.classList.toggle('simple', m === 'simple'); document.body.classList.toggle('expert', m === 'expert');
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  localStorage.setItem('bhe-mode', m);
  if (m === 'simple' && !state.preset) pickFire(state.fire); // pickFire starts a new run
  else { if (rerun) newRun(); if (m === 'simple') renderSimple(); }
}
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
// Changing any expert control leaves the preset; the simple view then shows no plan detail.
document.querySelectorAll('#left .expert-only select, #left .expert-only input').forEach(el => el.addEventListener('change', () => { if (state.preset) { state.preset = null; renderSimple(); } }));

// ---------- runs ----------
function getFire(sc, sev, seed) {
  const k = `${sc.id}|${sev}|${seed}`;
  if (!state.fires.has(k)) state.fires.set(k, runFire(grid, sc, SEVERITY[sev], seed));
  return state.fires.get(k);
}
function newRun() {
  const sc = scenario(), sev = $('severity').value, seed = +$('seed').value || 1;
  state.sim = new Evacuation(data, grid, getFire(sc, sev, seed), sc, sev, { ...state.plans[state.editing] }, seed, TIME_OF_DAY[$('tod').value], world());
  map.sim = state.sim; state.playing = false; runLabel('▶ Play'); $('scrub').value = 0;
  $('run-plan').textContent = `Plan ${state.editing}${state.preset ? ': ' + state.plans[state.editing].name.replace(/^[AB]: /, '') : ''}`;
  update(true); map.draw();
}
function seek(tSec) {
  if (!state.sim || tSec < state.sim.t) newRun();
  while (state.sim.t < tSec && state.sim.t < state.sim.end) state.sim.step();
  update(true); map.draw();
}
let last = performance.now(), lastUi = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const sim = state.sim;
  if (state.playing && sim) {
    let steps = Math.min(400, Math.round(state.speed * dt / sim.dt));
    while (steps-- > 0 && sim.t < sim.end) sim.step();
    if (sim.t >= sim.end) { state.playing = false; runLabel('▶ Play again'); update(true); map.draw(); requestAnimationFrame(loop); return; }
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
  $('clock').innerHTML = `${done ? '<span class="done-tag">✓ Run complete</span> ' : ''}t + ${hm(sim.t)} <span class="of">of ${hm(sim.end)}${done ? '' : state.playing ? ' · playing' : sim.t > 0 ? ' · paused' : ''}</span> <span class="sub">${esc(sc.name)} · ${SEVERITY[sim.sevKey].label} severity · seed ${sim.seed} · ${esc(sim.plan.name)}</span>`;
  const c = (k, v, cls = '', tip = '') => `<div class="card ${cls}" title="${esc(tip)}"><div class="v">${v}</div><div class="k">${k}${tip ? ' <span class="tip">ⓘ</span>' : ''}</div></div>`;
  const tr = (label, value, tip) => `<tr title="${esc(tip)}"><td>${label} <span class="tip">ⓘ</span></td><td class="num">${value}</td></tr>`;
  const exposed = S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  if ($('run-status')) $('run-status').innerHTML = done ? `<b>✓ Run complete.</b> ${esc(sim.plan.name)} ran the full ${hm(sim.end)} (h:mm) after ignition. The results on the right are final for this run; Play again restarts it.` : '';
  $('results').innerHTML = `<h2>${done ? 'Results at the end of the run' : 'Results so far'} ${badge('synthetic')}</h2>
    <p class="small muted">People are synthetic households placed from Genasys zone population estimates (2020 Census blocks where Genasys publishes none); the fire is an illustrative overlay. Compare plans on the same scenario and seed; do not read the numbers as predictions.</p>
    <div class="cards">
      ${c('people in ordered zones', fmt(S.orderedPeople), '', 'Residents of zones under an evacuation order so far. An order means leave now; the 2025 Evacuation Time Study assumes everyone in an order zone leaves.')}
      ${c('warned and leaving', fmt(S.warnedLeaving), '', 'Residents of zones under an evacuation warning (get ready, and leave now if you need extra time) who leave anyway. The Time Study assumes half of warned households leave.')}
      ${c('reached safety', fmt(S.reachedSafety), 'good', `Ordered or warned people whose household's vehicles left the order/warning area and ember zone. Includes ${fmt(S.riders)} people riding with a neighbor.`)}
      ${c('shadow evacuees on the move', fmt(S.shadowLeaving), '', `"Shadow evacuees" are people outside every order and warning zone who leave anyway, out of caution. The Time Study assumes 20% of them leave. They drive out of the modeled area and add ${fmt(S.shadowVehicles)} cars to the roads, but they are not counted in evacuation time.`)}
      ${c('left early (before ignition)', fmt(S.leftEarly), S.leftEarly ? 'good' : '', 'People who left on the Red Flag warning, before the fire started (plan setting: early departure). They are never in the evacuation traffic.')}
      ${c('on the road now', fmt(S.onRoad), '', 'Ordered or warned people whose car has left home but has not yet reached safety.')}
      ${c('ordered, not yet left', fmt(S.notLeft), S.notLeft ? 'bad' : '', 'People in ordered or warned zones still at home: getting ready (departure times from the Time Study survey), waiting for a commuter to drive home, or picking up children.')}
      ${c('no vehicle and no ride', fmt(S.noVehicle), S.noVehicle ? 'bad' : '', 'Carless households that found no neighbor to ride with (Time Study: 86.9% rideshare). Phase 2 adds buses, paratransit and check-ins.')}
      ${c('still there when embers arrived', fmt(exposed), exposed ? 'bad' : '', `People still at home or on the road when embers first reached their street. Not a count of deaths or injuries: many would shelter or come through unharmed. At home ${fmt(S.exposedHome)}; on roads ${fmt(S.exposedRoad)}; without a vehicle ${fmt(S.exposedNoVehicle)}; in zones with no order ${fmt(S.notOrderedExposed)}`)}
      ${c('still there when the fire front arrived', fmt(S.fireFrontHome + S.fireFrontRoad), S.fireFrontHome + S.fireFrontRoad ? 'bad' : '', `People still at home or on the road when the fire itself reached their street, a harsher measure than embers. Still not a count of deaths or injuries. At home ${fmt(S.fireFrontHome)}; on roads ${fmt(S.fireFrontRoad)}`)}
      ${c('vehicles cut off by fire', fmt(S.vehiclesNoRoute), S.vehiclesNoRoute ? 'bad' : '', 'Cars with no road out: the fire had closed every route from their street, almost always before they set off. Parking rules do not change this number; leaving earlier does.')}
    </div>
    <table class="kv" style="margin-top:8px">
      ${tr('Evacuation time after the first order (Time Study ETE): 50% / 90% / all vehicles out', `${mins(S.clearP50)} / ${mins(S.clearP90)} / ${S.clearP100 == null ? 'not yet' : mins(S.clearP100)}`, 'Minutes from the first evacuation order until half, 90% and all of the cars that started in ordered zones have left the order and warning area. This is how the 2025 Evacuation Time Study measures its evacuation time estimate (ETE).')}
      ${studyRow(sc)}
      ${tr('Last household with a car out (after the first order)', S.lastHousehold == null ? 'not yet' : mins(S.lastHousehold), 'Minutes from the first order until the last ordered or warned household with a car reached safety.')}
      ${tr('Vehicles on roads now · peak queued', `${fmt(S.vehiclesOnRoad)} · ${fmt(S.peakQueued)}`, 'Cars on the road at this moment, and the most cars waiting in queues at any one moment so far.')}
      ${tr(`Fire-engine travel to the fire edge: at ignition → now (City standard: ${data.A.access.engineServiceMin} min)`, `${S.responderFree === Infinity ? '<b style="color:#b91c1c">blocked by parked cars</b>' : mins(S.responderFree)} → ${S.responderBlocked ? '<b style="color:#b91c1c">blocked</b>' : mins(S.responderEta)}`, 'Minutes for a fire engine to drive from the nearest station to the nearest point of the fire edge it can reach: at ignition, and now, with evacuation traffic in the way. "Blocked" means parked cars leave less than an engine\'s width on every route. The City\'s standard is 5 minutes.')}
      ${tr(`Hill homes an engine can reach within ${data.A.access.engineServiceMin} minutes (City standard)`, `${fmt(S.engineReach5Share * 100, 1)}% · ${fmt(S.engineReach5People)} people`, `Share of synthetic residents of Berkeley's Fire Zones 2–3 whose street a fire engine can reach from the nearest of Berkeley's 7 fire stations within the City's ${data.A.access.engineServiceMin}-minute standard, at ignition, before traffic and fire, under this plan's parking rules and this seed's parked cars. Model rule: the engine must reach the nearer end of the home's street segment by a route on which every segment leaves an engine's width (10 ft) clear and no fixed barrier closes it; the home's own segment need not pass. ${fmt(S.engineReachUnreachablePeople)} of ${fmt(S.engineReachHillPeople)} hill residents have no engine route at all. Now, with evacuation traffic and the fire: ${fmt(S.engineReach5ShareNow * 100, 1)}% (a street the fire has reached counts as not reached; engines cannot drive up a contraflow street); averaged every 5 min since the first order: ${fmt(S.engineReach5ShareLiveMean * 100, 1)}%. This measures access only: engines do not fight the fire in this simulator, so it says nothing about firefighting outcomes. Color streets by "Engine drive time" (Expert view, Map) to see where.`)}
      ${tr('Street segments too narrow for an engine (this plan and seed)', fmt(S.engineBlockedSegments), 'Street segments where parked cars leave less than 10 ft, an engine\'s width, under this plan\'s parking rules and this seed\'s parked cars.')}
      ${tr('Two-way segments where oncoming drivers take turns', fmt(S.sharedLanes), 'Two-way street segments where parked cars leave room for only one moving car, so drivers meeting from opposite directions take turns at gaps such as driveways.')}
      ${tr('Commuters driving home into the area: home · turned back', `${fmt(S.commutersHome)} of ${fmt(S.commutersInbound)} · ${fmt(S.commutersTurnedBack)}`, 'On weekdays some households wait for a family member to drive home before leaving (Time Study: 13% of households midweek). How many of those commuters got home, out of all driving in, and how many turned back because the fire, or a contraflow street closed to inbound traffic, left no way home.')}
      ${S.contraflowPlannedEntries || S.officersUsed || S.signalsDark ? tr('Traffic operations: contraflow segments running · officers used · junctions officers control · signals dark', `${fmt(S.contraflowSegments)} · ${fmt(S.officersUsed)} · ${fmt(S.junctionsControlled)} · ${fmt(S.signalsDark)}`, 'Contraflow street segments with both lanes outbound so far; officers assigned from the plan\'s pool to contraflow entry points and junctions; junctions under officer control; signals dark in the Red Flag power shutoff (scenario setting). Model rules and assumptions; see Assumptions & limits. The event log lists what started when and what did not run.') : ''}
      ${tr('Zones ordered · warned', `${fmt(S.zonesOrdered)} · ${fmt(S.zonesWarned)}`, 'Evacuation zones under an order (leave now) and under a warning (get ready) so far.')}
      ${S.growthOption !== 'none' ? `<tr title="Homes added by the Future growth setting (Scenario, Expert view) and the residents living in them. They are counted in every number above. Homes barred by R0 are those the plan\'s R0 setting blocks in its area."><td>Future growth: added homes · residents (counted in every number above)${S.growthBlocked ? ` · homes barred by R0` : ''} ${badge('synthetic')}</td><td class="num">${fmt(S.addedUnits)} · ${fmt(S.addedResidents)}${S.growthBlocked ? ` · ${fmt(S.growthBlocked)}` : ''}</td></tr>` : ''}
    </table>
    ${routingPanel(sim, S, done)}
    <canvas class="spark" id="spark" width="330" height="60"></canvas>
    <div class="small muted"><span style="color:#b91c1c">■</span> vehicles queued &nbsp; <span style="color:#1d4ed8">■</span> on roads &nbsp; <span style="color:#0e7490">■</span> engine ETA (scaled)</div>
    ${S.bottlenecks.length ? `<h3>Worst queues so far</h3><table>${S.bottlenecks.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${b.max} veh</td><td class="num">t+${fmt(b.at)}m</td></tr>`).join('')}</table>` : ''}
    <p class="small muted">Not shown yet: structures exposed or lost (needs building footprints, Phase 3); households behind stairs (Phase 2). Population outside the modeled street network: ${fmt(S.unplacedPeople)}.</p>`;
  spark(sim);
  $('events').innerHTML = sim.events.map(e => `<li class="k-${e.kind}"><span class="t">t+${hm(e.t)}</span>${esc(e.text)}</li>`).join('');
  if (map.selected) inspect(map.selected, true);
}
// The Time Study's 90% time for the same region and time of day, so users can see how far off the
// simulator runs. The gap comes mostly from signal timing and non-resident parking, which we lack.
function studyRow(sc) {
  const T = ETE_TARGETS[sc.id === 'eastWindDay' ? 'eastWind' : sc.id], tk = $('tod').value;
  if (!T?.p90[tk]) return '';
  const weekday = tk === 'S1' || tk === 'S4';
  return `<tr><td>For scale: the 2025 Evacuation Time Study's 90% time for ${esc(T.region)}, ${esc(TIME_OF_DAY[tk].label)} (status quo, no fire) ${badge('sourced')}<div class="small muted">${weekday && sc.id !== 'panoramic'
    ? 'On weekdays the simulator runs 25–80 min faster than the study here, probably because it lacks the City\'s signal timing and where commuters and students park. Treat its times as a lower bound.'
    : sc.id === 'panoramic' ? 'The simulator runs within about 10 min of the study here.' : 'At night and on weekends the simulator runs 15–25 min faster than the study here.'} See Assumptions &amp; limits.</div></td><td class="num">${mins(T.p90[tk])}</td></tr>`;
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
function inspect(sel, quiet) {
  const box = $('inspector');
  map.selectedArea = sel?.kind === 'edge' && map.layers.access ? data.access?.edgeAreas.get(sel.id)?.[0] ?? null : null;
  if (!sel) { box.innerHTML = '<h2>Inspector</h2><p class="muted small">Click a street or an evacuation zone.</p>'; return; }
  const sim = state.sim, F = data.net.meta.fields;
  const row = (k, v, cat, note) => `<tr><td>${k}</td><td>${v}${badge(cat, note)}</td></tr>`;
  if (sel.kind === 'edge') {
    const e = data.net.edges[sel.id];
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
        rows += row('Parked sides (this run)', sd < 0 ? '—' : `${sd}${P.offPave[e.id] ? ', partly off the pavement' : ''}${P.pinchM[e.id] ? `; one bad parking job takes ${fmt(P.pinchM[e.id] / 0.3048, 1)} ft more` : ''}`, 'model rule', A_NOTE('parking.range'))
          + row('Clear width under this plan', Number.isNaN(cw) ? 'unknown' : `${fmt(cw, 1)} m (${fmt(cw / 0.3048)} ft)`, Number.isNaN(cw) ? 'unknown' : 'derived', 'Pavement width minus parked cars (8 ft per side, KLD), minus any bad parking job, for this run\'s seed')
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
        + row('Modeled households', fmt(hh), 'synthetic', `Population inside the modeled area ÷ ${data.A.demand.personsPerHousehold} persons per household`)
        + row('Households without a vehicle', fmt(noCar), 'synthetic')
        + row('Order issued', sim.orderT[sel.id] === Infinity ? 'no order in this run' : `t+${hm(sim.orderT[sel.id])}`, 'model rule')
        + row('Households gone so far', fmt(left), 'synthetic');
    }
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
    if (ctl) out += row('Officer control (this plan)', sim.ops.police.controlled ? `officers in control since t+${hm(sim.ops.police.t)}` : `officers take over at t+${hm(sim.ops.police.t)}`, 'assumption', `Officers from the plan's pool arrive ${sim.plan.officerDelayMin ?? data.A.operations.police.delayMin} min after the first order; the junction then passes ${Math.round(data.A.operations.police.capacityUplift * 100)}% more vehicles and serves approaches heading toward safety first (SOURCE_NOTES CF7, CF8).`);
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
    ops: sw('#1d4ed8', 'Contraflow running: both lanes out') + sw('#93c5fd', 'Contraflow planned, not started') + sw('#e07a1e', 'On the plan, too narrow for two lanes out') + sw('#9ca3af', 'On the plan, not running (see event log)') + '<div class="small muted">Junctions: <span class="dot" style="background:#7c3aed"></span>officer control · <span class="dot" style="background:#111"></span>dark signal (all-way stop)</div>',
  }[m];
  const extra = (map.layers.fire ? `<div><span class="dot" style="background:#ff7a00"></span>Active fire (last 15 min)</div><div><span class="dot" style="background:#5a1e19"></span>Burned</div><div><span class="dot" style="background:#ffb020;opacity:.6"></span>Ember exposure</div>` : '')
    + (map.layers.vehicles ? `<div><span class="dot" style="background:#1d4ed8"></span>Vehicle leaving · <span class="dot" style="background:#d97706"></span>commuter driving home · <span class="dot" style="background:#e11d48"></span>in ember area</div>` : '')
    + (map.layers.queues ? sw('rgba(200,20,40,.8)', 'Queue (width = how full)') : '')
    + (map.layers.responder ? sw('#0e7490', 'Engine route to fire edge') : '')
    + (map.layers.streets ? '<div><b style="color:#111">✕</b> diverter or bollard, closed to cars · <b style="color:#7c3aed">✕</b> engines can pass (City diverter list, OpenStreetMap)</div>' : '')
    + (map.layers.paths ? `<div><span class="sw" style="background:repeating-linear-gradient(90deg,#8a5a2b 0 3px,transparent 3px 6px)"></span>Paths &amp; stairways (no vehicles)</div>` : '');
  const access = map.layers.access && data.access ? accessLegend() : '';
  const open = localStorage.getItem('bhe-key') !== 'hidden';
  $('legend').innerHTML = `<button class="key-toggle" title="${open ? 'Hide' : 'Show'} the map key">${open ? 'Hide key ▾' : 'Show key ▸'}</button>${open ? `<div><b>${STREET_MODES[m]}</b>${L}${extra}${access}</div>` : ''}`;
  $('legend').querySelector('.key-toggle').onclick = () => { localStorage.setItem('bhe-key', open ? 'hidden' : 'shown'); legend(); };
}

// ---------- comparison ----------
$('compare').onclick = () => {
  readPlan();
  const scope = $('cmp-scope').value, seeds = [1, 2, 3], sc = scenario();
  const cases = scope === 'severities' ? ['low', 'central', 'high'].flatMap(sev => seeds.map(seed => ({ scenarioId: sc.id, sev, seed, tod: $('tod').value })))
    : scenarios.flatMap(s => seeds.map(seed => ({ scenarioId: s.id, sev: 'central', seed, tod: s.timeOfDay })));
  const W = world(), jobs = ['A', 'B'].flatMap(p => cases.map(c => ({ ...c, tod: state.preset?.tods?.[p] ?? c.tod, planKey: p, plan: { ...state.plans[p] }, world: W })));
  if (routingDiffers()) { for (const j of jobs) j.outcomes = true; jobs.push(...jobs.filter(j => j.planKey === 'A' || j.planKey === 'B').map(j => ({ ...j, planKey: j.planKey + '2', reshuffle: true }))); } // households worse off (js/guidance.js)
  const batch = ++state.batch, results = [];
  // Progress goes in a small banner above the map (Eric, 2026-11-01), visible from either panel.
  const progress = (t, done = 0) => { $('sim-banner').hidden = !t; $('sim-banner-text').textContent = t; $('sim-banner-bar').style.width = `${Math.round(100 * done / jobs.length)}%`; };
  if ($('simple-compare')) $('simple-compare').disabled = true;
  progress(`Comparing Plan A and Plan B: running ${jobs.length} simulations on the same fires and households. This takes a few minutes…`);
  worker.onmessage = ev => {
    const m = ev.data; if (m.batch !== batch) return;
    if (m.done) {
      progress(''); renderCompare(results, scope);
      if ($('simple-compare')) $('simple-compare').disabled = false;
      if (document.body.classList.contains('simple')) {
        $('simple-result').innerHTML = takeaway(results, scope) + '<p class="small muted">The full table is in the right-hand panel.</p>';
        $('compare-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    results.push(m); progress(`Comparing Plan A and Plan B: ${results.length} of ${jobs.length} simulations done…`, results.length);
  };
  worker.postMessage({ batch, jobs });
};
const METRICS = [
  ['People still there when embers arrived', S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, -1],
  ['  …at home with a car, not yet left', S => S.exposedHome, -1],
  ['  …on roads', S => S.exposedRoad, -1],
  ['  …without a vehicle', S => S.exposedNoVehicle, -1],
  ['People still there when the fire front arrived', S => S.fireFrontHome + S.fireFrontRoad, -1],
  ['People in ordered zones', S => S.orderedPeople, 0],
  ['Added residents (growth)', S => S.addedResidents, 0],
  ['People with no vehicle and no ride', S => S.noVehicle, -1],
  ['Left early', S => S.leftEarly, 0],
  ['Vehicles evacuating', S => S.vehicles, 0],
  ['90% of vehicles out, min after order (ETE)', S => S.clearP90, -1],
  ['Peak vehicles queued', S => S.peakQueued, -1],
  ['Vehicles cut off by fire (no road out)', S => S.vehiclesNoRoute, -1],
  ['Engine travel time at ignition (min; ∞ = blocked by parked cars)', S => S.responderFree, -1],
  ['Hill residents an engine cannot reach within 5 min (at ignition)', S => S.engineReachBeyond5People, -1],
  ['Hill residents with no engine route (at ignition)', S => S.engineReachUnreachablePeople, -1],
  ['Segments too narrow for an engine', S => S.engineBlockedSegments, -1],
  ['Commuters turned back (fire, or a contraflow street closed to them)', S => S.commutersTurnedBack, -1],
  ['Cars following the routing option (Habit: driving by habit)', S => S.routing ? S.routing.followers : null, 0],
  ['Hill residents an engine can reach within 5 min, live (mean share since the first order, %)', S => S.engineReach5ShareLiveMean == null ? null : S.engineReach5ShareLiveMean * 100, 1],
  ['Contraflow segments running', S => S.contraflowSegments, 0],
  ['Officers used (contraflow and junctions)', S => S.officersUsed, 0],
  ['Signals dark (power shutoff)', S => S.signalsDark, 0],
];
function renderCompare(results, scope) {
  const groups = scope === 'severities' ? ['low', 'central', 'high'] : scenarios.map(s => s.id);
  const gname = g => scope === 'severities' ? SEVERITY[g].label + ' severity' : scenarios.find(s => s.id === g).name;
  const pick = (p, g) => results.filter(r => r.job.planKey === p && (scope === 'severities' ? r.job.sev === g : r.job.scenarioId === g)).map(r => r.summary);
  const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const range = a => { const s = a.filter(x => x != null && !Number.isNaN(x)); return s.length ? `${fmt(Math.min(...s))}–${fmt(Math.max(...s))}` : '—'; };
  let html = `<h2>Plan comparison ${badge('synthetic')}</h2>
    <p class="small">Green or red means B is better or worse than A in every run, by at least 10%; gray means the change is smaller or points different ways across runs, so there is no clear difference. A: <b>${esc(state.plans.A.name)}</b> · B: <b>${esc(state.plans.B.name)}</b>.${results[0]?.job.world?.growth && results[0].job.world.growth !== 'none' ? ` Future growth for both: ${esc(data.A.growth.options[results[0].job.world.growth].label)}.` : ''} Both plans ran the same fires, households and random seeds (1–3). Values are the median of 3 seeds with the min–max range under it. A difference smaller than the range is not a robust result.</p>`;
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
  html += `<h3>Why the results differ (Plan B, first seed)</h3><ul class="small">${explain(results, groups[Math.floor(groups.length / 2)], scope)}</ul>`;
  $('compare-out').innerHTML = html;
}
// One plain sentence on the preset's headline metric: medians and in how many runs B beat A.
function takeaway(results, scope) {
  const p = state.preset; if (!p?.headline || scope !== 'severities') return '';
  const { label, f, dir } = p.headline;
  const pairs = results.filter(r => r.job.planKey === 'A').map(a => [f(a.summary), f(results.find(b => b.job.planKey === 'B' && b.job.sev === a.job.sev && b.job.seed === a.job.seed).summary)]);
  const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const ma = med(pairs.map(x => x[0])), mb = med(pairs.map(x => x[1]));
  const better = pairs.filter(([a, b]) => (b - a) * dir > 0).length, worse = pairs.filter(([a, b]) => (b - a) * dir < 0).length;
  const robust = better === pairs.length || worse === pairs.length;
  const exF = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  let other = '';
  if (f.toString() !== exF.toString() && !/embers arrived/.test(label)) {
    const ex = results.filter(r => r.job.planKey === 'A').map(a => exF(results.find(b => b.job.planKey === 'B' && b.job.sev === a.job.sev && b.job.seed === a.job.seed).summary) - exF(a.summary));
    if (!(ex.every(x => x < -0.5) || ex.every(x => x > 0.5))) other = ` People still there when embers arrived show no clear difference (B − A ranges from ${fmt(Math.min(...ex))} to ${fmt(Math.max(...ex))} across runs).${p.otherNote ? ' ' + esc(p.otherNote) : ''}`;
  }
  return `<div class="takeaway${robust ? '' : ' mixed'}"><b>${esc(label)}:</b> about ${fmt(ma)} under Plan A and ${fmt(mb)} under Plan B (median of ${pairs.length} runs). Plan B did better in ${better} of ${pairs.length} runs and worse in ${worse}.${robust ? '' : ' The difference does not hold in every run, so treat it as uncertain.'}${other} These are synthetic households on an illustrative fire, not a prediction.</div>`;
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
  const thr = data.A.routing.worseOffDelayMin, same = (x, y) => x.job.sev === y.job.sev && x.job.seed === y.job.seed && x.job.scenarioId === y.job.scenarioId;
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
    ${row('Households worse off under B', P.map(p => p.w.households), `Still there when embers or the fire front reached them, or cut off, where they were not under A, or reaching safety more than ${thr} min later or not at all (model rule).`)}
    ${row('  …beyond chance: worse off under B in both serving orders than under A in both', P.map(p => p.wb.households), 'Each plan also runs a second time with another order of serving cars at junctions; a household counts only if it does worse under both B runs than under both A runs.')}
    ${row('  …of these, newly still there when embers or the fire front arrived, or cut off', P.map(p => p.wb.embers + p.wb.fireFront + p.wb.cutOff), 'Outcome level worse, not only time.')}
    ${row('  …of these, worst delay (min)', P.map(p => p.wb.later ? p.wb.worstDelayMin : 0), 'Largest delay among households beyond chance that reached safety later.')}
    ${row('Chance alone: A against A rerun with another serving order', P.map(p => p.floor.households), 'Households "worse off" when nothing changes except which car reaches a junction first.')}
    ${row('Households better off under B', P.map(p => p.better.households), 'Households worse off under A than under B, by the same rule.')}
    ${row('Average change in time to safety (min; + = faster under B)', P.map(p => p.w.meanGainMin), 'Households that reached safety under both plans.', 1)}
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
  ['Fire scenario', 'Where the fire starts and how the wind blows, and so which zones the City orders out.', 'Which neighborhoods are under order; how fast embers reach homes.'],
  ['Time of day', 'Who is home, commuters driving home against the outbound traffic, and employees, students and visitors (Evacuation Time Study cases).', 'Evacuation time: weekdays are slower than nights.'],
  ['Severity', 'Fire spread speed and ember distance: half or double the central case.', 'People still there when embers or the fire front arrived.'],
  ['Random seed', 'Which households live where, where cars are parked, and random spot fires.', 'Small differences. Trust a difference that holds across seeds.'],
  ['Decision delay', 'Minutes from ignition to the first evacuation order.', 'Households still home when embers arrive.'],
  ['Zones ordered', 'Only the City\'s pre-defined zones, or also zones within 1–3 km of the fire, or all hill zones at once.', 'Exposure falls; more cars on the road at once.'],
  ['Early departure', 'Share of households in the City\'s Leave Early Zones who leave on a Red Flag day, before any fire.', 'Exposure falls; evacuation time barely changes.'],
  ['Future growth', 'Added homes in the hills, from none to the 2025 Evacuation Time Study\'s maximum ADU build-out (27,060 units). Both plans face the same growth.', 'Evacuation time and people still there when embers arrived.'],
  ['R0', 'A plan setting that bars added units in one area: Leave Early Zones, Fire Zones 2–3 or areas behind a choke point.', 'How much of the growth\'s effect R0 removes.'],
  ['Driver information and routing', 'How drivers find their way: Today\'s model (everyone well informed, idealized), habit, an ordinary navigation app, constrained egress guidance, or unconstrained system-optimal routing (comparison only), and the share of drivers who follow.', 'Households worse off, household by household, and people still there when embers arrived. Expert view only.'],
  ['Red Flag power shutoff', 'A scenario setting: signals in the hills, or all 146 City signals, go dark and run as all-way stops; grid-powered contraflow signs fail.', 'Evacuation time and queues at the dark junctions.'],
  ['Contraflow', 'Both lanes of chosen two-way streets run outbound once officers or pre-installed signs start it. Only where at least 20 ft stays clear between parked cars.', 'Commuters turned back, live engine reach, evacuation time.'],
  ['Police control of junctions', 'Officers from a shared pool take over pre-timed signals and the Time Study\'s congestion points after an arrival delay.', 'Evacuation time and queues at the controlled junctions.'],
  ['Parking on hill streets', 'How much of the street parked cars take: today\'s mix, one side only, tight to the curb, none on narrow roads, or none.', 'Hill homes a fire engine can reach within the City\'s 5-minute standard. Engines do not fight the fire in this simulator, so better engine access has no effect on the fire. Evacuation flow barely changes.'],
];
function intro() {
  modal(`<div class="intro"><h2>Berkeley Hills Wildfire Evacuation: Scenario Explorer</h2>
  <p>Run a wildfire on Berkeley's real streets and watch residents' cars, parked cars and fire engines compete for the same narrow roads. Compare two ways of running an evacuation on the same fire and the same households.</p>
  <p class="note">This is a teaching tool, not a prediction and not an official evacuation plan. The households are synthetic and the fire is illustrative. For real instructions see the <a href="https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation" target="_blank" rel="noopener">City's fire weather and evacuation page</a>.</p>
  <div class="steps"><div><b>1 · Pick a fire and a question</b>Each question sets two plans, A and B, that differ in one choice. A question is switched off on a fire where its answer did not hold.</div><div><b>2 · Watch</b>Run Plan A, then Plan B. Fire is orange, embers amber, cars blue, queues red.</div><div><b>3 · Compare</b>Run both plans on 9 fires. A difference that shows up in every run is worth discussing.</div></div>
  <h3>The inputs and what they change</h3>
  <table><tr><th>Input</th><th>What it sets</th><th>What to watch</th></tr>${INPUTS.map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>
  <h3>Reading the results</h3>
  <ul class="small">
    <li><b>People still there when embers arrived</b>: still at home or on the road when embers first reached their street, split into those with a car, on the road, without a car, and in zones with no order. <b>…when the fire front arrived</b> is the harsher version. Neither is a count of deaths or injuries: the simulator does not model whether a house survives, whether people can shelter, or smoke. Use them to compare plans.</li>
    <li><b>Evacuation time</b>: minutes after the first order until 90% of cars have left the order area, with the 2025 Evacuation Time Study's figure next to it for scale. The simulator lacks the City's signal timing, so on weekdays its times run 25–80 min short of the study's.</li>
    <li><b>Fire-engine travel</b> from the nearest station to the fire edge, and streets where parked cars leave less than an engine's width.</li>
    <li><b>Hill homes an engine can reach within 5 minutes</b>: the share of residents of Berkeley's Fire Zones 2–3 whose street an engine can reach from the nearest station within the City's 5-minute standard, given the plan's parked cars, before traffic and fire. It measures access only: engines do not fight the fire in this simulator.</li>
  </ul>
  <p class="small muted">Simple view offers three fires and four questions; a question is offered on a fire only where Plan B did better than Plan A in every one of 15 test runs there. Expert view (the Simple / Expert switch at the top right of the page) opens every control: scenario, severity, seed, time of day and both plans. Every number shows whether it is sourced, derived, an assumption, a model rule or synthetic; see Assumptions &amp; limits and Data sources. Streets and residents beyond Berkeley (Oakland, Albany, Kensington, El Cerrito) are included up to the edge of the elevation data; north Kensington and Oakland south of about 37.84° N are not.</p>
  <div class="start"><button id="intro-expert">Open expert view</button><button class="primary" id="intro-simple">Start with a question</button></div></div>`, 'intro');
  const go = m => { localStorage.setItem('bhe-intro-seen', '1'); $('modal').close(); setMode(m); };
  $('intro-simple').onclick = () => go('simple'); $('intro-expert').onclick = () => go('expert');
}
$('btn-intro').onclick = intro;
$('modal').addEventListener('close', () => localStorage.setItem('bhe-intro-seen', '1'));
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
  <p class="small">${esc(SEVERITY_NOTE)} Spread runs on ${CELL} m cells: wind sets an elliptical shape (Anderson 1983 length-to-breadth, capped at ${LB_MAX}); uphill is faster and downhill slower; a proxy fuel factor comes from the City fire zones (${Object.entries(FUEL).map(([k, v]) => `${k} ${v}`).join(', ')}), not from vegetation data. Spot fires are random, so seeds differ. A cell is "ember-exposed" once any burning cell lies within the ember distance upwind. The 1923 reference fire is confined to the City's archival boundary.</p>
  <table><tr><th>Severity</th><th>Head spread (m/min)</th><th>Wind ×</th><th>Ember distance (m)</th><th>Spot probability</th></tr>${Object.values(SEVERITY).map(s => `<tr><td>${s.label}</td><td>${s.rosMpm}</td><td>${s.windFactor}</td><td>${s.emberM}</td><td>${s.spotProb}</td></tr>`).join('')}</table>
  <h3>Time of day ${badge('assumption')}</h3><p class="small">${esc(TIME_NOTE)}</p>
  <table>${Object.values(TIME_OF_DAY).map(t => `<tr><td>${t.label}</td><td>households awaiting a commuter ${t.commuterShare * 100}%, school in session ${t.schoolInSession * 100}%, background traffic allowance ${t.background * 100}%</td><td class="small">${esc(t.note)}</td></tr>`).join('')}</table>
  <h3>How people and vehicles are modeled ${badge('synthetic')}</h3>
  <ul class="small">
    <li>Households are synthetic. Each zone's Genasys population estimate (sourced; the 2020 Census count of the zone's blocks where Genasys publishes none, as in Oakland's hills beyond the City's layer, Kensington and El Cerrito) is cut to the share inside the model area, divided by ${A.demand.personsPerHousehold} persons per household (Time Study), and spread over the zone's streets in proportion to length. Residents are not reduced by time of day (Time Study).</li>
    <li><b>Future growth</b> (Scenario, both plans; Expert view only): added homes from the 2025 Evacuation Time Study's Hillside Overlay figures (${badge('sourced')} middle housing 870 units, maximum ADU build-out 27,060) or a moderate case (${badge('assumption')} ${A.growth.options.moderate.units.toLocaleString()} units). The study gives no split by street, so units go to Berkeley's Fire Zones 2–3 in proportion to today's households on each street ${badge('assumption')}. Each unit is a synthetic household drawn like today's (${A.demand.personsPerHousehold} persons, about 1.12 vehicles against the study's 1.14) and is counted in every result. Parked cars do not increase with growth. With the maximum build-out the simulator's 90% evacuation time in the large regions rises less than the study's (fall weekday, fire off: 1923 region +42% against +58%, Fire Zones 2–3 +3% against +97%), because its junctions pass traffic faster than the study's signals, so read growth's effect there as a lower bound. On Panoramic Hill it rises more (+120% against +25%): with one way out, its streets lock up and the simulator's gridlock rule decides much of the result, so that figure is less certain. <b>R0</b> (plan setting ${badge('model rule')}) bars added homes in one area and moves none elsewhere; it does not treat homes lost to fire as people moving out. Legal status: ${esc(A.growth.r0.legal)}</li>
    <li>${(A.demand.householdsWithoutVehicleShare * 100).toFixed(2)}% of households have no vehicle; ${A.demand.carlessRideshareShare * 100}% of those ride with a neighbor on the same street; the rest are stranded and counted as at risk. Households that drive take 1–4 vehicles (Time Study survey). Age is not used at all.</li>
    <li>Who leaves: everyone in Order zones, ${A.demand.compliance.warning * 100}% of Warning zones, and ${A.demand.compliance.shadow * 100}% of all other households in the model area (Berkeley and the neighboring parts of Oakland, Emeryville, Albany, Kensington, El Cerrito and Richmond, which roughly match the Time Study's Shadow Region) as shadow evacuees driving out of the modeled area (Time Study). Orders follow the Time Study's zone lists for the 1923 and Panoramic Hill regions, the City's Fire Zones 2–3 region for the east-wind fires, and optionally the plan's distance rule.</li>
    <li>When: each household's departure after the order is drawn from the Time Study's survey-based mobilization tables (Table 5-9), which include noticing the order and getting ready. Households waiting for a commuter, or picking up children on school days, leave later.</li>
    <li>Evacuation time is measured like the Time Study's ETE: from the first order until 90% (and 100%) of evacuating vehicles have left the order and warning area. <code>node tests/calibration.mjs</code> compares the simulator with the study's results with the fire switched off.</li>
    <li>Vehicles may use every street. They head for the nearest road node outside every ordered or warned zone and the ember area, and, under Today's model, re-plan every minute around queues, fire and embers. Other ways drivers could find their route are under Driver information and routing below.</li>
    <li>Each link passes at most its capacity, holds at most its storage, and each intersection passes at most its capacity. On two-way streets with only one moving lane between parked cars, both directions share that lane: when cars come from both ways they take turns at gaps such as driveways, and the street loses capacity. Removing parking does not add evacuation lanes on two-way streets.</li>
    <li>Parked cars vary by block and seed: hill blocks are parked on one side or both, some cars sit partly off the pavement, and an occasional bad parking job (a wide vehicle, or a car far from the curb) narrows the gap. Residents stop parking where less than 8 ft would remain for a car. The City survey's "width with parking" is treated as the both-sides case.</li>
    <li>Households awaiting a commuter (Time Study) wait for that person to drive home first. The commuter enters at the edge of the evacuating area nearest home and drives in against the outbound traffic. A commuter turned back by fire leaves the household one car short.</li>
    <li>Gridlock relief: a vehicle stuck ${data.A.capacity.gridlockReliefS} s at the head of a queue squeezes forward. Without it the queue model can lock up for good in rings such as traffic circles.</li>
    <li>Engines travel from the nearest station to the road point nearest the ignition that the fire has not yet reached. They cannot pass segments narrower than an engine (with parked cars), and are delayed by oncoming evacuees where only one lane is clear.</li>
    <li>Engine reach ${badge('model rule')}: a home counts as reached within the City's ${data.A.access.engineServiceMin}-minute standard ${badge('sourced')} when an engine from one of Berkeley's 7 stations can drive to the nearer end of the home's street segment in that time, at ignition, before traffic and fire, on a route where every segment leaves 10 ft clear between parked cars and no fixed barrier closes it (gates and removable bollards cost ${data.A.access.barrierDelayS / 60} min). The home's own segment need not pass: the engine stops at its end. Engines drive both ways on one-way streets at 1.15 times the posted speed, with no turn or grade delays, so drive times are short: in the runs tested nearly every hill home with an engine route is within 5 minutes, and the measure mostly counts homes that parked cars cut off. Stations in Oakland, Kensington and Albany are not modeled, so the measure covers Berkeley's evacuation zones only. It says nothing about what an engine does on arrival.</li>
  </ul>
  <h3>Driver information and routing (plan setting, Expert view)</h3>
  <p class="small">Every option sends drivers to the same places (outside the ordered and warned zones and the illustrative fire's ember area) ${badge('model rule')}; the options differ in what drivers know on the way and whom they follow. The households that follow an option are drawn per household from a seeded stream of their own, so plans that differ only in routing see the same households, parked cars and fire.</p>
  <ul class="small">${Object.values(ROUTING).map(o => `<li><b>${esc(o.label)}</b> ${badge(o.category)}: ${esc(o.note)}</li>`).join('')}
    <li><b>Share of drivers who follow</b> ${badge('assumption')}: 100%, 65%, 50% or 15%. 15%: after the 2017 Northern and Southern California fires, 18–19% of surveyed evacuees used GPS and followed its route, and 7.5% after the 2018 Carr fire (Wong, Broader and Shaheen 2020, UC Institute of Transportation Studies, Table 10). 65%: in a 2024 evacuation drill in Roxborough Park, Colorado, 78 of 122 answers said the driver followed the route instructions (Dugstad et al. 2026). No real wildfire has measured compliance with official route guidance. The share stands in for everything the simulator cannot show: phone networks down or overloaded, people who distrust or ignore instructions, and agencies unwilling to direct people because of liability.</li>
    <li><b>Constrained guidance, settings</b>: forecast margin ${data.A.routing.forecastMarginMin} min ${badge('assumption')}; time tolerance ${data.A.routing.timeToleranceS} s ${badge('assumption')}; one second in the forecast ember area counts as ${data.A.routing.emberSecondWeight} s of driving ${badge('model rule')}; load balancing counts each car's queue delay ${1 + data.A.routing.systemQueueWeight} times ${badge('model rule')}. A street counts as in the forecast ember or fire area if embers or the front are forecast there by the time the driver would leave it, plus the margin. The forecast is the simulator's own fire, so it is never wrong; a real forecast would be uncertain, and the margin stands in for that. The comparison is the route the driver would take on their own (by habit). The time check uses current queues, and every following car at a junction gets the same route, so "never worse off" holds when the route is offered, not after the cars it sends together have built new queues. A route that is strictly safer under the forecast may be slower: with a perfect forecast the margin buys no safety in the simulator and only costs time, so some guided households reach safety later than by habit (see Households worse off below).</li>
    <li><b>Households worse off</b> ${badge('model rule')} (Compare, when the plans differ in routing; results panel, against Habit or Today's model): a household is worse off under Plan B if it is still there when embers or the fire front reach it, or cut off, where it was not under Plan A, or reaches safety more than ${data.A.routing.worseOffDelayMin} min later, or not at all. Runs are paired by seed, households by identity. Which car reaches a junction first is partly chance, and changing only that order moves hundreds to thousands of households by more than ${data.A.routing.worseOffDelayMin} min, so Compare runs each plan a second time with another serving order and counts households worse off under both B runs than under both A runs ("beyond chance"). In test runs on three fires (SOURCE_NOTES DG23), every option, constrained guidance included, left some households worse off than Habit beyond chance in nearly every run, while leaving thousands better off.</li>
    <li><b>What no simulator run can justify.</b> These runs compare designs on synthetic households and an illustrative fire. None of them justifies deploying route guidance in an evacuation; at most they help decide whether a carefully constrained pilot study is worth designing. The simulator does not model the liability of telling people which way to go, how people respond to an instruction they do not trust, or what happens when the guidance itself is wrong.</li>
  <h3>Contraflow, police control and power shutoff ${badge('model rule')} ${badge('assumption')}</h3>
  <ul class="small">
    <li><b>Contraflow</b> (plan setting): once it starts, both lanes of a chosen two-way street carry traffic away from the order area and the inbound direction is closed. It runs only where at least ${fmt(2 * data.A.access.movingLaneM / 0.3048)} ft stays clear between the plan's parked cars (two 10-ft lanes); on narrower streets it gains nothing and the street stays two-way. The main hill exit streets are those that carried the most order-zone traffic out of the hills in status-quo runs, plus the entrances of the larger access-constrained areas (<code>tools/contraflow-streets.mjs</code>). A street runs contraflow only while its zone is ordered or warned: a segment in a zone told later starts later, and one in a zone the run never orders or warns stays two-way. Junction capacity is unchanged, so where the junction at the bottom of a street is the bottleneck, contraflow adds room to queue but not throughput. Costs it models: returning commuters cannot drive in (they turn back or reroute), and engines cannot drive up a contraflow street (they take another route or cannot reach). Officer-staffed contraflow needs one officer at every entry point (the street's outbound end and every side-street junction) and starts when they arrive; pre-installed signs and gates start ${OPS().contraflow.signDelayMin} min after the order. A sign fails if the fire reaches it first, or if it runs on grid power alone during a power shutoff; a failed sign falls back to officers or to no contraflow. Battery backup is assumed to last the whole run, which a shutoff that starts a day ahead of the fire might not allow. Not modeled: drivers who ignore the signs, wrong-way crashes, the time to clear inbound traffic off the street before it reverses, and rehearsal making people leave sooner.</li>
    <li><b>Police control of junctions</b> (plan setting): officers arrive a set time after the first order and staff contraflow entry points first, then target junctions on the evacuation routes, busiest first (by the households whose first route passes through). An officer-controlled junction passes ${Math.round(OPS().police.capacityUplift * 100)}% more vehicles than its model capacity and lets approaches heading toward safety go first. That uplift is an assumption kept modest: the Time Study models staffed control as actuated signal timing (§4.3, p. 4-7) and finds converting pre-timed signals to actuated cuts evacuation time by up to 13% (p. 10-9); manual control can also do worse than a signal. The simulator models signals only as a capacity per road class, so officer control acts on that capacity, not on real signal phases.</li>
    <li><b>Red Flag power shutoff</b> (scenario setting): dark signals run as all-way stops (California Vehicle Code §21800(d)) at about ${fmt(OPS().powerShutoff.allWayStopVph)} vehicles per hour through the junction, or less where the model's capacity was already lower. No public source says which Berkeley signals have battery backup, so none is assumed. An officer at a dark signal restores it to officer control. Streetlights, phones, alerts and water pressure, which a shutoff also affects, are not modeled.</li>
  </ul>
  <h3>Information gaps and how far off they make the simulator</h3>
  <ul class="small">
    <li><b>Traffic signal timing ${badge('assumption')}.</b> The City has not published its signal timings, so every junction gets a typical delay and a capacity by road class (<code>intersections</code> above). The 2025 Time Study used the City's timings and found intersections to be the main constraint. The simulator therefore clears traffic too fast when roads are busy. Measured against the study (90% of order-zone vehicles out, no fire, median of 3 seeds):
      <ul>
        <li>Panoramic Hill: within about 10 min of the study at all times of day.</li>
        <li>1923 repeat and Fire Zones 2–3, nights and weekends: 15–25 min too fast (study 1 h 45 min to 1 h 55 min; simulator about 1 h 30 min).</li>
        <li>Same regions on weekdays: 25–80 min too fast. On a fall weekday the study takes 2 h 55 min for the 1923 region; the simulator takes about 1 h 35 min.</li>
      </ul>
      Read weekday clearance times for the large regions as a lower bound: the study's times run up to 1.8 times the simulator's. Part of the gap also comes from where employees and students park, which the simulator places by area. Differences between two plans are more reliable than either plan's clock time, but a plan that sends more traffic through signals the study found congested (around the UC campus, and the pre-timed signal at Cedar St and MLK Jr Way) can look better in the simulator than it would on the street. The results panel shows the study's time for the same case.</li>
  </ul>
  <h3>What Phase 1 does not do</h3>
  <ul class="small">
    <li>Engines do not fight the fire. The simulator times an engine's drive from the nearest station to the fire edge, but nothing an engine does slows the fire, protects homes or helps people leave, so better engine access has no effect on the fire. Parking rules still change how much traffic hill streets carry; in the runs tested, the parking options made no consistent difference to people still there when embers arrived.</li>
    <li>No deaths or injuries. "Still there when embers arrived" counts people at home or on the road when embers first reached their street (any burning cell within the ember distance upwind); "…when the fire front arrived" counts those still there when the fire itself reached the street. Whether they would be hurt depends on house survival, sheltering, fire intensity and smoke, none of which the simulator models.</li>
    <li>No buildings yet, so no structures exposed or lost; no home hardening or vegetation effects.</li>
    <li>No stairway or steep-path access time between homes and the street, and no assistance for people who need help (Phase 2).</li>
    <li>Employees, students, visitors and I-80 and CA-24 through traffic use the Time Study's vehicle counts, placed by area (an approximation).</li>
    <li>Intersection capacities are illustrative per road class; the study models each signal and stop sign. Traffic circles (900 vehicles per hour, Time Study) and diverters come from the City's list of traffic-calming devices (75 diverters, 63 circles); how each one channels traffic is read from OpenStreetMap. 13 of the 75 stay open: OpenStreetMap shows no restriction at 6 and only banned turns at 1 (turn bans are not modeled), 2 could not be placed on the network, and 4 would cut streets off or leave cars on one-way streets with no way out.</li>
    <li>Road closures beyond fire-blocked segments and contraflow streets are not modeled. Officers do not direct turning movements or close streets; they raise a junction's capacity and let outbound traffic go first.</li>
    <li>Streets outside Berkeley come from OpenStreetMap, with widths assumed from Berkeley's medians and lanes from OSM tags or by road class. The model area stops at the edge of the elevation grid (37.84–37.91° N, 122.33–122.21° W: about 1 km into Oakland, the middle of Kensington, the Caldecott Tunnel); traffic that reaches the edge has left, and people beyond it are not modeled (about 1,500 of Kensington's 5,428 residents in the 2020 Census).</li>
  </ul>`);
};
$('btn-sources').onclick = () => {
  const S = data.layers.meta.sources || [];
  modal(`<h2>Data sources</h2><p class="small">Every imported layer, where it came from and how the simulator uses it. See <code>DATA_INVENTORY.md</code> for missing inputs.</p>
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
growthNote(); shutoffNote(); showScenario(); showPlan(); legend(); newRun();
setMode(localStorage.getItem('bhe-mode') || 'simple');
if (!localStorage.getItem('bhe-intro-seen')) intro();
requestAnimationFrame(loop);
