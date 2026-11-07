# moves/punch

## Purpose
Hides jump cuts in talking-head footage: every other clip of the scene is framed closer, scaled about the speaker's eye line, so each cut reads as an edit.

## Use when / Do not use when
**Use when**
- a scene of `layouts/talking-full` holds several footage clips joined by jump cuts (`mm footage cut`) and nothing else covers the cuts
- a key line deserves a closer frame: put it in its own scene so it is that scene's second clip

**Do not use when**
- a picture, a card or the screen already covers the cut: punch only what nothing else hides
- to keep things moving: the punch is a step on a cut, never a drift (use `moves/push-in` with `target: media` for a drift)
- in a deck, or in a scene without footage: it does nothing there

## Params
| name | type | default | meaning |
|---|---|---|---|
| `scale` | number | 1.15 | the punched clip's scale, clamped to 1.05 to 1.3 |
| `x` | number | 50 | the anchor across the recording, in percent of its width (the eye line), wherever the frame crops it |
| `y` | number | 35 | the anchor down the recording, in percent of its height (the eye line), wherever the frame crops it |

Params arrive as `ctx.params` from the scene's `moveParams`.

## Style variables consumed
None: the move writes `transform` and `transform-origin` on the footage picture only. No colour, family, size or duration is read, and the style's `travel` does not scale it (the punch is a framing, not travel).

## Legibility and rest notes
- The scene's first clip (the clip on its first frame) stays as shot; the second is scaled by `scale` about (`x` %, `y` %) of the footage; the third is back as shot; and so on. Each scene starts again, so a section scene resets the alternation.
- The scale is one step for the whole clip, a function of which clip `t` is in (`ctx.footage`, from the kit), never animated, so any seek order gives the same frame and a rest inside a clip is still.
- Only `[data-footage]` moves: the camera, the headline and caption plates and their text stay where the layout put them, so G-EDGE, G-LEGIBLE and W-AMBIENT read the same text either side of a punch. The footage frame clips the enlarged picture.
- The anchor is a point of the recording: the footage covers its box (`object-fit: cover`, centred), so the point is mapped through that fit to px of the box (the recording's size comes from its `media.json`). It keeps its pixel position across a punched cut in every format, whatever the recording's shape (measured on an off-centre marker in 9x16, 4x5, 1x1 and 16x9: within 0.5 px).

## Provenance
- robinebers/attentionmachine-skills, PolyForm Internal Use 1.0.0: punching in on alternate takes about the eye line to hide jump cuts. Ideas only; no code taken.

## Known limits
- The anchor is a fixed point per scene; nothing finds the speaker's eyes. Measure the eye line on a still and give it as `x` and `y`.
- An anchor in a part of the recording the format crops away is held off-screen: the punch then reads as a plain scale. Keep the eye line inside what every format shows.
- Alternation counts footage clips inside the scene; a scene that starts within half a frame before a cut opens on the clip after it.
