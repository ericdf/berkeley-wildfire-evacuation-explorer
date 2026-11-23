// First-load size and time on a phone (Eric, 2026-11-23; SOURCE_NOTES GV19). Opens the page fresh (empty cache) as an
// iPhone 13 on a throttled 4G profile through Chrome DevTools network emulation, and reports:
//   - bytes transferred per file (encoded, as sent; GitHub Pages gzips every file) and in all,
//   - time until the loading screen is gone (#loading detached: the Guided map is drawn and the Run button works),
//   - which files were fetched before that moment and which after.
//
//   node tests/load-size.mjs [url] [--profile slow4g|fast4g] [--runs 3] [--json out.json]
//
// Default url http://127.0.0.1:8766/ (python3 tools/serve.py does not compress, so encoded = decoded there; use the
// Pages site for transfer, or tools/serve-gzip.mjs to serve this checkout gzipped like Pages).
// Profiles (Lighthouse's mobile "Slow 4G" and a faster 4G): slow4g 1.6 Mbit/s down, 750 kbit/s up, 150 ms latency;
// fast4g 9 Mbit/s down, 1.5 Mbit/s up, 60 ms latency. CPU is not throttled.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const URL = argv.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8766/';
const PROFILES = { slow4g: { down: 1.6e6, up: 0.75e6, latency: 150 }, fast4g: { down: 9e6, up: 1.5e6, latency: 60 } };
const prof = PROFILES[arg('--profile', 'slow4g')], RUNS = +arg('--runs', 3);

const browser = await chromium.launch();
const results = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: prof.latency, downloadThroughput: prof.down / 8, uploadThroughput: prof.up / 8 });
  const reqs = new Map(), t0 = Date.now();
  cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, start: Date.now() - t0 }));
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = Date.now() - t0; } });
  await p.goto(URL, { waitUntil: 'commit' });
  await p.waitForSelector('#loading', { state: 'detached', timeout: 600000 });
  const ready = Date.now() - t0;
  await p.waitForTimeout(1500); // files fetched just after the map shows
  const files = [...reqs.values()].filter(r => r.bytes != null).map(r => ({ file: r.url.replace(URL, '').split('?')[0] || 'index.html', bytes: r.bytes, before: r.end <= ready }));
  results.push({ ready, total: files.reduce((s, f) => s + f.bytes, 0), beforeReady: files.filter(f => f.before).reduce((s, f) => s + f.bytes, 0), files });
  await ctx.close();
}
await browser.close();
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const r0 = results[0], mb = b => (b / 1e6).toFixed(2) + ' MB';
console.log(`${URL} · iPhone 13 · ${arg('--profile', 'slow4g')} · ${RUNS} fresh loads`);
console.log(`time until usable (loading screen gone): median ${(med(results.map(r => r.ready)) / 1000).toFixed(1)} s (${results.map(r => (r.ready / 1000).toFixed(1)).join(', ')})`);
console.log(`transferred before usable ${mb(med(results.map(r => r.beforeReady)))}, in all ${mb(med(results.map(r => r.total)))}`);
for (const f of r0.files.sort((a, b) => b.bytes - a.bytes).slice(0, 15)) console.log(`  ${(f.bytes / 1e3).toFixed(0).padStart(7)} kB ${f.before ? 'before' : 'after '} ${f.file}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ url: URL, profile: prof, results }, null, 1));
