import { loadData } from './data.js';
import { buildFireGrid, runFire, cellOf, demAt, FUEL, LB_MAX, CELL } from './fire.js';
import { makeScenarios, SEVERITY, SEVERITY_NOTE, TIME_OF_DAY, TIME_NOTE, ETE_TARGETS } from './scenarios.js';
import { Evacuation, DEFAULT_PLAN, titleCase } from './sim.js';
import { PARKING_PLANS } from './parking.js';
import { PRESETS } from './presets.js';
import { MapView, STREET_MODES } from './map.js';
import { fromUTM } from '../tools/utm.mjs';

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
  editing: 'A', preset: null, playing: false, speed: 300, sim: null, fires: new Map(), batch: 0,
};

const data = await loadData();
const grid = buildFireGrid(data);
const scenarios = makeScenarios(data);
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
  neighborhoods: 'Neighborhoods', fire1923: '1923 boundary', cityBoundary: 'City limits', stations: 'Stations & shelters', noParking: 'No-parking signs', tightTurns: 'Tight turns',
  fire: 'Fire & embers', vehicles: 'Vehicles', queues: 'Queues', responder: 'Responder route' };
for (const [k, label] of Object.entries(LAYER_NAMES)) {
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox" ${map.layers[k] ? 'checked' : ''}> ${label}`;
  l.querySelector('input').onchange = e => { map.layers[k] = e.target.checked; map.draw(); legend(); };
  $('layers').append(l);
}

const scenario = () => scenarios.find(s => s.id === $('scenario').value);
const PLAN_FIELDS = ['name', 'alertKm', 'orderDelayMin', 'hillsOrderMin', 'earlyShare', 'earlyZones', 'hillsParking', 'r0'];
function showPlan() {
  const p = state.plans[state.editing];
  for (const f of PLAN_FIELDS) $(`p-${f}`).value = p[f] ?? DEFAULT_PLAN[f] ?? '';
  document.querySelectorAll('#plan-tabs button').forEach(b => b.classList.toggle('on', b.dataset.plan === state.editing));
  parkingNote(); r0Note();
}
function readPlan() {
  const p = state.plans[state.editing];
  p.name = $('p-name').value || `Plan ${state.editing}`;
  p.alertKm = +$('p-alertKm').value; p.orderDelayMin = +$('p-orderDelayMin').value;
  p.hillsOrderMin = $('p-hillsOrderMin').value === '' ? null : +$('p-hillsOrderMin').value;
  p.earlyShare = +$('p-earlyShare').value; p.earlyZones = $('p-earlyZones').value; p.hillsParking = $('p-hillsParking').value;
  p.r0 = $('p-r0').value || 'none';
  parkingNote(); r0Note();
}
// ---------- future growth (scenario) and R0 (plan) ----------
// Growth is part of the world both plans face. Simple view always runs today's population.
const world = () => ({ growth: document.body.classList.contains('simple') ? 'none' : $('growth').value });
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
document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => { if ($('growth').value !== 'none') newRun(); })); // Simple view runs without growth
['severity', 'seed', 'tod'].forEach(id => $(id).onchange = () => { todNote(); newRun(); });
$('street-mode').onchange = e => { map.streetMode = e.target.value; map.draw(); legend(); };
$('speed').onchange = e => state.speed = +e.target.value;
$('run').onclick = () => { if (state.sim.t >= state.sim.end) newRun(); state.playing = !state.playing; $('run').textContent = state.playing ? '❚❚ Pause' : '▶ Play'; };
$('reset').onclick = () => newRun();
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
// Presets fix the scenario, time of day and both plans; the expert controls are hidden but
// stay in sync, so switching to Expert shows exactly what the preset set.
function renderSimple() {
  const p = state.preset;
  $('simple').innerHTML = `<h2>Pick a question</h2>
    <div class="presets">${PRESETS.map(q => `<button class="preset${p?.id === q.id ? ' on' : ''}" data-id="${q.id}"><b>${esc(q.title)}</b><span>${esc(q.question)}</span></button>`).join('')}</div>
    ${p ? `<div class="plans-ab"><div><b>Plan A</b> ${esc(p.A.name.replace(/^A: /, ''))}</div><div><b>Plan B</b> ${esc(p.B.name.replace(/^B: /, ''))}</div>
      <div class="small muted">${esc(scenario().name)} · ${p.tods ? 'time of day as above' : esc(TIME_OF_DAY[p.tod].label)} · central severity</div></div>
      <div class="watch"><b>What to look for.</b> ${esc(p.watch)}</div>
      <div class="btns"><button data-watch="A" class="${state.editing === 'A' ? 'on' : ''}">▶ Watch Plan A</button><button data-watch="B" class="${state.editing === 'B' ? 'on' : ''}">▶ Watch Plan B</button>
      <button class="primary" id="simple-compare">Compare A and B on 9 fires</button></div>
      <div id="simple-progress" class="small" style="margin-top:4px;color:var(--accent)"></div><div id="simple-result"></div>
      <p class="small muted">Watch starts that plan on the map; pause, restart or slow it in the playback controls below. Compare runs both plans on the same 9 fires (low, central and high severity, 3 random seeds each) and the same households, takes about half a minute, and shows the answer here. Trust a difference that shows up in every run.</p>` : '<p class="small muted">Each question compares two plans on the same fire and the same households. The Expert switch at the top right lets you set everything yourself.</p>'}`;
  $('simple').querySelectorAll('.preset').forEach(b => b.onclick = () => applyPreset(b.dataset.id));
  $('simple').querySelectorAll('[data-watch]').forEach(b => b.onclick = () => { state.editing = b.dataset.watch; showPlan(); if (p.tods) { $('tod').value = p.tods[state.editing]; todNote(); } newRun(); renderSimple(); state.playing = true; $('run').textContent = '❚❚ Pause'; });
  if ($('simple-compare')) $('simple-compare').onclick = () => { $('cmp-scope').value = 'severities'; $('compare').click(); };
}
function applyPreset(id) {
  const p = state.preset = PRESETS.find(q => q.id === id);
  $('scenario').value = p.scenarioId; showScenario();
  $('tod').value = p.tod; todNote(); $('severity').value = 'central'; $('seed').value = 1;
  state.plans.A = { ...p.A }; state.plans.B = { ...p.B }; state.editing = 'A'; showPlan();
  $('compare-out').innerHTML = ''; newRun(); renderSimple();
}
function setMode(m) {
  document.body.classList.toggle('simple', m === 'simple'); document.body.classList.toggle('expert', m === 'expert');
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  localStorage.setItem('bhe-mode', m);
  if (m === 'simple') { if (!state.preset) applyPreset(PRESETS[0].id); else renderSimple(); }
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
  map.sim = state.sim; state.playing = false; $('run').textContent = '▶ Play'; $('scrub').value = 0;
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
    if (sim.t >= sim.end) { state.playing = false; $('run').textContent = '▶ Play again'; }
    $('scrub').value = Math.floor(sim.t / 60);
    map.draw();
    if (now - lastUi > 300) { update(false); lastUi = now; }
  }
  requestAnimationFrame(loop);
}

