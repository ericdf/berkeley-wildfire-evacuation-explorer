# Structure ignition and house-to-house spread (Phase 3, step 3e): design note

Status: design note, 2026-11-04. Option A is built without hardening or Zone 0 settings (Eric, 2026-11-04; SOURCE_NOTES PH23); the option B scratch test is reported in PH22 and not adopted; hardening and Zone 0 wait. Step 3e is in scope (Eric, 2026-11-03, SOURCE_NOTES PH9);
the size of any hardening or Zone 0 effect is a labeled assumption range. Sources are logged in `SOURCE_NOTES.md` as
PH16–PH21. The simulator is an educational comparison tool, not a prediction and not an official evacuation plan; the
same holds for everything proposed here.

## Summary

- **The fire overlay already contains house-to-house spread, implicitly.** Developed hill cells burn with the
  fire-zone proxy factor (0.7 in Fire Zone 2), and medium severity is calibrated to the 1923 fire's timing through
  buildings (change log 2026-10-31, S11). An explicit structure-spread rule added on top would count that spread twice.
  So 3e either reports losses without touching the fire (option A) or replaces the proxy factor in developed cells
  and recalibrates (option B).
- **NIST's methodology puts nearly all of Berkeley's hill homes in the band where hardening helps least.** NIST TN 2205
  (2022) says that where structures stand under about 25 ft apart, hardening "will have limited or no effect" on a
  structure exposed to a burning neighbor, and that a high-density community "must not have any structures ignite" because
  of structure-to-structure spread (pp. 28, 31–32). Measured from the City's footprints, 7,053 of the 7,706 Fire Zone 2–3
  structures (91.5%) are under 25 ft from the nearest one (PH10). Hardening matters most at 25–50 ft (NIST's "sweet
  spot"), where Berkeley has 496 structures.
- **The empirical evidence agrees on direction and gives one usable number.** In the 2018 Camp Fire, a home within 18 m
  of a destroyed structure survived with probability 0.058, against 0.354 beyond 18 m (Knapp et al. 2021, Fig. 5a).
  Across five California fires, structure separation distance was the most important predictor of loss in four
  (Zamanialaei et al. 2025).
- **The 1991 fire gives a calibration target for option B.** "Almost 800 structures were ignited within the first hour
  and more than 300 per hour for the next seven hours" (USFA-TR-060, p. 51); NFPA: "790 structures within the first
  hour", "one building every 11 seconds" over 10 hours.
- **Recommendation:** build option A first: structures lost, as an assumption range keyed to the measured separation
  bands, reported beside exposure and the same under both plans. Add hardening and Zone 0 as plan settings that change
  only the loss probabilities, with NIST's bands deciding where they can act. Test option B as a scratch run against
  1991's first-hour count before deciding whether the fire itself should respond to structures.

## 1. The question

Which homes would be lost, and could home hardening or Zone 0 clearance change that, and through that the evacuation?
The simulator now counts structures the fire front and embers reach (step 3a, PH10), the same under both plans. Step 3e
asks two further things:

- **Loss.** Of the structures reached, how many ignite and are lost?
- **Feedback.** Does a structure-to-structure rule change how fast the fire crosses the neighborhoods, and so when
  embers and the fire front reach streets with people still on them?

## 2. What the sources give

| Source | What it measured | Figure | Use |
|---|---|---|---|
| NIST TN 2205, Maranghides et al. 2022 (PH16) | Methodology for WUI communities, from post-fire case studies | WUI types by structure separation distance (SSD): high density 6–30 ft, medium 30–100 ft, low over 100 ft (Table 2, p. 8). By SSD: under about 25 ft, "must not have any structures ignite as risk of entire community loss is very high due to structure-to-structure fire spread"; 25–50 ft, "greatest impact on structure ignition resistance by hardening"; over about 50 ft, "low potential for urban conflagration" (p. 28). Under 25 ft, "hardening will have limited or no effect" (pp. 31–32). In high density, "ignition of a structure will almost invariably result in the ignition of one or more adjacent" structures; spread is hard to stop "6 ft to 10 ft apart" (pp. 42–43). Embers from burning homes ignited others "200 ft to 300 ft downwind" (fn. 11) | Bands, and where hardening can act. No probabilities |
| NISTIR 8436, Prasad & Maranghides 2022 (PH17) | Fire-dynamics simulation of radiant ignition between structures | For a 16 MW burning structure in 4 m/s wind, separation needed to stay below 20 kW/m² (a rough ignition threshold for wood): 9.6 m for a wall, 8.3 m for eaves (pp. 13–14) | Upper bound near 10 m (33 ft) for flame and radiant ignition; embers excluded |
| Knapp, Valachovic, Quarles & Johnson 2021, Fire Ecology 17:25 (PH18) | 400 homes in Paradise after the Camp Fire | Survival 0.058 within 18 m of a destroyed structure, 0.354 beyond (73.6% of homes within 18 m; regression tree, Fig. 5a, p. 9). Survival 11.5% for homes built before 1997, 38.5% after (abstract) | An empirical near-neighbor loss probability, about 94% |
| Zamanialaei et al. 2025, Nature Communications 16:8041 (PH19) | About 47,000 structures in five California fires | Separation distance the most important predictor in four of five fires (Figs. 4–5). Scenario (Fig. 7): all homes hardened, 25% survival; hardening plus Zone 0, 40%; plus Zones 0–1, 48% | Upper bound for what hardening and Zone 0 could do in the dense band. Not re-read by Claude Code; figures from the research summary |
| USFA-TR-060, Routley 1992 (PH20) | The 1991 Oakland-Berkeley Hills fire | "Almost 800 structures were ignited within the first hour and more than 300 per hour for the next seven hours" (p. 51); "3,354 single family dwellings and 456" apartment units destroyed (p. 45) | Calibration target for option B |
| NFPA, Oakland/Berkeley Hills Fire report (PH20) | Same fire | "790 structures within the first hour", spread "about 1.67 meters per second" (PDF p. 12); "one building every 11 seconds" over 10 hours (PDF p. 14); 2,449 single-family dwellings and 437 apartment and condominium units (PDF p. 4) | Same; the two reports disagree on totals |
| Syphard et al. 2012, PLoS ONE (PH21) | Southern California wildfires | Loss most likely at low to intermediate structure density | A counterweight: wildland-driven fires do not follow the dense-conflagration pattern, so a rule must not assume loss rises with density everywhere |
| Hamada model (PH21) | Japanese post-earthquake urban fire spread | Spread rate from building size, separation, wind and fire-resistant share. Original not retrieved; inputs from secondary documentation | Shows a cell rule keyed to separation and density is the standard form |

## 3. How the model fire handles buildings today

Developed hill cells burn at the proxy factor of their fire zone: 0.7 in Fire Zone 2, 1.0 in Fire Zone 3 (`js/fire.js`,
`FUEL`). LANDFIRE marks most of those cells NB1, non-burnable, and the opt-in LANDFIRE setting keeps the proxy there
(FV3). The medium severity's head rate was scaled (×0.55) so the 1923 repeat reaches Shattuck in about 5 hours, which is a
rate of spread through buildings. So house-to-house spread is in the model already, as one uniform factor that does not
know how close the houses are.

## 4. Options

**A. Loss as a count beside exposure (no change to the fire).**
- Each structure the fire front reaches is lost with a probability that depends on its separation band. Structures
  reached only by embers get a lower probability.
- Ranges, all labeled assumption:
  - Under 25 ft, reached by the front: 0.85–0.95, consistent with Knapp's 0.058 survival within 18 m.
  - 25–50 ft: about 0.65, the survival complement beyond 18 m.
  - 50 ft or more: lower still.
  - Embers only: a fraction of these, not sourced. The 1991 fire's ember ignitions 200–300 ft downwind say the fraction
    is not zero.
- Draws use the run's seed and are the same for both plans.
- Shown: "Structures lost (assumption range, not a prediction)", low and high, beside the exposure row.

**A + hardening and Zone 0 (plan settings).**
- A share of structures hardened, or Zone 0 compliance, by EMBER phase area (M1). It lowers the loss probability.
- By NIST's bands, the setting acts mainly at 25–50 ft and little under 25 ft (pp. 31–32).
- Upper bounds come from Zamanialaei's scenario (25% survival hardened, 40% with Zone 0), which is not Berkeley-specific.
- This is the first time a plan comparison would show buildings. The result is likely to be "small, because 91.5% of
  hill homes are under 25 ft apart", which is itself the finding to show.

**B. Structure density sets the spread factor in developed cells (the fire responds).**
- Replace the 0.7 proxy in developed cells with a factor from the cell's structure count and separation bands (step 3a
  data), in the Hamada form.
