# text/cross-out

## Purpose
Strikes a list of claims through one by one, dims each struck line, and then reveals or grows the last item, the one that survives.

## Use when / Do not use when
**Use when**
- cross out the myths and reveal the truth: three or four wrong ideas, then the right one [H-INFO]
- a before-and-after of an idea ("too many tools | too many meetings | one clear plan")

**Do not use when**
- the items are sentences: each is one short line of display type, struck by one stroke
- a list where nothing is wrong: strikes mean "no"; use `layouts/list-reveal` or `emphasis/roulette`
- more than about five items: the strikes crowd the entrance window

## Params
It is the beat's **`fx`**, not an `emphasis`: the pattern builds the whole figure (the items, their strokes, the survivor) on every seek, so the struck, dimmed list and the landed survivor are what the slot shows at rest. An emphasis window ends and hands the slot back, which would un-strike the list, and the story contract takes only entrance groups as `fx`, so the pattern lives in `text/`. The beat's text is the list, `a|b|c|survivor` (or `params.sep`), and the last item is the survivor. Put it on a slot that has room for a short column of display type, such as `layouts/statement`'s headline.

| name | type | default | meaning |
|---|---|---|---|
| `stroke` | enum(straight|diagonal|scribble) | `straight` | the stroke through a struck item: a straight line through each line of it, one diagonal across its box, or a scribble drawn by `runtime/kit/rough.js` |
| `survivor` | enum(reveal|grow) | `reveal` | `reveal`: the last item is hidden until the strikes end, then lands; `grow`: it shows at the size of the others and grows into its own |
| `tone` | enum(accent|ink|muted) | `accent` | the palette role of the strokes; the survivor is set in accent text when it is accent, else in ink |
| `weight` | number | 0.006 | stroke weight, as a share of the frame's short side, 0.002 to 0.03 |
| `sep` | string | `\|` | what separates the items in the beat's text |

Brand knobs: stroke, tone, weight, survivor.

Duration role `hold` is the whole figure: the list arrives over the first eighth, the strikes run from 16 % to 72 % (each starts when the one before is two thirds drawn), the survivor lands from 74 % to 96 %.

## Style variables consumed
- `--mm-color-accent` or `--mm-color-ink` or `--mm-color-muted` (by `tone`) for the strokes; `--mm-accent-text` for the survivor (or `--mm-color-ink`); `--mm-color-ink` for the items before their strike and `--mm-color-muted` for a struck one
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h2` (the struck claims), `--mm-size-h1` (the survivor)
- `--mm-space-3` (the gap between items), `--mm-align` (the column's alignment)
- duration role `hold`; the `move` ease for each stroke and the dimming, the `enter` ease for the arrival

## Legibility and rest notes
At p = 1 every claim is struck through and dimmed to the muted role, and the survivor is at its own size in the accent text (or ink): the figure is built, not mid-motion. The strokes are SVG paths in each item's own pixels measured from the laid-out lines of text (a claim that wraps is struck line by line, a diagonal crosses the whole box), drawn by dash offset, and the scribble's wobble is seeded from the slot's selector, so the same stroke is drawn at every seek. Claims and survivor are DOM text, so every legibility rule reads them. The claims are set at `--mm-size-h2`, above the display floor. A struck claim's dimming is a blend of ink and muted while it is in progress; at rest it is the muted role alone.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of crossing out the myths one by one and revealing the middle; no code taken. The stroke styles, the dimming and the survivor's two arrivals are ours, and the scribble is drawn with `runtime/kit/rough.js`.

## Known limits
- the beat's text must hold the whole list: items are not separate beats, so each cannot carry its own entrance, sound cue or fact reference
- it cannot be named as an `emphasis` (an emphasis window would hand the slot back un-struck); name it as the beat's `fx`
- a long claim shrinks nothing: the h2 size is fixed, so keep claims to a few words
- `grow` scales the last item from the h2 size to h1 with a transform: it needs the room of its final size from the start, which the layout gives it
- no sound: pair the strikes with `sound/tick` cues if a piece wants them
