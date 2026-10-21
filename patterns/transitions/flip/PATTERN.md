# transitions/flip

## Purpose
Turns the frame on its axis: the outgoing scene swings edge-on and the incoming one swings out to rest.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** playful.

**Use when**
- a topic change in a playful, product or card-based piece
- a before-and-after, the two faces of one thing
- a medium-energy piece that can afford a longer turn

**Do not use when**
- a serious or premium register
- a very short transition, where the turn becomes a flicker
- scenes whose content must stay legible throughout

## Params
| name | type | default | meaning |
|---|---|---|---|
| `perspective` | number | 2 | camera distance in frame widths: smaller is more dramatic, 4 is nearly flat |
| `axis` | enum(y|x) | `y` | y turns about the vertical axis like a page, x about the horizontal like a departures board |

Duration role: `slow`. Catalogue bands, in seconds: calm 0.7-1.0, medium 0.6, high 0.4. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-frame-w` (the perspective distance, times `perspective`)
- duration roles (via the module's `dur`)

## Legibility and rest notes
Transform and visibility are written on the sections only while 0 < p < 1; at p = 1 both are removed. The perspective is inside the transform, so no parent needs one. At p = 0 the outgoing scene is unrotated and whole; the incoming scene is hidden until the turn passes edge-on at p = 0.5 and ends at zero rotation.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the sections have no thickness: at the half-way point the frame is empty for a frame or two
- rotateX on a tall 9x16 frame is very deep: raise `perspective`
- content with its own 3D transform inside a scene is flattened by the section transform
