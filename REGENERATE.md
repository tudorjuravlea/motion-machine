# REGENERATE — rebuilding each unit from the spec and the tests

[SPEC.md](SPEC.md), [AXIOMS.md](AXIOMS.md), `contracts/`, `tests/` and `fixtures/` carry everything
the implementation must do. This file gives, for each unit, a prompt that asks an AI (or a person)
to write the unit again from those alone, the tests that must pass, and what the tests do not pin.
A unit is only as regenerable as the tests that would catch a wrong rebuild, so the last part of
each entry matters as much as the first. The Deletion Test at the end is the procedure for checking
that claim.

## Unit: contracts

Prompt: "Write `contracts/{brand,motion,style,story}.schema.json`, `contracts/edit-ops.schema.json`
and `contracts/pattern-card.md` from SPEC §3, §4, §5 and §16. `tests/contracts/*.test.mjs` must
pass."

The tests require that the shipped style halves, the presets and the golden stories validate; that
each invalid sample fails on its named field; that every bundled font maps the required Latin
Extended code points; and that composition holds (a brand's `composition` is required and bounded,
the shipped brands differ as SPEC §3 states, `mm style compose` carries the block, every preset
equals a fresh compose, and a composed style without the block still validates).

What the tests do not pin: the schemas fix shape and ranges. They cannot fix which pattern names
exist (G-PATTERN-REF checks that) or whether a composed style's halves agree with its `from`
paths (the compose test checks that). A rebuild that renames a field fails; one that loosens a
range inside the schema's own bounds does not.

## Unit: runtime/kit

Prompt: "Implement `runtime/kit/` per SPEC §2, §3, §5, §6, §10 and `runtime/kit/README.md`:
`springs.js` (`spring`, `spring.settle`, `spring.overshoot`, `track`, `fromReactSpring`),
`schedule.js` (the algebra, `resolveStory`, and `schedule` with the output shape of SPEC §6),
`kit.js` (mount, variables per format and composition, fonts, `seek`, `goto`, render mode, deck
keys, `report()` with the shape of SPEC §6), `room.js` (the safe-area bounds of SPEC §5), `ease.js`,
`random.js`, `fit.js`, `count.js`, `rough.js` (the pen stroke, `boilFrame`, `INK`) and `ctx.boil(n)`
(the shiver from the piece's time and the style's `motion.boil`; frame 0 in a deck), `screen.js`
with `state.compare`, and `device3d.js` with `cross` and a texture painted in the screen's stacking
order. All of `tests/kit/*.test.mjs` must pass unmodified, including the browser tests on
`fixtures/kit-smoke/` and `tests/kit/golden-smoke.test.mjs`."

