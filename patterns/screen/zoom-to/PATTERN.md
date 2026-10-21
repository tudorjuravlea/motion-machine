# screen/zoom-to

## Purpose
Pushes in on a mark or a point inside a device screen until it fills the centre of the screen.

## Use when / Do not use when
**Use when**
- a detail of the interface needs to be read
- after a scroll lands near a control

**Do not use when**
- the whole device should come closer: use a camera move on the scene
- the detail is text the viewer must read as a fact (the gate cannot read inside media)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `at` | string | 50%,50% | a mark label from media.json, or "x%,y%" of the screen |
| `s` | number | 1.6 | the magnification at p = 1, 1 to 4 |

Given in the beat's `screen` list: `{ "do": "screen/zoom-to", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `motion.easings.move`
- `motion.durations.slow` (the default length)

## Legibility and rest notes
- The zoom starts from the screen's current zoom, so zooms compose.
- The picture is magnified inside the screen and clipped by it; the device does not move.

## Provenance
original

## Known limits
- Magnifying a capture beyond its device pixels softens it: captures are at 3x for phones, 2x for laptops.
