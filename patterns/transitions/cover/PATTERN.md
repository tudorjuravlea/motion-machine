# transitions/cover

## Purpose
Slides the incoming scene in from one edge over the outgoing scene, which holds perfectly still beneath it.

## Use when / Do not use when
**Narrative position:** related, topic. **Mood:** a stack of posters, one laid over the last.

**Use when**
- a sequence of statements that pile up: each new card lands on the one before
- the outgoing scene should stay readable to the last moment, not travel away
- an editorial or product piece where `push` feels too busy because both scenes move

**Do not use when**
- the outgoing scene has its subject near the entering edge: the cover hides that edge first (keep it in the far two thirds)
- the outgoing scene has a camera move still running: the cover holds the section still, not the move inside it
- a topic change that wants a break of colour or a pause (use `color-dip` or `flood`)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `side` | enum(bottom|top|left|right) | `bottom` | the frame edge the incoming scene enters from |
| `dim` | number | 0.2 | how far the outgoing scene sinks under a scrim of the darkest palette role by the end of the cut, 0 to 0.6 |

Duration role: `standard`. A motion style sets the role's milliseconds; the pattern holds no number of its own. Params arrive as `ctx.params`: the defaults under the scene's `cutParams` (`"cutParams": { "side": "right" }`).

## Style variables consumed
- the darkest of the seven palette roles, read from the composed style (`--mm-color-ink` on a light brand, usually `--mm-color-canvas` on a dark one), for the scrim over the outgoing scene; set on the section as `--mm-tx-cover-shade`
- duration roles (via the module's `dur`)
- set by this pattern on the outgoing section's inline style, not read from the style: `--mm-tx-cover-dim`

## Legibility and rest notes
Only the incoming section moves: `transform` on it, one full frame of travel, from fully off-frame at p = 0 to rest at p = 1. The outgoing section's transform, opacity, visibility and clip are never written, so it is the same picture on every frame of the cut apart from the scrim. The incoming section keeps its opaque canvas and is never faded, so every pixel shows one scene and no type is drawn over another. The scrim is a pseudo-element that exists only while `--mm-tx-cover-dim` is on the section's inline style, which the kit restores on every seek. At p = 1 nothing the pattern wrote remains.

## Provenance
- feitangyuan/motion-web, CC BY-NC 4.0: the idea of a sticky stack in which the next screen rides up over a still one, with an optional dimming of the covered screen (ideas only; no code taken).

## Known limits
- when both scenes share one canvas colour the edge of the incoming scene reads only against the scrim; `dim: 0` leaves the edge invisible on a plain ground
- on a dark brand the darkest role is usually the canvas, so the scrim sinks the type and the lighter shapes into the ground while the ground itself stays as it is
- no dwell inside the cut: a held outgoing scene is the end of the previous scene, set by its duration
