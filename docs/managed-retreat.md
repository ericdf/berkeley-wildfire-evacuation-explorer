# Managed retreat: which blocks a voluntary buyout would target, and what it would change

Built 2026-11-01 by `node tools/retreat-sim.mjs` (this report from `tools/retreat-report.mjs`, costs from `tools/retreat-costs.mjs`). Machine-readable results: `data/model/retreat.json`. Step 3 of the egress and managed-retreat plan in `HANDOFF.md`; step 1 is `docs/access-constraints.md`, step 2 (second ways out) is under review in PR #15.

This is an educational comparison, not a prediction, not an official evacuation plan and not a buyout proposal. The costs are a screening estimate, not an appraisal, policy or legal analysis. Households and residents are synthetic: the simulator spreads each Genasys zone's population over its streets, so a "block" holds an expected number of households, not real homes. The analysis works at street-segment level with street names only; no parcels, owners or addresses are used. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count.

## Findings

- **Panoramic Hill fills the top of the ranking.** 15 of the top 15 blocks are in AC-155 (behind the Panoramic Wy choke); the first block elsewhere is Buena Vista Wy (Del Mar Av – dead end, BER-032) at rank 23. Panoramic Hill blocks score on every component at once: up to 4 dead-end chokes in series, no engine within 5 minutes in 80% of runs (parked cars on the lowest block of Panoramic Way, SOURCE_NOTES ER3), a choke that needs 31 minutes of capacity for the cars behind it, and households still home when the fire front arrived in up to 25% of runs (the Panoramic Hill fire is the only one of the four that reaches them). Buena Vista Wy has more fire exposure (48% of runs) but one choke and engine access. The score is a model rule; ranked by fire exposure alone, the order changes (table below).
- **Almost all of a buyout's benefit is benefit 1: the people bought out are no longer there.** On the Panoramic Hill fire, the drop in people still home when the fire front arrived equals the number of bought-out residents still home in the run without the buyout, in every case (central median: Top-ranked blocks, about 50 households: 135; Top-ranked blocks, about 100 households: 204; Top-ranked blocks, about 250 households: 346; Top-ranked blocks, about 500 households: 389; Panoramic Hill upper streets: 336; Everything behind the foot of Panoramic Way: 389); everyone else changes by at most 1 person in any pair. The neighbors who stay behind the same choke are still home at the fire front in exactly the same numbers in every pair, because when a household is ready to leave does not depend on the streets. Benefit 2 is small and not consistent: the neighbors' cars cut off fall in every pair in 0 of 20 case-fire combinations, and their 90% out time falls in every pair in 0 of 20.
- **Panoramic Hill.** Buying out everything behind the foot of Panoramic Way (410 households, 972 residents) removes the 389 people the run without it left at home when the fire front arrived (central median; 73–813 over all severities and seeds) and lowers cars cut off in the whole model area from 242 to 94, better in 15 of 15 pairs. Screening cost $395M–$1114M. The upper streets alone (259 households behind the second choke) remove 337 of those 389 for $265M–$696M; the 360 residents left below them see no change in people still home at the fire front and 14 → 14 cars cut off.
- **Only the largest top-ranked case reaches beyond Panoramic Hill**, onto Buena Vista Wy, Summit Ln, Summit Rd, Ajax Pl, Grizzly Peak Bl, Hill Rd, Olympus Av. It is also the only case with effects in every pair on the 1923 fire (people still home at the fire front 384 → 325 (15/0/0)) and the east-wind fire at night (still there, home or road, 412 → 258 (15/0/0)), again from the households bought out.
- **Engine reach turns on one block.** Buying out Panoramic Hill removes most of the hill residents no engine reaches within 5 minutes (1,260 → 416, median of 10 seed and day-or-night parking draws), because they are the people bought out. Buying out only the lowest block of Panoramic Way (8.4 households) changes nothing for the residents above it while its parked cars stay (953 → 953); with its parked cars gone too, they drop to 9 (better in 8 of 10). A parking rule on that block does the same without a buyout (SOURCE_NOTES ER2–ER3).
- **A second way out costs a hundredth as much or less and helps the people who stay; a buyout removes the people.** Step 2's top-ranked link (provisional), AC-160-N3 Panoramic Wy → Smyth Ln, frees 823 hill residents from behind every choke for $1.5M–$6.0M and lowers Panoramic Hill's cars cut off 163 → 150 (the City's Dwight Way–Dwight Place concept: 131), but leaves the 389 people still home at the fire front unchanged. Buying out the hill removes those people at $395M–$1114M and 410 homes.

Cells read: central-severity median without → with the buyout, then (better / worse / no different) over all 15 same-seed pairs at low, central and high severity. Lower is better for every measure. All counts are synthetic people or cars in an illustrative fire, not predictions.

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Block (derived).** A block is one street segment of data/model/network.json on which js/sim.js places households (drivable, not a freeway or ramp, in an evacuation zone), in City Fire Zones 2–3 or, outside Berkeley, at 90 m elevation or higher (the simulator's hill proxy). Ranked if it holds at least 1 expected household. A block is labeled by its street and the streets at its two ends. 1,803 hill blocks hold 17,500 expected households; 1,573 have at least one and are ranked (the rest hold 71 households in all).
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
| 1 | Panoramic Pl | Panoramic Wy – — | BER-058 | FZ2 | 15.7 | 25% | 25% | 25% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.8 |
| 2 | Panoramic Pl | — – dead end | BER-058 | FZ2 | 3.6 | 23% | 25% | 23% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.7 |
| 3 | Panoramic Wy | — – dead end | BER-058 | FZ3 | 4.5 | 22% | 25% | 20% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.6 |
| 4 | Panoramic Wy | Dwight Wy – — | BER-058 | FZ3 | 49.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 5 | Panoramic Wy | Arden Rd – Dwight Wy | BER-058 | FZ3 | 34.5 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 6 | Panoramic Wy | Panoramic Pl – — | BER-058 | FZ3 | 12.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 7 | Panoramic Wy | — – — | BER-058 | FZ3 | 11.1 | 25% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 8 | Panoramic Pl | dead end – Panoramic Wy | BER-013 | hill (≥90 m) | 3.5 | 13% | 15% | 22% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 9 | Panoramic Wy | Dwight Wy – Panoramic Pl | BER-013 | hill (≥90 m) | 7.7 | 12% | 12% | 25% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 10 | Panoramic Wy | — – — | BER-058 | FZ3 | 3.7 | 25% | 25% | 23% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 11 | Dwight Pl | Dwight Wy – dead end | BER-013 | hill (≥90 m) | 3.4 | 12% | 17% | 22% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.3 |
| 12 | Dwight Wy | Panoramic Wy – — | BER-058 | FZ3 | 6.6 | 22% | 25% | 23% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.2 |
| 13 | Panoramic Wy | — – Panoramic Pl | BER-058 | FZ3 | 8.2 | 20% | 25% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4.2 |
| 14 | Dwight Wy | — – Dwight Pl | BER-013 | hill (≥90 m) | 4.6 | 17% | 23% | 23% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 4 |
| 15 | Panoramic Wy | Dwight Wy – — | BER-013 | hill (≥90 m) | 10.3 | 15% | 15% | 25% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.9 |
| 16 | Arden Rd | Orchard Ln – — | BER-058 | FZ3 | 10.1 | 17% | 23% | 17% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.9 |
| 17 | Panoramic Wy | Panoramic Pl – — | BER-013 | hill (≥90 m) | 2.5 | 0% | 0% | 15% | 80% | 4 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.6 |
| 18 | Arden Rd | Panoramic Wy – Orchard Ln | BER-058 | FZ3 | 21.7 | 22% | 25% | 18% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.6 |
| 19 | Panoramic Wy | — – dead end | BER-058 | FZ3 | 10.1 | 20% | 23% | 17% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.5 |
| 20 | Panoramic Wy | Orchard Ln – Arden Rd | BER-058 | FZ3 | 24.7 | 18% | 25% | 17% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.4 |
| 21 | Dwight Wy | Dwight Pl – Panoramic Wy | BER-013 | hill (≥90 m) | 2.9 | 5% | 7% | 20% | 80% | 3 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.4 |
| 22 | Orchard Ln | Panoramic Wy – Arden Rd | BER-058 | FZ3 | 15.9 | 18% | 18% | 17% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.4 |
| 23 | Buena Vista Wy | Del Mar Av – dead end | BER-032 | FZ2 | 16.3 | 48% | 55% | 40% | 0% | 1 | 0 | AC-193 (Buena Vista Wy, 14 ft) | 3.3 |
| 24 | Mosswood Rd | — – dead end | BER-058 | FZ2 | 12.2 | 15% | 17% | 15% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3.2 |
| 25 | Mosswood Rd | Mosswood Ln – — | BER-058 | FZ3 | 12.1 | 10% | 17% | 13% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3 |
| 26 | Summit Ln | dead end – Summit Rd | BER-031 | FZ2 | 3.2 | 38% | 47% | 35% | 20% | 1 | 0 | AC-031 (Summit Ln, 6 ft) | 3 |
| 27 | Panoramic Wy | — – Orchard Ln | BER-058 | FZ3 | 23 | 20% | 25% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3 |
| 28 | Panoramic Wy | Mosswood Rd – Orchard Ln | BER-058 | FZ3 | 2.4 | 10% | 18% | 10% | 80% | 2 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 3 |
| 29 | Panoramic Wy | Orchard Ln – — | BER-058 | FZ3 | 28 | 17% | 25% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.9 |
| 30 | Summit Rd | Ajax Pl – — | BER-031 | FZ2 | 5 | 25% | 25% | 33% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.8 |
| 31 | Ajax Pl | Summit Rd – dead end | BER-031 | FZ2 | 3.8 | 25% | 25% | 33% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.8 |
| 32 | Mosswood Rd | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 17 | 17% | 17% | 17% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.8 |
| 33 | Summit Rd | — – Summit Ln | BER-031 | FZ2 | 10.2 | 42% | 50% | 42% | 20% | 0 | 0 | — | 2.8 |
| 34 | Summit Rd | — – — | BER-031 | FZ2 | 3.9 | 40% | 50% | 33% | 40% | 0 | 0 | — | 2.8 |
| 35 | Grizzly Peak Bl | Summit Rd – — | BER-031 | FZ2 | 10.9 | 45% | 50% | 45% | 0% | 0 | 0 | — | 2.8 |
| 36 | Hill Rd | — – — | BER-031 | FZ2 | 8.8 | 25% | 25% | 37% | 45% | 1 | 0 | AC-141 (Hill Rd, 9 ft) | 2.7 |
| 37 | Mosswood Ln | Orchard Ln – Mosswood Rd | BER-058 | FZ3 | 25.4 | 13% | 17% | 15% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.7 |
| 38 | Summit Rd | Ajax Pl – — | BER-031 | FZ2 | 2.1 | 25% | 25% | 25% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.7 |
| 39 | Summit Rd | Ajax Pl – — | BER-031 | FZ2 | 1.7 | 22% | 25% | 30% | 65% | 1 | 0 | AC-173 (Summit Rd, 12 ft) | 2.7 |
| 40 | Orchard Ln | Panoramic Wy – Mosswood Ln | BER-058 | FZ3 | 5.5 | 13% | 17% | 13% | 80% | 1 | 0.5 | AC-155 (Panoramic Wy, 9 ft) | 2.6 |

**Ranked by fire exposure alone** (front, ember and cut with the same weights, static factors left out), the top 15 are:

| # | Street | Between | Zone | Households | Front | Ember | Cut | Exposure score | Rank by full score |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Buena Vista Wy | Del Mar Av – dead end | BER-032 | 16.3 | 48% | 55% | 40% | 2.8 | 23 |
| 2 | Grizzly Peak Bl | Summit Rd – — | BER-031 | 10.9 | 45% | 50% | 45% | 2.8 | 35 |
| 3 | Summit Rd | — – Summit Ln | BER-031 | 10.2 | 42% | 50% | 42% | 2.6 | 33 |
| 4 | Buena Vista Wy | Maybeck Twin Dr – Del Mar Av | BER-032 | 39.1 | 43% | 57% | 35% | 2.6 | 43 |
| 5 | Cedar St | Euclid Av – Leroy Av | BER-040 | 51.3 | 43% | 53% | 33% | 2.5 | 48 |
| 6 | Campus Dr | Avenida Dr – Parnassus Rd | BER-032 | 10.5 | 37% | 55% | 37% | 2.4 | 54 |
| 7 | Summit Rd | — – — | BER-031 | 3.9 | 40% | 50% | 33% | 2.4 | 34 |
| 8 | Olympus Av | Avenida Dr – Harding Ci | BER-032 | 11.9 | 40% | 48% | 33% | 2.3 | 58 |
| 9 | Cedar St | Leroy Av – La Loma Av | BER-040 | 25.8 | 40% | 55% | 28% | 2.3 | 62 |
| 10 | Del Mar Av | Glendale Av – Campus Dr | BER-032 | 9.1 | 38% | 53% | 32% | 2.3 | 57 |
| 11 | Summit Ln | dead end – Summit Rd | BER-031 | 3.2 | 38% | 47% | 35% | 2.3 | 26 |
| 12 | Grizzly Peak Bl | — – — | BER-031 | 7.1 | 38% | 50% | 33% | 2.3 | 64 |
| 13 | Avenida Dr | Fairlawn Dr – — | BER-031 | 5 | 38% | 52% | 32% | 2.3 | 66 |
| 14 | Campus Dr | Del Mar Av – Avenida Dr | BER-032 | 10.4 | 37% | 58% | 30% | 2.3 | 60 |
| 15 | Parnassus Rd | W Parnassus Ct – Campus Dr | BER-032 | 8.1 | 35% | 50% | 37% | 2.3 | 61 |

## Buyout cases

| Case | Blocks | Households | Residents | Streets | Behind a dead-end choke (residents) | Outermost areas: residents before → after | Fires that threaten it |
|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 4 | 73 | 173 | Panoramic Pl, Panoramic Wy | 173 | AC-155 Panoramic Wy: 972 → 799 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 100 households | 5 | 107 | 255 | Panoramic Pl, Panoramic Wy | 255 | AC-155 Panoramic Wy: 972 → 717 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 250 households | 21 | 251 | 595 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd | 595 | AC-155 Panoramic Wy: 972 → 377 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Top-ranked blocks, about 500 households | 43 | 520 | 1,231 | Panoramic Pl, Panoramic Wy, Dwight Pl, Dwight Wy, Arden Rd, Orchard Ln, Buena Vista Wy, Mosswood Rd +7 | 1,079 | AC-155 Panoramic Wy: 972 → 42; AC-193 Buena Vista Wy: 39 → 0; AC-031 Summit Ln: 8 → 0; AC-173 Summit Rd: 39 → 9; AC-141 Hill Rd: 21 → 1; AC-058 Olympus Av: 34 → 12; AC-098 Summit Rd: 31 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 22 | 259 | 614 | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd, Dwight Wy, Dwight Pl | 614 | AC-155 Panoramic Wy: 972 → 358 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 33 | 410 | 972 | Panoramic Wy, Mosswood Rd, Orchard Ln, Panoramic Pl, Mosswood Ln, Arden Rd, Dwight Wy, Dwight Pl | 972 | AC-155 Panoramic Wy: 972 → 0 | 1923 repeat, east wind, night, Panoramic Hill, east wind, weekday |

A fire threatens a case if, in any of its runs, a bought-out block's zone was ordered or warned or embers reached it. Bought-out households vary by seed around the expected count (the simulator draws whole households); the runs below removed the households the seed placed there.

## Evacuation effect, fire on

Cells: central-severity median without → with the buyout, then (better / worse / no different) over all same-seed pairs. "Every pair" lists the measures better in every pair.

### Benefit 1: the bought-out residents (run without the buyout)

| Case | Fire | Bought-out residents | Still home when the fire front arrived | … when embers arrived | Their cars on a street when the fire front reached it | Their cars cut off at the end |
|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 171 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | east wind, night | 171 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 50 households | Panoramic Hill | 171 | 135 (31–173) | 171 (107–175) | 57 | 56 |
| Top-ranked blocks, about 50 households | east wind, weekday | 171 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | 1923 repeat | 254 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | east wind, night | 254 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 100 households | Panoramic Hill | 254 | 204 (50–251) | 254 (161–258) | 78 | 64 |
| Top-ranked blocks, about 100 households | east wind, weekday | 254 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | 1923 repeat | 595 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | east wind, night | 595 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 250 households | Panoramic Hill | 595 | 346 (73–533) | 529 (268–564) | 165 | 142 |
| Top-ranked blocks, about 250 households | east wind, weekday | 595 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Top-ranked blocks, about 500 households | 1923 repeat | 1,235 | 69 (24–161) | 168 (45–185) | 31 | 25 |
| Top-ranked blocks, about 500 households | east wind, night | 1,235 | 52 (0–178) | 185 (33–251) | 36 | 24 |
| Top-ranked blocks, about 500 households | Panoramic Hill | 1,235 | 389 (73–787) | 754 (277–886) | 186 | 162 |
| Top-ranked blocks, about 500 households | east wind, weekday | 1,235 | 66 (14–204) | 211 (45–249) | 35 | 27 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 614 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 614 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 614 | 337 (73–545) | 545 (268–583) | 161 | 139 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 614 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 972 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 972 | 0 (0–0) | 0 (0–0) | 0 | 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 972 | 389 (73–813) | 777 (280–924) | 186 | 162 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 972 | 0 (0–0) | 0 (0–0) | 0 | 0 |

Central median, then the range over all severities and seeds. With the buyout these are zero by definition.

### Benefit 2: the neighbors behind the same choke

| Case | Fire | Neighbors | Still home when the fire front arrived | … when embers arrived | Cars on a street when the fire front reached it | Cars cut off at the end | 90% out, min | 100% out, min | Area (all its cars) 90% out |
|---|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 801 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 112 (6/4/5) | 173 → 173 (2/6/7) | 112 → 111 (12/2/1) |
| Top-ranked blocks, about 50 households | east wind, night | 801 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (6/5/4) | 136 → 137 (2/7/6) | 93 → 93 (6/9/0) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 801 | 254 → 254 (0/0/15) | 607 → 607 (0/0/15) | 126 → 126 (9/4/2) | 105 → 105 (3/3/9) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 50 households | east wind, weekday | 801 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 108 → 108 (6/5/4) | 173 → 173 (2/5/8) | 109 → 107 (12/3/0) |
| Top-ranked blocks, about 100 households | 1923 repeat | 718 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 117 → 110 (8/4/3) | 173 → 173 (3/8/4) | 112 → 109 (8/6/1) |
| Top-ranked blocks, about 100 households | east wind, night | 718 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 94 (7/6/2) | 136 → 136 (4/5/6) | 93 → 94 (6/9/0) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 718 | 185 → 185 (0/0/15) | 524 → 524 (0/0/15) | 104 → 99 (6/4/5) | 93 → 93 (0/4/11) | not all out → not all out (2/0/13) | not all out → not all out (0/0/15) | not all out → not all out (5/0/10) |
| Top-ranked blocks, about 100 households | east wind, weekday | 718 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (5/8/2) | 173 → 173 (2/4/9) | 109 → 109 (3/12/0) |
| Top-ranked blocks, about 250 households | 1923 repeat | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 118 → 112 (8/4/3) | 153 → 153 (8/3/4) | 112 → 106 (10/5/0) |
| Top-ranked blocks, about 250 households | east wind, night | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (5/6/4) | 136 → 136 (2/9/4) | 93 → 93 (6/9/0) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 379 | 52 → 52 (0/0/15) | 254 → 254 (0/0/15) | 25 → 20 (7/2/6) | 15 → 15 (0/1/14) | 111 → 111 (3/1/11) | not all out → not all out (0/4/11) | not all out → 116 (9/0/6) |
| Top-ranked blocks, about 250 households | east wind, weekday | 379 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (5/6/4) | 154 → 153 (2/5/8) | 109 → 106 (11/4/0) |
| Top-ranked blocks, about 500 households | 1923 repeat | 64 | 9 → 9 (0/0/15) | 9 → 9 (0/0/15) | 3 → 3 (1/2/12) | 2 → 2 (0/0/15) | 103 → 103 (4/3/8) | not all out → not all out (2/2/11) | 122 → 88 (11/1/3) |
| Top-ranked blocks, about 500 households | east wind, night | 64 | 0 → 0 (0/0/15) | 12 → 12 (0/0/15) | 3 → 3 (0/0/15) | 3 → 3 (0/0/15) | 119 → 119 (2/4/9) | not all out → not all out (1/3/11) | 100 → 119 (5/7/3) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 64 | 2 → 2 (0/0/15) | 28 → 28 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 101 → 101 (6/1/8) | 104 → 104 (2/5/8) | not all out → 93 (10/0/5) |
| Top-ranked blocks, about 500 households | east wind, weekday | 64 | 0 → 0 (0/0/15) | 12 → 12 (0/0/15) | 2 → 2 (0/0/15) | 2 → 2 (0/0/15) | 153 → 153 (1/2/12) | not all out → not all out (2/2/11) | 125 → 80 (10/0/5) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 119 → 110 (5/5/5) | 153 → 153 (7/4/4) | 112 → 107 (9/6/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 97 → 96 (3/7/5) | 136 → 136 (3/5/7) | 93 → 96 (3/12/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 360 | 57 → 57 (0/0/15) | 232 → 232 (0/0/15) | 25 → 23 (5/2/8) | 14 → 14 (0/1/14) | 116 → 116 (2/4/9) | not all out → not all out (1/1/13) | not all out → 116 (8/0/7) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 360 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 111 → 111 (5/7/3) | 154 → 153 (6/7/2) | 109 → 108 (6/9/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 0 | no one is left behind the choke | | | | | | |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 | no one is left behind the choke | | | | | | |

### Whole model area

| Case | Fire | People still there when the fire front arrived (home or road) | … at home | … when embers arrived | Cars cut off at the end | Region 90% out, min | Region 100% out, min | Same zones: still home at the fire front |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 603 → 599 (8/3/4) | 384 → 384 (3/2/10) | 6,042 → 6,103 (4/11/0) | 78 → 78 (1/6/8) | 97 → 97 (8/4/3) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | east wind, night | 412 → 404 (6/5/4) | 225 → 225 (0/0/15) | 5,097 → 5,091 (8/6/1) | 50 → 50 (3/2/10) | 92 → 92 (5/5/5) | not all out → not all out (0/1/14) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 50 households | Panoramic Hill | 3,942 → 3,706 (15/0/0) | 3,294 → 3,164 (15/0/0) | 16,036 → 15,790 (15/0/0) | 242 → 187 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 424 → 424 (0/0/15) |
| Top-ranked blocks, about 50 households | east wind, weekday | 419 → 427 (9/5/1) | 254 → 254 (0/0/15) | 5,811 → 5,789 (8/4/3) | 67 → 67 (3/1/11) | 106 → 106 (7/3/5) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | 1923 repeat | 603 → 599 (7/5/3) | 384 → 384 (2/3/10) | 6,042 → 6,042 (6/8/1) | 78 → 78 (3/3/9) | 97 → 96 (11/3/1) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | east wind, night | 412 → 412 (5/5/5) | 225 → 225 (0/0/15) | 5,097 → 5,097 (8/3/4) | 50 → 48 (2/2/11) | 92 → 92 (4/7/4) | not all out → not all out (2/0/13) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 100 households | Panoramic Hill | 3,942 → 3,598 (15/0/0) | 3,294 → 3,100 (15/0/0) | 16,036 → 15,638 (15/0/0) | 242 → 180 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 358 → 358 (0/0/15) |
| Top-ranked blocks, about 100 households | east wind, weekday | 419 → 417 (10/1/4) | 254 → 254 (0/0/15) | 5,811 → 5,821 (6/9/0) | 67 → 67 (4/2/9) | 106 → 106 (4/4/7) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | 1923 repeat | 603 → 601 (9/3/3) | 384 → 384 (2/3/10) | 6,042 → 6,022 (7/8/0) | 78 → 78 (3/4/8) | 97 → 96 (14/1/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, night | 412 → 404 (4/9/2) | 225 → 225 (1/0/14) | 5,097 → 5,095 (8/6/1) | 50 → 50 (2/3/10) | 92 → 92 (6/7/2) | not all out → not all out (0/1/14) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 250 households | Panoramic Hill | 3,942 → 3,251 (15/0/0) | 3,294 → 2,934 (15/0/0) | 16,036 → 15,006 (15/0/0) | 242 → 115 (15/0/0) | not all out → 112 (10/0/5) | not all out → not all out (4/0/11) | 216 → 216 (0/0/15) |
| Top-ranked blocks, about 250 households | east wind, weekday | 419 → 417 (7/6/2) | 254 → 254 (0/0/15) | 5,811 → 5,807 (8/7/0) | 67 → 67 (2/3/10) | 106 → 106 (6/3/6) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Top-ranked blocks, about 500 households | 1923 repeat | 603 → 508 (15/0/0) | 384 → 325 (15/0/0) | 6,042 → 5,780 (15/0/0) | 78 → 55 (15/0/0) | 97 → 95 (15/0/0) | not all out → not all out (0/0/15) | 116 → 116 (0/0/15) |
| Top-ranked blocks, about 500 households | east wind, night | 412 → 258 (15/0/0) | 225 → 166 (14/0/1) | 5,097 → 4,677 (15/0/0) | 50 → 26 (13/0/2) | 92 → 92 (11/3/1) | not all out → not all out (2/0/13) | 95 → 95 (0/0/15) |
| Top-ranked blocks, about 500 households | Panoramic Hill | 3,942 → 3,135 (15/0/0) | 3,294 → 2,863 (15/0/0) | 16,036 → 14,553 (15/0/0) | 242 → 94 (15/0/0) | not all out → 114 (10/0/5) | not all out → not all out (4/0/11) | 168 → 168 (0/0/15) |
| Top-ranked blocks, about 500 households | east wind, weekday | 419 → 278 (15/0/0) | 254 → 187 (15/0/0) | 5,811 → 5,338 (15/0/0) | 67 → 34 (15/0/0) | 106 → 105 (15/0/0) | not all out → not all out (3/0/12) | 149 → 149 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 603 → 608 (7/7/1) | 384 → 384 (2/2/11) | 6,042 → 6,021 (9/5/1) | 78 → 77 (4/4/7) | 97 → 96 (13/2/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 412 → 408 (7/5/3) | 225 → 225 (0/0/15) | 5,097 → 5,099 (5/8/2) | 50 → 50 (3/0/12) | 92 → 92 (4/8/3) | not all out → not all out (1/1/13) | 0 → 0 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | 3,942 → 3,253 (15/0/0) | 3,294 → 2,936 (15/0/0) | 16,036 → 14,904 (15/0/0) | 242 → 114 (15/0/0) | not all out → 112 (10/0/5) | not all out → not all out (4/0/11) | 228 → 228 (0/0/15) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 419 → 417 (10/2/3) | 254 → 254 (0/0/15) | 5,811 → 5,815 (9/6/0) | 67 → 67 (3/4/8) | 106 → 106 (9/3/3) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 603 → 606 (8/6/1) | 384 → 384 (2/2/11) | 6,042 → 6,038 (11/4/0) | 78 → 78 (5/1/9) | 97 → 96 (15/0/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 412 → 412 (5/4/6) | 225 → 225 (0/0/15) | 5,097 → 5,101 (8/6/1) | 50 → 48 (1/0/14) | 92 → 92 (8/6/1) | not all out → not all out (1/0/14) | 0 → 0 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | 3,942 → 3,136 (15/0/0) | 3,294 → 2,861 (15/0/0) | 16,036 → 14,503 (15/0/0) | 242 → 94 (15/0/0) | not all out → 115 (10/0/5) | not all out → not all out (4/0/11) | 161 → 161 (0/0/15) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 419 → 415 (5/7/3) | 254 → 254 (0/0/15) | 5,811 → 5,787 (7/8/0) | 67 → 67 (2/3/10) | 106 → 106 (10/5/0) | not all out → not all out (0/0/15) | 0 → 0 (0/0/15) |

### Where the change comes from

Median over same-seed pairs of the change in people still home when the fire front arrived and in cars cut off, split into the bought-out residents (benefit 1), the neighbors (benefit 2) and everyone else. Central severity; "elsewhere" range over all pairs.

| Case | Fire | Still home at the fire front: total = bought out + neighbors + elsewhere | Elsewhere, range | Cars cut off: total = bought out + neighbors + elsewhere | Elsewhere, range |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 1923 repeat | 0 = 0 + 0 + 0 | -17 to 28 | 0 = 0 + 0 + 0 | -11 to 33 |
| Top-ranked blocks, about 50 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -1 to 2 |
| Top-ranked blocks, about 50 households | Panoramic Hill | -135 = -135 + 0 + 0 | -1 to 1 | -55 = -56 + 0 + 0 | -2 to 5 |
| Top-ranked blocks, about 50 households | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -4 to 2 |
| Top-ranked blocks, about 100 households | 1923 repeat | 0 = 0 + 0 + 0 | -14 to 7 | 0 = 0 + 0 + 0 | -18 to 8 |
| Top-ranked blocks, about 100 households | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 2 |
| Top-ranked blocks, about 100 households | Panoramic Hill | -204 = -204 + 0 + 0 | -1 to 1 | -63 = -64 + 0 + 1 | -2 to 2 |
| Top-ranked blocks, about 100 households | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -4 to 2 |
| Top-ranked blocks, about 250 households | 1923 repeat | 0 = 0 + 0 + 0 | -29 to 19 | 0 = 0 + 0 + 0 | -26 to 14 |
| Top-ranked blocks, about 250 households | east wind, night | 0 = 0 + 0 + 0 | -3 to 0 | 0 = 0 + 0 + 0 | -1 to 3 |
| Top-ranked blocks, about 250 households | Panoramic Hill | -346 = -346 + 0 + 0 | -1 to 1 | -141 = -142 + 0 + 0 | -2 to 4 |
| Top-ranked blocks, about 250 households | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -3 to 3 |
| Top-ranked blocks, about 500 households | 1923 repeat | -69 = -69 + 0 + 0 | -17 to 36 | -25 = -25 + 0 + 0 | -19 to 33 |
| Top-ranked blocks, about 500 households | east wind, night | -52 = -52 + 0 + 0 | -1 to 1 | -24 = -24 + 0 + 0 | -1 to 2 |
| Top-ranked blocks, about 500 households | Panoramic Hill | -389 = -389 + 0 + 0 | -1 to 1 | -161 = -162 + 0 + 0 | -2 to 3 |
| Top-ranked blocks, about 500 households | east wind, weekday | -67 = -66 + 0 + 0 | -2 to 0 | -27 = -27 + 0 + 0 | -3 to 2 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 1923 repeat | 0 = 0 + 0 + 0 | -17 to 31 | 0 = 0 + 0 + 0 | -21 to 18 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 0 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | Panoramic Hill | -336 = -337 + 0 + 0 | -1 to 1 | -138 = -139 + 0 + 0 | -3 to 3 |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -4 to 3 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 1923 repeat | 0 = 0 + 0 + 0 | -12 to 38 | 0 = 0 + 0 + 0 | -50 to 1 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, night | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -2 to 0 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | Panoramic Hill | -389 = -389 + 0 + 0 | -1 to 1 | -161 = -162 + 0 + 0 | -2 to 2 |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | east wind, weekday | 0 = 0 + 0 + 0 | 0 to 0 | 0 = 0 + 0 + 0 | -5 to 4 |

### Effects that hold in every same-seed pair

- Top-ranked blocks, about 50 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 50 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors clearP90 (5 of 15), area clearP90 (5 of 15).
- Top-ranked blocks, about 50 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 100 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 100 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: overall clearP100 (2 of 15).
- Top-ranked blocks, about 100 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (5 of 15), neighbors clearP90 (2 of 15), area clearP90 (5 of 15).
- Top-ranked blocks, about 100 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 250 households, east wind, night (15 pairs): better in every pair: none. Never worse, better in some: overall frontHome (1 of 15).
- Top-ranked blocks, about 250 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (4 of 15), area clearP90 (9 of 15), area clearP100 (5 of 15).
- Top-ranked blocks, about 250 households, east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Top-ranked blocks, about 500 households, 1923 repeat (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront, overall clearP90. Never worse, better in some: area clearP100 (5 of 15).
- Top-ranked blocks, about 500 households, east wind, night (15 pairs): better in every pair: overall frontPeople, overall emberPeople, overall vehFireFront. Never worse, better in some: overall frontHome (14 of 15), overall vehNoRoute (13 of 15), overall clearP100 (2 of 15), area clearP100 (6 of 15).
- Top-ranked blocks, about 500 households, Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (4 of 15), area clearP90 (10 of 15), area clearP100 (5 of 15).
- Top-ranked blocks, about 500 households, east wind, weekday (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront, overall clearP90. Never worse, better in some: overall clearP100 (3 of 15), area clearP90 (10 of 15), area clearP100 (6 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), 1923 repeat (15 pairs): better in every pair: none. Never worse, better in some: none.
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, night (15 pairs): better in every pair: none. Never worse, better in some: overall vehNoRoute (3 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (4 of 15), area clearP90 (8 of 15), area clearP100 (5 of 15).
- Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158), east wind, weekday (15 pairs): better in every pair: none. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), 1923 repeat (15 pairs): better in every pair: overall clearP90, area clearP90, area clearP100. Never worse, better in some: none.
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, night (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: overall vehNoRoute (1 of 15), overall clearP100 (1 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), Panoramic Hill (15 pairs): better in every pair: overall frontPeople, overall frontHome, overall emberPeople, overall vehNoRoute, overall vehFireFront. Never worse, better in some: overall clearP90 (10 of 15), overall clearP100 (4 of 15), area clearP90 (10 of 15), area clearP100 (5 of 15).
- Everything behind the foot of Panoramic Way (9 ft clear, AC-155), east wind, weekday (15 pairs): better in every pair: area clearP90, area clearP100. Never worse, better in some: none.

Measure names: frontPeople and frontHome, people still there (home or road) and at home when the fire front arrived; emberPeople, when embers arrived; vehNoRoute, cars cut off at the end; vehFireFront, cars on a street when the fire front reached it; clearP90 and clearP100, 90% and 100% out.

## Engine reach

Synthetic residents of Berkeley's Fire Zones 2–3 whose street no engine reaches within the City's 5-minute standard at ignition (js/sim.js engine reach), seeds 1–5, weekday (S4) and night (S6) parking: median of 10 without → with (better / worse of 10). "Parked cars kept" is the main rule; "cleared" also removes the parked cars on bought-out blocks (model rule, sensitivity).

| Case | Bought-out residents beyond 5 min | Neighbors beyond 5 min, parked cars kept | … cleared | All hill residents beyond 5 min, kept | … cleared |
|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 171 | 782 → 782 (0/0) | 782 → 782 (0/0) | 1,260 → 1,102 (8/0) | 1,260 → 1,102 (8/0) |
| Top-ranked blocks, about 100 households | 254 | 699 → 699 (0/0) | 699 → 699 (0/0) | 1,260 → 1,061 (8/0) | 1,260 → 1,061 (8/0) |
| Top-ranked blocks, about 250 households | 595 | 358 → 358 (0/0) | 358 → 358 (0/0) | 1,260 → 727 (8/0) | 1,260 → 727 (8/0) |
| Top-ranked blocks, about 500 households | 960 | 26 → 26 (0/0) | 26 → 26 (0/0) | 1,260 → 407 (10/0) | 1,260 → 393 (10/0) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 614 | 339 → 339 (0/0) | 339 → 339 (0/0) | 1,260 → 708 (8/0) | 1,260 → 708 (8/0) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 953 | 0 → 0 (0/0) | 0 → 0 (0/0) | 1,260 → 416 (8/0) | 1,260 → 416 (8/0) |
| Sensitivity: the lowest block of Panoramic Way only (Panoramic Wy, 8.4 households; not run with the fire) | 0 | 953 → 953 (0/0) | 953 → 9 (8/0) | 1,260 → 1,260 (0/0) | 1,260 → 421 (8/0) |

## Costs and losses (screening estimate)

A screening estimate from public figures and labeled assumptions, not an appraisal, policy or legal analysis, and not a statement of what any owner would accept. One synthetic household is counted as one housing unit. Housing units lost equal households bought out; residents displaced are households × 2.37 (synthetic). Rounded to $0.1M.

| Case | Housing units lost | Residents displaced | Acquisition | Relocation | Demolition and restoration | Total | Per household | Notes |
|---|---|---|---|---|---|---|---|---|
| Top-ranked blocks, about 50 households | 73 | 173 | $61.4M–$192M | $0k–$3.2M | $1.5M–$7.3M | $62.9M–$202M | $863k–$2.8M | 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 100 households | 107 | 255 | $90.5M–$282M | $0k–$4.7M | $2.1M–$10.7M | $92.6M–$298M | $863k–$2.8M | 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 250 households | 251 | 595 | $253M–$637M | $0k–$11.0M | $5.0M–$25.1M | $258M–$673M | $1.0M–$2.7M | 35 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Top-ranked blocks, about 500 households | 520 | 1,231 | $486M–$1226M | $0k–$22.8M | $10.4M–$51.9M | $496M–$1300M | $955k–$2.5M | 35 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | 259 | 614 | $260M–$658M | $0k–$11.4M | $5.2M–$25.9M | $265M–$696M | $1.0M–$2.7M | 35 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | 410 | 972 | $386M–$1055M | $0k–$18.0M | $8.2M–$41.0M | $395M–$1114M | $962k–$2.7M | 35 households in block groups whose median is top-coded at $2,000,001 (high end low); 4 in block groups with no median (case average used) |
| Sensitivity: the lowest block of Panoramic Way only | 8 | 20 | $7.1M–$22.2M | $0k–$400k | $200k–$800k | $7.3M–$23.4M | $863k–$2.8M | — |

- **Acquisition (sourced statistic, assumption in its use).** Each household at the ACS median value of owner-occupied homes in its block group, low = median − margin of error, high = median + margin of error. A buyout pays the appraised value of each property, which the block-group median does not give.
- **Relocation (sourced figures, assumption in their use).** $0–$43,890 per household. Owner-occupants who sell voluntarily are not displaced persons under the Uniform Relocation Act (49 CFR 24.101(b)), so the low end assumes every household is one and receives nothing. The high end assumes a program pays every household the URA homeowner replacement housing payment maximum ($41,200, 49 CFR 24.401(b)) plus an 8-room fixed move ($2,690). Tenants who must move are covered by the Act; their entitlement, up to $9,570 rental assistance (49 CFR 24.402(b)) plus a move ($12,260 at most), lies inside the range. The split between owners and renters (ACS B25003) could not be retrieved, so the range is wide.
- **Demolition and site restoration (sourced low, assumed high).** $20,000–$100,000 per household: the Delaware County (PA) program's $20,000–$50,000 range, high end doubled for Bay Area costs and hillside access.
- Left out: closing, appraisal and legal costs, program administration, lost property-tax revenue, maintenance of the open land, and any effect on the value of neighboring homes.

## Retreat or a second way out

Step 2 figures are **provisional**: origin/egress-candidates (PR #15, under review), commit a7cb54f, data/model/egress-candidates.json built 2026-11-01. They come from a different harness (step 2 counts every car starting in the area, these tables count residents' cars) and the same fires, severities and seeds; the Panoramic Hill fire, first order 10 minutes after ignition, central-severity medians.

| Option | Kind | Residents protected or freed | Effect on the residents who stay (Panoramic Hill fire) | Homes lost | Screening cost |
|---|---|---|---|---|---|
| Everything behind the foot of Panoramic Way (9 ft clear, AC-155) | buyout | 972 bought out; behind the foot of Panoramic Way 972 → 0 | neighbors' cars cut off 0 → 0 (0/0/15); still home at the fire front 0 → 0 (0/0/15) | 410 | $395M–$1114M |
| Panoramic Hill upper streets (behind the second choke on Panoramic Way, AC-158) | buyout | 614 bought out; behind the foot of Panoramic Way 972 → 358 | neighbors' cars cut off 14 → 14 (0/1/14); still home at the fire front 57 → 57 (0/0/15) | 259 | $265M–$696M |
| AC-160-N3 Panoramic Wy → Smyth Ln (88 m, 21% average grade) | second way out (provisional) | 823 hill residents freed from behind every choke; AC-155 972 → 202 behind a choke | area cars cut off 163 → 150 (13/0/2); still home at the fire front 389 → 389 | 1 building in the corridor | $1.5M–$6.0M |
| AC-134-N2 Smyth Ln → Dwight Wy (92 m, 27.4% average grade) | second way out (provisional) | 823 hill residents freed from behind every choke; AC-155 972 → 202 behind a choke | area cars cut off 163 → 142 (13/0/2); still home at the fire front 389 → 389 | 1 building in the corridor | $1.6M–$7.4M |
| CITY-1 Dwight Wy → Dwight Pl (174 m, 40.2% average grade) | second way out (provisional) | 777 hill residents freed from behind every choke; AC-155 972 → 194 behind a choke | area cars cut off 163 → 131 (15/0/0); still home at the fire front 389 → 389 | 0 buildings in the corridor | $1.3M–$10.6M |

Other areas with both a buyout block in the cases above and a step 2 link: AC-134-N1 (Smyth Ln → Panoramic Wy, frees 483, $2.9M–$10.2M); AC-155-O1 (Mosswood Rd → Canyon Rd, frees 337, $1.3M–$6.8M); AC-156-N3 (Mosswood Rd → Canyon Rd, frees 308, $2.3M–$9.4M); AC-155-N3 (Panoramic Wy → Smyth Ln, frees 276, $2.9M–$11.4M); AC-193-N1 (Buena Vista Wy → W Parnassus Ct, frees 48, $1.9M–$6.1M).

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
- Step 2: origin/egress-candidates (PR #15, under review), commit a7cb54f, data/model/egress-candidates.json built 2026-11-01.
