# ui/presence

## Purpose
Shows two people working in one document at once: one sweeps a selection across a line while the other moves elsewhere and types, each in one colour that stays on their cursor, flag, selection and caret.

## Use when / Do not use when
Use when:
- the story is shared, live work: collaboration, review, co-editing
- a real recording of two people would be slow, private or not yet possible

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- more than two people matter; the idea reads at two, not at five
- the line or the phrase runs past one line; cut the words first

## Params

| name | type | default | meaning |
|---|---|---|---|
| title | string | (empty) | the document title, a few words |
| line | string | (empty) | the line the first person selects, one line |
| typed | string | (empty) | the phrase the second person types, one line |
| one | string | Design | the first person's name on their flag (a role, not a person) |
| two | string | Product | the second person's name on their flag (a role, not a person) |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/presence"] = { surface: "glass" }`). The two person colours are palette roles: the first is the accent, the second the surface ink.

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`, `--mm-color-ink`, `--mm-color-canvas`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 the selection is whole, the phrase is typed with its caret solid, both flags are on and both cursors have moved off the two lines but stay in the panel, so the presence still reads and nothing moves; it works as the poster and under reduced motion. The selection is a background as wide as the I-beam has travelled, so it is always under it. The typed phrase is laid out in full and revealed, so the line never rewraps. Flag text is the accent ink on the accent and the surface on the surface ink, the pairs the presets already make readable.

## Provenance
Stageshow, MIT: the story shape only (two people editing one document at once, a selection and typed text each in its own colour), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 4.2 s: sweep, hop, a short rest where the caret blinks, typing, then both step aside.
- Two people only; the second colour is the surface ink, so it is a dark stroke on a light preset and a light one on a dark preset.
- The line and the phrase must each fit on one line of the panel.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
