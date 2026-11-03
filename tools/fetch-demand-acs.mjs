// Fetch ACS 5-year tables for household mix by place (tools/build-demand.mjs; SOURCE_NOTES DM1–DM6).
// Block groups and tracts are those of the 2020 Census blocks in data/raw/census/blocks-2020.json
// (the model area plus a small margin). Values come from the Census Reporter API, latest release
// (the Census Bureau API needs a key). Estimates and margins of error are cached as returned,
// one object per geography, in data/raw/census/acs-demand.json. No household-level data exists in
// these tables; every value is a published block-group or tract total.
//   node tools/fetch-demand-acs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'berkeley-wildfire-simulator/0.1';
const OUT = path.join(R, 'data/raw/census/acs-demand.json');

// Block-group tables, then tract-only tables (the disability tables and B11010 are not published below tract; B11007 gives one-person 65+ households by block group).
export const BG_TABLES = ['B25044', 'B11016', 'B25010', 'B25008', 'B01001', 'B11007'];
export const TRACT_TABLES = ['B18101', 'B18105', 'B11010'];

const blocks = JSON.parse(fs.readFileSync(path.join(R, 'data/raw/census/blocks-2020.json'), 'utf8')).features;
const bgs = [...new Set(blocks.map(f => f.attributes.GEOID.slice(0, 12)))].sort();
const tracts = [...new Set(blocks.map(f => f.attributes.GEOID.slice(0, 11)))].sort();

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.json();
      console.warn(`HTTP ${r.status} ${url.slice(0, 120)}`);
    } catch (e) { console.warn(`${e.name} ${url.slice(0, 120)}`); }
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error(`failed: ${url}`);
}

async function fetchTables(tables, prefix, geos) {
  const out = { release: null, columns: {}, geos: {} };
  for (const t of tables) {
    for (let i = 0; i < geos.length; i += 40) {
      const ids = geos.slice(i, i + 40).map(g => prefix + g).join(',');
      const j = await get(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=${t}&geo_ids=${ids}`);
      out.release = j.release;
      out.columns[t] = Object.fromEntries(Object.entries(j.tables[t].columns).map(([k, c]) => [k, c.name]));
      for (const [gid, v] of Object.entries(j.data)) {
        const g = gid.slice(prefix.length);
        (out.geos[g] ||= { name: j.geography[gid].name })[t] = { e: v[t].estimate, m: v[t].error };
      }
    }
    console.log(`${t}: ${geos.length} geographies`);
  }
  return out;
}

const bg = await fetchTables(BG_TABLES, '15000US', bgs);
const tr = await fetchTables(TRACT_TABLES, '14000US', tracts);
fs.writeFileSync(OUT, JSON.stringify({
  retrieved: new Date().toISOString().slice(0, 10), userAgent: UA,
  source: 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=<table>&geo_ids=<15000US|14000US><GEOID>',
  note: 'Estimates (e) and 90% margins of error (m) as published. Geographies: block groups and tracts of the 2020 Census blocks in blocks-2020.json.',
  blockGroups: bg, tracts: tr,
}));
console.log(`wrote ${path.relative(R, OUT)} (${(fs.statSync(OUT).size / 1e3).toFixed(0)} kB), release ${bg.release.name}`);
