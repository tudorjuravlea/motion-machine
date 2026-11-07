# layouts/caption-bar

## Purpose
A stage for a device or picture with a persistent lower band that carries the caption.

## Use when / Do not use when
**Use when**
- showing a device, a recording or a diagram with a one-line explanation
- the same caption band should recur across scenes

**Do not use when**
- the caption is more than two lines
- there is no stage content (use statement)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `stage` | slot (text) | none | the host for a device (`devices/*`) or a picture; centred in the area above the band |
| `overlay` | slot (text) | none | covers the stage; the host for `devices/cursor` |
| `caption` | slot (text) | none | the band text |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-color-surface`
- `--mm-font-text`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-space-1`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-tracking-text`
- `--mm-weight-text`

## Legibility and rest notes
- Composition: the caption aligns by `--mm-align`.
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move of up to 6 %; content is centred in that box and lifted by half a safe margin so it reads centred under the top row and slightly above the middle (H-FILL).
- Text sizes come only from `--mm-size-*` roles at body size or above, so nothing is below the body floor; data-micro is never used.
- Empty slots (no beat) are removed from the flow with `[data-empty]`, so a layout with fewer beats stays centred.
- The band is `surface` filled with an accent edge, at body size, in the lower part of the safe box; the stage takes the remaining height.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- "Persistent" means the same layout and band position in every scene that uses it; the kit has no cross-scene persistence, so the band re-enters with its scene.
- Without a stage beat the area above the band is empty.
