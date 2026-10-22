# entrances/card-flip

## Purpose
Brings a slot in as a blank card that turns over about its vertical axis to show its content.

## Use when / Do not use when
**Use when**
- cards, tiles or list rows that each reveal an answer, a strength or a verdict in turn, with each card's own beat time [H-INFO]
- a paper or collage style; `steps: 6` gives the turn a hand-animated cadence

**Do not use when**
- on a full-width headline in a narrow format: the perspective flattens to keep the near edge inside the safe area, so the turn reads as a squash
- on a slot whose box is much larger than its text: the cover is the slot's whole box

## Params
| name | type | default | meaning |
|---|---|---|---|
| `steps` | number | 0 | stops the turn makes, 0 for a smooth turn; 6 gives a hand-animated cadence |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent` (the cover, a card back) and `--mm-color-accentInk` (its keyline and ruled pattern, blended into the accent), `--mm-radius-2`, `--mm-space-1`; the accent stands off the canvas on every shipped brand, light or dark
- duration role `standard`
- easing role `enter` (or the beat's spring; a type layer is clamped at 1, so the turn never passes 180 degrees)

## Legibility and rest notes
The turn runs from 0 to 180 degrees and is exactly 180 at p = 1, smooth or stepped. It is drawn in two halves, so no face is ever mirrored: while the turn is under 90 degrees the cover is drawn turning away and the slot's text is not painted; from 90 degrees the slot itself is drawn turning in from edge-on (from -90 to 0 degrees). The drawn rotation therefore never passes a quarter turn. The perspective is chosen from the room the layout leaves (`runtime/kit/room.js`), so the near edge never carries the type past the safe area. At p = 1 the pattern writes nothing: the slot is unrotated, uncovered and exactly as laid out.

## Provenance
pyang5166/gbro-collage-info, MIT: ideas only; no code taken. The idea of each card turning over on its own beat to show its answer, optionally in a stepped cadence, is restated in our own code as a two-half turn that never draws a mirrored face.

## Known limits
- the cover is a card back in the accent role; a slot that paints its own box shows the cover's radius and keyline while it turns, not its own
- under an `enter` easing that starts fast (calm, kinetic) the first quarter turn, while the cover shows, is brief; `steps` or a slower duration gives the cover more time
- the turn is about the vertical axis only
- the perspective comes from the layout's room: a card pressed against the safe margin turns flat, without depth
