# text/split-flap

## Purpose
Sets a line on departure-board tiles that flip through letters and land one by one.

## Use when / Do not use when
**Use when**
- a destination, a status or a short label that should feel mechanical and live [H-INFO]
- a technical or travel-themed piece

**Do not use when**
- for sentences: tiles make long lines wide and slow to read
- in a brand with no surface colour that differs from its canvas: the tiles would not show

## Params
| name | type | default | meaning |
|---|---|---|---|
| `flips` | number | 6 | how many flips the last tile makes before it lands |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-line` (tile and hairline)
- `--mm-space-0`, `--mm-space-1`, `--mm-radius-1`
- duration role `slow`
- the seeded `random()` the kit passes in `ctx`

## Legibility and rest notes
At p = 1 every tile shows its own letter and nothing is flipping: tiles stay, as they are the look of the line. Letters are all landed by 85 % of the entrance, the last 15 % being a still read. Tiles share one width, the widest letter's, so the line does not jitter.

## Provenance
original

## Known limits
- the tiles stay at rest, so the line keeps its board look; it cannot hand back to plain text
- the flap is a squash on y, not a 3D flip
- only the line's own letters flip, so a one-letter word never changes before it lands
- the kit does not load `pattern.html` for the text group; the fragment is the reference
