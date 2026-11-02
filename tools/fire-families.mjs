// Fire families: two measurements per member (docs/design/fire-families.md; SOURCE_NOTES FF17, FF18).
//   1. ref1923's clip (the City's 1923 footprint shifted 1.3 km uphill): of the cells the fire front
//      reaches within the run without the clip, the share the clip removes.
//   2. Fire reach outside the ordered zones: 30 m cells the fire front reaches in the first 2 h that lie
//      in an evacuation zone the fire's orders leave unordered (warned, or not told at all), and an
//      estimate of the residents of those cells (each zone's population × its share of cells reached;
//      derived, assumes people spread evenly over a zone). Orders are the fire's (a Time Study region)
//      plus other cities' orders for that fire run (js/sim.js otherCityOrders, SOURCE_NOTES FO1);
//      cells in zones whose order comes only after the front reached the cell are counted separately.
// Medians over seeds 1–3 per severity. No orders, households or traffic are run, except one
// Evacuation per fire to read which zones its orders cover.
//   node tools/fire-families.mjs [fireId|all] [seeds=3]
import fs from 'node:fs';
import { loadData } from '../js/data.js';
import { buildFireGrid, runFire } from '../js/fire.js';
import { makeScenarios, familyOf, memberScenario, SEVERITY, TIME_OF_DAY } from '../js/scenarios.js';
import { Evacuation, DEFAULT_PLAN, otherCityOrders } from '../js/sim.js';

const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const [which = 'all', nSeeds = '3'] = process.argv.slice(2);
const seeds = Array.from({ length: +nSeeds }, (_, i) => i + 1), SEVS = ['low', 'central', 'high'], LIMIT = 120;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const zones = data.layers.evacZones, zoneCells = new Int32Array(zones.length);
for (const z of grid.zone) if (z >= 0) zoneCells[z]++;
const km2 = c => (c * 900 / 1e6).toFixed(2);

for (const sc of makeScenarios(data).filter(s => (which === 'all' ? s.id !== 'eastWindDay' : s.id === which))) {
  const told = new Evacuation(data, grid, runFire(grid, sc, SEVERITY.central, 1), sc, 'central', DEFAULT_PLAN, 1, TIME_OF_DAY[sc.timeOfDay]).scenTold;
  console.log(`\n=== ${sc.id}: ${told.filter(k => k === 1).length} zones ordered, ${told.filter(k => k === 2).length} warned by the scenario; other cities' orders follow each run`);
  for (const m of familyOf(sc, data)) {
    const s = memberScenario(sc, m.id, data), out = [];
    for (const sev of SEVS) {
      const r = seeds.map(seed => {
        const F = runFire(grid, s, SEVERITY[sev], seed);
        let warned = 0, none = 0, ordered = 0, late = 0; const hit = new Map(), oc = otherCityOrders(data, grid, F);
        for (let i = 0; i < F.arrival.length; i++) {
          if (F.arrival[i] > LIMIT) continue; const z = grid.zone[i]; if (z < 0) continue;
          if (told[z] === 1 || oc[z] <= s.durationMin * 60) { ordered++; if (told[z] !== 1 && oc[z] > F.arrival[i] * 60) late++; continue; }
          told[z] === 2 ? warned++ : none++; hit.set(z, (hit.get(z) || 0) + 1);
        }
        let people = 0; for (const [z, c] of hit) people += (zones[z].pop || 0) * (zones[z].popModeled != null && zones[z].pop ? zones[z].popModeled / zones[z].pop : 1) * c / zoneCells[z];
        let cut = null;
        if (s.clip) {
          const G = runFire(grid, { ...s, clip: null }, SEVERITY[sev], seed);
          let all = 0, kept = 0; for (let i = 0; i < G.arrival.length; i++) if (G.arrival[i] < Infinity) { all++; if (F.arrival[i] < Infinity) kept++; }
          let burned = 0; for (let i = 0; i < F.arrival.length; i++) if (F.arrival[i] < Infinity) burned++;
          cut = { all, burned, share: 1 - kept / all };
        }
        return { ordered, late, warned, none, people, cut, zonesHit: [...hit.keys()] };
      });
      const zs = new Map(); for (const x of r) for (const z of x.zonesHit) zs.set(z, (zs.get(z) || 0) + 1);
      const top = [...zs].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([z]) => zones[z].id).join(' ');
      out.push(`  ${sev.padEnd(7)} 2 h front: in ordered zones ${med(r.map(x => x.ordered))} cells (order after the front: ${med(r.map(x => x.late))}); outside orders ${med(r.map(x => x.warned + x.none))} cells = ${km2(med(r.map(x => x.warned + x.none)))} km² (warned ${med(r.map(x => x.warned))}, not told ${med(r.map(x => x.none))}), about ${Math.round(med(r.map(x => x.people)))} residents [${Math.round(Math.min(...r.map(x => x.people)))}–${Math.round(Math.max(...r.map(x => x.people)))}]${top ? `; zones ${top}` : ''}`
        + (r[0].cut ? `\n          clip: unclipped fire ${km2(med(r.map(x => x.cut.all)))} km², clipped ${km2(med(r.map(x => x.cut.burned)))} km², clip removes ${(100 * med(r.map(x => x.cut.share))).toFixed(0)}% [${(100 * Math.min(...r.map(x => x.cut.share))).toFixed(0)}–${(100 * Math.max(...r.map(x => x.cut.share))).toFixed(0)}%]` : ''));
    }
    console.log(`${m.id}${m.isDefault ? ' (default)' : ''}\n${out.join('\n')}`);
  }
}
