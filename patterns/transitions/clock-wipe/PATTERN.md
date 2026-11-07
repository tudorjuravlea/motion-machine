# transitions/clock-wipe

## Purpose
Reveals the incoming scene with a hand sweeping round the centre from twelve o'clock.

## Use when / Do not use when
**Narrative position:** topic change. **Mood:** retro.

**Use when**
- a topic change in a retro, playful or time-themed piece
- a countdown or a sequence of hours, stages or steps
- a calm piece that can afford a longer sweep

**Do not use when**
- a serious or premium register, where the sweep reads as a gimmick
- high energy: a fast sweep shows the edge flickering

## Params
| name | type | default | meaning |
|---|---|---|---|
| `direction` | enum(clockwise|counter) | `clockwise` | which way the hand sweeps |

Duration role: `standard`. Catalogue bands, in seconds: calm 0.8-1.0, medium 0.5, high 0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-color-ink` (an opaque stop only: the mask reads alpha, never colour)
- duration roles (via the module's `dur`)

## Legibility and rest notes
A conic-gradient mask on the incoming section, written only while 0 < p < 1 and removed at p = 1. At p = 0 the mask is wholly transparent, so the incoming scene is hidden and the outgoing one whole. The edge has a one-degree feather to stop it shimmering.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.
- Remotion core and `remotion-dev/skills`, company licence and unlicensed skills: the name and the idea of the effect (tagged [Remotion] in `references/transitions.md`); no code taken.

## Known limits
- always sweeps from twelve o'clock about the frame centre
- the mask needs Chromium 120 or later (unprefixed mask-image)
- no visible hand: only the edge of the reveal moves
