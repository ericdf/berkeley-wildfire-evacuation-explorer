// Simple-view fires and questions. A question is offered on a fire only where Plan B beat Plan A
// on its headline measure in all 15 same-seed runs (low, central and high severity x seeds 1-5)
// by a clear margin (central-severity median change of 5% or more); SOURCE_NOTES P19-P22,
// 2026-11-01, P31 for the north-hills fire, P32 for the east-wind fire from 60° and P33 after other cities' orders (FO1), P34 at 1 km (FO6) and P35 with each person counted once (FO8), 2026-11-02, DM18 under the ACS household mix, 2026-11-04, and again on the merged fire model and mix when PR #59 merged, 2026-11-05 (node tools/simple-questions.mjs). Each question fixes the time of day
// (per plan where `tods` is set); the plans start from DEFAULT_PLAN. `on` holds the "What to look
// for" text for each fire it is offered on, with central-severity medians from that test; `off`
// gives the one-line reason it is withheld.
import { DEFAULT_PLAN } from './sim.js';

const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const plan = (name, o = {}) => ({ ...DEFAULT_PLAN, name, ...o });

// Scenario ids from scenarios.js. The first is the default.
export const FIRES = [
  { id: 'eastWind', title: 'East wind, Grizzly Peak', line: 'Starts near Grizzly Peak Blvd. Ordered out: all of Fire Zones 2–3, Kensington line to Claremont (about 30,000 people).' },
  { id: 'ref1923', title: '1923 fire, repeated today', line: 'Starts at the north hills\' eastern edge. Ordered out: ridge to Sacramento St, Marin Ave to campus (about 27,000 people).' },
  { id: 'panoramic', title: 'Panoramic Hill', line: 'Starts above Panoramic Hill. Ordered out: Panoramic Hill and Claremont Canyon streets in Berkeley and Oakland (about 2,200 people).' },
  { id: 'northHills', title: 'North hills, from Tilden', line: 'Starts in Tilden east of Grizzly Peak Blvd at Spruce St. Ordered out: the north hills, from the Albany and Kensington line to Hearst Ave (about 22,600 people).' },
];

const PANORAMIC_UNORDERED = 'Most of those still there live in Berkeley zones this fire never orders (about 10,450): the City\'s order covers only Panoramic Hill\'s 7 zones, while Oakland orders its own zones as the fire comes within 1 km.';

