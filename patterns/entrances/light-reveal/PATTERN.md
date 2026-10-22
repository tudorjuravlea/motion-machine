# entrances/light-reveal

## Purpose
Turns a block on with a soft light front that crosses it at an angle, with a faint glint riding the front.

## Use when / Do not use when
**Use when**
- a keynote moment on a dark or calm ground: a product name, a promise, a figure, a logo-like title [H-INFO]
- a reveal where nothing should move, only light

**Do not use when**
- for a hook that must be whole in its first frame: the block waits at the base strength until the front passes
- on a slot whose content reaches far outside its box: the mask reaches half an em past the box on every side, no further

## Params
| name | type | default | meaning |
|---|---|---|---|
| `angle` | number | 120 | the direction the front travels, in CSS gradient degrees (90 is left to right, 180 top to bottom) |
| `soft` | number | 0.35 | the width of the soft edge, as a share of the block, 0.05 to 0.8 |
| `base` | number | 0.07 | how strong the block is before the light reaches it, 0 to 0.3 |
| `glint` | number | 0.4 | how much accent the glint mixes into the text at its peak, 0 to 0.8; 0 for none |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-ink` as the mask's alpha source (a mask reads alpha only, so no colour of it shows)
- `--mm-accent-text` mixed into the slot's own text colour for the glint
- duration role `slow`
- easing role `enter`

## Legibility and rest notes
At p = 0 the whole block waits at `base`; the front only advances, and whatever it has passed is at full strength and stays there. At p = 1 the front has left the block, every point is at full strength and the pattern writes nothing, so the slot at rest is exactly as laid out. The block never moves, scales or rotates. The glint is a narrow band of accent blended into the glyphs just behind the front, drawn only on a slot of bare text that paints no box of its own and keeps its ink inside its box (a text fill paints only inside the box).

## Provenance
lemomo-ai/lemo-opuscar, MIT: ideas only; no code taken. The idea of a soft diagonal light band passing over a surface, turning on what it passes, with a faint glint on the front, is restated in our own code as a CSS mask gradient driven by p and a glint mixed from brand roles.

## Known limits
- the glint is drawn only on bare text; a slot with child elements, its own box or ink past its box gets the light without the glint
- the soft edge is measured in shares of the mask (the slot's box plus half an em on each side), so a wide slot gets a wider edge in pixels than a narrow one
- the waiting block is an opacity, so a picture behind the slot shows through it until the light arrives
