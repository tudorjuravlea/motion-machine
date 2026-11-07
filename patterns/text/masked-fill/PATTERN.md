# text/masked-fill

## Purpose
The words stand as a faint outline and a fill rises inside the letterforms, led by a thin accent edge, until they are solid.

## Use when / Do not use when
**Use when**
- a short headline that should feel poured or charged (a level, a progress, a launch word)
- a large size, where the rising edge reads inside the letters

**Do not use when**
- body copy or a long line: the outline stage is hard to read small
- the line carries a fact the viewer must read early (it is only an outline at first)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `fill` | enum(ink|accent) | `ink` | the colour that rises inside the letters |
| `edge` | boolean | `true` | a thin accent edge leads the fill |

## Style variables consumed
- `--mm-color-ink`
- `--mm-accent-text` (the edge, or the fill with `fill=accent`)
- `motion.durations.slow` (the default length; a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- At p = 1 the slot is its plain text, exactly as without the pattern; no clip or outline remains.
- The fill is a background clipped to the text and cloned per line box, so a slot that wraps fills every line at once.
- The fill level is linear in time, so the type never overshoots (SPEC §15).

## Provenance
- charlie947/motion-graphics-skills, MIT: the idea of a fill rising inside letterforms with an edge marker (effect 09, "masked type"); restated with `background-clip: text`. No code taken.

## Known limits
- The outline stage uses `-webkit-text-stroke`, which thickens a very light weight's look a little.
- Each line fills from its own bottom, not from the bottom of the whole slot.
