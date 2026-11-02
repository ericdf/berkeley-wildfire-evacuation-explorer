// Driver information and routing (plan setting, Expert view; SOURCE_NOTES DG1–DG14).
// With the setting at "today" (the default) this module does nothing and js/sim.js routes
// exactly as before. Otherwise sim.route() calls Guidance.route() every minute, and every
// routing decision asks Guidance.tree() which route tree a vehicle follows.
//
// Every option sends drivers to the same places the simulator counts as safe (sim.safe);
// the options differ only in what a driver knows on the way and whom the driver follows.
// A household follows the option (app, guidance) or drives by habit according to its own
// seeded draw, never the shared stream, so plans that differ only in routing see the same
// households, parked cars and fire.

import { mulberry32 } from './rng.js';
import { MinHeap } from './fire.js';

export const ROUTING = {
  today: { label: "Today's model: every driver well informed (idealized)", short: "Today's model", category: 'model rule',
    note: 'Every car re-plans every minute with full knowledge of queues, fire and embers. An idealized, well-informed baseline: real drivers know less. Every result the simulator gave before this setting existed uses it.' },
  habit: { label: 'Habit: usual route to the nearest way out', short: 'Habit', category: 'assumption',
    note: 'Drivers take their usual shortest route (free-flow time, ignoring queues) to the nearest place outside the order area, and change only where a street ahead is burning or full. They ignore embers until embers reach the street they are on, then avoid streets under embers. Surveys after the 2017 and 2018 California fires found 77–87% of evacuees did not use GPS navigation (Wong, Broader and Shaheen 2020, Table 10). The share setting is the share of drivers who drive by habit; the rest follow Today\'s model.' },
  app: { label: 'Ordinary navigation app: live traffic, no fire knowledge', short: 'Ordinary app', category: 'assumption',
    note: 'Like consumer navigation: re-plans every minute on live queues but knows nothing about fire or embers until a road is closed (here, once the fire front reaches it). In the December 2017 Skirball and Creek fires, navigation apps sent drivers onto streets inside evacuation areas because they showed no traffic (Los Angeles City Council motion 17-1407). The share setting is the share of drivers using the app; the rest drive by habit.' },
  guided: { label: 'Constrained egress guidance (hypothetical pilot design)', short: 'Constrained guidance', category: 'model rule',
    note: 'Central guidance with hard constraints, measured against the route each driver would take on their own (by habit). Never worse off: it offers a route only if, under its fire forecast, the route is no riskier than the driver\'s own and either at most a small tolerance slower at current queues or strictly safer. Safety before speed: it never offers a route that takes the driver further into the fire or the current or forecast ember area than their own route would; the forecast is the illustrative fire\'s own arrival times plus a margin, checked at the time the driver would reach each street, and a real forecast would be uncertain. Among equally safe routes it spreads cars across ways out (load balancing). It never tells anyone to delay leaving (no staging). If no route passes, it offers nothing and the driver keeps their own route. The share setting is the share of drivers following it; the rest drive by habit. No agency runs such a system today.' },
  system: { label: 'Unconstrained system-optimal (comparison only)', short: 'Unconstrained system-optimal', category: 'model rule',
    note: 'Load balancing for the whole system with no protection for the individual: each car is routed on the delay it adds to the cars behind it as well as its own, and it has no ember forecast, only today\'s embers. Shown only to measure what the constraint costs or saves. It can send some households on slower or riskier routes, which is why it is not a recommended design. The share setting is the share of drivers following it; the rest drive by habit.' },
};
export const ROUTING_DEFAULTS = { routing: 'today', compliance: 1 };
export const routingOf = plan => (plan && ROUTING[plan.routing] ? plan.routing : 'today');
export const complianceOf = plan => (plan && plan.compliance != null && plan.compliance !== '' ? +plan.compliance : ROUTING_DEFAULTS.compliance);

// null when the plan uses Today's model: sim.js then takes its original code path.
export function makeGuidance(sim) {
  const mode = routingOf(sim.plan);
  return mode === 'today' ? null : new Guidance(sim, mode, complianceOf(sim.plan));
}

