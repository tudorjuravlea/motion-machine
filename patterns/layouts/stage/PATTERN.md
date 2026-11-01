# layouts/stage

## Purpose
The whole frame is one stage for a device or a picture, edge to edge, with no text.

## Use when / Do not use when
**Use when**
- a 3D device carries the scene with a `shot`, whose close-ups and screen-filling ending must reach the frame's edges (`mm showcase` writes this)
- a device film whose words live in other scenes

**Do not use when**
- the scene has a caption or a headline (use `layouts/caption-bar` or `layouts/media`)
- a flat device should keep the safe margin (use `layouts/caption-bar`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `stage` | slot (device or picture) | none | the whole frame: a beat with a device pattern (`3d/phone`, `3d/tablet`, `3d/laptop`, `3d/browser`) or a picture. It takes no text |
| `data-format` | html attribute | set by the kit | The slot is the frame in every format. |

## Style variables consumed
- `--mm-size-body`

## Legibility and rest notes
- The slot fills the frame (inset 0) and centres what it holds. It carries no text, so nothing here can cross the safe margin; a device's own chrome (a status bar, a menu bar) is drawn into its screen as media.
- The canvas, the picture and the device are media to the gate, so the pixel rules mask them.

## Provenance
original

## Known limits
- No text slot: a scene that needs words pairs this with a scene in another layout, or uses `layouts/caption-bar`.
- A flat device in this slot sits at the frame's centre at its own size; the full frame helps only the 3D devices' shots.
