# Second ways out: candidate road connections for access-constrained areas

Built 2026-11-01 by `node tools/egress-all.mjs` (`tools/egress-candidates.mjs`, `tools/egress-sim.mjs`, this report from `tools/egress-report.mjs`). Machine-readable results: `data/model/egress-candidates.json` and `data/model/egress-sim.json`. Step 2 of the egress and managed-retreat plan in `HANDOFF.md`; step 1 is `docs/access-constraints.md`.

This is an educational comparison, not a prediction and not an official evacuation plan. It is a screening of where a second way out could go, not engineering, environmental review or legal analysis: every line below is a straight line or an existing path between two points of the street network, and every cost is a range built from public figures and labeled assumptions. Residents are synthetic. Counts only: no parcel identifiers, owners, addresses or imagery are stored.

## Findings

- **One short, steep link would take most of Panoramic Hill out from behind every choke point.** AC-133-N3 (Panoramic Wy → Smyth Ln, 88 m, average grade 21%), AC-147-N2 (Smyth Ln → Dwight Wy, 92 m, average grade 27.4%), CITY-1 (Dwight Wy → Dwight Pl, 174 m, average grade 40.2%) each leave 167 of Panoramic Hill's 941 synthetic residents behind a choke (the lower stem by Memorial Stadium) and cut the hill residents behind two or more chokes in series by 620. The City's "2nd Route Out" (CITY-1, the Dwight Way–Dwight Place link the Time Study tested) has the same access effect as the two Smyth Ln links found here. All three are steep: the City line climbs 70 m in 174 m and would need about 467 m of road to hold a 15% grade. Screening cost ranges: AC-133-N3 $1.5M–$6.0M; AC-147-N2 $1.6M–$7.4M; CITY-1 $1.3M–$10.6M.
- **Elsewhere the largest single gains are smaller.** After Panoramic Hill, AC-541-N1 (Caldecott Ln → Tunnel Rd, 122 m) frees 243; AC-036-N2 (Oak Ridge Rd → The Uplands, 112 m) frees 72; AC-036-N1 (Oak Ridge Rd → Alvarado Rd, 92 m) frees 72; AC-036-N3 (Oak Ridge Rd → Tunnel Rd, 117 m) frees 72 hill residents. 83 of 133 candidates were pruned, 73 of them because the corridor would cross three or more buildings; 14 of 40 dead-end areas have no surviving link of their own.
- **With the fire on, a second way out changes almost nothing for people who have not yet left home, the Time Study's lesson (E25).** In 1,140 same-seed pairs, the number of an area's synthetic residents still at home when the fire front arrived changed in 23: when a household is ready to leave does not depend on the streets, so a new street gets no one out of the house sooner (the few changes are cars waiting for room on a full street, and neighbors riding with them). Where the fire never reaches the area (most tested areas on the 1923 and east-wind fires), the area's 90% clearance time moves by at most 0.3 minutes (central median), in either direction.
- **On the Panoramic Hill fire, the vehicles a link cannot help leave home after the fire is already on their street.** Without a link, about 129 of Panoramic Hill's roughly 539 vehicles end the run on the road with no route to safety (central median, first order 10 minutes after ignition). In seed 1 at central severity the fire reaches Panoramic Way from minute 39; the cut-off vehicles left home at a median of minute 98, and 95 of them are on Panoramic Way itself. The City concept carries about 40 cars in that run; cut-off vehicles change by 0 (better in 8, worse in 1, no different in 6 of 15 same-seed pairs).
- **Where a link does help: the fire closes the only exit while people are leaving.** AC-057-O2 (Olympus Av → Campus Dr) on the eastWind fire: the area's vehicles cut off 9 → 2 (better in 5, worse in 0, no different in 10 of 15 same-seed pairs); all vehicles cut off 53 → 48. AC-196-N1 (Buena Vista Wy → W Parnassus Ct) on the ref1923 fire: the area's vehicles cut off 3 → 0 (better in 7, worse in 0, no different in 8 of 15 same-seed pairs); all vehicles cut off 88 → 76. No effect holds in every same-seed pair, because at low severity the fire does not reach the exit; none was ever worse on this measure.
- **A later order (20 minutes after ignition instead of 10) leaves more vehicles cut off; the links' share of them stays small.** AC-133-N3 on panoramic: 147 → 144 (11/0/4); AC-147-N2 on panoramic: 147 → 147 (6/2/7); AC-057-O2 on eastWind: 9 → 4 (5/0/10); AC-196-N1 on ref1923: 4 → 0 (7/0/8); CITY-1 on panoramic: 147 → 147 (4/2/9).
- **Opening the Panoramic exit (County edge 2322) changes neither result.** It moves Panoramic Hill's choke from Stadium Rim Rd to the foot of Panoramic Way, so 903 residents stay behind one; with a top link added 167 remain, the same as on the network as it stands. Fire-on results with the exit opened are within a few vehicles of the as-is runs.

## Ranked candidates

49 candidates survived screening for 40 dead-end areas (plus the City concept, below). They are ranked by hill residents no longer behind any choke point when the link is added (access effect, no fire), then by the high end of the cost range. Several candidates for one area are alternatives, not a package. "Area residents behind a choke" counts the residents of the candidate's area who are still behind any choke afterward; nesting is the number of chokes in series. Grades are the ground under a straight line (4 m lidar DEM); a built road would cut, fill or switch back. Corridor: 12.2 m (40 ft, assumption). Parcels: Alameda County only; "no data" in Contra Costa County. Costs in 2024–2025 dollars, screening ranges (see Costs).

