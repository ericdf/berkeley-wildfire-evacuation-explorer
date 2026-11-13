// Guided view's traffic layer (js/queue-display.js; SOURCE_NOTES GV11): how often streets switch between red and not red
// during a watched run, before (each frame's raw queue, as js/map.js drawQueues draws it in Expert view) and after
// smoothing. Samples every FRAME_S model seconds: one browser frame at 15 model min/s and 60 frames per second.
//   node tests/queue-flicker.mjs [fire ...]     (default: the six Guided-view fires; today's plan, fall night, medium, seed 1)
// Fails if smoothing does not cut on/off switches by at least 80% on every fire.
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN } from '../js/sim.js';
import { QueueSmoother, waiting, QUEUE_ON, QUEUE_TAU_S } from '../js/queue-display.js';

const FRAME_S = 15;
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), scen = makeScenarios(data);
const fires = process.argv.slice(2).length ? process.argv.slice(2) : ['eastWind', 'ref1923', 'panoramic', 'northHills', 'quake', 'westWind'];
let fail = 0;
for (const id of fires) {
  const sc = scen.find(s => s.id === id);
  const sim = new Evacuation(data, grid, runFire(grid, sc, SEVERITY.central, 1), sc, 'central', { ...DEFAULT_PLAN }, 1, TIME_OF_DAY.S6);
  const Q = new QueueSmoother(), rawOn = new Set(), flips = { raw: 0, smooth: 0 }, linksRaw = new Set(), linksSmooth = new Set();
  let smoothOn = new Set(), next = 0;
  while (sim.t < sim.end) {
    sim.step();
    if (sim.t < next) continue;
    next = sim.t + FRAME_S;
    const nowRaw = new Set([...sim.active].filter(l => waiting(sim, sim.links[l]) >= QUEUE_ON));
    for (const l of new Set([...nowRaw, ...rawOn])) if (nowRaw.has(l) !== rawOn.has(l)) { flips.raw++; linksRaw.add(l); }
    rawOn.clear(); for (const l of nowRaw) rawOn.add(l);
    const on = new Set(Q.update(sim).on);
    for (const l of new Set([...on, ...smoothOn])) if (on.has(l) !== smoothOn.has(l)) { flips.smooth++; linksSmooth.add(l); }
    smoothOn = on;
  }
  const cut = 1 - flips.smooth / Math.max(1, flips.raw);
  const ok = cut >= 0.8;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: on/off switches ${flips.raw} on ${linksRaw.size} links (raw) → ${flips.smooth} on ${linksSmooth.size} links (smoothed, ${QUEUE_TAU_S / 60} model min); ${Math.round(100 * cut)}% fewer`);
}
process.exit(fail ? 1 : 0);
