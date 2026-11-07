# ui/status

## Purpose
Shows one status changing on one pill and the list around it responding: a spinner ticks on the top row's pill, the label changes in place and a new row pushes in above it.

## Use when / Do not use when
Use when:
- the story is a state change (checking to passed, pending to shipped) and what it sets off
- a real recording would be slow, private or not yet possible

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- the list is longer than four rows; cut the rows first

## Params
The rows are the `rows` param, else the beat's `text`. The first row carries the pill.

| name | type | default | meaning |
|---|---|---|---|
| title | string | (empty) | the list's heading |
| from | string | (empty) | the first state, one word |
| to | string | (empty) | the final state, one word |
| rows | string | (empty) | the rows, separated by \|, the first carries the pill, four at most; empty uses the slot text |
| added | string | (empty) | the new row that pushes in at the top |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/status"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 the new row sits on top, the old rows below it and the pill reads the final state beside a ticked disc; nothing moves, not even the arc, so the rest works as the poster and under reduced motion. The state is in the words, never in colour alone. Every row is laid out at its final place from the first frame; the pill's slot is as wide as the longer label, so the label never rewraps and the row text never shifts.

## Provenance
Stageshow, MIT: the story shape only (one status changes, the list around it responds), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 6.73 s; the arc keeps ticking through the hold until the change.
- Before the new row arrives, one row of blank space waits at the foot of the list, so nothing reflows.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
- Labels are one word each; a long label widens the pill and narrows the row text.
