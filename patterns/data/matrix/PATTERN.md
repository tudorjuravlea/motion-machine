# data/matrix

## Purpose
A 2x2 with two axis labels: the axes and four cells arrive, then the items drop into their quadrants in reading order, and one quadrant can lead in the accent.

## Use when / Do not use when
**Use when**
- sorting a few things on two scales (impact against effort, urgency against value)
- a framework whose four boxes each have a name

**Do not use when**
- more than three items in a quadrant, or items with positions inside it (it is a grid, not a scatter)
- a comparison of two options (use `layouts/comparison`)

## Params
Grammar: four quadrants in reading order (top left, top right, bottom left, bottom right) separated by `|`; each is `Name>item,item` (up to three items; `>` and the items are optional).

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | the four quadrants, as above |
| `x` | string | (empty) | the label of the horizontal axis, under the grid on the right |
| `y` | string | (empty) | the label of the vertical axis, above the grid on the left |
| `hero` | number | 0 | which quadrant (1 to 4, reading order) takes the accent; 0 for none |
| `shape` | enum(disc\|rounded\|square) | rounded | the corner of a cell and a chip, through the radius scale |
| `line` | number | 0.004 | the weight of the axis arrows as a share of the frame's short side |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role of the axis arrows and the hero cell |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of plain lines (unused here; kept so a brand sets one value everywhere) |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: hero, shape, line, accent, face.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-accent` (or the `accent` role), `--mm-color-accentInk` or `--mm-color-canvas`, `--mm-color-ink` (items and axes, a tint for chips), `--mm-color-muted` (quadrant names)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*`, `--mm-size-body`
- `--mm-radius-0|2|4`, `--mm-space-1`, `--mm-space-2`, `--mm-space-3`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing roles `enter` and `move`, the spring role `ui` (the cells), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 every cell, name, chip and axis is in place; nothing moves.
- Names, items and axes are DOM text at `--mm-size-body`; items flow left to right inside a cell and wrap to the next line, so a long item wraps rather than overflowing, and a row of cells grows (with the stage) to hold the items it is given.
- Phases: axes over the first 20 %, cells in reading order from 8 %, items dropping in reading order from 35 %.
- Each axis is drawn on with its arrowhead riding the tip: the line stops half a head short of the tip, a head is never more than half the line drawn so far, and nothing is painted at 0, so a round cap leaves no dot.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a 2x2 with axis labels whose items drop into quadrants and one hero quadrant; restated, no code taken.

## Known limits
- Three items to a quadrant; more are dropped.
- The vertical axis label is set horizontally above the grid (a rotated label is not measured by the legibility checks).
