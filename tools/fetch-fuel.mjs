#!/usr/bin/env node
// LANDFIRE 2025 FBFM40 (40 Scott and Burgan fire behavior fuel models) on the fire grid, and the
// spread factor the opt-in "Fuel: LANDFIRE FBFM40" scenario setting gives each class.
//
//   node tools/fetch-fuel.mjs            # download (if not cached) and rebuild the derived files
//   node tools/fetch-fuel.mjs --offline  # rebuild from the cached GeoTIFF only
//
// Source: LANDFIRE Product Service image service LF2025_FBFM40_CONUS (USGS / USDA Forest Service,
// public domain), exportImage in EPSG:32610 at 30 m, nearest-neighbor resampling by the server from
// LANDFIRE's native 30 m Albers grid (EPSG:5070), on exactly the fire grid's cells (origin = DEM
// xmin/ymin, js/fire.js CELL = 30 m). The download is cached in data/raw/landfire/ (gitignored; the
// derived grid below holds the same codes).
//
// Writes:
//   data/terrain/fbfm40.u8    one byte per fire-grid cell, FBFM40 code (91–204), rows south to north
//                             (the fire grid's order: index = row * W + col, row 0 at the south edge)
//   data/terrain/fbfm40.json  source, version, counts by code, and the spread-factor table
//
// The spread factor (model rule): Rothermel's head-fire rate for the class at Scott and Burgan's
// moisture scenario D2L2 and 5 mi/h midflame wind on flat ground (tools/fuel-models.mjs), divided by
// the mean of that rate over the burnable cells the fire-zone proxy rates 1.0 (wildland), so the
// proxy's wildland cells keep a mean factor of 1.0 and the severities' head spread rates keep their
// meaning (SEVERITY_NOTE, SOURCE_NOTES S11). Factors are capped at CAP. Nonburnable classes: NB1
// (urban or suburban) keeps the fire-zone proxy factor of its cell, since LANDFIRE does not map fuel
// between buildings and the proxy is the simulator's only stand-in for spread through neighborhoods;
// NB3 (agriculture), NB8 (water) and NB9 (bare ground) get 0, as Scott and Burgan define them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTiff } from './tiff.mjs';
import { MODELS, NONBURNABLE, rothermel, D2L2 } from './fuel-models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const { loadData } = await import('../js/data.js');
const { buildFireGrid, CELL, FUEL } = await import('../js/fire.js');

const SERVICE = 'https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2025/LF2025_FBFM40_CONUS/ImageServer';
const RAW = 'data/raw/landfire/LF2025_FBFM40_fire-grid.tif';
const WIND_MPH = 5, CAP = 3;

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const { W, H } = grid, dem = data.dem;
const bbox = [dem.xmin, dem.ymin, dem.xmin + W * CELL, dem.ymin + H * CELL];
const query = { bbox: bbox.join(','), bboxSR: 32610, imageSR: 32610, size: `${W},${H}`, format: 'tiff', pixelType: 'S16', interpolation: 'RSP_NearestNeighbor', compression: 'None', f: 'image' };
const url = `${SERVICE}/exportImage?${new URLSearchParams(query)}`;

