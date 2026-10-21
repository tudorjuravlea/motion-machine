# moves/push-in

## Purpose
The camera drifts toward the scene, optionally toward a data-focus element.

## Use when / Do not use when
**Use when**
- emphasis on what is already on screen
- a scene with one clear point of interest
- a picture should drift while its headline stays still: `moveParams: { "target": "media" }`

**Do not use when**
- the scene already has other large motion
- the layout fills the whole safe box (the move pushes it past the safe margin)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `to` | number | 1.06 | end scale before the style travel multiplier and the safe-margin cap (1.02 to 1.5) |
| `focus` | string | empty | name of a data-focus element to push toward; empty uses the frame centre |
| `target` | enum(camera|media) | `camera` | `camera`: the whole scene moves; `media`: only the pictures move, inside their frames (layouts/media, a device screen with an asset, a bento-3 tile with an asset) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
- `--mm-safe`
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- At p = 0 the camera is at identity (`transform: none`); at p = 1 it is scaled to `to` times travel, and not beyond 1.5.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- The move runs on `.mm-camera` over the whole scene. Its end scale or shift is capped from the union box of the layout's slots (read from layout offsets), so no slot crosses `--mm-safe` at any p; on a layout that already fills the safe box the move does nothing.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.
- `target: media` moves the pictures instead of the camera: every `<img>`/`<video>` with `data-media` and a `src` in the scene (layouts/media, a device screen, a bento-3 tile) scales from 1 to `to` times travel (not beyond 1.5) about its own centre, inside the frame that clips it; the camera, the type and the frames stay put, and no safe-margin cap applies because the frame clips the picture. `focus` is ignored there.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- The cap means a layout that fills the safe box (caption-bar) is not pushed at all; the layouts here leave about 8 % headroom, so a push beyond about 1.08 is cut back.
- Only films.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