// ---------- results panel ----------
function update(full) {
  const sim = state.sim, S = sim.summary(), sc = sim.scenario;
  $('clock').innerHTML = `t + ${hm(sim.t)} <span class="sub">${esc(sc.name)} · ${SEVERITY[sim.sevKey].label} severity · seed ${sim.seed} · ${esc(sim.plan.name)}</span>`;
  const c = (k, v, cls = '', tip = '') => `<div class="card ${cls}" title="${esc(tip)}"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const exposed = S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  $('results').innerHTML = `<h2>Results so far ${badge('synthetic')}</h2>
    <p class="small muted">People are synthetic households placed from Genasys zone population estimates (2020 Census blocks where Genasys publishes none); the fire is an illustrative overlay. Compare plans on the same scenario and seed; do not read the numbers as predictions.</p>
    <div class="cards">
      ${c('people in ordered zones', fmt(S.orderedPeople), '', 'Modeled residents in zones ordered so far (Time Study: 100% leave)')}
      ${c('warned and leaving', fmt(S.warnedLeaving), '', 'Time Study: 50% of households in warning zones leave')}
      ${c('reached safety', fmt(S.reachedSafety), 'good', `Ordered or warned people whose household's vehicles left the order/warning area and ember zone. Includes ${fmt(S.riders)} people riding with a neighbor.`)}
      ${c('shadow evacuees on the move', fmt(S.shadowLeaving), '', `People outside the order/warning zones who leave anyway (Time Study: 20%), driving out of the modeled area. ${fmt(S.shadowVehicles)} vehicles.`)}
      ${c('left early (before ignition)', fmt(S.leftEarly), S.leftEarly ? 'good' : '')}
      ${c('on the road now', fmt(S.onRoad))}
      ${c('ordered, not yet left', fmt(S.notLeft), S.notLeft ? 'bad' : '')}
      ${c('no vehicle and no ride', fmt(S.noVehicle), S.noVehicle ? 'bad' : '', 'Carless households that found no neighbor to ride with (Time Study: 86.9% rideshare). Phase 2 adds buses, paratransit and check-ins.')}
      ${c('still there when embers arrived', fmt(exposed), exposed ? 'bad' : '', `People still at home or on the road when embers first reached their street. Not a count of deaths or injuries: many would shelter or come through unharmed. At home ${fmt(S.exposedHome)}; on roads ${fmt(S.exposedRoad)}; without a vehicle ${fmt(S.exposedNoVehicle)}; in zones with no order ${fmt(S.notOrderedExposed)}`)}
      ${c('still there when the fire front arrived', fmt(S.fireFrontHome + S.fireFrontRoad), S.fireFrontHome + S.fireFrontRoad ? 'bad' : '', `People still at home or on the road when the fire itself reached their street, a harsher measure than embers. Still not a count of deaths or injuries. At home ${fmt(S.fireFrontHome)}; on roads ${fmt(S.fireFrontRoad)}`)}
      ${c('vehicles cut off by fire', fmt(S.vehiclesNoRoute), S.vehiclesNoRoute ? 'bad' : '', 'Cars with no road out: the fire had closed every route from their street, almost always before they set off. Parking rules do not change this number; leaving earlier does.')}
    </div>
    <table class="kv" style="margin-top:8px">
      <tr><td>Evacuation time after the first order (Time Study ETE): 50% / 90% / all vehicles out</td><td class="num">${mins(S.clearP50)} / ${mins(S.clearP90)} / ${S.clearP100 == null ? 'not yet' : mins(S.clearP100)}</td></tr>
      ${studyRow(sc)}
      <tr><td>Last household with a car out (after the first order)</td><td class="num">${S.lastHousehold == null ? 'not yet' : mins(S.lastHousehold)}</td></tr>
      <tr><td>Vehicles on roads now · peak queued</td><td class="num">${fmt(S.vehiclesOnRoad)} · ${fmt(S.peakQueued)}</td></tr>
      <tr><td>Fire-engine travel to the fire edge: at ignition → now (City standard: ${data.A.access.engineServiceMin} min)</td><td class="num">${S.responderFree === Infinity ? '<b style="color:#b91c1c">blocked by parked cars</b>' : mins(S.responderFree)} → ${S.responderBlocked ? '<b style="color:#b91c1c">blocked</b>' : mins(S.responderEta)}</td></tr>
      <tr><td>Street segments too narrow for an engine (this plan and seed)</td><td class="num">${fmt(S.engineBlockedSegments)}</td></tr>
      <tr><td>Two-way segments where oncoming drivers take turns</td><td class="num">${fmt(S.sharedLanes)}</td></tr>
      <tr><td>Commuters driving home into the area: home · turned back by fire</td><td class="num">${fmt(S.commutersHome)} of ${fmt(S.commutersInbound)} · ${fmt(S.commutersTurnedBack)}</td></tr>
      <tr><td>Zones ordered · warned</td><td class="num">${fmt(S.zonesOrdered)} · ${fmt(S.zonesWarned)}</td></tr>
      ${S.growthOption !== 'none' ? `<tr><td>Future growth: added homes · residents (counted in every number above)${S.growthBlocked ? ` · homes barred by R0` : ''} ${badge('synthetic')}</td><td class="num">${fmt(S.addedUnits)} · ${fmt(S.addedResidents)}${S.growthBlocked ? ` · ${fmt(S.growthBlocked)}` : ''}</td></tr>` : ''}
    </table>
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
    ? 'On weekdays the simulator runs 35–80 min faster than the study here, probably because it lacks the City\'s signal timing and where commuters and students park. Treat its times as a lower bound.'
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
  if (!sel) { box.innerHTML = '<h2>Inspector</h2><p class="muted small">Click a street or an evacuation zone.</p>'; return; }
  const sim = state.sim, F = data.net.meta.fields;
  const row = (k, v, cat, note) => `<tr><td>${k}</td><td>${v}${badge(cat, note)}</td></tr>`;
  if (sel.kind === 'edge') {
    const e = data.net.edges[sel.id];
    const travel = { B: 'two-way', FT: 'one-way (drawn direction)', TF: 'one-way (against drawn direction)', NT: 'no vehicle travel' }[e.trav] || e.trav;
    let rows = row('Street', esc(titleCase(e.name)), 'sourced') + row('Class', esc(e.cls), 'sourced') + row('Direction', travel, 'sourced', F.trav.source)
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
          + row('Fire engine can pass', sim.engineOK[e.id] ? 'yes' : '<b style="color:#b91c1c">no</b>', 'model rule', F.engineBlocked.source);
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
    box.innerHTML = `<h2>Street segment</h2><table class="kv">${rows}</table>`;
  } else {
    const z = data.layers.evacZones[sel.id];
    let rows = row('Zone', esc(z.id), 'sourced') + row('Described as', esc(z.knownAs || '—'), 'sourced')
      + row('Estimated population', fmt(z.pop) + (z.popOverride ? ` (census2020; Genasys estimate ${fmt(z.genasysPop)})` : ''), z.popOverride ? 'assumption' : 'sourced', z.popOverride ? esc(z.popOverride) : z.popSrc === 'census2020' ? '2020 Census population of the blocks whose interior point lies in this Genasys zone (Genasys publishes no estimate for it)' : 'Genasys zone estimate in the City layer (method not documented there)')
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

// ---------- legend ----------
function legend() {
  const m = map.streetMode, sw = (c, t) => `<div><span class="sw" style="background:${c}"></span>${t}</div>`;
  const L = {
    class: sw('#c0703a', 'Principal arterial') + sw('#c09a3a', 'Collector') + sw('#3d4f63', 'Local, hill fire zones') + sw('#5b5b5b', 'Local, flats') + sw('#7a4b9c', 'Freeway / ramp'),
    clearWidth: sw('#2f8a4a', '≥ 20 ft: two 10-ft lanes') + sw('#9cc65a', '10–20 ft: one 10-ft lane') + sw('#e8c21e', '9–10 ft: constrained') + sw('#e07a1e', '7–8 ft: moderately constrained') + sw('#c0262d', '≤ 6 ft: severely constrained') + sw('#aaa', 'width unknown') + '<div class="small muted">Tiers from the City SB 99 analysis (KLD)</div>',
    engine: sw('#2f8a4a', 'Engine passes oncoming traffic') + sw('#e08a1e', 'Engine fits, but oncoming cars must pull over') + sw('#c0262d', 'Too narrow for an engine with parked cars') + sw('#aaa', 'unknown'),
    grade: sw('#4f7f9b', '< 5%') + sw('#8fae4a', '5–10%') + sw('#e0b21e', '10–15%') + sw('#e07a1e', '15–20%') + sw('#c0262d', '≥ 20%') + sw('#aaa', 'unreliable (structure or DEM artefact)'),
    widthSource: sw('#2b6cb0', 'City pavement-management width') + sw('#8a3fb8', 'City narrow-roads survey') + sw('#aaa', 'no width data'),
    oneway: sw('#d1495b', 'One-way (arrow = direction)') + sw('#666', 'Two-way'),
  }[m];
  const extra = (map.layers.fire ? `<div><span class="dot" style="background:#ff7a00"></span>Active fire (last 15 min)</div><div><span class="dot" style="background:#5a1e19"></span>Burned</div><div><span class="dot" style="background:#ffb020;opacity:.6"></span>Ember exposure</div>` : '')
    + (map.layers.vehicles ? `<div><span class="dot" style="background:#1d4ed8"></span>Vehicle leaving · <span class="dot" style="background:#d97706"></span>commuter driving home · <span class="dot" style="background:#e11d48"></span>in ember area</div>` : '')
    + (map.layers.queues ? sw('rgba(200,20,40,.8)', 'Queue (width = how full)') : '')
    + (map.layers.responder ? sw('#0e7490', 'Engine route to fire edge') : '')
    + (map.layers.streets ? '<div><b style="color:#111">✕</b> diverter or bollard, closed to cars · <b style="color:#7c3aed">✕</b> engines can pass (City diverter list, OpenStreetMap)</div>' : '')
    + (map.layers.paths ? `<div><span class="sw" style="background:repeating-linear-gradient(90deg,#8a5a2b 0 3px,transparent 3px 6px)"></span>Paths &amp; stairways (no vehicles)</div>` : '');
  const open = localStorage.getItem('bhe-key') !== 'hidden';
  $('legend').innerHTML = `<button class="key-toggle" title="${open ? 'Hide' : 'Show'} the map key">${open ? 'Hide key ▾' : 'Show key ▸'}</button>${open ? `<div><b>${STREET_MODES[m]}</b>${L}${extra}</div>` : ''}`;
  $('legend').querySelector('.key-toggle').onclick = () => { localStorage.setItem('bhe-key', open ? 'hidden' : 'shown'); legend(); };
}

// ---------- comparison ----------
$('compare').onclick = () => {
  readPlan();
  const scope = $('cmp-scope').value, seeds = [1, 2, 3], sc = scenario();
  const cases = scope === 'severities' ? ['low', 'central', 'high'].flatMap(sev => seeds.map(seed => ({ scenarioId: sc.id, sev, seed, tod: $('tod').value })))
    : scenarios.flatMap(s => seeds.map(seed => ({ scenarioId: s.id, sev: 'central', seed, tod: s.timeOfDay })));
  const W = world(), jobs = ['A', 'B'].flatMap(p => cases.map(c => ({ ...c, tod: state.preset?.tods?.[p] ?? c.tod, planKey: p, plan: { ...state.plans[p] }, world: W })));
  const batch = ++state.batch, results = [];
  const progress = t => { $('cmp-progress').textContent = t; if ($('simple-progress')) $('simple-progress').textContent = t; };
  if ($('simple-compare')) $('simple-compare').disabled = true;
  progress(`Running ${jobs.length} simulations (identical fires and households for both plans). This takes about half a minute…`);
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
    results.push(m); progress(`Ran ${results.length} of ${jobs.length} simulations…`);
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
  ['Segments too narrow for an engine', S => S.engineBlockedSegments, -1],
  ['Commuters turned back by fire', S => S.commutersTurnedBack, -1],
];
function renderCompare(results, scope) {
  const groups = scope === 'severities' ? ['low', 'central', 'high'] : scenarios.map(s => s.id);
  const gname = g => scope === 'severities' ? SEVERITY[g].label + ' severity' : scenarios.find(s => s.id === g).name;
  const pick = (p, g) => results.filter(r => r.job.planKey === p && (scope === 'severities' ? r.job.sev === g : r.job.scenarioId === g)).map(r => r.summary);
  const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const range = a => { const s = a.filter(x => x != null && !Number.isNaN(x)); return s.length ? `${fmt(Math.min(...s))}–${fmt(Math.max(...s))}` : '—'; };
  let html = `<h2>Plan comparison ${badge('synthetic')}</h2>
    <p class="small">A: <b>${esc(state.plans.A.name)}</b> · B: <b>${esc(state.plans.B.name)}</b>.${results[0]?.job.world?.growth && results[0].job.world.growth !== 'none' ? ` Future growth for both: ${esc(data.A.growth.options[results[0].job.world.growth].label)}.` : ''} Both plans ran the same fires, households and random seeds (1–3). Values are the median of 3 seeds with the min–max range under it. A difference smaller than the range is not a robust result.</p>`;
  html += takeaway(results, scope);
  for (const g of groups) {
    const A = pick('A', g), B = pick('B', g);
    html += `<h3>${esc(gname(g))}</h3><table><tr><th></th><th class="num">A</th><th class="num">B</th><th class="num">B − A</th></tr>`;
    for (const [label, f, dir] of METRICS) {
      const a = A.map(f), b = B.map(f), ma = med(a), mb = med(b);
      let d = ma != null && mb != null && isFinite(ma) && isFinite(mb) ? mb - ma : null;
      if (d != null && Math.abs(d) < 0.5) d = 0;
      const cls = d == null || dir === 0 || Math.abs(d) < 1e-9 ? '' : (d * dir > 0 ? 'delta-good' : 'delta-bad');
      html += `<tr><td>${esc(label)}</td><td class="num">${fmt(ma)}<div class="small muted">${range(a)}</div></td><td class="num">${fmt(mb)}<div class="small muted">${range(b)}</div></td><td class="num ${cls}">${d == null ? '—' : (d > 0 ? '+' : '') + fmt(d)}</td></tr>`;
    }
    html += '</table>';
  }
  html += `<h3>Why the results differ (Plan B, first seed)</h3><ul class="small">${explain(results, groups[Math.floor(groups.length / 2)], scope)}</ul>`;
  $('compare-out').innerHTML = html;
}
// One plain sentence on the preset's headline metric: medians and in how many runs B beat A.
function takeaway(results, scope) {
  const p = state.preset; if (!p || scope !== 'severities') return '';
  const { label, f, dir } = p.headline;
  const pairs = results.filter(r => r.job.planKey === 'A').map(a => [f(a.summary), f(results.find(b => b.job.planKey === 'B' && b.job.sev === a.job.sev && b.job.seed === a.job.seed).summary)]);
  const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const ma = med(pairs.map(x => x[0])), mb = med(pairs.map(x => x[1]));
  const better = pairs.filter(([a, b]) => (b - a) * dir > 0).length, worse = pairs.filter(([a, b]) => (b - a) * dir < 0).length;
  const robust = better === pairs.length || worse === pairs.length;
  return `<div class="takeaway${robust ? '' : ' mixed'}"><b>${esc(label)}:</b> about ${fmt(ma)} under Plan A and ${fmt(mb)} under Plan B (median of ${pairs.length} runs). Plan B did better in ${better} of ${pairs.length} runs and worse in ${worse}.${robust ? '' : ' The difference does not hold in every run, so treat it as uncertain.'} These are synthetic households on an illustrative fire, not a prediction.</div>`;
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
  ['Parking on hill streets', 'How much of the street parked cars take: today\'s mix, one side only, tight to the curb, none on narrow roads, or none.', 'Fire-engine access. Evacuation flow barely changes.'],
];
function intro() {
  modal(`<div class="intro"><h2>Berkeley Hills Wildfire Evacuation: Scenario Explorer</h2>
  <p>Run a wildfire on Berkeley's real streets and watch residents' cars, parked cars and fire engines compete for the same narrow roads. Compare two ways of running an evacuation on the same fire and the same households.</p>
  <p class="note">This is a teaching tool, not a prediction and not an official evacuation plan. The households are synthetic and the fire is illustrative. For real instructions see the <a href="https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation" target="_blank" rel="noopener">City's fire weather and evacuation page</a>.</p>
  <div class="steps"><div><b>1 · Pick a question</b>Each one sets a fire and two plans, A and B, that differ in one choice.</div><div><b>2 · Watch</b>Run Plan A, then Plan B. Fire is orange, embers amber, cars blue, queues red.</div><div><b>3 · Compare</b>Run both plans on 9 fires. A difference that shows up in every run is worth discussing.</div></div>
  <h3>The inputs and what they change</h3>
  <table><tr><th>Input</th><th>What it sets</th><th>What to watch</th></tr>${INPUTS.map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>
  <h3>Reading the results</h3>
  <ul class="small">
    <li><b>People still there when embers arrived</b>: still at home or on the road when embers first reached their street, split into those with a car, on the road, without a car, and in zones with no order. <b>…when the fire front arrived</b> is the harsher version. Neither is a count of deaths or injuries: the simulator does not model whether a house survives, whether people can shelter, or smoke. Use them to compare plans.</li>
    <li><b>Evacuation time</b>: minutes after the first order until 90% of cars have left the order area, with the 2025 Evacuation Time Study's figure next to it for scale. The simulator lacks the City's signal timing, so on weekdays its times run 35–80 min short of the study's.</li>
    <li><b>Fire-engine travel</b> from the nearest station to the fire edge, and streets where parked cars leave less than an engine's width.</li>
  </ul>
  <p class="small muted">Simple view offers a few questions with clear answers. Expert view (the Simple / Expert switch at the top right of the page) opens every control: scenario, severity, seed, time of day and both plans. Every number shows whether it is sourced, derived, an assumption, a model rule or synthetic; see Assumptions &amp; limits and Data sources. Streets and residents beyond Berkeley (Oakland, Albany, Kensington, El Cerrito) are included up to the edge of the elevation data; north Kensington and Oakland south of about 37.84° N are not.</p>
  <div class="start"><button id="intro-expert">Open expert view</button><button class="primary" id="intro-simple">Start with a question</button></div></div>`, 'intro');
  const go = m => { localStorage.setItem('bhe-intro-seen', '1'); $('modal').close(); setMode(m); };
  $('intro-simple').onclick = () => go('simple'); $('intro-expert').onclick = () => go('expert');
}
$('btn-intro').onclick = intro;
$('modal').addEventListener('close', () => localStorage.setItem('bhe-intro-seen', '1'));
$('btn-assumptions').onclick = () => {
  const A = data.A, F = data.net.meta.fields;
  const val = path => { const v = path.split('.').reduce((o, k) => o?.[k], A); if (path === 'growth.options') return Object.values(v).map(o => `${o.label.replace(/ \(.*/, '')}: ${o.units.toLocaleString()} units`).join(', '); return typeof v === 'object' ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ') : v; };
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
    <li><b>Future growth</b> (Scenario, both plans; Expert view only): added homes from the 2025 Evacuation Time Study's Hillside Overlay figures (${badge('sourced')} middle housing 870 units, maximum ADU build-out 27,060) or a moderate case (${badge('assumption')} ${A.growth.options.moderate.units.toLocaleString()} units). The study gives no split by street, so units go to Berkeley's Fire Zones 2–3 in proportion to today's households on each street ${badge('assumption')}. Each unit is a synthetic household drawn like today's (${A.demand.personsPerHousehold} persons, about 1.12 vehicles against the study's 1.14) and is counted in every result. Parked cars do not increase with growth. With the maximum build-out the simulator's 90% evacuation time rises far less than the study's (fall weekday, fire off: 1923 region +30% against +58%, Fire Zones 2–3 +3% against +97%), because its junctions pass traffic faster than the study's signals, so read growth's effect on evacuation time as a lower bound. <b>R0</b> (plan setting ${badge('model rule')}) bars added homes in one area and moves none elsewhere; it does not treat homes lost to fire as people moving out. Legal status: ${esc(A.growth.r0.legal)}</li>
    <li>${(A.demand.householdsWithoutVehicleShare * 100).toFixed(2)}% of households have no vehicle; ${A.demand.carlessRideshareShare * 100}% of those ride with a neighbor on the same street; the rest are stranded and counted as at risk. Households that drive take 1–4 vehicles (Time Study survey). Age is not used at all.</li>
    <li>Who leaves: everyone in Order zones, ${A.demand.compliance.warning * 100}% of Warning zones, and ${A.demand.compliance.shadow * 100}% of all other households in the model area (Berkeley and the neighboring parts of Oakland, Emeryville, Albany, Kensington, El Cerrito and Richmond, which roughly match the Time Study's Shadow Region) as shadow evacuees driving out of the modeled area (Time Study). Orders follow the Time Study's zone lists for the 1923 and Panoramic Hill regions, the City's Fire Zones 2–3 region for the east-wind fires, and optionally the plan's distance rule.</li>
    <li>When: each household's departure after the order is drawn from the Time Study's survey-based mobilization tables (Table 5-9), which include noticing the order and getting ready. Households waiting for a commuter, or picking up children on school days, leave later.</li>
    <li>Evacuation time is measured like the Time Study's ETE: from the first order until 90% (and 100%) of evacuating vehicles have left the order and warning area. <code>node tests/calibration.mjs</code> compares the simulator with the study's results with the fire switched off.</li>
    <li>Vehicles may use every street. They head for the nearest road node outside every ordered or warned zone and the ember area, and re-plan every minute around queues, fire and embers.</li>
    <li>Each link passes at most its capacity, holds at most its storage, and each intersection passes at most its capacity. On two-way streets with only one moving lane between parked cars, both directions share that lane: when cars come from both ways they take turns at gaps such as driveways, and the street loses capacity. Removing parking does not add evacuation lanes on two-way streets.</li>
    <li>Parked cars vary by block and seed: hill blocks are parked on one side or both, some cars sit partly off the pavement, and an occasional bad parking job (a wide vehicle, or a car far from the curb) narrows the gap. Residents stop parking where less than 8 ft would remain for a car. The City survey's "width with parking" is treated as the both-sides case.</li>
    <li>Households awaiting a commuter (Time Study) wait for that person to drive home first. The commuter enters at the edge of the evacuating area nearest home and drives in against the outbound traffic. A commuter turned back by fire leaves the household one car short.</li>
    <li>Gridlock relief: a vehicle stuck ${data.A.capacity.gridlockReliefS} s at the head of a queue squeezes forward. Without it the queue model can lock up for good in rings such as traffic circles.</li>
    <li>Engines travel from the nearest station to the road point nearest the ignition that the fire has not yet reached. They cannot pass segments narrower than an engine (with parked cars), and are delayed by oncoming evacuees where only one lane is clear.</li>
  </ul>
  <h3>Information gaps and how far off they make the simulator</h3>
  <ul class="small">
    <li><b>Traffic signal timing ${badge('assumption')}.</b> The City has not published its signal timings, so every junction gets a typical delay and a capacity by road class (<code>intersections</code> above). The 2025 Time Study used the City's timings and found intersections to be the main constraint. The simulator therefore clears traffic too fast when roads are busy. Measured against the study (90% of order-zone vehicles out, no fire, median of 3 seeds):
      <ul>
        <li>Panoramic Hill: within about 10 min of the study at all times of day.</li>
        <li>1923 repeat and Fire Zones 2–3, nights and weekends: 15–25 min too fast (study 1 h 45 min to 1 h 55 min; simulator about 1 h 30 min).</li>
        <li>Same regions on weekdays: 35–80 min too fast. On a fall weekday the study takes 2 h 55 min for the 1923 region; the simulator takes about 1 h 35 min.</li>
      </ul>
      Read weekday clearance times for the large regions as a lower bound: the study's times run up to 1.8 times the simulator's. Part of the gap also comes from where employees and students park, which the simulator places by area. Differences between two plans are more reliable than either plan's clock time, but a plan that sends more traffic through signals the study found congested (around the UC campus, and the pre-timed signal at Cedar St and MLK Jr Way) can look better in the simulator than it would on the street. The results panel shows the study's time for the same case.</li>
  </ul>
  <h3>What Phase 1 does not do</h3>
  <ul class="small">
    <li>No deaths or injuries. "Still there when embers arrived" counts people at home or on the road when embers first reached their street (any burning cell within the ember distance upwind); "…when the fire front arrived" counts those still there when the fire itself reached the street. Whether they would be hurt depends on house survival, sheltering, fire intensity and smoke, none of which the simulator models.</li>
    <li>No buildings yet, so no structures exposed or lost; no home hardening or vegetation effects.</li>
    <li>No stairway or steep-path access time between homes and the street, and no assistance for people who need help (Phase 2).</li>
    <li>Employees, students, visitors and I-80 and CA-24 through traffic use the Time Study's vehicle counts, placed by area (an approximation).</li>
    <li>Intersection capacities are illustrative per road class; the study models each signal and stop sign. Traffic circles (900 vehicles per hour, Time Study) and diverters come from the City's list of traffic-calming devices (75 diverters, 63 circles); how each one channels traffic is read from OpenStreetMap. 13 of the 75 stay open: OpenStreetMap shows no restriction at 6 and only banned turns at 1 (turn bans are not modeled), 2 could not be placed on the network, and 4 would cut streets off or leave cars on one-way streets with no way out.</li>
    <li>Contraflow, traffic control and road closures beyond fire-blocked segments are not modeled.</li>
    <li>Streets outside Berkeley come from OpenStreetMap, with widths assumed from Berkeley's medians and lanes from OSM tags or by road class. The model area stops at the edge of the elevation grid (37.84–37.91° N, 122.33–122.21° W: about 1 km into Oakland, the middle of Kensington, the Caldecott Tunnel); traffic that reaches the edge has left, and people beyond it are not modeled (about 1,500 of Kensington's 5,428 residents in the 2020 Census).</li>
  </ul>`);
};
$('btn-sources').onclick = () => {
  const S = data.layers.meta.sources || [];
  modal(`<h2>Data sources</h2><p class="small">Every imported layer, where it came from and how the simulator uses it. See <code>DATA_INVENTORY.md</code> for missing inputs.</p>
  <table><tr><th>Layer</th><th>Publisher · retrieved</th><th>Used for</th></tr>${S.map(s => `<tr><td>${esc(s.title)} ${badge(s.category)}${s.url ? `<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener">service</a></div>` : ''}</td><td class="small">${esc(s.publisher)}<br>${esc(s.retrieved || '')}${s.lastEdit ? `<br>last edited ${esc(s.lastEdit)}` : ''}</td><td class="small">${esc(s.why)}</td></tr>`).join('')}</table>`);
};

// ---------- start ----------
growthNote(); showScenario(); showPlan(); legend(); newRun();
setMode(localStorage.getItem('bhe-mode') || 'simple');
if (!localStorage.getItem('bhe-intro-seen')) intro();
requestAnimationFrame(loop);
