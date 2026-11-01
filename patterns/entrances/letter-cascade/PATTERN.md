# entrances/letter-cascade

## Purpose
Drops every letter of a short line into place in a quick ripple.

## Use when / Do not use when
**Use when**
- a short title or a name of one to three words where the ripple is the moment [H-INFO]
- a kinetic style that wants texture in its type

**Do not use when**
- for a sentence: the ripple is capped, so long lines ripple faster, not longer, and stop reading as a cascade
- for body copy at small sizes: per-letter spans are heavy to lay out

## Params
| name | type | default | meaning |
|---|---|---|---|
| `d` | number | 36 | drop per letter in px before the style multiplier |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-travel` scales the drop
- `style.motion.stagger.eachS` and `.capS`
- duration role `slow`
- spring role `type`

## Legibility and rest notes
At the end of the entrance the plain text is restored, so the face's own kerning is back between letters. The cascade is at most capS and 60 % of the entrance. Opacity never overshoots.
- When the slot paints its own box (a fill or a border, as a tile or a plate does), the slot's own opacity follows the first letter, so the box fades in with its first text and never shows empty; a plain text slot gets no opacity of its own.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the stagger cap of 0.5 s (W-STAGGER). Idea only; code is original.
- juliangarnier/anime, MIT: the text is split by the kit's splitter (`runtime/kit/split.js`): letters as whole graphemes (an accent, an emoji with a skin tone or a joined family is one letter), kept in a word that does not break.

## Known limits
- while moving, letters are inline blocks and lose kerning with their neighbours; at rest the kerning returns, which can shift a pair by a pixel on the last frame
- a letter is a whole grapheme: an accent stays with its letter, an emoji with its tone is one unit
