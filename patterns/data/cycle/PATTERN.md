# data/cycle

## Purpose
Two to eight steps sit on a ring: the first lands, an arc with an arrow head draws to the next, which springs in as the arc arrives, and the last arc closes the ring back on the first.

## Use when / Do not use when
**Use when**
- a loop that repeats: plan, make, check, learn; a flywheel; a lifecycle
- one beat that says "and round again"

**Do not use when**
- the steps have an end (use `data/timeline` or `layouts/list-reveal`)
- more than six steps with labels longer than a word (the arcs between large nodes vanish)

## Params
Grammar: the steps in order, separated by `|`, `>` or `,` (`Plan|Make|Check|Learn`).

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | two to eight steps in order |
| `hero` | number | 0 | which node (1 = the first) takes the accent plate; 0 for none |
| `centre` | string | (empty) | a short label in the middle of the ring, settling in last |
| `shape` | enum(disc\|rounded\|square) | rounded | the node shape, through the radius scale |
| `line` | number | 0.004 | stroke weight (arcs and heads) as a share of the frame's short side |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role that carries the accent (arcs, heads, the hero) |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of plain lines (unused here; kept so a brand sets one value everywhere) |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: shape, line, accent, face.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk` (nodes), `--mm-color-accent`, `--mm-color-accentInk` or `--mm-color-ink`, `--mm-color-canvas` (by `accent`), `--mm-color-ink` (the centre label)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*`, `--mm-size-body`, `--mm-size-h2` (the centre label)
- `--mm-radius-0|2|4`, `--mm-space-2`, `--mm-space-3`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing roles `enter` and `move`, the spring role `ui` (the plates), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 the ring is whole: every node, every arc and arrow head in place; nothing moves.
- Nodes are DOM text at `--mm-size-body` on a circle sized to the stage; an arc starts and ends a little off each node's box, so a line never runs under text.
- Phases: the first node over 10 % of the beat, then each arc and the next node in an equal share (the arc over its first 75 %, the node over its last 45 %); the centre label over the last 20 %.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a cycle ring whose arc draws node to node with an arrow head; restated, no code taken.

## Known limits
- A circle, not an ellipse: the ring is as large as the shorter side of the stage allows, so a wide frame has room beside it.
- Node labels wrap at about a third of the stage's width; very long labels shrink the ring.
