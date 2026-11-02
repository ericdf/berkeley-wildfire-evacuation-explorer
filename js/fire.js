// Illustrative fire and ember overlay. NOT a calibrated fire-behavior model.
//
// The play area is divided into 30 m cells. Fire arrival time is found with a
// shortest-time search (Dijkstra) from the ignition cell, where the time to cross
// into a neighboring cell depends on:
//   - a scenario head spread rate (low / central / high),
//   - wind alignment (elliptical spread shape, length-to-breadth from Anderson 1983),
//   - slope (faster uphill, slower downhill), from the DEM,
//   - a proxy "fuel" factor taken from the City fire zones (not vegetation data).
// Spot fires: when a hill or wildland cell ignites it may throw embers downwind;
// a landing ember can start a new ignition. That is random, so different seeds
// give different fire footprints; the simulator shows the spread across seeds.
// Ember exposure: a cell is under ember exposure from the moment any cell within
// the scenario's ember distance upwind of it is burning.

import { mulberry32, normal } from './rng.js';

export const CELL = 30;
export const LB_MAX = 3.5;

// Proxy spread factors by area (model rule; see assumptions panel).
export const FUEL = { water: 0, flats: 0.25, hillResidential: 0.7, wildlandInterface: 1.0, wildland: 1.0 };

export function buildFireGrid(data) {
  const { dem, Z, layers, net } = data;
  const W = Math.ceil(net.meta.terrain.xmax / CELL), H = Math.ceil(net.meta.terrain.ymax / CELL);
  const elev = new Float32Array(W * H), fuel = new Float32Array(W * H), fuelClass = new Uint8Array(W * H);
  const zone = new Int16Array(W * H).fill(-1), inCity = new Uint8Array(W * H);
  const fz = layers.fireZones.map(z => ({ ...z, bb: bbox(z.rings) }));
  const city = layers.cityBoundary.map(z => ({ ...z, bb: bbox(z.rings) }));
  const zones = layers.evacZones.map((z, i) => ({ i, rings: z.rings, bb: bbox(z.rings) }));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
    const z = demAt(dem, Z, x, y);
    elev[i] = z ?? 0;
    const insideCity = city.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
    inCity[i] = insideCity ? 1 : 0;
    let cls;
    if (z == null || z < 0.5) cls = 'water';
    else {
      const f = fz.find(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
      if (f) cls = f.zone === 3 ? 'wildlandInterface' : f.zone === 2 ? 'hillResidential' : 'flats';
      else if (insideCity) cls = z > 120 ? 'wildland' : 'flats';
      else cls = z > 200 ? 'wildland' : z > 90 ? 'hillResidential' : 'flats';
    }
    fuel[i] = FUEL[cls];
    fuelClass[i] = Object.keys(FUEL).indexOf(cls);
    for (const q of zones) if (inBB(q.bb, x, y) && inPoly(x, y, q.rings)) { zone[i] = q.i; break; }
  }
  return { W, H, elev, fuel, fuelClass, zone, inCity };
}

// Anderson (1983) length-to-breadth ratio from midflame wind speed (mph).
export function lengthToBreadth(wind20ftMph) {
  const U = 0.4 * wind20ftMph;
  // Capped at LB_MAX: on a 30 m grid a very elongated ellipse collapses to a single line of cells.
  return Math.min(LB_MAX, 0.936 * Math.exp(0.2566 * U) + 0.461 * Math.exp(-0.1548 * U) - 0.397);
}

