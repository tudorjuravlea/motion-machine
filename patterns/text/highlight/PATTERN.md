# text/highlight

## Purpose
Sweeps a marker behind a line of text from left to right while the words fade in.

## Use when / Do not use when
**Use when**
- the key phrase in a sentence, as a marker would [H-INFO]
- a claim that should be stressed without moving or resizing it

**Do not use when**
- on a long wrapped paragraph: every line sweeps at once
- with an accent that clashes with the ink: the marker is the accent at low strength

## Params
| name | type | default | meaning |
|---|---|---|---|
| `strength` | number | 0.35 | accent mixed into the marker, 0.15 to 0.6 |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-accent` (mixed into the marker at `strength`)
- duration role `slow`
- easing role `enter` shapes the sweep

## Legibility and rest notes
At p = 1 the marker spans the full text and stays, which is the rest; the text itself is unchanged in size and position. The marker is the accent at 0.15 to 0.6 strength so the ink keeps its contrast (W-CONTRAST samples the plain background, so check the pair by eye).

## Provenance
original

## Known limits
- on a wrapped line each line box sweeps in step instead of one after another
- the marker height is fixed at half an em
- the kit does not load `pattern.html` for the text group; the fragment is the reference
