// Guided view's map layers across the run set (js/guided.js; product brief docs/product-brief-spread-access.md;
// SOURCE_NOTES SA1–SA12, GV1–GV8): for each street segment, in how many of the 15 runs of a fire (today's plan,
// fall night, low/medium/high severity × seeds 1–5) the modeled embers or fire front reached it, and for each area
// with a single way out, in how many the front reached its entrance. Data: data/model/spread-access.json
// (tools/spread-access.mjs); areas from data/model/access-constraints.json (tools/access-constraints.mjs).
import { presence } from './robust.js';

let SA = null, loading = null;
export const loadSpread = () => loading ??= fetch(new URL('../data/model/spread-access.json', import.meta.url))
  .then(r => r.ok ? r.json() : null).catch(() => null).then(d => (SA = d));
export const spread = () => SA;

// Edge and area classes: 0 not applicable, 1 not reached in any (or nearly any) run, 2 mixed, 3 sensitive, 4 consistent.
const CLS = { none: 0, never: 1, mixed: 2, sensitive: 3, consistent: 4 };
const classOf = p => !p.label ? CLS.none : p.label === 'consistent' ? (p.present ? CLS.consistent : CLS.never) : CLS[p.label];
export const PALETTE = {
  spread: ['#e5e7eb', '#cbd5e1', '#f59e0b', '#a855f7', '#b45309'],
  access: ['#e5e7eb', '#60a5fa', '#f59e0b', '#a855f7', '#b91c1c'],
};
const SEVS = ['low', 'central', 'high'];

// Per street segment: in how many runs of each severity embers (or the front) reached it, and its class.
const memo = new Map();
export function edgeClasses(fire, measure) {
  const k = `${fire}|${measure}`; if (memo.has(k)) return memo.get(k);
  const S = SA?.streets?.[fire]; if (!S) return null;
  const n = SA.meta.edges, cls = new Uint8Array(n), counts = SEVS.map(s => S[s][measure]), runs = SEVS.map(s => S[s].runs);
  const levels = e => Object.fromEntries(SEVS.map((s, i) => [s, [parseInt(counts[i][e], 36), runs[i]]]));
  for (let e = 0; e < n; e++) cls[e] = classOf(presence(levels(e)));
  const out = { cls, levels, runs: runs.reduce((a, b) => a + b, 0) };
  memo.set(k, out); return out;
}
// Per access-constrained area: in how many runs the fire front reached its entrance (its only drivable way out).
export function areaClass(fire, id) {
  const A = SA?.areas?.[fire]?.[id], runs = SA ? SA.meta.seeds.length : 5;
  const levels = Object.fromEntries(SEVS.map(s => [s, A?.front?.[s] || [0, runs]]));
  const p = presence(levels);
  return { cls: classOf(p), p, A, levels };
}
export function areaEdgeClasses(data, fire) {
  const k = `area|${fire}`; if (memo.has(k)) return memo.get(k);
  const cls = new Uint8Array(data.net.edges.length);
  if (data.access) for (const [e, areas] of data.access.edgeAreas) if (SA?.areaStatic?.[areas[0].id]) cls[e] = areaClass(fire, areas[0].id).cls;
  memo.set(k, cls); return cls;
}
