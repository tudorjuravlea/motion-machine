# data/timeline

## Purpose
A track draws and nodes spring on in order with their labels: a roadmap of dots, milestones as date pills, a gantt of bars on a time axis, or a stepper of numbered steps.

## Use when / Do not use when
**Use when**
- a plan, a history or a process in order: quarters, launch dates, phases, steps
- a schedule where the overlap of work matters (`gantt`)

**Do not use when**
- a loop (use `data/cycle`) or a branching process (use `data/flow` or `data/org-chart`)
- more than six items (gantt seven)

## Params
Grammar: items separated by `|`; inside an item `>` splits its fields. `roadmap` and `milestones`: `when>what` (`Q1>Research`; one field alone is the label). `gantt`: `name>start-end` in the axis's own numbers (`Build>2-7`). `stepper`: `title>detail`.

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | the items, in the grammar above |
| `variant` | enum(roadmap\|milestones\|gantt\|stepper) | roadmap | roadmap: dots on a track, labels alternating either side; milestones: date pills on the track; gantt: bars on a time axis; stepper: numbered steps down the frame |
| `orient` | enum(auto\|h\|v) | auto | roadmap and milestones: the track across (h) or down (v); auto is down in a tall frame (9x16, 4x5) |
| `hero` | number | 0 | which item (1 = the first) takes the accent plate or a larger dot; 0 for none (gantt: every bar is accent; stepper: every number) |
| `unit` | string | (empty) | gantt: what the axis counts ("Week"), at the left of the axis |
| `shape` | enum(disc\|rounded\|square) | rounded | the corner of a pill, number or bar, through the radius scale |
| `line` | number | 0.004 | the track and axis weight as a share of the frame's short side (dots grow with it) |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role that carries the accent (dots, bars, hero, numbers) |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of the track and axis |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: variant, orient, shape, line, accent, edge, face.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk` (pills), `--mm-color-accent` (or the `accent` role), `--mm-color-accentInk` or `--mm-color-canvas`, `--mm-color-ink` (names), `--mm-color-muted` (dates, details, axis numbers), `--mm-color-line|muted|ink` (the track, by `edge`)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*`, `--mm-size-body`, `--mm-size-h2` (names in a track running down, step titles and numbers)
- `--mm-radius-0|2|4`, `--mm-space-1`, `--mm-space-2`, `--mm-space-3`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing roles `enter` and `move`, the spring role `ui` (dots and pills), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 the track is drawn end to end, every node, label, bar and number in place; nothing moves.
- Labels are DOM text at `--mm-size-body` (`--mm-size-h2` for names down a tall track and step titles); labels never overlap their neighbours because each takes a full pitch (a roadmap's alternate two).
- Phases: the track draws over 2 to 80 % of the beat linearly, each node springing in as the line reaches it; a gantt's axis arrives first, then each row's bar grows from its start, a stagger down the rows; a stepper's steps arrive in turn with the line to the next drawing after each.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a roadmap track that draws then springs its nodes, a milestone track, a gantt whose bars grow by scaleX per row, and a vertical stepper; restated, no code taken.

## Known limits
- Gantt numbers are the beat's own and unit-less: the axis counts whatever the numbers count. Cite a fact when they are real.
- A roadmap or milestone label wraps at about a pitch (two for a roadmap): long labels need fewer items.
- A gantt's name column is as wide as its widest name (at most 40 % of the stage) and its stage grows to hold the rows, so seven rows with long names can outgrow a square frame.
- Past three milestones across, the names alternate below and above the track; a roadmap running down keeps its dates in a column beside the dots.