- Recalibrate medium severity to 1923, and check high severity against 1991's "almost 800 structures in the first hour".
- Hardening could then slow spread, which feeds back into evacuation timing.
- This changes every fire, every Simple-view answer and the goal tables, so it needs Eric's decision and a full recheck.

**Not proposed:** a full structure-to-structure model with radiant heat and firebrands per building. The inputs (each
building's size, construction and wind exposure) do not exist for Berkeley, and the result would look more precise than
the evidence is.

## 5. How it could mislead

- "Structures lost" read as a forecast. Every place it appears gives a range, says assumption, and keeps the "not a
  prediction" line.
- Hardening shown as useless. NIST's finding is about exposure to a burning neighbor under 25 ft. Hardening still
  matters for ember ignition of the first house, which is what NIST says a dense community must prevent (p. 28). Option A
  must keep ember-only loss separate from front loss so that this distinction shows.
- Separation from the City's distance field. It reads about 27% high (ISSUES.md I1). Option A uses measured gaps.

## 6. Recommendation

1. **Build option A, with hardening and Zone 0 as plan settings acting on loss only.** No change to the fire, so
   calibration and every Simple-view answer stay as they are.
2. **Run option B as a scratch test.** How many City-footprint structures does "Like 1991" reach in its first hour?
   The 1991 fire burned mostly in Oakland, where the model has Census housing units rather than footprints, so the test
   also needs the 3a counts outside Fire Zones 2–3 to stand in for structures.
3. **Decide B after the scratch test.**

## 7. Decisions (Eric, 2026-11-04)

- (a) Option A: yes, as built, with one change from section 4: structures reached only by embers get no loss figure,
  since no source gives that share (PH23).
- (b) Hardening and Zone 0: not yet. With the fire fixed, a setting could act only on losses at 25–50 ft and would
  understate hardening.
- (c) Option B scratch test: run, not adopted (PH22). Redistributing the factor by building spacing barely moves the 1923
  marks, and the 1991 check needs footprints in Oakland.

## 7a. Questions as first put

- (a) Build option A, losses as an assumption range beside exposure?
- (b) Add hardening and Zone 0 as plan settings acting on losses only (new interventions)?
- (c) Run the option B scratch test, knowing that adopting B would reopen calibration?