// One route tree for one class: distance to safety from every node, the link on that best path
// (via), and the options at a node (up to three, as in sim.route()), computed when first asked.
class Tree {
  constructor(sim, nN, nL) { this.sim = sim; this.dist = new Float64Array(nN); this.via = new Int32Array(nN); this.cost = new Float64Array(nL); this.opts = new Array(nN); this.stamp = new Int32Array(nN).fill(-1); this.version = 0; }
  // from: the node the car arrives from. Guided trees judge the driver's own Habit route as movement
  // would take it (no U-turn back to from while a forward street has a route), so their options are
  // cached per approach; other trees ignore it.
  at(n, from = -1) {
    if (this.pick) {
      if (this.mver !== this.version) { this.mver = this.version; this.mcache = new Map(); }
      const key = n * 1048576 + (from + 1); let o = this.mcache.get(key);
      if (o === undefined) { o = this.pick(n, from); this.mcache.set(key, o); }
      return o;
    }
    if (this.stamp[n] === this.version) return this.opts[n];
    this.stamp[n] = this.version;
    return (this.opts[n] = this.pick ? this.pick(n) : options(this.sim, this, n));
  }
}
function options(sim, tree, n) {
  const { links, outL } = sim, cost = tree.cost, dist = tree.dist;
  if (dist[n] === 0 || !outL[n].length) return null;
  const opts = outL[n].filter(l => cost[l] < Infinity && dist[links[l].to] < Infinity).map(l => [l, cost[l] + dist[links[l].to]]).sort((a, b) => a[1] - b[1]);
  return opts.length ? opts.filter(([, c], i) => i === 0 || c < opts[0][1] * 1.5 + 60).slice(0, 3).map(o => o[0]) : null;
}
const FIRE_RISK = 1e4; // a street in the forecast fire area outranks any time in the ember area

class Guidance {
  constructor(sim, mode, share) {
    this.sim = sim; this.mode = mode; this.share = share;
    const R = sim.data.A.routing;
    this.marginS = R.forecastMarginMin * 60; this.tolS = R.timeToleranceS; this.W = R.emberSecondWeight; this.beta = R.systemQueueWeight;
    const v = sim.v, nN = sim.data.net.nodes.length, nL = sim.links.length;
    // Who follows: one draw per household from a stream keyed by seed and household (non-resident
    // cars by vehicle index), so the same households follow at every share and in every option.
    const draw = (salt, i) => mulberry32((Math.imul(sim.seed + 1, 0x7F4A7C15) ^ Math.imul(salt, 0x94D049BB) ^ Math.imul(i + 1, 0x632BE5AB)) >>> 0)();
    this.follow = new Uint8Array(v.n);
    let followers = 0, drivers = 0;
    for (let i = 0; i < v.n; i++) {
      if (v.cls[i] === 2) continue; // returning commuters drive a fixed path home
      const h = v.hh[i], u = h >= 0 ? draw(1, h) : draw(2, i);
      drivers++; if (u < share) { this.follow[i] = 1; followers++; }
    }
    this.alerted = new Uint8Array(v.n); // habit drivers who have met embers on their street
    this.stats = { mode, share, drivers, followers, offered: 0, safety: 0, faster: 0, declined: 0 };
    const need = mode === 'habit' ? ['habit', 'habitEmber'] : mode === 'app' ? ['habit', 'habitEmber', 'app']
      : mode === 'guided' ? ['habit', 'habitEmber', 'own', 'so', 'guided', 'guidedEmber'] : ['habit', 'habitEmber', 'system'];
    this.T = Object.fromEntries(need.map(k => [k, [new Tree(sim, nN, nL), new Tree(sim, nN, nL)]]));
    this.time = new Float64Array(nL); this.risk = new Float64Array(nL); this.queueTerm = new Float64Array(nL);
    this.lastBurn = -1; this.lastEmber = -1;
    if (mode === 'guided') {
      // Guided followers are measured against the Habit route they would take themselves: the
      // ember-aware one once they have met embers on their street (guidedEmber).
      for (const k of [0, 1]) { this.T.guided[k].pick = (n, from) => this.pickGuided(k, n, this.T.habit[k], from); this.T.guidedEmber[k].pick = (n, from) => this.pickGuided(k, n, this.T.habitEmber[k], from); }
      // forward search from a junction: cost, time, risk and first link per node, reset by generation
      this.F = { c: new Float64Array(nN), tm: new Float64Array(nN), r: new Float64Array(nN), first: new Int32Array(nN), gen: new Int32Array(nN), g: 0 };
    }
  }

