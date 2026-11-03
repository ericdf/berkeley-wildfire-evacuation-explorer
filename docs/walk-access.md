# Home-to-street walking and stair access in the hills

Built 2026-11-03 by `node tools/walk-access.mjs` from 13,591 hill building footprints (Microsoft Global ML Building Footprints), the 4 m lidar DEM and OpenStreetMap stairways and paths. Synthetic households, not real ones; per-segment aggregates only, no building is listed. Not a prediction and not an official evacuation plan. Sources and checks: SOURCE_NOTES WA1–WA15.

## Findings

- **Most hill homes sit near the level of their street.** Of 13,591 hill buildings, the median is 3.0 m above or below the nearest point of its street and the 90th percentile 7.6 m. 1,886 (14%) stand more than 5 m above their street and 412 (3%) more than 10 m; 1,470 (11%) are more than 5 m below and 196 (1%) more than 10 m below. 457 buildings (3%) are closer to a public path or stairway than to any street, 170 of them to a stairway.
- **The walk to the curb takes seconds to a few minutes.** One way, door to curb, at the central speeds: median 21 s, 90th percentile 35 s, 99th 74 s. With reduced mobility: 34, 67 and 137 s. The terrain's extra time over level ground for three legs (two trips out with belongings, one back) is a median 18 s and a 90th percentile 44 s (reduced mobility 29 and 115 s). The Time Study's mobilization curves spread departures over 2.5 to 3.5 hours in 15-minute steps (`data/assumptions.json` demand.mobilization15min), so this is small against them.
- **Carless households would walk a median 4 to 13 minutes, and a 90th percentile 12 to 23, to the edge of the order and warning area.** Weighted by expected carless households on hill streets inside each scenario's order and warning area (the simulator's uniform 7.47% share), median and 90th percentile walking times on the pedestrian network with stairways: 1923 fire, present-day repeat 13 and 23 min (reduced mobility 20 and 36); Extreme east wind 7 and 18 min (reduced mobility 10 and 29); Constrained neighborhood: Panoramic Hill 4 and 12 min (reduced mobility 6 and 19); North hills: fire in Tilden above the Summit 8 and 21 min (reduced mobility 13 and 32).
- **Shelters are farther.** To the nearest of the City's 13 shelter sites: median 24 min and 90th percentile 54 min (reduced mobility 37 and 84); about 507 of 1,399 expected carless hill households are more than 30 minutes' walk away, 839 with reduced mobility.
- **Stairways and paths save little in aggregate.** Without them (streets only), the median walk out changes by at most 0.2 min in any scenario and the 90th percentile by at most 2.3 min; the segments where they save most are listed below.

## Where homes sit far above or below their street

Zones with at least 20 hill buildings, by the share more than 10 m above or below the nearest point of their street. Rise = |DEM at footprint centroid − DEM at the street|. Door-to-curb times are one way.

