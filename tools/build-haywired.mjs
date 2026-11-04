#!/usr/bin/env node
// USGS HayWired fire following earthquake, for the Berkeley station areas (SOURCE_NOTES EQ11). Source: Scawthorn,
// C., 2018, chap. P of SIR 2017-5013-I-Q; data release "Fire following the Mw 7.0 HayWired earthquake scenario"
// (ScienceBase 5d83a79be4b0c4f70d067ae0): Voronoi polygons around fire stations (NAD83 California Albers) with
// modeled ignitions, floor area burned (millions of sq ft) and fire loss (millions of dollars). Keeps the polygons
// that hold a Berkeley fire station (data/model/layers.json fireStations), in local grid meters.
//   node tools/build-haywired.mjs      downloads to data/raw/usgs/ (gitignored), writes data/model/haywired-ignitions.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM, fromUTM } from './utm.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEM = 'https://www.sciencebase.gov/catalog/item/5d83a79be4b0c4f70d067ae0';
const UA = { 'User-Agent': 'berkeley-wildfire-evacuation-explorer/0.1' };
const RAW = path.join(R, 'data/raw/usgs'); fs.mkdirSync(RAW, { recursive: true });
const item = await (await fetch(`${ITEM}?format=json`, { headers: UA })).json();
const files = item.facets[0].files;
const get = async ext => {
  const out = path.join(RAW, `haywired-ffe.${ext}`);
  if (!fs.existsSync(out)) { const f = files.find(x => x.name.toLowerCase().endsWith(`.${ext}`)); const r = await fetch(f.url, { headers: UA }); if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); }
  return fs.readFileSync(out);
};
const shp = await get('shp'), dbf = await get('dbf');
fs.writeFileSync(path.join(RAW, 'haywired-ffe.retrieved'), `${new Date().toISOString().slice(0, 10)} ${ITEM}\n`);

const n = dbf.readUInt32LE(4), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10), F = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) F.push([dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), dbf[o + 16]]);
const rows = []; for (let i = 0; i < n; i++) { let p = hl + i * rl + 1; const d = {}; for (const [k, l] of F) { d[k] = +dbf.toString('latin1', p, p + l).trim(); p += l; } rows.push(d); }
const polys = []; for (let o = 100; o < shp.length;) {
  const len = shp.readInt32BE(o + 4) * 2, c = o + 8, np = shp.readInt32LE(c + 36), nP = shp.readInt32LE(c + 40), parts = [], pts = [];
  for (let k = 0; k < np; k++) parts.push(shp.readInt32LE(c + 44 + 4 * k));
  for (let k = 0; k < nP; k++) pts.push([shp.readDoubleLE(c + 44 + 4 * np + 16 * k), shp.readDoubleLE(c + 44 + 4 * np + 16 * k + 8)]);
  polys.push(parts.map((s, k) => pts.slice(s, k + 1 < np ? parts[k + 1] : nP))); o = c + len;
}
if (polys.length !== rows.length) throw new Error('shapefile and table disagree');

// California Albers (EPSG:3310: GRS80, parallels 34 and 40.5, origin 0, -120, false northing -4,000,000)
const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), rad = x => x * Math.PI / 180;
const q = ph => { const s = Math.sin(ph); return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))); };
const m = ph => Math.cos(ph) / Math.sqrt(1 - e2 * Math.sin(ph) ** 2);
const p1 = rad(34), p2 = rad(40.5), l0 = rad(-120), m1 = m(p1), m2 = m(p2), q1 = q(p1), q2 = q(p2), nn = (m1 * m1 - m2 * m2) / (q2 - q1), C = m1 * m1 + nn * q1, rho0 = a * Math.sqrt(C - nn * q(0)) / nn;
const fwd = (lon, lat) => { const rho = a * Math.sqrt(C - nn * q(rad(lat))) / nn, th = nn * (rad(lon) - l0); return [rho * Math.sin(th), rho0 - rho * Math.cos(th) - 4000000]; };
const inv = (x, y) => { const Y = rho0 - (y + 4000000), rho = Math.hypot(x, Y), th = Math.atan2(x, Y), qq = (C - (rho * nn / a) ** 2) / nn;
  let ph = Math.asin(qq / 2); for (let i = 0; i < 10; i++) { const s = Math.sin(ph); ph += (1 - e2 * s * s) ** 2 / (2 * Math.cos(ph)) * (qq / (1 - e2) - s / (1 - e2 * s * s) + (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))); }
  return [(l0 + th / nn) * 180 / Math.PI, ph * 180 / Math.PI]; };
const inR = (x, y, Rg) => { let c = false; for (let i = 0, j = Rg.length - 1; i < Rg.length; j = i++) { const [x1, y1] = Rg[i], [x2, y2] = Rg[j]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c = !c; } return c; };

const net = JSON.parse(fs.readFileSync(path.join(R, 'data/model/network.json'))), L = JSON.parse(fs.readFileSync(path.join(R, 'data/model/layers.json')));
const [x0, y0] = net.meta.origin;
const areas = [];
for (const s of L.fireStations) {
  const [lon, lat] = fromUTM(s.pt[0] + x0, s.pt[1] + y0), [X, Y] = fwd(lon, lat);
  const k = polys.findIndex(P => P.some(Rg => inR(X, Y, Rg)));
  if (k < 0) throw new Error(`${s.name} is in no HayWired polygon`);
  const rings = polys[k].map(Rg => Rg.map(([px, py]) => { const [lo, la] = inv(px, py), [ux, uy] = toUTM(lo, la); return [+(ux - x0).toFixed(1), +(uy - y0).toFixed(1)]; }));
  areas.push({ station: s.name, ignitions: rows[k].Ignitions, floorAreaBurnedMsf: rows[k].AreaBurned, fireLossMillion: rows[k].FireLoss, rings });
}
const sum = k => +areas.reduce((t, x) => t + x[k], 0).toFixed(3);
const out = { meta: { source: `${ITEM} (Scawthorn 2018, HayWired chap. P data release), retrieved ${new Date().toISOString().slice(0, 10)}`, category: 'sourced',
  fields: 'ignitions: number modeled in the station area; floorAreaBurnedMsf: floor area burned, millions of sq ft; fireLossMillion: property loss, millions of dollars',
  totals: { ignitions: sum('ignitions'), floorAreaBurnedMsf: sum('floorAreaBurnedMsf'), fireLossMillion: sum('fireLossMillion') },
  note: 'Polygons are Voronoi cells around stations, so they reach past the city line; values are for the whole cell.' }, areas };
fs.writeFileSync(path.join(R, 'data/model/haywired-ignitions.json'), JSON.stringify(out));
console.log(JSON.stringify(out.meta.totals), areas.map(x => `${x.station} ${x.ignitions}`).join('; '));
