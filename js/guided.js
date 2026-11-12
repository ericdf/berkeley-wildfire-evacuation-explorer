// Guided view (Eric, 2026-11-10, MASTER session; SOURCE_NOTES GV1–GV8): phone first, the same on a desktop.
//   Map      the fire picker, the map and one Run button; after the run, map chips (Fire, Ways out, Engine reach),
//            a street card on tap, and Explore results / Run again.
//   Results  five cards, most important first: the 15-run figure for this fire, its label and "Explain this".
//   Changes  changes grouped by the result they improve (js/guided-data.js groups), up to three picked, then Run.
//   Compare  after a run with changes: today's plan | with changes for each card. One change reads the stored
//            table; two or three run 15 paired passes live (workers), today's plan cached per pass.
// Figures come from data/model/mitigations.json and spread-access.json through js/guided-data.js.
import { CARDS, GROUPS, cardById, makeGuided, sortItems, costLine, streetsOf, round10, SEVS, median } from './guided-data.js';
import { presence, direction, assumption, levelText, SEV_WORD } from './robust.js';

// Plain words for the three robustness labels (Eric, 2026-11-12, MASTER session; SOURCE_NOTES GV12). The rules are
// js/robust.js's (SA4, SA6): consistent = at least 90% of the runs; sensitive = shares differ by 0.6 or more between
// fire severities, or an alternative assumption moves the value by 25% or more; mixed = the rest. The precise
// definition stays in each Explain this pop-up (MEANS).
// ctx: 'result' (a count across runs), 'reach' (did embers or the front reach a street), 'way' (did the front reach a
// way out), 'change' (a change against today's plan, pass by pass). L: the label object (presence or direction).
export function plainLabel(L, ctx) {
  const label = L?.label; if (!label) return null;
  if (ctx === 'networkChange') return L.dir === 'better' ? { text: 'Better in every run', cls: 'r-consistent' } : { text: 'No change in any run', cls: 'r-same' }; // the street network is the same in every run
  if (ctx === 'change') {
    if (label === 'consistent') return { text: L.dir === 'better' ? 'Better in nearly every run' : L.dir === 'worse' ? 'Worse in nearly every run' : 'No difference in nearly every run', cls: L.dir === 'worse' ? 'r-worse' : L.dir === 'better' ? 'r-consistent' : 'r-same' };
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
const MEANS = {
  consistent: 'The same in every or nearly every tested run: at least 90% of them (14 of 15).',
  mixed: 'Present in some runs and not others, or changing direction, without a pattern by fire strength: at least 2 of 15 runs differ, and the share of runs differs by less than 0.6 between low, medium and high severity.',
  sensitive: 'It depends mainly on an uncertain setting: the share of runs differs by 0.6 or more between low, medium and high fire severity, or the low- and high-severity values (or the two night parking rules) differ by 25% or more.',
};
const SCOPE = { this: 'this fire', any: 'any fire' };

export function guidedUI(ctx) {
  const { data, map, state, $, esc, fmt, FIRES, PRESETS, mit, spread, MEASURES, badge } = ctx;
  const g = state.g = { more: {}, screen: 'map', chip: 'fire', applied: [], picked: [], sort: 'benefit', live: null, sel: null };
  let G = null;
  const model = () => G ??= makeGuided(mit(), spread(), PRESETS);
  const fireTitle = () => FIRES.find(f => f.id === state.fire)?.title || state.fire;
  const leverById = id => model().leverById(id);
  const simple = () => document.body.classList.contains('simple');
  const done = () => state.sim && state.sim.t >= state.sim.end;
  const started = () => state.sim && (state.sim.t > 0 || state.playing);
  const n = x => x == null ? '—' : fmt(round10(x));
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const chipHTML = (L, c) => { const p = plainLabel(L, c); return p ? `<span class="robust ${p.cls}">${p.text}</span>` : ''; };
  const runSet = () => { const M = mit(); return `${M?.meta.severities.length * M?.meta.seeds.length || 15} runs of ${esc(fireTitle())}: today's plan on a fall night, low, medium and high fire severity × random seeds ${M ? `${M.meta.seeds[0]}–${M.meta.seeds.at(-1)}` : '1–5'}`; };

  // ---------- header menu and fire line ----------
  $('g-info').onclick = e => { e.stopPropagation(); $('g-menu').hidden = !$('g-menu').hidden; };
  document.addEventListener('click', e => { if (!$('g-menu').hidden && !$('g-menu').contains(e.target)) $('g-menu').hidden = true; });
  $('g-menu').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    $('g-menu').hidden = true;
    ({ intro: ctx.openIntro, assumptions: ctx.openAssumptions, sources: ctx.openSources, expert: () => ctx.setMode('expert') })[b.dataset.menu]?.();
  });
  const fireSel = $('g-fire');
  for (const f of FIRES) fireSel.add(new Option(f.title, f.id));
  fireSel.onchange = () => pickFire(fireSel.value);

  function pickFire(id) {
    state.fire = id; ctx.store.set('bhe-fire', id);
    cancelLive(); g.applied = []; g.sel = null;
    g.picked = g.picked.filter(id => !model().withheld(state.fire, id)); // withheld on the new fire (P19)
    setup(); show('map');
  }
  // Today's plan, or today's plan with the applied changes, on the chosen fire (js/main.js guidedRun).
  function setup() { fireSel.value = state.fire; ctx.setupRun(g.applied.map(leverById).filter(Boolean)); }

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
    const runs = mit() ? mit().meta.severities.length * mit().meta.seeds.length : 15;
    const cap = !s ? '' : !d ? 'Red: cars backed up'
      : g.chip === 'fire' ? `Streets embers reached across ${runs} runs of this fire`
      : g.chip === 'ways' ? `Ways out the fire front reached across ${runs} runs of this fire`
      : 'Engine drive time from the nearest station, this run';
    $('g-caption').hidden = !cap; $('g-caption').textContent = cap;
    if (!d) $('g-sheet').hidden = true;
    mapLayers();
  }
  $('g-run').onclick = () => { ctx.play(!state.playing); refresh(); };
  $('g-again').onclick = () => { setup(); ctx.play(true); refresh(); };
  $('g-explore').onclick = () => show('results');
  $('g-chips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (!b) return; g.chip = b.dataset.chip; refresh(); if (g.sel) sheet(g.sel); });

  // Frame the hills (Fire Zones 2–3), where every Guided-view fire starts and most results fall.
  function frame() {
    const pts = (data.layers.fireZones || []).filter(z => z.zone >= 2).flatMap(z => z.rings.flat());
    if (!pts.length) return map.fit();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    map.fit([Math.min(...xs) - 300, Math.min(...ys) - 300, Math.max(...xs) + 300, Math.max(...ys) + 300]);
  }

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
      map.layers.fire = true; const C = spread() && ctx.edgeClasses(state.fire, 'ember');
      if (C) { map.streetMode = 'robust'; map.edgeClass = C.cls; map.edgePalette = ctx.PALETTE.spread; }
    } else if (g.chip === 'ways') {
      map.layers.fire = true;
      if (spread()) { map.streetMode = 'robust'; map.edgeClass = ctx.areaEdgeClasses(data, state.fire); map.edgePalette = [...ctx.PALETTE.access]; map.edgePalette[0] = '#c8c8c8'; }
    } else { map.streetMode = 'engineTime'; map.layers.stations = true; }
    map.marks = g.applied.map(leverById).filter(Boolean).flatMap(marksOf);
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
    const fireKey = '<div><span class="dot" style="background:#ff7a00"></span>Fire front (last 15 min)</div><div><span class="dot" style="background:#5a1e19"></span>Burned</div><div><span class="dot" style="background:#ffb020;opacity:.6"></span>Embers</div>';
    if (!done()) return fireKey + sw('#7f1d1d', 'Cars backed up (over the last few minutes)');
    const runs = mit() ? mit().meta.severities.length * mit().meta.seeds.length : 15;
    // Plain words for the robustness classes (GV12); the precise rule is in the street card and Explain this pop-ups.
    if (g.chip === 'fire') { const P = ctx.PALETTE.spread; return `<b>Embers reached the street, in ${runs} runs</b>${sw(P[4], 'Reached in nearly every run')}${sw(P[3], 'Depends on fire strength')}${sw(P[2], 'Reached in some runs, by chance')}${sw(P[1], 'Not reached in any run, or nearly none')}${fireKey}`; }
    if (g.chip === 'ways') { const P = ctx.PALETTE.access; return `<b>Streets with one way out: did the fire front reach it? In ${runs} runs</b>${g.applied.length ? '<div class="small muted">Today\'s street network, without your changes.</div>' : ''}${sw(P[4], 'Reached in nearly every run')}${sw(P[3], 'Depends on fire strength')}${sw(P[2], 'Reached in some runs, by chance')}${sw(P[1], 'Not reached in any run, or nearly none')}${sw('#c8c8c8', 'More than one way out')}`; }
    const m = data.A.access.engineServiceMin;
    return `<b>Engine drive time from the nearest station</b>${sw('#2f8a4a', `Within ${m} min`)}${sw('#e0a21e', `${m}–8 min`)}${sw('#c0262d', 'Over 8 min')}${sw('#7f1d1d', 'No engine route')}<div class="small muted">At ignition, with this run's parked cars.</div>`;
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
      for (const [m, w] of [['ember', 'Embers'], ['front', 'The fire front']]) { const p = presence(ctx.edgeClasses(state.fire, m).levels(sel.id)); lines.push(`${w} reached it in ${p.k} of ${p.n} runs (${levelText(p.levels)}). ${chipHTML(p, 'reach')}`); }
      src.push(['Runs reached', 'model rule', 'The illustrative fire model run on this fire\'s ignition and wind; a street counts when embers or the front reach the 30 m cell at its middle (data/model/spread-access.json). The fire does not depend on the plan.']);
    } else if (g.chip === 'ways') {
      // Single ways out are today's street network (data/model/access-constraints.json); a new road you applied is not in it.
      if (g.applied.length) lines.push('<i>Today\'s street network and plan, without your changes.</i>');
      src.push(['One way out', 'derived', 'Network analysis of County and OpenStreetMap streets (tools/access-constraints.mjs). Fire front at the way out: 15 runs of this fire with today\'s plan.']);
      const area = data.access?.edgeAreas.get(sel.id)?.[0], st = area && SA?.areaStatic?.[area.id];
      if (area && st) {
        const p = presence(Object.fromEntries(SEVS.map(s => [s, SA.areas?.[state.fire]?.[area.id]?.front?.[s] || [0, SA.meta.seeds.length]])));
        lines.push(`Only one way out, through ${esc(area.chokeStreets.join(' / '))}. About ${fmt(round10(st.residents))} modeled residents live behind it.`);
        // A known placement artifact (SOURCE_NOTES AC4): the count likely belongs to homes reached another way.
        if (area.allocationWarning) lines.push(`<span class="cr-w">Population placement artifact: ${esc(area.allocationWarning)}. These residents most likely live on streets reached another way (docs/access-constraints.md, Data problems 2).</span>`);
        lines.push(`The fire front reached that way out in ${p.k} of ${p.n} runs. ${chipHTML(p, 'reach')}`);
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
    if (card.id === 'oneWay') { const o = model().oneWay(data.access); return { value: o.value, areas: o.areas, label: { label: 'consistent' } }; }
    const f = model().baseFigure(state.fire, card.key);
    if (card.id === 'engine') { // the night parking rule is the second assumption with an alternative in the repository (SA5)
      const P = spread()?.parking || [], alt = median(P.map(p => p.pre20261105.engineBeyond5)), cur = median(P.map(p => p.count2026.engineBeyond5));
      f.alt = alt; if (assumption(cur, alt) === 'sensitive') f.label = { ...f.label, label: 'sensitive', parking: true };
    }
    return f;
  }
  const head = (title, sub) => `<div class="gv-head"><h2>${title}</h2><p>${sub}</p></div>`;
  function resultsHTML() {
    if (!mit() || !spread()) return `${head('Results', esc(fireTitle()))}<p>The run-set tables did not load.</p>${footHTML('results')}`;
    const cards = CARDS.map(c => { const f = baseFigure(c); return `<div class="rc"><div class="rc-n">${n(f.value)}</div><div class="rc-l">${c.line}</div><div class="rc-f">${chipHTML(f.label, c.id === 'oneWay' ? 'network' : 'result')}<button class="linkish" data-explain="${c.id}">Explain this</button></div></div>`; }).join('');
    return `${head(`Results: ${esc(fireTitle())}`, `Today's plan, median of ${mit().meta.severities.length * mit().meta.seeds.length} runs`)}${cards}${footHTML('results')}`;
  }
  function footHTML(kind) {
    return `<div class="gv-foot">${kind === 'results' ? '<button class="primary" data-go="changes">Explore changes that could help</button>' : '<button class="primary" data-go="changes">Try different changes</button>'}<button data-go="map">Back to the map</button></div>`;
  }
  // The watched run's own figure for a card (js/mitigate.js MEASURES on the run's summary).
  function watched(card) {
    if (!card.live || !state.sim) return null;
    return MEASURES[card.live].f(state.sim.summary());
  }
  // Where a result's figure comes from: its provenance categories (shared by the result and comparison pop-ups).
  function provenance(c) {
    return c.id === 'oneWay' ? `${badge('derived')} Network analysis of County and OpenStreetMap streets (tools/access-constraints.mjs); residents ${badge('synthetic')}, placed from zone population counts.`
      : c.id === 'cutOff' ? `${badge('synthetic')} Cars of synthetic households, placed from zone population counts and driven by the traffic model; the fire is an illustrative ${badge('model rule')} run on the scenario's ignition and wind.`
      : `${badge('synthetic')} Synthetic households placed from zone population counts; the fire is an illustrative ${badge('model rule')} run on the scenario's ignition and wind.`;
  }
  function explain(id) {
    const c = cardById(id), f = baseFigure(c), L = f.label, w = watched(c);
    const sev = f.bySev ? `Median by fire severity: ${SEVS.map(s => `${SEV_WORD[s]} ${n(f.bySev[s].median)}`).join(', ')}; range ${n(f.min)}–${n(f.max)}.` : '';
    const label = MEANS[L.label] + (L.bySeverity ? ' Here the low- and high-severity medians differ by more than 25%.' : '') + (L.parking ? ` Under the night parking rule used before the 2026-11-05 count: ${n(f.alt)}.` : '');
    const runs = c.id === 'oneWay' ? `The street network is the same in every run, so this does not change from run to run. ${fmt(f.areas)} hill areas. The Ways out map chip shows which of these ways out the fire reached in the runs of this fire.`
      : c.id === 'engine' ? `${runSet()}. Engine reach is measured at ignition, so it depends on the night's parked cars (one draw per seed) and not on the fire. ${sev}`
      : `${runSet()}. ${sev}`;
    const cat = provenance(c);
    ctx.modal(`<div class="gx"><h2>${n(f.value)} ${c.line}</h2>
      <h3>What it counts</h3><p>${c.counts}</p>
      <h3>The runs behind it</h3><p>${runs}</p>
      <h3>${chipHTML(L, c.id === 'oneWay' ? 'network' : 'result')}</h3><p>${label}</p>
      <h3>Where it comes from</h3><p>${cat}</p>
      <h3>Limits</h3><p>${c.limits}</p>
      ${w != null ? `<h3>The run you watched</h3><p>${n(w)} (medium severity, seed 1)${g.applied.length ? ', with your changes' : ''}.</p>` : ''}</div>`, 'gx');
  }

  // ---------- changes ----------
  const GAIN = { ember: 'fewer when embers arrived', frontPeople: 'fewer when the front arrived', engine: 'more within reach', cutOff: 'fewer cars' };
  function changesHTML() {
    if (!mit()) return `${head('Changes that could help', '')}<p>The change table did not load.</p>${footHTML('changes')}`;
    const groups = model().groups(state.fire).filter(x => x.items.length);
    const picked = g.picked.map(leverById).filter(Boolean);
    const seen = new Set(); // changes already given a full row, in render order
    const row = (it, gid) => {
      const l = it.lever, on = g.picked.includes(l.id);
      const clash = !on && picked.map(p => ({ p, why: ctx.conflict(p, l) })).find(x => x.why);
      const full = !on && g.picked.length >= 3;
      const fr = model().freed([l.id]);
      const gain = it.gain != null ? `<span class="cr-g">${it.gain >= 0.5 ? fmt(round10(it.gain)) : 'Under 1'} ${GAIN[it.card.key]} · ${SCOPE[it.anyFire ? 'any' : 'this']}</span> ${chipHTML(it.d, 'change')}`
        : it.withheld ? `<span class="cr-g">Not offered on this fire: ${esc(it.withheld.split(':')[0])}.</span>`
        : `<span class="cr-g">${it.worse?.length ? `Worse: ${it.worse.map(w => `${esc(w.card.line)} in ${w.worse} of ${w.n} runs`).join('; ')}.` : 'No result improved in most runs.'}</span>`;
      // A change withheld on this fire under P19 cannot be picked here (GV6). The cost sits beside the pick button,
      // and opens its provenance (category, source, note).
      const off = !on && (clash || full || it.withheld);
      // A change already listed in an earlier group: one compact line (its cost and notes are on the full row above).
      if (seen.has(l.id)) return `<div class="cr cr-dup${on ? ' on' : ''}${off ? ' off' : ''}"><button class="cr-pick" data-pick="${esc(l.id)}" aria-pressed="${on}"${off ? ' disabled' : ''}><span class="cr-s"><b>${esc(l.title)}</b> · ${gain}</span></button></div>`;
      seen.add(l.id);
      return `<div class="cr${on ? ' on' : ''}${off ? ' off' : ''}"><button class="cr-pick" data-pick="${esc(l.id)}" aria-pressed="${on}"${off ? ' disabled' : ''}>
        <span class="cr-t"><b style="padding-right:${(0.5 * (costLine(l.cost).length + 3)).toFixed(1)}em">${esc(l.title)}</b></span>
        <span class="cr-s">${gain}</span>
        ${fr && gid === 'engine' ? `<span class="cr-s muted">Also a second way out for about ${fmt(round10(fr.value))} hill residents</span>` : ''}
        ${clash ? `<span class="cr-w">Changes the same block as “${esc(clash.p.title)}”: pick one.</span>` : ''}</button>
        <button class="cr-c linkish" data-cost="${esc(l.id)}" aria-label="Cost of ${esc(l.title)}: ${esc(costLine(l.cost))}. Where it comes from">${esc(costLine(l.cost))} ⓘ</button></div>`;
    };
    // Each group shows its top 3 by the current sort, plus any picked change below them, and a control for the rest
    // (Eric, 2026-11-10: keep the Changes view near two screens on an iPhone SE).
    const TOP = 3;
    const shortList = gr => {
      const all = sortItems(gr.items, g.sort), open = g.more[gr.id];
      const shown = open ? all : all.filter((it, i) => i < TOP || g.picked.includes(it.lever.id));
      const rest = all.length - shown.length;
      const ctl = all.length > TOP && (rest > 0 || open) ? `<button class="linkish cg-more" data-more="${gr.id}" aria-expanded="${!!open}">${open ? 'Show fewer' : `Show ${rest} more`}</button>` : '';
      return shown.map(it => row(it, gr.id)).join('') + ctl;
    };
    // "No consistent benefit" comes last and folded, unless one of its changes is picked.
    const body = groups.map(gr => gr.id === 'none'
      ? `<details class="cg-none"${gr.items.some(it => g.picked.includes(it.lever.id)) || g.noneOpen ? ' open' : ''}><summary><h3 class="cg">${esc(gr.title)}</h3><span>${gr.items.length} changes</span></summary>${sortItems(gr.items, g.sort).map(it => row(it, gr.id)).join('')}</details>`
      : `<h3 class="cg">${esc(gr.title)}</h3>${shortList(gr)}`).join('');
    // Picks that act on the same street: their gains can overlap, so the combined gain may be less than the sum.
    const warn = [];
    for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
      const a = streetsOf(picked[i], data.net, data.nodeEdges), b = streetsOf(picked[j], data.net, data.nodeEdges), both = [...a].filter(x => b.has(x));
      if (both.length) warn.push(`“${esc(picked[i].title)}” and “${esc(picked[j].title)}” both change ${esc(both.slice(0, 2).map(s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(' and '))}: together they may gain less than the two added up.`);
    }
    const sub = `${esc(fireTitle())} · pick up to 3, then Run`;
    return `<div class="gv-back"><button class="linkish" data-go="results">← Results</button><button class="linkish" data-go="map">Map</button></div>${head('Changes that could help', sub)}
      <div class="sortbar"><span role="group" aria-label="Sort">Sort <button data-sort="benefit" aria-pressed="${g.sort === 'benefit'}">Benefit</button><button data-sort="cost" aria-pressed="${g.sort === 'cost'}">Cost</button></span><button class="linkish gv-about" data-about-gains>About these gains</button></div>
      ${body}
      <div class="pickbar${g.picked.length ? '' : ' empty'}">${warn.map(w => `<p class="cr-w">${w}</p>`).join('')}
        <div class="pickrow"><span>${g.picked.length ? `${g.picked.length} change${g.picked.length > 1 ? 's' : ''} selected${g.picked.length >= 3 ? ' (up to 3)' : ''}` : 'Pick up to 3 changes'}</span>${g.picked.length ? '<button data-clear>Clear</button>' : ''}<button class="primary" data-runpicks${g.picked.length ? '' : ' disabled'}>Run</button></div></div>`;
  }

  // How the Changes view's gains, groups and labels are made (SOURCE_NOTES GV6).
  function aboutGains() {
    const M = mit(), runs = M.meta.severities.length * M.meta.seeds.length;
    ctx.modal(`<div class="gx"><h2>About these gains</h2>
      <h3>What a gain is</h3><p>Each change was run against today's plan on ${runs} paired runs of ${esc(fireTitle())} (low, medium and high fire severity × random seeds ${M.meta.seeds[0]}–${M.meta.seeds.at(-1)}, a fall night): the same fire, households and parked cars with and without the change. The gain is the median of the ${runs} differences.</p>
      <h3>Where it comes from</h3><p>${badge('synthetic')} Synthetic households placed from zone population counts, on an illustrative ${badge('model rule')} fire. Stored table: data/model/mitigations.json, built ${esc(M.meta.built)}.</p>
      <h3>Groups</h3><p>${badge('model rule')} A change joins a group when it does better on that result in every run, or in at least three of four runs and never worse. A change can sit in more than one group. A change whose ready-made question is withheld on this fire is listed under "No consistent benefit" and cannot be picked here.</p>
      <h3>This fire or any fire</h3><p>Engine reach is measured at ignition, so its gain is the same on every fire. People and cars depend on the fire.</p>
      <h3>Labels</h3><p><b>Better in nearly every run</b>: ${MEANS.consistent} <b>Depends on fire strength</b>: ${MEANS.sensitive} <b>Varies from run to run</b>: ${MEANS.mixed} Any difference counts, as in the stored table.</p>
      <h3>Costs</h3><p>Tap a cost for its source and category.</p></div>`, 'gx');
  }

  // A change's cost and where it comes from (lever.cost; js/mitigate.js costBadge): a screening range built from sourced
  // unit costs and assumptions (derived), this project's "little capital cost" (assumption), or not priced.
  function explainCost(l) {
    const c = l?.cost; if (!l) return;
    const cat = c?.capital ? 'derived' : /^Little capital/.test(c?.note || '') ? 'assumption' : null;
    ctx.modal(`<div class="gx"><h2>${esc(l.title)}: ${esc(costLine(c))}</h2>
      <h3>Where it comes from</h3><p>${cat ? badge(cat) : badge('unknown')} ${c?.capital ? 'A screening range, not a project budget or appraisal.' : cat ? 'This project\'s judgment that the change needs little capital spending; its other costs are not priced.' : 'No cost estimate in this table.'}</p>
      ${c?.note ? `<h3>Notes</h3><p>${esc(c.note)}</p>` : ''}
      ${c?.source ? `<h3>Source</h3><p>${esc(c.source)}</p>` : ''}
      ${l.cannotMeasure ? `<h3>What the simulator can't tell you</h3><p>${esc(l.cannotMeasure)}</p>` : ''}</div>`, 'gx');
  }

  // ---------- comparison ----------
  function compareRow(card) {
    const ids = g.applied, one = ids.length === 1;
    if (card.id === 'oneWay') {
      const base = model().oneWay(data.access).value, fr = model().freed(ids.filter(id => model().freed([id])));
      return { a: base, b: fr ? base - fr.value : base, gain: fr?.value || 0, d: { label: 'consistent', dir: fr ? 'better' : 'same' }, atLeast: fr?.atLeast, network: true };
    }
    if (one) return model().tableCompare(state.fire, ids[0], card.key);
    const L = g.live; if (!L?.done) return null;
    const pairs = L.cases.map(c => ({ sev: c.sev, a: L.A[c.key][card.live], b: L.B[c.key][card.live] }));
    const a = median(pairs.map(p => p.a)), b = median(pairs.map(p => p.b)), gain = median(pairs.map(p => p.a - p.b));
    return { a, b, gain, d: model().tallyBySev(pairs), n: pairs.length };
  }
  function compareHTML() {
    const ls = g.applied.map(leverById).filter(Boolean), L = g.live, runs = mit().meta.severities.length * mit().meta.seeds.length;
    const prog = ls.length > 1 && !L?.done ? `<div class="gprog"><div>Running ${runs} paired runs: ${L?.passes || 0} of ${runs} done</div><div class="track"><div style="width:${Math.round(100 * (L?.passes || 0) / runs)}%"></div></div></div>` : '';
    const cards = CARDS.map(c => {
      const r = compareRow(c);
      const v = x => r ? n(x) : '…';
      // Difference: improvement green, worse amber, no change gray (Eric, 2026-11-10).
      const same = r && (r.d.dir === 'same' || Math.abs(r.gain) < 0.5);
      const diff = !r ? '…' : same ? 'No change' : `${r.gain > 0 ? '−' : '+'}${fmt(round10(Math.abs(r.gain)))}${r.atLeast ? ' or more' : ''}`;
      const cls = !r ? '' : same ? 'same' : r.gain > 0 ? 'good' : 'worse';
      return `<div class="rc cmp"><div class="rc-l">${cap(c.line)}</div>
        <div class="cmpgrid"><div><small>Today's plan</small><b>${v(r?.a)}</b></div><div><small>With changes</small><b>${v(r?.b)}</b></div><div><small>Difference</small><b class="${cls}">${diff}</b></div></div>
        <div class="rc-f">${r ? chipHTML(r.d, r.network ? 'networkChange' : 'change') : ''}<button class="linkish" data-explain-cmp="${c.id}"${r ? '' : ' disabled'}>Explain this</button></div></div>`;
    }).join('');
    const title = ls.length === 1 ? `With ${esc(ls[0].title.charAt(0).toLowerCase() + ls[0].title.slice(1))}` : `With ${ls.length} changes`;
    const sub = `${ls.length > 1 ? `${ls.map(l => esc(l.title)).join('; ')}. ` : ''}${esc(fireTitle())} · ${runs} paired runs: same fire, households and parked cars with and without`;
    return `${head(title, sub)}${prog}${cards}${footHTML('compare')}`;
  }
  function explainCompare(id) {
    const c = cardById(id), r = compareRow(c); if (!r) return;
    const w = watched(c), src = g.applied.length === 1 ? 'From the stored table (data/model/mitigations.json), built 2026-11-06.' : 'Run live in your browser.';
    const passes = r.network ? (r.gain ? `New roads give about ${fmt(round10(r.gain))}${r.atLeast ? ' or more' : ''} hill residents a second way out ${badge('derived')} (data/model/egress-candidates.json, network analysis of 2026-11-01).${r.atLeast ? ' Two of your roads give a second way out to some of the same areas, so the larger single figure is shown as a floor.' : ''} Buyouts remove households but are not subtracted here.` : 'None of your changes adds a road, so the street network\'s single ways out stay as they are.')
      : `${runSet()}, each run with and without the changes. Better in ${r.d.better}, worse in ${r.d.worse}, the same in ${r.d.same} of ${r.d.n}. By severity: ${levelText(r.d.levels)}. ${src}`;
    ctx.modal(`<div class="gx"><h2>${cap(c.line)}: ${n(r.a)} → ${n(r.b)}</h2>
      <h3>What it counts</h3><p>${c.counts}</p>
      <h3>The runs behind it</h3><p>${passes}</p>
      <h3>Where it comes from</h3><p>${provenance(c)}${r.network && r.gain ? ` Second ways out from new roads ${badge('derived')}: data/model/egress-candidates.json.` : ''}</p>
      <h3>${chipHTML(r.d, r.network ? 'networkChange' : 'change')}</h3><p>${MEANS[r.d.label] || ''} ${r.network ? '' : 'Any difference counts as better or worse; the label says whether it holds across the runs.'}</p>
      <h3>Limits</h3><p>${c.limits}</p>
      ${w != null ? `<h3>The run you watched</h3><p>${n(w)} with your changes (medium severity, seed 1).</p>` : ''}</div>`, 'gx');
  }

  // ---------- live comparison (two or three changes) ----------
  function cancelLive() { if (g.live && !g.live.done) ctx.cancelLive(g.live); g.live = null; }
  function startLive() {
    cancelLive();
    if (g.applied.length < 2) return;
    g.live = ctx.runLive(g.applied.map(leverById), () => { if (g.screen === 'results') { const y = $('g-panel').scrollTop; $('g-panel').innerHTML = compareHTML(); $('g-panel').scrollTop = y; wirePanel(); } });
  }

  // ---------- panel events ----------
  function wirePanel() {
    const P = $('g-panel');
    P.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
    P.querySelectorAll('[data-explain]').forEach(b => b.onclick = () => explain(b.dataset.explain));
    P.querySelectorAll('[data-explain-cmp]').forEach(b => b.onclick = () => explainCompare(b.dataset.explainCmp));
    P.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { g.sort = b.dataset.sort; rerender(); });
    P.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { g.more[b.dataset.more] = !g.more[b.dataset.more]; rerender(); });
    P.querySelector('[data-about-gains]')?.addEventListener('click', aboutGains);
    P.querySelectorAll('[data-cost]').forEach(b => b.onclick = () => explainCost(leverById(b.dataset.cost)));
    P.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const id = b.dataset.pick; g.picked = g.picked.includes(id) ? g.picked.filter(x => x !== id) : [...g.picked, id].slice(0, 3); rerender(); });
    P.querySelector('details.cg-none')?.addEventListener('toggle', e => { g.noneOpen = e.target.open; });
    P.querySelector('[data-clear]')?.addEventListener('click', () => { g.picked = []; rerender(); });
    P.querySelector('[data-runpicks]')?.addEventListener('click', () => {
      g.applied = [...g.picked]; g.sel = null; map.selected = null;
      setup(); startLive(); show('map'); ctx.play(true); refresh();
    });
  }
  function rerender() { const y = $('g-panel').scrollTop; show(g.screen); $('g-panel').scrollTop = y; }

  return {
    enter() { G = null; map.barriers = false; map.queueSmooth = true; frame(); setup(); show(g.screen === 'map' ? 'map' : g.screen); },
    leave() { map.barriers = true; map.queueSmooth = false; map.marks = []; },
    refresh, legendHTML, sheet, pickFire,
    onRunEnd() { g.chip = 'fire'; refresh(); },
    onRunStart() { $('g-sheet').hidden = true; refresh(); },
  };
}
