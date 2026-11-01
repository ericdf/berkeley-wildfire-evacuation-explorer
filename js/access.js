// Access-constrained areas: inspector card, Expert-view summary, ranking table and map key.
// Data from data/model/access-constraints.json (tools/access-constraints.mjs; method in
// docs/access-constraints.md). Residents, households and vehicles are synthetic.
import { ACCESS_BINS } from './map.js';

const SYNTH_NOTE = 'Residents are synthetic: each evacuation zone\'s population spread over its streets by length. A model result, not a list of homes, not a prediction and not an official evacuation plan.';
const fzLabel = k => k === '0' ? 'no zone' : `FZ${k}`;
const pct = x => `${Math.round(x * 100)}%`;
const ONE_WAY = 'n/a: two-way operation of the entrance would open it';

export function fireZoneMix(a) {
  const R = a.residentsByFireZone, tot = Object.values(R).reduce((s, v) => s + v, 0);
  if (!tot) return '—';
  return Object.entries(R).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${fzLabel(k)} ${pct(v / tot)}`).join(', ');
}
export function hintText(a, fmt) {
  const h = a.nearestOtherStreet;
  if (a.type === 'one-way') return ONE_WAY;
  if (!h) return '—';
  return `${h.street}: ${fmt(h.distM)} m line, ${h.climbM >= 0 ? '+' : '−'}${fmt(Math.abs(h.climbM))} m climb${h.gradePct == null ? '' : ` (${fmt(h.gradePct, 1)}%)`}, ${fmt(h.drivingNowM)} m by road now`;
}
export function pathText(a, fmt) {
  const l = a.existingLink;
  if (!l) return '—';
  return `${l.names.join(', ')} (${l.kinds.join(', ')}), ${fmt(l.lengthM)} m to ${l.reaches}, max grade ${fmt(l.maxGradePct, 1)}%${l.enginesPass ? '; engines pass' : ''}`;
}
const widthText = (c, fmt) => c.clearWidthFt == null ? 'unknown' : `${fmt(c.clearWidthFt)} ft (${fmt(c.clearWidthM, 1)} m), SB 99 tier: ${c.sb99Tier}`;
const fitsText = f => f == null ? 'unknown (no width data)' : f ? 'yes' : '<b style="color:#b91c1c">no</b>';

// The card for the innermost area that contains a street; its enclosing areas are listed under Nesting.
export function accessCard(data, a, { badge, esc, fmt }) {
  const acc = data.access, P = acc.meta.provenance;
  const row = (k, v, cat, note) => `<tr><td>${k}</td><td>${v}${badge(cat, note)}</td></tr>`;
  const chain = []; for (let p = a.parent && acc.byId.get(a.parent); p; p = p.parent && acc.byId.get(p.parent)) chain.push(p);
  const c = a.choke, ns = a.narrowestStemChoke;
  const stemNote = c.clearWidthFt == null && ns?.clearWidthM != null ? `; narrowest choke on the same stem: ${fmt(ns.clearWidthM / 0.3048)} ft on ${esc(ns.street)}, engine ${ns.engineFits ? 'fits' : 'does not fit'}` : '';
  const ev = Object.entries(a.evacZones).sort((p, q) => q[1] - p[1]).map(([z, r]) => `${esc(z)} ${fmt(r)}`).join(', ');
  let rows = row('Entrance (choke)', esc(a.chokeStreets.join(' / ')) + ` (${fmt(a.chokeLengthM)} m)`, 'derived', P.chokeEdges)
    + row('Type', a.type === 'dead end' ? 'dead end: the entrance is the only street connection' : 'one-way only: softer, two-way operation of the entrance would open it', 'derived', P.type)
    + row('Streets behind it', `${esc(a.streets.join(', '))} (${fmt(a.streetLengthM / 1000, 1)} km)`, 'derived', 'Drivable streets whose every route out passes the entrance')
    + row('Residents', fmt(a.residents), 'synthetic', P.residents)
    + row('Households', fmt(a.households), 'synthetic', P.households)
    + row('Vehicles taken', fmt(a.vehicles), 'synthetic', P.vehicles)
    + row('Evacuation zones (residents)', ev, 'synthetic', 'Residents by Genasys zone, from the same allocation')
    + row('Nesting', a.nesting === 1 ? '1 (one choke between these streets and an exit)' : `${a.nesting}, inside ${chain.map(p => `${esc(p.id)} (${esc(p.chokeStreets.join(' / '))}, ${fmt(p.residents)} residents)`).join(' inside ')}`, 'derived', P.nesting)
    + row('Clear width at entrance', widthText(c, fmt) + stemNote, c.clearWidthFt == null ? 'unknown' : 'derived', P.choke)
    + row('Fire engine fits at entrance', fitsText(c.engineFits), c.engineFits == null ? 'unknown' : 'derived', 'Clear width of 10 ft or more (assumption access.engineClearM) with status-quo parking in its nominal state: both sides parked where a car fits')
    + row('Steepest grade', a.steepestGradePct == null ? '—' : `${fmt(a.steepestGradePct, 1)}%`, 'derived', P.steepestGradePct)
    + row('Fire-zone mix (residents)', fireZoneMix(a), 'derived', 'Share of synthetic residents by City Fire Zone of their street. FZ2 outside Berkeley is the simulator\'s 90 m elevation proxy; "no zone" is outside Berkeley below 90 m.')
    + row('Nearest other street', esc(hintText(a, fmt)), 'derived', a.type === 'one-way' ? 'For a one-way area a new street is not the remedy: running the entrance two-way would open it.' : P.nearestOtherStreet)
    + row('Existing path or stairway', esc(pathText(a, fmt)), 'derived', P.existingLink)
    + (a.emergencyVehicleLink ? row('Barrier engines could use', esc(pathText({ existingLink: a.emergencyVehicleLink }, fmt)), 'derived', P.emergencyVehicleLink) : '')
    + row('Constraint score', `${fmt(a.constraint.score)} = ${fmt(a.residents)} residents × nesting ${a.constraint.nesting} × narrowness ${a.constraint.narrowFactor} × hill ${fmt(a.constraint.hillFactor, 2)}`, 'model rule', P.constraint);
  const warn = a.allocationWarning ? `<p class="note">⚠ Population placement artifact: ${esc(a.allocationWarning)}. The 2020 Census blocks most likely hold homes reached from other streets (docs/access-constraints.md, Data problems 2).</p>` : '';
  return `<h2>Access-constrained area ${esc(a.id)}</h2><p class="note">${SYNTH_NOTE}</p>${warn}<table class="kv">${rows}</table>
  <p class="small muted">Source: <code>tools/access-constraints.mjs</code> on the simulator's street network, built ${esc(acc.meta.built)}; method and checks in <code>docs/access-constraints.md</code>.</p>`;
}

