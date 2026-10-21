# transitions/split

## Purpose
Opens the incoming scene from a seam through the middle of the frame, like doors opening onto it.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** cold, mechanical.

**Use when**
- a topic change in a precise, technical or clinical piece
- a before-and-after, where the seam can mark the divide
- a medium-energy style that likes straight lines

**Do not use when**
- a warm or human piece, where the straight seam feels cold
- related scenes: a split marks a break

## Params
| name | type | default | meaning |
|---|---|---|---|
| `shape` | enum(diagonal|vertical) | `diagonal` | the seam the incoming scene opens along: the frame's diagonal, or a vertical line |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.3-0.5, high 0.25. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
Only `clip-path` on the incoming section, only while 0 < p < 1; at p = 1 it is removed. At p = 0 the opening has no area and the outgoing scene is whole. The diagonal strip is wide enough to cover the frame by p = 1, so nothing stays clipped.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the outgoing scene does not move: it is uncovered, not pulled apart
- the diagonal runs bottom-left to top-right in every format
- the seam edge is hard
