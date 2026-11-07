# layouts/social-card

## Purpose
A generic post card or follow card for short-form social proof and calls to action: an avatar disc, a handle line, the words, and a row of counters that tick from one figure to another, drawn from the brand's palette with no platform's marks.

## Use when / Do not use when
**Use when**
- a piece shows a reaction, a comment or a profile as proof, or asks the viewer to follow
- the counters are the piece's facts: a from-value that is the figure before and a value that is the figure after, each cited from `facts`

**Do not use when**
- the figures are not facts of the piece (a demo's are invented and say so in their fact's source)
- the card should look like one named platform: this one says only "post" or "follow", in the brand's palette
- a long text: the body is one or two lines

## Params
The variant is a beat param on any slot of the scene (`params: { "variant": "follow" }`, read as `data-p-variant`) or `data-variant` on the layout root; the counters are beats of `entrances/count` with `value`, `fact` and the params `from`, `prefix`, `suffix`, `fix`.

| name | type | default | meaning |
|---|---|---|---|
| `avatar` | slot (text) | none | one or two letters on the accent disc; the disc stays when it has no beat |
| `handle` | slot (text) | none | the name line, in the display face |
| `sub` | slot (text) | none | the line under the handle: a time, a bio |
| `action` | slot (text) | none | the follow button's label (`variant: follow` only; hidden in a post) |
| `body` | slot (text) | none | the words of the post, or the bio of the profile |
| `stat-1`, `stat-2`, `stat-3` | slot (value) | none | the counters. In a post each has an icon (a heart, a comment, an arrow); in a follow card they are plain figures with a suffix (`" followers"`). Give `stat-1` an `emphasis` (`emphasis/indicate`) and its heart is pressed: accent, not muted |
| `variant` | enum(post\|follow) | `post` | the card: `post` has the icons and no button; `follow` has the larger avatar, the button and the counters spread across the row |
| `align` | enum(left\|center) | the brand's `composition.align` | where the card stands in the frame; a beat param on any slot or `data-align` on the root overrides it |
| `data-format` | html attribute | set by the kit | the card is the full width in 9x16 and 1x1, 62 % of it in 16x9 |

Brand knobs: variant, align.

## Style variables consumed
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text`, `--mm-size-body`
- `--mm-space-0`, `--mm-space-2` to `--mm-space-5`, `--mm-radius-3`, `--mm-radius-4`, `--mm-safe`, `--mm-align`

## Legibility and rest notes
- Every piece of text is at body size, so nothing is under the body floor; the card is surface with surface ink, the avatar and the button are accent with accent ink.
- The card sits inside the safe box, centred vertically; a slot with no beat is removed from the flow (`data-empty`), so a post with two counters is as tidy as one with three.
- Icons are shapes cut from a palette role (a mask over a fill), so they are never another colour; the heart is the surface ink muted, and the accent once `stat-1` carries an emphasis.
- The counters count on the entrance's own clock and finish at the figure of their fact; at rest nothing moves. The card itself is the layout, so it is there from the scene's first frame: bring it in with the scene's cut.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only; no code taken. A post card with an avatar, a handle, a line of text and a row of counters that tick from one figure to another with the like pressed, and a follow card, restated as a layout with the brand's roles and no platform's marks.

## Known limits
- The like is pressed by an emphasis on `stat-1` (the heart turns accent for the whole beat); there is no separate "pressed" beat before the count.
- The card is not animated as a whole: its chrome (the plate, the icons) is in the layout from the scene's first frame.
- A follow card's button does not turn into a "following" state; swap the slot with a second beat if the piece needs it.
- A handle too long for the row wraps anywhere; keep it short.
