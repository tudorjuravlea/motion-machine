# devices/cursor

## Purpose
An SVG pointer that follows a path through the host slot and then clicks.

## Use when / Do not use when
**Use when**
- guiding the eye through an interface that a device shows
- the `overlay` slot of caption-bar

**Do not use when**
- the pointer has to land on a specific control (coordinates are percent of the host, not of the screen)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `path` | string | 20,30 50,55 75,45 | waypoints as "x,y x,y ..." in percent of the host slot (also read from `data-path`) |
| `click` | boolean | true | pulse a ring at the last point |

## Style variables consumed
- `--mm-color-accent`
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-radius-4`
- `--mm-space-1`
- `--mm-space-5`
- `--mm-space-6`

## Legibility and rest notes
- Position is a pure function of p, with ease-in-out within each segment, so the pointer pauses at each waypoint.
- The click ring peaks in the last 15 % and is fully transparent at p = 1; the pointer rests at the last waypoint.
- The slot's text is ignored.

## Provenance
showcase, MIT, same author: credited as the device family this pattern belongs to (the device-frame set whose conventions, a generic shell and a pointer drawn as an overlay, the other devices follow); the waypoint path, its easing and the click ring are original and no showcase code is taken.

## Known limits
- The host must be a positioned area; caption-bar's `overlay` slot is. Elsewhere it positions against the layout root.
- Path points are relative to the overlay (the stage area), not to the device screen: a centred device has its screen near 50, 50.
