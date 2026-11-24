// Accessibility check (MASTER, 2026-11-23; SOURCE_NOTES GV31–GV35). axe-core (WCAG 2.0/2.1 A and AA rules) on each
// screen: Guided map before and after a run, an Explain this pop-up, Results, Changes, the comparison after a run with
// one change, the ⓘ menu, and Expert view after a run, on iPhone 13 and desktop (1280×800). Fails on any serious or
// critical violation. Also checks what axe does not: the map canvas has a role and a live text summary, the segmented
// controls expose their state, an Explain this pop-up is a labeled modal dialog that keeps focus inside and gives it
// back on close, and keyboard focus is visible.
//
//   python3 tools/serve.py &            # http://127.0.0.1:8766
//   npm install -g axe-core@4.10.2      # not a repository dependency, like Playwright
//   node tests/a11y.mjs [device ...] [--all]     (--all also lists moderate and minor violations)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
let axePath;
try { axePath = require.resolve('axe-core/axe.min.js'); } catch {
  try { axePath = createRequire(process.execPath.replace(/bin\/node$/, 'lib/node_modules/')).resolve('axe-core/axe.min.js'); } catch {
    console.error('axe-core not found: npm install -g axe-core@4.10.2'); process.exit(2);
  }
}
const AXE = fs.readFileSync(axePath, 'utf8');

