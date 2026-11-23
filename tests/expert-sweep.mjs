// Expert view control sweep (MASTER, 2026-11-23; SOURCE_NOTES GV29). At desktop width (1280 px), for every Expert setting
// (each option of each select, each checkbox, the seed box at both ends), set it from the defaults, run the simulation to
// the end with the time slider (js/main.js seek: the same steps as playing, without drawing each frame) and check that:
//   - no console error or page error occurs,
//   - the clock advances to the end of the run,
//   - the results panel renders ("This run, at the end", the result cards, the evacuation-time row and its note).
// Map-only settings (street colors, layers, neighborhood, speed, comparison scope) do not change the run: they are set on
// the finished run and checked the same way. Then: one play with ▶ Run, the switch to Guided view and back, and one
// Compare (this scenario, low / medium / high × seeds 1–3).
//
//   python3 tools/serve.py &            # http://127.0.0.1:8766
//   node tests/expert-sweep.mjs [--only id,id] [--no-compare]
//
// About 15 minutes on 4 cores. Needs Playwright with its Chromium (not a repository dependency).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const URL = process.env.URL || 'http://127.0.0.1:8766/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const doCompare = !args.includes('--no-compare');
let failures = 0; const failed = [];
const check = (ok, what) => { if (!ok) { failures++; failed.push(what); } console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

// Settings that only show, or only matter, when another is set (index.html): set these first.
const NEEDS = {
  'p-contraflowMode': { 'p-contraflow': 'main' },
  'p-contraflowPower': { 'p-contraflow': 'main', 'p-contraflowMode': 'signs' },
  'p-contraflowFallback': { 'p-contraflow': 'main', 'p-contraflowMode': 'signs' },
  'p-earlyZones': { 'p-earlyShare': '0.5' },
  'p-officers': { 'p-police': 'pretimed' },
  'p-officerDelayMin': { 'p-police': 'pretimed' },
  'p-compliance': { 'p-routing': '@second' },
};
// Settings that do not change the run (no newRun): checked on the finished run.
const DISPLAY = new Set(['street-mode', 'nbhd', 'speed', 'cmp-scope']);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
let errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('bhe-intro-seen', '1'); localStorage.setItem('bhe-mode', 'simple'); } catch {} });
await p.goto(URL);
await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });

// The switch: Guided view's ⓘ menu opens Expert view; Expert view's header button goes back (SOURCE_NOTES GV28).
await p.click('#g-info');
const item = (await p.locator('[data-menu="expert"]').innerText()).trim();
check(item === 'Expert view', `desktop: the ⓘ menu item reads "${item}"`);
await p.click('[data-menu="expert"]');
check(await p.evaluate(() => document.body.classList.contains('expert')), 'the ⓘ menu item opens Expert view');
await p.click('#modes [data-mode="simple"]');
check(await p.evaluate(() => document.body.classList.contains('simple')), '"← Guided view" in Expert view\'s header goes back to Guided view');
await p.click('#g-info'); await p.click('[data-menu="expert"]');
await p.waitForLoadState('networkidle'); // Expert-only files (fuel, workplaces, walk access) load after first paint
await p.waitForTimeout(500);

const set = (id, v) => p.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  if (v === '@second') v = el.options[1].value;
  if (el.type === 'checkbox') el.checked = v; else el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.type === 'checkbox' ? el.checked : el.value;
}, [id, v]);
const runToEnd = () => p.evaluate(() => { const s = document.getElementById('scrub'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); });
const settle = async () => { // a setting whose data load after the page is up waits for them (js/main.js newRun)
  await p.waitForFunction(() => !/Loading/.test(document.getElementById('fuel-note').innerText + document.getElementById('placement-note').innerText + document.getElementById('walk-note').innerText), null, { timeout: 120000 });
  await p.waitForTimeout(50);
};
async function verify(label, rerun) {
  const t0 = Date.now();
  await settle(); await runToEnd(); // a no-op on a finished run; restoring the previous setting may have started a new one
  const r = await p.evaluate(() => ({
    clock: document.getElementById('clock').innerText,
    head: document.querySelector('#results h2')?.textContent ?? '',
    cards: document.querySelectorAll('#results .cards .card').length,
    ete: document.querySelector('#results .ete-note')?.textContent ?? '',
    scrub: +document.getElementById('scrub').value, max: +document.getElementById('scrub').max,
  }));
  const ms = Date.now() - t0;
  const ok = !errors.length && /Run complete/.test(r.clock) && r.scrub >= r.max - 1 && r.max > 0 && /This run, at the end/.test(r.head) && r.cards >= 8 && r.ete.length > 20;
  check(ok, `${label}${rerun ? ` (${(ms / 1000).toFixed(1)} s)` : ''}${ok ? '' : `: clock "${r.clock.split('\n')[0]}", minute ${r.scrub} of ${r.max}, "${r.head}", ${r.cards} cards, note "${r.ete.slice(0, 60)}"${errors.length ? `, errors: ${errors.join(' | ')}` : ''}`}`);
  errors = [];
}

