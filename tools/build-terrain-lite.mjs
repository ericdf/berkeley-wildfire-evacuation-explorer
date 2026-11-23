#!/usr/bin/env node
// A light terrain set for the browser (Eric, 2026-11-23; SOURCE_NOTES GV19). The full 4 m DEM (data/terrain/dem.i16,
// 10.4 MB, 5.0 MB gzipped on GitHub Pages) was 77% of a phone's first load. The page needs it for four things, each
// now served from a file derived here from that DEM, so the model's inputs and results do not change:
//   elev30.i16       the fire grid's elevation: the DEM value at each 30 m fire cell's center, exactly as js/fire.js
//                    buildFireGrid samples it (demAt), in the grid's own order (rows from the south edge)
//   lite.json links  the 4 m DEM cells the profile of every candidate new road reads (tools/egress-link.mjs profile,
//                    nearest cell, as demSampler), so a new-road Change gets the same elevations and grades
//   contours.i16     the map's 20 m contour lines (js/terrain.js makeContours, step 3), coordinates in half meters
//   hillshade.webp   the map's shaded relief (js/terrain.js makeTerrainCanvas), rendered in Chromium at half the DEM's
//                    resolution (8 m per pixel); display only
// Tests and tools keep loading the full DEM (js/data.js loadData without { lite: true }); tests/terrain-lite.mjs
// checks that both paths give the same fire grid, link profiles and runs.
//
//   node tools/build-terrain-lite.mjs        (needs Playwright with its Chromium for the hillshade, as the browser tests)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeContours } from '../js/terrain.js';
import { profile, demSampler } from './egress-link.mjs';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => JSON.parse(fs.readFileSync(path.join(R, p), 'utf8'));
const dem = rd('data/terrain/dem.json'), buf = fs.readFileSync(path.join(R, 'data/terrain/dem.i16'));
const Z = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
const net = rd('data/model/network.json'), CELL = 30;

// 1. Fire-grid elevation (js/fire.js buildFireGrid: x = (c + 0.5) × CELL, y = (r + 0.5) × CELL, demAt).
const W = Math.ceil(net.meta.terrain.xmax / CELL), H = Math.ceil(net.meta.terrain.ymax / CELL);
const e30 = new Int16Array(W * H);
const rawAt = (x, y) => { const c = Math.floor(x / dem.resolution), r = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
  return c < 0 || r < 0 || c >= dem.width || r >= dem.height ? -32768 : Z[r * dem.width + c]; };
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) e30[r * W + c] = rawAt((c + 0.5) * CELL, (r + 0.5) * CELL);
fs.writeFileSync(path.join(R, 'data/terrain/elev30.i16'), Buffer.from(e30.buffer));

// 2. DEM cells read by candidate new roads' profiles (every candidate in egress-candidates.json).
const EC = rd('data/model/egress-candidates.json'), cells = new Map(), full = demSampler(dem, Z);
for (const c of EC.candidates) if (c.geom) profile(c.geom, (x, y) => {
  const cc = Math.floor(x / dem.resolution), rr = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
  if (cc >= 0 && rr >= 0 && cc < dem.width && rr < dem.height) cells.set(rr * dem.width + cc, Z[rr * dem.width + cc]);
  return full(x, y);
});
const idx = [...cells.keys()].sort((a, b) => a - b);

// 3. Contours (half-meter coordinates; the map draws them at most a few pixels per meter).
const C = makeContours(dem, Z, 20, 3), levels = [], parts = [];
for (const { level, segs } of C) { levels.push([level, segs.length]); parts.push(Int16Array.from(segs, v => Math.round(v * 2))); }
const allSegs = new Int16Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { allSegs.set(p, o); o += p.length; }
// delta-coded (each x and y minus the previous point's), which gzips 15% smaller; decoded by a running sum
for (let i = allSegs.length - 2; i >= 2; i -= 2) { allSegs[i] -= allSegs[i - 2]; allSegs[i + 1] -= allSegs[i - 1]; }
fs.writeFileSync(path.join(R, 'data/terrain/contours.i16'), Buffer.from(allSegs.buffer));

// 4. Hillshade, rendered by js/terrain.js in Chromium, downscaled to half and saved as WebP.
const SCALE = 0.5, QUALITY = 0.82;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = http.createServer((q, s) => { const f = path.join(R, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(R) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(`${base}/index.html`).catch(() => {});
const webp = await page.evaluate(async ({ SCALE, QUALITY }) => {
  const { makeTerrainCanvas } = await import('/js/terrain.js');
  const dem = await (await fetch('/data/terrain/dem.json')).json(), Z = new Int16Array(await (await fetch('/data/terrain/dem.i16')).arrayBuffer());
  const full = makeTerrainCanvas(dem, Z), cv = document.createElement('canvas');
  cv.width = Math.round(dem.width * SCALE); cv.height = Math.round(dem.height * SCALE);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(full, 0, 0, cv.width, cv.height);
  return { url: cv.toDataURL('image/webp', QUALITY), w: cv.width, h: cv.height };
}, { SCALE, QUALITY });
await browser.close(); server.close();
fs.writeFileSync(path.join(R, 'data/terrain/hillshade.webp'), Buffer.from(webp.url.split(',')[1], 'base64'));

const meta = {
  built: new Date().toISOString().slice(0, 10), tool: 'tools/build-terrain-lite.mjs', source: 'data/terrain/dem.i16 (dem.json)',
  note: 'Derived from the 4 m DEM for the browser; see the tool header. Same values the model reads; the hillshade is display only.',
  elev30: { file: 'data/terrain/elev30.i16', cell: CELL, W, H, encoding: 'int16 little-endian, decimetres, -32768 = no data; index r * W + c, r from the south edge (js/fire.js grid order)' },
  links: { encoding: 'DEM cells (row-major index into dem.i16, rows north to south) read by tools/egress-link.mjs profile for every candidate in data/model/egress-candidates.json, and their decimetre values', candidates: EC.candidates.length, built: EC.meta?.built ?? null, cells: idx, z: idx.map(i => cells.get(i)) },
  contours: { file: 'data/terrain/contours.i16', interval: 20, step: 3, unit: 'half meters (local), delta-coded: each point minus the previous one, x and y interleaved', levels },
  hillshade: { file: 'data/terrain/hillshade.webp', width: webp.w, height: webp.h, metersPerPixel: dem.resolution / SCALE, quality: QUALITY },
};
fs.writeFileSync(path.join(R, 'data/terrain/lite.json'), JSON.stringify(meta));
const kb = f => (fs.statSync(path.join(R, f)).size / 1024).toFixed(0) + ' kB';
console.log(`elev30.i16 ${W}×${H} ${kb('data/terrain/elev30.i16')}; link cells ${idx.length}; contours ${levels.length} levels ${kb('data/terrain/contours.i16')}; hillshade ${webp.w}×${webp.h} ${kb('data/terrain/hillshade.webp')}; lite.json ${kb('data/terrain/lite.json')}`);
