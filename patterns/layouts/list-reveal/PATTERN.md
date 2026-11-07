# layouts/list-reveal

## Purpose
A headline and up to six items that arrive one after another.

## Use when / Do not use when
**Use when**
- a short sequence or checklist of two to six items
- each item is a phrase, not a paragraph

**Do not use when**
- items are numbers with labels (use bento-3 or data patterns)
- more than six items

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading; carries `mm-fit`; removed when it has no beat |
| `item-1` | slot (text) | none | item 1; removed from the flow when it has no beat |
| `item-2` | slot (text) | none | item 2; removed from the flow when it has no beat |
| `item-3` | slot (text) | none | item 3; removed from the flow when it has no beat |
| `item-4` | slot (text) | none | item 4; removed from the flow when it has no beat |
| `item-5` | slot (text) | none | item 5; removed from the flow when it has no beat |
| `item-6` | slot (text) | none | item 6; removed from the flow when it has no beat |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h1`
- `--mm-size-h2`
- `--mm-space-1`
- `--mm-space-3`
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
- Items use h2 in every format; each is marked by an accent square drawn in CSS. When the kit cannot clear the headline from the items by its size alone, it marks the headline `data-fit="tight"` and the items step down to the body size (never under the body floor), so a long question over long items still fits the frame, the square format included.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- Items are one to two lines; long items push the last ones past the safe box when six are shown in 16x9 or 1x1.
- In 1x1 only 888 px of height is usable: a headline over about 35 characters (three lines at h1) together with full content crosses the safe margin. Keep the headline to two lines there.
