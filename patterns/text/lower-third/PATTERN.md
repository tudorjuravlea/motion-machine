# text/lower-third

## Purpose
A name and a role line standing in the lower band of an overlay area, arriving by one of eight mechanisms (a bar that wipes, brackets that draw, a flip, a tab, a stamp, typing, a now-playing strip, a growing pill), so every talking-head piece can name its speaker in the brand's own way.

## Use when / Do not use when
**Use when**
- a person or a source is named for the first time, over footage or over a device
- the same plate should recur through a piece: set the mechanism once in the brand (`style.patterns["text/lower-third"]`)

**Do not use when**
- the line is a caption of what is said (use `layouts/talking-full`'s `caption` or `text/caption-karaoke`)
- the host slot is in the text flow: give the beat an overlay slot (`layouts/talking-full`, `layouts/caption-bar`), whose box the plate is anchored to
- the text is more than a name and one short role line

## Params
The slot's text is `Name | Role`; the role is optional. Put the beat in an overlay slot and give it `out` and `exit: exits/lower-third` so it leaves the way it came.

| name | type | default | meaning |
|---|---|---|---|
| `mechanism` | enum(bar-wipe\|bracket\|flip\|tab\|stamp\|typed\|strip\|pill) | `bar-wipe` | how the plate arrives: `bar-wipe` an accent bar wipes up and the plate rides out of it; `bracket` four corner brackets draw and the text fades up inside; `flip` the plate turns in on its outer edge; `tab` a tab slides in from the frame edge and the plate unfolds from it; `stamp` an outlined plate lands from large with a small overshoot and settles; `typed` the name types with a caret and the role fades after; `strip` one thin row with a dot and a progress hairline; `pill` a capsule grows from its dot into a bar |
| `side` | enum(left\|right) | `left` | the side of the overlay area the plate stands on; give the side the speaker is not on |
| `tone` | enum(accent\|ink\|muted) | `accent` | the palette role of the mark: bar, tab, brackets, outline, dot, hairline, caret |
| `plate` | boolean | `true` | the text sits on a surface plate; `false` leaves it bare |
| `stroke` | number | `0.5` | the weight of the lines as a share of the frame's short side, in percent: 0.1 is a hairline, 1.2 is bold (a bar is three of it, a tab nine) |
| `progress` | number | `0.4` | `strip` only: where the progress hairline stands at rest, 0 to 1 |
| `caret` | boolean | `true` | `typed` only: show the caret while the name types |

Brand knobs: mechanism, side, tone, plate, stroke.

## Style variables consumed
- `--mm-color-ink`, `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line`, and the role named by `tone` (`--mm-color-accent`, `--mm-color-ink` or `--mm-color-muted`)
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` (the name); `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text` (the role)
- `--mm-size-h2` (the name; `--mm-size-body` in the strip), `--mm-size-body` (the role), `--mm-size-display` (the flip's perspective)
- `--mm-space-1` to `--mm-space-5`, `--mm-radius-1`, `--mm-radius-4`, `--mm-safe`, `--mm-frame-w`, `--mm-frame-h`
- the entrance is the duration role `standard` and the style's `enter` easing; the exit is the style's `exit` easing

## Legibility and rest notes
- The name is at h2 and the role at body size, so no text is under the body floor (G-LEGIBLE); the plate is surface with surface ink, so the contrast is the brand's.
- Everything is drawn inside the host's box, which for `layouts/talking-full` and `layouts/caption-bar` is already inside the safe margin (G-EDGE); the plate is at most 82 % of its width (the strip is the whole width).
- One number, the amount shown, drives the entrance and the exit, so the way out is the way in played back. At the end of the entrance every amount is exactly its rest value: no caret, no clip, no transform, nothing mid-motion (G-REST).
- The stamp's overshoot is the plate's scale, 1.3 down to 0.96 and back to 1; the text is never scaled past 1.3 and the plate is anchored at its bottom outer corner, so it stays inside the host.
- A frame is a function of the beat's time alone; the strip's hairline stands at `progress` and does not run on during a hold.

## Provenance
- nateherkai/herk-edit-kit, MIT: ideas only; no code taken. The set of lower-third mechanisms (a bar wipe, corner brackets, a Y flip, a tab from the frame edge, a stamped name, a typed name with a caret, a now-playing strip, a chapter pill), restated here as one pattern with one pose function and the brand's own roles.

## Known limits
- Nothing measures the speaker's face: `side` and the host's lower band are the only guard. Move it to the other side when the speaker leans that way.
- With `plate: false` the text has no ground of its own: use it over calm footage only (W-CONTRAST measures the pixels).
- A name longer than the plate's 82 % wraps onto a second line (balanced); the strip does not wrap and clips its role with an ellipsis.
- `flip` reads best on a plate: with `plate: false` only the text turns.
- The pill's capsule is sized from the plate's laid-out height at the moment it is drawn, so a font that loads late changes it for one frame only.
