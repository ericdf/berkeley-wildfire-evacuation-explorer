#!/usr/bin/env node
// Download City of Berkeley ArcGIS Online layers used by the simulator into data/raw/city/.
//
//   node tools/fetch-city-layers.mjs            # all layers below
//   node tools/fetch-city-layers.mjs evac_zones # just one
//
// Each layer is saved as <key>.geojson (WGS84) plus <key>.meta.json recording the
// service URL, layer description, last-edit date and retrieval date. These are the
// City's published layers; the simulator treats them as "sourced" data, but they are
// not guaranteed current. Parcel layers that carry addresses are deliberately not
// downloaded (see the spec's privacy rules).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services';

export const LAYERS = {
  street_centerline_city: { service: 'Street_Centerline', layer: 0, why: 'City network centerlines with LANES, SLOPE, PARKING, ONEWAY and pavement-management width (PAV_WIDTH_RD)' },
  street_centerlines_fire: { service: 'Street_Centerlines', layer: 0, why: 'City centerlines with Category and No_FireRte (fire-apparatus routing) fields' },
  narrow_roads: { service: 'Narrow_Roads_and_TT_WFL1', layer: 7, why: 'Roads the City flags as narrow: pavement width and width with parking' },
  tight_turns: { service: 'Narrow_Roads_and_TT_WFL1', layer: 6, why: 'Tight turns with radius' },
  evac_zones: { service: 'GenasysZonesBerkeley', layer: 4, why: 'Genasys evacuation zones for Berkeley' },
  evac_regions: { service: 'Evac_Regions', layer: 0, why: 'Evacuation regions (zone groupings)' },
  neighborhoods: { service: 'Neighborhoods', layer: 8, why: 'OED neighborhood boundaries (2023)' },
  city_boundary: { service: 'City_of_Berkeley_Boundary', layer: null, why: 'City limits' },
  fire_zones: { service: 'FireZones_WFL1', layer: null, why: 'Berkeley Fire Zones (2 and 3 are the hill fire zones)' },
  fhsz_2025: { service: 'CAL_FIRE_and_Berkeley_FHSZ_2025', layer: null, why: 'CAL FIRE and Berkeley fire hazard severity zones (2025)' },
  ember_threat: { service: 'Ember_Threat_Zones', layer: null, why: 'Ember threat zones' },
  fire_1923: { service: '1923_Archival_Boundary_COB', layer: null, why: '1923 Berkeley fire archival boundary (historical reference only)' },
  fire_stations: { service: 'Fire_Stations', layer: null, why: 'Fire station locations' },
  shelters: { service: 'ShelterSites_WFL1', layer: null, why: 'Shelter sites' },
  no_parking_narrow: { service: 'Map_of_No_Parking_or_Stopping_Signs_Near_Narrow_Roads_WFL1', layer: null, why: 'No parking/stopping signs near narrow roads' },
  no_parking_fz23: { service: 'Map_of_No_Parking_Signs__Without_Tow_Away__in_FZ_2_and_3_WFL1', layer: null, why: 'No parking signs (no tow-away) in Fire Zones 2 and 3' },
  traffic_calming: { service: 'Berkeley_Fire_Apparatus_Route_Map_WFL1', layer: 1, why: 'Existing Traffic Calming Devices: the list of record for diverters, traffic circles and gates (network builder, section 5b)' },
};

async function json(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'berkeley-wildfire-simulator/0.1' } });
    if (r.ok) { const j = await r.json(); if (!j.error) return j; throw new Error(`${url}: ${j.error.message}`); }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error(`failed ${url}`);
}

async function fetchLayer(key, spec) {
  const svc = `${BASE}/${spec.service}/FeatureServer`;
  const info = await json(`${svc}?f=json`);
  const ids = spec.layer === null ? info.layers.map(l => l.id) : [spec.layer];
  const features = [], layerMeta = [];
  for (const id of ids) {
    const L = await json(`${svc}/${id}?f=json`);
    if (/parcel|residential/i.test(L.name)) continue;
    const page = L.maxRecordCount || 1000;
    for (let off = 0; ; off += page) {
      const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson', resultOffset: off, resultRecordCount: page });
      const fc = await json(`${svc}/${id}/query?${q}`);
      for (const f of fc.features) { f.properties._layer = L.name; features.push(f); }
      if (fc.features.length < page && !fc.properties?.exceededTransferLimit) break;
    }
    layerMeta.push({ id, name: L.name, geometryType: L.geometryType, description: (L.description || '').replace(/<[^>]+>/g, '').trim(),
      lastEdit: L.editingInfo?.lastEditDate ? new Date(L.editingInfo.lastEditDate).toISOString().slice(0, 10) : null });
  }
  const dir = path.join(ROOT, 'data/raw/city');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.geojson`), JSON.stringify({ type: 'FeatureCollection', features }));
  fs.writeFileSync(path.join(dir, `${key}.meta.json`), JSON.stringify({
    key, why: spec.why, publisher: 'City of Berkeley (ArcGIS Online organization "berkeley")', service: svc,
    serviceDescription: (info.serviceDescription || '').replace(/<[^>]+>/g, '').trim(), layers: layerMeta,
    crs: 'EPSG:4326 (requested outSR)', retrieved: new Date().toISOString().slice(0, 10), category: 'sourced', features: features.length,
  }, null, 2));
  console.log(`${key}: ${features.length} features`);
}

const want = process.argv.slice(2);
for (const [k, spec] of Object.entries(LAYERS)) {
  if (want.length && !want.includes(k)) continue;
  try { await fetchLayer(k, spec); } catch (e) { console.log(`${k}: FAILED ${e.message}`); }
}
