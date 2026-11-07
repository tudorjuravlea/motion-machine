# entrances/fade

## Purpose
Brings an element in by opacity alone, the quietest arrival there is.

## Use when / Do not use when
**Use when**
- a secondary line, a caption or a source note that should not compete with the headline [H-INFO]
- the second of two arrivals, after a bolder first one [H-STILL]

**Do not use when**
- as the only entrance in a piece: W-FADE-ONLY warns above 70 % and a piece in which every entrance is a fade is flagged [SPEC section 15]
- for a hero line that should land with weight (use `punch`, `slam` or `rise`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) | | | This pattern takes no params. |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `standard` (`--mm-dur-standard`)
- easing role `enter` (`--mm-ease-enter`)

## Legibility and rest notes
At p = 1 the inline opacity is removed, so the element shows exactly what the layout styled and nothing is left mid-motion. Opacity never overshoots. Text size, position and colour are untouched, so every legibility floor holds as laid out.

## Provenance
original

## Known limits
- carries no direction or weight, so a piece of nothing but fades reads flat
- does not hide overlap: a faded-in element still counts as present for G-OVERLAP at rests
