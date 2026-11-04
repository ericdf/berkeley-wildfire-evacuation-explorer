// Scenario presets. Every number here is an illustrative model value unless marked
// otherwise; they are listed in the Assumptions & limits panel.
import { toUTM } from '../tools/utm.mjs';

// City Leave Early Zones (Upper Berkeley Hills and Panoramic Hill), from
// https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation (read 2026-11-01).
export const LEAVE_EARLY_ZONES = ['BER-006', 'BER-007', 'BER-008', 'BER-015', 'BER-016', 'BER-017', 'BER-030', 'BER-031', 'BER-057', 'BER-058'];

export const SEVERITY = {
  low:     { label: 'Low',     rosMpm: 7,  windFactor: 0.75, emberM: 300,  spotProb: 0.004, spotDelayMin: 4 },
  central: { label: 'Medium', rosMpm: 14, windFactor: 1.0,  emberM: 800,  spotProb: 0.012, spotDelayMin: 3 },
  high:    { label: 'High',    rosMpm: 28, windFactor: 1.3,  emberM: 1500, spotProb: 0.03,  spotDelayMin: 2, slowAfterMin: 60, slowFactor: 0.2 },
};
export const SEVERITY_NOTE = 'Medium severity ("central" in the code and data files): its head spread rate is calibrated to the City StoryMap\'s 1923 present-day repeat (about 5 h from the eastern edge to Shattuck; SOURCE_NOTES S11); low and high are half and double. High severity slows after its first hour to a fifth of its head spread rate, as the 1991 fire\'s head did ("more than a mile in the first hour", then "only three quarters of a mile in the next seven hours"); fitted to 1991\'s structures burned by 2 and 4 hours (SOURCE_NOTES FV17). Medium and low keep their rate: the 1923 fire kept its pace until the wind changed. Ember distance and spot-fire probability are illustrative. The Evacuation Time Study contains no fire modeling (E31). This is not a fire-behavior model.';

