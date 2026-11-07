# ui/form-fix

## Purpose
Shows a form field filled wrongly, its error named in a lane held back for it, the value corrected, and the button confirming on itself.

## Use when / Do not use when
Use when:
- the story is that a product catches a mistake kindly and lets it be fixed in place
- the error must read without anything on the panel shifting

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- the error needs more than one line, or the form has more than one field; cut the words first

## Params
| name | type | default | meaning |
|---|---|---|---|
| label | string | Email | the field's name, shown above it |
| wrong | string | (empty) | the value typed first, which the form refuses |
| error | string | (empty) | what the form says is wrong, in words, one line |
| right | string | (empty) | the corrected value |
| button | string | Save | the button's label before it is pressed |
| done | string | Saved | the label it crossfades to, in place |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/form-fix"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`, `--mm-color-alert`, `--mm-color-ink`, `--mm-color-canvas`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 the corrected value is in the field, the error lane is empty but still holds its place, and the button reads its done label at its original width; nothing moves, so the rest works as the poster and under reduced motion. The error says its fault in words and sits beside an accent mark, so colour never carries it alone. The cursor has left by the rest and covers no label. Every part is laid out at its final geometry from the first frame.

## Provenance
Stageshow, MIT: the story shape only (wrong value, error in its own lane, fix, button confirms), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 6.25 s; the typing windows are fixed, so a long value types faster.
- One field and one button.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
- The error is one line; a longer one wraps and makes the reserved lane taller for the whole piece.
- A brand with no `alert` role marks the fault with its accent and the words.
