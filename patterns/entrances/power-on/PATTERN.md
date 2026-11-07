# entrances/power-on

## Purpose
Switches a slot on like a screen: a bright line scales across it, opens vertically into the content, and the content flickers in a few held frames while a colour split jitters and settles.

## Use when / Do not use when
**Use when**
- a technical, retro or "signal acquired" opener: a title, a status line, a product name
- one slot or two in a piece; the first beat of a hook that should read as switched on

**Do not use when**
- a calm, warm or editorial piece where a flicker would feel like a fault
- a long paragraph: the content flickers as a block, and several held dips are hard to read
- every beat of a scene: the effect loses its meaning (use `entrances/fade`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `flicker` | number | 3 | how many dips the content flickers through after it opens, 0 to 8; 0 opens straight to rest |
| `split` | number | 6 | how far the colour split jitters at first, in px, 0 to 24; 0 turns the split off |
| `tone` | enum(accent\|ink) | `accent` | the palette role of the line, its glow and the first ghost of the split |
| `weight` | number | 0.006 | thickness of the line, as a share of the frame's short side, 0.002 to 0.03 |

Brand knobs: flicker, split, tone, weight.

Duration role `slow` is the whole entrance (the line takes the first fifth, the opening the next quarter, the flicker the rest). A beat's `params.dur` still wins. The split's distance is a distance in px of the page and is multiplied by the style's `motion.travel`.

## Style variables consumed
- `--mm-color-accent` or `--mm-color-ink` (by `tone`): the line, its glow (60 % of the role over transparent) and the left ghost of the split; `--mm-color-muted`: the right ghost
- `--mm-space-0`, `--mm-space-3` (the glow's spread and blur), `--mm-frame-w`, `--mm-frame-h` (the line's thickness)
- duration role `slow` and the `move` ease for the line and the opening; the flicker steps are held, not eased

## Legibility and rest notes
At p = 1 nothing is written: the slot is exactly as its layout draws it. Before that, the line is a child of the slot that the kit removes on every seek; the slot is hidden while only the line is showing and clipped to the opening band while the content opens (the clip reaches past the box by half an em, so glyphs that overhang it are not cut). The content flickers through `2 × flicker + 1` held frames, each an opacity (the dips between 30 % and 65 %, the bright steps between 85 % and 100 %) chosen from a fixed integer hash: the same instant always gives the same frame and the last frame is exactly the rest. The split's ghosts (drop shadows with no blur, one in the role, one in `muted`) step through at least four settling frames and are gone before the last one. A deck rest is always a finished slot.

## Provenance
- nateherkai/herk-edit-kit, MIT: the idea of a CRT-style power-on (a bright line that scales across, opens vertically, stepped flicker, a small colour split that settles); no code taken, the timings, the held steps and the roles are ours.

## Known limits
- the ghosts of the split are a copy of the slot's silhouette, so a slot of a picture or a device splits as a whole picture, and a long block of text splits all its lines
- the line spans the slot's box: a slot as wide as its column draws a line as wide as the column
- the flicker is a few held frames, not a scan: no scanlines, no rolling bar
- no sound: pair it with a `sound/hit` or `sound/tick` cue on the beat
