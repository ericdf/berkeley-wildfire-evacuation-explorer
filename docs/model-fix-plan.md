# Evacuation-time model fix: plan and release gate

Status: proposed, 2026-11-06; steps 1–3 built (step 3 in PR #84, 2026-11-12, not merged). Owner: Eric. Each step runs in its own session and its own PR. Nothing here authorizes a merge or a publish; those need Eric's approval naming the PR.

## Why this exists

The simulator's evacuation times run far faster than the 2025 Time Study. On the calibration cases the 90%-out time is about 90–106 minutes, while the study gives 105–175 minutes (E21, Table 7-1). The weekday-vs-night gap is about 7–14 minutes against the study's 35–70 minutes. Every evacuation-time number on the Guided view, the results panel, Change the plan and Set a goal inherits this bias.

The diagnostic (SOURCE_NOTES CD1–CD7, `data/model/ete-diagnostic.json`, PR #72) traces the cause to three things:

1. **CD3, a bug.** About 16–24% of cars count as out at nodes that sit in no zone (the Z4 (b) free-exit artifact). Known and open.
2. **CD4, edge behavior.** Evacuees vanish when they leave the order and warning area instead of driving on. Worth about +13 minutes on a weekday.
3. **CD5, no signal capacity.** Intersections carry unlimited flow.

Simulated road time is a median of about 4 minutes; the study's road time is 40–80 minutes (E23). The numbers above come from the worker's diagnostic and must be re-checked in step 1, not taken on trust.

## Release gate

No evacuation-time number from the simulator appears in a release (any publish of `pages`, or any text a reader could take as a result) until all of these hold:

- **G1.** On each calibration case, the simulated 90%-out time is within **±10%** of the study's 90% time. Cases: R02 S4 and S6, R05 S4 and S6, R09 S4 and S6, R04 S4 and S6 (Table 7-1, E21). The tolerance is a proposal for Eric to confirm.
- **G2.** The weekday-minus-night gap is within **±25%** of the study's gap on each region that has both times. Also a proposal.
- **G3.** CD3 is fixed and a regression test shows no car is counted out at a node outside every zone.
- **G4.** `tests/headless.mjs`, `tests/calibration.mjs` and `tests/plan-draws.mjs` pass, with calibration changes recorded in SOURCE_NOTES.
- **G5.** Every table that carries an evacuation time (simple-questions, mitigations, goal-combos, plus any other table `tools/` builds that uses clear90) is rebuilt after the fix and its numbers checked against the gate.
- **G6.** Eric approves the release and the publish separately.

Until the gate passes, the display of evacuation times stays as it is on `main`, and the site stays unreleased. The worker's proposed display change (withholding evacuation times) is an option Eric can choose; it is not part of this plan.

## Steps

### Step 1: CD3 bug (model change; driving may change)

Decided by Eric, 2026-11-06 (recommendations accepted):

- Step 1 may change routes and driving, limited to the smallest change that stops counting cars out at zone-less nodes. The bug and the routing share code, so the fix cannot leave driving unchanged.
- A car that reaches a gap outside every zone outline is counted out only at a designated exit in a zone. Until then it keeps driving. This is the step 2 behavior, applied in step 1.
- Reproduce the free-exit artifact from CD3 on the diagnostic case. Record the zone-less out-counts by fire and region before and after (CD8–CD11 hold the baseline).
- Exit: no out-count at a zone-less node; no gridlock (CD6 locked up when the changes were combined; test them one at a time first); the diagnostic re-run and calibration results are in SOURCE_NOTES. Calibration will move; record the moves, do not tune to them.

### Step 2: edge behavior (CD4)

- Let evacuees keep driving after they leave the order and warning area, instead of vanishing.
- Exit: G1 and G2 are reported for the new behavior, with the before/after table in SOURCE_NOTES. Do not change any other parameter to hit a target.

### Step 3: signal capacity (CD5)

- Add a capacity limit at signalized intersections, from a sourced rule (cite the source in SOURCE_NOTES before coding).
- Exit: G1 and G2 re-reported. Check the network does not lock up (CD6 showed a lock-up when the first two were combined).
- Status, 2026-11-12 (PR #84, branch `claude/model-fix-step3`; SOURCE_NOTES CD21–CD26): built. Each approach to the City's 143 signal junctions and 119 OpenStreetMap signal junctions outside Berkeley passes at most lanes × 1,900/h × g/C, with g/C an assumption (low / central / high; FHWA Signal Timing Manual, HPMS Field Manual, Time Study 75% main-street green at actuated signals). No lock-up (CD23). Every 90% time moved by at most 1.1 min at every level; G1 and G2 pass and fail exactly as after step 2 (CD24), because the sourced green shares give most signal junctions more capacity than the old rule by road class (CD22). The model's queues sit at the I-80 ramps, Tunnel Rd and Kensington, not at the study's Cedar St / MLK Jr Wy (CD25), which points at destinations and route choice. Step 4's "return to the step that caused the miss" therefore has no step to return to among 1–3; the next candidates are the Time Study's capacity drop and downstream-signal reduction (E17, CD7 (4)) and evacuee destinations; Eric decides.

### Step 4: recalibrate and check the gate

- Run all calibration cases. Report G1–G4 pass/fail, with the table.
- If G1 or G2 fail, return to the step that caused the miss. Do not widen tolerances to pass.

### Step 5: rebuild the tables

- Rebuild the tables listed in G5 on the fixed model. Report the changed numbers and check each against G1–G2.
- Exit: G5 satisfied. Release decision goes to Eric (G6).

## Rules for every session

- Work on a branch, open a PR with the template, run Codex under AGENTS.md. Never merge or publish; name the PR for Eric's approval.
- Log every new number and every source in SOURCE_NOTES with its provenance category.
- No parameter tuned to hit a calibration target. Any change to a parameter needs a sourced reason written first.
- Stop and report if a step needs a decision Eric has not made.

## Open decisions for Eric

1. Confirm the tolerances in G1 (±10%) and G2 (±25%), or set different ones.
2. Choose the display interim while the model is fixed: keep it as it is (site unreleased), or withhold evacuation times on the public site.
3. Approve step 1 to start.
