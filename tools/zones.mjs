// Locate points in the simulator's evacuation zones (data/model/layers.json evacZones), for the
// demand and facility tools. A zone's rings are the merged rings of all its parts and holes, so a
// point is inside when an odd number of rings contain it. Where zones overlap, the first zone in
// layer order wins (as in js/fire.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from './utm.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function zoneLocator() {
  const dem = readJSON('data/terrain/dem.json'), layers = readJSON('data/model/layers.json');
  const zones = layers.evacZones.map(z => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of z.rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { z, bb: [x0, y0, x1, y1] };
  });
  const local = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - dem.xmin, y - dem.ymin]; };
  const hits = (x, y) => zones.filter(({ z, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]
    && z.rings.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1).map(q => q.z.id);
  // → { id: first zone containing the point or null, n: how many zones contain it }
  const locate = (lon, lat) => { const h = hits(...local(lon, lat)); return { id: h[0] ?? null, n: h.length }; };
  return { zones: layers.evacZones, locate };
}
