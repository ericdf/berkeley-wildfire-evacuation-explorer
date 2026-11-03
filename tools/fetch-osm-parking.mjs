#!/usr/bin/env node
// Fetch the OpenStreetMap snapshots the weekday placement work uses and store them without addresses.
//
//   node tools/fetch-osm-parking.mjs            # run the three queries in data/raw/osm/, clean, save
//   node tools/fetch-osm-parking.mjs --clean    # only clean the snapshots already on disk
//
// Queries: parking.overpassql, parking-campus-geom.overpassql, traffic-signals.overpassql. Every addr:* tag
// (house numbers, streets, postcodes) is removed before a file is written: the repository never stores
// addresses (AGENTS.md). Nothing in tools/workplaces.mjs or tools/signals.mjs reads them.
// overpass-api.de is unreachable from some machines; OVERPASS sets another endpoint.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data/raw/osm');
const NAMES = ['parking', 'parking-campus-geom', 'traffic-signals'];
const URL_ = process.env.OVERPASS || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';

export function stripAddresses(doc) {
  let n = 0;
  for (const e of doc.elements || []) if (e.tags) for (const k of Object.keys(e.tags)) if (k.startsWith('addr:')) { delete e.tags[k]; n++; }
  return n;
}

const save = (name, doc) => {
  const n = stripAddresses(doc);
  fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(doc));
  return n;
};

if (process.argv.includes('--clean')) {
  for (const name of NAMES) {
    const p = path.join(DIR, `${name}.json`); if (!fs.existsSync(p)) continue;
    console.log(`${name}.json: removed ${save(name, JSON.parse(fs.readFileSync(p, 'utf8')))} addr:* tags`);
  }
} else {
  for (const name of NAMES) {
    const q = fs.readFileSync(path.join(DIR, `${name}.overpassql`), 'utf8');
    let doc = null;
    for (let i = 0; i < 4 && !doc; i++) {
      try {
        const r = await fetch(URL_, { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(240000) });
        const d = await r.json(); if (d.elements?.length) doc = d;
      } catch { /* busy server: retry */ }
      if (!doc) await new Promise(r => setTimeout(r, 30000));
    }
    if (!doc) { console.error(`${name}: no answer from ${URL_}`); process.exitCode = 1; continue; }
    const n = save(name, doc);
    fs.writeFileSync(path.join(DIR, `${name}.retrieved`), `${URL_} ${new Date().toISOString().slice(0, 19)}Z (OSM data as of ${doc.osm3s?.timestamp_osm_base}); query in ${name}.overpassql; addr:* tags removed by tools/fetch-osm-parking.mjs\n`);
    console.log(`${name}: ${doc.elements.length} elements, removed ${n} addr:* tags`);
  }
}
