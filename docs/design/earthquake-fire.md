# A fire started by a Hayward Fault earthquake: design note

Status: design note, 2026-11-02. Nothing here is built except a read-only check,
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

Build A first, as a scenario setting with both bounds and labeled as model rules. It answers
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

## Open for Eric

1. Which bound is the default when the setting is on, or whether both are always shown.
2. Whether to test an earthquake fire on an ordinary (non-Diablo) wind as well.
3. Whether to share the liquefaction layer with the Bay Flood Explorer, which covers the
   same low ground.
