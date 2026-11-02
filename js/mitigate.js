// Simple view, "Try changes": the catalog of changes a user can stack, and the measures a
// comparison reports. Reads data/model/mitigations.json (tools/mitigations.mjs; SOURCE_NOTES MS1–MS11).
// The stored results are not shown as answers (Eric, 2026-11-02: people should explore, not be told).
// They are used for one thing only: a change that did not reliably help on the chosen fire in the
// stored runs is shown greyed out, with that explanation, so people see it was considered.

// Measures of a live comparison, from Evacuation.summary(). Lower is better for every one; a run
// that never reaches 90% clearance (null) counts as slower than any that does.
export const MEASURES = {
  ember: { label: 'People still there when embers arrived', f: S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed,
    tip: 'Synthetic people at home, on the road, or without a car when embers first reached their street. Not a casualty count.' },
  front: { label: 'People still there when the fire front arrived', f: S => S.fireFrontHome + S.fireFrontRoad,
    tip: 'Synthetic people at home or on the road when the fire front itself reached their street, as in the outcomes panel. Not a casualty count.' },
  cutOff: { label: 'Cars cut off by fire', f: S => S.vehiclesNoRoute,
    tip: 'Cars on the road with no remaining way out at the end of the run.' },
  engine: { label: 'Hill residents an engine cannot reach within 5 minutes', f: S => S.engineReachBeyond5People,
    tip: 'Residents of Fire Zones 2–3 whose street no engine can reach from a Berkeley station within the City\'s 5-minute standard, with the plan\'s parked cars. Engines only drive in this simulator; they do not fight the fire.' },
  clear90: { label: 'Minutes after the first order until 90% of ordered cars are out', f: S => S.clearP90, time: true,
    tip: 'From the first evacuation order (10 minutes after ignition in today\'s plan) until 90% of the cars that start in ordered zones have left them, as the Evacuation Time Study measures it. "Not reached" counts as slower than any time.' },
};

let MIT = null;
export async function loadMitigations() {
  try { const r = await fetch(new URL('../data/model/mitigations.json', import.meta.url)); MIT = r.ok ? await r.json() : null; } catch { MIT = null; }
  return MIT;
}
export const mit = () => MIT;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;
// Provenance of a cost: capital ranges are screening estimates built from sourced unit costs and
// assumptions (derived); "little capital cost" is this project's assumption.
export const costBadge = c => {
  const cat = c?.capital ? 'derived' : /^Little capital/.test(c?.note || '') ? 'assumption' : 'not priced';
  const tip = [c?.capital ? 'Screening range, not a project budget or appraisal.' : '', c?.note || '', c?.source ? `Source: ${c.source}.` : ''].filter(Boolean).join(' ');
  return `<span class="badge b-${{ derived: 'derived', assumption: 'assumption' }[cat] || 'missing'}" title="${esc(tip)}">${cat} ⓘ</span>`;
};
export const costText = c => !c ? 'Cost not priced' : c.capital ? `${money(c.capital[0])}–${money(c.capital[1])}` : /^Little capital/.test(c.note || '') ? 'Little capital cost' : 'Not priced here';

// The stored runs' verdict on a change for one fire: reliable when some measure did better in every
// run, or in at least three of four and never worse. harms: measures worse in at least three of four
// and never better. Stored measure labels come from the table (its "front" counts people at home).
export function stored(id, fire) {
  const s = MIT?.summaries.find(x => x.lever === id && x.fire === fire); if (!s) return null;
  const ms = Object.entries(s.measures);
  const reliable = ms.some(([, m]) => m.holds || (m.worse === 0 && m.better >= Math.ceil(m.n * 0.75)));
  const harms = ms.filter(([, m]) => m.better === 0 && m.worse >= Math.ceil(m.n * 0.75)).map(([k, m]) => ({ label: MIT.meta.measures[k]?.label || k, worse: m.worse, n: m.n }));
  return { reliable, harms, runs: s.runs };
}

// Groups for the checklist: the plan's two halves (Eric, 2026-11-02: "there's a fire scenario and a plan
// and we are testing the plan against that scenario"), changes made before the fire and the response on the day.
export const GROUPS = [
  ['Before the fire', [['Streets and parking', ['parking', 'widen']], ['New roads', ['link']], ['Buyouts', ['retreat']]]],
  ['On the day', [['When people leave', ['timing']], ['Traffic management', ['operations']]]],
];