// Run the overlay. Returns arrival and ember-exposure times in minutes (Infinity = never).
export function runFire(grid, sc, sev, seed) {
  const { W, H, elev, fuel } = grid;
  const N = W * H;
  const rand = mulberry32(seed * 7919 + 17);
  const arrival = new Float64Array(N).fill(Infinity); // Float64: heap keys are compared against it
  const ign = Math.min(H - 1, Math.max(0, Math.floor(sc.ignition[1] / CELL))) * W + Math.min(W - 1, Math.max(0, Math.floor(sc.ignition[0] / CELL)));
  const windTo = ((sc.windFrom + 180) % 360) * Math.PI / 180; // compass bearing the wind blows toward
  const dwx = Math.sin(windTo), dwy = Math.cos(windTo);       // unit downwind vector (x east, y north)
  const wind = sc.windMph * sev.windFactor;
  const LB = lengthToBreadth(wind);
  const ecc = Math.sqrt(1 - 1 / (LB * LB));
  const ros = sev.rosMpm * (sc.rosFactor ?? 1);
  const stop = sc.durationMin;
  const clip = sc.clip ? sc.clip.map(z => ({ rings: z.rings, bb: bbox(z.rings) })) : null;
  const allowed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (fuel[i] <= 0) continue;
    if (clip) { const x = (i % W + 0.5) * CELL, y = (Math.floor(i / W) + 0.5) * CELL; if (!clip.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings))) continue; }
    allowed[i] = 1;
  }
  const heap = new MinHeap();
  arrival[ign] = 0; heap.push(0, ign);
  // 16-neighbor stencil (adds knight moves) to reduce grid-direction bias
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];
  let spots = 0;
  while (heap.size) {
    const [t, i] = heap.pop();
    if (t > arrival[i] || t > stop) continue;
    const c = i % W, r = (i / W) | 0;
    for (const [dc, dr] of NB) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
      const j = rr * W + cc;
      if (!allowed[j]) continue;
      const d = Math.hypot(dc, dr) * CELL;
      const cosT = (dc * dwx + dr * dwy) / Math.hypot(dc, dr);
      const windF = (1 - ecc) / (1 - ecc * cosT);
      const tan = (elev[j] - elev[i]) / d;
      const slopeF = tan > 0 ? 1 + 5 * tan * tan : Math.max(0.7, 1 - 0.4 * -tan);
      const f = (fuel[i] + fuel[j]) / 2;
      const rate = ros * windF * slopeF * f;
      if (rate <= 0) continue;
      const tj = t + d / rate;
      if (tj < arrival[j]) { arrival[j] = tj; heap.push(tj, j); }
    }
    // spotting from hill / wildland cells
    if (fuel[i] >= 0.7 && rand() < sev.spotProb) {
      const dist = sev.emberM * Math.sqrt(rand());
      const ang = windTo + normal(rand) * 0.26;
      const cc = c + Math.round(Math.sin(ang) * dist / CELL), rr = r + Math.round(Math.cos(ang) * dist / CELL);
      if (cc >= 0 && rr >= 0 && cc < W && rr < H) {
        const j = rr * W + cc;
        if (allowed[j] && rand() < 0.25 + 0.6 * fuel[j]) {
          const tj = t + sev.spotDelayMin + dist / Math.max(1, wind * 26.8); // ember flight + ignition delay
          if (tj < arrival[j]) { arrival[j] = tj; heap.push(tj, j); spots++; }
        }
      }
    }
  }
  for (let i = 0; i < N; i++) if (arrival[i] > stop) arrival[i] = Infinity;

  // Ember exposure: min arrival over sample points upwind within the ember distance.
  const ember = new Float32Array(N).fill(Infinity);
  const steps = [];
  for (let d = CELL * 2; d <= sev.emberM; d += CELL * 3) for (const lat of [-0.2, 0, 0.2])
    steps.push([Math.round((-dwx * d + dwy * lat * d) / CELL), Math.round((-dwy * d - dwx * lat * d) / CELL)]);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c;
    if (elev[i] < 0.5) continue;
    let m = arrival[i];
    for (const [dc, dr] of steps) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
      const a = arrival[rr * W + cc];
      if (a + 1 < m) m = a + 1;
    }
    ember[i] = m;
  }
  return { arrival, ember, spots, LB, W, H };
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
