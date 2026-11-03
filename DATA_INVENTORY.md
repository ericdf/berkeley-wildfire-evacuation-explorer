# Data inventory

Status as of 2026-11-03. Categories: **sourced** (published data used as-is), **derived**
(computed from sourced data), **assumption** (placeholder, editable), **synthetic**
(generated).

## In hand

| Dataset | Source | Format / CRS | Used for | Category |
|---|---|---|---|---|
| Street centerlines (3,330 segments) | Alameda County open data portal, downloaded 2026-10-20; segment data revised 2015-09-26 | GeoJSON, EPSG:4326 → UTM 10N | Road graph, names, class, one-way (TRVLWAY), paths and steps | sourced |
| Elevation, 4 m | USGS 3DEP 1 m lidar DEM: CA_AlamedaCounty_2021_B21, plus CA_NoCAL_Wildfires_B5b_2018 for the Contra Costa side; 4 m internal overview read from the COG tiles | int16 dm grid, EPSG:32610, NAVD88 | Hillshade, contours, street grade, fire slope effect | derived |
| City street centerline (network version, 3,831 segments, edited 2021-11-17) | City of Berkeley ArcGIS Online `Street_Centerline` | GeoJSON | Pavement width `PAV_WIDTH_RD` (ft, from pavement management), lanes `PAV_LANES`, speed | sourced; matched to County segments (derived) |
| Narrow roads (356) and tight turns (45) | City `Narrow_Roads_and_TT_WFL1` (2024-03-20) | GeoJSON | Width and **width with parking** on narrow hill roads; turn radius | sourced |
| Evacuation zones (109 after merging split features; 78 in Berkeley) with population estimates | City `GenasysZonesBerkeley` (2025-08-05) | GeoJSON | Zone orders; household totals; Leave Early Zones. Keyed by `zone_id` (the `zonenum` field repeats across cities) | sourced |
| Evacuation regions (21), incl. 1923 phases and Panoramic Hill | City `Evac_Regions` | GeoJSON | Context (not yet used for orders) | sourced |
| Fire Zones 1–3 | City `FireZones_WFL1` | GeoJSON | Hill/flats split, proxy fuel factor | sourced |
| 1923 fire archival boundary | City `1923_Archival_Boundary_COB` | GeoJSON | Reference scenario footprint | sourced (historical) |
| Neighborhoods (24), city limits | City `Neighborhoods` (OED 2023), `City_of_Berkeley_Boundary` | GeoJSON | Map context, navigation | sourced |
| Fire stations (7), shelters (13) | City `Fire_Stations`, `ShelterSites_WFL1` | GeoJSON | Responder origins; map | sourced |
| No-parking signs (fire zones and narrow roads) | City sign layers | GeoJSON points | Map layer only (not yet used to set parking) | sourced |
| Existing traffic-calming devices (331 points: 75 diverters, 63 circles, 184 humps, 8 tables, 1 gate) | City `Berkeley_Fire_Apparatus_Route_Map_WFL1`, layer 1 (2025-10-28), saved as `traffic_calming` | GeoJSON points | List of record for diverters, the gate and traffic circles (network builder 5b) | sourced; each diverter's shape is read from OSM |
| OpenStreetMap ways and barriers around the City's diverters (cycleways, paths, service roads and barrier nodes within 60 m of each diverter and the gate) | Overpass API (overpass-api.de), 2026-11-01; © OpenStreetMap contributors, ODbL; query in `data/raw/osm/diverter-surroundings.overpassql` | JSON, EPSG:4326 | Whether engines can pass a diverter (`emergency=yes` on the crossing cycleway or bollard) | sourced |
| City orthophotos 2020 and 2017, 3 in (7.6 cm) pixels; also 2014 4 in and 2020 1 m (used for parking counts on 22 hill blocks) | City of Berkeley GIS `gis.cityofberkeley.info/arcgis3/rest/services/Imagery/ORTHOPHOTO_2020_3in/ImageServer` (public REST, `exportImage`); flown by Pictometry for the City | Image service, EPSG:2227 | Counted parked cars, sides parked and gaps on 22 hill blocks (derived counts in `data/field/`). More blocks possible | sourced (public City service; imagery flown by Pictometry; only counts kept in the project, to keep it small) |
| OpenStreetMap drivable streets in the model area (5,822 ways; 3,365 segments used outside Berkeley) | Overpass API (overpass-api.de), 2026-11-01; © OpenStreetMap contributors, ODbL | JSON, EPSG:4326 → UTM 10N | Streets outside Berkeley: geometry, name, class, one-way, lanes, maxspeed; barriers and circles | sourced; widths outside Berkeley are an assumption |
| OpenStreetMap roads to two Lawrence Berkeley National Laboratory gates (McMillan Road to the Grizzly Peak Gate, Lawrence Road and two one-way gate pieces to the Strawberry Canyon Gate; 4 ways) | Overpass API (overpass-api.de), 2026-11-01; © OpenStreetMap contributors, ODbL; query in `data/raw/osm/lbnl-gate-roads.overpassql` | JSON, EPSG:4326 | Lab exits to Centennial Dr that neither the County file (it stops at the city line) nor the street extract (it leaves out `highway=service`) has; added by `network.osmAdditions` (SOURCE_NOTES Z5) | sourced; using the gates as exits is a model rule |
| Genasys Protect evacuation zones in the model area (188 zones) | WFS behind protect.genasys.com (`zonehavenv2:evacuation_zone`), 2026-11-01 | GeoJSON | Outlines of zones outside Berkeley (the City layer has only slivers of them). No population | sourced |
| 2020 Census blocks (2,794; population and housing units at interior points) and the Kensington CDP (5,428 people) | Census TIGERweb, 2026-11-01 | JSON | Population of zones without a Genasys estimate (59 zones); check on the Genasys estimates | sourced |
| ACS 2020–2024 5-year B25077, median value of owner-occupied homes, for the 7 block groups that managed-retreat buyout cases touch (block group of each bought-out segment from TIGERweb) | Census Reporter API and TIGERweb, 2026-11-01; cache `data/raw/census/acs-retreat.json` | JSON | Screening acquisition cost in `tools/retreat-costs.mjs` (SOURCE_NOTES RT7). Tenure (B25003) requests timed out, so owners and renters are not split | sourced; applying a block-group median to every home is an assumption |
| ACS 2020–2024 5-year, 201 block groups (B25044 tenure by vehicles, B25008 population in occupied units, B25010, B11016, B11007 households with people 65+, B01001 age) and 80 tracts (B18105 ambulatory difficulty, B18101 disability, B11010), estimates and margins of error | Census Reporter API, 2026-11-03; cache `data/raw/census/acs-demand.json` (`tools/fetch-demand-acs.mjs`) | JSON | Household mix by place (opt-in): per-zone carless share and persons per household; reported 75+, 65+ alone and ambulatory-difficulty counts (SOURCE_NOTES DM1–DM9) | sourced; allocated to zones by 2020 blocks (derived; uniform rates within a block group are an assumption) |
| Per-zone demand: zero-vehicle share, persons per household, shares 75+, 65+, one-person 65+, ambulatory difficulty, disability, each with an MOE range; implied counts; facility aggregates | `tools/build-demand.mjs` → `data/model/demand-by-zone.json` | JSON | Same | derived |
| Licensed facilities and schools by evacuation zone: residential care for the elderly, adult residential, child care centers (CDSS CCL, current layer edited 2026-10-23), skilled nursing, intermediate care, hospitals (CDPH, data date 2026-10-16), public schools with 2025-26 enrollment (CDE), private schools (NCES 2023-24 locations, CDE 2025-26 enrollment) | `tools/fetch-demand-facilities.mjs` → `data/raw/facilities/facilities-by-zone.json` (counts and capacity only; raw lists not kept) | JSON | Reported per zone in the Inspector; assisted-evacuation design (SOURCE_NOTES DM10–DM15) | sourced, aggregated (derived) |
| HHS emPOWER: Medicare beneficiaries relying on electricity-dependent equipment, 20 ZIPs touching the model area | HHS emPOWER ArcGIS service, data edited 2026-10-07; `data/raw/hhs/empower-zip.json` | JSON | Reported (design note); not by zone (SOURCE_NOTES DM16) | sourced |
| FHSZ 2025, ember threat zones | City `CAL_FIRE_and_Berkeley_FHSZ_2025`, `Ember_Threat_Zones` | GeoJSON (100+ MB each) | Compared with the fire overlay's ember exposure (`tools/fire-validation.mjs`, docs/fire-validation.md §3); raw files gitignored, only derived statistics kept (`data/model/fire-validation.json`) | sourced |
| Fuel models: LANDFIRE 2025 FBFM40 (40 Scott and Burgan fire behavior fuel models), 30 m | LANDFIRE image service `LF2025_FBFM40_CONUS` (lfps.usgs.gov), exportImage on the fire grid, retrieved 2026-11-03; public domain | `data/terrain/fbfm40.u8` (uint8 code per 30 m fire cell) + `fbfm40.json` (source, counts, spread-factor table) | Opt-in "Fuel: LANDFIRE FBFM40" scenario setting (`tools/fetch-fuel.mjs`, `js/fire.js` withLandfireFuel; SOURCE_NOTES FV1–FV4) | sourced (classes); model rule (spread factors) |
| 1991 Tunnel Fire perimeter; 1923 and 1991 perimeters from the City's fire history | CAL FIRE FRAP `California_Historic_Fire_Perimeters` (TUNNEL 1991, 1,622.8 GIS acres); City `Berkeley_Fire_History` layers 0 and 3 (EBRPD and FRAP), retrieved 2026-11-03 | GeoJSON, `data/raw/calfire/`, `data/raw/city-history/` | Checking "Like 1991" against the record (docs/fire-validation.md §4; SOURCE_NOTES FV6–FV9) | sourced (historical) |
| Wind on Red Flag Warning days | NWS MTR Red Flag Warnings (IEM VTEC archive, 2008–2026); Oakland North RAWS (WRCC); Oakland airport ASOS (IEM), retrieved 2026-11-03 | `data/model/wind-red-flag.json` (derived summary; raw downloads in `data/raw/wind/`, gitignored) | Comparing the fire families' 30°/45°/60° winds (docs/fire-validation.md §5; SOURCE_NOTES FV12–FV13) | derived |
| Jobs by workplace block, 2023 (1,075 Berkeley blocks, 73,292 jobs; jobs held by people living outside Berkeley from the OD file) | LEHD LODES8 (WAC, OD main, crosswalk), retrieved 2026-11-03; `data/raw/lodes/` | CSV by 2020 block | Weights for the opt-in "by workplace" employee placement (`data/model/workplaces.json`) | sourced; in-commuter share derived |
| Off-street parking (1,747 features; UC 33, Lab 45, City garages) with capacity tags or footprints | OpenStreetMap via Overpass, 2026-11-03; `data/raw/osm/parking*.json` | JSON | UC and Lab parking under the opt-in placement; UC capacities scaled to UC's published 5,500 spaces (pt.berkeley.edu) | sourced; footprint capacities assumption; scaling model rule |
| Public schools and 2025-26 enrollment (36 in the model area); private school enrollment by district | California Department of Education, 2026-11-03; `data/raw/cde/` | CSV | Enrollment by evacuation zone (context; no school trips are modeled) | sourced |
| Traffic signals outside Berkeley (119 junctions) | OpenStreetMap `highway=traffic_signals`, 2026-11-03; `data/model/signals-outside.json` | JSON | Context for a signal capacity rule (SOURCE_NOTES WP12) | sourced; snapping derived |

