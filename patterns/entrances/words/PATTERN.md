# entrances/words

## Purpose
Brings a line in word by word, each word rising and fading in turn.

## Use when / Do not use when
**Use when**
- a headline of four to twelve words where the order of the words matters [H-INFO]
- a statement that should be read at the pace it arrives

**Do not use when**
- for a single word or a very long paragraph: the cascade is capped, so many words arrive nearly together
- on text that must not reflow: words become inline blocks while they move

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 28 | rise per word in px before the style multiplier |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the rise
- `style.motion.stagger.eachS` and `.capS` set the stagger and its cap (W-STAGGER)
- duration role `slow`
- spring role `type` shapes each word and never overshoots

## Legibility and rest notes
At the end of the entrance the plain text is restored, so the DOM and the picture at rest are those of the layout. The whole cascade is at most capS and at most 60 % of the entrance, so every word has at least 40 % of the entrance to land. Opacity never overshoots.
- When the slot paints its own box (a fill or a border, as a tile or a plate does), the slot's own opacity follows the first word, so the box fades in with its first text and never shows empty; a plain text slot gets no opacity of its own.

## Provenance
- heygen-com/hyperframes, Apache-2.0: a stagger span of at most 0.5 s, enforced here by capS (W-STAGGER). Idea only; the splitting code is original.
- emilkowalski/skills, MIT: per-item stagger gaps of 30 to 80 ms read as one gesture; eachS is the style's own number.
- juliangarnier/anime, MIT: the text is split by the kit's splitter (`runtime/kit/split.js`): words from the platform's word segmenter with punctuation glued, letters as whole graphemes.

## Known limits
- the kit does not do `data-each`, so this pattern splits the text with the kit's splitter; markup inside the slot is replaced by plain words
- a hyphenated word is one unit, a dash set between spaces is a unit of its own
- in a script written without spaces (Japanese) the words come from the dictionary, so the cascade follows them
- the cascade runs left to right whatever the script direction
