# Fire overlay: LANDFIRE fuel, ember zones, the 1923 and 1991 presets, and wind

Written 2026-11-03 from `node tools/fetch-fuel.mjs`, `node tools/fire-validation.mjs fire 3`, `node tools/fire-validation.mjs sim 3 --workers 1` and `node tools/wind-events.mjs`; numbers in `data/terrain/fbfm40.json`, `data/model/fire-validation.json` and `data/model/wind-red-flag.json`; sources in SOURCE_NOTES FV1–FV16. The fire overlay is illustrative and the simulator is an educational comparison tool, not a prediction and not an official evacuation plan. "People still there when embers arrived" counts synthetic people at that moment; it is not a casualty count. Nothing here changes a default: the LANDFIRE fuel is an opt-in setting, and the labels and severities are the maintainer's call.

## Findings

1. **LANDFIRE fuel slows every fire, most at low and medium severity.** With FBFM40 in place of the fire-zone proxy, the area burned in the first 2 hours at medium severity falls by 32–64% (north hills 0.54 → 0.19 km², east wind 0.48 → 0.27, 1923 repeat 0.51 → 0.34, Panoramic Hill 0.45 → 0.31), and people still there when embers arrived fall by 9–60% (median of seeds 1–3). At high severity the change is −1% to −18%. The cause is the fuel at and around the starting points: three of the four start in timber litter (TL5, TL6), whose Rothermel spread rate is a third to two fifths of the area's wildland mean.
2. **With LANDFIRE fuel the 1923 repeat lands closer to the City's timing.** At medium severity the fire reaches the 1923 entry point in 77–157 min (proxy: 54–116; StoryMap: about 150) and the west end of the 1923 footprint at Shattuck in 250–329 min (proxy: 220–285; StoryMap: about 300).
3. **"Like 1991" (high severity) matches the first hour of 1991 on distance and overshoots it after.** Run from the 1991 origin, high severity is 2.6–2.9 km downwind at 64 min against the record's "more than a mile" (1.6 km) and the NFPA's 1.67 m/s (about 6 km/h); its area at 35 min, 0.28–0.32 km², is under the record's "more than 100 acres" (0.40 km²). It then keeps going: 3.1–3.2 km² at 2 h and 4.9–5.8 km² at 4 h, against a 1991 head that advanced "only three quarters of a mile in the next seven hours". Medium severity is too slow for 1991 (1.3–1.5 km at 64 min, 0.05–0.06 km² at 35 min).
4. **The overlay's ember exposure does not match the County's Ember Threat Zones, and it does follow the City's 2025 hazard zones.** Across the four fires the share of runs that bring embers to a cell is weakly *negatively* rank-correlated with XyloPlan's north-east ember risk (Spearman −0.20 at medium severity; −0.03 over the cells any run reaches). By the City's zones it ranks as the City does: Very High 0.24, High 0.18, the rest of Berkeley 0.05.
5. **The fire families' winds fit Red Flag days at the ridge.** On the 203 days with a Red Flag Warning for the East Bay Hills (72 warnings, 2008–2026), the Oakland North weather station's hours with mean wind of 15 mph or more blew from 20–40° in 27%, 40–50° in 22% and 50–70° in 29%, close to an even split across the 30°, 45° and 60° members. North winds (340–20°), 19% of those hours, have no member. Oakland airport, on the shore, saw offshore wind in only 23% of its non-calm Red Flag hours.

## 1. LANDFIRE fuel on the fire grid

**Data (sourced).** LANDFIRE 2025 (LF2025) FBFM40, the 40 Scott and Burgan fire behavior fuel models, CONUS, from the LANDFIRE image service `LF2025_FBFM40_CONUS` (lfps.usgs.gov), retrieved 2026-11-03, public domain. `exportImage` returned it in EPSG:32610 on exactly the fire grid's 354 × 262 cells of 30 m (nearest-neighbor resampling by the server from LANDFIRE's 30 m Albers grid; the GeoTIFF's tie point and pixel size are checked against the grid). Stored as one byte per cell in `data/terrain/fbfm40.u8` (rows south to north), with source, counts and the factor table in `fbfm40.json`. The Product Service's job API (`/api/job/submit`) now requires an email address, so the image service was used instead; no personal data was sent.

