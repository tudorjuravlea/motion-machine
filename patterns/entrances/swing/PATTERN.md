# entrances/swing

## Purpose
Hangs an object from a pivot and lets it swing in and settle, damped to a still hang.

## Use when / Do not use when
**Use when**
- a price tag, a sign or a badge on a cord (`layouts/object-card` with `variant: tag`)
- an object that should feel physical, with weight, rather than slide in

**Do not use when**
- type that has to be read while it arrives: the object rotates, so any text on it does too until it settles (a swing of a few degrees is readable; keep `angle` small on long text)
- a block that fills the frame: the swing would carry its corners past the safe area

## Params
| name | type | default | meaning |
|---|---|---|---|
| `pivot` | enum(top\|left\|right\|bottom\|center) | top | the point it hangs from: the middle of that edge of the element (its own box, so a cord inside the box is part of the swing) |
| `angle` | number | 16 | degrees: how far it is swung out when it arrives, before the style multiplier |
| `swings` | number | 1.5 | how many full swings it makes before it hangs still (0.5 to 4) |

Brand knobs: pivot, angle, swings.

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the angle
- the pattern module's `dur` (1.6 s, in seconds; a beat's `params.dur` wins); no spring role

## Legibility and rest notes
The angle is `angle * (1 - q)^2 * cos(2 pi * swings * q)` over the entrance's own time, so it is exactly zero at the end: at p = 1 `rotate` is `none` and opacity is removed, and a deck rest shows the object hanging level. Opacity rises over the first sixth of the entrance. The envelope falls with the square of the time left, so the last swing is under a degree for the default angle.

## Provenance
original

## Known limits
- One pivot per object; a chain of two (a tag on a cord on a hook) is not modelled.
- The rotation is about the element's own box: an element wider than the room beside it can swing past the safe area at the start.
- Rotated type is only on screen while it swings, never at a rest (bans: no rotated type at rest).
