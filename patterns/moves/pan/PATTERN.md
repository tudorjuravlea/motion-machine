# moves/pan

## Purpose
The camera slides sideways or up and down across the scene.

## Use when / Do not use when
**Use when**
- a wide layout with content spread along an axis
- linking two scenes with matching direction
- a picture should drift while its headline stays still: `moveParams: { "target": "media" }`

**Do not use when**
- content sits at the safe margin on the panned axis

## Params
| name | type | default | meaning |
|---|---|---|---|
| `dir` | enum(left|right|up|down) | left | where the camera goes; content slides the other way |
| `d` | number | 48 | total sweep in px before the style travel multiplier (0 to 160) |
| `target` | enum(camera|media) | `camera` | `camera`: the whole scene moves; `media`: only the pictures move, inside their frames (layouts/media, a device screen with an asset, a bento-3 tile with an asset) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
- `--mm-safe`
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- The sweep is symmetric about rest: content is displaced by half of `d` each way at the ends and is at its authored position in the middle of the scene.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.
- `target: media` moves the pictures instead of the camera: every `<img>`/`<video>` with `data-media` and a `src` in the scene sweeps inside its frame, each half-sweep at most 6 % of the picture's length along the sweep, and is scaled by 1 + 2 · half / that length so the sweep never uncovers its frame; the camera, the type and the frames stay put.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- Each half-sweep is cut back to the room between the slots and the safe margin (about 33 px in 9x16, 62 px in 16x9 on these layouts), so a large `d` saturates.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