// One play with ▶ Run: the clock moves on its own.
await p.click('#run'); await p.waitForTimeout(2500); await p.click('#run');
const playedTo = await p.evaluate(() => +document.getElementById('scrub').value);
check(playedTo > 0 && !errors.length, `▶ Run plays the run (minute ${playedTo} after 2.5 s)${errors.length ? `: ${errors.join(' | ')}` : ''}`);
errors = [];
await runToEnd(); await verify('defaults', false);

const controls = await p.evaluate(() => [...document.querySelectorAll('#left section.expert-only select, #run-section select, #left section.expert-only input[type=checkbox], #layers input[type=checkbox]')]
  .filter(el => el.id || el.closest('label')).map(el => ({
    id: el.id || null, layer: el.id ? null : el.closest('label').innerText.trim(), type: el.type,
    value: el.type === 'checkbox' ? el.checked : el.value,
    options: el.tagName === 'SELECT' ? [...el.options].map(o => o.value) : null,
  })));
// Layer boxes have no id: give each one for the sweep.
await p.evaluate(() => document.querySelectorAll('#layers input[type=checkbox]').forEach((el, i) => { if (!el.id) el.id = `sweep-layer-${i}`; }));
controls.filter(c => !c.id).forEach((c, i) => { c.id = `sweep-layer-${i}`; c.display = true; });
let n = 0;
for (const c of controls) {
  if (only && !only.includes(c.id)) continue;
  const display = c.display || DISPLAY.has(c.id);
  const values = c.type === 'checkbox' ? [!c.value] : c.options.filter(v => v !== c.value);
  for (const v of values) {
    const deps = NEEDS[c.id] || {};
    for (const [d, dv] of Object.entries(deps)) await set(d, dv);
    if (c.id === 'families' && v) { // the box opens its disclosure first (js/main.js famBox)
      await p.evaluate(() => document.getElementById('families').click());
      const use = p.locator('#modal button', { hasText: /Use them/ });
      await use.click({ timeout: 5000 }).catch(() => {});
      check(await p.evaluate(() => document.getElementById('families').checked), 'families: "Use them" turns the box on');
    } else await set(c.id, v);
    await verify(`${c.layer ? `layer "${c.layer}"` : c.id} = ${JSON.stringify(v)}${Object.keys(deps).length ? ` (with ${Object.entries(deps).map(([d, dv]) => `${d}=${dv}`).join(', ')})` : ''}`, !display);
    n++;
    // Back to the defaults for the next setting (dependencies first undone in reverse).
    if (c.id === 'families' && v) await p.evaluate(() => { const b = document.getElementById('families'); if (b.checked) b.click(); });
    else await set(c.id, c.value);
    for (const d of Object.keys(deps).reverse()) await set(d, controls.find(x => x.id === d).value);
    // Choosing a scenario sets its time of day: restore the default's.
    if (c.id === 'scenario') await set('tod', controls.find(x => x.id === 'tod').value);
  }
}
// The seed box at both ends.
for (const s of ['999', '1']) { if (only && !only.includes('seed')) break; await set('seed', s); await verify(`seed = ${s}`, true); n++; }
// Plan B gets its own settings: one change there, run as Plan B.
if (!only) {
  await p.click('#plan-tabs [data-plan="B"]'); await set('p-orderDelayMin', '5'); await verify('Plan B tab, decision delay 5 min', true);
  await set('p-orderDelayMin', '10'); await p.click('#plan-tabs [data-plan="A"]'); n++;
}
console.log(`\n${n} settings checked`);

// A fire with no City study case gets the general note.
if (!only) {
  await set('scenario', 'westWind'); await settle(); await runToEnd();
  const note = await p.locator('#results .ete-note').innerText();
  check(/no case for this fire/.test(note), `west-wind fire: "${note.slice(0, 90)}…"`);
  await set('scenario', controls.find(x => x.id === 'scenario').value); await set('tod', controls.find(x => x.id === 'tod').value);
}
// The note's link opens Assumptions & limits at Model performance.
{
  await runToEnd();
  await p.click('#results .ete-note a');
  const at = await p.evaluate(() => ({ open: document.getElementById('modal').open, top: document.getElementById('model-performance')?.getBoundingClientRect().top }));
  check(at.open && at.top != null && at.top < 300, `the note's link opens Model performance (heading at y=${Math.round(at.top)})`);
  await p.click('#modal .close');
}
if (doCompare) {
  const t0 = Date.now();
  await p.click('#compare');
  await p.waitForFunction(() => /Plan comparison/.test(document.getElementById('compare-out').innerText), null, { timeout: 900000 });
  const r = await p.evaluate(() => ({ tables: document.querySelectorAll('#compare-out table').length, notes: [...document.querySelectorAll('#compare-out .ete-note')].map(x => x.innerText) }));
  check(!errors.length && r.tables >= 3 && r.notes.length === 3 && r.notes.every(t => /short of|longer than|no case/.test(t)), `Compare: ${r.tables} tables, ${r.notes.length} evacuation-time notes, ${((Date.now() - t0) / 1000).toFixed(0)} s${errors.length ? `; errors: ${errors.join(' | ')}` : ''}`);
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed:\n  ${failed.join('\n  ')}` : '\nall checks passed');
process.exit(failures ? 1 : 0);
