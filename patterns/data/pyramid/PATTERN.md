# data/pyramid

## Purpose
Two to six levels stack up (or down) one after another as a pyramid of bands, a funnel of bands, or slabs in shallow perspective with labels at the side.

## Use when / Do not use when
**Use when**
- a hierarchy of needs or layers where each level rests on the one below (purpose, product, process, people)
- stages that narrow (`funnel-up`) when the story names the stages, not their sizes
- a stack of layers (interface, logic, data) shown as slabs

**Do not use when**
- stages with values that should set the width (use `data/funnel`)
- more than six levels or labels longer than two words in the upper bands of a pyramid

## Params
Grammar: the levels written top to bottom, separated by `|`, `>` or `,`.

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | two to six levels, top to bottom |
| `variant` | enum(pyramid\|funnel-up\|layers) | pyramid | pyramid: bands, apex up; funnel-up: bands, apex down (a funnel that fills from its neck); layers: slabs in shallow perspective, each a little off the one above |
| `order` | enum(bottom-up\|top-down) | bottom-up | which level arrives first; the others follow in turn |
| `hero` | number | 1 | which level (1 = the first written, the top) takes the accent; 0 for none |
| `shape` | enum(disc\|rounded\|square) | rounded | the corner of a band, through the radius scale |
| `line` | number | 0.004 | the outline weight of slabs and leaders as a share of the frame's short side |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role that carries the accent |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of leaders and slab outlines |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: variant, order, shape, line, accent, edge, face.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk` (bands, slab tops), `--mm-color-accent` (or the `accent` role), `--mm-color-accentInk` or `--mm-color-canvas`, `--mm-color-ink` (slab sides as a tint, and the layers' labels), `--mm-color-line|muted` (outlines, by `edge`)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*`, `--mm-size-body`
- `--mm-radius-0|2|4`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing role `enter` and `move`, the spring role `ui` (the bands), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 every level is in place at full scale and opacity; nothing moves.
- Band labels are DOM text centred in the band, wrapped to 80 % of its width at mid height. The layers' labels sit beside their slab at body size.
- Phases: each level takes 40 % of the beat, one after the other over 60 %; its label follows its shape.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a pyramid, a funnel and layered slabs in perspective that build level by level; restated, no code taken.

## Known limits
- The bands are equal in height: a level's size says nothing; data that sizes the stages belongs in `data/funnel`.
- The apex band is a truncated trapezoid (30 % of the base), so a long label in the top level wraps early.
- `layers` draws three-dimensional slabs flat (an oblique projection), not a 3D scene.
