# transitions/brush-wipe

## Purpose
Sweeps painted bands in brand colours across the frame to cover the outgoing scene, then drags them off to uncover the incoming one.

## Use when / Do not use when
**Narrative position:** topic, chapter break. **Mood:** hand-made, playful, energetic.

**Use when**
- a chapter break in an illustrated, hand-drawn or mascot-led piece
- a style that already wears sketchy or painted marks and wants a cut in the same hand
- a topic change that should feel like a page being repainted

**Do not use when**
- a calm or premium piece where a painted stroke reads as noise (use `color-dip` or `crossfade`)
- related scenes inside one chapter: a full repaint is a strong break
- the brand's accent is too close to its canvas for bands to read (use `pair: ink`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `pair` | enum(accent|ink|muted) | `accent` | the role the bands are painted in; every other band blends it with a second role |
| `bands` | number | 5 | how many bands, 3 to 8 |
| `tilt` | number | -6 | the bands' angle in degrees, -20 to 20 |
| `side` | enum(left|right) | `left` | the frame edge the bands sweep in from |

Duration role: `slow`. The sweep in fills the first half of the cut and the drag off the second; each band starts up to a fifth of a half after the first. Times run on the cut's linear clock, shaped by the style's `move` easing. Params arrive as `ctx.params`: the defaults under the scene's `cutParams` (`"cutParams": { "pair": "ink", "side": "right" }`).

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` (the bands, chosen by `pair`), blended with `--mm-color-ink` or `--mm-color-canvas` by `color-mix` for the alternate bands and the streaks
- the `move` easing and the duration roles (via the module's `dur`)

## Legibility and rest notes
The two scenes never share a frame: until the middle of the cut only the outgoing scene is drawn (the incoming one has opacity 0 and is hidden), and from the middle only the incoming one, so no type is drawn over another scene's type. At the middle the bands cover every point of the frame in any format and tilt (the bands overlap by more than their waves, and their ragged ends clear the frame), so the swap cannot be seen. The bands are an inline SVG marked `data-mm-overlay`, removed by the kit on every seek; at p = 1 nothing the pattern wrote remains. Every colour is a palette role or a `color-mix` of two roles. The raggedness comes from an integer hash, so the same instant always draws the same bands.

## Provenance
- JohnHeibel/ClaudeAnimationBase, MIT: algorithm adapted, re-implemented in our own code. What is restated from it: the staggered, tilted band wipe whose cut happens under full cover; five bands by default, each starting a little after its neighbour; the cover and uncover halves split at the middle of the cut, with each band's delay taken out of its own half; ragged band ends from an integer hash over nine points; waved top and bottom edges; fills alternating from band to band. Ours: the palette-role pairs and their blends, the streak, the tilt and side params, and the geometry as a closed form of the frame size.

## Known limits
- the paint is flat fills with one streak per band: no watercolour texture and no hatching
- the bands always run straight across; no curved or circular stroke
- `tilt` beyond 20 degrees is clamped
