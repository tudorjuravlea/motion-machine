# text/annotate

## Purpose
A small mark that points at a part of the frame, off the device: a tooltip with a tail, a curly brace along a span, a measure with end ticks and a value, a dashed leader to an end dot, a status dot with two sonar rings, a crosshair, or a timestamp or key chip.

## Use when / Do not use when
**Use when**
- a recording or a picture needs a pointer, a span, a size or a status said in a few words, drawn beside it rather than on the device (for a mark on a screen use `screen/callout`)
- one mark per scene: a tooltip on the thing to tap, a brace over the part that lasts two minutes, a pulse on what is live

**Do not use when**
- the thing to point at is a text of the scene that should itself change (use `emphasis/dimension`, `emphasis/brackets` or `emphasis/circumscribe`)
- the host slot is in the text flow: give the beat an overlay slot (`layouts/talking-full`, `layouts/caption-bar`), whose box the marks are drawn in
- several marks fight for one frame: three annotations are a diagram nobody reads

## Params
The slot's text is the label (the value, for a measure; the chip's own text for a chip). The marks are drawn in the host's pixels.

| name | type | default | meaning |
|---|---|---|---|
| `kind` | enum(tooltip\|brace\|measure\|leader\|pulse\|crosshair\|chip) | `tooltip` | `tooltip` a bubble with a tail that points at `at`; `brace` a curly brace drawn along the span `at` to `to` (or along a slot's text), the label at its cusp; `measure` a line with end ticks and the value on it; `leader` a dashed leader from `at` to an end dot at `to`, the label beside the dot; `pulse` a status dot at `at` with two sonar rings that expand once; `crosshair` a reticle at `at` with a label; `chip` a keycap or timestamp chip centred on `at` |
| `at` | string | `50%,50%` | the point: `x%,y%` of the overlay area, or the name of a slot of the same scene (its text is pointed at; a brace or measure with no `to` runs along its text, just under it) |
| `to` | string | none | the second point, `x%,y%` of the overlay area: the far end of a brace or a measure, the end dot of a leader; empty takes the slot's text width, or a default offset for a leader |
| `place` | enum(auto\|above\|below\|left\|right) | `auto` | the side of the point the label sits on (a brace's bulge); auto takes the side with more room |
| `tone` | enum(accent\|ink\|muted) | `accent` | the palette role of the lines and dots |
| `stroke` | number | `0.35` | the weight of the lines as a share of the frame's short side, in percent (0.1 is a hairline, 0.8 is bold) |
| `face` | enum(auto\|text\|mono) | `auto` | the label's face: auto sets a measure and a chip in mono and every other label in the text face |

Brand knobs: kind, stroke, tone, face.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` (by `tone`), `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`
- `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text`, `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono`, `--mm-size-body`
- `--mm-space-1` to `--mm-space-3`, `--mm-radius-1`, `--mm-radius-2`, `--mm-frame-w`, `--mm-frame-h`
- the entrance is the duration role `slow` and the style's `enter` easing; marks are sized from `ctx.unit`

## Legibility and rest notes
- The label is DOM text at body size on a surface plate in surface ink, so the gate reads its size and contrast; it is kept inside the host's box (inside the safe margin for the shipped overlay slots).
- Lines draw by dash (a pulse and a crosshair also scale), the tail of a tooltip scales out of its point, the label scales and fades in behind the line: all of it on the beat's entrance clock, a pure function of `t`.
- The sonar rings of a pulse expand once, each from the dot to about five times its radius, fading as they go, and are gone before the entrance ends: at rest there is a dot and a label, nothing mid-motion.
- A mark stays put after it has arrived; `out` takes the whole thing away with the slot.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only; no code taken. The vocabulary of off-device marks (tooltip with tail, brace, measure line with end ticks, dashed leader with end dot, status dot with sonar rings, crosshair, timestamp chip), restated as one pattern with a `kind` param, its own geometry and the brand's roles.

## Known limits
- The point is in the host's pixels: it does not follow a camera move that the host does not make with the picture. Put the scene's move on the picture (`target: media`) or keep the scene still while a mark is on.
- A slot target is read once per seek, from the slot's laid-out ink; a slot that is still arriving when the mark draws is read where its box is already laid out.
- A brace or measure is a straight span; a curved or bent span is two marks.
- Labels do not avoid each other or the picture's content: place by hand.
- A tooltip's tail is a triangle in a fixed share of the type size; a very long label keeps its tail at the bubble's nearest end.
