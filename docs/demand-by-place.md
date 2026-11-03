# Household mix by place: comparison runs

Run 2026-11-03 with `node tools/demand-compare.mjs --workers 1` (results in `data/model/demand-compare.json`; SOURCE_NOTES DM17). Today's plan, seeds 1–3, each seed under both settings; values are medians with the min–max range over seeds. These are synthetic runs for comparing settings, not predictions. People still there when embers arrived counts people, not casualties.

The two settings differ only in each zone's persons per household and share of households without a vehicle:

- **Citywide (default):** 2.37 persons and 7.47% carless in every zone (2025 Evacuation Time Study, from its resident survey).
- **By place:** ACS 2020–2024 block-group values allocated to each zone (149 of 169 zones; the rest keep the citywide values). Across Berkeley's zones the ACS gives 2.27 persons and 20.7% carless; across the model area 2.29 and 14.6% (SOURCE_NOTES DM2–DM4).

## Findings

- **By place puts four times as many carless households in the 1923 order area and two to three times as many in the east-wind and Panoramic Hill areas.** The 1923 repeat orders the flats near campus, where the ACS carless share is highest: ordered carless households rise from 1,348 to 5,707, and people with no car and no neighbor to ride with from 460 to 2,063. The north-hills order area changes least (935 → 1,238 carless households), because the hill zones there have few carless households in the ACS.
- **Evacuation times hardly move, and where they move they fall.** Fewer households own cars, so fewer vehicles leave (1923 fire, weekday: 38,968 → 34,966). The 90% ETE falls by 7 minutes on the 1923 fire, is within a minute on the east-wind and north-hills fires, and is not reached within the Panoramic Hill run under either setting; with the fire off, Panoramic Hill's weekday time falls by 6 minutes. With the fire off, the weekday (S4) times the simulator already gets too fast against the Time Study stay too fast: by place does not close that gap (1923 region S4 90% ETE 95 → 93 min against the study's 175).
- **People with no car still there when embers arrived rise on every fire except the north hills** (1923 135 → 520; Panoramic Hill 57 → 257; east wind 73 → 221), and the total still there when embers arrived rises by about 290–370 people on the 1923, east-wind and Panoramic Hill fires, within the seed ranges for each. North hills: carless people still there fall from 64 to 26.
- **Cars cut off with no route out change little** (Panoramic Hill 265 → 149, fewer cars on its streets; others within a few vehicles).

Applying the ACS to the default would shift the story from traffic to carless residents in the flats, which the simulator handles only by neighbor rideshare (86.9%) or counting them stranded. That is a reason to settle the 7.47% vs 20% conflict (DM3) before turning by place on, and to look at assisted evacuation (`docs/design/assisted-evacuation.md`).

## With fire: the four Simple-view fires, central severity

Each fire at its own time of day. ETE is the Time Study's measure, minutes from the first order until 90% of evacuating vehicles have left the order and warning area; "—" means 90% (or 100%) was not reached within the run.