  // Called by sim.route() every minute, after Today's tree.
  route() {
    const sim = this.sim, { links, t } = sim, opp = sim.data.A.sharedLane.opposingWaitS, n = links.length, T = this.T;
    let burning = 0, embers = 0;
    // A closed link (the inbound side of a running contraflow street, js/operations.js) counts as burning.
    for (let l = 0; l < n; l++) { const e = links[l].e; if (t >= sim.tFire[e] || links[l].closed) burning++; if (t >= sim.tEmber[e]) embers++; }
    // Habit: free-flow time; a burning street is closed. Rebuilt only when a street starts burning.
    if (burning !== this.lastBurn) for (const k of [0, 1]) {
      const c = T.habit[k].cost;
      for (let l = 0; l < n; l++) c[l] = t >= sim.tFire[links[l].e] || links[l].closed ? Infinity : links[l].ff;
      this.build(T.habit[k], k);
    }
    // Habit after meeting embers: free-flow time plus Today's ember penalty on streets under embers now.
    if (burning !== this.lastBurn || embers !== this.lastEmber) for (const k of [0, 1]) {
      const c = T.habitEmber[k].cost;
      for (let l = 0; l < n; l++) { const e = links[l].e; c[l] = t >= sim.tFire[e] || links[l].closed ? Infinity : links[l].ff + (t >= sim.tEmber[e] ? 300 : 0); }
      this.build(T.habitEmber[k], k);
    }
    this.lastBurn = burning; this.lastEmber = embers;
    if (this.mode === 'habit') return;
    // Expected travel time on each link now: free flow, queue, oncoming cars (Today's cost without the ember penalty).
    const time = this.time, qt = this.queueTerm;
    for (let l = 0; l < n; l++) {
      const L = links[l];
      if (t >= sim.tFire[L.e] || L.closed) { time[l] = Infinity; qt[l] = 0; continue; }
      let q = L.q.length / Math.max(L.cap, 1e-3);
      if (L.share) { const O = links[L.share.links[0] === L.id ? L.share.links[1] : L.share.links[0]]; if (O) q += O.q.length * opp; }
      qt[l] = q; time[l] = L.ff + q;
    }
    if (T.app) for (const k of [0, 1]) { T.app[k].cost.set(time); this.build(T.app[k], k); }
    if (T.system) for (const k of [0, 1]) {
      const c = T.system[k].cost;
      for (let l = 0; l < n; l++) c[l] = time[l] === Infinity ? Infinity : links[l].ff + (1 + this.beta) * qt[l] + (t >= sim.tEmber[links[l].e] ? 300 : 0);
      this.build(T.system[k], k);
    }
    if (T.guided) {
      // Static forecast risk, used only to build the candidate trees: seconds driven on a link if
      // embers are forecast there within the margin of now, plus FIRE_RISK if the fire front is.
      // Candidates are then judged with risk at the time the driver would reach each street (riskAt).
      const horizon = t + this.marginS, risk = this.risk;
      for (let l = 0; l < n; l++) { const e = links[l].e; risk[l] = time[l] === Infinity ? 0 : (sim.tEmber[e] <= horizon ? links[l].ff : 0) + (sim.tFire[e] <= horizon ? FIRE_RISK : 0); }
      for (const k of [0, 1]) {
        // The driver's own best route under the forecast: least risk first, then fastest.
        const own = T.own[k], so = T.so[k], g = T.guided[k];
        for (let l = 0; l < n; l++) own.cost[l] = time[l] === Infinity ? Infinity : time[l] + this.W * risk[l];
        this.build(own, k);
        // Load balancing: the same safety terms, but each car also counts the delay it adds to the cars behind it.
        for (let l = 0; l < n; l++) so.cost[l] = time[l] === Infinity ? Infinity : links[l].ff + (1 + this.beta) * qt[l] + this.W * risk[l];
        this.build(so, k);
        for (const G of [g, T.guidedEmber[k]]) { G.dist.set(own.dist); G.cost.set(own.cost); G.version++; }
      }
    }
  }

