# Source notes: what we learned from which document

Each entry records an insight, where it came from (document + section/page), and what we
did with it in the game. Keep adding entries as documents are read. Local copies of the
documents are in `data/raw/docs/`.

Status key: **applied** (changed the game), **pending** (planned change), **context**
(informs explanations or the assumptions panel only), **conflict** (contradicts something
we assumed; see the note).

---

## Eric (project owner), conversation, 2026-10-31

| Insight | Status / use |
|---|---|
| Almost every Berkeley Hills street is two lanes (one each direction) with parking on both sides. | **applied**: `lanes.hillsLocal = 2`, `parking.hills = "both"` in `data/assumptions.json`, labeled assumption. Later refined to "both sides where it fits" so a travel lane always remains. |
| 2026-11-01: on many hill streets with parking on both sides, cars meeting from opposite directions must take turns. | **applied 2026-11-01**: two-way streets with one lane (or less) between parked cars now share one lane; when both directions have traffic, drivers take turns and the street loses capacity (`sharedLane`). Returning commuters now drive in against the evacuation. |
| 2026-11-01 photo of Bret Harte Rd: parking on one side only (the downhill-right side, partly on the dirt edge); the other side is fence and hedge with no room to park. One car-width moving lane remains; gaps between parked cars (driveways) are the passing spots. | **context**: agrees with the City Narrow_Roads survey for Link 1379 (17 ft pavement, 10 ft with parking = one side parked). The network builder labels that segment "both sides", but the game uses the survey's 10 ft clear width, so the result is right. Shows parking is often one-sided where a bank or fence lines the road, so "both sides" overstates parking there. Gap spacing is evidence for the passing-spot rule. |
| 2026-11-01 photo of Poppy Ln: parked on both sides; the right-side car sits partly on a gravel shoulder off the pavement. About one car-width moving lane between them; take turns. | **context, possible conflict**: City Narrow_Roads (Links 1878, 1937, 2183) gives 22 ft pavement and **8 ft** with parking, so the game blocks fire engines on all of Poppy Ln (needs 10 ft). The photo looks wider than 8 ft, perhaps because cars park partly off the pavement, but a photo can't settle 8 ft vs 10 ft. Needs a tape measure or BFD's view. Supports "both sides" here, unlike Bret Harte Rd. |
| 2026-11-01: one bad parking job narrows the gap. A single car parked far from the curb, or one wide vehicle, sets the clear width for the whole block. | **applied 2026-11-01**: the narrowest point governs, not the typical width. Checked the City Narrow_Roads layer: pavement minus width-with-parking is exactly 7 ft (56 segments), 14 ft (246) or 16 ft (52) on 354 of 356 segments, so it is **computed** (7 or 8 ft per parked side), not measured, and assumes perfect parking. Each run now draws bad parking jobs whose chance grows with the number of parked cars on a segment (`parking.range`); they apply to engine access and to the lanes that fit. Plan option "enforce parking tight to the curb" removes them. |
| 2026-11-01 photo of Miller Ave toward Latham Ln: curbs both sides, dashed yellow centerline, cars parked on the right side only. The left curb has bins and no parked cars. | **conflict**: the City survey gives 21 ft pavement and **7 ft** with parking (both sides) on all 13 Miller Ave segments, so the game blocks engines on the whole street. With one side parked it would be about 14 ft: one take-turns lane, and engines pass. |
| 2026-11-01 photo of Latham Ln: no centerline. One car is parked on the right at the curb by a driveway. The car on the left is parked entirely on a dirt shoulder, off the pavement. | **conflict**: the survey gives 21 ft and 7 ft with parking (both sides) on both Latham segments. Cars on an unpaved shoulder take no pavement, so here the clear width looks like 14 ft or more. A single daytime photo can't show evening parking. |
| 2026-11-01 photo, street unknown (hills, curbs, dashed yellow centerline): a full-size cargo van parked a foot or more off the curb. Its left side reaches almost to the centerline. Another car is parked on the far side further up. | **context → pending**: an example of a bad parking job made of two parts. (1) Vehicle width: a full-size van is about 6.5–7 ft wide without mirrors, so it already uses most of a 7–8 ft per-side allowance. (2) Gap from the curb. At this spot the street drops to one moving lane even though it is striped for two. Model: per-car draws of vehicle width (share of vans, pickups, SUVs) plus curb offset. |
| 2026-11-01 photo of Avenida Dr: cars parked tight to the curb on one side only (downhill right). The other side is curb and hedge with no parking. One moving lane. | **context**: Avenida is not in the Narrow_Roads survey. City pavement width is 18–23 ft. The game's "both sides where it fits" rule drops to one side here (18 ft − 8 = 10 ft, just enough for an engine), which matches the photo. A single wide parking job would block engines. **Bug found:** before a run, the map's engine layer uses the network builder's "both sides" values and shows Avenida, Fairlawn and Arcade as blocked; after a run it shows the sim's "where it fits" values. These should agree. |
| 2026-11-01 overhead image (Fairlawn Dr / Arcade Ave / Grizzly Peak Blvd), from a commercial map service: parked cars visible along much of each street, mostly on one side, with driveway gaps between them. Tree canopy hides parts of the street. | **context**: overhead imagery shows which side is parked and where the passing gaps are along whole blocks. Street-level photos are better for curb offset and vehicle width. For anything systematic, use imagery whose licence allows deriving data (public orthoimagery), not commercial map screenshots. House numbers in the image are not recorded. |
| 2026-11-01: the City's own orthophotos (2020 and 2017 at 3 in pixels) are public on `gis.cityofberkeley.info` (Imagery folder). Tested an export near Avenida Dr: individual parked cars, driveways and curb lines are clearly visible. USGS National Map has only lidar here, no high-resolution imagery. | **applied 2026-11-01** (see City aerial counts below): preferred source for systematic parking counts (side parked, cars per block, passing gaps) instead of commercial map screenshots. Daytime, single date. Imagery copyright City / Pictometry: keep derived counts, not the imagery, in the repo. |
| Pattern across the four photos (Bret Harte, Poppy, Miller, Latham): the survey assumes the same per-side deduction everywhere. In practice parking is often on one side, or partly or wholly off the pavement, and sometimes one car parked badly sets a narrower gap. | **applied 2026-11-01**: survey "width with parking" is now the both-sides case. Model parking per segment as uncertain (sides parked, how far onto the pavement, chance of a bad job), with the survey and "both sides" as the pessimistic end. Field counts or curb data narrow the range. |

