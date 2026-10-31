# data/versus

## Purpose
Puts two figures across a seam, the before recessed (smaller and muted) and the after larger in the tone role, the second counting after the first.

## Use when / Do not use when
Use when:
- before and after, then and now, us and the average: one change, two numbers
- a story where the second number is the point and the first is the reason to care
- across in 16x9, stacked in 9x16 and 1x1

Do not use when:
- more than two figures (use `data/bar-grow` or `data/funnel`)
- a pair where neither is the hero: the recess says "the first is the past"
- a change better told as one signed figure (use `data/delta`)

## Params
The figures come from `values` (two numbers) and `labels` (two names); cite the fact with the beat's `fact`. Params are `data-p-*` attributes on the slot; sizes are style roles, never pixels.

| name | type | default | meaning |
|---|---|---|---|
| `values` | string | (empty) | two numbers, before then after, as a comma list |
| `labels` | string | Before,After | two names, before then after, as a comma list |
| `axis` | enum(auto\|across\|down) | auto | across puts the figures side by side with a vertical seam, down stacks them with a horizontal one; auto is across in 16x9, down otherwise |
| `recess` | number | 0.62 | the before figure's size as a share of the after figure's (0.3 to 1) |
| `tone` | enum(accent\|ink) | accent | the palette role of the after figure (the surface-ink-safe accent text, or ink) |
| `fix` | number | 0 | decimal places in the figures |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text before each figure |
| `suffix` | string | (empty) | text after each figure |
| `size` | enum(display\|h1\|h2\|body\|caption) | h1 | the style size role of the after figure |

Brand knobs: axis, recess, tone, format, size.

## Style variables consumed
- `--mm-size-<size>` (default h1) for the after figure, the before at `recess` of it; `--mm-size-body` for the names
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-muted` (the before and the names), `--mm-accent-text` or `--mm-color-ink` for the after (by `tone`), an alpha of `--mm-color-ink` for the seam
- `--mm-space-0`, `--mm-space-2`, `--mm-space-4`, `--mm-space-5`; `--mm-align`; `--mm-frame-w`, `--mm-safe`
- duration role `slow` (the module's `dur`); no spring role

## Legibility and rest notes
- At p = 1 both figures show their values, the before at `recess` of the after's size, the seam fully drawn between them, nothing mid-motion. The before counts first, the seam draws, then the after counts and settles up to its size; the type size only grows toward its rest and never passes it (type never overshoots). The two figures never cross the safe area: the grid is the safe width at most.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. A before-and-after pair across a seam with the before recessed and the after larger, restated in our own CSS grid.

## Known limits
- Two figures, no third.
- A very long figure (a long prefix and suffix) wraps the grid cell: keep units short.
- `recess` is a share of the after's size, not a number of pixels; the after's size is the `size` role.
