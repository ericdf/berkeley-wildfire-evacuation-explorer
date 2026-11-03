# Weekday non-resident placement: by area against by workplace

Placing employees, students and Lab staff where public data says they work and park moves the simulator's weekday 90th-percentile evacuation times by 0–5 minutes. The weekday gap to the 2025 Evacuation Time Study (25–80 minutes too fast in R02 and R05) stays. Where non-residents park does not explain it. The remaining candidates are junction capacity and signal timing, and through traffic. These are calibration runs with the fire off, not predictions.

## What the setting does

"Weekday non-resident placement" is an Expert-view scenario setting (`world.nrPlacement`, `js/sim.js` `workplaceAreas`). It is off by default ("By area (today)"), and with it off every test prints exactly what main prints.

Both options keep the Time Study's vehicles per group and area (Tables 3-5 and 3-9, sourced) and the study's share of each group present in each case (Table 6-5, sourced). They differ only in which street a vehicle starts on:

| Group (Time Study area) | By area (today) | By workplace |
|---|---|---|
| Employees: flats, North and South Berkeley Hills, West Berkeley | Spread over the area's streets by length (model rule) | Each LODES 2023 workplace block's jobs held by people living outside Berkeley are spread evenly over the area's streets within 800 m of the block (derived; the study parks employee cars "within a 10-minute walking distance (approximately 0.5 miles)", §3.4) |
| UC employees and off-campus (commuting) students | Campus streets; streets within 1 km of campus outside the hills | UC's off-street parking first: OpenStreetMap's 33 UC facilities, capacities scaled to UC's published 5,500 spaces (model rule), for a share of spaces ÷ these cars (S4: 5,500 ÷ 15,673 = 35%; S1: 100%); the rest as by area |
| LBNL employees | Lab streets by length | The Lab's 45 OSM lots by capacity (993 spaces in OSM) |
| On-campus students, BCC students, visitors, Tilden | as by area | unchanged |

Every vehicle still takes one draw from the shared stream for its street, so Plan A and Plan B see the same non-residents for a seed under either option.

