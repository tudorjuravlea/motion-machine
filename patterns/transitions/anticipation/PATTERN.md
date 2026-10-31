# transitions/anticipation

## Purpose
Winds up before the cut: a brief pull back, then the push that carries the film through to the next scene.

## Use when / Do not use when
**Narrative position:** climax, or the turn from a setup to its answer. **Mood:** building, then released.

**Use when**
- a cut the film has been leaning toward: the question answered, the product shown
- a style with room in its slow role (the wind-up needs a few frames to read)
- a brand that wants the move to feel physical: it gives ground before it goes

**Do not use when**
- a fast, high-energy style where the slow role is under a quarter of a second: the wind-up becomes a flicker
- a run of cuts: the wind-up announces the cut, so a second one in a row is a repeat
- scenes of dense small type under `zoom`, which the dive smears

## Params
| name | type | default | meaning |
|---|---|---|---|
| `mode` | enum(zoom|slide) | `zoom` | the push: zoom dives through the outgoing scene into the incoming one; slide carries both scenes edge to edge |
| `direction` | enum(left|right|up|down) | `left` | slide only: where the content travels, left carries the outgoing scene off to the left (and the wind-up pulls it right) |
| `pull` | number | 0.06 | how far the wind-up gives ground, as a share of the scene: zoom shrinks it by that much, slide moves it that share of the frame; 0 to 0.15 |
| `depth` | number | 0.6 | zoom only: how far the camera dives: 0.6 grows the outgoing scene to 1.6 times its size |
| `windup` | number | 0.25 | the share of the cut the wind-up takes, 0.1 to 0.5 |

Brand knobs: mode, direction, pull, depth, windup

Duration role: `slow`. Catalogue bands, in seconds: calm 1.0, medium 0.6, high 0.4-0.6. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own. The wind-up is a share of that duration, so a faster style winds up faster.

## Style variables consumed
- duration roles (via the module's `dur`) and the `enter` and `exit` easings (the wind-up settles on `enter`, the dive accelerates on `exit`, the slide travels on `move`)

## Legibility and rest notes
`zoom`: two halves that never share a frame, as in `transitions/zoom-through`. Before the middle of the push only the outgoing scene is drawn (it shrinks by `pull` over the wind-up, then grows to 1 + `depth` while it dissolves to nothing); from the middle only the incoming one (it grows from small to rest and fades in). The fading section drops its own canvas fill while it fades. `slide`: both scenes are drawn, edge to edge and never overlapping, the incoming one right behind the outgoing one; the wind-up moves them together against their way by `pull` of the frame, then both travel and the incoming scene stops at 0. Transform, opacity, visibility and background colour are written on the sections only while 0 < p < 1; at p = 1 all are removed. At p = 0 the outgoing scene is at scale 1 and in place; the incoming scene reaches scale 1, at 0, exactly at p = 1, so it never rests moved or scaled.

## Provenance
- pireel/pireel, 0xsline/OpenChatCut, AGPL-3.0: the idea of an anticipation zoom (a small wind-up before the push); no code, names or constants taken. `zoom` shares its two-halves rule with `transitions/zoom-through`, and `slide` its edge-to-edge travel with `transitions/push`.

## Known limits
- `zoom`: around the swap a frame or two show the canvas alone (the rule that no frame holds two scenes); at the slow role that is a few frames, so a very long cut shows a visible gap
- `slide`: the wind-up opens a strip of bare canvas on the leading edge for a few frames, `pull` of the frame wide
- the zoom is about the frame's centre, so it dives toward the middle even if the subject sits elsewhere
- a large `depth` pushes type beyond the frame before it fades
