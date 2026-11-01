// Simple-view presets: Plan A vs Plan B comparisons whose effect points the same way in
// every seed and severity tested (see SOURCE_NOTES, "Simple-view presets"). Each preset fixes
// the scenario and time of day; the plans start from DEFAULT_PLAN.
import { DEFAULT_PLAN } from './sim.js';

const exposed = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
const plan = (name, o = {}) => ({ ...DEFAULT_PLAN, name, ...o });

export const PRESETS = [
  {
    id: 'leaveEarly',
    title: 'Leave early on a Red Flag day',
    question: 'What if half the households in the Leave Early Zones leave before a fire starts?',
    scenarioId: 'eastWind', tod: 'S6',
    A: plan('A: everyone waits for an order'),
    B: plan('B: half of Leave Early Zones leave on the Red Flag warning', { earlyShare: 0.5 }),
    watch: 'Watch the hill zones near the ignition: in Plan B fewer households are still home when embers arrive. The time to clear the roads barely changes, because the people who left early were never in the traffic.',
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'orderSooner',
    title: 'Decide faster',
    question: 'What if the first evacuation order goes out 5 minutes after ignition instead of 20?',
    scenarioId: 'eastWind', tod: 'S6',
    A: plan('A: first order 20 min after ignition', { orderDelayMin: 20 }),
    B: plan('B: first order 5 min after ignition', { orderDelayMin: 5 }),
    watch: 'Watch how many households are still home when embers reach their street.',
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
  {
    id: 'parkingEngines',
    title: 'Parked cars and fire engines',
    question: 'What if hill streets allow parking on one side only?',
    scenarioId: 'eastWind', tod: 'S6',
    A: plan('A: parking as it is today'),
    B: plan('B: parking on one side only in Fire Zones 2–3', { hillsParking: 'oneside' }),
    watch: 'Color streets by "fire-engine access" and watch the red streets, where parked cars leave less than an engine\'s width. Evacuation time hardly changes: on a two-way street, removing parking opens the oncoming lane, not a second lane out.',
    headline: { label: 'Street segments too narrow for an engine', f: S => S.engineBlockedSegments, dir: -1 },
  },
  {
    id: 'panoramic',
    title: 'Panoramic Hill: one road out',
    question: 'Panoramic Hill has one way out. What if most households there leave on a Red Flag day?',
    scenarioId: 'panoramic', tod: 'S6',
    A: plan('A: everyone waits for an order'),
    B: plan('B: three in four Leave Early households leave on the Red Flag warning', { earlyShare: 0.75 }),
    watch: 'Watch the queue on Panoramic Way and how many people are still on the hill when embers arrive.',
    headline: { label: 'People still there when embers arrived', f: exposed, dir: -1 },
  },
];
