// Guided view's traffic layer (Eric, 2026-11-12, MASTER session; SOURCE_NOTES GV11). A display rule, not a model change:
// it reads each directed link's queue as the simulator already keeps it (sim.links[].q) and smooths the count of cars
// waiting over model time, so a jam builds and drains on the map instead of blinking on and off at 15 model min/s.
//   waiting   cars on the link that have been there longer than its free-flow time (the unsmoothed layer's count)
//   smoothed  exponential average of waiting with a time constant of QUEUE_TAU_S model seconds
//   shown     a link turns red at QUEUE_ON smoothed cars and stays red until it falls under QUEUE_OFF (hysteresis)
export const QUEUE_TAU_S = 420; // 7 model minutes (display rule)
export const QUEUE_ON = 3, QUEUE_OFF = 2; // cars waiting; 3 is the unsmoothed layer's threshold (js/map.js drawQueues)

export function waiting(sim, L) {
  let w = 0;
  for (const i of L.q) if (sim.t >= sim.v.enter[i] + L.ff) w++;
  return w;
}

export class QueueSmoother {
  constructor() { this.reset(null); }
  reset(sim) { this.sim = sim; this.t = sim ? sim.t : 0; this.s = new Map(); this.on = new Set(); }
  // Advance to the simulator's current model time; returns Map(link id → smoothed waiting cars) and the shown set.
  update(sim) {
    if (sim !== this.sim || sim.t < this.t) this.reset(sim);
    const dt = sim.t - this.t; this.t = sim.t;
    const a = dt > 0 ? 1 - Math.exp(-dt / QUEUE_TAU_S) : 0;
    const now = new Map();
    for (const lid of sim.active) { const w = waiting(sim, sim.links[lid]); if (w) now.set(lid, w); }
    for (const [lid, x] of this.s) {
      const y = x + ((now.get(lid) || 0) - x) * a;
      if (y < 0.25 && !now.has(lid)) { this.s.delete(lid); this.on.delete(lid); } else this.s.set(lid, y);
    }
    for (const [lid, w] of now) if (!this.s.has(lid)) this.s.set(lid, w * a);
    for (const [lid, x] of this.s) { if (x >= QUEUE_ON) this.on.add(lid); else if (x < QUEUE_OFF) this.on.delete(lid); }
    return { s: this.s, on: this.on };
  }
}
