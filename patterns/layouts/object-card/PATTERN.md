# layouts/object-card

## Purpose
Puts one stat inside an object drawn from palette roles: a receipt, a calendar page, a swinging tag, a perforated stamp or a ledger with one hero row.

## Use when / Do not use when
Use when:
- a stat that should feel like a thing: a price (tag), a date (calendar), a total (receipt), a proof (stamp), a balance (ledger)
- with `data/counter` on `figure` and an entrance on `object` that suits the object: `entrances/mask-reveal` (`side: down`) prints a receipt, `entrances/drop` lets a calendar fall, `entrances/swing` hangs a tag, `entrances/pop` lands a stamp, `entrances/rise` lifts a ledger
- a brand that sets its one object for every card (`style.patterns["layouts/object-card"] = { variant: "tag" }`)

Do not use when:
- more than one figure (a second card is a second scene)
- long sentences: the card holds a name, a figure and one line
- a piece in a brand whose look has no paper, such as a pure line drawing

## Params
Slots, all inside `object` (so one entrance carries the whole card):

| name | type | default | meaning |
|---|---|---|---|
| `object` | slot (no text) | none | the object itself: give it the entrance; its beat carries the `variant` param |
| `variant` | enum(receipt\|calendar\|tag\|stamp\|ledger) | receipt | a beat param on any slot (`data-p-variant`), else the brand's default for the layout (`style.patterns["layouts/object-card"]`), else a receipt |
| `mark` | slot (text) | none | receipt: a mono header; calendar: the month on the accent band; tag: not shown; stamp: the postmark; ledger: the title |
| `row-1` … `row-3` | slot (text) | none | line items, shown by receipt and ledger: `name\|amount` with beat params `each: true`, `sep: "\|"` puts the name left and the amount right |
| `label` | slot (text) | none | what the figure measures; muted, beside the figure in a receipt and a ledger, above it elsewhere |
| `figure` | slot (text or value) | none | the stat, at the h1 size unless its own pattern sets one (`data/counter` with `size`) |
| `note` | slot (text) | none | one line under the figure |
| `data-format` | html attribute | set by the kit | the width is the smaller of a share of the safe width and of the frame's height |

Every slot is nested inside the `object` slot, so the one entrance on `object` moves the whole card; give `object` a beat (without one the card is shown from the first frame, still). The variant is a beat param (`variant` on any slot) or the brand's default for the layout; a beat that sets it wins.

Brand knobs: variant, and the entrance given to `object`.

## Style variables consumed
- `--mm-color-surface` (the paper), `--mm-color-surfaceInk` and `--mm-surface-muted` (the print), `--mm-color-accent` and `--mm-color-accentInk` (calendar band, ledger band, stamp ring), `--mm-accent-text` (the postmark), `--mm-color-ink` (mask alpha, rings, cord), `--mm-color-canvas` (a hole), an alpha of a role for rules and shadows
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h1` (figure); `--mm-font-text`, `--mm-size-body` (label and note); `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` (mark and rows)
- `--mm-space-0` to `--mm-space-6`, `--mm-radius-1`, `--mm-radius-2`, `--mm-radius-4`; `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`, `--mm-density`

## Legibility and rest notes
- At rest the object is level (no rotated type, bans.md; the swing of a tag is `entrances/swing`'s, which is exactly zero at the end) and inside the safe area: its width is the smaller of 82 % of the safe width and 62 % of the frame's height (a tag 62 % and 46 %, a stamp 70 % and 50 %). Text sits on the paper in the surface-ink roles at the body size or above; the receipt's tear and the stamp's perforation are alpha masks, so they never cut text.
- Slots a beat does not fill leave the flow (`data-empty`): the rows and note are optional, and the calendar, tag and stamp need only `mark`, `label` or `figure`. The ledger's hero row is the label and figure band in the accent role.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. Stat-in-an-object cards (a receipt that prints with a torn edge, a tear-off calendar page with rings, a price tag on a pivot, a perforated stamp with a postmark, a ledger with one hero row), restated in our own CSS, with the paper's tear (a conic-gradient mask) shared in idea with `layouts/paper-cards`.

## Known limits
- The receipt's tear is a regular zigzag, not a random rip.
- The tag's polygon clip and the stamp's perforation are percentages and tiles of the space scale: a very small `--mm-space-3` makes the teeth fine.
- The five objects are fixed: a sixth (a ticket, a label) is a new variant in this layout, not a param.
- Rows are two-part (`name|amount` with `each: true` and `sep: "|"`); a longer row wraps.
