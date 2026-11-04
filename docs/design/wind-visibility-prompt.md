Work on the Berkeley Wildfire Evacuation Explorer, repo ericdf/berkeley-wildfire-evacuation-explorer.
Read CLAUDE.md, AGENTS.md, HANDOFF.md and the earthquake sections of SOURCE_NOTES.md (EQ1–EQ11) and
docs/design/earthquake-fire.md first.

Branch: PR #59 (branch claude/exciting-curie-mxgrgt) is open and not merged; it holds the earthquake
scenarios this work builds on. If #59 has been merged, branch from main; otherwise branch from
claude/exciting-curie-mxgrgt. Open a new PR for this work and run the Codex review loop per AGENTS.md.
Do not touch data/model/goal-combos.json or the claude/goal-combos-* branches; another session owns them.

Eric approved all three steps below; do them in order without stopping for approval between them.
Ask only if a decision is genuinely his.

1. Measure wind by hour of day and season at the Oakland North RAWS (COKN, ridge above Gwin Canyon).
   Use the WRCC frequency tool the way tools/wind-events.mjs does (raws.dri.edu/cgi-bin/wea_freq2.pl,
   hour-window fields WsHou/WeHou, month windows WsMon/WeMon). Report per season (at least spring
   Mar–May, summer Jun–Aug, fall Sep–Nov, winter Dec–Feb) and hour band (e.g. 0–5, 6–11, 12–17, 18–23):
   direction shares in 10° bins and median speed, plus how often the direction reverses between
   afternoon and night. Measure the onshore share the earthquake design note says is still to be
   measured, and the winter north-wind share (340–20°). Cache downloads under data/raw/wind/
   (gitignored); write a summary to data/model/ and a short doc; log every finding with its source in
   SOURCE_NOTES.md.

2. Let the wind change during a run. js/fire.js runFire uses one sc.windFrom/sc.windMph; add an optional
   scenario wind schedule (list of {fromMin, windFrom, windMph}) read at the time each cell's crossing
   starts, for spread direction, length-to-breadth and ember throw. Keep every existing scenario
   byte-identical when it has no schedule (check with node tests/plan-draws.mjs, node tests/headless.mjs,
   node tests/families.mjs, and the 1923/1991 marks in tools/structure-spread-test.mjs). A wind shift
   can let a later crossing start arrive earlier; say in a comment how the shortest-time search handles
   that. Then give the earthquake scenarios (js/scenarios.js, ids quake and quakeEastWind) wind choices
   built from step 1's measurements: HayWired's spring afternoon (4:18 p.m.) with its measured sea
   breeze and evening shift, a winter northerly day, and the existing dry east-wind day as the rare worst
   case. Every wind number must trace to step 1 or be labeled an assumption. Refit or confirm
   QUAKE_ROS_FACTOR against HayWired's Berkeley floor area burned (SOURCE_NOTES EQ11) if the winds move
   it. Also add a north-wind member to the wildfire fire families only if the measurements support it,
   and rerun node tests/families.mjs.

3. Add a scenario setting "Visibility: clear / poor (fog or smoke)" (Expert view, off by default) that
   lowers free-flow speed and lane capacity on every street. Take the reductions from FHWA studies of
   traffic in inclement weather / low visibility (find and cite the primary report and page; do not use
   remembered numbers). For fog, note that Berkeley's fog is marine fog, not tule fog, and that fog
   usually comes with an onshore flow and high humidity that slow a fire; if a sourced way to slow the
   fire in fog exists, add it as a separate labeled rule, otherwise say on the page that the fire is not
   slowed. Draws must not depend on the setting (tests/plan-draws.mjs).

For every model change: run node tests/headless.mjs and node tests/calibration.mjs, report calibration
changes in SOURCE_NOTES.md, update README.md, HANDOFF.md and the page's Assumptions & limits, and keep the
"not a prediction / not an official evacuation plan" statements. Follow the writing style in CLAUDE.md
(the council-analysis docs/STYLE.md). Never put Eric's email in requests. Never push to main or the
pages branch; Eric merges and approves publishing in a session.
