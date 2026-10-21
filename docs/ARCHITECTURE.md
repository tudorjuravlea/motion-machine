# Architecture

A ten-minute tour of how a brief becomes a frame, and which folder, contract and test owns each
step. It points at the code; [SPEC.md](../SPEC.md) is the full grammar and
[runtime/kit/README.md](../runtime/kit/README.md) the kit's day-to-day reference.

## The idea

A brief becomes a **piece**: a folder holding a `story.json` (what happens and when) and a
`style.json` (how it looks and moves). A small browser runtime, the **kit**, can paint any
instant `t` of that piece, from `t` alone, with no clock of its own. Everything else follows from
that one property. The **gate** loads the piece in Chromium and measures the picture at chosen
instants. **Export** photographs every frame and hands them to ffmpeg. The **studio** and the
**skill** are two ways of editing the same two files.

```
  brief
    │  (the skill, or you)
    ▼
  story.json ──┐                 patterns/<group>/<name>      contracts/*.schema.json
               ├─▶ resolveStory ─▶ schedule ─▶ kit.mount(), seek(t)
  style.json ──┘   (roles → names)  (pure)      (a page that paints t)
   ▲  brand half ⊕ motion half                      │
   │  (capture, compose, preset)                    ▼
                                              Chromium page
                          ┌───────────────┬──────────┴───────────┬─────────────────┐
                          ▼               ▼                      ▼                 ▼
                    gate: mm check    stills / review    export: frames → ffmpeg   studio
                    out/check.json    contact sheets     MP4, GIF, deck, handout   (edits story.json)
```

Every box on the right of `schedule` runs the same kit code in the same page, so what the gate
measures is what export films.

## Words used in this repository

| Word | Meaning |
|---|---|
| **piece** | A folder with a `story.json` and a `style.json`; it becomes a film, a loop or a clicker deck. |
| **story** | The beat sheet as data: scenes, beats, timing or presses, copy, cues. |
| **style** | The look as data: a **brand half** (colour, type, space, composition) worn with a **motion half** (tempo, curves, transitions, entrances). |
| **role** | A name the style gives to a choice, such as `headline` or `topic`; a story says `style:headline` and the style decides how it arrives. |
| **pattern** | A documented, brand-neutral unit of motion vocabulary in `patterns/<group>/<name>/`. |
| **slot, beat, scene** | A named place in a layout; one thing arriving in a slot at a time; a layout plus its beats and a cut. |
| **rest** | An instant at which everything that will arrive has arrived: a finished picture. |
| **rule** | One measurement of the gate. `G-` fails, `W-` warns, `R-` is a release-check sweep, `H-` is a heuristic a person applies. |
| **gate** | `mm check`: all the rules, run on one piece. |
| **round** | One of the seven stages the skill takes a piece through, from brief to delivery. |

## The components

### Story

