# Berkeley Hills Wildfire Evacuation Game — Build Specification

## Purpose

Build an interactive, playable city-management simulation that helps people understand Berkeley’s wildfire tradeoffs. The player makes land-use, access, preparedness, and evacuation choices, then tests those choices by running several fire scenarios.

The game is an educational scenario explorer, not a life-safety tool, engineering analysis, official evacuation plan, or prediction of a real fire. It must distinguish sourced facts from game assumptions and should never imply that a simulated result is an authoritative forecast.

## Core premise

The player manages a city with a steep, fire-prone hillside, narrow and winding streets, parked cars, homes reached by long stairways, households with different mobility and transportation needs, and denser neighborhoods in the flats. Wind-driven embers may carry fire downslope beyond the hills. During extreme fire weather, fire may spread faster than some residents can evacuate.

The central tension is that safety, housing, access, cost, and neighborhood continuity cannot all be maximized at once. Visible property-level actions such as vegetation clearance can reduce ignition and spread risk, but do not by themselves solve road capacity or household access.

## Player loop

1. **Inspect the map.** Toggle terrain, streets, buildings, fire risk, parking, household needs, and access layers.
2. **Choose a planning package.** Spend a limited budget and political-capital allowance on interventions.
3. **Set operating plans.** Choose alert triggers, early-departure zones, carpool support, traffic routing, responder access rules, and assistance for residents who need help.
4. **Run a fire scenario.** Select ignition area, start time, wind direction and speed, humidity/dryness, and fire-spread severity from bounded scenario presets.
5. **Review outcomes.** See fire progression, ember exposure, household departure and arrival, road queues, blocked or delayed responder routes, homes lost, people exposed, and costs.
6. **Revise and compare.** Save a plan, change one or more choices, and run the same scenario again. Also test the plan against other scenarios so a favorable result in one run does not appear to prove the plan is robust.

## Decisions the player can make

Represent options as interventions with cost, coverage, time to implement, and explicit tradeoffs. Initial options should include:

- Vegetation management around homes and along selected road corridors.
- Home-hardening support.
- Targeted no-parking rules on responder ingress corridors, with enforcement and resident impacts shown.
- Broader parking restrictions as a selectable proposal, while explaining that Berkeley’s 2025 evacuation study found broad restrictions unlikely to improve evacuation flow and potentially able to worsen intersection queues. Do not encode broad parking removal as an automatic evacuation-time improvement.
- Road widening or a secondary egress connection, with high cost, property acquisition or eminent-domain implications, environmental review, construction time, and possible displacement represented.
- Managed retreat or voluntary buyouts in the highest-risk/access-constrained locations, with relocation cost, housing loss, and reduced future evacuation demand represented.
- ADU and other housing policies. Model added residents and possible added vehicles as uncertain ranges, not a fixed one-ADU/one-car assumption. Show state-law limits on local restrictions as contextual information rather than inventing a simple unrestricted/ban switch.
- Early-departure policy for designated high-risk zones during extreme fire weather, plus lodging, transport, accessible assistance, and notification support.
- Carpool coordination, neighbor check-ins, transportation for people without cars, and assistance to reach the street from homes set back behind stairs or steep paths.
- Fire staffing and initial-attack capacity, if the supplied evidence supports a defensible simplified representation.

Each intervention should state whether it reduces ignition probability, slows spread, improves responder ingress, increases evacuation throughput, reduces the number of people needing to evacuate, improves household access, or serves another clearly named function. Do not let an intervention affect unrelated outcomes without an explicit game rule.

## Household and access model

Represent households as aggregate groups or privacy-safe synthetic households, not identifiable real residents. Household attributes may include:

- Number of residents and broad age bands.
- Mobility or assistance need, including whether a household can use stairs without help.
- Home-to-street access type: direct driveway, short path, long stairway, steep path, or other documented category.
- Vehicles available, carpool participation, and whether a driver is available.
- Alert access and expected response delay.
- Household departure preparation time and destination choice.

