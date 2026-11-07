# emphasis/act

## Purpose
Acts a change of mood on the brand's mascot: the eyes squeeze shut into the key, the face swaps while they are shut, a take pops the character up, and its pose settles into the new mood's idle, which it then keeps.

## Use when / Do not use when
**Use when**
- the mascot reacts to what the scene says: surprise at a number, pride at a result, worry at a problem
- a beat in the track deserves a reaction: the act starts as the character lands, so time the beat's `at` to put the key on the hit

**Do not use when**
- the slot's entrance is not `entrances/character`: the act draws nothing there
- several mood changes in one scene: one act per beat; give each change its own scene
- the change must read from far away: an act lasts one second, so a calm to sleepy change is subtle by design

## Params
| name | type | default | meaning |
|---|---|---|---|
| `mood` | enum(calm|happy|excited|sad|surprised|worried|sleepy|proud) | `calm` | the mood it starts from: the entrance's mood |
| `to` | enum(none|calm|happy|excited|sad|surprised|worried|sleepy|proud) | `none` | the mood it changes to; give it among the beat's own params so the entrance keeps it after the act |
| `amount` | number | 1 | scales the take, 0 (a plain swap under shut eyes) to 1.5; each mood sets its own take (a surprise is bigger than a yawn) |
| `view` | enum(front|threeQuarter|side|back) | `front` | as the entrance |
| `facing` | enum(right|left) | `right` | as the entrance |
| `look` | enum(center|left|right|up|down) | `center` | as the entrance |
| `idle` | number | 1 | as the entrance |
| `bpm` | number | 0 | as the entrance |
| `offset` | number | 0 | as the entrance |
| `who` | string | (empty) | as the entrance: a character of the brand's cast by name |

Duration: 1 s, fixed (weight is measured in seconds, whatever the style's durations). The window opens as the entrance lands; the key sits 0.16 s into it. The eyes are fully shut from 0.05 s before the key to 0.05 s after it, closing over the 0.1 s before that and opening over the 0.14 s after. A pre-squash leads into the key; after it the take rises for 0.22 s (its top 0.11 s after the key) and its stretch rings down within 0.6 s; the pose and the idle blend into the new mood's with a back-out that overshoots by about 10 % and has landed 0.4 s after the key.

## Style variables consumed
- the same as `entrances/character`: `--mm-color-*` through the brand's `mascot.parts`, `style.mascot`, `style.sound.bpm`
- no duration role: the window is 1 s

## Legibility and rest notes
- One face is drawn on every frame: the swap happens at the key, while the eyes are a shut line, so no frame shows two faces or a blend of two.
- The act has settled before its window ends (the take's squash and hop are under 0.005, the blend at 1), so the scene's rest, which the kit places after every emphasis, opens on a finished character in the new mood; `entrances/character` keeps that mood for the rest of the scene.
- A closed form of the time since the window opened and of the piece's time (the idle): the same instant draws the same frame in either seek order.
- No text is touched; W-OVERSHOOT has no type to measure here.
- Extra parts (ears, a tail, an antenna) follow through on the take: they turn about their anchors as the body pops up and stretches, read from the same closed forms a moment earlier, and hang still once it settles.
- The take stays inside the stage: the rig keeps every pose under the headroom its viewBox reserves (a take that would reach higher gives up lift, then stretch), and the drawing clips to the slot.

## Provenance
- JohnHeibel/ClaudeAnimationBase, MIT: the idea of an acted mood change (anticipate, swap the face under a squint, take, settle) and of sizing the take per mood, restated in our own code in `runtime/kit/rig.js`. Some numbers are the source's own, adapted under its MIT licence: the eyes' closing and opening times (0.1 s and 0.14 s), the pose blend (0.4 s) and the take sizes of surprised, sleepy and sad (1.3, 0.2 and 0.3); the other timings are ours. No code taken.

## Known limits
- One act per beat; the act's key is fixed at 0.16 s after the entrance lands, so a beat's `at` places it.
- The new mood stays only when `to` is among the beat's shared params (an emphasis-only bag is not seen by the entrance, which draws the character after the act).
- Painted reaction marks (a "!" or a sweat drop beside the head) are not drawn.
