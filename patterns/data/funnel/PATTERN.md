# data/funnel

## Purpose
Shows up to five stages as centred bars narrowing down the frame, each with its name and counting value.

## Use when / Do not use when
Use when:
- a sequence of stages where each is a subset of the last (visit, signup, activate, pay)
- a story whose point is the drop between two stages
- a deck press that walks the funnel top to bottom

Do not use when:
- stages that are not nested
- more than five stages
- conversion percentages (the story should carry them as facts in a headline, not computed here)

## Params
The figures come from the `values` param (a comma list), which the kit also writes as `data-p-values`. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| values | string | (empty) | comma list of up to five numbers, widest first |
| labels | string | (empty) | comma list of stage names |
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
At p = 1 every bar width is its value over the first stage's, every count equals its value, and nothing is mid-motion. Stages enter top to bottom by `eachS` capped at `capS`, all done at p = 1. p is clamped.

## Provenance
original

## Known limits
- Stretch pattern: no connectors between stages and no percentage labels.
- Values should descend; an ascending value draws a wider bar than the stage above, which reads as an error.
- Names are plain text, not truncated: keep them short at 9x16.
