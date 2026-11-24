// Guided view (Eric, 2026-11-10, MASTER session; SOURCE_NOTES GV1–GV8): phone first, the same on a desktop.
//   Map      the fire picker, the map and one Run button; after the run, map chips (Fire, Ways out, Engine reach),
//            a street card on tap, and Explore results / Run again.
//   Results  six cards, most important first: the figure for this fire at the chosen fire pace (median of its 5 runs),
//            the other paces' medians, its label and "Explain this".
//   Changes  changes grouped by the result they improve at that pace (js/guided-data.js groups), up to three picked, then Run.
//   Compare  after a run with changes: status quo | with changes for each card. One change reads the stored
//            table; two or three run 5 paired passes at the pace live (workers), the status quo cached per pass.
// Figures come from data/model/mitigations.json and spread-access.json through js/guided-data.js. "Status quo" was
// "today's plan" until 2026-11-23, and the fire pace (Slower, 1923 pace, 1991 pace: low, medium and high severity)
// came back to Guided view then (Eric, MASTER session; SOURCE_NOTES GV21, GV22).
import { CARDS, GROUPS, cardById, makeGuided, sortItems, costLine, costKey, streetsOf, round10, SEVS, median, NETWORK_FIRES, PACES, paceOf, DEFAULT_PACE, backupRows, blockRange, BACKUP_TOP, BACKUP_ROW_MIN } from './guided-data.js';
import { presence, direction, assumption } from './robust.js';
import { CELL } from './fire.js';
import { swatch } from './map.js';
import { LEVER_OFF } from './presets.js';

// Plain words for the three robustness labels (Eric, 2026-11-12, MASTER session; SOURCE_NOTES GV12). The rules are
// js/robust.js's (SA4, SA6): consistent = at least 90% of the runs; sensitive = shares differ by 0.6 or more between
// fire severities, or an alternative assumption moves the value by 25% or more; mixed = the rest. The precise
// definition stays in each Explain this pop-up (MEANS).
// ctx: 'result' (a count across runs), 'reach' (did embers or the front reach a street), 'way' (did the front reach a
// way out), 'change' (a change against the status quo, pass by pass). L: the label object (presence or direction).
// Since 2026-11-23 Guided view labels the 5 runs at one fire pace (GV21), so "Depends on fire strength" no longer
// arises there; the words stay for any caller that passes runs at several severities.
export function plainLabel(L, ctx) {
  const label = L?.label; if (!label) return null;
  if (ctx === 'networkChange') return L.dir === 'better' ? { text: 'Better in every run', cls: 'r-consistent' } : { text: 'No change in any run', cls: 'r-same' }; // the street network is the same in every run
  if (ctx === 'change') {
    // Exact counts where the label covers every run, as it does at one fire pace (5 runs; reviewer subagent, MASTER,
    // 2026-11-23; SOURCE_NOTES GV36): "nearly every run" read as fewer than all of them.
    const k = L.dir === 'better' ? L.better : L.dir === 'worse' ? L.worse : L.same, all = L.n && k === L.n;
    if (label === 'consistent') return { text: L.dir === 'better' ? (all ? `Better in all ${L.n} runs` : 'Better in nearly every run') : L.dir === 'worse' ? (all ? `Worse in all ${L.n} runs` : 'Worse in nearly every run') : (all ? `No difference in any of the ${L.n} runs` : 'No difference in nearly every run'), cls: L.dir === 'worse' ? 'r-worse' : L.dir === 'better' ? 'r-consistent' : 'r-same' };
    return { text: label === 'sensitive' ? 'Depends on fire strength' : 'Varies from run to run', cls: `r-${label}` };
  }
  if (label === 'consistent') {
    const text = ctx === 'network' ? 'Same in every run'
      : L.present === false ? (ctx === 'result' ? 'None in nearly every run' : 'Not reached in nearly any run')
      : ctx === 'result' ? 'In nearly every run' : 'Reached in nearly every run';
    return { text, cls: 'r-consistent' };
  }
  if (label === 'sensitive') return { text: L.parking ? 'Depends on the night parking rule' : ctx === 'result' ? 'Depends on fire strength' : reachDirection(L.levels), cls: 'r-sensitive' };
  return { text: ctx === 'result' ? 'Varies from run to run' : 'Reached in some runs, by chance', cls: 'r-mixed' };
}
// A sensitive street's wording from its own runs by severity (robust.js presence tests the gap, not a direction):
// "stronger" or "weaker" only when reach rises or falls with severity from low through medium to high (Codex, PR #83).
function reachDirection(levels) {
  const sh = ['low', 'central', 'high'].map(k => levels?.[k]?.[1] ? levels[k][0] / levels[k][1] : null);
  if (sh.some(x => x == null)) return 'Depends on fire strength';
  if (sh[0] <= sh[1] && sh[1] <= sh[2] && sh[2] > sh[0]) return 'Reached mostly when the fire is stronger';
  if (sh[0] >= sh[1] && sh[1] >= sh[2] && sh[0] > sh[2]) return 'Reached mostly when the fire is weaker';
  return 'Depends on fire strength';
}
// The rules over the 5 runs at one fire pace (GV21): "nearly every run" needs at least 90% of the runs, which of 5 is all 5.
const MEANS = {
  consistent: 'The same in all 5 runs at this fire pace. The rule is at least 90% of the runs, which of 5 runs means all 5.',
  mixed: 'Present in some of the 5 runs at this fire pace and not in others, or better in some and not in others: at least 1 of the 5 differs.',
  sensitive: 'It depends mainly on an uncertain assumption: the values under the two night parking rules differ by 25% or more.',
};
// What a change's label means (Explain this on a comparison card): the same rule, worded for a change.
const meansChange = d => d?.label !== 'consistent' ? MEANS[d?.label] || ''
  : `${d.dir === 'better' ? 'Better' : d.dir === 'worse' ? 'Worse' : 'No different'} in ${d.n && (d.dir === 'better' ? d.better : d.dir === 'worse' ? d.worse : d.same) === d.n ? `all ${d.n}` : 'nearly all'} paired runs at this fire pace: each run with the change against the same run without it.`;
const SCOPE = { this: 'this fire', any: 'any wildfire' }; // the earthquake closes streets at the fault, so engine reach differs there (GV36)
// Where the modeled embers go, against the County's ember map (Eric, 2026-11-23, MASTER session; SOURCE_NOTES FV11, GV14).
const EMBER_MAP = 'https://berkeley.maps.arcgis.com/apps/mapviewer/index.html?webmap=3c5e1686ebc543ffbdd1eb8698b51fe2';
const EMBER_NOTE = `The modeled embers follow each fire's start, wind, slope and fuel, not Alameda County's Ember Threat Zones: on four wildfires the two barely agree (rank correlation −0.22 over 7,853 cells, medium severity, measured 2026-11-23). <a href="${EMBER_MAP}" target="_blank" rel="noopener">The County's fire pathways and ember map ↗</a>`;

