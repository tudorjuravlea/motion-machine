# layouts/split

## Purpose
A headline and body on one side and a figure with its caption on the other (16x9), stacked in 9x16 and 1x1.

## Use when / Do not use when
**Use when**
- one idea with one big visual or number beside its explanation
- a device or chart lives in the `figure` slot

**Do not use when**
- there is no figure and no caption (use title-stack)
- the figure needs more than half the frame (use stat-hero)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | the heading; carries `mm-fit` |
| `figure` | slot (text) | none | a number or a visual; display size, accent colour, tabular figures; carries `data-focus="figure"` for reframe |
| `body` | slot (text) | none | explanatory line |
| `caption` | slot (text) | none | small note beneath the figure, muted |
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
- `--mm-space-6`
- `--mm-tracking-display`
- `--mm-tracking-text`
- `--mm-weight-display`
- `--mm-weight-text`

## Legibility and rest notes
- Composition: alignment from `--mm-align`, every headline size times `--mm-headline-scale`, and the gaps and the side indent times `--mm-density` (airy 1, compact 0.6).
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move of up to 6 %; content is centred in that box and lifted by half a safe margin so it reads centred under the top row and slightly above the middle (H-FILL).
- Text sizes come only from `--mm-size-*` roles at body size or above, so nothing is below the body floor; data-micro is never used.
- Empty slots (no beat) are removed from the flow with `[data-empty]`, so a layout with fewer beats stays centred.
- With no figure beat the layout collapses to one column and the caption follows the body.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- The caption runs at body size (the floor), not at the caption role.
- In 16x9 the figure is 1.4 times display size; a figure wider than half the frame crosses the gutter.
