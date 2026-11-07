# transitions/push

## Purpose
Slides the incoming scene in while it pushes the outgoing one out of the frame; both scenes travel.

## Use when / Do not use when
**Narrative position:** related. **Mood:** editorial progress.

**Use when**
- the next step of the same story: the eye follows the motion from one to the other
- a sequence of cards or chapters in an editorial piece
- a deck-like film where direction means "forward"

**Do not use when**
- a topic change that wants a break, not a continuation
- scenes whose edges clash with the direction of travel

## Params
| name | type | default | meaning |
|---|---|---|---|
| `direction` | enum(left|right|up|down) | `left` | where the content travels: left carries the outgoing scene off to the left and brings the next in from the right |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.3-0.5, high 0.2. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)
- `--mm-travel` is not read: a push shorter than one frame would leave a seam

## Legibility and rest notes
Only `transform` is written, on both sections, and only while 0 < p < 1; at p = 1 both are removed. At p = 0 the outgoing scene sits where it was and the incoming one is one frame away, clipped by the stage. The travel is one full frame in percent of the section, so it is exact in every format.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the travel is a full frame whatever `--mm-travel` says
- the incoming scene's own arrivals run while it slides, so give its first beat a start after the transition
- one axis only; no diagonal push
