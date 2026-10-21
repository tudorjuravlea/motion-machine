# entrances/punch

## Purpose
Lands a short line from slightly large with one fast ease-out, like a stamp.

## Use when / Do not use when
**Use when**
- the one line in a scene that must be decided and finished, such as a verdict or a price [H-ONE]
- after a wind-up, as the payoff, then hold [H-STILL]

**Do not use when**
- more than once or twice in a piece: a second punch dilutes the first
- for long lines: a large start scale pushes them past the safe margin while moving

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 1.15 | start scale, clamped to 1.05 to 1.3, then capped so the text stays inside the safe area (it may then start below 1.05) |
| `origin` | enum(auto|center) | `auto` | pivot: the text edge for left or right aligned text, else the centre |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `quick`
- easing role `enter`
- no spring: the arrival is a pure ease-out with no overshoot
- `--mm-safe`, `--mm-frame-w`, `--mm-frame-h` (through the kit's `room.js`) bound the start scale

## Legibility and rest notes
At p = 1 scale is `none` and opacity is removed. Start scale is clamped to 1.05 to 1.3 and then capped, from the layout geometry, so the text's ink scaled about the pivot stays inside the safe area on every frame (a full-measure line punched past the frame edge for 2-3 frames). A line that already fills the measure therefore punches gently (about 1.04 to 1.05). No overshoot.

## Provenance
original

## Known limits
- with a long line the start scale makes the box wider than the frame for the first frames
- no sound cue is attached; pair with a `hit` cue in the story
