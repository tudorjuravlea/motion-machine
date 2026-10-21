# entrances/sketch

## Purpose
Draws the slot as a wireframe: a pen goes round its box in one steady stroke and over itself, the label arrives as the pen closes, and at rest the line shivers like a hand-drawn doodle.

## Use when / Do not use when
**Use when**
- an idea before it is a product: a screen, a card, a button or a field shown as a sketch, then inked into the real thing with `transitions/sketch-to-ink`
- an explainer that blocks out a layout before filling it
- a process story: plan, sketch, build

**Do not use when**
- the slot is the finished product: the sketch hides the slot's own fill, border and pictures while it is drawn
- body copy: the pen frames a slot, it does not underline a paragraph (use `emphasis/marker-circle` or `text/highlight` for words)
- more than about six sketched slots in a scene: the eye cannot follow that many pens

## Params
| name | type | default | meaning |
|---|---|---|---|
| `shape` | enum(box|pill|circle|line) | `box` | box follows the slot's own corner radius; pill rounds the ends; circle the inscribed ellipse; line a rule along the bottom (a field, a divider) |
| `roughness` | number | 1 | how far the pen wanders, 0 (a ruled line) to 2 (a quick scrawl) |

Duration role: `slow` (a beat's `params.dur` overrides it). The outline is drawn over the first 75 % of the entrance with a pen's easing (steady travel, soft ends), both passes on one normalised length; the label fades in from half-way.

## Style variables consumed
- `--mm-color-ink` (the pen and, while the slot is a sketch, its text)
- `--mm-space-1` (the pen's width: 0.75 of it)
- `motion.boil` through `ctx.boil()`: seconds each shiver frame holds, 0.4 by default, 0 for a still line; a deck is always still
- duration role `slow`

## Legibility and rest notes
- Where the pen goes: the outline sits as far inside the slot as the pen can wander (its reach) plus half its width, in the slot's padding box. With less padding than that, a slot with words of its own keeps the pen off them: inside with a steadier hand while the padding holds at least a pen's width, else round the words just outside the slot. An empty slot (or one whose words belong to a slot inside it) steadies the hand until the pen fits inside. The pen never strikes the slot's text.
- The label stays in the brand face, in ink, at full strength at rest; only its colour fades while it arrives (`--mm-sketch-text`), so W-CONTRAST and G-LEGIBLE measure real type.
- At rest the outline is whole and the stroke is one of three boil frames chosen from the piece's time (`ctx.boil()`), the same for every stroke and the same at every seek (G-DETERMINISM, G-TIME). In a deck every rest shows frame 0.
- The wireframe holds over any layout: the slot's background, border, shadow and mask, its children's fills and plates, and its `[data-media]` pictures are off, by `!important`, since a layout may style a slot's insides at any specificity.
- Each draw first removes the pattern's own previous outline, so a slot that holds another slot (whose markup the kit does not reset) still shows one outline at every seek.
- The stroke is seeded from the slot (`ctx.random`), so a slot is drawn the same way in every format and every render.

## Provenance
- danielwh2/drawably, MIT: the pen stroke (dense samples, seeded jitter, midpoint quadratics, a double pass at 1.4×, three boil frames over one base, 0.4 s a frame) restated in `runtime/kit/rough.js`; its CSS clock replaced by the kit's time (`ctx.boil`), its controls and React wrappers not taken.

## Known limits
- One outline per slot. A slot made of several parts (a field with a label beside it) is sketched as one box; give each part its own slot.
- A slot with words and almost no padding is drawn round its words just outside the slot; near the frame's edge that outline can reach the safe margin.
- A text-only slot's own box includes the pen, so W-CONTRAST can measure the line as the text's background; a slot with padding avoids it.
- The slot's own fill and pictures are hidden for the whole scene, not only while drawing.
