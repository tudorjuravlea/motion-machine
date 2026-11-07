# layouts/talking-full

## Purpose
The story's footage (a talking-head recording cut by `mm footage cut`) fills the frame, with an optional headline in the top band, a caption low in the frame and an overlay area for a lower third or an annotation.

## Use when / Do not use when
**Use when**
- a person speaks to camera and the film follows their voice: the footage is the film's clock
- a hook line or a caption sits over the speaker for a clip or two

**Do not use when**
- the recording is a screen recording to show on a device (use `devices/phone`, `laptop` or `browser` with the sequence as the beat's asset)
- the picture is a still (use `layouts/media`)
- in a deck: decks do not play footage

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | a line in the top band, at h2 times `--mm-headline-scale`, on a canvas plate; removed when it has no beat |
| `caption` | slot (text) | none | a line low in the frame at body size on a canvas plate; `text/caption-karaoke` with `mode: words` puts the spoken words here; removed when it has no beat |
| `panel` | slot (a tile or a picture) | none | the region the speaker leaves: beside the column in `side`, above the speaker in `bottom`, the safe area in `hero`, `inset` and `hidden`; hold a `data/stat-tile` or a picture (plain text belongs in the headline or the caption); the tile stands clear of the face; removed when it has no beat |
| `frame` | scene field | the brand's `frame`, or `panelFrame` (`side`) for a scene with a panel beat | where the speaker stands: `hero` (the full frame), `side` (a column, `side: left\|right`), `inset` (a card in a corner, `corner: tl\|tr\|bl\|br`), `bottom` (the lower part, the panel above), `hidden` (the speaker leaves). A string, or `{ mode, side, corner, size }`. The footage moves between a scene's mode and the previous footage scene's on the style's move ease over its standard duration, starting 0.15 s before the scene lands, and breathes a little while held. A story that names no frame and a brand that sets none leave the footage as the layout draws it |
| `overlay` | slot (text) | none | the safe box as a positioned area over the footage and the plates, for `text/lower-third` and `text/annotate`; it takes no room in the flow and is removed when it has no beat |
| `footage` | markup | the story's `footage` | not a slot: an `<img data-footage data-media data-keep>` the kit points at the frame of `story.footage` that the edit maps `t` to |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. |

Brand knobs: frame, panelFrame, side, corner, sideSize, insetSize, bottomSize, drift, face (set under `style.patterns["layouts/talking-full"]`: the default mode of a scene with and without a panel, the column's side and share of the width, the card's corner and size, the lower part's share of the height, how far a held box breathes, and the face box as `"x,y,w,h"` shares of the speaker's box when no matte says).

## Style variables consumed
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-font-display`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-font-text`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h2`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-tracking-display`
- `--mm-tracking-text`
- `--mm-weight-display`
- `--mm-weight-text`

## Legibility and rest notes
- The footage is an `<img data-media>` leaf, so the gate's pixel rules mask its content box; it carries `data-keep` because it is present from the scene's first frame, not an entrance.
- The frame shown is a function of the film's `t` alone: the edit's picture clips map `t` to a source frame, and the kit decodes it before pixels are read (`settle()`), so any seek order gives the same picture. Two talking-full scenes in a row continue the same footage across their cut.
- Headline and caption sit on canvas plates, so their contrast is the brand's ink on canvas whatever the footage shows; sizes come only from `--mm-size-*` roles at body size or above.
- The face-safe zone: the kit writes `--mm-face-x|y|w|h|cx|cy` (px of the frame, padded) on the scene, from the head in the person matte when `mm footage matte` has run, else a default centred on the format. The headline, the caption and the panel's tile are marked `data-face-safe`: the kit moves each, by its own `left` and `top`, to the nearest place inside the safe area clear of the face (in `inset` the whole card) and of the ones placed before it. The face is the shot's, so a caption that spans a cut moves to the new shot's place at the cut. W-FACE warns where text still covers the face.
- `--mm-speaker-x|y|w|h` and `--mm-panel-x|y|w|h` name the speaker's box now and the panel's region; the headline and caption keep to the panel's columns.
- `moves/punch` scales only the footage, about an anchor, on alternate clips; `moves/push-in` with `target: media` drifts it. The plates and their text stay put.

## Provenance
- robinebers/attentionmachine-skills, PolyForm Internal Use 1.0.0: a speaker full frame under text that changes only on cuts. Ideas only; no code taken.

## Known limits
- The footage covers the frame (`object-fit: cover`): a 9:16 recording in a 16x9 film loses its top and bottom. Frame the speaker for the format you ship.
- The headline is not fitted: keep it to two lines.
- The face box is the matte's head (a footage folder with no `face.json` gets a default box): graphics clear of it are placed by the kit (only when a matte gives the head or the story names a `frame`: with neither, the default box is a guess, so nothing moves), but a head far from where the default expects it, with no matte, can still be covered; run `mm footage matte`. When no place inside the safe area is clear (a tall plate on a tall head) the plate stays and W-FACE warns.
- A tile wider than the panel (a large size in a narrow column) overflows it: use a smaller `size` on `data/stat-tile`, or a mode with a wider panel.
- Drift scales the box by up to the brand's `drift` (3 % by default) about its centre, or away from the frame edge it stands on; `drift: 0` holds it still. `punch` after a frame mode scales the footage about the speaker's eye line inside its box.
