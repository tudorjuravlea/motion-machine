# text/verdict

## Purpose
Two names show, hold for a beat, and then a stamp lands on one of them while the others dim.

## Use when / Do not use when
**Use when**
- a this-or-that that ends in a decision: two plans, two tools, two options and the one that won
- a verdict that should land as a moment: pair it with a `sound/hit` cue at the landing and `moves/shake` if the scene should jolt too

**Do not use when**
- the names are sentences: each is set in uppercase display type
- more than about three names: the stamp lands on one and the rest dim, which stops reading as a choice
- the verdict is a single word on its own (use `emphasis/stamp`)

## Params
It is the beat's **`fx`**, not an `emphasis`: the pattern builds the figure on every seek, so the stamped name and the dimmed others are what the slot shows at rest. An emphasis window ends and hands the slot back, which would lift the stamp, and the story contract takes only entrance groups as `fx`, so the pattern lives in `text/`. The beat's text is the names, `a|b` (or `params.sep`). The stamp is `emphasis/stamp`'s: its stylesheet is imported by this pattern's CSS and keyed on `data-emphasis`, which is set on the winner's name only from the landing, and its slam, wobble, flash and jolt are that module's `at`, called on the winner's name; `personality`, `tone`, `tilt`, `flash` and `shake` mean what they mean there.

| name | type | default | meaning |
|---|---|---|---|
| `winner` | number | 1 | which name the stamp lands on, counting from 1 in the order of the beat's text |
| `land` | number | 0.55 | where in the entrance the stamp lands, as a share of it, 0.3 to 0.9: the held beat before it is the share before |
| `personality` | enum(slam|press) | `slam` | the stamp's landing: slam (down from large with a wobble) or press (a quiet set-down) |
| `tone` | enum(accent|ink) | `accent` | the palette role of the stamp's ink (word, rules and pits) |
| `tilt` | enum(left|right|none) | `left` | the plate turns 7° anticlockwise, clockwise or not at all; the word stays level |
| `size` | enum(h1|h2) | `h2` | the size role of the names |
| `flash` | number | 0.35 | strength of the flash at the landing, 0 to 0.5, in the lightest palette role |
| `shake` | number | 6 | how far the scene's other slots jolt at the landing, in px; 0 for none |
| `sep` | string | `\|` | what separates the names in the beat's text |

Brand knobs: tone, tilt, personality, flash, shake, size.

Duration role `hold` is the whole figure: the names arrive over the first sixth, hold until `land`, and the others dim over the next share of the window (0.4 of what is left). With `land` 0.55 the held beat is a little under half a second to three quarters of one, by the style's `hold`.

## Style variables consumed
- everything `emphasis/stamp` consumes for the winner: `--mm-color-accent` or `--mm-color-ink`, the lightest palette role (the flash), `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h1` or `--mm-size-h2`, `--mm-space-0` to `--mm-space-4`, `--mm-radius-1`
- `--mm-color-ink` for the names, `--mm-color-muted` for the dimmed ones, `--mm-align`, `--mm-space-3` (the gap)
- duration role `hold`; the `enter` and `move` eases for the arrival and the dimming; the slam's own timing is in seconds, because an impact is physical

## Legibility and rest notes
At p = 1 the winner is the stamped name (level type in the stamp's ink on a tilted plate, nothing written inline) and the others are in the muted role; every name has the stamp's own padding and margin from the first frame, so the landing moves nothing. The slam's start scale is capped by `room.js`, so the word stays inside the safe area, exactly as `emphasis/stamp` does; the flash and the jolt are that module's and are gone before the window ends. Names are DOM text in the display face at h2 or h1, above the display floor; a name too long for the column wraps and the plate follows it. The dimming is a blend of ink and muted while it runs and the muted role alone at rest.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a verdict stamp that lands about half a second after both names show; no code taken.
- lemomo-ai/lemo-opuscar, MIT: through `emphasis/stamp`, whose module and stylesheet this pattern composes: see that card; nothing is copied.

## Known limits
- the beat's text must hold every name: names are not separate beats, so each cannot carry its own entrance or sound cue
- it cannot be named as an `emphasis` (an emphasis window would hand the slot back without the stamp); name it as the beat's `fx`
- the stamp's plate is the stamp's: the same mask of pits for every use, and `size` is h1 or h2, not a fitted size
- in 16x9 the names sit in a row only when they fit the slot's width, else they stack
- the others dim to muted; there is no hide or strike-out for them (use `text/cross-out` for that)
