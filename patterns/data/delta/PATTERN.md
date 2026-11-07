# data/delta

## Purpose
Shows a change as a chip: a caret that rises or falls into place, a sign and a counting value, and an optional name after it.

## Use when / Do not use when
Use when:
- a figure's change: signups up, cost down, conversion flat
- beside another figure (a `data/counter` headline) as its context
- a story where "good" is not always up: `good: down` gives a fall in cost the accent

Do not use when:
- a change that needs two numbers (use `data/versus`)
- a figure that is not a change (use `data/counter`)
- a chip that has to be read from far away at body size (raise `size`)

## Params
The change is the beat's signed `value`; cite its fact with the beat's `fact`. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| `dir` | enum(auto\|up\|down) | auto | the caret's direction; auto follows the value's sign |
| `good` | enum(up\|down) | up | which direction is good news and carries the accent (down for costs, errors, time) |
| `label` | string | (empty) | what the change is against, written after the chip ("vs last month") |
| `corner` | enum(pill\|square) | pill | the chip's corners: pill (the largest radius) or square (the smallest) |
| `fix` | number | 0 | decimal places in the value |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text between the sign and the number |
| `suffix` | string | % | text after the number |
| `size` | enum(display\|h1\|h2\|body\|caption) | h2 | the style size role of the chip |

Brand knobs: good, corner, format, suffix, size.

## Style variables consumed
- `--mm-size-<size>` for the chip, `--mm-size-body` for the label
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-accent` and `--mm-color-accentInk` (good news), `--mm-color-line` and `--mm-color-ink` (otherwise), `--mm-color-muted` (the label)
- `--mm-space-1`, `--mm-space-2`, `--mm-space-3`, `--mm-space-4`, `--mm-radius-1`, `--mm-radius-4`
- duration role `slow` (the module's `dur`); no spring role

## Legibility and rest notes
- At p = 1 the chip shows the caret in place, the sign (a plus, a minus sign, or none for zero) and the value, the label beside it; nothing is mid-motion. The caret rises (or falls) into place over the first 45 % of the entrance while the chip fades in, and the value counts on its magnitude, so the figure never passes the fact. The accent marks good news only: `good: down` makes a fall carry it.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. A delta chip with a caret and a counting value, restated in our own CSS and a small SVG caret.

## Known limits
- One chip per slot.
- The sign is a plus or a minus sign written beside the number: a prefix such as a currency sign goes between the sign and the digits.
- No colours other than the accent and the line role: "bad" is quiet, not red.
