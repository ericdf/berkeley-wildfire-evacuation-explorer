# Berkeley Hills Wildfire Evacuation: Scenario Explorer (Phase 1 prototype)

A browser simulator for exploring Berkeley's wildfire evacuation tradeoffs. Choose a fire
scenario and an operating plan, run it on Berkeley's real street network and terrain,
and compare two plans against identical fires and synthetic households.

**This is an educational comparison tool. It is not a calibrated fire or traffic model,
not an official evacuation plan, and must not guide real evacuation decisions.**
For official information see the City's
[Fire Weather and Evacuation page](https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation).

The design brief is `specfication.md`. What is still missing is listed in `DATA_INVENTORY.md`. Every insight taken from a document (the City's 2025 Evacuation Time Study, SB 99 and AB 747 reports, StoryMap), with page references and what we did with it, is in `SOURCE_NOTES.md`.

## Run it

No build step or dependencies. The simulator is plain ES modules and needs a local web server
(browsers block `fetch` from `file://`):

```sh
cd berkeley-wildfire-simulator
python3 tools/serve.py
# open http://127.0.0.1:8766
```

Use `127.0.0.1` rather than `localhost`: if another server is listening on the same port
over IPv6, `localhost` may reach that one instead.

Loading takes a few seconds: about 10 MB of terrain and 2 MB of street network.

## Playing

**Simple view** (the default) offers three fires and four questions (`js/presets.js`). The
fires are the east-wind fire near Grizzly Peak Blvd (all of Fire Zones 2–3 ordered), the 1923
fire repeated today, and Panoramic Hill. The chosen fire applies to every question and is
remembered across visits. A question is offered on a fire only where Plan B beat Plan A on its
headline measure in all 15 same-seed test runs (low, central and high severity, seeds 1–5) and
the central-severity median changed by 5% or more; elsewhere it is shown switched off with the
reason (SOURCE_NOTES P19–P22). "Weekday midday or night" is offered only on the east-wind fire.
Each question's "What to look for" gives that fire's central-severity medians. Watch plays one
plan on the map; Compare runs both on 9 fires (3 severities × 3 seeds) and states how often B won.

**Expert view** opens every control:

1. **Scenario.** Pick a preset, a severity (low / central / high) and a random seed.
   Time of day changes who is home and how much background traffic there is.
   Future growth (Expert view) adds homes in the hills for both plans: none, the 2025
   Evacuation Time Study's middle-housing case (870 units) or maximum ADU build-out (27,060),
   or a moderate case (2,706, an assumption).
2. **Operating plan.** Plan A and Plan B are edited in tabs: when zones are ordered,
   how long detection and the decision take, whether all hill zones are ordered at once,
   early departure on Red Flag days (from the City's Leave Early Zones, or all of Fire Zones 2–3),
   parking on hill streets, and R0: no added units in the Leave Early Zones, Fire Zones 2–3
   or access-constrained areas, shown with its legal status.
3. **Run.** Watch the fire, embers, vehicles, queues and the fire-engine route. Drag the
   slider to jump to a time. Click a street or zone to inspect it; hover a badge (ⓘ)
   to see where each value comes from.
4. **Compare.** Runs both plans on the same fires and households, either across
   low/central/high severity or across all four scenarios, with three seeds each. The table
   shows the median and the min–max range. A plan that wins in one run but not across
   the range has not been shown to be robust.

### Reading the results

- **People still there when embers arrived** counts people at home or on the road when
  embers first reached their street, split into four groups: still home with a car, on the
  road, without a vehicle, and in zones that never got an order. A good average can hide
  any one of them. **…when the fire front arrived** counts those still there when the fire
  itself reached the street. Neither is a count of deaths or injuries: the simulator does not
  model house survival, sheltering, fire intensity or smoke.
- **Clearance** is reported at 50%, 90% and 100% of evacuating vehicles, plus the time
  the last household with a car reaches safety. No single average is shown.
- **No vehicle: not moved in Phase 1.** Households without a car stay put and are
  counted as at risk. Phase 2 adds transport assistance.
- **Fire-engine travel** is responder ingress, which is modeled separately from resident
  egress. "Blocked by parked cars" means no route to the fire edge has an engine's width
  of clear road under that plan's parking rules.
- **Event log** explains the results, e.g. "Early departure: 2,896 households left
  before the fire…", "Queue of 109 vehicles waiting at Shattuck Av / Bancroft Wy",
  "Engines cannot reach the fire edge near Summit Rd: parked cars leave less than an
  engine's width on Summit Rd."

## How the simulation works

Every number is visible in **Assumptions & limits** in the app and in `data/assumptions.json`.

**Street network** (`tools/build-network.mjs`). The County street centerlines are projected
to UTM 10N meters. Segment endpoints are snapped into intersections (1 m tolerance).
Paths, walks and steps become a separate pedestrian layer. Each segment is matched by
name and distance to the City's centerline and narrow-roads layers, which supply
pavement width (84% of Berkeley's vehicle segments) and lane counts. Grade is sampled from the DEM
every 4 m. Lanes, parking, speeds and capacities that the data does not give come from
`data/assumptions.json`.

Outside Berkeley the streets come from OpenStreetMap (Oakland about 1 km south of the city
line, Emeryville, Albany, Kensington, El Cerrito and Richmond, up to the edge of the
elevation grid). OSM streets end where they meet a County street and are joined to the
nearest County dead end (one-way direction and freeway/street kind must match). Lanes and
speed limits come from OSM tags where present; widths are assumed from Berkeley's median
width for the same road class in the hills or flats. Outside Berkeley a street at 90 m
elevation or higher follows the hill rules (one lane each way, hill speeds and parking).
Streets cut at the edge of the grid are the exits: traffic that reaches one has left.

**Parked cars and clear width** (`js/parking.js`). Clear width is pavement width minus 8 ft
per parked side (the value KLD used for the City's SB 99 and AB 747 analyses). Parking varies
by block and by seed: hill blocks are parked on neither side, one side or both (shares from
City aerial counts of 22 hill blocks), some cars sit partly off the pavement, and an
occasional bad parking job (a wide vehicle or a car far from the curb) narrows the gap.
Residents stop parking where less than 8 ft would remain for a car. The City's Narrow_Roads
"width with parking" assumes perfect parking on both sides, so it is treated as that case,
not as a measurement. Plan A and Plan B see the same parked cars for the same seed.

A clear width of 20 ft fits two moving lanes; 10 ft fits one. On a two-way street with one
lane, both directions share it: when cars come from both ways they take turns at gaps such
as driveways and the street loses capacity. Under 10 ft, a fire engine cannot get through
(the City's largest truck is 9.25 ft wide). In the hills the median pavement width is
7.3 m (24 ft).

**Fire and embers** (`js/fire.js`). An illustrative overlay on 30 m cells. A shortest-time
search spreads fire from the ignition, using wind (an elliptical shape), slope, and a
proxy fuel factor taken from the City fire zones. Random spot fires mean different seeds
give different footprints. A cell is ember-exposed once anything burns within the ember
distance upwind of it. The overlay puts plausible, comparable pressure on the evacuation;
it does not predict how a real fire would behave.

**Evacuation** (`js/sim.js`). Synthetic households are placed on streets from Genasys zone
population estimates. Zones outside Berkeley take their outlines from Genasys Protect and,
where the City layer has no estimate, their population from 2020 Census blocks; only people
inside the model area are placed (about 74,700 outside Berkeley). Household size, vehicle ownership, ridesharing, compliance
(100% of Order zones, 50% of Warning zones, 20% shadow, which the study applies to Berkeley
and to a Shadow Region around it) and departure times come from the 2025 Evacuation Time Study.
Shadow evacuees drive out of the model area. Orders and warnings use the study's zone lists. Evacuation time is
measured as the study's ETE, from the first order. Directed links have a capacity and
storage, and every intersection has a capacity. The 2025 study named intersections
as the main constraint. Vehicles may use every street and re-route every minute around
queues, fire and embers toward the nearest node outside every ordered zone and the ember
area. Households waiting for a commuter (Time Study) wait for that person to drive home
first, against the outbound traffic; a commuter turned back by fire leaves the household one
car short. A vehicle stuck 3 minutes at the head of a queue squeezes forward, so the queue
model cannot lock up for good (as it did at the Marin traffic circle).

**Future growth and R0.** The growth setting (`growth` in `data/assumptions.json`) adds the
Time Study's Hillside Overlay units (§10.5, Table 10-11) as more synthetic households, drawn
like today's (2.37 persons; about 1.12 vehicles per unit against the study's 1.14). The study
gives no split by street, so units go to Berkeley's Fire Zones 2–3, standing in for the
Hillside Overlay, in proportion to each street's share of today's households (an
assumption). Where they go depends on the seed only, and each unit draws from its own seeded
stream, so both plans see the same added homes and today's households are unchanged, except
that a carless household with no neighbor to ride with today can ride with an added one (it
draws from a stream of its own, so the shared stream and the non-resident vehicles stay the
same under every growth and R0 setting). The
plan setting R0 drops the units on streets in its area and moves none elsewhere. Fire Zones
2–3 hold all the modeled growth, so R0 there equals no growth; the Leave Early Zones hold
about 29% of it and access-constrained areas about 11% (areas from
`data/model/access-constraints.json`, written by `tools/access-constraints.mjs`; the option
stays disabled until that file exists). Parked cars do not increase with growth.

**Diverters and traffic circles.** The list of record is the City's "Existing Traffic
Calming Devices" layer (edited 2025-10-28: 75 diverters, 63 circles, 1 gate). The City gives
only a point, so the builder reads each diverter's shape from OpenStreetMap: at each junction it
tests which streets OSM lets a car drive between. Of the 75, 32 close one street at the junction,
13 split the junction in two (the diagonal diverters at Piedmont Av and Derby St, where Derby west
joins Piedmont north and Derby east joins Piedmont south, and at Piedmont Av and Parker St), 17
make a 15 m piece one-way (Forest Av at College Av: out only), and 13 stay open (6 show no
restriction in OSM, 1 bans only turns, which the simulator does not model, 2 could not be placed,
4 would cut streets off or leave cars on one-way streets with no way out). A closure detaches the
street at the barrier, so each block stays reachable from its open end. OSM bollards, gates and
blocks away from the City's points close 9 more streets; a barrier counts only on a street of the
same name, and one within 20 m of a dead end is skipped. Beyond the Panoramic Way gate in Oakland
(`vehicle=no`), upper Panoramic Way is closed to residents' cars. Engines get through gates and
crossings OSM tags `emergency=yes` after 3 minutes (✕ on the map; purple where engines pass).
`meta.barrierSites` in `network.json` lists every device and what the network does there.
Junctions at the City's 63 circles and inside OSM roundabouts pass at most 900 vehicles per hour
(Time Study).

**Parking and the 2025 study.** On a two-way street, removing parking opens the oncoming
lane. It does not create a second evacuating lane. Evacuation traffic runs mostly one way, so
taking turns rarely binds. In this model, parking restrictions therefore change engine access
far more than evacuation flow. The plan options include cheaper ones than a ban: parking on
one side only, or enforcing parking tight to the curb. That matches the City's 2025
finding that broad restrictions are unlikely to improve evacuation flow. The simulator does not
add any parking-removal bonus.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page and styles |
| `js/main.js` | UI: controls, results, inspector, comparison, modals |
| `js/map.js`, `js/terrain.js` | Canvas map, hillshade and contours |
| `js/fire.js`, `js/sim.js`, `js/parking.js`, `js/scenarios.js`, `js/rng.js` | Models and presets |
| `js/presets.js` | Simple view: its fires, questions, per-fire "What to look for" text and the reasons a question is withheld |
| `js/worker.js` | Runs comparison batches off the main thread |
| `js/data.js` | Loads the data files |
| `data/assumptions.json` | **Editable** assumptions and model rules, each with a category and note |
| `data/model/network.json`, `layers.json` | Built by `tools/build-network.mjs` (do not edit by hand) |
| `data/terrain/dem.i16`, `dem.json` | Elevation grid, built by `tools/fetch-dem.mjs` |
| `data/field/` | Field and aerial observations (counts only), e.g. parked cars on 22 hill blocks |
| `data/raw/` | Downloaded source data (reproducible, large; City layers and report PDFs are not in git). `osm/east-bay-roads.json` (OSM streets), `genasys/zones.json` (zone outlines), `census/` (2020 block counts) each have a retrieval note |
| `correspondence/` | Drafts of letters, such as the informal question to Berkeley Fire |
| `tools/` | Data pipeline (Node 18+, no npm packages) |
| `tests/headless.mjs` | Runs every scenario × two plans in Node and prints summaries |
| `tests/calibration.mjs`, `tests/stuck.mjs`, `tests/leftover.mjs` | Compare with the Time Study (fire off); list jammed links; list order-zone vehicles that never leave |
| `tests/growth.mjs` | Future growth and R0 with the fire on, seeds 1–5 (`SOURCE_NOTES.md` R4, R5); `GROWTH=max node tests/calibration.mjs` gives R3 |

## Replacing datasets

Every tool is plain Node (18+) with no dependencies.

```sh
node tools/fetch-dem.mjs           # elevation: USGS 3DEP 1 m lidar DEM (4 m overview), ~1 minute
node tools/fetch-city-layers.mjs   # City of Berkeley ArcGIS Online layers → data/raw/city/
node tools/build-network.mjs       # rebuild data/model/*.json from everything above
node tests/headless.mjs            # sanity-check the models (optionally: low | central | high)
node tests/calibration.mjs         # compare evacuation times with the 2025 Evacuation Time Study (fire off)
```

**Street network.** Replace `data/raw/street-centerlines.geojson` with a GeoJSON
FeatureCollection of LineStrings in EPSG:4326. It needs the County fields `STREET`,
`CLASS`, `SFEATYP` and `TRVLWAY` (B / FT / TF / NT); if your file names them
differently, map them near the top of `build-network.mjs`. Then rebuild.

**Replacing the elevation raster.** `fetch-dem.mjs` writes `data/terrain/dem.i16`, which
is int16 little-endian in decimeters, north row first, -32768 = no data. Alongside it is
`dem.json`, which holds `width`, `height`, `resolution`, `xmin`, `ymin`, `xmax`, `ymax` in
EPSG:32610 plus provenance. To use another DEM, convert it to that format and that grid
(e.g. `gdalwarp -t_srs EPSG:32610 -tr 4 4 -te <xmin ymin xmax ymax>`, then write the
values ×10 as int16). Alternatively, edit `SOURCES` in `fetch-dem.mjs` to point at other
3DEP COG tiles. Then rebuild the network so grades are resampled.

**City layers.** Edit `LAYERS` in `fetch-city-layers.mjs`. Each entry is an ArcGIS
FeatureServer name and layer id. Parcel layers carrying addresses are skipped on purpose.

## Editing assumptions

Edit `data/assumptions.json`. Each value has an entry in `_meta` with its category
(`assumption`, `model rule`, `sourced`) and a note, which the app shows in Assumptions &
limits. Lane, parking and capacity values are applied when the network is built, so run
`node tools/build-network.mjs` after changing them. Demand and access values are read
by the simulator at load time. Scenario presets, severities and time-of-day values are in
`js/scenarios.js`.

## Limits of Phase 1

- No buildings yet, so no structures exposed or lost, and no home-hardening or
  vegetation effects.
- No stair or path access time, and no assisted evacuation (Phase 2).
- Employees, students, visitors and I-80 and CA-24 through traffic come from the Time Study's tables,
  but where they park is approximated by area. Signals and stop signs are not modeled one by
  one: every junction has a typical delay and a capacity by road class. Panoramic Hill matches
  the study's evacuation times; the 1923 and Fire Zones 2–3 regions run about 15 min fast at
  night and 35–80 min fast on weekdays (see `SOURCE_NOTES.md`, calibration). Tuning junction
  capacity to close that gap broke Panoramic Hill, so it is left untuned.
- Streets outside Berkeley come from OpenStreetMap with assumed widths. The model area ends at
  the edge of the elevation grid (37.84–37.91° N, 122.33–122.21° W), about 1 km into Oakland
  and through the middle of Kensington; north Kensington (about 1,500 people) and Oakland
  south of that line are not modeled. Traffic that reaches the edge has left.
- Fire spread, ember distances and spot-fire rates are illustrative model values.
- Future growth: with the Time Study's maximum ADU build-out the simulator's evacuation time
  grows far less than the study's (fire off, fall weekday S4: 1923 region +30% against the
  study's +58%; Panoramic Hill +2% against +25%; Fire Zones 2–3 +3% against +97%), because its junctions pass traffic faster
  than the study's signals and stop signs. Read growth effects on evacuation time as a lower
  bound (`SOURCE_NOTES.md`, "Future growth and R0").
