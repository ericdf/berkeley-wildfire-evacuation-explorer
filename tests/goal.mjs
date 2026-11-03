// Set a goal (js/goal.js): the pass rule, minimal answers, held-out passes and ranking, on a small
// synthetic table. node tests/goal.mjs
import { setGoalData, evaluate, rank, reach } from '../js/goal.js';
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
// measures: ember, front, cutOff, engine, clear90; 2 search passes + 2 held-out passes
const row = (ember, engine, clear90 = 90) => [ember, 0, 0, engine, clear90];
const T = (...rs) => rs;
setGoalData({ meta: { measures: ['ember', 'front', 'cutOff', 'engine', 'clear90'], nSearch: 2, cases: ['a', 'b', 'c', 'd'], maxSize: 3 },
  fires: { f: { candidates: ['a', 'b', 'c'], excluded: [{ id: 'x', reliable: false, harms: [], runs: 15 }], runs: {
    '': T(row(100, 1000), row(200, 1000), row(100, 1000), row(100, 1000)),
    a: T(row(70, 1000), row(140, 1000), row(70, 1000), row(70, 1000)),            // ember −30% everywhere
    b: T(row(100, 400), row(200, 400), row(100, 400), row(100, 400)),             // engine −60%
    c: T(row(60, 1000), row(120, 1000), row(90, 1000), row(95, 1000)),            // ember −40% on search, −10% held out: luck
    'a+b': T(row(70, 400), row(140, 400), row(70, 400), row(70, 400)),
    'a+c': T(row(50, 1000), row(100, 1000), row(60, 1000), row(60, 1000)),
    'b+c': T(row(60, 400), row(120, 400), row(90, 400), row(95, 400)),
    'a+b+c': T(row(50, 400), row(100, 400), row(60, 400), row(60, 400)),
  } } } });
const keys = r => r.map(x => x.key).sort().join(' ');
let E = evaluate('f', { ember: 25 });
ok(keys(E.answers) === 'a', 'ember −25%: answer is a alone (supersets of a are not minimal)');
ok(keys(E.luck) === 'c', 'ember −25%: c met it on search passes only, listed apart');
E = evaluate('f', { ember: 25, engine: 50 });
ok(keys(E.answers) === 'a+b', 'ember −25% and engine −50%: a+b; b+c fails on held-out passes');
ok(keys(E.luck) === 'b+c', 'b+c is listed as luck');
E = evaluate('f', { ember: 75 });
ok(E.answers.length === 0 && E.closest[0]?.key === 'a+c', 'ember −75%: no answer, closest listed');
E = evaluate('f', { engine: 50 });
ok(keys(E.answers) === 'b', 'engine −50%: b');
// zero and never-reached rules
setGoalData({ meta: { measures: ['ember', 'front', 'cutOff', 'engine', 'clear90'], nSearch: 1, cases: ['a', 'b'], maxSize: 3 },
  fires: { f: { candidates: [], excluded: [], runs: { '': T([0, 0, 0, 0, null], [0, 0, 0, 0, 100]), p: T([0, 0, 0, 0, 80], [0, 0, 0, 0, 70]), q: T([5, 0, 0, 0, null], [0, 0, 0, 0, 70]) } } } });
E = evaluate('f', { ember: 50, clear90: 25 });
ok(keys(E.answers) === 'p', 'today at 0 stays 0 meets; reaching a clearance today never reaches meets; q fails (0 → 5)');
// one severity: cases "sev|seed"; s fails at high severity only, so it meets a low-severity goal
setGoalData({ meta: { measures: ['ember', 'front', 'cutOff', 'engine', 'clear90'], nSearch: 2, cases: ['low|1', 'high|1', 'low|2', 'high|2'], maxSize: 3 },
  fires: { f: { candidates: [], excluded: [], runs: { '': T(row(100, 0), row(100, 0), row(100, 0), row(100, 0)), s: T(row(50, 0), row(95, 0), row(50, 0), row(95, 0)) } } } });
ok(keys(evaluate('f', { ember: 25 }, 'low').answers) === 's', 'ember −25% at low severity: s (judged on low passes only)');
ok(evaluate('f', { ember: 25 }, 'high').answers.length === 0, 'ember −25% at high severity: none');
ok(evaluate('f', { ember: 25 }).answers.length === 0, 'ember −25% over all passes: none');
ok(evaluate('f', { ember: 25 }, 'low').answers[0].nHold === 1, 'low severity: 1 held-out pass');
// held-out passes by seed (meta.holdoutSeeds), in any order, and reach()
setGoalData({ meta: { measures: ['ember', 'front', 'cutOff', 'engine', 'clear90'], nSearch: 2, cases: ['low|1', 'low|3', 'low|2', 'low|4'], searchSeeds: [1, 2], holdoutSeeds: [3, 4], maxSize: 3 },
  fires: { f: { candidates: [], excluded: [], runs: { '': T(row(100, 0, null), row(100, 0, null), row(100, 0, 90), row(100, 0, 90)), s: T(row(60, 0, 80), row(90, 0, 80), row(60, 0, 85), row(80, 0, 88)) } } } });
E = evaluate('f', { ember: 25 }, 'low');
ok(E.answers.length === 0 && keys(E.luck) === 's', 'seeds 1–2 search (−40%), seeds 3–4 held out (−10%, −20%): luck, by seed not position');
ok(Math.abs(reach('f', 'low').best.ember - 0.1) < 1e-9, 'reach: best cut in every pass is 10%');
E = evaluate('f', { clear90: 5 }, 'low');
ok(E.answers.length === 0 && E.luck[0]?.mid.clear90.reached === 2, 'clear90: two passes reached where today never did, counted');
// ranking: fewest changes, then all-priced cheapest, then unpriced
const L = { a: { cost: { capital: [5, 9] } }, b: { cost: { capital: [1, 2] } }, c: { cost: { note: 'x' } } };
const r = rank([{ key: 'c', ids: ['c'] }, { key: 'a', ids: ['a'] }, { key: 'a+b', ids: ['a', 'b'] }, { key: 'b', ids: ['b'] }], id => L[id]);
ok(r.map(x => x.key).join(' ') === 'b a c a+b', 'rank: size, then priced cheapest, then unpriced');
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