  // Forecast risk of link l for a driver who reaches it tau seconds from now: the seconds spent on
  // it if embers are forecast there by the time the driver leaves it plus the margin, and
  // FIRE_RISK if the fire front is.
  riskAt(l, tau) {
    const sim = this.sim, e = sim.links[l].e, leave = sim.t + tau + this.time[l] + this.marginS;
    return (sim.tEmber[e] <= leave ? this.time[l] : 0) + (sim.tFire[e] <= leave ? FIRE_RISK : 0);
  }
  // Time to safety and forecast risk along a tree's best path from node n, judged at arrival times.
  walk(tree, n, k, tau0 = 0) {
    const links = this.sim.links, safe = this.sim.safe[k];
    let tau = tau0, R = 0;
    for (let steps = 0; !safe[n]; steps++) {
      const l = tree.via[n]; if (l < 0 || steps > 5000 || this.time[l] === Infinity) return null;
      R += this.riskAt(l, tau); tau += this.time[l]; n = links[l].to;
    }
    return { T: tau - tau0, R };
  }
  // Safest route from n: forward search on time plus weighted forecast risk at arrival times.
  safest(n, k) {
    const { links, outL } = this.sim, safe = this.sim.safe[k], F = this.F, g = ++F.g, heap = new MinHeap();
    F.gen[n] = g; F.c[n] = 0; F.tm[n] = 0; F.r[n] = 0; F.first[n] = -1; heap.push(0, n);
    while (heap.size) {
      const [c, u] = heap.pop(); if (c > F.c[u]) continue;
      if (safe[u] && u !== n) return { first: F.first[u], T: F.tm[u], R: F.r[u] };
      for (const l of outL[u]) {
        if (this.time[l] === Infinity) continue;
        const r = this.riskAt(l, F.tm[u]), nc = c + this.time[l] + this.W * r, w = links[l].to;
        if (F.gen[w] !== g || nc < F.c[w]) { F.gen[w] = g; F.c[w] = nc; F.tm[w] = F.tm[u] + this.time[l]; F.r[w] = F.r[u] + r; F.first[w] = u === n ? l : F.first[u]; heap.push(nc, w); }
      }
    }
    return null;
  }

  // Constrained guidance at junction n. The driver's own route is the one they would take without
  // guidance (habit). Candidates: the safest route under the forecast and the load-balancing route.
  // Every route is judged along its whole path, with risk at the time the driver would reach each
  // street. A candidate is offered only if it is no riskier than the driver's own route and either at
  // most tolS slower at current queues or strictly safer (safety before speed). The load-balancing
  // route is preferred only when it is as safe as the safest route. If neither passes, guidance
  // offers nothing and the driver keeps their own route. Fallbacks for a full street: the driver's
  // own Habit options.
  pickGuided(k, n, hab, from = -1) {
    const own = this.T.own[k], so = this.T.so[k], eps = 1e-6, links = this.sim.links;
    const hopts = hab.at(n), base = own.at(n);
    if (!hopts || !base) return hopts;
    // The driver's own route is the Habit option movement would actually take: the first one that
    // does not turn back to `from`, if there is one (Evacuation.step()'s no-U-turn rule).
    const fwd = hopts.some(l => links[l].to !== from), hFirst = hopts.find(l => links[l].to !== from) ?? hopts[0];
    const h = this.along(hFirst, hab, k);
    if (!h) return hopts;
    const uturn = l => fwd && links[l].to === from; // movement would skip it, so guidance offers nothing there
    const ok = c => c && !uturn(c.first) && c.R <= h.R + eps && (c.T <= h.T + this.tolS || c.R < h.R - eps);
    const best = this.safest(n, k), lbFirst = so.via[n], lb = lbFirst >= 0 ? { ...this.walk(so, n, k), first: lbFirst } : null;
    // Fallbacks for a full street are the driver's own Habit options, not unvalidated alternatives:
    // only the first street is guidance.
    const pick = first => [first, ...hab.at(n).filter(l => l !== first)].slice(0, 3);
    if (lb && lb.T != null && best && lbFirst !== best.first && lb.R <= best.R + eps && ok(lb)) { this.stats.offered++; return pick(lbFirst); }
    if (best && ok(best)) { if (best.R < h.R - eps) this.stats.safety++; else this.stats.faster++; return pick(best.first); }
    this.stats.declined++;
    return hopts;
  }
  // Time to safety and forecast risk of driving link l now and then following tree to safety.
  along(l, tree, k) {
    if (this.time[l] === Infinity) return null;
    const w = this.walk(tree, this.sim.links[l].to, k, this.time[l]);
    return w && { T: this.time[l] + w.T, R: this.riskAt(l, 0) + w.R, first: l };
  }

