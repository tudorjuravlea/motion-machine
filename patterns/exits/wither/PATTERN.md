# exits/wither

## Purpose
A garden grown by `text/garden` recedes in reverse growth order to the bare type, which then fades or stays whole until the slot leaves.

## Use when / Do not use when
**Use when**
- a `text/garden` headline leaves mid-scene, or the film turns a page: the ornament goes the way it came
- the headline should stand alone for a beat before the next line takes over (`type: keep` with an `out` at the scene's cut)

**Do not use when**
- the slot has no garden: it then only fades, which `exits/fade-out` does with less code
- the exit is very short: below about 0.8 s the blossoms close too fast to read as withering

## Params
| name | type | default | meaning |
|---|---|---|---|
| `type` | enum(fade|keep) | `fade` | after the garden has gone, fade the bare type over the last 20 % of the exit, or keep it whole until the kit removes the slot |

A beat's scalar params reach the exit too, so the garden's own params (`kind`, `seed`, …) need no repeating; give the exit its own bag (`params.exit: { "type": "keep" }`) to set `type` alone.

## Style variables consumed
- the colour roles of `text/garden` (its layers are redrawn, not restyled)
- `style.motion.exitRatio` (applied by the kit: the exit takes that share of the entrance)
- easing role `exit` (applied by the kit to the exit's progress)

## Legibility and rest notes
- The type never moves: the garden recedes around it. With `type: keep` the last frame of the exit is pixel for pixel the bare slot; with `type: fade` the bare slot shows once the garden has gone (75 % of the exit), then the type's opacity falls to nothing.
- Last grown, first gone: blossoms and leaves close on an ease without overshoot before their stems undraw from tip to root; no part ever comes back during the exit. Every kind withers this way: leaflets, berries, moss dots and tufts close like leaves, roots and blades undraw like stems, and kelp waves again as it shrinks. A botanical bed recedes the same way: its loose petals fly back into their blooms, then the blooms close ring by ring and the stems sink back below the frame; the exit reads the piece's time, so a petal that floats at rest leaves its floating path without a jump.
- An exit never staggers and has no rest of its own; the kit hides the slot when it completes.

## Provenance
- Type Garden, no licence, ideas only; no code taken: the garden withering in reverse order of its growth. The reverse schedule, the closing ease and the bare-type handover are our own.

## Known limits
- Reads the garden's plan from `text/garden` in the same seek; another entrance's ornament is not withered, only faded.
- A garden with `sway: breathe` is withered from its still pose, so the ornament settles at the exit's first frame.
