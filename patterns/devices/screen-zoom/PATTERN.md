# devices/screen-zoom

## Purpose
A framed screen whose content scales until the screen alone fills the frame.

## Use when / Do not use when
**Use when**
- going from a device shot into its content
- the last act of a product walk-through

**Do not use when**
- the screen content is not meant to be read large

## Params
| name | type | default | meaning |
|---|---|---|---|


## Style variables consumed
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-color-line`
- `--mm-color-surface`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-radius-1`
- `--mm-radius-2`
- `--mm-radius-4`
- `--mm-safe`
- `--mm-size-body`
- `--mm-space-2`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- At p = 1 the screen fills the safe box (contain-fit, never past `--mm-safe`); the bezel has faded out over the last third, so the final rest is a clean full-frame screen.
- The slot's text becomes the screen title (body size, display face); the rest of the screen is drawn from `line` and `accent` bars, no copy. The title scales with the screen, so it is larger than body size at rest, never smaller.
- Reads `--mm-safe` and the stage size from layout, not from boxes the zoom has moved.

## Provenance
showcase, MIT, same author: the frame proportions, taken through devices/browser (abstract device specs redrawn as a generic CSS box with no trade dress); the zoom is original.

## Known limits
- The screen is a placeholder; a recording needs `asset` passed to the slot (not yet wired).
- Because the zoom is a scale, the screen's own corners and bars scale with it.
- Needs the layout to be inside `.mm-stage` (the kit guarantees it).
