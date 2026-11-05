#!/usr/bin/env node
// Wind by season and hour of day at the Oakland North RAWS, for the earthquake scenarios' winds
// (docs/wind-climate.md; SOURCE_NOTES WC1–WC9).
//
//   node tools/wind-climate.mjs            # fetch what is missing into data/raw/wind/, then summarize
//   node tools/wind-climate.mjs --offline  # summarize cached files only
//
// 1. Oakland North RAWS (COKN, 37.865 N, 122.221 W, 1,403 ft, the ridge above Gwin Canyon; SOURCE_NOTES FF4),
//    WRCC frequency tool (raws.dri.edu/cgi-bin/wea_freq2.pl), whole record (June 1992 to the query date), one
//    query per season and element, all hours (WsHou 00, WeHou 24: the tool's end hour is exclusive, so 23 drops
//    the 11 p.m. column). The tool returns one column per hour of day (local standard time, LST): percentages
//    of that hour's observations and the hour's count, so per-hour counts are recovered as count × percent.
//    Elements: hourly mean wind direction (MWD, 10° bins); hourly mean wind speed (MWS, 1 mph bins), for all
//    hours and filtered to onshore (180–315°) and to north (340–20°) directions; relative humidity (AVR,
//    5% bins) for winter north-wind hours.
//    WRCC serves raw hourly listings only for the last 30 days, so this station's record cannot pair one
//    afternoon with the following night.
// 2. Oakland International Airport ASOS (OAK), routine hourly reports from the Iowa Environmental Mesonet
//    (cgi-bin/request/asos.py), 2008 to October 2026 (the file tools/wind-events.mjs caches): the day-by-day
//    test of how often the wind reverses between afternoon and night, at a different station (sea level, on
//    the Bay shore).
// Directions are where the wind blows from, degrees true. Report only until js/scenarios.js cites it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/raw/wind'), OUT = path.join(ROOT, 'data/model/wind-climate.json');
const offline = process.argv.includes('--offline');
const UA = { 'User-Agent': 'berkeley-wildfire-evacuation-explorer/0.1' };
fs.mkdirSync(path.join(DIR, 'wrcc-climate'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');

// Seasons by calendar month (Dec–Feb wraps the year; the tool accepts a wrapped window). April alone is
// HayWired's month (its scenario earthquake strikes on April 18, EQ1).
const SEASONS = {
  winter: { label: 'Dec–Feb', ws: [12, 1], we: [2, 29] },
  spring: { label: 'Mar–May', ws: [3, 1], we: [5, 31] },
  summer: { label: 'Jun–Aug', ws: [6, 1], we: [8, 31] },
  fall: { label: 'Sep–Nov', ws: [9, 1], we: [11, 30] },
  april: { label: 'April', ws: [4, 1], we: [4, 30] },
};
// Direction groups. Onshore: the half of the compass facing the Bay and the Golden Gate, from south through
// north-west (180–315°); a definitional choice, with 200–300° reported beside it. North: 340–20°.
const ONSHORE = [180, 315], ONSHORE_NARROW = [200, 300], NORTH = [[340, 360], [0, 20]];
const BANDS = [[0, 5], [6, 11], [12, 17], [18, 23]];
const NONE = ['none', '01', 'none', 'none'];

async function wrcc(season, pcode, binsize, filt = NONE, tag = 'all') {
  const s = SEASONS[season];
  const f = path.join(DIR, 'wrcc-climate', `cokn-${season}-${pcode}-${tag}.html`);
  if (!fs.existsSync(f)) {
    if (offline) return null;
    const fields = { stn: 'COKN', smon: '06', sday: '01', syea: '92', emon: '10', eday: '31', eyea: '26', pcode, unit: 'E',
      binsize, binb: '0', lowerb: 'none', upperb: 'none', Tout: 'H', percdec: '2', aver: 'Y', averdec: '1', hobs: 'Y',
      WsMon: pad(s.ws[0]), WsDay: pad(s.ws[1]), WsHou: '00', WeMon: pad(s.we[0]), WeDay: pad(s.we[1]), WeHou: '24',
      FiltElem: filt[0], FiltType: filt[1], FiltLbnd: filt[2], FiltUbnd: filt[3],
      FiltElem2: 'none', FiltType2: '01', FiltLbnd2: 'none', FiltUbnd2: 'none', 'Submit Info': 'Submit Info' };
    // curl, not fetch: through an HTTPS proxy Node's fetch dropped these slow whole-record queries.
    const args = ['-sS', '-m', '600', '-A', UA['User-Agent'], 'https://raws.dri.edu/cgi-bin/wea_freq2.pl', ...Object.entries(fields).flatMap(([k, v]) => ['-F', `${k}=${v}`])];
    for (let i = 0; i < 4 && !fs.existsSync(f); i++) {
      let t = ''; try { t = execFileSync('curl', args, { encoding: 'latin1', maxBuffer: 1 << 26 }); } catch { }
      if (/Total\s*(<BR>)?\s*#\s*obs/i.test(t)) fs.writeFileSync(f, t, 'latin1');
      else await sleep(3000 * (i + 1));
    }
    await sleep(1000);
    if (!fs.existsSync(f)) { console.error(`failed: ${season} ${pcode} ${tag}`); return null; }
  }
  return parse(fs.readFileSync(f, 'latin1'));
}

// Per hour of day (LST 0–23): { n, bins: { lo: count } }. Column labels run "1 am" … "11 pm", "12 am"; "12 am" is hour 0.
function parse(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map(c => c[1].replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()));
  const head = rows.find(r => r[1] === '1 am');
  const hourOf = lab => { const m = /^(\d+) (am|pm)$/.exec(lab); if (!m) return null; const h = +m[1] % 12; return m[2] === 'pm' ? h + 12 : h; };
  const cols = head.slice(1).map(hourOf);
  const tot = rows.find(r => /^Total # obs/.test(r[0]));
  const span = /Start Date\s*:\s*([^<]*?)\s*End Date\s*:\s*([^<#]*?)\s*#/.exec(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
  const hours = Array.from({ length: 24 }, () => ({ n: 0, bins: {} }));
  cols.forEach((h, j) => { if (h != null) hours[h].n = +tot[j + 1] || 0; });
  for (const r of rows) {
    const m = /^(-?[\d.]+) to (-?[\d.]+)$/.exec(r[0]); if (!m) continue;
    cols.forEach((h, j) => { if (h == null) return; const p = parseFloat(r[j + 1]); if (p > 0) hours[h].bins[+m[1]] = (hours[h].bins[+m[1]] || 0) + hours[h].n * p / 100; });
  }
  return { hours, start: span?.[1], end: span?.[2] };
}

const sumHours = (res, hs) => { const out = { n: 0, bins: {} }; for (const h of hs) { const x = res.hours[h]; out.n += x.n; for (const [k, v] of Object.entries(x.bins)) out.bins[k] = (out.bins[k] || 0) + v; } return out; };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ALL = range(0, 23);
// Direction bins: "360 to 370" is a reading of due north; fold it into 0–10.
const fold = bins => { const o = {}; for (const [k, v] of Object.entries(bins)) { const d = +k % 360; o[d] = (o[d] || 0) + v; } return o; };
const dirShare = (agg, lo, hi) => { const b = fold(agg.bins); let s = 0, t = 0; for (const [k, v] of Object.entries(b)) { t += v; if (+k >= lo && +k < hi) s += v; } return t ? s / t : null; };
const northShare = agg => dirShare(agg, 340, 360) + dirShare(agg, 0, 20);
const modeBin = agg => { const b = fold(agg.bins); let best = null; for (const [k, v] of Object.entries(b)) if (!best || v > best[1]) best = [+k, v]; return best?.[0]; };
// Speed bins are 1 mph wide ("a to a+1"); the median is read inside the bin by linear interpolation.
const quantile = (agg, q) => { const ks = Object.keys(agg.bins).map(Number).sort((a, b) => a - b); const t = ks.reduce((s, k) => s + agg.bins[k], 0); if (!t) return null;
  let c = 0; for (const k of ks) { const v = agg.bins[k]; if (c + v >= q * t) return k + (q * t - c) / v; c += v; } return ks[ks.length - 1] + 1; };
const r1 = x => x == null ? null : +x.toFixed(1), pct = x => x == null ? null : +(100 * x).toFixed(1);
const dirTable = agg => { const b = fold(agg.bins), t = Object.values(b).reduce((a, c) => a + c, 0); return Object.fromEntries(range(0, 35).map(i => [i * 10, t ? +(100 * (b[i * 10] || 0) / t).toFixed(1) : 0])); };

const out = { _note: 'Derived by tools/wind-climate.mjs (docs/wind-climate.md, SOURCE_NOTES WC1–WC9). Directions are where the wind blows from, degrees true. Hours are local standard time (LST); in daylight time the clock reads one hour later.',
  sources: { raws: 'Oakland North RAWS (COKN), WRCC frequency tool raws.dri.edu/cgi-bin/wea_freq2.pl, hourly mean wind (10-minute mean at 20 ft), June 1992 to October 2026',
    asos: 'Oakland International Airport ASOS (OAK), Iowa Environmental Mesonet cgi-bin/request/asos.py, routine hourly reports (2-minute mean at 10 m), 2008 to October 2026' },
  definitions: { onshore: ONSHORE, onshoreNarrow: ONSHORE_NARROW, north: '340–20', bands: BANDS.map(([a, b]) => `${a}–${b}`) },
  retrieved: new Date().toISOString().slice(0, 10), cokn: {} };

for (const season of Object.keys(SEASONS)) {
  const dir = await wrcc(season, 'MWD', '10'), spd = await wrcc(season, 'MWS', '01');
  const spdOn = await wrcc(season, 'MWS', '01', ['MWD', '05', String(ONSHORE[0]), String(ONSHORE[1])], 'onshore');
  const spdN1 = await wrcc(season, 'MWS', '01', ['MWD', '05', '340', '361'], 'north1'), spdN2 = await wrcc(season, 'MWS', '01', ['MWD', '05', '0', '20'], 'north2');
  // Humidity of north-wind hours: winter only (each whole-record query takes several minutes at WRCC).
  const rhN1 = season === 'winter' ? await wrcc(season, 'AVR', '05', ['MWD', '05', '340', '361'], 'north1') : null;
  const rhN2 = season === 'winter' ? await wrcc(season, 'AVR', '05', ['MWD', '05', '0', '20'], 'north2') : null;
  if (!dir || !spd) continue;
  const merge = (a, b) => a && b ? { hours: a.hours.map((x, h) => ({ n: x.n + b.hours[h].n, bins: Object.fromEntries([...new Set([...Object.keys(x.bins), ...Object.keys(b.hours[h].bins)])].map(k => [k, (x.bins[k] || 0) + (b.hours[h].bins[k] || 0)])) })) } : null;
  const spdN = merge(spdN1, spdN2), rhN = merge(rhN1, rhN2);
  const s = { label: SEASONS[season].label, span: `${dir.start} – ${dir.end}`, directionHours: sumHours(dir, ALL).n, bands: {}, hourly: [] };
  for (const [a, b] of [...BANDS, [0, 23]]) {
    const hs = range(a, b), d = sumHours(dir, hs), v = sumHours(spd, hs);
    const on = spdOn ? sumHours(spdOn, hs) : null, no = spdN ? sumHours(spdN, hs) : null, rh = rhN ? sumHours(rhN, hs) : null;
    s.bands[a === 0 && b === 23 ? 'all' : `${a}-${b}`] = {
      hours: d.n, modeBin: modeBin(d), onshorePct: pct(dirShare(d, ...ONSHORE)), onshoreNarrowPct: pct(dirShare(d, ...ONSHORE_NARROW)),
      northPct: pct(northShare(d)), eastPct: pct(dirShare(d, 0, 90)), medianMph: r1(quantile(v, 0.5)), p90Mph: r1(quantile(v, 0.9)),
      onshoreMedianMph: on ? r1(quantile(on, 0.5)) : null, northMedianMph: no ? r1(quantile(no, 0.5)) : null, northP90Mph: no ? r1(quantile(no, 0.9)) : null,
      northHours: no ? Math.round(no.n) : null, northRhMedian: rh ? r1(quantile(rh, 0.5)) : null,
      northRhLe25Pct: rh && rh.n ? pct(Object.entries(rh.bins).filter(([k]) => +k < 25).reduce((x, [, c]) => x + c, 0) / rh.n) : null,
      directionPct: dirTable(d) };
  }
  for (const h of ALL) {
    const d = sumHours(dir, [h]), v = sumHours(spd, [h]), on = spdOn ? sumHours(spdOn, [h]) : null, no = spdN ? sumHours(spdN, [h]) : null;
    s.hourly.push({ hour: h, n: d.n, modeBin: modeBin(d), onshorePct: pct(dirShare(d, ...ONSHORE)), northPct: pct(northShare(d)), eastPct: pct(dirShare(d, 0, 90)),
      medianMph: r1(quantile(v, 0.5)), onshoreMedianMph: on ? r1(quantile(on, 0.5)) : null, northMedianMph: no ? r1(quantile(no, 0.5)) : null });
  }
  out.cokn[season] = s;
}

// ---- 2. OAK ASOS: does the wind reverse between afternoon and night, day by day? ----
const asosFile = path.join(DIR, 'oak-asos-2008-2026.csv');
if (!fs.existsSync(asosFile) && !offline) {
  const r = await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=OAK&data=drct&data=sknt&data=gust&data=relh&year1=2008&month1=1&day1=1&year2=2026&month2=11&day2=1&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3', { headers: UA });
  fs.writeFileSync(asosFile, await r.text());
}
if (fs.existsSync(asosFile)) {
  // Vector mean of each LST hour band's reports (unit vectors weighted by speed); calm reports carry no direction.
  const days = new Map(), KT = 1.15078, LST = 8 * 3600e3;
  for (const line of fs.readFileSync(asosFile, 'utf8').split('\n').slice(1)) {
    const [, valid, drct, sknt] = line.split(','); if (!valid) continue;
    const d = parseFloat(drct), s = parseFloat(sknt) * KT; if (Number.isNaN(d) || Number.isNaN(s) || s <= 0) continue;
    const t = new Date(Date.parse(valid.replace(' ', 'T') + 'Z') - LST), key = t.toISOString().slice(0, 10), h = t.getUTCHours();
    if (!days.has(key)) days.set(key, { month: t.getUTCMonth() + 1, b: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]] });
    const acc = days.get(key).b[Math.floor(h / 6)], rad = d * Math.PI / 180;
    acc[0] += s * Math.sin(rad); acc[1] += s * Math.cos(rad); acc[2]++;
  }
  const dirOf = a => a[2] >= 3 && Math.hypot(a[0], a[1]) / a[2] >= 2 ? (Math.atan2(a[0], a[1]) * 180 / Math.PI + 360) % 360 : null; // ≥3 reports, mean vector ≥ 2 mph
  const diff = (a, b) => { const x = Math.abs(a - b) % 360; return x > 180 ? 360 - x : x; };
  const inOn = d => d >= ONSHORE[0] && d < ONSHORE[1];
  const keys = [...days.keys()].sort(), seasonOf = m => [12, 1, 2].includes(m) ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
  const st = {};
  for (let i = 0; i < keys.length; i++) {
    const day = days.get(keys[i]), next = days.get(keys[i + 1]);
    const aft = dirOf(day.b[2]), eve = dirOf(day.b[3]), night = next ? dirOf(next.b[0]) : null;
    for (const s of [seasonOf(day.month), ...(day.month === 4 ? ['april'] : []), 'all']) {
      const x = st[s] ||= { days: 0, onshoreAfternoon: 0, evePairs: 0, eveReverse: 0, eveNotOnshore: 0, nightPairs: 0, nightReverse: 0, nightNotOnshore: 0, nightOffshore: 0, eveShift: [] };
      if (aft == null) continue; x.days++;
      if (!inOn(aft)) continue; x.onshoreAfternoon++;
      if (eve != null) { x.evePairs++; if (diff(aft, eve) >= 135) x.eveReverse++; if (!inOn(eve)) x.eveNotOnshore++; x.eveShift.push(((eve - aft + 540) % 360) - 180); }
      if (night != null) { x.nightPairs++; if (diff(aft, night) >= 135) x.nightReverse++; if (!inOn(night)) x.nightNotOnshore++; if (night >= 0 && night < 135) x.nightOffshore++; }
    }
  }
  const med = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
  out.oak = { _note: 'Per LST day: vector-mean direction of the afternoon (12–17), evening (18–23) and the next night (0–5), each from at least 3 reports with a mean vector of 2 mph or more. "Reverse" = turned 135° or more from the afternoon. Days counted only when the afternoon was onshore (180–315°).',
    seasons: Object.fromEntries(Object.entries(st).map(([k, x]) => [k, { daysWithAfternoon: x.days, onshoreAfternoonPct: pct(x.onshoreAfternoon / x.days),
      eveningReversePct: pct(x.eveReverse / x.evePairs), eveningNotOnshorePct: pct(x.eveNotOnshore / x.evePairs), eveningMedianTurnDeg: r1(med(x.eveShift)),
      nightReversePct: pct(x.nightReverse / x.nightPairs), nightNotOnshorePct: pct(x.nightNotOnshore / x.nightPairs), nightOffshore0to135Pct: pct(x.nightOffshore / x.nightPairs), pairs: x.nightPairs }])) };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
for (const [k, s] of Object.entries(out.cokn)) {
  console.log(`\n${k} (${s.label}) ${s.span}, ${s.directionHours} direction hours`);
  for (const [b, x] of Object.entries(s.bands)) console.log(`  ${b.padEnd(5)} n=${String(x.hours).padStart(6)} mode ${x.modeBin}–${x.modeBin + 10} onshore ${x.onshorePct}% (200–300: ${x.onshoreNarrowPct}%) north ${x.northPct}% east ${x.eastPct}% | median ${x.medianMph} mph, onshore ${x.onshoreMedianMph}, north ${x.northMedianMph} (p90 ${x.northP90Mph}; RH med ${x.northRhMedian}, ≤25% ${x.northRhLe25Pct}%)`);
  console.log('  hourly: ' + s.hourly.map(x => `${x.hour}:${x.modeBin}/${x.medianMph}`).join(' '));
}
if (out.oak) console.log('\nOAK', JSON.stringify(out.oak.seasons, null, 1));
