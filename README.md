# Motion Machine

**Stories in motion, in any style, that a machine checks before you show them.**

Motion Machine turns one brief into a short film (20 to 60 seconds, made for a muted feed, in
9x16, 4x5, 1x1 and 16x9) and a clicker deck (the same story, one press at a time). Both are
assembled from 120 brand-neutral patterns: entrances, transitions, cuts, scene layouts, camera
moves, text and data moments, device screens, sound cues. A style file supplies the look and the
motion. A gate of 37 rules measures every result: nothing runs on its own clock, nothing is
off-style, nothing is illegible from a phone or the back row, the first frame is the hook, and
every deck press rests on a finished picture.

A *piece* is a folder, `story.json` (what happens and when) plus `style.json` (how it looks and
moves), that becomes a film or a deck.

Motion Machine is a Claude Code skill, a plain HTML, CSS and JavaScript runtime that draws every
frame from time alone, and a command-line tool, `mm`. Node, Playwright and ffmpeg are the whole
toolchain. It does not call image or video models, and it is not a video editor: its studio shows
a piece as a timeline and writes each drag back into the story file, which stays the only place the
film lives.

## What the gate measures

`mm check` renders the piece in Chromium and measures the result instead of trusting the code.

- **Time.** Rendering the same instant twice, in order and in reverse, gives the same pixels. A
  trap installed before the piece loads fails any timer, `Date`, `performance.now` or unseeded
  random called at run time.
- **Style.** Colours, type families, sizes, spaces and durations come from `style.json`. The gate
  reads the CSS, the computed styles and the rendered pixels, so a colour set any other way is
  caught.
- **Legibility.** Text is measured at its rendered size against a floor per format, for a phone
  and for the back row, and checked for edge crowding, overlap, contrast and reading time.
- **Pace.** The first frame is the hook. The gate also measures dead air, arrivals per ten
  seconds, holds, staggers and runs of empty frames.
- **Decks.** At every rest no element is mid-entrance, and a press on the final pose does nothing.
- **Sound.** Loudness lands on target, and cues sit on the beat grid.
- **Honesty.** A rule that could not run says `SKIP`, never `PASS`. `export` refuses a piece whose
  check failed, did not finish or is out of date; `--force` renders anyway and stamps the file
  `UNCHECKED`.

Taste calls stay with a human director, one at a time, with options side by side. The arithmetic
is the machine's. The grammar is in [SPEC.md](SPEC.md), the non-negotiables in
[AXIOMS.md](AXIOMS.md).

## Three modes

A style is a **brand half** (colour, type, space, composition) worn with a **motion half** (tempo,
curves, transitions, entrances), composed per piece.

- **Capture.** Read a brand's look from a web page, a Figma export, a folder of stills or a
  `DESIGN.md` (`mm brand capture`), and a motion style from a reference film
  (`mm motion capture`). Every guess is written down with its evidence. A reference gives its
  grammar, never its content.
- **Apply.** Wear any brand in any motion style (`mm style compose`), or start from a shipped
  preset: `editorial`, `kinetic`, `calm-product` or `nocturne-kinetic`. The shipped brand halves
  are `linen`, `nocturne`, `paper` and `signal`; the motion halves are `calm`, `kinetic` and
  `premium`.
- **Embed.** Scaffold a thin skill for one brand with its look, motion, fonts and facts pinned
  (`mm skill new`); it loads this engine's skill and leaves the engine brand-free.

## Quick start

You need Node 22 or newer, ffmpeg 6 or newer (`brew install ffmpeg`, `sudo apt install ffmpeg`)
and Playwright's Chromium. Motion Machine is developed on macOS and tested on Linux in CI; Windows
is untested.

The supported way to use Motion Machine is a clone of this repository: clone it, then run everything
below from its root, with `node scripts/mm.mjs` or `npm run mm --`. No npm package is published.

```
git clone https://github.com/tudorjuravlea/motion-machine.git
cd motion-machine
npm ci
npx playwright install chromium
node scripts/mm.mjs doctor
node scripts/mm.mjs new --kind film --style editorial --id hello
node scripts/mm.mjs serve pieces/hello
node scripts/mm.mjs check pieces/hello
node scripts/mm.mjs export pieces/hello
```

