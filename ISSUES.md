# Issues in outside data

Problems found in data published by others: what is wrong, the evidence, what the simulator does about it, and whether
anyone has been told. Each entry stands on its own, so it can be acted on months later without the session that found it.
Problems in our own model belong in `HANDOFF.md` (punch list); sources and insights in `SOURCE_NOTES.md`.

Status words: **open** (not reported), **reported** (told the publisher; say who, when, how), **fixed by publisher**,
**closed** (no action planned, with the reason).

---

## I1. City structure-distance layer overstates distances between buildings by about 27%

**Status:** open. Found 2026-11-03 (Claude Code, Phase 3 step 3a, PR #53). Eric asked on 2026-11-04 that it be recorded
here; whether to tell the City is undecided. Nobody at the City has been told.

**The layer.** City of Berkeley ArcGIS Online, `Distance_between_structures_in_Fire_Zones_2_and_3_WFL1`, layer 3
"Distance Between Structures" (the same 7,706 features are in `Structure_Distance_in_Berkeley_Fire_Zones_2_and_3_WFL1`,
layer 0). Last edited 2023-09-13. URL:
https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Distance_between_structures_in_Fire_Zones_2_and_3_WFL1/FeatureServer/3

It holds a footprint for every structure in Berkeley Fire Zones 2–3. The field `NEAR_DIST` is the distance from each
structure to its nearest neighbor. The City says it is in feet: the service description reads "Distances are in feet" (the
`Structure_Distance…` service) and the map classes the field into "0 to 25 Feet", "25 to 50 Feet" and "Greater than 50
Feet", to "match NIST Scenarios" (the `Distance_between_structures…` service description).

**What is wrong.** `NEAR_DIST` is not in ground feet. It is the distance in Web Mercator meters (EPSG:3857) converted to
feet. Web Mercator stretches distances by 1 / cos(latitude), 1.267 at Berkeley (37.87° N), so every distance in the field
reads about 27% too long. A structure the City's map shows as 25 ft from its neighbor is about 19.7 ft away on the ground.
The City's band edges of 25 and 50 ft correspond to about 19.7 and 39.4 ft on the ground.

**Evidence.**

1. *Distances.* For every footprint, `tools/build-structures.mjs` measures the gap to the nearest other footprint in UTM
   Zone 10N meters, which are true to within 0.04% here. It then divides that gap by `NEAR_DIST`. Over the 3,037 footprints with
   `NEAR_DIST` ≥ 10 (smaller gaps are dominated by digitizing), the ratio has a median of 0.2403 m per unit (10th
   percentile 0.2398, 25th 0.2399, 75th 0.2407). Ground feet would give 0.3048. Feet measured in Web Mercator give
   0.3048 × cos 37.87° = 0.2406. The tight spread, 0.2398–0.2407 from the 10th to the 75th percentile, rules out noise; the 90th
   percentile, 0.2979, is footprints whose nearest neighbor in the City's run differs from ours.
2. *Areas.* The layer's stored areas (`Shape__Area`, which ArcGIS Online computes in the layer's own projection) total
   2,619,654 m². The same footprints measured in UTM total 1,627,936 m². The ratio is 1.609; Web Mercator's area
   stretch at 37.87° N is 1 / cos² = 1.605. The layer's spatial reference is wkid 102100 (EPSG:3857, Web Mercator).
3. *Independent of the City's geometry (2026-11-04).* OpenStreetMap building outlines (Overpass API mirror
   overpass.kumi.systems, box 37.875–37.885° N, 122.255–122.240° W, 560 buildings; © OpenStreetMap contributors, ODbL;
   not stored) were matched one-to-one to 352 City footprints by centroid. City area ÷ OSM area, both in UTM: median 0.992
   (25th–75th percentile 0.943–1.051), so the City's footprints are the right size on the ground. Gaps measured on the OSM
   outlines alone, against `NEAR_DIST`, for 160 of them with `NEAR_DIST` ≥ 10: median 0.2371 m per unit (25th–75th
   percentile 0.212–0.262), close to Web Mercator feet (0.2406) and far from ground feet (0.3048). The wider spread is
   expected, because two mapping sources draw the same houses a little differently.
