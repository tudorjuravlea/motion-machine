# entrances/rise

## Purpose
Slides an element in a short distance along one side while it fades up.

## Use when / Do not use when
**Use when**
- a headline or a body line that should arrive with a little direction [H-INFO]
- the default arrival for text in a calm piece

**Do not use when**
- for many items at once: stagger them with `words` instead, or the cascade gets slow
- where the layout has no room to move: the start offset can cross the safe margin

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 40 | travel in px before the style multiplier |
| `side` | enum(up|down|left|right) | `up` | direction of travel: up rises from below, left slides in from the right |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` (via `style.motion.travel`) scales the distance
- duration role `standard`
- easing role `enter`

## Legibility and rest notes
At p = 1 translate is `none` and opacity is removed. The start offset is d px times `--mm-travel`; keep it smaller than the margin around the element (G-EDGE reads rests only, so a start offset past the frame edge is not flagged). Text never overshoots because the pattern rides the enter ease, not a spring.

## Provenance
original

## Known limits
- the distance is in px and does not scale with the format; a 9x16 frame may want a larger d
- `left` and `right` slide the whole block, so a full-width element appears to cross the frame
