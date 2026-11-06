// Guided view: four questions about one fire scenario (product brief docs/product-brief-spread-access.md, Eric
// approved 2026-11-06; SOURCE_NOTES SA1–SA12). Each question shows only the map layers it needs, a plain key, its
// findings with a robustness label, and a card for whatever the user clicks.
//
// Findings come from data/model/spread-access.json (tools/spread-access.mjs): today's plan on the chosen fire, fall
// night, low/medium/high severity × seeds 1–5, the same 15 runs per fire as Change the plan's comparisons and the
// mitigation table. Critical routes come from data/model/access-constraints.json (tools/access-constraints.mjs).
// Fires are illustrative scenario outputs and people are synthetic households; nothing here is a prediction.
import { presence, assumption, chip, levelText, SEV_WORD } from './robust.js';

let SA = null, loading = null;
export const loadSpread = () => loading ??= fetch(new URL('../data/model/spread-access.json', import.meta.url))
  .then(r => r.ok ? r.json() : null).catch(() => null).then(d => (SA = d));
export const spread = () => SA;

export const QUESTIONS = [
  { id: 'spread', title: 'Where could fire spread?', tab: 'Fire spread' },
  { id: 'routes', title: 'Which routes are critical?', tab: 'Critical routes' },
  { id: 'access', title: 'What could lose access?', tab: 'Access loss' },
  { id: 'changes', title: 'Which changes preserve access?', tab: 'Changes' },
];
// Views within a question (one set of map layers each).
export const VIEWS = {
  spread: [['ember', 'Ember exposure'], ['front', 'Fire front']],
  routes: [['ways', 'Single ways out'], ['narrow', 'Narrow streets']],
  access: [['wayout', 'Ways out the fire reached'], ['engine', 'Engine reach']],
};

// Edge and area classes: 0 not applicable, 1 not reached in any (or nearly any) run, 2 mixed, 3 sensitive, 4 consistent.
const CLS = { none: 0, never: 1, mixed: 2, sensitive: 3, consistent: 4 };
const classOf = p => !p.label ? CLS.none : p.label === 'consistent' ? (p.present ? CLS.consistent : CLS.never) : CLS[p.label];
export const PALETTE = {
  spread: ['#e5e7eb', '#cbd5e1', '#f59e0b', '#a855f7', '#b45309'],
  access: ['#e5e7eb', '#60a5fa', '#f59e0b', '#a855f7', '#b91c1c'],
};
const SEVS = ['low', 'central', 'high'];
const runSetText = (fireTitle, n) => `${fireTitle}, today's plan, fall night, low, medium and high fire severity × random seeds 1–5 (${n} runs)`;

// Per street segment: in how many runs of each severity embers (or the front) reached it, and its class.
const memo = new Map();
export function edgeClasses(fire, measure) {
  const k = `${fire}|${measure}`; if (memo.has(k)) return memo.get(k);
  const S = SA?.streets?.[fire]; if (!S) return null;
  const n = SA.meta.edges, cls = new Uint8Array(n), counts = SEVS.map(s => S[s][measure]), runs = SEVS.map(s => S[s].runs);
  const levels = e => Object.fromEntries(SEVS.map((s, i) => [s, [parseInt(counts[i][e], 36), runs[i]]]));
  for (let e = 0; e < n; e++) cls[e] = classOf(presence(levels(e)));
  const out = { cls, levels, runs: runs.reduce((a, b) => a + b, 0) };
  memo.set(k, out); return out;
}
// Per access-constrained area: in how many runs the fire front reached its entrance (its only drivable way out).
export function areaClass(fire, id) {
  const A = SA?.areas?.[fire]?.[id], runs = SA ? SA.meta.seeds.length : 5;
  const levels = Object.fromEntries(SEVS.map(s => [s, A?.front?.[s] || [0, runs]]));
  const p = presence(levels);
  return { cls: classOf(p), p, A, levels };
}
export function areaEdgeClasses(data, fire) {
  const k = `area|${fire}`; if (memo.has(k)) return memo.get(k);
  const cls = new Uint8Array(data.net.edges.length);
  if (data.access) for (const [e, areas] of data.access.edgeAreas) if (SA?.areaStatic?.[areas[0].id]) cls[e] = areaClass(fire, areas[0].id).cls;
  memo.set(k, cls); return cls;
}

