# emphasis/dimension

## Purpose
A measure is drawn across exactly what it measures, like a technical drawing: extension lines at the two ink edges of a text (its own, or the headline's above it), a line that grows from the middle out, ticks at its ends and the value centred on it.

## Use when / Do not use when
**Use when**
- a size, a distance or a range should read as a real length: a device width, a thickness, a reach
- under a headline, spanning it exactly (`for: headline` on the value's slot): the claim, then its size drawn across it
- a teardown or spec scene, on the `measure` slot of `layouts/label-column` with `for: object` (the picture's width)
- the value is a figure with a unit, cited from a story fact

**Do not use when**
- the value is not a length (use `data/counter` or `layouts/stat-hero`)
- the thing measured is no text and no slot of the scene: the line spans a text's ink or a slot's picture, never two points of a picture
- several measures in one scene: one is a statement, three are a drawing nobody reads

## Params
The slot's text is the value (`"71.5 mm"`); let the beat cite its fact. Give the beat `params.instant: true`, so the draw is the arrival: the drawing belongs to the slot from the moment it arrives, and the emphasis starts as the entrance ends. A beat with an entrance of its own brings the finished drawing in with it; the window then draws nothing again, and `mm.warnings` carries a note naming the slot. `axis` and `tone` style the slot, so give them among the beat's own params (they are written as `data-p-*`).

| name | type | default | meaning |
|---|---|---|---|
| `axis` | enum(x\|y) | `x` | `x`: the measure runs across the slot; `y`: it stands, with the halves above and below the value, and the slot is at least five body lines tall |
| `tone` | enum(accent\|ink\|muted) | `accent` | the palette role of the lines; the value is always ink |
| `for` | string | `""` | a slot of the same scene whose text the line spans, from its first glyph's ink to its last (a slot with no text: its picture, else its box); empty spans the slot's own text |

## Style variables consumed
- `--mm-color-accent` (or `--mm-color-ink`, `--mm-color-muted` by `tone`) for the lines, extension lines and ticks
- `--mm-color-ink` for the value
- `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` for the value, with tabular digits
- `--mm-space-0` (line weight), `--mm-space-3` (the gap either side of the value), `--mm-space-4` (tick size, least halves), `--mm-space-5` (the height of the extension lines and of the band under a value the line passes under), `--mm-size-body` (the standing measure's least height)
- set by this pattern in its own stylesheet, not read from the style: `--mm-dim-x0`, `--mm-dim-x1`, `--mm-dim-g0`, `--mm-dim-g1`, `--mm-dim-y`
- the emphasis window is the duration role `slow`, set by the kit, and the line's growth uses the style's `move` easing

## Legibility and rest notes
- At rest the drawing is the slot's own style: the two halves of the line are its `::before` and `::after`, placed from a measure taken once when the piece mounts, so the line never crosses the text, whatever its length.
- The measure: each scene is drawn at its rest, and the text the line spans (the slot's own, or the `for` slot's) is read glyph by glyph: each glyph's laid-out origin from layout offsets (no transform reads into it) and its ink either side of the origin from the font's outline bounds (`measureText`), so the ticks sit at the first and last glyph's ink, within a pixel, not at the text's box. The result goes into one rule per slot in `style[data-mm-dimension]`, a stylesheet of the pattern's own that no seek restores, and the page returns to the instant it showed; every seek, forward or back, draws the same line.
- When the value fits with a gap and two halves of at least `--mm-space-4`, it sits in a gap centred on the line (moved there by a left padding); otherwise (the line measures the value itself, the default) the line passes under it, unbroken, in a band of `--mm-space-5` the slot keeps below the value.
- The halves may reach past the slot's own box (a headline wider than the value's column); they overflow it, inside the measured text's span and so inside `--mm-safe`.
- The value is level, unscaled, in ink, in the mono face, on one line. Nothing is ever rotated: a standing measure keeps its value horizontal.
- Each half is a main line, an extension line across its outer end and a 45° tick there, all in one palette role: every pixel is that role, the ground, or a blend of the two (G-BRAND).
- The draw, on the beat's own clock: extension lines fade in over the first 20 % of the window, the line grows from the middle out between 10 % and 70 %, the ticks appear only once the line has arrived, and the value comes in between 60 % and 85 %. At the end of the window nothing is written, which is the finished drawing.

## Provenance
- lemomo-ai/lemo-opuscar, MIT: ideas only; no code taken. A dimension line on a product with extension lines, a line growing from its midpoint, 45° ticks and the value never upside down, and the rule that only measured things take the accent; restated for the DOM as the slot's own style, with the value kept level and the halves as flex items around it, in our own code.

## Known limits
- The measure is a text's ink or a slot's picture: it cannot point at two points of a picture. On `layouts/label-column` give the `measure` beat `for: object`, or the line spans the value alone.
- The measure is taken once at mount, with each scene at its rest: a text that changes width after its rest (an exit that scales it) is not followed.
- Glyph ink comes from the font's default glyphs: a feature the canvas cannot set (tabular figures in a font whose default figures are proportional) can move an end by a fraction of a glyph; the mono faces the value uses are unaffected.
- The drawing shows as soon as the slot arrives: without `instant: true` it comes in whole with the entrance and is not drawn (a note goes to `mm.warnings`).
- The value never wraps and is not bounded by the room: a long value ("1,250,000 kilometres per hour") runs past the frame in a narrow format. Keep it to a figure and a short unit.
- `axis` and `tone` inside `params.emphasis` are not seen by the stylesheet (the kit writes only the beat's own params onto the slot).
- W-CONTRAST may warn on the value: the gate measures the slot's whole box, and the line halves are inside it, in a role close to the value's contrast. The value itself sits on the ground.
- The value stays on one line; a value too wide for a gap and two least halves sends the line under it.
