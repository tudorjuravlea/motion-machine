# entrances/one-line

## Purpose
Draws a mark from its SVG as one continuous line: the pen never lifts, slows on curves, and draws a little wider where it is slow.

## Use when / Do not use when
**Use when**
- a brand reveal: the logo outline, a product silhouette or a signature drawn in one stroke, 4 to 15 s
- a founder story or a timeline told as one line that never breaks
- a calm, crafted opening that should feel drawn by hand

**Do not use when**
- the mark is a filled shape whose look is its fill: one-line draws outlines, never fills (draw the mark's outline paths, or show the picture itself)
- the mark has many small separate parts: every part needs a bridge, and many bridges read as scribble
- a quick beat: at the shipped `slow` (1 s) the line races; give the beat `params.dur` of 4 s or more

## Params
| name | type | default | meaning |
|---|---|---|---|
| `curves` | number | 1.5 | how much the pen slows on curves, 0 (an even pace) to 3 |
| `weight` | number | 1 | the line's weight against the style's pen, 0.5 to 3 |
| `fit` | number | 0.86 | how much of the slot the mark fills, 0.4 to 1, at its own proportions |
| `follow` | number | 0 | a camera that follows the nib with a little lag and is back on the whole mark at the end, 0 (off) to 1 |
| `boil` | boolean | false | the finished line shivers on the kit's boil clock (never in a deck) |
| `whole` | boolean | false | a planning view: the whole line at once, its bridges in the accent, to check the order before rendering |

The beat's `asset` is the mark: an SVG under the piece's `assets/`. Its `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and `polygon` elements are read in document order (every path command, arcs included); `defs`, clip paths, masks and symbols are skipped. Duration role: `slow`; give the beat a `params.dur` that suits the mark. The pen lands and lifts softly (a half-cosine through the entrance) and in between keeps the pace the line's curvature sets.

## Style variables consumed
- `--mm-color-ink` (the line)
- `--mm-color-accent` (the bridges, in the `whole` planning view only)
- `--mm-space-1` (the pen: 1.25 of it, times `weight`)
- `motion.boil` through `ctx.boil()` when `boil` is on; a deck is always still
- duration role `slow`

## Legibility and rest notes
- At p = 1 the whole line is drawn: every part of the mark, joined by its bridges, at its final widths, and nothing moves (unless `boil` asks for a shiver; never in a deck).
- One line: the first part is drawn from its start, then always the nearest free end of what is left (an open part from either end, a closed one from its nearest point, run the way the pen is already going). Each bridge leaves and arrives along the line's own direction (handles 0.42 of the gap), so nothing turns sharply.
- The pace: each step of the line is weighted by how sharply it turns, the weights are smoothed over about 25 samples so the speed never jumps, and the times are their running sum, always moving forward.
- The width runs from 0.88 to 1.18 of the weight, fast to slow, and never draws under 1.5 px on screen, whatever the slot's scale (a camera pull-back keeps the line's weight).
- The line is one filled shape whose width follows the pace, painted once, so its edge is a single antialiased outline with no seams across the stroke where the width changes.
- The drawing fits inside the slot at `fit` and is clipped to it, so the line (and a `follow` camera's zoom) never leaves the slot; the camera is eased to the whole mark by the end.
- The line is ink, a palette role, so G-BRAND holds. No text is drawn.
- The SVG is fetched once per page and kept by its address; the first seek that needs it draws once it has arrived, inside the kit's settle, so every rendered frame is the same in either seek order.

## Provenance
- lemomo-ai/lemo-opuscar, MIT: ideas only (one continuous inked line through every chapter of a drawing, joined by tangent bridges; the pen slowing on curves with smoothed timing; width from the pen's speed; a minimum width on screen; a camera that follows the nib with lag; a whole-path view to plan the order); no code taken. The ordering, the timing and width formulas and the numbers are our own; the arc conversion follows the SVG specification.

## Known limits
- `<use>` references, CSS transforms in a `style` and nested `<svg>` elements are not drawn; the page names them in `mm.warnings`. Flatten them in the drawing tool first. (`transform` attributes on elements and groups are applied.)
- Outlines only: fills and strokes' own widths and colours in the SVG are ignored; the line is the style's ink at the style's pen.
- The order is nearest-first, not a planned Euler path: a mark whose parts are far apart gets long bridges. Check with `whole: true` and reorder the parts in the SVG.
- No holds or pools of ink at stops, and no accent stretch: the line keeps one colour.
