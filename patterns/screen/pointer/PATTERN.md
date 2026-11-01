# screen/pointer

## Purpose
Draws the cursor of a recorded session over its recording: smoothed with weight, anchored at its tip, bouncing as it clicks, in the brand's own colours.

## Use when / Do not use when
**Use when**
- a product demo is a recording made with `mm capture site --script` (or any recording with a pointer track beside it) and the viewer should see where the pointer went and what it pressed
- the camera is `screen/zoom-to` in mode `auto`, which reads the same track

**Do not use when**
- the recording has no pointer track: nothing is drawn, and the kit says so in `mm.warnings`
- a pointer is wanted over a still or a page capture with no timeline: use `devices/cursor` or `screen/tap`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `size` | number | 0.045 | the cursor's height as a share of the screen's width |
| `smoothing` | number | 0.67 | how much weight the cursor has: 0 follows the recording exactly, 1 trails it most (0 to 1) |
| `bounce` | number | 2.5 | how far the cursor dips and rebounds as it clicks (0 to 5; the click lasts 260 ms) |
| `blur` | number | 0.35 | motion blur along the cursor's own speed (0 to 1) |
| `grow` | number | 0.6 | how much of the camera's zoom the cursor takes: 0 stays one size, 1 grows with the recording |
| `look` | enum(classic\|soft\|solid) | `classic` | `classic`: an outline with sharp corners; `soft`: a heavier outline with round corners; `solid`: no outline |
| `fill` | enum(canvas\|ink\|muted\|surface\|line\|accent\|accentInk) | `ink` | the palette role the cursor is filled with |
| `outline` | enum(canvas\|ink\|muted\|surface\|line\|accent\|accentInk) | `canvas` | the palette role of its outline |

Brand knobs: size, smoothing, bounce, blur, grow, look, fill, outline.

Given in the beat's `screen` list: `{ "do": "screen/pointer", "at": <s>, "d": <s>, "params": { … } }`, over the same span as the `screen/play` it rides on. The cursor is on the screen from `at` to `at + d`.

## Style variables consumed
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-color-muted`
- `--mm-color-surface`
- `--mm-color-line`
- `--mm-color-accent`
- `--mm-color-accentInk`

(only the two roles `fill` and `outline` name are read at a time)

## Legibility and rest notes
- The cursor's time is the recording's own (the frame `screen/play` has reached), so the same instant gives the same pixels in any seek order; the smoothed path is built once per track and sampled by a binary search and a lerp.
- It is drawn inside the screen and clipped by it: it never leaves the screen, and at the screen's edge half a cursor shows.
- It follows the camera: its point is on the recorded point under any zoom, and it enlarges with the zoom by the `grow` share.
- It is not on the screen outside its action; nothing of it remains at a rest.

## Provenance
siddharthvaddem/openscreen, MIT: the pointer sidecar shape and the offline 240 Hz spring-smoothed path with its binary-search lookup, the 260 ms click bounce and its two-phase scale, the cursor blur law (`runtime/kit/cursor.js`, see NOTICE); the cursor art (arrow, hand, I-beam) is original, drawn without colour, and none of its cursor art is used.

## Known limits
- A recording shows no cursor of its own (Playwright's video has none), so the cursor drawn here is the only one; a recording made with the real cursor visible would show two.
- Cursor kinds other than arrow, pointer (and the two hands) and text draw as the arrow.
- A 3D device draws its screen into a texture and does not run this pattern's drawing.
