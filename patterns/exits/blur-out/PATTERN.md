# exits/blur-out

## Purpose
Takes a picture, device or shape out of focus while it fades, the mirror of `blur-fade`; a layer that carries text only fades.

## Use when / Do not use when
**Use when**
- a picture, device or shape that should dissolve rather than leave [H-STILL]
- a text layer that should dissolve: it fades without blur, so every frame is still legible

**Do not use when**
- on large areas in a long film: blur is the costliest filter
- when the text itself must visibly lose focus: no exit blurs text
- at the end of a film (H-LAST)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `blur` | number | 12 | end blur radius in px |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `style.motion.exitRatio`
- easing role `exit`

## Legibility and rest notes
At p = 0 nothing is written; the kit hides the element when the exit completes. A layer with any text in it gets no `filter` at any p (its glyphs stay sharp and only its opacity falls); a layer without text blurs up to `blur`.

## Provenance
original

## Known limits
- on a text layer it is the same as `fade-out`; the blur shows only on non-text layers
- takes no params from the beat unless the beat gives `params.exit`
- the blur radius is in px, not scaled by format
