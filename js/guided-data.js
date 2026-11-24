// Guided view figures (Eric, 2026-11-10, MASTER session; SOURCE_NOTES GV1–GV8). Pure functions over the stored
// tables, so tests/guided.mjs can check them in Node:
//   data/model/mitigations.json   the status quo ("baseline") and each change, 15 runs per fire (low, medium and high
//                                 severity × seeds 1–5, fall night): result figures, change groups, one-change comparisons.
//                                 Guided view reads the 5 runs at the chosen fire pace (severity; SOURCE_NOTES GV21).
//   data/model/spread-access.json  the street network's single ways out (residents behind them) and what new roads open
// Nothing here runs the simulator.
import { presence, direction, assumption } from './robust.js';

export const SEVS = ['low', 'central', 'high'];

// Fire pace in Guided view (Eric, 2026-11-23, MASTER session; SOURCE_NOTES GV21): the three severities of js/scenarios.js
// SEVERITY under plain names, 1923 pace by default. Each pace's Explain this: what sets it and what anchors it.
export const PACES = [
  { sev: 'low', label: 'Slower', explain: 'Half the 1923 pace\'s head spread rate. Embers reach up to about 300 m downwind in the 32 mph wind of the 1923 repeat, farther in a stronger wind and less far in a weaker one, and most land much nearer; spot fires are rarer. No historical fire anchors it; it is a lower bound.' },
  { sev: 'central', label: '1923 pace', explain: 'The head spread rate is calibrated to the City StoryMap\'s present-day repeat of the 1923 fire, about 5 hours from the eastern edge of the city to Shattuck Avenue in a 32 mph wind (SOURCE_NOTES S11). In a weaker wind the head spreads more slowly, in a stronger one faster (FW2). Embers reach up to about 800 m downwind at 32 mph, in proportion to the wind speed, and most land much nearer (FW8, FW9). The default pace; no source says it is the most likely fire.' },
  { sev: 'high', label: '1991 pace', explain: 'For its first hour the head spreads faster than the 1923 pace, fitted to the 1991 fire, which ran more than a mile downwind in its first 64 minutes; after that it spreads at the 1923 pace, never slower (Eric, 2026-11-24; SOURCE_NOTES FV17, FW6, FW7, S19). The 1991 head nearly stalled after its first hour as the wind eased and firefighters arrived; the model includes neither, so this pace burns more than 1991 did after the first hours. Embers reach up to about 1.5 km downwind at 32 mph, in proportion to the wind speed, and most land much nearer.' },
];
// The earthquake fire's paces (FW12, FW15): its medium rate is fitted to the USGS HayWired scenario's floor area burned in
// Berkeley, not to the 1923 fire, so it has its own names and Explain text.
const QUAKE_LIMIT = 'The model does not include the water system failing after the earthquake, or fire passing from building to building on its own: buildings burn as fuel at the rate of the fire zone they stand in, and do not change how the fire spreads.';
export const QUAKE_PACES = [
  { sev: 'low', label: 'Slower', explain: `Half the HayWired pace's head spread rate, with fewer spot fires. No source anchors it; it is a lower bound. ${QUAKE_LIMIT}` },
  { sev: 'central', label: 'HayWired pace', explain: `The head spread rate is fitted so the spring-afternoon fire reaches about as many structures in Berkeley in 6 hours as the USGS HayWired scenario burns there (about 2,270 single-family-home equivalents of floor area; SOURCE_NOTES EQ11, FW12). The wind and the fire zones then set how fast each part burns. The default pace. ${QUAKE_LIMIT}` },
  { sev: 'high', label: 'Faster', explain: `Faster than the HayWired pace for the first hour, then at the HayWired pace, never slower: the 1991 pace's rule applied to the earthquake's rate (SOURCE_NOTES FW6). No source anchors it. ${QUAKE_LIMIT}` },
];
export const pacesFor = fire => (/^quake/.test(fire || '') ? QUAKE_PACES : PACES);
export const paceOf = (sev, fire) => { const P = pacesFor(fire); return P.find(p => p.sev === sev) || P[1]; };
export const DEFAULT_PACE = 'central';