if (!fs.existsSync(RAW)) {
  if (process.argv.includes('--offline')) throw new Error(`${RAW} missing`);
  fs.mkdirSync(path.dirname(RAW), { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': 'berkeley-wildfire-evacuation-explorer/0.1' } });
  if (!r.ok) throw new Error(`LANDFIRE exportImage: HTTP ${r.status}`);
  fs.writeFileSync(RAW, Buffer.from(await r.arrayBuffer()));
  fs.writeFileSync(RAW.replace(/\.tif$/, '.meta.json'), JSON.stringify({ service: SERVICE, query, retrieved: new Date().toISOString().slice(0, 10) }, null, 2));
}
const tif = readTiff(fs.readFileSync(RAW));
const tie = tif.tags[33922], scale = tif.tags[33550];
if (tif.width !== W || tif.height !== H || tie[3] !== bbox[0] || tie[4] !== bbox[3] || scale[0] !== CELL) throw new Error('LANDFIRE raster is not on the fire grid');

const codes = new Uint8Array(W * H);
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const v = tif.data[(H - 1 - r) * W + c];
  if (!(v in MODELS) && !(v in NONBURNABLE)) throw new Error(`unexpected FBFM40 value ${v}`);
  codes[r * W + c] = v;
}

// Rothermel rate per class and the normalization over the proxy's wildland cells.
const ros = Object.fromEntries(Object.entries(MODELS).map(([k, p]) => [k, rothermel(p, WIND_MPH).ros]));
let sum = 0, n = 0;
for (let i = 0; i < W * H; i++) if (grid.fuel[i] === 1 && ros[codes[i]] != null) { sum += ros[codes[i]]; n++; }
const ref = sum / n;
const counts = {}; for (const v of codes) counts[v] = (counts[v] || 0) + 1;
const table = {};
for (const [k, p] of Object.entries(MODELS)) table[k] = { code: p[0], rosFtMin: +ros[k].toFixed(3), factor: +Math.min(CAP, ros[k] / ref).toFixed(4), cells: counts[k] || 0 };
for (const [k, nm] of Object.entries(NONBURNABLE)) table[k] = { code: nm, factor: k === '91' ? 'proxy' : 0, cells: counts[k] || 0 };

// What the setting changes, by proxy class (cell-weighted mean factor).
const byProxy = {};
const fz = Object.keys(FUEL);
for (let i = 0; i < W * H; i++) {
  const k = fz[grid.fuelClass[i]], t = table[codes[i]], f = grid.fuel[i] <= 0 ? 0 : t.factor === 'proxy' ? grid.fuel[i] : t.factor; // as js/fire.js withLandfireFuel: DEM water stays 0
  byProxy[k] ??= { cells: 0, proxy: FUEL[k], sum: 0, nb1: 0, zero: 0 };
  const b = byProxy[k]; b.cells++; b.sum += f; if (codes[i] === 91) b.nb1++; if (f === 0) b.zero++;
}
for (const b of Object.values(byProxy)) { b.meanFactor = +(b.sum / b.cells).toFixed(3); delete b.sum; }

fs.writeFileSync('data/terrain/fbfm40.u8', codes);
fs.writeFileSync('data/terrain/fbfm40.json', JSON.stringify({
  product: 'LANDFIRE 2025 (LF2025) 40 Scott and Burgan Fire Behavior Fuel Models, FBFM40, CONUS',
  version: 'LF2025', layer: 'LF2025_FBFM40_CONUS', service: SERVICE, query,
  retrieved: JSON.parse(fs.readFileSync(RAW.replace(/\.tif$/, '.meta.json'))).retrieved,
  license: 'US public domain (USGS / USDA Forest Service LANDFIRE program)',
  grid: { W, H, cell: CELL, xmin: bbox[0], ymin: bbox[1], crs: 'EPSG:32610, shifted so (0, 0) = DEM (xmin, ymin)', encoding: 'uint8 FBFM40 code per cell; rows run south to north (index = row * W + col)' },
  resampling: 'Nearest neighbor by the LANDFIRE image service from the native 30 m Albers grid (EPSG:5070) to the fire grid',
  provenance: {
    category: 'sourced (fuel classes); model rule (spread factors)',
    factorRule: `Rothermel (1972) head-fire rate on flat ground at Scott and Burgan (2005) moisture scenario D2L2 (dead 1-h ${D2L2.m1 * 100}%, 10-h ${D2L2.m10 * 100}%, 100-h ${D2L2.m100 * 100}%, live herbaceous ${D2L2.mHerb * 100}%, live woody ${D2L2.mWoody * 100}%) and ${WIND_MPH} mi/h midflame wind, parameters from RMRS-GTR-153 Table 7 (tools/fuel-models.mjs), divided by the mean rate over the ${n} burnable cells the fire-zone proxy rates 1.0, capped at ${CAP}. NB1 (urban or suburban) keeps the cell's fire-zone proxy factor; NB3, NB8 and NB9 are 0. Wind and slope effects stay the simulator's (js/fire.js), so the factor carries only the fuel's relative rate. Ember throw and landing keep the proxy.`,
    referenceRosFtMin: +ref.toFixed(3),
  },
  spread: table, byProxyClass: byProxy,
}, null, 2) + '\n');
console.log(`fbfm40: ${W}×${H} cells; reference rate ${ref.toFixed(2)} ft/min over ${n} cells`);
console.table(Object.fromEntries(Object.entries(table).filter(([, t]) => t.cells).map(([k, t]) => [`${k} ${t.code}`, { cells: t.cells, ros: t.rosFtMin, factor: t.factor }])));
console.table(byProxy);
