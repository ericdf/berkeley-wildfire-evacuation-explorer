#!/usr/bin/env node
// The 2025 Panoramic and Grizzly Peak Mitigation Zones (Berkeley Fire Code, Council 2025-04-15, Special Item 02,
// Attachment 1; SOURCE_NOTES PH26, FV18) for the fire overlay's proxy fuel. Source: the City's ArcGIS Online layer
// grizz_pano_mitigation (layer 15, edited 2026-03-13), two unnamed polygons; we name them by position (the one
// on Panoramic Hill is the Panoramic zone, the one east of Grizzly Peak Blvd the Grizzly Peak zone). The City's
// other fire-zone layers still show the 2013 map (ISSUES.md I3). Geometry only.
//   node tools/build-fire-zones-2025.mjs     writes data/model/fire-zones-2025.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYER = 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/grizz_pano_mitigation/FeatureServer/15';
const UA = { 'User-Agent': 'berkeley-wildfire-evacuation-explorer/0.1' };
const get = async (url, params) => { const r = await fetch(`${url}?${new URLSearchParams(params)}`, { headers: UA }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j; };

const info = await get(LAYER, { f: 'json' });
const q = await get(`${LAYER}/query`, { where: '1=1', outFields: '', returnGeometry: 'true', outSR: '4326', f: 'json' });
if (q.features.length !== 2) throw new Error(`expected 2 polygons, got ${q.features.length}`);
const net = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/network.json'), 'utf8'));
const [x0, y0] = net.meta.origin;
const local = ([lon, lat]) => { const [e, n] = toUTM(lon, lat); return [+(e - x0).toFixed(1), +(n - y0).toFixed(1)]; };
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
const polys = q.features.map(f => {
  const rings = f.geometry.rings.map(r => r.map(local));
  const lat = Math.min(...f.geometry.rings.flat().map(p => p[1]));
  return { rings, lat, acres: +(Math.abs(rings.reduce((s, r) => s + ringArea(r), 0)) / 4046.856).toFixed(1) };
}).sort((a, b) => a.lat - b.lat); // Panoramic Hill lies south of the Grizzly Peak zone
const zones = [
  { id: 'panoramic', name: 'Panoramic Mitigation Zone (Zone 3)', zone: 3, acres: polys[0].acres, rings: polys[0].rings },
  { id: 'grizzlyPeak', name: 'Grizzly Peak Mitigation Zone (Zone 4)', zone: 4, acres: polys[1].acres, rings: polys[1].rings },
];
const out = {
  meta: {
    source: `${LAYER} (City of Berkeley ArcGIS Online, grizz_pano_mitigation, last edited ${info.editingInfo?.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : 'unknown'}); named by position; retrieved ${new Date().toISOString().slice(0, 10)}`,
    definition: 'Berkeley Fire Code 2025, Council 2025-04-15, Special Item 02, Attachment 1 (PDF pp. 34–35)',
    note: 'Areas measured in UTM Zone 10N. The Hills zone (Zone 2) keeps the 2013 Fire Zone 2 outline from FireZones_WFL1: no City layer draws the 2025 Hills zone (ISSUES.md I3).',
  },
  zones,
};
fs.writeFileSync(path.join(ROOT, 'data/model/fire-zones-2025.json'), JSON.stringify(out));
console.log(zones.map(z => `${z.name}: ${z.acres} acres`).join('; '));
