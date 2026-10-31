---
name: motion-machine
description: Directs a short motion piece with Motion Machine, a 20 to 60 s film (MP4 in 9x16, 4x5, 1x1 and 16x9) or a 6 to 20 press clicker deck, from one brief through seven gated rounds in which the user directs every taste call and the `mm check` gate measures every cut. Use when the user asks for a reel, promo or explainer film, an animated or clicker deck, a launch video or "the same story as a film and a deck" built with this repository or the `mm` CLI. Do not use for generative AI video, editing footage beyond cutting a talking-head recording in its pauses, composing music, static slides with no motion, or UI micro-interactions inside an app.
license: Apache-2.0
compatibility: "Node 22+, Playwright Chromium, ffmpeg 6+"
metadata:
  version: 0.1.0
---

# Motion Machine: from brief to delivered piece

This skill runs one short piece, a film or a clicker deck, from a brief to a delivered file. You are
the agent. The user is the director: they decide what the piece says and how it feels, and they
decide when it is done. Your part is to get each decision ready, to keep the machine gate green and to
record what was decided. The full contract is SPEC.md §11.

A piece is two files: `story.json` (what happens, scene by scene) and `style.json` (the brand half
and the motion half it is worn with). Every frame is a function of the time `t`, so any frame can be
rendered, measured or compared on its own.

Work in seven rounds; each ends with a question to the director, and the next starts only after the
answer ("The seven gates" below; the record: "Direction log, defects ledger, handover").

Run everything through the CLI: `node scripts/mm.mjs <verb>` (or `npm run mm -- <verb>`); start with
`mm doctor` on a new machine and ask `mm <verb> --help` instead of guessing a flag. Read a file under
`references/<file>` when the step you are on names it, and not before.

## Where a piece lives

`mm new --kind film|deck --style <preset|path> --id <id>` writes `pieces/<id>/` (story, style,
`piece.js`, `piece.css`, `assets/`); `--dir <folder>` writes anywhere under the repository root.
`piece.js` imports the kit by a relative path, so a moved piece fails to open (`mm check` names
the import). Leave `piece.js` and `piece.css` as scaffolded; replace the placeholder story. Scaffold at gate 1 once the id is known (nearest preset; gate 3 replaces
`style.json`), because `mm new` refuses a folder that exists. Scratch work and every capture
output go in `pieces/<id>/capture/` or a git-ignored folder, never in the shipped `styles/`.

## Ground rules

1. **The beat sheet comes before code** (AXIOMS.md AXIOM 6). No scene is rendered from a vibe.
2. **Only patterns that exist.** Every `layout`, `fx`, `cut`, `move`, `emphasis` and `exit` is an
   id from `mm pattern list`, or a style role (below). Where none fits, write a **named gap**.
3. **The style file is the only look.** Piece CSS holds `--mm-*` variables only (G-BRAND fails a colour
   or face the brand does not own; W-LITERAL warns on a literal size or timing). Change the look in `style.json`.
4. **Time alone drives motion.** No timers, `Date`, `Math.random` or CSS animation in `piece.js` or
   `piece.css` (G-TIME, which also traps them at run time). The kit draws every frame from `t`.
5. **Options for taste, arithmetic for rules.** A gate failure is fixed, not debated; *how* is a
   taste call when there is more than one honest way.
6. **Write before you change.** A note goes into `defects.md` with its timecode before anything is
   edited; every call goes into `direction-log.md` as a quotation from the director.
7. **Honest reporting** (AXIOMS.md AXIOM 8). A rule that did not run is SKIP, a warning is read and
   answered, a threshold is never loosened to pass a piece, the handover lists what nobody verified.
8. **Escalate, do not improvise** (AXIOMS.md AXIOM 14). A missing fact is a question; a missing
   pattern is a named gap; a brief too long for its duration gets a re-scope.
9. **A device only when the viewer must see the product in use**. An idea, a number or a
   claim gets type, data or a picture; outside an app demo, devices fill at most a third of scenes.