**Classes in the model area** (cells of 30 m): NB1 urban or suburban 51,012; NB8 water 14,464; TL3 5,277; TL6 4,107; GS3 3,215; TL5 3,160; GR2 2,338; GS2 1,826; GS1 1,711; TU2 1,415; SH5 1,113; 15 other classes under 1,000 each. Of the proxy's wildland cells, 19.6% are NB1 (homes along the ridge) and the rest mostly TL6, TL5, GS3, TL3, GR2 (7.6–12.3% each). Of its hill-residential cells, 62.6% are NB1 and 16.0% TL3.

**Spread factor (model rule).** Each burnable model's factor is its Rothermel (1972) head-fire rate on flat ground at Scott and Burgan's moisture scenario D2L2 (dead 6/7/8%, live herbaceous 60%, live woody 90%) and 5 mi/h midflame wind, from their Table 7 parameters, divided by the mean rate over the 18,604 burnable cells the proxy rates 1.0 (15.7 ft/min), and capped at 3. The proxy's wildland cells keep a mean factor of 0.95, so the severities' head rates keep their meaning. Examples: GR2 2.07, SH5 3 (capped from 4.0), GS3 1.40, GS2 1.02, TU2 0.86, TL6 0.42, TL5 0.32, TL3 0.12. Nonburnable: NB1 keeps the cell's proxy factor, because LANDFIRE maps no fuel between homes and the proxy is the simulator's only stand-in for spread through neighborhoods; NB3, NB8 and NB9 get 0; cells the elevation grid marks as water stay 0. Wind and slope effects stay the simulator's. Ember throw and landing keep the proxy factor, so the setting changes only how fast the front crosses each cell.

**Check of the implementation.** For all 40 models the computed characteristic surface-area-to-volume ratio and packing ratio match the values printed on Scott and Burgan's fuel model pages within 0.3% (GS4's SAV within 2.6%). Against Anderson's models 1, 2, 8 and 10 at the crosswalk condition (D2L2, 5 mi/h), 9 of 14 of Scott and Burgan's adjective comparisons (pp. 13–15) fall in the stated class and the other 5 one class away (for example GR2 against model 2: −27%, "comparable" is 0–15%).

**Limits.** The factor is a surface-fire rate in moderate wind. In the 1991 fire, eucalyptus and Monterey pine crowned and threw embers ("crowning in the trees at the top of the hill", USFA-TR-060 PDF p. 29), which a litter model (TL) rates as slow. At higher wind the gap between grass and litter widens. LANDFIRE's canopy layers (CBH, CBD) would be the next step for crown fire; they are not used.

**Setting.** Expert view → Scenario → "Fuel (both plans)": "Fire-zone proxy (today)" (default) or "LANDFIRE FBFM40". It joins the run's `world` only when set, so default runs, job keys and caches are unchanged; Simple view always uses the proxy.

## 2. Proxy against LANDFIRE on today's fires

Each fire at its usual start, today's plan, the fire's own time of day, low/medium/high × seeds 1–3 (72 simulator runs, one process). Medians over seeds; km² burned; people as defined above.

