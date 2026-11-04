#!/usr/bin/env node
// OpenStreetMap building outlines for the model area (Phase 3; SOURCE_NOTES PH24). © OpenStreetMap
// contributors, ODbL. Writes data/raw/osm/buildings.json (gitignored): outer rings only, as
// [[lon, lat], ...], with no tags, so no addresses or names are kept. tools/build-structures.mjs reduces
// them to counts per fire cell.
//
// Fetched in tiles of 0.02° from an Overpass API server (overpass-api.de, falling back to
// overpass.kumi.systems), retrying each tile. Building relations (multipolygons) are skipped: their outer
// ways are usually tagged building themselves, and the count of skipped relations is printed.
//
//   node tools/fetch-osm-buildings.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_LONLAT as A } from './utm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/raw/osm/buildings.json');
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = { 'User-Agent': 'berkeley-wildfire-simulator/0.1', 'Content-Type': 'application/x-www-form-urlencoded' };
const STEP = 0.02;
// Each tile is cached as it arrives (gitignored), so an interrupted run resumes where it stopped.
const CACHE = path.join(ROOT, 'data/raw/osm/buildings-tiles');
fs.mkdirSync(CACHE, { recursive: true });

async function tile(s, w, n, e) {
  const q = `[out:json][timeout:180];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom;`;
  for (let k = 0; k < 8; k++) {
    const url = SERVERS[k % SERVERS.length];
    try {
      // a request the server never answers would otherwise hang the run forever
      const r = await fetch(url, { method: 'POST', headers: UA, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(200000) });
      if (r.ok) return { j: await r.json(), url };
      console.error(`  ${url} HTTP ${r.status}`);
    } catch (err) { console.error(`  ${url} ${err.message}`); }
    await new Promise(res => setTimeout(res, 3000 * (k + 1)));
  }
  throw new Error(`tile ${s},${w} failed`);
}

const total = Math.ceil((A.north - A.south) / STEP - 1e-9) * Math.ceil((A.east - A.west) / STEP - 1e-9); let done = 0;
const seen = new Set(), rings = []; let relations = 0, osmBase = null; const used = new Set();
for (let s = A.south; s < A.north - 1e-9; s += STEP) for (let w = A.west; w < A.east - 1e-9; w += STEP) {
  const n = Math.min(A.north, s + STEP), e = Math.min(A.east, w + STEP);
  const key = `${s.toFixed(2)}_${w.toFixed(2)}`, cf = path.join(CACHE, `${key}.json`);
  let t;
  if (fs.existsSync(cf)) t = JSON.parse(fs.readFileSync(cf));
  else {
    const { j, url } = await tile(s.toFixed(4), w.toFixed(4), n.toFixed(4), e.toFixed(4));
    // keep geometry and ids only (ids to drop duplicates across tile edges); no tags
    t = { url, osmBase: j.osm3s?.timestamp_osm_base, relations: j.elements.filter(x => x.type === 'relation').length,
      ways: j.elements.filter(x => x.type === 'way' && x.geometry).map(x => ({ id: x.id, g: x.geometry.map(p => [+p.lon.toFixed(7), +p.lat.toFixed(7)]) })) };
    fs.writeFileSync(cf, JSON.stringify(t));
    await new Promise(res => setTimeout(res, 5000)); // a pause between tiles, so the public servers are not hammered
  }
  used.add(t.url); osmBase ||= t.osmBase; relations += t.relations;
  const j = { elements: t.ways.map(x => ({ type: 'way', id: x.id, geometry: x.g.map(([lon, lat]) => ({ lon, lat })) })) };
  let added = 0;
  for (const el of j.elements) {
    if (el.type !== 'way' || !el.geometry || seen.has(el.id)) continue;
    seen.add(el.id);
    const r = el.geometry.map(p => [+p.lon.toFixed(7), +p.lat.toFixed(7)]);
    if (r.length >= 4) { rings.push(r); added++; }
  }
  console.log(`PROGRESS tile ${++done}/${total} (${s.toFixed(2)},${w.toFixed(2)}): ${added} new outlines, total ${rings.length}`);
}
const meta = { source: 'OpenStreetMap contributors, ODbL', servers: [...used], retrieved: new Date().toISOString(), osmBase,
  area: A, outlines: rings.length, relationsSkipped: relations, note: 'Outer ways tagged building=*; geometry only, no tags.' };
fs.writeFileSync(OUT, JSON.stringify({ meta, rings }));
fs.writeFileSync(OUT.replace('.json', '.retrieved'), `${meta.servers.join(', ')} ${meta.retrieved} (OSM data as of ${osmBase}); way["building"] and relation["building"] by 0.02° tile; ${rings.length} outlines, ${relations} relations skipped; geometry only\n`);
console.log('DONE ' + JSON.stringify(meta));
