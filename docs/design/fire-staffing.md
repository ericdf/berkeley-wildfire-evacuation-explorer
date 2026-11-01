# Berkeley Fire staffing and callback: design note

Status: design note, 2026-11-01. Nothing here is built. Sources were read on 2026-11-01; every insight is logged in `SOURCE_NOTES.md` under "Berkeley Fire staffing, callback and mutual aid" (rows FS1–FS12). The simulator is an educational comparison tool, not a prediction and not an official evacuation or deployment plan; the same holds for everything proposed here.

## Summary

- **On-duty staffing is public and small; where off-duty members live is not public at all.** Berkeley Fire puts 27 to 35 firefighters on its 9 fire companies each day, plus 8 paramedics on 4 ambulances (derived from the labor agreement and 2025 staff reports, FS1, FS4). By EMBER's figure of five to six apparatus and at least 15 firefighters for one house fire (SOURCE_NOTES M4), that is enough for one or two house fires at once. No public source gives where off-duty members live, even in aggregate (FS7).
- **The callback question matters less for this simulator than the first hour does.** The only Berkeley callback on record, the 1991 Tunnel Fire, took 68 minutes from the recall order to staffed reserve engines, on a Sunday with the roads outside the fire open (FS5). In that fire about 800 structures ignited in the first hour (FS6). Engine reach, the simulator's main engine measure, is reported at ignition, when only on-duty crews count; a callback of an hour or more reaches the later 5-minute snapshots only. So the number that matters most here is how many companies are on duty and in quarters when the fire starts, which the public record nearly gives, and the residence question, which it does not answer, matters less.
- **A scratch test shows that this already changes a result the simulator reports.** Engine reach assumes an engine is available at every one of the 7 stations. With the engines from Stations 7 (Shasta Rd) and 4 (Marin Ave) committed elsewhere, hill residents no engine can reach within the City's 5-minute standard rise from 1,510 to 5,892 (status-quo parking, median of 5 seeds; FS12). The one-side parking option's benefit grows from 500 to 2,581 residents in the same test.
- **Recommendation: build option (a) first, in its smallest form,** a scenario setting for which companies are committed at ignition, used only for engine reach. Add callback and mutual aid timing only as labeled assumption sweeps, and only if a sweep changes a comparison. Leave competing demands (b) until the police-signal setting (HANDOFF 7a) exists, and suppression (c) to Phase 3.

## 1. The question

