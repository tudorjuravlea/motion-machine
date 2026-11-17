# emphasis/confetti

## Purpose
On a milestone's landing, chips in the brand's particle roles burst up from the top of the text, turn and flutter, and fall away.

## Use when / Do not use when
**Use when**
- a celebration the story has earned: a launch, a record, a goal reached, once in a piece
- the brand has allowed particles (a `particles` block)

**Do not use when**
- the brand has no `particles` block: the pattern draws nothing and the gate fails the story
- a serious message (a loss, an apology, a price rise): confetti mocks it
- more than once a piece, or behind a title as decoration

## Params
| name | type | default | meaning |
|---|---|---|---|
| `count` | number | 32 | chips in the burst, 1 to 64, never more than the brand's `particles.max` |

## Style variables consumed
- `--mm-color-<role>` for each role in the brand's `particles.roles`
- the brand's `particles` block: `roles`, `max` (40 by default), `area` (0.025 by default)
- duration role `hold`, the emphasis window
- a chip is a card of the size by 0.55 of it, 1.2 % to 2 % of the frame's short side, turning at up to 9 radians a second and fluttering as its height swings with its turn
- the chips leave the top of the text at 0.7 to 1.3 short sides a second, ±40° of straight up, with drag 2.2 a second and gravity 0.9 short sides a second squared; each lives 1 to 1.5 s, all inside the `hold` window

## Legibility and rest notes
- Opt-in: nothing is drawn unless the style's brand has a `particles` block (`roles`, `max`, `area`); a story that names this pattern without one fails G-PATTERN-REF. The `particle-burst` ban, the decoration burst behind a title, stays in force: this is a burst on a landing, not ambience.
- It fires on the beat's event: the emphasis starts as the entrance lands, so the burst is the landing's. Give the beat `params.instant: true` (or a slam entrance) so the landing is the arrival.
- Palette roles only: each particle takes one of the brand's `particles.roles`, picked by seed; every pixel is a role, the ground, or a blend of the two (G-BRAND).
- A budget: at most `particles.max` particles (and never more than 64), and the first particles in index order whose peak areas add up to `particles.area` of the frame at most; the rest are never drawn, so none appears mid-flight.
- Never over type: a particle fades to nothing within 2 % of the frame's short side of any line of text in the scene, measured where the scene lays it out at that instant, its own word included.
- Reduced motion: no burst; the kit skips an emphasis, which is movement.
- One sound: the pattern makes none. The event's one cue is the beat's own `cue`; never a run of sounds per particle.
- Every particle dies before 95 % of the window, so at p = 1 nothing is written and a rest holds no particle. Pure in the window's seconds: each particle is a hash of (seed, index, attribute), so any instant draws the same frame in any seek order.

## Provenance
- Alchemist0823/three.quarks, MIT (Copyright 2019 Forrest Sun): the burst recipe (life, speed and size ranges, drag and gravity, streaks along the velocity). No code taken: its engine steps a simulation each frame, ours is a closed form of the window's seconds.

## Known limits
- Chips that fall back across the text fade out beside it, so the burst thins over the words by design.
- A slot inside an ancestor that clips its overflow clips the chips too.
- The burst never follows a moving slot: it is drawn where the text is at each instant, from where the text was laid out then.
