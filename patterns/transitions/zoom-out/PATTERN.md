# transitions/zoom-out

## Purpose
Pulls the camera back: the outgoing scene recedes and the incoming one settles from larger than the frame.

## Use when / Do not use when
**Narrative position:** topic change, climax. **Mood:** weight.

**Use when**
- a reveal of scale: stepping back to show the whole
- a topic change that should feel heavy, not quick
- the move into a summary after a run of detail

**Do not use when**
- quick related scenes, where the recession feels like a delay
- a start of film: there is nothing yet to step back from

## Params
| name | type | default | meaning |
|---|---|---|---|
| `depth` | number | 0.6 | how far the camera pulls back: 0.6 settles the incoming scene from 1.6 times its size |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.4-0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-space-3` (the outgoing blur, times `depth`)
- duration roles (via the module's `dur`)

## Legibility and rest notes
Transform, opacity and filter are written on both sections only while 0 < p < 1; at p = 1 all are removed. At p = 0 the outgoing scene is at scale 1, unblurred and opaque, and the incoming one is invisible. The incoming scene reaches scale 1 exactly at p = 1.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the incoming scene starts larger than the frame, so its edges are not seen until it settles
- scaled about the frame centre only
- the blur is not scaled by format
