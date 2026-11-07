# layouts/shortlist

## Purpose
Up to six candidates arrive, then the field collapses to the one that was picked, with a result card under it.

## Use when / Do not use when
**Use when**
- a choice among options: a venue, a plan, a vendor, a design direction
- the reason for the choice fits one short line (the result card)
- the decision should stay on screen: the losers remain, dimmed, so the viewer sees what was passed over

**Do not use when**
- the options carry figures to compare (use `layouts/comparison` or a data pattern)
- there is no single winner
- more than six options

## Params
| name | type | default | meaning |
|---|---|---|---|
| `headline` | slot (text) | none | heading; carries `mm-fit`; removed from the flow when it has no beat |
| `item-1` … `item-6` | slot (text) | none | the candidates, each a card; an item without a beat is removed from the grid |
| `pick` | boolean (beat param on one item) | false | `params: { "pick": true }` on the chosen item's beat (read as `data-p-pick`); exactly one item should carry it. With two or more, the first is the pick and the others are candidates; with none, nothing collapses and the result card sits under the grid |
| `result` | slot (text) | none | the result card, accent on accentInk, placed under the pick in its column (over it when the pick is on the last row); its arrival is the moment of the collapse |
| `data-format` | html attribute | set by the kit | two columns in 9x16, 4x5 and 1x1, three in 16x9 |
| `align` | enum(left\|center) | the brand's `composition.align` | the headline's alignment; a beat param on any slot (`data-p-align`) or `data-align` on the layout root overrides it |

## Style variables consumed
- `--mm-safe`, `--mm-frame-w`, `--mm-density`, `--mm-align`, `--mm-headline-scale`
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h1` (headline)
- `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text`, `--mm-size-body` (cards and result)
- `--mm-color-ink`, `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`
- `--mm-space-0` to `--mm-space-5`, `--mm-radius-2`

## Legibility and rest notes
- Before the result arrives every candidate is a full card. Once the kit makes the `result` slot visible, every candidate but the pick dims to opacity 0.35 and blurs by `--mm-space-1` (it is never scaled down, so its text stays at the body floor); the pick takes an accent ring and steps up to 1.03. At rest the pick is the only candidate at full opacity.
- The collapse is styled on each card (the slot's `[data-text]` child), never on the slot itself, so an entrance's inline opacity or transform never cancels it.
- The result card is placed with CSS anchor positioning: under the pick, in its column, at its width; when that would leave the layout box it flips over the pick. It overlaps a dimmed candidate by design and carries `data-over`, so G-OVERLAP does not count that pair; the cards themselves sit in a grid and never overlap.
- Every box sits inside `--mm-safe`, inset 8 % of the half-width on the sides as headroom for a camera move; content is centred and lifted (H-FILL). Text is at body size or above; nothing uses `data-micro`.
- Without a `result` beat nothing collapses: the candidates stay whole.
- Without a `pick` nothing collapses either: every candidate stays whole and the result card takes its place in the flow under the grid, as wide as it (its place is kept while it waits, so the grid never moves when it arrives).
- With more than one `pick`, the first in slot order is the pick (ring, full opacity, the result under it); a later one dims and blurs like any other candidate.

## Provenance
- pyang5166/gbro-collage-info, MIT: ideas only; no code taken. Many candidates collapsing to one, the losers blurred, dimmed and stepped back (here dimmed and blurred only, so their text keeps the body floor), the winner ringed in the accent with a result card dropping under it, and the state kept rather than released; restated as a CSS layout keyed on the result's arrival, with anchor positioning for the card, in our own code.

## Known limits
- The collapse is a cut at the instant the result arrives, not an eased fade: a layout has no clock of its own. The result card's own entrance carries the motion of the moment.
- W-CONTRAST warns on the dimmed candidates (their effective contrast at 0.35 is low by design); the pick and the result are measured as usual.
- The collapse keys on the `visibility` the kit writes on a slot that has not arrived; a result given an exit un-collapses the field when it leaves.
- Six candidates under a long headline do not fit 1x1 as the first scene (the hook's headline is a step larger): keep the headline to one line there, or open with another scene.
- Needs CSS anchor positioning with `anchor-scope` (Chromium 131 and later, which the renderer is).
- A layout cannot speak: a missing or doubled `pick` falls back as described but gives no warning of its own.
