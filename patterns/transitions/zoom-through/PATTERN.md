# transitions/zoom-through

## Purpose
Dives the camera through the outgoing scene into the incoming one.

## Use when / Do not use when
**Narrative position:** climax. **Mood:** dramatic.

**Use when**
- the peak of a film: the moment the idea lands
- a jump from the problem into the answer, as if passing through it
- a high or medium energy style that wants forward motion

**Do not use when**
- a calm wind-down, where the dive reads as a jolt
- scenes with dense small type, which the outgoing growth smears

## Params
| name | type | default | meaning |
|---|---|---|---|
| `depth` | number | 0.8 | how far the camera dives: 0.8 grows the outgoing scene to 1.8 times its size |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.6, medium 0.4-0.5, high 0.2-0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- duration roles (via the module's `dur`)

## Legibility and rest notes
Two halves that never share a frame. Before p = 0.5 only the outgoing scene is drawn: it grows to 1 + `depth` and dissolves to nothing by p = 0.5, while the incoming one is hidden. From p = 0.5 only the incoming scene is drawn: it grows from 1 / (1 + `depth` / 2) to rest and fades in, while the outgoing one is hidden. No frame shows two scenes, so no text is ever printed over a scaled ghost. The fading section drops its own canvas fill (the stage behind is the same canvas), so no canvas-on-canvas box composites a level off. Transform, opacity, visibility and background colour are written on the sections only while 0 < p < 1; at p = 1 all are removed. At p = 0 the outgoing scene is at scale 1 and opaque. The incoming scene reaches scale 1 exactly at p = 1, so it never rests scaled.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the outgoing scene is scaled about the frame centre, so it dives toward the middle even if the subject sits elsewhere
- a large `depth` pushes text beyond the frame edge before it fades
- no blur is applied (a blurred glyph is not a legal still); the outgoing growth is hidden by the dissolve alone
- around p = 0.5 a frame or two show the canvas alone (the swap); at a high-energy duration (0.2-0.3 s) that is one frame