// The five results, most important first (Eric, 2026-11-10). key: the measure in mitigations.json runs and in a live
// comparison (js/mitigate.js MEASURES: ember, front, engine, cutOff); oneWay is a property of the street network.
export const CARDS = [
  { id: 'ember', key: 'ember',
    plain: 'How many people were still at home, or still driving out, when the fire or its embers first reached their street. Embers always arrive first, or with the fire front, so this counts everyone the front reached too. The people are simulated households placed where Berkeley residents live, and the number is the middle of five runs of this fire.', split: 'ember', live: 'ember', unit: 'people', group: 'people', cat: 'synthetic',
    // One card for embers and the fire front since 2026-11-24 (MASTER; SOURCE_NOTES FL2): the front's count is a subset.
    line: 'people not yet out when the fire or its embers reached their street',
    counts: 'Synthetic residents still at home when modeled embers or the fire front first reached their street, or on the road in a car on a street under embers after leaving. Embers reach a street no later than the front (js/fire.js emberExposure starts from the front\'s arrival), so this includes everyone the front reached. Each person is counted once.',
    limits: 'It counts people at that moment, not injuries or deaths: many would shelter or come through unharmed. Departure times come from the 2025 Evacuation Time Study survey; the traffic model clears roads faster than that study, so this count is likely low. Riders leave the moment the neighbor they ride with leaves, and nobody in the simulator needs help to leave: there are no pickups, paratransit or care-facility evacuations. Leaving on foot is not modeled: every household leaves by car or rides with a neighbor, including people in the flats, who could often walk away from a fire coming down from the hills.' },
  { id: 'front', sub: 'ember', key: 'frontPeople',
    plain: 'How many people were still at home, or still driving out, when the fire itself reached their street. The people are simulated households placed where Berkeley residents live, and the number is the middle of five runs of this fire.', split: 'front', live: 'front', unit: 'people', group: 'people', cat: 'synthetic',
    line: 'people not yet out when the fire front reached their street',
    counts: 'Synthetic residents still at home when the modeled fire front itself reached their street, or on the road in a car on a burning street. Each person is counted once.',
    limits: 'A harsher test than embers; still a count of people at that moment, not injuries or deaths. The traffic model clears roads faster than the 2025 Evacuation Time Study, so this count is likely low. Riders leave the moment the neighbor they ride with leaves, and nobody in the simulator needs help to leave: there are no pickups, paratransit or care-facility evacuations. Leaving on foot is not modeled: every household leaves by car or rides with a neighbor, including people in the flats, who could often walk away from a fire coming down from the hills.' },
  { id: 'engine', key: 'engine',
    plain: 'How many hill residents live on streets a fire engine could not reach within 5 minutes of a Berkeley fire station, mostly because parked cars narrow the street. It is measured when the fire starts, so it does not depend on how the fire burns.', live: 'engine', unit: 'people', group: 'engine', cat: 'synthetic',
    line: 'hill residents with no engine route within 5 minutes',
    counts: 'Synthetic residents of Berkeley\'s Fire Zones 2–3 whose street the modeled road network gives no route from one of Berkeley\'s 7 fire stations within the City\'s 5-minute standard, at ignition, past the night\'s parked cars. A home counts at the nearer end of its street segment.',
    limits: 'Engines only drive in this simulator; they do not fight the fire. Most of these streets are blocked by parked cars: at night residents park both sides of most 17–24 ft hill streets, a rule resting on one night\'s count of 11 blocks (2026-11-05). The same on every fire.' },
  { id: 'oneWay', key: null,
    plain: 'How many hill residents live on streets with only one way out by car: if one stretch of road closed, they could not drive out. It comes from the street map, so it is the same in every run.', live: null, unit: 'people', group: null, cat: 'derived',
    line: 'hill residents on streets with only one way out',
    counts: 'Synthetic hill residents on streets whose every drivable route out passes one street link: if that link closed, by fire, a crash or a fallen tree, they would have no modeled route for cars. From the street network, so the same on every fire.',
    limits: 'Paths and stairways that people could walk are not counted. Depends on County and OpenStreetMap street records (one-way codes, gates, missing links) and on how each zone\'s population is spread over its streets.' },
  { id: 'cutOff', key: 'cutOff',
    plain: 'How many cars were still on the road at the end of the run with every way out blocked by the fire. It counts cars in the simulation, not people.', live: 'cutOff', unit: 'cars', group: 'cars', cat: 'synthetic',
    line: 'cars left with no open route out',
    counts: 'Cars on the road at the end of the run for which the modeled fire had closed every route out from where they were, almost always before they set off.',
    limits: 'A model state, not a count of people trapped. Parking rules barely change it; leaving earlier does.' },
  // Added 2026-11-13 with home hardening and Zone 0 (SOURCE_NOTES PH32, PH33).
  { id: 'homes', key: 'homes',
    plain: 'How many buildings in the hill fire zones the fire reached and would likely be lost, judged by how close each stands to its neighbors. Hardening homes and clearing the 5 feet around them (Zone 0) lowers this count.', live: 'homes', unit: 'buildings', group: 'homes', cat: 'assumption',
    line: 'buildings lost in the hill fire zones (not computed in the flats)',
    counts: 'Buildings in Berkeley\'s Fire Zones 2–3 (City footprints, some of them garages) that the modeled fire front reached, each counted as lost with a probability set by how close it stands to its nearest neighbor: 85–94% under 50 ft, 27–65% farther apart; the figure uses the middle of each range. In the 2018 Camp Fire 94% of homes within 18 m (59 ft) of a destroyed building were lost, and 27–65% of those farther away (Knapp et al. 2021); the model applies the near band under 50 ft, so buildings 50–59 ft apart take the farther range, and the 85% lower end is this project\'s allowance for differences between Paradise and Berkeley. Home hardening and Zone 0 lower those probabilities, most where whole blocks take part.',
    limits: 'The modeled fire does not spread from building to building and does not respond to hardening or Zone 0, so they change only this count, not the fire, the orders or the traffic. Buildings reached only by embers get no loss figure, though embers start many house fires. Not computed outside Fire Zones 2–3. The loss probabilities and what hardening and Zone 0 do are assumption ranges.' },
];
export const cardById = id => CARDS.find(c => c.id === id);
// Fires that change the street network itself: the Hayward Fault earthquake closes the segments crossing the mapped
// fault trace to traffic and engines and darkens every signal (js/sim.js world.quake; SOURCE_NOTES EQ4, EQ10, FF27).
// On them engine reach at ignition differs from the other fires, and the single-ways-out figure, computed on the
// intact network (tools/access-constraints.mjs), does not apply. They are left out when asking whether a measure is
// the same on any fire.
export const NETWORK_FIRES = { quake: 'The earthquake closes 69 street segments where they cross the Hayward Fault and darkens every signal, so the street network differs from the one this figure was computed on.' };

