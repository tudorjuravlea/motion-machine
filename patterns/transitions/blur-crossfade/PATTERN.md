# transitions/blur-crossfade

## Purpose
Dissolves between scenes while the outgoing one defocuses and the incoming one pulls into focus.

## Use when / Do not use when
**Narrative position:** opening, wind-down. **Mood:** premium, dreamy.

**Use when**
- an opening or a close that should feel unhurried and expensive
- a calm piece where a plain crossfade would look flat
- between two images or product shots

**Do not use when**
- text-heavy scenes: blurred type is unreadable for a moment
- a high-energy style: the blur needs time to read as intent, not as lag

## Params
| name | type | default | meaning |
|---|---|---|---|
| `amount` | number | 1 | blur strength as a multiple of one space step (`--mm-space-3`) |

Duration role: `slow`. Catalogue bands, in seconds: calm 0.8-1.2, medium 0.4-0.6, high 0.2-0.3. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

Params arrive as `ctx.params`. The kit passes a transition its defaults only (it does not read params from the story), so a story gets a different variant by a style or a fork, not yet by a beat.

## Style variables consumed
- `--mm-space-3` (the blur radius, times `amount`)
- duration roles (via the module's `dur`)

## Legibility and rest notes
Opacity and filter are written on the sections only while 0 < p < 1; at p = 1 both are removed, so the incoming scene is sharp and opaque with no filter left on its section (a leftover filter would blur type and make a stacking context). At p = 0 the outgoing scene is unblurred and whole.

## Provenance
- heygen-com/hyperframes, Apache-2.0: the transition id and its energy and narrative-position bands (idea only, see PROVENANCE.md); no code or markup taken.

## Known limits
- blur on a full-frame section is the most expensive thing in the set to paint; render at 60 fps with care
- the blur is not scaled by format, so a 9x16 frame shows it relatively smaller than a 16x9 one
