# emphasis/roulette

## Purpose
Runs a highlight box along a row or list of options, slows it down and lands it on the answer, which is the element carrying the emphasis and stays marked for the rest of the scene.

## Use when / Do not use when
**Use when**
- a pick among visible options: which plan, which day, which feature, with the answer already in the list [H-INFO]
- a deck or a film beat that builds a little suspense before the answer is named

**Do not use when**
- on an element with no filled sibling slots: there is nothing to run along, and nothing is drawn
- on an answer that must not change colour at rest: the mark (accent text, accent underline) stays on it after the emphasis

## Params
| name | type | default | meaning |
|---|---|---|---|
| `passes` | number | 1 | whole runs along the row before the run that lands, 0 to 4 |

Give the answer's beat `params.instant: true`, so it arrives as the run starts: the answer's mark is its own CSS, keyed on its `data-emphasis`, so during an entrance before the emphasis it would already show. Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent` (the box's frame, its fill, and the answer's underline), `--mm-accent-text` (the answer's text once it is marked), `--mm-radius-2`, `--mm-space-1` (the frame's stroke, the underline's thickness and offset)
- duration role `hold` (the emphasis duration, from the module `dur`)
- the slowdown is the pattern's own cubic curve on the emphasis's clock; the kit's `move` easing is not applied to the run

## Legibility and rest notes
The box starts on the first option, makes `passes` whole runs and lands on the element itself, with a speed that only falls (a cubic slowdown, so the deceleration is monotone). It hugs each option's text (a Range over the text, padded at the sides), no taller than one line, so in a list of full-width rows it frames the word and not the row, and it never reaches into the neighbouring options. It glides between neighbouring options and fades across the wrap from the last option back to the first instead of sweeping back over the row. From 62 % of the emphasis the box sits exactly on the answer: it flashes once with a stronger fill, holds, then fades by the end. At the landing the answer is marked in accent text with a thick accent underline, and the mark stays through the rest of the scene: it is the slot's own CSS, and the pattern only switches it off (with `--mm-roulette-wait` on the slot) until the box lands. No other option's text, size or colour ever changes.

## Provenance
prompt-motion.com, no licence: ideas only; no code taken. The idea of a highlight sweeping a row of options, slowing over several passes and landing on the answer is restated in our own code with whole passes plus the target's index as the run's length and a cubic slowdown that ends exactly on the target.

## Known limits
- the options are the element's filled sibling slots in document order, so a layout lists them; text inside one slot is not split into options
- the box follows each option's text, so options of very different lengths make it change width as it glides
- the mark keys on the slot's `data-emphasis`: without `instant: true` on the answer it shows during the answer's own entrance, before the run
- no sound is attached; a `sound/tick` cue per option is left to the piece
