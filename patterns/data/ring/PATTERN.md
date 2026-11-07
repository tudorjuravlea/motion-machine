# data/ring

## Purpose
Draws a circular progress stroke by p, with a counting readout in its centre.

## Use when / Do not use when
Use when:
- one completion or share figure, where a closed loop says "whole"
- a square or tall frame, where a horizontal bar would sit small
- a figure that benefits from a centred readout

Do not use when:
- more than one quantity (no concentric or segmented rings; segments are a pie by another name)
- a value that is not a part of a whole
- a figure that needs a unit label larger than the readout

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| max | number | 100 | the value that closes the ring |
| fix | number | 0 | decimal places in the readout |
| prefix | string | (empty) | text before the readout |
| suffix | string | % | text after the readout |
| thick | number | 8 | stroke width in viewBox units (the ring is 100 wide) |
| size | enum(display|h1|h2|body|caption) | h2 | the style size role of the readout; the ring is seven times it |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size`, `--mm-size-caption` and `--mm-size-body` for secondary text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 the stroke covers exactly value / max of the circle, starting at twelve o'clock and running clockwise, and the readout equals the value. The stroke is `stroke-dasharray` from p; a zero-length arc is hidden rather than drawn as a dot; p is clamped. The ring is seven times the readout's size role wide, so `size` sets both.

## Provenance
original

## Known limits
- The readout shares the ring's font size: a long prefix or suffix may crowd the circle.
- No gradient, no end cap marker.
- The SVG is rebuilt on every seek; it is cheap, but a story with dozens of rings at once would not be.
