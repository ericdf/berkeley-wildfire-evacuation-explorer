# Managed retreat: which blocks a voluntary buyout would target, and what it would change

Built 2026-11-01 by `node tools/retreat-sim.mjs` (this report from `tools/retreat-report.mjs`, costs from `tools/retreat-costs.mjs`). Machine-readable results: `data/model/retreat.json`. Step 3 of the egress and managed-retreat plan in `HANDOFF.md`; step 1 is `docs/access-constraints.md`, step 2 (second ways out) is under review in PR #15.

This is an educational comparison, not a prediction, not an official evacuation plan and not a buyout proposal. The costs are a screening estimate, not an appraisal, policy or legal analysis. Households and residents are synthetic: the simulator spreads each Genasys zone's population over its streets, so a "block" holds an expected number of households, not real homes. The analysis works at street-segment level with street names only; no parcels, owners or addresses are used. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count.

## Findings

- **Panoramic Hill fills the top of the ranking.** 15 of the top 15 blocks are in AC-155 (behind the Panoramic Wy choke); the first block elsewhere is Summit Rd (mid-street break – mid-street break, BER-031) at rank 24. Panoramic Hill blocks score on every component at once: up to 4 dead-end chokes in series, no engine within 5 minutes in 80% of runs (parked cars on the lowest block of Panoramic Way, SOURCE_NOTES ER3), a choke that needs 32 minutes of capacity for the cars behind it, and households still home when the fire front arrived in up to 25% of runs (the Panoramic Hill fire is the only one of the four that reaches them). Summit Rd has more fire exposure (50% of runs) but one choke and engine access. The score is a model rule; ranked by fire exposure alone, the order changes (table below).
- **Almost all of a buyout's benefit is benefit 1: the people bought out are no longer there.** On the Panoramic Hill fire, the drop in people still home when the fire front arrived equals the number of bought-out residents still home in the run without the buyout, in every case (central median: Top-ranked blocks, about 50 households: 135; Top-ranked blocks, about 100 households: 199; Top-ranked blocks, about 250 households: 353; Top-ranked blocks, about 500 households: 408; Panoramic Hill upper streets: 346; Everything behind the foot of Panoramic Way: 408); everyone else changes by at most 1 person in any pair. The neighbors who stay behind the same choke are still home at the fire front in exactly the same numbers in almost every pair, because when a household is ready to leave does not depend on the streets. Benefit 2 is small and not consistent: the neighbors' cars cut off fall in every pair in 0 of 20 case-fire combinations, and their 90% out time falls in every pair in 0 of 20.
- **Panoramic Hill.** Buying out everything behind the foot of Panoramic Way (427 households, 1,011 residents) removes the 408 people the run without it left at home when the fire front arrived (central median; 76–822 over all severities and seeds) and lowers cars cut off in the whole model area from 263 to 93, better in 15 of 15 pairs. Screening cost $428M–$1149M. The upper streets alone (276 households behind the second choke) remove 346 of those 408 for $298M–$731M; the 360 residents left below them see no change in people still home at the fire front and 19 → 19 cars cut off.
- **Only the largest top-ranked case reaches beyond Panoramic Hill**, onto Summit Rd, Buena Vista Wy, Summit Ln, Grizzly Peak Bl, Hill Rd, Ajax Pl, E Parnassus Ct, Cedar St. It is also the only case with effects in every pair on the 1923 fire (people still home at the fire front 386 → 337 (15/0/0)) and the east-wind fire at night (still there, home or road, 398 → 294 (15/0/0)), again from the households bought out.
- **Engine reach turns on one block.** Buying out Panoramic Hill removes most of the hill residents no engine reaches within 5 minutes (1,296 → 416, median of 10 seed and day-or-night parking draws), because they are the people bought out. Buying out only the lowest block of Panoramic Way (8.4 households) changes nothing for the residents above it while its parked cars stay (988 → 988); with its parked cars gone too, they drop to 9 (better in 8 of 10). A parking rule on that block does the same without a buyout (SOURCE_NOTES ER2–ER3).
- **A second way out costs a hundredth as much or less and helps the people who stay; a buyout removes the people.** Step 2's top-ranked link, AC-160-N3 Panoramic Wy → Smyth Ln, frees 843 hill residents from behind every choke for $1.5M–$6.0M and lowers Panoramic Hill's cars cut off 178 → 167 (the City's Dwight Way–Dwight Place concept: 136), but leaves the 408 people still home at the fire front unchanged. Buying out the hill removes those people at $428M–$1149M and 427 homes.

Cells read: central-severity median without → with the buyout, then (better / worse / no different) over all 15 same-seed pairs at low, central and high severity. Lower is better for every measure. All counts are synthetic people or cars in an illustrative fire, not predictions.

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Block (derived).** A block is one street segment of data/model/network.json on which js/sim.js places households (drivable, not a freeway or ramp, in an evacuation zone), in City Fire Zones 2–3 or, outside Berkeley, at 90 m elevation or higher (the simulator's hill proxy). Ranked if it holds at least 1 expected household. A block is labeled by its street and the streets at its two ends. 1,804 hill blocks hold 17,517 expected households; 1,574 have at least one and are ranked (the rest hold 71 households in all).
- **Fire runs (synthetic).** Every scenario in `js/scenarios.js` (1923 repeat; east wind, night; Panoramic Hill; east wind, weekday), low, central and high severity, seeds 1–5: 60 runs, DEFAULT_PLAN (first order 10 min after ignition, status-quo parking), each scenario's default time of day. The two east-wind scenarios share one fire and differ in time of day.
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

Components: shares of the 60 runs (front, ember, cut, engine), dead-end chokes in series (nest), and choke load (hours of choke capacity the cars behind the outermost choke need, capped at 1). Households are expected values (synthetic). Area: the outermost dead-end access area and its entrance street, with the entrance's clear width under nominal status-quo parking. "Between" names the streets at the two ends of the segment; "—" is a break between two segments of the same street in the County or OpenStreetMap file, with no cross street.

| # | Street | Between | Zone | Fire zone | Households | Front | Ember | Cut | Engine >5 min | Nest | Choke load | Area (entrance, clear width) | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Panoramic Pl | mid-street break – dead end | BER-058 | FZ2 | 3.6 | 23% | 25% | 23% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.7 |
| 2 | Panoramic Pl | Panoramic Wy – mid-street break | BER-058 | FZ2 | 15.7 | 22% | 25% | 25% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.7 |
| 3 | Panoramic Wy | mid-street break – dead end | BER-058 | FZ3 | 4.5 | 22% | 25% | 20% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.6 |
| 4 | Panoramic Pl | dead end – Panoramic Wy | BER-013 | hill (≥90 m) | 5.2 | 18% | 20% | 23% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.5 |
| 5 | Dwight Pl | Dwight Wy – dead end | BER-013 | hill (≥90 m) | 5 | 15% | 17% | 25% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.4 |
| 6 | Panoramic Wy | Dwight Wy – mid-street break | BER-058 | FZ3 | 49.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 7 | Panoramic Wy | Arden Rd – Dwight Wy | BER-058 | FZ3 | 34.5 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 8 | Panoramic Wy | Panoramic Pl – mid-street break | BER-058 | FZ3 | 12.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 9 | Panoramic Wy | mid-street break – mid-street break | BER-058 | FZ3 | 11.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 10 | Panoramic Wy | Dwight Wy – Panoramic Pl | BER-013 | hill (≥90 m) | 11.4 | 12% | 12% | 25% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 11 | Dwight Wy | Panoramic Wy – mid-street break | BER-058 | FZ3 | 6.6 | 23% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 12 | Panoramic Wy | mid-street break – mid-street break | BER-058 | FZ3 | 3.7 | 25% | 25% | 22% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 13 | Panoramic Wy | mid-street break – Panoramic Pl | BER-058 | FZ3 | 8.2 | 17% | 25% | 23% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 14 | Panoramic Wy | Dwight Wy – mid-street break | BER-013 | hill (≥90 m) | 15.1 | 17% | 17% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 15 | Dwight Wy | mid-street break – Dwight Pl | BER-013 | hill (≥90 m) | 6.8 | 17% | 20% | 23% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 16 | Panoramic Wy | Panoramic Pl – mid-street break | BER-013 | hill (≥90 m) | 3.7 | 5% | 5% | 22% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 17 | Arden Rd | Orchard Ln – mid-street break | BER-058 | FZ3 | 10.1 | 18% | 22% | 17% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.9 |
| 18 | Dwight Wy | Dwight Pl – Panoramic Wy | BER-013 | hill (≥90 m) | 4.3 | 10% | 12% | 22% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.7 |
| 19 | Panoramic Wy | mid-street break – dead end | BER-058 | FZ3 | 10.1 | 22% | 25% | 20% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.6 |
| 20 | Panoramic Wy | Orchard Ln – Arden Rd | BER-058 | FZ3 | 24.7 | 22% | 25% | 18% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.6 |
| 21 | Arden Rd | Panoramic Wy – Orchard Ln | BER-058 | FZ3 | 21.7 | 20% | 25% | 20% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.6 |
| 22 | Orchard Ln | Panoramic Wy – Arden Rd | BER-058 | FZ3 | 15.9 | 18% | 23% | 17% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.4 |
| 23 | Mosswood Rd | mid-street break – dead end | BER-058 | FZ2 | 12.2 | 17% | 17% | 17% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.3 |
| 24 | Summit Rd | mid-street break – mid-street break | BER-031 | FZ2 | 3.9 | 50% | 50% | 40% | 40% | 0 | 0 | — | 3.2 |
| 25 | Buena Vista Wy | Del Mar Av – dead end | BER-032 | FZ2 | 16.3 | 42% | 53% | 38% | 0% | 1 | 0 | AC-193 (Buena Vista Wy, 14 ft) | 3.1 |
| 26 | Summit Ln | dead end – Summit Rd | BER-031 | FZ2 | 3.2 | 37% | 48% | 37% | 20% | 1 | 0 | AC-031 (Summit Ln, 6 ft) | 3 |
| 27 | Panoramic Wy | mid-street break – Orchard Ln | BER-058 | FZ3 | 23 | 20% | 25% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3 |
| 28 | Mosswood Rd | Mosswood Ln – mid-street break | BER-058 | FZ3 | 12.1 | 10% | 15% | 12% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3 |
| 29 | Panoramic Wy | Orchard Ln – mid-street break | BER-058 | FZ3 | 28 | 20% | 22% | 15% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.9 |
| 30 | Panoramic Wy | Mosswood Rd – Orchard Ln | BER-058 | FZ3 | 2.4 | 8% | 18% | 8% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.9 |
| 31 | Grizzly Peak Bl | Summit Rd – mid-street break | BER-031 | FZ2 | 10.9 | 50% | 50% | 45% | 0% | 0 | 0 | — | 2.9 |
| 32 | Hill Rd | mid-street break – mid-street break | BER-031 | FZ2 | 8.8 | 28% | 28% | 40% | 45% | 1 | 0 | AC-141 (Hill Rd, 9 ft) | 2.9 |
| 33 | Summit Rd | mid-street break – Summit Ln | BER-031 | FZ2 | 10.2 | 43% | 50% | 42% | 20% | 0 | 0 | — | 2.8 |
| 34 | Orchard Ln | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 5.5 | 15% | 17% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.8 |
| 35 | Summit Rd | Ajax Pl – mid-street break | BER-031 | FZ2 | 5 | 25% | 25% | 30% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.8 |
| 36 | Ajax Pl | Summit Rd – dead end | BER-031 | FZ2 | 3.8 | 25% | 25% | 30% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.8 |
| 37 | Mosswood Rd | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 17 | 15% | 18% | 15% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.8 |
| 38 | E Parnassus Ct | Parnassus Rd – dead end | BER-032 | FZ2 | 3.9 | 35% | 52% | 32% | 5% | 1 | 0 | AC-201 (E Parnassus Ct, 14 ft) | 2.8 |
| 39 | Mosswood Ln | Orchard Ln – Mosswood Rd | BER-058 | FZ3 | 25.4 | 13% | 17% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.7 |
| 40 | Panoramic Wy | Orchard Ln – Mosswood Rd | BER-058 | FZ3 | 3.1 | 17% | 20% | 8% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.7 |

**Ranked by fire exposure alone** (front, ember and cut with the same weights, static factors left out), the top 15 are:

| # | Street | Between | Zone | Households | Front | Ember | Cut | Exposure score | Rank by full score |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Grizzly Peak Bl | Summit Rd – mid-street break | BER-031 | 10.9 | 50% | 50% | 45% | 2.9 | 31 |
| 2 | Summit Rd | mid-street break – mid-street break | BER-031 | 3.9 | 50% | 50% | 40% | 2.8 | 24 |
| 3 | Summit Rd | mid-street break – Summit Ln | BER-031 | 10.2 | 43% | 50% | 42% | 2.6 | 33 |
| 4 | Cedar St | Euclid Av – Leroy Av | BER-040 | 51.3 | 47% | 57% | 30% | 2.6 | 43 |
| 5 | Buena Vista Wy | Del Mar Av – dead end | BER-032 | 16.3 | 42% | 53% | 38% | 2.6 | 25 |
| 6 | Buena Vista Wy | Maybeck Twin Dr – Del Mar Av | BER-032 | 39.1 | 40% | 55% | 37% | 2.5 | 50 |
| 7 | Fairlawn Dr | Avenida Dr – Senior Av / Harvard Ci | BER-032 | 5.3 | 42% | 52% | 33% | 2.4 | 52 |
| 8 | Grizzly Peak Bl | Senior Av – Summit Rd | BER-031 | 5.4 | 40% | 48% | 35% | 2.4 | 57 |
| 9 | Summit Rd | Summit Ln – Grizzly Peak Bl | BER-031 | 4 | 40% | 48% | 35% | 2.4 | 58 |
| 10 | Campus Dr | mid-street break – Del Mar Av | BER-030 | 6.2 | 38% | 55% | 33% | 2.4 | 54 |
| 11 | Senior Av | Harvard Ci / Fairlawn Dr – Grizzly Peak Bl | BER-031 | 12.6 | 38% | 48% | 35% | 2.3 | 62 |
| 12 | Summit Ln | dead end – Summit Rd | BER-031 | 3.2 | 37% | 48% | 37% | 2.3 | 26 |
| 13 | Del Mar Av | Glendale Av – Campus Dr | BER-032 | 9.1 | 40% | 55% | 28% | 2.3 | 60 |
| 14 | Olympus Av | Avenida Dr – Harding Ci | BER-032 | 11.9 | 40% | 50% | 30% | 2.3 | 63 |
| 15 | Fairlawn Dr | Columbia Ci – Avenida Dr | BER-030 | 13.5 | 35% | 50% | 35% | 2.3 | 67 |

## Buyout cases

| Case | Blocks | Households | Residents | Streets | Behind a dead-end choke (residents) | Outermost areas: residents before → after | Fires that threaten it |
|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 6 | 83 | 197 | Panoramic Pl, Panoramic Wy, Dwight Pl | 197 | AC-155 Panoramic Wy: 1,011 → 814 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 100 households | 7 | 118 | 279 | Panoramic Pl, Panoramic Wy, Dwight Pl | 279 | AC-155 Panoramic Wy: 1,011 → 732 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 250 households | 21 | 267 | 634 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd | 634 | AC-155 Panoramic Wy: 1,011 → 377 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 500 households | 43 | 533 | 1,263 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd, Orchard Ln, Mosswood Rd, Summit Rd +8 | 1,082 | AC-155 Panoramic Wy: 1,011 → 35; AC-193 Buena Vista Wy: 39 → 0; AC-031 Summit Ln: 8 → 0; AC-141 Hill Rd: 21 → 1; AC-173 Summit Rd: 39 → 9; AC-201 E Parnassus Ct: 9 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 22 | 276 | 653 | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd, Dwight Wy, Dwight Pl | 653 | AC-155 Panoramic Wy: 1,011 → 358 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 33 | 427 | 1,011 | Panoramic Wy, Mosswood Rd, Orchard Ln, Panoramic Pl, Mosswood Ln, Arden Rd, Dwight Wy, Dwight Pl | 1,011 | AC-155 Panoramic Wy: 1,011 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |

A fire threatens a case if, in any of its runs, a bought-out block's zone was ordered or warned or embers reached it. Bought-out households vary by seed around the expected count (the simulator draws whole households); the runs below removed the households the seed placed there.

## Evacuation effect, fire on

Cells: central-severity median without → with the buyout, then (better / worse / no different) over all same-seed pairs. "Every pair" lists the measures better in every pair.

### Benefit 1: the bought-out residents (run without the buyout)

| Case | Fire | Bought-out residents | Still home when the fire front arrived | … when embers arrived | Their cars on a street when the fire front reached it | Their cars cut off at the end |
|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 197 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | east wind, night | 197 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | Panoramic Hill | 197 | 135 (31–190) | 185 (100–197) | 69 | 66 |
| Top-ranked blocks, about 50 households | east wind, weekday | 197 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | 1923 repeat | 277 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | east wind, night | 277 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | Panoramic Hill | 277 | 199 (47–273) | 268 (149–277) | 90 | 74 |
| Top-ranked blocks, about 100 households | east wind, weekday | 277 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | 1923 repeat | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | east wind, night | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | Panoramic Hill | 630 | 353 (76–571) | 533 (277–604) | 177 | 156 |
| Top-ranked blocks, about 250 households | east wind, weekday | 630 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 500 households | 1923 repeat | 1,268 | 52 (26–178) | 142 (47–225) | 30 | 28 |
| Top-ranked blocks, about 500 households | east wind, night | 1,268 | 55 (5–175) | 164 (45–235) | 23 | 16 |
| Top-ranked blocks, about 500 households | Panoramic Hill | 1,268 | 408 (76–803) | 768 (292–934) | 202 | 177 |
| Top-ranked blocks, about 500 households | east wind, weekday | 1,268 | 64 (7–201) | 178 (45–237) | 23 | 20 |
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
| Top-ranked blocks, about 50 households | 1923 repeat | 813 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 113 → 113 (7/5/3) | 179 → 179 (5/2/8) | 113 → 113 (6/8/1) |
| Top-ranked blocks, about 50 households | east wind, night | 813 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (7/6/2) | 135 → 135 (4/6/5) | 94 → 93 (9/6/0) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 813 | 265 → 265 (1/0/14) | 607 → 602 (1/0/14) | 131 → 131 (7/7/1) | 111 → 111 (3/1/11) | not all out → not all out (3/2/10) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 50 households | east wind, weekday | 813 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (6/5/4) | 177 → 177 (7/6/2) | 111 → 111 (10/4/1) |
| Top-ranked blocks, about 100 households | 1923 repeat | 732 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 117 → 110 (6/4/5) | 173 → 173 (5/3/7) | 113 → 110 (8/6/1) |
| Top-ranked blocks, about 100 households | east wind, night | 732 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 94 → 93 (6/2/7) | 135 → 135 (6/6/3) | 94 → 93 (9/6/0) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 732 | 201 → 201 (1/0/14) | 524 → 519 (1/0/14) | 109 → 111 (6/7/2) | 101 → 101 (2/1/12) | not all out → not all out (3/1/11) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 100 households | east wind, weekday | 732 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (3/4/8) | 174 → 173 (7/4/4) | 111 → 109 (6/9/0) |
| Top-ranked blocks, about 250 households | 1923 repeat | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 118 → 111 (9/0/6) | 164 → 164 (9/4/2) | 113 → 110 (12/3/0) |
| Top-ranked blocks, about 250 households | east wind, night | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 92 → 92 (10/3/2) | 135 → 135 (6/8/1) | 94 → 92 (9/6/0) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 379 | 52 → 52 (0/0/15) | 256 → 256 (0/0/15) | 25 → 24 (7/2/6) | 20 → 20 (1/1/13) | not all out → not all out (3/2/10) | not all out → not all out (1/4/10) | not all out → 119 (8/0/7) |
| Top-ranked blocks, about 250 households | east wind, weekday | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (4/7/4) | 165 → 165 (6/4/5) | 111 → 107 (9/4/2) |
| Top-ranked blocks, about 500 households | 1923 repeat | 43 | 9 → 9 (0/0/15) | 9 → 9 (0/0/15) | 2 → 2 (2/0/13) | 1 → 1 (0/0/15) | 138 → 138 (4/2/9) | not all out → not all out (4/1/10) | 124 → 86 (10/4/1) |
| Top-ranked blocks, about 500 households | east wind, night | 43 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (5/4/6) | 99 → 99 (3/5/7) | 98 → 88 (12/3/0) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 43 | 0 → 0 (0/0/15) | 21 → 21 (0/0/15) | 1 → 0 (2/0/13) | 0 → 0 (0/0/15) | 94 → 94 (5/1/9) | 105 → 104 (4/1/10) | not all out → 94 (10/0/5) |
| Top-ranked blocks, about 500 households | east wind, weekday | 43 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 101 → 101 (8/4/3) | 118 → 118 (6/2/7) | 116 → 79 (13/0/2) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 119 → 114 (8/5/2) | 164 → 164 (9/3/3) | 113 → 108 (9/6/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 94 → 94 (10/2/3) | 135 → 135 (4/6/5) | 94 → 94 (6/9/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 360 | 62 → 62 (0/0/15) | 237 → 237 (0/0/15) | 26 → 20 (6/3/6) | 19 → 19 (0/1/14) | not all out → not all out (3/3/9) | not all out → not all out (2/2/11) | not all out → not all out (7/0/8) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 115 → 115 (6/4/5) | 165 → 165 (6/4/5) | 111 → 107 (9/6/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 | no one is left behind the choke | | | | | | |

### Whole model area

| Case | Fire | People still there when the fire front arrived (home or road) | … at home | … when embers arrived | Cars cut off at the end | Region 90% out, min | Region 100% out, min | Same zones: still home at the fire front |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 648 → 631 (9/5/1) | 386 → 386 (2/3/10) | 6,072 → 6,079 (9/6/0) | 95 → 95 (5/1/9) | 97 → 97 (10/4/1) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | east wind, night | 398 → 406 (7/6/2) | 225 → 225 (0/0/15) | 5,083 → 5,077 (10/5/0) | 51 → 51 (1/4/10) | 92 → 92 (6/5/4) | not all out → not all out (2/1/12) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 3,954 → 3,693 (15/0/0) | 3,282 → 3,147 (15/0/0) | 16,066 → 15,725 (15/0/0) | 263 → 197 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 443 → 441 (1/0/14) |
| Top-ranked blocks, about 50 households | east wind, weekday | 424 → 432 (5/7/3) | 258 → 258 (2/0/13) | 5,818 → 5,824 (6/8/1) | 75 → 75 (1/4/10) | 105 → 105 (2/7/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | 1923 repeat | 648 → 644 (8/3/4) | 386 → 386 (3/2/10) | 6,072 → 6,081 (7/8/0) | 95 → 94 (6/1/8) | 97 → 97 (11/3/1) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | east wind, night | 398 → 408 (8/3/4) | 225 → 225 (0/0/15) | 5,083 → 5,060 (10/4/1) | 51 → 51 (1/3/11) | 92 → 92 (6/5/4) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 3,954 → 3,576 (15/0/0) | 3,282 → 3,083 (15/0/0) | 16,066 → 15,524 (15/0/0) | 263 → 185 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 374 → 370 (1/0/14) |
| Top-ranked blocks, about 100 households | east wind, weekday | 424 → 426 (2/10/3) | 258 → 258 (0/0/15) | 5,818 → 5,836 (7/6/2) | 75 → 75 (2/3/10) | 105 → 105 (3/6/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | 1923 repeat | 648 → 644 (8/4/3) | 386 → 386 (3/2/10) | 6,072 → 6,131 (4/10/1) | 95 → 95 (5/1/9) | 97 → 96 (14/1/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, night | 398 → 398 (7/3/5) | 225 → 225 (0/0/15) | 5,083 → 5,068 (7/3/5) | 51 → 51 (0/3/12) | 92 → 92 (5/6/4) | not all out → not all out (1/1/13) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 3,954 → 3,252 (15/0/0) | 3,282 → 2,929 (15/0/0) | 16,066 → 14,978 (15/0/0) | 263 → 114 (15/0/0) | not all out → 109 (10/0/5) | not all out → not all out (3/0/12) | 223 → 223 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, weekday | 424 → 428 (5/8/2) | 258 → 258 (1/0/14) | 5,818 → 5,791 (8/7/0) | 75 → 75 (1/2/12) | 105 → 105 (6/6/3) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 500 households | 1923 repeat | 648 → 533 (15/0/0) | 386 → 337 (15/0/0) | 6,072 → 5,772 (15/0/0) | 95 → 66 (15/0/0) | 97 → 96 (14/0/1) | not all out → not all out (1/0/14) | 164 → 164 (4/0/11) |
| Top-ranked blocks, about 500 households | east wind, night | 398 → 294 (15/0/0) | 225 → 171 (15/0/0) | 5,083 → 4,794 (15/0/0) | 51 → 34 (12/0/3) | 92 → 92 (14/1/0) | not all out → not all out (3/0/12) | 137 → 137 (0/0/15) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 3,954 → 3,116 (15/0/0) | 3,282 → 2,844 (15/0/0) | 16,066 → 14,521 (15/0/0) | 263 → 93 (15/0/0) | not all out → 107 (10/0/5) | not all out → not all out (3/0/12) | 175 → 175 (0/0/15) |
| Top-ranked blocks, about 500 households | east wind, weekday | 424 → 324 (15/0/0) | 258 → 194 (15/0/0) | 5,818 → 5,461 (15/0/0) | 75 → 54 (14/0/1) | 105 → 105 (14/1/0) | not all out → not all out (2/0/13) | 173 → 173 (1/0/14) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 648 → 634 (5/5/5) | 386 → 386 (4/1/10) | 6,072 → 6,050 (7/7/1) | 95 → 96 (4/4/7) | 97 → 96 (14/1/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 398 → 407 (6/6/3) | 225 → 225 (0/0/15) | 5,083 → 5,085 (9/5/1) | 51 → 50 (3/4/8) | 92 → 92 (5/5/5) | not all out → not all out (2/0/13) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 3,954 → 3,250 (15/0/0) | 3,282 → 2,927 (15/0/0) | 16,066 → 14,961 (15/0/0) | 263 → 113 (15/0/0) | not all out → 111 (10/0/5) | not all out → not all out (3/0/12) | 230 → 230 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 424 → 430 (4/6/5) | 258 → 258 (2/0/13) | 5,818 → 5,799 (10/4/1) | 75 → 75 (0/3/12) | 105 → 105 (7/3/5) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 648 → 656 (9/5/1) | 386 → 386 (4/1/10) | 6,072 → 6,042 (8/7/0) | 95 → 95 (5/2/8) | 97 → 96 (15/0/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 398 → 404 (3/8/4) | 225 → 225 (0/0/15) | 5,083 → 5,066 (11/4/0) | 51 → 50 (2/2/11) | 92 → 92 (7/5/3) | not all out → not all out (1/0/14) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 3,954 → 3,114 (15/0/0) | 3,282 → 2,844 (15/0/0) | 16,066 → 14,531 (15/0/0) | 263 → 93 (15/0/0) | not all out → 107 (10/0/5) | not all out → not all out (3/0/12) | 173 → 173 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 424 → 432 (4/10/1) | 258 → 258 (2/0/13) | 5,818 → 5,793 (10/5/0) | 75 → 75 (3/2/10) | 105 → 105 (7/4/4) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |

### Where the change comes from

Median over same-seed pairs of the change in people still home when the fire front arrived and in cars cut off, split into the bought-out residents (benefit 1), the neighbors (benefit 2) and everyone else. Central severity; "elsewhere" range over all pairs.

| Case | Fire | Still home at the fire front: total = bought out + neighbors + elsewhere | Elsewhere, range | Cars cut off: total = bought out + neighbors + elsewhere | Elsewhere, range |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 0 = 0 + 0 + 0 | -28 to 26 | 0 = 0 + 0 + 0 | -74 to 2 |
| Top-ranked blocks, about 50 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 2 |
| Top-ranked blocks, about 50 households | Panoramic Hill | -135 = -135 + 0 + 0 | -1 to 1 | -66 = -66 + 0 + 0 | -2 to 1 |
| Top-ranked blocks, about 50 households | east wind, weekday | 0 = 0 + 0 + 0 | -5 to 0 | 0 = 0 + 0 + 0 | -1 to 7 |
| Top-ranked blocks, about 100 households | 1923 repeat | 0 = 0 + 0 + 0 | -28 to 4 | 0 = 0 + 0 + 0 | -62 to 3 |
| Top-ranked blocks, about 100 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -1 to 3 |
| Top-ranked blocks, about 100 households | Panoramic Hill | -199 = -199 + 0 + 0 | -1 to 1 | -74 = -74 + 0 + 0 | -1 to 2 |
| Top-ranked blocks, about 100 households | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 6 |
| Top-ranked blocks, about 250 households | 1923 repeat | 0 = 0 + 0 + 0 | -48 to 7 | 0 = 0 + 0 + 0 | -67 to 8 |
| Top-ranked blocks, about 250 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | 0 to 4 |
| Top-ranked blocks, about 250 households | Panoramic Hill | -353 = -353 + 0 + 0 | -1 to 1 | -156 = -156 + 0 + 0 | -1 to 1 |
| Top-ranked blocks, about 250 households | east wind, weekday | 0 = 0 + 0 + 0 | -3 to 0 | 0 = 0 + 0 + 0 | -4 to 5 |
| Top-ranked blocks, about 500 households | 1923 repeat | -52 = -52 + 0 + 0 | -35 to 11 | -28 = -28 + 0 + 0 | -69 to 8 |
| Top-ranked blocks, about 500 households | east wind, night | -54 = -55 + 0 + 0 | -1 to 1 | -15 = -16 + 0 + 0 | -2 to 3 |
| Top-ranked blocks, about 500 households | Panoramic Hill | -408 = -408 + 0 + 0 | -1 to 1 | -177 = -177 + 0 + 0 | -2 to 1 |
| Top-ranked blocks, about 500 households | east wind, weekday | -64 = -64 + 0 + 0 | -4 to 0 | -20 = -20 + 0 + 0 | -1 to 4 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 0 = 0 + 0 + 0 | -38 to 18 | 0 = 0 + 0 + 0 | -56 to 24 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -1 to 2 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | -346 = -346 + 0 + 0 | -1 to 1 | -157 = -157 + 0 + 0 | -1 to 2 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 0 = 0 + 0 + 0 | -5 to 0 | 0 = 0 + 0 + 0 | 0 to 2 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 = 0 + 0 + 0 | -33 to 9 | 0 = 0 + 0 + 0 | -59 to 22 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -3 to 2 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | -408 = -408 + 0 + 0 | -1 to 1 | -177 = -177 + 0 + 0 | -1 to 2 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 = 0 + 0 + 0 | -5 to 0 | 0 = 0 + 0 + 0 | -1 to 6 |

### Effects that hold in every same-seed pair

- Top-ranked blocks, about 50 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors frontHome (1 of 15), neighbors emberHome (1 of 15), area clearP90 (5 of 15), same zones frontHome (1 of 15), same zones emberHome (1 of 15).
- Top-ranked blocks, about 50 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (2 of 15).
- Top-ranked blocks, about 100 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 100 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 100 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors frontHome (1 of 15), neighbors emberHome (1 of 15), area clearP90 (5 of 15), same zones frontHome (1 of 15), same zones emberHome (1 of 15).
- Top-ranked blocks, about 100 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: neighbors clearP90 (9 of 15).
- Top-ranked blocks, about 250 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), area clearP90 (8 of 15), area clearP100 (5 of 15).
- Top-ranked blocks, about 250 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (1 of 15).
- Top-ranked blocks, about 500 households, 1923 repeat (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (14 of 15), overall clearP100 (1 of 15), neighbors vehFireFront (2 of 15), area clearP100 (5 of 15), same zones frontHome (4 of 15).
- Top-ranked blocks, about 500 households, east wind, night (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople. Never worse, better in some: overall vehNoRoute (12 of 15), overall vehFireFront (14 of 15), overall clearP100 (3 of 15), area clearP100 (14 of 15).
- Top-ranked blocks, about 500 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), neighbors vehFireFront (2 of 15), area clearP90 (10 of 15), area clearP100 (6 of 15), same zones vehNoRoute (3 of 15).
- Top-ranked blocks, about 500 households, east wind, weekday (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople. Never worse, better in some: overall vehNoRoute (14 of 15), overall vehFireFront (14 of 15), overall clearP100 (2 of 15), area clearP90 (13 of 15), area clearP100 (10 of 15), same zones frontHome (1 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), 1923 repeat (15 pairs): better in every pair: area clearP100. Never worse, better in some: none.
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, night (15 pairs): better in every pair: none. Never worse, better in some: overall clearP100 (2 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), area clearP90 (7 of 15), area clearP100 (5 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (2 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), 1923 repeat (15 pairs): better in every pair: overall clearP90, area clearP90, area clearP100. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, night (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: overall clearP100 (1 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (3 of 15), area clearP90 (9 of 15), area clearP100 (6 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, weekday (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: overall frontHome (2 of 15).

Measure names: frontPeople and frontHome, people still there (home or road) and at home when the fire front arrived; emberPeople, when embers arrived; vehNoRoute, cars cut off at the end; vehFireFront, cars on a street when the fire front reached it; clearP90 and clearP100, 90% and 100% out.

## Engine reach

Synthetic residents of Berkeley's Fire Zones 2–3 whose street no engine reaches within the City's 5-minute standard at ignition (js/sim.js engine reach), seeds 1–5, weekday (S4) and night (S6) parking: median of 10 without → with (better / worse of 10). "Parked cars kept" is the main rule; "cleared" also removes the parked cars on bought-out blocks (model rule, sensitivity).

| Case | Bought-out residents beyond 5 min | Neighbors beyond 5 min, parked cars kept | … cleared | All hill residents beyond 5 min, kept | … cleared |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 194 | 794 → 794 (0/0) | 794 → 794 (0/0) | 1,296 → 1,101 (8/0) | 1,296 → 1,101 (8/0) |
| Top-ranked blocks, about 100 households | 277 | 713 → 713 (0/0) | 713 → 713 (0/0) | 1,296 → 1,030 (8/0) | 1,296 → 1,030 (8/0) |
| Top-ranked blocks, about 250 households | 630 | 358 → 358 (0/0) | 358 → 358 (0/0) | 1,296 → 727 (8/0) | 1,296 → 727 (8/0) |
| Top-ranked blocks, about 500 households | 1,006 | 18 → 18 (0/0) | 18 → 18 (0/0) | 1,296 → 403 (10/0) | 1,296 → 389 (10/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 652 | 339 → 339 (0/0) | 339 → 339 (0/0) | 1,296 → 708 (8/0) | 1,296 → 708 (8/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 988 | 0 → 0 (0/0) | 0 → 0 (0/0) | 1,296 → 416 (8/0) | 1,296 → 416 (8/0) |
| Sensitivity: the lowest block of Panoramic Way only (Panoramic Wy, 8.4 households; not run with the fire) | 0 | 988 → 988 (0/0) | 988 → 9 (8/0) | 1,296 → 1,296 (0/0) | 1,296 → 421 (8/0) |

## Costs and losses (screening estimate)

A screening estimate from public figures and labeled assumptions, not an appraisal, policy or legal analysis, and not a statement of what any owner would accept. One synthetic household is counted as one housing unit. Housing units lost equal households bought out; residents displaced are households × 2.37 (synthetic). Rounded to $0.1M.

| Case | Housing units lost | Residents displaced | Acquisition | Relocation | Demolition and restoration | Total | Per household | Notes |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 83 | 197 | $82.4M–$212M | $0k–$3.6M | $1.7M–$8.3M | $84.0M–$224M | $1.0M–$2.7M | 10 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 100 households | 118 | 279 | $111M–$302M | $0k–$5.2M | $2.4M–$11.8M | $114M–$319M | $966k–$2.7M | 10 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 250 households | 267 | 634 | $286M–$669M | $0k–$11.7M | $5.3M–$26.7M | $291M–$708M | $1.1M–$2.6M | 51 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 500 households | 533 | 1,263 | $548M–$1276M | $0k–$23.4M | $10.7M–$53.3M | $558M–$1353M | $1.0M–$2.5M | 51 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 276 | 653 | $293M–$691M | $0k–$12.1M | $5.5M–$27.6M | $298M–$731M | $1.1M–$2.7M | 51 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 427 | 1,011 | $420M–$1088M | $0k–$18.7M | $8.5M–$42.7M | $428M–$1149M | $1.0M–$2.7M | 51 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Sensitivity: the lowest block of Panoramic Way only | 8 | 20 | $7.1M–$22.2M | $0k–$400k | $200k–$800k | $7.3M–$23.4M | $863k–$2.8M | — |

- **Acquisition (sourced statistic, assumption in its use).** Each household at the ACS median value of owner-occupied homes in its block group, low = median − margin of error, high = median + margin of error. A buyout pays the appraised value of each property, which the block-group median does not give.
- **Relocation (sourced figures, assumption in their use).** $0–$43,890 per household. Owner-occupants who sell voluntarily are not displaced persons under the Uniform Relocation Act (49 CFR 24.101(b)), so the low end assumes every household is one and receives nothing. The high end assumes a program pays every household the URA homeowner replacement housing payment maximum ($41,200, 49 CFR 24.401(b)) plus an 8-room fixed move ($2,690). Tenants who must move are covered by the Act; their entitlement, up to $9,570 rental assistance (49 CFR 24.402(b)) plus a move ($12,260 at most), lies inside the range. The split between owners and renters (ACS B25003) could not be retrieved, so the range is wide.
- **Demolition and site restoration (sourced low, assumed high).** $20,000–$100,000 per household: the Delaware County (PA) program's $20,000–$50,000 range, high end doubled for Bay Area costs and hillside access.
- Left out: closing, appraisal and legal costs, program administration, lost property-tax revenue, maintenance of the open land, and any effect on the value of neighboring homes.

## Retreat or a second way out

Step 2 figures come from data/model/egress-candidates.json (step 2, PR #15; rerun on this network, SOURCE_NOTES EG14), built 2026-11-01. They come from a different harness (step 2 counts every car starting in the area, these tables count residents' cars) and the same fires, severities and seeds; the Panoramic Hill fire, first order 10 minutes after ignition, central-severity medians.

| Option | Kind | Residents protected or freed | Effect on the residents who stay (Panoramic Hill fire) | Homes lost | Screening cost |
|---|---|---|---|---|---|
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | buyout | 1,011 bought out; behind the foot of Panoramic Way 1,011 → 0 | neighbors' cars cut off 0 → 0 (0/0/15); still home at the fire front 0 → 0 (0/0/15) | 427 | $428M–$1149M |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | buyout | 653 bought out; behind the foot of Panoramic Way 1,011 → 358 | neighbors' cars cut off 19 → 19 (0/1/14); still home at the fire front 62 → 62 (0/0/15) | 276 | $298M–$731M |
| AC-160-N3 Panoramic Wy → Smyth Ln (88 m, 21% average grade) | second way out | 843 hill residents freed from behind every choke; AC-155 1,011 → 222 behind a choke | area cars cut off 178 → 167 (14/0/1); still home at the fire front 408 → 408 | 1 building in the corridor | $1.5M–$6.0M |
| AC-134-N2 Smyth Ln → Dwight Wy (92 m, 27.4% average grade) | second way out | 843 hill residents freed from behind every choke; AC-155 1,011 → 222 behind a choke | area cars cut off 178 → 162 (14/0/1); still home at the fire front 408 → 405 | 1 building in the corridor | $1.6M–$7.4M |
| CITY-1 Dwight Wy → Dwight Pl (174 m, 40.2% average grade) | second way out | 802 hill residents freed from behind every choke; AC-155 1,011 → 210 behind a choke | area cars cut off 178 → 136 (15/0/0); still home at the fire front 408 → 401 | 0 buildings in the corridor | $1.3M–$10.6M |

Other areas with both a buyout block in the cases above and a step 2 link: AC-134-N1 (Smyth Ln → Panoramic Wy, frees 484, $2.9M–$10.2M); AC-155-O1 (Mosswood Rd → Canyon Rd, frees 337, $1.3M–$6.8M); AC-156-N3 (Mosswood Rd → Canyon Rd, frees 309, $2.3M–$9.4M); AC-155-N3 (Panoramic Wy → Smyth Ln, frees 277, $2.9M–$11.4M); AC-193-N1 (Buena Vista Wy → W Parnassus Ct, frees 49, $1.9M–$6.1M).

## Limits

- Synthetic households on street segments, not homes: a block's count is the zone's population spread by street length. The rank of two neighboring blocks can turn on that allocation. A real program would start from parcels and owners willing to sell, which this analysis does not use.
- The fires are illustrative and the traffic model is uncalibrated for weekday peaks (HANDOFF.md, calibration). Results compare runs; they do not estimate real outcomes.
- When a household is ready to leave does not depend on the streets, so a buyout cannot get the remaining residents out of the house sooner; it only shortens the queue once they are on the road. Measures of people still home move only through riders and cars waiting for room on a full street.
- Parked cars do not depend on households in the simulator, so the main runs keep them on bought-out blocks; the engine-reach sensitivity shows what clearing them would do.
- Bought-out land is assumed to stay empty: no new homes, no ADUs, no parking. Future growth is off in every run.
- Costs use block-group medians, which are top-coded at $2,000,001 and include homes far from the bought-out blocks. Willingness to sell, eminent domain (not assumed), federal cost shares and tax effects are outside this screening.

## Sources

- American Community Survey 2020–2024 5-year, table B25077 (median value of owner-occupied homes), by block group, via the Census Reporter API; block group of each segment's midpoint from TIGERweb (Tracts_Blocks layer 1). https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077. Retrieved 2026-11-01. Category: sourced (block-group statistics); applying a median to every home is an assumption.
- 49 CFR 24.401(b): "The replacement housing payment for an eligible 90-day homeowner-occupant may not exceed $41,200". https://www.law.cornell.edu/cfr/text/49/24.401. Retrieved 2026-11-01. Category: sourced.
- 49 CFR 24.402(b): rental assistance for a displaced tenant "not to exceed $9,570". https://www.law.cornell.edu/cfr/text/49/24.402. Retrieved 2026-11-01. Category: sourced.
- 49 CFR 24.101(b): in a voluntary acquisition (no eminent domain, the owner told so in writing) the relocation provisions apply to tenants who must move, not to the owner-occupant who sells. https://www.law.cornell.edu/cfr/text/49/24.101. Retrieved 2026-11-01. Category: sourced.
- FHWA, Fixed Residential Moving Cost Schedule, Federal Register Vol. 86, No. 141 (July 27, 2021), FR Doc. 2021-15930, California, occupant owns furniture: 4 rooms $1,475, 8 rooms $2,690. https://www.govinfo.gov/content/pkg/FR-2021-07-27/html/2021-15930.htm. Retrieved 2026-11-01. Category: sourced.
- Delaware County (PA) Office of Housing and Community Development, Demolition Program guidelines (file dated 2025-08): "Residential demolition and site restoration costs range from $20,000 to $50,000." High end doubled for Bay Area costs and hillside access (assumption). https://delcopa.gov/sites/default/files/2025-08/DemolitionFundProgramGuidelines.pdf. Retrieved 2026-11-01. Category: sourced low; high is an assumption.
- Access-constrained areas: `data/model/access-constraints.json` (`tools/access-constraints.mjs`, SOURCE_NOTES AC1–AC15).
- Engine reach: `js/sim.js` engineReachTimes (SOURCE_NOTES ER1–ER3).
- Step 2: data/model/egress-candidates.json (step 2, PR #15; rerun on this network, SOURCE_NOTES EG14), built 2026-11-01.
