// Simple view, "Set a goal" (Eric, 2026-11-02; SOURCE_NOTES GS1–GS5): the user picks one or more harms
// and how much each should be cut against today's plan, and the page lists the smallest combinations
// of changes that did so, from data/model/goal-combos.json (tools/goal-combos.mjs). The other path,
// picking changes yourself and running them, stays in "Change the plan".
//
// A combination meets the goal when, for every harm picked, it cut that harm by at least the share
// asked in every pass at the pace the user picked (Eric, 2026-11-03; SOURCE_NOTES GS6): 5 search
// passes (seeds 1–5) and 5 held-out passes (seeds 6–10) that play no part in picking it. A combination
// that met the goal on the search passes but not on the held-out ones is listed apart: checking about
// 200 combinations on the same passes finds some that clear a target by luck. Shown answers are minimal: no smaller combination inside them also meets the goal.
import { MEASURES, costText, costBadge } from './mitigate.js';

let G = null, loading = null;
export const goalData = () => G;
export const setGoalData = d => (G = d); // tests/goal.mjs
export function loadGoal() {
  return loading ??= fetch(new URL('../data/model/goal-combos.json', import.meta.url)).then(r => r.ok ? r.json() : null).catch(() => null).then(d => (G = d));
}

export const CUTS = [10, 25, 50, 75];
// "1–5, 11–15" from the seeds of a list of pass indexes
const seedText = idx => {
  const s = [...new Set(idx.map(i => +String(G.meta.cases[i]).split('|')[1]))].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`); i = j + 1; }
  return out.join(', ');
};
const asNum = x => x == null ? Infinity : x;
const median = xs => { const s = xs.map(asNum).sort((a, b) => a - b), n = s.length; if (!n) return null; const v = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; return Number.isFinite(v) ? v : null; };
// The cut a pass achieved, as a share of today's plan (1 = harm gone). Today at 0: nothing to cut,
// so the pass meets any goal if the plan also stays at 0. A clearance never reached counts as
// slower than any that is; reaching it where today's plan does not meets any goal.
const cutOf = (a, b) => {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -Infinity;
  if (a === 0) return b <= 0 ? 1 : -Infinity;
  return (a - b) / a;
};

// The passes a goal is judged on: those at one severity (meta.cases are "severity|seed"), or all. A pass
// is held out when its seed is in meta.holdoutSeeds (older files: when it comes after the nSearch
// search passes).
export function passes(sev) {
  const M = G.meta, hold = new Set(M.holdoutSeeds || []);
  const isHold = i => hold.size ? hold.has(+String(M.cases[i]).split('|')[1]) : i >= M.nSearch;
  const idx = M.cases.map((_, i) => i).filter(i => !sev || String(M.cases[i]).split('|')[0] === sev);
  return { search: idx.filter(i => !isHold(i)), hold: idx.filter(isHold) };
}

// The largest cut of each harm that some stored combination made in every pass at this severity:
// what a goal on that harm can reach on this fire (Eric, 2026-11-03: show what is reachable).
// never[m]: today's plan never reaches that clearance within the run in any of these passes.
export function reach(fire, sev) {
  const F = G?.fires[fire]; if (!F) return null;
  const MI = Object.fromEntries(G.meta.measures.map((k, i) => [k, i])), P = passes(sev), idx = [...P.search, ...P.hold], base = F.runs[''];
  const best = Object.fromEntries(G.meta.measures.map(m => [m, Math.max(...Object.entries(F.runs).filter(([k]) => k).map(([, R]) => Math.min(...idx.map(i => cutOf(base[i][MI[m]], R[i][MI[m]])))))]));
  const never = Object.fromEntries(G.meta.measures.map(m => [m, idx.every(i => base[i][MI[m]] == null)]));
  return { best, never };
}

// Evaluate every stored combination on one fire against the targets ({ measure: percent }), on the
// passes at severity sev (all passes when sev is not given).
export function evaluate(fire, targets, sev) {
  const F = G?.fires[fire]; if (!F) return null;
  const MI = Object.fromEntries(G.meta.measures.map((k, i) => [k, i])), P = passes(sev);
  const ms = Object.keys(targets), base = F.runs[''];
  const met = (R, i, m) => cutOf(base[i][MI[m]], R[i][MI[m]]) >= targets[m] / 100 - 1e-9;
  const rows = Object.entries(F.runs).filter(([k]) => k).map(([key, R]) => {
    const ids = key.split('+');
    // worst cut per measure over the search passes and over the held-out passes
    const worst = idx => Object.fromEntries(ms.map(m => [m, Math.min(...idx.map(i => cutOf(base[i][MI[m]], R[i][MI[m]])))]));
    const ws = worst(P.search), wh = worst(P.hold);
    const meets = w => ms.every(m => w[m] >= targets[m] / 100 - 1e-9);
    const holdPasses = P.hold.filter(i => ms.every(m => met(R, i, m))).length;
    // reached: passes where today's plan never reached the clearance within the run and this plan did
    const all = [...P.search, ...P.hold];
    const mid = Object.fromEntries(ms.map(m => [m, { today: median(P.search.map(i => base[i][MI[m]])), plan: median(P.search.map(i => R[i][MI[m]])), worst: Math.min(ws[m], wh[m]),
      reached: all.filter(i => base[i][MI[m]] == null && R[i][MI[m]] != null).length, n: all.length }]));
    // shortfall: how far the worst pass is from the goal, the largest over the harms picked
    const short = Math.max(...ms.map(m => targets[m] / 100 - Math.min(ws[m], wh[m])));
    return { key, ids, search: meets(ws), hold: meets(wh), holdPasses, nSearch: P.search.length, nHold: P.hold.length, mid, short };
  });
  const sub = (a, b) => a.ids.length < b.ids.length && a.ids.every(id => b.ids.includes(id));
  const minimal = list => list.filter(r => !list.some(q => sub(q, r)));
  const both = rows.filter(r => r.search && r.hold);
  const answers = minimal(both);
  // Met on the search passes only, and with no smaller combination that meets the goal on all its passes.
  const luck = minimal(rows.filter(r => r.search)).filter(r => !r.hold && !both.some(q => sub(q, r)));
  const closest = answers.length ? [] : rows.filter(r => !r.search || !r.hold).sort((a, b) => a.short - b.short || a.ids.length - b.ids.length).slice(0, 3);
  return { answers, luck, closest, excluded: F.excluded, candidates: F.candidates };
}

// Fewest changes first (Eric, 2026-11-02), then cost: combinations whose every change has a screening
// cost, cheapest low end first; then those with an unpriced change, which are not treated as free.
export function rank(list, leverById) {
  const priced = r => r.ids.every(id => leverById(id)?.cost?.capital);
  const low = r => r.ids.reduce((s, id) => s + (leverById(id)?.cost?.capital?.[0] || 0), 0);
  return [...list].sort((a, b) => a.ids.length - b.ids.length || (priced(b) - priced(a)) || low(a) - low(b));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => x === -Infinity ? 'worse' : x >= 1 ? '100%' : `${Math.floor(x * 100)}%`;

// Controls (left panel). ctx: { state, FIRES, fmt, leverById, paceHTML, paceShort }.
export function goalHTML(ctx) {
  const { state, FIRES } = ctx, T = state.goal;
  if (!G) return `<p class="small muted">${loading ? 'Loading the stored combinations…' : 'The stored combinations (data/model/goal-combos.json) did not load.'}</p>`;
  const ok = G.meta.fires.includes(state.fire), P = passes(state.pace), RB = ok ? reach(state.fire, state.pace) : null, B = RB?.best || {};
  return `<h2>Fire scenario: <select id="goal-fire">${FIRES.map(f => `<option value="${f.id}"${f.id === state.fire ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select></h2>
    <p class="small">Say what you want a plan to achieve on this fire, and see the smallest combinations of changes that did it. Pick one or more harms and how much each should be cut, compared with today's plan.</p>
    ${ctx.paceHTML()}
    ${ok ? '' : '<p class="small bad">This fire has no stored combinations yet.</p>'}
    <div class="goals">${Object.entries(MEASURES).map(([m, d]) => { const b = B[m], can = c => b >= c / 100 - 1e-9;
      return `<div class="goal-row" title="${esc(d.tip)}"><label class="small">${esc(d.label)} <span class="tip">ⓘ</span></label>
      <select data-goal="${m}"><option value="">not a goal</option>${CUTS.map(c => `<option value="${c}"${T[m] === c ? ' selected' : ''}${b == null || can(c) ? '' : ' class="unreached"'}>cut by at least ${c}%${b == null || can(c) ? '' : ' (none did)'}</option>`).join('')}</select>${b == null ? '' : `<span class="muted reach"> ${RB.never[m] ? `Today's plan never gets there within the run at this pace${b >= 1 ? '; some plans do in every pass (counted as a full cut)' : '; no plan does in every pass'}` : `Best cut in every pass: ${b > 0 ? `${Math.floor(b * 100)}%` : 'none'}`}</span>`}</div>`; }).join('')}</div>
    <p class="small muted">"Best cut in every pass" is the most any stored combination cut that harm in its worst pass at this pace on this fire; cuts no plan reached are marked "none did".</p>
    <p class="small muted">A combination meets the goal only if it cut every harm you picked by at least that much in every pass at the pace you picked: ${P.search.length} passes (seeds ${seedText(P.search)}) to search and ${P.hold.length} fresh passes (seeds ${seedText(P.hold)}) used only to check. The answers change with the pace: a plan that meets a goal at the 1923 pace may not at the 1991 pace. Each pass runs both plans on the same fire and the same synthetic households. The fire starts where this scenario starts it, with its usual wind, on a fall night.</p>
    <p class="small muted">The search tried every combination of up to ${G.meta.maxSize} changes that helped reliably on their own on this fire; the changes it left out are listed with the answers. Answers are listed fewest changes first, then by screening cost.</p>`;
}

// Answers (right panel).
export function goalOutHTML(ctx) {
  const { state, FIRES, fmt, leverById } = ctx, T = state.goal, fire = FIRES.find(f => f.id === state.fire);
  if (!G || !G.fires[state.fire]) return '';
  const ms = Object.keys(T);
  const E = evaluate(state.fire, T, state.pace), P = passes(state.pace);
  const left = E.excluded.map(x => ({ l: leverById(x.id), x })).filter(o => o.l);
  const leftHTML = left.length ? `<details class="cant" open><summary>Changes the search left out (${left.length})</summary><ul class="small">${left.map(({ l, x }) => `<li><b>${esc(l.title)}</b>: tested alone on this fire in ${x.runs} passes against today's plan; it did not reliably help${x.harms.length ? `, and it made ${x.harms.map(h => `"${esc((MEASURES[h.measure]?.label || h.measure).toLowerCase())}" worse in ${h.worse} of ${h.n}`).join(' and ')}` : ''}.</li>`).join('')}</ul>
    <p class="small muted">They were considered and tested; you can still add them yourself in Change the plan.</p></details>` : '';
  const head = `<h2>Plans that meet your goal</h2><p class="small">${esc(fire.title)}, ${esc(ctx.paceShort())}: ${ms.length ? ms.map(m => `${esc(MEASURES[m].label.toLowerCase())} cut by at least ${T[m]}%`).join('; ') : 'pick at least one harm and a cut on the left'}.</p>`;
  if (!ms.length) return head + leftHTML;
  const v = (m, x) => x == null ? (MEASURES[m].time ? 'not reached' : '—') : MEASURES[m].time ? `${Math.round(x)} min` : fmt(x);
  const card = (r, kind) => {
    const ls = r.ids.map(leverById);
    const rowsHTML = ms.map(m => `<tr><td>${esc(MEASURES[m].label)}</td><td class="num">${v(m, r.mid[m].today)}</td><td class="num">${v(m, r.mid[m].plan)}</td><td class="num">${pct(r.mid[m].worst)}</td></tr>`).join('');
    const status = kind === 'answer' ? `<span class="good">Met the goal in all ${r.nSearch + r.nHold} passes, including the ${r.nHold} fresh ones</span>`
      : kind === 'luck' ? `<span class="mixed">Met the goal in all ${r.nSearch} search passes but only ${r.holdPasses} of ${r.nHold} fresh ones: don't rely on it</span>`
      : `<span class="muted">Closest: falls short by ${Math.round(r.short * 100)} percentage points in its worst pass</span>`;
    return `<div class="tryres goal-ans"><div><b>Today's plan + ${ls.map(l => esc(l.title)).join(' + ')}</b></div>
      <div class="small">${status}</div>
      <table class="cmp small"><tr><th></th><th>Today's plan</th><th>With these changes</th><th>Smallest cut in any pass</th></tr>${rowsHTML}</table>
      ${ms.filter(m => r.mid[m].reached).map(m => `<div class="small muted">${esc(MEASURES[m].label)}: in ${r.mid[m].reached} of ${r.mid[m].n} passes today's plan never got there within the run and this plan did; those passes count as a full cut.</div>`).join('')}
      <div class="small">${ls.map(l => `${esc(l.title)}: ${esc(costText(l.cost))} ${costBadge(l.cost)}`).join('<br>')}</div>
      <div class="btns"><button data-goal-try="${esc(r.ids.join(','))}">Open in Change the plan</button></div></div>`;
  };
  const A = rank(E.answers, leverById), L = rank(E.luck, leverById);
  const notice = `<p class="small muted">Middle values are over the ${P.search.length} search passes. Synthetic households on an illustrative fire: these are comparisons between plans, not predictions, and not an official evacuation plan. Costs are screening ranges, not budgets; "not priced" means this project has no cost for that change, not that it is free.</p>`;
  const body = A.length ? `<p class="small">${A.length === 1 ? 'One combination' : `${A.length} combinations`} of up to ${G.meta.maxSize} changes met the goal, with nothing smaller inside ${A.length === 1 ? 'it' : 'them'} that also did.</p>${A.map(r => card(r, 'answer')).join('')}`
    : `<p class="small"><b>No combination of up to ${G.meta.maxSize} changes met this goal in every pass at this pace.</b> A smaller cut, fewer harms, a different pace, or more changes together (try them in Change the plan) may get closer.</p>${E.closest.map(r => card(r, 'closest')).join('')}`;
  const luckHTML = L.length ? `<details class="cant"><summary>Met the goal on the search passes only (${L.length})</summary><p class="small muted">These met it in all ${P.search.length} search passes but not on the fresh passes, so their result on the search passes was partly luck.</p>${L.map(r => card(r, 'luck')).join('')}</details>` : '';
  return head + body + luckHTML + leftHTML + notice;
}

// ctx adds: pickFire, openInTry(ids), render().
export function wireGoal(ctx) {
  const S = document.getElementById('simple');
  S.querySelectorAll('[data-goal]').forEach(s => s.onchange = () => { const m = s.dataset.goal; s.value ? ctx.state.goal[m] = +s.value : delete ctx.state.goal[m]; ctx.render(); });
  const f = document.getElementById('goal-fire'); if (f) f.onchange = e => ctx.pickFire(e.target.value);
  document.querySelectorAll('[data-goal-try]').forEach(b => b.onclick = () => ctx.openInTry(b.dataset.goalTry.split(',')));
}
