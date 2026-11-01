#!/usr/bin/env node
// Writes docs/egress-candidates.md from data/model/egress-candidates.json and data/model/egress-sim.json.
//   node tools/egress-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const EC = J('data/model/egress-candidates.json'), SIM = fs.existsSync(path.join(R, 'data/model/egress-sim.json')) ? J('data/model/egress-sim.json') : null;
const AC = J('data/model/access-constraints.json');
const areaById = new Map(AC.areas.map(a => [a.id, a]));
const M = EC.meta, RU = M.rules;
const n0 = v => v == null ? '—' : Math.round(v).toLocaleString('en-US');
const n1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('en-US');
const money = v => v == null ? '—' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`;
const range = r => r ? `${money(r[0])}–${money(r[1])}` : '—';
const pctS = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const mins = v => v == null ? 'not all out' : `${Math.round(v)}`;
const areaName = id => { const a = areaById.get(id); return a ? `${id} ${a.streets.slice(0, 2).join(', ')}${a.streets.length > 2 ? ' …' : ''}` : id; };
const ranked = EC.candidates.filter(c => c.rank).sort((a, b) => a.rank - b.rank);
const city = EC.candidates.find(c => c.type === 'city');
const byId = new Map(EC.candidates.map(c => [c.id, c]));
const typeName = { new: 'new road', path: 'path upgrade', barrier: 'open barrier', city: 'City concept' };
const grade = c => `${n1(c.profile.climbM)} m; avg ${n1(c.profile.avgGradePct)}%, 25 m windows p90 ${n1(c.profile.p90GradePct)}% (worst ${n1(c.profile.maxGradePct)}%)${c.gradeFlags.over20 ? ' (>20%)' : c.gradeFlags.over15 ? ' (>15%)' : ''}`;
const land = c => { const L = c.land, f = []; if (L.ucShare) f.push(`UC ${pctS(L.ucShare)}`); if (L.lbnlShare) f.push(`LBNL ${pctS(L.lbnlShare)}`); if (L.ebrpdShare) f.push(`EBRPD ${pctS(L.ebrpdShare)}`); if (L.parkShare && !L.ebrpdShare) f.push(`park ${pctS(L.parkShare)}`); return f.join(', ') || '—'; };
const parcels = c => c.parcels ? `${c.parcels.crossed} / ${c.parcels.inCorridor}` : 'no data';
const fz = c => c.fireZone?.zone == null ? '—' : c.fireZone.src === 'city:FireZones' ? `FZ${c.fireZone.zone}` : 'hill (≥90 m)';
const eff = (c, v = 'asIs') => c.access?.[v];

function rankedTable(list) {
  const rows = list.map(c => {
    const e = eff(c), A = e.area;
    return `| ${c.rank ?? '—'} | ${c.id} | ${areaName(c.area)}${c.alsoFor ? ` (also ${c.alsoFor.join(', ')})` : ''} | ${typeName[c.type]} | ${c.endpoints[0].street} → ${c.toStreet} | ${n0(c.lengthM)} | ${grade(c)} | ${pctS(c.pathShare)} | ${c.buildingsInCorridor} | ${parcels(c)} | ${c.parcels ? pctS(c.parcels.outsideParcelsShare) : '—'} | ${land(c)} | ${fz(c)} | ${n0(e.hillResidentsFreed)} | ${A ? `${n0(A.residentsBehindBefore)} → ${n0(A.residentsBehindAfter)}; nesting ${A.nestingBefore} → ${A.nestingAfter}` : '—'} | ${range(c.cost.construction)} | ${c.type === 'barrier' ? 'not priced' : range(c.cost.acquisition)} |`;
  });
  return ['| # | Candidate | Area | Type | Link | Length, m | Climb and grade | On a path | Buildings in corridor | Parcels crossed / in corridor | Outside parcels | Land | Fire zone | Hill residents freed | Area residents behind a choke; nesting | Construction | Acquisition |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

// evacuation tables
const S = SIM?.summaries || [];
const cell = (s, m, f = n0) => { const x = s.area_[m]; return `${f(x.centralMedianWithout)} → ${f(x.centralMedianWith)} (${x.better}/${x.worse}/${x.same})`; };
const cellO = (s, m, f = n0) => { const x = s.overall[m]; return `${f(x.centralMedianWithout)} → ${f(x.centralMedianWith)} (${x.better}/${x.worse}/${x.same})`; };
function evacTable(filter) {
  const rows = S.filter(filter).map(s => `| ${s.cand} | ${areaName(s.area)} | ${s.fire} | ${s.delay} | ${n0(s.residents)} | ${cell(s, 'fireFrontHome')} | ${cell(s, 'emberHome')} | ${cell(s, 'vehFireFront')} | ${cell(s, 'vehNoRoute')} | ${cell(s, 'clearP90', mins)} | ${cell(s, 'clearP100', mins)} | ${cellO(s, 'vehiclesNoRoute')} | ${cellO(s, 'fireFrontPeople')} |`);
  return ['| Candidate | Area measured | Fire | Order after, min | Area residents | Area: still home when the fire front arrived | … when embers arrived | Area vehicles on a street when the fire front reached it | Area vehicles cut off (no route at the end) | Area 90% out, min | Area 100% out, min | All vehicles cut off | All people still there when the fire front arrived |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}
const sumBy = (f, m) => S.filter(f).reduce((acc, s) => { const x = s.area_[m]; acc.better += x.better; acc.worse += x.worse; acc.same += x.same; acc.n += x.n; return acc; }, { better: 0, worse: 0, same: 0, n: 0 });
const holdsAll = (f, m, where = 'area_') => S.filter(f).filter(s => s[where][m].holdsEveryPair);

// ---------- findings and the Panoramic Hill benchmark (numbers computed from the files) ----------
const sm = (cand, fire, { variant = 'asIs', mob = 'normal', delay = 10 } = {}) => S.find(x => x.cand === cand && x.fire === fire && x.variant === variant && x.mob === mob && x.delay === delay);
const aff = (c, id, v = 'asIs') => c?.access?.[v]?.areasAffected.find(x => x.id === id);
const pairs = x => `better in ${x.better}, worse in ${x.worse}, no different in ${x.same} of ${x.n} same-seed pairs`;
function findings() {
  if (!S.length) return '## Findings\n\nSimulator runs not yet done: run `node tools/egress-sim.mjs`.\n';
  const pan = ['AC-133-N3', 'AC-147-N2', 'CITY-1'].map(id => byId.get(id)).filter(Boolean);
  const p0 = pan[0], A128 = aff(p0, 'AC-128'), cityC = byId.get('CITY-1');
  const frontChanged = S.reduce((n, s) => n + s.area_.fireFrontHome.better + s.area_.fireFrontHome.worse, 0), frontPairs = S.reduce((n, s) => n + s.area_.fireFrontHome.n, 0);
  const quiet = S.filter(s => s.mob === 'normal' && s.area_.fireFrontHome.centralMedianWithout === 0 && s.area_.vehNoRoute.centralMedianWithout === 0 && s.area_.clearP90.centralMedianChange != null).map(s => Math.abs(s.area_.clearP90.centralMedianChange));
  const panCut = sm('CITY-1', 'panoramic'), panBase = panCut?.area_.vehNoRoute;
  const helps = S.filter(s => s.mob === 'normal' && s.variant === 'asIs' && s.delay === 10 && s.area_.vehNoRoute.worse === 0 && s.area_.vehNoRoute.better >= 5 && s.area_.vehNoRoute.centralMedianWithout > s.area_.vehNoRoute.centralMedianWith && !byId.get(s.cand)?.panoramic);
  const late = S.filter(s => s.mob === 'normal' && s.variant === 'asIs' && s.delay === 20 && s.area_.vehNoRoute.centralMedianWithout > 0);
  return `## Findings

