// Expert settings changed before the deferred data arrive (js/data.js data.deferred; SOURCE_NOTES GV19; Codex on PR #91).
// Holds the Expert-only files until both settings are changed, then lets them through, and checks that:
//   - the Fuel and weekday placement notes show a loading line instead of throwing,
//   - no page error occurs, before or after the data arrive,
//   - once the data arrive, the notes describe the chosen settings (the run is rebuilt by newRun's deferred wait).
//
//   node tests/deferred-settings.mjs [url]     (default http://127.0.0.1:8766/; serve with python3 tools/serve.py)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL = process.argv.slice(2).find(a => /^https?:/.test(a)) || process.env.URL || 'http://127.0.0.1:8766/';
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// Hold the deferred files (fuel, workplaces, walk access, contours) until released.
let release; const gate = new Promise(r => { release = r; });
await p.route(/(fbfm40\.(json|u8)|workplaces\.json|walk-access\.json|contours\.i16)$/, async route => { await gate; await route.continue(); });
await p.goto(URL);
await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
await p.click('#g-info'); await p.click('[data-menu="expert"]');
await p.waitForSelector('#fuel', { state: 'visible' });
await p.selectOption('#fuel', 'landfire');
await p.selectOption('#nrPlacement', 'workplace');
await p.waitForTimeout(300);
check(/Loading/.test(await p.locator('#fuel-note').innerText()), `fuel note while loading: "${await p.locator('#fuel-note').innerText()}"`);
check(/Loading/.test(await p.locator('#placement-note').innerText()), `placement note while loading: "${await p.locator('#placement-note').innerText()}"`);
check(!errors.length, `no errors before the data arrive${errors.length ? `: ${errors.join(' | ')}` : ''}`);
release();
await p.waitForFunction(() => !/Loading/.test(document.getElementById('fuel-note').innerText + document.getElementById('placement-note').innerText), null, { timeout: 120000 });
check(/LANDFIRE/.test(await p.locator('#fuel-note').innerText()) && (await p.locator('#fuel').inputValue()) === 'landfire', 'fuel note describes LANDFIRE once its data arrive');
check(/Time Study/.test(await p.locator('#placement-note').innerText()) && (await p.locator('#nrPlacement').inputValue()) === 'workplace', 'placement note describes workplace placement once its data arrive');
await p.waitForTimeout(1000);
check(!errors.length, `no errors after the data arrive${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
