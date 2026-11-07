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
| `pen` | enum(plain|pencil|marker|charcoal) | `plain` | the voice of the line: plain goes over itself in one width; a preset drifts along its length and goes over itself as a thinner, fainter ghost (pencil thin, marker wide and steady, charcoal with a wilder ghost and line ends that run on) |
| `fill` | enum(none|wash|hatch) | `none` | what colours the outline in: none; a watercolour wash that bleeds a little past the line in a few fainter layers; or a hatch of drawn lines clipped to it. It sits under the label |
| `tint` | enum(accent|muted|line|surface|ink) | `accent` | the palette role of the fill |

Duration role: `slow` (a beat's `params.dur` overrides it). The outline is drawn over the first 75 % of the entrance with a pen's easing (steady travel, soft ends), both passes on one normalised length; the label fades in from half-way. A preset draws its line over the first half of that stroke and its ghost over the second. A wash fades in and a hatch's lines go on one after another from 45 % of the entrance to its end.

The presets (`PENS` in `runtime/kit/rough.js`): pencil is 0.8 of the plain width, its ghost 0.7 as wide at 0.45 strength and a little calmer than the line; marker is 2.2 wide and steadier, its ghost 0.65 wide at 0.35; charcoal is 1.4 wide, its ghost 0.65 wide at 0.45 and 1.35 times as wild, and an open stroke (`shape: line`) runs on 2.5 pen half-widths past each end.

## Style variables consumed
- `--mm-color-ink` (the pen and, while the slot is a sketch, its text)
- `--mm-space-1` (the pen's width: 0.75 of it, times a preset's width; a hatch line is 0.375 of it)
- `--mm-color-accent`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-surface` or `--mm-color-ink` (the fill, by `tint`)
- `motion.boil` through `ctx.boil()`: seconds each shiver frame holds, 0.4 by default, 0 for a still line; a deck is always still
- duration role `slow`

## Legibility and rest notes
- Where the pen goes: the outline sits as far inside the slot as the pen can wander (its reach) plus half its width, in the slot's padding box. With less padding than that, a slot with words of its own keeps the pen off them: inside with a steadier hand while the padding holds at least a pen's width, else round the words just outside the slot. An empty slot (or one whose words belong to a slot inside it) steadies the hand until the pen fits inside. The pen never strikes the slot's text.
- The label stays in the brand face, in ink, at full strength at rest; only its colour fades while it arrives (`--mm-sketch-text`), so W-CONTRAST and G-LEGIBLE measure real type.
- At rest the outline is whole and the stroke is one of three boil frames chosen from the piece's time (`ctx.boil()`), the same for every stroke and the same at every seek (G-DETERMINISM, G-TIME). In a deck every rest shows frame 0.
- The wireframe holds over any layout: the slot's background, border, shadow and mask, its children's fills and plates, and its `[data-media]` pictures are off, by `!important`, since a layout may style a slot's insides at any specificity.
- Each draw first removes the pattern's own previous outline, so a slot that holds another slot (whose markup the kit does not reset) still shows one outline at every seek.
- The stroke is seeded from the slot (`ctx.random`), so a slot is drawn the same way in every format and every render.
- Without `pen` and `fill` the sketch is the plain stroke it has always been: one path, no fill layer.
- A fill is one palette role at an alpha over the ground (wash layers at 0.09 and fainter outward, about 0.25 where all four lie, the outermost with a faint rim at 0.3; hatch lines at 0.6), so every pixel is a blend of two roles (three where the ink line crosses it) and G-BRAND holds. It lives in its own layer under the slot's words (`z-index: -1` in an isolated slot), so the label's ink is never tinted; at rest it is whole. A hatch keeps clear of the words: its clip has a hole round them (their lines' box, padded by a third of a line), so no line sits behind the label and its contrast is the slot's own. Through `transitions/sketch-to-ink` it fades as the finished slot hands over.
- With `emphasis/wash-bloom` as the beat's emphasis, once the pen has closed the fill layer also holds that bloom's whole wash (in the role its `bloom` param names, read from the beat's own params): the emphasis opens it during its window and the sketch keeps it after.
- A preset's ghost is ink at its strength, a blend of ink and the ground. With a preset, `roughness 0` still lies exactly on the outline, and inking also eases charcoal's run-on to 0, so the line lands on the finished edge.

## Provenance
- danielwh2/drawably, MIT: the pen stroke (dense samples, seeded jitter, midpoint quadratics, a double pass at 1.4×, three boil frames over one base, 0.4 s a frame) restated in `runtime/kit/rough.js`; its CSS clock replaced by the kit's time (`ctx.boil`), its controls and React wrappers not taken.
- feitangyuan/doodle-anim, MIT: ideas only, restated in `runtime/kit/rough.js` (the drift along the length, the thinner and fainter ghost pass, the run-on past an open stroke's ends, the three pen voices, the layered wash and the clipped hatch); no code taken, the numbers our own.

## Known limits
- One outline per slot. A slot made of several parts (a field with a label beside it) is sketched as one box; give each part its own slot.
- A slot with words and almost no padding is drawn round its words just outside the slot; near the frame's edge that outline can reach the safe margin.
- A text-only slot's own box includes the pen, so W-CONTRAST can measure the line as the text's background; a slot with padding avoids it.
- The slot's own fill and pictures are hidden for the whole scene, not only while drawing.
- A `line` shape has no inside: `fill` draws nothing on it.
- A wash in a role close to the ground (`surface` on most brands) barely shows; `accent` or `muted` read best.
