# emphasis/spotlight

## Purpose
Dims everything else toward the canvas and then releases it, so the eye lands on one element.

## Use when / Do not use when
**Use when**
- one figure or claim among several that should be read now [H-ONE]
- a beat that must be singled out for the viewer

**Do not use when**
- more than once per scene: the dimming is a large change
- when the element sits under another with a higher z-index: the dim paints under it

## Params
| name | type | default | meaning |
|---|---|---|---|
| `dim` | number | 0.8 | how much of the rest is covered at the peak; 0.8 leaves it at 0.2 |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-canvas` (the dim is the canvas colour at partial cover)
- duration role `hold`

## Legibility and rest notes
The dim is the element's own spread shadow, a style the kit restores on every seek. Nothing outside the element is touched, so nothing remains at p = 1. At the peak everything else shows at 1 minus `dim` of its contrast (0.2 by default). The element's own box is not dimmed.

## Provenance
- ManimCommunity/manim, MIT: the verb `Spotlight` as the idea; here a canvas-colour dim instead of a circular light. No code taken.

## Known limits
- implemented as a spread shadow of the element itself rather than a sibling overlay: a sibling the pattern added would outlive a seek, since the kit restores only the elements it manages
- sets `position: relative` and `z-index` while it runs
- dims by covering with the canvas colour, so it also covers a photograph behind the text
- takes no params from the beat
