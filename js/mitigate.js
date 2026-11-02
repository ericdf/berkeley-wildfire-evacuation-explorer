// Simple view, steps 2 and 3: what the chosen fire does, and which mitigations change it.
// Reads data/model/mitigations.json (tools/mitigations.mjs; SOURCE_NOTES MS1–MS9): every lever run
// against one baseline (DEFAULT_PLAN, fall night S6) on the same fires, severities and seeds.
// A lever "holds" on a measure only if it did better in every same-seed run (15 of 15).
import { DEFAULT_PLAN } from './sim.js';

export const MEASURES = {
  ember: { label: 'People still there when embers arrived', short: 'still there when embers arrived', f: S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed,
    tip: 'Synthetic people at home, on the road, or without a car when embers first reached their street. Not a casualty count.' },
  front: { label: 'People still home when the fire front arrived', short: 'still home when the fire front arrived', f: S => S.fireFrontHome,
    tip: 'Synthetic people who had not left home when the fire front itself reached their street. Not a casualty count.' },
  cutOff: { label: 'Cars cut off by fire', short: 'cars cut off by fire', f: S => S.vehiclesNoRoute,
    tip: 'Cars on the road with no remaining way out at the end of the run.' },
  engine: { label: 'Hill residents an engine cannot reach within 5 minutes', short: 'hill residents engines cannot reach in 5 min', f: S => S.engineReachBeyond5People,
    tip: 'Residents of Fire Zones 2–3 whose street no engine can reach from a Berkeley station within the City\'s 5-minute standard, with the plan\'s parked cars. Engines only drive in this simulator; they do not fight the fire.' },
  clear90: { label: 'Minutes after the first order until 90% of ordered cars are out', short: 'minutes to get 90% of cars out', f: S => S.clearP90, time: true,
    tip: 'From the first evacuation order (10 minutes after ignition in today\'s plan) until 90% of the cars that start in ordered zones have left them, as the Evacuation Time Study measures it.' },
};
const PEOPLE = ['ember', 'front', 'cutOff'];

