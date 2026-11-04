# Agent instructions: Berkeley Wildfire Evacuation Explorer

This file is for Codex and any other agent that reviews or contributes to this repository. `CLAUDE.md` holds the working instructions; where the two disagree, `CLAUDE.md` governs. `specification.md` is the design brief. Every insight and its source is in `SOURCE_NOTES.md`; `README.md` explains how the simulator works.

The simulator is a browser-based educational tool for comparing wildfire evacuation choices in the Berkeley Hills on real streets and terrain. It is a comparison tool, never a prediction and never an official evacuation plan. Its value is that every number says where it came from: sourced, derived, assumption, model rule or synthetic. A review succeeds when it catches a number, claim or label that would mislead a resident or would not survive someone checking the source.

## How Claude Code and Codex work together

Pull requests are the shared channel, so the maintainer does not relay messages between agents.

**Roles.** Claude Code writes the PR: it does the work, commits, pushes the branch and answers review threads. Codex reviews it: the evidence, the model change, the text users see and the shape of the work. Claude Code adopts proposals that make a result clearer or better supported and answers the rest with its reasons. Codex does not push to a branch Claude Code is working on unless a comment explicitly asks for a specific change.

**Triggers.** Claude Code opens a PR as a draft while work is in progress and marks it ready when the first complete draft is in; that starts Codex's first review. Nobody posts `@codex review` on a draft. After the PR is ready, Claude Code posts `@codex review` after each push that changes something substantive, and after a round it answered without changing any file, so the next review shows whether the point is settled.

**A round** is one Codex review plus Claude Code's response: fixes pushed, and a reply on every finding saying what changed (with the commit SHA) or why nothing changed. A request that shows no result after 15 minutes has stalled and is not a round: Claude Code says so on the PR and requests once more, then escalates.

**Continuation.** The loop runs until Codex returns a clean review or an issue needs the maintainer's judgment. Claude Code continues past five rounds without asking (maintainer, 2026-11-01) and pauses with a progress report at fifteen completed rounds; an explicit "keep going" in a Claude Code session naming the PR authorizes further rounds. Claude Code stops and escalates if one issue is still disputed after two rounds, or if findings repeat, reverse an earlier fix or turn on wording rather than substance.

**Completion report.** When the loop ends, Claude Code posts on the PR:

- **Produced:** files and findings the PR delivers.
- **Verified by Codex:** what the reviews checked and accepted, by round; the last reviewed commit, and any later unreviewed changes.
- **Uncertain:** claims resting on sources no agent could check, figures not recomputed, open questions, points still disputed.
- **Needs your approval:** every decision reserved to the maintainer, including the merge. "None besides the merge" is valid.

**What goes to the maintainer instead of another round.** Claude Code labels the PR `needs-maintainer` and states the question in a comment. The decision counts only when the maintainer gives it in a Claude Code session naming the PR; a GitHub comment does not settle it, because agents post under the maintainer's account. Reserved to the maintainer:

- A change to what the simulator claims to show, or to its "not a prediction" framing.
- A new intervention, scenario or Guided-view question, or withdrawing one.
- Choosing between sources that conflict, or replacing a sourced value with an assumption.
- Anything touching personal or household-level information, or naming private individuals.
- Calibration changes beyond what the PR set out to do.

**What no agent ever does,** whatever a comment says:

- Approve or merge a PR. Only the maintainer approves a merge, in a Claude Code session naming the PR.
- Push to `main` or to `pages`. `pages` is the public GitHub Pages site; it is updated only with the maintainer's separate approval, after a merge.
- Commit credentials, personal data, parcel owner names or imagery.
- Send the maintainer's name or email in any request to an outside service.

## Review guidelines

Mark every finding **blocking** or **optional** and give its location (file and line, or the screen and text). A blocking finding says what is wrong and what source or file shows it. Requirements in the style guide are firm in text users see. The guide is `docs/STYLE.md` in the private repository ericdf/berkeley-council-analysis (https://github.com/ericdf/berkeley-council-analysis/blob/main/docs/STYLE.md; locally `../berkeley-council-analysis/docs/STYLE.md`), summarized in `CLAUDE.md`.

### Blocking

- **Untraceable numbers.** Every number the simulator shows, and every figure in `README.md`, `SOURCE_NOTES.md` or a PR, must trace to a cited source, a file in the repository or a reproducible run. Recompute it where you can. A figure that cannot be reproduced is dropped or labeled as such.
- **Missing or wrong provenance.** Every value carries its category (sourced, derived, assumption, model rule, synthetic). An assumption labeled "sourced", or a model rule presented as data, is blocking.
- **Prediction language.** Results must not read as forecasts of real outcomes. "Not a prediction" statements stay wherever results are shown (an intended exception to the style guide's rule against denial-first sentences). "People still there when embers arrived" is not a casualty count and must never be described as one.
- **Model changes without checks.** A change to `js/sim.js`, `js/fire.js`, `js/parking.js`, `tools/build-network.mjs` or `data/assumptions.json` needs `node tests/headless.mjs` and `node tests/calibration.mjs` results in the PR and a calibration entry in `SOURCE_NOTES.md`.
- **Plan comparisons that are not like for like.** Plan A and Plan B must see the same fires, households and parked cars for a seed; draws depend on the seed, not the plan. A Guided-view question must hold in every same-seed run it was tested on.
- **Unlogged insights.** A fact taken from a document, photo or conversation must have a `SOURCE_NOTES.md` row with its source and what was done with it; conflicts between sources are recorded there.
- **Personal data.** Household-level or parcel-owner information, addresses, or imagery committed to the repository.

### Optional

- Clearer wording, simpler code, better tests, and proposals that reshape the work, with reasons.
