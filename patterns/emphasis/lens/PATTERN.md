# emphasis/lens

## Purpose
Focus through glass: the other items of a list or grid soften and dim while this one grows a little, stays sharp and gets a thin lens rim, holds, then everything clears.

## Use when / Do not use when
**Use when**
- one item of a `layouts/list-reveal`, `layouts/grid-break` or `layouts/bento-3` is the answer
- a "this one" moment where the rest should step back without leaving

**Do not use when**
- the element has no siblings in its layout (nothing to soften; use `emphasis/indicate`)
- as a style of frosted glass panels: it is a focus move, not glassmorphism

## Params
| name | type | default | meaning |
|---|---|---|---|
| `blur` | number | 0.06 | how soft the siblings get, in em, 0.02 to 0.12 |
| `zoom` | number | 0.06 | how much the element grows under the lens, 0 to 0.1 |

## Style variables consumed
- `--mm-color-ink` (the rim, at 30 %)
- `--mm-color-surface` (the glass tint, at 55 %)
- `--mm-radius-3`
- `--mm-space-1` (the rim width)
- duration role `slow`

## Legibility and rest notes
- At p = 0 and p = 1 the pattern writes nothing: no blur, dimming, scale or rim remains.
- The focused element is never blurred; it grows from its alignment side, so a left-aligned item keeps its left edge.
- Phases run on the beat's own clock: in over 25 %, hold to 80 %, out over the rest.

## Provenance
- charlie947/motion-graphics-skills, MIT: a blurred list with a sharp, magnified row under a lens (effect 14, "glass focus"); restated as an emphasis over sibling slots. No code taken.

## Known limits
- Siblings are the slots that share the element's parent; a headline in another container stays sharp.
- Blur on many large siblings is slower to render in software.
