# text/handwrite

## Purpose
The line is written: each line's outline is traced in turn, then the fill comes in.

## Use when / Do not use when
**Use when**
- an opener word ("hello") or a signature line should feel made by hand
- one short line in a large size, where the tracing reads

**Do not use when**
- the text is long body copy (the tracing takes as long as the entrance)
- the line carries a fact the viewer must read early (it is unfilled until 75 %)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `stroke` | enum(ink|accent) | `ink` | the colour of the tracing stroke |

## Style variables consumed
- `--mm-color-ink`
- `--mm-color-accent`
- `--mm-space-1` (the stroke width)
- `motion.easings.enter` (each line's trace)
- `motion.durations.slow` (the default length; a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- At p = 1 the slot is its plain text, exactly as without the pattern; nothing of the drawing remains.
- Lines are found from the laid-out words, so a slot that wraps traces every line in reading order.
- The traced lines inherit the slot's own face, size and tracking.

## Provenance
original

## Known limits
- The trace follows glyph outlines, not a pen's single stroke: in a script face it reads as handwriting, in a sans as drawing.
- The dash length is estimated from the line's advance (three times its length), so the trace may finish a little before or after its share of the time.
