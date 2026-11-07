# layouts/stat-hero

## Purpose
One figure as the whole picture, with a headline and a line of body beneath.

## Use when / Do not use when
**Use when**
- a measured number is the point of the scene
- pairing a count-up with a one-line reading of it

**Do not use when**
- the figure needs a chart or comparison (use split or data patterns)
- there are several numbers

## Params
| name | type | default | meaning |
|---|---|---|---|
| `figure` | slot (text) | none | the number at 1.7 times display size, accent colour, tabular, one line; `data-focus="figure"` |
| `headline` | slot (text) | none | what the number means; carries `mm-fit` |
| `body` | slot (text) | none | source or qualifier, muted |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-color-muted`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-display`
- `--mm-size-h1`
- `--mm-space-4`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-tracking-text`
- `--mm-weight-display`
- `--mm-weight-text`

## Legibility and rest notes
- Composition: alignment from `--mm-align`, every headline size times `--mm-headline-scale`, and the gaps and the side indent times `--mm-density` (airy 1, compact 0.6).
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move of up to 6 %; content is centred in that box and lifted by half a safe margin so it reads centred under the top row and slightly above the middle (H-FILL).
- Text sizes come only from `--mm-size-*` roles at body size or above, so nothing is below the body floor; data-micro is never used.
- Empty slots (no beat) are removed from the flow with `[data-empty]`, so a layout with fewer beats stays centred.
- Every figure cites a story fact (H-FACTS); the demo does.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.
- The figure's `line-height` is `normal`, so its box is the face's whole text box (ascent plus descent) and the gap beneath it is a true gap in any display face: the figure and the headline do not overlap at a rest with Fraunces, Archivo or Manrope in any format (measured on the text boxes, as G-OVERLAP does; the smallest gap is 26 px). Before, a fixed `0.95` let a tall text box reach 9.8 to 29.5 px into the headline.

## Provenance
original

## Known limits
- The figure never wraps: a figure wider than the safe box (more than about 5 digits in 9x16) overflows it. Shorten with units or fit-headline.
