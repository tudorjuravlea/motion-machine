# ui/bento

## Purpose
Shows a product as a grid of small facts in one beat: the tiles land one after another, the first leads, and each then does one small thing of its own.

## Use when / Do not use when
Use when:
- the story is breadth, many small things the product holds at once (a number, a trend, a short list, a status)
- one fact should lead and the rest should sit around it

Do not use when:
- one thing changes and the rest follows from it (use `ui/cascade`)
- a fact needs a sentence; a tile holds a label and one short value

## Params
| name | type | default | meaning |
|---|---|---|---|
| tiles | string | (empty) | the tiles, separated by \|, six at most, each `kind:label:value`; the first tile leads. Kinds: `figure` (a number that counts up), `bars` (numbers separated by commas, five at most), `list` (words separated by commas, three at most), `chip` (one word), `filler` (no label or value). A kind that is not known is `filler`. Empty uses the slot text |
| prefix | string | (empty) | written before a figure |
| suffix | string | (empty) | written after a figure |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/bento"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` and `move` easings

## Legibility and rest notes
At p = 1 every tile is in, every number has landed, every bar is full and nothing moves, so the rest works as the poster and under reduced motion. Tiles land 110 ms apart in reading order, then do their own thing 110 ms apart. The lead is always the first tile, spans two columns and wears the accent fill. No two neighbours share a kind where that is possible: `spreadKinds` is a stable reorder that keeps the lead first and never drops a tile. A figure's final text holds its box, so the counting digits move nothing. The grid is three columns in 16x9 and two in every other format, and on a device's screen it fills the glass. The last tile takes the rest of its row, so no row is left short. In the narrow formats (9x16, 1x1, 4x5) the filler tiles are cut, and only when they are a third or more of the tiles; otherwise they all stay.

## Provenance
Stageshow, MIT: the idea of a tile grid whose tiles arrive in sequence and then each play a small motion of their own, restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 3.5 s; it plays for six tiles and fewer tiles leave an earlier end.
- Six tiles at most; a label and a value are one short line each, and a longer one wraps inside its tile.
- Only the narrow formats cut tiles, and only filler. In 1x1 six tiles with fewer than a third of them filler do not fit the frame; keep the story to four or five there.
- A figure counts from zero; a value that is not a number is shown as written.
- The tiles carry no fact: a claim in them is the story's to source.
