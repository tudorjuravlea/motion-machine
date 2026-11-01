# The seven gates in detail

Read when: at the start of each gate. Gate N closes round N (SPEC.md §11), and the order never
changes. A gate is passed once the director has answered what was shown, in words that can be
quoted in `direction-log.md`.

| Gate | Starts from | You prepare | The director sees | The director answers | The log row records |
|---|---|---|---|---|---|
| 1 Brief | the user's message, files, references | a summary of the brief; questions only for what is missing | the summary and the questions | confirms the brief | purpose, formats, the one thing, three words, facts, faces, language |
| 2 Treatment | the confirmed brief | two or three named directions that differ in impact as well as look, each a paragraph and a beat sheet; the one that would stop the scroll and the one you would take | the sheets next to each other, with the arithmetic per scene | names the direction to take, or asks for others | the direction, length, scene list, named gaps |
| 3 Style | the chosen direction | a composed `style.json`; a swatch and tempo sheet; the beat grid | pattern stills of title-stack, stat-hero and the headline entrance; a section map when there is music | accepts the style and the grid | mode (preset, compose, capture), `from`, bpm |
| 4 Style frames | the accepted style | `story.json`; the stills | `out/contact.png`, `out/phone.png`, `out/review.html` | signs or annotates each still | per still: signed, or the note |
| 5 Animatic | the signed stills | a low-cost export on the grid | the MP4, and candidates for every motion call | judges the pacing | each motion call with its candidates |
| 6 Cut | the accepted animatic | the full export, the sound mix, the check | MP4s, the check summary, the review page, each WARN | **lock** | each note as a ledger row; the lock |
| 7 Deliver | the locked cut | every format; for a deck, its folder, handout and walkthrough; the handover | the handover with its unverified list | signs off the folder | the sign-off, and what is still open |

## Gate 1 · Brief

Ask only what is missing, in one message:
- **Purpose and channel.** Feed (muted autoplay: copy carries the meaning), talk, site, ad. The
  channel fixes the formats: Instagram Reels and Stories, TikTok, Shorts 9x16; Instagram and
  LinkedIn feed 4x5 or 1x1 (LinkedIn also plays 16x9); site and YouTube 16x9; talk deck 16x9. The
  director can add or remove formats later in the studio (gate 5 on).
- **The one thing** to remember or do, and **three words** for the feeling.
- **Facts with sources.** Every number that will be on screen needs one (H-FACTS). A number without
  a source is a question, never a guess.
- **Faces and consent** (H-FACES), **names and dates** (they go on the unverified list).
- Deck only: audience, running time, language, who presses.

Measure a reference before you talk about it: length, frame size, shot count, kinds of cut, background
colours. `ffprobe -v error -show_entries stream=width,height,duration -of json <file>`;
`mm motion capture --from <file> --out pieces/<id>/capture/<name>.json` measures shots and cuts and
writes `<name>.capture-notes.md` beside it (`--name` defaults to the `--out` basename). Captures
go in the piece's `capture/` folder or a git-ignored one, never in the tracked `styles/`. Describe
what was measured, not what you expect. If the director's words contradict the brief, the
director wins; log the change in this gate's row.

## Gate 2 · Treatment

Two or three directions that differ in how the piece is built (structure, tempo, what carries the
story) and in impact, never one idea worded several ways. Impact is the hook (a finished headline, a
cold open, a reveal that builds), the rhythm (cut and arrival tempo), the reveal (what the viewer sees
last), and production value: 3D devices, finishes (grain, vignette, paper edge), music sync. Each
direction: a name, one paragraph, a beat sheet (`beat-sheet.md`), named gaps, and a line on which of
the three would stop the scroll in a feed and why; say which one you would take. The arithmetic below
advises: a direction may break a line on purpose, and the director decides.
- film 20 to 60 s; deck 6 to 20 presses (W-LENGTH);
- per scene: words × 0.3 s + the last arrival's `at` ≤ the scene's seconds (W-READ);
- the first arrival after a soft cut at least 0.1 s after the cut ends (W-STAGGER; not after a
  hard cut or at frame 0), and no run of more than 6 near-empty frames (W-EMPTY);