Older age must not automatically mean incapacity. Use age only as one optional population characteristic; model actual mobility, assistance, vehicle, and access needs separately. If Berkeley-specific household data are unavailable, label the distributions as assumptions and let users inspect or change them.

Track people who have not reached a safe destination separately from vehicles that have cleared the modeled area. A citywide average evacuation time must not hide households that cannot reach a vehicle or the roadway in time.

## Map and terrain

### Street network

Use the user-provided street GeoJSON as the initial road network. Convert each road feature into a graph with intersections as nodes and street segments as edges. Preserve source attributes and add editable fields for directionality, approximate width, grade, capacity, parking obstruction, surface/access notes, and responder suitability. Do not infer exact usable width from a centerline alone.

Required map interactions:

- Pan, zoom, search or select neighborhoods/segments, and toggle named layers.
- Click a street or household group to inspect its attributes and data provenance.
- Display hills and flats together so fire and evacuation effects are not clipped at a neighborhood boundary.
- Show scenario playback over time with a legend, clock, and clear north/scale context.

### Topography recommendation

Yes, include elevation. First choice: a current USGS 3DEP 1-meter Digital Elevation Model (DEM) covering Berkeley, if the tile coverage and metadata are adequate. The 1-meter DEM is the highest-resolution standard DEM in the 3DEP product suite and is derived from lidar. If suitable 1-meter coverage is unavailable, use the best documented available 1/3-arc-second DEM for the first prototype and record its coarser resolution.

Use the DEM to create a shaded-relief terrain background, contours or elevation labels, and slope estimates. Sample elevation along street segments to estimate grade. The DEM helps explain steepness and terrain; it does not show building access stairs reliably, identify a passable route, or determine fire behavior on its own. Do not claim that it does.

## Fire and evacuation simulation

For a first playable version, use a transparent, simplified model rather than pretending to reproduce a professional wildfire or traffic model.

### Fire layer

- Show ignition location and time, wind direction/speed, and a scenario-specific spread rate.
- Model spread over a raster or neighborhood cells using terrain, broad fuel/vegetation classes, wind alignment, and structure-to-structure ember ignition as tunable factors.
- Allow embers to travel downwind from the hills into the flats, including east-to-west cases.
- Treat home hardening and vegetation management as probability or delay modifiers, with ranges and explanation.
- Make uncertainty visible: use scenario ranges or repeated stochastic runs rather than one deterministic line of fire.
- Do not present this simplified layer as a calibrated fire-behavior model.

### Evacuation and responder layer

- Use a road graph with segment capacity and intersection queue limits. The 2025 City evacuation study identifies intersections and traffic demand as major constraints; do not assume that removing parking automatically increases total evacuation throughput.
- Include household preparation and departure delays, early departure, carpooling, vehicle availability, and transport assistance.
- Include access time from the home to the street. Long stairs and steep paths can increase departure time or require assistance.
- Model responder ingress separately from resident egress. Targeted parking restrictions may improve emergency access even when they do not materially improve evacuation flow.
- Allow all available streets to be used unless a scenario blocks them. Do not funnel all residents onto a small set of “official routes” unless the evidence or scenario specifies that behavior.
- Allow scenario-specific road closures, fire exposure, contraflow, and traffic-control choices only where the model can explain their effect.

### Scenario presets

Start with a small scenario set that can be expanded when source documents arrive:

1. **Reference hills fire:** a repeat of the general 1923-fire footprint or another City-defined scenario, clearly labeled as a historical reference rather than a prediction.
2. **Extreme east wind:** fire starts in or near the hills; embers move west toward the flats.
3. **Constrained neighborhood:** ignition near a one-way-in/one-way-out or otherwise access-impaired area; test the effect of early departure and a possible secondary route.
4. **Different time-of-day demand:** compare lower and higher traffic demand, using sourced assumptions where possible.

For each scenario, provide low, central, and high severity or spread assumptions. The user should be able to run identical scenarios against different policy packages.

## Results and comparison view

Show both map animation and a compact results panel. Include:

