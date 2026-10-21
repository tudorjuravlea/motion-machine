# screen/compare

## Purpose
Splits a device screen into before and after: a vertical line enters at the screen's right edge, travels to a stop, and right of it another asset shows, like a comparison slider.

## Use when / Do not use when
**Use when**
- the same screen in two states side by side: a sketch and the finished UI, before and after a redesign, light and dark
- a hold where the viewer should look from one side to the other

**Do not use when**
- the second screen replaces the first: use `screen/swap`
- the two assets are not the same layout: a divider claims they line up

## Params
| name | type | default | meaning |
|---|---|---|---|
| `to` | string | (none) | the asset revealed right of the line (assets/…; a folder ends in /) |
| `stop` | number | 0.5 | where the line stops, as a fraction of the screen width from its left edge (0 to 1) |
| `move` | number | 0.35 | the fraction of the action the line spends travelling; it holds for the rest |

Given in the beat's `screen` list: `{ "do": "screen/compare", "at": <s>, "d"?: <s>, "params": { … } }`. Duration role `hold`; give `d` to cover the hold, since a revealed recording plays only while the action runs.

## Style variables consumed
- `--mm-color-accent` (the line and the knob's ring), `--mm-color-surface` (the knob's face)
- `--mm-space-1` (the line's width), `--mm-space-6` (the knob)
- easing role `move` (the line's travel)

## Legibility and rest notes
The state outlives the action: after it ends the line stays at `stop` on every seek (paint() draws it), and the revealed asset holds its last frame. The revealed content is clipped right of the line (clip-path on the flat screen; a 3D device clips its texture at the same place and draws the line and knob into the glass). The line comes from the right edge, so at the action's first instant nothing is revealed. In a deck the line travels across the press that brings it and rests at `stop`.

## Provenance
- original

## Known limits
- The line always enters from the right and reveals on the right.
- A later `screen/swap` replaces the screen's own content but leaves the comparison in place.
- The revealed asset is shown from its top, unscrolled and unzoomed.