## Where width, grade and lane counts come from

- **Grade.** Derived from the 1 m lidar DEM. The steep-grade value is the 90th percentile
  of 25 m windows. It can be wrong where a road sits on a cut, fill or retaining wall, so
  grades above 35% and freeway structures are flagged unreliable. The City
  `Street_Centerline` layer also has `SLOPE` and `P_SLOPE` fields with undocumented units.
  Comparing them with the DEM values is a useful next check.
- **Width.** The City pavement-management system (StreetSaver) gives curb-to-curb
  `PAV_WIDTH_RD` for 84% of vehicle segments. The City's Narrow_Roads survey gives width
  and width with parking for 356 hill segments. Still missing: widths for the other 16%,
  and verification. Better sources would be the full StreetSaver section table from Public
  Works, or curb lines measured from the 2021 lidar point cloud or orthoimagery.
- **Lanes.** Hill streets are set to one lane each way, per Eric (2026-10-31). Elsewhere
  lanes come from City `PAV_LANES`, falling back to an assumption by road class. The 2025
  Evacuation Time Study (KLD) network would give lanes, saturation flow and intersection
  control for every modeled link. That is the best replacement.
- **Parking.** Varies by block and seed, with shares from counts of parked cars on City 2020
  orthophotos for 22 hill blocks (`data/field/aerial-parking-counts-2020.json`) and Eric's
  street photos. Daytime only. The City's no-parking-sign layers are loaded but not yet turned
  into curb segments. A curb or red-zone inventory and evening counts would replace the
  remaining assumptions (off-pavement parking, bad parking jobs).