// The two "people not yet out" results split four ways (Eric, 2026-11-12, MASTER session; SOURCE_NOTES GV13), in the
// order of spread-access.json runs[].split (tools/spread-access.mjs; js/sim.js summary). Each run's parts sum to that
// run's total in mitigations.json (tests/guided.mjs).
export const SPLIT_PARTS = [
  { id: 'car', short: 'home, car or ride', label: 'At home, with a car or a ride', def: 'At home in a zone ordered to leave (or, before any order, warned, in a household leaving on the warning), with a car or a ride with a neighbor, not yet left.' },
  { id: 'noCar', short: 'home, no car or ride', label: 'At home, no car and no ride', def: 'At home in a zone ordered to leave (or warned, in a household leaving on the warning), in a household with no car that found no neighbor to ride with (the 2025 Evacuation Time Study: 86.9% of people in households without a car ride with someone else).' },
  { id: 'notOrdered', short: 'home, no order', label: 'At home, in zones never ordered to leave', def: 'At home in a zone the scenario never ordered to leave during the run: zones under no order or warning, and zones under a warning only, where the households that did not leave on the warning stay home.' },
  { id: 'road', short: 'on the road', label: 'On the road', def: 'In a car on a street when embers (or the front) reached it, after leaving home; includes people riding with a neighbor and the modeled commuters, visitors and other non-residents.' },
];

