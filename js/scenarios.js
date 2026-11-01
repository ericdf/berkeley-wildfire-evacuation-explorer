// Scenario presets. Every number here is an illustrative game value unless marked
// otherwise; they are listed in the Assumptions & limits panel.
import { toUTM } from '../tools/utm.mjs';

// City Leave Early Zones (Upper Berkeley Hills and Panoramic Hill), from
// https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation (read 2026-11-01).
export const LEAVE_EARLY_ZONES = ['BER-006', 'BER-007', 'BER-008', 'BER-015', 'BER-016', 'BER-017', 'BER-030', 'BER-031', 'BER-057', 'BER-058'];

export const SEVERITY = {
  low:     { label: 'Low',     rosMpm: 7,  windFactor: 0.75, emberM: 300,  spotProb: 0.004, spotDelayMin: 4 },
  central: { label: 'Central', rosMpm: 14, windFactor: 1.0,  emberM: 800,  spotProb: 0.012, spotDelayMin: 3 },
  high:    { label: 'High',    rosMpm: 28, windFactor: 1.3,  emberM: 1500, spotProb: 0.03,  spotDelayMin: 2 },
};
export const SEVERITY_NOTE = 'Central head spread rate is calibrated to the City StoryMap\'s 1923 present-day repeat (about 5 h from the eastern edge to Shattuck; SOURCE_NOTES S11); low and high are half and double. Ember distance and spot-fire probability are illustrative. The Evacuation Time Study contains no fire modelling (E31). This is not a fire-behaviour model.';