Inputs, built by `node tools/workplaces.mjs` into `data/model/workplaces.json` (points in the network's local meters, so a network rebuild does not stale them): LEHD LODES8 2023 (SOURCE_NOTES WP1–WP4), OSM parking and UC's published total (WP5–WP7), CDE schools (WP8, WP9).

## What the data says before any run

- **LODES agrees with the study on who commutes in**: 86.6% of Berkeley's jobs in the LODES OD file are held by people living outside Berkeley; the study found about 84.4% (WP2).
- **LODES and the study disagree on how many**: LODES puts 3–5 times the study's employees in the flats and West Berkeley, because the study counts only employers with 100 or more staff (WP3). The setting keeps the study's totals and uses LODES only to share them out within an area. Taking LODES totals instead is a choice between sources and is left to the maintainer.
- **LODES cannot place UC or Lab staff**: it puts 16,638 UC jobs on one block near Oxford St and shows 83 jobs at the Lab (WP4). Parking stands in for them.
- **UC parking holds about a third of UC's weekday cars in S4** (WP7). The other two thirds park on streets, as the study assumes.
- **Schools**: Berkeley Unified's 2025-26 enrollment (9,352) plus private schools in its area (2,252) gives 11,604 against the study's 11,977 K-12 students (WP8, WP9). The simulator has no school trips, so school data is stored by zone and not used for placement.

## Results (fire off, median of 3 seeds [min–max], 90th percentile, h:mm after the order)

`node tests/calibration.mjs 3` (by area) and `PLACEMENT=workplace node tests/calibration.mjs 3` (by workplace), all six cases, about 11 minutes each on one core.

| Region · case | Study | By area | By workplace | Change | Order-zone vehicles (seed 1), area → workplace |
|---|---|---|---|---|---|
| R02 1923 · S1 | 2:25 | 1:33 [1:32–1:33] | 1:33 [1:32–1:34] | 0 | 22,099 → 22,008 |
| R02 1923 · S4 | 2:55 | 1:35 [1:35–1:36] | 1:40 [1:40–1:41] | +5 | 25,194 → 26,767 |
| R05 Fire Zones 2–3 · S1 | 2:05 | 1:40 [1:40–1:40] | 1:40 [1:39–1:40] | 0 | 16,849 → 17,125 |
| R05 · S4 | 2:20 | 1:45 [1:45–1:46] | 1:45 [1:44–1:45] | 0 | 17,089 → 17,904 |
| R09 North Berkeley Hills · S1 | 2:10 | 1:40 [1:40–1:41] | 1:40 [1:40–1:41] | 0 | 12,817 → 12,646 |
| R09 · S4 | 2:05 | 1:46 [1:46–1:46] | 1:46 [1:46–1:47] | 0 | 12,534 → 12,412 |
| R04 Panoramic Hill · S1 | 1:40 | 1:40 [1:37–2:04] | 1:41 [1:38–2:05] | +1 | 1,242 → 1,204 |
| R04 · S4 | 1:45 | 1:47 [1:42–2:10] | 1:48 [1:44–2:09] | +1 | 1,218 → 1,182 |

Nights and weekends (S2, S3, S5, S6), where few non-residents are present, move by at most 1 minute in every region. 100th percentiles move by at most 1 minute. Every vehicle finishes in every run. Gridlock relief in R02 S4 (seed 1) rises from 49 to 111, on the campus roads where UC parking now empties.

**Held-out regions.** Nothing was tuned: the 800 m walk comes from the study, the 5,500 spaces from UC, and no setting was chosen after seeing a result, so every region is a check. Where the setting moves a weekday result it moves toward the study (R02 S4 +5 min, against a gap of 80), and it moves no night case away from it. R04 Panoramic Hill, which already matched on weekdays, stays within 3 minutes of the study there. R02 S4 moves because UC's parking and the campus lie in its order zones: about 1,570 more non-resident cars start inside the order area (seed 1; most on campus roads and Gayley Rd). R05 S4 gains about 800 order-zone non-resident cars (Gayley Rd, Stadium Rim Rd) and does not move; R09 loses about 120 and does not move.

**Reading.** At most 5 of R02's 80 minutes, and none of R05's 35, come from where non-residents park. The rest has to come from how fast junctions pass traffic, which the model sets by road class with no signal timing, and from traffic the model does not load (through traffic beyond I-80 and CA-24, E35).

## What signal locations alone suggest (described, not tuned)

The City's 146 signals (143 junctions) and 119 OSM signal junctions outside Berkeley are now located on the network (WP10, WP12). The model gives every junction one capacity by its highest street class (900, 1,200 or 1,600 vehicles per hour) and a fixed delay (5, 10 or 20 s) whether or not it is signalized. At a signal, each approach gets only its share of green, minus lost time per cycle, so a signalized junction where two main streets cross passes less than the main street's capacity in each direction. A rule of that kind would lower capacity at the 36 arterial × arterial and 28 arterial × collector signal junctions and add cycle delay at all of them. It would slow weekday and night runs alike, so it would also widen the night gap unless the capacity values were recalibrated with it, which is the over-fitting risk the 2026-11-01 tuning attempt ran into. Without cycle lengths and splits (the City's signal timing or KLD's network files) its size is a guess, so nothing was changed.

Two findings for the maintainer came out of this work. 73 City signals sit at junctions where the County file classes every street Local, so the model gives them local capacity and a 5 s delay; the County class understates these streets. And `data/model/signals.json` on main is stale: 95 of its 145 node ids name other junctions on the current network (WP11), so the police-control and power-shutoff settings act at the wrong places. Regenerating it changes those opt-in results and is left for approval.

## Gaps

- **Caltrans PeMS** needs an account (not registered). It would give 5-minute volumes and speeds on I-80, I-580 and CA-24, which would check the study's through traffic and the freeway background load (WP13).
- Where visitors park (the setting leaves them by area), UC parking by permit type and today's occupancy, the Lab's lot capacities, and private school locations.
- Signal timing and phasing: the City's timing sheets or KLD's DYNEV network files.
