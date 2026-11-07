# entrances/assemble

## Purpose
The words are built from dots: seeded dots start scattered on a ring around the slot, travel on spiral arcs into the letterforms, and the real text fades in as they land.

## Use when / Do not use when
**Use when**
- a logo word, a product name or a single figure that should feel assembled from parts
- an opener or a reveal of one short line in a large size

**Do not use when**
- body copy or more than about four words (the dots thin out)
- next to another particle-like move in the same scene; this is one gathering, not a burst (`references/bans.md` bans particle bursts)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `dots` | number | 420 | how many dots build the words, 120 to 900 |
| `color` | enum(ink|accent) | `ink` | the dots' colour |

## Style variables consumed
- the slot's own colour, face, size and tracking (the dots sample the laid-out words)
- `--mm-color-accent` (with `color=accent`)
- duration role `slow` (a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- At p = 1 the slot is its plain text and the canvas is gone.
- Dots land by 78 % of the entrance; the real text fades in over the rest while the dots fade out.
- The canvas is declared media (`data-media`), so the pixel rules mask it. Its text is drawn off screen only as a sampling target (`canvasText: true`); the text that rests is DOM text.
- Every random draw comes from the slot's seed in a fixed order, so the same dots show at every seek.

## Provenance
- charlie947/motion-graphics-skills, MIT: seeded dots on arcs into a sampled shape (effect 16, "particle logo or number"); restated on a 2D canvas with `willReadFrequently`. No code taken.

## Known limits
- Text only: it samples the slot's words, not a picture or an SVG logo.
- Drawn in software on the CPU canvas; a 900-dot slot is slower to export than a CSS entrance.
