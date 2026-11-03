#!/usr/bin/env node
// Junctions officers can take over in the "Police control of signals" plan setting, and the
// signals a Red Flag power shutoff darkens. Writes data/model/signals.json.
//
//   node tools/fetch-city-layers.mjs signals   # data/raw/city/signals.geojson (146 points, ControlTyp)
//   node tools/signals.mjs
//   (optional) data/raw/osm/traffic-signals.json from data/raw/osm/traffic-signals.overpassql adds OSM signals outside Berkeley (data/model/signals-outside.json)
//
// 1. City `Signals` layer (SOURCE_NOTES G4): each signal is snapped to the nearest network junction
//    (3 or more drivable streets) within SNAP_M. Control type is the City's: "Pretimed Signal" or
//    "Actuated Signal".
// 2. 2025 Evacuation Time Study, Appendix F: junctions the congestion narrative names (pp. F-3 to F-5),
//    found where both named streets meet. Some are signals already; the Piedmont Av / Channing Wy
//    traffic circle is not.
// `hills`: the junction touches a street in Berkeley's Fire Zones 2–3, or lies within HILL_EDGE_M of
// one (model rule for which signals a power shutoff aimed at the hills darkens).
// Rerun after every network rebuild: node ids change.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP_M = 40, HILL_EDGE_M = 150;
const net = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/network.json'), 'utf8'));
const src = path.join(ROOT, 'data/raw/city/signals.geojson');
if (!fs.existsSync(src)) { console.error('Missing data/raw/city/signals.geojson: run node tools/fetch-city-layers.mjs signals'); process.exit(1); }
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/city/signals.meta.json'), 'utf8'));
const fc = JSON.parse(fs.readFileSync(src, 'utf8'));
const O = net.meta.origin, nodes = net.nodes;

const veh = e => e.mode === 'vehicle' && !e.disconnected;
const nodeEdges = nodes.map(() => []);
for (const e of net.edges) if (veh(e)) { nodeEdges[e.a].push(e); if (e.b !== e.a) nodeEdges[e.b].push(e); }
const title = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const nameOf = n => [...new Set(nodeEdges[n].map(e => e.name).filter(s => s && s !== 'UNNAMED'))].slice(0, 3).map(title).join(' / ');
const junction = n => nodeEdges[n].length >= 3;
const hillNodes = new Set(); for (const e of net.edges) if (veh(e) && e.fireZone >= 2 && e.fireZoneSrc !== 'proxy:elevation>=90m') { hillNodes.add(e.a); hillNodes.add(e.b); }
const hillPts = [...hillNodes].map(n => nodes[n]);
const nearHills = n => hillNodes.has(n) || hillPts.some(([x, y]) => Math.hypot(x - nodes[n][0], y - nodes[n][1]) <= HILL_EDGE_M);

const out = new Map(); let unsnapped = 0;
for (const f of fc.features) {
  const [lon, lat] = f.geometry.coordinates; const [X, Y] = toUTM(lon, lat), x = X - O[0], y = Y - O[1];
  let best = -1, bd = SNAP_M;
  for (let n = 0; n < nodes.length; n++) { if (!junction(n)) continue; const d = Math.hypot(nodes[n][0] - x, nodes[n][1] - y); if (d < bd) { bd = d; best = n; } }
  if (best < 0) { unsnapped++; continue; }
  const control = /pre/i.test(f.properties.ControlTyp) ? 'pretimed' : 'actuated';
  if (out.has(best)) { const s = out.get(best); if (control === 'pretimed') s.control = 'pretimed'; s.count++; continue; }
  out.set(best, { node: best, name: nameOf(best), control, signal: true, appF: null, hills: nearHills(best), snapM: Math.round(bd), count: 1 });
}

