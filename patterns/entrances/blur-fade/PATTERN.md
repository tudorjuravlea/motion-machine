# entrances/blur-fade

## Purpose
Brings an element in out of focus, sharpening as it fades up.

## Use when / Do not use when
**Use when**
- a soft reveal of an image, a figure or a reflective line [H-INFO]
- a calm arrival after a hard one, to let the piece breathe [H-STILL]

**Do not use when**
- on large areas in a long film: blur is the costliest filter to render
- when the export uses `--sub 1` and motion blur is expected: the blur here is part of the picture, not subframe blur

## Params
| name | type | default | meaning |
|---|---|---|---|
| `blur` | number | 12 | start blur radius in px |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- duration role `standard`
- easing role `enter`

## Legibility and rest notes
At p = 1 filter is `none` and opacity is removed, so text is sharp at every rest. No size or position changes.

## Provenance
original

## Known limits
- text mid-blur is unreadable, so the entrance must finish well before the reading time starts (W-READ)
- the blur radius is in px and not scaled by format
