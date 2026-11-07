# transitions/whip-pan

## Purpose
Pans fast to the next scene with a one-axis blur that swells and falls with the speed.

## Use when / Do not use when
**Narrative position:** related, topic change. **Mood:** speed.

**Use when**
- a fast related cut in a kinetic piece
- a run of scenes that should feel like one sweep
- a style whose policy is velocity-matched

**Do not use when**
- a calm piece: the catalogue does not offer it there
- scenes with fine type that must stay readable through the cut
- a long duration, where the blur lingers and looks like a mistake

## Params
| name | type | default | meaning |
|---|---|---|---|
| `direction` | enum(left|right|up|down) | `left` | where the content travels: left carries the outgoing scene off to the left |
| `amount` | number | 1 | blur strength as a multiple of one space step, before `--mm-travel` |

Duration role: `quick`. Catalogue bands, in seconds: calm not offered, medium 0.3-0.4, high 0.2. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-travel` (times `amount`: the blur grows with the style's travel)
- `--mm-space-4` (one step of blur, read through the style)
- duration roles (via the module's `dur`)

## Legibility and rest notes
Transform and filter are written on both sections only while 0 < p < 1; at p = 1 both are removed and the SVG blur node is taken out of the page. The blur follows a half sine of p, so it is zero at p = 0 and p = 1: the outgoing scene is sharp at the start and the incoming one sharp at rest.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- places one hidden SVG node in the document body while the transition runs (the only pattern in the set that does); it is marked `data-mm-overlay`, so the kit removes it on every seek and a seek that jumps away mid-transition leaves nothing behind
- travel is one full frame whatever `--mm-travel` says; the multiplier scales the blur only
- under a velocity-matched policy the outgoing scene is still whole at p = 0: the pattern does not pre-roll the pan
