#!/usr/bin/env node
// Rank hill streets by how often the parking model leaves less than an engine's width
// (status-quo parking, 60 seeds, day and night). Used to draft the list of streets in
// correspondence/2026-11-01-berkeley-fire-question.html.
//
//   node tools/engine-trouble-streets.mjs [street-name regex]

import fs from 'node:fs';
import path from "node:path"; import { fileURLToPath } from "node:url";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parkingState } = await import(R + '/js/parking.js');
const net = JSON.parse(fs.readFileSync(R + '/data/game/network.json'));
const A = JSON.parse(fs.readFileSync(R + '/data/assumptions.json'));
const data = { A, net };
const N = 60, by = new Map();
for (const night of [false, true]) for (let seed = 1; seed <= N; seed++) {
  const S = parkingState(data, { hillsParking: 'both' }, seed, { night });
  for (const e of net.edges) {
    if (e.mode !== 'vehicle' || e.disconnected || !(e.fireZone === 2 || e.fireZone === 3) || e.widthM == null) continue;
    const k = e.name; if (!by.has(k)) by.set(k, { len: 0, blk: [0, 0], w: [], narrow: 0, segs: new Set() });
    const b = by.get(k); b.segs.add(e.id);
    if (seed === 1 && !night) { b.len += e.len; b.w.push(e.widthM); if (e.narrow) b.narrow += e.len; }
    if (!S.engineOK[e.id]) b.blk[+night] += e.len / N;
  }
}
const tt = JSON.parse(fs.readFileSync(R + '/data/game/layers.json')).tightTurns.map(t => t.name);
const ttc = {}; for (const n of tt) ttc[n] = (ttc[n] || 0) + 1;
const rows = [...by].map(([n, b]) => ({ n, len: Math.round(b.len), day: b.blk[0] / b.len, nightF: b.blk[1] / b.len, blkM: Math.round(b.blk[1]), minW: Math.min(...b.w) / 0.3048, tt: ttc[n] || 0 }))
  .filter(r => process.argv[2] ? new RegExp(process.argv[2]).test(r.n) : r.blkM >= 30).sort((a, b) => b.blkM - a.blkM);
console.log('street | hill length m | share blocked day | night | night blocked m | min width ft | tight turns');
for (const r of rows.slice(0, 40)) console.log([r.n, r.len, (r.day * 100).toFixed(0) + '%', (r.nightF * 100).toFixed(0) + '%', r.blkM, r.minW.toFixed(0), r.tt].join(' | '));
console.log('streets with any blocked:', rows.length);
console.log('tight-turn streets:', Object.entries(ttc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>n+' '+c).join(', '));
