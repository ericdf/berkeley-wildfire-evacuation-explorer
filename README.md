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
   or a moderate case (2,706, an assumption). A Red Flag power shutoff (Expert view, both plans)
   turns the signals in and next to the hills, or all of them, into all-way stops.
2. **Operating plan.** Plan A and Plan B are edited in tabs: when zones are ordered,
   how long detection and the decision take, whether all hill zones are ordered at once,
   early departure on Red Flag days (from the City's Leave Early Zones, or all of Fire Zones 2–3),
   parking on hill streets, and R0: no added units in the Leave Early Zones, Fire Zones 2–3
   or access-constrained areas, shown with its legal status. Contraflow runs both lanes of the
   main hill exit streets, or streets you choose, outbound, started by officers or by
   pre-installed signs and gates; police control puts officers at pre-timed signals and the Time
   Study's congestion points. Both draw on one pool of officers. All three settings are off by
   default.
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
- **Hill homes an engine can reach within 5 minutes** is the share (and number) of synthetic
  residents of Berkeley's Fire Zones 2–3 whose street a fire engine can reach from the nearest
  of Berkeley's 7 stations within the City's 5-minute standard (SOURCE_NOTES A6), at ignition,
  before traffic and fire, under that plan's parking rules and that seed's parked cars. Model
  rule (SOURCE_NOTES ER1): the engine must reach the nearer end of the home's street segment on
  a route where every segment leaves 10 ft clear and no fixed barrier closes it; the home's own
  segment need not pass. The tooltip adds the residents with no engine route at all and the
  same share later in the run, with traffic and fire. Engines drive at 1.15 times the posted
  speed with no turn or grade delays, so nearly every home with a route is within 5 minutes and
  the measure mostly counts homes that parked cars cut off. It covers Berkeley's zones only
  (stations in Oakland, Kensington and Albany are not modeled) and measures access, not
  firefighting: engines do not fight the fire in this simulator. "Color streets by → Engine
  drive time" maps the same drive times.
- **Event log** explains the results, e.g. "Early departure: 2,896 households left
  before the fire…", "Queue of 109 vehicles waiting at Shattuck Av / Bancroft Wy",
  "Engines cannot reach the fire edge near Summit Rd: parked cars leave less than an
  engine's width on Summit Rd."

## How the simulation works

Every number is visible in **Assumptions & limits** in the app and in `data/assumptions.json`.

**Street network** (`tools/build-network.mjs`). The County street centerlines are projected
to UTM 10N meters. Segment endpoints are snapped into intersections (1 m tolerance).
Paths, walks and steps become a separate pedestrian layer. County records that other sources
show to be miscoded are corrected from a short, labeled list (`network.segmentCorrections` in
`data/assumptions.json`), matched by SEGID; the build stops if a corrected record no longer
holds the County values the correction expects. Two corrections so far, both records the County
file codes as no vehicle travel. The 45 m link from the foot of Panoramic Way to Prospect St,
which the County names "Bancroft Steps Wy": OpenStreetMap maps it as two-way Bancroft Way, the City's street
layers as a 30 ft, two-lane street, and the SB 99 report puts Panoramic Hill's single access point at Panoramic Way
and Prospect St/Canyon Rd (SOURCE_NOTES K1–K6). The Crossways, 67 m from Overlook Rd to
Middlefield Rd: OpenStreetMap, the City's pavement records (21 ft, 2 lanes), the City narrow-roads
survey and KLD's AB 747 traffic model treat it as a street, while the same City segment's network
fields code it a stairway; Eric chose the street (SOURCE_NOTES K5, K8). The inspector shows the County value next to the corrected one. Each segment is matched by
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

The County file stops the Lawrence Berkeley National Laboratory's streets at the city line, and
OSM tags the Lab's roads `highway=service`, which the street extract leaves out, so the Lab once
had a single way out (Cyclotron Rd to Hearst Av). Two OSM roads from a short, labeled list
(`network.osmAdditions` in `data/assumptions.json`, matched by way and node ids) restore its
other two gates on Centennial Dr: McMillan Road to the Grizzly Peak Gate and Lawrence Road to the
Strawberry Canyon Gate. The Lab's streets are private and its gates staffed, so the simulator
lets cars leave by any of the three gates and lets none drive in (model rule
`network.labGatesExitOnly`); engines still pass (SOURCE_NOTES Z5).

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
population estimates. Zones outside Berkeley, and the Berkeley and Lab zones that the City
layer clips at the city line (BER-013, the Oakland part of Panoramic Hill, and ten others;
SOURCE_NOTES Z1), take their outlines from Genasys Protect. Zones outside Berkeley take,
where the City layer has no estimate, their population from 2020 Census blocks; two R04
Panoramic Hill order zones, OKL-003 (Claremont Canyon, 307 instead of Genasys 27) and BER-013
(the Oakland part of Panoramic Hill, 122 instead of 83), take the Census count by Eric's choice
(`population.overrides`, SOURCE_NOTES X6, Z2); only people
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
Plan A and Plan B see the same households for the same seed: placement, vehicles, who leaves,
mobilization delay, commuters and rides are drawn in an order fixed by the scenario's
orders, never by the plan, and the leave-early decision has a separate random stream. A
household that leaves early in Plan B is the only one whose draws go unused; a carless
household whose Plan A neighbor left early rides with another neighbor. Added units (future
growth, below) draw in the same fixed order from streams of their own, so with growth both
plans see the same units wherever R0 builds them in both.

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

**Contraflow, police control and power shutoff** (`js/operations.js`; SOURCE_NOTES CF1–CF15).
All off by default; with them off a run is identical to one without the module, and none of them
draws a random number. *Contraflow* (plan): once started, both lanes of a chosen two-way street
carry traffic away from the order area and the inbound side is closed, so returning commuters
turn back or reroute and engines cannot drive up it (engine reach and the engine route both
respect it). It runs only where at least 20 ft (2 × `access.movingLaneM`) stays clear between the
plan's parked cars; narrower streets stay two-way, and the Inspector says so. The reversed lane
carries 70% of a normal lane (freeway data, CF4); junction capacity is unchanged. The main hill
exit streets come from `tools/contraflow-streets.mjs` (174 segments on 70 streets, CF12); "streets I
choose" adds a street from the Inspector. Officer-staffed contraflow needs one officer at every
entry point and starts when officers arrive; pre-installed signs and gates start 10 minutes after
the zone's order and fail if the fire reaches them first or, on grid power alone, in a power
shutoff; a failed sign falls back to officers or to no contraflow. *Police control* (plan):
officers from the same pool take over pre-timed signals (and optionally the Time Study's Appendix
F congestion points, or every signal) on the households' routes, busiest first; a controlled
junction passes 9% more vehicles and serves outbound approaches first, the optimistic end of
published findings (CF8). *Power shutoff* (scenario): dark signals run as all-way stops at about
900 vehicles per hour (CF9). Signal locations and control types come from the City's Signals layer
via `tools/signals.mjs` (CF1).

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
| `js/access.js` | Access-constrained areas: inspector card, Expert-view summary, ranking table, map key |
| `js/data.js` | Loads the data files (`access-constraints.json`, `signals.json` and `contraflow-streets.json` are optional) |
| `js/operations.js` | Contraflow, police control of junctions and the Red Flag power shutoff |
| `data/assumptions.json` | **Editable** assumptions and model rules, each with a category and note |
| `data/model/network.json`, `layers.json` | Built by `tools/build-network.mjs` (do not edit by hand) |
| `data/model/access-constraints.json` | Built by `tools/access-constraints.mjs`; the simulator runs without it |
| `data/model/signals.json` | Signal junctions and control type (City `Signals` layer) and the Time Study's Appendix F congestion points, built by `tools/signals.mjs` |
| `data/model/contraflow-streets.json` | Main hill exit streets for contraflow, built by `tools/contraflow-streets.mjs` from status-quo runs |
| `data/terrain/dem.i16`, `dem.json` | Elevation grid, built by `tools/fetch-dem.mjs` |
| `data/field/` | Field and aerial observations (counts only), e.g. parked cars on 22 hill blocks |
| `data/raw/` | Downloaded source data (reproducible, large; City layers and report PDFs are not in git). `osm/east-bay-roads.json` (OSM streets), `osm/lbnl-gate-roads.json` (the Lab's gate roads), `genasys/zones.json` (zone outlines), `census/` (2020 block counts) each have a retrieval note |
| `correspondence/` | Drafts of letters, such as the informal question to Berkeley Fire |
| `tools/` | Data pipeline (Node 18+, no npm packages) |
| `tests/headless.mjs` | Runs every scenario × two plans in Node and prints summaries |
| `tests/calibration.mjs`, `tests/stuck.mjs`, `tests/leftover.mjs` | Compare with the Time Study (fire off); list jammed links; list order-zone vehicles that never leave |
| `tests/plan-draws.mjs` | Checks that Plan A and Plan B of every Simple-view question see the same households for a seed (each fire, seeds 1–3), the same with maximum growth under each R0 area, and that growth leaves today's households and the shared random stream unchanged |
| `tests/growth.mjs` | Future growth and R0 with the fire on, seeds 1–5 (`SOURCE_NOTES.md` R4, R5); `GROWTH=max node tests/calibration.mjs` gives R3 |

## Replacing datasets

Every tool is plain Node (18+) with no dependencies.

```sh
node tools/fetch-dem.mjs           # elevation: USGS 3DEP 1 m lidar DEM (4 m overview), ~1 minute
node tools/fetch-city-layers.mjs   # City of Berkeley ArcGIS Online layers → data/raw/city/
node tools/build-network.mjs       # rebuild data/model/*.json from everything above
node tools/signals.mjs             # signal junctions for police control and the power shutoff (after every rebuild)
node tools/contraflow-streets.mjs  # main hill exit streets for contraflow, ~30 s on 8 cores (after every rebuild)
node tests/headless.mjs            # sanity-check the models (optionally: low | central | high)
node tests/calibration.mjs         # compare evacuation times with the 2025 Evacuation Time Study (fire off)
node tests/plan-draws.mjs          # check that Plan A and Plan B see the same households for a seed
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
  night and 25–80 min fast on weekdays (see `SOURCE_NOTES.md`, calibration). Tuning junction
  capacity to close that gap broke Panoramic Hill, so it is left untuned.
- Streets outside Berkeley come from OpenStreetMap with assumed widths. The model area ends at
  the edge of the elevation grid (37.84–37.91° N, 122.33–122.21° W), about 1 km into Oakland
  and through the middle of Kensington; north Kensington (about 1,500 people) and Oakland
  south of that line are not modeled. Traffic that reaches the edge has left.
- Fire spread, ember distances and spot-fire rates are illustrative model values.
- Contraflow and officer control act on the model's link and junction capacities, not on real
  signal phases or lane markings. Not modeled: drivers who ignore contraflow signs, the time to
  clear a street before it reverses beyond the start delay, rehearsal making people leave sooner,
  battery backup running down during a long power shutoff, and anything a shutoff does besides
  darkening signals and signs (SOURCE_NOTES CF15).
- Future growth: with the Time Study's maximum ADU build-out the simulator's evacuation time
  in the large regions grows less than the study's (fire off, fall weekday S4: 1923 region +42%
  against the study's +58%; Fire Zones 2–3 +3% against +97%), because its junctions pass traffic
  faster than the study's signals and stop signs; read growth effects there as a lower bound.
  Panoramic Hill grows more than the study's (+120% against +25%): with one way out, its
  streets lock up and the gridlock rule fires hundreds of times per run, so that figure is less
  certain (`SOURCE_NOTES.md` R3, R7, R8).

## Access-constrained areas

`tools/access-constraints.mjs` maps where a single street segment is the only drivable way out, with no fire needed. On the residents' network as the simulator builds it (barrier-closed segments removed, one-way streets one way, exits at the grid edge), it finds every choke link, the area behind it, how many chokes lie in series, and for each area the synthetic residents, households and vehicles, fire-zone mix, clear width and engine fit at the entrance, steepest grade, the nearest street outside the area and any existing path or stairway. About 14% of hill residents in the model area live behind at least one choke; Panoramic Hill is the largest such area. Method, rankings and checks against the City's SB 99 analysis are in `docs/access-constraints.md`.

```sh
node tools/access-constraints.mjs              # writes data/model/access-constraints.json and docs/access-constraints.md
node tools/access-constraints.mjs -v           # also prints the top areas
node tools/access-constraints.mjs --open 2322  # what-if: treat segment 2322 (or a comma list) as a two-way street; prints, writes nothing
node tools/access-constraints.mjs --links f.json --quick  # what-if: add new links between existing nodes (tools/egress-link.mjs)
```

Rerun it after `tools/build-network.mjs`.

**On the map.** Expert view, Map section: the "Access constraints" layer (off by default) draws each area from `data/model/access-constraints.json`:

- A band under each street in an area, shaded in one blue ramp by the synthetic residents behind the area's outermost choke (under 25, 25, 100, 250, 500 or more). Solid for a dead end, dashed for a one-way-only area, which is softer: running its entrance two-way would open it. The band sits under the street line, so "Color streets by" still shows.
- The choke as a thick bar along the first 25 m or more of the entrance from its outer end: red where an engine does not fit (under 10 ft clear with both sides parked, status-quo parking in its nominal state), dark where it fits, open (white center) where the width is unknown. Zoomed in, the bar is labeled with the clear width in feet.
- Once zoomed in past 2 m per screen pixel (and always for the selected area), the nearest other street as a dashed straight line between two dots, labeled with length and climb when zoomed in or selected (dead ends with 10 or more residents only), and any existing path or stairway out, drawn heavier in the paths style.
- A hatched, dashed box with "⚠ population placement artifact" around areas with an `allocationWarning` (Albany Hill, AC-315: zone ALB-011's 2,535 residents all land on one 221 m segment).

Clicking a street in an area, with the layer on, outlines the innermost area in yellow and puts an "Access-constrained area" card above the street card: entrance, type, streets, residents, households and vehicles (synthetic), evacuation zones, nesting with the enclosing areas, clear width and engine fit at the entrance, steepest grade, fire-zone mix, nearest other street, existing path, and the constraint score with its components, each with its provenance badge and source note. With the layer off, the street card names the area in one row. Below the layer list, a line gives hill residents behind a choke point (5,749 of 41,475; Berkeley and LBNL 3,149 of 27,840) and opens a sortable table of the union of the two top-50 rankings (68 areas), with the score and its components labeled a model rule; clicking an area zooms to it. None of this appears in Simple view.

### Second ways out

`node tools/egress-all.mjs` screens candidate road connections that would give these areas a second way out: straight new roads up to 250 m, upgraded paths and stairways, opened barriers, and the City's "2nd Route Out" for Panoramic Hill. For each it reports length, grade from the lidar DEM, buildings and Alameda County parcels in a 40 ft corridor (counts only), park and campus land, the residents it takes out from behind a choke, a screening cost range from public figures, and the simulator's result with and without the link for the same seeds (the link is added at run time; `network.json` is unchanged). The candidates are a screening, not designs, and the results are a comparison, not a prediction. Method, ranked table, what was pruned and the Time Study benchmark are in `docs/egress-candidates.md`; the whole run takes 20–30 minutes on 8 cores. Rerun it after every network rebuild: candidate ids are built from the access-constraint area ids (AC-160-N3 is a link out of area AC-160), which shift when the network changes.