`npm run mm -- <verb>` is the same as `node scripts/mm.mjs <verb>`; every verb answers `--help`.
`doctor` verifies the tools and never installs anything. `new` scaffolds `pieces/hello/` (add
`--dir <folder>` to scaffold elsewhere under the repository root, `--kind deck` for a clicker
deck). `serve` prints a local URL that previews the piece with a play clock (`--t 5` opens at 5 s,
`--press 2` at a deck's second press, `--format 9x16` picks the frame).

The scaffold is a four-second placeholder, so `check` fails it (`G-LENGTH`, `G-HOOK`) and `export`
refuses until the piece holds a real 20 to 60 second story. [GUIDE.md](GUIDE.md) takes you
through one in fifteen minutes, including how the gate catches a piece you break on purpose.
Other verbs: `stills` (contact sheets), `review` (a page per direction round), `beats` and `sound`
(a beat grid, cues and a loudness-normalised mix), `pattern list|lint|stills`, `release-check`.

## Device films

Put your own app or website on a phone or laptop screen:

```
node scripts/mm.mjs media prep recording.mov --name app --piece pieces/hello --fit phone
node scripts/mm.mjs capture site --url https://example.com --name site --piece pieces/hello --mark "Pricing=#pricing"
```

`media prep` turns a screen recording into frames the kit seeks one by one. `capture site` reads
a page once, at the device's viewport, into tiles plus the boxes of the marks you name. A beat
with `"fx": "devices/phone"` and `"asset": "assets/app/"` plays the recording; with
`"asset": "assets/site/"` it shows the page, and its `screen` list scrolls, taps, swaps, zooms and
labels it (`screen/scroll`, `tap`, `swap`, `zoom-to`, `callout`, `play`). Phones carry an island or
a notch and a status bar; laptops a camera notch and an optional menu.

[`fixtures/device-film`](fixtures/device-film) is a worked example. Its assets are generated, not
committed: run `sh fixtures/device-film/make-assets.sh` once (it captures a local page and a clip),
then `node scripts/mm.mjs check fixtures/device-film`, and every rule passes.

## The studio

See the story as a timeline, drag it, and let the gate answer while you drag:

```
node scripts/mm.mjs studio pieces/hello
node scripts/mm.mjs timeline pieces/hello move hook/headline +0.3 --plan
```

`studio` prints a local URL: the piece plays on a stage above a timeline of scenes, one lane per
slot, cues, camera moves and the music grid. Drag a line to retime its entrance, its tail to set
its exit, a scene's end to change its length (the scenes after it follow); the inspector lists the
selected pattern's own params. Each gesture is written into `story.json` as the smallest change, so
`git diff` shows exactly what moved, and undo restores the bytes. The timing rules of the gate
(dead air, reading time, pace, holds, cues on the beat) run on every drag from the same files
`mm check` uses, and paint their warnings at their instants. `timeline` gives an agent the same
edits from the command line, with `--plan` diffs, receipts and `undo`. Stories written by a build
script, and decks, open read-only. `export --workers N` draws frames in parallel pages and proves
the result identical to one page.

## The skill

[`skill/motion-machine/SKILL.md`](skill/motion-machine/SKILL.md) directs a piece through seven
rounds (brief, treatment, style, style frames, animatic, cut, delivery) in which you are the
director, the agent is the crew, and `mm check` measures every cut. To use it in Claude Code, make
it a project skill of your clone, then open the clone in Claude Code and ask for a reel, an
explainer film, an animated deck or "the same story as a film and a deck":

```
mkdir -p .claude/skills && ln -s ../../skill/motion-machine .claude/skills/motion-machine
```

The repository is also a Claude Code plugin (`.claude-plugin/plugin.json` points at `skill/`). Its [references](skill/motion-machine/references) hold the gate details, the beat-sheet
format, a patterns cheatsheet and the pitfalls and their fixes. [evals](evals) holds the prompts
and the outcomes a run must reach. Other coding agents start from [AGENTS.md](AGENTS.md).

## Documentation

[docs/README.md](docs/README.md) is the index. The short version:

- [GUIDE.md](GUIDE.md): a fifteen-minute tour that breaks a piece on purpose and captures a brand.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how a brief becomes a frame, in ten minutes.
- [SPEC.md](SPEC.md): the full grammar, every rule and every threshold.
- [CONTRIBUTING.md](CONTRIBUTING.md): add a pattern, add a rule, propose a change.
- [PROVENANCE.md](PROVENANCE.md) and [NOTICE](NOTICE): where borrowed ideas come from.

## Known limits

- The gate does not listen or watch at full speed. It measures loudness, peaks and cue timing,
  and it reads motion from rendered frames; whether the sound is good and the motion feels right
  is a person's call.
- The gate's schedule does not load sound modules, so `W-CUE` and `W-MIX` read an end-anchored cue
  at its beat's arrival, not where `mm sound` places it, and no story decides when a `bed` is laid,
  so `W-MIX`'s peak check stays unmeasured ([SPEC.md §9](SPEC.md#9-sound)).
- A deck press can jump content instead of moving it: a slot that has not arrived takes no room on
  a rest ([SPEC.md §10](SPEC.md#10-deck-mechanics)).
- Motion capture is calibrated on films this kit renders, and a crossfade between text shots reads
  as a colour dip ([SPEC.md §13](SPEC.md#13-capture-and-embed-the-three-modes)).
- Music is not composed here: bring a track, and `mm beats` finds its grid.
- Windows is untested, and Chromium is the only browser the renderer drives.

## Contributing and conduct

Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it explains the pattern and rule checklists and how to
run the tests. Security reports go through [SECURITY.md](SECURITY.md). Everyone taking part follows
the [code of conduct](CODE_OF_CONDUCT.md).

## Not to be confused with

- [HyperFrames](https://github.com/heygen-com/hyperframes), an open-source tool for rendering
  video from HTML, a separate project. Motion Machine takes ideas and a list of banned fonts from
  it (credited in [NOTICE](NOTICE) and [PROVENANCE.md](PROVENANCE.md)).
- [MotionMachine](https://github.com/poetmountain/MotionMachine), a Swift animation library.

Licence: Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)).