const args = process.argv.slice(2);
const all = args.includes('--all');
const names = args.filter(a => !a.startsWith('--'));
const DEVICES = names.length ? names : ['iPhone 13', 'desktop'];
const URL = process.env.URL || 'http://127.0.0.1:8766/';
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const browser = await chromium.launch();
for (const name of DEVICES) {
  const dev = name === 'desktop' ? { viewport: { width: 1280, height: 800 } } : devices[name];
  const ctx = await browser.newContext({ ...dev });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('bhe-intro-seen', '1'); localStorage.setItem('bhe-mode', 'simple'); localStorage.removeItem('bhe-fire'); } catch {} });
  await p.goto(URL);
  await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
  await p.waitForTimeout(400);
  console.log(`\n== ${name}`);
  const scan = async (screen, include = null) => {
    await p.evaluate(AXE);
    const r = await p.evaluate(async inc => (await window.axe.run(inc ? { include: [inc] } : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations
      .map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => `${n.target.join(' ')}${n.any?.[0]?.message ? ` (${n.any[0].message.slice(0, 140)})` : ''}`) })), include);
    const bad = r.filter(v => v.impact === 'serious' || v.impact === 'critical');
    check(!bad.length, `${name}, ${screen}: no serious or critical violations${bad.length ? '\n' + bad.map(v => `       [${v.impact}] ${v.id}: ${v.help}\n         ${v.nodes.slice(0, 6).join('\n         ')}${v.nodes.length > 6 ? `\n         …and ${v.nodes.length - 6} more` : ''}`).join('\n') : ''}`);
    if (all) for (const v of r.filter(v => !bad.includes(v))) console.log(`     [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
  };
  const waitRunEnd = () => p.waitForSelector('#g-after:not([hidden])', { timeout: 180000 });
  const shotsAt = args.includes('--shots') ? 'docs/screens' : null;
  // Color-vision simulation for screenshots (Machado et al. 2009 matrices, severity 1), for a person to look at.
  const CVD = { deuteranopia: '0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0', protanopia: '0.152 1.053 -0.205 0 0 0.115 0.786 0.099 0 0 -0.004 -0.048 1.052 0 0 0 0 0 1 0' };
  const cvdShots = async step => {
    if (!shotsAt) return;
    fs.mkdirSync(shotsAt, { recursive: true });
    for (const [k, m] of Object.entries(CVD)) {
      await p.evaluate(([k, m]) => { document.getElementById('cvd-svg')?.remove(); document.body.insertAdjacentHTML('beforeend', `<svg id="cvd-svg" width="0" height="0" style="position:absolute"><filter id="cvd-${k}"><feColorMatrix type="matrix" values="${m}"/></filter></svg>`); document.documentElement.style.filter = `url(#cvd-${k})`; }, [k, m]);
      await p.screenshot({ path: `${shotsAt}/a11y-${name.replace(/\s+/g, '-').toLowerCase()}-${step}-${k}.png` });
    }
    await p.evaluate(() => { document.documentElement.style.filter = ''; document.getElementById('cvd-svg')?.remove(); });
  };
  // The key's street classes: every colored class has its own line pattern (gray "no data" classes may share solid).
  const keyPatterns = async what => {
    const L = await p.evaluate(() => { const b = document.querySelector('#legend .key-toggle'); if (b && !document.querySelector('#legend svg.swl') && /▸/.test(b.textContent)) b.click();
      return [...document.querySelectorAll('#legend svg.swl line')].map(l => ({ c: l.getAttribute('stroke'), d: l.getAttribute('stroke-dasharray') || 'solid', t: l.closest('div').textContent.trim() })); });
    const gray = c => /^#(a9a9a9|aaa|c8c8c8|d4d4d4|e5e7eb|cbd5e1|9ca3af|666|5b5b5b)$/i.test(c);
    const colored = L.filter(x => !gray(x.c)), dup = colored.filter((x, i) => colored.findIndex(y => y.d === x.d) !== i);
    check(L.length > 0 && !dup.length, `${name}, ${what} key: ${L.length} street classes, each colored class with its own line pattern${dup.length ? ` (shared: ${dup.map(x => x.t).join('; ')})` : ` (${colored.map(x => x.d.split(' ').length > 2 ? 'dash-dot' : x.d === 'solid' ? 'solid' : 'dash ' + x.d).join(', ')})`}`);
  };
  // Text over the map: axe cannot see the canvas behind it, so composite each semi-transparent background over the
  // darkest and lightest map pixel (black and white) and take the worse contrast ratio (WCAG 2.1: 4.5, or 3 for large text).
  const overlayContrast = async what => {
    const r = await p.evaluate(() => {
      const rgb = s => (s.match(/[\d.]+/g) || []).map(Number), lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
      const out = [];
      for (const el of document.querySelectorAll('#g-caption, #g-chips button, #g-tag, #legend, #legend div, #clock, #g-fit, #g-ctrl button, .key-toggle')) {
        if (!el.offsetParent || !el.textContent.trim()) continue;
        let bgEl = el, bg = null; while (bgEl && bgEl.id !== 'mapwrap') { const c = rgb(getComputedStyle(bgEl).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) { bg = c; break; } bgEl = bgEl.parentElement; }
        const st = getComputedStyle(el), fg = rgb(st.color), size = parseFloat(st.fontSize), bold = +st.fontWeight >= 700, need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        const worst = Math.min(...[[0, 0, 0], [255, 255, 255]].map(m => { const b = bg ? over(bg, m) : m; return ratio(over(fg, b), b); }));
        out.push({ el: el.id || el.className || el.tagName, worst: +worst.toFixed(2), need });
      }
      return out;
    });
    const bad = r.filter(x => x.worst < x.need);
    check(!bad.length, `${name}, ${what}: text over the map meets contrast (${r.length} elements, lowest ${Math.min(...r.map(x => x.worst))})${bad.length ? ': ' + bad.map(x => `${x.el} ${x.worst} < ${x.need}`).join('; ') : ''}`);
  };
  const pressedGroups = async (what, sel) => {
    const g = await p.evaluate(sel => [...document.querySelectorAll(sel)].map(b => b.getAttribute('aria-pressed')), sel);
    check(g.length > 1 && g.every(v => v === 'true' || v === 'false') && g.filter(v => v === 'true').length === 1, `${name}, ${what}: each button exposes aria-pressed, one pressed (${g.join(', ')})`);
  };
  const mapText = async what => {
    const m = await p.evaluate(() => ({ role: document.getElementById('map').getAttribute('role'), label: document.getElementById('map').getAttribute('aria-label'), desc: document.getElementById(document.getElementById('map').getAttribute('aria-describedby'))?.textContent ?? '' }));
    check(m.role === 'img' && /after ignition|before ignition/.test(m.label) && /^Key: \S/.test(m.desc), `${name}, ${what}: map is an image named "${m.label}", described "${m.desc.slice(0, 110)}…"`);
  };

  await scan('Guided map screen');
  await mapText('map screen'); await pressedGroups('fire pace', '#g-pace [data-pace]');
  // Keyboard: Tab from the top reaches a control, and its focus ring shows.
  await p.keyboard.press('Tab');
  const ring = await p.evaluate(() => { const a = document.activeElement, s = getComputedStyle(a); return { tag: a.tagName, id: a.id || a.textContent.trim().slice(0, 20), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 }; });
  check(ring.tag !== 'BODY' && ring.outline, `${name}: Tab reaches ${ring.tag} "${ring.id}" with a visible focus ring`);
  await p.click('#g-info');
  check(await p.evaluate(() => document.getElementById('g-info').getAttribute('aria-expanded') === 'true' && document.getElementById('g-menu').contains(document.activeElement)), `${name}: the ⓘ menu says it is open and takes focus`);
  await scan('ⓘ menu');
  await p.keyboard.press('Escape');
  check(await p.evaluate(() => document.getElementById('g-menu').hidden && document.activeElement.id === 'g-info'), `${name}: Escape closes the ⓘ menu and returns focus to its button`);
  await p.click('#g-run'); await waitRunEnd(); await p.waitForTimeout(300);
  await scan('map after a run (chips)');
  await mapText('map after a run'); await pressedGroups('map chips', '#g-chips [data-chip]');
  check(/Run complete/.test(await p.locator('#map-live').textContent()), `${name}: the end of the run is announced ("${await p.locator('#map-live').textContent()}")`);
  for (const chip of ['fire', 'ways', 'engine']) { await p.click(`[data-chip="${chip}"]`); await p.waitForTimeout(200); await keyPatterns(`${chip} chip`); await overlayContrast(`${chip} chip`); await cvdShots(`chip-${chip}`); }
  await p.click('[data-chip="fire"]');
  // Find my street (SOURCE_NOTES GV41): a labeled button and combobox, operable from the keyboard alone.
  await p.locator('#g-find-btn').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  const fl = await p.evaluate(() => { const i = document.getElementById('g-find-in'); return { focus: document.activeElement === i, label: document.querySelector('label[for="g-find-in"]')?.textContent, role: i.getAttribute('role'), btn: document.getElementById('g-find-btn').getAttribute('aria-label') }; });
  await p.keyboard.type('telegr'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp');
  await scan('Street search');
  const act = await p.evaluate(() => document.getElementById('g-find-in').getAttribute('aria-activedescendant'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  check(fl.focus && fl.label === 'Find my street' && fl.role === 'combobox' && fl.btn === 'Find my street' && !!act && /Telegraph/.test(await p.locator('#g-caption').textContent()), `${name}: the street search is labeled and works from the keyboard (Enter, type, arrows, Enter)`);
  await p.locator('#g-sheet .g-x').click().catch(() => {});
  await p.click('#g-explore'); await p.waitForTimeout(200);
  await scan('Results');
  const heads = await p.evaluate(() => [...document.querySelectorAll('#g-panel [role=heading][aria-level="3"]')].map(h => h.textContent.trim()));
  check(heads.length >= 5 && /^[\d,]+ people not yet out when the fire or its embers/.test(heads[0]), `${name}: each result card has a heading with its number (${heads.length}; "${heads[0]}")`);
  const opener = p.locator('#g-panel [data-explain] >> nth=0');
  await opener.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await scan('Explain this pop-up');
  const dlg = await p.evaluate(() => { const m = document.getElementById('modal'); return { open: m.open, modal: m.matches(':modal'), name: document.getElementById(m.getAttribute('aria-labelledby'))?.textContent.trim() ?? '' }; });
  let inside = true; for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); inside &&= await p.evaluate(() => document.getElementById('modal').contains(document.activeElement)); }
  check(dlg.open && dlg.modal && dlg.name.length > 5 && inside, `${name}: Explain this is a modal dialog named "${dlg.name.slice(0, 60)}"; 12 Tabs keep focus inside`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check(await p.evaluate(() => !document.getElementById('modal').open && document.activeElement?.matches('[data-explain]')), `${name}: Escape closes it and focus returns to its Explain this button`);
  await p.click('[data-go="changes"] >> nth=0'); await p.waitForTimeout(200);
  await scan('Changes'); await pressedGroups('sort', '#g-panel [data-sort]');
  await p.click('[data-pick="parkingOneSide"] >> nth=0'); await p.click('[data-runpicks]'); await waitRunEnd();
  await p.click('#g-explore'); await p.waitForTimeout(200);
  await scan('comparison (one change)');
  await p.click('[data-go="map"] >> nth=0');
  if (name === 'desktop') {
    await p.click('#g-info'); await p.click('[data-menu="expert"]'); await p.waitForTimeout(300);
    await p.evaluate(() => { const s = document.getElementById('scrub'); s.value = s.max; s.dispatchEvent(new Event('input')); });
    await scan('Expert view after a run');
    await mapText('Expert view'); await pressedGroups('plan tabs', '#plan-tabs button');
    const modes = await p.evaluate(() => [...document.getElementById('street-mode').options].map(o => o.value));
    for (const m of modes) { await p.selectOption('#street-mode', m); await p.waitForTimeout(100); if (m !== 'class' && m !== 'walkRise') await keyPatterns(`Expert "${m}"`); }
    await p.selectOption('#street-mode', 'engineTime'); await cvdShots('expert-engineTime');
  }
  check(!errors.length, `${name}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
