# entrances/slam

## Purpose
Brings a line down hard: large and high at first, landing hard on the type spring, so the line stops at rest and never passes it.

## Use when / Do not use when
**Use when**
- the climax line of a film, once [H-STILL]
- a figure or a claim that should feel heavy and final

**Do not use when**
- as a default headline entrance: it is the loudest move in the library
- in a calm style whose type spring is soft, where it reads as a slow drop

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 1.4 | start scale, clamped to 1.1 to 2, then capped so the text stays inside the safe area (it may then start below 1.1) |
| `d` | number | 0.3 | drop as a multiple of the format base size (`ctx.unit`, SPEC §12), before the style multiplier; capped so the scaled text's top stays inside the safe area |
| `origin` | enum(auto|center) | `auto` | pivot: the text edge for left or right aligned text, else the centre |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- spring role `type` (the module `spring` field sets the duration to its settle time); `p` is also clamped at 1
- `--mm-travel` scales the drop
- `--mm-safe`, `--mm-frame-w`, `--mm-frame-h` (through the kit's `room.js`) bound the start scale and the drop

## Legibility and rest notes
At p = 1 translate and scale are `none` and opacity is removed. The type spring does not carry the line past rest, and `p` is clamped at 1, so scale and position never overshoot (type never overshoots, bans.md). Opacity reaches 1 in the first quarter and never overshoots. The start scale and the drop are capped from the layout geometry so the text never crosses the safe margin mid-entrance; scale and drop shrink together towards rest, so every frame between stays inside too.

## Provenance
original

## Known limits
- the weight comes from the large start scale and the drop, not from a bounce; the type spring settles in about 0.5 s in the shipped presets
- hold at least 2 s after it (H-STILL); the gate does not enforce this
