# emphasis/indicate

## Purpose
Pulses an element once, scaling up a few percent and tinting toward the accent, then returns it exactly as it was.

## Use when / Do not use when
**Use when**
- a word or a figure that has just landed and needs the eye [H-INFO]
- the moment a spoken or written reference points at this element

**Do not use when**
- on several elements in one scene: the eye has one place to go
- as ambient looping motion: it is a single there-and-back (W-AMBIENT)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `amp` | number | 0.08 | peak scale gain, 0.02 to 0.12 |
| `tint` | number | 1 | how far the colour moves toward the accent at the peak, 0 to 1 |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent`
- duration role `standard` (emphasis duration, from the module `dur`)
- easing role `move` (applied by the kit to the emphasis progress)

## Legibility and rest notes
The motion is `sin(pi p)`, zero at both ends, and the pattern writes nothing at p = 0 or p = 1, so no scale or colour remains. Peak scale is 1 + amp, amp clamped to 0.02 to 0.12. At the peak the colour may be the accent, which can be low-contrast on the canvas; that frame is mid-motion, not a rest.

## Provenance
- ManimCommunity/manim, MIT: the verb `Indicate` (a there-and-back scale and colour pulse) as the idea; re-derived as a closed function of p. No code taken.

## Known limits
- takes no params from the beat: the kit passes emphasis its defaults only
- tints the text colour, so it does nothing visible to an element with no text
