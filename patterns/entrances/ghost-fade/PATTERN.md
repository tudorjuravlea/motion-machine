# entrances/ghost-fade

## Purpose
Shows a faint, soft, slightly large ghost of the element first, then tightens it into focus.

## Use when / Do not use when
**Use when**
- a title that should surface rather than appear, in a reflective piece [H-STILL]
- an opening line in a premium style

**Do not use when**
- for fast pieces: it needs the whole slow duration to read as two stages
- for small text, where the blurred ghost is only noise

## Params
| name | type | default | meaning |
|---|---|---|---|
| `ghost` | number | 0.25 | opacity of the ghost stage, 0 to 0.5 |
| `from` | number | 1.04 | start scale, clamped to 1 to 1.12 |
| `blur` | number | 6 | ghost blur radius in px |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `slow`
- no spring, no travel

## Legibility and rest notes
At p = 1 opacity is removed and scale and filter are `none`. The ghost stage tops out at the `ghost` opacity (0 to 0.5) so it is never mistaken for the real line; during it, text is below any legibility floor by design and finishes before the reading time begins.

## Provenance
original

## Known limits
- two stages need a slow duration; at `quick` they blur into one
- scale pivots on the text edge for left or right aligned text
