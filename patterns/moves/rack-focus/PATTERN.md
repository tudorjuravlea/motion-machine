# moves/rack-focus

## Purpose
Focus pulls from one depth plane to another; layers away from the plane blur.

## Use when / Do not use when
**Use when**
- directing the eye across layers in turn
- a bento or comparison scene with stacked tiles

**Do not use when**
- the layers hold the text that must stay readable throughout (use rest = sharp and a short blur)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 0 | focal depth at p = 0 (0 to 1) |
| `to` | number | 1 | focal depth at p = 1 (0 to 1) |
| `rest` | enum(sharp|keep) | sharp | sharp: everything is in focus at p = 1; keep: off-plane layers stay soft |
| `blur` | number | 8 | px of blur for one whole depth unit out of focus (0 to 16) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- With `rest = sharp` the blur is enveloped by sin(pi p): the first and last frames have no blur at all, so every rest is legible.
- Only children with `data-depth` are touched; bento-3 tiles carry 0, 0.5, 1.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- Writes `filter` on the layers; a slot that also uses blur-fade or blur-out is overwritten on that property.
- With `rest = keep` text on out-of-focus layers is soft at the final frame; the gate does not see blur.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
