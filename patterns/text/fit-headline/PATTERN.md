# text/fit-headline

## Purpose
Sizes a headline to the measure its layout gives it, then brings it in with a short rise.

## Use when / Do not use when
**Use when**
- a headline whose length is not known in advance, in several formats [H-FILL]
- a title that must stay on explicit lines (break them with a newline in the beat text)

**Do not use when**
- for long paragraphs: each explicit line is fitted to one line and will shrink to fit
- in a slot with no width (inline or collapsed): the measure is `clientWidth`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `grow` | boolean | false | let the type grow past the layout size to fill the measure |
| `minRatio` | number | 0.5 | smallest size as a fraction of the layout size |
| `d` | number | 32 | rise in px before the style multiplier |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-size-*` set by the layout is the ceiling (the type only shrinks by default)
- `--mm-travel` scales the rise
- duration role `standard`

## Legibility and rest notes
At p = 1 the font size is the fitted one, translate is `none` and opacity is removed. The widest explicit line fills the measure at most, and the size never goes below `minRatio` of the layout size. Fitting runs after fonts are ready, which the kit awaits before the first instant.

## Provenance
original

## Known limits
- a headline with no newline is one line: a long one shrinks until it fits on that line rather than wrapping
- the kit does not load `pattern.html` for the text group; the layout supplies the slot and the fragment is the reference
- it runs a layout measurement on every seek
