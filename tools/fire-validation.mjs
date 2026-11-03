#!/usr/bin/env node
// Fire overlay checks for docs/fire-validation.md (SOURCE_NOTES FV1–FV14). Report only: nothing here
// changes a default, and the 1991-like fire below is an analysis case, not a scenario.
//
//   node tools/fire-validation.mjs fire [seeds=3]           # §2 footprints, §3 ember zones, §4 1923 and 1991 (fire only, a few minutes)
//   node tools/fire-validation.mjs sim [seeds=3] --workers 1 # §2 resident exposure: full runs, fuel proxy vs LANDFIRE (serial)
//
// Fuel: 'proxy' is today's fire-zone factor; 'landfire' is the opt-in LANDFIRE FBFM40 setting
// (js/fire.js withLandfireFuel). Writes data/model/fire-validation.json (merged by section).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const { loadData } = await import('../js/data.js');
const { buildFireGrid, runFire, fireGridFor, CELL, inBB, inPoly, bbox } = await import('../js/fire.js');
const { makeScenarios, SEVERITY, TIME_OF_DAY } = await import('../js/scenarios.js');
const { Evacuation, DEFAULT_PLAN } = await import('../js/sim.js');
const { toUTM } = await import('./utm.mjs');

const argv = process.argv.slice(2), wi = argv.indexOf('--workers');
if (wi >= 0 && +argv[wi + 1] !== 1) throw new Error('this tool runs serially: --workers 1 only');
const pos = argv.filter((a, i) => !a.startsWith('--') && i !== wi + 1 || wi < 0 && !a.startsWith('--'));
const [mode = 'fire', nSeeds = '3'] = pos;
const seeds = Array.from({ length: +nSeeds }, (_, i) => i + 1);
const OUT = 'data/model/fire-validation.json';
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : {};
const data = await loadData(async (p, k) => { const b = fs.readFileSync(p); return k === 'json' ? JSON.parse(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
if (!data.fuel40) throw new Error('data/terrain/fbfm40.* missing: run node tools/fetch-fuel.mjs');
const proxy = buildFireGrid(data), FUELS = { proxy, landfire: fireGridFor(proxy, data, 'landfire') };
const { W, H } = proxy, N = W * H;
const SEVS = ['low', 'central', 'high'];
const scen = makeScenarios(data), FIRES = scen.filter(s => s.id !== 'eastWindDay');
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rng = a => [Math.min(...a), Math.max(...a)];
const km2 = c => +(c * CELL * CELL / 1e6).toFixed(3);
const O = data.net.meta.origin, L = (lon, lat) => { const [x, y] = toUTM(lon, lat); return [x - O[0], y - O[1]]; };
const center = i => [(i % W + 0.5) * CELL, (Math.floor(i / W) + 0.5) * CELL];
const rasterize = (polys, val) => { // value per cell (max over polygons containing the cell center), NaN outside
  const r = new Float32Array(N).fill(NaN);
  for (const p of polys) {
    const bb = bbox(p.rings), c0 = Math.max(0, Math.floor(bb[0] / CELL)), c1 = Math.min(W - 1, Math.floor(bb[2] / CELL)), r0 = Math.max(0, Math.floor(bb[1] / CELL)), r1 = Math.min(H - 1, Math.floor(bb[3] / CELL));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const x = (cc + 0.5) * CELL, y = (rr + 0.5) * CELL; if (!inPoly(x, y, p.rings)) continue;
      const i = rr * W + cc, v = val(p); if (Number.isNaN(r[i]) || v > r[i]) r[i] = v;
    }
  }
  return r;
};
// GeoJSON polygons (WGS84) to local rings
const toRings = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).map(poly => poly.map(ring => ring.map(([lon, lat]) => L(lon, lat))));
const readPolys = (file, props = () => ({})) => {
  const polys = [];
  for (const f of JSON.parse(fs.readFileSync(file)).features) if (f.geometry) for (const rings of toRings(f.geometry)) polys.push({ rings, ...props(f.properties) });
  return polys;
};

if (mode === 'fire') {
  // ---- §2 footprints: proxy vs LANDFIRE, every fire at its usual start ----
  const foot = {};
  const fireRuns = {}; // keep ember arrays for §3: key fuel|fire|sev|seed → ember
  for (const sc of FIRES) for (const sev of SEVS) {
    const row = {};
    for (const [fu, g] of Object.entries(FUELS)) {
      const r = seeds.map(seed => {
        const F = runFire(g, sc, SEVERITY[sev], seed); fireRuns[`${fu}|${sc.id}|${sev}|${seed}`] = F;
        let b60 = 0, b120 = 0, all = 0, emb = 0;
        for (let i = 0; i < N; i++) { const a = F.arrival[i]; if (a < Infinity) { all++; if (a <= 60) b60++; if (a <= 120) b120++; } if (F.ember[i] < Infinity) emb++; }
        return { b60, b120, all, emb, spots: F.spots };
      });
      row[fu] = Object.fromEntries(['b60', 'b120', 'all', 'emb', 'spots'].map(k => [k, k === 'spots' ? med(r.map(x => x[k])) : km2(med(r.map(x => x[k])))]));
      row[fu].allRange = rng(r.map(x => x.all)).map(km2);
    }
    // overlap of the whole-run burned area, median over seeds
    const ov = seeds.map(seed => { const a = fireRuns[`proxy|${sc.id}|${sev}|${seed}`].arrival, b = fireRuns[`landfire|${sc.id}|${sev}|${seed}`].arrival; let u = 0, n = 0; for (let i = 0; i < N; i++) { const p = a[i] < Infinity, q = b[i] < Infinity; if (p || q) u++; if (p && q) n++; } return u ? n / u : 1; });
    row.iou = +med(ov).toFixed(3);
    foot[`${sc.id}|${sev}`] = row;
    console.log(sc.id, sev, JSON.stringify(row));
  }
  out.footprints = { seeds, note: 'km² burned (arrival < Infinity) by 60 min, 120 min and the whole run, and ember-exposed; median over seeds; iou = cells burned under both fuels / under either', rows: foot };

  // ---- §3 ember exposure vs Ember Threat Zones and FHSZ 2025 ----
  if (fs.existsSync('data/raw/city/ember_threat.geojson') && fs.existsSync('data/raw/city/fhsz_2025.geojson')) {
    const etz = readPolys('data/raw/city/ember_threat.geojson', p => ({ ne: p.ne_ember_risk_max, sw: p.sw_ember_risk_max, bc: p.building_count }));
    const neR = rasterize(etz.filter(p => p.ne != null), p => p.ne);
    const fh = readPolys('data/raw/city/fhsz_2025.geojson', p => ({ layer: p._layer, cls: p.FHSZ_Description }));
    const city = rasterize(fh.filter(p => /^City of Berkeley/.test(p.layer)), p => (/Very High/.test(p.layer) ? 2 : 1));
    const LRA = { NonWildland: 0, Moderate: 1, High: 2, 'Very High': 3 };
    const lra = rasterize(fh.filter(p => p.layer.startsWith('CAL FIRE')), p => LRA[p.cls]);
    const ranks = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let k = 0; k < idx.length;) { let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++; for (let m = k; m <= j; m++) r[idx[m][1]] = (k + j) / 2; k = j + 1; } return r; };
    const spearman = (x, y) => { const rx = ranks(x), ry = ranks(y), n = x.length, mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
    const ember = {};
    for (const fu of Object.keys(FUELS)) for (const sevSet of [['central'], SEVS]) {
      const keys = Object.keys(fireRuns).filter(k => k.startsWith(fu + '|') && sevSet.includes(k.split('|')[2]));
      const share = new Float32Array(N); for (const k of keys) { const e = fireRuns[k].ember; for (let i = 0; i < N; i++) if (e[i] < Infinity) share[i]++; }
      for (let i = 0; i < N; i++) share[i] /= keys.length;
      const cells = []; for (let i = 0; i < N; i++) if (!Number.isNaN(neR[i]) && proxy.elev[i] >= 0.5) cells.push(i);
      // quintiles of the NE ember risk over cells in the model area
      const q = cells.map(i => neR[i]).sort((a, b) => a - b), cut = [0.2, 0.4, 0.6, 0.8].map(p => q[Math.floor(p * q.length)]);
      const byQ = [0, 1, 2, 3, 4].map(k => ({ cells: 0, mean: 0, half: 0, lo: k ? cut[k - 1] : q[0], hi: k < 4 ? cut[k] : q[q.length - 1] }));
      for (const i of cells) { const k = cut.filter(c => neR[i] >= c).length, b = byQ[k]; b.cells++; b.mean += share[i]; if (share[i] >= 0.5) b.half++; }
      for (const b of byQ) { b.mean = +(b.mean / b.cells).toFixed(3); b.half = +(b.half / b.cells).toFixed(3); b.lo = +b.lo.toFixed(2); b.hi = +b.hi.toFixed(2); }
      // by evacuation zone: zone mean NE risk vs zone mean exposure share
      const zs = new Map(); for (const i of cells) { const z = proxy.zone[i]; if (z < 0) continue; const o = zs.get(z) || { r: 0, s: 0, n: 0 }; o.r += neR[i]; o.s += share[i]; o.n++; zs.set(z, o); }
      const zl = [...zs].filter(([, o]) => o.n >= 20).map(([z, o]) => ({ id: data.layers.evacZones[z].id, risk: o.r / o.n, share: o.s / o.n, n: o.n }));
      const topR = new Set([...zl].sort((a, b) => b.risk - a.risk).slice(0, Math.ceil(zl.length / 4)).map(z => z.id)), topS = new Set([...zl].sort((a, b) => b.share - a.share).slice(0, Math.ceil(zl.length / 4)).map(z => z.id));
      const cls = (r, names) => Object.fromEntries(names.map((nm, v) => [nm, v]).filter(([nm]) => nm).map(([nm, v]) => { let n = 0, s = 0, h = 0; for (let i = 0; i < N; i++) if (r[i] === v && proxy.elev[i] >= 0.5) { n++; s += share[i]; if (share[i] >= 0.5) h++; } return [nm, { cells: n, km2: km2(n), meanShare: n ? +(s / n).toFixed(3) : null, halfShare: n ? +(h / n).toFixed(3) : null }]; }));
      const hill = cells.filter(i => proxy.fuel[i] >= 0.7), reach = cells.filter(i => share[i] > 0);
      const outside = []; for (let i = 0; i < N; i++) if (Number.isNaN(city[i]) && proxy.inCity[i] && proxy.elev[i] >= 0.5) outside.push(share[i]);
      const topCut = cut[3];
      ember[`${fu}|${sevSet.join('+')}`] = {
        runs: keys.length, etzCells: cells.length,
        spearmanCells: +spearman(cells.map(i => neR[i]), cells.map(i => share[i])).toFixed(3),
        // the same inside the hill classes of the proxy (fuel ≥ 0.7), and over cells any run reached
        hillCells: hill.length, spearmanHill: +spearman(hill.map(i => neR[i]), hill.map(i => share[i])).toFixed(3),
        reachedCells: reach.length, spearmanReached: +spearman(reach.map(i => neR[i]), reach.map(i => share[i])).toFixed(3),
        topQuintileHillShare: +(cells.filter(i => neR[i] >= topCut && proxy.fuel[i] >= 0.7).length / cells.filter(i => neR[i] >= topCut).length).toFixed(3),
        berkeleyOutsideCityZones: { cells: outside.length, meanShare: +(outside.reduce((a, b) => a + b, 0) / outside.length).toFixed(3) },
        byNeQuintile: byQ,
        zones: { n: zl.length, spearman: +spearman(zl.map(z => z.risk), zl.map(z => z.share)).toFixed(3), topQuarterOverlap: [...topR].filter(z => topS.has(z)).length, topQuarterSize: topR.size },
        cityFHSZ: cls(city, [null, 'High (City)', 'Very High (City)']),
        calfireLRA: cls(lra, ['NonWildland', 'Moderate', 'High', 'Very High']),
      };
      console.log('ember', fu, sevSet.join('+'), JSON.stringify(ember[`${fu}|${sevSet.join('+')}`]));
    }
    // Berkeley land cells outside both City hazard zones, and cells inside one
    let outCity = 0, outCityIn = 0; for (let i = 0; i < N; i++) if (Number.isNaN(city[i]) && proxy.inCity[i] && proxy.elev[i] >= 0.5) outCity++; else if (!Number.isNaN(city[i])) outCityIn++;
    out.emberZones = { note: 'share = fraction of fire runs (4 fires at their usual start, seeds as listed) in which a cell is ember-exposed during the run; ETZ = XyloPlan Ember Threat Zones, NE scenario (ne_ember_risk_max), rasterized at 30 m cell centers; FHSZ = City VHFHSZ/HFHSZ layers and CAL FIRE LRA classes (map of 2025-03-24)', seeds, cityCellsOutsideCityZones: outCity, cityZoneCells: outCityIn, results: ember };
  }

  // ---- §4a 1923 timing ----
  {
    const sc = scen.find(s => s.id === 'ref1923'), ring = data.layers.fire1923[0].rings[0];
    const ne = ring.reduce((b, p) => (p[0] + p[1] > b[0] + b[1] ? p : b), ring[0]), minX = Math.min(...ring.map(p => p[0]));
    const neCell = Math.floor(ne[1] / CELL) * W + Math.floor(ne[0] / CELL);
    const west = []; for (let i = 0; i < N; i++) { const [x, y] = center(i); if (x <= minX + 150 && inPoly(x, y, [ring])) west.push(i); }
    const t = {};
    for (const [fu, g] of Object.entries(FUELS)) for (const sev of SEVS) {
      const r = seeds.map(seed => { const F = fireRuns[`${fu}|ref1923|${sev}|${seed}`] || runFire(g, sc, SEVERITY[sev], seed); const near = Math.min(...[-1, 0, 1].flatMap(dr => [-1, 0, 1].map(dc => F.arrival[neCell + dr * W + dc]))); return { entry: near, west: Math.min(...west.map(i => F.arrival[i])) }; });
      t[`${fu}|${sev}`] = { entryMin: r.map(x => Math.round(x.entry)), westMin: r.map(x => (x.west < Infinity ? Math.round(x.west) : null)) };
    }
    out.timing1923 = { note: 'entry = earliest arrival in the 3×3 cells around the 1923 footprint\'s north-east vertex (the 1923 entry point; StoryMap: about 150 min from today\'s eastern edge); west = earliest arrival at a cell inside the 1923 footprint within 150 m of its west end (Shattuck; StoryMap about 300 min). Values per seed.', entryToWestM: Math.round(center(neCell)[0] - minX), seeds, rows: t };
    console.log('1923', JSON.stringify(out.timing1923));
  }

  // ---- §4b a 1991-like fire against the record ----
  {
    const tun = readPolys('data/raw/calfire/tunnel-1991.geojson');
    const per = rasterize(tun, () => 1); let perCells = 0; for (let i = 0; i < N; i++) if (per[i] === 1) perCells++;
    // FRAP GIS area 1,622.8 acres = 6.57 km²; the part on the grid (the grid ends at about 37.840 N)
    const origin = L(-122.2205, 37.8625); // between the east ends of Buckingham Blvd and Marlborough Terrace (our placement)
    const oc = Math.floor(origin[1] / CELL) * W + Math.floor(origin[0] / CELL);
    const res = {};
    for (const [fu, g] of Object.entries(FUELS)) for (const sev of ['central', 'high']) for (const wf of [30, 45, 60]) {
      const sc = { id: 'like1991', ignition: origin, windFrom: wf, windMph: 30, durationMin: 240 };
      const r = seeds.map(seed => {
        const F = runFire(g, sc, SEVERITY[sev], seed), m = {};
        const toR = ((wf + 180) % 360) * Math.PI / 180, dx = Math.sin(toR), dy = Math.cos(toR);
        for (const T of [35, 60, 64, 120, 240]) {
          let b = 0, inP = 0, far = 0;
          for (let i = 0; i < N; i++) if (F.arrival[i] <= T) { b++; if (per[i] === 1) inP++; const [x, y] = center(i); far = Math.max(far, (x - origin[0]) * dx + (y - origin[1]) * dy); }
          m[T] = { km2: km2(b), inPerimeterShare: b ? inP / b : 0, perimeterCovered: inP / perCells, iou: inP / (b + perCells - inP), downwindM: Math.round(far) };
        }
        return m;
      });
      const pick = (T, k) => med(r.map(x => x[T][k]));
      res[`${fu}|${sev}|${wf}`] = Object.fromEntries([35, 60, 64, 120, 240].map(T => [T, { km2: pick(T, 'km2'), downwindM: pick(T, 'downwindM'), perimeterCovered: +pick(T, 'perimeterCovered').toFixed(3), inPerimeterShare: +pick(T, 'inPerimeterShare').toFixed(3), iou: +pick(T, 'iou').toFixed(3) }]));
      console.log('1991', fu, sev, wf, JSON.stringify(res[`${fu}|${sev}|${wf}`]));
    }
    out.like1991 = { note: 'Analysis fire only: ignition at 37.8625 N, 122.2205 W (between the east ends of Buckingham Blvd and Marlborough Terrace, our placement from USFA-TR-060 PDF pp. 25, 29), wind 30 mph from 30°, 45° or 60°, no clip, 240 min. km² burned by T minutes; downwindM = farthest burned cell along the wind from the ignition; perimeter = CAL FIRE FRAP TUNNEL 1991 (1,622.8 GIS acres) rasterized on the fire grid; medians over seeds', ignitionCellFuel: { proxy: proxy.fuel[oc], landfire: FUELS.landfire.fuel[oc], fbfm40: data.fuel40.codes[oc] }, perimeterCellsOnGrid: perCells, perimeterKm2OnGrid: km2(perCells), seeds, rows: res };
  }
}

