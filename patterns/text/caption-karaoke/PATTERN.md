# text/caption-karaoke

## Purpose
Cuts a line into groups of 2 to 6 words and lights the words of one group in turn: evenly over the beat (`mode: even`), or in time with the words of the story's footage (`mode: words`).

## Use when / Do not use when
**Use when**
- captions for narration or music, one readable group at a time [H-INFO]
- a sing-along or a read-along line
- captions for talking-head footage (`layouts/talking-full`, `mode: words`): the words come from `mm footage cut --words`, on the film's clock

**Do not use when**
- with the beat's duration shorter than about 0.3 s per word (W-READ): the lighting runs faster than anyone reads
- for a single short phrase: use `punch` or `fade`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `group` | number | 4 | words per group, clamped to 2 to 6 |
| `mode` | enum(even\|words) | `even` | `even`: the beat's text timed evenly over the entrance; `words`: the footage's words (`story.footage`, edit.json `words`), timed to speech; the beat needs no text |
| `lead` | number | 0.05 | `mode: words`: seconds a group shows before its first word is heard, clamped to 0 to 0.1 |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-ink`, `--mm-color-accent`, `--mm-color-muted`
- duration role `hold` is the whole line; override with `params.dur`

## Legibility and rest notes
Exactly one group is visible at any instant (W-CAPTION) and groups swap on a hard cut. `mode: even`: at p = 1 the last group stands with every word in ink, no highlight. `mode: words`: a group appears `lead` seconds before its first word (never after it, never more than 0.1 s before it), whole and at full opacity, and stays until the next group's turn; the word being said is in the accent, said words in ink, words to come muted; before the first word the slot is empty. The words and the clock come from `ctx.footage`, so any seek order gives the same frame. The accent word is a colour change only, no motion. Groups hold 2 to 6 words; a one-word tail is merged into the group before it.

## Provenance
- heygen-com/hyperframes, Apache-2.0: one caption group at a time, within a words-per-group range (W-CAPTION). Idea only; code is original.
- robinebers/attentionmachine-skills, PolyForm Internal Use 1.0.0: phrase captions that show at or before their first spoken word and swap on the next. Ideas only; no code taken.

## Known limits
- `mode: even` is even across words; for captions synced to speech use `mode: words` with footage words (there is no transcriber: the word list is supplied to `mm footage cut --words`)
- `mode: words` groups the footage's whole word list from its first word, so a group can run across a scene cut; with no footage words it falls back to `mode: even` over the beat's text
- the accent colour must read on the canvas at the highlight frames
- the kit does not load `pattern.html` for the text group; the fragment is the reference
