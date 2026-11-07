# transitions/shared-element

## Purpose
Carries an element that appears in both scenes from its box in the outgoing scene to its box in the incoming one, keeping what is inside it true to its shape.

## Use when / Do not use when
**Narrative position:** related. **Mood:** continuity.

**Use when**
- two scenes that share a subject: a headline that becomes a caption, a figure that moves to a corner, a card that grows into a panel
- a deck-like flow where one thing stays while the context changes
- a calm or medium piece that wants a through-line

**Do not use when**
- scenes with nothing in common: with no pair it is a plain crossfade
- elements that change meaning, only look: the morph claims they are the same

## Params
| name | type | default | meaning |
|---|---|---|---|
| `fit` | enum(width\|stretch\|box) | `width` | width scales both axes by the width ratio so type keeps its shape; stretch fills the target box exactly; box fills it exactly unless the proportions differ by more than 0.2, then `mismatch` decides |
| `mismatch` | enum(crop\|position) | `crop` | with fit box and proportions that differ by more than 0.2: crop is a window changing shape over evenly scaled content, position moves the copies without scaling |
| `arc` | number | 0 | how far the travel bows, as a share of the distance (0 is straight; 0.5 is a graceful arc), on the same side of the screen whichever way it goes |
| `side` | enum(auto\|cw\|ccw) | `auto` | which way an arc bows: the same side of the screen (auto), or clockwise or counter-clockwise from the direction of travel |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.5, high 0.4. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`: the pattern's defaults, then the brand's (`style.patterns["transitions/shared-element"]`), then the scene's `cutParams`.

Brand knobs: fit, mismatch, arc, side.

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
Before writing anything the pattern clears its own writes on every shared slot and reads both boxes, so the measurement is the state at p = 0 and the result is a function of p alone. Each copy is moved by a translate and a scale about its centre: the outgoing copy ends in the incoming box, the incoming copy starts in the outgoing box, so at every instant the two cover the same box. What a scale would distort is corrected: with a scale that differs across and down (`stretch`, or `box`) the slot's children are scaled back by the inverse, so a logo or a line of type keeps its shape; the corner radius on the page is the one box's mixed into the other's, so it stays the same size; the box shadow keeps its offsets and blur on the page. The scenes cross-fade in windows that never dip: the incoming scene rises over the first half with a circular ease-out, the outgoing falls over 0.5 to 0.95. With `fit: box` and proportions that differ by more than 0.2 the pair is cropped (a window changing shape over evenly scaled content, the radius on the window) or moved without scaling. At p = 1 every write and the sections' opacity are removed. The key is `data-shared="key"` in markup; in a story, give both beats `params: { shared: "key" }`, which the kit writes as `data-p-shared`.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.
- motiondivision/motion, MIT: the idea of measuring both boxes first and animating the difference, with the children, the corner radius and the shadow corrected for the scale, a cross-fade in two windows, a 0.2 tolerance on the aspect ratio and an arc of travel; no code taken.
- motion-canvas/motion-canvas, MIT: the idea of measuring both boxes first and animating the difference (FLIP), tagged [engines: Motion, Motion Canvas] in `references/transitions.md`; no code taken.

## Known limits
- only beat slots can be shared: the kit restores their inline style on every seek, which keeps the pattern pure; a plain element carrying data-shared is ignored
- the pattern owns `transform`, `transform-origin`, `border-radius`, `box-shadow` and `clip-path` on a shared slot while it runs
- children are scaled back only when they are elements: text written straight into the slot is scaled with it (use `fit: width` for a headline, which scales evenly)
- a picture that fills its card (a tile's `<img>`) is scaled back with the other children, so under `stretch` or `box` it does not fill the card mid-move; give such a card `fit: width`
- a radius that is a percentage is left to follow the box; the first corner's radius is taken for all four
- two copies are shown, not one element: mid-way the outgoing and incoming text overlap
- boxes are the elements' layout boxes, which for block text are as wide as their container, not as wide as the words
- the incoming slot's own entrance writes after the transition, so give it an entrance that touches opacity only, starting at 0
