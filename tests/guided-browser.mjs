// Guided view in a browser (js/guided.js; Eric, 2026-11-10): the map screen fits one screen with no page scroll, and the
// flow run → results → Explain → changes (sort, pick 1, pick 3, overlap warning) → run → comparison (one change from the
// stored table, three changes live) → back to the map → another fire works with no console errors. The fire pace control
// (SOURCE_NOTES GV21) sits on the fire line without page scroll; each pace runs end to end with its own Explain this.
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
  // Status and official alerts link under the title; the status also tops the menu (Eric, 2026-11-23; SOURCE_NOTES GV15, GV16).
  check(await visible('#g-status') && /Pending Berkeley Fire Department review/.test(await p.locator('#g-status').innerText()) && /everbridge\.net\/sign-up/.test(await p.locator('#g-status a').getAttribute('href')), `${name}: status and AC Alert link on the map screen`);
  await p.click('#g-info'); check(/Status: pending Berkeley Fire Department review/.test(await p.locator('#g-menu').innerText()), `${name}: status line in the menu`);
  // The Guided/Expert switch lives in this menu; on a phone it says Expert view is best on a larger screen (SOURCE_NOTES GV29).
  { const t = (await p.locator('[data-menu="expert"]').innerText()).trim(), phone = (dev.viewport?.width ?? 1280) <= 760;
    check(t === (phone ? 'Expert view (best on a larger screen)' : 'Expert view'), `${name}: menu item "${t}"`); }
  await p.click('#g-info');
  await noScroll('at load'); await shot('01-map');
  // Fire pace on the fire line: all three buttons and the ⓘ inside the screen; 1923 pace by default (GV21).
  const pace = await p.evaluate(() => { const w = document.documentElement.clientWidth, bs = [...document.querySelectorAll('#g-pace button')];
    return { inside: bs.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= w && r.width > 0; }), labels: bs.map(b => b.textContent).join('|'), on: document.querySelector('#g-pace [aria-pressed="true"]')?.textContent,
      line: Math.round(document.getElementById('g-fireline').getBoundingClientRect().height), map: Math.round(document.getElementById('map').getBoundingClientRect().height) }; });
  check(pace.inside && pace.labels === 'Slower|1923 pace|1991 pace|ⓘ' && pace.on === '1923 pace', `${name}: fire pace control on the fire line, inside the screen, 1923 pace by default (fire line ${pace.line} px, map ${pace.map} px)`);
  for (const [sev, word] of [['low', 'Slower'], ['central', '1923 pace'], ['high', '1991 pace']]) {
    await p.click('[data-pace-explain]');
    if (sev !== 'central') await p.click(`#modal [data-pace-other="${sev}"]`);
    const t = await p.locator('#modal .gx').innerText();
    check(new RegExp(`Fire pace: ${word}`).test(t) && /model rule/.test(t) && (sev !== 'central' || /S11/.test(t)) && (sev !== 'high' || /FV17/.test(t)) && (sev !== 'low' || /lower bound/.test(t)), `${name}: ${word} has its own Explain this`);
    await p.locator('#modal .close').click();
  }

  // Run. Auto-zoom (MASTER, 2026-11-23; SOURCE_NOTES GV18): while the run plays the view only widens.
  await p.evaluate(() => { const c = document.getElementById('map'); window.__views = []; window.__vt = setInterval(() => { if (document.getElementById('g-after').hidden) window.__views.push(JSON.parse(c.dataset.view)); }, 100); });
  await p.click('#g-run');
  await p.waitForTimeout(2500);
  check(await visible('#clock'), `${name}: clock over the map while running`);
  check(await visible('#g-caption') && (await p.locator('#g-caption').innerText()) === 'Red: cars backed up', `${name}: caption "Red: cars backed up" while running`);
  await noScroll('while running');
  await shot('02-running');
  await waitRunEnd();
  const views = await p.evaluate(() => { clearInterval(window.__vt); return window.__views; });
  const narrowed = views.findIndex((v, i) => i && !(v[0] <= views[i - 1][0] + 1 && v[1] <= views[i - 1][1] + 1 && v[2] >= views[i - 1][2] - 1 && v[3] >= views[i - 1][3] - 1));
  const widened = views.length > 1 && views.at(-1)[2] - views.at(-1)[0] > views[0][2] - views[0][0] + 1;
  check(views.length > 10 && narrowed < 0 && widened, `${name}: during the run the view only widens (${views.length} samples, ${Math.round(views[0][2] - views[0][0])} m → ${Math.round(views.at(-1)[2] - views.at(-1)[0])} m across${narrowed >= 0 ? `, narrowed at sample ${narrowed}` : ''})`);
  check(await visible('#g-chips') && await visible('#g-explore') && await visible('#g-again') && !(await visible('#g-run')), `${name}: after the run, chips, Explore results and Run again`);
  await noScroll('after a run'); await shot('03-after-run-fire');
  check(/Streets embers reached across 5 runs of this fire/.test(await p.locator('#g-caption').innerText()), `${name}: caption after the run names the 5 runs at the pace`);
  const keyOpen = async () => { const t = p.locator('#legend .key-toggle'); if (await t.count() && /▸/.test(await t.innerText())) { await t.click(); await p.waitForTimeout(150); return true; } return false; };
  const opened = await keyOpen();
  check(/in 5 runs at 1923 pace/.test(await p.locator('#legend').textContent()), `${name}: map key names the pace`);
  if (opened) { await p.locator('#legend .key-toggle').click(); await p.waitForTimeout(150); }
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
  // No part's label is cut off (MASTER, 2026-11-23: truncated at 320 px on iPhone SE).
  const cut = await p.locator('#g-panel .sp-key span').evaluateAll(ss => ss.filter(s => s.scrollWidth > s.clientWidth + 1 || getComputedStyle(s).textOverflow === 'ellipsis').map(s => s.textContent));
  check(!cut.length, `${name}: the four-part key shows every label in full${cut.length ? ` (cut: ${cut.join('; ')})` : ''}`);
  // Plain-language labels (GV12): none of the old three words in Guided view's results.
  const chips = await p.locator('#g-panel .rc .robust').allTextContents();
  check(chips.length === 6 && chips.every(t => /nearly every run|Depends on the night parking rule|Varies from run to run|Same in every run|None in nearly/.test(t)) && !chips.some(t => /^(Consistent|Sensitive|Mixed)$/.test(t) || /fire strength/.test(t)), `${name}: plain labels on results, none by fire strength within one pace (${chips.join(' | ')})`);
  // Status quo, the pace and the other paces' medians (GV21, GV22).
  const rtext = await p.locator('#g-panel').innerText();
  check(/Status quo ⓘ, median of 5 runs at 1923 pace/.test(rtext) && !/today's plan/i.test(rtext), `${name}: results say "Status quo", 5 runs at 1923 pace`);
  const plines = await p.locator('#g-panel .rc-p').allTextContents();
  check(plines.length === 5 && plines.every(t => /^(Slower: .+ · 1991 pace: .+|The same at every fire pace)$/.test(t)), `${name}: each result gives the other paces' medians (${plines.join(' | ')})`);
  await p.click('#g-panel [data-sq]');
  const sqt = await p.locator('#modal .gx').innerText();
  check(/10 minutes after the fire starts/.test(sqt) && /no new roads or rules/.test(sqt) && /assumption/.test(sqt), `${name}: Status quo has its Explain this`);
  await p.locator('#modal .close').click();
  // Where traffic backed up (SOURCE_NOTES GV25): one compact card after the six result cards: top 3 streets, then 2 more,
  // then all; the flats line; Explain this. Heights collapsed and expanded (MASTER, 2026-11-23).
  const bk = await p.locator('#g-panel .bk').innerText().catch(() => '');
  check(/Where traffic backed up in these runs/.test(bk) && (await p.locator('#g-panel .bk-row').count()) === 3 && /flats/.test(bk) && /Show 2 more/.test(bk) && /person-hours/.test(bk), `${name}: backups card after the results, 3 streets, Show 2 more, flats line`);
  const bkH = async () => p.evaluate(() => Math.round(document.querySelector('#g-panel .bk').getBoundingClientRect().height));
  const h3 = await bkH(), panelH = await p.evaluate(() => document.getElementById('g-panel').clientHeight);
  await p.click('#g-panel [data-explain-backups]');
  const bkx = await p.locator('#modal .gx').innerText();
  check(/What it counts/.test(bkx) && /synthetic/.test(bkx) && /model rule/.test(bkx) && /assumption/.test(bkx) && /Limits/.test(bkx), `${name}: backups Explain this gives what it counts, provenance and limits`);
  await p.locator('#modal .close').click();
  await p.click('#g-panel [data-bk-more]'); const n5 = await p.locator('#g-panel .bk-row').count(), h5 = await bkH();
  await p.click('#g-panel [data-bk-more]'); const nAll = await p.locator('#g-panel .bk-row').count(), hAll = await bkH();
  check(n5 === 5 && nAll > 5, `${name}: Show 2 more lists 5 streets, Show all lists ${nAll}`);
  console.log(`     ${name}: backups card ${h3} px collapsed (${(h3 / panelH).toFixed(2)} screens), ${h5} px with 5, ${hAll} px with all ${nAll}`);
  await p.click('#g-panel [data-bk-more]');
  check((await p.locator('#g-panel .bk-row').count()) === 3, `${name}: Show fewer goes back to 3`);
  const firstStreet = (await p.locator('#g-panel .bk-row b').first().innerText()).trim();
  await p.locator('#g-panel .bk-row').first().click(); await p.waitForTimeout(800);
  check(!(await visible('#g-panel')) && (await p.locator('#g-caption').innerText()).startsWith(firstStreet), `${name}: tapping ${firstStreet} goes to the map, captioned and highlighted`);
  await noScroll('on a backup street'); await shot('07b-backup-street');
  await p.click('[data-chip="ways"]'); await p.waitForTimeout(200);
  check(/Ways out the fire front reached/.test(await p.locator('#g-caption').innerText()), `${name}: a map chip clears the backup street's caption and highlight`);
  await p.click('[data-chip="fire"]'); await p.waitForTimeout(200);
  await p.click('#g-explore');
  await p.locator('[data-explain="ember"]').click();
  check(/Ember Threat Zones/.test(await p.locator('#modal .gx').innerText()) && await p.locator('#modal .gx a[href*="3c5e1686ebc543ffbdd1eb8698b51fe2"]').count() === 1, `${name}: embers Explain this notes the County's ember map`);
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
  const phone = name !== 'desktop';
  check(perGroup.every(n => n <= (phone ? 2 : 3)), `${name}: at most ${phone ? 2 : 3} changes per group before Show more (${perGroup.join(', ')})`);
  // The Extreme Fire Weather change's shorter row name (Eric, 2026-11-23, cosmetic fixes; SOURCE_NOTES GV26).
  check(/Leave on Extreme Fire Weather \(10 zones\)/.test(await p.locator('#g-panel').innerText()), `${name}: Extreme Fire Weather row uses its short name`);
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
  const heads3 = await p.locator('.rc.cmp').first().locator('.cmpgrid small').allTextContents();
  check(heads3.join('|') === 'Status quo|With changes|Difference' && (await p.locator('.rc.cmp .rc-p').count()) === 0, `${name}: comparison columns ${heads3.join(' / ')}, no other-paces line`);
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
  check(await visible('#g-run') && !(await visible('#g-tag')), `${name}: a new fire resets to the status quo`);
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
  // The map frames the chosen fire: every start lies inside the map, clear of its edges (MASTER, 2026-11-13).
  const framed = await p.evaluate(() => { const c = document.getElementById('map'), r = c.getBoundingClientRect(), s = JSON.parse(c.dataset.starts || '[]');
    return { n: s.length, ok: s.every(([x, y]) => x >= 20 && y >= 20 && x <= r.width - 20 && y <= r.height - 20), s, w: Math.round(r.width), h: Math.round(r.height) }; });
  const view = await p.evaluate(() => JSON.parse(document.getElementById('map').dataset.view || 'null'));
  check(view && view[0] >= -1 && view[1] >= -1 && (view[2] <= view[4] + 1 || view[0] <= 1) && (view[3] <= view[5] + 1 || view[1] <= 1), `${name}: framed view stays on the terrain grid (${JSON.stringify(view)})`);
  check(framed.n > 0 && framed.ok, `${name}: west-wind fire's start inside the map (${JSON.stringify(framed.s)} in ${framed.w}×${framed.h})`);
  // A drag stops the follow for the run and shows Fit; Fit brings the starts back into view and follows again.
  await p.click('#g-run'); await p.waitForTimeout(1500);
  const mb = await p.locator("#map").boundingBox(), mx = mb.x + mb.width / 2, my = mb.y + mb.height / 2;
  await p.mouse.move(mx, my); await p.mouse.down(); await p.mouse.move(mx + 120, my + 90, { steps: 6 }); await p.mouse.up();
  const dataset = () => p.evaluate(() => { const c = document.getElementById('map'); return { view: c.dataset.view, follow: c.dataset.follow, starts: JSON.parse(c.dataset.starts || '[]'), w: c.clientWidth, h: c.clientHeight }; });
  const panned = await dataset(); await p.waitForTimeout(3000); const later = await dataset();
  check(panned.follow === 'false' && await visible('#g-fit'), `${name}: a drag stops auto-follow and shows Fit`);
  // The view still reads as dragged (the map redraws, but the guided view no longer moves it).
  const mapView = () => p.evaluate(() => { const c = document.getElementById('map'); return c.dataset.view; });
  check(later.follow === 'false' && (await mapView()) === panned.view, `${name}: after a drag the view stays where the user put it`);
  await p.click('#g-fit'); await p.waitForTimeout(900);
  const fitted = await dataset();
  check(fitted.follow === 'true' && !(await visible('#g-fit')) && fitted.starts.every(([x, y]) => x >= 0 && y >= 0 && x <= fitted.w && y <= fitted.h), `${name}: Fit restores the follow with the start in view`);
  await noScroll('after Fit');
  // The follow stays on the fire: ordered zones count only within 1 km of it, so the view never widens to the city (Eric, 2026-11-23).
  // Measured on the view's shorter side, the one the followed extent fills: the longer side is set by the screen's shape
  // (on a 1280×800 desktop a 5.9 km tall view is 10.7 km wide).
  await p.evaluate(() => { const c = document.getElementById('map'); window.__ww = 0; window.__wt = setInterval(() => { if (document.getElementById('g-after').hidden) { const v = JSON.parse(c.dataset.view); window.__ww = Math.max(window.__ww, Math.min(v[2] - v[0], v[3] - v[1])); } }, 100); });
  await waitRunEnd();
  const wwMax = await p.evaluate(() => { clearInterval(window.__wt); return Math.round(window.__ww); });
  check(wwMax > 0 && wwMax <= 7000, `${name}: west-wind follow stays near the fire (shorter side of the view at most ${wwMax} m, limit 7,000)`);
  await p.click('#g-explore');
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
  // No change name runs under its cost label (MASTER, 2026-11-13: "Buy out the top-ranked blocks, about$99M–$232M").
  await p.locator('details.cg-none summary').click().catch(() => {});
  const overlaps = await p.evaluate(() => [...document.querySelectorAll('#g-panel .cr')].filter(r => {
    const c = r.querySelector('.cr-c')?.getBoundingClientRect(), b = r.querySelector('.cr-t b'); if (!c || !b || !c.width) return false;
    const rg = document.createRange(); rg.selectNodeContents(b);
    return [...rg.getClientRects()].some(t => t.right > c.left + 1 && t.left < c.right - 1 && t.bottom > c.top + 1 && t.top < c.bottom - 1);
  }).map(r => r.querySelector('.cr-t b').textContent));
  check(!overlaps.length, `${name}: no change name overlaps its cost${overlaps.length ? `: ${overlaps.join('; ')}` : ''}`);
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

  // Each pace end to end (GV21): the earthquake at 1991 pace, then the east-wind fire at Slower; the figures change
  // with the pace, the map key and results name it, and the map screen still fits.
  const paceRun = async (fire, sev, word) => {
    await p.selectOption('#g-fire', fire); await p.waitForTimeout(300);
    await p.click(`[data-pace="${sev}"]`); await p.waitForTimeout(300);
    check((await p.locator('#g-pace [aria-pressed="true"]').innerText()) === word, `${name}: ${word} chosen`);
    await noScroll(`at ${word}`);
    await p.click('#g-run'); await waitRunEnd();
    await p.click('#g-explore');
    const t = await p.locator('#g-panel').innerText(), vals = await p.locator('.rc .rc-n').allTextContents();
    check(new RegExp(`median of 5 runs at ${word}`).test(t) && vals.length === 6, `${name}: ${fire} at ${word}, results (${vals.join(' | ')})`);
    await p.locator('[data-explain="ember"]').click();
    check(new RegExp(`\\(${word}, seed 1\\)`).test(await p.locator('#modal .gx').innerText()), `${name}: ${fire} at ${word}, the watched run is at that pace`);
    await p.locator('#modal .close').click();
    await p.click('[data-go="changes"] >> nth=0');
    check(new RegExp(`${word} · pick up to 3`).test(await p.locator('#g-panel .gv-head').innerText()), `${name}: ${fire} at ${word}, changes`);
    await p.click('[data-go="map"] >> nth=0');
    return vals;
  };
  const q3 = await paceRun('quake', 'high', '1991 pace');
  // The earthquake's backups move from run to run, so one line replaces the list (Eric, 2026-11-23, option a; GV25).
  await p.click('#g-explore');
  check((await p.locator('#g-panel .bk-row').count()) === 0 && /No street backed up in nearly every run of this fire at this pace; backups moved from run to run\./.test(await p.locator('#g-panel .bk').innerText()), `${name}: earthquake at 1991 pace, one line instead of the backups list`);
  await p.click('[data-go="map"] >> nth=0');
  // Changing the pace on Results starts a new run: the pop-up no longer reports "the run you watched" (Codex, PR #93).
  await p.click('#g-explore'); await p.click('[data-pace="central"]'); await p.waitForTimeout(300);
  await p.locator('[data-explain="ember"]').click();
  check(!/run you watched/.test(await p.locator('#modal .gx').innerText()), `${name}: after a pace change on Results, no watched-run figure until the new run ends`);
  await p.locator('#modal .close').click(); await p.click('[data-go="map"] >> nth=0');
  await shot('24-quake-1991');
  const e1 = await paceRun('eastWind', 'low', 'Slower');
  await shot('25-east-slower');
  check(q3[0] !== e1[0], `${name}: figures follow the fire and pace`);
  // A pace change on Results starts a new run; tapping a backup street still frames, highlights and captions it (Codex, PR #94).
  await p.click('#g-explore'); await p.click('[data-pace="central"]'); await p.waitForTimeout(300);
  const st2 = (await p.locator('#g-panel .bk-row b').first().innerText()).trim();
  await p.locator('#g-panel .bk-row').first().click(); await p.waitForTimeout(800);
  check((await p.locator('#g-caption').innerText()).startsWith(st2) && await visible('#g-caption'), `${name}: before the new run ends, tapping ${st2} still captions and highlights it`);

  check(!errors.length, `${name}: no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`     heights: results ${hr.sh}/${hr.ch}, changes ${hc.sh}/${hc.ch}, comparison ${hcmp.sh}/${hcmp.ch}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
