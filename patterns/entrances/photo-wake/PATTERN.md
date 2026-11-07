# entrances/photo-wake

## Purpose
The brand colour wakes a photo up: the picture arrives as a two-colour print in the brand's ink and canvas, and an accent front sweeps across it, leaving the picture's real colours behind.

## Use when / Do not use when
**Use when**
- a photo or illustration opens a scene and should look native to the palette before it shows its own colours
- the scene's story is a change of state (before and after, asleep and awake, plan and result)

**Do not use when**
- the picture must read in its own colours from the first frame (a product colour that matters, a chart)
- `moves/depth-parallax` or another canvas pattern draws on the same picture in the same scene
- the picture is a face seen up close and the scene has no consent for treating it (the print changes how the person looks)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `origin` | enum(left\|right\|top\|bottom\|center\|top-left\|top-right\|bottom-left\|bottom-right) | `left` | where the colour starts |
| `band` | number | 0.12 | width of the accent front as a share of the picture's reveal, 0.04 to 0.3 |
| `warp` | number | 0.35 | how much seeded noise bends the front, 0 (a clean arc) to 1 |

## Style variables consumed
- `--mm-color-ink` and `--mm-color-canvas` (the print: shadows take the darker of the two, lights the lighter, so a dark brand prints a positive too)
- `--mm-color-accent` (the front)
- duration role `hold` (a beat's `params.dur` sets another)

## Legibility and rest notes
- As it arrives (p = 0) every pixel of the picture is a blend of ink and canvas, so the picture passes the brand's pixel test even with no media mask.
- The front travels an arrival field (distance from the origin, warped by seeded noise) equalised by rank, so the revealed area grows by equal steps through the entrance; the colour has fully arrived one band behind the front.
- At p = 1 the canvas is gone and the slot is the plain picture, pixel for pixel.
- The print is drawn in a canvas declared `data-media` over the picture (which is hidden under it); before its beat starts the slot is hidden like any entrance, so give the beat `at: 0` for a scene that opens on the print.
- Pure in p: the picture's pixels, tones and field are computed once per size and seed; a seek before the picture has decoded draws inside `settle()`.

## Provenance
- lemomo-ai/lemo-wake, CC BY-NC 4.0: ideas only; no code taken. A colour or light that travels an arrival field with a decorated front, the field warped by noise and equalised by its quantiles, and a "before" state computed from the picture's own pixels, restated with the before state as a duotone of two brand roles.
- pyang5166/gbro-collage-info, MIT: ideas only; no code taken. Photos shown as a printed, toned image so they sit inside a brand's palette.

## Known limits
- The picture is framed with `object-fit: cover` (as `layouts/media`, the device screens and the bento tiles frame it); another fit would misplace the print.
- Drawn per pixel on the CPU canvas at the frame's size: a large bleed picture costs more per frame than a CSS entrance.
- One front from one origin; it does not follow the picture's content or depth.
