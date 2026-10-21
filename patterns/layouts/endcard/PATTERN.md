# layouts/endcard

## Purpose
The sign-off: a wordmark with an optional closing line above it and one unbroken line (a URL) below, the last frame of a film or a deck, aligned as the brand composes.

## Use when / Do not use when
**Use when**
- the final scene: name, URL or a promise
- a deck closing slide

**Do not use when**
- anything but the end (it is deliberately plain)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `line` | slot (text) | none | the closing line above the wordmark, the line to remember (H-LAST); body face at `h2` size, wraps at spaces only |
| `headline` | slot (text) | none | the wordmark; carries `mm-fit`; display size in 16x9 |
| `body` | slot (text) | none | one line such as a URL; it never wraps (`white-space: nowrap`), so it never breaks mid-word |
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
- `--mm-size-h2`
- `--mm-space-1`
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
- The endcard aligns as every other layout of the piece does, so a left brand signs off on the left and a centred brand in the centre; `align` overrides it. Its headline is a lead like statement's (the display role times 0.8, 0.64 in 1x1, times `--mm-headline-scale`), so the sign-off never outranks the hook.
- The URL is one line. At 9x16 it is wider than the layout box (it uses the 8 % headroom on each side) but stays inside `--mm-safe`; a URL that no longer fits there is a G-EDGE finding, not a mid-word break. Longer sentences belong in `line`, which wraps at spaces.
- With a `line` the final rest carries the closing line above the wordmark, so the last picture is the line to remember and not only a logo.
- In a deck, a slot the kit still hides (a later press has not brought it in, or it has left) takes no room, so the content that is visible is centred at that rest. The room appears when the slot arrives, so the layout re-centres at the start of that press; a film keeps the room and nothing shifts as slots arrive.

## Provenance
original

## Known limits
- A URL longer than about 42 characters at 9x16 (about 46 at 1x1, much more at 16x9) does not fit the safe box in one line and fails G-EDGE; shorten it or set it smaller in the style's body role; it is never broken mid-word.
- A `line` of more than two lines of text crowds the stack at 9x16 and 1x1.
