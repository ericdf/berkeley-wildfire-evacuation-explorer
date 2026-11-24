// Illustrative fire and ember overlay. NOT a calibrated fire-behavior model.
//
// The play area is divided into 30 m cells. Fire arrival time is found with a
// shortest-time search (Dijkstra) from the ignition cell, where the time to cross
// into a neighboring cell depends on:
//   - a scenario head spread rate (low / central / high) at a reference wind of WIND_REF_MPH,
//   - wind speed: the head rate scales with Rothermel's (1972) wind factor on hill and wildland cells and with
//     Hamada's urban factor on the built-up flats (headWind, headWindUrban below),
//   - wind alignment (elliptical spread shape, length-to-breadth from Anderson 1983),
//   - slope (faster uphill, slower downhill), from the DEM,
//   - a proxy "fuel" factor taken from the City fire zones (not vegetation data), or, with the
//     opt-in scenario setting "Fuel: LANDFIRE FBFM40", a factor per Scott and Burgan fuel model
//     (withLandfireFuel below; data/terrain/fbfm40.json, tools/fetch-fuel.mjs).
// Spot fires: when a cell ignites it may throw embers downwind (built-up flats at a quarter of the chance of hill
// and wildland cells), most of them a short way; a landing ember can start a new ignition. That is random, so different seeds
// give different fire footprints; the simulator shows the spread across seeds.
// Ember exposure: a cell is under ember exposure once the ember-throwing cells burning upwind of it,
// weighted by how near they are, add up to a set share of what a fully burning upwind reach would
// send (emberExposure below).

import { mulberry32, normal } from './rng.js';

export const CELL = 30;
// The fire model's version: change it whenever a change here or in SEVERITY moves where or when the fire
// burns. Stored tables record the version they ran on (tools/goal-combos.mjs meta.fireModel), and the page
// says so when a table predates the current one. 2026-11-04: high severity slows after its first hour
// (SOURCE_NOTES FV17) and the proxy fuel follows the 2025 fire zones (FV18). 2026-11-24: the head rate and the
// ember reach rise with wind speed, high severity never spreads slower than medium, spot fires land mostly near
// and ember exposure is weighted by distance (SOURCE_NOTES FW1–FW12).
export const FIRE_MODEL = '2026-11-24b';
export const LB_MAX = 3.5;

// Proxy spread factors by area (model rule; see assumptions panel). The zones are the 2025 Fire Code's
// (SOURCE_NOTES FV18): the Panoramic and Grizzly Peak Mitigation Zones (data/model/fire-zones-2025.json) are
// wildlandInterface; the rest of the hill fire zones, the Hills Mitigation Zone, is hillResidential. No City
// layer draws the 2025 Hills zone, so it keeps the 2013 Fire Zones 2–3 outline less the two new zones.
// opts.zones = '2013' rebuilds the earlier grid (Fire Zone 3 as wildlandInterface), for comparisons only.
export const FUEL = { water: 0, flats: 0.25, hillResidential: 0.7, wildlandInterface: 1.0, wildland: 1.0 };

