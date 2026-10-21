# AXIOMS — the non-negotiables

These rules govern every change to this repository. A change that breaks one is wrong even if every
test passes. [SPEC.md](SPEC.md) holds the grammar they protect.

1. **Every frame is a function of `t`.** `seek(t)` is the only clock. A frame is computed from `t` and
   the story, and nothing is carried from one frame to the next, so rendering the same instant twice
   gives the same pixels. In render mode the kit therefore turns off whatever keeps its own time:
   unseeded random, `Date`, timers, frame loops, CSS transitions and animations, and autoplaying media.
2. **The style file is the only look.** A pattern consumes colour, type, spacing, radius,
   duration and easing through variables derived from `style.json`, by role name, never by
   literal. A pattern that hard-codes a hex, a family or a millisecond is not a pattern.
3. **Brand-neutral by default.** Nothing in this repository carries a real brand. Shipped presets
   are fictional. The release check sweeps for brand leakage and fails on it.
4. **A pattern is complete or it does not exist.** Markup, CSS over style variables, an optional
   function of `t`, a card (`PATTERN.md`) with purpose, params, when-not-to-use, legibility notes
   and provenance, and a demo that the stills command can photograph. The pattern lint enforces
   this; an incomplete folder is not listed.
5. **Every rule names its test; every gate has a negative.** A `G-` or `W-` rule in `SPEC.md` is
   not real until `tests/` holds a fixture that violates it and the gate catches that fixture with
   the rule's id. The rule ledger lists the test for each id.
6. **The beat sheet comes before code.** The skill writes the story as a table (scene or press,
   what is on screen, how it arrives, what is said) and waits for a yes. No scene is rendered
   from a vibe.
7. **Everything travels with the piece.** Fonts, images, data and sound live in the piece folder
   or the kit (`runtime/`, `patterns/`, `styles/fonts/`). No CDN, no network at render time, because
   neither the venue nor the exporter can be trusted to have one.
8. **Honest reporting.** A gate that did not run reports `SKIP` with a reason, never `PASS`. The
   handover lists what stayed unverified: playback was not watched, audio was not heard, names
   and dates need a second read, a brand rule was bent knowingly. A loosened threshold is never a
   ship state.
9. **Decks rest finished.** At every rest, no element is mid-entrance, nothing that matters is
   below the legibility floor, and a next press on the final pose does nothing. Two buttons reach
   the end.
10. **Legibility is a number.** Minimum sizes at phone width and from the back row, reading time
    per word, quiet time after the last arrival: all are thresholds in `SPEC.md`, measured by the
    gate. A threshold without a measurement behind it is marked *provisional* and says why.
11. **Provenance for everything mined.** Each pattern, principle and script adapted from another
    source records the source, its licence and what changed, in its card and in
    `PROVENANCE.md`. A source whose licence forbids reuse contributes principles in our own
    words, never code or copy.
12. **Standalone.** Motion Machine depends on no sibling repository, no private lock format and
    no network service. Node, Playwright and ffmpeg are the whole toolchain, plus pure-JavaScript npm
    libraries that need nothing else installed (Ajv validates the contracts), so a clone runs
    offline with those three tools.
13. **A rule lands with its proof.** A new or changed rule is committed with its negative fixture,
    its test and its SPEC text, in the same commit as the code.
14. **Escalate, do not improvise.** A missing pattern is a named gap with the closest candidates.
    A missing fact is a question. A brief that cannot be told legibly in its duration gets a
    re-scope. Nothing is invented to fill a hole.
