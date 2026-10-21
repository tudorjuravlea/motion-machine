# moves/morph

## Purpose
Inside a scene one box becomes another: a box travels from one slot to another and the second slot's content takes its place.

## Use when / Do not use when
**Use when**
- a small thing turns into the big thing: a button into a player, a card into a workspace, a chip into a panel
- the change should read as one object changing shape, not a fade between pictures

**Do not use when**
- the two boxes are in different scenes (use `transitions/shared-element`)
- the camera should move (use a camera move; the morph moves only its box)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | string | (none) | the slot the box starts on |
| `to` | string | (none) | the slot the box becomes |
| `start` | number | 0.6 | seconds into the scene when the morph begins |
| `dur` | number | 1.2 | seconds the morph lasts |

Given as the scene's `move` with `moveParams`.

## Style variables consumed
- `--mm-color-surface` (the box)
- `--mm-color-ink` (the ghost's dashes)
- `--mm-radius-3`
- `--mm-space-1`
- `motion.spring.ui` (left and width), `motion.spring.heavy` (top and height)

## Legibility and rest notes
- Before the morph only `from` shows; after it only `to`, at its own box, and the overlay is gone.
- The box's left and width spring on `ui`, its top and height on `heavy`, so it stretches before it deepens.
- `from` fades out over the first quarter; `to` fades in from 55 %, while the box fades away.
- It sets its slots' opacity, so the kit runs it after the entrances (`afterItems`).

## Provenance
original

## Known limits
- Films only: in a deck the morph's window is in seconds, which a press does not carry.
- The box is a plain surface panel; its content does not travel with it.
