// Traffic operations: contraflow on hill exit streets, police control of signals, and a Red Flag
// power shutoff (SOURCE_NOTES CF1–CF14). Every setting is off by default; with all of them off this
// module is never called and a run is identical to one without it.
//
// Nothing here draws a random number. Which streets run contraflow, which junctions officers take
// over and when all follow from the plan, the seed's parked cars, the fire and the households' first
// routes, so Plan A and Plan B still see the same fires, households and parked cars.
//
// Contraflow (plan setting, model rule): once active, both lanes of a chosen two-way street carry
// traffic away from the order area and the inbound direction is closed: evacuees and returning
// commuters no longer route into it, and engines cannot drive up it. A street runs two outbound
// lanes only where the clear width between this plan's parked cars is at least 2 × access.movingLaneM
// (20 ft); elsewhere it stays two-way. The reversed lane carries contraflow.reversedLaneFactor of a
// normal lane's capacity; storage counts both lanes. Junction capacity is unchanged.
// A segment runs only while its zone is ordered or warned: segments in zones the run never tells stay
// two-way, and segments start together only when their zones are told at the same time (CF12).
// Entry points: junctions at the outbound end of a contraflow street, or along it, where another
// street meets it, i.e. where a driver could turn into the closed direction. Each needs an officer
// (officer-staffed) or a sign and gate (pre-installed).
//
// Police control (plan setting, assumption): an officer-controlled junction passes
// (1 + police.capacityUplift) times its model capacity and serves approaches heading toward safety
// before the others. At a signal (js/sim.js setupSignals, SOURCE_NOTES CD21) the officer runs it as an
// actuated signal, green where cars wait, with the uplift on each approach's limit. A dark signal under a
// power shutoff that an officer takes over gets the same.
//
// Power shutoff (scenario setting): City signals in the shutoff area go dark from the start and run as
// all-way stops (powerShutoff.allWayStopVph): their approach limits are off and the junction passes at most
// that many vehicles an hour. OpenStreetMap signals outside Berkeley stay on. Grid-powered contraflow signs fail.

export const CONTRAFLOW_SETS = { none: 'none', main: 'main hill exit streets', custom: 'streets I choose' };
export const POLICE_TARGETS = { none: 'none', pretimed: 'the City\'s 44 pre-timed signals', pretimedAppF: 'pre-timed signals and the Time Study\'s Appendix F congestion points', all: 'every signal and the Appendix F points' };
export const SHUTOFF = { none: 'none', hills: 'signals in and next to the hills dark', all: 'all 146 City signals dark (143 junctions in the model)' };

export const opsActive = (plan, world = {}) => (plan.contraflow && plan.contraflow !== 'none') || (plan.police && plan.police !== 'none') || (world.powerShutoff && world.powerShutoff !== 'none');

// Union-find over edge ids.
function components(ids, edges) {
  const parent = new Map(ids.map(i => [i, i]));
  const find = i => { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i))); i = parent.get(i); } return i; };
  const byNode = new Map();
  for (const i of ids) for (const n of [edges[i].a, edges[i].b]) { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(i); }
  for (const list of byNode.values()) for (let k = 1; k < list.length; k++) { const a = find(list[0]), b = find(list[k]); if (a !== b) parent.set(a, b); }
  const out = new Map(); for (const i of ids) { const r = find(i); if (!out.has(r)) out.set(r, []); out.get(r).push(i); }
  return [...out.values()];
}

