# data/flow

## Purpose
One node fans out to several and they gather into one, on curves: the curves draw, a pulse travels from the source to each middle node, which rings as it lands, and pulses go on to the sink, which rings last.

## Use when / Do not use when
**Use when**
- a process or pipeline: one input, a few parallel steps, one outcome ("Brief → Design, Build, Test → Launch")
- an explainer beat about how work or data moves

**Do not use when**
- the steps are a straight sequence (use `layouts/list-reveal`)
- more than four parallel steps, or labels longer than two words (pills do not wrap)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | `source|middle,middle,…|sink`: one source, two to four middle nodes, one sink |

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk` (the nodes)
- `--mm-color-accent`, `--mm-color-accentInk` (the sink, the pulses, the rings)
- `--mm-color-line` (the curves)
- `--mm-font-text`, `--mm-font-display`, `--mm-size-body`, `--mm-weight-text`, `--mm-weight-display`
- `--mm-frame-w`, `--mm-frame-h`, `--mm-space-1`, `--mm-space-2`, `--mm-space-4`
- easing roles `enter` (the nodes) and `move` (the curves, the pulses)

## Legibility and rest notes
- At p = 1 the slot is the still diagram: nodes and drawn curves, no pulses and no rings.
- Nodes are DOM text, so every legibility check reads them; curves and pulses are SVG in the slot's own pixels.
- Phases run on the beat's own clock: nodes 0–25 %, curves 10–45 %, first hop 45–70 %, second hop 72–95 %; each ring lasts 12 % after its pulse lands.

## Provenance
- charlie947/motion-graphics-skills, MIT: pulses travelling along curves from one node to several to one, each node ringing on arrival (effect 15, "flowing paths"); restated. No code taken.

## Known limits
- Three columns only (source, middle, sink); no deeper graphs.
- Node pills do not wrap; in 9x16 keep labels to one short word.
