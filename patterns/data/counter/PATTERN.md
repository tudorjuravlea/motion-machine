# data/counter

## Purpose
Counts a figure from `from` to the beat's value in tabular digits through the kit's count().

## Use when / Do not use when
Use when:
- a figure that should be readable the instant it lands, then confirmed by arriving at its value
- a percentage, a price or a count that takes `prefix`, `suffix`, `pad` or `fix`
- a deck press where a figure appears alone

Do not use when:
- a figure that needs texture or a mechanism feel (use `data/odometer`)
- a figure that is only a label, never a measure
- several figures in one beat

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| from | number | 0 | the figure counted up from |
| fix | number | 0 | decimal places shown |
| pad | number | 0 | minimum integer digits, zero-filled |
| prefix | string | (empty) | text before the figure |
| suffix | string | (empty) | text after the figure |
| size | enum(display|h1|h2|body|caption) | h1 | the style size role of the figure |
| format | enum(plain|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M, 3B, 2T) and `fix` is the decimals of the scaled number, so `$1.2M` is `prefix: $`, `fix: 1`, `format: compact` |
| unit | enum(land|always) | land | land: the prefix and suffix keep their place but show only on the landed figure, so no frame reads "1 rules"; always: they count along |

Brand knobs: format, size, unit.

## Style variables consumed
- `--mm-size-<size>` for the role named by `size`, `--mm-size-caption` and `--mm-size-body` for secondary text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 the text is exactly the value formatted with `fix`, `pad`, `prefix` and `suffix`; count() clamps p, so a spring never shows a number the fact does not carry. Tabular digits keep the box width steady while it counts. Opacity eases in over the first eighth of the entrance and never overshoots. With `unit: land` (the default) the prefix and suffix are laid out but invisible until p = 1.

## Provenance
original

## Known limits
- One run of text: the suffix cannot be styled apart from the digits (use `data/stat-tile` or `data/odometer` for that).
- No thousands separators (`format: compact` is the way to a short figure).
- `format: compact` changes the unit as the count crosses 1000, so the figure's width changes while it counts; the box keeps its tabular digits but not its width.
- A negative `from` or value is supported; counting through zero shows a minus only while the figure is below zero.
