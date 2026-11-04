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
3. *Reproduce:* `node tools/build-structures.mjs` prints the distance check as "NEAR_DIST units check". The area check
   is one statistics query: sum of `Shape__Area` on the layer above (`outStatistics`, no records needed).

The likely cause is a "Near" analysis run on the layer in its Web Mercator projection rather than in a projected
coordinate system for California (for example State Plane Zone III, EPSG:2227, the City's imagery projection). That is
our inference from the two ratios; the City's layer does not say how `NEAR_DIST` was computed.

**How much it changes the counts** (all 7,706 structures):

| Distance to the nearest structure | By the City's `NEAR_DIST` | Measured on the ground |
|---|---|---|
| under 25 ft | 6,995 (90.8%) | 7,053 (91.5%) |
| 25–50 ft | 520 (6.7%) | 496 (6.4%) |
| 50 ft or more | 191 (2.5%) | 157 (2.0%) |

Measured median gap: 7.5 ft (10th percentile 3.2 ft, 90th 22.3 ft); 23 footprints touch or overlap another. The City's
mean `NEAR_DIST` is 12.1 "ft", about 9.5 ft on the ground.

The share in the closest band changes little, because most hill structures are far closer than 25 ft. The error matters
more for anything that uses the distances themselves: the outer bands, a defensible-space or Zone 0 analysis (5 ft), or
a structure-to-structure ignition model keyed to separation distance (NIST's 25 ft and 50 ft scenarios are about real
distances).

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
