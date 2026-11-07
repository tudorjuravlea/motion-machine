# transitions/flood

## Purpose
Floods the frame with one brand colour grown from an element of the outgoing scene, then drains it into an element of the incoming scene, down to a point or onto a round mark there (the dot of an i, a round badge).

## Use when / Do not use when
**Narrative position:** topic, climax. **Mood:** one idea grows into the next.

**Use when**
- the next scene is made out of the last: a button, a mark or a figure swells into the new scene
- the colour should come to rest as a detail of the next scene: the dot of an "i" in its headline (`land: dot`) or a round badge or avatar (`land: circle`)
- a chapter break that should feel driven by the content rather than by the edit
- a brand with a strong accent that can carry a full frame for a moment

**Do not use when**
- related scenes in quick succession: a full frame of colour is a strong punctuation
- the accent is too light or too close to the canvas to read as a full-frame field (use `color: ink`)
- scenes that should stay visible together (use `cover` or `shared-element`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | string | `""` | a slot of the outgoing scene the flood grows from (the centre of its box); empty grows from the frame centre |
| `to` | string | `""` | a slot of the incoming scene the flood shrinks into; empty shrinks back to where it grew from |
| `color` | enum(accent|ink|muted|surface|canvas) | `accent` | the palette role of the flood |
| `hold` | number | 0.12 | share of the cut the frame stays fully covered, 0 to 0.6 (about 0.15 s at the default; the cover gives way first when a phase would go under its floor) |
| `speed` | number | 1 | how fast the whole flood plays, 0.5 to 2: the cut lasts 1.3 s divided by it (never under 0.67 s, the phases' floors), every phase in proportion |
| `overscale` | number | 1.05 | how far past the farthest frame corner the disc reaches, 1 to 1.5 |
| `land` | enum(point\|dot\|circle) | `point` | what the disc settles onto (about half a second, then it fades off over the real mark): a point; `dot`, the dot of the first `i` or `j` in the `to` slot's text (else its first full stop or round bullet; the whole scene when `to` is empty); `circle`, a round element (the `to` slot itself or the first one inside it: a box within a pixel of square whose every corner radius reaches half its side, with a fill) |

Duration: 1.3 s, whatever the motion style (the module's `dur` is seconds, not a role), so the flood reads at its own pace in every style, grid included. At the default hold: a 0.5 s grow from the origin past the corners on an ease-in-out, a 0.16 s full cover around the middle of the cut (where the scenes swap), and a 0.64 s shrink to a point on a strong ease-out (a quartic), so the disc sweeps most of the way early and settles. The phases keep the proportions 0.5 : 0.54 : 0.1 around the cover and never go under their floors (a 0.24 s grow, a 0.35 s shrink, a 0.08 s hand-over), the cover giving way first. `speed` divides the cut's length (`durOf(params)`, which the kit and the gate read to size the cut), every phase in proportion. Params arrive as `ctx.params`: the defaults under the scene's `cutParams` (`"cutParams": { "from": "sub", "to": "headline" }`).

With `land: dot` or `circle` the shrink becomes a 0.54 s collapse onto the mark and a 0.1 s hand-over: the travel is the same strong ease-out, so the disc visibly settles onto the mark and arrives exactly as the hand-over starts, then stays there. The disc keeps the flood's role the whole way; over the hand-over it fades to transparent over the mark it covers, so the real mark shows through and no blend of two roles is ever drawn. Give the landing slot an entrance that has ended by the end of the cut (`at: 0` with `dur: quick`, or none), so the mark is at rest when the disc hands over.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted`, `--mm-color-surface`, `--mm-color-canvas` (the flood, chosen by `color`)
- no duration role and no style easing: the flood's 1.3 s and its curves are its own, so its proportions hold under every motion style
- set by this pattern on a section's inline style, not read from the style: `--mm-tx-flood-x`, `--mm-tx-flood-y`, `--mm-tx-flood-r`, `--mm-tx-flood-ry` (while it lands on an oval dot), `--mm-tx-flood-color` (the role, or the role fading to transparent on the mark)

## Legibility and rest notes
The two scenes never share a frame: until the middle of the cut only the outgoing scene is drawn (the incoming one has opacity 0 and is hidden), and from the middle only the incoming one, so no type is ever drawn over another scene's type. The swap happens while the disc reaches past all four corners, so it cannot be seen. The disc is a pseudo-element that exists only while `--mm-tx-flood-r` is on a section's inline style, which the kit restores on every seek. At p = 1 the disc has shrunk to a point on the target slot, or has faded off the mark it settled on, and nothing the pattern wrote remains.

A landing matches the mark as the letter draws it: the pattern rasterises the letter off screen in its computed font at 240 px per em or more (`canvasText: true`; the canvas never joins the page) and reads the tittle from its mask with `runtime/kit/glyphs.js` `dotOf` (the separate blob above the stem; its centre and upright semi-axes from the coverage), then places it from the letter's laid-out box, so the disc lands within a pixel of the dot in centre and in each semi-axis, read live each frame (an entrance moving the slot moves the landing with it). A round dot gives a circle, an oval dot (Fraunces) an upright ellipse; a square or slanted dot is not round, and the cut lands on a point with a note in `mm.warnings`, as it does when no mark is found. While it is on the mark the disc is still the flood's role and covers the mark exactly; over the last 0.12 s it fades out over it, so the hand-over is a short crossfade from the accent shape to the real mark, with no blended fill and no edge where a dot's outline is not exactly an ellipse. Slots are read at their layout boxes, before their entrances move them. A `from` or `to` that names no slot of its scene (a misspelling) falls back as if it were empty and is a note in `mm.warnings`, once.

## Provenance
- prompt-motion.com, no licence: the idea of a shape that floods the frame from an element and contracts into the next scene's element, and its timing advice (ideas only; no code or prompt text taken).
- feitangyuan/onetake, PolyForm Noncommercial 1.0.0: the idea of an element-led flood of light between beats (ideas only; no code taken).

## Known limits
- the flood is a disc (an upright ellipse when it lands on an oval dot): no pill or mark-shaped flood
- `land: dot` reads the first `i` or `j` only (a capital I has no dot; text set in capitals is skipped); a mark inside an SVG or an `aria-hidden` part is not read
- the mark should be at rest by the end of the cut: an entrance still fading the mark in at the hand-over shows as a fade
- the flood carries no copy of the source element's label across the cut
- one flat role: no gradient core and no rings
