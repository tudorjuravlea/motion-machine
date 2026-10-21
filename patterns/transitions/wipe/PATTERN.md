# transitions/wipe

## Purpose
Sweeps a plate across the frame and cuts the outgoing scene away behind it.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** focus, retro.

**Use when**
- a topic change: the wipe is the paragraph break
- a style whose accent should show up in the cut itself
- a retro or presentational feel

**Do not use when**
- related scenes: the plate announces a new topic
- a piece in which the accent is reserved for a single call to action

## Params
| name | type | default | meaning |
|---|---|---|---|
| `plate` | enum(accent|surface) | `accent` | colour role of the plate that rides the edge |
| `direction` | enum(right|left|down|up) | `right` | where the wipe travels; right starts at the left edge |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.5-0.6, medium 0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-color-accent`, `--mm-color-surface` (the plate, chosen by `plate`)
- `--mm-radius-2` (the plate's leading corners)
- `--mm-space-5` (the plate's thickness)
- duration roles (via the module's `dur`)
- set by this pattern on a section's inline style, not read from the style: `--mm-tx-wipe-fill`, `--mm-tx-wipe-inset`, `--mm-tx-wipe-w`, `--mm-tx-wipe-h`, `--mm-tx-wipe-radius`

## Legibility and rest notes
The outgoing section is clipped (clip-path) and carries the plate as a pseudo-element that exists only while pattern.js has written `--mm-tx-wipe-*` on its inline style; the kit restores that style on every seek. At p = 0 the clip is the whole frame and the plate is parked outside it, so the outgoing scene is whole; at p = 1 nothing is written. The incoming scene is never altered: it is covered until the clip has passed it.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- the plate's thickness and radius come from fixed variable steps, not from the format
- on a style where surface is close to canvas the `surface` plate is barely visible
- the plate is a flat band; no gradient, no shadow