- People who reached safety, remained at home, were delayed, or were exposed to fire/ember risk.
- Time until the last modeled household reaches safety, plus distributions or percentiles; avoid reporting only a single average.
- Households needing assistance that were reached or not reached.
- Vehicles and people still on roads as fire approaches.
- Road-segment and intersection queue locations over time.
- Responder access delays or blocked approaches.
- Structures exposed, ignited, or lost in the simplified model.
- Cost, implementation time, units/housing affected, and households displaced by the selected package.
- Comparison against a baseline using the same scenario and random seed.

Explain why the outcome changed. Provide an event log such as: “Early departure reduced vehicles entering the network during the fire alert”; “parking restriction improved responder access on this segment”; “the queue persisted at the downstream intersection”; “households behind long stairs began later.”

## Evidence, uncertainty, and fairness rules

- Add a source/provenance field to every imported layer and model parameter.
- Visibly distinguish **sourced data**, **derived estimates**, **user-editable assumptions**, and **illustrative game rules**.
- Provide an “assumptions and limits” panel accessible throughout play.
- Do not use real names, individual addresses tied to sensitive household attributes, or inferred disability/age data.
- Avoid treating older residents as uniformly unable to evacuate. Represent functional needs and support networks directly.
- Do not imply that a player’s preferred policy guarantees safety.
- Include a disclaimer that outputs are educational comparisons and must not guide real evacuation decisions.
- Keep official instructions and links separate from game controls; link to current City emergency information in the finished product.

## Suggested implementation sequence

### Phase 1 — Map prototype

Render the provided street GeoJSON, elevation background, neighborhood boundaries, and manually curated scenario controls. Add a simple graph-based evacuation animation with clearly labeled synthetic demand. No fire prediction claims.

### Phase 2 — Playable policy comparison

Add household groups, parking and responder-access distinctions, early-departure policies, stairs/mobility access, ADU population ranges, and intervention costs. Support repeatable runs and side-by-side comparisons.

### Phase 3 — Evidence-backed Berkeley scenario

Replace placeholder values with City evacuation-study inputs or other verified sources where available. Add building footprints, fire zones, vegetation/fuel categories, actual parking restrictions, and the best documented local elevation data. Record every transformation.

### Phase 4 — Fire propagation and sensitivity

Add a spatially explicit ember/fire-spread layer only after suitable fire-history, fuels, weather, and structure data are available. Validate behavior against published scenarios and document limits. If this phase cannot be validated, keep fire spread as selectable scenario overlays rather than an asserted predictive model.

## Deliverable expected from Claude

Create a working browser-based prototype with:

1. The supplied street GeoJSON loaded as the base network.
2. A terrain layer using the recommended DEM if supplied; otherwise show an elevation-data placeholder and document the exact expected format.
3. A policy setup screen, scenario selector, playable run, and results/comparison view.
4. A small sample dataset clearly marked synthetic wherever local data are missing.
5. A README explaining how to run the app, replace datasets, edit assumptions, and interpret results.
6. A data inventory naming missing inputs, their formats, source needs, and the parts of the game they unlock.
7. No claim of professional-grade evacuation or fire prediction.

## Resources needed from Eric or to obtain

### Required to begin

- **Street GeoJSON:** the file you plan to provide. Include street centerlines and, if available, segment names, directionality, road class, width, and one-way restrictions. Tell Claude its CRS/EPSG code if known.
- **Coverage boundary:** Berkeley city limits plus the adjacent area needed to show destinations and fire spread beyond the city boundary.
- **Elevation raster:** preferably USGS 3DEP 1-meter DEM GeoTIFF covering the hills and flats, with metadata, vertical units, horizontal CRS, and acquisition date. A coarser documented DEM is acceptable for the first prototype.
- **Neighborhood or evacuation-zone boundaries:** especially the City’s Leave Early Zones and any study scenario boundaries.
- **Evacuation-study source:** the full City of Berkeley 2025 Evacuation Time Study and its scenario assumptions/results. This is the best basis for calibrating or checking the traffic side; do not reverse-engineer claims from a summary page alone.

