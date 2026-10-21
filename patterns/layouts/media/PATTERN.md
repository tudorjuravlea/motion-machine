# layouts/media

## Purpose
One picture from the piece's `assets/`, framed at its own proportions or full bleed, with an optional headline above and caption below.

## Use when / Do not use when
**Use when**
- the proof is a picture: a screenshot, a poster, a still, a contact sheet, a chart rendered elsewhere
- the picture should be the largest thing in the frame, with one line to name it

**Do not use when**
- the picture belongs on a device screen (put the asset on `devices/phone`, `browser` or `laptop` in caption-bar's stage)
- there are three pictures to compare (bento-3 tiles take an asset each)
- the picture carries the only instance of a fact the viewer must read (the gate cannot read inside media)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading above the picture, at h1 times `--mm-headline-scale`; carries `mm-fit`; removed when it has no beat |
| `image` | slot (asset) | none | the picture: the beat's `asset` goes to the `<img data-media>` inside the frame; give the beat an entrance (`entrances/mask-reveal`, `entrances/rise`, `entrances/fade`) like any slot; `data-focus="image"` |
| `caption` | slot (text) | none | one line under the picture at body size in the muted colour (beside it, under the headline, for a portrait or square picture in 16x9); removed when it has no beat |
| `frame` | enum(framed|bleed) | `framed` | a param on the `image` beat (`params: { "frame": "bleed" }`, read as `data-p-frame`): `framed` sizes the frame to the picture (`--mm-asset-ratio`) inside the safe box; `bleed` lets the picture cover the whole frame and puts headline and caption on canvas plates under the top row |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. |
| `align` | enum(left|center) | the brand's `composition.align` | the layout's default comes from `--mm-align`; a beat param on any slot (`params: { "align": "center" }` or `"left"`, read as `data-p-align`) or `data-align` on the layout root overrides it either way |

## Style variables consumed
- `--mm-align`
- `--mm-asset-ratio` (written by the kit on the slot once the asset decodes, with `data-asset-shape`)
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-color-muted`
- `--mm-color-surface`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h1`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-tracking-display`
- `--mm-tracking-text`
- `--mm-weight-display`
- `--mm-weight-text`

## Legibility and rest notes
- The picture is an `<img data-media>` leaf, so the gate's pixel rules (G-BRAND, W-BAN) mask its content box and read what lies behind it from the same frame with the picture hidden; the kit decodes it before the first seek, so each frame depends on `t` and nothing else.
- framed: the frame takes the picture's proportions (`--mm-asset-ratio`, default 16 / 9 when the kit has not written one) and the largest size that leaves room for two headline lines and two caption lines (one of each in 16x9); the picture covers it (`object-fit: cover`), clipped by the frame's radius. Headline, picture and caption are one block, centred in the safe box, which is lifted by half a safe margin (H-FILL), and aligned per `--mm-align`.
- 16x9 with a portrait or square picture (`data-asset-shape`, written by the kit: portrait below 0.8, square up to 1.25): the picture stands on the right at the full height of the box (at most 60 % of its width) and the headline and caption are a column on its left, centred on it; stacked otherwise.
- bleed: the frame is the whole frame (the box's insets turned outward); headline and caption sit on canvas plates under the top row, never on the picture, so their contrast is the brand's ink on canvas.
- Text sizes come only from `--mm-size-*` roles at body size or above; data-micro is never used.
- Empty headline or caption slots are removed with `[data-empty]` and give their reserved room back to the picture; an image slot without a beat stays hidden (`visibility: hidden`) and keeps its room.
- With `moves/push-in`, `moves/ken-burns` or `moves/pan` and `moveParams: { "target": "media" }`, only the picture moves, inside its frame; the headline and caption stay put.

## Provenance
original

## Known limits
- The reserved text room is two headline lines and two caption lines (one each in 16x9), with slack for the display face's ascenders. A longer headline or caption pushes the block past the bottom of the safe box (G-EDGE fails at the rest): shorten it.
- `object-fit: cover` crops a picture whose shape differs from its frame; in framed mode that happens only before `--mm-asset-ratio` is known, in bleed mode whenever the picture is not the frame's shape. Put the important part in the middle.
- Text inside the picture is never measured by the gate (legibility, contrast and facts are on you): a fact the viewer must read goes in the headline or caption too.
- Pictures only: the markup holds an `<img>`, so a video asset is not drawn here.
