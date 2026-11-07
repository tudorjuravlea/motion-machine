# moves/pull-back

## Purpose
The camera starts close and settles to the full frame, revealing context after a detail.

## Use when / Do not use when
**Use when**
- after a close detail, to show where it sits
- a scene that should end at the clean authored layout

**Do not use when**
- you want to end close (use push-in)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 1.06 | start scale before the style travel multiplier and the safe-margin cap (1.02 to 1.5) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
- `--mm-safe`
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- Rests exactly at identity at p = 1 (`transform: none`): the last frame is the layout as authored, with its safe margin intact.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- The start scale is capped like push-in's, so p = 0 also keeps every slot inside the safe margin; a large `from` is cut back on a full layout.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
