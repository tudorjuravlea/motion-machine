# devices/demo-frame

## Purpose
Puts a recording on the brand's ground with no device around it: a rounded plane of the recording's own shape, padded, with a soft three-layer shadow, that leans when the camera zooms.

## Use when / Do not use when
**Use when**
- a product demo is a screen recording or a captured page that should look like a product shot, not a phone or a laptop
- the recording is a session with a pointer track and the camera is `screen/zoom-to` in mode `auto` (set its `tilt` and this frame leans with each zoom)
- the same demo has to hold in 9x16, 1x1 and 16x9: padding, mask and shadow are fractions of the frame

**Do not use when**
- the viewer should see a device (use `devices/phone`, `devices/laptop` or `devices/browser`)
- the recording is to be read full frame (use `devices/screen-zoom`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `padding` | number | 0.5 | the share of the frame left round the recording: 0 fills it, 1 leaves 0.6 of it (0 to 1) |
| `radius` | number | 0.03 | the corner of the mask, as a share of the recording's short side (0 to 0.2) |
| `shadow` | number | 0.7 | the shadow's strength: three layers (down 12, 4 and 2 page px, blur 48, 16 and 8, opacity 0.7, 0.5 and 0.3, each times the strength) that grow together (0 to 1) |
| `shadowRole` | enum(canvas\|ink\|muted\|surface\|line\|accent\|accentInk) | `ink` | the palette role the shadow is a tint of |
| `ratio` | string | `auto` | the shape of the recording, "w:h" or a number; `auto` reads it from the asset (a recording's size, a captured page's viewport, a picture's size) |
| `from` | number | 0.94 | scale at p = 0 (0.9 to 1) |
| `d` | number | 40 | px the frame rises from, before the style travel multiplier |
| `asset` | beat field | none | a recording or captured page (a folder with `media.json`) or a picture under the piece's `assets/` |

Brand knobs: padding, radius, shadow, shadowRole, ratio, from.

## Style variables consumed
- `--mm-color-surface`
- `--mm-color-ink`
- `--mm-frame-w`
- `--mm-frame-h`

(and the role `shadowRole` names, as a tint of it, never mixed with another)

## Legibility and rest notes
- At p = 1 the frame is flat and in place: no transform on the device; only a zoom that asks for a tilt (`screen/zoom-to` with `tilt`) leans the plane, and it is flat again when the zoom has gone.
- The plane is the largest rectangle of the recording's shape inside the frame once the padding is taken (padding 0.5 leaves 0.8 of each side), so at every format it takes the same share of the frame.
- A leaning plane is scaled so its projected corners stay inside the rectangle it started in; the shadow follows the silhouette that is drawn.
- Captions in `caption-bar` keep their own row; the frame fills what the layout's stage leaves.

## Provenance
siddharthvaddem/openscreen, MIT: the padding law (1 minus 0.4 of the padding), the three-layer drop shadow, the three tilt presets and the perspective at 2.6 times the short side (`runtime/kit/demoframe.js`, see NOTICE); the shadow's colour is a palette role, not black, and the markup and the entrance are original.

## Known limits
- The tilt is a CSS 3D transform: it leans this frame, not a `3d/` device, and a 3D device ignores `tilt`.
- A recording much wider than the frame is shown small; give it a `padding` of 0 to fill the width.
- The shadow is a CSS `drop-shadow` filter: it costs a little at 1x1 and 16x9 renders of long scenes.
