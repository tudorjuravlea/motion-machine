# emphasis/marker-circle

## Purpose
A ring is drawn around the element by hand, a little more than one turn with a wobble, holds while the eye lands, then lifts away.

## Use when / Do not use when
**Use when**
- an explainer moment: "this one", a key number, the word the voice-over stresses
- a short line or a figure, where a ring reads as a marker on paper

**Do not use when**
- a long line that fills the frame width: the ring would leave the safe area
- more than one ring in a scene: the eye has one place to go

## Params
| name | type | default | meaning |
|---|---|---|---|
| `color` | enum(accent|ink) | `accent` | the marker colour |
| `pad` | number | 0.18 | how far the ring clears the element, in its heights, 0.08 to 0.4 |

## Style variables consumed
- `--mm-color-accent` (or `--mm-color-ink` with `color=ink`)
- `--mm-space-1` (the stroke width)
- easing role `move` (the drawing stroke)
- duration role `slow`

## Legibility and rest notes
- At p = 0 and p = 1 the pattern writes nothing: the ring is gone and the slot is plain.
- The ring is drawn over the first 45 %, holds to 85 %, then fades; it never covers the text, only circles it.
- The ring follows the laid-out text (the union of its line boxes), not the slot's column; its wobble is seeded from the slot, so every seek draws the same ring.

## Provenance
- charlie947/motion-graphics-skills, MIT: the hand-drawn marker ring of its explainer skill; restated as a seeded wobbling ellipse traced by stroke dash. No code taken.

## Known limits
- No label: the ring marks only. Put a label in the next beat.
- On a slot that wraps to several lines the ring circles all of them together.