export function buildFireGrid(data, opts = {}) {
  const { dem, Z, layers, net } = data;
  const W = Math.ceil(net.meta.terrain.xmax / CELL), H = Math.ceil(net.meta.terrain.ymax / CELL);
  const elev = new Float32Array(W * H), fuel = new Float32Array(W * H), fuelClass = new Uint8Array(W * H);
  const zone = new Int16Array(W * H).fill(-1), inCity = new Uint8Array(W * H);
  const fz = layers.fireZones.map(z => ({ ...z, bb: bbox(z.rings) }));
  const use2013 = opts.zones === '2013' || !data.fireZones2025;
  const mz = use2013 ? [] : data.fireZones2025.zones.map(z => ({ ...z, bb: bbox(z.rings) }));
  const city = layers.cityBoundary.map(z => ({ ...z, bb: bbox(z.rings) }));
  const zones = layers.evacZones.map((z, i) => ({ i, rings: z.rings, bb: bbox(z.rings) }));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
    // the light set's 30 m grid holds exactly these samples (tools/build-terrain-lite.mjs; tests/terrain-lite.mjs)
    const z = data.elev30 ? (v => v === -32768 ? null : v / 10)(data.elev30[i]) : demAt(dem, Z, x, y);
    elev[i] = z ?? 0;
    const insideCity = city.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
    inCity[i] = insideCity ? 1 : 0;
    let cls;
    if (z == null || z < 0.5) cls = 'water';
    else {
      const f = fz.find(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
      const m = mz.find(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
      if (m) cls = 'wildlandInterface';
      else if (f && !use2013) cls = f.zone === 2 || f.zone === 3 ? 'hillResidential' : 'flats';
      else if (f) cls = f.zone === 3 ? 'wildlandInterface' : f.zone === 2 ? 'hillResidential' : 'flats';
      else if (insideCity) cls = z > 120 ? 'wildland' : 'flats';
      else cls = z > 200 ? 'wildland' : z > 90 ? 'hillResidential' : 'flats';
    }
    fuel[i] = FUEL[cls];
    fuelClass[i] = Object.keys(FUEL).indexOf(cls);
    for (const q of zones) if (inBB(q.bb, x, y) && inPoly(x, y, q.rings)) { zone[i] = q.i; break; }
  }
  return { W, H, elev, fuel, fuelClass, zone, inCity, fuelZones: use2013 ? '2013' : '2025' };
}

// Opt-in fuel source (scenario setting, Expert view; off by default). Returns a copy of the proxy
// grid whose spread factor comes from LANDFIRE FBFM40: each burnable fuel model's factor from
// data/terrain/fbfm40.json (a model rule: Rothermel's relative rate, tools/fetch-fuel.mjs); NB1
// (urban or suburban) keeps the cell's proxy factor; NB3, NB8 and NB9 are 0; cells the DEM marks as
// water stay 0. Ember throw and landing keep the proxy factor (spotFuel), so the setting changes
// only how fast the front crosses each cell. Every other array is shared with the proxy grid.
export function withLandfireFuel(grid, codes, meta) {
  const fuel = new Float32Array(grid.W * grid.H);
  for (let i = 0; i < fuel.length; i++) {
    const t = meta.spread[codes[i]];
    fuel[i] = grid.fuel[i] <= 0 || !t ? 0 : t.factor === 'proxy' ? grid.fuel[i] : t.factor;
  }
  return { ...grid, fuel, spotFuel: grid.fuel, fuelSource: 'landfire' };
}

// The fire grid for a scenario's fuel setting ('proxy', the default, or 'landfire'); the LANDFIRE grid is
// built once per proxy grid. Without the LANDFIRE files the proxy grid is used.
const LF = new WeakMap();
export function fireGridFor(grid, data, fuel) {
  if (fuel !== 'landfire' || !data.fuel40) return grid;
  if (!LF.has(grid)) LF.set(grid, withLandfireFuel(grid, data.fuel40.codes, data.fuel40.meta));
  return LF.get(grid);
}

// A severity may slow its head after a set time (model rule, SOURCE_NOTES FV17, FW6): after sev.slowAfterMin minutes
// every spread rate is multiplied by sev.slowFactor and spot fires start with probability multiplied by
// sev.slowSpotFactor. Only high severity ("1991 pace") uses it: the 1991 head went "more than a mile in the
// first hour" and "only three quarters of a mile in the next seven hours" (USFA-TR-060 PDF p. 59). The 1923
// fire, which medium severity is calibrated to, kept its pace until the wind changed, so medium does not slow.
// A severity with sev.floor (high, whose floor is medium) never crosses a cell slower than the floor severity would
// on the same crossing, before or after its slowdown, so the stronger pace is never the slower one (FW6).
// Time to cross distance d at rate r starting at time t, at rate r2 (<= r) from time T on. Exact for the step, and
// later starts never arrive earlier (r2 <= r), so the shortest-time search stays valid.
function crossTime(t, d, r, T, r2) {
  if (r2 === r || t + d / r <= T) return d / r;
  if (t >= T) return d / r2;
  return (T - t) + (d - r * (T - t)) / r2;
}

// Head spread rate against wind speed (model rule, SOURCE_NOTES FW2): Rothermel's (1972) wind factor phi_w =
// C * U^B * (beta / beta_op)^-E, U the midflame wind in ft/min, here 0.4 of the 20 ft wind (the midflame ratio
// lengthToBreadth uses), with Scott and Burgan's (2005) fuel model TL6 at moisture D2L2 (tools/fuel-models.mjs,
// derived: C, B, E and beta / beta_op below), without Rothermel's wind limit (Andrews, Cruz and Rothermel 2013).
// The head rate is the severity's rate times (1 + phi_w(U)) / (1 + phi_w(WIND_REF_MPH)): each severity keeps its
// rate at the reference wind, the 1923 repeat's 32 mph, so the 1923 calibration (SOURCE_NOTES S11) still holds.
export const WIND_REF_MPH = 32;
export const ROTHERMEL_WIND = { model: 'TL6', C: 0.001455, B: 1.5044, E: 0.3568, rel: 3.371 };
export function headWind(mph20) {
  const { C, B, E, rel } = ROTHERMEL_WIND, U = 88 * 0.4 * Math.max(0, mph20);
  return 1 + C * U ** B * rel ** -E;
}
// Built-up cells (the proxy's flats, factor 0.25) take an urban wind law instead (Eric, 2026-11-24; SOURCE_NOTES
// FW4): Hamada's downwind spread factor 1 + 0.1 V + 0.007 V^2, V the wind in m/s (here the 20 ft wind), normalized at
// the same reference wind. From 7 to 30 mph it rises about 2.6 times, against about 7.3 times for Rothermel's.
export function headWindUrban(mph20) { const V = 0.44704 * Math.max(0, mph20); return 1 + 0.1 * V + 0.007 * V * V; }
// Built-up for the wind law and for ember weight: a burnable cell whose proxy factor is under BUILT_MAX (the flats,
// 0.25). The boundary sits between 0.25 and 0.7 because the grid holds fuel in a Float32Array, where 0.7 is stored as
// 0.69999999 and a test against 0.7 itself would class hill residential as built-up (Codex review of PR #102; FW15).
export const BUILT_MAX = 0.5;
// Ember weight of a cell (Eric, 2026-11-24; FW10): hill residential, wildland interface and wildland 1, built-up flats
// 0.25 (embers from burning buildings), water 0. Used both for spot-fire starts and for ember exposure.
export const URBAN_EMBER = 0.25;
export const emberWeight = s => (s >= BUILT_MAX ? 1 : s > 0 ? URBAN_EMBER : 0);
// Ember reach (model rule, FW8): the severity's ember distance at the reference wind, in proportion to wind speed (in
// Albini's 1979 spotting model a lofted firebrand drifts downwind in proportion to the wind at treetop height).
export const emberReach = (sev, windMph) => sev.emberM * Math.max(0, windMph) / WIND_REF_MPH;
// Ember exposure threshold (model rule, FW10): the share of a full upwind reach's ember weight at which a cell
// counts as exposed. A broad front reaches it at half the reach, where three quarters of its embers have landed.
export const EMBER_SHARE = 0.25;

// Anderson (1983) length-to-breadth ratio from midflame wind speed (mph).
export function lengthToBreadth(wind20ftMph) {
  const U = 0.4 * wind20ftMph;
  // Capped at LB_MAX: on a 30 m grid a very elongated ellipse collapses to a single line of cells.
  return Math.min(LB_MAX, 0.936 * Math.exp(0.2566 * U) + 0.461 * Math.exp(-0.1548 * U) - 0.397);
}

// The run's wind as segments { from, windFrom, windMph, windTo, dwx, dwy, wind, LB, ecc }. Without
// sc.windSchedule there is one segment from minute 0 with sc.windFrom and sc.windMph. A schedule's entries are
// { fromMin, windFrom, windMph }; the first must start at minute 0.
export function windSegments(sc, sev) {
  const list = sc.windSchedule?.length ? sc.windSchedule : [{ fromMin: 0, windFrom: sc.windFrom, windMph: sc.windMph }];
  if (list[0].fromMin !== 0) throw new Error('windSchedule must start at fromMin 0');
  return list.map((w, k) => {
    if (k && w.fromMin <= list[k - 1].fromMin) throw new Error('windSchedule must be sorted by fromMin');
    const windTo = ((w.windFrom + 180) % 360) * Math.PI / 180; // compass bearing the wind blows toward
    const wind = w.windMph, LB = lengthToBreadth(wind); // the scenario's wind at every severity (FW16)
    // head: the head rate's wind factor against the reference wind (headWind); reach: ember reach (emberReach)
    const head = headWind(wind) / headWind(WIND_REF_MPH), reach = emberReach(sev, w.windMph);
    const headU = headWindUrban(wind) / headWindUrban(WIND_REF_MPH);
    // unit downwind vector (x east, y north)
    return { from: w.fromMin, windFrom: w.windFrom, windMph: w.windMph, windTo, dwx: Math.sin(windTo), dwy: Math.cos(windTo), wind, LB, ecc: Math.sqrt(1 - 1 / (LB * LB)), head, headU, reach };
  });
}

// Run the overlay. Returns arrival and ember-exposure times in minutes (Infinity = never).
export function runFire(grid, sc, sev, seed) {
  const { W, H, elev, fuel } = grid;
  const spot = grid.spotFuel ?? fuel; // the proxy factor; only the LANDFIRE setting (withLandfireFuel) gives a separate one
  const N = W * H;
  const rand = mulberry32(seed * 7919 + 17);
  const arrival = new Float64Array(N).fill(Infinity); // Float64: heap keys are compared against it
  // One start (sc.ignition), or several at once (sc.ignitions: a list, or a function of the seed that draws them
  // from its own stream, so the spread and spot-fire draws below stay as they were; js/scenarios.js quakeIgnitions).
  const starts = typeof sc.ignitions === 'function' ? sc.ignitions(seed) : sc.ignitions ?? [sc.ignition];
  const cellAt = p => Math.min(H - 1, Math.max(0, Math.floor(p[1] / CELL))) * W + Math.min(W - 1, Math.max(0, Math.floor(p[0] / CELL)));
  // Wind: one direction and speed (sc.windFrom, sc.windMph), or a schedule that changes during the run
  // (sc.windSchedule, a list of { fromMin, windFrom, windMph } sorted by fromMin; windSegments below). Each
  // crossing, spot throw and ember reach uses the wind in force when it starts.
  const segs = windSegments(sc, sev);
  const seg0 = segs[0];
  const segAt = t => { let k = 0; while (k + 1 < segs.length && t >= segs[k + 1].from) k++; return k; };
  const ros = sev.rosMpm * (sc.rosFactor ?? 1);
  const stop = sc.durationMin;
  // after T1 the rate is k1 times as fast; with a floor severity and no slowFactor, k1 = 0 leaves the floor's rate (FW6)
  const T1 = sev.slowAfterMin ?? Infinity, k1 = sev.slowFactor ?? (sev.floor ? 0 : 1), ks = sev.slowSpotFactor ?? 1;
  // the floor severity's segments and rate (high: medium), on the same wind (FW6)
  const fsegs = sev.floor ? windSegments(sc, sev.floor) : null, rosF = sev.floor ? sev.floor.rosMpm * (sc.rosFactor ?? 1) : 0;
  const clip = sc.clip ? sc.clip.map(z => ({ rings: z.rings, bb: bbox(z.rings) })) : null;
  const allowed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (fuel[i] <= 0) continue;
    if (clip) { const x = (i % W + 0.5) * CELL, y = (Math.floor(i / W) + 0.5) * CELL; if (!clip.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings))) continue; }
    allowed[i] = 1;
  }
  const heap = new MinHeap();
  for (const p of starts) { const ign = cellAt(p); if (arrival[ign] > 0) { arrival[ign] = 0; heap.push(0, ign); } }
  // 16-neighbor stencil (adds knight moves) to reduce grid-direction bias
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];
  let spots = 0;
  while (heap.size) {
    const [t, i] = heap.pop();
    if (t > arrival[i] || t > stop) continue;
    const c = i % W, r = (i / W) | 0;
    // With a schedule the search stays a valid shortest-time search because a burning cell keeps burning: a
    // crossing may start at t or at any later wind change, so each neighbor is offered the earliest of those
    // starts (ki = the segment in force at t, then each later segment from its first minute). A later start can
    // then never undercut an earlier one, which is the property Dijkstra needs; without the extra starts a wind
    // shift toward a neighbor could leave it with an arrival later than the fire could really reach it.
    // Without a schedule there is one segment and only the start at t, as before.
    const ki = segAt(t);
    for (const [dc, dr] of NB) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
      const j = rr * W + cc;
      if (!allowed[j]) continue;
      const d = Math.hypot(dc, dr) * CELL;
      const tan = (elev[j] - elev[i]) / d;
      const slopeF = tan > 0 ? 1 + 5 * tan * tan : Math.max(0.7, 1 - 0.4 * -tan);
      const f = (fuel[i] + fuel[j]) / 2;
      const ui = spot[i] < BUILT_MAX, uj = spot[j] < BUILT_MAX; // built-up ends of the crossing take the urban wind law
      for (let k = ki; k < segs.length; k++) {
        const S = segs[k], t0 = k === ki ? t : S.from;
        if (t0 > stop || t0 >= arrival[j]) break;
        const cosT = (dc * S.dwx + dr * S.dwy) / Math.hypot(dc, dr);
        const hd = ((ui ? S.headU : S.head) + (uj ? S.headU : S.head)) / 2;
        const windF = hd * (1 - S.ecc) / (1 - S.ecc * cosT);
        let rate = ros * windF * slopeF * f, rate2 = rate * k1;
        if (fsegs) { const Fs = fsegs[k], hf = ((ui ? Fs.headU : Fs.head) + (uj ? Fs.headU : Fs.head)) / 2, rf = rosF * hf * (1 - Fs.ecc) / (1 - Fs.ecc * cosT) * slopeF * f; if (rf > rate) rate = rf; if (rf > rate2) rate2 = rf; }
        if (rate <= 0) break;
        const tj = t0 + crossTime(t0, d, rate, T1, rate2);
        if (tj < arrival[j]) { arrival[j] = tj; heap.push(tj, j); }
      }
    }
    // spotting from hill / wildland cells
    const { windTo, wind, reach } = segs[ki];
    if (spot[i] > 0 && rand() < sev.spotProb * emberWeight(spot[i]) * (t > T1 ? ks : 1)) {
      // landing distance: density falling linearly to zero at the reach, so three quarters land in its near half (FW9)
      const dist = reach * (1 - Math.sqrt(rand()));
      const ang = windTo + normal(rand) * 0.26;
      const cc = c + Math.round(Math.sin(ang) * dist / CELL), rr = r + Math.round(Math.cos(ang) * dist / CELL);
      if (cc >= 0 && rr >= 0 && cc < W && rr < H) {
        const j = rr * W + cc;
        if (allowed[j] && rand() < 0.25 + 0.6 * spot[j]) {
          const tj = t + sev.spotDelayMin + dist / Math.max(1, wind * 26.8); // ember flight + ignition delay
          if (tj < arrival[j]) { arrival[j] = tj; heap.push(tj, j); spots++; }
        }
      }
    }
  }
  for (let i = 0; i < N; i++) if (arrival[i] > stop) arrival[i] = Infinity;

  const ember = emberExposure(grid, arrival, segs, stop, sev.emberShare ?? EMBER_SHARE);
  return { arrival, ember, spots, LB: seg0.LB, W, H, starts };
}