// Called once from the Evacuation constructor, after the first route() and before the first
// engine-reach pass.
export function setupOperations(sim) {
  const { data, plan, world } = sim, A = data.A, O = A.operations, net = data.net, edges = net.edges, nN = net.nodes.length;
  const ops = sim.ops = { log: [], cf: null, police: null, shutoff: null, officers: { pool: plan.officers ?? 0, used: 0, cf: 0, signals: 0 }, pending: [] };
  const firstOrder = sim.firstOrderT, officerT = firstOrder + (plan.officerDelayMin ?? O.police.delayMin) * 60;
  const nodeFireT = new Float64Array(nN).fill(Infinity);
  for (const e of edges) { const t = sim.tFire[e.id]; if (t < nodeFireT[e.a]) nodeFireT[e.a] = t; if (t < nodeFireT[e.b]) nodeFireT[e.b] = t; }
  const zoneIdx = new Map(data.layers.evacZones.map((z, i) => [z.id, i]));
  const toldT = e => { const z = zoneIdx.get(e.evacZone); return z == null ? Infinity : Math.min(sim.orderT[z], sim.warnT[z]); };

  // Households' first routes (empty roads): how many households with a car that are told to leave pass
  // each node and each street. Sets the order in which officers are sent.
  const nodeUse = new Float64Array(nN), edgeUse = new Float64Array(edges.length);
  { const { hh, links } = sim, next = sim.next[0], dist = sim.dist[0];
    for (let h = 0; h < hh.n; h++) {
      if (!hh.veh[h] || !(hh.kind[h] === 1 || hh.kind[h] === 2) || hh.early[h]) continue;
      const e = edges[hh.edge[h]]; let n = dist[e.a] <= dist[e.b] ? e.a : e.b;
      for (let k = 0; k < 400 && n >= 0 && !sim.safe[0][n]; k++) { nodeUse[n]++; const o = next[n]; if (!o) break; const L = links[o[0]]; edgeUse[L.e]++; n = L.to; }
    } }

  // ---- power shutoff (scenario) ----
  const dark = new Set(); const J = data.signals?.junctions || [];
  if (world.powerShutoff && world.powerShutoff !== 'none') {
    for (const j of J) if (j.signal && (world.powerShutoff === 'all' || j.hills) && sim.nodeCap[j.node] !== undefined) dark.add(j.node);
    const cap = O.powerShutoff.allWayStopVph / 3600 * (sim.visCap ?? 1); // poor visibility (world.visibility) cuts it too
    ops.baseCap = new Map();
    // A dark signal's approaches lose their green-share limits (js/sim.js setupSignals) and the junction runs as an all-way stop.
    for (const n of dark) { ops.baseCap.set(n, sim.nodeCap[n]); sim.nodeCap[n] = Math.min(sim.nodeCap[n], cap); setDark(sim, n, true); }
    ops.shutoff = { option: world.powerShutoff, dark: dark.size };
    ops.log.push([0, `Red Flag power shutoff: ${dark.size} traffic signals ${world.powerShutoff === 'all' ? 'across the city' : 'in and next to the hills'} are dark and run as all-way stops (about ${O.powerShutoff.allWayStopVph} vehicles per hour through each junction).`, 'plan']);
  }

  // ---- contraflow (plan) ----
  if (plan.contraflow && plan.contraflow !== 'none') {
    const C = O.contraflow, need = 2 * A.access.movingLaneM;
    let cand = [];
    if (plan.contraflow === 'main') cand = (data.contraflow?.edges || []).map(c => ({ id: c.id, dir: c.dir }));
    else for (const id of plan.contraflowEdges || []) { const e = edges[id]; if (!e) continue; const d = sim.dist[0]; if (d[e.a] === Infinity && d[e.b] === Infinity) continue; cand.push({ id, dir: d[e.b] <= d[e.a] ? 0 : 1 }); }
    const status = new Map(), ok = [];
    for (const { id, dir } of cand) {
      const e = edges[id], ls = sim.edgeLinks.get(id) || [], cw = sim.clear[id];
      const out = ls.find(l => sim.links[l].dir === dir), inn = ls.find(l => sim.links[l].dir !== dir);
      const s = { dir, clear: cw, ok: false, reason: '', t: Infinity, comp: -1 };
      status.set(id, s);
      if (out == null || inn == null) { s.reason = 'not a two-way street in the model'; continue; }
      const lanes = e.lanes[0] + e.lanes[1];
      if (Number.isNaN(cw)) { s.reason = 'width unknown'; continue; }
      if (cw < lanes * A.access.movingLaneM) { s.reason = `clear width ${(cw / 0.3048).toFixed(0)} ft between parked cars, under the ${(lanes * A.access.movingLaneM / 0.3048).toFixed(0)} ft two outbound lanes need`; continue; }
      s.ok = true; s.out = out; s.inn = inn; s.lanes = lanes; ok.push(id);
    }
    // Entry points of a piece: the outbound end of each segment where a street outside the piece meets it.
    const entriesOf = ids => {
      const set = new Set(ids), entries = new Set();
      for (const id of ids) { const e = edges[id], head = status.get(id).dir === 0 ? e.b : e.a; if (data.nodeEdges[head].some(o => !set.has(o) && edges[o].mode === 'vehicle' && !edges[o].disconnected)) entries.add(head); }
      return [...entries];
    };
    // A segment runs contraflow only while its zone is ordered or warned (CF12): segments in zones this run
    // never orders or warns are left out, and pieces are formed among segments whose zones are told at the
    // same time, so no segment reverses, closes its inbound lane or holds back engines before its zone is told.
    const byT = new Map(); let never = 0;
    for (const id of ok) {
      const t = toldT(edges[id]);
      if (t === Infinity) { status.get(id).note = 'its zone is not ordered or warned in this run'; never++; continue; }
      if (!byT.has(t)) byT.set(t, []); byT.get(t).push(id);
    }
    const comps = [...byT].flatMap(([told, ids]) => components(ids, edges).map(ids => ({ ids, entries: entriesOf(ids), told, use: Math.max(...ids.map(id => edgeUse[id])), name: [...new Set(ids.map(id => edges[id].name))].slice(0, 2).join(' / ') })))
      .sort((a, b) => b.use - a.use);
    // Sign inventory: the entry points of each whole wide-enough street, plus the activation
    // boundaries where this run's order times split a street into pieces told at different times
    // (an activation needs a sign there too, so the count and cost include it).
    const wholeEntries = new Set(components(ok, edges).flatMap(entriesOf)), installed = new Set(wholeEntries);
    for (const c of comps) for (const n of c.entries) installed.add(n);
    const installedEntries = installed.size, boundaryEntries = installedEntries - wholeEntries.size;
    const hillNode = new Uint8Array(nN); for (const e of edges) if (e.fireZone >= 2) { hillNode[e.a] = 1; hillNode[e.b] = 1; }
    const signs = plan.contraflowMode === 'signs', power = plan.contraflowPower || 'battery', fallback = plan.contraflowFallback || 'officers';
    const cf = ops.cf = { status, comps, entries: 0, active: 0, segments: 0, failedSigns: 0, failedPower: 0, failedFire: 0, short: 0, mode: signs ? 'signs' : 'officers', planned: comps.length, plannedEntries: comps.reduce((s, c) => s + c.entries.length, 0), installedEntries, outside: never };
    comps.forEach((c, k) => {
      c.k = k; for (const id of c.ids) status.get(id).comp = k;
      const signT = c.told + (C.signDelayMin + (power === 'mechanical' ? C.mechanicalExtraMin : 0)) * 60;
      let ready = signs ? signT : Math.max(c.told, officerT), officers = 0, failed = false, why = '';
      for (const n of c.entries) {
        if (signs) {
          const powerFail = power === 'grid' && (world.powerShutoff === 'all' || (world.powerShutoff === 'hills' && hillNode[n]));
          const fireFail = nodeFireT[n] <= signT;
          if (!powerFail && !fireFail) continue;
          cf.failedSigns++; if (powerFail) cf.failedPower++; else cf.failedFire++;
          if (fallback !== 'officers') { failed = true; why = powerFail ? 'grid-powered signs dark in the power shutoff' : 'fire reached a sign before activation'; continue; }
        }
        const tt = Math.max(signs ? signT : c.told, officerT);
        if (nodeFireT[n] <= tt) { failed = true; why = 'fire reached an entry point before an officer could get there'; continue; }
        officers += C.officersPerEntry; ready = Math.max(ready, tt);
      }
      if (!failed && officers) {
        if (ops.officers.pool - ops.officers.used < officers) { failed = true; why = `officers short (needs ${officers}, ${ops.officers.pool - ops.officers.used} left)`; cf.short++; }
        else { ops.officers.used += officers; ops.officers.cf += officers; }
      }
      if (failed) { c.state = `not running: ${why}`; return; }
      c.t = ready; c.officers = officers; c.state = 'scheduled';
      for (const id of c.ids) status.get(id).t = ready;
      ops.pending.push({ kind: 'cf', t: ready, c });
    });
    cf.blocked = new Int8Array(edges.length).fill(-1); // closed direction per edge once active (engines)
    const narrow = [...status.values()].filter(s => !s.ok).length;
    ops.log.push([0, `Contraflow plan (${CONTRAFLOW_SETS[plan.contraflow]}, ${signs ? `pre-installed signs and gates, ${{ grid: 'grid power only', battery: 'battery backup', mechanical: 'mechanical fallback' }[power]}` : 'officer-staffed'}): ${ok.length} of ${cand.length} street segments are wide enough for two outbound lanes with this plan's parked cars; ${narrow} are not and stay two-way. ${signs ? `Signs and gates go at all ${installedEntries} entry points on the wide-enough segments${boundaryEntries ? `, ${boundaryEntries} of them where this run's order times split a street into pieces activated at different times` : ''}${C.costPerEntryUSD[power] ? ` (about $${fmtK(installedEntries * C.costPerEntryUSD[power][0])}–$${fmtK(installedEntries * C.costPerEntryUSD[power][1])}; gates not costed)` : ' (no public unit cost found for mechanical signs and gates)'}. ` : ''}${comps.length} contraflow pieces with ${cf.plannedEntries} entry points lie in zones this run orders or warns${never ? `; ${never} wide-enough segment${never > 1 ? 's lie' : ' lies'} in zones it never orders or warns and stay${never > 1 ? '' : 's'} two-way` : ''}.`, 'plan']);
    const notRunning = comps.filter(c => c.state !== 'scheduled');
    if (notRunning.length) ops.log.push([0, `Contraflow does not run on ${notRunning.length} of the pieces in the order area: ${[...new Set(notRunning.map(c => c.state.replace('not running: ', '')))].slice(0, 3).join('; ')}.`, 'warn']);
  }

  // ---- police control of junctions (plan) ----
  if (plan.police && plan.police !== 'none' && firstOrder < Infinity) {
    const P = O.police;
    const targets = J.filter(j => plan.police === 'all' ? true : plan.police === 'pretimed' ? j.control === 'pretimed' : (j.control === 'pretimed' || j.appF))
      .filter(j => nodeUse[j.node] > 0).sort((a, b) => nodeUse[b.node] - nodeUse[a.node]);
    const chosen = [];
    for (const j of targets) {
      if (ops.officers.pool - ops.officers.used < P.officersPerJunction) break;
      if (nodeFireT[j.node] <= officerT) continue;
      ops.officers.used += P.officersPerJunction; ops.officers.signals += P.officersPerJunction; chosen.push(j);
    }
    ops.police = { targets: targets.length, planned: chosen.length, controlled: 0, nodes: chosen.map(j => j.node), t: officerT, unused: J.filter(j => plan.police === 'all' || j.control === 'pretimed' || (plan.police === 'pretimedAppF' && j.appF)).length - targets.length };
    if (chosen.length) ops.pending.push({ kind: 'police', t: officerT, nodes: chosen.map(j => j.node) });
    ops.log.push([0, `Police control: ${ops.officers.pool} officers. ${ops.officers.cf ? `${ops.officers.cf} staff contraflow entry points; ` : ''}${chosen.length} of ${targets.length} target junctions on evacuation routes get ${P.officersPerJunction} officer${P.officersPerJunction > 1 ? 's' : ''} each from t+${hm(officerT)}${chosen.length ? `, busiest first: ${chosen.slice(0, 3).map(j => j.name).join('; ')}` : ''}.${chosen.length < targets.length ? ` ${targets.length - chosen.length} go unstaffed.` : ''}`, 'plan']);
  }
  ops.pending.sort((a, b) => a.t - b.t);
  ops.prio = null;
  for (const [t, text, kind] of ops.log) sim.events.push({ t, text, kind });
}