10. **Look, not ambition; one thing at a time.** Judge a frame by how it looks, not by how much it
   does; change one thing per round, render, then judge the next.

## Write the story in the style's roles

The default way to write `story.json`, so the motion style shows:
- A beat's `fx` is `"style:headline"`, `"style:body"`, `"style:figure"` or `"style:plate"`; the
  motion style decides the entrance (editorial: rise, fade, count, pop; kinetic: slam, words,
  punch, drop). A figure with `value` and a kinetic style needs `text` as well (`"text": "412"`):
  `entrances/punch` draws `text`, and without it the figure is blank.
- A scene gives `"position": "opening|related|topic|climax|outro"` and **no `cut`**; the style
  decides the transition. Name a pattern id only to override the style for that beat or scene, and
  say why in the log.
- **The first frame is the hook** (W-HOOK; the default for a feed film, a cold open is the
  director's call): the first headline is finished at frame 0. Film: `"at": 0` with `"params": {"instant": true}`. Deck: `"step": 0` (on rest 0,
  no animation, no emphasis). Later scenes use `step: 0` to be present as the scene cuts in.
- After a hard cut a first arrival may sit at `at: 0`; after a soft cut it waits for `d + 0.1`
  (W-STAGGER). W-EMPTY warns on more than 6 frames (0.2 s) with under 0.5 % ink: bring
  the first arrival to `d + 0.1` and use a cut that carries the old scene (crossfade, push).
- The story schema needs `move` (null) and `say` on every scene and a `cta` with both `text` and
  `url` (`""` when a film has no link). Slots, params and ids: `references/patterns-cheatsheet.md`.

## The seven gates

A gate closes on three things: material shown, the director's answer and a log entry. A 20 to 30 s
piece may take gates 2 and 3, or 4 and 5, in a single message, but the log keeps a section for each. Details, exits and what to show: `references/gates.md`.

