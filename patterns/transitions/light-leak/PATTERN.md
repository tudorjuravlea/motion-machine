# transitions/light-leak

## Purpose
Washes a warm accent glow across the frame that peaks as the scenes swap.

## Use when / Do not use when
**Narrative position:** opening, climax, wind-down. **Mood:** warm, retro.

**Use when**
- an opening or a wind-down that should feel warm and filmic
- a climax that wants light rather than motion
- a calm piece that needs a signature moment

**Do not use when**
- a cold or clinical piece
- a style where the accent is a hard signal colour: the glow would shout
- a piece with several cuts in a row, where leaks lose meaning

## Params
| name | type | default | meaning |
|---|---|---|---|
| (none) |  |  | This pattern takes no params. |

Duration role: `slow`. Catalogue bands, in seconds: calm 0.6-0.8, medium 0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-color-accent` (the glow)
- duration roles (via the module's `dur`)
- set by this pattern on a section's inline style, not read from the style: `--mm-tx-leak-o`, `--mm-tx-leak-x`

## Legibility and rest notes
The glow is a pseudo-element drawn only while pattern.js has written `--mm-tx-leak-o` on a section's inline style; the kit restores that style on every seek, so no glow remains at a rest. At p = 0 the glow has no strength and the outgoing scene is whole; at p = 1 nothing is written. The glow never shortens or stretches time: p runs through the transition untouched and the swap underneath is an ordinary dissolve, so the overlay costs the film no seconds.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the glow is two soft ellipses in the accent colour; there is no grain, flare or colour shift
- on a light canvas an accent with low contrast to it shows only faintly
- no params: strength and path are fixed