- **One short, steep link would take most of Panoramic Hill out from behind every choke point.** ${pan.map(c => `${c.id} (${c.endpoints[0].street} → ${c.toStreet}, ${n0(c.lengthM)} m, average grade ${n1(c.profile.avgGradePct)}%)`).join(', ')} each leave ${n0(A128?.residentsBehindAfter)} of Panoramic Hill's ${n0(A128?.residentsBehindBefore)} synthetic residents behind a choke (the lower stem by Memorial Stadium) and cut the hill residents behind two or more chokes in series by ${n0(-p0.access.asIs.hillBehindTwoOrMoreChange)}. The City's "2nd Route Out" (CITY-1, the Dwight Way–Dwight Place link the Time Study tested) has the same access effect as the two Smyth Ln links found here. All three are steep: the City line climbs ${n0(cityC?.profile.climbM)} m in ${n0(cityC?.lengthM)} m and would need about ${n0(cityC?.lengthAt15PctM)} m of road to hold a 15% grade. Screening cost ranges: ${pan.map(c => `${c.id} ${range(c.cost.total)}`).join('; ')}.
- **Elsewhere the largest single gains are smaller.** After Panoramic Hill, ${ranked.filter(c => !c.panoramic).slice(0, 4).map(c => `${c.id} (${c.endpoints[0].street} → ${c.toStreet}, ${n0(c.lengthM)} m) frees ${n0(c.access.asIs.hillResidentsFreed)}`).join('; ')} hill residents. ${EC.pruned.length} of ${EC.pruned.length + EC.candidates.length} candidates were pruned, ${EC.pruned.filter(p => p.prunedBecause.some(r => /buildings/.test(r))).length} of them because the corridor would cross three or more buildings; ${noCand.length} of ${EC.selection.deadEndAreas.length} dead-end areas have no surviving link of their own.
- **With the fire on, a second way out changes almost nothing for people who have not yet left home, the Time Study's lesson (E25).** In ${n0(frontPairs)} same-seed pairs, the number of an area's synthetic residents still at home when the fire front arrived changed in ${n0(frontChanged)}: when a household is ready to leave does not depend on the streets, so a new street gets no one out of the house sooner (the few changes are cars waiting for room on a full street, and neighbors riding with them). Where the fire never reaches the area (most tested areas on the 1923 and east-wind fires), the area's 90% clearance time moves by at most ${n1(Math.max(0, ...quiet))} minutes (central median), in either direction.
- **On the Panoramic Hill fire, the vehicles a link cannot help leave home after the fire is already on their street.** Without a link, about ${n0(panBase?.centralMedianWithout)} of Panoramic Hill's roughly ${n0(panCut?.areaVehicles)} vehicles end the run on the road with no route to safety (central median, first order 10 minutes after ignition). In seed 1 at central severity the fire reaches Panoramic Way from minute 39; the cut-off vehicles left home at a median of minute 98, and 95 of them are on Panoramic Way itself. The City concept carries about 40 cars in that run; cut-off vehicles change by ${n0(panBase?.centralMedianWithout - panBase?.centralMedianWith)} (${pairs(panBase)}).
- **Where a link does help: the fire closes the only exit while people are leaving.** ${helps.map(s => `${s.cand} (${byId.get(s.cand)?.endpoints[0].street} → ${byId.get(s.cand)?.toStreet}) on the ${s.fire} fire: the area's vehicles cut off ${n0(s.area_.vehNoRoute.centralMedianWithout)} → ${n0(s.area_.vehNoRoute.centralMedianWith)} (${pairs(s.area_.vehNoRoute)}); all vehicles cut off ${n0(s.overall.vehiclesNoRoute.centralMedianWithout)} → ${n0(s.overall.vehiclesNoRoute.centralMedianWith)}`).join('. ')}. No effect holds in every same-seed pair, because at low severity the fire does not reach the exit; none was ever worse on this measure.
- **A later order (20 minutes after ignition instead of 10) leaves more vehicles cut off; the links' share of them stays small.** ${late.map(s => `${s.cand} on ${s.fire}: ${n0(s.area_.vehNoRoute.centralMedianWithout)} → ${n0(s.area_.vehNoRoute.centralMedianWith)} (${s.area_.vehNoRoute.better}/${s.area_.vehNoRoute.worse}/${s.area_.vehNoRoute.same})`).join('; ')}.
- **Opening the Panoramic exit (County edge 2322) changes neither result.** It moves Panoramic Hill's choke from Stadium Rim Rd to the foot of Panoramic Way, so ${n0(aff(p0, 'AC-128', 'panoramicExit')?.residentsBehindBefore)} residents stay behind one; with a top link added ${n0(aff(p0, 'AC-128', 'panoramicExit')?.residentsBehindAfter)} remain, the same as on the network as it stands. Fire-on results with the exit opened are within a few vehicles of the as-is runs.
`;
}
function panoramicSection() {
  if (!S.length) return '';
  const rows = [];
  for (const id of ['AC-133-N3', 'AC-147-N2', 'CITY-1']) for (const v of ['asIs', 'panoramicExit']) for (const fire of ['panoramic', 'ref1923']) for (const mob of ['normal', 'urgent']) {
    const s = sm(id, fire, { variant: v, mob }); if (!s) continue;
    rows.push(`| ${id} | ${v === 'asIs' ? 'as it stands' : 'exit opened'} | ${fire} | ${mob} | ${cell(s, 'clearP90', mins)} | ${cell(s, 'clearP100', mins)} | ${cell(s, 'vehNoRoute')} | ${cell(s, 'fireFrontHome')} |`);
  }
  const before = (c, v) => aff(c, 'AC-128', v)?.residentsBehindBefore, after = (c, v) => aff(c, 'AC-128', v)?.residentsBehindAfter;
  const accRows = ['AC-128-P1', 'AC-133-N3', 'AC-147-N2', 'AC-147-N1', 'CITY-1'].map(id => byId.get(id)).filter(Boolean).map(c =>
    `| ${c.id} | ${c.endpoints[0].street} → ${c.toStreet} | ${before(c) != null ? `${n0(before(c))} → ${n0(after(c))}` : 'no change'} | ${c.access.panoramicExit ? (before(c, 'panoramicExit') != null ? `${n0(before(c, 'panoramicExit'))} → ${n0(after(c, 'panoramicExit'))}` : 'no change') : '—'} |`);
  const u = (id, f) => sm(id, f, { mob: 'urgent' });
  return `## Panoramic Hill and the Time Study benchmark

