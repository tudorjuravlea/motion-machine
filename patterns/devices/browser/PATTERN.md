# devices/browser

## Purpose
A generic browser window with a toolbar that settles in with a small scale and lift.

## Use when / Do not use when
**Use when**
- web products, dashboards or any landscape screen
- a site screenshot on its window: give the beat an `asset`
- the `stage` slot of caption-bar

**Do not use when**
- the viewer should read the page contents (use screen-zoom)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 0.94 | scale at p = 0 (0.9 to 1) |
| `d` | number | 40 | px the window rises from, before the style travel multiplier |
| `size` | enum(regular|large) | `regular` | `regular`: as tall as 0.58 of the frame height allows; `large`: 0.74, for a device that is the scene's picture (caption-bar's stage leaves room for it in every format) |
| `asset` | beat field | none | a path under the piece's `assets/`: the picture fills the screen (`<img data-media>`, `object-fit: cover`, clipped by the screen) and the placeholder title and bars give way to it |

## Style variables consumed
- `--mm-color-ink`
- `--mm-color-line`
- `--mm-color-muted`
- `--mm-color-surface`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-radius-2`
- `--mm-radius-4`
- `--mm-size-body`
- `--mm-space-2`
- `--mm-space-3`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- Upright and flat at p = 1; opacity reaches 1 by p = 0.5.
- The slot's text becomes the screen title (body size, display face); the rest of the screen is drawn from `line` and `accent` bars, no copy.
- Width is the smaller of 0.7 of the frame width and the width that makes it 0.58 of the frame height tall.
- With a beat `asset` the screen is the picture: an `<img data-media>` leaf the kit decodes before the first seek and the gate's pixel rules mask; it covers the screen edge to edge (`object-fit: cover`), so a picture of another shape is cropped about its centre. `moves/push-in`, `ken-burns` and `pan` with `moveParams: { "target": "media" }` move it inside the screen while the device stays still.

## Provenance
showcase, MIT, same author: the abstract device specs in `src/core/devices.js` (aspect ratio, bezel and corner proportions, lid angle), redrawn as generic CSS boxes with no trade dress; the entrance motion is original.

## Known limits
- Pictures only (an `<img>`): a recording on the screen is not wired. Text drawn inside a picture is not read by the gate.
- With an asset the beat's text (the page title) is hidden; a line to read goes in the scene's caption.
- The kit instantiates `pattern.html` into the slot (`fragment: true`) and restores it before every seek; `pattern.js` still builds the same markup on a bare slot.
- The toolbar dots and address pill are decoration drawn from the style colours; there is no tab strip.