// Change groups, in the order of the result cards they improve (Eric, 2026-11-10).
export const GROUPS = [
  { id: 'people', title: 'Fewer people not yet out when embers or the fire front arrive', cards: ['ember', 'front'] },
  { id: 'engine', title: 'Engines reach more hill residents within 5 minutes', cards: ['engine'] },
  { id: 'cars', title: 'Fewer cars with no open route out', cards: ['cutOff'] },
  { id: 'homes', title: 'Fewer buildings lost', cards: ['homes'] },
  // The rest, in three groups (reviewer subagent, MASTER, 2026-11-23; SOURCE_NOTES GV36): worse on some result in every
  // run at this pace; no consistent change; and withheld on this fire under P19 (js/presets.js off, LEVER_OFF).
  { id: 'worse', title: 'Worse in every run', cards: [], rest: true },
  { id: 'none', title: 'No consistent change', cards: [], rest: true },
  { id: 'off', title: 'Not offered on this fire', cards: [], rest: true },
];

export const median = xs => {
  const s = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b), n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
};
// When a pass counts as better or worse: one rule everywhere in Guided view, the stored table's (tools/mitigations.mjs cmp,
// its holds rule, P19): any difference beyond floating-point rounding (relative 1e-9), for table rows, one-change comparisons
// and live stacks alike; the consistent / mixed / sensitive label says whether a difference holds up (Eric, 2026-11-10,
// SOURCE_NOTES GV10). Expert view's Compare keeps MS11's 1% rule (js/main.js tolSame, a separate code path).
export const NOISE = 1e-9;
export const sameWithin = (a, b, noise = NOISE) => a === b || (a != null && b != null && Math.abs(a - b) <= noise * Math.max(Math.abs(a), Math.abs(b)));
// Rounding for display: residents to 10, small counts as they are.
export const round10 = x => x == null ? null : Math.abs(x) >= 100 ? Math.round(x / 10) * 10 : Math.round(x);

// A count across the runs, labeled with js/robust.js (SA4, SOURCE_NOTES GV4): presence of the count (above zero) by
// severity; a count present in nearly every run is "sensitive" when its low- and high-severity medians differ by 25%
// or more (robust.js assumption), since severity is the run set's one setting with a low/medium/high range.
export function countLabel(bySev) {
  const p = presence(Object.fromEntries(SEVS.map(s => [s, [bySev[s].pos, bySev[s].n]])));
  if (p.label === 'consistent' && p.present && assumption(bySev.low.median, bySev.high.median) === 'sensitive') return { ...p, label: 'sensitive', bySeverity: true };
  return p;
}

