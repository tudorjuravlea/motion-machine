# text/kinetic-words

## Purpose
Shows one word or phrase at a time, each replacing the last, ending on the final one.

## Use when / Do not use when
**Use when**
- a rhythm of three to six short words, such as a list of verbs or a countdown of ideas [H-ONE]
- a kinetic style where text carries the beat

**Do not use when**
- for sentences that must be read as a whole: only one phrase is ever on screen
- with a duration too short for the number of phrases: each turn is the entrance divided by the phrase count

## Params
| name | type | default | meaning |
|---|---|---|---|
| `sep` | string | `|` | what separates the phrases in the beat text |
| `d` | number | 36 | rise per phrase in px before the style multiplier |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the rise
- duration role `hold` is the whole sequence; override with `params.dur`
- spring role `type` for the arrival, easing role `exit` for the departure

## Legibility and rest notes
At p = 1 only the last phrase is present, at rest and unmoved. Every earlier phrase finishes its exit (opacity 0) before the next turn begins, so two phrases are never on screen together (the exit guarantee). Phrases never overshoot.
- When the slot paints its own box (a fill or a border, as a tile or a plate does), the slot's own opacity follows the first phrase, so the box fades in with its first text and never shows empty; a plain text slot gets no opacity of its own.

## Provenance
original

## Known limits
- the kit does not load `pattern.html` for the text group; the markup is built in `pattern.js` and the fragment is the reference
- a phrase that wraps can change the block's height between turns
- phrases split on the `sep` param, `|` by default
