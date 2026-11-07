# ui/skeleton

## Purpose
Shows a list loading: the chrome is real from the first frame, each bar stands exactly where its word will be, and the rows resolve top to bottom with nothing moving.

## Use when / Do not use when
Use when:
- the story is speed, or a list arriving
- a short opening before the list's content matters

Do not use when:
- more than five rows are needed; the shot should stay close
- the content, not the loading, is the point (use `layouts/list-reveal`)

## Params
The rows are the `rows` param, else the beat's `text`.

| name | type | default | meaning |
|---|---|---|---|
| title | string | (empty) | the list's name, real from the first frame |
| rows | string | (empty) | the rows, separated by \|, five at most; empty uses the slot text |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/skeleton"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 every row is resolved and nothing moves. A bar is the width of its word because it sits in the word's own cell, so no row shifts as it resolves.

## Provenance
Stageshow, MIT: the idea of a skeleton at the content's own geometry resolving top to bottom, restated as a pure function of time. No code or art taken.

## Known limits
- Rows are one line each; a long row is cut by the panel, so keep them to a few words.
- The right-hand bars stay filler at the rest.
