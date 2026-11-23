// Load simulator data and build lookup structures. Works in the browser (fetch) and in
// Node tests (pass a loader that reads files).

export async function loadData(load = browserLoad, { lite = false } = {}) {
  // Every file is requested at once; on a phone's 150 ms link, waiting for each before asking for the next cost seconds.
  const opt = (p, k = 'json') => Promise.resolve().then(() => load(p, k)).catch(() => null);
  // lite (the browser, Eric, 2026-11-23; SOURCE_NOTES GV19): instead of the 4 m DEM (dem.i16, 10.4 MB), the light set
  // tools/build-terrain-lite.mjs derives from it: the fire grid's 30 m elevations, the DEM cells new roads read, and the
  // map's hillshade image and contours. The model reads the same values (tests/terrain-lite.mjs). Without lite (tests
  // and tools) the full DEM loads as before.
  const [net, layers, dem, demBuf, A, fireZones2025, liteMeta, e30Buf] = await Promise.all([
    load('data/model/network.json', 'json'), load('data/model/layers.json', 'json'),
    load('data/terrain/dem.json', 'json'), lite ? null : load('data/terrain/dem.i16', 'buffer'), load('data/assumptions.json', 'json'),
    load('data/model/fire-zones-2025.json', 'json'), // the 2025 Panoramic and Grizzly Peak zones for the proxy fuel (tools/build-fire-zones-2025.mjs)
    lite ? load('data/terrain/lite.json', 'json') : null, lite ? load('data/terrain/elev30.i16', 'buffer') : null,
  ]);
  // Optional: access-constrained areas (tools/access-constraints.mjs), for the map layer and the R0 plan setting. The simulator runs without them.
  // Optional: signal junctions (tools/signals.mjs: the City's signals, and OpenStreetMap signals outside Berkeley) and main
  // hill exit streets (tools/contraflow-streets.mjs). Signals set junction capacity (js/sim.js, SOURCE_NOTES CD21) and are
  // read by the police-control and power-shutoff settings; contraflow streets by the contraflow setting.
  // Optional: household mix by place (tools/build-demand.mjs), for the default "Household mix: by place" world
  // setting and the zone figures from the ACS and licensing records. Without it runs use the Time Study's citywide mix.
  // Optional: structures per fire cell (tools/build-structures.mjs), for exposure context and the map layer.
  // Optional: street segments a Hayward Fault rupture closes, two bounds (tools/fault-zone-check.mjs --write), for the opt-in earthquake setting.
  // Optional: USGS HayWired fire-following values for Berkeley's station areas (tools/build-haywired.mjs), for the earthquake fires.
  // Optional: the simulator's fire-off times against the Time Study (tests/calibration.mjs) and the household-mix comparison
  // (tools/demand-compare.mjs), shown beside the results they qualify.
  const [access, signals, signalsOutside, contraflow, demand, structures, haywired, faultClosures, calibration, demandCompare] = await Promise.all(
    ['access-constraints', 'signals', 'signals-outside', 'contraflow-streets', 'demand-by-zone', 'structures', 'haywired-ignitions', 'fault-closures', 'calibration', 'demand-compare']
      .map(f => opt(`data/model/${f}.json`)));
  // Opt-in Expert settings only: LANDFIRE FBFM40 fuel classes (tools/fetch-fuel.mjs, the "Fuel" setting), workplaces and
  // off-street parking (tools/workplaces.mjs, "by workplace" placement of non-residents) and home-to-street walking and
  // stair access (tools/walk-access.mjs, "Home-to-street access time"). In lite mode they, and the map's contours, load
  // after the page is up: data.deferred resolves once they are in place, and anything that needs them awaits it.
  const later = async () => {
    const [fuelMeta, fuelBuf, workplaces, walk] = await Promise.all([opt('data/terrain/fbfm40.json'), opt('data/terrain/fbfm40.u8', 'buffer'), opt('data/model/workplaces.json'), opt('data/model/walk-access.json')]);
    return { fuel40: fuelMeta && fuelBuf ? { meta: fuelMeta, codes: new Uint8Array(fuelBuf) } : null, workplaces, walk };
  };
  const now = lite ? { fuel40: null, workplaces: null, walk: null } : await later();
  const data = prepare({ net, layers, dem, Z: demBuf ? new Int16Array(demBuf) : null, A, fireZones2025, access, signals, signalsOutside, contraflow, demand, ...now, structures, faultClosures, haywired, calibration, demandCompare });
  if (lite) {
    data.lite = liteMeta;
    data.elev30 = new Int16Array(e30Buf);
    const cells = new Map(liteMeta.links.cells.map((c, i) => [c, liteMeta.links.z[i]]));
    // nearest 4 m DEM cell, as tools/egress-link.mjs demSampler, from the cells new roads read; any other cell is an error
    data.linkElev = (x, y) => {
      const c = Math.floor(x / dem.resolution), r = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
      if (c < 0 || r < 0 || c >= dem.width || r >= dem.height) return null;
      const v = cells.get(r * dem.width + c); if (v === undefined) throw new Error(`DEM cell ${r * dem.width + c} is not in data/terrain/lite.json (rerun tools/build-terrain-lite.mjs)`);
      return v === -32768 ? null : v / 10;
    };
    data.deferred = (async () => {
      const [more, cBuf] = await Promise.all([later(), opt(liteMeta.contours.file, 'buffer')]);
      Object.assign(data, more);
      if (cBuf) { // the map's contours: running sum of the delta-coded half-meter coordinates
        const q = new Int16Array(cBuf), v = new Float32Array(q.length);
        let x = 0, y = 0; for (let i = 0; i < q.length; i += 2) { x += q[i]; y += q[i + 1]; v[i] = x / 2; v[i + 1] = y / 2; }
        let o = 0; data.contours = liteMeta.contours.levels.map(([level, n]) => { const segs = v.subarray(o, o + n); o += n; return { level, segs }; });
      }
      data.deferredDone = true;
      return data;
    })();
  } else { data.deferredDone = true; data.deferred = Promise.resolve(data); }
  return data;
}

