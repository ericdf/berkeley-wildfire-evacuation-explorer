// Writes docs/managed-retreat.md from data/model/retreat.json (tools/retreat-sim.mjs).
//   node tools/retreat-sim.mjs --report-only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const n0 = x => x == null ? '—' : (Math.round(x) || 0).toLocaleString('en-US');
const n1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US');
const pc = x => x == null ? '—' : `${Math.round(x * 100)}%`;
const usd = x => x == null ? '—' : x >= 1e6 ? `$${(x / 1e6).toFixed(x >= 1e8 ? 0 : 1)}M` : `$${Math.round(x / 1e3)}k`;
const range = ([a, b]) => `${usd(a)}–${usd(b)}`;
const tm = x => x == null ? 'not all out' : n0(x);
const LABEL = { expectedHouseholds: 'Expected households', front: 'Front', ember: 'Ember', cut: 'Cut', engine: 'Engine', nest: 'Nest', choke: 'Choke load', score: 'Score' };
const FIRE_NAME = { ref1923: '1923 repeat', eastWind: 'east wind, night', eastWindDay: 'east wind, weekday', panoramic: 'Panoramic Hill' };
const cell = (s, f = n0) => s ? `${f(s.centralWithout)} → ${f(s.centralWith)} (${s.better}/${s.worse}/${s.same})` : '—';
const tcell = s => cell(s, tm);

