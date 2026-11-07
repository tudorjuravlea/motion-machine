# transitions/color-dip

## Purpose
Takes the outgoing scene down into a flat colour and brings the incoming one up out of it.

## Use when / Do not use when
**Narrative position:** outro, topic change. **Mood:** closure.

**Use when**
- an outro or the end of a chapter, a full stop before the next idea
- a topic change that should reset the eye
- dipping to ink for a heavier close, or to canvas for a clean one

**Do not use when**
- related scenes: the dip separates what should join
- a fast sequence, where two dips in a row read as flicker

## Params
| name | type | default | meaning |
|---|---|---|---|
| `veil` | enum(canvas|ink) | `canvas` | the colour role the scene dips into |
| `hold` | number | 0.2 | share of the transition spent fully covered, 0 to 0.8 |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6-1.0, medium 0.4, high 0.2. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-color-canvas`, `--mm-color-ink` (the veil, chosen by `veil`)
- duration roles (via the module's `dur`)
- set by this pattern on a section's inline style, not read from the style: `--mm-tx-dip-o`, `--mm-tx-dip-color`

## Legibility and rest notes
The veil is drawn by a pseudo-element that exists only while pattern.js has written `--mm-tx-dip-o` on a section's inline style; the kit restores that style on every seek, so at any rest the rule matches nothing and no veil remains. At p = 0 the veil has no opacity and the outgoing scene is whole; at p = 1 the incoming scene has no veil and no hidden state. The scene that is not veiled is hidden only in the first half.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the veil is flat: it is not a fade through the style's accent, and `veil` takes only canvas or ink
- the dip covers everything in the frame, including a persistent logo or caption bar
