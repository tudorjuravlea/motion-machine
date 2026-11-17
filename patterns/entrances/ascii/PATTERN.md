# entrances/ascii

## Purpose
A picture arrives as a field of glyphs, each cell's glyph chosen by the picture's light there, flickers and settles, then resolves into the picture itself.

## Use when / Do not use when
**Use when**
- a tech, developer or data brand shows a picture, a screenshot or a product shot
- the arrival of the picture is the moment: a reveal, a launch, a "decoded" beat

**Do not use when**
- a calm, premium or photographic brand: the glyph field is a strong, opt-in look
- a picture whose detail matters at small size: the field is coarse until it resolves
- on text: it reads a picture; type has its own entrances

## Params
| name | type | default | meaning |
|---|---|---|---|
| `cell` | number | 0.018 | the size of a glyph cell as a share of the frame's short side, 0.008 to 0.05 |
| `role` | enum(accent|ink|muted|line) | `accent` | the palette role of the glyphs; they lie on the canvas role |

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` or `--mm-color-line` (by `role`) for the glyphs, `--mm-color-canvas` under them
- `--mm-font-mono` when the brand has a mono face, else `--mm-font-text`: the glyphs are set in the brand's own face
- duration role `hold`, the entrance's length

## Legibility and rest notes
- The picture is read once per size on a grid of square cells (object-fit cover, centred); each cell's glyph comes from a ramp of ten, darkest to lightest (` .:-=+*#%@`), by the cell's luminance.
- Cells come on in a seeded order over the first 40 % of the entrance, flicker through the ramp on a 12-a-second clock for 12 % of it, and settle on their own glyph; from 62 % the glyph field fades as the real picture fades in, and at p = 1 the canvas is gone and the slot is the plain picture.
- The canvas is declared media (data-media) and its glyphs are not text the viewer reads (`canvasText`, so G-LEGIBLE leaves them alone). The field is the canvas role with glyphs in one role: brand colours only.
- Pure in the window's seconds; a seek before the picture is decoded draws in ctx.afterSettle, as `entrances/photo-wake` does.
- An opt-in tech look: no preset uses it; a story names it.
- Reduced motion: the kit draws the finished picture fading in, with no glyphs.

## Provenance
- pmndrs/postprocessing, Zlib: the glyph-ramp ASCII look (square cells, a character ramp chosen by luminance), restated on a 2D canvas in the brand's own face and roles. No code taken.

## Known limits
- One glyph role: the field does not carry the picture's colours, only its light.
- The ramp is fixed; a brand's own glyph set is not read.
