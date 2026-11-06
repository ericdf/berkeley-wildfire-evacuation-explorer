# Product brief: reframe the explorer around spread and access

Source: implementation brief supplied by Eric, 2026-11-06 (PDF, 5 pages), transcribed here so sessions can work from it. Eric approved implementing it in full on 2026-11-06.

## Purpose

Reframe the app as a resident-facing **wildfire spread and access scenario explorer**, not an evacuation-time predictor. It should help a resident or policymaker explore:

1. How fire and ember spread may threaten different neighborhoods under a selected ignition and wind scenario.
2. Which roads, bridges, intersections and narrow links are critical connections or potential choke points.
3. Where a modeled fire, ember exposure, road blockage or traffic conflict could reduce access for residents or responders.
4. Which tested mitigation options appear to preserve access or reduce exposure across multiple plausible scenarios.
5. Which findings are stable across scenarios and which depend on uncertain assumptions.

Do not make exact clearance time the headline. The traffic model is too optimistic against the City study (SOURCE_NOTES CD1–CD16, `docs/model-fix-plan.md`), and exact minutes are not reliable enough to present as forecasts. This is a reframing, not a claim that the model now predicts where fire or access loss will occur.

## Audience and promise

Write for residents, not transportation-model specialists. Keep technical detail in an assumptions view, but explain the meaning and limits of each map in ordinary language.

Suggested promise: "Explore how different wildfire scenarios could affect Berkeley's neighborhoods and routes, and see which access vulnerabilities and possible mitigations recur across scenarios."

Always frame outputs as results of a modeled scenario. Do not imply that the selected ignition, wind, fire path, traffic state or response conditions will occur.

## Claims and language

| Avoid | Prefer |
|---|---|
| "Residents will be trapped here." | "This area has a potential loss-of-access vulnerability in these scenarios." |
| "Fire engines cannot reach these homes." | "The modeled road network does not provide a route meeting the app's five-minute engine-access threshold in this scenario." |
| "The fire will reach this street at 2:10." | "In this run, the modeled fire reaches this area before/after the selected route becomes unavailable." Label any time as simulated model time, not a real-world ETA. |
| "This mitigation makes evacuation safe." | "This option preserves a modeled connection in these runs; it does not guarantee safe evacuation." |
| "X people are trapped / saved." | "X modeled residents are in areas affected by the selected access or exposure condition." Explain the condition and the population estimate. |

Avoid categorical "will", "cannot", "safe", "saved" and "trapped" claims about real emergencies. Use "may", "could", "potential" and "in these runs".

## Resident-facing experience

1. **Replace the opening question.** Replace any opening built on "How long will it take to evacuate?" with the new purpose and a first action: "Choose a fire scenario to explore where fire may spread, which routes may become vulnerable, and what access options a mitigation could preserve." State near the start that this is an educational scenario tool, not an official evacuation map, forecast or instruction to evacuate, and direct users to official alert and evacuation channels.
2. **Four guided questions.**
   1. *Where could fire spread?* Ignition area and wind; modeled fire front and ember exposure as scenario outputs.
   2. *Which routes are critical?* Single-access areas, choke links, narrow roads, links shared by several neighborhoods.
   3. *What could lose access?* The fire scenario combined with road availability and access constraints; possible isolation or responder-access concerns, without asserting people will be trapped.
   4. *Which changes preserve access?* One mitigation at a time against the same baseline scenarios; which connections or access measures change.
   The map stays the main visual. Keep controls few and explain each control's consequence before asking users to change it.
3. **One question at a time on the map.** Show only the layers that question needs, with plain-language legends, units and a sentence on what the colors mean. A selected road or neighborhood's card answers: what modeled feature this is; why it is highlighted in this scenario; which households or places depend on it, if the model supports that count; whether the result recurs across the scenario set or is sensitive to assumptions; what the result does not establish.
4. **Mitigations as paired scenarios.** Same ignition, wind, fire assumptions, population draw and seed, with and without the change. Lead with access measures the model already produces: whether a connection stays available; modeled residents or households depending on it; change in areas with only one modeled drivable way out; change in modeled homes within the engine-reach threshold; whether the direction repeats across the scenario set. Do not call a mitigation effective because it improves one seed or one fire. Show mixed results as mixed. Keep any time-based change secondary and labeled model time.

