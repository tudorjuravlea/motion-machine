# emphasis/shine

## Purpose
Sweeps one band of the accent across the element's text and leaves, like light crossing a surface.

## Use when / Do not use when
**Use when**
- a figure or a word that has landed and deserves a second look, in a premium or product style [H-INFO]
- a quiet alternative to `indicate` when the text must not change size

**Do not use when**
- on several elements at once
- on text over a busy image: the band is a colour change of the glyphs only

## Params
| name | type | default | meaning |
|---|---|---|---|
| `angle` | number | 100 | band angle in degrees |
| `width` | number | 18 | band width as a percentage of the text width |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent`
- duration role `slow` (emphasis duration, from the module `dur`)
- easing role `move` (applied by the kit to the emphasis progress)

## Legibility and rest notes
The band is off the text at p = 0 and p = 1 and the pattern writes nothing there, so the text is exactly as laid out and no fill remains. Size and position never change. While the band is on, the glyphs are painted through a gradient, so a frame in the middle of the sweep is mid-motion, not a rest.

## Provenance
original

## Known limits
- tints the text only, so it does nothing visible to an element with no text
- the band is a gradient clipped to the glyphs; antialiasing can differ by a hair while it runs
- on wrapped text the band sweeps line by line, as the gradient is sliced across the line boxes
- takes no params from the beat: the kit passes emphasis its defaults only
