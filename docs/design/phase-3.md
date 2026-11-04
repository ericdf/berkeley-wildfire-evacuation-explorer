# Phase 3, evidence-backed Berkeley scenario: design note

Status: design note, 2026-11-03. Decisions taken 2026-11-03 (SOURCE_NOTES PH9): all five in section 9,
as recommended, with 3e in scope. Step 3a is built (PH10). `tools/phase3-sources.mjs` reproduces
every figure in section 2. Sources are logged in
`SOURCE_NOTES.md` under "Phase 3 sources: structures and fuels" (rows PH1–PH8). The simulator is
an educational comparison tool, not a prediction and not an official evacuation plan; the same
holds for everything proposed here.

## Summary

- **Phase 3 has six parts** (`specification.md`, "Phase 3"): verified inputs in place of
  placeholders, building footprints, fire zones, vegetation and fuel categories, actual parking
  restrictions, and the best local elevation. Two are done (fire zones; 1 m lidar elevation), one
  is half done (782 no-parking signs are on the map but set no parking), and three have not
  started: structures, fuels and the remaining placeholders (25 values in
  `data/assumptions.json` are still labeled assumption).
- **The City publishes footprints for every structure in Fire Zones 2–3, with the distance to the
  nearest structure.** 7,706 structures. Measured from the footprints, 7,053 (91.5%) stand less than
  25 ft from the next one, the closest of the three NIST bands the City's map uses; the median gap
  is 7.5 ft. The City's distance field reads about 27% high, as Web Mercator distances do at
  Berkeley's latitude, and gives 6,995 (90.8%) (PH10).
  5,564 (72.2%) were built before 1950 (PH1, PH2). The same layer carries addresses, parcel
  numbers, owner names, owner-occupancy and tract demographics, so the build must request only
  geometry and the separation field, and keep counts per fire cell, never footprints (section 7).
- **The national fuel map calls most of the hill neighborhoods non-burnable.** LANDFIRE 2025
  (FBFM40, 30 m) classes 76.9% of Fire Zone 2 as NB1, urban or developed (PH4). The houses that
  burned in 1923 and 1991 are fuel the map leaves out, so LANDFIRE can set fuels only in the
  wildland, and the developed hills need a structure-based factor.
- **Structures change the plan comparison only if a plan can change the fire.** The fire overlay
  runs the same for Plan A and Plan B with the same seed. Structures counted under it add context
  (how many homes the fire front or embers reach, by hour) but are equal in both plans. They enter
  the comparison only through a setting that acts on structures: home hardening, Zone 0
  vegetation clearance, or engines committed to structure protection. No public source gives the
  size of any of those effects for Berkeley (EMBER, SOURCE_NOTES M2, M3).
- **Recommendation:** build structure exposure first, as a data layer and a context line, with no
  loss figure (3a). Test LANDFIRE fuels in the wildland as a scratch run against the 1923
  calibration before adopting it (3b). Turn the no-parking signs into curb rules (3c) and replace
  the household placeholders with ACS tables (3d), both of which are public and touch the plan
  comparison directly. Leave structure loss and house-to-house spread (3e) for a decision by Eric,
  since it is the step closest to a prediction of losses.

## 1. What Phase 3 asks, and where each part stands

| Spec item | State, 2026-11-03 | Gap |
|---|---|---|
| City evacuation-study inputs in place of placeholders | Most traffic rules come from the 2025 Time Study (KLD), the SB 99 and AB 747 reports (SOURCE_NOTES E, A, B rows). `data/assumptions.json` labels 20 values sourced, 1 derived, 14 model rule and 25 assumption | The 25 assumptions (section 6). The best replacement for the traffic ones, KLD's DYNEV model files, is not public |
| Building footprints | Not used | Section 3 |
| Fire zones | Built: Berkeley Fire Zones 1–3 set the proxy fuel factor (`js/fire.js`, `FUEL`) and the hills/flats split | FHSZ 2025 and the Ember Threat Zones are downloaded and unused (DATA_INVENTORY) |
| Vegetation and fuel categories | Proxy only: a spread factor by fire zone, "not vegetation data" (`js/fire.js`, header) | Section 4 |
| Actual parking restrictions | Parking shares come from aerial counts on 22 hill blocks and Eric's photos; 782 no-parking signs (`layers.json` `noParkingSigns`) are drawn on the map only | Section 5 |
| Best local elevation | Built: USGS 3DEP 1 m lidar, read at 4 m (DATA_INVENTORY) | None |

## 2. What is public

All figures from `node tools/phase3-sources.mjs`, run 2026-11-03. LANDFIRE figures use a 30 m grid aligned to the model area's north-west corner, 4–8 m wider and taller than the model area.

