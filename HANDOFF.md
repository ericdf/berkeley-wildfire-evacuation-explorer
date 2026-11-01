# Handoff: where the project stands (2026-11-01)

Read this first, then `CLAUDE.md` (style and project rules), `specfication.md` (the design brief), `README.md` (how it works and how to run it) and `SOURCE_NOTES.md` (every insight with its source, the change log and the calibration history). `DATA_INVENTORY.md` lists data in hand and still needed.

## State

Phase 1 of the spec is built and working: a browser simulator on Berkeley's real streets and terrain, with scenario and plan controls, an illustrative fire overlay, a queue-based traffic model, a separate fire-engine access layer, and a two-plan comparison over three seeds. Phases 2 (interventions with costs) and 3 (buildings, structure loss) have not started.

Run it: `python3 tools/serve.py` (no browser caching), open `http://127.0.0.1:8766`. Port 8765 belongs to Eric's other project.

Checks after any model change:

- `node tests/headless.mjs` runs every scenario with two plans.
- `node tests/calibration.mjs [seeds] [intersection scale]` compares 90th and 100th percentile evacuation times with the 2025 Evacuation Time Study, fire off.
- `node tests/stuck.mjs <scenario> <S1..S6> <minutes>` lists jammed links. Use it whenever the calibration's "relief" column climbs or a 100th percentile shows "—".
- `node tests/leftover.mjs <scenario> <S1..S6> [seed]` lists order-zone vehicles that never leave the order area, by start street and last link. A "—" with no jam usually means a car is placed on a dead-end piece of network.
- A browser smoke test needs puppeteer-core, which lives outside the repo; any headless Chrome check of `http://127.0.0.1:8766` for console errors will do.

Git: work goes through pull requests on https://github.com/ericdf/berkeley-wildfire-simulator, reviewed by Codex under `AGENTS.md`; only Eric merges. GitHub Pages serves the `pages` branch, updated only with Eric's approval (`git push origin main:pages`). Pushes need `git config http.postBuffer 157286400`.

## What the model does now