export function makeGuided(M, SA, presets = [], leverOff = {}) {
  const runs = new Map(); // `${lever}|${fire}` → [{ sev, seed, m }]
  for (const r of M?.runs || []) { const k = `${r.lever}|${r.fire}`; if (!runs.has(k)) runs.set(k, []); runs.get(k).push(r); }
  const runsOf = (lever, fire) => runs.get(`${lever}|${fire}`) || [];
  const pairKey = r => `${r.sev}|${r.seed}`;
  const levers = (M?.levers || []).filter(l => l.ran && l.group !== 'check' && !l.notComparable);
  const leverById = id => levers.find(l => l.id === id);

  // A measure is "on any fire" when its value in every run depends only on severity and seed, never on the fire:
  // read from the table, so it stays right after a model change.
  const anyFireMemo = {};
  const anyFire = key => anyFireMemo[key] ??= ['baseline', ...levers.map(l => l.id)].every(id => {
    const seen = new Map();
    return (M.meta.fires || []).filter(f => !NETWORK_FIRES[f]).every(f => runsOf(id, f).every(r => { const k = pairKey(r); if (!seen.has(k)) { seen.set(k, r.m[key]); return true; } return sameWithin(seen.get(k), r.m[key]); }));
  });

  // The status quo on a fire: the figure (median) and its label over the runs at one fire pace (sev), or over all 15
  // runs when sev is not given; bySev holds every pace's median, for the "other paces" line.
  // Within one pace there is no severity range, so the label is consistent (present or absent in 5 of 5 runs) or mixed.
  function baseFigure(fire, key, sev) {
    const all = runsOf('baseline', fire), rs = sev ? all.filter(r => r.sev === sev) : all, vals = rs.map(r => r.m[key]);
    const bySev = Object.fromEntries(SEVS.map(s => { const v = all.filter(r => r.sev === s).map(r => r.m[key]); return [s, { median: median(v), pos: v.filter(x => x > 0).length, n: v.length }]; }));
    const label = sev ? presence({ [sev]: [bySev[sev].pos, bySev[sev].n] }) : countLabel(bySev);
    return { value: median(vals), n: rs.length, min: Math.min(...vals), max: Math.max(...vals), bySev, label, sev };
  }

  // Hill residents behind a single drivable way out (outermost areas, each street once), and in how many hill areas
  // (js/explore.js routesFindings; data/model/access-constraints.json, spread-access.json areaStatic).
  function oneWay(access, fire) {
    if (NETWORK_FIRES[fire]) return { value: null, na: NETWORK_FIRES[fire], areas: 0 };
    const outer = (access?.areas || []).filter(a => !a.parent && SA?.areaStatic?.[a.id]);
    return { value: outer.reduce((s, a) => s + SA.areaStatic[a.id].residents * a.hillShare, 0), areas: outer.filter(a => a.hillShare >= 0.5).length };
  }
  // Hill residents a set of new roads gives a second way out (SA7; egress-candidates.json via spread-access.json).
  // Two roads that free the same area are not additive; with more than one, the larger single figure is a floor.
  function freed(ids) {
    const fs = ids.map(id => SA?.leverStatic?.[id]?.hillResidentsFreed).filter(x => x != null);
    if (!fs.length) return null;
    return { value: Math.max(...fs), atLeast: fs.length > 1, sources: ids.map(id => SA.leverStatic[id]?.source).filter(Boolean) };
  }

  // Pass-by-pass tally of a change against the status quo on one measure, grouped by severity (lower is better).
  function tallyBySev(pairs, noise = NOISE) {
    const by = {};
    for (const { sev, a, b } of pairs) {
      const t = by[sev] ||= { better: 0, worse: 0, n: 0 }; t.n++;
      if (!sameWithin(a, b, noise)) (b ?? Infinity) < (a ?? Infinity) ? t.better++ : t.worse++;
    }
    return direction(by);
  }
  // Same-seed pairs of the status quo and a change; at one fire pace when sev is given.
  function tablePairs(fire, leverId, key, sev) {
    const base = new Map(runsOf('baseline', fire).map(r => [pairKey(r), r.m[key]]));
    return runsOf(leverId, fire).filter(r => base.has(pairKey(r)) && (!sev || r.sev === sev)).map(r => ({ sev: r.sev, a: base.get(pairKey(r)), b: r.m[key] }));
  }
  // gain: the median of the same-seed differences (the status quo minus the change), so it follows the pairs.
  const gainOf = P => median(P.map(p => p.a != null && p.b != null ? p.a - p.b : null));
  // One change against the status quo on a fire, from the table: per measure, both medians, the gain and the label,
  // over the runs at one fire pace (sev) or all 15; gainBySev holds every pace's gain, for the "other paces" line.
  function tableCompare(fire, leverId, key, sev) {
    const P = tablePairs(fire, leverId, key, sev), all = sev ? tablePairs(fire, leverId, key) : P;
    const a = median(P.map(p => p.a)), b = median(P.map(p => p.b));
    return { a, b, gain: gainOf(P), d: tallyBySev(P), n: P.length, gainBySev: Object.fromEntries(SEVS.map(s => [s, gainOf(all.filter(p => p.sev === s))])) };
  }

  // The verdict on one measure, the stored table's rule (js/mitigate.js stored): better in every run (holds), or in at
  // least three of four with none worse (mostly); harms: worse in at least three of four with none better. Over the
  // stored summary's 15 runs when sev is not given. At one fire pace (5 same-seed pairs) a change helps when it is better
  // in all 5, or in 4 with the fifth identical, and never worse; harms is the mirror (MASTER, 2026-11-23; GV21).
  // A run that goes the wrong way keeps a change out; a tie does not.
  const summary = (fire, id) => M.summaries.find(s => s.lever === id && s.fire === fire);
  const helps = m => !!m && (m.holds || (m.worse === 0 && m.better >= Math.ceil(m.n * 0.75)));
  const harms = m => !!m && m.better === 0 && m.worse >= Math.ceil(m.n * 0.75);
  function verdict(fire, id, key, sev) {
    if (!sev) return summary(fire, id)?.measures[key];
    const P = tablePairs(fire, id, key, sev); if (!P.length) return null;
    const better = P.filter(p => !sameWithin(p.a, p.b) && (p.b ?? Infinity) < (p.a ?? Infinity)).length, worse = P.filter(p => !sameWithin(p.a, p.b)).length - better;
    return { better, worse, same: P.length - better - worse, n: P.length, holds: better === P.length, pace: true };
  }
  const helpsAt = m => m?.pace ? m.n > 0 && m.worse === 0 && m.better >= m.n - 1 : helps(m), harmsAt = m => m?.pace ? m.n > 0 && m.better === 0 && m.worse >= m.n - 1 : harms(m);
  // A Guided-view question withheld on a fire under the P19 rule withholds its change too (js/presets.js off).
  const withheld = (fire, id) => presets.find(p => p.id === id)?.off?.[fire] || leverOff[id]?.[fire] || null;

  // The changes view: each change in every group whose card measures it improves on this fire (at the fire pace sev,
  // or over all 15 runs). The rest: "Worse in every run" when some result is worse in every run, "Not offered on this
  // fire" when withheld here, and "No consistent change" otherwise.
  function groups(fire, sev) {
    const out = GROUPS.map(g => ({ ...g, items: [] })), none = out.find(g => g.id === 'none'), worseG = out.find(g => g.id === 'worse'), offG = out.find(g => g.id === 'off');
    for (const l of levers) {
      const s = summary(fire, l.id); if (!s) continue;
      const m = key => verdict(fire, l.id, key, sev);
      const why = withheld(fire, l.id);
      let placed = false;
      if (!why) for (const g of out.filter(g => g.cards.length)) {
        // At one pace a change also must not be worse in any run on another of the group's results (egress guidance on
        // the 1923 fire at 1923 pace: fewer people under the front in 4 of 5 runs, more under embers in 5 of 5).
        if (sev && g.cards.some(c => m(cardById(c).key)?.worse > 0)) continue;
        const card = g.cards.map(cardById).find(c => helpsAt(m(c.key)));
        if (!card) continue;
        const cmp = tableCompare(fire, l.id, card.key, sev);
        out.find(x => x.id === g.id).items.push({ lever: l, card, gain: cmp.gain, d: cmp.d, anyFire: !NETWORK_FIRES[fire] && anyFire(card.key) });
        placed = true;
      }
      if (!placed) {
        const worse = why ? [] : CARDS.filter(c => c.key && harmsAt(m(c.key))).map(c => ({ card: c, worse: m(c.key).worse, n: m(c.key).n }));
        (why ? offG : worse.some(w => w.worse === w.n) ? worseG : none).items.push({ lever: l, card: null, gain: null, withheld: why, worse });
      }
    }
    return out;
  }

  // A result's four parts on a fire: each part's median over the runs at the fire pace sev, or all 15 (medians of parts
  // need not add to the median of the total), and by severity, from spread-access.json.
  function splitFigure(fire, which, sev) {
    const all = (SA?.runs || []).filter(r => r.fire === fire && r.split?.[which]), rs = sev ? all.filter(r => r.sev === sev) : all;
    if (!rs.length) return null;
    const wi = which === 'ember' ? 0 : 1;
    return { n: rs.length, warned: median(rs.map(r => r.splitWarned?.[wi] ?? null)), parts: SPLIT_PARTS.map((p, i) => ({ ...p, median: median(rs.map(r => r.split[which][i])),
      bySev: Object.fromEntries(SEVS.map(s => [s, median(all.filter(r => r.sev === s).map(r => r.split[which][i]))])) })) };
  }

  // Where the people of the merged card live (spread-access.json runs[].zone; SOURCE_NOTES FL1): medians over the runs at
  // the pace of those in Berkeley's hill fire zones and elsewhere in Berkeley; the rest live in other cities' zones or are
  // non-residents on the road. flats: residents of Berkeley streets outside Fire Zones 2–3 that embers or the front
  // reached, left or not (FL3). needsHelp: people who may need a wheelchair van or ambulance on streets embers reached
  // within 180 min of their zone's order or warning, the medians of the low and high ends (FL6).
  function zoneFigure(fire, sev) {
    const rs = (SA?.runs || []).filter(r => r.fire === fire && r.sev === sev && r.zone); if (!rs.length) return null;
    const m = f => median(rs.map(f));
    return { n: rs.length, ember: [m(r => r.zone.ember[0]), m(r => r.zone.ember[1])], front: [m(r => r.zone.front[0]), m(r => r.zone.front[1])],
      flats: { ember: m(r => r.flatsReached.ember), front: m(r => r.flatsReached.front) },
      needsHelp: rs.every(r => r.needsHelp) ? [m(r => r.needsHelp[1]), m(r => r.needsHelp[2])] : null };
  }
  // The fires whose embers reach streets in Berkeley's flats in the median run at a pace (FL4).
  const flatsFires = sev => (SA?.meta?.fires || []).filter(f => (zoneFigure(f, sev)?.flats.ember || 0) > 0);
  // Per run, those the embers reached whose street the front had not reached before they left: ember minus front (FL2).
  function emberOnly(fire, sev) {
    const rs = runsOf('baseline', fire).filter(r => r.sev === sev); if (!rs.length) return null;
    return median(rs.map(r => r.m.ember - r.m.frontPeople));
  }

  return { splitFigure, zoneFigure, flatsFires, emberOnly, levers, leverById, runsOf, baseFigure, oneWay, freed, tableCompare, tallyBySev, groups, anyFire, withheld, seeds: M?.meta?.seeds || [], severities: M?.meta?.severities || SEVS };
}

