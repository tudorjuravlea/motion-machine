# screen/play

## Purpose
Plays a prepared screen recording on a device screen, from a point in the clip and at a speed.

## Use when / Do not use when
**Use when**
- an app recording (mm media prep) should play for a set stretch, or start part-way in
- the same clip plays twice in a film at different points

**Do not use when**
- the recording simply plays from the beat's arrival: a sequence asset does that with no action
- the screen shows a website: capture it and scroll it instead

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | number | 0 | seconds into the clip at p = 0 |
| `rate` | number | 1 | playback speed; 0.5 is half speed |

Given in the beat's `screen` list: `{ "do": "screen/play", "at": <s>, "d"?: <s>, "params": { … } }`.

## Style variables consumed
- `motion.durations.hold` (the default length)

## Legibility and rest notes
- The frame is a pure function of t: frame = floor((from + p × d × rate) × fps) + 1, held at the first and last frames.
- Frames are decoded inside settle(), so a rendered frame never shows the previous picture.
- A deck rest shows the frame at the end of its press.

## Provenance
original

## Known limits
- Only frame sequences play; on a still or a page the action does nothing.
- No audio: a recording's sound is not carried (the piece's sound pass owns audio).
