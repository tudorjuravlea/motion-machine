# AGENTS.md

For coding agents other than Claude Code (Codex, Cursor, Gemini CLI and the like). Claude Code
reads the skill directly; this file points any agent at the same sources. People should start with
the [README](README.md).

## What this repository is

Motion Machine turns one brief into a short film (20 to 60 s, MP4 in 9x16, 4x5, 1x1 and 16x9) or a
clicker deck (6 to 20 presses) from 150 brand-neutral patterns, and a gate (`mm check`, 40 rules)
measures the result. Every frame is a pure function of time `t`. The look comes from one
`style.json`. A *piece* is a folder holding a `story.json` and a `style.json`. Node 22+,
Playwright Chromium and ffmpeg 6+ are the whole toolchain. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
is a ten-minute tour of the parts.

## Commands

Run from the repository root.

```
npm ci && npx playwright install chromium
node scripts/mm.mjs doctor                 # verifies Node, Chromium, ffmpeg; installs nothing
node scripts/mm.mjs new --kind film --style editorial --id my-piece
node scripts/mm.mjs serve pieces/my-piece  # preview
node scripts/mm.mjs check pieces/my-piece  # the gate; writes out/check.json
node scripts/mm.mjs export pieces/my-piece
node scripts/mm.mjs pattern list
node scripts/mm.mjs pattern lint           # every pattern is complete or it does not exist
node scripts/mm.mjs release-check          # the pre-publication sweep
npm test                                   # the whole suite (or `test:unit`, `test:browser`, `test:golden`; see CONTRIBUTING.md)
```

`node scripts/mm.mjs --help` lists every verb; `<verb> --help` lists its flags. `npm run mm -- <verb>`
is the same as `node scripts/mm.mjs <verb>`; below, `mm` is short for either.

## Where things live

- **The skill:** [`skill/motion-machine/SKILL.md`](skill/motion-machine/SKILL.md) is a router for the seven-round workflow
  (brief, treatment, style, style frames, animatic, cut, delivery). Its `references/` hold the
  gate details, beat-sheet format, patterns cheatsheet and pitfalls. Follow it whatever agent you are:
  the user directs every taste call, you draft, render and measure.
- **The grammar:** [SPEC.md](SPEC.md) (render contract, style and story contracts, pattern contract, kit,
  gate rules in section 7, rule ledger in section 14). `contracts/` holds the JSON schemas. A `G-` rule
  is a hard stop (a FAIL exits 1 and blocks `mm export`); a `W-` rule advises and never blocks. A style
  may tune the `W-` thresholds in its `gate` block (SPEC section 3); a `G-` rule is never tunable.
- **Provenance:** [PROVENANCE.md](PROVENANCE.md) (every mined source, its licence and what changed).
- **Code:** `runtime/kit/` (the kit that draws from `t`), `patterns/<group>/<name>/` (each with a
  `PATTERN.md` card), `styles/` (brand and motion halves, presets, ground marks, bundled fonts), `scripts/` (the
  CLI; `scripts/check/` has one file per gate rule), `tests/`, `fixtures/`.
- **Finished pieces:** `pieces/golden-*` pass the gate as cloned.

## The rules you must keep ([AXIOMS.md](AXIOMS.md), the full text)

1. Every frame is a function of `t`: `seek(t)` is the only clock, so render mode allows no unseeded random, `Date`, timer, CSS transition or animation. (`SPEC.md` section 2)
2. The style file is the only look: patterns take colour, type, space and timing by role name from `style.json`, never by literal. (`contracts/style.schema.json`)
3. Brand-neutral by default: nothing in the repository carries a real brand; shipped presets are fictional. (`scripts/release-check.mjs`)
4. A pattern is complete or it does not exist: markup, CSS, optional JS, a card, a demo. (`contracts/pattern-card.md`)
5. Every rule names its test and every gate has a negative. (`SPEC.md` section 14)
6. The beat sheet comes before code: write the table, wait for a yes. (`skill/motion-machine/references/beat-sheet.md`)
7. Everything travels with the piece: in the piece folder or the kit (`runtime/`, `patterns/`, `styles/fonts/`); no CDN, no network at render time. (`SPEC.md` section 2.6)
8. Honest reporting: a gate that did not run says `SKIP`, never `PASS`; a threshold is never loosened to pass a piece (a studio tunes its warnings in its style, before the piece). (`skill/motion-machine/references/handover.md`)
9. Decks rest finished: nothing mid-entrance at a rest; a press on the final pose does nothing. (`SPEC.md` section 10)
10. Legibility is a number: thresholds live in `SPEC.md` section 12 and the gate measures them. (`SPEC.md` section 12)
11. Provenance for everything mined: source, licence and what changed, in the card and in `PROVENANCE.md`. (`PROVENANCE.md`)
12. Standalone: no sibling repository, no network service; Node, Playwright, ffmpeg and pure-JavaScript npm libraries only, so a clone runs offline with those three tools.
13. A rule lands with its proof: a new or changed rule is committed with its negative fixture, its test and its SPEC text, in the same commit as the code.
14. Escalate, do not improvise: a missing pattern is a named gap, a missing fact is a question. (`skill/motion-machine/references/pitfalls.md`)

If a change breaks one of these it is wrong even when `npm test` passes. To change the repository
itself rather than make a piece, read [CONTRIBUTING.md](CONTRIBUTING.md) first.
