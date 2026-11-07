## What this changes

<!-- One or two sentences: what, and why. -->

## The test

<!-- The test that fails without this change and passes with it. Name the file and, for a behaviour
change, say how you watched it fail first. For a gate rule, name the negative fixture. -->

## The SPEC line

<!-- The line or table row in SPEC.md that states the behaviour or rule you changed or added. If no
SPEC text changes, say why none needs to. -->

## Checklist

- [ ] The tests for the files I touched pass, and so does `npm test` (browser tests can time out under load; re-run a file on its own).
- [ ] `node scripts/mm.mjs release-check` exits 0.
- [ ] A new or changed rule has its negative fixture, its test, its SPEC text and its ledger row in this pull request.
- [ ] A new pattern is complete (`node scripts/mm.mjs pattern lint <group>/<name>`) and its card names its sources.
- [ ] Counts in the documents (patterns, rules) are updated where the change moves them.
- [ ] No renders, `out/` folders, videos, real brand names or personal paths are committed.
