# entrances/draw

## Purpose
Reveals a line along the x axis by growing it from one edge, so a rule or a stroke draws itself.

## Use when / Do not use when
**Use when**
- a divider, an underline or a bar that should be drawn rather than shown [H-INFO]
- a reveal of a line of text from one edge when a wipe is too heavy

**Do not use when**
- on text you want to stay unsquashed while it grows: use `mask-reveal`, which clips instead of scaling
- on anything with a border radius that must stay round: scale stretches it

## Params
| name | type | default | meaning |
|---|---|---|---|
| `origin` | enum(left|center|right) | `left` | the edge the line grows from |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `slow`
- easing role `enter`
- `--mm-color-accent`, `--mm-space-1`, `--mm-radius-1` for the rule on an empty slot

## Legibility and rest notes
At p = 1 scale is `none`, so the line is exactly its laid-out width. Scale is clamped to 0..1 and never overshoots.

## Provenance
original

## Known limits
- scaling squashes text glyphs horizontally while it grows
- only the x axis; a vertical draw is not provided
- the empty-slot rule is full width; give the slot a width in a layout for a short one
