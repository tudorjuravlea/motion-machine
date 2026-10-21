# moves/hero-drift

## Purpose
A slow hero shot: a shallow 3D drift with a float and a breath of scale, back at rest at both ends.

## Use when / Do not use when
**Use when**
- a product or a stat held for several seconds
- a calm style with few arrivals

**Do not use when**
- text is the point and must stay perfectly flat
- the scene is under two seconds

## Params
| name | type | default | meaning |
|---|---|---|---|
| `tilt` | number | 1.2 | peak tilt in degrees before the style travel multiplier (0 to 3) |
| `d` | number | 12 | peak vertical float in px before the style travel multiplier (0 to 40) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- Identity at p = 0 and at p = 1, so rests at the ends are the authored layout; the peak tilt is 3 degrees at most.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.

## Provenance
showcase, MIT, same author: the float look's amplitudes (rotate 4 and 2 degrees, translate 8 px) and the hero pose idea; scaled down about 3 times and re-expressed as a pure function of p on a DOM camera instead of a WebGL rig.

## Known limits
- A tilt of more than about 2 degrees makes small text shimmer in encoded video.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
