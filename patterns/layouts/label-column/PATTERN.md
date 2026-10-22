# layouts/label-column

## Purpose
An object (a product picture, or its layers) with up to six labels in a column beside it, each joined to a point on the object by a leader, like a teardown.

## Use when / Do not use when
**Use when**
- "what is inside" or "what it is made of": hardware, packaging, a device's parts, a product's features named on the product
- every label is a short name with an optional spec line (a figure with a unit, cited from a fact)
- with `emphasis/dimension` on the `measure` slot, for a size drawn under the object

**Do not use when**
- the labels are sentences: a label is a name and one spec line
- more than six parts (split the teardown over two scenes)
- there is no picture and no meaningful frame to point at

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading over the stage; carries `mm-fit`; removed from the flow when it has no beat |
| `object` | slot (asset) | none | the picture, shown at its own proportions as large as the object frame allows |
| `label-1` … `label-6` | slot (text) | none | the labels, top to bottom in the column; the beat's text is the name; a label without a beat is removed |
| `x`, `y` | number (beat params on a label) | 0.5 | the label's point, as shares of the picture (0 to 1 across, 0 to 1 down); of the object frame when there is no picture |
| `spec` | string (beat param on a label) | none | a spec line under the name (after it, wrapping, in 1x1, 4x5 and 16x9), in the mono face; cite its figure with the beat's `fact` |
| `measure` | slot (text) | none | a row under the object frame, as wide as it; made for `emphasis/dimension` with `instant: true` |
| `data-format` | html attribute | set by the kit | the object frame is 50 % of the stage's width, 46 % in 16x9, 40 % in 1x1 and 4x5 |

Give the labels in the order of their points, top to bottom, so no two leaders cross. Bring labels in with an entrance that does not move them (`entrances/fade` is the natural one): while a label is moved, scaled or blurred by its entrance, its dot and leader wait until it lands.

## Style variables consumed
- `--mm-safe`, `--mm-frame-w`, `--mm-density`, `--mm-align`, `--mm-headline-scale`
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h1` (headline); `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text`, `--mm-size-body` (names, at most), `--mm-safe` (the floor the labels never shrink under); `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` (index and spec)
- `--mm-color-ink` (names), `--mm-color-muted` (spec lines and leaders), `--mm-accent-text` (indices), `--mm-color-accent` (the dots and their halo, as an alpha of the accent)
- `--mm-space-0` to `--mm-space-5`, `--mm-radius-4`

## Legibility and rest notes
- The labels sit in the column's flow, spread over its height at a minimum spacing (`--mm-space-3`), so six labels never overlap whatever their length: a long label pushes the next one down instead of over it. The relaxation is the layout's own flow.
- The column is sized to its room: the stage is a size container, and the labels take the body size, or less when six labels of two and a half lines each would not fit the stage's height, down to the body floor and never under it (0.625 of the safe margin, which is at or above the gate's floor in every format). Six labels of a three-word name and a two-word spec ("Logic board assembly", "8 layers rated") stay inside the safe area in 9x16, 4x5, 1x1 and 16x9 on paper and nocturne. In tall formats nothing shrinks; in 1x1 and 16x9 the labels sit at or near the floor.
- Each label is an index (its slot number, 01 to 06, in the accent text colour), the name and an optional spec line, all level, at body size or above; nothing uses `data-micro`.
- Each point is placed from the label's `x` and `y` (typed `attr()`) on the picture's own box, found by CSS anchor positioning, so a point stays on the same feature of the picture in every format. The leader is a straight line from the point to just before the label's name, at the name's middle; its box collapses to nothing in the direction it does not go, so exactly one line is drawn.
- Dots and leaders are placed against the stage, never against a label, so the labels are not positioned; a label that its entrance is still moving hides its dot and leader until it lands, so no frame shows a leader in the wrong place.
- Accent only marks what is measured or pointed at (dots, indices); leaders are muted.
- Every box sits inside `--mm-safe`, a further `--mm-space-4` down from the top (the headline sits at the top, and a display face's ink rises above its line box) and 8 % of the half-width in from the sides as headroom for a camera move.

## Provenance
- lemomo-ai/lemo-opuscar, MIT: ideas only; no code taken. A teardown with every part named in a label column, labels relaxed apart so they never overlap, an anchor dot on each part with a leader to its label, an index, name and spec structure, and the accent kept for measured things; restated as a CSS layout where the column's flow is the relaxation and anchor positioning draws the leaders, in our own code.

## Known limits
- The relaxation is the column's flow: labels keep their order and spacing but do not move toward their points' heights, so leaders slope.
- Points are shares of the picture's box: a picture with a wide transparent margin puts them off the drawn object; crop the picture to the object.
- The `measure` row spans the object frame, which can be wider than a tall picture.
- Six labels with a long headline can be too tall for 1x1, 4x5 and 16x9 as the first scene (the hook's headline is a step larger); keep the headline to one line there.
- The fit assumes about two and a half lines a label: labels longer than that (a name and spec of more than about 45 characters in 1x1) can still run past the frame once the floor is reached; keep names to a few words.
- In 1x1 and 16x9 the labels are smaller than the brand's body size, even short ones, because the fit cannot see how long they are.
- Needs typed `attr()` and CSS anchor positioning (Chromium 133 and later, which the renderer is).
- The guard that hides a moving label's leader reads the inline `translate`, `scale`, `transform` and `filter` an entrance writes; an entrance that moves a label some other way leaves its leader drawn from the label's box until it lands.
