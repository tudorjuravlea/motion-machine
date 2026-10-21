# 3d/particles-to-shape

## Purpose
The words gather out of a cloud in real depth: seeded particles fly in from in front of and behind the slot through a slowly turning 3D space, land on the letterforms, and the real text fades in as they land.

## Use when / Do not use when
**Use when**
- a title, a product name or a closing line that should arrive with depth (a launch, an opener)
- a dark or quiet scene where a cloud of points reads

**Do not use when**
- body copy or more than about four words
- a scene that already has a 3D stage or a busy background; or where `entrances/assemble` (flat, cheaper to render) is enough

## Params
| name | type | default | meaning |
|---|---|---|---|
| `particles` | number | 900 | how many particles build the words, 300 to 2400 |
| `depth` | number | 1 | how deep the cloud reaches in front of and behind the words, 0.3 to 1.6 |

## Style variables consumed
- the slot's own colour, face, size and tracking (the particles sample the laid-out words)
- duration role `slow` (a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- At p = 1 the slot is its plain text and the canvas is gone.
- The camera maps the words' plane 1:1 onto the canvas, so the landed particles sit exactly on the DOM text that replaces them.
- Particles land by 78 % of the entrance; the text fades in over the rest.
- The canvas is declared media and 3D (`data-media`, `data-3d`); its sampling text is drawn off screen only (`canvasText: true`).
- Every random draw comes from the slot's seed in a fixed order, and Three.js object naming is seeded (`ctx.seeded`), so the same t draws the same frame after any seek.

## Provenance
- charlie947/motion-graphics-skills, MIT: particles assembling into a logo or number (effect 16); restated as a 3D variant with Three.js points (vendored, MIT). No code taken.

## Known limits
- Rendered in software (SwiftShader): slower to export than the flat `entrances/assemble`.
- Text only: it samples the slot's words, not a picture or an SVG logo.
