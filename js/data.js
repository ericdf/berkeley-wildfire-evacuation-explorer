// Load simulator data and build lookup structures. Works in the browser (fetch) and in
// Node tests (pass a loader that reads files).

export async function loadData(load = browserLoad) {
  const [net, layers, dem, demBuf, A] = await Promise.all([
    load('data/model/network.json', 'json'), load('data/model/layers.json', 'json'),
    load('data/terrain/dem.json', 'json'), load('data/terrain/dem.i16', 'buffer'), load('data/assumptions.json', 'json'),
  ]);
  // Optional: access-constrained areas (tools/access-constraints.mjs), for the map layer and the R0 plan setting. The simulator runs without them.
  const access = await Promise.resolve().then(() => load('data/model/access-constraints.json', 'json')).catch(() => null);
  // Optional: signal junctions (tools/signals.mjs) and main hill exit streets (tools/contraflow-streets.mjs), for the
  // police-control, power-shutoff and contraflow settings. Every setting is off by default.
  const [signals, contraflow] = await Promise.all(['data/model/signals.json', 'data/model/contraflow-streets.json']
    .map(p => Promise.resolve().then(() => load(p, 'json')).catch(() => null)));
  // Optional: LANDFIRE FBFM40 fuel classes on the fire grid (tools/fetch-fuel.mjs), for the opt-in "Fuel" scenario setting.
  const [fuelMeta, fuelBuf] = await Promise.all([['data/terrain/fbfm40.json', 'json'], ['data/terrain/fbfm40.u8', 'buffer']]
    .map(([p, k]) => Promise.resolve().then(() => load(p, k)).catch(() => null)));
  const fuel40 = fuelMeta && fuelBuf ? { meta: fuelMeta, codes: new Uint8Array(fuelBuf) } : null;
  return prepare({ net, layers, dem, Z: new Int16Array(demBuf), A, access, signals, contraflow, fuel40 });
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
  if (data.access?.areas) prepareAccess(data.access);
  data.names = [...new Set(net.edges.map(e => e.name).filter(n => n && n !== 'UNNAMED'))].sort();
  return data;
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
