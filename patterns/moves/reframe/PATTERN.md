# moves/reframe

## Purpose
The camera re-centres on a data-focus element while pushing in a little.

## Use when / Do not use when
**Use when**
- one element deserves the frame after a wider setup
- a bento or comparison scene where one side becomes the subject

**Do not use when**
- the layout has no data-focus element (it degrades to a plain push-in)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `focus` | string | empty | name of the data-focus element; empty takes the first |
| `to` | number | 1.12 | end scale before the style travel multiplier and the safe-margin cap (1.02 to 1.4) |
| `amount` | number | 1 | how much of the way to the frame centre the focus travels (0 to 1) |
| `end` | enum(scene|settle) | `scene` | `scene`: the move runs the whole scene; `settle`: it ends at the scene's settle instant (`ctx.settle`, from the kit) and holds there, so the rest is still |

## Style variables consumed
- `--mm-safe`
Reads `ctx.style.motion.travel` (the value of `--mm-travel`) from the composed style; the kit supplies the eased progress with the style's `move` easing. No colour, family, size or duration is read.

## Legibility and rest notes
- Pure in p. The scale is capped like push-in's and the shift is clamped so the union box of the slots stays inside `--mm-safe` at every p.
- `travel` is the style's multiplier; the move is scaled by it and clamped.
- Layouts with `data-focus`: split (figure), stat-hero (figure), bento-3 (lead), comparison (right).
- With `end: settle` the move reaches its end pose at the scene's settle instant and holds it, so the scene's rest is a still picture (W-AMBIENT then finds nothing moving at the rest); the default `scene` keeps the whole-scene move.

## Provenance
original; vocabulary after references/pacing.md (Camera moves).

## Known limits
- Focus position is read from layout offsets, so it follows the layout the format chose.
- Because nothing may cross the safe margin, a focus far from the centre ends short of the centre; with these layouts the visible shift is a few tens of pixels, a nudge rather than a re-frame.
- `end: settle` reads `ctx.settle` (the scene's settle instant, in seconds from its start) from the kit; a kit that does not supply it leaves the move running the whole scene. In a deck the move is unchanged.