## Uncertainty and robustness

Use the existing scenario variation, seeds, low/central/high assumptions and assumptions record; add no new data dependency. Summarize each headline finding across the runs already used for that comparison, in one of three states:

- **Consistent in the tested scenarios:** appears in every or nearly every tested run. State the scenario set and the number of runs.
- **Mixed across scenarios:** changes direction or disappears under some tested conditions. Name them.
- **Sensitive to assumptions:** depends on an uncertain parameter or input. Name it and show the low/central/high range where one exists.

Never call a result "probable" or give a probability or real-world frequency; a share of model runs is not a probability. Keep uncertainty next to the result, with expandable provenance.

## Evacuation-time outputs

1. Remove clearance-time estimates from the landing view, headlines, guided-question summaries and mitigation rankings.
2. Remove "minutes until safe", "time to evacuate" and similar forecast language from resident-facing copy.
3. Do not use the current ETE values to rank mitigations or make safety claims.
4. If a simulation clock is needed to explain the sequence of fire and access events, label it **model time** and say it is not a forecast.
5. Keep the City study comparison, if useful, in an assumptions or model-performance section as a transparent record of the traffic-model limitation, not as validation of spread or access outputs.
6. Keep calibration tooling and diagnostics for developers, separate from the resident-facing experience.

The traffic discrepancy is a reason to stop making ETE claims, not a reason to hide the discrepancy or quietly tune the model.

## Data

Do not depend on public-records requests, internal City records or new fieldwork. Use and disclose the sources already in the repository (City and County GIS layers, USGS 3DEP, OpenStreetMap, Census and ACS, the 2025 Evacuation Time Study as context). Add no external dataset unless it fills a named gap, is public without a government response, has a stable source and license, and can be documented. The initial implementation needs no new source.

## Codebase guidance

Inspect main first and preserve existing capabilities: access-constraint analysis, engine-reach measures, fire and ember visualization, mitigation comparisons, the assumptions panel and scenario controls. Review `js/main.js`, `index.html`, `js/sim.js`, `js/scenarios.js`, `data/assumptions.json`, `docs/`, `SOURCE_NOTES.md` and the `tools/` that build precomputed tables (remove or relabel clearance-time tables; regenerate the tables that stay in the guided experience). Do not change physical model parameters as part of the reframe unless a separate, evidenced model defect is found.

## Acceptance criteria

1. The opening screen describes the app as a wildfire spread and access scenario explorer.
2. The guided experience is organized around fire spread, critical routes, possible access loss and mitigation comparison.
3. Clearance-time values no longer headline or drive resident-facing conclusions or mitigation rankings.
4. Every time value still visible to users is labeled simulated model time, not a forecast.
5. Map layers, legends and selection cards explain what is modeled and why a feature is highlighted.
6. Findings carry "consistent", "mixed" or "sensitive" and name the tested scenarios behind them.
7. No language says people will be trapped, roads will be impassable, engines cannot respond, or a mitigation makes evacuation safe.
8. Assumptions and source provenance stay accessible, with known data gaps disclosed.
9. No government response, internal record, field survey or field observation is required.
10. After the copy and UI changes, scenario selection, paired comparisons and map layers still work.

## Suggested resident-facing disclaimer

"This tool explores modeled wildfire and access scenarios using public data and stated assumptions. Its maps show what happens in these simulations, not what will happen in an actual emergency. Fire behavior, road access, traffic, and emergency response can differ. This is not an evacuation order or route recommendation. Follow current instructions from Berkeley and Alameda County emergency officials."
