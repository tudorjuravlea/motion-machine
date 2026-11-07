# screen/swap

## Purpose
Moves a device screen to another asset, as app navigation does: slide, fade or cut.

## Use when / Do not use when
**Use when**
- a tap leads to the next screen of an app
- a site capture leads to a recording of the same flow

**Do not use when**
- the change is a scroll on the same page
- the whole scene should change: use a scene cut

## Params
| name | type | default | meaning |
|---|---|---|---|
| `to` | string | (none) | the asset to move to (assets/…; a folder ends in /) |
| `how` | enum(slide|fade|cut) | slide | how the new screen arrives |

Given in the beat's `screen` list: `{ "do": "screen/swap", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `motion.easings.move`
- `motion.durations.standard` (the default length)

## Legibility and rest notes
- At p = 1 the new asset is the screen's content, at its top; later actions act on it.
- Both contents are drawn only during the swap; at a rest exactly one shows.

## Provenance
original

## Known limits
- The new asset starts at its top and, for a sequence, at its first frame.
