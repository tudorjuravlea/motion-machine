# data/line-draw

## Purpose
Draws a polyline from a list of points by p, a dot riding its head, with an optional counting readout above.

## Use when / Do not use when
Use when:
- a trend whose shape is the message: a climb, a dip, a recovery
- one series with no axes (the brief names the unit in the headline)
- a figure that arrives with its history

Do not use when:
- reading exact values off the line (there are no axes, ticks or gridlines)
- two or more series (no legend exists)
- more than about twenty points

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| points | string | (empty) | x,y pairs separated by spaces, or a comma list of y values |
| thick | number | 1.2 | stroke width in viewBox units (the chart is 200 wide) |
| fix | number | 0 | decimal places in the readout |
| prefix | string | (empty) | text before the readout |
| suffix | string | (empty) | text after the readout |
| size | enum(display|h1|h2|body|caption) | h2 | the style size role of the readout |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size`, `--mm-size-caption` and `--mm-size-body` for secondary text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding; `--mm-frame-w`, `--mm-frame-h` for the chart box
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 the whole polyline is drawn and the dot sits on its last point; the stroke is `pathLength` 1 with a dash of p, so it is exact at both ends. Points are fitted into a fixed box with padding, so any scale works; larger y draws higher. When the beat has a `value` it counts above the line and equals the value at rest. p is clamped.

## Provenance
original

## Known limits
- `points` is "x,y x,y" pairs separated by spaces or semicolons, or a bare comma list of y values; a single pair is read as two y values.
- The chart is a fixed 2:1 box up to 70 % of the frame width.
- Fewer than two points draw nothing (the readout still shows).
