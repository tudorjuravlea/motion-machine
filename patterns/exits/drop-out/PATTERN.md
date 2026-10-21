# exits/drop-out

## Purpose
Lets an element fall away downward while it fades.

## Use when / Do not use when
**Use when**
- the mirror of `drop`: an element that arrived by falling leaves by falling
- clearing a line so the next one can take its place [H-INFO]

**Do not use when**
- for an element that arrived by rising: use `fade-out`
- at the end of a film (H-LAST)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 96 | fall in px before the style multiplier |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the fall
- `style.motion.exitRatio`
- easing role `exit`

## Legibility and rest notes
At p = 0 nothing is written; the kit hides the element when the exit completes. Opacity falls to 0 over the same span as the fall.

## Provenance
original

## Known limits
- the fall is in px, not scaled by format
- takes no params from the beat: the kit passes exits their defaults only
