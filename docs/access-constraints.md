# Access-constrained areas: where one street segment is the only way out

Built 2026-11-01 by `tools/access-constraints.mjs` from `data/model/network.json`. Machine-readable results: `data/model/access-constraints.json`. This is an educational comparison tool, not a prediction and not an official evacuation plan. Residents are synthetic (zone populations spread over street length), and every area is described at street-segment level; no parcels or addresses are used.

## Findings

- **5,734 of the model area's 41,395 hill residents (14%) live behind at least one choke point**: a single street segment whose loss leaves them with no drivable route out of the model area. For Berkeley and LBNL zones alone the figure is 3,133 of 27,759 (11%). "Hill" means a street in City Fire Zone 2 or 3, or outside Berkeley at 90 m elevation or higher (the simulator's proxy).
- 4,463 of those hill residents are behind a true dead end (the choke is the only street connection at all); 1,271 are behind a choke created only by one-way rules, which drivers or police could override in an emergency.
- 683 hill residents are behind two or more choke points in series (a dead end inside a dead end). 1,168 are behind a choke too narrow for a fire engine with status-quo parking in its nominal state (both sides parked where they fit, perfect parking; under 10 ft of clear width): every route from their street to every exit crosses the narrow segment.
- **Panoramic Hill is the largest hill area**: 941 synthetic residents, 397 households and 444 vehicles on 4.7 km of street behind one choke, with up to 4 choke points in series on upper Panoramic Way. The model's choke there is wrong in location (see Data problems): the County file marks the short drivable link from Panoramic Way to Prospect St as no-vehicle, so the model's only exit is around Memorial Stadium on Rim Rd and Stadium Rim Rd.
- Of the 132 named-street primary rows in the SB 99 report's Table 1 (KLD, 2024; dead-end streets), 113 name a street that lies inside an area found here, in the same or a neighboring zone (1,262 of the 1,446 parcels in all rows). Most of the 19 misses are flatland blocks that SB 99 counts as dead ends because of diverters, and three are streets the network does not have.

## Method

Each item carries its provenance category: sourced, derived, assumption, model rule or synthetic.

