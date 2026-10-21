# moves/ken-burns

## Purpose
The classic slow zoom with a small sideways creep.

## Use when / Do not use when
**Use when**
- a still image or a calm backdrop that needs a pulse
- a long hold at the end of a section
- a picture should drift while its headline stays still: `moveParams: { "target": "media" }`

**Do not use when**
- you need a visible camera event (use push-in)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `to` | number | 1.05 | end scale, held in 1.03 to 1.06 |
| `dir` | enum(left|right) | right | which way the camera creeps |
| `target` | enum(camera|media) | `camera` | `camera`: the whole scene moves; `media`: only the pictures move, inside their frames (layouts/media, a device screen with an asset, a bento-3 tile with an asset) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
- `--mm-safe`
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- Scale is held between 1.03 and 1.06 (references/pacing.md); the creep is at most 0.75 % of the frame width each way, and both are cut back so no slot crosses `--mm-safe`.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- The move runs on `.mm-camera` over the whole scene. Its end scale or shift is capped from the union box of the layout's slots (read from layout offsets), so no slot crosses `--mm-safe` at any p; on a layout that already fills the safe box the move does nothing.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.
- `target: media` moves the pictures instead of the camera: every `<img>`/`<video>` with `data-media` and a `src` in the scene scales from 1 + 2c to `to` × (1 + 2c) about its own centre while it creeps c of its width each way (c = 0.75 % times travel), so the creep never uncovers its frame; the camera, the type and the frames stay put.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- Ends scaled, so the final frame is not the authored layout.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
