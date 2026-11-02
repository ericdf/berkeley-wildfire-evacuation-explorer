// Stacked changes ("Try changes" in the Simple view): any set of the levers in
// data/model/mitigations.json (tools/mitigations.mjs) applied together, the way that tool applies
// each one alone:
//   plan     merged onto DEFAULT_PLAN
//   edges    run-time edge copies (tools/widening-core.mjs noParkingEdge, widenedEdge)
//   link     a new street or an opened path (tools/egress-link.mjs withLinks)
//   retreat  world.retreat in js/sim.js (bought-out street segments, optionally their parked cars)
// None of them moves a household, a parked car or a departure draw: links carry no evacuation zone
// and are appended after every existing edge, and bought-out households take their draws as usual
// (tests/plan-draws.mjs, tests/retreat-draws.mjs). So Today's plan and a stack see the same people.
import { prepare } from './data.js';
import { DEFAULT_PLAN } from './sim.js';
import { withLinks, demSampler } from '../tools/egress-link.mjs';
import { widenedEdge, noParkingEdge, standards, nominalSides } from '../tools/widening-core.mjs';

// Levers a user can stack: those run in the mitigation table, minus the control and conditions.
export const stackable = l => l.ran && l.group !== 'check' && !l.notComparable;

// Street segments a lever rewrites (an edge copy, or a buyout that also clears the curb).
const touched = l => [...(l.delta?.edges?.edges || []), ...(l.delta?.retreat?.clearParking ? l.delta.retreat.edges : [])];

// Why two levers cannot be stacked, or null. Two settings of the same plan key, or two rewrites of
// the same street segment, are alternatives: the user picks one.
export function conflict(a, b) {
  const pa = a.delta?.plan || {}, pb = b.delta?.plan || {};
  for (const k of Object.keys(pa)) if (k in pb && pb[k] !== pa[k]) return 'they are two versions of the same setting';
  const ta = new Set(touched(a));
  if (touched(b).some(e => ta.has(e))) return 'they change the same block of street';
  return null;
}

// The run inputs for a stack: { plan, world, net } (net: null when the street network is unchanged).
export function stackOf(levers) {
  const L = [...levers].sort((x, y) => x.id < y.id ? -1 : 1); // a fixed order, so link ids do not depend on click order
  const plan = { ...DEFAULT_PLAN }, open = [], links = [], repl = [], gone = [], clear = [];
  for (const l of L) {
    const d = l.delta || {};
    if (d.plan) Object.assign(plan, d.plan);
    if (d.link) d.link.open ? open.push(...d.link.open) : links.push({ id: d.link.id, a: d.link.a, b: d.link.b, geom: d.link.geom, fireZone: d.link.fireZone });
    if (d.edges) repl.push({ variant: d.edges.variant, edges: d.edges.edges });
    if (d.retreat) { gone.push(...d.retreat.edges); if (d.retreat.clearParking) clear.push(...d.retreat.edges); }
  }
  const world = gone.length ? { retreat: { edges: [...new Set(gone)], ...(clear.length ? { clearParking: [...new Set(clear)] } : {}) } } : {};
  const net = open.length || links.length || repl.length ? { open, links, repl } : null;
  return { plan, world, net, key: L.map(l => l.id).join('+') };
}

// The prepared data for a stack's network: a copy of the base network with the links added and the
// edge copies swapped in (the base data is never changed). Memoized per network.
const memo = new Map();
export function dataFor(base, net) {
  if (!net) return base;
  const k = JSON.stringify(net);
  if (!memo.has(k)) {
    if (memo.size > 6) memo.delete(memo.keys().next().value);
    const elev = demSampler(base.dem, base.Z);
    const N = withLinks(base.net, base.A, elev, { open: net.open, links: net.links });
    for (const r of net.repl) for (const id of r.edges) {
      const e = base.net.edges[id];
      if (r.variant === 'widen') { const s = nominalSides(base.A, e); N.edges[id] = widenedEdge(base.A, e, Math.max(e.widthM, standards(base.A, s).fireCode), s); }
      else N.edges[id] = noParkingEdge(base.A, e);
    }
    memo.set(k, prepare({ ...base, net: N }));
  }
  return memo.get(k);
}
