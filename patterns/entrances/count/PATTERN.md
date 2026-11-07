# entrances/count

## Purpose
Counts a number up from a start value to its fact, with steady digit widths.

## Use when / Do not use when
**Use when**
- a figure that stands alone in its press or scene, with a source in the story's facts [H-ONE, H-FACTS]
- a percentage or a total where the movement itself says "growth"

**Do not use when**
- for a number that is not a measurement (a year, a phone number, a version)
- for several figures at once: one count per scene, and hold after it [H-STILL]

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 0 | the number it counts up from |
| `prefix` | string | (empty) | text before the number |
| `suffix` | string | (empty) | text after the number, such as a unit or a percent sign |
| `fix` | number | -1 | decimals; -1 takes them from the value |
| `pad` | number | 0 | minimum integer digits, zero filled |
| `unit` | enum(land|always) | `land` | land: the prefix and suffix keep their place but show only on the landed number, so no frame reads "1 rules"; always: they count along |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

With no `value`, the target is the first number in the slot's text (digits grouped with commas count as one number) and the words around it stay, as an implicit prefix and suffix: "Save 40% today" counts the 40 and lands as "Save 40% today".

## Style variables consumed
- duration role `slow`
- easing role `move` shapes the count (in-out, so the count reads as counting)
- `font-variant-numeric` is set by the kit's `count()`

## Legibility and rest notes
At p = 1 the text is exactly the fact's value formatted with the given decimals, prefix and suffix. `count()` clamps p, so no spring or overshooting ease can show a number the fact does not carry. Opacity reaches 1 in the first quarter. With `unit: land` (the default) the prefix and suffix are laid out but invisible until p = 1, so a paused frame never pairs a unit with a number the fact does not carry, and the figure's box does not jump when the unit appears.

## Provenance
original

## Known limits
- no thousands separator: the kit's `count()` writes plain digits, so "1,250" lands as "1250"
- the counted width changes as digits grow; centre or right-align the slot to keep it steady
- reads `data-value` (the beat's `value`) or the first number in the slot text
