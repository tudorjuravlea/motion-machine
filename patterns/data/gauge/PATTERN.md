# data/gauge

## Purpose
Shows one value (or up to four) on a dial: an arc, a half dial, a needle that swings and settles, a clock hand, concentric rings or bars, or a linear meter, with the readout counting in step.

## Use when / Do not use when
Use when:
- one completion, score or level, where a dial says "how far along" faster than a bar
- a needle (`needle`) when the figure is a reading against a scale, a clock (`clock`) when it is a share of a day or a turn
- rings or radial-bars for up to three or four named values of the same whole (each with its legend row)
- a meter when the frame is wide and short and min and max matter

Do not use when:
- values that are not shares of one scale (rings and radial-bars share `min` and `max`)
- more than four series
- a figure whose unit label is longer than the readout (the dial is seven times the readout wide)

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`), or from `values` for rings and radial-bars. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| `variant` | enum(arc\|semi\|needle\|clock\|rings\|radial-bars\|meter) | arc | the dial: arc (270 degrees), semi (half), needle (ticks and a swinging needle), clock (a sweeping hand), rings (up to three concentric), radial-bars (up to four concentric bars), meter (a linear track with min and max ticks and a notch) |
| `min` | number | 0 | the value at the start of the dial |
| `max` | number | 100 | the value at the end of the dial |
| `values` | string | (empty) | rings and radial-bars: a comma list of up to three (four) values, each on its own ring; empty uses the beat's value alone |
| `labels` | string | (empty) | rings and radial-bars: a comma list of names, one per value, written in the legend |
| `tone` | enum(accent\|ink\|muted) | accent | the palette role that carries the value (the first ring); further rings take the other roles in turn |
| `thick` | number | 0 | stroke weight in viewBox units (the dial is 100 wide, so a share of its width); 0 takes the variant's own |
| `ticks` | number | 0 | needle and clock: how many tick marks; 0 takes the variant's own (11 and 12) |
| `settle` | number | 0.04 | needle: the wobble after the swing, as a share of the dial's sweep; 0 stops it dead on the value |
| `fix` | number | 0 | decimal places in the readout |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text before the readout |
| `suffix` | string | % | text after the readout |
| `size` | enum(display\|h1\|h2\|body\|caption) | h2 | the style size role of the readout; the dial is seven times it wide |

Brand knobs: variant, tone, thick, ticks, settle, format, size.

## Style variables consumed
- `--mm-size-<size>` for the role named by `size` (the dial is seven times it wide, a meter the safe width), `--mm-size-body` for legend rows and the meter's min and max
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-line` (track), `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` (the series roles, by `tone`), an alpha of the series role for the clock's wedge
- `--mm-space-3`, `--mm-space-4`, `--mm-radius-4` for gaps and swatches; `--mm-frame-w`, `--mm-safe` for the meter's width
- duration role `slow` (the module's `dur`) and the style's `move` easing (the needle's swing), applied by `ctx.ease`; no spring role

## Legibility and rest notes
- At p = 1 every stroke covers exactly (value - min) / (max - min) of its sweep (arc 270 degrees, semi 180, rings 360, radial-bars 270 opening from twelve o'clock), the needle points at the value (the wobble is zero), the clock's hand and wedge end at the value, and the readout is the value. A zero-length arc is hidden, never drawn as a dot. p is clamped.
- The needle swings on the style's `move` ease over the first 70 % of the entrance (the ticks it has passed light up), then settles with a damped wobble of `settle` times the dial's sweep; the readout reaches the value when the needle first does. `settle: 0` stops it dead.
- Every word is DOM text at or above the body size (names and legend rows, min and max); strokes are SVG built from numbers only. `rings` takes up to three values and `radial-bars` four; extra values are dropped. The roles are the hero (`tone`) first, then the other two in the order ink, muted, accent.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. Gauge families (semicircle and full arc by dash offset, a swinging needle, a clock-face sweep, concentric rings, radial bars, a linear meter with min and max ticks and a notch) restated in our own SVG and maths; the centre number counts with the arc through the kit's count().

## Known limits
- One whole per gauge: rings share `min` and `max`; a value outside the range is clamped to the dial's end.
- No gradient stroke and no zones (red, amber, green): colour is the series role, so a status needs a second pattern or the story's words.
- The dial is a fixed multiple of the readout's size role: a long prefix or suffix may crowd the centre of an `arc`; use `size` to scale both.
- A legend row's name is one line: keep names to a word or two.