  // Reverse Dijkstra from class k's safe nodes on tree.cost, as in sim.route(). Records the best link
  // from each node (via).
  build(tree, k) {
    const sim = this.sim, { links, inL } = sim, cost = tree.cost, safe = sim.safe[k], nN = tree.dist.length;
    const dist = tree.dist.fill(Infinity), via = tree.via.fill(-1), heap = new MinHeap();
    for (let n = 0; n < nN; n++) if (safe[n]) { dist[n] = 0; heap.push(0, n); }
    while (heap.size) {
      const [d, n] = heap.pop(); if (d > dist[n]) continue;
      for (const lid of inL[n]) { const L = links[lid]; const nd = d + cost[lid]; if (nd < dist[L.from]) { dist[L.from] = nd; via[L.from] = lid; heap.push(nd, L.from); } }
    }
    tree.version++;
  }

  // Order of the directions a car can take onto its home street (links of edge eid), best first.
  // Guided followers take guidance's direction only if, judged along the whole route at arrival
  // times, it passes the same rule as at a junction against the direction Habit would take;
  // otherwise they leave the way Habit would. Everyone else sorts by their tree.
  departOrder(i, k, eid, cand) {
    const tr = this.tree(i, k, eid), links = this.sim.links;
    const by = d => [...cand].sort((a, b) => d[links[a].to] - d[links[b].to]);
    if (!tr) return by(this.sim.dist[k]);
    if (this.mode !== 'guided' || !this.follow[i]) return by(tr.dist);
    const hab = this.habitOf(i, k), hOrder = by(hab.dist), gOrder = by(tr.dist);
    if (gOrder[0] === hOrder[0]) return gOrder;
        const h = this.along(hOrder[0], hab, k), c = this.along(gOrder[0], this.T.own[k], k), eps = 1e-6;
    if (h && c && c.R <= h.R + eps && (c.T <= h.T + this.tolS || c.R < h.R - eps)) return gOrder;
    return hOrder;
  }

  // The Habit tree driver i would follow on their own (ember-aware once they have met embers).
  habitOf(i, k) { return this.alerted[i] ? this.T.habitEmber[k] : this.T.habit[k]; }

  // The route tree vehicle i (class 0 or 1) follows on edge e, or null for Today's tree.
  tree(i, k, e) {
    const f = this.follow[i], T = this.T;
    if (this.mode === 'habit' && !f) return null;
    // Every driver, guided or not, notes embers on their street (guidance compares with the Habit
    // route the driver would actually take).
    if (!this.alerted[i] && e >= 0 && this.sim.t >= this.sim.tEmber[e]) this.alerted[i] = 1;
    if (this.mode === 'guided' && f) return this.alerted[i] ? T.guidedEmber[k] : T.guided[k];
    if (this.mode !== 'habit' && f) return T[this.mode][k];
    return this.alerted[i] ? T.habitEmber[k] : T.habit[k];
  }
}

// Diagnostic, not a plan setting: the same run with a different order of serving cars at
// junctions (the shared stream is replaced after setup, so households and parked cars stay the
// same). A run against its reshuffled twin shows how many households move by chance alone: the
// noise floor of "households worse off".
export function reshuffle(sim) { sim.rand = mulberry32((Math.imul(sim.seed + 1, 0x2545F491) ^ 0x5BD1E995) >>> 0); return sim; }

