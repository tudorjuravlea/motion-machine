# data/bubble

## Purpose
Draws one circle whose area is the value beside a small reference circle whose area is a stated unit, so a number reads as "this many of that".

## Use when / Do not use when
Use when:
- a figure whose size is the story: sites, users, tonnes against one familiar unit
- a comparison with one reference, where area (not length) is the honest picture
- a deck press where the reference lands first and the big circle fills

Do not use when:
- more than two circles (this is not a bubble chart)
- ratios above about 600 to 1: the reference would be smaller than a dot (the pattern says so in `mm.warnings`)
- a value that is not a count of the reference

## Params
The figure comes from the beat's `value`; `ref` is the reference in the same units. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| `ref` | number | 1 | the reference unit, in the value's own units: the small circle's area stands for it |
| `refLabel` | string | (empty) | what the reference is, written under the small circle ("one pilot site") |
| `tone` | enum(accent\|ink\|muted) | accent | the palette role of the big circle; the reference is the ink role |
| `fix` | number | 0 | decimal places in the figure |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text before the figure |
| `suffix` | string | (empty) | text after the figure |
| `size` | enum(display\|h1\|h2\|body\|caption) | h1 | the style size role of the figure |

Brand knobs: tone, format, size.

## Style variables consumed
- `--mm-size-<size>` for the figure, `--mm-size-body` for the reference's name
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` for the circles (by `tone`), `--mm-color-line` for the baseline
- `--mm-space-3`; `--mm-frame-w`, `--mm-frame-h`, `--mm-safe` for the box
- duration role `slow` (the module's `dur`); no spring role

## Legibility and rest notes
- At p = 1 the big circle's area over the reference's is value over `ref` (radius goes with the square root; the larger of the two takes the full size, the reference at the right at most two thirds of it) and the figure is the value. The reference lands first; the big circle then grows with its area equal to the share counted so far, so the figure and the picture never disagree.
- A ratio too wide to draw (the smaller circle under a dot) draws it at the smallest size and writes a note to `mm.warnings`; a value of zero or below draws no big circle.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. A bubble whose area is proportional to the value beside a small reference unit, restated in our own SVG with the area-to-radius maths stated.

## Known limits
- Two circles only.
- The reference is drawn at the right and cannot be larger than two thirds of the left's full size.
- Area is hard to read exactly: the figure is always shown beside it.
