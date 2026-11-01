# entrances/line-reveal

## Purpose
Brings a headline in line by line, word by word or letter by letter from behind a clip edge, following the real wrapping in the brand's face at the format being drawn.

## Use when / Do not use when
**Use when**
- a headline of two to six lines that should arrive as the eye reads it, with no line broken where the page would not break it, in 16x9 as in 9x16 [H-INFO]
- a brand that reveals type from behind a mask edge rather than fading it
- a letter or word roll (`mode: roll`) for a counter, a version or a short label that wants to feel mechanical

**Do not use when**
- a single short word: there is one unit and nothing to stagger
- text that must not become blocks while it moves: lines are blocks and words and letters are inline blocks until the entrance ends
- a body paragraph: the cascade is capped, so many lines arrive nearly together

## Params
| name | type | default | meaning |
|---|---|---|---|
| `unit` | enum(line\|word\|char) | line | what arrives in turn: a line of the real wrapping, a word or a letter |
| `from` | enum(bottom\|top\|left\|right) | bottom | the clip edge a unit slides in from |
| `mode` | enum(rise\|roll) | rise | rise: the unit slides in from behind its clip edge; roll: each word or letter has a twin and turns over like a drum as it lands |
| `mask` | boolean | true | clip each unit at its box, so it appears from behind an edge; false lets it fade in instead |
| `travel` | number | 1 | how far a unit starts from its place, in boxes of its own size |

Brand knobs: unit, from, mode, mask, travel.

## Style variables consumed
- `--mm-travel` is not read: the distance is the unit's own box, so it scales with the type
- `style.motion.stagger.eachS` and `.capS` set the stagger and its cap (W-STAGGER)
- duration role `slow`
- spring role `type` shapes each unit and never overshoots
- `runtime/kit/split.css`: the clip box reaches `--mm-split-pad` (0.16 em) past a unit, so a descender or an accent is not cut as it passes

## Legibility and rest notes
At the end of the entrance the plain text is restored, so the DOM and the picture at rest are those of the layout. Lines are read from the laid-out words after the fonts are ready, so a break is exactly where the page broke the plain text at this format; the slot keeps the width it had. The whole cascade is at most capS and at most 60 % of the entrance. A clipped unit needs no fade (nothing shows before it enters), so no pixel is half-transparent type at a rest. When the slot paints its own box (a fill or a border), its opacity follows the first unit so the box never shows empty. In a deck the original text stays beside the units in a visually hidden copy, and the units are `aria-hidden`.

## Provenance
- juliangarnier/anime, MIT: the text splitter's way of reading lines from laid-out words, its clip box around a unit and the twin of a unit for a slot-roll, rewritten in `runtime/kit/split.js`.
- greensock/GSAP, proprietary: idea only, from a report (a line starts when a word is lower and has moved back, so a baseline shift is not a new line). No code taken.

## Known limits
- inline markup inside the slot is replaced by plain text: the splitter reads text only
- the lines are blocks that do not wrap: a headline whose width would change after the split (a justified one) keeps the width it had but is not re-justified
- a roll turns each unit over by one box, then returns to the plain text: it suits a letter or a short word, not a line
- the clip box reaches 0.16 em beyond a unit; a face with ink taller than that is cut as it passes the edge