- **Network:** County street centerlines in Berkeley with City pavement widths, the City narrow-roads survey, 4 m lidar grades; OpenStreetMap streets beyond the city line (Oakland, Emeryville, Albany, Kensington, El Cerrito, Richmond) up to the edge of the elevation grid, widths assumed from Berkeley medians; the City's 75 diverters, shaped from OpenStreetMap geometry (32 closures, 13 junction splits, 17 one-way pieces, 13 left open), plus 9 OSM bollard and gate closures, including upper Panoramic Way beyond its gate; traffic circles (900 veh/h) at the City's 63 circles and OSM roundabouts. Exits are where streets leave the grid. County records shown wrong by other sources are fixed from a labeled list, `network.segmentCorrections` in `data/assumptions.json`; the one entry so far opens the 45 m Bancroft Wy link from the foot of Panoramic Way to Prospect St, which the County file coded no-vehicle (SOURCE_NOTES K1–K6).
- **Parking** (`js/parking.js`): varies by block and seed (none, one side or both sides; partly off the pavement; occasional bad parking jobs), from Eric's street photos and counts of parked cars on 22 hill blocks in the City's 2020 aerial photos. Fuller at night (an assumption). Plan options: status quo, one side only, enforce tight-to-curb, no parking on narrow roads, no parking in the hills.
- **Traffic** (`js/sim.js`): 5 s steps; link and junction capacities; take-turns lanes where parked cars leave one lane; junction delay by road class; reroutes every minute. Gridlock relief lets one car squeeze forward after 3 min if the link ahead has not moved.
- **Demand:** synthetic households from Genasys zone populations (2020 Census blocks for zones the City layer lacks; about 74,700 people outside Berkeley), the Time Study's compliance, departure-time tables, rideshare and returning commuters; plus employees, students, visitors and I-80 and CA-24 through traffic from the study's tables, placed by area.
- **Evacuation time** is measured as the study does: vehicles starting in Order zones, until they leave the order area (Table 7-1 notes).
- **Simple view** (`js/presets.js`): three fires (east wind near Grizzly Peak, 1923 repeat, Panoramic Hill) and four questions. A question is offered on a fire only if Plan B beat Plan A in 15 of 15 same-seed runs there with a central median change of 5% or more (SOURCE_NOTES P19–P22). Weekday vs night is withheld on the 1923 fire (4-min gap against the study's 70) and Panoramic Hill (no 90% time in most runs). A Claremont Canyon fire (region R10) passed every question but taught nothing new, so it was left out; its definition is in P22. Rerun the per-fire test after any model change that moves these numbers, and update the "What to look for" text.
- **Leave Early Zones:** the City's 10 zones (BER-006, 007, 008, 015, 016, 017, 030, 031, 057, 058).

## Calibration (fire off, median of 3 seeds, 90th percentile)

| Region | Study, nights/weekends | Simulator | Study, weekdays (S1/S4) | Simulator |
|---|---|---|---|---|
| R04 Panoramic Hill | 1:35–1:40 | 1:28–1:29 | 1:40 / 1:45 | 1:39 / 1:45 |
| R02 1923 repeat | 1:45–1:50 | 1:29–1:31 | 2:25 / 2:55 | 1:32 / 1:35 |
| R05 Fire Zones 2–3 | 1:45–1:55 | 1:31–1:32 | 2:05 / 2:20 | 1:40 / 1:45 |

After the diverter rebuild and the OKL-003 Census override (2026-11-01) these moved by at most 2 min; R04 gained about 140 order-zone vehicles. Opening the Bancroft Wy link (K6) moved R04 by at most 1 min and R02 and R05 by at most 1 min. Panoramic Hill matches, but partly because most of its cars count as out once they reach Oakland's part of the hill, which lies in no zone (punch list item 0, K7). The larger regions are about 15 min fast at night and 25–80 min fast on weekdays. A single intersection-capacity setting tuned on R02 broke Panoramic Hill on the held-out check, so capacity is left untuned (scale 1). The likely causes are real signal timing and where non-residents actually park and drive. Details are in `SOURCE_NOTES.md` under "Calibration check".

## Decisions Eric has made

- Hill streets are one lane each way; parking assumptions are labeled and replaced as evidence arrives.
- Early departure applies to the City's Leave Early Zones by default.
- The City's aerial photos are public; the project keeps derived counts only, to stay small.
- Tuning approach: fix jams first, tune only a few settings, check on cases not used for tuning.
- "Not a prediction" statements stay (exception to the style guide's denial-first rule).
- Follow `../berkeley-council-analysis/docs/STYLE.md` in chat and in products (see `CLAUDE.md`).

## Rename (done 2026-11-01)

"Game" is now "simulator" everywhere except `specfication.md` (Eric's brief, left as written); the provenance category "game rule" is "model rule"; generated data lives in `data/model/`; the folder is `berkeley-wildfire-simulator`. Claude Code's project memory was copied to `~/.claude/projects/-Users-eric-prj-berkeley-wildfire-simulator/memory/`.

## Punch list

In rough priority order. Items marked **Eric** need him.

0. **Panoramic Hill zone gap (found 2026-11-01, SOURCE_NOTES K7). Eric.** The Oakland part of Panoramic Hill (upper Dwight Way, Dwight Pl, Panoramic Way and Pl in Oakland) is in Genasys zone BER-013, but the builder uses the City layer's BER-E013, a sliver along the city line, so those streets are in no zone: nobody lives there in the model, and they count as outside the order area. Even with the Bancroft link open, 85–92% of the cars that start on Panoramic Hill (seed 1, S2 and S4) "evacuate" by driving east into that gap, so R04 times and the Panoramic Hill presets rest partly on it. Fix: Genasys outline for BER-013 (as X4 does for other cities' zones) plus a Census population, then rerun calibration and the per-fire preset test. Also from the same check (K5): The Crossways (County SEGID 181035806) is coded no-vehicle, but OSM and the City show a 21 ft street; left as is pending Eric.
1. **Network beyond Berkeley: done 2026-11-01** (SOURCE_NOTES X1–X11). Left over: (a) north Kensington (about 1,500 people) and Oakland south of about 37.84° N are outside the elevation grid; refetching the DEM farther north and south (`tools/fetch-dem.mjs`, `AREA_LONLAT` in `tools/utm.mjs`) would bring them in, extending north keeps `ymin` and every local coordinate, extending south moves the origin, so rebuild everything after; (b) OKL-003, an R04 order zone: Eric chose the 2020 Census count (307, not Genasys 27), applied as `population.overrides` in `data/assumptions.json` (X6); (c) widths outside Berkeley are Berkeley medians; Oakland's or Contra Costa's pavement data would replace them; (d) 38 County dead ends near the city line stay dead ends (checked: courts and stubs).
2. **Close the weekday calibration gap without over-fitting.** Candidates: signal timing (ask the City, or OSM `highway=traffic_signals` for locations), employee and student parking locations (Time Study Figure C-12 shows major employers; UC parking structures), through-traffic routes beyond I-80. Re-check on held-out regions each time. New public inputs (SOURCE_NOTES G4, G6): the City `Signals` layer gives pre-timed vs actuated for 146 signals (no timings), and the City's apparatus-route map lists 331 traffic-calming devices, including the Derby St diverter. Use both after the Oakland/Kensington merge, since they touch the network builder. Test the City centerline `PARKING` codes 1 and 2 against the aerial counts (G3).
3. **Informal question to Berkeley Fire: sent 2026-11-01** (`correspondence/2026-11-01-berkeley-fire-question.html`): which hill streets engines struggle on. Proceed as if no reply is coming (Eric). Formal City requests are dropped (Eric, 2026-11-01: a CPRA request takes months). Signal timing, curb parking and the City's diverter list are disclosed as information gaps instead; reopen them only if the City offers data. The letter lists 24 streets that `tools/engine-trouble-streets.mjs` ranks as most often too narrow for an engine with status-quo parking (60 seeds, day and night), leaving out UC, Lab and park roads (Cyclotron Rd, Campus Dr, Wildcat Canyon Rd). Berkeley Fire's answers are a direct check on the parking model; a "fine" for a street the model blocks often (Arlington Ave: 29% of runs by day, 42% at night) would mean the model over-blocks.
4. **Diverters: done 2026-11-01** (SOURCE_NOTES G6, O2a–O7). The City's traffic-calming layer is the list of record; each diverter's shape comes from OSM geometry (32 closures, 13 junction splits including Piedmont Av at Derby St and at Parker St, 17 one-way pieces, 13 open). Left over: (a) banned turns inside an open junction are not modeled (#303 9th St / Cedar St); (b) 4 diverters stay open because closing them would cut streets off or trap cars on County one-way streets (#59 Fulton St / Ashby Av, #258, #272, #283), which points to one-way directions in the County file that may be wrong there; (c) the South Park Dr gate is modeled closed all year, though it closes seasonally; (d) #67 Addison St and #253 Laurel St / Oak St could not be placed.
5. **Evening parking evidence.** Every photo and count is daytime; night parking is an assumption. **Eric**: an evening walk or drive with photos on a few streets; a tape measure at Poppy Ln and Bret Harte Rd (8 ft vs 10 ft decides engine access).
6. *(Merged into item 3.)*
7b. **R0 zoning (Eric, 2026-11-01).** A setting that bars population-increasing work (ADUs, additions) in a chosen area, compared against future-growth settings built from the Time Study's ADU figures (E26). Start after the Simple-view fire picker merges; see SOURCE_NOTES.
7a. **Police control of signals (Eric, 2026-11-01).** Eric is certain police will take over signals; the Time Study assumes they stay on normal timing (SOURCE_NOTES). Build a plan setting for officer-controlled junctions after the Oakland/Kensington merge: which junctions (the 44 pre-timed signals in the City `Signals` layer first, then the study's App. F congestion points), how many officers, and how soon they arrive, each labeled as an assumption. Keep a calibration run with it off, because the study's times assume no officer control.
7. **Fire Department staffing (Eric's idea, 2026-11-01).** Many BFD members live outside Berkeley; in a regional disaster, crews called in from home may be delayed, leaving the department short-handed. The simulator assumes one engine is staffed at the nearest station. A staffing layer would need on-duty crews per shift (Standards of Coverage), the callback policy, where off-duty members live (aggregate), and mutual-aid arrival times. It would matter most when several demands compete (fire attack, traffic control, assisted evacuation). Worth a short design note before building.
8. **Phase 2 interventions** from the spec, with sourced effects where the Time Study has them: second egress from Panoramic Hill (E25), actuated signals (E27), ADUs as uncertain added demand (E26), half of early leavers relocating to the flats (E13), transport assistance for households without a car (E29), and costs.
9. **Fire overlay timing:** the 1923 fire reaches the 1923 entry point too early (38–108 min vs about 150 min in the StoryMap). Logged, not fixed.
10. **Aerial counts:** 22 blocks so far, counted by Claude, not checked by a person. **Eric** could spot-check the five he photographed (`data/field/aerial-parking-counts-2020.json`). More blocks would tighten the parking shares.
11. *(Done 2026-11-01: OSM parking and width tags cover under 0.3% of hill streets; not used. SOURCE_NOTES O5.)*

## Gotchas

- `data/model/*.json` is generated by `tools/build-network.mjs`; rebuild after changing the builder or the lane, parking or capacity assumptions it reads.
- Diverters: `tools/build-network.mjs` section 5b adds nodes and edges (junction splits, connectors, one-way pieces), so edge ids after it differ from the County segment order. Per-device results are in `network.meta.barrierSites`.
- Genasys zone IDs: key on `zone_id` (labels like BER-006). The layer's `zonenum` repeats across cities.
- Outside Berkeley the hill rules apply to streets at 90 m elevation or higher (`proxy:elevation>=90m` in `fireZoneSrc`); `fireZone` 2 there is that proxy, not a City fire zone. The CAL FIRE layer in the City's FHSZ service was rejected (it rates Hiller Highlands "Moderate").
- `tools/build-network.mjs` step 3b joins OSM to the County network. If you change it, rerun the dead-end check described in SOURCE_NOTES X2 and look for one-way pieces that dead-end (the I-80 ends at Ashby Av and Gilman St were the hard cases).
- Comparing plans relies on the parking draws and household draws depending on the seed, not the plan; keep it that way.
- The error bounds in Assumptions & limits and the results panel (`studyRow` in `js/main.js`) are typed in from the calibration table. Update them whenever calibration changes.
- Simple view remembers the chosen fire in `localStorage` key `bhe-fire`; a fire id that is no longer in `FIRES` falls back to the first fire. Adding a fire means running every question on it (P19 rule) and filling `on` or `off` for each question.
- zsh does not split unquoted variables; use `${=var}` in shell loops.

## Egress and managed-retreat plan (spec lines 25–40: secondary egress with eminent domain; managed retreat)

**Step 1, access-constrained areas: done 2026-11-01.** `node tools/access-constraints.mjs` (about 30 s, no fire needed) writes `data/model/access-constraints.json` and `docs/access-constraints.md`. It finds every street link whose loss leaves homes with no drivable route out (edge dominators on the residents' directed network, exits at the grid edge), groups them into areas with nesting, and gives each area residents, households and vehicles (the simulator's allocation), fire-zone mix, clear width and engine fit at the entrance, steepest grade, the nearest street outside the area worth connecting to (straight line, climb, current driving distance from the area point to the outside point, obeying one-way directions), and any existing path, stairway or gate. Findings and data problems: SOURCE_NOTES AC1–AC11. Headline: 5,734 hill residents (14%) behind at least one choke, 3,133 of them in Berkeley; Panoramic Hill is the largest hill area (941).

Fix first, because they change step 1 and the simulator: Panoramic Way to Prospect St (AC3, County edge 2322 coded no-vehicle), Albany Hill population on one segment (AC4), the Martin Luther King Jr Wy one-way trap (AC5). Rerun the tool after each rebuild.

**Step 2, secondary egress connections.** Needs: a candidate list per area from `nearestOtherStreet` (already filtered to links that save at least 300 m and 3× their length of driving), checked on the map and the 2020 orthophotos; for each candidate, length, climb and grade (have), right-of-way width and the number of parcels crossed (needs the City parcel layer as geometry only, no owner fields, counted per candidate, not stored per parcel), whether an existing path or stairway or fire road could be widened (`existingLink`), cost ranges per meter for a new hill road and for acquisition (spec: eminent domain, environmental review, construction time, displacement), and a network option in the simulator to add the link (`--open` in the tool already does this for existing non-drivable segments and runs an opened one-way street both ways; new geometry needs a builder hook). Effect to show: residents taken out from behind a choke, change in evacuation time for the area's zones, engine access.

**Step 3, managed retreat.** Needs: per area, households and vehicles (have), housing units from the 2020 Census blocks in aggregate, a plan setting that removes a share of an area's synthetic households (demand drops in `buildHouseholds`), and cost and displacement ranges (buyout cost per unit, relocation support, housing lost), all labeled assumption. Effect to show: reduced future evacuation demand and fewer people behind a choke, against housing loss. Keep it at area and zone level; never list parcels or addresses.

**UI: built 2026-11-01** on branch `access-map` (on top of `access-constraints`): `js/access.js` plus a layer in `js/map.js`; see README, "On the map". Rerun the tool and reload after the Panoramic Hill fix (AC3); the layer reads the JSON as is. Original plan: an "Access constraints" map layer drawn from `memberEdges` (shade by nesting or residents, ⚠ hatch for `allocationWarning`), the entrance (`chokeEdges`) as a thick mark with a width label, a dashed line for `nearestOtherStreet` (from → to), the existing path in the path style; an inspector card per area with the metrics and their provenance categories; and the two rankings as a sortable table with the score components.
