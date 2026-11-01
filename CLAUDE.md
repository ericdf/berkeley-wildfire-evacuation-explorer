# Berkeley Hills Wildfire Evacuation game

Browser-based educational game for exploring wildfire evacuation tradeoffs in the Berkeley Hills. The design brief is `specfication.md`; how to run, build data and test is in `README.md`.

## Writing style

Follow [`../berkeley-council-analysis/docs/STYLE.md`](../berkeley-council-analysis/docs/STYLE.md). It is the single source for style rules; do not copy its rules here. It applies to:

- **Work sessions:** replies in chat, progress notes, questions, summaries, commit messages.
- **Work products:** `README.md`, `SOURCE_NOTES.md`, `DATA_INVENTORY.md`, every string the game shows (results, event log, notes, Assumptions & limits, Data sources), `data/assumptions.json` notes, code comments, and anything written for other people, such as letters in `correspondence/`.

The rules that come up most in this project:

- Lead with the finding or the result. No throat-clearing, no narrating what a page or reply does or does not claim, no "X is not Y; it is Z" constructions.
- Never use "own" after a possessive ("the City's report", "the study's tables", "its capacity").
- American English: neighbor, behavior, modeled, labeled, center, meter, color, gray. Never change spelling inside a quotation.
- Concrete numbers, dates, names and sources instead of labels. Put the source next to the claim.
- Keep the distinctions that make a claim accurate, especially for this project: sourced data vs. assumption vs. game rule vs. synthetic people, and what a document states vs. what we inferred from it.
- Define terms of art at first use (ETE, Order and Warning zones, shadow evacuation, take-turns street).
- Qualifications go once, where they matter, as a bound on the finding. Do not remove a qualification, citation or distinction just to shorten text.

The parts of STYLE.md about Council explainers, Substack teasers and quizzes apply if we write those for this project.

## Project rules

- The game is an educational comparison tool, never a prediction. Every number in the game carries its provenance category (sourced, derived, assumption, game rule, synthetic).
- Log every insight taken from a document, a photo or a conversation in `SOURCE_NOTES.md`, with the source (document and page, or who said it and when) and what we did with it. Record conflicts between sources there too.
- Do not store personal or household-level information; keep derived counts, not imagery.
- Serve the game with `python3 -m http.server 8766 --bind 127.0.0.1` and open `http://127.0.0.1:8766`. Port 8765 belongs to another project.
- After model changes, run `node tests/headless.mjs` and `node tests/calibration.mjs`, and report calibration changes in `SOURCE_NOTES.md`.
