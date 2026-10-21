# layouts/paper-cards

## Purpose
A headline over up to three paper cards with torn lower edges, set at staggered heights like notes pinned to a board.

## Use when / Do not use when
**Use when**
- an explainer: three facts, steps or quotes that feel collected by hand
- a softer, editorial piece; pair the cards with `entrances/drop` so they fall in

**Do not use when**
- the items are data (use `data/stat-tile` or `layouts/bento-3`)
- a polished product piece where torn paper would clash with the look

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading over the cards; carries `mm-fit` |
| `card-1` … `card-3` | slot (text) | none | the cards, surface fill, body size; an empty card leaves the flow |
| `data-format` | html attribute | set by the kit | 16x9 and 1x1: a row with staggered heights; 9x16 and 4x5: a stack, the middle card stepped in |
| `align` | enum(left|center) | the brand's `composition.align` | the headline's alignment; a beat param on any slot (`data-p-align`) or `data-align` on the root overrides it |

## Style variables consumed
- `--mm-align`
- `--mm-color-ink` (the mask reads its alpha only)
- `--mm-color-surface`
- `--mm-color-surfaceInk`
- `--mm-density`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-h1`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-space-5`
- `--mm-tracking-display`
- `--mm-weight-display`

## Legibility and rest notes
- Composition: alignment from `--mm-align`, headline size times `--mm-headline-scale`, gaps and side indent times `--mm-density`.
- Every box sits inside `--mm-safe`, inset a further 8 % of the half-width on the left and right as headroom for a camera move.
- The torn edge is an alpha mask below the card's padding, so it never cuts text.
- Cards are level at rest (no rotated type at rest, `references/bans.md`).

## Provenance
- charlie947/motion-graphics-skills, MIT: the torn-edge paper cards of its explainer skill; restated with a conic-gradient mask. No code taken.

## Known limits
- The tear is a regular zigzag, not a random rip.
- Cards in a row share the row's width equally; a long card wraps rather than widening.
