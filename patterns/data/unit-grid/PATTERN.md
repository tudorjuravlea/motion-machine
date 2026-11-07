# data/unit-grid

## Purpose
Says "N of M" as countable units: a 10x10 waffle of cells, a row of person glyphs, or a column of unit bars, lit one by one while the figure counts the units that have landed.

## Use when / Do not use when
Use when:
- "37 in 100", "7 in 10": a share a viewer should be able to count rather than read
- an impact or survey figure that is about people (`isotype`) or about a count of something in a fixed whole (`pictobar`)
- a waffle lit outward from a corner (`order: distance`) when reading order would imply a sequence the data does not have

Do not use when:
- a ratio with no natural whole (use `data/ring` or `data/fill-bar`)
- two shares to compare side by side (one grid per beat)
- a value above its whole: the grid is full and the figure shows the value

## Params
The figure is the beat's `value`, N; `of` is the whole, M. A waffle always has 100 cells (so N of `of` fills N / `of` of them); isotype and pictobar draw `of` units. The entrance lasts 2 s, in seconds rather than a style role; a beat's `params.dur` overrides it.

| name | type | default | meaning |
|---|---|---|---|
| `variant` | enum(waffle\|isotype\|pictobar) | waffle | waffle (10x10 cells), isotype (person glyphs) or pictobar (a column of unit bars filling from the bottom) |
| `of` | number | 0 | M, what the whole is: a waffle's 100 cells stand for it, isotype and pictobar draw this many units (2 to 20); 0 takes 100, 10 and 10 |
| `order` | enum(reading\|distance) | reading | waffle: reading lights cells left to right, top to bottom; distance lights outward from `corner` |
| `corner` | enum(tl\|tr\|bl\|br) | tl | waffle with order distance: the corner the lighting starts from |
| `tone` | enum(accent\|ink\|muted) | accent | the palette role of a lit unit |
| `fix` | number | 0 | decimal places in the figure |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text before the figure |
| `suffix` | string | (empty) | text after the figure |
| `size` | enum(display\|h1\|h2\|body\|caption) | h2 | the style size role of the figure; the grid scales with it |

Brand knobs: variant, order, corner, tone, of, format, size.

## Style variables consumed
- `--mm-size-<size>` for the role named by `size` (the grid scales with it, capped by the frame's height), `--mm-size-body` not used
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-line` for an unlit unit, `--mm-color-accent`, `--mm-color-ink` or `--mm-color-muted` for a lit one (by `tone`)
- `--mm-space-1`, `--mm-space-2`, `--mm-space-3`, `--mm-space-5`, `--mm-radius-1`; `--mm-align`; `--mm-frame-h` for the cap
- the module's `dur` (2 s, seconds); the unit's pop is an entrance share, not a spring

## Legibility and rest notes
- At p = 1 exactly N / `of` of the cells are lit in the stated order and the figure is N; a value that is not whole ends on a part unit, filled to the fraction from the bottom. Each unit pops by its own short share of the entrance, spread in order over the entrance, so the figure (the whole units landed times what one stands for, never past the value) climbs with the units.
- In a deck the rest is p = 1: every unit in place. Units are `aria-hidden` boxes and SVG glyphs with no text; the figure is DOM text at the size role. The grid is capped by the frame's height so it never crosses the safe area in 1x1 or 16x9 at a large `size`.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. A 10x10 waffle lighting N cells in order, a person isotype with N of M lit, and a pictobar filling bottom to top ("N in 100"), restated in our own CSS grid and SVG (a circle and a rounded rectangle, no icon font); the lighting orders (reading, distance from a corner) are ours.

## Known limits
- A waffle is always 10x10; `of` rescales the value rather than the grid.
- Isotype draws one glyph shape: a brand that wants another can ask for `glyph` as a knob later.
- Two compared grids take two beats in a layout with two slots.
- Up to 20 units in isotype and pictobar; more is a waffle.
