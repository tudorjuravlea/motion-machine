# moves/along-path

## Purpose
A slot rides a path at constant speed, turning to face the way it goes, with an optional line or comet drawn behind it; or the camera dives towards the point.

## Use when / Do not use when
**Use when**
- a cursor, a callout, a device or a marker should travel a route the story draws: a journey on a map, a flow across a diagram, a pointer to the next thing
- a trail should show where the point has been, or a comet should chase it
- the camera should lean in towards a point moving through the frame and come back

**Do not use when**
- the thing only changes place between two boxes (use `moves/morph` or `transitions/shared-element`)
- the camera should move on its own (use a camera move)
- the route must follow the layout's own boxes: the path is laid into the frame, not into the slots

## Params
| name | type | default | meaning |
|---|---|---|---|
| `path` | string | (none) | path data, in its own coordinates; it is laid evenly into the frame inside the margin |
| `target` | string | (none) | the slot to carry along the path, or `camera` to dive the camera towards the point |
| `start` | number | 0.6 | seconds into the scene when the carry begins |
| `dur` | number | 1.8 | seconds the carry lasts |
| `pathStart` | number | 0 | where on the path it begins, as a share of its length (after `pathEnd` runs it backwards) |
| `pathEnd` | number | 1 | where on the path it ends, as a share of its length |
| `turn` | enum(follow\|off) | `follow` | follow turns the carried slot to face the way it goes; off keeps it upright |
| `turnOffset` | number | 0 | degrees added to the heading (the slot's own forward is not always right) |
| `soften` | number | 0.03 | a share of the path over which the heading is averaged, so a corner turns gradually (0 turns at once) |
| `anchor` | string | `50% 50%` | the point of the slot that rides the path, as shares of its box (`50% 50%`, `left center`) |
| `inset` | number | 0.12 | the margin kept clear around the path, as a share of the frame's short side |
| `trail` | enum(none\|line\|comet) | `none` | a line drawn behind the point as it goes: line grows with it, comet is a segment sliding with it |
| `comet` | number | 0.25 | the comet's length as a share of the path |
| `ink` | enum(ink\|accent\|muted) | `accent` | the palette role the trail is drawn in |
| `weight` | number | 0.006 | the trail's weight as a share of the frame's short side |
| `zoom` | number | 1.5 | target camera: how far the camera dives towards the point (1 is not at all) |

Given as the scene's `move` with `moveParams`.

Brand knobs: turn, soften, anchor, inset, trail, comet, ink, weight, zoom.

## Style variables consumed
- `--mm-color-ink`, `--mm-color-accent`, `--mm-color-muted` (the trail, by `ink`)
- `--mm-frame-w`, `--mm-frame-h` (the trail's weight as a share of the short side)
- easing role `move` (the clock of the carry), via `ctx.ease`

## Legibility and rest notes
- Before `start` the slot waits at the path's start; after the carry it stays at the path's end. It rides on its own transform, so give it an entrance that has finished by `start` (or one that only touches opacity).
- The slot is placed by its `anchor`, to a fraction of a pixel, and rotated about that point: with `turn: follow` a line of type turns with the path, so keep it short; use `turn: off` for text that must stay level.
- With a `comet` trail the trail has left the frame by the end; a `line` trail stays.
- With `target: camera` the camera is exactly the whole frame at both ends of the move, so a rest is never cropped.
- A path with no length (a single point, empty data) does nothing.

## Provenance
- motion-canvas/motion-canvas, MIT: the idea of a tangent angle taken along a curve and of a trail drawn as a window of the path; no code taken.
- motiondivision/motion, MIT: the idea of an element's travel following a curve with its own heading; no code taken.
- greensock/GSAP, Proprietary: ideas only (a path as geometry with an arc-length table, a heading that stays continuous, start and end as shares of the path, a window that sets a corner's turn); its source was never opened or copied.

## Known limits
- The path is laid into the frame by its own bounding box, evenly (the frame's proportions are not matched); a very flat path leaves the rest of the frame free.
- One slot at a time; to carry two, use two scenes or give the second its own copy of the move in a fork.
- The heading is the path's tangent: a path that doubles back on itself turns by at most half a turn at the corner.
- Films and decks both work, but a deck's progress is in presses, so `start` and `dur` do not apply there.
