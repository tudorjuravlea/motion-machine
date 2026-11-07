# ui/table-edit

## Purpose
Shows a value edited in place in a small table, with the total it feeds rolling to its new figure a beat later.

## Use when / Do not use when
Use when:
- the story is that one input changes and a sum follows from it
- a real recording would be slow, private or not yet possible

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- the table needs more than four rows, or a total that is not a plain sum

## Params
The total is summed from `rows`, never typed in, so it is always arithmetically right.

| name | type | default | meaning |
|---|---|---|---|
| rows | string | Design:1200\|Build:2400\|Test:800 | the rows as Label:number, separated by \|, four at most |
| edit | number | 1 | the index of the row edited, counted from 0 |
| to | number | 0 | the new value of that row |
| total | string | Total | the label of the total row, which is summed from the rows |
| prefix | string | (empty) | written before every figure |
| suffix | string | (empty) | written after every figure |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/table-edit"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-color-ink`, `--mm-color-canvas` (the cursor)
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 the new value and the new total are showing, the edit ring and wash are gone, the cursor has retreated off the total, and nothing moves, so the rest works as the poster and under reduced motion. Every part is laid out at its final geometry first; the value column is as wide as the longest of the old and new figures and both totals, in tabular figures, right-aligned, so nothing reflows. The ring is drawn inside the cell.

## Provenance
Stageshow, MIT: the story shape only (a value edited in place, the total follows a beat later), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 4.7 s; the typing shares out its window, so a long figure types faster.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
- In 9x16 there is no room for the filler column, so it goes.
- The figures on screen carry no fact here: a real story should give the beat a `fact` for the old and new numbers; the demo's numbers are invented.
- Up to four rows; the edited cell and the total are the only cells that change.
