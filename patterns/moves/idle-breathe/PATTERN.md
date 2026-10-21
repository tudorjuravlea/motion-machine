# moves/idle-breathe

## Purpose
An ambient swell so a held scene is alive without being a move.

## Use when / Do not use when
**Use when**
- a hold of two seconds or more with no other motion
- layered under a primary entrance
- under the opening scene's finished hook (`instant` at 0): the first second is not a still card, and frame 0 is still the finished hook (G-HOOK)

**Do not use when**
- the scene already has a primary camera move

## Params
| name | type | default | meaning |
|---|---|---|---|
| `amount` | number | 0.008 | peak scale swing, capped at 0.012 |
| `d` | number | 4 | peak vertical float in px, capped at 6 |
| `cycles` | number | 2 | whole breaths over the scene (1 to 6) |

## Style variables consumed
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- A whole number of cycles, so the camera is at identity at p = 0 and p = 1. Under an opening scene, frame 0 is therefore exactly the finished hook (G-HOOK holds) and the swell moves from the next frame on.
- Capped at 20 % of a 1.06 push-in's travel (scale 0.012, float 6 px), SPEC W-AMBIENT; text scale never swings beyond 1.2 %.
- `travel` is the style's multiplier; the move is scaled by it and clamped.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- Too subtle to count as an arrival for W-PACE; it is not meant to.
