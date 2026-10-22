# text/lit-sweep

## Purpose
Shows a whole block of type at a readable tone from the first frame, then lifts it to full ink word by word as a reading cursor passes.

## Use when / Do not use when
**Use when**
- a manifesto, a promise or a principle of one to four lines that should be read as it lights [H-INFO]
- a deck or film slide where the whole thought must be visible at once, and the light only guides the eye

**Do not use when**
- for a hook that must land in its first frame at full strength: the words wait at the floor until the cursor reaches them
- for a single word or a figure: there is no reading order to sweep
- on a slot whose words carry their own markup (an emphasised word, a link): the sweep rebuilds the slot from its text while it runs

## Params
| name | type | default | meaning |
|---|---|---|---|
| `floor` | number | 30 | how much ink an unlit word carries, in percent of full, 15 to 60 |
| `soft` | number | 0.12 | half the width of the light band, as a share of the reading path, 0.04 to 0.4 |
| `edge` | enum(none\|accent) | `none` | `accent` tints the words inside the light band toward the accent text colour |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-ink` and `--mm-color-canvas`: an unlit word is ink mixed into the canvas at `floor` percent, a colour and never an alpha
- `--mm-accent-text` with `edge: accent`, mixed in by up to 100 % at the middle of the band and not at all outside it
- duration role `hold` is the whole sweep; override with `params.dur`
- the cursor travels the reading path at a steady pace, so reading speed never races ahead; the `move` easing shapes each word's ramp as the band passes

## Legibility and rest notes
The block is a reading path: lines top to bottom, words in reading order (right to left in a right-to-left block, since the words keep their logical order), each word placed at the middle of its own width along the summed widths of every word. A cursor crosses that path from half a band before its start to half a band past its end, so at p = 0 every word is unlit and at p = 1 every word is lit. Every word is on screen from the first frame, fully opaque, carrying at least `floor` percent of ink (15 % at the least), and a word only brightens. The word spans are inline and laid out once, so the lines break exactly where the plain text breaks and nothing reflows. At p = 1 the pattern writes nothing, so the slot at rest is the plain text in its own colour. Type never moves, scales or rotates.

## Provenance
feitangyuan/motion-web, CC BY-NC 4.0: ideas only; no code taken. The idea taken is readable type lifted to full strength in reading order. The mechanism is our own: a cursor moving along a width-weighted reading path, a band ramp eased by the style, and an unlit tone that is a colour mix rather than an opacity.

## Known limits
- lines are read from the layout when the entrance runs; a slot that changes width during the sweep keeps the places of its current lines
- the slot's markup is rebuilt from its text while the sweep runs (spans per word); inline markup returns only at the rest
- the unlit tone mixes ink toward the canvas role, so over a picture or a surface of another colour the waiting words lean toward the canvas, not toward what is behind them
