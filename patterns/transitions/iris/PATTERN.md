# transitions/iris

## Purpose
Opens the incoming scene through a growing circle or diamond, from the centre of the frame or from a slot of the new scene.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** focus.

**Use when**
- a topic change that should draw the eye to the middle of the new scene
- a style with a round or a geometric accent
- a medium-energy piece that needs a clear paragraph break
- with `target`: a new scene that should open from its subject (a mark, a product, a call to action)

**Do not use when**
- related scenes: an aperture says "look here, new"
- a new scene whose subject sits at the edge, where a centred aperture reveals it last (name it as `target` instead)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `shape` | enum(circle|diamond) | `circle` | the aperture: a circle or a diamond (a square turned 45 degrees) |
| `target` | string | `""` | a slot of the incoming scene to open from (the centre of its box); empty opens from the frame centre |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6-0.8, medium 0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`: the defaults under the scene's `cutParams` (`"cutParams": { "target": "headline" }`).

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
Only `clip-path` on the incoming section, only while 0 < p < 1; at p = 1 it is removed. At p = 0 the aperture has no area, so the outgoing scene is whole. The aperture reaches the frame corners before p = 1, so nothing is clipped at the end. The diamond reads the frame's aspect from `ctx.format`. With `target`, the centre is the slot's layout box (read before its entrance moves it) and the aperture grows to the farthest frame corner from there, so it still reaches every corner by p = 1; a target that is missing or has no box opens from the centre, exactly as without one. A target that names no slot of the incoming scene (a misspelling) is also a note in `mm.warnings`, once.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.
- Remotion core and `remotion-dev/skills`, company licence and unlicensed skills: the name and the idea of the effect (tagged [Remotion] in `references/transitions.md`); no code taken.
- JohnHeibel/ClaudeAnimationBase, MIT: the idea of an iris aimed at an element rather than the frame centre (ideas only; no code taken).

## Known limits
- `target` reads one slot of the incoming scene; an element of the outgoing scene cannot be the origin
- no mark- or silhouette-shaped aperture, and no closing iris
- the clip edge is hard: no feather, no ring
- the diamond's corners meet the frame corners late in the transition