## City of Berkeley, "Evacuation StoryMaps: Text-Only Version", July 2025

URL: https://berkeleyca.gov/sites/default/files/documents/Evacuation%20StoryMaps%20Text-Only%20Version%20July%202025.pdf
(still live 2026-10-31; local copy `data/raw/docs/Evacuation StoryMaps Text-Only Version July 2025.pdf`).
It summarizes the 2025 Evacuation Time Study by KLD. KLD drove every street and surveyed the community; the field observations are from May 2023.

| # | Insight (section) | Status / use |
|---|---|---|
| S1 | Evacuation times are **longer** on weekdays, in daytime, and when school is in session, because more people are in Berkeley and there is more traffic both in and outside the evacuating area. Times are shorter at night and on weekends. (§1.2) | **conflict → pending**: our 5 PM case *reduced* demand (70% of residents home). Replace it with daytime population added to residents. |
| S2 | ETE ranges. 1923 Fire Repeat: 1 h 35 min – 4 h 10 min. Panoramic Hill Fire: 45 min – 1 h 45 min. Tsunami Max Phase: 1 h 50 min – 2 h 15 min. Tsunami Phase 3 (west of I-80): 55 min – 1 h 45 min. (§1.3) | **pending**: calibration targets for `tests/`. |
| S3 | 1923 Repeat ETE by season and time. Spring/Fall/Winter: midweek daytime 4 h 10 min, weekend daytime 1 h 45 min, evening 1 h 35 min. Summer: midweek daytime 2 h 25 min, weekend daytime 1 h 50 min, evening 1 h 35 min. The clock starts at the evacuation order. (§3.3) | **pending**: time-of-day presets and calibration. |
| S4 | 1923 Repeat order area: Berkeley's eastern edge west to Sacramento St, Marin Ave south to the UC campus. Warnings go to surrounding areas. (§1.3, §3.3) | **pending**: use the City's `Evac_Regions` R02/R03 polygons (already downloaded) instead of our distance rule for this scenario. |
| S5 | Evacuation = notification → mobilization → roadway time. (§2.1) | **context**: matches our alert delay + preparation + driving model. |
| S6 | 1923 Repeat household example: leave at 30 min → safe at about 1 h 10 min; leave at 1 h → 2 h 15 min; leave at 1.5 h → 3 h 10 min; leave at 2.5 h → 3 h 50 min. Waiting 30 more minutes can add over an hour. (§2.2) | **pending**: calibration target for congestion growth. |
| S7 | 1923 Repeat roads: mostly clear at the start, 50% full after 30–45 min, completely jammed after 120 min. (§2.2) | **pending**: calibration target. |
| S8 | Highest-capacity routes: University Ave, Adeline St, Ashby Ave (SR 13), Cedar St, I-80, San Pablo Ave (SR 123), Sacramento St, Claremont Ave, Marin Ave. They are not enough alone; evacuees must use all streets. (§2.3, §6.6) | **context**: we already allow all streets. The list can be shown in the inspector or legend. |
| S9 | The study gives times only for people leaving by car. Many residents have no car; the City says to carpool and not to rely on government transport (buses can't drive through fire; vehicles may be scarce or blocked). Officials do not recommend walking or biking out of the hills in a wildfire. (§2.4–2.5) | **context**, supports our "no vehicle = at risk" display. Phase 2 should model carpooling and neighbour help before buses. |
| S10 | 1923 fire history: a grass fire entered the built area around 2:00 PM, pushed by Diablo winds of 25–40 mph. It spread SW until about 4:20 PM, when moist westerlies took over, reaching Shattuck Ave and Berkeley Way. It moved through about **1.3 km of buildings in 2.5 h**. (§3.2) | **pending**: 1923 calibration. That is ~9 m/min through buildings; our central rate was faster. |
| S11 | Present-day shift: the edge of neighborhoods is now 1.3 km farther uphill. The study moves the fire's entry point 1.3 km uphill: about 2.5 h to Codornices Park / Rose Garden, then 2.5 h more to Shattuck, so **about 5 h** from the eastern edge to Shattuck. (§3.2) | **pending**: move our 1923 ignition to today's eastern edge and tune the central spread to about 5 h. |
| S12 | Combined 1923 run (fall midweek daytime, ETE 4 h 10 min): at 1 h the fire reaches the eastern border and congestion extends into the flats; at 2 h fire is spreading over roads in use; the evacuation is complete at 5 h; fire reaches Shattuck at 6 h. Some evacuees would be overtaken on roads. (§3.3) | **pending**: qualitative check for our playback. |
| S13 | Parking restrictions won't get evacuees out faster. Intersections are the chokepoints, and where roads narrow cars still go one by one. Selective restrictions on wider streets may help engines get in; engines are not caught in the same gridlock because most traffic is outbound. (§4.1) | **applied** (independently): the parking note and the model mechanism. Now cited. |
| S14 | Traffic calming (diverters, circles, humps) and pre-timed signals make evacuation traffic worse. Areas called out: S and W of UC campus, S and W of Clark Kerr, N of Ohlone Park, LBNL. (§4.2) | **pending**: an intersection-capacity penalty, and a possible "signal retiming / calming removal" intervention. |
| S15 | SB 99: 139 Primary Access Impaired Neighborhoods (one way in and out; 1,547 residential parcels) and 195 Secondary AINs (only one viable exit because of narrow roads and hairpins; 3,715 parcels, mostly in the North Berkeley Hills). Panoramic Hill has the most primary-AIN parcels, with a single exit at a stop-controlled intersection (Panoramic Way & Prospect St/Canyon Rd). (§5) | **pending**: aggregate the City parcel layer's `Single_Access` / `Narrow_Rd` / `Tight_Turn` flags by street segment, without addresses. |
| S16 | Narrow roads are rated constrained, moderately constrained or severely constrained. They are almost all north of Codornices Park and on Panoramic Hill. (§5) | **context**: our Narrow_Roads layer uses MINOR/MAJOR; look for the 3-level rating in the SB 99 report. |
| S17 | AB 747 capacity from May 2023 field observations, in four bands: 225–900, 901–1,700, 1,701–5,700 and 5,701–15,750 passenger cars/h. Hills: mostly ≤ 900 pc/h, free flow ≤ 20 mph. Most city streets are single-lane collectors, ≤ 45 mph, about ≤ 1,700 pc/h. (§6.1) | **pending**: hills values are consistent with ours (700/lane at 20 mph). Flats are higher than our 800–900/lane, so raise them. |
| S18 | AB 747 safety rating (fatality exposure, width, turns, slope, pavement, bridges/tunnels); least safe are the hills and Panoramic Way. There is also a separate hazard rating and a demographic vulnerability index (four levels; highest in Southside, campus, around Downtown BART, and the Berkeley portion of Panoramic Hill). (§6.3–6.5) | **context**: candidate map layers if the report has data. |

## 2025 Evacuation Time Study (KLD), SB 99 report, AB 747 report

The City URLs linked from the StoryMap returned 404 on 2026-10-31. Copies were retrieved
from the Wayback Machine:

- Evacuation Time Study: capture 2025-07-16 (identical to 2026-02-01)
- SB 99 Access Impaired Neighborhood Analysis: capture 2025-07-19
- AB 747 Evacuation Route Safety, Capacity, and Viability Analysis: capture 2025-07-19

### SB 99 Access Impaired Neighborhood Analysis (KLD TR-1380, Rev. 3, PDF dated 2024-02-19, 23 pp.)

Local copy: `data/raw/docs/Access Impaired Neighborhood Analysis - SB 99 Report.pdf`

| # | Insight (page) | Status / use |
|---|---|---|
| A1 | Parked cars: **8 ft per parked side** (16 ft for both sides), using the **City's curb data** for where parking is allowed. 8 ft was chosen over 7.5 ft because cars are not always parked tight to the curb and large vehicles park on streets. Overhanging vegetation is not counted. (p. 2–3, fn. 8) | **pending**: we use 2.1 m (6.9 ft). Change to 2.44 m (8 ft). The "City's curb data" is a dataset we don't have yet; add it to DATA_INVENTORY. |
| A2 | Minimum viable evacuation travel lane is **10 ft**. Set with City Public Works and Fire staff: 8 ft vehicles plus mirrors. (p. 2–3, fn. 7) | **pending**: our "one moving lane" threshold is 2.75 m (9 ft). Change to 3.05 m (10 ft). |
| A3 | Largest City fire truck (ladder truck): **11.25 ft high, 60 ft long, 9.25 ft wide**. (p. 2, fn. 6) | **pending**: replaces our 3.0 m engine-clearance assumption with a sourced 9.25 ft body width. Note that a 10 ft lane is the practical minimum. |
| A4 | Narrow-road tiers by clear width after parking: **severely constrained ≤ 6 ft, moderately 7–8 ft, constrained 9–10 ft**. Roads ≥ 10 ft are not narrow. (p. 4) | **pending**: use these tiers in the clear-width street colouring. The City `Narrow_Roads` layer is this analysis's output. Its `Width_w_Parking` appears to subtract 7 ft per side, not 8 (Hill Rd 14 → 7; Contra Costa Ave 18 → 4). Check this. |
| A5 | Tight turns: circumcircle radius of 3 consecutive centerline vertices; **< 81 ft** (AASHTO 2018 minimum for a 20 mph design speed) flagged. Surveyed curve speeds were ≤ 20 mph. (p. 3–4, fn. 10) | **context**: explains the City `Tight_Turns` layer. We could compute it for all segments. |
| A6 | Fire station service area = **5-minute drive** (from the City's Standards of Coverage). Parcels outside it are more vulnerable. (p. 2) | **pending**: compare our engine ETA to 5 minutes in the results. |
| A7 | Results: **141 primary AINs (1,461 parcels)** and **195 secondary AINs (3,687 parcels)**. Rev. 3 numbers differ slightly from the StoryMap's 139 / 1,547 and 195 / 3,715. Zones E013 and E058 (Panoramic) have the most AIN parcels. There is one access point, a stop-controlled intersection at Panoramic Way & Prospect St/Canyon Rd. Upper barriers there would not help because they don't reach Prospect/Canyon. Most of the neighborhood is beyond a 5-min engine drive. **Many roads there are < 10 ft and have no street parking.** (p. 4) | **conflict → pending**: our default "parking both sides where it fits" is wrong for Panoramic. The Narrow_Roads values already override it there; check other non-narrow-layer segments. |
| A8 | Dead ends were checked with aerial imagery. Man-made barriers (bollards, gates, calming islands) are flagged as "potential emergency exits". (p. 2–3) | **pending**: our County network does not mark diverters or bollards, so we treat those as open through-routes. Needs a barrier layer. |

### AB 747 Evacuation Route Safety, Capacity, and Viability Analysis (KLD, Rev. 3, PDF dated 2024-03-07, 61 pp.)

Local copy: `data/raw/docs/Evacuation Route Safety, Capacity, and Viability Analysis - AB 747 Report.pdf`

| # | Insight (page) | Status / use |
|---|---|---|
| B1 | Capacity is computed per road section from the May 2023 field survey (lanes, free-flow speed) using HCM 2022. Intersections and ramp junctions are **not** included in these section capacities. (p. 5) | **context**: our separate intersection caps remain a game rule until the Time Study gives values. |
| B2 | **Two-lane road capacity by speed (Table 2):** 5 mph → 225, 10 → 450, 15 → 675, 20 → 900, 25 → 1,125, 30 → 1,350, 35 → 1,575, 40+ → 1,700 pc/h. That is 45 pc/h per mph up to 1,700. Free-flow speeds include the effect of traffic-control devices. (p. 6, p. 14) | **pending**: replace our class-based per-lane capacities with this rule applied to segment speed. Hills at ≤ 20 mph → ≤ 900. |
| B3 | Multilane roadways: **1,900 pc/h per lane** (conservative, HCM Exh. 12-8). Freeways: **2,250 pc/h per lane** (55 mph). (p. 6) | **pending**: raise arterial (900 → 1,900/lane) and freeway (1,900 → 2,250) capacities. |
| B4 | Demand sources: 2020 Census extrapolated to April 2023; LEHD/OnTheMap commuting employees; UC Berkeley 2019–20 enrollment; HPMS 2020 I-80 through traffic. Employees and commuting students: 1 per vehicle. Transit and tourists are not included. Off-campus students are assumed to live in Berkeley. No remote-work reduction. (p. 2–4) | **pending**: template for our daytime population (fixes conflict S1). |
| B5 | Temporal variation: employees peak 9 AM–5 PM weekdays; **only about 10% of employees present on weekends and evenings**. Minimum demand = UC not in session; maximum = in session. (p. 8) | **pending**: time-of-day presets. |
| B6 | *(Superseded by E9.)* **Mobilization curve (Fig. 12)**, digitized by eye from the figure, minutes after the order. **Residents:** 0% at 5 min, ~10% at 37, ~20% at 50, ~40% at 68, ~50% at 77, ~60% at 88, ~80% at 110, ~90% at 128, ~97% at 155, ~100% at 210. **Employees/tourists:** 0% at 5 min, ~17% at 10, ~42% at 15, ~61% at 20, ~75% at 25, ~93% at 35, ~99% at 50, 100% at 60. The peak hourly share for residents is **57%, from 45 to 105 min**. The curve comes from an online survey of residents and employees. (p. 8, p. 28) | **conflict → pending**: our notice + preparation median was about 28 min; the survey-based median is about 77 min. Replace our lognormal values with this curve, sampled piecewise. |
| B7 | Vulnerability inputs, per census tract (ACS 2017–21): poverty, households without vehicles, Caltrans H+T affordability, disability by type. (p. 3) | **pending**: ACS vehicle availability by tract can replace our flat 20% "no vehicle" assumption. |
| B8 | Viability scores: connectivity (shortest paths from block-group centroids to city exits, e.g. I-80 EB at Buchanan exit 13A and I-80 WB at SR 13/Ashby), accessibility (number of connections), services (gas/charging drive time), congestion (v/c). (p. 4, p. 7–8) | **context**: names the city exits KLD used. |

### Evacuation Time Study (KLD Engineering, PDF dated 2025-06-23, 323 pp.)

Local copy: `data/raw/docs/Evacuation Time Study.pdf` (~225 MB, Wayback capture 2025-07-16). Text extract: `data/raw/docs/ets.txt`.
Read by a subagent on 2026-10-31; page labels are the report's own (e.g. 5-14). Model used: DYNEV II, a macroscopic dynamic traffic assignment model.

**Scope and regions**

| # | Insight (page) | Status / use |
|---|---|---|
| E1 | 116,762 residents (2020 Census projected to Dec 2024) in **106 evacuation zones = the Genasys Protect zones**. 14 regions × 6 scenarios = 84 cases. (ES-1, 3-14, 6-2) | **context**: our zone layer is the same Genasys set. |
| E2 | **R02 1923 Fire** Order zones: BER-E012, 013, 015–020, 026–033, 038–043, 057–059; LBL-E001–006; OKL-E001, E002. Warning zones: BER-E007–010, 021, 022, 025, 037, 044, 054–056, 060, 066, 073; OKL-E004; ALB-E006. R02 uses the fire's *final* perimeter. (6-6, 7-5) | **pending → applying**: use these zone lists instead of the region polygon. |
| E3 | **R04 Panoramic Hill** Order: OAK-E003–005, BER-E013, 058, 059, 066. Warning: OAK-E006, 007, 009; BER-E041, 055, 057, 060, 073, 077. The eastern part lies in Oakland, but its residents must drive out through Berkeley. (6-7, 3-2) | **pending → applying**. Our County street file has no Oakland streets, so OAK zones' population is dropped. |
| E4 | R03 phased 1923 orders (a → b → c, east to west, "based on historical fire spread data"). Phasing adds about +2 h 15 min to the 90th-percentile ETE because of a mobilization spike and inbound cross-traffic; the study recommends ordering all zones at once. **Internal inconsistency:** phase timing is +90/+180 min in most places but +30/+60 min in Table 6-3 and §2.2. (5-8, 6-9, 7-6, 7-7) | **pending**: a candidate plan option "phased orders". |

**Demand and behaviour**

| # | Insight (page) | Status / use |
|---|---|---|
| E5 | **2.37 persons per household** (ACS; survey 2.39). Footnote D-2 says 2.61 was used, which contradicts §3. (2-1, 3-3, D-2) | **applying**: replaces our 2.3. |
| E6 | Evacuating vehicles: **1.14 per household** (survey, 1,453 households). Fig. D-11: 0 vehicles 5.9%, **1 = 73.6%**, 2 = 14.6%, 3 = 1.3%, 4+ = 0.5%, bike 1.4%, foot 2.2%, bus 0.5%. (2-2, D-11) | **applying**: replaces our 1.0–1.6 range (central 1.3). |
| E7 | **7.47% of households have no vehicle** (ACS, Table 3-10). **86.9% of carless people rideshare**, leaving 1,686 people (1.4%) who need buses. (3-9, 3-22) | **applying**: replaces our 20%. Carless households now ride with neighbours at that rate; the rest need transport (Phase 2). |
| E8 | Compliance: **100% in Order zones, 50% in Warning zones, 20% voluntary/shadow** in other city zones and the Shadow Region (from NUREG/CR-7002). The study notes real shadow evacuation is not uniform. 0.8% would ignore an order, but the model assumes 100% compliance. (2-3, 7-1, D-4) | **applying**. |
| E9 | **Mobilization histograms** (Table 5-9, p. 5-14), % of trips started per 15-min period after the order. **A** employees/visitors 22, 38, 33, 7. **C** residents with a returning commuter 0, 0, 3, 7, 13, 17, 19, 17, 12, 7, 3, 1, 1. **D** residents without one 4, 12, 18, 22, 20, 14, 7, 2, 1. **E** = C plus child pickup 0, 0, 0, 2, 6, 10, 16, 17, 17, 14, 9, 5, 3, 1. **F** = D plus child pickup 0, 3, 9, 16, 20, 20, 15, 10, 5, 1, 1. Shadow evacuees use C. Mobilization starts within 15 min of the order; the ETE clock starts at the order. (5-14, 2-2) | **applying**: **supersedes** the AB 747 Fig. 12 curve (B6). D's median is about 52 min; the AB 747 resident curve's median was about 77 min. |
| E10 | Notification component: 37% by 5 min, 41% by 10, 46% by 15, 71% by 20, 93% by 25, 100% by 35. Prepare-home component: 15.3% by 15 min, 57.7% by 45, 92.1% by 75, 100% by 135. (5-10 to 5-12) | **context**: already folded into the E9 histograms. |
| E11 | Six scenarios (Table 6-5): S1 summer midweek midday, S2 summer weekend midday, S3 summer night, S4 **fall midweek midday**, S5 fall weekend midday, S6 **fall night**. Households with a returning commuter: **13% midweek, 1% otherwise**. Employees 96–100% midweek, 10% otherwise. College 100% in fall. School buses 100% in S4, 10% in S1, 0% otherwise. External traffic 100% by day, 40% at night. **Residents are not reduced in any scenario.** (6-11) | **conflict resolved → applying**: our "70% home at 5 PM" was wrong. Replace our two time-of-day presets with S1–S6. |
| E12 | Non-resident daytime demand: 25,341 employees (15,256 vehicles), visitors 13,823 vehicles, college 15,188 vehicles, schools 16,179 people. Through traffic **47,962 vehicles** on CA-24, I-880, I-580 and I-80, stopping 2 h after the order (−60% at night). Background fill about 5,545 vehicles. Total R01 S4: 150,994 vehicles. (3-11, 3-12, 3-23) | **pending**: needs locations for employees, visitors and students. Not yet in the game; flagged in the assumptions panel. |
| E13 | Leave-early sensitivity: in R02, 10,330 of about 27,830 evacuating vehicles are in Fire Zones 2–3. Leave-early rates of 10/50/75% remove 3.7/19/28% of R02 demand; the model assumes **half of early leavers relocate within the Flats** (shadow demand). 90th-percentile change: −3/−14/−14% with normal mobilization; up to −40% with urgent mobilization. (10-3, 10-14) | **applying**: plan options become 10/50/75%. *Pending*: half of leavers relocating to the Flats. |

**Capacity and network**

| # | Insight (page) | Status / use |
|---|---|---|
| E14 | Two-lane roads **1,700 pc/h per lane** (two-way max 3,200), reduced for steep grades, tight curves and no shoulders. Multilane 1,900–2,300. Freeway 2,250. (1-5, 4-5, 4-6) | **context**: consistent with B2/B3 (AB 747 expresses the reduction through speed). |
| E15 | Signals: Q = (3600/h)·((G−L)/C)·P with L = 5 s lost time per phase. Signals with detectors are actuated; others pre-timed with City timings. Stop/yield and roundabouts modelled explicitly. Link capacity = the lesser of section and intersection capacity. (4-3 to 4-7) | **pending**: our per-node intersection caps are still a game rule. |
| E16 | **Traffic circles about 900 veh/h per lane; diverters are disconnected links; speed humps reduce speed.** (G-1) | **pending**: needs a diverter/circle layer (the City has diverters; gtpb lists Milvia/Hearst, Virginia/Grant, McGee/Cedar, California/Rose). |
| E17 | Capacity drop: discharge falls to **0.90 × capacity** after breakdown. Exit links with downstream signals are reduced 25%. (4-4, 4-8) | **pending**. |
| E18 | All roads are usable; the study advises **against designated routes and route signage**. Highest-capacity exit routes: I-580, San Pablo, Sacramento, MLK, Adeline/Shattuck, Telegraph, College, Arlington, Grizzly Peak, Ashby. Feeders: Solano, Marin, Hopkins, Durant, Oxford, Spruce, Bancroft, Haste, Cedar, University, Dwight, Euclid. (9-1 to 9-3) | **context**. |
| E19 | Parking restrictions were **not simulated quantitatively**. The finding that red-curbing is "unlikely to substantially improve evacuation flow" is qualitative: intersections are the bottleneck, hill geometry already caps speeds, and most parked cars will themselves leave. Targeted restrictions might help responder ingress. (9-4, 11-8) | **context**: our model's parking result is a mechanism, not a calibrated finding; say so in the parking note. |
| E20 | DYNEV does **not** model responder ingress, buses against the flow, pedestrians or bikes (1-7). It does not model behaviour around active fire (2-2). | **context**: our responder layer goes beyond the study, so it stays a game rule. |

**Results (calibration targets)**

| # | Insight (page) | Status / use |
|---|---|---|
| E21 | **90th-percentile ETE (h:mm), S1–S6** (Table 7-1, 7-14): R01 Citywide 3:40 / 3:10 / 2:30 / 4:00 / 2:55 / 2:30; **R02 1923 Fire 2:25 / 1:50 / 1:45 / 2:55 / 1:50 / 1:45**; **R04 Panoramic 1:40 / 1:35 / 1:40 / 1:45 / 1:35 / 1:40**; R05 Fire Zones 2&3 2:05 / 1:55 / 1:45 / 2:20 / 1:55 / 1:45; R09 N Hills 2:10 / 2:00 / 1:50 / 2:05 / 1:50 / 1:45; R10 S Hills 1:35 / 1:30 / 1:35 / 2:15 / 1:35 / 1:35. | **applying**: `tests/calibration.mjs` targets. |
| E22 | **100th-percentile ETE:** R02 3:40 / 3:25 / 3:25 / **4:10** / 3:25 / 3:25; R04, R05, R09 and R10 3:40 (S1, S4) and 3:25 otherwise, set by the mobilization tail. "Urgent mobilization" R04: 1:05 / 0:50 / 0:45 / 1:45 / 0:50 / 0:50. (7-15, 7-16) | **applying**: targets. The StoryMap's "1 h 35 min – 4 h 10 min" for the 1923 Repeat mixes the 90th-percentile urgent value and the 100th-percentile S4 value. |
| E23 | R02 S4 road time by departure delay after the order: 30 min → 40 min on the road, 60 → 75, 90 → 80, 150 → 80. Leaving 30 min later almost doubles total time (70 → 135 min). R04 S4: road time 5–10 min, i.e. little congestion inside Panoramic Hill. (7-6, 7-8, ES-6) | **applying**: targets. |
| E24 | R01 S4 timeline: 54.6% of trips started at 1 h and 26.7% exited; 96.7% / 50.1% at 2 h; clear at 5:35. R02 at 1 h has LOS F on most roads, especially around UC; the last congestion is at Cedar/MLK (pre-timed signal), clear at 4:10. R04: LOS C or better inside Panoramic Hill; LOS F at the **Channing/Piedmont traffic circle**; the **Derby St diverter** pushes traffic to Claremont Ave. (F-1 to F-4) | **pending**: qualitative checks; the circle and diverter need E16. |

**Sensitivity studies and recommendations**

| # | Insight (page) | Status / use |
|---|---|---|
| E25 | **Second egress from Panoramic Hill** (a Dwight Way–Dwight Place connection): no change under normal mobilization, because mobilization sets the ETE. With urgent mobilization, the R04 90th percentile goes from 0:30–1:00 to 0:30–0:50 (at most −33%). (10-4, 10-16) | **pending**: Phase 2 intervention with this sourced effect. |
| E26 | **ADUs:** units assumed at 2.37 persons and about 1.14 vehicles each. Maximum ADU/JADU build-out is 9,020 parcels × 3 = 27,060 units (64,132 people, 30,848 vehicles), giving 90th-percentile ETE **R02 +102% (S4 3:20 → 5:15), R04 +52%, R05 +154%**. Middle housing: 870 units, at most +8%. (10-5 to 10-8, 10-17 to 10-21) | **pending**: Phase 2. Note: the spec asks for uncertain ranges per unit, while the study uses fixed base rates. |
| E27 | Converting pre-timed signals to actuated: up to −13% (90th percentile). (10-9, 10-22) | **pending**: Phase 2 intervention. |
| E28 | Shadow/voluntary sensitivity for R02 S4 at 10 / 20 / 60 / 100%: 2:55 / 2:55 / 3:35 / 4:40. For R04: 1:40 / 1:45 / 2:50 / 4:40. (10-12) | **pending**: expose shadow % as an uncertainty slider. |
| E29 | Transit-dependent and AFN needs: bus mobilization 90 min for schools and medical, 180 min for transit-dependent routes. Loading 1 min per ambulatory passenger, 5 per wheelchair, 30 per bedridden. R04 needs 13 buses, 28 wheelchair vans and 27 ambulances. 6% of households need outside help (1.6% wheelchair van). emPOWER: 348 people. **No age breakdown; stairs not mentioned.** (2-6, 2-7, 3-11, 8-2 to 8-7, D-2) | **pending**: Phase 2 assistance model. Stairs remain unsourced. |
| E30 | Recommendations include: Traffic Control Points at the App. F congestion locations; cutting through traffic; school pickup outside the zone; keeping the Leave Early policy; stricter ADU rules in the Hillside Overlay; carpooling, with commuters not returning; removable traffic calming; actuated signals with battery backup and pre-emption; targeted parking restrictions for responders. (11-1 to 11-15) | **context**: candidate interventions for Phase 2. |
| E31 | **No fire-spread modelling** anywhere in the study. "Since the fire origin, travel direction and rate of spread is not modeled, Claremont Avenue was modeled as a viable evacuation route." Overlaying fire spread is recommended future work. (F-4, 11-1) | **context**: the StoryMap's fire timeline (S10–S12) comes from separate City work not in these reports. Our fire overlay remains a game rule with only the StoryMap for calibration. |

**Conflicts between documents**

- Mobilization: the AB 747 Fig. 12 resident curve (median about 77 min) vs. ETS Table 5-9 D (median about 52 min) and C (median about 100 min). The ETS is the later, final study, so we use the ETS tables.
- AIN counts: the StoryMap says 139 / 1,547 and 195 / 3,715; SB 99 Rev. 3 says 141 / 1,461 and 195 / 3,687.
- Household size: 2.37 in §3 vs 2.61 in footnote D-2.
- R03 phase timing: +90/+180 min vs +30/+60 min.

## City of Berkeley 2020 orthophotos (3 in), parking counted on 22 hill blocks, 2026-11-01

Counts: `data/field/aerial-parking-counts-2020.json` (derived; the imagery is not stored). Five streets Eric photographed plus 17 random two-way Local hill segments, 70–220 m. One daytime moment in 2020; tree canopy hid 10–70% of each block; counted by Claude, not yet checked by a person.

| # | Insight | Status / use |
|---|---|---|
| C1 | On blocks of 22 ft or less, 7 of 9 were parked on one side only or sparsely, 1 had none, 1 (Poppy Ln) had both sides on part of the block. | **applied**: matches the rule that residents stop parking where under 8 ft would remain; no extra parameter needed. |
| C2 | On wider blocks (24–34 ft), of 12 readable: 2 had no parked cars, 4 one side or sparse, 6 both sides on at least part (Scenic Av and Spruce St both sides along most of the block). | **applied**: `noParkingShareHills` 0.15, `oneSideShareHills` 0.35, both sides 0.50. |
| C3 | About one parked car per 19 m of a parked side (daytime, corrected for hidden canopy). Gaps between cars, driveways included, are frequent. | **applied**: `curbMPerCar` 15 (fuller evenings assumed). Gap spacing supports `passingGapM` 40 m. |
| C4 | Curb offset, vehicle width and off-pavement parking cannot be judged at 15 cm per pixel from directly above. | **context**: bad parking jobs and off-pavement shares stay photo-based placeholders. Evening street-level photos or a tape-measure survey would replace them. |
| C5 | The County centerline is offset by up to about 5 m from the pavement on some curving hill streets (Bret Harte Rd, Poppy Ln). | **context**: matters for snapping future curb or imagery data to segments. |

---

## Change log: insights applied to the game

| Date | Change | From |
|---|---|---|
| 2026-10-31 | Parked car takes 8 ft (was 6.9 ft); one moving lane needs 10 ft (was 9 ft); engine needs a 10 ft lane (9.25 ft truck plus mirrors; was 3.0 m assumed) | A1, A2, A3 |
| 2026-10-31 | Clear-width map colours use KLD's tiers: ≤ 6 ft severe, 7–8 moderate, 9–10 constrained | A4 |
| 2026-10-31 | Results compare engine travel time with the City's 5-minute standard | A6 |
| 2026-10-31 | Link capacity: two-lane 45 pc/h per mph (max 1,700); multilane 1,900/lane; freeway 2,250/lane (was 700–1,900 by class, illustrative) | B2, B3 |
| 2026-10-31 | Departures drawn from the KLD survey mobilization curve (median ≈ 77 min after order; was lognormal notice + prep with median ≈ 28 min) | B6 |
| 2026-10-31 | 1923 scenario: footprint extended 1.3 km uphill; ignition at today's edge; 6 h run; City region R02 "Fire 1923 All Order" ordered after the decision delay | S4, S10, S11 |
| 2026-10-31 | 1923 central spread calibrated (×0.55): reaches the footprint's west end in 240–302 min (target about 5 h). **Mismatch:** it reaches the 1923 entry point in 38–108 min (target about 150 min) | S11 |
| 2026-10-31 | Panoramic Hill scenario orders City region R04 "Panoramic Hill Fire Order" | A7 |

| 2026-10-31 | Mobilization now uses Time Study Table 5-9 histograms by household type (C/D/E/F); AB 747 curve retired | E9 (supersedes B6) |
| 2026-10-31 | 2.37 persons/household; 7.47% carless, 86.9% of them ride with a neighbour; drivers take 1–4 vehicles per the survey shares | E5, E6, E7 |
| 2026-10-31 | Compliance: 100% of Order zones, 50% of Warning zones, 20% shadow elsewhere in the city (shadow evacuees drive to the city edge) | E8 |
| 2026-10-31 | 1923 and Panoramic scenarios order/warn the Time Study's R02/R04 zone lists; east-wind scenarios order City region R05 (Fire Zones 2–3). Fixed multipart regions being read as their first part only | E2, E3 |
| 2026-10-31 | Time-of-day presets replaced by Time Study cases S1–S6. Residents are no longer reduced in daytime (resolves conflict S1) | E11 |
| 2026-10-31 | Leave-early options set to the study's 10 / 50 / 75% | E13 |
| 2026-10-31 | Fire spread calibration applied to all scenarios: central head rate 14 m/min (low 7, high 28) | S11 |
| 2026-10-31 | Evacuation time reported as the Time Study's ETE (from the first order); `tests/calibration.mjs` compares the game with Tables 7-1/7-2 with fire switched off | E21, E22 |
| 2026-11-01 | Parking varies by block and seed (none / one side / both, partly off the pavement, bad parking jobs) in a shared `js/parking.js`; the City survey's width with parking becomes the both-sides case; residents stop parking where under 8 ft would remain | Eric photos, C1–C3 |
| 2026-11-01 | Take-turns lanes: two-way segments with one lane or less between parked cars share one lane's capacity, with lost time per change of direction | Eric 2026-11-01 |
| 2026-11-01 | Returning commuters drive in against the evacuation before their household leaves (Time Study households awaiting a commuter); a commuter turned back by fire leaves the household one car short | E9, E11 |
| 2026-11-01 | New parking plans: one side only in Fire Zones 2–3; enforce parking tight to the curb | Eric photos |
| 2026-11-01 | Gridlock relief (180 s) and rotating processing order, after a permanent lock-up at the Marin traffic circle | model fix |

### Calibration check (fire off, study order/warning zones, seed 1), 2026-10-31

90th / 100th percentile ETE, h:mm after the order. Run with `node tests/calibration.mjs`.

| Region · case | Study p90 | Game p90 | Study p100 | Game p100 |
|---|---|---|---|---|
| R02 1923 · S1 summer midweek | 2:25 | 1:44 | 3:40 | 3:31 |
| R02 1923 · S2/S3/S5/S6 (weekend, night) | 1:45–1:50 | 1:33–1:34 | 3:25 | 3:05 |
| R02 1923 · S4 fall midweek | 2:55 | 1:50 | 4:10 | 3:31 |
| R04 Panoramic · S2/S3/S5/S6 | 1:35–1:40 | 1:33 | 3:25 | 2:45 |
| R04 Panoramic · S1/S4 | 1:40–1:45 | 1:46–1:53 | 3:40 | 3:15 |

Reading: night and weekend cases are within about 15 min at the 90th percentile; the study says these are set by mobilization, which we now take from the study. Weekday daytime cases are too fast because employees, students, visitors and through traffic (E12) are missing; the study says congestion sets those cases. The 100th percentile is 20–40 min short, partly because the study's tail includes 180-min transit-dependent mobilization (E29), which we don't model.

**Recheck 2026-11-01** after the parking, take-turns and returning-commuter changes (median of 3 seeds): R02 S2/S3/S5/S6 1:34–1:35, S1 1:45, S4 1:51; R04 S2/S3/S5/S6 1:35, S1 1:45, S4 1:51 (range up to 2:09). All vehicles now finish in every case (100th percentile R02 3:09–3:31). These changes move the 90th percentile by about 1–2 min: evacuation traffic runs mostly one way, so taking turns rarely binds, and departure timing and intersections still set the ETE. Engine access is where parking matters: hill length closed to engines is about 10–12 km under the status quo, 6–9 km with tight-to-curb parking, 3–4 km with one side only, 5–6 km with no parking on City narrow roads.

Also consistent with the study: in the 1923 repeat, 50% leave-early (Plan B) changes the 90th-percentile ETE by about 1 min. The study found −3% to −14% with normal mobilization (E13). It does cut exposure to fire and embers by about 40% in the game.
