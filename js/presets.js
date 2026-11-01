// Simple-view fires and questions. A question is offered on a fire only where Plan B beat Plan A
// on its headline measure in all 15 same-seed runs (low, central and high severity x seeds 1-5)
// by a clear margin (central-severity median change of 5% or more); SOURCE_NOTES P19-P22,
// 2026-11-01. Each question fixes the time of day (per plan where `tods` is set); the plans start
// from DEFAULT_PLAN. `on` holds the "What to look for" text for each fire it is offered on, with
// central-severity medians from that test; `off` gives the one-line reason it is withheld.
import { DEFAULT_PLAN } from './sim.js';

const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const plan = (name, o = {}) => ({ ...DEFAULT_PLAN, name, ...o });

// Scenario ids from scenarios.js. The first is the default.
export const FIRES = [
  { id: 'eastWind', title: 'East wind, Grizzly Peak', line: 'Starts near Grizzly Peak Blvd. Ordered out: all of Fire Zones 2–3, Kensington line to Claremont (about 30,000 people).' },
  { id: 'ref1923', title: '1923 fire, repeated today', line: 'Starts at the north hills\' eastern edge. Ordered out: ridge to Sacramento St, Marin Ave to campus (about 27,000 people).' },
  { id: 'panoramic', title: 'Panoramic Hill', line: 'Starts above Panoramic Hill. Ordered out: Panoramic Hill and Claremont Canyon streets in Berkeley and Oakland (about 2,100 people).' },
];

const PANORAMIC_UNORDERED = 'Most of those still there live in zones this fire never orders (about 9,000), since the order covers only Panoramic Hill\'s 7 zones.';

export const PRESETS = [
  {
    id: 'leaveEarly',
    title: 'Leave early on a Red Flag day',
    question: 'What if half the households in the hills (Fire Zones 2–3) leave on a Red Flag warning, before any fire starts?',
    tod: 'S6',
    A: plan('A: everyone waits for an order'),
    B: plan('B: half of hill households leave on the Red Flag warning', { earlyShare: 0.5, earlyZones: 'fz23' }),
    on: {
      eastWind: 'In Plan B more than a quarter fewer people are still there when embers arrive (about 5,100 against 3,650 in the central case), and the roads clear a minute or so sooner. If only the City\'s smaller Leave Early Zones do it, the drop is about 4%: most hill residents live outside them.',
      ref1923: 'In Plan B about a third fewer people are still there when embers arrive (about 4,750 against 3,100 in the central case), and 90% of cars are out about 2 minutes sooner (89 against 91 min).',
      panoramic: `In Plan B about a fifth fewer people are still there when embers arrive (about 15,000 against 11,850 in the central case). ${PANORAMIC_UNORDERED} In most runs not all ordered cars get out within the 4 hours simulated, so watch the count, not the clearance time.`,
    },
    off: {},
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'orderSooner',
    title: 'Decide faster',
    question: 'What if the first evacuation order goes out 5 minutes after the fire starts instead of 20?',
    tod: 'S4',
    A: plan('A: first order 20 min after ignition', { orderDelayMin: 20 }),
    B: plan('B: first order 5 min after ignition', { orderDelayMin: 5 }),
    on: {
      ref1923: 'About a fifth fewer people are still there when embers arrive (about 6,800 against 5,450 in the central case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
      eastWind: 'About 15% fewer people are still there when embers arrive (about 6,500 against 5,600 in the central case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
      panoramic: `About 9% fewer people are still there when embers arrive (about 16,850 against 15,350 in the central case), a smaller gain than on the two larger fires. ${PANORAMIC_UNORDERED}`,
    },
    off: {},
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'timeOfDay',
    title: 'Weekday midday or night',
    question: 'The same fire and the same plan: how much does a weekday afternoon slow the evacuation compared with night?',
    tod: 'S4', tods: { A: 'S4', B: 'S6' },
    A: plan('A: fall weekday, midday'),
    B: plan('B: fall night'),
    on: {
      eastWind: 'On a weekday about 17,200 cars evacuate instead of 15,100, some households wait for a commuter to drive home, and parents pick up children. 90% of cars get out about 13 minutes later (about 105 against 92 min). Both plans are the same; only the time of day differs.',
    },
    off: {
      ref1923: 'weekday and night differ by only about 4 min here (95 against 91), while the 2025 Time Study finds about 70 min for this region; the simulator misses most of that weekday slowdown.',
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
    on: Object.fromEntries(['eastWind', 'ref1923', 'panoramic'].map(id => [id, 'Color streets by "fire-engine access" (Expert view, Map) to see the red streets, where parked cars leave less than an engine\'s width. One-side parking cuts them from about 284 segments to 143; the count covers hill streets citywide, so it is the same on every fire. '
      + (id === 'panoramic' ? 'Evacuation time cannot be compared here, because in most runs not all ordered cars get out within the 4 hours simulated.'
        : 'Evacuation time does not change: on a two-way street, removing parking opens the oncoming lane, not a second lane out.')])),
    off: {},
    headline: { label: 'Street segments too narrow for an engine', f: S => S.engineBlockedSegments, dir: -1 },
  },
];
