# text/caption-karaoke

## Purpose
Cuts a line into groups of 2 to 6 words, breaking where a reader would breathe, and lights the words of one group in turn: evenly over the beat (`mode: even`), or in time with the words of the story's footage (`mode: words`).

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
| `group` | number | 4 | words per group asked for, clamped to 2 to 6 (with `breaks: score` a group holds 2 to 6 words around it) |
| `mode` | enum(even\|words) | `even` | `even`: the beat's text timed evenly over the entrance; `words`: the footage's words (`story.footage`, edit.json `words`), timed to speech; the beat needs no text |
| `lead` | number | 0.05 | `mode: words`: seconds a group shows before its first word is heard, clamped to 0 to 0.1 |
| `breaks` | enum(score\|count) | `score` | where groups break. `score`: at the best break points (a sentence end, then strong punctuation, then a pause of 150 to 400 ms in the speech, then a phrase boundary), never one word alone, never ending on a word that wants the next (the, of, and); `count`: runs of `group` words, as the pattern always cut them |
| `chars` | number | 30 | `breaks: score`: the most characters a group holds, wide scripts (Chinese, Japanese, Korean) counted as two each; 0 for no limit |

Brand knobs: breaks, chars, group, lead

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object. A brand sets them for every use with `style.patterns["text/caption-karaoke"]`.

## Style variables consumed
- `--mm-color-ink`, `--mm-color-accent`, `--mm-color-muted`
- duration role `hold` is the whole line; override with `params.dur`

## Legibility and rest notes
Exactly one group is visible at any instant (W-CAPTION) and groups swap on a hard cut. `mode: even`: at p = 1 the last group stands with every word in ink, no highlight. `mode: words`: a group appears `lead` seconds before its first word (never after it, never more than 0.1 s before it), whole and at full opacity, and stays until the next group's turn; the word being said is in the accent, said words in ink, words to come muted; before the first word the slot is empty. The words and the clock come from `ctx.footage`, so any seek order gives the same frame. The accent word is a colour change only, no motion. Groups hold 2 to 6 words; with `breaks: count` a one-word tail is merged into the group before it, with `breaks: score` no group is one word. In `mode: even` with `breaks: score` the time is spread over the words, so a long group lights its words as fast as a short one.

## Provenance
- heygen-com/hyperframes, Apache-2.0: one caption group at a time, within a words-per-group range (W-CAPTION). Idea only; code is original.
- robinebers/attentionmachine-skills, PolyForm Internal Use 1.0.0: phrase captions that show at or before their first spoken word and swap on the next. Ideas only; no code taken.
- OpenChatCut, AGPL-3.0: caption line breaks chosen by a score (sentence ends, punctuation, pauses of 150 to 400 ms as weak breaks, no orphans, width in character units with wide scripts as two). Ideas only; no code taken.

## Known limits
- `mode: even` is even across words; for captions synced to speech use `mode: words` with footage words (there is no transcriber: the word list is supplied to `mm footage cut --words`)
- `breaks: score` knows punctuation, pauses and a short list of English and Romanian function words only; another language gets sentence ends, punctuation, pauses and the width, and falls back to the group size elsewhere
- `mode: words` groups the footage's whole word list from its first word, so a group can run across a scene cut; with no footage words it falls back to `mode: even` over the beat's text
- the accent colour must read on the canvas at the highlight frames
- the kit does not load `pattern.html` for the text group; the fragment is the reference