export function writeReport(D) {
  const L = [], P = (...a) => L.push(...a);
  const C = Object.fromEntries(D.cases.map(c => [c.id, c]));
  const S = (id, f) => D.summaries.find(s => s.case === id && s.fire === f);
  const E = Object.fromEntries(D.engine.map(e => [e.case, e]));
  const nRuns = D.meta.fires.length * D.meta.severities.length * D.meta.seeds.length;

  P('# Managed retreat: which blocks a voluntary buyout would target, and what it would change',
    '',
    `Built ${D.meta.built} by \`node tools/retreat-sim.mjs\` (this report from \`tools/retreat-report.mjs\`, costs from \`tools/retreat-costs.mjs\`). Machine-readable results: \`data/model/retreat.json\`. Step 3 of the egress and managed-retreat plan in \`HANDOFF.md\`; step 1 is \`docs/access-constraints.md\`, step 2 (second ways out) is under review in PR #15.`,
    '',
    'This is an educational comparison, not a prediction, not an official evacuation plan and not a buyout proposal. The costs are a screening estimate, not an appraisal, policy or legal analysis. Households and residents are synthetic: the simulator spreads each Genasys zone\'s population over its streets, so a "block" holds an expected number of households, not real homes. The analysis works at street-segment level with street names only; no parcels, owners or addresses are used. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count.',
    '');

  // ---------- findings ----------
  P('## Findings', '');
  const top = D.ranking.slice(0, 15), first = D.ranking.find(b => b.area?.id !== 'AC-155');
  const topAreas = {}; for (const b of top) { const k = b.area ? `${b.area.id} (behind the ${b.area.street} choke)` : 'no dead-end choke'; topAreas[k] = (topAreas[k] || 0) + 1; }
  P(`- **Panoramic Hill fills the top of the ranking.** ${Object.entries(topAreas).map(([k, n]) => `${n} of the top 15 blocks are in ${k}`).join('; ')}; the first block elsewhere is ${first.street} (${first.ends.join(' – ')}, ${first.zone}) at rank ${first.rank}. Panoramic Hill blocks score on every component at once: up to 4 dead-end chokes in series, no engine within 5 minutes in ${pc(top[0].components.engine)} of runs (parked cars on the lowest block of Panoramic Way, SOURCE_NOTES ER3), a choke that needs ${n0(top[0].area.chokeHours * 60)} minutes of capacity for the cars behind it, and households still home when the fire front arrived in up to ${pc(Math.max(...top.map(b => b.components.front)))} of runs (the Panoramic Hill fire is the only one of the four that reaches them). ${first.street} has more fire exposure (${pc(first.components.front)} of runs) but one choke and engine access. The score is a model rule; ranked by fire exposure alone, the order changes (table below).`);
  const panS = D.summaries.filter(s => s.fire === 'panoramic');
  const nbPairs = D.summaries.filter(s => s.neighborPeople > 0);
  const nbFrontNever = nbPairs.every(s => s.neighbors.frontHome.better === 0 && s.neighbors.frontHome.worse === 0);
  const nbCutEvery = nbPairs.filter(s => s.neighbors.vehNoRoute.holdsEveryPair).length, nbClearEvery = nbPairs.filter(s => s.neighbors.clearP90.holdsEveryPair).length;
  const elseMax = Math.max(...panS.map(s => Math.max(Math.abs(s.decomp.frontHome.elsewhereRange[0]), Math.abs(s.decomp.frontHome.elsewhereRange[1]))));
  P(`- **Almost all of a buyout's benefit is benefit 1: the people bought out are no longer there.** On the Panoramic Hill fire, the drop in people still home when the fire front arrived equals the number of bought-out residents still home in the run without the buyout, in every case (central median: ${panS.map(s => `${C[s.case].label.split(" (")[0]}: ${n0(-s.decomp.frontHome.central.total)}`).join('; ')}); everyone else changes by at most ${n0(elseMax)} ${Math.round(elseMax) === 1 ? "person" : "people"} in any pair. The neighbors who stay behind the same choke are still home at the fire front in exactly the same numbers in ${nbFrontNever ? 'every' : 'almost every'} pair, because when a household is ready to leave does not depend on the streets. Benefit 2 is small and not consistent: the neighbors' cars cut off fall in every pair in ${nbCutEvery} of ${nbPairs.length} case-fire combinations, and their 90% out time falls in every pair in ${nbClearEvery} of ${nbPairs.length}.`);
  const all = C.panoramicAll, up = C.panoramicUpper, sa = S('panoramicAll', 'panoramic'), su = S('panoramicUpper', 'panoramic');
  if (sa && su) P(`- **Panoramic Hill.** Buying out everything behind the foot of Panoramic Way (${n0(all.expectedHouseholds)} households, ${n0(all.expectedResidents)} residents) removes the ${n0(sa.removedBase.frontHome.central)} people the run without it left at home when the fire front arrived (central median; ${n0(sa.removedBase.frontHome.min)}–${n0(sa.removedBase.frontHome.max)} over all severities and seeds) and lowers cars cut off in the whole model area from ${n0(sa.overall.vehNoRoute.centralWithout)} to ${n0(sa.overall.vehNoRoute.centralWith)}, better in ${sa.overall.vehNoRoute.better} of ${sa.overall.vehNoRoute.n} pairs. Screening cost ${range(D.costs.panoramicAll.total)}. The upper streets alone (${n0(up.expectedHouseholds)} households behind the second choke) remove ${n0(su.removedBase.frontHome.central)} of those ${n0(sa.removedBase.frontHome.central)} for ${range(D.costs.panoramicUpper.total)}; the ${n0(su.neighborPeople)} residents left below them see no change in people still home at the fire front and ${n0(su.neighbors.vehNoRoute.centralWithout)} → ${n0(su.neighbors.vehNoRoute.centralWith)} cars cut off.`);
  const t5 = S('top500', 'ref1923'), t5e = S('top500', 'eastWind');
  if (t5 && t5e) P(`- **Only the largest top-ranked case reaches beyond Panoramic Hill**, onto ${C.top500.streets.filter(x => !/Panoramic|Dwight|Arden|Orchard|Mosswood/.test(x)).join(', ')}. It is also the only case with effects in every pair on the 1923 fire (people still home at the fire front ${cell(t5.overall.frontHome)}) and the east-wind fire at night (still there, home or road, ${cell(t5e.overall.frontPeople)}), again from the households bought out.`);
  const ef = D.engineFoot, ea = E.panoramicAll;
  if (ef && ea) P(`- **Engine reach turns on one block.** Buying out Panoramic Hill removes most of the hill residents no engine reaches within 5 minutes (${n0(ea.keepParking.hillBeyond5.without)} → ${n0(ea.keepParking.hillBeyond5.with)}, median of 10 seed and day-or-night parking draws), because they are the people bought out. Buying out only the lowest block of Panoramic Way (${n1(ef.expectedHouseholds)} households) changes nothing for the residents above it while its parked cars stay (${n0(ef.keepParking.neighborsBeyond5.without)} → ${n0(ef.keepParking.neighborsBeyond5.with)}); with its parked cars gone too, they drop to ${n0(ef.clearParking.neighborsBeyond5.with)} (better in ${ef.clearParking.neighborsBeyond5.better} of ${ef.clearParking.neighborsBeyond5.n}). A parking rule on that block does the same without a buyout (SOURCE_NOTES ER2–ER3).`);
  if (D.step2) { const k = D.step2.candidates.find(x => x.id === 'AC-160-N3'), c1 = D.step2.candidates.find(x => x.id === 'CITY-1');
    if (k && k.fires.panoramic) P(`- **A second way out costs a hundredth as much or less and helps the people who stay; a buyout removes the people.** Step 2's top-ranked link (provisional), ${k.id} ${k.link}, frees ${n0(k.hillResidentsFreed)} hill residents from behind every choke for ${range(k.cost)} and lowers Panoramic Hill's cars cut off ${n0(k.fires.panoramic.areaVehNoRoute.without)} → ${n0(k.fires.panoramic.areaVehNoRoute.with)}${c1?.fires?.panoramic ? ` (the City's Dwight Way–Dwight Place concept: ${n0(c1.fires.panoramic.areaVehNoRoute.with)})` : ''}, but leaves the ${n0(k.fires.panoramic.areaFrontHome.without)} people still home at the fire front unchanged. Buying out the hill removes those people at ${range(D.costs.panoramicAll.total)} and ${n0(D.costs.panoramicAll.households)} homes.`); }
  P('', 'Cells read: central-severity median without → with the buyout, then (better / worse / no different) over all 15 same-seed pairs at low, central and high severity. Lower is better for every measure. All counts are synthetic people or cars in an illustrative fire, not predictions.', '');

  // ---------- method ----------
  P('## Method', '',
    'Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.', '',
    `- **Block (${D.meta.blockRule.split(':')[0]}).** ${D.meta.blockRule.split(': ').slice(1).join(': ')} A block is labeled by its street and the streets at its two ends. ${n0(D.totals.hillBlocks)} hill blocks hold ${n0(D.totals.hillHouseholds)} expected households; ${n0(D.totals.ranked)} have at least one and are ranked (the rest hold ${n0(D.totals.unrankedHouseholds)} households in all).`,
    `- **Fire runs (synthetic).** Every scenario in \`js/scenarios.js\` (${D.meta.fires.map(f => FIRE_NAME[f] || f).join("; ")}), low, central and high severity, seeds ${D.meta.seeds[0]}–${D.meta.seeds.at(-1)}: ${nRuns} runs, ${D.meta.plan}. The two east-wind scenarios share one fire and differ in time of day.`);
  for (const [k, v] of Object.entries(D.meta.provenance)) P(`- **${LABEL[k] || k}** (${v.split(':')[0]}): ${v.split(': ').slice(1).join(': ')}.`);
  P(`- **Buyout (model rule for this harness).** \`world.retreat\` in \`js/sim.js\`: households on bought-out blocks are placed and take every random draw as before, then make no trip, give no ride and are not counted. Every other household and every non-resident car is the same draw with and without the buyout (\`node tests/retreat-draws.mjs\`), so each pair differs only by the bought-out households. Parked cars stay as drawn (they do not depend on households in the simulator); a sensitivity case removes them from bought-out blocks (Engine reach, below). Normal runs are unchanged: \`tests/calibration.mjs\` and \`tests/plan-draws.mjs\` print what they printed before.`,
    '- **Groups.** *Bought out*: households on the case\'s blocks. *Neighbors*: the other households behind the same outermost dead-end choke(s), the ones who share the way out. *Same zones*: the other households of the Genasys zones that hold bought-out blocks. *Area*: bought-out blocks plus neighbors; a car has left the area when it is on a street outside it or has reached safety. 90% and 100% out are minutes from the first order until that share of the group\'s evacuating cars (resident and non-resident, ordered or warned, not shadow) has left the area; a run that never gets there counts as slower than any that does. The region\'s clearance is the simulator\'s Time Study measure (cars starting in Order zones until they leave the order area). Cars cut off and cars on a street when the fire front reached it count residents\' cars only.',
    '- **Two benefits, separated.** (1) Residents bought out are no longer exposed, by definition: their exposure is reported from the run without the buyout. (2) Neighbors behind the same choke may get out faster because fewer cars share the street. The overall change in each pair is split into bought out + neighbors + elsewhere.',
    '');

  // ---------- ranking ----------
  P('## Ranked blocks (top 40)', '',
    `Components: shares of the ${nRuns} runs (front, ember, cut, engine), dead-end chokes in series (nest), and choke load (hours of choke capacity the cars behind the outermost choke need, capped at 1). Households are expected values (synthetic). Area: the outermost dead-end access area and its entrance street, with the entrance\'s clear width under nominal status-quo parking. "Between" names the streets at the two ends of the segment; "—" is a break between two segments of the same street in the County or OpenStreetMap file, with no cross street.`, '',
    '| # | Street | Between | Zone | Fire zone | Households | Front | Ember | Cut | Engine >5 min | Nest | Choke load | Area (entrance, clear width) | Score |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const b of D.ranking.slice(0, 40)) {
    const c = b.components;
    P(`| ${b.rank} | ${b.street} | ${b.ends.join(' – ')} | ${b.zone} | ${b.fireZoneSrc.startsWith('proxy') ? 'hill (≥90 m)' : `FZ${b.fireZone}`} | ${n1(b.expectedHouseholds)} | ${pc(c.front)} | ${pc(c.ember)} | ${pc(c.cut)} | ${pc(c.engine)} | ${c.nest} | ${n1(c.choke)} | ${b.area ? `${b.area.id} (${b.area.street}, ${b.area.clearWidthFt == null ? '—' : n0(b.area.clearWidthFt)} ft)` : '—'} | ${n1(b.score)} |`);
  }
  P('');
  const W = D.meta.weights, expo = b => W.front * b.components.front + W.ember * b.components.ember + W.cut * b.components.cut;
  P('**Ranked by fire exposure alone** (front, ember and cut with the same weights, static factors left out), the top 15 are:', '',
    '| # | Street | Between | Zone | Households | Front | Ember | Cut | Exposure score | Rank by full score |', '|---|---|---|---|---|---|---|---|---|---|');
  [...D.ranking].sort((a, b) => expo(b) - expo(a) || b.expectedHouseholds - a.expectedHouseholds).slice(0, 15).forEach((b, i) =>
    P(`| ${i + 1} | ${b.street} | ${b.ends.join(' – ')} | ${b.zone} | ${n1(b.expectedHouseholds)} | ${pc(b.components.front)} | ${pc(b.components.ember)} | ${pc(b.components.cut)} | ${n1(expo(b))} | ${b.rank} |`));
  P('');

  // ---------- cases ----------
  P('## Buyout cases', '',
    '| Case | Blocks | Households | Residents | Streets | Behind a dead-end choke (residents) | Outermost areas: residents before → after | Fires that threaten it |',
    '|---|---|---|---|---|---|---|---|');
  for (const c of D.cases) P(`| ${c.label} | ${c.blocks} | ${n0(c.expectedHouseholds)} | ${n0(c.expectedResidents)} | ${c.streets.slice(0, 8).join(', ')}${c.streets.length > 8 ? ` +${c.streets.length - 8}` : ''} | ${n0(c.access.residentsBehindDeadEndRemoved)} | ${c.access.outerAreasAfter.map(a => `${a.id} ${a.street}: ${n0(a.residentsBefore)} → ${n0(a.residentsAfter)}`).join('; ') || '—'} | ${c.threat.map(f => FIRE_NAME[f]).join(', ')} |`);
  P('', 'A fire threatens a case if, in any of its runs, a bought-out block\'s zone was ordered or warned or embers reached it. Bought-out households vary by seed around the expected count (the simulator draws whole households); the runs below removed the households the seed placed there.', '');

  // ---------- results ----------
  P('## Evacuation effect, fire on', '',
    'Cells: central-severity median without → with the buyout, then (better / worse / no different) over all same-seed pairs. "Every pair" lists the measures better in every pair.', '');
  P('### Benefit 1: the bought-out residents (run without the buyout)', '',
    '| Case | Fire | Bought-out residents | Still home when the fire front arrived | … when embers arrived | Their cars on a street when the fire front reached it | Their cars cut off at the end |',
    '|---|---|---|---|---|---|---|');
  for (const s of D.summaries) { const r = s.removedBase; P(`| ${C[s.case].label} | ${FIRE_NAME[s.fire]} | ${n0(r.people.central)} | ${n0(r.frontHome.central)} (${n0(r.frontHome.min)}–${n0(r.frontHome.max)}) | ${n0(r.emberHome.central)} (${n0(r.emberHome.min)}–${n0(r.emberHome.max)}) | ${n0(r.vehFireFront.central)} | ${n0(r.vehNoRoute.central)} |`); }
  P('', 'Central median, then the range over all severities and seeds. With the buyout these are zero by definition.', '');
  P('### Benefit 2: the neighbors behind the same choke', '',
    '| Case | Fire | Neighbors | Still home when the fire front arrived | … when embers arrived | Cars on a street when the fire front reached it | Cars cut off at the end | 90% out, min | 100% out, min | Area (all its cars) 90% out |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const s of D.summaries) { const g = s.neighbors; if (!s.neighborPeople) { P(`| ${C[s.case].label} | ${FIRE_NAME[s.fire]} | 0 | no one is left behind the choke | | | | | | |`); continue; } P(`| ${C[s.case].label} | ${FIRE_NAME[s.fire]} | ${n0(s.neighborPeople)} | ${cell(g.frontHome)} | ${cell(g.emberHome)} | ${cell(g.vehFireFront)} | ${cell(g.vehNoRoute)} | ${tcell(g.clearP90)} | ${tcell(g.clearP100)} | ${tcell(s.area.clearP90)} |`); }
  P('');
  P('### Whole model area', '',
    '| Case | Fire | People still there when the fire front arrived (home or road) | … at home | … when embers arrived | Cars cut off at the end | Region 90% out, min | Region 100% out, min | Same zones: still home at the fire front |',
    '|---|---|---|---|---|---|---|---|---|');
  for (const s of D.summaries) { const o = s.overall; P(`| ${C[s.case].label} | ${FIRE_NAME[s.fire]} | ${cell(o.frontPeople)} | ${cell(o.frontHome)} | ${cell(o.emberPeople)} | ${cell(o.vehNoRoute)} | ${tcell(o.clearP90)} | ${tcell(o.clearP100)} | ${cell(s.zone.frontHome)} |`); }
  P('');
  P('### Where the change comes from', '',
    'Median over same-seed pairs of the change in people still home when the fire front arrived and in cars cut off, split into the bought-out residents (benefit 1), the neighbors (benefit 2) and everyone else. Central severity; "elsewhere" range over all pairs.', '',
    '| Case | Fire | Still home at the fire front: total = bought out + neighbors + elsewhere | Elsewhere, range | Cars cut off: total = bought out + neighbors + elsewhere | Elsewhere, range |',
    '|---|---|---|---|---|---|');
  for (const s of D.summaries) { const a = s.decomp.frontHome, b = s.decomp.vehNoRoute; const f = d => `${n0(d.central.total)} = ${n0(d.central.boughtOut)} + ${n0(d.central.neighbors)} + ${n0(d.central.elsewhere)}`; P(`| ${C[s.case].label} | ${FIRE_NAME[s.fire]} | ${f(a)} | ${n0(a.elsewhereRange[0])} to ${n0(a.elsewhereRange[1])} | ${f(b)} | ${n0(b.elsewhereRange[0])} to ${n0(b.elsewhereRange[1])} |`); }
  P('');
  P('### Effects that hold in every same-seed pair', '');
  for (const s of D.summaries) {
    const every = [], never = [];
    for (const [grp, obj] of [['overall', s.overall], ['neighbors', s.neighbors], ['area', s.area], ['same zones', s.zone]])
      for (const [m, v] of Object.entries(obj)) { if (v.holdsEveryPair) every.push(`${grp} ${m}`); else if (v.neverWorse && v.better > 0) never.push(`${grp} ${m} (${v.better} of ${v.n})`); }
    P(`- ${C[s.case].label}, ${FIRE_NAME[s.fire]} (${s.runs} pairs): better in every pair: ${every.join(', ') || 'none'}. Never worse, better in some: ${never.join(', ') || 'none'}.`);
  }
  P('', 'Measure names: frontPeople and frontHome, people still there (home or road) and at home when the fire front arrived; emberPeople, when embers arrived; vehNoRoute, cars cut off at the end; vehFireFront, cars on a street when the fire front reached it; clearP90 and clearP100, 90% and 100% out.', '');

  // ---------- engine ----------
  P('## Engine reach', '',
    'Synthetic residents of Berkeley\'s Fire Zones 2–3 whose street no engine reaches within the City\'s 5-minute standard at ignition (js/sim.js engine reach), seeds 1–5, weekday (S4) and night (S6) parking: median of 10 without → with (better / worse of 10). "Parked cars kept" is the main rule; "cleared" also removes the parked cars on bought-out blocks (model rule, sensitivity).', '',
    '| Case | Bought-out residents beyond 5 min | Neighbors beyond 5 min, parked cars kept | … cleared | All hill residents beyond 5 min, kept | … cleared |',
    '|---|---|---|---|---|---|');
  const ec = s => `${n0(s.without)} → ${n0(s.with)} (${s.better}/${s.worse})`;
  for (const c of D.cases) { const e = E[c.id]; P(`| ${c.label} | ${n0(e.keepParking.boughtOutBeyond5Without)} | ${ec(e.keepParking.neighborsBeyond5)} | ${ec(e.clearParking.neighborsBeyond5)} | ${ec(e.keepParking.hillBeyond5)} | ${ec(e.clearParking.hillBeyond5)} |`); }
  if (D.engineFoot) { const e = D.engineFoot; P(`| Sensitivity: the lowest block of Panoramic Way only (${e.street}, ${n1(e.expectedHouseholds)} households; not run with the fire) | ${n0(e.keepParking.boughtOutBeyond5Without)} | ${ec(e.keepParking.neighborsBeyond5)} | ${ec(e.clearParking.neighborsBeyond5)} | ${ec(e.keepParking.hillBeyond5)} | ${ec(e.clearParking.hillBeyond5)} |`); }
  P('');

  // ---------- costs ----------
  P('## Costs and losses (screening estimate)', '',
    'A screening estimate from public figures and labeled assumptions, not an appraisal, policy or legal analysis, and not a statement of what any owner would accept. One synthetic household is counted as one housing unit. Housing units lost equal households bought out; residents displaced are households × 2.37 (synthetic). Rounded to $0.1M.', '',
    '| Case | Housing units lost | Residents displaced | Acquisition | Relocation | Demolition and restoration | Total | Per household | Notes |',
    '|---|---|---|---|---|---|---|---|---|');
  for (const c of D.cases) { const k = D.costs[c.id]; const notes = [k.householdsTopCoded ? `${n0(k.householdsTopCoded)} households in block groups whose median is top-coded at $2,000,001 (high end low)` : null, k.householdsNoMedian ? `${n0(k.householdsNoMedian)} in block groups with no median (case average used)` : null].filter(Boolean).join('; ') || '—';
    P(`| ${c.label} | ${n0(k.households)} | ${n0(k.residents)} | ${range(k.acquisition)} | ${range(k.relocation)} | ${range(k.demolition)} | ${range(k.total)} | ${range(k.perHousehold)} | ${notes} |`); }
  if (D.costs.footBlock) { const k = D.costs.footBlock; P(`| Sensitivity: the lowest block of Panoramic Way only | ${n0(k.households)} | ${n0(k.residents)} | ${range(k.acquisition)} | ${range(k.relocation)} | ${range(k.demolition)} | ${range(k.total)} | ${range(k.perHousehold)} | — |`); }
  const rt = D.costSources.rates;
  P('', `- **Acquisition (sourced statistic, assumption in its use).** Each household at the ACS median value of owner-occupied homes in its block group, low = median − margin of error, high = median + margin of error. A buyout pays the appraised value of each property, which the block-group median does not give.`,
    `- **Relocation (sourced figures, assumption in their use).** $${rt.relocation[0].toLocaleString('en-US')}–$${rt.relocation[1].toLocaleString('en-US')} per household. Owner-occupants who sell voluntarily are not displaced persons under the Uniform Relocation Act (49 CFR 24.101(b)), so the low end assumes every household is one and receives nothing. The high end assumes a program pays every household the URA homeowner replacement housing payment maximum ($41,200, 49 CFR 24.401(b)) plus an 8-room fixed move ($2,690). Tenants who must move are covered by the Act; their entitlement, up to $9,570 rental assistance (49 CFR 24.402(b)) plus a move ($${rt.tenantHigh.toLocaleString('en-US')} at most), lies inside the range. The split between owners and renters (ACS B25003) could not be retrieved, so the range is wide.`,
    `- **Demolition and site restoration (sourced low, assumed high).** $${rt.demolition[0].toLocaleString('en-US')}–$${rt.demolition[1].toLocaleString('en-US')} per household: the Delaware County (PA) program's $20,000–$50,000 range, high end doubled for Bay Area costs and hillside access.`,
    '- Left out: closing, appraisal and legal costs, program administration, lost property-tax revenue, maintenance of the open land, and any effect on the value of neighboring homes.', '');

  // ---------- step 2 comparison ----------
  P('## Retreat or a second way out', '');
  if (!D.step2) P('Step 2 results were not available when this report was built.', '');
  else {
    P(`Step 2 figures are **provisional**: ${D.step2.source}. They come from a different harness (step 2 counts every car starting in the area, these tables count residents\' cars) and the same fires, severities and seeds; the Panoramic Hill fire, first order 10 minutes after ignition, central-severity medians.`, '',
      '| Option | Kind | Residents protected or freed | Effect on the residents who stay (Panoramic Hill fire) | Homes lost | Screening cost |',
      '|---|---|---|---|---|---|');
    const pan = id => S(id, 'panoramic');
    for (const id of ['panoramicAll', 'panoramicUpper']) {
      const c = C[id], s = pan(id); if (!c || !s) continue;
      const after = c.access.outerAreasAfter.find(a => a.id === 'AC-155');
      P(`| ${c.label} | buyout | ${n0(c.expectedResidents)} bought out; behind the foot of Panoramic Way ${after ? `${n0(after.residentsBefore)} → ${n0(after.residentsAfter)}` : '—'} | neighbors' cars cut off ${cell(s.neighbors.vehNoRoute)}; still home at the fire front ${cell(s.neighbors.frontHome)} | ${n0(D.costs[id].households)} | ${range(D.costs[id].total)} |`);
    }
    const best = D.step2.candidates.filter(k => k.fires.panoramic).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    for (const k of best.slice(0, 3)) {
      const f = k.fires.panoramic, a155 = k.areasAffected.find(a => a.id === 'AC-155');
      P(`| ${k.id} ${k.link} (${n0(k.lengthM)} m, ${n1(k.avgGradePct)}% average grade) | second way out (provisional) | ${n0(k.hillResidentsFreed)} hill residents freed from behind every choke; AC-155 ${a155 ? `${n0(a155.residentsBehindBefore)} → ${n0(a155.residentsBehindAfter)}` : '—'} behind a choke | area cars cut off ${f.areaVehNoRoute ? `${n0(f.areaVehNoRoute.without)} → ${n0(f.areaVehNoRoute.with)} (${f.areaVehNoRoute.better}/${f.areaVehNoRoute.worse}/${f.areaVehNoRoute.same})` : '—'}; still home at the fire front ${f.areaFrontHome ? `${n0(f.areaFrontHome.without)} → ${n0(f.areaFrontHome.with)}` : '—'} | ${k.buildingsRemoved ?? '—'} building${k.buildingsRemoved === 1 ? '' : 's'} in the corridor | ${k.cost ? range(k.cost) : '—'} |`);
    }
    const other = D.step2.candidates.filter(k => !k.fires.panoramic);
    if (other.length) P('', `Other areas with both a buyout block in the cases above and a step 2 link: ${other.map(k => `${k.id} (${k.link}, frees ${n0(k.hillResidentsFreed)}, ${k.cost ? range(k.cost) : 'not priced'})`).join('; ')}.`);
    P('');
  }

  // ---------- limits ----------
  P('## Limits', '',
    '- Synthetic households on street segments, not homes: a block\'s count is the zone\'s population spread by street length. The rank of two neighboring blocks can turn on that allocation. A real program would start from parcels and owners willing to sell, which this analysis does not use.',
    '- The fires are illustrative and the traffic model is uncalibrated for weekday peaks (HANDOFF.md, calibration). Results compare runs; they do not estimate real outcomes.',
    '- When a household is ready to leave does not depend on the streets, so a buyout cannot get the remaining residents out of the house sooner; it only shortens the queue once they are on the road. Measures of people still home move only through riders and cars waiting for room on a full street.',
    '- Parked cars do not depend on households in the simulator, so the main runs keep them on bought-out blocks; the engine-reach sensitivity shows what clearing them would do.',
    '- Bought-out land is assumed to stay empty: no new homes, no ADUs, no parking. Future growth is off in every run.',
    '- Costs use block-group medians, which are top-coded at $2,000,001 and include homes far from the bought-out blocks. Willingness to sell, eminent domain (not assumed), federal cost shares and tax effects are outside this screening.',
    '');

  // ---------- sources ----------
  P('## Sources', '');
  for (const [k, s] of Object.entries(D.costSources)) if (s.what) P(`- ${s.what}. ${s.url}. Retrieved ${s.retrieved}. Category: ${s.category}.`);
  P('- Access-constrained areas: `data/model/access-constraints.json` (`tools/access-constraints.mjs`, SOURCE_NOTES AC1–AC15).',
    '- Engine reach: `js/sim.js` engineReachTimes (SOURCE_NOTES ER1–ER3).',
    D.step2 ? `- Step 2: ${D.step2.source}.` : '', '');
  fs.writeFileSync(path.join(R, 'docs/managed-retreat.md'), L.join('\n'));
  console.log('wrote docs/managed-retreat.md');
}
