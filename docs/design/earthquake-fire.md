# A fire started by a Hayward Fault earthquake: design note

Status: design note, 2026-11-02; decisions added 2026-11-03. Nothing here is built except a read-only check,
`tools/fault-zone-check.mjs`. Sources were read on 2026-11-02 and are logged in
`SOURCE_NOTES.md` under "Hayward Fault earthquake and fire" (rows EQ1–EQ8). The simulator
is an educational comparison tool, not a prediction and not an official evacuation plan;
the same holds for everything proposed here.

## Summary

- **The question** (Eric, 2026-11-02): a Hayward Fault earthquake that starts a fire in the
  hills. It differs from every current scenario in three ways at once: streets out of the
  hills can be cut before anyone leaves, several fires can start together, and help from
  outside may not come. An earthquake is not seasonal, so it can coincide with the Diablo
  wind the current fires assume; Bay floods come mostly in winter (Bay Flood Explorer,
  `specification.md`, Joint scenario).
- **The fault runs between the hills and the Bay.** In the State's Earthquake Fault Zone
  bound (below), 711 of the 1,617 street nodes in Berkeley's Fire Zones 2–3 are left on the
  hill side, with exits only on the grid's east and north edges, none on the Bay side; another
  391 lie on segments that are all closed. None of the four hill points checked keeps a route
  to the Bay side: Grizzly Peak Blvd at Spruce St and Claremont Ave at Grizzly Peak Blvd have
  none, and Panoramic Way at Mosswood Rd and Cragmont Ave at Euclid Ave are cut off, every
  street at them closed (EQ5).
- **Even the narrowest bound cuts Panoramic Hill off from the Bay side.** Closing only the 69
  vehicle segments that cross a mapped Hayward Fault trace leaves Panoramic Hill with no
  route west; the rest of the hills keep one, through a gap in the mapped trace near Arlington
  Ave and Thousand Oaks Blvd (6.2 km from Grizzly Peak Blvd at Spruce St, 6.5 km from Cragmont
  Ave at Euclid Ave, 13.3 km from the top of Claremont Canyon by way of the north hills; EQ4).
  Whether that gap is real or a gap in mapping is open.
- **Shaking is strong everywhere at once.** The USGS HayWired M7.05 scenario ShakeMap gives
  intensity (MMI) 8.4–9.7 at the points checked, from Second St at Gilman St (8.4) to Grizzly
  Peak Blvd at Spruce St (9.7) (EQ3). The design assumes signals and power fail citywide
  (assumption); the ShakeMap gives shaking, not which systems fail. Water supply after the
  earthquake is an open question (section 6).
- **Many fires, little help.** USGS's HayWired fire study estimates about 450 large fires in
  the region (EQ6, secondary source; the chapter itself has not been read). The City's 2024
  hazard mitigation plan says after a Hayward earthquake "Outside fire departments may not be
  able to provide mutual aid" (SOURCE_NOTES G9).

## 1. The question

What happens to the hill evacuation when the earthquake comes first: streets broken at the
fault, landslides on hill roads, signals dark, several ignitions, and Berkeley's on-duty
engines split among them? Which plan changes still help when the streets they rely on may be
gone?

## 2. What is public

| Item | Value | Source | Category |
|---|---|---|---|
| Scenario earthquake | M7.05 on the Hayward Fault, epicenter in Oakland | USGS HayWired (EQ1, EQ3) | sourced |
| Shaking at Berkeley points | MMI 8.4 (Second St at Gilman St), 8.6 (I-80 at University Ave), 9.7 (Grizzly Peak Blvd at Spruce St) | HayWired ShakeMap grid, nearest node, about 1.8 km spacing (EQ3) | derived |
| Where surface rupture is expected | Mapped Hayward Fault traces; the State's Earthquake Fault Zone around them | California Geological Survey (EQ2) | sourced |
| Streets crossing a mapped trace | 69 vehicle segments, 10.9 km | `tools/fault-zone-check.mjs trace` (EQ4) | derived |
| Streets touching the Earthquake Fault Zone | 551 vehicle segments, 66.3 km | `tools/fault-zone-check.mjs zone` (EQ5) | derived |
| Liquefaction | State liquefaction zones cover the Bay margin and reach into the flats east of San Pablo Ave in places | CGS (EQ7) | sourced |
| Large fires, region | about 450 | Scawthorn 2018, HayWired chap. P, as summarized by SPA Risk (EQ6) | sourced, secondary |
| Fire damage by fire station area | Voronoi polygons per station | USGS data release, doi:10.5066/P9LMGHRV (EQ6) | sourced, not yet downloaded |
| Mutual aid | may not be available | 2024 LHMP p. B-51 (G9) | sourced |

## 3. What the simulator does now

- One ignition per fire member, on a Diablo wind (`js/scenarios.js`).
- Streets close only when fire reaches them or a plan closes them (diverters, contraflow).
- A Red Flag power shutoff turns signals into all-way stops, in and next to the hills or
  citywide (`js/operations.js`, SOURCE_NOTES CF1–CF15).
- Engines drive from Berkeley's 7 stations; engine reach is reported at ignition
  (SOURCE_NOTES ER1–ER3). Engines do not fight fire, and water supply is not modeled.

## 4. Options, smallest to largest

