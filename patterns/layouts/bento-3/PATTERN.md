# layouts/bento-3

## Purpose
A headline over three tiles, the first of them leading, for a short set of parallel things, each a label, a picture or both.

## Use when / Do not use when
**Use when**
- exactly three short items such as categories or features
- one item deserves emphasis (tile-1 is accent-filled)
- three pictures side by side (three brands, three formats): give each tile beat an `asset`

**Do not use when**
- the tiles hold sentences (use comparison or list-reveal)
- fewer or more than three items

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading over the grid; carries `mm-fit` |
| `tile-1` | slot (text) | none | lead tile, accent fill, `data-focus="lead"`, `data-depth="0"` |
| `tile-2` | slot (text) | none | second tile, `data-depth="0.5"` |
| `tile-3` | slot (text) | none | third tile, `data-depth="1"` |
| `asset` | beat field on a tile | none | a path under the piece's `assets/`: the picture covers the tile (`<img data-media>`, `object-fit: cover`, clipped by its radius) and the tile's text, if any, becomes a label at h2 (the lead too) on a canvas plate over its lower edge (the kit writes a slot's text into its `[data-text]` child) |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |
| `surface` | enum(flat|glass) | `flat`, or the brand's own default for this layout (`style.patterns["layouts/bento-3"].surface`) | `glass` dresses tile-2 and tile-3 in the brand's glass surface (a tint of the surface role, the backdrop blurred, a hairline, a top highlight, a soft shadow, one shine sweep as each arrives) and gives the lead tile, which keeps its accent fill, the same edge and shine. A beat param on any slot of the scene (`params: { "surface": "glass" }` or `"flat"`) sets it for the scene and wins over the brand's default; the kit writes it as `data-surface` on the layout root, and each tile carries `data-glass` (the lead `data-glass="accent"`) |

Brand knobs: align, surface (the glass look itself is the brand's `surface` block).

## Style variables consumed
- `--mm-align`
- `--mm-color-accentInk`
- `--mm-color-accent`
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-color-surface`
- `--mm-density`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-h1`
- `--mm-size-h2`
- `--mm-space-2`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- Composition: alignment from `--mm-align`, every headline size times `--mm-headline-scale`, and the gaps and the side indent times `--mm-density` (airy 1, compact 0.6).
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move of up to 6 %; content is centred in that box and lifted by half a safe margin so it reads centred under the top row and slightly above the middle (H-FILL).
- Text sizes come only from `--mm-size-*` roles at body size or above, so nothing is below the body floor; data-micro is never used.
- Empty slots (no beat) are removed from the flow with `[data-empty]`, so a layout with fewer beats stays centred.
- With `surface: glass`, tile-2 and tile-3 have no fill of their own (the brand's tint over the blurred ground behind them), so W-CONTRAST measures their labels over the rendered pixels; the lead tile keeps its accent fill. The shine bar crosses a tile only while it arrives.
- Tiles are `visibility:hidden` until their beat arrives, so the grid does not reflow.
- 16x9: lead on the left spanning two rows; 1x1: lead across the top; 9x16: three rows.
- Here the room for every tile stays reserved in a deck as well: the grid is one composition, and re-flowing it as tiles arrive would move the lead tile between cells. A rest with later tiles still hidden shows the headline and the arrived tiles in their final cells.

- A tile with an asset is a picture: an `<img data-media>` leaf the kit decodes before the first seek and the gate's pixel rules mask; its label sits on a canvas plate, never on the picture, so its contrast is ink on canvas. A tile without an asset is unchanged (the `<img>` takes no room). `moves/push-in`, `ken-burns` and `pan` with `moveParams: { "target": "media" }` move every tile's picture inside its tile while the grid and headline stay still.

## Provenance
original

## Known limits
- Tile text is h2 (h1 for the lead in 16x9): a label of one to four words; longer text wraps and may clip at the tile.
- A picture of another shape than its tile is cropped about its centre (`object-fit: cover`): in 16x9 the lead tile is about 16:9 and the two others are wide strips, in 9x16 all three are wide strips.
- Text patterns that rewrite a tile's text (`text/*`) or a cascade (`each`) replace the tile's contents, picture included: use a plain entrance on a tile with an asset.
- The grid height is half the frame height (0.56 in 9x16), fixed, so it does not grow with its content.
- In 1x1 only 888 px of height is usable: a headline over about 35 characters (three lines at h1) together with full content crosses the safe margin. Keep the headline to two lines there.
