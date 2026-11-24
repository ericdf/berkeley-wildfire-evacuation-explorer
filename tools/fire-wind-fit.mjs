#!/usr/bin/env node
// Fire model checks for the wind-dependent head rate (SOURCE_NOTES FW1–FW14). Report only: nothing here changes a
// default or a data file. Every figure is the fire overlay alone (js/fire.js runFire), no traffic.
//
//   node tools/fire-wind-fit.mjs [sections] [--root DIR] [--sev JSON] [--quake 0.27,0.5] [--seeds N]
//     sections (comma list, default all): 1923, 1991, quake, wind, order
//     --root   run another checkout's js/ (for example a worktree of main, for before → after tables)
//     --sev    JSON merged onto SEVERITY, e.g. '{"high":{"rosMpm":30,"slowFactor":0.3}}' (fitting only)
//     --quake  earthquake spread factors to try (default: QUAKE_ROS_FACTOR)
//
// 1923   the City StoryMap's present-day repeat (SOURCE_NOTES S11): ref1923 at medium severity, seeds 1–5; entry =
//        earliest arrival in the 3×3 cells around the 1923 footprint's north-east vertex (StoryMap about 150 min),
//        Shattuck = earliest arrival inside the footprint within 150 m of its west end (StoryMap about 300 min), as in
//        tools/fire-validation.mjs §4a.
// 1991   the 1991-like analysis fire (FV9, FV17): ignition at 37.8625 N, 122.2205 W, 30 mph from 30°, 45° or 60°,
//        seeds 1–3, 510 min, high and medium severity; structures (City footprints in Fire Zones 2–3 and OpenStreetMap
//        outlines elsewhere, data/model/structures.json) in cells the front reached by 1, 2, 4 and 8.5 h, and the
//        farthest burned cell downwind of the ignition at 64 min (record "more than a mile", USFA-TR-060 PDF p. 55).
// quake  structures inside Berkeley the front reaches by 6 h, medium severity, seeds 1–5, each earthquake wind
//        (tools/quake-ros-fit.mjs; HayWired about 2,270 home equivalents, EQ11, WC8).
// wind   the east-wind fire at medium severity, seeds 1–3: area burned by 2 h at 5, 15, 25 and 35 mph.
// order  every Guided fire at low, medium and high severity, seeds 1–5: medians of structures the front reached and
//        of structures under ember exposure by 1, 2, 3, 4 and 6 h (each fire's run ends at its duration).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
process.chdir(ROOT);
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadData } = await imp('js/data.js');
const { buildFireGrid, runFire, CELL, inPoly } = await imp('js/fire.js');
const SC = await imp('js/scenarios.js');
const { toUTM } = await imp('tools/utm.mjs');
const flags = new Set(['--root', '--sev', '--quake', '--seeds']);
const pos = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
const SECTIONS = (pos[0] || '1923,1991,quake,wind,order').split(',');
const SEV = JSON.parse(JSON.stringify(SC.SEVERITY, (k, v) => (k === 'floor' ? undefined : v)));
const over = JSON.parse(opt('--sev') || '{}');
for (const [k, v] of Object.entries(over)) Object.assign(SEV[k], v);
if (SC.SEVERITY.high.floor) SEV.high.floor = SEV[Object.keys(SC.SEVERITY).find(k => SC.SEVERITY[k] === SC.SEVERITY.high.floor)];
const nSeeds = +(opt('--seeds') || 5);

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data), { W, H } = grid, N = W * H;
const st = data.structures, n = new Float32Array(N);
for (const list of [st.structures, st.structuresOther || []]) for (const [c, k] of list) n[c] += k;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const center = i => [(i % W + 0.5) * CELL, (Math.floor(i / W) + 0.5) * CELL];
const scen = SC.makeScenarios(data), byId = id => scen.find(s => s.id === id);
const fmt = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
console.log(`root ${ROOT}; SEVERITY ${JSON.stringify(SEV, (k, v) => (k === 'floor' ? (v ? 'medium' : undefined) : v))}`);

if (SECTIONS.includes('1923')) {
  const sc = byId('ref1923'), ring = data.layers.fire1923[0].rings[0];
  const ne = ring.reduce((b, p) => (p[0] + p[1] > b[0] + b[1] ? p : b), ring[0]), minX = Math.min(...ring.map(p => p[0]));
  const neCell = Math.floor(ne[1] / CELL) * W + Math.floor(ne[0] / CELL);
  const west = []; for (let i = 0; i < N; i++) { const [x, y] = center(i); if (x <= minX + 150 && inPoly(x, y, [ring])) west.push(i); }
  for (const sev of ['central', 'high']) {
    const r = Array.from({ length: nSeeds }, (_, k) => { const F = runFire(grid, sc, SEV[sev], k + 1); return { entry: Math.min(...[-1, 0, 1].flatMap(dr => [-1, 0, 1].map(dc => F.arrival[neCell + dr * W + dc]))), west: Math.min(...west.map(i => F.arrival[i])) }; });
    console.log(`1923 ${sev}: entry ${r.map(x => fmt(x.entry)).join('/')} min (StoryMap ~150); Shattuck ${r.map(x => fmt(x.west)).join('/')} min (~300), median ${fmt(med(r.map(x => x.west)))}`);
  }
}

