# Assisted evacuation: design note

Status: design note, 2026-11-03. Nothing here is built. The simulator reports, per evacuation zone, people 75 and older, people with an ambulatory difficulty, one-person 65+ households and licensed care, hospital and school capacity (Inspector; `data/model/demand-by-zone.json`; SOURCE_NOTES DM1–DM16), and adds no trips for any of them. Whether and how to model pickups is the maintainer's decision; this note sets out a design. The simulator is an educational comparison tool, not a prediction and not an official evacuation plan, and the same holds for everything proposed here.

## Summary

- **Today every resident who needs help leaves like everyone else.** A household with a person who cannot walk to a car mobilizes on the Time Study's survey curves, and a carless household that finds no neighbor is counted as stranded. Care homes, skilled nursing facilities, hospitals and schools are not modeled at all; their residents are inside the zones' Genasys population and leave as synthetic households.
- **The public record now gives counts by zone** (ranges from the ACS margins of error): in Berkeley's and the Lab's zones about 8,400 people 75 and older and about 5,300 people with an ambulatory difficulty (sums of zone point estimates; ACS 2020–2024), 6 residential care facilities for the elderly (385 licensed beds), 4 adult residential facilities (80), 5 skilled nursing facilities (253 beds) and 3 hospital licenses (403 beds), plus 19 public and 16 located private schools and 65 child care centers. HHS emPOWER counts 693 Medicare beneficiaries who rely on electricity-dependent equipment in Berkeley's nine ZIPs (one ZIP, 94708, is mostly Kensington and the hills).
- **The Time Study already sized the resources**: 571 buses, 161 wheelchair vans and 253 ambulances citywide; 262 buses, 48 vans and 66 ambulances for a repeat of the 1923 fire, with vehicles reaching medical facilities 90 minutes after the order and transit-dependent pickup routes 180 minutes after (ets.txt §2.4, ES-6–ES-7). Its specialized-transport demand (348 people: 99 in wheelchair vans, 249 bedbound in ambulances) came from emPOWER data the City supplied.
- **Recommendation:** build it as a plan-neutral demand layer first (option A below), reported but not changing traffic, then a labeled intervention (option B) only if the maintainer wants a lever. Option C, facility evacuation as vehicle trips, adds few vehicles and should come last.

## 1. What a household that needs help does in the simulator now

| Step | Today | Category |
|---|---|---|
| Who needs help | Nobody. Age and disability are not used. | — |
| Getting to the car | Instant by default; the opt-in home-to-street access setting adds the terrain's walking time at central speeds, not reduced-mobility ones (`docs/walk-access.md`) | model rule; derived when on |
| Mobilization | Survey histograms by household type (Time Study Table 5-9) | sourced |
| Carless households | 86.9% ride with a neighbor on the same street; the rest are stranded and counted as at risk | sourced (survey) |
| Facilities | Not modeled; their residents are in the zone population | — |

## 2. Options

### A. Demand only: who would need a pickup, by zone and time (smallest)

Add to the results, without new trips, the count of people in ordered zones who would need assistance, split as the Time Study does:

- **Specialized transport** (wheelchair van, ambulance): emPOWER electricity-dependent beneficiaries are the only public count, by ZIP; the Time Study's 1.6% wheelchair van and 0.2% ambulance shares (survey, ets.txt ES-6) applied to a zone's population are the alternative. The two give different totals (348 people from the City's emPOWER extract against about 2,100 from 1.8% of 116,762), a conflict to record and leave to the maintainer.
- **Help to prepare or reach a vehicle**: 6% of households (survey, ES-6), or the ACS ambulatory-difficulty share by zone (about 4% of people in Berkeley's zones).
- **Facility residents**: licensed capacity by zone (CDSS, CDPH), with the Time Study's 45/30/25% ambulatory/wheelchair/bedridden split where nothing better exists (§2.4 2.c.ii).

Each count would be reported as "still in an ordered zone when embers arrived", the same person-once rule as the exposure measures (SOURCE_NOTES FO7), and never as a casualty count. This changes no draw, so every plan comparison stays like for like.

### B. Pickup as a plan setting (an intervention; maintainer's call)

A labeled assumption for when help arrives, compared across plans:

1. Households drawn as needing help (a supplementary per-household stream, keyed by seed and household index, so the shared stream is untouched; HANDOFF "Gotchas") cannot leave until a pickup arrives.
2. Pickup arrival: the Time Study's 90 min (medical facilities, schools) and 180 min (transit-dependent routes) after the order as the "today" case; plan options shorten it (pre-registered list, staged vans in Leave Early Zones on Red Flag days, leave-early for registered households).
3. Pickup vehicles enter from the edge of the order area against outbound traffic, as returning commuters do now, load (5 min per wheelchair passenger, 30 min per bedbound passenger; §2.4 5.d–e), and leave as evacuating vehicles.
4. Fleet size as a setting, defaulting to the Time Study's per-region counts.

New measure: people needing help still at home when embers arrived. It would let a plan trade staging and early departure for pickups, which no current Simple-view question tests.

### C. Facilities as vehicle trips

Each care facility, hospital or school in an ordered zone generates buses, vans and ambulances on the Time Study's capacities (§2.4 3; 70 or 50 students per bus, 2 per van, 2 per ambulance), on its mobilization times. The vehicle counts are small next to resident traffic (the study's 1923 case: 376 vehicles against tens of thousands), so the effect on ETE is likely small, while the effect on people still in facilities when embers arrive could be large. Schools also interact with the child-pickup share already in the model (`childPickupShare`), which would have to be split to avoid counting the same children twice.

## 3. Data gaps

- No public source gives the number of residents who need a pickup by evacuation zone. emPOWER is by ZIP and covers Medicare beneficiaries only; the ACS ambulatory-difficulty table is by tract and counts a difficulty, not a need for help.
- Licensed capacity is not occupancy. Facilities with six or fewer residents (most RCFEs and ARFs) the Time Study assumed would leave in staff cars (§3.5, footnote 13).
- Which homes have stairs from the street is lot-level and not public. `docs/walk-access.md` estimates door-to-curb rise and distance from building footprints and the lidar DEM, and reports reduced-mobility times the simulator does not apply (DATA_INVENTORY "Missing inputs").
- The City's registry of residents needing help (if one exists), the AC Transit and paratransit fleets available, and mutual-aid ambulance arrival times are not public.

## 4. Decisions for the maintainer

1. Whether to build option A (reporting only) and which source sets specialized-transport demand (emPOWER by ZIP or the survey shares).
2. Whether option B becomes a plan setting, and its "today" pickup times.
3. Whether facilities (option C) are worth the added complexity.