What the tests do not pin: `springs.js` and `rough.js` are pure, and their tests pin every property
that matters (closed-form motion; same seed, same path; roughness 0 on the exact shape; a boil
frame is a shiver, not a redraw). `schedule.js` is pinned by the output shape and by timing on the
shipped pieces. `kit.js` is pinned by the page-driving browser tests, and what a page looks like
between their assertions is judged by eye. `device3d.js` has its poses pinned (`cross.test.mjs` and
the 3D browser tests' pixel samples); the texture must paint screen layers in stacking order, which
only the test that reveals the first layer after a swap checks.

## Unit: scripts/check and pattern-lint

Prompt: "Implement `scripts/check.mjs` and one file per rule in `scripts/check/` for every id in
SPEC §7, and `scripts/pattern-lint.mjs` per §5, with exit codes 0, 1 and 2. `tests/check/*.test.mjs`
and `tests/pattern-lint.test.mjs` must pass: the positives pass, and each negative in SPEC §14
fails with exactly its own id."

What the tests do not pin: every rule has a negative, but a negative proves only the fault it
encodes. An evasion nobody wrote down is not caught. Add a negative for every new way past the gate
you find.

## Unit: scripts (CLI, sound, capture)

Prompt: "Implement `scripts/mm.mjs` and the verbs of SPEC §8 and §13 against `tests/cli/`,
`tests/sound/` and `tests/capture/`."

The CLI and sound suites pin behaviour and file shapes: colour tags, loudness, the standalone deck
folder, and the release-check sweeps, each with one fixture (R-DUP and R-HISTORY included; R-GOLDEN
fails only on a failing report and is SKIP where there are none). Motion capture is tested on
eight labelled films whose ground truth is the kit's own schedule (`tests/capture/motion-truth.mjs`):
each must come back with its own energy, alone and with its film left out of the calibration; both
golden films must return every scheduled cut with its kind and direction near its instant; the
kinetic golden film's arrivals must fall within one of the style, and its durations within 20 %;
the headline family must be the style's or "not distinguishable", never a wrong one; `kinds.mp4`
pins wipe, iris, colour-dip, whip-pan and push with directions; and the shipped energy bands must
equal a fresh calibration.

What the tests do not pin: every labelled film is rendered by this kit, so nothing tests a film
from outside. The calm and medium bands differ on one quantity (timed cuts at 0.47 s against
0.42 s), arrival counts drift with the story, and a crossfade between text shots cannot be told
from a colour-dip (SPEC §13).

## Unit: studio

Prompt: "Implement SPEC §16 from `contracts/edit-ops.schema.json`: `scripts/studio/json-splice.js`,
`ops.js`, `history.js`, `model.js`, `geometry.js` (pure, browser-safe), `scripts/check/timing.mjs`,
`scripts/lib/story-edit.mjs`, `scripts/studio/server.mjs`, `scripts/timeline.mjs` and the page in
`scripts/studio/ui/`. `tests/studio/*.test.mjs`, `tests/check/timing*.test.mjs`,
`tests/cli/timeline.test.mjs` and `tests/cli/export-*.test.mjs` must pass."

What the tests do not pin: the edit core is pinned by an invariant over every story in the
repository, thousands of seeded patches, and a corpus that holds the contract and the ops to the
same verdicts. The model and the live gate are pinned by parity with the schedule and with
`mm check` on every shipped piece; parity proves agreement, not that the lanes are the right ones
to draw. The server's security and concurrency are pinned by the attacks the tests encode. The
page is covered by an edit-accuracy bench of a few gestures; its look and feel are in no test.

## Unit: patterns

Prompt: "For each card in `patterns/**/PATTERN.md`, implement the pattern files the card describes
so that `mm pattern lint` passes, `mm pattern stills` in every preset matches the card's legibility
and rest notes, and the pattern browser tests in `tests/kit/` pass."

The tests pin frame-level qualities as well as rests: every layout follows the brand's alignment,
headline scale and density; slam and punch stay inside the safe area on every frame; dropping
plates never cover their headline; counters never show a unit on a counting number; zoom-through
never draws two scenes in one frame. The sketch patterns are pinned frame by frame: the pen stays
inside its slot (or round its words), the cut's first frame equals the rest, inking follows drawing
order, the line lands on the finished edge under a camera move, and there is one outline per slot
at every seek order. `compare*.test.mjs` and `cross*.test.mjs` pin the before-and-after divider
and the phone's cross.

What the tests do not pin: the look of each pattern is judged by eye, so feel is not regenerable
from tests alone.

## Unit: skill

Prompt: "Write `skill/motion-machine/SKILL.md` implementing SPEC §11 over the CLI in §8 and §13 and
the listed patterns. A fresh session given only the README, the skill and `evals/golden.md` must
produce a film and a deck that pass `mm check` in both shipped styles."

What the tests do not pin: the skill is prose, so no test would catch a wrong rebuild. Its commands
are checked by the CLI's `--help` tests and its evals describe the outcome a run must reach
([evals](evals)); a stranger's run is the real test.

## The Deletion Test

1. `git rm -r runtime scripts patterns skill` on a branch (or a scoped version: delete one kit
   module).
2. Run each prompt above against `SPEC.md`, `AXIOMS.md`, `contracts/`, `tests/` and `fixtures/`.
3. `npm test`, then, on pieces rebuilt from `fixtures/golden/`, one check per piece (`mm check`
   takes one piece): `for p in pieces/golden-*; do node scripts/mm.mjs check "$p" || echo "FAIL $p"; done`.
4. Anything that fails names knowledge that lived only in the implementation. Move it into
   `SPEC.md` or a test, and retry.
