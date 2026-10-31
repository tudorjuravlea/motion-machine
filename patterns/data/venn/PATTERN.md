# data/venn

## Purpose
Two or three circles scale in and draw together until they overlap, each with its set name; the overlap lands last, as a tinted lens and a label.

## Use when / Do not use when
**Use when**
- what two or three things have in common ("Wanted, Possible → Build it"; "Design, Code, Words → Product")
- a point that is the overlap, not the circles

**Do not use when**
- more than three sets
- sets whose sizes matter (the circles are all one size)

## Params
Grammar: the sets in order, separated by `|`, `>` or `,`; the overlap label is its own param.

| name | type | default | meaning |
|---|---|---|---|
| `nodes` | string | (empty) | two or three set names |
| `overlap` | string | (empty) | the label of the overlap of all the circles, landing last; empty for none |
| `shape` | enum(disc\|rounded\|square) | rounded | the overlap pill's shape, through the radius scale |
| `line` | number | 0.004 | circle outline weight as a share of the frame's short side |
| `accent` | enum(accent\|ink\|muted) | accent | the palette role of the first circle, the overlap lens and its pill |
| `edge` | enum(line\|muted\|ink) | muted | the palette role of plain lines (unused here; kept so a brand sets one value everywhere) |
| `face` | enum(text\|mono\|display) | text | the label face |

Brand knobs: shape, line, accent, face.

## Style variables consumed
- `--mm-color-accent` (or the `accent` role), `--mm-color-ink`, `--mm-color-muted` (one tint and one outline per circle), `--mm-color-accentInk` or `--mm-color-canvas` (the overlap pill's text)
- `--mm-font-text|mono|display`, `--mm-weight-*`, `--mm-tracking-*`, `--mm-size-body`
- `--mm-radius-0|2|4`, `--mm-space-2`, `--mm-space-3`, `--mm-frame-w`, `--mm-frame-h`, `--mm-safe`
- easing role `enter`, the spring role `ui` (the circles), duration role `hold`; `runtime/kit/diagram.css`

## Legibility and rest notes
- At p = 1 the circles overlap in their final places, the lens is tinted and the overlap label shows; nothing moves.
- A tint is one role over transparent, so the overlaps read darker without a mixed colour. Set names sit in the part of their circle the others do not cover, in DOM text at `--mm-size-body`; the overlap label is a pill that may reach over the circle edges.
- Phases: each circle takes 40 % of the beat, 14 % after the one before, its name following; the lens and the overlap label take the last 28 %.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a Venn whose circles scale in and overlap with the overlap label last; restated, no code taken.

## Known limits
- Only one overlap is labelled (the middle of three); the pairwise overlaps of three circles are shown by tint only.
- A set name wraps inside its circle: keep it to a word or two.
