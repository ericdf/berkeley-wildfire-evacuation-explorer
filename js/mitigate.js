// Guided view, "Change the plan": the catalog of changes a user can stack, and the measures a
// comparison reports. Reads data/model/mitigations.json (tools/mitigations.mjs; SOURCE_NOTES MS1–MS11).
// The stored results are not shown as answers (Eric, 2026-11-02: people should explore, not be told).
// They are used for one thing only: a change that did not reliably help on the chosen fire in the
// stored runs is shown greyed out, with that explanation, so people see it was considered.

// Measures of a live comparison, from Evacuation.summary(). Lower is better for every one; a run
// that never reaches 90% clearance (null) counts as slower than any that does.
// Order (product brief, "Mitigations as paired scenarios"): access measures first, then exposure, then model time.
// group: 'access' and 'exposure' lead the comparison; 'time' is secondary, labeled model time, and never ranks a change.
export const MEASURES = {
  engine: { group: 'access', label: 'Hill residents with no engine route meeting the 5-minute standard', f: S => S.engineReachBeyond5People,
    tip: 'Synthetic residents of Berkeley\'s Fire Zones 2–3 whose street the modeled road network gives no engine route to from a Berkeley station within the City\'s 5-minute standard, at ignition, with the plan\'s parked cars. Engines only drive in this simulator; they do not fight the fire.' },
  noRoute: { group: 'access', label: 'Hill residents with no modeled engine route at all', f: S => S.engineReachUnreachablePeople,
    tip: 'Synthetic residents of Berkeley\'s Fire Zones 2–3 whose street no modeled engine route reaches from a Berkeley station, at ignition, past the plan\'s parked cars and fixed barriers.' },
  cutOff: { group: 'access', label: 'Cars with no open modeled route out', f: S => S.vehiclesNoRoute,
    tip: 'Cars on the road at the end of the run for which the modeled fire had closed every route out. A model state, not a count of people trapped.' },
  ember: { group: 'exposure', label: 'Modeled residents not yet out when embers reached their street', f: S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed,
    tip: 'Synthetic people at home when modeled embers first reached their street, or on the road in a car under embers after leaving; each person counted once. Depends on departure timing and on the traffic model, which runs faster than the City study. Not a casualty count.' },
  front: { group: 'exposure', label: 'Modeled residents not yet out when the fire front reached their street', f: S => S.fireFrontHome + S.fireFrontRoad,
    tip: 'Synthetic people at home when the modeled fire front reached their street, or on the road in a car on a burning street; each person counted once. Not a casualty count.' },
  clear90: { group: 'time', label: 'Model minutes after the first order until 90% of ordered cars are out (not a forecast)', f: S => S.clearP90, time: true,
    tip: 'Simulated model time, not a forecast: the traffic model\'s 90% times run 4–39% short of the City\'s 2025 Evacuation Time Study on 7 of its 8 calibration cases, by more than 10% on 3 (Assumptions & limits, Model performance). Never used to rank a change. "Not reached" counts as slower than any time.' },
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
  const ms = Object.entries(s.measures).filter(([k]) => k !== 'clear90'); // model time never decides whether a change is offered (product brief)
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
