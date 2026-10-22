# transitions/re-ink

## Purpose
Pulls the incoming scene over the outgoing one in a second set of the brand's inks, then pulls the same picture again in the brand's own inks.

## Use when / Do not use when
**Narrative position:** topic, related. **Mood:** print, poster, craft.

**Use when**
- a print or poster look (risograph, silkscreen, spot colour) that wants a cut made of inks
- a day and night, light and dark, or colourway change told as a change of inks over one picture
- a topic change that should feel printed rather than edited

**Do not use when**
- a calm piece where two sweeps in a row read as busy (use `wipe` or `crossfade`)
- into a scene that draws on a canvas, a video, a device screen or footage when the re-ink itself is the point: there the cut becomes a plate wipe (below), not a change of inks
- a brand whose roles are too close for the swapped set to read (an accent near the canvas under `inks: accent`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `inks` | enum(invert|accent) | `invert` | the second role set: invert swaps canvas and ink (and surface and muted); accent prints the scene on the accent in its ink |
| `side` | enum(left|right|top|bottom) | `left` | the frame edge each pull starts from |

Duration role: `slow`. Each pull takes half the cut on its linear clock (a squeegee does not ease), so under the shipped motion styles a pull lasts 0.3 to 0.5 s. Params arrive as `ctx.params`: the defaults under the scene's `cutParams` (`"cutParams": { "inks": "accent" }`).

## Style variables consumed
- `--mm-color-canvas`, `--mm-color-ink`, `--mm-color-muted`, `--mm-color-surface`, `--mm-color-line`, `--mm-color-accent`, `--mm-color-accentInk` (read and swapped among themselves), and the derived `--mm-color-surfaceInk`, `--mm-accent-text`, `--mm-surface-muted`
- duration roles (via the module's `dur`)
- set by this pattern on a section's inline style, not read from the style: `--mm-tx-reink` and the swapped role values; on the plate of a plate wipe, `background` as `var(--mm-color-<role>)`

## Legibility and rest notes
Every pixel shows one print of one scene; no section is ever faded. In the first pull the incoming section is clipped to the region behind the front and the outgoing section is untouched beneath it. In the second pull the outgoing section is hidden, the incoming section is drawn as itself, and a copy of it in the second role set covers only the region the front has not reached; the copy is made after the seek has drawn every element, so its type sits exactly on the incoming type, and it is marked `data-mm-overlay`, so the kit removes it on every seek. Into a scene that holds a canvas, a video, a device screen or footage, no copy is made, since a copy would show none of those pixels: the cut is a plate wipe instead. What the scene holds is read from the story, not from the canvases present when the cut starts (a point cloud, a waking photo or a depth parallax makes its canvas only once it runs): `canvas`, `video`, `[data-footage]` or `.mm-screen` in the markup at mount, a slot whose pattern draws on a canvas of its own (every `3d/` pattern, `entrances/assemble`, `entrances/photo-wake`), or the scene's move `moves/depth-parallax`. The decision is the same in both pulls. A plate in the second set's ground role (`ink` under `invert`, `accent` under `accent`) covers the outgoing scene behind the front in the first pull, and in the second pull it is stripped off the incoming scene, which is drawn as itself; the plate is an overlay node beside the sections, marked `data-mm-overlay`. The second role set uses only the brand's own role colours. Each pull starts and ends with every tooth of the front outside the frame. At p = 1 nothing the pattern wrote remains, and the incoming scene wears the brand's own roles.

## Provenance
- lemomo-ai/lemo-opuscar, MIT: the idea of re-inking the same poster in a second palette through a ragged, linear, tilted pull, and of pulls that do not ease (ideas only; no code taken).

## Known limits
- into a scene with a canvas, a video, a device screen or footage, or one whose pattern or move draws on a canvas of its own, the cut is a plate wipe: the scene is never shown in the second role set
- a new pattern that draws on a canvas of its own is plated only once it is named in the pattern's list (`PAINTERS`) or is a `3d/` pattern; a unit test fails until it is
- pictures in an `<img>` (a photo in `layouts/media`) are copied as they are and keep their colours in the second role set
- colours resolved at mount (ground blobs, pictures) keep their colours in the second role set
- two role sets only; a brand's own named colourways are not read
