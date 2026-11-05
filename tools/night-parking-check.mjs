#!/usr/bin/env node
// Acceptance check for the night rule on narrow hill streets (SOURCE_NOTES EV1–EV3, NP1–NP4).
// Compares the 19 blocks Eric counted at about 1 a.m. on 2026-11-05
// (data/field/evening-parking-counts-2026-11-05.json) with the model's night draws, status-quo
// parking, seeds 1–60, under the current night rule and the pre-2026-11-05 rule.
//
//   node tools/night-parking-check.mjs [--seeds 60] [--md]
//
// Passes when: most narrow blocks (24 ft or less) are parked on both sides in most seeds; an engine
// is blocked on most of the 10 pinched blocks in most seeds; the 30–34 ft blocks stay at 0–2% engine-blocked.

import fs from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parkingState } = await import(R + '/js/parking.js');
const net = JSON.parse(fs.readFileSync(R + '/data/model/network.json'));
const A = JSON.parse(fs.readFileSync(R + '/data/assumptions.json'));
const field = JSON.parse(fs.readFileSync(R + '/data/field/evening-parking-counts-2026-11-05.json'));
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const N = +(arg('--seeds') || 60), md = process.argv.includes('--md');
const data = { A, net };
const blocks = field.blocks.filter(b => b.counted !== false);
const rules = { now: undefined, pre: 'pre20261105' };
const res = Object.fromEntries(Object.keys(rules).map(k => [k, blocks.map(() => ({ both: 0, eng: 0, pinch: 0 }))]));
for (const [k, rule] of Object.entries(rules)) for (let seed = 1; seed <= N; seed++) {
  const S = parkingState(data, { hillsParking: 'both' }, seed, { night: true }, { nightRule: rule });
  blocks.forEach((b, i) => { const r = res[k][i]; if (S.sides[b.edge] === 2) r.both++; if (!S.engineOK[b.edge]) r.eng++; if (S.nightPinch[b.edge]) r.pinch++; });
}
const pct = x => Math.round(100 * x / N) + '%';
const rows = blocks.map((b, i) => {
  const e = net.edges[b.edge], ft = e.widthM / 0.3048;
  const pinched = b.pinches !== 'none' && b.pinches !== '0' && b.pinches !== 'on sidewalk';
  return { n: b.n, street: b.street, ft, both: b.side1 > 0 && b.side2 > 0, pinches: b.pinches, pinched,
    preBoth: res.pre[i].both, nowBoth: res.now[i].both, preEng: res.pre[i].eng, nowEng: res.now[i].eng };
});
const head = ['#', 'Street', 'Width ft', 'Field: both sides', 'Field: pinches', 'Both sides, pre-rule', 'Both sides, new rule', 'Engine blocked, pre-rule', 'Engine blocked, new rule'];
const line = r => [r.n, r.street, r.ft.toFixed(0), r.both ? 'yes' : 'no', r.pinches, pct(r.preBoth), pct(r.nowBoth), pct(r.preEng), pct(r.nowEng)];
if (md) { console.log('| ' + head.join(' | ') + ' |'); console.log('|' + head.map(() => '---').join('|') + '|'); for (const r of rows) console.log('| ' + line(r).join(' | ') + ' |'); }
else { console.log(head.join(' | ')); for (const r of rows) console.log(line(r).join(' | ')); }
const narrow = rows.filter(r => r.ft <= 24.01), pinched = rows.filter(r => r.pinched), wide = rows.filter(r => r.ft >= 29.5);
const most = N / 2;
const checks = [
  [`narrow blocks (${narrow.length}) parked on both sides in most seeds`, narrow.filter(r => r.nowBoth > most).length, narrow.length, x => x > narrow.length / 2],
  [`pinched blocks (${pinched.length}) engine-blocked in most seeds`, pinched.filter(r => r.nowEng > most).length, pinched.length, x => x > pinched.length / 2],
  [`30–34 ft blocks (${wide.length}) engine-blocked in at most 2% of seeds, as before`, wide.filter(r => r.nowEng <= 0.02 * N && r.nowEng === r.preEng).length, wide.length, x => x === wide.length],
];
let ok = true;
console.log(`\nSeeds 1–${N}, night, status-quo parking.`);
for (const [label, x, n, pass] of checks) { const p = pass(x); ok &&= p; console.log(`${p ? 'PASS' : 'FAIL'}  ${label}: ${x} of ${n}`); }
const med = a => { const s = [...a].sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };
console.log(`median both sides on narrow blocks: pre ${pct(med(narrow.map(r => r.preBoth)))}, new ${pct(med(narrow.map(r => r.nowBoth)))}; median engine-blocked on pinched blocks: pre ${pct(med(pinched.map(r => r.preEng)))}, new ${pct(med(pinched.map(r => r.nowEng)))}`);
process.exit(ok ? 0 : 1);
