# moves/morph

## Purpose
Inside a scene one thing becomes another: a box travels from one slot to another, or a shape (a logo, an icon) becomes the next shape.

## Use when / Do not use when
**Use when**
- a small thing turns into the big thing: a button into a player, a card into a workspace, a chip into a panel (`mode: box`)
- one mark becomes another: a logo into a logo, an icon into an icon, a symbol into the product's own (`mode: path`)
- the change should read as one object changing shape, not a fade between pictures

**Do not use when**
- the two boxes are in different scenes (use `transitions/shared-element`)
- the camera should move (use a camera move; the morph moves only its box or its shape)
- the shapes are pictures with colour and detail, not outlines: a path morph draws one palette role

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | string | (none) | the slot the box (or shape) starts on |
| `to` | string | (none) | the slot the box (or shape) becomes |
| `start` | number | 0.6 | seconds into the scene when the morph begins |
| `dur` | number | 1.2 | seconds the morph lasts |
| `mode` | enum(box\|path) | `box` | box: one box becomes another; path: one shape becomes another |
| `fromPath` | string | (none) | path mode: path data for the first shape; empty reads the `from` slot's `<svg>` or SVG asset |
| `toPath` | string | (none) | path mode: path data for the second shape; empty reads the `to` slot |
| `smoothing` | number | 0.04 | path mode: one anchor per this share of a shape's diagonal, evenly spaced between corners (0 keeps each shape's own anchors) |
| `rotate` | boolean | false | path mode: turn about an origin instead of blending straight across, without folding |
| `origin` | string | `50% 50%` | path mode, rotate: the point the first shape turns about, as shares of its box (`50% 50%`, `left top`) |
| `originTo` | string | (none) | path mode, rotate: the same for the second shape; empty is the same shares of its box |
| `ink` | enum(ink\|accent\|muted\|surface) | `ink` | path mode: the palette role the shape is drawn in |
| `render` | enum(fill\|outline) | `fill` | path mode: a filled shape or its outline |
| `weight` | number | 0.006 | path mode, outline: the line's weight as a share of the frame's short side |
| `fillRule` | enum(nonzero\|evenodd) | `nonzero` | path mode: how counters are cut out of a filled shape |

Given as the scene's `move` with `moveParams`.

Brand knobs: mode, smoothing, rotate, origin, originTo, ink, render, weight, fillRule.

## Style variables consumed
- `--mm-color-surface` (the box), `--mm-color-ink` (the ghost's dashes; the shape by `ink`), `--mm-color-accent`, `--mm-color-muted` (the shape by `ink`)
- `--mm-radius-3`
- `--mm-space-1`
- `--mm-frame-w`, `--mm-frame-h` (the outline's weight as a share of the short side)
- `motion.spring.ui` (left and width), `motion.spring.heavy` (top and height) in box mode; the `move` easing in path mode

## Legibility and rest notes
- Before the morph only `from` shows; after it only `to`, at its own box, and the overlay is gone.
- Box mode: the box's left and width spring on `ui`, its top and height on `heavy`, so it stretches before it deepens; `from` fades out over the first quarter; `to` fades in from 55 %, while the box fades away.
- Path mode: the correspondence between the two shapes is worked out once and each frame is its blend at the move's progress, so a frame is the same in either seek order. Pieces are paired biggest first by size and nearness (a counter goes with a counter); a piece with no partner grows from a point of the other shape; a closed pair begins at the offset whose anchors lie nearest.
- Path mode, shapes read from the slots: the first frame of the morph lies exactly over the picture the slot shows (an inline `<svg>` or a beat's SVG asset), so the hand-over is not seen. Shapes given as path data, or in a slot that holds no picture of its own, are drawn by the pattern itself, at rest too.
- It sets its slots' opacity, so the kit runs it after the entrances (`afterItems`).

## Provenance
- motion-canvas/motion-canvas, MIT: the idea of pairing pieces, equalising anchors and choosing the start point of least squared distance for a shape morph; no code taken.
- motiondivision/motion, MIT: the idea of a morph's in-between shapes being a function of progress alone; no code taken.
- greensock/GSAP, Proprietary: ideas only (pairing by size and place, a piece grown from a point, equal-arc anchors with corners kept, a rotational blend with an anti-tear rule); its source was never opened or copied.

## Known limits
- Box mode, films only: in a deck the morph's window is in seconds, which a press does not carry. The box is a plain surface panel; its content does not travel with it.
- Path mode draws one palette role; a mark's own colours are not carried. Gradients, strokes, clip paths and masks in an SVG are ignored; a shape that carries a `transform` is not moved by it (a note in `mm.warnings` says so): flatten it in the drawing tool.
- An SVG asset is taken as drawn to fit its box whole (contain), the way an `<img>` in a slot shows it; a picture cropped to fill (`cover`) will not line up.
- Two shapes of very different complexity (a ring and a lettering) pair their biggest pieces and grow or shrink the rest; the result is a morph, not a transformation of one into the other letter by letter.
