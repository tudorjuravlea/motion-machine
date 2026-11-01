# The studio

A lens and a pen on one story file. The studio shows a piece as a timeline, plays it,
and writes each gesture back into `story.json` as the smallest change; `mm timeline` does the same
for agents. Nothing lives here that the story does not hold: close the studio and the piece is the
story, as it always was.

```
gesture ─▶ edit ops ─▶ JSON patch ─▶ story.json (only the edited bytes)
   ▲          │ inverse                      │
   │          ▼                              ▼
 timeline ◀─ model ◀─ the kit's schedule ◀─ the piece, redrawn
   ▲                                         │
   └──────── live gate (timing rules) ◀──────┘
```

## Parts

| Module | What it is | Runs in |
|---|---|---|
| `json-splice.js` | JSON with byte ranges; an RFC 6902 patch (add, remove, replace, move) applied to the text so only the edited bytes change, inserts copying their siblings' style. `JSON.parse` of the result always equals the patch applied to the parsed value | Node, browser |
| `ops.js` | The typed edit ops (`contracts/edit-ops.schema.json`): `scene.duration`, `scene.order`, `scene.cut`, `scene.move`, `scene.say`, `beat.at`, `beat.out`, `beat.set`, `beat.param`, `beat.add`, `beat.remove`, `story.formats` (the formats the piece ships, canonical order; removing one keeps its variants), `audio.sample` (a cue mapped to a sound file in `audio.samples`; `mm sound fetch --cue` writes it). Each validates against the story and its pattern's params, then compiles to a patch and the inverse ops that undo it. Refusals carry a code and a hint | Node, browser |
| `history.js` | Undo and redo as ordinary edits; a drag's stream of edits to one target merges into one entry, and only when nothing would be lost | Node, browser |
| `model.js` | The timeline: a pure function of the kit's `schedule()` and the raw story. Scenes, one lane per slot name, cues, moves, the music grid; each beat clip knows its source path in the story and whether it can be edited, and why not | Node, browser |
| `geometry.js` | Time and pixels, zoom anchored under the pointer, snap targets in priority order (playhead, music beat, scene edge, clip edge, frame) within 8 px, never to the dragged thing's own edges | Node, browser |
| `../check/timing.mjs` | The live gate: the rules `mm check` runs whose verdict needs only the schedule (W-DEAD, W-LENGTH, W-QUIET, W-READ, W-PACE, W-HOLD, W-CUE, W-FADE-ONLY, W-ASK), from the same rule files, plus `floors()`: the shortest each scene may be, and the dead windows | Node, browser |
| `../lib/story-edit.mjs` | The one writer of `story.json` for the studio and `mm timeline`: version check, story-schema check, a cross-process lock, the receipt appended to `out/studio/journal.jsonl` before an atomic rename; undo by receipt while the file is still that receipt's result; every write refused while an export holds `out/export.lock` (`../lib/export-lock.mjs`: one export of a piece at a time, across processes) | Node |
| `server.mjs` | `mm studio`'s local server: the repo's files by GET and a small JSON API over one piece (`/api/piece`, `/api/edit`, `/api/undo`, `/api/events` SSE, `/api/selection`, `/api/check`, `/api/export`, `/api/export/cancel`); files with Range support, so a `<video>` seeks. 127.0.0.1 only; foreign Host or Origin refused; writes only the story, `out/studio/`, and the gate's `out/check.json`; Export holds the piece's export lock and runs `mm check`, `mm export`, `mm sound` and, after the mix, `mm check` again, which write under `out/` | Node |
| `ui/` | The studio page: stage, transport, timeline, inspector, a key legend under the timeline that shows only the keys that work now (`keybar.js`), the format switch with every film format side by side, named by platform (`formats.js`), and Export (`export.js`), which adds a format to the piece when it renders it. Plain ESM, no framework, no build | browser |
| `../timeline.mjs` | `mm timeline`: the model as a table or JSON, and `move`, `trim`, `out`, `set`, `apply`, `undo`, `check`, `selection`, with a time grammar (`4.5`, `+0.5`, `30f`, `beat:12`, `bar:3`, `end`), `--plan` diffs and receipts; a refusal exits 2 with its hint | Node |

## Two schedules

The timeline draws the **kit's** schedule (with the kit's `each` options, as the mounted piece
draws it). The live gate reads the **gate's** schedule (as `scripts/check.mjs` builds it). They
agree on every shipped piece; they are kept apart so the gate lane never disagrees with `mm check`.

## Export and formats

The format switch shows the formats the story ships; its **Formats** menu lists every film format
by platform, in the order a story writes them (9x16 vertical: Reels, Stories, TikTok, Shorts,
LinkedIn vertical; 1x1 square and 4x5 portrait: Instagram and LinkedIn post; 16x9 landscape:
YouTube, LinkedIn, presentations) and adds or removes one as a `story.formats` edit, undoable like
any other, whose label says when the first format (the poster, the opening view) changes; the last
format cannot be removed. Export (the accent button, ⌘E) opens a panel: every format the story
ships starts ticked, and the sound when `mm sound` has something to mix (`GET /api/piece`'s
`sound`). It runs the full gate on every format, renders an MP4 per ticked format, mixes the sound
and runs the gate again on the mix (G-PEAK and W-LOUDNESS measure the muxed files), and plays each MP4 inline
with its path. A failing gate lists its rules, each naming its format (a row switches to it and
seeks), and offers "Export anyway", stamped UNCHECKED.

The run holds the piece's export lock from the gate to the last check: the story the gate checked
is the story rendered. Edits pause meanwhile (a banner says so; the server refuses them with 409
`exporting`, `mm timeline` with `refused (exporting)`), and a second exporter, in the studio or a
shell, is refused. A story written outside the lock during the gate fails the run; during the render,
`mm export` keeps nothing. Cancel stops the step that is running and says what it left: nothing
during the gate (the gate writes no report when interrupted), no MP4 replaced during the render,
and after the render the MP4s it made. The page matches the server's last export on every
reconnect, so a restarted server's lost run is named, and a finished run is shown after a reload.
A read-only story exports too (export does not edit the story); its formats cannot change.
`mm studio --open` opens the page in the default browser.

## Rules the studio keeps

- The story is the only truth. The page's in-memory story previews an edit in flight
  and is replaced by the file after every save.
- A story with `generator` (written by a build script) and a deck are read-only, with the reason
  shown.
- Edits address the raw story: a beat in a scene whose current format has variant beats is edited
  in the variant.
- Undo applies a receipt's inverse with exact values; it is refused once the file has changed
  since.

