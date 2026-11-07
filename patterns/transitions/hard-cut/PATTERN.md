# transitions/hard-cut

## Purpose
Replaces the outgoing scene with the incoming one in a single frame.

## Use when / Do not use when
**Narrative position:** climax, also opening. **Mood:** disruption.

**Use when**
- an opening, where the first image must land at once
- a climax that should arrive with weight and no softening
- beats locked to a hit in the sound bed

**Do not use when**
- between two related scenes, where it breaks the thread the viewer is following
- as the only cut in a calm piece: a film of nothing but hard cuts has no grammar

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) |  |  | This pattern takes no params. |

Duration: 0 s, always. The module declares `dur: 0`, so the kit schedules no overlap.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- nothing: a hard cut writes no style

## Legibility and rest notes
A hard cut takes 0 s, so the kit never calls at() mid-way and neither section is ever written to. The incoming scene is at rest as soon as it begins; its first arrival should still wait the style's floor after the cut.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- nothing to tune: if the cut feels abrupt, the answer is another transition, not a parameter
- takes no time, so a film made only of hard cuts is as long as the sum of its scenes and no shorter
