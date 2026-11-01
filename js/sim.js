// Simplified evacuation and responder-access model. Transparent model rules, not a
// calibrated traffic model. See README "How the simulation works".
//
// Resident egress: households (synthetic, placed on streets in proportion to the
// City's Genasys zone population estimates) leave after their zone is ordered plus
// a notice delay and a preparation time. Each vehicle drives on directed links;
// a link passes at most its capacity, holds at most its storage, and every
// intersection passes at most its capacity. Vehicles route toward the nearest
// node outside the scenario's ordered zones and ember area, re-planning every minute
// with current queues. All streets can be used.
//
// Responder ingress is modeled separately: an engine's travel time from the
// nearest fire station to the ignition area, slowed by oncoming evacuees on
// streets with one usable lane and blocked where parked cars leave less than an
// engine's width.

import { mulberry32 } from './rng.js';
import { toUTM } from '../tools/utm.mjs';
import { parkingState, PARKING_PLANS } from './parking.js';
import { LEAVE_EARLY_ZONES } from './scenarios.js';
import { minFilter, cellOf, MinHeap, inPoly, bbox, inBB, CELL } from './fire.js';

// Sample minutes from a histogram of % per 15-minute period (Time Study Table 5-9 format).
export function sampleHist(hist, rand) {
  const total = hist.reduce((a, b) => a + b, 0); let u = rand() * total;
  for (let k = 0; k < hist.length; k++) { if (u < hist[k]) return (k + u / hist[k]) * 15; u -= hist[k]; }
  return hist.length * 15;
}
// Inverse of a piecewise-linear cumulative curve [[minutes, share], ...].
export function sampleCurve(curve, u) {
  for (let i = 1; i < curve.length; i++) {
    const [t0, p0] = curve[i - 1], [t1, p1] = curve[i];
    if (u <= p1) return p1 > p0 ? t0 + (u - p0) / (p1 - p0) * (t1 - t0) : t1;
  }
  return curve[curve.length - 1][0];
}

const CLASS_RANK = { Local: 0, 'Major Collector': 1, 'Principal Arterial': 2, Ramp: 3, Interstate: 3 };
const INTERSECTION_KEY = ['localVph', 'collectorVph', 'arterialVph', 'freewayVph'];

export const DEFAULT_PLAN = { name: 'Baseline', alertKm: 0, orderDelayMin: 10, hillsOrderMin: null, earlyShare: 0, earlyZones: 'lez', hillsParking: 'both' };

