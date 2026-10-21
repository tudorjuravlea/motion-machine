# devices/laptop

## Purpose
A generic notebook whose lid opens as the entrance, then rests flat.

## Use when / Do not use when
**Use when**
- product or app demos with a desktop screen
- a calm, product-style opening
- a landscape picture (a 16x9 poster or frame) on a desktop screen: give the beat an `asset`

**Do not use when**
- the lid opening would delay a fast scene (use browser)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `open` | number | 80 | degrees the lid is tipped back at p = 0 (0 to 90) |
| `size` | enum(regular|large) | `regular` | `regular`: as tall as 0.58 of the frame height allows; `large`: 0.74, for a device that is the scene's picture (caption-bar's stage leaves room for it in every format) |
| `asset` | beat field | none | a path under the piece's `assets/`: the picture fills the screen (`<img data-media>`, `object-fit: cover`, clipped by the screen) and the placeholder title and bars give way to it |
| `frame` | string | (empty) | your own device frame image, as written by `mm media frame` (`assets/frames/<n>`, no extension): the device takes the image's proportions, the screen fills its measured hole, and the built-in rim, bezel, buttons and cutout step aside; the shadows stay |
| `model` | enum(notch|chin|plain) | `notch` | the face of the lid: a camera notch with thin even bezels; `chin`, a face with thin side bezels (0.017 of the lid), a deeper top (0.044) holding a small round camera and a chin (0.055); or none |
| `menu` | string | (empty) | a menu bar across the top of the screen: up to 5 comma-separated items; more are dropped |

## Style variables consumed
- `--mm-color-ink`
- `--mm-device-body` (brand `devices.finish`, ink by default)
- `--mm-device-glass`, `--mm-device-rim-light`, `--mm-device-rim-dark`, `--mm-device-spec`, `--mm-device-shade`, `--mm-device-glint` (the glass bezel, the metal rim's bands, the shadows and the glass reflections; each a palette role or a blend of two)
- `--mm-font-text`
- `--mm-size-micro` (the menu)
- `--mm-weight-text`
- `--mm-color-line`
- `--mm-color-muted`
- `--mm-color-surface`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-radius-1`
- `--mm-radius-2`
- `--mm-radius-3`
- `--mm-radius-4`
- `--mm-size-body`
- `--mm-space-3`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- proportions measured from today's devices (slab, bezel, corner and camera sizes as fractions), drawn in our own code; no maker's name or artwork. the finish: a metal rim whose light bands run from the finish toward the lightest and the darkest palette roles, a glass bezel in the darkest role, a lit inner edge, a top highlight and a diagonal reflection on the glass, and a contact shadow, an ambient shadow and a faint glow. Every colour is a palette role or a blend of two (G-LITERAL); a mixed colour is drawn as an image, never as a flat fill.
- A real phone or notebook (a maker's official frame, a licensed render) is your own asset: `mm media frame` puts it in the piece's `assets/frames/`, never in the library (call 3). A piece that names a real device belongs outside the shipped repository (R-BRAND).
- The lid is fully open and flat at p = 1 (`transform: none`).
- The slot's text becomes the screen title (body size, display face); the rest of the screen is drawn from `line` and `accent` bars, no copy.
- Width follows the same rule as browser with an 820 by 520 ratio including the deck.
- With a beat `asset` the screen is the picture: an `<img data-media>` leaf the kit decodes before the first seek and the gate's pixel rules mask; it covers the screen edge to edge (`object-fit: cover`), so a picture of another shape is cropped about its centre. `moves/push-in`, `ken-burns` and `pan` with `moveParams: { "target": "media" }` move it inside the screen while the device stays still.

## Provenance
showcase, MIT, same author: the abstract device specs in `src/core/devices.js` (aspect ratio, bezel and corner proportions, lid angle), redrawn as generic CSS boxes with no trade dress; the entrance motion is original.

## Known limits
- The lid rotation is a CSS perspective effect on one box, not a 3D model; seen edge-on at p = 0 it is a thin line.
- Pictures only (an `<img>`): a recording on the screen is not wired. Text drawn inside a picture is not read by the gate.
- With an asset the beat's text (the screen title) is hidden; a line to read goes in the scene's caption.
- The kit instantiates `pattern.html` into the slot (`fragment: true`) and restores it before every seek; `pattern.js` still builds the same markup on a bare slot.
- The camera notch and the menu sit over the screen and its content; the menu is micro-sized text and may not carry a fact.
