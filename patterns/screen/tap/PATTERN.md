# screen/tap

## Purpose
A touch ring at a mark or a point on a device screen: a press, then a ripple.

## Use when / Do not use when
**Use when**
- showing where a viewer would tap in an app or on a site
- marking the moment before a screen/swap

**Do not use when**
- a desktop pointer is wanted: use devices/cursor
- the point must stay marked for a long time: use screen/callout

## Params
| name | type | default | meaning |
|---|---|---|---|
| `at` | string | 50%,50% | a mark label from media.json, or "x%,y%" of the screen |
| `ripple` | boolean | true | the ring grows out as it fades after the press |

Given in the beat's `screen` list: `{ "do": "screen/tap", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `--mm-color-accent`
- `--mm-space-1`
- `--mm-space-6`
- `motion.easings.enter`, `motion.easings.exit`
- `motion.durations.standard` (the default length)

## Legibility and rest notes
- The ring follows the screen state of the same seek, so it lands on the mark wherever the page is scrolled or zoomed.
- It is fully transparent at p = 1; nothing of it remains at a rest.

## Provenance
original

## Known limits
- The ring is drawn inside the screen and clipped by it; a mark at the very edge shows half a ring.