export class Evacuation {
  constructor(data, grid, fire, scenario, sevKey, plan, seed, tod) {
    Object.assign(this, { data, grid, fire, scenario, sevKey, plan, seed, tod });
    const A = data.A, net = data.net;
    this.rand = mulberry32(seed * 104729 + 3);
    this.t = 0; this.dt = 5; this.end = scenario.durationMin * 60;
    this.events = [];
    const nN = net.nodes.length, edges = net.edges;

    // ---- per-edge parking state under this plan (same parked cars for every plan with this seed) ----
    const nE = edges.length;
    const P = this.parking = parkingState(data, plan, seed, tod);
    this.clear = P.clear; this.eff = P.eff; this.engineOK = P.engineOK;
    this.parkingStats = P.stats;

    // ---- fire timing per edge / node (minutes → seconds) ----
    const cellT = (arr, x, y) => { const c = cellOf(grid, x, y); return c < 0 ? Infinity : arr[c] * 60; };
    this.tFire = new Float32Array(nE); this.tEmber = new Float32Array(nE);
    for (const e of edges) { const [x, y] = data.edgeMid[e.id]; this.tFire[e.id] = cellT(fire.arrival, x, y); this.tEmber[e.id] = cellT(fire.ember, x, y); }

    // ---- zone orders and warnings ----
    // 1. The scenario's City-defined zones (Time Study region lists, SOURCE_NOTES E2-E3), or a
    //    City region polygon; issued once the fire is detected and the order decided.
    // 2. Optionally, the plan's distance rule: zones within alertKm of the fire are ordered too.
    const zones = data.layers.evacZones;
    this.orderT = new Float64Array(zones.length).fill(Infinity);
    this.warnT = new Float64Array(zones.length).fill(Infinity);
    const zoneCells = new Int32Array(zones.length), zoneHill = new Int32Array(zones.length);
    const near = plan.alertKm > 0 ? minFilter(fire.arrival, grid.W, grid.H, plan.alertKm * 1000) : null;
    for (let i = 0; i < grid.zone.length; i++) {
      const z = grid.zone[i]; if (z < 0) continue;
      zoneCells[z]++;
      if (grid.fuelClass[i] >= 2) zoneHill[z]++;
      if (near) { const tt = near[i] * 60 + plan.orderDelayMin * 60; if (tt < this.orderT[z]) this.orderT[z] = tt; }
    }
    this.zoneHill = Array.from(zones, (_, z) => zoneCells[z] && zoneHill[z] / zoneCells[z] > 0.3);
    if (plan.hillsOrderMin != null) zones.forEach((_, z) => { if (this.zoneHill[z]) this.orderT[z] = Math.min(this.orderT[z], plan.hillsOrderMin * 60); });
    const decided = plan.orderDelayMin * 60;
    // Orders and warnings from the scenario alone, without what the plan adds (see buildHouseholds).
    const scenOrd = new Uint8Array(zones.length), scenWarn = new Uint8Array(zones.length);
    if (scenario.orders) {
      const norm = id => id.replace(/^OAK-/, 'OKL-');
      const ord = new Set(scenario.orders.order.map(norm)), warn = new Set((scenario.orders.warning || []).map(norm));
      zones.forEach((z, i) => {
        const k = z.zoneId.replace('US-CA-XAL-', '');
        if (ord.has(k)) { this.orderT[i] = Math.min(this.orderT[i], decided); scenOrd[i] = 1; }
        else if (warn.has(k)) { this.warnT[i] = decided; scenWarn[i] = 1; }
      });
    } else if (scenario.orderRegion) {
      // a region can be several polygons (MultiPolygon parts are stored separately)
      const parts = data.layers.evacRegions.filter(r => r.id === scenario.orderRegion).map(r => ({ rings: r.rings, bb: bbox(r.rings) }));
      const inside = new Int32Array(zones.length);
      for (let i = 0; i < grid.zone.length; i++) {
        const z = grid.zone[i]; if (z < 0) continue;
        const x = (i % grid.W + 0.5) * CELL, y = (Math.floor(i / grid.W) + 0.5) * CELL;
        if (parts.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings))) inside[z]++;
      }
      zones.forEach((_, z) => { if (zoneCells[z] && inside[z] / zoneCells[z] >= 0.3) { this.orderT[z] = Math.min(this.orderT[z], decided); scenOrd[z] = 1; } });
    }
    for (let z = 0; z < zones.length; z++) {
      if (this.orderT[z] > this.end) this.orderT[z] = Infinity;
      if (this.orderT[z] < Infinity || this.warnT[z] > this.end) this.warnT[z] = Infinity;
    }
    this.firstOrderT = Math.min(...this.orderT, ...this.warnT);
    // 0 not told, 1 ordered, 2 warned, under the scenario's orders alone: the pattern in which
    // buildHouseholds takes draws from the shared stream, so that pattern is the same for every plan.
    this.scenTold = Array.from(zones, (_, z) => scenOrd[z] ? 1 : scenWarn[z] ? 2 : 0);
    this.scenAny = this.scenTold.some(k => k > 0);
    // Share of each zone's population inside the modeled area (the DEM extent), from the network builder.
    this.zoneModeledShare = Array.from(zones, z => z.pop ? (z.popModeled ?? z.pop) / z.pop : 0);

    // ---- links ----
    const spacing = A.capacity.vehicleSpacingM, SL = A.sharedLane;
    this.sharedLanes = 0; this.gridlockReliefs = 0;
    this.links = []; this.outL = Array.from({ length: nN }, () => []); this.inL = Array.from({ length: nN }, () => []);
    this.edgeLinks = new Map();
    const rank = new Int8Array(nN).fill(-1), deg = new Int16Array(nN);
    for (const e of edges) {
      if (e.mode !== 'vehicle' || e.disconnected || e.barrier?.closed) continue; // OSM diverter or bollard: closed to residents' cars
      const r = CLASS_RANK[e.cls] ?? 0;
      for (const n of [e.a, e.b]) { rank[n] = Math.max(rank[n], r); deg[n]++; }
      const eff = this.eff[e.id];
      const arterial = r === 1 || r === 2;
      // Two-way street with one moving lane (or less) between parked cars: both directions
      // share one lane and take turns at gaps when both have traffic (assumptions sharedLane).
      const twoWay = e.lanes[0] > 0 && e.lanes[1] > 0, narrowed = eff === 0 || eff === 1;
      const squeeze = eff === 0 ? (this.clear[e.id] < SL.crawlBelowM ? SL.crawlFactor : SL.squeezeBelowLaneFactor) : 1;
      let share = null;
      if (twoWay && narrowed) {
        const lost = Math.min(e.len, SL.passingGapM) / e.speedMps + 3;
        share = { cap: e.capPerLaneVph / 3600 * squeeze, eta: SL.platoonS / (SL.platoonS + lost), budget: 1, stamp: -1, links: [], used: [0, 0], both: false };
        this.sharedLanes++;
      }
      for (const d of [0, 1]) {
        const lanes = e.lanes[d]; if (!lanes) continue;
        const el = eff < 0 || eff >= 2 ? lanes : 1;
        const cap = el * e.capPerLaneVph / 3600 * squeeze * (1 - (arterial ? tod.background : 0));
        const id = this.links.length;
        const L = { id, e: e.id, dir: d, from: d ? e.b : e.a, to: d ? e.a : e.b, cap, storage: Math.max(2, Math.floor(e.len * el / spacing)),
          ff: Math.max(2, e.len / e.speedMps), len: e.len, q: [], budget: 1, share };
        // External through traffic on the freeway for the first hours after the order (Time Study Table 3-12, E35)
        const thr = A.nonResident.through[e.name];
        if (thr && cap > 0) L.through = Math.min(0.9, thr.vehicles / A.nonResident.throughHours / 3600 * ((tod.groups || {}).external ?? 0) / cap);
        if (share) share.links.push(id);
        this.links.push(L); this.outL[L.from].push(id); this.inL[L.to].push(id);
        if (!this.edgeLinks.has(e.id)) this.edgeLinks.set(e.id, []);
        this.edgeLinks.get(e.id).push(id);
      }
    }
    this.nodeCap = new Float64Array(nN).fill(Infinity);
    for (let n = 0; n < nN; n++) if (deg[n] >= 3 && rank[n] >= 0)
      this.nodeCap[n] = A.intersections[INTERSECTION_KEY[rank[n]]] * (rank[n] === 1 || rank[n] === 2 ? A.intersections.scale ?? 1 : 1) / 3600 * (rank[n] >= 1 && rank[n] <= 2 ? 1 - tod.background : 1);
    // Traffic circles (OSM junction=roundabout): Time Study capacity about 900 veh/h per lane (E16)
    for (const n of net.meta.circleNodes || []) this.nodeCap[n] = Math.min(this.nodeCap[n], A.intersections.circleVph / 3600);
    this.nodeBudget = new Float64Array(nN).fill(1);
    // Control delay at junctions with light traffic (signals, stop signs): added to the travel
    // time of every link entering a junction (assumptions intersections.delayS).
    const DL = A.intersections.delayS, DK = ['local', 'collector', 'arterial', 'freeway'];
    for (const L of this.links) if (deg[L.to] >= 3 && rank[L.to] >= 0) L.ff += DL[DK[rank[L.to]]] || 0;

    // ---- destinations ----
    // Evacuees (class 0) are safe at any node outside every ordered or warned zone and never
    // under embers. Shadow evacuees (class 1) drive out of the modeled area (the Time Study's
    // network covers its Shadow Region and its destinations lie beyond it).
    this.safe = [new Uint8Array(nN), new Uint8Array(nN)];
    this.nodeZone = new Int16Array(nN).fill(-1); this.nodeOrdered = new Uint8Array(nN);
    const exits = data.exitNodes || (data.exitNodes = new Set(net.meta.exitNodes || []));
    for (let n = 0; n < nN; n++) {
      if (!this.outL[n].length && !this.inL[n].length) continue;
      const [x, y] = net.nodes[n]; const c = cellOf(grid, x, y);
      const z = c >= 0 ? grid.zone[c] : -1; this.nodeZone[n] = z;
      this.nodeOrdered[n] = z >= 0 && this.orderT[z] < Infinity ? 1 : 0;
      const told = z >= 0 && (this.orderT[z] < Infinity || this.warnT[z] < Infinity);
      const embers = c >= 0 && fire.ember[c] < Infinity;
      this.safe[0][n] = (!told || exits.has(n)) && !embers ? 1 : 0; // outside the order/warning area, or out of the modeled area
      this.safe[1][n] = exits.has(n) && !embers ? 1 : 0;
    }

    // ---- households ----
    this.buildHouseholds();
    this.dist = [new Float64Array(nN), new Float64Array(nN)];
    this.next = [new Array(nN), new Array(nN)];
    this.route();
    this.series = { t: [], queued: [], onRoad: [], arrived: [], eta: [] };
    this.nodeWaitMax = new Float32Array(nN); this.nodeWaitAt = new Float32Array(nN);
    this.bigQueueLogged = new Set();
    this.zoneExposureLogged = new Set();
    this.ordersLogged = new Set();
    this.responder = { free: null, eta: null, route: [], blocked: false };
    this.computeResponder(true);
    this.logStart();
    this.record();
  }

  buildHouseholds() {
    const { data, plan, tod } = this, A = data.A, D = A.demand, net = data.net, zones = data.layers.evacZones;
    const rand = this.rand;
    // Plan A and Plan B must see the same households for a seed. Draws from the shared stream
    // (this.rand) are taken in a pattern that depends on the scenario's orders
    // (this.scenTold), never on the plan: a household or non-resident car draws the same numbers
    // whether the plan orders its zone sooner, adds zones or sends it out early. Where a plan needs
    // a number that pattern did not draw (a zone the plan orders but the scenario does not), it
    // comes from that household's or car's supplementary stream, keyed by seed and index, with a
    // fixed slot per decision. Under the scenario's orders alone (DEFAULT_PLAN) the shared stream
    // is drawn exactly as before this rule, so baseline runs did not change.
    const seed = this.seed;
    const extra = (salt, i) => { const r = mulberry32((Math.imul(seed, 0x9E3779B1) ^ Math.imul(salt, 0x85EBCA77) ^ Math.imul(i + 1, 0xC2B2AE3D)) >>> 0); return Array.from({ length: 9 }, () => r()); };
    // Leave-early decision: a separate stream, one draw per household whether or not the plan uses it.
    const earlyRand = mulberry32(seed * 15485863 + 11);
    const byZone = new Map();
    for (const e of net.edges) {
      if (e.mode !== 'vehicle' || e.disconnected || e.barrier?.closed || e.evacZone == null || CLASS_RANK[e.cls] === 3) continue;
      const w = e.len * (e.cls === 'Principal Arterial' ? 0.7 : 1);
      if (!byZone.has(e.evacZone)) byZone.set(e.evacZone, []);
      byZone.get(e.evacZone).push([e.id, w]);
    }
    // vehicles taken by households that drive (Time Study Fig. D-11, renormalized over 1-4+)
    const vs = D.vehiclesTakenShares, vTot = Object.values(vs).reduce((a, b) => a + b, 0);
    const drawVehicles = () => { let u = rand() * vTot; for (const [k, p] of Object.entries(vs)) { if (u < p) return +k; u -= p; } return 1; };
    const zoneIdx = new Map(zones.map((z, i) => [z.id, i]));
    const lez = new Set(LEAVE_EARLY_ZONES);
    const hhEdge = [], hhZone = [], hhVeh = [], hhEarly = [];
    let unplaced = 0;
    for (let zi = 0; zi < zones.length; zi++) {
      const z = zones[zi];
      const pop = z.popModeled ?? z.pop;
      const list = byZone.get(z.id);
      if (!list) { unplaced += pop; continue; }
      const W = list.reduce((s, [, w]) => s + w, 0);
      const H = pop / D.personsPerHousehold;
      for (const [eid, w] of list) {
        const exp = H * w / W; let n = Math.floor(exp); if (rand() < exp - n) n++;
        const eligible = plan.earlyZones === 'fz23' ? net.edges[eid].fireZone >= 2 : lez.has(z.id);
        for (let k = 0; k < n; k++) {
          hhEdge.push(eid); hhZone.push(zoneIdx.get(z.id));
          hhVeh.push(rand() < D.householdsWithoutVehicleShare ? 0 : drawVehicles());
          const uEarly = earlyRand();
          hhEarly.push(eligible && uEarly < plan.earlyShare ? 1 : 0);
        }
      }
    }
    const nH = hhEdge.length;
    const hh = this.hh = { n: nH, edge: Int32Array.from(hhEdge), zone: Int16Array.from(hhZone), veh: Uint8Array.from(hhVeh), early: Uint8Array.from(hhEarly),
      kind: new Uint8Array(nH), // 0 stays, 1 ordered, 2 warned and leaving, 3 shadow (voluntary)
      ride: new Int32Array(nH).fill(-1), depart: new Float64Array(nH).fill(Infinity), leftHome: new Float64Array(nH).fill(Infinity),
      vehLeft: new Uint8Array(nH), arrived: new Float64Array(nH).fill(Infinity),
      commuter: new Uint8Array(nH), // 1 a commuter is driving home; 2 home; 3 turned back
      commuterHome: new Float64Array(nH).fill(Infinity) };
    this.unplacedPeople = unplaced;
    // Who leaves and when (Time Study: 100% of Order zones, 50% of Warning zones, 20% shadow
    // elsewhere in the city and its Shadow Region, here the whole model area; mobilization histograms by household type; SOURCE_NOTES E8, E9).
    const M = D.mobilization15min, C = D.compliance;
    const vHH = [], vDep = [], vCls = [], donors = new Map(), scenDonors = new Map();
    const scenAny = this.scenAny, scenKind = new Uint8Array(nH);
    // Draw slots: 0 warning compliance, 1 shadow, 2 commuter, 3 child pickup, 4 commuter leaves
    // work, 5 return drive, 6 mobilization time, 7 rideshare, 8 which neighbor.
    // Shared-stream draws for the decision to leave, in the scenario pattern; returns the kind
    // the scenario alone would give (0 stays, 1 ordered, 2 warned and leaving, 3 shadow).
    const scenLeave = (z, u) => {
      const st = this.scenTold[z];
      if (st === 2) { u[0] = rand(); if (u[0] >= C.warning) u[1] = rand(); }
      else if (st === 0 && scenAny) u[1] = rand();
      return st === 1 ? 1 : st === 2 && u[0] < C.warning ? 2 : u[1] < C.shadow ? 3 : 0;
    };
    for (let h = 0; h < nH; h++) {
      const z = hh.zone[h];
      const u = new Array(9).fill(NaN); let x = null;
      const g = i => Number.isNaN(u[i]) ? (x || (x = extra(1, h)))[i] : u[i];
      const sk = scenKind[h] = scenLeave(z, u);
      if (sk === 1 || sk === 2) { u[2] = rand(); u[3] = rand(); if (u[2] < tod.commuterShare && hh.veh[h]) { u[4] = rand(); u[5] = rand(); } }
      if (sk) u[6] = rand();
      if (hh.veh[h] && (sk === 1 || sk === 2)) { if (!scenDonors.has(hh.edge[h])) scenDonors.set(hh.edge[h], []); scenDonors.get(hh.edge[h]).push(h); }
      let T, kind;
      if (this.orderT[z] < Infinity) { T = this.orderT[z]; kind = 1; }
      else if (this.warnT[z] < Infinity && g(0) < C.warning) { T = this.warnT[z]; kind = 2; }
      else if (this.firstOrderT < Infinity && g(1) < C.shadow) { T = this.firstOrderT; kind = 3; }
      else continue;
      hh.kind[h] = kind;
      if (hh.early[h]) continue;
      let curve;
      if (kind === 3) curve = M.C;
      else {
        const commuter = g(2) < tod.commuterShare, kids = g(3) < D.childPickupShare * tod.schoolInSession;
        curve = commuter ? (kids ? M.E : M.C) : (kids ? M.F : M.D);
        // The commuter drives home into the evacuating area before the household leaves
        // (Time Study: households awaiting a returning commuter). They leave work on the
        // employee curve (Table 5-9 A), then drive returnDriveMin to reach the area's edge.
        if (commuter && hh.veh[h]) {
          const entry = T + 60 * (sampleHist(M.A, () => g(4)) + D.returnDriveMin[0] + g(5) * (D.returnDriveMin[1] - D.returnDriveMin[0]));
          if (entry < this.end) { hh.commuter[h] = 1; vHH.push(h); vDep.push(entry); vCls.push(2); }
        }
      }
      const dep = T + 60 * sampleHist(curve, () => g(6));
      hh.depart[h] = dep;
      if (!hh.veh[h]) continue;
      if (kind !== 3) { if (!donors.has(hh.edge[h])) donors.set(hh.edge[h], []); donors.get(hh.edge[h]).push(h); }
      if (dep > this.end) continue;
      for (let k = 0; k < hh.veh[h]; k++) { vHH.push(h); vDep.push(dep + k * 20); vCls.push(kind === 3 ? 1 : 0); }
    }
    // Carless households: most ride with a neighbor (Time Study: 86.9% rideshare, E7). The
    // neighbor is picked from those the scenario alone would send out; one who is gone under
    // this plan (left early) is replaced by another neighbor still there.
    this.stranded = 0;
    const isDonor = c => hh.veh[c] && (hh.kind[c] === 1 || hh.kind[c] === 2) && !hh.early[c];
    for (let h = 0; h < nH; h++) {
      const sk = scenKind[h], sd = scenDonors.get(hh.edge[h]);
      let u7 = NaN, u8 = NaN;
      if (!hh.veh[h] && (sk === 1 || sk === 2) && sd) { u7 = rand(); if (u7 < D.carlessRideshareShare) u8 = rand(); }
      if (hh.veh[h] || !hh.kind[h] || hh.kind[h] === 3 || hh.early[h]) continue;
      const d = donors.get(hh.edge[h]); if (!d) continue;
      if (Number.isNaN(u7)) { const x = extra(1, h); u7 = x[7]; u8 = x[8]; }
      if (u7 >= D.carlessRideshareShare) continue;
      const c = sd ? sd[Math.floor(u8 * sd.length)] : -1;
      hh.ride[h] = c >= 0 && isDonor(c) ? c : d[Math.floor(u8 * d.length)];
    }
    // ---- non-resident vehicles: employees, students, visitors (Time Study §3.4-3.6, Table 6-5;
    // SOURCE_NOTES E32-E36). They park on streets in the study's areas, leave on the employee
    // curve (Table 5-9 A), and count in the ETE like residents when inside the order/warning area.
    const nRes = vHH.length, nrEdge = [];
    this.nonResident = {};
    const NR = A.nonResident, G = tod.groups || {}, areas = nonResidentAreas(this.data);
    let nrIdx = 0;
    for (const [gk, g] of Object.entries(NR.groups)) {
      const f = G[g.factor] ?? 0;
      for (const [ak, n] of Object.entries(g.vehicles)) {
        const list = areas[ak]; if (!list || !list.total) continue;
        const count = Math.round(n * f); let made = 0;
        for (let k = 0; k < count; k++) {
          const iv = nrIdx++;
          let u = rand() * list.total, j = 0; while (j < list.cum.length - 1 && list.cum[j] < u) j++;
          const eid = list.ids[j], zl = net.edges[eid].evacZone, z = zoneIdx.get(zl);
          if (z == null) continue;
          // same rule as households: shared draws in the scenario pattern, slot 6 the departure time
          const uu = new Array(9).fill(NaN); let x = null;
          const g = i => Number.isNaN(uu[i]) ? (x || (x = extra(2, iv)))[i] : uu[i];
          if (scenLeave(z, uu)) uu[6] = rand();
          let T, cls;
          if (this.orderT[z] < Infinity) { T = this.orderT[z]; cls = 0; }
          else if (this.warnT[z] < Infinity && g(0) < C.warning) { T = this.warnT[z]; cls = 0; }
          else if (this.firstOrderT < Infinity && g(1) < C.shadow) { T = this.firstOrderT; cls = 1; }
          else continue;
          const dep = T + 60 * sampleHist(M.A, () => g(6));
          if (dep > this.end) continue;
          vHH.push(-1); vDep.push(dep); vCls.push(cls); nrEdge.push(eid); made++;
        }
        this.nonResident[gk] = (this.nonResident[gk] || 0) + made;
      }
    }
    const vEdge = i => i < nRes ? hh.edge[vHH[i]] : nrEdge[i - nRes];
    const order = vHH.map((_, i) => i).sort((a, b) => vDep[a] - vDep[b]);
    const nV = order.length;
    this.v = { n: nV, hh: Int32Array.from(order, i => vHH[i]), depart: Float64Array.from(order, i => vDep[i]), cls: Uint8Array.from(order, i => vCls[i]),
      link: new Int32Array(nV).fill(-1), enter: new Float64Array(nV), state: new Uint8Array(nV), arrive: new Float64Array(nV).fill(Infinity), exposed: new Uint8Array(nV), fireFront: new Uint8Array(nV),
      dest: new Int32Array(nV).fill(-1), pidx: new Int32Array(nV), edge: Int32Array.from(order, i => vEdge(i)),
      exit: new Float64Array(nV).fill(Infinity), fromOrder: new Uint8Array(nV) };
    // Time Study ETE counts vehicles starting in Order zones until they reach a zone under Warning
    // or not under threat (Table 7-1/7-2 notes; SOURCE_NOTES E37).
    for (let i = 0; i < nV; i++) {
      if (this.v.cls[i] !== 0) continue;
      const z = zoneIdx.get(net.edges[this.v.edge[i]].evacZone);
      this.v.fromOrder[i] = z != null && this.orderT[z] < Infinity ? 1 : 0;
    }
    this.commutersTurnedBack = 0; this.lostCar = 0; this.skipVehicle = new Set();
    this.paths = new Map(); this.held = new Map(); // inbound paths; household vehicles waiting for their commuter
    this.nextDepart = 0; this.waiting = []; // vehicles ready to leave but whose street has no room
    this.active = new Set();
  }

  // Reverse Dijkstra from each class's destinations using current queues; burning links excluded.
  route() {
    const { links, inL, outL, t } = this, nN = this.data.net.nodes.length;
    const cost = new Float64Array(links.length);
    for (const L of links) {
      if (t >= this.tFire[L.e]) { cost[L.id] = Infinity; continue; }
      cost[L.id] = L.ff + L.q.length / Math.max(L.cap, 1e-3) + (t >= this.tEmber[L.e] ? 300 : 0);
      // One lane between parked cars: drivers avoid turning into oncoming traffic (sharedLane.opposingWaitS per oncoming car)
      if (L.share) { const O = links[L.share.links[0] === L.id ? L.share.links[1] : L.share.links[0]]; if (O) cost[L.id] += O.q.length * this.data.A.sharedLane.opposingWaitS; }
    }
    for (const k of [0, 1]) {
      const dist = this.dist[k].fill(Infinity), heap = new MinHeap(), safe = this.safe[k], next = this.next[k];
      for (let n = 0; n < nN; n++) if (safe[n]) { dist[n] = 0; heap.push(0, n); }
      while (heap.size) {
        const [d, n] = heap.pop(); if (d > dist[n]) continue;
        for (const lid of inL[n]) { const L = links[lid]; const nd = d + cost[lid]; if (nd < dist[L.from]) { dist[L.from] = nd; heap.push(nd, L.from); } }
      }
      for (let n = 0; n < nN; n++) {
        if (safe[n] || !outL[n].length) { next[n] = null; continue; }
        const opts = outL[n].filter(l => cost[l] < Infinity && dist[links[l].to] < Infinity).map(l => [l, cost[l] + dist[links[l].to]]).sort((a, b) => a[1] - b[1]);
        next[n] = opts.length ? opts.filter(([, c], i) => i === 0 || c < opts[0][1] * 1.5 + 60).slice(0, 3).map(o => o[0]) : null;
      }
    }
    this.linkCost = cost;
    // Inbound commuters: forward tree from every node outside the evacuating area.
    const din = this.inDist || (this.inDist = new Float64Array(nN)), prevL = this.inPrev || (this.inPrev = new Int32Array(nN));
    din.fill(Infinity); prevL.fill(-1);
    const heap = new MinHeap();
    for (let n = 0; n < nN; n++) if (this.safe[0][n] && outL[n].length) { din[n] = 0; heap.push(0, n); }
    while (heap.size) {
      const [d, n] = heap.pop(); if (d > din[n]) continue;
      for (const lid of outL[n]) { const L = links[lid]; const nd = d + cost[lid]; if (nd < din[L.to]) { din[L.to] = nd; prevL[L.to] = lid; heap.push(nd, L.to); } }
    }
  }

  step() {
    const dt = this.dt; this.t += dt; const t = this.t;
    const { links, v, hh } = this;
    if (Math.round(t) % 60 === 0) this.route();
    // budgets
    const A_THR = this.data.A.nonResident.throughHours;
    for (const lid of this.active) {
      const L = links[lid], S = L.share;
      if (!S) { const c = L.through && t < this.firstOrderT + A_THR * 3600 ? L.cap * (1 - L.through) : L.cap; L.budget = Math.min(L.budget + c * dt, 1 + c * dt); continue; }
      if (S.stamp === t) continue;
      S.stamp = t;
      const both = S.links.length === 2 && links[S.links[0]].q.length > 0 && links[S.links[1]].q.length > 0;
      if (both && !S.both) S.used[0] = S.used[1] = 0;
      S.both = both;
      const rate = S.cap * (both ? S.eta : 1);
      S.budget = Math.min(S.budget + rate * dt, 1 + rate * dt);
    }
    const nb = this.nodeBudget, nc = this.nodeCap;
    for (let n = 0; n < nb.length; n++) nb[n] = nc[n] === Infinity ? Infinity : Math.min(nb[n] + nc[n] * dt, 1 + nc[n] * dt); // carry the fraction: capacities under one car per step were being rounded down
    // departures
    while (this.nextDepart < v.n && v.depart[this.nextDepart] <= t) {
      const i = this.nextDepart++, h = v.hh[i];
      if (v.cls[i] !== 2 && hh.commuter[h] === 1) { if (!this.held.has(h)) this.held.set(h, []); this.held.get(h).push(i); continue; }
      if (v.cls[i] !== 2 && this.skipVehicle.has(h)) { this.skipVehicle.delete(h); v.state[i] = 4; continue; } // the car the commuter could not bring home
      this.waiting.push(i);
    }
    if (this.waiting.length) {
      const still = [];
      for (const i of this.waiting) if (!this.enter(i)) still.push(i);
      this.waiting = still;
    }
    // movement
    // Random processing order every step (seeded), so no approach to an intersection is always
    // served last; a fixed order starved some approaches of the intersection's capacity for hours.
    const act = Array.from(this.active), off = 0;
    for (let a = act.length - 1; a > 0; a--) { const b = Math.floor(this.rand() * (a + 1)); [act[a], act[b]] = [act[b], act[a]]; }
    const GR = this.data.A.capacity.gridlockReliefS;
    for (let a = 0; a < act.length; a++) {
      const lid = act[(a + off) % act.length];
      const L = links[lid];
      while (L.q.length) {
        const i = L.q[0];
        const B = L.share || L;
        if (t < v.enter[i] + L.ff || B.budget < 1) break;
        if (L.share && L.share.both && L.share.used[L.dir] > L.share.used[1 - L.dir]) { // take turns with an oncoming car that is waiting
          const O = links[L.share.links[L.share.links[0] === lid ? 1 : 0]];
          if (O.q.length && t >= v.enter[O.q[0]] + O.ff && !this.headBlocked(O)) break; // an oncoming car that can go has its turn
        }
        const k = v.cls[i];
        if (k === 2) { // inbound commuter
          const path = this.paths.get(i), nl = path?.[v.pidx[i]];
          if (L.to === v.dest[i] || L.e === hh.edge[v.hh[i]] || nl == null) { L.q.shift(); L.lastOut = t; B.budget--; if (L.share) L.share.used[L.dir]++; this.commuterHome(i, true); continue; } // reached their street
          if (nb[L.to] < 1) break;
          if (this.linkCost[nl] === Infinity) { L.q.shift(); L.lastOut = t; B.budget--; this.commuterHome(i, false); continue; } // fire ahead: turned back
          const N = links[nl]; if (N.q.length >= N.storage && !this.relieve(i, L, N)) break;
          L.q.shift(); L.lastOut = t; B.budget--; nb[L.to]--; if (L.share) L.share.used[L.dir]++;
          N.q.push(i); v.link[i] = nl; v.enter[i] = t; v.pidx[i]++; this.active.add(nl);
          continue;
        }
        if (v.exit[i] === Infinity && !this.nodeOrdered[L.to]) v.exit[i] = t;
        if (this.safe[k][L.to]) { L.q.shift(); L.lastOut = t; B.budget--; if (L.share) L.share.used[L.dir]++; this.arrive(i); continue; }
        if (nb[L.to] < 1) break;
        let opts = this.next[k][L.to]; if (!opts) break;
        // No U-turns back down the street just driven, unless it is a dead end: take the best
        // other street with a route instead (re-routing otherwise sends cars back and forth
        // around hill loops such as Orchard Ln / Arden Rd).
        if (opts.every(o => links[o].to === L.from)) {
          const dist = this.dist[k], cost = this.linkCost;
          const alt = this.outL[L.to].filter(o => links[o].to !== L.from && cost[o] < Infinity && dist[links[o].to] < Infinity)
            .sort((a, b) => cost[a] + dist[links[a].to] - cost[b] - dist[links[b].to]);
          if (alt.length) opts = alt.slice(0, 2);
        }
        let moved = false;
        for (const nl of opts) {
          const N = links[nl];
          if (N.to === L.from && opts.some(o => links[o].to !== L.from)) continue; // no U-turns unless it is the only way
          if (N.q.length >= N.storage && !this.relieve(i, L, N)) continue;
          L.q.shift(); L.lastOut = t; B.budget--; nb[L.to]--; if (L.share) L.share.used[L.dir]++;
          N.q.push(i); v.link[i] = nl; v.enter[i] = t; this.active.add(nl);
          moved = true; break;
        }
        if (!moved) break;
      }
      if (!L.q.length) this.active.delete(lid);
    }
    if (Math.round(t) % 30 === 0) this.checkExposure();
    if (Math.round(t) % 60 === 0) { this.logOrders(); this.record(); }
    if (Math.round(t) % 300 === 0) this.computeResponder(false);
  }

  enter(i) {
    const { v, hh, links } = this;
    if (v.cls[i] === 2) return this.enterInbound(i);
    const h = v.hh[i], eid = v.edge[i];
    const cand = (this.edgeLinks.get(eid) || []).filter(l => links[l].q.length < links[l].storage);
    if (!cand.length) return false;
    const dist = this.dist[v.cls[i]];
    cand.sort((a, b) => dist[links[a].to] - dist[links[b].to]);
    const L = links[cand[0]];
    L.q.push(i); v.link[i] = L.id; v.enter[i] = this.t - L.ff * this.rand(); v.state[i] = 1; this.active.add(L.id);
    if (h >= 0 && this.t < hh.leftHome[h]) hh.leftHome[h] = this.t;
    return true;
  }

  // Gridlock relief (model rule): a vehicle that has waited gridlockReliefS at the head of a
  // queue squeezes into a full downstream link, as drivers creep forward. A queue model can
  // otherwise lock up permanently in rings such as traffic circles.
  // True if the head vehicle of link L cannot move on because every next link is full or it has no route.
  headBlocked(L) {
    const i = L.q[0], v = this.v, k = v.cls[i];
    if (k !== 2 && this.safe[k][L.to]) return false;
    if (k === 2) { const nl = this.paths.get(i)?.[v.pidx[i]]; return nl != null && L.e !== this.hh.edge[v.hh[i]] && L.to !== v.dest[i] && this.links[nl].q.length >= this.links[nl].storage; }
    const opts = this.next[k][L.to];
    if (!opts) return true;
    return opts.every(nl => nl == null || this.links[nl].q.length >= this.links[nl].storage);
  }

  relieve(i, L, N) {
    const GR = this.data.A.capacity.gridlockReliefS;
    if (this.t - this.v.enter[i] - L.ff < GR || this.t - (N.lastOut ?? -Infinity) < GR || this.t - (N.lastRelief ?? -Infinity) < GR) return false; // only when the full link ahead has not moved either, one car at a time
    N.lastRelief = this.t; this.gridlockReliefs++; return true;
  }

  // A returning commuter enters at the edge of the evacuating area nearest home (by current travel time).
  enterInbound(i) {
    const { v, hh, links, data } = this, h = v.hh[i], e = data.net.edges[hh.edge[h]];
    const home = this.inDist[e.a] <= this.inDist[e.b] ? e.a : e.b;
    if (this.inDist[home] === Infinity) { this.commuterHome(i, false); return true; }
    const path = []; for (let n = home; this.inPrev[n] >= 0 && path.length < 5000;) { const L = links[this.inPrev[n]]; path.push(L.id); n = L.from; }
    path.reverse();
    if (!path.length) { this.commuterHome(i, true); return true; }
    const L = links[path[0]]; if (L.q.length >= L.storage) return false;
    v.dest[i] = home; v.pidx[i] = 1; this.paths.set(i, path);
    L.q.push(i); v.link[i] = L.id; v.enter[i] = this.t; v.state[i] = 1; this.active.add(L.id);
    return true;
  }
  commuterHome(i, ok) {
    const { v, hh } = this, h = v.hh[i];
    v.state[i] = ok ? 2 : 3; v.arrive[i] = this.t; v.link[i] = -1; this.paths.delete(i);
    hh.commuter[h] = ok ? 2 : 3; hh.commuterHome[h] = this.t;
    let held = this.held.get(h) || []; this.held.delete(h);
    // Turned back by fire: the commuter's car never reaches home, so the household has one
    // vehicle fewer. A one-car household is left without a car.
    if (!ok) {
      this.commutersTurnedBack++; hh.veh[h]--; if (!hh.veh[h]) this.lostCar++;
      if (held.length) v.state[held.shift()] = 4; else this.skipVehicle.add(h);
    }
    for (const j of held) this.waiting.push(j);
  }

  arrive(i) {
    const { v, hh } = this; v.state[i] = 2; v.arrive[i] = this.t; v.link[i] = -1;
    const h = v.hh[i]; if (h < 0) return; hh.vehLeft[h]++;
    if (hh.vehLeft[h] >= hh.veh[h]) hh.arrived[h] = this.t;
  }

  checkExposure() {
    const t = this.t;
    for (const lid of this.active) { const L = this.links[lid]; if (t >= this.tEmber[L.e]) for (const i of L.q) this.v.exposed[i] = 1; if (t >= this.tFire[L.e]) for (const i of L.q) this.v.fireFront[i] = 1; }
  }

  record() {
    const s = this.series, { links, v, t } = this;
    let queued = 0, onRoad = 0;
    const wait = new Map();
    for (const lid of this.active) {
      const L = links[lid]; onRoad += L.q.length;
      let w = 0; for (const i of L.q) if (t >= v.enter[i] + L.ff) w++;
      queued += w;
      if (w) wait.set(L.to, (wait.get(L.to) || 0) + w);
    }
    for (const [n, w] of wait) {
      if (w > this.nodeWaitMax[n]) { this.nodeWaitMax[n] = w; this.nodeWaitAt[n] = t; }
      if (w >= 40 && !this.bigQueueLogged.has(n)) { this.bigQueueLogged.add(n); this.log(`Queue of ${w} vehicles waiting at ${this.nodeName(n)}.`, 'queue', n); }
    }
    let arrived = 0; for (let i = 0; i < v.n; i++) if (v.state[i] === 2) arrived++;
    s.t.push(t); s.queued.push(queued); s.onRoad.push(onRoad); s.arrived.push(arrived); s.eta.push(this.responder.eta);
  }

  // ---- responders ----
  // Target: the road node nearest the ignition that engines can still reach without
  // driving through fire (parked cars ignored for this test) and that the fire will
  // not reach for at least 5 minutes, i.e. where an engine would meet the fire edge.
  responderTarget(reach) {
    const { data, t } = this, nodes = data.net.nodes, [ix, iy] = this.scenario.ignition;
    let best = -1, bd = Infinity;
    for (const n of data.vehicleNodes) {
      if (reach[n] === Infinity) continue;
      const c = cellOf(this.grid, nodes[n][0], nodes[n][1]);
      if (c >= 0 && this.fire.arrival[c] * 60 <= t + 300) continue;
      const d = (nodes[n][0] - ix) ** 2 + (nodes[n][1] - iy) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  computeResponder(initial) {
    const { data, links, t } = this, net = data.net, edges = net.edges;
    const A_ACC = data.A.access;
    const stations = data.stationNodes;
    if (!stations.length) return;
    let target = -1;
    // withTraffic: current fire and queues; ignoreParking: pretend every parked car is gone (to find the pinch points)
    const run = (withTraffic, ignoreParking) => {
      const nN = net.nodes.length, dist = new Float64Array(nN).fill(Infinity), prev = new Int32Array(nN).fill(-1), heap = new MinHeap();
      for (const s of stations) { dist[s] = 0; heap.push(0, s); }
      while (heap.size) {
        const [d, n] = heap.pop(); if (d > dist[n]) continue; if (n === target) break;
        for (const eid of data.nodeEdges[n]) {
          const e = edges[eid];
          if (e.mode !== 'vehicle' || e.disconnected) continue;
          if (t >= this.tFire[eid]) continue;
          if (e.barrier?.closed && !e.barrier.engines) continue; // fixed bollards or barriers
          if (!this.engineOK[eid] && !ignoreParking) continue;
          let c = e.len / (e.speedMps * 1.15) + (e.barrier?.closed ? A_ACC.barrierDelayS : 0); // removable bollard or gate: crew opens it
          if (withTraffic) {
            let onEdge = 0; for (const l of this.edgeLinks.get(eid) || []) onEdge += links[l].q.length;
            c += this.eff[eid] >= 2 || this.eff[eid] < 0 ? onEdge * 0.5 : onEdge * 6; // oncoming cars must pull over to let the engine by
          }
          const m = e.a === n ? e.b : e.a; const nd = d + c;
          if (nd < dist[m]) { dist[m] = nd; prev[m] = eid; heap.push(nd, m); }
        }
      }
      const route = []; for (let n = target; prev[n] >= 0;) { const e = edges[prev[n]]; route.push(prev[n]); n = e.a === n ? e.b : e.a; if (route.length > 5000) break; }
      return { eta: target >= 0 ? dist[target] : Infinity, route, dist };
    };
    target = this.responderTarget(run(false, true).dist);
    if (target < 0) { this.responder.eta = Infinity; this.responder.route = []; this.responder.blocked = true; return; }
    if (initial) {
      this.responder.free = run(false, false).eta;
      if (this.responder.free === Infinity) {
        const alt = run(false, true);
        this.responder.pinch = alt.route.filter(eid => !this.engineOK[eid]);
        const names = [...new Set(this.responder.pinch.map(eid => titleCase(edges[eid].name)))];
        this.log(`No fire-engine route reaches the fire edge without moving parked cars. Pinch points on the best route: ${names.slice(0, 4).join(', ') || 'none found'}${names.length > 4 ? ' …' : ''}.`, 'responder');
      }
    }
    const r = run(true, false);
    const prevEta = this.responder.eta;
    this.responder.eta = r.eta; this.responder.route = r.route; this.responder.blocked = r.eta === Infinity; this.responder.target = target;
    if (r.eta === Infinity && prevEta !== Infinity && prevEta != null) {
      const alt = run(true, true);
      const names = [...new Set(alt.route.filter(eid => !this.engineOK[eid]).map(eid => titleCase(edges[eid].name)))];
      this.log(alt.eta < Infinity
        ? `Engines cannot reach the fire edge near ${this.nodeName(target)}: parked cars leave less than an engine's width on ${names.slice(0, 3).join(', ')}.`
        : `Engines cannot reach the fire edge near ${this.nodeName(target)}: fire has closed the approaches.`, 'responder', target);
    }
    else if (!initial && prevEta != null && r.eta > 2 * this.responder.free && prevEta <= 2 * this.responder.free)
      this.log(`Responder approach slowed to ${(r.eta / 60).toFixed(1)} min (${(this.responder.free / 60).toFixed(1)} min on empty roads): oncoming evacuees on streets with one usable lane.`, 'responder');
  }

  // ---- event log ----
  log(text, kind, ref) { this.events.push({ t: this.t, text, kind, ref }); }
  logStart() {
    const { hh, plan, parkingStats, v } = this;
    let early = 0, earlyVeh = 0, stranded = 0, riders = 0, warned = 0, shadow = 0;
    for (let h = 0; h < hh.n; h++) {
      const k = hh.kind[h]; if (!k) continue;
      if (k === 3) { shadow++; continue; }
      if (k === 2) warned++;
      if (hh.early[h]) { early++; earlyVeh += hh.veh[h]; } else if (!hh.veh[h]) { if (hh.ride[h] >= 0) riders++; else stranded++; }
    }
    let shadowVeh = 0, inbound = 0; for (let i = 0; i < v.n; i++) { if (v.cls[i] === 1) shadowVeh++; if (v.cls[i] === 2) inbound++; }
    if (inbound) this.log(`${inbound.toLocaleString()} commuters drive home into the evacuating area before their households leave (Time Study: households awaiting a returning commuter). On streets with one lane between parked cars they must take turns with evacuees driving out.`, 'order');
    if (early) this.log(`Early departure: ${early.toLocaleString()} households (${earlyVeh.toLocaleString()} vehicles) in ${this.plan.earlyZones === 'fz23' ? 'Fire Zones 2–3' : 'the City Leave Early Zones'} left before the fire, so they did not enter the road network during the alert.`, 'plan');
    { const ps = parkingStats;
      this.log(`Parked cars this run (seed ${this.seed}): of ${ps.hillsKnown} hill segments with a known width, ${ps.twoSides} parked on both sides and ${ps.oneSide} on one side; ${ps.pinched} segments have a bad parking job narrowing the gap. ${ps.engineBlocked} segments are too narrow for an engine; ${this.sharedLanes} two-way segments leave one lane, so oncoming drivers take turns.`, 'plan'); }
    if (plan.hillsParking !== 'both') this.log(`Parking plan "${PARKING_PLANS[plan.hillsParking]}": ${parkingChanged(parkingStats)}.`, 'plan');
    if (warned) this.log(`${warned.toLocaleString()} households in warning zones choose to leave (Time Study: 50% of warned households).`, 'order');
    if (shadow) this.log(`${shadow.toLocaleString()} households outside the order and warning zones leave anyway (${shadowVeh.toLocaleString()} vehicles heading out of the model area; Time Study: 20% shadow evacuation).`, 'order');
    if (riders) this.log(`${riders.toLocaleString()} households without a vehicle ride with a neighbor.`, 'order');
    if (stranded) this.log(`${stranded.toLocaleString()} households without a vehicle found no ride. Phase 1 gives them no transport: they stay where they are and are counted as at risk.`, 'warn');
  }
  logOrders() {
    const due = [];
    this.orderT.forEach((T, z) => { if (T <= this.t && !this.ordersLogged.has(z)) { this.ordersLogged.add(z); const id = this.data.layers.evacZones[z].id; if (!due.includes(id)) due.push(id); } });
    const warned = [];
    this.warnT.forEach((T, z) => { if (T <= this.t && !this.ordersLogged.has(-1 - z)) { this.ordersLogged.add(-1 - z); const id = this.data.layers.evacZones[z].id; if (!warned.includes(id)) warned.push(id); } });
    if (warned.length) this.log(`Evacuation warning issued for ${warned.length} zone${warned.length > 1 ? 's' : ''}: ${warned.slice(0, 8).join(', ')}${warned.length > 8 ? ' …' : ''}.`, 'order');
    if (due.length) this.log(`Evacuation order issued for ${due.length} zone${due.length > 1 ? 's' : ''}: ${due.slice(0, 8).join(', ')}${due.length > 8 ? ' …' : ''}.`, 'order');
    // ember exposure reaching zones with people still home
    const { hh } = this; const counts = new Map();
    for (let h = 0; h < hh.n; h++) {
      const te = this.tEmber[hh.edge[h]];
      const e = hh.ride[h] >= 0 ? hh.ride[h] : h;
      if (te <= this.t && hh.leftHome[e] > te && !hh.early[h]) counts.set(hh.zone[h], (counts.get(hh.zone[h]) || 0) + 1);
    }
    for (const [z, n] of counts) if (n >= 10 && !this.zoneExposureLogged.has(z)) {
      this.zoneExposureLogged.add(z);
      const zz = this.data.layers.evacZones[z];
      this.log(`Embers reached zone ${zz.id}${zz.knownAs ? ` (${zz.knownAs.slice(0, 60)})` : ''} while ${n} households had not left${this.orderT[z] === Infinity && this.warnT[z] === Infinity ? ' — the zone had no order or warning' : ''}.`, 'exposure');
    }
  }
  nodeName(n) {
    const names = [...new Set(this.data.nodeEdges[n].map(e => this.data.net.edges[e].name).filter(s => s !== 'UNNAMED'))];
    return names.length ? names.slice(0, 3).map(titleCase).join(' / ') : `node ${n}`;
  }

  // ---- results ----
  summary() {
    const { hh, v, t, data } = this, pph = data.A.demand.personsPerHousehold;
    const S = { orderedPeople: 0, warnedLeaving: 0, shadowLeaving: 0, leftEarly: 0, reachedSafety: 0, onRoad: 0, notLeft: 0, noVehicle: 0, riders: 0,
      notOrderedExposed: 0, exposedHome: 0, exposedRoad: 0, exposedNoVehicle: 0, fireFrontHome: 0, fireFrontRoad: 0, waitingToEnter: this.waiting.length };
    let drivingHH = 0, drivingVeh = 0;
    for (let h = 0; h < hh.n; h++) {
      if (hh.veh[h]) { drivingHH++; drivingVeh += hh.veh[h]; }
      const k = hh.kind[h], z = hh.zone[h];
      const told = (k === 1 && this.orderT[z] <= t) || (k === 2 && this.warnT[z] <= t);
      const e = hh.ride[h] >= 0 ? hh.ride[h] : h; // riders share their neighbor's trip
      const te = this.tEmber[hh.edge[h]];
      const exposedAtHome = te <= t && hh.leftHome[e] > te && !hh.early[h];
      // harsher measure: still home when the fire front itself reached the street
      const tf = this.tFire[hh.edge[h]];
      if (tf <= t && hh.leftHome[e] > tf && !hh.early[h]) S.fireFrontHome += pph;
      if (k === 3 && hh.leftHome[h] <= t) S.shadowLeaving += pph;
      if (!told) { if (exposedAtHome) S.notOrderedExposed += pph; continue; }
      if (k === 1) S.orderedPeople += pph; else S.warnedLeaving += pph;
      if (hh.early[h]) { S.leftEarly += pph; continue; }
      if (!hh.veh[h] && hh.ride[h] < 0) { S.noVehicle += pph; if (exposedAtHome) S.exposedNoVehicle += pph; continue; }
      if (hh.ride[h] >= 0) S.riders += pph;
      if (hh.arrived[e] <= t) S.reachedSafety += pph;
      else if (hh.leftHome[e] <= t) S.onRoad += pph;
      else S.notLeft += pph;
      if (exposedAtHome) S.exposedHome += pph;
    }
    // ETE as the Time Study measures it: minutes from the first order until 50/90/100% of
    // evacuating (non-shadow) vehicles have left the order and warning area.
    let exposedVeh = 0, fireVeh = 0, n0 = 0, nEvac = 0; const arr = [];
    for (let i = 0; i < v.n; i++) {
      if (v.exposed[i]) exposedVeh++;
      if (v.fireFront[i]) fireVeh++;
      if (v.cls[i] || v.state[i] === 4) continue; nEvac++;
      if (!v.fromOrder[i]) continue; n0++;
      const x = Math.min(v.exit[i], v.arrive[i]); if (x < Infinity) arr.push(x - this.firstOrderT);
    }
    S.exposedRoad = exposedVeh * pph / Math.max(1, drivingVeh / Math.max(1, drivingHH));
    S.fireFrontRoad = fireVeh * pph / Math.max(1, drivingVeh / Math.max(1, drivingHH));
    S.vehicles = nEvac; S.orderVehicles = n0; S.nonResidentVehicles = this.nonResident; S.shadowVehicles = [...v.cls].filter(c => c === 1).length; S.vehiclesArrived = arr.length; S.vehiclesExposed = exposedVeh;
    S.vehiclesOnRoad = 0; S.vehiclesNoRoute = 0;
    let inbound = 0, inboundHome = 0;
    for (let i = 0; i < v.n; i++) if (v.cls[i] === 2) { inbound++; if (v.state[i] === 2) inboundHome++; }
    S.gridlockReliefs = this.gridlockReliefs; S.sharedLanes = this.sharedLanes; S.commutersInbound = inbound; S.commutersHome = inboundHome; S.commutersTurnedBack = this.commutersTurnedBack; S.householdsLostCar = this.lostCar;
    for (let i = 0; i < v.n; i++) if (v.state[i] === 1 && v.cls[i] !== 2) { S.vehiclesOnRoad++; const L = this.links[v.link[i]], k = v.cls[i]; if (!this.safe[k][L.to] && !this.next[k][L.to]) S.vehiclesNoRoute++; }
    arr.sort((a, b) => a - b);
    const pct = p => n0 ? (arr.length >= Math.ceil(p * n0) ? arr[Math.ceil(p * n0) - 1] / 60 : null) : null;
    S.clearP50 = pct(0.5); S.clearP90 = pct(0.9); S.clearP100 = pct(1);
    S.firstOrder = this.firstOrderT / 60;
    { let last = 0, all = true; for (let h = 0; h < hh.n; h++) if ((hh.kind[h] === 1 || hh.kind[h] === 2) && hh.veh[h] && !hh.early[h]) { if (hh.arrived[h] === Infinity) all = false; else last = Math.max(last, hh.arrived[h]); } S.lastHousehold = all ? (last - this.firstOrderT) / 60 : null; }
    S.responderFree = this.responder.free / 60; S.responderEta = this.responder.eta / 60; S.responderBlocked = this.responder.blocked;
    S.engineBlockedSegments = this.parkingStats.engineBlocked;
    S.peakQueued = Math.max(0, ...this.series.queued);
    S.bottlenecks = [...this.nodeWaitMax.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([n, w]) => ({ node: n, name: this.nodeName(n), max: w, at: this.nodeWaitAt[n] / 60 }));
    S.unplacedPeople = this.unplacedPeople;
    S.zonesOrdered = this.orderT.filter(T => T <= t).length;
    S.zonesWarned = this.warnT.filter(T => T <= t).length;
    S.t = t / 60;
    return S;
  }

  runToEnd() { while (this.t < this.end) this.step(); return this.summary(); }
}

// Street segments where non-resident vehicles park, by the Time Study's areas (Table 3-5) plus
// student and visitor areas. Approximations (model rule): areas from City neighborhoods, fire zones
// and distance to campus, BCC, LBNL and the Tilden park entrances. Weighted by street length.
function nonResidentAreas(data) {
  if (data._nrAreas) return data._nrAreas;
  const net = data.net, O = net.meta.origin, NR = data.A.nonResident;
  const P = ([lon, lat]) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
  const near = (pt, m) => ([x, y]) => Math.hypot(x - pt[0], y - pt[1]) <= m;
  const hood = names => { const ps = data.layers.neighborhoods.filter(n => names.includes(n.name)).map(n => ({ rings: n.rings, bb: bbox(n.rings) })); return ([x, y]) => ps.some(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings)); };
  const P_ = Object.fromEntries(Object.entries(NR.points).map(([k, v]) => [k, P(v)]));
  const inUC = hood(['University of California Berkeley']), inWest = hood(NR.westNeighborhoods);
  const isBcc = near(P_.bcc, 400), nearCampus = near(P_.campus, NR.studentParkingM);
  const isTilden = p => near(P_.tildenNorth, 400)(p) || near(P_.tildenSouth, 400)(p);
  const out = {}; const add = (k, id, w) => { (out[k] ??= { ids: [], cum: [], total: 0 }); out[k].total += w; out[k].ids.push(id); out[k].cum.push(out[k].total); };
  for (const e of net.edges) {
    const zl = String(e.evacZone || '');
    if (e.mode !== 'vehicle' || e.disconnected || e.barrier?.closed || CLASS_RANK[e.cls] === 3 || !(zl.startsWith('BER') || zl.startsWith('LBL'))) continue;
    const m = data.edgeMid[e.id], w = e.len;
    const hills = e.fireZone >= 2;
    const area = zl.startsWith('LBL') ? 'lbnl' : inUC(m) ? 'uc' : inWest(m) ? 'west' : hills ? (m[1] > P_.campus[1] ? 'northHills' : 'southHills') : 'flats';
    add(area, e.id, w);
    if (area === 'lbnl') continue;
    if (!hills) add('city', e.id, w); // visitors park in the flats and garages (hill parking is residents')
    if (nearCampus(m) && !hills && area !== 'uc') add('ucStudents', e.id, w); // commuting students park around campus, not on hill streets
    if (area === 'uc') add('ucOnCampus', e.id, w);
    if (isBcc(m)) add('bcc', e.id, w);
    if (isTilden(m)) add('tilden', e.id, w);
  }
  return (data._nrAreas = out);
}

const parkingChanged = s => `${s.parkingChanged} hill segments lose parked cars on at least one side; ${s.engineFixed} segments that were too narrow for an engine become passable`;
export const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Av|Wy|St|Rd|Dr|Pl|Ct|Ln|Te|Bl)\b/g, m => m);
