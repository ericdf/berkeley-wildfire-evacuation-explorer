// Shared pieces of the street-widening screening (egress plan step 2b): width standards, the
// engine-reach search, and the two run-time changes to a street segment (widen it, or ban parking
// on it). Used by tools/widening.mjs and tools/widening-sim.mjs. data/model/network.json is never
// changed; the harness edits edge objects in memory and restores them.

import { MinHeap } from '../js/fire.js';

export const FT = 0.3048;
const r2 = v => Math.round(v * 100) / 100;

// Width standards, in meters of pavement for a segment that keeps `sides` parked sides (0, 1, 2).
// Car width per parked side is data/assumptions.json parking.parkedCarWidthM (8 ft, SB 99 p. 2–3).
export function standards(A, sides) {
  const car = A.parking.parkedCarWidthM, lane = A.access.movingLaneM, code = A.access.fireCodeClearM;
  return {
    // A: an engine passes (10 ft clear, SB 99 p. 2–3) with today's parked sides kept
    engine: r2(lane + sides * car),
    // B: 20 ft unobstructed (California Fire Code §503.2.1) with today's parked sides kept
    fireCode: r2(code + sides * car),
    // C: two 10 ft lanes plus parking on both sides (a full hill street section; assumption)
    full: r2(2 * lane + 2 * car),
  };
}

// Sides residents park in the nominal status-quo state (js/parking.js with seed null): both sides
// where they fit while leaving parking.range.minLeftForCarsM, perfect parking, no bad parking jobs.
export function nominalSides(A, e) {
  const R = A.parking.range, car = A.parking.parkedCarWidthM, W = e.widthM;
  let s = { both: 2, one: 1, none: 0 }[e.parking] ?? 2;
  if (W == null) return null;
  while (s > 0 && W - s * car < R.minLeftForCarsM) s--;
  return s;
}

// The two changes the harness applies, as edge copies. Lanes: the network builder gives every
// hill Local street one lane each way whatever its width (assumption lanes.hillsLocal) and other
// classes the City's PAV_LANES count, so a widening leaves lanes as they are; the gain is clear
// width, which js/parking.js turns into moving lanes (two at 20 ft clear, else one shared lane).
const PARK = ['none', 'one', 'both'];
export function widenedEdge(A, e, widthM, keepSides) {
  const car = A.parking.parkedCarWidthM, clear = Math.max(0, widthM - keepSides * car);
  return { ...e, widthM, widthSrc: 'assumption:widening (tools/widening-core.mjs)', widthWas: e.widthM,
    parking: PARK[keepSides], parkingSrc: `assumption:widening keeps ${keepSides} parked side${keepSides === 1 ? '' : 's'}, posted`,
    narrow: false, clearWidthM: r2(clear), clearWidthSrc: 'derived:width-minus-parking',
    effLanes: clear >= 2 * A.access.movingLaneM ? 2 : clear >= A.access.movingLaneM ? 1 : 0,
    belowFireCodeWidth: clear < A.access.fireCodeClearM, engineBlocked: clear < A.access.engineClearM, widened: true };
}
export function noParkingEdge(A, e) {
  const clear = e.widthM ?? null;
  return { ...e, parking: 'none', parkingSrc: 'assumption:no parking on this segment (red curb), tools/widening-core.mjs',
    clearWidthM: clear, clearWidthSrc: 'derived:width-minus-parking',
    effLanes: clear == null ? null : clear >= 2 * A.access.movingLaneM ? 2 : clear >= A.access.movingLaneM ? 1 : 0,
    belowFireCodeWidth: clear != null && clear < A.access.fireCodeClearM, engineBlocked: clear != null && clear < A.access.engineClearM, redCurb: true };
}
// Apply { edgeId: edge copy } to data.net.edges in place; returns an undo function.
export function applyEdges(data, repl) {
  const edges = data.net.edges, was = new Map();
  for (const [id, e] of Object.entries(repl)) { was.set(+id, edges[+id]); edges[+id] = e; }
  return () => { for (const [id, e] of was) edges[id] = e; };
}

// Engine drive times from Berkeley's stations at ignition, with no fire and no traffic: the rule of
// js/sim.js engineTimes({ fire: false }) with `pass[eid]` standing in for the plan's engineOK.
export function engineDist(data, pass) {
  const net = data.net, edges = net.edges, acc = data.A.access, nN = net.nodes.length;
  const dist = new Float64Array(nN).fill(Infinity), prev = new Int32Array(nN).fill(-1), heap = new MinHeap();
  for (const s of data.stationNodes) { dist[s] = 0; heap.push(0, s); }
  while (heap.size) {
    const [d, n] = heap.pop(); if (d > dist[n]) continue;
    for (const eid of data.nodeEdges[n]) {
      const e = edges[eid];
      if (e.mode !== 'vehicle' || e.disconnected) continue;
      if (e.barrier?.closed && !e.barrier.engines) continue;
      if (!pass[eid]) continue;
      const c = e.len / (e.speedMps * 1.15) + (e.barrier?.closed ? acc.barrierDelayS : 0);
      const m = e.a === n ? e.b : e.a, nd = d + c;
      if (nd < dist[m]) { dist[m] = nd; prev[m] = eid; heap.push(nd, m); }
    }
  }
  return { dist, prev };
}
// Per segment: is it within the 5-minute standard (a home counts at the nearer end of its segment).
export function reachedWithin(data, dist) {
  const lim = data.A.access.engineServiceMin * 60, edges = data.net.edges, out = new Uint8Array(edges.length);
  for (const e of edges) out[e.id] = Math.min(dist[e.a], dist[e.b]) <= lim ? 1 : 0;
  return out;
}
