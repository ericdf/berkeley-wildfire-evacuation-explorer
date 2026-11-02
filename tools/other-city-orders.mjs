// Other cities' orders (js/sim.js otherCityOrders; SOURCE_NOTES FO1–FO4): which zones the rule
// orders that the scenario does not, their residents and vehicles by city, per fire, family member,
// severity and seed; and, with --runs, today's plan (DEFAULT_PLAN) run to the end on each fire's
// usual start, for the headline measures. Medians over seeds [min–max].
//   node tools/other-city-orders.mjs [fireId|all] [seeds=3] [--runs]
//   ROOT=<checkout> node <this file> ...   runs another checkout's simulator (before/after); there,
//   a simulator without the rule reports no added zones.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = process.env.ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadData } = await import(R + '/js/data.js');
const { buildFireGrid, runFire } = await import(R + '/js/fire.js');
const { makeScenarios, familyOf, memberScenario, SEVERITY, TIME_OF_DAY } = await import(R + '/js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import(R + '/js/sim.js');
const { FIRES } = await import(R + '/js/presets.js');

const data = await loadData(async (p, k) => { const b = fs.readFileSync(path.join(R, p)); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
const grid = buildFireGrid(data);
const args = process.argv.slice(2), runs = args.includes('--runs'), pos = args.filter(a => !a.startsWith('--'));
const [which = 'all', nSeeds = '3'] = pos;
const seeds = Array.from({ length: +nSeeds }, (_, i) => i + 1), SEVS = ['low', 'central', 'high'];
const zones = data.layers.evacZones, pph = data.A.demand.personsPerHousehold;
// City of each zone, from the Genasys zone id prefix (ECK zones cover El Cerrito and Kensington;
// ECK-007 and ECK-008 are named Kensington, X7).
const KENS = new Set(['ECK-007', 'ECK-008']);
const city = id => { const p = id.split('-')[0]; return p === 'BER' || p === 'LBL' ? 'Berkeley' : p === 'OKL' ? 'Oakland' : KENS.has(id) ? 'Kensington' : p === 'ECK' ? 'El Cerrito' : p === 'ALB' ? 'Albany' : 'other'; };
const CITIES = ['Berkeley', 'Oakland', 'Kensington', 'El Cerrito', 'Albany', 'other'];
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const span = a => { const s = a.filter(x => x != null); return s.length ? `${Math.round(med(s))} [${Math.round(Math.min(...s))}–${Math.round(Math.max(...s))}]` : '—'; };
const nul = a => a.some(x => x == null) ? ` (${a.filter(x => x == null).length} not reached)` : '';

function added(sim) {
  const extra = sim.otherCityOrder && sim.cityOrdered ? z => sim.otherCityOrder[z] && !sim.cityOrdered[z] : () => false;
  const out = Object.fromEntries(CITIES.map(c => [c, { zones: 0, people: 0, veh: 0 }]));
  for (let z = 0; z < zones.length; z++) if (extra(z) && sim.orderT[z] < Infinity) out[city(zones[z].id)].zones++;
  const { hh, v } = sim;
  for (let h = 0; h < hh.n; h++) if (extra(hh.zone[h]) && sim.orderT[hh.zone[h]] < Infinity) out[city(zones[hh.zone[h]].id)].people += pph;
  const zi = new Map(zones.map((z, i) => [z.id, i]));
  for (let i = 0; i < v.n; i++) { if (v.cls[i] !== 0) continue; const z = zi.get(data.net.edges[v.edge[i]].evacZone); if (z != null && extra(z) && sim.orderT[z] < Infinity) out[city(zones[z].id)].veh++; }
  return out;
}

const scen = makeScenarios(data).filter(s => FIRES.some(F => F.id === s.id) && (which === 'all' || s.id === which));
for (const sc of scen) {
  console.log(`\n=== ${sc.id} (${sc.timeOfDay}): zones only the rule orders, residents and evacuating vehicles in them, by city; median over seeds ${seeds[0]}–${seeds.at(-1)} [min–max]`);
  for (const m of familyOf(sc, data)) {
    const s = memberScenario(sc, m.id, data);
    for (const sev of SEVS) {
      const r = seeds.map(seed => added(new Evacuation(data, grid, runFire(grid, s, SEVERITY[sev], seed), s, sev, DEFAULT_PLAN, seed, TIME_OF_DAY[s.timeOfDay])));
      const tot = k => r.map(x => CITIES.reduce((a, c) => a + x[c][k], 0));
      const by = CITIES.filter(c => r.some(x => x[c].zones)).map(c => `${c} ${span(r.map(x => x[c].people))} people, ${span(r.map(x => x[c].veh))} veh, ${span(r.map(x => x[c].zones))} zones`).join('; ');
      console.log(`${(m.id + (m.isDefault ? '*' : '')).padEnd(16)} ${sev.padEnd(7)} total ${span(tot('people'))} people, ${span(tot('veh'))} vehicles, ${span(tot('zones'))} zones${by ? ` | ${by}` : ''}`);
    }
  }
  if (!runs) continue;
  for (const sev of SEVS) {
    const S = seeds.map(seed => new Evacuation(data, grid, runFire(grid, sc, SEVERITY[sev], seed), sc, sev, DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay]).runToEnd());
    const ember = S.map(x => x.exposedHome + x.exposedRoad + x.exposedNoVehicle + x.notOrderedExposed);
    console.log(`  today's plan, usual start, ${sev}: people still there when embers arrived ${span(ember)} (in zones with no order ${span(S.map(x => x.notOrderedExposed))}); 90% of ordered cars out (Berkeley's order area, ETE) ${span(S.map(x => x.clearP90))} min${nul(S.map(x => x.clearP90))}; with other cities' ordered cars ${span(S.map(x => x.clearP90All ?? x.clearP90))} min${nul(S.map(x => x.clearP90All ?? x.clearP90))}; evacuating vehicles ${span(S.map(x => x.vehicles))}, of them from zones only another city orders ${span(S.map(x => x.otherCityVehicles ?? 0))}; still home when the fire front arrived ${span(S.map(x => x.fireFrontHome))}; cars with no route at the end ${span(S.map(x => x.vehiclesNoRoute))}`);
  }
}
