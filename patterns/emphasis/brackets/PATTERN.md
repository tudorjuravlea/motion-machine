# emphasis/brackets

## Purpose
Four corner brackets snap in around the words from slightly outside, the element lifts a little toward the viewer, holds, and everything settles back.

## Use when / Do not use when
**Use when**
- a "look here" on a figure or a short label, the way a viewfinder frames a subject
- a product or data piece where a ring would feel too hand-made

**Do not use when**
- a line that fills the frame width: the brackets would cross the safe margin
- several framed elements in one scene

## Params
| name | type | default | meaning |
|---|---|---|---|
| `lift` | number | 0.04 | how much the element grows while framed, 0 to 0.08 |

## Style variables consumed
- `--mm-color-accent` (the brackets)
- `--mm-space-1` (the stroke width)
- easing role `move` (the snap and the lift)
- duration role `slow`

## Legibility and rest notes
- At p = 0 and p = 1 the pattern writes nothing: no brackets, no scale.
- The brackets frame the laid-out text (the union of its line boxes), never the slot's whole column.
- Phases run on the beat's own clock: snap over 22 %, lift 22–45 %, hold, open away from 80 %.

## Provenance
- charlie947/motion-graphics-skills, MIT: corner brackets that snap first, then the tile lifts (effect 06, "dashboard zoom"); restated as an emphasis on any element. No code taken.

## Known limits
- The lift is a scale, so the element grows about its centre rather than toward a camera.
- Works on text; on a picture slot the brackets frame the slot box only if it has text.
