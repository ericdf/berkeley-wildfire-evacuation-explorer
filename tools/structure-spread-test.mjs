#!/usr/bin/env node
// Step 3e option B scratch test (docs/design/structure-spread.md section 4, SOURCE_NOTES PH22). Report only:
// nothing here changes a default or a data file.
//
// Question: if the spread factor in built hill cells followed how closely the buildings stand (step 3a data)
// instead of one fire-zone value, would the fire still match the 1923 timing marks, and how many structures
// would a 1991-like fire reach in its first hour against the record's "almost 800" (USFA-TR-060 p. 51)?
//
// Variants (each keeps the mean factor over the cells it changes, so the severities' calibration is not
// shifted wholesale; only where the fire runs faster or slower changes):
//   proxy      today's fire-zone factor (0.7 in Fire Zone 2)
//   separation factor rises with the share of a cell's structures under 25 ft from the nearest one
//              (weights 1 under 25 ft, 0.6 at 25-50 ft, 0.3 at 50 ft or more; model rule, after NIST TN 2205 p. 28)
//   coverage   factor rises with the cell's building footprint share (Hamada-style; model rule)
// Cells: Fire Zone 2-3 cells holding City footprints (data/model/structures.json). Ember throw keeps the proxy.
//
//   node tools/structure-spread-test.mjs [seeds=3]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const { loadData } = await import('../js/data.js');
const { buildFireGrid, runFire, CELL, inPoly } = await import('../js/fire.js');
const { makeScenarios, SEVERITY } = await import('../js/scenarios.js');
const { toUTM } = await import('./utm.mjs');

const seeds = Array.from({ length: +(process.argv[2] || 3) }, (_, i) => i + 1);
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
if (!data.structures) throw new Error('data/model/structures.json missing: run node tools/build-structures.mjs');
const proxy = buildFireGrid(data), { W, H } = proxy, N = W * H;
const st = data.structures;
if (st.meta.W !== W || st.meta.H !== H) throw new Error('structures.json was built on another grid');

// per-cell structure counts
const n = new Float32Array(N), w = new Float32Array(N), cov = new Float32Array(N), hu = new Float32Array(N);
for (const [c, k, b25, b50, bFar, area] of st.structures) { n[c] = k; w[c] = (b25 * 1 + b50 * 0.6 + bFar * 0.3) / k; cov[c] = area / (CELL * CELL); }
for (const [c, k] of st.housingUnits) hu[c] = k;
const built = []; for (let i = 0; i < N; i++) if (n[i] > 0 && proxy.fuel[i] > 0) built.push(i);

function variant(score) { // factor ∝ score, scaled so the mean over built cells equals the proxy mean there
  const fuel = Float32Array.from(proxy.fuel);
  let mp = 0, ms = 0; for (const i of built) { mp += proxy.fuel[i]; ms += score(i); }
  const k = mp / ms;
  for (const i of built) fuel[i] = Math.min(1.5, score(i) * k);
  return { ...proxy, fuel, spotFuel: proxy.fuel };
}
const VARIANTS = {
  proxy,
  separation: variant(i => w[i]),
  coverage: variant(i => Math.max(0.05, cov[i])),
};

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const center = i => [(i % W + 0.5) * CELL, (Math.floor(i / W) + 0.5) * CELL];
const scen = makeScenarios(data);

// 1923 timing marks, as in tools/fire-validation.mjs §4a
const sc23 = scen.find(s => s.id === 'ref1923'), ring = data.layers.fire1923[0].rings[0];
const ne = ring.reduce((b, p) => (p[0] + p[1] > b[0] + b[1] ? p : b), ring[0]), minX = Math.min(...ring.map(p => p[0]));
const neCell = Math.floor(ne[1] / CELL) * W + Math.floor(ne[0] / CELL);
const west = []; for (let i = 0; i < N; i++) { const [x, y] = center(i); if (x <= minX + 150 && inPoly(x, y, [ring])) west.push(i); }

// 1991-like fire, as in tools/fire-validation.mjs §4b (analysis case: origin is our placement)
const O = data.net.meta.origin, [ox, oy] = toUTM(-122.2205, 37.8625), origin = [ox - O[0], oy - O[1]];

console.log(`built cells changed: ${built.length}; seeds ${seeds.join(',')}`);
for (const [name, g] of Object.entries(VARIANTS)) {
  const t = seeds.map(seed => { const F = runFire(g, sc23, SEVERITY.central, seed);
    const entry = Math.min(...[-1, 0, 1].flatMap(dr => [-1, 0, 1].map(dc => F.arrival[neCell + dr * W + dc])));
    return { entry: Math.round(entry), west: Math.round(Math.min(...west.map(i => F.arrival[i]))) }; });
  const r91 = [];
  for (const wf of [30, 45, 60]) for (const seed of seeds) {
    const F = runFire(g, { id: 'like1991', ignition: origin, windFrom: wf, windMph: 30, durationMin: 240 }, SEVERITY.high, seed);
    const at = T => { let s = 0, u = 0; for (let i = 0; i < N; i++) if (F.arrival[i] <= T) { s += n[i]; u += hu[i]; } return { s, u }; };
    r91.push({ wf, h1: at(60), h2: at(120), h4: at(240) });
  }
  const f = k => med(r91.map(x => x[k].s)), fu = k => med(r91.map(x => x[k].u));
  console.log(`${name.padEnd(10)} 1923 medium: entry ${t.map(x => x.entry).join('/')} min (StoryMap ~150), Shattuck ${t.map(x => x.west).join('/')} min (~300) | ` +
    `1991-like high, median of 30/45/60° × seeds: City structures reached 1 h ${f('h1')}, 2 h ${f('h2')}, 4 h ${f('h4')}; Census housing units 1 h ${fu('h1')}, 2 h ${fu('h2')}, 4 h ${fu('h4')}`);
}
