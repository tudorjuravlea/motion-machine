# text/code

## Purpose
A block of code whose steps are edits: tokens that stay slide to their new place, a changed token fades out and its replacement fades in, a select dims the rest, a call puts a labelled box on an exact range, and every token takes one of eight roles the brand maps to its palette.

## Use when / Do not use when
**Use when**
- a developer-product demo shows a small API change, a before and after, a one-line fix or a new option, in the order it happens [H-INFO]
- a story needs to point at one part of a snippet (a call, a flag, a version) while the rest stays visible but quiet
- a brand wants its code to look like its own palette, not a borrowed editor theme

**Do not use when**
- a line is wider than about 30 columns for a 9x16 film or 45 for a 16x9 one (at the body size): the type shrinks to fit the width and the gate's reading floor then stops it
- the snippet needs a real language server (type-aware colours, folding): the lexer reads keywords, names, strings, numbers, comments and punctuation only
- a deck should press once per edit: the steps play on the beat's own timeline

## Params
The beat's `text` is the first code (400 characters at most; tabs are expanded). `steps` holds the edits, blocks separated by a line of `---`; a block's first line is the op and its argument (add `@seconds` to pin the second it starts at), the lines after it are the code that goes with it:

| op | argument | the lines after it |
|---|---|---|
| `edit` | none | the new code, in full: it morphs from the old by token |
| `append`, `prepend` | none | the code to add at the end, or at the start |
| `insert` | `L3` (before line 3, 1-based) or `L3:7` (line 3, column 7, 0-based) | the code to put there |
| `remove` | `L2`, `L2-3`, `"text"` (the first match; `"text" *` every match), `L2:5+3` | none |
| `replace` | `"old" => "new"` | none (or the code that replaces the quoted text) |
| `select` | a range as above, or `none` | none: dims all but the range to 0.2; stays until `select none` or an edit that removes the text |
| `call` | `"text" | label`, or `none` | none: a box on the range and its label; stays likewise |

A selection or a call is kept as the text it names, so it follows an edit that moves it and goes when its text goes.

| name | type | default | meaning |
|---|---|---|---|
| `steps` | string | (empty) | the edits, as above |
| `lang` | enum(js\|py\|sh\|json) | js | which keywords the lexer knows (`ts` and `jsx` read as js) |
| `tab` | number | 2 | the tab stop in columns |
| `size` | enum(body\|h2) | body | the type size role, before it is fitted to the width |
| `leading` | number | 1.5 | the line height, in times the type size |
| `frame` | enum(panel\|bare) | panel | on a surface plate with a hairline, or straight on the canvas |
| `italic` | boolean | true | comments in italics |
| `keyword` | string | accent | the role of keywords: `ink`, `muted`, `accent` or `line`, with an optional tint (`accent/70`) |
| `name` | string | ink | names: calls, variables, properties |
| `type` | string | ink | type names |
| `string` | string | ink/75 | strings |
| `number` | string | accent | numbers |
| `atom` | string | accent | true, false, null and the like |
| `comment` | string | muted | comments |
| `punct` | string | muted | brackets, commas and operators |

Brand knobs: lang, tab, size, leading, frame, italic, keyword, name, type, string, number, atom, comment, punct.

## Style variables consumed
- `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono`; the size role `--mm-size-body` (or `--mm-size-h2`), shrunk to fit; never the caption size, which is under the body floor at 16x9
- palette roles `--mm-color-surface`, `--mm-color-line` (the plate), `--mm-color-surfaceInk` and `--mm-surface-muted` (text on the plate), `--mm-color-ink` and `--mm-color-muted` (bare), `--mm-accent-text` (accent text, which a brand with `accentText: false` keeps in ink), `--mm-color-accent` and `--mm-color-accentInk` (the label)
- `--mm-space-2`, `--mm-space-3`, `--mm-radius-1`, `--mm-radius-2`, `--mm-safe`, `--mm-frame-w`, `--mm-frame-h`
- duration role `hold` (the beat's length; a beat's `params.dur` of a few seconds shows several steps), `standard` (the first reveal and each morph); easing roles `enter` (the first reveal) and `move` (a morph)

## Legibility and rest notes
At the end of the beat the last state rests: every token drawn once on its grid, nothing faded, nothing mid-slide; a select that is still in force keeps its dimming and a call keeps its box and label. The block's size is the largest over all the steps (its widest line and its most lines), so it never resizes; its font is shrunk until that width fits the room its parent gives inside the safe area. The kept tokens arrive by 0.6 of a morph, where new text begins to show, so new ink never lands on ink still on its way. Text outside a select is drawn at 0.2 of its colour: it is context, not copy, and a story should not rely on reading it.

## Provenance
- motion-canvas/motion-canvas, MIT: the model of its code component, ported as pure functions: the morph's windows and drift, the running cursor, the selection at 0.2, ranges found by exact text with a box per line, the edit vocabulary, the grid with tabs expanded. Its theme, highlighter and diff are not used.

## Known limits
- the grid is `ch`: a brand's mono face should be truly monospaced, and wide glyphs (East Asian full-width, some emoji) take one column
- the lexer is a small one for js, py, sh and json: no template-literal interior, no regular-expression literals, no type-aware roles
- a moved line is a delete and an insert (the diff does not detect moves)
- a call's label stands in the foot of the block, not beside its range; a block that holds a call always reserves that row
- a deck plays every step on the beat's own timeline when its press arrives; it has no press per step
- the first code is the beat's `text`, at most 400 characters
- the gate counts arrivals, not morphs: a code beat longer than the style's dead-air limit draws W-DEAD, W-READ reads its text as words and a numeric `params.dur` draws W-DUR-LITERAL; end a beat on `select none`, since dimmed text at a rest draws W-FOCUS
