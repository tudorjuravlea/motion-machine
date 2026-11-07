# screen/island

## Purpose
The device's cutout grows into a widget with a line of text, holds, and shrinks back, with no jump between actions.

## Use when / Do not use when
**Use when**
- a phone moment needs a live status: a timer, a call, a delivery, a recording
- a launch film opens a laptop's or the desktop stage's notch into a widget

**Do not use when**
- the line is a fact the viewer must read (it is micro text inside device chrome)
- there is no cutout: a phone with `model: plain` has no `data-island`

## Params
| name | type | default | meaning |
|---|---|---|---|
| `w` | number | 0.86 | open width as a fraction of the screen width (0.31 to 0.96) |
| `h` | number | 0.12 | open height as a fraction of the screen height (0.035 to 0.4) |
| `text` | string | (empty) | the line shown inside once the island is open |
| `close` | boolean | false | shrink back to rest instead of opening |

Given in the beat's `screen` list: `{ "do": "screen/island", "at": <s>, "params": { … } }`. Works on any element with `data-island` in the device or layout: the phone's island or notch, the laptop's camera notch, `layouts/desktop`'s notch.

## Style variables consumed
- `--mm-device-island` (the darkest palette role, set by the kit)
- `--mm-device-island-ink` (the lightest role, for the text)
- `--mm-font-text`
- `--mm-weight-display`
- `--mm-size-micro`
- `motion.spring.ui`, `motion.spring.heavy` (opening), `motion.easings.exit` (closing)
- `motion.durations.slow` (the default length)

## Legibility and rest notes
- Width springs on `ui` and height on `heavy` when opening, so the island stretches before it deepens; closing eases out with no overshoot.
- Each action starts from the island's incoming size, so a reopen during a close carries on from where the island is.
- The text fades in once the height is past 60 % of its travel and is fully shown at p = 1, and at a deck rest; it is `data-micro`.
- `paint()` draws the island on every seek, so an open island stays open until a `close`.

## Provenance
original

## Known limits
- One line of text; a long line is clipped by the island.
- The island grows from its centre top; it does not push the screen's content down.
