# emphasis/countdown-clock

## Purpose
Adds urgency to a line: a clock face over it whose hand sweeps a full turn while a band of slanted stripes scrolls behind the text, then both leave.

## Use when / Do not use when
**Use when**
- a deadline, a limited offer, "ends tonight": the line that says time is running out
- once in a piece, on the slot that carries the deadline

**Do not use when**
- the line says nothing about time: the clock would promise a deadline that is not there
- a calm brand whose pieces never press the viewer (use `emphasis/indicate`)
- a slot at the top of the safe area with `place: above` and no room over it (use `place: below`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `tone` | enum(accent|ink|muted) | `accent` | the palette role of the clock and the stripes |
| `turns` | number | 1 | how many full turns the hand makes over the window, 1 to 4 |
| `place` | enum(above|below) | `above` | where the clock sits against the slot |
| `size` | number | 0.2 | the clock's diameter, as a share of the frame's short side, 0.08 to 0.3 |
| `stripes` | boolean | true | a band of slanted stripes scrolls behind the text |
| `weight` | number | 0.005 | the clock's line weight, as a share of the frame's short side, 0.002 to 0.02 |

Brand knobs: tone, weight, stripes, size, place.

Use it as the beat's `emphasis` (`"emphasis": "emphasis/countdown-clock"`): it plays after the beat's entrance, over the duration role `hold`, and finishes. A `params.emphasis` bag gives it its own params.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink` or `--mm-color-muted` (by `tone`): the clock's lines, the swept sector and the stripes (each the role at a share of opacity over transparent); `--mm-color-canvas` (the face's fill, 80 % over transparent)
- `--mm-space-3`, `--mm-space-4`, `--mm-radius-1` (the band's reach past the text and its corners), `--mm-space-3` again for the gap to the clock
- `ctx.unit` (how far the stripes travel); duration role `hold`; the `enter` ease for the clock and the band arriving and leaving

## Legibility and rest notes
At p = 0 and p = 1 the pattern writes nothing: the slot is plain. While it runs, the clock sits outside the text (above or below the slot) and the stripes are a tint of one role behind it (the slot becomes a stacking context for the window, and the band is behind its text), so no type is covered. The hand turns at a steady rate from just after the clock has come in to just before it leaves, and the stripes travel a fixed distance over the window: both are closed forms of the window's progress, so the same instant draws the same frame, and both are finite.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of an urgency clock whose hand sweeps a full turn over the beat with scrolling stripes behind; no code taken, the face, the sector and the stripes are ours.

## Known limits
- the clock does not stay after the window: at rest the slot is plain; hold the deadline in the text itself
- it does not read a time: the hand makes `turns` turns however long the window is
- the clock is placed against the slot's box, and does not check the room around it
- the stripes cover the slot's box with a margin, so a slot as wide as its column gets a band as wide as the column
