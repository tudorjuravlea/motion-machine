# transitions/impact

## Purpose
Lands the next scene as a hit: a zoom punch, a decaying shake and a radial colour fringe that peak at the cut and settle before it ends.

## Use when / Do not use when
**Narrative position:** climax, or any beat that should land with weight. **Mood:** forceful.

**Use when**
- a drop, a reveal or a number the film has been building to
- a kinetic or high-energy style, on a beat of its soundtrack
- a hard cut that wants a body, not a slide or a dissolve

**Do not use when**
- a calm wind-down, or scenes the film wants to feel gentle
- a run of cuts: it is the loudest cut here, so use it once or twice a film
- scenes of dense small type, which a shake smears for a few frames (turn `shake` down)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `strength` | number | 0.6 | how hard the hit lands, 0 to 1: scales the zoom punch (12 % of the scene at 1), the shake and the fringe together |
| `shake` | number | 0.6 | the decaying shake as a share of its full size (1.5 % of the short side at strength 1), 0 for none |
| `fringe` | number | 0.6 | the radial colour fringe at the cut as a share of its full size (1.2 % of the short side apart at the frame's edge at strength 1), 0 for none |
| `hit` | number | 0.3 | where in the cut the hit lands, as a share of its length, 0.15 to 0.6 |
| `outer` | enum(accent|ink|muted|surface|line|accentInk) | `accent` | the palette role of the fringe pulled toward the frame's rim |
| `inner` | enum(accent|ink|muted|surface|line|accentInk) | `muted` | the palette role of the fringe pulled toward the middle |

Brand knobs: strength, shake, fringe, hit, outer, inner

Duration role: `standard`. Catalogue bands, in seconds: calm 0.5, medium 0.3-0.4, high 0.2-0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own. A style that wants the hit heavier sets `style.patterns["transitions/impact"]`; a scene gives its own through `cutParams`.

## Style variables consumed
- duration roles (via the module's `dur`) and the `enter` easing (the punch settles on it)
- `--mm-color-canvas` (what counts as bare ground) and the two roles `outer` and `inner` name (the fringe's colours)

## Legibility and rest notes
Only one scene is drawn in any frame, so no type is ever exposed twice: before the hit the outgoing scene builds (a push-in of half the punch and a fringe rising to its peak); from the hit the incoming scene is drawn, punched in and shaking, and the outgoing one is hidden. The punch is eased out on the `enter` role, the shake and the fringe fall under a squared decay, so all three are zero at p = 1 and the incoming scene rests at scale 1, unmoved, unfiltered. The shake never moves the scene by more than the zoom margin it has at that instant, so the frame's edge is never exposed. The fringe is a filter on the one visible scene (two ghosts of everything on the canvas, pulled toward and away from the rim by a radial displacement ramp and laid in two palette roles over bare canvas: nothing at the middle of the frame, most at its edge); it is written only while 0 < p < 1 and its svg node is marked `data-mm-overlay`, so a seek that jumps away leaves nothing behind. The shake is seeded from the scene's id: the same cut shakes the same way in every render.

## Provenance
- pireel/pireel, 0xsline/OpenChatCut, AGPL-3.0: the idea of an impact cut (a noise shake, a zoom punch and a radial chromatic fringe peaking at the cut); no code, names or constants taken. The shake follows `moves/shake`.

## Known limits
- the fringe is an edge of role colour beside each shape, not a split of the picture's own colour planes: it reads as a print off register more than as a lens, and it is the palette's colours whatever the brand
- a scene with a 3D device keeps its depth, but the filter flattens it for the frames the fringe is on
- under a long cut (a calm style's standard role) the build-up and the settle both lengthen; the hit stays at its share of the cut
- the shake is two sines per axis, so it never judders along a diagonal, but it is smooth: it is not a handheld jitter