// ---- households worse off (pairs two runs that differ only in routing) ----
// Outcome of each household at the end of a run: level 3 a car of its trip still on the road
// with no road out (cut off), 2 still there (home or road) when the fire front reached it,
// 1 still there when embers reached it, 0 none of these; and minutes from ignition until its
// last car reached safety (Infinity if it did not). A household riding with a neighbor shares
// that neighbor's trip. key checks that the two runs hold the same households.
export function householdOutcomes(sim) {
  const { hh, v, t } = sim, n = hh.n;
  const level = new Uint8Array(n), arrive = new Float64Array(n).fill(Infinity), trip = new Uint8Array(n);
  const vLevel = new Uint8Array(n); // worst level over each household's own cars
  for (let i = 0; i < v.n; i++) {
    const h = v.hh[i]; if (h < 0 || v.cls[i] === 2) continue;
    let x = v.fireFront[i] ? 2 : v.exposed[i] ? 1 : 0;
    if (v.state[i] === 1) { const L = sim.links[v.link[i]], k = v.cls[i]; if (!sim.safe[k][L.to] && !sim.next[k][L.to]) x = 3; }
    if (x > vLevel[h]) vLevel[h] = x;
  }
  let key = n;
  for (let h = 0; h < n; h++) {
    const e = hh.ride[h] >= 0 ? hh.ride[h] : h;
    key = (Math.imul(key, 31) + hh.edge[h] * 7 + hh.zone[h] * 3 + hh.kind[h]) | 0; // fixed at setup (hh.veh can drop during a run)
    if (hh.early[h]) { arrive[h] = 0; trip[h] = 1; continue; } // left before ignition: safe from the start
    let x = vLevel[e];
    const tf = sim.tFire[hh.edge[h]], te = sim.tEmber[hh.edge[h]];
    if (tf <= t && hh.leftHome[e] > tf) x = Math.max(x, 2); else if (te <= t && hh.leftHome[e] > te) x = Math.max(x, 1);
    level[h] = x;
    if (hh.leftHome[e] < Infinity || hh.ride[h] >= 0) trip[h] = 1;
    if (hh.arrived[e] <= t) arrive[h] = hh.arrived[e] / 60;
  }
  return { n, key, level, arrive, trip };
}

// Households worse off under run b than under run a: a worse outcome level, or safety reached
// later by more than delayMin, or not at all. Also the mean change in minutes to safety among
// households that reached it in both runs (positive: faster under b). null when the runs hold
// different households.
// How household h fares under run b against run a: null if not worse off, else the reason
// ('cutOff', 'fireFront', 'embers', 'notSafe', 'later') and the extra minutes to safety.
function worse(a, b, h, delayMin) {
  const la = a.level[h], lb = b.level[h], ta = a.arrive[h], tb = b.arrive[h];
  if (lb > la) return { why: lb === 3 ? 'cutOff' : lb === 2 ? 'fireFront' : 'embers', delay: 0 };
  if (ta < Infinity && tb === Infinity) return { why: 'notSafe', delay: 0 };
  if (ta < Infinity && tb - ta > delayMin) return { why: 'later', delay: tb - ta };
  return null;
}
const same = (...r) => r.every(x => x && x.n === r[0].n && x.key === r[0].key);
const tally = (r, w) => { r.households++; r[w.why]++; if (w.why === 'later') r.worstDelayMin = Math.max(r.worstDelayMin, w.delay); };
const blank = () => ({ households: 0, cutOff: 0, fireFront: 0, embers: 0, later: 0, notSafe: 0, worstDelayMin: 0, compared: 0 });
const active = (rs, h) => rs.some(x => x.trip[h] || x.level[h]);

export function worseOff(a, b, delayMin) {
  if (!same(a, b)) return null;
  const r = blank(); let gainSum = 0, gainN = 0;
  for (let h = 0; h < a.n; h++) {
    if (!active([a, b], h)) continue;
    r.compared++;
    const ta = a.arrive[h], tb = b.arrive[h];
    if (ta < Infinity && tb < Infinity) { gainSum += ta - tb; gainN++; }
    const w = worse(a, b, h, delayMin); if (w) tally(r, w);
  }
  r.meanGainMin = gainN ? gainSum / gainN : null;
  return r;
}

// Households worse off under B than under A in every one of the four actual pairings of two runs
// per plan that differ only in the junction serving order ("beyond chance"). The reason reported
// is the least severe of the four pairings; the delay the smallest.
const SEV = { later: 0, notSafe: 1, embers: 2, fireFront: 3, cutOff: 4 };
export function worseOffBeyondChance(a, a2, b, b2, delayMin) {
  if (!same(a, a2, b, b2)) return null;
  const r = blank();
  for (let h = 0; h < a.n; h++) {
    if (!active([a, a2, b, b2], h)) continue;
    r.compared++;
    let least = null;
    for (const [x, y] of [[a, b], [a, b2], [a2, b], [a2, b2]]) {
      const w = worse(x, y, h, delayMin);
      if (!w) { least = null; break; }
      if (!least || SEV[w.why] < SEV[least.why] || (w.why === least.why && w.delay < least.delay)) least = w;
    }
    if (least) tally(r, least);
  }
  return r;
}

