# transitions/blinds

## Purpose
Shows the incoming scene through slats that open together, like venetian blinds.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** cold, mechanical.

**Use when**
- a topic change in a mechanical, rhythmic or data-led piece
- a cut that should read as a deliberate device
- a medium-energy style that likes repetition

**Do not use when**
- a soft or editorial piece
- related scenes, or a scene full of large type that the slats chop

## Params
| name | type | default | meaning |
|---|---|---|---|
| `slats` | number | 8 | how many slats span the frame |
| `axis` | enum(horizontal|vertical) | `horizontal` | horizontal slats open downwards; vertical slats open to the right |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.3-0.5, high 0.25. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-frame-h`, `--mm-frame-w` (the slat period)
- `--mm-color-ink` (an opaque stop only: the mask reads alpha, never colour)
- duration roles (via the module's `dur`)

## Legibility and rest notes
A repeating-gradient mask on the incoming section, written only while 0 < p < 1 and removed at p = 1. At p = 0 every slat has no opening, so the incoming scene is hidden and the outgoing one whole. The slats are exactly the frame length divided by `slats`, so they tile with no remainder in every format.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the slat edges are hard and not feathered
- every slat opens at once; no stagger
- the mask needs Chromium 120 or later (unprefixed mask-image)