if (mode === 'sim') {
  // ---- §2 resident exposure: full runs (serial, one process: --workers 1) ----
  const rows = {};
  const exp = S => S.exposedHome + S.exposedRoad + S.exposedNoVehicle + S.notOrderedExposed;
  for (const sc of FIRES) for (const sev of SEVS) {
    const row = {};
    for (const [fu, g] of Object.entries(FUELS)) {
      const r = seeds.map(seed => { const S = new Evacuation(data, proxy, runFire(g, sc, SEVERITY[sev], seed), sc, sev, DEFAULT_PLAN, seed, TIME_OF_DAY[sc.timeOfDay]).runToEnd(); return { exposed: exp(S), front: S.fireFrontHome + S.fireFrontRoad, p90: S.clearP90 }; });
      row[fu] = { exposed: r.map(x => Math.round(x.exposed)), front: r.map(x => Math.round(x.front)), p90: r.map(x => x.p90 == null ? null : +x.p90.toFixed(1)) };
    }
    rows[`${sc.id}|${sev}`] = row;
    console.log(sc.id, sev, JSON.stringify(row));
  }
  out.exposure = { note: 'Today\'s plan (DEFAULT_PLAN), each fire\'s own time of day; exposed = people still there when embers arrived (exposedHome + exposedRoad + exposedNoVehicle + notOrderedExposed), front = still there when the fire front arrived; per seed. Not casualty counts.', seeds, rows };
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
