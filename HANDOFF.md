# Handoff: where the project stands (2026-11-01)

Read this first, then `CLAUDE.md` (style and project rules), `specfication.md` (the design brief), `README.md` (how it works and how to run it) and `SOURCE_NOTES.md` (every insight with its source, the change log and the calibration history). `DATA_INVENTORY.md` lists data in hand and still needed.

## State

Phase 1 of the spec is built and working: a browser game on Berkeley's real streets and terrain, with scenario and plan controls, an illustrative fire overlay, a queue-based traffic model, a separate fire-engine access layer, and a two-plan comparison over three seeds. Phases 2 (interventions with costs) and 3 (buildings, structure loss) have not started.

Run it: `python3 -m http.server 8766 --bind 127.0.0.1`, open `http://127.0.0.1:8766`. Port 8765 belongs to Eric's other project.

Checks after any model change:

- `node tests/headless.mjs` runs every scenario with two plans.
- `node tests/calibration.mjs [seeds] [intersection scale]` compares 90th and 100th percentile evacuation times with the 2025 Evacuation Time Study, fire off.
- `node tests/stuck.mjs <scenario> <S1..S6> <minutes>` lists jammed links. Use it whenever the calibration's "relief" column climbs or a 100th percentile shows "—".
- A browser smoke test needs puppeteer-core, which lives outside the repo; any headless Chrome check of `http://127.0.0.1:8766` for console errors will do.

Git: all work is committed on `main` (no remote). City layers and report PDFs are git-ignored and can be re-fetched (`tools/fetch-city-layers.mjs`; PDF URLs in `SOURCE_NOTES.md`).

## What the model does now