// ---------- headline findings ----------
const sumBy = (n, f) => { let s = 0; for (let i = 0; i < n; i++) s += f(i); return s; };
const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

export function spreadFindings(H, data, fire, fireTitle) {
  const { fmt, esc } = H;
  if (!SA) return '<p class="small muted">The run-set table (data/model/spread-access.json) did not load, so no findings across runs can be shown. Watching one run still works.</p>';
  const E = data.net.edges, pe = SA.residentsPerEdge;
  const block = (measure, what) => {
    const C = edgeClasses(fire, measure), tip = `Tested: ${runSetText(fireTitle, C.runs)}. A street counts in a run when the modeled ${what} reached its middle within the run. Residents are synthetic. A share of runs is not a probability.`;
    const tot = c => ({ res: sumBy(E.length, e => C.cls[e] === c ? pe[e] || 0 : 0), km: sumBy(E.length, e => C.cls[e] === c && E[e].mode === 'vehicle' ? E[e].len : 0) / 1000 });
    const r = { c: tot(CLS.consistent), s: tot(CLS.sensitive), m: tot(CLS.mixed) };
    const line = (o, lab, text) => o.km > 0.05 ? `<li>${chip(lab, tip)} ${text}: <b>about ${fmt(Math.round(o.res / 10) * 10)} modeled residents</b> ${H.badge('synthetic')} on ${fmt(o.km, 1)} km of street.</li>` : '';
    return line(r.c, 'consistent', `The modeled ${what} reached these streets in every or nearly every run (at least ${Math.ceil(0.9 * C.runs)} of ${C.runs})`)
      + line(r.s, 'sensitive', `Reached at some fire severities and not others (the card for each street gives the low, medium and high counts): these depend on the fire severity assumption`)
      + line(r.m, 'mixed', `Reached in some runs and not others, without a clear pattern by severity`);
  };
  const runs = SA.runs.filter(x => x.fire === fire), em = runs.map(x => x.emberResidents);
  return `<ul class="findings">${block('ember', 'embers')}</ul>
    <details class="small"><summary>Fire front (the flames themselves)</summary><ul class="findings">${block('front', 'fire front')}</ul></details>
    <p class="small muted">Across the ${runs.length} runs, modeled embers reached streets where ${fmt(Math.round(Math.min(...em) / 10) * 10)} to ${fmt(Math.round(Math.max(...em) / 10) * 10)} modeled residents live (median ${fmt(Math.round(median(em) / 10) * 10)}) ${H.badge('synthetic', 'Persons per street segment as the simulator places synthetic households from zone population estimates (Genasys; 2020 Census blocks where Genasys publishes none), averaged over the runs.')}. These counts say where embers landed in these simulations, not who would be harmed: they count residents whether or not they had already left. The fire is ${H.badge('model rule', 'An illustrative spread model: wind, slope and a fuel proxy from the City fire zones; see Assumptions & limits.')}; where embers land does not follow the County's Ember Threat Zones (docs/fire-validation.md, finding 4).</p>`;
}

