#!/usr/bin/env node
// Build the simulator's elevation grid from USGS 3DEP 1-meter lidar DEM tiles.
//
//   node tools/fetch-dem.mjs [overview_level=2]
//
// The 1 m tiles are Cloud Optimized GeoTIFFs with internal overviews
// (level 0 = 1 m, 1 = 2 m, 2 = 4 m, 3 = 8 m). We read one overview level with
// HTTP range requests instead of downloading ~2 GB of full-resolution tiles.
// Sources are applied in priority order: the 2021 Alameda County lidar first,
// then the 2018 NoCAL Wildfires lidar to fill the Contra Costa side of the ridge.
//
// Writes:
//   data/terrain/dem.i16   int16 little-endian, elevation in decimeters, -32768 = no data,
//                          rows run north to south
//   data/terrain/dem.json  grid metadata + provenance
// To use a DEM you obtained yourself instead, see README "Replacing the elevation raster".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM, AREA_LONLAT } from './utm.mjs';
import { lzwDecode } from './tiff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVEL = Number(process.argv[2] ?? 2);
const RES = 2 ** LEVEL;
const S3 = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects';
const SOURCES = [
  { project: 'CA_AlamedaCounty_2021_B21', label: 'USGS 3DEP 1 m DEM, CA_AlamedaCounty_2021_B21 (lidar 2021, published 2022-08-10)',
    tiles: ['x55y419', 'x55y420', 'x56y419', 'x56y420', 'x57y419', 'x57y420'].map(t => `USGS_1M_10_${t}_CA_AlamedaCounty_2021_B21.tif`) },
  { project: 'CA_NoCAL_Wildfires_B5b_2018', label: 'USGS 3DEP 1 m DEM, CA_NoCAL_Wildfires_B5b_2018 (lidar 2018, published 2020-03-18)',
    tiles: ['x55y419', 'x55y420', 'x56y419', 'x56y420', 'x57y419', 'x57y420'].map(t => `USGS_1m_${t}_CA_NoCAL_Wildfires_B5b_2018.tif`) },
];

// Output grid in UTM 10N, aligned to whole meters.
const corners = [[AREA_LONLAT.west, AREA_LONLAT.south], [AREA_LONLAT.west, AREA_LONLAT.north],
  [AREA_LONLAT.east, AREA_LONLAT.south], [AREA_LONLAT.east, AREA_LONLAT.north]].map(([lo, la]) => toUTM(lo, la));
const xmin = Math.floor(Math.min(...corners.map(c => c[0])) / RES) * RES;
const xmax = Math.ceil(Math.max(...corners.map(c => c[0])) / RES) * RES;
const ymin = Math.floor(Math.min(...corners.map(c => c[1])) / RES) * RES;
const ymax = Math.ceil(Math.max(...corners.map(c => c[1])) / RES) * RES;
const W = (xmax - xmin) / RES, H = (ymax - ymin) / RES;
const grid = new Float32Array(W * H).fill(NaN);
const filledBy = new Uint8Array(W * H);

async function range(url, start, end) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 404 || r.status === 403) return null;
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`range fetch failed ${url}`);
}

// Parse every IFD in the COG header (fetch more if the header is long).
async function readHeader(url) {
  let buf = await range(url, 0, 1 << 20);
  if (!buf) return null;
  const u16 = o => buf.readUInt16LE(o), u32 = o => buf.readUInt32LE(o);
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };
  const ifds = [];
  let ifd = u32(4);
  while (ifd) {
    const n = u16(ifd), t = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
      const off = SIZE[type] * cnt <= 4 ? e + 8 : u32(e + 8);
      if (off + SIZE[type] * cnt > buf.length) buf = Buffer.concat([buf, await range(url, buf.length, off + SIZE[type] * cnt + 65536)]);
      const v = [];
      for (let k = 0; k < cnt; k++) v.push(type === 3 ? u16(off + 2 * k) : type === 4 ? u32(off + 4 * k)
        : type === 12 ? buf.readDoubleLE(off + 8 * k) : buf[off + k]);
      t[tag] = type === 2 ? Buffer.from(v).toString('latin1').replace(/\0$/, '') : v;
    }
    ifds.push(t);
    ifd = u32(ifd + 2 + n * 12);
  }
  return ifds;
}

// TIFF predictor 3 (floating point): undo byte differencing, then de-interleave byte planes.
function unpredictFloat(bytes, tw, th) {
  const out = new Float32Array(tw * th);
  const dv = new DataView(new ArrayBuffer(4));
  const rowBytes = tw * 4;
  for (let r = 0; r < th; r++) {
    const o = r * rowBytes;
    for (let k = 1; k < rowBytes; k++) bytes[o + k] = (bytes[o + k] + bytes[o + k - 1]) & 255;
    for (let i = 0; i < tw; i++) {
      dv.setUint8(0, bytes[o + i]); dv.setUint8(1, bytes[o + tw + i]);
      dv.setUint8(2, bytes[o + 2 * tw + i]); dv.setUint8(3, bytes[o + 3 * tw + i]);
      out[r * tw + i] = dv.getFloat32(0, false);
    }
  }
  return out;
}

