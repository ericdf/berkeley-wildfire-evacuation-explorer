# Handoff: fire families (opt-in), east wind from 60°

Decided by Eric, 2026-11-02:
1. Build fire families as an **opt-in** choice, shown only after a disclosure of what they mean.
2. Move the east-wind fire (`eastWind`, and its daytime twin `eastWindDay`) from 75° to **60°**.
3. **No summer westerly fire.**
4. Users never move an ignition point or set a wind direction. A family is a fixed, sourced list.

Sources: SOURCE_NOTES FF1–FF15 (PR #32). Read them first; FF15 is the proposal this builds.

Rules that still hold (AGENTS.md, CLAUDE.md): no push to `main` or `pages` and no merge without
Eric's approval in session; do not put the maintainer's name or email in any request to an outside
service, a commit or a file; log every source-derived choice in SOURCE_NOTES.md.

## Part A: east wind from 60° (do first, its own PR)

- `js/scenarios.js`: `eastWind` and `eastWindDay` `windFrom: 75` → `60`. Update `sources` to cite
  FF4 (70–80° held 1.5% of dry windy hours at Oakland North; 20–70° held 71.8%) instead of
  "illustrative". The ignition point stays.
- Re-run and re-baseline everything that depends on it, and report the before/after in the PR:
  `tests/headless.mjs`, `tests/calibration.mjs`, `tests/fire-reach.mjs`, `tests/stack.mjs`
  (uses eastWind), `tests/plan-draws.mjs`, `tests/retreat-draws.mjs`.
- Regenerate `data/model/mitigations.json` and `docs/mitigations.md` with `tools/mitigations.mjs`.
  The greyed-out changes in "Change the plan" come from this table, so list any lever whose
  verdict on eastWind flips.
- Check copy that describes the east-wind fire's direction ("east wind", blurbs, README, HANDOFF,
  the help text in js/main.js). The fire keeps its name; say "from the east-north-east" only where
  the text gives a direction.
- Change log row in SOURCE_NOTES.

## Part B: the families

### Members (FF15)

A member is one ignition point × one wind direction. Wind: 30°, 45°, 60° for every fire. Speed,
severity, time of day, duration and evacuation orders stay as the fire's.

| Fire | Ignition points | Members |
|---|---|---|
| `ref1923` | the City's point only (it reproduces the City's scenario, S11) | 3 |
| `northHills` | current (Tilden east of the Summit); Wildcat Canyon Rd near Lake Anza (1923, 1980 origins); Grizzly Peak Blvd at Centennial Dr (2024 start) | 9 |
| `eastWind` / `eastWindDay` | current (wildland near Grizzly Peak Blvd, the turnout corridor); Fish Ranch Rd on the east slope (1970 origin; WFIGS "Fish") | 6 |
| `panoramic` | current (above Panoramic Hill, upper Strawberry Canyon side); upper Claremont Canyon at Grizzly Peak Blvd / Claremont Ave (1970 path) | 6 |

- The default member of each fire is the fire as it is today (current point; 45°, or 60° for east
  wind). With families off, nothing changes.
- Place each new point on a wildland fuel cell (`fuel >= 0.7` in `buildGrid`) within the model box,
  and record its coordinates, the landmark and the source row in `js/scenarios.js` and
  SOURCE_NOTES. The exact points are our assumptions anchored to sources; say so.
- `ref1923` has a `clip` (the 1923 footprint shifted uphill). At 30° and 60° the clip will cut the
  fire. Measure how much, and report it. Do not widen the clip without asking Eric: the footprint
  is the City's.
- Orders stay the fire's (a Time Study region). Some members will burn outside the ordered region.
  That is a real finding, not a bug: measure it per member (fire-reach cells outside the ordered
  zones in the first 2 h) and put it in the PR and in SOURCE_NOTES. Do not add orders.

### Where it appears

- **Change the plan only.** A comparison with families on makes its passes across the members:
  each pass is one member at one severity and seed, both plans on the same draw, as now. Passes per
  member: one per severity (low, medium, high) and enough seeds that the total is at least 15:
  ref1923 3×3×2 = 18, northHills 9×3×1 = 27, eastWind and panoramic 6×3×1 = 18. Show the
  count on the button, as now, and the time it took.
- Verdicts (holds / mostly / harm, the 1% noise rule) are over all the passes. Under the verdicts,
  add one line per measure when the change helps at some members and not others: "Helps when the
  fire starts at X; no reliable effect when it starts at Y". Do not rank members.
- "Break down this plan" works over the same passes (its variants run per member).
- **Today's plan tab:** unchanged. It watches the default member. The map can show the family's
  ignition points as small marks, with the wind arrows, when families are on; no picker.
- Greyed-out changes: still from the stored table (default member). Say so in the grey note when
  families are on: "Tested on this fire's usual start and wind."
- Cache keys: add the member to `state.stackRuns` and `state.todayCache` keys
  (`${fire}|${member}|${stackKey}|${sev}|${seed}`), so family and non-family runs never mix.

### Opt-in and disclosure

In step 1 of the Simple view, under the fire: an unchecked box, "Also test other likely starting
points and wind directions". Checking it opens the disclosure first; the box takes effect only
after "Use them". Draft text, for Eric to edit:

> A fire won't start exactly where this scenario puts it, and the wind won't blow from exactly this
> direction. With this on, a comparison also tries the fire from [N] starting points and from 30°,
> 45° and 60° (north-east winds: most dry, windy hours at the Oakland hills weather station blow
> from 20° to 70°). The starting points are places where fires here have started or where the
> County's fire-pathway study shows fire entering Berkeley. They are our choices, not
> probabilities: no source says where the next fire will start. A comparison takes longer.

Expert mode: same switch in the fire section, same disclosure. The disclosure links to the
SOURCE_NOTES rows.

### Wind speed

Unchanged (decision of 2026-11-02, see below). Add one sentence to Assumptions & limits: "Each
fire's wind, 30 to 35 mph, is an extreme hour: dry north-east winds at the Oakland hills weather
station average that strongly about 1% of the time (1992–2026). The 1923 and 1991 fires burned in
such winds."

### Tests

- New `tests/families.mjs`: every member's ignition is on a burnable cell; a family run with the
  default member only reproduces today's runs exactly; member keys never collide.
- Existing tests unchanged with families off.
- Headless Chrome: opt in, compare a two-change plan on northHills, run the breakdown; check
  counts, time and no console errors.

### Out of scope

User-placed ignitions or user-set winds; a summer westerly fire; wind changes during a run; a
weighting of members by likelihood (there is no source for one).

## Wind speed (answered 2026-11-02)

FF5: the scenarios' 30–35 mph is the top ~1% of dry north-east hours at Oakland North. Lowering
it would not change the fires. In `js/fire.js` the wind speed sets only the fire's
length-to-breadth ratio, and that ratio is capped at `LB_MAX = 3.5`, which the fire reaches at about 11 mph (high
severity), 14 mph (medium) and 18 mph (low). The head spread rate is `rosMpm`, calibrated to the 1923 repeat (medium) and
the 1991 fire's first hour (high), not computed from wind. So any wind from about 18 mph up gives
identical fires; the speed is a label. Keep it, and disclose that it is an extreme hour.
