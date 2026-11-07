# devices/screen-zoom

## Purpose
A framed screen that comes closer, bezel and all, until the whole device fills the frame.

## Use when / Do not use when
**Use when**
- the viewer should take a closer look at a device's screen, the device staying whole
- the last act of a product walk-through

**Do not use when**
- the screen content is not meant to be read large
- the picture on the screen should fill the frame without its device (Motion Machine never zooms a picture inside its device)

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
- At p = 1 the whole device fills the safe box (contain-fit, never past `--mm-safe`), bezel and all: the screen is never shown without its device and its picture is never magnified on its own.
- The slot's text becomes the screen title (body size, display face); the rest of the screen is drawn from `line` and `accent` bars, no copy. The title grows with the device, so it is larger than body size at rest, never smaller.
- Reads `--mm-safe` and the stage size from layout, not from boxes the zoom has moved.

## Provenance
showcase, MIT, same author: the frame proportions, taken through devices/browser (abstract device specs redrawn as a generic CSS box with no trade dress); the zoom is original.

## Known limits
- The screen is a placeholder; a recording needs `asset` passed to the slot (not yet wired).
- Because the move is a scale, the device's corners and bars grow with it.
- In a tall frame the device already nearly fills the width at rest, so it comes only a little closer.
- Needs the layout to be inside `.mm-stage` (the kit guarantees it).
