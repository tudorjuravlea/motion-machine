# entrances/pop

## Purpose
Scales an element up from 0.9 to 0.97 of its size to full size on the ui spring, never from zero and never past full size.

## Use when / Do not use when
**Use when**
- a plate, a chip, a card or a figure that should feel placed rather than slid [H-INFO]
- text on a plate or a chip: scale and opacity both stop at rest

**Do not use when**
- for body type that must stay perfectly still while it arrives (the scale still travels from `from` to 1)
- for an element that must start from nothing: a scale entrance never starts at zero [emilkowalski/skills]

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 0.94 | start scale, clamped to 0.9 to 0.97 |
| `origin` | enum(center|auto) | `center` | pivot: the centre, or the text edge for left or right aligned text |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- spring role `ui` (via the module `spring` field, so the kit sets the duration to its settle time); `p` is clamped at 1
- `--mm-travel` is not used: scale does not travel

## Legibility and rest notes
At p = 1 scale is `none` and opacity is removed. Start scale is clamped to 0.9 to 0.97. `p` is clamped at 1, so the ui spring's overshoot is cut off at the first touch of rest and neither scale nor opacity passes it (type never overshoots, bans.md); the kit's `overshoot` report still shows the ui spring's figure, which is below the style's limit.

## Provenance
- emilkowalski/skills, MIT: scale entrances start between 0.9 and 0.97 of full size and fade in; applied as the clamp on `from`. No code taken.

## Known limits
- with `origin: center` a left-aligned text block grows around its middle and its left edge drifts; pass `origin: auto` to pivot on the text edge
- the clamp makes the landing a firm stop rather than a settle; for the softest landing use `rise` or `fade`