4. *Reproduce:* `node tools/build-structures.mjs` prints the distance check as "NEAR_DIST units check". The area check
   is one statistics query: sum of `Shape__Area` on the layer above (`outStatistics`, no records needed).

The likely cause is a "Near" analysis run on the layer in its Web Mercator projection rather than in a projected
coordinate system for California (for example State Plane Zone III, EPSG:2227, the City's imagery projection). That is
our inference from the ratios above; the City's layer does not say how `NEAR_DIST` was computed.

**How much it changes the counts** (all 7,706 structures):

| Distance to the nearest structure | By the City's `NEAR_DIST` | Measured on the ground |
|---|---|---|
| under 25 ft | 6,995 (90.8%) | 7,053 (91.5%) |
| 25–50 ft | 520 (6.7%) | 496 (6.4%) |
| 50 ft or more | 191 (2.5%) | 157 (2.0%) |

Measured median gap: 7.5 ft (10th percentile 3.2 ft, 90th 22.3 ft); 23 footprints touch or overlap another. The City's
mean `NEAR_DIST` is 12.1 "ft", about 9.5 ft on the ground.

Counts under tighter thresholds (`meta.totals.underFt` in `data/model/structures.json`):

| Structures closer than | By `NEAR_DIST` | Measured |
|---|---|---|
| 5 ft | 1,571 | 1,844 (+17%) |
| 10 ft | 4,668 | 5,077 (+9%) |
| 20 ft | 6,693 | 6,786 |
| 50 ft | 7,515 | 7,549 |
| 100 ft | 7,690 | 7,692 |

The share in the closest band changes little, because most hill structures are far closer than 25 ft. The error matters
more for anything that uses the distances themselves: the outer bands, a defensible-space or Zone 0 analysis (5 ft), or
a structure-to-structure ignition model keyed to separation distance (NIST's 25 ft and 50 ft scenarios are about real
distances).

**Where else it shows up.** The cause is general: every hosted layer on the City's ArcGIS Online account is stored in Web
Mercator, and anything measured in its native units is stretched by 1.267 in length and 1.605 in area at Berkeley.

- *`Shape__Length` and `Shape__Area` on every hosted layer.* ArcGIS Online fills these in Web Mercator units. Anyone who
  reads them as meters and square meters overstates lengths by 27% and areas by 60%. Examples: the City's Fire Zone 2
  polygons store 13,308,580 "m²" against about 8.3 km² on the ground, and the Narrow_Roads segments store `Shape__Length`
  the same way. Attribute fields typed in from the field or from other systems (pavement width `PAV_WIDTH_RD`,
  `Width_w_Parking`) are unaffected.
- *This project made the same mistake once.* The Phase 3 note gave the County's Wildfire Risk to Structures cells as
  "about 6.4 ha", read from `Shape__Area` (64,370). They are 10-acre hexagons, about 4.0 ha on the ground. Corrected
  2026-11-04 (SOURCE_NOTES PH3). The layer's own `STRUCTURES_PER_ACRE` uses the true 10 acres, so the vendor's figures
  are right; only our reading was wrong.
- *City density layers, unverified.* `Structure_Density_Per_Acre_in_Fire_Zones` and
  `DensityAnalysis_Buildings_in_Fire_Zone_2_and_3_Ver3` report structures per acre and per km². If either was computed
  with planar areas in Web Mercator, its densities are about 38% low (divided by 1.605). Not checked; their methods are
  not stated.
- *Our own tools are not affected.* Every tool asks the server for longitude and latitude (`outSR: 4326`) and projects to
  UTM Zone 10N itself; no tool reads `Shape__Length`, `Shape__Area` or `NEAR_DIST` as a measurement. The simulator's
  repository text cites those fields only in SOURCE_NOTES, as described here. A search of the council analysis
  repository found no use of them.
- *Rule for future work.* Never take a length, area, distance or density from an ArcGIS Online layer's stored fields or
  from an analysis run on it without checking the projection. Request `outSR=4326` and measure in UTM, or confirm the
  layer's stated method.

**What the simulator does.** It ignores `NEAR_DIST` for its bands and uses distances measured from the footprints
(`data/model/structures.json`, built by `tools/build-structures.mjs`). The City's band counts are kept in the file's
`meta.totals.cityNearDistBands` for comparison. Sources: SOURCE_NOTES PH1 (the layer as published), PH10 (the finding).
Users see it in Assumptions & limits.

**Who might use the wrong numbers.** Anything built on the City map "Distance between structures in Fire Zones 2 and 3"
(the NIST categories), possibly including EMBER work on Zone 0 and structure separation (EMBER, SOURCE_NOTES M1–M4).
We have not checked whether any City report quotes figures from this layer.

**If we tell the City.** The useful message is short: `NEAR_DIST` reads about 27% high because it was computed in Web
Mercator; recomputing the Near analysis in State Plane or UTM fixes it; the evidence is items 1–2 above. The likely
contacts are the City's GIS staff (the layer's owner on ArcGIS Online) or the Fire Department's EMBER team. A draft would
go in `correspondence/`. No draft exists yet.

