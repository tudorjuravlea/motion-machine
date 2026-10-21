# screen/callout

## Purpose
A leader line from a mark on a device screen to a short label beside the device.

## Use when / Do not use when
**Use when**
- naming one feature on a screen while it is shown
- pointing at a control after a scroll

**Do not use when**
- the label is the only place a fact or the call to action appears (W-MEDIA-FACT)
- there is no room beside the device in the format

## Params
| name | type | default | meaning |
|---|---|---|---|
| `at` | string | 50%,50% | a mark label from media.json, or "x%,y%" of the screen |
| `text` | string | (empty) | the label, a few words |
| `side` | enum(auto|left|right) | auto | the side of the device the label sits on; auto picks the roomier one |

Given in the beat's `screen` list: `{ "do": "screen/callout", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `--mm-color-accent`
- `--mm-color-surface`
- `--mm-color-ink`
- `--mm-font-text`
- `--mm-weight-text`
- `--mm-size-body`
- `--mm-radius-2`
- `--mm-space-1` to `--mm-space-3`
- `motion.easings.enter`
- `motion.durations.hold` (the default length)

## Legibility and rest notes
- The line follows the mark through scrolls, zooms and the device's own moves in the same seek.
- In a film the callout is drawn in a fresh overlay each seek and is gone at p = 1; give it a `d` as long as it should stay. In a deck it does not fade: it is complete at the rest its press ends on, and gone after the next press.

## Provenance
original

## Known limits
- The label sits beside the device's screen when it fits; otherwise it moves beside the point, over the screen, inside the frame and never over the point.
- One line of text; long labels run past the frame (G-EDGE catches them).
