# data/stat-tile

## Purpose
Shows one figure on a surface card with a label and a delta chip, the figure counting and the label and delta settling in after it.

## Use when / Do not use when
Use when:
- a headline metric with its context (what it measures, how it changed)
- a bento cell or a dashboard-style plate, one tile per figure
- a figure whose change matters as much as its size

Do not use when:
- a six-tile dashboard in one scene (H-ONE: one idea per press)
- a figure with no label (use `data/counter`)
- a delta that cannot be sourced to a fact

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| label | string | (empty) | what the figure measures; empty uses the slot text |
| delta | string | (empty) | the change, written as given, such as "+12%"; empty omits the chip |
| from | number | 0 | the figure counted up from |
| fix | number | 0 | decimal places shown |
| pad | number | 0 | minimum integer digits, zero-filled |
| prefix | string | (empty) | text before the figure |
| suffix | string | (empty) | text after the figure |
| size | enum(display|h1|h2|body|caption) | display | the style size role of the figure |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size` and `--mm-size-body` for secondary text (the caption role is under the 16x9 body floor, G-LEGIBLE)
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-surface`, `--mm-color-accentInk`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 the figure equals the value, the label and delta are fully visible, and nothing moves. The label is the `label` param, else the slot's own text; the delta is shown as given, never computed. Label and delta fade in over p 0.2 to 0.6 and 0.55 to 0.95, so the tile is complete at p = 1. A delta that starts with a minus sign takes the quiet chip; any other is drawn in the accent.

## Provenance
original

## Known limits
- The delta is text only, with no arrow glyph, so it works in every bundled face.
- The tile is as wide as its content; place it in a layout slot that gives it room.
- Colour carries no meaning on its own: the sign is in the text.
