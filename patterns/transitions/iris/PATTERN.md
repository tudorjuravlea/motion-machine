# transitions/iris

## Purpose
Opens the incoming scene from the centre of the frame through a growing circle or diamond.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** focus.

**Use when**
- a topic change that should draw the eye to the middle of the new scene
- a style with a round or a geometric accent
- a medium-energy piece that needs a clear paragraph break

**Do not use when**
- related scenes: an aperture says "look here, new"
- a new scene whose subject sits at the edge, where the aperture reveals it last

## Params
| name | type | default | meaning |
|---|---|---|---|
| `shape` | enum(circle|diamond) | `circle` | the aperture: a circle or a diamond (a square turned 45 degrees) |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6-0.8, medium 0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
Only `clip-path` on the incoming section, only while 0 < p < 1; at p = 1 it is removed. At p = 0 the aperture has no area, so the outgoing scene is whole. The aperture reaches the frame corners before p = 1, so nothing is clipped at the end. The diamond reads the frame's aspect from `ctx.format`.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.
- Remotion core and `remotion-dev/skills`, company licence and unlicensed skills: the name and the idea of the effect (tagged [Remotion] in `references/transitions.md`); no code taken.

## Known limits
- the aperture is always centred
- the clip edge is hard: no feather, no ring
- the diamond's corners meet the frame corners late in the transition
