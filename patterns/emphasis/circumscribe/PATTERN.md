# emphasis/circumscribe

## Purpose
Draws an outline around an element's box and then wipes it away from where it started.

## Use when / Do not use when
**Use when**
- pointing at a word, a figure or a plate without changing it [H-INFO]
- a second look at something already on screen

**Do not use when**
- on several elements at once
- on an element that is clipped by an ancestor: the outline sits outside its box and would be cut

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) | | | This pattern takes no params. |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent`
- `--mm-space-0` (stroke), `--mm-space-3` (clearance, read by `pattern.js`)
- duration role `slow`

## Legibility and rest notes
The outline lives inside the element and exists only for 0 < p < 1; at p = 1 nothing is written and a seek removes the markup, so no outline or position change remains.

## Provenance
- ManimCommunity/manim, MIT: the verb `Circumscribe` (a shape drawn around an object that then disappears) as the idea; re-derived with an SVG rect and `pathLength`. No code taken.

## Known limits
- sets `position: relative` on a static element while it runs, which a layout that relies on static flow could notice
- the outline is a rectangle; it does not follow a border radius
- a wrapped text block is outlined by one rectangle around all its lines
- measures the element on every call (a layout read), so it is not free
- takes no params from the beat
