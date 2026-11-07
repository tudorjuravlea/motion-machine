# exits/push-out

## Purpose
Slides an element out toward one side while it fades, making room for what follows.

## Use when / Do not use when
**Use when**
- a line replaced by another in the same place [H-INFO]
- a velocity-matched pair with a `rise` with `side: left` entering behind it

**Do not use when**
- where the element is near the safe margin on that side
- at the end of a film (H-LAST)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 120 | travel in px before the style multiplier |
| `side` | enum(left|right|up|down) | `left` | the side it leaves toward |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the distance
- `style.motion.exitRatio`
- easing role `exit`

## Legibility and rest notes
At p = 0 nothing is written; the kit hides the element when the exit completes. The default side is left.

## Provenance
original

## Known limits
- takes no params from the beat, so the side is always left unless the module default is changed
- the distance is in px, not scaled by format
