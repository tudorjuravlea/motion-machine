# moves/explode-layers

## Purpose
Perspective shift: mid-scene the camera tips back and turns a little while the scene's layers part in depth toward one vanishing point, like an exploded drawing of the layout, holds, then folds flat again.

## Use when / Do not use when
**Use when**
- "how it is built" or "what it is made of": a stack, a platform, layers of a product
- a layout whose slots are real layers (`layouts/bento-3` marks its tiles with `data-depth`)

**Do not use when**
- the scene must be read while it moves: mid-move the type is tilted and layers may cross
- in a deck (it writes nothing there) or on a scene with a device or 3D stage

## Params
| name | type | default | meaning |
|---|---|---|---|
| `tilt` | number | 22 | how far the scene tips back at the peak, in degrees, before the style travel multiplier (8 to 35) |
| `gap` | number | 260 | px of depth between the furthest and the nearest layer (80 to 500) |

## Style variables consumed
- `motion.travel` (scales the tilt)

## Legibility and rest notes
- Flat at both ends of the scene: it parts over 15–42 % of the scene, holds, and folds flat over 70–94 %, so the scene's late rest is upright.
- Layers are elements marked `data-depth` (1 = nearest) with unmarked slots nearest; with nothing marked the slots spread from back to front in document order.
- In a deck it writes nothing: every rest faces the viewer.
- The camera shrinks 12 % at the peak so the parted layers stay in frame.

## Provenance
- charlie947/motion-graphics-skills, MIT: layers parting toward one shared vanishing point (effect 13, "perspective shift"); restated as a CSS 3D camera move beside `moves/orbit`. No code taken.

## Known limits
- Writes `transform` on the layers, so an entrance on a layered slot should use individual properties (translate, scale, opacity).
- W-AMBIENT warns on its scene: the move happens during the rest, because it is the scene's subject; that warning is expected.
- Mid-move, near layers can cross over the text of far ones; schedule the scene's reading time after the fold.
