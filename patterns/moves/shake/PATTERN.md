# moves/shake

## Purpose
The camera jolts on an impact (a landing, a slam, a stamp) and calms to a still frame.

## Use when / Do not use when
**Use when**
- a heavy arrival should be felt: pair it with `entrances/slam` or `emphasis/stamp` and a `sound/hit` cue
- one or two impacts in a scene, each followed by stillness (H-STILL)

**Do not use when**
- the scene needs another camera move: a scene has one move, so a shake replaces a push or a pan
- a calm or premium piece where nothing should land hard
- a deck: a deck never shakes (the move writes nothing there)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `hits` | string | `0.5` | the impacts, in seconds from the scene's start, comma separated (`"0.8"` or `"0.8, 2.4"`); a value that is not a number at or after 0 is skipped, and with none left the default is used |
| `amp` | number | 14 | the largest offset on each axis at the impact, in px before the style's travel multiplier; clamped to 0 to 40 |
| `decay` | number | 0.45 | seconds each hit rings before it is still; clamped to 0.1 to 1.5 |
| `seed` | number | 0 | picks the path; the same seed gives the same shake in every load |

## Style variables consumed
Reads `ctx.style.motion.travel` (the value of `--mm-travel`), which scales the amplitude. No colour, family, size, space, radius, duration or easing: the timing is the param's seconds, because an impact's ring is physical, not a role.

## Legibility and rest notes
- Each hit rings under the envelope (1 − elapsed / `decay`)²: full at the impact, zero at the end of the ring, with no tail.
- The path on each axis is two sines at unrelated frequencies (41 and 67 rad/s across, 53 and 79 rad/s down) with seeded phases, weighted 0.62 and 0.38, so no axis passes `amp` × travel and the frame never judders along one diagonal.
- The ring is shortened so it ends by the scene's rest (`ctx.settle`), and a hit at or after the rest is dropped: from the rest on the camera is exactly still (0 px), so G-EDGE, G-OVERLAP and every frame-sampling rule read a settled frame.
- Pure in the scene's seconds: the same instant gives the same offset in every load and in any seek order (G-TIME, G-DETERMINISM).
- Writes only `translate` on `.mm-camera`, and nothing while it is still; a deck gets nothing at all.
- Text may cross the safe margin by up to `amp` px during a ring; it is back in place before the rest.

## Provenance
- JohnHeibel/PDoomVideo, no licence file: ideas only; no code taken. An impact shake that dies to stillness, with the rule that the rest must be still.
- feitangyuan/doodle-anim, MIT: ideas only; no code taken. A shake channel on the shot camera, and the critique that one sine on both axes judders diagonally; restated as two unrelated sines per axis under a quadratic envelope, in our own code.

## Known limits
- One move per scene: a shake cannot run together with a push-in or a pan.
- The hits are written in seconds, not tied to a beat: if the impact beat moves, move the hit with it.
- A hit placed right at the scene's rest is dropped, since the rest must be still; to let it ring after the last landing, give the scene a later beat (or an emphasis) so the rest comes after the ring.