| Fire · severity | Burned by 2 h, proxy → LANDFIRE | Burned, whole run | Overlap (IoU) | Still there when embers arrived | Still there when the front arrived |
|---|---|---|---|---|---|
| 1923 repeat · low | 0.12 → 0.07 | 0.75 → 0.58 | 0.68 | 211 → 119 (−44%) | 71 → 21 |
| 1923 repeat · medium | 0.51 → 0.34 | 1.77 → 1.68 | 0.95 | 5,496 → 3,694 (−33%) | 571 → 313 |
| 1923 repeat · high | 1.57 → 1.33 | 1.80 → 1.80 | 1.00 | 33,497 → 30,356 (−9%) | 4,908 → 3,511 |
| East wind · low | 0.12 → 0.06 | 0.40 → 0.22 | 0.59 | 116 → 46 (−60%) | 14 → 2 |
| East wind · medium | 0.48 → 0.27 | 1.36 → 1.02 | 0.74 | 5,641 → 2,329 (−59%) | 228 → 100 |
| East wind · high | 1.63 → 1.39 | 3.76 → 3.41 | 0.86 | 40,585 → 40,027 (−1%) | 6,844 → 6,166 |
| Panoramic Hill · low | 0.15 → 0.08 | 0.43 → 0.30 | 0.67 | 1,301 → 813 (−38%) | 237 → 26 |
| Panoramic Hill · medium | 0.45 → 0.31 | 1.08 → 0.97 | 0.79 | 13,286 → 12,151 (−9%) | 3,772 → 3,140 |
| Panoramic Hill · high | 1.22 → 1.02 | 3.20 → 2.92 | 0.79 | 43,274 → 38,400 (−11%) | 14,263 → 12,687 |
| North hills · low | 0.15 → 0.03 | 0.48 → 0.16 | 0.31 | 116 → 9 (−92%) | 21 → 0 |
| North hills · medium | 0.54 → 0.19 | 1.76 → 1.00 | 0.59 | 3,681 → 1,454 (−60%) | 320 → 62 |
| North hills · high | 2.12 → 1.72 | 5.17 → 4.30 | 0.77 | 28,065 → 23,045 (−18%) | 6,574 → 3,919 |

The 90% clearance time barely moves except at high severity on the 1923 repeat (148–149 → 132–141 min) and the north hills (99–103 → 93–95), where a slower fire cuts fewer roads. Starting cells: the 1923 repeat and the east-wind fire start in TL5 (factor 0.32), the north-hills fire in TL6 (0.42), Panoramic Hill in NB1 (proxy 0.7). Within about 500 m of each start, over cells the proxy rates 0.7 or more, the mean factor is 0.73–0.84 against the proxy's 1.0, except at Panoramic Hill (0.71 against 1.0). Of the family members' other starts, Fish Ranch Rd, Claremont Ave, Lake Anza and Centennial Dr all sit on NB1 cells, which keep the proxy's 1.0.

A comparison that ran the plans under LANDFIRE fuel would see a slower, smaller fire; the medium severity's calibration to the StoryMap (S11) was made with the proxy. Turning the setting on by default, or recalibrating medium severity under it, is the maintainer's decision.

## 3. Ember exposure against the Ember Threat Zones and the 2025 FHSZ

**Layers.** City `Ember_Threat_Zones` ("Ember Threat Zones for Alameda County - Data provided by XyloPlan", last edited 2025-03-12): 12,305 polygons with `ne_ember_risk_max` and `sw_ember_risk_max` and a building count. City `CAL_FIRE_and_Berkeley_FHSZ_2025` (last edited 2026-01-12): the City's Very High and High Fire Hazard Severity Zones (one polygon each) and CAL FIRE's LRA classes from the map of 2025-03-24. Both refetched with `node tools/fetch-city-layers.mjs` (134 MB and 102 MB, gitignored); only statistics are kept.

**Method.** For each 30 m cell, the share of fire runs (four fires at their usual start, seeds 1–3; medium severity alone, 12 runs, or all three severities, 36) in which the cell is ember-exposed during the run, rasterized against each layer at cell centers. 7,853 land cells fall in an Ember Threat Zone polygon with a north-east value.

**Ember Threat Zones (north-east scenario), medium severity, proxy fuel.**

| NE ember risk quintile | Range | Cells | Mean share of runs exposed | Cells exposed in half the runs or more |
|---|---|---|---|---|
| 1 | 0–0.08 | 1,549 | 0.15 | 11% |
| 2 | 0.08–0.97 | 1,585 | 0.16 | 13% |
| 3 | 0.97–6.3 | 1,525 | 0.16 | 16% |
| 4 | 6.3–30 | 1,604 | 0.11 | 3% |
| 5 | 30–638 | 1,590 | 0.06 | 0.5% |

Spearman rank correlation over cells −0.20 (all severities −0.22; LANDFIRE −0.18 and −0.23); within the proxy's hill classes −0.16; over the 3,470 cells any run reaches −0.03. By evacuation zone (74 zones with 20 or more cells): −0.28, and 3 of the 19 zones in the top quarter by ember risk are in the top quarter by modeled exposure. Of the top quintile's cells, 56% lie in the proxy's hill classes, so the mismatch is about where in the hills, not hills against flats. XyloPlan modeled many ignition lines along "the fastest routes fire will take" (SOURCE_NOTES FF1–FF2); the overlay has four starting points, so the two answer different questions. Running every fire family member would be the closer comparison; it was not done.

