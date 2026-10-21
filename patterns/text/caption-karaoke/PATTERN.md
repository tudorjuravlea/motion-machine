# text/caption-karaoke

## Purpose
Cuts a line into groups of 2 to 6 words and lights the words of one group in turn.

## Use when / Do not use when
**Use when**
- captions for narration or music, one readable group at a time [H-INFO]
- a sing-along or a read-along line

**Do not use when**
- with the beat's duration shorter than about 0.3 s per word (W-READ): the lighting runs faster than anyone reads
- for a single short phrase: use `punch` or `fade`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `group` | number | 4 | words per group, clamped to 2 to 6 |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-ink`, `--mm-color-accent`, `--mm-color-muted`
- duration role `hold` is the whole line; override with `params.dur`

## Legibility and rest notes
Exactly one group is visible at any instant (W-CAPTION) and groups swap on a hard cut. At p = 1 the last group stands with every word in ink, no highlight. The accent word is a colour change only, no motion. Groups hold 2 to 6 words; a one-word tail is merged into the group before it.

## Provenance
- heygen-com/hyperframes, Apache-2.0: one caption group at a time, within a words-per-group range (W-CAPTION). Idea only; code is original.

## Known limits
- the timing is even across words; it does not follow a transcript, so for synced captions give each group its own beat
- the accent colour must read on the canvas at the highlight frames
- the kit does not load `pattern.html` for the text group; the fragment is the reference
