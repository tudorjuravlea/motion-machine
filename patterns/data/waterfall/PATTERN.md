# data/waterfall

## Purpose
Walks from a start through up to four signed changes to the total they leave: each change is a floating bar that starts at the running total, and the final total lands last on the accent.

## Use when / Do not use when
Use when:
- a figure that moved because of named causes: revenue, cash, headcount, time saved
- a story whose point is the last bar, with the steps as the reason
- when the steps are few and each has a one-word name

Do not use when:
- more than five bars before the total (a 9x16 column is under 160 px wide)
- a set of unrelated values (use `data/bar-grow`)
- percent shares that sum to a whole (use `data/unit-grid` or `data/gauge`)

## Params
The figures come from `values` (a comma list: the start, then signed changes) and `labels`; cite the fact with the beat's `fact`. The beat's `value`, when given, is the total the story claims: the total bar always shows the sum, and a `value` that is not the sum is reported in `mm.warnings`. The entrance lasts 2.2 s, in seconds; a beat's `params.dur` overrides it.

| name | type | default | meaning |
|---|---|---|---|
| `values` | string | (empty) | comma list: the start, then up to four signed changes (five bars with the total at most six) |
| `labels` | string | (empty) | comma list of names under the start and each change, one short word each |
| `total` | string | Total | the name under the final bar |
| `tone` | enum(accent\|ink\|muted) | accent | the palette role of the final total |
| `glow` | boolean | true | a soft halo of the tone role around the final total once it lands |
| `weight` | number | 62 | a bar's width as a percentage of its column |
| `fix` | number | 0 | decimal places in the figures |
| `format` | enum(plain\|compact) | plain | plain writes the whole number; compact writes a scaled unit (14K, 1.2M) |
| `prefix` | string | (empty) | text before each figure |
| `suffix` | string | (empty) | text after each figure |
| `size` | enum(display\|h1\|h2\|body\|caption) | body | the style size role of the figures |

Brand knobs: tone, glow, weight, format, size.

## Style variables consumed
- `--mm-size-<size>` (default body) for the figures, `--mm-size-body` for the names
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` for figures; `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` for names; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono` where noted
- `--mm-color-muted` (start), `--mm-color-ink` (a rise, and an alpha of it for a fall), `--mm-color-accent` or the other roles by `tone` (the total), `--mm-color-line` (baseline and links)
- `--mm-space-0`, `--mm-space-1`, `--mm-space-3`, `--mm-space-5`, `--mm-radius-1`; `--mm-frame-w`, `--mm-frame-h`, `--mm-safe` for the chart box
- the module's `dur` (2.2 s) and the style's `enter` easing, applied with `ctx.ease`

## Legibility and rest notes
- At p = 1 every bar sits between its two running totals (the start and the total from the zero line, a change from the total before it to the one after), every figure counts to its value with a plus or minus sign on the changes, the total equals the sum of the values and the links join each bar to the next. Bars land in turn over the entrance; each one's free edge travels from the previous total, and its figure counts with it.
- A series that crosses zero draws a baseline and its negative bars below it, with the figure under a falling bar. The total's glow is an alpha of its own role and rises with its bar; `glow: false` removes it. p is clamped.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only, no code or text taken. A waterfall of bars each offset from the last total with the final total lit, restated in our own CSS (percentages of a plot box) and the kit's count().

## Known limits
- At most six values (the start and five changes); the rest are dropped.
- Names wrap by character in a narrow column: keep them to one short word in 9x16.
- No subtotal bars in the middle.
- No legend, axis or gridlines (data restraint).
