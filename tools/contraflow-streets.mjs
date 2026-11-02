#!/usr/bin/env node
// Main hill exit streets for the contraflow plan setting. Writes data/model/contraflow-streets.json.
//
//   node tools/contraflow-streets.mjs [--seeds 3]
//
// Derived from status-quo runs of the simulator (js/sim.js), fire on, central severity, seeds 1..N,
// on the three Simple-view fires (east wind at night, 1923 repeat on a fall weekday, Panoramic Hill
// on a fall weekday). For every street segment it counts the vehicles that started in Order zones
// and drove along it, by direction. A segment is a main hill exit (model rule) when:
//   - it is a two-way street with one lane each way (contraflow turns both lanes outbound),
//   - it is in Berkeley's or the neighboring hills (Fire Zones 2–3, or the 90 m elevation proxy beyond
//     the city line), or ends at a junction with such a street (where hill traffic leaves),
//   - in the median run of at least one fire, at least MIN_FLOW order-zone vehicles drove it, and
//   - over all runs, at least DOMINANT of them drove the same way (that way is "outbound").
// The entrances of access-constrained areas with at least CHOKE_RESIDENTS residents
// (data/model/access-constraints.json, chokeEdges) are added with the outward direction, even below
// MIN_FLOW: they are the streets the Time Study and the SB 99 analysis single out, and most are too
// narrow for two lanes, which the inspector reports.
// Rerun after every network rebuild: edge ids change.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const MIN_FLOW = 300, DOMINANT = 0.9, CHOKE_RESIDENTS = 100;
const FIRES = ['eastWind', 'ref1923', 'panoramic'];
const load = async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

if (argv[0] === '--worker') {
  const [, fireId, seedS] = argv; const seed = +seedS;
  const { loadData } = await import(R + '/js/data.js');
  const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
  const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
  const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
  const data = await loadData(load); const grid = buildFireGrid(data);
  const sc = makeScenarios(data).find(s => s.id === fireId);
  const sim = new Evacuation(data, grid, runFire(grid, sc, SEVERITY.central, seed), sc, 'central', DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay]);
  const v = sim.v, prev = new Int32Array(v.n).fill(-1), cnt = new Map();
  const add = l => { const L = sim.links[l]; const k = L.e; if (!cnt.has(k)) cnt.set(k, [0, 0]); cnt.get(k)[L.dir]++; };
  while (sim.t < sim.end) {
    sim.step();
    for (let i = 0; i < v.n; i++) { const l = v.link[i]; if (l >= 0 && l !== prev[i] && v.fromOrder[i]) add(l); prev[i] = l; }
  }
  process.stdout.write(JSON.stringify([...cnt]));
  process.exit(0);
}

const seeds = Array.from({ length: +(argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : 3) }, (_, i) => i + 1);
const jobs = FIRES.flatMap(f => seeds.map(s => [f, s]));
const run = promisify(execFile), results = new Map();
const nW = Math.min(os.cpus().length, jobs.length); let next = 0;
await Promise.all(Array.from({ length: nW }, async () => {
  while (next < jobs.length) {
    const [f, s] = jobs[next++];
    const { stdout } = await run(process.execPath, [SELF, '--worker', f, String(s)], { maxBuffer: 1 << 28 });
    results.set(`${f}|${s}`, new Map(JSON.parse(stdout))); console.error(`done ${f} seed ${s}`);
  }
}));

const net = JSON.parse(fs.readFileSync(path.join(R, 'data/model/network.json'), 'utf8'));
const access = JSON.parse(fs.readFileSync(path.join(R, 'data/model/access-constraints.json'), 'utf8'));
const edges = net.edges;
const hill = e => e.fireZone >= 2;
const hillNode = new Set(); for (const e of edges) if (e.mode === 'vehicle' && hill(e)) { hillNode.add(e.a); hillNode.add(e.b); }
const twoWay = e => e.mode === 'vehicle' && !e.disconnected && !e.barrier?.closed && e.lanes[0] === 1 && e.lanes[1] === 1 && !['Interstate', 'Ramp'].includes(e.cls);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const out = new Map();
for (const e of edges) {
  if (!twoWay(e) || !(hill(e) || hillNode.has(e.a) || hillNode.has(e.b))) continue;
  const tot = [0, 0], byFire = {};
  for (const f of FIRES) {
    const per = seeds.map(s => { const c = results.get(`${f}|${s}`).get(e.id) || [0, 0]; tot[0] += c[0]; tot[1] += c[1]; return c[0] + c[1]; });
    byFire[f] = median(per);
  }
  const all = tot[0] + tot[1], dir = tot[0] >= tot[1] ? 0 : 1, peak = Math.max(...Object.values(byFire));
  if (peak >= MIN_FLOW && all && tot[dir] / all >= DOMINANT) out.set(e.id, { id: e.id, dir, name: e.name, flow: byFire, why: ['flow'] });
}
// Choke entrances: outward is toward the area's outer node.
let chokes = 0;
for (const a of access.areas) {
  if (a.residents < CHOKE_RESIDENTS) continue;
  for (const id of a.chokeEdges) {
    const e = edges[id]; if (!twoWay(e)) continue;
    const dir = e.b === a.chokeOuterNode ? 0 : e.a === a.chokeOuterNode ? 1 : null; if (dir == null) continue;
    if (out.has(id)) { if (out.get(id).dir === dir) out.get(id).why.push('choke'); continue; }
    const flow = {}; for (const f of FIRES) flow[f] = median(seeds.map(s => { const c = results.get(`${f}|${s}`).get(id) || [0, 0]; return c[0] + c[1]; }));
    out.set(id, { id, dir, name: e.name, flow, why: ['choke'], area: a.id, areaResidents: Math.round(a.residents) }); chokes++;
  }
}
const list = [...out.values()].sort((a, b) => a.id - b.id);
const streets = {}; for (const s of list) { (streets[s.name] ??= { name: s.name, segments: 0, lengthM: 0 }); streets[s.name].segments++; streets[s.name].lengthM += edges[s.id].len; }
const doc = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    rule: `Two-way hill streets (Fire Zones 2–3 or the 90 m proxy, or ending at a hill junction) that at least ${MIN_FLOW} order-zone vehicles drove in the median status-quo run of at least one fire (eastWind S6, ref1923 S4, panoramic S4; central severity; fire on; seeds ${seeds.join(', ')}), ${DOMINANT * 100}% or more of them the same way; plus the entrances of access-constrained areas with ${CHOKE_RESIDENTS} or more residents. Model rule; tools/contraflow-streets.mjs.`,
    segments: list.length, fromChokes: chokes, streets: Object.keys(streets).length,
  },
  streets: Object.values(streets).sort((a, b) => b.lengthM - a.lengthM).map(s => ({ ...s, lengthM: Math.round(s.lengthM) })),
  edges: list,
};
fs.writeFileSync(path.join(R, 'data/model/contraflow-streets.json'), JSON.stringify(doc));
console.log(JSON.stringify(doc.meta, null, 1));
console.log(doc.streets.slice(0, 40).map(s => `${s.name} ${s.segments} seg ${s.lengthM} m`).join('\n'));
