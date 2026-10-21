# screen/scroll

## Purpose
Glides a captured web page on a device screen to a named mark or an offset.

## Use when / Do not use when
**Use when**
- walking a viewer down a site captured with mm capture site
- landing on a section before a tap or a callout

**Do not use when**
- the content is a recording or a still (nothing to scroll)
- the jump is a navigation to another page: use screen/swap

## Params
| name | type | default | meaning |
|---|---|---|---|
| `to` | string | 0 | a mark label from media.json, or a page offset in css px |
| `align` | enum(top|center) | top | where the mark lands on the screen |
| `settle` | number | 0.4 | momentum overshoot near the end, 0 to 1, times motion.overshootMax |

Given in the beat's `screen` list: `{ "do": "screen/scroll", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `motion.easings.move`
- `motion.overshootMax`
- `motion.durations.slow` (the default length)

## Legibility and rest notes
- Each scroll starts from wherever the screen is, so scrolls compose in any seek order.
- At p = 1 the page sits exactly at the target; the overshoot is back to 0.
- The target is clamped to the page: a page shorter than the screen never moves.

## Provenance
original

## Known limits
- Sticky headers are captured once at the top of the page, as a full-page capture shows them.
- Pages taller than 16,000 device px are tiles; the kit joins them on whole pixels.
