# transitions/crossfade

## Purpose
Dissolves from the outgoing scene to the incoming one by opacity alone; with text on both sides it clears the old text before the new text appears.

## Use when / Do not use when
**Narrative position:** related, wind-down, outro. **Mood:** continues.

**Use when**
- two scenes that are one thought, so the viewer feels it continue
- a wind-down, where energy should fall before the end
- the quiet end of a calm film

**Do not use when**
- a topic change: the dissolve says "continues", so use wipe, iris or split to mark the paragraph break
- a climax or any moment that should carry weight

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) |  |  | This pattern takes no params. |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6-1.0, medium 0.4-0.5, high 0.2. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

The policy comes from `ctx.policy` (`style.transitions.policy`): `velocity-matched` keeps the overlap described below, any other policy sequences the fade when both scenes carry text.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)
- `style.transitions.policy` (read through `ctx.policy`): `velocity-matched` overlaps the two scenes, `owns-exit` sequences them

## Legibility and rest notes
Only opacity is written, on whole sections, so a box with a fill fades with its text and no container shows on its own; nothing is left at p = 0 or p = 1. When both scenes carry text and the policy is not `velocity-matched`, the outgoing section is opaque at p = 0 and fully clear by p = 0.45, and the incoming section stays at 0 until p = 0.55 and is opaque at p = 1: the two texts are never visible together, at the price of a short, near-empty gap (about a tenth of the transition). Under `velocity-matched`, or when either scene has no text, the outgoing section is never written to and the incoming one fades over it, so there is no dip and both scenes show mid-way; keep their text out of the same boxes.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- under `velocity-matched` text from the two scenes can still overlap mid-way; keep it out of the same boxes, or choose push
- with text on both sides the dissolve is two fades in turn, so it reads slightly slower than an overlap of the same length
- says "continues" whatever the content, so it softens a topic change it should mark