const fmtK = x => x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : `${Math.round(x / 1e3)}k`;
const hm = s => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

// Called at the start of every step while something is pending.
export function stepOperations(sim) {
  const ops = sim.ops, t = sim.t; let changed = false, started = null;
  while (ops.pending.length && ops.pending[0].t <= t) {
    const ev = ops.pending.shift(); changed = true;
    if (ev.kind === 'cf') {
      const c = ev.c, cf = ops.cf; let n = 0;
      for (const id of c.ids) {
        if (t >= sim.tFire[id]) continue;
        // The reversed lanes carry reversedLaneFactor of a normal lane (Wolshon 2008, freeway data); storage is the whole street.
        const s = cf.status.get(id), L = sim.links[s.out], I = sim.links[s.inn], out = sim.data.net.edges[id].lanes[s.dir];
        const f = (out + (s.lanes - out) * sim.data.A.operations.contraflow.reversedLaneFactor) / out;
        L.cap *= f; L.storage = Math.floor(L.storage * s.lanes / out);
        if (L.sigK) L.sigK *= f; // at a signal ahead, the reversed lane joins the approach (same reduction)
        I.closed = true; cf.blocked[id] = I.dir; n++;
      }
      c.state = 'running'; cf.active++; cf.segments += n; cf.entries += c.entries.length;
      (started ||= []).push([c, n]);
    } else if (ev.kind === 'police') {
      const P = sim.data.A.operations.police; ops.prio = new Uint8Array(sim.data.net.nodes.length);
      ops.police.controlled = ev.nodes.length; // junctions count as controlled once officers arrive
      for (const n of ev.nodes) {
        const base = ops.baseCap?.get(n) ?? sim.nodeCap[n]; sim.nodeCap[n] = base === Infinity ? Infinity : base * (1 + P.capacityUplift); ops.prio[n] = 1; // unlimited model capacity stays unlimited (a dark signal there gets it back); priority still applies
        // At a signal the officer replaces the signal: green goes where cars wait, as at an actuated signal (Time Study §4.3:
        // staffed control is modeled as actuated timing), with the uplift on each approach. A dark signal gets this back too.
        const sg = sim.signalAt?.get(n); if (sg) { setDark(sim, n, false); sg.police = true; sg.uplift = 1 + P.capacityUplift; }
      }
      markPriority(sim);
      sim.log(`Officers take over ${ev.nodes.length} junctions: each passes ${Math.round(P.capacityUplift * 100)}% more vehicles than its model capacity and lets traffic heading out go first.`, 'plan', ev.nodes[0]);
    }
  }
  if (started) {
    const names = [...new Set(started.map(([c]) => titleCase(c.name)))], segs = started.reduce((a, [, n]) => a + n, 0);
    sim.log(`Contraflow starts on ${segs} street segment${segs > 1 ? 's' : ''} (${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}): both lanes carry traffic out; drivers heading in turn back or find another way, and the model sends no engine up these segments.`, 'plan', sim.data.net.edges[started[0][0].ids[0]].a);
  }
  if (changed) sim.route(); // closed directions and priorities take effect at once; route() draws no random numbers
}

// Turn a signal's approach limits off (dark: all-way stop at the junction's node capacity) or back on.
function setDark(sim, n, dark) {
  const sg = sim.signalAt?.get(n); if (!sg || sg.dark === dark) return;
  sg.dark = dark;
  for (const l of sg.groups.flat()) sim.links[l].ab = dark ? Infinity : 1;
}

// Approaches to officer-controlled junctions that head toward safety (current routes) go first.
export function markPriority(sim) {
  const p = sim.ops.prio; if (!p) return;
  const dist = sim.dist[0];
  for (const L of sim.links) L.prio = p[L.to] === 1 && dist[L.from] > dist[L.to];
}

const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