// The Evacuation Time Study's six scenarios (Table 6-5, p. 6-11; SOURCE_NOTES E11).
// Residents are never reduced. commuterShare = households waiting for a returning commuter
// (mobilization C/E instead of D/F); schoolInSession scales child pickup.
// background is a game-rule stand-in for through and non-resident traffic (E12) until employees,
// students and visitors are placed on the network.
export const TIME_OF_DAY = {
  S1: { groups: { employees: 0.96, tourists: 1.28, offCampus: 0.10, onCampus: 0.10, external: 1 }, label: 'S1 · Summer, midweek midday', commuterShare: 0.13, schoolInSession: 0.10, background: 0, note: 'Employees 96%, tourists 128%, college 10%, external traffic 100%.' },
  S2: { groups: { employees: 0.10, tourists: 1.39, offCampus: 0, onCampus: 0.10, external: 1 }, label: 'S2 · Summer, weekend midday', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 139%, college 10%, external 100%.' },
  S3: { groups: { employees: 0.10, tourists: 0.56, offCampus: 0, onCampus: 0.10, external: 0.40 }, label: 'S3 · Summer, night', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 56%, college 10%, external 40%.' },
  S4: { groups: { employees: 1, tourists: 0.86, offCampus: 1, onCampus: 1, external: 1 }, label: 'S4 · Fall, midweek midday', commuterShare: 0.13, schoolInSession: 1, background: 0, note: 'Employees 100%, tourists 86%, college 100%, school buses 100%, external 100%. The Time Study\'s worst case.' },
  S5: { groups: { employees: 0.10, tourists: 0.93, offCampus: 0, onCampus: 1, external: 1 }, label: 'S5 · Fall, weekend midday', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 93%, college 100% on campus, external 100%.' },
  S6: { groups: { employees: 0.10, tourists: 0.37, offCampus: 0, onCampus: 1, external: 0.40 }, label: 'S6 · Fall, night', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 37%, college 100% on campus, external 40%.' },
};
export const TIME_NOTE = 'Scenario definitions follow the 2025 Evacuation Time Study (Table 6-5). What changes by case: the share of households waiting for a returning commuter, child pickup on school days, and the share of employees, visitors, college students and I-80 through traffic present (Time Study vehicle counts, placed by area).';

// Zone lists from the Time Study (SOURCE_NOTES E2, E3).
const range = (pre, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${pre}-E${String(a + i).padStart(3, '0')}`);
const R02 = {
  order: [...range('BER', 12, 13), ...range('BER', 15, 20), ...range('BER', 26, 33), ...range('BER', 38, 43), ...range('BER', 57, 59), ...range('LBL', 1, 6), 'OKL-E001', 'OKL-E002'],
  warning: [...range('BER', 7, 10), 'BER-E021', 'BER-E022', 'BER-E025', 'BER-E037', 'BER-E044', ...range('BER', 54, 56), 'BER-E060', 'BER-E066', 'BER-E073', 'OKL-E004', 'ALB-E006'],
};
const R04 = {
  order: ['OAK-E003', 'OAK-E004', 'OAK-E005', 'BER-E013', 'BER-E058', 'BER-E059', 'BER-E066'],
  warning: ['OAK-E006', 'OAK-E007', 'OAK-E009', 'BER-E041', 'BER-E055', 'BER-E057', 'BER-E060', 'BER-E073', 'BER-E077'],
};
// Time Study 90th / 100th percentile ETE targets, minutes after the order (Tables 7-1, 7-2).
export const ETE_TARGETS = {
  ref1923: { p90: { S1: 145, S2: 110, S3: 105, S4: 175, S5: 110, S6: 105 }, p100: { S1: 220, S2: 205, S3: 205, S4: 250, S5: 205, S6: 205 }, region: 'R02 1923 Fire' },
  panoramic: { p90: { S1: 100, S2: 95, S3: 100, S4: 105, S5: 95, S6: 100 }, p100: { S1: 220, S2: 205, S3: 205, S4: 220, S5: 205, S6: 205 }, region: 'R04 Panoramic Hill' },
  eastWind: { p90: { S1: 125, S2: 115, S3: 105, S4: 140, S5: 115, S6: 105 }, p100: { S1: 220, S2: 205, S3: 205, S4: 220, S5: 205, S6: 205 }, region: 'R05 Fire Zones 2 & 3' },
};

export function makeScenarios(data) {
  const O = data.net.meta.origin;
  const L = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
  // 1923 present-day repeat (StoryMap §3.2, SOURCE_NOTES S10-S11): the City's archival
  // footprint, extended 1.3 km uphill (north-east, the direction the Diablo wind came from)
  // to today's edge of development, where the fire now enters the neighborhoods.
  const ring = data.layers.fire1923[0]?.rings[0] || [[0, 0]];
  const SHIFT = 1300 / Math.SQRT2;
  const footprint = [{ rings: [convexHull([...ring, ...ring.map(([x, y]) => [x + SHIFT, y + SHIFT])])] }];
  const ne = ring.reduce((b, p) => (p[0] + p[1] > b[0] + b[1] ? p : b), ring[0]);
  return [
    {
      id: 'ref1923', name: 'Reference: 1923 fire, present-day repeat',
      kind: 'historical reference',
      blurb: 'The City\'s "1923 Berkeley Fire Repeat": the 1923 fire path, starting 1.3 km farther uphill where neighborhoods now begin, pushed south-west by a Diablo wind. The City orders everything from the eastern edge to Sacramento St, Marin Ave to campus. A historical reference for comparing plans, not a prediction.',
      ignition: [ne[0] + SHIFT * 0.97, ne[1] + SHIFT * 0.97], ignitionLabel: 'Present-day eastern edge, 1.3 km uphill of the 1923 entry point',
      windFrom: 45, windMph: 32, durationMin: 360, timeOfDay: 'S4', clip: footprint,
      orders: R02,
      calibration: 'Central head spread rate (14 m/min in wildland, all scenarios) is tuned so the fire reaches the west end of the 1923 footprint (Shattuck) in about 4-5 h (240-302 min over seeds 1-3; StoryMap: about 5 h). Known mismatch: it reaches the 1923 entry point in 38-108 min, earlier than the StoryMap 2.5 h, because the model spreads faster in the hills than in the flats.',
      sources: ['Footprint: City 1923_Archival_Boundary_COB, extended 1.3 km uphill per the City Evacuation StoryMap (July 2025) §3.2',
        'Timing: StoryMap §3.2, about 2.5 h from the eastern edge to Codornices Park, 5 h to Shattuck Ave; 1923 winds were Diablo, 25-40 mph',
        'Orders and warnings: Evacuation Time Study region R02 zone lists (p. 6-6). Default time: S4, fall midweek midday, as in the StoryMap\'s combined fire/traffic run'],
    },
    {
      id: 'eastWind', name: 'Extreme east wind',
      kind: 'illustrative',
      blurb: 'Fire starts in wildland near the ridge during a strong, dry east wind at night. Embers carry west, downslope, over hill neighborhoods and toward the flats. All of Fire Zones 2–3 is ordered.',
      ignition: L(-122.2425, 37.8845), ignitionLabel: 'Wildland near Grizzly Peak Blvd (illustrative)',
      windFrom: 75, windMph: 35, durationMin: 240, timeOfDay: 'S6', orderRegion: 'R05',
      sources: ['Orders: City evacuation region R05 "Fire Zones 2 3 Combined" (Time Study region R05)', 'Ignition point and wind are illustrative game choices'],
    },
    {
      id: 'panoramic', name: 'Constrained neighborhood: Panoramic Hill',
      kind: 'illustrative',
      blurb: 'Fire starts in the hills above Panoramic Hill, a neighborhood reached by essentially one road (Panoramic Way). Use it to test early departure; a secondary route is a Phase 2 intervention.',
      ignition: L(-122.2410, 37.8728), ignitionLabel: 'Hillside north-east of and above Panoramic Hill (illustrative)',
      windFrom: 45, windMph: 30, durationMin: 240, timeOfDay: 'S4', orders: R04,
      sources: ['Orders and warnings: Evacuation Time Study region R04 zone lists (p. 6-7). The Oakland zones have no streets in our network, so their residents are not modelled',
        'Single exit at the stop-controlled intersection of Panoramic Way and Prospect St/Canyon Rd (SB 99 report p. 4)', 'Ignition point and wind are illustrative'],
    },
    {
      id: 'eastWindDay', name: 'Extreme east wind, weekday midday',
      kind: 'illustrative',
      blurb: 'Same fire as "Extreme east wind", but on a fall weekday at midday (Time Study S4): some households wait for a commuter to come home, parents pick up children, and there is more other traffic. Compare with the night run.',
      ignition: L(-122.2425, 37.8845), ignitionLabel: 'Wildland near Grizzly Peak Blvd (illustrative)',
      windFrom: 75, windMph: 35, durationMin: 240, timeOfDay: 'S4', orderRegion: 'R05',
      sources: ['Time-of-day behaviour from the Time Study (Table 6-5, Table 5-9); background traffic is a game rule; employees and students are not yet placed'],
    },
  ];
}

function convexHull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
