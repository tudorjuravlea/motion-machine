# text/date-flip

## Purpose
A before-and-after change: the old value shows, a strike line is drawn through it, then it flips away while the new value flips in.

## Use when / Do not use when
**Use when**
- a date, a version, a price or a deadline that changed ("2025 → 2027", "v1 → v2")
- an explainer beat whose whole point is "it used to be this, now it is that"

**Do not use when**
- the value did not change (use `entrances/count` or `text/split-flap`)
- the old value would mislead if read alone: it is on screen for about a third of the entrance

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | string | `""` | the old value, struck through and flipped away (empty: the flip alone) |

## Style variables consumed
- `--mm-color-ink` (the old value at 55 %)
- `--mm-accent-text` (the strike line)
- easing role `move` (the strike and the flip)
- duration role `slow`

## Legibility and rest notes
- At p = 1 the slot is the new value as plain text, exactly as without the pattern.
- The strike draws over 12–42 % of the entrance, the flip over 48–86 %; the new value is never shown backwards (backface hidden) and never overshoots.
- The old value is a param, not a fact; if it is a number, give it a story fact like any other figure.

## Provenance
- charlie947/motion-graphics-skills, MIT: the before-and-after date chip of its explainer skill; restated as a strike then a two-face flip. No code taken.

## Known limits
- Old and new values share one cell sized to the wider of the two, so a much longer old value widens the slot mid-entrance.
- One value per slot: a sentence with a date inside it flips as a whole.
