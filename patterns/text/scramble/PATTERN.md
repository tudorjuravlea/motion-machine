# text/scramble

## Purpose
Decodes a line from noise: letters resolve left to right while the rest shuffle.

## Use when / Do not use when
**Use when**
- a technical, hacker or data-themed reveal of a short line [H-INFO]
- a title that wants to feel computed

**Do not use when**
- for long lines: the noise dominates and the line takes long to read
- in a calm brand: the effect is restless by nature

## Params
| name | type | default | meaning |
|---|---|---|---|
| `changes` | number | 12 | how many times the noise reshuffles across the entrance |
| `pool` | string | (empty) | glyphs the noise is drawn from; empty uses the line's own letters plus digits |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `slow`
- the seeded `random()` the kit passes in `ctx`
- the style's own letters supply the noise, so no glyph outside the bundled face is shown

## Legibility and rest notes
At p = 1 the plain text is restored. While scrambling each letter keeps the width of its final glyph, so the line does not jitter. Letters are fully resolved by 85 % of the entrance, which leaves the last 15 % as a still read.

## Provenance
original

## Known limits
- scrambling letters are inline blocks of fixed width, so wide noise glyphs overlap their neighbours slightly
- the glyph widths are measured on every call (a layout read)
- the kit does not load `pattern.html` for the text group; the fragment is the reference