// Ember exposure (model rule, SOURCE_NOTES FW10, FW11). Sample points upwind of each cell, every 90 m from 60 m out to
// the wind segment's ember reach and 0.2 of the distance to either side, stand for the ground that can send embers
// to it. Each burning sample sends embers with its ember weight (emberWeight: hill and wildland cells 1, the built-up
// flats 0.25, the same weight that scales spot-fire starts). A burning sample at distance d adds (1 - d / reach) times
// its weight, the landing density of the spot-fire rule; the cell is exposed one minute after the sample that brings
// the sum to EMBER_SHARE of the weight all samples would give if all were burning wildland. A cell the front reaches
// is exposed then at the latest. With a schedule, each wind segment [from, until) has its own direction and reach; a
// cell burning at time a sends embers along it from max(a, from) on, if it was burning before the segment ended; the
// exposure is the earliest over the segments.
export function emberExposure(grid, arrival, segs, stop, share = EMBER_SHARE) {
  const { W, H, elev } = grid, spot = grid.spotFuel ?? grid.fuel, N = W * H;
  const ember = Float32Array.from(arrival);
  const te = new Float64Array(256), tw = new Float64Array(256);
  segs.forEach((S, k) => {
    const until = k + 1 < segs.length ? segs[k + 1].from : Infinity;
    if (S.from > stop || S.reach < CELL * 2) return;
    const steps = []; let full = 0;
    for (let d = CELL * 2; d <= S.reach; d += CELL * 3) for (const lat of [-0.2, 0, 0.2]) {
      const w = 1 - d / S.reach; full += w;
      steps.push([Math.round((-S.dwx * d + S.dwy * lat * d) / CELL), Math.round((-S.dwy * d - S.dwx * lat * d) / CELL), w]);
    }
    // A tie counts as reaching the threshold, deliberately (FW18): a reach whose every sample is a burning cell of the
    // flats sums exactly URBAN_EMBER × full, which equals the threshold at EMBER_SHARE = URBAN_EMBER = 0.25, so the flats
    // alone expose a cell only once their whole upwind reach is burning. The relative tolerance keeps that tie, and a split
    // into equal wind segments (which sums in another order), from flipping on floating-point rounding.
    const need = share * full * (1 - 1e-9);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (elev[i] < 0.5) continue;
      let n = 0, sum = 0;
      for (const [dc, dr, w] of steps) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
        const j = rr * W + cc, s = emberWeight(spot[j]);
        if (s <= 0) continue;
        const a = arrival[j];
        if (a >= until) continue;
        te[n] = (a > S.from ? a : S.from) + 1; tw[n] = w * s; sum += tw[n]; n++;
      }
      if (sum < need) continue;
      // insertion sort by time, then the time the running sum reaches the threshold
      for (let p = 1; p < n; p++) { const e = te[p], w = tw[p]; let q = p - 1; while (q >= 0 && te[q] > e) { te[q + 1] = te[q]; tw[q + 1] = tw[q]; q--; } te[q + 1] = e; tw[q + 1] = w; }
      let acc = 0;
      for (let p = 0; p < n; p++) { acc += tw[p]; if (acc >= need) { if (te[p] < ember[i]) ember[i] = te[p]; break; } }
    }
  });
  for (let i = 0; i < N; i++) if (elev[i] < 0.5 && arrival[i] === Infinity) ember[i] = Infinity;
  return ember;
}

