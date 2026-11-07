# layouts/comparison

## Purpose
A headline over two equal sides, for a this-versus-that point.

## Use when / Do not use when
**Use when**
- two halves of one system or two options of equal weight
- before and after

**Do not use when**
- one side is clearly the answer (the accent edge on the right implies a verdict only lightly, but use quote or statement)
- more than two sides

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading; carries `mm-fit` |
| `left` | slot (text) | none | left or upper side, ink edge |
| `right` | slot (text) | none | right or lower side, accent edge, `data-focus="right"` |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-color-surface`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-h1`
- `--mm-size-h2`
- `--mm-space-1`
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
- Sides are `visibility:hidden` until their beat arrives, so the pair does not reflow.
- 9x16 and 1x1 stack the sides; 16x9 sets them side by side.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- Each side holds one short phrase at h2; two lines is the practical limit in 16x9.
- In 1x1 only 888 px of height is usable: a headline over about 35 characters (three lines at h1) together with full content crosses the safe margin. Keep the headline to two lines there.
