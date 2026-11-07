# exits/lower-third

## Purpose
Takes a `text/lower-third` out the way its mechanism came in: the bar wipes away, the brackets retract, the plate turns back on its edge, the tab slides out, the name un-types, the strip and the pill shrink to their start.

## Use when / Do not use when
**Use when**
- a beat's entrance is `text/lower-third` and it leaves with `out`: set `"exit": "exits/lower-third"`

**Do not use when**
- the beat is anything else: the pattern redraws the lower third's own markup and does nothing useful on another slot
- the lower third should simply fade (use `exits/fade-out`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) | | | It reads the lower third's own params (`mechanism`, `side`, `tone`, `plate`, `stroke`, `progress`, `caret`) from the beat and from the brand's `style.patterns["text/lower-third"]`, exactly as the entrance does, so the two cannot disagree. |

## Style variables consumed
- everything `text/lower-third` consumes, through its stylesheet
- easing role `exit`, and `style.motion.exitRatio` (applied by the kit to the entrance duration)

## Legibility and rest notes
At p = 0 nothing is written. The kit hides the slot when the exit completes. The exit is short (exitRatio of the entrance), so the stamp, the tab and the typed name move quickly: that is the intended weight of an outro.

## Provenance
original

## Known limits
- It imports the lower third's module, so the two travel together; a piece that names the exit also names the entrance.
- The stamp does not bounce backwards: it lifts and fades.
