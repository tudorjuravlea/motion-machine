# data/odometer

## Purpose
Rolls a figure into place as clipped digit strips, one column per digit, so a number arrives as a mechanism rather than a fade.

## Use when / Do not use when
Use when:
- a single hero figure that earns a press to itself (H-ONE, H-STILL)
- counts with a large or growing digit count, where the carry from one column to the next reads as effort
- a calm or premium style that wants a count with texture

Do not use when:
- a figure that must be read at once with no wait (use `data/counter`)
- a figure inside running text
- a range or a pair of numbers (one beat, one figure)

## Params
The figure comes from the beat's `value` (the kit writes it as `data-value`). Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| from | number | 0 | the figure the strips start from |
| fix | number | 0 | decimal places shown |
| pad | number | 0 | minimum integer digits, zero-filled |
| prefix | string | (empty) | text before the figure |
| suffix | string | (empty) | text after the figure |
| size | enum(display|h1|h2|body|caption) | h1 | the style size role of the figure |

## Style variables consumed
- `--mm-size-<size>` for the role named by `size`, `--mm-size-caption` and `--mm-size-body` for secondary text
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for labels
- `--mm-color-ink`, `--mm-color-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*` and `--mm-radius-*` steps for gaps, padding and rounding
- duration role `slow` (the pattern module's `dur`) and the style's `enter` easing, applied by the kit; no spring role is needed

## Legibility and rest notes
At p = 1 every strip sits on its target digit, nothing is clipped, and the text equals the beat's value with the given `fix`, `pad`, `prefix` and `suffix`. p is clamped, so a spring never shows a digit the fact does not carry. Leading columns stay reserved but invisible while the figure has fewer digits, so the box never shifts. The figure's `aria-label` carries the final text. Pick `size` so the figure clears the style's display floor.

## Provenance
original

## Known limits
- Digits only: a negative value gets a leading minus, but thousands separators are not drawn.
- Seven or more digits at the `display` size will not fit a 9x16 frame; use `h1` or `h2`.
- The roll is a pure function of p, so it follows the entrance easing; there is no extra spin.
