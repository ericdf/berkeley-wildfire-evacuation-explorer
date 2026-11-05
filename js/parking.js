// Parking state per street segment: which sides are parked, how much pavement the parked
// cars take, and where one bad parking job pinches the street. Shared by the simulation,
// the map and the network builder.
//
// Evidence (SOURCE_NOTES, Eric's field photos 2026-11-01): on hill streets parking is often on
// one side only (a fence, bank or bins line the other side), some cars sit partly or wholly
// off the pavement, and one wide vehicle parked away from the curb can set the clear width
// for a whole block. The City's Narrow_Roads "width with parking" is computed as pavement
// minus 7 ft per parked side with perfect parking, so here it is treated as one possible
// state, not a measurement.
//
// Draws come from an RNG seeded by the run's seed only, in a fixed order with a fixed number
// of draws per segment, so Plan A and Plan B see the same parked cars.

import { mulberry32 } from './rng.js';

// Plan setting, separate from the parking plan above so the two combine (SOURCE_NOTES PH15).
export const ENFORCE_PLANS = {
  none: 'Status quo: posted signs and daylighting not enforced',
  signs: 'Enforce posted no-parking signs',
  daylight: 'Enforce daylighting (no parking 20 ft before crosswalks)',
  both: 'Enforce posted no-parking signs and daylighting',
};

export const PARKING_PLANS = {
  both: 'Status quo: parking varies by block',
  oneside: 'One side only in Fire Zones 2–3',
  tight: 'Status quo, but enforce parking tight to the curb',
  narrow: 'No parking on City “narrow roads”',
  none: 'No parking anywhere in Fire Zones 2–3',
};

// Night rule for narrow hill streets (Eric, 2026-11-05; SOURCE_NOTES EV1–EV3, NP1–NP4). At night, on hill
// segments from parking.range.night.narrowMinM to narrowMaxM wide (17–24 ft, the counted range), residents park
// both sides on a share narrowBothShareHills of segments (draw u[4]) and leave one pinch of narrowPinchClearM
// (one parked car's width, 8 ft) for the whole segment, whatever the street's width and the off-pavement draw.
// The other segments keep the 8 ft rule. Day and wider streets are unchanged.
export const NIGHT_RULES = {
  count2026: 'Both sides on most narrow hill streets, leaving one car\'s width (field count, 2026-11-05)',
  pre20261105: 'Pre-2026-11-05 rule: residents leave 8 ft for a car (one side on most narrow streets)',
};

