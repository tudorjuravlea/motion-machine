# ui/annotate

## Purpose
Names up to three things on a small product card: for each note in turn its row lights, a thin leader draws from the note to the row's value, and the note fades in.

## Use when / Do not use when
Use when:
- the story is "look at these three things" on one small card
- each note should be tied to one visible value by a line the viewer can follow

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- there are more than three rows or three notes, or a note runs past two short lines

## Params
| name | type | default | meaning |
|---|---|---|---|
| title | string | (empty) | the card's name |
| rows | string | (empty) | the three rows of the card, as Label:value separated by \|, three at most |
| notes | string | (empty) | up to three notes, as row:text separated by \|, in the order they are told; rows count from 0, the top row |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface, on the card only |

Brand knob: surface (`style.patterns["ui/annotate"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-ink`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` and `move` easings

## Legibility and rest notes
The panel itself has no card: only the inner card has the surface, so the notes sit on the stage ground in the ink role. At p = 1 every row is lit, every leader is whole with its dot, every note is showing and nothing moves, so the rest works as the poster and under reduced motion. Every box is laid out at its final size first and only its opacity and the leaders change, so no word reflows. A leader leaves its note level and arrives level, 0.3em short of its value, and runs only through empty ground: beside the card in 16x9, and below it in 9x16 and 1x1 along a lane to the right of the card, one lane per note, the nearest note naming the lowest row, so no leader crosses a word or another leader.

## Provenance
Stageshow, MIT: the idea only (a leader line that names one visible thing), written in our own code as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 6.95 s, for three notes; with fewer, the later slots are held still.
- Notes sit to the right of the card in 16x9 and 4x3, and below it in every other format.
- A note of more than two lines, or two notes on the same row, can meet each other; a note too tall for the card's height spills past it.
- A device screen takes the same layout as its format: a wide screen puts the notes beside the card, a tall one below it.
- The notes carry no fact: a claim in them is the story's to source.
