# Second ways out: candidate road connections for access-constrained areas

Built 2026-11-01 by `node tools/egress-all.mjs` (`tools/egress-candidates.mjs`, `tools/egress-sim.mjs`, this report from `tools/egress-report.mjs`). Machine-readable results: `data/model/egress-candidates.json` and `data/model/egress-sim.json`. Step 2 of the egress and managed-retreat plan in `HANDOFF.md`; step 1 is `docs/access-constraints.md`.

This is an educational comparison, not a prediction and not an official evacuation plan. It is a screening of where a second way out could go, not engineering, environmental review or legal analysis: every line below is a straight line or an existing path between two points of the street network, and every cost is a range built from public figures and labeled assumptions. Residents are synthetic. Counts only: no parcel identifiers, owners, addresses or imagery are stored.

## Findings

- **One short, steep link would take most of Panoramic Hill out from behind every choke point.** AC-160-N3 (Panoramic Wy → Smyth Ln, 88 m, average grade 21%) leaves 202, AC-134-N2 (Smyth Ln → Dwight Wy, 92 m, average grade 27.4%) leaves 202, CITY-1 (Dwight Wy → Dwight Pl, 174 m, average grade 40.2%) leaves 194 of Panoramic Hill's 972 synthetic residents behind a choke, all of them on short side dead ends (Mosswood Rd, Panoramic Pl, Arden Rd, the top of Panoramic Wy, Dwight Pl) whose entrances leave room for an engine. Today all 972 are behind one entrance, the foot of Panoramic Way at 9.1 ft clear with status-quo parking, too narrow for an engine (SOURCE_NOTES AC15). Each link also cuts the hill residents behind two or more chokes in series by 695. The City's "2nd Route Out" (CITY-1, the Dwight Way–Dwight Place link the Time Study tested) has nearly the same access effect as the two Smyth Ln links found here. All three are steep: the City line climbs 70 m in 174 m and would need about 467 m of road to hold a 15% grade. Screening cost ranges: AC-160-N3 $1.5M–$6.0M; AC-134-N2 $1.6M–$7.4M; CITY-1 $1.3M–$10.6M.
- **Elsewhere the largest single gains are smaller.** After Panoramic Hill, AC-540-N1 (Caldecott Ln → Tunnel Rd, 122 m) frees 243; AC-036-N2 (Oak Ridge Rd → The Uplands, 112 m) frees 72; AC-036-N1 (Oak Ridge Rd → Alvarado Rd, 92 m) frees 72; AC-036-N3 (Oak Ridge Rd → Tunnel Rd, 117 m) frees 72 hill residents. 78 of 125 candidates were pruned, 66 of them because the corridor would cross three or more buildings; 14 of 41 dead-end areas have no surviving link of their own.
- **With the fire on, a second way out changes almost nothing for people who have not yet left home, the Time Study's lesson (E25).** In 780 same-seed pairs, the number of an area's synthetic residents still at home when the fire front arrived changed in 48: when a household is ready to leave does not depend on the streets, so a new street gets no one out of the house sooner (the few changes are cars waiting for room on a full street, and neighbors riding with them). Where the fire never reaches the area (most tested areas on the 1923 and east-wind fires), the area's 90% clearance time moves by at most 1.3 minutes (central median), in either direction.
- **On the Panoramic Hill fire, a second way out gets some cars out that would be cut off, but not the people still at home when the fire arrives.** Without a link, about 163 of Panoramic Hill's roughly 479 vehicles end the run on the road with no route to safety (central median, first order 10 minutes after ignition); with AC-160-N3 150 (better in 13, worse in 0 of 15), AC-134-N2 142 (better in 13, worse in 0 of 15), CITY-1 131 (better in 15, worse in 0 of 15). About 389 of its synthetic residents are still at home when the fire front reaches their street, with or without a link.
- **Where a link does help: the fire closes the only exit while people are leaving.** AC-193-N1 (Buena Vista Wy → W Parnassus Ct) on the ref1923 fire: the area's vehicles cut off 4 → 0 (better in 8, worse in 0, no different in 7 of 15 same-seed pairs); all vehicles cut off 78 → 70. No effect holds in every same-seed pair, because at low severity the fire does not reach the exit; none was ever worse on this measure.
- **A later order (20 minutes after ignition instead of 10) leaves more vehicles cut off; the links' share of them stays small.** AC-160-N3 on panoramic: 189 → 180 (14/1/0); AC-134-N2 on panoramic: 189 → 181 (13/2/0); AC-193-N1 on ref1923: 4 → 0 (7/0/8); CITY-1 on panoramic: 189 → 165 (14/0/1).

## Ranked candidates

46 candidates survived screening for 41 dead-end areas (plus the City concept, below). They are ranked by hill residents no longer behind any choke point when the link is added (access effect, no fire), then by the high end of the cost range. Several candidates for one area are alternatives, not a package. "Area residents behind a choke" counts the residents of the candidate's area who are still behind any choke afterward; nesting is the number of chokes in series. Grades are the ground under a straight line (4 m lidar DEM); a built road would cut, fill or switch back. Corridor: 12.2 m (40 ft, assumption). Parcels: Alameda County only; "no data" in Contra Costa County. Costs in 2024–2025 dollars, screening ranges (see Costs).

