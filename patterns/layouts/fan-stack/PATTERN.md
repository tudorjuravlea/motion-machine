# layouts/fan-stack

## Purpose
A headline over a stack of up to four cards, each later card in front of and below the one before, so every card's label stays readable in the strip it leaves showing, like a pile of notifications.

## Use when / Do not use when
**Use when**
- things arriving one after another (messages, alerts, tasks) where the newest is the point
- paired with a springy entrance (`entrances/pop` or `drop`) so each card settles on its own

**Do not use when**
- the earlier cards carry more than one short line (only their top strip shows)
- the items are equal in weight (use `layouts/list-reveal`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading over the stack; carries `mm-fit` |
| `card-1` … `card-3` | slot (text) | none | the earlier cards, one line each (ellipsis beyond), 88 %, 92 % and 96 % wide |
| `card-4` | slot (text) | none | the front card: full width, display face, an accent top edge, may wrap; `data-focus="lead"` |
| `data-format` | html attribute | set by the kit | 16x9: the stack is 62 % of the safe width, centred |
| `align` | enum(left|center) | the brand's `composition.align` | the headline's alignment; a beat param on any slot (`data-p-align`) or `data-align` on the root overrides it |

## Style variables consumed
- `--mm-align`
- `--mm-color-accent`
- `--mm-color-ink`
- `--mm-color-surface`
- `--mm-color-surfaceInk`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h1`
- `--mm-space-1`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- Each card overlaps the one behind it by less than that card's height minus its label strip, so no label is covered.
- Earlier cards step back in width, not scale, so an entrance that writes scale never fights the layout.
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right; an empty card leaves the stack.

## Provenance
- charlie947/motion-graphics-skills, MIT: the spring stack of cards with per-card settling (effect 07, "spring stack"); restated as a layout whose springs come from the entrances. No code taken.

## Known limits
- Four cards; a longer feed needs a second scene.
- The settle is the entrance's spring, the same for every card; per-card damping is not a param.
