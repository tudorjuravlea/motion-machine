# emphasis/keyword-cta

## Purpose
A keyword chip slams on its beat and three small arrows bob toward it a finite number of times, then leave, so a spoken "comment this word" has a mark the eye cannot miss.

## Use when / Do not use when
**Use when**
- a short-form piece asks the viewer to comment, reply or send one word: the chip is the word
- the frame should stay on after the speech ends (`hold: true`, the default: the chip keeps its filled plate until the beat leaves)

**Do not use when**
- the text is more than a word or two: the chip is one line at a heading size
- there is no room on the side the arrows come from (`from`): they would sit over other text
- the beat has an entrance of its own that is the point (the slam is the arrival: give the beat `params.instant: true`)

## Params
The slot's text is the keyword. Give the beat `params: { "instant": true }` so the slam is its arrival, and `emphasis: "emphasis/keyword-cta"`. `hold`, `tone` and `size` style the slot, so give them among the beat's own params (they are written as `data-p-*`); `from` and `bobs` are read by the module and may also be given in `params.emphasis`.

| name | type | default | meaning |
|---|---|---|---|
| `from` | enum(below\|above\|left\|right) | `below` | the side of the chip the arrows come from, pointing at it; leave room on that side |
| `bobs` | number | `3` | how many times each arrow travels toward the chip and back, 1 to 6 |
| `hold` | boolean | `true` | true: the chip keeps its filled plate after the arrows have gone; false: it relaxes to a quiet outline when the window ends |
| `tone` | enum(accent\|ink) | `accent` | the palette role of the plate and the arrows |
| `size` | enum(h1\|h2) | `h2` | the size role of the keyword |

Brand knobs: from, bobs, hold, tone, size.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-accentInk` (or `--mm-color-ink`, `--mm-color-canvas` with `tone: ink`) for the plate, its text and the arrows; `--mm-color-ink` for the quiet outline's text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h2`, `--mm-size-h1`
- `--mm-space-1`, `--mm-space-3`, `--mm-space-5`, `--mm-radius-3`, `--mm-align`
- the emphasis window is the duration role `hold`, set by the kit

## Legibility and rest notes
- At rest the chip is the slot's own style: level text, no transform, no arrows; the keyword is at h2 or h1, above the body floor, on a plate whose ink is the role's own ink (accentInk on accent).
- The slam starts from at most 2.2 times and never past the safe area (the start scale is capped by the room the slot has); the wobble after it is 6 % and dies in about a third of a second.
- The arrows are drawn only while the window runs: they fade in at 0.1 s, bob on the beat's own clock, and are gone for the last 0.15 s of the window, so at rest nothing is mid-motion. They are triangles of one palette role.
- With `hold: false` the loud plate is drawn only during the window; the rest is the outline. A beat with an entrance of its own is seen arriving, so only the wobble and the arrows play and `mm.warnings` carries a note.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only; no code taken. A keyword chip that slams on the spoken word with three arrows bobbing toward it and a frame that holds past the speech, restated as an emphasis with its own slam, bob and brand-set hold.

## Known limits
- The arrows sit outside the chip's box: the layout must leave their room, and they do not avoid other slots.
- The chip is as wide as its text plus padding: a long phrase wraps inside it.
- `hold` is only the rest look. How long the frame stays on is the beat's `out` (or the scene's end): end the beat after the speech, not with it.
- `from` and `bobs` inside `params.emphasis` are read by the module; `hold`, `tone` and `size` there are not seen by the slot's style.
