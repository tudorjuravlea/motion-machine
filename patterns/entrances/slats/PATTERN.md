# entrances/slats

## Purpose
The element shows through slats that open one after another, each widening from its leading edge until they meet: a picture or a line revealed like blinds turning in sequence.

## Use when / Do not use when
**Use when**
- a picture arriving (a `layouts/media` image, a bento tile's asset): the stagger reads as a reveal
- a large headline that should arrive with a graphic, editorial cut

**Do not use when**
- body copy: letters cut by slats are hard to read mid-entrance
- next to `transitions/blinds` in the same moment: one slatted move at a time

## Params
| name | type | default | meaning |
|---|---|---|---|
| `slats` | number | 6 | how many slats cross the element, 3 to 12 |
| `axis` | enum(vertical|horizontal) | `vertical` | vertical slats open left to right; horizontal ones top to bottom |

## Style variables consumed
- duration role `standard`
- easing role `enter` (applied by the kit to the entrance progress)

## Legibility and rest notes
- At p = 1 the pattern writes nothing: no mask remains, the element is whole.
- The mask reads alpha only, so it never tints the element.
- Each slat starts 0.4 / (n − 1) of the entrance after the one before; the last slat finishes exactly at p = 1.

## Provenance
- charlie947/motion-graphics-skills, MIT: the slatted image reveal (effect 12, "image reveal"), as an entrance beside the existing `transitions/blinds`; restated with an alpha mask. No code taken.

## Known limits
- It writes the element's `mask-image`, so on an element that has its own mask (a `layouts/paper-cards` card's torn edge) the own mask is replaced while the slats open and comes back at p = 1. Use another entrance there.
- The slats are equal divisions of the element's own box, not of the frame, so two elements side by side do not line up their slats.
- A spring-driven entrance that overshoots past p = 1 is clamped (masks cannot open beyond whole).