| Fire (case) | Measure | Citywide | By place |
|---|---|---|---|
| East wind (S6) | Vehicles evacuating | 15,314 [15,185–15,369] | 13,984 [13,978–14,009] |
| | Carless households ordered or warned | 955 [934–993] | 2,244 [2,193–2,246] |
| | People with no car and no ride | 327 [237–329] | 702 [637–716] |
| | 90% ETE, min | 92 [92–92] | 92 [91–93] |
| | People still there when embers arrived | 5,641 [4,130–6,073] | 5,929 [4,431–6,509] |
| | of them with no car | 73 [38–73] | 221 [177–253] |
| | Still there when the fire front arrived | 228 [145–296] | 327 [241–419] |
| | Cars cut off (no route) at the end | 41 [31–42] | 36 [33–43] |
| 1923 repeat (S4) | Vehicles evacuating | 38,968 [38,699–38,999] | 34,966 [34,904–35,006] |
| | Carless households ordered or warned | 1,348 [1,297–1,359] | 5,707 [5,635–5,868] |
| | People with no car and no ride | 460 [434–465] | 2,063 [1,954–2,137] |
| | 90% ETE, min | 105 [102–109] | 98 [96–100] |
| | People still there when embers arrived | 5,496 [3,331–6,843] | 5,799 [3,849–6,729] |
| | of them with no car | 135 [128–164] | 520 [496–534] |
| | Still there when the fire front arrived | 571 [327–571] | 744 [525–770] |
| | Cars cut off (no route) at the end | 132 [58–145] | 124 [75–131] |
| Panoramic Hill (S4) | Vehicles evacuating | 4,947 [4,868–5,779] | 3,901 [3,695–4,521] |
| | Carless households ordered or warned | 307 [265–450] | 856 [821–1,049] |
| | People with no car and no ride | 114 [92–149] | 327 [308–434] |
| | 90% ETE, min | — | — |
| | People still there when embers arrived | 13,286 [12,369–14,514] | 13,658 [12,820–14,663] |
| | of them with no car | 57 [57–66] | 257 [253–280] |
| | Still there when the fire front arrived | 3,772 [3,194–4,197] | 4,150 [3,544–4,640] |
| | Cars cut off (no route) at the end | 265 [248–281] | 149 [122–157] |
| North hills (S6) | Vehicles evacuating | 13,517 [13,462–14,327] | 13,662 [13,661–14,488] |
| | Carless households ordered or warned | 935 [882–956] | 1,238 [1,216–1,248] |
| | People with no car and no ride | 270 [270–273] | 302 [265–357] |
| | 90% ETE, min | 93 [92–93] | 92 [92–93] |
| | People still there when embers arrived | 3,681 [3,510–4,250] | 3,542 [3,424–4,179] |
| | of them with no car | 64 [62–71] | 26 [13–28] |
| | Still there when the fire front arrived | 320 [230–424] | 300 [210–371] |
| | Cars cut off (no route) at the end | 26 [14–31] | 21 [8–30] |

Synthetic households in the whole model area: 83,017 citywide, 86,621 by place (lower persons per household gives more households).

## Fire off: the Time Study's regions (as `tests/calibration.mjs`)

90% / 100% ETE in minutes after the order, study value first.

| Region · case | Study p90 / p100 | Citywide p90 / p100 | By place p90 / p100 | Vehicles, citywide → by place |
|---|---|---|---|---|
| R02 1923 · S4 weekday | 175 / 250 | 95 [95–96] / 205 [200–208] | 93 [93–94] / 204 [199–210] | 38,790 → 34,784 |
| R02 1923 · S6 | 105 / 205 | 91 [90–91] / 183 [180–195] | 90 [90–90] / 181 [178–182] | 24,209 → 20,256 |
| R05 Fire Zones 2–3 · S4 | 140 / 220 | 105 [105–106] / 206 [204–212] | 105 [105–105] / 208 [205–209] | 17,283 → 15,952 |
| R05 Fire Zones 2–3 · S6 | 105 / 205 | 92 [91–92] / 181 [174–182] | 92 [91–92] / 182 [177–184] | 15,125 → 13,801 |
| R04 Panoramic Hill · S4 | 105 / 220 | 107 [102–130] / 195 [181–206] | 101 [100–103] / 198 [189–204] | 4,506 → 3,331 |
| R04 Panoramic Hill · S6 | 100 / 205 | 93 [93–102] / 137 [135–158] | 93 [91–96] / 137 [134–162] | 3,465 → 2,271 |
| R09 North Berkeley Hills · S4 | 125 / 220 | 106 [106–106] / 206 [206–209] | 106 [106–106] / 206 [206–208] | 12,582 → 12,753 |
| R09 North Berkeley Hills · S6 | 105 / 205 | 92 [91–93] / 182 [182–195] | 92 [92–92] / 181 [180–189] | 11,185 → 11,345 |

## Limits

- Block-group margins of error are wide (DM4); the setting uses point estimates, and a zone's range can span several times its estimate. A run across the MOE ranges was not done.
- Uniform rates within a block group are an assumption, and ACS persons per household counts people in households only, while zone populations include group quarters (DM7).
- Vehicles taken by driving households, mobilization, compliance and the 86.9% rideshare share are the Time Study's and are unchanged.
- Three seeds at central severity, today's plan only. No Simple-view question was rerun under by place.
