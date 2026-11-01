# sound/sub-drop

## Purpose
Marks a heavy beat landing: a title, a cut to a new scene, a number that matters. A sine that blooms and falls 64 to 44 Hz, with harmonics so small speakers hear it.

## Use when / Do not use when
Use when:
- a title card or a number that matters
- a cut that changes the subject
- under a `sting` for weight

Do not use when:
- a light UI event
- more than once or twice a piece
- a quiet style under a calm brief

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 1.5.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 2775624581 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "sub-drop", "params": { "cue": { "durS": 1.1 } } }`.

Brand knobs: durS, emphasis, gain. A brand sets them for every use with `style.patterns["sound/sub-drop"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a heavy beat lands: a title, a cut to a new scene, a number that matters. A cue with no visible event does not exist (W-CUE). Material: a sine gliding from 64 to 44 Hz over 0.75 s, harmonics 2 to 6 as their own sines above it (so a profile with `modes: none` keeps them), a bright click on the cut from normal and a ping from strong. Contour: it blooms to its peak 0.38 s after the cut, holds 50 ms and falls about 42 dB a second; the pitch falls the whole time. Length: 1.5 s, a swell; 1.38 s above -40 dB. Emphasis arrangements: subtle: the sine; normal: adds the harmonics and the click; strong: adds the ping. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -29.8 LUFS and under soft-ui -28.6 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under glass at every emphasis. Under soft-ui the level check misses at normal and strong (2 dB over the band): the profile's 70 Hz floor lifts the sub an octave, to 128 Hz, and K-weighting hears that louder. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its sub drop: a sine gliding down into the sub region (64 to 44 Hz over 0.75 s), a bloom to the peak, a decay of about 40 dB a second, harmonics 2 to 6 so small speakers hear the pitch, and a bright transient on the cut. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- Real speakers under 60 Hz do not play the sub; the harmonics carry the pitch there.
- Its role is placed on its onset, while the weight arrives 0.38 s later.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
