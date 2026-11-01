# screen/zoom-to

## Purpose
The camera of a device screen: pushes in on a mark or a point until it fills the centre of the screen, or (mode `auto`) zooms by itself where a recorded session's pointer clicked.

## Use when / Do not use when
**Use when**
- a detail of the interface needs to be read
- after a scroll lands near a control
- a screen recording made with `mm capture site --script` should follow its own clicks: `mode: auto`

**Do not use when**
- the whole device should come closer: use a camera move on the scene
- the detail is text the viewer must read as a fact (the gate cannot read inside media)
- mode `auto` is asked of a recording that has no pointer track and no `regions`: it leaves the screen as it was, and the kit says so in `mm.warnings`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `at` | string | 50%,50% | mark: a mark label from media.json, or "x%,y%" of the screen |
| `s` | number | 1.6 | mark: the magnification at p = 1, 1 to 4 |
| `mode` | enum(mark\|auto) | `mark` | `mark`: push in on `at`; `auto`: zoom where the recording's pointer clicked (needs a pointer track), or only where `regions` say on a recording without one |
| `depth` | string | medium | auto: how far, a step of the ladder (gentle 1.25, soft 1.5, medium 1.8, close 2.2, tight 3.5, macro 5), a number 1 to 5, or `fit` (the deepest step that shows the clicked box with room round it) |
| `follow` | number | 0.35 | auto: how much of the cursor's follow the view takes while zoomed (0 sits on the click target, 1 follows the cursor) |
| `hold` | number | 0 | auto: seconds each zoom is held after it has landed (0: the longer of 1 s and 5 % of the recording) |
| `lead` | number | 0 | auto: seconds the zooms land after (negative: before) the click |
| `spacing` | number | 1.8 | auto: the fewest seconds between two zooms that land |
| `connect` | boolean | true | auto: zooms at most 1.5 s apart are joined by a pan, not a zoom out and in |
| `chase` | boolean | true | auto: the camera has weight (an overdamped spring, in closed form, so it arrives without overshoot); off draws the authored camera as it is |
| `suggest` | boolean | true | auto: one zoom at each click target; off leaves only `regions` |
| `regions` | array | none | auto: zooms drawn by hand, each `{ at, hold, x, y \| target, depth, tilt }` (seconds into the recording; x, y 0..1 of it; target a selector of the pointer track); the suggestions keep clear of them. On a recording with no pointer track they are the only zooms (`mm showcase` measures them from where the recording moves) |
| `tilt` | enum(none\|iso\|left\|right\|alternate) | `none` | the device leans while the zoom is on (a device with `data-tilt-plane`, as `devices/demo-frame`); `alternate` (auto only): left, then right |
| `blur` | number | 0 | auto: motion blur along the camera's own speed (0 to 1) |

Brand knobs: depth, follow, hold, lead, spacing, connect, chase, tilt, blur.

Given in the beat's `screen` list: `{ "do": "screen/zoom-to", "at": <s>, "d"?: <s>, "params": { … } }`. In mode `auto` give it the same `at` and `d` as the `screen/play` it rides on: the camera is read at the recording's own time (the frame the play has reached).

Zooms the camera makes by itself are tagged `auto` (in `cameraOf(...).regions`, `runtime/kit/camera.js`) and `withoutAuto` takes them out again; zooms drawn by hand (`regions`) are never tagged. Take the action out to take the camera away.

## Style variables consumed
- `motion.easings.move`
- `motion.durations.slow` (the default length)

(mode `auto` takes its timing from the source's own profile and a closed-form spring, not from the style's durations; the tilt is a transform of the device and uses no colour)

## Legibility and rest notes
- The zoom starts from the screen's current zoom, so zooms compose.
- The picture is magnified inside the screen and clipped by it; the device does not move (unless it leans: `tilt`).
- Mode `auto`: the camera lands on the click target about a second after it has started (lead-in 1.52 s with 0.5 s overlap, out in 1.02 s, on `cubic-bezier(0.16, 1, 0.3, 1)`; the zoom has landed, at 0.994 of its strength, at the click); the view never leaves the recording (the focus is held in bounds with a soft edge); the camera is a function of the recording's time, so the same instant gives the same pixels in any seek order.
- A tilt leans only while a zoom is on and is flat again after; the leaning plane is scaled so it stays inside the rectangle it started in.

## Provenance
siddharthvaddem/openscreen, MIT: the zoom timing profile, connected pans, the depth ladder, the focus bounds with their soft edge, the stage-normalised zoom transform, the distance-adaptive cursor follow, the ranking and spacing of suggestions, the camera's spring constants and motion blur law, the per-zoom tilt presets and the perspective (`runtime/kit/camera.js`, `runtime/kit/demoframe.js`, see NOTICE); the follow is computed once over a fixed grid and the chase is a closed-form overdamped response so every frame is a function of t, and the suggestions come from click targets, not a dwell guess. The push-in on a mark (mode `mark`) is original.

## Known limits
- Magnifying a capture beyond its device pixels softens it: captures are at 3x for phones, 2x for laptops, and a recorded session is at 1x css pixels (a laptop session is 1440 px wide), so go no deeper than `close` unless the recording was made large.
- The camera blur is a Gaussian along the two axes by the share of the velocity on each: it softens along the move, not along a diagonal's exact line.
- A 3D device draws its screen into a texture: the blur and the tilt do not reach it.