export function accessSummary(data, { badge, fmt }) {
  const T = data.access.totals;
  const hill = 'Hill: a street in City Fire Zone 2 or 3, or outside Berkeley at 90 m elevation or higher. Synthetic residents from zone populations; choke points derived from the street network.';
  return `<div>Hill residents behind a choke point: <b>${fmt(T.hillResidentsBehindAnyChoke)} of ${fmt(T.modeledHillResidents)}</b>${badge('synthetic', hill)}</div>
  <div class="muted">Berkeley and LBNL zones: ${fmt(T.berkeleyHillResidentsBehindAnyChoke)} of ${fmt(T.berkeleyHillResidents)}. A model result, not a prediction.</div>
  <a href="#" id="access-table-link">Table of the top areas</a>`;
}

const COLS = [
  ['id', 'Area', a => a.id, null],
  ['type', 'Type', a => a.type, 'derived'],
  ['entrance', 'Entrance (choke)', a => a.chokeStreets.join(' / '), 'derived'],
  ['residents', 'Residents', a => a.residents, 'synthetic', 1],
  ['households', 'Households', a => a.households, 'synthetic', 1],
  ['vehicles', 'Vehicles', a => a.vehicles, 'synthetic', 1],
  ['nesting', 'Nesting', a => a.nesting, 'derived', 1],
  ['width', 'Clear width, ft', a => a.choke.clearWidthFt, 'derived', 1],
  ['fits', 'Engine fits', a => a.choke.engineFits == null ? 'unknown' : a.choke.engineFits ? 'yes' : 'no', 'derived'],
  ['grade', 'Steepest grade, %', a => a.steepestGradePct, 'derived', 1],
  ['fz', 'Fire zone', a => fireZoneMix(a), 'derived'],
  ['narrow', 'Narrowness', a => a.constraint.narrowFactor, 'model rule', 1],
  ['hill', 'Hill factor', a => a.constraint.hillFactor, 'model rule', 1],
  ['score', 'Score', a => a.constraint.score, 'model rule', 1],
  ['hint', 'Nearest other street', a => hintText(a, x => Math.round(x).toLocaleString()), 'derived'],
  ['path', 'Existing path', a => pathText(a, x => Math.round(x * 10) / 10), 'derived'],
];