**Gate 1 · Brief.** Ask only for the gaps: purpose and channel (this fixes the
formats), the one thing to remember or do, three words for the feeling, the facts with sources,
faces and consent; for a deck the audience, running time and language. Probe every reference first
(`ffprobe -show_streams <file>`; for a film `mm motion capture --from <video> --out
pieces/<id>/capture/motion.json` gives the shot list and `motion.capture-notes.md`). Screen
content, only if a scene shows the product in use (ask for its entry, key action and result): record it (simulator or phone) and `mm media
prep`, or `mm capture site`; a real device's frame: `mm media frame`. A talking-head recording, a still to take apart, a mascot: the cheatsheet's notes. A picture, clip, music, sound effect, narration or transcript MM does not draw: `mm gen` (it prints a plan and exits 3; show the plan, get the director's yes, then `--yes`; `references/generate.md`). Write the brief summary; the director confirms it.

**Gate 2 · Treatment.** Offer two or three named directions that differ in impact (hook, rhythm, reveal, production value
such as 3D devices, finishes, music sync) as well as in look. Each: a short paragraph and a beat sheet
(`references/archetypes.md`) with named gaps; say which would stop the scroll and which you would take. Arithmetic (it
advises): film 20 to 60 s, deck 6 to 20 presses (W-LENGTH); words × 0.3 s + last arrival ≤ the scene (W-READ); 2 s quiet
after the last arrival (W-QUIET). The gate does it: `mm new` (above), the beat sheet into `story.json`, `mm check <piece>`.

**Gate 3 · Style.** Choose the mode (below), compose into `<piece>/style.json`, show a swatch and
tempo sheet: `mm pattern stills layouts/title-stack --style <piece>/style.json`, the same for
`layouts/stat-hero` and for the style's `entrances.headline` id (e.g. `entrances/rise`); copy each
sheet into `<piece>/out/gate3/` before the next run (where they land: `references/gates.md`). Music: `mm beats <track.wav>
[--bpm N] --out <piece>/assets/beats.json`, set `audio.beats`, show the section map. Approval of
style and grid. The brand half sets the composition (align, headline scale, density),
and may add a `finish` (grain, vignette, paper edge, scanlines, chroma, bloom, a named `look`), a `ground` kind and a glass `surface`, and `motion.frameHold: 2` (on twos). **Style
audition:** for a new look, render the first 10 s in two or three styles and ask the director to choose between them.

**Gate 4 · Style frames.** Finish `story.json` (roles above), building the strongest scene first.
`mm stills <piece>` (every rest, mid-entrance, a strip per move, `out/contact.png`, `out/phone.png`),
then `mm review <piece>`; ask the stills questions (below). Animate only stills the director approved.

**Gate 5 · Animatic.** Real timing: `mm check <piece>`, then `mm export <piece> --formats 16x9 --fps 15` (it refuses a
gate report of an older story or other formats; `--force` stamps the MP4 `UNCHECKED`, never delivered). Pacing is judged
from the export, never stills; show motion decisions as options. **Then** start `mm studio <piece> --open` once, in the
background; give the director its URL and reuse it to gate 7 (restart only if it died). Each round read the new
`who: "studio"` receipts of `<piece>/out/studio/journal.jsonl`, the director's direction: log, never undo (`references/gates.md`).

**Gate 6 · Cut.** Until **lock**, never while the studio exports: `mm check <piece>` (exit 0, or fix or ask the
director) → `mm export <piece> --prove` (it reads each MP4 back) → `mm sound <piece>` (cues, bed, loudness, muxed) →
`mm check <piece>` again (G-PEAK and W-LOUDNESS run on the mux) → `mm verify-export <mp4>` per format → `mm review <piece>`. Export is `--sub 1` by
default; above 1 it blends instants into ghosts of fast text and W-SUB warns, so leave it unless the
story's text barely travels. Every WARN is read; the director accepts it or asks for a fix, in one line in
the log. Timecoded notes go into the ledger first; each cut is checked against the whole ledger.

**Gate 7 · Deliver.** Every format from the one piece (end cards scale at least 1.5× on square and
portrait; a length cut removes beats, never trims a line's reading time); for a deck
`out/deck/`, `out/handout.pdf`, `out/walkthrough.mp4`; poster, loop check, contact sheet, `out/share-copy.txt` (set `story.share` if the composed caption is not postable). Where
a fade to a colour is specified, extract the opening and closing frames and look at them. Write the handover
(`references/handover.md`); the delivered folder goes to the director for acceptance.

## The beat sheet

One row per scene (film) or press (deck), before `story.json` is final:

| # | Scene · layout | s / press | On screen (exact copy, fact ids) | Arrives as (role or id, `at`) | Cue | Said |
|---|---|---|---|---|---|---|
| 1 | hook · `layouts/title-stack` | 0–3.5 | "Most AI video looks like AI video." | `style:headline` 0, instant | hit | Hook |

Slots and ids with key params: `references/patterns-cheatsheet.md`. Turning the table into
`story.json` (beats, `params`, `cutParams`, `moveParams`, cues, `beats.json`, `cta`):
`references/beat-sheet.md`.

## Named gaps

When no pattern does what a row needs, write `GAP: <what is missing>` with the two closest ids
(`GAP: a logo that draws on (closest: entrances/draw, entrances/mask-reveal)`); the director picks
a stand-in or cuts the row. Record build gaps in the piece folder's `gaps.md`, and read
it before the treatment.

## The style step: three modes

The three agnostic modes (SPEC.md §13), recorded in the log. A style is a
brand half (colour, type, composition) worn with a motion half (tempo, curves, cuts, entrances).
- **Apply (preset or compose).** `mm new --kind <k> --style editorial|kinetic|calm-product|nocturne-kinetic|spot-mono|print-plates|blueprint|obsidian-premium --id
  <id>` for fictional brands (the cheatsheet's "Looks" note says what each look asks of a story); or any brand with any motion: `mm style compose --brand
  <name|path> --motion <name|path> --out <piece>/style.json`. Shipped halves: brands `linen`,
  `nocturne`, `paper`, `signal`, `greyfield`, `twoplate`, `draftline`, `obsidian`; motions `calm`, `kinetic`, `premium`, `grid`, `stop-motion`, `proof`.
- **Capture.** `mm brand capture --from <url|index.html|figma-export.json|DESIGN.md|folder of stills> --out
  <piece>/capture/<name>.json [--name <name>] [--color role=#hex]` (a typed hex wins; from stills the fonts land in `ask`, and W-ASK
  warns until they are set) and `mm motion capture --from <video> --out <piece>/capture/<name>.json [--name <name>] [--fps N]`;
  `--name` defaults to the `--out` basename (2 to 41 lowercase letters, digits, hyphens), notes beside it as
  `<out-name>.capture-notes.md` (no `--out`: `brands/<name>.json` in the git-ignored `docs/private`). Read every guess with the
  director; fix a warning (a muted colour under 4.5:1) in the half before composing. Capture takes a reference's grammar, never its
  content (H-REF); a captured brand is not fictional and stays out of shipped presets and `styles/`.
- **A real brand's own folder.** `mm brand init <folder> [--from <brand>]` makes it outside the engine (half, fonts,
  logo, sources, facts, projects); `mm project new <name> --brand <folder> --kind film|deck`, then `mm project make
  <project-folder>`, checks, exports and fills the project's `out/`. Real brands live there, never in `styles/`.
- **Embed.** `mm skill new --brand <name|path-to-brand.json> [--motion <name|path>] --out <dir> [--license <spdx>] [--force]`
  scaffolds a thin per-brand skill, named `<brand>-motion` whatever the motion (default `calm`): `SKILL.md` (loads this engine's
  skill first), `style/` (`brand.json`, `motion.json`, composed `style.json`), `fonts/` with licences, `facts.md` (empty; the only
  source of that brand's numbers) and the bans it lifts. Use it: `mm new --kind film --style <dir>/style/style.json --id <id>`. The
  studio pins its own soft thresholds in the `gate` block of `style/motion.json` (`references/gates.md`).

## Stills review questions (gate 4, and again at every cut)

Put the answers to the director with the contact sheet:
1. Is the first frame the strongest image and the headline finished, not a logo (H-HOOK, W-HOOK)?
2. Does each rest say one thing; is a figure alone in its press (H-ONE)?
3. Does the content sit between the header row and just above mid-frame, never pooled low (H-FILL)?
4. On `out/phone.png`, can every word be read at 360 px wide (9x16, 4x5 and 1x1; a 16x9 film is judged
   at 960 px, and `data-micro` text may carry no fact, no call to action, no only-copy)?
5. Does any rest look like a banned default: centred title on a gradient, everything fading,
   corner labels, frame borders (repository root: `references/bans.md`, W-BAN)?
6. Does every number on screen trace to a story fact with a source (H-FACTS)?
7. Is the last rest the line to remember (H-LAST)?

## Options side by side

For a taste call, render two or three candidates and put one plain sentence beside each on what
it gives and what it costs. State your preference; the director answers. Cheapest:
- an entrance, exit, emphasis, cut or move: `mm pattern stills <group>/<name> --style
  <piece>/style.json` per candidate (copy each sheet out before the next run). There is no
  side-by-side command; join sheets of equal height with `ffmpeg -i a.png -i b.png
  -filter_complex hstack=inputs=2 ab.png` (`vstack` for equal widths);
- a layout, timing, copy or scene-order choice: copy the piece without `out/` to a sibling folder
  (same depth), change one thing, `mm stills` it, keep its `out/contact.png` as
  `<piece>/out/options/<call>-b.png`, remove the copy.
Log the options shown, the director's words and the choice. A decision forced by a G- rule is
logged as such, with the options for *how* it was met.

## Direction log, defects ledger, handover

`<piece>/direction-log.md`: one `## Gate N · <name>` section per round (each round closes at a gate, so `Gate N` heads round N's section; `mm review` reads it),
starting from a `>` quote of the note the director gave that round, then `| # | Call | Options shown | Director's
words | Decision |`: `references/direction-log.md`. `<piece>/defects.md`: one row per note, `| # |
Timecode / press | Note | Raised by | Status | Fix |`, status `open · fixed · regressed ·
accepted`, written before the change: `references/defects-ledger.md`. At delivery fill
`references/handover.md`: location, length, size, formats, a line per scene, H- rules applied,
every WARN with its reason, named gaps, and **what stayed unverified** (playback not watched,
audio not heard, names and dates needing a second read, any face, any ban lifted).

## H- checklist (applied by you, checked by the reviewer, named in the handover)

- [ ] **H-HOOK** strongest image first, finished at frame 0, never a logo
- [ ] **H-ONE** one idea per press; a figure alone in its press
- [ ] **H-INFO** every movement carries information
- [ ] **H-STILL** stillness after a big moment
- [ ] **H-FILL** content between the header row and just above mid-frame
- [ ] **H-FACTS** every number cites a story fact with a source
- [ ] **H-FACES** no face without consent
- [ ] **H-LAST** the final rest is the line to remember
- [ ] **H-REF** a reference gives its grammar, never its content
- [ ] **H-SOUND** the largest motion event of each scene carries a cue (`riser` and
  `swipe` end on the beat)

## Pitfalls and read-first

| Pitfall | Caught by | Read first |
|---|---|---|
| A cue off the beat grid, or a declared BPM with no `beats.json` | W-CUE (SKIP without a grid) | `references/pitfalls.md` §1 |
| First arrival inside the incoming cut; blank frames before it | W-STAGGER, W-EMPTY | `references/pitfalls.md` §2 |
| Too many words for the scene's seconds; a rest under the style's floor | W-READ, W-HOLD | `references/pitfalls.md` §3 |
| One story worn by two styles with different arrival bands | W-PACE, W-MIX | `references/pitfalls.md` §4 |
| A camera move still travelling over the rest | W-AMBIENT | `references/pitfalls.md` §6 |
| A figure with a long suffix in portrait; two text slots touching (overlap or bleed on purpose: `data-over`, `data-bleed`) | G-EDGE, G-OVERLAP | `references/pitfalls.md` §7, §8 |
| A deck's last press bringing two things | W-QUIET | `references/pitfalls.md` §9 |
| A hex or family in `piece.css`, a millisecond in it; a timer in `piece.js` | G-BRAND, W-LITERAL, G-TIME | `references/pitfalls.md` §10 |
| A slot or id that does not resolve; a number with no fact | G-PATTERN-REF, G-FACT-REF | `references/patterns-cheatsheet.md` |
| Exporting with `--sub` above 1 while text travels | W-SUB | `references/pitfalls.md` §12 |
| Fading everything in | W-FADE-ONLY, W-BAN | repository root: `references/bans.md` |
| A one-pixel difference between renders after a scale entrance | `--prove` (not the gate) | `references/pitfalls.md` §14 |

## References (read when)

- `references/gates.md`: each gate. `references/archetypes.md`: the treatment (incl. stills-first demo, reel).
  `references/beat-sheet.md`: `story.json`. `references/patterns-cheatsheet.md`: any pattern.
  `references/on-brand.md`: gate 3, a param set twice, `mm gen`. `references/handover.md`: gate 7. `references/material.md`: a transcript, caption, file name or captured page.
  `references/direction-log.md`, `references/defects-ledger.md`: first entry, notes. `references/pitfalls.md`: gate 2, any fail or warning.
- Repository root, read when named: `references/pacing.md` (holds, reading time, short-form bands, word reveals),
  `references/transitions.md` (cuts), `references/springs.md` (a motion style), `references/sound.md`
  (cues, loudness, a bed under a voice), `references/bans.md` (a generic look, data restraint), `references/principles.md` (H- rules),
  `references/troubleshooting.md` (flicker), `runtime/kit/README.md` (params), `GUIDE.md` (a tour), `SPEC.md` (grammar).
