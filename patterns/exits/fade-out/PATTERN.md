# exits/fade-out

## Purpose
Takes an element out by opacity, over exitRatio of its entrance.

## Use when / Do not use when
**Use when**
- an element leaving mid-scene to make room, or the last scene when the style names a fade outro [SPEC section 15]
- any element whose entrance was a fade

**Do not use when**
- as the end of a film: the final rest holds, it does not fade, unless the style says so [H-LAST]
- where a transition already carries the element away (the transition owns the exit by default)

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) | | | This pattern takes no params. |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `style.motion.exitRatio` (applied by the kit to the entrance duration)
- easing role `exit`

## Legibility and rest notes
At p = 0 nothing is written; the kit hides the element when the exit completes. An exit never staggers.

## Provenance
original

## Known limits
- takes no params from the beat: the kit passes exits their defaults only