### Strongly recommended for a meaningful Berkeley map

- Building footprints and, if available, building type/roof or home-hardening categories in aggregate.
- Parcel boundaries only if needed for land-use/retreat visualization; avoid displaying owner information.
- Fire hazard severity zones, local mitigation zones, vegetation/fuel classes, and recent vegetation-management projects.
- Existing red curbs/no-parking segments, seasonal or extreme-fire-weather restrictions, and enforcement rules.
- Fire stations, hydrants/water infrastructure, emergency access gates, known road pinch points, and official emergency facilities/shelters.
- Street widths or curb-to-curb measurements, slope/grade, stairways and pedestrian connections, bridges, gates, and turnarounds. Centerlines alone cannot establish two-way passability or stair access.
- Population and household distributions at an appropriately aggregated geographic level, including age bands, vehicle availability, and mobility/assistance needs if ethically and legally available. Otherwise use labeled synthetic ranges.
- ADU locations/counts or housing-capacity estimates at aggregate level, plus defensible assumptions for residents and vehicles per additional unit.
- Historical fire perimeters and ignition locations, including the 1923 and 1991 events where usable; historical examples must not be presented as forecasts.
- Scenario weather inputs: wind direction/speed, humidity, and timing. Use official historical or City-selected scenario values and cite them.

### Useful later, not a blocker for the first prototype

- A digital surface model or lidar point cloud to represent canopy/building height.
- High-resolution land-cover/fuel data and parcel-level defensible-space status, if public and appropriate.
- Traffic counts, intersection control, signal timing, observed parking occupancy, departure-time distributions, and any City/KLD model input or output files that can be shared.
- Accessibility routes, community support resources, and realistic transport-assistance capacities.
- Capital and operating cost estimates for road widening, targeted restrictions, vegetation programs, buyouts, and relocation support.
- Property acquisition feasibility, ownership/jurisdiction boundaries, easements, environmental constraints, and likely displacement counts for road or retreat options.

## Data format and handoff conventions

Use GeoJSON for vector layers and GeoTIFF/Cloud Optimized GeoTIFF for rasters when practical. Each dataset should include a short metadata note with source, date, CRS/EPSG, units, license/access limits, known gaps, and whether it is authoritative, derived, or illustrative. Reproject layers to a single local projected CRS appropriate for Berkeley before calculating distances, lengths, or grades. Never calculate road widths or evacuation times from unprojected longitude/latitude coordinates.

## Data source starting points

- USGS 3DEP 1-meter DEM product information: https://www.usgs.gov/3d-elevation-program/about-3dep-products-services
- USGS Science Data Catalog, seamless 1-meter DEM: https://data.usgs.gov/datacatalog/data/USGS%3A4f34caac-f28f-4ea0-8d82-eafb2b8f9a5d
- City of Berkeley Open Data Portal: https://data.cityofberkeley.info/
- City of Berkeley public GIS portal: https://gis.cityofberkeley.info/arcgis3/rest/services/Public/GISPortal/MapServer
- City evacuation study is linked from the City’s wildfire evacuation information and 2025 study materials.
- City of Berkeley Fire Weather and Evacuation information: https://berkeleyca.gov/safety-health/disaster-preparedness/fire-weather-and-evacuation

## Acceptance criteria

- A user can load the supplied GeoJSON and see recognizable Berkeley street geometry.
- Elevation is visible as terrain context and is not mislabeled as building/stair access data.
- A user can select at least three fire scenarios and run the same intervention package through each.
- The simulation shows both fire/ember movement and household/traffic evacuation consequences, with uncertainty clearly labeled.
- It distinguishes household access to the road, resident egress, and responder ingress.
- It allows a side-by-side comparison of at least two policy packages against identical scenarios.
- It shows which outcomes come from source data and which are assumptions.
- It includes hills-to-flats ember scenarios and household stair/mobility needs.
- It does not claim to predict actual fire behavior or provide real-time emergency advice.