## Documents read

The City's 2025 Evacuation Time Study (KLD), the SB 99 Access Impaired Neighborhood report, the AB 747 route analysis, and the July 2025 Evacuation StoryMaps text are in `data/raw/docs/`. The three reports were recovered from the Wayback Machine because the City's links now return 404. What each contributed, with page references, is in `SOURCE_NOTES.md`.

California ADU and SB 9 statutes (Gov. Code §66314, §66323, §65852.21, §66300), HCD's ADU Handbook (March 2026) and HCD's letters to Berkeley (Oct. 17, 2022; June 16, 2026), and Berkeley Ordinance 7,983-N.S. (2025) were read online for the R0 setting; citations are in `SOURCE_NOTES.md` (L1–L9). Nothing from them is stored as data.

## Missing inputs

| Need | Format | Likely source | Unlocks |
|---|---|---|---|
| **KLD DYNEV model files** for the 2025 Time Study (link/node tables with lanes, speeds, signal timing; zone demand by group) | Tables | City of Berkeley / KLD Engineering | Replacing our per-class speeds and intersection capacities; exact employee/student/visitor demand by zone. *(The report itself is in hand.)* |
| **City curb data** (where parking is permitted, one or both sides), as used by KLD for SB 99 / AB 747 | GeoJSON lines or segment table | City Public Works | Replaces the "parking both sides where it fits" assumption |
| ~~Locations of employees, UC students, visitors and schools by zone~~ | — | **Partly resolved 2026-11-03**: LODES 2023 jobs by workplace block, OSM off-street parking with UC's published total, CDE schools by zone (In hand; SOURCE_NOTES WP1–WP9). Still missing: where visitors park, UC parking by permit type and occupancy today, the Lab's lot capacities from the Lab, private school locations | Weekday daytime demand; used by the opt-in "by workplace" placement |
| Freeway detector counts (I-80, I-580, CA-24) | 5-min volumes and speeds | Caltrans PeMS (account required; not registered, WP13) | Checking the Time Study's through traffic and the freeway background load |
| ~~Traffic diverters, traffic circles, bollards, gates~~ | GeoJSON points | **Resolved 2026-11-01**: City layer "Existing Traffic Calming Devices" (`data/raw/city/traffic_calming.geojson`, edited 2025-10-28; 75 diverters, 63 circles, 1 gate) is the list of record; each diverter's shape comes from OpenStreetMap (`data/raw/osm/east-bay-roads.json`, `diverter-surroundings.json`). Applied: 32 closures, 13 node splits, 17 one-way pieces, 13 left open; 9 more OSM barrier closures; 127 circle nodes (SOURCE_NOTES O2–O7, G6) | Network topology: the study treats diverters as closed links and circles at about 900 veh/h |
| ~~Leave Early Zones~~ | — | **Resolved 2026-11-01**: City web page lists them as Genasys zones BER-006, 007, 008, 015, 016, 017, 030, 031, 057, 058 (SOURCE_NOTES W1) | Early-departure policy by real zone |
| Recent fuel mitigation projects (vegetation treatments by year and place) | Polygons | City vegetation program, CAL FIRE, EBRPD | A vegetation intervention. *(Fuel classes: in hand, LANDFIRE 2025 FBFM40, opt-in; LANDFIRE does not map fuel between homes, NB1)* |
| Building footprints, plus roof or hardening category in aggregate | GeoJSON polygons | **Partly found 2026-11-03**: City `Distance_between_structures_in_Fire_Zones_2_and_3_WFL1` has 7,706 Fire Zone 2–3 footprints with distance to the nearest structure (SOURCE_NOTES PH1; keep per-cell counts only, the layer carries owner and demographic fields). **Used 2026-11-03** as per-cell counts in `data/model/structures.json` (PH10); its `NEAR_DIST` reads about 27% high, so gaps are measured from the geometry. Still missing: footprints elsewhere (Microsoft/Overture unchecked) and any hardening category | Structures exposed and lost; structure-to-structure spread; home-hardening intervention (`docs/design/phase-3.md`) |
| Curb inventory: red curbs, seasonal and Red Flag restrictions, enforcement rules | GeoJSON lines | City Public Works / Transportation | Real parking state per segment; targeted-restriction costs and resident impacts |
| Stairways and pedestrian paths with steps, length and rise; which homes they serve | GeoJSON lines + attributes | City (Berkeley Path Wanderers maps exist); field survey | Home-to-street access time; households behind stairs (Phase 2) |
| ~~Household distributions at block-group level: size, vehicles, mobility or assistance need~~ | CSV by block group | **Resolved 2026-11-03** for size, vehicles, age and ambulatory difficulty (ACS 2020–2024, `data/model/demand-by-zone.json`, SOURCE_NOTES DM1–DM9). Still missing: who needs a pickup by zone (emPOWER is by ZIP and Medicare only; a City registry, if any, is not public) and facility occupancy (capacity is in hand) | Opt-in household mix by place; assisted evacuation (`docs/design/assisted-evacuation.md`) |
| ADU permits by zone or block (counts only), and residents/vehicles per unit as ranges | CSV by zone or block | Housing Element Annual Progress Report parcel lists (tally by zone, keep no addresses), City `New_Building_Permits` layers | **Partly resolved 2026-11-01**: future-growth settings use the Time Study's Hillside Overlay totals (870 middle-housing units; 27,060 maximum ADU/JADU units; Table 10-11) and citywide APR permit counts (95–123 ADUs a year, 2021–2025) for the moderate case (SOURCE_NOTES E26, L9). A hills-only permit rate would replace the moderate assumption |
| Hillside Overlay boundary (BMC zoning overlay "H") | GeoJSON polygon | City Planning | Where the Time Study's ADU units can go. None found in the City's ArcGIS organization (`BZO_hillzone` and `HFZ_shp` are Fire Zones 1–3), so growth uses Fire Zones 2–3 |
| Fire apparatus dimensions and access standards | Table | Berkeley Fire Dept. | Engine width is now sourced (9.25 ft, SB 99 report); still needed: turning requirements and BFD's view of passable widths |
| Fire progression maps by hour (1991, 1923) | Polygons by time | Oakland Fire Department, CAL FIRE, NIST | Checking the overlay's footprint at 1 h and 2 h, not only its final area and the spread figures in USFA-TR-060 and NFPA. *(Final perimeters and the documented timeline: in hand, 2026-11-03)* |
| ~~Street network beyond Berkeley~~ | — | **Resolved 2026-11-01** with OpenStreetMap, Genasys zone outlines and 2020 Census blocks (SOURCE_NOTES X1–X11). Still missing: measured widths outside Berkeley, and anything beyond the elevation grid (north Kensington, Oakland south of about 37.84° N) | Routes across the city line; neighbors' traffic |
| Fire Department staffing: on-duty crews per shift, callback policy, where off-duty members live (aggregate), mutual-aid arrival times | Tables | BFD Standards of Coverage, BFD | Shorthanded-department scenarios (Eric, 2026-11-01) |
| Traffic counts, signal timing, intersection control | Tables | City Transportation, KLD inputs | Intersection capacities (now one value per road class) |
| Costs: road widening, secondary egress, buyouts, vegetation, enforcement | Tables with ranges | City CIP, Fire Dept., comparable projects | Phase 2 budget and intervention costs |

## Transformations recorded

- All geometry is projected to UTM 10N (EPSG:32610) and shifted so (0, 0) = DEM
  (xmin, ymin). Lengths, widths and grades are never computed in lon/lat.
- County ↔ City segment match: same street name preferred; mean distance of points at 25,
  50 and 75% along the segment ≤ 12 m (≤ 8 m for narrow roads).
- DEM: nearest 4 m overview pixel per cell, Alameda 2021 first, NoCAL 2018 for gaps.
  84,283 cells (1.6%) are open Bay with no data.
- The FT/TF direction meaning was checked against the right-hand rule on 100 divided-street
  pairs; 97 agree.
- Access-constrained areas (`data/model/access-constraints.json`, derived, 2026-11-01): built by
  `tools/access-constraints.mjs` from `network.json`, `layers.json`, the DEM and `assumptions.json`,
  at street-segment level (no parcels). Text of the SB 99 report's Table 1 is parsed from
  `data/raw/docs/sb99.txt` for the comparison. Still missing for egress and retreat options:
  parcel geometry without owner fields (count of parcels a new connection would cross), housing
  units by Census block in aggregate, and cost ranges for road building, acquisition and buyouts.