- the first frame is the hook: the headline finished at frame 0 (W-HOOK, the default for a feed film; a cold open or a reveal that builds is a choice to name);
- 2 s of quiet after the last arrival in a film; one element at most on a deck's last press (W-QUIET);
- no 4 s window without an arrival, cut or move (W-DEAD; a long held hero shot is a choice to name);
- arrivals per 10 s inside the motion style's band (W-PACE), cues per 10 s inside its sound band (W-MIX).
- no text over the speaker's face (W-FACE): a talking layout keeps its headline, caption and panel tile clear of the face box; a frame mode (`side`, `inset`, `bottom`) leaves more room.
- a beat that illustrates a spoken word names it (`anchor: "the word"`) and arrives from 1.8 s before to 0.2 s after it, at the word minus 0.5 s by default (W-ANCHOR, against the footage's words or the voice's `<track>.words.json`);
- the questions the film raises are declared in `loops`: at most two open at once, each closed before the call to action (W-LOOP);
- one beat lit in the accent at a time, and a finished text retired to 0, not left half there (W-FOCUS);
- few values, reused: at most 4 stroke widths, 5 font sizes and 3 corner radii in a piece (W-TOKENS);
- an exit and the next scene's entrance travel the same way at the same speed, within 5 % (W-SEAM);
- no template: not more than half of the scenes put their content in the same boxes, and no two neighbouring scenes of one layout differ in text only (W-SAMEBOX);
- every cue measured against the style's sound profile, and every sound file with its licence on record, and a sound found on Openverse still within the licences the piece offers and still the file that was fetched (W-PALETTE, W-SAMPLE-LICENSE), and no cue carrying a click, a DC offset, clipping, a cut tail, a comb ring, a ghost in the tail, stacked attacks or a rising glide (W-SOUND-ARTIFACT); every cue heard in the finished mix, over the music and the voice (W-AUDIBLE), and on its picture event (W-CUE reads the sync lock `mm sound` writes);
- a film's voice-over (a scene's `say`) read for words a voice may get wrong that nothing marks (W-SAY): acronyms, camelCase names, file names, web addresses, numbers with units. `[display](spoken)` in the text, or the brand's `voice.lexicon`, says how a word is read; `<<slot>>` before a word puts the beat with that slot on it (W-ANCHOR checks it). `mm say-lint` reads a text or a piece, and `mm gen voice` shows the findings in its plan and stops a `--yes` until they are fixed or `--say-ok` says they are meant
- the shape of the sound: a hook in the first 0.6 s, a spread of levels, no machine-gun, and five places to listen first (W-SOUND-SHAPE);
- every ease the piece spells read as written: it parses, a custom curve is a function of x, steps are whole, `linear()` stops run 0 to 1 (W-EASE);
- every deck step reached by a press, and one beat to a slot in a scene (W-DECK-STEP);
- every motion eased through its whole duration, with no odd frame, no jump-then-stop and no stop between two motions of one element (W-POP, W-DEADSTOP: read from the frames).

When a brief cannot be told legibly in its seconds, say so and offer the re-scope (fewer words,
fewer scenes, more seconds); the director chooses (AXIOMS.md AXIOM 14).

## Gate 3 · Style

Record the mode (apply, capture or embed) and the `from` paths. For a captured half, walk the
director through `<name>.capture-notes.md`; a half captured from stills lists its fonts in `ask`,
and W-ASK warns until the director names them and they leave `ask`. For a new look, run
the style audition: the first 10 s of the story in two or three styles side by side. Show the
composed style on two layouts at rest and on its headline entrance:

```
mm pattern stills layouts/title-stack --style pieces/<id>/style.json
mm pattern stills layouts/stat-hero --style pieces/<id>/style.json
mm pattern stills <style.entrances.headline> --style pieces/<id>/style.json
```

The contact sheets land in `patterns/<group>/<name>/demo/out/<style>-contact.png` (a git-ignored
`out/` folder inside the pattern), named after the style file: a piece's `style.json` becomes
`style-contact.png` and the next run overwrites it, so copy each sheet to `<piece>/out/gate3/`
first. The format is the demo's own, 9x16 for layouts and 16x9 for entrances; `--format` sets
another, and the printed line names it. With music:
`mm beats <track> [--bpm N] --out pieces/<id>/assets/beats.json`, then set `audio.beats` in the
story. With a declared BPM and no track, see `pitfalls.md` §1.

**Tuning the warnings for a brand (embed mode).** A brand studio (`mm skill new`) pins its own soft
thresholds in a `gate` block in `style/motion.json` (compose again; the composed `style.json` carries
it). It adjusts warnings only, and every key is optional: `length` (`filmS`, `loopS`, `deckPresses`,
each `[min, max]`) for W-LENGTH; `deadS` for W-DEAD; `quietS` for W-QUIET; `read` (`perWordS`, `labelS`,
`sentenceS`) for W-READ; `anchor` (`earlyS`, `lateS`) for W-ANCHOR; `tokens` (`strokes`, `sizes`, `radii`) for W-TOKENS; `seamPct` for W-SEAM; `sameBox` (`share`, `minScenes`, `quant`) for W-SAMEBOX; `liftBans` (`centered-title-on-gradient`, `corner-labels`, `frame-borders`) for
W-BAN, which then stops reporting those looks while the style's `bans` stay as they are. The hold floor,
the arrival band and the stagger cap are still `pacing` and `motion.stagger` (W-HOLD, W-PACE, W-STAGGER).
A key naming a G- rule, or any unknown key, is a contract error and `mm check` exits 2: hard rules are
never tunable. A tuned rule reports the threshold it used. Tune from what the brand's films are (a
bumper brand widens `length.filmS`), with the director's word, before a piece, never to silence a
warning after the fact.

## Gate 4 · Style frames