// Sortable table of the union of both rankings (top 50 by residents, top 50 by constraint score).
export function accessTable(data, { badge, esc, fmt }, onPick) {
  const acc = data.access, R = acc.rankings;
  const ids = [...new Set([...R.byResidents, ...R.byConstraint])];
  const rows = ids.map(id => acc.byId.get(id)).filter(Boolean);
  let key = 'residents', dir = -1;
  const head = `<h2>Access-constrained areas: top by residents and by constraint score</h2>
  <p class="note">${SYNTH_NOTE}</p>
  <p class="small">${rows.length} areas: the top 50 by residents behind the choke and the top 50 by constraint score, overlapping. Areas with nesting 2 or more lie inside a larger area, so rows overlap and do not add up. Score = residents × nesting × narrowness × hill factor ${badge('model rule', acc.meta.provenance.constraint)}: a transparent way to sort with no calibration behind it; the components are shown so you can re-sort. Narrowness is 4, 3, 2 or 1 for the SB 99 tiers severely (6 ft or less), moderately (7–8 ft), constrained (9–10 ft) and not narrow (or unknown); hill factor is 1 + the share of residents on Fire Zone 2–3 streets. ⚠ marks a population placement artifact. Click an area to show it on the map.</p>
  <div id="access-table"></div>`;
  const render = () => {
    const col = COLS.find(c => c[0] === key);
    const v = a => { const x = col[2](a); return x == null ? (col[4] ? -Infinity : '') : x; };
    rows.sort((p, q) => { const x = v(p), y = v(q); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
    const cell = (c, a) => { const x = c[2](a); if (c[0] === 'id') return `<a href="#" style="white-space:nowrap" data-area="${esc(a.id)}">${esc(a.id)}</a>${a.allocationWarning ? ' ⚠' : ''}`; return x == null ? '—' : typeof x === 'number' ? fmt(x, c[0] === 'hill' ? 2 : c[0] === 'grade' ? 1 : 0) : esc(x); };
    document.getElementById('access-table').innerHTML = `<table class="sortable"><tr>${COLS.map(c => `<th class="${c[4] ? 'num' : ''}" data-k="${c[0]}" title="Sort">${c[1]}${key === c[0] ? (dir < 0 ? ' ▾' : ' ▴') : ''}${c[3] ? '<br>' + badge(c[3]) : ''}</th>`).join('')}</tr>${rows.map(a => `<tr>${COLS.map(c => `<td class="${c[4] ? 'num' : ''}">${cell(c, a)}</td>`).join('')}</tr>`).join('')}</table>`;
    for (const th of document.querySelectorAll('#access-table th')) th.onclick = () => { if (key === th.dataset.k) dir = -dir; else { key = th.dataset.k; dir = COLS.find(c => c[0] === key)[4] ? -1 : 1; } render(); };
    for (const el of document.querySelectorAll('#access-table [data-area]')) el.onclick = e => { e.preventDefault(); onPick(acc.byId.get(el.dataset.area)); };
  };
  return { html: head, render };
}

export function accessLegend() {
  const sw = (style, t) => `<div><span class="sw" style="${style}"></span>${t}</div>`;
  return '<div style="margin-top:5px"><b>Access constraints</b></div>'
    + `<div>Residents behind the choke <span class="badge b-synthetic">synthetic</span></div>`
    + `<div class="ramp">${ACCESS_BINS.map(b => `<span><i style="background:${b[1]}"></i>${b[2]}</span>`).join('')}</div>`
    + sw('background:#3987e5;height:6px', 'Dead end: band under its streets')
    + sw('background:repeating-linear-gradient(90deg,#3987e5 0 6px,transparent 6px 10px);height:6px', 'One-way only: two-way use would open it')
    + sw('background:#1f2937;height:7px', 'Choke; engine fits (10 ft or more clear)')
    + sw('background:#c0262d;height:7px', 'Choke under 10 ft clear, both sides parked')
    + sw('background:#fff;border:2px solid #1f2937;height:3px', 'Choke, width unknown')
    + sw('background:repeating-linear-gradient(90deg,#111 0 6px,transparent 6px 10px);height:2px', 'Nearest other street (straight line)')
    + sw('background:repeating-linear-gradient(90deg,#8a5a2b 0 3px,transparent 3px 6px);height:4px', 'Existing path or stairway out')
    + sw('background:repeating-linear-gradient(135deg,rgba(154,52,18,.5) 0 2px,transparent 2px 5px);border:1px dashed #9a3412;height:8px', '⚠ A zone\'s residents all on one street');
}