The 2025 Evacuation Time Study (§10.4, Tables 10-9 and 10-10, pp. 10-4 and 10-16) tested a second way out of Panoramic Hill connecting Dwight Way to Dwight Place, the same line as the City's "2nd Route Out" layer, and measured when vehicles had left Panoramic Hill (beyond Panoramic Way or Dwight Way). With normal mobilization, two ways out changed neither the 90th nor the 100th percentile in any scenario (R04 90th percentile 1:15–1:30, 100th 3:25–3:40), because the 3.5-hour mobilization sets the time. With urgent mobilization (everyone with a car ready within 30 minutes), the R04 90th percentile fell from 0:30–1:00 to 0:30–0:50, at most 33% (R02 at most 29%); in the fall midweek midday case (S4, the time the simulator uses for both fires below) R04 went from 1:00 to 0:40 and R02 from 1:25 to 1:00. SOURCE_NOTES E25.

The simulator measures the same thing for all of Panoramic Hill (area AC-128): minutes from the first order until 90% and 100% of its evacuating vehicles have left the area. "Urgent" replaces every mobilization curve with an even spread over 30 minutes, for this comparison only (a harness setting, not a simulator plan).

**Access, no fire: Panoramic Hill residents behind any choke point.** Opening edge 2322 alone (AC-128-P1, the County coding fix in SOURCE_NOTES AC3) moves the choke to the foot of Panoramic Way and frees only the residents of the stem it bypasses. Its building and acquisition counts come from the corridor around an existing street and stairway and would not apply to recoding a street that OpenStreetMap already maps as drivable.

