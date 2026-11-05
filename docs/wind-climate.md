# Wind by season and hour at the Oakland North weather station

Measured 2026-11-04 with `node tools/wind-climate.mjs` (summary: `data/model/wind-climate.json`;
downloads cached in `data/raw/wind/wrcc-climate/`, gitignored). Sources and findings are logged in
`SOURCE_NOTES.md` rows WC1–WC9. The simulator is an educational comparison tool, not a prediction and
not an official evacuation plan; these measurements set the winds of its earthquake scenarios.

## Station and method

- **Oakland North RAWS** (COKN; 37.865 N, 122.221 W, 1,403 ft), on the ridge above Gwin Canyon, the
  station the County's fire-pathway study and the East Bay Regional Park District used (SOURCE_NOTES FF4).
  Hourly mean wind: a 10-minute mean at 20 ft.
- **WRCC frequency tool** (raws.dri.edu/cgi-bin/wea_freq2.pl), whole record, June 1, 1992 to
  October 31, 2026, one query per season and element. The tool returns one column per hour of day in
  local standard time (LST), so each hour's distribution is recovered from its count and percentages.
  Direction in 10° bins; speed in 1 mph bins (medians read inside the bin).
- WRCC serves raw hourly listings only for the last 30 days, so this station's record cannot pair an
  afternoon with the following night. That test uses **Oakland airport** (OAK, sea level on the Bay shore;
  Iowa Environmental Mesonet hourly reports, 2008 to October 2026).
- Definitions (ours): onshore = from 180–315°, the half of the compass facing the Bay (200–300° reported
  beside it); north = 340–20°; hour bands 0–5, 6–11, 12–17, 18–23 LST. In daylight time the clock reads
  one hour later.

## Findings

**Onshore share** (the share the earthquake design note left to be measured): 63.3% of all hours blow
from 180–315° (43.3% from 200–300°), out of 289,075 hours with a direction.

| Season | Onshore (180–315°) | East (0–90°) | North (340–20°) | Median speed |
|---|---|---|---|---|
| Winter (Dec–Feb) | 34.9% | 42.5% | 8.3% | 7.2 mph |
| Spring (Mar–May) | 71.6% | 11.5% | 5.1% | 6.4 mph |
| Summer (Jun–Aug) | 86.1% | 3.3% | 2.0% | 6.9 mph |
| Fall (Sep–Nov) | 58.6% | 26.3% | 6.9% | 5.8 mph |
| April | 74.4% | 9.9% | 5.0% | 6.3 mph |

**By hour band.** The most common 10° bin is 200–210° (south-south-west) in every season and band
except winter's night, morning and evening (0–11 and 18–23 LST), when it is 50–60° (north-east). Onshore
shares by band (0–5 / 6–11 / 12–17 / 18–23): winter 34 / 28 / 37 / 40%; spring 71 / 60 / 75 / 80%;
summer 86 / 81 / 88 / 90%; fall 59 / 47 / 63 / 66%. The onshore share is lowest in the morning and
highest in the evening in every season; at this ridge the sea breeze does not die at dusk.

**HayWired's afternoon.** The HayWired earthquake strikes at 4:18 p.m. on April 18 (USGS, SOURCE_NOTES
EQ1), 3:18 p.m. LST. In April, from 3 p.m. to 9 p.m. LST, the most common direction is 200–210° at every
hour, 80–87% of hours are onshore, and the median speed of onshore hours falls from 7.0 mph (3 p.m.) to
6.8, 6.3, 5.7 and then 5.4 mph (7–9 p.m.). The evening change at the ridge is a slowing, not a turn.

**Reversal between afternoon and night (OAK, day by day).** Of days whose afternoon (12–17 LST) wind
was onshore, the share whose evening (18–23) or following night (0–5) mean wind had turned 135° or more:

| Season | Afternoon onshore | Evening reversed | Night reversed | Night from 0–135° |
|---|---|---|---|---|
| Winter | 73.9% | 16.0% | 39.2% | 61.3% |
| Spring | 96.4% | 0.7% | 14.8% | 22.6% |
| Summer | 99.5% | 0.1% | 1.6% | 6.9% |
| Fall | 92.1% | 4.3% | 18.3% | 40.2% |
| April | 98.6% | 0.7% | 13.9% | 22.1% |

At the shore the evening wind holds its direction (median turn 7° in April); reversal is a night event,
common in winter and rare in summer. The ridge's aggregate pattern agrees: winter afternoons are
mostly 200–210°, winter nights mostly 50–60°.

**North winds.** In winter 8.3% of hours blow from 340–20° (6.0% of afternoon hours, 9.8% of night
hours). Their median speed is 7.5 mph (90th percentile 19.3 mph); by hour, 5.7–5.8 mph at 4–5 p.m.
LST and 6.3–8.5 mph from 6 to 10 p.m. Their median relative humidity is 56%, and 6.5% of them are at
25% or below: winter north winds at this station are mostly humid. The sector's most common bin in
winter is 10–20°.

## What the simulator uses

- **Earthquake scenarios** (`js/scenarios.js`): a spring afternoon from 205° with the April hourly onshore
  medians from 3:18 p.m. LST (7.0 → 5.4 mph); a winter day with a north wind from 0° (the middle of the
  340–20° sector, a model choice) with the winter north-wind hourly medians from 4:18 p.m. LST
  (5.7 → 8.5 mph); and the dry east wind, 45° at 30 mph, as the rare worst case (FF4, FF5). The 6-hour
  runs end before the night reversal, so the schedules change speed, not direction.
- **Fire families**: a 0° member, from the dry, windy hours of FF4 (340–20° held 17.6% of them) and the
  Red Flag hours of FV13 (19.3%), not from this all-hours record (SOURCE_NOTES WC9).

## Limits

- One ridge-top station; canyons steer wind, and directions over Berkeley's streets will differ.
- A median hour is a typical hour, not a typical day: the schedules join hourly medians, so they are
  smoother than any single day.
- The tool's whole-record queries are slow (minutes each) and some transfers break; the tool retries and
  caches each page. `tools/wind-events.mjs` asks the same tool for hours 00–23, which drops the 11 p.m.
  column (the end hour is exclusive); its Red Flag summary was not rerun.
