# transitions/sketch-to-ink

## Purpose
Turns a wireframe scene into the finished one: each sketched slot, in the order the pen drew it, has its line straightened onto the matching finished slot, the finished slot comes in under it, and the line lifts away.

## Use when / Do not use when
**Narrative position:** related, climax. **Mood:** becomes.

**Use when**
- the outgoing scene drew its UI with `entrances/sketch` and the incoming scene is the same layout, finished: idea to product, wireframe to screen
- a before and after where the after is the same thing made real

**Do not use when**
- the outgoing scene has no sketched slot: nothing is inked and it is a slow dissolve; use `crossfade`
- the two scenes have different canvas colours: the incoming scene is see-through until the end, so its canvas arrives at p = 1 all at once

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) |  |  | This pattern takes no params. |

Duration role: `hold` (about 1 to 1.8 s across the shipped motion styles): long enough to watch each piece ink. Each piece starts 0.15 of the cut after the one drawn before it (at most 0.45 of the cut spent staggering).

Pairs are found by `data-p-shared` (a beat's `params.shared`), else by slot name; an empty slot is never a partner. Give the incoming beats `params.instant: true`, so they are whole when the cut reveals them.

## Style variables consumed
- duration role `hold` (via the module's `dur`)
- the outgoing slots' own sketch: `--mm-color-ink`, `--mm-space-1`, `motion.boil` (through `entrances/sketch`)

## Legibility and rest notes
At p = 0 the picture is the sketch at rest: the incoming scene is see-through (its canvas, ground, finish and the layout's own decorations wait), and every finished slot is at opacity 0. Pieces are inked in the order the pen drew them (press, then the beat's `at`). For each piece, over its own stretch of the cut: the line straightens and moves onto the finished slot's edge in the first 60 %, the sketch's label and the finished slot hand over between 35 % and 80 %, the line lifts in the last 40 % (`INK` in `runtime/kit/rough.js`). The cut names the finished slot (`--mm-tx-ink-to: scene/slot`) and `entrances/sketch` measures it when it draws, after the camera moves have run, so a push-in on either scene still lands the line on the edge. A slot with the same words in the same place stays under the outgoing one and takes over at p = 1, so the words never move or dip. Anything that changes, moves, or has no partner leaves by 85 % of the cut and what is new arrives after, so two lines are never in one place. A slot's visibility during the cut is `--mm-tx-alpha`, which outranks whatever its entrance writes (an instant blur-fade, a fade). The kit restores every style the cut writes (`--mm-tx-ink`, `--mm-tx-ink-to`, `--mm-tx-alpha` on slots; `--mm-tx-ink`, `--mm-tx-deco` on the incoming section), so at p = 1 nothing of the cut remains.

## Provenance
- danielwh2/drawably, MIT: the per-piece hand-off timed to the pen and the label that changes in the same box, from its `DrawablyForm` film (native form to sketch), run the other way; the straightening (roughness eased to 0 on one seeded stream) is ours. No code taken.

## Known limits
- The incoming scene's canvas, ground and finish wait for p = 1, so both scenes must share them; a layout panel with its own fill that holds slots shows from p = 0.
- Only `entrances/sketch` slots are inked; any other outgoing slot waits, or leaves, as above.
- A sketched cascade (`params.each`) straightens and lifts in place; only a whole slot moves onto its finished box.
- The landing assumes a camera that moves and scales; a move that turns the scene in 3D (orbit) bends the finished box, and the line lands on its screen bounds.
- The incoming beats' own entrances still run during the cut; their opacity is the cut's, but anything else they move (a rise) moves while the cut runs: give them `params.instant: true`.
