// Browser check of fire families in the Simple view: opt in through the disclosure, compare a
// two-change plan on the north-hills fire (27 passes), run "Break down this plan", and fail on any
// console error. Needs a running server and puppeteer-core, which lives outside the repository:
//   python3 tools/serve.py 8771 &
//   PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node tests/families-browser.mjs [url]
// CHROME overrides the Chrome binary (default: the macOS Google Chrome app).
const pp = (await import(process.env.PUPPETEER_CORE || 'puppeteer-core')).default;
const url = process.argv[2] || 'http://127.0.0.1:8771/';
const browser = await pp.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--window-size=1500,1000'] });
const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1000 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.evaluateOnNewDocument(() => { localStorage.setItem('bhe-intro-seen', '1'); localStorage.setItem('bhe-mode', 'simple'); localStorage.setItem('bhe-fire', 'northHills'); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#simple .fam-box', { timeout: 120000 });
let bad = 0; const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// Opt in: the box opens the disclosure and stays off until "Use them".
await page.click('#simple .fam-box');
await page.waitForSelector('#fam-use', { visible: true });
check(!(await page.$eval('#simple .fam-box', b => b.checked)), 'box stays off while the disclosure is open');
check(/no source says where the next fire will start/.test(await page.$eval('#modal-body', b => b.textContent)), 'disclosure text shown');
await page.click('#fam-use');
check(await page.$eval('#simple .fam-box', b => b.checked), 'families on after "Use them"');

await page.click('[data-tab="try"]');
await page.waitForSelector('#try-compare');
check(/\(27 passes\)/.test(await page.$eval('#try-compare', b => b.textContent)), `compare button: ${await page.$eval('#try-compare', b => b.textContent)}`);
check(/Tested on this fire's usual start and wind/.test(await page.$eval('#simple', s => s.textContent)) || !(await page.$('.greynote')), 'grey note names the usual start and wind');

// Two changes that can be stacked.
const picked = [];
for (let k = 0; k < 2; k++) {
  const id = await page.$$eval('#simple [data-lever]', (bs, prev) => bs.find(b => !b.disabled && !b.checked && !prev.includes(b.dataset.lever))?.dataset.lever, picked);
  picked.push(id); await page.click(`#simple [data-lever="${id}"]`); await page.waitForSelector(`#simple [data-lever="${id}"]:checked`);
}
console.log('changes:', picked.join(' + '));
const t0 = Date.now();
await page.click('#try-compare');
await page.waitForFunction(() => /27 passes in/.test(document.querySelector('#try-out')?.textContent || ''), { timeout: 900000, polling: 1000 });
const head = await page.$eval('#try-out .tryres > div', d => d.textContent);
check(/other starts and winds · 27 passes in \d/.test(head), `result header: ${head.trim()}`);
console.log(`compare took ${Math.round((Date.now() - t0) / 1000)} s`);
const out = await page.$eval('#try-out', d => d.textContent);
check(/Where the fire starts and how the wind blows|Every start and wind gave the same verdict/.test(out), 'member lines shown');
for (const li of await page.$$eval('#try-out h3 + ul li', ls => ls.map(l => l.textContent))) console.log('   ', li);

await page.click('#bd-go');
await page.waitForFunction(() => /Your plan, change by change/.test(document.querySelector('#try-out')?.textContent || ''), { timeout: 900000, polling: 1000 });
check(/Same 27 passes/.test(await page.$eval('#try-out', d => d.textContent)), 'breakdown over the same 27 passes');
check(!errors.length, `console errors: ${errors.length}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
await browser.close();
console.log(bad ? `FAIL (${bad})` : 'families-browser: all checks pass');
process.exit(bad ? 1 : 0);