Folder: `contracts/story.schema.json` (the shape), `runtime/kit/schedule.js` (`resolveStory`).
Contract: [SPEC §4](../SPEC.md#4-story-contract-contractsstoryschemajson). Tests:
`tests/contracts/schemas.test.mjs`, `tests/check/refs.test.mjs`.

A story lists scenes. Each scene picks a layout and a cut, and holds beats: `at`, a `slot`, an
`fx` (a pattern, or `style:<role>`), copy, and facts. Every number on screen cites a fact with a
source. A deck uses presses instead of seconds. `resolveStory` turns roles and positions into
pattern names using the style, so one story can be worn by many styles.

### Style

Folder: `styles/` (`brands/`, `motion/`, `presets/`, bundled `fonts/`), `contracts/brand.schema.json`,
`contracts/motion.schema.json`, `contracts/style.schema.json`. Contract:
[SPEC §3](../SPEC.md#3-style-contract-contractsstyleschemajson). Tests: `tests/contracts/`,
`tests/cli/compose.test.mjs`, `tests/capture/`.

A brand half and a motion half merge into the composed `style.json` (`scripts/compose.mjs`). A
half comes from a preset, by hand, or from capture: `scripts/capture-brand.mjs` reads a web page,
a Figma export, a `DESIGN.md` or a folder of stills, and `scripts/capture-motion.mjs` measures a
reference film. Capture writes its evidence beside the half so a person can overrule it. `mm new`
copies the style, fonts included, into the piece.

### Patterns

Folder: `patterns/<group>/<name>/` in twelve groups (`3d`, `data`, `devices`, `emphasis`,
`entrances`, `exits`, `layouts`, `moves`, `screen`, `sound`, `text`, `transitions`). Contract:
[SPEC §5](../SPEC.md#5-pattern-contract) and [contracts/pattern-card.md](../contracts/pattern-card.md).
Tests: `tests/pattern-lint.test.mjs`, the pattern browser tests in `tests/kit/`.

A pattern is complete or it does not exist: `pattern.js` exports `at(el, p, ctx)` (plus a
duration, spring or fragment flag where it needs them), `pattern.html` holds markup with
`data-slot` placeholders, `pattern.css` reads only `--mm-*` variables, `PATTERN.md` is the card
with its seven sections, and `demo/` is a story the stills command can photograph.
`scripts/pattern-lint.mjs` decides what counts as complete; incomplete folders are not listed.

### Schedule

Folder: `runtime/kit/schedule.js`. Contract: [SPEC §6](../SPEC.md#6-kit-grammar). Tests:
`tests/kit/schedule.test.mjs`, `tests/kit/schedule-screen.test.mjs`.

The schedule is pure timeline algebra: from a resolved story and a style it computes every
arrival, exit, cut, move, cue, rest and hold, rounded to the millisecond. It runs in the browser
and in Node, so the gate can reason about timing without opening a page.

### Kit: `seek(t)`

Folder: `runtime/kit/` (`kit.js`, `springs.js`, `ease.js`, `random.js`, `seeded.js`, `fit.js`,
`room.js`, `count.js`, `rough.js`, `screen.js`, `device3d.js`, `render.css`). Contract:
[SPEC §2](../SPEC.md#2-render-contract) and [runtime/kit/README.md](../runtime/kit/README.md).
Tests: `tests/kit/`.

`mount()` builds the scenes from layout fragments, maps the style to `--mm-*` variables, loads
fonts and exposes `window.mm`. `seek(t)` restores, then paints frame `t` completely from `t` alone:
no state survives between calls, and nothing is animated by CSS, timers or the clock. Springs are
closed-form, randomness is seeded, and `window.mm.report()` describes what is on screen for the gate.
Rendering the same instant twice gives the same pixels, which is the property the rest relies on.

### Page driver

Folder: `scripts/lib/browser.mjs`. Contract: [SPEC §2](../SPEC.md#2-render-contract) (items 7 to 11).
Tests: `tests/check/raster.test.mjs`, `tests/check/determinism.test.mjs`.

Every verb uses one driver: a static server over the repository root (which is why a piece must
live under it), Chromium launched with stable-raster flags, the piece opened in render mode at a
format, a recorder that traps clocks for the gate, and a frame as PNG bytes.

### Gate

Folder: `scripts/check.mjs`, `scripts/check/` (one file per rule, plus shared helpers whose names
start with an underscore). Contract: [SPEC §7](../SPEC.md#7-gates-mm-check) and the ledger in
[SPEC §14](../SPEC.md#14-rule-ledger). Tests: `tests/check/`.

`mm check` opens the piece once per format, runs every rule file and writes `out/check.json` with
the story version it judged. A rule returns `PASS`, `FAIL`, `WARN` or `SKIP`; a rule that could not
run reports `SKIP` with a reason, never `PASS`. Exit code 0 means no `G-` rule failed, 1 means one
did, 2 means the run could not happen. Every rule has a negative fixture under
`fixtures/negatives/`, a piece that breaks exactly that rule. The rules that need only the
schedule and the story (`scripts/check/timing.mjs`) also run live in the studio.

### Output verbs

Folder: `scripts/stills.mjs`, `scripts/export.mjs`, `scripts/sound.mjs`, `scripts/review.mjs`,
`scripts/beats.mjs`, `scripts/lib/standalone.mjs`. Contract: [SPEC §8](../SPEC.md#8-cli) and
[SPEC §9](../SPEC.md#9-sound). Tests: `tests/cli/stills.test.mjs`, `tests/cli/export.test.mjs`,
`tests/cli/deck-export.test.mjs`, `tests/sound/`, `tests/cli/review.test.mjs`.

`stills` photographs every rest and mid-entrance onto contact sheets, including a phone-width one.
`export` refuses to run while the check fails, did not finish or judged another version of the
story (`--force` stamps the file `UNCHECKED`); otherwise it seeks every frame, pipes PNGs to ffmpeg
in order, and for a deck also writes a standalone folder, a handout and a walkthrough. With
`--workers N` several pages draw in parallel and the result is proved identical to one page. `sound`
renders each cue once through an `OfflineAudioContext`, mixes it with the track and normalises
loudness. `review` builds a single page from the direction log and the stills.

### Capture and embed

Folder: `scripts/capture-brand.mjs`, `scripts/capture-motion.mjs`, `scripts/capture-site.mjs`,
`scripts/media-prep.mjs`, `scripts/skill-new.mjs`, `skill/templates/brand-skill/`. Contract:
[SPEC §13](../SPEC.md#13-capture-and-embed-the-three-modes). Tests: `tests/capture/`,
`tests/cli/capture-site.test.mjs`, `tests/cli/media-prep.test.mjs`, `tests/cli/skill-new.test.mjs`.

Brand and motion capture read a source and write a style half with its evidence. `capture site`
and `media prep` turn a web page or a screen recording into assets a device screen can show,
seekable frame by frame. `skill new` scaffolds a thin skill for one brand that loads this
engine's skill and pins that brand's look.

### Studio

Folder: `scripts/studio/`, `scripts/timeline.mjs`, `scripts/lib/story-edit.mjs`. Contract:
[SPEC §16](../SPEC.md#16-the-studio-and-edit-ops) and `contracts/edit-ops.schema.json`. Tests:
`tests/studio/`, `tests/cli/timeline.test.mjs`. Details: [scripts/studio/README.md](../scripts/studio/README.md).

```
gesture ─▶ edit ops ─▶ JSON patch ─▶ story.json (only the edited bytes)
   ▲          │ inverse                      │
   │          ▼                              ▼
 timeline ◀─ model ◀─ the kit's schedule ◀─ the piece, redrawn
   ▲                                         │
   └──────── live gate (timing rules) ◀──────┘
```

The studio is a lens and a pen on the story file. A drag becomes a typed edit, the edit becomes a
patch that changes only the bytes it must, and `git diff` shows exactly what moved. The server
listens on `127.0.0.1` only and refuses a foreign `Host` or `Origin`. `mm timeline` gives an agent
the same edits from the command line.

### Skill

Folder: `skill/motion-machine/` (`SKILL.md` and `references/`), `evals/`. Contract:
[SPEC §11](../SPEC.md#11-the-skills-workflow-skillmotion-machineskillmd).
Evals: [evals](../evals/README.md).

The skill directs a piece through seven rounds: brief, treatment, style, style frames, animatic,
cut and delivery. You are the director and decide every matter of taste from options shown side by
side; the agent is the crew that writes, renders and measures. Each round writes into the piece
folder (`direction-log.md`, `defects.md`, a handover), so the record travels with the piece.

### CLI

Folder: `scripts/mm.mjs` (the router), `scripts/lib/cli.mjs` (the usage text for every verb, piece
resolution and exit codes). Contract: [SPEC §8](../SPEC.md#8-cli). Tests:
`tests/cli/help.test.mjs`, `tests/cli/router.test.mjs`.

Each verb is a script run as its own process and passes its exit code through: 0 pass, 1 a gate
failed, 2 setup or usage. Every verb answers `--help`. A usage mistake prints the usage line,
never a stack.

### Release sweeps and CI

Folder: `scripts/release-check.mjs`, `.github/workflows/ci.yml`, `docs/RELEASING.md`. Contract:
[SPEC §8](../SPEC.md#8-cli)
(`release-check`). Tests: `tests/cli/release-check.test.mjs`, `tests/golden/`.

`release-check` sweeps tracked files for brand words, secrets, home-folder paths, remote URLs in
runtime code, licences, incomplete patterns, failing golden reports, strategy files, duplicates
and history markers. CI runs the tests, then the golden pieces through the gate, then the sweep.

## Where to start reading

Five files, in order:

1. `runtime/skeletons/film/piece.js`: the whole of a piece's code.
2. `runtime/kit/kit.js`: how `t` becomes a picture.
3. `runtime/kit/schedule.js`: how a story becomes timing.
4. `scripts/check.mjs`: how the picture is measured.
5. `scripts/export.mjs`: how it becomes a file.

Then read one rule (`scripts/check/G-HOOK.mjs`), one pattern (`patterns/entrances/rise/`) and its
card, and run [GUIDE.md](../GUIDE.md).
