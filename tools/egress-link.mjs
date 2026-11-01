// A candidate second way out added to the network at run time, with the network builder's edge
// conventions, without changing data/model/network.json. Shared by tools/access-constraints.mjs
// (--links, --open), tools/egress-candidates.mjs and tools/egress-sim.mjs.
//
// Every value on a new link is a labeled assumption or derived from the DEM (see LINK_PROVENANCE).
// The link carries no evacuation zone, so the simulator places no households on it: Plan A and
// Plan B see the same households, parked cars and departures for a seed (js/sim.js draws them per
// edge in edge order, and the new edge is appended at the end).

export const LINK_ASSUMPTIONS = {
  widthM: 6.1, // 20 ft: the fire-code clear width already used in data/assumptions.json access.fireCodeClearM
  lanes: [1, 1],
  rightOfWayM: 12.2, // 40 ft corridor for counting buildings and parcels (pavement, shoulders, cut and fill)
};

export const LINK_PROVENANCE = {
  geom: 'derived: candidate geometry from tools/egress-candidates.mjs (straight line between two network nodes, an existing path, or the City concept snapped to nodes); not a design',
  lanes: 'assumption: one lane each way, as on every hill street (Eric, 2026-10-31)',
  widthM: 'assumption: 20 ft (6.1 m) paved, the fire-code clear width (data/assumptions.json access.fireCodeClearM); no parking on the new link',
  speedMps: 'assumption: data/assumptions.json capacity.speedMph.hillsLocal (20 mph)',
  capPerLaneVph: 'model rule: the builder\'s two-lane rule (capacity.twoLanePcphPerMph × speed, capped), × capacity.steepFactor where the 90th-percentile 25 m grade is at or above capacity.steepGradePct',
  grade: 'derived: ground profile along the link from the 4 m lidar DEM (the builder\'s sampling); a built road would cut, fill or switch back',
  evacZone: 'model rule: none, so no synthetic households are placed on the new link',
};

const polyLen = g => { let L = 0; for (let i = 1; i < g.length; i++) L += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]); return L; };
function pointAt(pts, f) {
  const L = polyLen(pts) * f; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= L) { const u = d ? (L - acc) / d : 0; return [pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1])]; }
    acc += d;
  }
  return pts[pts.length - 1];
}
export { polyLen, pointAt };

export function demSampler(dem, Z) { // local meters → DEM elevation (m), nearest 4 m cell; null if no data
  return (x, y) => {
    const c = Math.floor(x / dem.resolution), r = Math.floor((dem.ymax - dem.ymin - y) / dem.resolution);
    if (c < 0 || r < 0 || c >= dem.width || r >= dem.height) return null;
    const v = Z[r * dem.width + c]; return v === -32768 ? null : v / 10;
  };
}

// Ground profile every ~4 m (DEM resolution) and grades, as tools/build-network.mjs samples streets:
// gradeMax is the 90th percentile of ~25 m window grades; worst is the single steepest window.
export function profile(geom, elev, res = 4) {
  const len = polyLen(geom), n = Math.max(2, Math.ceil(len / res) + 1), prof = [];
  for (let i = 0; i < n; i++) prof.push(elev(...pointAt(geom, i / (n - 1))));
  const za = prof[0], zb = prof[n - 1], step = len / (n - 1) || 1, W = Math.max(1, Math.round(25 / step)), wins = [];
  for (let i = 0; i + W < n; i++) if (prof[i] != null && prof[i + W] != null) wins.push(Math.abs(prof[i + W] - prof[i]) / (step * W));
  if (!wins.length && za != null && zb != null) wins.push(Math.abs(zb - za) / len);
  wins.sort((x, y) => x - y);
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  return {
    len, za, zb, step, prof,
    climbM: za == null || zb == null ? null : r1(zb - za),
    avgGradePct: za == null || zb == null || !len ? null : r1(Math.abs(zb - za) / len * 100),
    p90GradePct: wins.length ? r1(wins[Math.floor(0.9 * (wins.length - 1))] * 100) : null,
    maxGradePct: wins.length ? r1(wins[wins.length - 1] * 100) : null,
  };
}

// A new two-way local street from node a to node b along geom (local meters).
export function linkEdge(net, A, elev, { id, a, b, geom, name, fireZone }) {
  const P = profile(geom, elev), C = A.capacity, mph = C.speedMph.hillsLocal;
  const e = {
    id: net.edges.length, a, b, name: name || `NEW LINK ${id}`, cls: 'Local', type: null, trav: 'B', mode: 'vehicle',
    src: { egressCandidate: id }, len: Math.round(P.len * 10) / 10, geom: geom.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
    z: [P.za, P.zb], grade: P.za == null || P.zb == null ? null : Math.round((P.zb - P.za) / P.len * 1000) / 10,
    gradeMax: P.p90GradePct ?? 0, gradeReliable: true, fireZone: fireZone ?? null, evacZone: null,
    lanes: LINK_ASSUMPTIONS.lanes.slice(), lanesSrc: 'assumption:newLink', widthM: LINK_ASSUMPTIONS.widthM, widthSrc: 'assumption:newLink',
    parking: 'none', parkingSrc: 'assumption:newLink', clearWidthM: LINK_ASSUMPTIONS.widthM, clearWidthSrc: 'assumption:newLink',
    narrow: false, effLanes: 2, belowFireCodeWidth: false, engineBlocked: false,
    speedMps: Math.round(mph * 0.44704 * 10) / 10,
    capPerLaneVph: Math.min(C.twoLaneMaxPcph, C.twoLanePcphPerMph * mph), capRule: 'two-lane',
    newLink: true,
  };
  if (e.gradeMax >= C.steepGradePct) { e.capPerLaneVph = Math.round(e.capPerLaneVph * C.steepFactor); e.steep = true; }
  return e;
}

// An existing path, stairway or no-vehicle segment opened as a two-way local street (same
// assumptions as a new link). Its evacuation zone is dropped so no households move onto it.
export function openEdge(A, e) {
  const C = A.capacity, mph = C.speedMph.hillsLocal;
  const o = { ...e, mode: 'vehicle', lanes: LINK_ASSUMPTIONS.lanes.slice(), lanesSrc: 'assumption:newLink', evacZone: null, opened: true,
    widthM: LINK_ASSUMPTIONS.widthM, widthSrc: 'assumption:newLink', parking: 'none', parkingSrc: 'assumption:newLink',
    clearWidthM: LINK_ASSUMPTIONS.widthM, clearWidthSrc: 'assumption:newLink', narrow: false, effLanes: 2, belowFireCodeWidth: false, engineBlocked: false,
    speedMps: Math.round(mph * 0.44704 * 10) / 10, capPerLaneVph: Math.min(C.twoLaneMaxPcph, C.twoLanePcphPerMph * mph), capRule: 'two-lane' };
  delete o.barrier; delete o.disconnected;
  if (o.gradeReliable !== false && (o.gradeMax ?? 0) >= C.steepGradePct) { o.capPerLaneVph = Math.round(o.capPerLaneVph * C.steepFactor); o.steep = true; }
  return o;
}

// A copy of the network with edges opened and links appended (nodes are shared; only existing
// nodes are joined). spec: { open: [edge ids], links: [{ id, a, b, geom, name, fireZone }] }.
export function withLinks(net, A, elev, spec = {}) {
  const open = new Set(spec.open || []);
  const edges = net.edges.map(e => open.has(e.id) ? openEdge(A, e) : e);
  const out = { ...net, edges };
  for (const L of spec.links || []) edges.push(linkEdge(out, A, elev, L));
  return out;
}
