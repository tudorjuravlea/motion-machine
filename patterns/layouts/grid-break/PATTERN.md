# layouts/grid-break

## Purpose
A headline over a grid of identical tiles, then one tile that breaks the pattern: it takes the accent, sits larger and lifts off the grid.

## Use when / Do not use when
**Use when**
- an explainer point about the one exception ("five meetings, one hour of focus")
- a set of sameness where the difference is the message

**Do not use when**
- the items are different from each other (use `layouts/bento-3` or `layouts/list-reveal`)
- more than five ordinary tiles are needed

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading over the grid; carries `mm-fit` |
| `tile-1` … `tile-5` | slot (text) | none | the identical tiles, surface fill, body size |
| `odd` | slot (text) | none | the tile that breaks the pattern: accent fill, display face, larger and lifted through its margins (never scale, which an entrance owns); `data-focus="lead"` |
| `data-format` | html attribute | set by the kit | 9x16 and 4x5: two columns; 16x9 and 1x1: three columns |
| `align` | enum(left|center) | the brand's `composition.align` | the headline's alignment; a beat param on any slot (`data-p-align`) or `data-align` on the root overrides it |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-accentInk`
- `--mm-color-ink`
- `--mm-color-surface`
- `--mm-color-surfaceInk`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h1`
- `--mm-space-2`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- Composition: alignment from `--mm-align`, headline size times `--mm-headline-scale`, gaps and side indent times `--mm-density`.
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move.
- Tiles are `visibility:hidden` until their beat arrives, so the grid never reflows; an empty headline leaves the flow.
- The odd tile has no shadow (its blend with the accent would fall off the palette, G-LITERAL) and is never rotated (no rotated type at rest, `references/bans.md`); it breaks the grid by colour, size and lift.
- Text sizes come from `--mm-size-*` roles at body size or above.

## Provenance
- charlie947/motion-graphics-skills, MIT: the "grid break" composition of its explainer skill, identical tiles and one exception; restated as a layout. No code taken.

## Known limits
- Six cells: the odd tile is always the last cell; to place it elsewhere, leave earlier tiles empty.
- Tile labels are short words: a sentence wraps inside a small cell.
