# data/bar-to-line

## Purpose
Bars grow from a baseline in turn, then each bar draws in to a dot on its own top while a line is drawn through the dots: the same numbers, read first as amounts and then as a trend.

## Use when / Do not use when
**Use when**
- a series whose story is both size and direction (monthly signups, a price over a year)
- an explainer beat that turns "how much" into "which way"

**Do not use when**
- the viewer must read every value (only the focus point's value is shown)
- more than eight points, or two series (no legend exists)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `values` | string | (empty) | comma list of up to eight numbers |
| `labels` | string | (empty) | comma list of names under the points |
| `max` | number | 0 | the value that fills the chart; 0 uses the largest value |
| `focus` | number | 0 | one-based point whose value is shown; 0 shows the last |
| `fix` | number | 0 | decimal places in the value |
| `prefix` | string | (empty) | text before the value |
| `suffix` | string | (empty) | text after the value |

## Style variables consumed
- `--mm-color-accent` (the focus bar, the line)
- `--mm-color-muted` (the other bars, the labels)
- `--mm-color-ink` (the value)
- `--mm-font-display`, `--mm-font-text`, `--mm-size-body` (the value and the labels: the body floor holds in every format)
- `--mm-frame-w`, `--mm-frame-h`, `--mm-space-1` … `--mm-space-5`, `--mm-radius-1`
- easing roles `enter` (each bar's growth) and `move` (the bar-to-dot change)

## Legibility and rest notes
- At p = 1 the slot is the finished line chart: dots, the line, labels and the focus value.
- Phases run on the beat's own clock: bars grow over the first 45 % (in turn over 40 % of that), turn to dots over 45–70 %, and the line draws over 55–100 %.
- Eased phases are clamped, so no bar or dot passes its value, and the value counts only up to its fact (SPEC §15).
- The line is drawn in the wells' own pixels, so its stroke width and its drawing speed are true.

## Provenance
- charlie947/motion-graphics-skills, MIT: the chart morph from bars to a line (effect 05, "chart morph"); restated with bars that become dots and a dash-drawn polyline. No code taken.

## Known limits
- No axes, ticks or gridlines; the headline names the unit.
- The line is measured once per frame from the laid-out wells; a slot that changes width mid-beat redraws it at the new size.
