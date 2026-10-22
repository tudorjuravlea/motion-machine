# layouts/talking-full

## Purpose
The story's footage (a talking-head recording cut by `mm footage cut`) fills the frame, with an optional headline in the top band and a caption low in the frame.

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
| `footage` | markup | the story's `footage` | not a slot: an `<img data-footage data-media data-keep>` the kit points at the frame of `story.footage` that the edit maps `t` to |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9. |

## Style variables consumed
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-font-display`
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
- `moves/punch` scales only the footage, about an anchor, on alternate clips; `moves/push-in` with `target: media` drifts it. The plates and their text stay put.

## Provenance
- robinebers/attentionmachine-skills, PolyForm Internal Use 1.0.0: a speaker full frame under text that changes only on cuts. Ideas only; no code taken.

## Known limits
- The footage covers the frame (`object-fit: cover`): a 9:16 recording in a 16x9 film loses its top and bottom. Frame the speaker for the format you ship.
- The headline is not fitted: keep it to two lines.
- Nothing measures the speaker's face: the headline band can cover a tall head. Move it, shorten it, or drop it for that clip.
