# emphasis/stretch-pill

## Purpose
A pill slides in behind the words with its leading edge running ahead, holds while the eye lands, then leaves to the far side with its trailing edge catching up.

## Use when / Do not use when
**Use when**
- a choice or a tab being picked ("Pick a plan", "Monthly"), the motion of a segmented control
- one short line that should be selected rather than shouted

**Do not use when**
- a long line: the pill spans every word
- on the same slot as `text/highlight` (two markers behind one line)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `strength` | number | 0.28 | accent mixed into the pill, 0.15 to 1 |

## Style variables consumed
- `--mm-color-accent` (mixed toward transparent by `strength`)
- duration role `slow`

## Legibility and rest notes
- At p = 0 and p = 1 the pattern writes nothing: no pill remains.
- The pill sits behind the text (the slot is isolated so it stays above the scene) at low strength, so the ink keeps its contrast; it never leaves the text's span by more than its padding.
- Phases run on the beat's own clock: in over 35 %, hold to 72 %, out over the rest.

## Provenance
- charlie947/motion-graphics-skills, MIT: the tab-to-panel pill whose leading edge leads and trailing edge lags (effect 04, "tabs to panels"); restated as an emphasis. No code taken.

## Known limits
- Label colour does not follow the pill's coverage; the text keeps its own colour.
- On a slot that wraps, one pill spans the union of the lines.