| # | Candidate | Area | Type | Link | Length, m | Climb and grade | On a path | Buildings in corridor | Parcels crossed / in corridor | Outside parcels | Land | Fire zone | Hill residents freed | Area residents behind a choke; nesting | Construction | Acquisition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AC-133-N3 | AC-133 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Smyth Ln | 88 | -18.4 m; avg 21%, 25 m windows p90 49.8% (worst 56.1%) (>20%) | 0% | 1 | 3 / 3 | 12% | — | FZ3 | 828 | 358 → 57; nesting 3 → 1 | $500k–$2.1M | $1.0M–$3.9M |
| 2 | AC-147-N2 | AC-147 Smyth Ln | new road | Smyth Ln → Dwight Wy | 92 | 25.1 m; avg 27.4%, 25 m windows p90 53.9% (worst 61%) (>20%) | 0% | 1 | 3 / 4 | 4% | — | FZ3 | 828 | 54 → 0; nesting 1 → 0 | $520k–$2.8M | $1.1M–$4.6M |
| 3 | AC-147-N1 | AC-147 Smyth Ln | new road | Smyth Ln → Panoramic Wy | 176 | 2.5 m; avg 1.4%, 25 m windows p90 34.4% (worst 41.2%) (>20%) | 0% | 2 | 4 / 5 | 7% | — | FZ2 | 527 | 54 → 0; nesting 1 → 0 | $1.0M–$3.0M | $1.9M–$7.2M |
| 4 | AC-541-N1 | AC-541 Caldecott Ln (also AC-542) | new road | Caldecott Ln → Tunnel Rd | 122 | 14 m; avg 11.5%, 25 m windows p90 36.8% (worst 50.4%) (>20%) | 0% | 0 | 2 / 2 | 8% | — | hill (≥90 m) | 243 | 276 → 33; nesting 1 → 1 | $690k–$2.1M | $110k–$380k |
| 5 | AC-036-N2 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → The Uplands | 112 | -1.4 m; avg 1.3%, 25 m windows p90 31.4% (worst 38.5%) (>20%) | 17% | 1 | 2 / 3 | 18% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $630k–$1.9M | $2.4M–$3.0M |
| 6 | AC-036-N1 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → Alvarado Rd | 92 | -3 m; avg 3.3%, 25 m windows p90 43.2% (worst 46.9%) (>20%) | 0% | 2 | 3 / 3 | 17% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $520k–$1.6M | $4.2M–$4.5M |
| 7 | AC-036-N3 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → Tunnel Rd | 117 | -10.2 m; avg 8.7%, 25 m windows p90 44.4% (worst 51.7%) (>20%) | 0% | 2 | 4 / 6 | 19% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $660k–$2.0M | $4.8M–$6.0M |
| 8 | AC-057-O2 | AC-057 Olympus Av, Wilson Ci | path upgrade | Olympus Av → Campus Dr | 190 | -36.3 m; avg 19.2%, 25 m windows p90 25.7% (worst 29.1%) (>20%) | 97% | 0 | 1 / 4 | 8% | UC 91% | FZ2 | 63 | 36 → 8; nesting 1 → 1 | $1.1M–$4.1M | $260k–$1.4M |
| 9 | AC-422-N3 | AC-422 Kingston Rd | new road | Kingston Rd → Sunset Te | 214 | 27.7 m; avg 13%, 25 m windows p90 25.3% (worst 37.1%) (>20%) | 0% | 0 | no data | — | — | hill (≥90 m) | 62 | 56 → 0; nesting 1 → 0 | $1.2M–$3.6M | — |
| 10 | AC-422-N2 | AC-422 Kingston Rd | new road | Kingston Rd → Berkeley Park Bl | 235 | -6.2 m; avg 2.6%, 25 m windows p90 13% (worst 14.6%) | 0% | 2 | no data | — | — | — | 56 | 56 → 0; nesting 1 → 0 | $1.3M–$4.0M | — |
| 11 | AC-010-N1 | AC-010 Napa Av | new road | Napa Av → Josephine St | 20 | 1.1 m; avg 5.4%, 25 m windows p90 5.4% (worst 5.4%) | 32% | 0 | 0 / 0 | 100% | — | FZ2 | 54 | 54 → 0; nesting 1 → 0 | $110k–$340k | $0k–$0k |
| 12 | AC-010-N2 | AC-010 Napa Av | new road | Napa Av → Hopkins St | 97 | -2.2 m; avg 2.3%, 25 m windows p90 3.8% (worst 4.7%) | 34% | 0 | 0 / 0 | 100% | — | FZ2 | 54 | 54 → 0; nesting 1 → 0 | $550k–$1.6M | $0k–$0k |
| 13 | AC-010-N3 | AC-010 Napa Av | new road | Napa Av → Sonoma Av | 99 | -4.5 m; avg 4.5%, 25 m windows p90 5.4% (worst 5.9%) | 22% | 1 | 0 / 1 | 100% | park 50% | FZ1 | 54 | 54 → 0; nesting 1 → 0 | $560k–$1.7M | $1.5M–$1.9M |
| 14 | AC-010-P1 | AC-010 Napa Av | open barrier | Napa Av → The Alameda | 3 | 0 m; avg 0%, 25 m windows p90 0% (worst 0%) | 100% | 0 | no data | — | — | FZ2 | 54 | 54 → 0; nesting 1 → 0 | — | not priced |
| 15 | AC-213-N1 | AC-213 High Ct, Laurel St … | new road | High Ct → Euclid Av | 76 | -4.2 m; avg 5.5%, 25 m windows p90 15% (worst 22.9%) | 28% | 2 | 6 / 7 | 60% | — | FZ2 | 51 | 104 → 53; nesting 1 → 1 | $430k–$1.3M | $3.3M–$5.9M |
| 16 | AC-226-N3 | AC-226 San Mateo Rd | new road | San Mateo Rd → San Diego Rd | 187 | 19.8 m; avg 10.6%, 25 m windows p90 22.6% (worst 33.9%) (>20%) | 23% | 2 | 4 / 5 | 14% | park 47% | FZ2 | 51 | 51 → 0; nesting 1 → 0 | $1.1M–$3.2M | $4.6M–$5.5M |
| 17 | AC-196-N1 | AC-196 Buena Vista Wy | new road | Buena Vista Wy → W Parnassus Ct | 97 | 25.9 m; avg 26.8%, 25 m windows p90 40% (worst 42.2%) (>20%) | 0% | 2 | 2 / 3 | 18% | — | FZ2 | 49 | 39 → 0; nesting 1 → 0 | $550k–$2.9M | $1.4M–$3.2M |
| 18 | AC-213-N2 | AC-213 High Ct, Laurel St … | new road | Laurel St → Glen Av | 99 | -12.2 m; avg 12.3%, 25 m windows p90 22.7% (worst 24.4%) (>20%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 43 | 104 → 62; nesting 1 → 1 | $560k–$1.7M | $0k–$0k |
| 19 | AC-213-P1 | AC-213 High Ct, Laurel St … | path upgrade | Laurel St → Oak St | 99 | -12.2 m; avg 12.3%, 25 m windows p90 22.7% (worst 24.4%) (>20%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 43 | 104 → 62; nesting 1 → 1 | $560k–$1.7M | $0k–$0k |
| 20 | AC-553-N2 | AC-553 Drury Ct, Drury Rd | new road | Drury Ct → Dartmouth Dr | 178 | -14.7 m; avg 8.2%, 25 m windows p90 68.1% (worst 81.2%) (>20%) | 26% | 1 | 6 / 7 | 33% | — | hill (≥90 m) | 43 | 43 → 0; nesting 1 → 0 | $1.0M–$3.0M | $3.2M–$5.0M |
| 21 | AC-553-N1 | AC-553 Drury Ct, Drury Rd | new road | Drury Ct → Drury Ln | 146 | 8.9 m; avg 6.1%, 25 m windows p90 38.4% (worst 54.1%) (>20%) | 0% | 2 | 7 / 10 | 12% | — | hill (≥90 m) | 43 | 43 → 0; nesting 1 → 0 | $830k–$2.5M | $5.6M–$8.0M |
| 22 | AC-521-P1 | AC-521 Spyglass Hill | open barrier | Spyglass Hill → Spyglass Hill | 3 | -0.4 m; avg 13.5%, 25 m windows p90 13.5% (worst 13.5%) | 0% | 0 | 17 / 17 | 0% | — | hill (≥90 m) | 41 | 40 → 0; nesting 1 → 0 | — | not priced |
| 23 | AC-521-N3 | AC-521 Spyglass Hill | new road | Spyglass Hill → Hiller Dr | 12 | -0.7 m; avg 5.8%, 25 m windows p90 5.8% (worst 5.8%) | 0% | 0 | 17 / 17 | 64% | — | hill (≥90 m) | 40 | 40 → 0; nesting 1 → 0 | $70k–$200k | $2.4M–$7.0M |
| 24 | AC-521-N1 | AC-521 Spyglass Hill | new road | Spyglass Hill → Starview Dr | 79 | 11.4 m; avg 14.5%, 25 m windows p90 19.1% (worst 19.5%) (>15%) | 0% | 0 | 17 / 17 | 90% | — | hill (≥90 m) | 40 | 40 → 0; nesting 1 → 0 | $450k–$1.3M | $2.4M–$7.0M |
| 25 | AC-140-N1 | AC-140 Maybeck Twin Dr | new road | Maybeck Twin Dr → La Loma Av | 80 | -21.8 m; avg 27.1%, 25 m windows p90 35.5% (worst 41.5%) (>20%) | 0% | 2 | 3 / 5 | 10% | — | FZ2 | 39 | 39 → 0; nesting 1 → 0 | $450k–$2.5M | $1.5M–$3.9M |
| 26 | AC-550-N1 | AC-550 Besito Av | new road | Besito Av → Gravatt Dr | 134 | -31.4 m; avg 23.4%, 25 m windows p90 47.2% (worst 55.2%) (>20%) | 0% | 2 | 5 / 6 | 21% | — | hill (≥90 m) | 39 | 39 → 0; nesting 1 → 0 | $760k–$3.5M | $4.8M–$6.0M |
| 27 | AC-128-N2 | AC-128 Panoramic Wy, Mosswood Rd … | new road | Rim Rd → Unnamed | 72 | -4.5 m; avg 6.2%, 25 m windows p90 9.8% (worst 12.4%) | 14% | 0 | 1 / 2 | 31% | UC 82% | FZ2 | 38 | 941 → 903; nesting 1 → 4 | $410k–$1.2M | — |
| 28 | AC-128-N3 | AC-128 Panoramic Wy, Mosswood Rd … | new road | Rim Rd → Warring St | 104 | -14.4 m; avg 13.8%, 25 m windows p90 21.6% (worst 23.3%) (>20%) | 42% | 1 | 1 / 1 | 58% | UC 23% | FZ2 | 38 | 941 → 903; nesting 1 → 4 | $590k–$1.8M | — |
| 29 | AC-128-P1 | AC-128 Panoramic Wy, Mosswood Rd … | path upgrade | Rim Rd → Prospect St | 45 | -3.7 m; avg 8.3%, 25 m windows p90 10% (worst 10.4%) | 100% | 1 | 0 / 0 | 100% | — | FZ2 | 38 | 941 → 903; nesting 1 → 4 | $250k–$760k | $840k–$2.6M |
| 30 | AC-002-N1 | AC-002 Hilgard Av | new road | Hilgard Av → La Loma Av | 157 | -39.8 m; avg 25.3%, 25 m windows p90 39% (worst 48.4%) (>20%) | 10% | 1 | 0 / 2 | 100% | — | FZ2 | 38 | 38 → 0; nesting 1 → 0 | $890k–$4.5M | $1.1M–$1.6M |
| 31 | AC-128-N1 | AC-128 Panoramic Wy, Mosswood Rd … | new road | Rim Rd → Prospect St | 42 | -3.7 m; avg 8.8%, 25 m windows p90 10.1% (worst 10.1%) | 100% | 1 | 0 / 19 | 100% | — | FZ2 | 38 | 941 → 903; nesting 1 → 4 | $240k–$710k | $2.4M–$14.4M |
| 32 | AC-232-N2 | AC-232 Le Conte Av | new road | Le Conte Av → La Vereda Rd | 113 | 7.5 m; avg 6.6%, 25 m windows p90 29.5% (worst 62.4%) (>20%) | 0% | 2 | 3 / 4 | 16% | — | FZ2 | 37 | 36 → 0; nesting 1 → 0 | $640k–$1.9M | $1.5M–$3.9M |
| 33 | AC-502-N1 | AC-502 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Derby St | 48 | -1.5 m; avg 3.1%, 25 m windows p90 4.2% (worst 4.2%) | 52% | 0 | 0 / 0 | 100% | — | FZ1 | 35 | 49 → 15; nesting 1 → 1 | $270k–$820k | $0k–$0k |
| 34 | AC-502-N3 | AC-502 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Unnamed | 66 | 1.6 m; avg 2.4%, 25 m windows p90 4.3% (worst 6%) | 93% | 1 | 1 / 2 | 25% | UC 78% | FZ1 | 35 | 49 → 15; nesting 1 → 1 | $370k–$1.1M | $2.2M–$2.5M |
| 35 | AC-502-P1 | AC-502 Tanglewood Rd, Unnamed … | open barrier | Tanglewood Rd → Derby St | 3 | -0.1 m; avg 3.3%, 25 m windows p90 3.3% (worst 3.3%) | 100% | 0 | 0 / 0 | 100% | — | FZ1 | 35 | 49 → 15; nesting 1 → 1 | — | not priced |
| 36 | AC-211-N1 | AC-211 Virginia St | new road | Virginia St → La Loma Av | 41 | -6.2 m; avg 15.1%, 25 m windows p90 16.4% (worst 17.6%) (>15%) | 51% | 0 | 0 / 1 | 100% | — | FZ2 | 32 | 32 → 0; nesting 1 → 0 | $230k–$700k | $100k–$320k |
| 37 | AC-057-O1 | AC-057 Olympus Av, Wilson Ci | path upgrade | Olympus Av → Unnamed | 123 | 1.6 m; avg 1.3%, 25 m windows p90 7.2% (worst 9.7%) | 99% | 0 | 1 / 2 | 6% | UC 94% | FZ2 | 29 | 36 → 8; nesting 1 → 1 | $700k–$2.1M | $130k–$710k |
| 38 | AC-502-N2 | AC-502 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Belrose Av | 53 | -3.3 m; avg 6.3%, 25 m windows p90 8% (worst 8.4%) | 100% | 1 | 0 / 1 | 100% | — | FZ2 | 27 | 49 → 22; nesting 1 → 1 | $300k–$900k | $2.0M–$2.0M |
| 39 | AC-075-N1 | AC-075 Bay Tree Ln | new road | Bay Tree Ln → Shasta Golf Course Rd | 93 | -17.3 m; avg 18.6%, 25 m windows p90 56.6% (worst 60.1%) (>20%) | 16% | 1 | 2 / 3 | 14% | — | FZ2 | 25 | 43 → 18; nesting 1 → 1 | $530k–$1.9M | $1.3M–$2.9M |
| 40 | AC-075-N3 | AC-075 Bay Tree Ln | new road | Bay Tree Ln → Park Hills Rd | 138 | -17.8 m; avg 12.9%, 25 m windows p90 41% (worst 53.3%) (>20%) | 16% | 2 | 4 / 6 | 40% | — | FZ2 | 25 | 43 → 18; nesting 1 → 1 | $780k–$2.4M | $3.9M–$5.3M |
| 41 | AC-075-N2 | AC-075 Bay Tree Ln | new road | Bay Tree Ln → Grizzly Peak Bl | 155 | -17.5 m; avg 11.3%, 25 m windows p90 34.3% (worst 44.8%) (>20%) | 0% | 2 | 3 / 5 | 19% | — | FZ2 | 25 | 43 → 18; nesting 1 → 1 | $880k–$2.6M | $2.5M–$5.4M |
| 42 | AC-502-O1 | AC-502 Tanglewood Rd, Unnamed … | path upgrade | Garber St → Garber St | 4 | 0 m; avg 0%, 25 m windows p90 0% (worst 0%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 23 | 49 → 44; nesting 1 → 1 | $20k–$70k | $0k–$0k |
| 43 | AC-499-N3 | AC-499 Stonewall Rd | new road | Stonewall Rd → Unnamed | 223 | -23.8 m; avg 10.7%, 25 m windows p90 21.4% (worst 28.9%) (>20%) | 39% | 2 | 3 / 6 | 9% | UC 85%, EBRPD 3% | FZ1 | 22 | 63 → 41; nesting 1 → 1 | $1.3M–$3.8M | $4.8M–$6.0M |
| 44 | AC-128-O1 | AC-128 Panoramic Wy, Mosswood Rd … | path upgrade | Canyon Rd → Unnamed | 79 | -10.1 m; avg 12.7%, 25 m windows p90 31.5% (worst 37.8%) (>20%) | 88% | 2 | 1 / 2 | 17% | UC 88% | FZ2 | 3 | 941 → 938; nesting 1 → 4 | $450k–$1.3M | — |
| 45 | AC-154-N1 | AC-154 Hill Rd | new road | Hill Rd → Grizzly Peak Bl | 89 | -24.9 m; avg 28.1%, 25 m windows p90 32.9% (worst 37.6%) (>20%) | 98% | 2 | 2 / 4 | 22% | — | FZ2 | 1 | 23 → 23; nesting 1 → 1 | $500k–$2.8M | $2.4M–$4.9M |
| 46 | AC-134-N3 | AC-134 Panoramic Pl | new road | Panoramic Pl → Panoramic Pl | 190 | 50.5 m; avg 26.6%, 25 m windows p90 29.5% (worst 37.1%) (>20%) | 66% | 0 | 2 / 3 | 4% | UC 95%, park 95% | hill (≥90 m) | 0 | 47 → 47; nesting 4 → 3 | $1.1M–$5.7M | $600k–$1.5M |
| 47 | AC-133-P1 | AC-133 Panoramic Wy, Panoramic Pl … | path upgrade | Panoramic Wy → Arden Rd | 60 | -15.3 m; avg 25.5%, 25 m windows p90 27.8% (worst 30.1%) (>20%) | 100% | 2 | 2 / 3 | 18% | — | FZ3 | 0 | 358 → 358; nesting 3 → 3 | $340k–$1.7M | $1.8M–$5.9M |
| 48 | AC-133-N2 | AC-133 Panoramic Wy, Panoramic Pl … (also AC-132) | new road | Panoramic Wy → Arden Rd | 59 | -15.3 m; avg 26%, 25 m windows p90 28% (worst 28.5%) (>20%) | 100% | 2 | 2 / 4 | 20% | — | FZ3 | 0 | 358 → 358; nesting 3 → 3 | $330k–$1.7M | $1.9M–$6.6M |
| 49 | AC-134-N2 | AC-134 Panoramic Pl | new road | Panoramic Pl → Mosswood Rd | 149 | -42.5 m; avg 28.4%, 25 m windows p90 35.2% (worst 36.5%) (>20%) | 11% | 2 | 3 / 6 | 10% | UC 56%, park 56% | FZ2 | 0 | 47 → 47; nesting 4 → 2 | $840k–$4.8M | $2.0M–$7.9M |


## Evacuation effect, fire on

`tools/egress-sim.mjs` adds each tested link to the network at run time (two-way local street, 20 ft, no parking, no homes on it; `tools/egress-link.mjs`) and runs the simulator for each fire that orders or reaches the area, at low, central and high severity × seeds 1–5, the same seed with and without the link, with the first order 10 minutes after ignition (the simulator default) and 20 minutes (a later order). The area measured is the largest chosen area whose residents the link changes; for links into Panoramic Hill that is all of Panoramic Hill (AC-128). Each cell gives the central-severity median without → with the link, then in brackets the number of the 15 same-seed pairs where the link made the measure better / worse / no different. Lower is better for every measure; a run in which not all of the area's vehicles got out within the simulated period has no 100% time and counts as worse than any time. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count. 1,380 runs.

| Candidate | Area measured | Fire | Order after, min | Area residents | Area: still home when the fire front arrived | … when embers arrived | Area vehicles on a street when the fire front reached it | Area vehicles cut off (no route at the end) | Area 90% out, min | Area 100% out, min | All vehicles cut off | All people still there when the fire front arrived |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 941 | 393 → 393 (0/0/15) | 763 → 763 (0/0/15) | 149 → 151 (5/7/3) | 129 → 127 (13/0/2) | not all out → not all out (4/0/11) | not all out → not all out (0/0/15) | 227 → 225 (13/0/2) | 3,862 → 3,879 (6/7/2) |
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 941 | 465 → 465 (0/0/15) | 813 → 813 (0/0/15) | 177 → 177 (7/4/4) | 147 → 144 (11/0/4) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 302 → 302 (10/0/5) | 4,118 → 4,135 (6/6/3) |
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (11/4/0) | 192 → 192 (3/4/8) | 88 → 88 (4/4/7) | 607 → 605 (5/8/2) |
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (6/6/3) | 192 → 192 (5/3/7) | 110 → 109 (6/3/6) | 721 → 735 (6/6/3) |
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (3/7/5) | 136 → 136 (5/7/3) | 53 → 53 (1/2/12) | 347 → 353 (6/5/4) |
| AC-133-N3 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (8/5/2) | 136 → 136 (7/6/2) | 73 → 74 (0/6/9) | 492 → 485 (3/5/7) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 941 | 393 → 393 (0/0/15) | 763 → 763 (0/0/15) | 149 → 148 (6/8/1) | 129 → 129 (6/0/9) | not all out → not all out (1/2/12) | not all out → not all out (0/0/15) | 227 → 221 (6/2/7) | 3,862 → 3,862 (7/6/2) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 941 | 465 → 465 (0/0/15) | 813 → 813 (0/0/15) | 177 → 175 (10/4/1) | 147 → 147 (6/2/7) | not all out → not all out (3/2/10) | not all out → not all out (0/0/15) | 302 → 298 (6/1/8) | 4,118 → 4,125 (7/6/2) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (5/6/4) | 192 → 192 (4/8/3) | 88 → 89 (6/1/8) | 607 → 617 (7/4/4) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (4/9/2) | 192 → 192 (5/7/3) | 110 → 109 (4/2/9) | 721 → 723 (9/5/1) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (2/9/4) | 136 → 136 (3/11/1) | 53 → 53 (1/2/12) | 347 → 353 (6/3/6) |
| AC-147-N2 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (3/9/3) | 136 → 136 (2/7/6) | 73 → 73 (2/3/10) | 492 → 487 (8/5/2) |
| AC-036-N2 | AC-036 Oak Ridge Rd | eastWind | 10 | 73 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 89 → 89 (8/1/6) | 103 → 103 (6/5/4) | 53 → 53 (1/3/11) | 347 → 349 (4/6/5) |
| AC-036-N2 | AC-036 Oak Ridge Rd | eastWind | 20 | 73 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 89 → 89 (6/6/3) | 103 → 103 (9/4/2) | 73 → 73 (1/5/9) | 492 → 487 (6/4/5) |
| AC-036-N1 | AC-036 Oak Ridge Rd | eastWind | 10 | 73 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 89 → 88 (7/4/4) | 103 → 103 (6/7/2) | 53 → 53 (0/3/12) | 347 → 354 (4/6/5) |
| AC-036-N1 | AC-036 Oak Ridge Rd | eastWind | 20 | 73 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 89 → 88 (5/4/6) | 103 → 103 (9/5/1) | 73 → 74 (1/4/10) | 492 → 494 (7/3/5) |
| AC-057-O2 | AC-057 Olympus Av, Wilson Ci | ref1923 | 10 | 36 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 98 → 98 (4/5/6) | 132 → 132 (5/3/7) | 88 → 89 (5/2/8) | 607 → 615 (7/4/4) |
| AC-057-O2 | AC-057 Olympus Av, Wilson Ci | ref1923 | 20 | 36 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 98 → 98 (8/3/4) | 133 → 132 (5/6/4) | 110 → 107 (7/0/8) | 721 → 717 (7/7/1) |
| AC-057-O2 | AC-057 Olympus Av, Wilson Ci | eastWind | 10 | 36 | 9 → 9 (0/0/15) | 33 → 33 (0/0/15) | 9 → 2 (5/1/9) | 9 → 2 (5/0/10) | not all out → 95 (2/2/11) | not all out → not all out (0/2/13) | 53 → 48 (5/0/10) | 347 → 336 (7/2/6) |
| AC-057-O2 | AC-057 Olympus Av, Wilson Ci | eastWind | 20 | 36 | 14 → 14 (0/0/15) | 36 → 36 (0/0/15) | 9 → 4 (6/0/9) | 9 → 4 (5/0/10) | not all out → not all out (0/2/13) | not all out → not all out (1/2/12) | 73 → 71 (5/1/9) | 492 → 453 (7/3/5) |
| AC-010-N1 | AC-010 Napa Av | ref1923 | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (1/12/2) | 110 → 110 (6/7/2) | 88 → 89 (5/2/8) | 607 → 607 (7/4/4) |
| AC-010-N1 | AC-010 Napa Av | ref1923 | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (8/5/2) | 110 → 110 (7/7/1) | 110 → 108 (4/4/7) | 721 → 719 (6/7/2) |
| AC-010-N1 | AC-010 Napa Av | eastWind | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (5/8/2) | 110 → 110 (2/10/3) | 53 → 53 (2/2/11) | 347 → 353 (7/5/3) |
| AC-010-N1 | AC-010 Napa Av | eastWind | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 94 (3/10/2) | 110 → 109 (6/8/1) | 73 → 74 (1/5/9) | 492 → 483 (7/5/3) |
| AC-010-N2 | AC-010 Napa Av | ref1923 | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (2/13/0) | 110 → 110 (7/6/2) | 88 → 89 (5/4/6) | 607 → 609 (6/7/2) |
| AC-010-N2 | AC-010 Napa Av | ref1923 | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 110 → 110 (9/6/0) | 110 → 110 (6/7/2) | 110 → 109 (5/3/7) | 721 → 723 (6/6/3) |
| AC-010-N2 | AC-010 Napa Av | eastWind | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 94 (3/11/1) | 110 → 110 (2/12/1) | 53 → 53 (0/2/13) | 347 → 353 (6/3/6) |
| AC-010-N2 | AC-010 Napa Av | eastWind | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 94 (0/15/0) | 110 → 110 (0/15/0) | 73 → 74 (2/3/10) | 492 → 494 (7/7/1) |
| AC-213-N1 | AC-213 High Ct, Laurel St … | ref1923 | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 112 (9/4/2) | 145 → 144 (5/6/4) | 88 → 89 (5/2/8) | 607 → 607 (6/3/6) |
| AC-213-N1 | AC-213 High Ct, Laurel St … | ref1923 | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 112 (8/4/3) | 145 → 145 (8/4/3) | 110 → 109 (5/2/8) | 721 → 731 (7/7/1) |
| AC-213-N1 | AC-213 High Ct, Laurel St … | eastWind | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (2/5/8) | 104 → 104 (6/7/2) | 53 → 53 (1/3/11) | 347 → 353 (7/5/3) |
| AC-213-N1 | AC-213 High Ct, Laurel St … | eastWind | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (0/10/5) | 104 → 104 (4/7/4) | 73 → 74 (3/5/7) | 492 → 492 (4/5/6) |
| AC-226-N3 | AC-226 San Mateo Rd | ref1923 | 10 | 50 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 108 → 109 (0/11/4) | 111 → 112 (1/13/1) | 88 → 88 (3/3/9) | 607 → 609 (6/8/1) |
| AC-226-N3 | AC-226 San Mateo Rd | ref1923 | 20 | 50 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 108 → 109 (1/11/3) | 111 → 112 (1/10/4) | 110 → 110 (2/4/9) | 721 → 723 (4/10/1) |
| AC-226-N3 | AC-226 San Mateo Rd | eastWind | 10 | 50 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 101 → 101 (6/5/4) | 115 → 115 (3/4/8) | 53 → 53 (3/1/11) | 347 → 356 (3/7/5) |
| AC-226-N3 | AC-226 San Mateo Rd | eastWind | 20 | 50 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 101 → 101 (5/8/2) | 115 → 115 (3/5/7) | 73 → 74 (1/6/8) | 492 → 485 (4/7/4) |
| AC-196-N1 | AC-196 Buena Vista Wy | ref1923 | 10 | 38 | 2 → 2 (0/0/15) | 38 → 38 (0/0/15) | 6 → 0 (8/0/7) | 3 → 0 (7/0/8) | 81 → 94 (5/5/5) | 102 → 117 (5/3/7) | 88 → 76 (7/1/7) | 607 → 597 (5/6/4) |
| AC-196-N1 | AC-196 Buena Vista Wy | ref1923 | 20 | 38 | 7 → 7 (0/0/15) | 38 → 38 (0/0/15) | 8 → 1 (8/0/7) | 4 → 0 (7/0/8) | 81 → 94 (3/6/6) | 102 → 117 (4/5/6) | 110 → 94 (6/3/6) | 721 → 717 (8/6/1) |
| AC-196-N1 | AC-196 Buena Vista Wy | eastWind | 10 | 38 | 2 → 2 (0/0/15) | 31 → 31 (0/0/15) | 0 → 0 (3/1/11) | 0 → 0 (1/0/14) | 85 → 84 (2/3/10) | 93 → 94 (2/2/11) | 53 → 53 (4/0/11) | 347 → 360 (5/3/7) |
| AC-196-N1 | AC-196 Buena Vista Wy | eastWind | 20 | 38 | 2 → 2 (0/0/15) | 36 → 36 (0/0/15) | 0 → 0 (1/1/13) | 0 → 0 (1/0/14) | 84 → 84 (2/3/10) | 93 → 93 (2/2/11) | 73 → 74 (4/1/10) | 492 → 485 (6/2/7) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 941 | 393 → 393 (0/0/15) | 763 → 763 (0/0/15) | 149 → 151 (3/8/4) | 129 → 129 (8/1/6) | not all out → not all out (0/2/13) | not all out → not all out (0/0/15) | 227 → 222 (9/2/4) | 3,862 → 3,856 (6/6/3) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 941 | 465 → 465 (1/0/14) | 813 → 813 (0/0/15) | 177 → 176 (6/8/1) | 147 → 147 (4/2/9) | not all out → not all out (2/2/11) | not all out → not all out (0/0/15) | 302 → 293 (6/3/6) | 4,118 → 4,125 (7/6/2) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (8/5/2) | 192 → 192 (4/3/8) | 88 → 89 (6/2/7) | 607 → 613 (7/5/3) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 104 → 104 (6/6/3) | 192 → 192 (2/5/8) | 110 → 110 (2/4/9) | 721 → 717 (9/3/3) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (3/6/6) | 136 → 136 (4/8/3) | 53 → 53 (3/2/10) | 347 → 353 (6/6/3) |
| CITY-1 | AC-128 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 941 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 91 → 91 (7/4/4) | 136 → 136 (9/5/1) | 73 → 74 (0/4/11) | 492 → 491 (7/3/5) |

## Panoramic Hill and the Time Study benchmark

The 2025 Evacuation Time Study (§10.4, Tables 10-9 and 10-10, pp. 10-4 and 10-16) tested a second way out of Panoramic Hill connecting Dwight Way to Dwight Place, the same line as the City's "2nd Route Out" layer, and measured when vehicles had left Panoramic Hill (beyond Panoramic Way or Dwight Way). With normal mobilization, two ways out changed neither the 90th nor the 100th percentile in any scenario (R04 90th percentile 1:15–1:30, 100th 3:25–3:40), because the 3.5-hour mobilization sets the time. With urgent mobilization (everyone with a car ready within 30 minutes), the R04 90th percentile fell from 0:30–1:00 to 0:30–0:50, at most 33% (R02 at most 29%); in the fall midweek midday case (S4, the time the simulator uses for both fires below) R04 went from 1:00 to 0:40 and R02 from 1:25 to 1:00. SOURCE_NOTES E25.

The simulator measures the same thing for all of Panoramic Hill (area AC-128): minutes from the first order until 90% and 100% of its evacuating vehicles have left the area. "Urgent" replaces every mobilization curve with an even spread over 30 minutes, for this comparison only (a harness setting, not a simulator plan).

**Access, no fire: Panoramic Hill residents behind any choke point.** Opening edge 2322 alone (AC-128-P1, the County coding fix in SOURCE_NOTES AC3) moves the choke to the foot of Panoramic Way and frees only the residents of the stem it bypasses. Its building and acquisition counts come from the corridor around an existing street and stairway and would not apply to recoding a street that OpenStreetMap already maps as drivable.

| Candidate | Link | Network as it stands | Exit opened (edge 2322 drivable) |
|---|---|---|---|
| AC-128-P1 | Rim Rd → Prospect St | 941 → 903 | no change |
| AC-133-N3 | Panoramic Wy → Smyth Ln | 941 → 167 | 903 → 167 |
| AC-147-N2 | Smyth Ln → Dwight Wy | 941 → 167 | 903 → 167 |
| AC-147-N1 | Smyth Ln → Panoramic Wy | 941 → 468 | 903 → 468 |
| CITY-1 | Dwight Wy → Dwight Pl | 941 → 167 | 903 → 167 |

**Fire on.** Cells as in the evacuation table: central-severity median without → with the link (better / worse / no different, of 15 same-seed pairs). First order 10 minutes after ignition.

| Candidate | Network | Fire | Mobilization | Panoramic Hill 90% out, min | 100% out, min | Vehicles cut off | Still home when the fire front arrived |
|---|---|---|---|---|---|---|---|
| AC-133-N3 | as it stands | panoramic | normal | not all out → not all out (4/0/11) | not all out → not all out (0/0/15) | 129 → 127 (13/0/2) | 393 → 393 (0/0/15) |
| AC-133-N3 | as it stands | panoramic | urgent | 37 → 37 (3/7/5) | 58 → 58 (0/5/10) | 2 → 2 (4/2/9) | 28 → 28 (3/0/12) |
| AC-133-N3 | as it stands | ref1923 | normal | 104 → 104 (11/4/0) | 192 → 192 (3/4/8) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-133-N3 | as it stands | ref1923 | urgent | 35 → 45 (0/15/0) | 55 → 59 (4/10/1) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-133-N3 | exit opened | panoramic | normal | not all out → not all out (4/1/10) | not all out → not all out (0/0/15) | 129 → 127 (11/0/4) | 393 → 393 (0/0/15) |
| AC-133-N3 | exit opened | panoramic | urgent | 35 → 36 (1/8/6) | 58 → 58 (0/2/13) | 2 → 2 (6/0/9) | 28 → 28 (2/1/12) |
| AC-133-N3 | exit opened | ref1923 | normal | 104 → 104 (4/9/2) | 192 → 192 (4/4/7) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-133-N3 | exit opened | ref1923 | urgent | 39 → 45 (0/15/0) | 59 → 62 (5/10/0) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-147-N2 | as it stands | panoramic | normal | not all out → not all out (1/2/12) | not all out → not all out (0/0/15) | 129 → 129 (6/0/9) | 393 → 393 (0/0/15) |
| AC-147-N2 | as it stands | panoramic | urgent | 37 → 37 (1/9/5) | 58 → 55 (1/6/8) | 2 → 2 (6/0/9) | 28 → 28 (2/1/12) |
| AC-147-N2 | as it stands | ref1923 | normal | 104 → 104 (5/6/4) | 192 → 192 (4/8/3) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-147-N2 | as it stands | ref1923 | urgent | 35 → 34 (10/5/0) | 55 → 56 (3/9/3) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-147-N2 | exit opened | panoramic | normal | not all out → not all out (0/4/11) | not all out → not all out (0/0/15) | 129 → 129 (7/0/8) | 393 → 393 (0/0/15) |
| AC-147-N2 | exit opened | panoramic | urgent | 35 → 35 (3/7/5) | 58 → 58 (3/3/9) | 2 → 2 (5/0/10) | 28 → 28 (2/3/10) |
| AC-147-N2 | exit opened | ref1923 | normal | 104 → 104 (5/8/2) | 192 → 192 (9/5/1) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-147-N2 | exit opened | ref1923 | urgent | 39 → 37 (12/3/0) | 59 → 59 (7/6/2) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | as it stands | panoramic | normal | not all out → not all out (0/2/13) | not all out → not all out (0/0/15) | 129 → 129 (8/1/6) | 393 → 393 (0/0/15) |
| CITY-1 | as it stands | panoramic | urgent | 37 → 39 (3/6/6) | 58 → 55 (2/4/9) | 2 → 2 (5/3/7) | 28 → 28 (3/0/12) |
| CITY-1 | as it stands | ref1923 | normal | 104 → 104 (8/5/2) | 192 → 192 (4/3/8) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | as it stands | ref1923 | urgent | 35 → 34 (8/7/0) | 55 → 56 (6/6/3) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | exit opened | panoramic | normal | not all out → not all out (1/4/10) | not all out → not all out (0/0/15) | 129 → 129 (6/3/6) | 393 → 393 (0/0/15) |
| CITY-1 | exit opened | panoramic | urgent | 35 → 37 (4/7/4) | 58 → 58 (3/1/11) | 2 → 2 (6/0/9) | 28 → 28 (3/2/10) |
| CITY-1 | exit opened | ref1923 | normal | 104 → 104 (7/6/2) | 192 → 192 (3/6/6) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | exit opened | ref1923 | urgent | 39 → 38 (11/4/0) | 59 → 59 (6/6/3) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |

- **Normal mobilization agrees with the Time Study.** On the 1923 fire, where Panoramic Hill is ordered but the fire does not reach it, its 90% time stays near 104 minutes with or without a link (the study: 1:30 for R04 S4 either way).
- **Urgent mobilization does not reproduce the study's gain.** Under urgent mobilization the simulator clears Panoramic Hill sooner than the study does (90% out in about 35 minutes on the 1923 fire, against the study's 1:00 for R04 S4 and 1:25 for R02 S4), so the single exit is not where its queue forms, and no second exit shortens it consistently. The City concept and AC-147-N2 move the 90% time by a minute or two in either direction; AC-133-N3 lengthens it (35 → 45 minutes, better in 0, worse in 15, no different in 0 of 15 same-seed pairs); why has not been traced. The study's model queues Panoramic Hill traffic where the simulator's does not; this is a gap in the simulator's agreement with the study (SOURCE_NOTES EG8), not evidence against the study.
- **On the Panoramic Hill fire, the problem is timing, not the number of exits.** With urgent mobilization the synthetic people still home when the fire front arrived fall from about 393 to 28 and vehicles cut off from about 129 to 2, with or without a link.

## What was pruned, and areas left without a candidate

83 of 133 candidates were pruned as physically implausible under two model rules: an average grade over 30% (a road held to 15% would need at least twice the straight length), or 3 or more buildings in the 12.2 m corridor. 73 failed the building rule and 16 the grade rule (some both). The City concept would fail the grade rule (average grade 40.2% (over 30%: a road at 15% would need 467 m, at least twice the line)) and is kept as the benchmark.

14 of the 40 dead-end areas have no surviving candidate of their own: AC-131 (Panoramic Wy, Panoramic Pl; 538 residents, 4 pruned; CITY-1 leaves 81 behind a choke); AC-505 (Contra Costa Rd, Contra Costa Pl; 227 residents, 4 pruned); AC-501 (Evergreen Ln, Slater Ln; 153 residents, 4 pruned); AC-129 (Mosswood Rd; 58 residents, 3 pruned); AC-512 (West View Dr, Willard Pl; 50 residents, 4 pruned); AC-537 (Bay Forest Dr, Bay Forest Pl; 40 residents, 3 pruned); AC-003 (La Vereda Rd; 38 residents, 3 pruned); AC-461 (Virgo Rd; 38 residents, 3 pruned); AC-228 (Crystal Wy; 36 residents, 3 pruned); AC-423 (York Av; 36 residents, none within 250 m that saves driving); AC-058 (Hillside Ct; 35 residents, 3 pruned); AC-127 (Brookside Av; 25 residents, 3 pruned); AC-130 (Panoramic Wy; 24 residents, 3 pruned); AC-135 (Panoramic Wy; 11 residents, 3 pruned).

8 areas among the top ranks are behind a one-way choke only and were left out, because two-way operation of the entrance in an emergency opens them: AC-012 (Dwight Wy, 252); AC-174 (Piedmont Av, 240); AC-038 (Piedmont Av Tc, 196); AC-414 (Edgecroft Rd, 95); AC-205 (Piedmont Av, 78); AC-543 (Broadway, 73); AC-427 (Arlington Av, 39); AC-045 (Tunnel Rd, 37).

| Candidate | Area | Type | Link | Length, m | Average grade | Buildings in corridor | Pruned because |
|---|---|---|---|---|---|---|---|
| AC-131-N1 | AC-131 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Prospect St | 121 | 25.3% | 6 | 6 buildings in the 12.2 m corridor |
| AC-131-N2 | AC-131 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Unnamed | 159 | 19.8% | 5 | 5 buildings in the 12.2 m corridor |
| AC-131-N3 | AC-131 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Warring St | 189 | 21.8% | 7 | 7 buildings in the 12.2 m corridor |
| AC-131-P1 | AC-131 Panoramic Wy, Panoramic Pl … | path upgrade | Arden Rd → Mosswood Rd | 35 | 56.3% | 1 | average grade 56.3% (over 30%: a road at 15% would need 131 m, at least twice the line) |
| AC-133-N1 | AC-133 Panoramic Wy, Panoramic Pl … | new road | Dwight Pl → Sports Ln | 248 | 38.7% | 1 | average grade 38.7% (over 30%: a road at 15% would need 639 m, at least twice the line) |
| AC-541-N2 | AC-541 Caldecott Ln | new road | Caldecott Ln → Charing Cross Rd | 240 | 17.5% | 5 | 5 buildings in the 12.2 m corridor |
| AC-541-N3 | AC-541 Caldecott Ln | new road | Caldecott Ln → Bristol Dr | 234 | 24% | 5 | 5 buildings in the 12.2 m corridor |
| AC-505-N1 | AC-505 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Sheridan Rd | 96 | 20.2% | 4 | 4 buildings in the 12.2 m corridor |
| AC-505-N2 | AC-505 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Broadway Te | 188 | 10.7% | 4 | 4 buildings in the 12.2 m corridor |
| AC-505-N3 | AC-505 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Alta Rd | 203 | 5.1% | 8 | 8 buildings in the 12.2 m corridor |
| AC-501-N1 | AC-501 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Alvarado Rd | 223 | 7.1% | 9 | 9 buildings in the 12.2 m corridor |
| AC-501-N2 | AC-501 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Claremont Av | 207 | 15.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-501-N3 | AC-501 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Gravatt Dr | 112 | 32% | 4 | average grade 32% (over 30%: a road at 15% would need 238 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-213-N3 | AC-213 High Ct, Laurel St … | new road | High Ct → Keith Av | 214 | 9.6% | 7 | 7 buildings in the 12.2 m corridor |
| AC-036-P1 | AC-036 Oak Ridge Rd | path upgrade | Oak Ridge Rd → El Camino Real | 46 | 32.2% | 4 | average grade 32.2% (over 30%: a road at 15% would need 99 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-499-N1 | AC-499 Stonewall Rd | new road | Stonewall Rd → Belrose Av | 188 | 9.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-499-N2 | AC-499 Stonewall Rd | new road | Stonewall Rd → Derby St | 232 | 8.3% | 6 | 6 buildings in the 12.2 m corridor |
| AC-542-N3 | AC-542 Caldecott Ln | new road | Caldecott Ln → Buckingham Bl | 194 | 35.1% | 4 | average grade 35.1% (over 30%: a road at 15% would need 455 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-129-N1 | AC-129 Mosswood Rd | new road | Mosswood Rd → Prospect St | 237 | 20.1% | 8 | 8 buildings in the 12.2 m corridor |
| AC-129-N2 | AC-129 Mosswood Rd | new road | Mosswood Rd → Unnamed | 233 | 20.8% | 4 | 4 buildings in the 12.2 m corridor |
| AC-129-N3 | AC-129 Mosswood Rd | new road | Mosswood Rd → Arden Rd | 69 | 11.4% | 3 | 3 buildings in the 12.2 m corridor |
| AC-422-N1 | AC-422 Kingston Rd | new road | Kingston Rd → Camelot Ct | 177 | 9.2% | 9 | 9 buildings in the 12.2 m corridor |
| AC-147-N3 | AC-147 Smyth Ln | new road | Smyth Ln → Panoramic Pl | 245 | 19.5% | 7 | 7 buildings in the 12.2 m corridor |
| AC-226-N1 | AC-226 San Mateo Rd | new road | San Mateo Rd → Arlington Av | 98 | 12% | 3 | 3 buildings in the 12.2 m corridor |
| AC-226-N2 | AC-226 San Mateo Rd | new road | San Mateo Rd → Mendocino Av | 98 | 12.2% | 3 | 3 buildings in the 12.2 m corridor |
| AC-226-P1 | AC-226 San Mateo Rd | path upgrade | San Mateo Rd → Arlington Av | 98 | 12% | 3 | 3 buildings in the 12.2 m corridor |
| AC-512-N1 | AC-512 West View Dr, Willard Pl | new road | Willard Pl → Vicente Rd | 199 | 13.8% | 5 | 5 buildings in the 12.2 m corridor |
| AC-512-N2 | AC-512 West View Dr, Willard Pl | new road | Willard Pl → Alvarado Rd | 236 | 14.5% | 4 | 4 buildings in the 12.2 m corridor |
| AC-512-N3 | AC-512 West View Dr, Willard Pl | new road | Willard Pl → North Hill Ct | 118 | 15.8% | 3 | 3 buildings in the 12.2 m corridor |
| AC-134-N1 | AC-134 Panoramic Pl | new road | Panoramic Pl → Arden Rd | 195 | 17.8% | 3 | 3 buildings in the 12.2 m corridor |
| AC-553-N3 | AC-553 Drury Ct, Drury Rd | new road | Drury Ct → Drury Rd | 199 | 2.1% | 4 | 4 buildings in the 12.2 m corridor |
| AC-521-N2 | AC-521 Spyglass Hill | new road | Spyglass Hill → Windward Hill | 189 | 10.5% | 5 | 5 buildings in the 12.2 m corridor |
| AC-537-N1 | AC-537 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Grizzly Peak Bl | 242 | 33.5% | 0 | average grade 33.5% (over 30%: a road at 15% would need 539 m, at least twice the line) |
| AC-537-N2 | AC-537 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Woodside Wy | 247 | 33.2% | 1 | average grade 33.2% (over 30%: a road at 15% would need 547 m, at least twice the line) |
| AC-537-N3 | AC-537 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Grizzly Terrace Dr | 239 | 35.8% | 0 | average grade 35.8% (over 30%: a road at 15% would need 571 m, at least twice the line) |
| AC-140-N2 | AC-140 Maybeck Twin Dr | new road | Maybeck Twin Dr → Rose St | 161 | 27.9% | 7 | 7 buildings in the 12.2 m corridor |
| AC-140-N3 | AC-140 Maybeck Twin Dr | new road | Maybeck Twin Dr → Shasta Rd | 222 | 24.3% | 9 | 9 buildings in the 12.2 m corridor |
| AC-550-N2 | AC-550 Besito Av | new road | Besito Av → Grand View Dr | 187 | 33.4% | 2 | average grade 33.4% (over 30%: a road at 15% would need 415 m, at least twice the line) |
| AC-550-N3 | AC-550 Besito Av | new road | Besito Av → Drury Ct | 243 | 10% | 5 | 5 buildings in the 12.2 m corridor |
| AC-196-N2 | AC-196 Buena Vista Wy | new road | Buena Vista Wy → Parnassus Rd | 154 | 23% | 3 | 3 buildings in the 12.2 m corridor |
| AC-196-N3 | AC-196 Buena Vista Wy | new road | Buena Vista Wy → E Parnassus Ct | 193 | 22.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-002-N2 | AC-002 Hilgard Av | new road | Hilgard Av → Virginia St | 175 | 25.1% | 10 | 10 buildings in the 12.2 m corridor |
| AC-002-N3 | AC-002 Hilgard Av | new road | Hilgard Av → Le Conte Av | 193 | 15.5% | 3 | 3 buildings in the 12.2 m corridor |
| AC-003-N1 | AC-003 La Vereda Rd | new road | La Vereda Rd → La Loma Av | 181 | 23.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-003-N2 | AC-003 La Vereda Rd | new road | La Vereda Rd → Virginia St | 148 | 31.2% | 1 | average grade 31.2% (over 30%: a road at 15% would need 308 m, at least twice the line) |
| AC-003-N3 | AC-003 La Vereda Rd | new road | La Vereda Rd → Highland Pl | 210 | 23.4% | 3 | 3 buildings in the 12.2 m corridor |
| AC-461-N1 | AC-461 Virgo Rd | new road | Virgo Rd → Broadway Te | 230 | 16.2% | 8 | 8 buildings in the 12.2 m corridor |
| AC-461-N2 | AC-461 Virgo Rd | new road | Virgo Rd → Pinehaven Rd | 206 | 21.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-461-N3 | AC-461 Virgo Rd | new road | Virgo Rd → Taurus Av | 110 | 30.5% | 3 | average grade 30.5% (over 30%: a road at 15% would need 223 m, at least twice the line); 3 buildings in the 12.2 m corridor |
| AC-232-N1 | AC-232 Le Conte Av | new road | Le Conte Av → La Loma Av | 158 | 6.4% | 7 | 7 buildings in the 12.2 m corridor |
| AC-057-N1 | AC-057 Olympus Av, Wilson Ci | new road | Wilson Ci → Centennial Dr | 193 | 4.1% | 6 | 6 buildings in the 12.2 m corridor |
| AC-057-N2 | AC-057 Olympus Av, Wilson Ci | new road | Wilson Ci → Senior Av | 153 | 14.9% | 4 | 4 buildings in the 12.2 m corridor |
| AC-057-N3 | AC-057 Olympus Av, Wilson Ci | new road | Wilson Ci → Grizzly Peak Bl | 95 | 27.7% | 3 | 3 buildings in the 12.2 m corridor |
| AC-228-N1 | AC-228 Crystal Wy | new road | Crystal Wy → Euclid Av | 80 | 12% | 4 | 4 buildings in the 12.2 m corridor |
| AC-228-N2 | AC-228 Crystal Wy | new road | Crystal Wy → Tamalpais Rd | 206 | 9.5% | 3 | 3 buildings in the 12.2 m corridor |
| AC-228-N3 | AC-228 Crystal Wy | new road | Crystal Wy → Keith Av | 167 | 21.9% | 11 | 11 buildings in the 12.2 m corridor |
| AC-058-N1 | AC-058 Hillside Ct | new road | Hillside Ct → Panoramic Wy | 158 | 7.3% | 6 | 6 buildings in the 12.2 m corridor |
| AC-058-N2 | AC-058 Hillside Ct | new road | Hillside Ct → Mosswood Ln | 154 | 12.1% | 8 | 8 buildings in the 12.2 m corridor |
| AC-058-N3 | AC-058 Hillside Ct | new road | Hillside Ct → Rim Rd | 205 | 3.7% | 10 | 10 buildings in the 12.2 m corridor |
| AC-132-N1 | AC-132 Arden Rd | new road | Arden Rd → Prospect St | 237 | 28.4% | 10 | 10 buildings in the 12.2 m corridor |
| AC-132-N2 | AC-132 Arden Rd | new road | Arden Rd → Unnamed | 243 | 28% | 8 | 8 buildings in the 12.2 m corridor |
| AC-211-N2 | AC-211 Virginia St | new road | Virginia St → La Vereda Rd | 26 | 43.5% | 0 | average grade 43.5% (over 30%: a road at 15% would need 76 m, at least twice the line) |
| AC-211-N3 | AC-211 Virginia St | new road | Virginia St → Cedar St | 192 | 10.1% | 7 | 7 buildings in the 12.2 m corridor |
| AC-127-N1 | AC-127 Brookside Av | new road | Brookside Av → Ross Cir | 111 | 8.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-127-N2 | AC-127 Brookside Av | new road | Brookside Av → Hillcrest Rd | 79 | 19% | 3 | 3 buildings in the 12.2 m corridor |
| AC-127-N3 | AC-127 Brookside Av | new road | Brookside Av → Florio St | 161 | 1.9% | 6 | 6 buildings in the 12.2 m corridor |
| AC-130-N1 | AC-130 Panoramic Wy | new road | Panoramic Wy → Sports Ln | 195 | 10.3% | 4 | 4 buildings in the 12.2 m corridor |
| AC-130-N2 | AC-130 Panoramic Wy | new road | Panoramic Wy → Smyth Ln | 134 | 21.1% | 5 | 5 buildings in the 12.2 m corridor |
| AC-130-N3 | AC-130 Panoramic Wy | new road | Panoramic Wy → Prospect St | 189 | 16.2% | 11 | 11 buildings in the 12.2 m corridor |
| AC-154-N2 | AC-154 Hill Rd | new road | Hill Rd → Shasta Rd | 173 | 35.4% | 6 | average grade 35.4% (over 30%: a road at 15% would need 407 m, at least twice the line); 6 buildings in the 12.2 m corridor |
| AC-154-N3 | AC-154 Hill Rd | new road | Hill Rd → Queens Rd | 228 | 29% | 6 | 6 buildings in the 12.2 m corridor |
| AC-154-P1 | AC-154 Hill Rd | path upgrade | Hill Rd → Grizzly Peak Bl | 89 | 38% | 2 | average grade 38% (over 30%: a road at 15% would need 225 m, at least twice the line) |
| AC-135-N1 | AC-135 Panoramic Wy | new road | Panoramic Wy → Arden Rd | 175 | 15.2% | 6 | 6 buildings in the 12.2 m corridor |
| AC-135-N2 | AC-135 Panoramic Wy | new road | Panoramic Wy → Dwight Wy | 120 | 23.7% | 4 | 4 buildings in the 12.2 m corridor |
| AC-135-N3 | AC-135 Panoramic Wy | new road | Panoramic Wy → Mosswood Rd | 167 | 20.6% | 5 | 5 buildings in the 12.2 m corridor |
| AC-128-O2 | AC-128 Panoramic Wy, Mosswood Rd … | path upgrade | Canyon Rd → Warring St | 300 | 6.7% | 3 | 3 buildings in the 12.2 m corridor |
| AC-133-O2 | AC-133 Panoramic Wy, Panoramic Pl … | path upgrade | Panoramic Wy → Mosswood Rd | 92 | 37.9% | 3 | average grade 37.9% (over 30%: a road at 15% would need 233 m, at least twice the line); 3 buildings in the 12.2 m corridor |
| AC-505-O1 | AC-505 Contra Costa Rd, Contra Costa Pl | path upgrade | Contra Costa Rd → Proctor Av | 109 | 20.9% | 5 | 5 buildings in the 12.2 m corridor |
| AC-501-O1 | AC-501 Evergreen Ln, Slater Ln | path upgrade | Evergreen Ln → Alvarado Pl | 134 | 15% | 3 | 3 buildings in the 12.2 m corridor |
| AC-036-O2 | AC-036 Oak Ridge Rd | path upgrade | Oak Ridge Rd → Domingo Av | 128 | 18.5% | 8 | 8 buildings in the 12.2 m corridor |
| AC-499-O1 | AC-499 Stonewall Rd | path upgrade | Stonewall Rd → Tanglewood Rd | 130 | 17.1% | 4 | 4 buildings in the 12.2 m corridor |
| AC-499-O2 | AC-499 Stonewall Rd | path upgrade | Stonewall Rd → Belrose Av | 176 | 14.5% | 4 | 4 buildings in the 12.2 m corridor |
| AC-512-O1 | AC-512 West View Dr, Willard Pl | path upgrade | West View Dr → North Hill Ct | 78 | 31.9% | 0 | average grade 31.9% (over 30%: a road at 15% would need 166 m, at least twice the line) |

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Areas (derived).** From `data/model/access-constraints.json`: areas with at least one hill resident, the top 40 by residents and the top 40 by constraint score (47 after removing duplicates). One-way areas are left out; 39 dead-end areas remain, plus AC-116 (Dwight Wy), where the City concept starts. None of them carries an allocation warning (Albany Hill, AC-316, is not a hill area by the fire-zone rule).
- **New road (model rule).** A straight segment from a node inside the area to a drivable node outside it, up to 250 m, where driving between the two points now takes at least 300 m and 3 times the line (the access tool's "nearest other street" rule). For each target street the shortest link after a penalty for average grade above 10% is kept, preferring targets behind no choke, 3 streets per area. Links join existing network nodes (junctions and street ends), so a street with no node near the area is reached at its nearest junction.
- **Path upgrade (model rule).** An existing path, stairway or County no-vehicle segment in the network, or a chain of OpenStreetMap footways, paths, steps or tracks (up to 400 m, ends within 25 m of network nodes), widened to a road. **Open barrier**: a diverter, bollard or gate closed to residents' cars, opened.
- **City concept (sourced geometry).** City of Berkeley "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1, layer 0, "Imagined Road: Connects Dwight Way in Berkeley and Dwight Place in Oakland", "For Evacuation Time Study", edited 2025-06-27), retrieved 2026-11-01. Its ends were snapped to the nearest network nodes (11.7 m and 0.2 m away).
- **Grade (derived).** Ground elevation every 4 m along the line from the 4 m lidar DEM, as the network builder samples streets: average = end-to-end climb / length; for 25 m windows along the line, the 90th percentile (the builder's gradeMax for streets) and the worst. Flags use the larger of the average and the 90th percentile, because the worst window over open ground is often a terrace, wall or cut. Flags at 15% (a common local fire-access limit; Sonoma County fire-access bulletin: 15% maximum grade by default, steeper sections up to 20% only with Fire Chief approval (an example of a local standard)) and 20% (State Minimum Fire Safe Regulations, 14 CCR §1273.03: road and driveway grades shall not exceed 16% at any point; up to 20% only with local approval and mitigation). "Length at 15%" is the length a road would need to hold 15% over the same climb.
- **On a path (derived).** Share of the line within 6 m of an OpenStreetMap footway, path, steps or track, or a network path segment.
- **Buildings (derived).** OpenStreetMap building footprints touching a 12.2 m corridor centered on the line (corridor width: assumption, a 40 ft right of way).
- **Parcels (derived).** Alameda County parcel polygons, geometry only, fetched per candidate and discarded: parcels the centerline crosses for 2 m or more, parcels touching the corridor, and the share of the centerline outside every parcel (public right of way or unparceled land). Contra Costa County candidates (Kensington) have no parcel count.
- **Land (derived).** Share of the line inside OpenStreetMap park, nature-reserve or protected-area polygons, UC Berkeley, LBNL or East Bay Regional Park District land, from name, operator and owner tags.
- **Fire zone (sourced).** City Fire Zones at the midpoint; outside Berkeley the simulator's proxy (90 m elevation or higher counts as hill).
- **Access effect (derived).** `tools/access-constraints.mjs --links` reruns the choke-point analysis with the link added as a two-way local street with no residents. Freed residents = residents behind any choke before minus after, for the whole model area. Panoramic Hill links are also run with the Panoramic exit opened (below).
- **Evacuation effect (derived from synthetic runs).** See above. Up to two candidates per area among the top-ranked, where one of the three fires (eastWind, ref1923, panoramic) orders, warns or sends embers into the area, plus the City concept.

## Costs (screening estimate)

These are screening ranges built from public figures and labeled assumptions, not an engineer's estimate, an appraisal, environmental review or legal analysis. They leave out engineering, environmental review and mitigation, relocation benefits, legal costs, utilities and time.

- **Construction (assumption from public figures).** Low: $5,665 per meter, Florida DOT Cost Per Mile Models, U01 "New Construction 2 Lane Undivided Urban Arterial with 4' Bike Lanes": $9,116,872.25 per mile (flat terrain, no right of way) (http://web.archive.org/web/20251006210442/https://www.fdot.gov/fpo/fpc/reports/costpermile, retrieved 2026-11-01 (Wayback copy of 2025-10-06; the live page returned 404)). High: 3 times that, $16,995 per meter, for retaining walls, grading and drainage on a hillside (assumption), applied to the length a 15% road would need. Fire roads and tracks start from $697 per meter: Civil Design Studio for the Cambria CSD, "Cambria Emergency Evacuation Route: Preliminary Cost Estimate", 2024-02-12: about $2.55M with 10% contingency for 12,000 ft of 16 ft gravel emergency road on an existing graded alignment (https://cambriacsd.specialdistrict.org/files/a810aeceb/6C+-+Att+01.pdf).
- **Acquisition (assumption from public figures).** Each building in the corridor is taken whole at the median value of owner-occupied homes in the block group, the median ± its margin of error (American Community Survey 2020–2024 5-year, table B25077 median value of owner-occupied homes, by block group (via the Census Reporter API; the Census Bureau API now requires a key); block group from TIGERweb). Each other parcel touching the corridor is a partial take at 10%–25% of that value (assumption, no source). The ACS top-codes medians at $2,000,001, so in the most expensive hill block groups the high end is low. Where the block group has no median (campus or park land), the block group at the area end is used.
- **Displacement (assumption).** Buildings removed × 2.37 persons per household, as if each building were one home.
- Opening a barrier is not priced; it is small next to a road.

## Limits

- Straight lines between network nodes, not alignments. A real road would follow the contours, need retaining walls and turning radii, and cross different parcels and buildings than the straight corridor. A link from the middle of a long block is not considered, because the network has nodes only at junctions and ends.
- Building footprints come from OpenStreetMap, which misses some sheds and garages and may lag new construction; parcel polygons are the County's current layer; neither was checked on the ground or on the City's orthophotos.
- Land flags come from OpenStreetMap tags, not ownership records; easements, utility corridors and the Hayward Fault zone are not checked.
- The simulator's fires are illustrative and its traffic model is uncalibrated for weekday peaks (`HANDOFF.md`, calibration). The evacuation effect is a comparison between runs, not an estimate of real outcomes.
- The evacuation runs use the network as it stands, where Panoramic Hill drives out over Rim Rd and Stadium Rim Rd because the County file codes the short link from Panoramic Way to Prospect St as no-vehicle (SOURCE_NOTES AC3). The "Panoramic exit opened" variant shows how the Panoramic Hill results change once that is fixed; `node tools/egress-all.mjs` reruns everything after the fix.

## Sources

- Sonoma County fire-access bulletin: 15% maximum grade by default, steeper sections up to 20% only with Fire Chief approval (an example of a local standard). https://permitsonoma.org/divisions/firepreventionandhazmat/bulletinmaximumgrades. Retrieved 2026-11-01.
- State Minimum Fire Safe Regulations, 14 CCR §1273.03: road and driveway grades shall not exceed 16% at any point; up to 20% only with local approval and mitigation. https://regulations.justia.com/states/california/title-14/division-1-5/chapter-7/subchapter-2/article-2/section-1273-03. Retrieved 2026-11-01.
- Florida DOT Cost Per Mile Models, U01 "New Construction 2 Lane Undivided Urban Arterial with 4' Bike Lanes": $9,116,872.25 per mile (flat terrain, no right of way). http://web.archive.org/web/20251006210442/https://www.fdot.gov/fpo/fpc/reports/costpermile. Retrieved 2026-11-01 (Wayback copy of 2025-10-06; the live page returned 404).
- Civil Design Studio for the Cambria CSD, "Cambria Emergency Evacuation Route: Preliminary Cost Estimate", 2024-02-12: about $2.55M with 10% contingency for 12,000 ft of 16 ft gravel emergency road on an existing graded alignment. https://cambriacsd.specialdistrict.org/files/a810aeceb/6C+-+Att+01.pdf. Retrieved 2026-11-01.
- American Community Survey 2020–2024 5-year, table B25077 median value of owner-occupied homes, by block group (via the Census Reporter API; the Census Bureau API now requires a key); block group from TIGERweb. https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077. Retrieved 2026-11-01.
- Alameda County Parcel Boundaries (Parcels FeatureServer layer 0), geometry only; counted per candidate and never saved. https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0. Retrieved 2026-11-01.
- OpenStreetMap buildings, footways, paths, steps, tracks, parks and institutional land (Overpass API; © OpenStreetMap contributors, ODbL). https://www.openstreetmap.org/copyright. Retrieved https://overpass-api.de/api/interpreter 2026-11-01T17:39:54.702Z (OSM data as of 2026-11-01T17:36:36Z).
- City of Berkeley "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1, layer 0, "Imagined Road: Connects Dwight Way in Berkeley and Dwight Place in Oakland", "For Evacuation Time Study", edited 2025-06-27). https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Imagined_Road_Panoramic_Hill_Berkeley_WFL1/FeatureServer/0. Retrieved 2026-11-01.
- 2025 Evacuation Time Study (KLD Engineering, 2025-06-23), §10.4 and Tables 10-9 and 10-10 (pp. 10-4, 10-16): second egress from Panoramic Hill. SOURCE_NOTES E25.