// Outermost access-constrained areas (each street counted once) with their residents in this build (mean over runs).
function outerAreas(data) {
  return (data.access?.areas || []).filter(a => !a.parent && SA?.areaStatic?.[a.id]).map(a => ({ a, s: SA.areaStatic[a.id] }));
}
export function routesFindings(H, data) {
  const { fmt, esc } = H;
  if (!data.access) return '<p class="small muted">The access analysis (data/model/access-constraints.json) did not load.</p>';
  if (!SA) return '<p class="small muted">The run-set table (data/model/spread-access.json) did not load.</p>';
  const outer = outerAreas(data), hill = outer.reduce((s, { a, s: x }) => s + x.residents * a.hillShare, 0);
  const n = SA.meta.seeds.length;
  const netTip = `The street network is the same in all ${SA.meta.runs} tested runs, so this finding does not change from run to run. It depends on County and OpenStreetMap street records (one-way codes, gates, missing links: docs/access-constraints.md, Data problems) and on how each zone's population is spread over its streets (synthetic).`;
  // Engine fit at the entrance: per area, in how many of the 5 night parking draws an engine fits; and under the earlier rule.
  const block = (k0, k1) => outer.filter(({ s }) => s[k0][0] >= k1[0] && s[k0][0] <= k1[1]).reduce((t, { a, s }) => t + s.residents * a.hillShare, 0);
  const never = block('engineFits', [0, 0]), some = block('engineFits', [1, n - 1]);
  const neverAlt = outer.filter(({ s }) => s.engineFitsAltRule[0] === 0).reduce((t, { a, s }) => t + s.residents * a.hillShare, 0);
  const sens = assumption(never, neverAlt);
  const parkTip = `Night parked cars, ${n} parking draws (seeds 1–${n}); the same on every fire. Today's rule: both sides of most 17–24 ft hill streets parked at night, leaving 8 ft (one night's count of 11 blocks, 2026-11-05; SOURCE_NOTES NP1–NP9). Under the rule used before that count, ${fmt(Math.round(neverAlt / 10) * 10)} hill residents live behind an entrance no engine passed in any draw.`;
  // Areas flagged as a population placement artifact (a zone's residents all on one street; SOURCE_NOTES AC4) are left out of the list.
  const flagged = outer.filter(x => x.a.allocationWarning).length;
  const top = outer.filter(x => !x.a.allocationWarning).sort((p, q) => q.s.residents - p.s.residents).slice(0, 5);
  return `<ul class="findings">
    <li>${chip('consistent', netTip)} <b>About ${fmt(Math.round(hill / 10) * 10)} modeled hill residents</b> ${H.badge('synthetic')} live on streets with only one modeled drivable way out ${H.badge('derived', 'tools/access-constraints.mjs: street links whose loss leaves homes with no drivable route to an exit of the model area, on the residents\' directed network.')}, in ${fmt(outer.filter(x => x.a.hillShare >= 0.5).length)} hill areas.</li>
    <li>${chip(sens === 'sensitive' ? 'sensitive' : 'consistent', parkTip)} <b>About ${fmt(Math.round(never / 10) * 10)} of them</b> live behind an entrance narrower than a fire engine needs (10 ft clear) in every night parking draw tested, and ${fmt(Math.round(some / 10) * 10)} more in some draws. ${sens === 'sensitive' ? `This depends on the night parking assumption: ${fmt(Math.round(neverAlt / 10) * 10)} under the earlier rule.` : ''}</li>
  </ul>
  <p class="small"><b>Ways out shared by the most modeled residents</b> ${H.badge('synthetic')}</p>
  <ol class="small">${top.map(({ a, s }) => `<li><button class="linkish" data-area="${esc(a.id)}">${esc(a.chokeStreets.join(' / '))}</button>: about ${fmt(Math.round(s.residents / 10) * 10)} modeled residents behind it${a.choke.engineFits === false ? ', entrance under 10 ft clear with both sides parked' : ''}</li>`).join('')}</ol>
  ${flagged ? `<p class="small muted">Left out of this list: ${fmt(flagged)} area${flagged > 1 ? 's' : ''} where a zone's whole population falls on one street, a placement artifact (docs/access-constraints.md, Data problems 2).</p>` : ''}
  <p class="small muted">A single way out is a property of the modeled street network: if that link were closed, by fire, a crash or a fallen tree, the streets behind it would have no modeled drivable route out. It does not say the link will close or that anyone would be trapped. Paths and stairways are not counted as ways out for cars.</p>`;
}

export function accessFindings(H, data, fire, fireTitle) {
  const { fmt } = H;
  if (!SA || !data.access) return '<p class="small muted">The run-set table (data/model/spread-access.json) or the access analysis did not load.</p>';
  const outer = outerAreas(data), runsN = SEVS.length * SA.meta.seeds.length;
  const tip = `Tested: ${runSetText(fireTitle, runsN)}. An area counts in a run when the modeled fire front reached its entrance, the only modeled drivable way out, within the run. Residents are synthetic. A share of runs is not a probability.`;
  const by = c => outer.filter(({ a }) => areaClass(fire, a.id).cls === c);
  const res = xs => xs.reduce((t, { s }) => t + s.residents, 0);
  const notLeft = xs => xs.reduce((t, { a }) => t + (SA.areas[fire]?.[a.id]?.notLeftMedian || 0), 0);
  const C = by(CLS.consistent), Sv = by(CLS.sensitive), M = by(CLS.mixed);
  const line = (xs, lab, text) => xs.length ? `<li>${chip(lab, tip)} ${text}: <b>${fmt(xs.length)} area${xs.length > 1 ? 's' : ''}, about ${fmt(Math.round(res(xs) / 10) * 10)} modeled residents</b> ${H.badge('synthetic')}.</li>` : '';
  const runs = SA.runs.filter(x => x.fire === fire), P = SA.parking;
  const b5 = median(P.map(p => p.count2026.engineBeyond5)), b5alt = median(P.map(p => p.pre20261105.engineBeyond5));
  const nr = median(P.map(p => p.count2026.engineNoRoute)), hillTot = runs[0]?.engineHill;
  const cut = Object.fromEntries(SEVS.map(s => [s, median(runs.filter(r => r.sev === s).map(r => r.cutOff))]));
  const cutP = presence(Object.fromEntries(SEVS.map(s => [s, [runs.filter(r => r.sev === s && r.cutOff > 0).length, runs.filter(r => r.sev === s).length]])));
  return `<ul class="findings">
    ${line(C, 'consistent', `The modeled fire front reached the only drivable way out in every or nearly every run`)}
    ${line(Sv, 'sensitive', `Reached at some fire severities and not others`)}
    ${line(M, 'mixed', `Reached in some runs only`)}
    ${C.length ? `<li class="sub small">In the consistent areas, a median of about ${fmt(Math.round(notLeft(C) / 10) * 10)} modeled residents had not yet left when the front reached their way out ${H.badge('synthetic', 'Departure timing from the 2025 Evacuation Time Study survey (Table 5-9), today\'s plan (first order 10 minutes after ignition). Driving times come from the traffic model, which runs faster than the City study (Assumptions & limits, Model performance), so this count is likely low.')}. These areas have a potential loss-of-access vulnerability in these scenarios.</li>` : ''}
    <li>${chip(assumption(b5, b5alt) || 'consistent', `Night parked cars, ${P.length} parking draws; the same on every fire. Under the night parking rule used before the 2026-11-05 count: ${fmt(b5alt)}. SOURCE_NOTES NP1–NP9, ER1–ER4.`)} <b>About ${fmt(Math.round(b5 / 10) * 10)} of ${fmt(Math.round(hillTot / 10) * 10)} modeled hill residents</b> ${H.badge('synthetic')} in Berkeley's Fire Zones 2–3 live where the modeled road network gives no engine route meeting the City's 5-minute standard ${H.badge('sourced', 'City of Berkeley 5-minute engine travel standard')}, at ignition, with the night's parked cars; for about ${fmt(Math.round(nr / 10) * 10)} no modeled engine route reaches their street at all. Under the earlier night parking rule: about ${fmt(Math.round(b5alt / 10) * 10)}.</li>
    <li>${chip(cutP.label, `Tested: ${runSetText(fireTitle, runsN)}. ${levelText(cutP.levels)} runs had at least one car with no open route.`)} At the end of the run, the median count of cars with no open modeled route out (fire had closed every route from where they were) is ${fmt(cut.low)} at low severity, ${fmt(cut.central)} at medium and ${fmt(cut.high)} at high ${H.badge('synthetic')}.</li>
  </ul>
  <p class="small muted">These are conditions in the modeled scenarios: where the modeled fire, parked cars or the road network could reduce access for residents or responders. They do not say that people would be trapped, that a road would be impassable, or that engines could not respond in a real fire.</p>`;
}

// ---------- map key ----------
export function legendHTML(q, view) {
  const sw = (c, t) => `<div><span class="sw" style="background:${c}"></span>${t}</div>`, n = SA ? SA.meta.severities.length * SA.meta.seeds.length : 15;
  if (q === 'spread') {
    const P = PALETTE.spread, what = view === 'front' ? 'the modeled fire front' : 'modeled embers';
    return `<div class="gl"><b>Streets ${what} reached across ${n} runs</b>${sw(P[4], 'In every or nearly every run (consistent)')}${sw(P[3], 'At some fire severities, not others (sensitive)')}${sw(P[2], 'In some runs only (mixed)')}${sw(P[1], 'In no run, or nearly none')}
      <div class="small muted">Colors summarize ${n} runs of this fire (low, medium and high severity × ${SA ? SA.meta.seeds.length : 5} seeds). The orange and brown shading is the one run you are watching.</div></div>`;
  }
  if (q === 'access' && view === 'wayout') {
    const P = PALETTE.access;
    return `<div class="gl"><b>Streets with one modeled way out: did the modeled fire front reach that way out?</b>${sw(P[4], 'In every or nearly every run (consistent)')}${sw(P[3], 'At some fire severities, not others (sensitive)')}${sw(P[2], 'In some runs only (mixed)')}${sw(P[1], 'In no run, or nearly none')}${sw('#c8c8c8', 'Streets with more than one way out')}
      <div class="small muted">${n} runs of this fire. Click a street for its card.</div></div>`;
  }
  return '';
}

// ---------- selection card ----------
const DOES_NOT = {
  spread: 'It does not show that this street will burn or receive embers in a real fire: the fire is an illustrative model run on the selected ignition and wind.',
  routes: 'It does not show that this link will close, or that anyone would be trapped if it did. Paths and stairways that people could walk are not counted.',
  access: 'It does not show that residents would be trapped or that engines could not respond in a real fire. Departure and driving times come from the model, which runs faster than the City\'s 2025 Evacuation Time Study.',
  changes: 'A change that preserves a modeled connection in these runs does not guarantee safe evacuation, and the simulator does not model construction, cost overruns or how people would use it.',
};
export function cardHTML(H, data, sel, { q, fire, fireTitle, sim, levers }) {
  const { fmt, esc, badge } = H;
  if (!sel || sel.kind !== 'edge') return `<h2>Selected feature</h2><p class="small muted">Click a street on the map to see what it is, why it is highlighted for this question, who depends on it, and how consistent that is across the tested runs.</p>`;
  const e = (sim?.data || data).net.edges[sel.id]; if (!e) return '';
  const name = e.name ? e.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Unnamed segment';
  const area = data.access?.edgeAreas.get(sel.id)?.[0] || null, choke = data.access?.chokeOf?.get(sel.id) || null;
  const res = SA?.residentsPerEdge?.[sel.id];
  const rows = [];
  const what = e.newLink || e.opened ? `A hypothetical connection added by a change you picked (${esc(name)}); not a County street record ${badge('assumption')}.`
    : `Street segment: <b>${esc(name)}</b>, ${esc(e.cls || 'street')}${e.widthM ? `, ${fmt(e.widthM / 0.3048)} ft of pavement ${badge(e.widthSrc?.startsWith('city:') ? 'sourced' : 'derived', e.widthSrc)}` : ''}${sim ? `, ${fmt(sim.clear[sel.id] / 0.3048)} ft clear with this run's parked cars ${badge('synthetic')}` : ''}.`;
  rows.push(['What it is', what]);
  // Why it is highlighted, and how consistent that is.
  let why = '', rob = '';
  if (q === 'spread' && SA) {
    const meas = ['ember', 'front'].map(m => { const C = edgeClasses(fire, m), lv = C.levels(sel.id), p = presence(lv); return { m, p, lv }; });
    why = meas.map(({ m, p }) => `Modeled ${m === 'ember' ? 'embers' : 'fire front'} reached it in ${p.k} of ${p.n} runs (${levelText(p.levels)}, by fire severity).`).join(' ');
    rob = chip(meas[0].p.label, `Embers. Tested: ${runSetText(fireTitle, meas[0].p.n)}.`);
  } else if ((q === 'routes' || q === 'access' || q === 'changes') && area) {
    const st = SA?.areaStatic?.[area.id];
    why = `${choke && choke.id === area.id ? 'It is the entrance' : 'It lies behind the entrance'} (${esc(area.chokeStreets.join(' / '))}) of an area whose streets have only one modeled drivable way out ${badge('derived')}.`;
    if (st) why += ` An engine fits through the entrance in ${st.engineFits[0]} of ${st.engineFits[1]} night parking draws (${st.engineFitsAltRule[0]} of ${st.engineFitsAltRule[1]} under the earlier night parking rule).`;
    if (q === 'access' && SA) {
      const ac = areaClass(fire, area.id), A = ac.A;
      why += ` The modeled fire front reached the entrance in ${ac.p.k} of ${ac.p.n} runs of this fire (${levelText(ac.levels)})${A?.notLeftMedian != null ? `; in those runs a median of about ${fmt(A.notLeftMedian)} modeled residents behind it had not yet left when it did, with a median of ${fmt(A.gapMedianMin)} min of model time (not a forecast) between the area's first order or warning and the front reaching the entrance` : ''}.`;
      rob = chip(ac.p.label, `Tested: ${runSetText(fireTitle, ac.p.n)}.`);
    } else rob = chip(st && assumption(st.engineFits[0], st.engineFitsAltRule[0]) === 'sensitive' ? 'sensitive' : 'consistent', 'The network is the same in every run; engine fit at the entrance depends on the night parking draws and rule.');
  } else if (q === 'routes' || q === 'access') {
    why = 'This street has more than one modeled drivable way out, so no single link closure cuts it off in the model.';
    if (q === 'access' && sim?.engineReach0) { const t = sim.engineReach0[sel.id]; why += ` In the run you are watching, a modeled engine route reaches it from a Berkeley station in ${t === Infinity ? 'no time: there is no modeled engine route past the parked cars and barriers' : `${fmt(t / 60, 1)} min of model time, at ignition`}.`; }
  } else if (q === 'changes') {
    const touched = (levers || []).filter(l => (l.delta?.edges?.edges || []).includes(sel.id) || (l.delta?.retreat?.edges || []).includes(sel.id));
    why = touched.length ? `Changed by: ${touched.map(l => esc(l.title)).join('; ')}.` : 'No change you picked alters this street.';
  }
  rows.push(['Why it is highlighted', `${why} ${rob}`]);
  const dep = area && SA?.areaStatic?.[area.id] ? `About ${fmt(Math.round(SA.areaStatic[area.id].residents))} modeled residents live behind this area's entrance ${badge('synthetic')}${res != null ? `, about ${fmt(res, 1)} of them on this segment` : ''}. Counts come from synthetic households, not addresses.`
    : res != null ? `About ${fmt(res, 1)} modeled residents live on this segment ${badge('synthetic')} (synthetic households from zone population estimates, averaged over the runs).` : 'No modeled residents are placed on it.';
  if (area?.allocationWarning) rows.push(['Data warning', `Population placement artifact: ${esc(area.allocationWarning)}. The residents counted here most likely live on streets reached another way (docs/access-constraints.md, Data problems 2).`]);
  rows.push(['Who depends on it', dep]);
  rows.push(['What this does not establish', DOES_NOT[q]]);
  return `<h2>Selected: ${esc(name)}</h2><table class="kv card-q">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

// ---------- changes: what a picked change does to connections (static facts beside the paired comparison) ----------
export function leverAccessHTML(H, lever, fire, fireTitle) {
  const { fmt, esc, badge } = H;
  if (!SA || !lever) return '';
  const S = SA.leverStatic?.[lever.id], F = SA.levers?.[fire]?.[lever.id];
  if (!S && !F) return '';
  const p = F ? presence(F.front) : null, pe = F ? presence(F.ember) : null;
  const tip = n => `Tested: ${runSetText(fireTitle, n)}; the fire does not depend on the plan, so this holds with or without the change.`;
  return `<li><b>${esc(lever.title)}</b>: ${S?.residentsFreed != null ? `about ${fmt(S.residentsFreed)} modeled residents ${badge('synthetic')} no longer live behind a single drivable way out ${badge('derived', S.source)}${p ? '; ' : '.'}` : ''}${p ? `the modeled fire front reached the new connection in ${p.k} of ${p.n} runs of this fire and embers in ${pe.k} ${chip(p.label, tip(p.n))}. In those runs the connection would be unavailable or exposed: it preserves access only while the fire has not reached it.` : ''}</li>`;
}
