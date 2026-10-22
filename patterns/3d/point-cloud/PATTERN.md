# 3d/point-cloud

## Purpose
A brand's product cut-out, mark or headline rebuilt as a free-floating 3D object of sparse, glittering points in a dark void: a single bright seed lights at its centre, bursts into a swirling cloud of pale streaks that spreads past the object, and a growing front sends each point home, where it loses its streak and takes its own colour. At rest the object lives, turned three-quarters, twinkling and swaying a few degrees.

## Use when / Do not use when
**Use when**
- a launch reveal of a product cut-out (a still with a transparent ground, or on a flat ground the pattern keys away)
- a mark (an SVG) that should arrive as a solid, extruded object
- a short headline that should condense out of a burst (it rests as the slot's own text)

**Do not use when**
- a photograph on a busy ground with no depth map: it cannot become an object and is refused (`layouts/media` shows it as a picture)
- body copy or more than about four words; or a scene that already has a 3D stage or a busy ground

## Params
| name | type | default | meaning |
|---|---|---|---|
| `points` | number | 16000 | the most points the object takes, 2000 to 40000 |
| `density` | number | 0.22 | how close the points sit, 0.1 (a sparse dust) to 1 (a point every 3 px on the front surface): the count follows the object's size on screen, up to `points` |
| `colors` | enum(palette\|source) | `palette` | `palette` maps the picture's tones, stretched over its own range, onto brand roles (neutral parts canvas → muted → ink, vivid parts canvas → accent → ink, ink on the side away from the canvas; a one-tone mark is ink); `source` keeps the picture's own colours on a canvas declared media. Words always take the slot's colour |
| `relief` | enum(auto\|pillow\|map\|extrude\|luma) | `auto` | how the points take volume: `pillow` inflates the cut-out by its distance field (a front and a back surface, round at the rim, and points inside the shell); `map` displaces them by `depthMap`; `extrude` builds a front, a back and walls along the outline; `luma` brings light pixels forward; `auto` takes `map` with a depth map, `extrude` for an SVG mark and the slot's words, else `pillow` |
| `depth` | number | 0.4 | how thick the object is, a share of its short side, 0 to 1 |
| `depthMap` | string | none | a greyscale picture under `assets/`, the asset's shape, white near and black far; black (below 6 %) is ground and takes no point |
| `yaw` | number | 20 | the three-quarter turn in degrees the object rests at, -60 to 60 (the slot's words face the viewer and only sway, so they stay readable) |
| `sway` | number | 6 | how far, in degrees, the object sways round its turn while it rests (a slow yaw and a smaller tilt), 0 to 20 |
| `drift` | number | 0.6 | how far the burst cloud spreads past the object, 0 to 1 |
| `streak` | number | 10 | the longest streak, in dot widths, 1 to 40 |
| `origin` | enum(center\|left\|right\|top\|bottom) | `center` | where on the object the seed lights and the front starts |
| `asset` | beat field | none | the picture: a still or an SVG under `assets/`; without one the slot's words are the source. A picture with a transparent ground is a cut-out; one without is keyed when its border is one flat colour, displaced by a depth map when it has one, and otherwise refused (not drawn, named in `mm.warnings`). An SVG is read at the size it shows; a raster still at most 640 px on its long side |

## Style variables consumed
- `--mm-color-canvas`, `--mm-color-muted`, `--mm-color-ink` (the palette ramp; the ground's lightness sets the look)
- `--mm-color-accent` (the seed, the burst's tint: blended toward the lightest role on a dark ground, toward the ink on a light one; the middle of the vivid ramp)
- `--mm-color-surface` (a candidate for the lightest role)
- the slot's own colour, face, size and tracking (the words, when they are the source)
- duration role `slow` (a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- There is no rectangle and no background plate: the canvas is transparent, covers the frame (so the burst can spread past the slot) and draws only the object's own points; the void is the scene's own ground. A picture's ground is removed (its transparent pixels, a keyed flat ground, or the far ground of its depth map) before any point is placed.
- The object fills about 60 % of the frame's height (never more than 94 % of its slot), its opaque box centred on the slot, at a three-quarter `yaw` with a depth cue (the near side brighter); dots are 1 to 3 px with gaps between them, each with a soft halo.
- The reveal is a closed form of the entrance's progress: the seed lights over the first 6 %, the burst runs to 50 % (an eased spread along each point's own direction, turned about a tilted axis, carried by a divergence-free swirl evaluated at that progress), the front sweeps from 30 % to 94 %, and from 94 % every point is exactly home. A streak is the point's motion on screen over the last 0.07 s, so it stretches along its flight and shrinks to a dot as the point arrives.
- The rest lives in closed forms of the item's seconds: each point flickers and now and then glints on its own seeded rhythm, and the object sways `sway` degrees round its turn (7 s a cycle, a smaller tilt on a longer one). The same t draws the same frame after any seek. In a deck the rest is still.
- Words rest as the slot's plain text, fading in over the last 15 %, turned with the object (the same eye, distance and turn as a CSS 3D transform), with the points staying as a dimmer glittering shell behind it; the extrusion's front face lies on the text's own plane, so the two agree as they turn.
- `colors: palette` paints only brand roles and blends of them at rest (the object pass blends over, not additively), so the canvas is not declared media and the gate reads every pixel; `colors: source` declares the canvas media (`data-media`, `data-3d`) and glows additively on a dark ground.
- On a light ground the points are larger and firmer, a picture's own colours deepened (to 78 %), the halo smaller, the depth cue gentler and the tint darker, so the object reads.
- The words are drawn off screen only, to sample them (`canvasText: true`). Every random draw comes from the slot's seed and Three.js naming is seeded.

## Provenance
- Revelium Milkmaid, no licence: ideas only; no code taken. Restated in our own code from a behaviour description: a picture rebuilt as points in depth and revealed by a growing sphere; a seed that bursts into a swirling, tinted cloud of streaks before the points condense; a living rest. The pillow inflation, the colour key, the swirl (an Arnold–Beltrami–Childress flow), the flight, the twinkle and every number are our own.
- three.js, MIT: the vendored library (runtime/vendor/three/0.170.0) draws plain quads (four vertices per point).

## Known limits
- Slow to export: about 2× the export time of `3d/particles-to-shape` per frame (measured on the demos, 16x9, one worker: 62 ms a frame against 29 ms). Each point is a plain quad (software rendering draws instancing far slower); rest frames upload no positions. Fewer `points` or a lower `density` cut it.
- A pillow is inflated from the silhouette alone: a turned object shows its thickness, never a side the picture does not show; the back surface repeats the front's colours.
- In palette colours on a dark canvas, the dark parts of a picture map to the canvas and fade out; use `colors: source` for a picture whose subject is dark.
- Painted in the order of a seeded shuffle, not sorted by depth: where points overlap, a far one can cover a near one (additive glow hides this; plain blends show it rarely, the points being sparse).
- The first frames are nearly empty by design (one small seed): open a film on another scene, or expect W-EMPTY.
- A raster picture is read at most 640 px on its long side; one picture per slot.
