# emphasis/sparks

## Purpose
On the beat's landing, a few short sparks leave the edges of the text and fly out, slowing fast, falling a little and fading.

## Use when / Do not use when
**Use when**
- a hard landing: a slam, a stamp, a figure that hits its mark, where the contact deserves a spark
- the brand has allowed particles (a `particles` block) and the piece has one such moment

**Do not use when**
- the brand has no `particles` block: the pattern draws nothing and the gate fails the story
- as decoration on an opening title, or on every beat: a burst marks one event
- a calm or premium brand whose motion never strikes anything (use `emphasis/indicate`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `count` | number | 18 | sparks in the burst, 1 to 64, never more than the brand's `particles.max` |

## Style variables consumed
- `--mm-color-<role>` for each role in the brand's `particles.roles`
- the brand's `particles` block: `roles`, `max` (40 by default), `area` (0.025 by default)
- duration role `slow`, the emphasis window
- the streak is 0.35 of a spark's size wide and up to 8 sizes long, along its velocity; sizes are 1 % to 1.6 % of the frame's short side
- speeds 0.9 to 1.6 short sides a second from 3.5 % of the short side outside the text's edge, ±20° of its outward normal, drag 4 a second, a little gravity; each spark lives 0.3 to 0.6 s

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
- Sparks leave the box of the text's line boxes, not each glyph's outline.
- A slot inside an ancestor that clips its overflow clips the sparks too.
- The burst never follows a moving slot: it is drawn where the text is at each instant, from where the text was laid out then.
