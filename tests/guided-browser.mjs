// Guided view in a browser (js/guided.js; Eric, 2026-11-10): the map screen fits one screen with no page scroll, and the
// flow run → results → Explain → changes (sort, pick 1, pick 3, overlap warning) → run → comparison (one change from the
// stored table, three changes live) → back to the map → another fire works with no console errors.
//
//   python3 tools/serve.py &            # http://127.0.0.1:8766
//   node tests/guided-browser.mjs [device ...] [--quick] [--shots dir]
//
// Devices: Playwright names ('iPhone 13', 'iPhone SE') or 'desktop' (1280×800). Default: all three; the stacked live
// comparison (30 runs) runs on the first device only. --quick skips it. --shots saves screenshots at deviceScaleFactor 2
// (default docs/screens/, which .gitignore leaves out). Needs Playwright with its Chromium (not a repository dependency).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const shotsAt = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : 'docs/screens';
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots');
const DEVICES = names.length ? names : ['iPhone 13', 'iPhone SE', 'desktop'];
const URL = process.env.URL || 'http://127.0.0.1:8766/';
fs.mkdirSync(shotsAt, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const browser = await chromium.launch();
for (const [di, name] of DEVICES.entries()) {
  const dev = name === 'desktop' ? { viewport: { width: 1280, height: 800 } } : devices[name];
  const ctx = await browser.newContext({ ...dev, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push(String(e)));
  const tag = name.replace(/\s+/g, '-').toLowerCase();
  const shot = async (step, opts = {}) => p.screenshot({ path: `${shotsAt}/${tag}-${step}.png`, ...opts });
  const noScroll = async what => {
    const d = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(d.sh <= d.ch && d.sw <= d.cw, `${name}: no page scroll ${what} (${d.sw}×${d.sh} in ${d.cw}×${d.ch})`);
  };
  const panelHeight = async what => {
    const h = await p.evaluate(() => ({ sh: document.getElementById('g-panel').scrollHeight, ch: document.getElementById('g-panel').clientHeight }));
    console.log(`     ${name}: ${what} is ${h.sh} px tall in a ${h.ch} px view (${(h.sh / h.ch).toFixed(2)} screens)`);
    return h;
  };
  const visible = sel => p.locator(sel).isVisible();
  const waitRunEnd = () => p.waitForSelector('#g-after:not([hidden])', { timeout: 180000 });

  console.log(`\n== ${name}`);
  await p.goto(URL);
  await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch {} });
  await p.reload();
  await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
  await p.waitForTimeout(500);
  check(await p.evaluate(() => document.body.classList.contains('simple')), `${name}: opens in Guided view`);
  check(await visible('#g-run') && !(await visible('#g-chips')) && !(await visible('#g-after')), `${name}: map screen shows Run simulation only`);
  await noScroll('at load'); await shot('01-map');

  // Run
  await p.click('#g-run');
  await p.waitForTimeout(2500);
  check(await visible('#clock'), `${name}: clock over the map while running`);
  check(await visible('#g-caption') && (await p.locator('#g-caption').innerText()) === 'Red: cars backed up', `${name}: caption "Red: cars backed up" while running`);
  await noScroll('while running');
  await shot('02-running');
  await waitRunEnd();
  check(await visible('#g-chips') && await visible('#g-explore') && await visible('#g-again') && !(await visible('#g-run')), `${name}: after the run, chips, Explore results and Run again`);
  await noScroll('after a run'); await shot('03-after-run-fire');
  check(/Streets embers reached across 15 runs of this fire/.test(await p.locator('#g-caption').innerText()), `${name}: caption after the run names the 15 runs`);
  await p.click('[data-chip="ways"]'); await p.waitForTimeout(300); await shot('04-chip-ways');
  await p.click('[data-chip="engine"]'); await p.waitForTimeout(300); await shot('05-chip-engine');
  await p.click('[data-chip="fire"]'); await p.waitForTimeout(300);
  // Tap a hill street: the first map point that opens the street card.
  const box = await p.locator('#map').boundingBox();
  let sheet = false;
  for (const [fx, fy] of [[0.6, 0.45], [0.55, 0.5], [0.65, 0.4], [0.5, 0.55], [0.7, 0.5], [0.45, 0.45]]) {
    await p.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
    await p.waitForTimeout(200);
    if (await visible('#g-sheet')) { sheet = true; break; }
  }
  check(sheet, `${name}: tapping a street opens its card`);
  if (sheet) {
    await p.locator('#g-sheet .g-src summary').click();
    const src = await p.locator('#g-sheet').innerText();
    check(/model rule/.test(src) && (!/ft of pavement/.test(src) || /(sourced|derived|assumption)/.test(src) && /synthetic/.test(src)), `${name}: the street card gives each figure's provenance`);
    await shot('06-street-card'); await p.click('#g-sheet .g-x');
  }

  // Results
  await p.click('#g-explore');
  check(await visible('#g-panel') && (await p.locator('.rc').count()) === 6, `${name}: results view with 6 cards`);
  const order = await p.locator('.rc .rc-l').allTextContents();
  check(/embers/.test(order[0]) && /fire front/.test(order[1]) && /engine/.test(order[2]) && /one way out/.test(order[3]) && /no open route/.test(order[4]) && /buildings lost/.test(order[5]), `${name}: results in the agreed order`);
  await noScroll('on results'); const hr = await panelHeight('Results view');
  await shot('07-results');
  // The four-way split under the two people cards (GV13).
  const splits = await p.locator('#g-panel .rc .sp').count(), keys = await p.locator('#g-panel .rc:nth-of-type(1) .sp-key span, #g-panel .rc .sp-key span').count();
  check(splits === 2 && keys === 8, `${name}: the two people cards each split four ways (${splits} splits, ${keys} parts)`);
  // Plain-language labels (GV12): none of the old three words in Guided view's results.
  const chips = await p.locator('#g-panel .robust').allTextContents();
  check(chips.length === 6 && chips.every(t => /nearly every run|Depends on|Varies from run to run|Same in every run|None in nearly/.test(t)) && !chips.some(t => /^(Consistent|Sensitive|Mixed)$/.test(t)), `${name}: plain labels on results (${chips.join(' | ')})`);
  await p.locator('[data-explain="ember"]').click();
  check(await p.locator('#modal[open] .gx').isVisible(), `${name}: Explain this opens a pop-up`);
  const ex = await p.locator('#modal .gx').innerText();
  check(/What it counts/.test(ex) && /runs behind it/.test(ex) && /synthetic/.test(ex) && /Limits/.test(ex) && /run you watched/.test(ex), `${name}: the pop-up gives counts, runs, provenance, limits and the watched run`);
  await shot('08-explain');
  await p.locator('#modal .close').click();

  // Changes
  await p.click('[data-go="changes"] >> nth=0');
  const heads = await p.locator('h3.cg').allTextContents();
  check(heads[0]?.startsWith('Fewer people') && heads.includes('No consistent benefit in our tests'), `${name}: changes grouped by result (${heads.join(' | ')})`);
  await p.click('[data-about-gains]');
  check(/Where it comes from/.test(await p.locator('#modal .gx').innerText()), `${name}: About these gains gives provenance`);
  await p.locator('#modal .close').click();
  // Top 3 per group, the rest behind "Show N more".
  const perGroup = await p.locator('#g-panel').evaluate(P => [...P.querySelectorAll('h3.cg')].filter(h => !h.closest('details')).map(h => { let n = 0; for (let e = h.nextElementSibling; e && !e.matches('h3, details'); e = e.nextElementSibling) if (e.matches('.cr')) n++; return n; }));
  check(perGroup.every(n => n <= 3), `${name}: at most 3 changes per group before Show more (${perGroup.join(', ')})`);
  await noScroll('on changes'); const hc = await panelHeight('Changes view');
  await shot('09-changes');
  const before = await p.locator('.cr').count();
  await p.locator('[data-more]').first().click();
  check((await p.locator('.cr').count()) > before && /Show fewer/.test(await p.locator('[data-more]').first().innerText()), `${name}: Show more lists the rest of a group`);
  await p.locator('[data-more]').first().click();
  const order2 = async () => (await p.locator('[data-pick]').evaluateAll(bs => bs.map(b => b.dataset.pick))).join(',');
  const byBenefit = await order2();
  await p.click('[data-sort="cost"]');
  const byCost = await order2();
  check(byBenefit !== byCost, `${name}: cost sort reorders the rows`);
  await shot('10-changes-by-cost');
  await p.click('[data-sort="benefit"]');

  // One change: from the stored table
  await p.click('[data-pick="parkingOneSide"] >> nth=0');
  check((await p.locator('.pickrow span').innerText()).startsWith('1 change'), `${name}: pick 1`);
  await shot('11-pick-1');
  await p.click('[data-runpicks]');
  await waitRunEnd();
  check(await visible('#g-tag'), `${name}: the map says it shows changes`);
  await noScroll('after a run with a change'); await shot('12-run-with-change');
  await p.click('#g-explore');
  const cmp1 = await p.locator('.rc.cmp').count();
  const diff = await p.locator('.rc.cmp').nth(2).locator('.cmpgrid b').nth(2).innerText();
  check(cmp1 === 6 && /^−/.test(diff), `${name}: one-change comparison from the table, engine row ${diff}`);
  // Difference colors: improvement green, worse amber, no change gray.
  const cls = await p.locator('.rc.cmp .cmpgrid div:nth-child(3) b').evaluateAll(bs => bs.map(b => [b.textContent, b.className]));
  check(cls.every(([t, c]) => t === 'No change' ? c === 'same' : t.startsWith('−') ? c === 'good' : t.startsWith('+') ? c === 'worse' : true), `${name}: difference colors (${cls.map(([t, c]) => `${t}:${c}`).join(' ')})`);
  const hcmp = await panelHeight('Comparison (one change)');
  await shot('13-compare-1');
  for (const id of ['ember', 'front', 'engine', 'oneWay', 'cutOff']) {
    await p.locator(`[data-explain-cmp="${id}"]`).click();
    const t = await p.locator('#modal .gx').innerText();
    check(/Where it comes from/.test(t) && /(synthetic|derived)/.test(t), `${name}: comparison Explain this for ${id} gives provenance`);
    if (id === 'engine') await shot('14-explain-compare');
    await p.locator('#modal .close').click();
  }

  // Three changes: conflict, overlap warning, live comparison
  await p.click('[data-go="changes"] >> nth=0');
  for (const b of await p.locator('[data-more]').all()) await b.click(); // every group open, so the picks below are listed
  await p.click('[data-pick="parkingOneSide"] >> nth=0'); // unpick
  await p.click('[data-pick="redCurbFoot"] >> nth=0');
  check(await p.locator('[data-pick="widen-WP-001"]').first().isDisabled(), `${name}: widening the red-curbed block is blocked (same block)`);
  await p.click('[data-pick="link-AC-160-N3"] >> nth=0');
  await p.click('[data-pick="leaveEarly"] >> nth=0');
  check((await p.locator('.pickrow span').innerText()).startsWith('3 changes'), `${name}: pick 3`);
  check(await p.locator('[data-pick="parkingOneSide"]').first().isDisabled(), `${name}: a fourth pick is blocked`);
  const warn = await p.locator('.pickbar .cr-w').allTextContents();
  check(warn.some(w => /Panoramic/.test(w)), `${name}: overlap warning on the same street (${warn[0] || 'none'})`);
  await shot('15-pick-3');
  await p.locator('[data-cost="redCurbFoot"]').first().click();
  const costText = await p.locator('#modal .gx').innerText();
  check(/Where it comes from/.test(costText) && /derived/.test(costText) && /Source/.test(costText), `${name}: the cost opens its provenance`);
  await shot('15b-cost'); await p.locator('#modal .close').click();
  if (di === 0 && !quick) {
    await p.click('[data-runpicks]');
    await waitRunEnd();
    await p.click('#g-explore');
    check(await p.locator('.gprog').isVisible().catch(() => false) || (await p.locator('.rc.cmp .cmpgrid b').first().innerText()) !== '…', `${name}: live comparison shows progress`);
    await shot('16-compare-3-running');
    await p.waitForFunction(() => !document.querySelector('.gprog'), null, { timeout: 900000 });
    const vals = await p.locator('.rc.cmp .cmpgrid b').allTextContents();
    check(!vals.includes('…'), `${name}: live comparison of three changes finished`);
    await panelHeight('Comparison (three changes)');
    await shot('17-compare-3');
  }
  await p.click('[data-go="map"] >> nth=-1');
  check(!(await visible('#g-panel')), `${name}: back to the map`);

  // Another fire
  await p.selectOption('#g-fire', 'panoramic');
  await p.waitForTimeout(500);
  check(await visible('#g-run') && !(await visible('#g-tag')), `${name}: a new fire resets to today's plan`);
  await noScroll('after a fire change'); await shot('18-fire-change');
  // P19: decide faster is withheld on the north hills and cannot be picked there.
  await p.selectOption('#g-fire', 'northHills'); await p.waitForTimeout(300);
  await p.click('#g-run'); await waitRunEnd(); await p.click('#g-explore'); await p.click('[data-go="changes"] >> nth=0');
  await p.locator('details.cg-none summary').click();
  check(await p.locator('[data-pick="orderSooner"]').first().isDisabled(), `${name}: decide faster cannot be picked on the north hills`);
  await shot('19-north-withheld');
  await p.click('[data-go="map"] >> nth=0');
  // The west-wind fire (SOURCE_NOTES FF24): runs, shows five result cards and its changes; decide faster is withheld (P19).
  await p.selectOption('#g-fire', 'westWind'); await p.waitForTimeout(300);
  await p.click('#g-run'); await waitRunEnd(); await p.click('#g-explore');
  check((await p.locator('.rc').count()) === 6 && /West wind, Claremont Canyon/.test(await p.locator('#g-panel').innerText()), `${name}: west-wind fire results, 6 cards`);
  await noScroll('on west-wind results'); await shot('20-west-results');
  await p.click('[data-go="changes"] >> nth=0');
  await p.locator('details.cg-none summary').click();
  check(await p.locator('[data-pick="orderSooner"]').first().isDisabled(), `${name}: decide faster cannot be picked on the west-wind fire`);
  await shot('21-west-changes');
  await p.click('[data-go="map"] >> nth=0');
  // Home hardening and Zone 0 (SOURCE_NOTES PH32): listed under "Fewer buildings lost" (the blocks-against-scattered
  // comparison is checked on the table in tests/guided.mjs).
  await p.selectOption('#g-fire', 'eastWind'); await p.waitForTimeout(300);
  await p.click('#g-run'); await waitRunEnd(); await p.click('#g-explore'); await p.click('[data-go="changes"] >> nth=0');
  check(await p.locator('h3.cg', { hasText: 'Fewer buildings lost' }).isVisible() && /Harden homes|Zone 0 around homes/.test(await p.locator('#g-panel').innerText()), `${name}: hardening and Zone 0 listed under fewer buildings lost`);
  await shot('23-homes-group');
  await p.click('[data-go="map"] >> nth=0');
  // The earthquake fire (SOURCE_NOTES FF27): runs; single ways out shows "Not computed" (the fault closes streets).
  await p.selectOption('#g-fire', 'quake'); await p.waitForTimeout(300);
  await p.click('#g-run'); await waitRunEnd(); await p.click('#g-explore');
  const qn = await p.locator('.rc .rc-n').allTextContents();
  check(qn.length === 6 && qn[3] === 'Not computed' && qn.filter(t => t === 'Not computed').length === 1, `${name}: earthquake results, single ways out not computed (${qn.join(' | ')})`);
  await p.locator('[data-explain="oneWay"]').click();
  check(/Hayward Fault/.test(await p.locator('#modal .gx').innerText()), `${name}: earthquake, Explain this says why single ways out is not computed`);
  await shot('22-quake-results');
  await p.locator('#modal .close').click();
  await p.click('[data-go="map"] >> nth=-1');

  check(!errors.length, `${name}: no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`     heights: results ${hr.sh}/${hr.ch}, changes ${hc.sh}/${hc.ch}, comparison ${hcmp.sh}/${hcmp.ch}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