| # | Candidate | Area | Type | Link | Length, m | Climb and grade | On a path | Buildings in corridor | Parcels crossed / in corridor | Outside parcels | Land | Fire zone | Hill residents freed | Area residents behind a choke; nesting | Construction | Acquisition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AC-160-N3 | AC-160 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Smyth Ln | 88 | -18.4 m; avg 21%, 25 m windows p90 49.8% (worst 56.1%) (>20%) | 0% | 1 | 3 / 3 | 12% | — | FZ3 | 823 | 437 → 97; nesting 3 → 1 | $500k–$2.1M | $1.0M–$3.9M |
| 2 | AC-134-N2 | AC-134 Smyth Ln | new road | Smyth Ln → Dwight Wy | 92 | 25.1 m; avg 27.4%, 25 m windows p90 53.9% (worst 61%) (>20%) | 0% | 1 | 3 / 4 | 4% | — | FZ3 | 823 | 54 → 0; nesting 1 → 0 | $520k–$2.8M | $1.1M–$4.6M |
| 3 | AC-134-N1 | AC-134 Smyth Ln | new road | Smyth Ln → Panoramic Wy | 176 | 2.5 m; avg 1.4%, 25 m windows p90 34.4% (worst 41.2%) (>20%) | 0% | 2 | 4 / 5 | 7% | — | FZ2 | 483 | 54 → 0; nesting 1 → 0 | $1.0M–$3.0M | $1.9M–$7.2M |
| 4 | AC-155-O1 | AC-155 Panoramic Wy, Mosswood Rd … | path upgrade | Mosswood Rd → Canyon Rd | 177 | -36.8 m; avg 20.7%, 25 m windows p90 28.7% (worst 33.8%) (>20%) | 90% | 0 | 2 / 4 | 10% | UC 89%, park 89% | FZ2 | 337 | 972 → 638; nesting 1 → 3 | $1.0M–$4.2M | $340k–$2.6M |
| 5 | AC-156-N3 | AC-156 Mosswood Rd | new road | Mosswood Rd → Canyon Rd | 86 | -25 m; avg 29%, 25 m windows p90 32.3% (worst 32.7%) (>20%) | 20% | 2 | 3 / 4 | 11% | — | FZ3 | 308 | 57 → 29; nesting 2 → 1 | $490k–$2.8M | $1.9M–$6.6M |
| 6 | AC-155-N3 | AC-155 Panoramic Wy, Mosswood Rd … | new road | Panoramic Wy → Smyth Ln | 139 | -25 m; avg 18%, 25 m windows p90 50.9% (worst 58.5%) (>20%) | 0% | 2 | 3 / 7 | 16% | — | FZ2 | 276 | 972 → 696; nesting 1 → 3 | $790k–$2.8M | $2.1M–$8.5M |
| 7 | AC-540-N1 | AC-540 Caldecott Ln (also AC-541) | new road | Caldecott Ln → Tunnel Rd | 122 | 14 m; avg 11.5%, 25 m windows p90 36.8% (worst 50.4%) (>20%) | 0% | 0 | 2 / 2 | 8% | — | hill (≥90 m) | 243 | 276 → 33; nesting 1 → 1 | $690k–$2.1M | $110k–$380k |
| 8 | AC-036-N2 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → The Uplands | 112 | -1.4 m; avg 1.3%, 25 m windows p90 31.4% (worst 38.5%) (>20%) | 17% | 1 | 2 / 3 | 18% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $630k–$1.9M | $2.4M–$3.0M |
| 9 | AC-036-N1 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → Alvarado Rd | 92 | -3 m; avg 3.3%, 25 m windows p90 43.2% (worst 46.9%) (>20%) | 0% | 2 | 3 / 3 | 17% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $520k–$1.6M | $4.2M–$4.5M |
| 10 | AC-036-N3 | AC-036 Oak Ridge Rd | new road | Oak Ridge Rd → Tunnel Rd | 117 | -10.2 m; avg 8.7%, 25 m windows p90 44.4% (worst 51.7%) (>20%) | 0% | 2 | 4 / 6 | 19% | — | FZ2 | 72 | 72 → 0; nesting 1 → 0 | $660k–$2.0M | $4.8M–$6.0M |
| 11 | AC-421-N3 | AC-421 Kingston Rd | new road | Kingston Rd → Sunset Te | 214 | 27.7 m; avg 13%, 25 m windows p90 25.3% (worst 37.1%) (>20%) | 0% | 0 | no data | — | — | hill (≥90 m) | 62 | 56 → 0; nesting 1 → 0 | $1.2M–$3.6M | — |
| 12 | AC-421-N2 | AC-421 Kingston Rd | new road | Kingston Rd → Berkeley Park Bl | 235 | -6.2 m; avg 2.6%, 25 m windows p90 13% (worst 14.6%) | 0% | 2 | no data | — | — | — | 55 | 56 → 0; nesting 1 → 0 | $1.3M–$4.0M | — |
| 13 | AC-010-N1 | AC-010 Napa Av | new road | Napa Av → Josephine St | 20 | 1.1 m; avg 5.4%, 25 m windows p90 5.4% (worst 5.4%) | 32% | 0 | 0 / 0 | 100% | — | FZ2 | 53 | 54 → 0; nesting 1 → 0 | $110k–$340k | $0k–$0k |
| 14 | AC-010-N2 | AC-010 Napa Av | new road | Napa Av → Hopkins St | 97 | -2.2 m; avg 2.3%, 25 m windows p90 3.8% (worst 4.7%) | 34% | 0 | 0 / 0 | 100% | — | FZ2 | 53 | 54 → 0; nesting 1 → 0 | $550k–$1.6M | $0k–$0k |
| 15 | AC-010-N3 | AC-010 Napa Av | new road | Napa Av → Sonoma Av | 99 | -4.5 m; avg 4.5%, 25 m windows p90 5.4% (worst 5.9%) | 22% | 1 | 0 / 1 | 100% | park 50% | FZ1 | 53 | 54 → 0; nesting 1 → 0 | $560k–$1.7M | $1.5M–$1.9M |
| 16 | AC-010-P1 | AC-010 Napa Av | open barrier | Napa Av → The Alameda | 3 | 0 m; avg 0%, 25 m windows p90 0% (worst 0%) | 100% | 0 | no data | — | — | FZ2 | 53 | 54 → 0; nesting 1 → 0 | — | not priced |
| 17 | AC-211-N1 | AC-211 High Ct, Laurel St … | new road | High Ct → Euclid Av | 76 | -4.2 m; avg 5.5%, 25 m windows p90 15% (worst 22.9%) | 28% | 2 | 6 / 7 | 60% | — | FZ2 | 51 | 104 → 53; nesting 1 → 1 | $430k–$1.3M | $3.3M–$5.9M |
| 18 | AC-225-N3 | AC-225 San Mateo Rd | new road | San Mateo Rd → San Diego Rd | 187 | 19.8 m; avg 10.6%, 25 m windows p90 22.6% (worst 33.9%) (>20%) | 23% | 2 | 4 / 5 | 14% | park 47% | FZ2 | 51 | 51 → 0; nesting 1 → 0 | $1.1M–$3.2M | $4.6M–$5.5M |
| 19 | AC-193-N1 | AC-193 Buena Vista Wy | new road | Buena Vista Wy → W Parnassus Ct | 97 | 25.9 m; avg 26.8%, 25 m windows p90 40% (worst 42.2%) (>20%) | 0% | 2 | 2 / 3 | 18% | — | FZ2 | 48 | 39 → 0; nesting 1 → 0 | $550k–$2.9M | $1.4M–$3.2M |
| 20 | AC-552-N2 | AC-552 Drury Ct, Drury Rd | new road | Drury Ct → Dartmouth Dr | 178 | -14.7 m; avg 8.2%, 25 m windows p90 68.1% (worst 81.2%) (>20%) | 26% | 1 | 6 / 7 | 33% | — | hill (≥90 m) | 43 | 43 → 0; nesting 1 → 0 | $1.0M–$3.0M | $3.2M–$5.0M |
| 21 | AC-552-N1 | AC-552 Drury Ct, Drury Rd | new road | Drury Ct → Drury Ln | 146 | 8.9 m; avg 6.1%, 25 m windows p90 38.4% (worst 54.1%) (>20%) | 0% | 2 | 7 / 10 | 12% | — | hill (≥90 m) | 43 | 43 → 0; nesting 1 → 0 | $830k–$2.5M | $5.6M–$8.0M |
| 22 | AC-211-N2 | AC-211 High Ct, Laurel St … | new road | Laurel St → Glen Av | 99 | -12.2 m; avg 12.3%, 25 m windows p90 22.7% (worst 24.4%) (>20%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 42 | 104 → 62; nesting 1 → 1 | $560k–$1.7M | $0k–$0k |
| 23 | AC-211-P1 | AC-211 High Ct, Laurel St … | path upgrade | Laurel St → Oak St | 99 | -12.2 m; avg 12.3%, 25 m windows p90 22.7% (worst 24.4%) (>20%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 42 | 104 → 62; nesting 1 → 1 | $560k–$1.7M | $0k–$0k |
| 24 | AC-520-P1 | AC-520 Spyglass Hill | open barrier | Spyglass Hill → Spyglass Hill | 3 | -0.4 m; avg 13.5%, 25 m windows p90 13.5% (worst 13.5%) | 0% | 0 | 17 / 17 | 0% | — | hill (≥90 m) | 41 | 40 → 0; nesting 1 → 0 | — | not priced |
| 25 | AC-520-N3 | AC-520 Spyglass Hill | new road | Spyglass Hill → Hiller Dr | 12 | -0.7 m; avg 5.8%, 25 m windows p90 5.8% (worst 5.8%) | 0% | 0 | 17 / 17 | 64% | — | hill (≥90 m) | 40 | 40 → 0; nesting 1 → 0 | $70k–$200k | $2.4M–$7.0M |
| 26 | AC-520-N1 | AC-520 Spyglass Hill | new road | Spyglass Hill → Starview Dr | 79 | 11.4 m; avg 14.5%, 25 m windows p90 19.1% (worst 19.5%) (>15%) | 0% | 0 | 17 / 17 | 90% | — | hill (≥90 m) | 40 | 40 → 0; nesting 1 → 0 | $450k–$1.3M | $2.4M–$7.0M |
| 27 | AC-133-N1 | AC-133 Maybeck Twin Dr | new road | Maybeck Twin Dr → La Loma Av | 80 | -21.8 m; avg 27.1%, 25 m windows p90 35.5% (worst 41.5%) (>20%) | 0% | 2 | 3 / 5 | 10% | — | FZ2 | 39 | 39 → 0; nesting 1 → 0 | $450k–$2.5M | $1.5M–$3.9M |
| 28 | AC-549-N1 | AC-549 Besito Av | new road | Besito Av → Gravatt Dr | 134 | -31.4 m; avg 23.4%, 25 m windows p90 47.2% (worst 55.2%) (>20%) | 0% | 2 | 5 / 6 | 21% | — | hill (≥90 m) | 39 | 39 → 0; nesting 1 → 0 | $760k–$3.5M | $4.8M–$6.0M |
| 29 | AC-002-N1 | AC-002 Hilgard Av | new road | Hilgard Av → La Loma Av | 157 | -39.8 m; avg 25.3%, 25 m windows p90 39% (worst 48.4%) (>20%) | 10% | 1 | 0 / 2 | 100% | — | FZ2 | 38 | 38 → 0; nesting 1 → 0 | $890k–$4.5M | $1.1M–$1.6M |
| 30 | AC-231-N2 | AC-231 Le Conte Av | new road | Le Conte Av → La Vereda Rd | 113 | 7.5 m; avg 6.6%, 25 m windows p90 29.5% (worst 62.4%) (>20%) | 0% | 2 | 3 / 4 | 16% | — | FZ2 | 36 | 36 → 0; nesting 1 → 0 | $640k–$1.9M | $1.5M–$3.9M |
| 31 | AC-501-N1 | AC-501 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Derby St | 48 | -1.5 m; avg 3.1%, 25 m windows p90 4.2% (worst 4.2%) | 52% | 0 | 0 / 0 | 100% | — | FZ1 | 35 | 49 → 15; nesting 1 → 1 | $270k–$820k | $0k–$0k |
| 32 | AC-501-N3 | AC-501 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Unnamed | 66 | 1.6 m; avg 2.4%, 25 m windows p90 4.3% (worst 6%) | 93% | 1 | 1 / 2 | 25% | UC 78% | FZ1 | 35 | 49 → 15; nesting 1 → 1 | $370k–$1.1M | $2.2M–$2.5M |
| 33 | AC-501-P1 | AC-501 Tanglewood Rd, Unnamed … | open barrier | Tanglewood Rd → Derby St | 3 | -0.1 m; avg 3.3%, 25 m windows p90 3.3% (worst 3.3%) | 100% | 0 | 0 / 0 | 100% | — | FZ1 | 35 | 49 → 15; nesting 1 → 1 | — | not priced |
| 34 | AC-208-N1 | AC-208 Virginia St | new road | Virginia St → La Loma Av | 41 | -6.2 m; avg 15.1%, 25 m windows p90 16.4% (worst 17.6%) (>15%) | 51% | 0 | 0 / 1 | 100% | — | FZ2 | 32 | 32 → 0; nesting 1 → 0 | $230k–$700k | $100k–$320k |
| 35 | AC-501-N2 | AC-501 Tanglewood Rd, Unnamed … | new road | Tanglewood Rd → Belrose Av | 53 | -3.3 m; avg 6.3%, 25 m windows p90 8% (worst 8.4%) | 100% | 1 | 0 / 1 | 100% | — | FZ2 | 27 | 49 → 22; nesting 1 → 1 | $300k–$900k | $2.0M–$2.0M |
| 36 | AC-501-O1 | AC-501 Tanglewood Rd, Unnamed … | path upgrade | Garber St → Garber St | 4 | 0 m; avg 0%, 25 m windows p90 0% (worst 0%) | 100% | 0 | 0 / 0 | 100% | — | FZ2 | 23 | 49 → 44; nesting 1 → 1 | $20k–$70k | $0k–$0k |
| 37 | AC-076-N1 | AC-076 Bay Tree Ln | new road | Bay Tree Ln → Shasta Golf Course Rd | 93 | -17.3 m; avg 18.6%, 25 m windows p90 56.6% (worst 60.1%) (>20%) | 16% | 1 | 2 / 3 | 14% | — | FZ2 | 22 | 39 → 17; nesting 1 → 1 | $530k–$1.9M | $1.3M–$2.9M |
| 38 | AC-076-N3 | AC-076 Bay Tree Ln | new road | Bay Tree Ln → Park Hills Rd | 138 | -17.8 m; avg 12.9%, 25 m windows p90 41% (worst 53.3%) (>20%) | 16% | 2 | 4 / 6 | 40% | — | FZ2 | 22 | 39 → 17; nesting 1 → 1 | $780k–$2.4M | $3.9M–$5.3M |
| 39 | AC-076-N2 | AC-076 Bay Tree Ln | new road | Bay Tree Ln → Grizzly Peak Bl | 155 | -17.5 m; avg 11.3%, 25 m windows p90 34.3% (worst 44.8%) (>20%) | 0% | 2 | 3 / 5 | 19% | — | FZ2 | 22 | 39 → 17; nesting 1 → 1 | $880k–$2.6M | $2.5M–$5.4M |
| 40 | AC-498-N3 | AC-498 Stonewall Rd | new road | Stonewall Rd → Unnamed | 223 | -23.8 m; avg 10.7%, 25 m windows p90 21.4% (worst 28.9%) (>20%) | 39% | 2 | 3 / 6 | 9% | UC 85%, EBRPD 3% | FZ1 | 22 | 63 → 41; nesting 1 → 1 | $1.3M–$3.8M | $4.8M–$6.0M |
| 41 | AC-161-N3 | AC-161 Panoramic Pl (also AC-164) | new road | Panoramic Pl → Panoramic Pl | 190 | 50.5 m; avg 26.6%, 25 m windows p90 29.5% (worst 37.1%) (>20%) | 66% | 0 | 2 / 3 | 4% | UC 95%, park 95% | hill (≥90 m) | 0 | 46 → 46; nesting 4 → 3 | $1.1M–$5.7M | $600k–$1.5M |
| 42 | AC-160-P1 | AC-160 Panoramic Wy, Panoramic Pl … | path upgrade | Panoramic Wy → Arden Rd | 60 | -15.3 m; avg 25.5%, 25 m windows p90 27.8% (worst 30.1%) (>20%) | 100% | 2 | 2 / 3 | 18% | — | FZ3 | 0 | 437 → 437; nesting 3 → 3 | $340k–$1.7M | $1.8M–$5.9M |
| 43 | AC-141-N1 | AC-141 Hill Rd | new road | Hill Rd → Grizzly Peak Bl | 89 | -24.9 m; avg 28.1%, 25 m windows p90 32.9% (worst 37.6%) (>20%) | 98% | 2 | 2 / 4 | 22% | — | FZ2 | 0 | 21 → 21; nesting 1 → 1 | $500k–$2.8M | $2.4M–$4.9M |
| 44 | AC-160-N2 | AC-160 Panoramic Wy, Panoramic Pl … (also AC-159) | new road | Panoramic Wy → Arden Rd | 59 | -15.3 m; avg 26%, 25 m windows p90 28% (worst 28.5%) (>20%) | 100% | 2 | 2 / 4 | 20% | — | FZ3 | 0 | 437 → 437; nesting 3 → 3 | $330k–$1.7M | $1.9M–$6.6M |
| 45 | AC-159-N3 | AC-159 Arden Rd | new road | Arden Rd → Panoramic Pl | 105 | 20.7 m; avg 19.7%, 25 m windows p90 26.6% (worst 29.1%) (>20%) | 66% | 2 | 2 / 4 | 50% | — | FZ3 | 0 | 24 → 24; nesting 3 → 2 | $590k–$2.4M | $1.9M–$6.6M |
| 46 | AC-161-N2 | AC-161 Panoramic Pl | new road | Panoramic Pl → Mosswood Rd | 149 | -42.5 m; avg 28.4%, 25 m windows p90 35.2% (worst 36.5%) (>20%) | 11% | 2 | 3 / 6 | 10% | UC 56%, park 56% | FZ2 | 0 | 46 → 46; nesting 4 → 2 | $840k–$4.8M | $2.0M–$7.9M |


## Evacuation effect, fire on

`tools/egress-sim.mjs` adds each tested link to the network at run time (two-way local street, 20 ft, no parking, no homes on it; `tools/egress-link.mjs`) and runs the simulator for each fire that orders or reaches the area, at low, central and high severity × seeds 1–5, the same seed with and without the link, with the first order 10 minutes after ignition (the simulator default) and 20 minutes (a later order). The area measured is the largest chosen area whose residents the link changes; for links into Panoramic Hill that is all of Panoramic Hill (AC-155). Each cell gives the central-severity median without → with the link, then in brackets the number of the 15 same-seed pairs where the link made the measure better / worse / no different. Lower is better for every measure; a run in which not all of the area's vehicles got out within the simulated period has no 100% time and counts as worse than any time. "Still home when the fire front or embers arrived" counts synthetic people at that moment; it is not a casualty count. 900 runs.

| Candidate | Area measured | Fire | Order after, min | Area residents | Area: still home when the fire front arrived | … when embers arrived | Area vehicles on a street when the fire front reached it | Area vehicles cut off (no route at the end) | Area 90% out, min | Area 100% out, min | All vehicles cut off | All people still there when the fire front arrived |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 972 | 389 → 389 (0/0/15) | 777 → 777 (0/0/15) | 187 → 186 (14/1/0) | 163 → 150 (13/0/2) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 242 → 239 (14/0/1) | 3,942 → 3,930 (13/1/1) |
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 972 | 479 → 476 (2/1/12) | 818 → 818 (0/0/15) | 213 → 212 (10/5/0) | 189 → 180 (14/1/0) | not all out → not all out (4/0/11) | not all out → not all out (0/0/15) | 301 → 288 (14/0/1) | 4,273 → 4,285 (11/3/1) |
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 108 (13/1/1) | 173 → 173 (5/3/7) | 78 → 78 (4/3/8) | 603 → 603 (7/5/3) |
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 109 (11/2/2) | 173 → 173 (3/2/10) | 103 → 103 (6/2/7) | 778 → 765 (7/5/3) |
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (6/3/6) | 137 → 137 (4/7/4) | 50 → 49 (4/1/10) | 412 → 410 (6/6/3) |
| AC-160-N3 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (9/2/4) | 136 → 137 (7/6/2) | 74 → 74 (2/2/11) | 509 → 515 (4/6/5) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 972 | 389 → 389 (1/0/14) | 777 → 777 (1/0/14) | 187 → 177 (12/0/3) | 163 → 142 (13/0/2) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 242 → 235 (14/0/1) | 3,942 → 3,952 (14/1/0) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 972 | 479 → 476 (3/1/11) | 818 → 818 (2/0/13) | 213 → 211 (10/3/2) | 189 → 181 (13/2/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 301 → 292 (12/3/0) | 4,273 → 4,283 (13/2/0) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 108 (13/1/1) | 173 → 173 (2/4/9) | 78 → 78 (4/3/8) | 603 → 610 (7/6/2) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 109 (15/0/0) | 173 → 173 (4/4/7) | 103 → 103 (5/3/7) | 778 → 767 (9/4/2) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (8/7/0) | 137 → 137 (5/8/2) | 50 → 50 (2/2/11) | 412 → 412 (5/5/5) |
| AC-134-N2 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (7/6/2) | 136 → 137 (6/8/1) | 74 → 73 (3/4/8) | 509 → 515 (6/5/4) |
| AC-036-N2 | AC-036 Oak Ridge Rd | eastWind | 10 | 71 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 103 → 103 (7/6/2) | 134 → 134 (7/6/2) | 50 → 49 (4/2/9) | 412 → 408 (6/4/5) |
| AC-036-N2 | AC-036 Oak Ridge Rd | eastWind | 20 | 71 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 103 → 103 (9/4/2) | 134 → 134 (8/5/2) | 74 → 74 (3/1/11) | 509 → 517 (7/5/3) |
| AC-036-N1 | AC-036 Oak Ridge Rd | eastWind | 10 | 71 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 103 → 103 (7/4/4) | 134 → 134 (5/8/2) | 50 → 49 (3/3/9) | 412 → 404 (6/4/5) |
| AC-036-N1 | AC-036 Oak Ridge Rd | eastWind | 20 | 71 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 103 → 103 (7/5/3) | 134 → 133 (5/5/5) | 74 → 74 (1/4/10) | 509 → 521 (4/5/6) |
| AC-010-N1 | AC-010 Napa Av | ref1923 | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 105 → 104 (8/5/2) | 114 → 114 (6/5/4) | 78 → 78 (6/2/7) | 603 → 604 (8/5/2) |
| AC-010-N1 | AC-010 Napa Av | ref1923 | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 105 → 105 (3/10/2) | 114 → 114 (3/11/1) | 103 → 103 (6/1/8) | 778 → 767 (8/6/1) |
| AC-010-N1 | AC-010 Napa Av | eastWind | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (2/12/1) | 105 → 106 (3/11/1) | 50 → 48 (1/3/11) | 412 → 404 (8/4/3) |
| AC-010-N1 | AC-010 Napa Av | eastWind | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (4/10/1) | 105 → 106 (6/7/2) | 74 → 74 (1/3/11) | 509 → 517 (4/7/4) |
| AC-010-N2 | AC-010 Napa Av | ref1923 | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 105 → 105 (9/3/3) | 114 → 114 (3/10/2) | 78 → 78 (3/4/8) | 603 → 599 (8/6/1) |
| AC-010-N2 | AC-010 Napa Av | ref1923 | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 105 → 105 (7/8/0) | 114 → 114 (5/9/1) | 103 → 103 (2/3/10) | 778 → 780 (7/7/1) |
| AC-010-N2 | AC-010 Napa Av | eastWind | 10 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (2/12/1) | 105 → 105 (0/15/0) | 50 → 49 (2/3/10) | 412 → 410 (6/5/4) |
| AC-010-N2 | AC-010 Napa Av | eastWind | 20 | 55 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (2/13/0) | 105 → 106 (5/10/0) | 74 → 74 (3/2/10) | 509 → 517 (5/5/5) |
| AC-211-N1 | AC-211 High Ct, Laurel St … | ref1923 | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 106 → 106 (10/4/1) | 152 → 152 (10/4/1) | 78 → 79 (5/2/8) | 603 → 606 (8/4/3) |
| AC-211-N1 | AC-211 High Ct, Laurel St … | ref1923 | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 106 → 106 (8/5/2) | 152 → 152 (12/0/3) | 103 → 104 (7/2/6) | 778 → 769 (8/6/1) |
| AC-211-N1 | AC-211 High Ct, Laurel St … | eastWind | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 89 (5/9/1) | 109 → 110 (3/9/3) | 50 → 49 (3/2/10) | 412 → 412 (6/5/4) |
| AC-211-N1 | AC-211 High Ct, Laurel St … | eastWind | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (6/6/3) | 109 → 110 (3/10/2) | 74 → 74 (3/2/10) | 509 → 519 (6/7/2) |
| AC-225-N3 | AC-225 San Mateo Rd | ref1923 | 10 | 52 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (0/15/0) | 107 → 107 (2/10/3) | 78 → 79 (2/6/7) | 603 → 608 (6/5/4) |
| AC-225-N3 | AC-225 San Mateo Rd | ref1923 | 20 | 52 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (1/14/0) | 107 → 108 (0/13/2) | 103 → 103 (4/3/8) | 778 → 771 (9/6/0) |
| AC-225-N3 | AC-225 San Mateo Rd | eastWind | 10 | 52 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 86 → 86 (4/5/6) | 110 → 110 (7/4/4) | 50 → 50 (4/2/9) | 412 → 408 (7/7/1) |
| AC-225-N3 | AC-225 San Mateo Rd | eastWind | 20 | 52 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 86 → 86 (3/9/3) | 110 → 110 (4/6/5) | 74 → 74 (3/2/10) | 509 → 521 (7/4/4) |
| AC-193-N1 | AC-193 Buena Vista Wy | ref1923 | 10 | 38 | 7 → 7 (1/0/14) | 36 → 36 (0/0/15) | 7 → 1 (9/0/6) | 4 → 0 (8/0/7) | 99 → 109 (5/4/6) | not all out → 137 (3/5/7) | 78 → 70 (8/2/5) | 603 → 593 (10/3/2) |
| AC-193-N1 | AC-193 Buena Vista Wy | ref1923 | 20 | 38 | 12 → 12 (1/0/14) | 36 → 36 (0/0/15) | 8 → 2 (8/0/7) | 4 → 0 (7/0/8) | 99 → 109 (4/5/6) | not all out → 137 (5/2/8) | 103 → 94 (9/0/6) | 778 → 761 (10/4/1) |
| AC-193-N1 | AC-193 Buena Vista Wy | eastWind | 10 | 38 | 2 → 2 (0/0/15) | 28 → 28 (0/0/15) | 0 → 0 (4/1/10) | 0 → 0 (1/0/14) | 88 → 89 (1/3/11) | 102 → 103 (1/4/10) | 50 → 49 (5/1/9) | 412 → 412 (4/4/7) |
| AC-193-N1 | AC-193 Buena Vista Wy | eastWind | 20 | 38 | 2 → 2 (0/0/15) | 36 → 36 (0/0/15) | 0 → 0 (2/2/11) | 0 → 0 (1/0/14) | 88 → 88 (2/2/11) | 102 → 103 (1/4/10) | 74 → 74 (3/1/11) | 509 → 521 (5/2/8) |
| AC-211-N2 | AC-211 High Ct, Laurel St … | ref1923 | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 106 → 106 (3/9/3) | 152 → 152 (6/6/3) | 78 → 79 (3/6/6) | 603 → 604 (8/4/3) |
| AC-211-N2 | AC-211 High Ct, Laurel St … | ref1923 | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 106 → 106 (2/7/6) | 152 → 152 (4/6/5) | 103 → 104 (5/3/7) | 778 → 782 (7/3/5) |
| AC-211-N2 | AC-211 High Ct, Laurel St … | eastWind | 10 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (1/7/7) | 109 → 109 (2/5/8) | 50 → 50 (2/0/13) | 412 → 410 (4/8/3) |
| AC-211-N2 | AC-211 High Ct, Laurel St … | eastWind | 20 | 104 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 88 → 88 (6/5/4) | 109 → 110 (4/6/5) | 74 → 73 (4/2/9) | 509 → 523 (5/5/5) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 10 | 972 | 389 → 389 (5/0/10) | 777 → 777 (4/0/11) | 187 → 171 (15/0/0) | 163 → 131 (15/0/0) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 242 → 235 (15/0/0) | 3,942 → 3,908 (15/0/0) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | panoramic | 20 | 972 | 479 → 474 (4/0/11) | 818 → 818 (3/0/12) | 213 → 200 (15/0/0) | 189 → 165 (14/0/1) | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 301 → 294 (13/0/2) | 4,273 → 4,233 (14/1/0) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 109 (12/1/2) | 173 → 173 (3/3/9) | 78 → 78 (6/1/8) | 603 → 601 (8/5/2) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | ref1923 | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 112 → 109 (10/1/4) | 173 → 173 (4/2/9) | 103 → 103 (4/2/9) | 778 → 777 (9/5/1) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 10 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (7/3/5) | 137 → 138 (6/6/3) | 50 → 50 (3/1/11) | 412 → 404 (7/5/3) |
| CITY-1 | AC-155 Panoramic Wy, Mosswood Rd … | eastWind | 20 | 972 | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) | 93 → 93 (5/2/8) | 136 → 137 (12/3/0) | 74 → 73 (4/3/8) | 509 → 519 (6/5/4) |

## Panoramic Hill and the Time Study benchmark

The 2025 Evacuation Time Study (§10.4, Tables 10-9 and 10-10, pp. 10-4 and 10-16) tested a second way out of Panoramic Hill connecting Dwight Way to Dwight Place, the same line as the City's "2nd Route Out" layer, and measured when vehicles had left Panoramic Hill (beyond Panoramic Way or Dwight Way). With normal mobilization, two ways out changed neither the 90th nor the 100th percentile in any scenario (R04 90th percentile 1:15–1:30, 100th 3:25–3:40), because the 3.5-hour mobilization sets the time. With urgent mobilization (everyone with a car ready within 30 minutes), the R04 90th percentile fell from 0:30–1:00 to 0:30–0:50, at most 33% (R02 at most 29%); in the fall midweek midday case (S4, the time the simulator uses for both fires below) R04 went from 1:00 to 0:40 and R02 from 1:25 to 1:00. SOURCE_NOTES E25.

The simulator measures the same thing for all of Panoramic Hill (area AC-155, behind the foot of Panoramic Way): minutes from the first order until 90% and 100% of its evacuating vehicles have left the area. "Urgent" replaces every mobilization curve with an even spread over 30 minutes, for this comparison only (a harness setting, not a simulator plan).

**Access, no fire: Panoramic Hill residents behind any choke point.** Every candidate that changes Panoramic Hill, with the residents of AC-155 behind any choke before → after the link is added.

| Candidate | Type | Link | Length, m | Average grade | Residents behind a choke | Screening cost |
|---|---|---|---|---|---|---|
| AC-160-N3 | new road | Panoramic Wy → Smyth Ln | 88 | 21% | 972 → 202 | $1.5M–$6.0M |
| AC-134-N2 | new road | Smyth Ln → Dwight Wy | 92 | 27.4% | 972 → 202 | $1.6M–$7.4M |
| AC-134-N1 | new road | Smyth Ln → Panoramic Wy | 176 | 1.4% | 972 → 542 | $2.9M–$10.2M |
| AC-155-O1 | path upgrade | Mosswood Rd → Canyon Rd | 177 | 20.7% | 972 → 638 | $1.3M–$6.8M |
| AC-156-N3 | new road | Mosswood Rd → Canyon Rd | 86 | 29% | 972 → 667 | $2.3M–$9.4M |
| AC-155-N3 | new road | Panoramic Wy → Smyth Ln | 139 | 18% | 972 → 696 | $2.9M–$11.4M |
| AC-160-P1 | path upgrade | Panoramic Wy → Arden Rd | 60 | 25.5% | no change | $2.1M–$7.6M |
| AC-160-N2 | new road | Panoramic Wy → Arden Rd | 59 | 26% | no change | $2.2M–$8.3M |
| CITY-1 | City concept | Dwight Wy → Dwight Pl | 174 | 40.2% | 972 → 194 | $1.3M–$10.6M |

**Fire on.** Cells as in the evacuation table: central-severity median without → with the link (better / worse / no different, of 15 same-seed pairs). First order 10 minutes after ignition.

| Candidate | Fire | Mobilization | Panoramic Hill 90% out, min | 100% out, min | Vehicles cut off | Still home when the fire front arrived |
|---|---|---|---|---|---|---|
| AC-160-N3 | panoramic | normal | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 163 → 150 (13/0/2) | 389 → 389 (0/0/15) |
| AC-160-N3 | panoramic | urgent | 61 → 48 (10/0/5) | not all out → 78 (7/0/8) | 42 → 1 (11/0/4) | 33 → 33 (6/4/5) |
| AC-160-N3 | ref1923 | normal | 112 → 108 (13/1/1) | 173 → 173 (5/3/7) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-160-N3 | ref1923 | urgent | 86 → 39 (15/0/0) | 95 → 62 (15/0/0) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-134-N2 | panoramic | normal | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 163 → 142 (13/0/2) | 389 → 389 (1/0/14) |
| AC-134-N2 | panoramic | urgent | 61 → 52 (10/0/5) | not all out → 80 (7/0/8) | 42 → 1 (10/1/4) | 33 → 36 (5/4/6) |
| AC-134-N2 | ref1923 | normal | 112 → 108 (13/1/1) | 173 → 173 (2/4/9) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| AC-134-N2 | ref1923 | urgent | 86 → 42 (15/0/0) | 95 → 63 (15/0/0) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | panoramic | normal | not all out → not all out (5/0/10) | not all out → not all out (0/0/15) | 163 → 131 (15/0/0) | 389 → 389 (5/0/10) |
| CITY-1 | panoramic | urgent | 61 → 45 (10/0/5) | not all out → not all out (5/0/10) | 42 → 1 (11/0/4) | 33 → 24 (9/1/5) |
| CITY-1 | ref1923 | normal | 112 → 109 (12/1/2) | 173 → 173 (3/3/9) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |
| CITY-1 | ref1923 | urgent | 86 → 54 (15/0/0) | 95 → 65 (14/1/0) | 0 → 0 (0/0/15) | 0 → 0 (0/0/15) |

- **Normal mobilization mostly agrees with the Time Study.** On the 1923 fire, where Panoramic Hill is ordered but the fire does not reach it, its 90% time is about 112 minutes without a link, and a link shortens it by 1.3, 1.1, 0.1 minutes (AC-160-N3, AC-134-N2, CITY-1; central median change), against no change in the study (1:30 for R04 S4 either way).
- **Urgent mobilization reproduces the study's gain, and more.** With everyone ready within 30 minutes, the simulator's Panoramic Hill 90% time on the 1923 fire is about 86 minutes with one way out (the study: 1:00 for R04 S4) and 39 with AC-160-N3, 42 with AC-134-N2, 54 with CITY-1 (the study: 0:40), better in 15, 15, 15 of 15 same-seed pairs. With one way out, Panoramic Hill's cars queue down Panoramic Way to the foot of the hill, where they join the queues on Rim Rd, Stadium Rim Rd, Bancroft Wy and Piedmont Av by Memorial Stadium; a link lets most of them leave by Smyth Ln and Dwight Way instead. The simulator's gain (about 45 minutes, central median) is larger than the study's (20 minutes for R04 S4, at most 33%), and its one-exit time is longer. The first run of this analysis, on the network before the Bancroft Wy correction, found no gain (SOURCE_NOTES EG8).
- **On the Panoramic Hill fire, the problem is timing more than the number of exits.** With urgent mobilization the synthetic people still home when the fire front arrived fall from about 389 to 33 with or without a link, and vehicles cut off from about 163 to 42 with one way out and 1, 1, 1 with AC-160-N3, AC-134-N2, CITY-1.

## What was pruned, and areas left without a candidate

78 of 125 candidates were pruned as physically implausible under two model rules: an average grade over 30% (a road held to 15% would need at least twice the straight length), or 3 or more buildings in the 12.2 m corridor. 66 failed the building rule and 19 the grade rule (some both). The City concept would fail the grade rule (average grade 40.2% (over 30%: a road at 15% would need 467 m, at least twice the line)) and is kept as the benchmark.

14 of the 41 dead-end areas have no surviving candidate of their own: AC-158 (Panoramic Wy, Panoramic Pl; 614 residents, 4 pruned; CITY-1 leaves 113 behind a choke); AC-504 (Contra Costa Rd, Contra Costa Pl; 227 residents, 4 pruned); AC-500 (Evergreen Ln, Slater Ln; 153 residents, 4 pruned); AC-511 (West View Dr, Willard Pl; 50 residents, 4 pruned); AC-536 (Bay Forest Dr, Bay Forest Pl; 40 residents, 3 pruned); AC-173 (Summit Rd, Ajax Pl; 39 residents, 3 pruned); AC-003 (La Vereda Rd; 38 residents, 3 pruned); AC-460 (Virgo Rd; 38 residents, 3 pruned); AC-227 (Crystal Wy; 36 residents, 3 pruned); AC-422 (York Av; 36 residents, none within 250 m that saves driving); AC-059 (Hillside Ct; 35 residents, 1 pruned); AC-129 (Brookside Av; 25 residents, 3 pruned); AC-157 (Panoramic Wy; 24 residents, 2 pruned); AC-162 (Panoramic Wy; 11 residents, 3 pruned).

8 areas among the top ranks are behind a one-way choke only and were left out, because two-way operation of the entrance in an emergency opens them: AC-012 (Dwight Wy, 252); AC-171 (Piedmont Av, 240); AC-038 (Piedmont Av Tc, 196); AC-413 (Edgecroft Rd, 95); AC-202 (Piedmont Av, 78); AC-542 (Broadway, 73); AC-426 (Arlington Av, 39); AC-045 (Tunnel Rd, 37).

| Candidate | Area | Type | Link | Length, m | Average grade | Buildings in corridor | Pruned because |
|---|---|---|---|---|---|---|---|
| AC-155-N1 | AC-155 Panoramic Wy, Mosswood Rd … | new road | Panoramic Wy → Warring St | 118 | 15.5% | 4 | 4 buildings in the 12.2 m corridor |
| AC-155-N2 | AC-155 Panoramic Wy, Mosswood Rd … | new road | Panoramic Wy → Sports Ln | 195 | 10.3% | 4 | 4 buildings in the 12.2 m corridor |
| AC-158-N1 | AC-158 Panoramic Wy, Panoramic Pl … | new road | Panoramic Wy → Smyth Ln | 197 | 24.6% | 6 | 6 buildings in the 12.2 m corridor |
| AC-158-N2 | AC-158 Panoramic Wy, Panoramic Pl … | new road | Dwight Pl → Sports Ln | 248 | 38.7% | 1 | average grade 38.7% (over 30%: a road at 15% would need 639 m, at least twice the line) |
| AC-158-N3 | AC-158 Panoramic Wy, Panoramic Pl … | new road | Arden Rd → Mosswood Rd | 69 | 11.4% | 3 | 3 buildings in the 12.2 m corridor |
| AC-158-P1 | AC-158 Panoramic Wy, Panoramic Pl … | path upgrade | Arden Rd → Mosswood Rd | 35 | 56.3% | 1 | average grade 56.3% (over 30%: a road at 15% would need 131 m, at least twice the line) |
| AC-540-N2 | AC-540 Caldecott Ln | new road | Caldecott Ln → Charing Cross Rd | 240 | 17.5% | 5 | 5 buildings in the 12.2 m corridor |
| AC-540-N3 | AC-540 Caldecott Ln | new road | Caldecott Ln → Bristol Dr | 234 | 24% | 5 | 5 buildings in the 12.2 m corridor |
| AC-504-N1 | AC-504 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Sheridan Rd | 96 | 20.2% | 4 | 4 buildings in the 12.2 m corridor |
| AC-504-N2 | AC-504 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Broadway Te | 188 | 10.7% | 4 | 4 buildings in the 12.2 m corridor |
| AC-504-N3 | AC-504 Contra Costa Rd, Contra Costa Pl | new road | Contra Costa Rd → Alta Rd | 203 | 5.1% | 8 | 8 buildings in the 12.2 m corridor |
| AC-500-N1 | AC-500 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Alvarado Rd | 223 | 7.1% | 9 | 9 buildings in the 12.2 m corridor |
| AC-500-N2 | AC-500 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Claremont Av | 207 | 15.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-500-N3 | AC-500 Evergreen Ln, Slater Ln | new road | Evergreen Ln → Gravatt Dr | 112 | 32% | 4 | average grade 32% (over 30%: a road at 15% would need 238 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-211-N3 | AC-211 High Ct, Laurel St … | new road | High Ct → Keith Av | 214 | 9.6% | 7 | 7 buildings in the 12.2 m corridor |
| AC-036-P1 | AC-036 Oak Ridge Rd | path upgrade | Oak Ridge Rd → El Camino Real | 46 | 32.2% | 4 | average grade 32.2% (over 30%: a road at 15% would need 99 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-498-N1 | AC-498 Stonewall Rd | new road | Stonewall Rd → Belrose Av | 188 | 9.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-498-N2 | AC-498 Stonewall Rd | new road | Stonewall Rd → Derby St | 232 | 8.3% | 6 | 6 buildings in the 12.2 m corridor |
| AC-541-N3 | AC-541 Caldecott Ln | new road | Caldecott Ln → Buckingham Bl | 194 | 35.1% | 4 | average grade 35.1% (over 30%: a road at 15% would need 455 m, at least twice the line); 4 buildings in the 12.2 m corridor |
| AC-156-N2 | AC-156 Mosswood Rd | new road | Mosswood Rd → Panoramic Wy | 53 | 43.6% | 1 | average grade 43.6% (over 30%: a road at 15% would need 154 m, at least twice the line) |
| AC-421-N1 | AC-421 Kingston Rd | new road | Kingston Rd → Camelot Ct | 177 | 9.2% | 9 | 9 buildings in the 12.2 m corridor |
| AC-134-N3 | AC-134 Smyth Ln | new road | Smyth Ln → Panoramic Pl | 245 | 19.5% | 7 | 7 buildings in the 12.2 m corridor |
| AC-225-N1 | AC-225 San Mateo Rd | new road | San Mateo Rd → Arlington Av | 98 | 12% | 3 | 3 buildings in the 12.2 m corridor |
| AC-225-N2 | AC-225 San Mateo Rd | new road | San Mateo Rd → Mendocino Av | 98 | 12.2% | 3 | 3 buildings in the 12.2 m corridor |
| AC-225-P1 | AC-225 San Mateo Rd | path upgrade | San Mateo Rd → Arlington Av | 98 | 12% | 3 | 3 buildings in the 12.2 m corridor |
| AC-511-N1 | AC-511 West View Dr, Willard Pl | new road | Willard Pl → Vicente Rd | 199 | 13.8% | 5 | 5 buildings in the 12.2 m corridor |
| AC-511-N2 | AC-511 West View Dr, Willard Pl | new road | Willard Pl → Alvarado Rd | 236 | 14.5% | 4 | 4 buildings in the 12.2 m corridor |
| AC-511-N3 | AC-511 West View Dr, Willard Pl | new road | Willard Pl → North Hill Ct | 118 | 15.8% | 3 | 3 buildings in the 12.2 m corridor |
| AC-161-N1 | AC-161 Panoramic Pl | new road | Panoramic Pl → Arden Rd | 195 | 17.8% | 3 | 3 buildings in the 12.2 m corridor |
| AC-552-N3 | AC-552 Drury Ct, Drury Rd | new road | Drury Ct → Drury Rd | 199 | 2.1% | 4 | 4 buildings in the 12.2 m corridor |
| AC-520-N2 | AC-520 Spyglass Hill | new road | Spyglass Hill → Windward Hill | 189 | 10.5% | 5 | 5 buildings in the 12.2 m corridor |
| AC-536-N1 | AC-536 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Grizzly Peak Bl | 242 | 33.5% | 0 | average grade 33.5% (over 30%: a road at 15% would need 539 m, at least twice the line) |
| AC-536-N2 | AC-536 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Woodside Wy | 247 | 33.2% | 1 | average grade 33.2% (over 30%: a road at 15% would need 547 m, at least twice the line) |
| AC-536-N3 | AC-536 Bay Forest Dr, Bay Forest Pl … | new road | Bay Forest Dr → Grizzly Terrace Dr | 239 | 35.8% | 0 | average grade 35.8% (over 30%: a road at 15% would need 571 m, at least twice the line) |
| AC-133-N2 | AC-133 Maybeck Twin Dr | new road | Maybeck Twin Dr → Rose St | 161 | 27.9% | 7 | 7 buildings in the 12.2 m corridor |
| AC-133-N3 | AC-133 Maybeck Twin Dr | new road | Maybeck Twin Dr → Shasta Rd | 222 | 24.3% | 9 | 9 buildings in the 12.2 m corridor |
| AC-549-N2 | AC-549 Besito Av | new road | Besito Av → Grand View Dr | 187 | 33.4% | 2 | average grade 33.4% (over 30%: a road at 15% would need 415 m, at least twice the line) |
| AC-549-N3 | AC-549 Besito Av | new road | Besito Av → Drury Ct | 243 | 10% | 5 | 5 buildings in the 12.2 m corridor |
| AC-173-N1 | AC-173 Summit Rd, Ajax Pl | new road | Ajax Pl → Grizzly Peak Bl | 211 | 16.6% | 5 | 5 buildings in the 12.2 m corridor |
| AC-173-N2 | AC-173 Summit Rd, Ajax Pl | new road | Summit Rd → Shasta Rd | 224 | 32.9% | 9 | average grade 32.9% (over 30%: a road at 15% would need 491 m, at least twice the line); 9 buildings in the 12.2 m corridor |
| AC-173-N3 | AC-173 Summit Rd, Ajax Pl | new road | Ajax Pl → Hill Rd | 117 | 7.2% | 4 | 4 buildings in the 12.2 m corridor |
| AC-193-N2 | AC-193 Buena Vista Wy | new road | Buena Vista Wy → Parnassus Rd | 154 | 23% | 3 | 3 buildings in the 12.2 m corridor |
| AC-193-N3 | AC-193 Buena Vista Wy | new road | Buena Vista Wy → E Parnassus Ct | 193 | 22.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-002-N2 | AC-002 Hilgard Av | new road | Hilgard Av → Virginia St | 175 | 25.1% | 10 | 10 buildings in the 12.2 m corridor |
| AC-002-N3 | AC-002 Hilgard Av | new road | Hilgard Av → Le Conte Av | 193 | 15.5% | 3 | 3 buildings in the 12.2 m corridor |
| AC-003-N1 | AC-003 La Vereda Rd | new road | La Vereda Rd → La Loma Av | 181 | 23.4% | 5 | 5 buildings in the 12.2 m corridor |
| AC-003-N2 | AC-003 La Vereda Rd | new road | La Vereda Rd → Virginia St | 148 | 31.2% | 1 | average grade 31.2% (over 30%: a road at 15% would need 308 m, at least twice the line) |
| AC-003-N3 | AC-003 La Vereda Rd | new road | La Vereda Rd → Highland Pl | 210 | 23.4% | 3 | 3 buildings in the 12.2 m corridor |
| AC-460-N1 | AC-460 Virgo Rd | new road | Virgo Rd → Broadway Te | 230 | 16.2% | 8 | 8 buildings in the 12.2 m corridor |
| AC-460-N2 | AC-460 Virgo Rd | new road | Virgo Rd → Pinehaven Rd | 206 | 21.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-460-N3 | AC-460 Virgo Rd | new road | Virgo Rd → Taurus Av | 110 | 30.5% | 3 | average grade 30.5% (over 30%: a road at 15% would need 223 m, at least twice the line); 3 buildings in the 12.2 m corridor |
| AC-231-N1 | AC-231 Le Conte Av | new road | Le Conte Av → La Loma Av | 158 | 6.4% | 7 | 7 buildings in the 12.2 m corridor |
| AC-227-N1 | AC-227 Crystal Wy | new road | Crystal Wy → Euclid Av | 80 | 12% | 4 | 4 buildings in the 12.2 m corridor |
| AC-227-N2 | AC-227 Crystal Wy | new road | Crystal Wy → Tamalpais Rd | 206 | 9.5% | 3 | 3 buildings in the 12.2 m corridor |
| AC-227-N3 | AC-227 Crystal Wy | new road | Crystal Wy → Keith Av | 167 | 21.9% | 11 | 11 buildings in the 12.2 m corridor |
| AC-164-N1 | AC-164 Panoramic Wy, Panoramic Pl | new road | Panoramic Pl → Panoramic Wy | 182 | 25.7% | 4 | 4 buildings in the 12.2 m corridor |
| AC-164-N3 | AC-164 Panoramic Wy, Panoramic Pl | new road | Panoramic Pl → Dwight Wy | 248 | 22.6% | 4 | 4 buildings in the 12.2 m corridor |
| AC-059-N1 | AC-059 Hillside Ct | new road | Hillside Ct → Panoramic Wy | 58 | 39.3% | 2 | average grade 39.3% (over 30%: a road at 15% would need 153 m, at least twice the line) |
| AC-208-N2 | AC-208 Virginia St | new road | Virginia St → La Vereda Rd | 26 | 43.5% | 0 | average grade 43.5% (over 30%: a road at 15% would need 76 m, at least twice the line) |
| AC-208-N3 | AC-208 Virginia St | new road | Virginia St → Cedar St | 192 | 10.1% | 7 | 7 buildings in the 12.2 m corridor |
| AC-129-N1 | AC-129 Brookside Av | new road | Brookside Av → Ross Cir | 111 | 8.6% | 3 | 3 buildings in the 12.2 m corridor |
| AC-129-N2 | AC-129 Brookside Av | new road | Brookside Av → Hillcrest Rd | 79 | 19% | 3 | 3 buildings in the 12.2 m corridor |
| AC-129-N3 | AC-129 Brookside Av | new road | Brookside Av → Florio St | 161 | 1.9% | 6 | 6 buildings in the 12.2 m corridor |
| AC-157-N2 | AC-157 Panoramic Wy | new road | Panoramic Wy → Smyth Ln | 134 | 21.1% | 5 | 5 buildings in the 12.2 m corridor |
| AC-157-N3 | AC-157 Panoramic Wy | new road | Panoramic Wy → Dwight Wy | 203 | 15.3% | 4 | 4 buildings in the 12.2 m corridor |
| AC-141-N2 | AC-141 Hill Rd | new road | Hill Rd → Shasta Rd | 173 | 35.4% | 6 | average grade 35.4% (over 30%: a road at 15% would need 407 m, at least twice the line); 6 buildings in the 12.2 m corridor |
| AC-141-N3 | AC-141 Hill Rd | new road | Hill Rd → Queens Rd | 228 | 29% | 6 | 6 buildings in the 12.2 m corridor |
| AC-141-P1 | AC-141 Hill Rd | path upgrade | Hill Rd → Grizzly Peak Bl | 89 | 38% | 2 | average grade 38% (over 30%: a road at 15% would need 225 m, at least twice the line) |
| AC-162-N1 | AC-162 Panoramic Wy | new road | Panoramic Wy → Arden Rd | 175 | 15.2% | 6 | 6 buildings in the 12.2 m corridor |
| AC-162-N2 | AC-162 Panoramic Wy | new road | Panoramic Wy → Dwight Wy | 120 | 23.7% | 4 | 4 buildings in the 12.2 m corridor |
| AC-162-N3 | AC-162 Panoramic Wy | new road | Panoramic Wy → Mosswood Rd | 167 | 20.6% | 5 | 5 buildings in the 12.2 m corridor |
| AC-160-O2 | AC-160 Panoramic Wy, Panoramic Pl … | path upgrade | Panoramic Wy → Mosswood Rd | 92 | 37.9% | 3 | average grade 37.9% (over 30%: a road at 15% would need 233 m, at least twice the line); 3 buildings in the 12.2 m corridor |
| AC-504-O1 | AC-504 Contra Costa Rd, Contra Costa Pl | path upgrade | Contra Costa Rd → Proctor Av | 109 | 20.9% | 5 | 5 buildings in the 12.2 m corridor |
| AC-500-O1 | AC-500 Evergreen Ln, Slater Ln | path upgrade | Evergreen Ln → Alvarado Pl | 134 | 15% | 3 | 3 buildings in the 12.2 m corridor |
| AC-036-O2 | AC-036 Oak Ridge Rd | path upgrade | Oak Ridge Rd → Domingo Av | 128 | 18.5% | 8 | 8 buildings in the 12.2 m corridor |
| AC-498-O1 | AC-498 Stonewall Rd | path upgrade | Stonewall Rd → Tanglewood Rd | 130 | 17.1% | 4 | 4 buildings in the 12.2 m corridor |
| AC-498-O2 | AC-498 Stonewall Rd | path upgrade | Stonewall Rd → Belrose Av | 176 | 14.5% | 4 | 4 buildings in the 12.2 m corridor |
| AC-511-O1 | AC-511 West View Dr, Willard Pl | path upgrade | West View Dr → North Hill Ct | 78 | 31.9% | 0 | average grade 31.9% (over 30%: a road at 15% would need 166 m, at least twice the line) |

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Areas (derived).** From `data/model/access-constraints.json`: areas with at least one hill resident, the top 40 by residents and the top 40 by constraint score (48 after removing duplicates). One-way areas are left out; 40 dead-end areas remain, plus AC-118 (Dwight Wy), where the City concept starts. None of them carries an allocation warning (Albany Hill, AC-315, is not a hill area by the fire-zone rule).
- **New road (model rule).** A straight segment from a node inside the area to a drivable node outside it, up to 250 m, where driving between the two points now takes at least 300 m and 3 times the line (the access tool's "nearest other street" rule). For each target street the shortest link after a penalty for average grade above 10% is kept, preferring targets behind no choke, 3 streets per area. Links join existing network nodes (junctions and street ends), so a street with no node near the area is reached at its nearest junction.
- **Path upgrade (model rule).** An existing path, stairway or County no-vehicle segment in the network, or a chain of OpenStreetMap footways, paths, steps or tracks (up to 400 m, ends within 25 m of network nodes), widened to a road. **Open barrier**: a diverter, bollard or gate closed to residents' cars, opened.
- **City concept (sourced geometry).** City of Berkeley "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1, layer 0, "Imagined Road: Connects Dwight Way in Berkeley and Dwight Place in Oakland", "For Evacuation Time Study", edited 2025-06-27), retrieved 2026-11-01. Its ends were snapped to the nearest network nodes (11.7 m and 0.2 m away).
- **Grade (derived).** Ground elevation every 4 m along the line from the 4 m lidar DEM, as the network builder samples streets: average = end-to-end climb / length; for 25 m windows along the line, the 90th percentile (the builder's gradeMax for streets) and the worst. Flags use the larger of the average and the 90th percentile, because the worst window over open ground is often a terrace, wall or cut. Flags at 15% (a common local fire-access limit; Sonoma County fire-access bulletin: 15% maximum grade by default, steeper sections up to 20% only with Fire Chief approval (an example of a local standard)) and 20% (State Minimum Fire Safe Regulations, 14 CCR §1273.03: road and driveway grades shall not exceed 16% at any point; up to 20% only with local approval and mitigation). "Length at 15%" is the length a road would need to hold 15% over the same climb.
- **On a path (derived).** Share of the line within 6 m of an OpenStreetMap footway, path, steps or track, or a network path segment.
- **Buildings (derived).** OpenStreetMap building footprints touching a 12.2 m corridor centered on the line (corridor width: assumption, a 40 ft right of way).
- **Parcels (derived).** Alameda County parcel polygons, geometry only, fetched per candidate and discarded: parcels the centerline crosses for 2 m or more, parcels touching the corridor, and the share of the centerline outside every parcel (public right of way or unparceled land). Contra Costa County candidates (Kensington) have no parcel count.
- **Land (derived).** Share of the line inside OpenStreetMap park, nature-reserve or protected-area polygons, UC Berkeley, LBNL or East Bay Regional Park District land, from name, operator and owner tags.
- **Fire zone (sourced).** City Fire Zones at the midpoint; outside Berkeley the simulator's proxy (90 m elevation or higher counts as hill).
- **Access effect (derived).** `tools/access-constraints.mjs --links` reruns the choke-point analysis with the link added as a two-way local street with no residents. Freed residents = residents behind any choke before minus after, for the whole model area.
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
- The evacuation runs use the network as it stands, with the short Bancroft Wy link from the foot of Panoramic Way to Prospect St open to cars (SOURCE_NOTES AC13), so Panoramic Hill's one entrance is the foot of Panoramic Way.

## Sources

- Sonoma County fire-access bulletin: 15% maximum grade by default, steeper sections up to 20% only with Fire Chief approval (an example of a local standard). https://permitsonoma.org/divisions/firepreventionandhazmat/bulletinmaximumgrades. Retrieved 2026-11-01.
- State Minimum Fire Safe Regulations, 14 CCR §1273.03: road and driveway grades shall not exceed 16% at any point; up to 20% only with local approval and mitigation. https://regulations.justia.com/states/california/title-14/division-1-5/chapter-7/subchapter-2/article-2/section-1273-03. Retrieved 2026-11-01.
- Florida DOT Cost Per Mile Models, U01 "New Construction 2 Lane Undivided Urban Arterial with 4' Bike Lanes": $9,116,872.25 per mile (flat terrain, no right of way). http://web.archive.org/web/20251006210442/https://www.fdot.gov/fpo/fpc/reports/costpermile. Retrieved 2026-11-01 (Wayback copy of 2025-10-06; the live page returned 404).
- Civil Design Studio for the Cambria CSD, "Cambria Emergency Evacuation Route: Preliminary Cost Estimate", 2024-02-12: about $2.55M with 10% contingency for 12,000 ft of 16 ft gravel emergency road on an existing graded alignment. https://cambriacsd.specialdistrict.org/files/a810aeceb/6C+-+Att+01.pdf. Retrieved 2026-11-01.
- American Community Survey 2020–2024 5-year, table B25077 median value of owner-occupied homes, by block group (via the Census Reporter API; the Census Bureau API now requires a key); block group from TIGERweb. https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25077. Retrieved 2026-11-01.
- Alameda County Parcel Boundaries (Parcels FeatureServer layer 0), geometry only; counted per candidate and never saved. https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0. Retrieved 2026-11-01.
- OpenStreetMap buildings, footways, paths, steps, tracks, parks and institutional land (Overpass API; © OpenStreetMap contributors, ODbL). https://www.openstreetmap.org/copyright. Retrieved https://overpass-api.de/api/interpreter 2026-11-01T19:51:48.962Z (OSM data as of 2026-11-01T19:49:04Z).
- City of Berkeley "2nd Route Out" (Imagined_Road_Panoramic_Hill_Berkeley_WFL1, layer 0, "Imagined Road: Connects Dwight Way in Berkeley and Dwight Place in Oakland", "For Evacuation Time Study", edited 2025-06-27). https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Imagined_Road_Panoramic_Hill_Berkeley_WFL1/FeatureServer/0. Retrieved 2026-11-01.
- 2025 Evacuation Time Study (KLD Engineering, 2025-06-23), §10.4 and Tables 10-9 and 10-10 (pp. 10-4, 10-16): second egress from Panoramic Hill. SOURCE_NOTES E25.
