import { loadData } from './data.js';
import { buildFireGrid, runFire, cellOf, demAt, FUEL, LB_MAX, CELL } from './fire.js';
import { makeScenarios, SEVERITY, SEVERITY_NOTE, TIME_OF_DAY, TIME_NOTE } from './scenarios.js';
import { Evacuation, DEFAULT_PLAN, titleCase } from './sim.js';
import { MapView, STREET_MODES } from './map.js';
import { fromUTM } from '../tools/utm.mjs';

const $ = id => document.getElementById(id);
const fmt = (x, d = 0) => x == null || Number.isNaN(x) ? '—' : x === Infinity ? '∞' : Number(x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const mins = x => x == null ? '—' : x === Infinity ? 'none' : `${fmt(x)} min`;
const hm = s => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAT = { sourced: 'sourced', derived: 'derived', assumption: 'assumption', 'game rule': 'rule', mixed: 'derived', synthetic: 'synthetic', unknown: 'missing' };
const badge = (cat, tip) => `<span class="badge b-${CAT[cat] || 'missing'}"${tip ? ` title="${esc(tip)}"` : ''}>${cat === 'unknown' ? 'no data' : cat}${tip ? ' ⓘ' : ''}</span>`;
const srcCat = src => !src ? 'unknown' : src.startsWith('city:') ? 'sourced' : src.startsWith('assumption:') ? 'assumption' : src.startsWith('derived:') ? 'derived' : src === 'unknown' ? 'unknown' : 'derived';

const state = {
  plans: { A: { ...DEFAULT_PLAN, name: 'Plan A: baseline' }, B: { ...DEFAULT_PLAN, name: 'Plan B: leave early + targeted parking', earlyShare: 0.5, hillsParking: 'narrow' } },
  editing: 'A', playing: false, speed: 300, sim: null, fires: new Map(), batch: 0,
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
const PLAN_FIELDS = ['name', 'alertKm', 'orderDelayMin', 'hillsOrderMin', 'earlyShare', 'hillsParking'];
function showPlan() {
  const p = state.plans[state.editing];
  for (const f of PLAN_FIELDS) $(`p-${f}`).value = p[f] == null ? '' : p[f];
  document.querySelectorAll('#plan-tabs button').forEach(b => b.classList.toggle('on', b.dataset.plan === state.editing));
  parkingNote();
}
function readPlan() {
  const p = state.plans[state.editing];
  p.name = $('p-name').value || `Plan ${state.editing}`;
  p.alertKm = +$('p-alertKm').value; p.orderDelayMin = +$('p-orderDelayMin').value;
  p.hillsOrderMin = $('p-hillsOrderMin').value === '' ? null : +$('p-hillsOrderMin').value;
  p.earlyShare = +$('p-earlyShare').value; p.hillsParking = $('p-hillsParking').value;
  parkingNote();
}
function parkingNote() {
  const v = $('p-hillsParking').value;
  $('parking-note').textContent = v === 'none'
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
['severity', 'seed', 'tod'].forEach(id => $(id).onchange = () => { todNote(); newRun(); });
$('street-mode').onchange = e => { map.streetMode = e.target.value; map.draw(); legend(); };
$('speed').onchange = e => state.speed = +e.target.value;
$('run').onclick = () => { if (state.sim.t >= state.sim.end) newRun(); state.playing = !state.playing; $('run').textContent = state.playing ? '❚❚ Pause' : '▶ Run'; };
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
  const n = data.layers.neighborhoods.find(x => x.name === e.target.value); if (!n) return;
  const r = n.rings[0]; const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  map.fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); map.draw();
};

// ---------- runs ----------
function getFire(sc, sev, seed) {
  const k = `${sc.id}|${sev}|${seed}`;
  if (!state.fires.has(k)) state.fires.set(k, runFire(grid, sc, SEVERITY[sev], seed));
  return state.fires.get(k);
}
function newRun() {
  const sc = scenario(), sev = $('severity').value, seed = +$('seed').value || 1;
  state.sim = new Evacuation(data, grid, getFire(sc, sev, seed), sc, sev, { ...state.plans[state.editing] }, seed, TIME_OF_DAY[$('tod').value]);
  map.sim = state.sim; state.playing = false; $('run').textContent = '▶ Run'; $('scrub').value = 0;
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
    if (sim.t >= sim.end) { state.playing = false; $('run').textContent = '▶ Run again'; }
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
    <p class="small muted">People are synthetic households placed from the City's Genasys zone population estimates; the fire is an illustrative overlay. Compare plans on the same scenario and seed; do not read the numbers as predictions.</p>
    <div class="cards">
      ${c('people in ordered zones', fmt(S.orderedPeople), '', 'Modeled residents in zones ordered so far (Time Study: 100% leave)')}
      ${c('warned and leaving', fmt(S.warnedLeaving), '', 'Time Study: 50% of households in warning zones leave')}
      ${c('reached safety', fmt(S.reachedSafety), 'good', `Ordered or warned people whose household's vehicles left the order/warning area and ember zone. Includes ${fmt(S.riders)} people riding with a neighbour.`)}
      ${c('shadow evacuees on the move', fmt(S.shadowLeaving), '', `People outside the order/warning zones who leave anyway (Time Study: 20%), driving to the city edge. ${fmt(S.shadowVehicles)} vehicles.`)}
      ${c('left early (before ignition)', fmt(S.leftEarly), S.leftEarly ? 'good' : '')}
      ${c('on the road now', fmt(S.onRoad))}
      ${c('ordered, not yet left', fmt(S.notLeft), S.notLeft ? 'bad' : '')}
      ${c('no vehicle and no ride', fmt(S.noVehicle), S.noVehicle ? 'bad' : '', 'Carless households that found no neighbour to ride with (Time Study: 86.9% rideshare). Phase 2 adds buses, paratransit and check-ins.')}
      ${c('people exposed to fire/embers', fmt(exposed), exposed ? 'bad' : '', `At home ${fmt(S.exposedHome)}; on roads ${fmt(S.exposedRoad)}; without a vehicle ${fmt(S.exposedNoVehicle)}; in zones with no order ${fmt(S.notOrderedExposed)}`)}
      ${c('vehicles trapped (no open route)', fmt(S.vehiclesNoRoute), S.vehiclesNoRoute ? 'bad' : '')}
    </div>
    <table class="kv" style="margin-top:8px">
      <tr><td>Evacuation time after the first order (Time Study ETE): 50% / 90% / all vehicles out</td><td class="num">${mins(S.clearP50)} / ${mins(S.clearP90)} / ${S.clearP100 == null ? 'not yet' : mins(S.clearP100)}</td></tr>
      <tr><td>Last household with a car out (after the first order)</td><td class="num">${S.lastHousehold == null ? 'not yet' : mins(S.lastHousehold)}</td></tr>
      <tr><td>Vehicles on roads now · peak queued</td><td class="num">${fmt(S.vehiclesOnRoad)} · ${fmt(S.peakQueued)}</td></tr>
      <tr><td>Fire-engine travel to the fire edge: at ignition → now (City standard: ${data.A.access.engineServiceMin} min)</td><td class="num">${S.responderFree === Infinity ? '<b style="color:#b91c1c">blocked by parked cars</b>' : mins(S.responderFree)} → ${S.responderBlocked ? '<b style="color:#b91c1c">blocked</b>' : mins(S.responderEta)}</td></tr>
      <tr><td>Street segments too narrow for an engine (this plan)</td><td class="num">${fmt(S.engineBlockedSegments)}</td></tr>
      <tr><td>Zones ordered · warned</td><td class="num">${fmt(S.zonesOrdered)} · ${fmt(S.zonesWarned)}</td></tr>
    </table>
    <canvas class="spark" id="spark" width="330" height="60"></canvas>
    <div class="small muted"><span style="color:#b91c1c">■</span> vehicles queued &nbsp; <span style="color:#1d4ed8">■</span> on roads &nbsp; <span style="color:#0e7490">■</span> engine ETA (scaled)</div>
    ${S.bottlenecks.length ? `<h3>Worst queues so far</h3><table>${S.bottlenecks.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${b.max} veh</td><td class="num">t+${fmt(b.at)}m</td></tr>`).join('')}</table>` : ''}
    <p class="small muted">Not shown yet: structures exposed or lost (needs building footprints, Phase 3); households behind stairs (Phase 2). Population outside the modeled street network: ${fmt(S.unplacedPeople)}.</p>`;
  spark(sim);
  $('events').innerHTML = sim.events.map(e => `<li class="k-${e.kind}"><span class="t">t+${hm(e.t)}</span>${esc(e.text)}</li>`).join('');
  if (map.selected) inspect(map.selected, true);
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
      + row('Use', e.mode, 'derived', F.mode.source) + row('Length', `${fmt(e.len)} m`, 'derived', 'Measured in UTM 10N metres');
    if (e.mode === 'vehicle') {
      rows += row('Lanes [forward, back]', `${e.lanes.join(', ')}`, srcCat(e.lanesSrc), e.lanesSrc)
        + row('Pavement width', e.widthM == null ? 'unknown' : `${fmt(e.widthM, 1)} m (${fmt(e.widthM / 0.3048)} ft)`, srcCat(e.widthSrc), e.widthSrc)
        + row('Parking (status quo)', e.parking, 'assumption', F.parking.source);
      if (sim) {
        const cw = sim.clear[e.id];
        rows += row('Clear width under this plan', Number.isNaN(cw) ? 'unknown' : `${fmt(cw, 1)} m`, e.narrow ? 'sourced' : Number.isNaN(cw) ? 'unknown' : 'derived', e.narrow ? 'City Narrow_Roads Width_w_Parking (or full width if parking removed)' : 'Width minus parked cars (assumption)')
          + row('Moving lanes that fit', sim.eff[e.id] < 0 ? 'unknown' : sim.eff[e.id], 'game rule', F.effLanes.source)
          + row('Fire engine can pass', sim.engineOK[e.id] ? 'yes' : '<b style="color:#b91c1c">no</b>', 'game rule', F.engineBlocked.source);
      }
      rows += row('Steep grade', e.gradeReliable ? `${fmt(e.gradeMax, 1)}%` : `${fmt(e.gradeMax, 1)}% (unreliable)`, 'derived', F.gradeMax.source)
        + row('Net grade (drawn direction)', `${fmt(e.grade, 1)}%`, 'derived', F.grade.source)
        + row('Elevation at ends', `${fmt(e.z[0])} m → ${fmt(e.z[1])} m`, 'derived', F.z.source)
        + row('Speed · capacity per lane', `${fmt(e.speedMps * 2.237)} mph · ${fmt(e.capPerLaneVph)} veh/h${e.steep ? ' (steep)' : ''}`, 'game rule', F.capPerLaneVph.source)
        + row('Fire zone', e.fireZone ?? 'outside', 'sourced', F.fireZone.source) + row('Evacuation zone', e.evacZone ?? '—', 'sourced', F.evacZone.source)
        + row('City segment match', e.city?.id ?? 'none', e.city ? 'derived' : 'unknown', 'Matched by street name and distance');
      if (sim) {
        const ls = sim.edgeLinks.get(e.id) || [];
        const q = ls.map(l => sim.links[l].q.length).reduce((a, b) => a + b, 0);
        rows += row('Vehicles on segment now', q, 'synthetic')
          + row('Fire reaches · embers reach', `${sim.tFire[e.id] === Infinity ? 'never' : 't+' + hm(sim.tFire[e.id])} · ${sim.tEmber[e.id] === Infinity ? 'never' : 't+' + hm(sim.tEmber[e.id])}`, 'game rule', 'Illustrative overlay for this scenario, severity and seed');
      }
    }
    rows += row('Source record', `County OBJECTID ${e.src.OBJECTID}, SEGID ${e.src.SEGID}`, 'sourced');
    box.innerHTML = `<h2>Street segment</h2><table class="kv">${rows}</table>`;
  } else {
    const z = data.layers.evacZones[sel.id];
    let rows = row('Zone', esc(z.id), 'sourced') + row('Described as', esc(z.knownAs || '—'), 'sourced') + row('Estimated population', fmt(z.pop), 'sourced', 'Genasys zone estimate in the City layer (method not documented there)');
    if (sim) {
      let hh = 0, left = 0, noCar = 0;
      for (let h = 0; h < sim.hh.n; h++) if (sim.hh.zone[h] === sel.id) { hh++; if (sim.hh.leftHome[h] <= sim.t || sim.hh.early[h]) left++; if (!sim.hh.veh[h]) noCar++; }
      rows += row('Share inside the modeled city', `${fmt(sim.zoneCityShare[sel.id] * 100)}%`, 'derived')
        + row('Modeled households', fmt(hh), 'synthetic', `Population × share inside city × share at home ÷ ${data.A.demand.personsPerHousehold} persons per household`)
        + row('Households without a vehicle', fmt(noCar), 'synthetic')
        + row('Order issued', sim.orderT[sel.id] === Infinity ? 'no order in this run' : `t+${hm(sim.orderT[sel.id])}`, 'game rule')
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
    + (map.layers.vehicles ? `<div><span class="dot" style="background:#1d4ed8"></span>Vehicle · <span class="dot" style="background:#e11d48"></span>vehicle in ember area</div>` : '')
    + (map.layers.queues ? sw('rgba(200,20,40,.8)', 'Queue (width = how full)') : '')
    + (map.layers.responder ? sw('#0e7490', 'Engine route to fire edge') : '')
    + (map.layers.paths ? `<div><span class="sw" style="background:repeating-linear-gradient(90deg,#8a5a2b 0 3px,transparent 3px 6px)"></span>Paths &amp; stairways (no vehicles)</div>` : '');
  $('legend').innerHTML = `<b>${STREET_MODES[m]}</b>${L}${extra}`;
}

// ---------- comparison ----------
$('compare').onclick = () => {
  readPlan();
  const scope = $('cmp-scope').value, seeds = [1, 2, 3], sc = scenario();
  const cases = scope === 'severities' ? ['low', 'central', 'high'].flatMap(sev => seeds.map(seed => ({ scenarioId: sc.id, sev, seed, tod: $('tod').value })))
    : scenarios.flatMap(s => seeds.map(seed => ({ scenarioId: s.id, sev: 'central', seed, tod: s.timeOfDay })));
  const jobs = ['A', 'B'].flatMap(p => cases.map(c => ({ ...c, planKey: p, plan: { ...state.plans[p] } })));
  const batch = ++state.batch, results = [];
  $('cmp-progress').textContent = `Running ${jobs.length} simulations (identical scenarios and seeds for both plans)…`;
  worker.onmessage = ev => {
    const m = ev.data; if (m.batch !== batch) return;
    if (m.done) { $('cmp-progress').textContent = ''; renderCompare(results, scope); return; }
    results.push(m); $('cmp-progress').textContent = `Ran ${results.length} of ${jobs.length}…`;
  };
  worker.postMessage({ batch, jobs });
};
const METRICS = [
  ['People exposed to fire/embers', S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed, -1],
  ['  …at home with a car, not yet left', S => S.exposedHome, -1],
  ['  …on roads', S => S.exposedRoad, -1],
  ['  …without a vehicle', S => S.exposedNoVehicle, -1],
  ['People in ordered zones', S => S.orderedPeople, 0],
  ['People with no vehicle and no ride', S => S.noVehicle, -1],
  ['Left early', S => S.leftEarly, 0],
  ['Vehicles evacuating', S => S.vehicles, 0],
  ['90% of vehicles out, min after order (ETE)', S => S.clearP90, -1],
  ['Peak vehicles queued', S => S.peakQueued, -1],
  ['Vehicles trapped (no open route)', S => S.vehiclesNoRoute, -1],
  ['Engine travel time at ignition (min; ∞ = blocked by parked cars)', S => S.responderFree, -1],
  ['Segments too narrow for an engine', S => S.engineBlockedSegments, -1],
];
function renderCompare(results, scope) {
  const groups = scope === 'severities' ? ['low', 'central', 'high'] : scenarios.map(s => s.id);
  const gname = g => scope === 'severities' ? SEVERITY[g].label + ' severity' : scenarios.find(s => s.id === g).name;
  const pick = (p, g) => results.filter(r => r.job.planKey === p && (scope === 'severities' ? r.job.sev === g : r.job.scenarioId === g)).map(r => r.summary);
  const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const range = a => { const s = a.filter(x => x != null && !Number.isNaN(x)); return s.length ? `${fmt(Math.min(...s))}–${fmt(Math.max(...s))}` : '—'; };
  let html = `<h2>Plan comparison ${badge('synthetic')}</h2>
    <p class="small">A: <b>${esc(state.plans.A.name)}</b> · B: <b>${esc(state.plans.B.name)}</b>. Both plans ran the same fires, households and random seeds (1–3). Values are the median of 3 seeds with the min–max range under it. A difference smaller than the range is not a robust result.</p>`;
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
function explain(results, g, scope) {
  const r = results.find(x => x.job.planKey === 'B' && x.job.seed === 1 && (scope === 'severities' ? x.job.sev === g : x.job.scenarioId === g));
  return r ? r.events.filter(e => ['plan', 'responder', 'warn'].includes(e.kind)).slice(0, 6).map(e => `<li>${esc(e.text)}</li>`).join('') || '<li>No plan-specific events.</li>' : '';
}

// ---------- modals ----------
function modal(html) { $('modal-body').innerHTML = html; $('modal').showModal(); }
$('btn-assumptions').onclick = () => {
  const A = data.A, F = data.net.meta.fields;
  const val = path => { const v = path.split('.').reduce((o, k) => o?.[k], A); return typeof v === 'object' ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ') : v; };
  modal(`<h2>Assumptions &amp; limits</h2>
  <p class="note">This is an educational comparison tool. It is not a calibrated fire-behaviour or traffic model, not an official evacuation plan, and it must not guide real evacuation decisions. Follow official instructions: <a href="https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation" target="_blank" rel="noopener">City of Berkeley fire weather &amp; evacuation</a>.</p>
  <p>Labels used throughout: ${badge('sourced')} published data used as-is · ${badge('derived')} computed from sourced data · ${badge('assumption')} a placeholder you can change in <code>data/assumptions.json</code> · ${badge('game rule')} a simplification that makes the game work · ${badge('synthetic')} generated people or vehicles.</p>
  <h3>Editable assumptions and game rules (data/assumptions.json)</h3>
  <table>${Object.entries(A._meta).map(([k, m]) => `<tr><td><code>${k}</code></td><td>${esc(val(k))}</td><td>${badge(m.category)} ${esc(m.note)}</td></tr>`).join('')}</table>
  <h3>Street network fields</h3>
  <table>${Object.entries(F).map(([k, m]) => `<tr><td><code>${k}</code></td><td>${badge(m.category)} ${esc(m.source)}${m.note ? ' ' + esc(m.note) : ''}</td></tr>`).join('')}</table>
  <h3>Fire and ember overlay ${badge('game rule')}</h3>
  <p class="small">${esc(SEVERITY_NOTE)} Spread runs on ${CELL} m cells: wind sets an elliptical shape (Anderson 1983 length-to-breadth, capped at ${LB_MAX}); uphill is faster and downhill slower; a proxy fuel factor comes from the City fire zones (${Object.entries(FUEL).map(([k, v]) => `${k} ${v}`).join(', ')}), not from vegetation data. Spot fires are random, so seeds differ. A cell is "ember-exposed" once any burning cell lies within the ember distance upwind. The 1923 reference fire is confined to the City's archival boundary.</p>
  <table><tr><th>Severity</th><th>Head spread (m/min)</th><th>Wind ×</th><th>Ember distance (m)</th><th>Spot probability</th></tr>${Object.values(SEVERITY).map(s => `<tr><td>${s.label}</td><td>${s.rosMpm}</td><td>${s.windFactor}</td><td>${s.emberM}</td><td>${s.spotProb}</td></tr>`).join('')}</table>
  <h3>Time of day ${badge('assumption')}</h3><p class="small">${esc(TIME_NOTE)}</p>
  <table>${Object.values(TIME_OF_DAY).map(t => `<tr><td>${t.label}</td><td>households awaiting a commuter ${t.commuterShare * 100}%, school in session ${t.schoolInSession * 100}%, background traffic allowance ${t.background * 100}%</td><td class="small">${esc(t.note)}</td></tr>`).join('')}</table>
  <h3>How people and vehicles are modeled ${badge('synthetic')}</h3>
  <ul class="small">
    <li>Households are synthetic. Each zone's Genasys population estimate (sourced) is cut to the share inside the city, divided by ${A.demand.personsPerHousehold} persons per household (Time Study), and spread over the zone's streets in proportion to length. Residents are not reduced by time of day (Time Study).</li>
    <li>${(A.demand.householdsWithoutVehicleShare * 100).toFixed(2)}% of households have no vehicle; ${A.demand.carlessRideshareShare * 100}% of those ride with a neighbour on the same street; the rest are stranded and counted as at risk. Households that drive take 1–4 vehicles (Time Study survey). Age is not used at all.</li>
    <li>Who leaves: everyone in Order zones, ${A.demand.compliance.warning * 100}% of Warning zones, and ${A.demand.compliance.shadow * 100}% of all other households in the city as shadow evacuees driving to the city edge (Time Study). Orders follow the Time Study's zone lists for the 1923 and Panoramic Hill regions, the City's Fire Zones 2–3 region for the east-wind fires, and optionally the plan's distance rule.</li>
    <li>When: each household's departure after the order is drawn from the Time Study's survey-based mobilization tables (Table 5-9), which include noticing the order and getting ready. Households waiting for a commuter, or picking up children on school days, leave later.</li>
    <li>Evacuation time is measured like the Time Study's ETE: from the first order until 90% (and 100%) of evacuating vehicles have left the order and warning area. <code>node tests/calibration.mjs</code> compares the game with the study's results with the fire switched off.</li>
    <li>Vehicles may use every street. They head for the nearest road node outside every ordered or warned zone and the ember area, and re-plan every minute around queues, fire and embers.</li>
    <li>Each link passes at most its capacity, holds at most its storage, and each intersection passes at most its own capacity. On two-way streets with one moving lane between parked cars, each direction still has one evacuating lane: removing parking does not add evacuation lanes there.</li>
    <li>Engines travel from the nearest station to the road point nearest the ignition that the fire has not yet reached. They cannot pass segments narrower than an engine (with parked cars), and are delayed by oncoming evacuees where only one lane is clear.</li>
  </ul>
  <h3>What Phase 1 does not do</h3>
  <ul class="small">
    <li>No buildings yet, so no structures exposed or lost; no home hardening or vegetation effects.</li>
    <li>No stairway or steep-path access time between homes and the street, and no assistance for people who need help (Phase 2).</li>
    <li>Employees, students, visitors and through traffic (about 100,000 vehicles in the Time Study's weekday case) are not yet on the network, so weekday daytime evacuations are too fast (1923 repeat, case S4: game about 1 h 50 min vs study 2 h 55 min to clear 90%).</li>
    <li>Intersection capacities are illustrative per road class; the study models each signal and stop sign. Traffic circles and diverters are missing from the street file.</li>
    <li>Contraflow, traffic control and road closures beyond fire-blocked segments are not modeled.</li>
    <li>The County street file covers Berkeley only, so traffic leaving through Oakland, Albany or Kensington ends at the city edge, and zone population outside Berkeley is dropped.</li>
  </ul>`);
};
$('btn-sources').onclick = () => {
  const S = data.layers.meta.sources || [];
  modal(`<h2>Data sources</h2><p class="small">Every imported layer, where it came from and how the game uses it. See <code>DATA_INVENTORY.md</code> for missing inputs.</p>
  <table><tr><th>Layer</th><th>Publisher · retrieved</th><th>Used for</th></tr>${S.map(s => `<tr><td>${esc(s.title)} ${badge(s.category)}${s.url ? `<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener">service</a></div>` : ''}</td><td class="small">${esc(s.publisher)}<br>${esc(s.retrieved || '')}${s.lastEdit ? `<br>last edited ${esc(s.lastEdit)}` : ''}</td><td class="small">${esc(s.why)}</td></tr>`).join('')}</table>`);
};

// ---------- start ----------
showScenario(); showPlan(); legend(); newRun();
requestAnimationFrame(loop);
