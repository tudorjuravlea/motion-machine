# devices/phone

## Purpose
A generic handset that rises into frame with a settling tilt.

## Use when / Do not use when
**Use when**
- showing an app screen or a mobile flow
- a portrait picture (a 9x16 poster, a screenshot) on a handset: give the beat an `asset`
- the `stage` slot of caption-bar

**Do not use when**
- the content is a recording at full size (use screen-zoom)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `tilt` | number | 24 | degrees of turn about the vertical axis at p = 0 (0 to 45) |
| `d` | number | 80 | px the device rises from, before the style travel multiplier |
| `size` | enum(regular|large) | `regular` | `regular`: 0.6 of the frame height; `large`: 0.74, for a device that is the scene's picture (caption-bar's stage leaves room for it in every format) |
| `asset` | beat field | none | a path under the piece's `assets/`: the picture fills the screen (`<img data-media>`, `object-fit: cover`, clipped by the screen) and the placeholder title and bars give way to it; a folder from `mm media prep` or `mm capture site` is drawn by the kit's screen layer and takes `screen` actions |
| `model` | enum(island|punch|notch|plain) | `island` | the cutout at the top of the screen: a floating island with its camera lens (0.2385 of the screen wide, 0.0431 tall, 0.0161 from the top); `punch`, a round camera dot (0.071 wide, 0.0196 from the top) on a slightly wider slab with its keys on the right only; a notch on the edge; or none |
| `frame` | string | (empty) | your own device frame image, as written by `mm media frame` (`assets/frames/<n>`, no extension): the device takes the image's proportions, the screen fills its measured hole, and the built-in rim, bezel, buttons and cutout step aside; the shadows stay |
| `statusTime` | string | `10:00` | the time in the status bar |
| `status` | enum(auto|true|false) | `auto` | the status bar (time, signal, wifi, battery): `auto` shows it on a bare phone only, since a picture or a recording carries its own |

## Style variables consumed
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-device-body` (brand `devices.finish`, ink by default)
- `--mm-device-glass`, `--mm-device-rim-light`, `--mm-device-rim-dark`, `--mm-device-spec`, `--mm-device-shade`, `--mm-device-glint` (the glass bezel, the metal rim's bands, the shadows and the glass reflections; each a palette role or a blend of two)
- `--mm-device-island`
- `--mm-color-line`
- `--mm-color-surface`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-radius-4`
- `--mm-size-body`
- `--mm-size-micro` (the status bar time)
- `--mm-font-text`
- `--mm-space-1`
- `--mm-space-2`
- `--mm-space-3`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- proportions measured from today's devices (slab, bezel, corner and camera sizes as fractions), drawn in our own code; no maker's name or artwork. the finish: a metal rim whose light bands run from the finish toward the lightest and the darkest palette roles, a glass bezel in the darkest role, a lit inner edge, a top highlight and a diagonal reflection on the glass, and a contact shadow, an ambient shadow and a faint glow. Every colour is a palette role or a blend of two (G-LITERAL); a mixed colour is drawn as an image, never as a flat fill.
- A real phone or notebook (a maker's official frame, a licensed render) is your own asset: `mm media frame` puts it in the piece's `assets/frames/`, never in the library (call 3). A piece that names a real device belongs outside the shipped repository (R-BRAND).
- Upright and flat at p = 1 (`transform: none`); opacity reaches 1 by p = 0.5 and never overshoots.
- The slot's text becomes the screen title (body size, display face); the rest of the screen is drawn from `line` and `accent` bars, no copy.
- Height is 0.6 of the frame height, width follows a 300 by 650 ratio.
- With a beat `asset` the screen is the picture: an `<img data-media>` leaf the kit decodes before the first seek and the gate's pixel rules mask; it covers the screen edge to edge (`object-fit: cover`), so a picture of another shape is cropped about its centre. `moves/push-in`, `ken-burns` and `pan` with `moveParams: { "target": "media" }` move it inside the screen while the device stays still.

## Provenance
showcase, MIT, same author: the abstract device specs in `src/core/devices.js` (aspect ratio, bezel and corner proportions, lid angle), redrawn as generic CSS boxes with no trade dress; the entrance motion is original.

## Known limits
- Needs a host slot that is wide and tall enough for 0.6 of the frame height; in a small slot it overflows.
- The kit instantiates `pattern.html` into the slot (`fragment: true`) and restores it before every seek; `pattern.js` still builds the same markup if it is ever called on a bare slot.
- A recording plays through a prepared folder (`mm media prep`), never a `<video>`. Text drawn inside a picture or a recording is not read by the gate.
- With an asset the beat's text (the screen title) is hidden; a line to read goes in the scene's caption.
- The proportions (screen corner radius 0.12 of its width, a 2.2 % bezel, the island and notch sizes) approximate current hardware forms; they are not any maker's drawings.
- With `status: true` over a picture, the bar is drawn in the brand's ink over whatever the screen shows and can be faint.