- **Network (derived).** The residents' drivable network exactly as `js/sim.js` builds it: vehicle segments that are not disconnected and not closed by a diverter, bollard or gate, one directed link per direction with lanes, so a one-way street can be driven one way only. Paths, stairways and County no-vehicle (TRVLWAY NT) streets are left out.
- **Out of the model area (model rule).** A home has a way out if it can drive to one of the 167 exit nodes, where streets are cut at the edge of the elevation grid. The simulator uses the same exits for shadow evacuees.
- **Choke point (derived).** A directed street link that lies on every route from some node to every exit (an edge dominator of the reversed network). If the street is also a bridge of the undirected network, the area behind it is a **dead end**; if only one-way rules make it a choke, the area is **one-way**.
- **Area and nesting (model rule).** Choke links along one dead-end stem belong to one area, named by its entrance (the first choke from the exit, together with links in series with it through nodes that join only two streets). A choke whose outer end sits on a loop of streets starts a nested area. Loops under 200 m of street (turnarounds, splits around islands, doubled driveways) do not count. Nesting is the number of areas in series between a home and an exit, its own included.
- **Residents (synthetic).** The simulator's allocation: each Genasys zone's population inside the model area (2020 Census counts where the City layer has no estimate, and for OKL-003 by Eric's choice), spread over the zone's streets in proportion to length, Principal Arterials weighted 0.7, no freeways or ramps. Expected values, not one random draw. Residents on the entrance segment count as behind it.
- **Households and vehicles (assumption).** Households = residents / 2.37; vehicles taken = households × (1 − 7.47% without a vehicle) × 1.21 vehicles per driving household (2025 Evacuation Time Study, Fig. D-11, renormalized as in `data/assumptions.json`).
- **Clear width and engine access (derived, from sourced widths and assumed parking).** Narrowest entrance segment under status-quo parking in its nominal state (`js/parking.js`, no seed: both sides parked where a car still fits, perfect parking). An engine fits at 10 ft (3.05 m) or more; 20 ft is the fire-code width. Tiers follow the SB 99 report (p. 4): severely constrained 6 ft or less, moderately 7–8 ft, constrained 9–10 ft. A resident counts as behind a narrow choke only if every route from their street to every exit crosses it; residents on a stem between the entrance and a narrower segment farther in are not behind the narrower one. Seeded runs of the simulator park fewer cars on some blocks and add bad parking jobs, so this is one representative state.
- **Steepest grade (derived).** Largest 25 m-window grade from the 4 m lidar DEM on any street in the area, leaving out segments flagged unreliable.
- **Nearest other street (derived; the threshold is a model rule).** The shortest straight line from the area's streets (sampled every 10 m) to a drivable street outside the area, among pairs where driving from the area point to the outside point now, obeying one-way directions, takes at least 300 m and three times the line, so a link beside the entrance does not count. Climb comes from the DEM. A first hint for step 2 of the egress work, not a route, design or cost. "Nearest free street" is the same, to a street behind no choke.
- **Existing path (derived).** The shortest chain of mapped paths, stairways, no-vehicle streets or barrier-closed segments from the area to a drivable street outside it (search limit 1.5 km). Barrier-closed links that OSM tags `emergency=yes` let engines pass.
- **Constraint score (model rule).** residents × nesting × narrowness factor × hill factor. Narrowness factor 4, 3, 2, 1 for the SB 99 tiers severely, moderately, constrained, not narrow (1 where the width is unknown). Hill factor 1 + share of residents on Fire Zone 2–3 streets. The weights are a transparent way to sort, with no calibration behind them; the components are shown so a reader can re-sort.

## Totals

| Measure | Value |
|---|---|
| Residents in the model area (synthetic) | 196,637 |
| Residents behind at least one choke point | 20,839 (11%) |
| Hill residents | 41,395 |
| Hill residents behind at least one choke point | 5,734 (14%) |
| … behind a dead end | 4,463 |
| … behind a one-way choke only | 1,271 |
| … behind two or more choke points in series | 683 |
| … behind a choke too narrow for an engine (nominal parking) | 1,168 |
| Berkeley and LBNL hill residents | 27,759 |
| … behind at least one choke point | 3,133 (11%) |
| … behind a dead end | 2,367 |
| Areas (all; with at least 1 resident; mostly hill) | 575; 493; 185 |
| Dead-end areas; one-way areas | 368; 207 |
| Areas by nesting | 1: 556; 2: 11; 3: 4; 4: 4 |
| Residents with no drivable route out at all | 5.8 (Martin Luther King Jr Wy) |

## Top 25 areas by residents

Nesting 2 or more means the area lies inside a larger one, so rows overlap. Clear width is at the entrance, in feet. Fire zone shows the share of residents by City fire zone (FZ2 outside Berkeley is the 90 m elevation proxy; "no zone" is outside Berkeley below 90 m). For one-way areas a new street is not the remedy, so no nearest street is shown.

| # | Area | Type | Entrance (choke) | Streets behind it | Residents | Households | Vehicles | Nesting | Clear width, ft | Engine fits | Fire zone | Nearest other street | Existing path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AC-316 ⚠ | dead end | Hillside Av | Taft St, Hillside Av | 2,597 | 1,096 | 1,225 | 1 | 20 | yes | no zone 100% | Hillside Av: 67 m line, -27 m climb (40.3%), 313 m by road now | — |
| 2 | AC-074 | one-way | Bancroft Wy | Bancroft Wy, Ellsworth St | 1,013 | 428 | 478 | 1 | 32 | yes | FZ1 100% | n/a: two-way operation of the entrance would open it | — |
| 3 | AC-128 | dead end | Stadium Rim Rd | Panoramic Wy, Mosswood Rd, Orchard Ln, Stadium Rim Rd +7 | 941 | 397 | 444 | 1 | — | width unknown | FZ3 92%, FZ2 8% | Prospect St: 39 m line, -3 m climb (8.5%), 1,084 m by road now | Bancroft Steps Wy (stairs), 45 m to Prospect St, max grade 10.1% |
| 4 | AC-312 | dead end | Buchanan St | Buchanan St | 599 | 253 | 282 | 1 | 20 | yes | no zone 100% | Buchanan St: 8 m line, +0 m climb (1.2%), 303 m by road now | — |
| 5 | AC-131 | dead end | Panoramic Wy | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd +2 | 538 | 227 | 254 | 2 | 15 | yes | FZ3 91%, FZ2 9% | Mosswood Rd: 35 m line, -21 m climb (59.6%), 337 m by road now | Arden Steps (stairs), 35 m to Mosswood Rd, max grade 70.8% |
| 6 | AC-203 | dead end | Woolsey St | Woolsey St | 519 | 219 | 245 | 1 | 20 | yes | FZ1 100% | Woolsey St: 3 m line, 0 m climb (0%), 567 m by road now | Woolsey St (diverter), 3 m to Woolsey St, max grade 2.5% |
| 7 | AC-172 | one-way | Dwight Wy | Dana St, Dwight Wy | 457 | 193 | 215 | 1 | 24 | yes | FZ1 100% | n/a: two-way operation of the entrance would open it | — |
| 8 | AC-133 | dead end | Panoramic Wy | Panoramic Wy, Panoramic Pl, Dwight Wy, Dwight Pl | 358 | 151 | 169 | 3 | 15 | yes | FZ3 87%, FZ2 13% | Arden Rd: 48 m line, -15 m climb (30.9%), 576 m by road now | Arden Pa (path), 60 m to Arden Rd, max grade 27.7% |
| 9 | AC-541 | dead end | Caldecott Ln | Caldecott Ln | 276 | 117 | 130 | 1 | 16 | yes | FZ2 100% | Tunnel Rd: 46 m line, +23 m climb (50.7%), 2,289 m by road now | — |
| 10 | AC-012 | one-way | Dwight Wy | Dwight Wy | 252 | 107 | 119 | 1 | 20 | yes | FZ2 100% | n/a: two-way operation of the entrance would open it | Etna St (diverter), 3 m to Etna St, max grade 3.9% |
| 11 | AC-152 | one-way | Blake St | Blake St, Fulton St | 249 | 105 | 117 | 1 | 26 | yes | FZ1 100% | n/a: two-way operation of the entrance would open it | Blake St (diverter), 3 m to Blake St, max grade 2.3% |
| 12 | AC-174 | one-way | Piedmont Av | Durant Av, Piedmont Av | 240 | 101 | 113 | 1 | 30 | yes | FZ2 100% | n/a: two-way operation of the entrance would open it | — |
| 13 | AC-505 | dead end | Contra Costa Rd | Contra Costa Rd, Contra Costa Pl | 227 | 96 | 107 | 1 | 16 | yes | FZ2 100% | Buena Vista Av: 51 m line, -12 m climb (24.3%), 666 m by road now | — |
| 14 | AC-038 | one-way | Piedmont Av Tc | Piedmont Av Tc, Piedmont Av | 196 | 83 | 93 | 1 | — | width unknown | FZ2 100% | n/a: two-way operation of the entrance would open it | — |
| 15 | AC-048 | dead end | Etna St | Etna St | 167 | 71 | 79 | 1 | 20 | yes | FZ1 100% | Dwight Wy: 3 m line, 0 m climb (0%), 605 m by road now | Etna St (diverter), 3 m to Dwight Wy, max grade 3.9% |
| 16 | AC-501 | dead end | Slater Ln | Evergreen Ln, Slater Ln | 153 | 65 | 72 | 1 | 16 | yes | FZ2 100% | Alvarado Rd: 68 m line, +25 m climb (36.9%), 404 m by road now | — |
| 17 | AC-287 | one-way | Central Av | Isabel St, Central Av | 149 | 63 | 70 | 1 | 11 | yes | no zone 100% | n/a: two-way operation of the entrance would open it | — |
| 18 | AC-215 | dead end | Martin Luther King Jr Wy / 63rd St | 63rd St, Martin Luther King Jr Wy | 146 | 62 | 69 | 1 | 16 | yes | FZ1 100% | 63rd St: 58 m line, +1 m climb (2.1%), 532 m by road now | — |
| 19 | AC-190 | dead end | Fairview St | Fairview St, Dover St | 118 | 50 | 55 | 1 | 20 | yes | FZ1 100% | 65th St: 47 m line, -1 m climb (1.9%), 595 m by road now | — |
| 20 | AC-283 | dead end | 59th St | 59th St | 116 | 49 | 55 | 1 | 20 | yes | no zone 100% | 59th St: 8 m line, 0 m climb (1.3%), 854 m by road now | — |
| 21 | AC-072 | dead end | Regent St | Regent St, Webster St | 106 | 45 | 50 | 1 | 20 | yes | FZ1 100% | Bateman St: 3 m line, 0 m climb (0%), 881 m by road now | Bateman St (diverter), 3 m to Bateman St, max grade 1.9% |
| 22 | AC-065 | dead end | Grant St / Berkeley Wy | Berkeley Wy, Grant St | 104 | 44 | 49 | 1 | 20 | yes | FZ1 100% | Grant St: 3 m line, 0 m climb (0%), 602 m by road now | Grant St (diverter), 3 m to Grant St, max grade 0.8% |
| 23 | AC-213 | dead end | Laurel St / Oak St / High Ct | High Ct, Laurel St, Oak St | 104 | 44 | 49 | 1 | 14 | yes | FZ2 100% | Euclid Av: 56 m line, -6 m climb (10.6%), 374 m by road now | Oak St (no-vehicle street), 99 m to Oak St, max grade 21.3% |
| 24 | AC-439 | one-way | Miles Av | Miles Av | 98 | 42 | 46 | 1 | 11 | yes | no zone 100% | n/a: two-way operation of the entrance would open it | — |
| 25 | AC-229 | dead end | Jefferson | Jefferson | 98 | 41 | 46 | 1 | — | width unknown | FZ1 100% | Addison St: 3 m line, +0 m climb (3.3%), 598 m by road now | Addison St (diverter), 3 m to Addison St, max grade 1.9% |

⚠ AC-316: most residents come from ALB-011, whose whole population lands on 221 m of street. See Data problems.

## Top 25 areas by constraint score

Score = residents × nesting × narrowness × hill factor (model rule).

| # | Area | Type | Entrance (choke) | Streets behind it | Residents | Nesting | Clear width, ft (SB 99 tier) | Narrowness | Hill factor | Score | Steepest grade | Nearest other street | Existing path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AC-316 ⚠ | dead end | Hillside Av | Taft St, Hillside Av | 2,597 | 1 | 20 (not narrow) | 1 | 1 | 2,597 | 13.4% | Hillside Av: 67 m line, -27 m climb (40.3%), 313 m by road now | — |
| 2 | AC-131 | dead end | Panoramic Wy | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd +2 | 538 | 2 | 15 (not narrow) | 1 | 2 | 2,152 | 28.2% | Mosswood Rd: 35 m line, -21 m climb (59.6%), 337 m by road now | Arden Steps (stairs), 35 m to Mosswood Rd, max grade 70.8% |
| 3 | AC-133 | dead end | Panoramic Wy | Panoramic Wy, Panoramic Pl, Dwight Wy, Dwight Pl | 358 | 3 | 15 (not narrow) | 1 | 2 | 2,149 | 28.2% | Arden Rd: 48 m line, -15 m climb (30.9%), 576 m by road now | Arden Pa (path), 60 m to Arden Rd, max grade 27.7% |
| 4 | AC-128 | dead end | Stadium Rim Rd | Panoramic Wy, Mosswood Rd, Orchard Ln, Stadium Rim Rd +7 | 941 | 1 | — (unknown) | 1 | 2 | 1,882 | 32.3% | Prospect St: 39 m line, -3 m climb (8.5%), 1,084 m by road now | Bancroft Steps Wy (stairs), 45 m to Prospect St, max grade 10.1% |
| 5 | AC-074 | one-way | Bancroft Wy | Bancroft Wy, Ellsworth St | 1,013 | 1 | 32 (not narrow) | 1 | 1 | 1,013 | 4.4% | n/a: two-way operation of the entrance would open it | — |
| 6 | AC-312 | dead end | Buchanan St | Buchanan St | 599 | 1 | 20 (not narrow) | 1 | 1 | 599 | 2.4% | Buchanan St: 8 m line, +0 m climb (1.2%), 303 m by road now | — |
| 7 | AC-541 | dead end | Caldecott Ln | Caldecott Ln | 276 | 1 | 16 (not narrow) | 1 | 2 | 552 | 17.5% | Tunnel Rd: 46 m line, +23 m climb (50.7%), 2,289 m by road now | — |
| 8 | AC-203 | dead end | Woolsey St | Woolsey St | 519 | 1 | 20 (not narrow) | 1 | 1 | 519 | 2.5% | Woolsey St: 3 m line, 0 m climb (0%), 567 m by road now | Woolsey St (diverter), 3 m to Woolsey St, max grade 2.5% |
| 9 | AC-012 | one-way | Dwight Wy | Dwight Wy | 252 | 1 | 20 (not narrow) | 1 | 2 | 505 | 5.3% | n/a: two-way operation of the entrance would open it | Etna St (diverter), 3 m to Etna St, max grade 3.9% |
| 10 | AC-174 | one-way | Piedmont Av | Durant Av, Piedmont Av | 240 | 1 | 30 (not narrow) | 1 | 2 | 480 | 6.3% | n/a: two-way operation of the entrance would open it | — |
| 11 | AC-172 | one-way | Dwight Wy | Dana St, Dwight Wy | 457 | 1 | 24 (not narrow) | 1 | 1 | 457 | 3.6% | n/a: two-way operation of the entrance would open it | — |
| 12 | AC-505 | dead end | Contra Costa Rd | Contra Costa Rd, Contra Costa Pl | 227 | 1 | 16 (not narrow) | 1 | 2 | 455 | 14.1% | Buena Vista Av: 51 m line, -12 m climb (24.3%), 666 m by road now | — |
| 13 | AC-038 | one-way | Piedmont Av Tc | Piedmont Av Tc, Piedmont Av | 196 | 1 | — (unknown) | 1 | 2 | 393 | 6.3% | n/a: two-way operation of the entrance would open it | — |
| 14 | AC-134 | dead end | Panoramic Pl | Panoramic Pl | 47 | 4 | 15 (not narrow) | 1 | 2 | 372 | 28.2% | Mosswood Rd: 73 m line, -28 m climb (39%), 931 m by road now | — |
| 15 | AC-501 | dead end | Slater Ln | Evergreen Ln, Slater Ln | 153 | 1 | 16 (not narrow) | 1 | 2 | 306 | 13.6% | Alvarado Rd: 68 m line, +25 m climb (36.9%), 404 m by road now | — |
| 16 | AC-036 | dead end | Oak Ridge Rd | Oak Ridge Rd | 72 | 1 | 9 (constrained) | 2 | 2 | 289 | 10.1% | El Camino Real: 44 m line, -15 m climb (34.1%), 617 m by road now | Park Pa (path), 46 m to El Camino Real, max grade 35.6% |
| 17 | AC-542 | dead end | Caldecott Ln | Caldecott Ln | 63 | 2 | 16 (not narrow) | 1 | 2 | 251 | 10% | Tunnel Rd: 51 m line, +19 m climb (36.7%), 2,847 m by road now | — |
| 18 | AC-152 | one-way | Blake St | Blake St, Fulton St | 249 | 1 | 26 (not narrow) | 1 | 1 | 249 | 2.3% | n/a: two-way operation of the entrance would open it | Blake St (diverter), 3 m to Blake St, max grade 2.3% |
| 19 | AC-140 | dead end | Maybeck Twin Dr | Maybeck Twin Dr | 39 | 1 | 8 (moderately constrained) | 3 | 2 | 234 | 19.9% | Buena Vista Wy: 38 m line, +11 m climb (28.1%), 617 m by road now | — |
| 20 | AC-129 | dead end | Mosswood Rd | Mosswood Rd | 58 | 2 | 15 (not narrow) | 1 | 2 | 233 | 19.4% | Arden Rd: 35 m line, +20 m climb (56.3%), 334 m by road now | Arden Steps (stairs), 35 m to Arden Rd, max grade 70.8% |
| 21 | AC-058 | dead end | Hillside Ct | Hillside Ct | 35 | 1 | 8 (moderately constrained) | 3 | 2 | 212 | 16.2% | Panoramic Wy: 51 m line, +21 m climb (40.8%), 1,595 m by road now | — |
| 22 | AC-213 | dead end | Laurel St / Oak St / High Ct | High Ct, Laurel St, Oak St | 104 | 1 | 14 (not narrow) | 1 | 2 | 208 | 15.1% | Euclid Av: 56 m line, -6 m climb (10.6%), 374 m by road now | Oak St (no-vehicle street), 99 m to Oak St, max grade 21.3% |
| 23 | AC-414 | one-way | Edgecroft Rd | Edgecroft Rd | 95 | 1 | 15 (not narrow) | 1 | 2 | 190 | 6.6% | n/a: two-way operation of the entrance would open it | — |
| 24 | AC-048 | dead end | Etna St | Etna St | 167 | 1 | 20 (not narrow) | 1 | 1 | 167 | 3.9% | Dwight Wy: 3 m line, 0 m climb (0%), 605 m by road now | Etna St (diverter), 3 m to Dwight Wy, max grade 3.9% |
| 25 | AC-205 | one-way | Piedmont Av | Bancroft Wy, Piedmont Av | 78 | 1 | 30 (not narrow) | 1 | 2 | 156 | 7.1% | n/a: two-way operation of the entrance would open it | — |

## Sanity checks

### Panoramic Hill (Time Study region R04)

The SB 99 report (p. 4) says the whole Panoramic Way neighborhood has "only one access point to the nearest evacuation route (at a stop-controlled intersection at Panoramic Way and Prospect St/Canyon Rd)". The model finds the neighborhood behind one choke, with nested areas further up:

| Area | Entrance | Residents | Nesting | Clear width, ft | Streets |
|---|---|---|---|---|---|
| AC-128 | Stadium Rim Rd | 941 | 1 | — (narrowest on the stem: 9 on Panoramic Wy, 900 residents behind it) | Panoramic Wy, Mosswood Rd, Orchard Ln, Stadium Rim Rd, Panoramic Pl, Mosswood Ln, Arden Rd, Canyon Rd +3 |
| AC-130 | Panoramic Wy | 24 | 2 | 15 | Panoramic Wy |
| AC-131 | Panoramic Wy | 538 | 2 | 15 | Panoramic Wy, Panoramic Pl, Orchard Ln, Arden Rd, Dwight Wy, Dwight Pl |
| AC-133 | Panoramic Wy | 358 | 3 | 15 | Panoramic Wy, Panoramic Pl, Dwight Wy, Dwight Pl |
| AC-135 | Panoramic Wy | 11 | 4 | 15 | Panoramic Wy |

The location of the first choke disagrees with the SB 99 report. In the model the neighborhood drives out over Rim Rd and Stadium Rim Rd, around the east side of Memorial Stadium, because the County centerline file marks the 45 m piece between the foot of Panoramic Way and Prospect St as "BANCROFT STEPS WY" with TRVLWAY NT (no vehicle travel). OpenStreetMap maps the same piece as drivable Bancroft Way (way 24025453, tertiary) joining Prospect St, Canyon Rd and Panoramic Way, which matches the SB 99 description. With that piece opened to cars (`node tools/access-constraints.mjs --open 2322`):

| Area | Entrance | Residents | Nesting | Clear width, ft | Engine fits |
|---|---|---|---|---|---|
| AC-159 | Panoramic Wy | 900 | 1 | 9 | **no** |
| AC-161 | Panoramic Wy | 24 | 2 | 15 | yes |
| AC-162 | Panoramic Wy | 538 | 2 | 15 | yes |
| AC-164 | Panoramic Wy | 358 | 3 | 15 | yes |

The choke moves to the foot of Panoramic Way, as SB 99 describes, and Canyon Rd and Stadium Rim Rd drop out of the area. Hill residents behind any choke change from 5,734 to 5,696.

Zone BER-013 (83 people in the Genasys layer, "Panoramic Hill") has no street segment whose midpoint falls inside it, so the simulator places none of its people; the SB 99 rows for BER-E013 match the BER-058 areas above. The gate on upper Panoramic Way (OSM node 35719248, engines pass) leads only to a dead end in the model, because the fire road beyond it is not a drivable OSM way, so the model shows no emergency second exit; SB 99 says those upper barriers "will not expedite the evacuation" because they "do not provide additional access points to Prospect St/Canyon Rd".

### Known cul-de-sacs

- Wilson Cir behind Olympus Ave: AC-057, dead end, entrance Olympus Av, 36 residents, clear width 13 ft, engine fits: yes. Matches the SB 99 Table 1 rows for Olympus Ave (BER-E031 and BER-E032).
- Maybeck Twin Dr: AC-140, dead end, entrance Maybeck Twin Dr, 39 residents, nesting 1, clear width 8 ft, engine fits: **no**.
- Oak Ridge Rd: AC-036, dead end, entrance Oak Ridge Rd, 72 residents, nesting 1, clear width 9 ft, engine fits: **no**.
- Hill Rd: AC-005, dead end, entrance Hill Rd, 36 residents, nesting 1, clear width 14 ft, engine fits: yes.
- Woodhaven Rd: AC-096, dead end, entrance Woodhaven Rd, 13 residents, nesting 1, clear width — ft, engine fits: width unknown.
- Stoddard Wy: AC-030, dead end, entrance Stoddard Wy, 14 residents, nesting 1, clear width 12 ft, engine fits: yes.
- Vistamont Av: AC-156, dead end, entrance Vistamont Av, 11 residents, nesting 1, clear width — ft, engine fits: width unknown.

### SB 99 Access Impaired Neighborhoods

SB 99's primary Access Impaired Neighborhoods (AIN) are residential parcels in a hazard area, outside the 5-minute fire-station service area, on dead-end roads, including dead ends made by bollards, gates and traffic-calming islands (KLD TR-1380 Rev. 3, pp. 2–3). Secondary AINs have more than one way out, but all except one run over narrow or winding roads. This analysis is the topological part of the primary test only: no service-area filter, and narrow roads change the score, not the choke.

- Table 1 lists 141 primary AINs with 1,461 parcels (p. 4). The text extraction in `data/raw/docs/sb99.txt` yields 138 rows with 1,446 parcels; 6 are private drives off a named street.
- **113 of 132 named-street rows** (1,262 parcels) have a street of that name inside a choke area in the same zone or within 150 m of it; 111 of those are dead ends.
- Rows not matched (19): Martin Ave (BER-014/BER-016, 4) [street not in the network]; Eunice St (BER-027/BER-028, 1); Ross St (BER-029/BER-030, 3); Grizzly Peak Blvd (BER-030/BER-031, 3); Ross St (BER-033/BER-036, 2); Lincoln St (BER-033/BER-036, 15); West St (BER-036/BER-037, 2); California St (BER-036/BER-037, 5); Delaware St (BER-036/BER-037, 9); Mc Gee Ave (BER-037/BER-038, 5); Leroy Ave (BER-040/BER-046, 4); Noth Valley St (BER-046/BER-047, 14) [street not in the network]; West St (BER-046/BER-047, 4); 8Th St (BER-047/BER-051, 10); Fernwald Rd (BER-053/BER-058, 6); Grant St (BER-062/BER-063, 2); Colby St (BER-066/BER-067, 3); Claremont Blvd (BER-072/BER-073, 10); Mystic Ct (OKL-017/OKL-018, 6) [street not in the network]. Most are in the flats, where SB 99 counts dead-end blocks made by diverters. The simulator models each diverter from OSM geometry, and several of these are open or one-way pieces in the model (README, "Diverters and traffic circles"). The rest are private courts missing from the County file or blocks where the County file has a through street.
- In the other direction, 63 Berkeley hill dead ends with 5 or more residents were found; 10 contain no street named in Table 1: Smyth Ln (54); Bay Tree Ln (43); Summit Rd (34); Somerset Pl (32); Unnamed (13); Rosemont Av (10); Summit Ln (8); Arcade Ln (8); Marin Av (7); Lawrence Rd, Mcmillian Rd (5). Being inside the 5-minute fire-station service area would leave a dead end out of SB 99's primary list, so these are expected differences, not errors on either side.

### City Narrow_Roads layer

The City's narrow-roads survey covers 326 drivable segments (40.1 km). Only 50 of them (4.5 km) lie behind a choke, and 28 of 185 mostly-hill areas have a surveyed narrow road at the entrance. Narrow roads are concentrated in the looped street grid north of Codornices Park, which SB 99 rates as secondary AINs (several routes, all but one narrow or winding). The two analyses agree on that split: dead ends and narrow roads are mostly different places, and Panoramic Hill is where they coincide.

## Data problems found

1. **Panoramic Way to Prospect St.** County edge 2322 ("BANCROFT STEPS WY", TRVLWAY NT) blocks the drivable link that OSM and SB 99 show. The simulator inherits this: Panoramic Hill traffic leaves around the stadium on Rim Rd and Stadium Rim Rd. R04 calibration matches the Time Study anyway, but the route is wrong. Fix in `tools/build-network.mjs` (treat that segment as a two-way Local street, with a SOURCE_NOTES entry), then rebuild and recalibrate.
2. **Albany Hill population.** Zone ALB-011 ("Albany Hill Wildland Park Area") has 2,535 people from 2020 Census block interior points but only one drivable segment whose midpoint lies in it (Taft St, 221 m), so the simulator puts all of them, about 1,070 households, on that segment, behind a dead end (AC-316). The Census blocks most likely hold the apartment towers at the foot of the hill, reached from other streets. Placing zone populations by Census block, or spreading a zone's people onto streets within a buffer of its outline, would fix it.
3. **No route out.** Martin Luther King Jr Wy (edge 2386, 12 m, 5.8 residents) is a one-way County piece at the Oakland line that points into the same node as the one-way OSM carriageway (way 272608978), so nothing can leave it. Vehicles the simulator places there never leave.
4. **One-way chokes in Southside and near the stadium.** The largest one-way areas (Bancroft Wy 1013; Dwight Wy 457; Dwight Wy 252; Blake St 249; Piedmont Av 240) come from County one-way directions combined with diverters. They are real in the sense that the law sends drivers one way, but police or drivers would override them in an emergency, and HANDOFF item 4b already questions some County one-way directions. Treat them as softer than dead ends.
5. **Short loops in OSM streets.** OSM maps turnarounds and driveway loops as streets (Caldecott Ln has several), which would add false nesting; loops under 200 m of street are ignored for nesting.

## Edge effects at the model boundary

Every street cut at the edge of the elevation grid counts as a way out. 75 of the 167 exits are on hill streets, and 4,624 hill residents live within 500 m of driving to one. None of those exits is in a Berkeley or LBNL zone: they are in Oakland (39), Kensington and El Cerrito (17), Orinda (11) and unincorporated Contra Costa County (7), plus the Warren Freeway. Two errors follow, both outside Berkeley. A dead-end street that crosses the edge looks like a through street, so its residents are missing from these totals; the cut streets include courts such as Highgate Ct in Kensington and Morrill Ct, Doncaster Pl and Glenwood Glade in Oakland. A neighborhood whose only real exit lies beyond the edge through another dead end is not flagged. North Kensington and Oakland south of about 37.84° N are outside the grid entirely (HANDOFF item 1a). The Berkeley totals do not depend on these exits; the Oakland, Kensington and Orinda figures within about 500 m of the grid edge are a lower bound.

## How steps 2 and 3 can use this

- `nearestOtherStreet` and `nearestFreeStreet` give a straight line, its length, the climb and how far one drives now from the area point to the outside point, obeying one-way directions. A second connection needs a real alignment over parcels, which is outside this analysis (no parcel data is stored). `existingLink` shows where a path or stairway already makes the connection on foot and could be widened, and `emergencyVehicleLink` where a gate or diverter already does for engines.
- `node tools/access-constraints.mjs --open <edge ids>` re-runs the analysis with segments opened to cars in both directions (a no-vehicle street, a closed barrier, a path, or a one-way street run two-way), which is the quickest way to see how many residents a new connection takes out from behind a choke.
- For managed retreat, each area lists residents, households and vehicles by zone (`evacZones`), the inputs for "reduced future evacuation demand" in the spec.
