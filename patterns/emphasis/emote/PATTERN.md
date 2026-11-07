# emphasis/emote

## Purpose
Pops a small hand-drawn reaction beside the words (an exclamation, a question, a heart, a sparkle, an ellipsis, a sleepy zzz, a music note or two drops of sweat), holds it while it shivers, and lets it go.

## Use when / Do not use when
**Use when**
- a feeling should land on a line: a heart by a testimonial, an exclamation by a surprising figure, a sparkle by a launch name, sweat by a pain point
- a hand-drawn or explainer look, next to `entrances/sketch`, `text/handwrite` or a drawn mascot
- one beat in a scene wants a wink without moving the words

**Do not use when**
- the look is strict corporate or editorial: a doodle reads as play
- several in one scene: one reaction per scene keeps its meaning (one gag, the rest plain)
- the words fill the safe area edge to edge: with no place free the mark is left out (with a warning)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `mark` | enum(exclaim|question|heart|sparkle|dots|zzz|note|drops) | `exclaim` | the reaction: a surprise, a question, a like, a launch, a pause, boredom, a tune, a nervous moment |
| `side` | enum(right|left|top) | `right` | where it sits against the words: above their right or left end, or centred above them; another side is taken when this one has no room |
| `size` | number | 0.75 | the mark's height in units of the format (`ctx.unit`), 0.25 to 1 |
| `color` | enum(ink|accent) | `accent` | the role of the strokes and dots, each over a soft halo of that role; a heart, a sparkle or a drop is washed in the accent |

Duration role: `slow`. The mark pops over the first 22 % of the window with a back-out of about 10 % overshoot, holds, and fades over the last 25 %. With the shipped `slow` of 1 s that is a 0.22 s pop and a 0.25 s fade.

## Style variables consumed
- `--mm-color-accent` or `--mm-color-ink` (strokes and dots at full opacity, and their halo at an alpha of the same role, by `color`)
- `--mm-color-accent` (the wash in a heart, a sparkle or a drop: two layers at 0.8 and 0.6, so it reads as the accent itself)
- `--mm-space-1` (the pen's width; the halo is three pens wide)
- `motion.boil` through `ctx.boil()`: the shiver while it holds; a deck is always still
- duration role `slow`

## Legibility and rest notes
- At p = 0 and p = 1 the pattern writes nothing: the slot is exactly as laid out, so the scene's rest has no mark.
- The mark is strokes and fills in an SVG, never text: it adds no type layer and G-LEGIBLE does not apply.
- It reads bright: every stroke and dot is the role at full opacity over a halo of the same role (the same path three pens wide at 0.28 opacity), so the mark carries a soft glow without any colour outside the palette.
- It sits outside the box of the slot's laid-out lines (or beside the end of one of them), a quarter of its height away, and inside `--mm-safe`, with room kept for its ink (the halo included) and for the pop's overshoot, which grows away from the words (from the mark's corner nearest them). It keeps clear of every line of text in its scene, not only its own slot's. Placement reads layout offsets (`runtime/kit/room.js`), so a camera move does not move it. When its place is taken it slides along the side, then takes the next side (right, left, top, bottom); when no place is free it draws nothing rather than cross any words, and says so in `mm.warnings`.
- Every colour is a palette role, a wash at an alpha of the accent over the ground, so G-BRAND holds.
- The strokes are seeded from the slot and shiver on the kit's boil clock (the same frame for every stroke at a given time), so every seek draws the same frame; in a deck the mark holds frame 0.

## Provenance
- feitangyuan/doodle-anim, MIT: ideas only (drawn reaction marks that pop with a small overshoot beside a character and fade, drawn rather than typed); no code taken. The marks, the placement and the timing are our own; the heart is the classic heart curve.

## Known limits
- One mark per beat; for two reactions use two beats.
- The mark is sized in `ctx.unit`, not by the words, so beside very large display type it can still read small; raise `size` to 1.
- At three quarters of a unit it needs more free room beside the words than before: in a crowded scene it moves to another side or is left out (with a warning) sooner; a smaller `size` makes room.
- It frames the slot's own lines; a slot whose words sit in a nested slot is measured whole.
