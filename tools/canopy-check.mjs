#!/usr/bin/env node
// Canopy check for the LANDFIRE default-fuel decision (SOURCE_NOTES PH13, PH27). Report only: reads LANDFIRE 2025
// canopy base height (CBH) and canopy bulk density (CBD) on the fire grid and summarizes them over the burnable
// cells of the LANDFIRE FBFM40 grid (data/terrain/fbfm40.*), by fuel group. Writes nothing.
//
// Why: the LANDFIRE fuel setting rates timber litter (TL) as slow surface fuel, while in 1991 eucalyptus and pine
// crowned (fire-validation section 1, Limits). Low canopy base height with dense canopy is the usual screen for
// where surface fire can move into the crowns. Units follow LANDFIRE's encoding: CBH in meters × 10, CBD in
// kg/m³ × 100. The screen below (CBH ≤ 2 m and CBD ≥ 0.10 kg/m³) is a model rule for this check, not a fire model.
//
//   node tools/canopy-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTiff } from './tiff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/terrain/fbfm40.json'), 'utf8'));
const codes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'data/terrain/fbfm40.u8')));
const { W, H } = meta.grid, q = meta.query;

async function layer(name) { // same bbox and size as the FBFM40 export, so cells line up; rows returned north first
  const u = `https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2025/${name}/ImageServer/exportImage?` + new URLSearchParams({ ...q, bboxSR: String(q.bboxSR), imageSR: String(q.imageSR) });
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'berkeley-wildfire-simulator/0.1' }, signal: AbortSignal.timeout(120000) }); if (r.ok) {
      const img = readTiff(Buffer.from(await r.arrayBuffer()));
      if (img.width !== W || img.height !== H) throw new Error(`${name}: ${img.width}×${img.height}, expected ${W}×${H}`);
      const out = new Int16Array(W * H); // flip to rows south to north, like fbfm40.u8
      for (let r2 = 0; r2 < H; r2++) for (let c = 0; c < W; c++) out[r2 * W + c] = img.data[(H - 1 - r2) * W + c];
      return out; } } catch (e) { if (k === 3) throw e; }
    await new Promise(res => setTimeout(res, 3000 * (k + 1)));
  }
}
const cbh = await layer('LF2025_CBH_CONUS'), cbd = await layer('LF2025_CBD_CONUS');
const group = c => c < 100 ? null : c < 120 ? 'grass (GR)' : c < 140 ? 'grass-shrub (GS)' : c < 160 ? 'shrub (SH)' : c < 180 ? 'timber understory (TU)' : c < 200 ? 'timber litter (TL)' : 'slash-blowdown (SB)';
const G = new Map();
for (let i = 0; i < W * H; i++) {
  const g = group(codes[i]); if (!g) continue;
  const h = cbh[i] / 10, d = cbd[i] / 100; // LANDFIRE encodings; 0 = no canopy
  const t = G.get(g) || { n: 0, canopy: 0, low: 0, dense: 0, screen: 0, hs: [], ds: [] };
  t.n++; if (d > 0) { t.canopy++; t.hs.push(h); t.ds.push(d); if (h <= 2) t.low++; if (d >= 0.10) t.dense++; if (h <= 2 && d >= 0.10) t.screen++; }
  G.set(g, t);
}
// The same screen by fuel model for the timber classes, with each model's spread factor under the LANDFIRE setting.
const SP = (() => { const p = meta.provenance?.spread ?? meta.spread; return typeof p === 'string' ? null : p; })();
const byCode = new Map();
for (let i = 0; i < W * H; i++) { const c = codes[i]; if (c < 160 || c >= 200) continue;
  const t = byCode.get(c) || { n: 0, screen: 0 }; t.n++; if (cbh[i] / 10 <= 2 && cbd[i] / 100 >= 0.10) t.screen++; byCode.set(c, t); }
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log('LANDFIRE 2025 canopy over burnable FBFM40 cells (30 m), by fuel group');
for (const [g, t] of [...G].sort((a, b) => b[1].n - a[1].n))
  console.log(`  ${g}: ${t.n} cells; with canopy ${t.canopy} (${(100 * t.canopy / t.n).toFixed(0)}%); median CBH ${med(t.hs)} m, median CBD ${med(t.ds)} kg/m³; CBH ≤ 2 m ${t.low}; CBD ≥ 0.10 ${t.dense}; both ${t.screen} (${(100 * t.screen / t.n).toFixed(1)}% of the group)`);
console.log('Timber models: cells passing the screen, and the spread factor the LANDFIRE setting gives them (data/terrain/fbfm40.json)');
for (const [c, t] of [...byCode].sort((a, b) => a[0] - b[0])) console.log(`  ${SP?.[c]?.code ?? c}: ${t.screen} of ${t.n}; factor ${SP?.[c]?.factor ?? 'see fbfm40.json'}`);