// seed = null gives the nominal state: both sides where they fit, perfect parking.
// opts.nightRule: 'pre20261105' restores the night rule used before 2026-11-05 (Expert view setting).
export function parkingState(data, plan, seed, tod, opts) {
  const A = data.A, P = A.parking, acc = A.access, edges = data.net.edges, nE = edges.length;
  // Night cases (Time Study S3, S6): residents are home, so curbs are fuller (parking.range.night).
  const R = tod?.night ? { ...P.range, ...P.range.night } : P.range;
  const NR = tod?.night && opts?.nightRule !== 'pre20261105' && P.range.night?.narrowBothShareHills != null ? P.range.night : null;
  const rand = seed == null ? null : mulberry32(seed * 7919 + 17);
  const S = {
    sides: new Int8Array(nE).fill(-1), offPave: new Uint8Array(nE), pinchM: new Float32Array(nE), nightPinch: new Uint8Array(nE),
    clear: new Float32Array(nE).fill(NaN), eff: new Int8Array(nE).fill(-1), engineOK: new Uint8Array(nE).fill(1),
    stats: { nightPinched: 0, parkingChanged: 0, engineFixed: 0, engineBlocked: 0, pinched: 0, oneSide: 0, twoSides: 0, hillsKnown: 0, signsEnforced: 0, daylightCleared: 0 },
  };
  const mode = plan?.hillsParking || 'both';
  const enf = plan?.parkingEnforce || 'none', enfSigns = (enf === 'signs' || enf === 'both') && data.signSides, enfDay = (enf === 'daylight' || enf === 'both') && data.cornerEnds;
  const dayM = (A.parking.enforce?.daylightFt ?? 20) * 0.3048;
  for (const e of edges) {
    // fixed number of draws per segment, used or not
    const u = rand ? [rand(), rand(), rand(), rand(), rand()] : [1, 1, 1, 1, 1];
    if (e.mode !== 'vehicle') continue;
    const hills = e.fireZone === 2 || e.fireZone === 3;
    const W = e.widthM;
    // sides residents would park (status quo)
    let want = { both: 2, one: 1, none: 0 }[e.parking] ?? 2;
    if (want === 2 && hills) want = u[0] < R.noParkingShareHills ? 0 : u[0] < R.noParkingShareHills + R.oneSideShareHills ? 1 : 2;
    // per-side footprint on the pavement; a side may be partly off the pavement
    const off = hills && u[1] < R.offPavementShare ? 1 : 0;
    const foot = k => k * P.parkedCarWidthM - (k > 0 && off ? R.offPavementSavesM : 0);
    // residents keep parking only while a car can still get by
    let base = want;
    if (W != null) while (base > 0 && W - foot(base) < R.minLeftForCarsM) base--;
    // night rule on narrow hill streets: both sides with a one-car pinch on a share of segments (u[4])
    const night2 = NR && hills && W != null && W >= NR.narrowMinM && W <= NR.narrowMaxM && (e.parking ?? 'both') === 'both' && u[4] < NR.narrowBothShareHills;
    if (night2) base = 2;
    // plan rules
    let sides = base;
    if (hills && mode === 'none') sides = 0;
    if (hills && mode === 'narrow' && e.narrow) sides = 0;
    if (hills && mode === 'oneside') sides = Math.min(sides, 1);
    // enforcement (plan setting): a signed side keeps no cars; daylighting takes curb at each corner end
    if (enfSigns && data.signSides[e.id]) { const signed = (data.signSides[e.id] & 1) + (data.signSides[e.id] >> 1); const s2 = Math.min(sides, 2 - signed); if (s2 < sides) S.stats.signsEnforced++; sides = s2; }
    // Daylighting: at each corner end one parked side loses dayM of curb. Two parked sides: each loses dayM
    // with two corner ends, one side with one. One parked side: it takes every corner's dayM. A side whose
    // loss covers the whole segment is cleared.
    let curbM = sides * e.len; // parked curb length left, all sides
    if (enfDay && sides > 0 && data.cornerEnds[e.id]) {
      const ce = data.cornerEnds[e.id];
      const loss = sides === 2 ? (ce === 2 ? [dayM, dayM] : [dayM, 0]) : [dayM * ce];
      const left = loss.filter(L => L < e.len);
      if (left.length < sides) { S.stats.daylightCleared++; sides = left.length; }
      curbM = left.reduce((a, L) => a + e.len - L, 0);
    }
    if (sides !== base) S.stats.parkingChanged++;
    // one bad parking job (wide vehicle, far from the curb) somewhere on the segment
    let pinch = 0;
    if (sides > 0 && rand && mode !== 'tight') {
      const cars = Math.max(1, Math.round(curbM / R.curbMPerCar));
      const pAny = 1 - (1 - R.badJobPerCar) ** cars;
      if (u[2] < pAny) pinch = R.badJobExtraM[0] + u[3] * (R.badJobExtraM[1] - R.badJobExtraM[0]);
    }
    // the night pinch is the whole segment's clear width while both sides stay parked; no bad job narrows it further
    const nightPinch = night2 && sides === 2;
    if (nightPinch) pinch = 0;
    S.sides[e.id] = sides; S.offPave[e.id] = sides > 0 ? off : 0; S.pinchM[e.id] = pinch; S.nightPinch[e.id] = nightPinch ? 1 : 0;
    if (nightPinch) S.stats.nightPinched++;
    if (hills && W != null && sides >= 0) { S.stats.hillsKnown++; if (sides === 1) S.stats.oneSide++; if (sides === 2) S.stats.twoSides++; }
    if (pinch) S.stats.pinched++;
    if (W == null) continue;
    const clear = nightPinch ? Math.min(W, NR.narrowPinchClearM) : Math.max(0, W - foot(sides) - pinch);
    S.clear[e.id] = clear;
    S.eff[e.id] = clear >= 2 * acc.movingLaneM ? 2 : clear >= acc.movingLaneM ? 1 : 0;
    S.engineOK[e.id] = clear >= acc.engineClearM ? 1 : 0;
    if (!S.engineOK[e.id]) S.stats.engineBlocked++;
    if (sides < base && S.engineOK[e.id] && (night2 ? NR.narrowPinchClearM : W - foot(base) - pinch) < acc.engineClearM) S.stats.engineFixed++;
  }
  return S;
}