**2025 Fire Hazard Severity Zones.** Mean share of medium-severity runs that bring embers: City Very High 0.24 (0.34 km² on the grid), City High 0.18 (7.5 km²), the rest of Berkeley's land 0.05 (19.3 km²). With LANDFIRE: 0.24, 0.16, 0.045. The CAL FIRE LRA classes on the grid (Moderate 3.2 km², High 5.2, Very High 2.8, NonWildland 19.1) lie mostly in Oakland, Albany and Kensington, where the four fires rarely go; their shares are 0.03 or less and say little.

## 4. The presets against the record

### "Like 1923" (medium severity, the City's repeat)

Punch item 9 in HANDOFF (38–108 min to the 1923 entry point) predates later model changes. Today, seeds 1–3, earliest arrival near the north-east vertex of the 1923 footprint (the 1923 entry point) and at the footprint's west end (Shattuck, 1,074 m west of the entry point):

| Fuel · severity | To the 1923 entry point (min) | To Shattuck (min) |
|---|---|---|
| Proxy · medium | 104, 116, 54 | 264, 285, 220 |
| LANDFIRE · medium | 140, 157, 77 | 303, 329, 250 |
| Proxy · high | 28, 52, 58 | 113, 82, 91 |
| StoryMap §3.2 (S11) | about 150 | about 300 |
| 1923 record (S10) | entry at about 2:00 p.m. | Shattuck by about 4:20 p.m.: 1.3 km of buildings in 2.5 h |

The proxy's medium fire reaches the entry point early on every seed and Shattuck on time or early; LANDFIRE's reaches the entry point on time on two seeds and Shattuck within 50 min of 300 on every seed. Between the entry point and Shattuck the model's medium fire covers 1.07 km in 160–170 min (proxy) or 163–173 min (LANDFIRE), about 6.5 m/min, slower than the 1923 rate through buildings (1.3 km in 2.5 h, about 9 m/min).

### "Like 1991" (high severity)

**Record.** The flare-up at 10:58 a.m. on October 20, 1991 (USFA-TR-060 PDF p. 29) was "involving more than 100 acres of trees, brush, and houses" at 11:33 (PDF p. 34); "Just 64 minutes after the fire broke out, it was burning in the Rockridge district, more than a mile downwind" (PDF p. 55); it spread "more than a mile in the first hour", and then "the head of the fire advanced only three quarters of a mile in the next seven hours" in Rockridge and Forest Park (PDF p. 59); the wind abated about 7:30 p.m. (PDF p. 52). The NFPA's report for the National Wildland/Urban Interface Fire Protection Initiative gives "790 structures within the first hour" and a spread of "about 1.67 meters per second" (PDF p. 11). Final area: 1,622.8 GIS acres in CAL FIRE FRAP (6.57 km², 5.98 km² of it on the fire grid, which ends at about 37.840° N); "1,500 acres" (USFA, PDF p. 12), "over 1,600 acres" (NFPA, PDF p. 3), 1,828 GIS acres in EBRPD's research polygon.