export const PRESETS = [
  {
    id: 'leaveEarly',
    title: 'Leave early on a Red Flag day',
    question: 'What if half the households in the hills (Fire Zones 2–3) leave on a Red Flag warning, before any fire starts?',
    tod: 'S6',
    A: plan('A: everyone waits for an order'),
    B: plan('B: half of hill households leave on the Red Flag warning', { earlyShare: 0.5, earlyZones: 'fz23' }),
    on: {
      eastWind: 'In Plan B about a sixth fewer people are still there when embers arrive (about 6,300 against 5,250 in the medium-severity case), and 90% of cars are out about a minute sooner. If only the City\'s smaller Leave Early Zones do it, the drop is about 2%: most hill residents live outside them.',
      ref1923: 'In Plan B about 30% fewer people are still there when embers arrive (about 4,050 against 2,850 in the medium-severity case), and 90% of cars are out about 2 minutes sooner (89 against 91 min).',
      panoramic: `In Plan B about a seventh fewer people are still there when embers arrive (about 13,500 against 11,600 in the medium-severity case). ${PANORAMIC_UNORDERED} In most runs not all ordered cars get out within the 4 hours simulated, so watch the count, not the clearance time.`,
      northHills: 'In Plan B about a fifth fewer people are still there when embers arrive (about 4,850 against 3,750 in the medium-severity case), and 90% of cars are out about a minute sooner. If only the City\'s smaller Leave Early Zones do it, the drop is about 10%.',
    },
    off: {},
    headline: { label: 'Modeled residents not yet out when embers reached their street', f: exposed, dir: -1 },
  },
  {
    id: 'orderSooner',
    title: 'Decide faster',
    question: 'What if the first evacuation order goes out 5 minutes after the fire starts instead of 20?',
    tod: 'S4',
    A: plan('A: first order 20 min after ignition', { orderDelayMin: 20 }),
    B: plan('B: first order 5 min after ignition', { orderDelayMin: 5 }),
    on: {
      ref1923: 'About a fifth fewer people are still there when embers arrive (about 5,800 against 4,650 in the medium-severity case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
      eastWind: 'About 8% fewer people are still there when embers arrive (about 7,400 against 6,800 in the medium-severity case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
      panoramic: `About 5% fewer people are still there when embers arrive (about 14,600 against 13,900 in the medium-severity case), a smaller gain than on the two larger fires. ${PANORAMIC_UNORDERED}`,
      northHills: 'About 11% fewer people are still there when embers arrive (about 5,600 against 4,950 in the medium-severity case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
    },
    off: {},
    headline: { label: 'Modeled residents not yet out when embers reached their street', f: exposed, dir: -1 },
  },
  {
    id: 'timeOfDay',
    // Not offered in Guided view since 2026-11-06: its headline is a clearance time, which the explorer no longer
    // reports as a result (product brief; SOURCE_NOTES SA10, CD1–CD16). Kept here so tests/plan-draws.mjs still checks it.
    hidden: true,
    title: 'Weekday midday or night',
    question: 'The same fire and the same plan: how much does a weekday afternoon slow the evacuation compared with night?',
    tod: 'S4', tods: { A: 'S4', B: 'S6' },
    A: plan('A: fall weekday, midday'),
    B: plan('B: fall night'),
    on: {
      eastWind: 'On a weekday about 15,950 cars from the zones Berkeley orders evacuate instead of 13,800 (Oakland and other neighbors\' ordered zones add about 170 more under both), some households wait for a commuter to drive home, and parents pick up children. 90% of cars get out about 13 minutes later (about 105 against 92 min). Both plans are the same; only the time of day differs.',
      northHills: 'On a weekday about 12,750 cars from the zones Berkeley orders evacuate instead of 11,350 (Kensington, El Cerrito and Albany add about 2,600–2,850 more under both), some households wait for a commuter to drive home, and parents pick up children. 90% of cars get out about 14 minutes later (about 106 against 92 min); the 2025 Time Study finds 20 minutes for this region (2:05 against 1:45). Both plans are the same; only the time of day differs.',
    },
    off: {
      ref1923: 'weekday and night differ by about 7 min here (98 against 91), while the 2025 Time Study finds about 70 min for this region; the simulator misses most of that weekday slowdown.',
      panoramic: 'in 10 of 15 runs not all ordered cars get out within the 4 hours simulated, so there is no 90% time to compare.',
    },
    headline: { label: 'Minutes until 90% of cars are out', f: S => S.clearP90, dir: -1 },
  },
  {
    id: 'parkingEngines',
    title: 'Parked cars and fire engines',
    question: 'What if hill streets allow parking on one side only?',
    tod: 'S6',
    A: plan('A: parking as it is today'),
    B: plan('B: parking on one side only in Fire Zones 2–3', { hillsParking: 'oneside' }),
    otherNote: 'In this simulator engines only drive; they do not fight the fire or protect homes, so better engine access has no effect on the fire. Parking still changes traffic on hill streets a little, but in the runs tested it made no consistent difference to who was still there. Engine travel time to the fire edge, at ignition and at the end of the run, was the same or shorter under Plan B in every run tested (four fires, three severities, five seeds), and shorter in some.',
    // Headline and numbers: SOURCE_NOTES ER2, rerun under the night parking rule in NP6 (central medians). Reach at ignition
    // depends on the seed's parked cars, not the fire, so it is the same on every fire; the end-of-run share (traffic and fire) differs.
    on: Object.fromEntries([['eastWind', '50%', '80%', 4], ['ref1923', '46%', '71%', 6], ['panoramic', '50%', '82%', 4], ['northHills', '55%', '76%', 4]].map(([id, la, lb, hours]) => [id,
      'Count the hill residents a fire engine cannot reach from a station within the City\'s 5-minute standard, before traffic and fire: about 9,900 of Berkeley\'s 27,900 Fire Zones 2–3 residents with today\'s parking, about 1,050 with parking on one side (central case; fewer in every run). '
      + 'At night residents park both sides of most hill streets 17–24 ft wide, leaving one car\'s width: cars get through by taking turns, an engine does not. That rule rests on one night\'s count, at about 1 a.m., of 11 narrow blocks. '
      + 'With parking on one side, most of those left are on Panoramic Hill: its lowest block of Panoramic Way is 17 ft wide, and in 4 of the 5 test seeds a car parked there leaves less than an engine\'s width, cutting off about 990 people. '
      + `By the end of the ${hours}-hour run, with evacuation traffic and burned streets, an engine can reach ${la} of hill residents within 5 minutes under Plan A and ${lb} under Plan B. `
      + 'Color streets by "Engine drive time" (Expert view, Map) to see where. One-side parking also cuts street segments too narrow for an engine from about 1,100 to 143. '
      + (id === 'panoramic' ? 'Evacuation time cannot be compared here, because in most runs not all ordered cars get out within the 4 hours simulated.'
        : 'Evacuation time does not change: on a two-way street, removing parking opens the oncoming lane, not a second lane out. People still there when embers arrive show no consistent change either: engines do not fight the fire in this simulator, and parking changes traffic on hill streets only a little.')])),
    off: {},
    headline: { label: 'Hill residents with no engine route meeting the 5-minute standard', f: S => S.engineReachBeyond5People, dir: -1 },
  },
];
