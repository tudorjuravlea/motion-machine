# entrances/drop

## Purpose
Lets an element fall from above and fall on the ui spring and stop at its place, without a bounce.

## Use when / Do not use when
**Use when**
- a label, a badge or a short line that should feel placed by gravity [H-INFO]
- a kinetic style that wants a decisive placement

**Do not use when**
- for an element that should bounce: this drop never overshoots (type never overshoots, bans.md)
- for long text in a style whose `d` fall is large: the line travels far before it rests

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 0.75 | fall height as a multiple of the format base size (`ctx.unit`, SPEC §12), before the style multiplier; capped by the free room above the element |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- spring role `ui` (the module `spring` field sets the duration to its settle time); `p` is clamped at 1
- `--mm-travel` scales the fall height
- `--mm-safe` (through the kit's `room.js`) is the ceiling when nothing sits above the element

## Legibility and rest notes
At p = 1 translate is `none` and opacity is removed. Position only: size and shape do not change. `p` is clamped at 1, so the ui spring's bounce is cut off at the first touch of rest and the element never passes its place (type never overshoots, bans.md); the kit's `overshoot` report still shows the ui spring's figure, which is below the style's limit. The fall is capped by the free room above the element (down from the lowest filled slot or kept element over it, or the safe margin), so a plate never drops through the headline above it. In a tight stack that room is the gap, so the fall is short.

## Provenance
original

## Known limits
- the fall height scales with the format's base size (`ctx.unit`), so it is the same share of the type in every format
- the element starts above its place and may be off the top edge for the first frames
