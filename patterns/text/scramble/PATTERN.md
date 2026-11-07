# text/scramble

## Purpose
Decodes a line from noise, or edits one value into another: every glyph has its own window, and with a `before` text only the glyphs that changed step.

## Use when / Do not use when
**Use when**
- a technical, hacker or data-themed reveal of a short line [H-INFO]
- a title that wants to feel computed
- a figure, a version or a status that changes in the story ("v1.2" to "v1.3", "Uptime 99.5%" to "99.9%"): give the old text as `before` and only the characters that differ step

**Do not use when**
- for long lines: the noise dominates and the line takes long to read
- in a calm brand: the effect is restless by nature, unless `charset` is `none`, which steps the changed glyphs with no noise at all

## Params
| name | type | default | meaning |
|---|---|---|---|
| `before` | string | (empty) | the text the slot shows first, to edit into the beat's text; empty decodes the line from noise |
| `from` | enum(auto\|left\|right\|center\|random) | auto | which glyphs resolve first; auto goes from the right when the text shrinks and from the left otherwise |
| `charset` | string | own | the noise: names joined by + (`own`, `letters`, `lowercase`, `uppercase`, `numbers`, `symbols`, `braille`, `blocks`, `shades`), or `none` for a value that steps without noise |
| `pool` | string | (empty) | the brand's own glyphs the noise is drawn from (a range x-y is expanded); empty uses `charset` |
| `rate` | number | 20 | glyph steps per second: noise holds still for one step |
| `changes` | number | 0 | how many times the noise reshuffles across the entrance; 0 uses `rate` |
| `settle` | number | 0.35 | the share of the entrance each glyph spends in noise before it resolves |
| `jitter` | number | 0 | 0 to 1: how far each glyph's window is shifted by a seeded amount |
| `delay` | number | 0 | the share of the entrance before the first glyph moves |
| `hold` | number | 0.15 | the share at the end the finished text stays still, to be read |
| `diff` | boolean | true | with `before`, keep the common start and end still and step only what changed |
| `reversed` | boolean | false | turns the order round |
| `noise` | enum(muted\|ink\|accent\|line\|inherit) | muted | the palette role of a glyph that is still noise |
| `settled` | enum(inherit\|ink\|accent\|muted) | inherit | the palette role of a glyph that has resolved and of the old text before its window; inherit keeps the slot's own colour |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object. Brand knobs: charset, pool, rate, settle, jitter, hold, from, noise, settled.

## Style variables consumed
- duration role `slow`
- palette roles `--mm-color-muted`, `--mm-color-ink`, `--mm-color-accent`, `--mm-color-line` (noise and settled glyphs)
- the style's own letters supply the noise by default, so no glyph outside the bundled face is shown unless the brand names a pool

## Legibility and rest notes
At p = 1 the plain text is restored. Letters are fully resolved by 85 % of the entrance (`hold`), which leaves the last 15 % as a still read. While scrambling each glyph keeps the width of the glyph it is becoming, and a noise glyph wider than that is drawn smaller to fit its cell, so the line does not jitter or overlap. The noise is a hash of the glyph's place and step: the same instants give the same line in any seek order.

## Provenance
- juliangarnier/anime, MIT: the scramble's reveal schedule (each glyph's window ranked by position, spaced by the settle share, ending on a step boundary, a jitter, a direction that follows the text's length, the extra glyphs of a shorter text held to go first) and its named glyph pools, rewritten in `runtime/kit/scramble.js` over graphemes with hashed noise.
- greensock/GSAP, proprietary: ideas only, from a report (a reveal delay, a refresh of 20 Hz, a tint for noise and for resolved text, a diff of one text into another). No code taken.

## Known limits
- scrambling glyphs are inline blocks of fixed width: a glyph much wider than its cell is shrunk, a much narrower one is centred in it
- a pool of more than 64 glyphs (braille, blocks) is not matched to the width of the real glyph, only shrunk to fit
- the glyph widths are measured on every call (a layout read)
- `diff` keeps the common start and end of the two texts, not equal glyphs in the middle: "Lemon Banana" to "Simple" steps every glyph
- a settled glyph in a role other than the slot's own steps back to the slot's colour at rest
- the kit does not load `pattern.html` for the text group; the fragment is the reference