| Zone | Buildings | Synthetic households | Median rise (m) | 90th pct rise (m) | > 5 m above | > 10 m above | > 5 m below | > 10 m below | Path or stair access | One way, central (s, median / p90) | One way, reduced mobility (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CCC-154 | 23 | 34 | 11.5 | 20.3 | 35% | 35% | 43% | 22% | 4 | 82 / 118 | 138 / 194 |
| ORI-007 (Monte Vista) | 33 | 0 | 6.7 | 21.6 | 39% | 27% | 18% | 6% | 0 | 42 / 93 | 70 / 190 |
| OKL-035 (Merriewood - Highway 24, Skyline Blvd., Broadway, Broadway Ter.) | 63 | 354 | 8.3 | 14.0 | 14% | 5% | 62% | 27% | 0 | 32 / 56 | 74 / 122 |
| BER-013 (East of Prospect St. Panoramic Hill. South of Canyon Rd. North & We…) | 61 | 52 | 7.3 | 13.7 | 31% | 16% | 36% | 11% | 1 | 27 / 45 | 60 / 106 |
| OKL-004 (Claremont Hills - Claremont Ave, Tanglewood Rd. Stonewall Rd.) | 79 | 57 | 5.4 | 12.3 | 37% | 23% | 15% | 3% | 6 | 30 / 46 | 54 / 98 |
| OKL-019 (Upper Rockridge - Tunnel Road (Highway 13), Roble Rd, Chabot Rd., H…) | 78 | 75 | 4.1 | 12.0 | 29% | 10% | 14% | 10% | 4 | 26 / 84 | 44 / 129 |
| OKL-010 (Claremont Hills - Tunnel Rd, Vicente Road and Grand View Dr.) | 180 | 167 | 6.6 | 12.1 | 30% | 12% | 37% | 7% | 1 | 27 / 42 | 57 / 92 |
| OKL-006 (Claremont Hills - Alvarado Rd. , Slater Ln.) | 88 | 144 | 6.0 | 12.6 | 32% | 17% | 30% | 2% | 0 | 25 / 38 | 53 / 87 |
| LBL-003 | 32 | 0 | 3.5 | 12.2 | 22% | 13% | 13% | 6% | 0 | 20 / 51 | 37 / 104 |
| OKL-009 (Claremont Hills - Alvarado Rd., Gravett Drive, Amito Ave.) | 163 | 157 | 6.1 | 11.4 | 18% | 10% | 48% | 7% | 2 | 27 / 39 | 58 / 91 |
| OKL-037 (Forestland - Thornhill Dr., Beauforest Dr., Valley View Rd., Pineha…) | 50 | 121 | 5.6 | 11.5 | 34% | 14% | 22% | 2% | 0 | 24 / 37 | 49 / 85 |
| OKL-013 (Claremont Hills - Grizzly Peak Blvd., Highway 24, Tunnel Rd.) | 64 | 100 | 4.7 | 10.9 | 11% | 5% | 34% | 8% | 0 | 27 / 45 | 49 / 95 |
| OKL-038 (Merriewood - Broadway Ter., Pine Needle Dr., Pinehaven Rd.) | 211 | 26 | 4.9 | 10.2 | 14% | 5% | 36% | 6% | 1 | 26 / 39 | 52 / 88 |
| OKL-011 (Claremont Hills - Marlborough Terrace, Strathmoor Drive, Druru Rd, …) | 117 | 108 | 5.5 | 10.1 | 19% | 5% | 39% | 5% | 1 | 26 / 40 | 55 / 83 |
| OKL-047 (Upper Rockridge - Broadway Ter, Moraga Ave, Estates Dr, Florence Av…) | 81 | 40 | 2.7 | 8.7 | 7% | 5% | 16% | 5% | 2 | 23 / 40 | 35 / 77 |
| ORI-008 (Upper El Toyonal) | 86 | 67 | 4.2 | 10.0 | 22% | 8% | 14% | 2% | 0 | 28 / 51 | 50 / 85 |
| BER-032 (West of Olympus and Fairlawn. South & East of La Loma as it curves …) | 287 | 269 | 4.2 | 9.5 | 16% | 6% | 26% | 3% | 1 | 22 / 37 | 41 / 79 |
| BER-018 (East of Euclid Ave. North of Shasta Rd. Addresses along Cragmont Av…) | 230 | 259 | 4.1 | 9.5 | 24% | 6% | 14% | 3% | 17 | 22 / 35 | 39 / 72 |
| OKL-079 (Merriewood - Thornhill Dr, Valley View Rd, Merriewood Dr.) | 141 | 143 | 4.5 | 9.3 | 15% | 3% | 28% | 5% | 5 | 23 / 39 | 42 / 82 |
| OKL-239 (Merriewood - Broadway Ter, Swainland Rd, Aquarius Way) | 161 | 146 | 5.6 | 9.7 | 25% | 6% | 32% | 2% | 0 | 26 / 38 | 51 / 82 |

Street segments with at least 5 buildings and the most buildings more than 10 m above or below the street:

| Street (zone) | Buildings | Synthetic households | 90th pct rise (m) | > 10 m above or below | Path or stair access | Extra time for the three legs, central (s, median / p90) |
|---|---:|---:|---:|---:|---:|---:|
| Gravatt Dr (OKL-009) | 42 | 35.3 | 12.1 | 10 | 0 | 38 / 54 |
| Panoramic Wy (BER-013) | 21 | 15.1 | 13.6 | 9 | 0 | 51 / 68 |
| Stonewall Rd (OKL-004) | 18 | 8.6 | 14.4 | 9 | 0 | 48 / 65 |
| Keith Av (BER-019) | 52 | 54.3 | 14.4 | 9 | 0 | 32 / 65 |
| Valley View Rd (OKL-079) | 29 | 36.4 | 13.0 | 8 | 1 | 40 / 64 |
| Cyclotron Rd (LBL-002) | 9 | 0.0 | 27.2 | 8 | 3 | 103 / 147 |
| Buena Vista Wy (BER-032) | 25 | 16.3 | 11.0 | 8 | 0 | 40 / 58 |
| Grand View Dr (OKL-010) | 34 | 25.0 | 10.9 | 7 | 0 | 39 / 57 |
| Grand View Dr (OKL-010) | 12 | 19.5 | 21.5 | 7 | 0 | 56 / 98 |
| Taurus Av (OKL-239) | 11 | 10.0 | 13.0 | 6 | 0 | 47 / 59 |
| Alvarado Rd (OKL-009) | 7 | 2.1 | 17.9 | 6 | 0 | 70 / 93 |
| Skyline Bl (OKL-035) | 7 | 23.7 | 32.6 | 6 | 0 | 74 / 171 |
| West View Dr (OKL-010) | 20 | 15.5 | 12.5 | 6 | 1 | 40 / 61 |
| Tunnel Rd (OKL-013) | 12 | 35.5 | 12.8 | 6 | 0 | 55 / 79 |
| Sheridan Rd (OKL-047) | 13 | 0.4 | 19.1 | 6 | 0 | 44 / 133 |

## Public stairways in the hills

456 OpenStreetMap stairways (highway=steps, public) lie in the hills. Rise from the DEM between their ends: median 3.1 m, 90th percentile 17.8 m; horizontal length median 13.4 m. Tags: step_count on 40, incline on 223, a handrail tag on 136. Named stairways with the largest rise (all ways of one name summed; walking time one way, central / reduced mobility):

| Stairway | Horizontal length (m) | Rise (m) | Up, central (min) | Up, reduced mobility (min) | Down, central / reduced (min) |
|---|---:|---:|---:|---:|---:|
| Covert Path | 192 | 54.1 | 6.3 | 16.0 | 4.8 / 12.1 |
| Orchard Lane | 181 | 51.8 | 5.9 | 15.0 | 4.5 / 11.4 |
| Eucalyptus Path | 158 | 50.2 | 5.2 | 13.2 | 3.9 / 10.0 |
| Arbon Path | 205 | 47.9 | 6.7 | 17.0 | 5.1 / 13.0 |
| Stevenson Path | 171 | 46.7 | 5.6 | 14.3 | 4.3 / 10.8 |
| Glendale Path | 151 | 40.2 | 4.9 | 12.6 | 3.8 / 9.6 |
| Fred Herbert Path | 186 | 40.2 | 6.1 | 15.5 | 4.6 / 11.8 |
| Beloit Path | 148 | 39.3 | 4.8 | 12.3 | 3.7 / 9.4 |
| Northgate Path | 96 | 37.7 | 3.1 | 7.9 | 2.4 / 6.0 |
| Belalp Path | 152 | 37.0 | 5.0 | 12.7 | 3.8 / 9.7 |
| Redwood Terrace | 80 | 34.9 | 2.6 | 6.6 | 2.0 / 5.1 |
| Poppy Path | 117 | 34.4 | 3.8 | 9.7 | 2.9 / 7.4 |

A named path is often several OSM ways, some of them level footway; only the ways tagged steps are summed here.

## Carless households: walking out

Time on foot from the middle of each hill street segment to the nearest street the simulator counts as safe in that scenario (outside the order and warning zones, never reached by embers, at medium severity, seed 1), not past the fire's start; zones weighted by expected carless households (synthetic: the uniform citywide share). "All" uses stairways and paths, "streets" does not. Minutes, median / 90th percentile. A segment with no walking route counts as slower than any reached one (in the percentiles and as over 30 min); the last column gives those households.

| Scenario | Expected carless hill households | Central, all | Central, streets | Reduced mobility, all | Reduced mobility, streets | Over 30 min, central / reduced | No walking route, all / streets |
|---|---:|---:|---:|---:|---:|---:|---:|
| Reference: 1923 fire, present-day repeat | 808 | 12.7 / 23.3 | 12.9 / 25.5 | 19.6 / 36.1 | 19.8 / 39.0 | 32 / 166 | 0.0 / 0.0 |
| Extreme east wind | 935 | 6.8 / 18.4 | 7.0 / 19.6 | 10.4 / 28.5 | 10.7 / 29.9 | 9 / 77 | 0.0 / 0.0 |
| Constrained neighborhood: Panoramic Hill | 274 | 4.2 / 12.2 | 4.2 / 14.5 | 6.4 / 18.7 | 6.4 / 22.1 | 6 / 11 | 0.0 / 0.0 |
| North hills: fire in Tilden above the Summit | 785 | 8.4 / 20.6 | 8.6 / 20.8 | 13.0 / 31.8 | 13.2 / 31.8 | 1 / 96 | 0.0 / 0.0 |
| Nearest of the City's 13 shelter sites | 1,399 | 23.8 / 54.0 | 24.4 / 56.1 | 37.1 / 83.6 | 37.7 / 85.9 | 507 / 839 | 2.5 / 15.7 |

Zones with the longest walks (90th percentile, central, with stairways), by scenario:

- Reference: 1923 fire, present-day repeat: CCC-154 52 min (reduced 80; 3 households); BER-032 36 min (reduced 56; 20 households); BER-031 34 min (reduced 52; 20 households); BER-030 32 min (reduced 49; 13 households); BER-013 29 min (reduced 50; 4 households).
- Extreme east wind: CCC-154 54 min (reduced 82; 3 households); BER-016 32 min (reduced 48; 9 households); OKL-003 30 min (reduced 47; 10 households); BER-031 28 min (reduced 43; 20 households); BER-030 26 min (reduced 40; 13 households).
- Constrained neighborhood: Panoramic Hill: CCC-154 49 min (reduced 76; 3 households); OKL-003 31 min (reduced 47; 10 households); BER-013 26 min (reduced 40; 4 households); OKL-009 15 min (reduced 22; 12 households); OKL-006 15 min (reduced 22; 11 households).
- North hills: fire in Tilden above the Summit: CCC-154 53 min (reduced 81; 3 households); BER-016 29 min (reduced 45; 9 households); BER-015 27 min (reduced 41; 26 households); BER-017 25 min (reduced 39; 21 households); BER-008 23 min (reduced 35; 24 households).
- Nearest of the City's 13 shelter sites: ORI-008 108 min (reduced 166; 5 households); OKL-079 92 min (reduced 144; 11 households); OKL-239 85 min (reduced 132; 11 households); OKL-035 82 min (reduced 126; 26 households); OKL-040 78 min (reduced 120; 10 households).

Where stairways and paths shorten the walk to a shelter most (minutes saved against streets only, central):

Evergreen Ln (OKL-006) 12.0; Unnamed (BER-029) 11.8; Unnamed (OKL-002) 11.4; Unnamed (OKL-002) 10.4; Centennial Dr (OKL-002) 10.4; Unnamed (OKL-002) 10.4; Alvarado Rd (OKL-006) 10.2; Siler Pl (OKL-005) 10.2; Unnamed (OKL-002) 10.0; Centennial Dr (OKL-002) 9.5.

## Simulator: the opt-in setting on and off

`node tools/walk-access-sim.mjs`, central (medium) severity, seeds 1–3, today's plan, each scenario's time of day; same fire, households, parked cars and seed with the setting off and on. People still there when embers arrived count each person once and are not a casualty count. ETE (evacuation time estimate): minutes after the order until 90% of the Berkeley order area's vehicles are out (Time Study region in brackets). Built 2026-11-03.

Across the 15 pairs, people still there when embers arrived change by -80 to +251 (both directions, so no clear difference), people at the fire front by 0 to +10, and the 90% ETE by -0.4 to +0.6 min. The mean delay counts every departing household, most of them in the flats with none. A dash means 90% of the order area's vehicles were not out before the run ended.

| Scenario | Seed | Still there when embers arrived, off → on | At the fire front, off → on | 90% ETE (min), off → on | Mean delay, all departing households (s) |
|---|---:|---:|---:|---:|---:|
| Reference: 1923 fire, present-day repeat (R02 1923 Fire) | 1 | 5,496 → 5,747 | 571 → 577 | 104.6 → 105.2 | 6 |
| Reference: 1923 fire, present-day repeat (R02 1923 Fire) | 2 | 3,331 → 3,352 | 327 → 327 | 101.8 → 102.1 | 6 |
| Reference: 1923 fire, present-day repeat (R02 1923 Fire) | 3 | 6,843 → 6,763 | 571 → 581 | 108.8 → 108.4 | 6 |
| Extreme east wind (R05 Fire Zones 2 & 3) | 1 | 5,641 → 5,646 | 228 → 232 | 91.8 → 92.0 | 9 |
| Extreme east wind (R05 Fire Zones 2 & 3) | 2 | 4,130 → 4,132 | 145 → 145 | 92.3 → 92.6 | 9 |
| Extreme east wind (R05 Fire Zones 2 & 3) | 3 | 6,073 → 6,074 | 296 → 296 | 92.2 → 92.5 | 9 |
| Constrained neighborhood: Panoramic Hill (R04 Panoramic Hill) | 1 | 13,286 → 13,372 | 3,772 → 3,773 | — → — | 6 |
| Constrained neighborhood: Panoramic Hill (R04 Panoramic Hill) | 2 | 12,369 → 12,404 | 3,194 → 3,201 | — → — | 6 |
| Constrained neighborhood: Panoramic Hill (R04 Panoramic Hill) | 3 | 14,514 → 14,502 | 4,197 → 4,204 | — → — | 6 |
| Extreme east wind, weekday midday | 1 | 6,039 → 6,060 | 321 → 322 | 105.8 → 106.1 | 9 |
| Extreme east wind, weekday midday | 2 | 4,629 → 4,660 | 201 → 201 | 105.2 → 105.3 | 9 |
| Extreme east wind, weekday midday | 3 | 6,631 → 6,630 | 410 → 419 | 106.2 → 106.4 | 9 |
| North hills: fire in Tilden above the Summit (R09 North Berkeley Hills) | 1 | 3,510 → 3,513 | 320 → 322 | 91.6 → 92.0 | 8 |
| North hills: fire in Tilden above the Summit (R09 North Berkeley Hills) | 2 | 3,681 → 3,664 | 230 → 230 | 92.5 → 92.8 | 8 |
| North hills: fire in Tilden above the Summit (R09 North Berkeley Hills) | 3 | 4,250 → 4,230 | 424 → 427 | 93.2 → 93.4 | 8 |

## Method

- **Hill buildings** (model rule): footprint centroid in Berkeley's Fire Zones 2–3 (8,232), or outside Berkeley at 90 m DEM elevation or higher (5,359), the simulator's hill proxy. Footprints under 25 m² are dropped as sheds (assumption). 30 buildings with no household street within 150 m and 8 on DEM faults (a cell at sea level or a slope steeper than 1:1 to the curb) are left out.
- **Street**: the nearest point of a segment on which the simulator places households (`js/sim.js` residentialStreets). Rise and distance are centroid to centerline: the door, the driveway and the curb are not mapped.
- **Path or stair access** (model rule): a public OpenStreetMap stairway, footway, path or pedestrian way (not sidewalks or crossings, not access=private) within 30 m of the centroid and at least 10 m closer than the street.
- **Door-to-curb route** (model rule): the straight line. Up to a 25% slope it is walked; steeper, stairs take the whole rise at Fruin's 178 mm riser and 286 mm tread (32°) and the rest is level walking.
- **Speeds**: walking, Tobler's hiking function, 6·exp(−3.5·|s + 0.05|) km/h (1.4 m/s on the level); stairs, Fruin's free-flow horizontal speeds on that stair, 0.51 m/s up and 0.67 m/s down (sourced). Reduced mobility: 0.914 m/s on the level (MUTCD 3.0 ft/s), scaled by Tobler's slope factor (derived); stairs, NIST's mean 0.31 m/s for people with mobility impairments, taken as along the stair and converted to 0.26 m/s horizontal (derived), and 0.2 m/s up, scaled by Fruin's up/down ratio (assumption: no ascent figure was found).
- **Departure delay** for the simulator setting (assumption + derived): the terrain's extra time over level ground for three legs, at central speeds, never below zero. Each segment keeps the 10th, 25th, 50th, 75th and 90th percentiles; a segment with fewer than 5 buildings uses its zone's pooled figures (877 of 1,862 hill segments). A household draws its delay from a separate random stream.
- **Pedestrian network**: every network street except freeways and ramps, walkable both ways whatever the one-way coding, plus 8,360 public OpenStreetMap ways (stairways, footways including sidewalks, paths, pedestrian ways), 7,282 of their ends or road crossings joined to a street within 15 m. Times from the DEM profile every 8 m. County path and no-vehicle segments are costed as stairs where they lie within 6 m of an OSM stairway or are named STEPS (4,393 of 9,899 m). A walk starts at the middle of its street segment, a node of the network; a shelter walk ends with the straight line from the nearest street node to the site (up to 133 m), priced by slope. DEM cells at 0 m or without data take the nearest valid elevation along the line. Slope is read over at least one DEM cell (4 m); paths and connectors steeper than 25% are costed as stairs (15,232 m); readings steeper than 35% on streets (the network builder's limit) or twice a 32° stair on paths are capped (316 pieces). A sanity check stops the build if any piece is slower than 10 s per meter with reduced mobility; this build: 0 pieces, and 1 edge over 5 times its level walking time.

## Limits

- The DEM is bare earth at 4 m: it shows no retaining walls, garages, decks, inside stairs or floor levels. A home on a steep lot may have its door at street level by a bridge, or many more steps than the ground between centroid and curb.
- Public stairways in OpenStreetMap (456 in the hills) carry step counts on only 40; on those, DEM rise per step is a median 0.13 m (quartiles 0.07–0.18), lower than a typical 0.15–0.18 m riser, so the DEM rise along stairways is probably low and stair times short. The OSM extract is the server's copy as of 2026-06-01T08:52:28Z.
- Building footprints are machine-learned (Microsoft) and include garages and outbuildings over 25 m²; a building is not a household. OpenStreetMap buildings could be fetched for only 3 of 9 tiles (Overpass timeouts on 2026-11-03); in those, OpenStreetMap has 25–30% more buildings than the Microsoft footprints of 25 m² or more, so building counts here are low, by an unknown share in the hills.
- Carless households are the simulator's uniform 7.47% of households; no tenure, age or disability data by block. The walk ignores fire, smoke, darkness, traffic and crowding, and the order area is one seed's.
- The Time Study's mobilization curves come from a survey of residents and may already include part of the walk to the car; the simulator setting adds the whole terrain excess on top.