**Model.** An analysis fire only: start at 37.8625 N, 122.2205 W, between the east ends of Buckingham Blvd and Marlborough Terrace (our placement from USFA's account of the origin, about ±300 m), wind 30 mph from 30°, 45° or 60°, no clip, seeds 1–3, medians.

| Fuel · severity · wind | Burned at 35 min (km²) | Downwind at 64 min (m) | Burned at 2 h | Burned at 4 h | Share of the 1991 perimeter burned by 4 h | Share of the model fire inside it at 4 h |
|---|---|---|---|---|---|---|
| Proxy · high · 30° | 0.28 | 2,791 | 3.24 | 4.94 | 66% | 79% |
| Proxy · high · 45° | 0.31 | 2,930 | 3.22 | 5.85 | 56% | 59% |
| Proxy · high · 60° | 0.32 | 2,587 | 3.08 | 5.81 | 44% | 46% |
| LANDFIRE · high · 45° | 0.35 | 2,760 | 3.01 | 6.41 | 68% | 63% |
| Proxy · medium · 45° | 0.06 | 1,488 | 0.93 | 2.59 | 36% | 82% |
| Record | > 0.40 | > 1,609 | — | final 6.57 (8.5 h) | — | — |

High severity is right on the order of the first hour and fast on distance (1.6–1.8 times "more than a mile"), short on the area at 35 min, and has no slowdown after the first hour: by 2 h it has burned about half of the final 1991 area, and by 4 h it runs past the perimeter's south and west sides, where the 1991 head stalled. The 30° wind fits the perimeter best. USFA explains the slowdown by the "densely built-up" neighborhoods and the wind; the simulator models neither crews holding the fire nor a wind change (FS15), which the page already says.

**Recommendation (report only).** "Like 1991" is defensible for the first hour, the part that drives who is still home when embers arrive, and should say so: it matches 1991's first-hour pace and is faster than 1991 after it. Medium severity should not carry a 1991 comparison. If the maintainer wants the 1991 label to hold for the whole run, the record supports a head rate that falls after the first hour; that is a model change, not a retune of the severities. With LANDFIRE fuel on, "Like 1923" fits the StoryMap better on both timing marks; adopting it would mean rechecking the Simple-view questions (P19 rule) and the families' clip shares (FF17).

## 5. Wind on Red Flag days

**Data.** NWS San Francisco Bay Area (MTR) Red Flag Warnings whose zones include "East Bay Hills", from the Iowa Environmental Mesonet VTEC archive: 72 warnings, 2008-06-11 to 2026-06-11, covering 203 local days (the archive names that zone from 2008; earlier warnings carry unnamed zone codes). Oakland North RAWS (COKN, ridge top above Gwin Canyon, 1,403 ft; 10-minute mean at 20 ft), hourly, on those days, from the WRCC frequency tool (day granularity: a warning covering part of a day counts the whole day). Oakland airport ASOS (OAK, on the shore; 2-minute mean at 10 m), routine hourly reports inside each warning's exact window.

**Oakland North on Red Flag days.** 4,658 hours; 737 with mean wind of 15 mph or more. Direction of those 737 hours (from): 0–20° 12.3%, 20–40° 27.3%, 40–50° 22.1%, 50–70° 28.9% (20–70° 78.3%), 70–90° 0.7%, 340–360° 6.6%, south-west to west 0.9%; median in the 40–50° bin. All 4,658 hours: 0–90° 41.9%, 150–240° 30.5%, 240–300° 15.3% (onshore hours on the same days, including summer lightning warnings). Speed of the 1,956 offshore hours (0–90°): 15 mph or more 34%, 25 or more 4.1%, 30 or more 0.8%, highest bin 35–40 mph (1 hour).

**Oakland airport in the same windows.** 2,761 hours, 610 calm; of the rest, 22.7% from 0–90°, 25.2% from 240–300°. Offshore hours of 15 mph or more: 56 in the warnings, 345 in all 164,560 hours of 2008–2026. The shore station mostly misses the offshore wind the ridge sees, so it is a poor guide to fire wind in the hills.

**Against the families.** The 30°, 45° and 60° members stand for roughly equal parts of strong Red Flag hours at the ridge (20–40°, 40–50°, 50–70°: 27%, 22%, 29%), consistent with counting them equally (FF15–FF16 had no source for weights). North winds of 340–20° hold 19% of those hours and have no member; 70–90° holds 0.7%, consistent with moving the east-wind fire off 75° (P32). The fires' 30–35 mph sits in the top 1% of offshore hours on Red Flag days, as FF5 found for all dry offshore hours; in the model, length-to-breadth stops changing above about 18 mph, so the speed matters less than the direction. A 15° member (north-north-east) would cover the north winds; adding one is the maintainer's decision.

## What was not done

- No hourly progression map of 1991 or 1923 was found; the comparison uses the timeline in USFA-TR-060 and the NFPA report, and final perimeters. No NIST report on the 1991 fire turned up in a web search.
- The RAWS record at Oakland North starts in June 1992, after the 1991 fire; neither fire's wind is from a station record.
- The Ember Threat Zone comparison uses the four fires at their usual start, not every family member.