| Item | Figure | Source | Category |
|---|---|---|---|
| Structures in Fire Zones 2–3 | 7,706 footprints; `NEAR_DIST`, the distance to the nearest structure, in feet per the City's map description | City layers `Distance_between_structures_in_Fire_Zones_2_and_3_WFL1` (layer 3) and `Structure_Distance_in_Berkeley_Fire_Zones_2_and_3_WFL1`, both edited 2023-09-13 (PH1) | sourced |
| Separation, by the City map's NIST bands | By the City's `NEAR_DIST`: under 25 ft: 6,995 (90.8%); 25–50 ft: 520 (6.7%); 50 ft or more: 191 (2.5%). `NEAR_DIST` reads about 27% high (PH10). Measured from the footprints: 7,053 (91.5%), 496 and 157; median 7.5 ft | Same layer (PH1); measured by `tools/build-structures.mjs` (PH10) | sourced (field); derived (measured) |
| Vintage | before 1950: 5,564 (72.2%); 1950–1978: 1,617 (21.0%); 1979–1990: 134; 1991–2019: 182; blank: 209 | Same layer, `vintage` (PH2) | sourced |
| Structures in very high hazard zones | 1,874 in CAL FIRE's Very High zone; 215 in the City's Very High zone on Panoramic Hill | City `COB_VHFS_Parcels_Bldngs_WFL1`, edited 2025-06-16 (PH1) | sourced |
| Wildfire Risk to Structures (V6) | 97,660 hexagonal cells of 10 acres (about 4.0 ha) in Alameda and Contra Costa counties; 1,907 touch the model area. Each has a hazard class, structures per acre and a neighborhood hazard class 1–6 | City `Alameda_and_Contra_Costa_Wildfire_Hazard_and_Risk_to_Structures_WFL1`, edited 2024-08-15; method at fuelsmapping.com (PH3) | sourced, method not yet read |
| Fuel models, model area | 92,748 cells of 30 m: non-burnable 70.8% (NB1 urban 55.0%, NB8 water 15.6%), timber litter 14.5%, grass-shrub 7.3%, grass 3.6%, timber understory 2.0%, shrub 1.8% | LANDFIRE 2025, FBFM40 (Scott and Burgan 40 models), lfps.usgs.gov (PH4) | sourced |
| Fuel models, by fire zone | NB1 urban covers 92.2% of Fire Zone 1, 76.9% of Fire Zone 2 (9,173 cells) and 63.8% of Fire Zone 3 (141 cells) | Same, cell centers against `layers.json` fire zones (PH4) | derived |
| Structures outside Fire Zones 2–3 | No City footprint layer found. 2020 Census housing units per block are in hand (`data/raw/census/blocks-2020.json`) | DATA_INVENTORY | sourced (counts, not footprints) |
| Effect of hardening or Zone 0 on loss | No dose-response; "up to 75%" fewer losses with combined measures in Paradise (Milliman 2023); "extreme weather appears to nullify most interventions" | EMBER, SOURCE_NOTES M2, M3 | sourced (no Berkeley effect size) |

## 3. Structures

**What the data allows.** The City layer gives each Fire Zone 2–3 structure's footprint and the
distance to its nearest neighbor. Reduced to the fire grid (30 m cells), that becomes, per cell:
structures, footprint area, and structures in each separation band. Outside Fire Zones 2–3 the
2020 Census housing units per block, spread over the block's developed cells, are a coarser
stand-in (derived). Microsoft and Overture building footprints would cover Oakland and
Kensington; neither was checked for this note.

**What it adds to results.**

- *Context, both plans equal:* structures the fire front reaches, and structures under ember
  exposure, by hour, for the scenario and seed. This is the same overlay the "people still there
  when embers arrived" measure uses, counted in buildings instead of people.
- *Comparison, only with a structure setting:* a home-hardening or Zone 0 share by EMBER area
  (Phases I–III, M1) would change structure exposure only through an effect size, which no
  source gives. It stays an assumption sweep or is not built (3e).

**How it could mislead.** "Structures reached by embers" read as "homes lost". Every place it
appears must say it counts exposure, not ignition or loss, and carry the "not a prediction" line.

## 4. Fuels

**LANDFIRE fits the wildland and not the neighborhoods.** In the grassland, brush and eucalyptus
east of the hill neighborhoods, FBFM40 gives a sourced fuel class where the simulator now uses one
factor (1.0) for every wildland cell. In the developed hills it gives NB1, which would stop the
fire. Three ways to set fuel in developed cells:

- (i) Keep the fire-zone proxy there (0.7 in Fire Zone 2), as now. Smallest change.
- (ii) Scale it by structure density and separation from section 3: a cell with homes under
  25 ft apart spreads faster than one with homes 50 ft apart. The direction is supported (EMBER
  M4: house-to-house spread is "the main danger"); the size is a model rule.
