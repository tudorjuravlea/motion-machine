# transitions/beam

## Purpose
Opens the next scene with light: a tilted beam that sweeps across, two curtains that close and part, a portal that opens from a point, or a long thin streak that crosses and leaves the cut.

## Use when / Do not use when
**Narrative position:** opening, climax. **Mood:** cinematic, premium, reveal.

**Use when**
- an opener or a reveal that should feel lit rather than moved: a product, a title, the call to action
- a brand with a clear accent role that can be the light
- once or twice in a piece: a light cut is a signature, not a paragraph break

**Do not use when**
- every cut of a piece: light stops meaning "now" (use `transitions/crossfade` or a quieter cut between related scenes)
- a brand whose accent is a hard signal colour and whose pieces are flat and matte: the glow would shout (use `transitions/wipe`)
- a scene change that has to read at a glance in a deck: the cut takes the whole `slow` role

## Params
| name | type | default | meaning |
|---|---|---|---|
| `variant` | enum(beam\|curtain\|portal\|streak) | `beam` | `beam`: a tilted front of light sweeps across and the incoming scene is laid open behind it; `curtain`: two panels close over the outgoing scene from the sides, the scenes swap behind them, and they part on the incoming one; `portal`: the incoming scene opens through a circle that grows from a point, lit at its rim; `streak`: an anamorphic streak crosses the frame, a veil of the light peaks as it passes the middle and the scenes swap under it |
| `light` | enum(accent\|canvas\|ink\|surface) | `accent` | the palette role the light is made of, at a share of opacity: never white |
| `strength` | number | 0.85 | how strong the hot core is, 0.2 to 1 |
| `width` | number | 0.3 | how far the glow reaches, as a share of the frame's short side, 0.05 to 1 |
| `weight` | number | 0.008 | thickness of the hot core, as a share of the frame's short side, 0.002 to 0.04 |
| `angle` | number | 18 | `beam`: the tilt of the front from upright, in degrees, -45 to 45 |
| `side` | enum(left\|right) | `left` | `beam` and `streak`: the frame edge the light comes from |
| `at` | string | `50%,50%` | `portal`: where it opens, `"x%,y%"` of the frame; `streak`: the height it crosses at (the y part) |
| `panel` | enum(ink\|surface\|canvas\|accent) | `ink` | `curtain`: the palette role of the two panels |

Brand knobs: variant, light, strength, width, weight, angle, panel.

Duration role: `slow`. A motion style reaches the length through the milliseconds it gives the role; the pattern holds no number of its own. Params arrive as `ctx.params`: the pattern's defaults, then the brand's (`style.patterns["transitions/beam"]`), then the scene's `cutParams` (`"cutParams": { "variant": "curtain" }`).

## Style variables consumed
- `--mm-color-accent`, `--mm-color-canvas`, `--mm-color-ink` or `--mm-color-surface` (by `light`: the core, the glow and the haze, each the role at a share of opacity, over transparent); `--mm-color-ink`, `--mm-color-surface`, `--mm-color-canvas` or `--mm-color-accent` (by `panel`: the curtains)
- duration role `slow` (via the module's `dur`) and the `move` ease over the cut
- the frame's size, read from the incoming section

## Legibility and rest notes
The reveal is a `clip-path` on the incoming section (`beam`, `portal`) or a hidden section (`curtain`, `streak`), and the light is one overlay node beside the sections, marked `data-mm-overlay`, so the kit removes it on every seek: at p = 0 the outgoing scene is whole and no light is in the frame (the glow starts just outside it), at p = 1 nothing is written and the incoming scene is exactly as laid out. Every pixel shows one scene under the light: `beam` and `portal` show both scenes either side of the front (the scene on top keeps its opaque canvas), `curtain` and `streak` never draw both on one frame (only the outgoing scene until the panels have closed, or the veil has peaked, only the incoming one after). The light is translucent over the scene, so type under it is dimmed by the glow for the length of the cut, never covered by a solid white. Every number is a closed form of the cut's progress and the frame, so the same instant draws the same pixels in any seek order.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of light openers (a sweeping beam, curtains, a portal from a point, an anamorphic streak) as a family of title reveals; no code or markup taken, the geometry and the look are ours and built from palette roles.

## Known limits
- the light is a gradient, not a ray: no grain, flare, lens ghost or colour fringe
- on a canvas close in lightness to the chosen `light` role (`canvas` on a light brand) the light shows only where it crosses type
- `curtain` takes about a third of the cut to close before it opens, so its reveal is later than `beam`'s
- `portal` is a circle: no ellipse, no moving origin; `streak` is horizontal only
- one light role per cut: no second colour in the glow