**A. Fault closures (scenario setting).** Close street segments at the fault before the fire
starts, at one of the two bounds: segments crossing a mapped trace (model rule, lower bound)
or segments touching the Earthquake Fault Zone (model rule, upper bound; the zone marks
where the State requires a fault investigation before building). Reuse the citywide power shutoff for dark signals (an assumption: EQ3 gives shaking, not
outages). Report evacuation, engine reach and which exits are left.
Uses machinery the simulator already has (closed edges, dark signals); the closure list
comes from `tools/fault-zone-check.mjs`.

**B. Landslide and liquefaction closures.** Add segments in State earthquake-induced
landslide zones (hill roads) and liquefaction zones (the flats and I-80) as closed or slowed,
each a separate, labeled setting. Needs the CGS landslide layer (not yet retrieved).

**C. Several ignitions.** Start two or more fires at once, drawn from the HayWired fire
data release by fire station area. Needs the fire overlay to take more than one ignition
(`js/fire.js`; not yet checked).

**D. Engines split and no mutual aid.** Commit some on-duty companies to fires or
collapses in the flats before the hill fire is reported, and allow no outside engines.
Builds on the staffing note (`docs/design/fire-staffing.md`).

## 5. Recommendation

Superseded in part on 2026-11-03: see "Where an earthquake fire starts" below; C now comes second. Build A first, as a scenario setting with both bounds and labeled as model rules. It answers
the central question (does the hill evacuation still have a way out?) with data already in
the repository, and it is the change most likely to alter which Simple-view plans hold up:
plans that send traffic west (parking changes on the lower hill streets, police control at
the flats' junctions) may stop mattering where the fault has cut those streets, and plans
that open routes east or north may start to matter more. B and D next; C last, since it
changes the fire model.

## 6. Gaps worth filling

1. The gap in the mapped trace near Arlington Ave and Thousand Oaks Blvd (EQ4): read the
   CGS Richmond and Oakland West quadrangle fault maps at 1:24,000 to see whether the trace is
   continuous there.
2. Scawthorn 2018, HayWired chapter P: ignition counts and any Berkeley figures (EQ6).
3. CGS earthquake-induced landslide zones for the hills.
4. Whether the routes east (CA-24 through the Caldecott Tunnel, Grizzly Peak Blvd, Wildcat
   Canyon Rd) are themselves expected to close: tunnel, landslide and the Moraga and
   Wildcat faults.
5. EBMUD's expected water outages after a Hayward earthquake.

## Where an earthquake fire starts and which way it burns

Eric, 2026-11-03: "Doesn't the earthquake create a radically different ignition point? If so
then it's important to disclose and show that." It does, in two ways, and both reverse what
the current fires assume:

- **Where.** A wildfire starts at the wildland edge, uphill of the homes. Fires after an
  earthquake start in buildings (broken gas lines, electrical faults), several at once:
  about 450 large fires across the region in HayWired (EQ6). The HayWired data release gives
  fire damage by fire station area (EQ6), which can place starts in Berkeley's flats as well
  as the hills. How Scawthorn's model places ignitions is to be confirmed against chapter P
  (gap 2) before any number reaches the simulator.
- **Wind.** An earthquake can come on any day. The dry wind from the east the current fires
  assume is rare: at the Oakland North weather station, hours with wind from 0–90° and
  humidity at or below 25% were 7,340 from June 1992 to October 2026 (FF5), about 2.5% of the
  roughly 300,000 hours in that span (derived). On an onshore day, with the wind off the Bay (63.3% of
  hours at the same station blow from 180–320°, measured 2026-11-04: 35% in winter, 72% in spring,
  86% in summer, 59% in fall; SOURCE_NOTES WC2, `docs/wind-climate.md`), a fire in the flats burns
  uphill, toward the hills and the people evacuating from them.

So an earthquake fire is a different fire, not the current fires with streets closed. Option
A alone would show the current wildland starts on a Diablo wind with the fault's closures,
and must say so on screen. Option C moves up to second: starts drawn from the HayWired
station-area data, on an onshore wind as the main case and the Diablo wind as the worst case.

## Decided (Eric, 2026-11-03)

1. Both bounds are shown when the setting is on: the mapped trace (69 segments closed) as the
   lower bound and the Earthquake Fault Zone (551) as the upper bound, each labeled a model
   rule.
2. The earthquake fire gets its own starts and an ordinary onshore wind (above), and the page
   discloses how they differ from the wildfire scenarios. Order of work: A (closures, both
   bounds, disclosed as wildland starts only), then C (HayWired starts, onshore and Diablo
   winds), then B and D.

## Open for Eric

1. Whether to share the liquefaction layer with the Bay Flood Explorer, which covers the
   same low ground.

## Winds measured (2026-11-04)

Built from the Oakland North record by season and hour (`docs/wind-climate.md`, SOURCE_NOTES WC1–WC9):
the `quake` scenario now blows from 205° at HayWired's April afternoon speeds (7.0 mph easing to 5.4 mph by
9 p.m. LST); `quakeNorthWind` is a winter day with a north wind (0°, 5.9 → 9.2 mph, mostly humid air);
`quakeEastWind` keeps the dry 45° wind at 30 mph as the worst case. The fire model reads the wind each
hour from a schedule (`js/fire.js` `windSegments`). The spread factor was refitted to HayWired's burned
floor area on the spring wind: 0.27 (was 0.37 on the assumed 270° at 10 mph).