| Candidate | Link | Network as it stands | Exit opened (edge 2322 drivable) |
|---|---|---|---|
${accRows.join('\n')}

**Fire on.** Cells as in the evacuation table: central-severity median without → with the link (better / worse / no different, of 15 same-seed pairs). First order 10 minutes after ignition.

| Candidate | Network | Fire | Mobilization | Panoramic Hill 90% out, min | 100% out, min | Vehicles cut off | Still home when the fire front arrived |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

- **Normal mobilization agrees with the Time Study.** On the 1923 fire, where Panoramic Hill is ordered but the fire does not reach it, its 90% time stays near ${n0(sm('CITY-1', 'ref1923')?.area_.clearP90.centralMedianWithout)} minutes with or without a link (the study: 1:30 for R04 S4 either way).
- **Urgent mobilization does not reproduce the study's gain.** Under urgent mobilization the simulator clears Panoramic Hill sooner than the study does (90% out in about ${n0(u('CITY-1', 'ref1923')?.area_.clearP90.centralMedianWithout)} minutes on the 1923 fire, against the study's 1:00 for R04 S4 and 1:25 for R02 S4), so the single exit is not where its queue forms, and no second exit shortens it consistently. The City concept and AC-147-N2 move the 90% time by a minute or two in either direction; AC-133-N3 lengthens it (${n0(u('AC-133-N3', 'ref1923')?.area_.clearP90.centralMedianWithout)} → ${n0(u('AC-133-N3', 'ref1923')?.area_.clearP90.centralMedianWith)} minutes, ${pairs(u('AC-133-N3', 'ref1923')?.area_.clearP90 || { better: 0, worse: 0, same: 0, n: 0 })}); why has not been traced. The study's model queues Panoramic Hill traffic where the simulator's does not; this is a gap in the simulator's agreement with the study (SOURCE_NOTES EG8), not evidence against the study.
- **On the Panoramic Hill fire, the problem is timing, not the number of exits.** With urgent mobilization the synthetic people still home when the fire front arrived fall from about ${n0(sm('CITY-1', 'panoramic')?.area_.fireFrontHome.centralMedianWithout)} to ${n0(u('CITY-1', 'panoramic')?.area_.fireFrontHome.centralMedianWithout)} and vehicles cut off from about ${n0(sm('CITY-1', 'panoramic')?.area_.vehNoRoute.centralMedianWithout)} to ${n0(u('CITY-1', 'panoramic')?.area_.vehNoRoute.centralMedianWithout)}, with or without a link.
`;
}

const out = [];
out.push(`# Second ways out: candidate road connections for access-constrained areas