async function browserLoad(path, kind) {
  const r = await fetch(new URL(`../${path}`, import.meta.url)); // resolves the same from the page and from the worker
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return kind === 'json' ? r.json() : r.arrayBuffer();
}

export function prepare(data) {
  const { net, layers } = data;
  const nN = net.nodes.length;
  data.nodeEdges = Array.from({ length: nN }, () => []);
  for (const e of net.edges) { data.nodeEdges[e.a].push(e.id); if (e.b !== e.a) data.nodeEdges[e.b].push(e.id); }
  data.edgeMid = net.edges.map(e => midpoint(e.geom));
  // spatial grid for picking and nearest-node queries
  const G = 200; data.grid = new Map(); data.gridSize = G;
  net.edges.forEach(e => {
    const seen = new Set();
    for (const [x, y] of e.geom) { const k = `${Math.floor(x / G)},${Math.floor(y / G)}`; if (!seen.has(k)) { seen.add(k); if (!data.grid.has(k)) data.grid.set(k, []); data.grid.get(k).push(e.id); } }
  });
  const vehNode = new Uint8Array(nN);
  for (const e of net.edges) if (e.mode === 'vehicle' && !e.disconnected) { vehNode[e.a] = 1; vehNode[e.b] = 1; }
  data.nearestNode = (x, y) => {
    let best = -1, bd = Infinity;
    for (let n = 0; n < nN; n++) { if (!vehNode[n]) continue; const d = (net.nodes[n][0] - x) ** 2 + (net.nodes[n][1] - y) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  };
  data.vehicleNodes = []; for (let n = 0; n < nN; n++) if (vehNode[n]) data.vehicleNodes.push(n);
  data.stationNodes = layers.fireStations.map(s => data.nearestNode(...s.pt));
  prepareParkingRules(data);
  if (data.access?.areas) prepareAccess(data.access);
  data.names = [...new Set(net.edges.map(e => e.name).filter(n => n && n !== 'UNNAMED'))].sort();
  return data;
}

// For the plan setting "Enforce no-parking signs and daylighting" (js/parking.js; SOURCE_NOTES PH11, PH12, PH15):
//   signSides[e]  bit 1 = a sign stands left of the segment's drawn direction, bit 2 = right
//   (one record per point and MUTCD code: the City's two sign layers overlap);
//   cornerEnds[e] how many of the segment's two ends meet an intersection (3+ vehicle segments).
function prepareParkingRules(data) {
  const { net, layers } = data, nE = net.edges.length, G = data.gridSize;
  const maxM = data.A.parking?.enforce?.signMatchM ?? 20;
  data.signSides = new Uint8Array(nE); data.cornerEnds = new Uint8Array(nE);
  const seen = new Set();
  for (const s of layers.noParkingSigns || []) {
    const k = `${s.pt}|${s.mutcd}`; if (seen.has(k)) continue; seen.add(k);
    const [x, y] = s.pt; let best = -1, bd = maxM, side = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const id of data.grid.get(`${Math.floor(x / G) + dx},${Math.floor(y / G) + dy}`) || []) {
      const e = net.edges[id]; if (e.mode !== 'vehicle') continue;
      const g = e.geom;
      for (let i = 1; i < g.length; i++) {
        const [ax, ay] = g[i - 1], [bx, by] = g[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)) : 0;
        const d = Math.hypot(x - ax - u * vx, y - ay - u * vy);
        if (d < bd) { bd = d; best = id; side = vx * (y - ay) - vy * (x - ax) > 0 ? 1 : 2; }
      }
    }
    if (best >= 0) data.signSides[best] |= side;
  }
  const vdeg = new Uint16Array(net.nodes.length);
  for (const e of net.edges) if (e.mode === 'vehicle') { vdeg[e.a]++; if (e.b !== e.a) vdeg[e.b]++; }
  for (const e of net.edges) if (e.mode === 'vehicle') data.cornerEnds[e.id] = (vdeg[e.a] >= 3) + (vdeg[e.b] >= 3);
}