const used = [];
for (const src of SOURCES) {
  for (const file of src.tiles) {
    const url = `${S3}/${src.project}/TIFF/${file}`;
    const ifds = await readHeader(url);
    if (!ifds) { console.log(`  ${file}: not found, skipped`); continue; }
    const base = ifds[0], ov = ifds[LEVEL];
    const scale = base[33550][0] * (base[256][0] / ov[256][0]);
    const ox = base[33922][3], oy = base[33922][4];
    const nodata = Number(base[42113] ?? -999999);
    const tw = ov[322][0], th = ov[323][0], across = Math.ceil(ov[256][0] / tw);
    let fetched = 0, cells = 0;
    for (let t = 0; t < ov[324].length; t++) {
      const tx0 = (t % across) * tw, ty0 = Math.floor(t / across) * th;
      // output cells whose centers fall in this tile
      const c0 = Math.max(0, Math.floor((ox + tx0 * scale - xmin) / RES)), c1 = Math.min(W, Math.ceil((ox + (tx0 + tw) * scale - xmin) / RES));
      const r0 = Math.max(0, Math.floor((ymax - (oy - ty0 * scale)) / RES)), r1 = Math.min(H, Math.ceil((ymax - (oy - (ty0 + th) * scale)) / RES));
      if (c0 >= c1 || r0 >= r1) continue;
      let need = false;
      for (let r = r0; r < r1 && !need; r++) for (let c = c0; c < c1; c++) if (Number.isNaN(grid[r * W + c])) { need = true; break; }
      if (!need || !ov[325][t]) continue;
      const raw = await range(url, ov[324][t], ov[324][t] + ov[325][t] - 1);
      const vals = unpredictFloat(lzwDecode(raw, tw * th * 4), tw, th);
      fetched++;
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        if (!Number.isNaN(grid[r * W + c])) continue;
        const px = Math.floor((xmin + (c + 0.5) * RES - ox) / scale) - tx0;
        const py = Math.floor((oy - (ymax - (r + 0.5) * RES)) / scale) - ty0;
        if (px < 0 || py < 0 || px >= tw || py >= th) continue;
        const v = vals[py * tw + px];
        if (v === nodata || !(v > -500)) continue;
        grid[r * W + c] = v; filledBy[r * W + c] = SOURCES.indexOf(src) + 1; cells++;
      }
    }
    if (cells) used.push({ file, cells });
    console.log(`  ${file}: ${fetched} tiles read, ${cells} cells filled`);
  }
}

const out = new Int16Array(W * H);
let lo = Infinity, hi = -Infinity, nodataCells = 0;
for (let i = 0; i < W * H; i++) {
  const v = grid[i];
  if (Number.isNaN(v)) { out[i] = -32768; nodataCells++; continue; }
  out[i] = Math.round(v * 10); if (v < lo) lo = v; if (v > hi) hi = v;
}
fs.mkdirSync(path.join(ROOT, 'data/terrain'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/terrain/dem.i16'), Buffer.from(out.buffer));
const meta = {
  crs: 'EPSG:32610 (WGS 84 / UTM zone 10N)', units: 'meters', verticalDatum: 'NAVD88 (per 3DEP 1 m DEM specification)',
  encoding: 'int16 little-endian; value = elevation in decimeters; -32768 = no data (open water or no coverage); rows run north to south',
  width: W, height: H, resolution: RES, xmin, ymin, xmax, ymax, min: lo, max: hi, nodataCells,
  provenance: {
    category: 'derived',
    sources: SOURCES.map(s => s.label),
    tilesUsed: used,
    method: `Read overview level ${LEVEL} (${RES} m) of each 1 m Cloud Optimized GeoTIFF via HTTP range requests; nearest overview pixel to each ${RES} m cell center; Alameda 2021 has priority, NoCAL 2018 fills cells it does not cover. Overviews are averages computed by USGS/GDAL from the 1 m data.`,
    retrieved: new Date().toISOString().slice(0, 10),
    license: 'US public domain (USGS)',
    limits: 'Bare-earth terrain. It does not show buildings, stairs, retaining walls, or whether a route is passable, and it does not determine fire behavior.',
  },
};
fs.writeFileSync(path.join(ROOT, 'data/terrain/dem.json'), JSON.stringify(meta, null, 2));
console.log(`${W}x${H} @ ${RES} m, elevation ${lo.toFixed(1)}–${hi.toFixed(1)} m, ${nodataCells} no-data cells`);
