# data/org-chart

## Purpose
A tree draws itself: a root, a stem, a rail and branches that run down (or across), with child nodes springing in level by level; or a mind map, the root in the middle and spokes that radiate.

## Use when / Do not use when
**Use when**
- a team, a hierarchy, a breakdown ("Studio → Design, Build → …") or the parts of one idea
- an explainer beat where who-belongs-to-what is the point

**Do not use when**
- the parts are a straight sequence (use `layouts/list-reveal` or `data/timeline`) or one input fans to several and back (use `data/flow`)
- more than 16 nodes, more than four leaves across a level in a tall frame, or labels longer than about two short words (a node wraps inside the width of its leaves; a word wider than that is broken, and the headline-fit warning says so)

## Params
Grammar (shared with the other structure diagrams; `runtime/kit/diagram.js`): `|` between groups, a leading `>` per level deeper, `,` between siblings, or indented lines (two spaces a level). `Studio|>Design,Build|>>Brand|>Grow` is a root with three children, the second of which has one of its own (a node belongs to the last node one level up). A second root becomes a child of the first.

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | the tree, in the grammar above; one root, at most 16 nodes |
| `variant` | enum(chart\|tree\|mind-map) | chart | chart: top down, with a stem, a rail and branches; tree: left to right; mind-map: the root in the middle, spokes around it |
| `hero` | number | 1 | which node (1 = the first written, the root) takes the accent plate; 0 for none |
| `shape` | enum(disc\|rounded\|square) | rounded | the node shape, through the radius scale |
| `line` | number | 0.004 | stroke weight as a share of the frame's short side (0.001 to 0.02) |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role that carries the accent |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of the connecting lines |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: variant, shape, line, accent, edge, face.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk` (nodes), `--mm-color-accent`, `--mm-color-accentInk` or `--mm-color-ink`, `--mm-color-canvas` (the hero, by `accent`), `--mm-color-muted`, `--mm-color-line`, `--mm-color-ink` (the lines, by `edge`)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*` (by `face`), `--mm-size-body`
- `--mm-radius-0|2|4` (by `shape`), `--mm-space-2`, `--mm-space-3`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing roles `enter` and `move`, the spring role `ui` (the plates; labels never overshoot), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 the slot is the still diagram: every node in place, every line drawn, nothing mid-motion.
- Labels are DOM text at `--mm-size-body`, so every legibility check reads them; a node wraps inside its column and never breaks a word. Nodes never overlap (the mind map pushes boxes apart); lines are SVG.
- Phases run on the beat's own clock: the root over the first 12 %, then each level in an equal share: stem, rail and branches draw first, then its nodes spring in, a stagger across the siblings.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of an org chart (stem, rail, branches), a tree and a mind map; restated, no code taken.

## Known limits
- In 9x16 keep to four leaves across a chart level and one-word labels; a 16x9 frame takes six.
- The mind map places a spoke's children around it on a wider ring and then pushes colliding boxes apart: depth two at most, three children per spoke.
- A node may be as wide as the leaves under it (the root as wide as the chart); a leaf is one column wide, so long single words need a wide frame or the `tree` variant.