// Index access-constrained areas by id and by member street. Areas nest, so an edge can lie
// in several; edgeAreas lists them innermost (highest nesting) first.
function prepareAccess(acc) {
  acc.byId = new Map(acc.areas.map(a => [a.id, a]));
  acc.edgeAreas = new Map(); acc.chokeOf = new Map();
  for (const a of acc.areas) {
    for (const e of a.memberEdges) { if (!acc.edgeAreas.has(e)) acc.edgeAreas.set(e, []); acc.edgeAreas.get(e).push(a); }
    for (const e of a.chokeEdges) acc.chokeOf.set(e, a);
  }
  for (const l of acc.edgeAreas.values()) l.sort((p, q) => q.nesting - p.nesting);
}

export function midpoint(pts) {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= L / 2) { const u = d ? (L / 2 - acc) / d : 0; return [pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1])]; }
    acc += d;
  }
  return pts[0];
}

// Nearest edge to a point within maxD meters.
export function pickEdge(data, x, y, maxD) {
  const G = data.gridSize; let best = null, bd = maxD;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const id of data.grid.get(`${Math.floor(x / G) + dx},${Math.floor(y / G) + dy}`) || []) {
      const g = data.net.edges[id].geom;
      for (let i = 1; i < g.length; i++) {
        const [ax, ay] = g[i - 1], [bx, by] = g[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)) : 0;
        const d = Math.hypot(x - ax - u * vx, y - ay - u * vy);
        if (d < bd) { bd = d; best = id; }
      }
    }
  }
  return best;
}