export function guidedUI(ctx) {
  const { data, map, state, $, esc, fmt, FIRES, PRESETS, mit, spread, MEASURES, badge } = ctx;
  const stripTags = t => String(t ?? '').replace(/<[^>]*>/g, '');
  const savedPace = ctx.store.get('bhe-pace');
  const g = state.g = { more: {}, screen: 'map', chip: 'fire', applied: [], picked: [], sort: 'benefit', live: null, sel: null, follow: true, anim: null, followSim: null, followT: -Infinity, pace: PACES.some(p => p.sev === savedPace) ? savedPace : DEFAULT_PACE };
  const pace = () => paceOf(g.pace), paceName = () => pace().label;
  const runsN = () => mit()?.meta.seeds.length || 5; // runs at one pace
  let G = null;
  const model = () => G ??= makeGuided(mit(), spread(), PRESETS, LEVER_OFF);
  const fireTitle = () => FIRES.find(f => f.id === state.fire)?.title || state.fire;
  const leverById = id => model().leverById(id);
  const simple = () => document.body.classList.contains('simple');
  const done = () => state.sim && state.sim.t >= state.sim.end;
  const started = () => state.sim && (state.sim.t > 0 || state.playing);
  const n = x => x == null ? '—' : fmt(round10(x));
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const chipHTML = (L, c) => { const p = plainLabel(L, c); return p ? `<span class="robust ${p.cls}">${p.text}</span>` : ''; };
  const runSet = () => { const M = mit(); return `${runsN()} runs of ${esc(fireTitle())} at ${paceName()}: the status quo on a fall night, random seeds ${M ? `${M.meta.seeds[0]}–${M.meta.seeds.at(-1)}` : '1–5'}`; };
  // The other two paces' medians, one line under a figure (GV21).
  const otherPaces = (bySev, f = x => n(x)) => PACES.filter(p => p.sev !== g.pace).map(p => `${p.label}: ${f(bySev[p.sev])}`).join(' · ');
  // Lever and preset text from the stored tables still says "today's plan"; Guided view says "status quo" (GV22).
  const sq = t => String(t ?? '').replace(/today's plan/g, 'the status quo').replace(/Today's plan/g, 'The status quo');

  // ---------- header menu and fire line ----------
  // A disclosure, not an ARIA menu: it holds a status line and the license next to its buttons and links (GV33).
  const menu = open => { $('g-menu').hidden = !open; $('g-info').setAttribute('aria-expanded', String(open)); if (open) $('g-menu').querySelector('button, a')?.focus(); };
  $('g-info').onclick = e => { e.stopPropagation(); menu($('g-menu').hidden); };
  document.addEventListener('click', e => { if (!$('g-menu').hidden && !$('g-menu').contains(e.target)) menu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('g-menu').hidden) { menu(false); $('g-info').focus(); } });
  $('g-menu').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    menu(false);
    ({ intro: ctx.openIntro, assumptions: ctx.openAssumptions, sources: ctx.openSources, expert: () => ctx.setMode('expert') })[b.dataset.menu]?.();
  });
  const fireSel = $('g-fire');
  for (const f of FIRES) fireSel.add(new Option(f.title, f.id));
  fireSel.onchange = () => pickFire(fireSel.value);
  // Fire pace (GV21): three buttons on the fire line and one ⓘ that explains the chosen pace.
  const paceBox = $('g-pace');
  paceBox.innerHTML = `<span class="g-pace-l" id="g-pace-l">Fire pace:</span><span class="seg" role="group" aria-labelledby="g-pace-l">${PACES.map(p => `<button data-pace="${p.sev}">${p.label}</button>`).join('')}</span><button class="linkish g-pace-x" data-pace-explain aria-label="Explain this fire pace">ⓘ</button>`;
  paceBox.addEventListener('click', e => {
    const b = e.target.closest('[data-pace]'); if (b) return setPace(b.dataset.pace);
    if (e.target.closest('[data-pace-explain]')) explainPace(g.pace);
  });
  const syncPace = () => paceBox.querySelectorAll('[data-pace]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pace === g.pace)));
  function setPace(sev) {
    if (sev === g.pace) return;
    g.pace = sev; ctx.store.set('bhe-pace', sev);
    cancelLive(); g.sel = null; map.selected = null;
    setup(); startLive(); frameStart(); show(g.screen);
  }
  // Each pace's Explain this; the other two paces are one tap away inside the pop-up.
  function explainPace(sev) {
    const p = paceOf(sev);
    ctx.modal(`<div class="gx"><h2>Fire pace: ${p.label}</h2><p>${p.explain}</p>
      <p>The wind's direction and speed are the same at every pace; how strongly the wind pushes the fire is part of the pace. ${badge('model rule')} The illustrative fire model (js/scenarios.js SEVERITY: ${p.sev === 'central' ? 'medium' : p.sev} severity in Expert view). Ember distances and spot-fire chances are illustrative.</p>
      <p>Every result, change and comparison in Guided view uses the 5 runs at the chosen pace; each result also gives the other paces' medians.</p>
      <p class="small">Other paces: ${PACES.filter(x => x.sev !== sev).map(x => `<button class="linkish" data-pace-other="${x.sev}">${x.label}</button>`).join(' · ')}</p></div>`, 'gx');
    document.querySelectorAll('#modal [data-pace-other]').forEach(b => b.onclick = () => explainPace(b.dataset.paceOther));
  }
  // What the status quo is (GV22).
  function explainSQ() {
    ctx.modal(`<div class="gx"><h2>Status quo</h2>
      <p>Berkeley's first evacuation order 10 minutes after the fire starts, streets parked as they are now, and no new roads or rules. Every change is compared against it.</p>
      <h3>Where it comes from</h3>
      <p><b>The order</b> ${badge('assumption')} 10 minutes after ignition is the simulator's default decision delay; no source gives how fast Berkeley orders. Which zones are ordered or warned is each fire's scenario.</p>
      <p><b>Parking</b> ${badge('assumption')} At night residents park on both sides of most 17–24 ft hill streets, leaving one car's width, a rule resting on one night's count of 11 blocks (2026-11-05). Which blocks are parked is drawn for each run.</p>
      <p><b>Streets</b> ${badge('derived')} County and OpenStreetMap streets as mapped, with no new roads, widenings, contraflow or police at signals.</p>
      <p>Every run has fall-night households and traffic. The earthquake fire keeps its spring-afternoon wind (the USGS HayWired scenario) and the west-wind fire its afternoon onshore wind; Expert view runs each at its own time of day.</p></div>`, 'gx');
  }
  const sqBtn = (t = 'Status quo') => `<button class="linkish sq-x" data-sq>${t} ⓘ</button>`;

  function pickFire(id) {
    state.fire = id; ctx.store.set('bhe-fire', id);
    cancelLive(); g.applied = []; g.sel = null;
    g.picked = g.picked.filter(id => !model().withheld(state.fire, id)); // withheld on the new fire (P19)
    setup(); frameStart(); show('map');
  }
  // The status quo, or the status quo with the applied changes, on the chosen fire at the chosen pace (js/main.js guidedRun).
  function setup() { g.focus = null; fireSel.value = state.fire; syncPace(); ctx.setupRun(g.applied.map(leverById).filter(Boolean), g.pace); }

  // ---------- screens ----------
  function show(screen) {
    g.screen = screen;
    const panel = $('g-panel');
    panel.hidden = screen === 'map';
    document.body.dataset.gscreen = screen;
    if (screen === 'results') panel.innerHTML = g.applied.length ? compareHTML() : resultsHTML();
    else if (screen === 'changes') panel.innerHTML = changesHTML();
    panel.scrollTop = 0;
    wirePanel();
    refresh();
  }
  // Map overlays: the Run button while nothing has run, Pause/Resume while it plays, then results and chips.
  function refresh() {
    if (!simple()) return;
    const d = done(), s = started();
    $('g-run').hidden = d; $('g-run').textContent = state.playing ? 'Pause' : s ? 'Resume' : 'Run simulation';
    $('g-after').hidden = !d;
    $('g-chips').hidden = !d;
    $('g-chips').querySelectorAll('[data-chip]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.chip === g.chip)));
    $('clock').hidden = !s || d;
    const tag = g.applied.length ? `With ${g.applied.length === 1 ? esc(leverById(g.applied[0])?.title || '') : `${g.applied.length} changes`}` : '';
    $('g-tag').hidden = !tag; $('g-tag').innerHTML = tag;
    // One line on the map saying what the colors show, visible without opening the key (Eric, 2026-11-12).
    const runs = runsN();
    // A backup street tapped on Results shows before or after a run (the list reads the stored runs; Codex, PR #94).
    const cap = g.focus ? `${g.focus.street}: where traffic backed up in these runs` : !s ? '' : !d ? 'Red: cars backed up'
      : g.chip === 'fire' ? `Streets embers reached across ${runs} runs of this fire`
      : g.chip === 'ways' ? `Ways out the fire front reached across ${runs} runs of this fire`
      : 'Engine drive time from the nearest station, this run';
    $('g-caption').hidden = !cap; $('g-caption').textContent = cap;
    if (!d) $('g-sheet').hidden = true;
    mapLayers();
  }
  $('g-run').onclick = () => { g.focus = null; ctx.play(!state.playing); refresh(); };
  $('g-again').onclick = () => { setup(); frameStart(); ctx.play(true); refresh(); };
  $('g-explore').onclick = () => show('results');
  $('g-chips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (!b) return; g.chip = b.dataset.chip; g.focus = null; refresh(); // a chip clears a backup street's highlight (Codex, PR #94)
    if (g.sel) sheet(g.sel); });

  // ---------- map view: framing and auto-zoom (MASTER, 2026-11-23; SOURCE_NOTES GV18) ----------
  // Before a run the map frames the fire's starts and START_PAD meters around them, the nearest homes and streets.
  // During the run the view widens, never narrows, to keep the burned and ember cells and the ordered or warned zones in
  // view: checked every FOLLOW_EVERY model seconds and eased over EASE_MS. A drag, wheel or pinch stops the follow for
  // the run; Fit brings it back. After the run it frames the extent of the 5 runs at the chosen pace (summaryExt). The earthquake fire starts
  // across the city, so it shows the whole city throughout. Every view stays on the terrain grid (no blank strip past
  // its edge); the framed points stay in view, since they lie on the grid.
  const CITY = [1500, 1200, 10300, 7600], START_PAD = 1200, FOLLOW_PAD = 300, ZONE_NEAR = 1000, FOLLOW_EVERY = 180, EASE_MS = 500;
  const quake = () => !!NETWORK_FIRES[state.fire];
  const startsOf = () => { const sc = state.sim?.scenario; return sc ? (typeof sc.ignitions === 'function' ? sc.ignitions(1) : sc.ignitions ?? [sc.ignition]).filter(Boolean) : []; };
  const grow = (b, x0, y0, x1 = x0, y1 = y0) => b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
  const pad = (b, m) => b && [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  const inside = (a, b) => a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[2] <= b[2] + 1 && a[3] <= b[3] + 1;
  const viewNow = () => [map.wx(0), map.wy(map.h), map.wx(map.w), map.wy(0)];
  // The visible extent that fits ext, kept on the terrain grid.
  function viewFor(ext) {
    const s = Math.min(map.w / (ext[2] - ext[0]), map.h / (ext[3] - ext[1])) * 0.95, hw = map.w / s / 2, hh = map.h / s / 2;
    let cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
    const T = data.net.meta.terrain, clamp = (c, half, hi) => 2 * half >= hi ? hi / 2 : Math.min(Math.max(c, half), hi - half);
    if (T?.xmax && T?.ymax) { cx = clamp(cx, hw, T.xmax); cy = clamp(cy, hh, T.ymax); }
    return [cx - hw, cy - hh, cx + hw, cy + hh];
  }
  function apply(v) { map.scale = map.w / (v[2] - v[0]); map.cx = (v[0] + v[2]) / 2; map.cy = (v[1] + v[3]) / 2; stamp(); }
  // For tests/guided-browser.mjs: the starts' screen positions and whether the view follows (js/map.js stamps the view).
  function stamp() {
    map.cv.dataset.starts = JSON.stringify(startsOf().map(([x, y]) => [Math.round(map.sx(x)), Math.round(map.sy(y))]));
    map.cv.dataset.follow = String(g.follow);
    $('g-fit').hidden = g.follow;
  }
  // Move to the view that fits ext, at once or eased. Easing moves each edge of the view in a straight line, so a view
  // that contains the current one only ever widens on the way.
  function goTo(ext, ease) {
    if (g.anim) cancelAnimationFrame(g.anim); g.anim = null;
    const to = g.target = viewFor(ext);
    if (!ease || !map.w) { apply(to); map.draw(); return; }
    const from = viewNow(), t0 = performance.now();
    const step = now => {
      const u = Math.min(1, (now - t0) / EASE_MS), e = u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2;
      apply(from.map((a, k) => a + (to[k] - a) * e)); if (!state.playing) map.draw();
      g.anim = u < 1 ? requestAnimationFrame(step) : null;
    };
    g.anim = requestAnimationFrame(step);
  }
  // The starts and START_PAD around them; the whole city for the earthquake.
  function startExt() {
    if (quake()) return CITY;
    let b = null; for (const [x, y] of startsOf()) b = grow(b, x, y);
    return b ? pad(b, START_PAD) : summaryExt();
  }
  // The chosen fire's starts and the streets its embers reached in any of the 5 stored runs at the chosen pace
  // (spread-access.json; GV21), with a margin; the hills (Fire Zones 2–3) until that table loads.
  function summaryExt() {
    if (quake()) return CITY;
    const S = spread()?.streets?.[state.fire]; let b = null, n = 0;
    const add = ([x, y]) => { b = grow(b, x, y); n++; };
    if (S) for (const s of [g.pace]) { const d = S[s]?.ember || ''; for (let e = 0; e < d.length; e++) if (d[e] !== '0' && data.edgeMid[e]) add(data.edgeMid[e]); }
    startsOf().forEach(add);
    if (n < 2) for (const z of data.layers.fireZones || []) if (z.zone >= 2) z.rings.flat().forEach(add);
    return b ? pad(b, 400) : CITY;
  }
  // What the follow keeps in view at model time sim.t: burned and ember cells, and the parts of zones ordered or warned
  // by then that lie within ZONE_NEAR of them. Zones are not drawn during the run, so a large zone's far end must not pull
  // the view across the city (Eric, 2026-11-23: the west-wind fire widened to the whole city for zones reaching north).
  function followExt(sim) {
    const f = sim.fire, tMin = sim.t / 60; let b = null;
    if (f?.arrival) for (let i = 0, N = f.W * f.H; i < N; i++) if (f.arrival[i] <= tMin || f.ember[i] <= tMin) { const x = (i % f.W + 0.5) * CELL, y = (Math.floor(i / f.W) + 0.5) * CELL; b = grow(b, x, y); }
    b = pad(b, FOLLOW_PAD);
    const near = pad(b, ZONE_NEAR);
    if (near) map.zoneShapes.forEach(({ bb }, z) => {
      if (!(sim.orderT?.[z] <= sim.t || sim.warnT?.[z] <= sim.t)) return;
      const c = [Math.max(bb[0], near[0]), Math.max(bb[1], near[1]), Math.min(bb[2], near[2]), Math.min(bb[3], near[3])];
      if (c[0] < c[2] && c[1] < c[3]) b = grow(b, ...c);
    });
    const T = data.net.meta.terrain;
    if (b && T?.xmax && T?.ymax) b = [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(T.xmax, b[2]), Math.min(T.ymax, b[3])];
    return b;
  }
  function frameStart(ease) { g.follow = true; g.followSim = null; goTo(startExt(), ease); }
  function frameSummary(ease) { goTo(summaryExt(), ease); }
  // Called every animation frame while a run plays (js/main.js loop).
  function tick() {
    const sim = state.sim; if (!g.follow || !sim || quake() || !simple()) return;
    if (g.followSim !== sim) { g.followSim = sim; g.followT = -Infinity; }
    if (sim.t - g.followT < FOLLOW_EVERY) return; g.followT = sim.t;
    // While an ease is under way, compare with and widen from where it is going, not the view part way there: checks come
    // every 0.2 s at 15 min/s, inside the 0.5 s ease, and widening from the part-way view with slack each time compounded
    // until the west-wind run showed the whole city (Eric, 2026-11-23).
    const need = followExt(sim), v = g.anim && g.target ? g.target : viewNow(); if (!need || inside(need, v)) return;
    let u = grow(v, need[0], need[1], need[2], need[3]); const m = 0.05 * Math.max(u[2] - u[0], u[3] - u[1]); // a little slack, so it does not step every check
    u = pad(u, m); goTo(u, true);
  }
  // A drag, wheel or pinch on the map (js/map.js onUserView) stops the follow until Fit, Run again or another fire.
  map.onUserView = () => { if (!simple()) return; if (g.anim) cancelAnimationFrame(g.anim); g.anim = null; g.follow = false; stamp(); };
  $('g-fit').onclick = () => {
    g.follow = true;
    if (done()) return frameSummary(true);
    const need = started() && state.sim ? followExt(state.sim) : null, s = startExt();
    goTo(need ? grow(s, need[0], need[1], need[2], need[3]) : s, true); g.followSim = state.sim; g.followT = state.sim?.t ?? -Infinity;
  };

  // ---------- map layers ----------
  const BASE = { terrain: true, contours: true, streets: true, paths: false, evacZones: false, fireZones: false, neighborhoods: false, fire1923: false, cityBoundary: true, stations: false, noParking: false, tightTurns: false, access: false, demand: false, structures: false, fire: false, vehicles: false, queues: false, responder: false };
  function mapLayers() {
    Object.assign(map.layers, BASE);
    map.edgeClass = null; map.edgePalette = null; map.streetMode = 'class';
    if (!done()) { // during the run: fire and traffic only, streets gray (PR #79)
      // Moving-car dots are left out and queues are smoothed, thin and one dark red (GV11), so traffic does not compete with the fire.
      Object.assign(map.layers, { fire: true, queues: true });
      map.streetMode = 'robust'; map.edgeClass = {}; map.edgePalette = ['#a9a9a9'];
    } else if (g.chip === 'fire') {
      map.layers.fire = true; const C = spread() && ctx.edgeClasses(state.fire, 'ember', [g.pace]);
      if (C) { map.streetMode = 'robust'; map.edgeClass = C.cls; map.edgePalette = ctx.PALETTE.spread; }
    } else if (g.chip === 'ways') {
      map.layers.fire = true;
      if (spread()) { map.streetMode = 'robust'; map.edgeClass = ctx.areaEdgeClasses(data, state.fire, [g.pace]); map.edgePalette = [...ctx.PALETTE.access]; map.edgePalette[0] = '#c8c8c8'; }
    } else { map.streetMode = 'engineTime'; map.layers.stations = true; }
    map.marks = g.applied.map(leverById).filter(Boolean).flatMap(marksOf);
    if (g.focus) for (const id of g.focus.edges) map.marks.push({ geom: data.net.edges[id].geom, kind: 'backup', focus: true });
    map.draw(); ctx.legend();
  }
  // Outlines of the applied changes: rewritten or bought-out segments and new roads.
  function marksOf(l) {
    const d = l.delta || {}, E = data.net.edges, out = [];
    for (const id of d.edges?.edges || []) out.push({ geom: E[id].geom, kind: 'street' });
    for (const id of d.retreat?.edges || []) out.push({ geom: E[id].geom, kind: 'buyout' });
    if (d.link) for (const geom of d.link.open ? d.link.open.map(id => E[id].geom) : [d.link.geom]) out.push({ geom, kind: 'link' });
    return out;
  }
  // The key for what the map shows (js/main.js legend calls this in Guided view).
  function legendHTML() {
    const sw = (c, t) => `<div><span class="sw" style="background:${c}"></span>${t}</div>`;
    // Street classes: a line in the class's color and pattern, as drawn on the map (js/map.js swatch; SOURCE_NOTES GV31).
    const sl = (mode, c, t) => `<div>${swatch(mode, c)}${t}</div>`;
    const fireKey = '<div><span class="dot" style="background:#ff7a00"></span>Fire front (last 15 min)</div><div><span class="dot" style="background:#5a1e19"></span>Burned</div><div><span class="dot" style="background:#ffb020;opacity:.6"></span>Embers</div>';
    // Blue with a white edge, so it shows over burned ground and to color-blind readers (GV37); the rule: js/queue-display.js.
    if (!done()) return fireKey + sw('#1d4ed8', 'Cars backed up: 3 or more cars waiting longer than the street\'s free-flow time, averaged over about 7 model minutes');
    const runs = runsN();
    // Plain words for the robustness classes (GV12); the precise rule is in the street card and Explain this pop-ups.
    // One pace's 5 runs (GV21): reached in all 5, in some, or in none.
    if (g.chip === 'fire') { const P = ctx.PALETTE.spread; return `<b>Embers reached the street, in ${runs} runs at ${paceName()}</b>${sl('robust', P[4], 'Reached in every run')}${sl('robust', P[2], 'Reached in some runs, by chance')}${sl('robust', P[1], 'Not reached in any run')}${fireKey}<div class="small muted">${EMBER_NOTE}</div>`; }
    if (g.chip === 'ways') { const P = ctx.PALETTE.access; return `<b>Streets with one way out: did the fire front reach it? In ${runs} runs at ${paceName()}</b>${g.applied.length ? '<div class="small muted">Today\'s street network, without your changes.</div>' : ''}${sl('robust', P[4], 'Reached in every run')}${sl('robust', P[2], 'Reached in some runs, by chance')}${sl('robust', P[1], 'Not reached in any run')}${sl('robust', '#c8c8c8', 'More than one way out')}`; }
    const m = data.A.access.engineServiceMin;
    return `<b>Engine drive time from the nearest station</b>${sl('engineTime', '#2f8a4a', `Within ${m} min`)}${sl('engineTime', '#e0a21e', `${m}–8 min`)}${sl('engineTime', '#c0262d', 'Over 8 min')}${sl('engineTime', '#7f1d1d', 'No engine route')}<div class="small muted">At ignition, with this run's parked cars.</div>`;
  }

  // ---------- street card (bottom sheet) ----------
  function sheet(sel) {
    g.sel = sel;
    const box = $('g-sheet');
    if (!sel || sel.kind !== 'edge' || !done()) { box.hidden = true; return; }
    const net = (state.sim?.data || data).net, e = net.edges[sel.id]; if (!e) { box.hidden = true; return; }
    const name = e.newLink || e.opened ? 'New road (a change you picked)' : e.name ? e.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Unnamed street';
    const lines = [], src = []; // src: where each figure on the card comes from (folded under the card)
    const SA = spread();
    if (g.chip === 'fire' && SA && sel.id < SA.meta.edges) {
      for (const [m, w] of [['ember', 'Embers'], ['front', 'The fire front']]) { const p = presence(ctx.edgeClasses(state.fire, m, [g.pace]).levels(sel.id)); lines.push(`${w} reached it in ${p.k} of ${p.n} runs at ${paceName()}. ${chipHTML(p, 'reach')}`); }
      src.push(['Runs reached', 'model rule', `The illustrative fire model run on this fire's ignition and wind at ${paceName()}, random seeds 1–5; a street counts when embers or the front reach the 30 m cell at its middle (data/model/spread-access.json). The fire does not depend on the plan.`]);
      lines.push(`<span class="small">${EMBER_NOTE}</span>`);
    } else if (g.chip === 'ways') {
      // Single ways out are today's street network (data/model/access-constraints.json); a new road you applied is not in it.
      if (g.applied.length) lines.push('<i>Today\'s street network and the status quo, without your changes.</i>');
      if (NETWORK_FIRES[state.fire]) lines.push('<i>Today\'s street network, without the earthquake\'s closures at the Hayward Fault: a way out shown here may be closed in this fire.</i>');
      src.push(['One way out', 'derived', `Network analysis of County and OpenStreetMap streets (tools/access-constraints.mjs). Fire front at the way out: ${runsN()} runs of this fire at ${paceName()} with the status quo.`]);
      const area = data.access?.edgeAreas.get(sel.id)?.[0], st = area && SA?.areaStatic?.[area.id];
      if (area && st) {
        const p = presence({ [g.pace]: SA.areas?.[state.fire]?.[area.id]?.front?.[g.pace] || [0, SA.meta.seeds.length] });
        lines.push(`Only one way out, through ${esc(area.chokeStreets.join(' / '))}. About ${fmt(round10(st.residents))} modeled residents live behind it.`);
        // A known placement artifact (SOURCE_NOTES AC4): the count likely belongs to homes reached another way.
        if (area.allocationWarning) lines.push(`<span class="cr-w">Population placement artifact: ${esc(area.allocationWarning)}. These residents most likely live on streets reached another way (docs/access-constraints.md, Data problems 2).</span>`);
        lines.push(`The fire front reached that way out in ${p.k} of ${p.n} runs at ${paceName()}. ${chipHTML(p, 'reach')}`);
      } else lines.push('More than one way out: no single closure cuts it off.');
    } else if (g.chip === 'engine' && state.sim?.engineReach0) {
      const t = state.sim.engineReach0[sel.id];
      lines.push(t === Infinity ? 'No engine route reaches it past the parked cars and barriers in this run.' : `An engine reaches it in ${fmt(t / 60, 1)} min from the nearest station in this run.`);
      src.push(['Engine time', 'model rule', 'Drive time from the nearest of Berkeley\'s 7 stations at ignition, past this run\'s parked cars and fixed barriers, at the model\'s engine speeds.']);
    }
    if (e.widthM && state.sim) {
      lines.push(`${fmt(e.widthM / 0.3048)} ft of pavement, ${fmt(state.sim.clear[sel.id] / 0.3048)} ft clear with this run's parked cars.`);
      const ws = e.widthSrc || '', wcat = e.newLink || e.opened ? 'assumption' : ws.startsWith('city:') ? 'sourced' : ws.startsWith('assumption:') ? 'assumption' : 'derived';
      src.push(['Pavement width', wcat, e.newLink || e.opened ? 'A hypothetical road\'s assumed width (tools/egress-link.mjs).' : ws.replace(/^(city|assumption|derived):\s*/, '') || 'No width source recorded.']);
      src.push(['Clear width', 'synthetic', 'Pavement minus this run\'s parked cars: which blocks are parked on one or both sides is drawn for the seed from the parking rules (js/parking.js), not measured on this block.']);
    }
    const res = SA?.residentsPerEdge?.[sel.id];
    if (res) {
      lines.push(`About ${fmt(res, res < 10 ? 1 : 0)} modeled residents on this block.`);
      src.push(['Residents', 'synthetic', 'Synthetic households placed from zone population counts, averaged over the runs; not addresses.']);
    }
    const why = src.length ? `<details class="g-src"><summary>Where these come from</summary>${src.map(([k, c, t]) => `<p><b>${k}</b> ${badge(c)} ${esc(t)}</p>`).join('')}</details>` : '';
    box.innerHTML = `<button class="g-x" aria-label="Close">✕</button><b>${esc(name)}</b>${lines.map(l => `<p>${l}</p>`).join('')}${why}`;
    box.hidden = false;
    box.querySelector('.g-x').onclick = () => { box.hidden = true; map.selected = null; g.sel = null; map.draw(); };
  }

  // ---------- results ----------
  function baseFigure(card) {
    if (card.id === 'oneWay') { const o = model().oneWay(data.access, state.fire); return { value: o.value, areas: o.areas, na: o.na, label: o.na ? null : { label: 'consistent' } }; }
    const f = model().baseFigure(state.fire, card.key, g.pace);
    if (card.id === 'engine') { // the night parking rule is the second assumption with an alternative in the repository (SA5)
      const P = (NETWORK_FIRES[state.fire] ? spread()?.parkingByFire?.[state.fire] : spread()?.parking) || [], alt = median(P.map(p => p.pre20261105.engineBeyond5)), cur = median(P.map(p => p.count2026.engineBeyond5));
      f.alt = alt; if (assumption(cur, alt) === 'sensitive') f.label = { ...f.label, label: 'sensitive', parking: true };
    }
    return f;
  }
  const head = (title, sub) => `<div class="gv-head"><h2>${title}</h2><p>${sub}</p></div>`;
  function resultsHTML() {
    if (!mit() || !spread()) return `${head('Results', esc(fireTitle()))}<p>The run-set tables did not load.</p>${footHTML('results')}`;
    const cards = CARDS.map(c => { const f = baseFigure(c); const num = f.na ? 'Not computed' : n(f.value); return `<section class="rc" aria-labelledby="rc-h-${c.id}"><div class="rc-n" aria-hidden="true">${num}</div><div class="rc-l" role="heading" aria-level="3" id="rc-h-${c.id}"><span class="sr-only">${num}${f.na ? ': ' : ' '}</span>${c.line}</div>${paceLine(c, f)}${splitHTML(c)}<div class="rc-f">${chipHTML(f.label, c.id === 'oneWay' ? 'network' : 'result')}<button class="linkish" data-explain="${c.id}" aria-label="Explain this: ${esc(stripTags(c.line))}">Explain this</button></div></section>`; }).join('');
    return `${head(`Results: ${esc(fireTitle())}`, `${sqBtn()}, median of ${runsN()} runs at ${paceName()}`)}${cards}${backupsHTML()}${footHTML('results')}`;
  }

  // ---------- where traffic backed up (Eric, 2026-11-23; SOURCE_NOTES GV25) ----------
  // Hill streets only, from spread-access.json backups (js/guided-data.js backupRows): the top 5 rows, "Show more" for up
  // to BACKUP_LIST in all. When most of the top 5 vary from run to run, one line replaces the list (Eric, 2026-11-23, option a).
  const BACKUP_LIST = 15;
  const backups = () => backupRows(spread(), data.net, state.fire, g.pace);
  const hours = pm => { const h = pm / 60; return h >= 10 ? fmt(round10(h)) : fmt(h, 1); };
  // One compact card (MASTER, 2026-11-23: Results may grow by about 0.6 screens on an iPhone SE): the top 3 rows, then
  // "Show 2 more" (top 5), then "Show all" (up to BACKUP_LIST). g.bkOpen: 0, 1 or 2.
  function backupsHTML() {
    const R = backups(); if (!R) return '';
    const flats = '<p class="bk-note">Hill streets only: the flats and I-80 approaches are not ranked.</p>';
    const top5 = R.slice(0, 5), stable = top5.filter(r => r.label === 'consistent').length;
    const headH = `<div class="bk-head"><div class="rc-l" role="heading" aria-level="3"><b>Where traffic backed up in these runs</b></div><button class="linkish" data-explain-backups>Explain this</button></div>`;
    if (!R.length) return `<div class="bk">${headH}<p class="bk-one">No hill street held a backup of an hour of people's time or more in a median run at ${paceName()}.</p>${flats}</div>`;
    if (stable * 2 < top5.length) return `<div class="bk">${headH}<p class="bk-one">No street backed up in nearly every run of this fire at this pace; backups moved from run to run.</p>${flats}</div>`;
    const all = R.slice(0, BACKUP_LIST), lvl = g.bkOpen || 0, shown = all.slice(0, lvl === 0 ? 3 : lvl === 1 ? 5 : all.length);
    // One line per street; a street that is not in nearly every run carries "Varies from run to run" under it.
    const row = (r, i) => `<button class="bk-row" data-backup="${i}" aria-label="${esc(r.street)}, ${hours(r.median)} person-hours, ${r.label === 'consistent' ? 'in nearly every run' : 'varies from run to run'}"><b>${esc(r.street)}</b><span class="bk-v">${hours(r.median)} person-hours</span>${r.label === 'consistent' ? '' : '<span class="bk-l r-mixed">Varies from run to run</span>'}</button>`;
    const next = shown.length < all.length ? (lvl === 0 && all.length > 3 ? `Show ${Math.min(2, all.length - 3)} more` : `Show all ${all.length}`) : all.length > 3 ? 'Show fewer' : '';
    const more = next ? `<button class="linkish cg-more" data-bk-more aria-expanded="${shown.length > 3}">${next}</button>` : '';
    return `<div class="bk">${headH}<p class="bk-sub">Median of ${runsN()} runs at ${paceName()}; in nearly every run unless marked. Tap for the map.</p>${shown.map(row).join('')}${more}${flats}</div>`;
  }
  function focusBackup(i) {
    const r = backups()?.[i]; if (!r) return;
    const range = blockRange(r, data.net, data.nodeEdges);
    show('map'); g.focus = { street: range ? `${r.street} (${range})` : r.street, edges: r.edges };
    let b = null; for (const id of r.edges) for (const [x, y] of data.net.edges[id].geom) b = grow(b, x, y);
    g.follow = false; goTo(pad(b, 250), true); refresh();
  }
  function explainBackups() {
    const R = backups() || [];
    ctx.modal(`<div class="gx"><h2>Where traffic backed up in these runs</h2>
      <h3>What it counts</h3><p>For each hill street, the people in cars waiting on it, added up over the run, in person-hours: 10 people waiting 6 minutes count 1 person-hour. A car is waiting once it has been on its stretch of street longer than it takes to drive it with no traffic, checked every 30 model seconds. A resident's car carries its household and any carless neighbors riding with it, shared over the household's cars; a car from outside the area carries one person. Next-door stretches of one street are one row; the row's figure is the median over the ${runsN()} runs of ${esc(fireTitle())} at ${paceName()}, status quo, fall night, and rows below one person-hour are not listed.</p>
      <h3>Which streets</h3><p>Streets in Berkeley's Fire Zones 2–3 in zones ordered or warned during the run. Streets in the flats and the I-80 approaches are left out: there the model's queues form at different junctions from those the City's 2025 Evacuation Time Study found (Assumptions &amp; limits, Model performance).</p>
      <h3>In nearly every run, or varies</h3><p>"In nearly every run": the street is among that run's ${BACKUP_TOP} largest backups, with at least one person-hour, in all ${runsN()} runs. "Varies from run to run": in fewer. When most of the top 5 vary, the list is not shown.${R.length ? ` Here ${R.slice(0, 5).filter(r => r.label === 'consistent').length} of the top ${Math.min(5, R.length)} are in nearly every run.` : ''}</p>
      <h3>Where it comes from</h3><p>${badge('synthetic')} Synthetic households and their cars, placed from zone population counts and driven by the traffic model; ${badge('model rule')} the waiting rule and the sampling; ${badge('assumption')} one person in each car from outside the area. Stored table: data/model/spread-access.json backups (tools/spread-access.mjs), built ${esc(spread()?.meta?.built || '')}.</p>
      <h3>Limits</h3><p>The model's road delays are about a tenth of the 2025 Evacuation Time Study's (median road time 2–7 min against the study's 40–80 min on a 1923 weekday; SOURCE_NOTES CD1, CD19), and its queues form at different junctions from the study's (CD25), so the ranking of hill streets may move where the junctions downstream differ. A person-hour of waiting is time spent in a slow or stopped car, not harm. Where the fire closes a street, cars on it stop counting once they reroute or the run ends.</p></div>`, 'gx');
  }
  // The other paces' medians under a result (GV21); one way out is the street network, the same in every run.
  function paceLine(c, f) {
    if (f.na || !f.bySev) return '';
    const same = SEVS.every(s => f.bySev[s].median === f.value);
    return `<div class="rc-p">${same ? 'The same at every fire pace' : otherPaces(Object.fromEntries(SEVS.map(s => [s, f.bySev[s].median])))}</div>`;
  }
  // The four parts of a "people not yet out" result, as a stacked bar and a 2 × 2 key (GV13).
  function splitHTML(c) {
    const S = c.split && model().splitFigure(state.fire, c.split, g.pace); if (!S) return '';
    const tot = S.parts.reduce((s, p) => s + (p.median || 0), 0) || 1;
    return `<div class="sp" role="img" aria-label="${esc(S.parts.map(p => `${n(p.median)} ${p.label.toLowerCase()}`).join('; '))}"><div class="sp-bar">${S.parts.map(p => `<i class="sp-${p.id}" style="width:${(100 * (p.median || 0) / tot).toFixed(1)}%"></i>`).join('')}</div>
      <div class="sp-key">${S.parts.map(p => `<span><i class="sp-${p.id}"></i>${n(p.median)} ${p.short}</span>`).join('')}</div></div>`;
  }
  function footHTML(kind) {
    return `<div class="gv-foot">${kind === 'results' ? '<button class="primary" data-go="changes">Explore changes that could help</button>' : '<button class="primary" data-go="changes">Try different changes</button>'}<button data-go="map">Back to the map</button></div>`;
  }
  // The watched run's own figure for a card (js/mitigate.js MEASURES on the run's summary), only once that run has
  // finished: changing the fire pace on Results starts a new run at time zero (Codex, PR #93).
  function watched(card) {
    if (!card.live || !state.sim || !done()) return null;
    return MEASURES[card.live].f(state.sim.summary());
  }
  // Where a result's figure comes from: its provenance categories (shared by the result and comparison pop-ups).
  function provenance(c) {
    return c.id === 'oneWay' ? `${badge('derived')} Network analysis of County and OpenStreetMap streets (tools/access-constraints.mjs); residents ${badge('synthetic')}, placed from zone population counts.`
      : c.id === 'homes' ? `${badge('sourced')} City building footprints in Fire Zones 2–3, by their measured gap to the nearest one (data/model/structures.json); reached by the illustrative ${badge('model rule')} fire; loss probabilities and the effects of hardening and Zone 0 ${badge('assumption')} (data/assumptions.json structures; SOURCE_NOTES PH23, PH32).`
      : c.id === 'engine' ? `${badge('synthetic')} Residents placed from zone population counts; ${badge('derived')} engine routes from Berkeley's 7 fire stations over County and OpenStreetMap streets; ${badge('assumption')} the night's parked cars, from the night parking rule (one night's count of 11 blocks, 2026-11-05). Measured at ignition, so the fire does not enter it.`
      : c.id === 'cutOff' ? `${badge('synthetic')} Cars of synthetic households, placed from zone population counts and driven by the traffic model; the fire is an illustrative ${badge('model rule')} run on the scenario's ignition and wind.`
      : `${badge('synthetic')} Synthetic households placed from zone population counts; the fire is an illustrative ${badge('model rule')} run on the scenario's ignition and wind.`;
  }
  function explain(id) {
    const c = cardById(id), f = baseFigure(c), L = f.label, w = watched(c);
    if (f.na) return ctx.modal(`<div class="gx"><h2>Not computed for this fire: ${c.line}</h2><p>${esc(f.na)} The figure for today's streets is ${n(model().oneWay(data.access).value)} ${badge('derived')}.</p><h3>What it counts</h3><p>${c.counts}</p></div>`, 'gx');
    const sev = f.bySev ? `Range at ${paceName()}: ${n(f.min)}–${n(f.max)}. Median at each fire pace: ${PACES.map(p => `${p.label} ${n(f.bySev[p.sev].median)}`).join(', ')}.` : '';
    const label = MEANS[L.label] + (L.bySeverity ? ' Here the low- and high-severity medians differ by more than 25%.' : '') + (L.parking ? ` Under the night parking rule used before the 2026-11-05 count: ${n(f.alt)}.` : '');
    const runs = c.id === 'oneWay' ? `The street network is the same in every run, so this does not change from run to run. ${fmt(f.areas)} hill areas. The Ways out map chip shows which of these ways out the fire reached in the runs of this fire.`
      : c.id === 'engine' ? `${runSet()}. Engine reach is measured at ignition, so it depends on the night's parked cars (one draw per seed)${NETWORK_FIRES[state.fire] ? ' and on the streets the earthquake closes at the fault' : ''} and not on the fire. ${sev}`
      : `${runSet()}. ${sev}`;
    const cat = provenance(c);
    ctx.modal(`<div class="gx"><h2>${n(f.value)} ${c.line}</h2>
      <h3>What it counts</h3><p>${c.counts}</p>
      <h3>The runs behind it</h3><p>${runs}</p>
      <h3>${chipHTML(L, c.id === 'oneWay' ? 'network' : 'result')}</h3><p>${label}</p>
      ${splitExplain(c)}
      <h3>Where it comes from</h3><p>${cat}</p>
      ${c.id === 'ember' ? `<h3>Where the embers go</h3><p>${EMBER_NOTE}</p>` : ''}
      <h3>Limits</h3><p>${c.id === 'engine' && NETWORK_FIRES[state.fire] ? c.limits.replace(' The same on every fire.', ' Here it differs from the other fires: the earthquake closes the streets that cross the fault to engines.') : c.limits}</p>
      ${w != null ? `<h3>The run you watched</h3><p>${n(w)} (${paceName()}, seed 1)${g.applied.length ? ', with your changes' : ''}.</p>` : ''}</div>`, 'gx');
  }
  // Explain this, the four parts: what each counts, its median by severity, and the on-road limit (GV13).
  function splitExplain(c, title = 'Who they are') {
    const S = c.split && model().splitFigure(state.fire, c.split, g.pace); if (!S) return '';
    return `<h3>${title}</h3><p>Each part is its own median over the ${S.n} runs at ${paceName()}, so the parts need not add up exactly to the total. "Never ordered" means the household's zone was never ordered to leave during the run${S.warned != null ? `; a median of ${n(S.warned)} of them live in zones under a warning only` : ''}. ${badge('synthetic')}</p>
      <ul class="sp-list">${S.parts.map(p => `<li><b>${n(p.median)} ${p.label.toLowerCase()}</b> (${otherPaces(p.bySev)}). ${esc(p.def)}</li>`).join('')}</ul>
      <p>The on-road count is likely low. The model's road times run short of the 2025 Evacuation Time Study (Assumptions &amp; limits, Model performance), and the count moves with each traffic fix: step 2 raised it on every wildfire scenario (1923 fire, central, seed 1: 756 → 1,115; SOURCE_NOTES CD19); step 3 moved it both ways (1923 1,115 → 754, north hills 369 → 404; CD26); a destination rule tested and not adopted raised it again (1923 fire, weekday, medium severity, medians 578 → 776; CD28).</p>`;
  }

  // ---------- changes ----------
  // A shorter name in the Changes rows where the table's title runs to three lines on a phone (Eric, 2026-11-23); the
  // full title stays in the cost pop-up, the comparison and the map tag.
  const SHORT = { leaveEarlyEFW: 'Leave on Extreme Fire Weather (10 zones)',
    // The Red Flag change is this project's hypothetical (half of hill households leave); the City's policy is the
    // Extreme Fire Weather change, listed before it (reviewer subagent, MASTER, 2026-11-23; SOURCE_NOTES GV36).
    leaveEarly: 'Leave early on a Red Flag day (hypothetical: half leave)' };
  // A line on the row itself for changes whose gain is easy to misread (GV36).
  const BUYOUT = 'Not a proposal. Its gain comes partly from bought-out households no longer being counted.';
  const NOTES = { 'retreat-footBlock': BUYOUT, 'retreat-top100': BUYOUT, 'retreat-panoramicUpper': BUYOUT,
    parkingOneSide: 'Engine access only; does not change who gets out. Rests on one night\'s count of 11 blocks (2026-11-05).' };
  // The City's policy before the hypothetical Red Flag change when both are listed.
  const policyFirst = items => {
    const i = items.findIndex(it => it.lever.id === 'leaveEarly'), j = items.findIndex(it => it.lever.id === 'leaveEarlyEFW');
    if (i < 0 || j < i) return items;
    const out = [...items]; const [efw] = out.splice(j, 1); out.splice(i, 0, efw); return out;
  };
  // Sorted by cost, changes with no cost estimate form their own band at the end of a list, under a label (GV36).
  const banded = (items, render) => items.map((it, i) => (g.sort === 'cost' && costKey(it.lever.cost) === Infinity && (i === 0 || costKey(items[i - 1].lever.cost) !== Infinity) ? '<div class="cr-band">No cost estimate</div>' : '') + render(it)).join('');
  const narrowView = () => typeof matchMedia === 'function' && matchMedia('(max-width: 430px)').matches;
  const shortTitle = l => SHORT[l.id] || l.title;
  const GAIN = { ember: 'fewer when embers arrived', frontPeople: 'fewer when the front arrived', engine: 'more within reach', cutOff: 'fewer cars', homes: 'fewer buildings lost' };
  function changesHTML() {
    if (!mit()) return `${head('Changes that could help', '')}<p>The change table did not load.</p>${footHTML('changes')}`;
    const groups = model().groups(state.fire, g.pace).filter(x => x.items.length);
    const picked = g.picked.map(leverById).filter(Boolean);
    const seen = new Set(); // changes already given a full row, in render order
    const row = (it, gid) => {
      const l = it.lever, on = g.picked.includes(l.id);
      const clash = !on && picked.map(p => ({ p, why: ctx.conflict(p, l) })).find(x => x.why);
      const full = !on && g.picked.length >= 3;
      const fr = model().freed([l.id]);
      const gain = it.gain != null ? `<span class="cr-g">${it.gain >= 0.5 ? fmt(round10(it.gain)) : 'Under 1'} ${GAIN[it.card.key]} · ${SCOPE[it.anyFire ? 'any' : 'this']}</span> ${chipHTML(it.d, 'change')}`
        : it.withheld ? `<span class="cr-g">Not offered on this fire: ${esc(sq(it.withheld.split(':')[0]))}.</span>`
        : `<span class="cr-g">${it.worse?.length ? `Worse: ${it.worse.map(w => `${esc(w.card.line)} in ${w.worse} of ${w.n} runs`).join('; ')}.` : 'No result improved in most runs.'}</span>`;
      // A change withheld on this fire under P19 cannot be picked here (GV6). The cost sits beside the pick button,
      // and opens its provenance (category, source, note).
      const off = !on && (clash || full || it.withheld);
      // A change already listed in an earlier group: one compact line (its cost and notes are on the full row above).
      if (seen.has(l.id)) return `<div class="cr cr-dup${on ? ' on' : ''}${off ? ' off' : ''}"><button class="cr-pick" data-pick="${esc(l.id)}" aria-pressed="${on}"${off ? ' disabled' : ''}><span class="cr-s"><b>${esc(shortTitle(l))}</b> · ${gain}</span></button></div>`;
      seen.add(l.id);
      return `<div class="cr${on ? ' on' : ''}${off ? ' off' : ''}"><button class="cr-pick" data-pick="${esc(l.id)}" aria-pressed="${on}"${off ? ' disabled' : ''}>
        <span class="cr-t"><b>${esc(shortTitle(l))}</b></span>
        <span class="cr-s">${gain}</span>
        ${fr && gid === 'engine' ? `<span class="cr-s muted">Also a second way out for about ${fmt(round10(fr.value))} hill residents</span>` : ''}
        ${NOTES[l.id] ? `<span class="cr-s muted">${esc(NOTES[l.id])}</span>` : ''}
        ${clash ? `<span class="cr-w">Changes the same block as “${esc(clash.p.title)}”: pick one.</span>` : ''}</button>
        <button class="cr-c linkish" data-cost="${esc(l.id)}" aria-label="Cost of ${esc(l.title)}: ${esc(costLine(l.cost))}. Where it comes from">${esc(costLine(l.cost))} ⓘ</button></div>`;
    };
    // Each group shows its top 3 by the current sort, plus any picked change below them, and a control for the rest
    // (Eric, 2026-11-10: keep the Changes view near two screens on an iPhone SE).
    // "Fewer buildings lost" (six variants of two changes, 2026-11-13) shows only its best, to hold that height.
    // On a phone (430 px wide or less) each group shows its top 2 (Eric, 2026-11-23, "fix the cosmetic items": the
    // Extreme Fire Weather change, #92, had pushed the view past three screens on an iPhone SE).
    const TOPS = { homes: 1 };
    const narrow = narrowView();
    const shortList = gr => {
      const TOP = TOPS[gr.id] ?? (narrow ? 2 : 3);
      const all = policyFirst(sortItems(gr.items, g.sort)), open = g.more[gr.id];
      const shown = open ? all : all.filter((it, i) => i < TOP || g.picked.includes(it.lever.id));
      const rest = all.length - shown.length;
      const ctl = all.length > TOP && (rest > 0 || open) ? `<button class="linkish cg-more" data-more="${gr.id}" aria-expanded="${!!open}">${open ? 'Show fewer' : `Show ${rest} more`}</button>` : '';
      return banded(shown, it => row(it, gr.id)) + ctl;
    };
    // Zone 0 ranks above hardening because the model leaves out embers igniting the first house (GV36).
    const GROUP_NOTE = { homes: 'The order is not a ranking of effectiveness: the model leaves out embers igniting the first house, which hardening is meant to prevent.' };
    // The changes that help no result (worse in every run, no consistent change, not offered here) come last, in one
    // fold, unless one of them is picked.
    // A change designed but not simulated (docs/design/assisted-evacuation.md, option B; GV38).
    const UNTESTED = '<h4 class="cg-sub">Not yet tested</h4><p class="cg-note">Pickups for people who cannot leave on their own: in the simulator nobody needs help to leave, so no change yet tests pickups, paratransit or care-facility evacuation.</p>';
    const restGroups = groups.filter(gr => gr.rest), restN = restGroups.reduce((s, gr) => s + gr.items.length, 0);
    const body = groups.filter(gr => !gr.rest).map(gr => `<h3 class="cg">${esc(gr.title)}</h3>${GROUP_NOTE[gr.id] ? `<p class="cg-note">${GROUP_NOTE[gr.id]}</p>` : ''}${shortList(gr)}`).join('')
      + (restN ? `<details class="cg-none"${restGroups.some(gr => gr.items.some(it => g.picked.includes(it.lever.id))) || g.noneOpen ? ' open' : ''}><summary><h3 class="cg">Other changes</h3><span>${restN} tested, 1 not yet</span></summary>${restGroups.map(gr => `<h4 class="cg-sub">${esc(gr.title)}</h4>${banded(policyFirst(sortItems(gr.items, g.sort)), it => row(it, gr.id))}`).join('')}${UNTESTED}</details>` : '');
    // Picks that act on the same street: their gains can overlap, so the combined gain may be less than the sum.
    const warn = [];
    for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
      const a = streetsOf(picked[i], data.net, data.nodeEdges), b = streetsOf(picked[j], data.net, data.nodeEdges), both = [...a].filter(x => b.has(x));
      if (both.length) warn.push(`“${esc(picked[i].title)}” and “${esc(picked[j].title)}” both change ${esc(both.slice(0, 2).map(s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(' and '))}: together they may gain less than the two added up.`);
    }
    const sub = narrowView() ? `${paceName()} · pick up to 3` : `${esc(fireTitle())} · ${paceName()} · pick up to 3, then Run`; // the fire is in the picker above
    return `<div class="gv-back"><button class="linkish" data-go="results">← Results</button><button class="linkish" data-go="map">Map</button></div>${head('Changes that could help', sub)}
      <div class="sortbar"><span role="group" aria-label="Sort">Sort <button data-sort="benefit" aria-pressed="${g.sort === 'benefit'}">Benefit</button><button data-sort="cost" aria-pressed="${g.sort === 'cost'}">Cost</button></span><button class="linkish gv-about" data-about-gains>About these gains</button></div>
      ${body}
      <div class="pickbar${g.picked.length ? '' : ' empty'}">${warn.map(w => `<p class="cr-w">${w}</p>`).join('')}
        <div class="pickrow"><span>${g.picked.length ? `${g.picked.length} change${g.picked.length > 1 ? 's' : ''} selected${g.picked.length >= 3 ? ' (up to 3)' : ''}` : 'Pick up to 3 changes'}</span>${g.picked.length ? '<button data-clear>Clear</button>' : ''}<button class="primary" data-runpicks${g.picked.length ? '' : ' disabled'}>Run</button></div></div>`;
  }

  // How the Changes view's gains, groups and labels are made (SOURCE_NOTES GV6).
  function aboutGains() {
    const M = mit(), runs = runsN();
    ctx.modal(`<div class="gx"><h2>About these gains</h2>
      <h3>What a gain is</h3><p>Each change was run against the status quo on ${runs} paired runs of ${esc(fireTitle())} at ${paceName()} (random seeds ${M.meta.seeds[0]}–${M.meta.seeds.at(-1)}, a fall night): the same fire, households and parked cars with and without the change. The gain is the median of the ${runs} differences. Changing the fire pace changes the gains and can move a change between groups.</p>
      <h3>Where it comes from</h3><p>${badge('synthetic')} Synthetic households placed from zone population counts, on an illustrative ${badge('model rule')} fire. Stored table: data/model/mitigations.json, built ${esc(M.meta.built)}.</p>
      <h3>Groups</h3><p>${badge('model rule')} A change joins a group when it does better on that result in all 5 runs at this pace, or in 4 with the fifth exactly the same, and is worse in no run on any of the group's results. A change can sit in more than one group. The rest are folded under "Other changes tested": worse on some result in every run ("Worse in every run"), withheld on this fire ("Not offered on this fire"; these cannot be picked here), or neither ("No consistent change").</p>
      <h3>This fire or any wildfire</h3><p>Engine reach is measured at ignition, so its gain is the same on every fire except the earthquake, which closes streets at the fault. People and cars depend on the fire.</p>
      <h3>Labels</h3><p><b>Better in all 5 runs</b>: better in each of the 5 paired runs at this pace (the rule is at least 90% of the runs, which of 5 is all 5). <b>Varies from run to run</b>: ${MEANS.mixed} Any difference counts, as in the stored table.</p>
      <h3>Costs</h3><p>Tap a cost for its source and category.</p></div>`, 'gx');
  }

  // A change's cost and where it comes from (lever.cost; js/mitigate.js costBadge): a screening range built from sourced
  // unit costs and assumptions (derived), this project's "little capital cost" (assumption), or not priced.
  function explainCost(l) {
    const c = l?.cost; if (!l) return;
    const cat = c?.capital ? 'derived' : /^Little capital/.test(c?.note || '') ? 'assumption' : null;
    ctx.modal(`<div class="gx"><h2>${esc(l.title)}: ${esc(costLine(c))}</h2>
      <h3>Where it comes from</h3><p>${cat ? badge(cat) : badge('unknown')} ${c?.capital ? 'A screening range, not a project budget or appraisal.' : cat ? 'This project\'s judgment that the change needs little capital spending; its other costs are not priced.' : 'No cost estimate in this table.'}</p>
      ${c?.note ? `<h3>Notes</h3><p>${esc(sq(c.note))}</p>` : ''}
      ${c?.source ? `<h3>Source</h3><p>${esc(c.source)}</p>` : ''}
      ${l.cannotMeasure ? `<h3>What the simulator can't tell you</h3><p>${esc(sq(l.cannotMeasure))}</p>` : ''}</div>`, 'gx');
  }

  // ---------- comparison ----------
  function compareRow(card) {
    const ids = g.applied, one = ids.length === 1;
    if (card.id === 'oneWay') {
      const base = model().oneWay(data.access).value, fr = model().freed(ids.filter(id => model().freed([id])));
      return { a: base, b: fr ? base - fr.value : base, gain: fr?.value || 0, d: { label: 'consistent', dir: fr ? 'better' : 'same' }, atLeast: fr?.atLeast, network: true };
    }
    if (one) return model().tableCompare(state.fire, ids[0], card.key, g.pace);
    const L = g.live; if (!L?.done) return null;
    const pairs = L.cases.map(c => ({ sev: c.sev, a: L.A[c.key][card.live], b: L.B[c.key][card.live] }));
    const a = median(pairs.map(p => p.a)), b = median(pairs.map(p => p.b)), gain = median(pairs.map(p => p.a - p.b));
    return { a, b, gain, d: model().tallyBySev(pairs), n: pairs.length };
  }
  function compareHTML() {
    const ls = g.applied.map(leverById).filter(Boolean), L = g.live, runs = runsN();
    const prog = ls.length > 1 && !L?.done ? `<div class="gprog"><div>Running ${runs} paired runs: ${L?.passes || 0} of ${runs} done</div><div class="track"><div style="width:${Math.round(100 * (L?.passes || 0) / runs)}%"></div></div></div>` : '';
    const cards = CARDS.filter(c => !(c.id === 'oneWay' && NETWORK_FIRES[state.fire])).map(c => { // single ways out: not computed on the earthquake's network
      const r = compareRow(c);
      const v = x => r ? n(x) : '…';
      // Difference: improvement green, worse amber, no change gray (Eric, 2026-11-10).
      const same = r && (r.d.dir === 'same' || Math.abs(r.gain) < 0.5);
      const diff = !r ? '…' : same ? 'No change' : `${r.gain > 0 ? '−' : '+'}${fmt(round10(Math.abs(r.gain)))}${r.atLeast ? ' or more' : ''}`;
      const cls = !r ? '' : same ? 'same' : r.gain > 0 ? 'good' : 'worse';
      return `<section class="rc cmp" aria-labelledby="rc-h-${c.id}"><div class="rc-l" role="heading" aria-level="3" id="rc-h-${c.id}">${cap(c.line)}</div>
        <div class="cmpgrid"><div><small>Status quo</small><b>${v(r?.a)}</b></div><div><small>With changes</small><b>${v(r?.b)}</b></div><div><small>Median change</small><b class="${cls}">${diff}</b></div></div>
        <div class="rc-f">${r ? chipHTML(r.d, r.network ? 'networkChange' : 'change') : ''}<button class="linkish" data-explain-cmp="${c.id}"${r ? '' : ' disabled'} aria-label="Explain this: ${esc(stripTags(c.line))}">Explain this</button></div></section>`;
    }).join('');
    const title = ls.length === 1 ? `With ${esc(ls[0].title.charAt(0).toLowerCase() + ls[0].title.slice(1))}` : `With ${ls.length} changes`;
    const sub = `${ls.length > 1 ? `${ls.map(l => esc(l.title)).join('; ')}. ` : ''}${esc(fireTitle())} · ${runs} paired runs at ${paceName()}: same fire, households and parked cars with and without. Against the ${sqBtn('status quo')}. The median change is the median of the ${runs} paired differences, so it need not equal the difference of the two medians`;
    return `${head(title, sub)}${prog}${cards}${footHTML('compare')}`;
  }
  function explainCompare(id) {
    const c = cardById(id), r = compareRow(c); if (!r) return;
    const w = watched(c), src = g.applied.length === 1 ? `From the stored table (data/model/mitigations.json), built ${esc(mit().meta.built)}.` : 'Run live in your browser.';
    const passes = r.network ? (r.gain ? `New roads give about ${fmt(round10(r.gain))}${r.atLeast ? ' or more' : ''} hill residents a second way out ${badge('derived')} (data/model/egress-candidates.json, network analysis of 2026-11-01).${r.atLeast ? ' Two of your roads give a second way out to some of the same areas, so the larger single figure is shown as a floor.' : ''} Buyouts remove households but are not subtracted here.` : 'None of your changes adds a road, so the street network\'s single ways out stay as they are.')
      : `${runSet()}, each run with and without the changes. Better in ${r.d.better}, worse in ${r.d.worse}, the same in ${r.d.same} of ${r.d.n}. ${src}`;
    ctx.modal(`<div class="gx"><h2>${cap(c.line)}: ${n(r.a)} → ${n(r.b)}</h2>
      <h3>What it counts</h3><p>${c.counts}</p>
      <h3>The runs behind it</h3><p>${passes}</p>
      ${splitExplain(c, 'Who they are, status quo')}
      <h3>Where it comes from</h3><p>${provenance(c)}${r.network && r.gain ? ` Second ways out from new roads ${badge('derived')}: data/model/egress-candidates.json.` : ''}</p>
      <h3>${chipHTML(r.d, r.network ? 'networkChange' : 'change')}</h3><p>${r.network ? '' : `${meansChange(r.d)} Any difference counts as better or worse; the label says whether it holds across the runs. The median change (${r.gain > 0 ? '−' : '+'}${n(Math.abs(r.gain))}) is the median of the paired differences, not the difference of the two medians.`}</p>
      <h3>Limits</h3><p>${c.limits}</p>
      ${w != null ? `<h3>The run you watched</h3><p>${n(w)} with your changes (${paceName()}, seed 1).</p>` : ''}</div>`, 'gx');
  }

  // ---------- live comparison (two or three changes) ----------
  function cancelLive() { if (g.live && !g.live.done) ctx.cancelLive(g.live); g.live = null; }
  function startLive() {
    cancelLive();
    if (g.applied.length < 2) return;
    g.live = ctx.runLive(g.applied.map(leverById), g.pace, () => { if (g.screen === 'results') { const y = $('g-panel').scrollTop; $('g-panel').innerHTML = compareHTML(); $('g-panel').scrollTop = y; wirePanel(); } });
  }

  // ---------- panel events ----------
  function wirePanel() {
    const P = $('g-panel');
    P.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
    P.querySelectorAll('[data-sq]').forEach(b => b.onclick = explainSQ);
    P.querySelectorAll('[data-explain]').forEach(b => b.onclick = () => explain(b.dataset.explain));
    P.querySelectorAll('[data-backup]').forEach(b => b.onclick = () => focusBackup(+b.dataset.backup));
    P.querySelector('[data-bk-more]')?.addEventListener('click', () => { const R = backups() || [], lvl = g.bkOpen || 0, shownN = lvl === 0 ? 3 : lvl === 1 ? 5 : R.length; g.bkOpen = shownN >= Math.min(R.length, BACKUP_LIST) ? 0 : lvl + 1; rerender(); });
    P.querySelector('[data-explain-backups]')?.addEventListener('click', explainBackups);
    P.querySelectorAll('[data-explain-cmp]').forEach(b => b.onclick = () => explainCompare(b.dataset.explainCmp));
    P.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { g.sort = b.dataset.sort; rerender(); });
    P.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { g.more[b.dataset.more] = !g.more[b.dataset.more]; rerender(); });
    P.querySelector('[data-about-gains]')?.addEventListener('click', aboutGains);
    P.querySelectorAll('[data-cost]').forEach(b => b.onclick = () => explainCost(leverById(b.dataset.cost)));
    // A change's name leaves room for its cost label, measured as drawn, so a long name wraps beside it, never under it.
    const fitCosts = () => P.querySelectorAll('.cr').forEach(r => { const c = r.querySelector('.cr-c'), b = r.querySelector('.cr-t b'); if (c && b && c.offsetWidth) b.style.paddingRight = `${c.offsetWidth + 10}px`; });
    fitCosts(); P.querySelector('details.cg-none')?.addEventListener('toggle', fitCosts);
    P.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const id = b.dataset.pick; g.picked = g.picked.includes(id) ? g.picked.filter(x => x !== id) : [...g.picked, id].slice(0, 3); rerender(); });
    P.querySelector('details.cg-none')?.addEventListener('toggle', e => { g.noneOpen = e.target.open; });
    P.querySelector('[data-clear]')?.addEventListener('click', () => { g.picked = []; rerender(); });
    P.querySelector('[data-runpicks]')?.addEventListener('click', () => {
      g.applied = [...g.picked]; g.sel = null; map.selected = null;
      setup(); frameStart(); startLive(); show('map'); ctx.play(true); refresh();
    });
  }
  function rerender() { const y = $('g-panel').scrollTop; show(g.screen); $('g-panel').scrollTop = y; }

  return {
    enter() { G = null; map.barriers = false; map.queueSmooth = true; setup(); if (done()) frameSummary(); else frameStart(); show(g.screen === 'map' ? 'map' : g.screen); },
    leave() { map.barriers = true; map.queueSmooth = false; map.marks = []; },
    refresh, legendHTML, sheet, pickFire,
    title: () => `${fireTitle()}, ${paceName()}`,
    onRunEnd() { g.chip = 'fire'; refresh(); if (g.follow) frameSummary(true); },
    tick,
    onRunStart() { $('g-sheet').hidden = true; refresh(); },
  };
}
