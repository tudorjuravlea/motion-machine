# transitions/shared-element

## Purpose
Carries an element that appears in both scenes from its box in the outgoing scene to its box in the incoming one.

## Use when / Do not use when
**Narrative position:** related. **Mood:** continuity.

**Use when**
- two scenes that share a subject: a headline that becomes a caption, a figure that moves to a corner
- a deck-like flow where one thing stays while the context changes
- a calm or medium piece that wants a through-line

**Do not use when**
- scenes with nothing in common: with no pair it is a plain crossfade
- elements that change meaning, only look: the morph claims they are the same

## Params
| name | type | default | meaning |
|---|---|---|---|
| `fit` | enum(width|stretch) | `width` | width scales both axes by the width ratio so type keeps its shape; stretch fills the target box exactly |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.5, high 0.4. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
FLIP geometry: before writing anything the pattern clears its own transforms on every shared slot and reads both boxes, so the measurement is the state at p = 0 and the result is a function of p alone. Each pair is displaced by the remaining fraction of the journey: the outgoing copy ends in the incoming box, the incoming copy starts in the outgoing box. At p = 1 every transform and the section opacity are removed. The key is `data-shared="key"` in markup; in a story, give both beats `params: { shared: "key" }`, which the kit writes as `data-p-shared`.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.
- Motion Canvas, MIT: the idea of measuring both boxes first and animating the difference (FLIP), tagged [engines: Motion, Motion Canvas] in `references/transitions.md`; no code taken.

## Known limits
- only beat slots can be shared: the kit restores their inline style on every seek, which keeps the pattern pure; a plain element carrying data-shared is ignored
- the incoming slot's own entrance writes after the transition, so give it an entrance that touches opacity only, starting at 0
- two copies are shown, not one element: mid-way the outgoing and incoming text overlap
- boxes are the elements' layout boxes, which for block text are as wide as their container, not as wide as the words