// Earliest time the fire is within ~radiusM of each cell (square min filter).
export function minFilter(arr, W, H, radiusM) {
  const R = Math.round(radiusM / CELL);
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  const pass = (src, dst, len, count, idx) => {
    for (let k = 0; k < count; k++) {
      const dq = []; // indices into line, values increasing
      let head = 0;
      for (let p = 0; p < len + R; p++) {
        if (p < len) { const v = src[idx(k, p)]; while (dq.length > head && src[idx(k, dq[dq.length - 1])] >= v) dq.pop(); dq.push(p); }
        const q = p - R;
        if (q >= 0) { while (dq[head] < q - R) head++; dst[idx(k, q)] = src[idx(k, dq[head])]; }
      }
    }
  };
  pass(arr, tmp, W, H, (r, c) => r * W + c);
  pass(tmp, out, H, W, (c, r) => r * W + c);
  return out;
}

// Earliest time the fire is within radiusM of each cell, measured between cell centers (a circle,
// unlike minFilter's square): each row of the disk is a horizontal window of its own half-width.
export function diskMinFilter(arr, W, H, radiusM) {
  const R = Math.floor(radiusM / CELL), out = new Float32Array(W * H).fill(Infinity), row = new Float32Array(W);
  const half = Array.from({ length: R + 1 }, (_, dy) => Math.floor(Math.sqrt(Math.max(0, radiusM * radiusM - (dy * CELL) ** 2)) / CELL));
  for (const w of new Set(half)) {
    const dys = []; half.forEach((h, dy) => { if (h === w) { dys.push(dy); if (dy) dys.push(-dy); } });
    for (let r = 0; r < H; r++) {
      // sliding minimum of row r over [c - w, c + w]
      const dq = []; let head = 0, any = false;
      for (let p = 0; p < W + w; p++) {
        if (p < W) { const v = arr[r * W + p]; if (v < Infinity) any = true; while (dq.length > head && arr[r * W + dq[dq.length - 1]] >= v) dq.pop(); dq.push(p); }
        const q = p - w;
        if (q >= 0) { while (dq[head] < q - w) head++; row[q] = arr[r * W + dq[head]]; }
      }
      if (!any) continue;
      for (const dy of dys) {
        const rr = r - dy; if (rr < 0 || rr >= H) continue;
        for (let c = 0; c < W; c++) if (row[c] < out[rr * W + c]) out[rr * W + c] = row[c];
      }
    }
  }
  return out;
}

export const cellOf = (grid, x, y) => {
  const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  return c < 0 || r < 0 || c >= grid.W || r >= grid.H ? -1 : r * grid.W + c;
};

// ---- helpers ----
export function demAt(dem, Z, x, y) {
  const c = Math.floor(x / dem.resolution), r = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
  if (c < 0 || r < 0 || c >= dem.width || r >= dem.height) return null;
  const v = Z[r * dem.width + c];
  return v === -32768 ? null : v / 10;
}
export function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
export const inBB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const inPoly = (x, y, rings) => inRing(x, y, rings[0]) && !rings.slice(1).some(h => inRing(x, y, h));

export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = [k[0], v[0]];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let m = 2 * i + 1; if (m >= n) break; if (m + 1 < n && k[m + 1] < k[m]) m++; if (k[m] >= lk) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