// Cost line and sort key (lever.cost; js/mitigate.js costText): a screening range, little capital cost, or not priced.
const money = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;
const little = c => /^Little capital/.test(c?.note || '');
export const costLine = c => c?.capital ? `${money(c.capital[0])}–${money(c.capital[1])}` : little(c) ? 'Little capital cost' : 'Not priced';
export const costKey = c => c?.capital ? c.capital[0] : little(c) ? 0 : Infinity;

// Sort a group's items: by gain (largest first) or by cost (cheapest first); unpriced last either way when sorting by cost.
export function sortItems(items, by) {
  const g = it => it.gain ?? -Infinity;
  return [...items].sort(by === 'cost' ? (x, y) => costKey(x.lever.cost) - costKey(y.lever.cost) || g(y) - g(x) : (x, y) => g(y) - g(x) || costKey(x.lever.cost) - costKey(y.lever.cost));
}

// Street names a change touches (rewritten or bought-out segments, a new road's ends, an opened path), for the overlap
// warning when two picked changes act on the same street.
export function streetsOf(lever, net, nodeEdges) {
  const d = lever?.delta || {}, E = net.edges, ids = [...(d.edges?.edges || []), ...(d.retreat?.edges || []), ...(d.link?.open || [])];
  if (d.link && !d.link.open) for (const n of [d.link.a, d.link.b]) for (const e of nodeEdges?.[n] || []) ids.push(e);
  return new Set(ids.map(id => E[id]).filter(e => e && e.mode === 'vehicle' && e.name).map(e => e.name));
}