`mm stills pieces/<id>` then `mm review pieces/<id>`. Build the strongest scene first and bring it
to final quality before the others. Ask the seven stills questions (SKILL.md). Each scene is
signed or gets a note in `defects.md`. Run `mm check pieces/<id>` too: G- failures found at
stills are cheaper than at the cut.

## Gate 5 · Animatic

`mm check pieces/<id>`, then `mm export pieces/<id> --formats <one format> --fps 15 [--force]`.
`mm export` trusts only a gate report of the story as it is now and of every format it renders:
after any edit, or after `mm check --format F` (or the studio's Run gate, which checks one format),
run `mm check pieces/<id>` again, or the export is refused (`--force` exports anyway, stamped
UNCHECKED). Present pacing, cut weights, holds and entrances as options (SKILL.md, "Options side by
side"). Tell the director that stills cannot show pacing and that only the export can.

Then start the studio once and leave it running: `mm studio pieces/<id> --open` in the background
(it prints its URL and opens it). Keep that URL for every round to gate 7; check it still answers
before a round and start it again only if it died: a second `mm studio` is a second server and a
second tab. Tell the director what it is for: the piece above a timeline, drag a line to retime it
or a scene's end to change its length, `?` for the keys, every Instagram, LinkedIn and YouTube size
side by side in the format switch to preview, **Export** to check, render, mix and check the mix (a
format ticked there that the piece does not ship yet joins the story, and its layout is checked then).

The journal, `out/studio/journal.jsonl`, holds every write: the director's (`who: "studio"`), your
own `mm timeline` receipts (`who: "cli"` or the `--who` you gave) and undo receipts (`undoes`: the id
they revert). Remember the last receipt id you read; each round read only the receipts after it,
carry the `who: "studio"` ones (net of their undos) into the direction log as the director's, and
re-run `mm check`, since a drag can change a verdict. Never undo a studio edit; argue for a change as
an option instead. When a studio edit fails a G- rule, show the director the failing rule and the
fix as options and leave the choice to the director; do not revert it yourself.

While an Export runs in the studio (its banner says edits are paused), the piece is locked:
`mm timeline` edits are refused with `refused (exporting)`, and `mm export` or `mm sound` exit 2
with "an export of this piece is running". Wait for it to end; never start a second export beside
it. The same holds the other way: while your `mm export` runs, the studio's edits and Export wait.

## Gate 6 · Cut

Not while the studio's Export runs (a second exporter is refused, exit 2).

```
mm check pieces/<id>                      # exit 0, or fix and repeat
mm export pieces/<id> --prove             # every format; --prove re-renders in reverse and compares bytes; each MP4 is read back (out/export-qa.json)
mm sound pieces/<id>                      # cues + bed, loudnorm, muxed into the MP4s
mm check pieces/<id>                      # again: G-PEAK and W-LOUDNESS now run on the muxed audio
mm verify-export pieces/<id>/out/<id>-<format>.mp4   # per format: the muxed file read back (sound, level, silence, black, frozen, every cut's seam)
mm review pieces/<id>                     # out/review.html, newest round first
```

`--sub` defaults to 1. Above 1 the exporter blends instants (`--sub 4`) and W-SUB warns when any
text travels more than 4 px per frame, because blending turns fast text
into ghosts; `mm check <piece> --sub N` reports the same warning without exporting.

The export reads each finished MP4 back (SPEC §16.7) and a failed check exits 1: `out/export-qa.json` says which (QA-DURATION,
QA-BLACK, QA-FROZEN, QA-SEAM …) and `out/export-qa-seams-<format>.png` shows the frames either side of every cut. Its checks of the
mix (QA-AUDIO, QA-SILENCE, QA-LEVEL) are SKIP until `mm sound` has muxed it; `mm verify-export` runs them. Report its SKIPs, never as PASS.

Edits and checks go in order. `mm check` records the last edit it saw (the `journal` of `out/check.json`, the
last receipt of `out/studio/journal.jsonl`); `mm export` refuses a report older than the last edit, and `--force`
stamps the media UNCHECKED. After any edit, studio drag or `mm timeline` receipt, run `mm check` again before the
export or the handover.

Every WARN is read. Show each to the director with its evidence; the director accepts it or asks for a fix,
in one line in the log, and an accepted warning travels to the handover with that line. A warning the
director accepts is not a defect; one they want fixed becomes a `defects.md` row. The
director's notes enter `defects.md` before any change. Repeat until the director answers **lock**.

## Gate 7 · Deliver

Film: `out/<id>-<format>.mp4` for each format the story ships (`9x16`, `1x1`, `4x5`, `16x9`),
`out/poster.png` (a frame of the story's first format: export that format in the last run),
`out/loop_check.mp4`, `out/contact.png`. Deck: `out/deck/` (opens from disk, no server), `out/handout.pdf`,
`out/walkthrough.mp4`. Probe what you claim:
`ffprobe -v error -show_entries stream=codec_name,width,height,duration,color_space,color_transfer,color_primaries,color_range -of json <mp4>`.
Write the handover (`handover.md`) and ask for sign-off.