// Appendix F junctions (Time Study, F-3 to F-5). Each pair of County street names must meet at one node.
const APPF = [
  [['CEDAR ST', 'MARTIN LUTHER KING JR WY'], 'Last congestion of the 1923 repeat, a pre-timed signal (p. F-3)'],
  [['GAYLEY RD', 'HEARST AV'], 'LOS F 3 h into the 1923 repeat (p. F-3)'],
  [['PIEDMONT AV TC', 'CHANNING WY'], 'Traffic circle at LOS F in the Panoramic Hill evacuation (p. F-4)'],
  [['PIEDMONT AV', 'DWIGHT WY'], 'Where Panoramic Hill evacuees leave Piedmont Av (p. F-4)'],
  [['DERBY ST', 'CLAREMONT BL'], 'Derby St traffic forced to its junction with Claremont by the Derby St diverter (p. F-4; the County file names the street Claremont Bl here)'],
  [['ASHBY AV', 'CLAREMONT AV'], 'Ashby Av / Tunnel Rd heavily congested in the Fire Zones 2–3 evacuation (p. F-5)'],
];
const missing = [];
for (const [[s1, s2], why] of APPF) {
  const cand = nodes.map((_, n) => n).filter(n => nodeEdges[n].some(e => e.name === s1) && nodeEdges[n].some(e => e.name === s2));
  if (!cand.length) { missing.push(`${s1} / ${s2}`); continue; }
  const n = cand[0];
  if (out.has(n)) out.get(n).appF = why;
  else out.set(n, { node: n, name: nameOf(n), control: null, signal: false, appF: why, hills: nearHills(n), snapM: 0, count: 0 });
}

const list = [...out.values()].sort((a, b) => a.node - b.node);

// 3. OpenStreetMap highway=traffic_signals outside the City of Berkeley (data/raw/osm/traffic-signals.json; SOURCE_NOTES WP10),
//    snapped the same way. Written to data/model/signals-outside.json; the police-control and power-shutoff settings
//    read only data/model/signals.json, the City's signals, so these change none of their results.
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const city = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model/layers.json'), 'utf8')).cityBoundary;
const inCity = (x, y) => city.some(q => q.rings.reduce((c, r) => inRing(x, y, r) ? !c : c, false));
const osmSrc = path.join(ROOT, 'data/raw/osm/traffic-signals.json');
const outside = new Map(); let osmIn = 0, osmUnsnapped = 0, osmN = 0, osmRetrieved = null;
if (fs.existsSync(osmSrc)) {
  const osm = JSON.parse(fs.readFileSync(osmSrc, 'utf8')); osmRetrieved = osm.osm3s?.timestamp_osm_base;
  for (const e of osm.elements) {
    if (e.type !== 'node') continue; osmN++;
    const [X, Y] = toUTM(e.lon, e.lat), x = X - O[0], y = Y - O[1];
    if (inCity(x, y)) { osmIn++; continue; }
    let best = -1, bd = SNAP_M;
    for (let n = 0; n < nodes.length; n++) { if (!junction(n)) continue; const d = Math.hypot(nodes[n][0] - x, nodes[n][1] - y); if (d < bd) { bd = d; best = n; } }
    if (best < 0) { osmUnsnapped++; continue; }
    if (out.has(best)) continue; // a City signal at the city line
    if (outside.has(best)) { outside.get(best).count++; continue; }
    outside.set(best, { node: best, name: nameOf(best), control: null, signal: true, src: 'osm', osmNode: e.id, snapM: Math.round(bd), count: 1 });
  }
}
const listOutside = [...outside.values()].sort((a, b) => a.node - b.node);
const doc = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    source: `City of Berkeley Signals layer (${meta.service}/0), retrieved ${meta.retrieved}, ${fc.features.length} signals; 2025 Evacuation Time Study (KLD TR-1296), Appendix F`,
    rule: `Each signal snapped to the nearest junction of 3 or more drivable streets within ${SNAP_M} m (derived). hills: touches a Fire Zones 2–3 street or lies within ${HILL_EDGE_M} m of one (model rule).`,
    signals: list.filter(s => s.signal).length, pretimed: list.filter(s => s.control === 'pretimed').length, actuated: list.filter(s => s.control === 'actuated').length,
    unsnapped, appF: list.filter(s => s.appF).length, appFMissing: missing, hillsSignals: list.filter(s => s.signal && s.hills).length,
  },
  junctions: list,
};
const outsideDoc = { meta: { built: doc.meta.built, source: `OpenStreetMap highway=traffic_signals (data/raw/osm/traffic-signals.json, OSM data as of ${osmRetrieved})`, osmNodes: osmN, insideBerkeley: osmIn, unsnapped: osmUnsnapped, junctions: listOutside.length,
  rule: 'Nodes outside the City boundary, snapped like the City signals; several OSM nodes (one per approach) often map to one junction. Control type unknown.' },
  junctions: listOutside };
if (osmRetrieved) fs.writeFileSync(path.join(ROOT, 'data/model/signals-outside.json'), JSON.stringify(outsideDoc));
fs.writeFileSync(path.join(ROOT, 'data/model/signals.json'), JSON.stringify(doc));
console.log(JSON.stringify(doc.meta, null, 1));
if (osmRetrieved) console.log(JSON.stringify(outsideDoc.meta, null, 1));