- (iii) Use the neighborhood hazard class from Wildfire Risk to Structures. A published product,
  but its method has not been read, and its 4 ha cells are coarser than the 30 m grid.

**Calibration cost.** The 1923 central spread is calibrated (×0.55) to reach the 1923 footprint's
west end in about 5 hours (change log, 2026-10-31, S11). Any fuel change shifts that, and every
Simple-view question must be rechecked on the three Simple-view fires. So 3b starts as a scratch
run, the way the staffing note did (`docs/design/fire-staffing.md`, FS12): adopt it only if the
1923 timing stays in its window and the fire reaches the hills on the same streets.

## 5. Parking restrictions

**Checked 2026-11-04; not built as a status-quo change (PH11, PH12).** The 782 signs touch 245 of 1,934 hill
segments. They have no facing direction or extent, and the City describes them as lacking tow-away language, with 188
due for replacement. On the 22 aerially counted blocks, signed blocks still had parked cars in 2020. The daylighting law
(Vehicle Code §22500(n), citations from 2025) adds a 20 ft no-parking zone before every crosswalk; its compliance in
the hills is unmeasured, and Eric expects it is often ignored. Both are rules on the books whose effect on the street is
unknown, so the status quo stays built from what people were seen doing.

The natural use of both is a **plan setting**, "Enforce no-parking signs and daylighting": signed curbs and the 20 ft
before each corner kept clear. That is a new intervention, so it waits for Eric. Two things to settle first: how far a
sign governs (to the next sign or corner, on the side it stands; model rule), and how daylighting acts in a model that
does not place parked cars along the block (through the City's 45 tight turns and segment ends; model rule).

## 6. Placeholders that public data can replace now

Of the 25 values labeled assumption, these have a public source within reach:

- *Households without a vehicle and persons per household:* ACS 5-year B08201 and B11016 by
  block group (DATA_INVENTORY, Missing inputs). Public, aggregate.
- *Night parking range* (`parking.range.night`): evening aerial imagery does not exist; Eric's
  street photos or a resident count on the 22 blocks would.

The traffic assumptions (`lanes`, `capacity.speedMph`, `intersections.delayS`) wait for KLD's
DYNEV link tables, which only the City or KLD can provide. Growth, routing and operations
assumptions are scenario choices and stay assumptions.

## 7. Privacy

- The City structure layers (PH1) hold owner names, mailing-address fields on the parcel layers,
  owner-occupancy, rent control status and tract demographics alongside each footprint. The build
  requests `outFields` limited to the separation field and keeps per-cell counts; footprints and
  all other fields are never saved, the same rule as `data/raw/widening/` and `data/raw/egress/`.
- A public City layer, `home_hardening_csv_test` (390 points, edited 2026-05-08), lists
  household-level home-hardening requests. It is not used, and nothing from it is stored (PH8).

## 8. Recommendation and order

1. **3a, structure exposure (data and context only). Built 2026-11-03 (PH10).** `tools/build-structures.mjs` writes
   per-cell counts (`data/model/structures.json`): structures and measured separation bands in
   Fire Zones 2–3 from the City layer, Census housing units elsewhere, each labeled. The map has a
   Structures layer; results have one row, the structures and housing units the fire front and
   embers had reached so far, the same under every plan. No model change, so calibration is
   untouched.
2. **3b, LANDFIRE fuels in the wildland (scratch run first). Done 2026-11-03 in another session as the opt-in Fuel setting (`docs/fire-validation.md`, FV1–FV16); NB1 cells keep the proxy, option (i). Adopting it as the default is Eric's decision.** Option (i) for developed cells.
   Adopt only if the 1923 calibration and every Simple-view question hold. Option (ii) only as a
   second scratch run.
3. **3c, no-parking signs to curb rules. Checked 2026-11-04: not built as a status-quo change; proposed as a plan setting with daylighting, Eric's decision (section 5).**
4. **3d, ACS household tables. Done 2026-11-03 in another session as the opt-in Household mix setting (DM1–DM17).** A model change with the full checks.
5. **3e, structure ignition, house-to-house spread and loss: not before Eric decides.** It would
   rest on an effect size nobody has published for Berkeley (M2, M3), and it is the closest the
   simulator would come to predicting losses.

## 9. Decisions for Eric

- (a) Store per-cell counts only, never footprints? (Recommended; it matches the widening and
  egress tools.)
- (b) Show structure exposure as context in results, with both plans equal, or keep it on the map
  only?
- (c) Proceed with the 3b scratch run, knowing a fuel change reopens the 1923 calibration?
- (d) Is 3e (loss and house-to-house spread) in scope for this simulator at all?
- (e) Order of 3a–3d.
