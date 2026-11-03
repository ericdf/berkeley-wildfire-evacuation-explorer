#!/usr/bin/env node
// Wind on Red Flag Warning days for the East Bay Hills (docs/fire-validation.md §5; SOURCE_NOTES FV).
//
//   node tools/wind-events.mjs            # fetch what is missing into data/raw/wind/, then summarize
//   node tools/wind-events.mjs --offline  # summarize cached files only
//
// 1. Red Flag Warnings: NWS San Francisco Bay Area office (MTR), phenomena FW, significance W, from the
//    Iowa Environmental Mesonet VTEC archive (mesonet.agron.iastate.edu/json/vtec_events.py), years
//    2005–2026; kept where the warning's zones include "East Bay Hills" (the archive names that zone
//    from 2008; earlier events carry unnamed zone codes and are left out).
// 2. Oakland North RAWS (COKN, 37.865 N, 122.221 W, 1,403 ft; SOURCE_NOTES FF4): hourly mean wind
//    direction on every local-standard-time day a warning covered, from the WRCC frequency tool
//    (raws.dri.edu/cgi-bin/wea_freq2.pl), 10° bins, two filters: mean wind ≥ 15 mph, and all hours.
//    Wind speed in 5 mph bins for hours with direction 0–90°. Day granularity: a warning that covers
//    part of a day counts the whole day.
// 3. Oakland airport ASOS (OAK): routine hourly reports from IEM (cgi-bin/request/asos.py), 2008 to
//    October 2026, inside each warning's exact UTC window.
// The output is a summary to compare with the fire families' winds from 30°, 45° and 60°
// (js/scenarios.js FAMILY_WINDS). Report only: nothing in the simulator reads it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/raw/wind'), OUT = path.join(ROOT, 'data/model/wind-red-flag.json');
const offline = process.argv.includes('--offline');
const UA = { 'User-Agent': 'berkeley-wildfire-simulator/0.1' };
fs.mkdirSync(DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 1. Red Flag Warnings ----
const events = [];
for (let y = 2005; y <= 2026; y++) {
  const f = path.join(DIR, `rfw-${y}.json`);
  if (!fs.existsSync(f)) {
    if (offline) continue;
    const r = await fetch(`https://mesonet.agron.iastate.edu/json/vtec_events.py?wfo=MTR&year=${y}&phenomena=FW&significance=W`, { headers: UA });
    fs.writeFileSync(f, await r.text()); await sleep(500);
  }
  for (const e of JSON.parse(fs.readFileSync(f)).events) if (/East Bay Hills/.test(e.locations)) events.push({ year: y, id: e.eventid, issue: e.issue, expire: e.expire });
}
// local standard time (UTC−8) days covered by any warning, merged into runs
const LST = 8 * 3600e3, day = 86400e3, days = new Set();
for (const e of events) for (let t = Math.floor((Date.parse(e.issue) - LST) / day); t <= Math.floor((Date.parse(e.expire) - LST - 1) / day); t++) days.add(t);
const sorted = [...days].sort((a, b) => a - b), runs = [];
for (const d of sorted) { const r = runs[runs.length - 1]; if (r && d === r[1] + 1) r[1] = d; else runs.push([d, d]); }

// ---- 2. Oakland North RAWS via WRCC ----
const ymd = d => { const t = new Date(d * day); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const pad = n => String(n).padStart(2, '0');
async function wrcc([a, b], pcode, filt, filt2) {
  const [sy, sm, sd] = ymd(a), [ey, em, ed] = ymd(b);
  const key = `cokn-${pcode}-${filt.join('_')}-${filt2.join('_')}-${sy}${pad(sm)}${pad(sd)}-${ey}${pad(em)}${pad(ed)}.html`, f = path.join(DIR, 'wrcc', key);
  if (!fs.existsSync(f)) {
    if (offline) return null;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const fd = new FormData();
    const fields = { stn: 'COKN', smon: pad(sm), sday: pad(sd), syea: pad(sy % 100), emon: pad(em), eday: pad(ed), eyea: pad(ey % 100), pcode, unit: 'E',
      binsize: pcode === 'MWD' ? '10' : '05', binb: '0', lowerb: 'none', upperb: 'none', Tout: 'H', percdec: '2', aver: 'Y', averdec: '1', hobs: 'Y',
      WsMon: '01', WsDay: '01', WsHou: '00', WeMon: '12', WeDay: '31', WeHou: '23',
      FiltElem: filt[0], FiltType: filt[1], FiltLbnd: filt[2], FiltUbnd: filt[3], FiltElem2: filt2[0], FiltType2: filt2[1], FiltLbnd2: filt2[2], FiltUbnd2: filt2[3], 'Submit Info': 'Submit Info' };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (let i = 0; i < 4; i++) {
      const r = await fetch('https://raws.dri.edu/cgi-bin/wea_freq2.pl', { method: 'POST', body: fd, headers: UA }).catch(() => null);
      if (r?.ok) { fs.writeFileSync(f, await r.text()); break; }
      await sleep(2000 * (i + 1));
    }
    await sleep(700);
    if (!fs.existsSync(f)) return null;
  }
  return parseWrcc(fs.readFileSync(f, 'latin1'));
}
// Rows "a to b" with the All Hrs percentage as the last cell, and the "# obs. passing req." total.
function parseWrcc(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => c[1].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()));
  const pass = rows.find(r => /obs\. passing/i.test(r[0])), total = rows.find(r => /Total\s+#\s*obs/i.test(r[0]));
  const n = pass ? +pass[pass.length - 1] || 0 : total ? +total[total.length - 1] || 0 : 0; // no filter: every observation counts
  const bins = {};
  for (const r of rows) { const m = /^(-?[\d.]+)\s+to\s+(-?[\d.]+)$/.exec(r[0]); if (m && +m[1] >= 0) bins[`${+m[1]}-${+m[2]}`] = Math.round(n * (+r[r.length - 1] || 0) / 100); }
  return { n, possible: total ? +total[total.length - 1] || 0 : 0, bins };
}
const NONE = ['none', '01', 'none', 'none'];
const add = (acc, r) => { if (!r) return; acc.n += r.n; acc.possible += r.possible; for (const [k, v] of Object.entries(r.bins)) acc.bins[k] = (acc.bins[k] || 0) + v; };
const dirStrong = { n: 0, possible: 0, bins: {} }, dirAll = { n: 0, possible: 0, bins: {} }, spdOff = { n: 0, possible: 0, bins: {} };
let missing = 0;
for (const run of runs) {
  const a = await wrcc(run, 'MWD', ['MWS', '03', 'none', '15'], NONE), b = await wrcc(run, 'MWD', NONE, NONE), c = await wrcc(run, 'MWS', ['MWD', '05', '0', '90'], NONE);
  if (!a || !b || !c) missing++;
  add(dirStrong, a); add(dirAll, b); add(spdOff, c);
}

// ---- 3. OAK ASOS ----
const asosFile = path.join(DIR, 'oak-asos-2008-2026.csv');
if (!fs.existsSync(asosFile) && !offline) {
  const r = await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=OAK&data=drct&data=sknt&data=gust&data=relh&year1=2008&month1=1&day1=1&year2=2026&month2=11&day2=1&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3', { headers: UA });
  fs.writeFileSync(asosFile, await r.text());
}
const win = events.map(e => [Date.parse(e.issue), Date.parse(e.expire)]);
const inRFW = t => win.some(([a, b]) => t >= a && t < b);
const oak = { hours: 0, calm: 0, dir: {}, offshore: 0, offSpd: {}, offGust: [], allHours: 0, allOffshore15: 0, rfwOffshore15: 0 };
const KT = 1.15078;
if (fs.existsSync(asosFile)) {
  for (const line of fs.readFileSync(asosFile, 'utf8').split('\n').slice(1)) {
    const [, valid, drct, sknt, gust] = line.split(','); if (!valid) continue;
    const t = Date.parse(valid.replace(' ', 'T') + 'Z'), d = parseFloat(drct), s = parseFloat(sknt) * KT, g = parseFloat(gust) * KT;
    const off = d >= 0 && d <= 90 && s > 0;
    if (!Number.isNaN(s)) { oak.allHours++; if (off && s >= 15) oak.allOffshore15++; }
    if (!inRFW(t) || Number.isNaN(s)) continue;
    oak.hours++;
    if (s === 0 || Number.isNaN(d)) { oak.calm++; continue; }
    const b = Math.floor((d % 360) / 10) * 10; oak.dir[b] = (oak.dir[b] || 0) + 1;
    if (off) { oak.offshore++; const k = Math.floor(s / 5) * 5; oak.offSpd[k] = (oak.offSpd[k] || 0) + 1; if (!Number.isNaN(g)) oak.offGust.push(g); if (s >= 15) oak.rfwOffshore15++; }
  }
}

// ---- summary ----
const share = (acc, lo, hi) => { let s = 0; for (const [k, v] of Object.entries(acc.bins)) { const [a] = k.split('-').map(Number); if (a >= lo && a < hi) s += v; } return acc.n ? s / acc.n : null; };
const shareOak = (lo, hi) => { let s = 0; for (const [k, v] of Object.entries(oak.dir)) if (+k >= lo && +k < hi) s += v; return s / Math.max(1, oak.hours - oak.calm); };
const pct = x => x == null ? null : +(100 * x).toFixed(1);
const ranges = [[0, 20], [20, 40], [40, 50], [50, 70], [20, 70], [70, 90], [0, 90], [150, 240], [240, 300]];
const summary = {
  _note: 'Derived by tools/wind-events.mjs; report only (docs/fire-validation.md §5). Directions are where the wind blows from, degrees true.',
  sources: {
    redFlag: 'NWS MTR Red Flag Warnings (FW.W) whose zones include "East Bay Hills", Iowa Environmental Mesonet VTEC archive, 2008–2026',
    raws: 'Oakland North RAWS (COKN), WRCC frequency tool, hourly mean wind (10-minute mean at 20 ft), local standard time days covered by a warning',
    asos: 'Oakland International Airport ASOS (OAK), IEM, routine hourly reports (2-minute mean at 10 m), exact warning windows (UTC)',
  },
  retrieved: new Date().toISOString().slice(0, 10),
  redFlag: { events: events.length, first: events[0]?.issue, last: events[events.length - 1]?.issue, days: days.size, dayRuns: runs.length, rawsRunsMissing: missing },
  raws: {
    strongHours: dirStrong.n, allHours: dirAll.n, possibleHours: dirAll.possible,
    strongDirectionShares: Object.fromEntries(ranges.map(([a, b]) => [`${a}-${b}`, pct(share(dirStrong, a, b))])),
    allDirectionShares: Object.fromEntries(ranges.map(([a, b]) => [`${a}-${b}`, pct(share(dirAll, a, b))])),
    strongBins: dirStrong.bins, offshoreSpeedBins: spdOff.bins, offshoreHours: spdOff.n,
  },
  oak: {
    hours: oak.hours, calm: oak.calm, offshoreHours: oak.offshore,
    directionShares: Object.fromEntries(ranges.map(([a, b]) => [`${a}-${b}`, pct(shareOak(a, b))])),
    offshoreSpeedBins: oak.offSpd, offshoreGustMedian: oak.offGust.length ? +oak.offGust.sort((a, b) => a - b)[Math.floor(oak.offGust.length / 2)].toFixed(1) : null,
    offshore15mphHours: { inRedFlag: oak.rfwOffshore15, allHours2008to2026: oak.allOffshore15, totalHours: oak.allHours },
  },
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