let MIT = null;
export async function loadMitigations() {
  try { const r = await fetch(new URL('../data/model/mitigations.json', import.meta.url)); MIT = r.ok ? await r.json() : null; } catch { MIT = null; }
  return MIT;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = x => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const money = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;
// Provenance of a cost: capital ranges are screening estimates built from sourced unit costs and
// assumptions (derived); "little capital cost" is this project's assumption.
const costBadge = c => {
  const cat = c?.capital ? 'derived' : /^Little capital/.test(c?.note || '') ? 'assumption' : 'not priced';
  const tip = [c?.capital ? 'Screening range, not a project budget or appraisal.' : '', c?.note || '', c?.source ? `Source: ${c.source}.` : ''].filter(Boolean).join(' ');
  return `<span class="badge b-${{ derived: 'derived', assumption: 'assumption' }[cat] || 'missing'}" title="${esc(tip)}">${cat} ⓘ</span>`;
};
const costText = c => !c ? 'Cost not priced' : c.capital ? `${money(c.capital[0])}–${money(c.capital[1])}` : /^Little capital/.test(c.note || '') ? 'Little capital cost' : 'Not priced here';
const val = (k, x) => x == null ? (MEASURES[k].time ? 'not reached' : '—') : MEASURES[k].time ? `${Math.round(x)} min` : n0(x);

// Step 2: the chosen fire's baseline, central-severity medians of 5 seeds.
export function damageHTML(fire) {
  if (!MIT?.baseline?.[fire]) return '<p class="small muted">The mitigation results (data/model/mitigations.json) did not load.</p>';
  const b = MIT.baseline[fire];
  return `<div class="damage">${Object.keys(MEASURES).map(k => `<div class="dm" title="${esc(MEASURES[k].tip)}"><b>${val(k, b[k])}</b><span>${esc(MEASURES[k].label)} ⓘ</span></div>`).join('')}</div>
    <p class="small muted">Today's plan: first order 10 minutes after the fire starts, today's parking, a fall night. Middle of 5 runs at central severity. Synthetic households on an illustrative fire, not a prediction.</p>`;
}

function effects(s) {
  // Measures the lever improves: "every run" (15 of 15), or "most runs, never worse" (shown only for engine reach and cars cut off).
  const out = [];
  for (const k of Object.keys(MEASURES)) {
    const m = s.measures[k]; if (!m) continue;
    const every = m.holds, most = !every && m.worse === 0 && m.better >= Math.ceil(m.n * 0.75);
    if (every || most) out.push({ k, m, every });
  }
  return out;
}
// Measures the lever makes worse in at least three of four runs and never better.
function harms(s) {
  return Object.keys(MEASURES).map(k => ({ k, m: s.measures[k] })).filter(({ m }) => m && m.better === 0 && m.worse >= Math.ceil(m.n * 0.75));
}

// The levers for one fire, grouped: holds on people or cars; helps engines; nothing reliable.
export function leverGroups(fire) {
  if (!MIT) return null;
  const ran = MIT.levers.filter(l => l.ran && l.group !== 'check');
  const rows = ran.map(l => ({ l, s: MIT.summaries.find(x => x.lever === l.id && x.fire === fire) })).filter(r => r.s).map(r => ({ ...r, eff: effects(r.s), harm: harms(r.s) }));
  const people = rows.filter(r => r.eff.some(e => e.every && PEOPLE.includes(e.k)))
    .sort((a, b) => (a.s.measures.ember.change ?? 0) - (b.s.measures.ember.change ?? 0));
  const engines = rows.filter(r => !people.includes(r) && r.eff.some(e => e.k === 'engine'))
    .sort((a, b) => (a.s.measures.engine.change ?? 0) - (b.s.measures.engine.change ?? 0) || (a.l.cost?.capital?.[0] ?? 0) - (b.l.cost?.capital?.[0] ?? 0));
  const none = rows.filter(r => !people.includes(r) && !engines.includes(r));
  const other = MIT.levers.filter(l => !l.ran && l.group !== 'check');
  return { people, engines, none, other };
}

// A lever can be tried on the map when it is a plan setting; street, link and buyout changes were
// run offline (tools/mitigations.mjs) and are not plan settings yet.
export const tryable = l => !!(l.delta?.plan && !l.delta.edges && !l.delta.link && !l.delta.retreat);

function card(r, fire) {
  const { l, s, eff, harm } = r, n = s.runs;
  const bad = harm.map(({ k, m }) => `<li class="worse" title="${esc(MEASURES[k].tip)}"><b>Worse — ${esc(MEASURES[k].label)}:</b> ${val(k, m.baselineCentral)} → ${val(k, m.leverCentral)} · worse in ${m.worse} of ${n}, never better</li>`).join('');
  const lines = eff.map(({ k, m, every }) => `<li title="${esc(MEASURES[k].tip)}"><b>${esc(MEASURES[k].label)}:</b> ${val(k, m.baselineCentral)} → ${val(k, m.leverCentral)} · ${every ? `better in all ${n} runs` : `better in ${m.better} of ${n}, never worse`}</li>`).join('');
  return `<div class="lever">
    <div class="lever-h"><b>${esc(l.title)}</b><span class="cost">${esc(costText(l.cost))} ${costBadge(l.cost)}</span></div>
    ${l.what ? `<div class="small">${esc(l.what)}.</div>` : ''}
    ${lines || bad ? `<ul class="small">${lines}${bad}</ul>` : ''}${lines ? '' : `<p class="small muted">No measure improved reliably on this fire.</p>`}
    ${l.cannotMeasure ? `<div class="cant"><b>What the simulator can't tell you:</b> ${esc(l.cannotMeasure)}</div>` : ''}
    ${tryable(l) ? `<button class="try" data-lever="${esc(l.id)}">Compare it with today's plan on the map</button>` : '<div class="small muted">A street, new-road or buyout change: tested offline on these fires; not adjustable on the map yet.</div>'}
  </div>`;
}

// Step 3.
export function leversHTML(fire) {
  const g = leverGroups(fire); if (!g) return '';
  const n = MIT.meta.severities.length * MIT.meta.seeds.length;
  return `<p class="small muted">Each change below was run against today's plan on this fire ${n} times (low, central and high severity × ${MIT.meta.seeds.length} seeds) with the same households. Under each change, a line appears only where it did better in every run, or in at least three in four runs and never worse; it is listed as getting people out only where it did better in every run. Numbers are the central-severity middle run.</p>
    <h3>Gets more people out before the fire arrives</h3>
    ${g.people.length ? g.people.map(r => card(r, fire)).join('') : '<p class="small muted">None of the tested changes did better in every run on this fire.</p>'}
    <h3>Lets fire engines reach more homes</h3>
    ${g.engines.length ? g.engines.map(r => card(r, fire)).join('') : '<p class="small muted">None on this fire.</p>'}
    <details${g.none.some(r => r.harm.length) ? ' open' : ''}><summary>No reliable benefit on this fire (${g.none.length}${g.none.some(r => r.harm.length) ? ', some make things worse' : ''})</summary>${g.none.map(r => card(r, fire)).join('')}</details>
    ${g.other.length ? `<details><summary>Not compared here (${g.other.length})</summary><ul class="small">${g.other.map(l => `<li><b>${esc(l.title)}:</b> ${esc(l.notComparable || l.pending || l.stopped || '')}</li>`).join('')}</ul></details>` : ''}`;
}

// A Simple-view comparison built from a lever: Plan A today's plan, Plan B today's plan with the
// lever, fall night, with "What to look for" written from the stored runs.
export function leverPreset(id, fire) {
  const l = MIT.levers.find(x => x.id === id), s = MIT.summaries.find(x => x.lever === id && x.fire === fire);
  const eff = effects(s), harm = harms(s), first = eff.find(e => e.every) || harm[0] || eff[0];
  const k = first?.k || 'ember', m = s.measures[k];
  const look = `${MEASURES[k].label}: about ${val(k, m.baselineCentral)} under Plan A and ${val(k, m.leverCentral)} under Plan B in the central case; Plan B did better in ${m.better} of ${s.runs} stored runs${m.worse ? ` and worse in ${m.worse}` : ''}. ${l.cannotMeasure ? `What the simulator can't tell you: ${l.cannotMeasure}` : ''}`;
  return {
    id: `lever:${id}`, lever: id, title: l.title, question: l.what || l.title, tod: MIT.meta.timeOfDay || 'S6',
    A: { ...DEFAULT_PLAN, name: "A: today's plan" }, B: { ...DEFAULT_PLAN, ...l.delta.plan, name: `B: ${l.title}` },
    on: { [fire]: look }, off: {},
    headline: { label: MEASURES[k].label, f: MEASURES[k].f, dir: -1 },
  };
}
