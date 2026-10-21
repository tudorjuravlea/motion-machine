# data/bar-grow

## Purpose
Grows up to six vertical bars from a baseline in turn, each carrying its counting value.

## Use when / Do not use when
Use when:
- comparing a handful of quantities in one unit
- a series where the last bar is the point (`focus` draws it in the accent and the rest muted)
- a press where the viewer reads shape first, numbers second

Do not use when:
- more than six bars (split the story, or use `data/line-draw`)
- values in different units
- precise comparison that needs a shared axis

## Params
The figures come from the `values` param (a comma list), which the kit also writes as `data-p-values`. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| values | string | (empty) | comma list of up to six numbers |
| labels | string | (empty) | comma list of names under the bars |
| max | number | 0 | the value that fills the chart; 0 uses the largest value |
| focus | number | 0 | one-based bar drawn in the accent, the rest muted; 0 draws all in the accent |
| fix | number | 0 | decimal places in the values |
| prefix | string | (empty) | text before each value |
| suffix | string | (empty) | text after each value |
| size | enum(display|h1|h2|body|caption) | body | the style size role of the values |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size` and `--mm-size-body` for secondary text (the caption role is under the 16x9 body floor, G-LEGIBLE)
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding; `--mm-frame-w`, `--mm-frame-h` for the chart box
- `style.motion.stagger.eachS` and `capS`, read in `pattern.js` to stagger the items
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 every bar stands at value / max of the chart height (the largest value fills it unless `max` is set), every count equals its value, and nothing is mid-grow. Bars start in turn by `eachS`, the whole cascade capped at `capS` and every bar done at p = 1, so the last arrival is never late. Heights are percentages, so bar tops keep their radius. p is clamped: no bar passes its fact.

## Provenance
original

## Known limits
- No axis, gridlines or legend, by design; the value rides each bar.
- Six bars at 9x16 are narrow: keep labels short.
- Negative values draw as zero-height bars; use another pattern for a series that crosses zero.
- Stagger runs in the progress domain, so the visible spacing follows the entrance easing.
