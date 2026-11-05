# Managed retreat: which blocks a voluntary buyout would target, and what it would change

Built 2026-11-03 by `node tools/retreat-sim.mjs` (this report from `tools/retreat-report.mjs`, costs from `tools/retreat-costs.mjs`). Machine-readable results: `data/model/retreat.json`. Step 3 of the egress and managed-retreat plan in `HANDOFF.md`; step 1 is `docs/access-constraints.md`, step 2 (second ways out) is under review in PR #15.

This is an educational comparison, not a prediction, not an official evacuation plan and not a buyout proposal. The costs are a screening estimate, not an appraisal, policy or legal analysis. Households and residents are synthetic: the simulator spreads each Genasys zone's population over its streets, so a "block" holds an expected number of households, not real homes. The analysis works at street-segment level with street names only; no parcels, owners or addresses are used. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count.

## Findings

- **Panoramic Hill fills the top of the ranking.** 15 of the top 15 blocks are in AC-155 (behind the Panoramic Wy choke); the first block elsewhere is Summit Ln (dead end – Summit Rd, BER-031) at rank 30. Panoramic Hill blocks score on every component at once: up to 4 dead-end chokes in series, no engine within 5 minutes in 80% of runs (parked cars on the lowest block of Panoramic Way, SOURCE_NOTES ER3), a choke that needs 32 minutes of capacity for the cars behind it, and households still home when the fire front arrived in up to 20% of runs (the Panoramic Hill fire is the only one of the four that reaches them). Summit Ln has more fire exposure (29% of runs) but one choke and engine access. The score is a model rule; ranked by fire exposure alone, the order changes (table below).
- **Almost all of a buyout's benefit is benefit 1: the people bought out are no longer there.** On the Panoramic Hill fire, the drop in people still home when the fire front arrived equals the number of bought-out residents still home in the run without the buyout, in every case (central median: Top-ranked blocks, about 50 households: 137; Top-ranked blocks, about 100 households: 201; Top-ranked blocks, about 250 households: 353; Top-ranked blocks, about 500 households: 408; Panoramic Hill upper streets: 346; Everything behind the foot of Panoramic Way: 408); everyone else changes by at most 3 people in any pair. The neighbors who stay behind the same choke are still home at the fire front in exactly the same numbers in almost every pair, because when a household is ready to leave does not depend on the streets. Benefit 2 is small and not consistent: the neighbors' cars cut off fall in every pair in 0 of 21 case-fire combinations, and their 90% out time falls in every pair in 0 of 21.
- **Panoramic Hill.** Buying out everything behind the foot of Panoramic Way (287 households, 1,011 residents) removes the 408 people the run without it left at home when the fire front arrived (central median; 76–822 over all severities and seeds) and lowers cars cut off in the whole model area from 265 to 93, better in 15 of 15 pairs. Screening cost $302M–$765M. The upper streets alone (190 households behind the second choke) remove 346 of those 408 for $219M–$497M; the 360 residents left below them see no change in people still home at the fire front and 19 → 19 cars cut off.
- **Only the largest top-ranked case reaches beyond Panoramic Hill**, onto Summit Ln, Summit Rd, Campus Dr, Grizzly Peak Bl, Ajax Pl, Wilson Ci, Hilgard Av, Olympus Av. It is also the only case with effects in every pair on the 1923 fire (people still home at the fire front 386 → 358 (15/0/0)) and the east-wind fire at night (still there, home or road, 166 → 95 (15/0/0)), again from the households bought out.
- **Engine reach turns on one block.** Buying out Panoramic Hill removes most of the hill residents no engine reaches within 5 minutes (1,296 → 416, median of 10 seed and day-or-night parking draws), because they are the people bought out. Buying out only the lowest block of Panoramic Way (5.4 households) changes nothing for the residents above it while its parked cars stay (988 → 988); with its parked cars gone too, they drop to 9 (better in 8 of 10). A parking rule on that block does the same without a buyout (SOURCE_NOTES ER2–ER3).
- **A second way out costs a hundredth as much or less and helps the people who stay; a buyout removes the people.** Step 2's top-ranked link, AC-160-N3 Panoramic Wy → Smyth Ln, frees 843 hill residents from behind every choke for $1.5M–$6.0M and lowers Panoramic Hill's cars cut off 178 → 167 (the City's Dwight Way–Dwight Place concept: 136), but leaves the 408 people still home at the fire front unchanged. Buying out the hill removes those people at $302M–$765M and 287 homes.

Cells read: central-severity median without → with the buyout, then (better / worse / no different) over all 15 same-seed pairs at low, central and high severity. Lower is better for every measure. All counts are synthetic people or cars in an illustrative fire, not predictions.

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Block (derived).** A block is one street segment of data/model/network.json on which js/sim.js places households (drivable, not a freeway or ramp, in an evacuation zone), in City Fire Zones 2–3 or, outside Berkeley, at 90 m elevation or higher (the simulator's hill proxy). Ranked if it holds at least 1 expected household. A block is labeled by its street and the streets at its two ends. 1,804 hill blocks hold 17,827 expected households; 1,574 have at least one and are ranked (the rest hold 71 households in all).
- **Fire runs (synthetic).** Every scenario in `js/scenarios.js` (1923 repeat; east wind, night; Panoramic Hill; east wind, weekday; northHills), low, central and high severity, seeds 1–5: 75 runs, DEFAULT_PLAN (first order 10 min after ignition, status-quo parking), each scenario's default time of day. The two east-wind scenarios share one fire and differ in time of day.
- **Expected households** (synthetic): zone population (Genasys, or 2020 Census where data/assumptions.json says so) spread over street length as js/sim.js does, / 2.37 persons per household; expected values.
- **Front** (derived from synthetic runs): share of runs (among runs where the block has at least one household) in which at least one household was still home when the fire front reached the block.
- **Ember** (derived from synthetic runs): same, when embers arrived.
- **Cut** (derived from synthetic runs): share of runs in which at least one of the block's cars was on a street when the fire front reached it, or ended the run on the road with no route to safety.
- **Engine** (derived from synthetic runs): share of runs in which no engine reaches the block within the City's 5-minute standard at ignition, status-quo parking (js/sim.js engineReachTimes; parked cars depend on seed and day or night).
- **Nest** (derived): number of dead-end access areas in series between the block and an exit (data/model/access-constraints.json; one-way chokes left out).
- **Choke load** (derived, capped at 1): vehicles behind the block's outermost dead-end choke ÷ the choke segment's capacity per lane (veh/h), i.e. hours of choke capacity the area's cars need.
- **Score** (model rule): 3 × front + 1 × ember + 2 × cut + 1 × engine + 0.5 × nest + 1 × choke (no calibration; the components are shown so a reader can re-sort).
- **Buyout (model rule for this harness).** `world.retreat` in `js/sim.js`: households on bought-out blocks are placed and take every random draw as before, then make no trip, give no ride and are not counted. Every other household and every non-resident car is the same draw with and without the buyout (`node tests/retreat-draws.mjs`), so each pair differs only by the bought-out households. Parked cars stay as drawn (they do not depend on households in the simulator); a sensitivity case removes them from bought-out blocks (Engine reach, below). Normal runs are unchanged: `tests/calibration.mjs` and `tests/plan-draws.mjs` print what they printed before.
- **Groups.** *Bought out*: households on the case's blocks. *Neighbors*: the other households behind the same outermost dead-end choke(s), the ones who share the way out. *Same zones*: the other households of the Genasys zones that hold bought-out blocks. *Area*: bought-out blocks plus neighbors; a car has left the area when it is on a street outside it or has reached safety. 90% and 100% out are minutes from the first order until that share of the group's evacuating cars (resident and non-resident, ordered or warned, not shadow) has left the area; a run that never gets there counts as slower than any that does. The region's clearance is the simulator's Time Study measure (cars starting in Order zones until they leave the order area). Cars cut off and cars on a street when the fire front reached it count residents' cars only.
- **Two benefits, separated.** (1) Residents bought out are no longer exposed, by definition: their exposure is reported from the run without the buyout. (2) Neighbors behind the same choke may get out faster because fewer cars share the street. The overall change in each pair is split into bought out + neighbors + elsewhere.

## Ranked blocks (top 40)

Components: shares of the 75 runs (front, ember, cut, engine), dead-end chokes in series (nest), and choke load (hours of choke capacity the cars behind the outermost choke need, capped at 1). Households are expected values (synthetic). Area: the outermost dead-end access area and its entrance street, with the entrance's clear width under nominal status-quo parking. "Between" names the streets at the two ends of the segment; "—" is a break between two segments of the same street in the County or OpenStreetMap file, with no cross street.

| # | Street | Between | Zone | Fire zone | Households | Front | Ember | Cut | Engine >5 min | Nest | Choke load | Area (entrance, clear width) | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Panoramic Pl | mid-street break – dead end | BER-058 | FZ2 | 2.3 | 19% | 20% | 19% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.5 |
| 2 | Panoramic Pl | Panoramic Wy – mid-street break | BER-058 | FZ2 | 10.1 | 17% | 20% | 20% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.5 |
| 3 | Panoramic Wy | mid-street break – dead end | BER-058 | FZ3 | 2.9 | 17% | 20% | 16% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.4 |
| 4 | Panoramic Pl | dead end – Panoramic Wy | BER-013 | hill (≥90 m) | 4.7 | 15% | 16% | 19% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 5 | Dwight Pl | Dwight Wy – dead end | BER-013 | hill (≥90 m) | 4.5 | 12% | 13% | 20% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.2 |
| 6 | Panoramic Wy | Dwight Wy – Panoramic Pl | BER-013 | hill (≥90 m) | 10.3 | 9% | 9% | 20% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.1 |
| 7 | Panoramic Wy | Dwight Wy – mid-street break | BER-058 | FZ3 | 31.4 | 20% | 20% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 8 | Panoramic Wy | Arden Rd – Dwight Wy | BER-058 | FZ3 | 22.1 | 20% | 20% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 9 | Panoramic Wy | Panoramic Pl – mid-street break | BER-058 | FZ3 | 7.7 | 20% | 20% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 10 | Panoramic Wy | mid-street break – mid-street break | BER-058 | FZ3 | 7.1 | 20% | 20% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 11 | Dwight Wy | Panoramic Wy – mid-street break | BER-058 | FZ3 | 4.2 | 19% | 20% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 12 | Panoramic Wy | mid-street break – mid-street break | BER-058 | FZ3 | 2.4 | 20% | 20% | 17% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 13 | Panoramic Wy | Panoramic Pl – mid-street break | BER-013 | hill (≥90 m) | 3.3 | 4% | 4% | 17% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.8 |
| 14 | Panoramic Wy | mid-street break – Panoramic Pl | BER-058 | FZ3 | 5.3 | 13% | 20% | 19% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.8 |
| 15 | Panoramic Wy | Dwight Wy – mid-street break | BER-013 | hill (≥90 m) | 13.7 | 13% | 13% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.8 |
| 16 | Dwight Wy | mid-street break – Dwight Pl | BER-013 | hill (≥90 m) | 6.2 | 13% | 16% | 19% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.8 |
| 17 | Arden Rd | Orchard Ln – mid-street break | BER-058 | FZ3 | 6.5 | 15% | 17% | 13% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.7 |
| 18 | Dwight Wy | Dwight Pl – Panoramic Wy | BER-013 | hill (≥90 m) | 3.9 | 8% | 9% | 17% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.5 |
| 19 | Panoramic Wy | mid-street break – dead end | BER-058 | FZ3 | 6.5 | 17% | 20% | 15% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.3 |
| 20 | Arden Rd | Panoramic Wy – Orchard Ln | BER-058 | FZ3 | 13.9 | 16% | 20% | 16% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.3 |
| 21 | Panoramic Wy | Orchard Ln – Arden Rd | BER-058 | FZ3 | 15.8 | 17% | 20% | 13% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.3 |
| 22 | Orchard Ln | Panoramic Wy – Arden Rd | BER-058 | FZ3 | 10.2 | 15% | 19% | 13% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.2 |
| 23 | Mosswood Rd | mid-street break – dead end | BER-058 | FZ2 | 7.8 | 13% | 13% | 13% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.1 |
| 24 | Mosswood Rd | Mosswood Ln – mid-street break | BER-058 | FZ3 | 7.7 | 8% | 12% | 9% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.9 |
| 25 | Panoramic Wy | Mosswood Rd – Orchard Ln | BER-058 | FZ3 | 1.6 | 7% | 15% | 7% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.8 |
| 26 | Panoramic Wy | mid-street break – Orchard Ln | BER-058 | FZ3 | 14.7 | 16% | 20% | 13% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.8 |
| 27 | Panoramic Wy | Orchard Ln – mid-street break | BER-058 | FZ3 | 17.9 | 16% | 17% | 12% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.7 |
| 28 | Mosswood Rd | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 10.9 | 12% | 15% | 12% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.6 |
| 29 | Mosswood Ln | Orchard Ln – Mosswood Rd | BER-058 | FZ3 | 16.3 | 11% | 13% | 13% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.6 |
| 30 | Summit Ln | dead end – Summit Rd | BER-031 | FZ2 | 3 | 29% | 40% | 28% | 20% | 1 | 0 | AC-031 (Summit Ln, 6 ft) | 2.5 |
| 31 | Orchard Ln | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 3.5 | 12% | 13% | 11% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.5 |
| 32 | Summit Rd | Grizzly Peak Bl – dead end | BER-031 | FZ2 | 12.2 | 31% | 40% | 35% | 0% | 1 | 0 | AC-099 (Summit Rd, 10 ft) | 2.5 |
| 33 | Panoramic Wy | Orchard Ln – Mosswood Rd | BER-058 | FZ3 | 2 | 13% | 16% | 7% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.5 |
| 34 | Summit Rd | Ajax Pl – mid-street break | BER-031 | FZ2 | 4.6 | 20% | 20% | 21% | 68% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.4 |
| 35 | Campus Dr | Parnassus Rd – mid-street break | BER-032 | FZ2 | 7.8 | 27% | 40% | 31% | 8% | 1 | 0 | AC-221 (Campus Dr, 11 ft) | 2.4 |
| 36 | Grizzly Peak Bl | Summit Rd – mid-street break | BER-031 | FZ2 | 10.2 | 40% | 40% | 40% | 0% | 0 | 0 | — | 2.4 |
| 37 | Ajax Pl | Summit Rd – dead end | BER-031 | FZ2 | 3.6 | 20% | 20% | 20% | 68% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.4 |
| 38 | Orchard Ln | Mosswood Ln – Panoramic Wy | BER-058 | FZ3 | 4 | 8% | 13% | 9% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.4 |
| 39 | Campus Dr | mid-street break – dead end | BER-032 | FZ2 | 5.3 | 25% | 37% | 31% | 8% | 1 | 0 | AC-221 (Campus Dr, 11 ft) | 2.3 |
| 40 | Summit Rd | Ajax Pl – mid-street break | BER-031 | FZ2 | 2 | 19% | 20% | 19% | 68% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.3 |

**Ranked by fire exposure alone** (front, ember and cut with the same weights, static factors left out), the top 15 are:

| # | Street | Between | Zone | Households | Front | Ember | Cut | Exposure score | Rank by full score |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Grizzly Peak Bl | Summit Rd – mid-street break | BER-031 | 10.2 | 40% | 40% | 40% | 2.4 | 36 |
| 2 | Summit Rd | Grizzly Peak Bl – dead end | BER-031 | 12.2 | 31% | 40% | 35% | 2 | 32 |
| 3 | Le Conte Av | Hearst Av / Arch St / University House Wy – Scenic Av / Ridge Rd | BER-012 | 161.4 | 37% | 40% | 20% | 1.9 | 59 |
| 4 | Hilgard Av | Euclid Av – Leroy Av | BER-040 | 57.6 | 33% | 43% | 23% | 1.9 | 63 |
| 5 | Senior Av | Harvard Ci / Fairlawn Dr – Grizzly Peak Bl | BER-031 | 11.7 | 31% | 37% | 29% | 1.9 | 64 |
| 6 | Summit Rd | Summit Ln – Grizzly Peak Bl | BER-031 | 3.7 | 31% | 40% | 27% | 1.9 | 69 |
| 7 | Arch St | Virginia St – Le Conte Av / Hearst Av / University House Wy | BER-012 | 218.2 | 36% | 37% | 20% | 1.9 | 66 |
| 8 | Le Conte Av | Scenic Av / Ridge Rd – Euclid Av | BER-040 | 69.3 | 33% | 40% | 23% | 1.9 | 67 |
| 9 | Grizzly Peak Bl | Senior Av – Summit Rd | BER-031 | 5.1 | 31% | 39% | 27% | 1.8 | 70 |
| 10 | Summit Ln | dead end – Summit Rd | BER-031 | 3 | 29% | 40% | 28% | 1.8 | 30 |
| 11 | Grizzly Peak Bl | Summit Rd – Summit Rd | BER-031 | 1.8 | 32% | 39% | 24% | 1.8 | 72 |
| 12 | Campus Dr | Parnassus Rd – mid-street break | BER-032 | 7.8 | 27% | 40% | 31% | 1.8 | 35 |
| 13 | Cedar St | Euclid Av – Leroy Av | BER-040 | 69.8 | 31% | 45% | 20% | 1.8 | 74 |
| 14 | Wilson Ci | Olympus Av – dead end | BER-031 | 2.9 | 28% | 39% | 27% | 1.8 | 41 |
| 15 | Le Conte Av | Leroy Av – La Loma Av | BER-040 | 48.3 | 31% | 37% | 23% | 1.7 | 75 |

## Buyout cases

| Case | Blocks | Households | Residents | Streets | Behind a dead-end choke (residents) | Outermost areas: residents before → after | Fires that threaten it |
|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 7 | 66 | 224 | Panoramic Pl, Panoramic Wy, Dwight Pl | 224 | AC-155 Panoramic Wy: 1,011 → 787 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 100 households | 8 | 88 | 306 | Panoramic Pl, Panoramic Wy, Dwight Pl | 306 | AC-155 Panoramic Wy: 1,011 → 705 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 250 households | 21 | 185 | 634 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd | 634 | AC-155 Panoramic Wy: 1,011 → 377 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 500 households | 44 | 365 | 1,187 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd, Orchard Ln, Mosswood Rd, Mosswood Ln +8 | 1,161 | AC-155 Panoramic Wy: 1,011 → 20; AC-031 Summit Ln: 8 → 0; AC-099 Summit Rd: 31 → 0; AC-173 Summit Rd: 39 → 9; AC-221 Campus Dr: 35 → 0; AC-060 Olympus Av: 34 → 5; AC-002 Hilgard Av: 38 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday,  |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 22 | 190 | 653 | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd, Dwight Wy, Dwight Pl | 653 | AC-155 Panoramic Wy: 1,011 → 358 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 33 | 287 | 1,011 | Panoramic Wy, Mosswood Rd, Orchard Ln, Panoramic Pl, Mosswood Ln, Arden Rd, Dwight Wy, Dwight Pl | 1,011 | AC-155 Panoramic Wy: 1,011 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |

A fire threatens a case if, in any of its runs, a bought-out block's zone was ordered or warned or embers reached it. Bought-out households vary by seed around the expected count (the simulator draws whole households); the runs below removed the households the seed placed there.

## Evacuation effect, fire on

Cells: central-severity median without → with the buyout, then (better / worse / no different) over all same-seed pairs. "Every pair" lists the measures better in every pair.

### Benefit 1: the bought-out residents (run without the buyout)

| Case | Fire | Bought-out residents | Still home when the fire front arrived | … when embers arrived | Their cars on a street when the fire front reached it | Their cars cut off at the end |
|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 223 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | east wind, night | 223 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | Panoramic Hill | 223 | 137 (31–199) | 185 (100–204) | 77 | 75 |
| Top-ranked blocks, about 50 households | east wind, weekday | 223 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | 1923 repeat | 303 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | east wind, night | 303 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | Panoramic Hill | 303 | 201 (47–277) | 268 (149–287) | 100 | 83 |
| Top-ranked blocks, about 100 households | east wind, weekday | 303 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | 1923 repeat | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | east wind, night | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | Panoramic Hill | 630 | 353 (76–571) | 533 (277–604) | 175 | 156 |
| Top-ranked blocks, about 250 households | east wind, weekday | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 500 households | 1923 repeat | 1,187 | 28 (14–59) | 36 (28–81) | 14 | 16 |
| Top-ranked blocks, about 500 households | east wind, night | 1,187 | 71 (5–156) | 152 (59–168) | 29 | 25 |
| Top-ranked blocks, about 500 households | Panoramic Hill | 1,187 | 408 (76–811) | 782 (292–948) | 202 | 177 |
| Top-ranked blocks, about 500 households | east wind, weekday | 1,187 | 88 (17–156) | 152 (62–166) | 31 | 26 |
| Top-ranked blocks, about 500 households | undefined | 1,187 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 652 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 652 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 652 | 346 (71–583) | 550 (263–623) | 173 | 157 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 652 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 1,010 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 1,010 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 1,010 | 408 (76–822) | 789 (292–962) | 202 | 177 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 1,010 | 0 (0–0) | 0 (0–0) | 0 | 0 |

Central median, then the range over all severities and seeds. With the buyout these are zero by definition.

### Benefit 2: the neighbors behind the same choke

| Case | Fire | Neighbors | Still home when the fire front arrived | … when embers arrived | Cars on a street when the fire front reached it | Cars cut off at the end | 90% out, min | 100% out, min | Area (all its cars) 90% out |
|---|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 787 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 136 → 125 (12/2/1) | 189 → 179 (5/5/5) | 136 → 125 (11/4/0) |
| Top-ranked blocks, about 50 households | east wind, night | 787 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (5/5/5) | 135 → 135 (8/5/2) | 94 → 93 (9/6/0) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 787 | 265 → 265 (1/0/14) | 607 → 602 (1/0/14) | 122 → 118 (8/5/2) | 101 → 101 (1/3/11) | not all out → not all out (2/2/11) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 50 households | east wind, weekday | 787 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (10/2/3) | 178 → 177 (9/1/5) | 111 → 111 (11/4/0) |
| Top-ranked blocks, about 100 households | 1923 repeat | 706 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 136 → 121 (12/0/3) | 173 → 173 (7/3/5) | 136 → 121 (12/3/0) |
| Top-ranked blocks, about 100 households | east wind, night | 706 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 94 → 94 (1/4/10) | 135 → 135 (7/3/5) | 94 → 94 (9/6/0) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 706 | 201 → 201 (1/0/14) | 524 → 519 (1/0/14) | 100 → 99 (4/7/4) | 92 → 92 (1/4/10) | not all out → not all out (1/4/10) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 100 households | east wind, weekday | 706 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (7/2/6) | 173 → 173 (3/2/10) | 111 → 109 (6/9/0) |
| Top-ranked blocks, about 250 households | 1923 repeat | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 132 → 118 (12/1/2) | 173 → 164 (7/3/5) | 136 → 112 (14/1/0) |
| Top-ranked blocks, about 250 households | east wind, night | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 92 → 92 (3/9/3) | 135 → 135 (7/4/4) | 94 → 92 (9/6/0) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 379 | 52 → 52 (0/0/15) | 256 → 256 (0/0/15) | 25 → 24 (3/6/6) | 20 → 20 (1/1/13) | not all out → not all out (2/2/11) | not all out → not all out (3/0/12) | not all out → 119 (8/0/7) |
| Top-ranked blocks, about 250 households | east wind, weekday | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (5/8/2) | 165 → 165 (2/4/9) | 111 → 107 (10/3/2) |
| Top-ranked blocks, about 500 households | 1923 repeat | 33 | 7 → 7 (0/0/15) | 9 → 9 (0/0/15) | 2 → 2 (1/1/13) | 1 → 1 (0/0/15) | 172 → 113 (6/1/8) | not all out → not all out (2/0/13) | 137 → 88 (11/4/0) |
| Top-ranked blocks, about 500 households | east wind, night | 33 | 2 → 2 (0/0/15) | 5 → 5 (0/0/15) | 1 → 1 (0/0/15) | 1 → 1 (0/0/15) | 98 → 98 (4/2/9) | not all out → not all out (1/5/9) | 102 → 98 (10/3/2) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 33 | 0 → 0 (0/0/15) | 7 → 7 (0/0/15) | 0 → 0 (1/0/14) | 0 → 0 (0/0/15) | 103 → 103 (5/0/10) | 103 → 103 (5/0/10) | not all out → 86 (10/0/5) |
| Top-ranked blocks, about 500 households | east wind, weekday | 33 | 2 → 2 (0/0/15) | 5 → 5 (0/0/15) | 1 → 1 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (5/3/7) | 118 → 118 (2/2/11) | 122 → 79 (11/1/3) |
| Top-ranked blocks, about 500 households | undefined | 33 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 85 → 85 (6/2/7) | 85 → 85 (6/2/7) | 91 → 85 (9/6/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 132 → 119 (13/1/1) | 166 → 164 (7/5/3) | 136 → 118 (13/2/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 94 → 94 (4/7/4) | 135 → 135 (7/4/4) | 94 → 94 (6/8/1) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 360 | 62 → 62 (0/0/15) | 237 → 237 (0/0/15) | 26 → 21 (3/6/6) | 19 → 19 (1/1/13) | not all out → not all out (2/2/11) | not all out → not all out (3/0/12) | not all out → not all out (7/0/8) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 115 → 115 (8/6/1) | 165 → 165 (8/4/3) | 111 → 107 (9/6/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 | no one is left behind the choke | | | | | | |

### Whole model area

| Case | Fire | People still there when the fire front arrived (home or road) | … at home | … when embers arrived | Cars cut off at the end | Region 90% out, min | Region 100% out, min | Same zones: still home at the fire front |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 431 → 436 (5/3/7) | 386 → 386 (3/3/9) | 4,569 → 4,509 (6/8/1) | 95 → 95 (7/1/7) | 105 → 104 (14/1/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | east wind, night | 166 → 166 (3/2/10) | 161 → 161 (0/0/15) | 4,340 → 4,348 (6/8/1) | 32 → 32 (3/2/10) | 92 → 92 (4/5/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 3,391 → 3,215 (15/0/0) | 3,282 → 3,145 (15/0/0) | 12,827 → 12,582 (15/0/0) | 265 → 187 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 441 → 441 (1/0/14) |
| Top-ranked blocks, about 50 households | east wind, weekday | 205 → 203 (5/3/7) | 201 → 201 (1/0/14) | 4,996 → 4,984 (6/9/0) | 41 → 41 (1/3/11) | 105 → 105 (5/4/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | 1923 repeat | 431 → 431 (6/2/7) | 386 → 386 (4/0/11) | 4,569 → 4,703 (5/10/0) | 95 → 95 (6/2/7) | 105 → 104 (14/1/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | east wind, night | 166 → 166 (5/0/10) | 161 → 161 (0/0/15) | 4,340 → 4,335 (8/4/3) | 32 → 32 (1/3/11) | 92 → 92 (4/5/6) | not all out → not all out (0/1/14) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 3,391 → 3,151 (15/0/0) | 3,282 → 3,081 (15/0/0) | 12,827 → 12,530 (15/0/0) | 265 → 174 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 374 → 370 (1/0/14) |
| Top-ranked blocks, about 100 households | east wind, weekday | 205 → 209 (3/5/7) | 201 → 201 (1/2/12) | 4,996 → 5,000 (9/6/0) | 41 → 41 (4/2/9) | 105 → 105 (4/2/9) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | 1923 repeat | 431 → 431 (7/1/7) | 386 → 386 (4/1/10) | 4,569 → 4,566 (6/9/0) | 95 → 96 (7/2/6) | 105 → 103 (15/0/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, night | 166 → 166 (3/1/11) | 161 → 161 (0/0/15) | 4,340 → 4,343 (8/6/1) | 32 → 32 (4/2/9) | 92 → 92 (6/8/1) | not all out → not all out (0/1/14) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 3,391 → 2,952 (15/0/0) | 3,282 → 2,929 (15/0/0) | 12,827 → 12,174 (15/0/0) | 265 → 114 (15/0/0) | not all out → 109 (10/0/5) | not all out → not all out (3/0/12) | 223 → 223 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, weekday | 205 → 205 (2/4/9) | 201 → 201 (1/1/13) | 4,996 → 4,992 (8/7/0) | 41 → 41 (4/1/10) | 105 → 105 (8/3/4) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 500 households | 1923 repeat | 431 → 407 (15/0/0) | 386 → 358 (15/0/0) | 4,569 → 4,427 (14/1/0) | 95 → 78 (15/0/0) | 105 → 102 (15/0/0) | not all out → not all out (0/0/15) | 185 → 185 (3/1/11) |
| Top-ranked blocks, about 500 households | east wind, night | 166 → 95 (15/0/0) | 161 → 95 (15/0/0) | 4,340 → 4,171 (15/0/0) | 32 → 7 (14/0/1) | 92 → 92 (12/1/2) | not all out → not all out (4/1/10) | 78 → 78 (0/0/15) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 3,391 → 2,865 (15/0/0) | 3,282 → 2,844 (15/0/0) | 12,827 → 11,904 (15/0/0) | 265 → 93 (15/0/0) | not all out → 107 (10/0/5) | not all out → not all out (3/0/12) | 173 → 173 (0/0/15) |
| Top-ranked blocks, about 500 households | east wind, weekday | 205 → 119 (15/0/0) | 201 → 119 (15/0/0) | 4,996 → 4,828 (15/0/0) | 41 → 18 (15/0/0) | 105 → 105 (13/0/2) | not all out → not all out (4/0/11) | 109 → 109 (0/1/14) |
| Top-ranked blocks, about 500 households | undefined | 273 → 273 (2/4/9) | 254 → 254 (0/1/14) | 3,510 → 3,522 (8/7/0) | 19 → 19 (1/3/11) | 92 → 92 (5/6/4) | not all out → not all out (1/2/12) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 431 → 431 (7/0/8) | 386 → 386 (4/1/10) | 4,569 → 4,588 (6/8/1) | 95 → 95 (6/2/7) | 105 → 103 (15/0/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 166 → 166 (2/2/11) | 161 → 161 (0/0/15) | 4,340 → 4,329 (7/5/3) | 32 → 32 (4/2/9) | 92 → 92 (4/7/4) | not all out → not all out (0/1/14) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 3,391 → 2,950 (15/0/0) | 3,282 → 2,927 (15/0/0) | 12,827 → 12,159 (15/0/0) | 265 → 113 (15/0/0) | not all out → 111 (10/0/5) | not all out → not all out (3/0/12) | 230 → 230 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 205 → 203 (4/3/8) | 201 → 201 (2/1/12) | 4,996 → 4,989 (8/7/0) | 41 → 41 (3/2/10) | 105 → 105 (6/3/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 431 → 436 (6/3/6) | 386 → 386 (3/2/10) | 4,569 → 4,600 (5/9/1) | 95 → 95 (7/2/6) | 105 → 102 (15/0/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 166 → 166 (1/5/9) | 161 → 161 (0/0/15) | 4,340 → 4,338 (6/7/2) | 32 → 31 (4/1/10) | 92 → 92 (6/4/5) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 3,391 → 2,865 (15/0/0) | 3,282 → 2,844 (15/0/0) | 12,827 → 11,933 (15/0/0) | 265 → 93 (15/0/0) | not all out → 107 (10/0/5) | not all out → not all out (3/0/12) | 173 → 173 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 205 → 205 (3/5/7) | 201 → 201 (0/2/13) | 4,996 → 4,990 (5/9/1) | 41 → 41 (1/5/9) | 105 → 105 (7/3/5) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |

### Where the change comes from

Median over same-seed pairs of the change in people still home when the fire front arrived and in cars cut off, split into the bought-out residents (benefit 1), the neighbors (benefit 2) and everyone else. Central severity; "elsewhere" range over all pairs.

| Case | Fire | Still home at the fire front: total = bought out + neighbors + elsewhere | Elsewhere, range | Cars cut off: total = bought out + neighbors + elsewhere | Elsewhere, range |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 0 = 0 + 0 + 0 | -12 to 8 | 0 = 0 + 0 + 0 | -38 to 1 |
| Top-ranked blocks, about 50 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -4 to 2 |
| Top-ranked blocks, about 50 households | Panoramic Hill | -137 = -137 + 0 + 0 | -2 to 1 | -74 = -75 + 0 + 0 | -1 to 4 |
| Top-ranked blocks, about 50 households | east wind, weekday | 0 = 0 + 0 + 0 | -5 to 0 | 0 = 0 + 0 + 0 | -4 to 4 |
| Top-ranked blocks, about 100 households | 1923 repeat | 0 = 0 + 0 + 0 | -26 to 0 | 0 = 0 + 0 + 0 | -40 to 5 |
| Top-ranked blocks, about 100 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 2 |
| Top-ranked blocks, about 100 households | Panoramic Hill | -201 = -201 + 0 + 0 | -2 to 1 | -82 = -83 + 0 + 0 | -2 to 3 |
| Top-ranked blocks, about 100 households | east wind, weekday | 0 = 0 + 0 + 0 | -3 to 4 | 0 = 0 + 0 + 0 | -3 to 1 |
| Top-ranked blocks, about 250 households | 1923 repeat | 0 = 0 + 0 + 0 | -21 to 10 | 0 = 0 + 0 + 0 | -58 to 2 |
| Top-ranked blocks, about 250 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 2 |
| Top-ranked blocks, about 250 households | Panoramic Hill | -353 = -353 + 0 + 0 | -2 to 1 | -156 = -156 + 0 + 0 | -2 to 2 |
| Top-ranked blocks, about 250 households | east wind, weekday | 0 = 0 + 0 + 0 | -5 to 2 | 0 = 0 + 0 + 0 | -4 to 1 |
| Top-ranked blocks, about 500 households | 1923 repeat | -28 = -28 + 0 + 0 | -40 to 9 | -17 = -16 + 0 + 0 | -57 to 4 |
| Top-ranked blocks, about 500 households | east wind, night | -71 = -71 + 0 + 0 | -1 to 1 | -25 = -25 + 0 + 0 | -3 to 2 |
| Top-ranked blocks, about 500 households | Panoramic Hill | -408 = -408 + 0 + 0 | -2 to 1 | -177 = -177 + 0 + 0 | -2 to 4 |
| Top-ranked blocks, about 500 households | east wind, weekday | -88 = -88 + 0 + 0 | -4 to 2 | -26 = -26 + 0 + 0 | -6 to 1 |
| Top-ranked blocks, about 500 households | undefined | 0 = 0 + 0 + 0 | 0 to 2 | 0 = 0 + 0 + 0 | -2 to 4 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 0 = 0 + 0 + 0 | -43 to 4 | 0 = 0 + 0 + 0 | -53 to 7 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -3 to 3 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | -346 = -346 + 0 + 0 | -3 to 1 | -157 = -157 + 0 + 0 | -2 to 2 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 0 = 0 + 0 + 0 | -3 to 7 | 0 = 0 + 0 + 0 | -3 to 4 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 = 0 + 0 + 0 | -17 to 9 | 0 = 0 + 0 + 0 | -48 to 1 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -3 to 1 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | -408 = -408 + 0 + 0 | -2 to 1 | -177 = -177 + 0 + 0 | -4 to 2 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 5 | 0 = 0 + 0 + 0 | -1 to 2 |

### Effects that hold in every same-seed pair

- Top-ranked blocks, about 50 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors frontHome (1 of 15), neighbors emberHome (1 of 15), area clearP90 (5 of 15), same zones frontHome (1 of 15), same zones emberHome (1 of 15).
- Top-ranked blocks, about 50 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (1 of 15).
- Top-ranked blocks, about 100 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (4 of 15), neighbors clearP90 (12 of 15).
- Top-ranked blocks, about 100 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: overall frontPeople (5 of 15).
- Top-ranked blocks, about 100 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors frontHome (1 of 15), neighbors emberHome (1 of 15), area clearP90 (5 of 15), same zones frontHome (1 of 15), same zones emberHome (1 of 15).
- Top-ranked blocks, about 100 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, 1923 repeat (15 pairs): better in every pair: overall clearP90. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), neighbors clearP100 (3 of 15), area clearP90 (8 of 15), area clearP100 (5 of 15).
- Top-ranked blocks, about 250 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 500 households, 1923 repeat (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall vehNoRoute, overall clearP90. Never worse, better in some: neighbors clearP100 (2 of 15), area clearP100 (5 of 15).
- Top-ranked blocks, about 500 households, east wind, night (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehFireFront. Never worse, better in some: overall vehNoRoute (14 of 15), area clearP100 (8 of 15).
- Top-ranked blocks, about 500 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), neighbors vehFireFront (1 of 15), neighbors clearP90 (5 of 15), neighbors clearP100 (5 of 15), area clearP90 (10 of 15), area clearP100 (6 of 15).
- Top-ranked blocks, about 500 households, east wind, weekday (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (13 of 15), overall clearP100 (4 of 15), area clearP100 (7 of 15).
- Top-ranked blocks, about 500 households, undefined (15 pairs): better in every pair: area clearP100. Never worse, better in some: none.
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), 1923 repeat (15 pairs): better in every pair: overall clearP90. Never worse, better in some: overall frontPeople (7 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), neighbors clearP100 (3 of 15), area clearP90 (7 of 15), area clearP100 (5 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), 1923 repeat (15 pairs): better in every pair: overall clearP90, area clearP90, area clearP100. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, night (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), area clearP90 (9 of 15), area clearP100 (6 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, weekday (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: none.

Measure names: frontPeople and frontHome, people still there (home or road) and at home when the fire front arrived; emberPeople, when embers arrived; vehNoRoute, cars cut off at the end; vehFireFront, cars on a street when the fire front reached it; clearP90 and clearP100, 90% and 100% out.

## Engine reach

Synthetic residents of Berkeley's Fire Zones 2–3 whose street no engine reaches within the City's 5-minute standard at ignition (js/sim.js engine reach), seeds 1–5, weekday (S4) and night (S6) parking: median of 10 without → with (better / worse of 10). "Parked cars kept" is the main rule; "cleared" also removes the parked cars on bought-out blocks (model rule, sensitivity).

| Case | Bought-out residents beyond 5 min | Neighbors beyond 5 min, parked cars kept | … cleared | All hill residents beyond 5 min, kept | … cleared |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 223 | 768 → 768 (0/0) | 768 → 768 (0/0) | 1,296 → 1,074 (8/0) | 1,296 → 1,074 (8/0) |
| Top-ranked blocks, about 100 households | 303 | 685 → 685 (0/0) | 685 → 685 (0/0) | 1,296 → 1,017 (8/0) | 1,296 → 1,017 (8/0) |
| Top-ranked blocks, about 250 households | 630 | 358 → 358 (0/0) | 358 → 358 (0/0) | 1,296 → 727 (8/0) | 1,296 → 727 (8/0) |
| Top-ranked blocks, about 500 households | 1,008 | 4 → 4 (0/0) | 4 → 4 (0/0) | 1,296 → 401 (10/0) | 1,296 → 401 (10/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 652 | 339 → 339 (0/0) | 339 → 339 (0/0) | 1,296 → 708 (8/0) | 1,296 → 708 (8/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 988 | 0 → 0 (0/0) | 0 → 0 (0/0) | 1,296 → 416 (8/0) | 1,296 → 416 (8/0) |
| Sensitivity: the lowest block of Panoramic Way only (Panoramic Wy, 5.4 households; not run with the fire) | 0 | 988 → 988 (0/0) | 988 → 9 (8/0) | 1,296 → 1,296 (0/0) | 1,296 → 421 (8/0) |

## Costs and losses (screening estimate)

A screening estimate from public figures and labeled assumptions, not an appraisal, policy or legal analysis, and not a statement of what any owner would accept. One synthetic household is counted as one housing unit. Housing units lost equal households bought out; residents displaced are households × 2.37 (synthetic). Rounded to $0.1M.

| Case | Housing units lost | Residents displaced | Acquisition | Relocation | Demolition and restoration | Total | Per household | Notes |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 66 | 224 | $79.1M–$161M | $0k–$2.9M | $1.3M–$6.6M | $80.5M–$171M | $1.2M–$2.6M | 19 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Top-ranked blocks, about 100 households | 88 | 306 | $97.5M–$219M | $0k–$3.9M | $1.8M–$8.8M | $99.3M–$232M | $1.1M–$2.6M | 19 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Top-ranked blocks, about 250 households | 185 | 634 | $210M–$456M | $0k–$8.1M | $3.7M–$18.5M | $214M–$482M | $1.2M–$2.6M | 47 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Top-ranked blocks, about 500 households | 365 | 1,187 | $367M–$856M | $0k–$16.0M | $7.3M–$36.5M | $375M–$909M | $1.0M–$2.5M | 47 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 190 | 653 | $215M–$470M | $0k–$8.3M | $3.8M–$19.0M | $219M–$497M | $1.1M–$2.6M | 47 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 287 | 1,011 | $296M–$724M | $0k–$12.6M | $5.7M–$28.7M | $302M–$765M | $1.1M–$2.7M | 47 households in block groups whose median is top-coded at $2,000,001 (high end low); 2 in block groups with no median (case average used) |
| Sensitivity: the lowest block of Panoramic Way only | 5 | 20 | $4.6M–$14.2M | $0k–$200k | $100k–$500k | $4.7M–$15.0M | $863k–$2.8M | — |

- **Acquisition (sourced statistic, assumption in its use).** Each household at the ACS median value of owner-occupied homes in its block group, low = median − margin of error, high = median + margin of error. A buyout pays the appraised value of each property, which the block-group median does not give.
- **Relocation (sourced figures, assumption in their use).** $0–$43,890 per household. Owner-occupants who sell voluntarily are not displaced persons under the Uniform Relocation Act (49 CFR 24.101(b)), so the low end assumes every household is one and receives nothing. The high end assumes a program pays every household the URA homeowner replacement housing payment maximum ($41,200, 49 CFR 24.401(b)) plus an 8-room fixed move ($2,690). Tenants who must move are covered by the Act; their entitlement, up to $9,570 rental assistance (49 CFR 24.402(b)) plus a move ($12,260 at most), lies inside the range. The split between owners and renters (ACS B25003) could not be retrieved, so the range is wide.
- **Demolition and site restoration (sourced low, assumed high).** $20,000–$100,000 per household: the Delaware County (PA) program's $20,000–$50,000 range, high end doubled for Bay Area costs and hillside access.
- Left out: closing, appraisal and legal costs, program administration, lost property-tax revenue, maintenance of the open land, and any effect on the value of neighboring homes.

## Retreat or a second way out

Step 2 figures come from data/model/egress-candidates.json (step 2, PR #15; rerun on this network, SOURCE_NOTES EG14), built 2026-11-01. They come from a different harness (step 2 counts every car starting in the area, these tables count residents' cars) and the same fires, severities and seeds; the Panoramic Hill fire, first order 10 minutes after ignition, central-severity medians.

| Option | Kind | Residents protected or freed | Effect on the residents who stay (Panoramic Hill fire) | Homes lost | Screening cost |
|---|---|---|---|---|---|
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | buyout | 1,011 bought out; behind the foot of Panoramic Way 1,011 → 0 | neighbors' cars cut off 0 → 0 (0/0/15); still home at the fire front 0 → 0 (0/0/15) | 287 | $302M–$765M |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | buyout | 653 bought out; behind the foot of Panoramic Way 1,011 → 358 | neighbors' cars cut off 19 → 19 (1/1/13); still home at the fire front 62 → 62 (0/0/15) | 190 | $219M–$497M |
| AC-160-N3 Panoramic Wy → Smyth Ln (88 m, 21% average grade) | second way out | 843 hill residents freed from behind every choke; AC-155 1,011 → 222 behind a choke | area cars cut off 178 → 167 (14/0/1); still home at the fire front 408 → 408 | 1 building in the corridor | $1.5M–$6.0M |
| AC-134-N2 Smyth Ln → Dwight Wy (92 m, 27.4% average grade) | second way out | 843 hill residents freed from behind every choke; AC-155 1,011 → 222 behind a choke | area cars cut off 178 → 162 (14/0/1); still home at the fire front 408 → 405 | 1 building in the corridor | $1.6M–$7.4M |
| CITY-1 Dwight Wy → Dwight Pl (174 m, 40.2% average grade) | second way out | 802 hill residents freed from behind every choke; AC-155 1,011 → 210 behind a choke | area cars cut off 178 → 136 (15/0/0); still home at the fire front 408 → 401 | 0 buildings in the corridor | $1.3M–$10.6M |

Other areas with both a buyout block in the cases above and a step 2 link: AC-134-N1 (Smyth Ln → Panoramic Wy, frees 484, $2.9M–$10.2M); AC-155-O1 (Mosswood Rd → Canyon Rd, frees 337, $1.3M–$6.8M); AC-156-N3 (Mosswood Rd → Canyon Rd, frees 309, $2.3M–$9.4M); AC-155-N3 (Panoramic Wy → Smyth Ln, frees 277, $2.9M–$11.4M); AC-002-N1 (Hilgard Av → La Loma Av, frees 39, $2.0M–$6.1M).

## Limits

- Synthetic households on street segments, not homes: a block's count is the zone's population spread by street length. The rank of two neighboring blocks can turn on that allocation. A real program would start from parcels and owners willing to sell, which this analysis does not use.
- The fires are illustrative and the traffic model is uncalibrated for weekday peaks (HANDOFF.md, calibration). Results compare runs; they do not estimate real outcomes.
- When a household is ready to leave does not depend on the streets, so a buyout cannot get the remaining residents out of the house sooner; it only shortens the queue once they are on the road. Measures of people still home move only through riders and cars waiting for room on a full street.
- Parked cars do not depend on households in the simulator, so the main runs keep them on bought-out blocks; the engine-reach sensitivity shows what clearing them would do.
- Bought-out land is assumed to stay empty: no new homes, no ADUs, no parking. Future growth is off in every run.
- Costs use block-group medians, which are top-coded at $2,000,001 and include homes far from the bought-out blocks. Willingness to sell, eminent domain (not assumed), federal cost shares and tax effects are outside this screening.

## Sources

- American Community Survey 2020–2024 5-year, table B25077 (median value of owner-occupied homes), by block group, via the Census Reporter API; block group of each segment's midpoint from TIGERweb (Tracts_Blocks layer 1). https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077. Retrieved 2026-11-03. Category: sourced (block-group statistics); applying a median to every home is an assumption.
- 49 CFR 24.401(b): "The replacement housing payment for an eligible 90-day homeowner-occupant may not exceed $41,200". https://www.law.cornell.edu/cfr/text/49/24.401. Retrieved 2026-11-01. Category: sourced.
- 49 CFR 24.402(b): rental assistance for a displaced tenant "not to exceed $9,570". https://www.law.cornell.edu/cfr/text/49/24.402. Retrieved 2026-11-01. Category: sourced.
- 49 CFR 24.101(b): in a voluntary acquisition (no eminent domain, the owner told so in writing) the relocation provisions apply to tenants who must move, not to the owner-occupant who sells. https://www.law.cornell.edu/cfr/text/49/24.101. Retrieved 2026-11-01. Category: sourced.
- FHWA, Fixed Residential Moving Cost Schedule, Federal Register Vol. 86, No. 141 (July 27, 2021), FR Doc. 2021-15930, California, occupant owns furniture: 4 rooms $1,475, 8 rooms $2,690. https://www.govinfo.gov/content/pkg/FR-2021-07-27/html/2021-15930.htm. Retrieved 2026-11-01. Category: sourced.
- Delaware County (PA) Office of Housing and Community Development, Demolition Program guidelines (file dated 2025-08): "Residential demolition and site restoration costs range from $20,000 to $50,000." High end doubled for Bay Area costs and hillside access (assumption). https://delcopa.gov/sites/default/files/2025-08/DemolitionFundProgramGuidelines.pdf. Retrieved 2026-11-01. Category: sourced low; high is an assumption.
- Access-constrained areas: `data/model/access-constraints.json` (`tools/access-constraints.mjs`, SOURCE_NOTES AC1–AC15).
- Engine reach: `js/sim.js` engineReachTimes (SOURCE_NOTES ER1–ER3).
- Step 2: data/model/egress-candidates.json (step 2, PR #15; rerun on this network, SOURCE_NOTES EG14), built 2026-11-01.
