# entrances/typewriter

## Purpose
Types a line out one character at a time with a caret at the typing position.

## Use when / Do not use when
**Use when**
- a command, a query or a line that is being "written" as the viewer watches [H-INFO]
- a mono-set line in a technical piece

**Do not use when**
- for a headline you want read at a glance: the end of the line is not visible until the end
- with a long line and a short duration: the rate gets too fast to read (0.3 s per word, W-READ)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `caret` | boolean | true | show the caret while typing |
| `blinks` | number | 0 | caret blinks across the whole entrance; 0 keeps it solid |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `slow` is the whole typing time
- `--mm-color-accent`, `--mm-space-0` for the caret
- no spring

## Legibility and rest notes
At the end of the entrance the plain text is restored and the caret is gone, so nothing is mid-motion at rest. The untyped remainder stays in the flow, hidden, so line breaks never move. Typing is linear in time so the rate is steady.
- When the slot paints its own box (a fill or a border, as a tile or a plate does), the slot's own opacity follows the first character, so the box fades in with its first text and never shows empty; a plain text slot gets no opacity of its own.

## Provenance
original

## Known limits
- the caret is a function of p, so it cannot blink after the text is complete
- surrogate pairs and combining marks type as one character each only when they are one code point
- the pace is characters over the entrance duration; give a long line a longer `dur`
