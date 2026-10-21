# layouts/statement

## Purpose
One large claim, with an optional sub, for the scene that makes a single point.

## Use when / Do not use when
**Use when**
- a problem statement, a turn or a verdict in one sentence
- you want the headline to be the whole picture

**Do not use when**
- more than about twelve words (the display size will wrap to many lines)
- you need a rule or any supporting structure

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | the claim as a lead of the display role (the display role itself as the hook); carries `mm-fit` |
| `sub` | slot (text) | none | optional line beneath; removed when it has no beat |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. Its only param is `align` (next row). |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align` (the brand composition, so every scene of a piece aligns alike); a beat param on any slot of the scene (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
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
- The headline is a lead: the display role times 0.8 (0.64 in 1x1) times `--mm-headline-scale`. In the hook scene (the first scene, which the kit marks `data-hook`) the kit raises `--mm-headline-scale` one step (1.25), so a hook in this layout is the display role itself (0.8 in 1x1) and the largest headline of the piece in every format.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- Display type in 9x16 is about 6 characters per line before it wraps; very long claims overflow the safe box. Let fit-headline shrink them or shorten.
