# layouts/desktop

## Purpose
The whole frame is a laptop screen: a menu bar with a notch at its centre, a two-colour wallpaper, and one caption under the notch.

## Use when / Do not use when
**Use when**
- a launch film should feel like the product's own screen: the notch opens into widgets (`screen/island`) scene by scene
- one short line per scene sits under the notch, over a wallpaper that changes on the cut

**Do not use when**
- the screen should be seen as a device in a room (use `devices/laptop` in `layouts/caption-bar`)
- the scene needs more than one line of copy

## Params
| name | type | default | meaning |
|---|---|---|---|
| `desk` | slot (screen) | none | the whole frame, a screen (`data-screen`): give it a beat with an entrance and, if wanted, an `asset` and `screen` actions (`screen/island` grows the notch). It takes no text |
| `menu` | slot (text) | none | the menu bar's words, micro text set as written (spaces kept); five short words at most read well |
| `caption` | slot (text) | none | one line under the notch, at h2 times `--mm-headline-scale`, centred |
| `headline` | slot (text) | none | a larger centred line for an opener or an end card |
| `wall` | enum(accent|ink|surface) | `accent` | a param on the `desk` beat: the wallpaper runs from this role at the top into the canvas at the bottom (two colours, so the pixel rule holds) |
| `data-format` | html attribute | set by the kit | Reflows by `<html data-format>` for 9x16, 1x1 and 16x9 through frame-relative sizes. |

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-surface`, `--mm-color-canvas`
- `--mm-device-island` (the notch)
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`
- `--mm-font-text`, `--mm-weight-text`
- `--mm-size-micro`, `--mm-size-h1`, `--mm-size-h2`, `--mm-headline-scale`
- `--mm-safe`, `--mm-space-4`, `--mm-frame-h`

## Legibility and rest notes
- The caption is centred under the notch at h2 size, inside the safe margins; the headline sits at the frame's centre.
- The notch and the menu are device chrome (`data-chrome`, `data-micro`); they sit above any screen content the desk shows.
- At a rest the wallpaper is still; it changes only with the scene.

## Provenance
original

## Known limits
- The menu is a line of text, not a list: the author keeps it short.
- To tint the caption's last words, give the caption `text/highlight` or set them in a second beat; the layout has no script.
- A desk asset covers the wallpaper.
- `wall: ink` puts the caption's own colour at the top of the wallpaper, so the caption fades into it; W-CONTRAST reads a flat background and does not catch a gradient. Use `accent` or `surface` under a caption.
