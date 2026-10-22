# moves/depth-parallax

## Purpose
A still picture becomes a dolly shot through a lens that settles: its layers start pushed off their places by how far their depth lies from the focus and slide home as the move eases out, while a shallow depth of field keeps the nearest layer crisp and softens the far ones, so the photo reads as a camera move through a real space. The rest is the settled, defocused picture; with `aperture: 0` it is the plain picture.

## Use when / Do not use when
**Use when**
- one picture carries the scene (a product on a set, a landscape, a poster) and a camera move should give it depth
- the picture has been taken apart with `mm media layers` (masks, polygons or a colour key, with a depth map or a depth per part)

**Do not use when**
- the picture is a plain asset with no layer pack beside it (nothing moves; use `moves/ken-burns` with `target: media`)
- the parts are text or faces seen up close: layer edges can ghost while they move, and rigid things should move whole
- `entrances/photo-wake` or another canvas entrance draws on the same picture in the same scene

## Params
| name | type | default | meaning |
|---|---|---|---|
| `path` | enum(dolly-left\|dolly-right\|rise\|push) | `dolly-right` | dolly-left / dolly-right: the camera slides sideways and settles, the layers behind the focus sliding past it; rise: it settles downward onto the shot; push: layers in front of the focus start enlarged, those behind it smaller (the plate and the bands never smaller than the frame), the picture a little larger, and all settle back to the shot |
| `amount` | number | 0.12 | the drift as a share of the frame's short side, 0.02 to 0.24: a layer one whole depth from the focus starts this far from its place |
| `focus` | enum(auto\|0..1) | `auto` | the depth the camera is locked on, 0 (far) to 1 (near): it stays put and stays sharp; auto takes the nearest layer of the picture (the plate, a band of the depth map or a part) |
| `aperture` | number | 0.35 | the lens, 0 to 1: each layer is blurred by aperture x 1 % of the short side x its depth gap from the focus, so at 0.35 a layer one whole depth away is softened by 0.35 % of the short side; 0 keeps every layer sharp and the rest is the plain picture |
| `bands` | number | 10 | how many bands of equal pixel count the plate is cut into when the pack has a depth map, 6 to 16 |
| `end` | enum(scene\|settle) | `settle` | settle: the drift ends at the scene's settle instant and the rest holds the settled picture; scene: it runs the whole scene |

## Style variables consumed
- easing role `move` (the settle curve)
- none of the palette: the picture is media, drawn in a canvas declared `data-media`

## Legibility and rest notes
- The picture's asset is the pack's `source.png`; the move reads `media.json` beside it and redraws the plate and the parts in a canvas over the picture, inside its frame. Type and the camera stay put.
- A dolly moves each layer by w × amount × short side × (depth − focus), where w = 1 − the eased progress. The focus sits on the nearest layer by default, so that layer is the anchor and everything behind it slides past and settles; a focus set in the middle makes near and far layers start on opposite sides and meet at rest. Push scales each layer about the picture's centre by 1 + w·Z·(depth − focus), with Z = 2.5 × amount, and the whole picture by 1 + w·Z/2.
- The lens blurs each layer by aperture × 0.01 × short side × |depth − focus| px (a canvas `filter: blur()`), the same all through the move: the focus layer is sharp, and at the default 0.35 a layer one whole depth away is softened by 0.35 % of the short side, about 4 px on a 1080 px side. Nothing darkens.
- The plate is drawn large enough that, displaced, it still covers the picture's box, so no edge opens; on a push the bands are too. The plate, the bands and every part that meets the picture's border are extended past it by 8 % of the pack's long side, mirrored across the edge, so a blurred layer stays whole up to the border and a band that slides at the default drift brings its own mirrored edge into view.
- The canvas lies on whole pixels with the picture's box inside it at its fraction, so it is shown pixel for pixel: the focus layer keeps the picture's own sharpness.
- With a depth map the plate is cut into bands at the map's quantiles (equal pixel counts). Each band is the plate seen through a soft mask that rises over its lower edge and falls over its upper one, each edge soft over 0.6 of the narrower of the two bands that meet there, drawn far to near, so neighbouring bands share their seam, no crack opens, and a flat depth (a wall) stays whole in its own band instead of showing twice.
- Nothing a part leaves behind shows a gap. Parts are drawn far to near, and each part is completed behind every nearer part: where a nearer part covers it, it is filled between its own opaque pixels along rows and columns, never past its outline, so a shelf that runs behind a bottle comes out whole as they part. A supplied clean plate is used as it is; a plate whose holes were filled from around them (`push-pull`) is filled again so straight edges run on: first the runs of the hole whose two ends agree and lie on a line (a lip, a tile line) are drawn straight across, then every other pixel takes its row's or its column's ends, or one end alone, an end that lies on a line pulling the fill along it, so a vertical line runs down to the horizon and stops there.
- The bands are cut by the depth behind the parts, not by the parts' own depth: under each part the depth is filled along its rows from the depths at either end of the covered run (a horizon stays level), so the plate behind a part moves with the background it belongs to and no part-shaped hole slides off the part.
- With a lens (`aperture` above 0) the canvas stays through the rest, drawn at w = 0: the settled, defocused composition, still and the same at every rest instant.
- With `aperture: 0` the canvas fades out over the last stretch of the move (w below 0.08, layers a few pixels from home); at w = 0 it is gone, so the settled frame equals the plain picture pixel for pixel.
- The pack is fetched and its bands built once per page; a seek before they are ready draws inside `settle()`, so every frame is a function of `t`.

## Provenance
- lemomo-ai/lemo-wake, CC BY-NC 4.0: ideas only — depth parallax inside a still; our own dolly model (paths, displacement law, quantile bands with shared soft edges, plate bleed), our own lens (blur law, nearest-layer focus, edge extension) and our own hole and part completion (line-continuing fill); no code taken.

## Known limits
- Needs a layer pack made by `mm media layers`; a picture without one is left as it is.
- Depth is per part, or per band of a supplied map: no depth is estimated from the picture.
- Where a part leaves its place without a clean plate, the plate shows a guess: straight edges and flat surfaces run on, but texture, curves and diagonals do not (a diagonal grain is filled level). Give `mm media layers --plate` a clean plate when there is one.
- A part is completed only between its own pixels: where a nearer part covers its end, nothing behind is known and that end stays cut.
- Behind a part the depth is guessed along rows; a vertical depth edge hidden behind a part becomes a ramp.
- The drift is a share of the frame, not scaled by the style's travel, so a calm brand gets the same drift; lower `amount` for a quieter move.
- The blur is one radius per layer: a band of a depth map is softened as a whole at its mean depth, not pixel by pixel, and a part is as sharp at its far edge as at its near one.
- Past the 8 % extension (a picture shown much smaller than the frame, a strong aperture, or a drift well above the default) a sliding band opens onto the plate at the border, or a blurred layer thins there.
- Drawn on the CPU canvas at the picture's size, so it costs more per frame than a CSS move; with a lens every frame of the rest is drawn too, each blurred layer adding a blur pass.
