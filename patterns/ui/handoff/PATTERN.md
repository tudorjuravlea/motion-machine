# ui/handoff

## Purpose
Shows something moving from one place to another and a total following: a button is pressed, a chip buds off it, flies to a list and lands as a new row's pill, and the total rolls to its new value.

## Use when / Do not use when
Use when:
- the story is one thing handed over (added, moved, assigned) and a figure changes because of it
- a real recording would be slow, private or not yet possible

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- more than one item moves, or the list is the story; cut it to one handoff first

## Params
| name | type | default | meaning |
|---|---|---|---|
| action | string | Add to order | the button that is pressed |
| item | string | Desk lamp | the chip that flies and the label of the new row |
| from | number | 120 | the total before the handoff |
| to | number | 168 | the total after it |
| prefix | string | $ | written before the total |
| suffix | string | (empty) | written after the total |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/handoff"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`, `--mm-color-ink`, `--mm-color-canvas`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` and `move` easings

## Legibility and rest notes
At p = 1 the new row's pill and the new total are showing, the chip is gone and nothing moves, so the rest works as the poster and under reduced motion. The new row is laid out from the first frame at opacity 0, so nothing else shifts when it opens. The flying chip is the pill's twin at the same size, swapped for it at landing with no visible change; its lift peaks near 1.12 at 30 % of the flight and is gone by 85 %. In 16x9 the source and the list sit side by side, in the other formats they stack.

## Provenance
Stageshow, MIT: the story shape only (a press, a chip carried to a list, the total following), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 3.0 s; the figure counts to `to` in the last 0.8 s.
- The total is a figure on the screen: a beat using it should be given a `fact` in a real story, so the number is sourced; the demo's numbers are invented.
- One item moves; the other rows are filler bars. The word "Total" is fixed.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
