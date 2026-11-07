# ui/answer

## Purpose
Shows an assistant at work in one panel: a question is typed and sent, the word for thinking pulses, the answer streams in and its sources arrive last.

## Use when / Do not use when
Use when:
- the story is what an assistant does with a question
- a real recording would be slow, private or not yet possible

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- the answer runs past two lines; cut the words first

## Params
The answer is the `answer` param, else the beat's `text`.

| name | type | default | meaning |
|---|---|---|---|
| ask | string | (empty) | the question, a short line |
| answer | string | (empty) | the answer, two lines at most; empty uses the slot text |
| sources | string | (empty) | what it drew on, separated by \|, two at most; empty omits them |
| thinking | string | Thinking | the word shown while it works |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/answer"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` easing

## Legibility and rest notes
At p = 1 the question, the whole answer and the sources are showing and nothing moves, so the rest works as the poster and under reduced motion. Every word is laid out from the first frame, so the stream never reflows.

## Provenance
Stageshow, MIT: the story shape only (question, thinking, answer, sources last; words laid out before they show), restated as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 6.6 s; the typing and the stream share out their windows, so a long answer streams faster.
- On a device's screen the type stays at the body floor, so a phone needs a tall frame.
- The question and answer carry no fact: a claim in them is the story's to source.
