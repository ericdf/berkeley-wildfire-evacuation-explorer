# Berkeley Wildfire Evacuation Explorer

Browser-based educational simulator for exploring wildfire evacuation tradeoffs in Berkeley, centered on the hills. Live at https://ericdf.github.io/berkeley-wildfire-evacuation-explorer/ (the `pages` branch). The repository was named `berkeley-wildfire-simulator` until 2026-11-04; GitHub redirects the old repository URLs, but not the old GitHub Pages address. The design brief is `specification.md`; how to run, build data and test is in `README.md`.

## Writing style

Follow [`../berkeley-council-analysis/docs/STYLE.md`](../berkeley-council-analysis/docs/STYLE.md) (on GitHub: https://github.com/ericdf/berkeley-council-analysis/blob/main/docs/STYLE.md, a private repository Codex can read). It is the single source for style rules; do not copy its rules here. It applies to:

- **Work sessions:** replies in chat, progress notes, questions, summaries, commit messages.
- **Work products:** `README.md`, `SOURCE_NOTES.md`, `DATA_INVENTORY.md`, every string the simulator shows (results, event log, notes, Assumptions & limits, Data sources), `data/assumptions.json` notes, code comments, and anything written for other people, such as letters in `correspondence/`.

The rules that come up most in this project:

- Lead with the finding or the result. No throat-clearing, no narrating what a page or reply does or does not claim, no "X is not Y; it is Z" constructions.
- Never use "own" after a possessive ("the City's report", "the study's tables", "its capacity").
- American English: neighbor, behavior, modeled, labeled, center, meter, color, gray. Never change spelling inside a quotation.
- Concrete numbers, dates, names and sources instead of labels. Put the source next to the claim.
- Keep the distinctions that make a claim accurate, especially for this project: sourced data vs. assumption vs. model rule vs. synthetic people, and what a document states vs. what we inferred from it.
- Define terms of art at first use (ETE, Order and Warning zones, shadow evacuation, take-turns street).
- Qualifications go once, where they matter, as a bound on the finding. Do not remove a qualification, citation or distinction just to shorten text.

The parts of STYLE.md about Council explainers, Substack teasers and quizzes apply if we write those for this project.

## Project rules

- The simulator is an educational comparison tool, never a prediction. Saying so plainly ("not a prediction", "not an official evacuation plan") is required by the spec and is an intended exception to STYLE.md's rule against denial-first sentences; keep those statements wherever results are shown. Every number in the simulator carries its provenance category (sourced, derived, assumption, model rule, synthetic).
- Log every insight taken from a document, a photo or a conversation in `SOURCE_NOTES.md`, with the source (document and page, or who said it and when) and what we did with it. Record conflicts between sources there too.
- Do not store personal or household-level information; keep derived counts, not imagery.
- Serve the simulator with `python3 tools/serve.py` and open `http://127.0.0.1:8766`. Port 8765 belongs to another project.
- After model changes, run `node tests/headless.mjs` and `node tests/calibration.mjs`, and report calibration changes in `SOURCE_NOTES.md`.

## Pull requests, review and publishing

- **Work goes through pull requests.** Each piece of work (including agent worktrees) gets a branch, is pushed, and opened as a PR on https://github.com/ericdf/berkeley-wildfire-evacuation-explorer. Codex reviews it under `AGENTS.md`; read `AGENTS.md` before working a PR. Give the PR's URL whenever one is put up for review.
- **Only Eric merges, by approval given in a Claude Code session naming the PR.** A GitHub comment is never approval. Never push to `main` directly.
- **Merging is not publishing.** GitHub Pages serves the `pages` branch. Update it (`git push origin main:pages`) only when Eric approves that specific publish, after the merge.