if (SECTIONS.includes('1991')) {
  const O = data.net.meta.origin, [ox, oy] = toUTM(-122.2205, 37.8625), origin = [ox - O[0], oy - O[1]];
  for (const sev of ['high', 'central']) {
    const rows = [];
    for (const wf of [30, 45, 60]) for (let seed = 1; seed <= 3; seed++) {
      const F = runFire(grid, { id: 'like1991', ignition: origin, windFrom: wf, windMph: 30, durationMin: 510 }, SEV[sev], seed);
      const toR = ((wf + 180) % 360) * Math.PI / 180, dx = Math.sin(toR), dy = Math.cos(toR);
      const at = T => { let s = 0; for (let i = 0; i < N; i++) if (F.arrival[i] <= T) s += n[i]; return s; };
      let far = 0; for (let i = 0; i < N; i++) if (F.arrival[i] <= 64) { const [x, y] = center(i); far = Math.max(far, (x - origin[0]) * dx + (y - origin[1]) * dy); }
      rows.push({ h1: at(60), h2: at(120), h4: at(240), h85: at(510), far });
    }
    const f = k => fmt(med(rows.map(x => x[k])));
    console.log(`1991 ${sev}: structures 1 h ${f('h1')} (~800), 2 h ${f('h2')} (~1,100), 4 h ${f('h4')} (~1,700), 8.5 h ${f('h85')} (~2,900); downwind at 64 min median ${f('far')} m, runs ${fmt(Math.min(...rows.map(x => x.far)))}–${fmt(Math.max(...rows.map(x => x.far)))} m (>1,609)`);
  }
}

if (SECTIONS.includes('quake')) {
  const cells = []; for (const list of [st.structures, st.structuresOther || []]) for (const [c, k] of list) if (grid.inCity[c]) cells.push([c, k]);
  const factors = (opt('--quake') || String(SC.QUAKE_ROS_FACTOR)).split(',').map(Number);
  for (const sc of scen.filter(s => s.kind === 'earthquake')) for (const k of factors) {
    const r = [1, 2, 3, 4, 5].map(seed => { const F = runFire(grid, { ...sc, rosFactor: k }, SEV.central, seed); let s = 0; for (const [c, m] of cells) if (F.arrival[c] <= sc.durationMin) s += m; return s; });
    console.log(`quake ${sc.id.padEnd(15)} factor ${k}: median ${fmt(med(r))} structures in Berkeley by 6 h (seeds ${r.map(fmt).join(', ')}; HayWired ~2,270)`);
  }
}

if (SECTIONS.includes('wind')) {
  const sc = byId('eastWind');
  for (const mph of [5, 15, 25, 35]) {
    const r = [1, 2, 3].map(seed => { const F = runFire(grid, { ...sc, windMph: mph }, SEV.central, seed); let b = 0; for (let i = 0; i < N; i++) if (F.arrival[i] <= 120) b++; return b * CELL * CELL / 1e6; });
    console.log(`wind eastWind medium ${String(mph).padStart(2)} mph: burned by 2 h ${r.map(x => x.toFixed(2)).join(' / ')} km²`);
  }
}

if (SECTIONS.includes('order')) {
  const TS = [60, 120, 180, 240, 360];
  for (const id of ['eastWind', 'ref1923', 'panoramic', 'northHills', 'quake', 'westWind']) {
    const sc = byId(id); if (!sc) continue;
    const res = {};
    for (const sev of ['low', 'central', 'high']) {
      const runs = [1, 2, 3, 4, 5].map(seed => { const F = runFire(grid, sc, SEV[sev], seed); return TS.map(T => { let f = 0, e = 0; for (let i = 0; i < N; i++) { if (n[i] === 0) continue; if (F.arrival[i] <= T) f += n[i]; if (F.ember[i] <= T) e += n[i]; } return [f, e]; }); });
      res[sev] = TS.map((_, j) => [med(runs.map(r => r[j][0])), med(runs.map(r => r[j][1]))]);
    }
    const line = k => TS.map((T, j) => `${T / 60}h ${['low', 'central', 'high'].map(s => fmt(res[s][j][k])).join('/')}`).join('  ');
    const bad = TS.filter((T, j) => T <= sc.durationMin && (res.high[j][0] < res.central[j][0] || res.central[j][0] < res.low[j][0])).map(T => T / 60);
    console.log(`order ${id.padEnd(10)} front L/M/H: ${line(0)}${bad.length ? `  OUT OF ORDER at ${bad.join(', ')} h` : ''}`);
    console.log(`order ${id.padEnd(10)} ember L/M/H: ${line(1)}`);
  }
}