---

## I2. A public City layer lists household-level home-hardening requests

**Status:** open. Found 2026-11-03 (Claude Code, Phase 3 design note, PR #48). Nobody at the City has been told.

**The layer.** City of Berkeley ArcGIS Online, `home_hardening_csv_test`, layer 0: 390 points, last edited 2026-05-08.
Its field names include `property_address`, `own_rent`, `inspector_name`, `date_submitted`, `status` and requested vent
sizes. The name suggests a test upload.

**What is wrong.** Its metadata and feature count answered an anonymous query on 2026-11-03, so it appears to be public. If its records are public too, it publishes residents' addresses alongside whether they
own or rent and their home-hardening requests. We read only the field list and the feature count; no records were
requested, and nothing from it is stored or used (SOURCE_NOTES PH8).

**If we tell the City.** Point the City's GIS staff to the layer name and suggest restricting its sharing. Do not quote
any record.

---

## I3. The City's fire-zone layers show the 2013 zones, and the new zones' area fields read high

**Status:** open. Found 2026-11-04 (Claude Code). Nobody at the City has been told.

**What is wrong.**
- *Stale map.* The 2025 Fire Code (Special Item 02, Council 2025-04-15, Attachment 1) renamed Fire Zones 1–3
  as the Flatlands, Hills and Panoramic Mitigation Zones and added a Grizzly Peak Mitigation Zone (Zone 4). Every
  City fire-zone layer found still shows Zones 1–3 of the 2013 map (`FireZones_WFL1`, `FireZonesBerkeley_WFL1`,
  `HFZ_shp` and the Genasys copies; edited 2019–2024). Only `grizz_pano_mitigation` (edited 2026-03-13) has the new
  Panoramic and Grizzly Peak areas, as two polygons without zone names.
- *Area fields.* In `grizz_pano_mitigation`, the field `area_acre` gives 136.2 and 451.8 acres and `Shape__Area` gives
  115.7 and 436.3 acres. Measured in UTM, the polygons are 72.0 and 271.0 acres; counting 30 m cells inside them gives
  72 and 274. `Shape__Area` reads high by Web Mercator's 1.6 (I1). `area_acre` reads about 1.67–1.89 times high, by a
  method not stated.

**Evidence.** SOURCE_NOTES PH26; the cell count is reproduced by intersecting the polygons with the fire grid.

**What the simulator does.** Its proxy fuel still uses the 2013 zones (`data/model/layers.json` from
`FireZones_WFL1`). Re-keying it to the 2025 zones is a model change for Eric (HANDOFF item 5).

**If we tell the City.** Point the City's GIS staff to the layers above and the Fire Code's zone definitions, and to
the `area_acre` values.

