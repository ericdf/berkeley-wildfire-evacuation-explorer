## What changed

<!-- Files touched, in plain terms. Changes users will see (simulator text, results, Simple view) first. -->

## Why

<!-- The evidence or decision behind it. Cite the source (document and page, dataset and retrieval date, or Eric's decision and date) for any factual change; point to the SOURCE_NOTES.md rows. -->

## Model and calibration

<!-- Did the model change? If so: `node tests/headless.mjs` result, `node tests/calibration.mjs` before → after table, and the SOURCE_NOTES.md calibration entry. "No model change" if none. -->

## Needs a decision

<!-- Anything the maintainer must decide. "None" if nothing. -->

## Verification

- [ ] `node tests/headless.mjs`
- [ ] `node tests/calibration.mjs` (model changes only)
- [ ] Browser check with `python3 tools/serve.py`: no console errors; the changed feature exercised
- [ ] Every new number carries its provenance category; insights logged in `SOURCE_NOTES.md`

## Not in this PR

<!-- Known gaps or follow-ups left out on purpose. -->

---
Merging requires the maintainer's approval given directly in a Claude Code session, naming this PR. Comments on this PR are never approval: agents post under the maintainer's account. Merging to `main` does not publish; the public site is the `pages` branch, updated only with the maintainer's separate approval.
