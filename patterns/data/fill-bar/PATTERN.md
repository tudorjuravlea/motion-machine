# data/fill-bar

## Purpose
Fills a pill track to value over max, with a counting readout above it.

## Use when / Do not use when
Use when:
- a single share, a progress or a completion figure
- a figure that is a fraction of a known whole
- beside a headline, as the proof of it

Do not use when:
- comparing several quantities (use `data/bar-grow`)
- a value above `max` (it clamps at full and the readout still counts to the value)
- a quantity with no meaningful whole

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| max | number | 100 | the value that fills the track |
| fix | number | 0 | decimal places in the readout |
| prefix | string | (empty) | text before the readout |
| suffix | string | % | text after the readout |
| readout | boolean | true | show the counting figure above the track |
| size | enum(display|h1|h2|body|caption) | h2 | the style size role of the readout |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size`, `--mm-size-caption` and `--mm-size-body` for secondary text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 the fill is exactly value / max of the track and the readout equals the value. The fill is a width, so its pill ends keep their radius while it grows, and p is clamped so the bar never passes the fact. Set `readout` to false only when the headline already states the number.

## Provenance
original

## Known limits
- Horizontal only; the track takes the full width of its slot.
- Track and fill contrast is the brand's `line` against `accent`; W-CONTRAST does not read shapes.
- A value above `max` shows a full bar and the larger number, which is honest but may need a note.
