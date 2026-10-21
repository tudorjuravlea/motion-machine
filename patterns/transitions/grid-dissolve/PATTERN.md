# transitions/grid-dissolve

## Purpose
Brings the incoming scene in cell by cell on a grid, each cell on its own seeded schedule.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** tech.

**Use when**
- a topic change in a technical, digital or data piece
- a medium or high energy style that wants texture in the cut
- a pixel-like or dashboard feel

**Do not use when**
- a calm piece: the catalogue does not offer it there
- a warm or editorial register
- large cells over small type, where cells land mid-word

## Params
| name | type | default | meaning |
|---|---|---|---|
| `cols` | number | 8 | cells across; rows follow from the format so cells stay near square |
| `spread` | number | 0.6 | share of the transition over which cells start, 0 to 0.9: higher is more scattered |

Duration role: `standard`. Catalogue bands, in seconds: calm not offered, medium 0.4-0.5, high 0.25-0.4. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-space-0` (a hairline overlap between cells, so no seam shows)
- `--mm-color-ink` (an opaque stop only: the mask reads alpha, never colour)
- duration roles (via the module's `dur`)

## Legibility and rest notes
A mask of one gradient layer per cell on the incoming section, written only while 0 < p < 1 and removed at p = 1. At p = 0 no cell has begun, so the incoming scene is hidden and the outgoing one whole; every cell is complete before p = 1. The order comes from `ctx.random`, which the kit seeds from the scene, so every render shows the same cells in the same order.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- draws as many mask layers as there are cells (about 40 in 16x9, 110 in 9x16), which costs paint time
- the cell order is the draw order of one seeded sequence: a custom `ctx.random` that keeps state between calls would make the transition impure
- the mask needs Chromium 120 or later (unprefixed mask-image)
