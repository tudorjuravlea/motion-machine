# moves/orbit

## Purpose
A gentle turn about the vertical axis that parallaxes the layers, no WebGL.

## Use when / Do not use when
**Use when**
- a layout with distinct tiles or layers such as bento-3
- a depth reveal on a held scene

**Do not use when**
- a layout whose slots use entrances that write `transform` (the per-layer depth is overwritten)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `turn` | number | 5 | peak turn in degrees before the style travel multiplier (0 to 10) |
| `gap` | number | 140 | px of depth between the nearest and the furthest layer (0 to 400) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- The camera is flat at p = 0 and p = 1 (sin of p). Layers are children with `data-depth` (bento-3 tiles carry 0, 0.5, 1); with none marked the slots take depths 1, 0.5, 0.2 in order.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.

## Provenance
showcase, MIT, same author: the orbit look (turn about Y with a smaller X sway); amplitudes cut from 35 and 6 degrees to 5 and 1.5 for a camera on flat layouts, and the layered depth added.

## Known limits
- Writes `transform: translateZ(...)` on the layer slots; an entrance that also writes `transform` (pop, punch, slam) wins over it on that slot, and the parallax is then carried by the camera turn alone.
- Text on turned layers is resampled; keep `turn` small for small type.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
