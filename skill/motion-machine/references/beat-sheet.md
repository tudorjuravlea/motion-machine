# The beat sheet and how it becomes `story.json`

Read when: writing the treatment (gate 2), or turning an approved beat sheet into `story.json`.

## The table

One row per scene for a film, one row per press for a deck. Copy is exact (it is what the gate
counts), patterns are ids from `mm pattern list`, times are scene-local seconds.

| # | Scene · layout | s / press | On screen (exact copy, fact ids) | Arrives as (role or pattern id, `at`) | Cue | Said |
|---|---|---|---|---|---|---|
| 1 | hook · `layouts/title-stack` | 0–3.5 | "Most AI video looks like AI video." | `style:headline` 0, instant | hit 0 | Hook |
| 2 | problem · `layouts/statement` | 3.5–7 · cut `transitions/push` | "Nobody checks it before you post it." | `entrances/rise` 0.7 | none | The gap |
| 3 | gate · `layouts/stat-hero` | 19–23 · cut `transitions/zoom-through` | 32 (f2) · "rules, measured, not felt." | `entrances/count` 1.0 · `entrances/rise` 1.6 | riser 1.0 | The gate |
| 4 | GAP: a logo drawing on | — | — | GAP (closest: `entrances/draw`, `entrances/mask-reveal`) | — | — |

Write arrivals as style roles (`style:headline|body|figure|plate`) and cuts as a `position`
(`opening|related|topic|climax|outro`) so the motion style shows; a pattern id is an override.

Under the table, per scene: words, words × 0.3 + last `at`, the scene's seconds, the rest left
after the last arrival settles. Mark any scene that does not fit; never squeeze it silently.

## From the table to `story.json` (SPEC.md §4)

```jsonc
{
  "id": "<piece id>", "kind": "film", "formats": ["9x16", "1x1", "16x9"],
  "title": "…", "language": "en",
  "facts": [ { "id": "f2", "text": "…", "source": "…" } ],
  "audio": { "track": null, "bpm": 120, "beats": "assets/beats.json" },
  "scenes": [
    { "id": "hook", "layout": "layouts/title-stack", "duration": 4, "position": "opening", "move": null,
      "beats": [
        { "at": 0, "slot": "headline", "fx": "style:headline", "text": "…", "params": { "instant": true } } ],
      "say": "…" },
    { "id": "gate", "layout": "layouts/stat-hero", "duration": 4, "position": "related", "move": null,
      "beats": [
        { "at": 0.5, "slot": "figure", "fx": "style:figure", "value": 32, "text": "32", "fact": "f2", "cue": "riser" },
        { "at": 1.6, "slot": "headline", "fx": "entrances/rise", "text": "rules, measured, not felt.",
          "params": { "d": 40, "exit": { "side": "left" } }, "emphasis": "emphasis/indicate" }
      ],
      "say": "…" }
  ],
  "cta": { "text": "…", "url": "…" }
}
```

A scene may also give `cut` (a pattern id; it wins over `position`), `cutParams` and `moveParams`.
The schema requires `move` (a pattern id or `null`) and `say` on every scene.

- **Slots** are the layout's (`patterns-cheatsheet.md`, layouts table). An unknown slot is
  appended with a kit warning; an unfilled slot is hidden (`data-empty`).
- **Params route by kind:** `params` → the entrance; `params.exit` → the exit; `params.emphasis`
  → the emphasis; `cutParams` → the scene's transition; `moveParams` → its camera move. Values
  are strings, numbers or booleans; a series is a string (`"values": "3,5,8"`).
- **Cascades:** `params.each: true` splits the text on `params.sep` (default `|`) and staggers the
  parts by `params.stagger` or the style's `stagger.eachS`, capped at `stagger.capS`.
- **Deck:** `presses` instead of `duration`; each beat has `step` (the press inside the scene that
  brings it, from 1) and `at` (seconds after that press). Rest 0 is the first layout before any
  step; a deck has `presses + 1` rests. `step: 0` puts a beat on rest 0,
  finished, with no animation (its `at` is ignored); the first scene's headline needs it (G-HOOK).
- **The hook (G-HOOK):** a film's first headline is finished at frame 0:
  `at: 0` and `params.instant: true` (an entrance of 0 s). Without it the gate fails.
- **`cta`:** `text` and `url` are both required strings (a film with no link carries
  `"url": ""`). The call to action is never `data-micro` text.
- **Timing:** a beat's `params.dur` (a role name) or `params.spring` (a spring role) overrides the
  pattern's own. Numeric durations are counted by W-DUR-LITERAL; prefer roles.
- **Cues** go on beats (`"cue": "tick"`) and sound at the beat's `at` (`riser` and `swipe` end on
  it instead). With a grid, put every cued beat on a beat of the grid (scene
  start + `at` within 40 ms of a beat, W-CUE). With no track, write the grid by arithmetic; this
  is all W-CUE needs, in `assets/beats.json`:
  ```json
  { "bpm": 120,
    "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3] }
  ```
  one entry every 60/bpm seconds to the piece's length; or `node -e 'console.log(JSON.stringify({bpm:120,beats:Array.from({length:61},(_,k)=>k*0.5)}))' > <piece>/assets/beats.json`
  (a 30 s piece at 120 BPM); `audio.beats` is `"assets/beats.json"`. With a track,
  `mm beats <track.wav> [--bpm N] --out <piece>/assets/beats.json` writes the full format
  (`bpm`, `beats`, `downbeats`, `hits`, `offsetS`).
- **Facts:** a beat that shows a number carries `"fact"`; the id must exist (G-FACT-REF).

## Timing rules of thumb (all checked by the gate)

- After a soft cut of `d` seconds (the style's cut duration), the first arrival at `d + 0.1` or
  later (W-STAGGER). A hard cut has `d = 0` and **W-STAGGER does not apply** to the first arrival
  after it, nor to frame 0: `at: 0` is allowed. Blank
  frames before a late first arrival are W-EMPTY's business (more than 6 frames under 0.5 % ink). Measure `d` with `schedule()` in repository root: `runtime/kit/schedule.js` or read
  W-STAGGER's evidence.
- Scene durations add up exactly to the running time; a transition takes no time of its own,
  because it plays inside the first `d` seconds of the incoming scene.
- The rest after the last arrival settles must reach the motion style's `pacing.holdMinS` (W-HOLD).
- The last film scene keeps 2 s after its last arrival (G-QUIET).