- **Network:** County street centerlines (Berkeley only) with City pavement widths, the City narrow-roads survey, 4 m lidar grades, OpenStreetMap diverters (18 segments closed to residents' cars) and traffic circles (900 veh/h).
- **Parking** (`js/parking.js`): varies by block and seed (none, one side or both sides; partly off the pavement; occasional bad parking jobs), from Eric's street photos and counts of parked cars on 22 hill blocks in the City's 2020 aerial photos. Fuller at night (an assumption). Plan options: status quo, one side only, enforce tight-to-curb, no parking on narrow roads, no parking in the hills.
- **Traffic** (`js/sim.js`): 5 s steps; link and junction capacities; take-turns lanes where parked cars leave one lane; junction delay by road class; reroutes every minute. Gridlock relief lets one car squeeze forward after 3 min if the link ahead has not moved.
- **Demand:** synthetic households from Genasys zone populations, the Time Study's compliance, departure-time tables, rideshare and returning commuters; plus employees, students, visitors and I-80 through traffic from the study's tables, placed by area.
- **Evacuation time** is measured as the study does: vehicles starting in Order zones, until they leave the order area (Table 7-1 notes).
- **Leave Early Zones:** the City's 10 zones (BER-006, 007, 008, 015, 016, 017, 030, 031, 057, 058).

## Calibration (fire off, median of 3 seeds, 90th percentile)

| Region | Study, nights/weekends | Game | Study, weekdays (S1/S4) | Game |
|---|---|---|---|---|
| R04 Panoramic Hill | 1:35–1:40 | 1:30–1:32 | 1:40 / 1:45 | 1:39 / 1:45 |
| R02 1923 repeat | 1:45–1:50 | 1:29–1:32 | 2:25 / 2:55 | 1:33 / 1:35 |
| R05 Fire Zones 2–3 | 1:45–1:55 | 1:31–1:32 | 2:05 / 2:20 | 1:40 / 1:45 |

Panoramic Hill matches. The larger regions are about 15 min fast at night and 35–80 min fast on weekdays. A single intersection-capacity setting tuned on R02 broke Panoramic Hill on the held-out check, so capacity is left untuned (scale 1). The likely causes are real signal timing and where non-residents actually park and drive. Details are in `SOURCE_NOTES.md` under "Calibration check".

## Decisions Eric has made

- Hill streets are one lane each way; parking assumptions are labeled and replaced as evidence arrives.
- Early departure applies to the City's Leave Early Zones by default.
- The City's aerial photos are public; the project keeps derived counts only, to stay small.
- Tuning approach: fix jams first, tune only a few settings, check on cases not used for tuning.
- "Not a prediction" statements stay (exception to the style guide's denial-first rule).
- Follow `../berkeley-council-analysis/docs/STYLE.md` in chat and in products (see `CLAUDE.md`).

## Punch list

In rough priority order. Items marked **Eric** need him.

1. **Extend the network beyond Berkeley.** The Oakland Hills and Kensington have the same constraints, and a fire will not stop at the city line. Today the network stops at the city limits, hill streets that continue out are a hand list (`data/assumptions.json` `network.hillStreetsContinuingOutOfCity`), and Oakland and Kensington residents are dropped. Plan: pull an OpenStreetMap drivable network for the Oakland and Kensington hills (Overpass; the main server is often busy, so use mirrors such as overpass.kumi.systems), merge it at the city line, assume widths and lanes where OSM has none (labeled), add Oakland and Albany population from the Genasys zones already in `layers.json`, and find Kensington population (Contra Costa). This also resolves the Tanglewood Rd and dead-end exit approximations, and lets the 1923 and east-wind fires meet traffic across the line.
2. **Close the weekday calibration gap without over-fitting.** Candidates: signal timing (ask the City, or OSM `highway=traffic_signals` for locations), employee and student parking locations (Time Study Figure C-12 shows major employers; UC parking structures), through-traffic routes beyond I-80. Re-check on held-out regions each time. New public inputs (SOURCE_NOTES G4, G6): the City `Signals` layer gives pre-timed vs actuated for 146 signals (no timings), and the City's apparatus-route map lists 331 traffic-calming devices, including the Derby St diverter. Use both after the Oakland/Kensington merge, since they touch the network builder. Test the City centerline `PARKING` codes 1 and 2 against the aerial counts (G3).
3. **Informal question to Berkeley Fire: sent 2026-11-01** (`correspondence/2026-11-01-berkeley-fire-question.html`): which hill streets engines struggle on. Proceed as if no reply is coming (Eric). Formal City requests are dropped (Eric, 2026-11-01: a CPRA request takes months). Signal timing, curb parking and the City's diverter list are disclosed as information gaps instead; reopen them only if the City offers data. The letter lists 24 streets that `tools/engine-trouble-streets.mjs` ranks as most often too narrow for an engine with status-quo parking (60 seeds, day and night), leaving out UC, Lab and park roads (Cyclotron Rd, Campus Dr, Wildcat Canyon Rd). Berkeley Fire's answers are a direct check on the parking model; a "fine" for a street the model blocks often (Arlington Ave: 29% of runs by day, 42% at night) would mean the model over-blocks.
4. **Check the OSM diverters against the City's list.** Confirm Derby St (matched from a bollard tagged on Kelsey St), the Panoramic Way gate (not matched to our network), and whether diverters that block only some turns should close the whole segment.
5. **Evening parking evidence.** Every photo and count is daytime; night parking is an assumption. **Eric**: an evening walk or drive with photos on a few streets; a tape measure at Poppy Ln and Bret Harte Rd (8 ft vs 10 ft decides engine access).
6. *(Merged into item 3.)*
7a. **Police control of signals (Eric, 2026-11-01).** Eric is certain police will take over signals; the Time Study assumes they stay on normal timing (SOURCE_NOTES). Build a plan setting for officer-controlled junctions after the Oakland/Kensington merge: which junctions (the 44 pre-timed signals in the City `Signals` layer first, then the study's App. F congestion points), how many officers, and how soon they arrive, each labeled as an assumption. Keep a calibration run with it off, because the study's times assume no officer control.
7. **Fire Department staffing (Eric's idea, 2026-11-01).** Many BFD members live outside Berkeley; in a regional disaster, crews called in from home may be delayed, leaving the department short-handed. The game assumes one engine is staffed at the nearest station. A staffing layer would need on-duty crews per shift (Standards of Coverage), the callback policy, where off-duty members live (aggregate), and mutual-aid arrival times. It would matter most when several demands compete (fire attack, traffic control, assisted evacuation). Worth a short design note before building.
8. **Phase 2 interventions** from the spec, with sourced effects where the Time Study has them: second egress from Panoramic Hill (E25), actuated signals (E27), ADUs as uncertain added demand (E26), half of early leavers relocating to the flats (E13), transport assistance for households without a car (E29), and costs.
9. **Fire overlay timing:** the 1923 fire reaches the 1923 entry point too early (38–108 min vs about 150 min in the StoryMap). Logged, not fixed.
10. **Aerial counts:** 22 blocks so far, counted by Claude, not checked by a person. **Eric** could spot-check the five he photographed (`data/field/aerial-parking-counts-2020.json`). More blocks would tighten the parking shares.
11. **OSM parking and width tags** in the hills: not checked yet (Overpass was busy).

## Gotchas

- `data/game/*.json` is generated by `tools/build-network.mjs`; rebuild after changing the builder or the lane, parking or capacity assumptions it reads.
- Genasys zone IDs: key on `zone_id` (labels like BER-006). The layer's `zonenum` repeats across cities.
- The County file classes Tunnel Rd and the south end of MLK as Local; exits at the city line are special-cased (see item 1).
- Comparing plans relies on the parking draws and household draws depending on the seed, not the plan; keep it that way.
- The error bounds in Assumptions & limits and the results panel (`studyRow` in `js/main.js`) are typed in from the calibration table. Update them whenever calibration changes.
- zsh does not split unquoted variables; use `${=var}` in shell loops.