Built ${M.built} by \`node tools/egress-all.mjs\` (\`tools/egress-candidates.mjs\`, \`tools/egress-sim.mjs\`, this report from \`tools/egress-report.mjs\`). Machine-readable results: \`data/model/egress-candidates.json\` and \`data/model/egress-sim.json\`. Step 2 of the egress and managed-retreat plan in \`HANDOFF.md\`; step 1 is \`docs/access-constraints.md\`.

This is an educational comparison, not a prediction and not an official evacuation plan. It is a screening of where a second way out could go, not engineering, environmental review or legal analysis: every line below is a straight line or an existing path between two points of the street network, and every cost is a range built from public figures and labeled assumptions. Residents are synthetic. Counts only: no parcel identifiers, owners, addresses or imagery are stored.
`);
out.push('<!-- FINDINGS -->');
out.push(`## Ranked candidates

${ranked.length} candidates survived screening for ${EC.selection.deadEndAreas.length} dead-end areas (plus the City concept, below). They are ranked by hill residents no longer behind any choke point when the link is added (access effect, no fire), then by the high end of the cost range. Several candidates for one area are alternatives, not a package. "Area residents behind a choke" counts the residents of the candidate's area who are still behind any choke afterward; nesting is the number of chokes in series. Grades are the ground under a straight line (4 m lidar DEM); a built road would cut, fill or switch back. Corridor: ${M.linkAssumptions.rightOfWayM} m (40 ft, assumption). Parcels: Alameda County only; "no data" in Contra Costa County. Costs in 2024–2025 dollars, screening ranges (see Costs).

${rankedTable(ranked)}
`);
out.push('<!-- EVAC -->');
out.push(`## Evacuation effect, fire on

\`tools/egress-sim.mjs\` adds each tested link to the network at run time (two-way local street, 20 ft, no parking, no homes on it; \`tools/egress-link.mjs\`) and runs the simulator for each fire that orders or reaches the area, at low, central and high severity × seeds 1–5, the same seed with and without the link, with the first order 10 minutes after ignition (the simulator default) and 20 minutes (a later order). The area measured is the largest chosen area whose residents the link changes; for links into Panoramic Hill that is all of Panoramic Hill (AC-128). Each cell gives the central-severity median without → with the link, then in brackets the number of the ${SIM ? SIM.meta.severities.length * SIM.meta.seeds.length : 15} same-seed pairs where the link made the measure better / worse / no different. Lower is better for every measure; a run in which not all of the area's vehicles got out within the simulated period has no 100% time and counts as worse than any time. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count. ${SIM ? `${SIM.runs.length.toLocaleString('en-US')} runs.` : ''}

${evacTable(s => s.variant === 'asIs' && s.mob === 'normal')}
`);
out.push('<!-- PANORAMIC -->');
// pruned
const prunedRows = EC.pruned.map(p => `| ${p.id} | ${areaName(p.area)} | ${typeName[p.type]} | ${p.endpoints[0].street} → ${p.toStreet} | ${n0(p.lengthM)} | ${n1(p.profile.avgGradePct)}% | ${p.buildingsInCorridor} | ${p.prunedBecause.join('; ')} |`);
const noCand = EC.selection.deadEndAreas.filter(a => !EC.candidates.some(c => c.area === a.id || c.alsoFor?.includes(a.id)));
// the surviving link that leaves the fewest of an area's residents behind a choke (found for another area)
const bestOther = a => { let best = null; for (const c of EC.candidates) { const x = aff(c, a.id); if (x && (!best || x.residentsBehindAfter < best.x.residentsBehindAfter)) best = { c, x }; } return best; };
out.push(`## What was pruned, and areas left without a candidate

${EC.pruned.length} of ${EC.pruned.length + EC.candidates.length} candidates were pruned as physically implausible under two model rules: an average grade over ${RU.pruneAvgGradePct}% (a road held to 15% would need at least twice the straight length), or ${RU.pruneBuildings} or more buildings in the ${M.linkAssumptions.rightOfWayM} m corridor. ${EC.pruned.filter(p => p.prunedBecause.some(r => /buildings/.test(r))).length} failed the building rule and ${EC.pruned.filter(p => p.prunedBecause.some(r => /grade/.test(r))).length} the grade rule (some both). The City concept would fail the grade rule (${city?.wouldBePrunedBecause?.join('; ') || '—'}) and is kept as the benchmark.

${noCand.length} of the ${EC.selection.deadEndAreas.length} dead-end areas have no surviving candidate of their own: ${noCand.map(a => `${a.id} (${a.streets.slice(0, 2).join(', ')}; ${n0(a.residents)} residents${a.pruned.length ? `, ${a.pruned.length} pruned` : ', none within 250 m that saves driving'}${(b => b ? `; ${b.c.id} leaves ${n0(b.x.residentsBehindAfter)} behind a choke` : '')(bestOther(a))})`).join('; ')}.

${EC.selection.oneWayLeftOut.length} areas among the top ranks are behind a one-way choke only and were left out, because two-way operation of the entrance in an emergency opens them: ${EC.selection.oneWayLeftOut.map(a => `${a.id} (${a.streets.join('/')}, ${n0(a.residents)})`).join('; ')}.

| Candidate | Area | Type | Link | Length, m | Average grade | Buildings in corridor | Pruned because |
|---|---|---|---|---|---|---|---|
${prunedRows.join('\n')}
`);
out.push(`## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Areas (derived).** From \`data/model/access-constraints.json\`: areas with at least one hill resident, the top 40 by residents and the top 40 by constraint score (${EC.selection.areasChosen.length} after removing duplicates). One-way areas are left out; ${EC.selection.deadEndAreas.filter(a => EC.selection.areasChosen.includes(a.id)).length} dead-end areas remain${EC.selection.deadEndAreas.some(a => !EC.selection.areasChosen.includes(a.id)) ? `, plus ${EC.selection.deadEndAreas.filter(a => !EC.selection.areasChosen.includes(a.id)).map(a => `${a.id} (${a.streets.join(', ')})`).join(', ')}, where the City concept starts` : ''}.${EC.selection.deadEndAreas.some(a => a.allocationWarning) ? ` Allocation warnings: ${EC.selection.deadEndAreas.filter(a => a.allocationWarning).map(a => a.id).join(', ')}.` : ' None of them carries an allocation warning (Albany Hill, AC-316, is not a hill area by the fire-zone rule).'}
- **New road (model rule).** A straight segment from a node inside the area to a drivable node outside it, up to ${RU.maxNewM} m, where driving between the two points now takes at least ${RU.minDetourM} m and ${RU.detourRatio} times the line (the access tool's "nearest other street" rule). For each target street the shortest link after a penalty for average grade above 10% is kept, preferring targets behind no choke, ${RU.perArea} streets per area. Links join existing network nodes (junctions and street ends), so a street with no node near the area is reached at its nearest junction.
- **Path upgrade (model rule).** An existing path, stairway or County no-vehicle segment in the network, or a chain of OpenStreetMap footways, paths, steps or tracks (up to ${RU.maxPathM} m, ends within ${RU.snapM} m of network nodes), widened to a road. **Open barrier**: a diverter, bollard or gate closed to residents' cars, opened.
- **City concept (sourced geometry).** ${M.sources.city.what}, retrieved ${M.sources.city.retrieved}. Its ends were snapped to the nearest network nodes (${city ? city.snapM.join(' m and ') : '—'} m away).
- **Grade (derived).** Ground elevation every 4 m along the line from the 4 m lidar DEM, as the network builder samples streets: average = end-to-end climb / length; for 25 m windows along the line, the 90th percentile (the builder's gradeMax for streets) and the worst. Flags use the larger of the average and the 90th percentile, because the worst window over open ground is often a terrace, wall or cut. Flags at 15% (a common local fire-access limit; ${M.sources.grade15.what}) and 20% (${M.sources.grade20.what}). "Length at 15%" is the length a road would need to hold 15% over the same climb.
- **On a path (derived).** Share of the line within ${RU.pathNearM} m of an OpenStreetMap footway, path, steps or track, or a network path segment.
- **Buildings (derived).** OpenStreetMap building footprints touching a ${M.linkAssumptions.rightOfWayM} m corridor centered on the line (corridor width: assumption, a 40 ft right of way).
- **Parcels (derived).** Alameda County parcel polygons, geometry only, fetched per candidate and discarded: parcels the centerline crosses for ${RU.crossM} m or more, parcels touching the corridor, and the share of the centerline outside every parcel (public right of way or unparceled land). Contra Costa County candidates (Kensington) have no parcel count.
- **Land (derived).** Share of the line inside OpenStreetMap park, nature-reserve or protected-area polygons, UC Berkeley, LBNL or East Bay Regional Park District land, from name, operator and owner tags.
- **Fire zone (sourced).** City Fire Zones at the midpoint; outside Berkeley the simulator's proxy (90 m elevation or higher counts as hill).
- **Access effect (derived).** \`tools/access-constraints.mjs --links\` reruns the choke-point analysis with the link added as a two-way local street with no residents. Freed residents = residents behind any choke before minus after, for the whole model area. Panoramic Hill links are also run with the Panoramic exit opened (below).
- **Evacuation effect (derived from synthetic runs).** See above. Up to two candidates per area among the top-ranked, where one of the three fires (eastWind, ref1923, panoramic) orders, warns or sends embers into the area, plus the City concept.
`);
out.push(`## Costs (screening estimate)

These are screening ranges built from public figures and labeled assumptions, not an engineer's estimate, an appraisal, environmental review or legal analysis. They leave out engineering, environmental review and mitigation, relocation benefits, legal costs, utilities and time.

- **Construction (assumption from public figures).** Low: $${n0(M.cost.newRoadPerM[0])} per meter, ${M.sources.fdot.what} (${M.sources.fdot.url}, retrieved ${M.sources.fdot.retrieved}). High: ${M.cost.hillsideFactor} times that, $${n0(M.cost.newRoadPerM[1])} per meter, for retaining walls, grading and drainage on a hillside (assumption), applied to the length a 15% road would need. Fire roads and tracks start from $${n0(M.cost.gravelUpgradePerM)} per meter: ${M.sources.cambria.what} (${M.sources.cambria.url}).
- **Acquisition (assumption from public figures).** Each building in the corridor is taken whole at the median value of owner-occupied homes in the block group, the median ± its margin of error (${M.sources.acs.what}). Each other parcel touching the corridor is a partial take at ${M.cost.partialTakeShare.map(v => `${v * 100}%`).join('–')} of that value (assumption, no source). The ACS top-codes medians at $2,000,001, so in the most expensive hill block groups the high end is low. Where the block group has no median (campus or park land), the block group at the area end is used.
- **Displacement (assumption).** Buildings removed × ${EC.candidates[0] ? '2.37' : '—'} persons per household, as if each building were one home.
- Opening a barrier is not priced; it is small next to a road.
`);
out.push(`## Limits

- Straight lines between network nodes, not alignments. A real road would follow the contours, need retaining walls and turning radii, and cross different parcels and buildings than the straight corridor. A link from the middle of a long block is not considered, because the network has nodes only at junctions and ends.
- Building footprints come from OpenStreetMap, which misses some sheds and garages and may lag new construction; parcel polygons are the County's current layer; neither was checked on the ground or on the City's orthophotos.
- Land flags come from OpenStreetMap tags, not ownership records; easements, utility corridors and the Hayward Fault zone are not checked.
- The simulator's fires are illustrative and its traffic model is uncalibrated for weekday peaks (\`HANDOFF.md\`, calibration). The evacuation effect is a comparison between runs, not an estimate of real outcomes.
- The evacuation runs use the network as it stands, where Panoramic Hill drives out over Rim Rd and Stadium Rim Rd because the County file codes the short link from Panoramic Way to Prospect St as no-vehicle (SOURCE_NOTES AC3). The "Panoramic exit opened" variant shows how the Panoramic Hill results change once that is fixed; \`node tools/egress-all.mjs\` reruns everything after the fix.
`);
out.push(`## Sources

${Object.values(M.sources).map(s => `- ${s.what}. ${s.url}. Retrieved ${s.retrieved}.`).join('\n')}
- 2025 Evacuation Time Study (KLD Engineering, 2025-06-23), §10.4 and Tables 10-9 and 10-10 (pp. 10-4, 10-16): second egress from Panoramic Hill. SOURCE_NOTES E25.
`);
let md = out.join('\n');
md = md.replace('<!-- FINDINGS -->', findings()).replace('<!-- EVAC -->', '').replace('<!-- PANORAMIC -->', panoramicSection());
fs.writeFileSync(path.join(R, 'docs/egress-candidates.md'), md);
console.log('wrote docs/egress-candidates.md');
