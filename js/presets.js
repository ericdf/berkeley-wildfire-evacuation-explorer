// Simple-view presets: comparisons whose effect pointed the same way in every run tested
// (4 scenarios x low/central/high severity x seeds 1-5, 2026-11-01, rechecked on the final
// network the same day; SOURCE_NOTES "Simple-view presets"). Each preset fixes the scenario and the time of day (per plan where `tods` is set);
// the plans start from DEFAULT_PLAN. Numbers in the text are central-severity medians.
import { DEFAULT_PLAN } from './sim.js';

const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const plan = (name, o = {}) => ({ ...DEFAULT_PLAN, name, ...o });

export const PRESETS = [
  {
    id: 'leaveEarly',
    title: 'Leave early on a Red Flag day',
    question: 'What if half the households in the hills (Fire Zones 2–3) leave on a Red Flag warning, before any fire starts?',
    scenarioId: 'eastWind', tod: 'S6',
    A: plan('A: everyone waits for an order'),
    B: plan('B: half of hill households leave on the Red Flag warning', { earlyShare: 0.5, earlyZones: 'fz23' }),
    watch: 'In Plan B more than a quarter fewer people are still there when embers arrive (about 5,100 against 3,650 in the central case), and the roads clear a minute or so sooner. If only the City\'s smaller Leave Early Zones do it, the drop is about 4%: most hill residents live outside them.',
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'orderSooner',
    title: 'Decide faster',
    question: 'What if the first evacuation order goes out 5 minutes after the fire starts instead of 20?',
    scenarioId: 'ref1923', tod: 'S4',
    A: plan('A: first order 20 min after ignition', { orderDelayMin: 20 }),
    B: plan('B: first order 5 min after ignition', { orderDelayMin: 5 }),
    watch: 'About a fifth fewer people are still there when embers arrive (about 6,800 against 5,450 in the central case). The time to clear the roads hardly changes: the gain is people getting out ahead of the fire, not faster traffic.',
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'timeOfDay',
    title: 'Weekday midday or night',
    question: 'The same fire and the same plan: how much does a weekday afternoon slow the evacuation compared with night?',
    scenarioId: 'eastWind', tod: 'S4', tods: { A: 'S4', B: 'S6' },
    A: plan('A: fall weekday, midday'),
    B: plan('B: fall night'),
    watch: 'On a weekday about 17,200 cars evacuate instead of 15,100, some households wait for a commuter to drive home, and parents pick up children. 90% of cars get out about 13 minutes later (about 105 against 92 min). Both plans are the same; only the time of day differs.',
    headline: { label: 'Minutes until 90% of cars are out', f: S => S.clearP90, dir: -1 },
  },
  {
    id: 'parkingEngines',
    title: 'Parked cars and fire engines',
    question: 'What if hill streets allow parking on one side only?',
    scenarioId: 'eastWind', tod: 'S6',
    A: plan('A: parking as it is today'),
    B: plan('B: parking on one side only in Fire Zones 2–3', { hillsParking: 'oneside' }),
    watch: 'Color streets by "fire-engine access" (Expert view, Map) to see the red streets, where parked cars leave less than an engine\'s width. One-side parking cuts them from about 284 segments to 143. Evacuation time does not change: on a two-way street, removing parking opens the oncoming lane, not a second lane out.',
    headline: { label: 'Street segments too narrow for an engine', f: S => S.engineBlockedSegments, dir: -1 },
  },
];
