// Guided view figures (Eric, 2026-11-10, MASTER session; SOURCE_NOTES GV1–GV8). Pure functions over the stored
// tables, so tests/guided.mjs can check them in Node:
//   data/model/mitigations.json   today's plan ("baseline") and each change, 15 runs per fire (low, medium and high
//                                 severity × seeds 1–5, fall night): result figures, change groups, one-change comparisons
//   data/model/spread-access.json  the street network's single ways out (residents behind them) and what new roads open
// Nothing here runs the simulator.
import { presence, direction, assumption } from './robust.js';

export const SEVS = ['low', 'central', 'high'];

// The five results, most important first (Eric, 2026-11-10). key: the measure in mitigations.json runs and in a live
// comparison (js/mitigate.js MEASURES: ember, front, engine, cutOff); oneWay is a property of the street network.
export const CARDS = [
  { id: 'ember', key: 'ember', split: 'ember', live: 'ember', unit: 'people', group: 'people', cat: 'synthetic',
    line: 'people not yet out when embers reached their street',
    counts: 'Synthetic residents still at home when modeled embers first reached their street, or on the road in a car on a street under embers after leaving. Each person is counted once.',
    limits: 'It counts people at that moment, not injuries or deaths: many would shelter or come through unharmed. Departure times come from the 2025 Evacuation Time Study survey; the traffic model clears roads faster than that study, so this count is likely low.' },
  { id: 'front', key: 'frontPeople', split: 'front', live: 'front', unit: 'people', group: 'people', cat: 'synthetic',
    line: 'people not yet out when the fire front reached their street',
    counts: 'Synthetic residents still at home when the modeled fire front itself reached their street, or on the road in a car on a burning street. Each person is counted once.',
    limits: 'A harsher test than embers; still a count of people at that moment, not injuries or deaths. The traffic model clears roads faster than the 2025 Evacuation Time Study, so this count is likely low.' },
  { id: 'engine', key: 'engine', live: 'engine', unit: 'people', group: 'engine', cat: 'synthetic',
    line: 'hill residents with no engine route within 5 minutes',
    counts: 'Synthetic residents of Berkeley\'s Fire Zones 2–3 whose street the modeled road network gives no route from one of Berkeley\'s 7 fire stations within the City\'s 5-minute standard, at ignition, past the night\'s parked cars. A home counts at the nearer end of its street segment.',
    limits: 'Engines only drive in this simulator; they do not fight the fire. Most of these streets are blocked by parked cars: at night residents park both sides of most 17–24 ft hill streets, a rule resting on one night\'s count of 11 blocks (2026-11-05). The same on every fire.' },
  { id: 'oneWay', key: null, live: null, unit: 'people', group: null, cat: 'derived',
    line: 'hill residents on streets with only one way out',
    counts: 'Synthetic hill residents on streets whose every drivable route out passes one street link: if that link closed, by fire, a crash or a fallen tree, they would have no modeled route for cars. From the street network, so the same on every fire.',
    limits: 'Paths and stairways that people could walk are not counted. Depends on County and OpenStreetMap street records (one-way codes, gates, missing links) and on how each zone\'s population is spread over its streets.' },
  { id: 'cutOff', key: 'cutOff', live: 'cutOff', unit: 'cars', group: 'cars', cat: 'synthetic',
    line: 'cars left with no open route out',
    counts: 'Cars on the road at the end of the run for which the modeled fire had closed every route out from where they were, almost always before they set off.',
    limits: 'A model state, not a count of people trapped. Parking rules barely change it; leaving earlier does.' },
  // Added 2026-11-13 with home hardening and Zone 0 (SOURCE_NOTES PH32, PH33).
  { id: 'homes', key: 'homes', live: 'homes', unit: 'buildings', group: 'homes', cat: 'assumption',
    line: 'buildings lost in the hill fire zones',
    counts: 'Buildings in Berkeley\'s Fire Zones 2–3 (City footprints, some of them garages) that the modeled fire front reached, each counted as lost with a probability set by how close it stands to its nearest neighbor: 85–94% under 50 ft, 27–65% farther apart (homes in the 2018 Camp Fire, Knapp et al. 2021); the figure uses the middle of each range. Home hardening and Zone 0 lower those probabilities, most where whole blocks take part.',
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
  { id: 'noCar', short: 'home, no car or ride', label: 'At home, no car and no ride', def: 'At home in a zone ordered to leave (or warned, in a household leaving on the warning), in a household with no car that found no neighbor to ride with (the 2025 Evacuation Time Study: 86.9% of carless households find a ride).' },
  { id: 'notOrdered', short: 'home, no order', label: 'At home, in zones never ordered to leave', def: 'At home in a zone the scenario never ordered to leave during the run: zones under no order or warning, and zones under a warning only, where the households that did not leave on the warning stay home.' },
  { id: 'road', short: 'on the road', label: 'On the road', def: 'In a car on a street when embers (or the front) reached it, after leaving home; includes people riding with a neighbor and the modeled commuters, visitors and other non-residents.' },
];

// Change groups, in the order of the result cards they improve (Eric, 2026-11-10).
export const GROUPS = [
  { id: 'people', title: 'Fewer people not yet out when the fire arrives', cards: ['ember', 'front'] },
  { id: 'engine', title: 'Engines reach more hill residents within 5 minutes', cards: ['engine'] },
  { id: 'cars', title: 'Fewer cars with no open route out', cards: ['cutOff'] },
  { id: 'homes', title: 'Fewer buildings lost', cards: ['homes'] },
  { id: 'none', title: 'No consistent benefit in our tests', cards: [] },
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

export function makeGuided(M, SA, presets = []) {
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

  // Today's plan on a fire: the 15-run figure (median), by severity, and its label.
  function baseFigure(fire, key) {
    const rs = runsOf('baseline', fire), vals = rs.map(r => r.m[key]);
    const bySev = Object.fromEntries(SEVS.map(s => { const v = rs.filter(r => r.sev === s).map(r => r.m[key]); return [s, { median: median(v), pos: v.filter(x => x > 0).length, n: v.length }]; }));
    return { value: median(vals), n: rs.length, min: Math.min(...vals), max: Math.max(...vals), bySev, label: countLabel(bySev) };
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

  // Pass-by-pass tally of a change against today's plan on one measure, grouped by severity (lower is better).
  function tallyBySev(pairs, noise = NOISE) {
    const by = {};
    for (const { sev, a, b } of pairs) {
      const t = by[sev] ||= { better: 0, worse: 0, n: 0 }; t.n++;
      if (!sameWithin(a, b, noise)) (b ?? Infinity) < (a ?? Infinity) ? t.better++ : t.worse++;
    }
    return direction(by);
  }
  function tablePairs(fire, leverId, key) {
    const base = new Map(runsOf('baseline', fire).map(r => [pairKey(r), r.m[key]]));
    return runsOf(leverId, fire).filter(r => base.has(pairKey(r))).map(r => ({ sev: r.sev, a: base.get(pairKey(r)), b: r.m[key] }));
  }
  // One change against today's plan on a fire, from the table: per measure, both medians, the gain and the label.
  function tableCompare(fire, leverId, key) {
    const P = tablePairs(fire, leverId, key);
    // gain: the median of the same-seed differences (today's plan minus the change), so it follows the pairs.
    const a = median(P.map(p => p.a)), b = median(P.map(p => p.b)), gain = median(P.map(p => p.a != null && p.b != null ? p.a - p.b : null));
    return { a, b, gain, d: tallyBySev(P), n: P.length };
  }

  // The stored verdict on one measure (js/mitigate.js stored): better in every run (holds), or in at least three of
  // four with none worse (mostly); harms: worse in at least three of four with none better.
  const summary = (fire, id) => M.summaries.find(s => s.lever === id && s.fire === fire);
  const helps = m => !!m && (m.holds || (m.worse === 0 && m.better >= Math.ceil(m.n * 0.75)));
  const harms = m => !!m && m.better === 0 && m.worse >= Math.ceil(m.n * 0.75);
  // A Guided-view question withheld on a fire under the P19 rule withholds its change too (js/presets.js off).
  const withheld = (fire, id) => presets.find(p => p.id === id)?.off?.[fire] || null;

  // The changes view: each change in every group whose card measures it improves on this fire; the rest, and
  // changes withheld on this fire, under "No consistent benefit".
  function groups(fire) {
    const out = GROUPS.map(g => ({ ...g, items: [] })), none = out.find(g => g.id === 'none');
    for (const l of levers) {
      const s = summary(fire, l.id); if (!s) continue;
      const why = withheld(fire, l.id);
      let placed = false;
      if (!why) for (const g of out.filter(g => g.cards.length)) {
        const card = g.cards.map(cardById).find(c => helps(s.measures[c.key]));
        if (!card) continue;
        const cmp = tableCompare(fire, l.id, card.key);
        out.find(x => x.id === g.id).items.push({ lever: l, card, gain: cmp.gain, d: cmp.d, anyFire: !NETWORK_FIRES[fire] && anyFire(card.key) });
        placed = true;
      }
      if (!placed) {
        const worse = CARDS.filter(c => c.key && harms(s.measures[c.key])).map(c => ({ card: c, worse: s.measures[c.key].worse, n: s.measures[c.key].n }));
        none.items.push({ lever: l, card: null, gain: null, withheld: why, worse });
      }
    }
    return out;
  }

  // A result's four parts on a fire: each part's median over the 15 runs (medians of parts need not add to the median
  // of the total), by severity, from spread-access.json.
  function splitFigure(fire, which) {
    const rs = (SA?.runs || []).filter(r => r.fire === fire && r.split?.[which]);
    if (!rs.length) return null;
    const wi = which === 'ember' ? 0 : 1;
    return { n: rs.length, warned: median(rs.map(r => r.splitWarned?.[wi] ?? null)), parts: SPLIT_PARTS.map((p, i) => ({ ...p, median: median(rs.map(r => r.split[which][i])),
      bySev: Object.fromEntries(SEVS.map(s => [s, median(rs.filter(r => r.sev === s).map(r => r.split[which][i]))])) })) };
  }

  return { splitFigure, levers, leverById, runsOf, baseFigure, oneWay, freed, tableCompare, tallyBySev, groups, anyFire, withheld, seeds: M?.meta?.seeds || [], severities: M?.meta?.severities || SEVS };
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
