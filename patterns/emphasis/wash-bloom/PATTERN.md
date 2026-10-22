# emphasis/wash-bloom

## Purpose
Colours in a sketched slot: once its pen has closed, a watercolour wash in one palette role blooms open behind the ink and stays, slot after slot in the order the pens drew them.

## Use when / Do not use when
**Use when**
- a sketched scene should end in colour instead of being inked into the product: the drawing stays, the brand paints it
- an explainer that blocks out a plan, then fills each part as it is explained
- a moodboard or a set of ideas, each one coloured in as it lands

**Do not use when**
- the slot is not drawn with `entrances/sketch`: the bloom draws nothing there
- the next cut is `transitions/sketch-to-ink`: the ink replaces the sketch, so the colour would only flash before it goes
- a single headline: there is no outline to wash

## Params
| name | type | default | meaning |
|---|---|---|---|
| `bloom` | enum(cycle|accent|muted|line|surface) | `cycle` | the palette role of the wash; cycle steps through accent, muted, line and surface in the order the pens drew the slots. Give it among the beat's own params so the sketch keeps it after the window |
| `offset` | number | 2 | how far the wash lands off the outline, in pen half-widths, 0 (on register) to 6; every slot of a scene shifts the same way |

Duration role: `slow`. The window opens as the slot's sketch lands. Three layers open from a box 0.3 the outline's size about its middle out to the outline, each starting 0.18 of the window after the one inside it and taking 0.64 of it, eased; each layer's strength and its shift off the outline grow with it.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-surface` (the wash, by `bloom`)
- `--mm-space-1` through the sketch's pen width (the wash's bleed and shift are in pen half-widths)
- duration role `slow`

## Legibility and rest notes
- The wash sits in the sketch's fill layer, under the slot's words (`z-index: -1` in an isolated slot): the label stays ink at full strength and the ink line stays as drawn.
- Every layer is one palette role at an alpha over the ground (0.14, then fainter outward; about 0.3 where all three lie; the outermost with a faint rim), so each pixel is a blend of two roles, three where the ink line crosses it: G-BRAND holds.
- After the window `entrances/sketch` draws the same wash at full (the window ends exactly on it), so the scene's rest shows every slot coloured in and nothing moving. In a deck the bloom plays while its press does and every later rest shows it whole.
- Pure in the window's time: one seed and one sampling for every layer, so the wash only grows, never reshuffles, and a seek in either order draws the same frame.
- The bloom bleeds a few pen widths past the outline, inside the slot's padding when it has some.

## Provenance
- feitangyuan/doodle-anim, MIT: ideas only (colour washes blooming behind a finished line drawing, one after another, offset off the line like a print plate); no code taken. The geometry is `rough.wash` in `runtime/kit/rough.js`.

## Known limits
- Works only with `entrances/sketch`; a cascade child is not bloomed on its own.
- `cycle` counts the scene's sketched slots that carry this emphasis; slots in other scenes start their own count.
- `surface` sits close to the ground on most brands, so a fourth slot's bloom is faint; give it `bloom` explicitly when it should read.
- A `line` shape has no inside and gets no bloom.
