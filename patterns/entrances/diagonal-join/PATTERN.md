# entrances/diagonal-join

## Purpose
Brings a title in as two halves, cut along a diagonal, that slide toward each other along the cut and join.

## Use when / Do not use when
**Use when**
- a title card or a chapter opener in a bold graphic style, where the type is the set [H-ONE]
- a large display headline of one or two lines

**Do not use when**
- on body text or a long paragraph: the cut runs through the middle of the whole block
- on a slot that paints its own box (a plate): only the text is split, the box stays whole
- on a slot whose words carry their own markup that must keep its identity while it runs: the copy repeats it

## Params
| name | type | default | meaning |
|---|---|---|---|
| `angle` | number | 30 | the cut's rise in degrees from the horizontal, 0 to 75 |
| `gap` | number | 1.2 | how far each half starts from home along the cut, in multiples of ctx.unit, capped by the room |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the gap
- duration role `slow`
- easing role `enter` (or the beat's spring; a type layer is clamped at 1), with a smoothstep on the slide

## Legibility and rest notes
The cut runs through the middle of the text's ink. The half above the cut starts toward the cut's upper end and the half below toward its lower end; both fade in over the first third and slide home along the cut, so they never overlap. Each half's slide is capped by the room its own ink has (its part of the ink box, measured from the layout through `runtime/kit/room.js`), so the type stays inside the safe area on every frame, and a title flush with the margin still slides. Nothing is ever rotated or scaled. At p = 1 the pattern writes nothing: one title, exactly as laid out.

## Provenance
lemomo-ai/lemo-opuscar, MIT: ideas only; no code taken. The idea of a title clipped into two half-planes along a diagonal that sit apart along the line and close is restated in our own code with the cut through the text's ink and each half's travel bounded by its own room in the safe area.

## Known limits
- while it runs the slot holds its content in a block span plus an aria-hidden copy; a slot laid out as a flex row of several children is not supported
- the cut is straight; there is no torn or scissor edge
- a gap capped to 0 (a half with no room at all) leaves that half fading in place
