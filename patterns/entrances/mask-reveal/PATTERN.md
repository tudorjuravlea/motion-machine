# entrances/mask-reveal

## Purpose
Uncovers an element with a clip-path wipe along one side, without moving or scaling it.

## Use when / Do not use when
**Use when**
- a headline that should be uncovered rather than faded [H-INFO]
- a figure or an image that is already in place and is being shown

**Do not use when**
- on a full-width block of short left-aligned text: the edge crosses empty space first and the text appears late
- where an element's shadow or outline lies outside its box: the clip cuts them

## Params
| name | type | default | meaning |
|---|---|---|---|
| `side` | enum(left|right|up|down) | `left` | the direction the reveal edge travels: left uncovers from the left edge |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `standard`
- easing role `enter`

## Legibility and rest notes
At p = 1 clip-path is `none`. The mask leaves a small em margin on the open sides, so descenders and swashes are not cut while it runs.

## Provenance
original

## Known limits
- the wipe moves with the element's box, not its text, so use it on shrink-wrapped elements for a tight edge
- no soft edge: clip-path edges are hard
