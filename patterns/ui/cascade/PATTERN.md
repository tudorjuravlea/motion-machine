# ui/cascade

## Purpose
Shows one cause and its dependents in a single panel: a selector is pressed, its thumb slides, and three values that depend on it roll to their new text in hierarchy order.

## Use when / Do not use when
Use when:
- the story is that one setting changes what follows from it (a price, a method, a date)
- the order of the changes should read as a hierarchy, the first value nearest the cause

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- there are more than three dependents, or a value runs past one short line

## Params
| name | type | default | meaning |
|---|---|---|---|
| options | string | (empty) | the choices of the selector, separated by \|, three at most; the first is on at the start, the last is pressed |
| from | string | (empty) | the three dependent values before, as Label:value separated by \| |
| to | string | (empty) | the three values after the press, separated by \|, in the same order as `from` |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/cascade"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-ink`, `--mm-color-canvas`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `move` and `enter` easings

## Legibility and rest notes
At p = 1 the pressed option is on, the three new values are showing and nothing moves, so the rest works as the poster and under reduced motion. The cursor has left the panel by then and covers nothing. Every value's box holds both its old and its new text from the first frame, and the characters the two share at the start and the end never move, so nothing reflows. The roll sits in a mask feathered by a gradient, never a hard clip.

## Provenance
Stageshow, MIT: the story shape only (one cause, then its dependents change in overlapping order), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 2.4 s; the three values start 0.10, 0.22 and 0.42 s after the thumb and each rolls for 0.5 s.
- Only the last option is pressed; the first is always the one on at the start.
- Each value is one line, and its box is as wide as the longer of its old and new text, so a very long new value squeezes the label.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
- The values carry no fact: a claim in them is the story's to source.