// "Where traffic backed up in these runs" (Eric, 2026-11-23, MASTER session; SOURCE_NOTES GV25). From spread-access.json
// backups[fire][sev] (tools/spread-access.mjs): hill street segments (Fire Zones 2–3) in zones ordered or warned during
// the run, with person-minutes in waiting cars per run. Streets in the flats and the I-80 approaches are not in the table
// (the model's queues there sit at different junctions from the 2025 Evacuation Time Study's; CD25, CD29).
// A row is one street: adjacent table segments with the same name, joined where they share a node. Its value in a run is
// the sum of its segments' person-minutes; rows rank by the median over the 5 runs at the pace, and a row is listed when
// that median is at least BACKUP_ROW_MIN. A row is present in a run when it is among that run's BACKUP_TOP rows and holds
// at least BACKUP_ROW_MIN there; "in nearly every run" when present in all 5 runs (the 90% rule at n = 5), else "varies".
export const BACKUP_TOP = 10, BACKUP_ROW_MIN = 60; // rows; person-minutes, one person-hour (model rule, GV25)
export const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export function backupRows(SA, net, fire, sev) {
  const B = SA?.backups?.[fire]?.[sev]; if (!B || !net) return null;
  const E = net.edges, at = new Map(B.edges.map((e, i) => [e, i])), nRuns = B.seeds.length;
  const byName = new Map();
  for (const e of B.edges) { const k = E[e]?.name || ''; if (!k) continue; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(e); }
  const rows = [];
  for (const [name, es] of byName) {
    const left = new Set(es);
    while (left.size) {
      const g = [left.values().next().value]; left.delete(g[0]);
      for (let i = 0; i < g.length; i++) for (const x of [...left]) { const a = E[g[i]], b = E[x]; if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) { g.push(x); left.delete(x); } }
      const vals = Array.from({ length: nRuns }, (_, r) => g.reduce((s, e) => s + B.pm[at.get(e)][r], 0));
      const peaks = Array.from({ length: nRuns }, (_, r) => Math.max(...g.map(e => B.peak[at.get(e)][r])));
      rows.push({ name, street: titleCase(name), edges: g.sort((a, b) => a - b), vals, peaks, median: median(vals), peak: median(peaks) });
    }
  }
  rows.sort((a, b) => b.median - a.median || a.edges[0] - b.edges[0]);
  for (let r = 0; r < nRuns; r++) [...rows].sort((a, b) => b.vals[r] - a.vals[r]).slice(0, BACKUP_TOP).forEach(x => { if (x.vals[r] >= BACKUP_ROW_MIN) x.top = (x.top || 0) + 1; });
  for (const x of rows) { x.top ||= 0; x.n = nRuns; x.label = x.top === nRuns ? 'consistent' : 'mixed'; }
  return rows.filter(x => x.median >= BACKUP_ROW_MIN);
}
// The cross streets at a row's two ends ("from … to …"): at each end node of the joined segments, the first other named
// street for cars. nodeEdges: data.nodeEdges (js/data.js).
export function blockRange(row, net, nodeEdges) {
  const E = net.edges, deg = new Map();
  for (const e of row.edges) for (const n of [E[e].a, E[e].b]) deg.set(n, (deg.get(n) || 0) + 1);
  const ends = [...deg].filter(([, d]) => d === 1).map(([n]) => n);
  const cross = n => (nodeEdges[n] || []).map(id => E[id]).find(x => x && x.mode === 'vehicle' && x.name && x.name !== row.name)?.name;
  const names = [...new Set(ends.map(cross).filter(Boolean))].map(titleCase);
  return names.length >= 2 ? `${names[0]} to ${names[1]}` : names.length ? `near ${names[0]}` : '';
}