Eric, 2026-11-01 (SOURCE_NOTES, Eric's section): many Berkeley Fire Department members live outside Berkeley. In a large regional disaster, crews called in from home could be delayed reaching the city, so the department may be short-staffed until they arrive. He was not sure whether it is possible or valuable to model.

For the simulator the question becomes: when would fewer available crews change what a user sees? Three places are candidates: engine reach (which engines can get to hill homes within 5 minutes), work that competes for crews during an evacuation (traffic control, assisted evacuation, medical calls), and the fire itself (which the simulator does not let engines fight).

## 2. What is public

| Item | Figure | Source | Category |
|---|---|---|---|
| Normal in-service staffing | 7 engines × 3, 2 trucks × 3, 4 ambulances × 2 = 35 seats | Labor agreement (MOU) with IAFF Local 1227, 2023–2026, §39.1 (PDF p. 66) | sourced |
| Fourth firefighter | Both trucks, then up to two engines, as paramedics replace firefighters on ambulances (MOU §42.3–42.6, pp. 67–68); Citygate asked for six of nine units at four; Engine 3 permanently from mid-2025, Engines 4 and 7 on high-hazard days at about $3,600 a day; a FEMA SAFER grant for a fourth firefighter on three engines | Special Item 1c, Council, 2025-02-11, pp. 4–5 | sourced |
| Daily on-duty total | 37 (35 seats, an EMS supervisor, one battalion chief) to about 45 (all six Citygate units at four, plus Engines 4 and 7 on a fire-weather day). Firefighters on fire companies: 27 to 35. | Our arithmetic on the rows above; no public source states the total | derived |
| Shift pattern | 56-hour week, three platoons: about two-thirds of line staff are off duty at any moment | FY26 Fire presentation, 2025-05-22, slide 2; MOU §42.2 ("14 per shift") | derived |
| Backfill | Vacancies are filled "by float personnel first, then voluntary overtime, then forced/mandatory overtime"; 12% of staff (21 FTE) were on injury leave or in vacant positions | FY26 Fire presentation, slides 3 and 7 (G9) | sourced |
| Emergency recall | Allowed immediately "based on a local or regional emergency that requires extra staffing as quickly as possible"; travel time paid, four-hour minimum. No time standard and no residence rule. | MOU §38.11 (p. 65), §16.11.2–16.11.3 (p. 30) | sourced |
| Callback timing, 1991 | Berkeley's chief ordered the recall of chief officers and the "B" platoon at 12:22 p.m. to staff reserve apparatus (3 engines, 1 truck); records show them staffed by 1:30 p.m. Oakland's off-duty members kept reporting until 4:00 a.m. the next day. | Cal OES, *The East Bay Hills Fire: A Multi-Agency Review*, 1992, PDF pp. 25, 27 | sourced (one event, 1991) |
| Mutual aid, 1991 | Oakland's flare-up at 10:58 a.m.; first strike teams (5 engines each) reached Hiller Highlands between 1:15 and 1:30 p.m., after every structure there had burned; teams sent to stage at Hiller and Tunnel Roads were slowed by traffic on Highway 13. 440 engine companies in all. | USFA TR-060, *The East Bay Hills Fire*, PDF pp. 12, 39, 43–44 | sourced (one event) |
| Mutual aid system | Operational Areas may order up to five strike teams of "immediate need" resources directly from one adjacent Operational Area. No statewide arrival-time standard was found. Santa Clara County's plan expects mutual aid within its Operational Area to respond within 30 minutes of dispatch. The Alameda County Operational Area plan is not online. | Cal OES Operations Bulletin 1, April 2022; Santa Clara County Appendix 2, April 2021; G9 | sourced (no Alameda figure) |
| Regional disaster | After a Hayward Fault earthquake, "Outside fire departments may not be able to provide mutual aid" | 2024 LHMP, p. B-51 (G9) | sourced |
| Where members live | No public aggregate for Berkeley. Comparison: 71% of San Francisco firefighters lived outside San Francisco in 2019, and SFFD's spokesperson called recall timing "very speculative". State law bars a city from requiring residence in the city but allows a "reasonable and specific distance" (Gov. Code §50083; Cal. Const. art. XI §10(b)). The Berkeley MOU has no distance rule. | Mission Local, 2019-07; statutes; MOU | none for Berkeley |
| Station 4 | Proposed for closure in the FY 2027 budget; its future depends on a half-cent sales tax on the November 3, 2026 ballot. Chief Sprague told the Council that Station 7 is the slowest but isolated (as reported). | Berkeley Scanner, 2026-05-21; Bay City News, 2026-06-27 | sourced, undecided |

Demands that compete for crews in a fire in the wildland-urban interface (WUI), with the figures we have:

- **Fire attack and structure protection.** One house fire needs "five to six fire apparatus and at least 15 firefighters" (EMBER, Special Item 01a, 2025-02-11, p. 7; M4). Berkeley's on-duty fire companies cover one or two such fires (derived).
- **Assisted evacuation.** The City's 2025 staff report expects "responders [to] divert efforts from property conservation to supporting evacuation" if evacuation starts after ignition in extreme weather (Special Item 1c, p. 1). In 1991, Oakland crews "had to retreat and evacuate residents ahead of fire" (USFA TR-060, summary table, PDF p. 12). The Time Study puts 1,686 people (1.4%) without a car or a ride, 6% of households needing outside help, and, for Panoramic Hill alone, 13 buses, 28 wheelchair vans and 27 ambulances (E7, E29); Berkeley staffs 4 ambulances.
- **Traffic control points (TCPs)**, intersections staffed to direct traffic. The Time Study asks the City to rank them from its congestion diagrams, "among the numerous competing life-safety needs" (p. 11-1), and wants signals that "minimize the need for emergency personnel to manually direct traffic" (p. 11-7). Eric expects Berkeley police to take over signals (HANDOFF 7a), so most TCP staff would be police.
- **Medical calls and other fires.** The same staff report lists "structure fires ignited by embers, medical emergencies including burns and smoke inhalation, calls for help from trapped residents, and traffic collisions" (p. 6). In 1991, with all of Berkeley's companies at the fire, one engine had to be diverted to a separate structure fire in Berkeley (USFA TR-060, PDF p. 41).

The 2025 Palisades Fire adds a lesson about timing. The Los Angeles Fire Department did not hold over the off-going shift that morning; "A recall of all members to fill every available seat was implemented after the start" (LAFD After-Action Review, quoted by ABC7, 2025-10-08). LAFD now recalls all staff during every Red Flag Warning (AARR fact sheet). In the Palisades Fire, as in 1991, the first hours were decided by the crews on duty at ignition.

## 3. What the simulator does with engines now

- **Engine route to the fire edge** (`computeResponder` in `js/sim.js`): the fastest engine route from any of the 7 Berkeley stations to the road node nearest the ignition that the fire will not reach for 5 minutes, with traffic and fire, every few minutes. It is one engine, and it is always available.
- **Engine reach** (ER1–ER3): the share of hill residents (Fire Zones 2–3, Berkeley zones) whose street an engine can reach within 5 minutes from the nearest station, at ignition and every 5 minutes. Every station counts as a source at all times, so the rule assumes every company is in quarters.
- **Engines do not fight fire.** No crew slows the fire, protects a house, staffs a TCP or carries a resident. Households without a car or a ride stay at home (README, "No vehicle").
- Stations outside Berkeley (Oakland, Kensington, Albany) are not in the station layer.

So staffing can enter in only one place without new mechanics: which stations count as sources for engine reach, and when.

### Scratch test: engine reach with stations unavailable

Run on 2026-11-01 outside the simulator (a script that reuses `engineReachStats`, nothing committed): east-wind fire, central severity, night (S6), seeds 1–5, hill residents in Berkeley zones (about 27,850) an engine cannot reach within 5 minutes at ignition. Medians, with the range over seeds where useful:

| Stations unavailable | Status-quo parking | One side only in Fire Zones 2–3 |
|---|---|---|
| None (today's rule) | 1,510 | 1,010 |
| 3 (Russell St) | 1,510 | 1,010 |
| 7 (Shasta Rd) | 2,569 | 1,514 |
| 4 (Marin Ave) | 2,865 | 1,334 |
| 7 and 4 | 5,892 (4,863–6,176) | 3,311 (2,548–3,448) |
| 7, 4, 3 and 2 | 9,326 | 8,326 |
| All but 1 and 6 | 11,587 | 10,392 |

Taking a station away can only lengthen drive times; the size of the change varies with each seed's parked cars. Two readings matter. First, the north hills depend on two stations: lose Engines 7 and 4 and about 4,400 more hill residents fall outside 5 minutes, about one in six. Those are the companies Citygate names as "closest to the eastern hills" (Special Item 1c, p. 4), so they are the first committed in a hill fire. Second, the parking result depends on staffing: one-side parking saves 500 residents with every station available and 2,581 with Engines 7 and 4 away. The usual limits apply: engine speeds of 1.15 × posted with no turn or grade delay understate drive times (ER3), and a station counts as all or nothing, while Berkeley Fire moves companies to cover empty stations.

## 4. Options, smallest to largest

### (a) Engines available by time after ignition, used only for engine reach and the engine route

**(a1) Committed at ignition.** A scenario setting, "Fire companies in quarters": all (today's rule); first alarm committed (the engines from the nearest stations to the ignition leave the source list); Station 4 closed (a sourced proposal, pending the November 2026 vote).

**(a2) Availability over time.** Adds the companies that return over time: recalled reserve companies after a callback delay, mutual aid strike teams after an arrival delay, both shown as sweeps (for example 60, 120 and 240 minutes, and never).

- *Inputs:* the 7 stations (have), companies per station (MOU §39.1, sourced), which companies a first alarm commits (assumption; a first alarm in 1991 was 2 engines and 1 truck, Cal OES review p. 25), callback delay (assumption anchored on 1991's 68 minutes), reserve apparatus (3 engines and 1 truck in 1991; today's count is not public), mutual aid arrival (assumption anchored on 1991, 2¼–2½ hours to the first strike teams).
- *What the user sees:* the engine reach row and street colors under the chosen availability, and in (a2) engine reach every 5 minutes as availability changes. The parking question could show its result under "all in quarters" and "first alarm committed".
- *How it could mislead:* it could read as Berkeley Fire's deployment plan, or as a forecast of response times. It ignores move-up coverage, so it overstates gaps after the first minutes. The callback sweep can suggest that residence data would settle the question, when the 1991 timeline says the first hour is decided by who is on duty.
- *What stays an assumption:* which companies are committed, every delay, reserve apparatus, and engine speeds. Only station locations, seats per company and the Station 4 proposal are sourced.

### (b) Competing demands

Crews assigned to traffic control points or to carrying households without a car leave the available-engine pool, and those tasks change traffic or exposure.

- *Inputs:* TCP locations (Time Study App. F congestion points; City `Signals` layer, G4), staff per TCP and who staffs it (assumption; police in Berkeley, so this belongs with HANDOFF 7a), assisted-evacuation capacity per crew and trip (assumption; Time Study loading times per passenger, E29), mobilization delay (Time Study 90 and 180 minutes for buses, E29).
- *What the user sees:* a plan setting that trades engines in quarters for TCPs or assisted trips, with engine reach, clearance times and people without a car still there when embers arrived moving in opposite directions.
- *How it could mislead:* the allocation rules have no public source, so the settings could be tuned to make any trade look good. It invites a reading that Berkeley Fire would staff TCPs, which the Time Study does not say.
- *What stays an assumption:* nearly everything beyond TCP locations and the Time Study's bus figures.

### (c) Suppression effects

Engines on the fire line slow structure ignition or house-to-house spread.

- *Inputs:* buildings and structure ignition (Phase 3, not started), a crew effect on spread (no source gives a dose-response; EMBER says "extreme weather appears to nullify most interventions", M3), water supply (1991 lost pressure when pumps lost power).
- *What the user sees:* homes lost or saved by staffing level.
- *How it could mislead:* this is the closest to a prediction of losses, and it would rest on an effect size nobody has published for Berkeley.
- *What stays an assumption:* the effect itself.

## 5. Recommendation

1. **Build (a1) first.** It needs no new data beyond what is public, touches only the station source list in `engineTimes`, and the scratch test suggests an effect well above the Simple-view bar (15 of 15 pairs, a median change of 5% or more; P19). Treat it as worth keeping if, rerun across the three Simple-view fires, the first-alarm setting changes hill residents beyond 5 minutes in 15 of 15 pairs and changes the size of the parking result by at least as much as the parking option does today. If it does, the parking question's text should report both numbers.
2. **Add (a2) only as a sweep, and keep it if it changes a comparison.** Because no public source says where members live or how long a recall takes today, show callback and mutual aid delays as a range the user picks from, labeled assumption, with 1991's 68 minutes and 2¼ hours as the stated anchors. If engine reach at 30–60 minutes does not change across the sweep, say so in Assumptions & limits: for this simulator the off-duty question matters less than on-duty staffing at ignition, and that is the finding to show Eric's question.
3. **Do (b) after the police-signal setting (HANDOFF 7a),** which defines TCPs and who staffs them; assisted evacuation fits with Phase 2's transport for households without a car (E29).
4. **Leave (c) to Phase 3,** and only if a sourced effect size turns up.

Keep the framing in every place staffing appears: "Fire companies in quarters" is a scenario setting and a model rule, not a description of how Berkeley Fire deploys. Each availability setting names its category (sourced: stations and seats per company; assumption: which companies are committed and every delay). Results with staffing settings carry the same "not a prediction" line as the rest. Do not ask for or store anything about individual firefighters; if Berkeley Fire ever offers a residence breakdown, use it only as counts by distance band, logged in `SOURCE_NOTES.md`.

## 6. Gaps worth filling

- The daily on-duty total and which units carry a fourth firefighter today (derived as 37 to about 45; the 2023 Citygate Standards of Cover, which would state it, is not posted).
- Reserve apparatus that recalled crews could staff today, and the recall procedure (not in the MOU). In 1991 recalled crews could add only as many companies as there were reserve rigs: 3 engines and 1 truck.
- Distance bands for off-duty members' homes, in aggregate only.
- The Alameda County Operational Area fire mutual aid plan and any expected arrival time for strike teams.
- The MOU expired June 30, 2026; a successor agreement was not checked.