// The Evacuation Time Study's six scenarios (Table 6-5, p. 6-11; SOURCE_NOTES E11).
// Residents are never reduced. commuterShare = households waiting for a returning commuter
// (mobilization C/E instead of D/F); schoolInSession scales child pickup.
// background is a model-rule stand-in for through and non-resident traffic (E12) until employees,
// students and visitors are placed on the network.
export const TIME_OF_DAY = {
  S1: { groups: { employees: 0.96, tourists: 1.28, offCampus: 0.10, onCampus: 0.10, external: 1 }, label: 'S1 · Summer, midweek midday', commuterShare: 0.13, schoolInSession: 0.10, background: 0, note: 'Employees 96%, tourists 128%, college 10%, external traffic 100%.' },
  S2: { groups: { employees: 0.10, tourists: 1.39, offCampus: 0, onCampus: 0.10, external: 1 }, label: 'S2 · Summer, weekend midday', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 139%, college 10%, external 100%.' },
  S3: { night: true, groups: { employees: 0.10, tourists: 0.56, offCampus: 0, onCampus: 0.10, external: 0.40 }, label: 'S3 · Summer, night', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 56%, college 10%, external 40%.' },
  S4: { groups: { employees: 1, tourists: 0.86, offCampus: 1, onCampus: 1, external: 1 }, label: 'S4 · Fall, midweek midday', commuterShare: 0.13, schoolInSession: 1, background: 0, note: 'Employees 100%, tourists 86%, college 100%, school buses 100%, external 100%. The Time Study\'s worst case.' },
  S5: { groups: { employees: 0.10, tourists: 0.93, offCampus: 0, onCampus: 1, external: 1 }, label: 'S5 · Fall, weekend midday', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 93%, college 100% on campus, external 100%.' },
  S6: { night: true, groups: { employees: 0.10, tourists: 0.37, offCampus: 0, onCampus: 1, external: 0.40 }, label: 'S6 · Fall, night', commuterShare: 0.01, schoolInSession: 0, background: 0, note: 'Employees 10%, tourists 37%, college 100% on campus, external 40%.' },
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
// R09 North Berkeley Hills (Table 6-2, p. 6-8): a geographic region, Order zones only.
const R09 = {
  order: [...range('BER', 1, 12), ...range('BER', 15, 21), ...range('BER', 28, 33), 'BER-E040'],
  warning: [],
};
// Time Study 90th / 100th percentile ETE targets, minutes after the order (Tables 7-1, 7-2).
export const ETE_TARGETS = {
  ref1923: { p90: { S1: 145, S2: 110, S3: 105, S4: 175, S5: 110, S6: 105 }, p100: { S1: 220, S2: 205, S3: 205, S4: 250, S5: 205, S6: 205 }, region: 'R02 1923 Fire' },
  panoramic: { p90: { S1: 100, S2: 95, S3: 100, S4: 105, S5: 95, S6: 100 }, p100: { S1: 220, S2: 205, S3: 205, S4: 220, S5: 205, S6: 205 }, region: 'R04 Panoramic Hill' },
  eastWind: { p90: { S1: 125, S2: 115, S3: 105, S4: 140, S5: 115, S6: 105 }, p100: { S1: 220, S2: 205, S3: 205, S4: 220, S5: 205, S6: 205 }, region: 'R05 Fire Zones 2 & 3' },
  northHills: { p90: { S1: 130, S2: 120, S3: 110, S4: 125, S5: 110, S6: 105 }, p100: { S1: 220, S2: 205, S3: 205, S4: 220, S5: 205, S6: 205 }, region: 'R09 North Berkeley Hills' },
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
      calibration: 'Medium-severity head spread rate (14 m/min in wildland, all scenarios) is tuned so the fire reaches the west end of the 1923 footprint (Shattuck) in about 4-5 h (240-302 min over seeds 1-3; StoryMap: about 5 h). Known mismatch: it reaches the 1923 entry point in 38-108 min, earlier than the StoryMap 2.5 h, because the model spreads faster in the hills than in the flats.',
      sources: ['Footprint: City 1923_Archival_Boundary_COB, extended 1.3 km uphill per the City Evacuation StoryMap (July 2025) §3.2',
        'Timing: StoryMap §3.2, about 2.5 h from the eastern edge to Codornices Park, 5 h to Shattuck Ave; 1923 winds were Diablo, 25-40 mph',
        'Orders and warnings: Evacuation Time Study region R02 zone lists (p. 6-6). Default time: S4, fall midweek midday, as in the StoryMap\'s combined fire/traffic run'],
    },
    {
      id: 'eastWind', name: 'Extreme east wind',
      kind: 'illustrative',
      blurb: 'Fire starts in wildland near the ridge at night, in a strong, dry wind from the east-north-east. Embers carry west-south-west, downslope, over hill neighborhoods and toward the flats. All of Fire Zones 2–3 is ordered.',
      ignition: L(-122.2425, 37.8845), ignitionLabel: 'Wildland near Grizzly Peak Blvd (illustrative)',
      windFrom: 60, windMph: 35, durationMin: 240, timeOfDay: 'S6', orderRegion: 'R05',
      sources: ['Orders: City evacuation region R05 "Fire Zones 2 3 Combined" (Time Study region R05)', 'Ignition point is an illustrative model choice',
        'Wind from 60°, east-north-east: of the dry, windy hours at the Oakland North weather station near Grizzly Peak Blvd (hourly mean wind 15 mph or more, humidity 25% or less, June 1992 – October 2026), 71.8% blew from 20–70° and 1.5% from 70–80° (WRCC RAWS records, SOURCE_NOTES FF4). 60° is a model choice inside that range'],
    },
    {
      id: 'panoramic', name: 'Constrained neighborhood: Panoramic Hill',
      kind: 'illustrative',
      blurb: 'Fire starts in the hills above Panoramic Hill, a neighborhood reached by essentially one road (Panoramic Way). Use it to test early departure; a secondary route is a Phase 2 intervention.',
      ignition: L(-122.2410, 37.8728), ignitionLabel: 'Hillside north-east of and above Panoramic Hill (illustrative)',
      windFrom: 45, windMph: 30, durationMin: 240, timeOfDay: 'S4', orders: R04,
      sources: ['Orders and warnings: Evacuation Time Study region R04 zone lists (p. 6-7). The study\'s OAK-E003 to E005 are read as Genasys OKL-003 to OKL-005; their streets come from OpenStreetMap and their residents drive out through Berkeley or down Claremont Av',
        'Single exit at the stop-controlled intersection of Panoramic Way and Prospect St/Canyon Rd (SB 99 report p. 4)', 'Ignition point and wind are illustrative'],
    },
    {
      id: 'eastWindDay', name: 'Extreme east wind, weekday midday',
      kind: 'illustrative',
      blurb: 'Same fire as "Extreme east wind", but on a fall weekday at midday (Time Study S4): some households wait for a commuter to come home, parents pick up children, and there is more other traffic. Compare with the night run.',
      ignition: L(-122.2425, 37.8845), ignitionLabel: 'Wildland near Grizzly Peak Blvd (illustrative)',
      windFrom: 60, windMph: 35, durationMin: 240, timeOfDay: 'S4', orderRegion: 'R05',
      sources: ['Time-of-day behavior from the Time Study (Table 6-5, Table 5-9); background traffic is a model rule; employees and students are not yet placed',
        'Wind from 60°, east-north-east: of the dry, windy hours at the Oakland North weather station near Grizzly Peak Blvd (hourly mean wind 15 mph or more, humidity 25% or less, June 1992 – October 2026), 71.8% blew from 20–70° and 1.5% from 70–80° (WRCC RAWS records, SOURCE_NOTES FF4). 60° is a model choice inside that range'],
    },
    {
      // Added 2026-11-02 so the north hills above Marin Ave have a fire of their own (SOURCE_NOTES P30).
      id: 'northHills', name: 'North hills: fire in Tilden above the Summit',
      kind: 'illustrative',
      blurb: 'Fire starts in Tilden Regional Park east of the Summit (Grizzly Peak Blvd at Spruce St) on a fall night with a strong north-east (Diablo) wind. It burns over the ridge into Cragmont, the Thousand Oaks hills and the streets along Grizzly Peak Blvd down to Fire Station 7, at the edge of Kensington. The City\'s North Berkeley Hills region is ordered.',
      ignition: L(-122.2561, 37.9044), ignitionLabel: 'Wildland in Tilden Regional Park, about 1.2 km east of Grizzly Peak Blvd at Spruce St (illustrative)',
      windFrom: 45, windMph: 33, durationMin: 240, timeOfDay: 'S6', orders: R09,
      sources: ['Orders: Evacuation Time Study region R09 "North Berkeley Hills" zone list (Table 6-2, p. 6-8); the study lists no warning zones for R09',
        'Ignition point, wind and time of day are illustrative model choices: a fall night, when Diablo winds are strongest, as in the east-wind fire'],
    },
  ];
}

// ---- Fire families (opt-in, Guided view "Change the plan" and Expert Compare; docs/design/fire-families.md) ----
// A member is one ignition point × one wind direction; speed, severity, time of day, duration and
// orders stay the fire's. Winds 30°, 45° and 60°: the core of dry, windy hours at the Oakland North
// weather station (20–70° held 71.8% of them, SOURCE_NOTES FF4) and the spread within one Diablo
// event (FF6). Points are tied to historic origins and entry corridors (FF2, FF9–FF11, FF15). Every
// new point is our assumption anchored to the sources named: no source says where the next fire will
// start, and the members are not weighted (there is no source for weights). Coordinates (WGS84) were
// placed on a road or landmark named by the source and checked to lie on a wildland cell of the fire
// grid (fuel ≥ 0.7, js/fire.js buildFireGrid; tests/families.mjs). SOURCE_NOTES FF16.
export const FAMILY_WINDS = [30, 45, 60];
const FAMILY_POINTS = {
  ref1923: [{ id: 'city', current: true, at: 'at the City\'s starting point', label: 'The City\'s 1923 repeat starting point (unchanged; only the wind varies, since the fire reproduces the City\'s scenario, SOURCE_NOTES S11). The fire burns only inside the City\'s 1923 footprint, so the winds vary it less than on the other fires: at medium severity the footprint removes 58% of what the fire would burn without it from 30°, 26% from 45° (today\'s fire) and 40% from 60° (SOURCE_NOTES FF17)' }],
  northHills: [
    { id: 'tilden', current: true, at: 'in Tilden east of the Summit', label: 'Tilden Regional Park, about 1.2 km east of Grizzly Peak Blvd at Spruce St (the fire\'s usual start)' },
    { id: 'anza', lonlat: [-122.2470, 37.8981], at: 'on Wildcat Canyon Rd near Lake Anza', label: 'Wildcat Canyon Rd about 150 m north-east of the shore of Lake Anza',
      source: 'SOURCE_NOTES FF9 (1923 and 1980 fires started in Wildcat Canyon; USFA-TR-060 PDF p. 22, Oakland Draft VMP Table 6) and FF11 (WFIGS "Wildcat" incidents)' },
    { id: 'centennial', lonlat: [-122.2458, 37.8830], at: 'on Grizzly Peak Blvd at Centennial Dr', label: 'Grizzly Peak Blvd at Centennial Dr',
      source: 'SOURCE_NOTES FF11 (WFIGS "Grizzly" incident near Centennial Dr, 2024-07-02 UTC; a 2-acre fireworks fire reported there on July 1, 2024) and FF10 (roadside ignitions on Grizzly Peak Blvd)' },
  ],
  eastWind: [
    { id: 'grizzly', current: true, at: 'in the wildland near Grizzly Peak Blvd', label: 'Wildland near Grizzly Peak Blvd, the turnout corridor (the fire\'s usual start)' },
    { id: 'fishranch', lonlat: [-122.2168, 37.8637], at: 'on Fish Ranch Rd, east of the ridge', label: 'Fish Ranch Rd on the east slope, about 500 m below Grizzly Peak Blvd',
      source: 'SOURCE_NOTES FF9 (the 1970 fire started "on the eastern slope of the hills near Fish Ranch Road", USFA-TR-060 PDF p. 22) and FF11 (five WFIGS "Fish" incidents)' },
  ],
  panoramic: [
    { id: 'strawberry', current: true, at: 'above Panoramic Hill', label: 'Hillside above Panoramic Hill, upper Strawberry Canyon side (the fire\'s usual start)' },
    { id: 'claremont', lonlat: [-122.2179, 37.8684], at: 'at Grizzly Peak Blvd and Claremont Ave', label: 'Upper Claremont Canyon at Grizzly Peak Blvd and Claremont Ave',
      source: 'SOURCE_NOTES FF9 (the 1970 fire jumped Grizzly Peak Blvd into "the upper parts of Grandview and Claremont Canyons", USFA-TR-060 PDF p. 22) and FF2 (XyloPlan entry point in the Claremont Canyon area)' },
  ],
};
FAMILY_POINTS.eastWindDay = FAMILY_POINTS.eastWind;

// The family of a scenario from makeScenarios: [{ id, point, windFrom, ignition, label, at, isDefault }].
// The default member is the fire as it is (its own ignition and wind).
export function familyOf(sc, data) {
  const pts = FAMILY_POINTS[sc.id]; if (!pts) return [{ id: 'default', point: 'default', windFrom: sc.windFrom, ignition: sc.ignition, label: sc.ignitionLabel, at: '', isDefault: true }];
  const O = data.net.meta.origin;
  const winds = FAMILY_WINDS.includes(sc.windFrom) ? FAMILY_WINDS : [...FAMILY_WINDS, sc.windFrom].sort((a, b) => a - b);
  return pts.flatMap(p => {
    const ignition = p.current ? sc.ignition : (([x, y]) => [x - O[0], y - O[1]])(toUTM(...p.lonlat));
    return winds.filter(w => p.current || FAMILY_WINDS.includes(w)).map(w => ({ id: `${p.id}-${w}`, point: p.id, windFrom: w, ignition, label: p.label, at: p.at, lonlat: p.lonlat, source: p.source, isDefault: !!p.current && w === sc.windFrom }));
  });
}
export const defaultMember = (sc, data) => familyOf(sc, data).find(m => m.isDefault).id;
// The scenario a member runs: the fire with the member's ignition and wind. The default member (or
// none) returns the scenario itself, so runs with families off are unchanged.
export function memberScenario(sc, member, data) {
  if (member == null) return sc;
  const m = familyOf(sc, data).find(x => x.id === member);
  if (!m) throw new Error(`no member ${member} in ${sc.id}`);
  if (m.isDefault) return sc;
  return { ...sc, ignition: m.ignition, windFrom: m.windFrom, ignitionLabel: `${m.label} (fire family member, our assumption)`, member: m.id };
}

// The passes of a comparison. Families off: the default member at every severity and seed given.
// Families on: every member at every severity, with enough seeds (1, 2, …) that the total is at least
// minPasses (ref1923 3×3×2 = 18, northHills 9×3×1 = 27, eastWind and panoramic 6×3×1 = 18).
// key: `${fire}|${member}|${sev}|${seed}`; a stack's runs add the stack key after the member.
export function comparisonCases(sc, data, { families = false, severities, seeds, minPasses = 15 }) {
  const fam = familyOf(sc, data);
  const ms = families ? fam : fam.filter(m => m.isDefault);
  const ss = families ? Array.from({ length: Math.max(1, Math.ceil(minPasses / (ms.length * severities.length))) }, (_, i) => i + 1) : seeds;
  return ms.flatMap(m => severities.flatMap(sev => ss.map(seed => ({ member: m.id, sev, seed, key: `${sc.id}|${m.id}|${sev}|${seed}` }))));
}

function convexHull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
