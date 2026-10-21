# entrances/scatter-settle

## Purpose
Starts the letters or words of a line at seeded random positions and angles and settles them into place together.

## Use when / Do not use when
**Use when**
- a playful or kinetic title where order emerges from noise [H-INFO]
- an opening that wants texture, once per piece

**Do not use when**
- for a line that must be legible during the move: pieces cross each other
- for body copy or any line with more than a dozen words

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 90 | scatter radius in px before the style multiplier |
| `turn` | number | 14 | largest start angle in degrees, either way |
| `unit` | enum(char|word) | `char` | what scatters: letters or whole words |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the scatter radius
- duration role `slow`
- spring role `type` shapes each piece
- the seeded `random()` the kit passes in `ctx` (selector-seeded)

## Legibility and rest notes
At the end of the entrance the plain text is restored, so kerning and the DOM are those of the layout. The scatter is a fixed layout per slot: the same slot scatters the same way on every load and every seek (G-DETERMINISM). Opacity never overshoots.
- When the slot paints its own box (a fill or a border, as a tile or a plate does), the slot's own opacity follows the first piece, so the box fades in with its first text and never shows empty; a plain text slot gets no opacity of its own.

## Provenance
original

## Known limits
- the scatter is seeded by the slot's selector, so two slots with the same text scatter differently but each always the same
- letters lose kerning while moving; it returns at rest
